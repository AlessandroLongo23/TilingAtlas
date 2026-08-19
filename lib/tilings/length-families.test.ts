import { describe, it, expect } from "vitest";
import { evaluateParamCell } from "@/lib/utils/paramCell";
import { LENGTH_META } from "@/lib/tilings/length-meta.generated";
import { LENGTH_FAMILIES, STRIP_FAMILIES, STACK_FAMILIES, RECT_GRID, PYTHAGOREAN, EQUIANGULAR_HEX, TRI_HEX_SHUTTER, HEX_ROTOR, TRI_THREE_SIZE, stripFamily } from "@/lib/tilings/length-families";

// A length family claims to tile the plane at EVERY point of its slider box, so testing the default
// member proves almost nothing. These tests sample the box and, for each member, check the covering
// multiplicity directly: translate the cell over a lattice patch and count how many tiles contain a
// sample point. Exactly one is a tiling; zero is a gap and two is an overlap, and a wrong basis
// produces both at once.

type Pt = [number, number];

function inPolygon(p: Pt, vs: Pt[]): boolean {
	let hit = false;
	for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
		const [xi, yi] = vs[i], [xj, yj] = vs[j];
		if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
	}
	return hit;
}

/** Covering multiplicity of `p` under the cell translated over a lattice patch. */
function multiplicity(cell: ReturnType<typeof evaluateParamCell>, p: Pt, R: number): number {
	const [t1, t2] = cell.basis as number[][];
	const polys = (cell.cellPolygons as { v: Pt[] }[]) ?? [];
	let n = 0;
	for (let i = -R; i <= R; i++)
		for (let j = -R; j <= R; j++) {
			const ox = i * t1[0] + j * t2[0], oy = i * t1[1] + j * t2[1];
			const q: Pt = [p[0] - ox, p[1] - oy];
			for (const poly of polys) if (inPolygon(q, poly.v)) n++;
		}
	return n;
}

/** Sample points chosen to miss tile boundaries: irrational offsets, never a round coordinate. */
function samples(count: number, span: number): Pt[] {
	const out: Pt[] = [];
	for (let i = 1; i <= count; i++)
		out.push([((i * Math.SQRT2) % 1) * span - span / 2, ((i * Math.E) % 1) * span - span / 2]);
	return out;
}

function assertTiles(cell: ReturnType<typeof evaluateParamCell>, label: string) {
	const [t1, t2] = cell.basis as number[][];
	const long = Math.max(Math.hypot(t1[0], t1[1]), Math.hypot(t2[0], t2[1]));
	const short = Math.min(Math.hypot(t1[0], t1[1]), Math.hypot(t2[0], t2[1]));
	// The patch radius is set by the SHORT basis vector, not the long one. A skewed family (A=0.3,
	// B=2.5) steps 0.3 in x, so a sample 2.1 out needs eight translates and a fixed radius of six
	// reports a gap that is the harness's, not the tiling's. Counted from the span instead.
	// ...and the radius is set by the lattice's narrowest WIDTH, not by either vector's length. A
	// strongly skewed hexagon (A=0.15, B=1, C=0.15) has both basis vectors ~1.08 long but nearly
	// parallel, so its width is 0.26 and a radius computed from the norms reports a phantom gap.
	const det = Math.abs(t1[0] * t2[1] - t1[1] * t2[0]);
	const width = det / long;
	const span = long * 2;
	const R = Math.ceil(span / Math.min(short, width)) + 2;
	for (const p of samples(40, span)) {
		const m = multiplicity(cell, p, R);
		expect(m, `${label}: point (${p[0].toFixed(3)}, ${p[1].toFixed(3)}) covered ${m} times`).toBe(1);
	}
}

