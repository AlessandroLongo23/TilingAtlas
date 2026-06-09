"""
mixed_sign.py -- Task 2: the MIXED-SIGN GHOST.

Find (or prove impossible) an AXIOM-VALID, regular-labeled symbol with GLOBAL
K==0 but at least one {1,2}-component (vertex orbit) whose curvature sub-sum != 0
(=> one vertex orbit angle<360 [spherical], another >360 [hyperbolic], cancelling).

This proves global-K=0 is INSUFFICIENT: per_component_flat is strictly stronger.

We scan the smallest sizes where such a ghost can exist: it needs >=2 vertex
orbits (k>=2), so size >=2. We use enumerate3's `mixed_sign` set (= euclidean
minus per_component_flat), find the smallest, and DISSECT it: show the per-orbit
sub-sums are +x and -x.
"""
import sys
sys.path.insert(0, "/tmp/dd-experiments")
from fractions import Fraction
from dsymbol import (
    DSymbol, from_canonical, validate, curvature,
    curvature_by_vertex_component, vertex_orbits, is_euclidean,
    per_component_flat, k_uniformity,
)
import enumerate3 as E3


def _angle_sum_of_component(sym, orbit):
    """Reconstruct the vertex 'angle defect': sub_K = sum_c (1/m01+1/m12-1/2).
    For a vertex orbit, sub_K==0 <=> sum of surrounding interior angles ==360.
    Return (sub_K, approx_total_angle_deg). The angle total = 360 + (defect),
    where defect>0 means angle<360 (spherical), defect<0 angle>360 (hyperbolic).
    Actually sub_K>0 => angles sum <360 (spherical); sub_K<0 => >360 (hyperbolic).
    We compute the actual interior-angle sum from the tile labels around the
    vertex orbit for a human-readable check."""
    sub = sum((Fraction(1, sym.m01[c]) + Fraction(1, sym.m12[c]) - Fraction(1, 2)
               for c in orbit), Fraction(0))
    return sub


def find_smallest_mixed_sign(max_n=10):
    for n in range(2, max_n + 1):
        r = E3.scout_size(n, collect=True)
        ms = r["mixed_sign"]
        if ms:
            return n, sorted(ms)
    return None, []


if __name__ == "__main__":
    n, ghosts = find_smallest_mixed_sign(8)
    if not ghosts:
        print("NO mixed-sign ghost found up to the scanned size.")
        sys.exit(0)
    print("Smallest mixed-sign ghosts appear at size %d : count=%d" % (n, len(ghosts)))
    # dissect the lexicographically-smallest one
    cf = ghosts[0]
    sym = from_canonical(cf)
    ok, reason = validate(sym)
    K = curvature(sym)
    print()
    print("WITNESS canonical form:")
    print("  ", cf)
    print("  validate:", ok, repr(reason))
    print("  global K =", K, "(is_euclidean=%s)" % is_euclidean(sym))
    print("  per_component_flat =", per_component_flat(sym))
    print("  k (vertex orbits) =", k_uniformity(sym))
    print("  m01 per chamber:", [sym.m01[c] for c in range(sym.n)])
    print("  m12 per chamber:", [sym.m12[c] for c in range(sym.n)])
    print()
    print("  per-{1,2}-component (vertex-orbit) curvature sub-sums:")
    tot = Fraction(0)
    for orbit, subK in curvature_by_vertex_component(sym):
        tot += subK
        # label profile of this orbit
        m01s = sorted(set(sym.m01[c] for c in orbit))
        m12s = sorted(set(sym.m12[c] for c in orbit))
        sign = ("FLAT" if subK == 0 else
                ("SPHERICAL (angle<360)" if subK > 0 else "HYPERBOLIC (angle>360)"))
        print("    orbit %s  subK=%s  m01~%s m12~%s  -> %s" %
              (sorted(orbit), subK, m01s, m12s, sign))
    print("  sum of sub-sums =", tot, "(== global K, must be 0)")
    print()
    # Save all ghosts at this size for the report
    with open("/tmp/dd-experiments/out_mixed_sign.txt", "w") as f:
        f.write("mixed-sign ghosts at size %d (count %d)\n" % (n, len(ghosts)))
        for g in ghosts:
            s = from_canonical(g)
            subs = [str(sk) for _o, sk in curvature_by_vertex_component(s)]
            f.write("%s  subsums=%s\n" % (str(g), subs))
    print("  (full list written to out_mixed_sign.txt)")
