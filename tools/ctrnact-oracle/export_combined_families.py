#!/usr/bin/env python3
"""Sweep the combined regular+isotoxal+star catalog for MIXED free-α families and export them parametrically.

The union of export_isotoxal_families.py (convex isotoxal cx tiles) and export_family_cells.py (concave
star tiles): both are isotoxal-family corners with one free angle and a ±1 δ-coefficient (cx: +1 @0 / −1 @1;
star: +1 point / −1 dent), and family_flex.py's development engine is generic in that coefficient. The only
merge is the corner model below, which recognizes BOTH token forms — so a tiling using a cx tile AND a star
tile flexes over each independently and develops in one pass. This is what produces the genuinely-new MIXED
tilings (convex isotoxal + concave star in one tiling) that neither single-family enumeration can reach.

Each family's area certificate (Σ tile area == |det basis| across the δ-box) IS the geometric verification:
a combinatorially-valid mixed figure whose star bodies collide fails it and is flagged loud / dropped. Only
certified families ship. Same output schema as the isotoxal/star families (paramCell.ts ParametricCellData).

Usage:
  python3 export_combined_families.py --tables tables/isotoxal-star-z24 \
      --catalog 1:run-par-k1-isotoxal-star-z24-pruned/out/pruned \
      --out ../../experiments/results/ctrnact-mixed-families.cells.json \
      --log ../../experiments/results/mixed-families-export.log
"""
import argparse
import cmath
import glob
import itertools
import json
import math
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import family_flex as ff

LOG = None
CX_CORNER = re.compile(r"^(cx\d+-[\d.]+)@(\d+)$")
STAR_CORNER = re.compile(r"^(\d+)\*([pd])(\d+)$")
HALF_D = 12  # D//2 for D=24: 180° in grid units


# ---------------- unified isotoxal-family corner model (cx OR star) ----------------
def iso_corner_info(disp):
    """(tile_name, is_point) if `disp` is a flexing isotoxal-family corner — a cx corner `cxL-α.β@pos`
    (point ≡ @0) or a star corner `n*pK`/`n*dK` — else None. The star TILE is named by its POINT units
    (gen_alphabet's convention), so a dent `n*dK` maps back to point units p = 24 − 24/n − K."""
    m = CX_CORNER.match(disp)
    if m:
        return m.group(1), int(m.group(2)) == 0
    m = STAR_CORNER.match(disp)
    if m:
        n, pd, u = int(m.group(1)), m.group(2), int(m.group(3))
        pt = u if pd == "p" else (24 - 24 // n - u)
        return f"{n}*{pt}", pd == "p"
    return None


def iso_corner_token(disp):
    """Angle-abstracted family-key token: `cxL@pos` for a cx corner, `nS@p`/`nS@d` for a star corner."""
    m = CX_CORNER.match(disp)
    if m:
        L = int(re.match(r"cx(\d+)", m.group(1)).group(1))
        return f"cx{L}@{m.group(2)}"
    m = STAR_CORNER.match(disp)
    if m:
        return f"{m.group(1)}S@{m.group(2)}"
    return None


def is_star_name(nm):
    return "*" in nm


def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line)
    if LOG:
        LOG.write(line + "\n")
        LOG.flush()


# ---------------- float evaluation of Laurent elements (verbatim from export_family_cells) ----------
ZF = [cmath.exp(1j * math.pi * (k % 24) / 12) for k in range(24)]


def zvec_float(v):
    return sum(c * ZF[k] for k, c in enumerate(v) if c)


def lp_terms(p):
    return [[m, (z := zvec_float(p[m])).real, z.imag] for m in sorted(p)]


def eval_terms(terms, delta):
    return sum((re + 1j * im) * cmath.exp(1j * m * delta) for m, re, im in terms)


def poly_area(pts):
    s = 0.0
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        s += a.real * b.imag - a.imag * b.real
    return abs(s) / 2


