"use client";

import { useEffect } from "react";
import { Download, ExternalLink, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorScreen } from "@/components/error-screen";
import { downloadUrl, OS_NAME, releasePage, type Os } from "@/lib/downloads";

// The app is not signed with an Apple or Microsoft certificate yet, so the first launch asks for a click.
const FIRST_LAUNCH: Record<Os, string> = {
	mac: "For Macs with Apple silicon: unzip it and move it to Applications. It isn't signed yet, so the first time, open System Settings → Privacy & Security and click Open Anyway.",
	windows: "It isn't signed yet, so when Windows says it protected your PC, click More info, then Run anyway.",
};

/** Starts the download, says what the first launch asks, and offers the download again. */
export function DownloadScreen({ os }: { os: Os }) {
	const url = downloadUrl(os)!;
	useEffect(() => {
		// a moment's wait, so the page is read before the browser's download prompt covers it
		const t = setTimeout(() => window.location.assign(url), 600);
		return () => clearTimeout(t);
	}, [url]);

	return (
		<ErrorScreen
			eyebrow="download"
			title={`The Tiling Searcher for ${OS_NAME[os]}`}
			body={`Your download starts in a moment. ${FIRST_LAUNCH[os]}`}
			detail={<p>{url.split("/").pop()}</p>}
			actions={
				<>
					<Button href={url} variant="primary" size="sm" icon={Download} label="Download" />
					<Button href={releasePage} variant="secondary" size="sm" icon={ExternalLink} label="All platforms" />
					<Button href="/" variant="secondary" size="sm" icon={Home} label="Back to the atlas" />
				</>
			}
		/>
	);
}
