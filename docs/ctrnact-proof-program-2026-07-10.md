# Čtrnáct completeness proof program + star extension plan (Fable 5, 2026-07-10)

Response to `docs/thesis-pivot-ctrnact-2026-07-10.md`. Contents: (1) assessment of the two
tracks, with corrections to the brief; (2) the formal model and research groundwork; (3) the
Track 1 proof outline as a lemma DAG with status labels; (4) the Track 2 star-extension plan
grounded in the actual code; (5) ordered next actions.

## 0. Provenance map (read this first, it prevents a category error)

Three separate bodies of work exist in this project. They must never be conflated:

- **AL's algorithm** (PeriodSolver, LatticeEnumerator, VC search, torus fill, and every theory
  note built around it, including ALL prior star work: the star VC contracts, dent-seating,
  fill-reach, weight bounds, `lem:dentchain`, TH-3/TH-4). None of that is prior work on the
  Čtrnáct engine. From it, this program borrows only method-agnostic material: Myers'
  definitions and conventions, the transcribed k=2 star oracle
  (`experiments/star-oracle/myers-2009-k2.json`), corner-angle tables, and geometric facts
  about star tilings that hold regardless of which engine enumerates them.
- **Canonical form N** (`docs/canonical-form/`): a standalone proved canonicalization of
  ζ₁₂ vertex-set symbols (Soto-Sánchez model). Not part of either engine. Usable here as an
  independent geometric-level cross-check of the combinatorial pruner (see Lemma P3).
- **Čtrnáct's engine** (`tools/ctrnact-oracle/`): ported to C++, optimized (trace-gating,
  streaming), run to k=16. No theory work has been done on it. Everything below starts from
  `reference/algorithm.txt`, `reference/eu_solver.orig.cpp`, and the ported sources, read in
  full for this document.

## 1. Assessment

### 1.1 The proof is more tractable than the brief expects, for a structural reason

The brief's obligation #6 asks for "an a priori bound on the period size per k (the finiteness
theorem)" and names Datta-Maity / Kundu-Maity as the backbone, flagging the mixed-type global
bound as the missing piece. In the quotient-object frame this machinery is not needed at all.
A period bound is what a *geometric* enumerator needs, because it searches over lattices and
must know when to stop. Čtrnáct's object is the quotient itself: a solution with k vertex
types has at most 12k half-edge stubs by construction, the DFS terminates because every step
glues a stub and stubs are finite, and no bound on the translation lattice ever enters the
argument. What remains of obligation #6 is only the bridge "k-uniform tiling ⇒ its full
symmetry group is cocompact ⇒ the quotient is a finite object over the alphabet," and
cocompactness is elementary (§3, Lemma B1): vertices fall into k orbits, so the plane is
covered by the group translates of k compact vertex stars. Datta-Maity and Kundu-Maity drop
from load-bearing to background citations. This is the single biggest simplification over the
brief, and it is also why this engine scales: it enumerates quotients directly instead of
searching for them geometrically.

### 1.2 The rigidity check is not what the brief (or Čtrnáct) says it is, and that is good news

`algorithm.txt` describes `simplify` as a check that the solution "doesn't contain any hidden
symmetries," i.e. an automorphism-triviality test. Read literally, that would be a soundness
hole: `simplify` is one-dimensional Weisfeiler-Leman color refinement, and WL is incomplete
for automorphism detection in general, so "WL partition not discrete" would not imply "a
genuine hidden symmetry exists," and the solver could discard legitimate tilings. The k=8/9
anxiety in the brief lives exactly here.

The correct reading dissolves the hole. On these structures (finite sets with four unary
*functions*: `rneig`, `lneig`, `mirro`, `glue`, plus a coloring `lvert`), the stable WL
partition is precisely the **coarsest congruence**: the coarsest partition compatible with the
functions and colors. A congruence quotient of a closed valid configuration is again a closed
valid configuration, smaller, over the same alphabet (site-symmetry variants exist in the
table exactly so that folded quotients stay expressible). And a configuration is a **core**
(admits no proper quotient) iff its WL partition is discrete. So `simplify` accepts M iff M is
the minimal representation of its tiling. Rejection never drops a tiling, because the tiling's
core is also reached by the search and accepted (Lemma S3 + Theorem D). The same argument
kills the converse danger the brief does not name: a closed rigid M whose *developed* tiling
has more symmetry than M encodes. Extra geometric symmetry induces a proper congruence on M
(orbits merge or stabilizers grow, either way the stub count strictly drops), so such an M is
not WL-discrete and is rejected. Worked example in §4.5: the square tiling represented over
p4 instead of p4m, i.e. vertex type (4,4,4,4)R4 with the self-gluing (0), closes and passes
checkpart, and `simplify` rejects it because the mirror that p4 omits shows up as the
congruence merging stubs 0 and *0. The proof obligation "no over-count from hidden geometric
symmetry" and the obligation "rejecting non-rigid closures drops nothing" are the same lemma.

