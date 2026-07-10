import json, re, math, cmath, csv
from collections import defaultdict

GJ='/sessions/jolly-elegant-brahmagupta/mnt/TilingAtlas/figures/data/galebach.json'
WT='/sessions/jolly-elegant-brahmagupta/mnt/Thesis/thesis/figures/charts/weight-tightness.csv'

txt=open(GJ).read(); txt=txt[txt.index('{'):]
txt=re.sub(r',(\s*[}\]])', r'\1', txt)
G=json.loads(txt)

B=[cmath.exp(1j*math.pi/6*j) for j in range(4)]        # basis 1, z, z^2, z^3 ; z=e^{i pi/6}
def cx(v): return sum(v[j]*B[j] for j in range(4))
def dot(a,b): return (a.conjugate()*b).real

def reduce2(v1,v2):
    for _ in range(1000):
        if dot(v2,v2)<dot(v1,v1): v1,v2=v2,v1
        d1=dot(v1,v1)
        if d1==0: break
        m=round(dot(v1,v2)/d1)
        if m==0: break
        v2=v2-m*v1
    return v1,v2

def bravais(T1,T2):
    v1,v2=reduce2(T1,T2)
    a=dot(v1,v1); b=dot(v2,v2); c=dot(v1,v2)
    if a>b: a,b=b,a
    def eq(x,y): return abs(x-y)<=1e-6*max(1.0,abs(x),abs(y))
    la,lb=math.sqrt(min(a,b)),math.sqrt(max(a,b))
    if eq(a,b) and eq(abs(c),a/2): return 'hexagonal',True,la,lb
    if eq(a,b) and abs(c)<=1e-6*max(1.0,a): return 'square',True,la,lb
    if eq(a,b): return 'rhombic',False,la,lb
    if abs(c)<=1e-6*max(1.0,a): return 'rectangular',False,la,lb
    return 'oblique',False,la,lb

ALLGAPS=defaultdict(int)
def polyset(e):
    T1=cx(e['T1']); T2=cx(e['T2']); seed=[cx(v) for v in e['Seed']]
    R=2; buckets=defaultdict(list)
    for s in seed:
        for m in range(-R,R+1):
            for n in range(-R,R+1):
                p=s+m*T1+n*T2
                buckets[(math.floor(p.real),math.floor(p.imag))].append(p)
    polys=set(); mp={60:3,90:4,120:6,150:12,45:8,135:8}
    for v in seed:
        fx,fy=math.floor(v.real),math.floor(v.imag); dirs=[]
        for dx in(-1,0,1):
            for dy in(-1,0,1):
                for p in buckets.get((fx+dx,fy+dy),()):
                    if abs(abs(p-v)-1.0)<1e-6:
                        dirs.append(math.atan2((p-v).imag,(p-v).real))
        degs=sorted(set(round(math.degrees(a)/15)*15 % 360 for a in dirs))
        if len(degs)<2: continue
        n=len(degs)
        for i in range(n):
            g=(degs[(i+1)%n]-degs[i])%360
            ALLGAPS[g]+=1
            if g in mp: polys.add(mp[g])
    return polys

meta={}
with open(WT) as f:
    for row in csv.DictReader(f):
        meta[row['id']]=(row['src'],int(row['k']),int(row['sStar']),float(row['lenU']),float(row['lenV']))

rows=[]; lenmis=0
for tid,e in G.items():
    if tid not in meta: continue
    src,k,ss,lu,lv=meta[tid]
    T1=cx(e['T1']); T2=cx(e['T2']); br,rnd,la,lb=bravais(T1,T2)
    mc,Mc=sorted([lu,lv])
    if abs(la-mc)>1e-4 or abs(lb-Mc)>1e-4: lenmis+=1
    ps=polyset(e); fam=ps.issubset({3,4,6}) and len(ps)>0
    rows.append((tid,src,k,ss,br,rnd,fam,tuple(sorted(ps))))

print("joined tilings:",len(rows)," (galebach:",len(G),", csv:",len(meta),") len-mismatches:",lenmis)
print("\ngap-degree distribution (VALIDATION; expect only {60,90,120,150}):")
for d in sorted(ALLGAPS): print("   %4d : %d"%(d,ALLGAPS[d]))
print("\nBravais distribution:")
bd=defaultdict(int)
for r in rows: bd[r[4]]+=1
for b in sorted(bd): print("   %-11s %d"%(b,bd[b]))
print("\nk=1 VALIDATION (id, bravais, round?, polyset, s*):")
for r in sorted([r for r in rows if r[2]==1]):
    print("   %-6s %-11s round=%-5s poly=%-14s s*=%d"%(r[0],r[4],r[5],str(r[7]),r[3]))
for r in rows:
    if r[0]=='t1003': print("\nt1003 sanity (expect 4.6.12 -> has 12):",r[7]," round=",r[5])

print("\n===== MAIN: ROUND and {3,4,6}  =>  test s* <= 2k+1 =====")
sub=[r for r in rows if r[5] and r[6]]; print("n =",len(sub))
byk=defaultdict(list)
for r in sub: byk[r[2]].append(r)
viol=[]
for k in sorted(byk):
    ss=[r[3] for r in byk[k]]; bnd=2*k+1
    att=[r[0] for r in byk[k] if r[3]==bnd]
    nv=sum(1 for s in ss if s>bnd)
    print("  k=%d: n=%3d  max s*=%2d  2k+1=%2d  violations=%d  attainers=%s"%(k,len(ss),max(ss),bnd,nv,att[:8]))
    viol+=[r for r in byk[k] if r[3]>bnd]
print("TOTAL 2k+1 violations (round & {3,4,6}):",len(viol))
for r in viol: print("   VIOL",r[0],"k=",r[2],"s*=",r[3],"br=",r[4],"poly=",r[7])

print("\n===== CONTRAST: ELONGATED and {3,4,6} (expect can exceed 2k+1; Part-1 bound 2k+2) =====")
sub2=[r for r in rows if (not r[5]) and r[6]]; byk2=defaultdict(list)
for r in sub2: byk2[r[2]].append(r)
for k in sorted(byk2):
    ss=[r[3] for r in byk2[k]]
    print("  k=%d: n=%3d  max s*=%2d  2k+1=%2d  2k+2=%2d  #>2k+1=%d"%(k,len(ss),max(ss),2*k+1,2*k+2,sum(1 for s in ss if s>2*k+1)))

print("\n===== round tilings WITH a 12-gon (excluded from family): max s* per k vs 2k+1 / 2k+3 =====")
sub3=[r for r in rows if r[5] and (12 in r[7])]; byk3=defaultdict(list)
for r in sub3: byk3[r[2]].append(r)
for k in sorted(byk3):
    ss=[r[3] for r in byk3[k]]
    print("  k=%d: n=%3d  max s*=%2d  2k+1=%2d  2k+3=%2d"%(k,len(ss),max(ss),2*k+1,2*k+3))
