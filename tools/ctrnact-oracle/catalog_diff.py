#!/usr/bin/env python3
"""Cross-palette pruned-catalog diff for the star engine.

Blocks are keyed on the CANONICAL vertex-type line (line 2 of each block: the sorted
counted-orbit symbols with multiplicities). Symbols are palette-independent (systematic
config-word + subgroup-variant names), unlike the TES ids (per-palette codes/famchars),
so this key survives palette changes. Counts are compared as multisets, so two distinct
tilings sharing a vertex-type multiset would surface as a count mismatch, not silently
collapse.

Usage: catalog_diff.py OLD.txt NEW.txt [--show-new]
Exit 1 if any old block is missing from new (ZERO-LOST gate failure).
"""
import sys
import collections


def blocks(path):
    out = []
    for raw in open(path).read().split("---"):
        lines = [l for l in raw.strip().splitlines() if l.strip()]
        if not lines:
            continue
        key = lines[1] if len(lines) > 1 else lines[0]
        out.append((key, "\n".join(lines)))
    return out


def main():
    old_p, new_p = sys.argv[1], sys.argv[2]
    show_new = "--show-new" in sys.argv
    old, new = blocks(old_p), blocks(new_p)
    co = collections.Counter(k for k, _ in old)
    cn = collections.Counter(k for k, _ in new)
    print(f"old: {len(old)} blocks   new: {len(new)} blocks")
    lost = {k: (co[k], cn.get(k, 0)) for k in co if co[k] > cn.get(k, 0)}
    gained = [(k, b) for k, b in new if cn[k] > co.get(k, 0)]
    print(f"LOST (old>new count): {len(lost)}")
    for k, (a, b) in sorted(lost.items()):
        print(f"  LOST {k}   old x{a} new x{b}")
    print(f"NEW  (new>old count): {len(gained)}")
    if show_new:
        for k, body in gained:
            print(body)
            print("---")
    else:
        for k, _ in gained:
            print(f"  NEW {k}")
    sys.exit(1 if lost else 0)


if __name__ == "__main__":
    main()