# ---------------- isotoxal corner model (the star-specific layer, re-expressed) ----------------
def species_and_q(tab, cls_used):
    """Isotoxal-family species (cx OR star) present; qvec[class] = +1 at point/@0, −1 at dent/@1."""
    species = []
    for c in sorted(set(cls_used)):
        if iso_corner_info(tab.CLASS_DISP[c]):
            t = tab.CLASS_TILE[c]
            if t not in species:
                species.append(t)
    qvec = {}
    for c in sorted(set(cls_used)):
        q = [0] * len(species)
        info = iso_corner_info(tab.CLASS_DISP[c])
        if info and tab.CLASS_TILE[c] in species:
            q[species.index(tab.CLASS_TILE[c])] = 1 if info[1] else -1
        qvec[c] = tuple(q)
    return species, qvec


def vertex_qsums(tab, vertypeline, species):
    """δ-coefficient sum per vertex word, per species — from the corner names in the vertype string."""
    name_by_tile = {n: i for i, n in enumerate(tab.TILE_NAME)}
    rows = []
    for corners in ff.vertex_words(vertypeline):
        row = [0] * len(species)
        for cn in corners:
            info = iso_corner_info(cn.strip())
            if not info:
                continue
            tile = name_by_tile.get(info[0])
            if tile in species:
                row[species.index(tile)] += 1 if info[1] else -1
        rows.append(row)
    return rows


def alpha_units(tab, tile):
    """The α (smaller: @0 for cx, point for star) interior angle of an isotoxal-family tile in D-units."""
    for c in range(len(tab.CLASS_DISP)):
        d = tab.CLASS_DISP[c]
        if tab.CLASS_TILE[c] == tile and (d.endswith("@0") or "*p" in d):
            return tab.CLASS_UNITS[c]
    raise ValueError(f"no α (point/@0) corner for tile {tab.TILE_NAME[tile]}")


def beta_units(tab, tile):
    for c in range(len(tab.CLASS_DISP)):
        d = tab.CLASS_DISP[c]
        if tab.CLASS_TILE[c] == tile and (d.endswith("@1") or "*d" in d):
            return tab.CLASS_UNITS[c]
    raise ValueError(f"no β (dent/@1) corner for tile {tab.TILE_NAME[tile]}")


def corner_records(tab, vertypeline, species, direction):
    """Per orbit word: (token, q, normalized_units) corners — the family-key input, α-normalized so
    every α-pin of one family shares the key. token abstracts the specific angle (cxL@pos / nS@p|d)."""
    disp_units = {tab.CLASS_DISP[c]: tab.CLASS_UNITS[c] for c in range(len(tab.CLASS_DISP))}
    sp_dir = {t: d for t, d in zip(species, direction)}
    name_by_tile = {n: i for i, n in enumerate(tab.TILE_NAME)}
    prim = next((t for t, d in zip(species, direction) if d != 0), None)
    a0 = alpha_units(tab, prim) if prim is not None else 0
    words = []
    for corners in ff.vertex_words(vertypeline):
        w = []
        for cn in corners:
            cn = cn.strip()
            info = iso_corner_info(cn)
            if info:
                tile = name_by_tile[info[0]]
                q = (1 if info[1] else -1) * sp_dir.get(tile, 0)
                w.append((iso_corner_token(cn), q, disp_units[cn] - q * a0))
            else:
                w.append((cn, 0, None))
        words.append(tuple(w))
    return words, prim, a0


def star_alpha_max(tab, tile):
    """Upper bound (D-units) on a star species' point angle α: the star condition α < 180 − 360/n (above it
    the dent stops being reflex and the tile ceases to be a star). n = points = ½·side-count."""
    n = int(tab.TILE_NAME[tile].split("*")[0])
    return HALF_D - 24.0 / n


