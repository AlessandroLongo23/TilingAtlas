// Shards stored as `.json.gz`. `public/` is tracked in git and these files are dart arrays, which gzip
// 10-17x, so storing the compressed bytes is what keeps a corpus the size of `abcdtest` from doubling
// the repository. The wire is unchanged either way — the server already gzips a plain .json on the fly.
//
// The third case is the one that matters and the reason `shardBody` SNIFFS the gzip magic instead of
// trusting the extension: if a CDN decides to label the response `Content-Encoding: gzip`, `fetch`
// unwraps it before we see it and the body is already JSON. Both shapes have to read the same.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import zlib from "node:zlib";
import { readAtlas, decodeAtlas } from "@/lib/services/atlasCodec";

/** What the assertions below read off a record; the rest of the shape is decodeAtlas's business. */
type Rec = { id: string; darts: unknown };
const bodyOf = (buf: Buffer, url: string) =>
	({
		ok: true,
		url,
		arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
		json: async () => JSON.parse(buf.toString("utf8")),
	}) as unknown as Response;

describe("gzipped shards", () => {
	// Every shipped shard is gzipped now, so the plain source the three shapes compare against is one
	// un-gzipped here.
	const raw = zlib.gunzipSync(fs.readFileSync("public/hyperbolic-edges/e667-k1.json.gz"));
	const want = decodeAtlas<Rec>(JSON.parse(raw.toString("utf8")));

	it("reads a .json.gz identically to its .json", async () => {
		const gz = zlib.gzipSync(raw);
		const got = await readAtlas<Rec>(bodyOf(gz, "https://x/e667-k1.json.gz"));
		expect(got.map((r) => r.id)).toEqual(want.map((r) => r.id));
		expect(JSON.stringify(got[0].darts)).toEqual(JSON.stringify(want[0].darts));
		expect(gz.length).toBeLessThan(raw.length / 2);
	});

	it("still reads a .json.gz whose server already decompressed it", async () => {
		const got = await readAtlas<Rec>(bodyOf(raw, "https://x/e667-k1.json.gz"));
		expect(got.map((r) => r.id)).toEqual(want.map((r) => r.id));
	});

	it("leaves plain .json alone", async () => {
		const got = await readAtlas<Rec>(bodyOf(raw, "https://x/e667-k1.json"));
		expect(got.map((r) => r.id)).toEqual(want.map((r) => r.id));
	});
});
