"use client";

import { useEffect, useMemo, useState } from "react";
import { buildTorusMap } from "@/lib/squaring/torusMap";
import { squareTorus } from "@/lib/squaring/torusSquaring";
import {
	classAngle,
	nearestClass,
	snapClass,
	sqSectorAt,
	sqSectors,
	squareTorusAt,
	torusFrame,
	torusSqDomains,
} from "@/lib/squaring/torusSqDomains";
import { torusShardUrl, type TorusIndexEntry, type TorusRecord } from "@/lib/squaring/shelf";
import { TorusTilingFigure } from "./torus-tiling-figure";
import { SquaresSmithDiagram } from "./smith-diagram-squares";
import { SquaredTorusFigure } from "./squared-torus-figure";
import { SqDomainFigure } from "./sq-domain-figure";
import { RailPanel, StageBoard } from "./stage-board";
import { num, torusFills } from "./torus-shared";

// One periodic tiling becoming one squared torus, in the same four stages as the polyhedron page.
//
// The control that replaces the battery is the homology class (m, n): the potential climbs by m across
// the cell one way and by n the other. Moving it re-runs the whole exact solve here in the browser,
// which is affordable for the same reason it is on the polyhedron page — these quotients top out at 30
// edges, so it is a small Bareiss elimination — and it is the only honest way to present a family that
// is genuinely continuous. There is no list of batteries to precompute.

const STAGES = [
	{ n: 1, title: "The periodic tiling", blurb: "Dashed: one translation cell. Gluing its opposite sides makes the torus." },
	{ n: 2, title: "The harmonic flow", blurb: "Potential on the vertices, current as thickness. It climbs across the cell instead of repeating." },
	{ n: 3, title: "The Smith diagram", blurb: "Height is potential; each wire is one square. Nothing terminates, because there are no poles." },
	{ n: 4, title: "The squared torus", blurb: "Every wire becomes a square. The dashed parallelogram is one fundamental domain." },
];

/** Largest |m| and n the steppers offer, matching the sweep in scripts/build-torus-shelf.ts. */
const LIMIT = 6;

// Module level, not component state: the explorer remounts this component on every tiling (it is keyed
// by id so the class control starts fresh), which would throw away a per-instance cache each time.
const shardCache = new Map<string, TorusRecord>();

