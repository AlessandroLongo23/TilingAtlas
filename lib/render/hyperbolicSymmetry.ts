// The most symmetric point of a hyperbolic tiling, read off its darts: where the disk opens.
//
// A dart with an orientation is a flag of the tiling. Two flags of the universal cover are related by a
// symmetry exactly when the rooted, labelled maps read from them agree, which on the finite quotient is
// Moore equivalence of the automaton with states (dart, ±), letters {rneig, glue} and the face size
// (colour, angle, length, drawn flag where a record has them) as output. The mirrored state reads the
// same map with the rotation reversed. A feature's stabiliser order is the number of its flags
// equivalent to one of them. No geometry and no group enumeration: 0.08 ms a record on average over the
// 2.26M shipped tilings (experiments/results/hyp-centre-symmetry-2026-10-10.log).

import { type Darts, interiorAngle } from "@/lib/render/hyperbolicDevelopClient";

export interface Feature {
	kind: "V" | "E" | "F";
	/** Stabiliser order, and whether it holds a reflection (dihedral) or only rotations (cyclic). */
	order: number;
	mirror: boolean;
	/** Polygon size for a face, degree for a vertex. */
	size: number;
	/** Symmetry orbit of the feature (the least flag class on it). */
	orbit: number;
	/** A dart on it. */
	dart: number;
}

/** Stabilisers of the seed vertex and of every vertex, edge and finite face of the quotient. */
export function dartSymmetry(darts: Darts, edge: number): { seed: Feature; features: Feature[]; classes: number } {
	const { rneig, glue, lvert } = darts;
	const n = rneig.length;
	const rinv = new Int32Array(n);
	for (let h = 0; h < n; h++) rinv[rneig[h]] = h;
	const alpha = (h: number) => (darts.alpha ? darts.alpha[h] : interiorAngle(lvert[rneig[h]], edge));

	// States: h is (h, +), n + h is (h, −). The − state reads the mirror image, so its wedge is the one
	// behind the dart.
	const N = 2 * n;
	const R = new Int32Array(N);
	const G = new Int32Array(N);
	let cls = new Int32Array(N);
	const ids = new Map<string, number>();
	const q = (x: number | undefined) => (x === undefined ? "" : Math.round(x * 1e6));
	for (let h = 0; h < n; h++) {
		R[h] = rneig[h];
		G[h] = glue[h];
		R[n + h] = n + rinv[h];
		G[n + h] = n + glue[h];
		const b = rinv[h];
		const keys = [
			`${lvert[rneig[h]]}|${darts.faceColor?.[h] ?? ""}|${q(darts.alpha?.[h])}|${q(darts.elen?.[h])}|${darts.drawn?.[h] ?? ""}`,
			`${lvert[h]}|${darts.faceColor?.[b] ?? ""}|${q(darts.alpha?.[b])}|${q(darts.elen?.[h])}|${darts.drawn?.[h] ?? ""}`,
		];
		keys.forEach((k, s) => {
			let id = ids.get(k);
			if (id === undefined) ids.set(k, (id = ids.size));
			cls[s * n + h] = id;
		});
	}
	let count = ids.size;
	const next = new Map<number, number>();
	for (;;) {
		next.clear();
		const out = new Int32Array(N);
		for (let s = 0; s < N; s++) {
			const key = (cls[s] * N + cls[R[s]]) * N + cls[G[s]];
			let id = next.get(key);
			if (id === undefined) next.set(key, (id = next.size));
			out[s] = id;
		}
		cls = out;
		if (next.size === count) break;
		count = next.size;
	}

	const feature = (kind: Feature["kind"], states: number[], mult: number, size: number, dart: number): Feature => {
		const c = cls[states[0]];
		let same = 0;
		let orbit = Infinity;
		for (const s of states) {
			if (cls[s] === c) same++;
			if (cls[s] < orbit) orbit = cls[s];
		}
		// A reflection fixing the feature carries the root flag to a flag of the other orientation.
		const mirror = states.some((s) => cls[s] === c && s >= n !== states[0] >= n);
		return { kind, order: same * mult, mirror, size, orbit, dart };
	};

	const features: Feature[] = [];
	let seed = darts.seed ?? 0;
	for (let i = 0; i < n && lvert[rneig[seed]] === 2; i++) seed = rneig[seed];
	let seedFeature: Feature | null = null;
	const seenV = new Uint8Array(n);
	const seenF = new Uint8Array(n);
	for (let h0 = 0; h0 < n; h0++) {
		if (!seenV[h0]) {
			const cyc: number[] = [];
			let turn = 0;
			let real = 0;
			for (let h = h0; !seenV[h]; h = rneig[h]) {
				seenV[h] = 1;
				cyc.push(h);
				turn += alpha(h);
				if (lvert[rneig[h]] !== 2) real++;
			}
			const mult = Math.round((2 * Math.PI) / turn);
			const f = feature("V", [...cyc, ...cyc.map((h) => n + h)], mult, real * mult, h0);
			features.push(f);
			if (cyc.includes(seed)) seedFeature = f;
		}
		if (glue[h0] >= h0) {
			const g = glue[h0];
			const f = g === h0 ? feature("E", [h0, n + h0], 2, 2, h0) : feature("E", [h0, g, n + h0, n + g], 1, 2, h0);
			features.push(f);
		}
		if (!seenF[h0]) {
			const ring: number[] = [];
			for (let h = h0; !seenF[h]; h = glue[rneig[h]]) {
				seenF[h] = 1;
				ring.push(h);
			}
			const p = lvert[rneig[h0]];
			if (p > 2) features.push(feature("F", [...ring, ...ring.map((h) => n + rneig[h])], p / ring.length, p, h0));
		}
	}
	return { seed: seedFeature!, features, classes: count };
}

/** Where a tiling opens: the feature with the largest stabiliser. A tie goes to a face over a vertex over
 *  an edge, then to the larger face, then to the lower dart. */
export function bestCentre(features: Feature[]): Feature {
	const rank = { F: 2, V: 1, E: 0 };
	return features.reduce((a, f) => {
		const d =
			f.order - a.order || rank[f.kind] - rank[a.kind] || (f.kind === "F" ? f.size - a.size : 0) || a.dart - f.dart;
		return d > 0 ? f : a;
	});
}
