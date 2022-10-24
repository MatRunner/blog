# vite打包优化初步实践
## 背景
衔接:point_right:[vite使用初探](/tech/vite使用初探.html)。项目基本要进入发布阶段，开发任务不是那么紧张，因此有时间思考一些项目优化的事情。

优化的目标是对项目代码做合理的拆分，减少首屏加载时间，增加用户使用的流畅度。

*其实真实的目标是学习怎么对打包产物进行优化，当前项目体积不大，优化并无收益。*

## 优化切入点
> 性能优化的目的，就是为了提供给用户更好的体验，这些体验包含这几个方面：展示更快、交互响应快、页面无卡顿情况。

但是本次只关注chunk拆分的问题，看是否能减小chunk体积，减少项目的首屏加载时间。
*讲道理对于b端的产品，首屏的意义不是很大，特别是该项目并无首页这种东西，从主业务跳转来后，直接进入了功能页。*

由于在打包结果中，vite报警chunk体积超过了500kb，需要进行优化，所以先解决这个体积过大的问题。

### code split
#### rollup-plugin-visualizer
一个估算打包产物组成的可视化插件,[链接](https://github.com/btd/rollup-plugin-visualizer)，打包结束后会生成一个html文件。可以看到入口js文件中，哪部分占的体积最大。

正常情况下，项目代码只占一小部分，即使react提供了lazy这种动态加载代码的方式，但项目不到一定规模，收效实在甚为，甚至拆分过细反而会造成请求阻塞的问题。

产物中，node_modules基本占据主要。而通常，有那么特定几个包体积不小，如moment，lodash，echarts... 在它们的加成下，产物轻松超过了3M。
#### vite-plugin-chunk-split
一个vite拆包[插件](https://github.com/sanyuan0704/vite-plugin-chunk-split#readme), npm下载量虽不多，但是涨势迅猛。这里使用了该插件对较大的依赖单独拆除一个chunk。

这样，入口的js文件的体积减小到了700kb，“减负”不少。而拆出去的chunk则以link的形式插入到了html的head内。
#### link type: modulepreload
将node_modules拆成了几个包，产物中多了不少chunk，并且以link的形式插入到了html中。
![chunk](./image/vite_build.png)

然后我就发现，这个link是什么东西，这是什么属性！查找一下mdn，介绍为：预先加载module script（指支持esModule的模块）的一种声明方式。由于这是一种实验特性，介绍相当简陋。进一步去html标准里查找，大概是说可以预先加载资源作为一种优化方式。
> Additionally, implementations can take advantage of the fact that module scripts declare their dependencies in order to fetch the specified module's dependency as well. This is intended as an optimization opportunity, since the user agent knows that, in all likelihood, those dependencies will also be needed later. 

之后需要思考的一个问题是，link内预加载的资源是否阻塞了页面的渲染？如react这种依赖也是被单独拆分出去了，那么页面的渲染必然是发生在获取依赖之后的。如果确实是这样，那么随后产生了一个问题：减少preload的资源能否加快首屏加载？

*Chrome的lighthouse功能优化建议确实有 reduce unused js的建议，就很迷惑，虽然是preload请求*

网上搜了一圈，没找到有这方面的讨论。只能先给出一个暂时的自我理解的答案：

- 减少preload能不能加快首屏关键还是看preload内的资源是否和首屏相关；
- preload应该是页面加载时的一个并发请求，code-split的优化点在于将单个大体积的请求拆分为多个并发的小体积请求来减少首屏加载速度。