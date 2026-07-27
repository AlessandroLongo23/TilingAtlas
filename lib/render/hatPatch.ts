// A patch of the hat tiling: the aperiodic monotile of Smith, Myers, Kaplan and Goodman-Strauss
// (2023). One tile shape, used at two handednesses, tiling the plane in only non-periodic ways.
//
// The substitution rules below are a TypeScript port of Craig S. Kaplan's hatviz
// (github.com/isohedral/hatviz, hat.js and geometry.js), BSD 3-Clause, Copyright (c) 2023
// Craig S. Kaplan. The structure is his: four metatiles H, T, P and F, each a small cluster of hats;
// `constructPatch` assembles 29 metatiles into a patch by matching named edges, and
// `constructMetatiles` reads the next generation of H, T, P and F back out of that patch. Iterating
// the pair inflates a supertile as far as wanted, and the hats fall out at the leaves.
//
// The affine transforms are the six entries of a 2x3 matrix, row-major, as in the original.

import { hatOutline } from "@/lib/render/landingPatches";
import type { RawPolygon } from "@/lib/utils/renderTiling";

type Aff = [number, number, number, number, number, number];

interface Pt {
	x: number;
	y: number;
}

const HR3 = 0.8660254037844386;
const IDENT: Aff = [1, 0, 0, 0, 1, 0];

const pt = (x: number, y: number): Pt => ({ x, y });

function inv(T: Aff): Aff {
	const det = T[0] * T[4] - T[1] * T[3];
	return [
		T[4] / det,
		-T[1] / det,
		(T[1] * T[5] - T[2] * T[4]) / det,
		-T[3] / det,
		T[0] / det,
		(T[2] * T[3] - T[0] * T[5]) / det,
	];
}

function mul(A: Aff, B: Aff): Aff {
	return [
		A[0] * B[0] + A[1] * B[3],
		A[0] * B[1] + A[1] * B[4],
		A[0] * B[2] + A[1] * B[5] + A[2],
		A[3] * B[0] + A[4] * B[3],
		A[3] * B[1] + A[4] * B[4],
		A[3] * B[2] + A[4] * B[5] + A[5],
	];
}

const padd = (p: Pt, q: Pt): Pt => pt(p.x + q.x, p.y + q.y);
const psub = (p: Pt, q: Pt): Pt => pt(p.x - q.x, p.y - q.y);

const trot = (ang: number): Aff => {
	const c = Math.cos(ang);
	const s = Math.sin(ang);
	return [c, -s, 0, s, c, 0];
};

const ttrans = (tx: number, ty: number): Aff => [1, 0, tx, 0, 1, ty];

const rotAbout = (p: Pt, ang: number): Aff => mul(ttrans(p.x, p.y), mul(trot(ang), ttrans(-p.x, -p.y)));

const transPt = (M: Aff, P: Pt): Pt => pt(M[0] * P.x + M[1] * P.y + M[2], M[3] * P.x + M[4] * P.y + M[5]);

/** Map the unit interval onto the segment p->q. */
const matchSeg = (p: Pt, q: Pt): Aff => [q.x - p.x, p.y - q.y, p.x, q.y - p.y, q.x - p.x, p.y];

/** Map the segment p1->q1 onto p2->q2. */
const matchTwo = (p1: Pt, q1: Pt, p2: Pt, q2: Pt): Aff => mul(matchSeg(p2, q2), inv(matchSeg(p1, q1)));

/** Intersect the lines through p1->q1 and p2->q2. */
function intersect(p1: Pt, q1: Pt, p2: Pt, q2: Pt): Pt {
	const d = (q2.y - p2.y) * (q1.x - p1.x) - (q2.x - p2.x) * (q1.y - p1.y);
	const uA = ((q2.x - p2.x) * (p1.y - p2.y) - (q2.y - p2.y) * (p1.x - p2.x)) / d;
	return pt(p1.x + uA * (q1.x - p1.x), p1.y + uA * (q1.y - p1.y));
}

// ---------------------------------------------------------------------------------------------

interface Child {
	T: Aff;
	geom: Geom;
}

/** A leaf is one hat; a node is a metatile holding an outline and a list of placed children. */
type Geom = { kind: "hat" } | { kind: "meta"; shape: Pt[]; children: Child[] };

const HAT: Geom = { kind: "hat" };
const HAT_SHAPE: Pt[] = hatOutline().map(([x, y]) => pt(x, y));

const meta = (shape: Pt[]): Extract<Geom, { kind: "meta" }> => ({ kind: "meta", shape, children: [] });

const addChild = (m: Extract<Geom, { kind: "meta" }>, T: Aff, geom: Geom) => {
	m.children.push({ T, geom });
};

/** Corner `i` of child `n`, in the parent's frame. */
function evalChild(m: Extract<Geom, { kind: "meta" }>, n: number, i: number): Pt {
	const ch = m.children[n];
	if (ch.geom.kind !== "meta") throw new Error("evalChild on a leaf");
	return transPt(ch.T, ch.geom.shape[i]);
}

