/*
 * THROWAWAY — dump exact star cell period bases for the weight-slope test (TA work order 2026-07-07).
 *
 * TA needs exact period bases of star cells in the SAME ℤ[ζ₂₄] codec `figures/data/catalogue-k1-3.json`
 * uses (`Cyclotomic.encode()` → {n:[8 decimal strings], d:"1"}), so TA's own s* measurement
 * (`weight-tightness-compute.py`, not in this repo) consumes them unchanged. Output:
 * `experiments/star-oracle/star-cells-k1k2.json` (array of cell records) + a per-fig status table.
 *
 * NOT a pipeline path, NOT an enumeration/completeness run, touches no digests. Best-effort cell
 * extraction only. Two §23-evidence spikes (spike-star-4j-cell.ts / spike-star-4p.ts) are left untouched;
 * their seed constructions are copied here.
 *
 * Part A (guaranteed, certified k=1 cells): 4(j) 8.4*.8.4*, 4(p) 4.6.4*_{π/6}.6, 4(i) 3*p@1,8,6*p@5,8.
 * Part B (best-effort k=2 slope data): Figs 36/40/42/43 only (one star orbit + one purely-regular orbit).
 *        Hand-seated 2-orbit seeds via a bounded placement sweep; any that don't close → seed-path-missing.
 *        Figs 34/35/37/38/39/41 (both orbits carry stars) and 1-33 (dent-bearing) are out of scope.
 *
 * Run (heap headroom needed for the widened pool):
 *   NODE_OPTIONS="--max-old-space-size=12288" MODE=A  pnpm tsx scripts/spike-star-cells-dump.ts   # Part A
 *   NODE_OPTIONS="--max-old-space-size=12288" MODE=B  pnpm tsx scripts/spike-star-cells-dump.ts   # Part B
 *   (MODE=AB — default — runs both; records merge by fig into the one JSON.)
 *
 * Env knobs (Part B timebox): PARTB_SOLVE_CAP (seeds actually solved per fig, default 4),
 *   PARTB_SOLVE_MS (per-solve budget ms, default 180000), PARTB_MAX_SEEDS (candidates collected, default 12).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cyclotomic, CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { ExactStarPolygon } from '@/classes/polygons/ExactStarPolygon';
import { PeriodSolver, type PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
import { detSurd } from '@/classes/algorithm/exact/Surd';
import { exactPolygonsOverlap } from '@/classes/algorithm/exact/exactOverlap';
import type { Polygon } from '@/classes/polygons/Polygon';
import type { SeedConfigurationLike } from '@/classes/algorithm/SeedExpander';
import { enumerateStarVCs, dentRegularFillableVariants, buildStarVCSeed } from '@/classes/algorithm/StarVC';
import { independentCellGate } from './_starCellGate';

// ---------------------------------------------------------------------------------------------------
const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const O = Cyclotomic.ZERO(ring);

// Part-B pool widening, captured ONCE at module load (the env is later mutated per-solve, so we must
// not re-read process.env — a captured constant keeps a user override stable across figs). Default 8/5.7.
const POOL_UP = { steps: process.env.POOL_STEPS_UP ?? '8', lmax: process.env.POOL_LMAX_UP ?? '5.7' };

const OUT = path.join(process.cwd(), 'experiments/star-oracle/star-cells-k1k2.json');
const LOG = path.join(process.cwd(), 'experiments/results/star-cells-k1k2-2026-07-07.log');

type Enc = { n: string[]; d: string };
type Status = 'solved' | 'seed-path-missing' | 'pool-blocked' | 'timeout' | 'gate-failed';
type CellRecord = {
	fig: string;
	k: number;
	orbits: string[];
	composition: string;
	basis: [Enc, Enc] | null;
	detFloat: number | null;
	gatePass: boolean;
	status: Status;
	note?: string;
};

// ---------------------------------------------------------------------------------------------------
function ts(): string {
	return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
function log(msg: string): void {
	fs.appendFileSync(LOG, `[${ts()}] ${msg}\n`);
	console.log(msg);
}
function figOrder(f: string): number {
	const n = parseInt(f, 10);
	return Number.isNaN(n) ? 1000 + f.charCodeAt(0) : n; // 4i/4j/4p sort before the numeric figs
}
function loadExisting(): Map<string, CellRecord> {
	const m = new Map<string, CellRecord>();
	if (fs.existsSync(OUT)) for (const r of JSON.parse(fs.readFileSync(OUT, 'utf8')) as CellRecord[]) m.set(r.fig, r);
	return m;
}
function writeOut(m: Map<string, CellRecord>): void {
	const arr = [...m.values()].sort((a, b) => figOrder(a.fig) - figOrder(b.fig) || (a.fig < b.fig ? -1 : 1));
	fs.writeFileSync(OUT, JSON.stringify(arr, null, 2) + '\n');
}

/** Gate an emitted cell, count orbits, encode the basis, assert d=="1". Classify the outcome. */
function finalizeCell(fig: string, k: number, orbits: string[], cell: PeriodCell, expectOrbits: number): CellRecord {
	const [u, v] = cell.basisExact;
	const gate = independentCellGate(cell);
	const encU = u.encode();
	const encV = v.encode();
	const dUnit = encU.d === '1' && encV.d === '1';
	const det = detSurd(u, v).abs();
	let orbitsCount: number | null = null;
	if (gate.pass) {
		orbitsCount = new KUniformityChecker().countVertexOrbits(cell.cellPolygons, u, v, {
			syms: 0,
			reps: 0,
			blockSize: 0,
			orbits: null,
		});
	}
	const solved = gate.pass && orbitsCount === expectOrbits && dUnit;
	let status: Status;
	let note: string | undefined;
	if (solved) {
		status = 'solved';
	} else {
		status = 'gate-failed';
		if (!gate.pass)
			note = `gate: overlaps=${gate.overlaps} badSum=${gate.badSum} badT=${gate.badT} unmatched=${gate.unmatched} areaExact=${gate.areaExact}`;
		else if (orbitsCount !== expectOrbits) note = `orbit count ${orbitsCount} != expected ${expectOrbits}`;
		else note = `non-unit period denominator (dU=${encU.d} dV=${encV.d}) — unexpected`;
	}
	return {
		fig,
		k,
		orbits,
		composition: gate.composition,
		basis: [encU, encV],
		detFloat: det.toFloat(),
		gatePass: gate.pass,
		status,
		note,
	};
}