### 1.3 The pruner is exact, but only because inputs are cores; that ordering is load-bearing

`comparesolutions` (eu_pruner.cpp:99) is a WL-style cross-refinement, and WL cannot decide
isomorphism of general graphs. It IS exact here, for a specific reason: both inputs have
already passed `simplify`, and on WL-discrete functional structures the surviving cross-alias
relation is a genuine isomorphism (uniqueness of trace-equivalent partners plus connectivity;
Lemma P1). If the pipeline ever ran comparison before simplification, exactness would be
unproven. This should be stated as a theorem and the pipeline ordering documented as a
correctness invariant, not an implementation accident. The fingerprint bucketing
(eu_pruner.cpp:159-186) only skips comparisons between structures with different invariants,
so it cannot cause a merge; it needs a one-line soundness remark only.

### 1.4 Corrections to the pivot brief

- **"Nondecreasing-type-order tie-break" is wrong.** The code (eu_solver.cpp:676, original
  line 665) constrains new vertex types by `gr >= slist.vertype[0]`: every added type is ≥ the
  *root* type, in any order. The invariant is "the root vertex has minimal type," and the
  completeness argument must (and does, Lemma S2) show every solution is reachable from a
  minimal-type root. Weaker constraint than the brief claims, hence an easier proof.
- **"Fundamental domain on a torus" is imprecise.** With S/R/A variants and (a)/[a] gluings
  the quotient is a closed flat **orbifold** (any of the 17 wallpaper quotients), not
  necessarily a torus. The torus appears only for translation-only symmetry. The development
  argument must be run for orbifolds; it is, in §4.4.
- **The star field claim misreads Myers.** Myers' stars are isotoxal n*α stars: simple
  non-convex 2n-gons, unit sides, alternating point angle α and reflex angle 2π − 2π/n − α,
  with α a free parameter; they are not {n/m} Schläfli polygons, and the notes from the star
  scouting (method-agnostic part) already flagged the "{8/3}, {12/5}" reading as a mis-scope.
  Consequence one: the alphabet needs (tile, corner-class) pairs with point and dent corners,
  which the brief's item 3 anticipates. Consequence two: Myers' lists are NOT contained in
  ℤ[ζ₂₄]. His k=1 list has four entries on 9-fold and 5-fold grids (Fig. 4 e, g, l, q), his
  k=2 list has four figures out-of-ring (Figs 18, 19, 22, 23); those need ℚ(ζ₃₆) and ℚ(ζ₂₀)
  respectively. Because the search never touches geometry, this costs nothing in the solver:
  angle bookkeeping is integer in units of π/N per palette. Only `develop` needs the ring, per
  palette. The field risk the brief worries about moves entirely into the last, optional
  stage.
- **Non-convex realizability is not the main Track 2 risk.** The brief fears that "flat ⇒
  realizes" fails for reflex corners because local angle closure might not prevent global
  overlap. The intrinsic argument does not care about convexity: glue the abstract tiles
  (compact flat disks, star regions included) along matched unit edges; the local conditions
  make every interior point flat (vertex links of exactly 2π, or 2π/m cone points from folded
  cycles, which unfold in the orbifold cover); the resulting complete, simply connected flat
  surface is isometric to ℝ² by Killing-Hopf, and an isometry cannot make tiles overlap.
  Overlap is a phenomenon of *immersions*; a global isometry is injective by definition. The
  "float Polygon.intersects unsound for non-convex" warning belongs to AL's engine, which
  places tiles by coordinates and tests collisions; this engine never does that. The real
  Track 2 risks are conventions (§5.4) and alphabet size (§5.5), not realizability.
- **The k=8/9 story is an unreconciled loose end, and a thesis exhibit waiting to happen.**
  `reference/count.txt` k=8 breakdown (lines 48-53) sums to 2849 while its own total line
  says 2850; the k=8 block has no "8:" row while k=7 has "7: 7" and k=9 has "8: 8". The
  2026-07-08 log first concluded "2849, the 2850 total is a typo"; the later C++ run produced
  2850 matching A068599, flipping the verdict to "the Python lineage drops one tiling."
  Nobody has identified WHICH tiling or WHY. Diffing the C++ k=8 catalogue against the Python
  one and root-causing the drop in `euclidean_solver_mega.py` would turn an anecdote into the
  motivating exhibit for obligation S (the no-drop theorem): here is the exact failure class
  the theorem excludes. Cheap experiment, high thesis value (§6, action 3).

