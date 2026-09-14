# RepoScope 发布文案合集

仓库推到 GitHub 后,用下面这些文案去各渠道发。全部基于项目**真实能力**,不夸大。
仓库地址已定为 https://github.com/gzcity/reposcope(下文 `gzcity` 已统一替换为 `gzcity`)。

---

## 1. Hacker News — Show HN

**标题**
```
Show HN: RepoScope – a local-first MCP server that lets your coding agent read any repo
```

**正文**
```
RepoScope is a zero-dependency MCP server that gives Claude Code / Cursor / Codex a
real, grounded understanding of any codebase — locally, with no API key and no code upload.

Instead of hand-maintaining a repo map or pasting files into chat, your agent just calls
RepoScope's tools:

  • analyze_dependencies – tree-sitter dependency graph (falls back to regex if
    tree-sitter isn't installed, so it runs with zero `npm install`)
  • blast_radius – given changed files, computes direct (1-hop) + transitive impact
  • ask_repo / summarize_change – grounded Q&A via a local Ollama model
  • onboarding_path, explain_flow, search_symbol, get_module_files, clone_repo

It caches analysis per repo (incremental; ~100% hit on re-runs) and ships a GitHub
Action that comments the architecture impact on every PR.

GitDiagram shows you the map. RepoScope lets your agent use it.

Try it: clone + `node server.mjs`, then add it to Claude Code in one line.
```

---

## 2. Reddit

### r/programming
**标题**: RepoScope: a local-first MCP server that lets your coding agent actually read a codebase
**正文**:
```
Most "repo map" tools either upload your code to the cloud or make you maintain the map
by hand. RepoScope is an MCP server your agent calls: it builds a tree-sitter dependency
graph locally (regex fallback, zero deps), computes blast radius for changed files, and
can answer questions via a local Ollama model. There's also a GitHub Action that posts the
architecture impact on every PR.

Repo + docs: https://github.com/gzcity/reposcope
```

### r/LocalLLaMA
**标题**: Run your repo-understanding agent fully local — RepoScope + Ollama, no API key
**正文**:
```
If you want your coding agent to understand a codebase without sending anything to a
third-party API, RepoScope is an MCP server that does the analysis locally. Its
ask_repo / summarize_change tools are grounded on the real dependency graph and answered
by a local Ollama model (e.g. qwen2.5-coder). No key, no upload. Plays nice with Claude
Code / Cursor / Codex.

https://github.com/gzcity/reposcope
```

### r/selfhosted
**标题**: Self-hosted repo map for AI agents — zero cloud, zero API key
**正文**: 同上,强调"代码不出本机 + 可私有部署",贴品库链接。

---

## 3. smithery.ai 提交

| 字段 | 值 |
|------|----|
| Server name | `reposcope` |
| Display name | RepoScope |
| Description | Local-first code map for AI agents — zero-dependency MCP server that lets Claude Code / Cursor / Codex read any repo (dependency graph, blast radius, local LLM Q&A). |
| Server command | `node` |
| Args | `/abs/path/reposcope/server.mjs` |
| Tags | `mcp`, `code-analysis`, `architecture`, `dependency-graph`, `tree-sitter`, `ollama`, `local-first` |
| README 摘录 | 直接贴仓库 README 的 "Features" 与 "Quick start" 两段 |

注:smithery 走 stdio MCP,`server.mjs` 已符合协议,无需改。

---

## 4. GitHub Release（第一次发版用 v0.2.0）

```
## What's RepoScope
A local-first MCP server that gives your coding agent a real understanding of any codebase.
Zero API key. Zero upload. Zero hard dependencies.

## Features
- tree-sitter dependency graph (regex fallback when tree-sitter isn't installed)
- blast_radius: direct + transitive impact for changed files
- ask_repo / summarize_change: grounded Q&A via local Ollama
- incremental cache (~100% hit on re-runs)
- GitHub Action: architecture-impact comment on every PR
- dual-track viz panel (viz.html)

## Quick start
node server.mjs
# add to Claude Code:
claude mcp add reposcope -- node /abs/path/reposcope/server.mjs

## Links
- Docs: README.md / QUICKSTART.md / DEPLOY.md
- Demo: open viz.html
```

---

## 5. 短帖（X / Mastodon / LinkedIn）

**X / Mastodon**
```
GitDiagram shows you the map. RepoScope lets your agent *use* it.

A zero-dependency, local-first MCP server that gives Claude Code / Cursor / Codex a
real dependency graph + blast radius for any repo. No API key, no upload.

https://github.com/gzcity/reposcope
```

**LinkedIn**
同上,加一句"适合做代码审查前置、新人 onboarding、私有代码库分析"。
```
