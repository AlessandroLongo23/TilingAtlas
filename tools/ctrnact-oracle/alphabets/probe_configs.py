#!/usr/bin/env python3
"""Config-count probe: how big is a palette's vertex-configuration space, and how long to build it?

The generator's expensive tail (folds, certificates, emit) only runs on configs that already exist,
so the enumeration count alone decides whether a palette is reachable at all. This runs just that
stage, with the same forbidden-pair prune the generator uses, and prints count + wall time.

  python3 probe_configs.py palettes/equi3-cx-z24.json
"""
import sys, time
from gen_alphabet import load_palette, enum_configs, forbidden_adjacent_pairs

path = sys.argv[1]
spec, D, tiles, classes = load_palette(path)
maxv = spec.get("maxValence", 12)
print(f"{spec['name']}: D={D} tiles={len(tiles)} corner_classes={len(classes)} maxValence={maxv}", flush=True)
ang = sorted(set(c.units for c in classes))
print(f"  corner angles (units of {360//D} deg): {ang}", flush=True)

t0 = time.time()
forbidden = forbidden_adjacent_pairs(classes, D) if spec.get("pruneOverlap") else None
t1 = time.time()
print(f"  forbidden pairs: {len(forbidden) if forbidden else 0}  ({t1-t0:.1f}s)", flush=True)

cfgs = enum_configs(D, classes, 3, maxv, spec.get("closure", "euclidean"), forbidden)
t2 = time.time()
print(f"  vertex configs: {len(cfgs)}   enumeration {t2-t1:.1f}s   total {t2-t0:.1f}s", flush=True)
