import sympy as sp
from mpmath import mp, mpf, pi, asin, acos, acosh, cos, cosh, sqrt, chebyt, findroot
mp.dps=60
ok=lambda l,c: print(("  PASS  " if c else "  ***FAIL*** ")+l)
phi=(1+sqrt(5))/2; EPS=mpf(10)**-45

print("=== (1) unified parameter: c = cos(pi/n)/sin(theta/2), c<1 spherical, =1 euclidean, >1 hyperbolic ===")
# euclidean check
for n in (3,4,5,6,12):
    th=pi-2*pi/n
    ok(f"  euclidean {n}-gon gives c=1", abs(cos(pi/n)/mp.sin(th/2)-1)<EPS)
# spherical: cube {4,3} edge should be arccos(1/3)... check via c=cos(s/2)
th=2*pi/3; c=cos(pi/4)/mp.sin(th/2); s=2*acos(c)
ok("  cube {4,3}: c<1 and edge = 70.5288 deg", c<1 and abs(s*180/pi-mpf('70.528779365509308'))<mpf('1e-12'))

print("\n=== (2) Marek: Lemma 5.1 should also list {10,5} at 2s ===")
for p,q,mult in [(5,4,1),(5,6,2),(3,10,2),(10,5,2)]:
    c=cos(pi/p)/mp.sin((2*pi/q)/2)          # cosh(edge/2) of {p,q}
    target=cosh(mult*2*acosh(phi/sqrt(2))/2)
    ok(f"  edge of {{{p},{q}}} = {mult}s", abs(c-target)<EPS)
print("  -> three regular tilings share the edge 2s: {5,6}, {3,10}, {10,5}")

print("\n=== (3) Marek's tripling theorem: (3.2n.3.2n) augmented on alternate sides ===")
print("    claim: theta_3(s) + theta_2n(s) = pi  =>  theta_n(3s) = theta_3(s)")
c=sp.Symbol('c',positive=True)
u=1/(2*c)                                   # sin(theta_3/2)
cos_pi_2n=sp.sqrt(1-u**2)*c                 # from sin(theta_2n/2)=cos(theta_3/2)
cos_pi_n=sp.simplify(2*cos_pi_2n**2-1)
T3=sp.expand(sp.chebyshevt(3,c))
ok("  cos(pi/n) = (4c^2-3)/2", sp.simplify(cos_pi_n-(4*c**2-3)/2)==0)
ok("  cos(pi/n)/T_3(c) = 1/(2c) = sin(theta_3/2)  [PROVED for all n, all s]",
   sp.simplify(cos_pi_n/T3-1/(2*c))==0)
# spherical n=2 case: cuboctahedron 3.4.3.4
th3=2*mp.atan(1/sqrt(2)); cc=cos(pi/3)/mp.sin(th3/2)
ok("  spherical n=2 (cuboctahedron 3.4.3.4): c=sqrt(3)/2, edge 60 deg",
   abs(cc-sqrt(3)/2)<EPS and abs(2*acos(cc)*180/pi-60)<EPS)
ok("  and cos(pi/2)=0 = (4c^2-3)/2", abs((4*cc**2-3)/2)<EPS)

print("\n=== (4) the r=2,3,4 systems: polygons, for the table Marek says is missing ===")
def tri(L): return 2*asin(mpf(1)/2/cosh(L/2))
def area(L): return pi-3*tri(L)
def Lr(r): return findroot(lambda L: area(r*L)/area(L)-r, mpf(1))
for r in (2,3,4):
    L=Lr(r); C=cosh(L/2); a=tri(L)
    th=lambda m,k:(lambda cm,ch: None if cm/ch>=1 else 2*asin(cm/ch))(mpf(1) if m is None else cos(pi/m), chebyt(k,C))
    print(f"  r={r}  cosh s = {mp.nstr(cosh(L),18)}")
    for k in range(1,8):
        for m in list(range(3,61))+[None]:
            t=th(m,k)
            if t is None: continue
            rel=mp.pslq([pi,a,t],tol=mpf(10)**-50,maxcoeff=10**5,maxsteps=10**5)
            if rel and rel[-1]!=0:
                from fractions import Fraction as F
                p,q,cc2=rel; e=lambda x:F(int(-x),int(cc2))
                lbl="ABCDEFG"[k-1]+("oo" if m is None else str(m))
                print(f"      {lbl:5s} edge {k}s  theta = {e(p)}*pi + {e(q)}*A3   = {mp.nstr(t*180/pi,12)} deg")
