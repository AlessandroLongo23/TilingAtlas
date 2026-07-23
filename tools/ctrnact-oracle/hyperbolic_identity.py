#!/usr/bin/env python3
"""Tiling identity for the hyperbolic atlas, read off the DEVELOPED patch.

Why this exists: the vertex configuration is NOT an identifier in H². Euclidean intuition says the
vertex figure all but determines the tiling; hyperbolically several non-isomorphic tilings can share
one. export_hyperbolic_atlas.py used to key on the config string and silently kept one map per config,
so 4.4.4.6 shipped as a single entry when the engine had found two different tilings with that figure.

The identifier here is the combinatorial ball. The patch is a map: darts (v,i) with sigma = step to the
next corner around v's fan, alpha = cross the edge. `ball_code(v, r)` BFS-labels every dart based within
distance r of v, starting from each dart at v under both orientations, and keeps the lexicographic
minimum — so equal codes <=> isomorphic rooted r-balls, reflections merged (the project's mirror
convention). Two vertices in one symmetry orbit always have isomorphic balls, so

    #distinct r-ball codes  <=  #vertex orbits

which makes the code count a LOWER BOUND on k that needs no trust in the solver's own labelling. On the
42 k=1 entries of the 2026-07-20 atlas every patch yields exactly one code at every radius it supports
— the regression that says the traversal is root-independent and the developer is sound.

Only vertices whose r-ball lies strictly inside the patch are used as roots (`depths` measures distance
to the rim over the FULL adjacency, boundary vertices included, so the wave really does propagate
inward). A patch that cannot support radius r reports None there rather than a truncated answer.
"""
from collections import defaultdict, deque


def build_fans(patch):
    """fans[v] = [(neighbour, face size), …] in cyclic order, or None when v's fan is open (rim)."""
    faces, nv = patch["faces"], len(patch["vertices"])
    corners = defaultdict(list)
    for ring in faces:
        m = len(ring)
        for i in range(m):
            corners[ring[i]].append((ring[i - 1], ring[(i + 1) % m], m))
    fans = [None] * nv
    for v, cs in corners.items():
        by_prev = {}
        for c in cs:
            if c[0] in by_prev:          # two corners entering on the same edge — not a manifold fan
                by_prev = None
                break
            by_prev[c[0]] = c
        if by_prev is None:
            continue
        cyc, cur = [], cs[0]
        for _ in range(len(cs)):
            cyc.append(cur)
            cur = by_prev.get(cur[1])
            if cur is None:
                break
        if cur is not cs[0] or len(cyc) != len(cs):
            continue                     # the fan does not close -> rim vertex
        fans[v] = [(c[1], c[2]) for c in cyc]
    return fans


def adjacency(patch):
    nb = [set() for _ in patch["vertices"]]
    for ring in patch["faces"]:
        m = len(ring)
        for i in range(m):
            a, b = ring[i], ring[(i + 1) % m]
            nb[a].add(b)
            nb[b].add(a)
    return nb


def _dart_tables(fans):
    """Flat dart ids per (v,i), the base-vertex/corner lookups, and alpha (-1 across an open fan)."""
    off, k = [], 0
    for f in fans:
        off.append(k)
        k += len(f) if f else 0
    dart_v, dart_i = [0] * k, [0] * k
    for v, f in enumerate(fans):
        if f:
            for i in range(len(f)):
                dart_v[off[v] + i] = v
                dart_i[off[v] + i] = i
    alpha = [-1] * k
    for v, f in enumerate(fans):
        if not f:
            continue
        for i, (w, _) in enumerate(f):
            if not fans[w]:
                continue
            for j, (u, _) in enumerate(fans[w]):
                if u == v:
                    alpha[off[v] + i] = off[w] + j
                    break
    return off, alpha, dart_v, dart_i


def _bfs(nb, src):
    d = [-1] * len(nb)
    d[src] = 0
    q = deque([src])
    while q:
        v = q.popleft()
        for w in nb[v]:
            if d[w] < 0:
                d[w] = d[v] + 1
                q.append(w)
    return d


