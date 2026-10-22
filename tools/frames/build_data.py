#!/usr/bin/env python3
"""Pack the frame censuses into the /frames page's data files under public/frames/: census.py's
frames (experiments/results/frames/, exactly two tilings) and, merged into the same lists, its regions
with three or more tilings that carry a minimal disjoint pair (census.py --more,
experiments/results/frames-more/). The two runs reach their own N on a slice, and both are stated.

A slice is every free polyform of one size on one grid. Files:
  index.json            the slices: grid, cells, N (the frames' reach) and N3 (the reach of the regions
                        with three or more tilings), shape and region counts, regions by tiles a tiling;
  <slice>.json          its shapes: outline `o` (the /heesch format, so lib/heesch/data.ts draws it),
                        region count, regions by tiles a tiling, and those split by `m` (`byM`); the tile's
                        orientations as solver maps (`or`), so the page can list every tiling of a region;
                        shapes with regions first, most first;
  <slice>-<i>-<k>.json  shape i's regions, FRAME_SHARD a file: n tiles a tiling, hole sizes in cells,
                        overlap pieces [cells shared, pairs], the region's tiling count (`c`, only past
                        two), and its disjoint pair of tilings as cell maps of the tile, six numbers a copy
                        (the /heesch witness format less the corona). For a frame, `m` says how the pair
                        is related (bit 1 reflected, bit 2 rotated, by a symmetry of the region); a
                        region with more tilings is shown as all of them and has m = 0. Within a number
                        of tiles, regions run by `m` in M_ORDER, so hiding the reflected or the rotated
                        pairs, or both, leaves at most two runs of each.
Each tiling is re-audited before it is written: every copy is a cell map of the tile, each tiling
covers the region once, the two share no tile (check_detail.js does the same from the raw output).

Usage: build_data.py
"""
import json
import math
import multiprocessing
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/heesch'))
from build_data import outline  # noqa: E402
from check_witness import GRIDS, Grid  # noqa: E402
sys.path.append(str(ROOT / 'tools/ctrnact-oracle'))
from develop_freedraw import write_json  # noqa: E402

SRC = ROOT / 'experiments/results/frames'
SRC_MORE = ROOT / 'experiments/results/frames-more'
OUT = ROOT / 'public/frames'
M_ORDER = [0, 4, 6, 7, 5]  # symmetry() values, so each choice of hidden kinds is one contiguous run
FRAME_SHARD = 1200  # frames a file: fifty pages of the picker


def audit(pts, frame):
    """Both tilings cover one region once, and share no copy."""
    cover = []
    for maps in frame['t']:
        copies = []
        for i in range(0, len(maps), 6):
            a, b, c, d, e, f = maps[i:i + 6]
            copies.append(tuple(sorted((a * x + b * y + c, d * x + e * y + f) for x, y in zip(pts[::2], pts[1::2]))))
        cells = [p for cp in copies for p in cp]
        if len(cells) != len(set(cells)) or len(copies) != frame['n']:
            return 'a tiling overlaps itself'
        cover.append((set(cells), set(copies)))
    if cover[0][0] != cover[1][0]:
        return 'the tilings cover different regions'
    if cover[0][1] & cover[1][1]:
        return 'the tilings share a tile'
    return None


def tilings_of(pts, frame, orient, period):
    """Every tiling of a region by copies of the tile, each a frozenset of copies (frozensets of solver
    points). A frame's are its pair; past two, an exact cover on the region's cells, always covering
    the lowest uncovered one: a copy covers it with some cell p of some orientation O, which fixes the
    translation, and that must be a lattice step. lib/frames/data.ts allTilings is the same search."""
    cells = list(zip(pts[::2], pts[1::2]))
    copies = lambda maps: frozenset(frozenset(Grid.place(maps[i:i + 6], p) for p in cells) for i in range(0, len(maps), 6))
    if 'c' not in frame:
        return [copies(m) for m in frame['t']]
    region = sorted({q for tile in copies(frame['t'][0]) for q in tile}, key=lambda q: (q[1], q[0]))
    inside = set(region)
    v0x, v0y, v1x, v1y = period
    det = v0x * v1y - v1x * v0y
    images = [[Grid.place(orient[o:o + 6], p) for p in cells] for o in range(0, len(orient), 6)]
    out, covered, placed = [], set(), []

    def go(i):
        while i < len(region) and region[i] in covered:
            i += 1
        if i == len(region):
            return out.append(frozenset(placed))
        qx, qy = region[i]
        for img in images:
            for ox, oy in img:
                dx, dy = qx - ox, qy - oy
                if (dx * v1y - v1x * dy) % det or (v0x * dy - v0y * dx) % det:
                    continue
                tile = frozenset((x + dx, y + dy) for x, y in img)
                if tile <= inside and not tile & covered:
                    covered.update(tile), placed.append(tile)
                    go(i + 1)
                    covered.difference_update(tile), placed.pop()

    go(0)
    if len(out) != frame['c']:
        raise RuntimeError(f'listed {len(out)} tilings of a region the census counts {frame["c"]}')
    return out


