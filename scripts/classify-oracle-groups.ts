/* Exploration/validation: classify every reconstructable oracle tiling (k≤2) with the current
 * analyzeSymmetry and print its wallpaper group + lattice shape. Used to (a) find a p4g / p31m case
 * for the exact-discriminator FALSE-branch test, and (b) sanity-check the classifier catalogue-wide.
 *   pnpm tsx scripts/classify-oracle-groups.ts
 */
import { getActiveRing } from '@/classes/Cyclotomic';
import { Cyclotomic } from '@/classes/Cyclotomic';
import { analyzeSymmetry } from '@/lib/classes/symmetry/WallpaperSymmetry';
import { loadOracle, reconstructOracleCell } from './oracle-match';

const ring = getActiveRing();

function seedOf(cellPolygons: { exactVertices?: Cyclotomic[] }[]): Cyclotomic[] {
	const byKey = new Map<string, Cyclotomic>();
	for (const p of cellPolygons) for (const v of p.exactVertices ?? []) if (!byKey.has(v.key())) byKey.set(v.key(), v);
	return [...byKey.values()];
}

const oracle = loadOracle();
const groups: Record<string, string[]> = {};
for (const k of [1, 2]) {
	const entries = Object.entries(oracle).filter(([key]) => new RegExp(`^t${k}\\d\\d\\d$`).test(key));
	for (const [tCode, o] of entries) {
		const rec = reconstructOracleCell(tCode, o);
		if ('error' in rec) {
			console.log(`${tCode}: SKIP (${rec.error})`);
			continue;
		}
		const seed = seedOf(rec.cell.cellPolygons);
		const [T1, T2] = rec.cell.basisExact;
		const d = analyzeSymmetry(ring, T1, T2, seed);
		(groups[d.group] ??= []).push(tCode);
		console.log(`${tCode}: ${d.group.padEnd(4)}  ${d.latticeShape}`);
	}
}
console.log('\n=== group histogram ===');
for (const g of Object.keys(groups).sort()) console.log(`${g.padEnd(5)} ${groups[g].length}  ${groups[g].join(' ')}`);
