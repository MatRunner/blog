# 再战 Transformer

粗浅地理解 Transformer 架构其实对实际干活帮助有限，一些细节的问题需要深入理解。本篇划分了一些关键的知识点，重新进行了学习。

## Q/K/V/W/X 的 shape 和含义

| **矩阵** | **Shape（形状）** | **含义与作用** |
| --- | --- | --- |
| **X** | (seq_len, d_model) | **输入特征矩阵**。包含序列中所有 Token 的词嵌入（组合了位置编码）。行数代表词数，列数代表词向量维度。 |
| **W^Q, W^K, W^V** | (d_model, d_k) | **可学习的权重矩阵**。负责将原始输入空间 d_model 线性投影映射到线性的 Query/Key/Value 子空间。 |
| **Q (Query)** | (seq_len, d_k) | **查询矩阵**（$Q = X \cdot W^Q$）。代表"当前 Token 想要寻找什么信息"。 |
| **K (Key)** | (seq_len, d_k) | **键矩阵**（$K = X \cdot W^K$）。代表"当前 Token 包含哪些特征标签"，用于和 $Q$ 做匹配度计算。 |
| **V (Value)** | (seq_len, d_k) | **值矩阵**（$V = X \cdot W^V$）。代表"当前 Token 实际携带的内容信息"，最终会根据注意力权重加权融合。 |

**如果对 Transformer 的流程还是不熟，有些细节的东西还是会搞错。**

1. prompt 到 embedding。最开始的输入的 prompt 是一组 token，也就是 token id 的数组，shape 为 (seq_len,)，经过 embedding 后，这是一个查表的过程，并不是矩阵乘法。这个 vocabulary 表就是 Wemb 矩阵（这个权重矩阵也是训练出来的，但是可以复用）。Wemb 矩阵的 shape 是 (vocabulary size, dh)。逐个查表后得到 shape 为 (sequence length, dh) 的矩阵。
2. 叠加位置编码。上面的这个矩阵没有包含位置信息，因此还需要添加位置编码 PE。直觉上应该是增加代表位置的维度，但是实际上就是直接在原本维度上增加，这一步没有改变 shape。（数学解释比较抽象，但是实验验证确实直接逐元素相加和增加维度的效果一样。现代大模型还有更先进的 RoPE，旋转位置编码）这里得到的就是输入到 attention layer 中的 X 矩阵了。shape 也对上了。
3. 计算 Q，K，V 矩阵。Q = XWq，shape 为 (seq_len, dh)。
4. 计算 attention score 矩阵。根据公式 QK^T / √dk。(seq_len, dh) × (dh, seq_len)，得到的 S 矩阵 shape 是 (seq_len, seq_len)。
5. 计算加权融合后的 V 矩阵。softmax(S) × V。softmax 不改变 shape，得到 shape 是 (seq_len, dh)。可以发现，X 进入到 attention layer 后，shape 是不变的。
6. 得到 logits。经过所有的 attention layer 后，shape 仍然为 (seq_len, dh)，经过模型头权重矩阵 Whead，shape (dh, vocabulary size)，得到 logits，shape (seq_len, vocabulary size)。
7. 预测下一个词。如果是推理场景，对 logits 的最后一行做 softmax，得到概率最大的词，就是预测的下一个 token。

输入的特征矩阵 X，shape 应该是 (B, S, dh)，即 batch size、sequence length、hidden layer dimension。

权重矩阵 WQ，WK，WV 的 shape 是 (dh, dk)，如果是多头组合，shape 是 (dh, dh)。

## 复杂度

如果熟悉了 attention 的公式，核心的计算过程是 QK^T，然后 SV。shape 上是 (seq_len, Dh) × (Dh, seq_len)，然后 (seq_len, seq_len) × (seq_len, Dh)。

第一步的 QK^T 的复杂度是 seq_len² × Dh。每个元素要进行 Dh 次的乘加运算。

第二步的 SV 的复杂度是 seq_len × Dh × seq_len，一样的。

所以时间复杂度就是 **seq_len² × Dh**。

可以得出一个结论，seq_len 对计算量有相当大的影响。而隐藏层维度通常固定，省去后，复杂度就是 seq_len²。

显存占用上（空间复杂度），需要存储 QKV 还有中间的注意力矩阵 S。一般是 S 的维度最大，所以空间复杂度也是 **seq_len²**。（FlashAttention 技术就是优化 S 的频繁搬运）

## 多头

