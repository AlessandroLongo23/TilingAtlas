"use client";

import { useEffect, useRef, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import { cn } from "@/lib/utils/cn";

// Every table sits in a box that scrolls sideways on a phone, where a six-column table or a row of
// unbreakable inline math is wider than the screen. On desktop the box is a plain block and the table's
// bottom margin collapses through it, so nothing moves.
//
// `<desktop-only>` and `<phone-only>` let an article say "scroll to zoom" to a mouse and "pinch to zoom"
// to a finger. Both are plain inline spans with no styling of their own, and the phone copy is
// display:none on desktop. Wrap WHOLE paragraphs (the pair back to back, the paragraph repeated in
// each): a tag boundary in mid-line splits the text run, which shifts the antialiasing of the next
// glyphs by a fraction of a pixel, and the desktop page should render exactly as it did without them.
const BASE_COMPONENTS = {
	table: ({ node, ...props }) => {
		void node; // react-markdown's syntax-tree node, which must not reach the DOM as an attribute
		return (
			<div className="max-md:mb-6 max-md:overflow-x-auto max-md:overscroll-x-contain">
				<table {...props} />
			</div>
		);
	},
	"desktop-only": ({ children }: { children?: ReactNode }) => <span className="max-md:hidden">{children}</span>,
	"phone-only": ({ children }: { children?: ReactNode }) => <span className="hidden max-md:inline">{children}</span>,
} as Components;

interface MarkdownRendererProps {
	content: string;
	targetSection?: string;
	onSectionActive?: (sectionId: string) => void;
	onScroll?: (scroller: HTMLDivElement) => void;
	/** Custom element -> React component mapping (raw HTML in the markdown is parsed via rehype-raw,
	 *  so authored tags like `<tiling-card tiling="t1005">` can render live components). Keys are
	 *  lowercase tag names; cast custom (non-HTML) tag maps to `Components` at the call site. */
	components?: Components;
}

export function MarkdownRenderer({
	content,
	targetSection = "",
	onSectionActive,
	onScroll,
	components,
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
			className={cn("scrollbar-hide h-full w-full overflow-y-auto bg-surface", "markdown-content")}
		>
			{/* Phone: a 20px gutter and room under the last paragraph for the floating Contents pill. */}
			<div className="mx-auto max-w-[728px] px-6 py-6 text-base leading-[1.65] max-md:px-5 max-md:pb-28 md:py-10">
				<article
					className={cn(
						// Headings. h1 is the article title, once, at the top. Sections are separated by space alone.
						"[&_h1]:mt-0 [&_h1]:mb-4 [&_h1]:text-[36px] [&_h1]:leading-tight [&_h1]:font-[650] [&_h1]:tracking-[-0.02em] [&_h1]:text-balance [&_h1]:text-fg max-md:[&_h1]:text-[30px]",
						"[&_h2]:mt-12 [&_h2]:mb-3 [&_h2]:cursor-pointer [&_h2]:text-2xl [&_h2]:leading-snug [&_h2]:font-semibold [&_h2]:tracking-[-0.01em] [&_h2]:text-fg",
						"[&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:cursor-pointer [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-fg",
						"[&_h4]:mt-6 [&_h4]:mb-2 [&_h4]:cursor-pointer [&_h4]:text-base [&_h4]:font-semibold [&_h4]:text-fg",
						// Phone: a jump from the Contents sheet lands a heading clear of the reading-progress line.
						"max-md:[&_:is(h2,h3,h4)]:scroll-mt-4",
						// Body
						"[&_h1+p]:mb-6 [&_p]:mb-4 [&_p]:text-fg-secondary",
						"[&_ul]:mb-4 [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:text-fg-secondary",
						"[&_ol]:mb-4 [&_ol]:ml-6 [&_ol]:list-decimal [&_ol]:text-fg-secondary",
						"[&_li]:mb-2",
						"[&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-line-focus [&_blockquote]:pl-4 [&_blockquote]:text-fg-muted [&_blockquote]:italic",
						"[&_code]:rounded [&_code]:bg-surface-overlay [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_code]:text-fg",
						"[&_pre]:mb-6 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-line [&_pre]:bg-surface-overlay/50 [&_pre]:p-4",
						"[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-fg-secondary",
						"[&_a]:text-accent [&_a]:underline hover:[&_a]:text-accent",
						"[&_hr]:my-8 [&_hr]:border-line",
						"[&_img]:mx-auto [&_img]:mt-4 [&_img]:block [&_img]:h-auto [&_img]:w-1/3 [&_img]:max-w-full [&_img]:overflow-hidden [&_img]:rounded-lg [&_img]:border [&_img]:border-line [&_img]:bg-surface-overlay/30 max-md:[&_img]:w-full",
						// Tables
						"[&_table]:mb-6 [&_table]:w-full [&_table]:border-collapse [&_table]:bg-surface-overlay/20 max-md:[&_table]:mb-0 max-md:[&_table]:text-[15px]",
						"[&_th]:border [&_th]:border-line [&_th]:bg-surface-overlay [&_th]:p-2 [&_th]:text-left [&_th]:text-fg-secondary",
						"[&_td]:border [&_td]:border-line [&_td]:p-2 [&_td]:text-center [&_td]:align-middle [&_td]:text-fg-secondary",
						"[&_tr:nth-child(even)]:bg-surface-overlay/10 [&_tr:nth-child(odd)]:bg-surface-overlay/30",
						// KaTeX
						"[&_.katex]:text-[0.92em] [&_.katex]:leading-none [&_.katex]:text-fg-secondary [&_.katex-display]:my-6 [&_.katex-display]:overflow-x-auto [&_.katex-display]:px-2 max-md:[&_.katex-display]:overflow-y-hidden max-md:[&_.katex-display]:py-1",
					)}
				>
					<ReactMarkdown
						remarkPlugins={[remarkGfm, remarkMath]}
						rehypePlugins={[rehypeRaw, rehypeSlug, [rehypeKatex, { output: "html" }]]}
						components={{ ...BASE_COMPONENTS, ...components }}
					>
						{content}
					</ReactMarkdown>
				</article>
			</div>
		</div>
	);
}