def rim_depth(fans, nb):
    """Distance from each vertex to the nearest open-fan vertex, over the full adjacency."""
    n = len(fans)
    d = [None] * n
    q = deque()
    for v in range(n):
        if not fans[v]:
            d[v] = 0
            q.append(v)
    while q:
        v = q.popleft()
        for w in nb[v]:
            if d[w] is None:
                d[w] = d[v] + 1
                q.append(w)
    return [x if x is not None else n for x in d]


class PatchMap:
    """Cached combinatorial view of a developed patch."""

    def __init__(self, patch):
        self.fans = build_fans(patch)
        self.nb = adjacency(patch)
        self.off, self.alpha, self.dart_v, self.dart_i = _dart_tables(self.fans)
        self.depth = rim_depth(self.fans, self.nb)

    def roots(self, r):
        return [v for v in range(len(self.fans)) if self.fans[v] and self.depth[v] > r]

    def ball_code(self, v, r):
        fans, off, alpha, dart_v, dart_i = self.fans, self.off, self.alpha, self.dart_v, self.dart_i
        dist = _bfs(self.nb, v)
        inb = [bool(0 <= dist[u] <= r and fans[u]) for u in range(len(fans))]
        best = None
        for orient in (1, -1):
            for i0 in range(len(fans[v])):
                root = off[v] + i0
                idx = {root: 0}
                order = [root]
                qi = 0
                while qi < len(order):
                    d = order[qi]
                    qi += 1
                    dv = dart_v[d]
                    s = off[dv] + (dart_i[d] + orient) % len(fans[dv])
                    a = alpha[d]
                    if a >= 0 and not inb[dart_v[a]]:
                        a = -1
                    for nxt in (s, a):
                        if nxt >= 0 and nxt not in idx:
                            idx[nxt] = len(order)
                            order.append(nxt)
                code = []
                for d in order:
                    dv = dart_v[d]
                    s = off[dv] + (dart_i[d] + orient) % len(fans[dv])
                    a = alpha[d]
                    if a >= 0 and not inb[dart_v[a]]:
                        a = -1
                    code.append((fans[dv][dart_i[d]][1], idx[s], idx.get(a, -1)))
                code = tuple(code)
                if best is None or code < best:
                    best = code
        return best


MIN_ROOTS = 8      # below this a radius is anecdote, not evidence — see pick_radius


def signature(patch, rmax=4, max_roots=400):
    """{"sets": {r: frozenset of r-ball codes}, "roots": {r: how many vertices were deep enough}}.

    The root count travels with the set because it is what makes a radius trustworthy: the deepest
    radius a patch supports is typically backed by a SINGLE vertex, and one ball is not evidence."""
    pm = PatchMap(patch)
    sets, roots = {}, {}
    for r in range(1, rmax + 1):
        rs = pm.roots(r)
        if not rs:
            break
        roots[r] = len(rs)
        sets[r] = frozenset(pm.ball_code(v, r) for v in rs[:max_roots])
    return {"sets": sets, "roots": roots}


def orbit_lower_bound(sig):
    """Largest number of distinct balls seen at any radius — a proven lower bound on the orbit count
    (vertices in one symmetry orbit always have isomorphic balls, so #balls <= #orbits)."""
    return max((len(s) for s in sig["sets"].values()), default=0)


def pick_radius(a, b):
    """Deepest radius both patches back with at least MIN_ROOTS vertices; else the deepest shared one.

    Comparing at the deepest shared radius alone is what made an earlier pass invent distinctions: two
    developments of one tiling would meet at r=4 where each side had exactly one qualifying vertex, and
    a mismatch there says nothing about the tilings."""
    shared = set(a["sets"]) & set(b["sets"])
    if not shared:
        return None
    good = [r for r in shared if a["roots"][r] >= MIN_ROOTS and b["roots"][r] >= MIN_ROOTS]
    return max(good) if good else max(shared)


def same_tiling(a, b):
    """Same tiling? None = undecidable (no shared radius).

    Equality is too strict: a patch may not reach every orbit, so two developments of ONE tiling can
    report different subsets of its ball types. Containment absorbs that — a verdict of "different"
    then needs ball types that cannot coexist in one tiling, which is what separates the two 4.4.4.6
    maps (disjoint at r=1 and r=2, neither contained in the other)."""
    r = pick_radius(a, b)
    if r is None:
        return None
    return a["sets"][r] <= b["sets"][r] or b["sets"][r] <= a["sets"][r]
