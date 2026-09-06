#!/usr/bin/env python3
"""
Theorems 3.2 and 3.4 of the paper, executed.

Closure at a vertex:  prod_n (u_n + i*c_n)^{m_n} = -c^M,   c = cosh(s/2),
c_n = cos(pi/n), u_n = sqrt(c^2 - c_n^2).  The imaginary part, reduced by
u_n^2 = c^2 - c_n^2 and cleared of the u_n by resultants, is a polynomial in
t = c^2.  Two combinations share an edge exactly when those polynomials share
the relevant root: an exact gcd, not a comparison of decimals.

    python3 edge_identity_prover.py        (~4 min)
"""
import sympy as sp
from mpmath import mp, mpf, pi as mppi, asin as mpasin, cos as mpcos, acosh, findroot
mp.dps = 80
x, tt = sp.Symbol('x', positive=True), sp.Symbol('t', positive=True)
cn = lambda n: sp.Integer(1) if n is None else sp.cos(sp.pi / n)

def F_of_t(combo):
    us = {n: sp.Symbol('u_%s' % ('oo' if n is None else n), real=True) for n in combo}
    W = sp.Integer(1)
    for n, m in combo.items():
        W *= (us[n] + sp.I * cn(n)) ** m
    W = sp.expand(W)
    for n, u in us.items():
        red = sp.Integer(0)
        for (d,), co in sp.Poly(W, u).terms():
            q, r = divmod(d, 2)
            red += co * (x ** 2 - cn(n) ** 2) ** q * u ** r
        W = sp.expand(red)
    E = sp.expand(sp.expand(W).as_real_imag()[1])
    for n, u in us.items():
        if E.has(u):
            E = sp.expand(sp.resultant(E, u ** 2 - (x ** 2 - cn(n) ** 2), u))
    E = sp.expand(sp.numer(sp.together(sp.radsimp(E))))
    P = sp.Poly(E, x)
    assert all(d % 2 == 0 for (d,) in P.monoms()), "not even in c"
    return sp.Poly(sum(co * tt ** (d // 2) for (d,), co in P.terms()), tt)

def numeric(combo):
    def f(c):
        s = mpf(0)
        for n, m in combo.items():
            k = mpf(1) if n is None else mpcos(mppi / n)
            if k / c >= 1:
                return mpf(10)
            s += m * 2 * mpasin(k / c)
        return s - 2 * mppi
    c = findroot(f, mpf('1.5'))
    return c, 2 * acosh(c)

CAT = [("0.6196", [{3: 2, 5: 1, None: 1}, {3: 1, 5: 3}]),
       ("1.0612", [{3: 4, 4: 2}, {3: 2, 4: 1, 5: 2}, {3: 1, 4: 1, 10: 1, 20: 1}, {5: 4}]),
       ("1.0986", [{4: 2, 5: 1, None: 1}, {None: 3}]),
       ("1.3424", [{3: 3, None: 2}, {3: 1, 8: 1, 24: 1, None: 1}]),
       ("1.6628", [{3: 4, None: 2}, {3: 2, 12: 2, None: 1}, {12: 4}]),
       ("1.7627", [{4: 6}, {4: 3, None: 2}, {None: 4}])]

for name, combos in CAT:
    polys = []
    for combo in combos:
        lab = ".".join(("oo" if n is None else str(n)) + ("^%d" % m if m > 1 else "")
                       for n, m in sorted(combo.items(), key=lambda kv: (kv[0] is None, kv[0])))
        c, s = numeric(combo)
        P = F_of_t(combo)
        polys.append(P)
        print("%-8s (%-22s) s = %s" % (name, lab, mp.nstr(s, 12)), flush=True)
    g = polys[0]
    for P in polys[1:]:
        g = sp.gcd(g, P)
    deg = sp.Poly(g, tt).degree()
    print("%-8s  gcd degree %d in t -> %s\n" % ("", deg,
          "EXACT IDENTITY PROVEN" if deg > 0 else "NO COMMON ROOT"), flush=True)
