// What a board's corners are as geometry: the angle of each, in the plane, the hyperbolic plane or on the
// sphere. Drawing a tiling (develop.ts) and generating a board's vertices (the editor's Quick setup) both
// read the board through this, so the two cannot disagree about a corner.
//
// A face is taken as a regular polygon. Pi corners inside a face are points on its sides: `M3 Pi M3 Pi
// M3 Pi` is a triangle whose sides are cut in two, so an M3 corner has the angle of a triangle with sides
// of two edges. Marek's hyperbolic boards are built this way: 1247_1_0612 has faces whose sides are cut
// into 1, 2, 4 and 7 edges, and edge length 1.0612751; its 121 vertices are exactly the multisets of at
// most 12 corners that close at that length (checked, with 123_1_4657 and hybrid_2_9830 likewise).
import { interiorAngle } from "@/lib/render/hyperbolicDevelopClient";
import { angleDegrees, type Board, type Face } from "./board";

export type Shape =
	| { kind: "pi" }
	| { kind: "digon" }
	| { kind: "set"; rad: number }
	/** A corner of a regular n-gon (n null: an apeirogon) whose sides are cut into `seg` edges. */
	| { kind: "polygon"; n: number | null; seg: number }
	| { kind: "unknown"; why: string };

export type Geometry = "plane" | "hyperbolic" | "sphere";

const TWO_PI = 2 * Math.PI;

/** A face's polygon: its corners other than Pi, and the edges per side, when the Pi corners are evenly spaced. */
function polygonOf(f: Face): { n: number | null; seg: number } | null {
	const full = f.repeat === "inf" ? f.word : Array.from({ length: f.repeat }, () => f.word).flat();
	const at = full.flatMap((c, i) => (c === "Pi" ? [] : [i]));
	if (!at.length || full.length % at.length) return null;
	const seg = full.length / at.length;
	if (at.some((i, j) => i - at[0] !== j * seg)) return null; // the sides must be cut alike
	return { n: f.repeat === "inf" ? null : at.length, seg };
}

/** Where each declared corner's angle comes from. */
export function cornerShapes(board: Board): Map<string, Shape> {
	const out = new Map<string, Shape>();
	for (const a of board.angles) {
		const deg = angleDegrees(a.value);
		const faces = board.faces.filter((f) => f.word.includes(a.sym));
		const polys = faces.map(polygonOf);
		const kinds = new Set(polys.map((p) => (p ? `${p.n}/${p.seg}` : "irregular")));
		let shape: Shape;
		if (a.sym === "Pi") shape = { kind: "pi" };
		else if (faces.length && faces.every((f) => f.repeat !== "inf" && f.word.length * f.repeat === 2))
			shape = { kind: "digon" };
		else if (deg !== null) shape = { kind: "set", rad: (deg * Math.PI) / 180 };
		else if (a.value === "free") shape = { kind: "unknown", why: "has a free angle" };
		else if (!faces.length) shape = { kind: "unknown", why: "is in no face" };
		else if (kinds.has("irregular"))
			shape = { kind: "unknown", why: "is in a face whose Pi corners do not cut its sides alike" };
		else if (kinds.size > 1) shape = { kind: "unknown", why: "occurs in faces of different shapes" };
		else shape = { kind: "polygon", ...polys[0]! };
		out.set(a.sym, shape);
	}
	return out;
}

/** A corner's angle in radians, or null where it has none (an apeirogon on the sphere, an unknown corner). */
export function cornerAngle(s: Shape | undefined, g: Geometry, edge: number): number | null {
	if (!s || s.kind === "unknown") return null;
	if (s.kind === "pi") return Math.PI;
	if (s.kind === "digon") return 0;
	if (s.kind === "set") return s.rad;
	if (g === "plane") return s.n === null ? Math.PI : Math.PI - TWO_PI / s.n;
	if (g === "hyperbolic") return interiorAngle(s.n ?? 0, s.seg * edge);
	if (s.n === null) return null;
	const c = Math.cos(Math.PI / s.n) / Math.cos((s.seg * edge) / 2); // the sphere: sin(α/2) = cos(π/n) / cos(s/2)
	return c > 0 && c <= 1 ? 2 * Math.asin(c) : null;
}

