/*
 * merge-plan.ts — apply a scan-family-joins.py plan to a built shelf.
 *
 * Two shelves need this (mixed, isotoxal) and more will: an α-slider family can be shipped twice, either as
 * the two halves of ONE deformation cut at a straight-vertex limit (a MERGE — spliced into one monotone
 * slider) or as the same family re-exported with α reversed (a DUPLICATE — absorbed outright). Both are
 * decided by the census, not here; this file only carries the plan out.
 *
 * Spec: docs/superpowers/specs/2026-07-25-mixed-family-merge-design.md
 * Census + findings: docs/DEVELOPMENT_NOTES.md §92–§94, §99
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateParamCell, type ParametricCellData, type ParamSegment, type ParamTerm } from "@/lib/utils/paramCell";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

export interface MergePlan {
	merges: {
		id: string; // survivor: the lower-numbered of the two ids
		aliases: string[];
		coordinate: "theta" | "sweep";
		range: [number, number];
		joinAt: number;
		defaultDeg: number;
		segments: {
			sourceId: string;
			range: [number, number];
			alphaOf: { m: number; c: number };
			alpha0Deg: number;
			pose: MergePose;
			starFlags: boolean[]; // per cellPolygon, unified across the seam so no tile changes colour there
		}[];
	}[];
	/** absorbed id → the entry that now carries it, with its α mapped onto that entry's coordinate. */
	aliases: Record<string, { to: string; uOf: { m: number; c: number } }>;
}

/** The isometry that carries one half's frame onto the other's. Identity for the primary half. */
export interface MergePose {
	rot: [number, number]; // unit complex ζ
	rotDeg: number;
	conj: boolean; // reflect first (z ↦ ζ·conj(z))
	translate: [number, number];
}

/**
 * Rewrite a symbolic vertex under a rigid motion, so the two halves of a merged family sit in ONE frame and
 * the pattern does not jump as the slider crosses the seam.
 *
 * A term [m, re, im] contributes (re+i·im)·e^{i·m·δ}. Rotating by ζ scales every coefficient by ζ.
 * Reflecting conjugates each coefficient AND negates its exponent, since conj(e^{i·m·δ}) = e^{−i·m·δ}.
 * Translating appends one constant (m = 0) term — vertices only: a basis vector is a difference, so it
 * rotates and reflects but must NOT be shifted.
 */
function posed(terms: ParamTerm[], pose: MergePose, translate: boolean): ParamTerm[] {
	const [zr, zi] = pose.rot;
	const out: ParamTerm[] = terms.map(([m, re, im]) => {
		const cr = re;
		const ci = pose.conj ? -im : im;
		const mm = pose.conj ? (typeof m === "number" ? -m : m.map((x) => -x)) : m;
		return [mm, zr * cr - zi * ci, zr * ci + zi * cr];
	});
	if (translate && (pose.translate[0] !== 0 || pose.translate[1] !== 0)) {
		out.push([0, pose.translate[0], pose.translate[1]]);
	}
	return out;
}

export interface ApplyOptions {
	/** Where the census writes its plan, and where the pre-merge snapshot it reads is written. */
	planPath: string;
	unmergedPath: string;
	/** Per-shelf alias table, statically imported by lib/services/referenceAtlas.ts. One file per shelf so
	 *  two builders never clobber each other's keys. */
	aliasPath: string;
	/** Shown in the "no plan" hint so each shelf prints its own regeneration command. */
	logName: string;
	note: string;
	log: (m?: string) => void;
	root: string;
}

/**
 * Splice each planned pair into one entry with one monotone slider, drop every absorbed id, and write the
 * alias table the app uses to keep their old links working.
 *
 * A merge survivor keeps its id and its `family` label — the label is the shelf's grouping and search key,
 * so rewriting it to name both halves would reshuffle the variant groups; the halves go in `familyHalves`
 * and are spelled out in the note instead. Every other field is rebuilt from the merged cell.
 */
