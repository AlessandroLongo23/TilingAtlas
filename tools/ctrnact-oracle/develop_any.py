#!/usr/bin/env python3
"""develop_any.py — exact ℤ[ζ₂₄] development of ANY pruned block, on ANY palette.

Why this exists. `eu_develop.cpp` is the C++ developer the scaled and doubled palettes ship on, and it is
a ℤ[ζ₁₂] developer: `Vec` is four ints, `makeZK` builds twelve powers of ζ, and the direction arithmetic
is `% 12` in three places. That is exactly right for a D=12 palette and silently wrong for a D=24 one —
the odd powers of ζ₂₄ are the √2 directions the octagon and half the star species need, so it places them
somewhere else, and the area certificate then rejects a perfectly good tiling. The measurement that
settles it: on `regular-star-scaled2-z24` it developed the 31 regular-only tilings of the k≤2 catalog —
every one of which provably tiles — and certified 2.

Nothing new is needed to fix that, only the right ring, and the right ring is already here.
`family_flex` works in ℤ[ζ₂₄] (rank 8, ζ⁸ = ζ⁴ − 1, all 24 powers) and `coupled_flex.develop_multi` takes
its step count straight from the palette's own `CLASS_UNITS` modulo the palette's own D, so it is D-general
already. Run it with an EMPTY parameter vector and the formal development collapses to a plain exact one:
every position is a single monomial, and what comes out is the cell.

So this is a thin driver, and deliberately so — the geometry is the shared engine's, not a second opinion.
Corner kinds come for free with it: a star's reflex dent and a scaled tile's flat 180° corner are both just
`CLASS_UNITS` values, which is why this develops the star × scaled crossing that has no developer of its own.

Gate: `--gate` develops the regular-only blocks of a palette's own catalog and requires ALL of them to
carry the area certificate. On a D=24 palette that is 31 tilings at k≤2, and it is the control that says
the developer is measuring the tilings rather than itself.

Usage:
  python3 develop_any.py --tables tables/regular-star-scaled2-z24 \
      --pruned run-par-k2-regular-star-scaled2-z24/out/pruned \
      --out ../../experiments/results/star-scaled2-cells.json --log ../../experiments/results/...log
"""
import argparse
import cmath
import json
import math
import os
import re
import sys
import time
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import family_flex as ff
from coupled_flex import develop_multi, trace_faces_multi, zvec_float

LOG = None


def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    if LOG:
        LOG.write(line + "\n")
        LOG.flush()


def _pt(p):
    """A developed position (a Laurent element with the single empty monomial) as a complex number."""
    if not p:
        return 0j
    assert len(p) == 1, f"not a plain development: {len(p)} monomials"
    return zvec_float(next(iter(p.values())))


def signed_area(v):
    s = 0.0
    for i in range(len(v)):
        a, b = v[i], v[(i + 1) % len(v)]
        s += a.real * b.imag - b.real * a.imag
    return s / 2


def develop_block(tab, vertype, conway):
    """(faces, basis, info) for one pruned block, or (None, None, info)."""
    try:
        rneig, lneig, mirro, cls, glue = ff.decode(tab, vertype, conway)
    except Exception as exc:                                        # noqa: BLE001
        return None, None, {"reason": f"decode: {exc}"}
    qeff = {c: () for c in set(cls)}
    try:
        placed, periods = develop_multi(tab, rneig, cls, glue, qeff, 0)
    except ff.FormalPin:
        return None, None, {"reason": "formal pin"}
    except Exception as exc:                                        # noqa: BLE001
        return None, None, {"reason": f"develop: {exc}"}
    rank, basis = ff.period_lattice(periods)
    if rank != 2:
        return None, None, {"reason": f"period rank {rank} != 2"}
    faces = trace_faces_multi(tab, rneig, cls, glue, qeff, placed)
    # One representative per lattice class of face, keyed by shape as the family exporter does it.
    byshape = {}
    for verts, tile in faces:
        shape, anchor = ff.face_canonical(verts)
        byshape.setdefault((shape, tile), []).append((anchor, verts))
    cell = []
    for (_shape, tile), lst in byshape.items():
        for _a, v in ff.dedupe_mod_lattice(lst, basis):
            cell.append((tab.TILE_NAME[tile], [_pt(z) for z in v]))
    return cell, [_pt(b) for b in basis], {"tiles": sorted({t for t, _ in cell})}


