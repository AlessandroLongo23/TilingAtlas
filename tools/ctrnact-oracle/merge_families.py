#!/usr/bin/env python3
"""Merge a freshly-detected single-k free-alpha family set into the persistent families file.

Replace-by-k, mirroring how splice_preview_atlas.py drops-and-re-adds one k's preview block: every
existing record with k == --k is removed, then all records from --from are appended. Families of
OTHER k (and the _meta header) are left untouched. Idempotent: re-running with the same --from
reproduces the same file.

The --from file is the output of export_family_cells.py run for a single k (--catalog <k>:...). If
it is missing, unreadable, or has no records, this is treated as a HARD failure (exit 2) and the
target is left untouched — a genuine "0 families for this k" result must come from a real detector
run (export exits 0/1 with a written file), never from a crashed one. The caller
(refresh-preview.sh) only invokes this after a successful export, so an empty --from here means the
target's k records are legitimately cleared.

Usage:
  python3 merge_families.py --into ../../experiments/star-oracle/ctrnact-star-families.cells.json \
      --from /tmp/fam-k3.cells.json --k 3
"""
import argparse
import json
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--into", required=True, help="persistent families file (edited in place)")
    ap.add_argument("--from", dest="src", required=True, help="fresh single-k family set")
    ap.add_argument("--k", type=int, required=True)
    args = ap.parse_args()

    try:
        with open(args.src) as f:
            fresh = json.load(f)
        fresh_recs = fresh["records"]
    except (OSError, ValueError, KeyError) as e:
        print(f"⚑ merge_families: cannot read --from {args.src!r} ({e}) — target left untouched", file=sys.stderr)
        sys.exit(2)

    off_k = [r for r in fresh_recs if r.get("k") != args.k]
    if off_k:
        print(f"⚑ merge_families: --from contains {len(off_k)} record(s) with k != {args.k} — "
              f"expected a single-k set; target left untouched", file=sys.stderr)
        sys.exit(2)

    with open(args.into) as f:
        into = json.load(f)

    before = len(into["records"])
    kept = [r for r in into["records"] if r.get("k") != args.k]
    dropped = before - len(kept)
    into["records"] = kept + fresh_recs
    # stable order: by k, then id
    into["records"].sort(key=lambda r: (r.get("k", 0), r.get("id", "")))

    with open(args.into, "w") as f:
        json.dump(into, f, indent=1)

    print(f"merged k={args.k}: dropped {dropped} stale, added {len(fresh_recs)} fresh; "
          f"families file now {len(into['records'])} records")


if __name__ == "__main__":
    main()
