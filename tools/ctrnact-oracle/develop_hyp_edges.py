#!/usr/bin/env python3
"""Develop Marek Čtrnáct's HYPERBOLIC edge-system certificates (his `pt_edges_667.exe` family and its
siblings) into the atlas's Poincaré-disk records.

THE OBJECT. Exactly the freedraw object, moved to H²: a periodic subset of the edges of a hyperbolic
uniform tiling, with drawn edges modelled as DIGONS (A2, interior angle 0) inserted into the vertex
figure. The tiles are the regions that fall out when you merge base faces across UNDRAWN edges, so
they may be single faces, finite polyforms, or unbounded. `k` counts VERTEX orbits of the decorated
tiling (Marek's "Number of vertices"), the same convention his Euclidean edge solvers use.

WHY THIS FILE IS SHORT. The certificate format is grid-independent, so the two halves already exist:

  * front end — develop_freedraw.py's parser, VTable (the generated analogue of pruner.py's hardcoded
    label/rneig/mirro tables) and Block (the makeglue port). Imported, not copied.
  * back end  — develop_hyperbolic.py's SU(1,1) develop: a dart instance is (quotient dart h, frame
    G), rneig advances the frame by the interior angle, glue by the edge involution M(ℓ), and ℓ is
    FORCED by the base tiling's closure Σ α(pᵢ, ℓ) = 2π. Imported, not copied.

The bridge between them is three things, and nothing else:

  1. Rotation order of the site group. develop_freedraw computes it as 12 // (angle sum in 30° units),
     which is a Euclidean assumption — a heptagon has no rational angle in those units. Here it is
     2π / Σ α(listed), asserted to be an integer. (On 6.6.7 it is always 1, since the lone heptagon
     corner admits no nontrivial rotation, but the general form is what makes 3.7 / 8.3 free.)
  2. The angle per dart. VTable.step already holds the corner crossed stepping h → rneig[h]; fed
     radians instead of 30° units it drops straight into the hyperbolic develop.
  3. The digon needs no case at all: α(2, ℓ) = 2·asin(cos(π/2)/cosh(ℓ/2)) = 0, exactly as the
     Euclidean 180 − 360/n gave 0.

WHAT SHIPS. Darts, not baked geometry — matching public/hyperbolic-developed.json, because every
render path re-develops under the live view anyway (lib/render/hyperbolicDevelopClient.ts). The
drawn/undrawn bit is NOT shipped: it is recoverable from the polygon sizes as

    drawn[h]  ==  lvert[h] == 2 or lvert[rneig[h]] == 2

(h's edge is a digon side iff the corner on either side of it is a digon), and this file asserts that
identity on every certificate instead of trusting the derivation.

Usage:
    develop_hyp_edges.py <corpus-dir> --base 667 --out public/hyperbolic-edges/e667
    develop_hyp_edges.py <corpus-dir> --base 667 --ks 1,5,7,8,9 --out ... --report ...
    develop_hyp_edges.py --selftest
"""
import argparse
import glob
import json
import math
import os
import re
import sys
import time
from collections import Counter, defaultdict

import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

import develop_freedraw as fd
from develop_freedraw import DevelopError
from develop_hyperbolic import _heading, _pos, interior_angle, medge, rot, solve_edge_length

TWO_PI = 2 * math.pi
TOL = 1e-4      # position dedup grid (matches develop_hyperbolic.py / hyperbolicDevelopClient.ts)
ANGTOL = 1e-3   # heading dedup grid
_ID2 = np.eye(2, dtype=complex)

