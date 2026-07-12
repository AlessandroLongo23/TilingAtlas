# Deliverable B — implementation-faithfulness audit of the Čtrnáct C++ pipeline

Date: 2026-07-12 (round 3 of the completeness program; companion to
`docs/ctrnact-completeness/skeleton.tex`, whose lemmas this audit grounds in the code).
Scope: `tools/ctrnact-oracle/` — `eu_solver.cpp`, `eu_pruner.cpp`, `eu_develop.cpp`,
`ctrnact_decode.hpp`, `alphabets/gen_alphabet.py`, tables `tables/regular/`. Regular
palette only. Line numbers refer to the working tree at audit time.

**Verdict.** The C++ pipeline implements the abstract algorithm proved complete and
correct in deliverable A. Every load-bearing contact point that bears on completeness or
correctness (audit hooks 1–9 of the skeleton, §12) checks out on valid pipeline input;
the machine certificates A3–A6 pass, A6 newly added this round; the P3 geometric
cross-check passes in both directions for all k ≤ 6. Eight fix-obligations are recorded
below — none affects correctness on valid pipeline input; they are robustness hardening,
guard-to-assertion conversions, one exactness upgrade in a non-decision-critical output
path (FB-1), and one validation-instrument correction (FB-8, the sharding gate compares
up to block reordering, not byte-for-byte). The historical k=8/9 anomaly is fully
root-caused (§4): a wrong hand-computed attachment bound for one vertex letter in
Čtrnáct's *Python* solver — precisely the failure class Lemma A5's certificate exists to
exclude, and the C++ tables have it right. This verdict was stress-tested by an
adversarial-referee pass (2026-07-12): it found no defect in T/S/C/U for the regular
palette; its one serious finding was the byte-identity overclaim now corrected as FB-8/H3.

---

## 1. Verified-sound audit items (no change needed)

Each item states the proof obligation it discharges, the code receipt, and the check.

**H1. Alphabet tables (A3, A4, A5).** `alphabets/gen_alphabet.py` regenerates the 44
regular-palette entries from first principles (configurations = angle-sum words; variants
= all subgroup folds) and gates them against Marek's untouched original
(`reference/eu_solver.orig.cpp`, `parse_legacy`): exact array match (labels, lneig,
rneig, mirro, lvert display) plus ferkval equality per entry, plus the completeness
direction (every generated fold present among legacy entries 1:1 up to isomorphism).
`certify()` checks per entry: λ∘ρ = id, μ² = id, μ∘ρ = λ∘μ, c∘μ = c∘ρ (A4); |Aut|
computed by brute force = ferkval, Aut acts freely, `reps` = one lexicographic
representative per Aut-orbit (A5 — the generated `reps` is a transversal *by
construction*, which is stronger than the lemma needs). Verified 2026-07-12: regenerated
tables are byte-identical to the shipped `tables/regular/*.inc` (only `certs.txt` gained
the new A6 line), and `make check-regular` reproduces the golden k≤6 catalogs
byte-identically (10/20/61/151/332/673).

**H2. Candidate enumeration (S1).** `eu_solver.cpp:642-676`: the existing-stub loop
tries *every* free stub `i` of matching μ-parity, including `i == firstfree` (self-glue)
and `i == mirro[firstfree]`; `eu_solver.cpp:680-746`: the fresh-vertex loop tries every
letter `gr >= vertype[0]` and every `reps` dart of matching parity. The starred-stub
normalization (`eu_solver.cpp:635-637`) loses nothing: glue is maintained μ-equivariantly
(pairs glued together, `:648-651`), so a stub is free iff its mirror is, and gluing the
unstarred partner determines both.

**H3. Rooting and sharding (S2).** `initex()` (`eu_solver.cpp:410-438`) roots one DFS at
every letter; `EU_SHARD_N/W` partitions the root set by index residue (`:413`), workers
share no state, and the min-root invariant makes root subtrees disjoint, so the shard
union equals the sequential run **as a multiset of blocks** — which is exactly what
Lemma S2 asserts and needs (the pruner dedups by isomorphism class within k, insensitive
to block order). Measured (MAXNUM=4, `EU_SHARD_N ∈ {2,3,5}`, worker-order merge): the
per-file block *multisets* are identical to the sequential run in every raw and pruned
family. They are **not byte-identical**: worker-order concatenation groups roots by index
residue while the sequential run emits in root order, so blocks are reordered within each
file and a naive `diff -r`/`sha` fails. The comments claiming byte-identity
(`eu_solver.cpp:41-43`, `run-oracle-parallel.sh:5-7`) overstate the guarantee; see
**FB-8**. This is a validation-instrument defect, not a completeness or correctness
defect: S2's mathematical claim (multiset equality) holds and is what the measurement
confirms. (An earlier draft of this audit asserted the byte-identity gate as an empirical
discharge; corrected here after the adversarial review reproduced the reordering.)

