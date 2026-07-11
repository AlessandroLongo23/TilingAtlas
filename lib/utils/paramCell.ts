import type { TranslationalCellData } from "@/lib/utils/renderTiling";

// Parametric translational cell for one-parameter (free-alpha) tiling families.
//
// Geometry comes from the formal (symbolic-alpha) development of the family
// (tools/ctrnact-oracle/family_flex.py, 2026-07-11): every vertex position and both basis vectors
// are finite Laurent polynomials in x = e^(i*delta), with coefficients in ZZ[zeta_24] evaluated to
// float. A term [m, re, im] contributes (re + i*im) * e^(i*m*delta); delta = (alphaDeg - alpha0Deg)
// * pi/180 where alpha is the point angle of the family's primary star species. The family is
// PROVEN to tile for every alpha in the open range (the formal closure is alpha-independent), so
// evaluating at any slider position yields a genuine tiling, not an interpolation.
//
// `params` is an array on purpose: higher k may produce multi-parameter families (possibly with
// coupled ranges). That extension would carry m-vectors per term; today length is always 1.
export type ParamTerm = [m: number, re: number, im: number];

export interface ParametricCellData {
	params: {
		name: string;
		alpha0Deg: number; // species point angle of the exported representative (delta = 0)
		deltaRangeDeg: [number, number]; // slider range, trimmed inside the open validity interval
		alphaRangeDegOpen: [number, number]; // mathematical (open) validity interval, for display
		defaultAlphaDeg: number;
	}[];
	cellPolygons: { n: number; star?: boolean; vertices: ParamTerm[][] }[];
	basis: [ParamTerm[], ParamTerm[]];
}

function evalTerms(terms: ParamTerm[], delta: number): [number, number] {
	let x = 0;
	let y = 0;
	for (const [m, re, im] of terms) {
		const c = Math.cos(m * delta);
		const s = Math.sin(m * delta);
		x += re * c - im * s;
		y += re * s + im * c;
	}
	return [x, y];
}

/** Evaluate the family at a slider position; the result is parseBaseCell-ready. */
export function evaluateParamCell(pc: ParametricCellData, alphaDeg: number): TranslationalCellData {
	const p0 = pc.params[0];
	const delta = ((alphaDeg - p0.alpha0Deg) * Math.PI) / 180;
	return {
		cellPolygons: pc.cellPolygons.map((poly) => ({
			n: poly.n,
			...(poly.star ? { star: true } : {}),
			vertices: poly.vertices.map((v) => evalTerms(v, delta)),
		})),
		basis: [evalTerms(pc.basis[0], delta), evalTerms(pc.basis[1], delta)],
	};
}

export function clampAlpha(pc: ParametricCellData, alphaDeg: number): number {
	const p0 = pc.params[0];
	const lo = p0.alpha0Deg + p0.deltaRangeDeg[0];
	const hi = p0.alpha0Deg + p0.deltaRangeDeg[1];
	return Math.min(hi, Math.max(lo, alphaDeg));
}
