# Canonical forms for periodic tilings of the plane by regular polygons

## 1. Objects

Let ω = e^{2πi/12} = (√3 + i)/2, the primitive 12th root of unity. Its minimal polynomial over ℚ
is Φ_12(x) = x^4 − x^2 + 1, so ω^4 = ω^2 − 1.

The ring ℤ[ω] = {a0 + a1ω + a2ω² + a3ω³ : ai ∈ ℤ} is a free ℤ-module of rank 4 with basis
{1, ω, ω², ω³}. Write the lattice coordinates of p = a0 + a1ω + a2ω² + a3ω³ as the integer vector
[a0,a1,a2,a3] ∈ ℤ⁴. As a subset of ℂ ≅ ℝ², ℤ[ω] is dense, not discrete; tilings pick out discrete
subsets of it.

We consider edge-to-edge periodic tilings of the plane by regular polygons with unit edge length.
There are exactly 15 admissible vertex types. Exactly one tiling contains octagons (the truncated
square tiling, all vertices 4.8.8); its edges lie at 45°, off the 30° grid, and it is excluded
here. Every other such tiling can be normalized (one vertex at the origin, one edge along the real
axis) so that: all edges point along the twelve directions ω^0..ω^11, and every vertex lies in ℤ[ω].

## 2. The finite encoding (Soto Sánchez et al., 2021)

Let V ⊂ ℤ[ω] be the vertex set of such a tiling. It is invariant under a rank-2 translation
lattice Λ = ℤt1 + ℤt2, with t1, t2 ∈ ℤ[ω] ℝ-linearly independent in ℂ. Because V + Λ = V and the
tiling is periodic, V is a union of finitely many cosets of Λ:

    V = ⋃_{s ∈ S} (s + Λ),   S ⊂ ℤ[ω]/Λ, |S| = n, 0 ∈ S.

(ℤ[ω]/Λ is infinite; S selects only n of its cosets, the "seeds," one representative vertex per
translation class.)

A symbol is the (2+n)×4 integer matrix M whose first two rows are the lattice coordinates of the
translation vectors and whose remaining n rows are lattice coordinates of seed representatives,
one of which is [0,0,0,0]. The polygons are implicit: from V they are recovered by joining v to
v + ω^k whenever both are vertices.

Reconstruction, rendering, and symmetry detection are exact integer arithmetic. Multiplication by
ω is the ℤ-linear map with matrix (columns = images of 1, ω, ω², ω³):

    M_ω = [[0,0,0,−1],[1,0,0,0],[0,1,0,1],[0,0,1,0]],

and complex conjugation z ↦ z̄ (i.e. ω ↦ ω^11) is another integer matrix. Both preserve ℤ[ω].

## 3. The equivalence relation

Tilings are considered up to Euclidean similarity. Unit edge length fixes scale, so the relevant
transformations are the isometries preserving the twelve directions:

    G = {z ↦ ω^k z : k = 0..11} ∪ {z ↦ ω^k z̄ : k = 0..11},

the dihedral group D12 of order 24, each element a 4×4 integer matrix on lattice coordinates.

Two vertex sets V, V′ represent the same tiling iff V′ = gV + c for some g ∈ G, c ∈ ℤ[ω].

On symbols, one tiling has many matrices M, from four independent sources of ambiguity:

