import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { THEORY_GROUPS } from "@/lib/theory/articles";

export const dynamic = "force-static";

// The theory index: the pieces (Elements: prototiles, vertex configurations) and the background
// reading (Articles), each linking to its own /theory/<slug> page. The two groups are data
// (lib/theory/articles.ts), so these grids and the in-page sidebar switcher stay in sync.
export default function TheoryIndexPage() {
	return (
		<div className="h-full w-full overflow-y-auto bg-surface">
			<div className="mx-auto max-w-4xl px-6 py-10">
				<header className="mb-8">
					<h1 className="text-2xl font-semibold text-fg">Theory</h1>
					<p className="mt-1 max-w-[640px] text-sm text-fg-muted">
						The pieces the atlas is built from, and the mathematics behind them: browsable
						catalogues of the tiles and their vertex configurations, then background reading with
						worked examples and interactive previews.
					</p>
				</header>

				{THEORY_GROUPS.map((group) => (
					<section key={group.id} className="mb-10 last:mb-0">
						<h2 className="ta-label mb-3 text-fg-muted">
							{group.label}
						</h2>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							{group.items.map((a) => (
								<Link
									key={a.slug}
									href={`/theory/${a.slug}`}
									className="group flex flex-col rounded-surface bg-surface-raised p-5 ring-1 ring-line-subtle transition-shadow hover:ring-line"
								>
									<div className="flex items-center justify-between gap-2">
										<h3 className="truncate text-base font-semibold leading-snug text-fg" title={a.title}>{a.title}</h3>
										<ArrowRight
											size={16}
											className="shrink-0 text-fg-muted opacity-60 transition group-hover:translate-x-0.5 group-hover:text-accent group-hover:opacity-100"
										/>
									</div>
									<p className="mt-2 line-clamp-2 text-sm leading-relaxed text-fg-muted">{a.blurb}</p>
								</Link>
							))}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}
