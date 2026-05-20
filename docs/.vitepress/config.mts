import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "Yang's Blog",
  description: "Personal Technical Research Plot",
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '技术研究', link: '/research/rob' },
      { text: '工作杂谈', link: '/works/spec2026-stockfish' },
      { text: 'AI', link: '/AI/llm推理时的内存占用计算' }
    ],

    sidebar: {
      '/AI/': [
        {
          text: 'AI 相关',
          items: [
            // { text: 'Tokenizer', link: '/AI/tokenizer' },
            { text: 'LLM 推理时的内存占用计算', link: '/AI/llm推理时的内存占用计算' },
            { text: '从零学 Transformer', link: '/AI/从零学transformer' },
            // { text: '从零学习模型量化', link: '/AI/从零学习模型量化' },
            // { text: '模型微调', link: '/AI/模型微调' }
          ]
        }
      ],
      '/research/': [
        {
          text: '技术研究',
          items: [
            { text: 'ROB', link: '/research/rob' },
            { text: 'GEMM', link: '/research/gemm' },
            { text: '二分查找', link: '/research/二分' },
            { text: 'Cache 的 VIVT,VIPT,PIPT', link: '/research/cache的VIVT,VIPT,PIPT' }
          ]
        }
      ],
      '/works/': [
        {
          text: '工作杂谈',
          items: [
            { text: 'SPEC2026 - Stockfish', link: '/works/spec2026-stockfish' },
            { text: 'SPEC2026 - Zstd', link: '/works/spec2026-zstd' },
            { text: 'ASLR 开启导致 OpenFOAM 性能波动问题', link: '/works/ASLR开启导致openfoam的性能波动问题' },
            { text: 'ALSR 开启导致 RapidJSON 性能波动问题', link: '/works/ALSR开启导致rapidjson性能波动问题' }
          ]
        }
      ]
    },

    socialLinks: [
      // { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
    ]
  }
})
