import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { deserializeCell } from '../../scripts/scoutCodec';
import { holohedry } from '../../lib/classes/algorithm/LatticeEnumerator';
import { loadSnapshot } from '../snapshot';

/**
 * F19 identification + regression guard. The oblique (p2) Bravais class is holohedry == 2 — the
 * lattice's point group is only ±I. This MUST use the exact `holohedry` (Gram-matrix signatures,
 * incl. the centred-rectangular test 2|u·v| = |u|²); a naive "generic parallelogram ⇒ oblique"
 * float check mislabels every centred-rectangular cell and over-counts ~10×. NOTES §12.2: k=3 has
 * exactly two oblique tilings; LatticeEnumerator names them t3046, t3055.
 */
describe('oblique k=3 identification (exact holohedry)', () => {
	it('exactly two k=3 tilings are oblique (hol==2): t3046, t3055', () => {
		const ring = CyclotomicRing.create(24);
		setActiveRing(ring);
		const snap = loadSnapshot();
		const oracle = JSON.parse(
			fs.readFileSync('figures/data/oracle-map.json', 'utf8')
		).matched as Record<string, string>;
		const oblique: string[] = [];
		for (const t of snap.tilings.filter((t) => t.k === 3)) {
			const cell = deserializeCell(ring, t.cellCodec);
			if (holohedry(cell.basisExact[0], cell.basisExact[1]) === 2) {
				oblique.push(oracle[t.canonicalKey] ?? `(unmatched:${t.canonicalKey})`);
			}
		}
		expect(oblique.sort()).toEqual(['t3046', 't3055']);
	});
});
