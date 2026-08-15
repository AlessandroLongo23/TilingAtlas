#!/usr/bin/env python3
"""cross-tier-dedup.py — does a candidate tier add tilings the shelf does not already carry?

Why this exists (2026-08-09). The k=3 quotient tier came back with 7 families measured k=1 and 25 pinned
tilings measured k=2. A k=3 block can realise to a tiling of lower uniformity — the search counts ABSTRACT
vertex orbits and distinct abstract classes can land on one geometric figure — and when it does, the tiling
may already be on the k≤2 shelf under a different cell. Shipping both double-counts.

⚑ The obvious method does not work, and it fails silently. Sampling both sides' parameters and looking for
a congruent pair has essentially no recall on continuous families: two representations of one family are
the same tiling at CORRESPONDING parameters, and nothing makes a grid on one side land on the
corresponding point of the other. Measured with a positive control — shelf entries fed back in as
candidates — it found 0 of 27. Any verdict from that method reads "all new" and means nothing.

What works is exact. Two facts do the whole job:

  * A tiling's combinatorial MAP is constant along its family, so `tiling_key.build_map` computes it once
    from any generic member. The map fixes the ambient corner-angle space, since its tile-closure and
    vertex-closure rows are read straight off it.
  * A family is an affine SUBSPACE of that space. So "same family" is subspace equality and "adds nothing"
    is subspace containment, both decided in linear algebra, with the map's automorphisms supplying the
    alignments to try.

The map alone is NOT enough and assuming so is a trap this file fell into once: `period-family-k2-001` and
`-021` both tile hexagons three-to-a-vertex, so both carry the honeycomb map, and they are different
entries — one uses two period-3 hexagons, the other a regular hexagon and a period-3 one. Same ambient
space, different subspace.

Verdicts, per candidate:
  same      — subspace equality with a shelf entry. The shelf already has this family. Drop.
  inside    — the candidate's family is strictly contained in a shelf entry's. Every tiling it shows is
              reachable there, so shipping it is a double-count of the shelf's own rule. Curation call.
  contains  — the candidate is STRICTLY LARGER than a shelf entry: the shelf's entry is the redundant one.
  new       — no shelf entry shares its map, or none whose subspace meets it.

Run:
  python3 scripts/cross-tier-dedup.py \
      --shelf public/reference-atlas-period.json \
      --candidate experiments/period-oracle/ctrnact-quotient-families-k3-generic.cells.json \
      --log experiments/results/cross-tier-dedup-2026-08-09.log
"""
import argparse
import importlib.util
import json
import os
import sys
import time
from collections import Counter, defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "ctrnact-oracle"))

import tiling_key as TK                                        # noqa: E402
import vertex_orbits as vo                                     # noqa: E402

LOG = None


def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    if LOG:
        LOG.write(line + "\n")
        LOG.flush()


def subspaces(entries, label, log):
    out, bad = {}, 0
    for r in entries:
        try:
            key, labs, vecs = TK.family_subspace(r)
        except Exception as e:                                  # noqa: BLE001
            key, labs, vecs = None, None, []
            log(f"  ⚑ {r['id']}: {e}")
        if not key or not vecs:
            bad += 1
            continue
        out[r["id"]] = (key, labs, vecs, r)
    log(f"{label}: {len(out)} of {len(entries)} keyed ({bad} unkeyable)")
    return out


