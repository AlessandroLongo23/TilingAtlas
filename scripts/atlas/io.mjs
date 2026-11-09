// Read and write the data files shipped under public/, which are stored brotli-compressed as `.json.br`
// (CLAUDE.md, "Shipped data under public/"). The browser side reads them through
// atlasCodec's shardBody; this is the Node side, for builders, generators and build-time readers. `.gz`
// (the format until 2026-11) still reads.
import fs from "node:fs";
import zlib from "node:zlib";

// Quality 10, not 11: on a 53 MB hyperbolic shard (2026-11-09) 11 is 13% smaller and 5x slower, about
// 0.2 MB/s, which would make a full shelf rebuild take hours. The 16 MB window (lgwin 24) is what beats
// gzip, by seeing repeats far apart in a file; it also fixes the first byte's low nibble at 0xF, which
// is how shardBody tells a brotli body from one a CDN already unwrapped to JSON. Keep it at 24.
const BROTLI = { [zlib.constants.BROTLI_PARAM_QUALITY]: 10, [zlib.constants.BROTLI_PARAM_LGWIN]: 24 };

/** The path a data file actually lives at: `x.json` resolves to `x.json.br` (or a legacy `x.json.gz`)
 *  once only that exists. */
export function dataPath(file) {
	// turbopackIgnore: the paths are variables, and the server pages that read through here are static.
	if (/\.(br|gz)$/.test(file) || fs.existsSync(/* turbopackIgnore: true */ file)) return file;
	return [`${file}.br`, `${file}.gz`].find((p) => fs.existsSync(/* turbopackIgnore: true */ p)) ?? file;
}

/** Text of a data file, decompressed by its extension. */
export function readDataText(file) {
	const p = dataPath(file);
	const buf = fs.readFileSync(/* turbopackIgnore: true */ p);
	const text = p.endsWith(".br") ? zlib.brotliDecompressSync(buf) : p.endsWith(".gz") ? zlib.gunzipSync(buf) : buf;
	return text.toString("utf8");
}

/** A data file, parsed. */
export function readDataJson(file) {
	return JSON.parse(readDataText(file));
}

/** The bytes a data file at `file` holds: brotli for `.br`, gzip level 9 for `.gz` (no timestamp in the
 *  header, so a rebuild of the same records is byte-identical, as brotli always is), else the text. */
export function dataBytes(file, text) {
	const params = { ...BROTLI, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: Buffer.byteLength(text) };
	if (file.endsWith(".br")) return zlib.brotliCompressSync(text, { params });
	return file.endsWith(".gz") ? zlib.gzipSync(text, { level: 9 }) : Buffer.from(text);
}

/** Write a data file, compressed by its extension. */
export function writeDataFile(file, text) {
	fs.writeFileSync(file, dataBytes(file, text));
}
