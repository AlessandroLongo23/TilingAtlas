# length → weight: the qualitative bound, PROVEN (2026-07-06, CC for AL)

**Theorem (length ⇒ weight).** For every edge-to-edge tiling by unit regular {3,4,6,12} polygons
there is an explicit constant `C` (≤ ~80, see proof) with

>  `wt(v) ≤ C·|v| + c`  for every period vector `v`.

Consequently, for **round** tilings (where `λ₁ = λ₂ ≤ (2√2+√6)√k` by the size bound),

>  **`s* ≤ C·λ₁ = O(√k)` — round tilings are `O(√k)` in WEIGHT, not just length.**

This closes the "inert / length-only" objection from the adversarial review: the size bound *does*
yield a weight bound. **What it does not do is make k=3 feasible** — the constant is ~50× too large,
and no loose routing fixes that (see the ladder at the end). That gap is the quantization lemma.

---

## Geometric inputs (all verified on the 1351-tiling catalogue, `experiments/th10-geominputs.py`)

1. **Separation = 1.** Distinct vertices are ≥ 1 apart (min over catalogue = 1.000000, at t4025).
2. **Degree ≤ 6.** Every vertex has ≤ 6 incident edges (max over catalogue = 6, at t1011).
3. **Covering radius `r₀ = (√6+√2)/2 ≈ 1.932`.** Every plane point is within `r₀` of a vertex (each
   point lies in a tile; the farthest interior point from a tile's corners is its centre, at distance
   = circumradius; the 12-gon's `1.932` is the max).
4. **Interior angles ≤ 150°**, so at any vertex the incident edges leave no angular gap > 150°.

These are elementary consequences of "unit regular {3,4,6,12}, edge-to-edge"; the catalogue check is a
bug-guard, not the proof.

---

## Proof

**Step 1 — walk bound (A₁).** Any edge-walk from vertex `x` to vertex `y = x+v` is a sum of unit
edge-vectors telescoping to `v`, so `wt(v) ≤ (#edges of the walk) = d_graph(x,y)`. It remains to bound
the graph distance by `C|v|`.

**Step 2 — shadow the straight segment.** Perturb the segment `S = [x,y]` slightly so it meets no
vertex (endpoints fixed). `S` passes through a sequence of tiles `T₀,…,T_M`, each consecutive pair
sharing the one edge of `S`'s crossing. Build a walk: inside each `Tᵢ`, go along `∂Tᵢ` from the entry
edge to the exit edge — at most `⌊pᵢ/2⌋ ≤ 6` steps (a convex `pᵢ`-gon, `pᵢ ≤ 12`). Consecutive arcs
meet at the shared crossed edge (reconcile with ≤ 1 step). Hence

>  `d_graph(x,y) ≤ 7·(M+1)`,  where `M+1` = number of tiles `S` crosses.

**Step 3 — count the crossings.** `M` = number of edges `S` crosses. Every crossed edge has a point on
`S`, so (edge length 1) both its endpoints lie in the tube `N₁(S)`. By separation = 1, the vertices in
any region form disjoint radius-½ disks, so `#{vertices in N₁(S)} ≤ area(N_{3/2}(S))/(π/4) ≤
(3|v| + π·2.25)/(π/4) = (12/π)|v| + 9 ≤ 3.82|v| + 9`. By degree ≤ 6 (each edge shares 2 endpoints),
the edges with an endpoint in `N₁(S)` number `≤ 3·(3.82|v|+9)`. Therefore

>  `M ≤ 11.5|v| + 27`.

**Step 4 — combine.** `d_graph(x,y) ≤ 7·(11.5|v| + 28) = 80.3|v| + 196`. With Step 1,
`wt(v) ≤ 80.3|v| + O(1)`. Taking `C = 81`: **`wt(v) ≤ 81|v| + c`.** ∎

For round tilings, `λ₁ = λ₂`, so both reduced generators have length `≤ (2√2+√6)√k`, giving
`s* ≤ 81·(2√2+√6)·√k = O(√k)`. **Qualitative length → weight is proven.**

---

## The honest constant ladder (why this is real but not yet useful)

`s* ≤ C_stretch · λ₁`, and `λ₁ ≤ C_len·√k`. The k=3 pool budget is `C_stretch·C_len·√3`:

| `C_stretch` | source | `× C_len(5.278)` ⇒ s*(3) ≤ | k=3 |
|---|---|---|---|
| **81** | this proof (rigorous) | **740** | dead |
| ~50 | ledger E-3 (careful packing) | 457 | dead |
| ~3.86 | optimistic greedy (`√6+√2`) | 35 | dead |
| **1.30** | **true** (measured max wt/|v|) | 11.8 | feasible |
| 1.155 = 2/√3 | hexagonal, exact | 10.6 | feasible |

The proven constant is ~60× the truth. And the point that matters: **even an optimistic loose routing
constant (3.86) still gives `s*(3) ≈ 35`, dead.** There is no loose-analysis path to k=3.

## What "length → weight" reduces to, for feasibility

The true `C_stretch` for round champions is exactly `2/√3`, attained **only** by the √3-direction
zig-zag (`wt(m√3·ζʲ) = 2m`, no detour). Reaching it therefore requires knowing the shortest round
period **is** a √3 / Eisenstein-direction vector — the **period-quantization lemma** (`residual-verdict`).
Loose dilation cannot substitute (the table proves it). So:

> **Qualitative length→weight: DONE (this note).**
> **Feasibility-grade length→weight ⟺ the quantization lemma:** *the shortest period of a round tiling
> is a 30°-grid (√3 / Eisenstein) direction.* Prove that and round periods get exact weight `2m` by an
> explicit zig-zag generator — no dilation constant — exactly as the elongated strips already do.

*Theory artifact — for TA. Reproducers: `experiments/th10-geominputs.py`, `experiments/th10-dilation.py`.*
