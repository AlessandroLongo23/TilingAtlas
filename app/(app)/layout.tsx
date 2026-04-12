import type { ReactNode } from "react";
import { Nav } from "@/components/nav";
import { LegacyTilingStoreBootstrap } from "./_bootstrap";

export default function AppLayout({ children }: { children: ReactNode }) {
	return (
		<div className="h-screen bg-zinc-900 text-white flex flex-col overflow-hidden">
			<LegacyTilingStoreBootstrap />
			<Nav />
			<div className="flex-1 min-h-0 flex">{children}</div>
		</div>
	);
}
