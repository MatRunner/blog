import { defineConfig } from "vitepress";

export default defineConfig({
  title: "学习与技术随笔",
  description: "体系结构/软硬协同/AI学习",
  head: [["link", { rel: "icon", href: "/fav.png" }]],
  themeConfig: {
    nav: [
      { text: "首页", link: "/" },
      { text: "技术研究", link: "/research/rob" },
      { text: "工作杂谈", link: "/works/spec2026-stockfish" },
      { text: "AI", link: "/AI/llm推理时的内存占用计算" },
    ],

    sidebar: {
      "/AI/": [
        {
          text: "AI 相关",
          items: [
            {
              text: "LLM 推理时的内存占用计算",
              link: "/AI/llm推理时的内存占用计算",
            },
            { text: "从零学 Transformer", link: "/AI/从零学transformer" },
            { text: "GPU中的bank conflict", link: "/AI/GPU_bank_conflict" },
          ],
        },
      ],
      "/research/": [
        {
          text: "技术研究",
          items: [
            { text: "ROB", link: "/research/rob" },
            { text: "GEMM", link: "/research/gemm" },
            { text: "二分查找", link: "/research/二分" },
            {
              text: "Cache 的 VIVT,VIPT,PIPT",
              link: "/research/cache的VIVT,VIPT,PIPT",
            },
            { text: "roofline模型回顾", link: "/research/roofline" },
            { text: "nvidia vera cpu", link: "/research/nvidia_vera_cpu" },
          ],
        },
      ],
      "/works/": [
        {
          text: "工作杂谈",
          items: [
            { text: "SPEC2026 - Stockfish", link: "/works/spec2026-stockfish" },
            { text: "SPEC2026 - Zstd", link: "/works/spec2026-zstd" },
            {
              text: "ASLR 开启导致 OpenFOAM 性能波动问题",
              link: "/works/ASLR开启导致openfoam的性能波动问题",
            },
            {
              text: "ALSR 开启导致 RapidJSON 性能波动问题",
              link: "/works/ALSR开启导致rapidjson性能波动问题",
            },
          ],
        },
      ],
    },

    socialLinks: [
      // { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
    ],
    footer: {
      message: "Released under the MIT License.",
      copyright:
        '<a href="https://beian.miit.gov.cn/" target="_blank">浙ICP备2022023934号</a>',
    },
  },
});
