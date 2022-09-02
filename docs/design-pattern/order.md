# 责任链模式
> 使多个对象都有机会处理请求，从而避免请求的发送者和接受者之间的耦合关系，将这些对象连成一条链，并沿着这条链传递该请求，直到有一个对象处理它为止。
## 背景
需求为：用户在登录时，有三个弹窗，一定条件下，按照次序触发。分别为新手指引弹窗，更新说明弹窗，订阅文章弹窗。
1. 如果用户为新用户，第一次登录主页弹出新手指引，当天不再弹出其他弹窗。（优先级最高）
2. 如果用户为非新用户，当天第一次登录主页，如果有更新，则先弹出更新说明，若当天是周三（每周更新文章的时间），第二次进入主页，弹出订阅文章。之后当天不再弹出弹窗。
3. 若当天是周三，且无更新，则首次登录主页弹出订阅文章，之后当天不再弹出弹窗。
4. 其他情况无弹窗。
## 思考与实现
稍加分析可以得出，每次只弹出一个弹窗，则需要实现的是判断当前弹出哪个弹窗的方法。针对每种弹窗，是否弹出的逻辑不同，属于变化的部分。而判断每次要弹哪个窗，需要得知每个弹窗的状态。所以先要抽象出弹窗的状态数：
```ts
interface State{
  new:'new'|'freeze'|'active';
  update:'freeze'|'active';
  subscribe:'freeze'|'active';
}
```
实现责任链中的节点方法：
```ts
function ifNew(state) {
  if(state.new=='new'){ // 新用户
    popNew()
    rewrite({new:'freeze'}) // 新用户，已弹窗
  }else if(state.new=='freeze'){
    return 'break'
  }
  return 'next'
}
function ifUpdate(state){
  if(state.update=='active'&&hasUpdate()){
    popUpdate()
    rewrite({update:'freeze'})
    return 'break'
  }else{
    return 'next'
  }
}
function ifSubscribe(state){
  if(today()==3&&state.subscribe=='active'){
    popSubscribe()
    rewrite({subscribe:'freeze'})
  }
}
```
实现了节点函数后，需要实现责任链函数，需要做到`break`时终止传递，`next`时继续传递。
```js
const Chain=function(fn){
  this.fn=fn
  this.successor=null
}
Chain.prototype.setNextSuccessor=function(successor){
  this.successor=successor
}
Chain.prototype.passRequest=function(){
  const result=this.fn.apply(this,arguments)
  if(result=='next'){
    return this.successor&&this.successor.passRequest.apply(this.successor,arguments)
  }
  return result
}
```
这是书中责任链构造函数的写法，即使第二次看，也依然觉得很精妙。

之后就可以把三个节点函数串成责任链了。
```js
const chainNew=new Chain(ifNew)
const chainUpdate=new Chain(ifUpdata)
const chainSubscribe=new Chain(ifSubscribe)

// 指定顺序

chainNew.setNextSuccessor(chainUpdate)
chainUpdate.setNextSuccessor(chainSubscribe)
```

只需要在用户每次进入主页时，调用`chainNew.passRequest(state)`即可。

这种实现方式下，可以灵活的加入节点，而无惧后面还会出现什么弹窗，也可以指定节点的连接关系。

## 实际情况...
以上只是我抽空对业务实现的反思，我真正的业务代码实现仅仅是大量的if-else串联，虽然丑陋，但是敏捷。