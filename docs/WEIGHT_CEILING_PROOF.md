# The weight ceiling for k-uniform tilings: w(k) = 2k + 2⌊(k−1)/3⌋

Oracle-independent proof document, **version 2** (2026-07-10, CC; extremal construction due to
AL). Version 1 was attacked by five independent adversarial referees; every FATAL and GAP
finding is incorporated or explicitly ledgered below (§10 documents the round). No enumeration
data enters any proof; the one prior empirical input is the *statement* being proved.

Scoping (honest, up front):
- THEOREM A (width-2 exact law, pgg): proven, conditional only on Lemma 3.1(d) (a stated,
  isolated tile-exclusion gap at width 2).
- THEOREM B (achievability): proven unconditionally modulo the finite Appendix-A verifications,
  which are explicit and hand-checkable (the construction is exhibited; no inventory lemma is
  needed to verify an exhibited tiling).
- THEOREM C (pmg analogue): same status as A.
- THEOREM D (global upper bound over all k-uniform tilings): proven for shortest-period lengths
  λ₁ ∈ {1, 2} and λ₁ ≥ T₀, and for all rigid-lattice groups; the band λ₁ ∈ (1, 2) ∪ (2, T₀)
  is Lemma M (open; scope precisely stated in §7). T₀ depends on the crossing constant of
  Appendix B: T₀ = 7 if c₁ = 2 is proven there, T₀ ≈ 330 under the crude proven constant.
