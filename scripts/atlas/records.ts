/**
 * Regular shelf records from exact cells: what every record of the k-uniform shelf carries (the wallpaper group and
 * lattice from nClassify, the vertex types and edge and face orbits from the Delaney–Dress symbol, the polygon facets
 * from the cell), for an engine cell (scripts/build-regular-shards.ts) or one realized from a symbol (developSymbol).
 */
import { getActiveRing, type Cyclotomic } from "@/lib/classes/Cyclotomic";
import { angleGate, realizeSymbol } from "@/lib/classes/algorithm/delaney/DSymRealizer";
import { components, DSymbol, edgeOrbits, minimalBlocks } from "@/lib/classes/algorithm/delaney/DSymbol";
import { nClassify } from "@/lib/classes/symmetry/nClassify";
import { annotatePolygonFacets } from "@/lib/services/polygonFacets";
import { hydrateRenderCells } from "@/lib/services/renderCellDerive";
import { canonicalVC, classifyVCs } from "@/lib/services/vertexConfig";
import { cellMap } from "@/lib/tilings/dsymFromMap";
import { starAt } from "./symbols";

/** An exact cell; from eu_develop with EU_FACES, also its tile polygons and whether they passed its area check. */
export type Cell = {
	id: string;
	k: number;
	T1: number[];
	T2: number[];
	Seed: number[][];
	areaOk?: boolean;
	faces?: { tile: string; verts: number[][] }[];
};
export type Rec = { id: string; source: string; k: number; [f: string]: unknown };
type Hydrated = Rec & {
	renderCell: { cellPolygons: { n: number }[] };
	polygonSpecies?: string[];
	tilePeriods?: number[];
};
export type Facts = { sym: DSymbol; m: number; partition: number[]; vcs: string[]; cell: Hydrated };

/** A record's symbol facts: the symbol under the full symmetry group, its vertex types, and a copy of the record
 *  with its cell derived, or `renderCell` when given. Throws unless the vertex orbits are its k. */
export function facts(t: Rec, renderCell?: Hydrated["renderCell"]): Facts {
	const cell = (renderCell ? { ...t, renderCell } : { ...t }) as Hydrated;
	hydrateRenderCells([cell as never]); // leaves a given cell alone
	const map = cellMap(cell.renderCell as never);
	if (!map) throw new Error(`${t.id}: no symbol`);
	const sym = minimalBlocks(map.sym).sym;
	const vertex = components(sym, 1, 2);
	if (vertex.length !== t.k) throw new Error(`${t.id}: k = ${t.k}, its symbol has ${vertex.length} vertex orbits`);
	return { sym, cell, ...classifyVCs(vertex.map(([x]) => canonicalVC(starAt(sym, x).map(String)))) };
}
/** Tilings with the same signature (k, vertex types and how many orbits each) are the only ones a tiling can be. */
export const signature = (k: number, f: { partition: number[]; vcs: string[] }) =>
	`${k}|${f.vcs.map((v, i) => `${v}x${f.partition[i]}`).join(" ")}`;
/** The signature read off a symbol alone, with no cell. */
export function symbolSignature(sym: DSymbol): string {
	const vertex = components(sym, 1, 2);
	return signature(vertex.length, classifyVCs(vertex.map(([x]) => canonicalVC(starAt(sym, x).map(String)))));
}

/** A point of ℤ[ζ₁₂], [a, b, c, d] = a + bζ₁₂ + cζ₁₂² + dζ₁₂³, as the shelf draws it. */
const ZETA = [0, 1, 2, 3].map((j) => [Math.cos((j * Math.PI) / 6), Math.sin((j * Math.PI) / 6)]);
const point = (z: number[]) => [0, 1].map((xy) => z.reduce((s, c, j) => s + c * ZETA[j][xy], 0));

