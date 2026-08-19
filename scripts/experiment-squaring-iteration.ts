// Iterate the squaring: feed a squared torus back in as the tiling, and see where it goes.
//
//   pnpm tsx scripts/experiment-squaring-iteration.ts
//
// THE MAP. A periodic tiling, quotiented by its lattice, is a graph on a torus; a class in H¹(T;ℝ) turns
// every EDGE of that graph into a square, and the squares tile a flat torus. The output is a Euclidean
// periodic tiling in its own right, so it has a quotient graph of its own and the construction can be
// applied again. This script does that, and records what happens.
//
// WHAT THE COMBINATORICS HAS TO DO, before any measurement. A squared torus is generically a brick
// arrangement: every corner of every square lands partway along another square's side, so every vertex
// of the quotient is a T-junction of degree 3. Writing E for the edges going in, the squaring has F = E
// faces (one square per edge), and 3V = 2E' with V − E' + F = 0 gives
//
//     E' = 3E.
//
// The edge count TRIPLES every step, exactly, whenever the T-junctions are generic. So the process
// cannot cycle and cannot converge combinatorially — it is strictly expanding, and 2 → 6 → 18 → 54 →
// 162 → 486 is the whole story of its size. What is left to ask is whether the GEOMETRY settles: the
// flat torus the squares tile has a modulus τ, and the sides have a shape distribution, and those live
// in spaces where a limit is possible. That is what this measures.
//
// COST. The solve is a BigInt Bareiss elimination on a (V−1)² matrix whose determinant is the spanning
// tree count of the quotient, and that grows exponentially in E. Four or five iterations is the reach.

import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
import { buildTorusMap, type TorusCell, type TorusMap } from "@/lib/squaring/torusMap";
import { squareTorus, torusClasses, type TorusSquaring } from "@/lib/squaring/torusSquaring";

const OUT_DIR = path.join(process.cwd(), "experiments", "results");
const STAMP = "2026-08-19";
const LOG = path.join(OUT_DIR, `squaring-iteration-${STAMP}.md`);
const JSON_OUT = path.join(OUT_DIR, `squaring-iteration-${STAMP}.json`);

/** Stop before the exact solve becomes the whole afternoon. */
const MAX_EDGES = 700;
const MAX_STEPS = 8;

const S3 = Math.sqrt(3);
const ring = (cx: number, cy: number, n: number, r: number, phase = 0): [number, number][] =>
	Array.from(
		{ length: n },
		(_, i) => [cx + r * Math.cos(phase + (2 * Math.PI * i) / n), cy + r * Math.sin(phase + (2 * Math.PI * i) / n)] as [number, number],
	);

/** The seeds: the small uniform tilings, where every step is affordable and the answer is checkable. */
function seeds(): { id: string; cell: TorusCell }[] {
	const hex = ring(0, 0, 6, 1);
	const t8 = 1 + Math.SQRT2;
	const R8 = 1 / (2 * Math.sin(Math.PI / 8));
	return [
		{
			id: "4.4.4.4 square",
			cell: { polygons: [[[0, 0], [1, 0], [1, 1], [0, 1]]], basis: [[1, 0], [0, 1]] },
		},
		{
			id: "3^6 triangular",
			cell: {
				polygons: [
					[[0, 0], [1, 0], [0.5, S3 / 2]],
					[[1, 0], [1.5, S3 / 2], [0.5, S3 / 2]],
				],
				basis: [[1, 0], [0.5, S3 / 2]],
			},
		},
		{ id: "6^3 hexagonal", cell: { polygons: [hex], basis: [[1.5, S3 / 2], [0, S3]] } },
		{
			id: "3.6.3.6 trihexagonal",
			cell: {
				polygons: [hex, [hex[0], [1.5, S3 / 2], hex[1]], [hex[0], [1.5, -S3 / 2], hex[5]]],
				basis: [[2, 0], [1, S3]],
			},
		},
		{
			id: "4.8.8 truncated square",
			cell: {
				polygons: [ring(0, 0, 8, R8, Math.PI / 8), ring(t8 / 2, t8 / 2, 4, Math.SQRT2 / 2, 0)],
				basis: [[t8, 0], [0, t8]],
			},
		},
	];
}

