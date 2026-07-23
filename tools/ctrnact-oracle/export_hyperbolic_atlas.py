#!/usr/bin/env python3
"""Merge developed hyperbolic patches (develop_hyperbolic.py output) into the atlas' two public JSON
files, deduping by TILING IDENTITY and filtering to the tilings that actually develop.

  python3 export_hyperbolic_atlas.py \
    --cells scratch-hyp-p7k2/cells.json \
    --developed ../../public/hyperbolic-developed.json \
    --reference ../../public/reference-atlas-hyperbolic.json \
    --rebuild [--write]

IDENTITY (rewritten 2026-07-23, third attempt — NOTES §80 holds the graveyard). A tiling's identity is
the canonical form of the MINIMAL Delaney–Dress symbol built from its block's quotient darts at the
block's forced edge length (dsymbol_from_darts.analyse). That is a complete isomorphism invariant with
no radius anywhere, and the minimal image is the tiling under its FULL symmetry group, so

    k = #{1,2}-orbits of the minimal image        — exact, not a lower bound
    two records are the same tiling  <=>  equal canonical keys — a hashable dict lookup, no clustering

The two prior identities are both dead: dedup by vertex configuration is a Euclidean reflex (in H² the
figure does not determine the tiling — 4.4.4.6 carries at least two distinct 1-uniform tilings), and
canonical r-ball codes over the developed patch over-count orbits on sub-symmetry presentations (they
split balls that are isomorphic; the 2595-tiling count they produced was wrong and was never shipped).

STRUCTURAL CONSEQUENCE: minimal image only ever MERGES chambers, so true k <= the block's own orbit
count. A k<=2 enumeration can only yield k<=2 tilings; the k=4 entries in the reverted 2026-07-22 run
were ball-code artifacts. The report asserts k <= block-label per record and screams otherwise.

THE GATE is now admission-for-shipping, not identity: a class ships only if one of its blocks develops
cleanly to --gate-boundr (fills the disk: >= min-faces, empty arc <= max-arc, no vertex angle fold).
Identity is decided combinatorially BEFORE the gate, so only one candidate per class is developed in
the common case — the expensive geometric step runs per TILING, not per block. A class whose every
candidate fails the gate is reported loudly: a valid hyperbolic D-symbol should always develop, so a
whole-class failure means a developer bug, not a non-tiling.

Why the --min-faces filter still exists at all: the negative-defect solver emits every angle-valid
vertex figure, but develop_hyperbolic already rejects blocks with no common edge length; what remains
should tile. The gate keeps the shelf honest against developer/renderer failures and folds.

--rebuild regenerates both files from the given cells instead of appending, reusing the id of any
shipped entry whose canonical key matches so /play links and tests keep working. Dry-run by default;
--write commits.
"""
import argparse
import hashlib
import json
import math
import os
import sys
import time
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import develop_hyperbolic as dh          # develop_patch, to re-grow a record from its stored darts
from dsymbol_from_darts import analyse


