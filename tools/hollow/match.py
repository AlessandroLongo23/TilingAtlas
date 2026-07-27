"""Match the search output against the published Grunbaum-Miller-Shephard configs.

Results are quotiented by orientation reversal ({n/d} -> {n/(n-d)}, cyclic order
reversed, delta -> m-delta), which sends a tiling to the same tiling traversed the
other way. Both members of a pair are found by the search and must count once.
"""
import sys, os, json, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from quotient import parse, orbit, GMS, CONVEX11

def load(paths):
    tilings, capped, timeouts = [], [], []
    for p in paths:
        d = json.load(open(p))
        tilings += [t["cfg"] for t in d["tilings"]]
        capped += d.get("capped", []); timeouts += d.get("timeouts", [])
    return tilings, capped, timeouts

paths = sorted(glob.glob(sys.argv[1]))
found, capped, timeouts = load(paths)
print("input files: %s" % [os.path.basename(p) for p in paths])
print("raw configs accepted: %d   capped(unknown): %d   timeouts(unknown): %d"
      % (len(found), len(capped), len(timeouts)))

forb = {}
for f in found: forb.setdefault(orbit(parse(f)), []).append(f)
print("distinct tilings after reversal quotient: %d" % len(forb))

convex_orb = {orbit(parse(v)) for v in CONVEX11}
gms_orb = {orbit(parse(v)): k for k, v in GMS.items()}
cap_orb = {orbit(parse(c)) for c in capped + timeouts}

hit_convex = [o for o in forb if o in convex_orb]
hit_gms = sorted((gms_orb[o], forb[o]) for o in forb if o in gms_orb)
miss_gms = sorted((k, v) for o, k in gms_orb.items() if o not in forb
                  for v in [GMS[k]])
novel = [forb[o] for o in forb if o not in convex_orb and o not in gms_orb]

print("\nconvex uniform tilings recovered : %d / 11" % len(hit_convex))
print("published GMS configs recovered  : %d / %d" % (len(hit_gms), len(gms_orb)))
for k, v in hit_gms: print("   %-5s  %s" % (k, v))
if miss_gms:
    print("published GMS configs NOT recovered:")
    for k, v in miss_gms:
        st = "UNKNOWN (capped/timeout)" if orbit(parse(v)) in cap_orb else "absent"
        print("   %-5s  %-26s  %s" % (k, v, st))
print("\nnot in my transcribed published list (%d):" % len(novel))
for g in sorted(novel): print("   %s" % g)