- SMALL-k SCOPE (AL, 2026-07-10): the pgg law is the GLOBAL maximum only for k ≥ 4. At
  k = 1, 2, 3 the maximum is k + 4 (values 5, 6, 7), achieved by rigid p6m tilings (4.6.12
  at k = 1; the 3.4.6.12 family at k = 2, 3), which exceed the pgg line there. This does not
  contradict any theorem here (Case W1 bounds the rigid regime by O(√k) + const, which
  dominates at small k and drops below the pgg line for k ≥ 4 empirically, k ≥ ~34 provably
  with crude constants); it corrects the headline. A complete all-k enumeration budget is
  max(2k + 3, 2k + 2⌊(k−1)/3⌋). Exactness of the k ≤ 3 values is a finite check (rigid
  lattice + k ≤ 3 bounds the cell area, hence finitely many tilings), flagged OPEN as such.
  Mechanism (AL's escape-cost model): W ≈ 2c + traverse + O(1) on round lattices, c ≤ 2 the
  cost of escaping a 12-gon vertex and traverse ≈ orbit-graph diameter = O(√k) for compact
  fundamental domains; the model is scoped to the rigid regime (AL): its middle term
  relies on orbit-graph connectivity of the fundamental domain, which holds for compact
  domains but fails in the stretched pgg regime — hence the two different arguments in this
  document. Extrapolated outside its regime, 2c + 2k − 1 = 2k + 3 is overtaken by the pgg
  ceiling at k = 7: one way to locate the regime boundary.

## 1. Setting

𝒯: edge-to-edge tilings of ℝ² by regular polygons of unit edge with 3, 4, 6, 12 sides (the
octagon is excluded: an octagon forces the unique 4.8.8 tiling, Grünbaum–Shephard §2.1, a
solved case). All interior angles are multiples of 30°; fixing one edge direction, every edge
is parallel to some ζ₁₂^j (ζ_N = e^{2πi/N}), and all vertices lie in x₀ + ℤ[ζ₁₂] ⊂ ℂ.

T is k-uniform if its symmetry group G = Sym(T) has exactly k vertex orbits. Such T is
periodic with wallpaper group G (an isogonal-class tiling of bounded valence is
crystallographic; G–S §6.3 for the isogonal case, applied per orbit class). Λ = the FULL
translation subgroup of G ("primitive cell" always refers to Λ; a proper sublattice cell is a
"supercell" and never enters). P = G/Λ, |P| ≤ 12. For vertex v, stab(v) ≤ P is its point
stabilizer; per primitive cell the vertex count is

    n = Σ_{orbit classes i} |P| / |stab_i|.                                     (1.1)

wt(x), x ∈ ℤ[ζ₂₄]: the least m with x a sum of m unit 24th roots. W(T) = min over bases
(u, v) of Λ of max(wt(u), wt(v)); wt takes positive integer values and any single basis
witnesses finiteness, so the min is attained. Lower bounds on wt are always algebraic
certificates (§2), never Euclidean, because ℤ[ζ₂₄] is dense in ℂ.

**Lemma 1.1 (λ₁ ≥ 1).** Distinct vertices of T ∈ 𝒯 are at distance ≥ 1; hence every nonzero
period has length ≥ 1.
*Proof.* Let u ≠ v be vertices, d(u,v) < 1. The tiles incident to v cover a neighborhood of v;
u is not interior to any tile (tiles have no interior vertices) and not interior to any edge
(edge-to-edge), so u is a corner of some tile t incident to v. Two corners of a unit-edge
regular polygon are at distance ≥ 1. ∎

## 2. Weight certificates (verified independently by two referees)

Power basis e_j = ζ₂₄^j, j = 0..7; Φ₂₄(x) = x⁸ − x⁴ + 1, so ζ₂₄^{8+m} = e_{4+m} − e_m
(m = 0..3) and ζ₂₄^{12+j} = −ζ₂₄^j.

**Lemma 2.1 (certificate principle).** If a ℚ-linear functional χ on ℚ(ζ₂₄) satisfies
|χ(ζ₂₄^j)| ≤ 1 for j = 0..23, then wt(x) ≥ |χ(x)| for all x ∈ ℤ[ζ₂₄].

**Lemma 2.2 (the three certificates).** Define φ(e₄) = 1, ψ(e₆) = 1, φ′(e₀) = 1 (each zero on
the other e_j). Then φ, ψ, φ + ψ and φ′ all satisfy the hypothesis of 2.1 (φ + ψ because no
root has both coordinates nonzero: values on ζ₂₄^j, j = 0..11 are φ: δ_{j,4} + δ_{j,8},
ψ: δ_{j,6} + δ_{j,10}). Moreover, with i√3 = 2e₄ − e₀ and i = e₆:
(a) for x = r + c·i√3 + s·i with r in the real subfield, c ∈ ½ℤ, s ∈ ℤ: φ(x) = 2c (φ is
    ℚ-linear, so half-integral c is fine), and if moreover r ∈ ℚ then ψ(x) = s, so
    (φ+ψ)(x) = 2c + s and wt(x) ≥ 2c + s. (The rationality hypothesis is needed because
    ψ(√3) = −1; on width-2 tubes all periods have rational real part, Prop 4.2.)
(b) wt(2) = 2 (φ′), wt(c·i√3) = 2|c| (φ; upper bound by the 2-step word ζ₁₂² + ζ₁₂⁴).
*Proof.* Direct computation in the power basis; the real subfield has ℚ-basis
{1, 2cos15° = e₁+e₃−e₇, √2 = e₁+e₃−e₅, √3 = 2e₂−e₆}, on which φ vanishes identically and
ψ vanishes except ψ(√3) = −1 — whence the rationality hypothesis on r in (a). ∎

**Lemma 2.3 (tall vectors in every basis).** Let Λ = ⟨u, v⟩ with u = 2 and
v = q + i·H, q ∈ ℚ, H = c√3 + s (c, s ∈ ℤ≥0). Every basis of Λ contains a vector w with
wt(w) ≥ 2c + s; hence W(T) ≥ min(… ) = 2c + s whenever 2c + s ≥ 2.
*Proof.* ht = Im: Λ → ℝ has image H·ℤ; some basis vector has |ht| ≥ H, i.e. equals
±(q′ + i·mH), m ≥ 1, q′ ∈ ℚ (integer combinations keep the real part rational). Apply 2.2(a)
with the coefficients of mH. ∎

## 3. Width-2 tubes: structure

Standing assumptions for §§3–6: T ∈ 𝒯, shortest period u with |u| = 2.

**Lemma 3.0 (no oblique width 2; verified by exhaustive finite check).** The solutions of
|x|² = 4, x = a + bζ₁₂ + cζ₁₂² + dζ₁₂³ ∈ ℤ[ζ₁₂] — where |x|² = (a² + b² + c² + d² + ac + bd)
+ √3(ab + bc + cd) — are exactly the twelve x = 2ζ₁₂^j. Hence u is parallel to an edge
direction; rotate by a multiple of 30° (a symmetry of the direction set and of wt) so u = 2.
T lives on the cylinder 𝒞 = ℝ²/2ℤ. [The finite check is a bounded search: coefficients are
bounded by |a| ≤ … all coordinates ≤ 5 suffice since the quadratic form is positive definite
with least eigenvalue > 4/25; a referee ran it independently.]

**Lemma 3.1 (width-2 tile inventory).** On 𝒞 every tile is one of:
upright triangle (one horizontal edge), upright square (horizontal + vertical edges), or
hexagon with horizontal long diagonal spanning the full circumference.
*Proof, by excluded candidate.*
(a) Dodecagon: minimal width 2 + √3 > 2 in every direction; cannot embed in circumference 2.
(b) 45°-tilted square: not direction-legal (45° ∉ 30°ℤ); nothing to exclude.
(c) Hexagon with long diagonal vertical (flat sides, width √3 across): its two unit vertical
    edges leave a residual column of width 2 − √3 ≈ 0.268 closing the circumference. Any tile
    sharing a full unit vertical edge (square, vertical-edge triangle, vertical hexagon)
    extends ≥ √3/2 > 0.268 from that edge and overlaps; T-vertices are excluded by
    edge-to-edge. So no tile can fill the column. Same argument excludes ANY configuration
    whose widths sum to 2 with a residual gap in (0, √3/2).
(d) Vertical-edge ("sideways") triangle, 30°-tilted square: **STATED GAP — Lemma 3.1(d)**.
    The v1 chord-sum argument was unsound (a referee showed it would exclude the surviving
    hexagon too). Two repair routes, neither completed: (i) the vertex-level affine-chord
    Diophantine argument (crossing abscissae live in (1/2)ℤ + (√3/6)ℤ; the finite case check
    over crossed-tile sequences with Σ chords = 2 remains to be done); (ii) vertical-strip
    decomposition (where it applies, column widths obey m·(√3/2) + n·1 + h·√3 = 2, forcing
    m = h = 0 by irrationality). Everything in §§4–6 is conditional on 3.1(d) and on nothing
    else. Note Theorem B (the construction) does NOT depend on 3.1: an exhibited tiling is
    verified directly.
(e) Completeness of (a)-(d): the direction-legal unit tiles have orientation classes
    (mod 30° and symmetries of the tile): triangle 2, square 2, hexagon 2, dodecagon 1;
    all are listed above. ∎

**Lemma 3.2 (slab decomposition).** Granting 3.1, 𝒞 splits into a cyclic stack of horizontal
slabs, each of type:
  (T) triangle slab: height √3/2, one up- and one down-triangle per cell, 2 vertices;
  (S) square slab: height 1, exactly two unit squares side by side, 2 vertices;
  (H) hexagon slab: height √3, one full-width hexagon plus one up- and one down-triangle in
      the corners at its diagonal ends, 3 vertices.
(Vertex counts use the convention that each slab is charged the vertices of its lower
boundary row plus interior vertices; cyclically every vertex is charged once.)
*Proof.* Among the 3.1 inventory only squares have vertical edges; a square's vertical edge
must abut, full length, another square's vertical edge (edge-to-edge, no T-vertices), so
squares propagate horizontally into a full ring of two squares: type (S), and no
square/triangle height mismatch ever occurs inside a slab. A hexagon's horizontal long
diagonal has length 2 = the full circumference, so its two diagonal endpoints coincide on 𝒞:
one hexagon per H slab, corners filled by one triangle above and one below the diagonal ends
(areas: 2√3 = 3√3/2 + 2·(√3/4)). What remains is rows of upright triangles: type (T). ∎

**The deleted-lattice picture.** Erasing S slabs, the T/H stack is the triangular row grid
(rows at spacing √3/2, two vertices per row per cell, x-offsets alternating {0,1} and
{1/2, 3/2} mod 2) minus a set D of deleted vertices (hexagon centers), one per H slab.

**Lemma 3.3 (deletion cascade; verified incl. cylinder wrap).** If (x, row j) ∈ D then no
other vertex of rows j−1, j, j+1 is in D. *Proof.* Two hexagons cannot share a triangle.
Same row: the partner vertex is at distance 1. Adjacent rows: both vertices are at
displacement (±1/2, ±√3/2) — using x ± 3/2 ≡ x ∓ 1/2 (mod 2) — i.e. distance exactly 1
(minimum over lifts). ∎

**Corollary 3.4.** Deletions occupy pairwise non-adjacent rows: at most every other row.

## 4. The exact weight of a width-2 tube

Let the primitive cell stack consist of a H slabs, t T slabs, s S slabs (cyclically), so per
cell: height H = a√3 + t·(√3/2) + s, vertex count

    n = 3a + 2t + 2s.                                                            (4.1)

**Lemma 4.1 (slab path; zero splices — the both-slots routing).** There is an edge path from a
vertex x to x + v (v the tall period) of length exactly 2a + t + s.
*Proof.* Per-slab monotone chains: T = 1 edge (a 60°-edge, gaining √3/2, entering at either
slot, exiting with horizontal shift ±1/2, sign free); S = 1 vertical edge (gain 1, shift 0);
H = 2 edges up a hexagon flank through the full-width vertex (the two long-diagonal endpoints
are one point on 𝒞), gaining √3, entering at either slot of the lower boundary row and
exiting directly above the entry (shift 0). H slabs accept either entry slot, so consecutive
chains splice with no extra edges for every deletion word. The T-slab signs (t of them, and
for pgg t is even, §6) realize any net horizontal shift of the correct parity, matching the
real part q of v (q ∈ ℤ and even for pgg, Lemma 6.1(iii); in general the achievable shifts
cover q's residue). Total: 2a + t + s edges. ∎

**Proposition 4.2 (exact weight).** For a width-2 tube with q ∈ ℚ (which holds: vertex
x-coordinates lie in (1/2)ℤ, so all periods have rational real part):
wt(v) = 2a + t + s, and W(T) = max(2, 2a + t + s) = 2a + t + s whenever the cell has ≥ 2 slabs.
*Proof.* Upper: 4.1. Lower: Im v = a√3 + t√3/2 + s = ((2a + t)/2)√3 + s; Lemma 2.2(a) with
c = (2a+t)/2 ∈ ½ℤ gives wt(v) ≥ 2c + s = 2a + t + s directly. Every basis contains a vector
of |ht| ≥ H (Lemma 2.3), with the same lower bound; wt(u) = 2. ∎

So for width-2 tubes the weight question IS the combinatorial question: how large can
2a + t + s be at k orbits? By (1.1) and (4.1), writing b = number of orbit classes with
|stab| = 2 and using stab ≤ 2 for the relevant groups (§5–6): n = 4k − 2b, hence

    wt(v) = 2a + t + s = (n + a)/2 = 2k − b + a/2.                               (4.2)

Everything now rides on capping a (the hexagon count) via the group.

## 5. Groups on width-2 tubes

**Lemma 5.1 (rigid groups cap at k ≤ 4, W = 2).** If P contains a rotation of order 3, 4, 6,
the lattice is hexagonal or square (crystallographic restriction), so λ₂ = λ₁ = 2 and the cell
area is 2√3 or 4. Minimal vertex corner-area is a_min = √3/2 (the 3⁶ vertex; corner-areas:
triangle √3/12, square 1/4, hexagon √3/4, dodecagon (2+√3)/4). So n ≤ 4·(2/√3)·… ≤ 4, k ≤ 4,
and both periods have length 2 = wt 2: W = 2 < 2k + 2⌊(k−1)/3⌋ for k ≥ 2. (Boundary example:
kagome, width-2, p6m, k = 1, n = 3.) ∎

**Lemma 5.2 (vertical mirror ⟹ W ≤ 2k; |P| = 2 ⟹ W ≤ k + …).** Suppose G contains a
reflection with vertical axis. Its two axis lines x ≡ c, c + 1 (mod 2) pin one offset class of
rows pointwise; deletions cannot sit in swapped rows (the image deletion would be the row's
other vertex, adjacent), so every deletion row is pinned-parity, and every S slab is
compatible. Accounting per cell (2R triangle-grid rows, h = a deletions, plus S slabs):
pinned vertices ≥ (surviving vertices of deletion rows) = a. With |P| = 4:
k ≥ (n + a)/4 = wt(v)/2 by (4.2)-arithmetic, so W ≤ 2k. With |P| = 2 (pm, cm):
k ≥ (n + a)/2, so W ≤ k. ∎

**Lemma 5.3 (single-position-parity deletions ⟹ vertical mirror).** On the cylinder the two
vertical-mirror classes are x ↦ −x (fixes integer offsets pointwise, swaps half-integer ones)
and x ↦ 1 − x (vice versa). The triangular grid and any stack of S slabs are invariant under
both. Hence: if ALL deletions sit at integer offsets, x ↦ −x is a symmetry of T; if all at
half-integer offsets, x ↦ 1 − x is. In either case G contains a vertical mirror.
*Proof.* A deletion at a fixed offset maps to itself; grid and squares map to themselves;
a tiling of this class is determined by its deletion set and S-slab positions (the
determined-by-word principle: the slabs and grid are rigid, only D varies), so the isometry
is a symmetry. ∎

**Lemma 5.4 (stabilizers for pgg AND pmg).** pgg contains no reflections; its non-translations
are glides and 2-folds, so vertex stabilizers have order ≤ 2. For pmg the same conclusion
holds: a stabilizer of order 4 inside the point group 2mm would put a 2-fold on a mirror
axis, and (mirror)∘(2-fold at a point of the axis) is the perpendicular reflection through
that point, giving reflections in two directions — pmm or cmm, not pmg. Hence for both
groups c = 0 in (1.1): n = 4k − 2b, n even, and a is even (n = 3a + 2t + 2s even, t and s
even by 6.1(i)).

**Lemma 5.5 (cmm centering; referee-supplied).** For cmm the primitive cell is spanned by
u = 2 and a centering vector (q, H/2) with q odd; membership in ℤ[ζ₁₂] forces the centering to
map rows to rows of the same offset class with an odd x-shift. The accounting of 5.2 applied
to the primitive (centered) cell gives W ≤ 2k for every cmm width-2 tube. ∎

## 6. The integer program, and the exact laws (Theorems A, B, C)

Standing: width-2 tube, granting 3.1(d); slab data (a, t, s), b pinned orbit classes,
wt(v) = 2k − b + a/2 by (4.2). Write α = a/2 (integer by 5.4).

**Lemma 6.1 (the three constraints).** For a primitive width-2 tube with G = pgg (and, where
noted, pmg — both contain the vertical-axis glide family):
(iii) [integral, even shear — proved first since (i) uses it] q ∈ ℤ: q ∈ ½ℤ by §3's offsets,
    and Λ is invariant under the point group, in particular under the reflection class
    x ↦ −x, so (−q, H) ∈ Λ and (2q, 0) ∈ Λ ∩ ℝ = 2ℤ. q even: suppose q odd; then the
    vertical translations in Λ are 2Hℤ, and γ² = (0, 2δ) ∈ Λ gives δ ≡ 0 or H (mod 2H).
    δ ≡ 0 makes γ itself a vertical mirror modulo Λ; δ ≡ H makes t_{−v}∘γ: (x, y) ↦
    (2c − q − x, y) a vertical mirror outright. pgg (and pmg, else pmm/cmm) has no vertical
    mirrors: contradiction. So q is even and Λ = ⟨(2, 0), (0, H)⟩.
(i) [even counts] a, t, s are all even. By (iii), γ² = (0, 2δ) ∈ Hℤ gives δ ∈ {0, H/2}
    mod H; δ ≡ 0 is a mirror (excluded), so δ = H/2. γ maps the slab decomposition to itself
    shifting heights by H/2, and no slab is γ-invariant: its lower boundary height b would
    satisfy b + H/2 ≡ b (mod H), i.e. H ≡ 0. So the H/2-shift pairs the slabs
    type-preservingly and every count is even.
(ii) [mirror exclusion] If a > 0 then deletions occur at BOTH offset parities (else Lemma 5.3
    gives a vertical mirror, contradicting pgg). Offset parity changes exactly across each
    T slab (one row step) and is preserved by H (two row steps) and S slabs; the total number
    of parity switches around the cycle, t, is even by (i), and both parities occupied means
    the switches are ≥ 2 and fall into ≥ 2 odd T-runs: **t ≥ 2**. ∎

**Lemma 6.2 (parity link).** t + s = 2k − b − 3α by (4.1) + n = 4k − 2b; t, s even (6.1(i))
forces b ≡ α (mod 2).

**Theorem A (width-2 pgg exact law; conditional only on 3.1(d)).** For every k ≥ 2, every
primitive k-uniform width-2 tube with G = pgg satisfies
W ≤ 2k + 2⌊(k−1)/3⌋, and the bound is attained (Theorem B).
*Proof.* W = wt(v) = 2k − b + α (4.2). If a = 0: W ≤ 2k − b ≤ 2k, below the bound for k ≥ 2…
(2⌊(k−1)/3⌋ ≥ 0). If a > 0: by 6.1(ii), t ≥ 2, so 3α = 2k − b − (t + s) ≤ 2k − b − 2, giving
α ≤ (2k − b − 2)/3 and
    α − b ≤ (2k − 2 − 4b)/3 ≤ (2k − 2)/3.
α − b is an even integer (6.2), so α − b ≤ 2⌊⌊(2k−2)/3⌋/2⌋ = 2⌊(k−1)/3⌋ (residue check:
k = 3m → ⌊(6m−2)/3⌋ = 2m−1 → even part 2m−2 = 2⌊(k−1)/3⌋; k = 3m+1 → 2m = 2⌊(k−1)/3⌋;
k = 3m+2 → 2m = 2⌊(k−1)/3⌋). Hence W = 2k + (α − b) ≤ 2k + 2⌊(k−1)/3⌋. ∎

**Remark (v1's error, for the record).** v1 claimed the extremum on pure hexagon/triangle
tubes ("squares only dilute"). False: at k ≢ 1 (mod 3) the maximum requires S slabs (the
budget 2k − b − 2 − 3α is spent on s), and v1's own extremal family was mirror-symmetric,
hence pmg, not pgg. Both errors were found in the adversarial round and by the author
independently; the program above supersedes that whole treatment.

**Theorem C (width-2 pmg law; same conditionality).** For pmg (mirrors necessarily horizontal
on an extremal tube: vertical mirrors give W ≤ 2k by 5.2):
W ≤ 2k + 2⌊(k−2)/3⌋ (attainment: Appendix A.2, OPEN).
*Proof.* pmg's two horizontal mirror-axis classes each need a "host": an axis is a horizontal
line about which the slab stack is symmetric; it passes through a vertex row (pinning that
row's surviving vertices: contributes to b), through a hexagon's center row (the surviving
vertex of that row is again fixed: contributes to b), or through the midline of an S slab
(no pinning). The two axis classes are either exchanged by the vertical glide (then their
hosts have equal type) or each self-paired. Case s-hosted: s ≥ 2 (even counts hold for pmg
too — pmg contains the vertical-axis glide family). Case vertex-hosted: b ≥ 1, and by 6.2's
parity link and the mirror-exclusion constraint (pmg also has no vertical mirrors, else pmm:
t ≥ 2 as in 6.1(ii)):
- a = 0: W ≤ 2k − b ≤ 2k ≤ 2k + 2⌊(k−2)/3⌋ for k ≥ 2. Otherwise t ≥ 2 (6.1(ii), which
  applies to pmg: a vertical mirror would give pmm/cmm).
- s-hosted: s ≥ 2, so 3α ≤ 2k − b − 2 − 2 ⟹ α − b ≤ (2k − 4)/3, even ⟹ ≤ 2⌊(k−2)/3⌋
  (residues: k=3m → ⌊(6m−4)/3⌋ = 2m−2 even ✓ = 2⌊(k−2)/3⌋; k=3m+1 → 2m−1 → 2m−2 ✓;
  k=3m+2 → 2m ✓).
- vertex- or hexagon-center-hosted: b ≥ 1 and α − b ≤ (2k − 2 − 4b)/3, even. Per-residue
  check at b = 1 (the best case): the largest even α − 1 with 3α ≤ 2k − 3 gives 2m−2, 2m−2,
  2m−2 at k = 3m, 3m+1, 3m+2, versus the ceiling 2m−2, 2m−2, 2m: equality at k ≡ 0, 1 (mod 3)
  and strictly under at k ≡ 2; b ≥ 2 is strictly under everywhere. Never exceeded.
(The hosting trichotomy is exhaustive: a horizontal axis strictly between vertex rows must
bisect a slab; mid-T and quarter-H positions swap rows of opposite offset parity while
preserving x — impossible; only the S-midline survives. Oblique mirrors are excluded: they
would map u to another length-2 period 2ζ₁₂^j, and rational real parts plus H > √3 rule
these out for k ≥ 2.)
Hence W ≤ 2k + 2⌊(k−2)/3⌋. Attainment: Appendix A.2 (OPEN). ∎

**Theorem B (achievability).** For every k ≥ 2 there is a k-uniform tiling F(k) ∈ 𝒯 with
Sym(F(k)) = pgg exactly and W(F(k)) = 2k + 2⌊(k−1)/3⌋.
*Construction schema (explicit words in Appendix A.1).* Take α* = 2⌊(k−1)/3⌋… precisely
a = 2α* with α* the bound of Theorem A at b = 0; t + s = 2k − 3α*, s chosen 0 or ±… with
t ≥ 2, t, s even, t split into two odd runs placed asymmetrically. Deletion offsets: first
half-word w on the a/2 hexagon slots of the lower half-cell, second half its γ-image
(offset-flipped, shifted H/2); the two odd T-runs put the two halves at opposite offset
parities, breaking both vertical mirrors (5.3); a single "defect" in w (one position flipped
relative to the alternating pattern) kills every vertical sub-translation and every
horizontal mirror; the 2-fold centers land at hexagon centers and edge midpoints (b = 0).
Verification duties, each finite and mechanical per k (Appendix A.1 does them for the general
schema and hand-checks k = 2..7): (V1) the deletion set is cascade-legal; (V2) γ, the
horizontal-axis glide, and the 2-folds map D to D: G ⊇ pgg; (V3) no mirror preserves D
(both offset parities occupied: 5.3 kills verticals; the defect kills horizontals) and no
proper sub-period preserves D: G = pgg on the primitive cell claimed; (V4) b = 0, so
k(F) = n/4 = k by (4.2) with the designed (a, t, s); (V5) W = 2k − 0 + α* by Prop 4.2.
Sym(F) can exceed pgg only via mirrors, higher rotations (excluded: rectangular lattice with
λ₁ = 2 ≠ λ₂), or extra translations — each excluded above. ∎

## 7. The global upper bound (Theorem D) and Lemma M

Gauss-reduced (λ₁ ≤ λ₂, angle ∈ [60°, 90°]); A = |det Λ| ≥ λ₁λ₂√3/2; A ≤ a_max·|P|·k with
a_max = (2+√3)/4·2 + √3/12 ≈ 2.011 (the 3.12.12 vertex).

**Lemma 7.1 (crossing bound — crude, PROVEN; sharp constant = Appendix B, OPEN).**
For any T ∈ 𝒯 and period x: wt(x) ≤ c₁|x| + c₂ with (c₁, c₂) = (94, 136).
*Proof (referee-supplied, airtight but crude).* Perturb the segment [v, v+x] off all vertices.
Every crossed edge has an endpoint within 1/2 of the segment; vertices are 1-separated
(Lemma 1.1), so ≤ 2.6|x| + 3.6 vertices lie in the 1/2-neighborhood; each contributes ≤ 6
crossed incident edges; tiles crossed ≤ edges crossed + 1; each crossed tile costs ≤ half its
perimeter ≤ 6 edges of boundary walk. Multiply. ∎
Appendix B's target: c₁ ≤ 2 + ε via band decomposition (each √3/2-band of height along x
costs O(1) edges). Everything below keeps c₁ symbolic.

**Case W1 (rigid lattices, |P| ≥ 6 or 4-fold).** λ₂ = λ₁: W ≤ c₁√(2A/√3) + c₂ = O(√k);
with c₁ = 2: below the ceiling for k ≥ 34 (referee-corrected constant), finite residue
absorbed by direct check of λ₁ = λ₂ ≤ … small cells (Lemma 5.1 handles λ₁ = 2; λ₁ ∈ (2, …)
small rigid cells have bounded k by the same corner-area count).

**Case W2 (wide).** λ₁ ≥ T₀ := c₁·a_max·|P|·(2/√3)·(3/8) with |P| ≤ 4: then
W ≤ c₁λ₂ + c₂ ≤ (8/3)k + c₂. Note: this yields the SLOPE, not the exact floor form; the
exact law on the wide regime is not claimed (nor needed: width-2 dominates if Lemma M holds).

**Case W3 (λ₁ ∈ {1, 2}).** Width 1: Lemma 7.4 below. Width 2: §§3–6.

**Lemma 7.4 (width-1 automatic mirror; verified).** A width-1 tube has all tiles upright
triangles/squares (hexagon extents 2 or √3 exceed/misfit circumference 1 — same gap argument
as 3.1(c)), one vertex per row, all in one coset {x₀, x₀ + 1/2} of (1/2)ℤ (unit edges force
Δx ∈ {0, ±1/2} per row). x ↦ 2x₀ − x fixes both cosets and every slab: G contains a vertical
mirror with every vertex on an axis, n ≤ 2k, W ≤ n·1 ≤ 2k. ∎

**Lemma M (OPEN; the residual band, stated precisely).** Claim: for every k-uniform T ∈ 𝒯
whose shortest period satisfies λ₁ ∈ (1, 2) ∪ (2, T₀), W(T) ≤ 2k + 2⌊(k−1)/3⌋.
Scope notes (from the adversarial round): (i) the band must be binned by (|λ₁|², angle) class
— off-axis shortest periods exist at many norms (e.g. 1 + ζ₁₂, |·| = 2cos15° ≈ 1.93, 15°
off-axis), and the slab machinery of §3 does not apply to them as-is; (ii) the v1 claims for
λ₁ = √2, √3 relied on the broken 3.1 argument and are re-opened, though the √3 case
(pure-hexagon or rotated-triangle columns ⟹ supercell) survives via the 3.1(c)-style gap
argument; (iii) the strongest counterexample attempt so far — a genuine width-(1+√3)
hexagon+square strip tiling, verified to exist, 3-uniform — has W/k = 1: the forced mirrors
(Lemma 5.2's mechanism) destroy its economy, which is evidence for, not against, Lemma M.

**Theorem D.** For every k-uniform T ∈ 𝒯: if λ₁ ∈ {1, 2} or λ₁ ≥ T₀ or G is rigid-lattice,
then W(T) ≤ max(2k + 2⌊(k−1)/3⌋, (8/3)k + c₂) — with the exact ceiling in the first two
cases and the slope form in the wide case; unconditionally for all T if Lemma M holds. ∎

## 8. The group ledger (width-2 exact; other widths per §7)

| group(s) | mechanism | width-2 result |
|---|---|---|
| p3, p3m1, p31m, p6, p6m, p4, p4m, p4g | rigid lattice (5.1) | k ≤ 4, W = 2 |
| p1 | |P| = 1: n = k, wt = (n+a)/2 = k/2 + a/2, and t + s = (k − 3a)/2 ≥ 0 caps a ≤ k/3 | W ≤ (2/3)k |
| p2, pg | |P| = 2, no mirrors: n ≤ 2k, wt = (n+a)/2 ≤ k + a/2, a ≤ n/3 ≤ 2k/3 | W ≤ (4/3)k |
| pm, cm | |P| = 2, mirrors | W ≤ k (5.2) |
| pmm, cmm | mirrors both directions | W ≤ 2k (5.2, 5.5) |
| pmg | Theorem C | 2k + 2⌊(k−2)/3⌋ exact |
| **pgg** | Theorems A + B | **2k + 2⌊(k−1)/3⌋ exact — the maximum** |

Softened slogan (a referee objected to v1's version): among width-2-capable groups, pgg
maximizes (steps per vertex) × (orbit size) because its point group has order 4 while every
one of its constraints costs only the additive minimum (t ≥ 2); mirror groups pay
multiplicatively (pinned rows), |P| = 2 groups halve the multiplier, and rigid groups cannot
form tubes at all. pgg's own 2-fold centers are what make the bound 2k + 2⌊(k−1)/3⌋ rather
than (8/3)k: the parity link 6.2 is where they bite. pmg trails by exactly one phase because
its mirrors must be hosted (s ≥ 2 or b ≥ 1).

## 9. Status ledger (v2, honest)

PROVEN UNCONDITIONALLY: §1, §2 (independently verified), 3.0, 3.1(a)(b)(c)(e), 3.2
(conditional on 3.1(d) only through the inventory), 3.3, 3.4, 4.1, 4.2, 5.1–5.5, 6.1, 6.2,
Theorem A modulo 3.1(d), Theorem C modulo 3.1(d) + the Appendix A.2 attainment, Theorem B
modulo the finite Appendix A.1 verifications, Lemma 7.1 (crude), 7.4, Cases W1/W2/W3.
OPEN: Lemma 3.1(d) (width-2 tilted-tile exclusion; isolated, two candidate routes);
Lemma M (residual widths, now correctly binned by norm AND angle class); Appendix B (sharp
crossing constant, which sets T₀ ∈ {7, …, ~330}); Appendix A word tables (finite, mechanical).
NOT CLAIMED: exact law on the wide regime; anything about star/non-unit polygons or octagons.

## 10. Adversarial round (documentation)

Five independent referees attacked v1 (2026-07-10): algebra/parity, width-2 geometry, group
theory, global-bound/counterexamples, and global soundness. Score: §2 fully verified twice;
FATALs found and fixed: v1's Theorem 2 family was mirror-symmetric (pmg, not pgg — also found
independently by the author); v1's 6.2(ii) composed a glide with a rotation into a
"translation" (orientation error; replaced by Lemma 5.3's determined-by-word argument);
v1's Lemma 3.1 proof was self-refuting (excluded its own hexagon; rebuilt, with (d) honestly
re-opened); v1's "squares only dilute" was false (the integer program of §6 replaces it, and
the corrected law derivation now explains why non-jump-k extremals contain squares);
v1's pmg corollary was wrong as argued (rebuilt as Theorem C via mirror hosting).
Counterexample search: width-2 obliques ruled out by exhaustive norm-form check; the
width-(1+√3) strip exists but has economy 1; no construction beating 8/3 was found.
A sixth, focused referee then attacked the NEW v2 core (§4, §6, Theorem C): verdict no
FATAL; findings incorporated — the q-integrality + δ ≡ H branch in 6.1(iii), the c = 0
transfer to pmg in 5.4, Theorem C's per-residue b = 1 equality cases (the v2 draft said
"strictly smaller", false), the ½ℤ restatement of 2.2(a), and the no-invariant-slab step in
6.1(i). Both exact formulas were re-derived by independent brute force over the constraint
system at k = 2..13: no mismatches.
