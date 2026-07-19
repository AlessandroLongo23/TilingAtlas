import { useCallback, useMemo, useState } from "react";

export interface UseExpandableGroupsResult {
	expanded: Record<string, boolean>;
	toggle: (id: string) => void;
	/** Force the given ids open (idempotent). Ids not currently closed are left untouched. */
	openGroups: (ids: string[]) => void;
	toggleAll: (open: boolean) => void;
	allExpanded: boolean;
}

/**
 * Controls the open/closed state of a list of groups whose identities can change
 * over time (e.g. loaded async). Each group starts at `defaultOpen`; user toggles
 * are stored as overrides so groups added later inherit the default.
 *
 * `defaultOpen` may be a per-id predicate when different rows want different initial
 * states (e.g. top-level categories closed, their subsections open).
 */
export function useExpandableGroups<T>(
	groups: T[],
	getId: (g: T) => string,
	defaultOpen: boolean | ((id: string) => boolean) = true,
): UseExpandableGroupsResult {
	const [overrides, setOverrides] = useState<Record<string, boolean>>({});

	const ids = useMemo(() => groups.map(getId), [groups, getId]);

	const isOpenByDefault = useCallback(
		(id: string) => (typeof defaultOpen === "function" ? defaultOpen(id) : defaultOpen),
		[defaultOpen],
	);

	const expanded = useMemo(() => {
		const out: Record<string, boolean> = {};
		for (const id of ids) {
			out[id] = overrides[id] ?? isOpenByDefault(id);
		}
		return out;
	}, [ids, overrides, isOpenByDefault]);

	const toggle = useCallback(
		(id: string) => {
			setOverrides((prev) => {
				const current = prev[id] ?? isOpenByDefault(id);
				return { ...prev, [id]: !current };
			});
		},
		[isOpenByDefault],
	);

	const openGroups = useCallback((ids: string[]) => {
		setOverrides((prev) => {
			let changed = false;
			const next = { ...prev };
			for (const id of ids) {
				if (next[id] !== true) {
					next[id] = true;
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	}, []);

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

	return { expanded, toggle, openGroups, toggleAll, allExpanded };
}
