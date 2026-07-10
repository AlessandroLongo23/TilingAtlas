# Algorithm pipeline figures — design

Status: approved design, pre-implementation. Date: 2026-07-10. Author: CC (with AL).

## Goal

A set of static, publication-quality figures that walk a reader through the live enumeration
pipeline, using **real intermediate data** from an actual run — not schematic redraws. One k=2
tiling is followed end to end: its polygons, its vertex configurations, its seed, its lattice pool,
its torus-fill search, its k-uniformity verdict, its final tiling. Output routes through the
existing `figures/` pipeline (TikZ `.tex` for the thesis, SVG for preview) so the visual style
matches the other thesis figures.

## Locked decisions

- Deliverable: static thesis figures. No interactivity, no web app.
- Narrative: one running example threaded through every figure.
- Complexity: k=2 (first real acceptance target, 20 tilings).
- Input polygon set: `{3, 4, 6}` — chosen for print legibility; rich VC set, real k=2 tilings
  exist within it, every edge direction lives in ℤ[ζ₁₂] (no octagon/12-gon completeness or
  legibility snag).
- Path shown: the **live** `USE_PERIOD_SOLVER=1` route (PeriodSolver + LatticeEnumerator +
  KUniformityChecker), which per CLAUDE.md replaces seed-expansion + extract. This is the route
  that has the vector pool and torus-fill DFS the figures are meant to show.
- Tree fidelity: real nodes from a real run, shown as a **curated slice** (a successful path plus
  one stub per distinct prune reason), with the true total node count in the caption.
- Data capture: approach A — guarded trace hooks in the real engines, dormant unless
  `TRACE_FIGURES` is set. No reimplementation of any traversal.

## The running example — selected by probe (checkpoint 1)

The specific tiling is not hard-picked in this spec. Implementation step 1 runs the real path
(`USE_PERIOD_SOLVER=1 TRACE_FIGURES=<dir> pnpm pipeline`, or the probe harness) at k=2 on `{3,4,6}`,
captures traces for the resulting tilings, and selects by these rules:

- exactly 2 distinct VCs, with a VC search that contains both a 2π closure and at least one prune;
- a small fundamental cell (few reps) so torus-fill nodes render as legible thumbnails;
- a torus-fill DFS large enough to contain a real prune but not thousands of nodes.

Deliverable of the step: a shortlist with **real per-stage node counts** and a recommended tiling
by its oracle name. AL confirms the example before any figure is built. If no `{3,4,6}` tiling
threads cleanly, the fallback is to report that and propose the nearest legible alternative
(e.g. adding 12), not to silently swap the set.

## Figure set (9 figures)

| # | Figure | Stage | Node / content |
|---|--------|-------|----------------|
| F1 | Pipeline overview | all | schematic boxes + arrows; the example's thumbnail at each stage |
| F2 | Polygon set | 1 (`PolygonsGenerator`) | one rendered regular n-gon per input polygon; label n + interior angle |
| F3 | VC search tree | 2 (`VCGenerator.dfs`) | nodes = the growing ring of polygons around one shared vertex (rendered fan); shows a 2π closure + an angle-overshoot prune + an adjacency (`canFollow`) prune; the 2 VCs the example uses are highlighted |
| F3.5 | Compatibility graph | 3–4 (`CompatibilityGraph`, `SeedSetExtractor`) | small graph over the enumerated VCs; the example's 2 VCs highlighted as one edge ⇒ the seed set |
| F4 | Seed BFS | 5 (`SeedBuilder.buildSeedsFromSet`) | nodes = partial placements of the 2 VCs (rendered patches), layered; one surviving rotation + one forward-check prune; leaf = the seed patch |
| F5 | Vector pool + candidate lattices | 6B-a (`shortVectorPool`, `candidateLattices`) | left: short-vector pool as arrows from origin over the seed, colored by step count; right: a few candidate-lattice parallelograms + the exact area ladder, winner marked |
| F6 | Torus-fill DFS | 6B-b (`PeriodSolver.torusFill`) | the hero figure: nodes = partial toroidal cells (reps drawn in the fundamental cell); path-to-closure + 2 pruned branches, each labeled with its prune reason (P1 / P3 / overlap) |
| F7 | k-uniformity check | 7 (`KUniformityChecker`) | the closed cell, vertices colored by orbit under the symmetry group; 2 orbit colors ⇒ k=2 ✓ |
| F8 | The final tiling | 8 | the cell replicated to the infinite tiling, with basis parallelogram + u/v arrows (existing `anatomy` mode); labeled with the oracle name |

F3.5 is included on a "try it" basis: it is abstract (a graph over names). If it reads as clutter
next to the geometric figures, it is dropped to a one-line caption on F4. That call is made when the
real graph is in hand, not now.

## Curation rules (how a large tree becomes a legible slice)

