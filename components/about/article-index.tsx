"use client";

// The article's left margin: its shelf's articles, the one being read opened into its sections, the
// section being read inked on a thin rule. The sections are read off the rendered h2s, so the anchors
// are exactly the renderer's own. It shows only when the article's box (a container query, not the
// viewport) leaves a margin wide enough; below that, ArticleSiblings carries the shelf's other
// articles at the top of the text, and the sections go unlisted.

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";
import { articleHref, type AboutArticle, type AboutSection } from "@/lib/about-pages";
import { cn } from "@/lib/utils/cn";

const entry = (on: boolean) =>
	cn(
		"-ml-px block border-l py-1.5 pl-3.5 text-[13px] leading-snug transition-colors",
		on ? "border-fg font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg",
	);

export function ArticleIndex({
	root,
	active,
	content,
	section,
	article,
}: {
	/** The element the article renders into; its h2s are the entries. */
	root: RefObject<HTMLElement | null>;
	/** The section being read, from the renderer's scroll tracking. */
	active: string;
	/** The article source: re-read the headings when it changes. */
	content: string;
	section: AboutSection;
	article: AboutArticle;
}) {
	const [items, setItems] = useState<{ id: string; title: string }[]>([]);
	useEffect(() => {
		const hs = root.current?.querySelectorAll<HTMLElement>(".markdown-content h2") ?? [];
		// eslint-disable-next-line react-hooks/set-state-in-effect -- the headings exist only once the markdown has rendered
		setItems([...hs].filter((h) => h.id).map((h) => ({ id: h.id, title: h.textContent ?? "" })));
	}, [root, content]);

	const go = (id: string) =>
		root.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

	const current = items.some((i) => i.id === active) ? active : items[0]?.id;
	// A long article's index scrolls on its own; keep the section being read inside it.
	const nav = useRef<HTMLElement>(null);
	useEffect(() => {
		const el = nav.current;
		const on = el?.querySelector<HTMLElement>('[aria-current="location"]');
		if (!el || !on) return;
		const top = on.offsetTop; // the nav is positioned, so this is already relative to it
		if (top < el.scrollTop || top + on.offsetHeight > el.scrollTop + el.clientHeight)
			el.scrollTo({ top: top - el.clientHeight / 3, behavior: "smooth" });
	}, [current]);
	const sections = (
		<ol className="border-l border-line-subtle">
			{items.map((it) => (
				<li key={it.id}>
					<a
						href={`#${it.id}`}
						onClick={(e) => {
							e.preventDefault();
							go(it.id);
						}}
						aria-current={it.id === current ? "location" : undefined}
						className={entry(it.id === current)}
					>
						{it.title}
					</a>
				</li>
			))}
		</ol>
	);
	const many = section.articles.length > 1;
	return (
		<nav
			ref={nav}
			aria-label="On this page"
			className="absolute top-24 left-8 z-10 hidden max-h-[calc(100%-8rem)] w-56 overflow-y-auto overscroll-contain pr-2 @7xl:block"
		>
			<p className="ta-label mb-3 text-fg-muted">{many ? `About ${section.topic}` : "On this page"}</p>
			{many ? (
				<ul className="flex flex-col gap-1">
					{section.articles.map((a) => (
						<li key={a.slug}>
							<Link
								href={articleHref(section, a)}
								aria-current={a === article ? "page" : undefined}
								className={cn(
									"block py-1 text-[13px] leading-snug transition-colors",
									a === article ? "font-medium text-fg" : "text-fg-muted hover:text-fg",
								)}
							>
								{a.title}
							</Link>
							{a === article && <div className="mt-1 mb-2">{sections}</div>}
						</li>
					))}
				</ul>
			) : (
				sections
			)}
		</nav>
	);
}

/** The shelf's articles as a row of links above the text, where the margin has no room for the index. */
export function ArticleSiblings({ section, article }: { section: AboutSection; article: AboutArticle }) {
	if (section.articles.length < 2) return null;
	return (
		<nav aria-label={`About ${section.topic}`} className="not-prose mb-8 max-md:pr-14 @7xl:hidden">
			<p className="ta-label mb-2 text-fg-muted">About {section.topic}</p>
			<ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] max-md:text-sm">
				{section.articles.map((a) => (
					<li key={a.slug}>
						<Link
							href={articleHref(section, a)}
							aria-current={a === article ? "page" : undefined}
							className={cn(
								"border-b transition-colors",
								a === article
									? "border-fg font-medium text-fg"
									: "border-transparent text-fg-muted no-underline hover:text-fg",
							)}
						>
							{a.title}
						</Link>
					</li>
				))}
			</ul>
		</nav>
	);
}
