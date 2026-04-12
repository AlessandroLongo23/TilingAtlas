"use client";

import { useState } from "react";
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
	const [scrollProgress, setScrollProgress] = useState(0);

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
						className="h-full bg-green-500 transition-[width] duration-100"
						style={{ width: `${scrollProgress}%` }}
					/>
				</div>

				{content ? (
					<MarkdownRenderer
						content={content}
						targetSection={targetSection}
						onSectionActive={setActiveSection}
						onScrollProgress={setScrollProgress}
					/>
				) : (
					<div className="w-full flex items-center justify-center p-8">
						<p className="text-zinc-400">No content available.</p>
					</div>
				)}
			</div>
		</div>
	);
}