function recordFail(fig: string, k: number, orbits: string[], status: Status, note: string): CellRecord {
	return { fig, k, orbits, composition: '', basis: null, detFloat: null, gatePass: false, status, note };
}

// ===================================================================================================
// PART A — three certified k=1 star cells. Seeds copied verbatim from the §23-evidence spikes.
// ===================================================================================================
function solveNamed(fig: string, orbits: string[], polys: Polygon[], maxMs: number, m: Map<string, CellRecord>): void {
	log(`Part A — ${fig}: solving  ${orbits.join(' | ')}  (maxMs=${maxMs})`);
	const seed: SeedConfigurationLike = {
		polygons: polys,
		vertexConfigurations: [{ computeSharedVertexExact: () => O, polygons: polys }],
	};
	const t0 = Date.now();
	const { cells, diag } = new PeriodSolver(1).solve(seed, { maxMs });
	const dt = ((Date.now() - t0) / 1000).toFixed(1);
	if (cells.length === 0) {
		const st: Status = diag.timedOut ? 'timeout' : 'seed-path-missing';
		m.set(fig, recordFail(fig, 1, orbits, st, `0 cells (timedOut=${diag.timedOut}) in ${dt}s`));
	} else {
		m.set(fig, finalizeCell(fig, 1, orbits, cells[0], 1));
	}
	writeOut(m);
	const r = m.get(fig)!;
	log(`  ${fig}: status=${r.status} gatePass=${r.gatePass} det≈${r.detFloat?.toFixed(4) ?? '—'} [${r.composition}] ${dt}s${r.note ? ' — ' + r.note : ''}`);
}

