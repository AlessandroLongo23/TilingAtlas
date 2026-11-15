"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { dealLanding, type LandingDeal, type LandingPools } from "@/lib/services/landing-deal";
import { CollectionCard } from "./collection-card";
import { HeroRotator } from "./hero-rotator";
import { playHref } from "./hero-specimen";
import { HyperbolicMini, PlayMini, SphericalMini } from "./geometry-minis";
import { LibraryMosaic } from "./library-mosaic";

// The landing page is prerendered once per deploy and served from the CDN, yet every visit gets its own
// hero rotation, mosaic and collection previews: they are dealt here, in the browser, from the pools the
// page ships. The server snapshot is null, so the prerendered HTML and the hydrating render agree, and the
// deal lands as an ordinary update right after. Everything dealt is a canvas, blank until drawn either
// way, so a visitor sees the same page the per-request render used to send. A client-side navigation back
// to / mounts a new provider and deals afresh.

const DealContext = createContext<LandingDeal | null>(null);
const useDeal = () => useContext(DealContext);
const noSubscribe = () => () => {};

export function LandingDealProvider({ pools, children }: { pools: LandingPools; children: ReactNode }) {
	const [getDeal] = useState(() => {
		let deal: LandingDeal | null = null;
		return () => (deal ??= dealLanding(pools));
	});
	const deal = useSyncExternalStore(noSubscribe, getDeal, () => null);
	return <DealContext.Provider value={deal}>{children}</DealContext.Provider>;
}

/** The hero stage. Before the deal, the same empty plate HeroRotator draws on. */
export function DealtHero() {
	const deal = useDeal();
	return deal ? (
		<HeroRotator specimens={deal.heroPool} />
	) : (
		<div aria-hidden="true" className="absolute inset-0 bg-surface" />
	);
}

export function DealtMosaic() {
	return <LibraryMosaic tilings={useDeal()?.mosaic ?? null} />;
}

/** The Viewer card: its patch and its link name the same dealt tiling. */
export function DealtViewerCard(props: Omit<ComponentProps<typeof CollectionCard>, "href" | "children">) {
	const play = useDeal()?.play;
	return (
		<CollectionCard {...props} href={playHref(play?.id ?? null)}>
			{play ? <PlayMini cell={play.cell} /> : null}
		</CollectionCard>
	);
}

export function DealtHyperbolic() {
	const deal = useDeal();
	return deal?.hyperbolicPatch ? (
		<HyperbolicMini patch={deal.hyperbolicPatch} data={deal.hyperbolicPatchData ?? undefined} />
	) : null;
}

export function DealtSpherical() {
	const solid = useDeal()?.sphericalSolid;
	return solid ? <SphericalMini solidId={solid} /> : null;
}
