#!/usr/bin/env python3
"""Alphabet generator for the Čtrnáct engine: palette spec -> vertexdef tables + certificates.

Model. A palette is a set of tiles; each tile contributes corner CLASSES:
  - regular n-gon: one class, interior angle (D/2 - D/n) units of 2pi/D, word length n, period 1
  - isotoxal star n*alpha: two classes, point (alpha) and dent (2pi - 2pi/n - alpha),
    word (point,dent)^n, length 2n, period 2
A vertex CONFIGURATION is a cyclic word of corner classes with unit sum exactly D.
Words of length >= 3 are counting vertices; 2-corner words (dent-fill points, Myers
non-vertices) are noncounting. Each configuration crosses with the conjugacy classes of
subgroups of its dihedral symmetry group to give the site-symmetry variants (S/R/A/F);
the vertexdef is the orbit space of the chirality-doubled dart set under the subgroup.

Doubled dart structure for a word c[0..m-1] (c[j] = corner class between stub j and j+1):
  darts (i,b), i in Z_m, b in {0,1} (1 = starred / mirror copy)
  rneig(i,0)=(i+1,0)  rneig(i,1)=(i-1,1)  mirro(i,b)=(i,1-b)
  cls(i,0)=c[i-1]     cls(i,1)=c[i]          (satisfies cls[mirro x] == cls[rneig x])
Symmetries of c act as rotations (i,b)->(i+t,b) and reflections (i,b)->(a-i,1-b).

Certificates emitted per entry (proof obligations A4/A5 in docs/ctrnact-proof-program):
  structural: lneig o rneig = id, mirro involution, mirro o rneig = lneig o mirro,
              cls[mirro x] == cls[rneig x]
  attachment: Aut(vertexdef) computed by brute force; |Aut| == ferkval; Aut acts freely;
              the first darts/ferkval darts form a transversal of the Aut-orbits
              (this is the completeness-grade check: extend() only tries those darts
              when attaching a fresh vertex of this type).

Regular palette gate: the generated (config x subgroup-class) folds must match the 44
legacy entries EXACTLY (arrays + ferkval), trying every frame (rotation/reflection of the
word) per fold; names/codes/order are then pinned from the legacy tables rather than
reverse-engineered. Star palettes use a systematic frame (lex-max word) and fresh names.

Usage:
  python3 gen_alphabet.py --palette palettes/regular.json --out ../tables/regular --certify
"""
import argparse
import itertools
import json
import os
import re
import sys
from fractions import Fraction

def _word_period(w):
    L = len(w)
    for p in range(1, L + 1):
        if L % p == 0 and all(w[i] == w[(i + p) % L] for i in range(L)):
            return p
    return L

def _poly_boundary(cells):
    """CCW outer boundary of a polyomino (unit squares keyed by bottom-left corner) as a loop of grid
    vertices, EVERY grid point on the boundary kept (straight runs carry flat 180° corners, notches carry
    reflex 270°). Simply-connected, no diagonal pinch (holds for all polyominoes we use) ⇒ each boundary
    vertex has one outgoing directed edge, so the walk is a function. Interior on the left ⇒ CCW."""
    has = {(x, y) for x, y in cells}
    nxt = {}
    for x, y in cells:
        if (x, y - 1) not in has: nxt[(x, y)] = (x + 1, y)          # bottom edge, heading +x
        if (x + 1, y) not in has: nxt[(x + 1, y)] = (x + 1, y + 1)  # right edge, heading +y
        if (x, y + 1) not in has: nxt[(x + 1, y + 1)] = (x, y + 1)  # top edge, heading -x
        if (x - 1, y) not in has: nxt[(x, y + 1)] = (x, y)          # left edge, heading -y
    start = min(cells, key=lambda c: (c[1], c[0]))
    sk = (start[0], start[1])
    verts, cur, g = [], sk, 0
    while True:
        verts.append(cur)
        cur = nxt[cur]
        g += 1
        if cur == sk or g > 100000:
            break
    return verts

