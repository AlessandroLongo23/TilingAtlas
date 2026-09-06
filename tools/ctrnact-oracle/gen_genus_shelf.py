#!/usr/bin/env python3
"""Bake the NON-SPHERICAL regular-faced polyhedra into lib/render/genusSolids.ts.

Every solid the atlas held before 2026-08-25 is a map on a SPHERE. These are not. A closed surface of
genus g has total angular defect 2*pi*(2 - 2g), so anything past the sphere needs SADDLE vertices whose
face angles sum past a full turn, and the engine's spherical closure admits only convex vertices while
its hyperbolic closure admits only saddles — neither can express a map that needs both, at any k. They
come from a third mode, "mixed", added the same day. Marek Ctrnact asked for the genus-1 case
(2026-08-24, about ncx-32-60-30-b); the higher genera fell out of the same run.

⚑ NOT A CENSUS, and the difference is not modesty. The spherical shelf is COMPLETE within its bounds
because total defect 4*pi plus a smallest positive defect of 6 degrees (4.6.10, angles summing to 354)
caps V at 720/6 = 120, which the truncated icosidodecahedron attains. Away from the sphere there is no
such quantum: nothing in a block's own data bounds V, and develop's guard stops being derived. This is
what ONE bounded k=2 run found, and a later run can only add to it.

IDS. Genus 1 keeps the "tor-" prefix it shipped with, because ids are permalinks and the toroidal shelf
went out first; genus >= 2 takes "gen<g>-". Everything else is the non-convex shelf's, imported and not
copied: congruence_key, allocate_ids, self_intersections, census, centre_and_scale, degeneracy.

Usage: python3 gen_genus_shelf.py [--emit] [--rows genus-rows.json]
"""
import argparse, collections, json, os, re
import gen_nonconvex_shelf as ncx

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "lib", "render", "genusSolids.ts")
LEGACY = os.path.join(ROOT, "lib", "render", "toroidalSolids.ts")   # where the tor- ids first shipped

HEADER = """// REGULAR-FACED POLYHEDRA THAT ARE NOT MAPS ON A SPHERE — every face a regular polygon, every edge
// the same length, and V - E + F != 2.
//
// GENERATED FILE. Rebuild with tools/ctrnact-oracle/gen_genus_shelf.py --emit; do not hand-edit.
//
// WHY NOTHING LIKE THIS EXISTED HERE BEFORE, and it is one fact about the SEARCH and not about how deep
// it has been run. A closed surface of genus g has total angular defect 2*pi*(2 - 2g), so past the
// sphere every convex vertex has to be paid for by a SADDLE vertex whose face angles sum PAST a full
// turn. The engine's spherical closure admits only convex vertices and its hyperbolic closure only
// saddles, so neither can express a map needing both, at any k. These come from a third mode, "mixed",
// which admits either sign and excludes only the flat vertex.
//
// ⚑ NOT A CENSUS. The spherical shelf is complete within its bounds because total defect 4*pi and a
// smallest positive defect of 6 degrees (4.6.10) cap V at 720/6 = 120, attained by the truncated
// icosidodecahedron. Away from the sphere there is no such quantum, nothing in a block's own data
// bounds V, and develop's guard stops being derived. This is what one bounded k=2 run found.
//
// SEARCH: palette `toroid` ({3,4,5,6,8,10}, closure=mixed, maxValence 6), k <= 2. Of 3,814,039 pruned
// blocks a sign filter kept 21,121 that could close away from the sphere with total defect zero.
//
// MEASURED PER SOLID:
//   * GENUS, from chi and orientability together. Every record here is a closed ORIENTABLE manifold, so
//     genus = (2 - chi)/2; a non-orientable one would need a different word and is refused upstream.
//   * EMBEDDED (%(emb)d of %(n)d) — no face edge through the interior of a face it shares no vertex
//     with. ⚑ This is the shelf's own winding test and it EXEMPTS FACE PAIRS SHARING A VERTEX, which is
//     why lib/tilings/ncx-crossing.ts exists; scripts/gen-ncx-crossing.ts's unexempted test removed two
//     of nine candidates here on 2026-08-25. Treat "embedded" below as the screen, not the verdict.
//   * NO CIRCUMSPHERE, all of them, necessarily: a sphere view is a radial projection onto a sphere and
//     a surface of genus >= 1 does not project onto one. lib/tilings/sph-inscribed.ts withholds it.
//
// %(census)s
//
// Ids are the signature: "tor-<V>-<E>-<F>" at genus 1 (where the shelf shipped first, and ids are
// permalinks) and "gen<g>-<V>-<E>-<F>" above it, lettered where several share one, FROZEN across
// rebuilds.
"""


