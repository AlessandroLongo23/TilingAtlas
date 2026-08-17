// The atlas container format, WRITE side. Every shelf builder emits through this, whatever its
// geometry, tile class or k, so one decoder (lib/services/atlasCodec.ts) reads all of them.
//
// WHY THIS EXISTS. A shelf file is an array of records that repeat their own metadata. Measured
// 2026-08-15 on the shipped corpus: reference-atlas-scaled-k7.json stored ONE identical 996-character
// `note` string 29,500 times, 29.4 MB of a single constant, in a 100.1 MB file that GitHub blocks at
// 104.9 MB. reference-atlas-euhalf-k12.json carried 13 distinct notes across 11,727 records. Hoisting
// those to a per-file table takes the whole reference-atlas set from 589 MB to 513 MB with no change
// to a single coordinate.
//
// Plain .mjs, no dependencies, because the builders are split between tsx (build-reference-atlas.ts)
// and bare node (build-euhalf-shelf.mjs) and both have to import it.
//
// FORMAT (schema 1):
//   { "atlas": 1, "dict": { "<field>": ["value", …] }, "records": [ { …, "<field>": 3 }, … ] }
// A legacy bare array is still valid input to the decoder, so migration is per-file and reversible.
//
// THE ONE INVARIANT: only STRING-valued fields are ever hoisted. That makes an integer sitting in a
// dictionary field unambiguously an index, so the decoder never has to guess whether it is looking at
// a value or a pointer. Numeric fields (k, edge, density) are left inline for exactly this reason.

/** Minimum records before hoisting is worth the dictionary's own overhead. */
const MIN_RECORDS = 32;
/** A field is a dictionary candidate when its distinct values are at most this share of the records. */
const MAX_DISTINCT_SHARE = 0.05;
/** …or this many, whichever is larger — small files still win on a handful of repeated labels. */
const MIN_DISTINCT_FLOOR = 8;
/** Skip a field whose hoist saves less than this; not worth the indirection. */
const MIN_SAVING_BYTES = 4096;

const bytes = (v) => Buffer.byteLength(JSON.stringify(v));

/**
 * Which string fields are worth hoisting, and the value table for each.
 * Returns a plain object; empty when nothing qualifies.
 */
function buildDict(records) {
	const fields = new Set();
	for (const r of records) if (r && typeof r === "object") for (const k of Object.keys(r)) fields.add(k);

	const dict = {};
	for (const field of fields) {
		const values = [];
		for (const r of records) {
			const v = r?.[field];
			if (v === undefined) continue;
			// The invariant: strings only. One non-string present anywhere disqualifies the field,
			// because a mixed column would put real numbers next to indices.
			if (typeof v !== "string") { values.length = 0; break; }
			values.push(v);
		}
		if (!values.length) continue;

		const distinct = [...new Set(values)];
		if (distinct.length > Math.max(MIN_DISTINCT_FLOOR, records.length * MAX_DISTINCT_SHARE)) continue;

		const inline = values.reduce((s, v) => s + bytes(v), 0);
		const hoisted = distinct.reduce((s, v) => s + bytes(v) + 1, 0) + values.length * 2;
		if (inline - hoisted < MIN_SAVING_BYTES) continue;

		dict[field] = distinct;
	}
	return dict;
}

// --- Reference table ------------------------------------------------------------------------------
//
// The `dict` layer above hoists STRINGS. On the decoration shelves the repeats are objects and arrays,
// which is where most of their bulk sits. Measured 2026-08-15:
//   spherical-colors  `vertices` 47%, `edges` 16%, `faces` 13%, `residual` 5% — ONE value each, file-wide
//   isohedral-edges   `rneig` 15%, `orbit` 10% — one value each
//   spherical-edges   `stats` 27% over 851 distinct values across 101,887 records
// Hoisting those takes the bare-array decoration shelves from 981 MB to 824 MB.
//
// THE INVARIANT, same shape as `dict`'s: a field is only hoisted when EVERY present value is a
// non-null object or array, so an integer sitting in that slot cannot be a value. The container names
// the hoisted fields, so the decoder never guesses.
//
// Table rows are handed out SHARED, not cloned — that is the memory win, and it is safe here because
// nothing writes these fields in place (audited 2026-08-15: the only consumers that keep one,
// hyperbolicDevelopClient's `rneig`/`glue`, hold them `private readonly` and only index them). Contrast
// `geom`, where each polygon gets fresh vertex arrays precisely because renderers do transform those.