Deterministic — no randomness (the repo bans `Math.random` in scripts, and a figure must be
reproducible):

1. Keep the full path from root to the emitted / closed result.
2. Keep the first-encountered prune of each distinct reason as a single dead-branch stub
   (VC: angle-overshoot, adjacency, duplicate; seed: forward-check; torus: P1, P3, area, overlap).
3. Collapse the remainder into one annotated ellipsis node carrying the true dropped count
   ("+112 explored").
4. The caption states the real total, so the slice is honest about scale.

Each retained tree node renders the node's **actual** geometry: the builder transforms that node's
polygons (float verts from the trace) into the node's box on the page. A tree figure is therefore
one `FigureIR` — mini-render polys + edge polylines + text labels — passed to the existing emitters.
No new emitter is written.

## Instrumentation (dormant by default)

New module `lib/algorithm/figureTrace.ts`: a module-level sink with `trace.node(event)` and
`trace.begin(stage)` / `trace.end()`. A no-op unless `process.env.TRACE_FIGURES` is set; when set it
appends newline-delimited JSON to files under that directory. Module-level sink avoids threading a
callback through many engine signatures.

Every event is `{ stage, id, parentId, verdict, ...stageData }`. Hooks:

- `lib/classes/algorithm/VCGenerator.ts` `dfs` — `stack` (polygon n-list), `angleSum`,
  verdict ∈ `extend | emit | prune-angle | prune-adjacency | prune-dup`.
- `lib/classes/algorithm/SeedBuilder.ts` `buildSeedsFromSet` — `layer`, patch float verts, verdict.
- `lib/classes/algorithm/PeriodSolver.ts` `candidateLattices` + `LatticeEnumerator.ts`
  `shortVectorPool` — pool vectors (exact → float, stepCount, length), candidate lattices
  (basis, exact area, kept / why-rejected).
- `lib/classes/algorithm/PeriodSolver.ts` `torusFill` — `reps` float verts, open vertex, placed n,
  verdict ∈ `place | close | prune-P1 | prune-P3 | prune-area | prune-overlap`.

Hard guarantee: the hooks are pure observation, zero control-flow change. Enforced by a regression
test (engine output with tracing off must byte-match a committed golden; traced-on vs traced-off
final results are diffed and must be identical).

Trace files: `figures/traces/<example>/{vc,seed,pool,torus}.jsonl`, committed as the figures'
reproducible data source. Re-running the probe regenerates them.

## Figure builder (new, under `figures/`)

- `figures/trace/loadTrace.ts` — JSONL → typed node arrays per stage.
- `figures/trace/curate.ts` — the curation rules above; pure function `(nodes) → slice`.
- `figures/trace/treeLayout.ts` — tidy tree layout (Reingold–Tilford); assigns each retained node a
  box on the page.
- `figures/trace/treeFigure.ts` — compose node mini-renders + edges + labels → `FigureIR`.
- `figures/trace/poolFigure.ts` — F5 (arrows-over-seed + candidate parallelograms).
- `figures/build.ts` — add the 9 targets; emit `.tex` (TikZ, thesis-primary) + `.svg` (preview).
- `figures/style/palette.ts` — extend with styleRefs for node boxes, tree edges, prune markers,
  orbit colors (F7). Shared by both emitters so preview and thesis cannot drift.

F2, F7, F8 reuse the existing `buildCellModel` → `tilingFigure` → emit path (F8 via `anatomy` mode).
Only the tree/pool figures (F3, F4, F5, F6) need the new `figures/trace/*` code.

## Output and the thesis boundary

Figures emit into this repo's `figures/out/` as TikZ `.tex` + preview `.svg`. `../thesis` is
TA-owned and is **not** edited by CC. The figures' README documents the `\input` / `\includegraphics`
snippet AL or TA uses to pull each figure into the thesis.

## Testing

- Tracer no-op regression: engine output with `TRACE_FIGURES` unset byte-matches a committed golden;
  traced-on final results diff-identical to traced-off.
- Curation determinism: a fixture trace → a fixed slice (same input, same output, node-for-node).
- Layout: no overlapping node boxes for a fixture tree; deterministic coordinates.
- Builder smoke: fixture trace → valid, non-empty SVG with the expected retained-node count.

Pure functions (`curate`, `treeLayout`) are written test-first. The `figures/tiling/oblique-k3.test.ts`
neighbor shows the repo already unit-tests figure geometry, so this fits.

## Non-goals

- No interactivity, no web page, no animation.
- No change to enumeration behavior — tracing is observation only.
- No editing of `../thesis` or `../resources`.
- Not every explored node is drawn — the slice is explicit and captioned, never a silent cap.

## Build discipline

`pnpm build` after each change (per CLAUDE.md); `pnpm figures` regenerates the figure set;
`pnpm test` for the trace/curation/builder tests.
