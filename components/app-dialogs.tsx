"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useExportImage } from "@/stores/exportImage";
import { useScreenshotPreview } from "@/stores/screenshotPreview";

// The shell's two capture dialogs, fetched the first time one opens. They carry the capture, SVG and
// upload code, which every page of the app paid for on arrival when they were imported here directly.
// Once open they stay mounted, so closing plays the dialog's exit motion.
const ExportImageModal = dynamic(() => import("@/components/export-image-modal").then((m) => m.ExportImageModal), {
	ssr: false,
});
const ScreenshotPreviewModal = dynamic(
	() => import("@/components/screenshot-preview-modal").then((m) => m.ScreenshotPreviewModal),
	{ ssr: false },
);

/** True from the first render where `now` is true, for good. */
function useLatch(now: boolean) {
	const [latched, setLatched] = useState(false);
	if (now && !latched) setLatched(true);
	return now || latched;
}

export function AppDialogs() {
	const exportOpened = useLatch(useExportImage((s) => s.isOpen));
	const screenshotOpened = useLatch(useScreenshotPreview((s) => s.isOpen));
	return (
		<>
			{exportOpened ? <ExportImageModal /> : null}
			{screenshotOpened ? <ScreenshotPreviewModal /> : null}
		</>
	);
}