### 1.5 Honest risk register for Track 1

Ranked by how likely they are to hold up the proof, not by how scary they sound.

1. **The ferk lemma (highest real risk).** When the DFS attaches a fresh vertex of type t it
   tries only the first `ferk(t) = stubs/ferkval` stubs as gluing targets (eu_solver.cpp:690).
   This is sound iff {0..ferk−1} meets every orbit of the stub set under the automorphism
   group of the isolated vertexdef, and |Aut| = ferkval. I verified this by hand for
   (3,6,3,6)F (Aut of order 4 generated by the 2-shift and a chirality-swapping map; orbits
   {0,2,*1,*3} and {1,3,*0,*2}; representatives {0,1}; ferkval 4, ran 2: correct) and for the
   chiral types (4,6,12), (3,3,4,12), (3,4,4,6) (no nontrivial automorphism, ferkval 1, all
   stubs tried: correct). It must be machine-verified for all 44 entries. If any entry's
   ferkval were wrong the solver would silently drop, and no amount of clean theory elsewhere
   would save it. This is a finite check; write the checker first (§6, action 1).
2. **The alphabet certificate.** Completeness of the 15 configurations (Diophantine over
   {60°,90°,120°,150°}), completeness of the variant lists (= conjugacy classes of subgroups
   of each configuration's dihedral symmetry group; I verified the counts against subgroup
   lattices of D4 and D6 by hand: 8 variants for (4,4,4,4), 10 for (3,3,3,3,3,3): both match),
   and correctness of every encoded `lneig/rneig/mirro/lvert` array. Plus consistency of the
   THREE table copies: `mainlist` in eu_solver.cpp, `mainlist` in reference/eu_solver.orig.cpp,
   and `pruner_tables.inc` consumed by decode() in both eu_pruner and eu_develop. All finite,
   all machine-checkable, all must actually be checked.