# The base tilings Marek has edge solvers for. `config` is the vertex figure of the UNDECORATED
# tiling; everything else (alphabet, forced ℓ, rotation orders) is derived from it, so adding
# `pt_triangles_edges_3_7.exe`'s corpus is one line here and no new logic.
BASES = {
    "667": {"config": [6, 6, 7], "label": "6.6.7", "solver": "pt_edges_667.exe"},
    "37": {"config": [3, 3, 3, 3, 3, 3, 3], "label": "3^7", "solver": "pt_triangles_edges_3_7.exe"},
    "38": {"config": [3] * 8, "label": "3^8", "solver": "pt_triangles_edges_3_8.exe"},
    "45": {"config": [4, 4, 4, 4, 4], "label": "4^5", "solver": "pt_squares_edges_4_5.exe"},
    "46": {"config": [4] * 6, "label": "4^6", "solver": "pt_squares_edges_4_6.exe"},
    "54": {"config": [5, 5, 5, 5], "label": "5^4", "solver": "pt_pentagons_edges_5_4.exe"},
    "55": {"config": [5] * 5, "label": "5^5", "solver": "pt_pentagons_edges_5_5.exe"},
    "64": {"config": [6, 6, 6, 6], "label": "6^4", "solver": "pt_hexagons_edges_6_4.exe"},
    "65": {"config": [6] * 5, "label": "6^5", "solver": "pt_hexagons_edges_6_5.exe"},
    "73": {"config": [7, 7, 7], "label": "7^3", "solver": "pt_heptagons_edges_7_3.exe"},
    "74": {"config": [7, 7, 7, 7], "label": "7^4", "solver": "pt_heptagons_edges_7_4.exe"},
    "83": {"config": [8, 8, 8], "label": "8^3", "solver": "pt_octagons_edges_8_3.exe"},
    "84": {"config": [8, 8, 8, 8], "label": "8^4", "solver": "pt_octagons_edges_8_4.exe"},
}

TILE_CAP = 400  # base faces per merged tile before we call it unbounded (see classify_tiles)


def alphabet(config):
    """{letter: interior angle at the forced ℓ} for the base tiling's faces plus the digon."""
    l = solve_edge_length(list(config))
    if l is None:
        raise DevelopError(f"config {config} is not hyperbolic (Euclidean angle sum ≤ 2π)")
    units = {"A2": interior_angle(2, l)}
    for n in sorted(set(config)):
        units[f"A{n}"] = interior_angle(n, l)
    return l, units


def tile_size(letter):
    """'A2' -> 2, 'A7' -> 7."""
    return int(letter[1:])


# ------------------------------------------------------------------ vertex tables (the bridge)
def vtable_variants_hyp(figure, tag, units):
    """develop_freedraw.vtable_variants with the 30°-unit arithmetic replaced by hyperbolic angles at
    the forced ℓ. Everything downstream (VTable, Block, glue) is untouched."""
    for c in figure:
        if c not in units:
            raise DevelopError(f"tile {c} not in the alphabet")
    s = sum(units[c] for c in figure)
    if s <= 1e-9:
        raise DevelopError(f"figure {figure} is all digons (zero angle sum)")
    rotf = TWO_PI / s
    rotn = round(rotf)
    if rotn < 1 or abs(rotf - rotn) > 1e-6:
        raise DevelopError(f"figure {figure} angle sum does not divide 2π (rot={rotf:.6f})")
    t = len(figure)
    m = re.fullmatch(r"(F|C\d+|A[a-z0-9]*|D\d+[a-z]?)(x\d+)?", tag or "F")
    if not m:
        raise DevelopError(f"unrecognised site tag {tag!r}")
    head = m.group(1)
    if head == "F" or head.startswith("C"):
        if head.startswith("C") and int(head[1:]) != rotn:
            raise DevelopError(f"tag {tag} order != rotation order {rotn}")
        return [fd.VTable(figure, units, chiral=True)]
    if head.startswith("D") and int(re.match(r"D(\d+)", head).group(1)) != 2 * rotn:
        raise DevelopError(f"tag {tag} order != 2 × rotation order {rotn}")
    axes = [a for a in range(t) if all(figure[s2] == figure[(a - s2 - 1) % t] for s2 in range(t))]
    if not axes:
        raise DevelopError(f"tag {tag} claims a mirror but figure {figure} admits none")
    return [fd.VTable(figure, units, chiral=False, axis=a) for a in axes]


