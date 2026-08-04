#!/usr/bin/env python3
"""Develop the SPHERICAL members of Marek Čtrnáct's 3.4.n.4 family (`ai1_3`, `ai1_4`, `ai1_5`) into the
atlas's three.js polyhedron records.

THE OBJECT. Exactly what develop_ai1.py develops in H², on the sphere instead: fix n, let ρ be the edge
ARC at which the vertex figure 3.4.n.4 closes, and enumerate the tilings by regular {3, 4, n, 2n}-gons
at that one ρ. The same two figures close there and no others — 3.4.n.4 (and its cyclic variant
3.4.4.n) and 4.n.2n — because the same identity holds, and holds on the sphere to 1e-15:

    α(3, ρ) + α(4, ρ) = α(2n, ρ)

n = 3, 4, 5 are the spherical members (ρ = π/3, 0.730980, 0.451667); n = 6 is Euclidean and n ≥ 7
hyperbolic, and both are refused here — develop_ai1.py owns the hyperbolic half.

WHY IT IS NOT A THIRD BASE IN develop_sph_edges.py. That file develops a DECORATION of one fixed board
and ships the board once per shard, because every pattern on it develops the same solid. Here the k > 1
records are DIFFERENT SOLIDS — a mix of 3.4.n.4 and 4.n.2n vertices makes a polyhedron that is neither
uniform nor the board — so each record carries its own geometry. At 20 certificates in the whole family
that costs ~40 kB, and sharing a board would be a lie.

WHAT SHIPS. The finished polyhedron: unit vertices, face rings, the edge list, and the POLYGON SIZE per
face. lib/render/sphPoly.ts groups faces by size and hands the result to buildIcoFreedraw, the same
three.js renderer the Platonic freedraw, the Schwarz spheres and the uniform-polyhedron edge systems
use — so one colour means one polygon size, matching the hyperbolic half of this family exactly, and
every edge is a real tile boundary (there are no digons in this alphabet, which is asserted).

A NOTE ON n = 3. At ρ = π/3 the hexagon's circumradius is exactly π/2: its six vertices lie on a GREAT
CIRCLE and its interior angle is π. That is a real face of these solids, not a decode failure — it is
a hemisphere bounded by six arcs — so the regularity check accepts a coplanar face and the report says
how many records carry one.

Usage:
    develop_ai1_sph.py <corpus-dir> --n 4 --out public/spherical-poly/sp4 --report ...
    develop_ai1_sph.py --selftest
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
from develop_hyp_edges import build_block, tile_size
from develop_sph_edges import (
    canon_ring,
    census_key,
    develop_sphere,
    dotted,
    interior_angle,
    solve_rho,
    symmetry_orbits,
    vertex_figures,
)

TWO_PI = 2 * math.pi
FAMILY_NS = [3, 4, 5]

# Solids this family produces that already have a name, keyed by (vertex-figure census, number of
# vertex orbits under the solid's OWN isometry group).
#
# The census alone is not enough, and this family contains the textbook counterexample: the
# rhombicuboctahedron and the pseudo-rhombicuboctahedron J37 both have V=24 E=48 F=26 and 3.4.4.4 at
# every single vertex. Nothing local separates them — only the global symmetry does, and it does so
# decisively: the rhombicuboctahedron is vertex-transitive (one orbit under a group of order 48), J37
# is not (two orbits, group order 16). That is why `symmetry_orbits` (imported from develop_sph_edges,
# which needs the same separation for its `edges_4443` corpus) measures the group off the developed
# geometry instead of trusting the certificate's own k. Anything not listed here ships with no `solid`
# and is labelled by its census, never guessed at.
KNOWN_SOLIDS = {
    ((((3, 4, 3, 4), 12),), 1): "cuboctahedron",
    ((((3, 4, 3, 4), 12),), 2): "triangular orthobicupola (J27)",
    ((((3, 4, 4, 4), 24),), 1): "rhombicuboctahedron",
    ((((3, 4, 4, 4), 24),), 2): "pseudo-rhombicuboctahedron (J37)",
    ((((3, 4, 5, 4), 60),), 1): "rhombicosidodecahedron",
    ((((4, 4, 6), 12),), 1): "hexagonal prism",
    ((((4, 4, 8), 16),), 1): "octagonal prism",
    ((((4, 4, 10), 20),), 1): "decagonal prism",
}

def board_of(n):
    """(ρ, {letter: angle}, alphabet sizes) for the spherical 3.4.n.4 board. Both closing figures are
    ASSERTED at the solved ρ, not assumed: if α(3)+α(4) = α(2n) ever failed, the 2n-gon would not
    belong in the alphabet and the corpus would be something else."""
    if n not in FAMILY_NS:
        raise DevelopError(f"3.4.{n}.4 is not spherical (n = {n}); n in {FAMILY_NS} only")
    rho = solve_rho([3, 4, n, 4])
    if rho is None:
        raise DevelopError(f"3.4.{n}.4 is not spherical")
    sizes = sorted({3, 4, n, 2 * n})
    units = {f"S{p}": interior_angle(p, rho) for p in sizes}
    close = units["S3"] + 2 * units["S4"] + units[f"S{n}"]
    if abs(close - TWO_PI) > 1e-9:
        raise DevelopError(f"3.4.{n}.4 does not close at the solved rho ({close})")
    omni = units["S4"] + units[f"S{n}"] + units[f"S{2 * n}"]
    if abs(omni - TWO_PI) > 1e-9:
        raise DevelopError(f"4.{n}.{2 * n} does not close at the same rho ({omni}) — alphabet is wrong")
    return rho, units, sizes


def complex_of(block, rho, sizes):
    """Develop the block on S² and read off the finished polyhedron: unit vertices, face rings, the
    polygon size per face, and the edge list. Both turn directions are tried; the one that closes to a
    sphere wins (chirality is not in the combinatorics)."""
    last = None
    for sign in (1, -1):
        try:
            verts, inst, rn, gl = develop_sphere(block, rho, sign=sign)
            return _emit(block, rho, sizes, verts, inst, rn, gl)
        except DevelopError as e:
            last = e
    raise last


def _emit(block, rho, sizes, verts, inst, rn, gl):
    faces, face_size, seen = [], [], set()
    for start in range(len(inst)):
        if start in seen:
            continue
        ring, members, idx, ok = [], [], start, False
        for _ in range(64):
            members.append(idx)
            ring.append(inst[idx][2])
            idx = gl[rn[idx]]
            if idx == start:
                ok = True
                break
        if not ok:
            raise DevelopError("developed face did not close")
        seen.update(members)
        # No digons in this alphabet: this is a TILING, not an edge system, so a 2-ring would mean the
        # certificate is not what the corpus claims.
        if len(ring) < 3:
            raise DevelopError(f"developed face has {len(ring)} corners — digon in a tiling certificate")
        faces.append(ring)
        face_size.append(tile_size(block.tile[inst[members[0]][0]]))

    edges = {}
    for i, (h, R, va) in enumerate(inst):
        vb = inst[gl[i]][2]
        if va == vb:
            continue
        edges[(min(va, vb), max(va, vb))] = True

    V, E, F = len(verts), len(edges), len(faces)
    if V - E + F != 2:
        raise DevelopError(f"Euler != 2 (V={V} E={E} F={F})")
    for p in face_size:
        if p not in sizes:
            raise DevelopError(f"developed a {p}-gon, which is not in the alphabet {sizes}")
    # Every developed side must measure ρ — the check that the one forced arc was applied, not assumed.
    for (a, b) in edges:
        d = math.acos(max(-1.0, min(1.0, float(np.dot(verts[a], verts[b])))))
        if abs(d - rho) > 1e-6:
            raise DevelopError(f"developed edge arc {d:.9f} != rho {rho:.9f}")
    # A ring must have as many corners as its letter says, so the face census cannot silently disagree
    # with the alphabet the angles were solved from.
    for ring, p in zip(faces, face_size):
        if len(ring) != p:
            raise DevelopError(f"a {p}-gon developed with {len(ring)} corners")

    vorbit = [-1] * V
    for (h, R, v) in inst:
        o = block.orbit_of[h]
        if vorbit[v] not in (-1, o):
            raise DevelopError("a vertex hosts two certificate orbits")
        vorbit[v] = o
    if -1 in vorbit:
        raise DevelopError("a developed vertex was never labelled")

    # Canonical vertex order (by rounded position) so two developments of one solid are written the
    # same way. Nothing downstream depends on it; it just makes the records comparable.
    order = sorted(range(V), key=lambda i: tuple(round(float(x), 7) for x in verts[i]))
    remap = {old: new for new, old in enumerate(order)}
    verts = [verts[i] for i in order]
    faces = [canon_ring([remap[v] for v in ring]) for ring in faces]
    edges = sorted((min(remap[a], remap[b]), max(remap[a], remap[b])) for (a, b) in edges)
    vorbit = [vorbit[order[i]] for i in range(V)]

    figs = vertex_figures(verts, faces)
    sym_orbit, order = symmetry_orbits(verts, faces)
    n_orbits = len(set(sym_orbit))
    return {
        "vertices": [[round(float(x), 9) for x in v] for v in verts],
        "faces": [list(map(int, r)) for r in faces],
        "faceSize": [int(p) for p in face_size],
        "edges": [[int(a), int(b)] for (a, b) in edges],
        "vorbit": [int(x) for x in vorbit],
        # Orbits under the SOLID's own symmetry group, not the certificate's presentation.
        "symOrbit": [int(x) for x in sym_orbit],
        "census": census_key(figs),
        "stats": {
            "verts": V, "edges": E, "faces": F,
            "symmetryOrder": order,
            "symmetryOrbits": n_orbits,
            "sizes": sizes,
            "sizeCensus": [sum(1 for p in face_size if p == q) for q in sizes],
            # Every vertex figure the solid carries, as dotted strings with their multiplicities —
            # what names a solid when it has no name, and what separates two with equal V/E/F.
            "figures": [[dotted(f), c] for f, c in census_key(figs)],
            # A face whose vertices lie on a great circle (n = 3's hexagon at rho = pi/3). Real, and
            # counted so the report can say how many records have one.
            "greatCircleFaces": sum(1 for ring, p in zip(faces, face_size)
                                    if abs(interior_angle(p, rho) - math.pi) < 1e-9),
        },
    }


def develop_cert(cert, n, rho, units, sizes):
    blocks, ncombo, reasons = build_block(cert, units)
    if not blocks:
        return None, "glue: " + "; ".join(sorted(set(reasons))[:2]), ncombo
    for block in blocks:
        try:
            cx = complex_of(block, rho, sizes)
        except DevelopError as e:
            reasons.append(str(e))
            continue
        figures = [".".join(str(tile_size(c)) for c in t["figure"]) for t in cert["types"]]
        cx["k"] = cert.get("k")
        cx["base"] = str(n)
        cx["family"] = f"3.4.{n}.4"
        cx["config"] = " + ".join(figures)
        cx["edge"] = rho
        cx["certK"] = cert.get("k")
        cx["stats"]["certOrbits"] = len(cert["types"])
        solid = KNOWN_SOLIDS.get((cx["census"], cx["stats"]["symmetryOrbits"]))
        if solid:
            cx["solid"] = solid
        del cx["census"]
        return cx, None, ncombo
    return None, "develop: " + "; ".join(sorted(set(reasons))[:2]), ncombo


# ------------------------------------------------------------------ driver
CERT_NAME = re.compile(r"^(?P<fam>.+)solver_(?P<k>\d+)_(?P<tok>[A-Za-z0-9]+?)(?P<chir>_o)?_(?P<n>\d+)\.txt$")


def run(source, n, out_prefix, ks=None, report_path=None):
    rho, units, sizes = board_of(n)
    paths = sorted(glob.glob(os.path.join(source, "*.txt"))) if os.path.isdir(source) else [source]
    by_k = defaultdict(list)
    failures, fail_examples = Counter(), {}
    multi = n_certs = 0
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
            n_certs += 1
            if cert.get("k") != k:
                failures["certificate k disagrees with the file name"] += 1
                continue
            rec, err, ncombo = develop_cert(cert, n, rho, units, sizes)
            if rec is None:
                key = err.split(":")[0]
                failures[key] += 1
                fail_examples.setdefault(key, err)
                continue
            if ncombo > 1:
                multi += 1
            rec["chiral"] = chiral
            by_k[k].append(rec)
    elapsed = time.time() - t0

    written = []
    for k in sorted(by_k):
        recs = by_k[k]
        for i, r in enumerate(recs, start=1):
            r["id"] = f"sp{n}-{k}-{i:05d}"
        if out_prefix:
            os.makedirs(os.path.dirname(out_prefix) or ".", exist_ok=True)
            path = f"{out_prefix}-k{k}.json"
            with open(path, "w") as fh:
                json.dump(recs, fh, separators=(",", ":"))
            written.append((path, len(recs), os.path.getsize(path)))

    lines = [f"3.4.{n}.4 SPHERICAL develop — tilings by regular {sizes} at one edge arc",
             f"source          : {source}",
             f"forced edge arc : rho = {rho:.12f}",
             "angles          : " + ", ".join(f"{p}-gon {math.degrees(units[f'S{p}']):.4f}deg" for p in sizes),
             f"certificates in : {n_certs}",
             f"developed       : {sum(len(v) for v in by_k.values())}",
             f"failed          : {sum(failures.values())}",
             f"multi-variant   : {multi}",
             f"wall            : {elapsed:.1f}s",
             ""]
    for reason, cnt in failures.most_common():
        lines.append(f"   {cnt:6d}  {reason}   e.g. {fail_examples.get(reason, '')[:110]}")
    lines.append("")
    lines.append(f"{'k':>4} {'id':>16}  {'V/E/F':>12} {'|G|':>4} {'orb':>3}  vertex figures")
    disagree = []
    for k in sorted(by_k):
        for r in by_k[k]:
            s = r["stats"]
            figs = "  ".join(f"{f}x{c}" for f, c in s["figures"])
            name = f'  [{r["solid"]}]' if "solid" in r else ""
            lines.append(f'{k:>4} {r["id"]:>16}  {s["verts"]}/{s["edges"]}/{s["faces"]:<6} '
                         f'{s["symmetryOrder"]:>4} {s["symmetryOrbits"]:>3}  {figs}{name}')
            if s["symmetryOrbits"] != r["certK"]:
                disagree.append((r["id"], r["certK"], s["symmetryOrbits"]))
    if disagree:
        lines.append("")
        lines.append("MEASURED ORBITS != CERTIFICATE k — the certificate is a sub-symmetry presentation "
                     "of a more symmetric solid, so the shelf uses the measured count:")
        for rid, ck, so in disagree:
            lines.append(f"   {rid}: certificate k={ck}, measured {so} orbit(s)")
    gc = sum(1 for v in by_k.values() for r in v if r["stats"]["greatCircleFaces"])
    if gc:
        lines.append("")
        lines.append(f"{gc} record(s) carry a GREAT-CIRCLE face (interior angle pi). At n=3 the hexagon's "
                     f"circumradius is exactly pi/2, so this is the geometry, not a decode failure.")
    for path, cnt, sz in written:
        lines.append(f"wrote {path}: {cnt} records, {sz / 1e3:.1f} kB")
    report = "\n".join(lines) + "\n"
    if report_path:
        os.makedirs(os.path.dirname(report_path) or ".", exist_ok=True)
        open(report_path, "w").write(report)
    print(report)
    return by_k, failures


def _selftest():
    for n in FAMILY_NS:
        rho, units, sizes = board_of(n)
        assert sizes == sorted({3, 4, n, 2 * n}), sizes
        assert 0 < rho < math.pi
    print(f"[selftest] {len(FAMILY_NS)} spherical boards: 3.4.n.4 and 4.n.2n close at one rho")
    for n in (6, 7, 16):
        try:
            board_of(n)
            raise AssertionError(f"accepted n={n}, which is not spherical")
        except DevelopError:
            pass
    print("[selftest] the Euclidean (n=6) and hyperbolic (n>=7) boards are refused")
    rho3, _, _ = board_of(3)
    assert abs(rho3 - math.pi / 3) < 1e-12, "n=3 arc is pi/3"
    assert abs(interior_angle(6, rho3) - math.pi) < 1e-12, "n=3's hexagon is a great circle"
    print("[selftest] n=3: rho = pi/3 and the hexagon is a great circle, as expected")
    print("[selftest] PASS")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", nargs="?")
    ap.add_argument("--n", type=int, default=4, choices=FAMILY_NS)
    ap.add_argument("--out")
    ap.add_argument("--report")
    ap.add_argument("--ks")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        _selftest()
        return
    if not args.source:
        ap.error("source is required unless --selftest")
    ks = set(int(x) for x in args.ks.split(",")) if args.ks else None
    run(args.source, args.n, args.out, ks, args.report)


if __name__ == "__main__":
    main()
