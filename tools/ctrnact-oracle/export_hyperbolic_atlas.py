#!/usr/bin/env python3
"""Merge developed hyperbolic patches (develop_hyperbolic.py output) into the atlas' two public JSON
files, deduping by TILING IDENTITY and filtering to the tilings that actually develop.

  python3 export_hyperbolic_atlas.py \
    --cells scratch-hyp-p7k2/cells.json \
    --developed ../../public/hyperbolic-developed.json.gz \
    --reference ../../public/reference-atlas-hyperbolic.json.gz \
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
import cmath
import hashlib
import json
import math
import multiprocessing as mp
import os
import sys
import time
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hyp_geom
import develop_hyperbolic as dh          # develop_patch, to re-grow a record from its stored darts
from develop_freedraw import read_json, write_json
from dsymbol_from_darts import analyse


# Star faces (hyp-star palette). The D-symbol keys a face by its label, and a 2n-gon label would merge an
# n-star with a regular 2n-gon. A star face is relabelled L*1000: still a multiple of its cycle length
# (DS4), distinct from every polygon, and BLIND to the point angle on purpose. A one-star tiling is one
# member of a family whose point angle is free (hyp_geom.family_range), so the samples the search lands on
# at 60°, 90° and 120° are one tiling, shipped once with its range for the /play slider.
STAR_TOK = {}                                       # label -> (display token, id token)


def face_labels(d):
    """lvert, with each star face (a corner past π) relabelled by its type. Faces are read off the darts
    the way the walk does: the ring of h is h, φ(h) = glue[rneig[h]], …, and alpha[h] is its corner."""
    lv, al = list(d["lvert"]), d.get("alpha")
    if not al:
        return lv
    rn, gl, seen = d["rneig"], d["glue"], set()
    for h0 in range(len(rn)):
        ring, h = [], h0
        while h not in seen:
            seen.add(h)
            ring.append(h)
            h = gl[rn[h]]
        if ring and max(al[h] for h in ring) > math.pi + 1e-9:
            L = lv[rn[ring[0]]]
            lab = L * 1000
            STAR_TOK[lab] = (f"{L // 2}*", f"{L // 2}s")
            for h in ring:
                lv[rn[h]] = lab
    return lv


def identity(d, l):
    ident = analyse(d["rneig"], d["glue"], face_labels(d), l, d.get("alpha"))
    if ident["valid"]:
        # A dent filled by one corner is a real 2-valent vertex in H², but not a counting one: the star
        # palettes' convention is vertex = at least three tiles, so it names no orbit and adds nothing to k.
        ident["orbits"] = [o for o in ident["orbits"] if len(o) > 2]
        ident["k"] = len(ident["orbits"])
    return ident


def star_family(r):
    """A star record re-solved at its family default, in place (edge and turns), so the gate measures the
    member the shelf will show; returns the hypFamily dict, or None for a rigid tiling."""
    if "_fam" in r:
        return r["_fam"]
    r["_fam"] = None
    if r["darts"].get("starKind"):
        dof, j = hyp_geom.family_dof(r["darts"], r["edgeLength"])
        if dof == 1 and j is not None:
            lo, hi = hyp_geom.family_range(r["darts"], r["edgeLength"], j)
            # Shown at mid-range, not at whichever member the solve hit: near the top the dents are almost
            # flat and the card reads as a convex 2n-gon. Unless the edge there is past 2: on some families
            # it grows so fast that mid-range cells barely fit the disk, so take the interior sixth with
            # the shortest edge. A whole degree when one fits inside the range.
            member = lambda a: hyp_geom.family_member(r["darts"], r["edgeLength"], math.radians(a), j)
            deg = lambda a: (lambda d: d if lo < d < hi else round(a, 3))(round(a))
            a0 = deg((lo + hi) / 2)
            m = member(a0)
            if m and m[1] > 2:
                a0, m = min(((a, mm) for a in (deg(lo + (hi - lo) * i / 6) for i in range(1, 6))
                             if (mm := member(a))), key=lambda am: am[1][1], default=(a0, m))
            if m:
                pts, r["edgeLength"] = m
                r["darts"]["alpha"] = hyp_geom.family_turns(r["darts"], pts, r["edgeLength"])
                r["_fam"] = {"alphaRangeDegOpen": [round(lo, 3), round(hi, 3)], "defaultAlphaDeg": a0,
                             **({"param": j} if j else {})}
        elif dof > 1:
            print(f"    ! {r['id']}: {dof} free parameters; shipped rigid at the solved member")
    return r["_fam"]


def _family_one(r):
    star_family(r)
    return r["edgeLength"], r["darts"].get("alpha"), r["_fam"]


def dotted(fig):
    return ".".join(STAR_TOK[x][0] if x in STAR_TOK else str(x) for x in fig)


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
                                    boundR=boundR, guard=500000, turns=d.get("alpha"))
    except Exception:
        return {"vertices": rec["vertices"], "faces": rec["faces"]}
    if len(F) < len(rec["faces"]):
        return {"vertices": rec["vertices"], "faces": rec["faces"]}
    return {"vertices": [[float(x), float(y)] for (x, y) in V], "faces": [list(map(int, f)) for f in F]}


def fold_excess(patch, l):
    """max over vertices of (sum of incident face interior angles) − 2π, each angle MEASURED on the patch
    (a star's corners differ inside one face, so no per-face formula will do).

    develop_patch does NOT test injectivity: it keys an instance on (quotient dart, position, heading),
    so it dedups a dart against ITSELF at a repeated frame but happily keeps two DIFFERENT darts landing
    on one frame. That is a fold, and nothing upstream rejects it. A fold that lands vertex-on-vertex is
    visible here, because the position-keyed vertex dedup merges the two copies and the merged vertex
    then carries more than a full turn of faces. (A fold whose sheets are misaligned stays invisible —
    stated as a limitation, not fixed.)"""
    V = [complex(*p) for p in patch["vertices"]]
    s = defaultdict(float)
    for ring in patch["faces"]:
        K = [2 * V[v] / (1 + abs(V[v]) ** 2) for v in ring]          # Klein: geodesics are straight
        ccw = sum((K[i].conjugate() * K[(i + 1) % len(K)]).imag for i in range(len(K))) > 0
        for i, v in enumerate(ring):
            z = V[v]
            to = lambda w: (w - z) / (1 - z.conjugate() * w)          # carry v to 0: geodesics through it are rays
            a = cmath.phase(to(V[ring[i - 1]])) - cmath.phase(to(V[ring[(i + 1) % len(ring)]]))
            s[v] += (a if ccw else -a) % (2 * math.pi)
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
    """Staged: measure at --gate-boundr; a too-few-faces or wide-arc failure (never a fold) re-measures at
    --gate-retry, then deeper. Giant-cell
    tilings (ℓ≈2.2 octagon configs) close so few faces at 0.995 that the sampled circles thread cell-
    sized rim gaps of 8–9° — measured deeper those arcs are exactly 0.0° while a genuine hole persists
    at every depth (verified on 4 of the 126 affected classes, 2026-07-23)."""
    ok, nfaces, arc = _measure(rec, args.gate_boundr, args, cache)
    if ok:
        return True, nfaces, arc
    for deeper in (args.gate_retry, 0.9995, 0.9999):   # star cells reach ℓ≈2.7: arc 0.0 only at 0.9999
        if not (nfaces < args.min_faces or arc > args.max_arc):   # a fold is never retried
            break
        ok, nfaces, arc = _measure(rec, deeper, args, cache)
        if ok:
            return True, nfaces, arc
    return False, nfaces, arc


def _warm_one(job):
    """Worker: measure ONE record at one radius and return (content_key, [nfaces, arc, fold]).
    Runs in a forked process; the parent merges results into the shared gate cache. Only the gate's
    FIRST stage is warmed — the rare arc-retry happens in the parent afterwards, already cheap."""
    rec, boundR, min_faces = job
    deep = deep_develop(rec, boundR)
    nfaces, arc = len(deep["faces"]), max_empty_arc(deep)
    fold = fold_excess(deep, rec["edgeLength"])
    return content_key(rec, boundR), [nfaces, arc, fold]


def warm_cache_parallel(recs, args, cache, jobs=None):
    """Fan the uncached first-stage gate measurements across cores. The gate is pure per-record work
    (develop + point-in-polygon sampling), so this is embarrassingly parallel; 22k new classes at
    ~0.3 s each would otherwise be a two-hour single-threaded wall."""
    todo = [r for r in recs if content_key(r, args.gate_boundr) not in cache]
    if not todo:
        return
    jobs = jobs or max(2, (os.cpu_count() or 4) - 2)
    print(f"    warming the gate cache: {len(todo)} measurements on {jobs} workers…", flush=True)
    t0 = time.time()
    with mp.Pool(jobs) as pool:
        for i, (ck, m) in enumerate(
                pool.imap_unordered(_warm_one, ((r, args.gate_boundr, args.min_faces) for r in todo),
                                    chunksize=16)):
            cache[ck] = m
            if i and i % 2000 == 0:
                el = time.time() - t0
                print(f"    warm {i}/{len(todo)}  {el:.0f}s elapsed, ~{el / i * (len(todo) - i):.0f}s left",
                      flush=True)
    print(f"    warm done in {time.time() - t0:.0f}s", flush=True)


def star_shard(developed):
    """public/hyperbolic-developed-stars.json.gz beside the base file (lib/tilings/hyp-developed.ts)."""
    return developed.replace("hyperbolic-developed", "hyperbolic-developed-stars")


def id_for(orbits, k):
    tok = lambda x: STAR_TOK[x][1] if x in STAR_TOK else str(x)
    if k == 1:
        return "hyp-" + "-".join(map(tok, orbits[0]))
    return f"hyp-k{k}-" + "__".join("-".join(map(tok, o)) for o in orbits)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", required=True, nargs="+", help="develop_hyperbolic.py cells JSON(s)")
    ap.add_argument("--developed", required=True, help="public/hyperbolic-developed.json.gz (patches)")
    ap.add_argument("--reference", required=True, help="public/reference-atlas-hyperbolic.json.gz (entries)")
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
    # Star patches ship in their own shard, fetched only when a star tiling is opened: they are two thirds
    # of the parsed bytes, and every other hyperbolic view would pay for them.
    stars_path = star_shard(args.developed)
    developed = read_json(args.developed) + (read_json(stars_path) if os.path.exists(stars_path) else [])
    reference = read_json(args.reference)
    # The fields every shipped entry carries that are not about this tiling (a placeholder cell and a facet
    # derived from it), copied so a new entry looks like its neighbours to every reader. NOT polygonSpecies:
    # off the placeholder it read ["4"] on every row; /library reads the species off the figures instead.
    shared = {f: reference[0][f] for f in ("renderCell", "tilePeriods") if reference and f in reference[0]}
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
        ident = identity(d, r["edgeLength"])
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
        sides = [x for o in orbits for x in o if x not in STAR_TOK]
        if max(len(o) for o in orbits) > args.max_valence or max(sides, default=0) > args.max_side:
            capped += 1
            continue
        kept[key] = recs
    print(f"past the valence/side caps: {len(kept)} tilings ({capped} capped)")

    # ---- gate: one development per TILING in the common case -----------------------------------------
    cache = {}
    if args.gate_cache and os.path.exists(args.gate_cache):
        cache = json.load(open(args.gate_cache))
        cache = {k: v for k, v in cache.items() if isinstance(v, list)}   # drop the old boolean format
    # Warm the cache for each class's FIRST candidate in parallel; the sequential loop below then
    # mostly reads the cache. Fallback candidates (a class whose best rec fails the gate) stay cold —
    # empirically that set is empty.
    firsts = [sorted(recs, key=lambda r: -len(r["faces"]))[0] for recs in kept.values()]
    stars = [r for r in firsts if r["darts"].get("starKind")]
    if stars:   # the family solve is per record and pure: fan it out, then write the members back
        t0 = time.time()
        with mp.Pool(max(2, (os.cpu_count() or 4) - 2)) as pool:
            for r, (l, alpha, fam) in zip(stars, pool.imap(_family_one, stars, chunksize=8)):
                r["edgeLength"], r["darts"]["alpha"], r["_fam"] = l, alpha, fam
        print(f"    star families solved for {len(stars)} tilings in {time.time() - t0:.0f}s", flush=True)
    warm_cache_parallel(firsts, args, cache)
    tilings, gate_failed = [], []
    t0 = time.time()
    for i, (key, recs) in enumerate(sorted(kept.items())):
        if i and i % 200 == 0:
            el = time.time() - t0
            print(f"    gate {i}/{len(kept)}  {el:.0f}s elapsed, ~{el / i * (len(kept) - i):.0f}s left, "
                  f"{len(tilings)} through", flush=True)
        rep = None
        for r in sorted(recs, key=lambda r: -len(r["faces"])):
            star_family(r)
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
        ident = identity(d, p["edge"])
        if ident["valid"]:
            shipped_id_by_key[ident["key"]] = p["id"]

    out_patches, out_entries, matched = [], [], set()
    # EVERY shipped id is reserved up front, in BOTH modes. Without this, a NEW tiling that shares a
    # vertex figure with a shipped one and sorts earlier (smaller ℓ) claims the bare `hyp-<figure>` id,
    # and the shipped tiling then reclaims the same id — 12 duplicate ids shipped on 2026-07-23, and
    # React's duplicate-key corruption stranded ghost cards across /library facet switches (AL repro).
    # A shipped id also must never be RECYCLED to a different tiling: /play deep links point at it.
    used_ids = {p["id"] for p in developed}
    handed_back = set()                     # shipped ids already given back THIS run (one owner each)
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
        if prev_id is not None and prev_id in handed_back:
            # A poisoned input (the 2026-07-23 duplicate-id shelf) can map TWO distinct tilings' keys
            # to one shipped id. The first claimant in sort order keeps it; this one gets a fresh
            # suffixed id — never re-emit a duplicate, even when the input carries one.
            prev_id = None
        if prev_id is not None:
            matched.add(prev_id)
            handed_back.add(prev_id)
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
        fam, star_note = star_family(r), ""
        if r["darts"].get("starKind"):
            pts, ns = hyp_geom.star_points(r["darts"])
            pt = ", ".join(f"{n}* point {math.degrees(a):.2f}°" for n, a in zip(ns, pts))
            star_note = (f" One free star point angle ({len(pts)} star types, the points move together)."
                         if fam and len(pts) > 1 else " One free star point angle; the edge follows it." if fam
                         else f" Rigid: the vertex types force {pt}, edge {r['edgeLength']:.4f}.")
            if r.get("palette") == "hyp-star-free":
                star_note += " Found by the free-point search: every star's point free, vertex valence at most 5."
            elif r.get("freedPoints"):
                star_note += (" Found with the star points freed after a search at the palette's 60/90/120° "
                              "points, so the freed-point shelf is a lower bound, not a census.")
        out_patches.append({"id": pid, "name": name, "config": family, "edge": r["edgeLength"],
                            "tiles": len(faces), "darts": r["darts"], **({"family": fam} if fam else {})})
        out_entries.append({
            "id": pid, "source": "hyperbolic", "k": k, "family": family, "geometry": "hyperbolic",
            "developed": {"patch": pid},
            "discoverer": "Čtrnáct engine (SU(1,1) developer)",
            "note": (f"{family} — engine-developed {'k=' + str(k) + ' ' if k > 1 else ''}hyperbolic "
                     f"tiling, vertex configuration {family}. Enumerated by the Čtrnáct combinatorial engine "
                     "(negative-defect closure); identity and k are the minimal Delaney–Dress symbol of its "
                     "quotient, developed to exact Poincaré-disk geometry by the SU(1,1) flood-fill developer.") + star_note,
            **shared,
            **({"hypFamily": fam} if fam else {}),
            # ℓ on the row itself: the base loader merges it from the patches, which for a star are in the
            # shard it does not fetch.
            **({"edge": r["edgeLength"]} if r["darts"].get("starKind") else {}),
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
    stars = [p for p in patches if p["darts"].get("starKind")]
    write_json(args.developed, [p for p in patches if not p["darts"].get("starKind")], ensure_ascii=False)
    write_json(stars_path, stars, ensure_ascii=False)
    write_json(args.reference, entries, pack=True)
    print(f"\nwrote {args.developed} ({len(patches) - len(stars)} patches) and {stars_path} ({len(stars)})")
    print(f"wrote {args.reference} ({len(entries)} entries)")


if __name__ == "__main__":
    main()