/** A field is a ref candidate when its distinct values are at most this share of the records. */
const MAX_REF_SHARE = 0.25;
const MIN_REF_FLOOR = 4;
const MIN_REF_SAVING = 2048;

const tableBytes = (keys) => keys.reduce((s, k) => s + k.length + 1, 0);

/**
 * Hoist one path, as a whole VALUE (`refs`) or element by element (`elems`), whichever is smaller.
 *
 * Both are worth having, and neither wins everywhere. `rneig` is one array repeated file-wide: storing
 * the whole value once costs a table of one and an index per record, while going element-wise would
 * store an index array per record and be strictly worse. `patch.verts` is the opposite — 115,470
 * elements over 351 distinct ones in ts-solutions-k3.json, where whole-value hoisting still leaves
 * 2,773 distinct arrays. So this measures both and takes the better, which is the only way to get both
 * cases right without a per-shelf rule.
 */
function tryHoist(records, refs, elems, pathKey, read) {
	const whole = new Map();
	let present = 0;
	let inline = 0;
	// Element-wise is only legal when every occurrence is an ARRAY of objects/arrays.
	let elemOk = true;
	const elemTable = new Map();
	let elemCount = 0;

	for (const r of records) {
		const v = read(r);
		if (v === undefined) continue;
		present++;
		// THE INVARIANT: objects and arrays only, so an integer in this slot cannot be a value.
		if (v === null || typeof v !== "object") return;
		const key = JSON.stringify(v);
		inline += key.length;
		if (!whole.has(key)) whole.set(key, v);
		if (!elemOk) continue;
		if (!Array.isArray(v)) {
			elemOk = false;
			continue;
		}
		for (const e of v) {
			if (e === null || typeof e !== "object") {
				elemOk = false;
				break;
			}
			elemCount++;
			const ek = JSON.stringify(e);
			if (!elemTable.has(ek)) elemTable.set(ek, e);
		}
	}
	if (!present) return;

	const refsCost =
		whole.size <= Math.max(MIN_REF_FLOOR, present * MAX_REF_SHARE)
			? tableBytes([...whole.keys()]) + present * 3
			: Infinity;
	// An index array still costs brackets and commas per element; ~4 bytes is the honest estimate.
	const elemsCost = elemOk && elemCount ? tableBytes([...elemTable.keys()]) + elemCount * 4 : Infinity;

	const best = Math.min(refsCost, elemsCost);
	if (best === Infinity || inline - best < MIN_REF_SAVING) return;
	if (elemsCost <= refsCost) elems[pathKey] = [...elemTable.values()];
	else refs[pathKey] = [...whole.values()];
}

/**
 * Which paths are worth hoisting.
 *
 * TWO LEVELS. The top level catches a field that repeats whole (`stats`, `rneig`). But the freedraw and
 * colors shelves keep their bulk in a `patch` object that is unique per record — while its PARTS repeat
 * heavily: measured on ts-solutions-k3.json, patch is 14.4 MB over 13,568 records, of which `polys` is
 * 38% over 3,518 distinct values, `verts` 9% over 2,773, `stats` 6% over 102. So when a field is an
 * object that does not repeat whole, its own fields are tried one level down, keyed by a dotted path.
 * Two levels is the whole recursion — deeper would buy little and cost a general tree walk.
 */
function buildRefs(records) {
	const fields = new Set();
	for (const r of records) if (r && typeof r === "object") for (const k of Object.keys(r)) fields.add(k);

	const refs = {};
	const elems = {};
	for (const field of fields) {
		if (field === "renderCell") continue; // owned by the geom layer
		tryHoist(records, refs, elems, field, (r) => r?.[field]);
		if (refs[field] || elems[field]) continue; // hoisted at this level; no need to look inside

		// Not repeated whole. If it is a plain object everywhere, try its own fields.
		let plainObject = true;
		const subs = new Set();
		for (const r of records) {
			const v = r?.[field];
			if (v === undefined) continue;
			if (v === null || typeof v !== "object" || Array.isArray(v)) {
				plainObject = false;
				break;
			}
			for (const k of Object.keys(v)) subs.add(k);
		}
		if (!plainObject) continue;
		for (const sub of subs) tryHoist(records, refs, elems, `${field}.${sub}`, (r) => r?.[field]?.[sub]);
	}
	return { refs, elems };
}

