"use client";

import { useCallback, useRef, useState } from "react";
import { PageSidebar } from "@/components/page-sidebar";
import { TheorySidebar, type TheorySection } from "@/components/theory-sidebar";
import { MarkdownRenderer } from "@/components/markdown-renderer";

interface TheoryClientProps {
	content: string;
	sections: TheorySection[];
}

export function TheoryClient({ content, sections }: TheoryClientProps) {
	const [targetSection, setTargetSection] = useState("");
	const [activeSection, setActiveSection] = useState("");
	const progressRef = useRef<HTMLDivElement | null>(null);

	const handleScroll = useCallback((scroller: HTMLDivElement) => {
		const bar = progressRef.current;
		if (!bar) return;
		const max = scroller.scrollHeight - scroller.clientHeight;
		const progress = max > 0 ? scroller.scrollTop / max : 0;
		bar.style.transform = `scaleX(${progress})`;
	}, []);

	return (
		<div className="flex h-full min-h-0 w-full overflow-hidden">
			<PageSidebar>
				<TheorySidebar
					sections={sections}
					activeSection={activeSection}
					onSectionSelect={setTargetSection}
				/>
			</PageSidebar>

			<div className="w-full min-w-0 flex flex-col overflow-hidden">
				<div className="h-0.5 w-full bg-transparent shrink-0">
					<div
						ref={progressRef}
						className="h-full bg-accent origin-left"
						style={{ transform: "scaleX(0)", width: "100%" }}
					/>
				</div>

				{content ? (
					<MarkdownRenderer
						content={content}
						targetSection={targetSection}
						onSectionActive={setActiveSection}
						onScroll={handleScroll}
					/>
				) : (
					<div className="w-full flex items-center justify-center p-8">
						<p className="text-fg-muted">No content available.</p>
					</div>
				)}
			</div>
		</div>
	);
}
