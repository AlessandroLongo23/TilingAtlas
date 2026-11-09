// The Tiling Searcher board behind each atlas shelf, for "Open in the Searcher" (components/atlas/open-in-searcher.tsx).
//
//   pnpm tsx scripts/build-searcher-boards.ts            # writes public/searcher-boards.json.br
//   pnpm tsx scripts/build-searcher-boards.ts --check    # also runs the engine on every board, k <= 3 or so,
//                                                          and compares its census with the shelf's counts
//
// A shelf gets a board only from a generator that reproduces it, checked board by board with --check: a board
// that finds a different set of tilings would hand people a search that disagrees with the shelf it came from.
//
// Generators:
//   Euclidean regular polygons  the Searcher's own example plus the octagon (4.8.8), so k = 1 is 11, not 10
//   {3,n}                       triangles and n-gons at the edge where n triangles close; every a + 2b = n
//   3.4.n.4, a.b.c.d, hybrid    regular polygons at one edge, and every multiset of their angles that closes
//                               a vertex there, decided at 50 digits (decimal.js)
// Not yet: the multi-length hybrids (1247_1_0612), the star and half-tile hyperbolic boards, every spherical
// shelf, and the Euclidean shelves the Searcher has no board form for.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Decimal from "decimal.js";
import { HYP_POLY_BOARDS, type HypPolyBoard } from "@/lib/tilings/hyp-poly";
import { writeDataFile } from "./atlas/io.mjs";

const D = Decimal.clone({ precision: 50 });
const PI = D.acos(-1);
const TWO_PI = PI.times(2);
const EPS = new D("1e-35");

// The search runs in doubles; every vertex it finds is then confirmed at 50 digits (decimal.js), so a near
// miss at double precision cannot slip in as a vertex, and the edge itself is refined to 50 digits.

/** Interior angle of a regular p-gon (p = 0: an apeirogon) of side s in H²: sin(a/2) = cos(π/p) / cosh(s/2). */
const angleF = (p: number, s: number) => 2 * Math.asin((p ? Math.cos(Math.PI / p) : 1) / Math.cosh(s / 2));
const angleExact = (p: number, s: Decimal) => D.asin((p ? D.cos(PI.div(p)) : new D(1)).div(D.cosh(s.div(2)))).times(2);
// 50-digit trigonometry is slow; a board asks for the same few angles thousands of times
let memoEdge: Decimal | null = null;
const memo = new Map<number, Decimal>();
function angle(p: number, s: Decimal) {
	if (memoEdge !== s) {
		memoEdge = s;
		memo.clear();
	}
	let a = memo.get(p);
	if (!a) memo.set(p, (a = angleExact(p, s)));
	return a;
}
const closes = (fig: number[], s: Decimal) =>
	fig
		.reduce((sum, p) => sum.plus(angle(p, s)), new D(0))
		.minus(TWO_PI)
		.abs()
		.lt(EPS);

/** The edge length at which `figure` closes a vertex: bisection in doubles, then at 50 digits from there. */
function edgeOf(figure: number[]): Decimal | null {
	const fF = (s: number) => figure.reduce((sum, p) => sum + angleF(p, s), 0) - 2 * Math.PI;
	let lo = 1e-12,
		hi = 40;
	if (fF(lo) <= 0 || fF(hi) >= 0) return null;
	for (let i = 0; i < 200 && hi - lo > 1e-14; i++) {
		const mid = (lo + hi) / 2;
		if (fF(mid) > 0) lo = mid;
		else hi = mid;
	}
	// Newton at 50 digits from the double: each step doubles the digits, so five are plenty
	const f = (s: Decimal) => figure.reduce((sum, p) => sum.plus(angleExact(p, s)), new D(0)).minus(TWO_PI);
	const h = new D("1e-30");
	let x = new D((lo + hi) / 2);
	for (let i = 0; i < 6; i++) {
		const fx = f(x);
		x = x.minus(fx.times(h).div(f(x.plus(h)).minus(fx)));
	}
	return f(x).abs().lt(EPS) ? x : null;
}

