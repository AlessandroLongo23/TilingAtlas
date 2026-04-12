import { useCallback, useMemo, useState } from "react";

export interface UseExpandableGroupsResult {
	expanded: Record<string, boolean>;
	toggle: (id: string) => void;
	toggleAll: (open: boolean) => void;
	allExpanded: boolean;
}

/**
 * Controls the open/closed state of a list of groups whose identities can change
 * over time (e.g. loaded async). Each group starts at `defaultOpen`; user toggles
 * are stored as overrides so groups added later inherit the default.
 */
export function useExpandableGroups<T>(
	groups: T[],
	getId: (g: T) => string,
	defaultOpen = true,
): UseExpandableGroupsResult {
	const [overrides, setOverrides] = useState<Record<string, boolean>>({});

	const ids = useMemo(() => groups.map(getId), [groups, getId]);

	const expanded = useMemo(() => {
		const out: Record<string, boolean> = {};
		for (const id of ids) {
			out[id] = overrides[id] ?? defaultOpen;
		}
		return out;
	}, [ids, overrides, defaultOpen]);

	const toggle = useCallback(
		(id: string) => {
			setOverrides((prev) => {
				const current = prev[id] ?? defaultOpen;
				return { ...prev, [id]: !current };
			});
		},
		[defaultOpen],
	);

	const toggleAll = useCallback(
		(open: boolean) => {
			setOverrides(() => {
				const next: Record<string, boolean> = {};
				for (const id of ids) next[id] = open;
				return next;
			});
		},
		[ids],
	);

	const allExpanded = ids.length > 0 && ids.every((id) => expanded[id]);

	return { expanded, toggle, toggleAll, allExpanded };
}