def dotted(fig):
    return ".".join(str(x) for x in fig)


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
    toward the rim. A genuine tiling developed deep fills the disk (tiny arc from rim raggedness); a
    broken development leaves a black wedge (large arc). check_patch never checks this — it only
    validates the faces that closed, not that they cover the disk. Sampled on circles via Euclidean
    point-in-(geodesic-)face; geodesic edges bow inward so this slightly over-covers, which only makes
    the gate stricter about real holes."""
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


def deep_develop(rec, boundR):
    """Re-develop a record from its stored quotient darts out to a larger disk radius, falling back to
    the record's own shallow geometry when the deep run trips the instance guard or shrinks.

    The gate needs depth: at the shipped boundR=0.95 the tilings with the largest cells look sparse
    ({8,4} puts FOUR faces in that disk) and any fullness rule punishes exactly them. Re-grown to
    0.995 every real tiling fills the disk. The guard trips only on DENSE tilings ({3,7}, {3,8}, {7,6}
    have tens of thousands of instances at 0.995) — and those are exactly the ones whose SHALLOW patch
    already fills the disk with hundreds of faces, so the fallback is safe in the direction that
    matters. Returning None here instead cost the gate the densest regular tilings (2026-07-23). The
    SHIPPED patch stays the shallow one — this deeper development only ever decides admission."""
    d = rec.get("darts")
    if not d:
        return {"vertices": rec["vertices"], "faces": rec["faces"]}
    try:
        V, _E, F = dh.develop_patch(d["rneig"], d["glue"], d["lvert"], rec["edgeLength"],
                                    boundR=boundR, guard=500000)
    except Exception:
        return {"vertices": rec["vertices"], "faces": rec["faces"]}
    if len(F) < len(rec["faces"]):
        return {"vertices": rec["vertices"], "faces": rec["faces"]}
    return {"vertices": [[float(x), float(y)] for (x, y) in V], "faces": [list(map(int, f)) for f in F]}


def fold_excess(patch, l):
    """max over vertices of (sum of incident face interior angles) − 2π.

    develop_patch does NOT test injectivity: it keys an instance on (quotient dart, position, heading),
    so it dedups a dart against ITSELF at a repeated frame but happily keeps two DIFFERENT darts landing
    on one frame. That is a fold, and nothing upstream rejects it. A fold that lands vertex-on-vertex is
    visible here, because the position-keyed vertex dedup merges the two copies and the merged vertex
    then carries more than a full turn of faces. (A fold whose sheets are misaligned stays invisible —
    stated as a limitation, not fixed.)"""
    ang = {}

    def a(n):
        if n not in ang:
            ang[n] = dh.interior_angle(n, l)
        return ang[n]

    s = defaultdict(float)
    for ring in patch["faces"]:
        for v in ring:
            s[v] += a(len(ring))
    return max(s.values()) - 2 * math.pi if s else 0.0


def content_key(rec, boundR):
    """Cache key for the gate verdict: the block itself, not the record's id. Record ids COLLIDE across
    cells files from different palettes (21 shared ids between hyp-p7 and hyp-k2 — same blocks there,
    but nothing enforces it), so an id-keyed cache can serve the wrong verdict."""
    d = rec["darts"]
    blob = json.dumps([d["rneig"], d["glue"], d["lvert"],
                       round(float(rec["edgeLength"]), 9), boundR], separators=(",", ":"))
    return hashlib.sha1(blob.encode()).hexdigest()


def _measure(rec, boundR, args, cache):
    """(passed, nfaces, arc) at one radius. Raw measurements cached by block content, so threshold
    changes don't invalidate the cache."""
    ck = content_key(rec, boundR)
    m = cache.get(ck)
    if m is None:
        deep = deep_develop(rec, boundR)
        nfaces, arc = len(deep["faces"]), max_empty_arc(deep)
        fold = fold_excess(deep, rec["edgeLength"])   # unconditional: the cache must hold the real value
        m = [nfaces, arc, fold]
        cache[ck] = m
    nfaces, arc, fold = m
    return (nfaces >= args.min_faces and arc <= args.max_arc and fold <= 1e-6), nfaces, arc


def gate(rec, args, cache):
    """Two-stage: measure at --gate-boundr; an arc-ONLY failure re-measures at --gate-retry. Giant-cell
    tilings (ℓ≈2.2 octagon configs) close so few faces at 0.995 that the sampled circles thread cell-
    sized rim gaps of 8–9° — measured deeper those arcs are exactly 0.0° while a genuine hole persists
    at every depth (verified on 4 of the 126 affected classes, 2026-07-23)."""
    ok, nfaces, arc = _measure(rec, args.gate_boundr, args, cache)
    if ok:
        return True, nfaces, arc
    if nfaces >= args.min_faces and arc > args.max_arc:
        return _measure(rec, args.gate_retry, args, cache)
    return False, nfaces, arc


