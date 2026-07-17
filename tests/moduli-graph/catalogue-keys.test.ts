import { describe, it, expect } from 'vitest';
import { loadCatalogueKeys } from '../../scripts/moduli-graph/catalogueKeys';
import { CyclotomicRing } from '@/classes/Cyclotomic';

describe('loadCatalogueKeys', () => {
	it('assigns a distinct direct key to every k=1 uniform tiling', () => {
		const idx = loadCatalogueKeys();
		expect(idx.byKey.size).toBeGreaterThanOrEqual(10);
		const tri = [...idx.byKey.values()].find((e) => e.id === 'ctrnact-01_3-6a-1');
		expect(tri).toBeTruthy();
	});

	it('records a mirror key for each entry (equal to the direct key for achiral 3^6)', () => {
		const idx = loadCatalogueKeys();
		const tri = [...idx.entries].find((e) => e.id === 'ctrnact-01_3-6a-1')!;
		expect(tri.mirrorKey).toBe(tri.directKey); // 3^6 is achiral
	});

	it('splits the chiral snub trihexagonal from its mirror (directKey != mirrorKey)', () => {
		const idx = loadCatalogueKeys();
		const snub = [...idx.entries].find((e) => e.id === 'ctrnact-01_36-5b-1')!;
		expect(snub.directKey).not.toBe(snub.mirrorKey);
	});

	it('signs 3^6 as the all-triangle configuration', () => {
		const idx = loadCatalogueKeys(CyclotomicRing.create(24));
		const tri = [...idx.entries].find((e) => e.id === 'ctrnact-01_3-6a-1')!;
		expect(tri.signature).toBe('3.3.3.3.3.3');
	});

	it('gives all 10 k=1 uniform tilings distinct signatures', () => {
		const idx = loadCatalogueKeys(CyclotomicRing.create(24));
		const sigs = idx.entries.map((e) => e.signature).filter((s): s is string => s !== null);
		expect(sigs.length).toBe(10); // every entry reconstructed + signed
		expect(new Set(sigs).size).toBe(10); // all distinct — signature can identify each tiling
	});
});
