#!/usr/bin/env python3
"""The frame census: every free polyform of each size on each heesch-sat grid, with all its frames up
to N tiles a tiling, N the same for every shape of a size (the slice's reach, like a palette's k).

A slice runs at N = 2, 3, ... and stops before the next N would pass the time or frame budget; the
last complete run is kept as experiments/results/frames/<grid><size>.jsonl (frames -detail output, one
line per shape) with its N in <grid><size>.json. Progress goes to experiments/results/<date>-frames-census.log.

--more runs the same census for the regions with three or more tilings that carry a minimal disjoint
pair (frames -tilings 3 ...), into experiments/results/frames-more/, with its own N per slice.

Usage (from tools/frames/): python3 census.py [--more] [--budget 300] [--max-frames 200000] [--only kite,omino]
"""
import argparse, datetime, json, os, pathlib, subprocess, time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
MORE = ['-tilings', '3', '1000000000']
GEN = HERE.parent / 'heesch-sat/src/gen'

# Polyform sizes per grid: from the domino-like 2 up to where a size still has hundreds of shapes.
SIZES = {'omino': range(2, 9), 'iamond': range(2, 10), 'hex': range(2, 7), 'kite': range(2, 9), 'drafter': range(2, 9),
         'abolo': range(2, 9), 'halfcairo': range(2, 8), 'octasquare': range(2, 6), 'trihex': range(2, 7), 'bevelhex': range(2, 6)}
N_CAP = 12
GROWTH_FLOOR = 8  # the least a run grows from one N to the next, for the forecast


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--budget', type=float, default=300, help='seconds one run of a slice may take')
    ap.add_argument('--max-frames', type=int, default=200000)
    ap.add_argument('--threads', type=int, default=os.cpu_count())
    ap.add_argument('--only', default='')
    ap.add_argument('--more', action='store_true', help='regions with three or more tilings, not frames')
    a = ap.parse_args()
    name = 'frames-more' if a.more else 'frames'
    OUT = ROOT / 'experiments/results' / name
    OUT.mkdir(parents=True, exist_ok=True)
    log = open(ROOT / f'experiments/results/{datetime.date.today()}-{name}-census.log', 'a', buffering=1)
    slices = [(g, s) for g, sizes in SIZES.items() if not a.only or g in a.only.split(',') for s in sizes]

    def say(msg):
        line = f'[{datetime.datetime.now():%H:%M:%S}] {msg}'
        print(line, flush=True), log.write(line + '\n')

    say(f'{name} census: {len(slices)} slices, budget {a.budget:.0f}s a run, at most {a.max_frames} frames a slice')
    t0 = time.time()
    for i, (g, s) in enumerate(slices):
        shapes = subprocess.run([str(GEN), f'-{g}', '-size', str(s), '-free'], capture_output=True, text=True, check=True).stdout
        cells = subprocess.run([str(HERE / 'grid_spec'), '-cells'], input=shapes, capture_output=True, text=True, check=True).stdout
        n_shapes = len(cells.splitlines())
        best, last_t, growth = None, 0.0, GROWTH_FLOOR
        for N in range(2, N_CAP + 1):
            if best and last_t * growth > a.budget:
                break
            t = time.time()
            out = subprocess.run(['./frames', g, str(N), '-detail', '-threads', str(a.threads)] + (MORE if a.more else []), input=cells, capture_output=True,
                                 text=True, check=True, cwd=HERE).stdout
            dt = time.time() - t
            frames = sum(len(json.loads(l)['frames']) for l in out.splitlines())
            if best and frames > a.max_frames:
                say(f'  {g}{s} N={N}: {frames} frames, past the frame budget; kept N={best[0]}')
                break
            if last_t > 0.5:
                growth = max(GROWTH_FLOOR, dt / last_t)
            best, last_t = (N, out, frames, dt), dt
            say(f'  {g}{s} ({n_shapes} shapes) N={N}: {frames} frames in {dt:.1f}s')
        N, out, frames, dt = best
        (OUT / f'{g}{s}.jsonl').write_text(out)
        (OUT / f'{g}{s}.json').write_text(json.dumps({'grid': g, 'cells': s, 'N': N, 'shapes': n_shapes, 'frames': frames}))
        done = time.time() - t0
        say(f'slice {i + 1}/{len(slices)} {g}{s}: complete to N={N}, {frames} frames. elapsed {done / 60:.1f} min, '
            f'ETA ~{done / (i + 1) * (len(slices) - i - 1) / 60:.0f} min')
    say(f'census done in {(time.time() - t0) / 60:.1f} min')


if __name__ == '__main__':
    main()
