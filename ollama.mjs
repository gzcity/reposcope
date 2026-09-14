/**
 * Ollama adapter — zero-dependency local LLM bridge.
 *
 * Talks to a locally-running Ollama via its native HTTP API using only
 * Node's built-in fetch. No npm install, no API key, nothing leaves the
 * machine. `isAvailable()` lets callers gracefully degrade when no local
 * model is running.
 *
 * Env:
 *   OLLAMA_HOST       default http://localhost:11434
 *   REPOSCOPE_MODEL   default qwen2.5-coder:7b
 */
const BASE = process.env.OLLAMA_HOST || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.REPOSCOPE_MODEL || 'qwen2.5-coder:7b';

/** True if a local Ollama daemon answers /api/tags. */
export async function isAvailable() {
  try {
    const r = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

/** One-shot completion against Ollama /api/generate (stream:false). */
export async function generate(prompt, { model = DEFAULT_MODEL, system } = {}) {
  const body = { model, prompt, stream: false };
  if (system) body.system = system;
  const r = await fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) throw new Error(`ollama ${r.status}: ${await r.text().catch(() => '')}`);
  const j = await r.json();
  return (j.response || '').trim();
}

/* ---------- prompt constructors (pure, easy to unit-test) ---------- */

export function buildRepoPrompt(question, sources) {
  return [
    'You are a senior engineer explaining a codebase to a teammate.',
    'Use ONLY the source files below. Cite file paths. If the files do',
    'not contain the answer, say so plainly — do not invent code.\n',
    '--- relevant source ---',
    sources,
    '--- end source ---\n',
    `Question: ${question}\n`,
    'Answer concisely and structurally.',
  ].join('\n');
}

export function buildChangeSummaryPrompt(changed, radius, sources) {
  const direct = radius.direct.join(', ') || 'none';
  const transitive = radius.transitive.join(', ') || 'none';
  return [
    `A pull request changed these file(s): ${changed.join(', ') || 'none'}.`,
    `Directly impacted modules (1 hop): ${direct}.`,
    `Transitively impacted modules: ${transitive}.\n`,
    '--- relevant source ---',
    sources,
    '--- end source ---\n',
    'Write a 3-5 sentence summary of what this change affects and why',
    'reviewers should pay attention. Be specific and cite file paths.',
  ].join('\n');
}
