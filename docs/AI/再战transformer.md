# 再战transformer

## QKVWX的Shape和含义

| **矩阵** | **Shape (形状)** | **含义与作用** |
| --- | --- | --- |
| **X** | `(seq_len, d_model)` | **输入特征矩阵**。包含序列中所有 Token 的词嵌入（组合了位置编码）。行数代表词数，列数代表词向量维度。 |
| **W^Q, W^K, W^V** | `(d_model, d_k)` | **可学习的权重矩阵**。负责将原始输入空间 d_model 线性投影映射到线性的 Query/Key/Value 子空间。 |
| **Q (Query)** | `(seq_len, d_k)` | **查询矩阵**（$Q = X \cdot W^Q$）。代表"当前 Token 想要寻找什么信息"。 |
| **K (Key)** | `(seq_len, d_k)` | **键矩阵**（$K = X \cdot W^K$）。代表"当前 Token 包含哪些特征标签"，用于和 $Q$ 做匹配度计算。 |
| **V (Value)** | `(seq_len, d_k)` | **值矩阵**（$V = X \cdot W^V$）。代表"当前 Token 实际携带的内容信息"，最终会根据注意力权重加权融合。 |

**如果对transformer的流程还是不熟，有些细节的东西还是会搞错。**

1. prompt到embedding。最开始的输入的prompt是一组token，也就是token id的数组，shape为(seq_len,)，经过embedding后，这是一个查表的过程，并不是矩阵乘法。这个vocabulary表就是Wemb矩阵（这个权重矩阵也是训练出来的,但是可以复用）。Wemb矩阵的shape是(vocabulary size，dh). 逐个查表后得到shape为（sequence length，dh）的矩阵。
2. 叠加位置编码。上面的这个矩阵没有包含位置信息，因此还需要添加位置编码PE。直觉上应该是增加代表位置的维度，但是实际上就是直接在原本维度上增加，这一步没有改变shape。（数学解释比较抽象，但是实验验证确实直接逐元素相加和增加维度的效果一样。现代大模型还有更先进的RoPE，旋转位置编码）这里得到的就是输入到attention layer中的X矩阵了。shape也对上了。
3. 计算Q，K，V矩阵。Q=XWq，shape为（seq_len, dh)
4. 计算attention score矩阵。根据公式 QKt/根dk。(seq_len, dh)×(dh, seq_len)， 得到的S矩阵shape是(seq_len, seq_len)
5. 计算加权融合后的V矩阵。softmax(S)×V。softmax不改变shape，得到shape是(seq_len, dh)。可以发现，X进入到attention layer后，shape是不变的。
6. 得到logits。经过所有的attention layer后，shape仍然为(seq_len, dh)，经过模型头权重矩阵Whead，shape(dh, vocabulary size)，得到logits，shape（seq_len, vocabulary size)。
7. 预测下一个词。如果是推理场景，对logits的最后一行做softmax，得到概率最大的词，就是预测的下一个token。

输入的特征矩阵X，shape应该是(B, S, dh) batch size sequence length，hidden layer dimension

权重矩阵WQ，WK，WV的shape是(dh, dk)，如果是多头组合，shape是(dh,dh)

## 多头

简单理解就是把一种"注意力"的头拆分成多个头。注意力实际上可以理解为某种维度的概念，像语义，逻辑关系这种。

多头的计算量和一个头是一样的，多头的维度dk合并一起是隐藏层空间维度dh。

每个头都有自己的QKV权重矩阵。

多头天然适合工程上的优化，比如把头拆分到不同的GPU上做并行计算，

## Masked Self-Attention

masked掉的是什么？mask的是attention score矩阵。

S矩阵的每一行是Q中的每一个token的特征，每一列是K中的每个token 的特征（因为K被转置）

S矩阵的意义是Q和K中token和token的相关性

mask的意图就是避免获取未来信息，也就是Q中的向量不计算未来K的相关性，数学语言就是Q的token idx要大于K的token的idx，对于矩阵S(seq_len, seq_len)中的(i, j)，i>=j时才计算相关性，也就是i<j的部分都要被mask掉，就是右上三角。

