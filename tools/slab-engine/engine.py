#!/usr/bin/env python3
"""D1 slab/inventory transfer-graph engine — increment 1a (reachable closure).

See experiments/d1-slab-engine-workorder-2026-07-10.md for the spec and the soundness
ledger (S1-S4). Exact arithmetic only: scalars are integer pairs (a, b) = a + b*sqrt3,
coordinates stored DOUBLED (actual value /2), signs via a^2 vs 3b^2.

Model: a width-w tube is an edge-to-edge tiling of the cylinder R^2/wZ (unrotated frame:
shortest period along an edge direction). State = the FRONT, a cyclic word of unit-edge
directions (12-grid) with net displacement (w, 0), quotiented by translation (only the
word is kept) and rotation (canonical = lexicographically minimal rotation). Transition =
place one tile at the canonical lowest front vertex, attached on the outgoing edge with
its corner at the vertex (complete: the gap-side fan's first tile shares that full edge).
Vertically periodic tubes = cycles; the recurrent tile inventory = labels on SCC-internal
transitions.

Increment 1a is REACHABLE closure from the flat front — sound for cataloguing, NOT yet
the completeness direction (increment 1b enumerates all valid fronts <= L_MAX).
"""
import sys, time
from collections import deque

L_MAX = 20            # front-word length cap: LOGGED completeness knob (ledger S2)
STATE_CAP = 500_000

# ---------- exact scalars: (a, b) = a + b*sqrt3 ----------
def sgn(a, b):
    if a == 0 and b == 0: return 0
    if a >= 0 and b >= 0: return 1
    if a <= 0 and b <= 0: return -1
    d = a * a - 3 * b * b          # sign of |a| vs |b*sqrt3|
    if a > 0:                      # b < 0
        return 1 if d > 0 else -1
    return -1 if d > 0 else 1      # a < 0, b > 0

def padd(p, q): return (p[0] + q[0], p[1] + q[1])
def psub(p, q): return (p[0] - q[0], p[1] - q[1])
def pmul(p, q): return (p[0] * q[0] + 3 * p[1] * q[1], p[0] * q[1] + p[1] * q[0])

# unit directions, DOUBLED: DIRS[j] = (2cos30j, 2sin30j) as pairs
DIRS = [((2, 0), (0, 0)), ((0, 1), (1, 0)), ((1, 0), (0, 1)), ((0, 0), (2, 0)),
        ((-1, 0), (0, 1)), ((0, -1), (1, 0)), ((-2, 0), (0, 0)), ((0, -1), (-1, 0)),
        ((-1, 0), (0, -1)), ((0, 0), (-2, 0)), ((1, 0), (0, -1)), ((0, 1), (-1, 0))]

def vadd(P, d): return (padd(P[0], DIRS[d][0]), padd(P[1], DIRS[d][1]))

def turn(u, v):
    """signed turn from in-dir u to out-dir v, in (-6, 6]; interior(right) = 180+30t."""
    t = (v - u) % 12
    return t - 12 if t > 6 else t

# ---------- exact segment predicates (ledger S4) ----------
def orient(P, Q, R):
    ux, uy = psub(Q[0], P[0]), psub(Q[1], P[1])
    vx, vy = psub(R[0], P[0]), psub(R[1], P[1])
    c = psub(pmul(ux, vy), pmul(uy, vx))
    return sgn(*c)

def _between_strict(A, B, P):
    """P strictly interior to collinear segment AB (1D, dominant axis)."""
    for k in (0, 1):
        d = psub(B[k], A[k])
        s = sgn(*d)
        if s != 0:
            s1 = sgn(*psub(P[k], A[k]))
            s2 = sgn(*psub(B[k], P[k]))
            return s1 == s and s2 == s
    return False

