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

def latc(z,v1,v2):
    a11,a12,a21,a22=v1.real,v2.real,v1.imag,v2.imag
    D=a11*a22-a12*a21
    a=( a22*z.real - a12*z.imag)/D
    b=(-a21*z.real + a11*z.imag)/D
    return a,b
def in_lat(z,v1,v2,tol=1e-6):
    a,b=latc(z,v1,v2); return abs(a-round(a))<tol and abs(b-round(b))<tol
def torus(z,v1,v2):
    a,b=latc(z,v1,v2); return (a%1.0, b%1.0)
def torus_eq(p,q,tol=1e-5):
    for x,y in ((p[0],q[0]),(p[1],q[1])):
        d=abs(x-y); d=min(d,1-d)
        if d>tol: return False
    return True

def sym_group(seed,v1,v2):
    # candidate linear maps M(z): rotations z->w z (w=+-1 for elongated, but test 6-fold set),
    # reflections z-> e^{2i a} conj(z) for axis angles a = angle of small lattice vectors & perps
    cands=[]
    # rotations
    for kk in range(12):
        w=cmath.exp(1j*math.pi/6*kk)
        cands.append(('rot%d'%(kk*30), (lambda z,w=w: w*z)))
    # reflections: axis along lattice vectors (p,q) small, and along v1,v2
    axes=set()
    for p in range(-4,5):
        for q in range(-4,5):
            if p==0 and q==0: continue
            wv=p*v1+q*v2
            axes.add(round(cmath.phase(wv)%math.pi,6))
    for a in axes:
        w=cmath.exp(2j*a)
        cands.append(('ref@%.1f'%math.degrees(a), (lambda z,w=w: w*z.conjugate())))
    elems=[]
    tp=[torus(s,v1,v2) for s in seed]
    for name,M in cands:
        if not (in_lat(M(v1),v1,v2) and in_lat(M(v2),v1,v2)): continue
        Q=[torus(M(s),v1,v2) for s in seed]
        # find translation t (torus) with Q+t == P as sets
        found=None
        for qi in Q:
            for pj in tp:
                t=((pj[0]-qi[0])%1.0,(pj[1]-qi[1])%1.0)
                ok=True
                Qt=[((x+t[0])%1.0,(y+t[1])%1.0) for (x,y) in Q]
                # match as multiset
                used=[False]*len(tp)
                for pt in Qt:
                    m=-1
                    for idx,pp in enumerate(tp):
                        if not used[idx] and torus_eq(pt,pp):
                            m=idx; break
                    if m<0: ok=False; break
                    used[m]=True
                if ok: found=t; break
            if found: break
        if found is not None:
            elems.append((name,M,found))
    return elems

def orbits(seed,v1,v2,elems):
    n=len(seed); tp=[torus(s,v1,v2) for s in seed]
    par=list(range(n))
    def find(x):
        while par[x]!=x: par[x]=par[par[x]]; x=par[x]
        return x
    def uni(a,b):
        ra,rb=find(a),find(b)
        if ra!=rb: par[ra]=rb
    for name,M,t in elems:
        for i,s in enumerate(seed):
            img=M(s)
            timg=((torus(img,v1,v2)[0]+t[0])%1.0,(torus(img,v1,v2)[1]+t[1])%1.0)
            # find seed matching timg
            for j in range(n):
                if torus_eq(timg,tp[j]): uni(i,j); break
    grp=defaultdict(list)
    for i in range(n): grp[find(i)].append(i)
    return list(grp.values())

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

