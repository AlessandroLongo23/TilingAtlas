import { describe, it, expect } from 'vitest';
import { VertexConfiguration } from '@/classes/algorithm/VertexConfiguration';
import { SeedConfiguration } from '@/classes/algorithm/SeedConfiguration';
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { cellsCongruent } from '@/classes/algorithm/TilingCongruence';
import { PolygonType, type GeneratorParameters } from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing } from '@/classes/Cyclotomic';
import { serializeCell, deserializeCell } from '../scripts/scoutCodec';

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 8, 12] } };
const ring = computeRing(params);
setActiveRing(ring);
const ex = new TranslationalCellExtractor();

describe('scoutCodec — exact cell serialization round-trips through JSON preserving canonicalKey + congruence', () => {
	// The parallel scout sends cells between processes as JSON. Reconstruction must be EXACT (the merge
	// dedups by congruence + canonicalKey), so a round-trip must leave both invariants unchanged. We test
	// on a mixed-tile cell (3.4.6.4: triangles, squares, a hexagon) — exercises several n and an exact basis.
	for (const name of ['3,4,6,4', '4,4,4,4', '6,6,6', '3,3,3,3,6']) {
		it(`${name}: serialize → JSON → deserialize is canonicalKey- and congruence-identical`, { timeout: 30000 }, () => {
			const { cells } = new PeriodSolver(1).solve(new SeedConfiguration([VertexConfiguration.fromName(name)]), {});
			expect(cells.length).toBe(1);
			const cell = cells[0];

			const wire = JSON.parse(JSON.stringify(serializeCell(cell))); // simulate IPC
			const back = deserializeCell(ring, wire);

			expect(ex.canonicalKey(back.cellPolygons)).toBe(ex.canonicalKey(cell.cellPolygons));
			expect(back.basisExact[0].key()).toBe(cell.basisExact[0].key());
			expect(back.basisExact[1].key()).toBe(cell.basisExact[1].key());
			expect(cellsCongruent(cell, back)).toBe(true);
			expect(back.cellPolygons.length).toBe(cell.cellPolygons.length);
		});
	}
});
