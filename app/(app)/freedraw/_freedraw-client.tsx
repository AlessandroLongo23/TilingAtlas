"use client";

import { useEffect, useMemo, useState } from "react";
import { FreedrawCanvas } from "@/components/freedraw/freedraw-canvas";
import { ButtonGroup } from "@/components/ui/button-group";
import { Switch } from "@/components/ui/switch";
import { analyseFaces, rankLabel, summarise } from "@/lib/freedraw/faces";
import type { FreedrawPattern } from "@/lib/freedraw/pattern";
import type { FillMode } from "@/lib/freedraw/render";
import { cn } from "@/lib/utils/cn";

type KindFilter = "all" | "strip" | "unbounded" | "finite" | "holes";

const K_OPTIONS = [
	{ value: 0, label: "all k" },
	{ value: 1, label: "k = 1" },
	{ value: 2, label: "k = 2" },
	{ value: 3, label: "k = 3" },
];

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
	{ value: "all", label: "any tile" },
	{ value: "finite", label: "all finite" },
	{ value: "strip", label: "has strip" },
	{ value: "unbounded", label: "has unbounded" },
	{ value: "holes", label: "has holes" },
];

const FILL_OPTIONS: { value: FillMode; label: string }[] = [
	{ value: "none", label: "none" },
	{ value: "rank", label: "by kind" },
	{ value: "orbit", label: "by tile" },
];

