#!/usr/bin/env python3
"""check_rigid_shelf.py [--merged] <shelf.json> [<other shelf.json>]: what a shelf of rigid unit-edge tilings holds, by geometry.

<shelf.json> is scripts/atlas/shelf-json.ts's output. Per board (the records' `board`):
  - the tilings up to reflection, and with chirality kept;
  - records that repeat another (one tiling under two ids);
  - chiral tilings whose mirror image is not on the shelf;
  - each record's k against the k of its geometry.
With a second shelf: how many of the first's tilings (chirality kept) the second holds, and how many it adds.

Identity is tiling_key.family_key: the dart map of the developed cell on its primitive lattice with every corner
angle, both orientations searched, so mirror images key alike. The oriented key searches one orientation only, with
every tile turned counter-clockwise first, so a tiling and its mirror image share it exactly when the tiling is
achiral. The key holds no length: it is an identity only where every edge has one length (two tilings that differ
by scale alone share it, as the unit and the root-2 square tilings of the tri45 shelf do). k is the number of orbits of the vertices where three or more tiles meet, under the map's automorphisms
that keep every corner angle. None of it reads an engine's certificate, and none of it is the builders' own
congruence test (lib/classes/algorithm/TilingCongruence.ts), so it checks them. Run from the repo root.
Exit 1 when the first shelf repeats a tiling, lacks a mirror image or files a tiling under another k than its
geometry's (2026-11-10: the shipped polyform shelf did all three, 565, 75 and 96 times). --merged is for a shelf that
counts a tiling and its mirror image once: a missing mirror image is then no fault, and one present is a repeat.

Ids, so that a rebuilt shelf keeps the id of every tiling it already had (the report is skipped):
  --write-plan <plan.json>        {digest: id} of the shelf's tilings; of records that repeat one tiling, the id
                                  filed under the geometry's k, without a mirror's trailing m, least in order
  --ids <plan.json> <out.json> [prefix]
                                  {record id: final id}: the plan's id for a tiling in it, else
                                  <prefix>-k<k>-<digest> (prefix: the record id's own, up to its first dash)
The digest is 16 base32 characters, the first 80 bits of SHA-256 over the oriented key (the mirror-blind one with
--merged): the id form of docs/superpowers/specs/2026-11-08-canonical-tiling-ids-design.md.
"""
import base64
import hashlib
import collections
import json
import os
import sys
from multiprocessing import Pool

sys.path.insert(0, "tools/ctrnact-oracle")
import tiling_key as TK                      # noqa: E402
import vertex_orbits as vo                   # noqa: E402


def one_orientation(labels, sigma, alpha):
    """tiling_key.canonical without its second, mirrored search."""
    D = len(labels)
    best, labs = None, []
    for root in range(D):
        idx, order, qi = {root: 0}, [root], 0
        while qi < len(order):
            d = order[qi]
            qi += 1
            for nxt in (sigma[d], alpha[d]):
                if nxt not in idx:
                    idx[nxt] = len(order)
                    order.append(nxt)
        if len(order) != D:
            continue
        enc = ";".join(f"{labels[d]},{idx[sigma[d]]},{idx[alpha[d]]}" for d in order)
        if best is None or enc < best:
            best, labs = enc, [order]
        elif enc == best:
            labs.append(order)
    return best, labs


