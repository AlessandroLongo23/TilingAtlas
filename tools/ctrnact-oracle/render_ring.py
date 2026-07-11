#!/usr/bin/env python3
"""Ring-general exact development for arbitrary direction count D (out-of-ring star palettes).

render_cells.py hardcodes ZZ[zeta_24] (rank 8, Phi_24 = x^8-x^4+1). This module derives the ring
ZZ[zeta_D] from the palette's D on the fly: rank phi(D), reduction from Phi_D (computed by the
divisor-product recurrence, pure integer arithmetic — no sympy). The multiply-by-zeta formula
newv[0]=top*R[0], newv[i]=v[i-1]+top*R[i] specializes to render_cells.zmul_zeta exactly at D=24
(R=(-1,0,0,0,1,0,0,0)), so the D=24 path is unchanged; D=18 (Phi_18=x^6-x^3+1) and D=20
(Phi_20=x^8-x^6+x^4-x^2+1) now develop exactly too. Everything decisive stays exact; float only for
the Gauss reduction choice and the area check, as in render_cells.

decode/makeglue/read_blocks are ring-independent and imported from render_cells verbatim.
"""
import cmath
import math

from render_cells import decode, read_blocks, load_tables, egcd  # ring-independent helpers


def _polydiv(num, den):
    """Exact integer polynomial division num/den (low-to-high coeff lists); returns quotient."""
    num = num[:]
    q = [0] * (len(num) - len(den) + 1)
    for i in range(len(q) - 1, -1, -1):
        c = num[i + len(den) - 1] // den[-1]
        q[i] = c
        for j in range(len(den)):
            num[i + j] -= c * den[j]
    return q


def cyclotomic(n):
    """Coefficients (low-to-high) of the nth cyclotomic polynomial Phi_n, pure integer."""
    divs = [d for d in range(1, n + 1) if n % d == 0]
    polys = {}
    for m in divs:
        num = [-1] + [0] * (m - 1) + [1]        # x^m - 1
        for d in [d for d in range(1, m) if m % d == 0]:
            num = _polydiv(num, polys[d])
        polys[m] = num
    return polys[n]


class Ring:
    """Exact ZZ[zeta_D] with float evaluation."""
    def __init__(self, D):
        self.D = D
        phi = cyclotomic(D)                       # monic, degree phi(D)
        self.RANK = len(phi) - 1
        self.R = tuple(-a for a in phi[:self.RANK])   # zeta^rank = sum R[i] zeta^i
        self.ZERO = (0,) * self.RANK
        self.ONE = (1,) + (0,) * (self.RANK - 1)
        self.ZK = [self.ONE]
        for _ in range(D - 1):
            self.ZK.append(self.zmul(self.ZK[-1]))
        self._E = [cmath.exp(2j * math.pi * k / D) for k in range(self.RANK)]

    def zmul(self, v):
        top = v[self.RANK - 1]
        R = self.R
        return tuple((v[i - 1] if i > 0 else 0) + top * R[i] for i in range(self.RANK))

    def zadd(self, u, v): return tuple(a + b for a, b in zip(u, v))
    def zsub(self, u, v): return tuple(a - b for a, b in zip(u, v))
    def zscale(self, u, m): return tuple(a * m for a in u)
    def zfloat(self, v): return sum(c * e for c, e in zip(v, self._E))


def gauss_reduce(ring, a, b):
    def dot(u, v):
        x, y = ring.zfloat(u), ring.zfloat(v)
        return x.real * y.real + x.imag * y.imag
    for _ in range(1000):
        if dot(b, b) < dot(a, a):
            a, b = b, a
        da = dot(a, a)
        if da == 0:
            break
        m = round(dot(b, a) / da)
        if m == 0:
            break
        b = ring.zsub(b, ring.zscale(a, m))
    if dot(b, b) < dot(a, a):
        a, b = b, a
    return a, b


def develop(ring, tab, rneig, cls, glue, sign=1):
    D, units = ring.D, tab.CLASS_UNITS

    def star(h0, d0):
        seq, cur, d = [], h0, d0
        for _ in range(4 * D):
            seq.append((cur, d))
            r = rneig[cur]
            d = (d + sign * units[cls[r]]) % D
            cur = r
            if cur == h0 and d == d0:
                return seq
        return None

    placed, periods = {}, []

    def reg(h, d, pos):
        key = h * D + d
        if key in placed:
            if placed[key] != pos:
                periods.append(ring.zsub(pos, placed[key]))
            return False
        placed[key] = pos
        return True

    reg(0, 0, ring.ZERO)
    from collections import deque
    q = deque([(0, 0, ring.ZERO)])
    expanded, guard = set(), 0
    while q:
        guard += 1
        if guard > 400000:
            raise RuntimeError("BFS did not terminate")
        h0, d0, pos = q.popleft()
        if pos in expanded:
            continue
        expanded.add(pos)
        seq = star(h0, d0)
        if seq is None:
            raise RuntimeError("vertex star did not close")
        for h, d in seq:
            reg(h, d, pos)
            g, gd = glue[h], (d + D // 2) % D
            npos = ring.zadd(pos, ring.ZK[d % D])
            if reg(g, gd, npos):
                q.append((g, gd, npos))

    piv, RANK = {}, ring.RANK
    for p0 in periods:
        v = list(p0)
        if not any(v):
            continue
        for col in range(RANK):
            if v[col] == 0:
                continue
            if col in piv:
                b = piv[col]
                g, s, t = egcd(b[col], v[col])
                nb = [s * b[i] + t * v[i] for i in range(RANK)]
                nv = [(b[col] // g) * v[i] - (v[col] // g) * b[i] for i in range(RANK)]
                piv[col] = nb
                v = nv
            else:
                piv[col] = v
                v = [0] * RANK
                break
    basis = [tuple(b) for _, b in sorted(piv.items())]
    if len(basis) != 2:
        raise RuntimeError(f"lattice rank {len(basis)} != 2")
    T1, T2 = gauss_reduce(ring, basis[0], basis[1])
    return placed, T1, T2


def trace_faces(ring, tab, rneig, cls, glue, placed, sign=1):
    D, units = ring.D, tab.CLASS_UNITS
    faces = {}
    for key, pos in placed.items():
        h, d = key // D, key % D
        verts, tiles = [], set()
        cur_h, cur_d, cur_pos = h, d, pos
        for _ in range(64):
            verts.append(cur_pos)
            g = glue[cur_h]
            npos = ring.zadd(cur_pos, ring.ZK[cur_d % D])
            nh = rneig[g]
            corner = cls[nh]
            tiles.add(tab.CLASS_TILE[corner])
            nd = ((cur_d + D // 2) + sign * units[corner]) % D
            cur_h, cur_d, cur_pos = nh, nd, npos
            if cur_h == h and cur_d == d and cur_pos == pos:
                break
        else:
            continue
        fkey = frozenset(verts)
        if fkey not in faces and len(tiles) == 1:
            faces[fkey] = (verts, tiles.pop())
    return list(faces.values())