export function TorusStages({ entry }: { entry: TorusIndexEntry }) {
	// Read straight from the cache during render. Copying it into state inside an effect instead would
	// render an empty frame first and then correct itself, and there is nothing to synchronise.
	const cached = shardCache.get(entry.id) ?? null;
	const [, bumpAfterFetch] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [cls, setCls] = useState<[number, number]>(entry.bestClass);
	const [hovered, setHovered] = useState<number | null>(null);
	const record = cached;

	useEffect(() => {
		if (shardCache.has(entry.id)) return;
		let live = true;
		fetch(torusShardUrl(entry.id))
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
			.then((data: TorusRecord) => {
				shardCache.set(entry.id, data);
				if (live) bumpAfterFetch((n) => n + 1);
			})
			.catch((e: Error) => {
				// A 404 here has one cause in practice: the shelf was rebuilt under a page that is still
				// holding the index it was served with, so it is asking for a record id that no longer
				// exists. Say that, and offer the reload that fixes it, instead of a dead end.
				if (live) setError(e.message === "404" ? "stale" : "failed");
			});
		return () => {
			live = false;
		};
	}, [entry.id]);

	const map = useMemo(() => {
		if (!record) return null;
		const built = buildTorusMap(record.cell);
		return built.ok ? built.map : null;
	}, [record]);

	// Integral classes take the exact BigInt solve; everything else is a float blend of the two solves
	// that span the family. Both are real squared tori — the class lives in H¹(T;ℝ) and nothing forces it
	// to be integral — but only the integral ones can be compared side against side, so only they print
	// their numbers. See lib/squaring/torusSqDomains.ts.
	const exact = Number.isInteger(cls[0]) && Number.isInteger(cls[1]);
	const frame = useMemo(() => (map ? torusFrame(map) : null), [map]);

	const solved = useMemo(() => {
		if (!map) return null;
		if (exact) {
			const r = squareTorus(map, cls[0], cls[1]);
			if (r.ok === false) return { squaring: null, failure: r.error.detail };
			return { squaring: r.squaring, failure: null };
		}
		if (!frame) return { squaring: null, failure: "the quotient map has no harmonic frame" };
		const s = squareTorusAt(frame, cls[0], cls[1]);
		return s ? { squaring: s, failure: null } : { squaring: null, failure: "every side vanishes in this direction" };
	}, [map, cls, exact, frame]);

	// Two more solves, at (1,0) and (0,1), which is all the parameter plane costs: every square's side
	// is a linear form in the class, so those two columns are the exact coefficients of every wall and
	// every tie. Keyed on the map, not the class, because none of it moves when the class does.
	const domains = useMemo(() => (map ? torusSqDomains(map) : null), [map]);
	const sectors = useMemo(() => (domains ? sqSectors(domains.walls) : []), [domains]);
	// Two angles, and they are not interchangeable. `theta` is reduced mod π, which is the space of
	// SECTORS: a class and its negative sit in the same one. `raw` is the honest direction on the full
	// circle, and it is what anything the pointer touches has to use, or the lower half snaps to the
	// upper one and the tiling point-reflects under the cursor.
	const theta = classAngle(cls[0], cls[1]);
	const raw = Math.atan2(cls[1], cls[0]);
	const active = sqSectorAt(sectors, theta);
	// The steppers only speak integers, so off the lattice they step from whichever integral class the
	// current direction is nearest. Nudging one is then a move to a neighbour, not a jump to the origin.
	const step = exact ? cls : nearestClass(raw, LIMIT);
	const litWall = domains === null || hovered === null ? -1 : domains.walls.findIndex((w) => w.edges.includes(hovered));

	const fills = useMemo(() => {
		if (!map) return [];
		const sq = solved?.squaring;
		return sq ? torusFills(sq, map.E) : new Array<string>(map.E).fill("var(--color-fg-muted)");
	}, [map, solved]);

	if (error)
		return (
			<div className="border border-line bg-surface-overlay/30 p-4 text-sm text-fg-muted">
				{error === "stale" ? (
					<>
						<p>
							This page is holding an older list of tilings: <span className="font-mono text-fg">{entry.id}</span>{" "}
							is no longer in the shelf. The shelf was rebuilt after the page loaded.
						</p>
						<button
							type="button"
							onClick={() => window.location.reload()}
							className="mt-3 border border-line px-2 py-1 text-[11px] transition-colors hover:text-fg"
						>
							Reload the page
						</button>
					</>
				) : (
					<p>
						Could not load <span className="font-mono text-fg">{entry.id}</span>. The request failed; the shelf may
						not have been built. Run{" "}
						<code className="font-mono">pnpm tsx scripts/build-torus-shelf.ts</code>.
					</p>
				)}
			</div>
		);
	if (!record || !map) return <p className="p-4 text-sm text-fg-muted">Loading…</p>;

	const squaring = solved?.squaring ?? null;

	if (squaring === null)
		return (
			<p className="border border-line bg-surface-overlay/30 p-4 text-sm text-fg-muted">
				No squaring at ({cls[0]}, {cls[1]}): {solved?.failure ?? "the class is degenerate"}. The zero class has no
				harmonic form, and classes where the form vanishes on an edge drop to a lower genus.
			</p>
		);

	return (
		<StageBoard
			control={
				<RailPanel
						label="control"
						title="The homology class"
						hint="Drag the ray; it sticks to the exact classes. Each diameter kills one square."
					>
						<div className="flex items-baseline justify-between gap-2">
							{exact ? (
								<p className="font-mono text-base leading-none text-fg">
									({cls[0]}, {cls[1]})
								</p>
							) : (
								<p className="font-mono text-base leading-none text-fg">{(((raw * 180) / Math.PI + 360) % 360).toFixed(2)}°</p>
							)}
							<button
								type="button"
								onClick={() => setCls(entry.bestClass)}
								className="border border-line px-1.5 py-0.5 text-[10px] text-fg-muted transition-colors hover:text-fg"
							>
								reset
							</button>
						</div>
						{/* Always rendered, at a fixed height. Showing it only off the lattice made the panel
						    grow and shrink under the cursor mid-drag, which moved the disk out from under the
						    pointer: the control fought the hand holding it. */}
						<p className="mt-1 h-3 overflow-hidden whitespace-nowrap font-mono text-[9px] leading-3 text-fg-muted">
							{exact ? "exact class · integer sides" : "off the integer lattice · sides irrational"}
						</p>
						{domains ? (
							<>
								<div className="mx-auto w-full max-w-[19rem]">
									<SqDomainFigure
										domains={domains}
										sectors={sectors}
										cls={cls}
										active={active}
										limit={LIMIT}
										onPick={setCls}
										onAngle={(a) => setCls(snapClass(a, LIMIT).cls)}
										hovered={hovered}
										onHover={setHovered}
										fills={fills}
									/>
								</div>
								<p className="h-8 overflow-hidden text-[10px] leading-snug text-fg-muted">
									{litWall >= 0 ? (
										<>
											The {domains.walls[litWall].edges.length === 1 ? "square" : "squares"} lit in the stages
											shrink{domains.walls[litWall].edges.length === 1 ? "s" : ""} to nothing on the highlighted
											diameter.
										</>
									) : (
										<>Diameters: one square dies. Rim ticks: two squares tie, so perfection is off every tick.</>
									)}
								</p>
							</>
						) : null}
						<div className="mt-1 flex flex-wrap items-end gap-4">
							<Stepper label="m" value={step[0]} min={-LIMIT} max={LIMIT} onChange={(v) => setCls([v, step[1]])} />
							<Stepper label="n" value={step[1]} min={-LIMIT} max={LIMIT} onChange={(v) => setCls([step[0], v])} />
						</div>
						<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-line pt-2.5 font-mono text-[10px]">
							<Fact label="order" value={String(squaring.order)} />
							<Fact
								label="distinct sizes"
								value={
									squaring.approx
										? "not certified"
										: `${squaring.distinct}${squaring.perfect ? " (perfect)" : ""}`
								}
							/>
							{domains ? (
								<Fact
									label="this class"
									value={active < 0 ? "on a wall" : `sector ${active + 1} of ${sectors.length}`}
								/>
							) : null}
							{domains ? <Fact label="walls · ties" value={`${domains.walls.length} · ${domains.ties.length}`} /> : null}
							{domains && domains.locked.length > 0 ? (
								<Fact label="locked pairs" value={String(domains.locked.length)} />
							) : null}
							<Fact label="quotient" value={`V ${map.V} · E ${map.E} · F ${map.F}`} />
							<Fact label="torus area" value={`${squaring.approx ? "≈ " : ""}${squaring.covolume}`} />
						</dl>
				</RailPanel>
			}
			stages={[
				{
					...STAGES[0],
					node: (
						<TorusTilingFigure map={map} squaring={squaring} mode="plain" hovered={hovered} onHover={setHovered} />
					),
				},
				{
					...STAGES[1],
					node: (
						<TorusTilingFigure map={map} squaring={squaring} mode="flow" hovered={hovered} onHover={setHovered} />
					),
				},
				{
					...STAGES[2],
					node: (
						<SquaresSmithDiagram
							squares={squaring.squares.map((q) => ({ x: num(q.x), y: num(q.y), side: num(q.side), edge: q.edge }))}
							fills={fills}
							hovered={hovered}
							onHover={setHovered}
						/>
					),
				},
				{
					...STAGES[3],
					node: (
						<SquaredTorusFigure
							squaring={squaring}
							hovered={hovered}
							onHover={setHovered}
							edges={map.E}
							labels={!squaring.approx}
						/>
					),
				},
			]}
		/>
	);
}

function Stepper({
	label,
	value,
	min,
	max,
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	onChange: (v: number) => void;
}) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-[9px] uppercase tracking-wide text-fg-muted">{label}</span>
			<div className="flex items-center gap-2">
				<button
					type="button"
					aria-label={`decrease ${label}`}
					onClick={() => onChange(Math.max(min, value - 1))}
					className="h-5 w-5 border border-line text-[11px] leading-none text-fg-muted transition-colors hover:text-fg"
				>
					−
				</button>
				<input
					type="range"
					min={min}
					max={max}
					step={1}
					value={value}
					onChange={(e) => onChange(Number(e.target.value))}
					className="w-16 accent-fg"
					aria-label={label}
				/>
				<button
					type="button"
					aria-label={`increase ${label}`}
					onClick={() => onChange(Math.min(max, value + 1))}
					className="h-5 w-5 border border-line text-[11px] leading-none text-fg-muted transition-colors hover:text-fg"
				>
					+
				</button>
			</div>
		</div>
	);
}

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col">
			<dt className="text-[9px] uppercase tracking-wide text-fg-muted">{label}</dt>
			<dd className="break-all text-fg">{value}</dd>
		</div>
	);
}
