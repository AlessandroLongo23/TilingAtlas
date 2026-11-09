// The homogeneous search's Delaney–Dress symbols (tools/ctrnact-oracle/homogeneous.py), paired with the regular
// shelf's records by each record's own symbol: the one /play computes from the record's cell
// (lib/tilings/recordSymbol.ts), so the pairing owes nothing to the search. Used by the classification lists.
import fs from "node:fs";
import path from "node:path";
import { components, DSymbol, edgeOrbits, kUniformity, minimalBlocks } from "@/lib/classes/algorithm/delaney/DSymbol";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { hydrateRenderCells } from "@/lib/services/renderCellDerive";
import { REGULAR_SHARD_KS, REGULAR_SHARD_PARTS, type ReferenceTiling } from "@/lib/services/referenceAtlas";
import { cellMap } from "@/lib/tilings/dsymFromMap";
import { formatTegulaSymbol, parseTegulaSymbol } from "@/lib/tilings/orbifoldMorph";
import { stringifyAtlas } from "./encode.mjs";
import { readDataJson, writeDataFile } from "./io.mjs";

const ROOT = process.cwd();
const SEARCH = path.join(ROOT, "experiments", "results", "homogeneous-2026-11-08");

/** The regular shelf's files: the base atlas, and the lazy shards of `ks` (all of them by default), parts included. */
export const regularShelfFiles = (ks: readonly number[] = REGULAR_SHARD_KS): string[] =>
	[
		"reference-atlas",
		...ks.flatMap(
			(k) => REGULAR_SHARD_PARTS[k]?.map((_, i) => `reference-atlas-k${k}-p${i}`) ?? [`reference-atlas-k${k}`],
		),
	].map((f) => path.join(ROOT, "public", `${f}.json.br`));
/** The regular tilings in shelf files (complete to REGULAR_COMPLETE_K, plus the partial tiers above it). */
export const readShelf = (files: string[]): ReferenceTiling[] =>
	files
		.flatMap((f) => decodeAtlas<ReferenceTiling>(readDataJson(f)))
		.filter((r) => ["galebach", "ctrnact", "tilesearch"].includes(r.source) && !r.family.includes("*"));
/** Every tiling on the regular shelf, or on the base atlas and the shards of `ks`. */
export const regularShelf = (ks?: readonly number[]): ReferenceTiling[] => readShelf(regularShelfFiles(ks));

/** Writes a classification's list (lib/classifications.ts): its members, and the records of those past the eager
 *  base atlas (k ≥ 8), so picking the classification fetches them with the list and not the shards they live in.
 *  A member no shelf holds (face-homogeneous above the shelf's k) lives only here. */
export function writeClassification(
	file: string,
	members: { id?: string; k?: number }[],
	shelf: ReferenceTiling[],
	extra: object = {},
): void {
	const lazy = new Set(members.flatMap((m) => (m.id && m.k! >= REGULAR_SHARD_KS[0] ? [m.id] : [])));
	const records = shelf.filter((r) => lazy.has(r.id));
	if (records.length !== lazy.size) throw new Error(`${file}: ${lazy.size - records.length} members have no record`);
	const body = { ...extra, members, ...(records.length ? { records: JSON.parse(stringifyAtlas(records)) } : {}) };
	writeDataFile(file, JSON.stringify(body));
}

type Row = {
	k: number;
	e: number;
	figures: string[];
	dsymbol: [number, number[], number[], number[], number[], number[]];
};
/** The search's tilings of one figure kind, with their figures and canonical symbols. */
export const searchRows = (kind: "edge" | "vertex"): Row[] =>
	JSON.parse(fs.readFileSync(path.join(SEARCH, `${kind}.json`), "utf8"));
/** A canonical form, [n, s0…, s1…, s2…, m01…, m12…], in Delgado-Friedrichs' compressed form. Throws unless it
 *  reads back to the same symbol. */
