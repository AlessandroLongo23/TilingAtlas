#!/usr/bin/env python3
"""Benchmark the frame search: baseline (baseline.js; on the triangle grid also the original
FrameFinder.html engine) against frames.cpp on 1 and on all threads, on every heesch-sat grid.

Every row checks that all engines return the same frame set. Progress, ETA and results go to
experiments/results/<date>-frames-bench.log as they come, and the summary table to the matching .md.

Usage (from tools/frames/, after building frames, grid_spec and heesch-sat's gen):
    python3 bench.py [--threads 10] [--only iamond,omino]
"""
import argparse, datetime, json, os, pathlib, subprocess, sys, time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
GEN = HERE.parent / 'heesch-sat/src/gen'
ORIGINAL = HERE / 'original-engine.js'  # the <script id="engineSrc"> block of FrameFinder.html, verbatim

P = '0 0 0 0 1 1 1 0 0 1 1 1 0 1 0'               # P pentiamond (FrameFinder preset, as cells)
SPHINX = '0 0 0 0 1 1 1 0 0 1 1 1 2 0 0 0 1 0'    # sphinx hexiamond

# (grid, label, tiles: a cell line or a polyform size for gen, N)
ROWS = [
    ('iamond', 'P pentiamond', P, 6),
    ('iamond', 'P pentiamond', P, 7),
    ('iamond', 'sphinx', SPHINX, 7),
    ('iamond', 'all 12 hexiamonds', 6, 6),
    ('omino', 'all 5 tetrominoes', 4, 6),
    ('omino', 'all 12 pentominoes', 5, 5),
    ('hex', 'all 7 tetrahexes', 4, 5),
    ('kite', 'all 84 hexakites', 6, 8),
    ('kite', 'all 845 octakites', 8, 6),
    ('drafter', 'all 38 hexadrafters', 6, 8),
    ('abolo', 'all 22 hexabolos', 6, 7),
    ('halfcairo', 'all 37 penta-half-Cairos', 5, 8),
    ('octasquare', 'all 21 tetra-octasquares', 4, 5),
    ('trihex', 'all 29 penta-trihexes', 5, 6),
    ('bevelhex', 'all 49 tetra-bevelhexes', 4, 6),
]


def tiles(grid, spec):
    if isinstance(spec, str):
        return spec + '\n'
    shapes = subprocess.run([str(GEN), f'-{grid}', '-size', str(spec), '-free'], capture_output=True, text=True, check=True).stdout
    return subprocess.run([str(HERE / 'grid_spec'), '-cells'], input=shapes, capture_output=True, text=True, check=True).stdout


def run(cmd, inp):
    t = time.time()
    out = subprocess.run(cmd, input=inp, capture_output=True, text=True, check=True, cwd=HERE).stdout
    return [json.loads(l) for l in out.splitlines()], time.time() - t


ORIG_DRIVER = r'''
const E = require(process.argv[1]); const N = +process.argv[2];
const v = require('fs').readFileSync(0, 'utf8').trim().split(/\s+/).map(Number), tile = [];
for (let i = 0; i + 2 < v.length; i += 3) tile.push([v[i], v[i + 1] - v[i + 2], v[i + 2]]);  // (x, y + o, o) back to (x, y, o)
const t0 = Date.now(), s = new E.Searcher(E.normalize(E.dedupe(tile)), N, true); s.runAll();
console.log(JSON.stringify({ frames: s.frames.map(f => f.cells.map(c => [c[0], c[1] + c[2], c[2]])), nodes: s.nodes, secs: (Date.now() - t0) / 1e3 }));
'''


