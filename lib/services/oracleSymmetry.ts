import type { CyclotomicRing } from '@/classes/Cyclotomic';
import { deserializeCell } from '@/classes/algorithm/cellCodec';
import { reconstructOracleCell } from '@/classes/algorithm/oracleCellReconstruct';
import { analyzeSymmetry } from '@/lib/classes/symmetry/WallpaperSymmetry';
import type { SymmetryData } from '@/lib/classes/symmetry/types';
import { seedFromPeriodCell, type ExactCellSource } from '@/lib/services/cellCodecService';

// Exact wallpaper analysis of an oracle tiling from its inline cell (no network). Returns null if a seed
// fails to reconstruct — the caller then shows no overlay (never a crash). The caller must have set the
// active ring to `ring` before calling (analyzeSymmetry and RegularPolygon read exact arith on it).
export function symmetryFromExactSource(
	ring: CyclotomicRing,
	id: string,
	source: ExactCellSource,
): SymmetryData | null {
	let cell;
	if (source.kind === 'seed') {
		const rec = reconstructOracleCell(ring, id, { T1: source.T1, T2: source.T2, Seed: source.Seed });
		if ('error' in rec) return null;
		cell = rec.cell;
	} else {
		cell = deserializeCell(ring, source.cell);
	}
	const { T1, T2, seed } = seedFromPeriodCell(cell);
	return analyzeSymmetry(ring, T1, T2, seed);
}