export function canonicalSymbol(f: readonly number[]): string {
	const part = (i: number) => f.slice(1 + i * f[0], 1 + (i + 1) * f[0]);
	const dsym = formatTegulaSymbol(new DSymbol(part(0), part(1), part(2), part(3), part(4)));
	if (parseTegulaSymbol(dsym)?.canonicalKey() !== f.join(",")) throw new Error(`${dsym} does not read back`);
	return dsym;
}
/** A search row's symbol in Delgado-Friedrichs' compressed form. */
export const rowSymbol = (r: Row): string => canonicalSymbol(r.dsymbol.flat());

export interface Proved {
	id: string;
	k: number;
	/** edge orbits */
	e: number;
	/** the symbol, in Delgado-Friedrichs' compressed form */
	dsym: string;
}

/**
 * The search's tilings of one figure kind that are among `records`, each with its record. Throws on anything
 * that contradicts the search: a record whose symbol it did not find, two records with one symbol, or a k that
 * differs.
 */
export function provedOnShelf(kind: "edge" | "vertex", records: ReferenceTiling[]): Proved[] {
	const rows = searchRows(kind);
	const byKey = new Map(rows.map((r) => [r.dsymbol.flat().join(","), r]));
	const found = new Map<string, Proved>();
	for (const t of hydrateRenderCells(records)) {
		const map = cellMap(t.renderCell);
		const key = map ? minimalBlocks(map.sym).sym.canonicalKey() : "";
		const r = byKey.get(key);
		if (!r) throw new Error(`${t.id}: its symbol is not among the ${kind} search's ${rows.length}`);
		if (found.has(key)) throw new Error(`${t.id} and ${found.get(key)!.id} have one symbol`);
		if (r.k !== t.k) throw new Error(`${t.id}: k = ${t.k}, the search says ${r.k}`);
		found.set(key, { id: t.id, k: t.k, e: r.e, dsym: rowSymbol(r) });
	}
	return [...found.values()];
}

/** The polygons round chamber x's vertex, in cyclic order, starting with x's own. */
export function starAt(sym: DSymbol, x: number): number[] {
	const star = [sym.m01[x]];
	for (let y = sym.s[2][x]; star.length < sym.m12[x]; y = sym.s[2][sym.s[1][y]]) star.push(sym.m01[y]);
	return star;
}

/** Each tile orbit's full face figure: the polygons round each corner, corner by corner round the tile, as the
 *  least of its rotations and reflections. */
const faceFigures = (sym: DSymbol): string[] =>
	components(sym, 0, 1).map(([x0]) => {
		const P: number[][] = [];
		for (let x = x0; P.length < sym.m01[x0]; x = sym.s[0][sym.s[1][x]]) P.push(starAt(sym, x));
		const mirror = P.map((_, i) => P[(P.length - i) % P.length]).map(([f, ...rest]) => [f, ...rest.reverse()]);
		return [P, mirror].flatMap((Q) => Q.map((_, g) => JSON.stringify([...Q.slice(g), ...Q.slice(0, g)]))).sort()[0];
	});

/**
 * A hydrated record's entry if no two of its tile orbits share a full face figure (the tile with every tile that
 * shares a corner with it; a figure and its mirror image count as one), else null. Throws if the record has no
 * symbol or its symbol's vertex orbits are not its k.
 */
export function faceHomogeneous(t: {
	id: string;
	k: number;
	renderCell: Parameters<typeof cellMap>[0];
}): Proved | null {
	const map = cellMap(t.renderCell);
	if (!map) throw new Error(`${t.id}: no symbol`);
	const sym = minimalBlocks(map.sym).sym;
	if (kUniformity(sym) !== t.k)
		throw new Error(`${t.id}: k = ${t.k}, its symbol has ${kUniformity(sym)} vertex orbits`);
	const figs = faceFigures(sym);
	if (new Set(figs).size < figs.length) return null;
	return { id: t.id, k: t.k, e: edgeOrbits(sym).length, dsym: canonicalSymbol(sym.canonicalForm()) };
}