/** Move a metatile so its outline is centred on the origin, carrying the children with it. */
function recentre(m: Extract<Geom, { kind: "meta" }>) {
	let cx = 0;
	let cy = 0;
	for (const p of m.shape) {
		cx += p.x;
		cy += p.y;
	}
	cx /= m.shape.length;
	cy /= m.shape.length;
	m.shape = m.shape.map((p) => padd(p, pt(-cx, -cy)));
	const M = ttrans(-cx, -cy);
	for (const ch of m.children) ch.T = mul(M, ch.T);
}

// --- the four base metatiles: H is four hats, T is one, P and F are two each -------------------

function baseH(): Extract<Geom, { kind: "meta" }> {
	const outline = [pt(0, 0), pt(4, 0), pt(4.5, HR3), pt(2.5, 5 * HR3), pt(1.5, 5 * HR3), pt(-0.5, HR3)];
	const m = meta(outline);
	addChild(m, matchTwo(HAT_SHAPE[5], HAT_SHAPE[7], outline[5], outline[0]), HAT);
	addChild(m, matchTwo(HAT_SHAPE[9], HAT_SHAPE[11], outline[1], outline[2]), HAT);
	addChild(m, matchTwo(HAT_SHAPE[5], HAT_SHAPE[7], outline[3], outline[4]), HAT);
	// The fourth is the reflected hat: the inner matrix has negative determinant.
	addChild(m, mul(ttrans(2.5, HR3), mul([-0.5, -HR3, 0, HR3, -0.5, 0], [0.5, 0, 0, 0, -0.5, 0])), HAT);
	return m;
}

function baseT(): Extract<Geom, { kind: "meta" }> {
	const m = meta([pt(0, 0), pt(3, 0), pt(1.5, 3 * HR3)]);
	addChild(m, [0.5, 0, 0.5, 0, 0.5, HR3], HAT);
	return m;
}

/** P and F hold the same two hats; they differ only in their outline, F carrying an extra corner. */
function basePair(outline: Pt[]): Extract<Geom, { kind: "meta" }> {
	const m = meta(outline);
	addChild(m, [0.5, 0, 1.5, 0, 0.5, HR3], HAT);
	addChild(m, mul(ttrans(0, 2 * HR3), mul([0.5, HR3, 0, -HR3, 0.5, 0], [0.5, 0, 0, 0, 0.5, 0])), HAT);
	return m;
}

const baseP = () => basePair([pt(0, 0), pt(4, 0), pt(3, 2 * HR3), pt(-1, 2 * HR3)]);
const baseF = () => basePair([pt(0, 0), pt(3, 0), pt(3.5, HR3), pt(3, 2 * HR3), pt(-1, 2 * HR3)]);

// --- one round of substitution ----------------------------------------------------------------

type Rule = (number | string)[];

/**
 * Kaplan's assembly rules. Entry 0 seeds the patch with an H at the identity; a 4-entry rule glues a
 * new metatile onto an edge of an existing one; a 6-entry rule glues it across corners of two.
 */
const RULES: Rule[] = [
	["H"],
	[0, 0, "P", 2],
	[1, 0, "H", 2],
	[2, 0, "P", 2],
	[3, 0, "H", 2],
	[4, 4, "P", 2],
	[0, 4, "F", 3],
	[2, 4, "F", 3],
	[4, 1, 3, 2, "F", 0],
	[8, 3, "H", 0],
	[9, 2, "P", 0],
	[10, 2, "H", 0],
	[11, 4, "P", 2],
	[12, 0, "H", 2],
	[13, 0, "F", 3],
	[14, 2, "F", 1],
	[15, 3, "H", 4],
	[8, 2, "F", 1],
	[17, 3, "H", 0],
	[18, 2, "P", 0],
	[19, 2, "H", 2],
	[20, 4, "F", 3],
	[20, 0, "P", 2],
	[22, 0, "H", 2],
	[23, 4, "F", 3],
	[23, 0, "F", 3],
	[16, 0, "P", 2],
	[9, 4, 0, 2, "T", 2],
	[4, 0, "F", 3],
];

type Quad = [
	Extract<Geom, { kind: "meta" }>,
	Extract<Geom, { kind: "meta" }>,
	Extract<Geom, { kind: "meta" }>,
	Extract<Geom, { kind: "meta" }>,
];

function constructPatch([H, T, P, F]: Quad): Extract<Geom, { kind: "meta" }> {
	const ret = meta([]);
	const shapes: Record<string, Extract<Geom, { kind: "meta" }>> = { H, T, P, F };

	for (const r of RULES) {
		if (r.length === 1) {
			addChild(ret, IDENT, shapes[r[0] as string]);
		} else if (r.length === 4) {
			const parent = ret.children[r[0] as number];
			if (parent.geom.kind !== "meta") throw new Error("rule referenced a leaf");
			const poly = parent.geom.shape;
			const i = r[1] as number;
			const p = transPt(parent.T, poly[(i + 1) % poly.length]);
			const q = transPt(parent.T, poly[i]);
			const next = shapes[r[2] as string];
			const j = r[3] as number;
			addChild(ret, matchTwo(next.shape[j], next.shape[(j + 1) % next.shape.length], p, q), next);
		} else {
			const chP = ret.children[r[0] as number];
			const chQ = ret.children[r[2] as number];
			if (chP.geom.kind !== "meta" || chQ.geom.kind !== "meta") throw new Error("rule referenced a leaf");
			const p = transPt(chQ.T, chQ.geom.shape[r[3] as number]);
			const q = transPt(chP.T, chP.geom.shape[r[1] as number]);
			const next = shapes[r[4] as string];
			const j = r[5] as number;
			addChild(ret, matchTwo(next.shape[j], next.shape[(j + 1) % next.shape.length], p, q), next);
		}
	}
	return ret;
}

