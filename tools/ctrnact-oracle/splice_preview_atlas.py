#!/usr/bin/env python3
"""Splice a partial-solve preview cells file into public/reference-atlas.json IN PLACE.

Fast path for previewing an in-progress run without the ~10 min full atlas rebuild: drops any
prior entries sharing the cells file's id-prefix, maps each cell record to a ReferenceTiling, and
appends them with preview:true (a loud, honest flag — these come from a solve that has NOT finished,
so the set is incomplete and uncertified). Re-run any time to refresh the preview.

With --families, this also folds free-alpha families the way the full build (build-reference-atlas.ts
Phases 4-5) does: preview snapshots whose vertype is a detected family member are dropped, and one
alpha-slider entry per family (for this k) is injected instead — evaluated at the family's default
alpha, exactly as lib/utils/paramCell.ts:evaluateParamCell does. Without this, every refresh would
re-add the family members as standalone cards and visually un-group the families on each run.

Usage:
  python3 splice_preview_atlas.py --cells <preview.cells.json> --atlas ../../public/reference-atlas.json \
      [--families ../../experiments/star-oracle/ctrnact-star-families.cells.json]
"""
import argparse
import json
import math
import re


def family_label(orbits):
    toks = set()
    for orb in orbits:
        body = re.sub(r"^\(|\)[A-Za-z0-9]*$", "", orb)
        for t in body.split(","):
            m = re.match(r"(\d+)\*", t)
            toks.add(f"{m.group(1)}*" if m else t)
    return ".".join(sorted(toks, key=lambda s: (int(re.match(r'\d+', s).group()), s)))


def family_symbol_label(symbol):
    """Tile-token label from a family symbol, matching build-reference-atlas.ts Phase 5."""
    toks = set()
    for n in re.findall(r"(\d+)\*[pd]", symbol):
        toks.add(f"{n}*")
    for n in re.findall(r"[(,](\d+)[,)]", symbol):
        toks.add(n)
    return ".".join(sorted(toks, key=lambda s: (int(re.match(r'\d+', s).group()), s)))


def eval_terms(terms, delta):
    """Sum_m (re + i*im) * e^(i*m*delta) -> [x, y]; mirrors paramCell.ts:evalTerms."""
    x = y = 0.0
    for m, re_, im_ in terms:
        c = math.cos(m * delta)
        s = math.sin(m * delta)
        x += re_ * c - im_ * s
        y += re_ * s + im_ * c
    return [x, y]


def render_family_cell(fam):
    """Evaluate a family's parametric cell at its default alpha (delta = 0 there)."""
    p0 = fam["params"][0]
    delta = (p0["defaultAlphaDeg"] - p0["alpha0Deg"]) * math.pi / 180.0
    return {
        "cellPolygons": [
            {
                "n": p["n"],
                **({"star": True} if p.get("star") else {}),
                "vertices": [eval_terms(v, delta) for v in p["vertices"]],
            }
            for p in fam["cellPolygons"]
        ],
        "basis": [eval_terms(fam["basis"][0], delta), eval_terms(fam["basis"][1], delta)],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", required=True)
    ap.add_argument("--atlas", required=True)
    ap.add_argument("--families", default=None,
                    help="families cells file; fold detected members + inject slider entries for this k")
    args = ap.parse_args()

    cells = json.load(open(args.cells))["records"]
    prefix = re.match(r"(.*?-k\d+-preview)", cells[0]["id"]).group(1) if cells else ""
    k = cells[0]["k"] if cells else None
    atlas = json.load(open(args.atlas))

    # free-alpha families detected for this k (proven; only ship those that passed area checks)
    member_vertypes = set()
    fam_entries = []
    fam_prefix = f"ctrnact-star-family-k{k}-"
    if args.families:
        fams = [r for r in json.load(open(args.families))["records"] if r.get("k") == k]
        for fam in fams:
            for m in fam.get("members", []):
                member_vertypes.add(m["vertype"])
            if not fam.get("allChecksPass"):
                print(f"  ⚑ {fam['id']}: area checks failed — NOT injected (never ship an unverified family)")
                continue
            fam_entries.append({
                "id": fam["id"],
                "source": "ctrnact-star",
                "k": fam["k"],
                "family": family_symbol_label(fam["familySymbol"]),
                "renderCell": render_family_cell(fam),
                "alphaRange": fam["params"][0]["alphaRangeDegOpen"],
                "paramCell": {"params": fam["params"], "cellPolygons": fam["cellPolygons"], "basis": fam["basis"]},
                "preview": True,
                # the family itself is proven, but a partial-solve preview is unproven AS A SET;
                # a full atlas rebuild is what certifies the set. Kept loud/honest like siblings.
                "discoverer": "Alessandro Longo",
                "certification": "candidate",
            })

    before = len(atlas)
    atlas = [t for t in atlas
             if not t["id"].startswith(prefix) and not t["id"].startswith(fam_prefix)]
    dropped = before - len(atlas)

    added = folded = 0
    for r in cells:
        if r.get("vertype") in member_vertypes:
            folded += 1
            continue  # represented by its family's slider entry instead
        atlas.append({
            "id": r["id"],
            "source": "ctrnact-star",
            "k": r["k"],
            "family": family_label(r["orbits"]),
            "renderCell": r["renderCell"],
            "preview": True,
            # a partial-solve preview is by definition unproven and surfaced by this work
            "discoverer": "Alessandro Longo",
            "certification": "candidate",
        })
        added += 1

    atlas.extend(fam_entries)

    with open(args.atlas, "w") as f:
        json.dump(atlas, f, separators=(",", ":"))
    fam_msg = f"; {len(fam_entries)} family sliders (folded {folded} members)" if args.families else ""
    print(f"spliced {added} preview entries (prefix {prefix!r}); dropped {dropped} stale{fam_msg}; "
          f"atlas now {len(atlas)} tilings")


if __name__ == "__main__":
    main()
