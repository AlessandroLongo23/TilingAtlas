#!/usr/bin/env python3
"""Independent audit of free-placement witness patches (free_solver.py's records).

Shares nothing with the solver: plain complex floats, overlap by clipped area, corners compared
after rounding. A record carries the shape's cells and, per patch, each copy's corona and isometry;
the audit rebuilds every copy and checks that the copies are congruent, that no two overlap, that
every inner copy is surrounded (each boundary edge matched, each corner closed all the way round),
that each corona touches the one before and nothing below it, and, for the strict number, that
every prefix of coronas is a disk.

Usage: check_free.py <records.json>
"""
import json
import sys

# Corners are compared by snapping, not rounding: the records carry six places and a copy's corners
# pick up float noise from its map, so any fixed rounding has some coordinate on its boundary (at four
# places, -2.73205 rounds both ways). A corner within 1e-3 of one already seen is that corner; distinct
# corners of these patches lie far further apart.
_snapped = {}


def key(z):
    cx, cy = round(z.real * 100), round(z.imag * 100)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for p in _snapped.get((cx + dx, cy + dy), ()):
                if abs(p[0] - z.real) < 1e-3 and abs(p[1] - z.imag) < 1e-3:
                    return p
    p = (round(z.real, 4), round(z.imag, 4))
    _snapped.setdefault((cx, cy), []).append(p)
    return p


def clip_area(p, q):
    """Area of the intersection of two convex polygons (Sutherland-Hodgman), either winding."""
    if sum(q[i].real * q[i - 1].imag - q[i - 1].real * q[i].imag for i in range(len(q))) > 0:
        q = q[::-1]  # clip against a counter-clockwise q, or every side test is backwards
    out = list(p)
    for i in range(len(q)):
        a, b = q[i], q[(i + 1) % len(q)]
        side = lambda z: (b - a).real * (z - a).imag - (b - a).imag * (z - a).real  # noqa: E731
        nxt = []
        for j in range(len(out)):
            s, e = out[j], out[(j + 1) % len(out)]
            ss, se = side(s), side(e)
            if ss >= 0:
                nxt.append(s)
            if (ss > 0) != (se > 0) and abs(ss - se) > 1e-12:
                nxt.append(s + (e - s) * ss / (ss - se))
        out = nxt
        if len(out) < 3:
            return 0.0
    return abs(sum(out[i].real * out[(i + 1) % len(out)].imag - out[(i + 1) % len(out)].real * out[i].imag for i in range(len(out)))) / 2


def boundary(cells):
    """Directed boundary edges of a union of cells, as rounded corner pairs."""
    edges = {(key(c[i]), key(c[(i + 1) % len(c)])) for c in cells for i in range(len(c))}
    return {e for e in edges if (e[1], e[0]) not in edges}


def is_disk(edges):
    """One boundary loop through distinct corners."""
    nxt = {}
    for a, b in edges:
        if a in nxt:
            return False
        nxt[a] = b
    start = next(iter(nxt))
    n, cur = 1, nxt[start]
    while cur != start:
        n, cur = n + 1, nxt[cur]
    return n == len(nxt)


