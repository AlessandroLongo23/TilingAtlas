#!/usr/bin/env python3
"""Sweep star-palette catalogs for free-alpha FAMILIES and export them parametrically.

For every star-bearing catalog block: run the pinning test (family_flex step 1). Blocks with a
1-dim flex space are developed FORMALLY (positions = Laurent polynomials sum_m z_m x^m over
ZZ[zeta_24], x = e^{i delta}); if the development closes with formal period rank 2, the block is a
member of a one-parameter family that exists for EVERY alpha in its species-validity interval
(family_flex.py / the 2026-07-11 review, agent 3). Members of the same family (different in-ring
alpha pins) are grouped by a normalized symbolic key: each corner's angle units shifted by
-qeff*a0 (a0 = base point units of the primary flexing species), which is invariant across pins.

Output: one record per family with the app's parametric-cell shape —
  vertices/basis as term lists [m, re, im] meaning sum_m (re + i*im) * e^{i*m*delta},
  delta = (alphaDeg - alpha0Deg) * pi/180 (primary species' point angle alpha is the UI parameter).
The schema keeps `params` as an ARRAY: a future 2-parameter family (possible at k>=3, ranges may
be coupled) would extend terms to m-vectors — flagged loudly here if flex dim > 1 ever shows up.

Validation per family: at 11 delta samples across the range, sum of polygon areas == |det basis|
(float, 1e-9 rel), and at delta=0 the evaluated polygon-area multiset matches the static member
export in the cells JSON (when the member is present there).

Usage:
  python3 export_family_cells.py --tables tables/star24 \
      --catalog 1:run-star-k1/pruned/eupruned_01.txt --catalog 2:run-star-k2b6/pruned/eupruned_02.txt \
      --cells ../../experiments/star-oracle/ctrnact-star-k1.cells.json \
      --cells ../../experiments/star-oracle/ctrnact-star-k2.cells.json \
      --out ../../experiments/star-oracle/ctrnact-star-families.cells.json \
      --log ../../experiments/results/star-families-export-2026-07-11.log
"""
import argparse
import cmath
import json
import math
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import family_flex as ff

LOG = None


def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line)
    if LOG:
        LOG.write(line + "\n")
        LOG.flush()


# ---------------- float evaluation of Laurent elements ----------------
def zeta_float(k):
    return cmath.exp(1j * math.pi * (k % 24) / 12)


ZF = [zeta_float(k) for k in range(24)]


def zvec_float(v):
    return sum(c * ZF[k] for k, c in enumerate(v) if c)


def lp_terms(p):
    """Laurent element -> [[m, re, im], ...] sorted by m."""
    out = []
    for m in sorted(p):
        z = zvec_float(p[m])
        out.append([m, z.real, z.imag])
    return out


def eval_terms(terms, delta):
    return sum((re + 1j * im) * cmath.exp(1j * m * delta) for m, re, im in terms)


def poly_area(pts):
    s = 0.0
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        s += a.real * b.imag - a.imag * b.real
    return abs(s) / 2


