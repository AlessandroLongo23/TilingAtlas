"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface ExperimentContextValue {
	sidebarVisible: boolean;
	setSidebarVisible: (v: boolean) => void;
	tabBadges: Record<string, number | string>;
	setBadge: (stepId: string, value: number | string) => void;
	clearBadge: (stepId: string) => void;
}

const ExperimentContext = createContext<ExperimentContextValue | null>(null);

export function ExperimentProvider({
	children,
	initialBadges = {},
}: {
	children: ReactNode;
	initialBadges?: Record<string, number | string>;
}) {
	const [sidebarVisible, setSidebarVisible] = useState(true);
	const [tabBadges, setTabBadges] = useState<Record<string, number | string>>(initialBadges);

	const setBadge = useCallback((stepId: string, value: number | string) => {
		setTabBadges((prev) => ({ ...prev, [stepId]: value }));
	}, []);
	const clearBadge = useCallback((stepId: string) => {
		setTabBadges((prev) => {
			const next = { ...prev };
			delete next[stepId];
			return next;
		});
	}, []);

	const value = useMemo(
		() => ({ sidebarVisible, setSidebarVisible, tabBadges, setBadge, clearBadge }),
		[sidebarVisible, tabBadges, setBadge, clearBadge],
	);

	return <ExperimentContext.Provider value={value}>{children}</ExperimentContext.Provider>;
}

export function useExperiment() {
	const ctx = useContext(ExperimentContext);
	if (!ctx) throw new Error("useExperiment must be used inside ExperimentProvider");
	return ctx;
}
