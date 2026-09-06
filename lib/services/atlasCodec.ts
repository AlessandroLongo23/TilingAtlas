// The atlas container format, READ side. The single boundary every shelf file crosses on its way into
// the app, whatever its geometry, tile class or k.
//
// The write side is scripts/atlas/encode.mjs (plain .mjs, because the builders are split between tsx
// and bare node); the two are pinned together by atlasCodec.test.ts, which round-trips real fixtures
// through both. See that file's header for why the format exists and what it measured.
//
// THREE LAYERS, each a per-file table the records index into:
//
//   { "atlas": 1,
//     "dict":    { "note": ["…"] },                                      // repeated STRINGS
//     "refs":    { "stats": [{…}] },                                      // repeated OBJECTS / ARRAYS
//     "elems":   { "patch.verts": [[x,y],…] },                            // repeated ARRAY ELEMENTS
//     "geom":    { "v": [[x,y],…], "s": [{…,"vertices":[[0,0],…]},…] },  // polygon shapes + anchors
//     "records": [ { …, "note": 0, "stats": 3,
//                    "renderCell": { "b": …, "i": [shape,anchor,…] } } ] }
//
// Every layer is opt-in per file and omitted when it would not pay, so a small shelf stays simple.
//
// WHY EACH ONE, with what it measured on 2026-08-15:
//  · dict — reference-atlas-scaled-k7.json stored ONE identical 996-character `note` 29,500 times.
//  · refs — the decoration shelves repeat objects, not strings: spherical-colors is 81% four file-wide
//    constants, isohedral-edges 25% two of them, spherical-edges 27% `stats` over 851 distinct values
//    across 101,887 records. Keys may be a dotted path ONE level down, because freedraw and colors keep
//    their bulk in a `patch` that is unique per record while its parts repeat: ts-solutions-k3.json is
//    14.4 MB of patch over 13,568 records, of which `polys` is 38% over 3,518 distinct values.
//  · elems — the same idea one step finer: hoist repeated ARRAY ELEMENTS instead of whole values, for
//    a field that never repeats whole but is built from a small pool. vertex-configs' `polys` is
//    182,321 elements over 541 distinct ones (337x); colors/hex-3-k8.json's `patch.verts` is 383,412
//    over 231. Each path takes whichever of refs/elems actually measures smaller — see tryHoist.
//  · geom — a cell polygon is stored absolutely, so the same hexagon at two places is stored twice.
//    Split into a translation-normalised SHAPE plus an ANCHOR, scaled-k7's 667,412 polygon instances
//    collapse to 585 shapes and 6,569 anchors, taking that file from 68.7 MB to 10.4 MB.
//
// THE INVARIANT shared by dict and refs: a field is hoisted only when its values are ALL strings
// (dict) or ALL non-null objects/arrays (refs), so an integer in that slot cannot be a value. The
// container names the hoisted fields, so this decoder never guesses.
//
// SHARING. `refs` rows are handed out shared — that is the memory win, and it is safe because nothing
// writes those fields in place (audited: hyperbolicDevelopClient holds `rneig`/`glue` as
// `private readonly` and only indexes them). `geom` is the opposite: each polygon gets FRESH vertex
// arrays, because renderers do transform those.
//
// LOSSINESS. `geom` quantises coordinates to 1e-9 of a unit edge and does not preserve cell-level key
// order; it is the one lossy layer, so the migration verifies it with a tolerance (sameRecords) instead
// of by bytes, and the /library render is pixel-identical across the change. `dict` and `refs` are exact.
//
// A legacy bare array passes through untouched, which is what makes the migration per-file: a shelf
// that has not been re-encoded yet still loads.

/**
 * A polygon with its vertex ring translated to its own first vertex, so it repeats across the shelf.
 * Every OTHER field the polygon carried is kept verbatim (`star`, and `hue` on the spherical shelf) —
 * a shape table that kept only n/star dropped data, which the round-trip test caught.
 */
interface GeomShape {
	vertices: [number, number][];
	[field: string]: unknown;
}

