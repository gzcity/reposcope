#!/usr/bin/env node
/**
 * RepoScope graph CLI — module-level dependency graph + blast radius.
 * Zero deps (uses analyze.mjs core).
 *
 *   node graph.mjs /path/to/repo                 # print module graph JSON (full scan)
 *   node graph.mjs /path/to/repo --incremental   # reuse .reposcope-cache.json (fast re-runs)
 *   node graph.mjs /path/to/repo --blast packages/core/index.mjs   # blast radius
 *   node graph.mjs /path/to/repo --incremental --blast packages/core/index.mjs
 */
import { buildGraph, buildGraphIncremental, blastRadius } from './analyze.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positionals = args.filter((a) => !a.startsWith('--'));
const root = positionals[0] || '.';

const isBlast = flags.has('--blast');
const changed = isBlast
  ? args.slice(args.indexOf('--blast') + 1).filter((a) => !a.startsWith('--'))
  : [];

const useCache = flags.has('--incremental') || flags.has('--cache');
const g = useCache ? buildGraphIncremental(root) : buildGraph(root);

if (isBlast) {
  console.log(JSON.stringify(blastRadius(g, changed), null, 2));
} else {
  const out = { ...g };
  if (g.cache) out.cache = g.cache;
  console.log(JSON.stringify(out, null, 2));
}
