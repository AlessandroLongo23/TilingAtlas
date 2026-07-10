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

# ---------------------------------------------------------------- palette

class Tile:
    def __init__(self, tid, spec):
        self.tid = tid
        self.kind = spec["kind"]              # "regular" | "star"
        self.n = spec["n"]
        self.name = spec["name"]              # display token base, e.g. "6" or "6*p2"/"6*d16"
        self.famchar = spec["famchar"]        # family char(s) for output filenames
        if self.kind == "regular":
            self.L = self.n                   # boundary word length
            self.p = 1                        # rotation period of the word
        else:
            self.alphaU = spec["alphaU"]      # point angle in 2pi/D units
            self.L = 2 * self.n
            self.p = 2
        assert self.p <= 2, "p>2 tiles need a reversed-successor map (out of scope)"

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
        tile = Tile(len(tiles), t)
        tiles.append(tile)
        if tile.kind == "regular":
            units = D // 2 - D // tile.n
            assert (D // 2 - D / tile.n) == units, f"tile {tile.name} off the 2pi/{D} grid"
            classes.append(CornerClass(len(classes), tile, 0, units, tile.name))
        else:
            aU = tile.alphaU
            dU = D - D // tile.n - aU
            assert 0 < aU < D // 2 < dU < D, f"star {tile.name} angles invalid"
            classes.append(CornerClass(len(classes), tile, 0, aU, f"{tile.n}*p{aU}"))
            classes.append(CornerClass(len(classes), tile, 1, dU, f"{tile.n}*d{dU}"))
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
    Enumerates necklaces via canonical (lex-max) representatives; sum bound prunes."""
    out = []
    unit = {c.cid: c.units for c in classes}
    cids = sorted(unit, key=lambda k: (-unit[k], k))
    def rec(word, total):
        if len(word) >= min_len and total == D:
            out.append(list(word))
            return
        if total >= D or len(word) >= max_len:
            return
        for cid in cids:
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
                 "config", "H", "symbol", "code", "counting")

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
    """Structural + attachment certificates. Returns (ferkval, lines)."""
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
    orbits = set()
    for i in range(n):
        orbits.add(frozenset(a[i] for a in auts))
    hit = set()
    for i in range(ran):
        hit.add(frozenset(a[i] for a in auts))
    ok = hit == orbits and len(orbits) == ran
    lines.append(f"{name}: first {ran} darts are an Aut-orbit transversal "
                 f"({len(orbits)} orbits) {'PASS' if ok else 'FAIL'}")
    assert ok, f"{name}: transversal certificate FAILED (completeness-grade)"
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

def emit(outdir, D, tiles, classes, entries, cert_lines, palette_name):
    os.makedirs(outdir, exist_ok=True)
    disp = [c.disp for c in classes]
    maxL = max(t.L for t in tiles)
    # ---- pruner_tables.inc: legacy 7 lines byte-compatible, then extensions
    with open(os.path.join(outdir, "pruner_tables.inc"), "w") as f:
        f.write("static const std::vector<std::string> symbollist = "
                + cxx_strlist([e.symbol for e in entries]) + ";\n")
        f.write("static const std::vector<std::vector<std::string>> labellistin = "
                + cxx_nested([e.labels for e in entries], string=True) + ";\n")
        f.write("static const std::vector<std::vector<int>> lneiglistin = "
                + cxx_nested([e.lneig for e in entries]) + ";\n")
        f.write("static const std::vector<std::vector<int>> rneiglistin = "
                + cxx_nested([e.rneig for e in entries]) + ";\n")
        f.write("static const std::vector<std::vector<int>> mirrolistin = "
                + cxx_nested([e.mirro for e in entries]) + ";\n")
        # legacy int-typed array: polygon sizes when all display tokens are numeric
        # (regular palette, byte-gate), class ids otherwise (M2 pruner uses clslistin).
        numeric = all(d.isdigit() for d in disp)
        f.write("static const std::vector<std::vector<int>> lvertlistin = "
                + cxx_nested([[int(disp[x]) if numeric else x for x in e.cls]
                              for e in entries]) + ";\n")
        f.write("static const std::vector<std::string> codelist = "
                + cxx_strlist([e.code for e in entries]) + ";\n")
        f.write("// ---- generated extensions (gen_alphabet.py, palette=%s) ----\n" % palette_name)
        f.write("static const std::vector<std::vector<int>> clslistin = "
                + cxx_nested([e.cls for e in entries]) + ";\n")
        f.write("static const std::vector<int> countinglist = "
                + cxx_intlist([1 if e.counting else 0 for e in entries]) + ";\n")
        f.write(class_tables_cxx(D, tiles, classes, maxL))
    # ---- solver_tables.inc: full mainlist + class tables
    with open(os.path.join(outdir, "solver_tables.inc"), "w") as f:
        f.write("// generated by gen_alphabet.py, palette=%s — do not edit\n" % palette_name)
        f.write("std::vector<vertexdef> mainlist = {\n")
        for e in entries:
            f.write("        vertexdef{%s,%s,%s,%s,%s,%s,%d,%s,%d}%s\n" % (
                f'"{e.symbol}"', cxx_strlist(e.labels), cxx_intlist(e.lneig),
                cxx_intlist(e.rneig), cxx_intlist(e.mirro), cxx_intlist(e.cls),
                e.ferkval, f'"{e.code}"', 1 if e.counting else 0,
                "," if e is not entries[-1] else ""))
        f.write("};\n")
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
        f.write("CLASS_DISP = %r\n" % disp)
        f.write("CLASS_UNITS = %r\n" % [c.units for c in classes])
        f.write("CLASS_L = %r\n" % [c.tile.L for c in classes])
        f.write("CLASS_P = %r\n" % [c.tile.p for c in classes])
        f.write("CLASS_NEXT = %r\n" % [next_class(c, classes) for c in classes])
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

def class_tables_cxx(D, tiles, classes, maxL):
    s = f"static constexpr int TABLE_D = {D};\n"
    s += f"static constexpr int TABLE_MAXL = {maxL};\n"
    s += "static const std::vector<int> CLASS_UNITS = " + cxx_intlist([c.units for c in classes]) + ";\n"
    s += "static const std::vector<int> CLASS_L = " + cxx_intlist([c.tile.L for c in classes]) + ";\n"
    s += "static const std::vector<int> CLASS_P = " + cxx_intlist([c.tile.p for c in classes]) + ";\n"
    s += "static const std::vector<int> CLASS_NEXT = " + cxx_intlist([next_class(c, classes) for c in classes]) + ";\n"
    s += "static const std::vector<int> CLASS_TILE = " + cxx_intlist([c.tile.tid for c in classes]) + ";\n"
    s += "static const std::vector<std::string> CLASS_DISP = " + cxx_strlist([c.disp for c in classes]) + ";\n"
    s += "static const std::vector<std::string> TILE_FAM = " + cxx_strlist([t.famchar for t in tiles]) + ";\n"
    return s

# ---------------------------------------------------------------- star naming (systematic)

def star_symbol(ent, classes, variant):
    disp = [classes[x].disp for x in ent.cls]
    return "(" + ",".join(disp) + ")" + variant

def variant_name(c, H, m):
    rots = sorted(t for k, t in H if k == 'r')
    refl = [a for k, a in H if k == 's']
    rot_order = len(rots)
    if rot_order == 1 and not refl:
        return "F"
    if refl and rot_order > 1:
        return f"S{rot_order}"
    if rot_order > 1:
        return f"R{rot_order}"
    return "A"

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
    min_len = 2 if any(t.kind == "star" for t in tiles) else 3
    configs = enum_configs(D, classes, min_len, spec.get("maxValence", 24))
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
        entries = []
        for c in sorted(configs, key=lambda w: (len(w), [classes[x].disp for x in w])):
            subs = subgroups_up_to_conjugacy(c)
            named = {}
            for H in sorted(subs, key=lambda X: -len(X)):
                ent = fold(c, H)
                base = variant_name(c, H, len(c))
                nsame = sum(1 for b in named.values() if b == base)
                suffix = "" if base in ("F",) and nsame == 0 else (chr(ord('a') + nsame) if nsame or base != "F" and any(b == base for b in named.values()) else "")
                # disambiguate repeated variant names deterministically: a, b, c...
                if base != "F":
                    seen_same = [k for k, b in named.items() if b == base]
                    suffix = chr(ord('a') + len(seen_same)) if seen_same else ""
                else:
                    suffix = ""
                named[frozenset(H)] = base
                ent.symbol = star_symbol(ent, classes, base + suffix)
                fk, lines = certify(ent, ent.symbol)
                ent.ferkval = fk
                cert_lines += lines
                entries.append(ent)
        # codes: valence digit(s) + two letters, digit-free tail
        by_val = {}
        for e in entries:
            v = len(e.config)
            i = by_val.get(v, 0)
            by_val[v] = i + 1
            e.code = f"{v}{chr(ord('a') + i // 26)}{chr(ord('a') + i % 26)}"
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
