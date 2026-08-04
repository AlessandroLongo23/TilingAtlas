/**
 * Propose the `IH_EDGE_BOARDS` row for one of Marek Čtrnáct's `edges_isohedral_IH<nn>` corpora.
 *
 * WHY THIS EXISTS. On IH01 the corpus states its own boundary: one aspect, so every tile is met the
 * same way round a vertex, and `corner -> class leaving it` is a function you can just read off. From
 * IH02 on there are two aspects, a tile is met either way about, and the corner letters stop being
 * determined by the corpus alone — IH02 left eight candidates, and picking one by hand took an hour.
 * This does that derivation in a second, and says how much of it is forced and how much is a tie-break.
 *
 * The method, in order of how much each step is worth trusting:
 *
 *   1. FORCED, from the corpus. Which classes follow each corner around a vertex, and which corners
 *      share a vertex. A corner's declared sides must contain everything the corpus ever saw there.
 *   2. FORCED, from geometry. Every corner set the corpus puts at a vertex must close to 360°, checked
 *      at a parameter point where all six angles DIFFER — at the default parameters several types are
 *      the regular hexagon, where every wrong labelling closes too and the check is worthless.
 *   3. A TIE-BREAK, and flagged as one. What survives 1 and 2 is generally a mirror pair, because the
 *      corpus cannot see handedness. Marek labels corners in boundary order, so the candidate whose
 *      letters read A, B, C, … cyclically around the tile is the one taken. Both IH01 and IH02 agree
 *      with that rule; a board that does not will print as unresolved rather than guess.
 *
 * Usage:  pnpm tsx scripts/solve-ih-board.ts <ih> <corpus-dir> [decoded-shard-dir]
 *
 * Pass the shard directory (e.g. public/isohedral-edges) to enable step 3. The decoded record does not
 * depend on the corner ORDER, only on the letters, so decode the corpus once with any consistent row
 * and then let this pick the row that develops.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { makeTiling, prototileEdges, straightCurves } from "@/lib/isohedral/build";
import { ISOHEDRAL_TYPES } from "@/lib/isohedral/catalogue";
import {
	IH_EDGE_BOARDS,
	IH_EDGE_BOARD_BY_IH,
	solveIhBoard,
	type IhEdgeBoardSpec,
} from "@/lib/isohedral/edge-board";
import type { IhEdgeRecord } from "@/lib/isohedral/edgeDevelop";
import { buildIhEdgePatch } from "@/lib/isohedral/edgePatch";

const CORNER = /^([A-Z])6$/;
const DIGON = /^([A-Z])1[0-3]$/;

/** What the corpus says, with no geometry involved: classes seen after each corner, and vertex sets. */
function readCorpus(dir: string) {
	const follows = new Map<string, Set<string>>();
	const vertexSets = new Set<string>();
	for (const name of readdirSync(dir)) {
		if (!name.endsWith(".txt")) continue;
		for (const line of readFileSync(join(dir, name), "utf8").split("\n")) {
			if (!line.startsWith("(")) continue;
			for (const [, body] of line.matchAll(/\(([^)]*)\)/g)) {
				const fig = body.split(",").map((s) => s.trim());
				const corners: string[] = [];
				for (let i = 0; i < fig.length; i++) {
					const m = CORNER.exec(fig[i]);
					if (!m) continue;
					corners.push(m[1]);
					const d = DIGON.exec(fig[(i + 1) % fig.length]);
					if (!d) throw new Error(`corner ${fig[i]} not followed by a digon in ${name}`);
					const set = follows.get(m[1]) ?? new Set<string>();
					set.add(d[1].toLowerCase());
					follows.set(m[1], set);
				}
				vertexSets.add([...corners].sort().join(""));
			}
			break; // the first figure line lists every vertex type of the certificate
		}
	}
	return { follows, vertexSets: [...vertexSets].map((s) => s.split("")) };
}

/**
 * A parameter point AWAY from the type's defaults, chosen for as many distinct corner angles as it can
 * get. Several types are the regular hexagon at their defaults, where every wrong labelling develops
 * perfectly and no test below can fail. Six distinct angles is not always reachable — IH01 pairs its
 * opposite sides by translation, so its opposite angles are equal at every parameter point — so this
 * maximises rather than demands, and reports what it managed.
 */