简单理解就是把一种"注意力"的头拆分成多个头。注意力实际上可以理解为某种维度的概念，像语义、逻辑关系这种。

多头的计算量和一个头是一样的，多头的维度 dk 合并一起是隐藏层空间维度 dh。

每个头都有自己的 QKV 权重矩阵。

多头天然适合工程上的优化，比如把头拆分到不同的 GPU 上做并行计算。

## FFN

前馈网络。学习的时候一直注重的是 attention 的过程，但是 attention 是在序列内部进行信息交换，并不能实现输出 token 的功能。

既然输入经过 attention 后，序列中的每个元素已经包含了其它元素的信息，那么就可以采用某种方法把这些信息提取出来。

FFN 在 attention layer 的后面。结构上由一层线性变换 + 非线性激活 + 一层线性变换组成：

FFN(x) = activation(xW1 + b1)W2 + b2 = hW2 + b2

先升维，再降维。形象地理解一下，升维是把被压缩到 dh 维度的信息，在更高维度展开，通常是 4 倍展开。

展开后，经过非线性激活过滤出感兴趣的维度信息。

最后再通过线性变换，压缩回 dh 维度。

### 参数量分析

对于 attention sub layer，需要的参数量：

WQ，WK，WV，WO，shape 都是 (dh, dh)，也就是本层的模型参数量（不是推理时）是 4 * dh * dh。

这个 WO 矩阵学的材料中都没咋提到过，实际上在多头结构中，计算 attention(Q, K, V) 后的 attention 矩阵是每个头的 attention 矩阵的 concat，每个头还是在独立的空间中。经过 WO 矩阵的线性变换后，把多个头的 attention 矩阵融合为 (dh, dh) 的矩阵，简单地说作用就是"多头融合"。但是在单头结构中，WO 从数学上就没啥用了，完全可以和 WV 融合在一起了。

对于 FFN sub layer，需要的参数量：

W1，做升维的矩阵，shape (dh, 4dh)。

W2，降维的矩阵，shape (4dh, dh)。

本层的参数量就是 8 * dh * dh，是 attention 层的两倍。

### 激活函数 activation

ReLU

ReLU(x) = max(0, x)

当输入为负时输出恒为 0，对应的神经元"永久死亡"，丢失了信息。

GELU

GELU(x) = x · Φ(x)

其中 Φ(x) 是标准正态分布的累积分布函数（CDF）。

直觉上说，GELU 不是像 ReLU 那样粗暴地"开/关"，而是根据输入值的大小给一个平滑的"通过概率"——值越大越可能通过，值越小越可能被抑制，但不会完全归零。

SwiGLU

FFN_SwiGLU(x) = (Swish(xW_gate) ⊙ (xW_up)) W_down

多了一个 W_gate 矩阵（因此 FFN 从两个矩阵变成三个：W_gate、W_up、W_down），但实验表明效果更好。

## 位置编码

### 原始方案

就是简单地把位置信息加到了输入矩阵上。至于为什么可以直接加而不是拓展维度之前研究过。

位置信息为：

$$
PE_{(pos,\ 2i)} = \sin\left(\frac{pos}{10000^{2i/d_{model}}}\right), \qquad
PE_{(pos,\ 2i+1)} = \cos\left(\frac{pos}{10000^{2i/d_{model}}}\right)
$$

简单理解是用频率把维度给编码了。i 表示维度，pos 是 token 的索引。使用高低频来区分位置远近。

优点是不需要训练额外的权重，只是多了一个算子。

缺点是直接加上去的位置信息在前向的过程中可能会被稀释掉，而且对于没有训练到的位置信息是无法识别的。

### RoPE

目前几乎所有主流模型使用的位置编码方案。

核心思想是不再直接把位置信息加到输入的矩阵上，而是在计算 attention 时，旋转 Q 和 K 来编码位置。对位置为 $m$ 的 token，把每一对相邻维度 $(q_{2i}, q_{2i+1})$ 看作二维平面上的点，乘以一个旋转角与位置 $m$ 相关的旋转矩阵：

$$
\begin{pmatrix} q'_{2i} \\ q'_{2i+1} \end{pmatrix} =
\begin{pmatrix} \cos m\theta_i & -\sin m\theta_i \\ \sin m\theta_i & \cos m\theta_i \end{pmatrix}
\begin{pmatrix} q_{2i} \\ q_{2i+1} \end{pmatrix},
\qquad \theta_i = 10000^{-2i/d}
$$

