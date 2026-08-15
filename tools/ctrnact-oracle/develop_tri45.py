#!/usr/bin/env python3
"""Develop an EDGE-TYPED palette into exact cells and explicit tiles. Named for tri45, the first one.

Why this is not develop.py. That developer is ℤ[ζ₁₂] and steps ONE unit per edge, which is the whole
unstated assumption edge types break: the 45-45-90 triangle's leg and hypotenuse are incommensurable,
so a step is 1 or √2 depending on which edge the dart lies on. The arithmetic stays exact, it just
needs a per-dart step — and a ring big enough to hold every length the palette uses. That ring is the
PALETTE'S, read off its D: ℤ[ζ₂₄] for tri45 and the planigons (√2 = ζ³ + ζ⁻³, √3 = ζ² + ζ⁻²), ℤ[ζ₁₀]
for Penrose's kite and dart (φ = ζ + ζ⁻¹).

Output per tiling: the exact period lattice {T1,T2} and seeds, plus the developed triangles as float
points, so a shelf can render without reconstructing a new tile shape on the client.

  python3 develop_tri45.py --kmin 1 --kmax 3 --pruned <run>/out/pruned --out cells.json
"""
import os, sys, re, json, glob, math, cmath, argparse
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))

sys.path.insert(0, HERE)
from render_ring import Ring

# THE RING IS THE PALETTE'S, NOT THIS FILE'S. It was Z[zeta24] and nothing else for as long as the only
# edge-typed palettes were the 45-45-90 family and the planigons, whose every length lives in
# Z[sqrt2, sqrt3]. Penrose's kite and dart do not: their angles are multiples of 36 degrees and their
# long edge is phi, so they want D=10 and Z[zeta10]. render_ring.Ring derives Z[zeta_D] from Phi_D for
# any D, and at D=24 its reduction is (-1,0,0,0,1,0,0,0) — literally the z^8 = z^4 - 1 this replaced —
# so every shelf already built develops to the same cells, which the regression below checks.
D = DIM = None
ZERO, ZK, _EP, _RING, _SURD_OFFSETS = (), [], [], None, {}


