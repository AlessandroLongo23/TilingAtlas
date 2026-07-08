/* Precompute the exact wallpaper group + Bravais lattice shape for every certified catalogue tiling,
 * into public/symmetry-index.json (canonicalKey → { group, latticeShape }). This is the wallpaper
 * group as a STORED characterization attribute — computed once in exact ℤ[ζ₂₄] via analyzeSymmetry,
 * alongside k and the polygon family. Any tiling that fails to classify is logged LOUDLY (a
 * characterization gap is a finding, not a silent skip). Doubles as the catalogue-wide validation pass.
 *
 *   pnpm tsx scripts/precompute-symmetry.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { seedFromCell } from '@/lib/services/cellCodecService';
import { analyzeSymmetry } from '@/lib/classes/symmetry/WallpaperSymmetry';
import type { LatticeShape, WallpaperGroup } from '@/lib/classes/symmetry/types';
import { loadSnapshot } from '../figures/snapshot';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);

type Entry = { group: WallpaperGroup; latticeShape: LatticeShape; k: number };
const index: Record<string, Entry> = {};
const failures: { canonicalKey: string; k: number; error: string }[] = [];
const hist: Record<string, number> = {};

const snap = loadSnapshot();
console.error(`--- classifying ${snap.tilings.length} certified tilings ---`);
for (const t of snap.tilings) {
	try {
		const { T1, T2, seed } = seedFromCell(ring, t.cellCodec);
		const d = analyzeSymmetry(ring, T1, T2, seed);
		index[t.canonicalKey] = { group: d.group, latticeShape: d.latticeShape, k: t.k };
		hist[d.group] = (hist[d.group] ?? 0) + 1;
	} catch (e) {
		failures.push({ canonicalKey: t.canonicalKey, k: t.k, error: e instanceof Error ? e.message : String(e) });
		console.error(`  ⚑ ${t.canonicalKey} (k=${t.k}): FAILED to classify — ${e instanceof Error ? e.message : e}`);
	}
}

const outPath = path.join(process.cwd(), 'public', 'symmetry-index.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(index) + '\n');

console.error('\n=== wallpaper group histogram ===');
for (const g of Object.keys(hist).sort()) console.error(`  ${g.padEnd(5)} ${hist[g]}`);
console.error(`\n★ wrote ${path.relative(process.cwd(), outPath)}: ${Object.keys(index).length} classified, ${failures.length} failed`);
if (failures.length > 0) {
	console.error('⚑ UNCLASSIFIED tilings (characterization gap — investigate, do NOT ship silently):');
	for (const f of failures) console.error(`    ${f.canonicalKey} (k=${f.k}): ${f.error}`);
	process.exitCode = 1;
}