/** The two shared tables: anchor positions, and translation-normalised shapes. */
interface GeomTables {
	v: [number, number][];
	s: GeomShape[];
}

/** A renderCell in packed form: basis, then (shapeIdx, anchorIdx) pairs. */
interface PackedCell {
	b: [number, number][];
	i: number[];
}

/** The on-disk container. `records` carry small-int indices wherever `dict` or `geom` applies. */
interface AtlasContainer {
	atlas: 1;
	dict?: Record<string, string[]>;
	refs?: Record<string, unknown[]>;
	elems?: Record<string, unknown[]>;
	geom?: GeomTables;
	records: unknown[];
}

const isContainer = (raw: unknown): raw is AtlasContainer =>
	!!raw && typeof raw === "object" && (raw as AtlasContainer).atlas === 1 &&
	Array.isArray((raw as AtlasContainer).records);

const Q = (x: number) => {
	const r = Math.round(x * 1e9) / 1e9;
	return Object.is(r, -0) ? 0 : r;
};

/**
 * Rebuild `{ cellPolygons, basis }` from a packed cell and the file's tables.
 *
 * Every polygon gets its own fresh vertex arrays: the tables are shared storage, never shared objects
 * handed to a renderer that might transform them in place.
 */
export function expandCell(packed: PackedCell, geom: GeomTables) {
	const cellPolygons = [];
	for (let k = 0; k < packed.i.length; k += 2) {
		const shape = geom.s[packed.i[k]];
		const [ax, ay] = geom.v[packed.i[k + 1]];
		// Spread first so every field survives IN ITS ORIGINAL ORDER, then place the ring absolutely.
		cellPolygons.push({
			...shape,
			vertices: shape.vertices.map(([dx, dy]) => [Q(ax + dx), Q(ay + dy)] as [number, number]),
		});
	}
	return { cellPolygons, basis: packed.b };
}

/**
 * Inflate a parsed shelf file to plain records.
 *
 * Accepts either shape: a bare array (every file shipped before 2026-08-15, and any small shelf the
 * encoder declined to pack) returns as-is with no copy; a container is expanded field by field.
 * Anything else throws, because a silent `[]` here is how a whole shelf goes missing from /library
 * without a single error in the console.
 */
export function decodeAtlas<T>(raw: unknown): T[] {
	if (Array.isArray(raw)) return raw as T[];
	if (!isContainer(raw)) throw new Error("atlasCodec: not an array and not an atlas container");
	return unpackRecords<T>(raw.records, raw);
}

/** The table-bearing part of a container, whether it IS the records or merely wraps them. */
type Tables = Pick<AtlasContainer, "dict" | "refs" | "elems" | "geom">;

/**
 * Decode a WRAPPED shelf file, returning the wrapper with its record array expanded.
 *
 * The spherical-edges and schwarz-sph shards are `{ board, solid, vertices, faces, edges, patterns }` —
 * `patterns` is 100% of the bytes, and the wrapper is board metadata the renderer needs alongside it.
 * The table keys are stripped from the result, so `hydrateSphEdgesShard` / `hydrateSphShard` see exactly
 * the shard they saw before this format existed. A legacy shard passes through untouched.
 */
export function decodeShard<S extends object>(raw: S, key = "patterns"): S {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
	const c = raw as unknown as AtlasContainer & Record<string, unknown>;
	if (c.atlas !== 1 || !Array.isArray(c[key])) return raw;
	const { atlas: _a, dict: _d, refs: _r, elems: _e, geom: _g, ...rest } = c;
	return { ...rest, [key]: unpackRecords(c[key] as unknown[], c) } as unknown as S;
}

/**
 * Group dotted ref paths by parent, so a record copies each parent object once.
 *
 * A ref key is either a plain field (`stats`) or a dotted path one level down (`patch.polys`). The
 * second form exists because the freedraw and colors shelves keep their bulk in a `patch` object that
 * is unique per record while its PARTS repeat heavily. See the encoder's buildRefs note.
 */
