# kv cache 及相关优化技术

## kv cache

推理的流程中，prefill阶段，并行处理prompt，正常情况下，一个token是一个vector，prefill可以把prompt的token拼成一个Q矩阵。QK(T)再乘V（还有softmax这种）得到注意力矩阵。

但是prefill后如何生成首token呢？

答：prefill阶段结束后，得到prompt的隐藏层特征。根据最后一个token的隐藏层特征，经过模型头得到首token。

因为首token要产生需要对prompt全量计算，所以首token的计算量是比后续的token的计算量更大的，也就是prefill阶段是计算密集型。后续的token计算依赖于KV cache，需要从显存中频繁搬运数据，所以decode阶段是访存密集型。

得到首token后，后续的token进行的是一个“接字”游戏。首token在embeding后，和WQ，WK, WV相乘得到q，k，v。k和v会拼接到之前的k和v上成为一个包含有之前和当前token信息的更大的K和V矩阵。再使用q和K(T) 再乘V。这里就变成了向量和矩阵乘（prefill阶段是矩阵和矩阵乘），得到了是一个注意力向量，经过模型头后得到第二个token。后续的过程重复即可。

这里的问题是：K和V矩阵会在推理的过程中越变越大。

所以针对K V矩阵，有很多优化技术。但是理解这些技术的前提需要理解kv cache。

kv cache。cache的作用，存放计算的中间结果（避免重复计算）；存放常用数据，减少数据搬运损耗。推理中的kv cache的作用是避免重复计算。

在推理过程中，当前token的embedding和三个权重矩阵相乘后得到q，k，v。k和v需要拼接到上一步的K和V中，但是上一步K和V是由上一个token计算出的qkv拼接上上一个K和V构成的。理解这个过程，要缓存的东西就很清晰了，就是这个K和V矩阵（所以这个东西叫KV cache）。

为什么没有Q的cache？decode过程中的其实只关心当前token的q。prefill阶段计算出之前的Q后，之前的Q就用不到了。

可以实际计算一下有了kv cache之后能省多少计算量：

### 有没有kv cache的区别

设定 batch size 为 1，序列长度为 $s$，隐藏维度记为 $d$，且只统计 QKV 投影的计算量。一次 $(n,\ d) \times (d,\ d)$ 的矩阵乘法的浮点运算量为 $2nd^2$。

推理本质上是一个自回归的"接字"过程。记第 $i$ 步的前缀长度为 $i$。

**无 KV cache** 时，每生成一个 token 都要把当前全部前缀重新送入模型。第 $i$ 步中 K、V 需要对全部 $i$ 个 token 计算，而 Q 只有最后一个位置会被用到，因此该步的计算量为

$$
C_i^{\text{no-cache}} = \underbrace{2id^2}_{K} + \underbrace{2id^2}_{V} + \underbrace{2d^2}_{Q} = (4i + 2)\,d^2
$$

对 $i = 1, \dots, s$ 求和，整个序列的计算量为

$$
C^{\text{no-cache}} = \sum_{i=1}^{s} (4i + 2)\,d^2 = 2s(s+2)\,d^2
$$

**有 KV cache** 时，每步只需输入当前 1 个 token，历史 K、V 由缓存复用，故每步的计算量恒为

$$
C_i^{\text{cache}} = 3 \times 2d^2 = 6d^2
$$

整个序列的计算量为

$$
C^{\text{cache}} = \sum_{i=1}^{s} 6d^2 = 6sd^2
$$

两者之比为

$$
\frac{C^{\text{cache}}}{C^{\text{no-cache}}} = \frac{6sd^2}{2s(s+2)\,d^2} = \frac{3}{s+2} \xrightarrow{\ s \gg 1\ } \frac{3}{s}
$$

即计算量降为原来的 $3/(s+2)$，加速比约为 $(s+2)/3$。序列越长（$s$ 越大），KV cache 的优势越明显。

### kv cache的显存占比估计

确定一个模型、拿到一个硬件环境，来预估能跑多少并发是一个经典的场景问题。

模型的权重占多少显存很好估计：fp16 下，直接参数量 $\times 2$ 字节即可。

KV cache 的显存则和序列长度直接相关，一个 token 的 KV cache 大小由模型自身结构决定。设：

- 隐藏层维度 $d$（MHA 下 head 数不影响，各 head 拼起来仍是 $d$）
- decoder 层数 $L$
- 序列长度 $s$，batch size 为 $b$
- 每个元素占 $p$ 字节（fp16 时 $p = 2$）

K、V 各存一份，则 KV cache 的显存占用为

$$
M_{\text{kv}} = \underbrace{2}_{K,\,V} \cdot d \cdot L \cdot s \cdot b \cdot p
$$

若用于 KV cache 的可用显存为 $V$，则可容纳的总 token 数为

$$
s_{\text{total}} = \frac{V}{2 \cdot d \cdot L \cdot p}
$$

