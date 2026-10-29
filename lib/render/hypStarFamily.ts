// Star families on the hyperbolic shelf. A star's point angle is free in H², only the plane pins it, so a
// tiling's unknowns are its edge l and one point per star type, held by one closure per quotient vertex
// cycle. When that leaves one degree of freedom the slider is one star's point (`param`) and Newton solves
// the edge and any other star's point. The TS twin of family_member in tools/ctrnact-oracle/hyp_geom.py,
// so /play can re-solve the tiling at every slider position.
//
// The darts carry what each turn IS (`starKind`: 0 regular, 1 point, 2 dent), its star type (`starParam`,
// absent with one star), and lvert[rneig[h]] is that face's side count. The shipped `alpha` and `edge`
// are the member at the default; they also fix how many times each quotient cycle wraps its vertex, which
// does not change along the family.

import { type Darts, interiorAngle } from "@/lib/render/hyperbolicDevelopClient";
import type { ParametricCellData } from "@/lib/utils/paramCell";

export interface HypFamily {
	/** [lo, hi]: the point angles at which every dent is still reflex, in degrees, open at both ends. */
	alphaRangeDegOpen: number[];
	defaultAlphaDeg: number;
	/** The star type whose point the slider is (darts.starParam); absent = 0. */
	param?: number;
}

/** Dent of the isotoxal star n* with point α and edge l: the triangle centre–point–dent has angles π/n,
 *  α/2, β/2 with l opposite the centre, solved on the branch that is the Euclidean dent at l = 0. On the
 *  sphere (`sphere`) cos l replaces cosh l; NaN where no such star exists. Also a convex isotoxal face's
 *  second angle. */
export function starDent(n: number, alpha: number, l: number, sphere = false): number {
	const A = Math.PI / n;
	const x = Math.sin(alpha / 2) * (sphere ? Math.cos(l) : Math.cosh(l));
	const y = Math.cos(alpha / 2);
	return 2 * (Math.atan2(y, x) + Math.asin(Math.cos(A) / Math.hypot(x, y)));
}

function turns(d: Darts, pts: number[], l: number): number[] {
	const kinds = d.starKind!;
	return d.rneig.map((r, h) => {
		const k = kinds[h];
		const a = pts[d.starParam?.[h] ?? 0];
		return k === 0 ? interiorAngle(d.lvert[r], l) : k === 1 ? a : starDent(d.lvert[r] / 2, a, l);
	});
}

/** Solve the n×n system A·x = b in place (Gaussian elimination, partial pivoting); n is at most a few. */
function solve(A: number[][], b: number[]): number[] {
	const n = b.length;
	for (let c = 0; c < n; c++) {
		let p = c;
		for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
		[A[c], A[p], b[c], b[p]] = [A[p], A[c], b[p], b[c]];
		for (let r = c + 1; r < n; r++) {
			const f = A[r][c] / A[c][c];
			for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
			b[r] -= f * b[c];
		}
	}
	const x = new Array<number>(n).fill(0);
	for (let r = n - 1; r >= 0; r--) x[r] = (b[r] - A[r].reduce((s, v, k) => (k > r ? s + v * x[k] : s), 0)) / A[r][r];
	return x;
}

/** The family member whose slider star has point `alphaDeg`: its darts (turns re-solved) and edge. Continued
 *  from the shipped member in steps of at most 0.25° so damped Gauss–Newton stays on the shipped branch;
 *  null when it stops converging or a dent stops being reflex. */
export function familyMember(
	p: { darts: Darts; edge: number; family?: HypFamily },
	alphaDeg: number,
): { darts: Darts; edge: number } | null {
	const d = p.darts;
	if (!d.starKind || !d.alpha) return null;
	const j = p.family?.param ?? 0;
	const pts: number[] = [];
	d.starKind.forEach((k, h) => {
		if (k === 1) pts[d.starParam?.[h] ?? 0] = d.alpha![h];
	});
	const seen = new Uint8Array(d.rneig.length);
	const cycles: number[][] = [];
	for (let h0 = 0; h0 < d.rneig.length; h0++) {
		const c: number[] = [];
		for (let h = h0; !seen[h]; h = d.rneig[h]) {
			seen[h] = 1;
			c.push(h);
		}
		if (c.length) cycles.push(c);
	}
	const wraps = cycles.map((c) => Math.round((2 * Math.PI) / c.reduce((s, h) => s + d.alpha![h], 0)));
	// x = [edge, every point but the slider's]; `full` puts the slider's back in its slot.
	const full = (x: number[], aj: number) => [...x.slice(1, j + 1), aj, ...x.slice(j + 1)];
	const res = (x: number[], aj: number) => {
		const t = turns(d, full(x, aj), x[0]);
		return cycles.map((c, i) => wraps[i] * c.reduce((s, h) => s + t[h], 0) - 2 * Math.PI);
	};
	let x = [p.edge, ...pts.slice(0, j), ...pts.slice(j + 1)];
	const a0 = pts[j];
	const a1 = (alphaDeg * Math.PI) / 180;
	const steps = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 720)));
	for (let s = 1; s <= steps; s++) {
		const aj = a0 + ((a1 - a0) * s) / steps;
		let it = 0;
		for (let r = res(x, aj); Math.max(...r.map(Math.abs)) > 1e-12; r = res(x, aj)) {
			if (++it > 50) return null;
			// Gauss–Newton: the normal equations of the (consistent, possibly overdetermined) closure system.
			const J = x.map((_, k) => {
				const e = x.map((v, i) => (i === k ? v + 1e-7 : v));
				const f = x.map((v, i) => (i === k ? v - 1e-7 : v));
				const rp = res(e, aj);
				const rm = res(f, aj);
				return rp.map((v, i) => (v - rm[i]) / 2e-7);
			});
			const JtJ = J.map((a) => J.map((b) => a.reduce((s, v, i) => s + v * b[i], 0)));
			const dx = solve(
				JtJ,
				J.map((a) => a.reduce((s, v, i) => s + v * r[i], 0)),
			);
			const damp = Math.min(1, 0.5 / Math.max(1e-300, ...dx.map(Math.abs))); // never jump more than 0.5 at once
			x = x.map((v, k) => v - damp * dx[k]);
		}
		if (!(x[0] > 0)) return null;
	}
	const t = turns(d, full(x, a1), x[0]);
	if (t.some((v, h) => d.starKind![h] === 2 && !(v > Math.PI))) return null;
	return { darts: { ...d, alpha: t }, edge: x[0] };
}

/** The slider /play already draws for the Euclidean families, fed this family's one parameter. Only
 *  `params` is read for a hyperbolic record; the cell fields stay empty because no flat canvas mounts. */
export function hypFamilyParamCell(f: HypFamily): ParametricCellData {
	const range: [number, number] = [f.alphaRangeDegOpen[0], f.alphaRangeDegOpen[1]];
	const p = {
		name: "α",
		alpha0Deg: f.defaultAlphaDeg,
		deltaRangeDeg: range,
		alphaRangeDegOpen: range,
		defaultAlphaDeg: f.defaultAlphaDeg,
	};
	return { params: [p], cellPolygons: [], basis: [[], []] } as ParametricCellData;
}
