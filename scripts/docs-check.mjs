#!/usr/bin/env node
// scripts/docs-check.mjs — docs invariant linter. Zero dependencies.
//   `pnpm docs:check`           full sweep (CI / manual)
//   `node docs-check.mjs --staged`   fast staged-only subset (pre-commit hook)
//
// HARD-FAIL (exit 1): staged litter (*.tmp/.orig/.DS_Store/…), dead cross-links in docs,
//                     \describedcommit not an ancestor of HEAD.
// WARN (exit 0):      SYNC entries over 6 lines, \describedcommit behind HEAD (normal drift).
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(REPO, 'docs');
const STAGED = process.argv.includes('--staged');
const sh = (cmd) => { try { return execSync(cmd, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const tty = process.stdout.isTTY;
const red = (s) => (tty ? `\x1b[31m${s}\x1b[0m` : s);
const yel = (s) => (tty ? `\x1b[33m${s}\x1b[0m` : s);
const grn = (s) => (tty ? `\x1b[32m${s}\x1b[0m` : s);
const dim = (s) => (tty ? `\x1b[2m${s}\x1b[0m` : s);

let errors = 0, warns = 0;
const fail = (m) => { console.log(red('  ✗ ') + m); errors++; };
const warn = (m) => { console.log(yel('  ⚠ ') + m); warns++; };

const stagedFiles = sh('git diff --cached --name-only --diff-filter=ACM').split('\n').filter(Boolean);

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  return e.isDirectory() ? walk(p) : e.name.endsWith('.md') ? [p] : [];
});
let mdFiles = existsSync(DOCS) ? walk(DOCS) : [];
if (STAGED) mdFiles = mdFiles.filter((f) => stagedFiles.includes(relative(REPO, f)));

// ── CHECK 1: staged litter (hard fail) ────────────────────────────────────────
console.log('litter:');
const litterRe = /\.(tmp|orig|rej|swp|bak)$|(^|\/)\.DS_Store$|~$/;
const litter = stagedFiles.filter((f) => litterRe.test(f));
if (litter.length) litter.forEach((f) => fail('staged litter (should not be committed): ' + f));
else console.log(grn('  ✓ no staged litter'));

// ── CHECK 2: dead cross-links in the CURATED NAV docs (hard fail) ──────────────
// Only STATUS/SYNC/NEXT must have all-resolving links — they're navigation. Narrative docs
// (DEVELOPMENT_NOTES, research notes, archive/) legitimately reference history, other branches,
// shorthand, and patterns, so policing their links is pure noise; they are deliberately skipped.
console.log('links' + (STAGED ? ' (staged nav docs)' : ' (nav docs)') + ':');
const NAV = new Set(['STATUS.md', 'NEXT.md', 'SYNC.md']);
const navFiles = mdFiles.filter((f) => NAV.has(f.split('/').pop()));
const pathTok = /\.(md|tex|ts|tsx|mjs|js|json|bib|sh|ndjson)$/;
let linkN = 0, linkBad = 0;
for (const f of navFiles) {
  const txt = readFileSync(f, 'utf8');
  const base = dirname(f);
  const cands = new Set();
  for (const m of txt.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) cands.add(m[1]); // [text](path)
  for (const m of txt.matchAll(/`([^`]+)`/g)) cands.add(m[1]);            // `code`
  for (let t of cands) {
    t = t.split('#')[0].trim();
    if (!t || /^https?:|^mailto:/.test(t)) continue;       // urls
    if (/[{}<>*$\s]/.test(t) || /YYYY/.test(t)) continue;  // globs, <placeholders>, {a,b}, YYYY-MM patterns
    if (/^[a-z0-9-]+\.[a-z]{2,}\//i.test(t)) continue;     // bare domain.tld/… (scheme-less URL)
    if (!pathTok.test(t) || !t.includes('/')) continue;    // only slashed, extensioned path tokens
    linkN++;
    const ok = [base, REPO, join(REPO, '..')].some((b) => existsSync(resolve(b, t)));
    if (!ok) { fail(relative(REPO, f) + ' → broken link: ' + t); linkBad++; }
  }
}
if (!linkBad) console.log(grn(`  ✓ ${linkN} nav-doc link(s) resolve`));

// ── CHECK 3: SYNC entry length (warn) ─────────────────────────────────────────
const syncF = join(DOCS, 'SYNC.md');
if (existsSync(syncF) && (!STAGED || stagedFiles.includes('docs/SYNC.md'))) {
  console.log('SYNC entry length:');
  const lines = readFileSync(syncF, 'utf8').split('\n');
  let cur = null, count = 0, over = 0;
  const flush = () => { if (cur && count > 6) { warn(`entry "${cur.slice(0, 44)}…" is ${count} lines (>6) — link to a ledger instead`); over++; } };
  for (const l of lines) {
    if (/^\*\*\d{4}-\d{2}-\d{2} — /.test(l)) { flush(); cur = l.replace(/\*\*/g, ''); count = 1; }
    else if (cur) { if (l.trim() === '---') { flush(); cur = null; } else if (l.trim()) count++; }
  }
  flush();
  if (!over) console.log(grn('  ✓ all entries ≤ 6 lines'));
}

// ── CHECK 4: thesis \describedcommit ancestry ─────────────────────────────────
const mainTex = join(REPO, '..', 'thesis', 'main.tex');
if (existsSync(mainTex) && !STAGED) {
  console.log('thesis \\describedcommit:');
  const m = readFileSync(mainTex, 'utf8').match(/\\describedcommit\}\{\\texttt\{([0-9a-f]+)\}/);
  if (!m) console.log(dim('  · no \\describedcommit found'));
  else {
    const dc = m[1];
    if (sh(`git cat-file -e ${dc}^{commit} && echo ok`) !== 'ok') warn(`\\describedcommit ${dc} not found in this repo (fetch?)`);
    else if (sh(`git merge-base --is-ancestor ${dc} HEAD && echo yes`) !== 'yes') fail(`\\describedcommit ${dc} is NOT an ancestor of HEAD`);
    else { const n = sh(`git rev-list --count ${dc}..HEAD`); console.log(+n > 0 ? dim(`  · ancestor, ${n} commits behind HEAD (drift is informational)`) : grn('  ✓ in sync with HEAD')); }
  }
}

console.log();
if (errors) { console.log(red(`✗ docs:check — ${errors} error(s)`) + (warns ? yel(`, ${warns} warning(s)`) : '')); process.exit(1); }
console.log(grn('✓ docs:check passed') + (warns ? yel(` (${warns} warning(s))`) : ''));
