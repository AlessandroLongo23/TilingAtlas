/**
 * Deterministic atlas sampling for the hyperbolic suites.
 *
 * The shelf grew from 59 tilings to thousands (D-symbol re-count, NOTES §81), so the suites that used
 * to iterate the whole atlas per patch (~0.2–1 s each) now check a seeded sample: stable across runs
 * and atlas insertion order (sorted by id before drawing), so a failure reproduces. Exhaustive
 * certification runs offline instead — scripts/stamp-hyperbolic-certification.ts stamps every patch,
 * and the suites verify stamp accuracy in both directions on the sample.
 */

export function sampleAtlas<T extends { id: string }>(atlas: T[], n: number, seed = 7): T[] {
	const sorted = [...atlas].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	if (sorted.length <= n) return sorted;
	let s = seed;
	const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
	const picked = new Map<string, T>();
	while (picked.size < n) {
		const p = sorted[Math.floor(rnd() * sorted.length)];
		picked.set(p.id, p);
	}
	return [...picked.values()];
}