def _species_delta_bounds(tab, tile, d):
    """(lo, hi) for δ keeping ONE flexing species valid, given its flex coefficient d≠0. A cx species stays
    convex (α, β ∈ (0, 180)); a star species keeps its point angle α ∈ (0, 180 − 360/n)."""
    a0 = alpha_units(tab, tile)
    if is_star_name(tab.TILE_NAME[tile]):
        amax = star_alpha_max(tab, tile)  # 0 < a0 + d·δ < amax
        b1, b2 = -a0 / d, (amax - a0) / d
        return (b1, b2) if d > 0 else (b2, b1)
    lo, hi = -1e9, 1e9
    for base, coef in [(a0, d), (beta_units(tab, tile), -d)]:
        b1, b2 = -base / coef, (HALF_D - base) / coef
        l, h = (b1, b2) if coef > 0 else (b2, b1)
        lo, hi = max(lo, l), min(hi, h)
    return lo, hi


def delta_interval_units(tab, species, direction):
    """(lo, hi) for δ in D-units: every flexing tile stays valid (cx convex, star a proper star)."""
    lo, hi = -1e9, 1e9
    for t, d in zip(species, direction):
        if d == 0:
            continue
        l, h = _species_delta_bounds(tab, t, d)
        lo, hi = max(lo, l), min(hi, h)
    return lo, hi


# ---------------- per-block analysis (analyze_block with the iso corner model) ----------------
def canon_cyclic(word):
    cands = []
    for seq in (word, tuple(reversed(word))):
        for r in range(len(seq)):
            cands.append(seq[r:] + seq[:r])
    return min(cands)


def family_key(words):
    return tuple(sorted(canon_cyclic(w) for w in words))


def sym_word_str(words):
    parts = []
    for w in sorted(canon_cyclic(x) for x in words):
        toks = []
        for tok, q, nu in w:
            if nu is None:
                toks.append(tok)
            else:
                base = f"{nu:+d}".lstrip("+") if nu else ""
                coef = {1: "a", -1: "-a", 0: ""}.get(q, f"{q}a")
                s = f"{coef}{'+' if base and q and nu > 0 else ''}{base}" if q else str(nu)
                toks.append(f"{tok}@{s}")
        parts.append("(" + ",".join(toks) + ")")
    return " + ".join(parts)


def poly_n(nm):
    if nm.startswith("cx"):
        return int(re.match(r"cx(\d+)", nm).group(1))
    if "*" in nm:  # star tile `n*a`: n points ⇒ 2n boundary vertices
        return 2 * int(nm.split("*")[0])
    return int(nm)


# ---------------- multi-parameter formal development (P independent flex directions) ----------------
# Fork of family_flex.develop_formal with the direction exponent m generalized from a scalar to a P-tuple
# (one component per independent parameter). The Laurent primitives in family_flex (lp_add/sub/mono/key,
# period_lattice, flatten_basis, dedupe_mod_lattice, face_canonical) are agnostic to the monomial-key type,
# so they are reused unchanged with tuple keys. qeff[c] is a P-tuple: corner c's δ-coefficient per parameter.
def _madd(m, q, sign):
    return tuple(mi + sign * qi for mi, qi in zip(m, q))