def symmetry(grid, tilings):
    """Which kinds of symmetry of the region join all its tilings into one class: bit 1 reflections,
    bit 2 rotations, bit 4 both. The page lists one tiling a class and hides a region with one class
    (lib/frames/data.ts tilingClasses is the same rule). For a frame, bit 1 says the pair are mirror
    images, bit 2 that they are rotated, and bit 4 that either is so."""
    return sum(bit for bit, n in classes(grid, tilings).items() if n == 1)


def classes(grid, tilings):
    """How many classes the tilings fall into, by bit as in symmetry(): two tilings are joined when a
    symmetry of the selected kind maps one onto the other, and joined tilings chain.

    The symmetries are found in page coordinates, on cell centroids. One fixes the region's centroid
    and takes a cell farthest from it to another farthest cell, so trying each farthest cell as the
    image of one of them, as a rotation and as a reflection, tries every candidate."""
    (pa, pb), (pc, pd) = GRIDS[grid.name]['page']
    region = sorted({q for tile in tilings[0] for q in tile})
    page = lambda x, y: (pa * x + pb * y, pc * x + pd * y)
    corners = {p: [page(*v) for v in grid.verts(p)] for p in region}
    cent = {p: (sum(v[0] for v in vs) / len(vs), sum(v[1] for v in vs) / len(vs)) for p, vs in corners.items()}
    key = lambda x, y: (round(x, 6) + 0.0, round(y, 6) + 0.0)
    corner_keys = {p: {key(*v) for v in vs} for p, vs in corners.items()}
    cell_at = {key(*c): p for p, c in cent.items()}
    cx, cy = sum(c[0] for c in cent.values()) / len(cent), sum(c[1] for c in cent.values()) / len(cent)
    dist = {p: math.hypot(c[0] - cx, c[1] - cy) for p, c in cent.items()}
    far = [p for p in region if dist[p] > max(dist.values()) - 1e-7]
    px, py = cent[far[0]][0] - cx, cent[far[0]][1] - cy
    syms = {1: [], 2: []}
    for q in far:
        qx, qy = cent[q][0] - cx, cent[q][1] - cy
        ux, uy = (px + qx, py + qy) if math.hypot(px + qx, py + qy) > 1e-9 else (-py, px)
        n = math.hypot(ux, uy)
        ux, uy = ux / n, uy / n
        th = math.atan2(qy, qx) - math.atan2(py, px)
        maps = [(1, (2 * ux * ux - 1, 2 * ux * uy, 2 * ux * uy, 2 * uy * uy - 1))]
        if q != far[0]:
            maps.append((2, (math.cos(th), -math.sin(th), math.sin(th), math.cos(th))))
        for kind, (a, b, c, e) in maps:
            move = lambda x, y: key(cx + a * (x - cx) + b * (y - cy), cy + c * (x - cx) + e * (y - cy))
            image = {p: cell_at.get(move(*pt)) for p, pt in cent.items()}
            # A symmetry of the cells, not only of their centroids: on some grids (drafters) a reflection
            # takes centroids onto centroids and cells onto other shapes.
            if None not in image.values() and all({move(*v) for v in corners[p]} == corner_keys[q] for p, q in image.items()):
                syms[kind].append(image)
    index = {t: i for i, t in enumerate(tilings)}
    out = {}
    for bit, kinds in ((1, [1]), (2, [2]), (4, [1, 2])):
        parent = list(range(len(tilings)))

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        for g in (g for k in kinds for g in syms[k]):
            for t, i in index.items():
                parent[find(i)] = find(index[frozenset(frozenset(g[p] for p in tile) for tile in t)])
        out[bit] = len({find(i) for i in range(len(tilings))})
    return out


