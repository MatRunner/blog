# pytorch实现transformer

> 纸上得来终觉浅，绝知此事要躬行。

学了那么多基础概念，最终的目的还是要把知识转化为生产力，这里不依赖AI，使用pytorch来实现transformer中的核心模块，包括：
- 多头注意力机制
- 前馈神经网络
- 位置编码
- 残差连接
- 层归一化
- 掩码机制
- 交叉注意力

## 掩码机制

只有decoder需要因果掩码，而encoder需要的是padding掩码。

```python
import torch
import torch.nn as nn
# 下面都是被mask掉的部分为1
def get_len_mask(batch_size:int, max_len:int, feat_len:torch.Tensor, device:torch.device):
  """
  首先要确定参数，padding mask无论是decoder还算encoder都需要的
  多个batch时，每个batch padding是不同的, 所以需要batch的数量和每个batch中的最大长度
  返回的mask的shape为(seq_len,seq_len)，广播机制会自动适配attn score的形状
  device参数和这个函数的功能无关
  mask矩阵被mask掉的部分是0是1还需要看后面怎么使用
  """
  mask=torch.ones((batch_size,max_len,max_len),device=device)
  for i in range(batch_size):
    mask[i,:,:feat_len[i]]=0
  return mask.to(torch.bool)

def get_causal_mask(batch_size, max_len, device:torch.device):
  """
  因果掩码直接上三角即可
  需要的参数是被mask的矩阵的shape(batch size, max_len, max_len)
  """
  return torch.triu(torch.ones((batch_size,max_len,max_len),device=device), diagonal=1).to(torch.bool)

def get_cross_mask(batch_size,q_max_len:int,k_max_len,feat_len:torch.Tensor,device:torch.device):
  """
  交叉注意力，KV来自encoder，Q来自decoder。mask的是attn_score矩阵，即matmul(Q,Kt)
  入参和padding mask不同的地方在于decoder和encoder的隐藏层维度不同
  """
  mask=torch.ones((batch_size,q_max_len,k_max_len),device=device)
  for i in range(batch_size):
    mask[i,:,:feat_len[i]]=0
  return mask.to(torch.bool)
```
在应用mask时，使用的是masked_fill或者masked_fill_，这两个函数的区别是前者会返回一个新的tensor，而后者会在原地操作。如下：
```python
# 假设attn_score的shape为(batch_size,seq_len,seq_len) 为True的就被mask掉了，后续使用softmax就被处理为0了
attn_score.masked_fill_(mask,float('-inf'))
```

## 位置编码

这其实就是一个照着公式写代码的过程，正弦位置编码的公式如下：

$$
PE_{(pos,\ 2i)} = \sin\left(\frac{pos}{10000^{2i/d_{model}}}\right), \qquad
PE_{(pos,\ 2i+1)} = \cos\left(\frac{pos}{10000^{2i/d_{model}}}\right)
$$

其中：
- $pos$ 是 token 在序列中的位置索引
- $i$ 是维度索引，偶数维用 sin，奇数维用 cos
- $d_{model}$ 是 embedding 的维度

每个维度的频率不同：低维度（$i$ 小）频率高，对位置的区分精细；高维度频率低，变化缓慢，用来编码远距离信息。相当于用不同波长的正弦波组合出每个位置的"指纹"。

难度在于要习惯pytorch这种机制下的写法。。。一下子还真不好写出来

```python
def pos_sinusoid_embedding(seq_len, d_model):
  """
  该公式的必要参数只有seq len, 对应pos，和d_model,对应i
  """
  embeddings=torch.zeros((seq_len,d_model)) # shape和input一致
  for i in range(d_model):
    f=torch.sin if i%2==0 else torch.cos
    embeddings[:,i]=f(torch.arange(0,seq_len)/np.power(1e4,2*(i//2)/d_model))
  return embeddings.float()
```

## attention

这是transformer架构中的核心模块了，最简单的单头注意力如下：

```python
import torch
import torch.nn as nn
import math
class SelfAttention(nn.Module):
  def __init__(self, d_model):
    super().__init__()
    self.d_model=d_model
    self.WQ=nn.Linear(d_model,d_model)
    self.WK=nn.Linear(d_model,d_model)
    self.WV=nn.Linear(d_model,d_model)
    self.Wout=nn.Linear(d_model,d_model)
  def forward(self, X, mask):
    Q=self.WQ(X)
    K=self.WK(X)
    V=self.WV(X)
    scores=torch.matmul(Q,K.transpose(-1,-2)) / math.sqrt(self.d_model)
    if mask is not None:
      scores=scores.masked_fill(mask, float('-inf'))
    scores=torch.softmax(scores,dim=-1)
    attn_w=torch.matmul(scores,V)
    out=self.Wout(attn_w)
    return out
```

