/**
 * Measure where each type's sliders actually stay inside their family.
 *
 *   pnpm tsx scripts/scan-pentagon-ranges.ts
 *
 * Bounds cannot be derived from the convexity inequalities alone. Those describe a strictly larger
 * region than the family: on the over-determined types the determinant root simply stops existing part
 * way along, and on several others a side length crosses zero first. Guessing the bounds hands the
 * reader dead stretches of slider that draw nothing.
 *
 * So scan. For each parameter, walk outward from the default in both directions and stop at the first
 * value where the whole pipeline fails (solve, assemble, then the area-plus-SAT tiling check), which
 * gives the maximal contiguous interval around the default. Contiguous matters: a type can have a
 * second, disconnected branch elsewhere in the range, and jumping across the gap would look like the
 * tiling teleporting.
 *
 * Prints suggested min/max to paste into lib/pentagon/types.ts, and logs to
 * experiments/results/pentagon-ranges.txt.
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PENTAGON_TYPES, defaultParams, type PentagonType } from "../lib/pentagon/types";
import { area, solvePentagon, type Point } from "../lib/pentagon/solve";
import { ASSEMBLIES, assembleUnit } from "../lib/pentagon/assembly";

const LOG = resolve(process.cwd(), "experiments/results/pentagon-ranges.txt");

function log(line: string) {
	process.stdout.write(line + "\n");
	appendFileSync(LOG, line + "\n");
}

const EPS = 1e-7;

/**
 * THE SEARCH DOMAIN IS THE WHOLE MATHEMATICALLY POSSIBLE ONE, not the type record's current min/max.
 *
 * Scanning inside the existing bounds can only ever narrow them, so a bound that was guessed too tight
 * survives the scan looking measured. Type 13 shipped with A ∈ [95°, 135°] exactly that way, when its
 * family really starts at 90°, where D reaches 180° and the tile flattens into a rectangle that tiles
 * perfectly well. Every bound is now found by walking out until the tiling actually breaks.
 */
const ANGLE_DOMAIN: [number, number] = [0.05, 180];
/** Side ratios are positive and unbounded above; wide enough that nothing real is clipped. */
const RATIO_DOMAIN: [number, number] = [0.005, 40];

/** Round onto the slider's own step, inward if the exact endpoint turns out not to work. */
function snapToStep(v: number, step: number, dir: 1 | -1, probe: (x: number) => boolean): number {
	const round = dir === 1 ? Math.floor : Math.ceil;
	let x = Number((round(v / step + dir * 1e-9) * step).toFixed(6));
	for (let k = 0; k < 4 && !probe(x); k++) x = Number((x - dir * step).toFixed(6));
	return x;
}

function overlaps(A: Point[], B: Point[]): boolean {
	for (const poly of [A, B]) {
		for (let i = 0; i < poly.length; i++) {
			const p = poly[i];
			const q = poly[(i + 1) % poly.length];
			const nx = -(q.y - p.y);
			const ny = q.x - p.x;
			let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
			for (const v of A) {
				const d = nx * v.x + ny * v.y;
				if (d < aMin) aMin = d;
				if (d > aMax) aMax = d;
			}
			for (const v of B) {
				const d = nx * v.x + ny * v.y;
				if (d < bMin) bMin = d;
				if (d > bMax) bMax = d;
			}
			const scale = Math.hypot(nx, ny) || 1;
			if (aMax < bMin + EPS * scale || bMax < aMin + EPS * scale) return false;
		}
	}
	return true;
}

/** Solve, assemble, and confirm the result actually tiles. */
function works(t: PentagonType, angles: number[], sides: number[]): boolean {
	const solved = solvePentagon(t, angles, sides);
	if (!solved.ok) return false;
	const asm = ASSEMBLIES[t.id];
	if (!asm) return false;
	const built = assembleUnit(solved.pentagon.corners as unknown as Point[], asm);
	if (!built) return false;

	const cell = Math.abs(built.t1.x * built.t2.y - built.t1.y * built.t2.x);
	if (!(cell > 1e-9)) return false;
	const total = built.unit.reduce((s, p) => s + area(p), 0);
	if (Math.abs(total - cell) / cell > 1e-9) return false;

	for (let m = -1; m <= 1; m++) {
		for (let n = -1; n <= 1; n++) {
			const dx = m * built.t1.x + n * built.t2.x;
			const dy = m * built.t1.y + n * built.t2.y;
			for (let i = 0; i < built.unit.length; i++) {
				for (let j = 0; j < built.unit.length; j++) {
					if (m === 0 && n === 0 && i >= j) continue;
					const shifted = built.unit[j].map((p) => ({ x: p.x + dx, y: p.y + dy }));
					if (overlaps(built.unit[i], shifted)) return false;
				}
			}
		}
	}
	return true;
}

