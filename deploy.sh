#!/usr/bin/env bash
# RepoScope 一键部署到 GitHub
#
# 用法（在你自己机器的终端，cd 到本目录后）：
#   GH_TOKEN=ghp_你的token bash deploy.sh
#
# 脚本不硬编码任何凭证，只读取环境变量 GH_TOKEN。
#
# ⚠️ GH_TOKEN 必须是一个【有效】且勾选了 repo(全控) 权限的 Personal Access Token。
#   之前对话里给的那条 token 已被 GitHub 判定为无效(可能已作废),请到
#   GitHub → Settings → Developer settings → Personal access tokens 重新生成一个。
# 部署完成后请立即在 GitHub 撤销并重新生成该 token。
set -e

if [ -z "$GH_TOKEN" ]; then
  echo "缺少 GH_TOKEN。用法：GH_TOKEN=ghp_xxx bash deploy.sh" >&2
  exit 1
fi

cd "$(dirname "$0")"

# 1) git 身份（关联到你 gzcity 账号）
git config user.name "gzcity"
git config user.email "gzcity@users.noreply.github.com"

# 2) 初始化并提交（已提交过则跳过）
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git init
fi
git add -A
git diff --cached --quiet || git commit -m "feat: local-first MCP server for repo understanding

- tree-sitter precise dependency graph (regex fallback, zero-dep)
- blast_radius / ask_repo / summarize_change tools
- incremental cache, GitHub Action PR report, dual-track viz panel"

git branch -M main

# 3) 用 gh 在 gzcity 账号下创建公开仓库并推送（gh 自动读取 GH_TOKEN）
gh repo create reposcope --public --source . --push \
  --description "Local-first code map for AI agents — zero-dependency MCP server that lets Claude Code / Cursor / Codex read any repo."

echo "✅ 已部署到 https://github.com/gzcity/reposcope"
