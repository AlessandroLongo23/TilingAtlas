import { ReferenceShelf } from "@/components/reference-shelf";

// One unified library over the whole atlas (public/reference-atlas.json), lazy-fetched client-side.
// The former certified-vs-reference toggle is gone: every tiling appears exactly once, tagged with a
// DISCOVERER (historical first-finder) and a CERTIFICATION (proven / reproduced / candidate). The
// proven k≤3 regular tilings live here as the Kepler / Krötenheerdt / Chavey entries, marked
// certification="proven"; the former Supabase certified shelf is retired.
export default function LibraryPage() {
	return <ReferenceShelf />;
}