function partA(m: Map<string, CellRecord>): void {
	log('===== PART A (certified k=1 cells) =====');

	// 4(j) — 8.4*.8.4*  (spike-star-4j-cell.ts:34-39)
	solveNamed(
		'4j',
		['8.4*p@3.8.4*p@3'],
		[
			RegularPolygon.fromAnchorAndDirExact(8, O, 0),
			ExactStarPolygon.fourStarPi4(O, 9),
			RegularPolygon.fromAnchorAndDirExact(8, O, 12),
			ExactStarPolygon.fourStarPi4(O, 21),
		],
		30000,
		m,
	);

	// 4(p) — 4.6.4*_{π/6}.6  (spike-star-4p.ts:28-32)
	solveNamed(
		'4p',
		['4.6.4*p@2.6'],
		[
			RegularPolygon.fromAnchorAndDirExact(4, O, 0),
			RegularPolygon.fromAnchorAndDirExact(6, O, 6),
			ExactStarPolygon.isotoxal(4, 2, O, 14),
			RegularPolygon.fromAnchorAndDirExact(6, O, 16),
		],
		60000,
		m,
	);

	// 4(i) — 3*p@1,8,6*p@5,8 (widened pool; tests/star-fill-positive.test.ts)
	log('Part A — 4i: widened pool POOL_STEPS_UP=8 POOL_LMAX_UP=5.7, maxMs=1_200_000 (heavy)');
	process.env.POOL_STEPS_UP = '8';
	process.env.POOL_LMAX_UP = '5.7';
	const vc = enumerateStarVCs({ variants: dentRegularFillableVariants() }).find((v) => v.name === '3*p@1,8,6*p@5,8');
	if (!vc) {
		m.set('4i', recordFail('4i', 1, ['3*p@1,8,6*p@5,8'], 'seed-path-missing', 'VC 3*p@1,8,6*p@5,8 not enumerated'));
		writeOut(m);
		log('  4i: VC not found — seed-path-missing');
	} else {
		const seed = buildStarVCSeed(vc, ring);
		const t0 = Date.now();
		const { cells, diag } = new PeriodSolver(1).solve(seed, { maxMs: 1_200_000 });
		const dt = ((Date.now() - t0) / 1000).toFixed(1);
		if (cells.length === 0) {
			m.set('4i', recordFail('4i', 1, [vc.name], diag.timedOut ? 'timeout' : 'seed-path-missing', `0 cells (timedOut=${diag.timedOut}) in ${dt}s`));
		} else {
			m.set('4i', finalizeCell('4i', 1, [vc.name], cells[0], 1));
		}
		writeOut(m);
		const r = m.get('4i')!;
		log(`  4i: status=${r.status} gatePass=${r.gatePass} det≈${r.detFloat?.toFixed(4) ?? '—'} [${r.composition}] ${dt}s${r.note ? ' — ' + r.note : ''}`);
	}
	delete process.env.POOL_STEPS_UP;
	delete process.env.POOL_LMAX_UP;
}

// ===================================================================================================
// PART B — best-effort k=2 cells for Figs 36/40/42/43 via a bounded 2-fan placement sweep.
// ===================================================================================================
type Corner = { kind: 'reg'; n: number; u: number } | { kind: 'pt'; n: number; alphaU: number; u: number };

/** Parse a Myers vertex-figure string (points only, no dents in 34-43): "3.4.8.3.8*p@1" → corners. */
function parseVF(s: string): Corner[] {
	return s.split('.').map((tok): Corner => {
		const mm = tok.match(/^(\d+)\*p@(\d+)$/);
		if (mm) {
			const n = Number(mm[1]);
			const alphaU = Number(mm[2]);
			return { kind: 'pt', n, alphaU, u: alphaU };
		}
		const n = Number(tok);
		return { kind: 'reg', n, u: 12 - 24 / n }; // regular n-gon corner interior angle, π/12 units
	});
}

/** Seat a fan (its corner sequence) at `anchor`, first outgoing edge `dir0`, sweeping CCW. Mirrors buildStarVCSeed. */
function buildFan(tokens: Corner[], anchor: Cyclotomic, dir0: number): Polygon[] {
	const polys: Polygon[] = [];
	let dir = ((dir0 % 24) + 24) % 24;
	for (const t of tokens) {
		if (t.kind === 'reg') polys.push(RegularPolygon.fromAnchorAndDirExact(t.n, anchor, dir));
		else polys.push(ExactStarPolygon.isotoxal(t.n, t.alphaU, anchor, dir));
		dir = (((dir + t.u) % 24) + 24) % 24;
	}
	return polys;
}

/**
 * Bounded placement sweep: seat the STAR orbit as fan A at O, then try to seat the REGULAR orbit as
 * fan B at every A-vertex × every starting direction. A candidate 2-orbit seed is admissible iff the
 * two fans SHARE ≥1 tile (glued/connected) after exactKey-dedup AND no two DISTINCT tiles properly
 * overlap (exact B2). The dedup guarantees a shared tile is one object; the overlap gate then guarantees
 * the VC at O stays = orbit A and the VC at P stays = orbit B (fan A already fills 2π at O, fan B at P).
 */
