# 如何在npm上发一个包？
## 预备知识
虽然只是发一个包，但是我后知后觉的意识到这里面的门道还是挺多的。

npm这个包可以追溯到js刚要模块化那个时代，简单的说，就是随着js项目的庞大，必须要有一种模块化的管理方式来管理代码。是的，是熟悉的commonjs，esModule的味道。这方面的东西已经有很多大佬整理了，不再展开。去除大量技术细节，往npm上发一个包本质上还是要实现代码复用，只不过这个复用方式要遵从一定的约定。

最简单的，写一个函数挂在window上，然后把这个js文件发给小伙伴，小伙伴运行了这个文件，就可以调用window上的这个函数了。不优雅，但实用。

> npm is the world's largest software registry.

所以，往npm发一个包只要了解npm用了啥约定，我们遵从这个约定就好了。

## npm用的啥约定呢？
秉承着实用主义原则，肯定先搜索了一下“npm发布包”，然后就有了一堆答案。整合一下这些答案，可以归纳出简单的流程：
1. `npm init`
2. 编写项目
3. `npm login`
4. `npm publish`
没了，就这三步。颇有种“如何把大象放进冰箱”的意味。
### npm init
> Create a package.json file

官方文档介绍该`init`在后面没有跟其他参数的时候，执行的就是“问一些问题，根据你的选择初始化一个package.json文件”。

而在init后面跟有参数的时候，会给这个参数前面加上create，并执行的是`npm exec`。比如`npm init react-app ./cra`的效果和`npx create-react-app ./cra`是一样的。

再结合:point_right:[Creating a package.json file](https://docs.npmjs.com/creating-a-package-json-file), `npm init`这一步都可以省略，我们完全可以自己创建这个package.json文件，并只要保证它有`name`和`version`两个字段即可。

### create node.js modules
> Node.js modules are a type of package that can be published to npm.

关键词，node.js modules，这不就是commonjs的模块规范么！也就是说，使用`module.exports`把写好的包导出就可以了。

但是在这个步骤中，路径问题就是最大的坑。这里经过我的测试分为好几种情况:
1. 当在package.json文件中没有声明main字段时，默认在require这个包时，从包的根路径下的index.js文件去require。
2. 有main字段时，这个字段就是require包时的入口文件，比如写为`src/index.js`。
3. 如果有exports字段，它的优先级高于main字段，而且更严格，使用该字段后会阻止引用exports字段内规定之外的入口。这个可以稍微展开来说一下。我在知道main字段的作用后，测试了一下它的功能并发现即使在main字段规定了入口，使用者依然可以根据你这个包的目录结构来引用其他文件。当只是简单的`require(your-package)`时，且设置了main字段为`src/index.js`，用户require的确实是src下的index.js。但是他们还可以`require(your-package/doc/secret.js)`，虽然这样很*自由*,充满了js的风情味道，但更严谨一些还是好的。exports就是限制使用者，不能自由引入包里文件的这样一个字段。

开发完包以后，总要测试一下。推荐使用`yalc`进行测试，操作上简单易用，原理上学问满满。
### npm login
令我震惊的是，npm官方文档并没有对这个命令的说明，但是这个命令只是在终端登录一下npm账号。此外，如果是发布公司的私包，情况也类似。我司使用的是阿里的云效，里面有傻瓜式教程。
### npm publish
发布完毕，保险起见可以再npm install一下。
## 衍生问题
虽然经过上面一系列操作，这个包“能跑了”，但是在npm之外还有很多没做的地方。比较重要的就是webpack和babel这两部分工作了。
### webpack
这个npm包需不需要webpack要视情况而定，目前我也没法区分，只能在这里先挖个坑了。
### babel
一般都需要使用babel对包的语法进行降级，我使用了babel-cli将包中功能部分都转译在了dist文件中，在publish阶段只把转译后的文件上传了。