为什么token需要计算和自身的注意力？理解一下，一个词的含义是由上下文决定的，它自身也是上下文的一部分，表示指代性的token比如"它他她"，自身含义低，就需要给其它token分配更多权重；如果是含义明确的"苹果，跑步"这种，自身的权重就高。总结来说就是一个token的含义不能只被其它token决定。

## 复杂度

如果熟悉了attention的公式，核心的计算过程是QK(t)，然后SV。shape上是(seq_len, Dh) × (Dh, seq_len), 然后(seq_len, seq_len) × (seq_len, Dh)。

第一步的QK(t)的复杂度是seq_len²×Dh。每个元素药进行Dh次的乘加运算。

第二部的SV的复杂度是seq_len×Dh×seq_len，一样的。

所以时间复杂度就是**seq_len²×Dh**。

可以得出一个结论，seq_len对计算量有相当大的影响。而隐藏层维度通常固定，省去后，复杂度就是seq_len²。

显存占用上（空间复杂度），需要存储QKV还有中间的注意力矩阵S。一般是S的维度最大，所以空间复杂度也是**seq_len²**。（flashattention技术就是优化S的频繁搬运）

## FFN

前馈网络。学习的时候一直注重的是attention的过程，但是attention是在序列内部进行信息交换，并不能实现输出token的功能。

既然输入经过attention后，序列中的每个元素已经包含了其它元素的信息，那么就可以采用某种方法把这些信息提取出来。

FFN在attention layer的后面。结构上由一层线性变换+非线性激活+一层线性变换组成：

```
FFN(x) = activation(xW1 + b1)W2 + b2 = hW2 + b2
```

先升维，再降维。形象的理解一下，升维是把被压缩到dh维度的信息，在更高维度展开，通常是4倍展开。

展开后，经过非线性激活过滤出感兴趣的维度信息。

最后再通过线性变换，压缩回dh维度。

### 参数量分析

对于attention sub layer，需要的参数量：

WQ，WK，WV，WO，shape都是(dh, dh)，也就是本层的模型参数量（不是推理时）是4*dh*dh

这个WO矩阵学的材料中都没咋提到过，实际上在多头结构中，计算attention(Q, K, V)后的attention矩阵是每个头的attention矩阵的concat，每个头还是在独立的空间中。经过WO矩阵的线性变换后，把多个头的attention矩阵融合为（dh，dh）的矩阵，简单的说作用就是"多头融合"。但是在单头结构中，WO从数学上就没啥用了，完全可以和WV融合在一起了。

对于FFN sub layer，需要的参数量：

W1，做升维的矩阵，shape(dh, 4dh)

W2, 降维的举着，shape(4dh, dh)

本层的参数量就是8*dh*dh，是attention层的两倍

如果将标准的FFN替换为SwiGLU FFN，多了Wgate，Wup和Wdown三个权重。

| **对比维度** | **标准 FFN** | **SwiGLU FFN** |
| --- | --- | --- |
| 权重矩阵数量 | 2 | 3 |
| 中间维度 | `4 × d_model` | `8/3 × d_model` |
| 总参数量 | `8 × d_model²` | `3 × d_model × 8/3 d_model = 8 × d_model²` |
| 以 d_model = 4096 计算 | 134M | 135M |
| GEMM 次数（前向） | 2 | 3 |
| 激活函数 | 全局施加 | 门控选择性施加 |

两种结构的总参数量几乎相同，但是SwiGLU实现了更好的效果，代价是前向需要3次GEMM。

### 激活函数Activation

ReLU

```
ReLU(x) = max(0, x)
```

当输入为负时输出恒为 0，对应的神经元"永久死亡"，丢失了信息。

GELU

```
GELU(x) = x · Φ(x)
```

其中 Φ(x) 是标准正态分布的累积分布函数（CDF）。

直觉上说，GELU 不是像 ReLU 那样粗暴地"开/关"，而是根据输入值的大小给一个平滑的"通过概率"——值越大越可能通过，值越小越可能被抑制，但不会完全归零。