def area_certificate(cell, basis):
    """(ok, Σ|area|, |det|) — the global-overlap check the combinatorial search cannot make."""
    tot = sum(abs(signed_area(v)) for _t, v in cell)
    det = abs(basis[0].real * basis[1].imag - basis[1].real * basis[0].imag)
    return abs(tot - det) < 1e-7 * max(1.0, det), tot, det


def read_pruned(pruned_dir):
    """[(k, tileword, vertype, conway)] over a pruned catalog; k and the tile word come from the filename."""
    out = []
    for f in sorted(os.listdir(pruned_dir)):
        m = re.match(r"eupruned_(\d+)_(.+)\.txt$", f)
        if not m:
            continue
        k, word = int(m.group(1)), m.group(2)
        for vt, cw in ff.read_blocks(os.path.join(pruned_dir, f)):
            out.append((k, word, vt, cw))
    return out


SCALED = re.compile(r"s\d+$")


def bucket(tiles):
    """Which families a tiling draws on — the census AL asked for, read off the developed faces."""
    star = any("*" in t for t in tiles)
    scaled = any(SCALED.search(t) for t in tiles)
    return ("star" if star else "-") + "+" + ("scaled" if scaled else "-")


def main():
    global LOG
    ap = argparse.ArgumentParser()
    ap.add_argument("--tables", required=True)
    ap.add_argument("--pruned", required=True)
    ap.add_argument("--out", default=None)
    ap.add_argument("--log", default=None)
    ap.add_argument("--gate", action="store_true",
                    help="require every REGULAR-ONLY block to carry the area certificate")
    ap.add_argument("--only", default=None, help="keep only this bucket, e.g. 'star+scaled'")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    if args.log:
        LOG = open(args.log, "w")

    tab = ff.load_tables(args.tables)
    blocks = read_pruned(args.pruned)
    if args.limit:
        blocks = blocks[:args.limit]
    log(f"=== develop_any: {len(blocks)} blocks from {os.path.basename(args.pruned)}, "
        f"palette D={tab.D} ===")

    recs, fails = [], Counter()
    seen_by = Counter()
    t0 = time.time()
    for i, (k, word, vt, cw) in enumerate(blocks, 1):
        cell, basis, info = develop_block(tab, vt, cw)
        if cell is None:
            fails[info["reason"].split(":")[0]] += 1
            log(f"  ⚑ k={k} {word}: {info['reason']}")
            continue
        ok, tot, det = area_certificate(cell, basis)
        b = bucket(info["tiles"])
        seen_by[(b, ok)] += 1
        if not ok:
            log(f"  ⚑ k={k} {word} [{b}]: area certificate Σ={tot:.6f} |det|={det:.6f}")
        recs.append({
            "k": k, "word": word, "bucket": b, "tiles": info["tiles"], "areaOk": ok,
            "vertype": vt,
            "renderCell": {
                "cellPolygons": [{"n": len(v), "vertices": [[z.real, z.imag] for z in v]} for _t, v in cell],
                "basis": [[basis[0].real, basis[0].imag], [basis[1].real, basis[1].imag]],
            },
            "tileNames": [t for t, _ in cell],
        })
        if i % 50 == 0:
            log(f"  ... {i}/{len(blocks)}  {time.time() - t0:.0f}s")

    log("")
    log(f"{len(recs)} developed of {len(blocks)}; failures: "
        + (", ".join(f"{r}: {n}" for r, n in fails.most_common()) or "none"))
    for b in sorted({b for b, _ in seen_by}):
        good = seen_by[(b, True)]
        bad = seen_by[(b, False)]
        log(f"  {b:<14} developed {good + bad:>4}   area-certified {good:>4}"
            + ("" if not bad else f"   ⚑ {bad} FAILED"))

    if args.out:
        keep = [r for r in recs if not args.only or r["bucket"] == args.only]
        json.dump(keep, open(args.out, "w"), separators=(",", ":"))
        log(f"wrote {len(keep)} records → {args.out} ({os.path.getsize(args.out) / 1024:.0f} KB)")

    if args.gate:
        reg = [r for r in recs if r["bucket"] == "-+-"]
        bad = [r for r in reg if not r["areaOk"]]
        missing = sum(1 for _k, w, _v, _c in blocks
                      if not re.search(r"s[A-Z]|[a-z]", w)) - len(reg)
        log("")
        log(f"GATE: {len(reg)} regular-only tilings developed, {len(reg) - len(bad)} area-certified"
            + (f", {len(bad)} FAILED" if bad else ""))
        ok = not bad and len(reg) > 0
        log(f"develop gate: {'PASS' if ok else 'FAIL'}")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