/** The squared torus as a cell the construction can read again: squares as polygons, image lattice as basis. */
function squaringToCell(sq: TorusSquaring): TorusCell {
	const polygons: [number, number][][] = sq.squares.map((s) => {
		const x = Number(s.x);
		const y = Number(s.y);
		const w = Number(s.side);
		return [
			[x, y],
			[x + w, y],
			[x + w, y + w],
			[x, y + w],
		];
	});
	return {
		polygons,
		basis: [
			[Number(sq.lattice[0][0]), Number(sq.lattice[0][1])],
			[Number(sq.lattice[1][0]), Number(sq.lattice[1][1])],
		],
	};
}

/**
 * The similarity class of the flat torus the squares tile: τ = ω₂/ω₁ as a complex number, reduced to the
 * standard fundamental domain of SL(2,ℤ). Two tori are the same shape exactly when their reduced τ agree,
 * so this is the invariant a convergence question is asked in.
 */
function modulus(basis: [[number, number], [number, number]]): { re: number; im: number } | null {
	let [a, b] = [basis[0], basis[1]];
	// τ = b/a in ℂ.
	const den = a[0] * a[0] + a[1] * a[1];
	if (!(den > 0)) return null;
	let re = (b[0] * a[0] + b[1] * a[1]) / den;
	let im = (b[1] * a[0] - b[0] * a[1]) / den;
	if (im < 0) im = -im;
	if (!(im > 0)) return null;
	// Reduce: translate into |Re τ| ≤ 1/2, then invert while |τ| < 1.
	for (let guard = 0; guard < 200; guard++) {
		const shift = Math.round(re);
		re -= shift;
		const n2 = re * re + im * im;
		if (n2 >= 1 - 1e-12) break;
		const nre = -re / n2;
		const nim = im / n2;
		re = nre;
		im = nim;
	}
	return { re, im };
}

/** Ratio of the largest side to the smallest, the coarsest description of the size spread. */
function spread(sq: TorusSquaring): number {
	const s = sq.squares.map((q) => Number(q.side));
	return Math.max(...s) / Math.min(...s);
}

interface Step {
	step: number;
	V: number;
	E: number;
	F: number;
	tjunctions: number;
	order: number;
	distinct: number;
	perfect: boolean;
	degenerate: number;
	spread: number;
	tau: { re: number; im: number } | null;
	/** Fraction of quotient vertices of degree 3 — the assumption behind E' = 3E. */
	degree3: number;
	ms: number;
	cls: [number, number];
}

function degreeProfile(map: TorusMap): number {
	const deg = new Array<number>(map.V).fill(0);
	for (const d of map.darts) deg[d.tail] += 1;
	return deg.filter((d) => d === 3).length / map.V;
}

/** The class to use at this step. Two rules, both canonical, because the answer may depend on which. */
type Rule = "fixed" | "richest";

function pickClass(map: TorusMap, rule: Rule, fixed: [number, number]): [number, number] | null {
	if (rule === "fixed") return fixed;
	let best: [number, number] | null = null;
	let bestScore = -1;
	// Only the small classes: the sweep is over the exact solve, and it is the expensive one.
	for (const [m, n] of torusClasses(3)) {
		const r = squareTorus(map, m, n);
		if (r.ok === false) continue;
		const score = r.squaring.distinct * 1000 + r.squaring.order;
		if (score > bestScore) {
			bestScore = score;
			best = [m, n];
		}
	}
	return best;
}

function log(line: string): void {
	appendFileSync(LOG, line + "\n");
	console.log(line);
}

