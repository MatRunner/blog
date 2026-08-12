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

## pageattention

os中是对内存有一套完善的管理策略的，但是GPU上并没有有一个GPU OS来管理，其内存的分配方式是传统的开发者手动分配。手动分配的问题就复现了早期os内存管理的问题：内存碎片化。

具体的，模型有固定的最大上下文，prompt+response大部分情况是填充不满上下文窗口的，但是传统的显存分配方式必然还是要按照max window来申请，就导致了大部分的显存是空置的。

浪费的显存会导致很多问题：可并发的请求数减小。

pageattention借鉴的是os的虚拟内存管理的方式，开发者申请内存是连续的虚拟内存地址，但是页表映射后，内存页是分散在物理内存中的，可以有效避免内存碎片化的问题。

具体的

1. pageattention把显存划分成block（也就是page），每个block容纳16个token的k和v
2. 按需分配。模型每处理16个token，才会申请新的block。不需要提前申请一大块显存

## flashattention

pageattention解决的是显存碎片化的问题，flashattention是一种transformer的一种计算范式（就像排序中有耗时的冒泡排序，也有性能高的快排）

attention的计算过程：

1. 先计算QK(T)
2. 进行softmax
3. 再和V相乘

再补充一些硬件的基础知识

| <font style="color:rgb(15, 17, 21);">内存类型</font> | <font style="color:rgb(15, 17, 21);">物理位置在哪里？</font> | <font style="color:rgb(15, 17, 21);">通俗叫法</font> | <font style="color:rgb(15, 17, 21);">速度</font> | <font style="color:rgb(15, 17, 21);">容量</font> | <font style="color:rgb(15, 17, 21);">在我们讨论Attention中充当什么角色？</font> |
| --- | --- | --- | --- | --- | --- |
| **<font style="color:rgb(15, 17, 21);">SRAM</font>** | **<font style="color:rgb(15, 17, 21);">GPU芯片（Die）内部</font>** | <font style="color:rgb(15, 17, 21);">片上缓存（L1缓存 / 共享内存）</font> | <font style="color:rgb(15, 17, 21);">极快（~20TB/s）</font> | <font style="color:rgb(15, 17, 21);">极小（约</font><font style="color:rgb(15, 17, 21);"> </font>**<font style="color:rgb(15, 17, 21);">20MB</font>**<font style="color:rgb(15, 17, 21);">）</font> | **<font style="color:rgb(15, 17, 21);">“高速工作台”</font>**<font style="color:rgb(15, 17, 21);">——每次只处理一小块数据</font> |
| **<font style="color:rgb(15, 17, 21);">HBM</font>** | <font style="color:rgb(15, 17, 21);">GPU芯片</font>**<font style="color:rgb(15, 17, 21);">旁边</font>**<font style="color:rgb(15, 17, 21);">（封装在同一块基板上）</font> | <font style="color:rgb(15, 17, 21);">显存（VRAM）</font> | <font style="color:rgb(15, 17, 21);">较快（~2TB/s）</font> | <font style="color:rgb(15, 17, 21);">很大（如</font><font style="color:rgb(15, 17, 21);"> </font>**<font style="color:rgb(15, 17, 21);">80GB</font>**<font style="color:rgb(15, 17, 21);">）</font> | **<font style="color:rgb(15, 17, 21);">“大仓库”</font>**<font style="color:rgb(15, 17, 21);">——存储所有的模型权重和KV Cache</font> |
| **<font style="color:rgb(15, 17, 21);">Host内存</font>** | <font style="color:rgb(15, 17, 21);">主板上的内存插槽（CPU那边）</font> | <font style="color:rgb(15, 17, 21);">系统内存（DDR）</font> | <font style="color:rgb(15, 17, 21);">慢（~50GB/s）</font> | <font style="color:rgb(15, 17, 21);">很大（如256GB）</font> | **<font style="color:rgb(15, 17, 21);">“硬盘柜”</font>**<font style="color:rgb(15, 17, 21);">——数据在CPU和GPU之间传输用</font> |

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
