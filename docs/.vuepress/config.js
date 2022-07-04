module.exports = {
  base: '/blog/',
  title: '加班不秃，熬夜会秃',
  description: '博客；前端学习；生活记录',
  // head:[
  //   ['link',{rel:'icon', href:'./'}]
  // ]
  themeConfig: {
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
        ]
      },
      {
        title: '摸鱼杂谈',
        path: '/fish/introduction',
        collapsable: false,
        children: [
          { title: '材料那几年', path: '/fish/材料那几年' }
        ]
      }
    ]
  },
}