def forensic(tid):
    e=G[tid]; T1=cx(e['T1']); T2=cx(e['T2']); v1,v2=reduce2(T1,T2)
    k=kof.get(tid,int(tid[1])); seed=[cx(s) for s in e['Seed']]
    lat=classify(v1,v2); A=abs(cross(v1,v2))
    ang=math.degrees(math.acos(max(-1,min(1,dot(v1,v2)/(abs(v1)*abs(v2))))))
    print(f"\n===== {tid} k={k} |seed|={len(seed)} lat={lat} =====")
    print(f" v1={v1:.4f} |v1|={abs(v1):.4f}  v2={v2:.4f} |v2|={abs(v2):.4f}  angle(v1,v2)={ang:.3f}deg  cellArea={A:.4f}")
    # hidden subperiod check: any nonlattice t with seed+t == seed (mod lattice)?
    tp=[torus(s,v1,v2) for s in seed]
    subper=[]
    for i in range(len(seed)):
        t=((tp[0][0]-tp[i][0])%1,(tp[0][1]-tp[i][1])%1)
        if abs(t[0])<1e-9 and abs(t[1])<1e-9: continue
        Qt=[((x+t[0])%1,(y+t[1])%1) for x,y in tp]
        used=[False]*len(tp); ok=True
        for pt in Qt:
            m=-1
            for idx,pp in enumerate(tp):
                if not used[idx] and torus_eq(pt,pp): m=idx;break
            if m<0: ok=False;break
            used[m]=True
        if ok: subper.append(t)
    print(f" hidden sub-periods (torus translations fixing seed, excl 0): {len(subper)}  {['(%.3f,%.3f)'%s for s in subper[:6]]}")
    elems=sym_group(seed,v1,v2)
    pg=Counter(nm.split('@')[0].split('%')[0] if False else nm for nm,_,_ in elems)
    print(f" symmetry coset elements ({len(elems)}): {[nm for nm,_,_ in elems]}")
    orbs=orbits(seed,v1,v2,elems)
    print(f" #orbits (empirical, exact group action) = {len(orbs)}   (CSV k = {k})  {'MATCH' if len(orbs)==k else 'MISMATCH!'}")
    # mirror/glide axes present?
    refl_axes=[nm for nm,_,_ in elems if nm.startswith('ref')]
    print(f" reflection/glide coset axes: {refl_axes}")
    # symmetry-aligned direction candidates: perp to each mirror axis (=along axis lattice vec)
    # axis angle a -> axis lattice vector; height perp to axis
    aligned_dirs=[]
    for nm,_,_ in elems:
        if nm.startswith('ref'):
            a=math.radians(float(nm.split('@')[1]))
            wv=cmath.exp(1j*a)  # axis direction; find lattice vec along it
            # search small lattice vec parallel
            for p in range(-4,5):
                for q in range(-4,5):
                    if p==0 and q==0: continue
                    lv=p*v1+q*v2
                    if abs(cross(lv,wv))<1e-6*abs(lv):
                        aligned_dirs.append(('axis@%.1f'%math.degrees(a),lv)); break
                else: continue
                break
    # dedup
    seen=set(); ad=[]
    for nm,lv in aligned_dirs:
        key=round(cmath.phase(lv)%math.pi,4)
        if key in seen: continue
        seen.add(key); ad.append((nm,lv))
    print(" --- rows perp to each SYMMETRY axis (the claim's 'symmetry-aligned direction') ---")
    for nm,lv in ad:
        P=period_perp(lv,v1,v2)
        rows=count_distinct_mod([cross(lv,s) for s in seed],P)
        print(f"   {nm}: perp rows={rows}  (2k+2={2*k+2})  {'*** VIOLATION' if rows>2*k+2 else ''}")
    # per-orbit rows in each symmetry-aligned direction
    for nm,lv in ad:
        P=period_perp(lv,v1,v2)
        print(f"   per-orbit row counts along {nm}:")
        bad=[]
        for oi,orb in enumerate(orbs):
            hs=[cross(lv,seed[i]) for i in orb]
            c=count_distinct_mod(hs,P)
            if c>2: bad.append((oi,c,len(orb)))
        if bad:
            for oi,c,sz in bad:
                print(f"      orbit#{oi}: {c} rows (size {sz})  <-- EXCEEDS 2 rows/orbit")
        else:
            print("      all orbits <= 2 rows  (mechanism holds in this direction)")
    # also perp to v1 and v2 for reference
    for nm,lv in [('perp_v1',v1),('perp_v2',v2)]:
        P=period_perp(lv,v1,v2)
        rows=count_distinct_mod([cross(lv,s) for s in seed],P)
        print(f"   ref {nm}: rows={rows}")

for tid in ['t6364','t6646','t5309','t2017']:
    forensic(tid)
