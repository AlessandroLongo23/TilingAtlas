"use client";

// Owns the board and advances it. The views (plane, torus) only draw — they share this one engine, so
// switching between them does not restart the simulation.
//
// TWO RULES SHAPE THIS FILE.
//
// The engine steps on a WALL-CLOCK accumulator rather than once per animation frame, so the generations
// per second the sidebar asks for is the rate you get on a 60 Hz and a 120 Hz display alike, and a heavy
// rule drops generations instead of dragging the frame rate down with it.
//
// And the rAF loop is the ONLY thing that writes React state. Building an engine, seeding it and stepping
// it are all external-system work; if they published as they went, every rule keystroke would cascade a
// render mid-commit. Instead they raise a dirty flag and the next frame publishes one snapshot — which
// also means an idle, paused board renders nothing at all.

import { useCallback, useEffect, useRef, useState } from "react";
import { neighborhoodOf } from "@/lib/automata/adjacency";
import type { BoardPlan } from "@/lib/automata/board";
import { AutomatonEngine, type StepStats } from "@/lib/automata/engine";
import { buildRuleTable, parseRule } from "@/lib/automata/rule";
import { useAutomata } from "@/lib/stores/automata";

export interface EngineReport extends StepStats {
	/** Neighbour count per slot in the active neighbourhood — the number a rule string is read against. */
	degrees: number[];
	/** Side count per slot, for the per-shape rule inputs. */
	sides: number[];
	slots: number;
	/** Generations per second actually achieved, averaged over the last half second. */
	rate: number;
}

const EMPTY: EngineReport = {
	generation: 0,
	population: 0,
	density: 0,
	born: 0,
	died: 0,
	blocks: 0,
	degrees: [],
	sides: [],
	slots: 0,
	rate: 0,
};

export function useAutomatonEngine(plan: BoardPlan | null) {
	const engineRef = useRef<AutomatonEngine | null>(null);
	const [report, setReport] = useState<EngineReport>(EMPTY);

	const accRef = useRef(0);
	const lastRef = useRef(0);
	const rateRef = useRef({ steps: 0, since: 0, value: 0 });
	/** Static facts about the current board, refreshed on rebuild and merged into every publish. */
	const metaRef = useRef({ degrees: [] as number[], sides: [] as number[], slots: 0 });
	const statsRef = useRef<StepStats | null>(null);
	const dirtyRef = useRef(true);
	/** The plan the live engine was built from, so a rule edit knows the board underneath is unchanged. */
	const planRef = useRef<BoardPlan | null>(null);

	// Latest config for `rebuild`, which effects call. Written in an effect, not during render, and
	// DECLARED FIRST so it commits before the rebuild effects below read it — effects run in declaration
	// order, so a rule edit syncs here and is already visible when the rebuild fires on the same commit.
	const cfg = useAutomata();
	const cfgRef = useRef(cfg);
	useEffect(() => {
		cfgRef.current = cfg;
	}, [cfg]);

	/** (Re)build the engine. `preserve` keeps the current board when only the rule changed. */
	const rebuild = useCallback(
		(preserve: boolean) => {
			dirtyRef.current = true;
			const adj = plan?.adj ?? null;
			if (!adj) {
				engineRef.current = null;
				metaRef.current = { degrees: [], sides: [], slots: 0 };
				statsRef.current = null;
				return;
			}
			const c = cfgRef.current;
			const parsed = parseRule(c.rule);
			const range = Math.max(1, c.range, parsed.range);
			const nb = neighborhoodOf(adj, c.neighborhood, range);
			const perShape = Object.fromEntries(
				Object.entries(c.perShapeRules).map(([k, v]) => [Number(k), parseRule(v)]),
			);
			const table = buildRuleTable(parsed, nb.map((l) => l.length), adj.sides, c.semantics, perShape);
			metaRef.current = { degrees: nb.map((l) => l.length), sides: adj.sides, slots: adj.n };

			// The board — periods and, on a non-orientable surface, the deck transformation whose invariance
			// makes the double cover a faithful simulation of the quotient. All of it decided in
			// lib/automata/board.ts, so the engine, the flat renderer and the 3D view cannot disagree.
			const existing = engineRef.current;
			if (preserve && existing && planRef.current === plan) {
				// The pattern survives a rule edit; only the decision table is swapped.
				existing.setNeighbors(nb, table);
				return;
			}
			planRef.current = plan;

			const eng = new AutomatonEngine(adj, nb, table, {
				wrapI: plan.wrapI,
				wrapJ: plan.wrapJ,
				involution: plan.involution,
			});
			eng.randomize(c.density, c.seed, c.soupSize, c.soupSize);
			engineRef.current = eng;
			accRef.current = 0;
			// Report the soup's own density, not 0 — the panel is read before the first step is taken.
			statsRef.current = {
				generation: 0,
				population: eng.population,
				density: eng.population / eng.cellCapacity,
				born: 0,
				died: 0,
				blocks: eng.blockCount,
			};
		},
		[plan],
	);

	// A new tiling, a new board shape or an explicit reseed restarts from a fresh soup. The plan carries
	// the first two, so its identity is the dependency.
	useEffect(() => {
		rebuild(false);
	}, [rebuild, cfg.resetNonce]);

	// A rule edit swaps the decision table under the running pattern.
	useEffect(() => {
		rebuild(true);
	}, [rebuild, cfg.rule, cfg.semantics, cfg.neighborhood, cfg.range, cfg.perShapeRules]);

	// Single-step while paused. Advances the external system only; the loop publishes it next frame.
	useEffect(() => {
		if (cfg.stepNonce === 0) return;
		const eng = engineRef.current;
		if (!eng) return;
		statsRef.current = eng.step();
		dirtyRef.current = true;
	}, [cfg.stepNonce]);

	useEffect(() => {
		let raf = 0;
		const tick = (time: number) => {
			raf = requestAnimationFrame(tick);
			const eng = engineRef.current;
			const c = cfgRef.current;
			const dt = lastRef.current ? (time - lastRef.current) / 1000 : 0;
			lastRef.current = time;

			if (eng && c.running && c.speed > 0) {
				// Cap the catch-up so a backgrounded tab does not return and run a thousand generations.
				accRef.current = Math.min(accRef.current + dt, 0.5);
				const interval = 1 / c.speed;
				let steps = 0;
				while (accRef.current >= interval && steps < 16) {
					statsRef.current = eng.step();
					accRef.current -= interval;
					steps++;
				}
				if (steps > 0) dirtyRef.current = true;
				const r = rateRef.current;
				r.steps += steps;
				r.since += dt;
				if (r.since >= 0.5) {
					r.value = r.steps / r.since;
					r.steps = 0;
					r.since = 0;
				}
			}

			if (!dirtyRef.current) return;
			dirtyRef.current = false;
			const stats = statsRef.current ?? EMPTY;
			const meta = metaRef.current;
			// A Möbius or Klein board is stored as its orientation double cover, so every tile is held
			// twice. Report the surface's own figures, not the cover's. Density is a ratio and unaffected.
			const cover = eng?.coverFactor ?? 1;
			setReport({
				...stats,
				population: stats.population / cover,
				born: stats.born / cover,
				died: stats.died / cover,
				degrees: meta.degrees,
				sides: meta.sides,
				slots: meta.slots,
				rate: eng && c.running ? rateRef.current.value : 0,
			});
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, []);

	return { engineRef, report };
}
