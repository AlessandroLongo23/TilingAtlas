/**
 * The edge-homogeneous classification (lib/classifications.ts): which Atlas tilings are the ones in Brian
 * Galebach's list of 203, and whether the regular shelf holds any edge-homogeneous tiling he does not list.
 *
 * Edge-homogeneous (Galebach's sense): every edge orbit, under the tiling's full symmetry group, has its own full
 * edge figure, meaning the polygons round both ends of the edge read from the edge. Per tiling: edge orbits from
 * KUniformityChecker's verified symmetries, one figure per orbit, plus the edge's symmetry tag in Galebach's
 * notation (D+, D-, D|, C2, C1). A tiling matches one of his when the tagged figure sets agree.
 *
 *   pnpm tsx scripts/classify-edge-homogeneous.ts [--jobs N] [--match-only]
 *
 * Every tiling on the complete part of the regular shelf is checked, and his own tilings above it: placing his list
 * needs only his vertex types, but showing that the shelf holds no edge-homogeneous tiling he missed needs them all.
 * Per-tiling results append to experiments/results/edge-homogeneous-2026-11-06/classify/checked-w<i>.jsonl, so a
 * stopped run resumes where it was; progress goes to classify.log there. --match-only skips the checking and
 * rebuilds public/classifications/edge-homogeneous.json.br from the results on disk. Each placed member carries
 * its Delaney–Dress symbol, which must be one the homogeneous search found (scripts/atlas/symbols.ts).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { KUniformityChecker } from "@/classes/algorithm/KUniformityChecker";
import { exactCellOf } from "@/lib/services/orbitsFromExactSource";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";
import { provedOnShelf, regularShelf, rowSymbol, searchRows, writeClassification } from "./atlas/symbols";

const ROOT = process.cwd();
const GALEBACH = path.join(ROOT, "figures", "data", "galebach-edge-homogeneous.json");
const OUT = path.join(ROOT, "public", "classifications", "edge-homogeneous.json.br");
const STRONG = path.join(ROOT, "public", "classifications", "strongly-edge-homogeneous.json.br");
const DIR = path.join(ROOT, "experiments", "results", "edge-homogeneous-2026-11-06", "classify");
const LOG = path.join(DIR, "classify.log");
fs.mkdirSync(DIR, { recursive: true });
const arg = (name: string) => process.argv.indexOf(name);
const WORKER = arg("--worker"); // --worker <i> <n>
const log = (s: string) => {
	const line = `${new Date().toTimeString().slice(0, 8)}  ${WORKER >= 0 ? `[w${process.argv[WORKER + 1]}] ` : ""}${s}`;
	fs.appendFileSync(LOG, line + "\n");
	console.error(line);
};

// ── Galebach's list ──

interface Galebach {
	entry: number;
	e: number;
	figures: string;
}
const tokens = (word: string) =>
	word.split(".").flatMap((p) => {
		const [n, times] = p.split("^");
		return Array<string>(Number(times ?? 1)).fill(n);
	});
/** A full edge figure up to the edge's own symmetries: ends swapped, mirrored across the edge line. */
const canon = (U: string[], W: string[]) => {
	const s = (a: string[], b: string[]) => `${a.join(".")}/${b.join(".")}`;
	const rU = [...U].reverse(),
		rW = [...W].reverse();
	return [s(U, W), s(W, U), s(rU, rW), s(rW, rU)].sort()[0];
};
const galebach: Galebach[] = JSON.parse(fs.readFileSync(GALEBACH, "utf8")).tilings;
const FIG = /[A-Za-z]+:([0-9^.]+)\/([0-9^.]+)\(([^)]*)\)/g;
const galebachFigures = (g: Galebach) =>
	[...g.figures.matchAll(FIG)].map((m) => ({ U: tokens(m[1]), W: tokens(m[2]), tag: m[3] }));

// ── the regular shelf ──

