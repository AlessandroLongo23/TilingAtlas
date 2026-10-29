// k without the flat vertices (two corners: Pi Pi, or a corner filling a notch), old engine against new.
// Board 1 is the atlas's sides-1-2 scaled palette, {3,4,6,12} at sides 1 and 2, checked against the shipped
// shelf (tilings with a T-junction, which the shelf keeps). Board 2 is AL's, which adds the octagon.
// usage: pnpm tsx experiments/k-flat-vertices-2026-10-27/run.ts <old tilesearch> [kmax]
// Log: experiments/results/k-flat-vertices-2026-10-27.log, written as it goes.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyBoard, serialize, type Board } from "../../tools/searcher/app/src/board";
import { closingVertices, withFace } from "../../tools/searcher/app/src/corners";
import { certificatesIn, vertexWords } from "../../tools/searcher/app/src/develop";

const HERE = __dirname;
const NEW = join(HERE, "../../tools/searcher/tilesearch");
const OLD = process.argv[2];
const KMAX = Number(process.argv[3] ?? 4);
const LOG = join(HERE, "../results/k-flat-vertices-2026-10-27.log");
const t0 = Date.now();
const log = (s: string) => {
	const line = `${new Date().toTimeString().slice(0, 8)} ${s}`;
	console.log(line);
	appendFileSync(LOG, line + "\n");
};
// the shipped shelf's sides-1-2 tilings per k (reference-atlas-scaled*.json.gz, tilePeriods [1,2] and [2])
const ATLAS: Record<number, number> = { 1: 6, 2: 41, 3: 213, 4: 770, 5: 2792, 6: 9020, 7: 29500 };

function board(name: string, ns: number[]): Board {
	let b = emptyBoard();
	for (const seg of [1, 2]) for (const n of ns) b = withFace(b, { n, seg });
	const words = closingVertices(b, "plane", 0, 12).words;
	return { ...b, name, kmin: 1, kmax: KMAX, vertices: words.map((word) => ({ word })), permutations: true };
}

/** Per k: tilings, and those with a T-junction (a vertex of three or more corners, one of them Pi). */
function census(dir: string, b: Board) {
	const out = join(dir, `solver_${b.name}`);
	const all: Record<number, number> = {};
	const tee: Record<number, number> = {};
	let flatSeen = 0;
	for (const file of readdirSync(out).filter((f) => f.includes("solver_") && f.endsWith(".txt"))) {
		const k = Number(/solver_(\d+)_/.exec(file)![1]);
		for (const cert of certificatesIn(readFileSync(join(out, file), "utf8"))) {
			// each vertex unfolded: the certificate writes a figure once per turn of its site rotation
			const types = vertexWords(cert);
			all[k] = (all[k] ?? 0) + 1;
			if (types.some((f) => f.length >= 3 && f.includes("Pi"))) tee[k] = (tee[k] ?? 0) + 1;
			if (types.some((f) => f.length < 3)) flatSeen++;
		}
	}
	return { all, tee, flatSeen };
}

writeFileSync(LOG, `# k without flat vertices. Script: experiments/k-flat-vertices-2026-10-27/run.ts, k <= ${KMAX}\n`);
const cases = [board("scaled_3_4_6_12", [3, 4, 6, 12]), board("scaled_3_4_6_8_12", [3, 4, 6, 8, 12])];
cases.forEach((b, i) => {
	log(`== [${i + 1}/${cases.length}] ${b.name}: ${b.faces.length} faces, ${b.vertices.length} vertex lines`);
	for (const [tag, exe] of [
		["old", OLD],
		["new", NEW],
	] as const) {
		const dir = join(HERE, "work", `${b.name}-${tag}`);
		rmSync(dir, { recursive: true, force: true });
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "input.board"), serialize(b));
		const s = Date.now();
		execFileSync(exe, ["input.board", "--threads", "8"], { cwd: dir, stdio: "pipe", maxBuffer: 1 << 26 });
		const c = census(dir, b);
		log(`   ${tag} engine, ${((Date.now() - s) / 1000).toFixed(1)} s`);
		for (let k = 1; k <= KMAX; k++)
			log(
				`     k=${k}: ${String(c.all[k] ?? 0).padStart(7)} tilings, ${String(c.tee[k] ?? 0).padStart(6)} with a T-junction` +
					(i === 0 ? ` (atlas ${ATLAS[k]})` : ""),
			);
		log(`     ${c.flatSeen} tilings hold a flat vertex type; elapsed ${((Date.now() - t0) / 1000).toFixed(0)} s`);
	}
});
log("done");
