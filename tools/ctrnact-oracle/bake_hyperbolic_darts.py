#!/usr/bin/env python3
"""Enrich public/hyperbolic-developed.json IN PLACE with the quotient darts {rneig, glue, lvert, seed}
for each already-shipped patch, so the TS client can re-develop the tiling on the fly (fill-to-rim,
re-centred on the view). This does NOT re-select or change any geometry — it only ADDS the `darts` field.

It matches each shipped patch to a freshly-developed cell (develop_hyperbolic.py, now dart-carrying) by:
  1. canonical vertex-config key  (unique across shipped patches — the export dedups by it),
  2. tile count and edge length,
  3. the rotation/reflection-invariant multiset of vertex radii (all develops seed at the origin, so two
     developments of the same tiling differ only by a rotation/reflection about 0 → identical radii).
Any patch that fails to match is reported and left without darts (the renderer falls back to the baked
finite patch for it), so a miss is loud, never silent.

Usage: python3 bake_hyperbolic_darts.py --developed ../../public/hyperbolic-developed.json \
          --cells scratch-hyp-p7/cells.json scratch-hyp-r3/cells.json scratch-hyp-k2/cells.json [--write]
"""
import argparse
import json
import math
from collections import defaultdict


def canon(cfg):
    t = [int(x) for x in str(cfg).replace("x", ".").split(".") if str(x).strip().isdigit()]
    n = len(t)
    return min(tuple(s[i:] + s[:i]) for s in (t, t[::-1]) for i in range(n))


def key_of(vc):
    return tuple(sorted(canon(o) for o in str(vc).split(" + ")))


def radii_sig(vertices, cut=0.8):
    """Sorted, rounded multiset of vertex radii within `cut` of the origin. Rotation/reflection invariant
    (all develops seed vertex 0 at the origin) AND truncation-robust: the develop fills the disk, so the
    sub-disk r<cut is COMPLETE regardless of where the boundR rim happens to cut (which shifts under a
    rotated seed). Two developments of the same tiling therefore share this signature exactly; distinct
    tilings of the same config differ in it."""
    rs = [math.hypot(x, y) for (x, y) in vertices]
    return tuple(sorted(round(r, 4) for r in rs if r <= cut))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--developed", required=True)
    ap.add_argument("--cells", nargs="+", required=True)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    developed = json.load(open(args.developed))

    # index cells by config key
    by_key = defaultdict(list)
    for path in args.cells:
        for c in json.load(open(path)):
            if "darts" in c:
                by_key[key_of(c["vertexConfig"])].append(c)
    print(f"loaded {sum(len(v) for v in by_key.values())} dart-carrying cells over {len(by_key)} config keys")

    matched, missed = 0, []
    for p in developed:
        key = key_of(p["config"])
        cands = by_key.get(key, [])
        if not cands:
            missed.append((p["id"], "no cell with this config key"))
            continue
        pe, pt = p.get("edge"), p.get("tiles")
        psig = radii_sig(p["vertices"])
        # rank: exact tiles+edge first, then closest radii signature
        scored = []
        for c in cands:
            tiles_ok = c["tiles"] == pt
            edge_ok = pe is not None and abs(c["edgeLength"] - pe) < 1e-5
            csig = radii_sig(c["vertices"])
            sig_exact = csig == psig
            # signature distance (both are sorted tuples; compare when equal length)
            sig_dist = 0.0 if sig_exact else (
                sum(abs(a - b) for a, b in zip(csig, psig)) + abs(len(csig) - len(psig))
                if len(csig) == len(psig) else 1e9 + abs(len(csig) - len(psig)))
            scored.append((not sig_exact, not (tiles_ok and edge_ok), sig_dist, c))
        scored.sort(key=lambda s: (s[0], s[1], s[2]))
        best = scored[0]
        c = best[3]
        # accept only a genuinely good match: exact signature, or exact tiles+edge with tiny sig drift
        good = (not best[0]) or (not best[1] and best[2] < 1e-3)
        if not good:
            missed.append((p["id"], f"best cell weak: sig_exact={not best[0]} te_ok={not best[1]} dist={best[2]:.4g}"))
            continue
        p["darts"] = c["darts"]
        matched += 1

    print(f"matched darts: {matched}/{len(developed)}")
    if missed:
        print("MISSED:")
        for pid, why in missed:
            print(f"  - {pid:32} {why}")

    if not args.write:
        print("\n(dry run — pass --write to update the file)")
        return
    json.dump(developed, open(args.developed, "w"), ensure_ascii=False)
    print(f"\nwrote {args.developed} ({matched} patches now carry darts)")


if __name__ == "__main__":
    main()
