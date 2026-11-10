// Every vertex of a developed float cell exactly, in Z[zeta_24]: the edges of its tiles are unit steps in one of 24
// directions, so a walk along them from one corner gives each vertex as a sum of roots of unity.
import { CyclotomicRing, Cyclotomic } from "@/classes/Cyclotomic";

export type P = { x: number; y: number };
const ring = CyclotomicRing.create(24);
export const key = (q: P) => `${Math.round(q.x * 1e6)},${Math.round(q.y * 1e6)}`;

/**
 * The tiles of a cell folded into the base parallelogram, counter-clockwise (`base`, floats); the exact position of
 * any vertex of them or of their near translates (`at`, the first tile's first corner at 0); an edge's direction in
 * 15-degree steps (`dirOf`); and the two periods exactly. Throws on an edge that is not a unit step in such a direction.
 */
export function exactWalk(polys: number[][][], basis: number[][]) {
	const [u, v] = basis.map(([x, y]) => ({ x, y }));
	const det = u.x * v.y - u.y * v.x;
	// fold every tile into the base parallelogram: a developed cell need not be compact
	const base = polys.map((vs) => {
		const cx = vs.reduce((s, q) => s + q[0], 0) / vs.length,
			cy = vs.reduce((s, q) => s + q[1], 0) / vs.length;
		const i = Math.floor((cx * v.y - cy * v.x) / det),
			j = Math.floor((u.x * cy - u.y * cx) / det);
		const pts = vs.map(([x, y]) => ({ x: x - i * u.x - j * v.x, y: y - i * u.y - j * v.y }));
		const area = pts.reduce((s, q, t) => s + q.x * pts[(t + 1) % pts.length].y - q.y * pts[(t + 1) % pts.length].x, 0);
		return area > 0 ? pts : pts.reverse(); // counter-clockwise, as fromAnchorAndDirExact walks
	});
	// unit edges of the base tiles and their translates, each with its direction in 15° steps
	const adj = new Map<string, { to: string; d: number }[]>();
	const pos = new Map<string, P>();
	const dirOf = (a: P, b: P) => {
		const t = (Math.atan2(b.y - a.y, b.x - a.x) * 12) / Math.PI;
		const d = Math.round(t);
		if (Math.abs(t - d) > 1e-6 || Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 1) > 1e-6)
			throw new Error("not a unit edge in a 15° direction");
		return ((d % 24) + 24) % 24;
	};
	for (let i = -2; i <= 2; i++)
		for (let j = -2; j <= 2; j++)
			for (const pts of base)
				pts.forEach((a0, t) => {
					const a = { x: a0.x + i * u.x + j * v.x, y: a0.y + i * u.y + j * v.y };
					const b0 = pts[(t + 1) % pts.length],
						b = { x: b0.x + i * u.x + j * v.x, y: b0.y + i * u.y + j * v.y };
					const d = dirOf(a, b);
					pos.set(key(a), a);
					pos.set(key(b), b);
					(adj.get(key(a)) ?? adj.set(key(a), []).get(key(a))!).push({ to: key(b), d });
					(adj.get(key(b)) ?? adj.set(key(b), []).get(key(b))!).push({ to: key(a), d: (d + 12) % 24 });
				});
	// every vertex exactly: a walk from one corner of the first tile, which sits at 0
	const exact = new Map<string, Cyclotomic>([[key(base[0][0]), Cyclotomic.ZERO(ring)]]);
	const queue = [key(base[0][0])];
	while (queue.length) {
		const a = queue.shift()!;
		for (const { to, d } of adj.get(a)!)
			if (!exact.has(to)) {
				exact.set(to, exact.get(a)!.add(Cyclotomic.zeta(ring, d)));
				queue.push(to);
			}
	}
	const at = (q: P) => {
		const z = exact.get(key(q));
		if (!z) throw new Error("a vertex the walk did not reach");
		return z;
	};
	const period = (w: P) => at({ x: base[0][0].x + w.x, y: base[0][0].y + w.y }).sub(at(base[0][0]));
	return { base, at, dirOf, period: [period(u), period(v)] };
}