/** Read the next generation of H, T, P and F out of an assembled patch. */
function constructMetatiles(patch: Extract<Geom, { kind: "meta" }>): Quad {
	const bps1 = evalChild(patch, 8, 2);
	const bps2 = evalChild(patch, 21, 2);
	const rbps = transPt(rotAbout(bps1, (-2 * Math.PI) / 3), bps2);

	const p72 = evalChild(patch, 7, 2);
	const p252 = evalChild(patch, 25, 2);

	const llc = intersect(bps1, rbps, evalChild(patch, 6, 2), p72);
	let w = psub(evalChild(patch, 6, 2), llc);

	const hOutline = [llc, bps1];
	w = transPt(trot(-Math.PI / 3), w);
	hOutline.push(padd(hOutline[1], w));
	hOutline.push(evalChild(patch, 14, 2));
	w = transPt(trot(-Math.PI / 3), w);
	hOutline.push(psub(hOutline[3], w));
	hOutline.push(evalChild(patch, 6, 2));

	const newH = meta(hOutline);
	for (const ch of [0, 9, 16, 27, 26, 6, 1, 8, 10, 15]) {
		addChild(newH, patch.children[ch].T, patch.children[ch].geom);
	}

	const newP = meta([p72, padd(p72, psub(bps1, llc)), bps1, llc]);
	for (const ch of [7, 2, 3, 4, 28]) addChild(newP, patch.children[ch].T, patch.children[ch].geom);

	const newF = meta([
		bps2,
		evalChild(patch, 24, 2),
		evalChild(patch, 25, 0),
		p252,
		padd(p252, psub(llc, bps1)),
	]);
	for (const ch of [21, 20, 22, 23, 24, 25]) addChild(newF, patch.children[ch].T, patch.children[ch].geom);

	const aaa = hOutline[2];
	const bbb = padd(hOutline[1], psub(hOutline[4], hOutline[5]));
	const ccc = transPt(rotAbout(bbb, -Math.PI / 3), aaa);
	const newT = meta([bbb, ccc, aaa]);
	addChild(newT, patch.children[11].T, patch.children[11].geom);

	recentre(newH);
	recentre(newP);
	recentre(newF);
	recentre(newT);

	return [newH, newT, newP, newF];
}

// --- flattening -------------------------------------------------------------------------------

/** Hues in the HSB(·, 40, 100) space every card fills with. The hat and its mirror image, nothing
 *  else: colouring by metatile would suggest four tile shapes where there is one. */
const HAT_HUE = 200;
const REFLECTED_HUE = 25;

function flatten(g: Geom, T: Aff, out: RawPolygon[]) {
	if (g.kind === "hat") {
		// A negative determinant means this copy has been turned over.
		const reflected = T[0] * T[4] - T[1] * T[3] < 0;
		out.push({
			n: HAT_SHAPE.length,
			hue: reflected ? REFLECTED_HUE : HAT_HUE,
			vertices: HAT_SHAPE.map((p) => transPt(T, p)),
		});
		return;
	}
	for (const ch of g.children) flatten(ch.geom, mul(T, ch.T), out);
}

/** Default level, and a square window that `hatPatch(HAT_LEVEL)` covers with no gap. The supertile
 *  is not centred on its own bounding box, hence the offset. Measured by a rasterised coverage scan
 *  (largest clean square: side 29.8 about (11.0, 2.57)), and held there by
 *  tests/aperiodic-patches.test.ts. The width below is well inside that, because the hat's outline is
 *  intricate enough to read as texture rather than a shape if the view pulls much further back. */
export const HAT_LEVEL = 4;
export const HAT_WINDOW = { cx: 11, cy: 2.57, width: 18 };

function supertiles(level: number): Quad {
	let tiles: Quad = [baseH(), baseT(), baseP(), baseF()];
	for (let i = 1; i < level; i++) tiles = constructMetatiles(constructPatch(tiles));
	return tiles;
}

/**
 * The H supertile after `level - 1` rounds of substitution, as hat polygons. Level 1 is the four
 * hats of the base H metatile, and the count from there runs 4, 25, 169, 1156: the squares of every
 * other Fibonacci number.
 */
export function hatPatch(level = HAT_LEVEL): RawPolygon[] {
	const out: RawPolygon[] = [];
	flatten(supertiles(level)[0], IDENT, out);
	return out;
}

/** The outline of the H supertile, for checking that its hats fill it exactly. */
export function hatPatchOutline(level = HAT_LEVEL): { x: number; y: number }[] {
	return supertiles(level)[0].shape;
}
