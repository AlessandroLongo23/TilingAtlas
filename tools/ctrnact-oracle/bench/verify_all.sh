#!/bin/bash
# Re-develop k=1, 2 and 3 with the optimised code and compare to the shipped baselines.
# k=3's baseline predates the Euler gate and contains one PINCHED record, so it is expected to lose
# exactly that one and nothing else.
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
for spec in "1 sph-k2-fix/out/pruned sph-k2-fix/euclid-k1.json" \
            "2 sph-k2-fix/out/pruned sph-k2-fix/euclid-k2.json" \
            "3 sph-k3/out/pruned    sph-k3/euclid-k3.json"; do
  set -- $spec
  K=$1; PRUNED="$HERE/$2"; BASE="$HERE/$3"
  OUT="$HERE/bench/redo-k$K.json"
  t0=$(python3 -c 'import time;print(time.time())')
  python3 "$HERE/run_develop_sharded.py" --palette spherical --pruned "$PRUNED" --out "$OUT" \
    --workers 10 --kmin $K --kmax $K --developer develop_euclid.py --log /dev/null >/dev/null 2>&1
  t1=$(python3 -c 'import time;print(time.time())')
  python3 - "$OUT" "$BASE" "$K" "$t0" "$t1" <<'PY'
import json, sys
import numpy as np
def key(V):
    V = np.asarray(V, float); P = V - V.mean(axis=0)
    P = P / (np.linalg.norm(P, axis=1).max() or 1.0)
    d = np.linalg.norm(P[:, None, :] - P[None, :, :], axis=2)
    return (len(V), tuple(sorted(np.round(d[np.triu_indices(len(V), 1)] / 1e-3).astype(int).tolist())))
new = json.load(open(sys.argv[1])); old = json.load(open(sys.argv[2]))
pinched = [r for r in old if r["residual"].get("euler") != 2]
old_ok = [r for r in old if r["residual"].get("euler") == 2]
kn, ko = {key(r["vertices"]) for r in new}, {key(r["vertices"]) for r in old_ok}
ok = kn == ko and len(new) == len(old_ok)
print("k=%s  %.0fs   baseline %d (%d pinched, dropped by design) -> %d   lost %d gained %d   %s"
      % (sys.argv[3], float(sys.argv[5]) - float(sys.argv[4]), len(old), len(pinched), len(new),
         len(ko - kn), len(kn - ko), "IDENTICAL" if ok else "*** DIFFERS ***"))
PY
done
