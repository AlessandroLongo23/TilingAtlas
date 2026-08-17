#!/usr/bin/env python3
"""A stable digest of a star-polyhedron develop, for `make check-star`.

Hashing the cells JSON directly is no good as a gate: it carries float coordinates, so a harmless
change in bisection order rewrites every byte. This prints the INVARIANTS instead — the vertex word,
the covering density, V/E/F, the face census, the measured symmetry order, and rho to 9 decimals —
one line per record, sorted. Any of those moving is a real change in what the engine found.

Usage: python3 star_digest.py <cells.json>
"""
import collections, json, sys

rows = []
for r in json.load(open(sys.argv[1])):
    e = sum(len(f) for f in r["faces"]) // 2
    census = sorted(collections.Counter(tuple(t) for t in r["faceTypes"]).items())
    rows.append("%-28s D=%-3d k=%d V=%-4d E=%-4d F=%-4d rho=%.9f  %s" % (
        r["vertexConfig"], r["density"], r["k"], len(r["vertices"]), e, len(r["faces"]), r["rho"],
        " ".join("%dx{%d/%d}" % (c, n, d) for (n, d), c in census)))
for line in sorted(rows):
    print(line)
print("records: %d" % len(rows))
