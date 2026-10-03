// Does drawing Connor Hill's .off models directly give the same picture as the regenerated solids?
//
//   pnpm tsx experiments/noble-polyhedra/compare-models.ts <clone of noble-tools-revised>
//
// Each model is put through the SAME renderer geometry as the shipped solid (flatSolidTriangles for the
// fill, solidCreaseList for the lines where faces cut through each other) and the two are compared:
// vertices by position, faces as cycles, total filled area, and the crease ink.
import fs from "node:fs";
import path from "node:path";
import { cycleKey, nobleId, nobleSolid } from "../../lib/render/nobleSolids";
import { flatSolidTriangles, solidCreaseList } from "../../lib/render/sphericalGeometry";
import type { Polyhedron, Vec3 } from "../../lib/render/platonicSolids";

const lib = path.join(process.argv[2], "library");
const offs: string[] = [];
for (const a of fs.readdirSync(lib)) {
	const d = path.join(lib, a);
	if (!fs.statSync(d).isDirectory()) continue;
	for (const b of fs.readdirSync(d)) for (const f of fs.readdirSync(path.join(d, b))) if (f.endsWith(".off")) offs.push(path.join(d, b, f));
}
const area = (p: Polyhedron) => {
	const { positions: q } = flatSolidTriangles(p);
	let s = 0;
	for (let t = 0; t < q.length; t += 9) {
		const u = [q[t + 3] - q[t], q[t + 4] - q[t + 1], q[t + 5] - q[t + 2]];
		const v = [q[t + 6] - q[t], q[t + 7] - q[t + 1], q[t + 8] - q[t + 2]];
		s += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
	}
	return s;
};
// Length of the UNION of the crease segments: grouped by the line they lie on, overlaps counted once.
// ⚑ Not the plain sum. D-4 and D-5 have coplanar faces, so one line carries the crease of several face
// pairs and the segments overlap; how they overlap depends on the order the faces are listed in, and the
// sum then differs by 2% between two listings of the same solid while the ink on screen is identical.
function creases(p: Polyhedron): number {
	const lines: { u: number[]; foot: number[]; iv: [number, number][] }[] = [];
	for (const c of solidCreaseList(p)) {
		let u = [c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]];
		const len = Math.hypot(...u);
		u = u.map((x) => x / len);
		const t = c.a[0] * u[0] + c.a[1] * u[1] + c.a[2] * u[2];
		const foot = [c.a[0] - t * u[0], c.a[1] - t * u[1], c.a[2] - t * u[2]];
		let line = lines.find((L) => Math.hypot(L.foot[0] - foot[0], L.foot[1] - foot[1], L.foot[2] - foot[2]) < 1e-6 && Math.abs(Math.abs(L.u[0] * u[0] + L.u[1] * u[1] + L.u[2] * u[2]) - 1) < 1e-9);
		if (!line) lines.push((line = { u, foot, iv: [] }));
		const t0 = c.a[0] * line.u[0] + c.a[1] * line.u[1] + c.a[2] * line.u[2];
		const t1 = c.b[0] * line.u[0] + c.b[1] * line.u[1] + c.b[2] * line.u[2];
		line.iv.push([Math.min(t0, t1), Math.max(t0, t1)]);
	}
	let total = 0;
	for (const { iv } of lines) {
		iv.sort((x, y) => x[0] - y[0]);
		let [lo, hi] = iv[0];
		for (const [x, y] of iv.slice(1)) {
			if (x <= hi + 1e-7) hi = Math.max(hi, y);
			else {
				total += hi - lo;
				[lo, hi] = [x, y];
			}
		}
		total += hi - lo;
	}
	return total;
}

let worstVertex = 0;
let worstArea = 0;
let worstCrease = 0;
let differ = 0;
for (const file of offs) {
	const symbol = path.basename(file, ".off");
	const L = fs.readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
	const [nv, nf] = L[1].split(/\s+/).map(Number);
	const raw = L.slice(2, 2 + nv).map((l) => l.split(/\s+/).map(Number) as Vec3);
	const far = Math.max(...raw.map((v) => Math.hypot(...v)));
	const model: Polyhedron = {
		id: `model-${symbol}`,
		schlafli: [0, 0],
		vertexConfig: "",
		name: symbol,
		vertices: raw.map((v) => [v[0] / far, v[1] / far, v[2] / far] as Vec3),
		faces: L.slice(2 + nv, 2 + nv + nf).map((l) => l.split(/\s+/).slice(1).map(Number)),
	};
	const ours = nobleSolid(nobleId(symbol))!;
	const map = model.vertices.map((v) => {
		let best = -1;
		let dist = Infinity;
		ours.vertices.forEach((w, k) => {
			const e = Math.hypot(v[0] - w[0], v[1] - w[1], v[2] - w[2]);
			if (e < dist) [dist, best] = [e, k];
		});
		worstVertex = Math.max(worstVertex, dist);
		return best;
	});
	const want = new Set(model.faces.map((f) => cycleKey(f.map((v) => map[v]))));
	const same = ours.vertices.length === nv && ours.faces.length === nf && new Set(map).size === nv && ours.faces.every((f) => want.has(cycleKey(f)));
	const da = Math.abs(area(model) - area(ours)) / area(ours);
	const [c1, c2] = [creases(model), creases(ours)];
	const dc = Math.abs(c1 - c2) / Math.max(c2, 1e-9);
	worstArea = Math.max(worstArea, da);
	worstCrease = Math.max(worstCrease, dc);
	if (!same || da > 1e-5 || dc > 1e-5) {
		differ++;
		console.log(`  DIFFERS ${symbol}: same vertices and faces ${same}, area off by ${da.toExponential(2)}, crease ink ${c1.toFixed(6)} vs ${c2.toFixed(6)}`);
	}
}
console.log(`${offs.length} models compared, ${differ} differ`);
console.log(`largest vertex gap ${worstVertex.toExponential(2)}, filled area within ${worstArea.toExponential(2)}, crease ink within ${worstCrease.toExponential(2)} (relative)`);
