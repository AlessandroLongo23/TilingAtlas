/*
 * star-species-scan.ts — derive the TILE ALPHABET actually used by the star catalogue (k = 1..9).
 *
 * The `family` label of a star tiling ("3.3*.4*.6*.12") records the FOLD of each star but not its point
 * angle, so it cannot answer "which star species does the catalogue use". The shipped render cell can:
 * an isotoxal star's point angle is the sharpest interior angle of its outline, and the corpus lands on
 * whole degrees (same measurement `lib/services/polygonSpecies.ts` relies on for the /theory picker).
 *
 * Reads the three files the star shelf lives in — the eager base atlas (k ≤ 7) plus the k = 8 and k = 9
 * lazy shards (the split `scripts/reshard-star-shards.mjs` made) — and writes one manifest:
 *
 *   experiments/star-oracle/inring-species-k1-9.json
 *
 * Two buckets, because they are not interchangeable:
 *   inRing   n | 24 and α a multiple of 15° — expressible in ℤ[ζ₂₄], so a patch grower can place them.
 *   offRing  everything else: the 9-fold shelf (D = 18, unit 20°) and the 5-fold shelf (D = 20, unit
 *            18°). Those folds do not divide 24 and their angles are not multiples of 15°, so they
 *            cannot be seated in the same ring — recorded here so the exclusion is explicit, not silent.
 *
 * Run:  pnpm tsx scripts/star-species-scan.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const PUBLIC = path.join(process.cwd(), 'public');
const OUT = path.join(process.cwd(), 'experiments', 'star-oracle', 'inring-species-k1-9.json');
// The star shelf's three homes. k ≥ 8 moved to the per-k shards when the base atlas crossed GitHub's
// 100 MB file limit; the loader merges them, so a scan that reads only the base atlas would miss 9,487
// entries (73% of the catalogue).
const FILES = ['reference-atlas.json', 'reference-atlas-k8.json', 'reference-atlas-k9.json'];

type CellPoly = { n?: number; star?: boolean; vertices: number[][] };
type Entry = { id: string; source: string; k: number; family: string; renderCell?: { cellPolygons: CellPoly[] } };

/** Interior angle at vertex i, in degrees, reported by its non-reflex reading (as polygonSpecies does). */
function interiorAngleDeg(vs: number[][], i: number): number {
	const n = vs.length;
	const p = vs[(i - 1 + n) % n], c = vs[i], q = vs[(i + 1) % n];
	const a = Math.atan2(p[1] - c[1], p[0] - c[0]);
	const b = Math.atan2(q[1] - c[1], q[0] - c[0]);
	const d = Math.abs(((b - a) * 180) / Math.PI) % 360;
	return Math.min(d, 360 - d);
}

/** An isotoxal star alternates point α with a reflex dent β; the minimum non-reflex reading is α. */
function starApexDeg(vs: number[][]): number {
	let min = Infinity;
	for (let i = 0; i < vs.length; i++) min = Math.min(min, interiorAngleDeg(vs, i));
	return Math.round(min);
}

interface Rec { kind: 'regular' | 'star'; n: number; apexDeg: number; tiles: number; ks: Set<number>; families: Set<string>; }
const seen = new Map<string, Rec>();
/** Per-tiling species multiset sizes — the evidence for "different stars coexist". */
const diversity = new Map<number, number>();
const mixedExamples: { k: number; family: string; species: string[] }[] = [];
let entries = 0;
const kDist = new Map<number, number>();

