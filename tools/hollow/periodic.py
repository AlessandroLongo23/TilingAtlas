"""Periodicity certificate for a grown patch.

Corona growth is only ever a NECESSARY condition: a patch that reaches depth K
proves nothing about depth K+1. What does prove the tiling extends to the whole
plane is a translation lattice. If two independent translations carry the fully
completed core of the patch onto itself, the tiling is periodic and the core's
fundamental domain generates it everywhere.

A translation preserves edge directions, so a candidate translation is any vertex
whose star is literally equal (same angles, same absolute directions, same tiles)
to the seed's star.
"""
import cmath
from hollow import ZERO, zadd, zsub, zfloat, face_key


def star(P, v):
    return frozenset((a, dr, nd) for (a, dr, nd, k) in P.vfac.get(v, ()))


def translate_face(P, key, tau):
    n, d, cs = P.faces[key]
    v0, e0 = cs[0]
    return face_key(zadd(v0, tau), e0, n, d)


def core_faces(P, depths, kmax):
    """Faces all of whose corners sit strictly inside the completed region."""
    out = []
    for key, (n, d, cs) in P.faces.items():
        if all(depths.get(p, 10**9) <= kmax for (p, dr) in cs):
            out.append(key)
    return out


def candidate_translations(P, depths, kmax):
    s0 = star(P, ZERO)
    out = []
    for v, dv in depths.items():
        if v == ZERO or dv > kmax: continue
        if star(P, v) == s0: out.append(v)
    return out


def independent(t1, t2):
    a, b = zfloat(t1), zfloat(t2)
    return abs(a.real*b.imag - a.imag*b.real) > 1e-7


def certify(P, depths, m, core_depth=2, cand_depth=6):
    """Return (ok, basis): two independent translations under which every completed
    vertex of the core has an identical star. Checking STARS rather than whole faces
    avoids the patch-extent problem (a 12-gon's corners span many corona levels, so
    no face is ever fully contained in a shallow core)."""
    core = [v for v, dv in depths.items()
            if dv <= core_depth and len(P.vfac.get(v, ())) == m]
    if len(core) < 2: return False, None
    s0 = star(P, ZERO)
    good = []
    for tau, dv in depths.items():
        if tau == ZERO or dv > cand_depth: continue
        if star(P, tau) != s0: continue
        ok = True
        for v in core:
            w = zadd(v, tau)
            if len(P.vfac.get(w, ())) != m or star(P, w) != star(P, v):
                ok = False; break
        if ok: good.append(tau)
    for i in range(len(good)):
        for j in range(i+1, len(good)):
            if independent(good[i], good[j]):
                return True, (good[i], good[j])
    return False, None
