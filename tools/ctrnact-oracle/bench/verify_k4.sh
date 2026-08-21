#!/bin/bash
# The definitive check: re-develop all 1169 k=4 blocks and compare to the shipped baseline output.
# Records must match EXACTLY as solids — same congruence classes, same count.
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${1:-opt}"
OUT="$HERE/bench/k4-$TAG.json"
rm -rf "$OUT" "$OUT.shards"
t0=$(python3 -c 'import time;print(time.time())')
python3 "$HERE/run_develop_sharded.py" --palette spherical --pruned "$HERE/sph-k4/out/pruned" \
  --out "$OUT" --workers 10 --kmin 4 --kmax 4 --developer develop_euclid.py \
  --log "$HERE/bench/k4-$TAG-driver.log" >/dev/null 2>&1
t1=$(python3 -c 'import time;print(time.time())')
python3 - "$OUT" "$HERE/sph-k4/euclid-k4.json" "$t0" "$t1" <<'PY'
import json, sys
import numpy as np
def key(V, q=1e-6):
    V = np.asarray(V, float); P = V - V.mean(axis=0)
    P = P / (np.linalg.norm(P, axis=1).max() or 1.0)
    d = np.linalg.norm(P[:, None, :] - P[None, :, :], axis=2)
    return (len(V), tuple(sorted(np.round(d[np.triu_indices(len(V), 1)] / 1e-3).astype(int).tolist())))
new = json.load(open(sys.argv[1])); old = json.load(open(sys.argv[2]))
kn, ko = {key(r["vertices"]) for r in new}, {key(r["vertices"]) for r in old}
dt = float(sys.argv[4]) - float(sys.argv[3])
print("records  baseline %d  ->  now %d       %.0fs wall (baseline 3065s, %.1fx)"
      % (len(old), len(new), dt, 3065.0 / dt))
print("solids   baseline %d  ->  now %d  |  lost %d, gained %d"
      % (len(ko), len(kn), len(ko - kn), len(kn - ko)))
print("VERDICT: %s" % ("IDENTICAL" if kn == ko and len(new) == len(old) else "*** DIFFERS ***"))
PY