def seg_bad(A, B, C, D, allow_identical=False):
    """True iff segments AB, CD interact illegally: proper crossing, positive-length
    collinear overlap, or T-vertex (endpoint strictly inside the other segment).
    Endpoint==endpoint coincidence is ALLOWED (seam pinches). Exact coincidence of the
    two segments is edge-to-edge GLUING when allow_identical (tile-vs-front check: the
    surgery cancels the pair), illegal otherwise (front self-check)."""
    o1, o2 = orient(A, B, C), orient(A, B, D)
    o3, o4 = orient(C, D, A), orient(C, D, B)
    if o1 * o2 < 0 and o3 * o4 < 0:
        return True
    if o1 == 0 and o2 == 0:        # collinear: overlap of positive length?
        if A in (C, D) and B in (C, D):     # identical/reversed segment
            return not allow_identical
        return (_between_strict(A, B, C) or _between_strict(A, B, D)
                or _between_strict(C, D, A) or _between_strict(C, D, B))
    if o1 == 0 and _between_strict(A, B, C): return True
    if o2 == 0 and _between_strict(A, B, D): return True
    if o3 == 0 and _between_strict(C, D, A): return True
    if o4 == 0 and _between_strict(C, D, B): return True
    return False

def shift_x(P, k, w2):
    return ((P[0][0] + k * w2, P[0][1]), P[1])

# ---------- fronts ----------
def canon(ds):
    L = len(ds)
    return min(tuple(ds[i:] + ds[:i]) for i in range(L))

def embed(ds):
    V = [((0, 0), (0, 0))]
    for d in ds:
        V.append(vadd(V[-1], d))
    return V

def front_ok(ds, w2, check_net=True):
    """turns legal, net displacement (w,0), simple on the cylinder (touch allowed)."""
    L = len(ds)
    for i in range(L):
        t = turn(ds[i - 1], ds[i])
        if t == 6 or t == -6:  return False, 'reversal'
        if t < -4:             return False, 'interior<60'
    V = embed(list(ds))
    if check_net and (V[-1][0] != (w2, 0) or V[-1][1] != (0, 0)):
        return False, 'net'
    segs = [(V[i], V[i + 1]) for i in range(L)]
    for i in range(L):
        for j in range(i + 1, L):
            adjacent = (j == i + 1) or (i == 0 and j == L - 1)
            if adjacent:
                continue
            for k in (-1, 0, 1):
                C = shift_x(segs[j][0], k, w2)
                D = shift_x(segs[j][1], k, w2)
                if seg_bad(segs[i][0], segs[i][1], C, D):
                    return False, f'cross({i},{j},{k})'
    return True, ''

def lowest_vertex(ds, V):
    """index of the sweep vertex: min y, then min x (exact)."""
    best = 0
    for i in range(1, len(ds)):
        dy = psub(V[i][1], V[best][1])
        s = sgn(*dy)
        if s < 0 or (s == 0 and sgn(*psub(V[i][0], V[best][0])) < 0):
            best = i
    return best

# ---------- tile placement ----------
CORNER = {3: 60, 4: 90, 6: 120, 12: 150}

