#!/usr/bin/env python3
"""Splice a partial-solve preview cells file into public/reference-atlas.json IN PLACE.

Fast path for previewing an in-progress run without the ~10 min full atlas rebuild: drops any
prior entries sharing the cells file's id-prefix, maps each cell record to a ReferenceTiling, and
appends them with preview:true (a loud, honest flag — these come from a solve that has NOT finished,
so the set is incomplete and uncertified). Re-run any time to refresh the preview.

Usage:
  python3 splice_preview_atlas.py --cells <preview.cells.json> --atlas ../../public/reference-atlas.json
"""
import argparse
import json
import re


def family_label(orbits):
    toks = set()
    for orb in orbits:
        body = re.sub(r"^\(|\)[A-Za-z0-9]*$", "", orb)
        for t in body.split(","):
            m = re.match(r"(\d+)\*", t)
            toks.add(f"{m.group(1)}*" if m else t)
    return ".".join(sorted(toks, key=lambda s: (int(re.match(r'\d+', s).group()), s)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", required=True)
    ap.add_argument("--atlas", required=True)
    args = ap.parse_args()

    cells = json.load(open(args.cells))["records"]
    prefix = re.match(r"(.*?-k\d+-preview)", cells[0]["id"]).group(1) if cells else ""
    atlas = json.load(open(args.atlas))

    before = len(atlas)
    atlas = [t for t in atlas if not t["id"].startswith(prefix)]
    dropped = before - len(atlas)

    added = 0
    for r in cells:
        atlas.append({
            "id": r["id"],
            "source": "ctrnact-star",
            "k": r["k"],
            "family": family_label(r["orbits"]),
            "renderCell": r["renderCell"],
            "preview": True,
        })
        added += 1

    with open(args.atlas, "w") as f:
        json.dump(atlas, f, separators=(",", ":"))
    print(f"spliced {added} preview entries (prefix {prefix!r}); dropped {dropped} stale; "
          f"atlas now {len(atlas)} tilings")


if __name__ == "__main__":
    main()