生产场景中序列长度存在一个均值 $s_{\text{avg}}$，据此可估算最大并发数：

$$
\text{concurrency} = \frac{s_{\text{total}}}{s_{\text{avg}}}
$$

## PagedAttention

os中是对内存有一套完善的管理策略的，但是GPU上并没有有一个GPU OS来管理，其内存的分配方式是传统的开发者手动分配。手动分配的问题就复现了早期os内存管理的问题：内存碎片化。
具体的，模型有固定的最大上下文，prompt+response大部分情况是填充不满上下文窗口的，但是传统的显存分配方式必然还是要按照max window来申请，就导致了大部分的显存是空置的。

浪费的显存会导致很多问题：可并发的请求数减小。

PagedAttention借鉴的是os的虚拟内存管理的方式，开发者申请内存是连续的虚拟内存地址，但是页表映射后，内存页是分散在物理内存中的，可以有效避免内存碎片化的问题。
具体的

1. pageattention把显存划分成block（也就是page），每个block容纳16个token（仅vllm）的k和v
2. block是逻辑上连续，但是实际的物理地址不连续，同样有页表（这里应该叫块表）来记录映射关系
3. 按需分配。模型每处理16个token，才会申请新的block。不需要提前申请一大块显存

### block table

举例来说，如果有输入100个token（prefill阶段），那么会被分配100/16=7个block，第7个block中只存了4个token，还空余12个token的空间。
block有自己的逻辑编号和物理编号，逻辑编号是连续的，但是物理编号大概率不连续。
进入decode阶段，每次只需要处理一个token，会在第7个block中继续填充，将这个block填满之后才会申请下一个block。
attention计算时，cuda kernel通过block table拿到`physical_block_number`和`physical_block_offset`就能读到历史的KV。

### 意外收获

使用分页机制来管理显存后，结合LLM的业务特征，反而出现了意外之喜。模型对话时，其实有着大量相同的context，既然是相同的，那么完全可以共享一份，也就是多个请求可以共享一个物理块（逻辑块还是独立的）

- 共享前缀。多个请求的sys prompt相同（实际上这个场景很常见），它们的前缀kv完全相同，就可以只存一份
- 共享的请求后续发生了fork怎么办？只读共享时，指向同一块，通过引用计数记录请求个数。如果一个请求发生了fork，在首次写入时这个block就复制出一份这个请求的private block（仍然是从经典的os中衍生）

### 抢占与恢复

显存的利用率最多只能逼近100%，如果实在不够用，又该如何处理？
这时候又可以在经典知识中寻求答案了。os中如果内存不够会怎么办？会释放部分内存到swap中（如果没有设置swap，就会oom了）。
vllm也会把部分block换到host memory中，资源充足时再换回。
但是对于LLM这种单一的场景，还有一种办法就是重新计算KV cache。
但是无论如何，一旦出现了”抢占”（日志中高频出现preemption相关告警），其实已经说明资源不足了，这时候应该做的是扩容。

## FlashAttention

pageattention解决的是显存碎片化的问题，flashattention是一种transformer的一种计算范式（就像排序中有耗时的冒泡排序，也有性能高的快排）

attention的计算过程：

1. 先计算QK(T)
2. 进行softmax
3. 再和V相乘

再补充一些硬件的基础知识

| <font style="color:rgb(15, 17, 21);">内存类型</font>     | <font style="color:rgb(15, 17, 21);">物理位置在哪里？</font>                                                                                                              | <font style="color:rgb(15, 17, 21);">通俗叫法</font>                      | <font style="color:rgb(15, 17, 21);">速度</font>            | <font style="color:rgb(15, 17, 21);">容量</font>                                                                                                                                                    | <font style="color:rgb(15, 17, 21);">在我们讨论Attention中充当什么角色？</font>                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **<font style="color:rgb(15, 17, 21);">SRAM</font>**     | **<font style="color:rgb(15, 17, 21);">GPU芯片（Die）内部</font>**                                                                                                        | <font style="color:rgb(15, 17, 21);">片上缓存（L1缓存 / 共享内存）</font> | <font style="color:rgb(15, 17, 21);">极快（~20TB/s）</font> | <font style="color:rgb(15, 17, 21);">极小（约</font><font style="color:rgb(15, 17, 21);"> </font>**<font style="color:rgb(15, 17, 21);">20MB</font>**<font style="color:rgb(15, 17, 21);">）</font> | **<font style="color:rgb(15, 17, 21);">“高速工作台”</font>**<font style="color:rgb(15, 17, 21);">——每次只处理一小块数据</font>     |
| **<font style="color:rgb(15, 17, 21);">HBM</font>**      | <font style="color:rgb(15, 17, 21);">GPU芯片</font>**<font style="color:rgb(15, 17, 21);">旁边</font>**<font style="color:rgb(15, 17, 21);">（封装在同一块基板上）</font> | <font style="color:rgb(15, 17, 21);">显存（VRAM）</font>                  | <font style="color:rgb(15, 17, 21);">较快（~2TB/s）</font>  | <font style="color:rgb(15, 17, 21);">很大（如</font><font style="color:rgb(15, 17, 21);"> </font>**<font style="color:rgb(15, 17, 21);">80GB</font>**<font style="color:rgb(15, 17, 21);">）</font> | **<font style="color:rgb(15, 17, 21);">“大仓库”</font>**<font style="color:rgb(15, 17, 21);">——存储所有的模型权重和KV Cache</font> |
| **<font style="color:rgb(15, 17, 21);">Host内存</font>** | <font style="color:rgb(15, 17, 21);">主板上的内存插槽（CPU那边）</font>                                                                                                   | <font style="color:rgb(15, 17, 21);">系统内存（DDR）</font>               | <font style="color:rgb(15, 17, 21);">慢（~50GB/s）</font>   | <font style="color:rgb(15, 17, 21);">很大（如256GB）</font>                                                                                                                                         | **<font style="color:rgb(15, 17, 21);">“硬盘柜”</font>**<font style="color:rgb(15, 17, 21);">——数据在CPU和GPU之间传输用</font>     |

