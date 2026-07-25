/*
 * coupled-plan.ts — collapse the 1-D slices of a coupled multi-parameter family into one entry.
 *
 * The mixed exporter gives a species its own slider only when it flexes ALONE. When the flex space is
 * 2-dimensional but every species is coupled it develops a single direction — a 1-D line through whichever
 * grid member it started from — and since the pinned angle enters the family key, each parallel line ships
 * as its own family. AL spotted three such entries on /play (k2-45/46/50); the census found six of them are
 * four lines through ONE 2-parameter family, and that whole grid lines are missing because the palette has
 * no species to seed them.
 *
 * This applies the census plan: the survivor's paramCell becomes the real 2-parameter cell with its
 * polytope region, the absorbed slices leave the shelf, and each gets an alias carrying (its α) → (the
 * survivor's α-pair) so an existing deep link lands on the right point of the region AND on the line it
 * used to travel along.
 *
 * Census: scripts/scan-coupled-families.py.  Findings: docs/DEVELOPMENT_NOTES.md §103.
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateParamCell, type ParametricCellData, type ParamTerm } from "@/lib/utils/paramCell";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

export interface CoupledPlan {
	families: {
		id: string;
		P: number;
		vertype: string;
		species: string[];
		seedUnits: number[];
		basis: number[][];
		params: ParametricCellData["params"];
		region: NonNullable<ParametricCellData["region"]>;
		regionVertices: [number, number][];
		cellPolygons: ParametricCellData["cellPolygons"];
		basisTerms: [ParamTerm[], ParamTerm[]];
		absorbs: { id: string; deltaUnits: number[]; alpha0Deg: number; axisUnits: number[] | null }[];
		selfAxisUnits: number[] | null;
		selfAlpha0Deg: number;
	}[];
}

/** An absorbed slice's α maps to the survivor's α-tuple: seed δ, then travel along the slice's own axis. */
export interface CoupledAlias {
	to: string;
	/** α_survivor[p] = alpha0Deg[p] + 15·(deltaUnits[p] + ((α − alpha0Deg_from)/15)·axisUnits[p]) */
	fromAlpha0Deg: number;
	deltaUnits: number[];
	axisUnits: number[];
	survivorAlpha0Deg: number[];
}

export interface ApplyCoupledOptions {
	planPath: string;
	aliasPath: string;
	logName: string;
	note: string;
	log: (m?: string) => void;
	root: string;
}

export function applyCoupledPlan(out: ReferenceTiling[], opts: ApplyCoupledOptions): ReferenceTiling[] {
	const { planPath, aliasPath, log, root } = opts;
	const rel = (p: string): string => path.relative(root, p);
	if (!fs.existsSync(planPath)) {
		log(`  ⚑ no coupled-family plan at ${rel(planPath)} — shipping the 1-D slices`);
		log(`    (regenerate: python3 scripts/scan-coupled-families.py \\`);
		log(`         experiments/results/${opts.logName}-coupled.log --emit-plan ${rel(planPath)})`);
		return out;
	}
	const plan = JSON.parse(fs.readFileSync(planPath, "utf8")) as CoupledPlan;
	const byId = new Map(out.map((t) => [t.id, t]));
	const aliases: Record<string, CoupledAlias> = {};
	const absorbed = new Set<string>();
	log("");
	log(`  --- coupled-family plan: ${plan.families.length} multi-parameter famil(ies) ---`);
	for (const f of plan.families) {
		const t = byId.get(f.id);
		if (!t) {
			log(`  ⚑ ${f.id}: not in this build — skipped`);
			continue;
		}
		if (f.P < 2 || !f.region.length) {
			log(`  ⚑ ${f.id}: plan carries P=${f.P} with ${f.region.length} region rows — skipped`);
			continue;
		}
		const paramCell: ParametricCellData = {
			params: f.params,
			cellPolygons: f.cellPolygons,
			basis: f.basisTerms,
			region: f.region,
			regionVertices: f.regionVertices,
		};
		const defaults = f.params.map((p) => p.defaultAlphaDeg);
		t.paramCell = paramCell;
		t.alphaRange = f.params[0].alphaRangeDegOpen;
		t.renderCell = evaluateParamCell(paramCell, defaults) as ReferenceTiling["renderCell"];
		t.mergedFrom = [f.id, ...f.absorbs.map((a) => a.id)];
		const axes = f.params.map((p) => p.tile ?? "?").join(" × ");
		t.note =
			`${opts.note} TWO-PARAMETER FAMILY: the export shipped this as ${f.absorbs.length + 1} separate ` +
			`1-dimensional slices, one per palette value of the angle it happened to pin. It is really one ` +
			`family with ${f.P} free angles (${axes}); the third angle of each vertex is determined by them. ` +
			`The valid region is a ${f.regionVertices.length}-sided polygon, not a rectangle, so the two ` +
			`angles are free but coupled — which is why it is explored on a 2-D region rather than two ` +
			`independent sliders. Absorbed slices: ${f.absorbs.map((a) => a.id.split("-").pop()).join(", ")}.`;
		// The survivor kept its id but not its coordinate: one angle became a point in a 2-D region. Alias
		// it to ITSELF so an existing single-α link travels the line it used to travel.
		if (f.selfAxisUnits) {
			aliases[f.id] = {
				to: f.id,
				fromAlpha0Deg: f.selfAlpha0Deg,
				deltaUnits: f.params.map(() => 0),
				axisUnits: f.selfAxisUnits,
				survivorAlpha0Deg: f.params.map((p) => p.alpha0Deg),
			};
		}
		for (const a of f.absorbs) {
			if (!a.axisUnits) {
				log(`  ⚑ ${f.id}: ${a.id} has no derived slider axis — NOT absorbed (its links would land wrong)`);
				continue;
			}
			absorbed.add(a.id);
			aliases[a.id] = {
				to: f.id,
				fromAlpha0Deg: a.alpha0Deg,
				deltaUnits: a.deltaUnits,
				axisUnits: a.axisUnits,
				survivorAlpha0Deg: f.params.map((p) => p.alpha0Deg),
			};
		}
		log(`  ${f.id}  P=${f.P}  axes ${axes}  region ${f.regionVertices.length}-gon  `
			+ `absorbs ${f.absorbs.map((a) => a.id.split("-").pop()).join(", ") || "(none)"}`);
	}
	const kept = out.filter((t) => !absorbed.has(t.id));
	fs.mkdirSync(path.dirname(aliasPath), { recursive: true });
	fs.writeFileSync(aliasPath, JSON.stringify(aliases, null, 1) + "\n");
	log(`  ${out.length} → ${kept.length} entries; coupled alias table → ${rel(aliasPath)}`);
	return kept;
}
