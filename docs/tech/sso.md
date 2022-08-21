# 集成sso的前端项目如何在开发阶段绕过登陆限制
## 问题背景
笔者所在的公司是做SaaS服务的，随着公司发展，SaaS集成的业务越来越庞大，已经演变成了一个超大的SPA，因此各个业务模块的拆分势在必行。笔者所在的业务线负责拆分工作的是另一个同事（毕竟笔者资历尚浅），但是在拆分项目的时候还是有一些问题值得记录的。

拆分出去的项目的处理手段是使用nginx做了域名的转发，因此理论上不需要对拆出去的代码进行更改就可以在线上跑起来了，但是对于本地开发来说，一些依赖于其他模块的功能就访问不到了。其中，登录验证就是一个问题，如何在不具备登录模块的前提下进行本地开发呢？
## 登录验证的逻辑
首先需要了解项目中登录状态验证的逻辑是怎么样的。经过一番寻找，项目中登录状态的验证方法就是常见的token验证。登录成功后，后端返回一个token，前端把token塞到cookie里，只要有请求中没有token，就会返回error code，前端根据对应的error code跳转到登录页。
## 预想方案
知道了权限的验证方法，易得只要把token放进cookie里，拆分出的项目就可以继续愉快开发了。同时，笔者也参考了其他拆分出去的项目，区别是这个项目是使用webpack打包的。关键在与webpack dev server的配置。根据笔者的知识储备，目前的前端框架都是在本地启用一个端口来作为本地开发调试的服务端口。虽然上线后，前端请求的接口是同域的，但是在开发过程中，开发服务器和后端接口的地址并不是一个，所以本地开发基本都需要配置一下proxy将请求转发。

组里大姐大在webpackDevServer.config.js中请求了登录接口，（登录信息是写死的），获得token后，似乎是用了http-proxy-middleware，将token塞进了response的cookie里，这样在项目启动后，所有请求自动就带上了token，开发就不必关心登录的问题了（实际这个配置极其繁琐，而且没有注释，对小白十分不友好）。流程上看着确实没有问题，依照同样的思路，在vite复现一下，我的这个项目应该就好了。
## 实操问题
根据上述思路，vite也应该有相关的配置。我的同事使用了plugin的方式来实现给请求加上token，(配置说明)[https://vitejs.dev/guide/api-plugin.html#vite-specific-hooks]依旧对小白十分不友好。大概写法如下：
```js
const myPlugin = () => ({
  name: 'configure-server',
  async configureServer(server) {
    const token = await fetchToken('xxx')
    server.middlewares.use((req, res, next) => {
      res.setHeader('set-cookie',[`token=${token}`])
    })
  }
})

```
这种自定义plugin的方式看着是给请求加上了token，结果项目还是没有跑起来，后端接口并没有检测到带上了token，我在本地调试时发现，plugin中发出和接收的请求中确实带上了token，之后经过漫长的检索，
(感谢大佬)[https://liyangzone.com/article/2022-05-25-advanced-proxy-config/]给出了另一个配置。这个配置是对proxy的请求进行了拦截修改，而本地项目中的接口确实都是通过proxy进行了反向代理，这种配置从逻辑上更加说得通，实际也确实实现了本地项目启动后自动获取并给后续经过proxy的请求都带上了token。

最后虽然解决了问题，但是其中还有很多盲点，通过proxy的请求不会经过plugin处理吗，为何token没有加上去；项目和本地vite server到底是怎么个通信模式？这些问题已经不是一时半会能解决的了。

后记：出现了新的问题，同事的写法在本地开发时获取sso的token十分不稳定，有时候能够正常登录，有时候又不能。只能说我的这种方法是能够稳定登录的。