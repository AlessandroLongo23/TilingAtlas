# Tiling deformation graph — k=1 isotoxal slice (2026-07-17)

Treat the catalogue of parametric tilings as a topological space, not a flat list. Each parametric
family is a cell; its special limit states are nodes; gluing families at shared nodes assembles a
CW complex. This spec covers the first bounded slice: the k=1 isotoxal Euclidean families, single
parameter (`flexdim = 1`), produced offline as a graph data file plus a static figure. It validates
the extraction machinery on a slice small enough to check by hand before generalizing.

Motivating example: `ctrnact-isotoxal-family-k1-06` (family symbol `3.3.4α`). Its α slider runs
0°→180°; both endpoints are the regular triangular tiling 3^6, and α=90° is the Archimedean
elongated-triangular tiling 3.3.3.4.4. So this one family should assemble into a two-node,
two-edge circle — the acceptance gate below.

## Decisions (AL, 2026-07-17)

Settled over the design conversation. Do not silently revisit.

- **The object is a CW complex, generally non-regular.** A family whose two endpoints land on the
  same node is a loop, which is exactly what regular CW forbids. So we build a general CW complex and
  do not assume the face-poset-determines-space theorem.
- **Node identity = congruence up to direct similarity.** Rotation, translation, and uniform scale
  identify nodes; reflection does not. Scale is already pinned (developed edges are unit ζ-powers),
  so identity reduces to rotation (ζ^r, r ∈ [0,12)) + translation + period-lattice relabeling.
- **Chiral versions survive.** A left snub and its mirror are two distinct nodes. This is the opposite
  of the enumeration convention and is deliberate.
- **"Mirror pairs merge" is a counting convention, not a quotient of this space.** The A068599 count
  keeps merging mirrors; the deformation space does not. Two different objects, kept separate. The
  settled CLAUDE.md chirality rule stands for counting and is out of scope here.
- **Node rule.** A state is a node iff, as α varies, the wallpaper group jumps up OR the combinatorial
  type changes (a tile collapses to zero area). An edge is a maximal open α-arc on which both stay
  constant.
- **Exact at nodes, float along edges.** Node identity and gluing are certified with exact ℤ[ζ₁₂]
  arithmetic. Edge interiors stay symbolic/float — they carry only dimension and display.
- **Unmatched limits become flagged "unresolved" nodes, never a hard failure.** A k=1 limit that
  matches no catalogue tiling still gets a node keyed by its own canonical form, marked for review.
- **Figure style: node-link diagram.** Nodes as tiling thumbnails, families as arcs, mirror twins
  paired so a self-mirror family reads as its bigon.

## Scope

**In:** k=1 isotoxal Euclidean families with `flexdim = 1`. Read the shipped family records, extract
nodes and edges, resolve node identity against the existing exact k=1 develop catalogue, assemble a
`moduli-graph.json`, render one static HTML/SVG figure.

**Deferred (each its own later spec):** multi-parameter families (`flexdim ≥ 2`, the 2-cells and their
boundary cycles); higher-k isotoxal shards (k2/k3/k4); the full Euclidean catalogue; spherical and
hyperbolic; any interactive in-app view.

## Node identity and the node rule

Identity is computed by `directCanonicalForm` (below): a hashable key over the exact ℤ[ζ₁₂] cell,
invariant under C₁₂ rotation + translation + lattice relabeling, sensitive to reflection. Two nodes
are the same iff their keys match.

Node selection walks the closed α-interval of each family and marks:
1. **Endpoint limits** (α → each open bound). A tile collapses; remove the zero-area tile and the
   residue is the limit tiling.
