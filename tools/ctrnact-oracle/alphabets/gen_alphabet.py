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
word) per fold; names/codes/order are then pinned from the legacy tables and not
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
import time
from fractions import Fraction

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from palette_spec import normalize_palette          # noqa: E402  (shared with develop_tri45)

def _word_period(w):
    L = len(w)
    for p in range(1, L + 1):
        if L % p == 0 and all(w[i] == w[(i + p) % L] for i in range(L)):
            return p
    return L

# ---------------------------------------------------------------- edge types

_EDGE_IDS = {}
_EDGE_LABEL = {}   # id -> label, for naming free-edge vertex symbols
_CLASSES = []   # set once in main(); fold() needs class ein/eout by id
_MIRROR = []    # class id -> its image under reading the tile boundary BACKWARDS

def mirror_cid(cid):
    """Class id seen when the tile boundary is traversed in reverse.

    Identity for every palette that declares no edge types, which is what keeps their pinned
    tables byte-identical. It stops being the identity as soon as two corners of one tile are
    distinguished by their EDGES rather than their angle: reversing the boundary of the 45-45-90
    triangle swaps its two 45-degree corners, because one has the hypotenuse on its left and the
    other on its right. word_symmetries needs this, since a reflection of a vertex figure mirrors
    every tile in it, and testing reflections by literal class equality silently accepts figures
    that no reflection actually fixes."""
    return _MIRROR[cid] if _MIRROR else cid

def edge_id(label):
    """Small int for an edge-type label. 0 is reserved for UNTYPED, which glues to anything.

    "*" means FREE: the tile does not fix this edge's type, the SEARCH does. It maps to 0 here — the
    corner class records nothing about it — and the type is carried instead on the configuration, one
    value per half-edge (see free_assignments). That difference is the whole point. An edge type baked
    into the corner class splits a tile into as many symbols as it has markings, and worse, makes the
    class MIRROR-DEPENDENT: the corner with the drawn edge on its left is a different class from the
    one with it on its right, so a reflection swaps them and the folded dart orbit carries two classes
    where the model stores one. A free edge leaves the corner class alone, so sigma stays the identity
    and mirror-symmetric vertices stay expressible.
    """
    if label is None or label == "*" or not isinstance(label, str):
        return 0
    if label not in _EDGE_IDS:
        _EDGE_IDS[label] = len(_EDGE_IDS) + 1
        _EDGE_LABEL[_EDGE_IDS[label]] = label
    return _EDGE_IDS[label]


def edge_opts(label):
    """The set of types this boundary edge admits, or None for no constraint at all.

    Three forms. A LABEL pins the edge to one type, which is the only form every pre-freedraw
    palette uses. "*" leaves it entirely to the search. A LIST pins it to a choice — which is what a
    freedraw palette over several LENGTHS needs: the length is a property of the tile and cannot be
    chosen, the drawn bit is exactly what the search chooses, and the pair ["L1", "L1#"] says both at
    once. The corner class still records nothing about the marking, so sigma stays the identity on
    it, which is the whole reason the marking goes on the edge instead of the tile.
    """
    if label is None or label == "*":
        return None
    if isinstance(label, str):
        return frozenset({edge_id(label)})
    return frozenset(edge_id(x) for x in label)


class Config(tuple):
    """A vertex configuration: the cyclic word of corner classes, plus (optionally) the edge type of
    each half-edge. Subclasses tuple so every consumer that treats a configuration as its word — the
    enumerator, cyclic_reps, star_symbol, the overlap filter, quotient_period — keeps working
    untouched; only word_symmetries and fold read `.edges`."""

    def __new__(cls, word, edges=None):
        o = super().__new__(cls, word)
        o.edges = tuple(edges) if edges is not None else None
        return o


def free_assignments(c, classes, free_types):
    """Every edge-type assignment this word admits, one entry per half-edge, deduped up to the word's
    own symmetries.

    Half-edge i lies between corners c[i-1] and c[i]. Either corner may FIX its type (a tile whose
    edges are declared, like the 45-45-90 triangle's leg and hypotenuse); if neither does, the edge is
    free and ranges over the palette's declared types. Two assignments related by a rotation or a
    reflection of the word are the same vertex, so only one survives — which is what keeps the square
    grid's alphabet at the six necklaces uuuu, duuu, dduu, dudu, dddu, dddd instead of all 16 markings.
    """
    m = len(c)
    opts = []
    for i in range(m):
        a, b = classes[c[(i - 1) % m]], classes[c[i]]
        adm = None
        for s in (a.ein_opts, b.eout_opts):
            if s is not None:
                adm = set(s) if adm is None else (adm & set(s))
        if adm is None:
            adm = set(free_types)                      # neither end constrains: any declared type
        if not adm:
            return []                                  # the two ends disagree: no valid assignment
        opts.append(sorted(adm))
    rots, refl = word_symmetries(Config(c))            # symmetries of the bare word
    seen, out = set(), []
    for e in itertools.product(*opts):
        # A rotation by t sends half-edge i to i+t, a reflection a sends i to a-i.
        orbit = [tuple(e[(j - t) % m] for j in range(m)) for t in rots]
        orbit += [tuple(e[(a - j) % m] for j in range(m)) for a in refl]
        key = max(orbit)
        if key in seen:
            continue
        seen.add(key)
        out.append(Config(c, key))
    return out


def edge_type_forbidden_pairs(classes):
    """Ordered corner-class pairs (a, b) that may not be cyclically adjacent at a vertex.

    Two consecutive corners at a vertex share exactly one half-edge, and the types they assign to
    it must agree. WHICH pair of ends meet follows from the orientations: with tile boundaries and
    the vertex fan both read counterclockwise, walking from tile a to tile b crosses the edge that
    ARRIVES at a and LEAVES b. Check it on the unit square grid, vertex at the origin: the first-
    quadrant square arrives at the origin along +y and leaves along +x; the second-quadrant square
    leaves along +y. The edge they share is +y, incoming for a and outgoing for b. Hence a.ein == b.eout.

    Untyped edges (0) are wildcards, so every palette that declares no edge types yields an EMPTY
    set here and its tables stay byte-identical. Unlike forbidden_adjacent_pairs, this is a
    CORRECTNESS constraint, not an optimization, so it is applied whether or not overlap pruning is on.
    """
    bad = set()
    for a in classes:
        for b in classes:
            if a.ein_opts is not None and b.eout_opts is not None and not (a.ein_opts & b.eout_opts):
                bad.add((a.cid, b.cid))
    return bad


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
            # EDGE TYPES (optional). edges[i] labels the boundary edge running from corner i to
            # corner i+1. Only like labels may glue, which is what lets a tile carry edges of
            # incommensurable length (the 45-45-90 triangle's leg and hypotenuse) — the scaled/
            # doubled trick of subdividing into unit darts can only express INTEGER ratios.
            # The period must be taken over the (angle, edge) word, not the angles alone: two
            # positions with equal angles but different edges are different corner classes.
            self.edges = spec.get("edges")
            if self.edges is not None:
                # A restricted-free edge arrives as a list of admissible labels; make it hashable so
                # every place that keys on the (angle, edge) word keeps working.
                self.edges = [tuple(e) if isinstance(e, list) else e for e in self.edges]
                assert len(self.edges) == self.n, \
                    f"composite {self.name}: {len(self.edges)} edge labels for {self.n} angles"
                self.p = _word_period(list(zip(self.angles, self.edges)))
            else:
                self.p = _word_period(self.angles)  # corner classes = fundamental-period positions