其中 $m$ 是 token 的位置，$i$ 是维度对的索引。K 向量做同样的旋转。

如果对这个公式不求甚解的话，仍然是用频率来表示相邻维度的相对距离。

优势是自适应变长，没有额外的参数。

## 残差连接

残差连接（Residual Connection）的思想来自 ResNet，结构极其简单：

output = x + SubLayer(x)

其中 SubLayer 可以是 Attention 层或 FFN 层。

**直观理解：在原始信息基础上，只学习增量。**

残差连接主要是在训练过程中，反向传播的基本原理是链式法则，梯度容易衰减为 0。

总结一下作用有三：

1. 深层网络的训练问题。训练依赖反向传播，基本原理是链式法则。如果没有残差，梯度容易在某个环节"消失"。
2. 残差为 0，就是恒等的两个层，可以直接跳过。
3. 信息不丢失。有残差以后，原始信息会被保留，被逐层传递。

## LayerNorm

归一化层对每个 token 的特征向量做归一化——减去均值、除以标准差，再通过可学习的缩放参数 γ 和偏移参数 β 恢复表达能力：

$$
\text{LayerNorm}(x) = \gamma \odot \frac{x - \mu}{\sqrt{\sigma^2 + \epsilon}} + \beta
$$

其中 $\mu$、$\sigma$ 是单个 token 的特征向量在 dh 维度上计算的均值和标准差，$\epsilon$ 是防止除零的小常数，$\odot$ 表示逐元素相乘。

> token 的特征向量，就是 token id embedding 后得到的 shape 为 (seq_len, dh) 的矩阵。

直觉上说，LayerNorm 就像一个"信号调节器"——无论输入信号的绝对大小如何波动，都把它拉回到一个标准范围内，防止某些维度的值过大或过小影响后续计算。

### Pre-Norm 和 Post-Norm

就是归一化在残差连接前还是残差连接后。

Post-Norm（先残差相加，再归一化）：

$$
x_{l+1} = \text{LayerNorm}(x_l + \text{SubLayer}(x_l))
$$

Pre-Norm（先归一化再进子层，残差主干不经过归一化）：

$$
x_{l+1} = x_l + \text{SubLayer}(\text{LayerNorm}(x_l))
$$

关键区别是残差是否要经过归一化。如果被归一化了，在训练过程中，反向残差还需要"链式"LayerNorm 的导数。Pre-Norm 则直接回传梯度。

目前普遍使用的是 Pre-Norm：

| **维度** | **Post-Norm** | **Pre-Norm** |
| --- | --- | --- |
| 训练稳定性 | 深层模型容易梯度爆炸，需要精心的学习率 warmup | 梯度流更稳定，对超参数不敏感 |
| 最终效果 | 理论上略好（如果能训稳的话） | 略低但差距不大 |
| 工程友好度 | 需要更多调参经验 | "开箱即用"，适合大规模训练 |

## Decoder block

### 参数量计算

以 Llama-2-7B 为例：

- d_model = 4096
- num_heads = 32, head_dim = 128
- ffn_intermediate_dim = 11008
- num_layers = 32
- vocab_size = 32000

attention layer 和 FFN 有多层，每一层的权重都不一样，对于一个 decoder 内部：

| 模块 | 参数 |
| --- | --- |
| embedding | 词表 (vocab_size, d_model) |
| attention | WQ，WK，WV，WO (d_model, d_model) |
| FFN | Wup (d_model, ffn_inter_dim), Wdown (ffn_inter_dim, d_model) |
| FFN | Wgate (d_model, ffn_inter_dim) |
| layerNorm | γ 和 β 的数量等于 d_model，两次 layerNorm 还要乘 2 |

不计算词表的话，单层 d_model * d_model * 4 + d_model * ffn_dim * 3 + d_model * 4 = 202M 参数。

整体的话，需要计入词表 131M，总共 32 层，202 * 32 + 131 = 6.6B。

从参数分布可以看出：

- **FFN 占了约 67%**（每层 135M / 201M）
- **Attention 占了约 33%**（每层 67M / 201M）
- **Embedding 占了约 2%**（131M / 6.6B）

为什么 token 需要计算和自身的注意力？理解一下，一个词的含义是由上下文决定的，它自身也是上下文的一部分，表示指代性的 token 比如"它他她"，自身含义低，就需要给其它 token 分配更多权重；如果是含义明确的"苹果，跑步"这种，自身的权重就高。总结来说就是一个 token 的含义不能只被其它 token 决定。
