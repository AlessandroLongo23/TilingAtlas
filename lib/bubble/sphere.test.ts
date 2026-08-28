import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { polyhedronForId } from "@/lib/render/sphericalSolids";
import { sphereMapOf } from "@/lib/bubble/sphere";

/** Deterministic quasi-uniform directions — a Fibonacci sphere, so a failure reproduces exactly. */
const directions = (n: number) =>
	Array.from({ length: n }, (_, i) => {
		const y = 1 - (2 * i + 1) / n;
		const r = Math.sqrt(Math.max(0, 1 - y * y));
		const t = Math.PI * (1 + Math.sqrt(5)) * i;
		return [Math.cos(t) * r, y, Math.sin(t) * r] as [number, number, number];
	});

// THE gate on this shelf, and the exact analogue of the balance equation the Euclidean bubble boards
// are checked against: every edge must carry a BUMP on one side and a BITE on the other. It fails
// exactly when a decoration got the same state twice on one edge, which is the one way a bubble
// tiling can be wrong, and it is checked here against the SHIPPED bytes rather than against the
// generator that wrote them.

const DIR = `${process.cwd()}/public/bubble-sphere`;
const manifest = JSON.parse(readFileSync(`${DIR}/manifest.json`, "utf8")) as
	{ solid: string; coverage: string; total: string; shards: string[] }[];

describe("spherical bubble shelf", () => {
	it("gives every edge one bump and one bite, on every shipped record", () => {
		let records = 0;
		for (const board of manifest) {
			const m = sphereMapOf(polyhedronForId(board.solid)!);
			for (const shard of board.shards) {
				const rows = JSON.parse(readFileSync(`${DIR}/${shard}`, "utf8")) as
					{ id: string; k: number; solid: string; bites: number[][] }[];
				for (const r of rows) {
					records++;
					expect(r.solid, r.id).toBe(board.solid);
					expect(r.bites.map((w) => w.length), r.id).toEqual(m.faceSizes);
					// Walk every dart; its bite bit and its twin's must differ.
					const flat: number[] = r.bites.flat();
					for (let d = 0; d < m.darts; d++)
						expect(flat[d] + flat[m.twin[d]], `${r.id} edge ${m.edgeOf[d]}`).toBe(1);
				}
			}
		}
		expect(records).toBe(29517);
	});

	it("shards agree with the manifest's coverage and with their own filenames", () => {
		for (const board of manifest) {
			for (const shard of board.shards) {
				const k = Number(shard.match(/-k(\d+)\.json$/)?.[1]);
				const rows = JSON.parse(readFileSync(`${DIR}/${shard}`, "utf8")) as { k: number }[];
				expect(rows.length, shard).toBeGreaterThan(0);
				for (const r of rows) expect(r.k, shard).toBe(k);
				// A k<=3 board must not ship a k above the cutoff; a complete one may ship any k.
				if (board.coverage !== "complete") expect(k, shard).toBeLessThanOrEqual(3);
			}
		}
	});

	it("names a shard for every file on disk, and a file for every shard", () => {
		const onDisk = readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "manifest.json").sort();
		expect(manifest.flatMap((b) => b.shards).sort()).toEqual(onDisk);
	});

	// ⚑ The arc CLASSIFIER that used to be checked here is gone with the code it tested. It offset each
	// face-separating plane into a small circle, which is an arc and only an arc — the picker's crenel,
	// dovetail and jigsaw are not circles, so supporting the full set of profiles retired it in favour of
	// meshed tiles. What survives is `bubbleDepth`, the per-board depth budget it established, and the
	// coverage test below, which is the same partition property measured on the mesh instead.

	// The MESH, checked by the one property that catches both failure modes at once. Tiles that overlap
	// push the total area past the sphere's; tiles that leave gaps fall short. Both have happened here —
	// an edge-arc-scaled jigsaw covered 646% of the tetrahedron, and an over-inflated dovetail left three
	// boards 3% short because its flanks crossed and the ear clipper quietly returned a partial fan.
	it("meshes every profile to cover the sphere exactly once", async () => {
		const { buildBubbleSphere } = await import("@/lib/render/sphBubble");
		const { BUBBLE_EDGE_STYLES } = await import("@/lib/bubble/edges");
		const FULL = 4 * Math.PI;
		const bad: string[] = [];
		for (const { value: style } of BUBBLE_EDGE_STYLES)
			for (const board of manifest) {
				if (!board.shards.length) continue;
				const rec = JSON.parse(readFileSync(`${DIR}/${board.shards[0]}`, "utf8"))[0] as { bites: number[][] };
				const built = buildBubbleSphere(polyhedronForId(board.solid), rec.bites, { style, kochLevel: 2 })!;
				// The FILL is the first child; the second is the outline, which has no area to measure.
				const fill = built.object.children[0] as unknown as { geometry: { getAttribute: (n: string) => { array: Float32Array } } };
				const pos = fill.geometry.getAttribute("position").array;
				let area = 0;
				for (let i = 0; i < pos.length; i += 9) {
					const ux = pos[i + 3] - pos[i], uy = pos[i + 4] - pos[i + 1], uz = pos[i + 5] - pos[i + 2];
					const vx = pos[i + 6] - pos[i], vy = pos[i + 7] - pos[i + 1], vz = pos[i + 8] - pos[i + 2];
					area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
				}
				built.dispose();
				// 2% is the chording of the barycentric subdivision, which under-reports a curved tile
				// slightly; an overlap or a gap is an order of magnitude larger than that.
				if (Math.abs(area - FULL) / FULL > 0.02) bad.push(`${style}/${board.solid} ${(100 * (area - FULL) / FULL).toFixed(1)}%`);
			}
		expect(bad).toEqual([]);
	});
});
