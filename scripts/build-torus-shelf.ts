// Builds the squared-tori shelf: public/squarings/torus/*.json + index.json.
//
// Companion to build-squaring-shelf.ts, one genus up. Where that script sweeps a polyhedron's edges
// for battery choices, this one sweeps a periodic tiling's homology classes, because on a torus the
// battery is replaced by a class in H¹(T;ℝ) ≅ ℝ² and the integral classes (m, n) are the ones with
// integer sides. See lib/squaring/torusSquaring.ts for the construction and why genus 1 is special.
//
// The shard carries the CELL, not the squaring: the client rebuilds the quotient map and re-runs the
// exact solve whenever the reader moves the class, exactly as the polyhedron page re-solves on a new
// battery edge. At these sizes (E ≤ 30) that is a sub-millisecond Bareiss elimination, and shipping a
// precomputed record for each of 61 classes would store the same cell 61 times over.
//
// Refuses to write anything if a record fails certification, matching the discipline in
// build-planigon-shelf.mjs: a shelf that ships an uncertified tiling is worse than no shelf.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { buildTorusMap, halfTurn, type TorusCell, type TorusMap } from "@/lib/squaring/torusMap";
import { squareTorus, torusClasses } from "@/lib/squaring/torusSquaring";
import { TORUS_CATEGORIES, type TorusIndex, type TorusIndexEntry, type TorusRecord, type TorusThumb } from "@/lib/squaring/shelf";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "squarings", "torus");
const CLASS_LIMIT = 6;
const MAX_EDGES = 30;

interface AtlasRecord {
	id: string;
	k?: number;
	cell: TorusCell;
}

/**
 * Read one reference atlas. `geom.s` holds tile PROTOTYPES all anchored at the origin and `geom.v`
 * holds placements; `renderCell.i` is a flat list of (prototype, placement) pairs. Reading `i` as a
 * plain list of shape indices instead — the obvious guess — silently doubles the cell's area.
 */
function readAtlas(file: string): AtlasRecord[] {
	const raw = JSON.parse(readFileSync(path.join(ROOT, "public", file), "utf8")) as {
		geom: { s: { vertices: [number, number][] }[]; v: [number, number][] };
		records: { id: string; k?: number; renderCell?: { b: [[number, number], [number, number]]; i: number[] } }[];
	};
	const out: AtlasRecord[] = [];
	for (const r of raw.records) {
		const rc = r.renderCell;
		if (!rc) continue;
		const polygons: [number, number][][] = [];
		for (let k = 0; k < rc.i.length / 2; k++) {
			const [ox, oy] = raw.geom.v[rc.i[2 * k + 1]];
			polygons.push(raw.geom.s[rc.i[2 * k]].vertices.map((p) => [p[0] + ox, p[1] + oy] as [number, number]));
		}
		out.push({ id: r.id, k: r.k, cell: { polygons, basis: rc.b } });
	}
	return out;
}

const S3 = Math.sqrt(3);
const ring = (cx: number, cy: number, n: number, r: number, phase = 0): [number, number][] =>
	Array.from(
		{ length: n },
		(_, i) => [cx + r * Math.cos(phase + (2 * Math.PI * i) / n), cy + r * Math.sin(phase + (2 * Math.PI * i) / n)] as [number, number],
	);

// The uniform tilings are CONSTRUCTED here rather than pulled from the atlas, and that is a deliberate
// split. The atlas does contain them, but mostly as members of parametric families caught at a flexed
// position: combinatorially the square tiling, geometrically a rhombus. The construction only ever
// reads combinatorics, so those would give correct squarings under a picture that looks wrong. A
// regularity check below refuses anything whose tiles are not regular polygons of one common edge
// length, so the folder holds the textbook objects and the atlas supplies the k-uniform examples.

/** Every tile a regular polygon, and one edge length throughout. */
function isRegular(cell: TorusCell): boolean {
	let len: number | null = null;
	for (const poly of cell.polygons) {
		const n = poly.length;
		const cx = poly.reduce((a, p) => a + p[0], 0) / n;
		const cy = poly.reduce((a, p) => a + p[1], 0) / n;
		const r0 = Math.hypot(poly[0][0] - cx, poly[0][1] - cy);
		for (const p of poly) {
			if (Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - r0) > 1e-6 * Math.max(1, r0)) return false;
		}
		for (let i = 0; i < n; i++) {
			const a = poly[i];
			const b = poly[(i + 1) % n];
			const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
			if (len === null) len = d;
			else if (Math.abs(d - len) > 1e-6 * Math.max(1, len)) return false;
		}
	}
	return true;
}

