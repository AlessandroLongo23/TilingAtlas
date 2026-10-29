// Drawn faces end to end: board from freeface.ts, vertices from Quick setup's rule, the real tilesearch
// engine, then every certificate developed in the plane as the app does it (develop.ts flatCell).
// usage: pnpm tsx experiments/drawn-faces-2026-10-27/run.ts
// Log: experiments/results/drawn-faces-2026-10-27.log (written as it goes). Cells for drawing: cells.json.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyBoard, serialize, type Board } from "../../tools/searcher/app/src/board";
import { closingVertices, withFace } from "../../tools/searcher/app/src/corners";
import { certificatesIn, decode, flatCell, geometry, vertexWords, withSymbols } from "../../tools/searcher/app/src/develop";
import { PRESETS, withDrawnFace, type Edge } from "../../tools/searcher/app/src/freeface";

const HERE = __dirname;
const ENGINE = join(HERE, "../../tools/searcher/tilesearch");
const LOG = join(HERE, "../results/drawn-faces-2026-10-27.log");
const WORK = join(HERE, "work");
const t0 = Date.now();
const log = (s: string) => {
	const line = `${new Date().toTimeString().slice(0, 8)} ${s}`;
	console.log(line);
	appendFileSync(LOG, line + "\n");
};

const P = (name: string) => PRESETS.find((p) => p.name === name)!.edges;
const E = (...pairs: [number, number][]): Edge[] => pairs.map(([dir, len]) => ({ dir, len }));

type Case = { name: string; k: [number, number]; build: () => Board; max?: number };
const CASES: Case[] = [
	{ name: "tromino", k: [1, 3], build: () => withDrawnFace(emptyBoard(), P("L tromino")) },
	{ name: "trapezoid", k: [1, 3], build: () => withDrawnFace(emptyBoard(), P("Trapezoid")) },
	{
		name: "rhombus30_square",
		k: [1, 2],
		build: () => withFace(withDrawnFace(emptyBoard(), P("Rhombus 30°")), { n: 4, seg: 1 }),
	},
	{
		name: "house_tri_square",
		k: [1, 2],
		build: () => withFace(withFace(withDrawnFace(emptyBoard(), P("House")), { n: 3, seg: 1 }), { n: 4, seg: 1 }),
	},
	{
		// a concave hexagon of unit edges, corners 60 150 90 150 60 210, and squares beside it
		name: "notched_hexagon",
		k: [1, 2],
		build: () =>
			withFace(withDrawnFace(emptyBoard(), E([0, 1], [2, 1], [8, 1], [10, 1], [18, 1], [16, 1])), { n: 4, seg: 1 }),
	},
];

/** The board as the app writes it after Quick setup: every closing vertex as a multiset. */
function finish(b: Board, name: string, k: [number, number], max = 8): Board {
	const words = closingVertices(b, "plane", 0, max).words;
	return { ...b, name, kmin: k[0], kmax: k[1], vertices: words.map((word) => ({ word })), permutations: true };
}

mkdirSync(WORK, { recursive: true });
writeFileSync(LOG, `# Drawn faces through tilesearch and develop. Script: experiments/drawn-faces-2026-10-27/run.ts\n`);
const cells: Record<string, unknown[]> = {};
CASES.forEach((c, ci) => {
	const b = finish(c.build(), `drawn_${c.name}`, c.k, c.max);
	const dir = join(WORK, c.name);
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "input.board"), serialize(b));
	log(`== [${ci + 1}/${CASES.length}] ${c.name}: ${b.faces.length} faces, ${b.vertices.length} vertex lines, k ${c.k.join("-")}`);
	for (const f of b.faces) log(`   face ${f.word.join(" ")}${f.repeat === 1 ? "" : ` x ${f.repeat}`}`);
	const s = Date.now();
	try {
		execFileSync(ENGINE, ["input.board", "--threads", "8"], { cwd: dir, timeout: 600_000, stdio: "pipe" });
	} catch (e) {
		log(`   engine failed: ${(e as Error).message.split("\n")[0]}`);
		return;
	}
	const out = join(dir, `solver_${b.name}`);
	const census = readFileSync(join(out, "census.txt"), "utf8").trim().split("\n").join(", ");
	log(`   engine ${((Date.now() - s) / 1000).toFixed(1)} s: ${census}`);
	const symbols: Record<string, string> = {};
	try {
		for (const l of readFileSync(join(out, "symbols.txt"), "utf8").split("\n")) {
			const [x, sym] = l.trim().split(/\s+/);
			if (x && sym) symbols[x] = sym;
		}
	} catch {}
	let [ok, bad] = [0, 0];
	const reasons = new Map<string, number>();
	cells[c.name] = [];
	for (const file of readdirSync(out).filter((f) => f.includes("solver_") && f.endsWith(".txt"))) {
		for (const raw of certificatesIn(readFileSync(join(out, file), "utf8"))) {
			const cert = withSymbols(raw, symbols);
			try {
				const g = geometry(b, vertexWords(cert));
				if (g.kind !== "plane") throw new Error(g.kind === "none" ? g.message : `not the plane: ${g.kind}`);
				const cell = flatCell(decode(cert, b), b, g.turn);
				ok++;
				if (cells[c.name].length < 12) cells[c.name].push({ file, cell });
			} catch (e) {
				bad++;
				const m = (e as Error).message;
				reasons.set(m, (reasons.get(m) ?? 0) + 1);
			}
		}
	}
	log(`   developed ${ok} of ${ok + bad}${bad ? "; failures:" : ""}`);
	for (const [m, n] of reasons) log(`     ${n} × ${m}`);
	log(`   elapsed ${((Date.now() - t0) / 1000).toFixed(0)} s, ${CASES.length - ci - 1} cases left`);
});
writeFileSync(join(HERE, "cells.json"), JSON.stringify(cells));
log("done");
