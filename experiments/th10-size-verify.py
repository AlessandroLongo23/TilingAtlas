import json, re, math, cmath
from collections import defaultdict
from itertools import combinations_with_replacement as cwr
GJ='/sessions/jolly-elegant-brahmagupta/mnt/TilingAtlas/figures/data/galebach.json'
# --- 1. enumerate all valid {3,4,6,12} vertex configs, find max area-charge a-bar ---
ang={3:60,4:90,6:120,12:150}
charge={p:0.25*(1/math.tan(math.pi/p)) for p in (3,4,6,12)}
best=0; bestcfg=None
for n in range(3,7):
    for combo in cwr((3,4,6,12),n):
        if sum(ang[p] for p in combo)==360:
            c=sum(charge[p] for p in combo)
            if c>best: best=c; bestcfg=combo
abar=best
print("a-bar (max vertex area-charge) = %.5f  at config %s"%(abar,bestcfg))
print("   exact 3.12.12 = 1 + 7*sqrt(3)/12 = %.5f"%(1+7*math.sqrt(3)/12))
Cprov=math.sqrt((2/math.sqrt(3))*abar*12)
print("provable constant C = sqrt((2/sqrt3)*a-bar*12) = %.5f   (closed form 2*sqrt2+sqrt6 = %.5f)"%(Cprov, 2*math.sqrt(2)+math.sqrt(6)))
# --- 2. per-tiling checks ---
txt=open(GJ).read(); txt=txt[txt.index('{'):]; txt=re.sub(r',(\s*[}\]])', r'\1', txt); G=json.loads(txt)
B=[cmath.exp(1j*math.pi/6*j) for j in range(4)]
def cx(v): return sum(v[j]*B[j] for j in range(4))
def dot(a,b): return (a.conjugate()*b).real
def reduce2(v1,v2):
    for _ in range(1000):
        if dot(v2,v2)<dot(v1,v1): v1,v2=v2,v1
        d1=dot(v1,v1)
        if d1==0:break
        m=round(dot(v1,v2)/d1)
        if m==0:break
        v2=v2-m*v1
    return v1,v2
# need k per tiling: infer from id prefix tNNN -> first digit block? ids like t1001 => k=1. use leading digit after 't'
import csv
WT='/sessions/jolly-elegant-brahmagupta/mnt/Thesis/thesis/figures/charts/weight-tightness.csv'
kof={}
with open(WT) as f:
    for r in csv.DictReader(f): kof[r['id']]=int(r['k'])
viol_V=viol_area=viol_short=viol_len=0
maxVk=0; maxAvg=0; minDetL=9e9; maxRatio=0; argmax=None; minang=999
n=0
for tid,e in G.items():
    T1=cx(e['T1']); T2=cx(e['T2'])
    if abs(T1)<1e-9 or abs(T2)<1e-9: continue
    if tid not in kof: continue
    k=kof[tid]; Vq=len(e['Seed'])
    v1,v2=reduce2(T1,T2); l1=math.sqrt(min(dot(v1,v1),dot(v2,v2)))
    det=abs((v1.conjugate()*v2).imag)
    ang_deg=math.degrees(math.acos(max(-1,min(1,dot(v1,v2)/(abs(v1)*abs(v2))))))
    n+=1
    if Vq>12*k+1e-9: viol_V+=1
    if det>abar*Vq+1e-6: viol_area+=1
    if det < (math.sqrt(3)/2)*l1*l1 - 1e-6: viol_short+=1
    if l1 > Cprov*math.sqrt(k)+1e-6: viol_len+=1
    maxVk=max(maxVk, Vq/k); maxAvg=max(maxAvg, det/Vq); minDetL=min(minDetL, det/(l1*l1))
    minang=min(minang, ang_deg)
    r=l1/math.sqrt(k)
    if r>maxRatio: maxRatio=r; argmax=(tid,k,l1)
print("\nchecked tilings:",n)
print("LEMMA 1  |V(Q)| <= 12k        : violations=%d   max |V(Q)|/k = %.3f  (<=12)"%(viol_V,maxVk))
print("LEMMA 2  det <= a-bar*|V(Q)|  : violations=%d   max det/|V(Q)| = %.5f  (<= a-bar=%.5f)"%(viol_area,maxAvg,abar))
print("LEMMA 3  det >= (sqrt3/2)l1^2 : violations=%d   min det/l1^2  = %.5f  (>= 0.86603)"%(viol_short,minDetL))
print("   (min reduced-basis angle = %.3f deg, must be >=60)"%minang)
print("RESULT   l1 <= C*sqrt(k)      : violations=%d   max l1/sqrt(k) = %.4f  at %s   (C_prov=%.4f)"%(viol_len,maxRatio,argmax,Cprov))
