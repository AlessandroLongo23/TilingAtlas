// Life-like rules, and what a rule string means when the tiles do not all have the same number of
// neighbours.
//
// THE PROBLEM THIS MODULE NAMES. "B3/S23" is unambiguous on the square grid because every cell has
// exactly eight Moore neighbours. On 3.4.6.4 a triangle has 3 edge-neighbours, a square 4 and a hexagon
// 6, so "born on exactly 3" is a near-certainty for the hexagon and impossible-but-for-saturation for the
// triangle. The literature has no settled answer; Owens & Stepney (JCA 5(3), 2010) run absolute counts on
// Penrose, Marr & Hütt (arXiv:0812.2408) work in normalized thresholds on graphs, and Bays' tessellation
// papers pick a rule per tessellation by hand. All three readings are defensible and they disagree, so
// this module implements all three and makes the choice visible in the UI instead of hiding it behind a
// magic threshold (which is what TilingLife did: it silently switched to fractions whenever a rule's
// bounds happened to be ≤ 1).

export type Neighborhood = "edge" | "moore";

/** How a rule's neighbour counts are read on a tiling whose tiles differ in degree. */
export type RuleSemantics =
	/** Counts are absolute. B3 means exactly three live neighbours, whatever the tile's degree. */
	| "absolute"
	/** Counts are fractions of a reference degree, rescaled to each tile's own degree. */
	| "normalized"
	/** One rule string per tile side-count. Degree never enters; the shapes are simply different automata. */
	| "perShape";

export interface ParsedRule {
	/** Live-neighbour counts that turn a dead cell live. */
	birth: number[];
	/** Live-neighbour counts that keep a live cell live. */
	survival: number[];
	/**
	 * Total state count (Generations). 2 = plain two-state Life. C > 2 gives states 2..C-1 as a decay
	 * tail: a cell that fails survival ages instead of dying, and only state 1 counts as a neighbour.
	 */
	states: number;
	/** Neighbourhood graph the counts are taken over. */
	neighborhood: Neighborhood;
	/** Graph distance the neighbourhood is expanded to (Larger-than-Life). 1 = immediate neighbours. */
	range: number;
}

export const DEFAULT_RULE: ParsedRule = {
	birth: [3],
	survival: [2, 3],
	states: 2,
	neighborhood: "moore",
	range: 1,
};

/** Expand "34" → [3,4] and "33-57" → [33,…,57]; both forms appear in the wild. */
function parseCounts(body: string): number[] {
	if (body === "") return [];
	if (body.includes("-")) {
		const [lo, hi] = body.split("-").map(Number);
		if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return [];
		// Guard the range so a typo cannot allocate an enormous array.
		const out: number[] = [];
		for (let i = lo; i <= Math.min(hi, lo + 1024); i++) out.push(i);
		return out;
	}
	// Comma form ("3,4,6", Bays' notation) and the classic digit-run form ("23") are both accepted.
	if (body.includes(",")) return body.split(",").map(Number).filter(Number.isFinite);
	return [...body].map(Number).filter((d) => Number.isFinite(d));
}

/**
 * Parse a rule string.
 *
 * Accepts B/S with optional /G (Generations), and the Larger-than-Life comma form
 * ("R5,C2,S33-57,B34-45"). Unknown segments are ignored rather than rejected, so a rule pasted from
 * LifeWiki with an extra qualifier still runs.
 */
export function parseRule(input: string): ParsedRule {
	const rule: ParsedRule = { ...DEFAULT_RULE, birth: [], survival: [] };
	const text = input.trim().toUpperCase();
	// "B3/S23" and "R5,C2,S33-57,B34-45" are the same grammar with a different delimiter, and some
	// sources mix them. A comma only separates SEGMENTS when a segment letter follows it; inside a body
	// it separates counts, which is how Bays writes his tessellation rules ("B3,4,6/S23").
	const pieces = text.split(/\/|,(?=[A-Z])/).filter((p) => p.length > 0);
	for (const piece of pieces) {
		const head = piece[0];
		const body = piece.slice(1);
		if (head === "B") rule.birth = parseCounts(body);
		else if (head === "S" || head === "E") rule.survival = parseCounts(body);
		else if (head === "G" || head === "C") rule.states = Math.max(2, parseInt(body, 10) || 2);
		else if (head === "R") rule.range = Math.max(1, parseInt(body, 10) || 1);
		else if (head === "N") rule.neighborhood = body.startsWith("N") || body.startsWith("V") ? "edge" : "moore";
	}
	return rule;
}

/** Render a parsed rule back to a canonical B/S[/G] string — what the URL carries and the UI shows. */
export function formatRule(rule: ParsedRule): string {
	const run = (xs: number[]) => (xs.every((x) => x < 10) ? xs.join("") : xs.join(","));
	let s = `B${run(rule.birth)}/S${run(rule.survival)}`;
	if (rule.states > 2) s += `/G${rule.states}`;
	if (rule.range > 1) s += `/R${rule.range}`;
	return s;
}

/**
 * A per-degree lookup: for each possible live-neighbour count, does it birth / does it survive.
 *
 * Precomputing this is what keeps the inner loop free of semantics. The engine indexes
 * `birthMask[slotDegree][aliveCount]` and never asks which reading is in force.
 */
