from fractions import Fraction as F

# Published Grunbaum-Miller-Shephard configs (Wikipedia "Uniform tiling", GMS numbering).
# each face is (n,d); apeirogon encoded as ('inf',None)
INF=('inf',None)
PUB = {
 "1.6  8.4/3.8/5":        [(8,1),(4,3),(8,5)],
 "1.8  4.8/5.8/5":        [(4,1),(8,5),(8,5)],
 "1.12 12.6/5.12/7":      [(12,1),(6,5),(12,7)],
 "1.13 6.4/3.12/7":       [(6,1),(4,3),(12,7)],
 "1.15 3/2.12.6.12":      [(3,2),(12,1),(6,1),(12,1)],
 "1.16 4.12.4/3.12/11":   [(4,1),(12,1),(4,3),(12,11)],
 "1.17 4.3/2.4.6/5":      [(4,1),(3,2),(4,1),(6,5)],
 "1.18 12/5.3.12/5.6/5":  [(12,5),(3,1),(12,5),(6,5)],
 "1.19 12/5.4.12/7.4/3":  [(12,5),(4,1),(12,7),(4,3)],
 "1.22 12/5.12/5.3/2":    [(12,5),(12,5),(3,2)],
 "  -  8/3.8.8/5.8/7":    [(8,3),(8,1),(8,5),(8,7)],
 "  -  12/5.12.12/7.12/11":[(12,5),(12,1),(12,7),(12,11)],
 "2.5  8.8/3.inf":        [(8,1),(8,3),INF],
 "2.6  8.4/3.8.inf":      [(8,1),(4,3),(8,1),INF],
 "2.7  4.8/3.inf.8/3":    [(4,1),(8,3),INF,(8,3)],
 "2.14 4.inf.4/3.inf":    [(4,1),INF,(4,3),INF],
 "2.15 12.12/5.inf":      [(12,1),(12,5),INF],
 "2.16 12.6/5.12.inf":    [(12,1),(6,5),(12,1),INF],
 "2.25 6.inf.6/5.inf":    [(6,1),INF,(6,5),INF],
}
CONVEX11 = {  # sanity: the 11 convex uniform tilings must also pass
 "3^6":[(3,1)]*6, "4^4":[(4,1)]*4, "6^3":[(6,1)]*3,
 "3.12.12":[(3,1),(12,1),(12,1)], "4.8.8":[(4,1),(8,1),(8,1)],
 "3.4.6.4":[(3,1),(4,1),(6,1),(4,1)], "3.6.3.6":[(3,1),(6,1)]*2,
 "3.3.4.3.4":[(3,1)]*2+[(4,1),(3,1),(4,1)], "3.3.3.4.4":[(3,1)]*3+[(4,1)]*2,
 "3.3.3.3.6":[(3,1)]*4+[(6,1)], "4.6.12":[(4,1),(6,1),(12,1)],
}

def ang_signed(f):
    n,d=f
    if n=='inf': return F(180)
    return F(180*(n-2*d), n)
def ang_reflex(f):           # signed, then lifted mod 360 into (0,360)
    a=ang_signed(f)
    return a if a>0 else a+360
def ang_abs(f):
    return abs(ang_signed(f))

CONV = {
  "A signed, sum==360":        (ang_signed, lambda s: s==360),
  "B signed, sum%360==0":      (ang_signed, lambda s: s%360==0),
  "C magnitude, sum==360":     (ang_abs,    lambda s: s==360),
  "D REFLEX-lift, sum%360==0": (ang_reflex, lambda s: s%360==0 and s>0),
}
for name,(f,ok) in CONV.items():
    res=[(k, sum(f(x) for x in v)) for k,v in PUB.items()]
    npass=sum(1 for _,s in res if ok(s))
    res2=[(k, sum(f(x) for x in v)) for k,v in CONVEX11.items()]
    npass2=sum(1 for _,s in res2 if ok(s))
    print(f"{name:28s}  GMS {npass}/{len(PUB)}   convex11 {npass2}/11")
print()
print("=== convention D detail (sum, density delta) ===")
for k,v in list(PUB.items()):
    s=sum(ang_reflex(x) for x in v)
    print(f"  {k:26s} sum={int(s):4d}  delta={s/360}")
for k,v in CONVEX11.items():
    s=sum(ang_reflex(x) for x in v)
    print(f"  {k:26s} sum={int(s):4d}  delta={s/360}")