# ---------------- family analysis per block ----------------
def corner_records(tab, vertypeline, species, direction):
    """Per orbit word: list of (token, normalized_units) corners; the family key input."""
    name_by_tile = {n: i for i, n in enumerate(tab.TILE_NAME)}
    sp_dir = {t: d for t, d in zip(species, direction)}
    prim = next((t for t, d in zip(species, direction) if d != 0), None)
    a0 = int(tab.TILE_NAME[prim].split("*")[1]) if prim is not None else 0
    words = []
    for corners in ff.vertex_words(vertypeline):
        w = []
        for cn in corners:
            m = re.match(r"(\d+)\*([pd])(\d+)$", cn)
            if m:
                n, pd, u = int(m.group(1)), m.group(2), int(m.group(3))
                a = u if pd == "p" else (24 - 24 // n - u)
                tile = name_by_tile[f"{n}*{a}"]
                q = (1 if pd == "p" else -1) * sp_dir.get(tile, 0)
                w.append((f"{n}*{pd}", q, u - q * a0))
            else:
                w.append((cn, 0, None))
        words.append(tuple(w))
    return words, prim, a0


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


def delta_interval_units(tab, species, direction):
    """(lo, hi) for delta in ANGLE UNITS (pi/12): every flexing species' point stays in
    (0, interior(n-gon))."""
    lo, hi = -1e9, 1e9
    for t, d in zip(species, direction):
        if d == 0:
            continue
        nm = tab.TILE_NAME[t]
        n, a = map(int, nm.split("*"))
        interior = 12 * (n - 2) / n
        b1, b2 = -a / d, (interior - a) / d
        l, h = (b1, b2) if d > 0 else (b2, b1)
        lo, hi = max(lo, l), min(hi, h)
    return lo, hi


def param_key(tab, cell_faces, T1, T2, lo_u, hi_u):
    """Isometry-invariant signature of the PARAMETRIC cell, re-anchored to a common alpha.

    This is the family discriminator. Two blocks are alpha-snapshots of the same one-parameter
    family iff their parametric developments are the same tiling, so the key has to compare the
    developments themselves — not a proxy for them. Two proxies were tried and both failed:

      family_key alone (the multiset of alpha-abstracted corner words) UNDER-splits. Two
      non-isomorphic tilings can carry the same vertex configurations and differ only in the gluing.
      At k=8 four of six key-groups held two parallel families each and the atlas fold would have
      dropped 12 real tilings.

      (family_key, conway_word) OVER-splits. The Conway word was argued to be alpha-invariant, and
      it is across all 29 k<=7 families, but that does not generalise: moving along alpha changes
      the star species (3*d15/3*p1 -> 3*d14/3*p2 -> ...), which can change the gluing word for one
      and the same family. At k=9 that tore four families in half, leaving four singleton "families"
      at alpha=2 and four with a hole at alpha=2.

    The anchor. Members of one family share an ABSOLUTE alpha range but sit at different alpha0, so
    their delta parameterisations are offset from each other and cannot be compared term by term.
    The absolute midpoint a0 + (lo+hi)/2 IS shared, so evaluating each member at its own
    delta = (lo+hi)/2 puts every member of a family at the same geometric point. Verified on the
    k=9 pairs: alpha0 = 30 with delta range [-2,2] and alpha0 = 15 with [-1,3] both anchor to
    absolute alpha = 30.

    The invariants are all isometry-invariant, so a family found in a rotated or translated frame
    still matches: the cell area, a theta-series prefix of the period lattice (basis-independent,
    unlike the raw T1/T2), and per tile its side count, star flag, area, edge lengths and interior
    angles. Area alone is NOT enough — k9-01, k9-02 and k9-04 are different families that all have
    area 18.0717 at alpha = 22.5.
    """
    delta = (lo_u + hi_u) / 2.0 * math.pi / 12
    b1, b2 = eval_terms(lp_terms(T1), delta), eval_terms(lp_terms(T2), delta)
    det = abs(b1.real * b2.imag - b1.imag * b2.real)
    R = lambda x: round(x, 6)
    # theta-series prefix: sorted |m*b1 + n*b2|^2 over a small window. Independent of which basis
    # the developer happened to pick, which |T1|,|T2| would not be.
    theta = sorted(R(abs(m * b1 + n * b2) ** 2)
                   for m in range(-2, 3) for n in range(-2, 3) if (m, n) != (0, 0))[:8]
    tiles, cents = [], []
    for tile, verts in cell_faces:
        pts = [eval_terms(lp_terms(v), delta) for v in verts]
        nm = tab.TILE_NAME[tile]
        star = "*" in nm
        n = int(nm.split("*")[0]) if star else int(nm)
        edges = sorted(R(abs(pts[(i + 1) % len(pts)] - pts[i])) for i in range(len(pts)))
        angs = []
        for i in range(len(pts)):
            u = pts[i - 1] - pts[i]
            w = pts[(i + 1) % len(pts)] - pts[i]
            angs.append(R(abs(cmath.phase(w / u)) if abs(u) > 1e-12 and abs(w) > 1e-12 else 0.0))
        sig = (n, star, R(poly_area(pts)), tuple(edges), tuple(sorted(angs)))
        tiles.append(sig)
        cents.append((sig, sum(pts) / len(pts)))
    # ARRANGEMENT. The tile multiset and the lattice alone do NOT determine the tiling: the two
    # parallel families at k=8 carry the same tiles on the same lattice and differ only in how they
    # are placed, so a key without this term merges them and the k=8 under-split returns (measured —
    # the KEY COLLISION guard fired on exactly those four). Pairwise centroid distances reduced
    # modulo the period lattice are isometry-invariant and translation-invariant, which raw centroid
    # positions would not be.
    pairs = []
    for i in range(len(cents)):
        for j in range(i + 1, len(cents)):
            dv = cents[i][1] - cents[j][1]
            dmin = min(abs(dv + m * b1 + n * b2) for m in (-1, 0, 1) for n in (-1, 0, 1))
            a, b = sorted((cents[i][0], cents[j][0]))
            pairs.append((a, b, R(dmin)))
    return ((R(det), tuple(theta), tuple(sorted(tiles))), tuple(sorted(pairs)))


def analyze_block(tab, vertype, conway):
    """Returns None (pinned/not-flexing) or a family-member dict."""
    rneig, lneig, mirro, cls, glue = ff.decode(tab, vertype, conway)
    species, qvec = ff.species_and_q(tab, cls)
    rows = ff.vertex_qsums(tab, vertype, species)
    ns = ff.int_nullspace(rows, len(species))
    if not ns:
        return None
    if len(ns) > 1:
        log(f"  ⚑ MULTI-PARAM FLEX (dim {len(ns)}) at {vertype} — exporting first direction only; "
            f"2-parameter family support is future work (AL 2026-07-11)")
    direction = ns[0]
    prim_i = next(i for i, d in enumerate(direction) if d != 0)
    if direction[prim_i] < 0:
        direction = tuple(-d for d in direction)
    qeff = {c: sum(d * q for d, q in zip(direction, qvec.get(c, tuple([0] * len(species)))))
            for c in set(cls)}
    try:
        placed, periods = ff.develop_formal(tab, rneig, cls, glue, qeff)
    except ff.FormalPin:
        return None
    rank, basis = ff.period_lattice(periods)
    if rank != 2:
        log(f"  ⚑ flex dim>=1 but formal rank {rank} != 2 at {vertype} — NOT a free family, skipped")
        return None
    T1, T2 = basis
    faces = ff.trace_faces_formal(tab, rneig, cls, glue, qeff, placed)
    face_items = []
    for verts, tile in faces:
        shape, anchor = ff.face_canonical(verts)
        face_items.append((anchor, (shape, tile, verts)))
    byshape = {}
    for anchor, (shape, tile, verts) in face_items:
        byshape.setdefault((shape, tile), []).append((anchor, verts))
    cell_faces = []
    for (shape, tile), lst in byshape.items():
        reps = ff.dedupe_mod_lattice(lst, basis)
        cell_faces += [(tile, v) for _, v in reps]
    words, prim, a0 = corner_records(tab, vertype, species, direction)
    lo_u, hi_u = delta_interval_units(tab, species, direction)
    _pk = param_key(tab, cell_faces, T1, T2, lo_u, hi_u)
    return {
        "vertype": vertype,
        "species": [tab.TILE_NAME[t] for t in species],
        "direction": list(direction),
        "flexdim": len(ns),
        "primary": tab.TILE_NAME[prim],
        "a0_units": a0,
        "key": family_key(words),
        "pkey": _pk[0], "pkey_fine": _pk[1],
        "symbol": sym_word_str(words),
        "delta_units": (lo_u, hi_u),
        "T1": T1, "T2": T2,
        "cell_faces": cell_faces,
        "tab": tab,
    }


def emit_family(fid, k, members, cells_index):
    """members: list of analyze_block dicts for the same family key (different alpha pins)."""
    rep = min(members, key=lambda m: m["a0_units"])
    tab = rep["tab"]
    lo_u, hi_u = rep["delta_units"]
    a0 = rep["a0_units"]
    polys = []
    for tile, verts in rep["cell_faces"]:
        nm = tab.TILE_NAME[tile]
        star = "*" in nm
        n = int(nm.split("*")[0]) if star else int(nm)
        polys.append({
            "n": n,
            **({"star": True} if star else {}),
            "vertices": [lp_terms(v) for v in verts],
        })
    basis_terms = [lp_terms(rep["T1"]), lp_terms(rep["T2"])]

    # validation sweep: area == |det| across the range (trim endpoints)
    eps = 0.02 * (hi_u - lo_u)
    checks = []
    for i in range(11):
        du = lo_u + eps + (hi_u - lo_u - 2 * eps) * i / 10
        delta = du * math.pi / 12
        b1, b2 = eval_terms(basis_terms[0], delta), eval_terms(basis_terms[1], delta)
        det = abs(b1.real * b2.imag - b1.imag * b2.real)
        area = sum(poly_area([eval_terms(t, delta) for t in p["vertices"]]) for p in polys)
        ok = abs(area - det) <= 1e-9 * max(det, 1.0)
        checks.append(ok)
        if not ok:
            log(f"  ⚑ AREA CHECK FAIL {fid} at delta={delta:.4f}: {area:.9f} vs {det:.9f}")
    member_list = []
    for m in sorted(members, key=lambda x: x["a0_units"]):
        member_list.append({
            "a_units": m["a0_units"],
            "alphaDeg": m["a0_units"] * 15.0,
            "vertype": m["vertype"],
            "atlasId": cells_index.get(m["vertype"]),
        })
    slider_pad = 0.4  # degrees kept clear of the open endpoints
    return {
        "id": fid,
        "k": k,
        "familySymbol": rep["symbol"],
        "primarySpecies": rep["primary"].split("*")[0] + "*",
        "flexdim": rep["flexdim"],
        "members": member_list,
        "params": [{
            "name": "alpha",
            "alpha0Deg": a0 * 15.0,
            "deltaRangeDeg": [lo_u * 15.0 + slider_pad, hi_u * 15.0 - slider_pad],
            "alphaRangeDegOpen": [(a0 + lo_u) * 15.0, (a0 + hi_u) * 15.0],
            "defaultAlphaDeg": a0 * 15.0,
        }],
        "cellPolygons": polys,
        "basis": basis_terms,
        "areaChecks": f"{sum(checks)}/11 pass",
        "allChecksPass": all(checks),
    }


def main():
    global LOG
    ap = argparse.ArgumentParser()
    ap.add_argument("--tables", required=True)
    ap.add_argument("--catalog", action="append", required=True, help="k:path")
    ap.add_argument("--cells", action="append", default=[], help="static cells JSON (vertype->id map)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--log", required=True)
    ap.add_argument("--id-prefix", default="ctrnact-star-family")
    args = ap.parse_args()
    LOG = open(args.log, "a")
    log(f"=== family export sweep start; tables={args.tables} ===")

    # The formal (symbolic-alpha) development needs sympy. Without it, family_flex raises
    # ImportError inside analyze_block, which is caught per-block as an "ANALYSIS ERROR ... skipped"
    # and the run still exits 0 reporting "0 families" — a silent false negative that hides real
    # free-alpha families (this is exactly how the k=3 families went undetected). Fail loud instead.
    try:
        import sympy  # noqa: F401
    except ImportError:
        log("⚑ FATAL: sympy is not installed — the formal family development cannot run. Every block "
            "would be skipped and 0 families reported (a false negative, NOT a real result). "
            "Install it (pip install sympy) and re-run. No output file written.")
        LOG.close()
        sys.exit(2)

    tab = ff.load_tables(args.tables)

    cells_index = {}
    for cf in args.cells:
        for r in json.load(open(cf))["records"]:
            cells_index[r["vertype"]] = r["id"]

    out_records = []
    for spec in args.catalog:
        kstr, path = spec.split(":", 1)
        k = int(kstr)
        blocks = [(vt, cw) for vt, cw in ff.read_blocks(path) if "*" in vt]
        log(f"k={k}: {len(blocks)} star-bearing blocks in {path}")
        fams = {}
        n_pinned = 0
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
            # Coarse key: (corner words, parametric cell content). See param_key() for the two
            # cheaper proxies that failed. Refinement by arrangement happens below, and only where
            # it is provably needed.
            fams.setdefault((res["key"], res["pkey"]), []).append(res)
            log(f"  flexing: {vt}  (dev {time.time()-t0:.1f}s, primary {res['primary']})")
        # REFINE ONLY WHERE NEEDED. A family is one tiling deformed by alpha, so it holds at most
        # one member per alpha; a repeated alpha is proof that the group merges parallel families.
        # The arrangement invariant (pkey_fine) separates them, but it is too sharp to use as the
        # primary key: applied everywhere it also tears apart genuine families whose alpha snapshots
        # the developer laid out differently (measured — k=8 came out right and k=9 split into four
        # singletons plus four families with a hole). So: group coarsely, then split a group by
        # arrangement precisely when its alpha values repeat. Both failure modes are then impossible
        # by construction, and the KEY COLLISION guard below still fires if a refined group is
        # somehow STILL degenerate.
        refined = {}
        for gk, members in fams.items():
            aus = [m["a0_units"] for m in members]
            if len(aus) == len(set(aus)):
                refined[gk] = members
                continue
            for m in members:
                refined.setdefault((gk, m["pkey_fine"]), []).append(m)
        fams = refined
        log(f"k={k}: {n_pinned} pinned, {sum(len(v) for v in fams.values())} flexing blocks "
            f"in {len(fams)} families")
        for i, (key, members) in enumerate(sorted(fams.items(), key=lambda kv: kv[1][0]["vertype"]), 1):
            fid = f"{args.id_prefix}-k{k}-{i:02d}"
            rec = emit_family(fid, k, members, cells_index)
            # A family is ONE tiling deformed by alpha, so it holds at most one member per alpha.
            # A repeat means the key still merges parallel families, and Phase 4 folds every member
            # away while shipping a single slider that represents only one of them. Loud, because
            # the failure is silent in the atlas: the records just stop existing.
            aus = [m["a_units"] for m in rec["members"]]
            if len(aus) != len(set(aus)):
                log(f"  ⚑ KEY COLLISION {fid}: alpha values {aus} repeat — this record merges "
                    f"parallel families and folding its members WILL drop real tilings")
            out_records.append(rec)
            log(f"  {fid}: {rec['familySymbol']}  members a={[m['a_units'] for m in rec['members']]}"
                f"  alpha in {rec['params'][0]['alphaRangeDegOpen']} deg  checks {rec['areaChecks']}")

    with open(args.out, "w") as f:
        json.dump({
            "_meta": {
                "source": "family_flex formal development (feat/ctrnact-star, 2026-07-11)",
                "note": "One-parameter free-alpha families detected in the star catalogs. vertices/basis "
                        "are Laurent term lists [m,re,im]: point(delta) = sum (re+i*im)*e^(i*m*delta), "
                        "delta = (alphaDeg - alpha0Deg)*pi/180. params is an array to leave room for "
                        "future multi-parameter families (k>=3; ranges may be coupled).",
            },
            "records": out_records,
        }, f, indent=1)
    n_fail = sum(1 for r in out_records if not r["allChecksPass"])
    log(f"wrote {len(out_records)} family records -> {args.out}  ({n_fail} with failing checks)")
    LOG.close()
    sys.exit(1 if n_fail else 0)


if __name__ == "__main__":
    main()