def frozen_ids():
    """Every id already shipped, by congruence key, across BOTH files — the genus-1 records went out in
    toroidalSolids.ts before this generator existed and their permalinks must survive the move."""
    out = {}
    for path in (LEGACY, OUT):
        if not os.path.exists(path):
            continue
        src = open(path).read()
        for m in re.finditer(r'id:\s*"((?:tor|gen\d+)-[\w-]+)".*?vertices:\s*\[(.*?)\n\t\]', src, re.S):
            V = [[float(v) for v in row] for row in
                 re.findall(r"\[\s*(-?[\d.eE+-]+),\s*(-?[\d.eE+-]+),\s*(-?[\d.eE+-]+)\s*\]", m.group(2))]
            if V:
                out.setdefault(ncx.congruence_key(V), []).append(m.group(1))
    # ⚑ REPAIR, and it has to live here because the corrupt file is the one this reads back. The first
    # version of the namespace fix above shipped a genusSolids.ts declaring five ids twice, so the map
    # built from it hands the SAME id to two different congruence keys. An id claimed by more than one
    # solid is not a permalink to anything, so every entry carrying one is dropped and those solids are
    # allocated fresh. The "tor-" ids are untouched by this — they went out first and are correct.
    flat, byid = {}, collections.Counter()
    for key, ids in out.items():
        for i in ids:
            byid[i] += 1
    bad = {i for i, n in byid.items() if n > 1}
    for key, ids in out.items():
        good = [i for i in ids if i not in bad]
        if good:
            flat[key] = good[0]
    if bad:
        print("   ⚑ dropped %d duplicated id(s) from the frozen map, reallocating: %s"
              % (len(bad), ", ".join(sorted(bad))))
    return flat


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--emit", action="store_true")
    ap.add_argument("--rows", default=os.path.join(HERE, "genus-rows.json"))
    args = ap.parse_args()

    picked = json.load(open(args.rows))
    rows = [{"rec": x["rec"], "V": x["V"], "E": x["E"], "F": x["F"], "genus": x["genus"],
             "census": x["census"], "xings": x["xings"],
             "key": ncx.congruence_key(x["rec"]["vertices"])} for x in picked]
    # ⚑ allocate_ids IS WRITTEN FOR THE "ncx-" NAMESPACE and slices the prefix off by LENGTH — `rest =
    # vid[len("ncx-"):].split("-")` — to recover which letter suffixes a signature has already spent.
    # Hand it "gen5-120-240-112-a" and the four-character slice leaves "5-120-240-112-a", so it records
    # the spent suffix as "36" instead of "a", the next fresh row of that signature is handed "a" again,
    # and the generated file declares GEN5_120_240_112_A twice. It only bites on the SECOND run, once
    # there are frozen gen- ids to misparse, which is exactly when it shipped a file that would not
    # compile. So the namespace is normalised INTO "ncx-" for the allocation and back out after.
    frozen = {k: "ncx-" + v.split("-", 1)[1] for k, v in frozen_ids().items()}
    ncx.allocate_ids(rows, frozen)
    for x in rows:
        pre = "tor-" if x["genus"] == 1 else "gen%d-" % x["genus"]
        x["id"] = pre + x["id"][len("ncx-"):]
        x["ident"] = x["id"].upper().replace("-", "_")
    # and the guard that would have caught it at the source rather than at the TypeScript compiler
    dupes = [i for i, n in collections.Counter(x["id"] for x in rows).items() if n > 1]
    if dupes:
        raise SystemExit("id collision, refusing to emit: %s" % ", ".join(sorted(dupes)))
    byg = collections.Counter(x["genus"] for x in rows)
    emb = collections.Counter(x["genus"] for x in rows if not x["xings"])
    xing = sum(1 for x in rows if x["xings"])
    print("non-spherical solids: %d  (embedded %d, self-intersecting %d)" % (len(rows), len(rows) - xing, xing))
    for g in sorted(byg):
        print("   genus %-3d %4d   embedded %d" % (g, byg[g], emb[g]))
    if not args.emit:
        return
    cen = "GENUS CENSUS: " + ", ".join("genus %d: %d (%d embedded)" % (g, byg[g], emb[g])
                                       for g in sorted(byg)) + "."
    ts = [HEADER % {"n": len(rows), "emb": len(rows) - xing, "census": cen},
          '\nimport type { Polyhedron } from "./platonicSolids";\n']
    for x in rows:
        r = x["rec"]
        ts.append("\n// %s  — genus %d, %s, %s\nexport const %s: Polyhedron = {\n"
                  "\tid: \"%s\",\n\tschlafli: [0, 0], // no {p,q} — routing keys on id\n"
                  "\tvertexConfig: \"%s\",\n\tname: \"%s\",\n\tvertices: [\n%s\t],\n\tfaces: [\n%s\t],\n};\n"
                  % (x["id"], x["genus"], x["census"],
                     "self-intersecting" if x["xings"] else "embedded",
                     x["ident"], x["id"], r.get("vertexConfig", ""), x["census"],
                     "".join("\t\t[%.9f, %.9f, %.9f],\n" % tuple(v)
                             for v in ncx.centre_and_scale(r["vertices"])),
                     "".join("\t\t[%s],\n" % ", ".join(str(i) for i in f) for f in r["faces"])))
    ts.append("\nexport const GENUS_SOLIDS: Polyhedron[] = [\n%s];\n"
              % "".join("\t%s,\n" % x["ident"] for x in rows))
    open(OUT, "w").write("".join(ts))
    json.dump([{k: x[k] for k in ("id", "V", "E", "F", "genus", "census", "xings")}
               | {"vertexConfig": x["rec"].get("vertexConfig", ""), "k": x["rec"].get("k", 2)}
               for x in rows], open(os.path.join(HERE, "genus-atlas-rows.json"), "w"), indent=1)
    print("wrote %s and genus-atlas-rows.json (%d solids)" % (os.path.relpath(OUT, ROOT), len(rows)))


if __name__ == "__main__":
    main()
