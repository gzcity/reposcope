# QUICKSTART — RepoScope 怎么跑起来、怎么用、怎么发

本文件给你**直接可敲的命令**,不解释概念。四种玩法按需求选。

---

## 0. 前置准备（一次）

```bash
# 1) 拿到项目
git clone https://github.com/<你>/reposcope.git   # 或就在 /workspace/RepoScope 直接玩
cd reposcope

# 2) 零依赖模式：什么都不装，直接能跑（正则扫描）
node --version        # 需要 Node >= 18

# 3) 精度模式（可选，推荐）：装 tree-sitter，得到精确 AST 解析
npm install           # 只装 optionalDependencies，装了自动启用，没装自动回退正则
```

> **零依赖卖点是真的**：不 `npm install` 也能跑；装了 tree-sitter 只是"更准"，不是"必须"。

---

## 1. 自己先验证（不接任何 AI，30 秒）

```bash
# 分析任意仓库，出模块依赖图
node graph.mjs /path/to/any/repo

# 增量模式（第二次秒回，看缓存命中率）
node graph.mjs /path/to/any/repo --incremental

# 影响范围：改了某文件，会炸到哪些模块
node graph.mjs /path/to/any/repo --blast packages/core/index.ts
```

想看人类也能玩的图？浏览器打开 `viz.html`，内置 react 示例 + 可加载真实 `graph.json`。

---

## 2. 接进 Claude Code / Cursor（让 AI 读懂任意仓库）

### 方式 A：项目级（放在仓库根目录的 `.mcp.json`）
项目里已经有这个文件，Claude Code / Cursor 进到该目录会自动识别：

```json
{
  "mcpServers": {
    "reposcope": { "command": "node", "args": ["/绝对路径/server.mjs"] }
  }
}
```

### 方式 B：全局（所有项目都能用）
```bash
# Claude Code
claude mcp add reposcope -- node /绝对路径/reposcope/server.mjs

# 或在 ~/.claude.json / Cursor 设置里加同样一段
```

### 接上后怎么用
进 Claude Code 直接说自然语言，它会**自动调用 RepoScope**：

```
帮我读懂 facebook/react 的渲染流程
我刚改了 packages/core，会炸到哪些地方？
给新人生成一条从入口读起的上手路线
用本地模型总结这次 PR 的影响
```

对应工具：`clone_repo` `analyze_dependencies` `get_module_files` `search_symbol`
`explain_flow` `onboarding_path` `blast_radius` `ask_repo` `summarize_change`（共 9 个）

---

## 3. 接进 GitHub Actions（每个 PR 自动贴架构影响报告）

把这两段放进**目标仓库**（不是 RepoScope 自己）：

`.github/workflows/reposcope.yml`：
```yaml
name: RepoScope Impact
on:
  pull_request: { types: [opened, synchronize, reopened] }
permissions:
  pull-requests: write
  contents: read
jobs:
  reposcope:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: <你>/reposcope@v1        # 发布后换成你的 org
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          path: '.'
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: reposcope-report, path: reposcope-report.md }
```

PR 一开，自动算出"改了哪些模块 / 直接影响 / 传递影响"，回评到 PR 上。
本地有 Ollama 时还会多一段自然语言摘要；GitHub 托管 runner 无 Ollama 会自动回退静态列表。

---

## 4. 发布冲榜（拿真实星标数据，而不是猜）

按这个顺序发，**先拿信号再 All in**：

1. **发到 MCP 发现入口**（2026 年 Agent 用户的发现渠道，比 HN 更精准）
   - [smithery.ai](https://smithery.ai) — 提交 `server.mjs`，填好 description
   - [mcp.so](https://mcp.so) — 登记 RepoScope
   - 官方的 [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) 提 PR

2. **GitHub 仓库本身**
   - 录一段首屏 GIF（`viz.html` 点节点 + 问问题，用 `asciinema` 或 QuickTime 录屏）
   - README 顶部放 Demo GIF + "Works with Claude Code / Cursor / Codex" 徽章
   - Topics 打全：`mcp` `code-analysis` `architecture` `dependency-graph` `tree-sitter` `ollama` `local-first`

3. **首发内容**（第 1 周）
   - Hacker News 标题：`Show HN: RepoScope — a local-first MCP server that lets your agent read any repo`
   - Reddit r/rust + r/programming + r/LocalLLaMA：发同一个 demo
   - 让技术博主"用 RepoScope 拆解 XXX 架构"——这是自带传播内容

4. **前 48 小时盯社区**：回 Issues、合并 PR、在评论区答疑。这步决定能不能接住流量。

> **判定标准**：发上去一周，看**自然星标 + Issues 数量**。有真实反响 → 做可视化面板增强 + HN 引爆；没反响 → 成本就这几个文件，止损无压力。开源热度是跑出来的，不是规划出来的。

---

## 常见坑

| 现象 | 原因 | 处理 |
|------|------|------|
| `node server.mjs` 报 `Cannot find module 'tree-sitter'` | 没装精度模式依赖 | 不装也能跑（正则模式）；想精确就 `npm install` |
| Claude Code 没识别 MCP | `.mcp.json` 路径是相对路径 | 改成 `server.mjs` 的**绝对路径** |
| Action 没回评 PR | 缺 `permissions: pull-requests: write` | 工作流里加上那段 |
| Ollama 问答无反应 | 本地没起 Ollama | `ollama serve` + `ollama pull qwen2.5-coder:7b`；没装会自动降级为结构化上下文 |