function groupRefPaths(refFields: string[]) {
	const top: string[] = [];
	const nested = new Map<string, string[]>();
	for (const path of refFields) {
		const dot = path.indexOf(".");
		if (dot < 0) top.push(path);
		else {
			const parent = path.slice(0, dot);
			if (!nested.has(parent)) nested.set(parent, []);
			nested.get(parent)!.push(path.slice(dot + 1));
		}
	}
	return { top, nested };
}

function unpackRecords<T>(records: unknown[], tables: Tables): T[] {
	const dict = tables.dict ?? {};
	const fields = Object.keys(dict);
	const refs = tables.refs ?? {};
	const refFields = Object.keys(refs);
	const elems = tables.elems ?? {};
	const elemFields = Object.keys(elems);
	const geom = tables.geom;
	if (!fields.length && !refFields.length && !elemFields.length && !geom) return records as T[];
	const { top: topRefs, nested: nestedRefs } = groupRefPaths(refFields);
	const { top: topElems, nested: nestedElems } = groupRefPaths(elemFields);
	const unpackArray = (path: string, arr: unknown[]) =>
		arr.map((i) => (typeof i === "number" ? elems[path][i] : i));

	return records.map((r) => {
		if (!r || typeof r !== "object") return r as T;
		const out = { ...(r as Record<string, unknown>) };
		for (const f of fields) {
			const i = out[f];
			// `typeof i === "number"` is the whole check: the encoder hoists strings only, so a number
			// in a dictionary field cannot be a value.
			if (typeof i === "number") out[f] = dict[f][i];
		}
		for (const f of topRefs) {
			const i = out[f];
			// Shared, not cloned — see the encoder's note. Nothing writes these fields in place.
			if (typeof i === "number") out[f] = refs[f][i];
		}
		for (const f of topElems) {
			const v = out[f];
			if (Array.isArray(v)) out[f] = unpackArray(f, v);
		}
		// One copy of each parent object, carrying both kinds of hoist.
		const parents = new Set([...nestedRefs.keys(), ...nestedElems.keys()]);
		for (const parent of parents) {
			const p = out[parent] as Record<string, unknown> | undefined | null;
			if (p === undefined || p === null) continue;
			const copy = { ...p }; // fresh parent per record; the hoisted values inside are shared
			for (const sub of nestedRefs.get(parent) ?? []) {
				const i = p[sub];
				if (typeof i === "number") copy[sub] = refs[`${parent}.${sub}`][i];
			}
			for (const sub of nestedElems.get(parent) ?? []) {
				const v = p[sub];
				if (Array.isArray(v)) copy[sub] = unpackArray(`${parent}.${sub}`, v);
			}
			out[parent] = copy;
		}
		const packed = out.renderCell as PackedCell | undefined;
		if (geom && packed?.i) {
			// LAZY, for the same reason the derived cells are: expanding a 29,500-record shelf up front
			// is millions of array allocations for the ~25 tilings a page actually draws.
			// enumerable: the builder round-trip re-encodes these records with Object.keys. See above.
			defineLazyRenderCell(out, () => expandCell(packed, geom), true);
		}
		return out as T;
	});
}

/**
 * Read a shard body, transparently un-gzipping one stored as `.json.gz`.
 *
 * WHY A SHARD WOULD BE STORED COMPRESSED. `public/` is tracked in git and already ~1.3 GB, and these
 * files are dart arrays — thousands of small repeated integers, which gzip 10-17x. Serving them plain
 * costs nothing on the wire (the server gzips on the fly) but costs that factor in the REPOSITORY, in
 * every clone and in the deploy. Storing the compressed bytes makes disk size mean what the wire
 * already meant, which is what lets a corpus the size of `abcdtest` ship whole.
 *
 * SNIFFED, NOT DECLARED, because who decompresses is not ours to choose. If a server or CDN labels the
 * response `Content-Encoding: gzip`, `fetch` unwraps it before we see it and the body is already JSON;
 * if it serves the bytes verbatim (the usual case for `.gz`), it is not. Testing the two-byte gzip
 * magic covers both, and covers a future CDN changing its mind without a code change here.
 */