/** Every multiset of the tiles' angles that sums to 2π at s, with three corners or more. */
function vertices(tiles: number[], s: Decimal): number[][] {
	const sF = s.toNumber();
	const order = [...tiles].sort((a, b) => angleF(b, sF) - angleF(a, sF));
	const angs = order.map((p) => angleF(p, sF));
	const out: number[][] = [];
	const walk = (i: number, left: number, acc: number[]) => {
		if (Math.abs(left) < 1e-9) {
			if (acc.length >= 3 && closes(acc, s)) out.push(acc);
			return;
		}
		if (i === order.length || left < -1e-9) return;
		for (let n = 0; angs[i] * n <= left + 1e-9; n++)
			walk(i + 1, left - angs[i] * n, [...acc, ...Array(n).fill(order[i])]);
	};
	walk(0, 2 * Math.PI, []);
	return out;
}

const tok = (p: number) => (p ? `A${p}` : "Aoo");
const kRange = (b: HypPolyBoard) => {
	const ks = Object.keys(b.counts).map(Number);
	return [Math.min(...ks, 1), Math.max(...ks, 1)];
};

function regularBoard(
	name: string,
	comment: string,
	tiles: number[],
	s: Decimal,
	k: number[],
	only?: number[],
): string {
	const key = (v: number[]) => [...v].sort((a, b) => a - b).join();
	const vs = vertices(tiles, s).filter((v) => !only || key(v) === key(only));
	return [
		`# ${comment}`,
		`# edge ${s.toSignificantDigits(15).toString()}`,
		`name ${name}`,
		`k ${k[0]} ${k[1]}`,
		"",
		...tiles.map((p) => `angle ${tok(p)}`),
		"",
		...tiles.map((p) => `face ${tok(p)} x ${p || "inf"}`),
		"",
		...vs
			.map((v) => [...v].sort((a, b) => (a || 1e9) - (b || 1e9)))
			.sort((a, b) => a.length - b.length || a.join().localeCompare(b.join()))
			.map((v) => `vertex ${v.map(tok).join(" ")}`),
		"",
		"permutations yes",
		"",
	].join("\n");
}

/** The digits of an a.b.c.d id or label: "3,4,4,10" → [3, 4, 4, 10]. */
const sizes = (label: string) => label.split(",").map((x) => Number(x.trim()));

/** A hybrid board's alphabet and named edge: "af1, edge 0.7672 (3, 4, 5, 10)" → [3, 4, 5, 10], 0.7672. */
function hybridSpec(label: string): { tiles: number[]; edge: number } | null {
	const m = /edge (\d+\.\d+) \(([^)]+)\)$/.exec(label);
	if (!m || label.includes("×")) return null; // multi-length boards are not one edge
	return { edge: Number(m[1]), tiles: m[2].split(",").map((x) => (x.trim() === "∞" ? 0 : Number(x))) };
}

/** The exact edge a hybrid board is named for: a closing figure over its alphabet whose edge rounds to it. */
function hybridEdge(tiles: number[], named: number): Decimal | null {
	const fF = (fig: number[], s: number) => fig.reduce((sum, p) => sum + angleF(p, s), 0) - 2 * Math.PI;
	const figs: number[][] = [];
	const walk = (i: number, acc: number[]) => {
		// the named edge has four places, rounded or cut ("1.0612" is 1.0612751): a figure closes inside that
		// window or it is not this board's
		if (acc.length >= 3 && fF(acc, named - 5.5e-5) > 0 && fF(acc, named + 1.0001e-4) < 0) figs.push(acc);
		if (acc.length === 8) return;
		for (let j = i; j < tiles.length; j++) walk(j, [...acc, tiles[j]]);
	};
	walk(0, []);
	if (!figs.length) return null;
	const s = edgeOf(figs[0]);
	// Every figure that rounds to the name closes at that same edge, or the board is not one system.
	return s && figs.every((f) => closes(f, s)) ? s : null;
}

