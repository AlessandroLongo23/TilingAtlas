// Shards stored compressed: `.json.br` (brotli, scripts/atlas/io.mjs) since 2026-11, `.json.gz` before. Every
// kept deployment and every clone holds public/, and these files are dart arrays and cells, so storing the
// compressed bytes is what lets the whole corpus ship.
//
// The "already decompressed" cases are the reason `shardBody` SNIFFS instead of trusting the extension: if a
// CDN labels the response `Content-Encoding`, `fetch` unwraps it before we see it and the body is JSON. Every
// shape has to read the same.
import { describe, expect, it } from "vitest";
import { readAtlas, decodeAtlas } from "@/lib/services/atlasCodec";
import { dataBytes, readDataText } from "../scripts/atlas/io.mjs";

/** What the assertions below read off a record; the rest of the shape is decodeAtlas's business. */
type Rec = { id: string; darts: unknown };
const bodyOf = (buf: Buffer, url: string) =>
	({
		ok: true,
		url,
		arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
		json: async () => JSON.parse(buf.toString("utf8")),
	}) as unknown as Response;

describe("compressed shards", () => {
	const text = readDataText("public/hyperbolic-edges/e667-k1.json");
	const raw = Buffer.from(text);
	const want = decodeAtlas<Rec>(JSON.parse(text));
	const same = (got: Rec[]) => {
		expect(got.map((r) => r.id)).toEqual(want.map((r) => r.id));
		expect(JSON.stringify(got[0].darts)).toEqual(JSON.stringify(want[0].darts));
	};

	it.each(["br", "gz"])("reads a .json.%s identically to its .json", async (ext) => {
		const packed = dataBytes(`x.json.${ext}`, text);
		same(await readAtlas<Rec>(bodyOf(packed, `https://x/e667-k1.json.${ext}`)));
		expect(packed.length).toBeLessThan(raw.length / 2);
	});

	it.each(["br", "gz"])("still reads a .json.%s whose server already decompressed it", async (ext) => {
		same(await readAtlas<Rec>(bodyOf(raw, `https://x/e667-k1.json.${ext}`)));
	});

	it("leaves plain .json alone", async () => {
		same(await readAtlas<Rec>(bodyOf(raw, "https://x/e667-k1.json")));
	});
});
