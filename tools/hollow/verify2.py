"""Areal-density check with a coverage-safe sampling radius.

A point may be covered by a face whose corners are far away, so sampling a fixed
radius can read a region the patch has not finished covering and report a bogus
density spread. A face of this alphabet has circumradius at most that of the unit
dodecagon, 1/(2 sin(pi/12)) = 1.932, so every face covering p has a corner within
2*1.932 of p. Sampling is therefore restricted to radius R_incomplete - 3.87,
where R_incomplete is the distance to the nearest vertex that is still open.
"""
import math, cmath, random
from hollow import zfloat

MAXCIRC = 1.0/(2*math.sin(math.pi/12))     # 1.9319, unit-edge dodecagon
MARGIN = 2*MAXCIRC + 0.01


def winding(poly, p):
    w = 0.0
    for i in range(len(poly)):
        a = poly[i]-p; b = poly[(i+1) % len(poly)]-p
        if abs(a) < 1e-9 or abs(b) < 1e-9: return None
        d = cmath.phase(b/a)
        if abs(abs(d)-math.pi) < 1e-7: return None
        w += d
    return int(round(w/(2*math.pi)))


def safe_radius(P, m):
    """Largest radius whose covering faces are all guaranteed present."""
    rin = None
    for v, cs in P.vfac.items():
        if len(cs) != m:
            r = abs(zfloat(v))
            if rin is None or r < rin: rin = r
    if rin is None: rin = max((abs(zfloat(v)) for v in P.vfac), default=0.0)
    return rin - MARGIN


def density(P, m, nsamp=200, seed=9973):
    r = safe_radius(P, m)
    if r < 0.15: return None, r                       # patch too small to judge
    rng = random.Random(seed)
    polys = [[zfloat(pos) for (pos, dr) in cs] for (n, d, cs) in P.faces.values()]
    vals = {}; tried = 0; got = 0
    while got < nsamp and tried < nsamp*50:
        tried += 1
        rr = r*math.sqrt(rng.random()); th = rng.random()*2*math.pi
        p = complex(rr*math.cos(th), rr*math.sin(th))
        tot = 0; bad = False
        for poly in polys:
            wd = winding(poly, p)
            if wd is None: bad = True; break
            tot += wd
        if bad: continue
        vals[tot] = vals.get(tot, 0)+1; got += 1
    return vals, r
