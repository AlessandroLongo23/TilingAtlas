#!/usr/bin/env python3
"""
Family-resolved s* over the k=1..8 catalogue (Ctrnact / Galebach reproduction).

Answers: within which POLYGON/VERTEX family does s* climb fastest? In particular,
does the SNUB band (vertices 3.3.4.3.4 or 3.3.3.3.6) ever beat the strip ceiling,
i.e. show a slope > 2? Or does it top out below 2k+4 like everything else?

- s* / wt / gauss_reduce: exact ℤ[ζ₂₄], SAME method as weight-tightness-compute.py.
- k=7,8 s* are REUSED from experiments/results/thesis-figs/weight-tightness-k1-8.csv
  (already computed by weight-tightness-ext.py, keyed by ctrnact id); k=1..6 are
  computed fresh from ctrnact.json T1/T2 (small, s* <= 14).
- classification per tiling:
    is_snub   = any vertexConfig in {[3,3,4,3,4], [3,3,3,3,6]}
    family    = ctrnact 'family' field (polygon set: 3.4, 3.6, 3.4.6, ...)

Out: experiments/results/family-sstar-<date>.csv    (id,k,family,is_snub,nTypes,sStar)
     experiments/results/family-sstar-<date>.summary (max/median s* per (k, class))
     synchronous log with progress + ETA.
"""
import json, os, sys, time, csv, math
from math import gcd
from collections import defaultdict
from datetime import date

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
OUT = os.path.join(ROOT, "experiments", "results")
os.makedirs(OUT, exist_ok=True)
TAG = date.today().isoformat()
LOG = os.path.join(OUT, f"family-sstar-{TAG}.log")
CSVOUT = os.path.join(OUT, f"family-sstar-{TAG}.csv")
SUMOUT = os.path.join(OUT, f"family-sstar-{TAG}.summary")
K78CSV = os.path.join(OUT, "thesis-figs", "weight-tightness-k1-8.csv")

def log(m=""):
    line = f"[{time.strftime('%H:%M:%S')}] {m}"
    print(line, flush=True)
    with open(LOG, "a") as f: f.write(line + "\n")

# ---------- exact Z[zeta_24] (verbatim method) ----------
def zmul_by_zeta(v):
    w = [0] + list(v[:7])
    if v[7]: w[0] -= v[7]; w[4] += v[7]
    return tuple(w)
DIRS = []; _d = (1,0,0,0,0,0,0,0)
for _ in range(24): DIRS.append(_d); _d = zmul_by_zeta(_d)
assert DIRS[12] == (-1,0,0,0,0,0,0,0)
def zadd(a,b): return tuple(x+y for x,y in zip(a,b))
def zsub(a,b): return tuple(x-y for x,y in zip(a,b))
def zscale(a,s): return tuple(s*x for x in a)
ZERO=(0,)*8
EMB=[complex(math.cos(2*math.pi*i/24),math.sin(2*math.pi*i/24)) for i in range(8)]
def emb(v): return sum(c*e for c,e in zip(v,EMB))
def elen(v): return abs(emb(v))
WT={}; EPS=1e-7
def _dfs(v,b,last):
    if v==ZERO: return True
    if b==0: return False
    if elen(v)>b+EPS: return False
    for i in range(last,-1,-1):
        if _dfs(zsub(v,DIRS[i]),b-1,i): return True
    return False
def wt(v):
    if v==ZERO: return 0
    if v in WT: return WT[v]
    b=max(1,int(math.ceil(elen(v)-EPS)))
    while not _dfs(v,b,23):
        b+=1
        if b>400: raise RuntimeError
    WT[v]=b; return b
def gauss(u,v):
    u,v=(u,v) if elen(u)<=elen(v) else (v,u)
    while True:
        eu,ev=emb(u),emb(v)
        mu=round((ev*eu.conjugate()).real/(abs(eu)**2))
        v2=zsub(v,zscale(u,mu))
        if elen(v2)<elen(u)-1e-12: u,v=v2,u
        else: return u,(v2 if elen(v2)<=elen(v) else v)
def s_star(u,v):
    u,v=gauss(u,v)
    wu,wv=wt(u),wt(v)
    s_hi=max(wu,wv)
    eu,ev=emb(u),emb(v); det=(eu.conjugate()*ev).imag
    cand=[]
    amax=int(math.ceil(s_hi*abs(ev)/abs(det)))+1
    bmax=int(math.ceil(s_hi*abs(eu)/abs(det)))+1
    for a in range(-amax,amax+1):
        for b in range(-bmax,bmax+1):
            if (a,b)!=(0,0):
                w=zadd(zscale(u,a),zscale(v,b))
                if elen(w)<=s_hi+EPS: cand.append((elen(w),a,b,w))
    cand.sort()
    for s in range(1,s_hi+1):
        coords=[(a,b) for (L,a,b,w) in cand if L<=s+EPS and wt(w)<=s]
        g=0
        for i in range(len(coords)):
            for j in range(i+1,len(coords)):
                g=gcd(g,abs(coords[i][0]*coords[j][1]-coords[i][1]*coords[j][0]))
                if g==1: break
            if g==1: break
        if g==1: return s
    return s_hi

