module.exports = {
  base: '/blog/',
  title: '加班不秃，熬夜会秃',
  description: '博客；前端学习；生活记录',
  // head:[
  //   ['link',{rel:'icon', href:'./'}]
  // ]
  themeConfig: {
    lastUpdated: '最近更新于',
    nav: [
      { text: '首页', link: '/' },
      { text: 'GitHub', link: 'https://github.com/MatRunner/blog' },
      { text: '语雀', link: 'https://www.yuque.com/mouzaixiulianneigongdeyangtongxue' }
    ],
    sidebar: [
      {
        title: '介绍',
        path: '/',
        collapsable: false,
        sidebarDepth: 0,
        children: [
          {
            title: '关于本博客',
            path: '/'
          }
        ]
      },
      {
        title: '踩坑合集',
        path: '/tech/introduction',
        collapsable: false,
        children: [
          { title: '如何发布一个npm包', path: '/tech/npm' },
          { title: '使用webpack打出一个有导出的包', path: '/tech/webpack_export' },
          { title: '竟然被const坑了一把', path: '/tech/about_const' }
        ]
      },
      {
        title: '摸鱼杂谈',
        path: '/fish/introduction',
        collapsable: false,
        children: [
          { title: '材料那几年', path: '/fish/材料那几年' },
          { title: '我对前端岗位的思考', path: '/fish/我对前端岗位的思考' },
        ]
      },
      {
        title: '设计模式思考与实践',
        path: '/design-pattern/introduction',
        collapsable: false,
        children: [
          { title: '单例模式', path: '/design-pattern/singleton' }
        ]
      }
    ]
  },
  // configureWebpack: {
  //   resolve: {
  //     alias: {
  //       '@img': './public/image'
  //     }
  //   }
  // },
}