const boards: Record<string, string> = {};
const counts: Record<string, Record<number, number>> = {};

// Euclidean regular polygons: the app's own example, and the octagon, which the example leaves out.
{
	const example = fs.readFileSync("tools/searcher/boards/examples/1-regular.board", "utf8");
	boards["euclidean/regular"] = example
		.replace("angle A12\n", "angle A12\nangle A8 135\n")
		.replace("face A12 x 12\n", "face A12 x 12\nface A8 x 8\n")
		.replace("vertex A4 A6 A12\n", "vertex A4 A6 A12\nvertex A4 A8 A8\n")
		.replace(/^k \d+ \d+$/m, "k 1 10");
	counts["euclidean/regular"] = { 1: 11, 2: 20, 3: 61 };
}

// Boards the one-edge generator cannot make, kept as the files they ran from: 2.9830's big tile is a 24-gon the
// board calls A30 (its label lists 3 and 4 only), and 1247_1_0612 has tiles at four edge lengths.
const FILES: Record<string, string> = { y29830: "hybrid_2_9830.board", y124710612: "1247_1_0612.board" };
const FILE_KEYS = new Set(Object.keys(FILES).map((id) => `hpy-${id.slice(1)}`));
const started = Date.now();
for (const b of HYP_POLY_BOARDS) {
	const key =
		b.family === "ai1"
			? `hpo-${b.id}`
			: b.family === "ai2"
				? `hpt-${b.id.slice(1)}`
				: b.family === "abcd"
					? `hpq-${b.id}`
					: `hpy-${b.id.slice(1)}`;
	let text: string | null = null;
	if (b.family === "ai2") {
		const n = Number(b.id.slice(1));
		const lines = Array.from(
			{ length: Math.floor(n / 2) + 1 },
			(_, j) => `vertex ${[...Array(n - 2 * j).fill("A3"), ...Array(j).fill(`A${n}`)].join(" ")}`,
		);
		const k = kRange(b);
		text = [
			`# {3,${n}}: triangles and ${n}-gons at the edge where ${n} triangles close a vertex`,
			`name triangles_${n}`,
			`k ${k[0]} ${k[1]}`,
			"",
			"angle A3",
			`angle A${n}`,
			"",
			"face A3 x 3",
			`face A${n} x ${n}`,
			"",
			...lines,
			"",
			"permutations yes",
			"",
		].join("\n");
	} else if (b.family === "ai1") {
		const n = b.n;
		const s = edgeOf([3, 4, n, 4]);
		if (s)
			text = regularBoard(
				`ai1_${n}`,
				`3.4.${n}.4: triangles, squares, ${n}-gons and ${2 * n}-gons at the edge where 3.4.${n}.4 closes`,
				[3, 4, n, 2 * n],
				s,
				kRange(b),
			);
	} else if (b.family === "abcd") {
		const fig = sizes(b.label);
		const s = edgeOf(fig);
		const tiles = [...new Set(fig)].sort((x, y) => x - y);
		// Marek's abcdtest: every vertex is the figure a.b.c.d itself, in any cyclic order. At 3.7.7.7's edge a
		// 7-gon is two triangles' worth, and with every closing vertex the board found the {3,7} tilings; at
		// 4.5.6.10's another four-polygon vertex closes, and with it the board found tilings the shelf has not.
		if (s)
			text = regularBoard(
				`abcd_${b.id}`,
				`${fig.join(".")}: its polygons at the edge where ${fig.join(".")} closes, and that vertex alone`,
				tiles,
				s,
				kRange(b),
				fig,
			);
	} else if (FILES[b.id]) {
		// a board the Searcher already has as a file, exactly as it ran
		text = fs
			.readFileSync(`tools/searcher/boards/${FILES[b.id]}`, "utf8")
			.replace(/^k \d+ \d+$/m, `k ${kRange(b).join(" ")}`);
	} else if (b.family === "hybrid") {
		const spec = hybridSpec(b.label);
		const s = spec && hybridEdge(spec.tiles, spec.edge);
		const tiles = spec ? [...spec.tiles].sort((x, y) => (x || 1e9) - (y || 1e9)) : [];
		if (s) text = regularBoard(`hybrid_${b.id.slice(1)}`, `${b.label}: its polygons at that edge`, tiles, s, kRange(b));
	}
	if (text) {
		boards[key] = text;
		counts[key] = b.counts;
	} else console.log(`no board: ${key} (${b.label})`);
}
console.log(`generated ${Object.keys(boards).length} boards in ${((Date.now() - started) / 1000).toFixed(1)} s`);

