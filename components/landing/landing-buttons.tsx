"use client";

import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/design-system/components/button";
import { DownloadSearcher } from "@/components/download-searcher";
import { playHref, useHeroSpecimenId } from "./hero-specimen";

// The hero's two actions: explore the atlas, or download the Tiling Searcher. A client component because
// lucide icon component references can't cross the RSC boundary into <Button> (same reason the old
// landing-actions.tsx existed). "Start exploring" opens the specimen currently drifting behind the masthead,
// falling back to the bare viewer if none is on stage.
export function LandingButtons() {
	const specimenId = useHeroSpecimenId();
	const router = useRouter();
	const href = playHref(specimenId);
	// The viewer's code is fetched when the reader reaches for the button, not on arrival: prefetched on
	// sight, it was 1.2 MB of JavaScript on every landing visit, and a new request each time the hero rotated.
	const warm = () => router.prefetch(href);
	return (
		// A phone stacks them at full width: two thumb-sized targets, not two chips side by side.
		<div className="flex flex-wrap gap-3 max-md:flex-col">
			<Button
				href={href}
				prefetch={false}
				onMouseEnter={warm}
				onFocus={warm}
				onTouchStart={warm}
				variant="primary"
				size="md"
				icon={Play}
				label="Start exploring"
				className="max-md:w-full"
			/>
			<DownloadSearcher variant="hero" />
		</div>
	);
}
