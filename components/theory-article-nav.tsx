"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { THEORY_GROUPS } from "@/lib/theory/articles";
import { cn } from "@/lib/utils/cn";

// The page switcher at the top of every theory page's sidebar: a link back to the /theory index plus
// both groups (Elements, Articles), the current page highlighted. This is what makes the theory pages
// a connected library, not a set of orphan routes.
export function TheoryArticleNav({ currentSlug }: { currentSlug: string }) {
	return (
		<div className="px-2 pt-4">
			<Link
				href="/theory"
				className="flex items-center gap-1.5 px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-fg-muted transition-colors hover:text-fg"
			>
				<ArrowLeft size={12} />
				Theory
			</Link>
			{THEORY_GROUPS.map((group) => (
				<nav key={group.id} className="flex flex-col gap-0.5 pb-2 last:pb-0">
					<span className="px-2 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-disabled">
						{group.label}
					</span>
					{group.items.map((a) => {
						const active = a.slug === currentSlug;
						return (
							<Link
								key={a.slug}
								href={`/theory/${a.slug}`}
								aria-current={active ? "page" : undefined}
								className={cn(
									"rounded-control px-2 py-1.5 text-xs leading-snug transition-colors",
									active
										? "bg-accent-subtle font-medium text-accent"
										: "text-fg-secondary hover:bg-surface-overlay/60 hover:text-fg",
								)}
							>
								{a.title}
							</Link>
						);
					})}
				</nav>
			))}
		</div>
	);
}
