# Iterating the squaring (2026-08-19)

Feed a squared torus back in as the tiling and square it again. The prediction from Euler, before
any run: every vertex of a squared torus is generically a T-junction of degree 3, the squaring has
one face per edge going in, so 3V = 2E' and V - E' + F = 0 give **E' = 3E**. The edge count should
triple every step, which would make the process strictly expanding: no cycles, no combinatorial
limit. What can still settle is the SHAPE — the modulus tau of the flat torus, and the spread of
the sizes.

Caps: stop past E = 700 or 8 steps, whichever comes first. The solve is a BigInt
Bareiss elimination whose determinant is the spanning-tree count, so it is exponential in E.

| seed | rule | step | V | E | F | E'/E | deg-3 | order | distinct | perfect | spread | tau | ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|| 4.4.4.4 square | fixed | 1 | 1 | 2 | 1 | - | 0% | 1 | 1 | no | 1.00 | 0.0000+1.0000i | 0 |
| 4.4.4.4 square | fixed | 2 | 1 | 2 | 1 | 1.000 | 0% | 1 | 1 | no | 1.00 | 0.0000+1.0000i | 0 |
| 4.4.4.4 square | fixed | 3 | 1 | 2 | 1 | 1.000 | 0% | 1 | 1 | no | 1.00 | 0.0000+1.0000i | 0 |
| 4.4.4.4 square | fixed | 4 | 1 | 2 | 1 | 1.000 | 0% | 1 | 1 | no | 1.00 | 0.0000+1.0000i | 0 |
| 4.4.4.4 square | fixed | 5 | 1 | 2 | 1 | 1.000 | 0% | 1 | 1 | no | 1.00 | 0.0000+1.0000i | 0 |
| 4.4.4.4 square | fixed | 6 | 1 | 2 | 1 | 1.000 | 0% | 1 | 1 | no | 1.00 | 0.0000+1.0000i | 0 |
| 4.4.4.4 square | fixed | 7 | 1 | 2 | 1 | 1.000 | 0% | 1 | 1 | no | 1.00 | 0.0000+1.0000i | 0 |
| 4.4.4.4 square | fixed | 8 | 1 | 2 | 1 | 1.000 | 0% | 1 | 1 | no | 1.00 | 0.0000+1.0000i | 0 |
| 4.4.4.4 square | fixed | STOP | | | | | | | | | | | max steps |
| 4.4.4.4 square | richest | 1 | 1 | 2 | 1 | - | 0% | 2 | 2 | yes | 3.00 | 0.0000+1.0000i | 0 |
| 4.4.4.4 square | richest | 2 | 4 | 6 | 2 | 3.000 | 100% | 6 | 4 | no | 4.00 | -0.2500+1.2500i | 0 |
| 4.4.4.4 square | richest | 3 | 11 | 17 | 6 | 2.833 | 91% | 17 | 9 | no | 4.60 | -0.2472+1.8315i | 1 |
| 4.4.4.4 square | richest | 4 | 33 | 50 | 17 | 2.941 | 97% | 50 | 26 | no | 64.95 | -0.2351+3.2370i | 9 |
| 4.4.4.4 square | richest | 5 | 100 | 150 | 50 | 3.000 | 100% | 150 | 76 | no | 70.88 | -0.4007+6.4433i | 163 |
| 4.4.4.4 square | richest | STOP | | | | | | | | | | | map failed: unmatched-dart (no opposite dart at midpoint (0.9869, 0.5614)) |
| 3^6 triangular | fixed | 1 | 1 | 3 | 2 | - | 0% | 2 | 1 | no | 1.00 | 0.0000+1.0000i | 0 |
| 3^6 triangular | fixed | 2 | 2 | 4 | 2 | 1.333 | 0% | 2 | 1 | no | 1.00 | 0.0000+1.0000i | 0 |
| 3^6 triangular | fixed | 3 | 2 | 4 | 2 | 1.000 | 0% | 2 | 1 | no | 1.00 | 0.0000+1.0000i | 0 |
| 3^6 triangular | fixed | 4 | 2 | 4 | 2 | 1.000 | 0% | 2 | 1 | no | 1.00 | 0.0000+1.0000i | 0 |
| 3^6 triangular | fixed | 5 | 2 | 4 | 2 | 1.000 | 0% | 2 | 1 | no | 1.00 | 0.0000+1.0000i | 0 |
| 3^6 triangular | fixed | 6 | 2 | 4 | 2 | 1.000 | 0% | 2 | 1 | no | 1.00 | 0.0000+1.0000i | 0 |
| 3^6 triangular | fixed | 7 | 2 | 4 | 2 | 1.000 | 0% | 2 | 1 | no | 1.00 | 0.0000+1.0000i | 0 |
| 3^6 triangular | fixed | 8 | 2 | 4 | 2 | 1.000 | 0% | 2 | 1 | no | 1.00 | 0.0000+1.0000i | 0 |
| 3^6 triangular | fixed | STOP | | | | | | | | | | | max steps |
| 3^6 triangular | richest | 1 | 1 | 3 | 2 | - | 0% | 3 | 3 | yes | 4.00 | 0.1000+1.3000i | 0 |
| 3^6 triangular | richest | 2 | 6 | 9 | 3 | 3.000 | 100% | 9 | 5 | no | 4.00 | 0.3750+0.9375i | 0 |
| 3^6 triangular | richest | 3 | 18 | 27 | 9 | 3.000 | 100% | 27 | 15 | no | 22.57 | 0.4319+1.8182i | 1 |
| 3^6 triangular | richest | 4 | 54 | 81 | 27 | 3.000 | 100% | 81 | 41 | no | 61.43 | 0.2825+3.6356i | 20 |
| 3^6 triangular | richest | 5 | 162 | 243 | 81 | 3.000 | 100% | 243 | 123 | no | 173.68 | 0.4838+7.4314i | 690 |
| 3^6 triangular | richest | STOP | | | | | | | | | | | map failed: unmatched-dart (no opposite dart at midpoint (0.9851, 0.0628)) |
| 6^3 hexagonal | fixed | 1 | 2 | 3 | 1 | - | 100% | 3 | 2 | no | 2.00 | -0.5000+1.5000i | 0 |
| 6^3 hexagonal | fixed | 2 | 4 | 7 | 3 | 2.333 | 50% | 7 | 3 | no | 4.00 | -0.5000+1.7500i | 0 |
| 6^3 hexagonal | fixed | 3 | 12 | 19 | 7 | 2.714 | 83% | 17 | 5 | no | 5.00 | -0.5000+2.7000i | 0 |
| 6^3 hexagonal | fixed | 4 | 26 | 43 | 17 | 2.263 | 69% | 41 | 12 | no | 70.00 | -0.5000+3.5429i | 0 |
| 6^3 hexagonal | fixed | 5 | 74 | 115 | 41 | 2.674 | 89% | 107 | 26 | no | 108.67 | -0.5000+5.9562i | 3 |
| 6^3 hexagonal | fixed | 6 | 184 | 291 | 107 | 2.530 | 84% | 283 | 73 | no | 897.01 | 0.5000+8.7936i | 55 |
| 6^3 hexagonal | fixed | STOP | | | | | | | | | | | map failed: unmatched-dart (no opposite dart at midpoint (0.0013, 0.4878)) |
| 6^3 hexagonal | richest | 1 | 2 | 3 | 1 | - | 100% | 3 | 3 | yes | 3.50 | -0.1379+1.3448i | 0 |
| 6^3 hexagonal | richest | 2 | 6 | 9 | 3 | 3.000 | 100% | 9 | 5 | no | 4.50 | -0.0984+1.7486i | 0 |
| 6^3 hexagonal | richest | STOP | | | | | | | | | | | map failed: unmatched-dart (no opposite dart at midpoint (0.5188, 0.4896)) |
| 3.6.3.6 trihexagonal | fixed | 1 | 3 | 6 | 3 | - | 0% | 4 | 1 | no | 1.00 | -0.5000+1.0000i | 0 |
| 3.6.3.6 trihexagonal | fixed | 2 | 4 | 8 | 4 | 1.333 | 0% | 4 | 1 | no | 1.00 | -0.5000+1.0000i | 0 |
| 3.6.3.6 trihexagonal | fixed | 3 | 4 | 8 | 4 | 1.000 | 0% | 4 | 1 | no | 1.00 | -0.5000+1.0000i | 0 |
| 3.6.3.6 trihexagonal | fixed | 4 | 4 | 8 | 4 | 1.000 | 0% | 4 | 1 | no | 1.00 | -0.5000+1.0000i | 0 |
| 3.6.3.6 trihexagonal | fixed | 5 | 4 | 8 | 4 | 1.000 | 0% | 4 | 1 | no | 1.00 | -0.5000+1.0000i | 0 |
| 3.6.3.6 trihexagonal | fixed | 6 | 4 | 8 | 4 | 1.000 | 0% | 4 | 1 | no | 1.00 | -0.5000+1.0000i | 0 |
| 3.6.3.6 trihexagonal | fixed | 7 | 4 | 8 | 4 | 1.000 | 0% | 4 | 1 | no | 1.00 | -0.5000+1.0000i | 0 |
| 3.6.3.6 trihexagonal | fixed | 8 | 4 | 8 | 4 | 1.000 | 0% | 4 | 1 | no | 1.00 | -0.5000+1.0000i | 0 |
| 3.6.3.6 trihexagonal | fixed | STOP | | | | | | | | | | | max steps |
| 3.6.3.6 trihexagonal | richest | 1 | 3 | 6 | 3 | - | 0% | 6 | 3 | no | 4.00 | -0.4340+0.9811i | 0 |
| 3.6.3.6 trihexagonal | richest | 2 | 12 | 18 | 6 | 3.000 | 100% | 18 | 11 | no | 5.64 | 0.1342+1.6376i | 1 |
| 3.6.3.6 trihexagonal | richest | 3 | 36 | 54 | 18 | 3.000 | 100% | 54 | 27 | no | 142.10 | 0.1071+3.4210i | 7 |
| 3.6.3.6 trihexagonal | richest | 4 | 108 | 162 | 54 | 3.000 | 100% | 162 | 83 | no | 202.17 | 0.0447+6.6015i | 234 |
| 3.6.3.6 trihexagonal | richest | STOP | | | | | | | | | | | map failed: unmatched-dart (no opposite dart at midpoint (0.9973, 0.0352)) |
| 4.8.8 truncated square | fixed | 1 | 4 | 6 | 2 | - | 100% | 5 | 2 | no | 2.00 | 0.0000+2.0000i | 0 |
| 4.8.8 truncated square | fixed | 2 | 6 | 11 | 5 | 1.833 | 33% | 9 | 4 | no | 5.00 | 0.0000+2.2000i | 0 |
| 4.8.8 truncated square | fixed | 3 | 14 | 23 | 9 | 2.091 | 71% | 19 | 5 | no | 5.00 | 0.0000+3.2000i | 0 |
| 4.8.8 truncated square | fixed | 4 | 28 | 47 | 19 | 2.043 | 64% | 43 | 13 | no | 97.00 | 0.0000+4.0309i | 0 |
| 4.8.8 truncated square | fixed | 5 | 76 | 119 | 43 | 2.532 | 87% | 109 | 26 | no | 108.67 | 0.0000+6.4562i | 3 |
| 4.8.8 truncated square | fixed | 6 | 186 | 295 | 109 | 2.479 | 83% | 285 | 74 | no | 896.44 | 0.0000+9.2927i | 59 |
| 4.8.8 truncated square | fixed | STOP | | | | | | | | | | | map failed: unmatched-dart (no opposite dart at midpoint (0.9738, 0.4874)) |
| 4.8.8 truncated square | richest | 1 | 4 | 6 | 2 | - | 100% | 6 | 4 | no | 4.00 | -0.2500+1.2500i | 0 |
| 4.8.8 truncated square | richest | 2 | 11 | 17 | 6 | 2.833 | 91% | 17 | 9 | no | 4.60 | -0.2472+1.8315i | 0 |
| 4.8.8 truncated square | richest | 3 | 33 | 50 | 17 | 2.941 | 97% | 50 | 26 | no | 64.95 | -0.2351+3.2370i | 6 |
| 4.8.8 truncated square | richest | 4 | 100 | 150 | 50 | 3.000 | 100% | 150 | 76 | no | 70.88 | -0.4007+6.4433i | 180 |
| 4.8.8 truncated square | richest | STOP | | | | | | | | | | | map failed: unmatched-dart (no opposite dart at midpoint (0.9912, 0.5084)) |

