// Drop `renderCell` from records whose `exactSource` reproduces it, and only those.
//
//   pnpm tsx scripts/atlas-strip-rendercell.ts                    # dry run over the four ctrnact files
//   pnpm tsx scripts/atlas-strip-rendercell.ts --write
//   pnpm tsx scripts/atlas-strip-rendercell.ts --write public/reference-atlas-k9.json
//
// A one-shot migration for files that already shipped. New builds come out stripped because
// build-reference-atlas.ts calls the same stripDerivableRenderCells before writing.
//
// renderCell is a float projection of exactSource — 79% of reference-atlas-k9.json against 12 MB of
// the thing it is projected from. The browser rebuilds it through lib/services/renderCellDerive.ts,
// which hydrateRenderCells installs as a lazy accessor at load, so no consumer changes.
//
// The per-record gate (reproducesRenderCell) lives in renderCellDerive.ts next to the deriver, so the
// builder and this script cannot drift. Records that fail it keep their cell.

import fs from "node:fs";
import path from "node:path";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { stripDerivableRenderCells } from "@/lib/services/renderCellDerive";
import { stringifyAtlas } from "./atlas/encode.mjs";

const DEFAULT_TARGETS = [
	"public/reference-atlas.json",
	"public/reference-atlas-k8.json",
	"public/reference-atlas-k9.json",
	"public/reference-atlas-k10.json",
];

const args = process.argv.slice(2);
const write = args.includes("--write");
const targets = args.filter((a) => !a.startsWith("--"));
const files = (targets.length ? targets : DEFAULT_TARGETS).map((f) => path.resolve(f));

let totalBefore = 0;
let totalAfter = 0;

for (const file of files) {
	const name = path.basename(file);
	if (!fs.existsSync(file)) {
		console.log(`${name.padEnd(30)} SKIP  no such file`);
		continue;
	}

	const rawText = fs.readFileSync(file, "utf8");
	const records = decodeAtlas<Record<string, unknown>>(JSON.parse(rawText));
	const { stripped, kept } = stripDerivableRenderCells(records as never);
	const outText = stringifyAtlas(records) + "\n";

	totalBefore += rawText.length;
	totalAfter += outText.length;
	console.log(
		`${name.padEnd(30)} ${write ? "strip" : "would"} ${stripped}/${records.length} (kept ${kept})  ` +
			`${(rawText.length / 1e6).toFixed(1)} -> ${(outText.length / 1e6).toFixed(1)} MB`,
	);

	if (write) {
		// temp + rename, so an interrupt cannot truncate a shelf
		const tmp = `${file}.tmp-strip`;
		fs.writeFileSync(tmp, outText);
		fs.renameSync(tmp, file);
	}
}

console.log("---");
console.log(
	`${(totalBefore / 1e6).toFixed(1)} MB -> ${(totalAfter / 1e6).toFixed(1)} MB  ` +
		`(saved ${((totalBefore - totalAfter) / 1e6).toFixed(1)} MB)`,
);
if (!write) console.log("dry run — pass --write to apply");