// What the scan covers: the regular shelf to k = 10, complete when the scan ran (2026-11-06), and Galebach's own
// tilings above it. At half a second a tiling the shelf now complete to 16 would take days, and the homogeneous
// search has since proved his list complete with no bound on k, so the scan keeps its reach.
const SCANNED_K = 10;
const shelf = (): ReferenceTiling[] =>
	regularShelf([8, 9, 10, 11, 12, 13]).filter((r) => r.k <= SCANNED_K || r.source === "galebach");

// ── one tiling ──

interface Checked {
	id: string;
	k: number;
	E: number;
	/** edge-homogeneous: as many distinct figures as edge orbits */
	eh: boolean;
	/** one tagged figure per edge orbit, sorted; kept only for the edge-homogeneous ones */
	tagged?: string[];
	problems?: string[];
}
const key = (x: number, y: number) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)}`;
// a lattice coordinate in [0, 1) as a key; the irrational shift keeps exact fractions such as 17/64 off the
// rounding boundary, where float noise would split one class in two
const snap = (a: number) => Math.round(a * 1e5 + 1 / Math.PI) % 100000;
const corner = (n: number) => (180 * (n - 2)) / n;

function check(r: ReferenceTiling): Checked {
	const ring = CyclotomicRing.create(24);
	setActiveRing(ring);
	const cell = r.exactSource ? exactCellOf(ring, r.id, r.exactSource) : null;
	if (!cell) throw new Error("no cell");
	const [uE, vE] = cell.basisExact;
	const res = new KUniformityChecker().vertexOrbits(cell.cellPolygons, uE, vE);
	if (!res) throw new Error("no symmetry");
	const problems: string[] = [];
	if (res.orbits !== r.k) problems.push(`${res.orbits} vertex orbits, k = ${r.k}`);
	const u = uE.toVector(),
		v = vE.toVector(),
		det = u.x * v.y - u.y * v.x;
	const frac = (x: number, y: number) => [(x * v.y - y * v.x) / det, (u.x * y - u.y * x) / det];

	// every vertex of the replicated block with the polygons round it (size, direction of the centroid)
	const star = new Map<string, { n: number; a: number }[]>();
	const pos = new Map<string, { x: number; y: number }>();
	const edges = new Map<string, [string, string]>();
	let cx = 0,
		cy = 0;
	for (const p of res.block) {
		const vs = p.exactVertices!.map((z) => z.toVector());
		const c = { x: vs.reduce((s, q) => s + q.x, 0) / vs.length, y: vs.reduce((s, q) => s + q.y, 0) / vs.length };
		cx += c.x;
		cy += c.y;
		vs.forEach((q, i) => {
			const kq = key(q.x, q.y);
			pos.set(kq, q);
			(star.get(kq) ?? star.set(kq, []).get(kq)!).push({ n: vs.length, a: Math.atan2(c.y - q.y, c.x - q.x) });
			const k2 = key(vs[(i + 1) % vs.length].x, vs[(i + 1) % vs.length].y);
			edges.set(kq < k2 ? `${kq}|${k2}` : `${k2}|${kq}`, kq < k2 ? [kq, k2] : [k2, kq]);
		});
	}
	cx /= res.block.length;
	cy /= res.block.length;
	const full = (kq: string) => Math.abs(star.get(kq)!.reduce((t, q) => t + corner(q.n), 0) - 360) < 1e-6;
	const around = (a: string, b: string) => {
		const pa = pos.get(a)!,
			pb = pos.get(b)!,
			th = Math.atan2(pb.y - pa.y, pb.x - pa.x);
		const rel = (q: { a: number }) => (((q.a - th) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
		return [...star.get(a)!].sort((p, q) => rel(p) - rel(q)).map((q) => String(q.n));
	};
	// translation class of an edge: midpoint modulo the lattice, direction modulo 180° in 15° steps
	const lkey = (A: { x: number; y: number }, B: { x: number; y: number }) => {
		let [a, b] = frac((A.x + B.x) / 2 - cx, (A.y + B.y) / 2 - cy);
		a -= Math.floor(a + 1e-7);
		b -= Math.floor(b + 1e-7);
		const d = ((Math.round((Math.atan2(B.y - A.y, B.x - A.x) * 12) / Math.PI) % 12) + 12) % 12;
		return `${snap(a)},${snap(b)},${d}`;
	};
	// one representative per translation class, from any copy whose two ends are fully surrounded
	const reps: { a: string; b: string; fig: string }[] = [];
	const byClass = new Map<string, number>();
	for (const [a, b] of edges.values()) {
		if (!full(a) || !full(b)) continue;
		const lk = lkey(pos.get(a)!, pos.get(b)!);
		if (byClass.has(lk)) continue;
		byClass.set(lk, reps.length);
		reps.push({ a, b, fig: canon(around(a, b), around(b, a)) });
	}
	// edge orbits: translation classes joined under every symmetry; the tag is the edge's stabilizer
	const parent = reps.map((_, i) => i);
	const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
	const map = (q: { x: number; y: number }, g: (typeof res.syms)[number]) => {
		const t = (g.r * Math.PI) / 12,
			c = Math.cos(t),
			s = Math.sin(t),
			y = g.reflect ? -q.y : q.y,
			T = g.T.toVector();
		return { x: q.x * c - y * s + T.x, y: q.x * s + y * c + T.y };
	};
	const stab = reps.map(() => new Set<string>());
	let lost = 0;
	reps.forEach((e, i) => {
		const pa = pos.get(e.a)!,
			pb = pos.get(e.b)!;
		for (const g of res.syms) {
			const A = map(pa, g),
				B = map(pb, g);
			const j = byClass.get(lkey(A, B));
			if (j === undefined) {
				lost++;
				continue;
			}
			parent[find(i)] = find(j);
			if (j !== i) continue;
			const swap = (B.x - A.x) * (pb.x - pa.x) + (B.y - A.y) * (pb.y - pa.y) < 0;
			if (g.reflect) stab[i].add(swap ? "|" : "-");
			else if (swap) stab[i].add("2");
		}
	});
	if (lost) problems.push(`${lost} edge images not found`);
	const tagOf = (s: Set<string>) =>
		s.has("|") && s.has("-") ? "D+" : s.has("|") ? "D|" : s.has("-") ? "D-" : s.has("2") ? "C2" : "C1";
	const orbitFig = new Map<number, string>();
	reps.forEach((e, i) => {
		const f = `${e.fig}(${tagOf(stab[i])})`;
		if (orbitFig.has(find(i)) && orbitFig.get(find(i)) !== f) problems.push("one orbit, two figures");
		orbitFig.set(find(i), f);
	});
	const tagged = [...orbitFig.values()].sort();
	const E = tagged.length;
	if (r.edgeOrbits != null && r.edgeOrbits !== E) problems.push(`${E} edge orbits here, ${r.edgeOrbits} in the atlas`);
	const eh = new Set(tagged.map((f) => f.replace(/\(.*\)$/, ""))).size === E;
	return {
		id: r.id,
		k: r.k,
		E,
		eh,
		...(eh ? { tagged } : {}),
		...(problems.length ? { problems: [...new Set(problems)] } : {}),
	};
}

// ── checking, spread over worker processes ──

const resultFiles = () => fs.readdirSync(DIR).filter((f) => /^checked-[\w-]+\.jsonl$/.test(f));
function done(): Map<string, Checked | { id: string; error: string }> {
	const m = new Map<string, Checked | { id: string; error: string }>();
	for (const f of resultFiles())
		for (const line of fs.readFileSync(path.join(DIR, f), "utf8").split("\n"))
			if (line.trim()) {
				const x = JSON.parse(line);
				m.set(x.id, x);
			}
	return m;
}

function worker(i: number, n: number): void {
	const skip = done();
	const mine = shelf()
		.filter((_, j) => j % n === i)
		.filter((r) => !skip.has(r.id));
	const out = path.join(DIR, `checked-w${i}.jsonl`);
	const t0 = Date.now();
	let eh = 0;
	mine.forEach((r, j) => {
		let line: Checked | { id: string; error: string };
		try {
			line = check(r);
			if (line.eh) eh++;
		} catch (err) {
			line = { id: r.id, error: err instanceof Error ? err.message : String(err) };
		}
		fs.appendFileSync(out, JSON.stringify(line) + "\n");
		if ((j + 1) % 100 === 0 || j + 1 === mine.length) {
			const s = (Date.now() - t0) / 1000;
			log(
				`${j + 1}/${mine.length} | at k=${r.k} | edge-homogeneous ${eh} | ${s.toFixed(0)} s, ~${(((s / (j + 1)) * (mine.length - j - 1)) / 60).toFixed(1)} min left`,
			);
		}
	});
}

async function checkAll(jobs: number): Promise<void> {
	log(`=== the regular shelf: ${shelf().length} tilings, ${done().size} already checked, ${jobs} processes ===`);
	await Promise.all(
		Array.from(
			{ length: jobs },
			(_, i) =>
				new Promise<void>((resolve, reject) =>
					spawn(process.execPath, [...process.execArgv, process.argv[1], "--worker", String(i), String(jobs)], {
						stdio: ["ignore", "ignore", "inherit"],
					}).on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`worker ${i} exited ${code}`)))),
				),
		),
	);
}

// ── matching and the classification file ──

function match(): void {
	const all = done();
	const results = [...all.values()];
	const records = shelf();
	const unchecked = records.filter((r) => !all.has(r.id)).length;
	const errors = results.filter((x): x is { id: string; error: string } => "error" in x);
	const checked = results.filter((x): x is Checked => !("error" in x));
	const flagged = checked.filter((x) => x.problems?.length);
	const ours = new Map<string, Checked[]>();
	for (const x of checked)
		if (x.eh) (ours.get(x.tagged!.join(" ")) ?? ours.set(x.tagged!.join(" "), []).get(x.tagged!.join(" "))!).push(x);
	const theirs = new Map<string, Galebach[]>();
	for (const g of galebach) {
		const figs = galebachFigures(g)
			.map((f) => `${canon(f.U, f.W)}(${f.tag})`)
			.sort();
		if (figs.length !== g.e) throw new Error(`Galebach ${g.entry}: ${figs.length} figures, e = ${g.e}`);
		(theirs.get(figs.join(" ")) ?? theirs.set(figs.join(" "), []).get(figs.join(" "))!).push(g);
	}
	// Two of his tilings can share every figure, tags included. Both sides then hold the same tilings, but which
	// of ours is which of his entries the figures cannot say: those members carry `same`, the entries it could be.
	const members: { ref: number; e: number; id?: string; k?: number; same?: number[]; dsym?: string }[] = [];
	const ambiguous: string[] = [];
	for (const [figs, gs] of theirs) {
		const xs = ours.get(figs) ?? [];
		if (xs.length > 1 || gs.length > 1)
			ambiguous.push(`${gs.map((g) => g.entry).join("/")} ↔ ${xs.map((x) => x.id).join("/") || "none"}`);
		const same = gs.length > 1 ? { same: gs.map((g) => g.entry) } : {};
		gs.forEach((g, i) =>
			members.push({ ref: g.entry, e: g.e, ...(xs[i] ? { id: xs[i].id, k: xs[i].k } : {}), ...same }),
		);
	}
	const extra = [...ours]
		.filter(([figs]) => !theirs.has(figs))
		.flatMap(([, xs]) => xs.map((x) => ({ id: x.id, k: x.k, e: x.E })));
	members.sort((a, b) => a.e - b.e || a.ref - b.ref);
	const placed = members.filter((m) => m.id);
	// Each placed tiling's Delaney–Dress symbol, which must be one the homogeneous search found.
	const ids = new Set(placed.map((m) => m.id));
	const proved = new Map(
		provedOnShelf(
			"edge",
			records.filter((r) => ids.has(r.id)),
		).map((p) => [p.id, p.dsym]),
	);
	for (const m of placed) m.dsym = proved.get(m.id!);
	log(`\n=== match: ${checked.length} tilings checked, ${errors.length} could not be, ${flagged.length} flagged ===`);
	for (const x of errors.slice(0, 20)) log(`  ⚑ ${x.id}: ${x.error}`);
	for (const x of flagged.slice(0, 20)) log(`  ⚑ ${x.id}: ${x.problems!.join("; ")}`);
	log(
		`edge-homogeneous on the shelf: ${checked.filter((x) => x.eh).length}; Galebach's tilings placed: ${placed.length} of ${members.length}`,
	);
	log(
		`placed, by k: ${JSON.stringify(Object.fromEntries([...new Set(placed.map((m) => m.k!))].sort((a, b) => a - b).map((k) => [k, placed.filter((m) => m.k === k).length])))}`,
	);
	log(
		`not on the shelf${unchecked ? ` (${unchecked} shelf tilings not checked yet)` : ""}: ${members
			.filter((m) => !m.id)
			.map((m) => `#${m.ref} (e=${m.e})`)
			.join(", ")}`,
	);
	log(`symbols: every placed tiling's is one of the ${searchRows("edge").length} the homogeneous search found`);
	if (ambiguous.length) log(`⚑ figure sets held by more than one tiling on a side: ${ambiguous.join("; ")}`);
	log(
		extra.length
			? `⚑ edge-homogeneous on the shelf but not in Galebach's list: ${JSON.stringify(extra)}`
			: "every edge-homogeneous tiling on the shelf is in Galebach's list",
	);
	fs.mkdirSync(path.dirname(OUT), { recursive: true });
	writeClassification(OUT, members, records, {
		checked: { complete: SCANNED_K, tilings: checked.length, unchecked, failed: errors.length, extra },
	});
	log(`★ wrote ${path.relative(ROOT, OUT)}`);

	// Strongly edge-homogeneous (Chavey's simple edge figures): one edge class per pair of polygons, the two that
	// share the edge. Read off the scan's figures, and required to be the same tilings the search's figures give.
	const strongly = (figs: string[], e: number) =>
		new Set(figs.map((f) => [f.split("/")[0].split(".")[0], f.split("/")[0].split(".").at(-1)].sort().join("-")))
			.size === e;
	const byId = new Map(checked.map((x) => [x.id, x]));
	const strong = placed.filter((m) => strongly(byId.get(m.id!)!.tagged!, m.e));
	const searched = new Set(
		searchRows("edge")
			.filter((r) => strongly(r.figures, r.e))
			.map(rowSymbol),
	);
	if (strong.length !== searched.size || strong.some((m) => !searched.has(m.dsym!)))
		throw new Error(
			`strongly edge-homogeneous: the scan finds ${strong.length}, the search ${searched.size}, not one list`,
		);
	writeClassification(STRONG, strong, records);
	log(`★ wrote ${path.relative(ROOT, STRONG)}: ${strong.length} strongly edge-homogeneous, the search's same tilings`);
}

if (WORKER >= 0) {
	const [i, n] = process.argv.slice(WORKER + 1, WORKER + 3).map(Number);
	worker(i, n);
} else {
	const jobs = arg("--jobs") >= 0 ? Number(process.argv[arg("--jobs") + 1]) : Math.max(1, os.cpus().length - 2);
	(async () => {
		if (arg("--match-only") < 0) await checkAll(jobs);
		match();
	})().catch((err) => {
		log(`⚑ ${err instanceof Error ? err.message : err}`);
		process.exitCode = 1;
	});
}