/** A cell's render cell from the engine's own faces, in place of rebuilding them from the seeds
 *  (reconstructOracleCell: 34 of a k = 17 record's 41 ms of CPU; this, 0.02). None unless they passed its area check. */
function facesCell(c: Cell): Hydrated["renderCell"] | undefined {
	if (!c.faces?.length || !c.areaOk) return undefined;
	const cellPolygons = c.faces.map((f) => ({ n: f.verts.length, vertices: f.verts.map(point) }));
	return { cellPolygons, basis: [point(c.T1), point(c.T2)] } as Hydrated["renderCell"];
}

/** One exact cell as a shelf record, with its facts. */
export function seedRecord(
	c: Cell,
	source: string,
	attribution: { discoverer: string; certification: string },
): { rec: Rec; facts: Facts } {
	const exactSource = { kind: "seed" as const, T1: c.T1, T2: c.T2, Seed: c.Seed };
	const t = { id: c.id, source, k: c.k, exactSource } as Rec;
	const f = facts(t, facesCell(c));
	annotatePolygonFacets([f.cell as never]);
	const ns = f.cell.renderCell.cellPolygons.map((p) => p.n);
	const { group, latticeShape } = nClassify(c.T1, c.T2, c.Seed);
	const rec = {
		...t,
		family: [...new Set(ns)].sort((a, b) => a - b).join("."),
		exactSource,
		...attribution,
		m: f.m,
		partition: f.partition,
		wallpaperGroup: group,
		latticeShape,
		polygonSpecies: f.cell.polygonSpecies,
		tilePeriods: f.cell.tilePeriods,
		vcs: f.vcs,
		edgeOrbits: edgeOrbits(f.sym).length,
		faceOrbits: components(f.sym, 0, 1).length,
	};
	return { rec, facts: f };
}

/** ζ₂₄-basis coefficients of a point of ℤ[ζ₁₂] as the shelf writes it, [a, b, c, d] = a + bζ₁₂ + cζ₁₂² + dζ₁₂³. */
function zeta12(z: Cyclotomic): number[] {
	if (z.den !== 1n || z.num.some((c, i) => i % 2 === 1 && c !== 0n)) throw new Error(`${z.key()} is not in ℤ[ζ₁₂]`);
	return [0, 2, 4, 6].map((i) => Number(z.num[i]));
}

/**
 * The exact seed cell of a flat symbol over regular polygons (a canonical form [n, s0, s1, s2, m01, m12]): realized
 * by DSymRealizer, so the lattice is the translation lattice of the symbol's group, and the seed is every vertex of
 * the cell brought into the lattice's fundamental parallelogram, once.
 */
export function developSymbol(id: string, k: number, f: readonly number[][]): Cell {
	const sym = new DSymbol(f[1], f[2], f[3], f[4], f[5]);
	if (!angleGate(sym).flat) throw new Error(`${id}: the symbol is not flat`);
	const ring = getActiveRing(); // the one the shelf's cells are rebuilt in, so polygons and points share it
	if (ring.N !== 24) throw new Error(`the active ring is ζ${ring.N}, the shelf's is ζ24`);
	const {
		basisExact: [u, v],
		cellPolygons,
	} = realizeSymbol(sym, ring).cell;
	const [U, V] = [u.toVector(), v.toVector()];
	const det = U.x * V.y - U.y * V.x;
	const seed = new Map<string, number[]>();
	for (const w of cellPolygons.flatMap((p) => p.exactVertices ?? [])) {
		const W = w.toVector();
		const a = Math.floor((W.x * V.y - W.y * V.x) / det + 1e-9);
		const b = Math.floor((U.x * W.y - U.y * W.x) / det + 1e-9);
		const r = w.sub(u.scaleRational(BigInt(a), 1n)).sub(v.scaleRational(BigInt(b), 1n));
		seed.set(r.key(), zeta12(r));
	}
	return { id, k, T1: zeta12(u), T2: zeta12(v), Seed: [...seed.values()] };
}
