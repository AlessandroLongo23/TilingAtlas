// Generate every candidate of the closed sets of uniform 4-polytopes and measure what comes out.
//
//   pnpm tsx experiments/polychora/generate.ts [maxN]
//
// For each candidate: the f-vector, Euler characteristic, the cells by kind, and the checks (edge
// lengths, circumsphere, vertex degree, a published f-vector where one is tabulated here, and for every
// Wythoff-built convex one an independent rebuild of the whole face lattice from the vertices alone).
// Candidates that coincide are reported as duplicates, which is how the set sizes are counted.
// Appends to experiments/results/polychora-generate-<date>.log as it goes and writes a contact sheet.
import fs from "node:fs";
import path from "node:path";
import { PLATONIC_SOLIDS } from "../../lib/render/platonicSolids";
import { ARCHIMEDEAN_SOLIDS } from "../../lib/render/archimedeanSolids";
import { convexHull4, polychoronCandidates, type Geometry4, type Vec4 } from "../../lib/render/polychora";

const DATE = new Date().toLocaleDateString("sv");
const OUT = path.resolve("experiments/results");
const LOG = path.join(OUT, `polychora-generate-${DATE}.log`);
const say = (s: string) => {
	fs.appendFileSync(LOG, s + "\n");
	console.log(s);
};

// Published f-vectors (V, E, F, C). The prisms and the two families have closed forms, computed below.
const EXPECT: Record<string, number[]> = {
	"5-cell": [5, 10, 10, 5], tesseract: [16, 32, 24, 8], "16-cell": [8, 24, 32, 16], "24-cell": [24, 96, 96, 24],
	"120-cell": [600, 1200, 720, 120], "600-cell": [120, 720, 1200, 600],
	"icosahedral-120-cell": [120, 720, 1200, 120], "small-stellated-120-cell": [120, 1200, 720, 120],
	"great-120-cell": [120, 720, 720, 120], "grand-120-cell": [120, 720, 720, 120],
	"great-stellated-120-cell": [120, 720, 720, 120], "grand-stellated-120-cell": [120, 720, 720, 120],
	"great-grand-120-cell": [120, 1200, 720, 120], "great-icosahedral-120-cell": [120, 720, 1200, 120],
	"grand-600-cell": [120, 720, 1200, 600], "great-grand-stellated-120-cell": [600, 1200, 720, 120],
	"snub-24-cell": [96, 432, 480, 144], "grand-antiprism": [100, 500, 720, 320],
	"bitruncated-5-cell": [30, 60, 40, 10], "omnitruncated-5-cell": [120, 240, 150, 30],
	"runcinated-tesseract": [64, 192, 208, 80], "omnitruncated-tesseract": [384, 768, 464, 80],
	"truncated-24-cell": [192, 384, 240, 48], "omnitruncated-24-cell": [1152, 2304, 1392, 240],
	"rectified-600-cell": [720, 3600, 3600, 720], "omnitruncated-120-cell": [14400, 28800, 17040, 2640],
};
const SOLIDS = [...PLATONIC_SOLIDS, ...ARCHIMEDEAN_SOLIDS];
function expected(id: string, name: string): number[] | null {
	if (EXPECT[id]) return EXPECT[id];
	const solid = SOLIDS.find((s) => `${s.name} prism` === name);
	if (solid) {
		const v = solid.vertices.length, f = solid.faces.length, e = v + f - 2;
		return [2 * v, 2 * e + v, 2 * f + e, f + 2];
	}
	const duo = /^(\d+),(\d+)-duoprism$/.exec(id);
	if (duo) return [+duo[1] * +duo[2], 2 * +duo[1] * +duo[2], +duo[1] * +duo[2] + +duo[1] + +duo[2], +duo[1] + +duo[2]];
	const anti = /^(\d+)-gonal-antiprismatic-prism$/.exec(id);
	if (anti) return [4 * +anti[1], 10 * +anti[1], 8 * +anti[1] + 4, 2 * +anti[1] + 4];
	return null;
}

const dist = (a: Vec4, b: Vec4) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]);
const power = (label: string, n: number) => (n > 1 ? `${label}^${n}` : label);