def id_for(orbits, k):
    if k == 1:
        return "hyp-" + "-".join(map(str, orbits[0]))
    return f"hyp-k{k}-" + "__".join("-".join(map(str, o)) for o in orbits)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", required=True, nargs="+", help="develop_hyperbolic.py cells JSON(s)")
    ap.add_argument("--developed", required=True, help="public/hyperbolic-developed.json (patches)")
    ap.add_argument("--reference", required=True, help="public/reference-atlas-hyperbolic.json (entries)")
    ap.add_argument("--max-valence", type=int, default=8)
    ap.add_argument("--max-side", type=int, default=8,
                    help="reject tilings with a polygon larger than this — the developed-patch renderer "
                         "blobs on >=9-gons (their strongly-bowed geodesic edges aren't tessellated in the fill)")
    ap.add_argument("--min-faces", type=int, default=4,
                    help="minimum faces in the GATE development (at --gate-boundr), not in the shipped "
                         "patch. Only a degenerate-development floor: {7,6} closes just 18 faces at "
                         "0.995 (cells of edge 2.39 barely fit the disk), so any ambitious floor is a "
                         "size filter punishing big-cell tilings — the §80 bug one ring further out. "
                         "The empty-arc and fold tests are the load-bearing gate.")
    ap.add_argument("--max-arc", type=float, default=6.0,
                    help="reject developments that leave an empty angular wedge wider than this (deg). "
                         "At 0.995 a real tiling fills the disk, so this is the load-bearing half of the gate")
    ap.add_argument("--gate-cache", default="scratch-hyp-gate-cache.json",
                    help="memoise the (faces, arc, fold) measurements per block so re-runs skip the developer")
    ap.add_argument("--gate-boundr", type=float, default=0.995,
                    help="disk radius the tileability gate is measured at")
    ap.add_argument("--gate-retry", type=float, default=0.998,
                    help="deeper radius an arc-only failure is re-measured at (rim artifacts vanish, "
                         "real holes persist)")
    ap.add_argument("--max-k", type=int, default=99,
                    help="ship tilings up to this many vertex orbits. Minimal image only merges, so a "
                         "k<=2 block enumeration cannot produce k>2 anyway — the flag exists for future "
                         "deeper solver runs.")
    ap.add_argument("--rebuild", action="store_true",
                    help="regenerate both files from --cells instead of appending (ids of shipped entries "
                         "whose canonical key matches are reused)")
    ap.add_argument("--write", action="store_true", help="write the two files in place (else dry-run)")
    args = ap.parse_args()

    cells = []
    for path in args.cells:
        cells += json.load(open(path))
    developed = json.load(open(args.developed))
    reference = json.load(open(args.reference))
    render_cell = next((e["renderCell"] for e in reference if "renderCell" in e), {})
    kof = {e["developed"]["patch"]: e["k"] for e in reference if "developed" in e}

    # ---- identity first: exact, combinatorial, microseconds per block --------------------------------
    t0 = time.time()
    classes = {}                                     # canonical key -> list of records
    invalid = defaultdict(int)
    label_violations = []
    for r in cells:
        d = r.get("darts")
        if not d:
            invalid["no darts"] += 1
            continue
        ident = analyse(d["rneig"], d["glue"], d["lvert"], r["edgeLength"])
        if not ident["valid"]:
            invalid[ident["reason"].split("(")[0].strip()] += 1
            continue
        if ident["k"] > int(r.get("k", ident["k"])):
            label_violations.append((r["id"], r.get("k"), ident["k"]))
        r["_id"] = ident
        classes.setdefault(ident["key"], []).append(r)
    print(f"cells in: {len(cells)}  |  valid D-symbols: {sum(len(v) for v in classes.values())}  "
          f"|  distinct tilings: {len(classes)}  ({time.time() - t0:.1f}s)")
    for reason, n in sorted(invalid.items()):
        print(f"    dropped {n}: {reason}")
    if label_violations:
        print(f"    !!! INVARIANT VIOLATED — minimal image cannot RAISE k above the block's own orbit "
              f"count, yet: {label_violations[:10]}")

    # ---- shape caps on the TILING (its orbit figures), not on presentations --------------------------
    kept = {}
    capped = 0
    for key, recs in classes.items():
        orbits = recs[0]["_id"]["orbits"]
        if max(len(o) for o in orbits) > args.max_valence or max(max(o) for o in orbits) > args.max_side:
            capped += 1
            continue
        kept[key] = recs
    print(f"past the valence/side caps: {len(kept)} tilings ({capped} capped)")

    # ---- gate: one development per TILING in the common case -----------------------------------------
    cache = {}
    if args.gate_cache and os.path.exists(args.gate_cache):
        cache = json.load(open(args.gate_cache))
        cache = {k: v for k, v in cache.items() if isinstance(v, list)}   # drop the old boolean format
    tilings, gate_failed = [], []
    t0 = time.time()
    for i, (key, recs) in enumerate(sorted(kept.items())):
        if i and i % 200 == 0:
            el = time.time() - t0
            print(f"    gate {i}/{len(kept)}  {el:.0f}s elapsed, ~{el / i * (len(kept) - i):.0f}s left, "
                  f"{len(tilings)} through", flush=True)
        rep = None
        for r in sorted(recs, key=lambda r: -len(r["faces"])):
            ok, nfaces, arc = gate(r, args, cache)
            if ok:
                rep = r
                r["_arc"] = arc
                break
        if rep is None:
            gate_failed.append(recs[0])
            continue
        tilings.append(rep)
    print(f"    gate done in {time.time() - t0:.0f}s: {len(tilings)} tilings pass, "
          f"{len(gate_failed)} classes fail every candidate")
    if args.gate_cache:
        json.dump(cache, open(args.gate_cache, "w"))
    if gate_failed:
        print("    !!! classes with a VALID D-symbol that never develop — investigate the developer:")
        for r in gate_failed[:20]:
            print(f"        {r['id']} {r['vertexConfig']} ℓ={r['edgeLength']:.4f} "
                  f"({' + '.join(dotted(o) for o in r['_id']['orbits'])})")

    # ---- ids: hand every already-shipped tiling back the id it has ------------------------------------
    # /play deep links, the Dirichlet certification test and tiling-of-the-day all key on shipped ids.
    # Every shipped patch carries its darts, so its canonical key computes the same way.
    shipped_id_by_key = {}
    for p in developed:
        d = p.get("darts")
        if not d:
            continue
        ident = analyse(d["rneig"], d["glue"], d["lvert"], p["edge"])
        if ident["valid"]:
            shipped_id_by_key[ident["key"]] = p["id"]

    out_patches, out_entries, matched = [], [], set()
    used_ids = set() if args.rebuild else {p["id"] for p in developed}
    rows = []
    withheld = [r for r in tilings
                if r["_id"]["k"] > args.max_k and r["_id"]["key"] not in shipped_id_by_key]
    withheld_keys = {r["_id"]["key"] for r in withheld}
    for r in sorted(tilings, key=lambda r: (r["_id"]["k"], r["edgeLength"], r["_id"]["orbits"])):
        ident = r["_id"]
        orbits, k = ident["orbits"], ident["k"]
        if ident["key"] in withheld_keys:
            continue
        prev_id = shipped_id_by_key.get(ident["key"])
        if prev_id is not None:
            matched.add(prev_id)
            if not args.rebuild:
                continue                                   # append mode: already shipped, nothing to do
            pid = prev_id                                  # rebuild: hand the tiling back its id
        else:
            pid = base = id_for(orbits, k)
            n = 0
            while pid in used_ids:          # same figure, same k, different tiling -> -b, …, -z, -ba, …
                n += 1
                s, m = "", n
                while m:
                    m, rdig = divmod(m - 1, 25)
                    s = chr(ord("b") + rdig) + s
                pid = f"{base}-{s}"
        used_ids.add(pid)
        family = " + ".join(dotted(o) for o in orbits)
        c = orbits[0]
        name = (f"{{{c[0]},{len(c)}}}" if k == 1 and len(set(c)) == 1 else family)
        faces = r["faces"]
        # SHIP THE DARTS, NOT THE GEOMETRY. Every render path already re-develops from the quotient
        # darts (hyperbolicDevelopClient, hyperbolicDirichlet, hyperbolicIslamic, hyperbolicReduce) —
        # the baked vertices/faces were a fallback nothing reached. At ~1000 tilings they would be a
        # 10 MB eager fetch; the darts are 0.2 MB.
        out_patches.append({"id": pid, "name": name, "config": family, "edge": r["edgeLength"],
                            "tiles": len(faces), "darts": r["darts"]})
        out_entries.append({
            "id": pid, "source": "hyperbolic", "k": k, "family": family, "geometry": "hyperbolic",
            "developed": {"patch": pid},
            "discoverer": "Čtrnáct engine (SU(1,1) developer)",
            "note": (f"{family} — engine-developed {'k=' + str(k) + ' ' if k > 1 else ''}hyperbolic "
                     f"tiling, vertex configuration {family}. Enumerated by the Čtrnáct combinatorial engine "
                     "(negative-defect closure); identity and k are the minimal Delaney–Dress symbol of its "
                     "quotient, developed to exact Poincaré-disk geometry by the SU(1,1) flood-fill developer."),
            "renderCell": render_cell,
        })
        rows.append((pid, family, k, len(faces), r["_arc"], r["edgeLength"],
                     "kept" if prev_id is not None else "NEW",
                     kof.get(prev_id) if prev_id is not None else None))

    print(f"\nshipped patches: {len(developed)}  |  matched by the rerun: {len(matched)}  "
          f"|  shipped but NOT reproduced: {len(developed) - len(matched)}")
    for p in developed:
        if p["id"] not in matched:
            print(f"    ! missing from rerun: {p['id']} ({p['config']})")
    print()
    for pid, fam, k, n, arc, l, state, oldk in sorted(rows, key=lambda x: (x[2], x[1])):
        flag = "" if state == "kept" else "   <<< NEW"
        if oldk is not None and oldk != k:
            flag += f"   [k {oldk} -> {k}]"
        print(f"  {pid:34} {fam:28} k={k} {n:>4} tiles  arc={arc:>4.0f}°  ℓ={l:.4f}{flag}")

    # Number the tilings that share a vertex figure. In H² the figure does not identify the tiling, so a
    # family can carry a dozen distinct ones; without an index the catalogue would show a dozen rows all
    # labelled 4.4.6.4.6.6. `family` itself stays the bare configuration — other code parses it.
    fam_total = defaultdict(int)
    for e in out_entries:
        fam_total[e["family"]] += 1
    seen_fam = defaultdict(int)
    for e in out_entries:
        n = fam_total[e["family"]]
        if n > 1:
            seen_fam[e["family"]] += 1
            e["variant"] = seen_fam[e["family"]]
            e["variants"] = n

    news = sum(1 for r in rows if r[6] == "NEW")
    kdist = defaultdict(int)
    for r in rows:
        kdist[r[2]] += 1
    print(f"\ntotal {len(rows)} tilings ({news} new, {len(rows) - news} already shipped)  "
          f"by k: {', '.join(f'k={k}: {n}' for k, n in sorted(kdist.items()))}")
    if withheld:
        wk = defaultdict(int)
        for r in withheld:
            wk[r["_id"]["k"]] += 1
        print(f"\nwithheld: {len(withheld)} tilings with k > {args.max_k} "
              f"({', '.join(f'k={k}: {n}' for k, n in sorted(wk.items()))})")

    if not args.write:
        print("\n(dry run — pass --write to update the files)")
        return
    if args.rebuild:
        patches, entries = out_patches, out_entries
    else:
        patches, entries = developed + out_patches, reference + out_entries
    json.dump(patches, open(args.developed, "w"), ensure_ascii=False)
    json.dump(entries, open(args.reference, "w"), ensure_ascii=False, indent=1)
    print(f"\nwrote {args.developed} ({len(patches)} patches)")
    print(f"wrote {args.reference} ({len(entries)} entries)")


if __name__ == "__main__":
    main()
