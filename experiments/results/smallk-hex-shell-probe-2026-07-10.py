#!/usr/bin/env python3
"""Small-k hexagonal-branch feasibility probe (exact integer arithmetic).

Facts used (all proven in the thesis):
- k>=2 regular tilings live in the 12-direction regime; periods lie in Z[zeta_12].
- |u|^2 for u = a + b*z + c*z^2 + d*z^3 (z = zeta_12) equals
      X + Y*sqrt3,  X = a^2+b^2+c^2+d^2+ac+bd,  Y = ab+bc+cd.
- Hexagonal lattice: |u|^2 = (2/sqrt3)*A, A = sum of vertex corner-shares
  = (P + Q*sqrt3)/12 with P,Q >= 0 integers  =>  X = Q/6 >= 0, Y = P/18 >= 0.
- Census bound (crude, k=3): n = |V(Q)| <= 12k = 36, share <= (12+7*sqrt3)/12
  => A <= 36*(12+7sqrt3)/12 = 36 + 21*sqrt3 ~ 72.37  =>  |u|^2 <= 83.57.

Probe: enumerate ALL u in Z[zeta_12] with X <= 84, Y >= 0, 1 <= X+Y*sqrt3 <= 84
(superset of every possible minimal vector of a hex-lattice k<=3 tiling),
group into norm shells, compute wt12(u) = min #(12th roots of unity) summing
to u by BFS over exact coefficient vectors. Report per-shell min/max weight.
"""
import sys
from collections import defaultdict

CAP = 84          # |u|^2 value cap (crude census bound 83.57)
MAXW = 14         # BFS depth cap

# zeta_12 powers in basis (1, z, z^2, z^3), z^4 = z^2 - 1
Z = [(1,0,0,0),(0,1,0,0),(0,0,1,0),(0,0,0,1)]
def mulz(v):  # multiply by z
    a,b,c,d = v
    # (a + bz + cz^2 + dz^3)*z = az + bz^2 + cz^3 + d(z^2-1)... wait z^4=z^2-1
    return (-d, a, b+d, c)
units = []
v = (1,0,0,0)
for _ in range(12):
    units.append(v)
    v = mulz(v)
assert v == (1,0,0,0)
assert units[6] == (-1,0,0,0)

def norm(v):
    a,b,c,d = v
    X = a*a+b*b+c*c+d*d+a*c+b*d
    Y = a*b+b*c+c*d
    return X, Y

def val_le(X, Y, cap):  # X + Y*sqrt3 <= cap, exact
    r = cap - X
    if Y >= 0:
        return r >= 0 and 3*Y*Y <= r*r
    return r >= 0 or 3*Y*Y >= r*r  # Y<0: true iff -(|Y|sqrt3) <= r

def val_ge1(X, Y):  # X + Y*sqrt3 >= 1
    r = X - 1
    if Y >= 0:
        return r >= 0 or 3*Y*Y >= r*r
    return r >= 0 and 3*Y*Y <= r*r

# 1) target shells: all u with X<=84, Y>=0, 1 <= val <= 84
targets = {}
B = 14  # |coeff| bound: X >= lam_min * sum sq; lam_min of the form ~ 0.13? safe: X>=84 needs coeff<=~14 -- verify below
# positive definiteness check of X-form margin: brute assert on boundary
shells = defaultdict(list)
for a in range(-B, B+1):
    for b in range(-B, B+1):
        for c in range(-B, B+1):
            for d in range(-B, B+1):
                v = (a,b,c,d)
                X, Y = norm(v)
                if v == (0,0,0,0) or X > CAP or Y < 0:
                    continue
                if not val_le(X, Y, CAP) or not val_ge1(X, Y):
                    continue
                shells[(X, Y)].append(v)
# boundary sanity: no admissible element needs |coeff| = B (else widen B)
for (X, Y), vs in shells.items():
    for v in vs:
        assert max(abs(t) for t in v) < B, ("widen B", v)

nshell = len(shells)
nelem = sum(len(v) for v in shells.values())
print(f"shells: {nshell}, elements: {nelem}", flush=True)

# 2) BFS weights over Z[zeta_12] sums of unit roots
need = set()
for vs in shells.values():
    need.update(vs)
wt = {}
frontier = {(0,0,0,0)}
seen = {(0,0,0,0)}
found = 0
for depth in range(1, MAXW+1):
    nxt = set()
    for s in frontier:
        for u in units:
            t = (s[0]+u[0], s[1]+u[1], s[2]+u[2], s[3]+u[3])
            if t not in seen:
                nxt.add(t)
    seen |= nxt
    frontier = nxt
    hit = nxt & need
    for t in hit:
        wt[t] = depth
    found += len(hit)
    print(f"depth {depth}: frontier {len(frontier)}, resolved {found}/{len(need)}", flush=True)
    if found == len(need):
        break

unresolved = need - set(wt)
print(f"unresolved (wt > {MAXW}): {len(unresolved)}")

# 3) per-shell stats
rows = []
for (X, Y), vs in sorted(shells.items()):
    ws = [wt.get(v, None) for v in vs]
    if any(w is None for w in ws):
        rows.append((X, Y, len(vs), min(w for w in ws if w), f">{MAXW}"))
    else:
        rows.append((X, Y, len(vs), min(ws), max(ws)))
mx = max(r[4] for r in rows if isinstance(r[4], int))
print(f"MAX shell weight over superset: {mx}")
print("worst shells (max wt >= mx-1):")
for r in rows:
    if isinstance(r[4], int) and r[4] >= mx-1:
        print(f"  |u|^2 = {r[0]}+{r[1]}sqrt3 (~{r[0]+r[1]*1.7320508:.2f})  n={r[2]}  wt min={r[3]} max={r[4]}")
# the 4.6.12 sanity shell
s = (12, 6)
if s in shells:
    ws = [wt[v] for v in shells[s]]
    print(f"sanity 4.6.12 shell (12,6): n={len(shells[s])} wt min={min(ws)} max={max(ws)} (measured W=5)")
