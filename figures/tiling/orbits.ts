/**
 * Orbit assignment for the thesis figure pipeline.
 *
 * The DB never stored orbits (found_tilings.vc_types is unpopulated), so we recompute them from the
 * exact cell via the SAME machinery the pipeline used as its correctness gate —
 * KUniformityChecker.vertexOrbits — which doubles as a thesis-quotable re-verification: generating
 * the cache HARD-FAILS if any certified tiling's recomputed orbit count differs from its k.
 *
 * Cached in figures/data/orbits.json keyed by canonical_key, so the (seconds-per-cell at k=3)
 * computation runs once. The cached form is float-free and render-ready: orbit id per cell-polygon
 * CORNER (orbit is lattice-invariant, so the corner id covers every replicated copy), plus the
 * canonical vertex-figure name per orbit (comma format, e.g. "3,3,4,3,4" — matches
 * VertexConfiguration names and tests/k-uniformity.test.ts).
 *
 *   pnpm tsx figures/tiling/orbits.ts [--force]   # (re)build the cache for the whole snapshot
 */
import fs from 'node:fs';
import path from 'node:path';
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
import { canonicalizeVertexFigure } from '@/lib/utils/vertexFigureHue';
import { deserializeCell, type SerializedCell } from '../../scripts/scoutCodec';
import { loadSnapshot, type SnapshotTiling } from '../snapshot';

export type TilingOrbits = {
	k: number;
	/** [cellPolyIndex][cornerIndex] → orbit id; -1 = not a tiling vertex (Myers dent-fill point). */
	orbitOfCorner: number[][];
	/** Canonical vertex-figure name per orbit id. */
	vcOfOrbit: string[];
	symsCount: number;
	repsCount: number;
};

export type OrbitCache = Record<string, TilingOrbits>;

export const ORBIT_CACHE_PATH = path.join(process.cwd(), 'figures', 'data', 'orbits.json');

export function assignOrbits(cellCodec: SerializedCell): TilingOrbits {
	const ring = CyclotomicRing.create(24);
	setActiveRing(ring);
	const cell = deserializeCell(ring, cellCodec);
	const res = new KUniformityChecker().vertexOrbits(
		cell.cellPolygons,
		cell.basisExact[0],
		cell.basisExact[1]
	);
	if (!res) throw new Error('vertexOrbits returned null for a certified tiling — investigate');

	const orbitOfCorner = cell.cellPolygons.map((p) =>
		p.exactVertices!.map((vx) => res.orbitOf(vx) ?? -1)
	);

	// Vertex-figure name per orbit: incident polygon n's in angular order around each rep, canonical
	// minimal rotation/reflection. Computed for EVERY rep and cross-checked — reps in one orbit must
	// agree (a cheap independent check on the verified symmetries).
	const polysByVertexKey = new Map<string, { n: number; cx: number; cy: number }[]>();
	for (const q of res.block) {
		const c = q.exactCentroid!.toVector();
		for (const vx of q.exactVertices!) {
			const k = vx.key();
			const list = polysByVertexKey.get(k);
			const entry = { n: q.n, cx: c.x, cy: c.y };
			if (list) list.push(entry);
			else polysByVertexKey.set(k, [entry]);
		}
	}
	const vcOfOrbit: string[] = new Array(res.orbits);
	res.reps.forEach((rep, j) => {
		const rv = rep.toVector();
		const inc = polysByVertexKey.get(rep.key()) ?? [];
		if (inc.length < 3) throw new Error(`rep ${j}: only ${inc.length} incident polygons — bad block`);
		const ordered = inc
			.map((e) => ({ n: e.n, ang: Math.atan2(e.cy - rv.y, e.cx - rv.x) }))
			.sort((a, b) => a.ang - b.ang)
			.map((e) => e.n);
		const name = canonicalizeVertexFigure(ordered).join(',');
		const o = res.repOrbit[j];
		if (vcOfOrbit[o] === undefined) vcOfOrbit[o] = name;
		else if (vcOfOrbit[o] !== name) {
			throw new Error(`orbit ${o}: reps disagree on vertex figure (${vcOfOrbit[o]} vs ${name})`);
		}
	});

	return {
		k: res.orbits,
		orbitOfCorner,
		vcOfOrbit,
		symsCount: res.syms.length,
		repsCount: res.reps.length,
	};
}

export function loadOrbitCache(): OrbitCache {
	try {
		return JSON.parse(fs.readFileSync(ORBIT_CACHE_PATH, 'utf8')) as OrbitCache;
	} catch {
		return {};
	}
}

/**
 * Compute (or reuse cached) orbits for every snapshot tiling. HARD-FAILS if a recomputed orbit
 * count differs from the tiling's certified k — the cache is also a re-verification artifact.
 */
export function ensureOrbits(tilings: SnapshotTiling[], opts: { force?: boolean } = {}): OrbitCache {
	const cache: OrbitCache = opts.force ? {} : loadOrbitCache();
	const missing = tilings.filter((t) => !cache[t.canonicalKey]);
	if (missing.length === 0) return cache;

	const t0 = Date.now();
	missing.forEach((t, i) => {
		const s0 = Date.now();
		const orbits = assignOrbits(t.cellCodec);
		if (orbits.k !== t.k) {
			throw new Error(
				`ORBIT MISMATCH for ${t.canonicalKey}: recomputed ${orbits.k} orbits, certified k=${t.k}`
			);
		}
		cache[t.canonicalKey] = orbits;
		const dt = (Date.now() - s0) / 1000;
		const elapsed = (Date.now() - t0) / 1000;
		const eta = (elapsed / (i + 1)) * (missing.length - i - 1);
		console.error(
			`[orbits ${i + 1}/${missing.length}] k=${t.k} ${orbits.vcOfOrbit.join('; ')} ` +
				`(${dt.toFixed(1)}s, ETA ${eta.toFixed(0)}s)`
		);
	});

	const sorted: OrbitCache = {};
	for (const key of Object.keys(cache).sort()) sorted[key] = cache[key];
	fs.writeFileSync(ORBIT_CACHE_PATH, JSON.stringify(sorted, null, 1) + '\n');
	console.error(`★ orbit cache written: ${ORBIT_CACHE_PATH} (${Object.keys(sorted).length} tilings)`);
	return sorted;
}

// CLI: rebuild the cache for the whole snapshot.
if (process.argv[1] && path.basename(process.argv[1]) === 'orbits.ts') {
	const force = process.argv.includes('--force');
	const snap = loadSnapshot();
	ensureOrbits(snap.tilings, { force });
}