function genericPoint(ih: number, numParams: number) {
	const tries = [
		[0.18, 0.42, 0.28, 0.16, 0.31, 0.24],
		[0.22, 0.37, 0.19, 0.44, 0.26, 0.33],
		[0.15, 0.55, 0.35, 0.25, 0.45, 0.2],
	];
	let best: { params: number[]; ang: number[]; distinct: number } | null = null;
	for (const t of tries) {
		const params = t.slice(0, numParams);
		let pe;
		try {
			pe = prototileEdges(makeTiling(ih, params), straightCurves([]));
		} catch {
			continue;
		}
		const V = pe.map((e) => e.from);
		const ang = V.map((p, i) => {
			const a = V[(i + V.length - 1) % V.length];
			const b = V[(i + 1) % V.length];
			const ux = a.x - p.x, uy = a.y - p.y, vx = b.x - p.x, vy = b.y - p.y;
			let t2 = Math.atan2(-(ux * vy - uy * vx), ux * vx + uy * vy);
			if (t2 <= 0) t2 += 2 * Math.PI;
			return (t2 * 180) / Math.PI;
		});
		const distinct = new Set(ang.map((a) => a.toFixed(4))).size;
		if (!best || distinct > best.distinct) best = { params, ang, distinct };
		if (distinct === ang.length) break;
	}
	return best;
}

const ih = Number(process.argv[2]);
const dir = process.argv[3];
const shardDir = process.argv[4];
if (!ih || !dir) {
	console.error("usage: pnpm tsx scripts/solve-ih-board.ts <ih> <corpus-dir> [decoded-shard-dir]");
	process.exit(2);
}
const info = ISOHEDRAL_TYPES.find((t) => t.ih === ih);
if (!info?.available) throw new Error(`IH${ih} is not an available Tactile type`);

const { follows, vertexSets } = readCorpus(dir);
const letters = [...follows.keys()].sort();
const generic = genericPoint(ih, info.numParams);
if (!generic) throw new Error("no usable parameter point found");

const pe = prototileEdges(makeTiling(ih, generic.params), straightCurves(info.edgeShapes));
const cls = pe.map((e) => String.fromCharCode(97 + e.id)); // Tactile edge id -> a, b, c…
const n = cls.length;
/** The two classes meeting at Tactile corner i: the side leaving it and the side entering it. */
const sig = (i: number) => new Set([cls[i], cls[(i - 1 + n) % n]]);

console.log(`IH${String(ih).padStart(2, "0")}  edgeWord ${info.edgeWord}  aspects ${info.numAspects}`);
console.log(`  corpus corners      : ${letters.join("")}`);
console.log(`  corpus follows      : ${letters.map((L) => `${L}->{${[...follows.get(L)!].sort()}}`).join(" ")}`);
console.log(`  corpus vertex sets  : ${vertexSets.map((s) => s.join("")).join("  ")}`);
console.log(`  tactile side classes: ${cls.join("")}`);
console.log(`  generic angles      : ${generic.ang.map((a) => a.toFixed(2)).join(" ")} (${generic.distinct} distinct)`);

if (letters.length !== n) throw new Error(`corpus has ${letters.length} corners, Tactile has ${n}`);

// Every bijection letter -> Tactile index that the corpus and the angles both allow.
const survivors: string[][] = [];
const perm: number[] = [];
const used = new Array(n).fill(false);
(function place(k: number) {
	if (k === letters.length) {
		const corners: string[] = new Array(n);
		letters.forEach((L, i) => (corners[perm[i]] = L));
		// Every vertex set the corpus reports must be a full turn.
		for (const set of vertexSets) {
			const total = set.reduce((s, L) => s + generic.ang[corners.indexOf(L)], 0);
			if (Math.abs(total - 360) > 1e-6) return;
		}
		survivors.push(corners);
		return;
	}
	for (let i = 0; i < n; i++) {
		if (used[i]) continue;
		const allowed = sig(i);
		let ok = true;
		for (const c of follows.get(letters[k])!) if (!allowed.has(c)) { ok = false; break; }
		if (!ok) continue;
		used[i] = true;
		perm[k] = i;
		place(k + 1);
		used[i] = false;
	}
})(0);

console.log(`\n  ${survivors.length} labelling(s) survive the corpus and the 360° test`);

/**
 * The decisive filter, when decoded records are available: does the tiling actually DEVELOP?
 *
 * A wrong labelling puts the wrong angle at a corner, so the walk cannot close and the patch builder
 * says so. This is what the 360° test cannot do on its own — that only fixes which corner SET sits at
 * which vertex, never the order within a set, which is exactly where IH02's eight candidates lived.
 *
 * A decoded record does not depend on the corner ORDER, only on the letters, so a corpus can be decoded
 * once with any consistent row and every candidate re-tested against those same records.
 */
