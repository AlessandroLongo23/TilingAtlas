#!/usr/bin/env python3
"""Pack heesch-sat results into the /heesch page's data files.

Reads every `sat -show` output under experiments/results/heesch/, audits each witness patch with
check_witness (a failed audit aborts the build), and writes one JSON per set to public/heesch/ plus
an index. Named tiles come from named.json beside the solver outputs, keyed by output file stem.

Usage: build_data.py
"""
import json
import math
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
from check_free import audit_row  # noqa: E402
from check_witness import GRIDS, Grid, audit_claim, key, records  # noqa: E402
from free_solver import free_polyforms  # noqa: E402

SRC = ROOT / "experiments/results/heesch"
OUT = ROOT / "public/heesch"


def outline(grid, shape):
    """The tile's boundary, counter-clockwise, straight vertices dropped, flattened to
    [x0, y0, x1, y1, ...] in units of 1/den of the solver's cell coordinates. Interior edges cancel
    against their reverse."""
    at = {}
    edges = set()
    for cell in shape:
        loop = [key(*v) for v in grid.verts(cell)]
        at.update(zip(loop, grid.verts(cell)))
        edges.update(zip(loop, loop[1:] + loop[:1]))
    exits = {}
    for a, b in edges:
        if (b, a) not in edges:
            exits.setdefault(a, []).append(b)
    start = min(exits)
    loop, prev, cur = [start], None, start
    while True:
        out = exits[cur]
        # Where the tile touches itself at a corner there are two ways on; the sharpest right turn
        # stays on the same lobe, so the loop touches itself there and never crosses.
        nxt = out[0] if len(out) == 1 else min(out, key=lambda q: _left_turn(at[prev], at[cur], at[q]))
        out.remove(nxt)
        if nxt == start and not any(exits.values()):
            break
        loop.append(nxt)
        prev, cur = cur, nxt
    ring = [at[k] for k in loop]
    n = len(ring)
    keep = [
        q for i, q in enumerate(ring)
        if abs((q[0] - ring[i - 1][0]) * (ring[(i + 1) % n][1] - q[1]) - (q[1] - ring[i - 1][1]) * (ring[(i + 1) % n][0] - q[0])) > 1e-9
    ]
    exact = lambda c: round(c * grid.den) if abs(c * grid.den - round(c * grid.den)) < 1e-6 else round(c * grid.den, 5)  # noqa: E731
    return [exact(c) for q in keep for c in q]


def _left_turn(a, b, c):
    """Orders the ways out of b, arriving from a, from hardest right to hardest left."""
    turn = math.atan2(c[1] - b[1], c[0] - b[0]) - math.atan2(b[1] - a[1], b[0] - a[0])
    return (turn + math.pi) % (2 * math.pi)


def pack(path):
    shapes, name = [], None
    for grid, shape, kind, hc, hh, claims in records(path):
        name = grid.name
        if kind != "~":
            continue
        row = {"cells": len(shape), "o": outline(grid, shape), "hc": hc, "hh": hh}
        for want, strict, tiles in claims:
            errs = audit_claim(grid, shape, want, strict, tiles)
            if errs:
                sys.exit(f"{path.name}: witness audit failed for {shape}: {errs[0]}")
            # One tile is [corona, a, b, c, d, e, f]: the cell (x, y) goes to (ax + by + c, dx + ey + f).
            row["w" if strict else "wh"] = [v for level, t in sorted(tiles) for v in (level, *t)]
        shapes.append(row)
    shapes.sort(key=lambda r: (-r["hh"], -r["hc"], r["o"]))
    return name, shapes


def tally(shapes, key):
    counts = {}
    for r in shapes:
        counts[r[key]] = counts.get(r[key], 0) + 1
    return [counts.get(h, 0) for h in range(max(counts) + 1)]


TILER_SHARD = 2400  # tilers per file: a hundred pages of the picker
# Where each grid's census lives (omino_run --grid), and the page grid it ships on.
CENSUS_DIRS = {"omino": SRC / "omino-v3", "iamond": SRC / "grids", "hex": SRC / "grids"}
ZETA = [complex(math.cos(k * math.pi / 6), math.sin(k * math.pi / 6)) for k in range(12)]


