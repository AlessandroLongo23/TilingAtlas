#!/usr/bin/env python3
"""Merge developed hyperbolic patches (develop_hyperbolic.py output) into the atlas' two public JSON
files, deduping by canonical vertex configuration and filtering to the tilings that actually develop.

  python3 export_hyperbolic_atlas.py \
    --cells scratch-hyp-k1/cells-b95.json \
    --developed ../../public/hyperbolic-developed.json \
    --reference ../../public/reference-atlas-hyperbolic.json \
    --max-valence 5 --min-faces 40 [--write]

Why the --min-faces filter: the negative-defect solver emits every angle-valid k=1 vertex figure, but
angle-validity is necessary, not sufficient — most configs do NOT admit a real 1-uniform tiling (some,
like 3.5.5.5, provably need k>=3). The SU(1,1) flood-fill then collapses those to a handful of faces.
So a fullness threshold is the tileability gate: a patch that fills the disk (>= min-faces) is a genuine
tiling; one that stalls at <10 faces is angle-valid but not 1-uniform. Dedup keeps, per canonical config,
the map that develops fullest (max faces).

Existing entries are preserved verbatim (ids, hand-written names, geometry) — this only APPENDS configs
not already present. Dry-run by default; pass --write to update the files in place.
"""
import argparse
import json
import math
from collections import defaultdict


def canon(cfg):
    """Canonical (lexicographically minimal rotation+reflection) int tuple of a dotted config string."""
    t = [int(x) for x in str(cfg).replace("x", ".").split(".") if str(x).strip().isdigit()]
    n = len(t)
    return min(tuple(s[i:] + s[:i]) for s in (t, t[::-1]) for i in range(n))


def dotted(canon_tuple):
    return ".".join(str(x) for x in canon_tuple)


def orbits_of(vc):
    """Per-vertex-orbit canonical configs. k=1 → one tuple; k-uniform (develop writes "c1 + c2 + …")
    → one tuple per orbit."""
    return [canon(o) for o in str(vc).split(" + ")]


def key_of(vc):
    """Order-independent dedup key for a (possibly k-uniform) tiling: the multiset of its orbit configs."""
    return tuple(sorted(orbits_of(vc)))


def _face_polys(patch):
    V = patch["vertices"]
    polys = []
    for ring in patch["faces"]:
        pts = [V[i] for i in ring]
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        polys.append((pts, min(xs), max(xs), min(ys), max(ys)))
    return polys


def _inside_any(polys, x, y):
    for pts, x0, x1, y0, y1 in polys:
        if x < x0 or x > x1 or y < y0 or y > y1:
            continue
        c = False
        m = len(pts)
        j = m - 1
        for i in range(m):
            xi, yi = pts[i]
            xj, yj = pts[j]
            if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
                c = not c
            j = i
        if c:
            return True
    return False


