module.exports={
  base:'/blog/',
  title:'加班不秃，熬夜会秃',
  description:'博客；前端学习；生活记录',
  // head:[
  //   ['link',{rel:'icon', href:'./'}]
  // ]
  themeConfig:{
    nav:[
      {text:'首页', link:'/'},
      {text:'GitHub', link:'https://github.com/MatRunner/blog'}
    ],
    sidebar:[
      {
        title:'welcome',
        path:'/',
        collapsable:false,
        children:[
          {
            title:'欢迎页',
            path:'/'
          }
        ]
      },
      {
        title:'page1',
        path:'/handbook/1',
        collapsable:false,
        children:[
          {title:'1.md',path:'/handbook/1'},
          {title:'2.md',path:'/handbook/2'}
        ]
      }
    ]
  },
}