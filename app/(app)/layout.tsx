import type { ReactNode } from "react";
import { Nav } from "@/components/nav";
import { ScreenshotPreviewModal } from "@/components/screenshot-preview-modal";
import { ExportImageModal } from "@/components/export-image-modal";
import { UpdatesGate } from "@/components/updates/updates-gate";
import { PadCursor } from "@/components/pad-cursor";
import { CommandPalette } from "@/components/command-palette";
import { LegacyTilingStoreBootstrap } from "./_bootstrap";

export default function AppLayout({ children }: { children: ReactNode }) {
	return (
		// h-screen is 100vh, which on a phone browser is the height with its toolbar hidden, so anything
		// pinned to the bottom sat under the toolbar; dvh tracks the visible height instead.
		<div className="flex h-screen flex-col overflow-hidden bg-surface-raised text-fg max-md:h-dvh">
			<LegacyTilingStoreBootstrap />
			<Nav />
			<div className="flex min-h-0 flex-1">{children}</div>
			<ScreenshotPreviewModal />
			<ExportImageModal />
			<UpdatesGate />
			<PadCursor />
			<CommandPalette />
		</div>
	);
}
