"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import { cn } from "@/lib/utils/cn";

interface MarkdownRendererProps {
	content: string;
	targetSection?: string;
	onSectionActive?: (sectionId: string) => void;
	onScroll?: (scroller: HTMLDivElement) => void;
}

export function MarkdownRenderer({
	content,
	targetSection = "",
	onSectionActive,
	onScroll,
}: MarkdownRendererProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);

	// Scroll to targetSection when it changes.
	useEffect(() => {
		if (!targetSection || !containerRef.current) return;
		const el = containerRef.current.querySelector<HTMLElement>(`#${CSS.escape(targetSection)}`);
		el?.scrollIntoView({ behavior: "smooth", block: "start" });
	}, [targetSection]);

	// Active-section tracking via IntersectionObserver.
	useEffect(() => {
		const container = containerRef.current;
		if (!container || !onSectionActive) return;
		const headings = container.querySelectorAll<HTMLElement>("h2, h3, h4");
		if (headings.length === 0) return;

		const visible = new Set<HTMLElement>();
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) visible.add(entry.target as HTMLElement);
					else visible.delete(entry.target as HTMLElement);
				}
				const topmost = [...visible].sort((a, b) => a.offsetTop - b.offsetTop)[0];
				if (topmost?.id) onSectionActive(topmost.id);
			},
			{ root: container, rootMargin: "0px 0px -70% 0px" },
		);
		headings.forEach((h) => observer.observe(h));
		return () => observer.disconnect();
	}, [onSectionActive, content]);

	// Click-to-scroll on headings.
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const onClick = (e: MouseEvent) => {
			const target = (e.target as HTMLElement | null)?.closest("h2, h3, h4") as HTMLElement | null;
			if (target?.id) target.scrollIntoView({ behavior: "smooth", block: "start" });
		};
		container.addEventListener("click", onClick);
		return () => container.removeEventListener("click", onClick);
	}, []);

	// Scroll events — handed to parent imperatively so the progress bar can update
	// on every frame via direct DOM mutation, avoiding React state thrash.
	useEffect(() => {
		const container = containerRef.current;
		if (!container || !onScroll) return;
		const handler = () => onScroll(container);
		container.addEventListener("scroll", handler, { passive: true });
		handler();
		return () => container.removeEventListener("scroll", handler);
	}, [onScroll]);

	return (
		<div
			ref={containerRef}
			className={cn(
				"w-full h-full overflow-y-auto bg-surface-raised scrollbar-hide",
				"markdown-content",
			)}
		>
			<div className="max-w-4xl mx-auto px-6 md:px-10 py-6 md:py-8">
				<article
					className={cn(
						// Headings
						"[&_h2]:text-4xl [&_h2]:font-bold [&_h2]:text-fg [&_h2]:mb-10 [&_h2]:mt-24 [&_h2]:pb-4 [&_h2]:border-b [&_h2]:border-line-focus [&_h2]:cursor-pointer",
						"[&_h3]:text-2xl [&_h3]:font-semibold [&_h3]:text-fg [&_h3]:mb-4 [&_h3]:mt-16 [&_h3]:cursor-pointer",
						"[&_h4]:text-xl [&_h4]:font-medium [&_h4]:text-fg [&_h4]:mb-3 [&_h4]:mt-8 [&_h4]:cursor-pointer",
						// Body
						"[&_p]:text-fg-muted [&_p]:mb-6",
						"[&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-6 [&_ul]:text-fg-secondary",
						"[&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-6 [&_ol]:text-fg-secondary",
						"[&_li]:mb-2",
						"[&_blockquote]:border-l-4 [&_blockquote]:border-line-focus [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-fg-muted [&_blockquote]:my-4",
						"[&_code]:font-mono [&_code]:text-sm [&_code]:bg-surface-overlay [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-accent",
						"[&_pre]:bg-surface-overlay/50 [&_pre]:p-4 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_pre]:mb-6 [&_pre]:border [&_pre]:border-line",
						"[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-fg-secondary",
						"[&_a]:text-accent hover:[&_a]:text-accent [&_a]:underline",
						"[&_hr]:my-8 [&_hr]:border-line",
						"[&_img]:mt-4 [&_img]:rounded-lg [&_img]:overflow-hidden [&_img]:border [&_img]:border-line [&_img]:bg-surface-overlay/30 [&_img]:max-w-full [&_img]:h-auto [&_img]:mx-auto [&_img]:block [&_img]:w-1/3",
						// Tables
						"[&_table]:w-full [&_table]:border-collapse [&_table]:mb-6 [&_table]:bg-surface-overlay/20",
						"[&_th]:bg-surface-overlay [&_th]:text-left [&_th]:p-2 [&_th]:text-fg-secondary [&_th]:border [&_th]:border-line",
						"[&_td]:p-2 [&_td]:border [&_td]:border-line [&_td]:text-fg-secondary [&_td]:text-center [&_td]:align-middle",
						"[&_tr:nth-child(odd)]:bg-surface-overlay/30 [&_tr:nth-child(even)]:bg-surface-overlay/10",
						// KaTeX
						"[&_.katex]:text-fg-secondary [&_.katex-display]:overflow-x-auto [&_.katex-display]:my-6 [&_.katex-display]:px-2",
					)}
				>
					<ReactMarkdown
						remarkPlugins={[remarkGfm, remarkMath]}
						rehypePlugins={[rehypeSlug, [rehypeKatex, { output: "html" }]]}
					>
						{content}
					</ReactMarkdown>
				</article>
			</div>
		</div>
	);
}