def page_cell(grid, z):
    """A point of free_heesch's plane (a cell's centroid) to the page's cell coordinates: squares at their
    lower left corner; triangles at 3 x centroid - (1, 1) in lattice coordinates on 1, e^(i pi/3); hexagons
    at their axial coordinates."""
    if grid == "omino":
        return (z.real - 0.5, z.imag - 0.5)
    v = z.imag / (math.sqrt(3) / 2)
    u = z.real - v / 2
    return (3 * u - 1, 3 * v - 1) if grid == "iamond" else ((2 * u + v) / 3, (v - u) / 3)


def native_cell(grid, x, y):
    """polyform_census's cell (x, y) to the page's: on the triangle grid x = 2a + t."""
    if grid != "iamond":
        return (x, y)
    a, t = x // 2, x & 1
    return (3 * a + t, 3 * y + t)


def affine(src, dst, page=None):
    """The map (x, y) -> (ax + by + c, dx + ey + f) taking the points src to dst, read off three of them
    that are not on a line, as integers. When all of them are on a line the reflection in it gives the
    same copy, so the rotation carrying the line onto its image is taken, measured with `page` (the
    grid's map to the page)."""
    p0, q0 = src[0], dst[0]
    for i in range(1, len(src)):
        for j in range(i + 1, len(src)):
            ux, uy, vx, vy = src[i][0] - p0[0], src[i][1] - p0[1], src[j][0] - p0[0], src[j][1] - p0[1]
            det = ux * vy - uy * vx
            if abs(det) < 1e-9:
                continue
            ex, ey, fx, fy = dst[i][0] - q0[0], dst[i][1] - q0[1], dst[j][0] - q0[0], dst[j][1] - q0[1]
            a, b = (ex * vy - fx * uy) / det, (fx * ux - ex * vx) / det
            d, e = (ey * vy - fy * uy) / det, (fy * ux - ey * vx) / det
            return tuple(round(v) for v in (a, b, q0[0] - a * p0[0] - b * p0[1], d, e, q0[1] - d * p0[0] - e * p0[1]))
    (pa, pb), (pc, pd) = page
    geo = lambda p: complex(pa * p[0] + pb * p[1], pc * p[0] + pd * p[1])  # noqa: E731
    far = max(range(len(src)), key=lambda i: abs(geo(src[i]) - geo(p0)))
    turn = (geo(dst[far]) - geo(q0)) / (geo(src[far]) - geo(p0))
    det = pa * pd - pb * pc
    back = lambda z: ((pd * z.real - pb * z.imag) / det, (pa * z.imag - pc * z.real) / det)  # noqa: E731
    a, d = back(turn * geo((1, 0)))
    b, e = back(turn * geo((0, 1)))
    return tuple(round(v) for v in (a, b, q0[0] - a * p0[0] - b * p0[1], d, e, q0[1] - d * p0[0] - e * p0[1]))