def build_block(cert, units):
    """Every (figure, tag) table combination that survives glue construction. More than one only when
    a figure admits several mirror axes; the caller lets the develop decide."""
    variant_lists = [vtable_variants_hyp(t["figure"], t["tag"], units) for t in cert["types"]]
    combos = [[]]
    for vl in variant_lists:
        combos = [c + [v] for c in combos for v in vl]
    out, reasons = [], []
    for tables in combos:
        try:
            out.append(fd.Block(cert, tables, "hyp"))
        except DevelopError as e:
            reasons.append(str(e))
    return out, len(combos), reasons


# ------------------------------------------------------------------ develop (patch, for validation)
def develop_patch(block, l, boundR=0.86, guard=400000):
    """develop_hyperbolic.develop_patch with α read off block.step and the drawn bit carried onto
    edges. Returns (verts, edges{(u,v): drawn}, faces[ring of vertex ids])."""
    Med = medge(l)
    inst_id = {}
    H, Gs, VID, RN, GL = [], [], [], [], []
    vert_id, verts = {}, []

    def vid_of(G):
        z = _pos(G)
        key = (round(z.real / TOL), round(z.imag / TOL))
        if key not in vert_id:
            vert_id[key] = len(verts)
            verts.append((z.real, z.imag))
        return vert_id[key]

    def add_inst(h, G):
        z, th = _pos(G), _heading(G)
        key = (h, round(z.real / TOL), round(z.imag / TOL),
               round(math.cos(th) / ANGTOL), round(math.sin(th) / ANGTOL))
        if key in inst_id:
            return inst_id[key], False
        idx = len(H)
        inst_id[key] = idx
        H.append(h); Gs.append(G); VID.append(vid_of(G)); RN.append(-1); GL.append(-1)
        return idx, True

    seed, _ = add_inst(0, _ID2.copy())
    stack, pops = [seed], 0
    while stack:
        pops += 1
        if pops > guard:
            raise DevelopError("patch exceeded guard")
        idx = stack.pop()
        h, G = H[idx], Gs[idx]
        if abs(_pos(G)) > boundR:
            continue
        ridx, isnew = add_inst(block.rneig[h], G @ rot(block.step[h]))
        RN[idx] = ridx
        if isnew:
            stack.append(ridx)
        gidx, isnew = add_inst(block.glue[h], G @ Med)
        GL[idx] = gidx
        if isnew:
            stack.append(gidx)

    E = {}
    for i in range(len(H)):
        g = GL[i]
        if g >= 0 and VID[i] != VID[g]:
            key = (min(VID[i], VID[g]), max(VID[i], VID[g]))
            drawn = bool(block.drawn[H[i]])
            if E.get(key, drawn) != drawn:
                raise DevelopError("edge drawn flag disagrees across its two darts")
            E[key] = drawn

    F, seen = [], set()
    for start in range(len(H)):
        ring, idx, ok = [], start, False
        for _ in range(64):
            ring.append(VID[idx])
            r = RN[idx]
            nxt = GL[r] if r >= 0 else -1
            if nxt < 0:
                break
            idx = nxt
            if idx == start:
                ok = True
                break
        if not ok or len(ring) < 3:
            continue
        canon = min(tuple(ring[i:] + ring[:i]) for i in range(len(ring)))
        if canon in seen:
            continue
        seen.add(canon)
        F.append(ring)
    return verts, E, F


def hdist(u, v):
    num = abs(u - v) ** 2
    den = (1 - abs(u) ** 2) * (1 - abs(v) ** 2)
    return math.acosh(1 + 2 * num / den) if den > 1e-15 else 0.0


def check_patch(verts, E, F, l, tol=1e-3):
    """Every developed edge has length ℓ, every closed face is a regular polygon of edge ℓ, the patch
    is inside the disk. Same contract as develop_hyperbolic.check_patch."""
    V = [complex(x, y) for (x, y) in verts]
    if not E:
        return False, {"error": "no edges"}
    elens = [hdist(V[a], V[b]) for (a, b) in E]
    worst_face = 0.0
    for ring in F:
        for i in range(len(ring)):
            e = hdist(V[ring[i]], V[ring[(i + 1) % len(ring)]])
            worst_face = max(worst_face, abs(e - l))
    res = {
        "edgeErr": max(abs(e - l) for e in elens),
        "faceEdgeErr": worst_face,
        "inDisk": max(abs(z) for z in V) < 1.0,
        "verts": len(verts), "edges": len(E), "faces": len(F),
    }
    return res["edgeErr"] < tol and worst_face < tol and res["inDisk"], res


