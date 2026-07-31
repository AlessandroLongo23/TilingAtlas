/**
 * That each type's derived unit actually tiles, at more than one point of its family.
 *
 * THE GATE IS AREA PLUS SAT, NOT AN EDGE COUNT. The usual check for a tiling ("quantise every edge,
 * assert none is used more than twice, union-find the once-used ones into a single boundary loop") is
 * the one used by the Sub Rosa view, and it is WRONG here. It assumes the tiling is edge-to-edge, and
 * these are generally not: types 10 to 13 have conditions (a = b = c + e, 2a + c = d, 2a = d = c + e,
 * d = 2a = 2e) that say one tile's long edge is covered by two neighbours' short edges, and types 1
 * and 2 are generic enough to do the same. Run that check on a CORRECT Type 1 unit and it reports
 * dozens of interior edges as boundary.
 *
 * Area plus SAT is both correct and stronger. No two tiles of the unit overlap at any lattice offset,
 * and the unit's total area equals the cell's. Given no overlap, the uncovered part of the fundamental
 * domain is a finite union of polygons of total area zero, hence empty. That is a proof of "no gaps and
 * no overlaps", with no quantisation grid and no boundary reconstruction.
 *
 * Sampling across the range, not just the default, is what turns the argument in assembly.ts's header
 * ("the combinatorics cannot break because the type's own conditions are what close each vertex") into
 * a measured fact.
 */

import { describe, expect, it } from "vitest";
import { PENTAGON_TYPES } from "./types";
import { area, solvePentagon, type Point } from "./solve";
import { ASSEMBLIES, assembleUnit } from "./assembly";
import { HOME_PERIODS, buildCell, hasAssembly } from "./build";

const EPS = 1e-7;

/** Exact for convex polygons. Shared edges and touching corners are not overlaps. */
function overlaps(A: Point[], B: Point[]): boolean {
	for (const poly of [A, B]) {
		for (let i = 0; i < poly.length; i++) {
			const p = poly[i];
			const q = poly[(i + 1) % poly.length];
			const nx = -(q.y - p.y);
			const ny = q.x - p.x;
			let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
			for (const v of A) {
				const d = nx * v.x + ny * v.y;
				if (d < aMin) aMin = d;
				if (d > aMax) aMax = d;
			}
			for (const v of B) {
				const d = nx * v.x + ny * v.y;
				if (d < bMin) bMin = d;
				if (d > bMax) bMax = d;
			}
			const scale = Math.hypot(nx, ny) || 1;
			if (aMax < bMin + EPS * scale || bMax < aMin + EPS * scale) return false;
		}
	}
	return true;
}

function tilesCleanly(unit: Point[][], t1: Point, t2: Point) {
	const cell = Math.abs(t1.x * t2.y - t1.y * t2.x);
	const total = unit.reduce((s, p) => s + area(p), 0);
	const areaError = Math.abs(total - cell) / Math.max(cell, 1e-12);

	let overlapping = 0;
	for (let m = -1; m <= 1; m++) {
		for (let n = -1; n <= 1; n++) {
			const dx = m * t1.x + n * t2.x;
			const dy = m * t1.y + n * t2.y;
			for (let i = 0; i < unit.length; i++) {
				for (let j = 0; j < unit.length; j++) {
					if (m === 0 && n === 0 && i >= j) continue;
					const shifted = unit[j].map((p) => ({ x: p.x + dx, y: p.y + dy }));
					if (overlaps(unit[i], shifted)) overlapping++;
				}
			}
		}
	}
	return { areaError, overlapping };
}

/** A spread of tuples across each angle slider's range, keeping the others at their defaults. */
function sampleTuples(id: number): number[][] {
	const t = PENTAGON_TYPES.find((x) => x.id === id)!;
	if (t.angleParams.length === 0) return [[]];
	const out: number[][] = [t.angleParams.map((p) => p.def)];
	t.angleParams.forEach((p, i) => {
		for (let k = 1; k <= 5; k++) {
			const v = p.min + ((p.max - p.min) * k) / 6;
			out.push(t.angleParams.map((q, j) => (j === i ? v : q.def)));
		}
	});
	return out;
}