def original(line, N):
    """The unmodified HTML engine, single-threaded; its frames re-keyed in baseline.js's canonical form."""
    t = time.time()
    out = subprocess.run(['node', '-e', ORIG_DRIVER, str(ORIGINAL), str(N)], input=line, capture_output=True, text=True, check=True).stdout
    secs = time.time() - t
    r = json.loads(out)
    keyer = 'const G=require("./baseline.js")(require("./grids.json").iamond,true);' \
            'const F=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(JSON.stringify(F.map(c=>G.keyOf(G.canon(c))).sort()))'
    keys = json.loads(subprocess.run(['node', '-e', keyer], input=json.dumps(r['frames']), capture_output=True, text=True, check=True, cwd=HERE).stdout)
    return keys, r['nodes'], secs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--threads', type=int, default=os.cpu_count())
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    rows = [r for r in ROWS if not a.only or r[0] in a.only.split(',')]
    stamp = datetime.date.today().isoformat()
    out = ROOT / 'experiments/results'
    log = open(out / f'{stamp}-frames-bench.log', 'a', buffering=1)

    def say(msg):
        line = f'[{datetime.datetime.now():%H:%M:%S}] {msg}'
        print(line), log.write(line + '\n')

    say(f'frames benchmark: {len(rows)} rows, frames.cpp on 1 and {a.threads} threads vs baseline.js (1 thread)')
    results, t_start, ratio = [], time.time(), []
    for i, (grid, label, spec, N) in enumerate(rows):
        inp = tiles(grid, spec)
        f1, s1 = run(['./frames', grid, str(N)], inp)
        fT, sT = run(['./frames', grid, str(N), '-threads', str(a.threads)], inp)
        est = s1 * ( sum(ratio) / len(ratio) if ratio else 15 )
        say(f'row {i + 1}/{len(rows)} {grid} {label} N={N}: frames.cpp {s1:.2f}s / {sT:.2f}s; baseline expected ~{est:.0f}s ...')
        bl, sb = run(['node', 'baseline.js', grid, str(N)], inp)
        ratio.append(sb / max(s1, 1e-3))
        same = all(x['frames'] == y['frames'] == z['frames'] for x, y, z in zip(bl, f1, fT))
        row = dict(grid=grid, label=label, N=N, tiles=len(bl), frames=sum(len(x['frames']) for x in bl),
                   base_s=sb, base_nodes=sum(x['nodes'] for x in bl), cpp1_s=s1, cppT_s=sT,
                   cpp_nodes=sum(x['nodes'] for x in f1), same=same)
        if grid == 'iamond' and isinstance(spec, str):
            keys, onodes, so = original(spec, N)
            row.update(orig_s=so, orig_nodes=onodes, orig_same=keys == bl[0]['frames'])
        results.append(row)
        done = time.time() - t_start
        left = done / (i + 1) * (len(rows) - i - 1)
        orig_note = '' if 'orig_same' not in row else ', original engine identical: %s (%.1fs)' % (row['orig_same'], row['orig_s'])
        say(f'    {row["frames"]} frames, identical: {same}{orig_note}; '
            f'baseline {sb:.1f}s -> {sb / s1:.1f}x single-thread, {sb / sT:.0f}x on {a.threads} threads. '
            f'elapsed {done / 60:.1f} min, ETA ~{left / 60:.0f} min')

    md = [f'# Frame search benchmark, {stamp}', '',
          f'Baseline = `baseline.js` (the FrameFinder engine made grid-generic), single thread, Node {subprocess.run(["node", "-v"], capture_output=True, text=True).stdout.strip()}. '
          f'Final = `frames.cpp`, 1 and {a.threads} threads. "Same" = identical canonical frame sets.', '',
          '| grid | tiles | N | frames | same | baseline s | final 1t s | final {}t s | speedup 1t | speedup {}t | nodes base / final |'.format(a.threads, a.threads),
          '|---|---|---|---|---|---|---|---|---|---|---|']
    for r in results:
        md.append(f'| {r["grid"]} | {r["label"]} | {r["N"]} | {r["frames"]} | {"yes" if r["same"] else "NO"} | {r["base_s"]:.1f} | {r["cpp1_s"]:.2f} | {r["cppT_s"]:.2f} | '
                  f'{r["base_s"] / r["cpp1_s"]:.1f}x | {r["base_s"] / r["cppT_s"]:.0f}x | {r["base_nodes"] / max(r["cpp_nodes"], 1):.2f} |')
    orig = [r for r in results if 'orig_s' in r]
    if orig:
        md += ['', 'Original FrameFinder.html engine (unmodified, single thread) on the triangle-grid rows:', '',
               '| tile | N | original s | baseline.js s | final 1t s | same |', '|---|---|---|---|---|---|']
        md += [f'| {r["label"]} | {r["N"]} | {r["orig_s"]:.1f} | {r["base_s"]:.1f} | {r["cpp1_s"]:.2f} | {"yes" if r["orig_same"] else "NO"} |' for r in orig]
    (out / f'{stamp}-frames-bench.md').write_text('\n'.join(md) + '\n')
    (out / f'{stamp}-frames-bench.json').write_text(json.dumps(results, indent=1))
    say(f'done in {(time.time() - t_start) / 60:.1f} min; table in experiments/results/{stamp}-frames-bench.md')


if __name__ == '__main__':
    sys.exit(main())
