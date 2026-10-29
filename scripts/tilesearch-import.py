#!/usr/bin/env python3
"""tilesearch-import.py: a TileSearch run folder → staged atlas records and one coverage row.

A run from the app is a search over the tiles its board names, often far fewer than a shelf's class, so it
goes into the atlas as two separate things:

  * TILINGS, keyed by what they are and not by the run: `tiling_key.family_key` (the dart map plus the
    corner-angle word, mirror images keyed the same) is an exact identity for a rigid tiling with unit
    edges. A tiling the atlas already holds, on any flat shelf and inside any continuous family, is reported
    as known (`tiling_key.relate` says "same" or "inside"); only the rest are new. The id is a hash of the
    key, so two people who find one tiling produce one id.
  * COVERAGE: what the run proves complete. "Tilings by these faces, complete to k = N" only when the run
    finished and the board narrows nothing (permutations on, no initial vertices, every closing vertex
    listed). Otherwise the row says what narrowed it, and a stopped run proves no k at all.

Nothing here writes to public/. The staging folder is what a shelf build reads.

  python3 scripts/tilesearch-import.py <run folder> [--out DIR] [--workers N]

Writes DIR/tilings.json.gz (the new tilings, atlas record form), DIR/known.json (run tiling → atlas ids),
DIR/coverage.json, and a progress log in experiments/results/.
"""
import argparse
import hashlib
import json
import math
import os
import subprocess
import sys
import time
from collections import Counter, defaultdict
from multiprocessing import Pool

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "ctrnact-oracle"))

import tiling_key as TK                                          # noqa: E402
import vertex_orbits as vo                                       # noqa: E402
from develop_freedraw import read_json, write_json               # noqa: E402

LOG = None
# Bump when tiling_key changes what a key or an angle vector is: the atlas-key cache is then rebuilt.
KEY_VERSION = 3


def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    if LOG:
        LOG.write(line + "\n")
        LOG.flush()


def progress(label, i, n, t0, every=500):
    if i % every and i != n:
        return
    dt = time.time() - t0
    eta = dt / i * (n - i) if i else 0
    log(f"  {label} {i:,}/{n:,}  {dt:.0f} s, about {eta:.0f} s left")


def species(cell):
    """The atlas's polygonSpecies for a cell: "6", or "6*60" for a star of six 60° points; None if irregular."""
    out = set()
    for q in cell["cellPolygons"]:
        v = [complex(x, y) for x, y in q["vertices"]]
        m = len(v)
        area = sum((v[i].conjugate() * v[(i + 1) % m]).imag for i in range(m)) / 2
        ang = []
        for i in range(m):
            a, b = v[i - 1] - v[i], v[(i + 1) % m] - v[i]
            t = math.degrees(math.atan2((a.conjugate() * b).imag, (a.conjugate() * b).real)) % 360
            ang.append(round(360 - t if area > 0 else t, 4))
        if q.get("star"):
            out.add(f"{q['n']}*{min(ang):g}")
        elif max(ang) - min(ang) < 1e-3:
            out.add(str(q["n"]))
        else:
            return None
    return sorted(out, key=lambda s: (int(s.split("*")[0]), s))


def shape(vs):
    """A tile's corner angles in cyclic order, straight points dropped, least over rotation and reflection.
    The same reading as `shape` in tilesearch-cells.ts."""
    m = len(vs)
    area = sum(vs[i][0] * vs[(i + 1) % m][1] - vs[(i + 1) % m][0] * vs[i][1] for i in range(m))
    ang = []
    for i in range(m):
        a, p, b = vs[i - 1], vs[i], vs[(i + 1) % m]
        u, v = (b[0] - p[0], b[1] - p[1]), (a[0] - p[0], a[1] - p[1])
        t = math.degrees(math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]))
        ang.append(round(((t if area > 0 else -t) + 360) % 360))
    ang = [x for x in ang if x != 180]
    rots = lambda w: [tuple(w[i:] + w[:i]) for i in range(len(w))]     # noqa: E731
    return min(rots(ang) + rots(ang[::-1]))


