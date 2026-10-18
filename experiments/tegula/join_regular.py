#!/usr/bin/env python3
"""Match the engine's regular k-uniform tilings against Tegula's rows, symbol by symbol.

Two independent enumerations meet here. The Čtrnáct engine glues vertex figures of regular polygons and
goes deep in k. Tegula lists every Delaney-Dress symbol of size <= 24, whatever the tile shape. Inside
the window "regular polygons AND minimal symbol size <= 24" they must produce the same set:

  engine only  -> Tegula misses a tiling, or our minimal image is wrong
  Tegula only  -> a symbol that passes the 360-degree test at every vertex and is not a tiling by
                  regular polygons (the B2 ghost of FINDINGS.md), or the engine misses a tiling

Identity is the canonical form of the minimal image (dsymbol.canonical_form), the same key on both
sides. The engine side comes from pruned blocks through dsymbol_from_darts.analyse at edge length 0,
which is the Euclidean limit of its angle formula.

usage: join_regular.py <euclidean-1-24.tdb> <pruned_dir> <kmax> <log>
"""
import os
import sqlite3
import sys
import time
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "..", "tools", "ctrnact-oracle"))

import develop_spherical as ds                      # noqa: E402  read/decode pruned blocks
from dsymbol_from_darts import analyse              # noqa: E402
from dsymbol import DSymbol, canonical_form, validate  # noqa: E402  (path set by dsymbol_from_darts)
from relation import figures, flat                  # noqa: E402
from develop_dsym import parse_tegula               # noqa: E402

WINDOW = 24


def main(db, pruned, kmax, logpath):
    log = open(logpath, "w")

    def say(x=""):
        log.write(x + "\n")
        log.flush()

    say("Engine regular catalogue vs Tegula, %s" % time.strftime("%Y-%m-%d %H:%M"))
    say("window: regular polygons, minimal D-symbol size <= %d\n" % WINDOW)

    say("[1/2] Tegula: maximal rows whose every vertex figure is regular-flat")
    teg = {}
    con = sqlite3.connect(db)
    for rid, sym, vfig, nv in con.execute(
            "select id,symbol,vertex_fig,vertices from tilings where maximal='true'"):
        if all(flat(f) for f in figures(vfig)):
            n, s, m01, m12 = parse_tegula(sym)
            d = DSymbol(*(dict(enumerate(x)) for x in (*s, m01, m12)))
            ok, why = validate(d)
            if not ok:
                say("  PARSE FAILURE id=%d: %s" % (rid, why))
                continue
            teg[canonical_form(d)] = (rid, nv, d.n, vfig)
    say("  %d rows, %d distinct canonical forms\n" % (len(teg), len(teg)))

    say("[2/2] engine: pruned blocks k <= %d -> minimal image" % kmax)
    blocks = ds.gather_blocks(pruned, 1, kmax)
    eng = {}
    sizes = defaultdict(Counter)       # k -> Counter(minimal size)
    bad = Counter()
    t0 = time.time()
    for i, b in enumerate(blocks, 1):
        dec = ds.decode_block(b)
        # under EU_PALETTE=regular a tile is (sides, numerator, denominator of its interior angle / pi)
        a = analyse(dec["rneig"], dec["glue"], [t[0] for t in dec["lvert"]], 0.0)
        if not a["valid"]:
            bad[a["reason"]] += 1
            continue
        sizes[a["k"]][a["n"]] += 1
        if a["n"] <= WINDOW:
            eng[a["key"]] = (a["k"], a["n"], " ".join("(%s)" % " ".join(map(str, o)) for o in a["orbits"]))
        if i % 2000 == 0:
            el = time.time() - t0
            say("  progress %d/%d (%.0f%%)  elapsed %.0fs  ETA %.0fs" % (i, len(blocks), 100 * i / len(blocks), el, el * (len(blocks) - i) / i))
    say("  %d blocks in %.0fs, %d invalid %s\n" % (len(blocks), time.time() - t0, sum(bad.values()), dict(bad)))

    both = set(teg) & set(eng)
    only_t = set(teg) - set(eng)
    only_e = set(eng) - set(teg)
    say("== result ==")
    say("  in both      : %d" % len(both))
    say("  Tegula only  : %d" % len(only_t))
    say("  engine only  : %d   (4.8.8 is expected on the Tegula side: the engine palette is octagon-blind)" % len(only_e))
    for key in sorted(only_t, key=lambda x: teg[x][:3]):
        say("    Tegula only: id=%d k=%d n=%d %s" % teg[key])
    for key in sorted(only_e, key=lambda x: eng[x][:2]):
        say("    engine only: k=%d n=%d %s" % eng[key])

    say("\n== how far Tegula's window reaches into the engine's catalogue ==")
    say("  %3s %8s %9s %8s %7s %7s %7s" % ("k", "engine", "n<=24", "share", "min n", "median", "max n"))
    for k in sorted(sizes):
        c = sizes[k]
        tot = sum(c.values())
        inside = sum(v for n, v in c.items() if n <= WINDOW)
        flatl = sorted(n for n, v in c.items() for _ in range(v))
        say("  %3d %8d %9d %7.1f%% %7d %7d %7d" % (k, tot, inside, 100 * inside / tot, flatl[0], flatl[len(flatl) // 2], flatl[-1]))
    log.close()


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4])
