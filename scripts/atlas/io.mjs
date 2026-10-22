// Read and write the data files shipped under public/, which are stored gzipped (CLAUDE.md, "Shipped
// data under public/ is stored gzipped"). The browser side reads them through atlasCodec's shardBody;
// this is the Node side, for builders, generators and build-time readers.
import fs from "node:fs";
import zlib from "node:zlib";

/** The path a data file actually lives at: `x.json` resolves to `x.json.gz` once only that exists. */
export function dataPath(file) {
	// turbopackIgnore: the paths are variables, and the server pages that read through here are static.
	return !file.endsWith(".gz") && !fs.existsSync(/* turbopackIgnore: true */ file) && fs.existsSync(/* turbopackIgnore: true */ `${file}.gz`)
		? `${file}.gz`
		: file;
}

/** Text of a data file, gunzipped when it is stored as `.gz`. */
export function readDataText(file) {
	const p = dataPath(file);
	const buf = fs.readFileSync(/* turbopackIgnore: true */ p);
	return (p.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8");
}

/** A data file, parsed. */
export function readDataJson(file) {
	return JSON.parse(readDataText(file));
}

/** Write a data file. A `.gz` path is gzipped at level 9 with no timestamp in the header (Node writes
 *  mtime 0), so a rebuild of the same records is byte-identical. */
export function writeDataFile(file, text) {
	fs.writeFileSync(file, file.endsWith(".gz") ? zlib.gzipSync(text, { level: 9 }) : text);
}
