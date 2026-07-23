import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { THEORY_ARTICLES } from "@/lib/theory/articles";

export const dynamic = "force-static";

// The theory index: a small library of background articles, each linking to its own /theory/<slug>
// page. The article list is data (lib/theory/articles.ts), so this grid and the in-article sidebar
// switcher stay in sync automatically.
export default function TheoryIndexPage() {
	return (
		<div className="h-full w-full overflow-y-auto">
			<div className="mx-auto max-w-4xl px-6 py-10">
				<header className="mb-8 flex items-start gap-3">
					<BookOpen className="mt-1 shrink-0 text-fg-muted" size={22} />
					<div>
						<h1 className="text-2xl font-semibold text-fg">Theory</h1>
						<p className="mt-1 max-w-2xl text-sm text-fg-muted">
							Background reading for the atlas: the mathematics behind the tilings, each with worked
							examples and interactive previews.
						</p>
					</div>
				</header>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{THEORY_ARTICLES.map((a) => (
						<Link
							key={a.slug}
							href={`/theory/${a.slug}`}
							className="group flex flex-col rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent hover:bg-surface-overlay/40"
						>
							<div className="flex items-start justify-between gap-2">
								<h2 className="text-base font-semibold text-fg">{a.title}</h2>
								<ArrowRight
									size={16}
									className="mt-1 shrink-0 text-fg-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
								/>
							</div>
							<p className="mt-2 text-sm leading-relaxed text-fg-muted">{a.blurb}</p>
						</Link>
					))}
				</div>
			</div>
		</div>
	);
}
