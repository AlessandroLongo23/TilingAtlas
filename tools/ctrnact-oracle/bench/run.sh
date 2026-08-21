#!/bin/bash
# Benchmark + correctness harness for develop_euclid.
#   bench/run.sh fast   ~88 blocks, the iteration loop
#   bench/run.sh big   ~277 blocks, the confirmation
# Prints wall seconds and a SHA of the realized records, which must NEVER change.
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SET="${1:-fast}"
OUT="$HERE/bench/$SET.json"
t0=$(python3 -c 'import time;print(time.time())')
EU_PALETTE=spherical python3 "$HERE/develop_euclid.py" --kmin 4 --kmax 4 \
  --pruned "$HERE/bench/$SET" --out "$OUT" --report "$HERE/bench/$SET-report.txt" >/dev/null 2>&1
t1=$(python3 -c 'import time;print(time.time())')
python3 - "$OUT" "$t0" "$t1" <<'PY'
import hashlib, json, sys
recs = json.load(open(sys.argv[1]))
# Hash only what the shelf consumes, rounded, so a harmless float wobble in the last bits does not
# look like a behaviour change — but a different SOLID always does.
def norm(r):
    return {"id": r["id"], "k": r["k"], "vc": r["vertexConfig"],
            "V": [[round(x, 7) for x in v] for v in r["vertices"]],
            "F": [list(f) for f in r["faces"]]}
blob = json.dumps(sorted((norm(r) for r in recs), key=lambda x: (x["id"], str(x["V"][:1]))), sort_keys=True)
print("%-6s records=%-4d  %.1fs  sha=%s"
      % (sys.argv[1].split("/")[-1], len(recs), float(sys.argv[3]) - float(sys.argv[2]),
         hashlib.sha256(blob.encode()).hexdigest()[:16]))
PY
