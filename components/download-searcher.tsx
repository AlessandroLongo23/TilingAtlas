"use client";

import { useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { AppleIcon, WindowsIcon } from "@/components/icons/os";
import { downloadUrl, OS_NAME, releasePage, type Os } from "@/lib/downloads";

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
 * shown only where there is an installer to give. `hero`: the landing page's button, with a line naming
 * the platform and a link to the others.
 */
export function DownloadSearcher({ variant }: { variant: "nav" | "hero" }) {
	const os = useOs();
	const url = os ? downloadUrl(os) : null;

	if (variant === "nav") {
		if (!os || !url) return null;
		return (
			<Tooltip label={`Download the Tiling Searcher for ${FOR[os]}`} side="left" delay={0}>
				<Button
					href={url}
					variant="secondary"
					size="sm"
					icon={ICON[os]}
					// the name only where the section links leave room for it; the icon and tooltip otherwise
					label={<span className="sr-only min-[1380px]:not-sr-only">The Tiling Searcher</span>}
					classes="mr-1.5"
				/>
			</Tooltip>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			<Button
				href={url ?? releasePage}
				variant="secondary"
				size="md"
				icon={os && url ? ICON[os] : Download}
				label={os && url ? `Download the Tiling Searcher for ${OS_NAME[os]}` : "Download the Tiling Searcher"}
				classes="w-fit max-md:w-full"
			/>
			<p className="max-w-md text-[13px] leading-snug text-fg-muted">
				Run your own searches: pick the tiles, choose k, and the desktop app finds every tiling.{" "}
				{os && url ? `For ${FOR[os]}. ` : "For macOS and Windows. "}
				<a href={releasePage} className="text-fg-secondary underline-offset-2 hover:text-fg hover:underline">
					All platforms
				</a>
			</p>
		</div>
	);
}
