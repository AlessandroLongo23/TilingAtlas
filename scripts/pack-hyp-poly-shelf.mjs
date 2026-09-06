// Pack a hyperbolic-poly develop into shipped shards, and print the HYP_POLY_BOARDS rows for it.
//
//   node scripts/pack-hyp-poly-shelf.mjs <develop-dir> [<develop-dir>...]          # dry run
//   node scripts/pack-hyp-poly-shelf.mjs <develop-dir> [...] --write               # ...and write
//
// ALL THREE FAMILIES, one path: `hp<n>` (ai1's 3.4.n.4), `hpt<n>` ({3,n}) and `hpq<id>` (the a.b.c.d
// boards). The stem in the filename says which, so a directory of any mixture packs correctly.
//
// GZIPPED ON DISK. `public/` is tracked in git and these records are dart arrays — thousands of small
// repeated integers, which gzip 10-17x. The wire is IDENTICAL either way, because the server already
// gzips a plain .json on the fly, so storing the compressed bytes costs a viewer nothing and saves the
// repository an order of magnitude. That is what lets this shelf carry every k Marek enumerated instead
// of a budgeted prefix. lib/services/atlasCodec.ts `shardBody` reads either form.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { encodeAtlas } from "./atlas/encode.mjs";

const args = process.argv.slice(2);
const write = args.includes("--write");
const dirs = args.filter((a) => !a.startsWith("--"));
if (!dirs.length) {
	console.error("usage: pack-hyp-poly-shelf.mjs <develop-dir> [...] [--write]");
	process.exit(1);
}
const OUT = path.join(process.cwd(), "public", "hyperbolic-poly");

/** Board id and family from a shard stem: hpq4568 -> abcd/4568, hpt7 -> ai2/t7, hp7 -> ai1/7. */
function boardOf(stem) {
	let m = /^hpq([0-9ab]+)$/.exec(stem);
	if (m) return { id: m[1], family: "abcd" };
	m = /^hpt(\d+)$/.exec(stem);
	if (m) return { id: `t${m[1]}`, family: "ai2", n: Number(m[1]) };
	m = /^hp(\d+)$/.exec(stem);
	if (m) return { id: m[1], family: "ai1", n: Number(m[1]) };
	return null;
}

const byBoard = new Map();
for (const dir of dirs) {
	for (const f of fs.readdirSync(dir)) {
		const m = /^(hp[qt]?[0-9ab]+)-k(\d+)\.json$/.exec(f);
		if (!m) continue;
		const b = boardOf(m[1]);
		if (!b) continue;
		const key = `${b.family}:${b.id}`;
		if (!byBoard.has(key)) byBoard.set(key, { ...b, stem: m[1], slices: [] });
		byBoard.get(key).slices.push({ k: Number(m[2]), file: path.join(dir, f) });
	}
}

const rows = [];
let totalRecs = 0, totalRaw = 0, totalGz = 0;
const order = { ai1: 0, ai2: 1, abcd: 2 };
const keys = [...byBoard.keys()].sort((a, b) => {
	const x = byBoard.get(a), y = byBoard.get(b);
	if (order[x.family] !== order[y.family]) return order[x.family] - order[y.family];
	return x.family === "abcd" ? x.id.localeCompare(y.id) : x.n - y.n;
});

for (const key of keys) {
	const b = byBoard.get(key);
	const counts = {};
	let label = null;
	for (const s of b.slices.sort((x, y) => x.k - y.k)) {
		const recs = JSON.parse(fs.readFileSync(s.file, "utf8"));
		if (!recs.length) continue;
		counts[s.k] = recs.length;
		label ??= recs[0].family;
		totalRecs += recs.length;
		const packed = Buffer.from(JSON.stringify(encodeAtlas(recs)));
		const gz = zlib.gzipSync(packed, { level: 9 });
		totalRaw += packed.length;
		totalGz += gz.length;
		if (write) {
			fs.mkdirSync(OUT, { recursive: true });
			fs.writeFileSync(path.join(OUT, `${b.stem}-k${s.k}.json.gz`), gz);
		}
	}
	const ks = Object.keys(counts).map(Number).sort((x, y) => x - y);
	if (!ks.length) continue;
	// EVERY SLICE IS LAZY and `dropped` is empty. Both are the policy, not an oversight: nothing we have
	// is held back (CLAUDE.md), and the board chips are drawn from this table rather than from loaded
	// records, so a board costs nothing until it is opened.
	rows.push(
		`\t{ id: "${b.id}", n: ${b.n ?? 0}, label: "${label}", family: "${b.family}", eagerKs: [], ` +
			`lazyKs: [${ks.join(", ")}], dropped: [], counts: { ${ks.map((k) => `${k}: ${counts[k]}`).join(", ")} } },`,
	);
}

console.log(rows.join("\n"));
console.log(
	`\n${rows.length} boards, ${totalRecs.toLocaleString()} tilings, ` +
		`${(totalRaw / 1e6).toFixed(0)} MB packed -> ${(totalGz / 1e6).toFixed(0)} MB gzipped ` +
		`(${(totalGz / totalRaw * 100).toFixed(1)}%)${write ? "  [WRITTEN]" : "  [dry run]"}`,
);
