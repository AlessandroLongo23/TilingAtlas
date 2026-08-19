import type { ReactNode } from "react";
import { Nav } from "@/components/nav";
import { ScreenshotPreviewModal } from "@/components/screenshot-preview-modal";
import { ExportImageModal } from "@/components/export-image-modal";
import { UpdatesGate } from "@/components/updates/updates-gate";
import { LegacyTilingStoreBootstrap } from "./_bootstrap";

export default function AppLayout({ children }: { children: ReactNode }) {
	return (
		<div className="h-screen bg-surface-raised text-fg flex flex-col overflow-hidden">
			<LegacyTilingStoreBootstrap />
			<Nav />
			<div className="flex-1 min-h-0 flex">{children}</div>
			<ScreenshotPreviewModal />
			<ExportImageModal />
			<UpdatesGate />
		</div>
	);
}
