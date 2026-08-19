// Builds the squared-cylinder shelf: public/squarings/cylinder/*.json + index.json.
//
// Third of three, after build-squaring-shelf.ts (sphere) and build-torus-shelf.ts (genus 1). The
// hyperbolic case has no closed surface to divide by, so what gets squared is a ball with its boundary
// shorted to one vertex, and the answer tiles a cylinder. See lib/squaring/cylinderSquaring.ts.
//
// Refuses to write on any failure. The two certificates — Σ current² = I·H, and every dual loop closing
// on a multiple of the total current — are checked in exact integers inside squareCylinder, so reaching
// this script's happy path already means the tiling closes up.

import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { buildBall, diskLayout } from "@/lib/squaring/hyperbolicBall";
import { squareCylinder } from "@/lib/squaring/cylinderSquaring";
import { planarMapFromFaces } from "@/lib/squaring/planarMap";
import type { CylinderIndex, CylinderIndexEntry, CylinderLayerData, CylinderRecord } from "@/lib/squaring/shelf";

const OUT = path.join(process.cwd(), "public", "squarings", "cylinder");

/**
 * {3,q} for a spread of q, hyperbolic only.
 *
 * The Euclidean {3,6} used to ship here as a control, because it is the one member of the family whose
 * walk is recurrent, so its circumference decays instead of converging and its cylinder collapses. AL
 * pulled it from the picker on 2026-08-19. The finding is not lost, only unshipped: the direct-solve
 * tests in cylinderSquaring.test.ts still compute {3,6} and still assert that it turns over while {3,7}
 * climbs, so the comparison stays checked even though the shelf no longer displays it.
 */
const FAMILY: { q: number; name: string; maxVertices: number }[] = [
	{ q: 7, name: "{3,7} · order-7 triangular", maxVertices: 260 },
	{ q: 8, name: "{3,8} · order-8 triangular", maxVertices: 260 },
	{ q: 9, name: "{3,9} · order-9 triangular", maxVertices: 260 },
	{ q: 12, name: "{3,12} · order-12 triangular", maxVertices: 260 },
];

const round = (v: number, dp = 6): number => Number(v.toFixed(dp));

/**
 * The picker's 54px patch of the {3,q} tiling.
 *
 * Grown to the largest radius that still fits in 60 vertices, which is r = 3 for {3,6} and r = 1 for
 * {3,12}: at that size the readable signal is how many triangles meet at the centre, and a denser ball
 * only turns into a smudge. Scaled to fill the box, so the thumbnail is a patch of the tiling and makes
 * no claim to be the Poincaré disk; the figure on the page is where the geodesics and the rim live.
 */
function ballThumb(q: number): { points: [number, number][]; edges: [number, number][] } {
	let best: { ball: ReturnType<typeof buildBall>; map: NonNullable<ReturnType<typeof planarMapFromFaces>> } | null = null;
	for (const r of [1, 2, 3]) {
		const ball = buildBall(q, r);
		if (ball.vertexCount > 60) break;
		const map = planarMapFromFaces(ball.faces, ball.vertexCount);
		if (map) best = { ball, map };
	}
	if (!best) return { points: [], edges: [] };
	const raw = diskLayout(best.ball, best.map.faces);
	let far = 0;
	for (const p of raw) if (p) far = Math.max(far, Math.hypot(p.x, p.y));
	const k = far > 0 ? 0.96 / far : 1;
	const at = new Map<number, number>();
	const points: [number, number][] = [];
	raw.forEach((p, v) => {
		if (!p) return;
		at.set(v, points.length);
		points.push([round(p.x * k, 3), round(p.y * k, 3)]);
	});
	const edges: [number, number][] = [];
	for (const [u, v] of best.map.edges) {
		const a = at.get(u);
		const b = at.get(v);
		// The wired sink has no position; the spokes running to it are not part of the tiling anyway.
		if (a !== undefined && b !== undefined) edges.push([a, b]);
	}
	return { points, edges };
}

