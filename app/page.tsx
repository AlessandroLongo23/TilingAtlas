import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TranslationalCellData } from "@/classes/algorithm/types";
import { LandingTilingBackground } from "@/components/landing-tiling-background";
import { LandingActions } from "@/components/landing-actions";

export const dynamic = "force-dynamic";

// The background is a random tiling from the same library the user browses
// (public/reference-atlas.json → every entry carries a renderCell). Parse once per server
// process, then pick a fresh cell per request (force-dynamic).
let libraryCellsCache: TranslationalCellData[] | null = null;

async function loadLibraryCells(): Promise<TranslationalCellData[]> {
	if (libraryCellsCache) return libraryCellsCache;
	const file = path.join(process.cwd(), "public", "reference-atlas.json");
	const raw = await readFile(file, "utf8");
	const atlas = JSON.parse(raw) as Array<{ renderCell?: TranslationalCellData | null }>;
	libraryCellsCache = atlas
		.map((e) => e.renderCell)
		.filter((c): c is TranslationalCellData => !!c);
	return libraryCellsCache;
}

export default async function HomePage() {
	let cell: TranslationalCellData | null = null;
	try {
		const cells = await loadLibraryCells();
		if (cells.length > 0) {
			cell = cells[Math.floor(Math.random() * cells.length)];
		}
	} catch (e) {
		console.error("Landing: failed to load tiling for background", e);
	}

	return (
		<div className="relative flex-1 min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-zinc-900 via-zinc-950 to-black">
			{cell ? (
				<LandingTilingBackground translationalCell={cell} />
			) : null}
			<div className="absolute inset-0 bg-black/55 pointer-events-none" />
			<div className="relative max-w-lg w-full rounded-lg overflow-hidden backdrop-blur-md shadow-xl border border-line bg-surface-overlay/40">
				<div className="absolute inset-0 bg-linear-to-br from-zinc-800/50 via-zinc-900/50 to-black/50" />
				<div className="relative z-10 p-8 md:p-10">
					<h1 className="text-fg text-3xl md:text-4xl font-medium tracking-tight">
						Welcome to <span className="font-bold text-accent whitespace-nowrap">Tiling Atlas</span>
					</h1>
					<p className="mt-3 text-fg-secondary text-sm md:text-base font-light">
						Explore a variety of interactive tiling patterns
					</p>
					<LandingActions />
				</div>
			</div>
		</div>
	);
}
