import { createClient } from "@/lib/supabase/server";
import { fetchCatalogue } from "@/lib/services/catalogueService";
import { LibraryClient } from "./_library-client";

export const dynamic = "force-dynamic";

// The library is a read-only view over the CERTIFIED-RESULTS catalogue (found_tilings of certified +
// candidate runs, deduped, badged). It no longer reads the legacy `tilings` table (the dead
// expand-and-extract pipeline). See docs/FRONTEND_ROADMAP.md.
export default async function LibraryPage() {
	const sb = await createClient();
	const tilings = await fetchCatalogue(sb);
	return <LibraryClient tilings={tilings} />;
}
