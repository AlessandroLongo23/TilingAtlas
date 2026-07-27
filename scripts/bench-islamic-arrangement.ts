// Microbenchmark for the Islamic arrangement chain — the cost behind a slider drag with Islamic on.
//
// buildMeshFromPatch (components/islamic-canvas.tsx) pools every patch tile's construction segments into
// ONE arrangement, then extracts and colours its faces. That chain is ~35ms on the worst parametric family
// at PATCH_MARGIN=3, which is why an α drag hitches there (see docs/DEVELOPMENT_NOTES.md §104c). Running it
// in node lets a change be measured in seconds instead of via a four-minute browser profile.
//
//   pnpm tsx scripts/bench-islamic-arrangement.ts [familyId ...]
import fs from "node:fs";
import path from "node:path";
import { Vector } from "@/classes/Vector";
import { buildTilingFromCell } from "@/lib/render/buildPatchTiling";
import { buildArrangement, extractFaces, colorFacesAbc, type Marker, type Segment } from "@/lib/utils/islamicArrangement";
import { evaluateParamCell, resolveAlphaDegsRaw, type ParametricCellData } from "@/lib/utils/paramCell";
import type { TranslationalCellData } from "@/classes/algorithm/types";

const PATCH_MARGIN = Number(process.env.MARGIN || 3);
const ANGLE = Number(process.env.ANGLE || 60) * (Math.PI / 180);
const OFFSET = Number(process.env.OFFSET || 0.2);
const COUNT = Number(process.env.COUNT || 2);
const REPS = Number(process.env.REPS || 12);

const shelf = JSON.parse(
	fs.readFileSync(path.join(process.cwd(), "public", "reference-atlas-mixed.json"), "utf8"),
) as { id: string; paramCell?: ParametricCellData }[];

const wanted = process.argv.slice(2);
const rows = shelf.filter((r) => r.paramCell && (wanted.length === 0 || wanted.includes(r.id)));
const picked = wanted.length ? rows : rows.slice(0, 6);

console.log(`margin=${PATCH_MARGIN} offset=${OFFSET} count=${COUNT} reps=${REPS}\n`);
console.log("family                                 tiles  segs  faces   patch   arrange+colour   total");

for (const row of picked) {
	const pc = row.paramCell!;
	const alphas = resolveAlphaDegsRaw(pc, null);
	const cell = evaluateParamCell(pc, alphas) as unknown as TranslationalCellData;

	let patchMs = 0;
	let chainMs = 0;
	let segs = 0;
	let faces = 0;
	let tiles = 0;
	let arrMs = 0;
	let traceMs = 0;
	let abcMs = 0;
	for (let r = 0; r < REPS; r++) {
		const t0 = performance.now();
		const patch = buildTilingFromCell(cell, PATCH_MARGIN, PATCH_MARGIN);
		const t1 = performance.now();
		const segments: Segment[] = [];
		const markers: Marker[] = [];
		for (const node of patch.nodes) {
			if (!node.vertices || !node.halfways) continue;
			for (const s of node.calculateIslamicSegments(ANGLE, OFFSET, COUNT, true)) segments.push(s);
			for (const m of node.islamicMarkers()) markers.push(m);
		}
		const split = OFFSET > 0 || COUNT > 1;
		const t1b = performance.now();
		buildArrangement(segments, split); // timed on its own; extractFaces repeats it internally
		const t1c = performance.now();
		const f = extractFaces(segments, split);
		const t1d = performance.now();
		const out = colorFacesAbc(f, markers);
		const t2 = performance.now();
		// discard the first two reps (JIT warm-up)
		if (r >= 2) {
			patchMs += t1 - t0;
			chainMs += (t1c - t1b) + (t2 - t1d) + (t1d - t1c);
			arrMs += t1c - t1b;
			traceMs += (t1d - t1c) - (t1c - t1b);
			abcMs += t2 - t1d;
		}
		tiles = patch.nodes.length;
		segs = segments.length;
		faces = out.faces.length;
	}
	const n = Math.max(1, REPS - 2);
	const p = patchMs / n;
	const c = chainMs / n;
	console.log(
		`${row.id.padEnd(38)}${String(tiles).padStart(5)}${String(segs).padStart(6)}${String(faces).padStart(7)}` +
		`${p.toFixed(1).padStart(8)}ms${c.toFixed(1).padStart(14)}ms${(p + c).toFixed(1).padStart(8)}ms` +
		`   [arrange ${(arrMs / n).toFixed(1)} · trace ${(traceMs / n).toFixed(1)} · abc ${(abcMs / n).toFixed(1)}]`,
	);
}
// Keep the import used even when a build strips the type-only ones.
void Vector;
