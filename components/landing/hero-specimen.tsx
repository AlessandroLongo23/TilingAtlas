"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

// The id of the tiling currently on the hero stage, shared between the rotator (which owns the
// rotation) and the hero CTA (which links to it). Seeded with the first specimen so the server HTML
// already carries the right deep link; the rotator republishes on every swap.

const HeroSpecimenContext = createContext<string | null>(null);
const SetHeroSpecimenContext = createContext<(id: string) => void>(() => {});

export function HeroSpecimenProvider({
	initialId = null,
	children,
}: {
	initialId?: string | null;
	children: ReactNode;
}) {
	const [id, setId] = useState<string | null>(initialId);
	const publish = useCallback((next: string) => {
		setId((prev) => (prev === next ? prev : next));
	}, []);
	return (
		<SetHeroSpecimenContext.Provider value={publish}>
			<HeroSpecimenContext.Provider value={id}>{children}</HeroSpecimenContext.Provider>
		</SetHeroSpecimenContext.Provider>
	);
}

/** The tiling currently displayed in the hero, or null before one is on stage. */
export function useHeroSpecimenId() {
	return useContext(HeroSpecimenContext);
}

/** Publish the tiling now on stage. Stable across renders. */
export function usePublishHeroSpecimen() {
	return useContext(SetHeroSpecimenContext);
}

/** The /play deep link for a specimen id. */
export function playHref(id: string | null) {
	return id ? `/play?source=reference&tiling=${encodeURIComponent(id)}` : "/play";
}
