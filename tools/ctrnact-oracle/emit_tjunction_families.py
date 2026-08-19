#!/usr/bin/env python3
"""emit_tjunction_families.py — the split-palette shelves, as PARAMETRIC families.

The engine develops every solved block with unit edges, because that is the only length its alphabet
names, so the non-edge-to-edge shelves ship as rigid tilings. They are not rigid: hold the angles and
the lengths still move. `length_family.chart2` fits a slider box inside the positivity cone and writes
every vertex as a linear function of the free edge lengths; this emits the result for the Atlas.

No new search. The maps come from run-oracle-parallel.sh, already sharded across 8 workers.

⚑ MEASURE AT A GENERIC MEMBER, NEVER AT THE DEVELOPED ONE. The engine develops with every edge at 1,
and that member is the most symmetric point of the cone: distinct edges coincide, a primitive cell looks
like a supercell, and vertex orbits fuse. The first version of this script keyed, counted k, and drew
the card there, and it shipped 146 rows that were 26 tilings — the same family under 12 different names,
some of them filed under two different k. Everything below (the dedup key, k, the default sliders and so
the thumbnail) is read at a point pushed off-centre by an irrational fraction of the box instead.

The dedup key is the canonical dart map of the SMOOTHED tiling (`tiling_key.smooth` deletes the points
that are a corner of no tile) together with its corner angles. Two families are the same exactly when
that key matches: the angles are fixed across a family, so the map plus the angles determines the cone.

Usage:  emit_tjunction_families.py <cells.json> <maxk> [limit]
Regenerate: PALETTE=<split-palette> ./run-oracle-parallel.sh <k>   then this script.
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import length_family as LF
import tiling_key as TK
import vertex_orbits as vo

SRC, MAXK = sys.argv[1], int(sys.argv[2])
LIMIT = int(sys.argv[3]) if len(sys.argv) > 3 else 10 ** 9
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, "lib", "tilings", "tjunction-families.generated.ts")

PHI = (1 + 5 ** 0.5) / 2


def generic(c):
    """A point of the slider box that is generic on purpose: each coordinate pushed off the developed
    value by a different irrational fraction of the radius, so no two coordinates land equal and no
    accidental symmetry survives."""
    return [c["c0"][i] + c["radius"] * 0.85 * (2 * (((i + 1) * PHI) % 1.0) - 1)
            for i in range(c["d"])]


def cell_at(c, coord):
    """The concrete (polygons, basis) of the family at a slider position."""
    ev = lambda pair: pair[0] + sum((coord[i] - c["c0"][i]) * pair[1][i] for i in range(c["d"]))
    polys = [{"n": p["n"], "v": [ev(v) for v in p["v"]]} for p in c["cellPolygons"]]
    return polys, [ev(c["basis"][0]), ev(c["basis"][1])]


def covers_once(c, coord):
    """Covering multiplicity at a handful of samples — the arbiter the linear algebra cannot be.

    A wrong lattice pair shows up as a doubled or gapped covering, which is not something the closure
    system can notice. Only charts that survive this are emitted; the rest stay rigid on the shelf,
    which is what they already were.
    """
    polysd, (t1, t2) = cell_at(c, coord)
    polys = [p["v"] for p in polysd]
    det = (t1.conjugate() * t2).imag
    if abs(det) < 1e-9:
        return False
    area = sum(abs(sum((a.conjugate() * b).imag for a, b in zip(pv, pv[1:] + pv[:1]))) / 2 for pv in polys)
    if abs(area - abs(det)) > 1e-6 * max(1.0, abs(det)):
        return False
    span = 2 * max(abs(t1), abs(t2))
    R = int(span / max(1e-9, abs(det) / max(abs(t1), abs(t2)))) + 3
    for s in range(1, 10):
        z = complex(((s * 2 ** 0.5) % 1) * span - span / 2, ((s * 2.718281828) % 1) * span - span / 2)
        n = 0
        for i in range(-R, R + 1):
            for j in range(-R, R + 1):
                q = z - i * t1 - j * t2
                for pv in polys:
                    inside = False
                    for a, b in zip(pv, pv[1:] + pv[:1]):
                        if (a.imag > q.imag) != (b.imag > q.imag) and \
                           q.real < (b.real - a.real) * (q.imag - a.imag) / (b.imag - a.imag) + a.real:
                            inside = not inside
                    if inside:
                        n += 1
        if n != 1:
            return False
    return True


recs = [r for r in json.load(open(SRC)) if r["k"] <= MAXK]
rows, seen, t0 = [], {}, time.time()
n_nochart, n_cover, n_dup, n_euler = 0, 0, 0, 0
for r in recs:
    if len(rows) >= LIMIT:
        break
    polys = [{"n": len(f), "v": [complex(a, b) for a, b in f]} for f in r["faces"]]
    basis = [complex(*r["T1"]), complex(*r["T2"])]
    try:
        c = LF.chart2(polys, basis)
    except Exception:
        n_nochart += 1
        continue
    if not c:
        n_nochart += 1
        continue
    g = generic(c)
    corner = [c["c0"][i] + c["radius"] * 0.98 * (1 if i % 2 else -1) for i in range(c["d"])]
    if not (covers_once(c, c["c0"]) and covers_once(c, g) and covers_once(c, corner)):
        n_cover += 1
        continue
    gp, gb = cell_at(c, g)
    sm = TK.refine(TK.smooth(gp, gb), gb)
    key = TK.family_key(sm, gb)
    if key is None:
        n_nochart += 1
        continue
    if key in seen:
        n_dup += 1
        seen[key].append(r["id"])
        continue
    dim, info = LF.freedom(gp, gb)
    if dim is None or info["euler"] != 0:
        n_euler += 1
        continue
    if dim - 1 != c["d"]:
        # the chart and the independent count must agree, or one of them is wrong
        print(f"  {r['id']}: chart says {c['d']} sliders, freedom says {dim - 1} — dropped")
        n_euler += 1
        continue
    k = vo.orbit_count(sm, gb)
    if isinstance(k, tuple):
        k = k[0]
    seen[key] = [r["id"]]
    rows.append((r, c, g, int(k), info, key))

print(f"{len(rows)} families from {len(recs)} cells in {time.time()-t0:.0f}s")
print(f"  {n_nochart} rigid or unchartable, {n_cover} failed the covering check, "
      f"{n_euler} failed Euler / the cross-check, {n_dup} were duplicates of a family already emitted")
if len(rows) >= LIMIT:
    print(f"  ⚑ stopped at the LIMIT of {LIMIT}: the remaining {len(recs)} - (scanned) cells were NOT looked at")


def num(x):
    return 0 if abs(x) < 1e-12 else round(x, 12)


def terms(pair, c):
    """[-1, x, y] is the constant; [i, dx, dy] the derivative in slider i. A position is
    constant + sum_i slider_i * derivative_i, so the constant carries the -c0_i offsets folded in."""
    z0, g = pair
    k = z0 - sum(c["c0"][i] * g[i] for i in range(c["d"]))
    out = [f"[-1,{num(k.real)},{num(k.imag)}]"]
    out += [f"[{i},{num(z.real)},{num(z.imag)}]" for i, z in enumerate(g) if abs(z) > 1e-12]
    return "[" + ",".join(out) + "]"


body = []
for r, c, g, k, info, key in rows:
    polys = ",".join("{n:%d,vertices:[%s]}" % (p["n"], ",".join(terms(v, c) for v in p["v"]))
                     for p in c["cellPolygons"])
    body.append(
        "\t{ id: %s, k: %d, d: %d, radius: %s, lo: [%s], hi: [%s], def: [%s], V: %d, E: %d, F: %d, "
        "cellPolygons: [%s], basis: [%s,%s] },"
        % (json.dumps("plen-tj-" + r["id"]), k, c["d"], num(c["radius"]),
           ",".join(str(num(x - c["radius"])) for x in c["c0"]),
           ",".join(str(num(x + c["radius"])) for x in c["c0"]),
           ",".join(str(num(x)) for x in g),
           info["V"], info["E"], info["F"], polys,
           terms(c["basis"][0], c), terms(c["basis"][1], c)))

with open(OUT, "w") as f:
    f.write('''// GENERATED by tools/ctrnact-oracle/emit_tjunction_families.py — do not edit by hand.
//
// The non-edge-to-edge half-polygon shelves, as PARAMETRIC families. The engine enumerates these maps
// already (run-oracle-parallel.sh, 8 shards) and develops them with UNIT edges, because a unit edge is
// the only length its alphabet names — so they shipped as rigid tilings. They are not rigid. Holding
// every angle and letting the LENGTHS move, each one is a family of `d` parameters after scale.
//
// A vertex is LINEAR in the free edge lengths, so a coordinate is a list of [param, re, im] terms and
// nothing else is needed. The slider box is fitted INSIDE the positivity cone by interval arithmetic,
// so every point of it is a real tiling; some real tilings lie outside it, which is the price of an
// axis-aligned box in a cone.
//
// ⚑ One row per TILING, not per solved block. The engine enumerates maps, and the same tiling carries
// many maps once a side may be split — 146 blocks at k <= 2 are far fewer families. The emitter keys
// each one by the canonical dart map of the SMOOTHED tiling at a GENERIC member and keeps the first.
// `def` is that generic member and is where the card draws and where k was measured; the developed
// member (every edge 1) is the box centre and still reachable.
//
// Regenerate: PALETTE=<split-palette> ./run-oracle-parallel.sh <k>   then this script.

export interface TJunctionFamily {
\tid: string;
\t/** Vertex orbits, measured at `def` — the generic member, not the symmetric developed one. */
\tk: number;
\t/** Sliders: the cone dimension less one, the one dropped being scale (an edge is pinned as the unit). */
\td: number;
\t/** Half-width of the certified box about the developed member. */
\tradius: number;
\tlo: number[]; hi: number[];
\t/** The generic default position, strictly inside [lo, hi]. */
\tdef: number[];
\t/** Map counts of the smoothed tiling per translational period; V - E + F = 0. */
\tV: number; E: number; F: number;
\tcellPolygons: { n: number; vertices: [number, number, number][][] }[];
\tbasis: [number, number, number][][];
}

export const TJUNCTION_FAMILIES: TJunctionFamily[] = [
''' + "\n".join(body) + "\n];\n")
print(f"wrote {OUT}")
