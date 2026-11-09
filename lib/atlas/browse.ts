// The browse model of the merged /play + /library page: the active (geometry, decoration) cell as a tree
// of class → family → (grid) → sub, with every count taken from the loaded records AND the manifest's
// unloaded tiers, so a node reads the number of tilings that exist and not the number in memory.
//
// The tree stops at the sub (a board), except that a hybrid board opens onto its rows, the polygon sets
// its tilings use, the way a Searcher study lists its rows. k slices and tilings are never levels: the old
// tree nested down to the thumbnails, six levels deep, and pinned five headers over two rows of tiles.
//
// Grouping rules are the ones the old catalogue tree used (components/sidebar/catalogue-list-panel.tsx,
// still the /automata tree): SUB_ORDER order, a family row only where it divides something, the colorings
// family split into grid then palette, a geometry with one class shown without the class level.

import {
	familyOfSub,
	subOf,
	tileClassOf,
	SUB_ORDER,
	TILE_CLASS_LABEL,
	TILE_CLASS_ORDER,
	type ReferenceFilter,
	type TileClass,
} from "@/lib/services/referenceAtlas";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { CLASSIFICATIONS } from "@/lib/classifications";
import type { UnloadedTier } from "@/lib/services/atlasManifest";
import { COLOR_SUB, FAMILY_LABEL, SUB_LABEL, shortSubLabel } from "@/lib/services/shelfLabels";
import { hypPolyBoardOfSub, hypPolyTileCodes } from "@/lib/tilings/hyp-poly";
import { cornerTokenKey } from "@/lib/tilings/tiling-level";

/** One k slice of a sub: what is in memory, and the manifest tier still to fetch, if any. */
export interface KSlice {
	k: number;
	loaded: number;
	pending?: UnloadedTier;
	/** Tilings that exist in the slice: the loaded count, or the manifest's for an unloaded tier. */
	count: number;
}

/** A hybrid board's row: the exact set of tiles its tilings use, counted per k. */
interface PolySet {
	key: string;
	count: number;
	perK: Map<number, number>;
	/** Of `count`, how many sit in slices not loaded yet. */
	pending: number;
}

/** The part of the library filter a node stands for. Applying a node replaces exactly these fields. */
export type NodeScope = Pick<
	ReferenceFilter,
	"tileClass" | "family" | "board" | "sub" | "colorsCount" | "polySet" | "classification"
>;

export interface BrowseNode {
	id: string;
	kind: "class" | "family" | "grid" | "sub" | "row" | "classification";
	label: string;
	/** The row's second line, where the k range does not say what it is: a classification's author. */
	note?: string;
	count: number;
	/** Of `count`, how many are in slices not loaded yet. */
	pending: number;
	scope: NodeScope;
	children: BrowseNode[];
	/** The k slices of the node's own records: a sub's, a class's anonymous spine, or a row's share of its
	 *  board's (`count` is the row's; loading one still fetches the board's whole slice). */
	slices: KSlice[];
	/** The lowest and highest k anywhere under the node, for the sidebar's subtitle. */
	kRange: [number, number] | null;
}

const polySetCompare = (a: string, b: string) => {
	const x = a.split(","),
		y = b.split(",");
	if (x.length !== y.length) return x.length - y.length;
	for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return cornerTokenKey(x[i]) - cornerTokenKey(y[i]);
	return 0;
};

/** A hybrid board splits by polygon set before it splits by k (asked for by Marek Čtrnáct, 2026-10-21). */
export const splitsByPolygons = (sub: string) => hypPolyBoardOfSub(sub)?.family === "hybrid";