class CornerClass:
    def __init__(self, cid, tile, pos, units, disp):
        self.cid = cid        # global class id
        self.tile = tile
        self.pos = pos        # position mod tile.p in the boundary word
        self.units = units    # interior angle in 2pi/D units
        self.disp = disp      # display token (legacy: polygon size string)
        # Edge types of the two boundary edges meeting at this corner, as small ints.
        # 0 = UNTYPED, the default every existing palette keeps: an untyped edge glues to
        # anything, so every pinned table stays byte-identical. eout is the edge leaving this
        # corner in the tile's boundary direction, ein the one arriving.
        self.ein = 0
        self.eout = 0
        # The same two edges as SETS of admissible types, or None for no constraint. ein/eout above
        # stay the single-type reading every pre-freedraw palette needs; these carry the choice a
        # restricted-free edge offers, which a single int cannot.
        self.ein_opts = None
        self.eout_opts = None

def _cyc_canon(w):
    """Rotation-canonical form of a cyclic word — same tile, read from a different corner."""
    w = list(w)
    return max(tuple(w[i:] + w[:i]) for i in range(len(w)))


def mirror_expand(spec, D):
    """Add the mirror twin of every CHIRAL tile that does not already have one in the palette.

    The engine cannot place a tile reflected. A tile IS its cyclic interior-angle word, and a mirrored
    placement reads that word backwards — a different word, so a different alphabet symbol. (The
    chirality-doubled dart set in this module's header is the two sides of a VERTEX figure, not a tile
    flip.) A palette carrying a chiral tile without its twin therefore cannot express any tiling that
    needs the other handedness, and nothing downstream reports a gap.

    Measured 2026-08-08 on the tetromino palette, the one palette that happened to carry both twins
    (S/Z, J/L, because it was built from the Tetris pieces): removing them took k=1 from 27 distinct
    tilings to 16, and 4 of the 39 k=1 records use BOTH handednesses of one polygon at once, so they
    cannot be represented at all with a single twin. The audit that found the rest is
    alphabets/audit_chirality.py.

    Only `composite` and `polyomino` tiles can be chiral. Regular ([a]^n), star ([point,dent]^n) and
    scaled ([θ,180,…]^n) words are all rotations of their own reversal, which is why the regular and
    star families never had to think about this.

    The twin is a distinct SYMBOL but the same POLYGON: it carries `mirrorOf` naming its base, so the
    catalogue can present one tile species and merge the pair when counting.
    """
    out, expanded = [], []
    for t in spec["tiles"]:
        if t.get("kind") == "polyomino" and "angles" not in t:
            t["angles"] = polyomino_angle_word(t["cells"], D)
        out.append(t)
    # CHIRALITY IS DECIDED ON THE (ANGLE, EDGE) WORD, NOT THE ANGLES ALONE. An edged tile can have an
    # achiral angle word and still be chiral through its sides: the {5,4} half is 45-90-90-90, whose
    # reversal is a rotation of itself, but its edges run S,S,H,R one way round and R,H,S,S the other.
    # Testing angles alone called it achiral, added no twin, and left the palette unable to express
    # either handedness — which gen_alphabet then refused outright rather than silently under-report,
    # and that refusal is what found this.
    def _key(t):
        e = t.get("edges")
        return _cyc_canon(list(zip(t["angles"], e)) if e is not None else t["angles"])

    def _rev_key(t):
        w, e = t["angles"], t.get("edges")
        if e is None:
            return _cyc_canon(list(reversed(w)))
        n = len(w)
        return _cyc_canon([(w[n - 1 - j], e[(n - 2 - j) % n]) for j in range(n)])

    present = {_key(t) for t in out if t.get("kind") in ("composite", "polyomino")}
    famchars = {t["famchar"] for t in out}
    for t in list(out):
        if t.get("kind") not in ("composite", "polyomino"):
            continue
        w = t["angles"]
        rev = list(reversed(w))
        if _rev_key(t) == _key(t):
            continue                                   # achiral: its own mirror
        if _rev_key(t) in present:
            continue                                   # twin already in the palette (e.g. tetromino S/Z)
        fam = t["famchar"] + "m"
        i = 0
        while fam in famchars:                          # famchar drives output filenames: keep unique
            i += 1
            fam = t["famchar"] + "m" + str(i)
        famchars.add(fam)
        twin = {"kind": "composite", "name": t["name"] + "'", "angles": rev,
                "famchar": fam, "mirrorOf": t["name"]}
        # The twin's EDGES are the reversal too, and dropping them would leave a mirrored tile whose
        # sides had lost their lengths. Corner j of the twin is corner n-1-j of the original, so the
        # twin's edge j — running from its corner j to j+1 — is the original's edge n-2-j.
        if t.get("edges") is not None:
            n = len(t["angles"])
            twin["edges"] = [t["edges"][(n - 2 - j) % n] for j in range(n)]
        present.add(_key(twin))
        out.append(twin)
        expanded.append(twin["name"])
    if expanded:
        print(f"[gen] mirror twins added for {len(expanded)} chiral tile(s): {', '.join(expanded)}",
              flush=True)
    spec["tiles"] = out
    return spec