SwiGLU

```
SwiGLU(x) = (Swish(xWgate) ⊙ (xWup)) Wdown
```

多了一个 Wgate 矩阵（因此 FFN 从两个矩阵变成三个：Wgate、Wup、Wdown），但实验表明效果更好。

从公式中看出，多了Wgate，Wup和Wdown三个权重矩阵。可以使用pytorch来实现SwiGLU：

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class SwiGLUFFN(nn.Module):
  def __init__(self,d_model,d_ff):
    super().__init__()
    self.d_model=d_model
    self.d_ff=d_ff
    self.Wgate=nn.Linear(d_model, d_ff, bias=False)
    self.Wup=nn.Linear(d_model, d_ff, bias=False)
    self.Wdown=nn.Linear(d_ff, d_model, bias=False)
  def forward(self,x):
    gate=F.silu(self.Wgate(x))# silu 即 Swish(x) = x * sigmoid(x)
    up=self.Wup(x)
    out=gate*up
    out=self.Wdown(out)
    return out
```

### 为什么是4x和8/3x

原始论文中是4倍拓展，4倍是一个经验选择。2倍太小（表达能力受限），8倍太大（边际效应）。

后续也有研究表明，固定总参数量的情况下，比值在4附近是近似最优的。

如果将标准FFN切换为SwiGLU，每个权重仍然使用4倍放大，总参数量有12*dh*dh，参数量膨胀了50%，如果要保证总参数量不变，中间维度调整为：

3*dh*dff=8*dh*dh，则dff就是8/3dh

工程实现中，dff通常会被取到特定数值的倍数，来适配gpu的tensor core。

## 位置编码

### 原始方案

就是简单的把位置信息加到了输入矩阵上。至于为什么可以直接加而不是拓展维度之前研究过。

位置信息为：

$$
\begin{aligned}
PE_{(pos,\, 2i)} &= \sin\left(\frac{pos}{10000^{\,2i/d_{model}}}\right) \\
PE_{(pos,\, 2i+1)} &= \cos\left(\frac{pos}{10000^{\,2i/d_{model}}}\right)
\end{aligned}
$$

简单理解是用频率把维度给编码了。i表示维度，pos是token的索引。使用高低频来区分位置远近。

优点是不需要训练额外的权重，只是多了一个算子。

缺点是直接加上去的位置信息在前向的过程中可能会被稀释掉，而且对于没有训练到的位置信息是无法识别的。

### RoPE

目前几乎所有主流模型使用的位置编码方案。

核心思想是不在直接把位置信息加到输入的矩阵上，而是在计算attention时，旋转Q和K来编码位置。

对 Q 或 K 中相邻的两个维度配对做旋转（m 为 token 位置，θ_i 是该维度对的频率）：

$$
\begin{pmatrix} \tilde{x}_m^{(2i)} \\ \tilde{x}_m^{(2i+1)} \end{pmatrix}
=
\begin{pmatrix} \cos m\theta_i & -\sin m\theta_i \\ \sin m\theta_i & \cos m\theta_i \end{pmatrix}
\begin{pmatrix} x_m^{(2i)} \\ x_m^{(2i+1)} \end{pmatrix},
\quad \theta_i = 10000^{\,-2i/d}
$$

如果对这个公式不求甚解的话，仍然是用频率来表示相邻维度的相对距离。

优势是自适应变长，没有额外的参数。

## 残差连接

残差连接（Residual Connection）的思想来自 ResNet，结构极其简单：

```
output = x + SubLayer(x)
```

其中 SubLayer 可以是 Attention 层或 FFN 层。

**直观理解：在原始信息基础上，只学习增量**

残差链接主要是在训练过程中，反向传播的基本原理是链式法则，梯度容易衰减为0

总结一下作用有三：

1. 深层网络的训练问题。训练依赖反向传播，基本原理是链式法则。如果没有残差，梯度容易在某个环节"消失"。
2. 残差为0，就是恒等的两个层，可以直接跳过。
3. 信息不丢失。有残差以后，原始信息会被保留被逐层传递。

## LayerNorm

归一化层对每个token的特征向量做归一化——减去均值、除以标准差，再通过可学习的缩放参数 γ 和偏移参数 β 恢复表达能力：

$$
\text{LN}(x) = \gamma \odot \frac{x - \mu}{\sqrt{\sigma^2 + \epsilon}} + \beta,
\quad \mu = \frac{1}{d}\sum_{i=1}^{d} x_i,
\quad \sigma^2 = \frac{1}{d}\sum_{i=1}^{d}(x_i - \mu)^2
$$

> token的特征向量，就是token id embedding后得到的shape为（seq_len, dh)的矩阵

直觉上说，LayerNorm 就像一个"信号调节器"——无论输入信号的绝对大小如何波动，都把它拉回到一个标准范围内，防止某些维度的值过大或过小影响后续计算。

### pre-norm和post-norm

就是归一化在残差连接前还是残差连接后

post-norm：

$$
\text{output} = \text{LayerNorm}(x + \text{SubLayer}(x))
$$

pre-norm：

$$
\text{output} = x + \text{SubLayer}(\text{LayerNorm}(x))
$$

关键区别是残差是否要经过归一化。如果被归一化了，在训练过程中，反向残差还需要"链式"LayerNorm的导数。pre-norm则直接回传梯度。

目前普遍使用的是pre-norm：

| **维度** | **Post-Norm** | **Pre-Norm** |
| --- | --- | --- |
| 训练稳定性 | 深层模型容易梯度爆炸，需要精心的学习率 warmup | 梯度流更稳定，对超参数不敏感 |
| 最终效果 | 理论上略好（如果能训稳的话） | 略低但差距不大 |
| 工程友好度 | 需要更多调参经验 | "开箱即用"，适合大规模训练 |

### RMSNorm

Root Mean Square Normalization

RMSNorm是一个简化版的layerNorm。layerNorm中的μ是均值，但是减去均值实际上是在做"平移"，对于归一化来说，只有"缩放不变性"才是真正发挥作用的。所以RMSNorm直接省去了计算均值和减去均值的步骤。

## FFN, LayerNorm，Residual

主要是概念的问题

- 什么时候需要residual？当模型的层数过多时，就会出现梯度消失的问题，这就需要连接残差
- 什么时候需要LayerNorm？进行特征叠加（残差）或大范围的数值变换，都需要layerNorm来稳定数据分布
    - 标准化成均值0，方差1是常用的做法。一方面消除了特征量纲，使所有特征处于同一数量级；
    - 直接的物理原因是梯度下降时的等高线接近正圆，未标准化时是一个狭长的椭圆，容易梯度爆炸，收敛极慢；
    - 某些激活函数工作在黄金梯度区；保持数值稳定，防止数值溢出或漂移
- 什么时候需要FFN？非线性特征提取和信息检索。attention后每个特征向量都包含了全局信息，需要使用FFN进行信息提取。FFN包括升维-非线性激活-dropout-降维、

## Decoder Block

### 参数量计算

以llama-2-7B为例：

- d_model = 4096
- num_heads = 32, head_dim = 128
- ffn_intermediate_dim = 11008
- num_layers = 32
- vocab_size = 32000

attention layer和FFN有多层，每一层的权重都不一样，对于一个decoder内部

| 模块 | 参数 |
| --- | --- |
| embedding | 词表（vocab_size, dmodel) |
| attention | WQ，WK，WV，WO (dmodel, dmodel) |
| FFN | Wup (dmodel, ffn_inter_dim), Wdown(ffn_inter_dim, dmodel) |
| FFN | Wgate(dmodel, ffn_inter_dim) |
| layerNorm | γ和β的数量等于dmodel，两次layerNorm还要乘2 |

不计算词表的话，单层 dmodel*dmodel*4+dmodel*ffn_dim*3+dmodel*4=202M参数

整体的话，需要计入词表131M, 总共32层，202*32+131=6.6B

从参数分布可以看出：

- **FFN 占了约 67%**（每层 135M / 201M）
- **Attention 占了约 33%**（每层 67M / 201M）
- **Embedding 占比很小**（131M / 6738M ≈ 2%）

## 张量并行切分FFN

### Megatron-LM

列切分+行切分策略

Wup和Wgate按列切分，Wdown按行切分，中间结果不需要通信，只需要最后输出做一次allreduce。（根据公式，Wgate和Wup是做的逐元素乘，Wup与Wdown做矩阵乘，所以是这么切分的）

$$
h W_{down} = \begin{bmatrix} h_0 & h_1 \end{bmatrix}
\begin{bmatrix} W_{down,0} \\ W_{down,1} \end{bmatrix}
= h_0 W_{down,0} + h_1 W_{down,1}
$$

如果有两张GPU，对于标准的FFN

```python
# Wup
GPU 0: W_up[:, :d_ff/2]    形状 (d_model, d_ff/2)
GPU 1: W_up[:, d_ff/2:]    形状 (d_model, d_ff/2)
GPU 0: h_0 = activation(x @ W_up_0)    形状 (N, d_ff/2)
GPU 1: h_1 = activation(x @ W_up_1)    形状 (N, d_ff/2)

