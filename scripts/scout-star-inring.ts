/*
 * C7 Increment-2 — in-ring k=1 star scout. Enumerates exact star VCs (StarVC), builds the exact seed
 * fan per VC, solves each with PeriodSolver(1), dedupes up to congruence, and reports recovered tilings
 * + the star variants present vs the TA oracle. Standalone (does NOT touch the regular `pnpm pipeline`).
 *
 * Run:  pnpm tsx scripts/scout-star-inring.ts [flags]
 *   --variants all|dentreg   variant set (default dentreg = the 19 SOUND dent-regular-fillable; see StarVC)
 *   --single-star            only VCs with a single star (n,α) type  (heuristic — see ⚑ below)
 *   --dents                  also enumerate Fig-3 dent-at-vertex VCs (best-effort)
 *   --max-corners N          only VCs with ≤ N corners
 *   --limit N                solve only the first N VCs (after sort)   ⚑ a CAP — logged loud
 *   --maxMs N                per-seed wall cap (default 30000)         ⚑ a CAP — logged loud
 *
 * ⚑ FEASIBILITY (project doctrine — completeness over speed, no silent caps): the fully-sound run over
 * all 4896 dent-reg VCs is ~8h (C2/C3 loosening inflates candidateLattices; the sharp star area set is
 * the Increment-3 dent-aware bound, TA-owed). Any scope reduction below the full sound set (--single-star,
 * --limit, --max-corners, a per-seed --maxMs timeout) is a CAP that can DROP an in-ring tiling and is
 * printed loudly. The completeness CLAIM holds only for the full unscoped sound run.
 */