def polyomino_angle_word(cells, D):
    """Cyclic interior-angle word (D-units) around a polyomino boundary: 90°→D/4, 180°→D/2, 270°→3D/4,
    classified by the signed turn (left=convex, straight=flat, right=reflex) of a CCW traversal."""
    v = _poly_boundary(cells)
    m = len(v)
    w = []
    for i in range(m):
        px, py = v[(i - 1) % m]; cx, cy = v[i]; nx, ny = v[(i + 1) % m]
        cross = (cx - px) * (ny - cy) - (cy - py) * (nx - cx)
        w.append(D // 4 if cross > 0 else (3 * D // 4 if cross < 0 else D // 2))
    return w

# ---------------------------------------------------------------- palette

class Tile:
    def __init__(self, tid, spec):
        self.tid = tid
        self.kind = spec["kind"]              # "regular" | "star" | "composite" | "doubled" | "scaled"
        self.name = spec["name"]              # display token base, e.g. "6" or "6*p2"/"6*d16"
        self.famchar = spec["famchar"]        # family char(s) for output filenames
        if self.kind == "regular":
            self.n = spec["n"]
            self.L = self.n                   # boundary word length
            self.p = 1                        # rotation period of the word
        elif self.kind == "star":
            self.n = spec["n"]
            self.alphaU = spec["alphaU"]      # point angle in 2pi/D units
            self.L = 2 * self.n
            self.p = 2
        elif self.kind == "doubled":          # side-2 regular N-gon as a degenerate 2N-gon
            self.n = spec["n"]                # underlying regular polygon side count N
            self.L = 2 * self.n               # boundary word length: 2N unit edges
            self.p = 2                        # word period: (real corner, flat 180° corner)
        elif self.kind == "scaled":           # side-s regular N-gon as a degenerate sN-gon (doubled ≡ s=2)
            self.n = spec["n"]                # underlying regular polygon side count N
            self.scale = spec["scale"]        # side length s (>=1); s=1 ≡ regular, s=2 ≡ doubled
            self.L = self.scale * self.n      # boundary word length: sN unit edges
            self.p = self.scale               # word period: (real corner, then s-1 flat 180° corners)
        elif self.kind == "polyomino":        # union of unit squares; boundary = unit-edge {90,180,270}-gon
            self.cells = spec["cells"]        # unit squares, bottom-left integer corners
            self.angles = spec["angles"]      # cyclic interior-angle word in D-units (from polyomino_angle_word)
            self.n = len(self.angles)         # boundary vertex count (perimeter in unit edges)
            self.L = self.n
            self.p = _word_period(self.angles)  # corner classes = fundamental-period positions
        else:                                 # composite
            self.angles = spec["angles"]      # cyclic interior-angle word in D units
            self.n = len(self.angles)
            self.L = self.n                   # boundary word length = full angle word
            self.p = _word_period(self.angles)  # corner classes = fundamental-period positions

class CornerClass:
    def __init__(self, cid, tile, pos, units, disp):
        self.cid = cid        # global class id
        self.tile = tile
        self.pos = pos        # position mod tile.p in the boundary word
        self.units = units    # interior angle in 2pi/D units
        self.disp = disp      # display token (legacy: polygon size string)

def load_palette(path):
    spec = json.load(open(path))
    D = spec["D"]
    tiles, classes = [], []
    for t in spec["tiles"]:
        if t.get("kind") == "polyomino" and "angles" not in t:
            t["angles"] = polyomino_angle_word(t["cells"], D)  # derive the boundary angle word from cells
        tile = Tile(len(tiles), t)
        tiles.append(tile)
        if tile.kind == "regular":
            units = D // 2 - D // tile.n
            assert (D // 2 - D / tile.n) == units, f"tile {tile.name} off the 2pi/{D} grid"
            cc = CornerClass(len(classes), tile, 0, units, tile.name)
            cc.is_point = False
            classes.append(cc)
        elif tile.kind == "star":
            aU = tile.alphaU
            dU = D - D // tile.n - aU
            assert 0 < aU < D // 2 < dU < D, f"star {tile.name} angles invalid"
            cp = CornerClass(len(classes), tile, 0, aU, f"{tile.n}*p{aU}")
            cp.is_point = True
            classes.append(cp)
            cd = CornerClass(len(classes), tile, 1, dU, f"{tile.n}*d{dU}")
            cd.is_point = False
            classes.append(cd)
        elif tile.kind == "doubled":  # two classes: real corner (D/2 - D/N) + flat 180° corner (D/2)
            thetaU = D // 2 - D // tile.n
            assert (D // 2 - D / tile.n) == thetaU, f"doubled {tile.name} off the 2pi/{D} grid"
            cr = CornerClass(len(classes), tile, 0, thetaU, tile.name)        # real corner
            cr.is_point = False
            classes.append(cr)
            cf = CornerClass(len(classes), tile, 1, D // 2, f"{tile.name}~")  # flat noncounting corner (180°)
            cf.is_point = False
            classes.append(cf)
        elif tile.kind == "scaled":  # p=s classes: real corner (pos 0) + (s-1) flat 180° corners
            thetaU = D // 2 - D // tile.n
            assert (D // 2 - D / tile.n) == thetaU, f"scaled {tile.name} off the 2pi/{D} grid"
            cr = CornerClass(len(classes), tile, 0, thetaU, tile.name)        # real corner
            cr.is_point = False
            classes.append(cr)
            for pos in range(1, tile.scale):                                 # s-1 flat 180° corners along each side
                cf = CornerClass(len(classes), tile, pos, D // 2, f"{tile.name}~{pos}")
                cf.is_point = False
                classes.append(cf)
        elif tile.kind == "polyomino":  # one class per fundamental-period boundary position (90/180/270)
            assert sum(tile.angles) == (tile.n - 2) * (D // 2), \
                f"polyomino {tile.name} angle sum {sum(tile.angles)} != {(tile.n-2)*(D//2)}"
            for pos in range(tile.p):
                cc = CornerClass(len(classes), tile, pos, tile.angles[pos], f"{tile.name}.{pos}")
                cc.is_point = False
                classes.append(cc)
        else:  # composite
            assert sum(tile.angles) == (tile.n - 2) * (D // 2), \
                f"composite {tile.name} angle sum {sum(tile.angles)} != {(tile.n-2)*(D//2)}"
            for pos in range(tile.p):
                cc = CornerClass(len(classes), tile, pos, tile.angles[pos], f"{tile.name}@{pos}")
                cc.is_point = False
                classes.append(cc)
        tile.classes = [c for c in classes if c.tile is tile]
    return spec, D, tiles, classes

# ---------------------------------------------------------------- configurations

def cyclic_reps(words):
    """Deduplicate words up to rotation and reflection; keep one representative each
    (the lex-max over all rotations of word and reversed word)."""
    seen, reps = set(), []
    for w in words:
        m = len(w)
        orbit = [tuple(w[(i + s) % m] for i in range(m)) for s in range(m)]
        rev = tuple(reversed(w))
        orbit += [tuple(rev[(i + s) % m] for i in range(m)) for s in range(m)]
        key = max(orbit)
        if key not in seen:
            seen.add(key)
            reps.append(list(key))
    return reps

def enum_configs(D, classes, min_len, max_len):
    """All cyclic words of corner classes with unit sum == D, up to rotation+reflection.

    PROVEN word constraint (point-adjacency lemma, not a heuristic): no two star-POINT
    corners may be cyclically adjacent. Proof: two adjacent point corners at a vertex v
    belong to stars S1, S2 sharing an edge e = (v,w). An isotoxal star's boundary
    alternates point and dent corners along its edges, so both S1 and S2 have DENT
    corners at w, and those two dent corners are adjacent at w (they share e). Dent
    angles are reflex (alpha < pi - 2pi/n gives dent = 2pi - 2pi/n - alpha > pi), so the
    two corners alone exceed 2pi around w: the tiles would overlap. Hence no valid
    tiling contains an adjacent point-point pair, and excluding such words drops
    nothing. (Two adjacent DENTS are excluded by the sum constraint itself: 2 reflex
    angles already exceed 2pi.) Without this lemma the unit-1/2 point corners make the
    word enumeration explode combinatorially; with it, points and >=4-unit separators
    alternate, bounding word length."""
    out = []
    unit = {c.cid: c.units for c in classes}
    pt = {c.cid: getattr(c, "is_point", False) for c in classes}
    cids = sorted(unit, key=lambda k: (-unit[k], k))
    def rec(word, total):
        if len(word) >= min_len and total == D:
            if not (pt[word[-1]] and pt[word[0]]):  # cyclic point-adjacency
                out.append(list(word))
            return
        if total >= D or len(word) >= max_len:
            return
        for cid in cids:
            if word and pt[word[-1]] and pt[cid]:   # point-adjacency lemma
                continue
            word.append(cid)
            if total + unit[cid] <= D:
                rec(word, total + unit[cid])
            word.pop()
    rec([], 0)
    return cyclic_reps(out)

# ---------------------------------------------------------------- doubled darts + symmetry

def word_symmetries(c):
    """Rotations t with c[j+t]==c[j] for all j, and reflections a with c[a-i]==c[i-1]
    for all i (i.e. stub-circle reflection axis parameter a; see module docstring)."""
    m = len(c)
    rots = [t for t in range(m) if all(c[(j + t) % m] == c[j] for j in range(m))]
    refl = [a for a in range(m) if all(c[(a - i) % m] == c[(i - 1) % m] for i in range(m))]
    return rots, refl

def sym_group(c):
    """Elements as ('r',t) or ('s',a)."""
    rots, refl = word_symmetries(c)
    return [('r', t) for t in rots] + [('s', a) for a in refl]

def apply_sym(g, dart, m):
    i, b = dart
    if g[0] == 'r':
        return ((i + g[1]) % m, b)
    return ((g[1] - i) % m, 1 - b)

def compose(g, h, m):
    """g after h."""
    if g[0] == 'r' and h[0] == 'r':
        return ('r', (g[1] + h[1]) % m)
    if g[0] == 'r' and h[0] == 's':
        return ('s', (h[1] + g[1]) % m)
    if g[0] == 's' and h[0] == 'r':
        return ('s', (g[1] - h[1]) % m)
    return ('r', (g[1] - h[1]) % m)

def all_subgroups(c):
    """All subgroups of Sym(c) (deduped as sets, NOT up to conjugacy). Distinct
    representatives of one conjugacy class yield differently-labeled but isomorphic
    folds; the pinned-legacy matcher needs all of them to hit Marek's exact frames."""
    m = len(c)
    G = sym_group(c)
    rots = sorted(t for k, t in G if k == 'r')
    refl = sorted(a for k, a in G if k == 's')
    s = len(rots)  # rotation subgroup order; rotations are multiples of m/s
    step = m // s
    subs = []
    for d in divisors(s):
        cd = frozenset(('r', (step * (s // d) * j) % m) for j in range(d))
        subs.append(cd)                                   # cyclic C_d
        for a in refl:                                    # dihedral D_d over C_d
            h = cd | frozenset(compose(('s', a), r, m) for r in cd)
            subs.append(frozenset(h))
    return list(set(subs))

def subgroups_up_to_conjugacy(c):
    """All subgroups of Sym(c), one representative per conjugacy class in Sym(c)."""
    m = len(c)
    G = sym_group(c)
    subs = all_subgroups(c)
    # conjugacy dedupe
    classes = []
    seen = set()
    for H in subs:
        if H in seen:
            continue
        orbit = set()
        for g in G:
            ginv = g if g[0] == 's' else ('r', (-g[1]) % m)
            orbit.add(frozenset(compose(compose(g, h, m), ginv, m) for h in H))
        seen |= orbit
        classes.append(min(orbit, key=lambda X: sorted(X)))
    return sorted(classes, key=lambda X: (-len(X), sorted(X)))

def divisors(n):
    return [d for d in range(1, n + 1) if n % d == 0]

# ---------------------------------------------------------------- folding

class Entry:
    """A folded vertexdef: parallel arrays over darts."""
    __slots__ = ("labels", "lneig", "rneig", "mirro", "cls", "ferkval",
                 "config", "H", "symbol", "code", "counting", "reps")

def fold(c, H):
    """Orbit space of the doubled dart set of word c under subgroup H."""
    m = len(c)
    darts = [(i, b) for b in (0, 1) for i in range(m)]
    # orbits
    orb = {}
    for d in darts:
        if d in orb:
            continue
        members = {apply_sym(g, d, m) for g in H} | {d}
        # close under H (H is a group so one pass suffices, but be safe)
        changed = True
        while changed:
            changed = False
            for x in list(members):
                for g in H:
                    y = apply_sym(g, x, m)
                    if y not in members:
                        members.add(y)
                        changed = True
        for x in members:
            orb[x] = frozenset(members)
    # order: first appearance scanning (0,0)..(m-1,0),(0,1)..(m-1,1)
    scan = [(i, 0) for i in range(m)] + [(i, 1) for i in range(m)]
    order, seen = [], set()
    for d in scan:
        o = orb[d]
        if o not in seen:
            seen.add(o)
            order.append(o)
    idx = {o: k for k, o in enumerate(order)}
    # label: min base index; tie (both chiralities of same i) -> unstarred
    def label(o):
        mb = min(i for i, b in o)
        starred = not any((mb, 0) == x or x == (mb, 0) for x in o) and (mb, 1) in o
        starred = (mb, 0) not in o
        return ("*" if starred else "") + str(mb)
    ent = Entry()
    ent.config, ent.H = c, H
    ent.labels = [label(o) for o in order]
    def cls_of(d):
        i, b = d
        return c[(i - 1) % m] if b == 0 else c[i]
    def img(fn):
        res = []
        for o in order:
            d = next(iter(o))
            res.append(idx[orb[fn(d)]])
        return res
    ent.rneig = img(lambda d: ((d[0] + 1) % m, 0) if d[1] == 0 else ((d[0] - 1) % m, 1))
    ent.lneig = img(lambda d: ((d[0] - 1) % m, 0) if d[1] == 0 else ((d[0] + 1) % m, 1))
    ent.mirro = img(lambda d: (d[0], 1 - d[1]))
    ent.cls = [cls_of(next(iter(o))) for o in order]
    # well-definedness check: every member of an orbit must agree on cls and images
    for o in order:
        assert len({cls_of(d) for d in o}) == 1, "cls not constant on orbit (H not a symmetry?)"
    ent.counting = len(c) >= 3
    return ent

# ---------------------------------------------------------------- automorphisms + certificates

def automorphisms(ent):
    """All permutations of darts preserving rneig, mirro, cls. The structure is
    connected and functional, so an automorphism is determined by the image of dart 0."""
    n = len(ent.labels)
    auts = []
    for img0 in range(n):
        if ent.cls[img0] != ent.cls[0]:
            continue
        phi = {0: img0}
        stack = [0]
        ok = True
        while stack and ok:
            x = stack.pop()
            for fn in (ent.rneig, ent.lneig, ent.mirro):
                y, fy = fn[x], fn[phi[x]]
                if y in phi:
                    if phi[y] != fy:
                        ok = False
                        break
                else:
                    if ent.cls[y] != ent.cls[fy]:
                        ok = False
                        break
                    phi[y] = fy
                    stack.append(y)
        if ok and len(phi) == n and len(set(phi.values())) == n:
            auts.append(tuple(phi[i] for i in range(n)))
    return auts

def certify(ent, name):
    """Structural + attachment certificates. Returns (ferkval, lines) and sets ent.reps.

    IMPORTANT (discovered on the star24 palette): the legacy rule "try the first
    darts/ferkval darts when attaching a fresh vertex" is NOT a transversal for words
    that are chiral AND rotationally symmetric (e.g. (3,12*p2,4)^2): the leading darts
    cover only unstarred Aut-orbits and miss every starred orbit, which would silently
    drop tilings. No regular {3,4,6,12} configuration is both chiral and rotation-
    symmetric, which is why Marek's prefix rule is sound there (certified per entry).
    The generalized engine therefore iterates an EXPLICIT per-entry representative
    list (ent.reps = lexicographic first dart of each Aut-orbit); for pinned palettes
    we additionally assert reps == [0..ran-1] so legacy behavior is byte-identical."""
    lines = []
    n = len(ent.labels)
    ok = all(ent.lneig[ent.rneig[i]] == i for i in range(n))
    lines.append(f"{name}: lneig∘rneig=id {'PASS' if ok else 'FAIL'}")
    assert ok
    ok = all(ent.mirro[ent.mirro[i]] == i for i in range(n))
    lines.append(f"{name}: mirro involution {'PASS' if ok else 'FAIL'}")
    assert ok
    ok = all(ent.mirro[ent.rneig[i]] == ent.lneig[ent.mirro[i]] for i in range(n))
    lines.append(f"{name}: mirro∘rneig=lneig∘mirro {'PASS' if ok else 'FAIL'}")
    assert ok
    ok = all(ent.cls[ent.mirro[i]] == ent.cls[ent.rneig[i]] for i in range(n))
    lines.append(f"{name}: cls[mirro]=cls[rneig] {'PASS' if ok else 'FAIL'}")
    assert ok
    auts = automorphisms(ent)
    fk = len(auts)
    # free action: no non-identity automorphism fixes a dart
    free = all(all(a[i] != i for i in range(n)) for a in auts if any(a[i] != i for i in range(n)))
    lines.append(f"{name}: |Aut|={fk}, free action {'PASS' if free else 'FAIL'}")
    assert free
    assert n % fk == 0, f"{name}: |Aut|={fk} does not divide dart count {n}"
    ran = n // fk
    orbit_of = {}
    orbits = []
    for i in range(n):
        o = frozenset(a[i] for a in auts)
        if o not in orbit_of:
            orbit_of[o] = min(o)
            orbits.append(o)
    ent.reps = sorted(min(o) for o in orbits)
    assert len(ent.reps) == ran, f"{name}: orbit count {len(ent.reps)} != darts/|Aut| {ran}"
    prefix_ok = ent.reps == list(range(ran))
    lines.append(f"{name}: {ran} Aut-orbits, reps={ent.reps} "
                 f"(legacy prefix rule {'holds' if prefix_ok else 'WOULD DROP — explicit reps required'})")
    return fk, lines

# ---------------------------------------------------------------- legacy parsing (regular gate)

def parse_legacy(oracle_dir):
    """Parse the 44 pinned entries from Marek's untouched original,
    reference/eu_solver.orig.cpp (the authentic, immutable pin source)."""
    txt = open(os.path.join(oracle_dir, "reference", "eu_solver.orig.cpp")).read()
    legacy = {"symbol": [], "label": [], "lneig": [], "rneig": [],
              "mirro": [], "lvert": [], "ferkval": [], "code": []}
    for mres in re.finditer(r'vertexdef\{(.*)\}\s*,?\s*$', txt, re.M):
        fields = eval("[" + mres.group(1).replace("{", "[").replace("}", "]") + "]")
        sym, label, lneig, rneig, mirro, lvert, ferkval, code = fields
        legacy["symbol"].append(sym)
        legacy["label"].append(label)
        legacy["lneig"].append(lneig)
        legacy["rneig"].append(rneig)
        legacy["mirro"].append(mirro)
        legacy["lvert"].append(lvert)
        legacy["ferkval"].append(ferkval)
        legacy["code"].append(code)
    assert len(legacy["symbol"]) == 44, f"expected 44 pinned entries, parsed {len(legacy['symbol'])}"
    return legacy

def frames_of(c):
    """All rotations and reflections of word c (the possible array frames)."""
    m = len(c)
    fr = [[c[(j + s) % m] for j in range(m)] for s in range(m)]
    rev = list(reversed(c))
    fr += [[rev[(j + s) % m] for j in range(m)] for s in range(m)]
    return fr

def match_regular(entries_by_config, legacy, classes):
    """Match every legacy entry to a generated (config, H-class) fold in some frame.
    Returns ordered list of Entry with legacy symbol/code/ferkval attached."""
    disp = {c.cid: c.disp for c in classes}
    matched = []
    used = set()
    for k, sym in enumerate(legacy["symbol"]):
        want = {
            "label": legacy["label"][k],
            "lneig": legacy["lneig"][k],
            "rneig": legacy["rneig"][k],
            "mirro": legacy["mirro"][k],
            "lvert": [str(x) for x in legacy["lvert"][k]],
        }
        found = None
        for (ckey, Hkey), ent in entries_by_config.items():
            if (ckey, Hkey) in used:
                continue
            if (ent.labels == want["label"] and ent.lneig == want["lneig"]
                    and ent.rneig == want["rneig"] and ent.mirro == want["mirro"]
                    and [disp[x] for x in ent.cls] == want["lvert"]):
                found = (ckey, Hkey, ent)
                break
        if not found:
            return None, f"legacy entry {sym} has no generated match"
        used.add(found[:2])
        ent = found[2]
        ent.symbol, ent.code, ent.ferkval = sym, legacy["code"][k], legacy["ferkval"][k]
        matched.append(ent)
    unmatched = [key for key in entries_by_config if key not in used]
    if unmatched:
        return None, f"{len(unmatched)} generated folds have no legacy counterpart: {unmatched[:4]}"
    return matched, None

# ---------------------------------------------------------------- emission

def cxx_strlist(xs):
    return "{" + ",".join(f'"{x}"' for x in xs) + "}"

def cxx_intlist(xs):
    return "{" + ",".join(str(x) for x in xs) + "}"

def cxx_nested(xss, string=False):
    return "{" + ",".join((cxx_strlist if string else cxx_intlist)(xs) for xs in xss) + "}"

def flat_tables_cxx(prefix, entries, disp):
    """Flat C arrays + offsets. Huge nested brace initializers (3000+ entries) send
    clang into quadratic territory (observed: 17+ CPU-minutes, killed); flat arrays
    with a tiny runtime builder compile in seconds and keep the same public names."""
    n = len(entries)
    off = [0]
    for e in entries:
        off.append(off[-1] + len(e.labels))
    roff = [0]
    for e in entries:
        roff.append(roff[-1] + len(e.reps))
    numeric = all(d.isdigit() for d in disp)
    lvert_flat = [int(disp[x]) if numeric else x for e in entries for x in e.cls]
    s = f"static const int {prefix}N = {n};\n"
    s += f"static const char* const {prefix}SYMBOL[] = " + cxx_strlist([e.symbol for e in entries]) + ";\n"
    s += f"static const char* const {prefix}CODE[] = " + cxx_strlist([e.code for e in entries]) + ";\n"
    s += f"static const int {prefix}FERKVAL[] = " + cxx_intlist([e.ferkval for e in entries]) + ";\n"
    s += f"static const int {prefix}COUNTING[] = " + cxx_intlist([1 if e.counting else 0 for e in entries]) + ";\n"
    s += f"static const int {prefix}OFF[] = " + cxx_intlist(off) + ";\n"
    s += f"static const char* const {prefix}LABEL[] = " + cxx_strlist([x for e in entries for x in e.labels]) + ";\n"
    s += f"static const int {prefix}LNEIG[] = " + cxx_intlist([x for e in entries for x in e.lneig]) + ";\n"
    s += f"static const int {prefix}RNEIG[] = " + cxx_intlist([x for e in entries for x in e.rneig]) + ";\n"
    s += f"static const int {prefix}MIRRO[] = " + cxx_intlist([x for e in entries for x in e.mirro]) + ";\n"
    s += f"static const int {prefix}CLS[] = " + cxx_intlist([x for e in entries for x in e.cls]) + ";\n"
    s += f"static const int {prefix}LVERT[] = " + cxx_intlist(lvert_flat) + ";\n"
    s += f"static const int {prefix}REPS_OFF[] = " + cxx_intlist(roff) + ";\n"
    s += f"static const int {prefix}REPS[] = " + cxx_intlist([x for e in entries for x in e.reps]) + ";\n"
    return s

def emit(outdir, D, tiles, classes, entries, cert_lines, palette_name):
    os.makedirs(outdir, exist_ok=True)
    disp = [c.disp for c in classes]
    maxL = max(t.L for t in tiles)
    # ---- pruner_tables.inc: same public names/types as the legacy hand-written file
    # (symbollist, labellistin, ...listin, codelist + clslistin/countinglist extensions),
    # built at startup from flat arrays.
    with open(os.path.join(outdir, "pruner_tables.inc"), "w") as f:
        f.write("// generated by gen_alphabet.py, palette=%s — do not edit\n" % palette_name)
        f.write(flat_tables_cxx("PTAB_", entries, disp))
        f.write("""
static std::vector<std::string> _ptab_str(const char* const* a, int n) {
    return std::vector<std::string>(a, a + n);
}
static std::vector<std::vector<int>> _ptab_nest(const int* flat, const int* off, int n) {
    std::vector<std::vector<int>> v((size_t)n);
    for (int i = 0; i < n; i++) v[i].assign(flat + off[i], flat + off[i + 1]);
    return v;
}
static std::vector<std::vector<std::string>> _ptab_nests(const char* const* flat, const int* off, int n) {
    std::vector<std::vector<std::string>> v((size_t)n);
    for (int i = 0; i < n; i++) v[i].assign(flat + off[i], flat + off[i + 1]);
    return v;
}
static const std::vector<std::string> symbollist = _ptab_str(PTAB_SYMBOL, PTAB_N);
static const std::vector<std::vector<std::string>> labellistin = _ptab_nests(PTAB_LABEL, PTAB_OFF, PTAB_N);
static const std::vector<std::vector<int>> lneiglistin = _ptab_nest(PTAB_LNEIG, PTAB_OFF, PTAB_N);
static const std::vector<std::vector<int>> rneiglistin = _ptab_nest(PTAB_RNEIG, PTAB_OFF, PTAB_N);
static const std::vector<std::vector<int>> mirrolistin = _ptab_nest(PTAB_MIRRO, PTAB_OFF, PTAB_N);
static const std::vector<std::vector<int>> lvertlistin = _ptab_nest(PTAB_LVERT, PTAB_OFF, PTAB_N);
static const std::vector<std::string> codelist = _ptab_str(PTAB_CODE, PTAB_N);
static const std::vector<std::vector<int>> clslistin = _ptab_nest(PTAB_CLS, PTAB_OFF, PTAB_N);
static const std::vector<int> countinglist(PTAB_COUNTING, PTAB_COUNTING + PTAB_N);
""")
        f.write(class_tables_cxx(D, tiles, classes, maxL))
    # ---- solver_tables.inc: mainlist built from the same flat layout
    with open(os.path.join(outdir, "solver_tables.inc"), "w") as f:
        f.write("// generated by gen_alphabet.py, palette=%s — do not edit\n" % palette_name)
        f.write(flat_tables_cxx("STAB_", entries, disp))
        f.write("""
static std::vector<vertexdef> _stab_mainlist() {
    std::vector<vertexdef> v((size_t)STAB_N);
    for (int i = 0; i < STAB_N; i++) {
        vertexdef& d = v[i];
        d.symbol = STAB_SYMBOL[i];
        int a = STAB_OFF[i], b = STAB_OFF[i + 1];
        d.label.assign(STAB_LABEL + a, STAB_LABEL + b);
        d.lneig.assign(STAB_LNEIG + a, STAB_LNEIG + b);
        d.rneig.assign(STAB_RNEIG + a, STAB_RNEIG + b);
        d.mirro.assign(STAB_MIRRO + a, STAB_MIRRO + b);
        d.lvert.assign(STAB_CLS + a, STAB_CLS + b);
        d.ferkval = STAB_FERKVAL[i];
        d.code = STAB_CODE[i];
        d.counting = STAB_COUNTING[i];
        d.reps.assign(STAB_REPS + STAB_REPS_OFF[i], STAB_REPS + STAB_REPS_OFF[i + 1]);
    }
    return v;
}
std::vector<vertexdef> mainlist = _stab_mainlist();
""")
        f.write(class_tables_cxx(D, tiles, classes, maxL))
    # ---- tables.py mirror (develop.py / render)
    with open(os.path.join(outdir, "tables.py"), "w") as f:
        f.write("# generated by gen_alphabet.py, palette=%s — do not edit\n" % palette_name)
        f.write(f"D = {D}\nMAXL = {maxL}\n")
        f.write("SYMBOLS = %r\n" % [e.symbol for e in entries])
        f.write("LABELS = %r\n" % [e.labels for e in entries])
        f.write("LNEIG = %r\n" % [e.lneig for e in entries])
        f.write("RNEIG = %r\n" % [e.rneig for e in entries])
        f.write("MIRRO = %r\n" % [e.mirro for e in entries])
        f.write("CLS = %r\n" % [e.cls for e in entries])
        f.write("COUNTING = %r\n" % [1 if e.counting else 0 for e in entries])
        f.write("CODES = %r\n" % [e.code for e in entries])
        f.write("FERKVAL = %r\n" % [e.ferkval for e in entries])
        f.write("REPS = %r\n" % [e.reps for e in entries])
        f.write("CLASS_DISP = %r\n" % disp)
        f.write("CLASS_UNITS = %r\n" % [c.units for c in classes])
        f.write("CLASS_L = %r\n" % [c.tile.L for c in classes])
        f.write("CLASS_P = %r\n" % [c.tile.p for c in classes])
        f.write("CLASS_NEXT = %r\n" % [next_class(c, classes) for c in classes])
        f.write("CLASS_PREV = %r\n" % [prev_class(c, classes) for c in classes])
        f.write("CLASS_TILE = %r\n" % [c.tile.tid for c in classes])
        f.write("TILE_NAME = %r\n" % [t.name for t in tiles])
        f.write("TILE_FAM = %r\n" % [t.famchar for t in tiles])
    # ---- certs
    with open(os.path.join(outdir, "certs.txt"), "w") as f:
        f.write("\n".join(cert_lines) + "\n")

def next_class(c, classes):
    for x in classes:
        if x.tile is c.tile and x.pos == (c.pos + 1) % c.tile.p:
            return x.cid
    raise AssertionError

def prev_class(c, classes):
    for x in classes:
        if x.tile is c.tile and x.pos == (c.pos - 1) % c.tile.p:
            return x.cid
    raise AssertionError

def class_tables_cxx(D, tiles, classes, maxL):
    s = f"static constexpr int TABLE_D = {D};\n"
    s += f"static constexpr int TABLE_MAXL = {maxL};\n"
    s += "static const std::vector<int> CLASS_UNITS = " + cxx_intlist([c.units for c in classes]) + ";\n"
    s += "static const std::vector<int> CLASS_L = " + cxx_intlist([c.tile.L for c in classes]) + ";\n"
    s += "static const std::vector<int> CLASS_P = " + cxx_intlist([c.tile.p for c in classes]) + ";\n"
    s += "static const std::vector<int> CLASS_NEXT = " + cxx_intlist([next_class(c, classes) for c in classes]) + ";\n"
    s += "static const std::vector<int> CLASS_PREV = " + cxx_intlist([prev_class(c, classes) for c in classes]) + ";\n"
    s += "static const std::vector<int> CLASS_TILE = " + cxx_intlist([c.tile.tid for c in classes]) + ";\n"
    s += "static const std::vector<std::string> CLASS_DISP = " + cxx_strlist([c.disp for c in classes]) + ";\n"
    s += "static const std::vector<std::string> TILE_FAM = " + cxx_strlist([t.famchar for t in tiles]) + ";\n"
    s += "static const std::vector<std::string> TILE_NAME = " + cxx_strlist([t.name for t in tiles]) + ";\n"
    return s

# ---------------------------------------------------------------- star naming (systematic)

def star_symbol(ent, classes, variant):
    # the symbol shows the full configuration word (like Marek's), not the folded darts
    disp = [classes[x].disp for x in ent.config]
    return "(" + ",".join(disp) + ")" + variant

# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--palette", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--certify", action="store_true")
    ap.add_argument("--oracle-dir", default=os.path.join(os.path.dirname(__file__), ".."))
    args = ap.parse_args()

    spec, D, tiles, classes = load_palette(args.palette)
    palette_name = spec["name"]
    pinned = spec.get("pinnedLegacy", False)
    # min_len=2 admits noncounting 2-corner vertices: star dent-fill points, and the
    # (flat,flat) mid-edge junction where two side-2 (doubled) tiles abut edge-to-edge.
    min_len = 2 if any(t.kind in ("star", "doubled", "scaled", "polyomino") for t in tiles) else 3
    configs = enum_configs(D, classes, min_len, spec.get("maxValence", 24))
    # Optional geometric pre-filter (EU_PRUNE_OVERLAP=1): drop vertex configs whose PLACED tiles physically
    # overlap. The solver is combinatorial (no geometry), so an overlapping figure would otherwise seed
    # geometrically-impossible tilings; an overlapping figure appears in zero real tilings, so dropping it is
    # SOUND (removes only the impossible, never a valid tiling). OFF by default ⇒ certified regular/star/
    # isotoxal tables are byte-identical. Only meaningful for star (non-convex) palettes — convex-only
    # alphabets are already overlap-free, so this is a no-op there.
    if os.environ.get("EU_PRUNE_OVERLAP"):
        from export_vertex_configs import build_config  # deferred: reuse the exact placement + overlap test
        before = len(configs)
        configs = [c for c in configs if not build_config(classes, D, c)["overlap"]]
        print(f"[gen] EU_PRUNE_OVERLAP: dropped {before - len(configs)} overlapping configs ({before} -> {len(configs)})")
    print(f"[gen] palette={palette_name} D={D} tiles={len(tiles)} classes={len(classes)} "
          f"configs={len(configs)}")

    cert_lines = [f"# certificates for palette={palette_name} (gen_alphabet.py)"]
    if pinned:
        # generate all folds in all frames, match against legacy
        legacy = parse_legacy(args.oracle_dir)
        entries_by_key = {}
        for c in configs:
            for frame in frames_of(c):
                for H in all_subgroups(frame):
                    ent = fold(frame, H)
                    key = (tuple(ent.labels), tuple(ent.lneig), tuple(ent.rneig),
                           tuple(ent.mirro), tuple(ent.cls))
                    entries_by_key.setdefault(key, ent)
        # match: legacy entry -> generated fold with identical arrays
        disp = {c.cid: c.disp for c in classes}
        entries = []
        gen_keys_used = set()
        for k, sym in enumerate(legacy["symbol"]):
            want = None
            for key, ent in entries_by_key.items():
                if (list(key[0]) == legacy["label"][k] and list(key[1]) == legacy["lneig"][k]
                        and list(key[2]) == legacy["rneig"][k] and list(key[3]) == legacy["mirro"][k]
                        and [disp[x] for x in key[4]] == [str(v) for v in legacy["lvert"][k]]):
                    want = ent
                    gen_keys_used.add(key)
                    break
            assert want is not None, f"GATE FAIL: legacy entry {sym} not generated"
            want.symbol = sym
            want.code = legacy["code"][k]
            fk, lines = certify(want, sym)
            assert fk == legacy["ferkval"][k], \
                f"GATE FAIL: {sym} ferkval mismatch gen={fk} legacy={legacy['ferkval'][k]}"
            assert want.reps == list(range(len(want.reps))), \
                f"GATE FAIL: {sym} legacy prefix rule does not hold (reps={want.reps})"
            cert_lines += lines
            cert_lines.append(f"{sym}: ferkval matches legacy ({fk}) PASS")
            want.ferkval = fk
            entries.append(want)
        # completeness direction: every distinct fold must be present among legacy
        # entries up to isomorphism, i.e. every (config x subgroup class) matched.
        n_folds = set()
        for c in configs:
            for H in subgroups_up_to_conjugacy(c):
                ent = fold(c, H)
                n_folds.add(iso_key(ent))
        legacy_iso = {iso_key(e) for e in entries}
        missing = n_folds - legacy_iso
        assert not missing, f"GATE FAIL: {len(missing)} generated folds missing from legacy"
        cert_lines.append(f"GATE: {len(entries)} legacy entries == "
                          f"{len(n_folds)} generated folds (1:1 up to iso) PASS")
        print(f"[gate] {len(entries)}/{len(legacy['symbol'])} legacy entries matched; "
              f"{len(n_folds)} distinct folds generated; ferkvals verified")
    else:
        # Systematic fresh naming for non-pinned (star) palettes: per config, variants
        # sorted by decreasing |H|; base names F / R<r> / A / S<r>; same-base classes
        # within one config disambiguated by trailing a, b, c...
        entries = []
        for c in sorted(configs, key=lambda w: (len(w), [classes[x].disp for x in w])):
            folds = [(len(H), H, fold(c, H)) for H in subgroups_up_to_conjugacy(c)]
            folds.sort(key=lambda t: (-t[0], sorted(t[1])))
            base_of = []
            for hsize, H, ent in folds:
                r = sum(1 for g in H if g[0] == 'r')
                has_refl = any(g[0] == 's' for g in H)
                if hsize == 1:
                    base = "F"
                elif not has_refl:
                    base = f"R{r}"
                elif r == 1:
                    base = "A"
                else:
                    base = f"S{r}"
                base_of.append(base)
            for idx, (hsize, H, ent) in enumerate(folds):
                base = base_of[idx]
                same = [j for j, b in enumerate(base_of) if b == base]
                suffix = chr(ord('a') + same.index(idx)) if len(same) > 1 else ""
                ent.symbol = star_symbol(ent, classes, base + suffix)
                fk, lines = certify(ent, ent.symbol)
                ent.ferkval = fk
                cert_lines += lines
                entries.append(ent)
        # codes: valence digit(s) + letters-only tail (digit-free, tes_id-safe). Tail is
        # base-26 with 'a'=0, left-padded to width 2; width grows past 'zz' (i>=676),
        # which large palettes hit (star24full: 21100 valence-6 entries). Fixed-width
        # 2 chars overflowed into non-ASCII via chr(ord('a')+i//26). Injective: width-2
        # covers i<676 exactly, wider tails have a nonzero leading digit.
        by_val = {}
        for e in entries:
            v = len(e.config)
            i = by_val.get(v, 0)
            by_val[v] = i + 1
            tail, j = "", i
            while True:
                tail = chr(ord('a') + j % 26) + tail
                j //= 26
                if j == 0:
                    break
            e.code = f"{v}{'a' * max(0, 2 - len(tail))}{tail}"
    # A6 certificate (proof obligation A6, docs/ctrnact-completeness/skeleton.tex):
    # entries pairwise non-isomorphic as colored stub structures. Load-bearing because
    # the pruner buckets by the letter-signature string and only compares within a
    # bucket: two distinct letters with isomorphic structure would let one tiling be
    # emitted under two signatures and kept twice. iso_key is a complete invariant for
    # these structures (deterministic + connected: the BFS trace signature from a start
    # dart determines the structure; minimizing over starts makes it canonical).
    a6 = {}
    for e in entries:
        key = iso_key(e)
        assert key not in a6, \
            f"A6 FAIL: entries {a6[key]} and {e.symbol} are isomorphic colored structures"
        a6[key] = e.symbol
    cert_lines.append(f"A6: {len(entries)} entries pairwise non-isomorphic (iso_key) PASS")
    print(f"[cert] A6: {len(entries)} entries pairwise non-isomorphic PASS")
    emit(args.out, D, tiles, classes, entries, cert_lines, palette_name)
    print(f"[gen] wrote {args.out}/{{solver_tables.inc,pruner_tables.inc,tables.py,certs.txt}}"
          f" ({len(entries)} entries)")

def iso_key(ent):
    """Canonical key of an entry up to dart relabeling: minimal trace signature."""
    n = len(ent.labels)
    best = None
    for start in range(n):
        # BFS labeling from start
        num = {start: 0}
        order = [start]
        qi = 0
        while qi < len(order):
            x = order[qi]
            qi += 1
            for fn in (ent.rneig, ent.lneig, ent.mirro):
                y = fn[x]
                if y not in num:
                    num[y] = len(order)
                    order.append(y)
        if len(order) < n:
            # disconnected (should not happen)
            return ("DISCONNECTED", n)
        sig = tuple((num[ent.rneig[x]], num[ent.mirro[x]], ent.cls[x]) for x in order)
        if best is None or sig < best:
            best = sig
    return best

if __name__ == "__main__":
    main()