async function shardBody(res: Response): Promise<unknown> {
	// `res.url?` and not `res.url`: a Response built by hand (the shard tests) has no url, and the right
	// answer there is the behaviour every caller had before gzipped shards existed.
	if (!res.url?.endsWith(".gz")) return res.json();
	const buf = await res.arrayBuffer();
	const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
	if (!(head[0] === 0x1f && head[1] === 0x8b)) return JSON.parse(new TextDecoder().decode(buf));
	if (typeof DecompressionStream === "undefined") {
		throw new Error(`${res.url}: gzipped shard needs DecompressionStream, which this runtime lacks`);
	}
	// `new Response(buf).body` rather than `new Blob([buf]).stream()`: both are standard in a browser,
	// but only the former exists in the Node/undici runtime the tests and any server-side read use.
	const body = new Response(buf).body;
	if (!body) throw new Error(`${res.url}: gzipped shard has no readable body`);
	return JSON.parse(await new Response(body.pipeThrough(new DecompressionStream("gzip"))).text());
}

/** `fetch(url).then(readAtlas)` — the shelf loaders' one-liner. Throws on a non-OK response. */
export async function readAtlas<T>(res: Response): Promise<T[]> {
	if (!res.ok) throw new Error(`${res.url}: HTTP ${res.status}`);
	return decodeAtlas<T>(await shardBody(res));
}

/**
 * One shelf shard, by URL.
 *
 * `missing: "empty"` is the best-effort contract the demo shelves already rely on — a 404 degrades to
 * an empty merge instead of breaking the library. `missing: "throw"` is for the shards the atlas
 * cannot render without.
 */
export async function fetchAtlas<T>(
	url: string,
	{ missing = "throw" }: { missing?: "empty" | "throw" } = {},
): Promise<T[]> {
	const res = await fetch(url);
	if (res.status === 404 && missing === "empty") return [];
	return readAtlas<T>(res);
}

/**
 * Install a lazy `renderCell` that derives on first read and then collapses to a plain value.
 *
 * NON-ENUMERABLE, and that is the whole point. React 19's DEV build logs every component render
 * through `logComponentRender` -> `addObjectDiffToProperties`, which walks props with `for...in` and
 * READS each value to diff it. An enumerable lazy getter on an atlas record is therefore fired for
 * every record the moment it reaches a component as a prop, which is the entire corpus: measured on
 * /play with the dev server, that was one 14.95 s main-thread block, 6,200 ℤ[ζ₂₄] cell
 * reconstructions nobody asked for, and Chrome's "page unresponsive" dialog. `for...in` skips
 * non-enumerable properties, so hiding the property from enumeration is what makes the laziness
 * actually lazy. Production never had the block (its react-dom has no such logging) but paid the
 * same fragility: any prop walk, JSON.stringify or structuredClone would have detonated it too.
 *
 * Every consumer reads `t.renderCell` directly, which is unaffected — the 72 read sites keep working
 * unchanged. What DOES change is `{...t}`: a spread no longer carries the cell. Nothing in the app
 * spreads a record (checked), and the collapsed value keeps the same enumerability as the getter, so
 * the behaviour does not shift under a caller at first read.
 *
 * `enumerable` EXISTS FOR ONE CALLER, decodeAtlas below, and defaults to the safe value for everyone
 * else. The builders round-trip through decode -> encode, and scripts/atlas/encode.mjs collects fields
 * with `Object.keys` — so a non-enumerable cell there is not hidden from React, it is DROPPED FROM THE
 * FILE, and a rebuild would ship shelves with no geometry. Its expansion is array copying rather than
 * the ℤ[ζ₂₄] reconstruction that caused the stall, so leaving it visible costs little.
 */
export function defineLazyRenderCell<T extends object, C>(
	target: T,
	compute: (self: T) => C,
	enumerable = false,
): void {
	Object.defineProperty(target, "renderCell", {
		configurable: true,
		enumerable,
		get(this: T) {
			const cell = compute(this);
			Object.defineProperty(this, "renderCell", {
				value: cell,
				writable: true,
				enumerable,
				configurable: true,
			});
			return cell;
		},
	});
}