function polySetsOf(slices: KSlice[], records: CatalogueTiling[]): PolySet[] | undefined {
	const sets = new Map<string, PolySet>();
	const add = (key: string, k: number, n: number, pending: boolean) => {
		const at = sets.get(key) ?? { key, count: 0, perK: new Map(), pending: 0 };
		at.count += n;
		if (pending) at.pending += n;
		at.perK.set(k, (at.perK.get(k) ?? 0) + n);
		sets.set(key, at);
	};
	for (const s of slices)
		if (s.pending) for (const [key, n] of Object.entries(s.pending.facets?.polygons ?? {})) add(key, s.k, n, true);
	for (const t of records) if (t.hypPoly) add(hypPolyTileCodes(t.hypPoly).join(","), t.k, 1, false);
	// One set is the board itself: a single row would only repeat it.
	return sets.size > 1 ? [...sets.values()].sort((a, b) => polySetCompare(a.key, b.key)) : undefined;
}

/** "3,4,20" → "{3, 4, 20}": the row's name in the breadcrumb and the tree's search. */
export const polySetLabel = (key: string) => `{${key.split(",").join(", ")}}`;

const rangeOf = (ks: Iterable<number>): [number, number] | null => {
	let lo = Infinity,
		hi = -Infinity;
	for (const k of ks) {
		if (k < lo) lo = k;
		if (k > hi) hi = k;
	}
	return lo === Infinity ? null : [lo, hi];
};

const merge = (nodes: BrowseNode[]): Pick<BrowseNode, "count" | "pending" | "kRange"> => ({
	count: nodes.reduce((s, n) => s + n.count, 0),
	pending: nodes.reduce((s, n) => s + n.pending, 0),
	kRange: rangeOf(nodes.flatMap((n) => n.kRange ?? [])),
});

/**
 * The tree of one cell. `items` is the cell's loaded records (already filtered to the geometry and
 * decoration), `unloaded` the manifest tiers of the same cell that are not in memory.
 */
