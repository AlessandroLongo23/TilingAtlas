import type { ReactNode } from "react";
import { Nav } from "@/components/nav";
import { AppDialogs } from "@/components/app-dialogs";
import { UpdatesGate } from "@/components/updates/updates-gate";
import { PadCursor } from "@/components/pad-cursor";
import { CommandPalette } from "@/components/command-palette";

export default function AppLayout({ children }: { children: ReactNode }) {
	return (
		// h-screen is 100vh, which on a phone browser is the height with its toolbar hidden, so anything
		// pinned to the bottom sat under the toolbar; dvh tracks the visible height instead.
		<div className="flex h-screen flex-col overflow-hidden bg-surface-raised text-fg max-md:h-dvh">
			<Nav />
			<div className="flex min-h-0 flex-1">{children}</div>
			<AppDialogs />
			<UpdatesGate />
			<PadCursor />
			<CommandPalette />
		</div>
	);
}
