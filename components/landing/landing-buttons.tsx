"use client";

import { Play, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playHref, useHeroSpecimenId } from "./hero-specimen";

// The hero's two actions. A client component because lucide icon component references can't cross
// the RSC boundary into <Button> (same reason the old landing-actions.tsx existed).
// "Start exploring" opens the specimen currently drifting behind the masthead, falling back to a
// bare /play if none is on stage.
export function LandingButtons() {
	const specimenId = useHeroSpecimenId();
	return (
		// A phone stacks them at full width: two thumb-sized targets, not two chips side by side.
		<div className="flex flex-wrap gap-3 max-md:flex-col">
			<Button href={playHref(specimenId)} variant="primary" size="md" icon={Play} label="Start exploring" classes="max-md:w-full" />
			<Button href="/library" variant="secondary" size="md" icon={Library} label="Browse the library" classes="max-md:w-full" />
		</div>
	);
}
