import { describe, it, expect } from 'vitest';
import { parseCensus, censusToTex } from './censusTable';

const SAMPLE = `k=3  solve-calls=449  files=8
hol | Σ work items | distinct lattices | multiplicity
  2 |        10662 |               620 | 17.2×
  4 |        39019 |              1296 | 30.1×
  8 |         4008 |               225 | 17.8×
 12 |        18586 |               327 | 56.8×
ALL |        72275 |              2468 | 29.3×`;

describe('census parser', () => {
	it('extracts per-holohedry rows + the ALL total', () => {
		const c = parseCensus(SAMPLE);
		expect(c.k).toBe(3);
		expect(c.solveCalls).toBe(449);
		expect(c.rows).toHaveLength(5);
		expect(c.rows[0]).toEqual({ hol: '2', work: 10662, lattices: 620, mult: '17.2×' });
		expect(c.rows[4]).toEqual({ hol: 'ALL', work: 72275, lattices: 2468, mult: '29.3×' });
	});
	it('emits a booktabs tex fragment with a label', () => {
		const tex = censusToTex(parseCensus(SAMPLE));
		expect(tex).toContain('\\begin{table}');
		expect(tex).toContain('\\label{tab:lattice-census-k3}');
		expect(tex).toContain('72275');
	});
});
