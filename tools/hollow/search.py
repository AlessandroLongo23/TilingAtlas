"""Hollow-tiling search: nearest-first disk growth + coverage-safe density gate.

Gates:
  GROW    nearest-first completion under the mod-360 vertex-closure rule, bounded by
          a cap on the NUMBER of completions (a step-count bound, not a radius test:
          Z[zeta_24] is dense, so a radius cutoff is not a finiteness argument).
  DENSITY total winding summed over all faces must be one constant, sampled only
          within the radius whose covering faces are all guaranteed placed.

Validated by reproducing the 11 convex uniform tilings and rejecting the 4 convex
species (3.3.4.12, 3.3.6.6, 3.4.3.12, 3.4.4.6) that close to 360 but tile nothing.

Outcomes are three-valued. "capped" means the growth ran out of budget before a
judgeable disk existed: that is UNKNOWN, not a rejection.
"""
import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cfg import corner_types, enum_configs
from grow2 import grow_disk
from verify2 import density

def nm(w): return '.'.join((str(n) if d == 1 else "%d/%d" % (n, d)) for n, d in w)

def run(delta, maxm, cap, tcap, logpath, ns=(3,4,6,8,12), minm=3):
    T = corner_types(list(ns)); cfgs = enum_configs(T, delta, maxm, minm=minm)
    log = open(logpath, 'a', buffering=1)
    def w(s): print(s, flush=True); log.write(s+"\n")
    w("\n=== delta=%d maxm=%d cap=%d tcap=%.0fs : %d species ===" % (delta, maxm, cap, tcap, len(cfgs)))
    t0 = time.time(); tilings = []; capped = []; timeouts = []
    for i, c in enumerate(cfgs):
        r, P, why = grow_disk(c, max_completions=cap, time_cap=tcap, target_r=6.0)
        if not r:
            if why == "timeout": timeouts.append(nm(c))
            continue
        dv, rad = density(P, len(c), nsamp=140)
        if dv is None:
            capped.append(nm(c)); continue
        if len(dv) == 1:
            val = list(dv)[0]
            tilings.append(dict(cfg=nm(c), density=val, faces=len(P.faces), safe_r=round(rad, 2)))
            w("  TILING %-32s density=%-4d faces=%5d safe_r=%.2f" % (nm(c), val, len(P.faces), rad))
        if (i+1) % 50 == 0:
            el = time.time()-t0
            w("  ... %d/%d tilings=%d capped=%d timeouts=%d %.0fs eta=%.0fs"
              % (i+1, len(cfgs), len(tilings), len(capped), len(timeouts), el, el/(i+1)*(len(cfgs)-i-1)))
    w("=> delta=%d: %d TILINGS | %d capped(unknown) | %d timeouts(unknown) | %.0fs"
      % (delta, len(tilings), len(capped), len(timeouts), time.time()-t0))
    if capped: w("   CAPPED (unknown, not rejected): %s" % capped)
    if timeouts: w("   TIMEOUT (unknown, not rejected): %s" % timeouts)
    log.close()
    json.dump(dict(tilings=tilings, capped=capped, timeouts=timeouts),
              open("%s.d%d.json" % (logpath, delta), "w"), indent=1)
    return tilings, capped, timeouts

if __name__ == "__main__":
    delta, maxm, cap = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
    tcap, logp = float(sys.argv[4]), sys.argv[5]
    minm = int(sys.argv[6]) if len(sys.argv) > 6 else 3
    run(delta, maxm, cap, tcap, logp, minm=minm)
