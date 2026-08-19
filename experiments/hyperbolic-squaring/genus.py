"""Higher genus: does the construction still have anything to say?

A closed hyperbolic surface is genus >= 2, so 'a hyperbolic tiling, quotiented' means a
map with chi < 0. The repo already ships 25 of them: the star polyhedra whose face rings
close up on a surface of genus 3, 4, 5 or 9 instead of a sphere.

Measured here: dim of the harmonic 1-forms, straight from the closed + co-closed
conditions, with no genus assumed anywhere. Hodge says it must be 2g = 2 - chi.
"""
from fractions import Fraction as Fr
import json, glob, os
REPO = '/Users/alessandro/Desktop/University/Thesis/TilingAtlas'

def nullity(rows, n):
    M = [r[:] for r in rows]; piv = 0
    for c in range(n):
        p = next((i for i in range(piv, len(M)) if M[i][c] != 0), None)
        if p is None: continue
        M[piv], M[p] = M[p], M[piv]
        inv = Fr(1)/M[piv][c]; M[piv] = [x*inv for x in M[piv]]
        for i in range(len(M)):
            if i != piv and M[i][c] != 0:
                f = M[i][c]; M[i] = [a - f*b for a, b in zip(M[i], M[piv])]
        piv += 1
        if piv == len(M): break
    return n - piv

rows_out = []
for p in sorted(glob.glob(f'{REPO}/public/spherical-star/*.json')):
    d = json.load(open(p))
    V, faces = len(d['vertices']), d['faces']
    eidx = {}
    for e in d['edges']:
        eidx[(min(e), max(e))] = len(eidx)
    E = len(eidx)
    F = len(faces)
    chi = V - E + F
    if chi >= 2: continue
    # is it a valid map? every edge must appear in exactly two face rings
    cnt = {}
    ok = True
    for f in faces:
        for i in range(len(f)):
            a, b = f[i], f[(i+1) % len(f)]
            k = (min(a,b), max(a,b))
            if k not in eidx: ok = False; break
            cnt[k] = cnt.get(k, 0) + 1
    if not ok or any(c != 2 for c in cnt.values()) or len(cnt) != E:
        rows_out.append((d['id'], V, E, F, chi, None, 'not a map: edge multiplicities'))
        continue
    # closed: signed sum round every face; co-closed: net flow out of every vertex
    rows = []
    for f in faces:
        r = [Fr(0)]*E
        for i in range(len(f)):
            a, b = f[i], f[(i+1) % len(f)]
            k = (min(a,b), max(a,b))
            r[eidx[k]] += 1 if a < b else -1
        rows.append(r)
    for v in range(V):
        r = [Fr(0)]*E
        for (a, b), i in eidx.items():
            if a == v: r[i] += 1
            if b == v: r[i] -= 1
        rows.append(r)
    dim = nullity(rows, E)
    g = (2 - chi)//2
    rows_out.append((d['id'], V, E, F, chi, dim, 'OK' if dim == 2 - chi else f'EXPECTED {2-chi}'))

print(f"{'record':<22}{'V':>4}{'E':>5}{'F':>5}{'chi':>5}{'genus':>7}{'dim H^1':>9}  verdict")
print('-'*78)
agree = 0
for id_, V, E, F, chi, dim, note in rows_out:
    g = (2-chi)//2
    print(f"{id_:<22}{V:>4}{E:>5}{F:>5}{chi:>5}{g:>7}{str(dim):>9}  {note}")
    if dim is not None and dim == 2 - chi: agree += 1
print(f"\n{agree}/{len(rows_out)} higher-genus maps have dim H^1 = 2g exactly")
