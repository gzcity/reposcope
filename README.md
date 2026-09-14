# RepoScope

> A local-first MCP server that lets your coding agent read any GitHub repo — no API key, no upload, one command.

[![Stars](https://img.shields.io/github/stars/yourname/reposcope?style=flat-square)](https://github.com/yourname/reposcope/stargazers)
[![License](https://img.shields.io/github/license/yourname/reposcope?style=flat-square)](LICENSE)
[![Local-first](https://img.shields.io/badge/privacy-local--first-green?style=flat-square)](#)
[![MCP](https://img.shields.io/badge/protocol-MCP-blue?style=flat-square)](#)
[![Works with Claude Code](https://img.shields.io/badge/works%20with-Claude%20Code-ff6b6b?style=flat-square)](#)
[![Works with Cursor](https://img.shields.io/badge/works%20with-Cursor-4f9dff?style=flat-square)](#)

GitDiagram shows you the map. **RepoScope lets your agent use it.** Plug it into Claude Code, Cursor, or Codex and let your agent clone, analyze, and navigate any repository — entirely on your machine.

## Why

AI coding agents are blind to unfamiliar codebases. Cloud diagram tools (GitDiagram) need an API key, bill per use, and upload your code. RepoScope is a **local MCP server**: your agent calls it like any other tool, the analysis runs locally, and nothing leaves your machine.

## Install & connect (one command)

```bash
# Start the MCP server
npx reposcope --mcp
```

Add it to your agent's MCP config (e.g. Claude Code `.mcp.json`):

```json
{
  "mcpServers": {
    "reposcope": { "command": "npx", "args": ["reposcope", "--mcp"] }
  }
}
```

Then just ask: *"Help me understand the rendering flow of facebook/react."* — your agent calls RepoScope's tools automatically.

## Tools exposed

| Tool | What it does |
|------|--------------|
| `clone_repo` | Clone any GitHub repo into a local sandbox |
| `analyze_dependencies` | Extract a module dependency graph (incremental cache → fast re-runs) |
| `get_module_files` | List files + summaries for a module |
| `search_symbol` | Symbol / string search across the repo |
| `explain_flow` | Explain a call/render flow from the dependency graph |
| `onboarding_path` | Generate a new-contributor onboarding route (Markdown) |
| `blast_radius` | Given changed files, compute direct (1-hop) + transitive blast radius |
| `ask_repo` | Natural-language Q&A over the repo — gathers relevant source and answers via a **local Ollama model** (falls back to structured context) |
| `summarize_change` | Natural-language impact summary of changed files (blast radius + local LLM) — ideal as a PR summary |

## Incremental analysis & caching

Re-runs are sub-second on large repos. RepoScope caches a per-file import
result keyed by content hash (`.reposcope-cache.json`). On the next run only
changed/new files are re-parsed; everything else is reused. Both the CLI and
the MCP server use it transparently:

```bash
node graph.mjs /path/to/repo --incremental
# → { ..., "cache": { "scanned": 3, "reused": 1280, "hit": 99 } }
```

## Dependency analysis — tree-sitter precision

RepoScope extracts imports with **tree-sitter** AST parsing for four languages
(JavaScript / TypeScript, Python, Go, Rust). That beats a regex scanner on the
cases that actually matter for a dependency graph:

| Case | tree-sitter | regex |
|------|-------------|-------|
| Dynamic `import('./x')` | ✅ caught | ❌ missed |
| Re-exports `export * from './y'` | ✅ caught | ⚠️ partial |
| Extension-less / `index.*` resolution | ✅ `./lib` → `lib/index.ts` | ❌ missed |
| Go directory packages (`./pkg`) | ✅ directory node | ❌ missed |
| Rust `crate::` / `super::` paths | ✅ crate-aware | ❌ missed |
| External specifiers (`react`, `fmt`, `os`, `std`) | ✅ no false edge | ⚠️ risky |

**Zero-dependency fallback.** tree-sitter is an *optional* dependency. If it is
not installed, RepoScope transparently falls back to a built-in regex scanner, so
`node server.mjs` / `node graph.mjs` still run with **no `npm install`** at all:

```bash
npm install            # optional: upgrades to tree-sitter precision mode
npm install --omit=optional   # or skip it entirely → regex fallback
```

The two modes share the same language-aware resolver, so external packages never
become false in-repo edges either way.

## GitHub Action — PR architecture impact

Drop a live dependency-impact report on every PR. The action diffs the PR
against its base, builds the module graph incrementally, computes the blast
radius of the changed modules, and posts a comment.

```yaml
# .github/workflows/reposcope.yml
name: RepoScope Impact
on: [pull_request]
permissions: { pull-requests: write, contents: read }
jobs:
  reposcope:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: your-org/reposcope@v1   # or `uses: ./` for a repo-local action
        with: { token: "${{ secrets.GITHUB_TOKEN }}" }
```

> Zero additional dependencies — the action runner posts the comment via the
> GitHub REST API from Node's standard library, so there is nothing to `npm install`.

## Natural-language answers (local LLM)

RepoScope can answer questions about a repo in plain English. It gathers the
relevant source via the dependency graph and sends it to a **locally-running
Ollama** model — still no API key, still nothing uploaded.

```bash
ollama pull qwen2.5-coder:7b     # one-time
# then ask your agent, or call the tool directly:
#   ask_repo({ question: "what is the render flow?", path: "." })
#   summarize_change({ changed_files: ["src/foo.ts"] })
```

If no local model is running, `ask_repo` / `summarize_change` **degrade
gracefully** to a structured, hallucination-free context block (module list +
dependency edges) instead of failing. The same applies to the GitHub Action:
self-hosted runners with Ollama get an AI-written PR summary; cloud runners fall
back to the static impact list.

```js
import { isAvailable, generate, buildRepoPrompt } from 'reposcope/ollama.mjs';
if (await isAvailable()) console.log(await generate(buildRepoPrompt(q, sources)));
```

## How it works

```
Claude Code / Cursor / Codex  ──MCP(stdio)──▶  RepoScope Server (Node)
                                                      │
                                              tree-sitter analysis (local, zero upload)
                                                      │
                                              optional React Flow visual panel
```

- **MCP layer**: stdio transport (no SDK dependency required to run)
- **Analysis**: tree-sitter AST parsing (JS/TS, Python, Go, Rust) with a zero-dependency regex fallback — same language-aware resolver either way
- **Local-first**: default Ollama for summaries; code never leaves your machine
- **Dual-track**: same analysis can render as a human-viewable graph

## Roadmap

- [x] MCP server skeleton + 9 tools (incl. `blast_radius`, `ask_repo`, `summarize_change`)
- [x] Incremental analysis & `.reposcope-cache.json` (CLI + MCP)
- [x] Dual-track visual panel (`viz.html`)
- [x] GitHub Action — PR architecture-impact report
- [x] Local LLM (Ollama) Q&A + graceful fallback
- [x] tree-sitter precision engine (JS/TS/Python/Go/Rust) + zero-dep regex fallback
- [ ] Private-repo + token support
- [ ] Extra languages (Java, C#, Ruby) + LSP-based call graphs
- [ ] VS Code extension

## Contributing

See [DESIGN.md](DESIGN.md) for the full plan. Issues and PRs welcome.

## License

Apache-2.0
