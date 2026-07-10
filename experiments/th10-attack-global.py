import json, re, math, cmath, csv
from collections import defaultdict, Counter
from math import gcd

GJ='/sessions/relaxed-peaceful-davinci/mnt/TilingAtlas/figures/data/galebach.json'
WT='/sessions/relaxed-peaceful-davinci/mnt/Thesis/thesis/figures/charts/weight-tightness.csv'
B=[cmath.exp(1j*math.pi/6*j) for j in range(4)]
def cx(v): return sum(v[j]*B[j] for j in range(4))
def dot(a,b): return (a.conjugate()*b).real
def cross(a,b): return (a.conjugate()*b).imag
def reduce2(v1,v2):
    for _ in range(1000):
        if dot(v2,v2)<dot(v1,v1): v1,v2=v2,v1
        d1=dot(v1,v1)
        if d1==0: break
        m=round(dot(v1,v2)/d1)
        if m==0: break
        v2=v2-m*v1
    return v1,v2
def classify(v1,v2):
    l1=abs(v1); l2=abs(v2)
    if abs(l1-l2)>1e-5*max(l1,l2): return 'rect/obl(E)'
    ang=math.degrees(math.acos(max(-1,min(1,dot(v1,v2)/(l1*l2)))))
    if abs(ang-90)<1e-3: return 'square(R)'
    if abs(ang-60)<1e-3 or abs(ang-120)<1e-3: return 'hex(R)'
    return 'rhombic(E)'
txt=open(GJ).read(); txt=txt[txt.index('{'):]; txt=re.sub(r',(\s*[}\]])', r'\1', txt); G=json.loads(txt)
kof={}
for r in csv.DictReader(open(WT)): kof[r['id']]=int(r['k'])

def count_distinct_mod(vals, P, tol=1e-6):
    xs=sorted(v % P for v in vals); reps=[]
    for x in xs:
        placed=False
        for rr in reps:
            d=abs(x-rr); d=min(d,P-d)
            if d<=tol: placed=True; break
        if not placed: reps.append(x)
    return len(reps)

def prim_dirs(N):
    ds=[]
    for p in range(-N,N+1):
        for q in range(0,N+1):
            if p==0 and q==0: continue
            if q==0 and p<0: continue
            if gcd(abs(p),abs(q))!=1: continue
            ds.append((p,q))
    return ds

# brute-force row count from a real patch (validation), direction u perpendicular to w
def brute_rows(seed,v1,v2,w,reps=12,tol=1e-5):
    A=abs(cross(v1,v2))
    u=1j*w/abs(w)              # unit perp to w
    P=A/abs(w)                 # actual perpendicular spacing period (distance)
    hs=[]
    for a in range(-reps,reps+1):
        for b in range(-reps,reps+1):
            off=a*v1+b*v2
            for s in seed:
                p=s+off
                # keep a central band to avoid edge truncation of rows
                hs.append((u.conjugate()*p).real)
    # fold into [0,P)
    return count_distinct_mod(hs,P,tol=tol)

N=6
dirs=prim_dirs(N)
elong=[]
for tid,e in G.items():
    T1=cx(e['T1']); T2=cx(e['T2'])
    if abs(T1)<1e-9 or abs(T2)<1e-9: continue
    v1,v2=reduce2(T1,T2); lat=classify(v1,v2)
    if '(R)' in lat: continue
    k=kof.get(tid,int(tid[1])); seed=[cx(s) for s in e['Seed']]; A=abs(cross(v1,v2))
    gmin=10**9; argd=None
    for (p,q) in dirs:
        w=p*v1+q*v2
        c=count_distinct_mod([cross(w,s) for s in seed],A)
        if c<gmin: gmin=c; argd=(p,q)
    elong.append((tid,k,lat,gmin,argd,2*k+2,len(seed),v1,v2,seed))

print(f"elongated: {len(elong)}   direction search |p|,|q|<= {N}  ({len(dirs)} primitive dirs)")
viol=[e for e in elong if e[3] > e[5]]
hit2kp2=[e for e in elong if e[3]==e[5]]
hit2kp1=[e for e in elong if e[3]==e[5]-1]
print(f"\n=== PART A (global min over primitive-lattice-perp directions) ===")
print(f"violations of #rows(globalmin) <= 2k+2 : {len(viol)}")
print(f"tilings hitting EXACTLY 2k+2 (need +2)  : {len(hit2kp2)}  -> {[e[0] for e in hit2kp2]}")
print(f"tilings hitting EXACTLY 2k+1            : {len(hit2kp1)}  -> {[e[0] for e in hit2kp1][:20]}")
marg=Counter(e[3]-(e[5]-2) for e in elong)  # gmin - 2k
print("distribution gmin - 2k:", dict(sorted(marg.items())))
if viol:
    print("\n--- HARD VIOLATIONS (best over ALL primitive directions still > 2k+2) ---")
    for e in sorted(viol,key=lambda x:x[3]-x[5],reverse=True):
        print(f"  {e[0]} k={e[1]} lat={e[2]:11s} gmin_rows={e[3]} @dir(p,q)={e[4]} 2k+2={e[5]} |seed|={e[6]}")

# Validate the mod-P counting against brute patch for the extreme cases + a few random
import random
random.seed(1)
sample=[e for e in elong if e[3]>=e[5]-0] + random.sample(elong,6)
print("\n=== validation: mod-P count vs brute patch (best dir) ===")
for e in sample[:14]:
    tid,k,lat,gmin,argd,_,_,v1,v2,seed=e
    p,q=argd; w=p*v1+q*v2
    br=brute_rows(seed,v1,v2,w)
    print(f"  {tid}: modP={gmin} brute={br} dir={argd}  {'OK' if br==gmin else '**MISMATCH**'}")
