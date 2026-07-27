# NEXT — one live action per party

Hand-curated, one line each. This is the *only* part of `pnpm status` that isn't derived — keep it to a
single line per party and update it when a baton passes. Everything else (`pnpm status`) is computed fresh.

**Rescoped 2026-07-25:** the thesis shipped and is out of scope (CLAUDE.md, "The thesis is DONE and OUT
OF SCOPE"). The mission is now breadth + correctness of the Atlas itself, with corpora arriving from
Marek Čtrnáct and contact opened with Craig Kaplan and Joseph Myers. The old TA (thesis-agent) and
theorem-certification lines are retired — history lives in `docs/SYNC.md` and `DEVELOPMENT_NOTES.md`.

- **CC** — `feat/subrosa-editor` merged 2026-07-27, 39 commits. Shipped on it: Sub Rosa (n = 4–9,11),
  `/multigrid` + duality split-view, the hollow engine (all 14 GMS), the hexagonal {6,3} shelves, four
  new hyperbolic colour bases, the live landing cells, the p5-free symmetry overlays, and `/defense`.
  NEXT: **re-run ring D=42** — it was interrupted mid-solve and is the one ring that separates
  7-fold-with-triangles from the D=28 result, so the ring sweep cannot be called complete without it
  (`experiments/results/ring-sweep-2026-07-25.log`). Then the `public/` weight problem: 669 MB, 504 MB
  of it tracked, `hex-solutions-k9.json` alone 56 MB for one array entry.
  Standing flags — `edges_667` ships non-contiguous k (2,3,4,6,10,11 absent from Marek's files), a sample
  presented as a catalogue: label it honestly and ask Marek for the missing k + k=12/13 chiral files.
  `tests/star-general-path.test.ts` fails on a 60 s timeout, takes 151 s, and predates all of this.
- **Alessandro** — collaborator pipeline: what to request next from Marek (missing 6.6.7 k values first),
  and what Kaplan / Myers could contribute that the atlas cannot generate itself.
