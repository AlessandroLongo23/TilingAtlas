// One route module per shelf (app/(app)/<shelf>/about/[[...slug]]/page.tsx) re-exports this: `/x/about`
// is the shelf's first article, `/x/about/<slug>` the others. An article whose folder is a real one (it
// holds a sub-route) re-exports `aboutArticleRoute` from its own page.tsx instead.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ABOUT } from "@/lib/about-pages";
import { loadAbout } from "@/lib/about/load";
import { AboutArticlePage } from "@/components/about/about-article";

type Props = { params: Promise<{ slug?: string[] }> };

export function aboutRoute(path: string) {
	const section = ABOUT.find((s) => s.section === path);
	if (!section) throw new Error(`No articles registered for ${path} in lib/about-pages.ts`);
	const articles = section.articles.filter((a, i) => a.file && (!a.own || i === 0));
	const find = (slug?: string[]) =>
		!slug?.length
			? articles[0]
			: slug.length === 1
				? articles.find((a) => a.slug === slug[0] && a !== articles[0])
				: undefined;
	return {
		generateStaticParams: () => articles.map((a, i) => ({ slug: i ? [a.slug] : [] })),
		generateMetadata: async ({ params }: Props): Promise<Metadata> => ({ title: find((await params).slug)?.title }),
		Page: async ({ params }: Props) => {
			const article = find((await params).slug);
			if (!article?.file) notFound();
			return <AboutArticlePage section={section} article={article} data={await loadAbout(article.file)} />;
		},
	};
}

/** One article on a route of its own: the folder also holds a sub-route, so the catch-all cannot serve it. */
export function aboutArticleRoute(path: string, slug: string) {
	const section = ABOUT.find((s) => s.section === path);
	const article = section?.articles.find((a) => a.slug === slug);
	if (!section || !article?.file) throw new Error(`No article ${path}/about/${slug} in lib/about-pages.ts`);
	const file = article.file;
	return {
		metadata: { title: article.title } satisfies Metadata,
		Page: async () => <AboutArticlePage section={section} article={article} data={await loadAbout(file)} />,
	};
}