/** Group dotted ref paths by their parent field, so a record copies each parent object once. */
function groupRefPaths(refFields) {
	const top = [];
	const nested = new Map(); // parent -> [sub, …]
	for (const path of refFields) {
		const dot = path.indexOf(".");
		if (dot < 0) top.push(path);
		else {
			const parent = path.slice(0, dot);
			if (!nested.has(parent)) nested.set(parent, []);
			nested.get(parent).push(path.slice(dot + 1));
		}
	}
	return { top, nested };
}

// --- Geometry table -------------------------------------------------------------------------------
//
// A renderCell stores every polygon as absolute float coordinates, and a shelf repeats the same few
// shapes across tens of thousands of tilings. Measured 2026-08-15 on reference-atlas-scaled-k7.json:
// 3,300,054 vertex occurrences over 11,778 distinct positions, and 667,412 polygon instances over just
// 585 distinct SHAPES once each polygon is translated to its own first vertex. Storing the shapes and
// the anchor positions once, and each polygon as a pair of indices into those two tables, takes that
// file from 68.7 MB to 10.4 MB.
//
// Coordinates are quantised to 1e-9 on the way in. Edges are unit length, so that is a billionth of an
// edge — far below the 1e-6 at which the geometric gate in renderCellDerive.ts already compares cells,
// and the /library render is pixel-identical across the change. It also stops float noise from
// splitting what is really one shape into several table entries.

/** Nine decimals, with -0 folded to 0 so it cannot split a table key. */
const Q = (x) => {
	const r = Math.round(x * 1e9) / 1e9;
	return Object.is(r, -0) ? 0 : r;
};

const hasCell = (r) => !!r?.renderCell?.cellPolygons;

/**
 * Replace each record's renderCell with `{ b: basis, i: [shapeIdx, anchorIdx, …] }` and return the
 * two shared tables. Mutates nothing: the caller gets fresh record objects.
 */
function buildGeom(records) {
	const verts = [];
	const vIndex = new Map();
	const shapes = [];
	const sIndex = new Map();

	const vertId = (x, y) => {
		const key = `${Q(x)},${Q(y)}`;
		let i = vIndex.get(key);
		if (i === undefined) {
			i = verts.length;
			vIndex.set(key, i);
			verts.push([Q(x), Q(y)]);
		}
		return i;
	};

	let touched = 0;
	const packed = records.map((r) => {
		if (!hasCell(r)) return r;
		const cell = r.renderCell;
		const inst = [];
		for (const poly of cell.cellPolygons) {
			const [ax, ay] = poly.vertices[0];
			// The shape IS the polygon, with its vertex ring moved to the origin. Keeping every other
			// field (and the original key order) is load-bearing: a cell polygon may carry `star`, and
			// the spherical shelf carries `hue` — a shape table that only kept n/star silently dropped
			// it, which is what the round-trip test caught.
			const shape = { ...poly, vertices: poly.vertices.map((v) => [Q(v[0] - ax), Q(v[1] - ay)]) };
			const key = JSON.stringify(shape);
			let s = sIndex.get(key);
			if (s === undefined) {
				s = shapes.length;
				sIndex.set(key, s);
				shapes.push(shape);
			}
			inst.push(s, vertId(ax, ay));
		}
		touched++;
		return { ...r, renderCell: { b: cell.basis.map((b) => [Q(b[0]), Q(b[1])]), i: inst } };
	});

	return touched ? { records: packed, geom: { v: verts, s: shapes } } : null;
}

/**
 * Build the tables and the index-carrying records. Returns null when no layer pays for itself.
 *
 * Shared by `encodeAtlas` (a file that IS a record array) and `encodeShard` (a file that WRAPS one),
 * so the two on-disk shapes cannot end up with different table semantics.
 */
