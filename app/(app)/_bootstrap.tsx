"use client";

import { useEffect } from "react";
import { useLegacyTilingStore } from "@/stores/legacyTilingStore";

/**
 * Kicks off the legacy tiling store's one-time initialize() call on mount.
 * Source did this from src/routes/+layout.svelte. Rendered once from the
 * (app) layout so it runs when the authenticated app shell mounts.
 */
export function LegacyTilingStoreBootstrap() {
	useEffect(() => {
		useLegacyTilingStore.getState().initialize();
	}, []);
	return null;
}
