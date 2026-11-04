import type { Metadata } from "next";
import { OS_NAME, platforms, type Os } from "@/lib/downloads";
import { DownloadScreen } from "./_screen";

// Where the atlas's download buttons go (components/download-searcher.tsx). The page starts the download
// itself, so each download started from the site is a page view in Vercel Web Analytics. Downloads from
// other links show only in GitHub's counts (node tools/searcher/release.mjs).
export const dynamicParams = false;
export const generateStaticParams = () => platforms().map((os) => ({ os }));

type Props = { params: Promise<{ os: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const os = (await params).os as Os;
	// a page that starts a download has nothing for a search engine
	return { title: `The Tiling Searcher for ${OS_NAME[os]} · The Tiling Atlas`, robots: { index: false } };
}

export default async function DownloadPage({ params }: Props) {
	return <DownloadScreen os={(await params).os as Os} />;
}