describe("assemblies", () => {
	it("covers all 15 types", () => {
		const missing = PENTAGON_TYPES.filter((t) => !hasAssembly(t.id)).map((t) => t.id);
		expect(missing).toEqual([]);
	});

	it("has the published number of tiles per translational unit", () => {
		for (const t of PENTAGON_TYPES) {
			if (!hasAssembly(t.id)) continue;
			expect(`${t.label}: ${ASSEMBLIES[t.id].unit.length}`).toBe(`${t.label}: ${t.tilesPerUnit}`);
		}
	});

	// Every gluing must reference a tile that already exists, or the replay silently drops tiles.
	it("references only already-placed tiles", () => {
		for (const t of PENTAGON_TYPES) {
			if (!hasAssembly(t.id)) continue;
			const asm = ASSEMBLIES[t.id];
			asm.glues.forEach((g, i) => {
				expect(`${t.label} glue ${i} ref ${g.ref} < ${i + 1}`).toBe(
					`${t.label} glue ${i} ref ${g.ref} < ${i + 1}`,
				);
				expect(g.ref).toBeLessThanOrEqual(i);
				expect(g.ref).toBeGreaterThanOrEqual(0);
			});
			const n = asm.glues.length + 1;
			for (const i of asm.unit) expect(i).toBeLessThan(n);
			for (const r of [asm.t1, asm.t2]) {
				expect(r.from[0]).toBeLessThan(n);
				expect(r.to[0]).toBeLessThan(n);
			}
		}
	});
});

describe.each(PENTAGON_TYPES)("$label tiles the plane", (t) => {
	const tuples = sampleTuples(t.id);

	it("tiles gap-free and overlap-free across its parameter range", () => {
		if (!hasAssembly(t.id)) return;
		const asm = ASSEMBLIES[t.id];
		let checked = 0;
		for (const free of tuples) {
			const solved = solvePentagon(t, free);
			if (!solved.ok) continue; // outside the family; the slider bounds are narrowed separately
			const built = assembleUnit(solved.pentagon.corners as unknown as Point[], asm);
			expect(built).not.toBeNull();
			const { areaError, overlapping } = tilesCleanly(built!.unit, built!.t1, built!.t2);
			expect(`${t.label} @ ${free.map((v) => v.toFixed(1))}: overlaps ${overlapping}`).toBe(
				`${t.label} @ ${free.map((v) => v.toFixed(1))}: overlaps 0`,
			);
			expect(areaError).toBeLessThan(1e-9);
			checked++;
		}
		// A type whose every sample failed to solve would silently pass the loop above.
		expect(checked).toBeGreaterThan(0);
	});

	it("builds a cell whose mesh matches the buffer contract", () => {
		const res = buildCell({ id: t.id });
		if (!hasAssembly(t.id)) {
			expect(res.ok).toBe(false);
			return;
		}
		expect(res.ok ? "ok" : res.reason).toBe("ok");
		const cell = res.cell!;
		expect(cell.polygons).toHaveLength(t.tilesPerUnit);
		expect(cell.tilesPerCell).toBe(t.tilesPerUnit);

		// buildCellMesh fans each n-gon from its centroid: n triangles, 3 vertices each, and one 6-vertex
		// stroke quad per edge. Same contract lib/isohedral/build.test.ts pins for its own builder.
		const n = 5 * t.tilesPerUnit;
		expect(cell.mesh.fillVertexCount).toBe(3 * n);
		expect(cell.mesh.strokeVertexCount).toBe(6 * n);
		expect(cell.mesh.fillVerts.length).toBe(3 * n * 2);

		// A degenerate basis would make the instanced renderer draw one cell forever.
		const det = cell.v1[0] * cell.v2[1] - cell.v1[1] * cell.v2[0];
		expect(Math.abs(det)).toBeGreaterThan(1e-9);
		expect(cell.period).toBeCloseTo(Math.sqrt(Math.abs(det)), 9);
	});

	/**
	 * Both ends of every slider must draw. A bound that cannot be reached is a bound in the wrong place:
	 * either the family really does end there, in which case the endpoint is the degenerate tiling and
	 * builds fine, or it does not, in which case the slider has been truncated and is hiding part of the
	 * family. Type 13 shipped truncated to A ∈ [95°, 135°] when the family starts at 90°, where D reaches
	 * exactly 180° and the pentagon flattens to a rectangle that tiles perfectly well.
	 */
	it("builds at both ends of every slider", () => {
		if (!hasAssembly(t.id)) return;
		const d = { angles: t.angleParams.map((p) => p.def), sides: t.sideParams.map((p) => p.def) };
		t.angleParams.forEach((p, i) => {
			for (const v of [p.min, p.max]) {
				const r = buildCell({ id: t.id, angles: d.angles.map((q, j) => (j === i ? v : q)), sides: d.sides });
				expect(`${t.label} ${p.key}=${v}: ${r.ok ? "ok" : r.reason}`).toBe(`${t.label} ${p.key}=${v}: ok`);
			}
		});
		t.sideParams.forEach((p, i) => {
			for (const v of [p.min, p.max]) {
				const r = buildCell({ id: t.id, angles: d.angles, sides: d.sides.map((q, j) => (j === i ? v : q)) });
				expect(`${t.label} ${p.key}=${v}: ${r.ok ? "ok" : r.reason}`).toBe(`${t.label} ${p.key}=${v}: ok`);
			}
		});
	});

	it("gives every tile of the unit its own hue", () => {
		const res = buildCell({ id: t.id });
		if (!res.ok) return;
		const hues = new Set(res.cell.polygons.map((p) => p.hue));
		// Colouring by side count would collapse all of them to one, which is the whole reason the
		// builder assigns by unit index instead.
		expect(hues.size).toBe(Math.min(t.tilesPerUnit, 12));
	});
});

