/**
 * A shelf file as plain JSON for the Python checks (tools/ctrnact-oracle/check_rigid_shelf.py):
 * [{ id, k, board, renderCell }] with the render cells hydrated.
 *   pnpm tsx scripts/atlas/shelf-json.ts <shelf.json.br> <out.json>
 */
import fs from "node:fs";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { hydrateRenderCells } from "@/lib/services/renderCellDerive";
import { readDataJson } from "./io.mjs";

const [file, out] = process.argv.slice(2);
const recs = hydrateRenderCells(decodeAtlas(readDataJson(file)) as never[]) as {
	id: string;
	k: number;
	polyformOrder?: string;
	renderCell: unknown;
}[];
fs.writeFileSync(
	out,
	JSON.stringify(recs.map((r) => ({ id: r.id, k: r.k, board: r.polyformOrder ?? "", renderCell: r.renderCell }))),
);
console.log(`${recs.length} records → ${out}`);
