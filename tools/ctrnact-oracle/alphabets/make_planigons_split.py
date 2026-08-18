#!/usr/bin/env python3
"""Atomise the planigon palette's edges so the search can place planigons NON-EDGE-TO-EDGE.

    python3 alphabets/make_planigons_split.py --max-variants 8 --out alphabets/palettes/planigon-split-lite.json

WHY THE PLANIGONS NEED THIS AT ALL. A planigon's edge between the centroids of an n-gon and an n'-gon
is the sum of their apothems, so the fifteen tiles carry TWELVE different lengths, and unlike the
half-polygon boards -- where one length was twice another and that was the end of it -- these lengths
sit in a lattice with a lot of internal structure. Seven of the twelve are sums of others, in 33 ways:

    L1  = L10+L12 = 3xL12                      L6  = L5+L9 = L9+L11+L12 = 3xL11
    L4  = L1+L9 = 2xL5 = L8+L12 = ... (10)     L7  = L4+L9 = L5+L6 = ... (15)
    L5  = L11+L12                              L8  = L5+L11 = L9+L10 = L9+2xL12 = 2xL11+L12
    L10 = 2xL12

So SEVEN of the twelve lengths admit a T-junction, and the edge-to-edge planigon shelf (18/67/233/749
to k=4) is counting a subset of what these tiles do.

WHY ATOMISING, AND NOT ONE FLAT CORNER PER DECOMPOSITION. The engine glues half-edge TYPE to half-edge
type. Model an L1 edge as [L10|L12] and a neighbour presenting a whole L10 edge fits, but a neighbour
presenting L12 does not -- its edge would have to cover half of the L10 segment, and there is no such
gluing. Model it as [L12|L12|L12] and the L12 neighbour fits but the L10 one does not. The only
subdivision under which EVERY arrangement is reachable is the one where every edge of every tile is cut
into ATOMS -- lengths that are not themselves sums -- because then every gluing is atom against atom.
The atoms are L2 = 6+6sqrt2, L3 = 6+3sqrt2, L9 = 6, L11 = 3+sqrt3, L12 = 2sqrt3.

WHAT IT COSTS. Four lengths have more than one ordered atomic composition (L8 has 6, L6 has 7, L4 has
10, L7 has 45), and a tile needs one variant per combination across its edges, so the full atomisation
is 1,853 tiles where the palette has 15 -- P12.12.3 alone accounts for 1,620 of them. That is not a
palette, it is a reason the run will not finish. `--max-variants` keeps the tiles whose atomisation is
cheap and drops the rest, naming what was dropped in the output's comment so the result is never read
as the whole family.

A dropped tile is a real restriction on the answer: tilings that use it are missing, not absent.
"""
import argparse
import json
import os
from itertools import product

HERE = os.path.dirname(os.path.abspath(__file__))

# p + q*sqrt2 + r*sqrt3, exact and scaled by 6 to clear denominators — the same integers
# make_planigons.py writes into the palette's edgeLengths, read here as triples so that summing them
# is exact. {1, sqrt2, sqrt3} are linearly independent over Q, so equality is componentwise.
LEN = {
    "L1": (0, 0, 6), "L2": (6, 6, 0), "L3": (6, 3, 0), "L4": (6, 0, 6),
    "L5": (3, 0, 3), "L6": (9, 0, 3), "L7": (12, 0, 6), "L8": (6, 0, 4),
    "L9": (6, 0, 0), "L10": (0, 0, 4), "L11": (3, 0, 1), "L12": (0, 0, 2),
}
FLAT = 12  # 180 degrees in units of 360/D, D = 24


def value(t):
    return t[0] + t[1] * 2 ** 0.5 + t[2] * 3 ** 0.5


def atoms():
    """The lengths that are not a sum of two or more others."""
    from itertools import combinations_with_replacement as cwr
    composite = set()
    for tgt in LEN:
        shorter = [n for n in LEN if value(LEN[n]) < value(LEN[tgt]) - 1e-9]
        for r in range(2, 7):
            for c in cwr(shorter, r):
                if tuple(sum(LEN[x][i] for x in c) for i in range(3)) == LEN[tgt]:
                    composite.add(tgt)
    return [n for n in LEN if n not in composite]