function collectSeeds(Atokens: Corner[], Btokens: Corner[], maxSeeds: number): { union: Polygon[]; P: Cyclotomic }[] {
	const A = buildFan(Atokens, O, 0);
	const pbSet = new Map<string, Cyclotomic>();
	for (const t of A) for (const vx of t.exactVertices!) if (vx.key() !== O.key()) pbSet.set(vx.key(), vx);
	const out: { union: Polygon[]; P: Cyclotomic }[] = [];
	sweep: for (const P of pbSet.values()) {
		for (let dir0 = 0; dir0 < 24; dir0++) {
			const B = buildFan(Btokens, P, dir0);
			const byKey = new Map<string, Polygon>();
			for (const p of A) byKey.set(p.exactKey(), p);
			let shared = 0;
			for (const p of B) {
				const kk = p.exactKey();
				if (byKey.has(kk)) shared++;
				else byKey.set(kk, p);
			}
			if (shared === 0) continue; // fans not glued (disconnected patch)
			const union = [...byKey.values()];
			let overlap = false;
			for (let i = 0; i < union.length && !overlap; i++)
				for (let j = i + 1; j < union.length; j++)
					if (exactPolygonsOverlap(union[i].exactVertices!, union[j].exactVertices!)) {
						overlap = true;
						break;
					}
			if (overlap) continue;
			out.push({ union, P });
			if (out.length >= maxSeeds) break sweep;
		}
	}
	return out;
}

/** Bounded placement sweep, BOTH orientations (either orbit seated at O — the star-at-O sweep alone
 *  can miss the gluing that closes; trying regular-at-O too widens coverage). Admissible seed = the two
 *  fans share ≥1 tile (glued) after exactKey-dedup AND no two distinct tiles properly overlap (exact B2). */
function partBAttempt(fig: string, orbits: string[], m: Map<string, CellRecord>): void {
	const MAX_SEEDS = Number(process.env.PARTB_MAX_SEEDS ?? '12');
	const SOLVE_CAP = Number(process.env.PARTB_SOLVE_CAP ?? '4');
	const SOLVE_MS = Number(process.env.PARTB_SOLVE_MS ?? '180000');
	const STEPS_UP = POOL_UP.steps;
	const LMAX_UP = POOL_UP.lmax;
	log(`----- Part B — Fig ${fig}:  ${orbits.join(' | ')}  (pool up ${STEPS_UP}/${LMAX_UP}; ≤${SOLVE_CAP} solves @ ${SOLVE_MS}ms) -----`);

	const tok = orbits.map(parseVF);
	const raw = [...collectSeeds(tok[0], tok[1], MAX_SEEDS), ...collectSeeds(tok[1], tok[0], MAX_SEEDS)];
	const cands: { union: Polygon[]; P: Cyclotomic }[] = [];
	const seen = new Set<string>();
	for (const c of raw) {
		const sk = c.union.map((p) => p.exactKey()).sort().join('|');
		if (seen.has(sk)) continue;
		seen.add(sk);
		cands.push(c);
		if (cands.length >= MAX_SEEDS) break;
	}
	log(`  Fig ${fig}: ${cands.length} admissible 2-orbit seed(s) after glue+overlap filter (both orientations; solving ≤${SOLVE_CAP} @ ${SOLVE_MS}ms)`);
	if (cands.length === 0) {
		m.set(fig, recordFail(fig, 2, orbits, 'seed-path-missing', 'no admissible 2-fan placement (glue+overlap sweep empty)'));
		writeOut(m);
		return;
	}

	process.env.POOL_STEPS_UP = STEPS_UP;
	process.env.POOL_LMAX_UP = LMAX_UP;
	let solvedCell: PeriodCell | null = null;
	let sawTimeout = false;
	for (let i = 0; i < Math.min(cands.length, SOLVE_CAP); i++) {
		const c = cands[i];
		const seed: SeedConfigurationLike = {
			polygons: c.union,
			vertexConfigurations: [
				{ computeSharedVertexExact: () => O, polygons: c.union.filter((p) => p.vertexKeySet().has(O.key())) },
				{ computeSharedVertexExact: () => c.P, polygons: c.union.filter((p) => p.vertexKeySet().has(c.P.key())) },
			],
		};
		const t0 = Date.now();
		const { cells, diag } = new PeriodSolver(2).solve(seed, { maxMs: SOLVE_MS });
		const dt = ((Date.now() - t0) / 1000).toFixed(1);
		sawTimeout = sawTimeout || diag.timedOut;
		let accepted = 0;
		for (const cell of cells) {
			const g = independentCellGate(cell);
			if (!g.pass) continue;
			const orb = new KUniformityChecker().countVertexOrbits(cell.cellPolygons, cell.basisExact[0], cell.basisExact[1], {
				syms: 0,
				reps: 0,
				blockSize: 0,
				orbits: null,
			});
			if (orb === 2) {
				solvedCell = cell;
				accepted++;
				break;
			}
		}
		log(`    seed ${i}: emitted=${cells.length} accepted(k=2 gated)=${accepted} timedOut=${diag.timedOut} cand=${diag.candidateLattices} ${dt}s`);
		if (solvedCell) break;
	}
	delete process.env.POOL_STEPS_UP;
	delete process.env.POOL_LMAX_UP;

	if (solvedCell) {
		m.set(fig, finalizeCell(fig, 2, orbits, solvedCell, 2));
	} else {
		m.set(fig, recordFail(fig, 2, orbits, sawTimeout ? 'timeout' : 'seed-path-missing', `no gated k=2 cell from ${Math.min(cands.length, SOLVE_CAP)} solved seed(s) (pool up ${STEPS_UP}/${LMAX_UP}, ${SOLVE_MS}ms)`));
	}
	writeOut(m);
	const r = m.get(fig)!;
	log(`  Fig ${fig}: status=${r.status} gatePass=${r.gatePass} det≈${r.detFloat?.toFixed(4) ?? '—'} [${r.composition}]${r.note ? ' — ' + r.note : ''}`);
}

