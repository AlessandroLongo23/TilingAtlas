"""Simple closed unit-edge polygons on the 2pi/D direction grid, up to rotation+reflection.
Tile = cyclic interior-angle word (a_0..a_{n-1}) in D-units. turn_i = D/2 - a_i.
Edge k points along direction Dir_k = sum_{i<k} turn_i (mod D); Dir_0 = 0.
Closure: sum_k unitvec(Dir_k) = 0.  Total turning = D automatically when sum(a_i) = D(n-2)/2.
Flat 180 corners excluded => genuine corners only (the 'coarse' reading of a tile)."""
import sys, math
from collections import Counter

def run(D, nmax):
    half = D//2
    cand = [a for a in range(1, D) if a != half]
    C = [(math.cos(2*math.pi*k/D), math.sin(2*math.pi*k/D)) for k in range(D)]
    res_by_n = {}
    for n in range(3, nmax+1):
        if D*(n-2) % 2: continue
        target = D*(n-2)//2
        w=[0]*n; found=[]
        def dfs(i, s, d, x, y):
            # placed edges 0..i (edge k dir known once a_{k-1} chosen); i angles chosen so far
            if i == n:
                if s == target and abs(x)<1e-9 and abs(y)<1e-9: found.append(tuple(w))
                return
            rem = n-i                        # angles still to choose
            if s + rem*min(cand) > target or s + rem*max(cand) < target: return
            # edges still to place = n-1-i ; they span at most that many units
            span = n-1-i
            if x*x+y*y > (span+1e-9)**2: return
            for a in cand:
                w[i]=a
                nd=(d+half-a)%D
                if i < n-1: dfs(i+1, s+a, nd, x+C[nd][0], y+C[nd][1])
                else:       dfs(i+1, s+a, nd, x, y)     # last angle closes; no new edge
        dfs(0,0,0,C[0][0],C[0][1])          # edge 0 along dir 0, already placed
        seen=set()
        for t in found:
            f=[tuple(t[i:]+t[:i]) for i in range(n)]
            r=t[::-1]; f+=[tuple(r[i:]+r[:i]) for i in range(n)]
            seen.add(min(f))
        res_by_n[n]=seen
    return res_by_n

def period(w):
    L=len(w)
    for p in range(1,L+1):
        if L%p==0 and all(w[i]==w[(i+p)%L] for i in range(L)): return p
    return L

def simple(w,D):
    half=D//2; d=0; pts=[(0.0,0.0)]
    for a in w[:-1]:
        x,y=pts[-1]; pts.append((x+math.cos(2*math.pi*d/D), y+math.sin(2*math.pi*d/D)))
        d=(d+half-a)%D
    x,y=pts[-1]; pts.append((x+math.cos(2*math.pi*d/D), y+math.sin(2*math.pi*d/D)))
    pts=pts[:-1]; n=len(pts)
    def I(p,q,r,s):
        d1=(q[0]-p[0],q[1]-p[1]); d2=(s[0]-r[0],s[1]-r[1])
        den=d1[0]*d2[1]-d1[1]*d2[0]
        if abs(den)<1e-12: return False
        t=((r[0]-p[0])*d2[1]-(r[1]-p[1])*d2[0])/den
        u=((r[0]-p[0])*d1[1]-(r[1]-p[1])*d1[0])/den
        return 1e-9<t<1-1e-9 and 1e-9<u<1-1e-9
    for i in range(n):
        for j in range(i+2,n):
            if i==0 and j==n-1: continue
            if I(pts[i],pts[(i+1)%n],pts[j],pts[(j+1)%n]): return False
    return True

D=int(sys.argv[1]); nmax=int(sys.argv[2])
R=run(D,nmax)
print(f"=== D={D} ({360//D}deg units), n<={nmax}: simple closed unit-edge polygons up to rot+refl ===")
print(f"{'n':>3} {'total':>7} {'convex':>7} {'concave':>8}   period histogram")
gt=gc=0; allp=Counter(); examples={}
for n in sorted(R):
    ws=[w for w in R[n] if simple(w,D)]
    cv=[w for w in ws if all(a<D/2 for a in w)]
    pc=Counter(period(w) for w in ws); allp.update(pc)
    gt+=len(ws); gc+=len(cv)
    for w in ws:
        p=period(w)
        if p>=3 and any(a>D/2 for a in w): examples.setdefault((n,p), w)
    print(f"{n:>3} {len(ws):>7} {len(cv):>7} {len(ws)-len(cv):>8}   {dict(sorted(pc.items()))}")
print(f"TOTAL {gt} ({gc} convex, {gt-gc} concave); periods {dict(sorted(allp.items()))}")
print("\nsample CONCAVE tiles with period>=3 (the systematically-missing family):")
for k in sorted(examples)[:10]:
    w=examples[k]; print(f"  n={k[0]} p={k[1]}: {[a*360//D for a in w]}")

print("\n=== CONVEX tiles only, with period (answers: does p apply to convex polygons?) ===")
for n in sorted(R):
    ws=[w for w in R[n] if simple(w,D) and all(a<D/2 for a in w)]
    for w in sorted(ws, key=period):
        print(f"  n={n} p={period(w)} order={n//period(w)}  {[a*360//D for a in w]}")
