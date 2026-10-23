/**
 * Print the HYP_TILING_BOARDS table for lib/tilings/hyp-tilings.ts, DERIVED from the shipped shelf.
 *
 * The base hyperbolic tilings shelf is one flat list of 28,453 records — every k-uniform tiling by
 * regular polygons the Čtrnáct engine found in H², k = 1 and 2. It arrived with no sub-axis at all, so
 * /play rendered it as two rows ("k = 1  12168", "k = 2  16285") and /library offered no board chips.
 * This emitter builds the axis it needed: one board per (VALENCE, ALPHABET) pair that actually occurs.
 *
 * Both keys come off the vertex configuration and nothing else — valence is the largest number of tiles
 * meeting at a vertex (the max over the k orbits), the alphabet is the set of polygon sizes used. They
 * are computed here and again at runtime by `hypTilingSub`; `lib/tilings/hyp-tilings.test.ts` asserts
 * the two agree on every shipped record, which is the only thing keeping a generated table honest.
 *
 * Usage:  pnpm tsx scripts/emit-hyp-tiling-boards.mjs [> rows.txt]   (tsx: the facets come from the TS module)
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeAtlas } from "./atlas/encode.mjs";
// Dynamic: tsx compiles the TS module as CJS, which a static named import cannot link against.
const { hypTileId, hypTileKey, hypTilingFacets: facets } = await import("../lib/tilings/hyp-tilings.ts");
import { readDataJson } from "./atlas/io.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = decodeAtlas(readDataJson(join(ROOT, "public", "reference-atlas-hyperbolic.json")));
const records = Array.isArray(src) ? src : src.records;

const boards = new Map();
let skipped = 0;
for (const r of records) {
	const f = facets(r.family);
	if (!f) {
		skipped++;
		continue;
	}
	const id = `v${f.valence}-${f.alphabet.map(hypTileId).join("-")}`;
	if (!boards.has(id)) boards.set(id, { ...f, counts: {}, configs: new Set() });
	const b = boards.get(id);
	b.counts[r.k] = (b.counts[r.k] ?? 0) + 1;
	b.configs.add(r.family);
}

// Valence-major, then alphabet ascending as a tuple — so every {3, …} board sits together and the
// list reads the way the tree renders it.
const rows = [...boards.entries()].sort(([, a], [, b]) => {
	if (a.valence !== b.valence) return a.valence - b.valence;
	for (let i = 0; i < Math.max(a.alphabet.length, b.alphabet.length); i++) {
		const d =
			(a.alphabet[i] === undefined ? 0 : hypTileKey(a.alphabet[i])) -
			(b.alphabet[i] === undefined ? 0 : hypTileKey(b.alphabet[i]));
		if (d) return d;
	}
	return 0;
});

console.log("// ---- HYP_TILING_BOARDS (lib/tilings/hyp-tilings.ts) — node scripts/emit-hyp-tiling-boards.mjs");
for (const [id, b] of rows) {
	const counts = Object.keys(b.counts)
		.map(Number)
		.sort((x, y) => x - y)
		.map((k) => `${k}: ${b.counts[k]}`)
		.join(", ");
	console.log(
		`\t{ id: "${id}", valence: ${b.valence}, alphabet: [${b.alphabet.map((t) => JSON.stringify(t)).join(", ")}], ` +
			`configs: ${b.configs.size}, counts: { ${counts} } },`,
	);
}

const total = rows.reduce((s, [, b]) => s + Object.values(b.counts).reduce((x, y) => x + y, 0), 0);
console.error(
	`  // ${rows.length} boards, ${total} records, ${skipped} skipped (family not a plain config), ` +
		`${rows.reduce((s, [, b]) => s + b.configs.size, 0)} distinct vertex configurations`,
);
console.error(
	`  // biggest board: ${rows.reduce((m, r) => (Object.values(r[1].counts).reduce((x, y) => x + y, 0) > Object.values(m[1].counts).reduce((x, y) => x + y, 0) ? r : m))[0]}`,
);