def place(ds, n, w2, log):
    """Attach an n-gon at the lowest vertex on its outgoing edge. Returns
    (new canonical word, label) or (None, reason)."""
    ds = list(ds)
    L = len(ds)
    V = embed(ds)
    i = lowest_vertex(ds, V)
    gap = 180 - 30 * turn(ds[i - 1], ds[i])
    if CORNER[n] > gap:
        return None, 'angle'
    d0 = ds[i]
    step = 12 // n
    tdirs = [(d0 + m * step) % 12 for m in range(n)]
    T = [V[i]]
    for d in tdirs:
        T.append(vadd(T[-1], d))
    assert T[-1] == T[0], 'tile does not close'
    tsegs = [(T[m], T[m + 1]) for m in range(n)]
    # (a) tile self-embedding on the cylinder
    for a in range(n):
        for b in range(a + 1, n):
            if b == a + 1 or (a == 0 and b == n - 1):
                continue
            for k in (-1, 0, 1):
                if seg_bad(tsegs[a][0], tsegs[a][1],
                           shift_x(tsegs[b][0], k, w2), shift_x(tsegs[b][1], k, w2)):
                    return None, 'self-overlap'
    # (b) tile edges vs front edges (base edge m=0 coincides with front edge i)
    fsegs = [(V[m], V[m + 1]) for m in range(L)]
    for m in range(1, n):
        for f in range(L):
            if f == i:
                continue
            for k in (-1, 0, 1):
                if seg_bad(tsegs[m][0], tsegs[m][1],
                           shift_x(fsegs[f][0], k, w2), shift_x(fsegs[f][1], k, w2),
                           allow_identical=True):
                    return None, 'front-overlap'
    # (c) no front vertex strictly inside the (convex, ccw) tile
    for f in range(L):
        for k in (-1, 0, 1):
            P = shift_x(V[f], k, w2)
            if all(orient(T[m], T[m + 1], P) > 0 for m in range(n)):
                return None, 'vertex-inside'
    # surgery: replace edge i by the reversed exposed walk
    exposed = [(tdirs[m] + 6) % 12 for m in range(n - 1, 0, -1)]
    nw = ds[:i] + exposed + ds[i + 1:]
    # cyclic cancellation of reversed adjacent pairs
    changed = True
    while changed and nw:
        changed = False
        M = len(nw)
        for a in range(M):
            b = (a + 1) % M
            if nw[b] == (nw[a] + 6) % 12:
                for idx in sorted((a, b), reverse=True):
                    nw.pop(idx)
                changed = True
                break
    if not nw:
        return None, 'closed-up'
    if len(nw) > L_MAX:
        log(f'!! L_MAX EXCEEDED (len {len(nw)}) — completeness knob hit; word={nw}')
        return None, 'lmax'
    ok, why = front_ok(nw, w2)
    if not ok:
        if why.startswith('interior'):
            raise AssertionError(f'geometry bug: {why} after placement {n}@{d0} on {ds}')
        return None, 'dead:' + why
    return canon(nw), (n, d0)

# ---------- closure + SCC ----------
def closure(seed, w2, log):
    seen = {seed}
    order = [seed]
    edges = {}
    dq = deque([seed])
    t0 = time.time()
    while dq:
        s = dq.popleft()
        outs = []
        for n in (3, 4, 6, 12):
            r, lab = place(s, n, w2, log)
            if r is not None:
                outs.append((lab, r))
                if r not in seen:
                    seen.add(r)
                    order.append(r)
                    dq.append(r)
                    if len(seen) % 200 == 0:
                        log(f'  ... {len(seen)} states, {time.time()-t0:.1f}s')
                    if len(seen) > STATE_CAP:
                        log('!! STATE_CAP hit'); return seen, edges, False
        edges[s] = outs
    return seen, edges, True

def tarjan(nodes, edges):
    idx, low, on, st, comp = {}, {}, set(), [], {}
    counter = [0]; ncomp = [0]
    for root in nodes:
        if root in idx:
            continue
        work = [(root, 0)]
        while work:
            v, pi = work[-1]
            if pi == 0:
                idx[v] = low[v] = counter[0]; counter[0] += 1
                st.append(v); on.add(v)
            recurse = False
            succs = [t for _, t in edges.get(v, [])]
            for j in range(pi, len(succs)):
                wv = succs[j]
                if wv not in idx:
                    work[-1] = (v, j + 1)
                    work.append((wv, 0))
                    recurse = True
                    break
                elif wv in on:
                    low[v] = min(low[v], idx[wv])
            if recurse:
                continue
            if low[v] == idx[v]:
                while True:
                    u = st.pop(); on.discard(u)
                    comp[u] = ncomp[0]
                    if u == v:
                        break
                ncomp[0] += 1
            work.pop()
            if work:
                p = work[-1][0]
                low[p] = min(low[p], low[v])
    return comp