def load_palette(path):
    spec = normalize_palette(json.load(open(path)))
    D = spec["D"]
    spec = mirror_expand(spec, D)
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
            # A TILE'S ANGLE SUM SAYS WHAT SURFACE IT LIVES ON. Flat: exactly (n-2)*pi. On the SPHERE a
            # polygon's angles overshoot that by exactly its area (the spherical excess), and in H^2 they
            # fall short by its area. Every composite tile up to now was flat and the equality was the
            # right check; a spherical half-tile — the octahedron's face cut in two is 45-90-90, summing
            # to 225 and not 180 — is not, and would have tripped it. The palette DECLARES which surface
            # it means, so a mistyped angle still fails loudly instead of silently curving the tile.
            _euc, _sum = (tile.n - 2) * (D // 2), sum(tile.angles)
            _geom = spec.get("tileGeometry", "euclidean")
            if _geom == "euclidean":
                assert _sum == _euc, \
                    f"composite {tile.name} angle sum {_sum} != {_euc}"
            elif _geom == "spherical":
                assert _sum > _euc, \
                    f"composite {tile.name} is declared spherical but its angles sum to {_sum} <= {_euc}; " \
                    f"a spherical polygon overshoots the flat sum by its area"
            elif _geom == "hyperbolic":
                assert _sum < _euc, \
                    f"composite {tile.name} is declared hyperbolic but its angles sum to {_sum} >= {_euc}; " \
                    f"a hyperbolic polygon falls short of the flat sum by its area"
            else:
                raise SystemExit(f"[palette] tileGeometry {_geom!r} is not euclidean/spherical/hyperbolic")
            for pos in range(tile.p):
                cc = CornerClass(len(classes), tile, pos, tile.angles[pos], f"{tile.name}@{pos}")
                cc.is_point = False
                if getattr(tile, "edges", None) is not None:
                    cc.eout = edge_id(tile.edges[pos])
                    cc.ein = edge_id(tile.edges[(pos - 1) % tile.n])
                    cc.eout_opts = edge_opts(tile.edges[pos])
                    cc.ein_opts = edge_opts(tile.edges[(pos - 1) % tile.n])
                classes.append(cc)
        tile.classes = [c for c in classes if c.tile is tile]
    return spec, D, tiles, classes

# ---------------------------------------------------------------- configurations

def cyclic_reps(words):
    """Deduplicate words up to rotation and reflection; keep one representative each
    (the lex-max over all rotations of word and reversed word).

    REFLECTING A VERTEX FIGURE ALSO MIRRORS EVERY TILE IN IT, so the reversed word must be read
    through the class-level mirror map, not taken literally. Reversing alone is right exactly while
    sigma is the identity, which it is for every equilateral palette and is not the moment a tile's
    corners are told apart by their EDGES: the 45-45-90 triangle's two 45 degree corners differ only
    in which side carries the hypotenuse, and a square with three of four edges drawn has four corners
    no two of which are alike. Taking the literal reversal there fails to identify a vertex figure with
    its own mirror image, so BOTH survive as separate alphabet symbols, and a tiling whose vertices are
    all one orbit gets built out of two "different" types — its k comes out too big. Measured on the
    drawn/undrawn square grid before this fix: 21 solutions reported as 2-uniform were patterns with a
    single kind of grid point, and 16 of the 21 were a figure paired with its own mirror."""
    seen, reps = set(), []
    for w in words:
        m = len(w)
        orbit = [tuple(w[(i + s) % m] for i in range(m)) for s in range(m)]
        rev = tuple(mirror_cid(x) for x in reversed(w))
        orbit += [tuple(rev[(i + s) % m] for i in range(m)) for s in range(m)]
        key = max(orbit)
        if key not in seen:
            seen.add(key)
            reps.append(list(key))
    return reps

def forbidden_adjacent_pairs(classes, D):
    """{(cid_a, cid_b)} whose PLACED tiles already collide as a bare 2-corner fan.

    The geometric generalization of the point-adjacency lemma below: that lemma is the hand-derived
    special case "two star points cannot be adjacent", and this is the same statement computed for
    every ordered pair. Feeding it to enum_configs turns EU_PRUNE_OVERLAP from a filter that discards
    96.5% of the finished words into a branch prune. Measured 2026-07-25, output byte-identical both times:

      enumeration stage alone, isotoxal-star-z24 + cx4-30.150 : 920.5s -> 44.8s   (20.5x)
      WHOLE generator run, isotoxal-star-z24                  : 165s   -> 35.5s   (4.6x)

    The end-to-end figure is the smaller one and is the one to quote: folds, certificates and emit are
    untouched by this, so they become the floor. Both are on this machine (M5, Python 3.9.6).

    Why pruning a PREFIX cannot lose a config: build_config places each tile at the running angle sum,
    so a prefix's placement is literally the prefix of the full word's placement — if corners i and i+1
    collide they collide in every extension. And overlap is invariant under the rotation/reflection that
    cyclic_reps quotients by, so no surviving representative is lost either. EUCLIDEAN CLOSURE ONLY:
    build_config is planar, and in the defect modes the word does not close, so the tiles it would place
    are not the tiles of the actual spherical/hyperbolic vertex.
    """
    from export_vertex_configs import build_config  # deferred: same exact placement the filter uses
    bad = set()
    for a in range(len(classes)):
        for b in range(len(classes)):
            if classes[a].units + classes[b].units > D:
                continue  # cannot occur as an adjacent pair in any word that closes
            if build_config(classes, D, [a, b])["overlap"]:
                bad.add((a, b))
    return bad


def enum_configs(D, classes, min_len, max_len, closure="euclidean", forbidden=None):
    """All cyclic words of corner classes with unit sum == D, up to rotation+reflection.

    `forbidden` is an optional set of ordered corner-class pairs that may not be cyclically adjacent
    (see forbidden_adjacent_pairs). It is a pure prune: passing None reproduces the historical
    enumeration exactly, which is what keeps the certified byte-identical tables byte-identical.

    Closure modes. "euclidean" (default, all pinned/star/composite palettes): a vertex
    closes when its interior angles sum to EXACTLY a full turn (total == D) — flat plane.
    "positive-defect" (spherical palette): a vertex closes with STRICTLY POSITIVE angular
    defect (0 < total < D), so discrete Gauss–Bonnet forces the glued closed map onto a
    sphere (χ=2), not a torus. In that mode a valid word is NOT a dead end — a longer
    word is a different, still-valid defect vertex (3.3.3 vs 3.3.3.3 vs 3.3.3.3.3 are the
    tetra/octa/icosa figures), so we emit and keep recursing; and a step that would reach a
    full turn exactly (nxt == D, a flat Euclidean vertex) is pruned, not accepted.

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
    spherical = (closure == "positive-defect")
    hyperbolic = (closure == "negative-defect")
    # The wrap pair (last, first) is only genuinely adjacent when the word CLOSES a full turn, so the
    # cyclic half of the pair prune is euclidean-only even if a caller hands us a table in a defect mode.
    bad = forbidden if forbidden else frozenset()
    bad_wrap = bad if not (spherical or hyperbolic) else frozenset()

    # "negative-defect" (hyperbolic palette): a vertex closes with STRICTLY NEGATIVE angular defect
    # (total > D), the mirror image of the spherical case. The EUCLIDEAN interior angles overfill a full
    # turn, so the actual angles — which shrink monotonically with hyperbolic edge length — close to
    # exactly 2pi at the forced edge length (see lib/render/hyperbolicDevelop.ts / hyp_realize.py). Like
    # the spherical mode a valid word is NOT a dead end: {3,7} vs {3,8} vs {3,9} (seven, eight, nine
    # triangles) are all distinct valid vertices, so we emit and KEEP recursing past a full turn — the
    # enumeration is bounded only by max_len (the palette/valence cap), which is the real hyperbolic
    # finiteness knob (there is no total-angle bound; ℤ[ζ] density does not apply to a combinatorial count).
    # This gates the geometry-agnostic solver only; realizability at one shared edge length and
    # combinatorial closure are decided downstream (necessary, not sufficient — docs/hyperbolic-port-notes).
    def rec(word, total):
        if spherical:
            if len(word) >= min_len and 0 < total < D:
                if not (pt[word[-1]] and pt[word[0]]):  # cyclic point-adjacency
                    out.append(list(word))
                # fall through: a longer word is a distinct, still-valid defect vertex
        elif hyperbolic:
            if len(word) >= min_len and total > D:
                if not (pt[word[-1]] and pt[word[0]]):  # cyclic point-adjacency
                    out.append(list(word))
                # fall through: a longer word is a distinct, larger hyperbolic vertex
        else:
            if len(word) >= min_len and total == D:
                if not (pt[word[-1]] and pt[word[0]]) and (word[-1], word[0]) not in bad_wrap:
                    out.append(list(word))
                return
        if len(word) >= max_len:
            return
        if not hyperbolic and total >= D:  # euclidean/spherical prune at or past a full turn
            return
        for cid in cids:
            if word and pt[word[-1]] and pt[cid]:   # point-adjacency lemma
                continue
            if word and (word[-1], cid) in bad:     # geometric generalization of the same lemma
                continue
            word.append(cid)
            nxt = total + unit[cid]
            # euclidean reaches a full turn (nxt <= D); spherical stays strictly under it (nxt < D) so a
            # flat vertex is never developed; hyperbolic overshoots freely (bounded only by max_len).
            ok = (nxt < D) if spherical else (True if hyperbolic else (nxt <= D))
            if ok:
                rec(word, nxt)
            word.pop()
    rec([], 0)
    return cyclic_reps(out)


# ---------------------------------------------------------------- period quotient
def quotient_period(D, spec, tiles, classes, configs, keep_mirror=True):
    """Collapse period-p tiles that differ only in their grid ANGLE WORD into one symbolic SHAPE.

    THE UNLOCK (2026-08-09). Stars reached k=9 because 96% of their vertex types were impossible and
    fixes 10-13 killed them. That does not port: measured on equi3-cx-z24 the face filter kills ZERO of
    801,395 types, because a convex period palette's types are nearly all REAL. They are, however, nearly
    all REDUNDANT — 801,395 types collapse to 22,677 once each period corner is read as (shape, position)
    instead of (angle word, position), a 35x cut of the branching factor. Same order as the star ladder's
    26x, opposite mechanism: stars had junk to delete, period palettes have duplicates to quotient.

    Why the search survives it: `eu_solver.cpp` reads CLASS_UNITS in exactly ONE place (the flat-corner
    guard) and is otherwise purely combinatorial over CLASS_NEXT/PREV/L/P/TILE. Angles matter only to
    decide which configurations close, and that is decided HERE, at alphabet-build time, on the concrete
    classes — every emitted abstract configuration is the image of a config that really closes on the
    grid, so nothing unrealizable is introduced.

    What it gives up, deliberately: a tiling must use ONE angle assignment everywhere, and abstract
    classes cannot express that. Two vertices of an abstract solution may be realizable only at different
    angles. So the search becomes a RELAXATION whose solutions are candidate FAMILIES, and the linear
    tile/vertex system in export_period_families.flex_model decides each one. That is the safe direction
    (a superset, never a loss), it is the same shape of relaxation as the 4-bucket union, and families are
    what the shelf wants anyway — the concrete search emits 583 snapshots that fold to 27 families.

    Mirror twins stay DISTINCT by default: they are one polygon but their corner indices run opposite
    ways, and merging them would need an index reversal the class tables cannot express. Costs 22,677
    against 18,686 and keeps the map honest.
    """
    import re as _re
    PER = _re.compile(r"^e(\d+)-(\d+)-")

    def shapekey(t):
        m = PER.match(t.name)
        if t.kind != "composite" or not m:
            return ("tile", t.name)                       # regular / star / anything not period-p
        mir = t.name.endswith("'")
        return ("shape", int(m.group(1)), int(m.group(2)), mir if keep_mirror else False)

    groups = {}
    for t in tiles:
        groups.setdefault(shapekey(t), []).append(t)
    if not any(k[0] == "shape" for k in groups):
        return tiles, classes, configs, False

    newtiles, newclasses, cmap = [], [], {}
    for key, members in sorted(groups.items(), key=lambda kv: str(kv[0])):
        rep = members[0]
        if key[0] == "tile":
            name = rep.name
        else:
            name = f"e{key[1]}-{key[2]}" + ("'" if key[3] else "")
        nt = Tile(len(newtiles), {"kind": rep.kind, "name": name, "famchar": rep.famchar,
                                  **({"n": rep.n} if hasattr(rep, "n") else {}),
                                  **({"angles": rep.angles} if hasattr(rep, "angles") else {}),
                                  **({"alphaU": rep.alphaU} if hasattr(rep, "alphaU") else {}),
                                  **({"scale": rep.scale} if hasattr(rep, "scale") else {})})
        newtiles.append(nt)
        base = len(newclasses)
        for pos in range(rep.p):
            src = next(c for c in classes if c.tile is rep and c.pos == pos)
            cc = CornerClass(base + pos, nt, pos, src.units,
                             src.disp if key[0] == "tile" else f"{name}@{pos}")
            cc.is_point = getattr(src, "is_point", False)
            newclasses.append(cc)
        for t in members:
            for pos in range(t.p):
                old = next(c for c in classes if c.tile is t and c.pos == pos)
                cmap[old.cid] = base + pos
        nt.classes = newclasses[base:base + rep.p]

    seen, out = set(), []
    for w in configs:
        nw = [cmap[c] for c in w]
        k = min(min(tuple(nw[i:] + nw[:i]) for i in range(len(nw))),
                min(tuple(list(reversed(nw))[i:] + list(reversed(nw))[:i]) for i in range(len(nw))))
        if k in seen:
            continue
        seen.add(k)
        out.append(nw)
    return newtiles, newclasses, out, True


# ---------------------------------------------------------------- doubled darts + symmetry

def word_symmetries(c):
    """Rotations t with c[j+t]==c[j] for all j, and reflections a with c[a-i]==c[i-1]
    for all i (i.e. stub-circle reflection axis parameter a; see module docstring)."""
    m = len(c)
    rots = [t for t in range(m) if all(c[(j + t) % m] == c[j] for j in range(m))]
    # A reflection of a vertex figure MIRRORS every tile in it, so the corner it lands on is the
    # class's mirror_cid, not the class itself. Testing literal equality is right only while the
    # mirror map is the identity, which it is for every equilateral palette — and stops being right
    # the moment two corners of one tile are told apart by their EDGES. The 45-45-90 triangle is the
    # first: it has no rotational symmetry but it does have an axial one, through the right angle,
    # and that axis SWAPS its two 45-degree corners. Testing literally rejects that axis, the axial
    # markings (S/A) are never generated for any word containing a 45, and mirror-image figures stay
    # unidentified — which is what inflates the tiling count.
    refl = [a for a in range(m) if all(c[(a - i) % m] == mirror_cid(c[(i - 1) % m]) for i in range(m))]
    # With FREE edges the type lives on the configuration, not on the corner class, so a symmetry has
    # to preserve the assignment too: a rotation by t carries half-edge i to i+t, a reflection a
    # carries it to a-i. Palettes without free edges have `edges is None` and are untouched.
    e = getattr(c, "edges", None)
    if e is not None:
        rots = [t for t in rots if all(e[(j + t) % m] == e[j] for j in range(m))]
        refl = [a for a in refl if all(e[(a - i) % m] == e[i] for i in range(m))]
    if os.environ.get("GEN_NO_REFLECTIONS"):
        refl = []
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
    __slots__ = ("labels", "lneig", "rneig", "mirro", "cls", "etype", "ferkval", "sigma_mixed",
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
    # SIGMA-MIXED ORBITS ARE A KNOWN HOLE, not a rounding. When the site symmetry H contains a
    # reflection that mirrors a tile whose corner classes it SWAPS, the orbit of a dart carries two
    # different classes and this array can only store one. The solver reads it as the class, so its
    # face walk (checkface, CLASS_NEXT/CLASS_PREV) then fails on every face of that tile, the entry
    # is unusable, and any tiling whose vertices are all of that kind is unreachable — it cannot be
    # presented with a smaller site group either, because simplify() rejects a configuration whose WL
    # refinement does not discretize, which is exactly what an unaccounted mirror leaves behind.
    # Measured on the square grid with drawn/undrawn edge types: 12 of 13 one-uniform freedraw
    # patterns are found and the thirteenth, the family of parallel lines, is not — its every vertex
    # is mirror-symmetric across the drawn line. Counted here so a palette says how much it loses.
    ent.sigma_mixed = sum(1 for o in order if len({cls_of(d) for d in o}) > 1)
    # THE SIDED CLASS. A dart is (half-edge, side). H's rotations preserve the side and its
    # reflections flip it, so an orbit's side-0 members all carry one class x and its side-1 members
    # all carry sigma(x) — never anything else. So the orbit HAS a well-defined class once you say
    # which side you mean, and this array says side 0, the side the scan order reaches first. The
    # arbitrary `min(...)` it replaces mixed the two readings per orbit and is what made a
    # sigma-mixed entry unusable rather than merely sided.
    #
    # The structural identity that carries the side through the engine is
    #     SIGMA[cls[mirro x]] == cls[rneig x]
    # (certify checks it): stepping to the next dart on the same side names the same corner as
    # crossing to the other side of this one, once the crossing is read through sigma. With sigma the
    # identity it is Marek's original cls[mirro x] == cls[rneig x], unchanged.
    def _sided_cls(o):
        vals = {cls_of(d) for d in o if d[1] == 0}
        if not vals:                                  # side-1-only orbit (H has no reflection)
            vals = {mirror_cid(cls_of(d)) for d in o}
        assert len(vals) == 1, "side-0 members of one orbit disagree on their class"
        return next(iter(vals))
    ent.cls = [_sided_cls(o) for o in order]
    # EDGE TYPE per dart. A dart is (half-edge, side), and half-edge i separates corners c[i-1]
    # and c[i], so its type is a property of i alone: c[i-1] calls it ein, c[i] calls it eout, and
    # enum_configs has already refused every word where those disagree. Both sides of the same
    # half-edge therefore agree, which is what makes mirro (which flips only the side) type-safe.
    # Read the shared edges in whichever orientation this word presents, and decide that ONCE for the
    # whole word. A MIRRORED reading of a vertex figure reverses its corner sequence, and reversing
    # swaps every corner's ein and eout, so the forward pairing (a.ein, b2.eout) and the mirrored one
    # (a.eout, b2.ein) are both legitimate — which one holds is a property of the word. enum_configs
    # filters on the FORWARD rule but cyclic_reps then keeps the lex-max over rotations AND reversals,
    # so the stored representative is sometimes the reversed frame; that is when the mirrored reading
    # is the right one. Deciding per half-edge instead of per word is the bug this replaces: a word can
    # admit forward at one half-edge and mirrored at another, and picking whichever matched first
    # types the same edge two ways. Forward wins ties, and the two frames differ only by a reflection,
    # which this engine merges anyway.
    def _pair(i):
        return _CLASSES[c[(i - 1) % m]], _CLASSES[c[i]]

    def _frame_ok(sel):
        for i in range(m):
            x, y = sel(*_pair(i))
            if x and y and x != y:
                return False
        return True

    _FWD = lambda a, b2: (a.ein, b2.eout)
    _REV = lambda a, b2: (a.eout, b2.ein)
    _EDGES = getattr(c, "edges", None)
    if _EDGES is not None:
        _sel = "explicit"                             # the configuration carries the types outright
    elif not any(_CLASSES[x].ein or _CLASSES[x].eout for x in c):
        _sel = None                                   # untyped palette: every edge is a wildcard
    elif _frame_ok(_FWD):
        _sel = _FWD
    elif _frame_ok(_REV):
        _sel = _REV
    else:
        raise AssertionError(f"edge-type clash in word {c}: consistent in neither orientation")

    def etype_of(d):
        i, _b = d
        if _EDGES is not None:
            return _EDGES[i % m]
        if _sel is None:
            return 0
        x, y = _sel(*_pair(i))
        return x or y or 0
    ent.etype = [etype_of(next(iter(o))) for o in order]
    # well-definedness check: every member of an orbit must agree on cls and images
    for o in order:
        seen_cls = {cls_of(d) for d in o}
        assert seen_cls == {min(seen_cls)} or seen_cls == {min(seen_cls), mirror_cid(min(seen_cls))}, \
            "cls not constant on orbit even up to the mirror map (H not a symmetry?)"
        assert len({cls_of(d) for d in o if d[1] == 0}) <= 1, "side-0 class not constant on orbit"
        assert len({etype_of(d) for d in o}) == 1, "edge type not constant on orbit"
    ent.counting = len(c) >= 3
    return ent

# ---------------------------------------------------------------- automorphisms + certificates

def automorphisms(ent):
    """All permutations of darts preserving rneig, mirro, cls AND EDGE TYPE. The structure is
    connected and functional, so an automorphism is determined by the image of dart 0.

    The edge type belongs in this list for the same reason the corner class does: |Aut| is the
    entry's ferkval and its orbits are the transversal the solver uses when ATTACHING a fresh vertex,
    so an automorphism this function invents is a dart the search never tries. On a FREE-edge palette
    the class stops separating darts — every dart of the square grid is the same class — and ignoring
    the edge type made all eight darts of a one-drawn-edge vertex look equivalent: ferkval 8, reps
    [0], and that vertex could only ever be glued on by its DRAWN edge. Measured on the square grid,
    fixing this took k=2 from 106 of freedraw's 153 to all 153, and k=3 from 448 of 1254 to all 1254.
    Equilateral palettes have no edge types, so `et` is all zeros there and nothing changes.
    """
    n = len(ent.labels)
    et = getattr(ent, "etype", None) or [0] * n
    auts = []
    for img0 in range(n):
        if ent.cls[img0] != ent.cls[0] or et[img0] != et[0]:
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
                    if ent.cls[y] != ent.cls[fy] or et[y] != et[fy]:
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
    # Sided: crossing to the other side of a dart names the same corner as stepping to the next dart
    # on this side, once the crossing is read through sigma. Identity map => Marek's original test.
    ok = all(mirror_cid(ent.cls[ent.mirro[i]]) == ent.cls[ent.rneig[i]] for i in range(n))
    lines.append(f"{name}: sigma[cls[mirro]]=cls[rneig] {'PASS' if ok else 'FAIL'}")
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
    # WL COLOUR FOR THE PRUNER. `clslistin` is read in exactly one place — the seed colour of the
    # pruner's Weisfeiler-Leman refinement — and with FREE edges the corner class no longer separates
    # the darts: every dart of the square grid is the same class and only its edge type differs, so
    # the pruner would fold a drawn edge onto an undrawn one and merge tilings that are not the same.
    # Fold the edge type into the colour where, and only where, the class alone is ambiguous. That
    # leaves every palette whose classes already carry their edges (tri45 and friends) byte-identical.
    cls_flat = [x for e in entries for x in e.cls]
    et_flat = [x for e in entries for x in (getattr(e, "etype", None) or [0] * len(e.cls))]
    ambiguous = len({(c, t) for c, t in zip(cls_flat, et_flat)}) > len(set(cls_flat))
    if ambiguous:
        span = max(et_flat) + 1
        cls_flat = [c * span + t for c, t in zip(cls_flat, et_flat)]
    s = f"static const int {prefix}N = {n};\n"
    # ETYPE for the COMPILED path. tables.bin has carried it since CTRNTB02 and the runtime solver
    # switches EDGE_TYPED on from it; the .inc never emitted it, so `eu_solver.<palette>` ran every
    # edge-typed palette with its gluing constraint silently OFF. That is the binary the PARALLEL
    # runner uses. All zeros for a palette with no edge types, so every pinned table is unchanged.
    s += f"static const int {prefix}ETYPE[] = " + cxx_intlist(et_flat) + ";\n"
    s += f"static const char* const {prefix}SYMBOL[] = " + cxx_strlist([e.symbol for e in entries]) + ";\n"
    s += f"static const char* const {prefix}CODE[] = " + cxx_strlist([e.code for e in entries]) + ";\n"
    s += f"static const int {prefix}FERKVAL[] = " + cxx_intlist([e.ferkval for e in entries]) + ";\n"
    s += f"static const int {prefix}COUNTING[] = " + cxx_intlist([1 if e.counting else 0 for e in entries]) + ";\n"
    s += f"static const int {prefix}OFF[] = " + cxx_intlist(off) + ";\n"
    s += f"static const char* const {prefix}LABEL[] = " + cxx_strlist([x for e in entries for x in e.labels]) + ";\n"
    s += f"static const int {prefix}LNEIG[] = " + cxx_intlist([x for e in entries for x in e.lneig]) + ";\n"
    s += f"static const int {prefix}RNEIG[] = " + cxx_intlist([x for e in entries for x in e.rneig]) + ";\n"
    s += f"static const int {prefix}MIRRO[] = " + cxx_intlist([x for e in entries for x in e.mirro]) + ";\n"
    s += f"static const int {prefix}CLS[] = " + cxx_intlist(cls_flat) + ";\n"
    s += f"static const int {prefix}LVERT[] = " + cxx_intlist(lvert_flat) + ";\n"
    s += f"static const int {prefix}REPS_OFF[] = " + cxx_intlist(roff) + ";\n"
    s += f"static const int {prefix}REPS[] = " + cxx_intlist([x for e in entries for x in e.reps]) + ";\n"
    return s

def emit_binary(outdir, D, tiles, classes, entries, maxL, palette_name):
    """tables.bin — the same alphabet as solver_tables.inc, loadable at RUNTIME.

    Why this exists. The alphabet is normally #included as C++ source and compiled into the binary,
    and that is the wall every large palette dies on: combined-z24 reached 1,747,450 vertex types and
    a 588 MB single-line solver_tables.inc, and `g++ -O2` OOMs on it long before any search starts
    (2026-07-12). The DATA is not the problem — 1.75M entries is 100-200 MB in RAM on a 24 GB machine
    — the COMPILER is. Reading the same tables from a flat binary at startup removes that wall for
    every palette at once, with no change to the search and no filtering required.

    Format (all little-endian, i32 = signed 4-byte):
        magic "CTRNTB01"
        i32 D, i32 MAXL, i32 NCLS, i32 NTILES, i32 NTYPES
        NCLS  x i32   CLASS_UNITS, then CLASS_L, CLASS_P, CLASS_NEXT, CLASS_PREV, CLASS_TILE
        strvec CLASS_DISP (NCLS), strvec TILE_FAM (NTILES), strvec TILE_NAME (NTILES)
        per type: str symbol, str code, i32 ferkval, i32 counting,
                  strvec label, i32vec lneig, i32vec rneig, i32vec mirro, i32vec lvert, i32vec reps
    where str = i32 byte-length + UTF-8 bytes, i32vec/strvec = i32 count + items.

    Written alongside the .inc, never instead of it: the compiled path stays the default and stays
    byte-identical, so `make check-regular` keeps protecting it.
    """
    import struct
    buf = bytearray()
    def i32(x):  buf.extend(struct.pack("<i", int(x)))
    def s(x):    b = x.encode("utf-8"); i32(len(b)); buf.extend(b)
    def iv(xs):  i32(len(xs)); [i32(x) for x in xs]
    def sv(xs):  i32(len(xs)); [s(x) for x in xs]

    # CTRNTB03 adds CLASS_SIGMA after CLASS_TILE: the class a corner becomes when its tile is placed
    # mirrored. Identity for every equilateral palette, so the only difference there is a run of
    # 0,1,2,... in place of nothing.
    # CTRNTB02 adds one i32vec per vertex type (etype, the per-dart edge type) after reps.
    # A palette with no edge types writes all zeros there, and the solver treats 0 as a wildcard,
    # so the only difference for every existing palette is a run of zeros.
    buf.extend(b"CTRNTB03")
    i32(D); i32(maxL); i32(len(classes)); i32(len(tiles)); i32(len(entries))
    for f in (lambda c: c.units, lambda c: c.tile.L, lambda c: c.tile.p,
              lambda c: next_class(c, classes), lambda c: prev_class(c, classes),
              lambda c: c.tile.tid, lambda c: mirror_cid(c.cid)):
        for c in classes:
            i32(f(c))
    sv([c.disp for c in classes])
    sv([t.famchar for t in tiles])
    sv([t.name for t in tiles])
    # lvert must match the .inc's STAB_CLS (the corner-CLASS id), NOT the display-numeric LVERT
    # variant, which is a legacy alias used only where classes happen to be numeric.
    for e in entries:
        s(e.symbol); s(e.code); i32(e.ferkval); i32(1 if e.counting else 0)
        sv(list(e.labels)); iv(e.lneig); iv(e.rneig); iv(e.mirro); iv(e.cls); iv(e.reps)
        iv(getattr(e, "etype", None) or [0] * len(e.cls))

    path = os.path.join(outdir, "tables.bin")
    with open(path, "wb") as f:
        f.write(buf)
    return path, len(buf)


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
        d.etype.assign(STAB_ETYPE + a, STAB_ETYPE + b);
    }
    return v;
}
std::vector<vertexdef> mainlist = _stab_mainlist();
""")
        f.write(class_tables_cxx(D, tiles, classes, maxL))
    # ---- tables.bin: the runtime-loadable form, written ALONGSIDE the .inc (never instead of it)
    _binpath, _binsz = emit_binary(outdir, D, tiles, classes, entries, maxL, palette_name)
    print("[gen] tables.bin: %.1f MB (runtime-loadable; build the solver with RUNTIME_TABLES=1 and "
          "point EU_TABLES at it to skip compiling the alphabet)" % (_binsz / 1048576.0))
    # ---- tables.py mirror (develop.py / render)
    with open(os.path.join(outdir, "tables.py"), "w") as f:
        f.write("# generated by gen_alphabet.py, palette=%s — do not edit\n" % palette_name)
        f.write(f"D = {D}\nMAXL = {maxL}\n")
        f.write("CLASS_SIGMA = %r\n" % [mirror_cid(c.cid) for c in classes])
        f.write("SYMBOLS = %r\n" % [e.symbol for e in entries])
        f.write("LABELS = %r\n" % [e.labels for e in entries])
        f.write("LNEIG = %r\n" % [e.lneig for e in entries])
        f.write("RNEIG = %r\n" % [e.rneig for e in entries])
        f.write("MIRRO = %r\n" % [e.mirro for e in entries])
        f.write("CLS = %r\n" % [e.cls for e in entries])
        # Per-dart edge type, the same array tables.bin carries as of CTRNTB02. All zeros for an
        # untyped palette. A developer that reads this instead of re-deriving edge types from corner
        # classes agrees with the solver BY CONSTRUCTION, and can then check glue[h] against h as a
        # certificate that the search honoured the types rather than as an assumption.
        f.write("ETYPE = %r\n" % [getattr(e, "etype", None) or [0] * len(e.cls) for e in entries])
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
    # SIGMA: the corner class seen when the tile is placed MIRRORED. The identity for every palette
    # whose tiles are equilateral, which is what keeps those searches bit-for-bit unchanged. Where it
    # is not the identity, a dart's class is a SIDED quantity — side 0 is what lvert stores, side 1 is
    # this map of it — and the solver needs both to walk a face across a mirror.
    s += "static const std::vector<int> CLASS_SIGMA = " + cxx_intlist([mirror_cid(c.cid) for c in classes]) + ";\n"
    s += "static const std::vector<std::string> CLASS_DISP = " + cxx_strlist([c.disp for c in classes]) + ";\n"
    s += "static const std::vector<std::string> TILE_FAM = " + cxx_strlist([t.famchar for t in tiles]) + ";\n"
    s += "static const std::vector<std::string> TILE_NAME = " + cxx_strlist([t.name for t in tiles]) + ";\n"
    return s

