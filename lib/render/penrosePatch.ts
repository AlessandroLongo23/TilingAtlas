// A patch of the Penrose P3 (rhombus) tiling, built by deflating Robinson triangles.
//
// Why not the multigrid engine (lib/multigrid): de Bruijn's pentagrid gives a Penrose tiling only
// when the five offsets sum to an integer, and the generic offsets that engine defaults to give a
// *generalised* Penrose tiling instead. Deflation is unambiguous, so a card labelled "Penrose" shows
// a Penrose tiling.
//
// Method. Each rhombus is cut along a diagonal into two mirror-image Robinson triangles, and each
// triangle is subdivided into smaller ones in the golden ratio. Start from a wheel of ten triangles
// meeting at the origin, subdivide `depth` times, then glue the halves back into rhombi.

import type { RawPolygon } from "@/lib/utils/renderTiling";

const PHI = (1 + Math.sqrt(5)) / 2;

/** Default depth, and a square window about the origin that `penrosePatch(PENROSE_DEPTH)` covers
 *  with no gap. A patch is finite, so its boundary is ragged; anything drawing it should stay inside
 *  this window. Measured by a rasterised coverage scan (largest clean square: side 15.0), and held
 *  there by tests/aperiodic-patches.test.ts. */
export const PENROSE_DEPTH = 5;
export const PENROSE_WINDOW = { cx: 0, cy: 0, width: 14 };

interface Pt {
	x: number;
	y: number;
}

/** A Robinson triangle. `thin` marks the 36-72-72 half of a thin rhombus; the other is 108-36-36.
 *  `b`,`c` are the two ends of the cut, so the mirror partner shares exactly the edge b-c. */
interface Tri {
	thin: boolean;
	a: Pt;
	b: Pt;
	c: Pt;
}

const lerp = (p: Pt, q: Pt, t: number): Pt => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });

/** The classic starting configuration: ten triangles round the origin, alternating handedness, whose
 *  union is a regular decagon of circumradius 1. */
function wheel(): Tri[] {
	const out: Tri[] = [];
	for (let i = 0; i < 10; i++) {
		const angB = ((2 * i - 1) * Math.PI) / 10;
		const angC = ((2 * i + 1) * Math.PI) / 10;
		let b: Pt = { x: Math.cos(angB), y: Math.sin(angB) };
		let c: Pt = { x: Math.cos(angC), y: Math.sin(angC) };
		if (i % 2 === 0) [b, c] = [c, b];
		out.push({ thin: true, a: { x: 0, y: 0 }, b, c });
	}
	return out;
}

function subdivide(tris: Tri[]): Tri[] {
	const out: Tri[] = [];
	for (const { thin, a, b, c } of tris) {
		if (thin) {
			const p = lerp(a, b, 1 / PHI);
			out.push({ thin: true, a: c, b: p, c: b });
			out.push({ thin: false, a: p, b: c, c: a });
		} else {
			const q = lerp(b, a, 1 / PHI);
			const r = lerp(b, c, 1 / PHI);
			out.push({ thin: false, a: r, b: c, c: a });
			out.push({ thin: false, a: q, b: r, c: b });
			out.push({ thin: true, a: r, b: q, c: a });
		}
	}
	return out;
}

/** Hues for the two rhombi, in the same HSB(·, 40, 100) space every other card fills with. */
const THICK_HUE = 205;
const THIN_HUE = 35;

/**
 * The deflation rule as a figure: each Robinson triangle, subdivided once.
 *
 * Same `subdivide` the patch runs, applied to one reference triangle of each kind, so the sidebar
 * figure and the canvas cannot disagree. Drawn as triangles rather than rhombi on purpose — the rule
 * acts on the halves, and a rhombus is only reassembled at the end.
 *
 * Note the direction: this is a DEFLATION, so the children are φ⁻¹ times the parent and sit inside it,
 * where an inflation rule's children fill a parent scaled up. The picture reads the same either way.
 */