function packRecords(records) {
	if (!Array.isArray(records) || records.length < MIN_RECORDS) return null;

	const dict = buildDict(records);
	const fields = Object.keys(dict);
	const { refs, elems } = buildRefs(records);
	const refFields = Object.keys(refs);
	const elemFields = Object.keys(elems);

	const index = {};
	for (const f of fields) index[f] = new Map(dict[f].map((v, i) => [v, i]));
	const refIndex = {};
	for (const f of refFields) refIndex[f] = new Map(refs[f].map((v, i) => [JSON.stringify(v), i]));
	const elemIndex = {};
	for (const f of elemFields) elemIndex[f] = new Map(elems[f].map((v, i) => [JSON.stringify(v), i]));
	const { top: topRefs, nested: nestedRefs } = groupRefPaths(refFields);
	const { top: topElems, nested: nestedElems } = groupRefPaths(elemFields);
	const packArray = (path, arr) => arr.map((e) => elemIndex[path].get(JSON.stringify(e)));

	let packed = records.map((r) => {
		if (!r || typeof r !== "object") return r;
		if (!fields.length && !refFields.length && !elemFields.length) return r;
		const out = { ...r };
		for (const f of fields) {
			const v = r[f];
			if (typeof v === "string") out[f] = index[f].get(v);
		}
		for (const f of topRefs) {
			const v = r[f];
			if (v !== undefined) out[f] = refIndex[f].get(JSON.stringify(v));
		}
		for (const f of topElems) {
			const v = r[f];
			if (Array.isArray(v)) out[f] = packArray(f, v);
		}
		// One copy of each parent object, carrying both kinds of hoist.
		const parents = new Set([...nestedRefs.keys(), ...nestedElems.keys()]);
		for (const parent of parents) {
			const p = r[parent];
			if (p === undefined || p === null) continue;
			const copy = { ...p };
			for (const sub of nestedRefs.get(parent) ?? []) {
				const v = p[sub];
				if (v !== undefined) copy[sub] = refIndex[`${parent}.${sub}`].get(JSON.stringify(v));
			}
			for (const sub of nestedElems.get(parent) ?? []) {
				const v = p[sub];
				if (Array.isArray(v)) copy[sub] = packArray(`${parent}.${sub}`, v);
			}
			out[parent] = copy;
		}
		return out;
	});

	const geomed = buildGeom(packed);
	if (geomed) packed = geomed.records;
	if (!fields.length && !refFields.length && !elemFields.length && !geomed) return null;

	return {
		tables: {
			...(fields.length ? { dict } : {}),
			...(refFields.length ? { refs } : {}),
			...(elemFields.length ? { elems } : {}),
			...(geomed ? { geom: geomed.geom } : {}),
		},
		packed,
	};
}

/**
 * Pack an array of shelf records into the container. Returns the array UNCHANGED (not wrapped) when
 * no layer applies, so a small shelf keeps the simpler on-disk shape and the decoder's legacy path.
 */
export function encodeAtlas(records) {
	const out = packRecords(records);
	if (!out) return records;
	return { atlas: 1, ...out.tables, records: out.packed };
}

/**
 * Pack a file that WRAPS its records instead of being them.
 *
 * The spherical-edges and schwarz-sph shards are `{ board, solid, vertices, faces, edges, patterns }`,
 * where `patterns` is 100% of the bytes and the wrapper is board metadata the renderer needs alongside
 * it. So the tables go next to the wrapper's own keys and `patterns` is replaced in place. Returns the
 * object UNCHANGED when nothing pays.
 */
export function encodeShard(obj, key = "patterns") {
	if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
	const out = packRecords(obj[key]);
	if (!out) return obj;
	return { ...obj, atlas: 1, ...out.tables, [key]: out.packed };
}

/** `JSON.stringify(encodeAtlas(records))` — what every builder's writeFileSync should be handed. */
export const stringifyAtlas = (records) => JSON.stringify(encodeAtlas(records));

/**
 * Did a round trip preserve these records?
 *
 * The `dict` layer is exact, so everything except renderCell is compared as bytes. The `geom` layer
 * quantises to 1e-9 and drops cell-level key order, so cells are compared structurally with a
 * tolerance: same polygon count, same order, same vertex count, same extra fields, coordinates within
 * `tol`. Anything looser than this would let a real geometry change through, which is the whole thing
 * the migration is guarding against.
 */
