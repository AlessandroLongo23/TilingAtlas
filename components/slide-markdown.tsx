"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils/cn";

interface SlideMarkdownProps {
	content: string;
	components?: Components;
	/** Overview thumbnails render the same markdown at a fraction of the size. */
	compact?: boolean;
}

// Same plugin stack as the theory renderer (so `<tiling-card>`, KaTeX and GFM tables all behave
// identically), but presentation typography instead of article typography. Sizes are viewport-
// relative via clamp() rather than fixed, because the projector in the room is an unknown: the
// deck has to read at 1280x720 and at 3840x2160 without a per-venue pass.
export function SlideMarkdown({ content, components, compact = false }: SlideMarkdownProps) {
	return (
		<div
			className={cn(
				"slide-markdown w-full",
				compact
					? [
							"[&_h1]:text-[0.95rem] [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:mb-1",
							"[&_h2]:text-[0.8rem] [&_h2]:font-semibold [&_h2]:mb-1",
							"[&_h3]:text-[0.7rem] [&_h3]:font-semibold [&_h3]:mb-1",
							"[&_p]:text-[0.6rem] [&_p]:leading-snug [&_p]:mb-1 [&_p]:text-fg-muted",
							"[&_ul]:text-[0.6rem] [&_ol]:text-[0.6rem] [&_li]:mb-0.5",
							"[&_table]:text-[0.5rem]",
							"[&_img]:max-h-16",
						]
					: [
							// Headings
							"[&_h1]:text-[clamp(2rem,4.4vh+1.4vw,4.25rem)] [&_h1]:font-bold [&_h1]:tracking-tight",
							"[&_h1]:text-fg [&_h1]:leading-[1.08] [&_h1]:mb-[0.5em] [&_h1]:text-balance",
							"[&_h2]:text-[clamp(1.4rem,2.8vh+0.9vw,2.6rem)] [&_h2]:font-bold [&_h2]:tracking-tight",
							"[&_h2]:text-fg [&_h2]:leading-[1.15] [&_h2]:mb-[0.6em] [&_h2]:text-balance",
							"[&_h3]:text-[clamp(1.05rem,1.7vh+0.6vw,1.6rem)] [&_h3]:font-semibold [&_h3]:text-fg",
							"[&_h3]:mb-[0.5em] [&_h3]:mt-[1em]",
							// Body. No measure cap: a slide is read at a distance in two or three lines, so the
							// usual 60-character limit only forces a line the column had room for. The pull quote
							// below keeps its cap, since that one is meant to sit narrow.
							"[&_p]:text-[clamp(0.95rem,1.5vh+0.45vw,1.5rem)] [&_p]:leading-[1.5]",
							"[&_p]:text-fg-secondary [&_p]:mb-[0.85em]",
							"[&_strong]:text-fg [&_strong]:font-semibold",
							"[&_em]:italic",
							// Lists: the workhorse of a slide, so they get the same size as body text
							"[&_ul]:list-disc [&_ul]:ml-[1.1em] [&_ul]:mb-[0.85em]",
							"[&_ol]:list-decimal [&_ol]:ml-[1.2em] [&_ol]:mb-[0.85em]",
							"[&_li]:text-[clamp(0.95rem,1.5vh+0.45vw,1.5rem)] [&_li]:leading-[1.45]",
							"[&_li]:text-fg-secondary [&_li]:mb-[0.4em]",
							"[&_li_strong]:text-fg",
							"[&_li::marker]:text-fg-muted",
							// Quotes carry the memorable lines, so they read larger, not smaller
							"[&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-[0.8em]",
							"[&_blockquote]:my-[0.9em] [&_blockquote]:not-italic",
							"[&_blockquote_p]:text-[clamp(1.1rem,2vh+0.6vw,1.85rem)] [&_blockquote_p]:text-fg",
							"[&_blockquote_p]:leading-[1.35] [&_blockquote_p]:max-w-[38ch]",
							// Code
							"[&_code]:font-mono [&_code]:text-[0.85em] [&_code]:bg-surface-overlay",
							"[&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-accent",
							"[&_pre]:bg-surface-overlay/50 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto",
							"[&_pre]:mb-[0.85em] [&_pre]:border [&_pre]:border-line",
							"[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-fg-secondary",
							// Tables: counts, obligations, timings
							"[&_table]:w-full [&_table]:border-collapse [&_table]:my-[0.8em]",
							"[&_table]:text-[clamp(0.75rem,1.15vh+0.35vw,1.05rem)]",
							"[&_th]:bg-surface-overlay [&_th]:text-left [&_th]:px-3 [&_th]:py-1.5",
							"[&_th]:text-fg [&_th]:font-semibold [&_th]:border [&_th]:border-line",
							"[&_td]:px-3 [&_td]:py-1.5 [&_td]:border [&_td]:border-line [&_td]:text-fg-secondary",
							"[&_tr:nth-child(even)]:bg-surface-overlay/20",
							// Figures
							// Figures come from the thesis TikZ on white; the white plate keeps them legible if
							// the deck is ever shown in dark mode.
							"[&_img]:mx-auto [&_img]:block [&_img]:max-h-[46vh] [&_img]:w-auto [&_img]:rounded-lg",
							"[&_img]:bg-white [&_img]:p-3",
							"[&_a]:text-accent [&_a]:underline",
						],
				// KaTeX inherits slide type rather than shrinking to article size
				"[&_.katex]:text-[1.02em] [&_.katex-display]:my-[0.7em] [&_.katex-display]:overflow-x-auto",
			)}
		>
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkMath]}
				rehypePlugins={[rehypeRaw, [rehypeKatex, { output: "html" }]]}
				components={components}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
}