**H4. Emission (S3).** `writesolution` is called unconditionally after `simplify`
acceptance (`eu_solver.cpp:656-658, 717-719`); `seen = 0` emits every k in
[1, maxnum]; the noncounting budget is inert on the regular palette
(`has_noncounting = false`, `eu_solver.cpp:770`); `EU_STREAM` changes only the sink
(`:553-563`); no other cap, filter, or budget sits in the write path. `EU_KONLY`
(`eu_pruner.cpp:289`) is a user-selected per-k restriction applied before decode and
cannot affect the selected k.

**H5. Local tests (S4).** `checkpart` (`eu_solver.cpp:250-281`) walks the face cycle
from *every* stub, so each closed cycle is checked for color constancy and length
divisibility, and each maximal open chain is checked at full length from its earliest
stub (walks from mid-chain stubs are strictly weaker suffix checks, redundant but
harmless). For the regular palette (`CLASS_P = 1`, `CLASS_NEXT = id`) the class-advance
logic degenerates to Marek's original equality test. `writecycle`'s `mincycle` always
returns a free stub when one exists (every free stub bounds an open walk); re-walking
cycles from stubs not yet in `smet` recomputes the same `dif` and cannot change the
minimum.

**H6. Pipeline ordering and refinement (R1, P1).** Both pruner paths run
`decode → simplify → compareToSeen` in that order (`eu_pruner.cpp:259-264` file mode,
`:290-294` stream mode) — the correctness precondition of Lemma P1 (both comparands are
cores). The solver's `simplify` (`eu_solver.cpp:575-613`) is textbook iterated partition
refinement on the 6-tuple; the pruner's (`eu_pruner.cpp:50-94`) is greatest-fixpoint
pair elimination; Lemma R1(iii) proves both compute the coarsest congruence.
`comparesolutions` (`eu_pruner.cpp:101-159`) is the cross-relation fixpoint of Lemma P1.

**H7. Bucketing (P2, A6).** Bucket key = (signature line, 3-round refinement
fingerprint) (`eu_pruner.cpp:192-194`); the fingerprint hashes isomorphism-invariant
data only (`:169-188`); the signature is invariant given A6 (now machine-certified);
buckets are per-k in file mode (`:337`) and cannot collide across k in stream mode
(signatures determine the letter multiset, hence k).

