#!/usr/bin/env python3
"""Render pruned star-palette solutions as SVG: exact ZZ[zeta_2D] development + face tracing.

Development runs in the exact ring ZZ[zeta_{2D}] (D=24: rank phi(24)=8 integer vectors,
Phi_24(x) = x^8 - x^4 + 1, so zeta^8 = zeta^4 - 1). Float is used only for Lagrange-Gauss
reduction, window clipping and the SVG viewport, never to snap positions. Faces are traced
by the face walk (next stub = rneig[glue[x]], direction advances by the interior angle at
each corner) and colored by tile.

Usage:
  python3 render_cells.py --pruned run-star-k1/pruned/eupruned_01.txt \
      --tables tables/star24 --out run-star-k1/svg
"""
import argparse
import cmath
import math
import os
import re
import sys
from collections import deque

# ---------------- exact ring ----------------
RANK = 8    # phi(24): ZZ[zeta_24] integer-vector rank
ORDER = 24  # order of the ring's root of unity; ZK holds ZK[m] = zeta_24^m for m in [0, ORDER)

def zmul_zeta(v):
    c = list(v)
    return (-c[7], c[0], c[1], c[2], c[3] + c[7], c[4], c[5], c[6])

ZERO = (0,) * RANK
ONE = (1,) + (0,) * (RANK - 1)

def zadd(u, v): return tuple(a + b for a, b in zip(u, v))
def zsub(u, v): return tuple(a - b for a, b in zip(u, v))
def zscale(u, m): return tuple(a * m for a in u)

ZK = [ONE]
for _ in range(23):
    ZK.append(zmul_zeta(ZK[-1]))

_E = [cmath.exp(1j * math.pi * k / 12) for k in range(RANK)]
def zfloat(v): return sum(c * e for c, e in zip(v, _E))

