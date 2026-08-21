#!/usr/bin/env python3
"""Rewrite SPH_STAR_INDEX in lib/tilings/sph-star.ts from the emitter's index JSON.

The shelf ships one file per solid and the app needs the row data (id, config, k, density, census)
before it fetches any geometry, so the index is a TS literal in the module. It is generated, not
maintained: emit_sph_star_shelf.py --index writes the JSON, this splices it in between the array's own
delimiters and touches nothing else in the file.

Usage: python3 emit_sph_star_index_ts.py --index star-shelf-index.json [--ts ../../lib/tilings/sph-star.ts]
"""
import argparse, json, os

HEAD = "export const SPH_STAR_INDEX: SphStarEntry[] = ["
_HERE = os.path.dirname(os.path.abspath(__file__))


def row(e):
    st = e["stats"]
    types = ", ".join("[%d, %d, %d]" % tuple(t) for t in st["types"])
    bits = ["verts: %d" % st["verts"], "edges: %d" % st["edges"], "faces: %d" % st["faces"],
            "symmetryOrder: %d" % st["symmetryOrder"], "symmetryOrbits: %d" % st["symmetryOrbits"],
            "types: [%s]" % types]
    if st.get("densitySuspect"):
        bits.append("densitySuspect: true")
    solid = ('"%s"' % e["solid"]) if e.get("solid") else "undefined"
    return ('\t{ id: "%s", config: "%s", k: %d, density: %d, rho: 0, solid: %s, stats: { %s } },'
            % (e["id"], e["config"], e["k"], e["density"], solid, ", ".join(bits)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", required=True)
    ap.add_argument("--ts", default=os.path.join(_HERE, "..", "..", "lib", "tilings", "sph-star.ts"))
    args = ap.parse_args()
    index = json.load(open(args.index))
    src = open(args.ts).read()
    i = src.index(HEAD)
    j = src.index("\n];", i)
    body = "\n".join(row(e) for e in index)
    open(args.ts, "w").write(src[:i + len(HEAD)] + "\n" + body + src[j:])
    print("SPH_STAR_INDEX: %d rows -> %s" % (len(index), os.path.normpath(args.ts)))


if __name__ == "__main__":
    main()
