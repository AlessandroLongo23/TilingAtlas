# NEXT — one live action per party

Hand-curated, one line each. This is the *only* part of `pnpm status` that isn't derived — keep it to a
single line per party and update it when a baton passes. Everything else (`pnpm status`) is computed fresh.

**Rescoped 2026-07-25:** the thesis shipped and is out of scope (CLAUDE.md, "The thesis is DONE and OUT
OF SCOPE"). The mission is now breadth + correctness of the Atlas itself, with corpora arriving from
Marek Čtrnáct and contact opened with Craig Kaplan and Joseph Myers. The old TA (thesis-agent) and
theorem-certification lines are retired — history lives in `docs/SYNC.md` and `DEVELOPMENT_NOTES.md`.

- **CC** — on `star/k8-and-depth2-sharding`. Shipped since the last entry: the star shelf to k=9, the
  scaled shelves (sides 1–2 to k=7, sides 1–3 to k=4, 43,405 entries), mixed to k=4, depth-2 sharding
  wired through `run-oracle-parallel.sh`, and 19 corpora of Marek's 2026-08-12 drop developed onto the
  spherical, hyperbolic and Schwarz edge shelves.
  NEXT: **apeirogon rendering**. It is the single blocker holding back the largest thing Marek has given
  us: the 19 hybrid-edge systems (1.26 M certificates), the AI2 `{3,n}` family (641 k) and the AI3 and
  outlier families all need it, and none of them can be decoded without it. Zeno's method: stitch
  triangles with one ideal vertex, which also fixes finite polygons past ~40 sides. I told Marek on
  08-07 this comes first after the defense; the defense is done.
  Standing flags — re-emitting the halved shelf WIPES `certified`; run
  `node scripts/stamp-hyp-half-parallel.mjs` after every emit (one emit destroyed a 34-minute stamping
  run unnoticed for a day). The spherical half shelf has no test, the only shipped shelf still with
  none. `33444` is withheld, 11,404 of 53,467 certificates failing `tile face walk did not
  close`. `develop_hyp_edges.py`, `develop_sph_colors.py` and `develop_hyp_colors.py` still match
  `[A-Z0-9]+` for the alphabet token and will silently decode zero files on the first board above the
  9-gon. `SCHWARZ_BOARDS` has no `complete`/`missing` pair, so `(2,2,5)`'s census zeros read as holes.
  `edges_667` ships non-contiguous k, a sample presented as a catalogue. Star fundamental domains still
  render wrong on some entries (Marek, 08-10). `public/` is 1.6 GB and Marek has asked about space.
  `tests/star-general-path.test.ts` fails on a 60 s timeout and predates all of this.
- **Alessandro** — **send the Kaplan email**: two or three lines, six to eight screenshots so he does not
  have to hunt for features, Marek in cc (agreed with him 08-12, still unsent). It carries two asks, the
  Tiling List membership he appears to have forgotten and a second look now that there is far more to
  see. Behind it, two decisions only you can make: whether the "isotoxal" shelf gets renamed to
  "anti-star" now that stars, convex and scaled all qualify as isotoxal, and which of Marek's open fronts
  to point him at next, given he now runs faster than the Atlas can absorb (isohedral and pentagonal edge
  systems, isotoxal hybrids, the k=24 run, or the fundamental-domain classification). Full list in
  `marek-vault/ideas/roadmap.md`.
