import csv, math, json, re, cmath
from collections import defaultdict
WT='/sessions/jolly-elegant-brahmagupta/mnt/Thesis/thesis/figures/charts/weight-tightness.csv'
GJ='/sessions/jolly-elegant-brahmagupta/mnt/TilingAtlas/figures/data/galebach.json'
# --- empirical stretch wt/len of the reduced generators (the vectors that matter) ---
# need bravais to split round/elongated
txt=open(GJ).read(); txt=txt[txt.index('{'):]; txt=re.sub(r',(\s*[}\]])', r'\1', txt); G=json.loads(txt)
B=[cmath.exp(1j*math.pi/6*j) for j in range(4)]
cx=lambda v: sum(v[j]*B[j] for j in range(4))
dot=lambda a,b:(a.conjugate()*b).real
def reduce2(v1,v2):
    for _ in range(999):
        if dot(v2,v2)<dot(v1,v1): v1,v2=v2,v1
        d1=dot(v1,v1)
        if d1==0:break
        m=round(dot(v1,v2)/d1)
        if m==0:break
        v2=v2-m*v1
    return v1,v2
def isround(e):
    v1,v2=reduce2(cx(e['T1']),cx(e['T2'])); a=dot(v1,v1);b=dot(v2,v2);c=dot(v1,v2)
    eq=lambda x,y:abs(x-y)<=1e-6*max(1.0,abs(x),abs(y))
    return (eq(a,b) and eq(abs(c),min(a,b)/2)) or (eq(a,b) and abs(c)<=1e-6*max(1,a))
rnd=set(t for t,e in G.items() if abs(cx(e['T1']))>1e-9 and abs(cx(e['T2']))>1e-9 and isround(e))

maxstretch_all=0; arg_all=None; maxstretch_rnd=0; arg_rnd=None
maxsl_rnd=0; argsl=None
byk_rnd=defaultdict(float)
with open(WT) as f:
    for r in csv.DictReader(f):
        for wt,ln in ((int(r['wtU']),float(r['lenU'])),(int(r['wtV']),float(r['lenV']))):
            if ln<=0: continue
            s=wt/ln
            if s>maxstretch_all: maxstretch_all=s; arg_all=(r['id'],wt,round(ln,3))
            if r['id'] in rnd and s>maxstretch_rnd: maxstretch_rnd=s; arg_rnd=(r['id'],wt,round(ln,3))
        if r['id'] in rnd:
            ss=int(r['sStar']); l1=min(float(r['lenU']),float(r['lenV'])); k=int(r['k'])
            if l1>0 and ss/l1>maxsl_rnd: maxsl_rnd=ss/l1; argsl=(r['id'],ss,round(l1,3),k)
            byk_rnd[k]=max(byk_rnd[k], ss/l1)
print("EMPIRICAL graph-dilation of the vectors that matter (reduced generators):")
print("  max wt/len over ALL tilings    = %.4f  at %s"%(maxstretch_all,arg_all))
print("  max wt/len over ROUND tilings  = %.4f  at %s"%(maxstretch_rnd,arg_rnd))
print("  max s*/lambda1 over ROUND      = %.4f  at %s"%(maxsl_rnd,argsl))
print("  round s*/lambda1 by k:", {k:round(v,3) for k,v in sorted(byk_rnd.items())})
print()
print("CONSTANT LADDER for  s* <= C_stretch * lambda1,  lambda1 <= C_len*sqrt(k):")
print("  C_len:  provable 5.278 (2sqrt2+sqrt6) | tight 4.732 (needs joint-extremality)")
print("  C_stretch: provable-loose ~50 (ledger E-3 packing+routing) | greedy-target sqrt6+sqrt2=%.3f | true ~%.2f | 2/sqrt3=%.3f (hex, needs quantization)"%(math.sqrt(6)+math.sqrt(2),maxstretch_rnd,2/math.sqrt(3)))
print()
print("k=3 pool budget s*(3) = C_stretch * C_len * sqrt(3) under various pairings:")
for cs_name,cs in [("loose~50",50),("greedy 3.86",math.sqrt(6)+math.sqrt(2)),("true~%.2f"%maxstretch_rnd,maxstretch_rnd),("2/sqrt3",2/math.sqrt(3))]:
    for cl_name,cl in [("prov 5.278",5.278),("tight 4.732",4.732)]:
        print("   C_stretch=%s x C_len=%s -> s*(3) <= %.1f"%(cs_name,cl_name,cs*cl*math.sqrt(3)))
print("  (k=3 feasibility cliff: s(3) ~ 10 comfortable, ~14 borderline, >~20 dead)")
