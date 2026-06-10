/*
 * ST-9 probe — find a FILL-REQUIRING positive star case for `tests/star-fill-positive.test.ts`.
 *
 * Background (work order docs/review-2026-06-09/05-star-and-new-directions.md ST-9): both certified
 * star tilings (4(j), 4(p)) close from their seed fans with ZERO corner-completion, so the C3
 * star-seating fill branch (`PeriodSolver.torusFill`, the `ctx.starTiles` palette loop) has never
 * placed a star that survived into a certified cell. The work order's first idea — seed 4(j) from a
 * STRICT sub-fan — dies upstream by construction: the allowed-VC set is built from the seed polygons
 * incident to each declared vertex (PeriodSolver.solve, `allowed`), so a partial fan names a partial
 * VC, the true closed VC is never allowed, and every branch contradicts at its first vertex closure
 * (part 0 below CONFIRMS this empirically). And for 4(j) specifically, ANY gate-passing seed must
 * contain the full closing fan ⇒ zero fill. So per the work order's fallback ("use the smallest seed
 * that passes the gate but still under-specifies one star; record which") this probe scans the Fig-4
 * VC seeds for certified cells holding MORE stars than the seed fan supplies — such a cell contains
 * at least one star CONSTRUCTED by the C3 palette during fill.
 *
 * Run:  pnpm tsx scripts/probe-star-fill.ts [--limit N] [--maxMs N] [--max-corners N] [--all-star-types] [--hits N] [--vc SUBSTR]
 * Logs synchronously to experiments/results/ (progress + ETA, per CLAUDE.md).
 *
 * ANALYTIC TARGETING (2026-06-10, after the first blind scan found only fan-closing hits): for a
 * Fig-4 k=1 tiling, per-species star count per cell = (point-tokens × V)/n with V = vertex classes
 * per cell, while the fan supplies exactly (point-tokens) star tiles. Dent/corner bookkeeping over
 * the 13 in-ring Fig-4 VCs (TA scoping note) shows the ONLY fill-requiring case is
 * 4(i) `8.3*_{π/12}.8.6*_{5π/12}`: V=6 ⇒ {3 oct, 2× 3*@1, 1× 6*@5} per cell, fan supplies one star
 * of each species ⇒ the C3 palette must CONSTRUCT one 3*@1. All single-star-type VCs have
 * cellStars ≤ fanStars (the first scan's --single-star heuristic excluded 4(i) — cap bias).
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import { enumerateStarVCs, dentRegularFillableVariants, buildStarVCSeed, type StarVC } from '@/classes/algorithm/StarVC';
import { CyclotomicRing, Cyclotomic, setActiveRing } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { ExactStarPolygon } from '@/classes/polygons/ExactStarPolygon';
import { detSurd } from '@/classes/algorithm/exact/Surd';
import type { SeedConfigurationLike } from '@/classes/algorithm/SeedExpander';

const argv = process.argv.slice(2);
const opt = (name: string, def: string): string => {
	const i = argv.indexOf(name);
	return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
};
const limit = parseInt(opt('--limit', '0'), 10);
const maxMs = parseInt(opt('--maxMs', '15000'), 10);
const maxCorners = parseInt(opt('--max-corners', '6'), 10);
const singleStar = !argv.includes('--all-star-types');
const wantHits = parseInt(opt('--hits', '3'), 10);
const vcFilter = opt('--vc', ''); // substring of the canonical VC name — analytic targeting

const sha = execSync('git rev-parse --short HEAD').toString().trim();
mkdirSync('experiments/results', { recursive: true });
const LOG = `experiments/results/st9-fill-probe-${sha}-${new Date().toISOString().slice(0, 10)}.log`;
const log = (s: string): void => { console.log(s); appendFileSync(LOG, s + '\n'); };

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const O = Cyclotomic.ZERO(ring);

log(`=== ST-9 fill-requiring star probe (${new Date().toISOString()}) @ ${sha} ===`);
log(`flags: limit=${limit || '∞'} maxMs=${maxMs} maxCorners=${maxCorners} singleStar=${singleStar} wantHits=${wantHits}`);
log('⚑ PROBE, not a sweep: caps everywhere; results are existence evidence only, no completeness claim.');
log('');

// --- part 0: the work order's strict 4(j) sub-fan — CONFIRM the upstream allowed-VC rejection ---
{
	const oct = RegularPolygon.fromAnchorAndDirExact(8, O, 0); //      covers [0, 9]
	const star = ExactStarPolygon.fourStarPi4(O, 9); //               point covers [9, 12]
	const polygons = [oct, star];
	const seed: SeedConfigurationLike = { polygons, vertexConfigurations: [{ computeSharedVertexExact: () => O, polygons }] };
	const t = Date.now();
	const { cells, diag } = new PeriodSolver(1).solve(seed, { maxMs: 30000 });
	log(`[part 0] strict 4(j) sub-fan {8, 4*p@3}: cells=${cells.length} lattices=${diag.candidateLattices} timedOut=${diag.timedOut} (${Date.now() - t}ms)`);
	log(`         expected 0 — the declared vertex names the PARTIAL VC "4*p@3,8", the closed VC 4*p@3,8,4*p@3,8 is never allowed ⇒ every branch contradicts.`);
	log('');
}

// --- part 1: scan Fig-4 VC seeds for certified cells with MORE stars than the fan supplies ---
let vcs: StarVC[] = enumerateStarVCs({ variants: dentRegularFillableVariants() });
if (vcFilter) vcs = vcs.filter((v) => v.name.includes(vcFilter));
if (singleStar && !vcFilter) {
	vcs = vcs.filter((v) => new Set(v.tokens.filter((t) => t.kind !== 'reg').map((t) => `${t.n}@${(t as { alphaU: number }).alphaU}`)).size === 1);
}
vcs = vcs.filter((v) => v.tokens.length <= maxCorners);
vcs.sort((a, b) => a.tokens.length - b.tokens.length || (a.name < b.name ? -1 : 1));
if (limit > 0) vcs = vcs.slice(0, limit);
log(`[part 1] scanning ${vcs.length} Fig-4 VCs (${vcFilter ? `vc-filter="${vcFilter}" (single-star/corner caps bypassed)` : `single-star=${singleStar}, ≤${maxCorners} corners`}), fill-requiring criterion: cellStars > fanStars`);
if (process.env.POOL_STEPS_UP || process.env.POOL_LMAX_UP) log(`  pool widening active: POOL_STEPS_UP=${process.env.POOL_STEPS_UP ?? '—'} POOL_LMAX_UP=${process.env.POOL_LMAX_UP ?? '—'} (widen-only; superset pool)`);

let hits = 0, solved = 0, timeouts = 0;
const t0 = Date.now();
for (let i = 0; i < vcs.length; i++) {
	const vc = vcs[i];
	const fanStars = vc.tokens.filter((t) => t.kind !== 'reg').length;
	const seed = buildStarVCSeed(vc, ring);
	const ts = Date.now();
	const { cells, diag } = new PeriodSolver(1).solve(seed, { maxMs });
	const ms = Date.now() - ts;
	solved++;
	if (diag.timedOut) timeouts++;
	for (const c of cells) {
		const cellStars = c.cellPolygons.filter((p) => p.isStar).length;
		const comp = c.cellPolygons.map((p) => p.getName()).sort().join(',');
		const det = detSurd(c.basisExact[0], c.basisExact[1]).abs();
		if (cellStars > fanStars) {
			hits++;
			log(`  ★ FILL-REQUIRING HIT [VC ${i + 1}/${vcs.length}] ${vc.name}`);
			log(`      fanStars=${fanStars} cellStars=${cellStars} |detΛ|=${det.toString()}≈${det.toFloat().toFixed(4)} tiles=${c.cellPolygons.length} comp={${comp}} (${ms}ms, timedOut=${diag.timedOut})`);
		} else {
			log(`  hit (fan-closing) [${i + 1}/${vcs.length}] ${vc.name} cellStars=${cellStars} fanStars=${fanStars} comp={${comp}} (${ms}ms)`);
		}
	}
	if ((i + 1) % 10 === 0 || hits >= wantHits) {
		const el = (Date.now() - t0) / 1000;
		const eta = ((el / (i + 1)) * (vcs.length - i - 1)).toFixed(0);
		log(`  …progress ${i + 1}/${vcs.length} (${el.toFixed(0)}s elapsed, ETA ${eta}s, ${hits} fill-hits, ${timeouts} timeouts)`);
	}
	if (hits >= wantHits) { log(`  stopping: ${hits} fill-requiring hits found (--hits ${wantHits})`); break; }
}
log('');
log(`=== DONE: ${hits} fill-requiring hit(s) over ${solved} VCs (${timeouts} timeouts) in ${((Date.now() - t0) / 1000).toFixed(0)}s ===`);
