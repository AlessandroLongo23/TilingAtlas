// Who found each noble polyhedron, and what it is called: lib/render/nobleCredits.ts.
//
//   python3 experiments/noble-polyhedra/fetch-wiki.py <dir>      (rows.json, off-map.json, off/*.off)
//   pnpm tsx scripts/build-noble-credits.ts <dir> [--write]
//
// The Polytope Wiki's "List of noble polyhedra" (CC BY-SA 4.0) names every one and records its
// discoverer and year. It does not use Hill's symbols, so the two lists are joined here BY CONGRUENCE:
// each wiki entry's own .off model is reduced to a similarity invariant and matched to the one atlas
// solid with the same invariant. Reading the two tables side by side would be a guess; this is not.
//
// The invariant: V, F, the face size, the distance of a face's plane from the centre, the face's side
// lengths, and every distance between two vertices of one face, all in units of the circumradius. It is blind to scale,
// position, orientation and handedness, and it is checked to be DIFFERENT for all 148 atlas solids
// before anything is matched against it.
//
// An entry with no model on the wiki is placed from its table row; how is written where it happens.

import fs from "node:fs";
import path from "node:path";
import { NOBLE_SOLIDS } from "../lib/render/nobleData";
import { nobleId, nobleSolid } from "../lib/render/nobleSolids";
import { polarDual } from "../lib/render/dualSolid";
import type { Vec3 } from "../lib/render/platonicSolids";

const DIR = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!DIR) throw new Error("usage: build-noble-credits.ts <dir from fetch-wiki.py> [--write]");
const write = process.argv.includes("--write");

interface Shape { vertices: Vec3[]; faces: number[][] }
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function invariant(s: Shape): { key: number[]; ratio: number; V: number; E: number; p: number; q: number } {
	const c: Vec3 = [0, 0, 0];
	for (const v of s.vertices) for (let k = 0; k < 3; k++) c[k] += v[k] / s.vertices.length;
	const R = Math.max(...s.vertices.map((v) => dist(v, c)));
	const f = s.faces[0];
	const P = f.map((i) => s.vertices[i]);
	const [u, w] = [0, 1, 2].slice(1).map((k) => [P[k][0] - P[0][0], P[k][1] - P[0][1], P[k][2] - P[0][2]]);
	const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
	const height = Math.abs((P[0][0] - c[0]) * n[0] + (P[0][1] - c[1]) * n[1] + (P[0][2] - c[2]) * n[2]) / Math.hypot(n[0], n[1], n[2]) / R;
	const chords: number[] = [];
	for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) chords.push(dist(P[i], P[j]) / R);
	const edges = new Map<string, number>();
	for (const g of s.faces) g.forEach((a, k) => {
		const b = g[(k + 1) % g.length];
		edges.set(a < b ? `${a},${b}` : `${b},${a}`, dist(s.vertices[a], s.vertices[b]));
	});
	const lens = [...edges.values()];
	return {
		// The SIDES separately from the chords: a pentagon and the pentagram on the same five points have
		// the same ten distances between them, and differ only in which five are edges.
		key: [s.vertices.length, s.faces.length, f.length, height, ...P.map((a, k) => dist(a, P[(k + 1) % P.length]) / R).sort((x, y) => x - y), ...chords.sort((x, y) => x - y)],
		ratio: Math.max(...lens) / Math.min(...lens),
		V: s.vertices.length,
		E: edges.size,
		p: f.length,
		q: s.faces.filter((g) => g.includes(f[0])).length,
	};
}