function rhombitrihexagonal(): TorusCell {
	const hex = ring(0, 0, 6, 1);
	const t = 1 + S3;
	// A square stands on each hexagon edge, pushed out along that edge's outward normal. Six edges, each
	// shared with the next hexagon, so three squares per cell.
	const squares: [number, number][][] = [];
	for (let k = 0; k < 3; k++) {
		const P = hex[k];
		const Q = hex[(k + 1) % 6];
		const nl = Math.hypot((P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2);
		const nx = (P[0] + Q[0]) / 2 / nl;
		const ny = (P[1] + Q[1]) / 2 / nl;
		squares.push([P, [P[0] + nx, P[1] + ny], [Q[0] + nx, Q[1] + ny], Q]);
	}
	// A triangle fills the notch where two consecutive squares meet at a hexagon vertex. Six vertices,
	// each triangle shared by three hexagons, so two per cell.
	const triangles: [number, number][][] = [
		[hex[1], squares[0][2], squares[1][1]],
		[hex[2], squares[1][2], squares[2][1]],
	];
	// The lattice runs along the edge NORMALS (30°, 90°, 150°), not the vertex directions: neighbouring
	// hexagons face each other across a square, at a centre distance of 1 + √3.
	return {
		polygons: [hex, ...squares, ...triangles],
		basis: [
			[(t * S3) / 2, t / 2],
			[0, t],
		],
	};
}

/**
 * Eight of the eleven Archimedean tilings. Snub square, snub hexagonal and 4.6.12 are left out for now
 * — they are chiral or three-tile cells that need more care to lay out than the rest, and a wrong cell
 * would be caught by the checks but is not worth the guesswork here.
 */
function uniformCells(): { id: string; name: string; cell: TorusCell }[] {
	/** Circumradius of a regular n-gon of side 1. */
	const circum = (n: number) => 1 / (2 * Math.sin(Math.PI / n));
	const R8 = circum(8);
	const R12 = circum(12);
	const t8 = 1 + Math.SQRT2;
	const t12 = 2 + S3;
	const hex = ring(0, 0, 6, 1);
	return [
		{
			id: "uniform-4444",
			name: "4.4.4.4 · square",
			cell: {
				polygons: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 1],
					],
				],
				basis: [
					[1, 0],
					[0, 1],
				],
			},
		},
		{
			id: "uniform-36",
			name: "3⁶ · triangular",
			cell: {
				polygons: [
					[
						[0, 0],
						[1, 0],
						[0.5, S3 / 2],
					],
					[
						[1, 0],
						[1.5, S3 / 2],
						[0.5, S3 / 2],
					],
				],
				basis: [
					[1, 0],
					[0.5, S3 / 2],
				],
			},
		},
		{
			id: "uniform-63",
			name: "6³ · hexagonal",
			cell: { polygons: [hex], basis: [[1.5, S3 / 2], [0, S3]] },
		},
		{
			id: "uniform-3636",
			name: "3.6.3.6 · trihexagonal",
			cell: {
				polygons: [
					hex,
					[hex[0], [1.5, S3 / 2], hex[1]],
					[hex[0], [1.5, -S3 / 2], hex[5]],
				],
				basis: [
					[2, 0],
					[1, S3],
				],
			},
		},
		{
			id: "uniform-488",
			name: "4.8.8 · truncated square",
			cell: {
				polygons: [ring(0, 0, 8, R8, Math.PI / 8), ring(t8 / 2, t8 / 2, 4, Math.SQRT2 / 2, 0)],
				basis: [
					[t8, 0],
					[0, t8],
				],
			},
		},
		{ id: "uniform-3464", name: "3.4.6.4 · rhombitrihexagonal", cell: rhombitrihexagonal() },
		{
			id: "uniform-31212",
			name: "3.12.12 · truncated hexagonal",
			cell: {
				// Dodecagons share their 12–12 edges; a triangle fills each remaining notch, two per cell.
				polygons: [
					ring(0, 0, 12, R12, Math.PI / 12),
					[
						[t12 / 2, 0.5],
						[t12 / 2 + 0.5, 0.5 + S3 / 2],
						[t12 / 2 - 0.5, 0.5 + S3 / 2],
					],
					[
						[t12 / 2, -0.5],
						[t12 / 2 - 0.5, -0.5 - S3 / 2],
						[t12 / 2 + 0.5, -0.5 - S3 / 2],
					],
				],
				basis: [
					[t12, 0],
					[t12 / 2, (t12 * S3) / 2],
				],
			},
		},
		{
			id: "uniform-33344",
			name: "3.3.3.4.4 · elongated triangular",
			cell: {
				// Rows of squares alternating with rows of triangles; the offset row makes a2 shear.
				polygons: [
					[
						[0, 0],
						[1, 0],
						[1, 1],
						[0, 1],
					],
					[
						[0, 1],
						[1, 1],
						[0.5, 1 + S3 / 2],
					],
					[
						[1, 1],
						[1.5, 1 + S3 / 2],
						[0.5, 1 + S3 / 2],
					],
				],
				basis: [
					[1, 0],
					[0.5, 1 + S3 / 2],
				],
			},
		},
	];
}

