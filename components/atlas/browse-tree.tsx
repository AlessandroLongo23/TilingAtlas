"use client";

import { memo, useEffect, useMemo, useState, type CSSProperties } from "react";
import { ChevronRight, ChevronsDownUp, Layers, LayoutGrid, Rows3, Search, Shapes, X } from "lucide-react";
import { HoverPill } from "@/components/ui/hover-pill";
import { cn } from "@/lib/utils/cn";
import { pathTo, type BrowseNode } from "@/lib/atlas/browse";

// The browse tree, drawn the way the Tiling Searcher draws its run tree (tools/searcher/app/src/runs.tsx):
// a folder's contents hang off a rail, the path to where you are is drawn over it in the text colour one
// piece every RAIL_STEP ms (only the part that changed), and one hover pill glides between the rows. It
// lists NO tilings: its leaves are boards and a hybrid board's rows, and each opens in the grid lens.

const RAIL_STEP = 70;
const OPEN_KEY = "atlas:open-nodes";

const loadOpen = (): Set<string> => {
	try {
		const raw = localStorage.getItem(OPEN_KEY);
		return new Set(raw ? (JSON.parse(raw) as string[]) : []);
	} catch {
		return new Set();
	}
};

const n = (x: number) => x.toLocaleString("en-US");
// "2,673,362" does not fit beside a board's name in a 300px column; the exact number is in the page.
const compact = (x: number) =>
	x >= 1e6 ? `${(x / 1e6).toFixed(x >= 1e7 ? 1 : 2)}M` : x >= 1e4 ? `${Math.round(x / 1e3)}k` : n(x);

const KIND_ICON = { class: Shapes, family: Layers, grid: LayoutGrid, sub: Rows3, row: null } as const;

/** Keep a node when it or anything under it matches; a match keeps its whole subtree. */
function filterTree(nodes: readonly BrowseNode[], q: string): BrowseNode[] {
	const out: BrowseNode[] = [];
	for (const node of nodes) {
		if (node.label.toLowerCase().includes(q)) {
			out.push(node);
			continue;
		}
		const kids = filterTree(node.children, q);
		if (kids.length) out.push({ ...node, children: kids });
	}
	return out;
}

interface BrowseTreeProps {
	tree: BrowseNode[];
	/** The whole cell's count, for the root row. */
	total: number;
	/** What the root row is called ("All tilings", "All edge patterns"). */
	rootLabel: string;
	/** The node the rail path is drawn to: the scope in the grid lens, the tiling's board in the viewer. */
	activeId: string | null;
	/** The node shown highlighted: the grid lens's scope. Null highlights the root row. */
	selectedId: string | null;
	onPick: (node: BrowseNode | null) => void;
}

