import sympy as sp, functools
from mpmath import mp, mpf, pi as mppi, asin as mpasin, cos as mpcos, acosh, findroot
print = functools.partial(print, flush=True)
mp.dps=80
x,tt = sp.Symbol('x',positive=True), sp.Symbol('t',positive=True)
cn = lambda n: sp.Integer(1) if n is None else sp.cos(sp.pi/n)
def F_of_t(combo):
    us={n:sp.Symbol('u_%s'%('oo' if n is None else n),real=True) for n in combo}
    W=sp.Integer(1)
    for n,m in combo.items(): W*=(us[n]+sp.I*cn(n))**m
    W=sp.expand(W)
    for n,u in us.items():
        red=sp.Integer(0)
        for (d,),co in sp.Poly(W,u).terms():
            q,r=divmod(d,2); red+=co*(x**2-cn(n)**2)**q*u**r
        W=sp.expand(red)
    E=sp.expand(sp.expand(W).as_real_imag()[1])
    for n,u in us.items():
        if E.has(u): E=sp.expand(sp.resultant(E,u**2-(x**2-cn(n)**2),u))
    E=sp.expand(sp.numer(sp.together(sp.radsimp(E))))
    P=sp.Poly(E,x); assert all(d%2==0 for (d,) in P.monoms())
    return sp.Poly(sum(co*tt**(d//2) for (d,),co in P.terms()),tt)
def numeric(combo):
    def f(c):
        s=mpf(0)
        for n,m in combo.items():
            k=mpf(1) if n is None else mpcos(mppi/n)
            if k/c>=1: return mpf(10)
            s+=m*2*mpasin(k/c)
        return s-2*mppi
    c=findroot(f,mpf('1.5')); return c,2*acosh(c)
for name,combos in [("1.1555 pentagons+dodecagons",[{3:1,5:1,12:2},{4:1,5:2,12:1}]),
                    ("1.2537 {4,5} with 10- and 30-gons",[{4:5},{4:2,10:1,30:1}])]:
    print("\n=== %s ==="%name); polys=[]
    for combo in combos:
        lab=".".join(("oo" if n is None else str(n))+("^%d"%m if m>1 else "") for n,m in sorted(combo.items(),key=lambda kv:(kv[0] is None,kv[0])))
        c,s=numeric(combo); print("  (%-14s) s = %s"%(lab,mp.nstr(s,14)))
        polys.append(F_of_t(combo)); print("     polynomial degree %d in t"%polys[-1].degree())
    g=polys[0]
    for P in polys[1:]: g=sp.gcd(g,P)
    d=sp.Poly(g,tt).degree()
    print("  gcd degree %d -> %s"%(d,"EXACT IDENTITY PROVEN" if d>0 else "NO COMMON ROOT"))
    c,_=numeric(combos[0]); yy=sp.Symbol('y')
    from mpmath import findpoly
    q=None
    for dd in range(1,13):
        q=findpoly(2*c**2-1,dd,maxcoeff=10**8,tol=mpf(10)**-55)
        if q: break
    if q: print("  min poly of cosh(s):", sp.factor(sum(int(a)*yy**(len(q)-1-i) for i,a in enumerate(q))))
