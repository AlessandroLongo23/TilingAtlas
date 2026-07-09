import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunRow, FoundTiling } from "@/lib/services/runsService";
import type { LatticeShape, WallpaperGroup } from "@/lib/classes/symmetry/types";
import type { ExactCellSource } from "@/lib/services/cellCodecService";

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
	renderCell: unknown | null; // float TranslationalCellData (parseBaseCell-ready); null if unpopulated
	certified: boolean;
	runIds: string[]; // provenance: which runs found this tiling
	// Joined from the exact symmetry index (public/symmetry-index.json, keyed by canonicalKey) when
	// available; absent for tilings not yet in the index. Decided exactly in ℤ[ζ₂₄], not stored in the DB.
	latticeShape?: LatticeShape;
	wallpaperGroup?: WallpaperGroup;
	// Inline exact cell for oracle tilings (Reference shelf), which have no Supabase cell_codec row.
	// Undefined for certified catalogue tilings — those resolve their exact cell via fetchCellCodec.
	exactSource?: ExactCellSource;
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

// Catalogue filtering (pure). Certification is first-class (not a campaign flag) — the atlas is about
// what's proven. Polygon filter is matched against the run's `family` tokens (the octagon-lemma family
// label, FRONTEND_ROADMAP.md §B). Wallpaper-group / lattice-shape filtering is now backed by the exact
// symmetry index (public/symmetry-index.json); a tiling missing from the index is excluded when either
// symmetry filter is active (it has no known group/shape to match).
export interface CatalogueFilter {
	kValues?: number[];
	polygonNames?: string[]; // each must appear in the tiling's family
	certification?: "all" | "certified" | "candidate";
	wallpaperGroups?: WallpaperGroup[];
	latticeShapes?: LatticeShape[];
}

export function matchesCatalogueFilters(t: CatalogueTiling, f: CatalogueFilter): boolean {
	if (f.kValues?.length && !f.kValues.includes(t.k)) return false;
	if (f.polygonNames?.length) {
		const fam = t.family.split(",").map((s) => s.trim());
		if (!f.polygonNames.every((n) => fam.includes(n))) return false;
	}
	if (f.certification === "certified" && !t.certified) return false;
	if (f.certification === "candidate" && t.certified) return false;
	if (f.wallpaperGroups?.length && (!t.wallpaperGroup || !f.wallpaperGroups.includes(t.wallpaperGroup))) return false;
	if (f.latticeShapes?.length && (!t.latticeShape || !f.latticeShapes.includes(t.latticeShape))) return false;
	return true;
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
