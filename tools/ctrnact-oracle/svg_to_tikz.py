#!/usr/bin/env python3
"""Convert render_cells.py SVG output to thesis-styled standalone TikZ.

One-off bridge for the star-extras thesis figure (results ch. 8): parses the flat
<polygon> list of an SVG produced by render_cells.py / render_ring.py, reclassifies
each tile geometrically (convex n-gon vs star), recolors to the thesis figure
palette (figures/style/palette.ts conventions; the tileN values below are the ones
baked into the DELIVERED gallery PDFs, which predate the palette.ts app-hue change),
clips to a centered square window, and emits a standalone .tex in the exact wrapper
figures/build.ts uses for per-tile gallery PDFs (border=1mm, round joins,
line width 0.25mm figEdge).

Usage: svg_to_tikz.py in.svg out.tex [--frac 0.72] [--width-mm 67] [--cx-frac F] [--cy-frac F]
"""
import re
import sys
import math

# Printed-gallery tile tints (from figures/out/batch/*.tex, the palette the delivered
# k1-k3 gallery PDFs actually carry).
TILE_FILL = {3: 'FF9999', 4: 'FFD299', 6: 'DDFF99', 8: 'A4FF99', 12: '99FFDE'}
STAR_BASE_HUE = 280.0  # violet band: distinct from every convex-tile hue above
STAR_APEX_HUE_SPAN = 25.0  # same shift rule as lib/utils/renderTiling.ts starHue()


def hsb_to_hex(h, s, b):
    s /= 100.0
    v = b / 100.0
    c = v * s
    x = c * (1 - abs((h / 60.0) % 2 - 1))
    m = v - c
    r, g, bl = ((c, x, 0) if h < 60 else (x, c, 0) if h < 120 else (0, c, x) if h < 180
                else (0, x, c) if h < 240 else (x, 0, c) if h < 300 else (c, 0, x))
    return ''.join(f'{round((u + m) * 255):02X}' for u in (r, g, bl))


def parse_polys(svg_text):
    polys = []
    for m in re.finditer(r'<polygon points="([^"]+)"', svg_text):
        pts = [tuple(map(float, p.split(','))) for p in m.group(1).split()]
        polys.append(pts)
    return polys


def is_star(pts):
    """A polygon with any reflex vertex (sign change in cross products) is a star."""
    n = len(pts)
    signs = set()
    for i in range(n):
        ax, ay = pts[i]
        bx, by = pts[(i + 1) % n]
        cx, cy = pts[(i + 2) % n]
        cr = (bx - ax) * (cy - by) - (by - ay) * (cx - bx)
        if abs(cr) > 1e-6:
            signs.add(cr > 0)
    return len(signs) > 1


def apex_angle_deg(pts):
    """Interior angle at the tip vertices (local radius maxima from the centroid)."""
    n = len(pts)
    cx = sum(p[0] for p in pts) / n
    cy = sum(p[1] for p in pts) / n
    rad = [math.hypot(p[0] - cx, p[1] - cy) for p in pts]
    angles = []
    for i in range(n):
        if rad[i] >= rad[(i - 1) % n] and rad[i] >= rad[(i + 1) % n]:
            ax, ay = pts[(i - 1) % n]
            bx, by = pts[i]
            dx, dy = pts[(i + 1) % n]
            v1 = (ax - bx, ay - by)
            v2 = (dx - bx, dy - by)
            dot = v1[0] * v2[0] + v1[1] * v2[1]
            no = math.hypot(*v1) * math.hypot(*v2)
            if no > 1e-9:
                angles.append(math.degrees(math.acos(max(-1, min(1, dot / no)))))
    return min(angles) if angles else float('nan')


def star_fill(points, apex):
    shift = max(-STAR_APEX_HUE_SPAN, min(STAR_APEX_HUE_SPAN, (apex - 60.0) * 0.5))
    return hsb_to_hex((STAR_BASE_HUE + shift) % 360, 40, 100)