def max_empty_arc(patch, radii=(0.5, 0.6, 0.7, 0.8, 0.88), m=240):
    """Largest contiguous angular wedge (degrees) that contains NO tile, worst over several radii out
    toward the rim. This is the tileability gate the eye applies: a genuine 1-uniform tiling fills the
    disk (tiny arc from rim raggedness); a folded/non-embeddable config leaves a black wedge (large arc).
    check_patch never checks this — it only validates the faces that closed, not that they cover the disk.
    Sampled on circles via Euclidean point-in-(geodesic-)face; geodesic edges bow inward so this slightly
    over-covers, which only makes the gate stricter about real holes."""
    polys = _face_polys(patch)
    worst = 0.0
    for r in radii:
        occ = [_inside_any(polys, r * math.cos(2 * math.pi * k / m), r * math.sin(2 * math.pi * k / m))
               for k in range(m)]
        if all(occ):
            continue
        if not any(occ):
            return 360.0
        s = occ.index(True)
        occ = occ[s:] + occ[:s]
        run = best = 0
        for o in occ:
            run = 0 if o else run + 1
            best = max(best, run)
        worst = max(worst, best * 360.0 / m)
    return worst


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", required=True, help="develop_hyperbolic.py cells JSON")
    ap.add_argument("--developed", required=True, help="public/hyperbolic-developed.json (patches)")
    ap.add_argument("--reference", required=True, help="public/reference-atlas-hyperbolic.json (entries)")
    ap.add_argument("--max-valence", type=int, default=5)
    ap.add_argument("--max-side", type=int, default=8,
                    help="reject configs with a polygon larger than this — the developed-patch renderer "
                         "blobs on >=9-gons (their strongly-bowed geodesic edges aren't tessellated in the fill)")
    ap.add_argument("--min-faces", type=int, default=40)
    ap.add_argument("--max-arc", type=float, default=12.0,
                    help="reject configs whose best map has an empty angular wedge wider than this (deg)")
    ap.add_argument("--write", action="store_true", help="write the two files in place (else dry-run)")
    args = ap.parse_args()

    cells = json.load(open(args.cells))
    developed = json.load(open(args.developed))
    reference = json.load(open(args.reference))

    existing_keys = {key_of(p["config"]): p for p in developed}
    existing_ids = {p["id"] for p in developed}
    render_cell = next((e["renderCell"] for e in reference if "renderCell" in e), {})

    # Per tiling (keyed by its multiset of orbit configs), choose the map that best COVERS the disk
    # (least empty arc, then most faces). A config has ~2-3 combinatorial maps; some fold and leave black
    # wedges, so max-faces alone is not enough — max_empty_arc is the tileability gate. Valence is checked
    # PER ORBIT (a k-uniform tiling's orbits each obey the cap), and it's computed only for maps clearing
    # the face floor (degenerate maps are skipped cheaply).
    cand = defaultdict(list)
    for r in cells:
        orbits = orbits_of(r["vertexConfig"])
        if (max(len(o) for o in orbits) <= args.max_valence
                and max(max(o) for o in orbits) <= args.max_side
                and len(r["faces"]) >= args.min_faces):
            cand[key_of(r["vertexConfig"])].append(r)
    best, arcof = {}, {}
    for key, recs in cand.items():
        arc, _nf, k = min((max_empty_arc(r), -len(r["faces"]), i) for i, r in enumerate(recs))
        if arc <= args.max_arc:
            best[key] = recs[k]
            arcof[key] = arc

    new_patches, new_entries = [], []
    for key, r in sorted(best.items(), key=lambda kv: (len(kv[0]), sum(len(o) for o in kv[0]), kv[1]["edgeLength"])):
        if key in existing_keys:
            continue
        orbits = list(key)
        korb = len(orbits)
        family = r["vertexConfig"] if korb > 1 else dotted(orbits[0])
        if korb == 1:
            c = orbits[0]
            pid = "hyp-" + "-".join(map(str, c))
            name = f"{{{c[0]},{len(c)}}}" if len(set(c)) == 1 else family
        else:
            pid = f"hyp-k{korb}-" + "__".join("-".join(map(str, o)) for o in orbits)
            name = family
        if pid in existing_ids:  # defensive: distinct tilings shouldn't collide, but never overwrite
            pid = pid + "-b"
        existing_ids.add(pid)
        faces = r["faces"]
        new_patches.append(
            {"id": pid, "name": name, "config": family, "edge": r["edgeLength"],
             "vertices": r["vertices"], "faces": faces, "tiles": len(faces)}
        )
        new_entries.append({
            "id": pid, "source": "hyperbolic", "k": korb, "family": family, "geometry": "hyperbolic",
            "developed": {"patch": pid},
            "discoverer": "Čtrnáct engine (SU(1,1) developer)",
            "note": (f"{family} — engine-developed {'k=' + str(korb) + ' ' if korb > 1 else ''}hyperbolic "
                     f"tiling, vertex configuration {family}. Enumerated by the Čtrnáct combinatorial engine "
                     "(negative-defect closure) and developed to exact Poincaré-disk geometry by the SU(1,1) "
                     f"flood-fill developer ({len(faces)} tiles shown)."),
            "renderCell": render_cell,
        })

    print(f"existing: {len(developed)}  |  tilings passing arc<={args.max_arc}°: {len(best)}")
    print(f"new (>= {args.min_faces} faces, no wedge, not already shipped): {len(new_patches)}")
    for p in new_patches:
        arc = arcof.get(key_of(p["config"]), 0.0)
        print(f"  + {p['id']:28} {p['config']:20} {p['tiles']:>4} tiles  arc={arc:.0f}°  ℓ={p['edge']:.4f}")

    if not args.write:
        print("\n(dry run — pass --write to update the files)")
        return
    json.dump(developed + new_patches, open(args.developed, "w"), ensure_ascii=False)
    json.dump(reference + new_entries, open(args.reference, "w"), ensure_ascii=False, indent=1)
    print(f"\nwrote {args.developed} ({len(developed) + len(new_patches)} patches)")
    print(f"wrote {args.reference} ({len(reference) + len(new_entries)} entries)")


if __name__ == "__main__":
    main()
