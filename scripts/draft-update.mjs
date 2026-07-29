#!/usr/bin/env node
// scripts/draft-update.mjs — what has shipped since the last release, classified.
//
// Run:  pnpm updates:draft                    full digest since UPDATES[0].commit
//       node scripts/draft-update.mjs --since <sha>
//       node scripts/draft-update.mjs --no-atlas-diff
//       node scripts/draft-update.mjs --check  hook mode: terse, exit 1 if a nudge is due
//
// This script GATHERS FACTS. It never writes prose and never edits lib/updates/entries.ts — that is
// the release ritual's job (.claude/skills/release-notes/SKILL.md), because a changelog transcribed
// from `git log` is noise. Since 2026-07-01 only 214 of 542 commits touched a surface a visitor can
// see; the rest is solver, ledgers and experiments. The filter IS the feature.
//
// Zero dependencies. Every mode but --check exits 0: this is a view, and a broken view must never
// be what stops a push.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sh = (cmd) => {
  try { return execSync(cmd, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
};
const tty = process.stdout.isTTY;
const P = { b: '\x1b[1m', dim: '\x1b[2m', y: '\x1b[33m', g: '\x1b[32m', r: '\x1b[31m', x: '\x1b[0m' };
const c = (k, s) => (tty ? P[k] + s + P.x : s);

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const NO_ATLAS = args.includes('--no-atlas-diff') || CHECK;
const sinceFlag = args.indexOf('--since');
const SINCE_ARG = sinceFlag >= 0 ? args[sinceFlag + 1] : null;

// ── thresholds ────────────────────────────────────────────────────────────────
// TUNE THESE. They decide whether the push hook nudges, and they are the whole reason this feature
// survives contact: AL pushes 1-5x a day, so a nudge on every visible commit would be reflexively
// bypassed within a week and the notes would rot. Treat any use of RELEASE_SKIP=1 as evidence these
// numbers are wrong.
const NUDGE = {
  /** A MINOR signal (new route / new registry value) always earns a nudge, whatever the count. */
  onMinorSignal: true,
  /** Otherwise, this many user-visible commits. */
  visibleCommits: 6,
  /** Or this many days since the last release, with at least one visible commit. */
  staleDays: 4,
};

// ── what counts as user-visible ───────────────────────────────────────────────
const VISIBLE_PREFIXES = [
  'app/', 'components/', 'public/',
  'lib/render/', 'lib/services/', 'lib/stores/', 'lib/hooks/', 'lib/freedraw/', 'lib/updates/',
];
// /defense is an unlisted, noindex route — the talk. It must never reach public release notes.
const EXCLUDED_PREFIXES = ['app/defense/', 'public/defense/', 'docs/defense/'];

const isVisiblePath = (p) =>
  VISIBLE_PREFIXES.some((v) => p.startsWith(v)) && !EXCLUDED_PREFIXES.some((e) => p.startsWith(e));

// ── the last released commit ──────────────────────────────────────────────────
function lastReleased() {
  if (SINCE_ARG) return { commit: SINCE_ARG, version: '(--since)', date: null };
  try {
    const src = readFileSync(join(REPO, 'lib', 'updates', 'entries.ts'), 'utf8');
    // The newest entry is the first object literal in UPDATES; read its three fields in order.
    const body = src.slice(src.indexOf('export const UPDATES'));
    const version = /version:\s*"([^"]+)"/.exec(body)?.[1] ?? null;
    const date = /date:\s*"([^"]+)"/.exec(body)?.[1] ?? null;
    const commit = /commit:\s*"([^"]+)"/.exec(body)?.[1] ?? null;
    return { commit, version, date };
  } catch {
    return { commit: null, version: null, date: null };
  }
}

const last = lastReleased();
if (!last.commit) {
  if (CHECK) process.exit(0);
  console.log(c('r', 'No release anchor found in lib/updates/entries.ts — pass --since <sha>.'));
  process.exit(0);
}
// An anchor that is not an ancestor of HEAD (rebased, or a fresh clone) makes the range meaningless.
if (!sh(`git merge-base --is-ancestor ${last.commit} HEAD && echo ok`)) {
  if (CHECK) process.exit(0);
  console.log(c('y', `⚠ ${last.commit} is not an ancestor of HEAD — range is meaningless. Pass --since <sha>.`));
  process.exit(0);
}

const RANGE = `${last.commit}..HEAD`;

// ── collect the range ─────────────────────────────────────────────────────────
// %x00-delimited so a subject containing anything is still parseable. git emits
//   <hash>\0<date>\0<subject>\0 / blank line / file / file / <hash>\0…
// with NO blank line before the next header, so splitting on a blank line cuts commits in half.
// Drive it off the NUL instead: a line carrying one starts a commit, every other non-empty line is
// a path belonging to the commit above it.
const raw = sh(`git log ${RANGE} --format=%h%x00%ad%x00%s%x00 --date=short --name-only`);
const commits = [];
for (const line of raw.split('\n')) {
  if (line.includes('\0')) {
    const [hash, date, subject] = line.split('\0');
    if (hash) commits.push({ hash, date, subject: subject ?? '', files: [] });
  } else if (line && commits.length) {
    commits[commits.length - 1].files.push(line);
  }
}

const visible = commits.filter((k) => k.files.some(isVisiblePath));
const internal = commits.filter((k) => !k.files.some(isVisiblePath));

