import { describe, expect, it } from "vitest";
import { cyclicKey, emptyBoard, serialize } from "./board";
import { withFace } from "./corners";
import { PRESETS, withDrawnFace } from "./freeface";
import { keepNew, lavesName, onBoard, readSizes, systemSpecs, withFamily } from "./family";

const system = (N: number, o: Partial<{ stars: boolean; convex: boolean }> = {}) =>
	systemSpecs({ kind: "system", N, stars: true, convex: false, ...o });

describe("families of faces", () => {
	it("reads sizes with ranges and the apeirogon", () => {
		expect(readSizes("3, 4, 6-8, oo, 4")).toEqual([3, 4, 6, 7, 8, null]);
		expect(readSizes("2")).toBeNull();
		expect(readSizes("8-6")).toBeNull();
		expect(readSizes("")).toBeNull();
	});

	it("lists the stars of the 15° grid, Myers' species among them", () => {
		const stars = system(24);
		// n | 24 and a point under 180 − 360/n − 180: 3 + 5 + 7 + 8 + 9 + 10
		expect(stars).toHaveLength(42);
		const has = (n: number, u: number) => stars.some((s) => s.n === n && s.point === 15 * u);
		// the species of tools/ctrnact-oracle/alphabets/palettes/star24.json
		for (const [n, us] of [
			[3, [1, 2]],
			[4, [2, 3, 4]],
			[6, [2, 4, 5]],
			[8, [1]],
			[12, [2]],
		] as const)
			for (const u of us) expect(has(n, u)).toBe(true);
		expect(system(24, { stars: false, convex: true }).filter((s) => s.n === 2)).toHaveLength(5);
	});

	it("takes the 72° grid to the pentagram-like star, and refuses a grid that does not divide 360°", () => {
		expect(system(5)).toEqual([{ n: 5, seg: 1, point: 72 }]);
		expect(system(5, { stars: false, convex: true })).toEqual([]);
		expect(system(7, { convex: true })).toEqual([]);
	});

	it("keeps the picked faces, skips those on the board, and declares only the corners kept", () => {
		const b = withFace(emptyBoard(), system(24)[0]);
		const { board: full } = withFamily(b, { kind: "system", N: 24, stars: true, convex: false });
		const fresh = full.faces.slice(b.faces.length);
		expect(onBoard(b, full).filter(Boolean)).toHaveLength(1);
		const one = fresh.findIndex((f) => f.repeat === 6 && f.word[0].includes("p"));
		const out = keepNew(b, full, (i) => i === one);
		expect(out.added).toBe(1);
		expect(out.board.angles.map((a) => a.sym).sort()).toEqual([...b.faces[0].word, ...fresh[one].word].sort());
		expect(keepNew(b, full, () => true).added).toBe(fresh.length - 1);
	});

	it("adds the Laves tiles from the atlas's planigons, sides typed by length, the square's plain", () => {
		expect(lavesName([12, 6, 4])).toBe("V4.6.12");
		expect(lavesName([12, 4, 3, 3])).toBe("V3.3.4.12");
		const { board } = withFamily(emptyBoard(), { kind: "laves", all: false });
		expect(board.faces.map((f) => f.trail)).toEqual([
			"V6.6.6",
			"V4.8.8",
			"V4.6.12",
			"V3.12.12",
			"V4.4.4.4",
			"V3.6.3.6",
			"V3.4.6.4",
			"V3.3.4.3.4",
			"V3.3.3.4.4",
			"V3.3.3.3.6",
			"V3.3.3.3.3.3",
		]);
		expect(withFamily(emptyBoard(), { kind: "laves", all: true }).board.faces).toHaveLength(15);
		// at the scale of the tilings with unit edges: the triangle's side is √3, the square's 1, a plain edge
		expect(serialize(board)).toContain("edge Esqrt3 length sqrt3");
		const square = board.faces.find((f) => f.trail === "V4.4.4.4")!;
		expect(square.word.some((c) => board.angles.find((a) => a.sym === c)?.edge)).toBe(false);
		// kept faces bring the lines gluing their edge types
		const kept = keepNew(emptyBoard(), board, (i) => board.faces[i].trail === "V3.4.6.4").board;
		expect(kept.vertices.map((v) => v.word.join(" "))).toEqual(kept.angles.filter((a) => a.edge).map((a) => `${a.sym} ${a.sym}`));
	});
	it("adds a Schwarz triangle, its sides typed by the lengths its angles fix", () => {
		const schwarz = (pqr: [number, number, number]) => withFamily(emptyBoard(), { kind: "schwarz", pqr }).board;
		// (2,4,4) is the half square drawn by hand: legs 1, the √2 side typed and glued to itself
		const half = schwarz([2, 4, 4]);
		const drawn = withDrawnFace(emptyBoard(), PRESETS.find((p) => p.name === "Half square")!.edges);
		expect(cyclicKey(half.faces[0].word)).toBe(cyclicKey(drawn.faces[0].word));
		expect(half.faces[0].trail).toBe("(2,4,4)");
		expect(serialize(half)).toContain("edge Esqrt2 length sqrt2\n");
		expect(half.vertices).toEqual([{ word: ["Esqrt2", "Esqrt2"] }]);
		// (2,3,6) is half the equilateral triangle of side 2; (3,3,3) the triangle of unit sides
		expect(schwarz([2, 3, 6]).faces[0].word).toEqual(["F1_90", "F1_60", "E2", "F1_30", "Esqrt3"]);
		expect(schwarz([3, 3, 3]).faces[0]).toMatchObject({ word: ["F1_60"], repeat: 3 });
		// off the plane every side is typed, named for the corner across it, and an angle may be a fraction
		const h = schwarz([2, 3, 7]);
		expect(h.faces[0].word).toEqual(["F1_90", "E237_7", "F1_60", "E237_2", "F1_180_7", "E237_3"]);
		expect(h.angles.find((a) => a.sym === "F1_180_7")!.value).toBe("180/7");
		// cosh of the side across the right angle, by the law of cosines for angles
		const c = Number(h.angles.find((a) => a.sym === "E237_2")!.edge!.length);
		expect(Math.cosh(c)).toBeCloseTo((Math.cos(Math.PI / 3) * Math.cos(Math.PI / 7)) / (Math.sin(Math.PI / 3) * Math.sin(Math.PI / 7)), 9);
		expect(schwarz([1, 4, 4]).faces).toEqual([]);
	});
	it("adds polyforms and counts those with holes", () => {
		expect(withFamily(emptyBoard(), { kind: "polyform", p: 4, q: 4, n: 7 }).holes).toBe(1);
		expect(withFamily(emptyBoard(), { kind: "polyform", p: 4, q: 4, n: 7 }).board.faces).toHaveLength(107);
	});
});
