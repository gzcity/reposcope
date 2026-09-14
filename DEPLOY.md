# DEPLOY — 把 RepoScope 推到你的 GitHub

目标：在 GitHub 上拥有一个公开的 `reposcope` 仓库，别人能 `star` / `clone` / 接 MCP。
下面命令在你**本地终端**跑（或沙箱 Bash 恢复后跑）。推送需要你的 GitHub 账号凭证，必须由你执行。

---

## 1. 前置（一次）

```bash
# 装 git（装过跳过）
# macOS:  brew install git
# Ubuntu: sudo apt install git

# 配置身份（email 用你 GitHub 注册邮箱，否则贡献不算你的）
git config --global user.name  "你的名字"
git config --global user.email "you@example.com"
```

确认项目文件齐全（这些都会进仓库）：

```
RepoScope/
├── server.mjs            # MCP server（9 个工具）
├── graph.mjs             # CLI：依赖图 / --blast / --incremental
├── analyze.mjs           # 分析引擎（tree-sitter 精确 + 正则回退）
├── ollama.mjs            # 本地 LLM 适配器（零依赖）
├── action.yml            # GitHub Action 定义
├── action-runner.mjs     # Action 运行脚本（零依赖贴 PR 评论）
├── viz.html              # 人类可视面板（含 react 示例）
├── index.html            # 项目介绍原型页
├── README.md             # 英文开源说明
├── DESIGN.md             # 设计 / 路线图
├── QUICKSTART.md         # 使用指南
├── .mcp.json             # Claude Code / Cursor 接入模板
├── .gitignore            # 已忽略 node_modules / 缓存 / 报告
├── package.json          # type:module，tree-sitter 在 optionalDependencies
└── .github/workflows/reposcope.yml   # 示例 PR 工作流
```

---

## 2. 方案一：`gh` CLI 一行建仓并推送（最省事）

```bash
cd /workspace/RepoScope        # 或你放下项目的位置

# 先登录（会开浏览器让你授权 GitHub 账号）
gh auth login

# 一条命令：建公开仓库 + 提交 + 推送
gh repo create reposcope --public --source . --push --description "Local-first code map for AI agents — a zero-dependency MCP server that lets Claude Code / Cursor / Codex read any repo."
```

完事。仓库在 `https://github.com/<你>/reposcope`。

---

## 3. 方案二：网页建仓 + 手动推送（不用 gh）

1. 打开 https://github.com/new
2. Repository name 填 `reposcope`，选 **Public**
3. **不要**勾 "Add a README / .gitignore / LICENSE"（我们已经有了）
4. 点 **Create repository**，复制它的 URL（形如 `https://github.com/<你>/reposcope.git`）

然后本地：

```bash
cd /workspace/RepoScope

git init
git add -A                      # .gitignore 会自动排除 node_modules 等
git commit -m "feat: local-first MCP server for repo understanding

- tree-sitter precise dependency graph (regex fallback, zero-dep)
- blast_radius / ask_repo / summarize_change tools
- incremental cache, GitHub Action PR report, viz panel"

git branch -M main
git remote add origin https://github.com/<你>/reposcope.git
git push -u origin main
```

---

## 4. 验证

```bash
# 打开仓库主页
open https://github.com/<你>/reposcope     # macOS
xdg-open https://github.com/<你>/reposcope # Linux

# 本地克隆回来的自测
git clone https://github.com/<你>/reposcope.git /tmp/check && cd /tmp/check
node graph.mjs . --incremental
```

看到模块依赖图正常输出，部署就成功了。

---

## 5. 可选：让 demo 网页能被直接点开

`viz.html` 是纯静态页。想让人不下载也能玩：

1. 仓库 **Settings → Pages**
2. Source 选 `main` / `/root`，Save
3. 等一两分钟，访问 `https://<你>.github.io/reposcope/viz.html`

（注意：仓库根 `index.html` 不是真实文档，是介绍原型；Pages 默认会显示它。可在 Pages 里指定 `viz.html`，或把 `index.html` 换成真实 landing。）

---

## 常见坑

| 现象 | 原因 | 处理 |
|------|------|------|
| `git push` 报权限错 | 没登录 / 用了 HTTPS 没令牌 | `gh auth login`，或改用 SSH key |
| 贡献不显示你的头像 | commit email 与 GitHub 不符 | `git config user.email` 改成注册邮箱，重新 commit |
| `node_modules` 被传上去 | `.gitignore` 没生效 | 确认 `.gitignore` 在仓库根且含 `node_modules/`；已传就 `git rm -r --cached node_modules` |
| 推了空仓库 | 忘了 `git add -A` 先 commit | 按方案二顺序来 |