export const BrowseTree = memo(function BrowseTree({
	tree,
	total,
	rootLabel,
	activeId,
	selectedId,
	onPick,
}: BrowseTreeProps) {
	// Open nodes, kept across visits like the Searcher keeps its folders. Read after mount: the server
	// renders everything closed, and localStorage is not there to ask.
	const [opened, setOpened] = useState<Set<string>>(() => new Set());
	const [restored, setRestored] = useState(false);
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- one read of the browser's own storage
		setOpened(loadOpen());
		setRestored(true);
	}, []);
	useEffect(() => {
		if (!restored) return;
		try {
			localStorage.setItem(OPEN_KEY, JSON.stringify([...opened]));
		} catch {
			/* private window: the tree just forgets */
		}
	}, [opened, restored]);

	const [query, setQuery] = useState("");
	const q = query.trim().toLowerCase();
	const shown = useMemo(() => (q ? filterTree(tree, q) : tree), [tree, q]);
	// While searching, every match is open: the point is to see where it sits.
	const isOpen = (id: string) => (q ? true : opened.has(id));
	const toggle = (id: string) =>
		setOpened((s) => {
			const next = new Set(s);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	// The path to the active node, as the rail pieces it is drawn with, top to bottom: in each level below
	// the top, "pass" for the entries above the one it enters and "on" for that entry.
	const pathPieces = (id: string | null): string[] => {
		if (!id) return [];
		const pieces: string[] = [];
		const walk = (nodes: readonly BrowseNode[], depth: number): boolean => {
			const i = nodes.findIndex((x) => x.id === id || containsId(x, id));
			if (i < 0) return false;
			if (depth) pieces.push(...nodes.slice(0, i).map((x) => `pass ${x.id}`), `on ${nodes[i].id}`);
			if (nodes[i].id === id) return true;
			return walk(nodes[i].children, depth + 1);
		};
		walk(shown, 0);
		return pieces;
	};

	// Open the way to a newly active node (a deep link, a pick in the grid): only on a change, so coming
	// back to the page keeps the tree as it was left. Adjusted during render, like the Searcher does it.
	const [seen, setSeen] = useState<string | null>(null);
	const [from, setFrom] = useState(0);
	if (restored && seen !== activeId) {
		const [was, now] = [pathPieces(seen), pathPieces(activeId)];
		let i = 0;
		while (i < now.length && was[i] === now[i]) i++;
		setFrom(i);
		setSeen(activeId);
		// The node itself unfolds too when it is a folder, as a click would: a link to a hybrid board lands on its rows.
		const way = activeId ? pathTo(tree, activeId).flatMap((x) => (x.children.length ? [x.id] : [])) : [];
		if (way.some((a) => !opened.has(a))) setOpened(new Set([...opened, ...way]));
	}
	const path = new Map(pathPieces(activeId).map((piece, i) => [piece, i]));
	const mark = (id: string) => {
		for (const role of ["on", "pass"]) {
			const i = path.get(`${role} ${id}`);
			if (i !== undefined)
				return {
					[`data-rail-${role}`]: "",
					style: { "--rail-delay": `${Math.max(0, i - from) * RAIL_STEP}ms` } as CSSProperties,
				};
		}
		return {};
	};

	const level = (nodes: readonly BrowseNode[]) =>
		nodes.map((node) => {
			const folder = node.children.length > 0;
			const open = folder && isOpen(node.id);
			const Icon = KIND_ICON[node.kind];
			const selected = selectedId === node.id;
			return (
				<li key={node.id} className={folder ? undefined : "[--rail-mid:22px]"} {...mark(node.id)}>
					{/* One hover target per row, as in the Searcher: the name, the count and the chevron. The chevron
					    only folds; the rest of the row opens the node and unfolds it, since the grid now shows what
					    it holds and the tree should agree. */}
					<button
						type="button"
						onClick={(e) => {
							const fold = folder && !!(e.target as Element).closest("[data-fold]");
							if (!fold) onPick(node);
							if (fold || (folder && !opened.has(node.id))) toggle(node.id);
						}}
						aria-current={selected || undefined}
						aria-expanded={folder ? open : undefined}
						className={cn(
							"group flex w-full cursor-pointer items-center gap-2 rounded-control pl-2 text-left",
							folder ? "h-9 pr-1" : "min-h-11 py-1.5 pr-2.5",
							selected && "bg-surface-overlay",
						)}
					>
						{Icon ? (
							<Icon size={15} className={cn("shrink-0", selected ? "text-fg" : "text-fg-secondary")} aria-hidden />
						) : null}
						<span className="min-w-0 flex-1">
							{node.kind === "row" ? (
								// A row is the tiles its tilings use, as chips: "3", "4₂", "∞".
								<span className="flex flex-wrap gap-1" aria-label={node.label}>
									{node.scope.polySet!.split(",").map((tile) => (
										<span key={tile} className="rounded-sm bg-surface-sunken px-1.5 font-mono text-[11px] text-fg">
											{tile}
										</span>
									))}
								</span>
							) : (
								<span
									className={cn(
										"block truncate text-[13px] text-fg",
										node.kind === "class" || node.kind === "family" ? "font-medium" : "",
									)}
								>
									{node.label}
								</span>
							)}
							{folder ? null : (
								<span className="block truncate text-[11px] text-fg-muted">
									{node.kRange
										? node.kRange[0] === node.kRange[1]
											? `k = ${node.kRange[0]}`
											: `k ${node.kRange[0]}–${node.kRange[1]}`
										: ""}
									{node.pending ? ` · ${compact(node.pending)} not loaded` : ""}
								</span>
							)}
						</span>
						<span
							className={cn(
								"shrink-0 font-mono text-[11px] text-fg-muted tabular-nums",
								folder && "opacity-60 transition-opacity group-hover:opacity-100",
							)}
							title={n(node.count)}
						>
							{compact(node.count)}
						</span>
						{folder ? (
							<span
								data-fold
								title={open ? "Fold" : "Unfold"}
								className="flex h-7 w-6 shrink-0 items-center justify-center text-fg-muted transition-colors hover:text-fg"
							>
								<ChevronRight
									size={14}
									className={cn(
										"transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)] motion-reduce:transition-none",
										open && "rotate-90",
									)}
								/>
							</span>
						) : null}
					</button>
					{open ? <ul className="ta-tree-reveal ta-rail mt-0.5">{level(node.children)}</ul> : null}
				</li>
			);
		});

	const openCount = opened.size;
	return (
		<div className="flex flex-col">
			<div className="flex items-center gap-1.5 px-3 pt-1 pb-2">
				<label className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-control bg-surface-sunken px-2 text-fg-muted focus-within:ring-2 focus-within:ring-accent/50">
					<Search size={13} className="shrink-0" aria-hidden />
					<input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Find a board, family or edge"
						aria-label="Find in the tree"
						className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-muted"
					/>
					{query ? (
						<button
							type="button"
							onClick={() => setQuery("")}
							aria-label="Clear the search"
							className="cursor-pointer rounded-sm text-fg-muted hover:text-fg"
						>
							<X size={13} />
						</button>
					) : null}
				</label>
				<button
					type="button"
					onClick={() => setOpened(new Set())}
					disabled={!openCount}
					aria-label="Close every folder"
					title="Close every folder"
					className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-control text-fg-muted transition-colors hover:text-fg disabled:pointer-events-none disabled:opacity-40"
				>
					<ChevronsDownUp size={14} />
				</button>
			</div>
			<ul className="relative mx-2 space-y-0.5 pb-6">
				<HoverPill />
				<li>
					<button
						type="button"
						onClick={() => onPick(null)}
						aria-current={selectedId === null || undefined}
						className={cn(
							"flex h-9 w-full cursor-pointer items-center gap-2 rounded-control pr-2.5 pl-2 text-left",
							selectedId === null && "bg-surface-overlay",
						)}
					>
						<span className="ta-label flex-1">{rootLabel}</span>
						<span className="font-mono text-[11px] text-fg-muted tabular-nums" title={n(total)}>
							{compact(total)}
						</span>
					</button>
				</li>
				{level(shown)}
				{q && !shown.length ? <li className="px-2 py-3 text-[13px] text-fg-muted">Nothing here matches.</li> : null}
			</ul>
		</div>
	);
});

function containsId(node: BrowseNode, id: string): boolean {
	return node.children.some((c) => c.id === id || containsId(c, id));
}
