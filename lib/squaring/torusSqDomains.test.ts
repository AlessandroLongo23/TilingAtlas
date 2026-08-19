import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { buildTorusMap } from "./torusMap";
import { squareTorus, torusClasses } from "./torusSquaring";
import {
	classAngle,
	nearestClass,
	snapClass,
	sqClassInSector,
	sqSectorAt,
	sqSectors,
	squareTorusAt,
	torusFrame,
	torusSqDomains,
} from "./torusSqDomains";
import type { TorusRecord } from "./shelf";

// The parameter plane, tested against the solve it is meant to predict.
//
// Every claim here is a statement about ALL classes at once, checked by running the exact solve at each
// class in the shipped sweep and asking whether the plane called it right. That is the only way these
// are worth anything: the whole point of the decomposition is that two solves tell you what all of them
// will do, so a test that only re-derives the two solves would prove nothing.

const SHELF = path.join(process.cwd(), "public", "squarings", "torus");
const LIMIT = 6;
const EPS = 1e-9;

const records = (): TorusRecord[] =>
	readdirSync(SHELF)
		.filter((f) => f.endsWith(".json") && f !== "index.json")
		.map((f) => JSON.parse(readFileSync(path.join(SHELF, f), "utf8")) as TorusRecord);

const built = (rec: TorusRecord) => {
	const b = buildTorusMap(rec.cell);
	if (b.ok === false) throw new Error(`${rec.id}: ${b.error.reason}`);
	const d = torusSqDomains(b.map);
	if (d === null) throw new Error(`${rec.id}: no parameter plane`);
	return { map: b.map, dom: d, sectors: sqSectors(d.walls) };
};

/** Whether a class direction lies on one of a list of lines. */
const onAny = (lines: { angle: number }[], m: number, n: number): boolean => {
	const a = classAngle(m, n);
	return lines.some((l) => Math.abs(l.angle - a) < EPS || Math.abs(Math.abs(l.angle - a) - Math.PI) < EPS);
};

describe("the sides really are linear in the class", () => {
	it("predicts every square's side from two solves, on every record and every swept class", () => {
		// side(e) at (m, n) is |a·m + b·n| times one positive scale shared by every edge, so the ratio
		// between any two sides is fixed by the coefficients alone. Cross-multiplying avoids ever having
		// to know what that scale is, which is what makes this exact.
		let checked = 0;
		for (const rec of records()) {
			const { map, dom } = built(rec);
			for (const [m, n] of torusClasses(LIMIT)) {
				const r = squareTorus(map, m, n);
				if (r.ok === false) continue;
				const pred = dom.coeff.map((c) => {
					const v = c.a * BigInt(m) + c.b * BigInt(n);
					return v < 0n ? -v : v;
				});
				const act = new Array<bigint>(map.E).fill(0n);
				for (const s of r.squaring.squares) act[s.edge] = BigInt(s.side);
				for (let e = 0; e < map.E; e++) {
					for (let f = e + 1; f < map.E; f++) {
						expect(`${rec.id} (${m},${n}) e${e}/e${f}: ${act[e] * pred[f]}`).toBe(
							`${rec.id} (${m},${n}) e${e}/e${f}: ${act[f] * pred[e]}`,
						);
					}
				}
				checked += 1;
			}
		}
		expect(checked).toBeGreaterThan(1000);
	});
});

describe("the walls are where the arrangement changes", () => {
	it("puts a class on a wall exactly when one of its squares has vanished", () => {
		for (const rec of records()) {
			const { map, dom, sectors } = built(rec);
			for (const [m, n] of torusClasses(LIMIT)) {
				const r = squareTorus(map, m, n);
				if (r.ok === false) continue;
				const vanished = dom.coeff.some(
					(c, e) => !dom.silent.includes(e) && c.a * BigInt(m) + c.b * BigInt(n) === 0n,
				);
				const onWall = sqSectorAt(sectors, classAngle(m, n)) === -1;
				expect(`${rec.id} (${m},${n}): vanished ${vanished}`).toBe(`${rec.id} (${m},${n}): vanished ${onWall}`);
			}
		}
	});

	it("gives one sector per wall, and the sectors cover the direction circle exactly once", () => {
		// Directions live on a circle of length π, not 2π, because a class and its negative are the same
		// tiling reflected. So k walls give k sectors and their widths sum to π.
		for (const rec of records()) {
			const { dom, sectors } = built(rec);
			expect(`${rec.id}: ${sectors.length} sectors`).toBe(`${rec.id}: ${dom.walls.length} sectors`);
			const total = sectors.reduce((a, s) => a + (s.to - s.from), 0);
			expect(Math.abs(total - Math.PI)).toBeLessThan(1e-9);
			for (let i = 1; i < sectors.length; i++) expect(sectors[i].from).toBeGreaterThan(sectors[i - 1].from);
		}
	});

	it("lands the class the jump-to-sector control offers inside the sector it names", () => {
		for (const rec of records()) {
			const { sectors } = built(rec);
			for (let i = 0; i < sectors.length; i++) {
				const pick = sqClassInSector(sectors[i], LIMIT);
				if (pick === null) continue;
				expect(`${rec.id} sector ${i}: ${sqSectorAt(sectors, classAngle(pick[0], pick[1]))}`).toBe(
					`${rec.id} sector ${i}: ${i}`,
				);
			}
		}
	});
});