// A cell's kind: its vertex count and its faces by size, a pentagram written 5/2.
function cellKinds(g: Geometry4): Map<string, number> {
	const label = g.faces.map((f) => {
		let chord = Infinity;
		for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) chord = Math.min(chord, dist(g.vertices[f[i]], g.vertices[f[j]]));
		return dist(g.vertices[f[0]], g.vertices[f[1]]) > chord * (1 + 1e-6) ? `${f.length}/2` : `${f.length}`;
	});
	const kinds = new Map<string, number>();
	for (const c of g.cells) {
		const sizes = new Map<string, number>();
		for (const f of c) sizes.set(label[f], (sizes.get(label[f]) ?? 0) + 1);
		const nv = new Set(c.flatMap((f) => g.faces[f])).size;
		const sig = `${nv}v ` + [...sizes].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])).map(([s, n]) => power(s, n)).join(".");
		kinds.set(sig, (kinds.get(sig) ?? 0) + 1);
	}
	return kinds;
}
const SOLID_NAMES = new Map<string, string>();
for (const s of SOLIDS) {
	const sizes = new Map<number, number>();
	for (const f of s.faces) sizes.set(f.length, (sizes.get(f.length) ?? 0) + 1);
	SOLID_NAMES.set(`${s.vertices.length}v ` + [...sizes].sort((a, b) => a[0] - b[0]).map(([n, c]) => power(`${n}`, c)).join("."), s.name.toLowerCase());
}
function kindName(sig: string): string {
	const known = SOLID_NAMES.get(sig);
	if (known) return known;
	const nv = parseInt(sig);
	for (const n of [3, 5, 6, 7, 8, 9, 10, 12]) {
		if (nv === 2 * n && sig === `${nv}v ` + (n === 3 ? "3^2.4^3" : `4^${n}.${n}^2`)) return `${n}-gonal prism`;
		if (nv === 2 * n && sig === `${nv}v 3^${2 * n}.${n}^2`) return `${n}-gonal antiprism`;
	}
	return `[${sig}]`;
}
const kindsText = (kinds: Map<string, number>) => [...kinds].map(([sig, n]) => `${n} ${kindName(sig)}`).sort().join(" + ");

// A perspective view of the polychoron drawn on the 3-sphere: turn it in 4D, project from a point
// outside the sphere on the w axis, and draw each edge as its great arc.
function panel(g: Geometry4, title: string, caption: string): string {
	const R = Math.hypot(...g.vertices[0]);
	const turn = (x: number, y: number, a: number) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
	const U = g.vertices.map((p) => {
		let [x, y, z, w] = p.map((c) => c / R);
		[x, w] = turn(x, w, 0.47);
		[y, z] = turn(y, z, 0.31);
		[z, w] = turn(z, w, 0.73);
		return [x, y, z, w];
	});
	const E = g.edges.length;
	const steps = E <= 1500 ? 6 : E <= 6000 ? 3 : 1;
	const lines: number[][][] = [];
	let reach = 0;
	for (const [a, b] of g.edges) {
		const line: number[][] = [];
		for (let t = 0; t <= steps; t++) {
			const p = U[a].map((c, k) => c + ((U[b][k] - c) * t) / steps);
			const n = Math.hypot(...p), s = 1 / (1.5 - p[3] / n) / n;
			const q = [(p[0] + 0.35 * p[2]) * s, (p[1] + 0.25 * p[2]) * s];
			reach = Math.max(reach, Math.abs(q[0]), Math.abs(q[1]));
			line.push(q);
		}
		lines.push(line);
	}
	const d = lines.map((l) => "M" + l.map((q) => `${((q[0] / reach) * 118).toFixed(1)} ${((q[1] / reach) * 118).toFixed(1)}`).join("L")).join("");
	const alpha = Math.min(0.85, Math.max(0.1, 350 / E)).toFixed(2);
	return `<figure><svg viewBox="-125 -125 250 250"><path d="${d}" fill="none" stroke="#111" stroke-width="0.5" stroke-opacity="${alpha}" stroke-linecap="round"/></svg><figcaption><b>${title}</b><br>${caption}</figcaption></figure>`;
}

