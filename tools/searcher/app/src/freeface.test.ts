// Drawn faces: exact closing, the checks a drawing must pass, and the board text it becomes.
import { describe, expect, it } from "vitest";
import { emptyBoard, parse, serialize } from "./board";
import { closingVertices, cornerShapes } from "./corners";
import {
	closers,
	crossing,
	edgesOf,
	faceOf,
	normalize,
	PRESETS,
	problemOf,
	returns,
	withDrawnFace,
	type Edge,
} from "./freeface";

const E = (...pairs: [number, number][]): Edge[] => pairs.map(([dir, len]) => ({ dir, len }));
const preset = (name: string) => PRESETS.find((p) => p.name === name)!.edges;

describe("closing, exactly", () => {
	it("closes every preset", () => {
		for (const p of PRESETS) expect(problemOf(p.edges), p.name).toBeNull();
	});
	it("closes a 30-60-90 triangle only with its irrational side left out", () => {
		// legs 1 and √3 never both whole: the nearest whole path is open
		expect(returns(E([0, 2], [8, 2], [16, 2]))).toBe(true); // equilateral
		expect(returns(E([0, 2], [9, 2], [15, 2]))).toBe(false);
	});
	it("tells a near miss from a closing", () => {
		// 7 east and 4·√3 ≈ 6.93 back: within 0.07, and open
		expect(returns(E([0, 7], [6, 4], [16, 8]))).toBe(false);
	});
	it("closes a dodecagon of unit edges, every 15° turn twice", () => {
		expect(returns(Array.from({ length: 12 }, (_, i) => ({ dir: 2 * i, len: 1 })))).toBe(true);
		expect(returns(Array.from({ length: 24 }, (_, i) => ({ dir: i, len: 1 })))).toBe(true);
	});
});

describe("what a drawing must not do", () => {
	it("finds an edge crossing an earlier one", () => {
		// east 2, north 1, west 1, then south 2 through the first edge
		expect(crossing(E([0, 2], [6, 1], [12, 1], [18, 2]))).toEqual([0, 3]);
	});
	it("finds a fold back", () => {
		expect(problemOf(E([0, 2], [12, 1], [6, 1]))).toMatch(/fold back/);
	});
	it("finds a corner touching another edge", () => {
		// a U whose arms close onto its own base midpoint
		expect(crossing(E([0, 2], [6, 1], [12, 1], [18, 1], [12, 1], [6, 1]))).not.toBeNull();
	});
	it("lets the last edge end on the start", () => {
		expect(crossing(E([0, 1], [6, 1], [12, 1], [18, 1]))).toBeNull();
	});
});

describe("normalize", () => {
	it("merges straight joins and turns a clockwise drawing round", () => {
		const cw = E([0, 1], [0, 1], [18, 1], [12, 2], [6, 1]); // a 2×1 rectangle drawn clockwise, its base in two
		const n = normalize(cw);
		expect(n).toHaveLength(4);
		expect(n.map((e) => e.len).sort()).toEqual([1, 1, 2, 2]);
		expect(returns(n)).toBe(true);
		const { face } = faceOf(cw, "F1");
		expect(face.word.filter((c) => c !== "Pi").every((c) => c === "F1_90")).toBe(true);
	});
	it("merges a straight join across the start", () => {
		expect(normalize(E([0, 1], [6, 1], [12, 2], [18, 1], [0, 1]))).toHaveLength(4);
	});
});

describe("the board line", () => {
	it("writes the shortest repeat", () => {
		expect(faceOf(E([0, 2], [6, 2], [12, 2], [18, 2]), "F1").face).toEqual({ word: ["F1_90", "Pi"], repeat: 4 });
		expect(faceOf(preset("Rhombus 30°"), "F2").face).toEqual({ word: ["F2_30", "F2_150"], repeat: 2 });
	});
	it("writes the L tromino with its reflex corner", () => {
		const { face, angles } = faceOf(preset("L tromino"), "F1");
		expect(face.repeat).toBe(1);
		expect(face.word.filter((c) => c === "Pi")).toHaveLength(2);
		expect(angles.map((a) => `${a.sym} ${a.value}`).sort()).toEqual(["F1_270 270", "F1_90 90"]);
	});
	it("reads back what it wrote, for every preset", () => {
		for (const p of PRESETS) {
			const b = withDrawnFace(emptyBoard(), p.edges);
			const back = edgesOf(b, b.faces[0]);
			expect(back, p.name).not.toBeNull();
			expect(faceOf(back!, "F1").face, p.name).toEqual(b.faces[0]);
		}
	});
	it("survives the board text", () => {
		let b = withDrawnFace(emptyBoard(), preset("L tromino"));
		b = withDrawnFace(b, preset("Trapezoid"));
		const again = parse(serialize(b)).board;
		expect(again.faces).toEqual(b.faces);
		expect(again.angles.map((a) => a.sym)).toEqual(["F1_90", "F1_270", "Pi", "F2_60", "F2_120"]);
	});
	it("keeps its prefix when edited, and drops corners only it used", () => {
		let b = withDrawnFace(emptyBoard(), preset("L tromino"));
		b = withDrawnFace(b, preset("House"), 0);
		expect(b.faces).toHaveLength(1);
		expect(b.angles.map((a) => a.sym).sort()).toEqual(["F1_150", "F1_60", "F1_90"]);
	});
	it("does not read a regular pentagon as a drawing", () => {
		const b = parse("name p\nk 1 1\nangle A5 108\nface A5 x 5\nvertex A5 A5 A5\n").board;
		expect(edgesOf(b, b.faces[0])).toBeNull();
	});
});

describe("closing suggestions", () => {
	it("offers the one edge that closes", () => {
		expect(closers(E([0, 3], [6, 2], [12, 3]))[0]).toEqual(E([18, 2]));
	});
	it("offers two edges when one cannot", () => {
		const two = closers(E([0, 2], [6, 1]));
		expect(two.length).toBeGreaterThan(0);
		for (const c of two) expect(returns([...E([0, 2], [6, 1]), ...c])).toBe(true);
	});
});

describe("Quick setup reads a drawn face", () => {
	it("finds the vertices of L trominoes in the plane", () => {
		const b = withDrawnFace(emptyBoard(), preset("L tromino"));
		const shapes = cornerShapes(b);
		expect(shapes.get("F1_90")).toEqual({ kind: "set", rad: Math.PI / 2 });
		const words = closingVertices(b, "plane", 0, 6).words.map((w) => w.join(" "));
		expect(words).toEqual(expect.arrayContaining(["Pi Pi", "F1_90 F1_270", "F1_90 F1_90 Pi", "F1_90 F1_90 F1_90 F1_90"]));
	});
});