def composition(cell, exact):
    """How many tiles of each kind one period holds, divided by their gcd, so a supercell reads the same.
    Congruent tilings always agree on it. `exact` counts by shape; otherwise by corner count and star, which
    a continuous family keeps along its whole range."""
    c = Counter(shape(q["vertices"]) if exact else (q["n"], bool(q.get("star"))) for q in cell["cellPolygons"])
    g = 0
    for n in c.values():
        g = math.gcd(g, n)
    return tuple(sorted((str(k), n // g) for k, n in c.items()))


def key_run(cell):
    """(family_key, map key, true k) of one developed run tiling; Nones where it cannot be keyed."""
    try:
        polys, basis = vo.float_cell(cell)
        fk = TK.family_key(polys, basis)
        if fk is None:                         # Pi corners: name the T-junctions, then it is a map
            polys = TK.refine(polys, basis)
            fk = TK.family_key(polys, basis)
        k = vo.orbit_count(polys, basis)
        if isinstance(k, tuple):
            k = k[0]
        return fk, (fk[: fk.rindex("#")] if fk else None), k
    except Exception as exc:                                    # noqa: BLE001
        return None, None, f"{type(exc).__name__}: {exc}"


def sub_of(rec):
    try:
        return TK.family_subspace(rec, refined=True)
    except Exception:                                           # noqa: BLE001
        return None, None, []


def main():
    global LOG
    ap = argparse.ArgumentParser()
    ap.add_argument("run")
    ap.add_argument("--out", default=None)
    ap.add_argument("--cells", default=None, help="reuse a tilesearch-cells.ts dump instead of making one")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 4) - 2))
    args = ap.parse_args()
    folder = os.path.basename(os.path.normpath(args.run))
    out = args.out or os.path.join(ROOT, "experiments", "tilesearch-import", folder)
    os.makedirs(out, exist_ok=True)
    os.makedirs(os.path.join(ROOT, "experiments", "results"), exist_ok=True)
    LOG = open(os.path.join(ROOT, "experiments", "results",
                            f"tilesearch-import-{folder}-{time.strftime('%Y-%m-%d')}.log"), "w")

    cells = args.cells or os.path.join(out, "cells.json.gz")
    if not args.cells:
        log(f"=== developing {folder} and gathering atlas candidates ===")
        tsx = os.path.join(ROOT, "node_modules", ".bin", "tsx")
        subprocess.run([tsx, os.path.join(ROOT, "scripts", "tilesearch-cells.ts"), args.run, cells],
                       cwd=ROOT, check=True)
    data = read_json(cells)
    run, tilings, atlas = data["run"], data["tilings"], data["atlas"]

    # ── what the run can claim ──
    engines = sorted({s.get("engine") for s in run["sessions"]} - {None})
    log(f"run {folder}: board {run['name']}, k {run['k'][0]}–{run['k'][1]}, "
        f"{'finished' if run['finished'] else 'NOT finished'}, {len(run['sessions'])} recorded session(s)")
    if not run["sessions"]:
        log("  ⚑ no sessions.json: the run predates the stamp, so its engine is unrecorded")
    elif len(engines) > 1:
        log(f"  ⚑ {len(engines)} different engines worked on this run: no k is claimed complete")
    for why in run["narrowing"]:
        log(f"  narrowed: {why}")
    if not run["finished"]:
        cls = "partial"
    elif len(engines) > 1:
        cls = "mixed-engines"
    elif run["narrowing"]:
        cls = "board"
    else:
        cls = "faces"
    log(f"  coverage class: {cls}")

    # ── key the run ──
    ok = [t for t in tilings if t.get("renderCell")]
    for t in tilings:
        if t.get("error"):
            log(f"  ⚑ {t['id']} not developed: {t['error']}")
    log(f"=== keying {len(ok):,} run tilings on {args.workers} workers ===")
    t0 = time.time()
    keyed = []
    with Pool(args.workers) as pool:
        for i, r in enumerate(pool.imap(key_run, [t["renderCell"] for t in ok], chunksize=32), 1):
            keyed.append(r)
            progress("keyed", i, len(ok), t0)

    by_key = defaultdict(list)
    bad_k, unkeyed = [], []
    for t, (fk, mk, k) in zip(ok, keyed):
        if fk is None:
            unkeyed.append(t["id"])
            log(f"  ⚑ {t['id']} unkeyable: {k}")
            continue
        t["key"], t["map"] = fk, mk
        if k != t["k"]:
            bad_k.append((t["id"], t["k"], k))
        by_key[fk].append(t)
    dups = {fk: ts for fk, ts in by_key.items() if len(ts) > 1}
    log(f"{len(by_key):,} distinct tilings among {len(ok):,} certificates; "
        f"{sum(len(v) - 1 for v in dups.values())} repeats in {len(dups)} groups; {len(unkeyed)} unkeyable")
    for fk, ts in list(dups.items())[:10]:
        log(f"  repeat: {', '.join(t['id'] for t in ts)}")
    log(f"{len(bad_k)} tilings whose vertex-orbit count differs from the engine's k")
    for i, kk, k in bad_k[:10]:
        log(f"  ⚑ {i}: engine k={kk}, counted {k}")

    # ── the atlas: only records that could equal a run tiling ──
    # A rigid record must agree on k (an invariant, and the run's k were just counted) and on the exact
    # composition; a family only on the kinds of tile, since its shapes and k move along it.
    exact = {(t["k"], composition(t["renderCell"], True)) for ts in by_key.values() for t in ts}
    coarse = {composition(t["renderCell"], False) for ts in by_key.values() for t in ts}
    n0 = len(atlas)
    atlas = [a for a in atlas if (composition(a["renderCell"], False) in coarse if "paramCell" in a
                                  else (int(a["k"]), composition(a["renderCell"], True)) in exact)]
    # Keys of atlas records are cached per shelf file, invalidated when the file changes.
    cache_path = os.path.join(ROOT, "experiments", "tilesearch-import", "atlas-keys.json.gz")
    try:
        cache = read_json(cache_path)
    except Exception:                                           # noqa: BLE001
        cache = {}
    if cache.get("version") != KEY_VERSION:                     # keys from an older tiling_key are void
        cache = {"version": KEY_VERSION}
    stamp = {}
    for a in atlas:
        f = os.path.join(ROOT, "public", a["shelf"])
        assert a["shelf"] != "version"
        stamp[a["shelf"]] = str(os.path.getmtime(f))
        if cache.get(a["shelf"], {}).get("mtime") != stamp[a["shelf"]]:
            cache[a["shelf"]] = {"mtime": stamp[a["shelf"]], "keys": {}}
    todo = [a for a in atlas if a["id"] not in cache[a["shelf"]]["keys"]]
    log(f"=== keying {len(todo):,} atlas candidates, {len(atlas) - len(todo):,} cached "
        f"({n0:,} share the tiles, {data['atlasScanned']:,} flat records scanned) ===")
    t0 = time.time()
    with Pool(args.workers) as pool:
        for i, (a, s) in enumerate(zip(todo, pool.imap(sub_of, todo, chunksize=16)), 1):
            cache[a["shelf"]]["keys"][a["id"]] = list(s)
            progress("keyed", i, len(todo), t0, every=200)
    if todo:
        write_json(cache_path, cache)
    subs = [tuple(cache[a["shelf"]]["keys"][a["id"]]) for a in atlas]
    atlas_by_map = defaultdict(list)
    for rec, s in zip(atlas, subs):
        if s[0] and s[2]:
            atlas_by_map[s[0]].append((rec, s))
    log(f"{sum(len(v) for v in atlas_by_map.values()):,} keyed, {len(atlas_by_map):,} distinct maps")

    # ── known or new ──
    known, new = {}, []
    t0 = time.time()
    reps = [ts[0] for ts in by_key.values()]
    for i, t in enumerate(reps, 1):
        hits = []
        if t["map"] in atlas_by_map:
            mine = TK.family_subspace({"renderCell": t["renderCell"]}, refined=True)
            for rec, s in atlas_by_map[t["map"]]:
                rel = TK.relate(mine, s)
                if rel in ("same", "inside"):
                    hits.append({"id": rec["id"], "shelf": rec["shelf"], "relation": rel})
        if hits:
            known[t["id"]] = hits
        else:
            new.append(t)
        progress("compared", i, len(reps), t0, every=2000)

    counts = Counter(t["k"] for t in reps)
    new_k = Counter(t["k"] for t in new)
    log(f"=== {len(reps):,} distinct: {len(known):,} already in the atlas, {len(new):,} new ===")
    for k in sorted(counts):
        log(f"  k={k:>2}: {counts[k]:>7,} distinct, {counts[k] - new_k[k]:>6,} known, {new_k[k]:>7,} new")
    shelves = Counter(h["shelf"] for hs in known.values() for h in hs)
    for s, n in shelves.most_common():
        log(f"  matched on {s}: {n:,}")

    # ── staging ──
    records = []
    for t in new:
        rid = "ts-" + hashlib.sha1(t["key"].encode()).hexdigest()[:12]
        records.append({
            "id": rid,
            "source": "tilesearch",
            "k": t["k"],
            "polygonSpecies": species(t["renderCell"]),
            "certification": "candidate",
            "renderCell": t["renderCell"],
            "tilesearch": {"run": folder, "file": t["file"], "index": t["index"]},
        })
    write_json(os.path.join(out, "tilings.json.gz"), records)
    with open(os.path.join(out, "known.json"), "w") as f:
        json.dump(known, f, indent=1)
    coverage = {
        "faces": sorted({s for t in reps for s in (species(t["renderCell"]) or [])},
                        key=lambda s: (int(s.split("*")[0]), s)),
        "board": run["board"],
        "class": cls,
        "narrowing": run["narrowing"],
        "engines": engines,
        "run": folder,
        "imported": time.strftime("%Y-%m-%d"),
        "k": {str(k): {"distinct": counts[k], "new": new_k[k], "complete": cls == "faces"}
              for k in range(run["k"][0], run["k"][1] + 1)},
    }
    with open(os.path.join(out, "coverage.json"), "w") as f:
        json.dump(coverage, f, indent=1)
    log(f"staged in {os.path.relpath(out, ROOT)}: {len(records):,} new records, coverage class {cls}")


if __name__ == "__main__":
    main()
