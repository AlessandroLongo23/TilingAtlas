/*
 * Probe for the star fill-reach lemma (F5) dent-seating work order
 * (star-fill-dentseating-workorder-2026-06-11). Finds a k=1 dent-at-vertex tiling whose closure
 * REQUIRES a fill-seated dent — i.e. it certifies with `includeDents:true` (the B1 dent loop) but
 * gives 0 cells with `includeDents:false`. That mode-difference IS the work order's mutation check,
 * run programmatically: it isolates the dent loop as the load-bearing change, and the winning VC is
 * the concrete anchor for the positive fill test (gate #4).
 *
 * Dent cells are off-grid (like the 4(i) point-at-vertex case), so run under the widen-only pool env:
 *   NODE_OPTIONS=--max-old-space-size=12288 POOL_STEPS_UP=12 POOL_LMAX_UP=7 \
 *     pnpm tsx scripts/probe-star-dent-fill.ts
 * Env knobs: PROBE_MAXMS (per-seed wall, default 300000), PROBE_LIMIT (default 40 smallest dent VCs),
 *   PROBE_MAXCORNERS (default 4). Smallest-cell-first ordering (corners, then max star n, then name).
 */
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import { enumerateStarVCs, dentRegularFillableVariants, buildStarVCSeed, type StarVC } from '@/classes/algorithm/StarVC';
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);

const maxMs = parseInt(process.env.PROBE_MAXMS ?? '300000', 10);
const limit = parseInt(process.env.PROBE_LIMIT ?? '40', 10);
const maxCorners = parseInt(process.env.PROBE_MAXCORNERS ?? '4', 10);
// Cap the largest tile's edge-count. The loosened (pre-Increment-3) area ladder makes candidateLattices
// scale with the MAX tile area, so a big filler (octagon/12-gon) explodes lat (6389 → timeout) while a
// small-filler dent VC stays at lat ≈ 75–150 and completes in seconds. Restricting to small tiles lets
// the pool REACH (POOL_LMAX_UP) be cranked to capture the off-grid dent cell without the lat blow-up.
const maxN = parseInt(process.env.PROBE_MAXN ?? '6', 10);

const starMaxN = (v: StarVC): number =>
	Math.max(0, ...v.tokens.filter((t) => t.kind !== 'reg').map((t) => t.n));
const fanDentCount = (v: StarVC): number => v.tokens.filter((t) => t.kind === 'dent').length;

let vcs = enumerateStarVCs({ includeDents: true, variants: dentRegularFillableVariants() })
	.filter((v) => v.tokens.some((t) => t.kind === 'dent'))
	.filter((v) => v.tokens.length <= maxCorners)
	.filter((v) => v.tokens.every((t) => t.n <= maxN));
vcs.sort(
	(a, b) =>
		a.tokens.length - b.tokens.length || starMaxN(a) - starMaxN(b) || (a.name < b.name ? -1 : 1),
);
const totalDentVcs = vcs.length;
vcs = vcs.slice(0, limit);

console.log('=== F5 dent-fill probe (dent-loop-required search) ===');
console.log(
	`dent-bearing VCs (≤${maxCorners} corners): ${totalDentVcs}; solving first ${vcs.length}; maxMs=${maxMs}`,
);
console.log(
	`widen: POOL_STEPS_UP=${process.env.POOL_STEPS_UP ?? '(unset)'} POOL_LMAX_UP=${process.env.POOL_LMAX_UP ?? '(unset)'}`,
);

const winners: string[] = [];
const t0 = Date.now();
for (let i = 0; i < vcs.length; i++) {
	const vc = vcs[i];
	const seed = buildStarVCSeed(vc, ring);
	const tag = `[${i + 1}/${vcs.length}] ${vc.name}`;
	const ts = Date.now();
	let dent;
	try {
		dent = new PeriodSolver(1).solve(seed, { maxMs, includeDents: true });
	} catch (e) {
		// candidate-enumeration blow-up (e.g. Set 16M ceiling in gridAlignedCells at a wide pool) — the
		// §24.7 feasibility wall for this seed/pool. Skip, don't kill the run.
		console.log(`  SKIP(enum-blowup: ${(e as Error).message}) ${Date.now() - ts}ms ${tag}`);
		continue;
	}
	const dms = Date.now() - ts;
	if (dent.diag.timedOut) {
		console.log(`  TIMEOUT(dent) ${dms}ms lat=${dent.diag.candidateLattices} ${tag}`);
		continue;
	}
	if (dent.cells.length === 0) {
		console.log(`  0(dent) ${dms}ms lat=${dent.diag.candidateLattices} ${tag}`);
		continue;
	}
	// dent-mode closed → run the mutation check: does point-only fill also close it?
	const ts2 = Date.now();
	let pt;
	try {
		pt = new PeriodSolver(1).solve(seed, { maxMs, includeDents: false });
	} catch (e) {
		console.log(`  HIT(dent only; point-mode enum-blowup: ${(e as Error).message}) ${tag}`);
		continue;
	}
	const pms = Date.now() - ts2;
	const comp = dent.cells
		.map((c) => `{${c.cellPolygons.map((p) => p.getName()).sort().join(',')}}`)
		.join(' ');
	console.log(
		`  HIT dent=${dent.cells.length}(${dms}ms) point=${pt.cells.length}(${pms}ms) ` +
			`capTrunc=${dent.diag.blockIndexCapTruncated} fanDents=${fanDentCount(vc)} ${tag}  ${comp}`,
	);
	if (pt.cells.length === 0 && !pt.diag.timedOut) {
		console.log(
			`  ★★ WINNER (dent loop REQUIRED — point-only fill gives 0): ${vc.name} fanDents=${fanDentCount(vc)} ${comp}`,
		);
		winners.push(vc.name);
		break;
	}
	if ((i + 1) % 10 === 0)
		console.log(`  …progress ${i + 1}/${vcs.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
console.log(
	`\nDONE ${((Date.now() - t0) / 1000).toFixed(1)}s  winners=${winners.length}: ${winners.join(', ') || '—'}`,
);
