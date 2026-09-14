# RepoScope —— 让 AI 编码 Agent 读懂任意仓库的「本地优先 MCP Server」

> 基于市场调研的转型方案。原方案"给人看的架构图"经核实已是红海（GitDiagram 15.8k⭐ 已占坑、`code-visualization` topic 下 44+ 竞品）。本方案转向 **MCP + 本地优先**，切入 2026 年最热的 Agent 基础设施蓝海，与 GitDiagram 形成错位竞争。

---

## 一、为什么这次能爆（调研结论）

| 信号 | 数据 | 结论 |
|------|------|------|
| 给人看的"架构图"已红海 | GitDiagram 15.8k⭐（2024-12 上线，GPT-5，已有赞助）；topic 下 44+ 仓库 | 此形态卷死，先发优势被占 |
| **给 Agent 用的代码地图在蓝海且最热** | Understand-Anything **41.5k⭐**（知识图谱 + 集成 Claude Code/Cursor/MCP）、archify **50.9k⭐**（Agent Skill）、Claude-Mem **78k⭐** | 真正的增长点在这里 |
| 本地优先是差异化，不是噱头 | GitDiagram 依赖云端 GPT-5（要 key、代码上传、按量付费）；Ollama 153k⭐ 证明本地模型生态成熟 | "本地 + 零配置"是真实痛点 |

**核心判断**：把受众从"人类开发者"换成"AI 编码 Agent"，把形态从"展示图"换成"可被 Agent 调用的代码地图 MCP Server"——立刻从红海跳进蓝海，且与 GitDiagram 错位（它云端·给人看；我们本地·给 Agent 用）。

---

## 二、一句话定位 & 三秒演示

> **"A local-first MCP server that lets your coding agent read any GitHub repo — no API key, no upload, one command."**

演示脚本：用户装好 Claude Code → 运行 `npx reposcope --mcp` → 在 Claude Code 里说"帮我读懂 facebook/react 的渲染流程" → Agent 自动调用 RepoScope 的 `clone_repo` / `analyze_dependencies` / `explain_flow` 工具 → 秒回准确答案，且整个过程代码从不上传云端。

---

## 三、MCP 工具集（Agent 可调用的能力）

```text
reposcope_mcp
├── clone_repo(repo_url)           克隆到本地沙箱
├── analyze_dependencies(path)     用 tree-sitter 抽模块依赖 → 图谱 JSON
├── get_module_files(module)       返回某模块文件清单 + 摘要
├── search_symbol(query)           符号/语义搜索
├── explain_flow(entrypoint)       基于依赖图解释调用/渲染流程
└── onboarding_path(repo)          生成新人上手路线（Markdown）
```

统一通过 `@modelcontextprotocol/sdk` 暴露；Agent 无需知道实现细节，只管调用。

---

## 四、目标用户

| 角色 | 场景 | 传播力 |
|------|------|--------|
| Claude Code / Cursor / Codex 用户 | 让 Agent 接手陌生代码库 | 极高（自带教程传播） |
| AI Agent 开发者 | 给自己的 Agent 接"代码地图"能力 | 高（会写集成文章） |
| 注重隐私的团队 | 私有仓库分析，代码不出本机 | 高（合规卖点） |
| 技术博主 | "让我的 Agent 读懂 XXX 项目"内容 | 极高（自来水） |

---

## 五、技术架构

```
┌──────────────┐   MCP    ┌──────────────────┐   tree-sitter   ┌─────────────┐
│ Claude Code  │────────▶│  RepoScope MCP   │────────────────▶│ 本地仓库分析 │
│ /Cursor/Codex│  stdio  │  Server (Node)   │                 │ (零上传)    │
└──────────────┘         └──────────────────┘                 └─────────────┘
                                  │
                                  ▼ (可选)
                         可视化面板 (React Flow)  —— 人类也能看 Agent 画出的图
```

- **MCP 层**：`@modelcontextprotocol/sdk`，stdio 传输，`npx reposcope --mcp` 一行启动
- **分析引擎**：`tree-sitter` AST 精确解析(JS/TS/Python/Go/Rust)，未装 tree-sitter 时自动回退到内置正则扫描——零依赖即可运行；两者共用一套按语言语义解析 import 到真实文件的 resolver
- **本地优先**：默认 Ollama 做摘要/问答，可选云端；代码永不上传
- **可选面板**：同一个分析结果可渲染成 React Flow 图，人类也能看（双轨）

---