def surd_offsets(D):
    """Which zeta powers sum to each named length unit, at THIS D.

    One chord identity does all the work: zeta^j + zeta^-j = 2 cos(2 pi j / D), so a surd name is
    really an ANGLE, and it is available exactly when D admits that angle. sqrt2 = 2cos(45) needs
    8 | D, sqrt3 = 2cos(30) needs 12 | D, phi = 2cos(36) needs 10 | D. sqrt6 is the product of the
    first two, (z^a+z^-a)(z^b+z^-b) = z^(a+b) + z^(a-b) + z^(b-a) + z^(-a-b), which at D=24 comes out
    (5, 1, -1, -5) — the literal tuple this function replaced.
    """
    def chord(den):
        return D // den if D % den == 0 else None
    out = {"": (0,)}
    a, b, p = chord(8), chord(12), chord(10)
    if a is not None:
        out["sqrt2"] = (a, -a)
    if b is not None:
        out["sqrt3"] = (b, -b)
    if a is not None and b is not None:
        out["sqrt6"] = (a + b, a - b, b - a, -a - b)
    if p is not None:
        out["phi"] = (p, -p)
    # AND THE CHORD ITSELF, under its own name. The four above are the chords that happen to have
    # famous names; `c<j>` is 2 cos(2 pi j / D) for any j, which is the general case they are instances
    # of (sqrt2 = c(D/8), sqrt3 = c(D/12), phi = c(D/10) — asserted below in the self-test). Some
    # lengths a regular polygon forces are chords with no name and no product form: the half-pentagon's
    # cut is cot(18 deg) = sqrt(5 + 2 sqrt5), which at D=20 is c1 + c3 and is expressible no other way
    # in this grammar. Every c<j> is an algebraic integer of Z[zeta_D] by construction, so nothing here
    # can smuggle in a non-integer length.
    for j in range(1, D // 2 + 1):
        out["c%d" % j] = (j, -j)
    return out


def init_ring(d):
    """Point every exact-arithmetic global at Z[zeta_d]. Called once per run from main(), off the
    palette's own D; the module-scope call below keeps a bare import behaving as it always did."""
    global D, DIM, ZERO, ZK, _EP, _RING, _SURD_OFFSETS
    _RING = Ring(d)
    D, DIM, ZERO, ZK = d, _RING.RANK, _RING.ZERO, _RING.ZK
    # zeta_D evaluated as POWERS of one root, not as D separate exponentials: that is what the D=24
    # code did, and the two differ in the last bit, which is enough to move a coordinate rounded to
    # nine places. Keeping the old form keeps the old shelves byte-identical.
    e = cmath.exp(2j * math.pi / d)
    _EP = [e ** k for k in range(DIM)]
    _SURD_OFFSETS = surd_offsets(d)


def zadd(u, v): return tuple(u[i] + v[i] for i in range(DIM))
def zsub(u, v): return tuple(u[i] - v[i] for i in range(DIM))
def zscale(u, m): return tuple(u[i] * m for i in range(DIM))
def zfloat(v): return sum(v[i] * _EP[i] for i in range(DIM))


def _len_step(spec):
    """Per-direction step vectors for an edge length written as a sum of surd terms.

    Grammar: terms joined by '+', each `[k][surd]` — "1", "sqrt2", "6", "2sqrt3", "6+4sqrt3", "phi".
    Which surds exist depends on D (see surd_offsets): at D=24 that is sqrt2, sqrt3 and sqrt6, which
    covers every planigon apothem and the 45-45-90 palettes' "1"/"sqrt2"/"2"/"2sqrt2"; at D=10 it is
    phi, which is both of Penrose's edges.
    """
    if isinstance(spec, int):
        spec = str(spec)
    names = sorted((n for n in _SURD_OFFSETS if n), key=len, reverse=True)
    pat = re.compile(r"(\d*)(" + "|".join(names) + r")?" if names else r"(\d*)()")
    step = [ZERO] * D
    for term in str(spec).split("+"):
        term = term.strip()
        if not term:
            continue
        m = pat.fullmatch(term)
        if not m or (not m.group(1) and not m.group(2)):
            raise SystemExit(f"edgeLengths: cannot express {spec!r} as a Z[zeta{D}] step "
                             f"(term {term!r}; this ring's surds are {', '.join(names) or 'none'})")
        k = int(m.group(1)) if m.group(1) else 1
        offs = _SURD_OFFSETS[m.group(2) or ""]
        for d in range(D):
            v = step[d]
            for o in offs:
                v = zadd(v, zscale(ZK[(d + o) % D], k))
            step[d] = v
    return step


init_ring(24)

STEP = {}

class DevelopError(Exception):
    pass

def egcd(a, b):
    old_r, r, old_s, s, old_t, t = a, b, 1, 0, 0, 1
    while r != 0:
        q = old_r // r
        old_r, r = r, old_r - q * r
        old_s, s = s, old_s - q * s
        old_t, t = t, old_t - q * t
    if old_r < 0:
        old_r, old_s, old_t = -old_r, -old_s, -old_t
    return old_r, old_s, old_t

def lattice_basis(periods):
    piv = {}
    for v in periods:
        v = list(v)
        if not any(v):
            continue
        for col in range(DIM):
            if v[col] == 0:
                continue
            if col in piv:
                b = piv[col]
                g, x, y = egcd(b[col], v[col])
                nb = [x * b[i] + y * v[i] for i in range(DIM)]
                bc, vc = b[col] // g, v[col] // g
                nv = [bc * v[i] - vc * b[i] for i in range(DIM)]
                piv[col] = nb
                v = nv
            else:
                piv[col] = v
                v = [0] * DIM
                break
    return [tuple(piv[c]) for c in sorted(piv)]

def _dot(u, v):
    a, b = zfloat(u), zfloat(v)
    return a.real * b.real + a.imag * b.imag

def gauss_reduce(T1, T2):
    a, b = tuple(T1), tuple(T2)
    for _ in range(1000):
        if _dot(b, b) < _dot(a, a):
            a, b = b, a
        da = _dot(a, a)
        if da == 0:
            break
        m = int(round(_dot(b, a) / da))
        if m == 0:
            break
        b = zsub(b, zscale(a, m))
    if _dot(b, b) < _dot(a, a):
        a, b = b, a
    return a, b

def lattice_coords(pos, T1, T2):
    p, t1, t2 = zfloat(pos), zfloat(T1), zfloat(T2)
    det = t1.real * t2.imag - t1.imag * t2.real
    if abs(det) < 1e-9:
        raise DevelopError("degenerate lattice")
    al = (p.real * t2.imag - p.imag * t2.real) / det
    be = (t1.real * p.imag - t1.imag * p.real) / det
    return al, be

def seeds_mod_lattice(positions, T1, T2):
    seen, out = set(), []
    for pos in positions:
        al, be = lattice_coords(pos, T1, T2)
        key = (round(al % 1.0, 6) % 1.0, round(be % 1.0, 6) % 1.0)
        key = (round(key[0], 5), round(key[1], 5))
        if key in seen:
            continue
        seen.add(key)
        out.append(pos)
    return out


def build(palette_path):
    """Per-class angle units and (ein, eout) edge-type ids, in the generator's class-id order.

    Class ids run tile by tile, each tile contributing `p` classes (its (angle, edge) word period),
    which is exactly how gen_alphabet.load_palette lays them out. Edge-type ids are assigned in first-
    seen order across the whole palette, matching gen_alphabet.edge_id.
    """
    # Same normalisation the generator ran, so derived edge types (edgeLens, freedraw) are interned
    # here in the same order and the class ids line up. Reading the raw file would silently give the
    # developer a different alphabet from the one the search used.
    sys.path.insert(0, os.path.join(HERE, "alphabets"))
    from palette_spec import normalize_palette
    import gen_alphabet as ga
    spec = normalize_palette(json.load(open(palette_path)))
    # And the same mirror expansion. A chiral tile's mirror image is a separate alphabet symbol with
    # its own corner classes; skipping it here would shift every class id after it and develop the
    # solution against a different alphabet from the one that produced it.
    spec = ga.mirror_expand(spec, spec["D"])
    ids, nxt = {}, [1]
    def eid(lab):
        if lab not in ids:
            ids[lab] = nxt[0]; nxt[0] += 1
        return ids[lab]

    def period(word):
        L = len(word)
        for q in range(1, L + 1):
            if L % q == 0 and all(word[i] == word[(i + q) % L] for i in range(L)):
                return q
        return L

    def cls_eid(lab):
        # "*" is a FREE edge and a LIST is a restricted-free one: either way the tile fixes nothing
        # the corner class can record, and the type is carried on the vertex configuration instead
        # (gen_alphabet.free_assignments), so the class records 0.
        return 0 if lab == "*" or not isinstance(lab, str) else eid(lab)

    units, ein, eout = [], [], []
    for t in spec["tiles"]:
        angles, edges = t["angles"], [tuple(e) if isinstance(e, list) else e for e in t["edges"]]
        n = len(angles)
        pq = period(list(zip(angles, edges)))
        for pos in range(pq):
            units.append(angles[pos])
            eout.append(cls_eid(edges[pos]))
            ein.append(cls_eid(edges[(pos - 1) % n]))
    for lab in spec.get("edgeTypes", []):
        eid(lab)                       # free types keep gen_alphabet's ids: declaration order
    return units, ein, eout, ids


def develop(rneig, lneig, mirro, lvert, glue, units, ein, eout, sign=1, types=None):
    """`types`, when given, is the per-dart edge type read straight from the alphabet, which is what a
    FREE-edge palette needs: its corner classes carry no edge information at all, so there is nothing
    for the propagation below to propagate."""
    def ang(cid):
        return units[cid]

    # Edge type of half-edge h. h is flanked by corner lvert[h] on one side and lvert[rneig[h]] on
    # the other, and the two must name the same type — that agreement is exactly what enum_configs
    # enforced, so a mismatch here means the convention is inverted, not that the tiling is bad.
    # EDGE TYPE BY PROPAGATION, not by reading a class pair. In the folded quotient a dart's
    # orientation varies, so "the edge leaving this corner" is not a global function of the class —
    # both readings type every dart and neither types both sides of every half-edge alike. What IS
    # orientation-free: the two edges meeting at a corner carry that corner class's {ein, eout} as a
    # SET, and a glued pair is one edge. For this tile that means the two edges at a right angle are
    # both legs, and each 45 corner has exactly one leg and one hypotenuse — enough to propagate the
    # whole structure from the right angles outward.
    n_he = len(rneig)
    lneig_of = lneig
    if types is not None:
        typ = list(types)

        def etype(h):
            return typ[h]
        return _walk(rneig, lneig, mirro, lvert, glue, units, etype, sign)
    typ = [0] * n_he

    def setv(h, v):
        if typ[h] and typ[h] != v:
            raise DevelopError("edge-type contradiction at dart %d" % h)
        if typ[h]:
            return False
        typ[h] = v
        return True

    changed = True
    guard = 0
    while changed:
        changed = False
        guard += 1
        if guard > 10 * n_he + 100:
            raise DevelopError("edge-type propagation did not settle")
        for c in range(n_he):
            a, b = lneig_of[c], c            # the two edges of one tile at corner lvert[c]
            pair = (ein[lvert[c]], eout[lvert[c]])
            if pair[0] == pair[1]:           # right angle: both edges are legs
                changed |= setv(a, pair[0])
                changed |= setv(b, pair[0])
            else:                            # one of each: knowing either fixes the other
                other = {pair[0]: pair[1], pair[1]: pair[0]}
                if typ[a] and not typ[b]:
                    changed |= setv(b, other[typ[a]])
                elif typ[b] and not typ[a]:
                    changed |= setv(a, other[typ[b]])
        for h in range(n_he):
            g = glue[h]
            if typ[h] and not typ[g]:
                changed |= setv(g, typ[h])
            elif typ[g] and not typ[h]:
                changed |= setv(h, typ[g])
    if not all(typ):
        raise DevelopError("edge types underdetermined (%d of %d darts)" %
                           (sum(1 for t in typ if not t), n_he))

    def etype(h):
        return typ[h]
    return _walk(rneig, lneig, mirro, lvert, glue, units, etype, sign)


def _walk(rneig, lneig, mirro, lvert, glue, units, etype, sign=1):
    """Flood the plane from one dart, exactly, and read off the period lattice. Split out of develop()
    so both the propagated and the table-supplied edge typings run the identical walk."""
    def ang(cid):
        return units[cid]

    def star(h0, d0):
        seq, cur, d = [], h0, d0
        for _ in range(8 * D):
            seq.append((cur, d))
            r = rneig[cur]
            d = (d + sign * ang(lvert[r])) % D
            cur = r
            if (cur, d) == (h0, d0):
                return seq
        raise DevelopError("star did not close")

    placed, periods, expanded = {}, [], set()

    def reg(h, d, pos):
        prev = placed.get((h, d))
        if prev is not None:
            if prev != pos:
                periods.append(zsub(pos, prev))
            return False
        placed[(h, d)] = pos
        return True

    reg(0, 0, ZERO)
    q = deque([(0, 0, ZERO)])
    guard = 0
    while q:
        guard += 1
        if guard > 200000:
            raise DevelopError("BFS did not terminate")
        h0, d0, pos = q.popleft()
        if pos in expanded:
            continue
        expanded.add(pos)
        for (h, d) in star(h0, d0):
            reg(h, d, pos)
            g = glue[h]
            gd = (d + D // 2) % D
            npos = zadd(pos, STEP[etype(h)][d])
            if reg(g, gd, npos):
                q.append((g, gd, npos))

    if not periods:
        raise DevelopError("no periods found")
    basis = lattice_basis(periods)
    if len(basis) != 2:
        raise DevelopError("lattice rank %d != 2" % len(basis))
    T1, T2 = gauss_reduce(basis[0], basis[1])
    seeds = seeds_mod_lattice(list(placed.values()), T1, T2)
    return T1, T2, seeds, placed, etype


def faces_of(placed, rneig, glue, lvert, units, etype, T1, T2, sign=1):
    """Every developed tile, as a cycle of exact vertex positions.

    One face step: cross edge h from this vertex, arrive on dart glue[h] facing back, then turn by the
    interior angle of the corner you just reached. Same step develop_formal's star() takes, read along
    a face instead of around a vertex, so the corner sequence it yields IS the tile's boundary word.
    """
    seen, faces = set(), []
    for (h0, d0), pos0 in placed.items():
        if (h0, d0) in seen:
            continue
        cyc, cur, d, pos, ok = [], h0, d0, pos0, True
        for _ in range(16):
            cyc.append((cur, d, pos))
            g = glue[cur]
            npos = zadd(pos, STEP[etype(cur)][d])
            nd = (d + D // 2) % D
            r = rneig[g]
            nd = (nd + sign * units[lvert[r]]) % D
            cur, d, pos = r, nd, npos
            if (cur, d) == (h0, d0):
                break
        else:
            ok = False
        if not ok or len(cyc) < 3:
            continue
        for m in cyc:
            seen.add((m[0], m[1]))
        faces.append([m[2] for m in cyc])
    return faces


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pruned", required=True)
    ap.add_argument("--kmin", type=int, default=1)
    ap.add_argument("--kmax", type=int, default=3)
    ap.add_argument("--palette", default=None)
    ap.add_argument("--out", required=True)
    ap.add_argument("--tables", default=None)
    ap.add_argument("--sign", type=int, default=1, choices=[1, -1])
    args = ap.parse_args()
    # The record id names the BOARD, not this file: one developer now serves tri45, the planigons and
    # anything else with edge types, and ids that all said "t45" would collide across shelves.
    BOARD = "t45"
    # LENGTH SCALE. A palette may have multiplied every edge by a constant to land its lengths in
    # Z[zeta24] — the planigons do, by 6, because a triangle's apothem is sqrt3/6 and the ring has no
    # denominators. That factor is an artefact of the arithmetic, not of the tiling, so the developed
    # FLOAT geometry is divided back out here: a shelf that kept it would draw planigons six times the
    # size of every other tile in the atlas and look zoomed in at minimum zoom. The exact T1/T2 stay
    # at integer scale, which is what they are for.
    LSCALE = 1.0

    here = os.path.dirname(os.path.abspath(__file__))
    palette = args.palette or os.path.join(here, "alphabets", "palettes", "tri45.json")
    args.tables = args.tables or os.path.join(here, "tables", "tri45", "tables.py")
    _spec = json.load(open(palette))
    BOARD = _spec.get("name", "t45")
    LSCALE = float(_spec.get("lengthScale", 1) or 1)
    # The ring, before anything steps in it. D comes off the palette because it is a property of the
    # TILES — 15-degree corners want zeta24, Penrose's 36-degree ones want zeta10 — and reading it here
    # rather than assuming 24 is the whole of what lets one developer serve both.
    init_ring(int(_spec.get("D", 24)))
    units, ein, eout, edge_ids = build(palette)
    # Step length per edge-type id, from the palette's own labels: 'S' is the unit edge, 'H' the sqrt2
    # one. Keyed by label, not by id, so a palette that declares its tiles in a different order still
    # steps correctly.
    # The NORMALISED spec, as build() uses: a palette may give its edges as lengths (`edgeLens`) and
    # let the types be derived, in which case the raw file has no `edgeLengths` map at all.
    sys.path.insert(0, os.path.join(HERE, "alphabets"))
    from palette_spec import normalize_palette as _norm
    lengths = (_norm(json.load(open(palette))).get("edgeLengths")) or {}
    STEP.clear()
    for lab, i in edge_ids.items():
        if lab not in lengths:
            raise SystemExit(f"palette declares edge type {lab!r} with no entry in edgeLengths")
        STEP[i] = _len_step(lengths[lab])

    # Decode through family_flex, not pruner.py. Its makeglue() is what reads a `[a b]` gluing as
    # joining a dart to a MIRROR dart, and that is where placement chirality lives for this tile: which
    # diagonal a square takes is a property of the gluing, not of the tile or of the walk.
    sys.path.insert(0, here)
    import family_flex as ff
    tab = ff.load_tables(os.path.dirname(args.tables))

    out, fails = [], []
    for k in range(args.kmin, args.kmax + 1):
        for path in sorted(glob.glob(os.path.join(args.pruned, "eupruned_%02d_*.txt" % k))):
            blocks, cur = [], []
            for line in open(path):
                line = line.rstrip("\n")
                if line == "---":
                    if cur:
                        blocks.append(cur)
                    cur = []
                else:
                    cur.append(line)
            if cur:
                blocks.append(cur)
            for b in blocks:
                b = [l for l in b if l.strip()]
                if len(b) < 5:
                    continue
                tes = [l for l in b if l.startswith("TES file:")]
                tid = tes[0].split("/")[-1].strip().replace(".tes", "").replace(" ", "_") if tes else "?"
                try:
                    rneig, lneig, mirro, cls, glue = ff.decode(tab, b[0], b[4])   # b[3] is the TES path, b[4] the Conway line
                    # PREFER THE ALPHABET'S OWN TYPING. tables.py carries ETYPE, the per-dart edge type
                    # the SEARCH constrained gluings with, so reading it makes developer and solver agree
                    # by construction. The propagation below it is a fallback for tables generated before
                    # ETYPE existed — and it cannot serve this palette anyway: it bootstraps from a corner
                    # whose two edges are the same type, which the 45-45-90 triangle has (its right angle,
                    # two legs) and most planigons do not.
                    typ = ff.decode_etype(tab, b[0]) if hasattr(tab, "ETYPE") else None
                    if typ is not None and len(typ) != len(rneig):
                        raise DevelopError("ETYPE length %d != dart count %d" % (len(typ), len(rneig)))
                    T1, T2, seeds, placed, etype = develop(
                        rneig, lneig, mirro, cls, glue, units, ein, eout, args.sign, types=typ)
                    faces = faces_of(placed, rneig, glue, cls, units, etype, T1, T2, args.sign)
                    tri = [f for f in faces if len(f) >= 3]   # triangles AND squares
                    out.append({
                        "id": "%s-%d-%05d" % (BOARD, k, len([o for o in out if o["k"] == k]) + 1),
                        "k": k,
                        "source": tid,
                        "T1": [round(zfloat(T1).real / LSCALE, 9), round(zfloat(T1).imag / LSCALE, 9)],
                        "T2": [round(zfloat(T2).real / LSCALE, 9), round(zfloat(T2).imag / LSCALE, 9)],
                        "T1exact": list(T1),
                        "T2exact": list(T2),
                        "seeds": [[round(zfloat(s).real / LSCALE, 9), round(zfloat(s).imag / LSCALE, 9)]
                                  for s in seeds],
                        "faces": [[[round(zfloat(p).real / LSCALE, 9), round(zfloat(p).imag / LSCALE, 9)]
                                   for p in f] for f in tri],
                        "stats": {"vertices": len(placed), "faces": len(faces), "tiles": len(tri)},
                    })
                except DevelopError as e:
                    fails.append((k, tid, str(e)))

    json.dump(out, open(args.out, "w"))
    per = {}
    for o in out:
        per[o["k"]] = per.get(o["k"], 0) + 1
    print("developed:", {k: per.get(k, 0) for k in range(args.kmin, args.kmax + 1)},
          "total", len(out), "failures", len(fails))
    for f in fails[:10]:
        print("  FAIL k=%d %s: %s" % f)


if __name__ == "__main__":
    main()
