#!/usr/bin/env node
/**
 * RepoScope analysis core — shared by graph.mjs, server.mjs, and viz.html logic.
 *
 * Dependency extraction uses tree-sitter for precision (re-exports, dynamic
 * imports, path aliases) and falls back to a regex scanner when tree-sitter is
 * not installed, so `node server.mjs` still works with ZERO dependencies.
 *
 * The specifier returned by either extractor is then resolved to a concrete
 * file with language-aware rules (extension + index files, Python packages,
 * Go directories, Rust crate paths). Only in-repo files become graph edges;
 * bare specifiers (react, fmt, os, std…) correctly produce no edge.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.venv', 'target', 'vendor']);

/* ---------------------------------------------------------------- tree-sitter */

let _TS = undefined;          // cached: { Parser, langs } once loaded, or false
let _tsParser = null;          // reused Parser instance

function loadTSLangs() {
  if (_TS !== undefined) return _TS;
  try {
    const Parser = require('tree-sitter');
    const js = require('tree-sitter-javascript');
    const ts = require('tree-sitter-typescript');
    const py = require('tree-sitter-python');
    const go = require('tree-sitter-go');
    const rust = require('tree-sitter-rust');
    _TS = {
      Parser,
      langs: {
        '.js': js, '.jsx': js, '.mjs': js, '.cjs': js,
        '.ts': ts.typescript, '.tsx': ts.tsx,
        '.py': py, '.go': go, '.rs': rust,
      },
    };
  } catch {
    _TS = false;               // tree-sitter not installed → regex fallback
  }
  return _TS;
}

function rawString(n) {
  let frag = null;
  (function w(c) {
    if (c.type === 'string_fragment') { frag = c.text; return true; }
    if (frag === null && /string_literal$/.test(c.type)) frag = c.text.replace(/^["']|["']$/g, '');
    for (let i = 0; i < c.childCount; i++) if (w(c.child(i))) return true;
    return false;
  })(n);
  return frag;
}

function pyFromSpec(n) {
  let rel = '';
  for (let i = 0; i < n.childCount; i++) {
    const c = n.child(i);
    if (c.type === 'relative_import') rel = c.text;   // the module path lives here, e.g. ".sub" / "..sib" / "."
  }
  const dots = (rel.match(/^\.+/) || [''])[0].length;
  const sub = rel.slice(dots).replace(/\./g, '/');     // module name after the dots
  const up = '../'.repeat(Math.max(0, dots - 1));       // 1 dot → cwd, 2 dots → parent, …
  return up + sub;
}

function dynamicImportSpec(n) {
  if (n.child(0) && n.child(0).text === 'import') return rawString(n);
  return null;
}

function tsExtract(ext, src) {
  const ts = loadTSLangs();
  if (!ts) return null;
  if (!_tsParser) _tsParser = new ts.Parser();
  _tsParser.setLanguage(ts.langs[ext]);
  const tree = _tsParser.parse(src);
  const out = new Set();
  const stack = [tree.rootNode];
  while (stack.length) {
    const n = stack.pop();
    const ty = n.type;
    if (ext === '.py') {
      if (ty === 'import_from_statement') { const s = pyFromSpec(n); if (s) out.add(s); }
    } else if (ext === '.go') {
      if (ty === 'import_spec') { const s = rawString(n); if (s && s.startsWith('.')) out.add(s); }
    } else if (ext === '.rs') {
      if (ty === 'use_declaration') {
        const t = n.text.replace(/^use\s+/, '').replace(/;\s*$/, '').replace(/\s+as\s+\w+$/, '');
        if (t && !t.includes('{')) out.add(t);
      }
    } else if (ty === 'import_statement' || ty === 'export_statement') {
      const s = rawString(n); if (s) out.add(s);
    } else if (ty === 'call_expression') {
      const s = dynamicImportSpec(n); if (s) out.add(s);
    }
    for (let i = 0; i < n.childCount; i++) stack.push(n.child(i));
  }
  return out;
}

/* ------------------------------------------------------------------- regex fallback */

function jsRe(src) {
  const out = new Set();
  let m;
  const re = /(?:import|require)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/g;
  while ((m = re.exec(src))) if (m[1].startsWith('.')) out.add(m[1]);
  const re2 = /export\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]/g;
  while ((m = re2.exec(src))) if (m[1].startsWith('.')) out.add(m[1]);
  return out;
}
function pyRe(src) {
  const out = new Set(); const re = /^\s*from\s+(\.\S*)\s+import/gm; let m;
  while ((m = re.exec(src))) out.add(m[1]); return out;
}
function goRe(src) {
  const out = new Set(); const re = /import\s+[^;]*?["'](\.\.?\/[^"']+)["']/g; let m;
  while ((m = re.exec(src))) out.add(m[1]); return out;
}
function rsRe(src) {
  const out = new Set(); const re = /\buse\s+(crate::|super::|self::|\.\.?\/)[^\s;{]+/g; let m;
  while ((m = re.exec(src))) out.add(m[1].replace(/[{};].*$/, '')); return out;
}
const RE_PARSERS = {
  '.js': jsRe, '.jsx': jsRe, '.ts': jsRe, '.tsx': jsRe, '.mjs': jsRe, '.cjs': jsRe,
  '.py': pyRe, '.go': goRe, '.rs': rsRe,
};

/** Extract import specifiers (language-aware). Returns a Set of strings. */
export function scanImports(root, rel, src) {
  const ext = path.extname(rel);
  const ts = tsExtract(ext, src);
  if (ts) return ts;
  const fn = RE_PARSERS[ext];
  return fn ? fn(src) : new Set();
}

/* ------------------------------------------------------------ spec → real file */

function exists(p) { try { return fs.statSync(p).isFile() || fs.statSync(p).isDirectory(); } catch { return false; } }
function firstExisting(root, cands) {
  for (const c of cands) if (exists(path.join(root, c))) return c;
  return null;
}

/**
 * Resolve an import specifier to a repo-relative path (or null if it points
 * outside the repo). Language-aware so `./lib` → `./lib/index.ts`, Python
 * `from .foo` → `foo.py`, Go `./pkg` → the `pkg/` directory, Rust `crate::a::b`
 * → `src/a/b.rs`.
 */
export function resolveSpec(root, fromRel, spec, ext) {
  const dir = path.dirname(fromRel);
  if (ext === '.py') {
    const joined = path.normalize(path.join(dir, spec));
    return firstExisting(root, [joined + '.py', joined + '/__init__.py']);
  }
  if (ext === '.go') {
    if (!spec.startsWith('.')) return null;                 // external package
    const joined = path.normalize(path.join(dir, spec));
    if (exists(path.join(root, joined))) return joined;     // directory package
    return firstExisting(root, [joined + '.go']);
  }
  if (ext === '.rs') {
    if (spec.startsWith('crate::')) {
      const rel = spec.slice(7).replace(/::/g, '/');
      return firstExisting(root, [path.join('src', rel) + '.rs', path.join('src', rel) + '/mod.rs', rel + '.rs', rel + '/mod.rs']);
    }
    if (spec.startsWith('super::') || spec.startsWith('self::') || spec.startsWith('.')) {
      // a file `<dir>/<m>.rs` is a submodule of its directory module, so the
      // first `super::` stays in <dir>; each further `super::` goes up a dir.
      const supers = (spec.match(/super::/g) || []).length;
      let baseDir = spec.startsWith('self::') ? path.join(dir, path.basename(fromRel, '.rs')) : dir;
      for (let i = 0; i < Math.max(0, supers - 1); i++) baseDir = path.dirname(baseDir);
      const rest = spec.replace(/^(?:super::|self::)+/, '').replace(/::/g, '/');
      const joined = path.normalize(path.join(baseDir, rest));
      return firstExisting(root, [joined + '.rs', joined + '/mod.rs']);
    }
    return null;                                            // external crate
  }
  if (!spec.startsWith('.')) return null;                   // bare specifier → node_modules / external
  const joined = path.normalize(path.join(dir, spec));
  if (path.extname(spec)) return exists(path.join(root, joined)) ? joined : null; // spec already has an extension
  return firstExisting(root, [
    joined + ext, joined + '/index' + ext,
    joined + '.js', joined + '/index.js',
    joined + '.ts', joined + '/index.ts',
    joined + '.tsx', joined + '/index.tsx',
  ]);
}

/* --------------------------------------------------------------- graph build */

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (RE_PARSERS[path.extname(e.name)] || loadTSLangs()?.[path.extname(e.name)]) out.push(p);
  }
  return out;
}