def measure(rec):
    """(id, board, k, mirror-blind key, oriented key, the mirror image's oriented key, geometric k)."""
    cell = rec["renderCell"]
    out = []
    for flip in (1, -1):
        polys, basis = vo.float_cell({"cellPolygons": [{**p, "vertices": [[x, flip * y] for x, y in p["vertices"]]} for p in cell["cellPolygons"]],
                                      "basis": [[x, flip * y] for x, y in cell["basis"]]})
        for p in polys:                      # counter-clockwise, so the oriented key reads the plane, not the file
            v = p["v"]
            if sum((v[i].conjugate() * v[(i + 1) % len(v)]).imag for i in range(len(v))) < 0:
                p["v"] = v[::-1]
        if TK.build_map(polys, basis) is None:
            polys = TK.refine(polys, basis)  # a corner part-way along a side: name it, then it is a map
        if TK.build_map(polys, basis) is None:
            return rec["id"], rec.get("board", ""), int(rec["k"]), None, None, None, None
        full = TK.family_key(polys, basis)
        keep, TK.canonical = TK.canonical, one_orientation
        try:
            oriented = TK.family_key(polys, basis)
        finally:
            TK.canonical = keep
        out.append((full, oriented, polys, basis))
    (full, oriented, polys, basis), (_, mirrored, _, _) = out
    labels, sigma, alpha, reps, ps, darts = TK.build_map(polys, basis)
    ang = [round(a, 4) for a in TK.corner_angles((labels, sigma, alpha, reps, ps, darts))]
    _, labs = TK.canonical(labels, sigma, alpha)
    w0 = min(tuple(ang[d] for d in o) for o in labs)
    autos = [o for o in labs if tuple(ang[d] for d in o) == w0]
    parent = list(range(len(labels)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for d in range(len(labels)):             # a vertex: the darts that start at it, sigma after alpha
        parent[find(d)] = find(sigma[alpha[d]])
    vertex = [find(d) for d in range(len(labels))]
    degree = collections.Counter(vertex)
    for o in autos:                          # an automorphism carries autos[0][i] to o[i]
        for a, b in zip(autos[0], o):
            parent[find(a)] = find(b)
    k = len({find(d) for d in range(len(labels)) if degree[vertex[d]] >= 3})
    return rec["id"], rec.get("board", ""), int(rec["k"]), full, oriented, mirrored, k


def load(path):
    with Pool(max(1, (os.cpu_count() or 4) - 2)) as pool:
        return pool.map(measure, json.load(open(path)), chunksize=8)


if __name__ == "__main__":
    merged = "--merged" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--merged"]
    mode = next((a for a in args if a in ("--write-plan", "--ids")), None)
    extra = args[args.index(mode) + 1:args.index(mode) + (2 if mode == "--write-plan" else 4)] if mode else []
    extra = [a for a in extra if not a.endswith(".json") or extra.index(a) < 2]
    files = [a for a in args if a != mode and a not in extra]
    A = load(files[0])
    B = load(files[1]) if len(files) > 1 else None
    if merged:                               # the oriented keys become the mirror-blind one
        A, B = [[r[:4] + (r[3], r[3]) + r[6:] for r in X] if X else X for X in (A, B)]
    if mode:
        digest = lambda key: base64.b32encode(hashlib.sha256(key.encode()).digest()[:10]).decode().lower()
        if mode == "--write-plan":
            plan = {}
            for r in sorted(A, key=lambda r: (r[2] != r[6], r[0].endswith("m"), r[0])):
                plan.setdefault(digest(r[4]), r[0])
            json.dump(dict(sorted(plan.items(), key=lambda kv: kv[1])), open(extra[0], "w"), indent=0)
            print(f"{len(plan)} tilings of {len(A)} records → {extra[0]}")
        else:
            plan = json.load(open(extra[0]))
            ids = {r[0]: plan.get(digest(r[4])) or f"{extra[2] if len(extra) > 2 else r[0].split('-')[0]}-k{r[6]}-{digest(r[4])}" for r in A}
            assert len(set(ids.values())) == len(ids), "two records are one tiling"
            json.dump(ids, open(extra[1], "w"))
            print(f"{len(ids)} ids, {sum(1 for r in A if digest(r[4]) in plan)} from the plan → {extra[1]}")
        sys.exit(0)
    tot = collections.Counter()
    unkeyed = [r[0] for r in A if r[3] is None]
    if unkeyed:
        print(f"{len(unkeyed)} records could not be read as a map and are left out, e.g. {unkeyed[0]}")
    A = [r for r in A if r[3] is not None]
    for board in sorted({r[1] for r in A}, key=[r[1] for r in A].index):
        rs = [r for r in A if r[1] == board]
        by_oriented = collections.defaultdict(list)
        for r in rs:
            by_oriented[r[4]].append(r[0])
        repeats = [ids for ids in by_oriented.values() if len(ids) > 1]
        lone = [r for r in rs if r[4] != r[5] and r[5] not in by_oriented]
        badk = [r for r in rs if r[2] != r[6]]
        line = (f"{board or 'all'}: {len(rs)} records = {len(by_oriented)} tilings ({len({r[3] for r in rs})} up to reflection) | "
                f"{sum(len(i) - 1 for i in repeats)} records repeat another{' e.g. ' + ' = '.join(repeats[0][:2]) if repeats else ''} | "
                f"{len({r[4] for r in lone})} chiral tilings without their mirror image{' e.g. ' + lone[0][0] if lone else ''} | "
                f"k differs from the geometry's on {len(badk)}{' e.g. ' + f'{badk[0][0]} filed {badk[0][2]}, geometry {badk[0][6]}' if badk else ''}")
        tot.update(records=len(rs), tilings=len(by_oriented), repeats=sum(len(i) - 1 for i in repeats), lone=len({r[4] for r in lone}), badk=len(badk))
        if B is not None:
            theirs = {r[4] for r in B if r[1] == board and r[3] is not None}
            mine = set(by_oriented)
            line += f" | of its tilings the other shelf holds {len(mine & theirs)} and lacks {len(mine - theirs)}; the other adds {len(theirs - mine)}"
            tot.update(held=len(mine & theirs), lacks=len(mine - theirs), adds=len(theirs - mine))
        print(line, flush=True)
    print("TOTAL: " + ", ".join(f"{k} {v}" for k, v in tot.items()))
    sys.exit(1 if tot["repeats"] or tot["lone"] or tot["badk"] else 0)