## 六、与 GitDiagram 的错位对比

| 维度 | GitDiagram | RepoScope（本） |
|------|-----------|----------------|
| 受众 | 人类开发者 | **AI 编码 Agent** |
| 部署 | 云端（Vercel/Railway） | **本地 MCP Server** |
| API key | 需要（GPT-5，付费） | **零配置 / 可选本地模型** |
| 代码上传 | 是（发到云端） | **否（本地分析）** |
| 接入 Agent | 弱（主要看网页） | **原生 MCP，Agent 直接调** |
| 热点标签 | 红海·可视化 | **蓝海·MCP·本地优先** |

---

## 七、安装与接入（极简是破局点）

```bash
# 1. 启动 MCP Server（任何支持 MCP 的 Agent 都能接）
npx reposcope --mcp

# 2. 在 Claude Code 的 .mcp.json 里加一行
{ "mcpServers": { "reposcope": { "command": "npx", "args": ["reposcope", "--mcp"] } } }

# 3. 然后直接对话："帮我读懂 facebook/react 的渲染流程"
```

零 API key、零上传、一行接入——这是 GitDiagram 给不了、而 Agent 用户最在意的。

---

## 八、增长引擎（发布节奏）

1. **MCP 目录首发**：smithery.ai、mcp.so、官方 MCP servers 列表——这是 2026 年 Agent 用户的发现入口
2. **Hacker News**：`Show HN: A local-first MCP server that lets your coding agent read any GitHub repo`
3. **配置教程**：分别出 Claude Code / Cursor / Codex / Cline 的"3 分钟接入"短文
4. **示例内容**："让 Claude Code 读懂 react / vue / next.js"——博主自来水
5. **徽章策略**：`Works with Claude Code` `Works with Cursor` `Works with Codex` `Local-first`

> 关键差异化文案：**"GitDiagram shows you the map. RepoScope lets your agent use it."**

---

## 九、路线图

> 状态（截至当前）：MCP Server、Blast Radius、双轨可视化、增量分析、GitHub Action 均已**真机验证可跑**（见各文件）。

- **已交付**：MCP Server 骨架 + 9 个工具（含 `blast_radius` / `ask_repo` / `summarize_change`）✅
- **亮点功能**：Blast Radius（影响范围分析）+ 可视化面板（`viz.html`）✅
- **已交付**：增量分析 & `.reposcope-cache.json`（CLI + MCP 均命中缓存）✅
- **已交付**：GitHub Action —— PR 架构影响自动报告（`action.yml` + `action-runner.mjs`）✅
- **已交付**：本地 LLM（Ollama）问答 —— `ollama.mjs` 零依赖适配器，无模型时优雅降级 ✅
- **已交付**：tree-sitter 精确引擎（JS/TS/Python/Go/Rust）+ 零依赖正则回退，同一套语言感知 resolver ✅
- **Week 1–2**：冲 MCP 目录 & HN，出 4 篇接入教程
- **下一步**：私有仓库 + token 支持、扩展语言（Java/C#/Ruby）、LSP 调用图、VS Code 插件

---

## 十、风险与应对

| 风险 | 应对 |
|------|------|
| MCP 协议变动 | 跟官方 SDK，保持传输层抽象 |
| 大仓库慢 | 增量分析 + 文件数上限 + Web Worker 并行 |
| 被大厂复制 | 抢 MCP 目录心智 + Apache 协议 + 社区 |
| Agent 用户量不如预期 | 双轨：人类也能用可视化面板兜底 |

---

## 十一、当前状态与建议的下一步

> 项目已从"能跑的骨架"成长为**有日常使用价值**的工具：Agent 每次问"我改了 X 会炸到哪"秒回（缓存命中），CI 里每个 PR 自动贴架构影响报告，人类也能在 `viz.html` 看同一份图。MCP / Blast Radius / 增量 / Action / 本地 LLM / tree-sitter 均**真机验证可跑**。

建议的下一步（按价值排序）：

1. **私有仓库 + token 支持** —— 企业/团队刚需，本地 + token 不上传是强卖点
2. **扩展语言**（Java / C# / Ruby）+ LSP 调用图 —— 把"依赖图"升级成"调用图"，能答"这个函数谁调用"
3. **VS Code 插件** —— 编辑器内实时图，真正进入日常开发流
4. **发布**：`.mcp.json` 接入模板已就绪，冲 smithery / mcp.so / HN，出 Claude Code/Cursor/Codex 教程与 HN 文案