def point_covered(x, y, polys, bboxes):
    for pts, (bx0, bx1, by0, by1) in zip(polys, bboxes):
        if x < bx0 or x > bx1 or y < by0 or y > by1:
            continue
        inside = False
        n = len(pts)
        j = n - 1
        for i in range(n):
            xi, yi = pts[i]
            xj, yj = pts[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
        if inside:
            return True
    return False


def best_window(polys):
    """Largest square window (side as fraction of bbox min dim) fully covered by tiles."""
    xs = [p[0] for pts in polys for p in pts]
    ys = [p[1] for pts in polys for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    bboxes = [(min(p[0] for p in pts), max(p[0] for p in pts),
               min(p[1] for p in pts), max(p[1] for p in pts)) for pts in polys]
    # coverage mask on a grid; a window qualifies iff every mask sample in it is covered
    N = 120
    dx, dy = (x1 - x0) / N, (y1 - y0) / N
    mask = [[point_covered(x0 + (i + 0.5) * dx, y0 + (j + 0.5) * dy, polys, bboxes)
             for i in range(N)] for j in range(N)]
    md = min(x1 - x0, y1 - y0)
    best = None
    for fr in [x / 200 for x in range(140, 55, -5)]:  # 0.70 down to 0.30
        side = fr * md
        si, sj = int(side / dx), int(side / dy)
        for j in range(0, N - sj):
            for i in range(0, N - si):
                if all(mask[j + b][i + a] for b in range(sj + 1) for a in range(si + 1)
                       if j + b < N and i + a < N):
                    cx = x0 + (i + si / 2 + 0.5) * dx
                    cy = y0 + (j + sj / 2 + 0.5) * dy
                    d_center = abs(cx - (x0 + x1) / 2) + abs(cy - (y0 + y1) / 2)
                    if best is None or fr > best[0] or (fr == best[0] and d_center < best[3]):
                        best = (fr, cx, cy, d_center)
        if best is not None and best[0] == fr:
            break
    if best is None:
        return 0.4, (x0 + x1) / 2, (y0 + y1) / 2
    return best[0], best[1], best[2]


def main():
    args = sys.argv[1:]
    svg_path, tex_path = args[0], args[1]
    width_mm = float(args[args.index('--width-mm') + 1]) if '--width-mm' in args else 67.0

    polys = parse_polys(open(svg_path).read())
    xs = [p[0] for pts in polys for p in pts]
    ys = [p[1] for pts in polys for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)

    if '--auto' in args:
        frac, ccx, ccy = best_window(polys)
        # pull the window in by one mask cell to keep a covered margin at the clip edge
        side = frac * min(x1 - x0, y1 - y0) - 2 * min(x1 - x0, y1 - y0) / 120
    else:
        frac = float(args[args.index('--frac') + 1]) if '--frac' in args else 0.72
        cx_frac = float(args[args.index('--cx-frac') + 1]) if '--cx-frac' in args else 0.5
        cy_frac = float(args[args.index('--cy-frac') + 1]) if '--cy-frac' in args else 0.5
        side = frac * min(x1 - x0, y1 - y0)
        ccx = x0 + cx_frac * (x1 - x0)
        ccy = y0 + cy_frac * (y1 - y0)
    wx0, wx1 = ccx - side / 2, ccx + side / 2
    wy0, wy1 = ccy - side / 2, ccy + side / 2

    scale = width_mm / side  # mm per SVG px, so the clipped window prints at width_mm

    # Collect fills; name colors so the .tex stays readable.
    color_defs, color_names = {}, {}

    def color_of(pts):
        if is_star(pts):
            ap = round(apex_angle_deg(pts) * 2) / 2  # collapse float jitter across congruent stars
            hexv = star_fill(len(pts) // 2, ap)
            name = f'starP{len(pts) // 2}'
        else:
            n = len(pts)
            hexv = TILE_FILL.get(n, 'F4F4F2')
            name = f'tileN{n}'
        # distinct hexes under the same star point count get suffixed
        key = (name, hexv)
        if key not in color_names:
            base = name
            existing = [k for k in color_names if k[0].startswith(base)]
            if any(k[0] == name and k[1] != hexv for k in color_names):
                name = f'{base}v{len(existing)}'
            color_names[key] = name
            color_defs[name] = hexv
        return color_names[key]

    body = []
    for pts in polys:
        # keep only polygons whose bbox meets the window (clip handles the rest)
        if max(p[0] for p in pts) < wx0 or min(p[0] for p in pts) > wx1:
            continue
        if max(p[1] for p in pts) < wy0 or min(p[1] for p in pts) > wy1:
            continue
        col = color_of(pts)
        coords = ' -- '.join(f'({p[0] - ccx:.4f},{ccy - p[1]:.4f})' for p in pts)
        body.append(f'\\path[fill={col},draw=figEdge,line width=0.25mm] {coords} -- cycle;')

    h = side / 2
    lines = [
        '% AUTOGENERATED by tools/ctrnact-oracle/svg_to_tikz.py — do not edit.',
        f'% source: {svg_path.split("/")[-1]}',
        '\\documentclass[border=1mm]{standalone}',
        '\\usepackage{tikz}',
        '\\definecolor{figEdge}{HTML}{2B2B2B}',
    ]
    for name, hexv in sorted(color_defs.items()):
        lines.append(f'\\definecolor{{{name}}}{{HTML}}{{{hexv}}}')
    lines += [
        '\\begin{document}',
        f'\\begin{{tikzpicture}}[x={scale}mm,y={scale}mm,line join=round,line cap=round]',
        f'\\useasboundingbox ({-h:.4f},{-h:.4f}) rectangle ({h:.4f},{h:.4f});',
        f'\\clip ({-h:.4f},{-h:.4f}) rectangle ({h:.4f},{h:.4f});',
        *body,
        '\\end{tikzpicture}',
        '\\end{document}',
        '',
    ]
    open(tex_path, 'w').write('\n'.join(lines))
    stars = sum(1 for pts in polys if is_star(pts))
    print(f'{tex_path}: {len(body)} polys drawn ({stars} stars in source), '
          f'window {side:.0f}px @ {scale:.3f} mm/px, colors: {sorted(color_defs)}')


if __name__ == '__main__':
    main()
