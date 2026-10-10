// Where does a hyperbolic tiling have its most symmetric point, and is that where the disk opens?
//
// Until 2026-10-10 the disk opened on the seed dart's vertex. This measures, for every shipped hyperbolic
// record, the stabiliser of that vertex in the tiling's full symmetry group against the stabiliser of
// every other vertex, edge midpoint and face centre. The method is lib/render/hyperbolicSymmetry.ts,
// which buildWalk now uses to choose the opening point.
//
//   pnpm tsx experiments/hyperbolic/centre-symmetry.ts            # every corpus, 9 workers
//   pnpm tsx experiments/hyperbolic/centre-symmetry.ts --id hp13-14-00036   # one record, verbose

import { spawn } from "node:child_process";
import { appendFileSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import type { Darts } from "@/lib/render/hyperbolicDevelopClient";
import { type Feature, dartSymmetry } from "@/lib/render/hyperbolicSymmetry";

// ── aggregation ──────────────────────────────────────────────────────────────────────────────────────

type Counter = Record<string, number>;
interface Agg {
	n: number;
	ms: number;
	maxMs: number;
	c: Record<string, Counter>;
	examples: Record<string, string[]>;
}
const newAgg = (): Agg => ({ n: 0, ms: 0, maxMs: 0, c: {}, examples: {} });
const bump = (a: Agg, metric: string, key: string | number, id?: string) => {
	const m = (a.c[metric] ??= {});
	m[key] = (m[key] ?? 0) + 1;
	if (id) {
		const e = (a.examples[`${metric}:${key}`] ??= []);
		if (e.length < 3) e.push(id);
	}
};
const name = (f: Feature) => `${f.mirror ? "D" : "C"}${f.mirror ? f.order / 2 : f.order}`;

function measure(a: Agg, rec: { id: string; edge?: number; darts: Darts }) {
	const t0 = performance.now();
	const { seed, features } = dartSymmetry(rec.darts, rec.edge ?? 0);
	const dt = performance.now() - t0;
	a.n++;
	a.ms += dt;
	a.maxMs = Math.max(a.maxMs, dt);
	const best = (k: string) => features.filter((f) => f.kind === k).reduce((m, f) => Math.max(m, f.order), 0);
	const bF = best("F");
	const bV = best("V");
	const bE = best("E");
	const top = Math.max(bF, bV, bE);
	bump(a, "seed vertex stabiliser", name(seed));
	bump(a, "seed order", seed.order);
	bump(a, "best order anywhere", top);
	bump(a, "best / seed", (top / seed.order).toFixed(0), rec.id);
	const who = `${bF === top ? "F" : ""}${bV === top ? "V" : ""}${bE === top ? "E" : ""}`;
	bump(a, "where the best point is", top === 1 ? "nowhere (trivial everywhere)" : who, rec.id);
	bump(a, "best face / best anywhere", bF === top ? "equal" : `${bF}/${top}`, rec.id);
	bump(a, "best face / seed", bF > seed.order ? "face better" : bF === seed.order ? "tie" : "seed better", rec.id);
	// Is the choice of face canonical? Orbits of faces that attain the best face order, and whether the
	// largest polygon is among them.
	const topF = features.filter((f) => f.kind === "F" && f.order === bF);
	const orbits = new Set(topF.map((f) => f.orbit)).size;
	bump(a, "face orbits tied for best face", bF === 1 ? "trivial" : Math.min(orbits, 5) + (orbits >= 5 ? "+" : ""), rec.id);
	const maxSize = features.reduce((m, f) => (f.kind === "F" ? Math.max(m, f.size) : m), 0);
	if (bF > 1) bump(a, "best face is a largest polygon", topF.some((f) => f.size === maxSize) ? "yes" : "no", rec.id);
	if (bF > 1) {
		const big = topF.filter((f) => f.size === Math.max(...topF.map((g) => g.size)));
		bump(a, "orbits left after largest-size tie-break", Math.min(new Set(big.map((f) => f.orbit)).size, 5), rec.id);
	}
}

function merge(into: Agg, from: Agg) {
	into.n += from.n;
	into.ms += from.ms;
	into.maxMs = Math.max(into.maxMs, from.maxMs);
	for (const [m, c] of Object.entries(from.c)) for (const [k, v] of Object.entries(c)) ((into.c[m] ??= {})[k] = (into.c[m][k] ?? 0) + v);
	for (const [k, e] of Object.entries(from.examples)) into.examples[k] = [...(into.examples[k] ?? []), ...e].slice(0, 3);
}

// ── corpora ──────────────────────────────────────────────────────────────────────────────────────────

const PUBLIC = join(process.cwd(), "public");
const CORPORA: [string, string][] = [
	["tilings: developed", "hyperbolic-developed.json"],
	["tilings: poly boards", "hyperbolic-poly"],
	["tilings: half-polygons", "hyperbolic-half"],
	["edge patterns", "hyperbolic-edges"],
	["edge patterns: Schwarz", "schwarz-hyp"],
	["colourings", "hyperbolic-colors"],
];
function files(): { corpus: string; path: string; bytes: number }[] {
	return CORPORA.flatMap(([corpus, rel]) => {
		const p = join(PUBLIC, rel);
		const list = statSync(p).isDirectory() ? readdirSync(p).filter((f) => /\.json(\.gz)?$/.test(f) && f !== "manifest.json").map((f) => join(p, f)) : [p];
		return list.map((path) => ({ corpus, path, bytes: statSync(path).size * (path.endsWith(".gz") ? 12 : 1) }));
	});
}
function load(path: string): { id: string; edge?: number; darts: Darts }[] {
	const buf = readFileSync(path);
	const raw = JSON.parse((path.endsWith(".gz") ? gunzipSync(buf) : buf).toString("utf8"));
	return decodeAtlas(raw);
}

const arg = (k: string) => {
	const i = process.argv.indexOf(k);
	return i < 0 ? null : process.argv[i + 1];
};

async function main() {
	const all = files().sort((a, b) => b.bytes - a.bytes);
	const id = arg("--id");
	if (id) {
		for (const f of all) {
			if (f.corpus !== "tilings: poly boards" && !arg("--all")) continue;
			const m = /hp(q?)(t?\w+?)-(\d+)-/.exec(id);
			if (m && !f.path.includes(`-k${m[3]}.json`)) continue;
			const rec = load(f.path).find((r) => r.id === id);
			if (!rec) continue;
			const { seed, features, classes } = dartSymmetry(rec.darts, rec.edge ?? 0);
			console.log(`${id}: ${rec.darts.rneig.length} darts, ${classes} flag classes`);
			console.log(`seed vertex: ${name(seed)} (order ${seed.order}), degree ${seed.size}`);
			const seen = new Set<string>();
			for (const f of [...features].sort((a, b) => b.order - a.order)) {
				const key = `${f.kind}${f.orbit}`;
				if (seen.has(key)) continue;
				seen.add(key);
				console.log(`  ${f.kind} size ${String(f.size).padStart(2)}  ${name(f).padEnd(4)} order ${f.order}  (dart ${f.dart})`);
			}
			return;
		}
		console.log("not found");
		return;
	}

	const part = arg("--part");
	if (part) {
		const [i, N] = part.split("/").map(Number);
		const aggs: Record<string, Agg> = {};
		all.forEach((f, j) => {
			if (j % N !== i) return;
			const a = (aggs[f.corpus] ??= newAgg());
			for (const rec of load(f.path)) measure(a, rec);
			process.stdout.write(JSON.stringify({ done: f.bytes }) + "\n");
		});
		process.stdout.write(JSON.stringify({ aggs }) + "\n");
		return;
	}

	const LOG = join(process.cwd(), "experiments/results/hyp-centre-symmetry-2026-10-10.log");
	const log = (s: string) => {
		appendFileSync(LOG, s + "\n");
		console.log(s);
	};
	writeFileSync(LOG, "");
	const N = 9;
	const total = all.reduce((s, f) => s + f.bytes, 0);
	log(`Hyperbolic centre symmetry: ${all.length} files, ${N} workers`);
	const t0 = Date.now();
	let done = 0;
	let filesDone = 0;
	let lastLog = 0;
	const aggs: Record<string, Agg> = {};
	await Promise.all(
		Array.from({ length: N }, (_, i) => new Promise<void>((resolve, reject) => {
			const child = spawn("pnpm", ["-s", "tsx", "experiments/hyperbolic/centre-symmetry.ts", "--part", `${i}/${N}`], { stdio: ["ignore", "pipe", "inherit"] });
			let buf = "";
			child.stdout.on("data", (d) => {
				buf += d;
				let nl: number;
				while ((nl = buf.indexOf("\n")) >= 0) {
					const msg = JSON.parse(buf.slice(0, nl));
					buf = buf.slice(nl + 1);
					if (msg.done) {
						done += msg.done;
						filesDone++;
						const el = (Date.now() - t0) / 1000;
						if (Date.now() - lastLog > 5000) {
							lastLog = Date.now();
							log(`  ${((100 * done) / total).toFixed(1).padStart(5)}%  ${filesDone}/${all.length} files  elapsed ${el.toFixed(0)}s  ETA ${((el * (total - done)) / done).toFixed(0)}s`);
						}
					} else for (const [k, a] of Object.entries(msg.aggs as Record<string, Agg>)) merge((aggs[k] ??= newAgg()), a);
				}
			});
			child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`worker ${i} exited ${code}`))));
		})),
	);
	log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
	const totals = newAgg();
	for (const [corpus] of CORPORA) if (aggs[corpus] && corpus.startsWith("tilings")) merge(totals, aggs[corpus]);
	const report = (title: string, a: Agg) => {
		log(`══ ${title}: ${a.n.toLocaleString()} records, ${(a.ms / a.n).toFixed(3)} ms each (max ${a.maxMs.toFixed(1)} ms) ══`);
		for (const [m, c] of Object.entries(a.c)) {
			log(`  ${m}`);
			const rows = Object.entries(c).sort((x, y) => y[1] - x[1]);
			for (const [k, v] of rows.slice(0, 14)) {
				const ex = a.examples[`${m}:${k}`];
				log(`    ${k.padEnd(30)} ${v.toLocaleString().padStart(10)}  ${((100 * v) / a.n).toFixed(2).padStart(6)}%${ex ? `   e.g. ${ex.join(", ")}` : ""}`);
			}
			if (rows.length > 14) log(`    (${rows.length - 14} more rows)`);
		}
		log("");
	};
	report("ALL TILINGS (developed + poly + half)", totals);
	for (const [corpus] of CORPORA) if (aggs[corpus]) report(corpus, aggs[corpus]);
}

if (process.argv[1]?.endsWith("centre-symmetry.ts")) main();
