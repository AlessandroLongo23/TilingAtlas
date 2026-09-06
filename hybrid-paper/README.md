# Exact algebraic structure of hyperbolic hybrid tilings — draft

    hybrid.tex / hybrid.pdf     the paper; build with `tectonic -X compile hybrid.tex`
    edge_identity_prover.py     the decision procedure; proves the systems of Table 1
    rexact.py                   derives the r-family edges by elimination
    newsys.py                   the 1.1555 and 1.2537 systems
    feedback.py                 checks for Marek's review points

Dependencies: `mpmath`, `sympy`.

The wider verification script `reproduce.py`, which re-checks the {5,4} lattice, the
106 vertex combinations and the completeness scans, is in the `tiling-54-lattice.zip`
bundle sent separately.

## Status of each claim

Everything stated as a Lemma, Theorem, Corollary or Proposition is proved.
Everything established by bounded search is stated in a "Computational observation"
environment, and there are only four of them: the rank-three independence of
(pi, a, t), the vanishing of q_k, the count of 106, and the rich/barren
classification of the r-family. Section 8 lists what is open.
