#!/bin/bash
# Benchmark + correctness harness for develop_spherical (the STAR track: regular + {n/d} faces on S²).
#   bench/run_sph.sh          k=2 over the star-ico-d gate blocks, 4017 of them
# Prints wall seconds and a hash of the realized records, which must never change.
# The authoritative gate is `make check-star`, which diffs digests against golden; this is the fast loop.
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PRUNED="${1:-$HERE/check-star-run2/out/pruned}"
K="${2:-2}"
OUT="$HERE/bench/sph-k$K.json"
t0=$(python3 -c 'import time;print(time.time())')
EU_PALETTE=star-ico-d EU_MAXDENS=3 python3 "$HERE/develop_spherical.py" --kmin $K --kmax $K \
  --pruned "$PRUNED" --out "$OUT" --report /dev/null >/dev/null 2>&1
t1=$(python3 -c 'import time;print(time.time())')
python3 - "$OUT" "$t0" "$t1" <<'PY'
import hashlib, json, sys
recs = json.load(open(sys.argv[1]))
def norm(r):
    return {"id": r["id"], "k": r.get("k"), "rho": round(float(r.get("rho", 0)), 9),
            "d": r.get("density"), "V": len(r["vertices"]), "F": len(r["faces"]),
            "pts": [[round(x, 7) for x in v] for v in r["vertices"]]}
blob = json.dumps(sorted((norm(r) for r in recs), key=lambda x: (x["id"], x["rho"], str(x["pts"][:1]))),
                  sort_keys=True)
print("develop_spherical  records=%-5d %.1fs  sha=%s"
      % (len(recs), float(sys.argv[3]) - float(sys.argv[2]), hashlib.sha256(blob.encode()).hexdigest()[:16]))
PY
