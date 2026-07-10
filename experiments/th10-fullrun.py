import json, re, math, cmath, csv, time
from collections import defaultdict, Counter
from math import gcd
GJ='/sessions/relaxed-peaceful-davinci/mnt/TilingAtlas/figures/data/galebach.json'
WT='/sessions/relaxed-peaceful-davinci/mnt/Thesis/thesis/figures/charts/weight-tightness.csv'
LOG='/sessions/relaxed-peaceful-davinci/mnt/TilingAtlas/experiments/results/th10-attack-2026-07-08.log'
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
def latc(z,v1,v2):
    a11,a12,a21,a22=v1.real,v2.real,v1.imag,v2.imag
    D=a11*a22-a12*a21
    return ( a22*z.real - a12*z.imag)/D, (-a21*z.real + a11*z.imag)/D
def in_lat(z,v1,v2,tol=1e-6):
    a,b=latc(z,v1,v2); return abs(a-round(a))<tol and abs(b-round(b))<tol
def torus(z,v1,v2):
    a,b=latc(z,v1,v2); return (a%1.0,b%1.0)
def teq(p,q,tol=1e-5):
    for x,y in ((p[0],q[0]),(p[1],q[1])):
        d=abs(x-y); d=min(d,1-d)
        if d>tol: return False
    return True
def find_coset(seed,tp,v1,v2,M):
    Q=[torus(M(s),v1,v2) for s in seed]
    for qi in Q:
        for pj in tp:
            t=((pj[0]-qi[0])%1.0,(pj[1]-qi[1])%1.0)
            used=[False]*len(tp); ok=True
            for pt in Q:
                pt2=((pt[0]+t[0])%1.0,(pt[1]+t[1])%1.0); m=-1
                for idx,pp in enumerate(tp):
                    if not used[idx] and teq(pt2,pp): m=idx;break
                if m<0: ok=False;break
                used[m]=True
            if ok: return t
    return None
def refl_map(w):
    e2=w/w.conjugate(); return lambda z:e2*z.conjugate()
def count_distinct_mod(vals,P,tol=1e-6):
    xs=sorted(v%P for v in vals); reps=[]
    for x in xs:
        pl=False
        for rr in reps:
            d=abs(x-rr); d=min(d,P-d)
            if d<=tol: pl=True;break
        if not pl: reps.append(x)
    return len(reps)
def period_perp(w,v1,v2):
    A=abs(cross(v1,v2)); g1=cross(w,v1); g2=cross(w,v2)
    r1=round(g1/A); r2=round(g2/A); gg=gcd(abs(r1),abs(r2))
    return gg*A if gg>0 else A