for (const f of FILES) {
	const p = path.join(PUBLIC, f);
	if (!fs.existsSync(p)) { console.log(`  ⚑ missing ${f} — skipped (the scan is INCOMPLETE without it)`); continue; }
	const arr = JSON.parse(fs.readFileSync(p, 'utf8')) as Entry[];
	let n = 0;
	for (const t of arr) {
		if (t.source !== 'ctrnact-star') continue;
		n++; entries++;
		kDist.set(t.k, (kDist.get(t.k) ?? 0) + 1);
		const here = new Set<string>();
		for (const poly of t.renderCell?.cellPolygons ?? []) {
			const vs = poly.vertices;
			if (!vs || vs.length < 3) continue;
			const isStar = !!poly.star;
			const n0 = isStar ? vs.length / 2 : vs.length; // a star's outline has 2n corners
			const apex = isStar ? starApexDeg(vs) : 0;
			const key = isStar ? `${n0}*${apex}` : `${n0}`;
			let r = seen.get(key);
			if (!r) { r = { kind: isStar ? 'star' : 'regular', n: n0, apexDeg: apex, tiles: 0, ks: new Set(), families: new Set() }; seen.set(key, r); }
			r.tiles++; r.ks.add(t.k); r.families.add(t.family);
			if (isStar) here.add(key);
		}
		diversity.set(here.size, (diversity.get(here.size) ?? 0) + 1);
		if (here.size >= 4 && mixedExamples.length < 20) mixedExamples.push({ k: t.k, family: t.family, species: [...here].sort() });
	}
	console.log(`  ${f.padEnd(28)} ${String(n).padStart(6)} star entries`);
}

/** In-ring ⟺ the tile is expressible in ℤ[ζ₂₄]: fold divides 24, every corner angle a whole unit of 15°. */
const isInRing = (r: Rec): boolean => 24 % r.n === 0 && (r.kind === 'regular' || r.apexDeg % 15 === 0);

const rows = [...seen.entries()].map(([key, r]) => ({
	key,
	kind: r.kind,
	n: r.n,
	apexDeg: r.apexDeg,
	alphaU: r.kind === 'star' ? r.apexDeg / 15 : 0, // π/12 units; integral only for the in-ring bucket
	tiles: r.tiles,
	kMin: Math.min(...r.ks),
	kMax: Math.max(...r.ks),
	families: r.families.size,
	inRing: isInRing(r),
}));
rows.sort((a, b) => (a.kind === b.kind ? (a.n - b.n || a.apexDeg - b.apexDeg) : a.kind === 'regular' ? -1 : 1));

const inRing = rows.filter((r) => r.inRing);
const offRing = rows.filter((r) => !r.inRing);

const manifest = {
	generatedBy: 'scripts/star-species-scan.ts',
	sources: FILES,
	starEntriesScanned: entries,
	kDistribution: Object.fromEntries([...kDist.entries()].sort((a, b) => a[0] - b[0])),
	note:
		'Species measured from each entry\'s shipped renderCell (the default-α evaluation for a one-parameter ' +
		'family, so an α-family contributes only its representative snapshot). inRing = placeable in ℤ[ζ₂₄].',
	starSpeciesPerTiling: Object.fromEntries([...diversity.entries()].sort((a, b) => a[0] - b[0])),
	mixedExamples,
	inRing,
	offRing,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(manifest, null, '\t'));

console.log(`\n  ${entries} star entries, k = ${Math.min(...kDist.keys())}..${Math.max(...kDist.keys())}`);
console.log(`  distinct star species per tiling: ${[...diversity.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}→${c}`).join('  ')}`);
console.log(`\n  IN-RING (ℤ[ζ₂₄], placeable together) — ${inRing.length} species:`);
console.log(`    regular: ${inRing.filter((r) => r.kind === 'regular').map((r) => r.n).join(', ')}`);
for (const n of [3, 4, 6, 8, 12]) {
	const s = inRing.filter((r) => r.kind === 'star' && r.n === n);
	if (s.length) console.log(`    ${n}*: α = ${s.map((r) => `${r.apexDeg}°`).join(', ')}   (αU = ${s.map((r) => r.alphaU).join(',')})`);
}
console.log(`\n  OFF-RING (different angular grid — excluded from ℤ[ζ₂₄] patches) — ${offRing.length} species:`);
for (const r of offRing) console.log(`    ${r.key.padEnd(8)} ${String(r.tiles).padStart(6)} tiles, k ${r.kMin}..${r.kMax}, ${r.families} families`);
console.log(`\n  → ${path.relative(process.cwd(), OUT)}`);