describe("framing", () => {
	/**
	 * `periods` moves the home box and nothing else, which is why it is a constant and not a control:
	 * it cannot show more tiling, because the shader instances the cell over the lattice and the tiling
	 * is already unbounded. A slider for it would only duplicate the wheel, and would fight it, since
	 * changing the framing refits the view.
	 */
	it("scales the framed box and leaves the cell untouched", () => {
		for (const t of PENTAGON_TYPES) {
			if (!hasAssembly(t.id)) continue;
			const mk = (periods?: number) => {
				const r = buildCell({ id: t.id, periods });
				expect(r.ok ? "ok" : r.reason, t.label).toBe("ok");
				return r.cell!;
			};
			const small = mk(2);
			const large = mk(8);
			expect(large.home.width / small.home.width, t.label).toBeCloseTo(4, 9);
			expect(large.polygons, t.label).toEqual(small.polygons);
			expect(large.mesh.fillVertexCount, t.label).toBe(small.mesh.fillVertexCount);
			// Omitting it uses HOME_PERIODS.
			expect(mk().home.width, t.label).toBeCloseTo(mk(HOME_PERIODS).home.width, 12);
		}
	});
});

describe("buildCell failure modes", () => {
	it("names the reason instead of drawing something plausible", () => {
		expect(buildCell({ id: 99 }).reason).toContain("no type");
		// Type 3's B slider runs to 175°; well past that the pentagon stops closing.
		const bad = buildCell({ id: 3, angles: [350] });
		expect(bad.ok).toBe(false);
		expect(typeof bad.reason).toBe("string");
	});
});

describe("scale normalisation", () => {
	/**
	 * The reason this exists: `solvePentagon` pins a = 1, which is arbitrary (these types classify
	 * pentagons up to similarity), and on several types it makes the tile's area swing wildly across the
	 * family. Type 7 is the worst — a is the odd side out, and E from 95° to 145° takes the other four
	 * from 0.4148 to 1.5139. Drawing that directly reads as the camera zooming while it has not moved.
	 */
	it("holds tile area constant across every type's parameter range", () => {
		for (const t of PENTAGON_TYPES) {
			if (!hasAssembly(t.id)) continue;
			for (const free of sampleTuples(t.id)) {
				const res = buildCell({ id: t.id, angles: free });
				if (!res.ok) continue;
				for (const poly of res.cell.polygons) {
					expect(`${t.label} tile area`).toBe(`${t.label} tile area`);
					expect(area(poly.vertices)).toBeCloseTo(1, 9);
				}
			}
		}
	});

	it("makes the lattice cell exactly the tile count, so home framing is parameter-free", () => {
		for (const t of PENTAGON_TYPES) {
			if (!hasAssembly(t.id)) continue;
			const seen = new Set<string>();
			for (const free of sampleTuples(t.id)) {
				const res = buildCell({ id: t.id, angles: free });
				if (!res.ok) continue;
				const det = Math.abs(
					res.cell.v1[0] * res.cell.v2[1] - res.cell.v1[1] * res.cell.v2[0],
				);
				expect(det).toBeCloseTo(t.tilesPerUnit, 9);
				seen.add(res.cell.home.width.toFixed(9));
			}
			// One distinct home width for the whole family: the framing no longer depends on the sliders.
			expect(`${t.label}: ${seen.size} home widths`).toBe(`${t.label}: 1 home widths`);
		}
	});

	// The proof of tiling must survive the rescale: a similarity maps a tiling to a tiling, so this is
	// really a check that the scale was applied to the lattice vectors and the tiles together.
	it("still tiles after scaling", () => {
		for (const t of PENTAGON_TYPES) {
			if (!hasAssembly(t.id)) continue;
			const res = buildCell({ id: t.id });
			if (!res.ok) continue;
			const unit = res.cell.polygons.map((p) => p.vertices as Point[]);
			const { areaError, overlapping } = tilesCleanly(
				unit,
				{ x: res.cell.v1[0], y: res.cell.v1[1] },
				{ x: res.cell.v2[0], y: res.cell.v2[1] },
			);
			expect(`${t.label}: ${overlapping} overlaps`).toBe(`${t.label}: 0 overlaps`);
			expect(areaError).toBeLessThan(1e-9);
		}
	});
});
