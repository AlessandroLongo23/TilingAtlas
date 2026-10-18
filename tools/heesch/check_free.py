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

# Four places: the records carry corners to six, and every coordinate here is a + b√3/2, whose
# fractional parts (0, .5, .866025, .366025, .133975, .232051, .732051) sit nowhere near a
# four-place rounding boundary; at five places .366025 lands on one and flips with float noise.
key = lambda z: (round(z.real, 4), round(z.imag, 4))  # noqa: E731


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


def main(path):
    bad = 0
    for row in json.loads(open(path).read())["shapes"]:
        errs = audit_row(row)
        print(f"{row['cells']} cells, Hc={row['hc']} Hh={row['hh']}: {'PASS' if not errs else 'FAIL'}")
        for err in errs[:10]:
            print("   ", err)
        bad += bool(errs)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main(sys.argv[1])