# ------------------------------------------------------------------ quotient faces + tile orbits
def quotient_faces(block):
    """Cycles of nxt(h) = glue[rneig[h]] — the faces of the quotient complex.

    The cycle is the face FOLDED by its own stabiliser, so it is generally SHORTER than the polygon:
    a hexagon all six of whose corners are one orbit closes after one step. What must hold is that
    the corner letter is constant along the cycle and the polygon's corner count is a multiple of the
    cycle length; `fold` is that ratio, and the developed face has `size` corners either way.

    Returns (face_of_dart, faces) with faces[f] = {darts, size, fold, letter}. A digon face (size 2)
    marks a drawn edge and is not a tile."""
    n = len(block.rneig)
    face_of = [-1] * n
    faces = []
    for h0 in range(n):
        if face_of[h0] != -1:
            continue
        fid = len(faces)
        darts, h = [], h0
        for _ in range(64):
            face_of[h] = fid
            darts.append(h)
            h = block.glue[block.rneig[h]]
            if h == h0:
                break
        else:
            raise DevelopError("quotient face walk did not close")
        faces.append({"darts": darts})
    for f in faces:
        letters = {block.tile[h] for h in f["darts"]}
        if len(letters) != 1:
            raise DevelopError("quotient face mixes corner letters")
        letter = letters.pop()
        size = tile_size(letter)
        if size % len(f["darts"]):
            raise DevelopError(f"{letter} face folds onto {len(f['darts'])} darts, which does not divide {size}")
        f["letter"] = letter
        f["size"] = size
        f["fold"] = size // len(f["darts"])
    return face_of, faces