<font style="color:rgb(15, 17, 21);">对于一个（4096，4096）的矩阵，fp32下需要64MB的显存空间了。SRAM只有20M的容量，矩阵是不能完整存在SRAM中的，而是在HBM和SRAM中持续的搬运数据来进行计算。那么传统的attention的计算过程下：</font>

1. HBM->SRAM，搬运Q的一行向量和K的一列向量，计算出一个中间结果，SRAM->HBM写回中间结果
2. 重复过程1，直到把Q和K(T)矩阵乘计算完毕
3. 进行softmax计算，同样也是按照向量进行计算，最终再进行汇总
4. 进行过程3的最终结果和V的矩阵乘，重复过程1，直到计算完毕

可以发现，Q, K, V矩阵都是完整的存在HBM中的（Q和K的中间结果也存在了HBM中）

这个过程中充斥大量的SRAM和HBM的数据搬运，它们之间的带宽差了一个数量级，如果搬运次数过多，计算过程就是HBM的带宽受限了。

所以能不能优化掉HBM存的这几个矩阵或者减少搬运次数？哪个矩阵是必须的？（只考虑prefill阶段）

Q：虽然这个矩阵只用到了一次，但是也要完整的存在HBM中。

K：同样只和Q计算一次。但是也要存在HBM中。

中间矩阵S=QK(T)：这个矩阵实际上是一个中间产物。但是由于softmax算法必须要完整矩阵，所以这个S也要存在HBM中。

V: 和S进行一次计算，需要存在HBM中。

那么看起来HBM中需要存4个矩阵，而且都优化不掉？

其实softmax可以进行算法优化，它要计算必须要一整行的值。flashattention使用的不是softmax而是online softmax。区别是它维护了两个全局变量（局部最大值和指数和，在KV块迭代时，不断对临时的O进行修正，最终得到的O和完整的softmax结果是一致的（数学可证明）。

总结来看，**flashattention的性能优化其实是削减了中间矩阵S和softmax(S)的存储，使计算过程都在SRAM中完成。**

## MHA MQA GQA MLA

MHA（multi head attention）就是标准的多头注意力，每个头都有自己的kv cache。整体的规模在2*seq_len*d_model，随着seq_len膨胀，kv cache会线性膨胀。

MQA（multi query attention），所有的Q可以共享一组K和V，如果有h个头的情况下，K和V的规模就缩减到了原来的1/h，而Q不变，KV cache的体积就减少到原来的1/h。代价是由于只保留了一组KV，语义表达上受限。这个问题其实可以稍微细究一下：
- 为什么保留了Q而共享一组KV？实验表明，多组KV中，信息是有大量的冗余的。也就是可以使用一组KV来代表所有KV，代价是语义的轻度损失。而Q本身有着查询维度的含义，再进行压缩就退化成了单头注意力了。

GQA（Grouped query attention）。GQA是MHA和MQA的折中方案。将h个头分为g个组，每组共享一组KV。这样，有g组KV，cache的体积缩减为原来的g/h，Q仍然不变。
从概念上就可以看出，GQA就是针对MQA语义受损的问题的改进方案。通过增加g的组数，在cache体积和模型性能的权衡。

MLA（multi latent attention）。DeepSeek-V2 提出了 MLA（Multi-Latent Attention），代表了另一种压缩 KV Cache 的思路。MLA的核心思想是，将kv cache压缩进低维潜在空间，只缓存这个低位空间的表示，真正进行推理时再把低位空间表示还原到高维。这个思路上像是一种用时间换空间或者用算力换带宽的做法。(事实上都没有额外的算力，高低维的转换矩阵直接吸收进了attention的计算公式中)
