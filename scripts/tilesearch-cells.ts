// The TypeScript half of scripts/tilesearch-import.py: a Tiling Searcher run folder, and the atlas tilings it
// could duplicate, as plain render cells. Nothing here decides identity; tiling_key.py does, on both sides.
//
// It reuses what draws these tilings already: the app's decoder and developer (tools/searcher/app/src)
// for the run, and the site's renderCellFromExactSource for atlas records that ship only an exact cell.
//
//   pnpm tsx scripts/tilesearch-cells.ts <run folder> <out.json.gz>
//
// Output: { run: {...what the run claims and what the board is complete for}, tilings: [...], atlas: [...] }.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { hydrateRenderCells } from "@/lib/services/renderCellDerive";
import { faceSize, parse, type Board } from "@/tools/searcher/app/src/board";
import { closingVertices } from "@/tools/searcher/app/src/corners";
import {
	certificatesIn,
	decode,
	flatCell,
	geometry,
	isColoring,
	vertexWords,
	withSymbols,
} from "@/tools/searcher/app/src/develop";

const ROOT = path.resolve(__dirname, "..");

/** The shelves that hold rigid or flexible tilings of the plane by polygons, main file plus k shards. */
const FLAT_SHELVES = [
	"reference-atlas",
	"reference-atlas-composable",
	"reference-atlas-isotoxal",
	"reference-atlas-mixed",
	"reference-atlas-scaled",
	"reference-atlas-period",
	"reference-atlas-tri45",
	"reference-atlas-planigon",
	"reference-atlas-penrose",
	"reference-atlas-euhalf",
	"reference-atlas-polyomino",
	"reference-atlas-islamic",
	"reference-atlas-hollow",
];

const read = (f: string) => {
	try {
		return fs.readFileSync(f, "utf8");
	} catch {
		return "";
	}
};

const multiset = (w: string[]) => [...w].sort().join(" ");

/**
 * Is this run a complete search of every tiling by the board's faces, or of something narrower? The
 * reasons say what narrows it; an empty list means the class is "tilings by these faces".
 */
function narrowing(b: Board): string[] {
	const why: string[] = [];
	if (!b.permutations) why.push("permutations are off: only the listed corner orders are searched");
	if (b.initial.length) why.push(`initial vertices ${b.initial.join(", ")}: only tilings containing them`);
	if (isColoring(b)) why.push("a colouring board (two faces of one shape)");
	if (b.faces.some((f) => faceSize(f) === 2)) why.push("an edge-marking board (digons)");
	const { words, skipped } = closingVertices(b, "plane", 1, 24);
	for (const s of skipped) why.push(`corner ${s.sym}: ${s.why}`);
	const listed = new Set(b.vertices.map((v) => multiset(v.word)));
	const missing = words.filter((w) => !listed.has(multiset(w)));
	if (missing.length) why.push(`${missing.length} closing vertices are not listed, e.g. ${missing[0].join(" ")}`);
	return why;
}

type Cell = { cellPolygons: { n: number; star?: boolean; vertices: number[][] }[]; basis: number[][] };
const kinds = (c: Cell) => c.cellPolygons.map((p) => `${p.n}${p.star ? "*" : ""}`);

/** A tile's shape: its corner angles in cyclic order, straight points dropped, the least rotation or reflection. */
function shape(vs: number[][]): string {
	const m = vs.length;
	const area = vs.reduce((t, [x, y], i) => t + x * vs[(i + 1) % m][1] - vs[(i + 1) % m][0] * y, 0);
	const angles = vs
		.map((p, i) => {
			const [a, b] = [vs[(i + m - 1) % m], vs[(i + 1) % m]];
			const t = Math.atan2(...cross(a, p, b)) * (180 / Math.PI);
			return Math.round(((area > 0 ? t : -t) + 360) % 360);
		})
		.filter((a) => a !== 180);
	const rots = (w: number[]) => w.map((_, i) => [...w.slice(i), ...w.slice(0, i)].join(","));
	return [...rots(angles), ...rots([...angles].reverse())].sort()[0];
}
/** [sin, cos] of the turn from p→a to p→b, scaled alike: atan2 of them is the interior angle at p. */
const cross = (a: number[], p: number[], b: number[]): [number, number] => {
	const [ux, uy, vx, vy] = [b[0] - p[0], b[1] - p[1], a[0] - p[0], a[1] - p[1]];
	return [ux * vy - uy * vx, ux * vx + uy * vy];
};