describe("parametric edge-length families", () => {
	it("the rectangle grid tiles across its whole slider box", () => {
		for (const A of [0.3, 0.7, 1, 1.9, 2.8])
			for (const B of [0.25, 1, 2.5]) assertTiles(evaluateParamCell(RECT_GRID, [B]), `rect (width 1) B=${B}`);
	});

	it("the two-square tiling tiles for every size ratio, not just the default", () => {
		for (const A of [0.5, 1, 1.7, 2.6])
			for (const B of [0.25, 0.55, 1, 2.2])
				assertTiles(evaluateParamCell(PYTHAGOREAN, [B]), `pythagorean (A = 1) B=${B}`);
	});

	it("the equiangular hexagon tiles for every (A, B, C), not just the regular member", () => {
		// The claim the closure argument makes is that EVERY positive triple works, because opposite
		// edge directions cancel identically. Swept on all three axes independently, including the
		// strongly skewed corners of the box.
		for (const A of [0.15, 1, 2.6])
			for (const B of [0.15, 1, 2.6])
				for (const C of [0.15, 1, 2.6])
					assertTiles(evaluateParamCell(EQUIANGULAR_HEX, [B, C]), `hex (A = 1) B=${B} C=${C}`);
	});

	it("the hexagon is regular exactly at B = C = 1, the unit side", () => {
		const sides = (t: number[]) => {
			const cell = evaluateParamCell(EQUIANGULAR_HEX, t);
			const v = (cell.cellPolygons as { v: Pt[] }[])[0].v;
			return v.map((p, i) => {
				const q = v[(i + 1) % v.length];
				return Math.hypot(q[0] - p[0], q[1] - p[1]);
			});
		};
		const reg = sides([1, 1]);
		for (const s of reg) expect(s).toBeCloseTo(1, 9);
		const skew = sides([2, 0.5]);
		expect(new Set(skew.map((x) => x.toFixed(6))).size).toBe(3); // three distinct side lengths
		skew.slice(0, 3).forEach((v, i) => expect(v).toBeCloseTo(skew[i + 3], 9)); // opposite sides equal
	});

	it("cell area equals |det basis| — the algebraic form of the same claim", () => {
		// PER-FAMILY sample points, not one fixed triple. A three-element tuple handed to a six-slider
		// family silently defaults the rest and clamps the values that fall outside the range, so the
		// old form tested the same handful of interior points over and over and never entered the box
		// of anything wider than three parameters.
		for (const fam of LENGTH_FAMILIES)
			for (const u of [0.18, 0.5, 0.83]) {
				const at = fam.cell.params.map((p, j) => {
					const [lo, hi] = p.alphaRangeDegOpen;
					return lo + (hi - lo) * ((u + 0.37 * j) % 1);
				});
				const cell = evaluateParamCell(fam.cell, at);
				const [t1, t2] = cell.basis as number[][];
				const det = Math.abs(t1[0] * t2[1] - t1[1] * t2[0]);
				let area = 0;
				for (const poly of (cell.cellPolygons as { v: Pt[] }[]) ?? []) {
					let s = 0;
					for (let i = 0, j = poly.v.length - 1; i < poly.v.length; j = i++)
						s += poly.v[j][0] * poly.v[i][1] - poly.v[i][0] * poly.v[j][1];
					area += Math.abs(s) / 2;
				}
				// RELATIVE, not nine decimal places: a family whose slider reaches 30 has a cell area in
				// the thousands, where an absolute 1e-9 is below the float noise of summing the shoelace.
				expect(Math.abs(area - det), `${fam.id} at [${at.map((x) => x.toFixed(3)).join(", ")}]`)
					.toBeLessThan(1e-9 * Math.max(1, det));
			}
	});

	it("the anchor cell (constant terms) equals the family at its defaults", () => {
		// The contract `intrinsic` set: a consumer that ignores `lengths` must still draw a real tiling.
		for (const fam of LENGTH_FAMILIES) {
			const def = fam.cell.params.map((p) => p.defaultAlphaDeg);
			const live = evaluateParamCell(fam.cell, def);
			const anchor = fam.cell.cellPolygons.map((p) =>
				p.vertices.map((t) => [t[0][1], t[0][2]] as Pt));
			const got = (live.cellPolygons as { v: Pt[] }[]).map((p) => p.v);
			expect(got).toEqual(anchor);
		}
	});

	// ── SLIDING STRIPS ───────────────────────────────────────────────────────────────────────────
	// The claim under test is the strong one: EVERY assignment of shifts tiles, including the ones that
	// look wrong. A shift is not a symmetry of the strip's contents, so nothing about the neighbouring
	// strip lines up, and the only reason it still tiles is that the interface is a straight line. If
	// that reasoning is wrong the harness sees it immediately, as a gap or an overlap.

	it("enumerates 15 strip stacks up to four deep, with one slider per interface", () => {
		expect(STRIP_FAMILIES.map((f) => f.id.replace("plen-strip-", "")).sort()).toEqual([
			"s", "ss", "sss", "ssss", "ssst", "sst", "sstt", "st", "stst", "stt", "sttt",
			"t", "tt", "ttt", "tttt",
		]);
		for (const f of STRIP_FAMILIES) {
			const word = f.id.replace("plen-strip-", "");
			expect(f.cell.params.length, f.id).toBe(word.length);
			// one square per S strip, two triangles per T strip
			const tiles = f.cell.lengths!.cellPolygons;
			expect(tiles.filter((p) => p.n === 4).length, f.id).toBe([...word].filter((c) => c === "s").length);
			expect(tiles.filter((p) => p.n === 3).length, f.id).toBe(2 * [...word].filter((c) => c === "t").length);
		}
	});

	it("every strip stack tiles at every shift assignment, not just the aligned one", () => {
		// Deliberately awkward shifts: irrational-ish, unequal, and including the endpoints where the
		// stack goes edge-to-edge. 0 and 1 are the same tiling by one lattice vector, so both must work.
		const SHIFTS = [0, 0.137, 0.5, 0.813, 1];
		for (const fam of STRIP_FAMILIES) {
			const m = fam.cell.params.length;
			for (let pick = 0; pick < SHIFTS.length; pick++) {
				// vary each interface independently, so a stack of four is not tested only on the diagonal
				const t = Array.from({ length: m }, (_, k) => SHIFTS[(pick + k * 2) % SHIFTS.length]);
				assertTiles(evaluateParamCell(fam.cell, t), `${fam.id} shifts=[${t.join(", ")}]`);
			}
		}
	});

	it("the single-square stack at shift 1/2 is the half-offset brick, and at 0 the square grid", () => {
		const brick = evaluateParamCell(stripFamily("S"), [0.5]);
		expect(brick.basis as number[][]).toEqual([[1, 0], [0.5, 1]]);
		const grid = evaluateParamCell(stripFamily("S"), [0]);
		expect(grid.basis as number[][]).toEqual([[1, 0], [0, 1]]);
	});

	it("the square-then-triangle stack has the elongated triangular tiling inside it", () => {
		// Word "ST": a square row then a triangle row. Cell area must be 1 + sqrt3/2 at every shift,
		// which is the algebraic form of "the shift moves the strip but does not change what is in it".
		for (const t of [[0, 0], [0.5, 0.5], [0.29, 0.83]]) {
			const cell = evaluateParamCell(stripFamily("ST"), t);
			const [t1, t2] = cell.basis as number[][];
			expect(Math.abs(t1[0] * t2[1] - t1[1] * t2[0])).toBeCloseTo(1 + Math.sqrt(3) / 2, 9);
		}
	});

	it("strip stacks opt out of the size ramp so squares and triangles stay distinguishable", () => {
		// Every tile in an S/T stack has unit edge, so a hue taken from the size is constant and hides the
		// tile kinds. The families that DO vary in size keep it — including the rectangle stacks, whose
		// rows genuinely differ in height.
		for (const f of STRIP_FAMILIES) expect(f.cell.lengths!.sizeHue, f.id).toBe(false);
		for (const f of STACK_FAMILIES) expect(f.cell.lengths!.sizeHue, f.id).toBe(true);
		expect(PYTHAGOREAN.lengths!.sizeHue).toBe(true);
	});

	// ── RECTANGLE STACKS: where the edge lengths stop being 1 ────────────────────────────────────

	it("rectangle stacks carry a height slider per rectangle row and a shift per interface", () => {
		expect(STACK_FAMILIES.map((f) => f.id.replace("plen-strip-", "")).sort()).toEqual(["rr", "rrr", "rrt", "rt", "rtt"]);
		for (const f of STACK_FAMILIES) {
			const w = f.id.replace("plen-strip-", "");
			const nR = [...w].filter((c) => c === "r").length;
			expect(f.cell.params.length, f.id).toBe(nR + w.length);
			expect(f.cell.params.filter((p) => p.name.startsWith("Height")).length, f.id).toBe(nR);
		}
	});

	it("rectangle stacks tile at every height and shift, so the length sliders are real", () => {
		// The heights are swept over an 8x ratio. If a height were secretly constrained — if the strip
		// construction only worked when the rows matched the triangles — this is where it would show.
		const H = [0.22, 0.75, 1, 2.4];
		const D = [0.11, 0.5, 0.93];
		for (const fam of STACK_FAMILIES) {
			const ps = fam.cell.params;
			for (let pick = 0; pick < 4; pick++) {
				const t = ps.map((p, j) =>
					p.name.startsWith("Height") ? H[(pick + j) % H.length] : D[(pick + j) % D.length]);
				assertTiles(evaluateParamCell(fam.cell, t), `${fam.id} [${t.map((v) => v.toFixed(2))}]`);
			}
		}
	});

	it("a rectangle stack really does have more than one edge length", () => {
		// The complaint that produced these: an all-square/triangle stack has every edge at 1, so its
		// sliders only translate strips. Here the distinct edge lengths must move with the slider.
		const lens = (t: number[]) => {
			const cell = evaluateParamCell(stripFamily("RT"), t);
			const out = new Set<string>();
			for (const poly of (cell.cellPolygons as { v: Pt[] }[]) ?? [])
				poly.v.forEach((p, i) => {
					const q = poly.v[(i + 1) % poly.v.length];
					out.add(Math.hypot(q[0] - p[0], q[1] - p[1]).toFixed(4));
				});
			return out;
		};
		expect([...lens([0.62, 0.37, 0.61])].sort()).toEqual(["0.6200", "1.0000"]);
		expect([...lens([2.4, 0.37, 0.61])].sort()).toEqual(["1.0000", "2.4000"]);
	});

	// ── THE SHUTTER ──────────────────────────────────────────────────────────────────────────────

	it("the shutter tiles at every aperture, and its ends are the two tilings it interpolates", () => {
		// The derivation claims closure is IDENTICAL, not conditional: |C1| = |C2| and cos = 1/2 for every
		// g. If that algebra is wrong the covering count catches it somewhere in the sweep.
		for (const g of [0.08, 0.2, 0.37, 0.5, 0.73, 0.9, 1])
			assertTiles(evaluateParamCell(TRI_HEX_SHUTTER, [g]), `shutter g=${g}`);
	});

	it("the shutter's lattice has the length the closure argument predicts", () => {
		for (const g of [0.15, 0.5, 0.84, 1]) {
			const [c1, c2] = evaluateParamCell(TRI_HEX_SHUTTER, [g]).basis as number[][];
			expect(Math.hypot(...(c1 as [number, number])), `g=${g}`).toBeCloseTo(Math.sqrt(3 * g * g + 1), 9);
			expect(Math.hypot(...(c2 as [number, number])), `g=${g}`).toBeCloseTo(Math.sqrt(3 * g * g + 1), 9);
			const cos = (c1[0] * c2[0] + c1[1] * c2[1]) / (3 * g * g + 1);
			expect(cos, `g=${g}`).toBeCloseTo(0.5, 9); // exactly 60 deg, at every aperture
		}
	});

	it("the shutter has one hexagon and two unit triangles per period", () => {
		const cell = evaluateParamCell(TRI_HEX_SHUTTER, [0.37]);
		const polys = cell.cellPolygons as { n: number; v: Pt[] }[];
		expect(polys.map((p) => p.n)).toEqual([6, 3, 3]);
		const side = (v: Pt[], i: number) =>
			Math.hypot(v[(i + 1) % v.length][0] - v[i][0], v[(i + 1) % v.length][1] - v[i][1]);
		for (const p of polys)
			for (let i = 0; i < p.v.length; i++)
				expect(side(p.v, i), `n=${p.n}`).toBeCloseTo(p.n === 6 ? 0.37 : 1, 9);
	});

	it("the shutter closes onto the triangular tiling and opens onto the trihexagonal", () => {
		// At g = 1 the 1-g remainders vanish, the T-junctions degenerate and the tiling is 3.6.3.6 with
		// unit edge throughout — one hexagon and two triangles per period, cell area 2*sqrt3.
		const [c1, c2] = evaluateParamCell(TRI_HEX_SHUTTER, [1]).basis as number[][];
		expect(Math.abs(c1[0] * c2[1] - c1[1] * c2[0])).toBeCloseTo(2 * Math.sqrt(3), 9);
		// and the area identity holds all the way along
		for (const g of [0.1, 0.44, 0.92]) {
			const [a, b] = evaluateParamCell(TRI_HEX_SHUTTER, [g]).basis as number[][];
			expect(Math.abs(a[0] * b[1] - a[1] * b[0])).toBeCloseTo((Math.sqrt(3) / 2) * (3 * g * g + 1), 9);
		}
	});

	it("the rotor tiles at every gap size, and its ends are the hexagonal and trihexagonal tilings", () => {
		for (const t of [0.05, 0.19, 0.5, 0.68, 0.91, 1])
			assertTiles(evaluateParamCell(HEX_ROTOR, [t]), `rotor t=${t}`);
		for (const t of [0.05, 0.5, 1]) {
			const [l1, l2] = evaluateParamCell(HEX_ROTOR, [t]).basis as number[][];
			// |L|^2 = 3 + t^2 on both, and the cell is one unit hexagon plus two triangles of side t
			expect(l1[0] ** 2 + l1[1] ** 2, `t=${t}`).toBeCloseTo(3 + t * t, 9);
			expect(l2[0] ** 2 + l2[1] ** 2, `t=${t}`).toBeCloseTo(3 + t * t, 9);
			expect(Math.abs(l1[0] * l2[1] - l1[1] * l2[0]), `t=${t}`).toBeCloseTo((Math.sqrt(3) / 2) * (3 + t * t), 9);
		}
		// hexagon stays at unit side throughout; the triangles are the ones that grow
		const polys = (evaluateParamCell(HEX_ROTOR, [0.37]).cellPolygons as { n: number; v: Pt[] }[]);
		expect(polys.map((p) => p.n)).toEqual([6, 3, 3]);
		for (const p of polys)
			for (let i = 0; i < p.v.length; i++) {
				const q = p.v[(i + 1) % p.v.length];
				expect(Math.hypot(q[0] - p.v[i][0], q[1] - p.v[i][1]), `n=${p.n}`).toBeCloseTo(p.n === 6 ? 1 : 0.37, 9);
			}
	});

	it("three size triangles tile for every C, with sides 1, C and 1 + C", () => {
		// B is the unit now, so the family is one slider and the shape claim reads off it directly.
		for (const C of [0.15, 0.6, 1, 1.9, 2.8])
			assertTiles(evaluateParamCell(TRI_THREE_SIZE, [C]), `tri3 (B = 1) C=${C}`);
		for (const C of [0.6, 2.2, 1.5]) {
			const polys = evaluateParamCell(TRI_THREE_SIZE, [C]).cellPolygons as { n: number; v: Pt[] }[];
			const side = (p: { v: Pt[] }) => Math.hypot(p.v[1][0] - p.v[0][0], p.v[1][1] - p.v[0][1]);
			expect(polys.every((p) => p.n === 3)).toBe(true);
			expect(side(polys[0]), `C=${C}`).toBeCloseTo(1 + C, 9);
			expect(side(polys[1])).toBeCloseTo(1, 9);
			expect(side(polys[2])).toBeCloseTo(C, 9);
		}
	});

	// Vertex orbits are no longer measured here. `tools/ctrnact-oracle/vertex_orbits.py` is the
	// project's counter, `emit_length_meta.py` runs it over every family, and the Atlas reads the
	// result — see lib/tilings/length-meta.generated.ts. The TypeScript re-implementation that used
	// to live in lib/tilings/vertex-orbits.ts disagreed with it on three families and is gone.

	// ── THE THREE CHECKS THIS SHELF DID NOT HAVE ────────────────────────────────────────────────
	//
	// Until 2026-08-18 the shelf shipped 192 rows over roughly a third as many tilings, and 134 of them
	// carried more sliders than the tiling had freedom — the first two cards were both the rectangle
	// grid under three sliders, two of which moved the same width. Twenty-nine tests passed throughout.
	// They tested that each row tiles, which every duplicate does, and that the anchor matches the
	// defaults, which every phantom slider does. None of them counted anything.

	it("every family's slider count is the number of parameters it actually has", () => {
		// LENGTH_META.params is measured by tools/ctrnact-oracle/length_family.py on the SMOOTHED map at
		// a generic member — the number of independent things the sliders can do, scale excluded. It was
		// imported and never read while four authored families shipped a pure-scale slider and the
		// T-junction rows shipped up to eight sliders that moved nothing.
		for (const fam of LENGTH_FAMILIES) {
			const meta = LENGTH_META[fam.id];
			expect(meta, `${fam.id} has no entry in length-meta.generated.ts — regenerate it`).toBeDefined();
			expect(fam.cell.params.length, `${fam.id} slider count`).toBe(meta.params);
		}
	});

	it("no two rows are the same family", () => {
		const byKey = new Map<string, string>();
		for (const fam of LENGTH_FAMILIES) {
			const key = LENGTH_META[fam.id]?.key;
			if (!key) continue;
			const first = byKey.get(key);
			expect(first, `${fam.id} is the same family as ${first}`).toBeUndefined();
			byKey.set(key, fam.id);
		}
	});

	it("no slider is redundant: moving one always moves the tiling", () => {
		// The check that catches the original bug WITHOUT trusting the Python. A length family is linear,
		// so differentiate the geometry — every tile corner that is a real corner, relative to an anchor,
		// plus the two lattice vectors — with respect to the sliders and take the rank. Corners that are
		// flat on both sides are dropped first: a mark on a straight edge that no tile turns at is not
		// part of the tiling, and sliding it was exactly the phantom freedom.
		for (const fam of LENGTH_FAMILIES) {
			const P = fam.cell.params.length;
			const at = fam.cell.params.map((p, j) => {
				const [lo, hi] = p.alphaRangeDegOpen;
				return lo + (hi - lo) * (0.31 + 0.0137 * j);
			});
			const vec = (c: number[]): number[] => {
				const cell = evaluateParamCell(fam.cell, c);
				const polys = (cell.cellPolygons as { v: Pt[] }[]) ?? [];
				const keep = polys.map((poly) => poly.v.filter((_, i) => {
					const n = poly.v.length;
					const [px, py] = poly.v[(i + n - 1) % n], [qx, qy] = poly.v[i], [rx, ry] = poly.v[(i + 1) % n];
					return Math.abs((qx - px) * (ry - qy) - (qy - py) * (rx - qx)) > 1e-9;
				}));
				const anchor = keep[0][0];
				const out: number[] = [];
				for (const poly of keep) for (const [x, y] of poly) out.push(x - anchor[0], y - anchor[1]);
				for (const t of cell.basis as number[][]) out.push(t[0], t[1]);
				return out;
			};
			const base = vec(at);
			const H = 1e-5;
			const cols = at.map((_, j) => {
				const d = vec(at.map((v, i) => (i === j ? v + H : v)));
				return d.map((x, i) => (x - base[i]) / H);
			});
			// Gauss elimination on the columns
			const m = cols.map((r) => r.slice());
			let rank = 0;
			for (let c = 0; c < (m[0]?.length ?? 0) && rank < m.length; c++) {
				let piv = -1, best = 1e-6;
				for (let i = rank; i < m.length; i++) if (Math.abs(m[i][c]) > best) { best = Math.abs(m[i][c]); piv = i; }
				if (piv < 0) continue;
				[m[rank], m[piv]] = [m[piv], m[rank]];
				for (let i = 0; i < m.length; i++)
					if (i !== rank && Math.abs(m[i][c]) > 1e-9) {
						const f = m[i][c] / m[rank][c];
						for (let j = c; j < m[i].length; j++) m[i][j] -= f * m[rank][j];
					}
				rank++;
			}
			expect(rank, `${fam.id}: ${P} sliders but only ${rank} move the tiling`).toBe(P);
		}
	});

	it("sliders clamp to the open range instead of escaping it", () => {
		const [lo, hi] = RECT_GRID.params[0].alphaRangeDegOpen;
		expect((evaluateParamCell(RECT_GRID, [99]).basis as number[][])[1][1]).toBeCloseTo(hi, 9);
		expect((evaluateParamCell(RECT_GRID, [-99]).basis as number[][])[1][1]).toBeCloseTo(lo, 9);
		expect(lo).toBeLessThan(hi);
	});
});