let live = survivors;
if (shardDir) {
	const recs: IhEdgeRecord[] = [];
	for (const k of [4, 6]) {
		try {
			const f = join(shardDir, `ie${String(ih).padStart(2, "0")}-k${k}.json`);
			recs.push(...(JSON.parse(readFileSync(f, "utf8")) as IhEdgeRecord[]).slice(0, 6));
		} catch {
			/* that slice is not decoded yet */
		}
	}
	if (!recs.length) {
		console.log("  (no decoded shards found — skipping the develop test, the decisive one)");
	} else {
		const kept: string[][] = [];
		for (const corners of survivors) {
			const spec: IhEdgeBoardSpec = {
				ih,
				label: info.label,
				corners,
				classes: [...new Set(cls)].sort(),
				sides: corners.map((c, i) => [c, cls[i]] as [string, string]),
			};
			const at = IH_EDGE_BOARDS.findIndex((b) => b.ih === ih);
			if (at >= 0) IH_EDGE_BOARDS[at] = spec;
			else IH_EDGE_BOARDS.push(spec);
			IH_EDGE_BOARD_BY_IH.set(ih, spec);
			const solved = solveIhBoard(ih, generic.params);
			// One attempt on a small develop. A correct labelling closes almost immediately; a wrong one
			// never closes at any radius, so letting the builder grow and retry only makes it slow to say no.
			const ok =
				solved.ok &&
				recs.every((r) => buildIhEdgePatch(r, solved.board, { attempts: 1, budget: 6000 }).ok);
			console.log(`     ${corners.join("")}  develops: ${ok ? "yes" : "no"}`);
			if (ok) kept.push(corners);
		}
		live = kept;
		console.log(`  ${live.length} of ${survivors.length} develop away from the defaults`);
	}
}

/** Marek numbers corners around the boundary, so the letters should read A, B, C… cyclically. What
 *  survives the develop test is generally a MIRROR PAIR, since no corpus can see handedness. */
const inBoundaryOrder = (c: string[]) =>
	c.some((_, r) => c.every((_, i) => c[(r + i) % n] === letters[i]));
const preferred = live.filter(inBoundaryOrder);
for (const c of live) console.log(`     ${c.join("")}${inBoundaryOrder(c) ? "   <- boundary order" : ""}`);

if (preferred.length === 0) {
	console.log(`\n  UNRESOLVED: none of the ${live.length} that develop read in boundary order.`);
	console.log("  Marek's letters are not in boundary order on this board. Decide by hand.");
	process.exit(1);
}
// More than one is not a failure: they differ by a symmetry the board actually has (IH01's boundary
// word repeats with period 3, so calling its first corner A or D is the same board relabelled). Any is
// correct, so take the lexicographically smallest and say the choice was free.
const corners = preferred.map((c) => c.join("")).sort()[0].split("");
if (preferred.length > 1)
	console.log(
		`\n  ${preferred.length} read in boundary order and differ only by a symmetry of the board` +
			` — taking ${corners.join("")}, which is a free choice, not a derivation.`,
	);
console.log(`\n  ---- paste into IH_EDGE_BOARDS (lib/isohedral/edge-board.ts) ----`);
console.log(`	{
		ih: ${ih},
		label: "${info.label}",
		corners: [${corners.map((c) => `"${c}"`).join(", ")}],
		classes: [${[...new Set(cls)].sort().map((c) => `"${c}"`).join(", ")}],
		sides: [
${corners.map((c, i) => `			["${c}", "${cls[i]}"],`).join("\n")}
		],
	},`);
console.log(`\n  ---- and into BOARDS (tools/ctrnact-oracle/develop_ih_edges.py) ----`);
console.log(`    "${info.label}": {
        "ih": ${ih},
        "label": "${info.label}",
        "corners": [${corners.map((c) => `"${c}"`).join(", ")}],
        "classes": [${[...new Set(cls)].sort().map((c) => `"${c}"`).join(", ")}],
        "sides": [${corners.map((c, i) => `("${c}", "${cls[i]}")`).join(", ")}],
        "tactile": {"numVertices": ${info.numVertices}, "numEdgeShapes": ${info.numEdgeShapes}, "edgeWord": "${info.edgeWord}"},
        "vertex_corners": ${vertexSets[0].length},
        "aspects": ${info.numAspects},
        "solver": "pt_edges_isohedral_${info.label}.exe",
    },`);