def tilings(grid, n):
    """The tilers of a size with the tiling that proves each, from omino_run --tilers. A certificate is
    a lattice (A, 0), (B, C) and the copies of one period; the audit checks that they cover every cell
    of the torus exactly once, so the copies and their translates tile the plane."""
    d = CENSUS_DIRS[grid] / f"{grid}{n}"
    files = sorted(d.glob("tilers-*.jsonl"))
    if not files or not (d / "tilers-deep.jsonl").exists():
        return None
    G, rows = Grid(grid), []
    (pa, pb), (pc, pd) = GRIDS[grid]["page"]
    geo = lambda v: (pa * v[0] + pb * v[1], pc * v[0] + pd * v[1])  # noqa: E731
    for f in files:
        for line in f.read_text().splitlines():
            if not line.startswith("{"):
                continue
            c = json.loads(line)
            cells = list(zip(c["c"][::2], c["c"][1::2]))
            if grid == "omino":
                copies = [[Grid.place(c["k"][i:i + 6], p) for p in cells] for i in range(0, len(c["k"]), 6)]
            else:
                copies = [list(zip(q[::2], q[1::2])) for q in c["q"]]
            A, B, C = c["l"]
            seen = set()
            for copy in copies:
                for x, y in copy:
                    q = y // C
                    y, x = y - q * C, (x - q * B) % A
                    if (x, y) in seen:
                        sys.exit(f"{f}: tiling certificate overlaps itself for {cells}")
                    seen.add((x, y))
            if len(seen) != A * C:
                sys.exit(f"{f}: tiling certificate leaves cells uncovered for {cells}")
            # On the page: the cells, each copy as a map of cells, and the shortest basis of the lattice
            # (Lagrange, measured on the page), so a patch of the tiling is drawn round.
            base = [native_cell(grid, *p) for p in cells]
            maps = c["k"] if grid == "omino" else [m for copy in copies for m in affine(base, [native_cell(grid, *p) for p in copy], GRIDS[grid]["page"])]
            u, v = native_cell(grid, A, 0), native_cell(grid, B, C)
            if grid == "iamond":
                u, v = (3 * A // 2, 0), (3 * B // 2, 3 * C)
            dot = lambda p, q: sum(a * b for a, b in zip(geo(p), geo(q)))  # noqa: E731
            while True:
                if dot(u, u) > dot(v, v):
                    u, v = v, u
                m = round(dot(u, v) / dot(u, u))
                if m == 0:
                    break
                v = (v[0] - m * u[0], v[1] - m * u[1])
            rows.append({"cells": n, "o": outline(G, base), "p": {"l": [*u, *v], "k": maps}})
    # Longest periods first: the tilings that need the most copies are the rarest.
    rows.sort(key=lambda r: (-len(r["p"]["k"]), r["o"]))
    return rows


def census(grid):
    """A grid's census from polyform_census and omino_run: per size, the counts, and every shape with
    Hh >= 2 with the witness patches free_heesch found for it. A size still running ships its counts so
    far and how many of its slices are done."""
    G, out = Grid(grid), {}
    for d in sorted(p for p in CENSUS_DIRS[grid].glob(f"{grid}[0-9]*") if p.is_dir()):
        n = int(d.name[len(grid):])
        done = d / "census.json"
        if not done.exists():
            parts = [json.loads(f.read_text()) for f in d.glob("part-*.json")]
            if not parts:
                continue
            got = lambda k: sum(p[k] for p in parts)  # noqa: E731
            out[n] = ({"holeFree": got("holefree"), "tilers": got("tilers"), "hh": [got("h0"), got("h1")], "slices": [len(parts), parts[0]["parts"]]}, [])
            continue
        c = json.loads(done.read_text())
        info = {"holeFree": c["hole_free"], "tilers": c["tilers"], "hh": [c.get(f"h{h}", 0) for h in range(max(int(k[1:]) for k in c if k[1:].isdigit() and k[0] == "h") + 1)]}
        if c["capped"]:
            info["unresolved"] = c["capped"]
        rows = []
        for res in sorted(d.glob("fallback-*.out")):
            for line, rec in zip(res.with_suffix(".in").read_text().splitlines(), res.read_text().splitlines()):
                r = json.loads(rec)
                if r["capped"] or r["iso"] or r["period"] or r["hh"] < 2:
                    continue
                a = list(map(int, line.split()))
                centroids, i = [], 1
                for _ in range(a[0]):
                    pts = [sum(v * ZETA[k] for k, v in enumerate(a[j:j + 4])) for j in range(i + 1, i + 1 + 4 * a[i], 4)]
                    centroids.append(sum(pts) / len(pts))
                    i += 1 + 4 * a[i]
                cells = [tuple(round(v) for v in page_cell(grid, z)) for z in centroids]
                row = {"cells": n, "o": outline(G, cells), "hc": r["hc"], "hh": r["hh"]}
                for want, strict, wit in ((r["hc"], True, r["w"]), (r["hh"], False, r["wh"])):
                    if (strict and want == 0) or (not strict and r["hh"] == r["hc"]):
                        continue
                    # free_heesch places a copy by z -> zeta^r (z or its conjugate) + t; on cells, read the
                    # same copy off where it sends the shape's cells.
                    tiles = []
                    for level, f, rot, *t in wit:
                        tz = sum(v * ZETA[k] for k, v in enumerate(t))
                        moved = [page_cell(grid, ZETA[rot] * (z.conjugate() if f else z) + tz) for z in centroids]
                        tiles.append((level, affine(cells, moved, GRIDS[grid]["page"])))
                    errs = audit_claim(G, sorted(cells), want, strict, tiles)
                    if errs:
                        sys.exit(f"{res}: witness audit failed for {cells}: {errs[0]}")
                    row["w" if strict else "wh"] = [v for level, t in sorted(tiles) for v in (level, *t)]
                rows.append(row)
        rows.sort(key=lambda r: (-r["hh"], -r["hc"], r["o"]))
        out[n] = (info, rows)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    named = json.loads((SRC / "named.json").read_text())
    order = list(GRIDS)
    index, named_rows = [], []
    for path in sorted(SRC.glob("*.out")):
        grid, shapes = pack(path)
        if path.stem in named:
            named_rows += [{**row, **named[path.stem], "grid": grid} for row in shapes]
            continue
        if not shapes:
            continue
        cells = shapes[0]["cells"]
        (OUT / f"{path.stem}.json").write_text(json.dumps({"grid": grid, "cells": cells, "shapes": shapes}, separators=(",", ":")))
        index.append({"id": path.stem, "grid": grid, "cells": cells, "count": len(shapes), "hc": tally(shapes, "hc"), "hh": tally(shapes, "hh")})
    # Free-placement sets arrive as page records already, possibly in parts (one file per solver
    # process); audit them the same way, merge the parts of a size, and drop the cells.
    free, searched = {}, {}
    for path in sorted(SRC.glob("sqtri*.json")):
        data = json.loads(path.read_text())
        searched[data["cells"]] = searched.get(data["cells"], 0) + data["closed"] + len(data["shapes"])
        for row in data["shapes"]:
            errs = audit_row(row)
            if errs:
                sys.exit(f"{path.name}: witness audit failed: {errs[0]}")
            free.setdefault(data["cells"], []).append({k: v for k, v in row.items() if k != "k"})
    for cells, shapes in free.items():
        shapes.sort(key=lambda r: (-r["hh"], -r["hc"], r["o"]))
        (OUT / f"sqtri{cells}.json").write_text(json.dumps({"grid": "sqtri", "cells": cells, "shapes": shapes}, separators=(",", ":")))
        info = {"id": f"sqtri{cells}", "grid": "sqtri", "cells": cells, "count": len(shapes), "hc": tally(shapes, "hc"), "hh": tally(shapes, "hh")}
        # A census still running ships with how far it got, so the page never passes it off as whole.
        total = len(free_polyforms(["square", "triangle"], cells))
        if searched[cells] < total:
            info.update(searched=searched[cells], of=total)
        index.append(info)
    # The censuses of polyform_census: counts on every size, and where a size is past what heesch-sat
    # listed, its shapes from Hh = 2 up (there are millions of shapes at Hh <= 1).
    for grid in CENSUS_DIRS:
        for cells, (info, rows) in census(grid).items():
            have = next((s for s in index if s["id"] == f"{grid}{cells}"), None)
            if have:
                have["census"] = info
                continue
            (OUT / f"{grid}{cells}.json").write_text(json.dumps({"grid": grid, "cells": cells, "shapes": rows}, separators=(",", ":")))
            entry = {"id": f"{grid}{cells}", "grid": grid, "cells": cells, "count": len(rows), "census": {**info, "listedFrom": 2}}
            entry.update(hc=tally(rows, "hc"), hh=tally(rows, "hh")) if rows else entry.update(hc=[], hh=[])
            index.append(entry)
    # Tilers, with their tilings, in shards beside the set file; the index says how many and where.
    for info in index:
        rows = tilings(info["grid"], info["cells"]) if info["grid"] in CENSUS_DIRS else None
        if rows is None:
            continue
        for i in range(0, len(rows), TILER_SHARD):
            (OUT / f"{info['id']}-t{i // TILER_SHARD}.json").write_text(json.dumps({"grid": info["grid"], "shapes": rows[i:i + TILER_SHARD]}, separators=(",", ":")))
        info["tilers"] = {"count": len(rows), "shard": TILER_SHARD}
        if info.get("census") and len(rows) != info["census"]["tilers"]:
            sys.exit(f"{info['id']}: {len(rows)} tilings for {info['census']['tilers']} tilers")
    index.sort(key=lambda s: (order.index(s["grid"]), s["cells"]))
    for s in index:
        print(f"{s['id']}: {s['count']} non-tilers, strict {s['hc']}, with holes {s['hh']}")
    (OUT / "named.json").write_text(json.dumps({"shapes": named_rows}, separators=(",", ":")))
    (OUT / "index.json").write_text(json.dumps({"sets": index, "named": len(named_rows)}, separators=(",", ":")))
    print(f"named: {len(named_rows)} tiles")


if __name__ == "__main__":
    main()
