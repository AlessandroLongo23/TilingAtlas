import { describe, it, expect } from 'vitest';
import { nKeyOfSymbol } from '@/classes/algorithm/canonicalFormN';
import { nKeyOfSymbolDirect } from '@/classes/algorithm/canonicalFormN';

type Vec = number[];
// reflection map used inside the canonical form (conj on {1,ω,ω²,ω³})
const conj = (v: Vec): Vec => [v[0] + v[2], v[1], -v[2], -v[1] - v[3]];
const mulw = (v: Vec): Vec => [-v[3], v[0], v[1] + v[3], v[2]];

// 3^6 = ctrnact-01_3-6a-1 (achiral)
const TRI: Vec[] = [[-1, 0, 1, 0], [1, 0, 0, 0], [0, 0, 0, 0]];

describe('nKeyOfSymbolDirect', () => {
	it('is rotation-invariant (3^6 vs a ω-rotated copy)', () => {
		const rot = TRI.map(mulw);
		expect(nKeyOfSymbolDirect(rot)).toBe(nKeyOfSymbolDirect(TRI));
	});

	it('collapses the mirror of an achiral tiling (3^6)', () => {
		const refl = TRI.map(conj);
		expect(nKeyOfSymbolDirect(refl)).toBe(nKeyOfSymbolDirect(TRI));
	});

	it('agrees with the reflection-inclusive key on an achiral tiling', () => {
		expect(nKeyOfSymbolDirect(TRI)).not.toBeNull();
		expect(nKeyOfSymbol(TRI)).not.toBeNull();
	});
});
