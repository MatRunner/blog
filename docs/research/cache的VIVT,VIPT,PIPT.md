# cache的VIVT,VIPT,PIPT学习

一句话解释，这三个东西是如何找cache中的数据的方法。

## 基础概念

一个内存地址64个bit（现在都是64位系统），cache是如何存储的？

一个address从高位到低位可以分为tag，index，offset三部分。

| 部分       | 作用                                                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tag**    | 用于最终判断是否命中cache，由于使用index只能找到set，如何确定在哪个way中还需要tag判断；                                                                         |
| **Index**  | 指示存放在哪个set中，比如32K的cache，4way，每个way 8k，8k/64B=128个cacheline，也就是有128个set，所以index是7位。                                                |
| **Offset** | 用于判断cache行中具体命中的是哪个字节。由于一个cacheline是64字节，所以offset是6位。但其实这个offset对找是哪个cacheline没用，它是定位数据在cacheline中的偏移量。 |

现在的缓存都是**组相联结构**，缓存的基本单位可以认为是cacheline，一个cacheline是64字节。现在常见的是4-way set associative cache。

到这里只是简单的介绍一个address中的tag，index，offset三部分，看起来只需要根据这三部分就能从cache中找到需要的数据，但其实这并不是一块独立的知识。需要和虚拟地址技术和多级缓存结构结合起来，问题就复杂了。

## cache中到底存的是虚拟地址还是物理地址？

实际上还要分情况，现代高性能核心的多级缓存中，L1使用的是VIPT，L2/L3缓存使用的是PIPT。

VIPT: Virtual Index Physical Tag
PIPT: Physical Index Physical Tag

对应的还有VIVT。但是没有PIVT这个东西。

### PIPT,VIPT,VIVT

先从最简单的PIPT来说，PIPT的tag是物理地址的tag，index是物理地址的index。物理地址是唯一确定的，所以用index和tag可以唯一确定一个cacheline。问题就是每次查找cacheline，都要经过tlb翻译一下。

然后是VIVT，VIVT的tag是虚拟地址的tag，index是虚拟地址的index。虚拟地址就不是唯一确定了的，它只在一个进程中唯一。进程切换时如果不flush掉cache，就会命中到上个进程的同名的address上，这就是aliasing问题。这个问题就导致没人在用VIVT。当然好处是完全使用了虚拟地址，所以不经过tlb翻译。

VIPT: Virtual Index Physical Tag。就是结合的一种方法。这种方法看起来仍然需要经过tlb，但是可以并行执行，index可以直接去cache中查找，同时tag去tlb中翻译，最终达到接近VIVT的速度（毕竟cache就是要快）。那么如何保证重名的问题？既然index是虚拟地址，即使tag是物理地址，也可能存在aliasing问题。这里有一个十分巧妙的方法，一般来说，系统是4k页，它的page offset是12。而一个4k的way，index+offset也是12. 这里还需要补充一下tlb的相关知识，tlb把虚拟地址翻译为物理地址，这个翻译只是翻译的VPN，virtual page number的部分，page offset是不变的，也就是低12位不变。因此VIPT实际上还是PIPT，也可以唯一定位出缓存位置。

但是如果系统是4k页，但是一个way大于了4k，就会存在aliasing问题。index+offset超过了12位，多出的位可能会出现重名问题。应对这种情况，有一个叫page coloring的技术，这里并不再展开了解。但是这些技术肯定是会造成一些性能的损失的，没有page size和way size都是4k来的高效。

### 那为什么没有PIVT?

其实理解了缓存的查找过程，就会发现虚拟的tag完全没有意义，因为没有唯一性，且index已经先要去tlb进行翻译了，那tag不如直接等tlb翻译完成后取物理地址。