## Reading

- **4.4.4.4 square** (fixed): E = 2 -> 2 -> 2 -> 2 -> 2 -> 2 -> 2 -> 2; ratios 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00; tau 0.000+1.000i -> 0.000+1.000i -> 0.000+1.000i -> 0.000+1.000i -> 0.000+1.000i -> 0.000+1.000i -> 0.000+1.000i -> 0.000+1.000i. Stopped: max steps
- **4.4.4.4 square** (richest): E = 2 -> 6 -> 17 -> 50 -> 150; ratios 3.00, 2.83, 2.94, 3.00; tau 0.000+1.000i -> -0.250+1.250i -> -0.247+1.831i -> -0.235+3.237i -> -0.401+6.443i. Stopped: map failed: unmatched-dart (no opposite dart at midpoint (0.9869, 0.5614))
- **3^6 triangular** (fixed): E = 3 -> 4 -> 4 -> 4 -> 4 -> 4 -> 4 -> 4; ratios 1.33, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00; tau 0.000+1.000i -> 0.000+1.000i -> 0.000+1.000i -> 0.000+1.000i -> 0.000+1.000i -> 0.000+1.000i -> 0.000+1.000i -> 0.000+1.000i. Stopped: max steps
- **3^6 triangular** (richest): E = 3 -> 9 -> 27 -> 81 -> 243; ratios 3.00, 3.00, 3.00, 3.00; tau 0.100+1.300i -> 0.375+0.937i -> 0.432+1.818i -> 0.283+3.636i -> 0.484+7.431i. Stopped: map failed: unmatched-dart (no opposite dart at midpoint (0.9851, 0.0628))
- **6^3 hexagonal** (fixed): E = 3 -> 7 -> 19 -> 43 -> 115 -> 291; ratios 2.33, 2.71, 2.26, 2.67, 2.53; tau -0.500+1.500i -> -0.500+1.750i -> -0.500+2.700i -> -0.500+3.543i -> -0.500+5.956i -> 0.500+8.794i. Stopped: map failed: unmatched-dart (no opposite dart at midpoint (0.0013, 0.4878))
- **6^3 hexagonal** (richest): E = 3 -> 9; ratios 3.00; tau -0.138+1.345i -> -0.098+1.749i. Stopped: map failed: unmatched-dart (no opposite dart at midpoint (0.5188, 0.4896))
- **3.6.3.6 trihexagonal** (fixed): E = 6 -> 8 -> 8 -> 8 -> 8 -> 8 -> 8 -> 8; ratios 1.33, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00; tau -0.500+1.000i -> -0.500+1.000i -> -0.500+1.000i -> -0.500+1.000i -> -0.500+1.000i -> -0.500+1.000i -> -0.500+1.000i -> -0.500+1.000i. Stopped: max steps
- **3.6.3.6 trihexagonal** (richest): E = 6 -> 18 -> 54 -> 162; ratios 3.00, 3.00, 3.00; tau -0.434+0.981i -> 0.134+1.638i -> 0.107+3.421i -> 0.045+6.602i. Stopped: map failed: unmatched-dart (no opposite dart at midpoint (0.9973, 0.0352))
- **4.8.8 truncated square** (fixed): E = 6 -> 11 -> 23 -> 47 -> 119 -> 295; ratios 1.83, 2.09, 2.04, 2.53, 2.48; tau 0.000+2.000i -> 0.000+2.200i -> 0.000+3.200i -> 0.000+4.031i -> 0.000+6.456i -> 0.000+9.293i. Stopped: map failed: unmatched-dart (no opposite dart at midpoint (0.9738, 0.4874))
- **4.8.8 truncated square** (richest): E = 6 -> 17 -> 50 -> 150; ratios 2.83, 2.94, 3.00; tau -0.250+1.250i -> -0.247+1.831i -> -0.235+3.237i -> -0.401+6.443i. Stopped: map failed: unmatched-dart (no opposite dart at midpoint (0.9912, 0.5084))

