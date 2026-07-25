#!/usr/bin/env node
/*
 * stabilize-family-ids.mjs — splice a fresh family export onto the shipped one WITHOUT renumbering.
 *
 * Why this exists: export_combined_families.py numbers families k1-01, k1-02, … in catalogue order, so
 * adding one tile to the palette shifts every id after the first new family. Shipped ids are referenced by
 * permalinks, by the merge plan (experiments/results/mixed-merge-plan.json) and by the alias table, and
 * `defaultAlphaDeg` follows whichever discrete species seeded the family — so a naive re-export silently
 * renames entries AND moves the default slider position of tilings that were already published.
 *
 * This keeps every shipped record byte-identical and appends only the genuinely-new families, numbered from
 * the end. Matching is on `familySymbol`, the symbolic topology key (corners as linear forms in the free
 * parameter): two records with the same symbol are the same family regardless of which species seeded it.
 *
 * A shipped family absent from the new export is a REGRESSION, not a merge conflict — it is reported loudly
 * and kept, because losing a proven family to a palette change is a bug in the palette, not a result.
 *
 * Usage:
 *   node scripts/stabilize-family-ids.mjs --shipped experiments/results/ctrnact-mixed-families.cells.json \
 *       --export /tmp/fam-v8-rh.json --out experiments/results/ctrnact-mixed-families.cells.json \
 *       --provenance "isotox-v8-rh (maxValence=8 probe, +cx4-30.150)"
 */
import fs from "node:fs";

function arg(name, fallback = null) {
	const i = process.argv.indexOf(`--${name}`);
	if (i === -1) return fallback;
	return process.argv[i + 1];
}

const shippedPath = arg("shipped");
const exportPath = arg("export");
const outPath = arg("out");
const provenance = arg("provenance", "unlabelled export");
const dryRun = process.argv.includes("--dry-run");
if (!shippedPath || !exportPath || !outPath) {
	console.error("usage: --shipped <cells.json> --export <cells.json> --out <cells.json> [--provenance <s>] [--dry-run]");
	process.exit(2);
}

const shipped = JSON.parse(fs.readFileSync(shippedPath, "utf8"));
const fresh = JSON.parse(fs.readFileSync(exportPath, "utf8"));

/** `ctrnact-mixed-family-k1-07` → {stem: "ctrnact-mixed-family-k1", n: 7, width: 2} */
function parseId(id) {
	const m = /^(.*)-(\d+)$/.exec(id);
	if (!m) throw new Error(`unparseable family id: ${id}`);
	return { stem: m[1], n: parseInt(m[2], 10), width: m[2].length };
}

const shippedBySymbol = new Map(shipped.records.map((r) => [r.familySymbol, r]));
const freshBySymbol = new Map(fresh.records.map((r) => [r.familySymbol, r]));

const lost = shipped.records.filter((r) => !freshBySymbol.has(r.familySymbol));
const added = fresh.records.filter((r) => !shippedBySymbol.has(r.familySymbol));

// Per k, continue numbering from the highest shipped index so ids stay unique and monotone.
const nextIdx = new Map();
for (const r of shipped.records) {
	const { stem, n, width } = parseId(r.id);
	const cur = nextIdx.get(stem);
	if (!cur || n >= cur.n) nextIdx.set(stem, { n: n + 1, width });
}

const appended = added.map((r) => {
	const { stem } = parseId(r.id);
	const slot = nextIdx.get(stem) ?? { n: 1, width: 2 };
	const id = `${stem}-${String(slot.n).padStart(slot.width, "0")}`;
	nextIdx.set(stem, { n: slot.n + 1, width: slot.width });
	return { ...r, id, exportedId: r.id, provenance };
});

console.log(`=== stabilize-family-ids ===`);
console.log(`  shipped: ${shipped.records.length}   fresh export: ${fresh.records.length}`);
console.log(`  matched by familySymbol: ${shipped.records.length - lost.length}`);
console.log(`  NEW: ${appended.length}`);
for (const r of appended) {
	const p = r.params[0];
	console.log(`    ${r.id}  ← ${r.exportedId}  seed=${r.primarySpecies}  α∈(${p.alphaRangeDegOpen[0]}°,${p.alphaRangeDegOpen[1]}°) @${p.defaultAlphaDeg}°  ${r.areaChecks}`);
}
if (lost.length) {
	console.log(`  ⚑ REGRESSION — ${lost.length} shipped famil(y/ies) absent from the new export (kept anyway):`);
	for (const r of lost) console.log(`    ⚑ ${r.id}  ${r.familySymbol}`);
} else {
	console.log(`  no shipped family lost — the new export is a superset`);
}
const unverified = appended.filter((r) => !r.allChecksPass);
if (unverified.length) {
	console.log(`  ⚑ ${unverified.length} new record(s) fail their area certificate — build-mixed-atlas will skip them`);
}

const out = {
	_meta: {
		...shipped._meta,
		spliced: [...(shipped._meta?.spliced ?? []), { provenance, added: appended.length, ids: appended.map((r) => r.id) }],
	},
	records: [...shipped.records, ...appended],
};
if (dryRun) {
	console.log(`  --dry-run: not writing ${outPath}`);
} else {
	fs.writeFileSync(outPath, JSON.stringify(out, null, 1) + "\n");
	console.log(`  wrote ${out.records.length} records → ${outPath}`);
}
