"use client";

// The page switcher at the top of a tool page's sidebar (the Play galleries and lookups that sit beside
// the articles under /play/about): a link back to the explorer, then the shelf's articles and tools, the
// current page highlighted.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { aboutAt, articleHref } from "@/lib/about-pages";
import { cn } from "@/lib/utils/cn";

export function ShelfArticleNav() {
	const pathname = usePathname();
	const at = aboutAt(pathname);
	if (!at) return null;
	const { section } = at;
	return (
		<div className="px-2 pt-4">
			<Link
				href={section.section}
				className="ta-label flex items-center gap-1.5 px-2 text-fg-muted transition-colors hover:text-fg max-md:min-h-11"
			>
				<ArrowLeft size={12} />
				Back to the explorer
			</Link>
			<nav className="flex flex-col gap-0.5 pt-5">
				<span className="ta-label px-2 pb-1 text-fg-muted">About {section.topic}</span>
				{section.articles.map((a) => {
					const href = articleHref(section, a);
					const active = pathname === href;
					return (
						<Link
							key={a.slug}
							href={href}
							aria-current={active ? "page" : undefined}
							className={cn(
								"px-2 py-1.5 text-[13px] leading-snug transition-colors max-md:flex max-md:min-h-11 max-md:items-center max-md:text-[15px]",
								active
									? "bg-surface-overlay font-medium text-fg"
									: "text-fg-secondary hover:bg-surface-overlay/60 hover:text-fg",
							)}
						>
							{a.title}
						</Link>
					);
				})}
			</nav>
		</div>
	);
}