def tile_orbits(block, face_of, faces):
    """Merge quotient faces across UNDRAWN edges: the tile orbits of the decorated tiling. Digon faces
    are excluded (they mark drawn edges, they are not tiles). Returns orbit id per face, -1 on digons.

    Face f's boundary edges are {rneig[h] : h in f.darts}; the face on the other side of edge e is the
    one containing lneig[glue[e]] as a member dart."""
    parent = list(range(len(faces)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    for fid, f in enumerate(faces):
        if f["size"] == 2:
            continue
        for h in f["darts"]:
            e = block.rneig[h]
            if block.drawn[e]:
                continue
            other = face_of[block.lneig[block.glue[e]]]
            if faces[other]["size"] == 2:
                raise DevelopError("undrawn edge borders a digon face")
            union(fid, other)
    roots = {}
    orbit = [-1] * len(faces)
    for fid, f in enumerate(faces):
        if f["size"] == 2:
            continue
        r = find(fid)
        if r not in roots:
            roots[r] = len(roots)
        orbit[fid] = roots[r]
    return orbit, len(roots)


def classify_tiles(block, l, face_of, faces, orbit, norbits, cap=TILE_CAP):
    """Develop each tile orbit far enough to decide whether the merged tile is FINITE, and if so how
    many base faces of which sizes it holds.

    A tile is the orbit of one quotient-face component under the deck group, so its size is the
    component size times the order of its holonomy subgroup. In H² that subgroup is finite exactly
    when it is elliptic-cyclic or trivial, which is not decidable from the quotient alone — so this
    floods the actual developed tile (face instances, frames in SU(1,1)) and reports `size = -1`
    when it passes `cap`. Finite tiles in this corpus are small (single digits to low tens), so the
    cap is a safety net, not a scope limit; every capped orbit is counted and reported.

    Not distinguished: an infinite tile that is a band around a geodesic (cyclic holonomy, the H²
    analogue of freedraw's `strip`) from one that is genuinely 2-dimensionally unbounded. Both come
    back as unbounded. Separating them needs the holonomy classification, not a bigger cap."""
    Med = medge(l)

    def fkey(h, G):
        z, th = _pos(G), _heading(G)
        return (h, round(z.real / TOL), round(z.imag / TOL),
                round(math.cos(th) / ANGTOL), round(math.sin(th) / ANGTOL))

    out = []
    for o in range(norbits):
        seed_face = next(f for f in range(len(faces)) if orbit[f] == o)
        h0 = faces[seed_face]["darts"][0]
        inst_face = set()       # face-instance keys already flooded
        census = Counter()
        stack = [(h0, _ID2.copy())]
        capped = False
        while stack:
            h, G = stack.pop()
            # Walk the DEVELOPED face from (h, G): the quotient cycle can fold onto fewer darts, so the
            # ring closes on the (dart, frame) pair returning, not on the dart alone.
            members, cur, Gc, start = [], h, G, fkey(h, G)
            for _ in range(64):
                members.append((cur, Gc))
                Gc = Gc @ rot(block.step[cur]) @ Med
                cur = block.glue[block.rneig[cur]]
                if fkey(cur, Gc) == start:
                    break
            else:
                raise DevelopError("tile face walk did not close")
            keys = [fkey(hi, Gi) for (hi, Gi) in members]
            if min(keys) in inst_face:
                continue
            inst_face.add(min(keys))
            census[len(members)] += 1
            if len(inst_face) > cap:
                capped = True
                break
            for (hi, Gi) in members:
                e = block.rneig[hi]
                if block.drawn[e]:
                    continue
                Ge = Gi @ rot(block.step[hi])
                m = block.lneig[block.glue[e]]
                stack.append((m, Ge @ Med @ rot(-block.step[m])))
        out.append({"size": -1 if capped else len(inst_face),
                    "census": {} if capped else {str(k): v for k, v in sorted(census.items())}})
    return out


# ------------------------------------------------------------------ record emission
def emit_darts(block, face_of, faces, orbit):
    """The shipped quotient structure. lvert is indexed so that the client's
    alpha(h) = interiorAngle(lvert[rneig[h]]) reproduces block.step[h] — i.e. lvert[j] is the polygon
    at the corner ARRIVED AT by j, not left by it. Getting this shift backwards silently rotates every
    developed tiling, so it is asserted below, not commented."""
    n = len(block.rneig)
    lvert = [0] * n
    for h in range(n):
        lvert[block.rneig[h]] = tile_size(block.tile[h])
    for h in range(n):
        if abs(interior_angle(lvert[block.rneig[h]], 1.0) - interior_angle(tile_size(block.tile[h]), 1.0)) > 1e-12:
            raise DevelopError("lvert indexing does not reproduce the per-dart angle")
        # the drawn bit must be recoverable from lvert alone (see the module docstring)
        derived = lvert[h] == 2 or lvert[block.rneig[h]] == 2
        if derived != bool(block.drawn[h]):
            raise DevelopError("drawn flag is not recoverable from lvert")
    tile_orbit = [-1] * n
    for h in range(n):
        tile_orbit[h] = orbit[face_of[h]]
    return {
        "rneig": [int(x) for x in block.rneig],
        "glue": [int(x) for x in block.glue],
        "lvert": lvert,
        "orbit": [int(x) for x in block.orbit_of],
        "tileOrbit": tile_orbit,
        "seed": 0,
    }


def develop_cert(cert, base, l, units, boundR=0.86, cap=TILE_CAP):
    """One certificate -> one record, or (None, reason)."""
    blocks, ncombo, reasons = build_block(cert, units)
    if not blocks:
        return None, "glue: " + "; ".join(sorted(set(reasons))[:2]), ncombo
    good = []
    for block in blocks:
        try:
            verts, E, F = develop_patch(block, l, boundR=boundR)
            ok, res = check_patch(verts, E, F, l)
            if not ok:
                reasons.append("patch not regular: %r" % res)
                continue
            face_of, faces = quotient_faces(block)
            orbit, norbits = tile_orbits(block, face_of, faces)
            tiles = classify_tiles(block, l, face_of, faces, orbit, norbits, cap=cap)
            darts = emit_darts(block, face_of, faces, orbit)
            good.append((block, res, faces, orbit, norbits, tiles, darts))
        except DevelopError as e:
            reasons.append(str(e))
    if not good:
        return None, "develop: " + "; ".join(sorted(set(reasons))[:2]), ncombo
    block, res, faces, orbit, norbits, tiles, darts = good[0]
    n_edges = len(block.rneig) // 2
    n_drawn = sum(1 for h in range(len(block.rneig)) if block.drawn[h]) // 2
    sizes = [t["size"] for t in tiles]
    rec = {
        "k": cert.get("k"),
        "base": base["id"],       # the stable id ("667"), which the sub-axis key + record ids use
        "config": base["label"],  # the display label ("6.6.7")
        "edge": l,
        "certified": False,  # routes /play + thumbnails to the 2D developed renderer, not per-pixel GL
        "tiles": res["faces"],
        "darts": darts,
        "stats": {
            "tileOrbits": norbits,
            "finite": sum(1 for s in sizes if s >= 0),
            "unbounded": sum(1 for s in sizes if s < 0),
            "sizes": sizes,  # base-face count per tile orbit, -1 = unbounded; drives the family label + facet
            "edgeOrbits": n_edges,
            "drawnEdgeOrbits": n_drawn,
        },
        "residual": {"edgeErr": res["edgeErr"], "faceEdgeErr": res["faceEdgeErr"]},
    }
    return rec, None, ncombo


# ------------------------------------------------------------------ driver
CERT_NAME = re.compile(r"^(?P<fam>.+)solver_(?P<k>\d+)_(?P<tok>[A-Z0-9]+)(?P<chir>_o)?_(?P<n>\d+)\.txt$")


def run(source, base_id, out_prefix, ks=None, report_path=None, limit=None, boundR=0.86, cap=TILE_CAP):
    base = {**BASES[base_id], "id": base_id}
    l, units = alphabet(base["config"])
    paths = sorted(glob.glob(os.path.join(source, "*.txt"))) if os.path.isdir(source) else [source]
    by_k = defaultdict(list)
    failures = Counter()
    fail_examples = {}
    multi = 0
    n_certs = 0
    t0 = time.time()
    for path in paths:
        m = CERT_NAME.match(os.path.basename(path))
        if not m:
            continue
        k = int(m.group("k"))
        if ks and k not in ks:
            continue
        chiral = bool(m.group("chir"))
        for cert in fd.parse_file(path):
            if limit and n_certs >= limit:
                break
            n_certs += 1
            if cert.get("k") != k:
                failures["certificate k disagrees with the file name"] += 1
                continue
            rec, err, ncombo = develop_cert(cert, base, l, units, boundR=boundR, cap=cap)
            if rec is None:
                failures[err.split(":")[0]] += 1
                fail_examples.setdefault(err.split(":")[0], err)
                continue
            if ncombo > 1:
                multi += 1
            rec["chiral"] = chiral
            by_k[k].append(rec)
        if limit and n_certs >= limit:
            break
    elapsed = time.time() - t0

    written = []
    for k in sorted(by_k):
        recs = by_k[k]
        for i, r in enumerate(recs, start=1):
            r["id"] = f"he{base_id}-{k}-{i:05d}"
            r["name"] = r["id"]
        if out_prefix:
            os.makedirs(os.path.dirname(out_prefix) or ".", exist_ok=True)
            path = f"{out_prefix}-k{k}.json"
            with open(path, "w") as fh:
                json.dump(recs, fh, separators=(",", ":"))
            written.append((path, len(recs), os.path.getsize(path)))

    lines = [f"hyperbolic edge-system develop — base {base['label']} ({base_id}), source {source}",
             f"forced edge length l = {l:.12f}",
             f"certificates in : {n_certs}",
             f"developed       : {sum(len(v) for v in by_k.values())}",
             f"failed          : {sum(failures.values())}",
             f"multi-variant   : {multi} (more than one mirror axis built a valid block)",
             f"wall            : {elapsed:.1f}s ({1000*elapsed/max(1,n_certs):.1f} ms/certificate)",
             ""]
    for reason, n in failures.most_common():
        lines.append(f"   {n:6d}  {reason}   e.g. {fail_examples.get(reason,'')[:100]}")
    lines.append("")
    lines.append(f"{'k':>4} {'tilings':>9} {'unbounded-tile solutions':>26} {'max finite tile':>16}")
    for k in sorted(by_k):
        recs = by_k[k]
        unb = sum(1 for r in recs if r["stats"]["unbounded"])
        mx = max((s for r in recs for s in r["stats"]["sizes"] if s >= 0), default=0)
        lines.append(f"{k:>4} {len(recs):>9} {unb:>26} {mx:>16}")
    for path, n, sz in written:
        lines.append(f"wrote {path}: {n} records, {sz/1e6:.2f} MB")
    report = "\n".join(lines) + "\n"
    if report_path:
        os.makedirs(os.path.dirname(report_path) or ".", exist_ok=True)
        open(report_path, "w").write(report)
    print(report)
    return by_k, failures


# ------------------------------------------------------------------ selftest
def _selftest():
    l, units = alphabet([6, 6, 7])
    assert abs(2 * units["A6"] + units["A7"] - TWO_PI) < 1e-12, "6.6.7 does not close at the solved l"
    assert units["A2"] == 0.0 or abs(units["A2"]) < 1e-15, "digon angle is not 0"
    # the rotation order of the full 6.6.7 corner cycle is 1 (the lone heptagon admits no rotation)
    tabs = vtable_variants_hyp(["A6", "A6", "A7"], "Ab", units)
    assert len(tabs) == 1 and tabs[0].t == 3, "6.6.7 vertex table"
    # a figure whose angle sum does not divide 2*pi must be refused, not silently accepted
    try:
        vtable_variants_hyp(["A6", "A7"], "F", units)
        raise AssertionError("accepted a figure that does not close")
    except DevelopError:
        pass
    print(f"[selftest] alphabet OK (l_667 = {l:.9f}, hex {math.degrees(units['A6']):.4f}deg, "
          f"hept {math.degrees(units['A7']):.4f}deg)")
    fixtures = os.environ.get("HYP667_FIXTURES")
    if fixtures and os.path.isdir(fixtures):
        base = {**BASES["667"], "id": "667"}
        cand = sorted(glob.glob(os.path.join(fixtures, "*solver_01_*.txt")))
        seen = 0
        for path in cand:
            for cert in fd.parse_file(path):
                rec, err, _ = develop_cert(cert, base, l, units)
                assert rec, f"k=1 certificate failed: {err}"
                assert rec["residual"]["edgeErr"] < 1e-6, rec["residual"]
                seen += 1
        assert seen == 3, f"expected the 3 k=1 solutions, saw {seen}"
        print(f"[selftest] developed all {seen} k=1 certificates")
    else:
        print("[selftest] (set HYP667_FIXTURES=<dir> to develop the k=1 certificates too)")
    print("[selftest] PASS")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", nargs="?", help="certificate directory (or a single .txt)")
    ap.add_argument("--base", default="667", choices=sorted(BASES))
    ap.add_argument("--out", help="output prefix; writes <prefix>-k<k>.json")
    ap.add_argument("--report")
    ap.add_argument("--ks", help="comma-separated k values to decode (default: all present)")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--boundR", type=float, default=0.86)
    ap.add_argument("--cap", type=int, default=TILE_CAP)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        _selftest()
        return
    if not args.source:
        ap.error("source is required unless --selftest")
    ks = set(int(x) for x in args.ks.split(",")) if args.ks else None
    run(args.source, args.base, args.out, ks, args.report, args.limit, args.boundR, args.cap)


if __name__ == "__main__":
    main()
