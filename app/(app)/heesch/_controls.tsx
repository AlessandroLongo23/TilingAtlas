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

export { Section, Details, RingGlyph, Segmented, type SegmentedOption } from "@/components/shelf";

/** /frames lays out the same way and reuses this shell under its own `title`. */
export function HeeschSidebar({
	header,
	peek,
	title = "Heesch numbers",
	children,
}: {
	header: ReactNode;
	peek: ReactNode;
	title?: string;
	children: ReactNode;
}) {
	const immersive = useImmersive((s) => s.immersive);
	return (
		<PageSidebar scrollable={false} collapsed={immersive} mobile="dock" title={title} peek={peek}>
			<div className="flex h-full flex-col max-md:overflow-x-hidden max-md:overflow-y-auto max-md:overscroll-contain">
				<div className="flex shrink-0 flex-col gap-4 border-b border-line-subtle px-3.5 pt-4 pb-5 max-md:hidden">
					{header}
				</div>
				<div className="scrollbar-hide ta-scroll-fade min-h-0 flex-1 overflow-x-hidden overflow-y-auto max-md:flex-none max-md:overflow-visible">
					<div className="flex flex-col gap-6 px-3.5 pt-5 pb-10">{children}</div>
				</div>
			</div>
		</PageSidebar>
	);
}
