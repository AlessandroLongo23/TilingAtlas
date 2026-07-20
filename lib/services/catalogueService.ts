import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunRow, FoundTiling } from "@/lib/services/runsService";
import type { ExactCellSource } from "@/lib/services/cellCodecService";
import type { ParametricCellData } from "@/lib/utils/paramCell";
import type { WallpaperGroup, LatticeShape } from "@/lib/classes/symmetry/types";

// The METHOD-AGNOSTIC read contract for /play + /library (FRONTEND_ROADMAP.md Phase 1). Whichever
// method wrote found_tilings — torus today, orbifold later (DESIGN INTENT, gated on the Phase-1
// contract test; the two diverge inside PeriodSolver, see roadmap §A) — the frontend reads only this.
//
// certified = PROVEN complete & correct (some contributing run has runs.certified set by the §0 human
// step). Otherwise the tiling is a CANDIDATE: enumerated, matches the literature counts, but NOT YET
// proven. The website never sets certified; it mirrors it (§0).
export interface CatalogueTiling {
	canonicalKey: string;
	k: number;
	family: string;
	// Provenance source (Reference shelf). Drives the source-based tile-class axis (tileClassOf) so /play
	// and /library classify identically. Absent for Supabase certified rows — tileClassOf then falls back
	// to family tokens (those rows are regular-family, so the fallback is correct).
	source?: import("@/lib/services/referenceAtlas").ReferenceTiling["source"];
	renderCell: unknown | null; // float TranslationalCellData (parseBaseCell-ready); null if unpopulated
	certified: boolean;
	runIds: string[]; // provenance: which runs found this tiling
	// Inline exact cell for oracle tilings (Reference shelf), which have no Supabase cell_codec row.
	// Undefined for certified catalogue tilings — those resolve their exact cell via fetchCellCodec.
	exactSource?: ExactCellSource;
	// One-parameter family entries (Reference shelf only): the proven parametric cell that drives
	// the /play alpha slider (lib/utils/paramCell.ts). Certified catalogue tilings never carry this.
	paramCell?: ParametricCellData;
	// Hyperbolic shelf only: the {p,q} Schläfli symbol (regular entries; kept as the card label).
	schlafli?: [number, number];
	// Hyperbolic shelf only: the forced edge length ℓ of the developed patch, and the provenance string
	// (a "rendered by" note, not a historical discoverer). Both surface in the /play info panel, not the
	// card. Carried through from ReferenceTiling by referenceToCatalogue.
	edge?: number;
	discoverer?: string;
	// Hyperbolic shelf: id of a developed Poincaré patch (public/hyperbolic-developed.json). Its presence
	// routes /play + the sidebar/library thumbnails to the per-pixel Poincaré-disk renderer instead of the
	// Euclidean cell path. Carried through from ReferenceTiling by referenceToCatalogue. Present on every
	// hyperbolic entry, absent for Euclidean.
	developed?: { patch: string };
	// Spherical shelf only: the {p,q} Schläfli symbol of a Platonic solid. Its presence routes /play + the
	// thumbnails to the three.js sphere renderer (components/spherical-canvas.tsx), the way developed routes
	// to the Poincaré disk. Carried through from ReferenceTiling by referenceToCatalogue.
	spherical?: { p?: number; q?: number; solid: string };
	geometry?: "euclidean" | "hyperbolic" | "spherical";
	// Vertex-type classification carried through from ReferenceTiling (build-computed). k (above) counts
	// vertex ORBITS; m counts DISTINCT vertex configurations among them (m ≤ k); partition is their
	// multiplicities, descending, summing to k. Absent when the source has no per-orbit config data.
	m?: number;
	partition?: number[];
	// Exact wallpaper classification — REGULAR Euclidean tilings only (star tiles are non-convex ⇒ omitted,
	// NOTES §9.4). Absent for star tilings and for every hyperbolic/spherical entry.
	wallpaperGroup?: WallpaperGroup;
	latticeShape?: LatticeShape;
}

// Pure transform: collapse found_tilings (a tiling is rediscovered once per run that finds it) into
// one entry per canonical_key. k/family come from the contributing run; `certified` is true iff ANY
// contributing run is certified; `renderCell` is the first non-null among contributing rows. Rows
// whose run is absent from `runs` are DROPPED — their certification status is unknowable, and §0
// forbids guessing it (better to omit than to mislabel).
export function dedupeCatalogue(found: FoundTiling[], runs: RunRow[]): CatalogueTiling[] {
	const runById = new Map(runs.map((r) => [r.id, r]));
	const byKey = new Map<string, CatalogueTiling>();
	for (const f of found) {
		const run = runById.get(f.run_id);
		if (!run) continue; // unknowable trust → drop
		const existing = byKey.get(f.canonical_key);
		if (!existing) {
			byKey.set(f.canonical_key, {
				canonicalKey: f.canonical_key,
				k: run.k,
				family: run.family,
				renderCell: f.render_cell ?? null,
				certified: run.certified,
				runIds: [f.run_id],
			});
		} else {
			existing.certified ||= run.certified;
			if (existing.renderCell == null && f.render_cell != null) existing.renderCell = f.render_cell;
			if (!existing.runIds.includes(f.run_id)) existing.runIds.push(f.run_id);
		}
	}
	return Array.from(byKey.values());
}

// Only the render-relevant columns of found_tilings — NOT cell_codec (large; the exact mirror is
// fetched on demand elsewhere). Mirrors runsService.FOUND_COLS.
const FOUND_COLS = "run_id,canonical_key,render_cell,k,seed_idx,first_seen_at";

// Thin glue (untested, like the runsService fetchers): pull all found_tilings + all runs and dedupe.
// Read-only; the web never writes these tables. Filtering by k/family/certification is a Phase-2
// (library filters) concern applied to the returned CatalogueTiling[].
export async function fetchCatalogue(sb: SupabaseClient): Promise<CatalogueTiling[]> {
	const [foundRes, runsRes] = await Promise.all([
		sb.from("found_tilings").select(FOUND_COLS),
		sb.from("runs").select("*"),
	]);
	if (foundRes.error) {
		console.error("fetchCatalogue found_tilings:", foundRes.error.message);
		return [];
	}
	if (runsRes.error) {
		console.error("fetchCatalogue runs:", runsRes.error.message);
		return [];
	}
	return dedupeCatalogue((foundRes.data ?? []) as FoundTiling[], (runsRes.data ?? []) as RunRow[]);
}