# ---------- self-tests ----------
def selftest():
    w2 = 4
    log = lambda m: None
    flat = canon([0, 0])
    r, lab = place(flat, 4, w2, log)
    assert r == canon([3, 0, 9, 0]), r
    r2, _ = place(r, 4, w2, log)
    assert r2 == canon([0, 0]), r2          # seam cancellation closes the S slab
    r3, _ = place(flat, 3, w2, log)
    assert r3 == canon([2, 10, 0]), r3
    r6, _ = place(flat, 6, w2, log)
    assert r6 == canon([4, 2, 0, 10, 8, 0]), r6   # seam hexagon front
    r12, why = place(flat, 12, w2, log)
    assert r12 is None and why == 'self-overlap', (r12, why)  # 12-gon can't embed at w=2
    print('selftest OK')

# ---------- main ----------
def main():
    if '--selftest' in sys.argv:
        selftest(); return
    w2 = 4  # width 2, doubled
    logpath = ('/Users/alessandro/Desktop/University/Thesis/TilingAtlas/experiments/'
               'results/d1-slab-engine-width2-2026-07-10.log')
    lf = open(logpath, 'a')
    def log(m):
        print(m); lf.write(m + '\n'); lf.flush()
    log(f'=== D1 increment 1a: width-2 reachable closure ({time.strftime("%F %T")}) ===')
    log(f'L_MAX={L_MAX} (logged knob), seed=flat front [0,0]')
    seed = canon([0, 0])
    seen, edges, complete = closure(seed, w2, log)
    ne = sum(len(v) for v in edges.values())
    log(f'closure {"complete" if complete else "CAPPED"}: {len(seen)} states, {ne} transitions')
    comp = tarjan(list(seen), edges)
    # recurrent transitions: inside an SCC that carries a cycle
    insize = {}
    for s, outs in edges.items():
        for _, t in outs:
            if comp[s] == comp[t]:
                insize[comp[s]] = insize.get(comp[s], 0) + 1
    rec_labels = {}
    for s, outs in edges.items():
        for lab, t in outs:
            if comp[s] == comp[t] and insize.get(comp[s], 0) >= 1:
                rec_labels.setdefault(lab, 0)
                rec_labels[lab] += 1
    log(f'SCCs: {len(set(comp.values()))}, recurrent SCCs: {len(insize)}')
    log('recurrent tile inventory (n, attach-dir d0) -> transition count:')
    CLASSNAME = {3: {0: 'upright(0,4,8)', 1: 'SIDEWAYS(1,5,9)', 2: 'upright(2,6,10)', 3: 'SIDEWAYS(3,7,11)'},
                 4: {0: 'axis', 1: 'TILTED', 2: 'TILTED'},
                 6: {0: 'seam-hexagon(even)', 1: 'VERTICAL-DIAG(odd)'},
                 12: {0: 'twelve-gon?!'}}
    classes = {}
    for (n, d0), c in sorted(rec_labels.items()):
        cls = CLASSNAME[n][d0 % (4 if n == 3 else 3 if n == 4 else 2 if n == 6 else 1)]
        classes.setdefault((n, cls), 0)
        classes[(n, cls)] += c
        log(f'  n={n:2d} d0={d0:2d}  [{cls}]  x{c}')
    log('recurrent classes summary:')
    for (n, cls), c in sorted(classes.items()):
        log(f'  n={n:2d} {cls}: {c}')
    suspects = [k for k in classes if 'SIDEWAYS' in k[1] or 'TILTED' in k[1]
                or 'VERTICAL' in k[1] or '12' in str(k[0])]
    log(f'3.1(d)-suspect classes recurrent on the REACHABLE component: {suspects or "NONE"}')
    log('NOTE: reachable-only (increment 1a). The completeness direction (all fronts '
        '<= L_MAX) is increment 1b; only then does NONE become the 3.1(d) theorem.')
    lf.close()

if __name__ == '__main__':
    main()