AXES=[(1,0),(0,1),(1,1),(1,-1),(2,1),(1,2),(2,-1),(1,-2),(3,1),(1,3),(3,-1),(1,-3)]
def analyze(tid):
    e=G[tid]; T1=cx(e['T1']); T2=cx(e['T2'])
    if abs(T1)<1e-9 or abs(T2)<1e-9: return None
    v1,v2=reduce2(T1,T2); lat=classify(v1,v2)
    if '(R)' in lat: return None
    k=kof.get(tid,int(tid[1])); seed=[cx(s) for s in e['Seed']]
    tp=[torus(s,v1,v2) for s in seed]; n=len(seed)
    # detect group elements: rot180 + reflections/glides along AXES lattice dirs
    elems=[]
    t180=find_coset(seed,tp,v1,v2,(lambda z:-z))
    if t180 is not None: elems.append(('R180',(lambda z:-z),t180,None))
    axes_found=[]
    seen_ax=set()
    for (p,q) in AXES:
        w=p*v1+q*v2
        keyang=round(cmath.phase(w)%math.pi,4)
        if keyang in seen_ax: continue
        if not (in_lat(refl_map(w)(v1),v1,v2) and in_lat(refl_map(w)(v2),v1,v2)): continue
        M=refl_map(w); t=find_coset(seed,tp,v1,v2,M)
        if t is not None:
            seen_ax.add(keyang); elems.append(('ref',M,t,w)); axes_found.append(w)
    # orbits under generated group (closure)
    par=list(range(n))
    def find(x):
        while par[x]!=x: par[x]=par[par[x]]; x=par[x]
        return x
    def app(M,t,i):
        tt=torus(M(seed[i]),v1,v2); tt=((tt[0]+t[0])%1,(tt[1]+t[1])%1)
        for j in range(n):
            if teq(tt,tp[j]): return j
        return None
    changed=True
    # iterate to closure (compose generators repeatedly via union of direct images is enough for orbit partition)
    for _ in range(6):
        for lbl,M,t,w in elems:
            for i in range(n):
                j=app(M,t,i)
                if j is not None:
                    a,b=find(i),find(j)
                    if a!=b: par[a]=b
    grp=defaultdict(list)
    for i in range(n): grp[find(i)].append(i)
    orbs=list(grp.values())
    norb=len(orbs)
    # symmetry-aligned directions = perp to each mirror/glide axis
    aligned=[]
    for w in axes_found:
        P=period_perp(w,v1,v2)
        rows=count_distinct_mod([cross(w,s) for s in seed],P)
        # per-orbit max rows
        pom=max(count_distinct_mod([cross(w,seed[i]) for i in orb],P) for orb in orbs)
        aligned.append((rows,pom,w))
    grp_type='p1' if t180 is None and not axes_found else ('p2' if not axes_found else ('cm/pm/pg-type' if len(axes_found)==1 else 'D2(pmm/pmg/pgg/cmm)'))
    # for p1/p2 (no axis): reference rows perp v1,v2 and per-orbit
    if not axes_found:
        refdirs=[v1,v2,v1+v2,v1-v2]
        best=10**9; bpom=0
        for w in refdirs:
            P=period_perp(w,v1,v2)
            rows=count_distinct_mod([cross(w,s) for s in seed],P)
            pom=max(count_distinct_mod([cross(w,seed[i]) for i in orb],P) for orb in orbs)
            if rows<best: best=rows; bpom=pom
        aligned_min=best; aligned_pom=bpom
    else:
        amin=min(aligned,key=lambda a:a[0]); aligned_min=amin[0]
        aligned_pom=aligned[[a[0] for a in aligned].index(aligned_min)][1]
        # but pom should be evaluated in the SAME direction that gives min rows
        aligned_pom=min(aligned,key=lambda a:a[0])[1]
    return dict(tid=tid,k=k,lat=lat,n=n,norb=norb,grp=grp_type,
               nax=len(axes_found),aligned_min=aligned_min,aligned_pom=aligned_pom,
               bound=2*k+2, per_axis=[(r,pom,round(math.degrees(cmath.phase(w))%180,1)) for r,pom,w in aligned])

t0=time.time()
res=[]
ids=list(G.keys())
for i,tid in enumerate(ids):
    r=analyze(tid)
    if r: res.append(r)
    if i%200==0:
        with open(LOG,'a') as f: f.write(f"[{time.time()-t0:6.1f}s] processed {i}/{len(ids)}  elong so far {len(res)}\n")

# ORBIT COUNT sanity
mism=[r for r in res if r['norb']!=r['k']]
print(f"elongated analyzed: {len(res)}   orbit-count != k : {len(mism)}")
if mism:
    print("  sample mismatches:", [(r['tid'],r['norb'],r['k'],r['grp']) for r in mism[:15]])

# BOUND violations: aligned_min > 2k+2
bviol=[r for r in res if r['aligned_min']>r['bound']]
print(f"\n=== BOUND (#rows <= 2k+2 in symmetry-aligned direction) ===")
print(f"VIOLATIONS (aligned_min > 2k+2): {len(bviol)}")
for r in sorted(bviol,key=lambda r:r['aligned_min']-r['bound'],reverse=True):
    print(f"  {r['tid']} k={r['k']} {r['lat']:11s} grp={r['grp']:22s} aligned_rows={r['aligned_min']} 2k+2={r['bound']} axes(deg,rows,perOrbMax)={r['per_axis']}")

# saturate exactly 2k+2 and 2k+1
sat=[r for r in res if r['aligned_min']==r['bound']]
sat1=[r for r in res if r['aligned_min']==r['bound']-1]
print(f"\n saturating exactly 2k+2 (need the +2): {len(sat)}  {[r['tid'] for r in sat][:25]}")
print(f" saturating exactly 2k+1:               {len(sat1)} {[r['tid'] for r in sat1][:25]}")
from collections import Counter
md=Counter(r['aligned_min']-(r['bound']-2) for r in res)  # aligned - 2k
print(" distribution aligned_rows - 2k:", dict(sorted(md.items())))

