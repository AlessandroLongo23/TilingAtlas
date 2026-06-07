#!/usr/bin/env node
// scripts/status.mjs — DERIVED current-state view. Not hand-authored, so it cannot go stale and
// two agents cannot collide on it. Run: `pnpm status` (or `node scripts/status.mjs`).
//
// Reads the ledgers + live git facts and prints them. The ONE hand-curated input is docs/NEXT.md
// (one line per party). Everything else is computed fresh each run. Zero dependencies.
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // TilingAtlas/
const sh = (cmd) => {
  try { return execSync(cmd, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
};
const tty = process.stdout.isTTY;
const P = { b: '\x1b[1m', dim: '\x1b[2m', y: '\x1b[33m', g: '\x1b[32m', r: '\x1b[31m', x: '\x1b[0m' };
const c = (k, s) => (tty ? P[k] + s + P.x : s);

const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
console.log(c('b', '── TilingAtlas STATUS ') + c('dim', `(derived ${now} — re-run \`pnpm status\`)`));

// ── git head / branch / push state ────────────────────────────────────────────
const branch = sh('git rev-parse --abbrev-ref HEAD') || '?';
const head = sh('git rev-parse --short HEAD');
console.log('\n' + c('b', 'git ') + ` on ${branch} @ ${head}`);
const ab = sh(`git rev-list --left-right --count origin/${branch}...HEAD`);
if (ab) {
  const [behind, ahead] = ab.split(/\s+/);
  const note = (+ahead > 0 ? c('y', `  ${ahead} ahead → unpushed`) : c('g', '  in sync')) + (+behind > 0 ? c('y', `, ${behind} behind`) : '');
  console.log('     origin:' + note);
}
const wts = sh('git worktree list').split('\n').filter(Boolean);
if (wts.length > 1) {
  console.log('     worktrees (ongoing — leave alone):');
  for (const w of wts.slice(1)) console.log('       ' + w.replace(REPO, '.'));
}

// ── thesis \describedcommit drift ─────────────────────────────────────────────
const mainTex = join(REPO, '..', 'thesis', 'main.tex');
if (existsSync(mainTex)) {
  const m = readFileSync(mainTex, 'utf8').match(/\\describedcommit\}\{\\texttt\{([0-9a-f]+)\}/);
  if (m) {
    const dc = m[1];
    const known = sh(`git cat-file -e ${dc}^{commit} && echo ok`) === 'ok';
    if (!known) console.log('\n' + c('y', 'thesis ') + ` \\describedcommit ${dc} not found in this repo`);
    else {
      const anc = sh(`git merge-base --is-ancestor ${dc} HEAD && echo yes`) === 'yes';
      const n = sh(`git rev-list --count ${dc}..HEAD`);
      if (!anc) console.log('\n' + c('r', 'thesis ') + ` \\describedcommit ${dc} is NOT an ancestor of HEAD (?!)`);
      else if (+n > 0) console.log('\n' + c('y', 'thesis ') + ` \\describedcommit ${dc} → ` + c('y', `${n} commits behind HEAD`) + c('dim', ' (re-anchor when chapters land)'));
      else console.log('\n' + c('g', 'thesis ') + ` \\describedcommit in sync with HEAD`);
    }
  }
}

// ── NEXT (the one curated input) ──────────────────────────────────────────────
const nextF = join(REPO, 'docs', 'NEXT.md');
if (existsSync(nextF)) {
  console.log('\n' + c('b', 'NEXT ') + c('dim', '(docs/NEXT.md — curated, one line per party)'));
  const body = readFileSync(nextF, 'utf8').split('\n').filter((l) => /^\s*[-*]\s/.test(l));
  for (const l of body) console.log('  ' + l.replace(/^\s*[-*]\s*/, '• '));
}

// ── recent SYNC handoffs ──────────────────────────────────────────────────────
const syncF = join(REPO, 'docs', 'SYNC.md');
if (existsSync(syncF)) {
  const heads = readFileSync(syncF, 'utf8').split('\n').filter((l) => /^\*\*\d{4}-\d{2}-\d{2} — /.test(l));
  console.log('\n' + c('b', 'SYNC ') + c('dim', `last ${Math.min(5, heads.length)} of ${heads.length} handoffs (docs/SYNC.md)`));
  for (const l of heads.slice(-5)) {
    const flat = l.replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ');
    console.log('  ' + flat.slice(0, 100) + (flat.length > 100 ? '…' : ''));
  }
}

// ── in-flight signal ──────────────────────────────────────────────────────────
const dirty = sh('git status --porcelain').split('\n').filter(Boolean);
if (dirty.length) console.log('\n' + c('y', `⚠ ${dirty.length} uncommitted file(s)`) + c('dim', ' — other agents may be mid-write; commit only your own files'));
console.log();
