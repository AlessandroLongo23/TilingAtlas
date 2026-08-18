import type { PolygonMode, ReferenceTiling } from "@/lib/services/referenceAtlas";

export type { PolygonMode };

/**
 * Tile SPECIES of a tiling, at the granularity /theory/tiles uses.
 *
 * The family label only carries the fold — "6*" covers the 6-pointed star at 30°, 60°, 75° and 90°
 * alike — so it cannot answer "which tilings use the 12★ at 30°". The shipped render cell can: a star
 * polygon's apex angle is recoverable from its vertices, and the atlas's angles land on whole degrees
 * (measured across all 9,557 entries: 15, 18, 20, 30, 40, 45, 60, 75, 80, 90, 120 — 29 species).
 *
 * Keys are the picker's vocabulary and the filter's:
 *   "12"     a regular dodecagon
 *   "6*60"   a 6-pointed star with a 60° point
 *
 * ⚑ For a one-parameter α-family the render cell is the DEFAULT-α evaluation, so the species key is
 * that snapshot's. The family genuinely exists at every α in its range; the /play slider is where that
 * lives. Filtering by species therefore asks "does the shipped thumbnail use this tile", which is the
 * honest reading of a picker built from thumbnails.
 */

/** Interior angle at vertex i of a closed polygon, in degrees. */
function interiorAngleDeg(vs: number[][], i: number): number {
	const n = vs.length;
	const p = vs[(i - 1 + n) % n], c = vs[i], q = vs[(i + 1) % n];
	const a = Math.atan2(p[1] - c[1], p[0] - c[0]);
	const b = Math.atan2(q[1] - c[1], q[0] - c[0]);
	const d = Math.abs(((b - a) * 180) / Math.PI) % 360;
	return Math.min(d, 360 - d);
}

/**
 * The star's POINT angle: the sharper of its two alternating interior angles. An isotoxal star
 * alternates apex α with a reflex dent, and `interiorAngleDeg` returns the non-reflex reading of both,
 * so the minimum over all vertices is α.
 */
function starApexDeg(vs: number[][]): number {
	let min = Infinity;
	for (let i = 0; i < vs.length; i++) min = Math.min(min, interiorAngleDeg(vs, i));
	return Math.round(min);
}

/**
 * The PERIOD p of a tile's interior-angle word: the smallest p dividing the corner count with
 * angle[i] == angle[i % p] all the way round. It is the parameter that separates tile families the
 * side count alone conflates:
 *
 *   p = 1  regular — every angle equal (the square, the dodecagon)
 *   p = 2  alternating — the isotoxal stars, and the period-2 composites like cx4-2.4.2.4, whose
 *          60/120/60/120 word makes it emphatically not a square even though both have n = 4
 *   p = 3  the period-3 equilateral tiles (e3-6-135.120.105 and friends)
 *   p ≥ 4  the longer composite words (cx7-3.5.4.5.3.5.5 has p = 7)
 *
 * Derived from the shipped render cell's geometry, so it needs no data migration and classifies every
 * shelf already in the atlas, not only the ones exported after this landed. Angles are rounded to whole
 * degrees, which the corpus lands on exactly; `interiorAngleDeg` reports a reflex dent by its non-reflex
 * reading, and that is fine here because it is consistent around the word.
 */
export function polygonPeriodOf(vs: number[][]): number {
	const n = vs.length;
	if (n < 3) return 1;
	const a = Array.from({ length: n }, (_, i) => Math.round(interiorAngleDeg(vs, i)));
	for (let p = 1; p <= n; p++) {
		if (n % p !== 0) continue;
		let ok = true;
		for (let i = 0; i < n && ok; i++) if (a[i] !== a[i % p]) ok = false;
		if (ok) return p;
	}
	return n;
}

/** Shared results for a cell with no polygons, so 342k decoration rows cost nothing to answer. */
const EMPTY_SPECIES: string[] = Object.freeze([]) as string[];
const EMPTY_PERIODS: number[] = Object.freeze([]) as number[];

const periodCache = new Map<string, number[]>();

/** Distinct angle-word periods among a tiling's tiles, ascending. `[1]` for a purely regular tiling. */
export function tilePeriodsOf(t: ReferenceTiling): number[] {
	// Shipped field first, same reasoning as polygonSpeciesOf — `anglePeriodOptions` is the other
	// ungated memo over the whole corpus. It measures cheap (84 ms) only because polygonTokenCounts
	// runs first and has already paid to materialise every cell; on its own it costs the same 18 s.
	if (t.tilePeriods) return t.tilePeriods;
	const polys = (t.renderCell?.cellPolygons ?? []) as CellPoly[];
	if (!polys.length) return EMPTY_PERIODS;
	const hit = periodCache.get(t.id);
	if (hit) return hit;
	const arr = periodsFromPolys(polys);
	periodCache.set(t.id, arr);
	return arr;
}

