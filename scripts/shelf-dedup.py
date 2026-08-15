#!/usr/bin/env python3
"""shelf-dedup.py — enforce ONE APPEARANCE PER TILING on a built shelf.

AL, 2026-08-09, after the concave tier shipped with three separate symptoms of one bug:

    duplicate tilings: period-k2-072 and period-k2-088 are the same tilings.
    snapshots instead of parameter: period-k2-42, 46, 64, 88 and 93 are the same tiling, with a
    different value of the parameter that controls the hexagon angles.
    regeneration of the same tilings we already had: period-k2-002 is a snapshot at 195 degrees of
    the tiling period-family-k2-012.

The rule he set: every tiling appears once. A truly rigid tiling carries no parameter; anything that is
one VALUE of a continuous family never appears on its own, it appears inside that family, whose slider
sweeps its whole range including the concave regime.

Why the shelf could not already do this. It had two dedup mechanisms and neither tests that rule:

  * exact ℤ[ζ₂₄] congruence merges tilings that are IDENTICAL. Two different points of one curve are not
    identical, so it keeps both — that is AL's 42/46/64/88/93.
  * `memberIds` absorption only reaches snapshots the family exporter itself grouped. A snapshot produced
    by a different palette was never in any group, so it survives next to the family that contains it —
    that is k2-002 sitting at 195° on period-family-k2-012.

The test that does work is the one `tiling_key.py` already implements. A tiling's combinatorial map is
constant along its family and fixes the ambient corner-angle space; a family is an affine SUBSPACE of that
space and a rigid tiling is a POINT in it. So:

    same tiling            → equal subspaces (dimension 0 for two rigid entries)
    one value of a family  → the point lies IN the family's subspace
    a redundant family     → its subspace is contained in another's

All three are exact linear algebra once the darts are aligned, and all three are decided here. Survivors
are the MAXIMAL entries: nothing that ships is contained in anything else that ships.

⚑ Deliberately runs on the BUILT shelf, not inside the builder. The rule has to hold for whatever the
build emits, from any tier and any palette, and a check that lives downstream of every producer is the
only kind that cannot be bypassed by adding one.

Run (after build-period-atlas.ts):
  python3 scripts/shelf-dedup.py --shelf public/reference-atlas-period.json --write \
      --log experiments/results/period-shelf-dedup-2026-08-09.log
"""
import argparse
import glob
import json
import os
import re
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


def shard_paths(main_path):
    base = re.sub(r"\.json$", "", main_path)
    return sorted(glob.glob(f"{base}-k*.json"))


def load_shelf(main_path):
    files = [main_path] + shard_paths(main_path)
    entries, owner = [], {}
    for f in files:
        for e in json.load(open(f)):
            entries.append(e)
            owner[e["id"]] = f
    return files, entries, owner


def dimension(sub):
    _k, _l, vecs = sub
    return len(TK._hull(vecs)[1]) if vecs else 0


