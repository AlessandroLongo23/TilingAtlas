# Certified Dirichlet-Domain Hyperbolic Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the heuristic per-pixel hyperbolic reducer (holes on k=2 tilings) with a provably
hole-free renderer: certified Dirichlet fundamental domain + complete side-pairing generators +
total lookup field + view re-anchoring for infinite pan.

**Architecture:** Per tiling, the CPU builds the Dirichlet domain D of the deck group Γ around the
seed vertex (Klein-model half-plane intersection over the orbit Γ·0, orbit enumerated by the exact
dart developer). A cut-off certificate (orbit complete to 2·R_D + δ ⇒ D correct — the standard
Dirichlet cut-off lemma, cf. Voight 2009 Alg. 4.7, SnapPea) proves the side-pairing set is complete.
The fragment shader then greedy-reduces each pixel with those side pairings — by Voight 2009
Prop. 4.4 this terminates *inside D̄*, never at a spurious local minimum — and samples a lookup
field that is baked TOTAL (every texel resolved) over D + collar. The pan view is re-anchored
against Γ each frame ((tile, residual) camera à la HyperRogue), so float32 never sees a large
isometry and panning is unlimited.

**Tech Stack:** TypeScript, WebGL2 (GLSL ES 3.0), vitest, existing `HyperbolicDeveloper`
(SU(1,1) dart developer), Playwright for visual verification.

**Why the old one broke (measured):** greedy |w|-reduction with 16 heuristic generators + a fixed
0.66-radius field. For k=2 tilings the true Dirichlet domain has Poincaré circumradius up to ~0.9
(> 0.66 field) and its side pairings are not all in the heuristic set ⇒ points reduce to local
minima at |w| up to 0.99 with no field data ⇒ background-coloured holes (7–17 % of the disk on the
four worst tilings; `scripts/scratch-hyp-holes.ts`).

**Theory sources:** Voight, *Computing fundamental domains for Fuchsian groups* (2009),
arXiv:0802.0196 — greedy reduction over a Dirichlet side-pairing set terminates in the domain;
von Gagern, *Creation of Hyperbolic Ornaments*, TU München thesis 2014 — per-pixel reverse lookup
with convex fundamental polygon + side pairings on GPU, nearest-neighbour id sampling;
Celińska-Kopczyńska & Kopczyński, arXiv:2404.09039 — (tile, residual) camera + renormalization for
numerical stability; hypertiling (SciPost Codebases 34, 2024) — coordinate-hash dedup pitfalls
(motivates the conformally-scaled dedup grid for deep develops).

---

### Task 1: Deep-develop support in `HyperbolicDeveloper`

**Files:**
- Modify: `lib/render/hyperbolicDevelopClient.ts`
- Test: `tests/hyperbolic-develop-client.test.ts` (add cases; existing must stay green)

The certificate needs the orbit enumerated to hyperbolic radius ~8–9 (Poincaré Euclid ~0.9995).
At that depth the fixed 1e-4 Euclid dedup grid falsely merges distinct instances (vertex spacing
shrinks like (1−r²)); a false merge silently truncates the orbit and would fake the certificate.

- [x] **Step 1: add `deepDedup` option + `extendTo` + `instanceCount`**

```ts
// constructor gains opts
constructor(darts: Darts, edgeLength: number, opts: { deepDedup?: boolean } = {})
// keying: when deepDedup, grid cell scales with the local conformal factor s=(1−r²)/2,
// quantized to powers of two so neighbours share a cell size; level goes into the key.
// Same-instance float drift (~1e-9) ≪ cell (≥1e-3·s); distinct vertices (≥~0.1 hyp) ≫ cell.
// Straddling a level boundary can only create a DUPLICATE (harmless), never a merge.
private key(h: number, z: Complex, th: number): string {
  if (!this.deepDedup) { /* existing fixed-grid key */ }
  const r2 = z.x * z.x + z.y * z.y;
  const level = Math.max(-60, Math.min(0, Math.round(Math.log2(Math.max(1e-18, (1 - r2) / 2)))));
  const cell = 1e-3 * Math.pow(2, level);
  return `${h},${level},${Math.round(z.x / cell)},${Math.round(z.y / cell)},${Math.round(Math.cos(th) / ANGTOL)},${Math.round(Math.sin(th) / ANGTOL)}`;
}
/** Frontier-expand to screen radius boundR without face tracing/pruning (builder use). Returns
 *  false if maxInsts capped the fill (caller must treat the orbit as incomplete). */
extendTo(view: Su11, boundR: number, maxInsts: number): boolean
instanceCount(): number
```

- [x] **Step 2: tests** — deep dedup produces identical shallow patches (same faces at boundR .9
  as default mode) for two sample tilings; `extendTo` reports capped=false and grows monotonically.