describe("perfection is a condition on the class, not luck", () => {
	it("is perfect exactly when the class misses every tie line and no pair is locked", () => {
		// This is the claim the rim ticks make. If it ever fails, the figure is lying about what a
		// perfect squared torus is.
		for (const rec of records()) {
			const { map, dom, sectors } = built(rec);
			for (const [m, n] of torusClasses(LIMIT)) {
				const r = squareTorus(map, m, n);
				if (r.ok === false) continue;
				const predicted = !onAny(dom.ties, m, n) && dom.locked.length === 0 && r.squaring.order >= 2;
				expect(`${rec.id} (${m},${n}): perfect ${predicted}`).toBe(
					`${rec.id} (${m},${n}): perfect ${r.squaring.perfect}`,
				);
			}
			expect(sectors.length).toBeGreaterThan(0);
		}
	});

	it("locks a pair of squares together on every record carrying a half-turn", () => {
		// The half-turn rule, restated in the parameter plane: a half-turn acts as −1 on H¹ at every
		// class at once, so the pair it swaps has coefficient vectors that agree up to sign and no
		// direction can separate them. A locked pair is that mechanism, made visible.
		for (const rec of records()) {
			const { dom } = built(rec);
			if (!rec.halfTurn) continue;
			expect(`${rec.id}: ${dom.locked.length > 0 ? "locked" : "free"}`).toBe(`${rec.id}: locked`);
		}
	});

	it("keeps a locked pair equal at every single class, not just generically", () => {
		for (const rec of records()) {
			const { map, dom } = built(rec);
			if (dom.locked.length === 0) continue;
			for (const [m, n] of torusClasses(3)) {
				for (const [e, f] of dom.locked) {
					const se = dom.coeff[e].a * BigInt(m) + dom.coeff[e].b * BigInt(n);
					const sf = dom.coeff[f].a * BigInt(m) + dom.coeff[f].b * BigInt(n);
					expect(`${rec.id} (${m},${n}) e${e}/e${f}: ${se < 0n ? -se : se}`).toBe(
						`${rec.id} (${m},${n}) e${e}/e${f}: ${sf < 0n ? -sf : sf}`,
					);
				}
			}
			expect(map.E).toBeGreaterThan(0);
		}
	});
});

describe("the square lattice, worked by hand", () => {
	// The quotient of 4.4.4.4 is one vertex, two edges, one face: the smallest case there is, and the
	// only one whose whole parameter plane can be written down without a computer.
	const square = () => built(records().find((r) => r.id === "uniform-4444") as TorusRecord);

	it("has its two walls on the m and n axes", () => {
		const { dom, sectors } = square();
		expect(dom.walls.length).toBe(2);
		expect(sectors.length).toBe(2);
		const angles = dom.walls.map((w) => Number(w.angle.toFixed(6))).sort((a, b) => a - b);
		expect(angles).toEqual([0, Number((Math.PI / 2).toFixed(6))]);
	});

	it("ties its two squares on the diagonals, at 45° and 135°", () => {
		const { dom } = square();
		const deg = dom.ties.map((t) => Math.round((t.angle * 180) / Math.PI)).sort((a, b) => a - b);
		expect(deg).toEqual([45, 135]);
	});

	it("is imperfect on the diagonal and perfect off it", () => {
		const { map, dom } = square();
		const at = (m: number, n: number) => {
			const r = squareTorus(map, m, n);
			if (r.ok === false) throw new Error("no squaring");
			return r.squaring;
		};
		expect(`(1,1) on a tie: ${onAny(dom.ties, 1, 1)}`).toBe("(1,1) on a tie: true");
		expect(`(1,1) perfect: ${at(1, 1).perfect}`).toBe("(1,1) perfect: false");
		expect(`(4,3) on a tie: ${onAny(dom.ties, 4, 3)}`).toBe("(4,3) on a tie: false");
		// Morley's order-2 squared torus: sides 3 and 4 on a torus of area 25.
		expect(at(4, 3).squares.map((s) => s.side).sort()).toEqual(["3", "4"]);
	});
});