export function sameRecords(before, after, tol = 1e-9) {
	if (before.length !== after.length) return `length ${before.length} vs ${after.length}`;
	for (let r = 0; r < before.length; r++) {
		const a = before[r];
		const b = after[r];
		const { renderCell: ca, ...restA } = a ?? {};
		const { renderCell: cb, ...restB } = b ?? {};
		if (JSON.stringify(restA) !== JSON.stringify(restB)) return `record ${r} (${a?.id}): fields differ`;
		if (!ca !== !cb) return `record ${r} (${a?.id}): renderCell presence differs`;
		if (!ca) continue;
		for (let i = 0; i < 2; i++)
			for (let j = 0; j < 2; j++)
				if (Math.abs(ca.basis[i][j] - cb.basis[i][j]) > tol)
					return `record ${r} (${a?.id}): basis[${i}][${j}]`;
		if (ca.cellPolygons.length !== cb.cellPolygons.length)
			return `record ${r} (${a?.id}): polygon count`;
		for (let p = 0; p < ca.cellPolygons.length; p++) {
			const pa = ca.cellPolygons[p];
			const pb = cb.cellPolygons[p];
			const { vertices: va, ...fa } = pa;
			const { vertices: vb, ...fb } = pb;
			if (JSON.stringify(fa) !== JSON.stringify(fb)) return `record ${r} (${a?.id}): poly ${p} fields`;
			if (va.length !== vb.length) return `record ${r} (${a?.id}): poly ${p} vertex count`;
			for (let v = 0; v < va.length; v++)
				for (let c = 0; c < 2; c++)
					if (Math.abs(va[v][c] - vb[v][c]) > tol)
						return `record ${r} (${a?.id}): poly ${p} v${v}[${c}] ${va[v][c]} vs ${vb[v][c]}`;
		}
	}
	return null;
}

/**
 * Inflate a container back to plain records. The READ side lives in lib/services/atlasCodec.ts for the
 * browser; this copy exists so a builder can round-trip its own output in a test or a re-encode, and
 * the two are pinned together by lib/services/atlasCodec.test.ts.
 */
export function decodeAtlas(raw) {
	if (Array.isArray(raw)) return raw;
	if (!raw || typeof raw !== "object" || raw.atlas !== 1 || !Array.isArray(raw.records)) {
		throw new Error("not an atlas container");
	}
	return unpackRecords(raw.records, raw);
}

/**
 * Decode a WRAPPED shelf file, returning the wrapper with its record array expanded.
 *
 * The table fields are dropped from the result so the caller sees exactly the shard it saw before the
 * format existed — `hydrateSphEdgesShard` and `hydrateSphShard` take the whole object, and an unexpected
 * `dict`/`refs`/`geom` key on it would be noise at best.
 */
export function decodeShard(raw, key = "patterns") {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
	if (raw.atlas !== 1 || !Array.isArray(raw[key])) return raw; // legacy shard, unchanged
	const { atlas, dict, refs, elems, geom, ...rest } = raw;
	return { ...rest, [key]: unpackRecords(raw[key], raw) };
}

function unpackRecords(records, tables) {
	const dict = tables.dict ?? {};
	const fields = Object.keys(dict);
	const refs = tables.refs ?? {};
	const refFields = Object.keys(refs);
	const elems = tables.elems ?? {};
	const elemFields = Object.keys(elems);
	const geom = tables.geom;
	if (!fields.length && !refFields.length && !elemFields.length && !geom) return records;
	const { top: topRefs, nested: nestedRefs } = groupRefPaths(refFields);
	const { top: topElems, nested: nestedElems } = groupRefPaths(elemFields);
	const unpackArray = (path, arr) => arr.map((i) => (typeof i === "number" ? elems[path][i] : i));
	return records.map((r) => {
		if (!r || typeof r !== "object") return r;
		const out = { ...r };
		for (const f of fields) {
			const i = r[f];
			if (typeof i === "number") out[f] = dict[f][i];
		}
		for (const f of topRefs) {
			const i = r[f];
			if (typeof i === "number") out[f] = refs[f][i];
		}
		for (const f of topElems) {
			const v = r[f];
			if (Array.isArray(v)) out[f] = unpackArray(f, v);
		}
		const parents = new Set([...nestedRefs.keys(), ...nestedElems.keys()]);
		for (const parent of parents) {
			const p = r[parent];
			if (p === undefined || p === null) continue;
			const copy = { ...p };
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
		if (geom && out.renderCell?.i) out.renderCell = expandCell(out.renderCell, geom);
		return out;
	});
}

/** Rebuild `{ cellPolygons, basis }` from a packed `{ b, i }` and the file's shape/vertex tables. */
export function expandCell(packed, geom) {
	const cellPolygons = [];
	for (let k = 0; k < packed.i.length; k += 2) {
		const shape = geom.s[packed.i[k]];
		const [ax, ay] = geom.v[packed.i[k + 1]];
		// Spread first so every field the shape carries survives IN ITS ORIGINAL ORDER, then overwrite
		// the ring with its absolute placement.
		cellPolygons.push({
			...shape,
			vertices: shape.vertices.map(([dx, dy]) => [Q(ax + dx), Q(ay + dy)]),
		});
	}
	return { cellPolygons, basis: packed.b };
}
