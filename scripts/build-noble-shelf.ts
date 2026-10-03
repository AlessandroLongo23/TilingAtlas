// Build the noble-polyhedra shelf: lib/render/nobleData.ts and the sph-noble-* rows of
// public/reference-atlas-spherical.json.
//
//   git clone https://github.com/Plasmath/noble-tools-revised /tmp/noble
//   curl -L https://arxiv.org/src/2607.28711 | tar -xz -C /tmp/noble-paper      (optional, for the audit)
//   pnpm tsx scripts/build-noble-shelf.ts /tmp/noble [/tmp/noble-paper/main.tex] [--write]
//
// WHAT COMES FROM WHERE. Connor Hill's repository (GPL-3.0) holds a .off model of every noble polyhedron
// and, per orbit type, the minimal polynomials of the parameters at which one exists. None of his files
// is copied into this repo and none of his coordinates ships. For each solid this script
//
//   1. re-solves the minimal polynomial for the orbit's parameters, to double precision, by Newton from
//      the 14-digit location his summary gives;
//   2. regenerates the vertices as a point-group orbit of the seed (lib/render/nobleSolids.ts);
//   3. takes from his model the one fact the polynomials do not carry: which cycle of the orbit is a
//      face, as vertex indices into the regenerated orbit;
//   4. regenerates every face from that one and REFUSES the record unless the result matches his model
//      vertex for vertex and face for face.
//
// So the model is a check on the output and the source of one index list per solid. The largest
// disagreement between a regenerated vertex and his is printed at the end; it is his rounding, not ours.

import fs from "node:fs";
import path from "node:path";
import { NOBLE_SEED, cycleKey, nobleId, nobleOrbit } from "../lib/render/nobleSolids";
import type { NobleGroup } from "../lib/render/nobleData";
import type { Vec3 } from "../lib/render/platonicSolids";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const write = process.argv.includes("--write");
const [CLONE, TEX] = args;
if (!CLONE) throw new Error("usage: build-noble-shelf.ts <clone of noble-tools-revised> [main.tex] [--write]");
const ROOT = process.cwd();
const ATLAS = path.join(ROOT, "public", "reference-atlas-spherical.json");
const DATA = path.join(ROOT, "lib", "render", "nobleData.ts");
const PAPER = "arXiv:2607.28711";

// ---- minimal polynomials ---------------------------------------------------------------------------

/** "5a^10 + 55a^9 - 4*a^6 - 1" -> coefficients by degree. */
export function parsePoly(src: string): number[] {
	const c: number[] = [];
	for (const m of src.replace(/\s+/g, "").matchAll(/([+-]?)(\d*)\*?([ab]?)(?:\^(\d+))?/g)) {
		if (!m[0]) continue;
		const deg = m[3] ? Number(m[4] ?? 1) : 0;
		c[deg] = (c[deg] ?? 0) + (m[1] === "-" ? -1 : 1) * (m[2] ? Number(m[2]) : 1);
	}
	return Array.from(c, (x) => x ?? 0);
}
const evalPoly = (c: number[], x: number) => c.reduceRight((s, k) => s * x + k, 0);
function polish(c: number[], x0: number): number {
	const d = c.slice(1).map((k, i) => k * (i + 1));
	let x = x0;
	for (let i = 0; i < 50; i++) {
		const step = evalPoly(c, x) / evalPoly(d, x);
		x -= step;
		if (Math.abs(step) < 1e-16 * Math.max(1, Math.abs(x))) break;
	}
	if (Math.abs(x - x0) > 1e-9 * Math.max(1, Math.abs(x0))) throw new Error(`root moved: ${x0} -> ${x}`);
	return x;
}