function readOff(file: string): Shape {
	const L = fs.readFileSync(file, "utf8").split("\n").map((l) => l.replace(/#.*/, "").trim()).filter(Boolean);
	const start = L[0] === "OFF" ? 1 : 0;
	const [nv, nf] = L[start].split(/\s+/).map(Number);
	return {
		vertices: L.slice(start + 1, start + 1 + nv).map((l) => l.split(/\s+/).map(Number) as Vec3),
		// The count leads the line and anything after the indices is a colour, which some exporters append.
		faces: L.slice(start + 1 + nv, start + 1 + nv + nf).map((l) => {
			const t = l.split(/\s+/).map(Number);
			return t.slice(1, 1 + t[0]);
		}),
	};
}

// ---- the atlas side ----
const ours = NOBLE_SOLIDS.map(([symbol]) => ({ symbol, ...invariant(nobleSolid(nobleId(symbol))!) }));
// Compared with a tolerance and not as rounded strings: two computations of one number can fall either
// side of a rounding boundary, and then a string key calls one solid two.
const TOL = 2e-4;
const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < TOL);
const byKey = { get: (key: number[]) => ours.find((o) => same(o.key, key))?.symbol };
for (const a of ours) for (const b of ours) if (a !== b && same(a.key, b.key)) throw new Error(`the invariant does not separate ${a.symbol} from ${b.symbol}`);

// ---- the wiki side ----
interface Row { section: string; page: string | null; name: string; hull: string; dual: string | null; E: string; V: string; schlafli: string; ratio: string; notes: string; disc: string }
const rows: Row[] = JSON.parse(fs.readFileSync(path.join(DIR, "rows.json"), "utf8"));
const offMap: { off: Record<string, string | null> } = JSON.parse(fs.readFileSync(path.join(DIR, "off-map.json"), "utf8"));

interface Credit { symbol: string; name: string | null; who: string; year: number | null; by: "model" | "table" | "set" }
const credits = new Map<string, Credit>();
const problems: string[] = [];
const pending: Row[] = [];
const clean = (s: string) => s.replace(/\|\}\s*$/, "").replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/\s+/g, " ").trim();
function parseDisc(d: string): { who: string; year: number | null } {
	const m = /^(.*?),?\s*(\d{4})$/.exec(clean(d));
	return m ? { who: m[1].trim(), year: Number(m[2]) } : { who: clean(d), year: null };
}
// The entry's own name: the article title where there is one, else the row's text.
const nameOf = (r: Row) => r.page ?? r.name;

