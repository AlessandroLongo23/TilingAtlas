import type { SupabaseClient } from "@supabase/supabase-js";
import { Cyclotomic, type CyclotomicRing } from "@/classes/Cyclotomic";
import { deserializeCell, type SerializedCell } from "@/classes/algorithm/cellCodec";

export type { SerializedCell };

// One-row exact fetch. The catalogue read (catalogueService) omits cell_codec (heavy); the Play viewer
// pulls it only for the selected tiling. Returns null if the row/codec is absent — the viewer then
// simply shows no overlay (e.g. reference-mode tilings that have no cell_codec yet).
export async function fetchCellCodec(
	sb: SupabaseClient,
	canonicalKey: string,
): Promise<SerializedCell | null> {
	const { data, error } = await sb
		.from("found_tilings")
		.select("cell_codec")
		.eq("canonical_key", canonicalKey)
		.not("cell_codec", "is", null)
		.limit(1)
		.maybeSingle();
	if (error || !data?.cell_codec) return null;
	return data.cell_codec as SerializedCell;
}

// Exact seed = the two basis vectors + the deduped union of all cell-polygon vertices, as Cyclotomic.
// This is the exact input to analyzeSymmetry — no floats.
export function seedFromCell(
	ring: CyclotomicRing,
	sc: SerializedCell,
): { T1: Cyclotomic; T2: Cyclotomic; seed: Cyclotomic[] } {
	const cell = deserializeCell(ring, sc);
	const [T1, T2] = cell.basisExact;
	const byKey = new Map<string, Cyclotomic>();
	for (const poly of cell.cellPolygons) {
		for (const v of poly.exactVertices ?? []) {
			if (!byKey.has(v.key())) byKey.set(v.key(), v);
		}
	}
	return { T1, T2, seed: Array.from(byKey.values()) };
}