def to8(t):  # zeta_12 4-vector -> zeta_24 8-vector (even slots)
    return (t[0],0,t[1],0,t[2],0,t[3],0)

SNUB = ([3,3,4,3,4],[3,3,3,3,6])
def is_snub(t): return any(vc in SNUB for vc in (t.get("vertexConfigs") or []))

def load_k78():
    m={}
    if os.path.exists(K78CSV):
        for r in csv.DictReader(open(K78CSV)):
            if r["src"]=="ctrnact": m[r["id"]]=int(r["sStar"])
    return m

def main():
    open(LOG,"a").write(f"\n=== family s* run {time.strftime('%Y-%m-%d %H:%M:%S')} ===\n")
    d=json.load(open(os.path.join(ROOT,"figures","data","ctrnact.json")))
    k78=load_k78()
    log(f"loaded {len(d['tilings'])} ctrnact tilings; reusing {len(k78)} precomputed k=7,8 s* from CSV")
    rows=[]
    t0=time.time(); computed=0; tocompute=sum(1 for t in d['tilings'] if t['k']<=6 and t.get('T1'))
    with open(CSVOUT,"w") as f: f.write("id,k,family,is_snub,nTypes,sStar\n")
    for t in d["tilings"]:
        t1,t2=t.get("T1"),t.get("T2")
        if not t1 or not t2: continue
        k=t["k"]
        if t["id"] in k78:
            s=k78[t["id"]]
        else:
            s=s_star(to8(t1),to8(t2)); computed+=1
            if computed%100==0:
                el=time.time()-t0; eta=el/computed*(tocompute-computed)
                log(f"  computed {computed}/{tocompute} (k<=6)  {el:.0f}s  ETA {eta:.0f}s")
        snub=is_snub(t)
        ntypes=len(set(map(tuple, t.get("vertexConfigs") or [])))
        fam=str(t.get("family"))
        rows.append((t["id"],k,fam,snub,ntypes,s))
        with open(CSVOUT,"a") as f: f.write(f"{t['id']},{k},{fam},{int(snub)},{ntypes},{s}\n")
    log(f"per-tiling s* done: {len(rows)} rows ({computed} freshly computed) in {time.time()-t0:.0f}s -> {CSVOUT}")

    # ---- summary: max s* per k for each class ----
    def maxper(pred):
        m={}
        for (id,k,fam,snub,nt,s) in rows:
            if pred(fam,snub,nt): m[k]=max(m.get(k,0),s)
        return m
    classes={
        "ALL":       lambda f,sn,nt: True,
        "snub":      lambda f,sn,nt: sn,
        "non-snub":  lambda f,sn,nt: not sn,
        "3.4 (tri+sq)":  lambda f,sn,nt: f=="3.4",
        "3.6 (tri+hex)": lambda f,sn,nt: f=="3.6",
        "3.4.6":     lambda f,sn,nt: f=="3.4.6",
        "has-12gon": lambda f,sn,nt: "12" in f,
    }
    lines=["class \\ k    " + "  ".join(f"k{k:>2}" for k in range(1,9)) + "     fit(slope·k+c) vs 2k/2k+4"]
    for name,pred in classes.items():
        m=maxper(pred)
        row=[m.get(k,None) for k in range(1,9)]
        cells="  ".join((f"{v:>3}" if v is not None else "  .") for v in row)
        # crude slope over k=4..8 where present
        pts=[(k,m[k]) for k in range(4,9) if k in m]
        slope=""
        if len(pts)>=2:
            xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
            n=len(pts); sx=sum(xs); sy=sum(ys); sxx=sum(x*x for x in xs); sxy=sum(x*y for x,y in zip(xs,ys))
            a=(n*sxy-sx*sy)/(n*sxx-sx*sx); b=(sy-a*sx)/n
            slope=f"  ~{a:.2f}k{b:+.1f}"
        lines.append(f"{name:<14}{cells}{slope}")
    summary="\n".join(lines)
    log("\n"+summary)
    with open(SUMOUT,"w") as f: f.write(summary+"\n")
    log(f"summary -> {SUMOUT}")

if __name__=="__main__":
    main()
