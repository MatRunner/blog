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
在单头注意力的基础上，稍作修改就可以实现多头注意力，主要增加的是改变QKV的形状，以及最后拼接的操作。
```python
import torch
import torch.nn as nn
import math

class MultiHeadAttention(nn.Module):
  def __init__(self,d_model,num_heads):
    super().__init__()
    self.d_model=d_model
    self.num_heads=num_heads
    assert d_model%num_heads==0
    self.d_k=d_model//num_heads
    self.WQ=nn.Linear(d_model,d_model)
    self.WK=nn.Linear(d_model,d_model)
    self.WV=nn.Linear(d_model,d_model)
    self.Wout=nn.Linear(d_model,d_model)
  def forward(self,X,mask):
    batch_size,seq_len,_=X.shape
    Q=self.WQ(X)
    K=self.WK(X)
    V=self.WV(X)
    Q=Q.view(batch_size,seq_len,self.num_heads,self.d_k).transpose(1,2)
    K=K.view(batch_size,seq_len,self.num_heads,self.d_k).transpose(1,2)
    V=V.view(batch_size,seq_len,self.num_heads,self.d_k).transpose(1,2)
    scores=torch.matmul(Q,K.transpose(-1,-2)) / math.sqrt(self.d_k)
    if mask is not None:
      scores=scores.masked_fill(mask,float('-inf'))
    scores=torch.softmax(scores,dim=-1)
    attn_w=torch.matmul(scores,V)
    attn_w=attn_w.transpose(1,2).reshape(batch_size,seq_len,self.d_model)
    out=self.Wout(attn_w)
    return out
```
## FFN

起码对于初学者的我来说，FFN是一个很容易搞混的一个模块，主要就是类似的叫法太多了，比如：
- feed forward neural network, 前馈神经网络，就演化出好多叫法，FFN，FNN，FFNN
- 多层感知机，MLP
- 全连接层

仅对transformer这个架构来说，FFN指的是两个全连接层中间夹着一个ReLU激活函数，本质上是一个基础的两层MLP。

```python
import torch
import torch.nn as nn
class PoswiseFFN(nn.Module):
  def __init__(self,d_model,d_ff,p):
    # 入参，需要高维的维度，和dropout的比例
    super().__init__()
    self.d_model=d_model
    self.d_ff=d_ff
    self.p=p
    self.fc1=nn.Linear(d_model,d_ff)
    self.fc2=nn.Linear(d_ff,d_model)
    self.dropout=nn.Dropout(p=p)
    self.relu=nn.ReLU(inplace=True)
  def forward(self,X):
    # ffn就是两层的MLP，两个全连接夹一个激活曾
    out=self.fc1(X)
    out=self.relu(out)
    out=self.fc2(out)
    return self.dropout(out)
```

## 层归一化/残差

这两个使用pytorch现成的模块，要注意调用的时机：
- 什么时候需要残差连接？网络层数太深，导致梯度消失/爆炸，使用残差连接可以有效缓解这个问题。
- 什么时候需要层归一化？进行了大数值的变换后都需要进行归一化把数值分布拉回正常范围。

代码的实现也十分简单：
```python
import torch
import torch.nn as nn
class ResidualLayerNorm(nn.Module):
  def __init__(self,d_model,p):
    super().__init__()
    self.d_model=d_model
    self.p=p
    self.layernorm=nn.LayerNorm(d_model)
    self.dropout=nn.Dropout(p=p)
  def forward(self,X,sublayer_output):
    # 残差连接就是简单的加法
    return self.dropout(self.layernorm(X+sublayer_output))
```
其实可直接在大的模块中顺便实现了：
```python
out=self.norm1(residual+self.attn(X,mask))
out=self.norm2(residual+self.ffn(out))
```
## 组装起来

上面的代码在实现中是没有考虑到是decoder还是encoder的，并不能直接组装起来。比如attention模块中，QKV的来源是encoder和decoder的明显区别，在参数上同样要做区分。
组装encoder-decoder，包括cross-attention：
```python
import torch
import torch.nn as nn

class DecoderLayer(nn.Module):
    def __init__(self, d_model: int, num_heads: int, d_ff: int, p_posffn: float, p_attn: float):
        super().__init__()
        self.d_model = d_model
        
        # 1. 定义两个独立的注意力模块，分别拥有独立的 QKV 权重矩阵
        self.self_attn = MultiHeadAttention(d_model, num_heads, p=p_attn)
        self.cross_attn = MultiHeadAttention(d_model, num_heads, p=p_attn)
        
        self.poswise_ffn = PoswiseFFN(d_model, d_ff, p=p_posffn)
        
        # 2. LayerNorm 作用于完整的 d_model 维度
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.norm3 = nn.LayerNorm(d_model)

    def forward(self, dec_in, enc_out, dec_mask, dec_enc_mask):
        # 1. Masked Self-Attention
        residual = dec_in
        ctx = self.self_attn(dec_in, dec_in, dec_in, dec_mask)
        dec_out = self.norm1(residual + ctx)

        # 2. Cross-Attention（修正 residual 变量名，并使用独立的 cross_attn 模块）
        residual = dec_out
        ctx = self.cross_attn(dec_out, enc_out, enc_out, dec_enc_mask)
        dec_out = self.norm2(residual + ctx)

        # 3. Position-wise Feed Forward
        residual = dec_out
        out = self.poswise_ffn(dec_out)
        out = self.norm3(residual + out)
        
        return out

class Decoder(nn.Module):
  def __init__(self,dropout_emb, dropout_posffn, dropout_attn, num_layers, dec_dim, num_heads, dff, tgt_len, tgt_vocab_size):
    super().__init__()
    self.tgt_emb=nn.Embedding(tgt_vocab_size, dec_dim)
    self.dropout_emb=nn.Dropout(p=dropout_emb)
    self.pos_emb=nn.Embedding.from_pretrained(pos_sinusoid_embedding(tgt_len,dec_dim),freeze=True)
    self.layers=nn.ModuleList([DecoderLayer(dec_dim, num_heads, dff, dropout_posffn, dropout_attn)
             for _ in range(num_layers)])
  def forward(self,labels,enc_out,dec_mask,dec_enc_mask):
    tgt_emb=self.tgt_emb(labels)
    pos_emb=self.pos_emb(torch.arange(labels.size(1), device=labels.device))
    dec_out = self.dropout_emb(tgt_emb + pos_emb)
    for layer in self.layers:
        dec_out = layer(dec_out, enc_out, dec_mask, dec_enc_mask)
    return dec_out
```