/**
 * The picker's 54px patch of the tiling.
 *
 * Takes the T-junction-SPLIT polygons, the same ones stage 1 draws, so a row and the figure it opens
 * are the same picture at two sizes. Scaled by the longer lattice vector and rounded to three decimals,
 * which is a tenth of a pixel at that size and keeps the whole index under 25 KB.
 */
function torusThumb(map: TorusMap): TorusThumb {
	const [a1, a2] = map.basis;
	const s = Math.max(Math.hypot(a1[0], a1[1]), Math.hypot(a2[0], a2[1])) || 1;
	const r = (v: number) => Math.round((v / s) * 1000) / 1000;
	return {
		polygons: map.polygons.map((poly) => poly.map((p) => [r(p[0]), r(p[1])] as [number, number])),
		basis: [
			[r(a1[0]), r(a1[1])],
			[r(a2[0]), r(a2[1])],
		],
	};
}

/** Files swept for the k-uniform examples, most structured first. */
const SWEEP = [
	"reference-atlas-period.json",
	"reference-atlas-period-k3.json",
	"reference-atlas-composable.json",
	"reference-atlas-planigon.json",
	"reference-atlas-tri45.json",
	"reference-atlas-euhalf.json",
];

interface Candidate {
	id: string;
	name: string;
	category: string;
	cell: TorusCell;
	k: number;
}