# ---------------- tables + decode ----------------
def load_tables(path):
    import importlib.util
    spec = importlib.util.spec_from_file_location("tables", os.path.join(path, "tables.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def edgelabel(edge, tile):
    return edge + ("@" + str(tile) if tile > 3 else "'" * tile)

def decipher(tok):
    m = re.match(r"(\*?)(\d+)('*)(?:@(\d+))?$", tok)
    til = len(m.group(3)) if not m.group(4) else int(m.group(4))
    return bool(m.group(1)), int(m.group(2)), til

def makeglue(conway, mirro, label):
    lidx = {l: i for i, l in enumerate(label)}
    glue = [-1] * len(mirro)
    for sym in re.findall(r"[\(\[][^\)\]]*[\)\]]", conway):
        mirror = sym[0] == "["
        toks = sym[1:-1].split(" ")
        if len(toks) == 1:
            toks = [toks[0], toks[0]]
        if mirror:
            toks[1] = "*" + toks[1]
        k = []
        for t in toks:
            mi, num, til = decipher(t.lstrip("*") if t.startswith("**") else t)
            mi = t.startswith("*")
            base = t[1:] if mi else t
            _, num, til = decipher(base)
            st = ("*" if mi else "") + edgelabel(str(num), til)
            k.append(lidx[st])
        glue[k[0]] = k[1]
        glue[k[1]] = k[0]
        glue[mirro[k[0]]] = mirro[k[1]]
        glue[mirro[k[1]]] = mirro[k[0]]
    return glue

def decode(tab, vertypeline, conwayline):
    syms = vertypeline.split(", ")
    idx = {s: i for i, s in enumerate(tab.SYMBOLS)}
    rneig, lneig, mirro, cls, label = [], [], [], [], []
    for j, s in enumerate(syms):
        i = idx[s]
        l = len(rneig)
        rneig += [l + x for x in tab.RNEIG[i]]
        lneig += [l + x for x in tab.LNEIG[i]]
        mirro += [l + x for x in tab.MIRRO[i]]
        cls += tab.CLS[i]
        label += [edgelabel(x, j) for x in tab.LABELS[i]]
    glue = makeglue(conwayline, mirro, label)
    return rneig, lneig, mirro, cls, glue

# ---------------- development (port of develop.py, D-parameterized) ----------------
def develop(tab, rneig, cls, glue, sign=1):
    D = tab.D
    # A direction d is in D-units (360/D degrees). The zeta table ZK is in ORDER-units
    # (zeta_24, 15 degrees), so d must index ZK[STEP*d], STEP = ORDER//D. NO-OP at D=24
    # (STEP=1); the star palette (D=24) is unaffected. Fixes D=12 composites.
    STEP = ORDER // D
    units = tab.CLASS_UNITS
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
                periods.append(zsub(pos, placed[key]))
            return False
        placed[key] = pos
        return True
    reg(0, 0, ZERO)
    q = deque([(0, 0, ZERO)])
    expanded = set()
    guard = 0
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
            npos = zadd(pos, ZK[STEP * d % ORDER])
            if reg(g, gd, npos):
                q.append((g, gd, npos))
    # lattice from periods (integer elimination like develop.py, rank-8 columns)
    piv = {}
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
    T1, T2 = gauss_reduce(basis[0], basis[1])
    return placed, T1, T2

def egcd(a, b):
    old_r, r, old_s, s, old_t, t = a, b, 1, 0, 0, 1
    while r:
        qq = old_r // r
        old_r, r = r, old_r - qq * r
        old_s, s = s, old_s - qq * s
        old_t, t = t, old_t - qq * t
    if old_r < 0:
        old_r, old_s, old_t = -old_r, -old_s, -old_t
    return old_r, old_s, old_t

def gauss_reduce(a, b):
    def dot(u, v):
        x, y = zfloat(u), zfloat(v)
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
        b = zsub(b, zscale(a, m))
    if dot(b, b) < dot(a, a):
        a, b = b, a
    return a, b

# ---------------- face tracing ----------------
def trace_faces(tab, rneig, cls, glue, placed, sign=1):
    """One polygon per developed face instance reachable from the placed frames."""
    D = tab.D
    STEP = ORDER // D  # direction d (D-units) -> ZK[STEP*d] (ORDER-units); NO-OP at D=24
    units = tab.CLASS_UNITS
    faces = {}
    for key, pos in placed.items():
        h, d = key // D, key % D
        # walk the face on the left of directed edge (h, d)
        verts, tiles = [], set()
        cur_h, cur_d, cur_pos = h, d, pos
        for _ in range(64):
            verts.append(cur_pos)
            g = glue[cur_h]
            npos = zadd(cur_pos, ZK[STEP * cur_d % ORDER])
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

# ---------------- svg ----------------
PALETTE = ["#88b0d8", "#e8c268", "#9ecf9e", "#d89898", "#b8a0d0",
           "#7fc4c4", "#e0a070", "#c0c078", "#a0b8e8", "#d0a8c0",
           "#98c8b0", "#c8b898", "#b0d078", "#e89898", "#a8c0d8", "#d8c0a0"]

def render_svg(path, faces, T1, T2, title):
    f1, f2 = zfloat(T1), zfloat(T2)
    shifts = [zadd(zscale(T1, i), zscale(T2, j)) for i in (-1, 0, 1) for j in (-1, 0, 1)]
    polys = []
    for verts, tile in faces:
        for sft in shifts:
            pts = [zfloat(zadd(v, sft)) for v in verts]
            polys.append((pts, tile))
    xs = [p.real for pts, _ in polys for p in pts]
    ys = [p.imag for pts, _ in polys for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    S = 40
    w, h = (x1 - x0) * S + 20, (y1 - y0) * S + 40
    def X(p): return (p.real - x0) * S + 10
    def Y(p): return (y1 - p.imag) * S + 10
    with open(path, "w") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" height="{h:.0f}">\n')
        f.write(f'<rect width="100%" height="100%" fill="white"/>\n')
        for pts, tile in polys:
            d = " ".join(f"{X(p):.2f},{Y(p):.2f}" for p in pts)
            f.write(f'<polygon points="{d}" fill="{PALETTE[tile % len(PALETTE)]}" '
                    f'stroke="#333" stroke-width="1"/>\n')
        f.write(f'<text x="10" y="{h-8:.0f}" font-family="monospace" font-size="12">{title}</text>\n')
        f.write("</svg>\n")

# ---------------- driver ----------------
def read_blocks(path):
    lines = [l.rstrip("\n") for l in open(path)]
    i = 0
    while i < len(lines):
        if lines[i].startswith("("):
            yield lines[i], lines[i + 4]
            i += 5
        else:
            i += 1

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pruned", required=True)
    ap.add_argument("--tables", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--sign", type=int, default=1)
    args = ap.parse_args()
    tab = load_tables(args.tables)
    os.makedirs(args.out, exist_ok=True)
    ok = err = 0
    for n, (vertype, conway) in enumerate(read_blocks(args.pruned), 1):
        try:
            rneig, lneig, mirro, cls, glue = decode(tab, vertype, conway)
            placed, T1, T2 = develop(tab, rneig, cls, glue, args.sign)
            faces = trace_faces(tab, rneig, cls, glue, placed, args.sign)
            safe = re.sub(r"[^A-Za-z0-9*,()]", "_", vertype)[:80]
            render_svg(os.path.join(args.out, f"{n:03d}_{safe}.svg"), faces, T1, T2, vertype)
            ok += 1
        except Exception as e:
            err += 1
            print(f"  ERR #{n} {vertype}: {e}", file=sys.stderr)
    print(f"rendered {ok} tilings, {err} errors -> {args.out}")
    sys.exit(1 if err else 0)

if __name__ == "__main__":
    main()