function main(): void {
	mkdirSync(OUT_DIR, { recursive: true });
	writeFileSync(
		LOG,
		[
			`# Iterating the squaring (${STAMP})`,
			"",
			"Feed a squared torus back in as the tiling and square it again. The prediction from Euler, before",
			"any run: every vertex of a squared torus is generically a T-junction of degree 3, the squaring has",
			"one face per edge going in, so 3V = 2E' and V - E' + F = 0 give **E' = 3E**. The edge count should",
			"triple every step, which would make the process strictly expanding: no cycles, no combinatorial",
			"limit. What can still settle is the SHAPE — the modulus tau of the flat torus, and the spread of",
			"the sizes.",
			"",
			`Caps: stop past E = ${MAX_EDGES} or ${MAX_STEPS} steps, whichever comes first. The solve is a BigInt`,
			"Bareiss elimination whose determinant is the spanning-tree count, so it is exponential in E.",
			"",
			"| seed | rule | step | V | E | F | E'/E | deg-3 | order | distinct | perfect | spread | tau | ms |",
			"|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
		].join("\n"),
	);

	const runs: { seed: string; rule: Rule; steps: Step[]; stopped: string }[] = [];
	for (const seed of seeds()) {
		for (const rule of ["fixed", "richest"] as Rule[]) {
			const steps: Step[] = [];
			let cell = seed.cell;
			let stopped = "max steps";
			let prevE = 0;
			for (let step = 1; step <= MAX_STEPS; step++) {
				const built = buildTorusMap(cell);
				if (built.ok === false) {
					stopped = `map failed: ${built.error.reason} (${built.error.detail})`;
					break;
				}
				const map = built.map;
				if (map.E > MAX_EDGES) {
					stopped = `E = ${map.E} past the cap`;
					break;
				}
				const t0 = performance.now();
				const cls = pickClass(map, rule, [1, 0]);
				if (!cls) {
					stopped = "no class gave a squaring";
					break;
				}
				const r = squareTorus(map, cls[0], cls[1]);
				if (r.ok === false) {
					stopped = `solve failed: ${r.error.reason}`;
					break;
				}
				const ms = performance.now() - t0;
				const sq = r.squaring;
				const rec: Step = {
					step,
					V: map.V,
					E: map.E,
					F: map.F,
					tjunctions: map.tjunctions,
					order: sq.order,
					distinct: sq.distinct,
					perfect: sq.perfect,
					degenerate: sq.degenerate,
					spread: spread(sq),
					tau: modulus([
						[Number(sq.lattice[0][0]), Number(sq.lattice[0][1])],
						[Number(sq.lattice[1][0]), Number(sq.lattice[1][1])],
					]),
					degree3: degreeProfile(map),
					ms,
					cls,
				};
				steps.push(rec);
				const growth = prevE > 0 ? (map.E / prevE).toFixed(3) : "-";
				prevE = map.E;
				log(
					`| ${seed.id} | ${rule} | ${step} | ${map.V} | ${map.E} | ${map.F} | ${growth} | ${(rec.degree3 * 100).toFixed(0)}% | ${sq.order} | ${sq.distinct} | ${sq.perfect ? "yes" : "no"} | ${rec.spread.toFixed(2)} | ${rec.tau ? `${rec.tau.re.toFixed(4)}+${rec.tau.im.toFixed(4)}i` : "-"} | ${ms.toFixed(0)} |`,
				);
				cell = squaringToCell(sq);
			}
			log(`| ${seed.id} | ${rule} | STOP | | | | | | | | | | | ${stopped} |`);
			runs.push({ seed: seed.id, rule, steps, stopped });
			writeFileSync(JSON_OUT, JSON.stringify(runs, null, 1));
		}
	}

	log("");
	log("## Reading");
	log("");
	for (const run of runs) {
		const es = run.steps.map((s) => s.E);
		const ratios = es.slice(1).map((e, i) => (e / es[i]).toFixed(2));
		const taus = run.steps.map((s) => (s.tau ? `${s.tau.re.toFixed(3)}+${s.tau.im.toFixed(3)}i` : "-"));
		log(`- **${run.seed}** (${run.rule}): E = ${es.join(" -> ")}; ratios ${ratios.join(", ") || "-"}; tau ${taus.join(" -> ")}. Stopped: ${run.stopped}`);
	}
	log("");
	log(`Raw: \`${path.relative(process.cwd(), JSON_OUT)}\``);
}

main();
