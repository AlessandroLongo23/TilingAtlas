"use client";

/**
 * DEFERRED COMPONENT — intentionally not ported to React in Phase 4.
 *
 * The source src/lib/components/Sidebar.svelte is ~800 lines with tabs,
 * nested panels, GOL controls, tiling controls, debug toggles, and deep
 * coupling to the configuration / debug / screenshotPreview Zustand
 * slices — plus wiring into the Canvas component's state.
 *
 * It'll be ported during Phase 5 (Route Port) alongside Canvas, since
 * both live on the /play route and share state. Porting it decoupled
 * from that route context produced no value here.
 *
 * For layouts that need a generic scrollable sidebar wrapper, use
 * `<PageSidebar>` (already ported in Phase 4 batch 1).
 */

import type { ReactNode } from "react";

interface SidebarProps {
	children?: ReactNode;
}

export function Sidebar({ children }: SidebarProps) {
	return (
		<aside className="h-full w-72 shrink-0 flex items-center justify-center bg-zinc-800/50 border-r border-zinc-800/80 text-zinc-500 text-sm">
			{children ?? "Sidebar — deferred to Phase 5 (route integration)"}
		</aside>
	);
}
