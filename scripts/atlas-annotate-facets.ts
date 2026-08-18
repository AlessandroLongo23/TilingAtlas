// Write `polygonSpecies` and `tilePeriods` onto shipped shelf files, so /library's facet memos stop
// walking geometry.
//
//   pnpm tsx scripts/atlas-annotate-facets.ts                    # dry run over the Euclidean tiling shelves
//   pnpm tsx scripts/atlas-annotate-facets.ts --write
//   pnpm tsx scripts/atlas-annotate-facets.ts --write public/reference-atlas-k9.json
//
// A one-shot migration for files that already shipped. New builds come out annotated because
// build-reference-atlas.ts calls the same annotatePolygonFacets before writing.
//
// Both facets are pure functions of renderCell and the walk lives in lib/services/polygonSpecies.ts;
// this calls it rather than reimplementing, so the shipped field and the runtime fallback cannot
// disagree. See lib/services/polygonFacets.ts for why the answer has to move to build time at all.
//
// NOTE ON COST. Reading renderCell on a stripped record fires the ℤ[ζ₂₄] derive accessor, ~1.7 ms
// median. That is the point — 24.7 s paid once here instead of on every page load — but it means
// this script is slow and memory-hungry on the ctrnact files. Run it with a raised heap:
//   NODE_OPTIONS=--max-old-space-size=12288 pnpm tsx scripts/atlas-annotate-facets.ts --write

import fs from "node:fs";
import path from "node:path";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { hydrateRenderCells, stripDerivableRenderCells } from "@/lib/services/renderCellDerive";
import { annotatePolygonFacets } from "@/lib/services/polygonFacets";
import { stringifyAtlas } from "./atlas/encode.mjs";

// The shelves whose rows reach /library's polygon facets: Euclidean, decoration "tilings". The
// decoration shelves are deliberately absent — their rows share one empty cell, so there is nothing
// to annotate and the reader answers them from a shared constant.
const DEFAULT_TARGETS = [
	"public/reference-atlas.json",
	"public/reference-atlas-k8.json",
	"public/reference-atlas-k9.json",
	"public/reference-atlas-k10.json",
	"public/reference-atlas-composable.json",
	"public/reference-atlas-composable-k3.json",
	"public/reference-atlas-isotoxal.json",
	"public/reference-atlas-isotoxal-k3.json",
	"public/reference-atlas-isotoxal-k4.json",
	"public/reference-atlas-mixed.json",
	"public/reference-atlas-mixed-k3.json",
	"public/reference-atlas-mixed-k4.json",
	"public/reference-atlas-period.json",
	"public/reference-atlas-period-k3.json",
	"public/reference-atlas-period-k4.json",
	"public/reference-atlas-scaled.json",
	"public/reference-atlas-scaled-k3.json",
	"public/reference-atlas-scaled-k4.json",
	"public/reference-atlas-scaled-k5.json",
	"public/reference-atlas-scaled-k6.json",
	"public/reference-atlas-scaled-k7.json",
	"public/reference-atlas-islamic.json",
	"public/reference-atlas-planigon.json",
	"public/reference-atlas-polyomino.json",
	"public/reference-atlas-penrose.json",
	"public/reference-atlas-tri45.json",
	"public/reference-atlas-euhalf.json",
];

const args = process.argv.slice(2);
const write = args.includes("--write");
const targets = args.filter((a) => !a.startsWith("--"));
const files = (targets.length ? targets : DEFAULT_TARGETS).map((f) => path.resolve(f));

let totalBefore = 0;
let totalAfter = 0;
let totalAnnotated = 0;

for (const file of files) {
	const name = path.basename(file);
	if (!fs.existsSync(file)) {
		console.log(`${name.padEnd(38)} SKIP  no such file`);
		continue;
	}

	const rawText = fs.readFileSync(file, "utf8");
	const records = hydrateRenderCells(decodeAtlas<Record<string, unknown>>(JSON.parse(rawText)) as never);
	const { annotated, empty } = annotatePolygonFacets(records as never);
	// RE-STRIP before writing. Annotating reads renderCell, which collapses the derive accessor into
	// a plain property — so serialising now would write back the 200 MB of geometry the strip removed.
	// Caught by the dry run: reference-atlas-k10.json went 4.3 -> 8.8 MB before this line existed.
	// Same annotate-then-strip order the builder uses, for the same reason.
	stripDerivableRenderCells(records as never);
	const outText = stringifyAtlas(records) + "\n";

	totalBefore += rawText.length;
	totalAfter += outText.length;
	totalAnnotated += annotated;
	console.log(
		`${name.padEnd(38)} ${write ? "write" : "would"} ${annotated}/${records.length} (empty ${empty})  ` +
			`${(rawText.length / 1e6).toFixed(1)} -> ${(outText.length / 1e6).toFixed(1)} MB`,
	);

	if (write) {
		// temp + rename, so an interrupt cannot truncate a shelf
		const tmp = `${file}.tmp-facets`;
		fs.writeFileSync(tmp, outText);
		fs.renameSync(tmp, file);
	}
}

console.log("---");
console.log(
	`${totalAnnotated} records annotated  ` +
		`${(totalBefore / 1e6).toFixed(1)} MB -> ${(totalAfter / 1e6).toFixed(1)} MB  ` +
		`(${totalAfter >= totalBefore ? "+" : ""}${((totalAfter - totalBefore) / 1e6).toFixed(1)} MB)`,
);
if (!write) console.log("dry run — pass --write to apply");
