import json, re, math, cmath, csv
from collections import defaultdict
GJ='/sessions/jolly-elegant-brahmagupta/mnt/TilingAtlas/figures/data/galebach.json'
WT='/sessions/jolly-elegant-brahmagupta/mnt/Thesis/thesis/figures/charts/weight-tightness.csv'
txt=open(GJ).read(); txt=txt[txt.index('{'):]; txt=re.sub(r',(\s*[}\]])', r'\1', txt); G=json.loads(txt)
B=[cmath.exp(1j*math.pi/6*j) for j in range(4)]
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
    v1,v2=reduce2(T1,T2); a=dot(v1,v1); b=dot(v2,v2); c=dot(v1,v2)
    if a>b: a,b=b,a
    def eq(x,y): return abs(x-y)<=1e-6*max(1.0,abs(x),abs(y))
    if eq(a,b) and eq(abs(c),a/2): return 'hexagonal',True
    if eq(a,b) and abs(c)<=1e-6*max(1.0,a): return 'square',True
    if eq(a,b): return 'rhombic',False
    if abs(c)<=1e-6*max(1.0,a): return 'rectangular',False
    return 'oblique',False
def analyze(e):
    T1=cx(e['T1']); T2=cx(e['T2']); seed=[cx(v) for v in e['Seed']]
    R=3; buckets=defaultdict(list)
    for s in seed:
        for m in range(-R,R+1):
            for n in range(-R,R+1):
                p=s+m*T1+n*T2; buckets[(math.floor(p.real),math.floor(p.imag))].append(p)
    polys=set(); incomplete=False; mp={60:3,90:4,120:6,150:12,45:8,135:8}
    for v in seed:
        fx,fy=math.floor(v.real),math.floor(v.imag); dirs=[]
        for dx in range(-2,3):                       # widened 5x5 window (was 3x3)
            for dy in range(-2,3):
                for p in buckets.get((fx+dx,fy+dy),()):
                    if abs(abs(p-v)-1.0)<1e-6: dirs.append(math.atan2((p-v).imag,(p-v).real))
        degs=sorted(set(round(math.degrees(a)/15)*15 % 360 for a in dirs))
        if len(degs)<2:
            if len(degs)>=1: incomplete=True
            continue
        n=len(degs)
        for i in range(n):
            g=(degs[(i+1)%n]-degs[i])%360
            if g>=180: incomplete=True
            if g in mp: polys.add(mp[g])
    return polys, incomplete
meta={}
with open(WT) as f:
    for row in csv.DictReader(f): meta[row['id']]=(row['src'],int(row['k']),int(row['sStar']))
rows=[]
for tid,e in G.items():
    if tid not in meta: continue
    T1=cx(e['T1']); T2=cx(e['T2'])
    if abs(T1)<1e-9 or abs(T2)<1e-9: continue
    src,k,ss=meta[tid]; br,rnd=bravais(T1,T2); ps,inc=analyze(e)
    fam=ps.issubset({3,4,6}) and len(ps)>0
    rows.append((tid,src,k,ss,br,rnd,fam,tuple(sorted(ps)),inc))
sus=[r for r in rows if r[8]]
print("tilings still with an incomplete star:",len(sus),[r[0] for r in sus][:20])
R346=[r for r in rows if r[5] and r[6]]
rnd_all=[r for r in rows if r[5]]; rnd12=[r for r in rnd_all if 12 in r[7]]
print("round total=%d = {3,4,6}:%d + has12:%d + other:%d"%(len(rnd_all),len(R346),len(rnd12),len(rnd_all)-len(R346)-len(rnd12)))
print("round-&-{3,4,6} incomplete-star count now:",sum(1 for r in R346 if r[8]))
print("\n=== MAIN (fixed detector): ROUND & {3,4,6}  s* <= 2k+1 ===")
byk=defaultdict(list)
for r in R346: byk[r[2]].append(r)
tot=0
for k in sorted(byk):
    ss=[r[3] for r in byk[k]]; bnd=2*k+1; nv=sum(1 for s in ss if s>bnd); tot+=nv
    att=[r[0] for r in byk[k] if r[3]==bnd]
    print("  k=%d: n=%3d  max s*=%2d  2k+1=%2d  viol=%d  attainers=%s"%(k,len(ss),max(ss),bnd,nv,att[:6]))
print("TOTAL violations:",tot)
print("round {3,4,6} max-s* k=1..6:",[max(r[3] for r in byk[k]) for k in sorted(byk)],"vs 2k+1:",[2*k+1 for k in sorted(byk)])
# also: does ANY round {3,4,6} tiling (all k) violate the tighter 2k?  and where is 2k+1 attained
print("attained-at-2k+1 ks:",[k for k in sorted(byk) if any(r[3]==2*k+1 for r in byk[k])])
print("max over ALL round&{3,4,6} of (s* - 2k):",max(r[3]-2*r[2] for r in R346))
