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

def refl_map(w):  # reflection across line through 0 along lattice vector w
    e2=w/ w.conjugate()
    return lambda z,e2=e2: e2*z.conjugate()

def find_coset(seed,v1,v2,M):
    tp=[torus(s,v1,v2) for s in seed]
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

def analyze(tid, axis_pqs):
    e=G[tid]; v1,v2=reduce2(cx(e['T1']),cx(e['T2']))
    k=kof.get(tid,int(tid[1])); seed=[cx(s) for s in e['Seed']]
    print(f"\n##### {tid} k={k} |seed|={len(seed)}  v1={v1:.3f}(ang {math.degrees(cmath.phase(v1))%180:.1f}) v2={v2:.3f}(ang {math.degrees(cmath.phase(v2))%180:.1f})")
    # test 180 rotation
    M180=lambda z:-z
    t180=find_coset(seed,v1,v2,M180)
    print(f"  rot180 coset t={t180}")
    for (p,q) in axis_pqs:
        w=p*v1+q*v2
        M=refl_map(w)
        if not (in_lat(M(v1),v1,v2) and in_lat(M(v2),v1,v2)):
            print(f"  refl axis ({p},{q}) ang{math.degrees(cmath.phase(w))%180:.1f}: lattice NOT preserved"); continue
        t=find_coset(seed,v1,v2,M)
        # glide component: translation along axis (parallel) vs perp
        if t is not None:
            tvec=t[0]*v1+t[1]*v2
            par=dot(tvec,w)/abs(w)      # component along axis
            per=cross(w,tvec)/abs(w)    # component perp to axis
            kind='PURE MIRROR' if abs(par-round(par*0+par))<9e9 and abs(par)<1e-6 else ('GLIDE(par=%.3f)'%par)
            kind='PURE MIRROR' if abs(par)<1e-4 else 'GLIDE'
            print(f"  refl axis({p},{q}) ang{math.degrees(cmath.phase(w))%180:.1f}: t={('(%.3f,%.3f)'%t)}  along-axis={par:.4f} perp-axis={per:.4f}  -> {kind}")
        else:
            print(f"  refl axis({p},{q}) ang{math.degrees(cmath.phase(w))%180:.1f}: NO coset (not a symmetry)")

# t6364: mirrors along v1(75),v2(165). height perp to v1 = along v2. Show orbit heights.
analyze('t6364', [(1,0),(0,1),(1,1),(1,-1)])
analyze('t2017', [(1,0),(0,1),(1,1),(1,-1),(2,1),(1,2)])
analyze('t6646', [(1,0),(0,1),(1,1),(1,-1)])

# ---- explicit orbit heights for t6364 along perp-v1 (=along v2 dir) ----
print("\n----- t6364 explicit: heights perp to v1, per detected element action -----")
e=G['t6364']; v1,v2=reduce2(cx(e['T1']),cx(e['T2'])); seed=[cx(s) for s in e['Seed']]
A=abs(cross(v1,v2)); Pv1=A  # period perp to v1
def hperp_v1(z): return cross(v1,z)%A
# build group: rot180 + ref along v1 + ref along v2 (with their cosets), generate orbit of seed[0]
def refl_map2(w):
    e2=w/w.conjugate(); return lambda z:e2*z.conjugate()
gens=[]
for M,lbl in [((lambda z:-z),'R180'),(refl_map2(v1),'Mv1'),(refl_map2(v2),'Mv2')]:
    t=find_coset(seed,v1,v2,M)
    if t: gens.append((lbl,M,t))
print("  generators found:",[g[0] for g in gens],"cosets:",[('%s t=(%.3f,%.3f)'%(g[0],g[2][0],g[2][1])) for g in gens])
# orbit of vertex 0 under the group (compose gens, close under group)
tp=[torus(s,v1,v2) for s in seed]
def apply(M,t,i):
    img=M(seed[i]); tt=torus(img,v1,v2); tt=((tt[0]+t[0])%1,(tt[1]+t[1])%1)
    for j in range(len(seed)):
        if teq(tt,tp[j]): return j
    return None
# BFS orbit
for start in [0,1]:
    orb={start}; frontier=[start]
    while frontier:
        i=frontier.pop()
        for lbl,M,t in gens:
            j=apply(M,t,i)
            if j is not None and j not in orb: orb.add(j); frontier.append(j)
    hs=sorted(set(round(hperp_v1(seed[i]),4) for i in orb))
    print(f"  orbit of seed[{start}] = vertices {sorted(orb)}  ; distinct heights(perp v1) = {len(hs)} : {hs}   period={A:.3f}")