interface Orbit { a: number; pa: string; b?: number; pb?: string }
const orbits = new Map<string, Orbit>();
const offs: string[] = [];
for (const dof of fs.readdirSync(path.join(CLONE, "library"))) {
	const d1 = path.join(CLONE, "library", dof);
	if (!fs.statSync(d1).isDirectory()) continue;
	for (const type of fs.readdirSync(d1)) {
		const d2 = path.join(d1, type);
		for (const f of fs.readdirSync(d2)) if (f.endsWith(".off")) offs.push(path.join(d2, f));
		const summary = path.join(d2, "summary.txt");
		if (!fs.existsSync(summary)) continue;
		for (const line of fs.readFileSync(summary, "utf8").split("\n").slice(2)) {
			const cols = line.split("|").map((s) => s.trim());
			if (cols.length < 3) continue;
			const pa = cols[2];
			const o: Orbit = { a: polish(parsePoly(pa), Number(cols[1])), pa };
			if (cols.length >= 5) {
				o.pb = cols[4];
				o.b = polish(parsePoly(o.pb), Number(cols[3]));
			}
			orbits.set(cols[0], o);
		}
	}
}

// ---- the paper's Appendix A, for the dual column and as a cross-check on the symmetry ------------

const paper = new Map<string, { sym: string; dual: string }>();
if (TEX) {
	const tex = fs.readFileSync(TEX, "utf8");
	const app = tex.slice(tex.indexOf("Appendix A: List of Noble Polyhedra"), tex.indexOf("Appendix B"));
	for (const m of app.matchAll(/^\s*([A-Za-z]+-[\d.]+)\s*&[^&]*&[^&]*&[^&]*&[^&]*&\s*\$(\*?\d+)\$\s*&\s*([\w.\-]+)/gm))
		paper.set(m[1], { sym: m[2], dual: m[3] });
}
const ORBIFOLD: Record<NobleGroup, string> = { Td: "*332", O: "432", Oh: "*432", I: "532", Ih: "*532" };

// ---- one model at a time ---------------------------------------------------------------------------

function readOff(file: string): { vertices: Vec3[]; faces: number[][] } {
	const lines = fs.readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
	const [nv, nf] = lines[1].split(/\s+/).map(Number);
	return {
		vertices: lines.slice(2, 2 + nv).map((l) => l.split(/\s+/).map(Number) as Vec3),
		faces: lines.slice(2 + nv, 2 + nv + nf).map((l) => l.split(/\s+/).slice(1).map(Number)),
	};
}

const edgeKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
/** Largest distance of a face's vertices from the plane of its first three, over all faces. */
function planarity(vertices: Vec3[], faces: number[][]): number {
	let worst = 0;
	for (const f of faces) {
		const [a, b, c] = [vertices[f[0]], vertices[f[1]], vertices[f[2]]];
		const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
		const v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
		const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
		const l = Math.hypot(n[0], n[1], n[2]);
		for (const i of f) worst = Math.max(worst, Math.abs(((vertices[i][0] - a[0]) * n[0] + (vertices[i][1] - a[1]) * n[1] + (vertices[i][2] - a[2]) * n[2]) / l));
	}
	return worst;
}
/** Turning number of face 0 about its own normal: 2 for a pentagram, 1 for a convex pentagon. */
function turning(vertices: Vec3[], f: number[]): number {
	const [p0, p1, p2] = [vertices[f[0]], vertices[f[1]], vertices[f[2]]];
	const e = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
	const g = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
	const n = [e[1] * g[2] - e[2] * g[1], e[2] * g[0] - e[0] * g[2], e[0] * g[1] - e[1] * g[0]];
	let turn = 0;
	for (let i = 0; i < f.length; i++) {
		const [a, b, c] = [0, 1, 2].map((k) => vertices[f[(i + k) % f.length]]);
		const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
		const v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
		const s = (u[1] * v[2] - u[2] * v[1]) * n[0] + (u[2] * v[0] - u[0] * v[2]) * n[1] + (u[0] * v[1] - u[1] * v[0]) * n[2];
		turn += Math.atan2(s / Math.hypot(n[0], n[1], n[2]), u[0] * v[0] + u[1] * v[1] + u[2] * v[2]);
	}
	return Math.round(Math.abs(turn) / (2 * Math.PI));
}

