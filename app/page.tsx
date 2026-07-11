import { fetchRandomTilingCell } from "@/lib/services/campaignService";
import { createClient } from "@/lib/supabase/server";
import type { TranslationalCellData } from "@/classes/algorithm/types";
import { LandingTilingBackground } from "@/components/landing-tiling-background";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
	let cell: TranslationalCellData | null = null;
	try {
		const sb = await createClient();
		cell = await fetchRandomTilingCell(sb);
	} catch (e) {
		console.error("Landing: failed to load tiling for background", e);
	}

	return (
		<div className="relative flex-1 min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-zinc-900 via-zinc-950 to-black">
			{cell ? (
				<LandingTilingBackground translationalCell={cell} />
			) : null}
			<div className="absolute inset-0 bg-black/55 pointer-events-none" />
			<div className="relative max-w-md w-full rounded-lg overflow-hidden backdrop-blur-md shadow-xl border border-line bg-surface-overlay/40">
				<div className="absolute inset-0 bg-linear-to-br from-zinc-800/50 via-zinc-900/50 to-black/50" />
				<div className="relative z-10 p-8 md:p-10">
					<h1 className="text-fg text-3xl md:text-4xl font-medium tracking-tight">
						Welcome to <span className="font-bold text-accent">Tiling Atlas</span>
					</h1>
					<p className="mt-3 text-fg-secondary text-sm md:text-base font-light">
						Explore a variety of interactive tiling patterns
					</p>
					<div className="mt-8 flex flex-col gap-3">
						<Button href="/play" variant="primary" size="md" fullWidth label="Start Exploring" />
						<div className="flex gap-2">
							<Button href="/library" variant="secondary" size="md" fullWidth label="Library" />
							<Button href="/history" variant="secondary" size="md" fullWidth label="History" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
