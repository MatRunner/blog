# SPEC2026 706.stockfish

**已对数据进行脱敏处理，不影响技术推导。**

## 问题背景

当前AI行情火热，spec2026亦需要反应负载的演进趋势，所以组织成员是研究了如何集成AI相关的负载进入[spec](https://arxiv.org/abs/2605.01575)的。

> Modern AI Workloads. We evaluated portable CPU inference engines from the transformer/LLM era, including llama.cpp [81] and whisper.cpp [82]. These candidates advanced deep into the evaluation process due to the domain’s importance.

但是由于种种原因，最终也只是将stockfish（还有Marian）这样的非LLM的，但核心架构（nnue，transformer）是AI的负载进入了spec2026，而没有集成llama.cpp这样的cpu推理引擎。

而神经网络的计算，特别是在cpu上，是可以通过simd加速的，因此在测试stockfish基线性能外，还需要测试simd加速下的，公司产品和竞品的性能，作为芯片设计的参考输入件。

使能向量化的手段在编译参数中增加`-march=native`即可。

测试发现，公司和竞品的n代产品使能simd加速后的性能提升幅度接近，但是第n+1代产品中，竞品性能提高的幅度是公司的2倍，造成了基线性能不及竞品的情况下，向量化后差距进一步扩大的情况。

## 正式分析前的白盒工作

开始分析后，发现spec中的stockfish和开源版本的stockfish的性能表现不同，定位后发现是spec和stockfish的版本差异导致：spec使用的是stockfish的[15版本](https://www.spec.org/cpu2026/docs/benchmarks/706.stockfish_r/706.stockfish_r.html)。

具体的，18版本，[stockfish源码文件](https://github.com/official-stockfish/Stockfish/blob/master/src/nnue/layers/affine_transform.h)中，利用了输入的稀疏性，可以大幅减少计算量，不必对整个棋盘进行计算：

```cpp
// Traverse weights in transpose order to take advantage of input sparsity
    for (IndexType i = 0; i < InputDimensions; ++i)
        if (input[i])
        {
            const std::int8_t* w  = &weights[i];
            const int          in = input[i];
            for (IndexType j = 0; j < OutputDimensions; ++j)
                output[j] += w[j * PaddedInputDimensions] * in;
        }
```

而15版本中，则对整个棋盘进行了计算：

```cpp
 for (IndexType i = 0; i < OutputDimensions; ++i) {
      const IndexType offset = i * PaddedInputDimensions;
    std::int32_t sum = biases[i];
      for (IndexType j = 0; j < InputDimensions; ++j) {
        sum += weights[offset + j] * input[j];
      }
      output[i] = sum;
 }
```

这两种写法导致可向量化的难度不同，15版本是能被编译器自动向量化掉的。实际测试中，18版本采集到2%的sse指令，15版本则能采集到32%。

这里就出现了一个权衡：是减少计算量，还是利用向量化的加速？决定因素就在输入的数据的稀疏程度上了。在stockfish的默认测试集下，这两种写法的性能基本一致。

## 竞品分析

### 产品A和竞品B

基线：开源gcc-11.3.0），仅开启-O3；
优化：基线基础上使能架构特性：-march=native。
产品A和竞品B的性能表现如下（数据已做等比转换）：
| stockfish版本|产品A | 竞品B |
| --- | --- | ---|
|v15 base|100|107|
|v15 march|102|111|
|v18 base|104|102|
|v18 march|125|140|

v15的stockfish，产品A和竞品B的性能使能架构特性后，产品A提高2%，竞品B提高4%。
v18的stockfish，产品A和竞品B的性能使能架构特性后，产品A提高25%，竞品B提高40%。
看起来竞品B两个版本的性能提升都是产品A的2倍。

从-march=native的作用可知，编译器会使用更高级的指令集。查看汇编可知产品A使用了SVE，竞品B使用了AVX512。但是产品A的SVE只支持256位宽，那么这种提升幅度的一倍差距就可被解释了。

---

测试过程中，还有产品BCD，指令集的支持程度不同，如果是仅支持sse的，-march参数实际上是没有效果的。

### 性能差距解释

首先需要理清如何量化解释性能差距。SIMD指令的性能提升来源于指令数量的减少和数据处理吞吐的增加。因此，使用单一的IPC指标来解释性能差距是不合适的。需要结合指令占比，指令数。

#### v15和v18版本的性能差距解释

这里可以可以直接对比单线程下的性能变化。

以产品A为例，采集测试用例的IPC，指令分布：
|stockfish版本|instructions|cycles|IPC|sve ratio|
| ---| --- | --- | ---| ---|
|v18 base||5145|1115|4.61|0|
|v18 march|5039|1094|4.6|1.19%|
|v15 base||5156|1075|4.79|0|
|v15 march|4489|825|5.44|5.85%|

测试结果和理论一致：SVE指令占比增加，指令数减少。性能的提升幅度上和cycles的减少幅度一致。

从热点函数上，包含affine_transform.h中的计算的evaluate函数占比从23%（v18）减少到8%（v15）。

#### -march=native带来的性能提升

默认-O3下，v15版本编译使用neon指令，且neon没有实现dot操作，生成了更多的指令来进行计算（避免溢出，汇编上看和大数乘法很像）。使能-march=native后，neon指令被替换为SVE指令，原本十几条的neon指令，变成了几条SVE指令。

同样，如果是x86，-march=native带来的提升是AVX512指令替换了SSE指令。

## 一些思考

一通分析下来，其实决定stockfish性能的，还是cpu的simd能力。其实以往的图像处理，视频编解码负载也是在测试这个场景。从“流行度”的角度上看，stockfish确实代表了一部分AI的核心计算特征。为什么是一部分呢，因为stockfish特征上还是core bound的，但是现在火热的LLM的瓶颈基本都是mem bound。也就是算力不是问题，数据搬运的效率才是问题。这也是NV搞NVLINK，Intel搞CXL，菊厂在搞UB的原因。

但是说回负载集成上，cpu类的benchmark，比如speccpu，测试的是cpu，内存子系统，编译器。intrate的模式下，核存比设计上仍然保持1：2这样，也就是一个copy上限占用2G的带宽。这个比例设计其实是传统通算服务器的发展规律的体现。在AI出现之前，1：2这样的配比能满足绝大多数任务，现在的云服务器上，也是这个比例。所以speccpu在设计负载时同样遵循了这个规则。

cpu在AI场景下，仍然扮演一个协调者的角色（算子下发，agent），llama.cpp这样的项目更像是一种没有计算卡时的妥协（不会真有人生产环境用llama.cpp跑cpu推理吧）。所以结果就是，在cpu上做一个看起来像AI的负载，并没有什么意义。

毕竟对厨子的考核不能只看切菜速度的快慢。