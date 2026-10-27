// Where a morphed type already is in the atlas. A morph keeps the topology and changes the group, and the
// type it lands on may be catalogued: 3.4.6.4 with its hexagons raised to heptagons is 3.4.7.4, which the
// hyperbolic 3.4.n.4 board holds. Two tilings are the same type exactly when their minimal Delaney-Dress
// symbols are isomorphic, so the search compares canonical keys, after cheap filters (geometry, k, tile
// sizes, vertex configuration) have cut each shelf down to a handful of candidates.
//
// Nothing is precomputed: the hyperbolic boards alone hold millions of tilings, and the shipped data has
// no room for an index. A board shard too large to fetch for a search is skipped and counted, so the
// panel can say the search was partial instead of claiming the type is absent.

import { type DSymbol, kUniformity, minimalImage } from "@/lib/classes/algorithm/delaney/DSymbol";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { loadHyperbolicBaseAtlas, loadHyperbolicPolyShard } from "@/lib/services/referenceAtlas";
import { polyhedronForId } from "@/lib/render/sphericalSolids";
import { dartsDSymbol, solidDSymbol } from "@/lib/tilings/dsymFromMap";
import { loadDevelopedPatch } from "@/lib/tilings/hyp-developed";
import { canonicalCycle, HYP_POLY_BOARDS, type HypPolyBoard } from "@/lib/tilings/hyp-poly";
import { geometryOf } from "@/lib/tilings/orbifoldMorph";
import { recordSymbol } from "@/lib/tilings/recordSymbol";

export interface Relative {
	id: string;
	label: string;
}

export interface RelativeSearch {
	found: Relative[];
	/** Tilings on boards whose shard was too large to fetch for a search. */
	unsearched: number;
}

/** Largest board shard fetched for a search. */
const SHARD_CAP = 30000;

const keyCache = new Map<string, string | null>();
const keyed = (id: string, make: () => DSymbol | null): string | null => {
	if (!keyCache.has(id)) {
		const s = make();
		keyCache.set(id, s ? minimalImage(s).canonicalKey() : null);
	}
	return keyCache.get(id)!;
};

/** The tiles round each vertex class, as the records write their configuration: "3.4.7.4 + 4.7.14". */
export function vertexConfig(sym: DSymbol): string {
	const seen = new Set<number>();
	const figs: string[] = [];
	for (let c = 0; c < sym.n; c++) {
		if (seen.has(c)) continue;
		const faces: number[] = [];
		let x = c;
		for (let step = 0; step < sym.m12[c]; step++) {
			faces.push(sym.m01[x]);
			x = sym.s[2][sym.s[1][x]];
		}
		// Mark the whole vertex class, both ways round it.
		for (const todo = [c]; todo.length; ) {
			const d = todo.pop()!;
			if (seen.has(d)) continue;
			seen.add(d);
			todo.push(sym.s[1][d], sym.s[2][d]);
		}
		figs.push(canonicalCycle(faces).join("."));
	}
	return figs.sort().join(" + ");
}

/** A record's configuration in the same form, or null when a figure has a token that is not a side count. */
function normConfig(cfg: string | undefined): string | null {
	if (!cfg) return null;
	const figs = cfg.split("+").map((f) => f.trim().split("."));
	if (figs.some((f) => f.some((t) => !/^\d+$/.test(t)))) return null;
	return figs
		.map((f) => canonicalCycle(f.map(Number)).join("."))
		.sort()
		.join(" + ");
}

/** The polygon sizes a hyperbolic board's records may use. */
function boardSizes(b: HypPolyBoard): number[] {
	if (b.family === "ai1") return [3, 4, b.n, 2 * b.n];
	if (b.family === "ai2") return [3, b.n];
	const inner = /\(([^)]*)\)/.exec(b.label)?.[1] ?? b.label;
	return (inner.match(/\d+/g) ?? []).map(Number);
}

/** Every catalogued tiling of the same type as `sym`. `loaded` is what /play holds already. */
export async function findRelatives(sym: DSymbol, loaded: readonly CatalogueTiling[]): Promise<RelativeSearch> {
	const want = minimalImage(sym).canonicalKey();
	const g = geometryOf(sym);
	const k = kUniformity(minimalImage(sym));
	const sizes = [...new Set(sym.m01)];
	const config = vertexConfig(minimalImage(sym));
	const found: Relative[] = [];
	let unsearched = 0;
	const hit = (id: string, label: string, key: string | null) => {
		if (key === want && !found.some((r) => r.id === id)) found.push({ id, label });
	};

	// What /play has loaded: the Tegula shelf, the spherical solids, and the flat shelves by k and sizes.
	for (const t of loaded) {
		if (t.dsym) {
			const s = recordSymbol(t);
			if (s && geometryOf(s) === g)
				hit(
					t.canonicalKey,
					t.family,
					keyed(t.canonicalKey, () => s),
				);
		} else if (g > 0 && t.spherical?.solid) {
			const solid = t.spherical.solid;
			hit(
				t.canonicalKey,
				t.family,
				keyed(`solid:${solid}`, () => {
					const p = polyhedronForId(solid);
					return p ? solidDSymbol(p.vertices, p.faces) : null;
				}),
			);
		} else if (g === 0 && t.k === k && t.renderCell && !t.geometry?.startsWith("h") && !t.geometry?.startsWith("s")) {
			const polys = t.renderCell.cellPolygons ?? t.renderCell.p ?? [];
			const own = new Set(polys.map((p) => p.n ?? (p.vertices ?? p.v)?.length));
			if (own.size !== sizes.length || sizes.some((n) => !own.has(n))) continue;
			hit(
				t.canonicalKey,
				t.family,
				keyed(t.canonicalKey, () => recordSymbol(t)),
			);
		}
	}
	if (g >= 0) return { found, unsearched };

	// The hyperbolic shelves, fetched on demand: the developed base shelf, then the regular-polygon boards.
	for (const r of await loadHyperbolicBaseAtlas()) {
		if (r.k !== k || normConfig(r.family) !== config || !r.developed?.patch) continue;
		const patch = await loadDevelopedPatch(r.developed.patch);
		if (patch)
			hit(
				r.id,
				r.family,
				keyed(r.id, () => dartsDSymbol(patch.darts, patch.edge)),
			);
	}
	for (const b of HYP_POLY_BOARDS) {
		if (![...b.eagerKs, ...b.lazyKs].includes(k)) continue;
		const own = boardSizes(b);
		if (sizes.some((n) => !own.includes(n))) continue;
		if ((b.counts[k] ?? 0) > SHARD_CAP) {
			unsearched += b.counts[k];
			continue;
		}
		for (const r of await loadHyperbolicPolyShard(b.id, k)) {
			const p = r.hypPoly;
			if (!p || normConfig(p.config) !== config) continue;
			hit(
				r.id,
				r.family,
				keyed(r.id, () => dartsDSymbol(p.darts, p.edge)),
			);
		}
	}
	return { found, unsearched };
}