const maxN = Number(process.argv[2] ?? 8);
const specs = polychoronCandidates(maxN);
const t0 = Date.now();
say(`\n=== polychora generation, ${new Date().toISOString()}, ${specs.length} candidates (families sampled to n = ${maxN}) ===`);
const firstSeen = new Map<string, string>();
const sections = new Map<string, string[]>();
const tally = new Map<string, { candidates: number; distinct: Set<string>; fresh: number; failed: string[] }>();
specs.forEach((spec, i) => {
	const t = Date.now();
	const g = spec.build();
	const f = [g.vertices.length, g.edges.length, g.faces.length, g.cells.length];
	const chi = f[0] - f[1] + f[2] - f[3];
	const lens = g.edges.map(([a, b]) => dist(g.vertices[a], g.vertices[b]));
	const e = Math.min(...lens);
	const radii = g.vertices.map((p) => Math.hypot(...p));
	const R = Math.min(...radii);
	const degree = new Int32Array(f[0]);
	for (const [a, b] of g.edges) {
		degree[a]++;
		degree[b]++;
	}
	const kinds = cellKinds(g);
	const checks: string[] = [];
	const check = (label: string, ok: boolean) => checks.push(`${label} ${ok ? "ok" : "FAIL"}`);
	// Euler's relation holds for the convex ones only: a star polychoron winds around its centre.
	if (spec.set === "regular-star") checks.push(`chi=${chi}`);
	else check("chi=0", chi === 0);
	check("edges equal", Math.max(...lens) / e - 1 < 1e-9);
	check("on a sphere", Math.max(...radii) / R - 1 < 1e-9);
	check("degree " + degree[0], degree.every((x) => x === degree[0]));
	const want = expected(spec.id, spec.name);
	if (want) check("f-vector as published", want.join() === f.join());
	if (spec.via === "wythoff" && spec.set !== "regular-star") {
		const h = convexHull4(g.vertices);
		check("hull rebuild agrees", [h.vertices.length, h.edges.length, h.faces.length, h.cells.length].join() === f.join() && kindsText(cellKinds(h)) === kindsText(kinds));
	}
	const print = `${f.join(",")}|${[...kinds].map(([s, n]) => n + "x" + s).sort().join(";")}|${(R / e).toFixed(6)}`;
	const twin = firstSeen.get(print);
	if (!twin) firstSeen.set(print, spec.name);
	const row = tally.get(spec.set) ?? { candidates: 0, distinct: new Set<string>(), fresh: 0, failed: [] };
	tally.set(spec.set, row);
	row.candidates++;
	row.distinct.add(print);
	if (!twin) row.fresh++;
	if (checks.some((c) => c.endsWith("FAIL"))) row.failed.push(spec.name);
	const done = i + 1, elapsed = (Date.now() - t0) / 1000;
	say(
		`[${String(done).padStart(3)}/${specs.length} ${String(Math.round((100 * done) / specs.length)).padStart(3)}%  ${elapsed.toFixed(1)}s elapsed, ETA ${((elapsed / done) * (specs.length - done)).toFixed(0)}s]  ${spec.set}  ${spec.name}  ${spec.symbol}` +
			`\n      V=${f[0]} E=${f[1]} F=${f[2]} C=${f[3]}  R/edge=${(R / e).toFixed(6)}  cells: ${kindsText(kinds)}  (${Date.now() - t} ms)` +
			`\n      ${checks.join(", ")}${twin ? `\n      DUPLICATE of ${twin}` : ""}`,
	);
	if (!twin) {
		if (!sections.has(spec.set)) sections.set(spec.set, []);
		sections.get(spec.set)!.push(panel(g, spec.name, `${spec.symbol}<br>${f.join(" · ")}<br>${kindsText(kinds)}`));
	}
});

say(`\n--- summary (${((Date.now() - t0) / 1000).toFixed(1)}s) ---`);
say("set                   candidates  distinct  new here  failed checks");
for (const [set, r] of tally) say(`${set.padEnd(22)}${String(r.candidates).padStart(10)}${String(r.distinct.size).padStart(10)}${String(r.fresh).padStart(10)}  ${r.failed.length ? r.failed.join("; ") : "none"}`);
say(`distinct polychora in all: ${firstSeen.size}`);

const sheet = path.join(OUT, `polychora-contact-${DATE}.html`);
fs.writeFileSync(
	sheet,
	`<!doctype html><meta charset="utf-8"><title>Polychora contact sheet</title><style>body{font:12px/1.35 system-ui;margin:16px;background:#fff;color:#111}section{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:24px}h2{grid-column:1/-1;margin:0;font-size:16px}figure{margin:0}svg{width:100%;display:block}figcaption{font-size:10.5px}</style>` +
		[...sections].map(([set, figs]) => `<section id="${set}"><h2>${set} (${figs.length})</h2>${figs.join("")}</section>`).join(""),
);
say(`contact sheet: ${sheet}`);