for (const r of rows) {
	if (r.section.includes("exotic")) continue; // faces that revisit a vertex: outside Hill's definition, and not on the shelf
	const file = r.page ? offMap.off[r.page] : null;
	const full = file ? path.join(DIR, "off", file.replace(/\//g, "_")) : null;
	if (!full || !fs.existsSync(full)) { pending.push(r); continue; }
	const inv = invariant(readOff(full));
	const symbol = byKey.get(inv.key);
	if (!symbol) { problems.push(`no atlas solid is congruent to "${nameOf(r)}" (${file})`); continue; }
	if (credits.has(symbol)) { problems.push(`${symbol} matched twice: "${credits.get(symbol)!.name}" and "${nameOf(r)}"`); continue; }
	const tableRatio = Number(/1:([\d.]+)/.exec(r.ratio)?.[1]);
	if (tableRatio && Math.abs(tableRatio - inv.ratio) > 2e-4) problems.push(`${symbol} "${nameOf(r)}": the wiki's table says edge ratio ${tableRatio}, its model has ${inv.ratio.toFixed(5)}`);
	credits.set(symbol, { symbol, name: nameOf(r), ...parseDisc(r.disc), by: "model" });
}
// ---- entries with no model on the wiki: the table's own columns, against what is still unmatched ----
//
// Eight articles carry no .off file, and the two fissary figures have no article. Their rows give no
// edge ratio either, so they are placed by what the row does say, in order of how much it pins down:
//
//   ratio   the fissary pair, whose rows do carry one;
//   hull    the convex hull names the vertex orbit type ("Ti" is tI, "Srid" is rD, "Tid" is tD);
//   dual    the row names its dual, and the dual of an atlas solid is computed, not looked up;
//   set     what is left is n rows and n solids that fit each other and nothing else. If the n rows
//           agree on the discoverer, each solid gets that discoverer and NO name: who found it is then
//           certain, and which of the n names is which is not.
const fits = (r: Row, o: (typeof ours)[number], withQ = true) => {
	const [p, q] = (/\{\{Schlink\|(\d+)\|(\d+)\}\}/.exec(r.schlafli) ?? []).slice(1).map(Number);
	return !credits.has(o.symbol) && o.V === Number(r.V) && o.E === Number(r.E) && o.p === p && (!withQ || o.q === q);
};
const HULL: [RegExp, string][] = [[/\bTid\b/, "tD"], [/\bTi\b/, "tI"], [/\bSrid\b/, "rD"]];
const typeOf = (r: Row) => HULL.find(([re]) => re.test(r.hull))?.[1] ?? null;
const dualOf = (symbol: string): string | null => {
	const d = polarDual(nobleSolid(nobleId(symbol))!);
	return "dual" in d ? byKey.get(invariant(d.dual).key) ?? null : null;
};
const byName = () => new Map([...credits.values()].filter((c) => c.name).map((c) => [c.name!, c.symbol]));
let left = pending;
const place = (r: Row, symbol: string, by: Credit["by"]) => credits.set(symbol, { symbol, name: nameOf(r), ...parseDisc(r.disc), by });
for (let moved = true; moved; ) {
	moved = false;
	const next: Row[] = [];
	for (const r of left) {
		const ratio = Number(/1:([\d.]+)/.exec(r.ratio)?.[1]);
		let hits: string[];
		if (ratio) hits = ours.filter((o) => fits(r, o, false) && Math.abs(o.ratio - ratio) < 2e-4).map((o) => o.symbol);
		else {
			hits = ours.filter((o) => fits(r, o) && o.symbol.split("-")[0] === typeOf(r)).map((o) => o.symbol);
			const viaDual = r.dual ? byName().get(r.dual) : undefined;
			const d = viaDual ? dualOf(viaDual) : null;
			if (hits.length !== 1 && d && hits.includes(d)) hits = [d];
		}
		if (hits.length === 1) {
			place(r, hits[0], "table");
			moved = true;
		} else next.push(r);
	}
	left = next;
}
const groups = new Map<string, Row[]>();
for (const r of left) {
	const k = `${typeOf(r)}|${r.schlafli}|${r.V}|${r.E}`;
	groups.set(k, [...(groups.get(k) ?? []), r]);
}
for (const rs of groups.values()) {
	const fit = ours.filter((o) => fits(rs[0], o) && o.symbol.split("-")[0] === typeOf(rs[0]));
	const who = new Set(rs.map((r) => JSON.stringify(parseDisc(r.disc))));
	if (fit.length !== rs.length || who.size !== 1) {
		problems.push(`${rs.map(nameOf).join(", ")}: no model, ${fit.length} atlas solids fit (${fit.map((o) => o.symbol).join(" ")})`);
		continue;
	}
	for (const o of fit) credits.set(o.symbol, { symbol: o.symbol, name: null, ...parseDisc(rs[0].disc), by: "set" });
}

const unmatched = ours.filter((o) => !credits.has(o.symbol)).map((o) => o.symbol);
const how = (by: Credit["by"]) => [...credits.values()].filter((c) => c.by === by).length;
console.log(`${credits.size} of ${ours.length} atlas solids credited: ${how("model")} by model, ${how("table")} by table row, ${how("set")} as a set (discoverer only)`);
console.log(`unmatched: ${unmatched.join(" ") || "none"}`);
for (const p of problems) console.log(`  ⚠ ${p}`);
const tally = new Map<string, number>();
for (const c of credits.values()) tally.set(`${c.who || "(none given)"}${c.year ? ` ${c.year}` : ""}`, (tally.get(`${c.who || "(none given)"}${c.year ? ` ${c.year}` : ""}`) ?? 0) + 1);
console.log([...tally].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(" | "));
for (const c of credits.values()) if (c.by !== "model") console.log(`  ${c.by}: ${c.symbol} = ${c.name ?? "(name not determined)"}, ${c.who} ${c.year}`);

if (write) {
	const order = NOBLE_SOLIDS.map(([s]) => s).filter((s) => credits.has(s));
	fs.writeFileSync(path.join(process.cwd(), "lib", "render", "nobleCredits.ts"), `// GENERATED by scripts/build-noble-credits.ts; do not hand-edit.
//
// [Hill's symbol, name, discoverer as recorded, year, how the two lists were joined]. Names, discoverers
// and years are the Polytope Wiki's "List of noble polyhedra" (https://polytope.miraheze.org/wiki/List_of_noble_polyhedra,
// CC BY-SA 4.0).
//   "model"  the wiki entry's own .off model is congruent to the atlas solid;
//   "table"  the entry has no model and its table row (edge ratio, convex hull or dual) fits one solid;
//   "set"    the entry has no model and its row fits several solids that all share one discoverer, so the
//            discoverer is certain and the NAME is not: null.
// The discoverer is as the wiki writes it, a name or a handle; lib/render/nobleAttribution.ts resolves
// the ones it can stand behind. A solid absent from this list is absent from the wiki's.

export const NOBLE_CREDITS: [symbol: string, name: string | null, who: string, year: number | null, by: "model" | "table" | "set"][] = [
${order.map((s) => { const c = credits.get(s)!; return `\t[${JSON.stringify(c.symbol)}, ${JSON.stringify(c.name)}, ${JSON.stringify(c.who)}, ${c.year}, "${c.by}"],`; }).join("\n")}
];
`);
	console.log("wrote lib/render/nobleCredits.ts");
}