import { PeriodSolver, type PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';
import {
	enumerateStarVCs, dentRegularFillableVariants, inRingStarVariants, buildStarVCSeed, type StarVC,
} from '@/classes/algorithm/StarVC';
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import type { Polygon } from '@/classes/polygons/Polygon';

const argv = process.argv.slice(2);
const flag = (name: string): boolean => argv.includes(name);
const opt = (name: string, def: string): string => {
	const i = argv.indexOf(name);
	return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
};

const ring = CyclotomicRing.create(24);
setActiveRing(ring);

const variantSet = opt('--variants', 'dentreg') === 'all' ? inRingStarVariants() : dentRegularFillableVariants();
const includeDents = flag('--dents');
const singleStar = flag('--single-star');
const maxCorners = parseInt(opt('--max-corners', '999'), 10);
const limit = parseInt(opt('--limit', '0'), 10); // 0 = no limit
const maxMs = parseInt(opt('--maxMs', '30000'), 10);

const starKey = (p: Polygon): string => {
	let min = Infinity;
	for (let i = 0; i < p.exactVertices!.length; i++) min = Math.min(min, p.cornerAngleUnits(i));
	return `${p.n}*@${min}`;
};

// TA oracle: star variants needed across the in-ring Myers tilings (6*@6 only for Fig-3(f)).
const ORACLE = new Set(['3*@1', '3*@2', '4*@2', '4*@3', '4*@4', '6*@2', '6*@4', '6*@5', '6*@6', '8*@1', '12*@2']);

// --- enumerate + scope ---
let vcs: StarVC[] = enumerateStarVCs({ variants: variantSet, includeDents });
const totalEnum = vcs.length;
if (singleStar) {
	vcs = vcs.filter((v) => new Set(v.tokens.filter((t) => t.kind !== 'reg').map((t) => `${t.n}@${(t as { alphaU: number }).alphaU}`)).size === 1);
}
vcs = vcs.filter((v) => v.tokens.length <= maxCorners);
// simple-first: fewer corners (smaller cells solve faster + are the canonical in-ring tilings)
vcs.sort((a, b) => a.tokens.length - b.tokens.length || (a.name < b.name ? -1 : 1));
const scoped = vcs.length;
if (limit > 0) vcs = vcs.slice(0, limit);

console.log('=== C7 in-ring star scout ===');
console.log(`variants=${opt('--variants', 'dentreg')}(${variantSet.length}) dents=${includeDents} singleStar=${singleStar} maxCorners=${maxCorners} maxMs=${maxMs} limit=${limit || '∞'}`);
console.log(`VCs: enumerated=${totalEnum} scoped=${scoped} solving=${vcs.length}`);
const caps: string[] = [];
if (opt('--variants', 'dentreg') !== 'all') caps.push(`variant filter (dent-reg ${variantSet.length}/32; SOUND superset of oracle)`);
if (singleStar) caps.push(`single-star-type (${totalEnum}→ heuristic, may miss multi-star-type VCs)`);
if (maxCorners < 999) caps.push(`max-corners ${maxCorners}`);
if (limit > 0) caps.push(`limit ${limit}`);
caps.push(`per-seed timeout ${maxMs}ms`);
console.log(`⚑ ACTIVE CAPS (each can drop an in-ring tiling): ${caps.join('; ')}`);
console.log('');

// --- solve ---
const extractor = new TranslationalCellExtractor();
const allCells: PeriodCell[] = [];
const variantHits = new Set<string>();
let timeouts = 0, nonzero = 0;
const t0 = Date.now();
for (let i = 0; i < vcs.length; i++) {
	const vc = vcs[i];
	const seed = buildStarVCSeed(vc, ring);
	const ts = Date.now();
	const { cells, diag } = new PeriodSolver(1).solve(seed, { maxMs });
	const ms = Date.now() - ts;
	if (diag.timedOut) { timeouts++; console.log(`  ⚑ TIMEOUT (${ms}ms, lat=${diag.candidateLattices}) — ${vc.name}  [possible DROP]`); }
	if (cells.length > 0) {
		nonzero++;
		for (const c of cells) {
			allCells.push(c);
			for (const p of c.cellPolygons) if (p.isStar) variantHits.add(starKey(p));
		}
		const comp = cells.map((c) => `{${c.cellPolygons.map((p) => p.getName()).sort().join(',')}}`).join(' ');
		console.log(`  HIT [${i + 1}/${vcs.length}] ${ms.toString().padStart(6)}ms  ${cells.length} cell(s)  ${vc.name}  ${comp}`);
	}
	if ((i + 1) % 25 === 0) console.log(`  …progress ${i + 1}/${vcs.length}  (${((Date.now() - t0) / 1000).toFixed(0)}s, ${nonzero} hits, ${timeouts} timeouts)`);
}

// --- dedupe + report ---
const reps = dedupeByCongruence(allCells, (c) => extractor.canonicalKey(c.cellPolygons));
console.log('');
console.log(`=== RESULT (${((Date.now() - t0) / 1000).toFixed(1)}s) ===`);
console.log(`distinct k=1 star tilings (congruence): ${reps.length}  (from ${allCells.length} raw cells, ${nonzero} productive VCs)`);
console.log(`timeouts: ${timeouts}${timeouts > 0 ? '  ⚑ possible drops — re-run uncapped' : ''}`);

const hits = [...variantHits].sort();
console.log(`\nstar variants RECOVERED (${hits.length}): ${hits.join(', ')}`);
const missing = [...ORACLE].filter((v) => !variantHits.has(v)).sort();
const extra = hits.filter((v) => !ORACLE.has(v));
console.log(`oracle NOT recovered (${missing.length}): ${missing.join(', ') || '—'}${missing.length ? '  ⚑' : '  ✓'}`);
console.log(`recovered BEYOND oracle (${extra.length}): ${extra.join(', ') || '—'}  ${extra.length ? '(logged finding — Myers is hand-made / extras are candidates)' : ''}`);

// per-tiling digest (deterministic)
const ids = reps.map((c) => extractor.canonicalKey(c.cellPolygons)).sort();
let h = 5381n;
for (const ch of ids.join('|')) h = ((h * 33n) ^ BigInt(ch.codePointAt(0)!)) & 0xffffffffffffffffn;
console.log(`\nCOMPOSITION digest=${h.toString(16)} count=${reps.length}`);
