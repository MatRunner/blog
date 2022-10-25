# 学习monorepo
## 背景
组内又一个大哥离职了!

![wuwu](./image/sad.png)

大哥来了半年不到，某知名中厂跳来的，虽然和大哥不是一条业务线，但是大哥对我基本是有问必答，跟着大哥是学了一些东西的，呜呜呜。。。

然后组织就要求我去接手大哥的项目，这个项目本来也是在原来的主业务仓库中的，我曾经还参与迭代过两个版本，但现在拆出来以后我已经不认识了！大哥留下的`readme`中，项目使用了monorepo模式进行管理，并且进行了ts化，还留下了一堆我看不明白的脚本。所以我只能一步一步来，先弄明白monorepo是干啥的。

## 概念理解
> In version control systems, a monorepo ("mono" meaning 'single' and "repo" being short for 'repository') is a software development strategy where code for many projects is stored in the same repository. 
>       ——wikipedia
**优点：**

*把多个项目放一个仓库里。*

*便于代码复用。可以将公共的部分提取出来，不需要每一个项目都维护一个依赖管理。依赖只用下载一次，而不用在每个项目里都下载了。*

*原子化commit（没懂是什么意思）*

**缺点：**

*版本信息易失*

*无访问权限控制*

*需要更大的存储空间*

多少有些抽象，所以又参考了一篇文章：[為什麼前端工程越來越愛使用 Monorepo 架構](https://medium.com/hannah-lin/%E7%82%BA%E4%BB%80%E9%BA%BC%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E8%B6%8A%E4%BE%86%E8%B6%8A%E6%84%9B%E4%BD%BF%E7%94%A8-monorepo-%E6%9E%B6%E6%A7%8B-661afa90910a)

仓库管理策略随着项目体积越来越大分为了三个阶段：**Single-repo Monolith -> Multi-repo -> Monorepo**

### Single repo
所有业务都放在一个仓库里，这在项目起步阶段十分常见。初期业务形态简单，一个仓库完全可以解决，而随着业务发展，原本一个很小的功能可能会发展成一块单独的业务，但是仍存在同一个仓库里，这样缺点就很明显了：依赖臃肿，部署时间长，发版还会有时间冲突（切身体会）。
### Multi repo
这是大部分前端都会采取的方案。一个业务一个仓库，发版再也不冲突了，大家都很快乐！但是有人发现，每一个仓库都要配置一遍webpack，如果业务形态接近，配置的重复性很高。万一公司还有公共组件库这种东西，里面万一出了个小bug，修复一下就要同步所有的repo，大家都要再发一次版，也是一个问题。
### Mono repo
这应该是目前巨型项目的公认解决方案了，一般大公司都在用（因为项目庞大）。一个仓库，配置文件只有一份，公共文件只要改了，马上就能同步到所有业务。但是，这一个仓库不是又回到Single repo去了吗！其实这个mono还是single的意思，确实形态上是回去了。这个解决问题的策略符合第一性原理，single repo的问题是部署时间长，发版有冲突，依赖庞大。部署时间长那就仓库内**每个业务单独部署**，顺便也不会有时间冲突问题了；依赖庞大没法解决，那就公共依赖放外层，业务独有依赖放业务目录下，所以mono repo每个业务文件下都有自己的node_modules。

另作者推荐了monorepo的解决方案[Nx](https://nx.dev/)

当然，没解决的single repo的缺点还在。
## 挖坑
大概理解概念之后，会发现这个monorepo的处理策略咋么和微前端的概念这么像！甚至[qiankun](https://qiankun.umijs.org/zh/guide)这种不限子业务技术框架的特点还更胜一筹？虽然99%的原因还是我工程经验不够，但是大佬们你们这么造概念让我很难办啊！