def main():
    global LOG
    ap = argparse.ArgumentParser()
    ap.add_argument("--shelf", required=True, help="main shelf json; its -k*.json shards are included")
    ap.add_argument("--log", required=True)
    ap.add_argument("--write", action="store_true", help="rewrite the shelf files (default: report only)")
    ap.add_argument("--json", default=None)
    # The one-appearance rule is not period-specific — the test is the tiling's own map — so the shelf it
    # runs on is an argument. `--id-prefix` names the renamed ids; `--no-rename` keeps the producer's,
    # which is what a shelf with published deep links wants.
    ap.add_argument("--id-prefix", default="period")
    ap.add_argument("--no-rename", action="store_true",
                    help="drop duplicates but leave every surviving id exactly as it was")
    args = ap.parse_args()
    LOG = open(args.log, "w")

    files, entries, owner = load_shelf(args.shelf)
    log(f"=== shelf dedup: {len(entries)} entries across {len(files)} file(s) ===")
    for f in files:
        log(f"    {os.path.relpath(f, ROOT)}")

    subs, unkeyable = {}, []
    for i, e in enumerate(entries, 1):
        try:
            key, labs, vecs = TK.family_subspace(e)
        except Exception as exc:                                # noqa: BLE001
            key, labs, vecs = None, None, []
            log(f"  ⚑ {e['id']}: {exc}")
        if not key or not vecs:
            unkeyable.append(e["id"])
            continue
        subs[e["id"]] = (key, labs, vecs)
        if i % 200 == 0:
            log(f"  keyed {i}/{len(entries)}")
    log(f"keyed {len(subs)} of {len(entries)} ({len(unkeyable)} unkeyable, kept as-is)")

    by_key = defaultdict(list)
    for eid, (k, _, _) in subs.items():
        by_key[k].append(eid)

    # Survivors are the MAXIMAL entries: sort each map-key group by subspace dimension descending so a
    # family is always tested before the points and sub-families it might swallow, then drop anything
    # equal to or inside a survivor. Ties break on id, so the choice is reproducible.
    dropped = {}
    for key, ids in by_key.items():
        if len(ids) < 2:
            continue
        ids = sorted(ids, key=lambda i: (-dimension(subs[i]), i))
        for a in ids:
            if a in dropped:
                continue
            for b in ids:
                if b == a or b in dropped:
                    continue
                rel = TK.relate(subs[b], subs[a])
                if rel in ("same", "inside"):
                    dropped[b] = (rel, a)
    log("")
    if dropped:
        log(f"{len(dropped)} entries are not their own tiling:")
        for b, (rel, a) in sorted(dropped.items()):
            db, da = dimension(subs[b]), dimension(subs[a])
            what = "the same family as" if rel == "same" else \
                   ("one parameter value of" if db == 0 else "a sub-family of")
            log(f"  {b:<28} is {what} {a}  (dim {db} → {da})")
    else:
        log("nothing to drop — every entry is maximal in its map class")
    log("")
    log("dropped by kind: " + (", ".join(f"{r}: {n}" for r, n in
                               sorted(Counter(r for r, _ in dropped.values()).items())) or "none"))

    # Record on each survivor what it absorbed. A dropped entry is not information lost — its tilings are
    # still on the shelf, inside the survivor — but that is only true if the shelf SAYS so. A k=2
    # sub-family swallowed by a k=3 family is the case that would otherwise read as a missing tier.
    absorbed = defaultdict(list)
    for b, (rel, a) in dropped.items():
        by_id = next(e for e in entries if e["id"] == b)
        absorbed[a].append((b, rel, by_id.get("k"), dimension(subs[b])))
    for e in entries:
        lst = absorbed.get(e["id"])
        if not lst:
            continue
        parts = []
        for b, rel, bk, bd in sorted(lst):
            parts.append(f"{b} (k={bk}, " + ("the same family" if rel == "same" else
                                             "a single parameter value" if bd == 0 else
                                             f"a {bd}-parameter sub-family") + ")")
        e["absorbs"] = [b for b, _, _, _ in sorted(lst)]
        e["note"] = (e.get("note", "") + " CONTAINS, as special values of its own parameters: "
                     + "; ".join(parts) + ". Those are not listed separately — every tiling on this shelf "
                     "appears exactly once, under the most general family that contains it.").strip()

    keep = [e for e in entries if e["id"] not in dropped]

    # ── ONE NAMING CONVENTION ────────────────────────────────────────────────────────────────────────
    # Ids came from whichever producer made the entry — `period-family-*` from the concrete grid export,
    # `period-quotient-*` from the quotient search, `period-k*` from a snapshot — and after the k values
    # were re-measured they stopped agreeing with the id: `period-family-k2-038` carries k=1. So every
    # surviving entry is renamed `period-k{k}-{nnn}` from its MEASURED k, and the old id is kept as
    # `legacyId` so a reference written down before today still resolves.
    #
    # Parametric or rigid is not in the name and should not be: an entry carries `paramCell` when it has
    # a slider and does not when it is genuinely pinned, which is the same distinction without a second
    # place to keep in sync.
    renamed = {}
    if args.no_rename:
        log("")
        log("renaming skipped (--no-rename): surviving ids are the producer's")
        bykk = defaultdict(list)
        for e in keep:
            bykk[e["k"]].append(e)
        log(f"shelf: {len(entries)} → {len(keep)} entries")
        log("  by k: " + ", ".join(f"k={k}: {n}" for k, n in sorted(Counter(e["k"] for e in keep).items())))
        par = sum(1 for e in keep if e.get("paramCell"))
        log(f"  parametric: {par}   rigid (no parameter): {len(keep) - par}")
        _write(args, files, keep, owner, dropped, subs, log)
        return
    bykk = defaultdict(list)
    for e in keep:
        bykk[e["k"]].append(e)
    for kk, lst in bykk.items():
        for i, e in enumerate(sorted(lst, key=lambda x: (0 if x.get("paramCell") else 1, x["id"])), 1):
            new = f"{args.id_prefix}-k{kk}-{i:03d}"
            if new != e["id"]:
                renamed[e["id"]] = new
                e["legacyId"] = e["id"]
            e["id"] = new
    for e in keep:
        if e.get("absorbs"):
            e["absorbs"] = [renamed.get(b, b) for b in e["absorbs"]]
    log("")
    log(f"renamed {len(renamed)} of {len(keep)} entries to {args.id_prefix}-k<k>-<nnn> (legacyId keeps the old one)")
    mism = sum(1 for e in keep if re.match(rf"^{re.escape(args.id_prefix)}-k(\d+)-", e["id"]).group(1) != str(e["k"]))
    log(f"  ids disagreeing with their measured k after renaming: {mism}")

    log(f"shelf: {len(entries)} → {len(keep)} entries")
    log("  by k: " + ", ".join(f"k={k}: {n}" for k, n in sorted(Counter(e["k"] for e in keep).items())))
    par = sum(1 for e in keep if e.get("paramCell"))
    log(f"  parametric: {par}   rigid (no parameter): {len(keep) - par}")

    _write(args, files, keep, owner, dropped, subs, log)


def _write(args, files, keep, owner, dropped, subs, log):
    if args.json:
        json.dump({"dropped": {b: {"relation": r, "absorbedBy": a} for b, (r, a) in dropped.items()}},
                  open(args.json, "w"), indent=1)
    if args.write:
        # Entries were mutated in place (id, legacyId, absorbs, note), so rewrite from `keep`, split back
        # into the file each entry came from. Its owner is keyed on the ORIGINAL id, before renaming.
        by_file = defaultdict(list)
        for e in keep:
            by_file[owner[e.get("legacyId", e["id"])]].append(e)
        for f in files:
            with open(f, "w") as fh:
                json.dump(by_file.get(f, []), fh, separators=(",", ":"))
                fh.write("\n")
            log(f"  rewrote {os.path.relpath(f, ROOT)}: {len(by_file.get(f, []))} entries")


if __name__ == "__main__":
    main()
