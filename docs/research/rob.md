# 从零设计ROB microbenchmark

## ROB是什么

简单的来说，现代CPU都支持乱序，但是这里是说指令可以乱序执行，但是提交仍然必须是顺序的。ROB（reorder buffer）是一个队列数据结构，遵循先进先出，这样就保证了指令的顺序提交。

> The reorder buffer (ROB) is a queue of instructions in program order that tracks the status of the instructions currently in the instruction window. Instructions are enqueued in program order after register renaming. These instructions can be in various states of execution as the instructions in the window are selected for execution. Completed instructions leave the reorder buffer in program order when committed. The capacity of the reorder buffer limits how far ahead in the instruction stream the processor can search for independent instructions. This has been steadily increasing over many processor generations.

## 如何测量ROB的容量

简单的了解ROB的作用后，可以从数据结构入手。既然ROB是队列，由于硬件结构的限制，队列是有长度的，那么问题就转变为如何测试一个队列的长度。而手里的工具就是指令。

ROB的机制是队列前面的指令都执行完毕后就会提交（commit），后面的指令即使已经执行，如果前面有指令没有执行完，就会被阻塞。

那么如果指令队列没有超过ROB的容量，执行时间应该是差不多的，超过ROB容量后，执行时间线性增长。

## 逐步实现

核心的测试原理已经明白，那么就可以开始设计这个microbenchmark：

1. 控制模块。构造出每次循环的指令流。
2. 记录模块。记录每次循环的指令数和执行时间。
3. 报告模块。特定格式输出测定的ROB的容量。

可以借助AI来实现代码。

### 初版：nop

```c
#define TEST_ROB(N) \
static uint64_t test_func_##N() { \
    uint64_t start, end; \
    start = get_ticks(); \
    for (int i = 0; i < ITERATIONS; i++) { \
        asm volatile ( \
            ".rept " #N "\n\t" \
            "nop\n\t"            \
            ".endr\n\t" \
            : \
            : \
            : "memory" \
        ); \
    } \
    end = get_ticks(); \
    return end - start; \
}

```

得到的结果如下：

```text
Padding_N    | Total_Time (ms)    | Diff (ms)
----------------------------------------------------------
64           | 0.6347             | 0.0000
80           | 0.7885             | 0.1539
96           | 0.9425             | 0.1539
112          | 1.0963             | 0.1539
128          | 1.2501             | 0.1538
160          | 1.5661             | 0.3160
192          | 1.8656             | 0.2995
224          | 2.1733             | 0.3077

```

发现128到160间斜率增大，所以ROB的容量应该在128和160之间。

查阅资料，这个测试结果存在**较大偏差**。

> https://zhuanlan.zhihu.com/p/616648182

为了进一步保证测试的准确性，使用其它microbenchmark进行验证。似乎ROB只有94？这个测试结果反而和知乎上的测试更为接近。

```text
93       256.63
94       256.63
95       262.25
96       266.06
97       266.06
```

### v2：使用fsqrt做长延迟遮蔽

对于上面测试结果的差异，反复拷打AI和阅读一些microbenchmark的源码后，得出了下面的解释：

1. 只使用nop，retire的速度极快，很可能测的不是rob的容量，而且前端的fetch上限；
2. 即使nop超过rob容量，拐点也很不明显；

那么就可以改进一版：

```c
#define TEST_ROB(N) \
static uint64_t test_func_##N() { \
    uint64_t start, end; \
    double val = 2.0; \
    start = get_ticks(); \
    for (int i = 0; i < ITERATIONS; i++) { \
        asm volatile ( \
            "fmov d0, %2\n\t"  \
            "fsqrt d0, d0\n\t"  \
            ".rept " #N "\n\t" \
            "nop\n\t"            \
            ".endr\n\t" \
            : "=r"(val) \
            : "0"(val), "r"(2.0) \
            : "d0","cc", "memory" \
        ); \
    } \
    end = get_ticks(); \
    return end - start; \
}
```

