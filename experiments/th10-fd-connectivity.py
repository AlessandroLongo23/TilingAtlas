import json, re, math, cmath, csv, time, sys
from collections import deque, defaultdict

GJ='/sessions/relaxed-peaceful-davinci/mnt/TilingAtlas/figures/data/galebach.json'
WT='/sessions/relaxed-peaceful-davinci/mnt/Thesis/thesis/figures/charts/weight-tightness.csv'
LOG='/sessions/relaxed-peaceful-davinci/mnt/TilingAtlas/experiments/results/th10-fd-connectivity-2026-07-07.log'

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

def build_and_measure(seed, T1, T2, k):
    v1,v2=reduce2(T1,T2)
    lat=classify(v1,v2)
    l1=abs(v1); l2=abs(v2)
    maxseed=max((abs(s) for s in seed), default=0)
    Rmax=maxseed+max(3*(2*k+3), 25)
    tmin=min(abs(T1),abs(T2))
    A=int(Rmax/tmin)+2
    seen={}; pts=[]
    for a in range(-A,A+1):
        for b in range(-A,A+1):
            off=a*T1+b*T2
            for s in seed:
                p=s+off
                if abs(p)<=Rmax:
                    key=(round(p.real,5),round(p.imag,5))
                    if key not in seen:
                        seen[key]=len(pts); pts.append(p)
    cellmap=defaultdict(list)
    for i,p in enumerate(pts):
        cellmap[(math.floor(p.real),math.floor(p.imag))].append(i)
    adj=[[] for _ in pts]
    for i,p in enumerate(pts):
        ci,cj=math.floor(p.real),math.floor(p.imag)
        for di in(-1,0,1):
            for dj in(-1,0,1):
                for j in cellmap.get((ci+di,cj+dj),()):
                    if j>i and abs(abs(pts[i]-pts[j])-1)<1e-6:
                        adj[i].append(j); adj[j].append(i)
    degs=[len(a) for a in adj if abs(pts[adj.index(a) if False else 0])>=0]  # placeholder
    # degree stats on interior vertices (within Rmax-2)
    intd=[len(adj[i]) for i,p in enumerate(pts) if abs(p)<Rmax-2]
    def idx(z):
        return seen.get((round(z.real,5),round(z.imag,5)))
    def bfs(src,tgt):
        if src is None or tgt is None: return None
        dist={src:0}; q=deque([src])
        while q:
            u=q.popleft()
            if u==tgt: return dist[u]
            du=dist[u]
            for w in adj[u]:
                if w not in dist:
                    dist[w]=du+1; q.append(w)
        return None
    # seed reps live in a=b=0 block
    d1=min((bfs(idx(s), idx(s+v1)) for s in seed if bfs(idx(s),idx(s+v1)) is not None), default=None)
    d2=min((bfs(idx(s), idx(s+v2)) for s in seed if bfs(idx(s),idx(s+v2)) is not None), default=None)
    return lat,l1,l2,d1,d2,(min(intd) if intd else 0, max(intd) if intd else 0), len(pts)

if __name__=='__main__':
    testids=sys.argv[1:] if len(sys.argv)>1 else ['t1003','t2001','t3005','t1006','t4125']
    for tid in testids:
        e=G[tid]; T1=cx(e['T1']); T2=cx(e['T2'])
        if abs(T1)<1e-9 or abs(T2)<1e-9: print(tid,'degenerate'); continue
        k=kof.get(tid,int(tid[1]))
        seed=[cx(s) for s in e['Seed']]
        lat,l1,l2,d1,d2,degrng,npts=build_and_measure(seed,T1,T2,k)
        print(f"{tid} k={k} |V|={len(seed)} lat={lat:11s} l1={l1:.3f} l2={l2:.3f} | edgeDist lam1={d1} lam2={d2} | 2k+3={2*k+3} 2k={2*k} deg={degrng} patch={npts}")
