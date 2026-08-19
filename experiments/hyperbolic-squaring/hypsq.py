"""Square the hyperbolic ball: source at the centre, boundary wired to one sink.

The result is a tiling of a CYLINDER, not a rectangle. psi (the horizontal coordinate)
is a potential on FACES defined by psi(right) - psi(left) = current, and it is
single-valued only away from the source: a dual loop encircling the centre picks up the
TOTAL current I. So the horizontal coordinate lives in R/IZ. Benjamini-Schramm 1996.
"""
from fractions import Fraction as Fr
import sys, math
sys.path.insert(0, '/private/tmp/claude-501/-Users-alessandro-Desktop-University-Thesis-TilingAtlas/2b978b72-5c1e-4916-be6d-3bd84140e882/scratchpad')
from hyp import ball

def orient(faces):
    """Flip face rings until every directed edge is used exactly once (dual BFS)."""
    faces = [list(f) for f in faces]
    dart = {}
    for fi, f in enumerate(faces):
        for i in range(len(f)):
            dart.setdefault((f[i], f[(i+1) % len(f)]), []).append(fi)
    adj = {}
    for fi, f in enumerate(faces):
        for i in range(len(f)):
            a, b = f[i], f[(i+1) % len(f)]
            for fj in dart.get((b, a), []) + dart.get((a, b), []):
                if fj != fi: adj.setdefault(fi, set()).add(fj)
    seen = {0: True}; flip = {0: False}; stack = [0]
    while stack:
        fi = stack.pop()
        f = faces[fi] if not flip[fi] else faces[fi][::-1]
        for i in range(len(f)):
            a, b = f[i], f[(i+1) % len(f)]
            for fj in range(len(faces)):
                if fj == fi: continue
                g = faces[fj]
                if a in g and b in g:
                    j = g.index(a)
                    same = g[(j+1) % len(g)] == b
                    want = not same  # neighbour must traverse b->a
                    if fj in seen:
                        continue
                    seen[fj] = True; flip[fj] = (flip[fi] != want) if False else (not want if not flip[fi] else want)
                    stack.append(fj)
    return [f[::-1] if flip.get(i, False) else f for i, f in enumerate(faces)]

def orient_bfs(faces):
    """Simpler, correct: BFS across shared edges, requiring opposite traversal."""
    faces = [list(f) for f in faces]
    # map undirected edge -> [face indices]
    inc = {}
    for fi, f in enumerate(faces):
        for i in range(len(f)):
            a, b = f[i], f[(i+1) % len(f)]
            inc.setdefault((min(a,b), max(a,b)), []).append(fi)
    flipped = [None]*len(faces); flipped[0] = False
    from collections import deque
    dq = deque([0])
    def ring(fi):
        return faces[fi][::-1] if flipped[fi] else faces[fi]
    while dq:
        fi = dq.popleft(); f = ring(fi)
        for i in range(len(f)):
            a, b = f[i], f[(i+1) % len(f)]
            for fj in inc[(min(a,b), max(a,b))]:
                if fj == fi or flipped[fj] is not None: continue
                g = faces[fj]; j = g.index(a)
                forward = g[(j+1) % len(g)] == b   # same direction -> must flip
                flipped[fj] = forward
                dq.append(fj)
    return [faces[i][::-1] if flipped[i] else faces[i] for i in range(len(faces))]

def solve_potential(nv, faces, source, sink, exact):
    adj = {}
    for f in faces:
        for i in range(len(f)):
            a, b = f[i], f[(i+1) % len(f)]
            adj.setdefault(a, set()).add(b); adj.setdefault(b, set()).add(a)
    free = [v for v in range(nv) if v != source and v != sink]
    idx = {v: i for i, v in enumerate(free)}
    n = len(free)
    if exact:
        A = [[Fr(0)]*n for _ in range(n)]; b = [Fr(0)]*n
        HI = Fr(1)
        for v in free:
            i = idx[v]
            A[i][i] = Fr(len(adj[v]))
            for w in adj[v]:
                if w == source: b[i] += HI
                elif w == sink: pass
                else: A[i][idx[w]] -= 1
        # gaussian elimination
        for c in range(n):
            p = next(k for k in range(c, n) if A[k][c] != 0)
            A[c], A[p] = A[p], A[c]; b[c], b[p] = b[p], b[c]
            inv = Fr(1)/A[c][c]
            A[c] = [x*inv for x in A[c]]; b[c] *= inv
            for k in range(n):
                if k != c and A[k][c] != 0:
                    fct = A[k][c]
                    A[k] = [x - fct*y for x, y in zip(A[k], A[c])]
                    b[k] -= fct*b[c]
        V = {source: HI, sink: Fr(0)}
        for v in free: V[v] = b[idx[v]]
        return V, adj
    else:
        import numpy as np
        A = np.zeros((n, n)); bb = np.zeros(n)
        for v in free:
            i = idx[v]; A[i, i] = len(adj[v])
            for w in adj[v]:
                if w == source: bb[i] += 1.0
                elif w == sink: pass
                else: A[i, idx[w]] -= 1.0
        x = np.linalg.solve(A, bb)
        V = {source: 1.0, sink: 0.0}
        for v in free: V[v] = float(x[idx[v]])
        return V, adj

def square(nv, faces, source, sink, exact=True):
    faces = orient_bfs(faces)
    V, adj = solve_potential(nv, faces, source, sink, exact)
    I = sum(V[source] - V[w] for w in adj[source])
    H = V[source] - V[sink]
    # psi on faces by dual BFS; darts of an oriented face have the face on their LEFT
    left = {}
    for fi, f in enumerate(faces):
        for i in range(len(f)):
            left[(f[i], f[(i+1) % len(f)])] = fi
    from collections import deque
    psi = {0: (Fr(0) if exact else 0.0)}
    dq = deque([0]); disc = []
    while dq:
        fi = dq.popleft()
        f = faces[fi]
        for i in range(len(f)):
            a, b = f[i], f[(i+1) % len(f)]
            fj = left[(b, a)]
            jump = V[a] - V[b]          # current flowing a -> b
            val = psi[fi] + jump
            if fj in psi: disc.append(val - psi[fj])
            else:
                psi[fj] = val; dq.append(fj)
    return V, psi, faces, I, H, disc, adj

if __name__ == "__main__":
    for r in (1, 2, 3):
        nv, faces, sink, bnd = ball(7, r)
        V, psi, of, I, H, disc, adj = square(nv, faces, 0, sink, exact=True)
        energy = Fr(0)
        seen = set()
        for f in of:
            for i in range(len(f)):
                a, b = f[i], f[(i+1) % len(f)]
                k = (min(a,b), max(a,b))
                if k in seen: continue
                seen.add(k)
                energy += (V[a]-V[b])**2
        wraps = sorted({(d/I) for d in disc}) if I else []
        allint = all((d/I).denominator == 1 for d in disc) if I else False
        print(f"r={r}: I={I}  H={H}  Sigma i^2 = {energy}  I*H = {I*H}  "
              f"{'MATCH' if energy == I*H else 'MISMATCH'}")
        print(f"      dual-loop discrepancies: {len(disc)} checked, all multiples of I: {allint}, "
              f"values/I = {sorted(set(int(d/I) for d in disc)) if allint else 'n/a'}")
