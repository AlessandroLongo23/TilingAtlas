"use client";

import { Gamepad2, Library, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

// The landing CTAs. Icons match the header nav so a page's identity is consistent from the door in:
// Play → Gamepad2, Library → Library, Theory → BookOpen. Kept as a client component because the
// server landing page can't pass lucide component references across the RSC boundary to <Button>.
export function LandingActions() {
	return (
		<div className="mt-8 flex flex-col gap-3">
			<Button href="/play" variant="primary" size="md" fullWidth icon={Gamepad2} label="Start Exploring" />
			<div className="flex gap-2">
				<Button href="/library" variant="secondary" size="md" fullWidth icon={Library} label="Library" />
				<Button href="/theory" variant="secondary" size="md" fullWidth icon={BookOpen} label="Theory" />
			</div>
		</div>
	);
}