1. Lattice basis: (t1,t2) may be replaced by U(t1,t2)ᵀ for any U ∈ GL2(ℤ) (same Λ). Infinite.
2. Seed representatives: each s_i may be replaced by s_i + λ, λ ∈ Λ (same coset).
3. Seed order: the rows s1..sn are a set; order immaterial. (n!)
4. Origin and orientation: translate a chosen seed to 0 (n choices of coset) and pick the reference
   edge direction (g ∈ G, up to 24 choices; the tiling's own symmetries may identify several).

## 4. The problem

Define a computable canonical form: a map N from valid symbols to symbols such that
(Soundness) N(M) ~ M for every symbol M;
(Canonicity) M ~ M′ ⟹ N(M) = N(M′) as integer matrices.
Then equivalence testing is a single equality check, and deduplication is hashing on N.

A polynomial baseline exists. Sources 1 and 3 are solvable: HNF of the 2×4 lattice matrix gives a
unique canonical basis of Λ, and seed rows can be sorted lexicographically. For sources 2 and 4,
iterate: for each g ∈ G (24) and each choice of origin seed (n), apply g, translate, reduce every
seed to its unique representative with grid coordinates in [0,1)², put the lattice in HNF, sort
the seed rows, and read off M(g, origin). Define N(M) = min over (g, origin) in lex order on
flattened matrices. Valid, computable in about O(24 n²).

The open target: a canonical form computed directly from intrinsic structure, without enumerating
the choices, ideally O(n log n), with proofs of soundness and canonicity. Any of these is a
contribution:

(T1) A direct rule pinning canonical orientation g and origin seed from invariants, no
     minimization over G × origins.
(T2) A canonical form with provably bounded (ideally minimal) integer entries, or one exposing
     the algebraic family structure of tilings.
(T3) A reduction showing the direct problem is as hard as some canonical-labeling problem. (The
     baseline is already polynomial; this is about directness and constants.)

Structure a direct solution can exploit: each seed s carries intrinsic labels that no rotation or
translation can erase, only permute: its star {k ∈ {0..11} : s + ω^k ∈ V} (a global g rotates all
stars by the same k and reflects them together), and its vertex type (cyclic sequence of polygon
sizes around s, one of 15, read off the star). The multiset of vertex types, and relative rotations
aligning stars, are invariants. A canonical orientation might be fixed by requiring the
lexicographically smallest star to sit in a fixed position, ties broken by the next invariant.
Soto Sánchez's thesis (§5.10) sketches reading a canonical labeling off the dual graph.

## 5. Worked examples

Example A, the square tiling (4.4.4.4). Edges along ω^0 = 1 and ω^3 = i. One vertex class, n = 1:

    M = [[1,0,0,0],[0,0,0,1],[0,0,0,0]],   Λ = ℤ·1 + ℤ·ω³, S = {0}.

Same tiling via source 1 (U = [[1,0],[1,1]], t2′ = 1 + ω³): [[1,0,0,0],[1,0,0,1],[0,0,0,0]]
(HNF removes this). Same tiling via source 4 (multiply by ω, t1 = ω, t2 = ω^4 = ω²−1):
[[0,1,0,0],[−1,0,1,0],[0,0,0,0]] (HNF does NOT remove this; the orientation ambiguity N must
resolve).

Example B, the honeycomb (6.6.6). Two vertex classes, n = 2. Three edges from the origin toward
ω³, ω^7, ω^11; paired seed s = ω³ = i. Translation lattice basis t1 = ω + ω³ = [0,1,0,1],
t2 = ω^5 + ω³ = [0,−1,0,2] (each length √3, cell area 3√3/2 = one hexagon). Symbol:

    M = [[0,1,0,1],[0,−1,0,2],[0,0,0,0],[0,0,0,1]],   S = {[0,0,0,0],[0,0,0,1]}.

Origin ambiguity: putting the other vertex at the origin translates by −ω³; seeds become
{[0,0,0,0], −[0,0,0,1] mod Λ}, a different matrix for the same tiling.

Test instances for N: the two square-tiling matrices (rotated and axis-aligned) must map to the
same matrix; the two honeycomb symbols (two origin choices) likewise.

## 6. Deliverable

Propose a canonical form N. State it as an algorithm on the (2+n)×4 integer matrix, prove
soundness and canonicity against the equivalence of §3, give its complexity, and run it on the
instances in §5. If you can only pin part of the ambiguity, say precisely which part and prove
what you can.
