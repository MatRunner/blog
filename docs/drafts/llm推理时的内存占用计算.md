# llm推理时需要用到多少内存？

## 模型本身参数

需要存储模型本身的参数，也就是权重文件。可以计算为`参数量\*参数精度`.

如`Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf`，这是参数量8B，4bit量化。所以大小为8B*0.5byte=4G。当然gguf里面不止有参数，还有其他信息，比如模型架构、配置等。但是误差不会太大。

## 激活值

推理过程中，并不是每一层都被激活。这里需要先了解几个概念：

1. batch size。单次传递给神经网络的样本数量。
2. sequence length。序列长度。
3. hidden size。隐藏层维度。
4. layers。transformer层数。

计算公式为batch size x sequence length x hidden dim x layers x 精度。

推理过程中，如果只有一个用户在对话，batch size就是1.

但是这么解释其实很抽象。可以理解为batch size是模型并行处理的任务数。sequence length是每个任务的工作量。每个sequence length的长度大概率是不同的，要把它们batch到一起，还需要进行trunk，padding这种操作，才能进行并行处理。

hidden size为什么叫隐藏层维度？原始的输入先tokenized，会变成一个低纬度向量，低纬度的向量包含的信息有限，有意义的可能只是映射到原始的文本。但经过embedding层后，维度会大幅增加，会嵌入位置编码，和一些无法解释的特征。这个高维向量是对外部不可见的（外界只看到输入和输出）,且最后会转变回低维向量，所以叫隐藏层。

隐藏层不止一层，每一层可以理解为一个复合函数的子函数，推理的过程中，参数已经确定了，所以经过每一层就是再求解一次子函数。

最后就是激活值了。推理过程中不是每一层都会被激活，比如deepseek这样的MoE架构，只有部分专家会被激活。Deepseek V3的671B模型，只会激活共享专家和任务专家，大约激活5%。但是对于`Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf`，每一层都会被激活，激活值就是1。但是推理的过程中，只有前向传播，因此需要的是最大的那层的存储空间。

仍然以meta-llama-3.1-8b-instruct-quantized-8bit.gguf为例，假设平均每个样本的sequence length为128，hidden size为8192，batch size为1, 精度为fp16（激活值精度不量化）。可以计算出需要的内存大小为：1\*128\*8192\*2byte=2MB。

## k-v cache

如果不了解transformer架构，是不理解这个kv cache的。很容易以软件的缓存来解读。transformer架构中，attention的计算是基于Q,K,V三个矩阵的。q和k点积后得到相关性，相关性经过softmax后和v相乘，得到最终的attention值。q是“当前”正在处理的token，计算当前的q需要和所有的k，v进行计算，计算第n+1个q同样也需要和所有的k，v进行计算。所以将k和v缓存起来是有必要的。这里，缓存起着一个经典的“以空间换时间”的优化作用。

在学习资料中，会提及引入KV cache后，复杂度从O(n^2)变成了O(n)。

第一次输入的所有token，都会计算出对应的Q,K,V矩阵。经过attention的计算后，得到预测的下一个token。然后这个token会作为下一个输入，继续进行计算。问题就出在这个继续计算上了，如果没有kv cache，每次都要重新计算Q,K,V矩阵，然后预测token，那就会有大量的重复计算。有了kv cache后，只需要计算出当前的q，k，v，这个k和v放入之前缓存好的K和V中就是新的K和V矩阵，用当前这个q来和新的K和V进行计算来得到下一个token。所以，kv cache正如字面上，只缓存计算好的k和v，并增量的更新矩阵K和V。

理解kv cache后，那么就可以计算出kv cache的内存占用，两个要存储的矩阵，所以要乘2，batch size是并发度，sequence length关系到K和V矩阵的维度增长，然后每一层都有各自的K和V矩阵，所以要乘以layers。然后每个头都有各自的K和V矩阵，所以还要乘头的数量（这个也有架构可以优化），当然如果是早期的transformer架构，头数量乘头维度等于hidden size，但是在MQA和GQA这种架构中，并不是标准的多头注意力。最后再乘精度即可，而且kv cache一般也不量化，也是fp16。

对于llama-3.1，就是GQA架构，query有32个头，kv只有8个头。

还是以`Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf`为例, 假设batch size为1, 平均每个样本的sequence length为128，kv有8个头，每个头维度是128，layers为24，精度为fp16。可以计算出需要的内存大小为：2\*1\*128\*8\*128\*24\*2byte=12MB。(注意这些参数是临时编的，不是真实参数！)

## 其他部分

输入数据本身，框架，也会产生占用，如果使用pytorch，tensorflow，占用会稍大，如果使用onnx，llama.cpp，占用会偏小。

## 参考

https://help.aliyun.com/zh/pai/getting-started/estimation-of-the-required-video-memory-for-the-model