const TYPE_ORDER = ["T", "O", "C", "I", "ID", "D", "tO", "tC", "rC", "tI", "tD", "rD", "sC", "gC", "sD", "gD"];
const sortKey = (s: string) => {
	const [type, rest] = s.split("-");
	const [x, y] = rest.split(".");
	// A fissary figure sorts after every polyhedron of its orbit type.
	return [TYPE_ORDER.indexOf(type), x === "F" ? 1e6 : Number(x), Number(y ?? 0)];
};
const symbols = offs.map((f) => path.basename(f, ".off"));
const order = symbols.map((_, i) => i).sort((i, j) => {
	const [a, b] = [sortKey(symbols[i]), sortKey(symbols[j])];
	return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
});

// The nine regular polyhedra among the 146, read off the regenerated solid as {p,q}, V, the face's
// turning number, and whether an edge is the SHORTEST distance between two vertices. The last is what
// separates the icosahedron from the great icosahedron: same vertices, same twenty triangles' worth of
// counts, and only one of them joins neighbours.
const REGULAR: Record<string, string> = {
	"3,3,4,1,1": "Tetrahedron", "3,4,6,1,1": "Octahedron", "4,3,8,1,1": "Cube", "3,5,12,1,1": "Icosahedron", "5,3,20,1,1": "Dodecahedron",
	"5,5,12,2,0": "Small stellated dodecahedron", "5,5,12,1,1": "Great dodecahedron", "3,5,12,1,0": "Great icosahedron", "5,3,20,2,0": "Great stellated dodecahedron",
};

interface Built { symbol: string; group: NobleGroup; face: number[]; V: number; E: number; F: number; p: number; q: number; classic: string | null; fissary: boolean }
const built: Built[] = [];
let worstVertex = 0;
let worstPlane = 0;
for (const i of order) {
	const symbol = symbols[i];
	const type = symbol.split("-")[0];
	const off = readOff(offs[i]);
	const orbit = orbits.get(symbol.replace(/\.\d+$/, ""));
	const seed = NOBLE_SEED[type](orbit?.a ?? 0, orbit?.b ?? 0);
	const candidates: NobleGroup[] = type === "T" ? ["Td"] : /^(O|C|tO|tC|rC|sC|gC)$/.test(type) ? ["Oh", "O"] : ["Ih", "I"];
	let done: Built | null = null;
	for (const group of candidates) {
		const probe = nobleOrbit(group, seed, [0, 1, 2]);
		if (probe.vertices.length !== off.vertices.length) continue;
		// His vertex -> ours, by position. Same frame and same scale, so this is a lookup and not a fit.
		const map = off.vertices.map((v) => {
			let best = -1;
			let dist = Infinity;
			probe.vertices.forEach((w, k) => {
				const d = Math.hypot(v[0] - w[0], v[1] - w[1], v[2] - w[2]);
				if (d < dist) [dist, best] = [d, k];
			});
			if (dist > 1e-6) throw new Error(`${symbol}: vertex ${v} is ${dist} from the regenerated orbit`);
			worstVertex = Math.max(worstVertex, dist);
			return best;
		});
		if (new Set(map).size !== map.length) throw new Error(`${symbol}: two of his vertices map to one of ours`);
		const want = new Set(off.faces.map((f) => cycleKey(f.map((v) => map[v]))));
		const face = off.faces[0].map((v) => map[v]);
		const { vertices, faces } = nobleOrbit(group, seed, face);
		// As CYCLES. The full group can reproduce every vertex set of a chiral solid and still be wrong.
		if (faces.length !== want.size || !faces.every((f) => want.has(cycleKey(f)))) continue;
		worstPlane = Math.max(worstPlane, planarity(vertices, faces) / Math.hypot(...seed));
		const p = face.length;
		const q = faces.filter((f) => f.includes(0)).length;
		const edges = new Set(faces.flatMap((f) => f.map((a, k) => edgeKey(a, f[(k + 1) % f.length]))));
		const t = turning(vertices, face);
		const dist = (i: number, j: number) => Math.hypot(vertices[i][0] - vertices[j][0], vertices[i][1] - vertices[j][1], vertices[i][2] - vertices[j][2]);
		const nearest = Math.min(...vertices.slice(1).map((_, k) => dist(0, k + 1)));
		const short = dist(face[0], face[1]) < nearest * (1 + 1e-9) ? 1 : 0;
		const classic = REGULAR[`${p},${q},${vertices.length},${t},${short}`] ?? null;
		done = { symbol, group, face, V: vertices.length, E: edges.size, F: faces.length, p, q, classic, fissary: /-F$/.test(symbol) };
		break;
	}
	if (!done) throw new Error(`${symbol}: no point group regenerates his model`);
	const said = paper.get(symbol)?.sym;
	if (said && said !== ORBIFOLD[done.group]) console.log(`  ⚠ ${symbol}: the paper says ${said}, the model has ${ORBIFOLD[done.group]}`);
	built.push(done);
}

