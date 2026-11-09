"use client";

import { cn } from "@/lib/utils/cn";
import { CLASSIFICATION_BY_SLUG, classificationList } from "@/lib/classifications";

// A classification's definition in the catalogue grid (lib/classifications.ts), under the page title that
// already names it: what the property is, as a quotation, then the count's history and its credits.

export function ClassificationDefinition({ slug, className }: { slug: string; className?: string }) {
	const c = CLASSIFICATION_BY_SLUG.get(slug);
	if (!c) return null;
	const missing = classificationList(slug)?.filter((m) => !m.id) ?? [];
	const [before, after = ""] = c.history.split("{source}");
	return (
		<figure className={cn("ta-quote flex flex-col gap-2", className)}>
			<blockquote className="text-body">“{c.definition}”</blockquote>
			<figcaption className="text-small text-fg-muted">
				{before}
				<a href={c.source.url} target="_blank" rel="noreferrer" className="ta-link-quiet">
					{c.source.text}
				</a>
				{after}
				{missing.length ? (
					<>
						{" "}
						Not in the Atlas yet ({missing.length}):{" "}
						<span className="font-mono">{missing.map((m) => `#${m.ref} (e = ${m.e})`).join(", ")}</span>
					</>
				) : null}
			</figcaption>
		</figure>
	);
}
