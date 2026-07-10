/**
 * dedupeByNKey — the fast hashable-canonical-form (N) dedup that replaces the O(n²)-with-slow-reduce
 * pairwise `dedupeByCongruence` on 12-direction inputs (DEVELOPMENT_NOTES §45). Pins: it agrees with
 * the authoritative pairwise on the partition COUNT, collapses duplicate encodings, routes octagon
 * (out-of-domain) cells through the authoritative fallback, and its opt-in merge guard stays silent
 * on valid input.
 */
import { describe, it, expect } from 'vitest';
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { dedupeByNKey, dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { deserializeCell } from '../scripts/scoutCodec';
import sq44 from './fixtures/cell-44.json';
import tri from './fixtures/cell-tri.json';
import hex666 from './fixtures/cell-666.json';
import t4612 from './fixtures/cell-4612.json';
import oct488 from './fixtures/cell-488.json';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cell = (sc: any) => deserializeCell(ring, sc);
const keyOf = (c: Parameters<typeof dedupeByCongruence>[0][number]) =>
	new TranslationalCellExtractor().canonicalKey(c.cellPolygons);

describe('dedupeByNKey', () => {
	it('gives one class per distinct tiling, matching dedupeByCongruence', () => {
		const cells = [cell(sq44), cell(tri), cell(hex666), cell(t4612)];
		expect(dedupeByNKey(cells, keyOf).length).toBe(4);
		expect(dedupeByNKey(cells, keyOf).length).toBe(dedupeByCongruence(cells, keyOf).length);
	});

	it('collapses duplicate encodings of the same tiling', () => {
		// deserialize each fixture twice → distinct objects, identical geometry → must merge
		const cells = [cell(sq44), cell(sq44), cell(hex666), cell(hex666), cell(tri)];
		expect(dedupeByNKey(cells, keyOf).length).toBe(3);
	});

	it('routes octagon (out-of-N-domain) cells through the authoritative fallback', () => {
		// 4.8.8 returns null from N and must still be deduped, never merged with a 12-direction tiling
		expect(dedupeByNKey([cell(oct488), cell(sq44)], keyOf).length).toBe(2);
		expect(dedupeByNKey([cell(oct488), cell(oct488)], keyOf).length).toBe(1);
	});

	it('merge-guard (PS_MERGECHECK=nkey) stays silent on valid input', () => {
		const prev = process.env.PS_MERGECHECK;
		process.env.PS_MERGECHECK = 'nkey';
		try {
			const cells = [cell(sq44), cell(sq44), cell(tri), cell(hex666), cell(t4612)];
			expect(() => dedupeByNKey(cells, keyOf)).not.toThrow();
			expect(dedupeByNKey(cells, keyOf).length).toBe(4);
		} finally {
			if (prev === undefined) delete process.env.PS_MERGECHECK;
			else process.env.PS_MERGECHECK = prev;
		}
	});
});
