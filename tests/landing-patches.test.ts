import { describe, expect, it } from "vitest";
import {
	fitViewBox,
	hatOutline,
	isohedralPatch,
	isohedralTile,
	penroseSun,
	polygonArea,
} from "@/lib/render/landingPatches";

describe("hatOutline", () => {
	it("is the 13-vertex aperiodic monotile", () => {
		expect(hatOutline()).toHaveLength(13);
	});

	it("has the area of eight kites (8·√3 in hex units)", () => {
		expect(polygonArea(hatOutline())).toBeCloseTo(8 * Math.sqrt(3), 10);
	});
});

describe("penroseSun", () => {
	const sun = penroseSun();

	it("is five rhombs of four vertices each", () => {
		expect(sun).toHaveLength(5);
		for (const r of sun) expect(r).toHaveLength(4);
	});

	it("uses unit-side thick rhombs (area sin 72°)", () => {
		for (const r of sun) {
			for (let i = 0; i < 4; i++) {
				const [x0, y0] = r[i];
				const [x1, y1] = r[(i + 1) % 4];
				expect(Math.hypot(x1 - x0, y1 - y0)).toBeCloseTo(1, 10);
			}
			expect(polygonArea(r)).toBeCloseTo(Math.sin((72 * Math.PI) / 180), 10);
		}
	});

	it("closes around the shared vertex: rhomb r's far arm is rhomb r+1's near arm", () => {
		for (let r = 0; r < 5; r++) {
			const a = sun[r][3]; // arm at base + 36°
			const b = sun[(r + 1) % 5][1]; // next rhomb's arm at base − 36°
			expect(a[0]).toBeCloseTo(b[0], 10);
			expect(a[1]).toBeCloseTo(b[1], 10);
		}
	});
});

describe("isohedralTile (IH1)", () => {
	const SAMPLES = 12;
	const tile = isohedralTile(SAMPLES);

	it("closes as one loop of 6 edges, no vertex repeated", () => {
		expect(tile).toHaveLength(6 * SAMPLES);
		for (let i = 0; i < tile.length; i++) {
			const j = (i + 1) % tile.length;
			expect(Math.hypot(tile[j][0] - tile[i][0], tile[j][1] - tile[i][1])).toBeGreaterThan(1e-9);
		}
	});

	it("puts its six corners on the unit hexagon, whatever the edges do between them", () => {
		for (let k = 0; k < 6; k++) {
			const corner = tile[k * SAMPLES];
			expect(corner[0]).toBeCloseTo(Math.cos((Math.PI / 3) * k), 10);
			expect(corner[1]).toBeCloseTo(Math.sin((Math.PI / 3) * k), 10);
		}
	});

	it("is TTTTTT: edge k+3 reversed is edge k translated by −(v_k + v_{k+1})", () => {
		for (let k = 0; k < 3; k++) {
			const tx = -(Math.cos((Math.PI / 3) * k) + Math.cos((Math.PI / 3) * (k + 1)));
			const ty = -(Math.sin((Math.PI / 3) * k) + Math.sin((Math.PI / 3) * (k + 1)));
			for (let i = 0; i < SAMPLES; i++) {
				const forward = tile[k * SAMPLES + i];
				// Edge k+3 runs the other way, so sample i of edge k lands on sample SAMPLES−i of it —
				// index 0 of edge k+3 being the corner v_{k+3}, which is edge k's LAST sample translated.
				const back = tile[(((k + 3) * SAMPLES + (SAMPLES - i)) % tile.length + tile.length) % tile.length];
				expect(back[0]).toBeCloseTo(forward[0] + tx, 10);
				expect(back[1]).toBeCloseTo(forward[1] + ty, 10);
			}
		}
	});

	it("keeps the hexagon's area — the sine swings out as far as it swings in", () => {
		expect(polygonArea(tile)).toBeCloseTo((3 * Math.sqrt(3)) / 2, 6);
	});
});

describe("isohedralPatch (IH1)", () => {
	it("covers the lattice with no tile placed twice", () => {
		const patch = isohedralPatch(2);
		expect(patch).toHaveLength(25); // (2·2 + 1)²
		const centres = new Set(
			patch.map((t) => {
				const cx = t.reduce((s, p) => s + p[0], 0) / t.length;
				const cy = t.reduce((s, p) => s + p[1], 0) / t.length;
				return `${cx.toFixed(6)},${cy.toFixed(6)}`;
			}),
		);
		expect(centres.size).toBe(patch.length);
	});

	it("tiles without gaps: the tiles' total area is the area of the lattice cell times their count", () => {
		const patch = isohedralPatch(2);
		const total = patch.reduce((s, t) => s + polygonArea(t), 0);
		// The lattice cell of T_0 = (−3/2, −√3/2) and T_2 = (3/2, −√3/2) has area 3√3/2 — exactly one
		// tile, which is what "one tile per lattice point, no overlap and no gap" means.
		expect(total).toBeCloseTo((patch.length * 3 * Math.sqrt(3)) / 2, 5);
	});
});

describe("fitViewBox", () => {
	it("fits the polygons with margin", () => {
		const vb = fitViewBox([[[0, 0], [2, 0], [2, 1], [0, 1]]], 0.1).split(" ").map(Number);
		expect(vb[0]).toBeCloseTo(-0.2);
		expect(vb[1]).toBeCloseTo(-0.1);
		expect(vb[2]).toBeCloseTo(2.4);
		expect(vb[3]).toBeCloseTo(1.2);
	});
});