def compositions(target, atom_names):
    """Every ORDERED way to write `target` as a sequence of atoms. Order matters: an edge is directed
    and where along it the cut falls is geometry."""
    out = []

    def go(rem, acc):
        if rem == (0, 0, 0):
            out.append(tuple(acc))
            return
        if rem[0] < 0 or rem[1] < 0 or rem[2] < 0:
            return
        for a in atom_names:
            go(tuple(rem[i] - LEN[a][i] for i in range(3)), acc + [a])

    go(LEN[target], [])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--palette", default=os.path.join(HERE, "palettes", "planigon.json"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-variants", type=int, default=8,
                    help="drop any planigon needing more than this many atomised variants")
    ap.add_argument("--only", default="", help="comma-separated tile names to keep, before the cap")
    ap.add_argument("--no-split", action="store_true",
                    help="keep the same tiles with their edges WHOLE — the control run, so that the split "
                         "and unsplit runs differ in exactly one thing and not in tile set as well")
    args = ap.parse_args()

    src = json.load(open(args.palette))
    # The source palette leaves `edges` implicit; make_planigons.py records the assignment in
    # edgeTypes, and palette_spec.normalize_palette is what resolves it. Use that, so this script and
    # the solver are reading the same thing.
    import sys
    sys.path.insert(0, HERE)
    from palette_spec import normalize_palette
    spec = normalize_palette(src)

    A = atoms()
    comps = {n: compositions(n, A) for n in LEN}

    keep, dropped = [], []
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    for t in spec["tiles"]:
        if only and t["name"] not in only:
            dropped.append((t["name"], "not in --only"))
            continue
        n = 1
        for e in t["edges"]:
            n *= len(comps[e])
        if n > args.max_variants:
            dropped.append((t["name"], f"{n} variants"))
        else:
            keep.append((t, n))

    tiles = []
    for t, _ in keep:
        # The control keeps each tile once, edges whole. Selection still runs through the same cap, so
        # the control and the split palette always hold the SAME planigons.
        choices = [tuple((e,) for e in t["edges"])] if args.no_split else product(*[comps[e] for e in t["edges"]])
        for choice in choices:
            angles, edges = [], []
            for i, seq in enumerate(choice):
                angles.append(t["angles"][i])
                edges.append(seq[0])
                # One flat corner per interior division point of this edge.
                for part in seq[1:]:
                    angles.append(FLAT)
                    edges.append(part)
            got = sum(angles)
            want = (len(angles) - 2) * (src["D"] // 2)
            assert got == want, f"{t['name']}: angles sum {got}, want {want}"
            suffix = "".join(str(len(s)) for s in choice)
            tiles.append({
                "kind": "composite",
                "name": f"{t['name']}/{suffix}" if len(tiles) or True else t["name"],
                "famchar": t.get("famchar", t["name"][1]),
                "angles": angles,
                "edges": edges,
            })

    # famchar has to be unique per tile family or the pruner cannot tell two tiles apart; the source
    # palette assigns one per planigon and the variants of one planigon are the SAME tile, so they
    # share it. Two different planigons must not.
    seen = {}
    for t in tiles:
        base = t["name"].split("/")[0]
        seen.setdefault(base, t["famchar"])
    chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    used, remap = set(), {}
    for i, base in enumerate(seen):
        remap[base] = chars[i]
        used.add(chars[i])
    for t in tiles:
        t["famchar"] = remap[t["name"].split("/")[0]]

    drop_note = "; ".join(f"{n} ({why})" for n, why in dropped) or "none"
    out = {
        "name": os.path.splitext(os.path.basename(args.out))[0],
        "D": src["D"],
        "tileGeometry": "euclidean",
        "closure": "euclidean",
        "comment": (
            ("THE CONTROL: the same planigons with their edges WHOLE, so that the difference against the "
             "matching -split palette is exactly what dividing an edge buys and not a change of tile set. "
             if args.no_split else "") +
            "THE PLANIGONS, atomised so the search can place them NON-EDGE-TO-EDGE. Seven of the twelve "
            "planigon edge lengths are sums of others (33 decompositions), so seven admit a T-junction "
            "where one tile's edge is met by two neighbours, and the edge-to-edge planigon shelf counts "
            "only a subset of what these tiles do. Every edge here is cut into ATOMS -- the lengths that "
            "are not themselves sums, L2 L3 L9 L11 L12 -- with a flat 180-degree corner at each interior "
            "division point, which is the only subdivision under which every arrangement is reachable, "
            "because the engine matches half-edge TYPE to half-edge type and atoms glue against atoms. "
            "Generated by alphabets/make_planigons_split.py. "
            f"KEPT {len(keep)} of 15 planigons as {len(tiles)} variants; DROPPED: {drop_note}. A dropped "
            "planigon is a restriction on the answer: tilings that use it are missing from this run, not "
            "absent from the plane. Needs the min_len fix of 2026-08-17 in gen_alphabet.py (a >= D//2)."
        ),
        "edgeLengths": ({k: v for k, v in spec["edgeLengths"].items()} if args.no_split
                        else {k: v for k, v in spec["edgeLengths"].items() if k in A}),
        "tiles": tiles,
    }
    json.dump(out, open(args.out, "w"), indent=2)
    print(f"[split] atoms: {' '.join(A)}")
    print(f"[split] kept {len(keep)} planigons -> {len(tiles)} tile variants")
    for n, why in dropped:
        print(f"[split]   dropped {n}: {why}")
    print(f"[split] wrote {args.out}")


if __name__ == "__main__":
    main()
