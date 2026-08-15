---
name: release-notes
description: Cut a release for the Tiling Atlas — inspect what has shipped since the last one, propose update notes to AL, and on approval write the entry and push. Use when the push hook denies a git push for unreleased work, when a session starts with unreleased work flagged, or when AL asks for a release, a version bump, or update notes.
---

# Cutting a release

The Atlas ships continuously and nothing else tells a visitor what moved. These notes are the only
place that says it, and they are read by people who use the catalogue — Marek Čtrnáct, Craig Kaplan,
Joseph Myers — not by anyone who reads the commit log.

**AL never has to remember this exists.** The push hook (`.claude/hooks/release-nudge.sh`) raises it.
Your job is to bring a finished proposal, not a question.

## The one rule

**Propose, then wait.** One message: version, title, bullets, previews. AL approves, edits, or waves
it off. Do not write into `lib/updates/entries.ts` before approval, and do not ask a series of
questions first — a proposal that costs AL more than ten seconds to reject is a bad proposal.

If AL says not yet: push with `RELEASE_SKIP=1 git push …` and drop it. Do not raise it again until
the thresholds trip anew.

## Steps

1. **Gather.** `node scripts/draft-update.mjs` (or `--since <sha>` if the anchor is wrong). It prints
   the range, the user-visible/internal split, the visible commits by type and scope, a suggested
   bump with its reason, and the atlas ids that appeared. It never writes prose — that part is yours.

2. **Decide the version.** Read `lib/updates/version.ts`.
   - **MINOR** — a new capability: a page, a tile class, an editor, a geometry, a new axis.
   - **PATCH** — more tilings in a family that already shipped, fixes, perf, restructuring.
   - **MAJOR** — a change in what the Atlas *is*. Reserved; ask before using it.

   The script's signal is a hint, not a verdict. It sees new routes and new registry values; it
   cannot see that 28,453 hyperbolic tilings arrived under an existing route.

3. **Write the bullets.** Three to six per release. Every line must survive a reader who has never
   opened the repo.

4. **Pick previews. Every change that adds tilings gets them** (AL directive, 2026-08-15). This is
   visual work: a release that is a wall of text gets closed without being read, and the reader never
   learns what arrived. Two to four ids per change, never a gallery, chosen to show the RANGE the
   change covers: one per board, or one at each end of the k span, not four that look alike. A change
   about a page or a control takes `href`, and takes `tilings` as well whenever a tiling can stand for
   what it does. Only a change with genuinely nothing to show goes bare.
   - Ids may come from any reference-atlas shard, lazy k-shards included: `gen-updates-data.ts` reads
     those on demand for anything the eager set cannot answer, so a k=7 example is fair game.
   - Only Euclidean-drawable ids render as pictures. `pnpm updates:data` prints how many cells it
     built; anything it could not build degrades to a text chip, so read its output before proposing.
   - The hyperbolic and spherical shelves (half-tile boards, edge-marked boards) carry no flat cell
     and cannot be previewed at all yet. Say so when proposing such a release instead of quietly
     shipping it bare; it is a gap in the preview path, not a style choice.

5. **Propose to AL. Wait.**

6. **On approval:**
   - Add the entry at the TOP of `UPDATES` in `lib/updates/entries.ts`, with `commit` set to the sha
     you are cutting at (`git rev-parse --short HEAD`).
   - Bump `version` in `package.json` to match.
   - `pnpm updates:data` — regenerates `public/updates-cells.json`; read its output.
   - `pnpm build` — the workflow rule; nothing ships without it.
   - `pnpm test` — `tests/updates.test.ts` catches a bad id, a version out of order, or stray markup.
     (`tests/star-general-path.test.ts` times out at 60 s and needs 167 s; that failure is
     pre-existing and not yours.)
   - Commit (`feat(updates): v<version> — <title>`), then push.

## Voice

The commit subjects already read the way these should. Lift the register, not the words.

> `feat(atlas): ship nine Schwarz boards, 135,157 edge systems`
> → `**Nine Schwarz boards** — 135,157 edge systems, in all three geometries.`

> `feat(isotoxal): absorb 448 duplicate families — 4,690 shipped becomes 4,239`
> → `**448 duplicate isotoxal families** were absorbed — 4,690 entries become 4,239 distinct ones.`

- One line each. The concrete number **in** the line, never "many" or "several".
- Bold the key noun. Once per line, nothing else — the renderer handles `**bold**` and nothing more.
- Say what a visitor can now do or see. Never "improved the experience", "enhanced", "streamlined".
- Before/after as `4,690 → 4,239` or "becomes", the way the commits do it.
- Run the draft through `node scripts/check-style.mjs` — it measures against AL's own writing profile.

## Never in these notes

- **`/defense`.** Unlisted, noindex, and it is AL's talk. The script already excludes it; do not
  re-add it by hand.
- The ledgers (`docs/SYNC.md`, `docs/DEVELOPMENT_NOTES.md`), which stay internal and are written
  separately — `/updates` duplicates neither.
- Solver internals, palette names, proof status, k-bound arithmetic. A tiling arrived; how the DFS
  found it is not a release note.
- The thesis. See CLAUDE.md.
- Anything you have not verified. A wrong number here is worse than a missing line.

## Files

| | |
|---|---|
| `lib/updates/entries.ts` | the source of truth — the array you append to |
| `lib/updates/version.ts` | bump semantics |
| `scripts/draft-update.mjs` | the digest; `--check` is the hook's mode, and the `NUDGE` block holds the thresholds |
| `scripts/gen-updates-data.ts` | `pnpm updates:data` — preview cells for the modal |
| `.claude/hooks/release-nudge.sh` | the push-time trigger |
| `app/(app)/updates/` | the history page |
| `components/updates/` | the modal, the gate, the nav button |

## If the thresholds are wrong

They are in one block at the top of `scripts/draft-update.mjs`: a MINOR signal, 6 visible commits,
or 4 stale days. Every `RELEASE_SKIP=1` is evidence they nag too early; a release AL has to ask for
is evidence they nag too late. Tell AL which you are seeing instead of silently editing them.
