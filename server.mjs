#!/usr/bin/env node
/**
 * RepoScope — local-first MCP server (zero-dependency MVP)
 *
 * Exposes 6 tools so a coding agent (Claude Code / Cursor / Codex) can read
 * any GitHub repo locally. No API key, no upload. Pure Node stdlib.
 *
 * Run:   node server.mjs
 * Wire:  add to your agent's .mcp.json:
 *        { "mcpServers": { "reposcope": { "command": "node",
 *          "args": ["/abs/path/server.mjs"] } } }
 *
 * NOTE: MVP uses regex import-scanning. Production swaps in tree-sitter.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph, buildGraphIncremental, blastRadius, collectSources } from './analyze.mjs';
import { isAvailable, generate, buildRepoPrompt, buildChangeSummaryPrompt } from './ollama.mjs';

const ROOT = process.cwd();

/* ---------- MCP transport (JSON-RPC over stdio, newline-delimited) ---------- */
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) handle(line);
  }
});
const send = (o) => process.stdout.write(JSON.stringify(o) + '\n');

function handle(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method } = msg;
  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'reposcope', version: '0.1.0' },
    }});
  } else if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  } else if (method === 'tools/call') {
    toolCall(id, msg.params);
  }
  // notifications (e.g. initialized) are ignored
}

/* ---------- tool definitions ---------- */
const TOOLS = [
  { name: 'clone_repo', description: 'Clone a GitHub repo into a local sandbox.',
    inputSchema: { type: 'object', properties: { repo_url: { type: 'string' } }, required: ['repo_url'] } },
  { name: 'analyze_dependencies', description: 'Scan a local repo and return a module dependency graph (JSON).',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'get_module_files', description: 'List files (+ short summary) for a given module/dir.',
    inputSchema: { type: 'object', properties: { module: { type: 'string' } }, required: ['module'] } },
  { name: 'search_symbol', description: 'Search for a symbol/string across the analyzed repo.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'explain_flow', description: 'Explain a call/render flow starting from an entrypoint, using the dep graph.',
    inputSchema: { type: 'object', properties: { entrypoint: { type: 'string' } }, required: ['entrypoint'] } },
  { name: 'onboarding_path', description: 'Generate a new-contributor onboarding route as Markdown.',
    inputSchema: { type: 'object', properties: { repo: { type: 'string' } }, required: ['repo'] } },
  { name: 'blast_radius', description: 'Given changed files, compute direct (1-hop) + transitive blast radius via the dependency graph.',
    inputSchema: { type: 'object', properties: { changed_files: { type: 'array' }, path: { type: 'string' } }, required: ['changed_files'] } },
  { name: 'ask_repo', description: 'Ask a natural-language question about a repo; RepoScope gathers relevant source and answers via a local Ollama model (falls back to structured context if no model is running).',
    inputSchema: { type: 'object', properties: { question: { type: 'string' }, path: { type: 'string' }, modules: { type: 'array' } }, required: ['question'] } },
  { name: 'summarize_change', description: 'Summarize the impact of changed files in natural language (blast radius + local LLM). Works great as a PR summary.',
    inputSchema: { type: 'object', properties: { changed_files: { type: 'array' }, path: { type: 'string' } }, required: ['changed_files'] } },
];

/* ---------- helpers ---------- */
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);
const CODE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (CODE_EXT.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

function scanImports(file) {
  const src = fs.readFileSync(file, 'utf8');
  const deps = new Set();
  const re = /(?:import|require)\b[^;]*?from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue; // only local deps for the graph
    deps.add(spec);
  }
  return [...deps];
}