export function buildBrowseTree(items: readonly CatalogueTiling[], unloaded: readonly UnloadedTier[]): BrowseNode[] {
	// class → sub → k → records
	const byClass = new Map<TileClass, Map<string, Map<number, CatalogueTiling[]>>>();
	const at = (cls: TileClass, sub: string, k: number) => {
		let subs = byClass.get(cls);
		if (!subs) byClass.set(cls, (subs = new Map()));
		let ks = subs.get(sub);
		if (!ks) subs.set(sub, (ks = new Map()));
		let list = ks.get(k);
		if (!list) ks.set(k, (list = []));
		return list;
	};
	for (const t of items) at(tileClassOf(t), subOf(t), t.k).push(t);
	const pendingAt = new Map<string, UnloadedTier>();
	for (const u of unloaded) {
		if (byClass.get(u.cls)?.get(u.sub)?.get(u.k)?.length) continue;
		at(u.cls, u.sub, u.k);
		pendingAt.set(`${u.cls}|${u.sub}|${u.k}`, u);
	}

	const subOrder = new Map(SUB_ORDER.map((s, i) => [s as string, i]));
	const orderOf = (s: string) => subOrder.get(s) ?? Number.MAX_SAFE_INTEGER;

	const slicesOf = (cls: TileClass, sub: string, ks: Map<number, CatalogueTiling[]>): KSlice[] =>
		[...ks.entries()]
			.sort(([a], [b]) => a - b)
			.map(([k, list]) => {
				const pending = pendingAt.get(`${cls}|${sub}|${k}`);
				return { k, loaded: list.length, pending, count: pending ? pending.count : list.length };
			});

	const out: BrowseNode[] = [];
	for (const cls of TILE_CLASS_ORDER) {
		const subMap = byClass.get(cls);
		if (!subMap) continue;
		const subs = [...subMap.keys()].sort((a, b) => orderOf(a) - orderOf(b) || (a < b ? -1 : 1));

		// The anonymous sub "" is the class's own spine: its slices belong to the class node, not a child.
		const spineSlices = subMap.has("") ? slicesOf(cls, "", subMap.get("")!) : [];

		const subNode = (sub: string, label: string, family: string | null): BrowseNode => {
			const ks = subMap.get(sub)!;
			const slices = slicesOf(cls, sub, ks);
			const color = COLOR_SUB.exec(sub);
			const scope: NodeScope = color
				? { tileClass: cls, family: family ?? "_spine", board: color[1], colorsCount: Number(color[2]) }
				: family
					? { tileClass: cls, family, board: sub }
					: { tileClass: cls, family: "_spine", sub };
			const sets = splitsByPolygons(sub) ? polySetsOf(slices, [...ks.values()].flat()) : undefined;
			const id = `s:${cls}:${sub}`;
			return {
				id,
				kind: "sub",
				label,
				count: slices.reduce((s, x) => s + x.count, 0),
				pending: slices.reduce((s, x) => s + (x.pending ? x.count : 0), 0),
				scope,
				children: (sets ?? []).map((set) => ({
					id: `${id}:${set.key}`,
					kind: "row" as const,
					label: polySetLabel(set.key),
					count: set.count,
					pending: set.pending,
					scope: { ...scope, polySet: set.key },
					children: [],
					slices: slices.filter((s) => set.perK.has(s.k)).map((s) => ({ ...s, count: set.perK.get(s.k)! })),
					kRange: rangeOf(set.perK.keys()),
				})),
				slices,
				kRange: rangeOf(slices.map((s) => s.k)),
			};
		};

		// Colourings split once more: the grid, then the palette.
		const gridNodes = (family: string, subsIn: string[], underFamily: boolean): BrowseNode[] => {
			const stems: { stem: string; subs: string[] }[] = [];
			for (const s of subsIn) {
				const stem = COLOR_SUB.exec(s)?.[1] ?? s;
				const last = stems[stems.length - 1];
				if (last && last.stem === stem) last.subs.push(s);
				else stems.push({ stem, subs: [s] });
			}
			return stems.map(({ stem, subs: members }) => {
				const children = members.map((s) => subNode(s, `${COLOR_SUB.exec(s)?.[2] ?? ""} colors`, family));
				return {
					id: `g:${cls}:${stem}`,
					kind: "grid" as const,
					label: underFamily ? shortSubLabel(stem) : (SUB_LABEL[stem] ?? stem),
					scope: { tileClass: cls, family, board: stem },
					children,
					slices: [],
					...merge(children),
				};
			});
		};

		const named = subs.filter((s) => s && familyOfSub(s));
		const loose = subs.filter((s) => s && !familyOfSub(s));
		const families = new Map<string, string[]>();
		for (const s of named) {
			const f = familyOfSub(s)!;
			const list = families.get(f);
			if (list) list.push(s);
			else families.set(f, [s]);
		}

		const membersOf = (family: string | null, list: string[], underFamily: boolean): BrowseNode[] =>
			family === "grid-colors"
				? gridNodes(family, list, underFamily)
				: list.map((s) => subNode(s, underFamily ? shortSubLabel(s) : (SUB_LABEL[s] ?? s), family));

		let children: BrowseNode[];
		if (families.size === 0) {
			children = membersOf(null, loose, false);
		} else if (families.size === 1 && !loose.length && !spineSlices.length) {
			// One family and nothing beside it: the family row would only repeat the class.
			const [[family, list]] = [...families.entries()];
			children = membersOf(family, list, false);
		} else {
			children = [...families.entries()].map(([family, list]) => {
				const kids = membersOf(family, list, true);
				return {
					id: `f:${cls}:${family}`,
					kind: "family" as const,
					label: FAMILY_LABEL[family] ?? family,
					scope: { tileClass: cls, family },
					children: kids,
					slices: [],
					...merge(kids),
				};
			});
			// Subs with no family sit under one heading named for the class (the old tree did the same).
			if (loose.length) {
				const kids = membersOf(null, loose, false);
				children.push({
					id: `f:${cls}:_spine`,
					kind: "family",
					label: TILE_CLASS_LABEL[cls].long,
					scope: { tileClass: cls, family: "_spine" },
					children: kids,
					slices: [],
					...merge(kids),
				});
			}
		}

		const spineCount = spineSlices.reduce((s, x) => s + x.count, 0);
		const spinePending = spineSlices.reduce((s, x) => s + (x.pending ? x.count : 0), 0);
		const m = merge(children);
		out.push({
			id: `c:${cls}`,
			kind: "class",
			label: TILE_CLASS_LABEL[cls].long,
			scope: { tileClass: cls },
			children,
			slices: spineSlices,
			count: m.count + spineCount,
			pending: m.pending + spinePending,
			kRange: rangeOf([...(m.kRange ?? []), ...spineSlices.map((s) => s.k)]),
		});
	}
	return out;
}

