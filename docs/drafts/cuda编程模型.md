# cuda编程模型

## cuda

Compute Unified Device Architecture (CUDA)
（统一计算设备架构）

设计目标：并行执行数千个线程，以牺牲单线程性能为代价，换取更高的总吞吐量。

## 硬件模型

假定系统为异构计算系统。

模型上是：cpu启动程序代码 -> cuda api通过总线在host内存和device内存间搬运数据->启动gpu上的代码->gpu上的代码执行->将结果搬运回host内存->cpu处理结果
异构意味着cpu和gpu可以同时工作。

由于某些原因：
- GPU上执行的函数叫kernel
- 启动kernel的过程叫launching the kernel

> Like any programming model, CUDA relies on a conceptual model of the underlying hardware. For the purposes of CUDA programming, the GPU can be considered to be a collection of Streaming Multiprocessors (SMs) which are organized into groups called Graphics Processing Clusters (GPCs). Each SM contains a local register file, a unified data cache, and a number of functional units that perform computations. The unified data cache provides the physical resources for shared memory and L1 cache. The allocation of the unified data cache to L1 and shared memory can be configured at runtime. The sizes of different types of memory and the number of functional units within an SM can vary across GPU architectures.

上面这段话有几个关键信息：
- 在 GPU 的硬件芯片上，L1 缓存（由硬件自动管理的快取）和 共享内存（Shared Memory）（由程序员手动控制的高速缓存）其实在物理上是共用同一块高速存储区域（即统一数据缓存 Unified Data Cache）的。
- 这块共用空间的分配比例不是固定死的，而是可以在程序运行的时候（Runtime）通过代码动态配置。

> A grid may consist of millions of thread blocks, while the GPU executing the grid may have only tens or hundreds of SMs. All threads of a thread block are executed by a single SM and, in most cases [1], run to completion on that SM. There is no guarantee of scheduling between thread blocks, so a thread block cannot rely on results from other thread blocks, as they may not be able to be scheduled until that thread block has completed. Figure 4 shows an example of how thread blocks from a grid are assigned to an SM.

可以做进一步的理解：
- 线程块（Thread Block）”是一个抽象概念，是程序员在写代码时想象出来的软件逻辑组织，而“SM（Streaming Multiprocessor）”才是芯片上有实体的硬件物理单元，线程都要分配到SM上来执行。线程块就是被分配到一个SM中的线程集合。

> All threads in the warp execute the same instruction simultaneously. If some threads within a warp follow a control flow branch in execution while others do not, the threads which do not follow the branch will be masked off while the threads which follow the branch are executed. For example, if a conditional is only true for half the threads in a warp, the other half of the warp would be masked off while the active threads execute those instructions. This situation is illustrated in Figure 7. When different threads in a warp follow different code paths, this is sometimes called warp divergence. It follows that utilization of the GPU is maximized when threads within a warp follow the same control flow path.

上面这段话是在描述有控制流存在的情况，可以得出下面的推论：
- 一个线程块中的线程组成线程束（Warp），但是通知只能执行相同的指令。
- 硬件处理分支的方法是对线程束中的线程进行掩码操作，只执行分支成立的线程。
- 也就是说，分支的情况下，硬件资源是用不满的，这种情况叫做warp divergence。

## GPU memory

cpu直连了dram内存，gpu也有自己的dram内存（但是目前unified memory似乎是趋势）

GPU连接的内存叫global memory，CPU连接的内存叫host memory。但是它们共用一个统一的虚拟内存空间。

除了global memory之外，每个 GPU 还拥有一些片上内存。每个 SM 都有自己的寄存器文件和共享内存。这些内存是 SM 的一部分，SM 内部执行的线程可以极快地访问这些内存。register file可以认为是L0 cache，L1 cache和share memory只有一个物理实体，都是unified data cache,，L2 cache则可以在SM之间共享。