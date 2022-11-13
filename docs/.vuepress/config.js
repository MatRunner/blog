module.exports = {
  base: '/',
  title: '前端学习与摸鱼艺术',
  description: 'blog；frontend developer；',
  head: [
    ['link', { rel: 'icon', href: '/fav.png' }]
  ],
  themeConfig: {
    lastUpdated: '最近更新于',
    nav: [
      { text: '首页', link: '/' },
      { text: 'GitHub', link: 'https://github.com/MatRunner/blog' },
      { text: '语雀', link: 'https://www.yuque.com/mouzaixiulianneigongdeyangtongxue' },
      { text: '100天', link: 'https://100.codeyi.top/' },
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
          { title: '竟然被const坑了一把', path: '/tech/about_const' },
          { title: '集成sso的前端项目在开发阶段绕过登陆', path: '/tech/sso' },
          { title: '面向业务的Markdown解析脚本', path: '/tech/md_parser' },
          { title: 'Vite使用初探', path: '/tech/vite使用初探' },
          { title: 'Vite打包优化初步实践', path: '/tech/vite打包优化' },
          { title: 'TailwindCSS使用体验', path: '/tech/tailwindcss' },
          { title: '学习monorepo', path: '/tech/monorepo' },
          { title: '前端工程化——碎片集', path: '/tech/工程化' },
          // { title: '浅学lambda演算', path: '/tech/lambda' },
        ]
      },
      {
        title: '与产品斗智',
        path: '/work/introduction',
        collapsable: false,
        children: [
          { title: '*Observer API系列', path: '/work/observer' },
        ]
      },
      {
        title: '设计模式思考与实践',
        path: '/design-pattern/introduction',
        collapsable: false,
        children: [
          { title: '单例模式', path: '/design-pattern/singleton' },
          { title: '责任链模式', path: '/design-pattern/order' },
        ]
      },
      {
        title: '摸鱼杂谈',
        path: '/fish/introduction',
        collapsable: false,
        children: [
          { title: '材料那几年', path: '/fish/材料那几年' },
          { title: '如何管理好自己的项目排期', path: '/fish/十分重要的项目排期' },
          { title: '我对前端岗位的思考', path: '/fish/我对前端岗位的思考' },
          { title: '如何进行项目复盘——前端视角', path: '/fish/如何项目复盘' },
        ]
      },
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