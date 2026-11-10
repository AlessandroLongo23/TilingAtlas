/**
 * A Tiling Searcher run's tilings as developed float cells: [{ id, k, board, renderCell }], the form
 * tools/ctrnact-oracle/check_rigid_shelf.py reads (scripts/atlas/shelf-json.ts writes it from a shelf).
 * For boards off the 15-degree grid, where scripts/tilesearch-polyform-cells.ts's exact walk does not apply.
 *
 *   pnpm tsx scripts/tilesearch-float-cells.ts <run folder> <out.json> [id prefix]
 *
 * <run folder> holds input.board and solver_<name>/. k is the engine's (the file's), ids are
 * <prefix><solver file>#<index>, and `types` is each vertex orbit's whole corner cycle.
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "@/tools/searcher/app/src/board";
import { certificatesIn, decode, flatCell, geometry, vertexWords } from "@/tools/searcher/app/src/develop";

const [runDir, out, prefix = ""] = process.argv.slice(2);
const board = parse(fs.readFileSync(path.join(runDir, "input.board"), "utf8")).board;
const solver = path.join(runDir, "solver_" + board.name);
const tilings: unknown[] = [];
for (const f of fs
	.readdirSync(solver)
	.filter((f) => /solver_\d+_.*\.txt$/.test(f))
	.sort())
	certificatesIn(fs.readFileSync(path.join(solver, f), "utf8")).forEach((cert, index) => {
		const g = geometry(board, vertexWords(cert));
		if (g.kind !== "plane") throw new Error(`${f}#${index}: not a plane tiling`);
		const c = flatCell(decode(cert, board), board, g.turn);
		const cellPolygons = (c.p ?? []).map((p) => ({ n: (p.v as number[][]).length, vertices: p.v }));
		tilings.push({
			id: `${prefix}${f.replace(/\.txt$/, "")}#${index}`,
			k: Number(/solver_(\d+)_/.exec(f)![1]),
			board: "",
			types: vertexWords(cert),
			renderCell: { cellPolygons, basis: c.b },
		});
	});
fs.writeFileSync(out, JSON.stringify(tilings));
console.log(`${tilings.length} tilings → ${out}`);