**H8. Decode round trip.** `ctrnact_decode.hpp` `decode()` inverts `writesolution` on
valid blocks: identical `edgelabel` conventions on both sides, μ-equivariant glue
closure (`makeglue:86-88` mirrors `extend`'s pair maintenance), vertices rebuilt in
vertype-line order = emission order. `buildvertextypes` hard-aborts on unknown symbols
(palette mismatch guard, `:110-116`).

**H9. Developer (C4).** `eu_develop.cpp` `develop()` iterates exactly the direction
bundle of skeleton §8: `star()` = corner steps, glue step = edge step with `d+6`;
positions exact in ℤ[ζ₁₂]; period discrepancies recorded at every non-tree step
(`reg():148-153`); `lattice_basis` is exact integer elimination; `gauss_reduce` uses
float only for the rounded reduction coefficient — every operation is unimodular, so
the output is a basis of the same lattice for *any* coefficient values, and the guard
(1000 iterations) only bounds reduction quality, never correctness. Empirical: all 2775
raw k≤6 blocks and all 2850 k=8 blocks develop with zero errors.

---

## 2. Fix-obligations (file:line — is / ought / minimal fix)

Ranked by importance. None is a correctness bug on valid pipeline input; "valid input"
is what the solver emits and the certified tables define.

**FB-1 (exactness upgrade; should fix before star palettes).**
`eu_develop.cpp:114-128` (`seeds_mod_lattice`).
*Is:* coset reduction of exact positions uses float barycentric coordinates with a
`+1e-9` nudge before `floor`; the reduced representative, and hence seed identity in the
`std::set<Vec>`, depends on float. Adversarially large coordinates could split one
vertex class into two seeds or choose inconsistent representatives.
*Ought (C4):* seed reduction is exact integer arithmetic.
*Minimal fix:* reduce each position by the canonical coset representative of
`docs/canonical-form/` Lemma 2.2 (HNF pivots of Λ ⊂ ℤ⁴, two integer floor divisions);
keep the float path as a cross-check assert. Note: `develop.py` must receive the same
fix or the byte-identity gate between them must be re-based.
*Risk now:* none observed at k ≤ 16 (coordinates are small; verified by the area/count
gates and P3), but the float dependence is a standing liability the thesis text should
not have to caveat.

**FB-2 (robustness).** `ctrnact_decode.hpp:79-88` (`makeglue`).
*Is:* a Conway token that matches no label yields `k[i] = -1` and writes `glue[-1]`
(out-of-bounds, UB).
*Ought:* malformed input dies loudly, like `buildvertextypes` does.
*Minimal fix:* `if (it == lidx.end()) { fprintf(stderr, "FATAL: unknown token '%s'\n",
st.c_str()); abort(); }`.

**FB-3 (robustness).** `ctrnact_decode.hpp:71-74` (`makeglue` loop).
*Is:* `findindex` returning −1 (no closing bracket) makes `substr(0,0)` and the loop
never consumes `c`: infinite loop on malformed Conway strings.
*Ought:* loud abort. *Minimal fix:* `if (ind < 0) { fprintf(...); abort(); }`.

**FB-4 (guards → assertions).** `eu_develop.cpp:137,161` (star-walk 60, BFS pops 200k).
*Is:* magic constants; a hit would surface as a develop error (loud, not silent), but
the bounds are unexplained.
*Ought (C4):* provable bounds: a corner-step cycle has length = developed vertex degree
≤ 6 for the regular palette (≤ 2·max word length in general); BFS pops ≤ keys
= 12·(stub count).
*Minimal fix:* compute both bounds from the loaded tables at startup and assert against
them; keep the current constants as outer fuses.

**FB-5 (document the ordering invariant).** `eu_pruner.cpp:259, 290`.
*Is:* nothing marks simplify-before-compare as load-bearing.
*Ought:* a comment naming it a correctness precondition (Lemma P1's hypothesis: both
comparands must be cores), so a refactor cannot innocently reorder.
*Minimal fix:* two-line comment at each site. (Applied to this audit; code comment
pending next engine-touching commit to keep this round diff-free in the hot path.)

**FB-6 (stream-mode memory note).** `eu_pruner.cpp:279-306`.
*Is:* `sols`/`bucket` are never cleared across k in stream mode (they are per-k in file
mode).
*Ought:* correctness is unaffected (signatures never collide across k); memory grows to
the whole run. *Minimal fix:* none required; optional per-k flush keyed on the k of the
incoming block if memory ever matters at k ≥ 17.

**FB-7 (build-time only).** `alphabets/gen_alphabet.py:394` uses `eval()` on
initializer text parsed from the in-repo original C++. Trusted input, build-time only;
note for hygiene, no action required.

**FB-8 (false byte-identity claim; correct the gate).** `eu_solver.cpp:41-43`,
`run-oracle-parallel.sh:5-7`.
*Is:* both comments assert the parallel-merged pruned catalog is "byte-identical" to a
sequential run and prescribe `diff -r` / sha as the acceptance gate. Adversarial review
reproduced (MAXNUM=4, N∈{2,3,5}) that the block *multisets* match exactly but block
*order* differs, so `diff -r` fails on provably-correct output; any past "byte-identical"
claim for a parallel run either did not use this gate or would have failed it.
*Ought:* the gate compares catalogs up to block reordering.
*Minimal fix:* reword both comments to "multiset-identical (identical after sorting
blocks within each file)"; change the acceptance step to sort blocks per file (or hash
the sorted-block set) before diffing. No code-logic change; the completeness argument
(Lemma S2) is unaffected. *Risk now:* none to correctness; the risk is a validation gate
that rejects good output or was silently never green, which matters for the star/composite
production runs (`run-par-*`) that rely on it.

---

## 3. Machine certificates — status after round 3

| Certificate | Status | Where |
|---|---|---|
| A3 table correctness (44/44, both directions) | PASS (re-run 2026-07-12) | `gen_alphabet.py` gate; `tables/regular/certs.txt` |
| A4 structural identities | PASS per entry | `certify()` lines in `certs.txt` |
| A5 ferk transversal (|Aut| = ferkval, free, reps per orbit) | PASS per entry | `certify()`; legacy-prefix assertion for the pinned palette |
| A6 pairwise non-isomorphism of the 44 letters | **ADDED + PASS** | `gen_alphabet.py` (iso_key distinctness); cert line in `certs.txt` |
| Shipped tables = generated tables | PASS (byte-identical; only certs.txt +1 line) | `make check-regular` + git diff |
| Golden k≤6 catalogs byte-identical | PASS | `make check-regular` |
| P3 no-under-merge (pruned N-keys pairwise distinct) | PASS k=1..6 (10/20/61/151/332/673) | `scripts/p3-nkey-crosscheck.ts` |
| P3 no-over-merge (raw vs pruned N-key sets equal) | PASS k=1..6 (2775 raw blocks developed, 0 errors) | same |