const listed = built.filter((b) => !b.fissary);
console.log(`${built.length} models regenerated: ${listed.length} noble polyhedra + ${built.length - listed.length} fissary`);
console.log(`  classical among them: ${built.filter((b) => b.classic).map((b) => `${b.symbol} = ${b.classic}`).join(", ")}`);
console.log(`  largest gap to his vertices ${worstVertex.toExponential(2)}, largest face non-planarity ${worstPlane.toExponential(2)} of the circumradius`);
const groups = new Map<string, number>();
for (const b of built) groups.set(b.group, (groups.get(b.group) ?? 0) + 1);
console.log(`  by group: ${[...groups].map(([g, n]) => `${g} ${n}`).join(", ")}`);

// ---- lib/render/nobleData.ts -----------------------------------------------------------------------

const used = new Set(built.map((b) => b.symbol.replace(/\.\d+$/, "")));
const orbitRows = [...orbits].filter(([k]) => used.has(k)).sort(([a], [b]) => {
	const [x, y] = [sortKey(a), sortKey(b)];
	return x[0] - y[0] || x[1] - y[1];
});
const data = `// GENERATED by scripts/build-noble-shelf.ts; do not hand-edit.
//
// NOBLE_ORBITS: the position of each one- or two-parameter orbit that carries a noble polyhedron, as
// [a, minimal polynomial of a, b, minimal polynomial of b]. The polynomials are Connor Hill's (${PAPER},
// Appendix B) and each number is the root of its polynomial nearest the location he gives, re-solved to
// double precision. tests/noble-solids.test.ts evaluates every polynomial at its root.
//
// NOBLE_SOLIDS: [Hill's symbol, point group, one face]. The face indexes the orbit that
// nobleOrbit(group, seed) produces; lib/render/nobleSolids.ts regenerates everything else from it.

export type NobleGroup = "Td" | "O" | "Oh" | "I" | "Ih";

export const NOBLE_ORBITS: Record<string, [a: number, pa: string, b?: number, pb?: string]> = {
${orbitRows.map(([k, o]) => `\t"${k}": [${o.a}, "${o.pa}"${o.pb ? `, ${o.b}, "${o.pb}"` : ""}],`).join("\n")}
};

export const NOBLE_SOLIDS: [symbol: string, group: NobleGroup, face: number[]][] = [
${built.map((b) => `\t["${b.symbol}", "${b.group}", [${b.face.join(", ")}]],`).join("\n")}
];
`;

// ---- atlas rows ------------------------------------------------------------------------------------