function partB(m: Map<string, CellRecord>): void {
	log('===== PART B (best-effort k=2 cells) =====');
	const oracle = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'experiments/star-oracle/myers-2009-k2.json'), 'utf8')) as {
		records: { fig: string; orbits: string[] }[];
	};
	const orbitsOf = (fig: string) => oracle.records.find((r) => r.fig === fig)!.orbits;
	const attempt = (process.env.PARTB_FIGS ?? '36,40,42,43').split(',').map((s) => s.trim()).filter(Boolean);
	const inRing = ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43'];

	for (const fig of attempt) {
		const existing = m.get(fig);
		if (existing && existing.status === 'solved') {
			log(`  Fig ${fig}: already solved (det≈${existing.detFloat?.toFixed(4)}) — skipping`);
			continue;
		}
		partBAttempt(fig, orbitsOf(fig), m);
	}
	// any in-ring fig neither attempted this run nor already recorded → seed-path-missing placeholder
	for (const fig of inRing) {
		if (m.has(fig)) continue;
		m.set(fig, recordFail(fig, 2, orbitsOf(fig), 'seed-path-missing', 'not attempted this run'));
	}
	writeOut(m);
}

// ===================================================================================================
function statusTable(m: Map<string, CellRecord>): void {
	const arr = [...m.values()].sort((a, b) => figOrder(a.fig) - figOrder(b.fig) || (a.fig < b.fig ? -1 : 1));
	log('===== STATUS TABLE =====');
	log('fig   k  status            gate  det        composition');
	for (const r of arr) {
		log(
			`${r.fig.padEnd(5)} ${String(r.k).padEnd(2)} ${r.status.padEnd(17)} ${(r.gatePass ? 'Y' : 'n').padEnd(5)} ${(r.detFloat?.toFixed(4) ?? '—').padEnd(10)} ${r.composition}${r.note ? '   // ' + r.note : ''}`,
		);
	}
	const solved = arr.filter((r) => r.status === 'solved');
	log(`solved: ${solved.length}/${arr.length}  (${solved.map((r) => `${r.fig}·k${r.k}`).join(', ')})`);
	log(`output: ${OUT}`);
}

// ---------------------------------------------------------------------------------------------------
const MODE = (process.env.MODE ?? 'AB').toUpperCase();
const m = loadExisting();
log(`==================== star-cells-k1k2 dump — MODE=${MODE} ====================`);
if (MODE.includes('A')) partA(m);
if (MODE.includes('B')) partB(m);
statusTable(m);