def audit(cells, patch, want, strict):
    errs = []
    copies = []
    for i in range(0, len(patch), 7):
        level, a, b, c, d, e, f = patch[i:i + 7]
        if abs(a * a + d * d - 1) > 1e-5 or abs(b * b + e * e - 1) > 1e-5 or abs(a * b + d * e) > 1e-5:
            errs.append(f"copy {i // 7} is not an isometry")
        placed = [[complex(a * z.real + b * z.imag + c, d * z.real + e * z.imag + f) for z in cell] for cell in cells]
        # A mirrored copy lists its corners clockwise; turn them back so boundaries run one way.
        placed = [p[::-1] for p in placed] if a * e - b * d < 0 else placed
        edges = boundary(placed)
        copies.append((int(level), placed, edges, {v for edge in edges for v in edge}))
    top = max(c[0] for c in copies)
    if top != want:
        errs.append(f"patch has {top} coronas, record claims {want}")
    if [c[0] for c in copies].count(0) != 1:
        errs.append("patch must have exactly one centre tile")
    for i, (_, pi, _, _) in enumerate(copies):
        for j in range(i):
            # Corners carry six places, so cells that only share an edge can clip to ~1e-7; cells
            # that truly cross overlap by orders of magnitude more.
            if any(clip_area(p, q) > 1e-4 for p in pi for q in copies[j][1]):
                errs.append(f"copies {j} and {i} overlap")
    everything = {e for c in copies for e in c[2]}
    for i, (level, _, edges, verts) in enumerate(copies):
        if level < top:
            if any((b, a) not in everything for a, b in edges):
                errs.append(f"copy {i} (corona {level}) has an unmatched edge")
            if any((b, a) not in everything for a, b in everything if a in verts or b in verts):
                errs.append(f"copy {i} (corona {level}) has an open corner")
        touched = {lv for lv, _, _, vs in copies if vs is not verts and not vs.isdisjoint(verts)}
        if level > 0 and level - 1 not in touched:
            errs.append(f"copy {i} (corona {level}) touches no corona-{level - 1} copy")
        if any(lv < level - 1 for lv in touched):
            errs.append(f"copy {i} (corona {level}) touches a corona below {level - 1}")
    for k in range(top + 1 if strict else top):
        if not is_disk(boundary([cell for lv, placed, _, _ in copies if lv <= k for cell in placed])):
            errs.append(f"coronas 0..{k} do not form a closed disk")
    return errs


def audit_row(row):
    """Every error in one record's patches; empty when it passes."""
    cells = [[complex(x, y) for x, y in zip(c[::2], c[1::2])] for c in row["k"]]
    errs = []
    if "w" in row:
        errs += audit(cells, row["w"], row["hc"], True)
    if "wh" in row:
        errs += audit(cells, row["wh"], row["hh"], False)
    return errs


def audit_tiling(row):
    """Every error in a tiler's tiling: the copies of one period, each an isometric image of the shape,
    repeated by the lattice. No two of the repeated copies may overlap, and the copies of a period must
    have exactly the area of the lattice's cell: a periodic packing that fills its cell covers the plane."""
    cells = [[complex(x, y) for x, y in zip(c[::2], c[1::2])] for c in row["k"]]
    ux, uy, vx, vy = row["p"]["l"]
    u, v = complex(ux, uy), complex(vx, vy)
    maps = row["p"]["k"]
    errs = []
    period = []
    for i in range(0, len(maps), 6):
        a, b, c, d, e, f = maps[i:i + 6]
        if abs(a * a + d * d - 1) > 1e-5 or abs(b * b + e * e - 1) > 1e-5 or abs(a * b + d * e) > 1e-5:
            errs.append(f"copy {i // 6} is not an isometry")
        period.append([[complex(a * z.real + b * z.imag + c, d * z.real + e * z.imag + f) for z in cell] for cell in cells])
    area = sum(clip_area(cell, cell) for cell in cells)
    det = abs(u.real * v.imag - u.imag * v.real)
    if abs(len(period) * area - det) > 1e-4:
        errs.append(f"{len(period)} copies of area {area:.4f} in a cell of area {det:.4f}")
    reach = 2 * max(abs(z - cells[0][0]) for cell in cells for z in cell) + abs(u) + abs(v)
    near = [(i, j) for i in range(-3, 4) for j in range(-3, 4) if abs(i * u + j * v) <= 2 * reach]
    for x, copy in enumerate(period):
        for i, j in near:
            for y, other in enumerate(period):
                if (i, j) == (0, 0) and y <= x:
                    continue
                moved = [[z + i * u + j * v for z in cell] for cell in other]
                if any(clip_area(p, q) > 1e-4 for p in copy for q in moved):
                    errs.append(f"copy {x} overlaps copy {y} shifted by ({i}, {j})")
    return errs


def main(path):
    bad = 0
    data = json.loads(open(path).read())
    for row in data["shapes"] + data.get("tilers", []):
        errs = audit_tiling(row) if "p" in row else audit_row(row)
        what = "tiles" if "p" in row else f"Hc={row['hc']} Hh={row['hh']}"
        print(f"{row['cells']} cells, {what}: {'PASS' if not errs else 'FAIL'}")
        for err in errs[:10]:
            print("   ", err)
        bad += bool(errs)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main(sys.argv[1])
