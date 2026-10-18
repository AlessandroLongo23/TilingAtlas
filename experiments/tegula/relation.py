#!/usr/bin/env python3
"""Where the atlas's constrained families sit inside Tegula's Euclidean galaxy.

Tegula (Zeller, Delgado-Friedrichs, Huson, arXiv:2007.10625) lists every periodic Euclidean tiling with
Dress complexity <= 24 as a Delaney-Dress symbol: 1,728,488 rows, no constraint on tile shape. The atlas
goes deep in k under one constraint at a time. This script reads Tegula's own columns and counts the
rows that satisfy each atlas constraint, so the two can be laid side by side.

REGULAR-FLAT. A row can be drawn with regular polygons only if, at every vertex orbit, the interior
angles of the regular p-gons round it sum to 360 degrees: sum(1 - 2/p) = 2 over the vertex figure. That
is necessary, not sufficient (FINDINGS.md, gate B2). `maximal` picks the row that is the tiling under its
full symmetry group, which is the one A068599 counts.

usage: relation.py <euclidean-1-24.tdb> <log>
"""
import re
import sqlite3
import sys
import time
from collections import Counter
from fractions import Fraction

A068599 = {1: 11, 2: 20, 3: 61, 4: 151, 5: 332, 6: 673, 7: 1472, 8: 2850, 9: 5960, 10: 11866}
FIG = re.compile(r"(?:(\d+)x)?\(([\d ]+)\)")


def figures(text):
    """'(3 3 3) 2x(5 5 5 5)' -> [[3,3,3],[5,5,5,5],[5,5,5,5]]"""
    out = []
    for mult, body in FIG.findall(text):
        out += [[int(x) for x in body.split()]] * int(mult or 1)
    return out


def flat(fig):
    return sum(Fraction(p - 2, p) for p in fig) == 2


def main(db, logpath):
    con = sqlite3.connect(db)
    total = con.execute("select count(*) from tilings").fetchone()[0]
    log = open(logpath, "w")

    def say(s=""):
        log.write(s + "\n")
        log.flush()

    say("Tegula Euclidean galaxy vs atlas constraints, %s" % time.strftime("%Y-%m-%d %H:%M"))
    say("source: %s (%d rows, complexity 1-24)\n" % (db.split("/")[-1], total))

    reg = Counter()        # (k, maximal) -> rows whose every vertex orbit is regular-flat
    reg_cx = {}            # k -> Counter(complexity), maximal rows only
    reg_tiles = Counter()  # tile-degree sets seen among maximal regular-flat rows
    dual = Counter()       # (tiles, maximal) -> rows whose every TILE orbit is flat (Laves side)
    by_k = Counter()
    pent = Counter()       # tiles -> rows whose tiles are all pentagons
    classes = Counter()
    rows_reg = []
    t0 = time.time()
    q = "select id,complexity,tile_fig,tile_deg,vertex_fig,tiles,edges,vertices,maximal,normal from tilings"
    for i, (rid, cx, tfig, tdeg, vfig, nt, ne, nv, mx, nm) in enumerate(con.execute(q), 1):
        mx = mx == "true"
        by_k[nv] += 1
        if nt == 1:
            classes["isohedral (1 tile orbit)"] += 1
        if nv == 1:
            classes["isogonal (1 vertex orbit)"] += 1
        if ne == 1:
            classes["isotoxal (1 edge orbit)"] += 1
        if nm == "true":
            classes["pseudo-convex"] += 1
        if mx:
            classes["maximal symmetry"] += 1
        if set(tdeg.split()) == {"5"}:
            pent[nt] += 1
        vf = figures(vfig)
        if all(flat(f) for f in vf):
            reg[(nv, mx)] += 1
            if mx:
                reg_cx.setdefault(nv, Counter())[cx] += 1
                reg_tiles[" ".join(sorted(set(tdeg.split()), key=int))] += 1
                rows_reg.append((nv, cx, rid, vfig))
        if all(flat(f) for f in figures(tfig)):
            dual[(nt, mx)] += 1
        if i % 200000 == 0:
            el = time.time() - t0
            say("  progress %d/%d (%.0f%%)  elapsed %.0fs  ETA %.0fs" % (i, total, 100 * i / total, el, el * (total - i) / i))
    say("  done in %.0fs\n" % (time.time() - t0))

    say("== the galaxy by coarse class ==")
    for name, n in sorted(classes.items(), key=lambda x: -x[1]):
        say("  %-28s %9d  (%.2f%%)" % (name, n, 100 * n / total))
    say("  all-pentagon tilings by tile orbits: " + ", ".join("%d: %d" % kv for kv in sorted(pent.items())))

    say("\n== regular-flat rows (every vertex figure sums to 360 with regular polygons) ==")
    say("  k = vertex orbits. 'maximal' rows are tilings; 'sub' rows are the same tilings under a subgroup.")
    say("  %3s %10s %9s %7s %9s %9s   complexities of the maximal rows" % ("k", "galaxy", "maximal", "sub", "A068599", "reached"))
    for k in sorted(by_k):
        m, s = reg[(k, True)], reg[(k, False)]
        if not m and not s:
            continue
        want = A068599.get(k)
        reach = "%.1f%%" % (100 * m / want) if want else "-"
        cxs = " ".join("%d:%d" % kv for kv in sorted(reg_cx.get(k, {}).items()))
        say("  %3d %10d %9d %7d %9s %9s   %s" % (k, by_k[k], m, s, want or "?", reach, cxs))
    nreg = sum(v for (k, mx), v in reg.items() if mx)
    say("  total maximal regular-flat: %d of %d rows (%.4f%%)" % (nreg, total, 100 * nreg / total))
    say("  tile-degree sets among them: " + ", ".join("{%s}: %d" % kv for kv in sorted(reg_tiles.items(), key=lambda x: -x[1])))

    say("\n== the dual side: every TILE figure flat (tilings by Laves-type tiles) ==")
    for t in sorted({k for k, _ in dual}):
        say("  tile orbits %2d: maximal %6d  sub %6d" % (t, dual[(t, True)], dual[(t, False)]))

    say("\n== maximal regular-flat rows, k <= 2 (id, complexity, vertex figures) ==")
    for nv, cx, rid, vfig in sorted(rows_reg):
        if nv <= 2:
            say("  k=%d  n=%2d  id=%-8d %s" % (nv, cx, rid, vfig))
    log.close()


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