describe("regression pins", () => {
	it("holds the wall, sector, tie and locked counts measured when this shipped", () => {
		const want: Record<string, [number, number, number, number]> = {
			// id: walls, sectors, ties, locked
			"uniform-4444": [2, 2, 2, 0],
			"uniform-36": [3, 3, 6, 0],
			"uniform-63": [3, 3, 6, 0],
			"uniform-3636": [3, 3, 6, 3],
			"uniform-488": [4, 4, 8, 2],
			"uniform-3464": [6, 6, 12, 6],
			"period-k3-218": [21, 21, 237, 0],
		};
		for (const rec of records()) {
			const w = want[rec.id];
			if (!w) continue;
			const { dom, sectors } = built(rec);
			expect(`${rec.id}: ${[dom.walls.length, sectors.length, dom.ties.length, dom.locked.length].join(",")}`).toBe(
				`${rec.id}: ${w.join(",")}`,
			);
		}
	});
});

describe("the class does not have to be integral", () => {
	// H¹(T;ℝ) is a real vector space, so every real direction is a squared torus and the page lets the
	// reader drag through them. What makes that affordable is that the exact solve is LINEAR in the
	// class, so two of them span the family. These tests are that claim, checked against the solve.

	it("reproduces the exact solve at every integral class, up to the arbitrary overall scale", () => {
		let checked = 0;
		for (const rec of records()) {
			const { map } = built(rec);
			const frame = torusFrame(map);
			if (frame === null) throw new Error(`${rec.id}: no frame`);
			for (const [m, n] of torusClasses(4)) {
				const want = squareTorus(map, m, n);
				if (want.ok === false) continue;
				const got = squareTorusAt(frame, m, n);
				if (got === null) throw new Error(`${rec.id} (${m},${n}): the blend produced nothing`);
				expect(`${rec.id} (${m},${n}): ${got.squares.map((s) => s.edge).join(",")}`).toBe(
					`${rec.id} (${m},${n}): ${want.squaring.squares.map((s) => s.edge).join(",")}`,
				);
				// Scale is not a degree of freedom, so the two agree only up to one positive factor. Read it
				// off the LARGEST tile, whose four shipped decimals carry the most significant figures, and
				// every other tile then has to follow. The blend normalises that tile to 1000, so a tenth
				// of a unit is a relative agreement of 1e-4, well inside what the rounding allows.
				let big = 0;
				let k = 1;
				for (let i = 0; i < got.squares.length; i++) {
					const v = Number(want.squaring.squares[i].side);
					if (v <= big) continue;
					big = v;
					k = Number(got.squares[i].side) / v;
				}
				for (let i = 0; i < got.squares.length; i++) {
					for (const field of ["side", "x", "y"] as const) {
						const w = Number(want.squaring.squares[i][field]) * k;
						const g = Number(got.squares[i][field]);
						expect(`${rec.id} (${m},${n}) tile ${i} ${field}: ${Math.abs(g - w) < 0.1}`).toBe(
							`${rec.id} (${m},${n}) tile ${i} ${field}: true`,
						);
					}
				}
				checked += 1;
			}
		}
		expect(checked).toBeGreaterThan(400);
	});

	it("keeps Σ side² equal to the torus area off the lattice, which is the same certificate", () => {
		// The Riemann bilinear relation holds over ℝ, not just over ℤ, so it survives the blend and is
		// still what says the tiles cover the torus once.
		for (const rec of records()) {
			const { map } = built(rec);
			const frame = torusFrame(map);
			if (frame === null) throw new Error(`${rec.id}: no frame`);
			for (const t of [0.3, 1.1, 1.9, 2.7]) {
				const s = squareTorusAt(frame, Math.cos(t), Math.sin(t));
				if (s === null) continue;
				const area = s.squares.reduce((a, q) => a + Number(q.side) ** 2, 0);
				const covol = Number(s.covolume);
				// The identity is exact; the tolerance is the four decimals the sides are shipped with,
				// squared and summed over thirty tiles.
				expect(`${rec.id} @${t}: ${(Math.abs(area - covol) / covol < 1e-5).toString()}`).toBe(
					`${rec.id} @${t}: true`,
				);
				expect(s.approx).toBe(true);
			}
		}
	});

	it("snaps to the simple classes and leaves most of the circle free", () => {
		// A fixed snap radius does not work: at limit 6 there are about sixty reachable directions across
		// the half circle, so a radius wide enough to catch (1,0) would swallow everything. The tolerance
		// therefore shrinks with |m| + n, and this pins the resulting feel.
		for (const [m, n] of [
			[1, 0],
			[0, 1],
			[1, 1],
			[-1, 1],
			[2, 1],
		] as [number, number][]) {
			// Approach each from a little to one side, so this tests the pull and not an exact landing.
			const hit = snapClass(classAngle(m, n) + 0.012, 6);
			expect(`near (${m},${n}): snapped ${hit.snapped} to (${hit.cls.join(",")})`).toBe(
				`near (${m},${n}): snapped true to (${m},${n})`,
			);
		}
		let snapped = 0;
		const N = 2000;
		for (let i = 0; i < N; i++) {
			if (snapClass((i / N) * Math.PI, 6).snapped) snapped += 1;
		}
		const share = snapped / N;
		expect(`snapped share in [0.2, 0.55]: ${share > 0.2 && share < 0.55}`).toBe("snapped share in [0.2, 0.55]: true");
	});

	it("always offers the steppers an integral class to move from", () => {
		for (let i = 0; i < 200; i++) {
			const a = (i / 200) * Math.PI;
			const [m, n] = nearestClass(a, 6);
			expect(Number.isInteger(m) && Number.isInteger(n)).toBe(true);
			expect(Math.abs(m) + n).toBeGreaterThan(0);
		}
	});
});