export function FreedrawClient() {
	const [all, setAll] = useState<FreedrawPattern[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [kFilter, setKFilter] = useState(0);
	const [kind, setKind] = useState<KindFilter>("all");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [fillMode, setFillMode] = useState<FillMode>("rank");
	const [showScaffold, setShowScaffold] = useState(true);
	const [showVertices, setShowVertices] = useState(false);
	const [showLattice, setShowLattice] = useState(false);

	useEffect(() => {
		let live = true;
		fetch("/freedraw/solutions.json")
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
			.then((d: FreedrawPattern[]) => live && setAll(d))
			.catch((e: Error) => live && setError(e.message));
		return () => {
			live = false;
		};
	}, []);

	// Face analysis is cheap (linear in the fundamental domain), so classify the whole catalogue once
	// and keep the summaries around as the filter/sort keys.
	const rows = useMemo(() => {
		if (!all) return [];
		return all.map((p) => ({ pattern: p, stats: summarise(analyseFaces(p)) }));
	}, [all]);

	const shown = useMemo(
		() =>
			rows.filter(({ pattern, stats }) => {
				if (kFilter && pattern.k !== kFilter) return false;
				if (kind === "finite") return stats.strips === 0 && stats.unbounded === 0;
				if (kind === "strip") return stats.strips > 0;
				if (kind === "unbounded") return stats.unbounded > 0;
				if (kind === "holes") return stats.withHoles > 0;
				return true;
			}),
		[rows, kFilter, kind],
	);

	const selected = useMemo(
		() => shown.find((r) => r.pattern.id === selectedId) ?? shown[0] ?? null,
		[shown, selectedId],
	);
	const detail = useMemo(
		() => (selected ? analyseFaces(selected.pattern) : null),
		[selected],
	);

	// The detail pane is the interactive one, so it carries the lattice overlay and the orbit hover; the
	// thumbnails stay plain line art (neither reads at 116px, and the hover loop would run 166 times).
	const style = useMemo(
		() => ({ fillMode, showScaffold, showVertices, showLattice, lineWidth: 1 }),
		[fillMode, showScaffold, showVertices, showLattice],
	);
	const thumbStyle = useMemo(
		() => ({ fillMode, showScaffold, showVertices: false, showLattice: false, lineWidth: 1 }),
		[fillMode, showScaffold],
	);

	if (error) {
		return <div className="p-8 text-danger">Could not load the freedraw catalogue: {error}</div>;
	}
	if (!all) {
		return <div className="p-8 text-text-muted">Loading the freedraw catalogue…</div>;
	}

	return (
		<div className="flex flex-col h-full min-h-0">
			<header className="shrink-0 border-b border-line-subtle px-5 py-3">
				<div className="flex items-baseline gap-3 flex-wrap">
					<h1 className="text-lg font-semibold text-text-primary">Freedraw</h1>
					<p className="text-sm text-text-muted">
						Periodic edge subsets of the square grid with no dead ends. Tiles are whatever faces fall out,
						and they may be infinite. Enumerated independently and cross-checked against Marek
						Čtrnáct&apos;s solver: 13 solutions at k = 1, 153 at k = 2, 1254 at k = 3.
					</p>
				</div>
				<div className="mt-3 flex items-center gap-5 flex-wrap text-sm">
					<ButtonGroup options={K_OPTIONS} selected={kFilter} onChange={setKFilter} size="sm" />
					<ButtonGroup options={KIND_OPTIONS} selected={kind} onChange={setKind} size="sm" />
					<label className="flex items-center gap-2 text-text-secondary">
						fill
						<ButtonGroup options={FILL_OPTIONS} selected={fillMode} onChange={setFillMode} size="sm" />
					</label>
					<label className="flex items-center gap-2 text-text-secondary">
						<Switch checked={showScaffold} onCheckedChange={setShowScaffold} size="sm" />
						grid
					</label>
					<label className="flex items-center gap-2 text-text-secondary">
						<Switch checked={showLattice} onCheckedChange={setShowLattice} size="sm" />
						lattice
					</label>
					<label className="flex items-center gap-2 text-text-secondary">
						<Switch checked={showVertices} onCheckedChange={setShowVertices} size="sm" />
						orbits
					</label>
					<span className="text-text-muted ml-auto">{shown.length} shown</span>
				</div>
			</header>

			<div className="flex-1 min-h-0 flex">
				<div className="flex-1 min-w-0 overflow-y-auto p-4">
					<div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(116px,1fr))]">
						{shown.map(({ pattern, stats }) => (
							<button
								key={pattern.id}
								type="button"
								onClick={() => setSelectedId(pattern.id)}
								className={cn(
									"rounded-md overflow-hidden border text-left transition-colors",
									selected?.pattern.id === pattern.id
										? "border-accent ring-1 ring-accent"
										: "border-line-subtle hover:border-border-strong",
								)}
							>
								<div className="aspect-square">
									<FreedrawCanvas pattern={pattern} style={thumbStyle} cells={7} />
								</div>
								<div className="px-1.5 py-1 text-[11px] leading-tight text-text-muted">
									<div className="text-text-secondary">{pattern.id}</div>
									<div>
										{stats.faceOrbits} tile{stats.faceOrbits === 1 ? "" : "s"}
										{stats.strips > 0 && " · strip"}
										{stats.unbounded > 0 && " · ∞"}
										{stats.withHoles > 0 && " · holes"}
									</div>
								</div>
							</button>
						))}
					</div>
				</div>

				{selected && detail && (
					<aside className="w-[380px] shrink-0 border-l border-line-subtle flex flex-col min-h-0">
						<div className="aspect-square border-b border-line-subtle">
							<FreedrawCanvas pattern={selected.pattern} style={style} cells={11} interactive />
						</div>
						<div className="p-4 overflow-y-auto text-sm space-y-3">
							<div>
								<div className="font-semibold text-text-primary">{selected.pattern.id}</div>
								<div className="text-text-muted text-xs">
									drag to pan, wheel to zoom, double-click to reset
								</div>
							</div>
							<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
								<dt className="text-text-muted">grid-point orbits</dt>
								<dd className="text-text-secondary">k = {selected.pattern.k}</dd>
								<dt className="text-text-muted">period lattice</dt>
								<dd className="text-text-secondary">
									({selected.pattern.a}, 0), ({selected.pattern.b}, {selected.pattern.d}) · index{" "}
									{selected.pattern.a * selected.pattern.d}
								</dd>
								<dt className="text-text-muted">tile orbits</dt>
								<dd className="text-text-secondary">{detail.faces.length}</dd>
							</dl>
							<div>
								<div className="text-xs text-text-muted mb-1">tiles</div>
								<ul className="space-y-1">
									{detail.faces.map((f) => (
										<li key={f.id} className="text-xs text-text-secondary">
											<span className="text-text-primary">{rankLabel(f.rank)}</span>
											{f.rank === 0 && ` · ${f.cells} cell${f.cells === 1 ? "" : "s"}`}
											{f.rank === 0 && f.holes > 0 && ` · ${f.holes} hole${f.holes === 1 ? "" : "s"}`}
											{f.rank === 1 &&
												f.period &&
												` · ${f.cells} cell${f.cells === 1 ? "" : "s"} per period (${f.period[0]}, ${f.period[1]})`}
											{f.rank === 2 && " in both directions"}
										</li>
									))}
								</ul>
							</div>
						</div>
					</aside>
				)}
			</div>
		</div>
	);
}