// ── bump signal ───────────────────────────────────────────────────────────────
const reasons = [];
const newRoutes = new Set();
for (const k of visible) {
  for (const f of k.files) {
    if (/^app\/.*\/page\.tsx$/.test(f) && !EXCLUDED_PREFIXES.some((e) => f.startsWith(e))) {
      // Only a route that did not exist at the anchor is a new capability. The path MUST be quoted:
      // route-group segments are literally "(app)", and unquoted parens are a shell syntax error, so
      // every existing route would look new.
      if (!sh(`git cat-file -e '${last.commit}:${f}' && echo ok`)) newRoutes.add(f);
    }
  }
}
for (const f of newRoutes) reasons.push(`new route ${f}`);

// A new value in one of the registries that define what the atlas HOLDS is the other MINOR signal.
const REGISTRY_FILES = ['lib/services/referenceAtlas.ts', 'app/(app)/aperiodic/_views.ts', 'lib/theory/articles.ts'];
for (const f of REGISTRY_FILES) {
  const diff = sh(`git diff ${RANGE} -- "${f}"`);
  if (!diff) continue;
  const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  // A quoted string added to a union/array/table in one of these files = a new class, view or page.
  const names = [...new Set(added.flatMap((l) => [...l.matchAll(/"([a-z][a-z0-9-]{2,})"/g)].map((m) => m[1])))];
  if (names.length) reasons.push(`${f}: +${names.slice(0, 6).join(', ')}`);
}

const bump = reasons.length ? 'minor' : visible.length ? 'patch' : 'none';

// ── nudge decision ────────────────────────────────────────────────────────────
const daysSince = last.date
  ? Math.floor((Date.now() - Date.parse(`${last.date}T00:00:00Z`)) / 86400000)
  : 0;
const nudge =
  (NUDGE.onMinorSignal && reasons.length > 0) ||
  visible.length >= NUDGE.visibleCommits ||
  (daysSince >= NUDGE.staleDays && visible.length >= 1);

if (CHECK) {
  if (!nudge) process.exit(0);
  const why = reasons.length
    ? `a new capability landed (${reasons[0]})`
    : visible.length >= NUDGE.visibleCommits
      ? `${visible.length} user-visible commits have accumulated`
      : `${daysSince} days since v${last.version}, with ${visible.length} user-visible commit(s)`;
  console.log(`${visible.length} user-visible commit(s) since v${last.version} (${last.commit}) are unreleased — ${why}.`);
  console.log(`Suggested bump: ${bump.toUpperCase()}.`);
  console.log(visible.slice(0, 8).map((k) => `  · ${k.subject}`).join('\n'));
  process.exit(1);
}

// ── the digest ────────────────────────────────────────────────────────────────
console.log(c('b', '── unreleased ') + c('dim', `since v${last.version} @ ${last.commit}${last.date ? ` (${last.date}, ${daysSince}d ago)` : ''}`));
console.log(`\n  ${commits.length} commit(s): ${c('g', `${visible.length} user-visible`)}, ${c('dim', `${internal.length} internal`)}`);

if (visible.length === 0) {
  console.log(c('dim', '\n  Nothing a visitor can see. No release.\n'));
  process.exit(0);
}

// Group visible commits by conventional type, then scope. The log is ~99% conforming.
const groups = new Map();
for (const k of visible) {
  const m = /^([a-z]+)(?:\(([^)]*)\))?:\s*(.*)$/.exec(k.subject);
  const type = m?.[1] ?? 'other';
  const scope = m?.[2] ?? '';
  const text = m?.[3] ?? k.subject;
  if (!groups.has(type)) groups.set(type, []);
  groups.get(type).push({ ...k, scope, text });
}
const TYPE_ORDER = ['feat', 'perf', 'fix', 'refactor', 'copy', 'chore', 'other'];
const ordered = [...groups.keys()].sort((a, b) => {
  const ia = TYPE_ORDER.indexOf(a), ib = TYPE_ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
});
for (const type of ordered) {
  console.log('\n' + c('b', type));
  for (const k of groups.get(type)) {
    console.log(`  ${c('dim', k.hash)} ${k.scope ? c('y', `(${k.scope}) `) : ''}${k.text}`);
  }
}

console.log('\n' + c('b', 'bump ') + c(bump === 'minor' ? 'g' : 'dim', bump.toUpperCase()));
for (const r of reasons) console.log(`  · ${r}`);
if (!reasons.length) console.log(c('dim', '  · no new route or registry value — content, fixes and perf only'));

// ── new atlas ids ─────────────────────────────────────────────────────────────
// The one fact that cannot be read off a commit subject, and the source of preview ids.
if (!NO_ATLAS) {
  const shards = sh(`git diff ${RANGE} --name-only -- "public/reference-atlas*.json"`).split('\n').filter(Boolean);
  if (!shards.length) {
    console.log('\n' + c('b', 'new tilings ') + c('dim', 'no atlas shard changed'));
  } else {
    console.log('\n' + c('b', 'new tilings'));
    for (const shard of shards) {
      const idsAt = (rev) => {
        const blob = sh(`git show ${rev}:${shard}`);
        if (!blob) return null;
        try { return new Set(JSON.parse(blob).map((t) => t.id)); } catch { return null; }
      };
      const before = idsAt(last.commit);
      const after = idsAt('HEAD');
      if (!after) { console.log(`  ${c('y', shard)}: unreadable at HEAD`); continue; }
      const added = before ? [...after].filter((id) => !before.has(id)) : [...after];
      const label = before ? `+${added.length}` : `${added.length} (new shard)`;
      console.log(`  ${shard}: ${c('g', label)}${added.length ? ` — e.g. ${added.slice(0, 4).join(', ')}` : ''}`);
    }
    console.log(c('dim', '  (pick preview ids from these; only Euclidean-drawable ones render — see gen-updates-data.ts)'));
  }
}

console.log('\n' + c('dim', 'Next: the release ritual in .claude/skills/release-notes/SKILL.md.\n'));
