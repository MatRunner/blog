# 如何使用webpack打出一个有导出的包？
## 起因
在发布公司的npm包时，思考了要不要使用webpack的问题，当时得出的结论是作为一个包，我们并没有对它有体积大小的要求，代码压缩应该是一个完整的项目要上线前要做的工作。并且当时使用webpack步履蹒跚，墨迹了一天也没打出一个有导出的包，就这样演变成一个TODO的问题了。
## 开始求证
小搜一下，定位问题可能在`output.library`上，一手资料仍然是官方文档。文档对属性的说明为：
> Output a library exposing the exports of your entry point.

看样子是找对了。然后按照官方文档进行测试，Windows下直接报错（但是Mac没有，这就比较神奇），还需要指定`type`属性，再来看一下type是什么东西：
> Configure how the library will be exposed.

是一个指定导出模式的字段。可取值很多:point_right:[output.library.type](https://webpack.js.org/configuration/output/#outputlibrarytype)
这里只列出几个测试的type值。webpack配置如下：
```
// webpack.config.js
library:{
  name:myComponent,
  type:'one of types'
}
```
### commonjs
此时又到了复习commonjs规范的时候了!
> module 代表当前模块，是一个对象，保存了当前模块的信息。exports 是 module 上的一个属性，保存了当前模块要导出的接口或者变量，使用 require 加载的某个模块获取到的值就是那个模块使用 exports 导出的值。有一点要尤其注意，exports 是模块内的私有局部变量，它只是指向了 module.exports，所以直接对 exports 赋值是无效的，这样只是让 exports 不再指向 module.exports了而已。
```
// 入口index.js
export const obj = {
  a: 1
}
```
在webpack配置中，有没有library.name属性打包的文件有所不同。
1. 有name值时。
```
/******/ 	var __webpack_exports__ = {};
/******/ 	__webpack_modules__["./src/index.js"](0, __webpack_exports__, __webpack_require__);
/******/ 	exports.myComponent = __webpack_exports__;
```
可见打包后的文件在exports上挂载了这个name的键名。
commonjs下模块使用的是`module.exports`导出的，webpack配置中library.name会作为exports上的一个属性，保存着入口文件导出的东西。如文档所说：
> The return value of your entry point will be assigned to the exports object using the output.library.name value.

将打包出来的main.js文件作为包的入口文件供其他项目调用(项目是经过babel处理的，虽然是mjs但是可以引入cjs包)，通过默认导入`import C from the-package`得到的是一个包含有`myComponent`属性的对象，**似乎**是`module.exports`, 所以要使用包导出的内容反而要先`import {myComponent} from the-package`具名导出一次，然后再从`myComponent`解构出需要的导出内容。略显麻烦。
2. 无name值时，文档给出了warning
> Note that not setting a output.library.name will cause all properties returned by the entry point to be assigned to the given object; there are no checks against existing property names.

这真是让我好一阵吐槽，这个given object是啥也不说清楚。直接看打包文件关键部分：
```
/******/ 	var __webpack_exports__ = {};
/******/ 	__webpack_modules__["./src/index.js"](0, __webpack_exports__, __webpack_require__);
/******/ 	var __webpack_export_target__ = exports;
/******/ 	for(var i in __webpack_exports__) __webpack_export_target__[i] = __webpack_exports__[i];
/******/ 	if(__webpack_exports__.__esModule) Object.defineProperty(__webpack_export_target__, "__esModule", { value: true });
```
是的，还多了几行，看样子是把入口文件的导出一个个挂在exports上，所以直接使用具名导入`import {obj1,obj2} from the-package`就能拿到导出的东西，比上面还少了一步。但是此时诡异的事情出现了，使用默认导入反而只导入了一个`undefined`，这和预计的应该导出**一个包含所有导出内容的对象**不符啊。
直接降级语法，使用`require('the-package')`导入，发现得到的确实是挂载所有导出内容的对象，看来是babel在转化cjs和mjs语法时出了问题，但是为啥有name没问题，没name反而有问题了？
定位到`@babel/preset-env`这个plugin，它实际上应该是`@babel/plugin-transform-modules-commonjs`在发挥作用，这里搬运一下官方的例子：
```
import foo from "foo";
import { bar } from "bar";
foo;
bar;

// Is compiled to ...

"use strict";

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

var _foo = _interopRequireDefault(require("foo"));
var _bar = require("bar");

_foo.default;
_bar.bar;

```
默认导出做了一层判断，如果这个obj原本是一个esModule的模块，那它肯定有default值，否则它是一个cjs模块，它自己作为默认导出。明白了语法转化规则，原因就是入口文件没有设置默认导出，所以默认导入得到的就是undefined了，经过验证确实如此。
3. 结论
有name时，是将name作为exports上的属性导出的，webpack的一通操作下，`__esModule`并不是TRUE了（虽然这个源码我没看明白！），所以exports自身作为default值导出, 使用时默认导入得到的是一个包含有name属性的对象。
无name时，webpack遍历了导出对象来挂载到exports上，特别的default也是一个对象名，所以默认导入和具名导入有没有东西完全取决于打包的入口文件是怎么导出的。
### module
如果直接把type类型从`commonjs`改为`module`，则会得到一个error:
```
Error: library type "module" is only allowed when 'experiments.outputModule' is enabled
```
文档中也说明了该特性还在试验中，需要将试验配置开启，注意output.name属性也需要**unset**。可以浅看一下这种type下打包出的是什么东西。
入口文件如下：
```
export const obj1 = { a: 1 }
export const obj2 = { b: 2 }
export default { c: 3 }
```
打包结果关键部分：
```
/******/ export { __webpack_exports__default as default, __webpack_exports__obj1 as obj1, __webpack_exports__obj2 as obj2 };
```
看样子就是正常的es Module下的导出，打包出的结果可以在项目中以正常的es Module语法引入。
## 总结
1. 在webpack中配置`output.library`才能打出一个有导出的包。
2. 一般配置`output.library.type`为`commonjs`，但是注意`library.name`的有无影响最终的导出结果。