P3's arbiter is the proven canonical form N (`docs/canonical-form/`, Cor. 5.5); its
Stage A recomputes the maximal lattice, so keys are insensitive to which quotient
produced a cell. Extending P3 to k=7,8 is a few minutes of compute if wanted; nothing
in the proof depends on it.

---

## 4. The k=8/9 exhibit — root cause, closed

The historical anomaly: A068599 and Čtrnáct's stated totals give k=8 = 2850,
k=9 = 5960; the 2026-07-08 in-repo reproduction (Čtrnáct's Python
`euclidean_solver_mega.py`, ported with no logic changes, + his pruner) produced
**2849**, and Čtrnáct's own `count.txt` k=8 row headers sum to 2849 — which that
session's log read as confirmation that 2850 was Marek's typo. The C++ engine later
produced 2850, flipping the verdict with no root cause. Round 3 closes it:

1. **The C++ k=8 catalog (2850) vs Marek's `count.txt`:** every per-row cell matches
   *except* the 4-distinct-species row: C++ finds 795, Marek's row header says 794 —
   and Marek's own sub-breakdown of that row (78 + 230 + 133 + 314 + 40) sums to
   **795**. His stated total 2850 is consistent with his sub-breakdowns; only the row
   header is off by one. Verdict: arithmetic slip in the header, correct total.
2. **The dropped tiling, identified.** Canonical-key diff of the surviving 2026-07-08
   Python catalog (2849) against the C++ catalog (2850): exactly one solution present
   in C++ and absent from the Python lineage, none the other way. It is
   `ctrnact-08_34c-4a_4b_4n_4s_4t_5c_5d2-1`: vertex letters (3,3,4,12), (3,4,3,12)A,
   (4,4,4,4)S4, (4,4,4,4)A1, (4,4,4,4)A2, (3,3,3,4,4)A, (3,3,3,4,4)F×2; species
   partition 3+3+1+1; 41 vertex classes per cell; square lattice, group **p4m**
   (orbifold \*442). Exact cell: T1 = [2,5,−1,−5], T2 = [0,1,5,1] over ℤ[ζ₁₂].
3. **The Python pruner is exonerated:** fed today's C++ raw k=8 stream, Čtrnáct's
   Python pruner returns exactly 2850. The loss is in the Python *solver*: its raw
   output contains zero blocks with the dropped solution's signature (the C++ raw
   contains exactly one — the tiling is reached by a *unique* DFS path).
4. **Root cause: a wrong hand-computed attachment bound.** The Python solver's
   `ferk()` is a hand-maintained divisor list over symbol names. Diffing it against the
   machine-certified transversal for all 44 letters: seven entries disagree. Six
   over-try (redundant candidates; harmless, pruner cleans up). Exactly one
   **under-tries: (4,4,4,4)A2 gets range 1 instead of 2** — the A2 letter's dart set is
   {0, \*0, 2, \*2} with Aut-orbits {0,2} and {\*0,\*2}, so the prefix {0} misses the
   entire starred orbit. The dropped tiling's unique path attaches its fresh
   (4,4,4,4)A2 by the gluing `[1'' 0@5]`, i.e. at dart \*0 — exactly the dart Marek's
   Python never tries. His C++ tables carry ferkval = 2 for A2, which is why his C++
   totals are right.
5. **QED test (run 2026-07-12, log
   `experiments/results/ctrnact-k8-pyfix-2026-07-12.log`):** moving `(4,4,4,4)A2` from
   the /4 list to the /2 list in the Python solver (one-entry change, ferk 1 → 2) and
   re-running k=8 end-to-end: the Python pipeline now returns **2850**, and the
   previously-dropped tiling appears exactly **once** in the raw solver output (the
   unique path, as the C++ predicted) and once in the pruned catalog. Root cause
   confirmed by falsification.

Thesis value: this is Lemma A5's failure class realized in the wild, in the author's
own reference implementation, invisible to count-level validation for four years
because a *second, independent* clerical error (the row-header slip) produced the same
total. The A5 certificate (|Aut| = ferkval, reps meet every orbit, machine-checked per
entry per palette) is exactly the check that makes this class of error impossible in
the audited engine; the generator's explicit `reps` mechanism additionally removes the
prefix-rule assumption the hand table silently made.

---

## 5. What remains open on the implementation side

- Apply FB-1..FB-4 in an engine-touching commit gated by `make check-regular`
  (byte-identity) — deliberately not done in this round to keep the audited binaries
  identical to the ones measured.
- The audit covers the regular palette. Star/composite palettes reuse the same code
  paths but their tables carry their own A3–A6 certificates per palette; the
  generator's `--certify` covers them, with the pinned-legacy gate replaced by the
  systematic-naming path (`gen_alphabet.py`, non-pinned branch).
- P3 at k=7,8 (optional; cheap).