/**
 * The cell's classifications (lib/classifications.ts): proven-complete lists drawn from the shelves above, one
 * leaf each after the cell's classes. A leaf owns no records, so it has no slices: picking it filters the cell
 * to its members, and the grid fetches the shards they live in. The count is the source's.
 */
export function classificationNodes(cell: string): BrowseNode[] {
	return CLASSIFICATIONS.filter((c) => c.cell === cell).map((c) => ({
		id: `x:${c.slug}`,
		kind: "classification",
		label: c.title,
		note: `proved by ${c.by}`,
		count: c.count,
		pending: 0,
		scope: { classification: c.slug },
		children: [],
		slices: [],
		kRange: null,
	}));
}

const SCOPE_KEYS = ["tileClass", "family", "board", "sub", "colorsCount", "polySet", "classification"] as const;

/** Does a node's scope match the filter's scope fields? Exactly, except that a link naming a board (or a
 *  sub) may leave its family out: the board implies it, and links shared before the family field existed
 *  carry `class` and `board` only. */
const scopeEquals = (scope: NodeScope, f: ReferenceFilter) =>
	SCOPE_KEYS.every(
		(key) => scope[key] === f[key] || (key === "family" && f.family === undefined && !!(f.board ?? f.sub)),
	);

/** The node the filter's scope names, or null for the whole cell. A row the board does not list (a link
 *  to a board whose one set is the whole board) falls back to the board, which the filter still narrows. */
export function findScopeNode(tree: readonly BrowseNode[], f: ReferenceFilter): BrowseNode | null {
	const hit = findNode(tree, (n) => scopeEquals(n.scope, f));
	return hit || !f.polySet ? hit : findScopeNode(tree, { ...f, polySet: undefined });
}

/** The node a record lives in: its row on a hybrid board, else its sub, else the class. */
export function nodeOfRecord(tree: readonly BrowseNode[], t: CatalogueTiling): BrowseNode | null {
	const cls = tileClassOf(t);
	const sub = subOf(t);
	const board = sub ? `s:${cls}:${sub}` : `c:${cls}`;
	const row = t.hypPoly && splitsByPolygons(sub) ? `${board}:${hypPolyTileCodes(t.hypPoly).join(",")}` : null;
	return (row && findNode(tree, (n) => n.id === row)) || findNode(tree, (n) => n.id === board);
}

function findNode(nodes: readonly BrowseNode[], hit: (n: BrowseNode) => boolean): BrowseNode | null {
	for (const n of nodes) {
		if (hit(n)) return n;
		const below = findNode(n.children, hit);
		if (below) return below;
	}
	return null;
}

/** The ids from the root to a node, inclusive. */
export function pathTo(tree: readonly BrowseNode[], id: string): BrowseNode[] {
	const walk = (nodes: readonly BrowseNode[], trail: BrowseNode[]): BrowseNode[] | null => {
		for (const n of nodes) {
			const next = [...trail, n];
			if (n.id === id) return next;
			const hit = walk(n.children, next);
			if (hit) return hit;
		}
		return null;
	};
	return walk(tree, []) ?? [];
}
