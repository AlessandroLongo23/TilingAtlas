"use client";

// The corner button between a shelf and its articles (lib/about-pages.ts): a book on the explorer,
// leading to the first article; a grid on an article, leading back. Styled as the fullscreen button beside
// it, so the corner reads as one set of controls. Renders nothing on a page with no article.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LayoutGrid } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { aboutAt, articleHref } from "@/lib/about-pages";
import { cn } from "@/lib/utils/cn";

export function AboutCornerButton({ className }: { className?: string }) {
	const pathname = usePathname();
	const at = aboutAt(pathname);
	if (!at) return null;
	const { section, reading } = at;
	const label = reading ? "Back to the explorer" : `About ${section.topic}`;
	const Icon = reading ? LayoutGrid : BookOpen;
	return (
		<Tooltip label={label} side="left" delay={0}>
			<Link
				href={reading ? section.section : articleHref(section, section.articles[0])}
				aria-label={label}
				className={cn(
					"ta-float flex items-center justify-center p-2 text-fg-secondary transition-colors hover:text-fg max-md:size-11",
					className,
				)}
			>
				<Icon size={16} />
			</Link>
		</Tooltip>
	);
}

/** The article page's corner: the same place the explorer keeps its controls. */
export function ArticleCorner() {
	return (
		<div className="absolute top-4 right-4 z-30 max-md:top-3 max-md:right-3">
			<AboutCornerButton />
		</div>
	);
}
