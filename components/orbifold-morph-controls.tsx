"use client";

// Tegula's symmetry panel, folded under Symmetry in the view options (options-tab.tsx), on every flat
// periodic tiling and on the Tegula solids: one stepper per vertex
// class and per tile class, setting the rotation order at its centre. The type keeps its topology and its
// chambers; the group changes, and with it the geometry the tiling lives in (lib/tilings/orbifoldMorph.ts).
// Below the steppers, the atlas entries of the type it lands on, when it is catalogued (morphRelatives.ts).

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { DSymbol } from "@/lib/classes/algorithm/delaney/DSymbol";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { findRelatives, type RelativeSearch } from "@/lib/services/morphRelatives";
import {
	conePoints,
	geometryOf,
	orbifoldName,
	type RecordShape,
	stepOrder,
	withOrders,
} from "@/lib/tilings/orbifoldMorph";
import { useOrbifoldMorph } from "@/stores/orbifoldMorph";
import { Button } from "@/design-system/components/button";
import { Tooltip } from "@/design-system/components/tooltip";

const GEOMETRY = { 1: "spherical", 0: "Euclidean", [-1]: "hyperbolic" } as const;

export function OrbifoldMorphControls({
	id,
	symbol,
	error,
	bent,
	topological,
	loaded,
	shape,
}: {
	id: string;
	symbol: DSymbol;
	/** Why the current orders could not be drawn, if they could not. */
	error?: string;
	bent?: boolean;
	/** The record is not a Tegula type: its symbol was read off the cell, and the shapes will not survive. */
	topological?: boolean;
	/** The records /play holds, searched first for the type the morph lands on. */
	loaded: readonly CatalogueTiling[];
	/** The record's drawn shape (recordSymbol.ts), so a tile is named by the corners the reader sees. */
	shape?: RecordShape | null;
}) {
	const points = useMemo(() => conePoints(symbol), [symbol]);
	const original = useMemo(() => points.map((p) => p.v), [points]);
	const from = useMemo(() => orbifoldName(symbol), [symbol]);
	const custom = useOrbifoldMorph((s) => s.byId[id]);
	const orders = custom ?? original;
	const now = useMemo(() => withOrders(symbol, orders), [symbol, orders]);
	const name = useMemo(() => orbifoldName(now), [now]);
	const setHover = useOrbifoldMorph((st) => st.setHover);
	// A hover belongs to this tiling's rows: clear it when the panel goes or the tiling changes.
	useEffect(() => () => setHover(null), [id, setHover]);

	// The search runs a moment after the last step, so stepping through orders does not queue fetches.
	const [relatives, setRelatives] = useState<RelativeSearch | "searching" | null>(null);
	useEffect(() => {
		if (!custom) return setRelatives(null);
		let alive = true;
		setRelatives("searching");
		const t = setTimeout(() => {
			findRelatives(now, loaded)
				.then((r) => alive && setRelatives(r))
				.catch(() => alive && setRelatives(null));
		}, 300);
		return () => {
			alive = false;
			clearTimeout(t);
		};
		// `loaded` grows as shelves land; a search is not rerun for that.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [custom, now]);

	const step = (k: number, dir: -1 | 1) => {
		const next = stepOrder(symbol, orders, k, orders[k] + dir);
		if (!next) return;
		// Back at the catalogued orders the shelf's own drawing (and its edge shapes) takes over again.
		if (next.every((v, t) => v === original[t])) useOrbifoldMorph.getState().reset(id);
		else useOrbifoldMorph.getState().set(id, next);
	};

	return (
		<div className="pt-2">
			<div className="mb-2 flex items-center text-small text-fg">
				<p className="flex-1">
					<span className="font-mono">{from}</span>
					{custom ? (
						<>
							{" → "}
							<span className="font-mono">{name}</span>
						</>
					) : null}
					<span className="ml-1.5 text-caption text-fg-muted">{GEOMETRY[geometryOf(now)]}</span>
				</p>
				<Tooltip label="Reset">
					<Button
						variant="ghost"
						size="xs"
						icon={RotateCcw}
						aria-label="Reset the symmetry group"
						disabled={!custom}
						onClick={() => useOrbifoldMorph.getState().reset(id)}
						className="w-6 px-0"
					/>
				</Tooltip>
			</div>
			<ul className="flex flex-col gap-1" onMouseLeave={() => setHover(null)}>
				{points.map((p, k) => {
					// Named by what the reader sees, at the current orders: a tile by its sides, a vertex by its degree.
					const c = p.chambers[0];
					// Drawn corners: the topological sides plus the points drawn along them (a star's dents).
					const along = shape ? p.chambers.reduce((n, d) => n + shape.bends[d].length, 0) / p.chambers.length : 0;
					const sides = Math.round(now.m01[c] * (1 + along));
					const star = shape?.tiles[c]?.star;
					const label =
						p.kind === "vertex"
							? `Vertex of degree ${now.m12[c]}`
							: p.kind === "tile"
								? star
									? `${Math.round(sides / 2)}-pointed star`
									: `${sides}-sided tile`
								: "Edge midpoint";
					// Where the point sits in the orbifold: with an order above 1 it is a corner (on a mirror) or a
					// rotation centre; at order 1 it is just a point of a mirror or of the interior.
					const role =
						p.v > 1
							? p.mirror
								? "corner"
								: p.kind === "edge"
									? "half-turn"
									: "rotation"
							: p.mirror
								? "mirror"
								: "interior";
					const fixed = p.kind === "edge";
					const down = !fixed && stepOrder(symbol, orders, k, orders[k] - 1);
					const up = !fixed && stepOrder(symbol, orders, k, orders[k] + 1);
					// The orbifold's own points come first; the order-1 classes after a divider.
					const divider = p.v === 1 && (k === 0 || points[k - 1].v > 1);
					return (
						<li key={k} className="flex flex-col" onMouseEnter={() => setHover(k)}>
							{divider ? (
								<p className="mt-1 mb-1 border-t border-line-subtle pt-1.5 text-micro text-fg-muted">
									Order 1. Raise one to add a rotation point.
								</p>
							) : null}
							<div className="flex items-center gap-1.5 rounded-tag text-caption hover:bg-surface">
								<span className="flex-1 text-fg-secondary">
									{label}
									<span className="ml-1 text-micro text-fg-muted">{role}</span>
								</span>
								<button
									type="button"
									aria-label={`Lower the rotation order at ${label}`}
									disabled={!down}
									onClick={() => step(k, -1)}
									className={`rounded-tag p-0.5 text-fg-muted ring-1 ring-line-subtle hover:text-fg disabled:opacity-30 ${fixed ? "invisible" : ""}`}
								>
									<Minus className="size-icon-xs" />
								</button>
								<span className="w-5 text-center font-mono text-fg tabular-nums">{orders[k]}</span>
								<button
									type="button"
									aria-label={`Raise the rotation order at ${label}`}
									disabled={!up}
									onClick={() => step(k, 1)}
									className={`rounded-tag p-0.5 text-fg-muted ring-1 ring-line-subtle hover:text-fg disabled:opacity-30 ${fixed ? "invisible" : ""}`}
								>
									<Plus className="size-icon-xs" />
								</button>
							</div>
						</li>
					);
				})}
			</ul>
			{custom ? <RelativesNote state={relatives} /> : null}
			<p className="mt-1.5 text-micro leading-tight text-fg-muted">
				{error
					? `Not drawn: ${error}.`
					: bent && custom
						? "Two tiles share more than one edge, so the edges bend at their midpoints."
						: topological
							? "The order of rotation about each vertex and tile centre. Which tiles meet is kept; their shapes are not, so a result is this tiling's topological relative."
							: "The order of rotation about each vertex and tile centre. The topology stays; the geometry follows the group."}
			</p>
		</div>
	);
}

function RelativesNote({ state }: { state: RelativeSearch | "searching" | null }) {
	if (!state) return null;
	if (state === "searching") return <p className="mt-2 text-caption text-fg-muted">Looking for it in the atlas…</p>;
	const partial =
		state.unsearched > 0 ? ` (${state.unsearched.toLocaleString()} tilings on larger boards not searched)` : "";
	if (state.found.length === 0) return <p className="mt-2 text-caption text-fg-muted">Not in the atlas{partial}.</p>;
	return (
		<div className="mt-2 text-caption">
			<p className="text-fg-secondary">In the atlas as{partial}:</p>
			<ul className="mt-0.5 flex flex-col gap-0.5">
				{state.found.slice(0, 6).map((r) => (
					<li key={r.id}>
						<a href={`/catalogue/view?tiling=${encodeURIComponent(r.id)}`} className="ta-link">
							{r.label}
						</a>
						<span className="ml-1 font-mono text-micro text-fg-muted">{r.id}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