3. **The edge/vertex/face taxonomy lemma (bridge, existence direction).** The claim that every
   edge orbit of a tiling under its full group is expressible as exactly one of the four
   gluing types, with the mirror-parity rule forced (an axis along an edge passes through both
   endpoints, so self-mirrored glues to self-mirrored), and every face orbit as a cycle of
   length ℓ | n. Case analysis over the possible stabilizers (subgroups of the edge's C2×C2
   and the face's D_n). Fiddly, elementary, owed.
4. **Formalizing the object so the congruence/development story is airtight.** The starred
   stubs are best formalized as orbits of *oriented flags* under the orientation-preserving
   part of the symmetry group, with `mirro` the residual action. Getting this definition right
   makes Lemmas R1-R3 routine; getting it sloppy makes them unprovable. This is pure
   definition work and it is where I would start writing.

None of these looks like it can sink the program; risk 1 is the only one where a negative
answer would mean an actual engine bug, and the k=1..16 oracle agreement makes that unlikely,
but "unlikely" is exactly what the thesis is replacing with "proved."

### 1.6 Bottom line

The proof architecture is: superset generation under proven-necessary local rules, exact
minimality filter, exact dedup, then a bijection theorem (cores ⟷ tilings) via development.
Every piece decomposes into either classical material (Bieberbach, Killing-Hopf, orbifold
Euler characteristic), finite machine-checkable certificates (alphabet, ferk, table
consistency), or short novel lemmas whose proofs I can sketch today (guided descent, coarsest
congruence = WL, pruner exactness on cores). I see no open problem in Track 1, in the sense
of a statement whose truth is genuinely in doubt; it is a substantial but bounded
formalization effort. Track 2 is an engineering track whose one theory risk (realizability)
is already discharged by the same development theorem, leaving conventions and alphabet
generation as the real work. The stretch Track 4 (star completeness) inherits the whole
Track 1 skeleton because none of it is specific to regular polygons; the genuinely new
ingredient is the symbolic-α alphabet (§5.7), which is a finite linear-algebra enumeration,
not a period-bound theorem. I would upgrade Track 4 from "pursue only if" to "expected
follow-through once Tracks 1-2 land."

## 2. Formal model and definitions (the research groundwork)

Definitions the proof will use, fixed here so every lemma speaks one language.

**Tiling.** An edge-to-edge tiling T of ℝ² by unit-edge regular polygons from
P = {3,4,6,12}: a countable family of tiles with disjoint interiors covering ℝ², every edge
shared by exactly two tiles, corners meeting corners. Vertices V(T), edges E(T), faces F(T).

**Symmetry group, orbits, k-uniform.** G(T) = all isometries of ℝ² preserving T (reflections
included). T is k-uniform iff G(T) has exactly k orbits on V(T). Chirality convention: mirror
pairs merge (settled repo decision), which the object encodes natively via starred stubs.

**Flags and darts.** A dart is a pair (v, e) with e an edge incident to vertex v. An oriented
dart additionally carries a side (left/right of e seen from v); equivalently use barycentric
flags (v, e, f). G(T) acts on darts and flags.

**Stub system (the solver's object, formalized).** A finite set X (stubs) with:
`rneig, lneig : X → X` mutually inverse bijections (rotation system per vertex),
`mirro : X → X` an involution commuting appropriately (mirro ∘ rneig = lneig ∘ mirro),
`glue : X → X ∪ {⊥}` a partial involution (total when closed),
`lvert : X → P` corner sizes (corner between lneig(x) and x). Connected components of
(X; rneig, mirro, glue) correspond to one object. Vertices = orbits of ⟨rneig⟩ paired by
mirro; each must equal one alphabet entry (vertexdef). The intended semantics: given a tiling
T and a group H ≤ G(T) with finitely many orbits, the stub system T/H has
X = (oriented darts)/H⁺ where H⁺ is the orientation-preserving subgroup, `mirro` the residual
reflection bookkeeping, self-mirrored stubs = darts on mirror axes of H. This definition is
the piece to nail first (risk 4 above); the deliverable is that T ↦ T/H is well defined and
functorial in H.

**Gluing taxonomy.** The four Conway gluing forms correspond to edge-orbit stabilizer types:
(a b) trivial stabilizer, endpoints in distinct or same orbit without identification;
[a b] the edge orbit carries an orientation-reversing identification of its two ends;
(a) a C2 rotation at the edge midpoint stabilizes the orbit; [a] a mirror perpendicular to
the edge through its midpoint. A mirror ALONG an edge is vertex-side data: it makes the two
end stubs self-mirrored. The parity-matching rule in `extend` (only glue self-mirrored to
self-mirrored) is forced because an along-edge axis passes through both endpoints.

**Face cycles and the two conditions.** The face-walk operator is x ↦ rneig(glue(x));
condition 1: constant `lvert` along each cycle; condition 2a: closed cycle length divides its
polygon size n (the quotient face is an n-gon folded by C_{n/ℓ}); condition 2b: open length
never exceeds n. Monotonicity: gluings are only added, cycles only grow, so violations are
permanent. That is what makes DFS pruning on 1/2a/2b sound.

**Congruence, quotient, core.** A congruence on a stub system is a partition compatible with
the four functions and `lvert`. Quotients by congruences are again stub systems. A core has
no proper congruence. Fact (used repeatedly): the coarsest congruence refining the initial
coloring is exactly the stable partition of WL color refinement, because (i) the WL-stable
partition is compatible with the functions (stability) and classes linked by bijections have
equal size, so it IS a congruence; (ii) every congruence is a stable partition, hence refines
the coarsest one. Corollary: WL partition discrete ⟺ core. This replaces every "hidden
symmetry" argument.

**Development.** From a closed valid stub system M, build the surface S(M): one metric
regular n-gon per closed face cycle (folded n/ℓ-wedge for short cycles, i.e. work in the
orbifold category), glued along edges per `glue`, corners identified per `rneig`. Conditions
1+2 make S(M) a closed flat orbifold (vertex links 2π by the alphabet's 360° configurations;
cone points only from (a)-gluings and folded faces/vertices, all locally 2π/m). Its orbifold
universal cover is flat, complete, simply connected, hence isometric to ℝ² (Killing-Hopf /
Alexandrov gluing); the tile decomposition descends to an edge-to-edge tiling develop(M) with
a cocompact symmetry group H(M) ≥ π₁^orb(M) acting with quotient M. `eu_develop` computes
exactly this map on the direction bundle (stub, direction) ∈ X × ℤ/12, discovering the
translation subgroup as position discrepancies (eu_develop.cpp:148-172).

**Classical results to cite.**
- Bieberbach / wallpaper classification: discrete cocompact isometry groups of ℝ² are the 17
  wallpaper groups; cocompact ⇒ contains ℤ² translations. (Gives "k-uniform ⇒ periodic" as a
  corollary; also citable from Grünbaum & Shephard, Tilings and Patterns §1.4, 3.5.)
- Killing-Hopf theorem: complete, simply connected flat surface ≅ ℝ². For the orbifold
  version, Thurston's orbifold chapter (The Geometry and Topology of Three-Manifolds, ch. 13)
  or Ratcliffe. Alexandrov's gluing theorem is an alternative packaging.
- Discrete Gauss-Bonnet / orbifold Euler characteristic χ_orb = 0 for wallpaper quotients.
- 1-WL color refinement computes the coarsest stable partition (standard; e.g.
  Cardon-Crochemore 1982 partition refinement, or any WL survey). The congruence reading on
  functional structures is elementary and we prove it inline rather than cite.
- Grünbaum & Shephard for vertex-configuration enumeration (the 15-species list for
  {3,4,6,12}) and for star polygon definitions (§2.5; Myers' papers refine this).
- Delaney-Dress symbol theory (Dress 1987; Dress-Huson 1987; Delgado-Friedrichs 2003) as the
  sibling formalism: our stub systems are a vertex-centered analogue of D-symbols, cores
  correspond to their minimal symbols, and the D-D literature's "tilings ⟷ minimal symbols"
  theorems are the pattern our Theorems C/D instantiate. Cite as context and sanity check;
  do not import (their chamber systems differ enough that a formal bridge is its own lemma,
  and self-contained 2D proofs are short).
- Datta-Maity (1705.05236), Kundu-Maity (2111.15484), Kharkongor-Bhowmik-Maity (2101.04373):
  background on semi-equivelar torus quotients; no longer load-bearing (§1.1).

## 3. Track 1: the proof outline

Master statement, then the lemma DAG. Status labels: [classical] citable, [machine] finite
certificate checked by a program we write, [owed] a proof we must write but whose shape is
clear, [open] genuinely uncertain. Nothing below is [open].

**Theorem (completeness and correctness of the pipeline, 12-direction scope).** Fix k ≥ 1.
Let O_k be the set of pruned outputs of eu_solver(maxnum ≥ k) + eu_pruner at vertex count k,
and let develop be the eu_develop map. Then develop is a bijection from O_k onto the set of
congruence classes (mirror-merged) of edge-to-edge k-uniform tilings of ℝ² by unit regular
polygons with all edge directions in the 30° grid. With the octagon lemma (settled: the only
tiling violating the direction restriction is t1002 at k=1), this enumerates all and only the
k-uniform regular-polygon tilings for k ≥ 2, and all but t1002 for k=1.

Decomposition. Write M for closed stub systems over the alphabet satisfying conditions 1+2.

**A. Alphabet completeness.** [machine + owed glue]
- A1 [machine]: the 15 cyclic configurations over {3,4,6,12} with angle sum 360° are exactly
  those listed; direct Diophantine enumeration.
- A2 [owed, short]: the site-symmetry variants of a configuration c are in bijection with
  conjugacy classes of subgroups of Sym(c) (the dihedral symmetry group of the cyclic word),
  each yielding the folded stub structure by orbit-space construction; geometric side: vertex
  stabilizers in wallpaper groups are finite cyclic/dihedral fixing the vertex, acting on the
  corona exactly as Sym(c) subgroups.
- A3 [machine]: the 44 mainlist entries are precisely these (configuration, subgroup class)
  pairs with correctly encoded arrays; verified by generating the table independently and
  diffing (the same generator later produces star alphabets, §5.2).
- A4 [machine]: mainlist (port) = mainlist (original) = pruner_tables.inc, and structural
  identities hold per entry: lneig∘rneig = id, mirro² = id, mirro∘rneig = lneig∘mirro,
  lvert(corner) consistent under mirro.
- A5 [machine, the ferk lemma]: for each entry, Aut(vertexdef) has order ferkval, acts freely
  on stubs, and {0..(stubs/ferkval)−1} meets every orbit. (Risk register item 1.)

**L. Local rules.** [owed, short]
- L1 (necessity): if M = T/G(T) for a valid tiling T, every partial sub-gluing of M satisfies
  1, 2a, 2b. (Face orbits are folded n-gons: closed cycles have length ℓ = n/m; open walks are
  subwalks of cyclic sequences, length ≤ ℓ ≤ n.)
- L2 (parity necessity): self-mirrored stubs glue only to self-mirrored stubs (along-edge axis
  argument, §2 taxonomy).
- L3 (closed sufficiency): conditions 1 + 2a on a closed M are exactly what §2's development
  construction needs. (Feeds Theorem C.)

**S. Search exhaustiveness (no-drop).** [owed, the novel core]
- S1 (guided descent): for every closed valid M with vertex types t₁ ≤ … ≤ t_k there is a
  root-to-leaf path in the DFS tree producing a stub system isomorphic to M. Induction on
  glued stubs: at each node the solver selects a free stub s (which one is irrelevant, any
  deterministic or even arbitrary choice works); M glues φ(s) to some stub; if that stub's
  vertex is already represented, the matching glue is among the tried candidates (the loop
  tries ALL free stubs of matching parity, eu_solver.cpp:641); if not, the solver tries
  attaching a fresh vertex of the right type ≥ vertype[0] and, by A5, some tried
  representative stub extends the partial isomorphism. Intermediate states pass checkpart by
  L1, so no prefix of the path is pruned.
- S2 (min-root reachability): every M has a vertex of minimal type; initex roots a search at
  every type; the S1 path exists from that root since all other types are ≥ it.
- S3 (level closure): the run with budget maxnum = K emits every closed solution with
  num = k ≤ K (the budget only gates vertex addition; `seen = 0` in the port emits all k).
- S4 (checkpart correctness): the code's cycle walk implements conditions 1/2a/2b exactly
  (loop-level argument on eu_solver.cpp:256-293).

**R. Rigidity filter.** [owed, uses §2 congruence fact]
- R1: WL stable partition = coarsest congruence; discrete ⟺ core. (Proof in §2.)
- R2 (rejection sound): if M is not a core, its proper quotient M' is a smaller closed valid
  configuration over the alphabet with develop(M') = develop(M); iterating reaches the core
  M* of the same tiling, which the search also finds (S1-S3) and accepts. Rejecting M loses
  nothing. Requires: quotient stays inside the alphabet (that is exactly what the variant
  entries are for; A2/A3 make it precise).
- R3 (acceptance sound, no over-count): if M is a core then G(develop(M)) induces no extra
  identification: any strictly larger symmetry group G' ⊋ H(M) would induce a proper
  congruence on M (orbit merging or stabilizer growth strictly reduces stub count), which a
  core does not have. Hence the k declared by M equals the true uniformity of develop(M).
  Worked example (p4-encoded square tiling) in §4.5 of this outline's expanded write-up.

**C. Realizability (development exists).** [owed; classical ingredients]
- C1: closed valid M ⇒ S(M) is a closed flat orbifold (links 2π or 2π/m everywhere; L3).
- C2: its universal cover is isometric to ℝ² [classical: Killing-Hopf]; the induced tiling
  develop(M) is edge-to-edge by unit regular polygons, with symmetry ⊇ the deck group, which
  acts with quotient M. Convexity of tiles is never used (this is why C transfers verbatim to
  stars).
- C3 (eu_develop computes it): the BFS on (stub, direction) pairs is the developing map on
  the direction bundle; recorded discrepancies generate the deck translation lattice
  (covering-space argument on the finite bundle graph); HNF + Lagrange-Gauss + seeds mod Λ
  produce the cell. Float enters only lattice reduction and coset reduction, never positions;
  the exact area certificate Σ areas = |det Λ| is the independent runtime guard.

**B. Bridge (every tiling is represented).** [owed; classical ingredients]
- B1: T k-uniform ⇒ G(T) cocompact (k compact vertex stars cover ℝ² under G(T)) ⇒ G(T) is a
  wallpaper group [classical: Bieberbach]. Corollary: k-uniform ⇒ periodic.
- B2: T/G(T) is a finite closed stub system over the alphabet with exactly k vertex types
  (uses A2 for vertex orbits and the §2 gluing taxonomy for edge orbits; face orbits give 2a),
  satisfying conditions 1+2 (L1), and it is a core (a proper congruence would produce, via
  development uniqueness, a symmetry of T outside G(T), contradiction).
- B3 (round trip): develop(T/G(T)) ≅ T, and T/G(develop(M)) ≅ M for cores M. This is the
  bijection statement; C + R3 + B2 assemble it.

**P. Pruner exactness.** [owed, short]
- P1: on WL-discrete connected functional structures, `comparesolutions` returns true iff the
  two structures are isomorphic. (Trace-equivalence partners are unique by discreteness; a
  surviving cross pair extends to an isomorphism word-by-word; connectivity via
  rneig/mirro/glue makes it total.)
- P2: fingerprint bucketing and the signature grouping are isomorphism invariants, so they
  never separate duplicates; they only skip guaranteed-negative comparisons.
- P3 (cross-check, optional but cheap): develop both members of any pruner-merged pair and
  compare canonical form N keys; Cor 5.5 of the N note makes N-key equality equivalent to
  geometric congruence in the ζ₁₂ model. This turns the historically scary "over-merge drops
  a tiling" failure into a machine-auditable event on real runs.

Dependency order for writing: definitions → A → L → S → R → C → B → P. The genuinely novel
prose is S, R, and B2/B3; A is a program plus a page of glue; C and B1 are assemblies of
classical facts around the right definitions.

### What the k=8 exhibit buys

S1-S3 is precisely the theorem the Python lineage violated (one tiling missing at k=8 and
k=9). Identifying the dropped tiling and the code path that lost it (candidate suspects: the
Python solver's own analogue of the ferk table, or an output/dedup path, or count.txt's
missing "8:" row being a transcription loss) gives the thesis a concrete, named failure that
the proof excludes. It also settles the count.txt loose end: today README.md cites count.txt
as agreeing on 2850 while count.txt's own k=8 breakdown sums to 2849. That inconsistency
should not survive into a thesis that cites count.txt as an authority.

## 4. Track 2: star extension, grounded in the code

Scope statement first: this extends **Čtrnáct's engine**. No star code exists for it; the
prior star work in the repo targets AL's engine and is reused only as conventions and oracle
data. The engine is table-driven, so the extension is an alphabet swap plus a corner-class
generalization plus a develop parameterization. File by file:

### 4.1 Tile model

Palette element = regular n-gon (corner word: one corner class, interior angle, word length
n, rotation period 1) or isotoxal star n*α (corner word: (point, dent)^n, angles α and
2π − 2π/n − α, word length 2n, rotation period 2). All edges unit. Per-palette angle unit
π/N with N chosen so all corner angles are integer multiples (in-ring: N = 24; Myers'
out-of-ring families: N = 36 for {9, 18, 6*_{4π/9}, 3*_{2π/9}, ...}, N = 20 for the 5-fold
family). The solver itself only ever sees integers.

### 4.2 eu_solver.cpp changes

- `vertexdef.lvert : int` (polygon size) becomes `corner : int` (corner-class id). A small
  global table maps class id → (tile id, position mod period, angle units); tile id → (word
  length L, period p).
- `checkpart` (eu_solver.cpp:256): condition 1 "same lvert along cycle" becomes "corner class
  advances by +1 mod p along the face walk" (regular tiles: p = 1, degenerates to equality).
  Condition 2a `mainvert % count != 0` becomes `count % p != 0 || L % count != 0`; condition
  2b `count > mainvert` becomes `count > L`. Everything stays O(cycle length) integer work.
- `mincycle` in `writecycle` (line 296): `vstable - count` becomes `L - count`; the `maxpoly`
  sentinel becomes max L over the palette (line 26).
- Line 634's `label[firstfree][0] == '*'` string sniffing: replace with an explicit
  `is_starred` array when the alphabet is generated (generated labels must not silently break
  this hidden contract).
- `finename`/`filesignature` family naming: generalize from the hardcoded {3,4,6,c} checks
  (lines 158-173) to palette-driven codes.
- `simplify` needs no change beyond seeding colors with corner-class ids instead of lvert
  (line 589).

### 4.3 The alphabet generator (new tool, serves both tracks)

One program (suggest Python, exact rationals): input palette, output the vertexdef table plus
`pruner_tables.inc` analogue plus a certificate log. Steps: enumerate cyclic corner-words
with angle sum 2π (finite Diophantine in π/N units); compute each word's dihedral symmetry;
enumerate subgroup conjugacy classes; emit folded stub structures and ferkval; verify the A4
identities and the A5 orbit computation for every entry as it emits. Acceptance test that
also discharges Track 1's A3: run it on the regular {3,4,6,12} palette and diff against the
44 hand-written entries. Do NOT bake in Myers' three combinatorial prunes (no two dents at a
vertex, no adjacent points, every star vertex has a point); they are theorems about valid
tilings, so the safe play is to omit them (the engine only loses speed) or adopt them later
with proofs, each one flagged as a completeness-relevant filter per repo doctrine.

### 4.4 Dent-fill points (the one real modeling decision)

Myers' convention: a point where exactly two tiles meet at 2π (a star point seated in a dent)
is not a vertex; k-uniformity counts orbits of true vertices (≥ 3 tiles). Recommended
modeling: include 2-stub vertex types for the point+dent = 2π pairings, marked non-counting;
`num`/`maxnum` accounting counts only true vertex types; k reported = counting types.
Termination then needs a dent-budget bound (the count of non-counting types a closed solution
can contain, bounded via the orbifold Euler characteristic / face-cycle capacity of the
counting types). That bound is the one new finiteness lemma Track 2 owes; until it is proved,
run with an explicit dent cap and log it loudly per the completeness doctrine. The
alternative (bent-edge gluings that splice dent-fills out of the object) avoids the budget
question but complicates the gluing taxonomy and its taxonomy lemma; keep it as fallback.

### 4.5 eu_pruner.cpp / decode

`decode` and `pruner_tables.inc` regenerate from the same generator (§4.3), so pruner and
solver stay in certified agreement (A4 analogue). `simplify`/`comparesolutions`/fingerprint
are structure-agnostic already; only the seed coloring switches to corner classes. P1's
exactness proof carries over unchanged (it never uses what the colors mean).

### 4.6 eu_develop.cpp changes

- Ring: `Vec` = rank-φ(2N)... concretely per palette: in-ring N=24 ⇒ ℤ[ζ₂₄], rank 8, min
  poly x⁸ = x⁴ − 1... (use Φ₂₄(x) = x⁸ − x⁴ + 1); N=36 ⇒ rank 12; N=20 ⇒ rank 8. Templating
  the existing 4-vector code over (rank, reduction matrix) is mechanical; the repo already
  has ζ₂₄ arithmetic experience on AL's side to crib representations from (representation
  only; no algorithm reuse).
- `angunits` (line 46) becomes per-corner signed turn in π/N units; reflex corners produce
  the larger step and the existing `((d + step) % 2N + 2N) % 2N` normalization already
  handles it (line 139 pattern). The star-walk guard (60 steps) parameterizes to 2N × max
  wraps.
- The 12 in `placed` keys, `ZK`, and direction arithmetic parameterize to 2N.
- Area certificate: exact star area has the closed form A(n,α) (already derived on the
  theory side; method-agnostic fact), so Σ face areas = |det Λ| stays an exact gate per
  palette ring.
- Out-of-ring palettes run as separate invocations with their own N; the search stage needs
  no field at all, so one solver binary serves every palette.

### 4.7 Oracle protocol vs Myers

Pass/fail is per-tiling, not count-only. k=1: Myers' edge-to-edge lists (Fig. 4 entries a-q,
plus the dent-at-vertex Fig. 3 classes; pinned entries first, α-families recognized as
families). k=2: the 43-record transcription in `experiments/star-oracle/myers-2009-k2.json`
(34 in-ring + 4 out-of-ring + regular-orbit pins). Before comparing, settle two conventions
on Myers' side: (i) dent-fill non-vertex counting (§4.4) and (ii) chirality accounting at
k=2 (the engine mirror-merges by construction; Myers' k=2 list must be read under the same
merge or the comparison adjusted). Both are bookkeeping, both must be written down before
the first run, or a count mismatch will be undiagnosable. Remember Myers' lists are
themselves unproven hand enumerations: a mismatch is evidence about one of the three parties
(engine, transcription, Myers), not automatically an engine bug. That is what makes this
track scientifically interesting rather than a regression test.

### 4.8 The α-symbolic extension (Track 4 seed, noted here because the code shape matters)

Myers' full problem has continuous α. A complete star enumeration treats corner angles as
exact affine forms a + b·α; each vertex configuration imposes Σ = 2π, a linear condition
that either pins α to a rational multiple of π or holds identically (the α terms cancel:
those are Myers' infinite families). The alphabet generator can enumerate the finitely many
strata (pinned values and free intervals) instead of a fixed angle grid; the solver is
untouched (it never sees angles); develop runs per stratum, and realizability needs no
exactness at all since Theorem C is a theorem, not a computation. This is why I think
Track 4 is closer than the brief believes: the missing "finiteness theorem" for stars is the
same structural finiteness as Track 1 (quotient objects with k orbits are finite), plus the
dent-budget lemma, plus stratum enumeration. None of that is a period bound.

### 4.9 Milestones

1. Alphabet generator + regular-palette diff (= Track 1 A3/A4/A5 certificate). Gate: 44/44.
2. Solver generalization (corner classes) + re-run regular k ≤ 6. Gate: 11-analogue counts
   (10/20/61/151/332/673) byte-identical catalogs vs current binary.
3. In-ring pinned star alphabet (N=24), k=1 run. Gate: Myers Fig. 4 in-ring entries
   reproduced per-tiling (13 pinned) + Fig. 3 pinned entries; dent conventions written down.
4. k=2 in-ring run. Gate: the 34 in-ring records of myers-2009-k2.json.
5. develop parameterization (ζ₂₄), render spot-checks; exact area gate on.
6. Out-of-ring palettes (N=36, N=20), completing Myers' k=1 (17/17) and k=2 (38+5 families).
7. Dent-budget lemma written; caps removed or proven.

## 5. Ordered next actions

1. **Write the table certificate checker** (finite, one day): verifies A4 identities, A5
   ferk/orbit facts, A1 configuration completeness against the 44 entries and the three
   table copies. This retires risk 1 immediately and is reusable as the generator's
   self-test.
2. **Write the formal model note** (the §2 definitions, especially the dart/orbit semantics
   of stub systems): everything else in Track 1 keys off it.
3. **Run the k=8 diff experiment**: C++ catalogue vs Python-lineage catalogue at k=8,
   identify the missing tiling, root-cause it in `euclidean_solver_mega.py`, reconcile
   count.txt's breakdown-vs-total, and write the exhibit.
4. **Draft Lemmas S1-S3 and R1-R3 in full** (the novel spine), then L, C, B, P.
5. **Start the alphabet generator** (Track 2 milestone 1, which doubles as Track 1's A3).

Items 1-3 are independent and can run in parallel; 4 depends on 2; 5 depends on 1's checker
existing as its acceptance harness.