function main(): void {
	const atlas = new Map<string, AtlasRecord[]>();
	const load = (f: string): AtlasRecord[] => {
		const hit = atlas.get(f);
		if (hit) return hit;
		const recs = readAtlas(f);
		atlas.set(f, recs);
		return recs;
	};

	const candidates: Candidate[] = [];
	for (const u of uniformCells()) {
		if (!isRegular(u.cell)) {
			console.error(`${u.id}: tiles are not regular polygons of one edge length`);
			process.exit(1);
		}
		candidates.push({ id: u.id, name: u.name, category: "Uniform tilings", cell: u.cell, k: 1 });
	}

	// k-uniform examples. Ranked by how much the squaring actually varies — most distinct sizes first —
	// so the folder opens on the tilings that make the construction visible rather than on whichever
	// record happens to sort first.
	const chosen = new Set(candidates.map((c) => c.id));
	const scored: { c: Candidate; distinct: number; perfect: number; order: number }[] = [];
	const classes = torusClasses(CLASS_LIMIT);
	for (const file of SWEEP) {
		for (const rec of load(file)) {
			if (chosen.has(rec.id)) continue;
			const k = rec.k ?? 0;
			if (k < 2 || k > 3) continue;
			const built = buildTorusMap(rec.cell);
			if (!built.ok || built.map.E > MAX_EDGES || built.map.E < 6) continue;
			let best = 0;
			let order = 0;
			let perfect = 0;
			for (const [m, n] of classes) {
				const r = squareTorus(built.map, m, n);
				if (!r.ok) continue;
				if (r.squaring.distinct > best) {
					best = r.squaring.distinct;
					order = r.squaring.order;
				}
				if (r.squaring.perfect) perfect += 1;
			}
			if (best < 4) continue;
			scored.push({
				c: {
					id: rec.id,
					name: rec.id,
					category: k === 2 ? "2-uniform" : "3-uniform",
					cell: rec.cell,
					k,
				},
				distinct: best,
				perfect,
				order,
			});
		}
	}
	// A perfect squaring is the rarer and more interesting exhibit, so those lead each folder.
	scored.sort((a, b) => (b.perfect > 0 ? 1 : 0) - (a.perfect > 0 ? 1 : 0) || b.distinct - a.distinct);
	for (const cat of ["2-uniform", "3-uniform"]) {
		let taken = 0;
		for (const s of scored) {
			if (s.c.category !== cat || taken >= 8) continue;
			candidates.push(s.c);
			taken += 1;
		}
	}

	const entries: TorusIndexEntry[] = [];
	const shards: TorusRecord[] = [];
	for (const c of candidates) {
		const built = buildTorusMap(c.cell);
		if (built.ok === false) {
			console.error(`${c.id}: ${built.error.reason} — ${built.error.detail}`);
			process.exit(1);
			return;
		}
		const map = built.map;
		const ht = halfTurn(map);
		let bestClass: [number, number] = [1, 0];
		let bestDistinct = -1;
		let bestOrder = -1;
		let solved = 0;
		let perfect = 0;
		for (const [m, n] of torusClasses(CLASS_LIMIT)) {
			const r = squareTorus(map, m, n);
			if (r.ok === false) {
				// `area` and `inconsistent` mean the construction itself broke, which must stop the build.
				if (r.error.reason === "area" || r.error.reason === "inconsistent") {
					console.error(`${c.id} class (${m},${n}): ${r.error.reason} — ${r.error.detail}`);
					process.exit(1);
				}
				continue;
			}
			solved += 1;
			if (r.squaring.perfect) perfect += 1;
			if (
				r.squaring.distinct > bestDistinct ||
				(r.squaring.distinct === bestDistinct && r.squaring.order > bestOrder)
			) {
				bestDistinct = r.squaring.distinct;
				bestOrder = r.squaring.order;
				bestClass = [m, n];
			}
		}
		if (solved === 0) {
			console.error(`${c.id}: no class produced a squaring`);
			process.exit(1);
		}
		if (ht.present && ht.moves > 0 && perfect > 0) {
			console.error(`${c.id}: half-turn moves ${ht.moves} edges yet ${perfect} perfect squarings — the rule is wrong`);
			process.exit(1);
		}
		const tiles = map.polygons.map((p) => p.length).sort((a, b) => a - b);
		entries.push({
			id: c.id,
			name: c.name,
			category: c.category,
			thumb: torusThumb(map),
			k: c.k,
			counts: { vertices: map.V, edges: map.E, faces: map.F },
			tiles,
			halfTurn: ht.present && ht.moves > 0,
			classes: solved,
			perfect,
			bestClass,
			bestOrder,
			bestDistinct,
		});
		shards.push({
			id: c.id,
			name: c.name,
			category: c.category,
			k: c.k,
			cell: c.cell,
			counts: { vertices: map.V, edges: map.E, faces: map.F },
			tiles,
			halfTurn: ht.present && ht.moves > 0,
			halfTurnMoves: ht.moves,
			tjunctions: map.tjunctions,
			bestClass,
		});
	}

	if (existsSync(OUT)) rmSync(OUT, { recursive: true });
	mkdirSync(OUT, { recursive: true });
	for (const s of shards) writeFileSync(path.join(OUT, `${s.id}.json`), JSON.stringify(s));
	const index: TorusIndex = { classLimit: CLASS_LIMIT, entries };
	writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index));

	const perfectRecords = entries.filter((e) => e.perfect > 0).length;
	console.log(
		`wrote ${shards.length} squared-tori records to public/squarings/torus/ · ` +
			`${entries.reduce((a, e) => a + e.classes, 0)} certified squarings · ` +
			`${perfectRecords} records with a perfect one · ` +
			`${entries.filter((e) => e.halfTurn).length} carrying a half-turn`,
	);
	for (const cat of TORUS_CATEGORIES) {
		const n = entries.filter((e) => e.category === cat).length;
		if (n > 0) console.log(`  ${cat}: ${n}`);
	}
}

main();
