/**
 * Sub Rosa edge word Σ(n) and scaling factor (Kari & Rissanen 2016, §3-4).
 *
 * Σ(n) is the sequence of angle-labels that a super-rhomb edge bisects. It is defined by a
 * self-referential recursion and matches the paper's Table 1 (odd n) and Table 2 (even n)
 * exactly, including Σ(9). Everything downstream (super-rhomb boundary, dissection) is derived
 * from Σ(n) — no figure is transcribed.
 */

/** The underlined base run: odd n → [1,3,…,n−2]; even n → [0,2,…,n−2]. */
function under(k: number, odd: boolean): number[] {
	const start = odd ? 1 : 0;
	const out: number[] = [];
	for (let a = start; a <= k - 2; a += 2) out.push(a);
	return out;
}

/**
 * Σ(n): the edge substitution word. First half = under(n) followed by the reversed base runs
 * of Σ(3),Σ(5),…,Σ(n−2) (odd) / Σ(2),…,Σ(n−2) (even); second half = reverse of the first.
 * Σ(5) = [1,3,1,1,3,1]; Σ(7) = [1,3,5,1,3,1,1,3,1,5,3,1].
 */
export function sigma(n: number): number[] {
	if (n < 2) throw new Error(`sigma: n must be ≥ 2 (got ${n})`);
	const odd = n % 2 === 1;
	const first = under(n, odd);
	for (let k = odd ? 3 : 2; k <= n - 2; k += 2) {
		first.push(...under(k, odd).reverse());
	}
	return first.concat([...first].reverse());
}

/**
 * Linear scaling factor S(n) (edge length of a super-rhomb in unit edges).
 * Odd n: cos(π/2n)/sin²(π/2n). Even n: 2/(1−cos(π/n)). S(5) ≈ 9.9596, S(7) ≈ 19.6893.
 */
export function scalingFactor(n: number): number {
	if (n % 2 === 1) {
		const h = Math.PI / (2 * n);
		return Math.cos(h) / (Math.sin(h) * Math.sin(h));
	}
	return 2 / (1 - Math.cos(Math.PI / n));
}

/** Prototile angles for symmetry n: rhombs (x, n−x), x = 1..⌊n/2⌋, acute angle xπ/n. */
export function prototileAngles(n: number): { x: number; acuteDeg: number; obtuseDeg: number }[] {
	const out: { x: number; acuteDeg: number; obtuseDeg: number }[] = [];
	for (let x = 1; x <= Math.floor(n / 2); x++) {
		out.push({ x, acuteDeg: (x * 180) / n, obtuseDeg: ((n - x) * 180) / n });
	}
	return out;
}