# MECHANISM violations: some orbit occupies >2 rows in the (best) symmetry-aligned direction
mviol=[r for r in res if r['aligned_pom']>2]
print(f"\n=== MECHANISM ('<=2 rows per orbit') ===")
print(f"tilings where best-aligned direction still has an orbit spanning >2 rows: {len(mviol)} / {len(res)}")
pmdist=Counter(r['aligned_pom'] for r in res)
print(" distribution of max per-orbit rows (best aligned dir):", dict(sorted(pmdist.items())))
bygrp=Counter(r['grp'] for r in res)
print(" group-type counts:", dict(bygrp))
mby=Counter(r['grp'] for r in mviol)
print(" mechanism-violations by group type:", dict(mby))
with open(LOG,'a') as f: f.write(f"DONE bviol={len(bviol)} mviol={len(mviol)} mism={len(mism)}\n")
print("\nlog:",LOG)

print("\n\n########## FORENSIC APPENDIX ##########")
# list all 42 mechanism-violators, mark bound status, group refined
def refine_grp(tid):
    e=G[tid]; v1,v2=reduce2(cx(e['T1']),cx(e['T2'])); seed=[cx(s) for s in e['Seed']]
    tp=[torus(s,v1,v2) for s in seed]
    t180=find_coset(seed,tp,v1,v2,(lambda z:-z))
    pure=0; glide=0; axes=[]
    seen=set()
    for (p,q) in AXES:
        w=p*v1+q*v2; ka=round(cmath.phase(w)%math.pi,4)
        if ka in seen: continue
        if not (in_lat(refl_map(w)(v1),v1,v2) and in_lat(refl_map(w)(v2),v1,v2)): continue
        t=find_coset(seed,tp,v1,v2,refl_map(w))
        if t is None: continue
        seen.add(ka)
        tvec=t[0]*v1+t[1]*v2; par=dot(tvec,w)/abs(w)
        if abs(par-round(par))<1e-4 and abs(par)<1e-4 or abs(par)<1e-4: pure+=1
        else: glide+=1
        axes.append((round(math.degrees(cmath.phase(w))%180,1),'pure' if abs(par)<1e-4 else 'glide'))
    wp={ (True,0,0):'p2',(False,0,0):'p1' }
    # name
    if not axes: nm = 'p2' if t180 else 'p1'
    elif len(axes)==1: nm = ('pm/cm' if axes[0][1]=='pure' else 'pg')
    else:
        npg=sum(1 for a in axes if a[1]=='glide'); npm=len(axes)-npg
        if t180:
            nm = 'pmm' if npg==0 else ('pgg' if npm==0 else 'pmg')
        else: nm='?'
    return nm,axes

mv=sorted([r for r in res if r['aligned_pom']>2],key=lambda r:(r['k'],r['tid']))
print(f"\nAll {len(mv)} MECHANISM-violators (orbit spans 4 rows even in best aligned dir):")
for r in mv:
    nm,axes=refine_grp(r['tid'])
    bstat='BOUND-VIOLATION' if r['aligned_min']>r['bound'] else ('saturates2k+2' if r['aligned_min']==r['bound'] else 'bound-ok')
    print(f"  {r['tid']} k={r['k']} {r['lat']:11s} wp={nm:5s} axes={axes} alignedRows={r['aligned_min']} 2k+2={r['bound']} [{bstat}]")

# rhombic among violators?
print("\n rhombic elongated total:", sum(1 for r in res if 'rhombic' in r['lat']),
      " rhombic among mechanism-violators:", sum(1 for r in mv if 'rhombic' in r['lat']))

# t6364 legitimacy: CSV row + vertex degrees + brute row check
print("\n----- t6364 legitimacy -----")
for row in csv.DictReader(open(WT)):
    if row['id']=='t6364': print("  CSV:",row)
e=G['t6364']; v1,v2=reduce2(cx(e['T1']),cx(e['T2'])); seed=[cx(s) for s in e['Seed']]
# build patch, degrees
pts=[]; 
for a in range(-4,5):
    for b in range(-4,5):
        for s in seed: pts.append(s+a*v1+b*v2)
from collections import defaultdict as dd
deg=dd(int)
for i,p in enumerate(seed):
    d=0
    for q in pts:
        if 1e-9<abs(p-q)<1e-9+1: 
            if abs(abs(p-q)-1)<1e-6: d+=1
    deg[i]=d
print("  seed vertex degrees:",[deg[i] for i in range(len(seed))]," (regular-polygon tiling vertices have deg 3-6)")
# brute row count aligned dirs
def brute_rows(seed,v1,v2,w,reps=14):
    A=abs(cross(v1,v2)); u=1j*w/abs(w); P=A/abs(w); hs=[]
    for a in range(-reps,reps+1):
        for b in range(-reps,reps+1):
            for s in seed: hs.append((u.conjugate()*(s+a*v1+b*v2)).real)
    return count_distinct_mod(hs,P,1e-5)
