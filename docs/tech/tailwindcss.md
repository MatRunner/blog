# TailwindCSS使用体验
## 背景
偶然发现了tailwindCss，在个人的小项目中使用后感觉相当方便，很适合我这种懒人。然后在新项目中直接就用上了，随着新项目从零到步入正轨，我发现它并没有想象的那么好用。
## 理由
总结来说，就是和企业产品开发相容性不佳。
1. 难以完全舍弃css。流行框架Vue、React组件中attribute有重要作用，classNames一旦过长，代码异常丑陋！而复杂意味着定制化和不通用，抽离复杂样式到tailwind文件中，违背了tailwindCss复用样式到初衷，所以为什么不直接写css呢？
2. 因为难以舍弃css，需要维护两份样式标准文件。企业级产品开发，对样式有严格要求，一个项目有自己对样式标准，因此需要在tailwind中定义一套标准，而由于css难以舍弃，又需要定义一份给css用的标准文件，这样要维护两份标准文件。
3. 灵活性不如css。css的选择器作为其核心内容，不是那么容易被替代的。tailwindCss只能对当前元素设置样式，子元素的样式还需要单独设置，虽然官方给出了建议，比如用好vs code的多选，用map循环渲染，但都是为了回避功能上的缺陷，所以为什么不`div>span`来搞定呢？
4. 维护成本。虽然tailwindCss上手很快，但是再快也是要学习成本的。所有的前端er都会css，但不一定都会tailwindCss。