const moduleOf = (rel) => {
  const parts = rel.split('/');
  if (parts.length >= 2 && ['packages', 'apps', 'src', 'lib', 'cmd'].includes(parts[0])) return parts[0] + '/' + parts[1];
  return parts.length > 1 ? parts[0] : '(root)';
};

function edgesFrom(root, rel, specs) {
  const mod = moduleOf(rel);
  const set = new Set();
  for (const spec of specs) {
    const target = resolveSpec(root, rel, spec, path.extname(rel));
    if (!target) continue;
    const tmod = moduleOf(target);
    if (tmod !== mod) set.add(JSON.stringify([mod, tmod]));
  }
  return set;
}

/** Build a module-level dependency graph (aggregates files into top-level dirs). */
export function buildGraph(root) {
  root = path.resolve(root);
  const files = walk(root);
  const modFiles = {};
  const edges = new Set();
  for (const f of files) {
    const rel = path.relative(root, f);
    (modFiles[moduleOf(rel)] = modFiles[moduleOf(rel)] || []).push(rel);
    const specs = scanImports(root, rel, fs.readFileSync(f, 'utf8'));
    for (const e of edgesFrom(root, rel, specs)) edges.add(e);
  }
  return {
    root, files: files.length, modules: Object.keys(modFiles),
    moduleFiles: modFiles, edges: [...edges].map(JSON.parse),
  };
}

/**
 * Blast radius: given changed files/modules, compute direct (1 hop) + transitive
 * impact by walking the REVERSE dependency graph (who depends on what changed).
 */