# ---------------------------------------------------------------- star naming (systematic)

def star_symbol(ent, classes, variant):
    # the symbol shows the full configuration word (like Marek's), not the folded darts
    disp = [classes[x].disp for x in ent.config]
    # With free edges the word alone no longer names the vertex — uuuu and dudu are the same four
    # squares — so the edge assignment goes in the symbol, between the word and the site-symmetry tag.
    e = getattr(ent.config, "edges", None)
    edges = ("|" + "".join(_EDGE_LABEL.get(t, "?") for t in e) + "|") if e else ""
    return "(" + ",".join(disp) + ")" + edges + variant

# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--palette", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--certify", action="store_true")
    # See quotient_period(): collapses period-p tiles differing only in their grid angle word into one
    # symbolic shape. Alphabet only — the search is untouched, and every emitted configuration is the
    # image of one that really closes. Solutions become candidate FAMILIES, decided by the linear
    # tile/vertex system downstream (export_period_families.flex_model).
    ap.add_argument("--quotient-period", action="store_true", dest="quotient",
                    help="quotient period-p tiles by shape (drops the grid angle word from the alphabet)")
    ap.add_argument("--oracle-dir", default=os.path.join(os.path.dirname(__file__), ".."))
    args = ap.parse_args()

    spec, D, tiles, classes = load_palette(args.palette)
    _CLASSES[:] = classes
    # Class-level mirror map. Identity unless a tile declares edge types, in which case reading its
    # boundary backwards sends boundary position j to -j, and the class at j to the class at -j.
    # Only meaningful when the reversed (angle, edge) word equals the original: a CHIRAL edged tile
    # needs a twin tile from mirror_expand, and refusing loudly beats folding it wrongly.
    _MIRROR[:] = [c.cid for c in classes]

    def _mirror_word(t):
        """The tile's (angle, edge) boundary word, or None for a tile that has no explicit one."""
        angles = getattr(t, "angles", None)
        if angles is None:
            return None
        return list(zip(angles, t.edges if getattr(t, "edges", None) is not None else [0] * len(angles)))

    words = {t.tid: _mirror_word(t) for t in tiles}
    for t in tiles:
        # Computed for EVERY tile, not only ones that declare edges. A tile's own mirror can exchange
        # two of its corner classes on the strength of the ANGLE word alone — the side-3 scaled
        # triangle is (real, flat, flat) and its mirror swaps the two flats — and treating sigma as
        # the identity there makes word_symmetries reject the very axes that do exist. Tiles whose
        # angle word has period 1 (every regular polygon) are unaffected: sigma is the identity for
        # them however it is computed, which is why the regular tables stay byte-identical.
        w = words[t.tid]
        if w is None:
            continue
        L = len(w)
        # WHERE THE MIRROR IMAGE LIVES. Reading the boundary backwards from position s sends corner j
        # to s-j, and that is a symmetry of the tile exactly when a[s-j] == a[j] and e[s-j-1] == e[j]
        # for every j. Two things generalize the naive version of this test.
        #
        # The axis need not pass through position 0, so every s is tried: the square with one marked
        # edge, [d,u,u,u], is achiral with axis s = 1, and testing s = 0 alone called it chiral.
        #
        # And the mirror image need not be the tile ITSELF. A chiral tile's mirror is a DIFFERENT
        # alphabet symbol — the twin mirror_expand adds, or one the palette already carries, as the
        # tetromino palette carries S alongside Z — so sigma has to be allowed to land on another
        # tile. Searching only inside the tile and refusing when that fails made every palette with a
        # chiral tile ungeneratable: `gen_alphabet.py --palette tetromino` died on tile S.
        cands = [t] + [u for u in tiles
                       if u is not t and words[u.tid] is not None
                       and len(words[u.tid]) == L and u.p == t.p]
        hit = None
        for u in cands:
            w2 = words[u.tid]
            for s in range(L):
                if all(w2[(s - k) % L][0] == w[k][0] and w2[(s - k - 1) % L][1] == w[k][1]
                       for k in range(L)):
                    hit = (u, s)
                    break
            if hit:
                break
        if hit is None:
            raise SystemExit(f"[gen] tile {t.name}: (angle, edge) word {w} is CHIRAL and no tile in "
                             f"this palette is its mirror image; add the twin (mirror_expand builds "
                             f"one for a tile with no edge types, not yet for an edged one)")
        u, s = hit
        base, base2 = t.classes[0].cid, u.classes[0].cid
        for j in range(L):
            _MIRROR[base + (j % t.p)] = base2 + ((s - j) % L) % u.p
    assert all(_MIRROR[_MIRROR[c]] == c for c in range(len(classes))), \
        "sigma is not an involution — two tiles claim the same mirror image"
    palette_name = spec["name"]
    pinned = spec.get("pinnedLegacy", False)
    # min_len=2 admits noncounting 2-corner vertices: star dent-fill points, the (flat,flat) mid-edge
    # junction where two side-2 (doubled) tiles abut edge-to-edge, and — for a palette carrying a REFLEX
    # composite tile (a corner > D/2, e.g. the girih bowtie's 216° notch) — the valence-2 vertex where that
    # notch is filled by a single convex corner (bowtie 216° + decagon 144° = 360°). Without this, such
    # tilings are silently dropped. Gated on reflex composites specifically, so pure-regular and the existing
    # all-convex composite palettes keep min_len=3 and stay byte-identical (make check-regular unaffected).
    has_reflex_composite = any(t.kind == "composite" and any(a > D // 2 for a in t.angles) for t in tiles)
    min_len = 2 if (any(t.kind in ("star", "doubled", "scaled", "polyomino") for t in tiles) or has_reflex_composite) else 3
    # Optional geometric pre-filter (EU_PRUNE_OVERLAP=1): drop vertex configs whose PLACED tiles physically
    # overlap. The solver is combinatorial (no geometry), so an overlapping figure would otherwise seed
    # geometrically-impossible tilings; an overlapping figure appears in zero real tilings, so dropping it is
    # SOUND (removes only the impossible, never a valid tiling). OFF by default ⇒ certified regular/star/
    # isotoxal tables are byte-identical. Only meaningful for star (non-convex) palettes — convex-only
    # alphabets are already overlap-free, so this is a no-op there.
    #
    # Run in TWO parts, which together emit exactly what the single post-hoc filter used to. The adjacent-PAIR
    # half moves inside the DFS (forbidden_adjacent_pairs), where it kills a branch instead of a leaf: 88% of
    # the rejects collide at prefix length 2, so this is where the 20x lives. The whole-word half stays here
    # for the remaining 12%, which need three or more corners before they collide.
    closure = spec.get("closure", "euclidean")
    # `pruneOverlap` in the palette JSON is the PRIMARY switch, because whether a palette needs the geometric
    # filter is a property of the palette (does it carry non-convex tiles?), not of who invoked the build.
    # It used to be env-only, and the Makefile never set it — so `make PALETTE=isotoxal-star-z24` produced
    # 285,899 vertexdefs where the SHIPPED table has 34,329, silently and with no way to tell from the output.
    # The env var still forces it on, for probing a palette that does not declare it.
    prune_overlap = bool(spec.get("pruneOverlap")) or bool(os.environ.get("EU_PRUNE_OVERLAP"))
    # The overlap test is PLANAR (build_config places tiles in the Euclidean plane), so applying it to a
    # defect-closure palette tests a figure that does not exist: every spherical/hyperbolic config "overlaps"
    # and the table comes out EMPTY. That is a silent, total loss — hyp-p7 goes from 6,719 entries to 0 with
    # no error — and the flag is environment-driven, so it is one stray export away. Refuse it loudly instead.
    if prune_overlap and closure != "euclidean":
        print(f"[gen] ⚑ EU_PRUNE_OVERLAP IGNORED: closure={closure} is not planar, and the overlap test is. "
              f"(Setting it here would silently empty the table.)")
        prune_overlap = False
    forbidden = None
    if prune_overlap and closure == "euclidean":
        t_pairs = time.time()
        forbidden = forbidden_adjacent_pairs(classes, D)
        print(f"[gen] EU_PRUNE_OVERLAP: {len(forbidden)} forbidden adjacent pairs of {len(classes) ** 2} "
              f"({time.time() - t_pairs:.1f}s) — pruned inside the DFS")
    # EDGE TYPES: a correctness constraint, so it applies in every closure mode and regardless of
    # EU_PRUNE_OVERLAP. Empty for every palette that declares no edge types.
    edge_bad = edge_type_forbidden_pairs(classes)
    if edge_bad:
        forbidden = edge_bad if forbidden is None else (set(forbidden) | edge_bad)
        types = ", ".join(f"{lab}={i}" for lab, i in sorted(_EDGE_IDS.items(), key=lambda kv: kv[1]))
        print(f"[gen] EDGE TYPES ({types}): {len(edge_bad)} incompatible adjacent pairs of "
              f"{len(classes) ** 2} forbidden at the vertex")
    configs = enum_configs(D, classes, min_len, spec.get("maxValence", 24), closure, forbidden)
    if prune_overlap:
        from export_vertex_configs import build_config  # deferred: reuse the exact placement + overlap test
        before = len(configs)
        configs = [c for c in configs if not build_config(classes, D, c)["overlap"]]
        print(f"[gen] EU_PRUNE_OVERLAP: dropped {before - len(configs)} residual overlapping configs "
              f"({before} -> {len(configs)}) — the 3+-corner collisions the pair table cannot see")
    if args.quotient or spec.get("quotientPeriod"):
        t_q = time.time()
        n_t, n_c, n_cfg = len(tiles), len(classes), len(configs)
        tiles, classes, configs, did = quotient_period(D, spec, tiles, classes, configs)
        if did:
            print(f"[gen] PERIOD QUOTIENT: tiles {n_t} -> {len(tiles)}, classes {n_c} -> {len(classes)}, "
                  f"configs {n_cfg} -> {len(configs)} ({n_cfg / max(len(configs),1):.1f}x) "
                  f"({time.time() - t_q:.1f}s)")
        else:
            print("[gen] PERIOD QUOTIENT: no period-p tiles in this palette — inert")
    # FREE EDGES. A palette declaring `edgeTypes` lets a tile leave an edge's type to the search
    # ("*"), and each vertex word then splits into the assignments it admits, one type per half-edge,
    # deduped under the word's own symmetries. The corner class stays free of any edge information,
    # which is what keeps sigma the identity and mirror-symmetric vertices representable. Palettes
    # with no `edgeTypes` skip this entirely and are byte-identical.
    free_types = [edge_id(t) for t in spec.get("edgeTypes", [])]
    if free_types:
        before = len(configs)
        configs = [a for c in configs for a in free_assignments(c, classes, free_types)]
        print(f"[gen] FREE EDGES over {spec['edgeTypes']}: {before} words -> {len(configs)} "
              f"(word, edge assignment) configurations")
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
    a6_collisions = []
    for e in entries:
        key = iso_key(e)
        if key in a6:
            # Pinned palettes (regular) MUST stay collision-free — this is a hard soundness
            # gate for the pruner. Non-pinned experimental palettes (e.g. spherical) may
            # legitimately collide: on the sphere several valences of one tile (3.3.3 /
            # 3.3.3.3 / 3.3.3.3.3) exist, and their maximally-symmetric folds quotient the
            # valence away to the same colored structure. That never happens on the plane
            # (one all-triangle vertex). Report loudly and continue so the collision can be
            # studied; the pruner's dedup is then NOT trusted for such palettes.
            assert not pinned, \
                f"A6 FAIL: entries {a6[key]} and {e.symbol} are isomorphic colored structures"
            a6_collisions.append((a6[key], e.symbol))
        else:
            a6[key] = e.symbol
    if a6_collisions:
        print(f"[cert] A6 WARNING (non-pinned palette): {len(a6_collisions)} isomorphic-fold "
              f"collisions — pruner dedup unreliable here:")
        for a, b in a6_collisions:
            print(f"        {a}  ~=  {b}")
    a6_ok = len(a6_collisions) == 0
    cert_lines.append(f"A6: {len(entries)} entries, {len(a6_collisions)} iso-fold collisions "
                      f"({'pairwise non-isomorphic PASS' if a6_ok else 'WARN non-pinned'})")
    print(f"[cert] A6: {len(entries)} entries, "
          f"{'pairwise non-isomorphic PASS' if a6_ok else str(len(a6_collisions)) + ' collisions WARN'}")
    sided = [e for e in entries if getattr(e, "sigma_mixed", 0)]
    if sided:
        print(f"[gen] SIDED CLASSES: {len(sided)} of {len(entries)} vertex types have a dart orbit "
              f"whose two sides carry a class and its sigma-image — a mirror in the site symmetry "
              f"maps a tile to its reflection. Their class array is the SIDE-0 reading and the "
              f"identity sigma[cls[mirro]] = cls[rneig] carries the other side. Usable.")
        cert_lines.append(f"SIGMA: {len(sided)} of {len(entries)} entries carry sided classes")
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
        # The colour is (corner class, edge type), matching what the pruner's WL is seeded with —
        # this key exists to predict the pruner's dedup, so it must colour darts the same way. With
        # free edges the class alone is constant and uuuu would key identically to dddd.
        et = getattr(ent, "etype", None) or [0] * len(ent.cls)
        sig = tuple((num[ent.rneig[x]], num[ent.mirro[x]], ent.cls[x], et[x]) for x in order)
        if best is None or sig < best:
            best = sig
    return best

if __name__ == "__main__":
    main()
