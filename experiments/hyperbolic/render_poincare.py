#!/usr/bin/env python3
"""
Poincare-disk renderer for a regular {p,q} hyperbolic tiling, by the reflection
group: place the central regular p-gon at the correct hyperbolic circumradius
(cosh R = cot(pi/p) cot(pi/q)), then BFS-reflect each polygon across its edge
geodesics (inversion in the orthogonal circle). Demo figures for the {3,8}-length
pool cross-check. See docs/hyperbolic-port-notes-2026-07-12.md.
"""
import math
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, PathPatch
from matplotlib.path import Path

def orthocircle(a, b):
    """Center C, rho^2 of the circle orthogonal to the unit circle through a,b.
    Returns None if the geodesic is a diameter (a,b,0 collinear)."""
    ax, ay = a.real, a.imag
    bx, by = b.real, b.imag
    det = ax * by - ay * bx
    if abs(det) < 1e-12:
        return None
    r1 = (abs(a) ** 2 + 1) / 2
    r2 = (abs(b) ** 2 + 1) / 2
    cx = (r1 * by - r2 * ay) / det
    cy = (ax * r2 - bx * r1) / det
    C = complex(cx, cy)
    return C, abs(C) ** 2 - 1

def reflect(z, a, b):
    """Reflect z across the geodesic through a,b (hyperbolic reflection)."""
    oc = orthocircle(a, b)
    if oc is None:                       # diameter: reflect across line through 0
        d = (b - a) / abs(b - a)
        return d * d * np.conj(z)
    C, rho2 = oc
    return C + rho2 * (z - C) / abs(z - C) ** 2

def geodesic_pts(a, b, n=28):
    oc = orthocircle(a, b)
    if oc is None:
        return [a + (b - a) * t for t in np.linspace(0, 1, n)]
    C, rho2 = oc
    rho = math.sqrt(rho2)
    ta, tb = math.atan2((a - C).imag, (a - C).real), math.atan2((b - C).imag, (b - C).real)
    d = (tb - ta + math.pi) % (2 * math.pi) - math.pi   # short arc
    return [C + rho * complex(math.cos(ta + d * t), math.sin(ta + d * t)) for t in np.linspace(0, 1, n)]

def tiling(p, q, cap=1400, grow_r=0.985, keep_r=0.9995):
    R = math.acosh(1.0 / (math.tan(math.pi / p) * math.tan(math.pi / q)))   # cot*cot
    rv = math.tanh(R / 2)
    V0 = [rv * complex(math.cos(2 * math.pi * k / p), math.sin(2 * math.pi * k / p)) for k in range(p)]
    def key(P):
        c = sum(P) / len(P)
        return (round(c.real, 4), round(c.imag, 4))
    polys, depth, seen, queue = [V0], [0], {key(V0)}, [(V0, 0)]
    while queue and len(polys) < cap:
        P, d = queue.pop(0)
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            Q = [reflect(z, a, b) for z in P]
            if max(abs(z) for z in Q) > keep_r:
                continue
            k = key(Q)
            if k not in seen:
                seen.add(k)
                polys.append(Q); depth.append(d + 1)
                if abs(sum(Q) / len(Q)) < grow_r:
                    queue.append((Q, d + 1))
    return polys, depth, R, rv

def render(p, q, fname, cmap="Blues"):
    polys, depth, R, rv = tiling(p, q)
    dmax = max(depth) or 1
    cm = plt.get_cmap(cmap)
    fig, ax = plt.subplots(figsize=(7, 7))
    ax.add_patch(Circle((0, 0), 1.0, fill=False, lw=1.4, color="#222"))
    for P, d in zip(polys, depth):
        pts = []
        for i in range(len(P)):
            pts += geodesic_pts(P[i], P[(i + 1) % len(P)])
        verts = [(z.real, z.imag) for z in pts] + [(pts[0].real, pts[0].imag)]
        codes = [Path.MOVETO] + [Path.LINETO] * (len(verts) - 2) + [Path.CLOSEPOLY]
        shade = cm(0.25 + 0.6 * (d / dmax))
        ax.add_patch(PathPatch(Path(verts, codes), facecolor=shade, edgecolor="#0b3a52", lw=0.5))
    ax.set_xlim(-1.03, 1.03); ax.set_ylim(-1.03, 1.03); ax.set_aspect("equal"); ax.axis("off")
    ax.set_title(f"{{{p},{q}}}  hyperbolic tiling  ({len(polys)} tiles, shaded by shell)  "
                 f"edge l={2*math.acosh(math.cos(math.pi/p)/math.sin(math.pi/q)):.4f}", fontsize=11)
    fig.savefig(fname, dpi=130, bbox_inches="tight")
    plt.close(fig)
    print(f"{{{p},{q}}}: {len(polys)} tiles, circumradius R={R:.4f}, vertex Euclid radius={rv:.4f} -> {fname}")

if __name__ == "__main__":
    import os
    out = os.path.dirname(os.path.abspath(__file__))
    render(8, 4, os.path.join(out, "tiling_8_4.png"), cmap="Blues")     # octagons, 4/vertex
    render(3, 8, os.path.join(out, "tiling_3_8.png"), cmap="Oranges")   # triangles, 8/vertex
    # sanity: both live at the same edge length (the pool anchor)
    l38 = 2 * math.acosh(math.cos(math.pi / 3) / math.sin(math.pi / 8))
    l84 = 2 * math.acosh(math.cos(math.pi / 8) / math.sin(math.pi / 4))
    print(f"edge lengths: l_{{3,8}}={l38:.9f}  l_{{8,4}}={l84:.9f}  equal={abs(l38-l84)<1e-12}")
