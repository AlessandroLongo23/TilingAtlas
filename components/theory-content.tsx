"use client";

import { useEffect } from "react";
import { useContentService } from "@/services/contentService";
import { MarkdownRenderer } from "./markdown-renderer";

interface TheoryContentProps {
	path?: string;
	targetSection?: string;
	onSectionActive?: (sectionId: string) => void;
}

export function TheoryContent({
	path = "/theory/tilings-and-automata.md",
	targetSection = "",
	onSectionActive,
}: TheoryContentProps) {
	const content = useContentService((s) => s.content);
	const isLoading = useContentService((s) => s.isLoading);
	const error = useContentService((s) => s.error);
	const loadContent = useContentService((s) => s.loadContent);

	useEffect(() => {
		void loadContent(path);
	}, [path, loadContent]);

	return (
		<div className="w-full h-full overflow-hidden bg-surface-raised">
			{isLoading ? (
				<div className="w-full h-full flex items-center justify-center">
					<div className="text-fg-muted p-4 text-center">Loading theory content...</div>
				</div>
			) : error ? (
				<div className="w-full h-full flex items-center justify-center">
					<div className="text-danger p-4 text-center">
						<h2 className="text-xl mb-2">Error Loading Content</h2>
						<p>{error}</p>
					</div>
				</div>
			) : content ? (
				<MarkdownRenderer
					content={content}
					targetSection={targetSection}
					onSectionActive={onSectionActive}
				/>
			) : (
				<div className="w-full h-full flex items-center justify-center">
					<div className="text-fg-muted p-4 text-center">No content available</div>
				</div>
			)}
		</div>
	);
}
