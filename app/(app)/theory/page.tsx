import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { THEORY_GROUPS } from "@/lib/theory/articles";

export const dynamic = "force-static";

// The theory index: the pieces (Elements — prototiles, vertex configurations) and the background
// reading (Articles), each linking to its own /theory/<slug> page. The two groups are data
// (lib/theory/articles.ts), so these grids and the in-page sidebar switcher stay in sync.
export default function TheoryIndexPage() {
	return (
		<div className="h-full w-full overflow-y-auto">
			<div className="mx-auto max-w-4xl px-6 py-10">
				<header className="mb-8 flex items-start gap-3">
					<BookOpen className="mt-1 shrink-0 text-fg-muted" size={22} />
					<div>
						<h1 className="text-2xl font-semibold text-fg">Theory</h1>
						<p className="mt-1 max-w-2xl text-sm text-fg-muted">
							The pieces the atlas is built from, and the mathematics behind them: browsable
							catalogues of the tiles and their vertex configurations, then background reading with
							worked examples and interactive previews.
						</p>
					</div>
				</header>

				{THEORY_GROUPS.map((group) => (
					<section key={group.id} className="mb-10 last:mb-0">
						<h2 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-fg-muted">
							{group.label}
						</h2>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							{group.items.map((a) => (
								<Link
									key={a.slug}
									href={`/theory/${a.slug}`}
									className="group flex flex-col rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent hover:bg-surface-overlay/40"
								>
									<div className="flex items-start justify-between gap-2">
										<h3 className="text-base font-semibold text-fg">{a.title}</h3>
										<ArrowRight
											size={16}
											className="mt-1 shrink-0 text-fg-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
										/>
									</div>
									<p className="mt-2 text-sm leading-relaxed text-fg-muted">{a.blurb}</p>
								</Link>
							))}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}