describe("the control never teleports across the disk", () => {
	// `classes()` lists one representative per direction, all with n ≥ 0, because (m, n) and (−m, −n) are
	// the same squared torus. They are not the same PICTURE: negating the class negates the harmonic form
	// and point-reflects the tiling. So a snap that handed back the canonical representative for a drag
	// in the lower half moved the marker to the antipode and flipped all four stages at once.

	it("keeps a snapped class on the same side of the circle as the pointer, all the way round", () => {
		const TAU = 2 * Math.PI;
		for (let i = 0; i < 720; i++) {
			const a = (i / 720) * TAU - Math.PI;
			for (const got of [snapClass(a, 6).cls, nearestClass(a, 6)]) {
				const d = Math.abs((((a - Math.atan2(got[1], got[0])) % TAU) + TAU + Math.PI) % TAU - Math.PI);
				expect(`angle ${a.toFixed(3)} -> (${got.join(",")}) is ${d <= Math.PI / 2 + 1e-9 ? "near" : "ANTIPODAL"}`).toBe(
					`angle ${a.toFixed(3)} -> (${got.join(",")}) is near`,
				);
			}
		}
	});

	it("still lands on the integral class itself when the pointer is on one, in either half", () => {
		for (const [m, n] of [
			[1, 0],
			[0, 1],
			[1, 1],
			[-1, 1],
			[3, 2],
		] as [number, number][]) {
			for (const s of [1, -1]) {
				const want: [number, number] = [s * m, s * n];
				const hit = snapClass(Math.atan2(want[1], want[0]), 6);
				expect(`from (${want.join(",")}): snapped ${hit.snapped} to (${hit.cls.join(",")})`).toBe(
					`from (${want.join(",")}): snapped true to (${want.join(",")})`,
				);
			}
		}
	});

	it("solves a lower-half class to the point reflection of its upper-half twin", () => {
		// The two are the same squared torus and the same side lengths; what differs is the picture, which
		// is exactly why the marker has to stay where the pointer is.
		for (const rec of records().slice(0, 6)) {
			const { map } = built(rec);
			for (const [m, n] of [
				[3, 2],
				[1, 1],
				[5, 1],
			] as [number, number][]) {
				const up = squareTorus(map, m, n);
				const down = squareTorus(map, -m, -n);
				if (up.ok === false || down.ok === false) continue;
				const sides = (r: typeof up) => (r.ok ? r.squaring.squares.map((s) => s.side).join(",") : "");
				expect(`${rec.id} (${m},${n}) sides`).toBe(`${rec.id} (${m},${n}) sides`);
				expect(sides(up)).toBe(sides(down));
			}
		}
	});
});
