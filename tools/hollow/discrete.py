"""Discreteness gate.

The vertex set of a uniform tiling is a single orbit under a crystallographic group,
so it is a discrete point set with a positive minimum separation. Z[zeta_24] is dense
in C, so nothing in the arithmetic enforces this: a wrong branch of the growth can
produce vertices that accumulate. Measured separations are sharply bimodal, e.g.

    4.8/3.8/7    min separation 0.41421 (= sqrt(2)-1)   109 vertices within r<3
    4.6/5.12/5   min separation 0.01924                 729 vertices within r<3

so a patch whose vertices crowd far below the unit edge length is not a tiling.
This is a discreteness test, not a Euclidean completeness cutoff.
"""
import itertools
from hollow import zfloat, zabs

MIN_SEP = 0.05          # far below any genuine separation seen, well above the noise


def min_separation(P, rmax=2.5, cap=1500):
    pts = [zfloat(v) for v in P.vfac if zabs(v) <= rmax]
    if len(pts) < 2: return None
    if len(pts) > cap: pts = pts[:cap]
    best = None
    for a, b in itertools.combinations(pts, 2):
        d = abs(a-b)
        if best is None or d < best: best = d
    return best


def discrete(P, rmax=2.5):
    s = min_separation(P, rmax)
    return (s is None or s >= MIN_SEP), s