/** The maximal contiguous interval around `def` where `probe` holds, bisected to `tol`. */
function interval(
	def: number,
	lo: number,
	hi: number,
	step: number,
	tol: number,
	probe: (v: number) => boolean,
): [number, number] | null {
	if (!probe(def)) return null;

	const edge = (dir: 1 | -1): number => {
		let good = def;
		let bad = dir === 1 ? hi + step : lo - step;
		for (let v = def + dir * step; dir === 1 ? v <= hi : v >= lo; v += dir * step) {
			if (probe(v)) good = v;
			else {
				bad = v;
				break;
			}
		}
		// Nothing failed inside the nominal range: keep the nominal end.
		if (dir === 1 && good >= hi) return hi;
		if (dir === -1 && good <= lo) return lo;
		for (let k = 0; k < 40 && Math.abs(bad - good) > tol; k++) {
			const mid = (good + bad) / 2;
			if (probe(mid)) good = mid;
			else bad = mid;
		}
		return good;
	};

	return [edge(-1), edge(1)];
}

function main() {
	mkdirSync(dirname(LOG), { recursive: true });
	writeFileSync(LOG, "");
	log(`pentagon parameter ranges — measured, not derived`);
	log(`started ${new Date().toISOString()}`);
	log("");

	for (const t of PENTAGON_TYPES) {
		const d = defaultParams(t);
		if (t.angleParams.length + t.sideParams.length === 0) {
			log(`${t.label}: rigid, no sliders`);
			continue;
		}
		log(`${t.label} (${t.dof} DOF)`);

		t.angleParams.forEach((p, i) => {
			const probe = (v: number) =>
				works(t, d.angles.map((q, j) => (j === i ? v : q)), d.sides);
			const iv = interval(p.def, ANGLE_DOMAIN[0], ANGLE_DOMAIN[1], 0.25, 1e-5, probe);
			if (!iv) {
				log(`  ${p.key}: default ${p.def} does NOT work — check the type record`);
				return;
			}
			const [a, b] = iv;
			const lo = snapToStep(a, p.step, -1, probe);
			const hi = snapToStep(b, p.step, 1, probe);
			const moved = Math.abs(lo - p.min) > 1e-6 || Math.abs(hi - p.max) > 1e-6;
			log(
				`  ${p.key}: current [${p.min}, ${p.max}] -> limit [${a.toFixed(4)}, ${b.toFixed(4)}]` +
					` -> USE min: ${lo}, max: ${hi}${moved ? "   <-- CHANGE" : ""}`,
			);
		});

		t.sideParams.forEach((p, i) => {
			const probe = (v: number) =>
				works(t, d.angles, d.sides.map((q, j) => (j === i ? v : q)));
			const iv = interval(p.def, RATIO_DOMAIN[0], RATIO_DOMAIN[1], 0.01, 1e-6, probe);
			if (!iv) {
				log(`  ${p.key}: default ${p.def} does NOT work — check the type record`);
				return;
			}
			const [a, b] = iv;
			const lo = snapToStep(a, p.step, -1, probe);
			const hi = snapToStep(b, p.step, 1, probe);
			const moved = Math.abs(lo - p.min) > 1e-6 || Math.abs(hi - p.max) > 1e-6;
			log(
				`  ${p.key}: current [${p.min}, ${p.max}] -> limit [${a.toFixed(4)}, ${b.toFixed(4)}]` +
					` -> USE min: ${lo}, max: ${hi}${moved ? "   <-- CHANGE" : ""}`,
			);
		});
		log("");
	}
}

main();
