// The atlas's sides-1-2 scaled shelf against the new engine's tilings, matched 1:1 by geometry.
// A tiling's key: per tile in one period, its shape (perimeter) and the distances and shapes of every tile
// within R, as a multiset over the period reduced by its gcd (a supercell keys like its primitive cell).
// Rotations, reflections and translations leave it unchanged, so congruent tilings always share a key.
// Groups holding more than one tiling on either side are keyed again at the next radius in RADII; a group
// still uneven at the largest is a duplicate on one side (or a miss on the other) and is printed.
// usage: pnpm tsx experiments/k-flat-vertices-2026-10-27/match.ts <k>
// needs work/scaled_3_4_6_12-new from run.ts. Writes unmatched.json for drawing.
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeAtlas } from "../../lib/services/atlasCodec";
import { parse } from "../../tools/searcher/app/src/board";
import { certificatesIn, decode, flatCell, geometry, vertexWords } from "../../tools/searcher/app/src/develop";

const K = Number(process.argv[2]);
// irrational radii: a cutoff on a lattice distance would fall in or out by float noise
const RADII = [4.618034, 7.2360679, 10.0905];
type T = { name: string; polys: number[][][]; b: number[][]; meta: string };

const area = (v: number[][]) =>
	Math.abs(v.reduce((t, p, i) => t + p[0] * v[(i + 1) % v.length][1] - v[(i + 1) % v.length][0] * p[1], 0)) / 2;
const per = (v: number[][]) =>
	v.reduce((t, p, i) => t + Math.hypot(p[0] - v[(i + 1) % v.length][0], p[1] - v[(i + 1) % v.length][1]), 0);
const centroid = (v: number[][]) => {
	// the area centroid: a vertex average would move with the Pi points along a side
	let [cx, cy, a] = [0, 0, 0];
	v.forEach((p, i) => {
		const q = v[(i + 1) % v.length];
		const c = p[0] * q[1] - q[0] * p[1];
		[cx, cy, a] = [cx + (p[0] + q[0]) * c, cy + (p[1] + q[1]) * c, a + c];
	});
	return [cx / (3 * a), cy / (3 * a)];
};
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

// Every coordinate here is (a + b√3)/2 with whole a, b (sides 1 and 2, angles of 30°, a vertex at the
// origin). The atlas stores 6 decimals; snapping both sides to the exact value keeps a rounding difference
// from moving a distance across the 0.001 grid the key uses.
const S3 = Math.sqrt(3);
function snap(x: number): number {
	for (let m = 0; m <= 100; m++)
		for (const b of m ? [m, -m] : [0]) {
			const a = Math.round(2 * x - b * S3);
			if (Math.abs((a + b * S3) / 2 - x) < 2e-6) return (a + b * S3) / 2;
		}
	throw new Error(`coordinate ${x} is not (a + b√3)/2`);
}
const snapAll = (t: T) => {
	t.polys = t.polys.map((v) => v.map((p) => p.map(snap)));
	t.b = t.b.map((p) => p.map(snap));
};

function key(t: T, R: number): { key: string; problem?: string } {
	const det = Math.abs(t.b[0][0] * t.b[1][1] - t.b[0][1] * t.b[1][0]);
	const tiles = t.polys.map((v) => ({ c: centroid(v), s: Math.round(per(v)) }));
	const sum = t.polys.reduce((s, v) => s + area(v), 0);
	if (Math.abs(sum - det) > 1e-3 * det) return { key: "", problem: `tiles cover ${sum.toFixed(3)}, cell ${det.toFixed(3)}` };
	// a reduced basis (Lagrange), then enough translates to hold every tile within R of a tile of the cell
	let [u, v] = t.b.map((p) => [...p]);
	for (let it = 0; it < 100; it++) {
		if (Math.hypot(...u) > Math.hypot(...v)) [u, v] = [v, u];
		const m = Math.round((u[0] * v[0] + u[1] * v[1]) / (u[0] * u[0] + u[1] * u[1]));
		if (!m) break;
		v = [v[0] - m * u[0], v[1] - m * u[1]];
	}
	t.b = [u, v];
	const diam = Math.max(...tiles.flatMap((a) => tiles.map((o) => Math.hypot(a.c[0] - o.c[0], a.c[1] - o.c[1]))));
	const L = Math.ceil((R + diam) / (det / Math.hypot(...v))) + 1;
	const desc = new Map<string, number>();
	for (const a of tiles) {
		const near: string[] = [];
		for (let i = -L; i <= L; i++)
			for (let j = -L; j <= L; j++)
				for (const o of tiles) {
					const x = o.c[0] + i * t.b[0][0] + j * t.b[1][0] - a.c[0];
					const y = o.c[1] + i * t.b[0][1] + j * t.b[1][1] - a.c[1];
					const d = Math.hypot(x, y);
					if (d < R && d > 1e-6) near.push(`${d.toFixed(3)}/${o.s}`);
				}
		const k = createHash("sha1").update(`${a.s}[${near.sort().join(",")}]`).digest("hex");
		desc.set(k, (desc.get(k) ?? 0) + 1);
	}
	const g = [...desc.values()].reduce(gcd);
	return { key: [...desc].map(([k, n]) => `${n / g}x${k}`).sort().join(";") };
}