这版的测试数据如下：

```text
NOP_Count  | Avg_Cycles   | Diff
----------------------------------------
64         | 1.23         | 0.00
80         | 1.23         | 0.00
90         | 1.33         | 0.10
91         | 1.37         | 0.04
92         | 1.49         | 0.13
93         | 1.73         | 0.24
94         | 1.73         | -0.00
```

发现在93时用时明显升高，那这个测定值就和上面的比较接近了。这里有个细节上的问题。除了用于填充的nop，还有fmov，fsqrt，但是代码中的padding_N只包括nop的数目。所以实际上的rob的size是padding_N+2。计算下得出rob size为92+2=94。

但是94这个数字有些反直觉，不是96这种看着就“合理”的数字。

### 问题：能否使用load做长延时遮蔽？

根据公开的资料，也可以用load来做长延迟指令，毕竟一条fsqrt可能有20个周期，但是一条load指令可能上百个周期，效果上应该是比fsqrt更好的。

> https://blog.stuffedcow.net/2013/05/measuring-rob-capacity/

修改为下面：

```c
#define TEST_ROB(N) \
static uint64_t test_func_##N(void *p1, void *p2) { \
    uint64_t start, end; \
    start = get_cycles(); \
    for (int i = 0; i < ITERATIONS; i++) { \
        asm volatile ( \
            "ldr %0, [%0]\n\t"         /* 队头阻塞：长延迟加载 */ \
            ".rept " #N "\n\t" \
            "nop\n\t"            \
            ".endr\n\t" \
            "ldr %1, [%1]\n\t"         /* 队尾：如果 N > ROB size，此指令无法发射 */ \
            : "+r"(p1), "+r"(p2) \
            : \
            : "x11", "cc", "memory" \
        ); \
    } \
    end = get_cycles(); \
    return end - start; \
}

```

测试结果如下：

```text
Padding_N    | Avg_Cycles      | Diff
-----------------------------------------------
64           | 12.06           | 0.00
92           | 10.70           | -1.37
93           | 10.72           | 0.03
94           | 10.86           | 0.13
95           | 10.92           | 0.06
96           | 12.04           | 1.12
```

看起来是96发生了跳变，那么rob size应该是95+2=97。这里注意涉及到了访存，为了避免硬件预取的影响，需要人为设计一下pointer chasing：

```c
void init_pointer_chasing(void **buffer, size_t count) {
    size_t *indices = malloc(count * sizeof(size_t));
    for (size_t i = 0; i < count; i++) indices[i] = i;

    // 随机打乱索引
    for (size_t i = count - 1; i > 0; i--) {
        size_t j = rand() % (i + 1);
        size_t temp = indices[i];
        indices[i] = indices[j];
        indices[j] = temp;
    }

    // 根据打乱的索引建立链表
    for (size_t i = 0; i < count - 1; i++) {
        buffer[indices[i]] = (void *)&buffer[indices[i+1]];
    }
    buffer[indices[count-1]] = (void *)&buffer[indices[0]];
    free(indices);
}
```

发现使用fsqrt和load，在平均cycle上确实差距很大，毕竟访存操作需要的周期远超开方这种计算。但是临界点基本上一致，存在3条指令的差异。

如果要认真追究为什么会有这种差异，需要费些功夫（主要现在的水平也不允许分析这些差异的原因，硬件的黑盒太多）。所以测量方法的分析到此为止。

## 注意事项与遗留问题

上面的测试程序中，使用了虚拟计数器的频率来做“计时”功能，实际上不是很准确，如果CPU还超频，误差会更大。所以更好的方式是使用**硬件计数器**。
此外，使用长延迟指令来做队头阻塞的测试方案中，测试了在x86和arm两个平台，跳变并不明显，很奇怪。个人的水平也不足以支撑进一步分析了。。。