def build(meta_path):
    meta = json.loads(meta_path.read_text())
    sid, grid = meta_path.stem, Grid(meta['grid'])
    load = lambda src: [json.loads(line) for line in (src / f'{sid}.jsonl').read_text().splitlines()]
    rows = {r['tile']: r for r in load(SRC)}
    more_meta = json.loads((SRC_MORE / f'{sid}.json').read_text()) if (SRC_MORE / f'{sid}.json').exists() else None
    more = {r['tile']: r for r in load(SRC_MORE)} if more_meta else {}
    N = max(meta['N'], more_meta['N'] if more_meta else 0)
    period = next((r['period'] for r in more.values()), None)
    shapes = []
    for tile, r in rows.items():
        pts = r['pts']
        regions = r['detail'] + (more[tile]['detail'] if tile in more else [])
        for f in regions:
            err = audit(pts, f)
            if err:
                raise RuntimeError(f'{sid}: {err} in a region of {tile}')
            f['m'] = symmetry(grid, tilings_of(pts, f, more[tile].get('orient') if tile in more else None, period))
        regions.sort(key=lambda f: (f['n'], M_ORDER.index(f['m']), f.get('c', 2), len(f['h']), f['t']))
        by_n, by_m = [0] * (N + 1), [[0] * 8 for _ in range(N + 1)]
        for f in regions:
            by_n[f['n']] += 1
            by_m[f['n']][f['m']] += 1
        shape = {'cells': meta['cells'], 'o': outline(grid, list(zip(pts[::2], pts[1::2]))), 'f': len(regions), 'byN': by_n, 'byM': by_m}
        if tile in more:
            shape['or'] = more[tile]['orient']
        shapes.append((shape, regions))
    shapes.sort(key=lambda s: (-s[0]['f'], s[0]['o']))
    for i, (shape, regions) in enumerate(shapes):
        for k in range(0, len(regions), FRAME_SHARD):
            chunk = [{key: f[key] for key in ('n', 'h', 'p', 'm', 'c', 't') if key in f} for f in regions[k:k + FRAME_SHARD]]
            write_json(OUT / f'{sid}-{i}-{k // FRAME_SHARD}.json.gz', {'frames': chunk}, separators=(',', ':'))
    write_json(OUT / f'{sid}.json.gz', {'grid': meta['grid'], 'period': period, 'shapes': [s for s, _ in shapes]}, separators=(',', ':'))
    by_n = [sum(s['byN'][n] for s, _ in shapes) for n in range(N + 1)]
    by_m = [sum(s['byM'][n][m] for s, _ in shapes for n in range(N + 1)) for m in range(8)]
    mirror, rotated, either = by_m[5] + by_m[7], by_m[6] + by_m[7], sum(by_m[4:])
    total = sum(s['f'] for s, _ in shapes)
    n3 = more_meta['N'] if more_meta else None
    print(f'{sid}: {len(shapes)} shapes, {meta["frames"]} frames to N = {meta["N"]}, {total - meta["frames"]} with more tilings '
          f'to N = {n3}; {mirror} one class by reflections, {rotated} by rotations, {either} by both', flush=True)
    return {'id': sid, 'grid': meta['grid'], 'cells': meta['cells'], 'N': meta['N'], 'N3': n3, 'count': len(shapes),
            'framed': sum(1 for s, _ in shapes if s['f']), 'frames': meta['frames'], 'regions': total, 'mirror': mirror,
            'rotated': rotated, 'either': either, 'byN': by_n, 'shard': FRAME_SHARD}


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    metas = sorted(SRC.glob('*.json'), key=lambda p: (p.stem.rstrip('0123456789'), int(p.stem[len(p.stem.rstrip('0123456789')):])))
    with multiprocessing.Pool(6) as pool:
        sets = pool.map(build, metas, chunksize=1)
    write_json(OUT / 'index.json.gz', {'sets': sets}, separators=(',', ':'))


if __name__ == '__main__':
    main()