# Wdown
GPU 0: W_down[:d_ff/2, :]    形状 (d_ff/2, d_model)
GPU 1: W_down[d_ff/2:, :]    形状 (d_ff/2, d_model)
GPU 0: out_0 = h_0 @ W_down_0    形状 (N, d_model)
GPU 1: out_1 = h_1 @ W_down_1    形状 (N, d_model)

# allreduce
output = AllReduce(out_0, out_1) = out_0 + out_1    形状 (N, d_model)
```

注意x在每张gpu上是全量的。张量并行只是把权重拆分了，输入x在每个gpu上都是全量的。

### 切分SwiGLU

```python
GPU 0: gate_0 = Swish(x @ W_gate_0)    # (N, d_ff/2)
        up_0  = x @ W_up_0              # (N, d_ff/2)
        mid_0 = gate_0 * up_0           # 逐元素相乘，(N, d_ff/2)
        out_0 = mid_0 @ W_down_0        # (N, d_model)

GPU 1: gate_1 = Swish(x @ W_gate_1)    # (N, d_ff/2)
        up_1  = x @ W_up_1              # (N, d_ff/2)
        mid_1 = gate_1 * up_1           # (N, d_ff/2)
        out_1 = mid_1 @ W_down_1        # (N, d_model)

output = AllReduce(out_0, out_1)        # (N, d_model)
```

这种张量并行下，FFN只需要进行一次allreduce，通信开销很小。

工程上，dff需要被TP的GPU数量整除，所以dff优先考虑2的幂次

## CUDA Kernel融合

本质上还是减少数据在HBM的搬运。

### Swish(gate)*up

未融合时，先读取gate和up(2次读)，计算出swish后写出再读回（2次)，和up相乘得到hidden态再写出(1次)

融合后，计算出的swish不用写出再读回，只有3次io操作了

### 合并Wgate和Wup的GEMM

按照矩阵乘法的规则，按列拼接Wgate和Wup，相当于合并同类型x了

```python
# 分开执行（2 次 GEMM launch）：
gate = x @ W_gate    # (N, d_model) x (d_model, d_ff) = (N, d_ff)
up   = x @ W_up      # (N, d_model) x (d_model, d_ff) = (N, d_ff)

