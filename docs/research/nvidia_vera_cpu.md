# NVIDIA Vera CPU

## 前言

NVIDIA 作为 AI 浪潮下最大的"卖铲人"，并不满足于只做 GPU 的供应商，而是给自己定位成了 AI 训推的全套解决方案供应商。Vera CPU 的介绍页上写着：**Purpose-Built for Agentic AI**。

这个标题已经透露了不少信息了：

1. 老黄认为，未来的 AI（也可以说是现在的 AI），形态上就是 Agentic AI。
2. Vera CPU 是专门针对 Agentic AI 设计的，是 DSA（Domain Specific Architecture）的设计。

了解 Vera CPU，可以帮助理解 Agentic AI 的性能特征。

## 基本参数

Vera 与上一代的 Grace 不同，使用了 NVIDIA 自己研发的 Olympus 核心，宣称是上一代性能的两倍，且兼具优异的能效。

兼容 ARMv9.2 指令集，支持 FP8 精度。88 个 Olympus 核心，每个核心支持 2 个线程。

配备了 LPDDR5X 内存，内存带宽高达 1.2 TB/s。与 Grace 相比，L2 Cache 容量翻倍，每个核心 2 MB；L3 Cache 容量达到了 164 MB。

支持 PCIe 6.0 和 CXL 3.1。

峰值 TDP 450W。由于使用了LPDDR5X，功耗控制更佳。

![veralscpu](../img/veralscpu.png)

另外，还可以看到，基频到了3.5GHz，相当高。

## benchmark

gem5测试中，vera的多核性能表现略优于2xAMD 9755，单核性能介于amd EPYC 9575F 和 9475F 之间。在arm阵营中，是相当炸裂的性能表现了。

stream测试中，vera使用stream的开源上游版本，gcc编译下，就跑出了超过第二名60%的成绩，堪称恐怖。LPDDR5X发力了！

在python和java的性能测试中，vera的性能表现相当出色，符合其data center的定位。

> _On a geo mean basis, the NVIDIA Vera delivered **10% better performance than the AMD EPYC 9575F 5.0GHz** high frequency processor. For gen-on-gen compared to Grace, **Vera was coming in at 1.63x the performance geo mean**. Over a single Intel Xeon 6980P as Intel's current flagship Granite Rapids processor, **NVIDIA Vera delivered 1.55x the performance**._

更多测试结果可以参考[这篇文章](https://www.phoronix.com/review/nvidia-vera-benchmarks)。

## 微架构

vera是基于Olympus自研核心设计，且目前没有公开微架构图。但是并不是说没有办法来做一些研究。gcc-16.1版本中，已经对vera的微架构进行了适配，所以可以看到一些相关信息。
获得gcc-16.1/gcc/config/aarch64/olympus.md文件，可以获得一些信息。

```md
(define_attr "olympus_dispatch"
"none,b,i,m,m0,l,v,v0,v03,v12,v45,v0123,m_v,l_v,m_l,m_v0123,v_v0123,\
 l_v03,sa_d,sa_v0123,sa_v_v0123"
```

流水线组有很多，但是类别可以分为`b,i,m,l,v,sa`六类。
|流水线类别|描述|
|----------|----|
|b|分支|
|i|整数|
|m|乘法|
|l|加载|
|v|向量|
|sa|存储|

可以顺便和neoversev2的对比一下：
```md
(define_attr "neoversev2_dispatch"
  "none,bs01,bsm,m,m0,v02,v13,v,l01,l,bsm_l,m_l,m0_v,v_v13,v_l,\
   l01_d,l01_v"
```
|流水线类别|描述|
|----------|----|
|b|分支|
|s|移位|
|m|乘法|
|v|向量|
|l|load，store|
neoversev2有5个类型的流水线，且如bsm这样的流水线都可以完成整数类型的运算，功能上有重叠，文档中：
```md
(ior
	   (eq_attr "type" "adc_reg,alu_ext,alu_imm,alu_sreg,alus_ext,\
	    alus_imm,alus_sreg,clz,csel,logic_imm,logic_reg,logics_imm,\
	    logics_reg,mov_imm,rbit,rev,shift_reg")
	   (eq_attr "sve_type" "sve_pred_cnt_scalar"))
	 (const_string "bsm")
```
这里可以发现Olympus和neoversev2的流水线上的区别：
1. Olympus的流水线类别分的更细。
2. neoversev2的流水线更简单，只有5个类型。
## 参考

1. [NVIDIA Vera CPU 介绍](https://www.nvidia.com/en-us/data-center/vera-cpu/)
2. https://www.phoronix.com/review/nvidia-vera-benchmarks