function main(): void {
	const records: CylinderRecord[] = [];
	const entries: CylinderIndexEntry[] = [];

	for (const fam of FAMILY) {
		const layers: CylinderLayerData[] = [];
		for (let r = 1; r <= 12; r++) {
			const ball = buildBall(fam.q, r);
			if (ball.vertexCount > fam.maxVertices) break;
			const map = planarMapFromFaces(ball.faces, ball.vertexCount);
			if (!map) {
				console.error(`{3,${fam.q}} r=${r}: face rings do not form a planar map`);
				process.exit(1);
				return;
			}
			const solved = squareCylinder(map, 0, ball.sink);
			if (solved.ok === false) {
				console.error(`{3,${fam.q}} r=${r}: ${solved.error.reason} — ${solved.error.detail}`);
				process.exit(1);
				return;
			}
			// The Euclidean {3,6} lays out in the plane at edge length 1, so its coordinates run out to the
			// ball radius instead of living inside the unit disk. Normalise it into the same box the
			// hyperbolic records occupy, so one figure can draw either without a special case for scale.
			const raw = diskLayout(ball, map.faces);
			let far = 0;
			for (const p of raw) if (p) far = Math.max(far, Math.hypot(p.x, p.y));
			const k = fam.q === 6 && far > 0 ? 0.94 / far : 1;
			const pos = raw.map((p) => (p ? { x: p.x * k, y: p.y * k } : null));
			layers.push({
				radius: r,
				counts: { vertices: map.vertexCount, edges: map.edges.length, faces: map.faces.length },
				circumference: round(solved.squaring.circumference),
				positions: pos.map((p) => (p ? ([round(p.x), round(p.y)] as [number, number]) : null)),
				potential: solved.squaring.potential.map((v) => round(v)),
				edges: map.edges,
				squares: solved.squaring.squares.map((s) => ({
					x: round(s.x),
					y: round(s.y),
					side: round(s.side),
					edge: s.edge,
				})),
			});
			console.log(
				`  {3,${fam.q}} r=${r}: V=${map.vertexCount} E=${map.edges.length} · ` +
					`${solved.squaring.order} squares · circumference ${solved.squaring.circumference.toFixed(6)}`,
			);
		}
		if (layers.length === 0) {
			console.error(`{3,${fam.q}}: no radius fitted the budget`);
			process.exit(1);
			return;
		}
		const id = `hyp-3-${fam.q}`;
		records.push({
			id,
			name: fam.name,
			q: fam.q,
			geometry: fam.q === 6 ? "euclidean" : "hyperbolic",
			layers,
		});
		entries.push({
			id,
			name: fam.name,
			q: fam.q,
			thumb: ballThumb(fam.q),
			geometry: fam.q === 6 ? "euclidean" : "hyperbolic",
			radii: layers.map((l) => l.radius),
			conductance: layers.map((l) => l.circumference),
			maxOrder: Math.max(...layers.map((l) => l.squares.length)),
		});
	}

	// The finding the shelf exists to show: hyperbolic conductance climbs to a limit, Euclidean turns
	// over and decays. If that ever stops being true the corpus has changed under the page.
	for (const e of entries) {
		const c = e.conductance;
		if (c.length < 3) continue;
		const climbing = c[c.length - 1] > c[c.length - 2];
		if (e.geometry === "hyperbolic" && !climbing) {
			console.error(`${e.id}: hyperbolic but conductance is not still climbing at the last radius`);
			process.exit(1);
		}
		if (e.geometry === "euclidean" && climbing) {
			console.error(`${e.id}: Euclidean but conductance is still climbing — recurrence should show as decay`);
			process.exit(1);
		}
	}

	if (existsSync(OUT)) rmSync(OUT, { recursive: true });
	mkdirSync(OUT, { recursive: true });
	for (const r of records) writeFileSync(path.join(OUT, `${r.id}.json`), JSON.stringify(r));
	const index: CylinderIndex = { entries };
	writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index));
	console.log(
		`\nwrote ${records.length} squared-cylinder records · ` +
			`${records.reduce((a, r) => a + r.layers.length, 0)} radii · ` +
			`${records.reduce((a, r) => a + r.layers.reduce((b, l) => b + l.squares.length, 0), 0)} certified squares`,
	);
}

main();