# 合并执行（1 次 GEMM launch）：
W_fused = concat(W_gate, W_up, dim=1)  # (d_model, 2*d_ff)
fused_out = x @ W_fused                 # (N, 2*d_ff)
gate, up = split(fused_out, d_ff, dim=1)
```

### 收益

- **Decode 阶段**（每次只处理 1 个 token）：GEMM 退化为矩阵-向量乘法，计算量小，kernel launch 和 HBM 带宽是主要瓶颈，融合收益显著（可达 20-40% 的加速）
- **Prefill 阶段**（处理整段 prompt）：GEMM 的计算量占主导，逐元素操作的 HBM 开销占比较小，融合收益相对有限（通常 5-15%）

## KV Cache

kv cache基本避不开

推理过程中分为prefill和decode

prefill进行的是矩阵乘，compute bound

decode进行的是向量-矩阵乘，是mem bound

没有对kv做cache时

prefill阶段，先计算出prompt的QKV矩阵

decode阶段，如果没有做缓存，每次都要重新计算QKV

如果step=n，第k个token：

Q是不需要缓存的，推理只需要最后一个token，也就是Q的计算量恒定为(1, d) (d, d)=2d²，总量就是2nd²

K/V=(k, d) (d, d)，计算量为2kd²，两个矩阵就是4kd²的计算量

k从1到n，把QKV都加起来，总计算量是2n²d²，简化一下就是**n²d²**的计算量

如果有kv cache，对于第k个token：

计算K/V时，只需要把x(1, d)和WQ,WK,WV相乘得到q(1, d)，计算量是4d²

对于step=n，每次只需呀计算增加的1个token，所以总的计算量是4nd²

把QKV加起来就是6nd²的计算量，简化就是**nd²**的计算量

也就是有没有KV cache，差了一个n的数量级的计算量

## MoE

混合专家模型，Mixture of Experts，MoE，核心的改造对象就是FFN层。

基本思路就是，与其使用一个巨大的FFN，不如拆分为多个较小的专家，每个专家都是独立的FFN。对于每个输入的token，只激活其中少数几个专家进行计算，其余专家保持休眠。

### 路由机制

最常见的是topK路由

$$
g(x) = \text{softmax}(x W_r)
$$

$$
\text{TopK}(g(x)) \rightarrow \text{选出概率最大的 } K \text{ 个专家}
$$

Wr是路由器的权重矩阵，shape(d_model,n_experts)。路由器将每个token的表示向量映射到一个n_experts维的概率分布，概率最大的k个专家被选中。

最终输出是被选中专家输出的加权和（只对被选中的 top-k 个专家求和）：

$$
y = \sum_{i \in \text{TopK}} \frac{g_i(x)}{\sum_{j \in \text{TopK}} g_j(x)} \, E_i(x),
\quad g_i(x) = \text{softmax}(x W_r)_i
$$

权重 gi(x) 经过 re-normalize（重归一化为和为 1），确保输出的尺度与单个 FFN 一致。

### 负载均衡

路由器可能倾向于把大部分 token 都发送给少数几个"明星专家"，导致其他专家得不到训练、逐渐退化，进而加剧不均衡，形成恶性循环。

常用的缓解策略包括：

**✅ 辅助损失（Auxiliary Loss / Load Balancing Loss）**

在训练目标中加入一项额外的损失函数，惩罚负载不均匀的情况。常见形式是：

$$
\mathcal{L}_{\text{aux}} = \alpha \cdot N \cdot \sum_{i=1}^{N} f_i \, p_i
$$

其中 fi 是专家 i 实际接收的 token 比例，pi 是路由器分配给专家 i 的平均概率，α 是平衡系数。当所有专家的负载均匀时，该损失取最小值。

**✅ 容量因子（Capacity Factor）**

为每个专家设定一个最大接收 token 数。超出容量的 token 会被丢弃（送入残差路径）或重新路由到其他专家。这从硬性约束的角度防止单个专家过载。

**✅ Expert Choice 路由**

与传统的 token-choose-expert（由 token 选择专家）不同，Expert Choice 让每个专家主动选择要处理的 top-k 个 token。这天然保证每个专家处理相同数量的 token，从根本上解决负载不均衡的问题。

### 专家并行

由于每个专家是独立的 FFN，可以将不同的专家放置在不同的 GPU 上。

这带来了独特的通信模式：传统的张量并行使用 AllReduce（所有卡都参与），而 MoE 的专家并行使用 **All-to-All** 通信——每个 GPU 需要把分配给其他 GPU 上专家的 token 发送过去，同时接收分配给本地专家的 token。

## 参考

1. [AIInfraGuide](https://github.com/caomaolufei/AIInfraGuide)