// --check: the engine's census at small k against the shelf's. A board that disagrees is dropped and named.
const check = process.argv.includes("--check");
const failed: string[] = [];
if (check) {
	const engine = path.resolve(process.env.TILESEARCH ?? "tools/searcher/tilesearch");
	const log = path.join("experiments/results", `searcher-boards-check-${new Date().toISOString().slice(0, 10)}.log`);
	fs.writeFileSync(log, `# searcher boards against the atlas's counts, ${new Date().toISOString()}\n`);
	const keys = Object.keys(boards);
	const t0 = Date.now();
	keys.forEach((key, i) => {
		const want = counts[key];
		const ks = Object.keys(want)
			.map(Number)
			.sort((a, b) => a - b);
		// the largest k <= 3 whose tilings, all k up to it, the engine lists in a minute or so
		let kmax = 1;
		for (let k = 2, total = want[1] ?? 0; k <= Math.min(3, Math.max(...ks)); k++) {
			total += want[k] ?? 0;
			if (total > 20_000) break;
			kmax = k;
		}
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "searcher-board-"));
		fs.writeFileSync(path.join(dir, "input.board"), boards[key]);
		let got: Record<number, number> = {};
		let note = "";
		try {
			execFileSync(
				engine,
				["input.board", "--k", "1", String(kmax), "--threads", "6", "--seconds", "120", "--progress"],
				{
					cwd: dir,
					stdio: "ignore",
					timeout: 150_000,
				},
			);
			const census = fs.readdirSync(dir, { recursive: true }).find((f) => String(f).endsWith("census.txt"));
			if (census)
				for (const [, k, c] of fs.readFileSync(path.join(dir, String(census)), "utf8").matchAll(/k=(\d+) -- (\d+)/g))
					got[Number(k)] = Number(c);
		} catch (e) {
			note = ` (engine: ${(e as Error).message.split("\n")[0].slice(0, 80)})`;
			got = {};
		}
		fs.rmSync(dir, { recursive: true, force: true });
		const ok = Array.from({ length: kmax }, (_, j) => j + 1).every((k) => (got[k] ?? -1) === (want[k] ?? 0));
		// A board kept as the file its shelf was developed from stands on that: 1247_1_0612's shelf is partial
		// past k = 1 (its label says so), and y29830's was re-run whole after the branch's data was cut.
		if (!ok && !FILE_KEYS.has(key)) failed.push(key);
		const eta = ((Date.now() - t0) / (i + 1)) * (keys.length - i - 1);
		const line = `${String(i + 1).padStart(4)}/${keys.length} ${ok ? "ok  " : "DIFF"} ${key.padEnd(18)} k<=${kmax} engine ${JSON.stringify(got)} atlas ${JSON.stringify(Object.fromEntries(Array.from({ length: kmax }, (_, j) => [j + 1, want[j + 1] ?? 0])))}${note}  eta ${Math.round(eta / 1000)}s\n`;
		fs.appendFileSync(log, line);
		process.stdout.write(line);
	});
	for (const key of failed) delete boards[key];
	fs.appendFileSync(
		log,
		`# ${keys.length - failed.length} of ${keys.length} boards kept (the ${FILE_KEYS.size} from source files on provenance); dropped: ${failed.join(", ") || "none"}\n`,
	);
}

writeDataFile("public/searcher-boards.json.br", JSON.stringify({ version: 1, checked: check, boards }));
console.log(`${Object.keys(boards).length} boards written${check ? `, ${failed.length} dropped` : ""}`);
