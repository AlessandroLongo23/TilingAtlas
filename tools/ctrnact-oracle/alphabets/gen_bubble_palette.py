#!/usr/bin/env python3
"""Compose a bubble palette from the single-family ones that already exist.

The bubble boards are all the same construction — an equilateral polygon, one binary state per edge,
the complementary matching rule — differing only in WHICH tile families are on the board. Seven of
those palettes were written out by hand, and the eighth would have been the ninth copy of the same
JSON. So a mixed palette is now a merge: the tiles, their names and their angle words are taken
VERBATIM from the single-family palettes, which is what keeps a mixed board's tile names and its
pure slices comparable to the dedicated boards tile for tile (the cross-validation the tri+hex and
tri+square runs rest on).

Only `famchar` is rewritten, because it has to stay unique across the merged set and it is what
drives the generator's output filenames. Everything else — angles, edge words, the complementary
flag, D, maxValence — is carried through.

    python3 alphabets/gen_bubble_palette.py --from bubble-rhomb bubble-tri --name bubble-rt \
        --comment "..." --out alphabets/palettes/bubble-rt.json
"""
import argparse, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))

ap = argparse.ArgumentParser()
ap.add_argument("--from", dest="src", nargs="+", required=True, help="palette names to merge")
ap.add_argument("--name", required=True)
ap.add_argument("--comment", default="")
ap.add_argument("--out", required=True)
a = ap.parse_args()

tiles, seen, maxval = [], set(), 0
D = None
for name in a.src:
    p = json.load(open(os.path.join(HERE, "palettes", name + ".json")))
    if D is None:
        D = p["D"]
    elif D != p["D"]:
        sys.exit(f"D mismatch: {name} has {p['D']}, expected {D}")
    if not p.get("edgeComplement"):
        sys.exit(f"{name} is not a complementary (bubble) palette")
    maxval = max(maxval, p["maxValence"])
    for t in p["tiles"]:
        if t["name"] in seen:
            sys.exit(f"duplicate tile name {t['name']} — two sources carry the same family")
        seen.add(t["name"])
        # famchar is regenerated: the sources each start at "a", so merging them verbatim would
        # collide, and a collision silently overwrites the generator's per-tile output files.
        tiles.append({**t, "famchar": "t%02d" % len(tiles)})

json.dump(
    {
        "name": a.name,
        "D": D,
        # The tightest family on the board sets the valence, so the max over sources is exact and not
        # a bound — same reasoning every single-family palette states for its own number.
        "maxValence": maxval,
        "edgeComplement": True,
        "edgeLengths": {"B": "1", "I": "1"},
        "comment": a.comment or f"Merged bubble palette: {' + '.join(a.src)}. Built by gen_bubble_palette.py.",
        "tiles": tiles,
    },
    open(a.out, "w"),
    indent=2,
)
print(f"[gen] {a.name}: {len(tiles)} tiles from {', '.join(a.src)} -> {a.out}")