/**
 * The geometry walk behind `tilePeriodsOf`, without the field short-circuit or the cache.
 *
 * Exported so the build-time annotator writes exactly what the runtime would have computed. Keeping
 * one implementation is the point: a second copy in a script is how the shipped field and the
 * fallback drift, and the drift would be invisible — both answers look plausible.
 */
export function periodsFromPolys(polys: CellPoly[]): number[] {
	const out = new Set<number>();
	for (const raw of polys) {
		const pts = raw?.vertices ?? raw?.v;
		if (!pts?.length) continue;
		out.add(polygonPeriodOf(toPairs(pts)));
	}
	return [...out].sort((x, y) => x - y);
}

/** "1" / "2" / "3" → the picker's caption for an angle-word period. */
export function periodLabel(p: number): string {
	if (p === 1) return "p1 · regular";
	if (p === 2) return "p2 · alternating";
	return `p${p}`;
}

const cache = new Map<string, string[]>();

/** A cell polygon as the atlas ships it — `v` or `vertices`, points as pairs or as {x,y}. */
export type CellPoly = {
	n?: number;
	star?: boolean;
	v?: (number[] | { x: number; y: number })[];
	vertices?: (number[] | { x: number; y: number })[];
};

function toPairs(pts: (number[] | { x: number; y: number })[]): number[][] {
	return pts.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y]));
}

/** Distinct species keys of a tiling, sorted regular-then-star. Prefers the shipped field. */
export function polygonSpeciesOf(t: ReferenceTiling): string[] {
	// Precomputed at build time (lib/services/polygonFacets.ts) and shipped on the record. Reading it
	// is the whole point: /library's `polygonTokenCounts` memo calls this over the ENTIRE loaded
	// corpus on every filter change, and walking `renderCell` there fires the codec's lazy accessor
	// on every record it touches. Measured on the eager Euclidean scope: 18.0 s of main thread and
	// +89.8 MB retained, against 47 ms before the cells went lazy. The memo cannot be gated instead —
	// its own output feeds `availablePolygons`, which is what `showPolygons` tests.
	if (t.polygonSpecies) return t.polygonSpecies;
	const polys = (t.renderCell?.cellPolygons ?? []) as CellPoly[];
	// Decoration rows (freedraw, colorings) all share one FREEDRAW_EMPTY_CELL, so there is nothing to
	// walk and nothing worth remembering. Caching them anyway cost a Map entry per record — 52 MB
	// across the 342k decoration rows that `polygonScope` sweeps in on a default /library load.
	if (!polys.length) return EMPTY_SPECIES;
	const hit = cache.get(t.id);
	if (hit) return hit;
	const arr = speciesFromPolys(polys);
	cache.set(t.id, arr);
	return arr;
}

/** The geometry walk behind `polygonSpeciesOf`. Shared with the annotator, same reason as above. */
export function speciesFromPolys(polys: CellPoly[]): string[] {
	const out = new Set<string>();
	for (const raw of polys) {
		const pts = raw?.vertices ?? raw?.v;
		if (!pts?.length || raw.n == null) continue;
		if (raw.star) out.add(`${raw.n}*${starApexDeg(toPairs(pts))}`);
		else out.add(String(raw.n));
	}
	return [...out].sort(speciesCompare);
}

/** Split a species key into its parts. `alpha` is null for a regular polygon. */
export function parseSpecies(key: string): { n: number; star: boolean; alpha: number | null } | null {
	const m = /^(\d+)(?:\*(\d+))?$/.exec(key.trim());
	if (!m) return null;
	const n = parseInt(m[1], 10);
	if (!Number.isFinite(n)) return null;
	return { n, star: m[2] != null, alpha: m[2] != null ? parseInt(m[2], 10) : null };
}

/** Regular first by side count, then stars by fold and point angle — the picker's reading order. */
export function speciesCompare(a: string, b: string): number {
	const pa = parseSpecies(a), pb = parseSpecies(b);
	if (!pa || !pb) return a.localeCompare(b);
	if (pa.star !== pb.star) return pa.star ? 1 : -1;
	return pa.n - pb.n || (pa.alpha ?? 0) - (pb.alpha ?? 0);
}

/** "12-gon" / "6★ 60°" — matches the /theory/tiles card captions. */
export function speciesLabel(key: string): string {
	const p = parseSpecies(key);
	if (!p) return key;
	return p.star ? `${p.n}★ ${p.alpha}°` : `${p.n}-gon`;
}

/**
 * Does a tiling carry this key? Accepts both granularities so a link built before species existed
 * still resolves: a bare fold ("6*") matches every α of that fold, a species ("6*60") only its own.
 */
export function tilingHasSpecies(t: ReferenceTiling, key: string): boolean {
	const k = key.trim();
	if (k.endsWith("*")) {
		const fold = k.slice(0, -1);
		return polygonSpeciesOf(t).some((s) => s.startsWith(`${fold}*`));
	}
	return polygonSpeciesOf(t).includes(k);
}
