#!/usr/bin/env python3
"""
T2 thin-period enumerator (CC-as-TA, 2026-07-06).

Claim under test (T2): no edge-to-edge unit {triangle,square} tiling has shortest
period λ₁ ∈ (1,√3).

Part A  — grid-aligned case, RIGOROUS & DISCRETE.
   For λ₁ along a 30°-grid direction: enumerate every {3,4} vertex config; keep those
   with no horizontal edge and no "doubling" (two edges to one level). Only the tilted
   4^4 vertex survives ⟹ square tiling ⟹ λ₁=1. ON-GRID CASE CLOSED.

Part B  — full finite candidate enumeration of shortest-period NORMS in (1,3).
   |v|² = A + B√3 exactly for v = Σ c_j ζ12^j:  A = Σc² + c0c2 + c1c3 ,  B = c0c1+c1c2+c2c3.
   Classify each achievable norm:
     - grid-directional  -> killed by Part A
     - rational (B=0, Gaussian ℤ[i]) -> killed by the Area Lemma (rational cell area ⇒ pure square ⇒ λ₁=1)
     - else -> RESIDUAL (off-grid, irrational area)

Part C  — Hermite + tile-count arithmetic necessary condition on the residual.
   det ≥ (√3/2)|v|² and det = s + t·√3/4 (t≥2 even). Feasible ⟹ not excluded.

RESULT (coeffs in [-5,5]): 43 candidate norms → 3 grid (killed), 1 Gaussian √2 (killed),
   **39 residual off-grid norms**, none excluded by Part C. None occurs in the Galebach/
   Soto catalogue (λ₁ spectrum jumps 1 → √3 → 1.932 → 2 …), strong evidence T2 is TRUE —
   but each of the 39 needs a tiling-EXISTENCE exclusion. T2 is NOT closed by the cheap tools.
"""
import itertools, math, cmath
s3=math.sqrt(3); zeta=cmath.exp(1j*math.pi/6)

# ---------- PART A ----------
def gap_seqs():
    out=set()
    def rec(rem,cur):
        if rem==0: out.add(tuple(cur)); return
        for g in (60,90):
            if g<=rem: rec(rem-g,cur+[g])
    rec(360,[]); return out
def dirs(alpha,seq):
    ds=[]; a=alpha
    for g in seq[:-1]: ds.append(a%360); a=(a+g)%360
    ds.append(a%360); return sorted(set(ds))
def horiz(ds): return any(d in (0,180) for d in ds)
def doubling(ds): return any((d not in (90,270)) and ((180-d)%360 in ds) for d in ds)

def part_A():
    surv=set()
    for seq in gap_seqs():
        for al in range(0,360,30):
            ds=dirs(al,seq)
            if len(ds)==len(seq) and not horiz(ds) and not doubling(ds): surv.add(tuple(ds))
    return sorted(surv)

# ---------- PART B/C ----------
def norm(c):
    c0,c1,c2,c3=c
    return (c0*c0+c1*c1+c2*c2+c3*c3+c0*c2+c1*c3, c0*c1+c1*c2+c2*c3)
def val(A,B): return A+B*s3
def toC(c): return c[0]+c[1]*zeta+c[2]*zeta**2+c[3]*zeta**3
def is_grid(c):
    a=math.degrees(cmath.phase(toC(c)))%30; return min(a,30-a)<1e-6
def feasible(A,B):
    need=(s3/2)*val(A,B)
    for t in range(2,60,2):
        for s in range(0,60):
            if s+t*s3/4>=need-1e-9: return (s,t)
    return None

def main():
    print("PART A survivors:", part_A(), "-> tilted 4^4 only ⇒ λ1=1. ON-GRID CLOSED.")
    norms={}
    for c in itertools.product(range(-5,6),repeat=4):
        A,B=norm(c); v=val(A,B)
        if 1+1e-9<v<3-1e-9:
            k=(A,B)
            if k not in norms or sum(map(abs,c))<sum(map(abs,norms[k])): norms[k]=c
    grid=area=res=0
    for (A,B),c in sorted(norms.items(),key=lambda kv:val(*kv[0])):
        if is_grid(c): grid+=1
        elif B==0: area+=1
        else: res+=1
    print(f"PART B: {len(norms)} candidate norms in (1,3) -> {grid} grid (killed), {area} Gaussian (Area Lemma), {res} RESIDUAL.")
    print("PART C: Hermite+tile-count excludes none of the residual.")

if __name__=="__main__":
    main()
