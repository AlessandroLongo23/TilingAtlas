import { map } from "./math";

/** The least rotation-or-reflection of a cyclic vertex figure. Numbers by default; pass `cmp` for tokens
 *  that are not plain numbers (star polygons "6*", the library's notation). */
export const canonicalizeVertexFigure = <T = number>(
	ns: T[],
	cmp: (a: T, b: T) => number = (a, b) => (a as number) - (b as number),
): T[] => {
	if (ns.length === 0) return [];
	const candidates: T[][] = [];
	const k = ns.length;
	for (let i = 0; i < k; i++) {
		const rot: T[] = [];
		for (let j = 0; j < k; j++) rot.push(ns[(i + j) % k]);
		candidates.push(rot);
		candidates.push([...rot].reverse());
	}
	candidates.sort((a, b) => {
		for (let i = 0; i < k; i++) {
			const d = cmp(a[i], b[i]);
			if (d !== 0) return d;
		}
		return 0;
	});
	return candidates[0];
};

export const vertexFigureHue = (ns: number[]): number => {
	const canon = canonicalizeVertexFigure(ns);
	let h = 2166136261 >>> 0;
	for (const n of canon) {
		h ^= n;
		h = Math.imul(h, 16777619) >>> 0;
	}
	const avgN = canon.reduce((a, b) => a + b, 0) / Math.max(canon.length, 1);
	const base = map(Math.log(avgN), Math.log(3), Math.log(12), 0, 300);
	const jitter = ((h % 3600) / 3600) * 360;
	return (base + jitter) % 360;
};