2. **Interior symmetry jumps.** Where the wallpaper group strictly grows (e.g. rhombus → square at
   α=90° gains mirror lines: the reflection's fixed point, hence a symmetry maximum).
3. **Interior type changes.** Where a tile collapses mid-interval, if any.

Between consecutive marked α, the open arc is one edge.

## Architecture — five units

| Unit | Input → Output | Notes |
| --- | --- | --- |
| `directCanonicalForm` | exact ℤ[ζ₁₂] cell → hashable key | Fork of `canonicalFormN.ts`: iterate C₁₂ (rotations) instead of D₁₂ (drop the `conj` half). Pure. |
| `nodeExtractor` | family `paramCell` → `[{alpha, floatCell, group}]` | `evaluateParamCell` + wallpaper classifier swept over α; bisect to the exact α at each jump/collapse. |
| `nodeResolver` | special-α state → node `{id, label, key, exactCell}` | Match float cell against exact k=1 develop catalogue by direct similarity; pull matched exact cell + id; certify with `directCanonicalForm`. Unmatched → `unresolved` node keyed by its own float-derived form, flagged. |
| `graphAssembler` | families + resolved nodes → `moduli-graph.json` | Subdivide each family at interior nodes; dedup nodes by key; synthesize mirror-twin nodes/edges for chiral pieces; record the reflection involution; emit nodes, edges, incidence, per-cell dimension, chirality. |
| `graphRenderer` | `moduli-graph.json` → HTML/SVG figure | Node-link diagram. Built last, after 1–4 produce correct data. |

Each unit has one job and a typed boundary, testable alone. `directCanonicalForm` is the load-bearing
one and gets the most direct unit tests.

## Data flow and file locations

```
public/reference-atlas-isotoxal.json         (family records: paramCell, flexdim, family symbol)
tools/ctrnact-oracle/run-k1-regular/ctrnact-cells-k1.json   (exact ℤ[ζ₁₂] node cells)
        │
        ├─ nodeExtractor ─→ nodeResolver ─→ graphAssembler ─→ experiments/results/moduli-graph.json
        │
        └─ graphRenderer ─→ experiments/results/moduli-graph.html
```

New code under `scripts/moduli-graph/`, run via `pnpm tsx`. Output under `experiments/results/`.

**Reused (already in the repo):**
- Family records + `evaluateParamCell`: `lib/utils/paramCell.ts`, `lib/services/referenceAtlas.ts`.
- Exact cyclotomic arithmetic: `lib/classes/Cyclotomic.ts`, `lib/classes/algorithm/oracleCellReconstruct.ts`
  (`decodeGalebachVertex`, `reconstructOracleCell`), `lib/classes/algorithm/exact/Surd.ts`.
- Congruence canonical form to fork: `lib/classes/algorithm/canonicalFormN.ts` (currently D₁₂);
  `lib/classes/algorithm/TilingCongruence.ts` for reference.
- Wallpaper classifier: `lib/classes/symmetry/WallpaperSymmetry.ts`, `lib/classes/symmetry/nClassify.ts`,
  `lib/services/oracleSymmetry.ts`.

**New:** the five units above.

## Golden test — acceptance gate

Run the whole pipeline on `ctrnact-isotoxal-family-k1-06` (3.3.4α) alone. It must produce:
- Two nodes: 3^6 (achiral) and 3.3.3.4.4 (achiral, the α=90° square).
- Two edges: the open arcs (0°,90°) and (90°,180°).
- The two edges chirality-distinct (mirror partners under `directCanonicalForm`).
- Glued into a circle: first homology H₁ = ℤ.

If this bigon does not come out, the machinery is wrong and scaling to the rest of k=1 is pointless.

## Figure

Self-contained HTML/SVG node-link diagram: nodes are special tilings drawn as small thumbnails, edges
are families drawn as arcs. Mirror-twin edges are paired so a self-mirror family reads as its bigon.
Chirality shown by arc styling, cell dimension by node styling. Screenshot-able for the thesis; the
same file is the seed for a later interactive view. (Alternative if node-link gets cluttered at full
k=1: a strict Hasse/face-poset layout, more faithful to the CW structure, less pretty.)

## Error handling

- Limit matches no catalogue tiling → `unresolved` node, keyed by its own canonical form, flagged in
  the output and the figure. Never crash, never silently drop.
- A family with no interior jump → a single edge between its two endpoint nodes (a loop if both
  endpoints resolve to the same node).
- Float-located α that fails exact certification at the node → surfaced as a diagnostic; the exact
  step is the source of truth, so a mislocated jump is caught, not absorbed.

## Testing

- `directCanonicalForm`: unit tests. Snub vs its mirror → different keys; 3^6 vs rotated/translated
  3^6 → same key; the α=90° square vs its own mirror → same key (achiral).
- `nodeExtractor` on 3.3.4α: finds endpoints → 3^6 and one interior jump at α=90° → square.
- `graphAssembler` on 3.3.4α: the golden bigon, H₁ = ℤ.
- Full k=1 isotoxal slice: pipeline runs to completion, figure renders, unresolved nodes (if any)
  listed.

Run `pnpm build` after the code lands (the workflow rule: build, not just lint/test).

## Risks and open questions

- **Exact limit recovery.** Endpoint limits are recovered by matching against the exact k=1 catalogue,
  which sidesteps exact degenerate-limit algebra. If a limit is a tiling not present in that catalogue,
  it falls to the `unresolved` path. Acceptable for this slice; revisit when generalizing.
- **Completeness of the node catalogue.** Resolution assumes the exact k=1 cells file holds all ten
  k=1 uniform tilings. The shipped `run-k1-regular/ctrnact-cells-k1.json` must be confirmed complete
  (or regenerated via `make PALETTE=regular` + `run-oracle.sh 1`) as a setup step; a partial file
  silently inflates the `unresolved` count.
- **Self-mirror families.** 3.3.4α is closed under reflection (α ↔ 180°−α), so its mirror twin is
  already inside its own interval. Other k=1 families may not be self-mirror; their mirror twin is a
  separate family that may be absent from the shipped data and must be synthesized by reflecting
  coordinates. The assembler handles this uniformly via the reflection involution.
- **Monodromy at loop nodes.** When both endpoints resolve to the same node, check whether they agree
  as oriented cells or differ by a period-lattice shift that is not a symmetry. Record it; do not
  block on it for this slice.