- [x] **Step 3: run suite, commit**

### Task 2: `lib/render/hyperbolicDirichlet.ts` — certified domain + side pairings

**Files:**
- Create: `lib/render/hyperbolicDirichlet.ts`
- Test: `tests/hyperbolic-dirichlet.test.ts`

```ts
export interface DirichletDomain {
  gens: Su11[];          // side pairings ∪ inverses, deduped — the COMPLETE reduction set
  polyKlein: [number, number][]; // D as a convex polygon in the Klein model
  RD: number;            // hyp circumradius of D
  rInHyp: number;        // hyp inradius (min distance 0 → side)
  rPEu: number;          // Poincaré Euclid circumradius = tanh(RD/2)
  rInEu: number;         // Poincaré Euclid inradius = tanh(rInHyp/2)
  certified: true;
  stats: { orbit: number; sides: number; instances: number; Rcomplete: number; ms: number };
}
export function buildDirichletDomain(darts: Darts, edge: number):
  DirichletDomain | { certified: false; reason: string }
```

Algorithm (all f64):
1. `rMaxTile = max over lvert p of asinh(sinh(edge/2)/sin(π/p))` (assert p ≥ 3, else fail loud);
   `M = 2·rMaxTile + 0.15` (flood-fill connectivity margin: any instance with vertex in B(R) is
   reachable through instances with vertices in B(R + 2·rMaxTile)).
2. Loop (≤ 14 rounds): `Rdev = Rcomplete + M`; `boundEu = tanh(Rdev/2)`; fail loud if
   `boundEu > 0.99995` or `extendTo` caps. Collect `deckFrames()`, positions `γ·0`, drop d > Rcomplete,
   dedup by direction×distance grid.
3. Klein half-plane intersection: bisector of 0 and orbit point at hyp distance d, direction u, is
   the chord `x·u = tanh(d/2)` (hyperboloid-model derivation); clip a [-2,2]² square by all.
   If any polygon vertex has |v| ≥ 1 (Klein), D̂ unbounded ⇒ grow `Rcomplete += 1` and repeat.
4. Certificate: `2·R_D̂ + 0.1 ≤ Rcomplete` ⇒ D̂ = D (any farther orbit point's bisector stays
   ≥ Rcomplete/2 > R_D̂ from 0). Else `Rcomplete = max(Rcomplete·1.15, 2·R_D̂ + 0.25)` and repeat.
5. Side pairings: orbit points whose bisector comes within 1e-7 of the polygon
   (min over vertices of `c − v·u`); gens = those frames ∪ inverses, deduped; fail loud if > 64.

- [x] **Step 1: failing test** — all 59 shipped tilings certify; sides ≤ 64; RD ≤ 3.5; and the
  greedy fold with `gens` lands inside D̄ (all Klein slacks ≥ −1e-7) from 300 random points
  r ≤ 0.999 per sample tiling, ≤ 96 iterations (this is the Voight guarantee, asserted).
- [x] **Step 2: implement; run; commit**

### Task 3: rewrite `lib/render/hyperbolicReduce.ts` — total field + shader packing

**Files:**
- Modify: `lib/render/hyperbolicReduce.ts` (replace heuristic internals; keep `ShaderTiling`,
  `TileField`, `prepareShaderTiling` exported names)
- Test: `tests/hyperbolic-reduce.test.ts` (rewrite)

```ts
export interface ShaderTiling {
  gens: Float32Array;  // side pairings, [a.x,a.y,b.x,b.y] each
  field: TileField;    // TOTAL lookup field over the square [-rTex,rTex]²
  rInEu: number;       // shader early-exit radius (inside D for sure)
  rTex: number;        // = field.rTex = tanh((RD + 0.15)/2), covers D̄ + collar
  domain: DirichletDomain;
}
export function prepareShaderTiling(darts: Darts, edge, meta, opts?: { fieldRes?: number }):
  ShaderTiling | null   // null = certification failed (caller falls back to 2D polygons, loudly)
export function foldIntoDomain(gens: Su11[], w: Complex, rInEu: number): { w: Complex; iters: number }
```

Field bake (the totality invariant):
1. Shallow develop faces to `tanh((RD + 0.15 + 2·rMaxTile + 0.2)/2)` (every face that can touch
   D + collar closes inside the patch), geodesic-tessellate (SEG 12), grid-index.
2. Per texel q (row-major, res×res, default adaptive `res = clamp(384, 2048, 4·rTex/((1−rTex²)·0.006))`):
   locate q; if miss, `foldIntoDomain` then locate; if still miss, mark unresolved.
3. Post-pass: unresolved texels copy the nearest resolved texel (float cracks between tessellated
   polygons, square corners outside the disk). Assert: unresolved BEFORE post-pass is < 0.5 % and
   none deeper than |q| < 0.95·rTex — else console.error (loud, never silent).
