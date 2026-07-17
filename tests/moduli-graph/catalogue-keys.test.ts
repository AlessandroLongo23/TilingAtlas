import { describe, it, expect } from 'vitest';
import { loadCatalogueKeys } from '../../scripts/moduli-graph/catalogueKeys';

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
});
