// Pins the two halves of the atlas container format together: the encoder that every builder writes
// through (scripts/atlas/encode.mjs) and the decoder every loader reads through (atlasCodec.ts).
// They live in different module systems and could drift silently; a round trip that has to come back
// deep-equal is the only thing stopping that.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { encodeAtlas, encodeShard, decodeAtlas as decodeMjs, sameRecords } from "../../scripts/atlas/encode.mjs";
import { decodeAtlas, decodeShard } from "./atlasCodec";

/** A shelf's worth of records that repeat one long note, the shape the format exists for. */
const NOTE = "Regular {3,4,6,12} tiles at side lengths 1, 2 AND 3 together. ".repeat(16);
const many = (n: number) =>
	Array.from({ length: n }, (_, i) => ({
		id: `t${i}`,
		k: 7,
		source: "scaled",
		family: `3.4.6.12#${i % 5}`,
		note: NOTE,
		renderCell: { basis: [[1, 0], [0, 1]], cellPolygons: [{ n: 3, vertices: [[0, 0], [1, 0]] }] },
	}));

describe("atlas container round trip", () => {
	it("returns a bare array untouched (legacy files still load)", () => {
		const legacy = [{ id: "a" }, { id: "b" }];
		expect(decodeAtlas(legacy)).toEqual(legacy);
	});

	it("declines to pack a file too small to pay for the dictionary", () => {
		const few = many(4);
		expect(encodeAtlas(few)).toBe(few);
	});

	it("packs a repeated note and comes back deep-equal", () => {
		const records = many(500);
		const packed = encodeAtlas(records);
		expect(Array.isArray(packed)).toBe(false);
		expect(packed.atlas).toBe(1);
		expect(packed.dict.note).toEqual([NOTE]);
		expect(decodeAtlas(packed)).toEqual(records);
	});

	it("shrinks the payload it was written for", () => {
		const records = many(500);
		const before = JSON.stringify(records).length;
		const after = JSON.stringify(encodeAtlas(records)).length;
		expect(after).toBeLessThan(before / 2);
	});

	it("agrees with the builder-side decoder", () => {
		const records = many(500);
		const packed = encodeAtlas(records);
		expect(decodeAtlas(packed)).toEqual(decodeMjs(packed));
	});

	it("never hoists a numeric field, so an index is always an index", () => {
		// `k` is a low-cardinality number. Hoisting it would put a real 7 next to an index 0.
		const packed = encodeAtlas(many(500));
		expect(Object.keys(packed.dict)).not.toContain("k");
		expect(decodeAtlas<{ k: number }>(packed)[0].k).toBe(7);
	});

	it("leaves a record that lacks the field without it", () => {
		const records = many(500).map((r, i) => (i === 3 ? { ...r, note: undefined } : r));
		const back = decodeAtlas<{ note?: string }>(encodeAtlas(records));
		expect(back[3].note).toBeUndefined();
		expect(back[4].note).toBe(NOTE);
	});

	it("rejects a payload that is neither shape instead of silently emptying a shelf", () => {
		expect(() => decodeAtlas({ nope: true })).toThrow(/atlas container/);
	});

	it("collapses repeated polygon shapes into one table entry", () => {
		// 500 records over 5 families, all drawing the same unit triangle at the same place.
		const packed = encodeAtlas(many(500));
		expect(packed.geom).toBeTruthy();
		expect(packed.geom.s).toHaveLength(1); // one distinct shape
		expect(packed.geom.v).toHaveLength(1); // one distinct anchor
		expect(packed.records[0].renderCell.i).toEqual([0, 0]);
	});

	it("expands a packed cell back to the same polygons", () => {
		const records = many(500);
		const back = decodeAtlas<any>(encodeAtlas(records));
		expect(back[0].renderCell.cellPolygons).toEqual(records[0].renderCell.cellPolygons);
		expect(back[0].renderCell.basis).toEqual(records[0].renderCell.basis);
	});

	it("keeps polygon fields the shape table does not know about", () => {
		// The spherical shelf carries `hue`; a shape table that kept only n/star dropped it silently.
		const records = many(500).map((r) => ({
			...r,
			renderCell: {
				basis: [[1, 0], [0, 1]],
				cellPolygons: [{ hue: 200, n: 4, vertices: [[0, 0], [1, 0], [1, 1], [0, 1]], star: true }],
			},
		}));
		const back = decodeAtlas<any>(encodeAtlas(records));
		expect(back[0].renderCell.cellPolygons[0]).toEqual(records[0].renderCell.cellPolygons[0]);
		// Per-POLYGON key order survives, which is what the shape table controls. Cell-level order does
		// not (the packed form is {b,i}), and it does not need to: `geom` quantises to 1e-9, so the
		// migration verifies geometry with a tolerance and never by bytes.
		expect(JSON.stringify(back[0].renderCell.cellPolygons[0])).toBe(
			JSON.stringify(records[0].renderCell.cellPolygons[0]),
		);
	});

	it("expands lazily and caches, so a shelf costs only the cells it draws", () => {
		const back = decodeAtlas<any>(encodeAtlas(many(500)));
		expect(Object.getOwnPropertyDescriptor(back[0], "renderCell")?.get).toBeDefined();
		const a = back[0].renderCell;
		expect(a).toBe(back[0].renderCell); // cached
		expect(Object.getOwnPropertyDescriptor(back[0], "renderCell")?.get).toBeUndefined();
	});

	it("gives each polygon its own vertex arrays, never a shared table row", () => {
		const back = decodeAtlas<any>(encodeAtlas(many(500)));
		const a = back[0].renderCell.cellPolygons[0].vertices;
		const b = back[1].renderCell.cellPolygons[0].vertices;
		expect(a).toEqual(b);
		expect(a).not.toBe(b); // two records that share a shape must not share mutable arrays
		a[0][0] = 99;
		expect(b[0][0]).toBe(0);
	});

	it("leaves a record with no renderCell alone", () => {
		const records = many(500).map((r) => {
			const { renderCell, ...rest } = r;
			return rest;
		});
		const back = decodeAtlas<any>(encodeAtlas(records));
		expect(back[0].renderCell).toBeUndefined();
	});

	// --- refs: repeated OBJECTS and ARRAYS, the decoration shelves' bulk ---

	/** A decoration-shelf shape: a per-record unique payload plus a few file-wide constant objects. */
	const decorated = (n: number) =>
		Array.from({ length: n }, (_, i) => ({
			id: `e${i}`,
			k: 3,
			darts: [i, i + 1, i + 2], // unique per record — must NOT be hoisted
			rneig: [0, 3, 2, 1, 4, 7, 6, 5], // one value, file-wide
			stats: { valence: 3 + (i % 4), faces: 12 }, // four distinct values
		}));

	it("hoists repeated objects and arrays, and leaves per-record ones inline", () => {
		const packed = encodeAtlas(decorated(4000));
		expect(Object.keys(packed.refs).sort()).toEqual(["rneig", "stats"]);
		expect(packed.refs.rneig).toHaveLength(1);
		expect(packed.refs.stats).toHaveLength(4);
		expect(packed.records[0].darts).toEqual([0, 1, 2]); // still inline
	});

	it("brings refs back deep-equal", () => {
		const records = decorated(4000);
		expect(decodeAtlas(encodeAtlas(records))).toEqual(records);
	});

	it("hands out refs rows SHARED, which is the memory win", () => {
		const back = decodeAtlas<any>(encodeAtlas(decorated(4000)));
		expect(back[0].rneig).toBe(back[1].rneig);
		expect(back[0].stats).toBe(back[4].stats); // same stats bucket (i % 4)
		expect(back[0].stats).not.toBe(back[1].stats);
	});

	it("refuses a field whose values are not all objects, so an index stays unambiguous", () => {
		// `k` is a number and `id` a string-per-record: neither may enter the refs table.
		const packed = encodeAtlas(decorated(4000));
		expect(Object.keys(packed.refs)).not.toContain("k");
		expect(Object.keys(packed.refs)).not.toContain("id");
		expect(decodeAtlas<{ k: number }>(packed)[0].k).toBe(3);
	});

	it("shrinks a decoration shelf, bounded by the payload it cannot touch", () => {
		const records = decorated(4000);
		const before = JSON.stringify(records).length;
		const after = JSON.stringify(encodeAtlas(records)).length;
		// ~0.63 here. It cannot go much lower on this fixture and should not pretend to: `darts` is
		// unique per record, and that irreducible remainder is exactly why the real decoration shelves
		// gain 16% overall while isohedral-edges (mostly constants) gains 39%.
		expect(after).toBeLessThan(before * 0.7);
	});

	// --- refs, one level down: the freedraw/colors `patch` shape ---

	/** A patch that is unique per record (its `edges` differ) but whose parts repeat. */
	const patched = (n: number) =>
		Array.from({ length: n }, (_, i) => ({
			id: `f${i}`,
			k: 3,
			patch: {
				T1: [1, 0],
				T2: [0, 1],
				verts: [[0, 0], [1, 0], [0, 1]],
				polys: [[[0, 0, 0], [1, 0, 0], [2, 0, 0]]],
				// Unique per record, which is exactly why `patch` never repeats whole and the encoder has
				// to look a level down to find anything worth hoisting.
				edges: [[0, 1, 0, 0, i], [1, 2, 0, 0, 1]],
				stats: { faces: 1 + (i % 3) },
			},
		}));

	it("hoists inside a patch that never repeats whole", () => {
		const packed = encodeAtlas(patched(4000));
		const keys = Object.keys(packed.refs);
		expect(keys).not.toContain("patch"); // never repeats whole
		expect(keys).toContain("patch.verts");
		expect(keys).toContain("patch.polys");
		expect(keys).toContain("patch.stats");
		expect(typeof packed.records[0].patch.verts).toBe("number"); // an index now
	});

	it("brings a nested-hoisted patch back deep-equal", () => {
		const records = patched(4000);
		expect(decodeAtlas(encodeAtlas(records))).toEqual(records);
	});

	it("gives each record a fresh patch object but shares the hoisted parts", () => {
		const back = decodeAtlas<any>(encodeAtlas(patched(4000)));
		expect(back[0].patch).not.toBe(back[1].patch); // fresh parent
		expect(back[0].patch.verts).toBe(back[1].patch.verts); // shared part
	});

	it("agrees with the builder-side decoder on nested refs", () => {
		const packed = encodeAtlas(patched(4000));
		expect(decodeAtlas(packed)).toEqual(decodeMjs(packed));
	});

	// --- elems: repeated ARRAY ELEMENTS, for a field that never repeats whole ---

	/** A field built per record from a small shared pool, so no two records share the whole array. */
	const pooled = (n: number) => {
		const pool = Array.from({ length: 50 }, (_, s) => ({ n: 3 + (s % 10), v: [s, s * 2] }));
		const pick = (i: number, j: number) => {
			let s = (i * 2654435761 + j * 40503) >>> 0;
			s = (s ^ (s >>> 13)) >>> 0;
			return pool[s % 50];
		};
		return Array.from({ length: n }, (_, i) => ({
			id: `p${i}`,
			polys: Array.from({ length: 20 }, (_, j) => pick(i, j)),
			rneig: [1, 2, 3], // one value file-wide — refs must win here, not elems
		}));
	};

	it("hoists array ELEMENTS when the whole array never repeats", () => {
		const packed = encodeAtlas(pooled(3000));
		expect(Object.keys(packed.elems)).toEqual(["polys"]);
		expect(packed.elems.polys).toHaveLength(50);
		expect(packed.records[0].polys.every((i: unknown) => typeof i === "number")).toBe(true);
	});

	it("still prefers whole-value hoisting where that is smaller", () => {
		// `rneig` is one array file-wide: a table of one plus an index per record beats an index ARRAY
		// per record. Getting this backwards would make the file bigger, not smaller.
		const packed = encodeAtlas(pooled(3000));
		expect(Object.keys(packed.refs)).toContain("rneig");
		expect(Object.keys(packed.elems)).not.toContain("rneig");
	});

	it("brings element-hoisted arrays back deep-equal", () => {
		const records = pooled(3000);
		expect(decodeAtlas(encodeAtlas(records))).toEqual(records);
	});

	it("agrees with the builder-side decoder on element hoisting", () => {
		const packed = encodeAtlas(pooled(3000));
		expect(decodeAtlas(packed)).toEqual(decodeMjs(packed));
	});

	it("shrinks a pooled-array shelf by more than half", () => {
		const records = pooled(3000);
		const before = JSON.stringify(records).length;
		const after = JSON.stringify(encodeAtlas(records)).length;
		expect(after).toBeLessThan(before * 0.5);
	});

	// --- wrapped shards: the spherical-edges / schwarz-sph shape ---

	const shard = (n: number) => ({
		board: "664",
		solid: "x664",
		geometry: "spherical",
		k: 24,
		vertices: [[0, 0, 1]],
		faces: [[0, 1, 2]],
		patterns: Array.from({ length: n }, (_, i) => ({
			id: `p${i}`,
			drawn: [i, i + 1],
			vorbit: [0, 1, 2, 3],
			stats: { faces: 14, valence: 3 + (i % 3) },
		})),
	});

	it("packs a wrapped shard and keeps the wrapper's own keys", () => {
		const packed = encodeShard(shard(4000)) as any;
		expect(packed.atlas).toBe(1);
		expect(packed.board).toBe("664");
		expect(packed.vertices).toEqual([[0, 0, 1]]);
		expect(Object.keys(packed.refs).sort()).toEqual(["stats", "vorbit"]);
		expect(typeof packed.patterns[0].vorbit).toBe("number"); // an index now
	});

	it("decodes a wrapped shard back to what the renderer saw before the format existed", () => {
		const original = shard(4000);
		const back = decodeShard(encodeShard(original) as any);
		expect(back).toEqual(original);
		// …and carries no table keys the hydrators would not recognise.
		expect(Object.keys(back)).not.toContain("refs");
		expect(Object.keys(back)).not.toContain("atlas");
	});

	it("strips EVERY table key from a decoded shard, whichever layers fired", () => {
		// Regression: the .mjs shard decoder once destructured atlas/dict/refs/geom but not `elems`, so a
		// shard whose records hoisted array elements came back with a stray `elems` key on the wrapper.
		// The migration's own gate caught it; this pins it. The fixture uses pooled arrays so `elems`
		// actually fires, which the earlier shard fixture did not.
		const pool = Array.from({ length: 50 }, (_, s) => ({ n: s, v: [s, s * 2] }));
		const pick = (i: number, j: number) => {
			let s = (i * 2654435761 + j * 40503) >>> 0;
			s = (s ^ (s >>> 13)) >>> 0;
			return pool[s % 50];
		};
		const original = {
			board: "664",
			solid: "x664",
			patterns: Array.from({ length: 3000 }, (_, i) => ({
				id: `p${i}`,
				polys: Array.from({ length: 20 }, (_, j) => pick(i, j)),
			})),
		};
		const encoded = encodeShard(original) as any;
		expect(Object.keys(encoded.elems ?? {})).toContain("polys"); // the layer really fired
		const back = decodeShard(encoded);
		for (const table of ["atlas", "dict", "refs", "elems", "geom"]) {
			expect(Object.keys(back)).not.toContain(table);
		}
		expect(back).toEqual(original);
	});

	it("passes a legacy shard through untouched", () => {
		const legacy = { board: "664", patterns: [{ id: "p0" }] };
		expect(decodeShard(legacy)).toBe(legacy);
	});

	it("leaves a shard too small to pay for the tables alone", () => {
		const small = { board: "x", patterns: [{ id: "a" }, { id: "b" }] };
		expect(encodeShard(small)).toBe(small);
	});

	it("round-trips a real shipped shelf file", () => {
		const file = path.join(process.cwd(), "public", "reference-atlas-spherical.json");
		if (!fs.existsSync(file)) return; // corpus not present in this checkout
		// Decode first: the shipped file is ITSELF packed, so re-encoding the raw container would be
		// packing a container. This is the same idempotence the migration script relies on.
		const records = decodeAtlas(JSON.parse(fs.readFileSync(file, "utf8")));
		const back = decodeAtlas<any>(encodeAtlas(records));
		expect(sameRecords(records, back)).toBeNull();
	});

	it("is idempotent: decode∘encode∘decode is decode", () => {
		const once = encodeAtlas(many(500));
		const twice = encodeAtlas(decodeAtlas(once));
		expect(sameRecords(decodeAtlas(once), decodeAtlas(twice))).toBeNull();
	});
});