function main() {
	const [dir, out] = process.argv.slice(2);
	if (!dir || !out) throw new Error("usage: tilesearch-cells.ts <run folder> <out.json.gz>");
	const text = read(path.join(dir, "input.board"));
	if (!text) throw new Error(`${dir} has no input.board`);
	const board = parse(text).board;
	const solver = path.join(dir, "solver_" + board.name);
	let opts: { k?: [number, number] } = {};
	try {
		opts = JSON.parse(read(path.join(dir, "run.json")) || "{}");
	} catch {}
	const kRange = opts.k ?? [board.kmin, board.kmax];
	const census = read(path.join(solver, "census.txt"));
	let sessions: unknown[] = [];
	try {
		sessions = JSON.parse(read(path.join(dir, "sessions.json")) || "[]");
	} catch {}
	const symbols = Object.fromEntries(
		read(path.join(solver, "symbols.txt"))
			.split("\n")
			.map((l) => l.trim().split(/\s+/))
			.filter((p) => p.length === 2),
	);

	const t0 = Date.now();
	const tilings: { id: string; k: number; file: string; index: number; renderCell?: Cell; error?: string }[] = [];
	const files = fs.existsSync(solver) ? fs.readdirSync(solver).filter((n) => /solver_\d+_.*_\d+\.txt$/.test(n)) : [];
	for (const name of files.sort()) {
		const k = Number(/solver_(\d+)_/.exec(name)![1]);
		certificatesIn(read(path.join(solver, name))).forEach((raw, index) => {
			const cert = withSymbols(raw, symbols);
			const id = `${name.replace(/\.txt$/, "")}#${index}`;
			try {
				const g = geometry(board, vertexWords(cert));
				if (g.kind !== "plane") throw new Error(g.kind === "none" ? g.message : "not a tiling of the plane");
				const c = flatCell(decode(cert, board), board, g.turn);
				const renderCell: Cell = {
					// flatCell always fills n and v; the shared cell type leaves them optional for other producers
					cellPolygons: (c.p ?? []).map((p) => ({
						n: p.n!,
						...(p.star ? { star: true } : {}),
						vertices: p.v as number[][],
					})),
					basis: c.b as number[][],
				};
				tilings.push({ id, k, file: name, index, renderCell });
			} catch (e) {
				tilings.push({ id, k, file: name, index, error: (e as Error).message });
			}
		});
	}

	console.error(`developed ${tilings.length} certificates in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
	// The atlas side: every flat record whose tile kinds all occur in the run. A tiling can only equal one
	// whose tiles it shares, so this filter loses nothing and keeps tiling_key's work small.
	const runKinds = new Set(tilings.flatMap((t) => (t.renderCell ? kinds(t.renderCell) : [])));
	const runShapes = new Set(tilings.flatMap((t) => t.renderCell?.cellPolygons.map((p) => shape(p.vertices)) ?? []));
	const atlas: Record<string, unknown>[] = [];
	let scanned = 0;
	for (const shelf of FLAT_SHELVES) {
		const pub = path.join(ROOT, "public");
		const shards = fs
			.readdirSync(pub)
			.filter((n) => n === `${shelf}.json.gz` || new RegExp(`^${shelf}-k\\d+\\.json\\.gz$`).test(n));
		for (const f of shards) {
			const records = hydrateRenderCells(
				decodeAtlas<Record<string, unknown> & { id: string; exactSource?: never }>(
					JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(pub, f))).toString("utf8")),
				),
			);
			for (const r of records) {
				scanned++;
				// polygonSpecies names the tiles without deriving the cell: "6", or "3*15" for a star of 3 points
				const species = r.polygonSpecies as string[] | undefined;
				if (species && !species.every((s) => runKinds.has(s.replace(/\*.*/, "*")))) continue;
				const cell = r.renderCell as Cell | undefined;
				if (!cell?.cellPolygons?.length) continue;
				if (!kinds(cell).every((x) => runKinds.has(x))) continue;
				// a rigid tiling must use the run's exact shapes; a family's shapes move, so it stays in
				if (!r.paramCell && !cell.cellPolygons.every((p) => runShapes.has(shape(p.vertices)))) continue;
				atlas.push({
					id: r.id,
					shelf: f,
					source: r.source,
					k: r.k,
					renderCell: cell,
					...(r.paramCell ? { paramCell: r.paramCell } : {}),
					...(r.alphaRange ? { alphaRange: r.alphaRange } : {}),
				});
			}
		}
	}

	const result = {
		run: {
			folder: path.basename(dir),
			board: text,
			name: board.name,
			k: kRange,
			finished: census.endsWith("MAX\n"),
			census: Object.fromEntries([...census.matchAll(/k=(\d+) -- (\d+)/g)].map((m) => [m[1], Number(m[2])])),
			narrowing: narrowing(board),
			sessions,
			kinds: [...runKinds].sort(),
		},
		tilings,
		atlas,
		atlasScanned: scanned,
	};
	fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(result)));
	const failed = tilings.filter((t) => t.error).length;
	console.log(
		`${tilings.length} certificates (${failed} not developed), ${atlas.length} atlas candidates of ${scanned} scanned → ${out}`,
	);
}

main();
