import type { SupabaseClient } from "@supabase/supabase-js";
import { Cyclotomic, type CyclotomicRing } from "@/classes/Cyclotomic";
import { deserializeCell, type SerializedCell } from "@/classes/algorithm/cellCodec";
import type { PeriodCell } from "@/classes/algorithm/PeriodSolver";

export type { SerializedCell };

// The exact cyclotomic cell an oracle tiling carries inline (it has no Supabase cell_codec). Either the
// minimal generators {T1,T2,Seed} (reconstructed via reconstructOracleCell — Galebach/ctrnact) or a
// serialized cell (Galebach t1002/4.8.8, which has no {T1,T2,Seed} encoding but IS regular polygons).
// Star tilings (Myers) carry NEITHER: the regular-only cell codec cannot represent them, so they get no
// exactSource and no symmetry overlay (a star-aware codec is follow-up work).
export type ExactCellSource =
	| { kind: "seed"; T1: number[]; T2: number[]; Seed: number[][] }
	| { kind: "cell"; cell: SerializedCell };

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
export function seedFromPeriodCell(cell: PeriodCell): {
	T1: Cyclotomic;
	T2: Cyclotomic;
	seed: Cyclotomic[];
} {
	const [T1, T2] = cell.basisExact;
	const byKey = new Map<string, Cyclotomic>();
	for (const poly of cell.cellPolygons) {
		for (const w of poly.exactVertices ?? []) {
			if (!byKey.has(w.key())) byKey.set(w.key(), w);
		}
	}
	return { T1, T2, seed: Array.from(byKey.values()) };
}

export function seedFromCell(
	ring: CyclotomicRing,
	sc: SerializedCell,
): { T1: Cyclotomic; T2: Cyclotomic; seed: Cyclotomic[] } {
	return seedFromPeriodCell(deserializeCell(ring, sc));
}