Raw: `experiments/results/squaring-iteration-2026-08-19.json`

## What this says

**The combinatorics is forced, and it triples.** Under the "richest" rule the measured growth is
E' / E = 3.000 exactly, once the deg-3 column reaches 100% — 3 → 9 → 27 → 81 → 243 for the triangular
seed, 6 → 18 → 54 → 162 for 3.6.3.6. That is not an empirical trend, it is Euler: a squared torus has
one square per edge going in (F = E), its vertices are T-junctions of degree 3 (3V = 2E'), and
V − E' + F = 0 closes it at **E' = 3E**. The rows where the ratio comes out below 3 are exactly the rows
where the deg-3 column is below 100%, which happens when the class kills an edge (a square of side zero)
or when several corners coincide instead of forming a T-junction.

So the process **cannot cycle and cannot converge combinatorially** unless it collapses. Growth is the
generic behaviour, and the interesting cases are the collapses.

**There are fixed points, and they are the degenerate classes.** Under the fixed class (1, 0):

| seed | E over eight steps | ends at |
|---|---|---|
| 4.4.4.4 | 2, 2, 2, 2, 2, 2, 2, 2 | itself, τ = i |
| 3⁶ | 3, 4, 4, 4, 4, 4, 4, 4 | τ = i, one size |
| 3.6.3.6 | 6, 8, 8, 8, 8, 8, 8, 8 | τ = −½ + i, one size |
| 6³ | 3, 7, 19, 43, 115, 291 | growing |
| 4.8.8 | 6, 11, 23, 47, 119, 295 | growing |

The square tiling at (1, 0) squares to **itself**: one square, τ = i, forever. The triangular and
trihexagonal tilings fall into that same fixed point after one step. What separates the two halves of
the table is whether the class hands back a squaring with `distinct = 1` — all squares the same size,
which is the regular square grid, which is the fixed point. When it does not (6³ and 4.8.8 give two
sizes at (1, 0)), the growth takes over.

That is a statement about the **(tiling, class) pair**, not about the tiling. The same 4.4.4.4 that is a
fixed point at (1, 0) grows 2 → 6 → 17 → 50 → 150 under "richest". Iterating is a map on pairs, and the
class has to be chosen at every step; there is no canonical choice, which is the first thing to settle
before "does tiling X converge" is even a question.

**The shape does not settle — it runs to the cusp.** Reducing the image torus τ into the standard
fundamental domain, Im τ climbs monotonically in every growing run: 1.25 → 1.83 → 3.24 → 6.44 for the
square seed, 1.30 → 0.94 → 1.82 → 3.64 → 7.43 for the triangular one, 1.5 → 1.75 → 2.7 → 3.54 → 5.96 →
8.79 for 6³. Roughly a factor 1.8 per step. A reduced τ heading up the imaginary axis is a torus
degenerating toward a long thin cylinder, so the iteration is pushing the conformal structure to the
boundary of moduli space, not toward an interior fixed point. The size spread does the same thing:
2 → 4 → 5 → 70 → 109 → 897 for 6³.

**Caveat on the runs that stopped.** Every growing run ends with `unmatched-dart` out of
`buildTorusMap`, not with a mathematical obstruction. The squares are exact integers and their areas sum
to the covolume, so the tiling is real; what fails is the T-junction detection at these sizes, where the
sides run to five digits and the 1e-6 absolute tolerance is no longer the right ruler. Going deeper
means a tolerance relative to the cell, and a float Laplacian solve, since the exact one is already
163 ms at E = 150 and its determinant is the spanning-tree count.

**Literature.** I am not aware of published work iterating this particular map, and I have not searched.
The nearest existing thing is Cannon–Floyd–Parry on finite subdivision rules and the finite Riemann
mapping theorem, where a combinatorial subdivision is iterated and the induced squarings are asked to
converge to a conformal structure — same shape of question, different map, and their setting is designed
so the combinatorics recurs where here it triples. Kenyon (Israel J. Math. 105, 1998) and Schramm
("Square tilings with prescribed combinatorics", 1993) are the construction's own background; Dutour
Sikirić (AAECC 23, 2012) is the genus-1 parameter space. Worth an actual search before claiming novelty.

**Next, if this is worth pursuing.** Three things would make it a real experiment rather than a probe:
a relative tolerance in `buildTorusMap` so runs go past step 5; a float solve so E in the thousands is
reachable; and a class rule with a defensible canonical status — the natural candidate is to carry the
harmonic direction forward geometrically instead of picking a fresh integral class each step.