def main():
    global LOG
    ap = argparse.ArgumentParser()
    ap.add_argument("--shelf", required=True)
    ap.add_argument("--candidate", required=True)
    ap.add_argument("--log", required=True)
    ap.add_argument("--json", default=None)
    args = ap.parse_args()
    LOG = open(args.log, "w")

    shelf = json.load(open(args.shelf))
    cand = json.load(open(args.candidate))
    fams, rigid = cand.get("records", []), cand.get("rigid", [])
    log(f"=== cross-tier dedup: {len(fams)} candidate families + {len(rigid)} pinned "
        f"against {len(shelf)} shelf entries ===")

    S = subspaces(shelf, "shelf", log)
    C = subspaces(fams + rigid, "candidates", log)

    by_key = defaultdict(list)
    for sid, (k, _, _, _) in S.items():
        by_key[k].append(sid)

    log("")
    log("shelf self-check (a shelf that contains itself twice is its own bug):")
    seen = set()
    for k, ids in by_key.items():
        if len(ids) < 2:
            continue
        for i, a in enumerate(ids):
            for b in ids[i + 1:]:
                rel = TK.relate(S[a][:3], S[b][:3])
                if rel != "disjoint":
                    log(f"  {a} vs {b}: {rel}")
                    seen.add((a, b, rel))

    # ── internal pass first ───────────────────────────────────────────────────────────────────────────
    # The tier's own dedup ran on the sampled congruence, the method the positive control just failed, so
    # the candidate set cannot be assumed internally clean. Survivor preference is the LARGER family: a
    # bigger subspace shows every tiling the smaller one does and more.
    log("")
    log("internal pass (the tier against itself):")
    cby = defaultdict(list)
    for cid, (k, _, _, _) in C.items():
        cby[k].append(cid)
    dropped_internal = {}
    for k, ids in cby.items():
        ids = sorted(ids, key=lambda i: (-(C[i][3].get("P") or 0), i))
        for a in ids:
            if a in dropped_internal:
                continue
            for b in ids:
                if b == a or b in dropped_internal:
                    continue
                rel = TK.relate(C[b][:3], C[a][:3])          # is b inside/equal to a?
                if rel in ("same", "inside"):
                    dropped_internal[b] = (rel, a)
    for b, (rel, a) in sorted(dropped_internal.items()):
        log(f"  {b:<28} {rel} {a} — dropped")
    log(f"  internal: {len(dropped_internal)} of {len(C)} dropped, {len(C) - len(dropped_internal)} survive")

    log("")
    log("shelf pass (survivors against the shelf):")
    rows = []
    tally = Counter()
    for cid, (k, labs, vecs, rec) in C.items():
        if cid in dropped_internal:
            rel, a = dropped_internal[cid]
            rows.append({"id": cid, "k": rec.get("k"), "P": rec.get("P"),
                         "verdict": f"internal-{rel}", "match": a, "ship": False})
            tally[f"internal-{rel}"] += 1
            continue
        verdict, match = "new", None
        for sid in by_key.get(k, ()):
            rel = TK.relate((k, labs, vecs), S[sid][:3])
            if rel == "same":
                verdict, match = "same", sid
                break
            if rel in ("inside", "contains") and verdict == "new":
                verdict, match = rel, sid
        tally[verdict] += 1
        rows.append({"id": cid, "k": rec.get("k"), "P": rec.get("P"), "verdict": verdict,
                     "match": match, "ship": verdict in ("new", "contains")})
        if verdict != "new":
            log(f"  {cid:<28} k={rec.get('k')} P={rec.get('P')} → {verdict} {match}")
    log("")
    log("VERDICT: " + ", ".join(f"{v}: {n}" for v, n in sorted(tally.items())))
    for v in ("same", "inside", "contains"):
        sub = [r for r in rows if r["verdict"] == v]
        if sub:
            log(f"  {v} by k: " + ", ".join(f"k={kk}: {n}" for kk, n in
                                            sorted(Counter(r["k"] for r in sub).items())))
    ship = [r for r in rows if r["ship"]]
    log(f"SHIPPABLE: {len(ship)} of {len(rows)} — " + ", ".join(
        f"k={kk}: {n}" for kk, n in sorted(Counter(r["k"] for r in ship).items())))
    log("  'contains' entries SHIP: the candidate is the larger family, and the shelf entry it contains "
        "stays put — dropping verified concrete content is not this script's call.")
    if args.json:
        json.dump(rows, open(args.json, "w"), indent=1)
        log(f"wrote {args.json}")


if __name__ == "__main__":
    main()