/** The edge length at which `word` closes to 360° in `g`, or null if it closes at none. */
export function solveEdge(word: string[], shapes: Map<string, Shape>, g: Geometry): number | null {
	if (g === "plane" || !word.length) return null;
	const sum = (l: number) => word.reduce((t, c) => t + (cornerAngle(shapes.get(c), g, l) ?? NaN), 0);
	const flat = word.reduce((t, c) => t + (cornerAngle(shapes.get(c), "plane", 0) ?? NaN), 0);
	if (!Number.isFinite(flat)) return null;
	// the hyperbolic sum falls from the flat sum as the edge grows, the spherical one rises
	if (g === "hyperbolic" ? flat <= TWO_PI : flat >= TWO_PI) return null;
	let lo = 0;
	let hi = g === "hyperbolic" ? 1 : 1e-3;
	const past = (l: number) => (g === "hyperbolic" ? sum(l) < TWO_PI : !(sum(l) < TWO_PI)); // NaN: past the sphere's limit
	while (!past(hi) && hi < 64) hi *= 2;
	for (let i = 0; i < 200; i++) {
		const mid = (lo + hi) / 2;
		if (past(mid)) hi = mid;
		else lo = mid;
	}
	const l = (lo + hi) / 2;
	return Math.abs(sum(l) - TWO_PI) < 1e-9 ? l : null;
}

/**
 * Every vertex that closes: each multiset of 2 to `max` corners whose angles add up to 360° in `g` at
 * `edge`. Digons are left out (any number of them closes nothing), and so is a corner with no angle; both
 * come back in `skipped` with the reason.
 */
export function closingVertices(
	board: Board,
	g: Geometry,
	edge: number,
	max: number,
	tol = 1e-6,
): { words: string[][]; skipped: { sym: string; why: string }[] } {
	const shapes = cornerShapes(board);
	const skipped: { sym: string; why: string }[] = [];
	const corners: { sym: string; a: number }[] = [];
	for (const { sym } of board.angles) {
		const s = shapes.get(sym)!;
		const a = cornerAngle(s, g, edge);
		if (s.kind === "digon") skipped.push({ sym, why: "a digon marks an edge; it adds no angle" });
		else if (a === null || !(a > 1e-9))
			skipped.push({
				sym,
				why: s.kind === "unknown" ? s.why : `has no angle ${g === "sphere" ? "on the sphere" : "here"}`,
			});
		else corners.push({ sym, a });
	}
	const words: string[][] = [];
	const cur: string[] = [];
	const rec = (i: number, left: number) => {
		if (Math.abs(left) < tol) {
			if (cur.length >= 2) words.push([...cur]);
			return; // every angle is positive: a closed vertex can take no more
		}
		if (left < -tol || i === corners.length || cur.length >= max) return;
		const { sym, a } = corners[i];
		const room = max - cur.length;
		let m = 0;
		for (; m < room && (m + 1) * a <= left + tol; m++) cur.push(sym);
		for (; m >= 1; m--) {
			rec(i + 1, left - m * a); // with m copies of corner i, then fewer
			cur.pop();
		}
		rec(i + 1, left);
	};
	rec(0, TWO_PI);
	const order = new Map(board.angles.map((a, i) => [a.sym, i]));
	const key = (w: string[]) => w.map((s) => String(order.get(s)).padStart(4, "0")).join(" ");
	for (const w of words) w.sort((x, y) => order.get(x)! - order.get(y)!);
	words.sort((x, y) => x.length - y.length || key(x).localeCompare(key(y)));
	return { words, skipped };
}
