"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

// The four overlay toggles a preview card can carry, on the keys /play already uses for them:
// o = vertex orbits, s = symmetry elements, d = fundamental domain, p = polygon points. One table, so
// the deck, the article pages and /play can never disagree about which letter does what.
export const OVERLAY_KEYS = {
	o: "orbits",
	s: "symmetry",
	d: "fundamentalDomain",
	p: "polygonPoints",
} as const;

export type OverlayName = (typeof OVERLAY_KEYS)[keyof typeof OVERLAY_KEYS];

export type OverlayState = Record<OverlayName, boolean>;

export const NO_OVERLAYS: OverlayState = {
	orbits: false,
	symmetry: false,
	fundamentalDomain: false,
	polygonPoints: false,
};

/**
 * Page-wide overlay state for a group of preview cards, with per-card exceptions.
 *
 * The rule the two surfaces share: **a focused card takes the key for itself, an unfocused page takes
 * it for everyone.** Click a card and press `s` and only that card shows its symmetry elements; press
 * `s` with nothing focused and every card on the slide (or the article page) shows theirs.
 *
 * Implemented as a page-level `shared` state plus a per-card override map. A global toggle rewrites
 * `shared` AND drops every override, so "all of them" really means all of them, not "all the
 * ones you have not touched yet" — otherwise a card you had toggled earlier would sit there
 * contradicting the rest of the slide with no way to tell why.
 */
interface OverlayScope {
	/** Partial on purpose: an overlay nobody has pressed a key for is left to each card's own default,
	 *  which is how an `<orbit-card>` can ship with its dots already on while its neighbours do not. */
	shared: Partial<OverlayState>;
	/** Per-card exceptions, keyed by the id the card registers under. */
	overrides: Record<string, Partial<OverlayState>>;
	/** Flip one overlay for every card in the scope, clearing per-card exceptions. */
	toggleAll: (name: OverlayName) => void;
	/** Flip one overlay for a single card only. `showing` is what that card currently displays, which
	 *  is the starting point when it has no exception recorded yet. */
	toggleOne: (cardId: string, name: OverlayName, showing: boolean) => void;
	/** Clear every override and turn everything off (slide change). */
	reset: () => void;
}

const ScopeContext = createContext<OverlayScope | null>(null);

/**
 * Wrap the cards that should answer the keyboard together — one slide, or one article page. Cards
 * outside a provider still work; they just have no keyboard and no shared state.
 *
 * `resetKey` clears everything when it changes. The deck passes the slide number: overlays are a
 * thing you turn on to make a point, and leaving them latched across a slide change would surprise
 * you mid-talk.
 */
export function PreviewOverlayScope({
	children,
	resetKey,
}: {
	children: React.ReactNode;
	resetKey?: string | number;
}) {
	const [shared, setShared] = useState<Partial<OverlayState>>({});
	const [overrides, setOverrides] = useState<Record<string, Partial<OverlayState>>>({});
	// Read inside the overrides updater, which must stay pure — a nested setState there would double
	// the toggle under Strict Mode's double-invoked updaters.
	const sharedRef = useRef(shared);
	sharedRef.current = shared;

	const reset = useCallback(() => {
		setShared({});
		setOverrides({});
	}, []);

	// First press turns the overlay ON for the whole scope, whatever any individual card was showing.
	const toggleAll = useCallback((name: OverlayName) => {
		setOverrides({});
		setShared((s) => ({ ...s, [name]: !(s[name] ?? false) }));
	}, []);

	// A card with no exception yet starts from whatever it is currently showing — the scope's value if
	// a key has set one, else the card's own default — so the first press always changes the picture.
	const toggleOne = useCallback((cardId: string, name: OverlayName, showing: boolean) => {
		setOverrides((o) => {
			const current = o[cardId]?.[name] ?? sharedRef.current[name] ?? showing;
			return { ...o, [cardId]: { ...o[cardId], [name]: !current } };
		});
	}, []);

	useEffect(() => {
		reset();
	}, [resetKey, reset]);

	// The page-level key listener. It fires only when NO card holds focus — a focused card handles its
	// own keys and stops the event before it reaches window (see useCardOverlays). Typing in a field
	// never counts, and a modifier means the key belongs to the browser.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const el = e.target as HTMLElement | null;
			if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
			const name = OVERLAY_KEYS[e.key.toLowerCase() as keyof typeof OVERLAY_KEYS];
			if (!name) return;
			e.preventDefault();
			toggleAll(name);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [toggleAll]);

	const value = useMemo<OverlayScope>(
		() => ({ shared, overrides, toggleAll, toggleOne, reset }),
		[shared, overrides, toggleAll, toggleOne, reset],
	);

	return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

/**
 * A card's view of the scope: the overlays it should currently show, and the key handler that claims
 * o/s/d/p for itself while it is focused.
 *
 * `stopPropagation` is what makes the focused-vs-page split work: React dispatches this handler at the
 * root container, and stopping the native event there keeps it from ever reaching the provider's
 * window listener. Without it a focused card would toggle itself AND the whole slide.
 */
export function useCardOverlays(
	cardId: string,
	initial?: Partial<OverlayState>,
): {
	overlays: OverlayState;
	onOverlayKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
} {
	const scope = useContext(ScopeContext);
	// A card with no provider keeps its own exceptions, so a one-off preview outside any scope still
	// answers the keys while it holds focus.
	const [solo, setSolo] = useState<Partial<OverlayState>>({});

	// Precedence, narrowest first: this card's exception, then whatever a key set for the whole scope,
	// then the card's own default, then off.
	//
	// The defaults are read generically, not flag by flag. An earlier version tested the three
	// names it knew by hand, which silently ignored the fourth the day one was added — a `<seed-card>`
	// asking for its points arrived with them off and no error anywhere.
	const initialKey = Object.keys(initial ?? {})
		.filter((k) => initial?.[k as OverlayName] === true)
		.sort()
		.join(",");
	const base = initialKey ? { ...NO_OVERLAYS, ...initial } : NO_OVERLAYS;
	const overlays = useMemo<OverlayState>(
		() => ({ ...base, ...(scope ? scope.shared : {}), ...(scope ? scope.overrides[cardId] : solo) }),
		// `base` is derived from `initial`, which callers pass as a literal; depending on the object
		// identity would rebuild this every render for no benefit. `initialKey` is its value.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[scope, cardId, solo, initialKey],
	);
	const overlaysRef = useRef(overlays);
	overlaysRef.current = overlays;

	const onOverlayKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLElement>) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const name = OVERLAY_KEYS[e.key.toLowerCase() as keyof typeof OVERLAY_KEYS];
			if (!name) return;
			e.preventDefault();
			e.stopPropagation();
			const showing = overlaysRef.current[name];
			if (scope) scope.toggleOne(cardId, name, showing);
			else setSolo((s) => ({ ...s, [name]: !showing }));
		},
		[scope, cardId],
	);

	return { overlays, onOverlayKeyDown };
}