export function penroseRuleFigure(): { caption: string; pieces: RawPolygon[] }[] {
	// `a` is the APEX and b, c are the base ends, with |ab| = |ac|: that is the convention `wheel` sets
	// up and `subdivide` reads, and getting it wrong does not fail loudly — the formula still returns
	// three triangles, they are just slivers that do not fill the parent. Both references below are
	// therefore built as an isosceles triangle with its apex at the origin. It opens DOWNWARD so the
	// panel, which flips y as SVG does, shows the apex on top.
	const iso = (thin: boolean): Tri => {
		const apex = thin ? Math.PI / 5 : (3 * Math.PI) / 5; // 36° and 108°
		return {
			thin,
			a: { x: 0, y: 0 },
			b: { x: Math.cos(Math.PI / 2 + apex / 2), y: -Math.sin(Math.PI / 2 + apex / 2) },
			c: { x: Math.cos(Math.PI / 2 - apex / 2), y: -Math.sin(Math.PI / 2 - apex / 2) },
		};
	};
	const refs: { thin: boolean; tri: Tri }[] = [
		{ thin: true, tri: iso(true) },
		{ thin: false, tri: iso(false) },
	];
	return refs.map(({ thin, tri }) => {
		const kids = subdivide([tri]);
		return {
			caption: `${thin ? "36°–72°–72°" : "108°–36°–36°"} → ${kids.length} triangles`,
			pieces: kids.map((k) => ({
				n: 3,
				hue: k.thin ? THIN_HUE : THICK_HUE,
				vertices: [k.a, k.b, k.c].map((p) => ({ x: p.x, y: p.y })),
			})),
		};
	});
}

/**
 * `depth` subdivisions of the starting wheel, returned as rhombi with unit edge. The patch covers a
 * disc of radius roughly φ^depth edges about the origin, so depth 5 gives about 11 rhombi from the
 * centre out, which is enough to fill a square card with interior.
 */
export function penrosePatch(depth = PENROSE_DEPTH): RawPolygon[] {
	let tris = wheel();
	for (let i = 0; i < depth; i++) tris = subdivide(tris);

	// Rescale so an edge is 1, not φ^-depth: the renderer sizes everything off median edge.
	const s = Math.pow(PHI, depth);

	// Two mirror triangles make one rhombus, and they meet along b-c, so the midpoint of b-c
	// identifies the rhombus. Partners are found through a hash grid, not by string-keying a
	// rounded midpoint: the two halves reach the same point along different subdivision paths, so
	// their coordinates agree only to floating-point noise, and a rounded key can split a pair across
	// a cell boundary. That would drop a rhombus and leave a hole. Cells are 0.01 wide against a
	// smallest edge of φ^-depth, so a partner is always in the 3x3 neighbourhood.
	const CELL = 0.01;
	const grid = new Map<string, number[]>();
	const mids = tris.map((t) => ({ x: (t.b.x + t.c.x) / 2, y: (t.b.y + t.c.y) / 2 }));
	mids.forEach((m, i) => {
		const key = `${Math.round(m.x / CELL)},${Math.round(m.y / CELL)}`;
		const cell = grid.get(key);
		if (cell) cell.push(i);
		else grid.set(key, [i]);
	});

	const partnerOf = (i: number): number => {
		const m = mids[i];
		const gx = Math.round(m.x / CELL);
		const gy = Math.round(m.y / CELL);
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				for (const j of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
					if (j === i) continue;
					if (Math.abs(mids[j].x - m.x) < 1e-9 && Math.abs(mids[j].y - m.y) < 1e-9) return j;
				}
			}
		}
		return -1;
	};

	const out: RawPolygon[] = [];
	for (let i = 0; i < tris.length; i++) {
		// A triangle whose partner fell outside the wheel is dropped, which trims the patch to the
		// region that is genuinely covered. Emit each pair once, from its lower index.
		const j = partnerOf(i);
		if (j < 0 || j < i) continue;
		const { a, b, c, thin } = tris[i];
		// The fourth corner is the mirror of `a` through the midpoint of b-c.
		const d = { x: b.x + c.x - a.x, y: b.y + c.y - a.y };
		out.push({
			n: 4,
			hue: thin ? THIN_HUE : THICK_HUE,
			vertices: [a, b, d, c].map((p) => ({ x: p.x * s, y: p.y * s })),
		});
	}
	return out;
}
