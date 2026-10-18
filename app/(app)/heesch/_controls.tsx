"use client";

// The /heesch sidebar shell. The control primitives live in components/shelf/, shared with /aperiodic,
// /isohedral and /pentagons; this file keeps only the shell.
//
// /aperiodic's layout: a pinned header (what is selected, and the set switcher) over one scrolling
// region on the shared 14px gutter. On a phone the column is a dock sheet whose peek row says what the
// header does, so the header is dropped there.

import type { ReactNode } from "react";
import { PageSidebar } from "@/components/page-sidebar";
import { useImmersive } from "@/stores/immersive";

export { Section, Details, Segmented, type SegmentedOption } from "@/components/shelf";

export function HeeschSidebar({ header, peek, children }: { header: ReactNode; peek: ReactNode; children: ReactNode }) {
	const immersive = useImmersive((s) => s.immersive);
	return (
		<PageSidebar scrollable={false} collapsed={immersive} mobile="dock" title="Heesch numbers" peek={peek}>
			<div className="h-full flex flex-col max-md:overflow-y-auto max-md:overflow-x-hidden max-md:overscroll-contain">
				<div className="shrink-0 px-3.5 pt-4 pb-5 flex flex-col gap-4 border-b border-line-subtle max-md:hidden">{header}</div>
				<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide ta-scroll-fade max-md:flex-none max-md:overflow-visible">
					<div className="px-3.5 pt-5 pb-10 flex flex-col gap-6">{children}</div>
				</div>
			</div>
		</PageSidebar>
	);
}
