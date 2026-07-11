/* Enrich public/reference-atlas.json IN PLACE with the vertex-type classification and exact wallpaper
 * symmetry. SURGICAL: only ADDS four fields to each existing entry — never reorders, drops, or
 * re-derives the geometry pipeline. It reconstructs each regular cell from the `exactSource` the entry
 * already carries, so it cannot regress the atlas the multi-phase build produced.
 *
 * Added fields (see lib/services/referenceAtlas.ts):
 *   m: number        — distinct vertex-configuration count (m ≤ k; m = 1 at k=1). m === k is Krötenheerdt.
 *   partition: n[]   — multiplicities of the distinct configs, descending, summing to k (the "511" group).
 *   wallpaperGroup   — exact group (analyzeSymmetry), REGULAR tilings only (star tiles are non-convex;
 *   latticeShape     — NOTES §9.4 — so stars get neither field, by design, and are logged as skipped).
 *
 * Per source:
 *   galebach   — assignOrbits(cell) → per-orbit vertex figures → m/partition; analyzeSymmetry → group.
 *   ctrnact    — m/partition from ctrnact.json vertexConfigs; VALIDATED against its distinctTypePartition
 *                (mismatch = loud failure); analyzeSymmetry → group.
 *   ctrnact-star / myers — m/partition from the star cell files' per-orbit `orbits[]` (k=1 ⇒ m=1);
 *                no group/lattice.
 *
 * Every unclassified tiling is logged with a count (a characterization gap is a finding, never silent).
 *
 *   pnpm tsx scripts/enrich-reference-atlas.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { CyclotomicRing, setActiveRing, type Cyclotomic } from '@/classes/Cyclotomic';
import { reconstructOracleCell } from './oracle-match';
import { serializeCell, deserializeCell } from '@/classes/algorithm/cellCodec';
import { assignOrbits } from '../figures/tiling/orbits';
import { seedFromPeriodCell } from '@/lib/services/cellCodecService';
import { analyzeSymmetry } from '@/lib/classes/symmetry/WallpaperSymmetry';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';
import type { LatticeShape, WallpaperGroup } from '@/lib/classes/symmetry/types';

const ATLAS_PATH = path.join(process.cwd(), 'public', 'reference-atlas.json');
const CTRNACT_PATH = path.join(process.cwd(), 'figures', 'data', 'ctrnact.json');
const STAR_DIR = path.join(process.cwd(), 'experiments', 'star-oracle');
const LOG_PATH = path.join(process.cwd(), 'experiments', 'results', 'reference-atlas-enrich-2026-07-11.log');

const localRing = CyclotomicRing.create(24);
setActiveRing(localRing);

// ── logging (synchronous file + stderr, per the experiments logging rule) ──
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'w' });
function log(msg = ''): void {
	logStream.write(msg + '\n');
	console.error(msg);
}

type ExactSource =
	| { kind: 'seed'; T1: number[]; T2: number[]; Seed: number[][] }
	| { kind: 'cell'; cell: unknown };
interface AtlasEntry {
	id: string;
	source: 'galebach' | 'ctrnact' | 'ctrnact-star' | 'myers';
	k: number;
	family: string;
	exactSource?: ExactSource;
	m?: number;
	partition?: number[];
	wallpaperGroup?: WallpaperGroup;
	latticeShape?: LatticeShape;
	[k: string]: unknown;
}

// Distinct vertex-config count + descending multiplicity partition from per-orbit config identities.
function classify(configKeys: string[]): { m: number; partition: number[] } {
	const counts = new Map<string, number>();
	for (const key of configKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
	return { m: counts.size, partition: [...counts.values()].sort((a, b) => b - a) };
}

// ctrnact's own notation for the gate: "M" when M === k (all singletons), else "M (parts)".
function ctrnactKey(m: number, partition: number[], k: number): string {
	return m === k ? String(m) : `${m} (${partition.join('')})`;
}

// Reconstruct the exact PeriodCell an entry stores, or null with a reason.
function reconstructCell(e: AtlasEntry): { cell: PeriodCell } | { error: string } {
	const src = e.exactSource;
	if (!src) return { error: 'no exactSource' };
	if (src.kind === 'seed') return reconstructOracleCell(e.id, { T1: src.T1, T2: src.T2, Seed: src.Seed });
	try {
		return { cell: deserializeCell(localRing, src.cell as never) };
	} catch (err) {
		return { error: `deserializeCell failed: ${err instanceof Error ? err.message : err}` };
	}
}

// ── source-data indexes ──
log('=== load source data ===');
const atlas = JSON.parse(fs.readFileSync(ATLAS_PATH, 'utf8')) as AtlasEntry[];
log(`atlas: ${atlas.length} entries`);

const ctrnactById = new Map<string, { vertexConfigs: number[][]; distinctTypePartition: string }>();
{
	const src = JSON.parse(fs.readFileSync(CTRNACT_PATH, 'utf8')).tilings as {
		id: string;
		vertexConfigs: number[][];
		distinctTypePartition: string;
	}[];
	for (const r of src) ctrnactById.set(r.id, { vertexConfigs: r.vertexConfigs, distinctTypePartition: r.distinctTypePartition });
	log(`ctrnact.json: ${ctrnactById.size} records indexed`);
}

// id → per-orbit config strings (star cells). Strip the trailing symmetry flag so config identity
// matches the regular convention (flag R4/F/A distinguishes symmetry ROLE, not the vertex type).
const starOrbitsById = new Map<string, string[]>();
{
	let files = 0;
	for (const f of fs.readdirSync(STAR_DIR).filter((f) => f.endsWith('.cells.json'))) {
		let data: unknown;
		try {
			data = JSON.parse(fs.readFileSync(path.join(STAR_DIR, f), 'utf8'));
		} catch {
			continue;
		}
		const arr: unknown[] = Array.isArray(data)
			? data
			: ((data as Record<string, unknown>).tilings as unknown[]) ??
				((data as Record<string, unknown>).cells as unknown[]) ??
				(Object.values(data as Record<string, unknown>).find(Array.isArray) as unknown[]) ??
				[];
		for (const rec of arr as { id?: string; orbits?: string[] }[]) {
			if (rec.id && Array.isArray(rec.orbits) && rec.orbits.length && !starOrbitsById.has(rec.id)) {
				starOrbitsById.set(
					rec.id,
					rec.orbits.map((s) => s.slice(0, s.lastIndexOf(')') + 1 || undefined)),
				);
			}
		}
		files++;
	}
	log(`star cell files: ${files} read, ${starOrbitsById.size} ids with per-orbit configs`);
}

// ── per-entry enrichment ──
log('\n=== classify ===');
const t0 = Date.now();
const stat = {
	mOk: 0,
	mSkip: 0,
	symOk: 0,
	symSkip: 0,
	gateMismatch: [] as { id: string; src: string; computed: string }[],
	symFail: [] as { id: string; error: string }[],
	mFail: [] as { id: string; reason: string }[],
};
const groupHist: Record<string, number> = {};
const regularCount = atlas.filter((e) => e.source === 'galebach' || e.source === 'ctrnact').length;
let regularDone = 0;

for (const e of atlas) {
	const isRegular = e.source === 'galebach' || e.source === 'ctrnact';

	// --- reconstruct once (regular only: needed for symmetry, and for galebach orbits) ---
	let cell: PeriodCell | null = null;
	if (isRegular) {
		const rec = reconstructCell(e);
		if ('cell' in rec) cell = rec.cell;
		else stat.symFail.push({ id: e.id, error: `reconstruct: ${rec.error}` });
	}
	const cellRing = cell ? (cell.basisExact[0] as unknown as { ring: CyclotomicRing }).ring : null;

	// --- m / partition ---
	let classified: { m: number; partition: number[] } | null = null;
	if (e.source === 'ctrnact') {
		const src = ctrnactById.get(e.id);
		if (src) {
			classified = classify(src.vertexConfigs.map((cfg) => cfg.join(',')));
			const computed = ctrnactKey(classified.m, classified.partition, e.k);
			if (computed !== src.distinctTypePartition)
				stat.gateMismatch.push({ id: e.id, src: src.distinctTypePartition, computed });
		} else stat.mFail.push({ id: e.id, reason: 'not in ctrnact.json' });
	} else if (e.source === 'galebach') {
		if (cell && cellRing) {
			try {
				setActiveRing(cellRing);
				const orb = assignOrbits(serializeCell(cell));
				classified = classify(orb.vcOfOrbit);
			} catch (err) {
				stat.mFail.push({ id: e.id, reason: `assignOrbits: ${err instanceof Error ? err.message : err}` });
			}
		} else stat.mFail.push({ id: e.id, reason: 'no cell' });
	} else {
		// star: per-orbit orbits[] if we have it; k=1 is trivially m=1
		const orbits = starOrbitsById.get(e.id);
		if (orbits) classified = classify(orbits);
		else if (e.k === 1) classified = { m: 1, partition: [1] };
		else stat.mFail.push({ id: e.id, reason: 'no star orbits + k>1' });
	}
	if (classified) {
		e.m = classified.m;
		e.partition = classified.partition;
		stat.mOk++;
	} else {
		delete e.m;
		delete e.partition;
		stat.mSkip++;
	}

	// --- wallpaper group / lattice (regular only) ---
	if (isRegular && cell && cellRing) {
		try {
			setActiveRing(cellRing);
			const { T1, T2, seed } = seedFromPeriodCell(cell);
			const sym = analyzeSymmetry(cellRing, T1, T2, seed as Cyclotomic[]);
			e.wallpaperGroup = sym.group;
			e.latticeShape = sym.latticeShape;
			groupHist[sym.group] = (groupHist[sym.group] ?? 0) + 1;
			stat.symOk++;
		} catch (err) {
			stat.symFail.push({ id: e.id, error: `analyzeSymmetry: ${err instanceof Error ? err.message : err}` });
			delete e.wallpaperGroup;
			delete e.latticeShape;
		}
	} else if (isRegular) {
		stat.symSkip++;
	}

	if (isRegular) {
		regularDone++;
		if (regularDone % 100 === 0) {
			const elapsed = (Date.now() - t0) / 1000;
			const eta = (elapsed / regularDone) * (regularCount - regularDone);
			log(`  [${regularDone}/${regularCount}] regular classified — ${elapsed.toFixed(0)}s elapsed, ETA ${eta.toFixed(0)}s`);
		}
	}
}

// ── write back (same entries, same order, + new fields) ──
fs.writeFileSync(ATLAS_PATH, JSON.stringify(atlas) + '\n');

// ── report ──
log('\n=== summary ===');
log(`m/partition:  ${stat.mOk} classified, ${stat.mSkip} unclassified`);
log(`wallpaper:    ${stat.symOk} classified, ${stat.symSkip} skipped (stars, by design)`);
const mByK: Record<number, Record<number, number>> = {};
for (const e of atlas) if (e.m != null) ((mByK[e.k] ??= {})[e.m] = (mByK[e.k][e.m] ?? 0) + 1);
log('\nM distribution by k (k: {M: count}):');
for (const k of Object.keys(mByK).map(Number).sort((a, b) => a - b)) log(`  k=${k}: ${JSON.stringify(mByK[k])}`);
log('\nwallpaper-group histogram:');
for (const g of Object.keys(groupHist).sort()) log(`  ${g.padEnd(5)} ${groupHist[g]}`);

if (stat.gateMismatch.length) {
	log(`\n⚑ CTRNACT PARTITION GATE: ${stat.gateMismatch.length} MISMATCH(es) — computed ≠ source distinctTypePartition:`);
	for (const g of stat.gateMismatch.slice(0, 40)) log(`    ${g.id}: computed "${g.computed}" vs source "${g.src}"`);
	process.exitCode = 1;
} else {
	log(`\n✓ ctrnact partition gate: all ${atlas.filter((e) => e.source === 'ctrnact').length} entries agree with distinctTypePartition`);
}
if (stat.mFail.length) {
	log(`\n⚑ ${stat.mFail.length} tiling(s) with NO m/partition (characterization gap):`);
	for (const f of stat.mFail.slice(0, 40)) log(`    ${f.id}: ${f.reason}`);
}
if (stat.symFail.length) {
	log(`\n⚑ ${stat.symFail.length} REGULAR tiling(s) failed symmetry classification:`);
	for (const f of stat.symFail.slice(0, 40)) log(`    ${f.id}: ${f.error}`);
}
log(`\n★ wrote ${path.relative(process.cwd(), ATLAS_PATH)} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
logStream.end();
