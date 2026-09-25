"use client";

// The /aperiodic sidebar shell. The control primitives it used to define now live in
// components/shelf/, shared with /isohedral and /pentagons; this file keeps only the shell.
//
// The shell is `PageSidebar`, the same w-80 chrome column every page uses: a pinned switcher on top,
// a hairline, then this view's controls in one scrolling region on the shared 14px gutter. Every
// section sits 24px from the next, and the region fades its last 24px so a cut row reads as more.
//
// On a phone the column is a dock sheet. Its peek row (the view name, and the switcher behind it)
// comes from the page through AperiodicPeek, since each view renders this shell itself and the page is
// the one that knows which view is up. The pinned header stops being pinned there: at half height a
// 190px switcher over its own scroll region would leave the controls a sliver, so the header and the
// controls scroll together as one column.

import { createContext, useContext, type ReactNode } from "react";
import { PageSidebar } from "@/components/page-sidebar";
import { useImmersive } from "@/stores/immersive";

export { Section, Segmented } from "@/components/shelf";

/** The dock sheet's peek row on a phone, supplied by the page around whichever view is mounted. */
export const AperiodicPeek = createContext<ReactNode>(null);

/**
 * The sidebar shell every aperiodic view renders into: the view switcher (`header`, supplied by the
 * page so it is identical across views) pinned above this view's own scrolling controls. Immersive
 * mode (components/fullscreen-toggle.tsx) slides it shut.
 */
export function AperiodicSidebar({ header, children }: { header: ReactNode; children: ReactNode }) {
	const immersive = useImmersive((s) => s.immersive);
	const peek = useContext(AperiodicPeek);
	return (
		<PageSidebar scrollable={false} collapsed={immersive} mobile="dock" title="Aperiodic" peek={peek ?? undefined}>
			<div className="h-full flex flex-col max-md:overflow-y-auto max-md:overflow-x-hidden max-md:overscroll-contain">
				<div className="shrink-0 px-3.5 pt-4 pb-5 flex flex-col gap-4 border-b border-line-subtle max-md:pt-1">{header}</div>
				<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide ta-scroll-fade max-md:flex-none max-md:overflow-visible">
					<div className="px-3.5 pt-5 pb-10 flex flex-col gap-6">{children}</div>
				</div>
			</div>
		</PageSidebar>
	);
}
