import sympy as sp
from mpmath import mp, mpf, pi as mpi, asin as masin, cosh, findroot
mp.dps=60
# r-system condition:  theta_3(r s) = r*theta_3(s) - (r-1)*pi/3
# half-angles:  zeta = (u + i/2)/c ,  zeta_r = (u_r + i/2)/T_r(c)
# hence  zeta^r = w_r * zeta_r   with  w_r = exp(i*(r-1)*pi/6)
c,u,ur = sp.symbols('c u u_r', positive=True)
def exact_poly(r):
    Tr = sp.expand(sp.chebyshevt(r,c))
    w  = sp.exp(sp.I*(r-1)*sp.pi/6)
    lhs = sp.expand((u+sp.I/2)**r * Tr)
    red = 0
    for (d,),co in sp.Poly(lhs,u).terms():
        q,m = divmod(d,2); red += co*(c**2-sp.Rational(1,4))**q * u**m
    E = sp.expand(sp.expand(sp.expand(red) - sp.expand(w*(ur+sp.I/2)*c**r)).as_real_imag()[1])
    E = sp.expand(sp.resultant(E, ur**2-(sp.expand(Tr**2)-sp.Rational(1,4)), ur))
    E = sp.expand(sp.resultant(E, u**2-(c**2-sp.Rational(1,4)), u))
    return sp.Poly(sp.expand(sp.numer(sp.together(sp.radsimp(E)))), c)
def tri(L): return 2*masin(mpf(1)/2/cosh(L/2))
def area(L): return mpi-3*tri(L)
y=sp.Symbol('y')
for r in (2,3,4,7):
    L=findroot(lambda L: area(r*L)/area(L)-r, mpf(1)); ch=cosh(L); cn=cosh(L/2)
    P=exact_poly(r); best=None
    for f,_ in sp.factor_list(P)[1]:
        if abs(complex(sp.N(f.as_expr().subs(c,sp.Float(str(cn),50)),40)))<1e-25:
            if best is None or f.degree()<best.degree(): best=f
    F=sp.Poly(best.as_expr(),c)
    assert all(d%2==0 for (d,) in F.monoms()), "not even in c"
    G=sp.Poly(sp.expand(sum(co*((y+1)/2)**(d//2) for (d,),co in F.terms())*2**(F.degree()//2)), y)
    G=sp.primitive(G)[1]
    root=[s for s in sp.solve(G.as_expr(),y) if abs(complex(sp.N(s,40))-complex(ch))<1e-25]
    print(f"r={r}:  min poly of cosh(s) over Q  =  {sp.factor(G.as_expr())}")
    print(f"        numeric {mp.nstr(ch,22)}    exact: {sp.radsimp(sp.simplify(root[0])) if root else '(no radical form)'}")
