import json, re, math, cmath
from collections import defaultdict
GJ='/sessions/jolly-elegant-brahmagupta/mnt/TilingAtlas/figures/data/galebach.json'
txt=open(GJ).read(); txt=txt[txt.index('{'):]; txt=re.sub(r',(\s*[}\]])', r'\1', txt); G=json.loads(txt)
B=[cmath.exp(1j*math.pi/6*j) for j in range(4)]
cx=lambda v: sum(v[j]*B[j] for j in range(4))
minsep=9e9; maxdeg=0; sep_arg=None; deg_arg=None; checked=0
for tid,e in G.items():
    T1=cx(e['T1']); T2=cx(e['T2'])
    if abs(T1)<1e-9 or abs(T2)<1e-9: continue
    seed=[cx(v) for v in e['Seed']]
    buckets=defaultdict(list)
    for s in seed:
        for m in range(-2,3):
            for n in range(-2,3):
                p=s+m*T1+n*T2; buckets[(math.floor(p.real),math.floor(p.imag))].append(p)
    checked+=1
    for v in seed:
        fx,fy=math.floor(v.real),math.floor(v.imag); deg=0
        for dx in range(-2,3):
            for dy in range(-2,3):
                for p in buckets.get((fx+dx,fy+dy),()):
                    d=abs(p-v)
                    if d>1e-9:
                        if d<minsep: minsep=d; sep_arg=tid
                        if abs(d-1.0)<1e-6: deg+=1
        if deg>maxdeg: maxdeg=deg; deg_arg=tid
print("tilings checked:",checked)
print("MIN vertex separation over catalogue = %.6f  (expect exactly 1.0)  at %s"%(minsep,sep_arg))
print("MAX vertex degree (unit-distance neighbours) = %d  (expect <=6)  at %s"%(maxdeg,deg_arg))
print("covering radius r0 = max tile circumradius = (sqrt6+sqrt2)/2 = %.5f (12-gon)"%((math.sqrt(6)+math.sqrt(2))/2))
print("max interior angle (12-gon) = 150 deg  => forward-edge always within 75 deg of any direction")
