import sys; sys.path.insert(0,'.')
from hyp import ball
from hypsq import square
from fractions import Fraction as Fr

def squares_of(nv, faces, sink, exact):
    V, psi, of, I, H, disc, adj = square(nv, faces, 0, sink, exact=exact)
    left = {}
    for fi, f in enumerate(of):
        for i in range(len(f)):
            left[(f[i], f[(i+1) % len(f)])] = fi
    out, seen = [], set()
    for f in of:
        for i in range(len(f)):
            a, b = f[i], f[(i+1) % len(f)]
            k = (min(a,b), max(a,b))
            if k in seen: continue
            seen.add(k)
            hi, lo = (a, b) if V[a] > V[b] else (b, a)
            s = V[hi] - V[lo]
            if s == 0: continue
            x0 = psi[left[(hi, lo)]]
            out.append((x0 % I, V[lo], s, (hi, lo)))
    return out, I, H, V

def verify(sq, I, H):
    area = sum(s*s for _, _, s, _ in sq)
    clash = 0
    for i, (x1, y1, s1, _) in enumerate(sq):
        for j, (x2, y2, s2, _) in enumerate(sq):
            if i >= j: continue
            if not (y1 + s1 <= y2 or y2 + s2 <= y1):
                for sh in (-I, 0, I):
                    X = x2 + sh
                    if X < x1 + s1 and x1 < X + s2: clash += 1
    return area, clash

for r in (1, 2, 3):
    nv, faces, sink, bnd = ball(7, r)
    sq, I, H, V = squares_of(nv, faces, sink, exact=True)
    area, clash = verify(sq, I, H)
    print(f"r={r}: {len(sq):4d} squares · area {area} vs I*H {I*H} "
          f"{'MATCH' if area == I*H else 'MISMATCH'} · overlaps mod I: {clash}")

# --- picture -------------------------------------------------------------------
nv, faces, sink, bnd = ball(7, 5)
sq, I, H, V = squares_of(nv, faces, sink, exact=False)
W, Hp, PAD = 1500, 900, 20
sx = (W - 2*PAD)/I; sy = (Hp - 2*PAD)/H
parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{Hp}" viewBox="0 0 {W} {Hp}">',
         f'<rect width="{W}" height="{Hp}" fill="#0d0f13"/>']
mx = max(s for _,_,s,_ in sq)
for x, y, s, e in sq:
    for shift in (-I, 0, I):
        X = PAD + (x+shift)*sx; Y = PAD + (H - y - s)*sy; Wd = s*sx; Ht = s*sy
        if X + Wd < 0 or X > W: continue
        t = (s/mx)**0.35
        col = f"hsl({int(210 - 190*t)},{int(45+40*t)}%,{int(28+40*t)}%)"
        parts.append(f'<rect x="{X:.2f}" y="{Y:.2f}" width="{Wd:.2f}" height="{Ht:.2f}" '
                     f'fill="{col}" stroke="#0d0f13" stroke-width="0.6"/>')
parts.append(f'<text x="{PAD}" y="{Hp-6}" fill="#8892a0" font-family="monospace" font-size="15">'
             f'{{3,7}} ball, radius 5 — {len(sq)} squares — cylinder circumference I={I:.4f}, height H={H:.1f}'
             f' — left and right edges are glued</text>')
parts.append('</svg>')
open('/tmp/hyp-cylinder.svg','w').write("\n".join(parts))
print(f"\nwrote /tmp/hyp-cylinder.svg — {len(sq)} squares, I={I:.6f}")
