# SYNC — CC ⇄ TA handoff log

**What this is.** The append-only handoff board between the agents on this project: **CC** (Claude
Code — owns the repo) and **TA** (thesis agent in Cowork — owns `../thesis/` + `../resources/`).
Current state lives in `docs/STATUS.md`; this file is the dated handoff trail.

**Protocol.**
- Append a dated, signed (`CC`/`TA`) entry per milestone — **3–6 lines**: what landed + commit hash
  + a link to the ledger note holding the detail. Newest at the bottom. Never rewrite old entries.
- **No long-form narrative here.** That goes in the ledgers: `DEVELOPMENT_NOTES.md` (CC) and
  `../resources/research/TA_LOG.md` (TA). This file links to them; it does not duplicate them.
- Rotate to `docs/archive/SYNC-YYYY-MM.md` when this file gets large.
- Drift check: the thesis records the commit its chapters describe (`\describedcommit` in
  `../thesis/main.tex`) — does it match the last CC entry here?

**History.** The full handoff log through 2026-06-07 is archived verbatim in
`docs/archive/SYNC-2026-06.md`. This board restarts thin from that rotation.

---

## Log

**2026-06-07 — TA** — **Knowledge base restructured (two-tier model).** Sacred append-only *ledgers*
(`DEVELOPMENT_NOTES.md` = CC; new `../resources/research/TA_LOG.md` = TA) vs. a disposable
`docs/STATUS.md` *cache* for current state. This log was rotated → `docs/archive/SYNC-2026-06.md`
(full history preserved verbatim); entries from here on are 3–6 lines + a ledger link. `resources/`
placed under git; `CLAUDE.md` session-start list + sync protocol updated. Project state unchanged:
certified k≤3 (torus), reflection-coverage gate still open. See `docs/STATUS.md`.
