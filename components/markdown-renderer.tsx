"use client";

import { useEffect, useRef, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils/cn";

interface MarkdownRendererProps {
	content: string;
	targetSection?: string;
	onSectionActive?: (sectionId: string) => void;
	onScrollProgress?: (progress: number) => void;
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^\w-]+/g, "");
}

function headingWithId(level: 2 | 3 | 4) {
	const Tag = `h${level}` as const;
	const Heading = ({ children }: { children?: ReactNode }) => {
		const text = getText(children);
		const id = slugify(text);
		return <Tag id={id}>{children}</Tag>;
	};
	Heading.displayName = `Heading${level}`;
	return Heading;
}

function getText(node: ReactNode): string {
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(getText).join("");
	if (node && typeof node === "object" && "props" in node) {
		// @ts-expect-error — ReactElement children walk
		return getText(node.props?.children);
	}
	return "";
}

const COMPONENTS: Components = {
	h2: headingWithId(2),
	h3: headingWithId(3),
	h4: headingWithId(4),
};

export function MarkdownRenderer({
	content,
	targetSection = "",
	onSectionActive,
	onScrollProgress,
}: MarkdownRendererProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const activeSectionRef = useRef("");

	// Scroll to targetSection when it changes.
	useEffect(() => {
		if (!targetSection || !containerRef.current) return;
		const el = containerRef.current.querySelector<HTMLElement>(`#${CSS.escape(targetSection)}`);
		if (el) {
			el.scrollIntoView({ behavior: "smooth", block: "start" });
			activeSectionRef.current = targetSection;
			onSectionActive?.(targetSection);
		}
	}, [targetSection, onSectionActive]);

	// Scroll tracking: active section + progress.
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const onScroll = () => {
			const scrollHeight = container.scrollHeight - container.clientHeight;
			const progress = scrollHeight > 0 ? (container.scrollTop / scrollHeight) * 100 : 0;
			onScrollProgress?.(progress);

			const headings = container.querySelectorAll<HTMLElement>("h2, h3, h4");
			for (let i = headings.length - 1; i >= 0; i--) {
				const heading = headings[i];
				if (container.scrollTop >= heading.offsetTop - 100) {
					const next = heading.id;
					if (activeSectionRef.current !== next) {
						activeSectionRef.current = next;
						onSectionActive?.(next);
					}
					break;
				}
			}
		};
		container.addEventListener("scroll", onScroll, { passive: true });
		return () => container.removeEventListener("scroll", onScroll);
	}, [onSectionActive, onScrollProgress]);

	// Click-to-scroll on h2/h3/h4 (source behavior).
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const onClick = (e: MouseEvent) => {
			const target = (e.target as HTMLElement | null)?.closest("h2, h3, h4") as HTMLElement | null;
			if (target?.id) {
				target.scrollIntoView({ behavior: "smooth", block: "start" });
				activeSectionRef.current = target.id;
				onSectionActive?.(target.id);
			}
		};
		container.addEventListener("click", onClick);
		return () => container.removeEventListener("click", onClick);
	}, [onSectionActive]);

	return (
		<div
			ref={containerRef}
			className={cn(
				"w-full h-full overflow-y-auto bg-zinc-900 scrollbar-hide",
				"markdown-content",
			)}
		>
			<div className="max-w-4xl mx-auto px-6 md:px-10 py-6 md:py-8">
				<article
					className={cn(
						// Headings
						"[&_h2]:text-4xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mb-10 [&_h2]:mt-24 [&_h2]:pb-4 [&_h2]:border-b [&_h2]:border-green-400/80 [&_h2]:cursor-pointer",
						"[&_h3]:text-2xl [&_h3]:font-semibold [&_h3]:text-white [&_h3]:mb-4 [&_h3]:mt-16 [&_h3]:cursor-pointer",
						"[&_h4]:text-xl [&_h4]:font-medium [&_h4]:text-white [&_h4]:mb-3 [&_h4]:mt-8 [&_h4]:cursor-pointer",
						// Body
						"[&_p]:text-zinc-400 [&_p]:mb-6",
						"[&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-6 [&_ul]:text-zinc-300",
						"[&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-6 [&_ol]:text-zinc-300",
						"[&_li]:mb-2",
						"[&_blockquote]:border-l-4 [&_blockquote]:border-green-500/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-zinc-400 [&_blockquote]:my-4",
						"[&_code]:font-mono [&_code]:text-sm [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-green-400",
						"[&_pre]:bg-zinc-800/50 [&_pre]:p-4 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_pre]:mb-6 [&_pre]:border [&_pre]:border-zinc-700/30",
						"[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-zinc-300",
						"[&_a]:text-green-400 hover:[&_a]:text-green-300 [&_a]:underline",
						"[&_hr]:my-8 [&_hr]:border-zinc-700/50",
						"[&_img]:mt-4 [&_img]:rounded-lg [&_img]:overflow-hidden [&_img]:border [&_img]:border-zinc-700/50 [&_img]:bg-zinc-800/30 [&_img]:max-w-full [&_img]:h-auto [&_img]:mx-auto [&_img]:block [&_img]:w-1/3",
						// Tables
						"[&_table]:w-full [&_table]:border-collapse [&_table]:mb-6 [&_table]:bg-zinc-800/20",
						"[&_th]:bg-zinc-800 [&_th]:text-left [&_th]:p-2 [&_th]:text-zinc-200 [&_th]:border [&_th]:border-zinc-700/50",
						"[&_td]:p-2 [&_td]:border [&_td]:border-zinc-700/50 [&_td]:text-zinc-300 [&_td]:text-center [&_td]:align-middle",
						"[&_tr:nth-child(odd)]:bg-zinc-800/30 [&_tr:nth-child(even)]:bg-zinc-800/10",
						// KaTeX
						"[&_.katex]:text-zinc-200 [&_.katex-display]:overflow-x-auto [&_.katex-display]:my-6 [&_.katex-display]:px-2",
					)}
				>
					<ReactMarkdown
						remarkPlugins={[remarkGfm, remarkMath]}
						rehypePlugins={[rehypeRaw, rehypeKatex]}
						components={COMPONENTS}
					>
						{content}
					</ReactMarkdown>
				</article>
			</div>
		</div>
	);
}
