"use client";

import { useEffect, useState } from "react";
import { Check, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppleIcon, WindowsIcon } from "@/components/icons/os";
import { downloadUrl, OS_NAME, releasePage, type Os } from "@/lib/downloads";
import { cn } from "@/lib/utils/cn";

// The Tiling Searcher's download page: what the app is, the download (started for you), and the three steps
// of a first launch. It used to be the error screen's specimen wall with a message in the middle, and read
// as an error.

const ICON: Record<Os, typeof AppleIcon> = { mac: AppleIcon, windows: WindowsIcon };
const FOR: Record<Os, string> = { mac: "macOS on Apple silicon", windows: "Windows, 64-bit" };

// The app is not signed with an Apple or Microsoft certificate yet, so the first launch asks for a click.
const STEPS: Record<Os, { title: string; body: string }[]> = {
	mac: [
		{ title: "Move it to Applications", body: "Unzip the download and drag The Tiling Searcher into Applications." },
		{
			title: "Allow it once",
			body: "It isn't signed yet, so macOS stops the first launch. Open System Settings → Privacy & Security and click Open Anyway.",
		},
	],
	windows: [
		{ title: "Run the installer", body: "Choose where to install it, or keep the default." },
		{
			title: "Allow it once",
			body: "It isn't signed yet, so Windows says it protected your PC. Click More info, then Run anyway.",
		},
	],
};
const FROM_THE_ATLAS = {
	title: "Bring a board from the atlas",
	body: "Every shelf of the catalogue has Open in the Searcher: the app opens with that board set up, ready to run.",
};

export function DownloadScreen({ os, version }: { os: Os; version: string }) {
	const url = downloadUrl(os)!;
	const [started, setStarted] = useState(false);
	useEffect(() => {
		// a moment's wait, so the page is read before the browser's download prompt covers it
		const t = setTimeout(() => {
			window.location.assign(url);
			setStarted(true);
		}, 600);
		return () => clearTimeout(t);
	}, [url]);
	const Icon = ICON[os];

	return (
		<main className="min-h-0 flex-1 overflow-y-auto">
			<div className="mx-auto max-w-6xl px-6 py-14 max-md:px-4 max-md:py-8">
				<section className="grid items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
					<div>
						<p className="ta-label">Download</p>
						<h1 className="mt-3 text-[40px] leading-[1.05] font-semibold tracking-[-0.025em] text-balance max-md:text-[32px]">
							The Tiling Searcher
						</h1>
						<p className="mt-4 max-w-md text-[15px] leading-relaxed text-fg-secondary">
							Find tilings on your own computer. Build a board of tiles, choose k, and the engine that fills this atlas
							enumerates every tiling the board allows, or proves that one exists.
						</p>
						<div className="mt-8 flex flex-wrap items-center gap-3">
							<Button href={url} variant="primary" size="md" icon={Icon} label={`Download for ${OS_NAME[os]}`} />
							<Button href={releasePage} variant="secondary" size="md" icon={ExternalLink} label="Other platforms" />
						</div>
						<p className="mt-4 flex items-center gap-1.5 text-[13px] text-fg-muted" aria-live="polite">
							{started ? (
								<>
									<Check size={14} className="text-success" aria-hidden />
									Your download has started.{" "}
									<a href={url} className="text-fg-secondary underline-offset-2 hover:text-fg hover:underline">
										Start it again
									</a>
								</>
							) : (
								<>
									<Download size={14} aria-hidden />
									Your download starts in a moment.
								</>
							)}
						</p>
						<p className="mt-6 font-mono text-[11px] text-fg-muted">
							Version {version} · {FOR[os]} · free
						</p>
					</div>
					<figure className="overflow-hidden rounded-xl border border-line bg-surface-raised shadow-lg">
						{/* A board in the app, the hyperbolic hybrid example, in the theme the page is in. Fixed 70 KB
						    WebPs (public/searcher), so there is nothing for next/image to resize. */}
						{(["board", "board-dark"] as const).map((file) => (
							// eslint-disable-next-line @next/next/no-img-element
							<img
								key={file}
								src={`/searcher/${file}.webp`}
								width={1800}
								height={1059}
								alt="The Tiling Searcher's board editor: corners, three faces and the vertex figures they make"
								className={cn("h-auto w-full", file === "board" ? "block dark:hidden" : "hidden dark:block")}
							/>
						))}
					</figure>
				</section>

				<section className="mt-16 border-t border-line-subtle pt-10">
					<h2 className="text-lg font-semibold tracking-tight">The first launch</h2>
					<ol className="mt-6 grid gap-4 md:grid-cols-3">
						{[...STEPS[os], FROM_THE_ATLAS].map((s, i) => (
							<li key={s.title} className="rounded-surface border border-line-subtle bg-surface-raised p-5">
								<span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-sunken font-mono text-xs text-fg-secondary">
									{i + 1}
								</span>
								<h3 className="mt-4 text-[15px] font-medium text-fg">{s.title}</h3>
								<p className="mt-1.5 text-[13px] leading-relaxed text-fg-secondary">{s.body}</p>
							</li>
						))}
					</ol>
				</section>
			</div>
		</main>
	);
}