export function applyMergePlan(out: ReferenceTiling[], opts: ApplyOptions): ReferenceTiling[] {
	const { planPath, unmergedPath, aliasPath, log, root } = opts;
	const rel = (p: string): string => path.relative(root, p);
	// The census needs the UNMERGED shelf to find the joins, and the shipped file is the merged one, so
	// snapshot the pre-merge array here. That closes the loop: build → snapshot → scan the snapshot → build.
	fs.mkdirSync(path.dirname(unmergedPath), { recursive: true });
	fs.writeFileSync(unmergedPath, JSON.stringify(out, null, 0) + "\n");
	log(`  pre-merge snapshot (${out.length}) → ${rel(unmergedPath)}`);
	if (!fs.existsSync(planPath)) {
		log(`  ⚑ no merge plan at ${rel(planPath)} — shipping the UNMERGED shelf`);
		log(`    (regenerate: python3 scripts/scan-family-joins.py ${rel(unmergedPath)} \\`);
		log(`         experiments/results/${opts.logName}-joins.log --emit-merge-plan ${rel(planPath)})`);
		return out;
	}
	const plan = JSON.parse(fs.readFileSync(planPath, "utf8")) as MergePlan;
	const byId = new Map(out.map((t) => [t.id, t]));
	const absorbed = new Set<string>();
	log("");
	log(`  --- merge plan: ${plan.merges.length} merge(s), ${Object.keys(plan.aliases).length} alias(es) ---`);
	for (const m of plan.merges) {
		const sources = m.segments.map((s) => byId.get(s.sourceId));
		if (sources.some((s) => !s)) {
			log(`  ⚑ ${m.id}: source family missing from this build — merge SKIPPED`);
			continue;
		}
		const primary = byId.get(m.id)!;
		const segments: ParamSegment[] = m.segments.map((s, i) => ({
			sourceId: s.sourceId,
			range: s.range,
			alphaOf: s.alphaOf,
			alpha0Deg: s.alpha0Deg,
			...(s.pose.rotDeg || s.pose.conj || s.pose.translate.some((x) => x !== 0)
				? { poseDeg: s.pose.rotDeg, poseConj: s.pose.conj, poseTranslate: s.pose.translate }
				: {}),
			// `star` is the renderer's hue selector (star ramp vs by-side-count ramp), so it is taken from the
			// plan's seam-unified flags, not the source family's: the flexing tile is a concave star on
			// one half and convex on the other, and keeping each half's own flag would flip its colour at the
			// join even though its shape is continuous.
			cellPolygons: sources[i]!.paramCell!.cellPolygons.map((poly, j) => ({
				n: poly.n,
				...(s.starFlags[j] ? { star: true } : {}),
				vertices: poly.vertices.map((v) => posed(v, s.pose, true)),
			})),
			basis: [posed(sources[i]!.paramCell!.basis[0], s.pose, false), posed(sources[i]!.paramCell!.basis[1], s.pose, false)],
		}));
		const p0 = primary.paramCell!.params[0];
		const paramCell: ParametricCellData = {
			params: [{
				name: m.coordinate,
				alpha0Deg: segments[0].alpha0Deg,
				deltaRangeDeg: [m.range[0] - m.defaultDeg, m.range[1] - m.defaultDeg],
				alphaRangeDegOpen: m.range,
				defaultAlphaDeg: m.defaultDeg,
				...(p0.tile ? { tile: p0.tile } : {}),
			}],
			// back-compat: the first segment's cell, so a consumer that ignores `segments` still draws a
			// real tiling (the first half of the sweep) instead of failing.
			cellPolygons: segments[0].cellPolygons,
			basis: segments[0].basis,
			segments,
		};
		const halves = m.segments.map((s) => byId.get(s.sourceId)!.family) as [string, string];
		primary.paramCell = paramCell;
		primary.alphaRange = m.range;
		primary.renderCell = evaluateParamCell(paramCell, m.defaultDeg) as ReferenceTiling["renderCell"];
		primary.familyHalves = halves;
		primary.mergedFrom = m.segments.map((s) => s.sourceId);
		primary.note =
			`${opts.note} MERGED: one continuous sweep spliced from two exported halves (${halves.join(" ↔ ")}), ` +
			`joined at ${m.coordinate} = ${m.joinAt}° where the flexing tile's alternating vertex is straight ` +
			`(180°) — concave star on one side, convex on the other. The slider is ` +
			`${m.coordinate === "theta" ? "that tile's own alternating interior angle" : "cumulative sweep angle"}` +
			`, monotone across the join.`;
		for (const a of m.aliases) absorbed.add(a);
		log(`  ${m.id}  ${m.coordinate} ∈ (${m.range[0]}°, ${m.range[1]}°) join ${m.joinAt}°  ← ${halves.join(" ↔ ")}`);
	}
	// Every remaining alias is a DUPLICATE absorption (an α-reversed re-export). Those never appear as a
	// merge but must still go, and the census guarantees no alias targets another absorbed id.
	let dupCount = 0;
	for (const [from, a] of Object.entries(plan.aliases)) {
		if (!byId.has(from)) continue;
		if (!byId.has(a.to)) {
			log(`  ⚑ alias ${from} → ${a.to}: target not in this build — kept`);
			continue;
		}
		if (!absorbed.has(from)) dupCount++;
		absorbed.add(from);
	}
	const kept = out.filter((t) => !absorbed.has(t.id));
	fs.mkdirSync(path.dirname(aliasPath), { recursive: true });
	fs.writeFileSync(aliasPath, JSON.stringify(plan.aliases, null, 1) + "\n");
	log(`  absorbed ${absorbed.size} id(s): ${plan.merges.length} merge partner(s) + ${dupCount} duplicate(s)`);
	log(`  ${out.length} → ${kept.length} entries; alias table → ${rel(aliasPath)}`);
	return kept;
}