const GON: Record<number, string> = { 3: "triangles", 4: "quadrilaterals", 5: "pentagons", 6: "hexagons", 8: "octagons", 9: "enneagons", 12: "dodecagons" };
const CLASSIFIED = `Classified by Connor Hill, ${PAPER} (2026)`;
const row = (solid: string, name: string, family: string, note: string) => ({
	id: `sph-${solid}`,
	source: "spherical",
	k: 1,
	family,
	spherical: { solid, name },
	geometry: "spherical",
	discoverer: CLASSIFIED,
	note,
	renderCell: { b: [[1, 0], [0, 1]], i: [0, 0] },
	derivation: "tabulated",
});
const made = built.map((b) => {
	const orbit = orbits.get(b.symbol.replace(/\.\d+$/, ""));
	const dual = paper.get(b.symbol)?.dual;
	const where = orbit
		? `Its vertices are regenerated from the orbit parameter${orbit.pb ? "s" : ""}: a is a root of ${orbit.pa}${orbit.pb ? ` and b a root of ${orbit.pb}` : ""}.`
		: "Its vertices are a fixed orbit with no free parameter.";
	const what = b.fissary
		? `Fissary figure ${b.symbol}: ${b.F} ${GON[b.p]}, ${b.E} edges, and ${b.V} points that each carry TWO coinciding vertices, so ${b.q} faces meet at every point. Hill does not count it among the 146: it is the dual of a noble polyhedron with coplanar faces, and it is a polyhedron only if coinciding vertices are allowed.`
		: `Noble polyhedron ${b.symbol}${b.classic ? `, the ${b.classic.toLowerCase()}` : ""}: ${b.F} ${GON[b.p]}, ${b.V} vertices, ${b.E} edges, type {${b.p},${b.q}}, symmetry ${ORBIFOLD[b.group]}. Every vertex is equivalent to every other and every face to every other, which is what noble means; the edges need not be, and the faces need not be regular.${dual ? ` Its dual is ${dual}.` : ""} One of the 146 in Hill's classification.`;
	return row(nobleId(b.symbol), b.classic ? `${b.classic} (${b.symbol})` : b.symbol, `{${b.p},${b.q}}`, `${what} ${where}`);
});
const FAMILY = "One of the two infinite families of noble polyhedra, and with the 146 listed ones the whole class (Hill, Corollary 4.15). It cannot be listed, so it is drawn from its parameters: move them in the Options tab.";
made.push(
	row("noble-disphenoid", "Disphenoids", "{3,3}", `The disphenoids: four congruent triangles, cut as alternate corners of a box. Every acute triangle gives one, so the family is a continuum in two parameters, the box's proportions; the cube gives the regular tetrahedron. These are the only convex noble polyhedra that are not regular. ${FAMILY}`),
	row("noble-stephanoid-prismatic", "Prismatic stephanoids PC(n,p,q)", "{4,4}", `The prismatic stephanoids or crown polyhedra: 2n crossed quadrilaterals on the vertices of an n-gonal prism, generated by the face a1, b(1+q), a(1+p), b(1+p-q) for 2p - n < 2q < p < n. Each closes at V - E + F = 0. The height of the prism is free, so every PC(n,p,q) is itself a continuum. ${FAMILY}`),
	row("noble-stephanoid-antiprismatic", "Antiprismatic stephanoids AC(n,p,q)", "{4,4}", `The antiprismatic stephanoids: 2n crossed quadrilaterals on the vertices of an n-gonal antiprism, generated by the face a1, a(1+q), a(1+2p), a(1+2p-q) for q odd and 2p - n < q < p < n. Each closes at V - E + F = 0. The height of the antiprism is free, so every AC(n,p,q) is itself a continuum. ${FAMILY}`),
);

const atlas = JSON.parse(fs.readFileSync(ATLAS, "utf8"));
const isNoble = (id: string) => id.startsWith("sph-noble-");
const byId = new Map(made.map((r) => [r.id, r]));
const kept: { id: string }[] = [];
let changed = 0;
let removed = 0;
for (const rec of atlas.records as { id: string }[]) {
	if (!isNoble(rec.id)) { kept.push(rec); continue; }
	const next = byId.get(rec.id);
	if (!next) { removed++; console.log(`  ⚠ REMOVED ${rec.id}`); continue; }
	const merged = { ...rec, ...next };
	if (JSON.stringify(merged) !== JSON.stringify(rec)) changed++;
	kept.push(merged);
	byId.delete(rec.id);
}
const added = [...byId.values()];
console.log(`atlas rows: ${made.length} built; added ${added.length}, changed ${changed}, removed ${removed}`);
if (!write) { console.log("(dry run: pass --write)"); process.exit(0); }
fs.writeFileSync(DATA, data);
atlas.records = [...kept, ...added];
fs.writeFileSync(ATLAS, JSON.stringify(atlas));
console.log(`wrote lib/render/nobleData.ts and public/reference-atlas-spherical.json (${atlas.records.length} records)`);