export interface RuleTable {
	/** birth[t][c] — slot t, c live neighbours. */
	birth: Uint8Array[];
	survival: Uint8Array[];
	states: number;
}

/**
 * Build the per-slot decision tables.
 *
 * `degrees[t]` is slot t's neighbour count in the chosen neighbourhood, `sides[t]` its side count.
 *
 * Normalized mode rescales: a tile of degree d is treated as if it had `reference` neighbours, by mapping
 * a live count c to round(c * reference / d) and testing that against the rule's sets. At d = reference
 * it is exactly absolute mode, which is the degenerate case that makes it a generalization instead of a
 * different rule. The default reference is the tiling's maximum degree, so the busiest tile reads its
 * rule literally and the sparser ones are scaled up to it.
 */
export function buildRuleTable(
	rule: ParsedRule,
	degrees: number[],
	sides: number[],
	semantics: RuleSemantics,
	perShape: Record<number, ParsedRule> = {},
	reference?: number,
): RuleTable {
	const n = degrees.length;
	const birth: Uint8Array[] = [];
	const survival: Uint8Array[] = [];
	const ref = reference ?? Math.max(1, ...degrees);
	let states = rule.states;

	for (let t = 0; t < n; t++) {
		const d = degrees[t];
		const b = new Uint8Array(d + 1);
		const s = new Uint8Array(d + 1);
		const active = semantics === "perShape" ? (perShape[sides[t]] ?? rule) : rule;
		if (semantics === "perShape") states = Math.max(states, active.states);

		for (let c = 0; c <= d; c++) {
			const probe = semantics === "normalized" && d > 0 ? Math.round((c * ref) / d) : c;
			b[c] = active.birth.includes(probe) ? 1 : 0;
			s[c] = active.survival.includes(probe) ? 1 : 0;
		}
		birth.push(b);
		survival.push(s);
	}
	return { birth, survival, states };
}

/** Curated rules, split by what they need from the grid. Shown in the sidebar's rule browser. */
export interface RulePreset {
	name: string;
	rule: string;
	description: string;
}

/** Rules defined on the square grid. On another tiling they are a starting point, not a promise. */
export const CLASSIC_RULES: RulePreset[] = [
	{ name: "Conway's Life", rule: "B3/S23", description: "The original. On 8 Moore neighbours; on any other degree it is a different automaton wearing the same name." },
	{ name: "HighLife", rule: "B36/S23", description: "Life plus birth on 6. Contains a replicator." },
	{ name: "Day & Night", rule: "B3678/S34678", description: "Symmetric under swapping live and dead." },
	{ name: "Seeds", rule: "B2/S", description: "Nothing survives; everything is birth. Explosive." },
	{ name: "Life without Death", rule: "B3/S012345678", description: "Once live, always live. Grows mazes forever." },
	{ name: "Maze", rule: "B3/S12345", description: "Corridors and dead ends." },
	{ name: "Replicator", rule: "B1357/S1357", description: "Fredkin's rule: every pattern is replaced by copies of itself." },
	{ name: "Anneal", rule: "B4678/S35678", description: "Twisted majority. Approximates curve-shortening on the live/dead boundary." },
];

/** Rules published for non-square tessellations. Bays writes survival first; these are converted. */
export const TESSELLATION_RULES: RulePreset[] = [
	{ name: "Hex Life (community)", rule: "B2/S34", description: "The rule the hexagonal-Life community settled on. 6 edge-neighbours." },
	{ name: "Hex Life (Bays)", rule: "B2/S345", description: "Bays' hexagonal Game of Life, Complex Systems 15(3) 2005 — his 3,5/2. Has a period-5 glider." },
	{ name: "Cairo pentagonal (Bays)", rule: "B3,4,6/S23", description: "Bays' pentagonal Game of Life on the Cairo tiling — his 2,3/3,4,6. Period-48 glider." },
	{ name: "Triangular (Bays)", rule: "B45/S456", description: "From Bays' 1994 triangular study; 12 neighbours in the Moore sense." },
];

export const GENERATIONS_RULES: RulePreset[] = [
	{ name: "Brian's Brain", rule: "B2/S/G3", description: "Every live cell dies after one step through a refractory state. Pure spaceship soup." },
	{ name: "Star Wars", rule: "B2/S345/G4", description: "Generations rule with stable structures and gliders." },
	{ name: "Frogs", rule: "B34/S12/G3", description: "Restless texture." },
	{ name: "Gnarl", rule: "B1/S1/G10", description: "Birth and survival on exactly one. Branching filaments." },
];

export const LTL_RULES: RulePreset[] = [
	{ name: "Bosco's Rule", rule: "R5,C2,S33-57,B34-45", description: "Larger-than-Life at range 5. Bugs that crawl." },
	{ name: "Waffle", rule: "R7,C2,S99-199,B75-170", description: "Range 7." },
	{ name: "Globe", rule: "R8,C2,S163-223,B74-252", description: "Range 8, stripes and blobs." },
];

export const RULE_GROUPS: { label: string; rules: RulePreset[] }[] = [
	{ label: "Square-grid classics", rules: CLASSIC_RULES },
	{ label: "Published for other tessellations", rules: TESSELLATION_RULES },
	{ label: "Generations", rules: GENERATIONS_RULES },
	{ label: "Larger than Life", rules: LTL_RULES },
];
