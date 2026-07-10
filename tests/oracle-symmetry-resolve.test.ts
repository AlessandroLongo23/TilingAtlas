import { describe, it, expect } from 'vitest';
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { symmetryFromExactSource } from '@/lib/services/oracleSymmetry';
import { WALLPAPER_GROUPS } from '@/lib/classes/symmetry/types';
import type { SerializedCell } from '@/classes/algorithm/cellCodec';
import { loadOracle } from '../scripts/oracle-match';
import ctrnact from '../figures/data/ctrnact.json';
import catalogue from '../figures/data/catalogue-k1-3.json';

describe('symmetryFromExactSource', () => {
	const ring = CyclotomicRing.create(24);
	setActiveRing(ring);

	it('classifies a galebach k=1 seed to one of the 17 groups', () => {
		const [tCode, o] = Object.entries(loadOracle()).find(([key]) => /^t1\d\d\d$/.test(key))!;
		const d = symmetryFromExactSource(ring, tCode, { kind: 'seed', T1: o.T1, T2: o.T2, Seed: o.Seed });
		expect(d).not.toBeNull();
		expect(WALLPAPER_GROUPS).toContain(d!.group);
	});

	it('classifies the reported ctrnact k=7 tiling ctrnact-07_36-4j5_5b2-1', () => {
		const t = (ctrnact as { tilings: { id: string; T1?: number[]; T2?: number[]; Seed?: number[][] }[] })
			.tilings.find((x) => x.id === 'ctrnact-07_36-4j5_5b2-1')!;
		expect(t.T1 && t.T2 && t.Seed).toBeTruthy();
		const d = symmetryFromExactSource(ring, t.id, { kind: 'seed', T1: t.T1!, T2: t.T2!, Seed: t.Seed! });
		expect(d).not.toBeNull();
		expect(WALLPAPER_GROUPS).toContain(d!.group);
	});

	// The kind:'cell' branch carries the atlas's serialized cells (Myers stars + t1002/4.8.8), which have
	// no {T1,T2,Seed} encoding. Exercised here via a certified catalogue cell so it needs no 11.8MB atlas.
	it("classifies a kind:'cell' source (serialized cell path)", () => {
		const t = (catalogue as unknown as { tilings: { canonicalKey: string; cellCodec: SerializedCell | null }[] })
			.tilings.find((x) => x.cellCodec)!;
		const d = symmetryFromExactSource(ring, t.canonicalKey, {
			kind: 'cell',
			cell: t.cellCodec as SerializedCell,
		});
		expect(d).not.toBeNull();
		expect(WALLPAPER_GROUPS).toContain(d!.group);
	});
});