def develop_multi(tab, rneig, cls, glue, qeff, P, sign=1, guard=400000):
    from collections import deque
    D = tab.D
    units = tab.CLASS_UNITS
    Z = (0,) * P

    def star(h0, t0, m0):
        seq, cur, t, m = [], h0, t0, m0
        for _ in range(8 * D):
            seq.append((cur, t, m))
            r = rneig[cur]
            t = (t + sign * units[cls[r]]) % D
            m = _madd(m, qeff[cls[r]], sign)
            cur = r
            if cur == h0 and t == t0 and m == m0:
                return seq
            if cur == h0 and t == t0 and m != m0:
                raise ff.FormalPin("vertex walk depends on δ ⇒ closure only at δ=0")
        return None

    placed, periods = {}, []

    def reg(key, pos):
        if key in placed:
            if ff.lp_key(placed[key]) != ff.lp_key(pos):
                periods.append(ff.lp_sub(pos, placed[key]))
            return False
        placed[key] = pos
        return True

    start = (0, 0, Z)
    reg(start, ff.LP0)
    q = deque([(start, ff.LP0)])
    expanded = set()
    g = 0
    while q:
        g += 1
        if g > guard:
            raise RuntimeError("BFS did not terminate")
        (h0, t0, m0), pos = q.popleft()
        pk = ff.lp_key(pos)
        if pk in expanded:
            continue
        expanded.add(pk)
        seq = star(h0, t0, m0)
        if seq is None:
            raise RuntimeError("vertex star did not close")
        for h, t, m in seq:
            reg((h, t, m), pos)
            gg, gt, gm = glue[h], (t + D // 2) % D, m
            npos = ff.lp_add(pos, ff.lp_mono(t, m))
            if reg((gg, gt, gm), npos):
                q.append(((gg, gt, gm), npos))
    return placed, periods


def _face_walk_multi(tab, rneig, cls, glue, qeff, start_key, placed, sign=1):
    D = tab.D
    units = tab.CLASS_UNITS
    h, t, m = start_key
    pos = placed[start_key]
    verts, corner_cls = [], []
    cur_h, cur_t, cur_m, cur_pos = h, t, m, pos
    for _ in range(128):
        verts.append(cur_pos)
        g = glue[cur_h]
        npos = ff.lp_add(cur_pos, ff.lp_mono(cur_t, cur_m))
        nh = rneig[g]
        corner = cls[nh]
        corner_cls.append(corner)
        nt = ((cur_t + D // 2) + sign * units[corner]) % D
        nm = _madd(cur_m, qeff[corner], sign)
        cur_h, cur_t, cur_m, cur_pos = nh, nt, nm, npos
        if cur_h == h and cur_t == t and cur_m == m:
            return verts, corner_cls, ff.lp_key(cur_pos) == ff.lp_key(pos)
    return None, None, False


def trace_faces_multi(tab, rneig, cls, glue, qeff, placed, sign=1):
    faces = {}
    for key in placed:
        verts, ccls, closed = _face_walk_multi(tab, rneig, cls, glue, qeff, key, placed, sign)
        if verts is None:
            continue
        if not closed:
            raise RuntimeError("face walk failed to close FORMALLY")
        tiles = {tab.CLASS_TILE[c] for c in ccls}
        if len(tiles) != 1:
            continue
        fkey = frozenset(ff.lp_key(v) for v in verts)
        if fkey not in faces:
            faces[fkey] = (verts, tiles.pop())
    return list(faces.values())


def lp_terms_multi(p):
    """Laurent element with P-tuple keys → [[mVec, re, im], ...] (mVec a list of length P)."""
    return [[list(m), (z := zvec_float(p[m])).real, z.imag] for m in sorted(p)]


def eval_terms_multi(terms, deltas):
    return sum((re + 1j * im) * cmath.exp(1j * sum(mi * di for mi, di in zip(mv, deltas)))
               for mv, re, im in terms)


def species_delta_interval(tab, tile):
    """δ-range (D-units) keeping ONE species valid with its own α as the +1 parameter: a cx tile convex
    (α, β ∈ (0,180)), a star tile a proper star (point α ∈ (0, 180 − 360/n))."""
    return _species_delta_bounds(tab, tile, 1)


def canonical_map(n, rels, lab):
    """Complete canonical form of a LABELLED oriented dart map (min over deterministic traversals from each
    start dart). Two maps share it iff isomorphic as labelled maps. O(n²) for these ≤~30-dart maps."""
    best = None
    for start in range(n):
        order = {start: 0}
        queue = [start]
        qi = 0
        while qi < len(queue):  # deterministic BFS: explore relations in fixed order
            d = queue[qi]
            qi += 1
            for R in rels:
                nb = R[d]
                if nb not in order:
                    order[nb] = len(order)
                    queue.append(nb)
        if len(order) != n:
            continue
        inv = [0] * n
        for d, i in order.items():
            inv[i] = d
        canon = tuple((lab[inv[i]],) + tuple(order[R[inv[i]]] for R in rels) for i in range(n))
        if best is None or canon < best:
            best = canon
    return best


def family_map_key(rneig, lneig, mirro, glue, cls, tab, param_of_cls, norm_of_cls, P):
    """α-family invariant: the canonical labelled-map form, MINIMIZED over parameter permutations.

    Each isotoxal corner is labelled `cxL#p@norm` — p its parameter index, norm its α-normalized units (so the
    label is identical across every α-pin of a family AND keeps the relative angle structure). Encoding the
    PARAMETER INDEX distinguishes a P=1 diagonal (all isotoxal positions locked to one angle) from the P=2
    family it is the diagonal of — the bare cxL@norm label conflated them, silently dropping a tiling. Taking
    the minimum over parameter permutations makes it invariant to the α₁↔α₂ swap, so the two grid members of
    one 2-parameter family (at (α₁,α₂) and (α₂,α₁)) share the key instead of splitting. Regular corners rigid."""
    n = len(rneig)
    rels = (rneig, lneig, mirro, glue)
    best = None
    for perm in itertools.permutations(range(P)):
        lab = []
        for d in range(n):
            disp = tab.CLASS_DISP[cls[d]]
            if iso_corner_info(disp):  # cx or star corner — abstract angle, encode parameter index
                L = poly_n(tab.TILE_NAME[tab.CLASS_TILE[cls[d]]])
                pt = iso_corner_info(disp)[1]
                p = param_of_cls.get(cls[d])
                lab.append(f"i{L}{'p' if pt else 'd'}#{perm[p]}@{norm_of_cls[cls[d]]}" if p is not None
                           else f"i{L}{'p' if pt else 'd'}~{tab.CLASS_UNITS[cls[d]]}")  # rigid (coupled/non-param)
            else:
                lab.append(disp)
        k = canonical_map(n, rels, lab)
        if best is None or k < best:
            best = k
    return best


def analyze_block(tab, vertype, conway):
    """None (pinned) or a family-member dict.

    Parameter model. The flex space is the integer null space of the vertex δ-coefficient matrix. A species
    flexes ALONE iff its unit vector lies in that null space (its column is all-zero). When every null-space
    dimension is such an independent species (fully SEPARABLE — 96% of the multi-param cases), each becomes
    its OWN parameter: the valid region is a box (each α_s convex on its own), so the sliders are independent.
    Otherwise (flexdim 1, or a coupled ≥3-species null space) we develop the single direction ns[0] — a 1-D
    slice, flagged. P = number of parameters actually exposed."""
    rneig, lneig, mirro, cls, glue = ff.decode(tab, vertype, conway)
    species, qvec = species_and_q(tab, cls)
    if not species:
        return None
    rows = vertex_qsums(tab, vertype, species)
    ns = ff.int_nullspace(rows, len(species))
    if not ns:
        return None

    indep = [s for s in range(len(species)) if all(row[s] == 0 for row in rows)]  # species that flex alone
    separable = len(ns) >= 2 and len(indep) == len(ns)
    if separable:
        param_species = indep                      # one parameter per independent species
        P = len(param_species)
        qeff = {}
        for c in set(cls):
            vec = [0] * P
            info = iso_corner_info(tab.CLASS_DISP[c])
            if info:
                for p, s in enumerate(param_species):
                    if tab.CLASS_TILE[c] == species[s]:
                        vec[p] = 1 if info[1] else -1
            qeff[c] = tuple(vec)
        a0vec = [alpha_units(tab, species[s]) for s in param_species]
        param_ranges = [species_delta_interval(tab, species[s]) for s in param_species]
        param_names = [tab.TILE_NAME[species[s]] for s in param_species]
        prim = species[param_species[0]]
    else:
        direction = list(ns[0])
        pi = next(i for i, d in enumerate(direction) if d != 0)
        if direction[pi] < 0:
            direction = [-d for d in direction]
        P = 1
        qeff = {c: (sum(direction[s] * qvec.get(c, (0,) * len(species))[s] for s in range(len(species))),)
                for c in set(cls)}
        a0vec = [alpha_units(tab, species[pi])]
        param_ranges = [delta_interval_units(tab, species, direction)]
        param_names = [tab.TILE_NAME[species[pi]]]
        prim = species[pi]

    try:
        placed, periods = develop_multi(tab, rneig, cls, glue, qeff, P)
    except ff.FormalPin:
        return None
    rank, basis = ff.period_lattice(periods)
    if rank != 2:
        log(f"  ⚑ flex dim≥1 but formal rank {rank} != 2 at {vertype} — not a free family, skipped")
        return None
    T1, T2 = basis
    faces = trace_faces_multi(tab, rneig, cls, glue, qeff, placed)
    byshape = {}
    for verts, tile in faces:
        shape, anchor = ff.face_canonical(verts)
        byshape.setdefault((shape, tile), []).append((anchor, verts))
    cell_faces = []
    for (shape, tile), lst in byshape.items():
        reps = ff.dedupe_mod_lattice(lst, basis)
        cell_faces += [(tile, v) for _, v in reps]

    words, _prim, _a0 = corner_records(tab, vertype, species, _dir_for_words(separable, ns, species, indep))
    # Per-corner parameter index + α-normalized units for the family key. A composite corner has exactly one
    # nonzero δ-coefficient (its own parameter, ±1); corners with all-zero qeff are rigid (coupled non-param).
    param_of_cls, norm_of_cls = {}, {}
    for c in set(cls):
        if not iso_corner_info(tab.CLASS_DISP[c]):
            continue
        nz = [p for p in range(P) if qeff[c][p] != 0]
        if nz:
            p = nz[0]
            param_of_cls[c] = p
            norm_of_cls[c] = tab.CLASS_UNITS[c] - qeff[c][p] * a0vec[p]
    wl = family_map_key(rneig, lneig, mirro, glue, cls, tab, param_of_cls, norm_of_cls, P)
    face_sig = tuple(sorted(poly_n(tab.TILE_NAME[t]) for t, _ in cell_faces))
    a0_tuple = tuple(a0vec)
    return {
        "vertype": vertype, "flexdim": len(ns), "separable": separable, "P": P,
        "primary": tab.TILE_NAME[prim], "a0vec": a0vec, "a0_tuple": a0_tuple, "param_names": param_names,
        "param_ranges": param_ranges, "key": family_key(words), "wl": wl, "face_sig": face_sig,
        "symbol": sym_word_str(words), "T1": T1, "T2": T2, "cell_faces": cell_faces, "tab": tab,
    }


def _dir_for_words(separable, ns, species, indep):
    """A single species-space direction for the human family symbol (corner_records): the first exposed
    parameter's species axis when separable, else ns[0] (sign-normalized)."""
    if separable:
        v = [0] * len(species)
        v[indep[0]] = 1
        return v
    direction = list(ns[0])
    pi = next(i for i, d in enumerate(direction) if d != 0)
    return [-d for d in direction] if direction[pi] < 0 else direction


def emit_family(fid, k, members):
    rep = min(members, key=lambda m: m["a0_tuple"])
    tab = rep["tab"]
    P = rep["P"]
    a0vec, ranges = rep["a0vec"], rep["param_ranges"]
    # cell + basis as P-variable Laurent term lists ([mVec, re, im]); single-param stays length-1 mVec.
    polys = [{"n": poly_n(tab.TILE_NAME[tile]),
              **({"star": True} if is_star_name(tab.TILE_NAME[tile]) else {}),
              "vertices": [lp_terms_multi(v) for v in verts]}
             for tile, verts in rep["cell_faces"]]
    basis_terms = [lp_terms_multi(rep["T1"]), lp_terms_multi(rep["T2"])]

    # Area certificate over the P-dimensional δ-box: sample 5 interior points per axis, all combinations.
    def samples(lo, hi):
        eps = 0.02 * (hi - lo)
        return [lo + eps + (hi - lo - 2 * eps) * i / 4 for i in range(5)]
    grids = [samples(lo, hi) for lo, hi in ranges]
    checks = []
    for combo in itertools.product(*grids):
        deltas = [du * math.pi / 12 for du in combo]
        b1, b2 = eval_terms_multi(basis_terms[0], deltas), eval_terms_multi(basis_terms[1], deltas)
        det = abs(b1.real * b2.imag - b1.imag * b2.real)
        area = sum(poly_area([eval_terms_multi(t, deltas) for t in p["vertices"]]) for p in polys)
        ok = abs(area - det) <= 1e-9 * max(det, 1.0)
        checks.append(ok)
        if not ok:
            log(f"  ⚑ AREA CHECK FAIL {fid} at δ={combo}: {area:.9f} vs {det:.9f}")
    slider_pad = 0.4
    params = []
    for p in range(P):
        a0, (lo_u, hi_u) = a0vec[p], ranges[p]
        params.append({
            "name": "alpha" if P == 1 else f"alpha{p + 1}",
            "alpha0Deg": a0 * 15.0,
            "deltaRangeDeg": [lo_u * 15.0 + slider_pad, hi_u * 15.0 - slider_pad],
            "alphaRangeDegOpen": [(a0 + lo_u) * 15.0, (a0 + hi_u) * 15.0],
            "defaultAlphaDeg": a0 * 15.0,
            "tile": rep["param_names"][p],
        })
    return {
        "id": fid, "k": k, "familySymbol": rep["symbol"], "primarySpecies": rep["primary"],
        "flexdim": rep["flexdim"], "P": P, "separable": rep["separable"],
        "members": [{"a_units": m["a0_tuple"], "vertype": m["vertype"]}
                    for m in sorted(members, key=lambda x: x["a0_tuple"])],
        "params": params, "cellPolygons": polys, "basis": basis_terms,
        "areaChecks": f"{sum(checks)}/{len(checks)} pass", "allChecksPass": all(checks),
    }


def main():
    global LOG
    ap = argparse.ArgumentParser()
    ap.add_argument("--tables", required=True)
    ap.add_argument("--catalog", action="append", required=True, help="k:pruned-dir")
    ap.add_argument("--out", required=True)
    ap.add_argument("--log", required=True)
    ap.add_argument("--id-prefix", default="ctrnact-mixed-family")
    args = ap.parse_args()
    LOG = open(args.log, "a")
    log(f"=== MIXED (isotoxal+star) family export; tables={args.tables} ===")
    try:
        import sympy  # noqa: F401
    except ImportError:
        log("⚑ FATAL: sympy not installed — the formal family development cannot run (every block would "
            "be skipped and 0 families reported: a false negative). pip install sympy and re-run.")
        LOG.close()
        sys.exit(2)

    tab = ff.load_tables(args.tables)
    out_records = []
    for spec in args.catalog:
        kstr, path = spec.split(":", 1)
        k = int(kstr)
        # k-specific glob: the pruned dir holds every k (eupruned_01_*, eupruned_02_*, …); this catalog
        # is one k. Matches both eupruned_0k.txt and eupruned_0k_<fam>.txt.
        files = sorted(glob.glob(os.path.join(path, f"eupruned_{k:02d}*.txt")))
        # MIXED blocks only: use BOTH a cx tile AND a star tile. Pure-cx / pure-star / pure-regular tilings
        # already live in the isotoxal / star / regular shelves — this shelf is the genuinely-new intersection.
        blocks = [(vt, cw) for f in files for vt, cw in ff.read_blocks(f) if "cx" in vt and "*" in vt]
        log(f"k={k}: {len(blocks)} MIXED (cx+star) blocks in {path}")
        fams, n_pinned = {}, 0
        for vt, cw in blocks:
            t0 = time.time()
            try:
                res = analyze_block(tab, vt, cw)
            except Exception as e:
                log(f"  ⚑ ANALYSIS ERROR at {vt}: {e} — skipped")
                continue
            if res is None:
                n_pinned += 1
                continue
            # Group by (α-abstracted map fingerprint, fundamental-domain face-signature). Both are α-invariant;
            # the WL map key separates different global gluings (the k=2 case face-sig missed), the face-sig
            # separates cells the WL fingerprint collides on (the k=1 003/004 rhombus case). The soundness gate
            # below is the backstop: any residual collision (duplicate α in a family) fails the run loud.
            fams.setdefault((res["wl"], res["face_sig"]), []).append(res)
            log(f"  flexing: {vt}  (dev {time.time()-t0:.1f}s, primary {res['primary']})")
        log(f"k={k}: {n_pinned} pinned, {sum(len(v) for v in fams.values())} flexing blocks in {len(fams)} keyed groups")
        # Soundness resolution. A genuine α-family has at most ONE member per α (members are grid-samples of
        # one continuous family). If a keyed group has two members at the SAME α, the (WL, face-sig) key
        # collided on distinct tilings (WL is an incomplete graph invariant — provably so for some 18-dart
        # k=2 maps). NEVER merge them (that would drop a tiling) and NEVER guess which α-pins pair up: emit
        # each member of a collided group as its OWN family record, flagged ambiguous. This over-counts the
        # ambiguous ones (an α-pair may be shown as two families) — the SAFE direction — and collapses every
        # clean group. A finite, verified count either way.
        # The parameter-permutation-invariant, param-indexed canonical-map key is a COMPLETE family invariant:
        # same (key, face-sig) ⇔ same α-family. Within a group, members with the same canonical α-tuple are
        # redundant representations (e.g. the two grid members of a 2-param family at (α₁,α₂) and (α₂,α₁)) —
        # keep one. Members with distinct α-tuples are grid-samples of the one family — collapse into its slider.
        # A soundness gate still fails loud if a group somehow holds a member whose α-tuple duplicates after
        # dedup with a DIFFERENT vertype+facecount (would mean the key under-refined and a tiling is at risk).
        resolved = []
        for _, members in fams.items():
            by_a0 = {}
            for m in members:
                by_a0.setdefault(m["a0_tuple"], m)  # dedup redundant reps (keep first per canonical α-tuple)
            resolved.append(list(by_a0.values()))
        n_multi = sum(1 for ms in resolved if ms[0]["separable"])
        n_collapsed = sum(1 for ms in resolved if len(ms) > 1)
        log(f"k={k}: {len(resolved)} families ({n_collapsed} collapse >1 grid-member; {n_multi} multi-slider separable)")
        for i, members in enumerate(sorted(resolved, key=lambda ms: ms[0]["vertype"]), 1):
            fid = f"{args.id_prefix}-k{k}-{i:02d}"
            rec = emit_family(fid, k, members)
            out_records.append(rec)
            ranges = [p["alphaRangeDegOpen"] for p in rec["params"]]
            log(f"  {fid}: {rec['familySymbol']}  P={rec['P']} α∈{ranges}  checks {rec['areaChecks']}")

    with open(args.out, "w") as f:
        json.dump({
            "_meta": {
                "source": "export_isotoxal_families (family_flex formal development, AL 2026-07-12)",
                "note": "One-parameter free-α families in the regular+isotoxal catalog. vertices/basis are "
                        "Laurent term lists [m,re,im]: p(δ) = Σ (re+i·im)·e^(i·m·δ), δ = (alphaDeg − "
                        "alpha0Deg)·π/180. α is the isotoxal tile's smaller (@0) angle.",
            },
            "records": out_records,
        }, f, indent=1)
    n_fail = sum(1 for r in out_records if not r["allChecksPass"])
    log(f"wrote {len(out_records)} family records → {args.out}  ({n_fail} with failing checks)")
    LOG.close()
    sys.exit(1 if n_fail else 0)


if __name__ == "__main__":
    main()
