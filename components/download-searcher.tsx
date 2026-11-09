"use client";

import { useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { Button } from "@/design-system/components/button";
import { Tooltip } from "@/design-system/components/tooltip";
import { AppleIcon, WindowsIcon } from "@/components/icons/os";
import { downloadPage, OS_NAME, releasePage, type Os } from "@/lib/downloads";

/** The visitor's desktop OS, or null for anything the Tiling Searcher does not run on (a phone, a tablet, Linux). */
function detect(): Os | null {
	const nav = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } };
	if (nav.userAgentData?.mobile) return null;
	const p = (nav.userAgentData?.platform || nav.platform || nav.userAgent).toLowerCase();
	if (p.includes("win")) return "windows";
	// an iPad asks for the desktop site and reports itself as a Mac; its touch points give it away
	if (p.includes("mac") && nav.maxTouchPoints <= 1) return "mac";
	return null;
}

const noop = () => () => {};
/** Null on the server and in the first client render, so hydration matches; the OS after that. */
const useOs = () => useSyncExternalStore(noop, detect, () => null);

const ICON: Record<Os, typeof AppleIcon> = { mac: AppleIcon, windows: WindowsIcon };
const FOR: Record<Os, string> = { mac: "macOS (Apple silicon)", windows: "Windows" };

/**
 * The Tiling Searcher's download, for the visitor's OS. `nav`: a compact button for the header's right corner,
 * shown only where there is an installer to give. `hero`: the landing page's button, beside "Start exploring" in
 * its row, and under the row a line naming the platform with a link to the others.
 */
export function DownloadSearcher({ variant }: { variant: "nav" | "hero" }) {
	const os = useOs();
	// the atlas page that starts the download, so Web Analytics counts it (lib/downloads.ts)
	const url = os ? downloadPage(os) : null;

	if (variant === "nav") {
		if (!os || !url) return null;
		return (
			<Tooltip label={`Download the Tiling Searcher for ${FOR[os]}`} side="left" delay="instant">
				<Button
					href={url}
					// The page only starts a download: prefetching it bought nothing and cost every page seven requests.
					prefetch={false}
					variant="secondary"
					size="sm"
					icon={ICON[os]}
					// the name only where the section links leave room for it; the icon and tooltip otherwise.
					// ds-check: keep (1380px is where the nav measured room for the name, between xl and 2xl)
					label={<span className="sr-only min-[1380px]:not-sr-only">The Tiling Searcher</span>}
					className="mr-1.5"
				/>
			</Tooltip>
		);
	}

	// A fragment: the button joins the hero's row of actions, and the line takes a row of its own under them.
	return (
		<>
			<Button
				href={url ?? releasePage}
				prefetch={false}
				variant="secondary"
				size="md"
				icon={os && url ? ICON[os] : Download}
				label={os && url ? `Download the Tiling Searcher for ${OS_NAME[os]}` : "Download the Tiling Searcher"}
				className="max-md:w-full"
			/>
			<p className="max-w-md basis-full text-ui leading-tight text-fg-muted">
				Run your own searches: pick the tiles, choose k, and the desktop app finds every tiling.{" "}
				{os && url ? `For ${FOR[os]}. ` : "For macOS and Windows. "}
				<a href={releasePage} className="ta-link-quiet">
					All platforms
				</a>
			</p>
		</>
	);
}
