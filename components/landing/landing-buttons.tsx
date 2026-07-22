"use client";

import { Play, Library } from "lucide-react";
import { Button } from "@/components/ui/button";

// The hero's two actions. A client component because lucide icon component references can't cross
// the RSC boundary into <Button> (same reason the old landing-actions.tsx existed).
export function LandingButtons() {
	return (
		<div className="flex flex-wrap gap-3">
			<Button href="/play" variant="primary" size="md" icon={Play} label="Start exploring" />
			<Button href="/library" variant="secondary" size="md" icon={Library} label="Browse the library" />
		</div>
	);
}
