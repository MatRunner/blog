# 面向业务的Markdown Parser
## 背景
周五下午突然接到需求，需要尽快完成一个需求，详细如下：
- 业务背景：官网的文章 <-- MySQL <-- 运营后台录入文章。
- 需求来源：运营人员没有使用后台进行文章录入，而使用了石墨文档，因此无法直接写入DB内。
- 解决方案：石墨文档导出Markdown --> 脚本解析，按照格式写入DB内。
- 关键问题：Markdown中图片为base64格式，需要转化为blob并上传到oss，将oss地址替换base64。

一个小例子，如：
```
# 一级标题
## 二级标题
#### 题目
正文正文

```
解析逻辑为:

1. 正文上方无论几级标题，它只是题目；
2. 标题上下都是标题，它是才是目录；
3. 有嵌套关系，使用sql中的一个parentId字段来记录。
## 脚本实现
要对石墨导出的Markdown文档进行解析，需要将其转化为AST才能进行处理。社区中已经有丰富的library了。这里使用`marked`的`lexer`方法获得AST。

因此获得的入口文件为：
```js
const fs=require('fs')
const marked = require('marked')
const Parser=require('./method/parser')

const text = fs.readFileSync('./需要解析的md.md','utf-8')
const tokens = marked.lexer(text) // 获得AST
const parser=new Parser(tokens)
parser.start()

```

获得的AST是一个token组成的数组，对每一个token的处理都是相同的，但是由于token之间存在业务耦合，需要判断token的前后节点，来判断它是目录还是正文，且每个token还需要对是否含有图片进行判断，处理分支情况较多，因此使用了面向对象的写法来处理解析逻辑。

### 异步行为处理
解析过程中最麻烦的地方在于逻辑中会有大量的异步行为，首先不考虑异步的情况下，处理逻辑为：

1. for循环顺序处理每一个token;
2. 根据token type的不同，head类型，则插入数据库；正文题目类型，暂存等待获取所有正文内容；段落类型，是否有图片，有则转化base64并上传oss，并替换base64，再判断下个节点是否还是正文，是则顺序收集正文，不是则整合正文和题目，插入数据库。

这个处理逻辑中，异步情况在：
1. 插入数据库；
2. 上传图片到oss，且这个必须在插入数据库之前。

考虑到在遍历tokens时要同时处理上传图片的异步逻辑和插入数据库的异步逻辑，不如直接将两个过程拆开处理，因此直接在数据库操作前处理所有token中的图片。

### 层级结构处理
插入数据库中的parentId字段来源于数据库自己生成的Id，（数据库不是我设计的，我接手的时候就这样了，因此不考虑改造数据库），如果在处理每一个token的同时还要写入parentId，势必需要等待前面的某个token获取DB传回的id，这样会产生大量的无效的等待时间，因此还是采取不同逻辑的异步行为分离的思路，在所有token获取DB返回的id后再处理层级问题。这里感谢js的闭包特性，我使用了一个和tokens等长的数组`idStack`来记录每个token的id和它的parentId。

获取所有token的id后，再遍历一次idStack，将所有节点的parentId写回DB。

**至此，所有步骤就完成了。** 其余一些细枝末节问题不再详述（虽然坑都在细枝末节上）。

### 完整解析脚本

```js
const marked = require('marked')
const uploadOss=require('./oss')
const sql=require('./insertSQL')

const {insertSQL, updateSQL}=sql

class ParseTokens{
  constructor(tokens){
    this.tokens=tokens
    this.currentIndex=0
    this.content=[[]]
    this.contentIdx=0
    this.parentIndex=[] // 维护父节点的下标，用于指回parentId
    this.idStack=[]
    this.contentTitle=''
  }
  async start(){
    await this.uploadImg() // 处理所有图片
    const ary=[]
    for(;this.currentIndex<this.tokens.length;this.currentIndex++){
      ary.push(this.treat(this.tokens[this.currentIndex]))
    }
    await Promise.all(ary)
    this.callbackUpdateId()
  }
  async treat(token){
    switch(token.type){
      case 'heading': return this.treatHeading(token);
      default: return this.treatParagraph(token);
    }
  }
  treatHeading(token){
    if(token.depth===1){
      // 插入目录
      const item={parentIndex:null,id:null}
      this.idStack.push(item)
      this.parentIndex=[this.idStack.length-1]
      this.parentIndex.slice(0,1)
      return insertSQL({titleName:token.text.replace(/\*/g,"")}).then(id=>{
        item.id=id[0]
      })
    }else if(this.tokens[this.currentIndex+1].type==='heading'){
      // 插入非一级目录
      // 理论上来说heading后一定还有元素，因此不考虑下标越界
      const parentIdx=this.parentIndex[token.depth-2]
      this.parentIndex[token.depth-1]=this.idStack.length
      this.parentIndex.slice(0,token.depth) // 去除无用的父节点下标
      const item={parentIndex:parentIdx,id:null}
      this.idStack.push(item)
      return insertSQL({titleName:token.text.replace(/\*/g,"")}).then(id=>{
        item.id=id[0]
      })
    }else{
      // 插入文章标题
      this.contentTitle=token.text
    }
  }
  async treatParagraph(token){
    this.content[this.contentIdx].push(token)
    if(this.currentIndex>=this.tokens.length-1||this.tokens[this.currentIndex+1].type==='heading'){
      const str = marked.parser(this.content[this.contentIdx]).replace(/(?<=>)\s*(?=<)/g,"") // 一定要去空格，否则sql出错
      const item={parentIndex:this.parentIndex[this.parentIndex.length-1],id:null}
      this.idStack.push(item)
      this.contentIdx++
      this.content.push([])
      return insertSQL({titleName:this.contentTitle.replace(/\*/g,""), content:str}).then(id=>{
        item.id=id[0]
      })
    }
  }
  async uploadImg(){
    let all=[]
    for(let i=0;i<this.tokens.length;i++){
      const token=this.tokens[i]
      if(token.type==='paragraph'&&token.text.startsWith('![图片](data:')){
        all.push(uploadOss(token.text.slice(6,token.text.length-1)).then(url=>{
          const md=`![图片](${url})`
          const imgTokens=marked.lexer(md)
          console.log(imgTokens)
          this.tokens.splice(i,1,imgTokens[0])
          return true
        }))
      }
    }
    return Promise.all(all)
  }
  callbackUpdateId(){
    const ary=[]
    console.log('this.idStack',this.idStack)
    for(let i=0;i<this.idStack.length;i++){
      if(typeof this.idStack[i].parentIndex!=='number'){
        continue
      }
      const pidx=this.idStack[i].parentIndex
      const id=this.idStack[i].id
      ary.push(updateSQL(this.idStack[pidx].id,id))
    }
    Promise.all(ary).then(res=>console.log('mission complete!'))
  }
}

module.exports=ParseTokens

```