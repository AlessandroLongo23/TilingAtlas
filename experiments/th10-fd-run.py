import json, re, math, cmath, csv, time
from collections import deque, defaultdict
import importlib.util
spec=importlib.util.spec_from_file_location("m","experiments/th10-fd-connectivity.py")
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
G=m.G; kof=m.kof; cx=m.cx
LOG='experiments/results/th10-fd-connectivity-2026-07-07.log'
def log(s):
    print(s)
    open(LOG,'a').write(s+'\n')
open(LOG,'w').write('')  # reset
log("# TH-10 FD-connectivity / edge-walk experiment  "+time.strftime('%Y-%m-%d %H:%M'))
log("# For each tiling: build tiling graph (unit-distance edges), measure shortest EDGE-walk realizing lambda1, lambda2 (min over vertex reps).")
log("# Round = square/hex lattice. Test: edge-dist <= 2k+3 (round) / long-axis ~ 2k+2 (elongated); stretch = edge-dist/|lambda|.\n")
ids=[t for t in G if abs(cx(G[t]['T1']))>1e-9 and abs(cx(G[t]['T2']))>1e-9 and t in kof]
N=len(ids); t0=time.time()
agg=defaultdict(lambda:{'n':0,'over2k3':0,'maxratio':0,'maxratio_id':'','stretch':[]})
rows=[]
for i,tid in enumerate(ids):
    e=G[tid]; T1=cx(e['T1']); T2=cx(e['T2']); k=kof[tid]; seed=[cx(s) for s in e['Seed']]
    try:
        lat,l1,l2,d1,d2,deg,npts=m.build_and_measure(seed,T1,T2,k)
    except Exception as ex:
        log(f"  ERR {tid}: {ex}"); continue
    fam='ROUND' if '(R)' in lat else 'ELONG'
    # long-axis edge-dist (the binding one): for round both equal; for elong it's d2 (lam2)
    long_d = max([x for x in (d1,d2) if x is not None], default=None)
    a=agg[fam]; a['n']+=1
    if long_d is not None:
        if long_d>2*k+3: a['over2k3']+=1
        r=long_d/(2*k+3); 
        if r>a['maxratio']: a['maxratio']=r; a['maxratio_id']=tid
        if l2>1e-9 and d2: a['stretch'].append(d2/l2)
    rows.append((tid,k,fam,lat,l1,l2,d1,d2,2*k+3))
    if (i+1)%150==0 or i+1==N:
        el=time.time()-t0; eta=el/(i+1)*(N-i-1)
        log(f"[{i+1}/{N}] {el:.0f}s elapsed, ETA {eta:.0f}s | ROUND n={agg['ROUND']['n']} over2k+3={agg['ROUND']['over2k3']} | ELONG n={agg['ELONG']['n']} over2k+3={agg['ELONG']['over2k3']}")
log("\n=== per-family summary ===")
for fam in ('ROUND','ELONG'):
    a=agg[fam]; st=a['stretch']
    log(f"{fam}: n={a['n']}  edge-dist>2k+3: {a['over2k3']}  max(edge-dist/(2k+3))={a['maxratio']:.3f} at {a['maxratio_id']}  "
        f"stretch(edge/|lam|) med={sorted(st)[len(st)//2]:.3f} max={max(st):.3f}" if st else f"{fam}: n={a['n']}")
# list the overshoots and per-k round maxima
log("\n=== round tilings where edge-dist(long) > 2k+3 (pure-edge exceeds the weight bound) ===")
for tid,k,fam,lat,l1,l2,d1,d2,b in rows:
    if fam=='ROUND':
        ld=max([x for x in (d1,d2) if x is not None],default=0)
        if ld>b: log(f"  {tid} k={k} {lat} edge(lam1,lam2)=({d1},{d2}) 2k+3={b}  [uses non-edge center shortcut for tight wt]")
# per-k round: max edge-dist and max stretch
log("\n=== ROUND per-k: max edge-dist(lambda), max stretch, vs 2k+3 ===")
byk=defaultdict(list)
for tid,k,fam,lat,l1,l2,d1,d2,b in rows:
    if fam=='ROUND':
        ld=max([x for x in (d1,d2) if x is not None],default=0)
        s=(d2/l2) if (l2>1e-9 and d2) else 0
        byk[k].append((ld,s,tid))
for k in sorted(byk):
    v=byk[k]; md=max(x[0] for x in v); ms=max(x[1] for x in v)
    log(f"  k={k}: n={len(v)} max edge-dist={md} (2k+3={2*k+3}) max stretch={ms:.3f}")
log("\nDONE")
