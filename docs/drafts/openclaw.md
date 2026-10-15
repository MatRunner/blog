# 从零理解openclaw架构设计

## openclaw的诞生

openclaw是基于什么需求诞生的？

OpenClaw（最初以 Clawdbot 之名诞生，曾短暂更名为 Moltbot）是由奥地利开发者 Peter Steinberger 于 2025 年底发起的开源 AI Agent（智能体）项目。

简单的来说，就是打造一个work而不是chat的AI助手。

chat时代的工作流可以简单抽象为下面的步骤：
1. 得到需求
2. 人为定义方案
3. 按顺序执行方案
4. 遇到问题，和AI chat，得到答案，回到步骤3
5. 方案执行完毕
可以发现AI只是作为一个高级的搜索引擎。虽然说步骤4确实占用了工作流中的很大一部分时间，但是这个整体的执行流程仍然是传统的工作流。

openclaw，或者说智能体，更进了一步，步骤二到步骤四都交给了AI来执行。人的部分只有定义需求这一部分。（可以说，仍然是给出一个prompt）

## openclaw有那些模块？

如果有架构经验，其实可以从需求定义出架构进而设计出openclaw的模块；但是对于我这种架构小白来说，可能需要从模块设计来反推架构。

根据openclaw的[官方文档](https://docs.openclaw.ai/zh-CN/concepts/architecture), 包括：
1. gateway
2. runtime
3. agent loop
4. system prompt
5. context
6. agent working space
7. OAuth，权限管理

```text
┌─────────────────────────────────────────────────────┐
│              HTTP & Web Layer                       │
│  (control-ui, openai-http, mcp-http, sessions-http)│
└────────────────────┬────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────┐
│        Authentication & Authorization               │
│         (auth, device-auth, approvals)              │
└────────────────────┬────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────┐
│          Gateway Server Core                        │
│  (server.impl, server-http, server-runtime)         │
└───────┬──────────────────────┬─────────┬────────────┘
        ▼                      ▼         ▼
    ┌───────────┐    ┌──────────────┐   ┌─────────┐
    │Chat Engine│    │ChannelMgmt   │   │Plugins  │
    │(session)  │    │(WhatsApp,TG) │   │(Skills) │
    └───────────┘    └──────────────┘   └─────────┘
        ▼                      ▼         ▼
    ┌───────────┐    ┌──────────────┐   ┌─────────┐
    │Tool/Agent │    │Nodes/Devices │   │Voice/  │
    │Execution  │    │(iOS/Android) │   │Talk    │
    └───────────┘    └──────────────┘   └─────────┘
```