print("  brute rows perp v1(climb/long v2):",brute_rows(seed,v1,v2,v1)," perp v2:",brute_rows(seed,v1,v2,v2),"  (2k+2=14)")

print("\n\n########## FAIR (steelmanned) RECOMPUTE ##########")
# For each elongated tiling: over its ACTUAL symmetry axes, minimize (independently)
#   - total rows perp-axis         -> bound test vs 2k+2
#   - max per-orbit rows perp-axis  -> mechanism test vs 2
# p2/p1 (no axis): rotation flips height in every dir => per-orbit<=2 always; use best of v1,v2,v1+-v2 for rows.
def fair(tid):
    e=G[tid]; T1=cx(e['T1']);T2=cx(e['T2'])
    if abs(T1)<1e-9 or abs(T2)<1e-9: return None
    v1,v2=reduce2(T1,T2); lat=classify(v1,v2)
    if '(R)' in lat: return None
    k=kof.get(tid,int(tid[1])); seed=[cx(s) for s in e['Seed']]; tp=[torus(s,v1,v2) for s in seed]; n=len(seed)
    t180=find_coset(seed,tp,v1,v2,(lambda z:-z))
    axes=[]; seen=set()
    for (p,q) in AXES:
        w=p*v1+q*v2; ka=round(cmath.phase(w)%math.pi,4)
        if ka in seen: continue
        if not (in_lat(refl_map(w)(v1),v1,v2) and in_lat(refl_map(w)(v2),v1,v2)): continue
        if find_coset(seed,tp,v1,v2,refl_map(w)) is not None:
            seen.add(ka); axes.append(w)
    # orbits
    par=list(range(n))
    def find(x):
        while par[x]!=x: par[x]=par[par[x]];x=par[x]
        return x
    def app(M,t,i):
        tt=torus(M(seed[i]),v1,v2); tt=((tt[0]+t[0])%1,(tt[1]+t[1])%1)
        for j in range(n):
            if teq(tt,tp[j]): return j
        return None
    gens=[]
    if t180 is not None: gens.append(((lambda z:-z),t180))
    for w in axes:
        t=find_coset(seed,tp,v1,v2,refl_map(w)); gens.append((refl_map(w),t))
    for _ in range(6):
        for M,t in gens:
            for i in range(n):
                j=app(M,t,i)
                if j is not None:
                    a,b=find(i),find(j)
                    if a!=b: par[a]=b
    grp=defaultdict(list)
    for i in range(n): grp[find(i)].append(i)
    orbs=list(grp.values())
    dirs = axes if axes else [v1,v2,v1+v2,v1-v2]
    best_rows=10**9; best_pom=10**9
    for w in dirs:
        P=period_perp(w,v1,v2)
        rows=count_distinct_mod([cross(w,s) for s in seed],P)
        pom=max(count_distinct_mod([cross(w,seed[i]) for i in orb],P) for orb in orbs)
        best_rows=min(best_rows,rows); best_pom=min(best_pom,pom)
    return dict(tid=tid,k=k,lat=lat,norb=len(orbs),has_axis=bool(axes),
                best_rows=best_rows,best_pom=best_pom,bound=2*k+2)

fr=[]
for tid in G:
    r=fair(tid)
    if r: fr.append(r)
bviol=[r for r in fr if r['best_rows']>r['bound']]
mviol=[r for r in fr if r['best_pom']>2]
sat=[r for r in fr if r['best_rows']==r['bound']]
print(f"elongated: {len(fr)}")
print(f"BOUND violations (min-over-axes total rows > 2k+2): {len(bviol)}  -> {[(r['tid'],r['k'],r['best_rows'],r['bound']) for r in bviol]}")
print(f"BOUND saturators (==2k+2, rely on +2):              {len(sat)}  -> {[r['tid'] for r in sat]}")
print(f"MECHANISM violations (NO aligned dir gives <=2 rows/orbit): {len(mviol)}")
from collections import Counter
print("  mechanism-violators best_pom distribution:", dict(Counter(r['best_pom'] for r in mviol)))
print("  all mechanism-violator IDs:", [r['tid'] for r in mviol])
# cross-tab: are all mechanism-violators pgg (both-glide)? 
print("\n  #elongated with >=1 symmetry axis:", sum(1 for r in fr if r['has_axis']),
      " | p1/p2 (no axis):", sum(1 for r in fr if not r['has_axis']))
print("  among no-axis (p1/p2): any per-orbit>2?", any(r['best_pom']>2 for r in fr if not r['has_axis']),
      " max total rows-2k:", max((r['best_rows']-(r['bound']-2)) for r in fr if not r['has_axis']))