const atlas: T[] = [];
const file = `public/reference-atlas-scaled${K <= 2 ? "" : `-k${K}`}.json.gz`;
for (const x of decodeAtlas<any>(JSON.parse(gunzipSync(readFileSync(join(__dirname, "../..", file))).toString()))) {
	if (x.k !== K || !/^\[(1,)?2\]$/.test(JSON.stringify(x.tilePeriods))) continue;
	atlas.push({ name: x.id, polys: x.renderCell.cellPolygons.map((p: any) => p.vertices), b: x.renderCell.basis, meta: x.family });
}
const out = join(__dirname, "work/scaled_3_4_6_12-new/solver_scaled_3_4_6_12");
const board = parse(readFileSync(join(out, "../input.board"), "utf8")).board;
const engine: T[] = [];
for (const f of readdirSync(out).filter((f) => f.includes(`solver_${String(K).padStart(2, "0")}_`)))
	for (const c of certificatesIn(readFileSync(join(out, f), "utf8"))) {
		const w = vertexWords(c);
		if (!w.some((x) => x.length >= 3 && x.includes("Pi"))) continue; // the shelf keeps T-junction tilings
		const g = geometry(board, w);
		if (g.kind !== "plane") throw new Error("no plane drawing");
		const cell = flatCell(decode(c, board), board, g.turn);
		engine.push({
			name: `${f}#${engine.length}`,
			polys: cell.p!.map((q: any) => q.v),
			b: cell.b as number[][],
			meta: w.map((x) => x.join(".")).join(" | "),
		});
	}

type Group = { atlas: T[]; engine: T[]; r: number };
const problems = new Set<string>();
/** The tilings split by their key at radius RADII[r]. */
function split(g: Group): Group[] {
	const out = new Map<string, Group>();
	for (const side of ["atlas", "engine"] as const)
		for (const t of g[side]) {
			const { key: k, problem } = key(t, RADII[g.r]);
			if (problem && !problems.has(t.name)) problems.add(t.name), console.log(`!! ${side} ${t.name}: ${problem}`);
			(out.get(k) ?? out.set(k, { atlas: [], engine: [], r: g.r }).get(k)!)[side].push(t);
		}
	return [...out.values()];
}
for (const t of [...atlas, ...engine]) snapAll(t);
let todo = split({ atlas, engine, r: 0 });
const done: Group[] = [];
while (todo.length) {
	const g = todo.pop()!;
	if ((g.atlas.length <= 1 && g.engine.length <= 1) || g.r + 1 === RADII.length) done.push(g);
	else todo.push(...split({ ...g, r: g.r + 1 }));
}
let [pairs, dupA, dupE, onlyA, onlyE] = [0, 0, 0, 0, 0];
const unmatched: { side: string; name: string; meta: string; polys: number[][][]; b: number[][] }[] = [];
for (const g of done) {
	pairs += Math.min(g.atlas.length, g.engine.length);
	if (g.atlas.length > g.engine.length) (g.engine.length ? (dupA += g.atlas.length - g.engine.length) : (onlyA += g.atlas.length));
	if (g.engine.length > g.atlas.length) (g.atlas.length ? (dupE += g.engine.length - g.atlas.length) : (onlyE += g.engine.length));
	if (g.atlas.length !== g.engine.length || g.atlas.length > 1) {
		console.log(`atlas ${g.atlas.length}, engine ${g.engine.length} (still together at R ${RADII[g.r]})`);
		for (const t of g.atlas) console.log(`   atlas  ${t.name}  (${t.meta})`), unmatched.push({ side: "atlas", ...t });
		for (const t of g.engine) console.log(`   engine ${t.name}  ${t.meta}`), unmatched.push({ side: "engine", ...t });
	}
}
// tilings the doubled palette (d- ids) lacks: groups whose atlas copies all come from the 123 palette (s- ids)
const onlyS = done.filter((g) => g.engine.length && g.atlas.length && g.atlas.every((t) => t.name.startsWith("s-")));
console.log(`groups matched only by s- records: ${onlyS.length}`);
for (const g of onlyS) console.log(`   ${g.atlas.map((t) => t.name).join(", ")}  =  ${g.engine.map((t) => t.name).join(", ")}`);
writeFileSync(join(__dirname, `unmatched-k${K}.json`), JSON.stringify(unmatched));
console.log(
	`k=${K}: atlas ${atlas.length}, engine ${engine.length}; ${done.length} distinct, ${pairs} matched 1:1, ` +
		`${dupA} atlas tilings with a congruent atlas twin, ${dupE} engine tilings with a congruent engine twin, ` +
		`${onlyA} only in the atlas, ${onlyE} only in the engine`,
);
