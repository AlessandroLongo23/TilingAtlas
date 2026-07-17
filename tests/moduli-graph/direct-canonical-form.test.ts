import { describe, it, expect } from 'vitest';
import { nKeyOfSymbol, nKeyOfSymbolDirect } from '@/classes/algorithm/canonicalFormN';

type Vec = number[];
// reflection map used inside the canonical form (conj on {1,ω,ω²,ω³})
const conj = (v: Vec): Vec => [v[0] + v[2], v[1], -v[2], -v[1] - v[3]];
const mulw = (v: Vec): Vec => [-v[3], v[0], v[1] + v[3], v[2]];

// 3^6 = ctrnact-01_3-6a-1 (achiral)
const TRI: Vec[] = [[-1, 0, 1, 0], [1, 0, 0, 0], [0, 0, 0, 0]];

// ctrnact-01_36-5b-1 (snub trihexagonal 3.3.3.3.6 — chiral)
const SNUB: Vec[] = [
	[1, 0, 2, 0], [-3, 0, 1, 0],
	[-2, 0, 1, 0], [-2, 0, 2, 0], [-1, 0, 1, 0], [-1, 0, 2, 0], [0, 0, 0, 0], [0, 0, 2, 0],
];

describe('nKeyOfSymbolDirect', () => {
	it('is rotation-invariant (3^6 vs a ω-rotated copy)', () => {
		const rot = TRI.map(mulw);
		expect(nKeyOfSymbolDirect(rot)).toBe(nKeyOfSymbolDirect(TRI));
	});

	it('collapses the mirror of an achiral tiling (3^6)', () => {
		const refl = TRI.map(conj);
		expect(nKeyOfSymbolDirect(refl)).toBe(nKeyOfSymbolDirect(TRI));
	});

	it('both keys are defined (non-null) on 3^6', () => {
		expect(nKeyOfSymbolDirect(TRI)).not.toBeNull();
		expect(nKeyOfSymbol(TRI)).not.toBeNull();
	});

	it('splits a chiral tiling from its mirror (direct key), while the full key merges them', () => {
		expect(nKeyOfSymbolDirect(SNUB)).not.toBe(nKeyOfSymbolDirect(SNUB.map(conj)));
		expect(nKeyOfSymbol(SNUB)).toBe(nKeyOfSymbol(SNUB.map(conj)));
	});
});