/* ---------- tool implementations ---------- */
async function toolCall(id, params = {}) {
  let text = '';
  try {
    switch (params.name) {
      case 'clone_repo': {
        const url = params.arguments.repo_url;
        const name = url.split('/').pop().replace(/\.git$/, '');
        const r = spawnSync('git', ['clone', '--depth', '1', url, name], { cwd: ROOT, encoding: 'utf8' });
        text = r.status === 0 ? `Cloned into ./${name} (${walk(path.join(ROOT, name)).length} code files).`
                              : `Clone failed:\n${r.stderr || r.stdout}`;
        break;
      }
      case 'analyze_dependencies': {
        const dir = path.resolve(ROOT, params.arguments.path || '.');
        const g = buildGraphIncremental(dir);
        const edges = g.edges.length;
        const c = g.cache;
        text = `Analyzed ${g.files} files (${edges} module edges) in ${dir}.\n` +
               `Incremental cache: scanned ${c.scanned} new/changed, reused ${c.reused} cached ` +
               `(${c.hit}% hit).\n\n` +
               JSON.stringify(g.edges, null, 2).slice(0, 4000);
        break;
      }
      case 'get_module_files': {
        const mod = path.resolve(ROOT, params.arguments.module || '.');
        const files = fs.existsSync(mod) && fs.statSync(mod).isDirectory()
          ? fs.readdirSync(mod).slice(0, 50) : ['(not a directory)'];
        text = `Files in ${params.arguments.module}:\n` + files.map((f) => `- ${f}`).join('\n');
        break;
      }
      case 'search_symbol': {
        const q = params.arguments.query;
        const hits = [];
        for (const f of walk(ROOT)) {
          const lines = fs.readFileSync(f, 'utf8').split('\n');
          lines.forEach((l, i) => { if (l.includes(q)) hits.push(`${path.relative(ROOT, f)}:${i + 1}`); });
          if (hits.length > 40) break;
        }
        text = hits.length ? `Found "${q}" in ${hits.length} places:\n` + hits.join('\n')
                           : `No matches for "${q}".`;
        break;
      }
      case 'explain_flow': {
        const ep = params.arguments.entrypoint;
        text = `Flow from "${ep}" (heuristic):\n` +
               `1. Resolve ${ep}\n2. Trace local imports transitively\n` +
               `3. Identify leaf utilities vs entry points\n` +
               `(Full graph resolution is wired in analyze_dependencies; this MVP summarizes the entry.)`;
        break;
      }
      case 'onboarding_path': {
        const repo = params.arguments.repo || 'this repo';
        text = `# Onboarding path for ${repo}\n\n` +
               `1. Read README & top-level dirs\n2. Run \`analyze_dependencies\` to see the module graph\n` +
               `3. Open the 2-3 most-connected modules first\n4. Use \`search_symbol\` to follow a feature end-to-end`;
        break;
      }
      case 'blast_radius': {
        const changed = params.arguments.changed_files || [];
        const dir = path.resolve(ROOT, params.arguments.path || '.');
        const g = buildGraphIncremental(dir);
        const r = blastRadius(g, changed);
        const c = g.cache;
        text = `Blast radius for ${changed.length} changed file(s) in ${dir}:\n` +
               `• Directly impacted (1 hop): ${r.direct.join(', ') || 'none'}\n` +
               `• Transitively impacted: ${r.transitive.join(', ') || 'none'}\n` +
               `(cache: ${c.hit}% hit, ${c.scanned} re-scanned)`;
        break;
      }
      case 'ask_repo': {
        const dir = path.resolve(ROOT, params.arguments.path || '.');
        const g = buildGraphIncremental(dir);
        const mods = (params.arguments.modules && params.arguments.modules.length)
          ? params.arguments.modules
          : Object.entries(g.moduleFiles).sort((a, b) => b[1].length - a[1].length)
              .slice(0, 3).map(([m]) => m);
        const sources = collectSources(dir, g, mods);
        const q = params.arguments.question || '(explain this repository)';
        if (await isAvailable()) {
          text = await generate(buildRepoPrompt(q, sources));
        } else {
          text = `Local LLM (Ollama) not running — returning structured context instead.\n` +
                 `Modules in scope: ${mods.join(', ')}\n` +
                 `Module edges: ${JSON.stringify(g.edges).slice(0, 3000)}\n` +
                 `(Start Ollama with a code model to get natural-language answers.)`;
        }
        break;
      }
      case 'summarize_change': {
        const changed = params.arguments.changed_files || [];
        const dir = path.resolve(ROOT, params.arguments.path || '.');
        const g = buildGraphIncremental(dir);
        const r = blastRadius(g, changed);
        const mods = [...new Set([...r.changed, ...r.direct, ...r.transitive])]
          .filter((m) => g.moduleFiles[m]);
        const sources = collectSources(dir, g, mods);
        if (await isAvailable()) {
          text = await generate(buildChangeSummaryPrompt(changed, r, sources));
        } else {
          text = `Impact summary (Ollama unavailable — structured fallback):\n` +
                 `Changed: ${changed.join(', ') || 'none'}\n` +
                 `Directly impacted: ${r.direct.join(', ') || 'none'}\n` +
                 `Transitively impacted: ${r.transitive.join(', ') || 'none'}`;
        }
        break;
      }
      default:
        text = `Unknown tool: ${params.name}`;
    }
  } catch (e) {
    text = `Error: ${e.message}`;
  }
  send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
}

process.stderr.write('reposcope MCP server ready (stdio)\n');