export function blastRadius(graph, changed) {
  const toMod = (x) => {
    const parts = x.split('/');
    if (parts.length >= 2 && ['packages', 'apps', 'src', 'lib', 'cmd'].includes(parts[0])) return parts[0] + '/' + parts[1];
    return parts.length > 1 ? parts[0] : x;
  };
  const seeds = new Set(changed.map(toMod));
  const rev = {};
  for (const [a, b] of graph.edges) (rev[b] = rev[b] || []).push(a);
  const dist = {};
  const q = [...seeds];
  seeds.forEach((s) => (dist[s] = 0));
  while (q.length) {
    const c = q.shift();
    for (const u of rev[c] || []) if (dist[u] === undefined) { dist[u] = dist[c] + 1; q.push(u); }
  }
  const impacted = Object.entries(dist).filter(([, v]) => v >= 1);
  return {
    changed: [...seeds],
    direct: impacted.filter(([, v]) => v === 1).map(([k]) => k),
    transitive: impacted.filter(([, v]) => v > 1).map(([k]) => k),
  };
}

/**
 * Incremental analysis — reuses a per-file import cache so only changed/new
 * files are re-parsed. Powers sub-second re-runs on large repos.
 *
 * Cache shape (JSON at <root>/.reposcope-cache.json):
 *   { version, files: { [relPath]: { hash, imports: string[] } } }
 * `hash` is an md5 of file content; `imports` are the resolved relative specs.
 */
const CACHE_VERSION = 3;
export const CACHE_NAME = '.reposcope-cache.json';

function hashBuf(buf) { return crypto.createHash('md5').update(buf).digest('hex'); }
function loadCache(cachePath) {
  try {
    const c = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (c && c.version === CACHE_VERSION) return c;
  } catch { /* cold cache */ }
  return { version: CACHE_VERSION, files: {} };
}

/**
 * Build a module graph, reusing cached import results for unchanged files.
 * Writes the refreshed cache back to disk. Returns the same graph shape as
 * buildGraph plus a `cache` stats block.
 */
export function buildGraphIncremental(root, cachePath = path.join(path.resolve(root), CACHE_NAME)) {
  root = path.resolve(root);
  const cache = loadCache(cachePath);
  const prev = cache.files || {};
  const files = walk(root);
  const moduleFiles = {};
  const edges = new Set();
  const nextFiles = {};
  let scanned = 0, reused = 0;

  for (const f of files) {
    const rel = path.relative(root, f);
    const buf = fs.readFileSync(f);
    const h = hashBuf(buf);
    let specs;
    if (prev[rel] && prev[rel].hash === h) { specs = prev[rel].imports; reused++; }
    else { specs = [...scanImports(root, rel, buf.toString('utf8'))]; scanned++; }
    nextFiles[rel] = { hash: h, imports: specs };
    (moduleFiles[moduleOf(rel)] = moduleFiles[moduleOf(rel)] || []).push(rel);
    for (const e of edgesFrom(root, rel, specs)) edges.add(e);
  }
  cache.files = nextFiles;                     // dropped files vanish automatically
  fs.writeFileSync(cachePath, JSON.stringify(cache));

  return {
    root, files: files.length, modules: Object.keys(moduleFiles),
    moduleFiles, edges: [...edges].map(JSON.parse),
    cache: { path: cachePath, scanned, reused,
             hit: files.length ? Math.round((reused / files.length) * 100) : 0 },
  };
}

/** Trace what a module (transitively) depends on, by depth. */
export function tracePath(graph, entry) {
  const toMod = (x) => (x.includes('/') ? x.split('/')[0] : x);
  const start = toMod(entry);
  const adj = {};
  for (const [a, b] of graph.edges) (adj[a] = adj[a] || []).push(b);
  const seen = new Set();
  const out = [];
  const stack = [[start, 0]];
  while (stack.length) {
    const [c, d] = stack.pop();
    if (seen.has(c)) continue;
    seen.add(c);
    out.push({ module: c, depth: d });
    for (const n of adj[c] || []) stack.push([n, d + 1]);
  }
  return out;
}

/**
 * Collect source text for the given modules (used to ground an LLM prompt).
 * Reads each file under `root`, tags it with `// file: <rel>`, and stops once
 * `maxBytes` is reached so the prompt stays bounded. Returns a single string.
 */
export function collectSources(root, graph, modules, maxBytes = 16000) {
  root = path.resolve(root);
  const out = [];
  let used = 0;
  for (const mod of modules) {
    const files = (graph.moduleFiles && graph.moduleFiles[mod]) || [];
    for (const rel of files) {
      if (used >= maxBytes) break;
      try {
        const code = fs.readFileSync(path.join(root, rel), 'utf8');
        const chunk = `\n// file: ${rel}\n` + code;
        const room = maxBytes - used;
        out.push(chunk.slice(0, room));
        used += Math.min(chunk.length, room);
      } catch { /* unreadable — skip */ }
    }
    if (used >= maxBytes) break;
  }
  return out.join('\n');
}

/** True when tree-sitter grammars are available (precision mode). */
export function usingTreeSitter() { return loadTSLangs() !== false; }