4. Channels: R = side count, G = hyp distance to the containing tile's boundary (EDGE_SCALE 510),
   A = 255. B free.

- [x] **Step 1: failing tests** — (a) field totality: 0 unresolved-after-postpass for all 59 at
  res 192; (b) agreement vs direct-develop reference ≥ 0.99 at r ≤ 0.95 on 8 samples INCLUDING the
  four hole tilings (old test: 0.97 at r ≤ 0.8 with known 7–17 % holes beyond); (c) atlas-wide
  ≥ 0.985.
- [x] **Step 2: implement; run; commit**

### Task 4: shader — complete gens, convergence-based loop, nearest id + bilinear distance, no black

**Files:**
- Modify: `lib/render/hyperbolicPerPixelGL.ts`

Changes to FRAG:
```glsl
uniform float uRIn;     // Euclid inradius of D: |w| below this ⇒ inside, stop
// loop: exit on "no generator improves" (Voight: that IS w ∈ D̄), not on a fixed radius:
for (int it = 0; it < 96; it++) {
  float r2 = dot(w, w);
  if (r2 <= uRIn * uRIn) break;
  /* best-of over uNumGens as now */
  if (!found) break;            // inside D̄ (no improvement possible) — GUARANTEED terminal
  w = best;
}
// sampling: id NEAREST (texelFetch), distance manual-bilinear of G over 4 texelFetches
// (von Gagern §4.2.3: LINEAR across a domain boundary blends far-apart sources).
// fallback: if dot(w,w) > uRTex² after the loop (unconverged sub-pixel rim), re-aim
// w = normalize(w) * uRIn * 0.9 and sample — a plausible tile colour, NEVER the background.
```
Uniform `uRTex` is now per-tiling (from ShaderTiling), `uRIn` new; `MAX_GENS` stays 64.
`setTiling(t: ShaderTiling)` replaces `(gens, field)` signature.

- [x] **Step: build + tests still green; commit** (shader is exercised visually in Task 6)

### Task 5: view re-anchoring + canvas/thumbnail wiring

**Files:**
- Modify: `components/hyperbolic-developed-canvas.tsx`
- Modify: `components/hyperbolic-developed-thumbnail.tsx`

Canvas render loop, after pan/rotation composition:
```ts
// (tile, residual) camera: fold the camera basepoint back into D via the side pairings, absorbing
// the deck word into nothing (the tiling is Γ-invariant) — view stays a few units from identity
// forever, so float32 uniforms never degrade and panning is unlimited.
let c = su11ApplyInverse(viewRef.current, ORIGIN);
for (let i = 0; i < 64 && Math.hypot(c.x, c.y) > st.rTexAnchor; i++) {
  let best = -1; let bestR = Math.hypot(c.x, c.y);
  for (let g = 0; g < st.gensSu.length; g++) {
    const q = su11Apply(st.gensSu[g], c);
    const r = Math.hypot(q.x, q.y);
    if (r < bestR - 1e-12) { bestR = r; best = g; }
  }
  if (best < 0) break;
  c = su11Apply(st.gensSu[best], c);
  viewRef.current = su11Normalize(su11Mul(viewRef.current, su11Inverse(st.gensSu[best])));
}
```
(`rTexAnchor = domain.rPEu + 0.05`.) `prepareShaderTiling` now takes darts directly; null result ⇒
2D fallback path (existing) + console.error. Thumbnails: same new API, `fieldRes: 512`.

- [x] **Step: wire, run full suite, `pnpm build`, commit**

### Task 6: visual + build verification

- [x] Playwright: screenshot the four hole tilings (`hyp-k2-3-3-4-3-4-4__3-3-4-3-4-4`,
  `hyp-k2-3-3-3-4-4-4__3-3-3-4-4-4`, `hyp-k2-3-3-3-4-4-4__3-3-4-3-4-4`,
  `hyp-k2-3-3-3-4-6-4__3-3-4-3-4-6`) at identity and after a scripted long pan; Read the PNGs;
  zero background-coloured holes.
- [x] `pnpm build` clean; full `pnpm test` green.
- [x] Remove `scripts/scratch-hyp-holes.ts`; SYNC + DEVELOPMENT_NOTES entries; commit.

## Self-review

- Spec coverage: robustness for any tiling → certificate is per-tiling data-driven, fails loud into
  the 2D fallback; shader speed → same loop shape as shipped; pixel-sharp → analytic-quality
  distance strokes + nearest id (+ collar); infinite scroll → Task 5 re-anchoring. ✔
- Types consistent across tasks (`ShaderTiling`, `DirichletDomain`, `foldIntoDomain`). ✔
- No placeholders: core math and loops are spelled out above; file-local details (uniform plumbing,
  caches) follow existing patterns in the named files. ✔
