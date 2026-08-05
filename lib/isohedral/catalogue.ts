/**
 * The Grünbaum–Shephard isohedral tiling types, IH1 to IH93.
 *
 * Every fact below except the twelve marked types is DERIVED from Tactile at module load, never
 * transcribed, so the catalogue cannot drift from the geometry the renderer actually draws. Building
 * 81 IsohedralTiling instances costs about a millisecond; it happens once per bundle.
 *
 * On 93 versus 81: Tactile parameterizes 81 of the types. The other twelve need interior markings to
 * break the tile's symmetry and cannot be expressed by the tile boundary alone, which is why
 * Grünbaum and Shephard's 1977 paper is titled "The eighty-one types of isohedral tilings in the
 * plane" and the 93 count belongs to the marked enumeration.
 *
 * Those twelve now draw too. They come from lib/isohedral/marked.ts, which reproduces G&S's own
 * construction — one asymmetric mark, transported by a wallpaper group whose symmetry is smaller than
 * the base net's — and whose test recomputes each type's induced tile group, aspect count and
 * wallpaper group from the geometry and checks them against Table 1 of the 1977 paper. So `available`
 * below no longer means "drawable": it means "parameterized by Tactile". `marked` is the other twelve.
 */

import { EdgeShape, IsohedralTiling, tilingTypes } from "./vendor/tactile";
import type { EdgeShapeValue } from "./vendor/tactile";
import { MARKED, markedType, type MarkedType } from "./marked";

export type EdgeKind = "J" | "U" | "S" | "I";

/** The highest IH number. The classification stops here; there is no IH94. */
export const MAX_IH = 93;

/**
 * The twelve types Tactile cannot parameterize, computed from the shipped `tilingTypes` array rather
 * than typed out, then frozen here so a bad vendor update fails the test instead of silently
 * changing the catalogue.
 */
export const MARKED_TYPES: readonly number[] = [19, 35, 48, 60, 63, 65, 70, 75, 80, 87, 89, 92];

/**
 * Kaplan's own account of why those twelve are out of reach, from
 * https://isohedral.ca/isohedral-tiles-tilings-and-notations/ . Quoted, not paraphrased: the claim is
 * load-bearing for the page's honesty about coverage.
 */
export const MARKED_REASON =
	"In these cases all tile edges act as mirrors, forcing those edges to be straight lines. " +
	"As a result, the tiles are forced to be too symmetric to express the specific symmetries " +
	"implied by the incidence symbol.";

export interface IsohedralTypeInfo {
	/** 1 to 93. */
	ih: number;
	/** "IH01" … "IH93", zero-padded so the list sorts and aligns. */
	label: string;
	/**
	 * Whether Tactile parameterizes this type — true for 81, false for the marked twelve. NOT a
	 * drawability flag: all 93 draw. It decides which builder runs and whether the edge-curve sliders
	 * mean anything, since a marked type's edges are all forced straight.
	 */
	available: boolean;
	/** One of the twelve that exist only with interior markings. Exactly `!available`. */
	marked: boolean;
	/**
	 * G&S Table 1, columns (2), (3), (4) and (5), for the marked twelve; null for the other 81, whose
	 * incidence symbols Tactile does not expose.
	 */
	gs: {
		/** Column (2), the Laves net, e.g. "[3^6]". */
		laves: string;
		/** Column (3), the induced tile group I(T) and its order: the marks per tile. */
		tileGroup: string;
		tileGroupOrder: number;
		/** Column (3), the tile symbol. */
		tileSymbol: string;
		/** Column (4), the adjacency symbol. */
		adjacency: string;
		/** Column (5), the crystallographic group of the MARKED tiling. */
		wallpaper: string;
	} | null;
	/** 0 to 6. Only IH04 has six. */
	numParams: number;
	/** Tiling vertices around the prototile: 3 to 6. */
	numVertices: number;
	/** Distinct transformed copies of the tile per lattice cell: 1 to 12. Only IH77 has twelve. */
	numAspects: number;
	/** Distinct edge curves: 1 to 5. */
	numEdgeShapes: number;
	/** Kind of each distinct edge curve, e.g. ["S","J","S","S","S"] for IH04. */
	edgeShapes: EdgeKind[];
	/**
	 * One letter per boundary edge naming which curve it uses, uppercase where the curve is traversed
	 * backwards: "aBcAbC". Derived from Tactile's edge ids and reversal flags. This is NOT the
	 * Grünbaum–Shephard incidence symbol, which encodes reflection signs the library does not expose.
	 */
	edgeWord: string;
	/** Tactile's default parameter vector. All 86 values across all types fall in [0.1026, 0.8696]. */
	defaultParams: number[];
	/** 2 or 3. The count `getColour` cycles through so no two adjacent tiles match. */
	numColours: number;
}

const KIND: Record<EdgeShapeValue, EdgeKind> = {
	[EdgeShape.J]: "J",
	[EdgeShape.U]: "U",
	[EdgeShape.S]: "S",
	[EdgeShape.I]: "I",
};

export function kindOf(shape: EdgeShapeValue): EdgeKind {
	return KIND[shape];
}

const pad = (ih: number) => `IH${String(ih).padStart(2, "0")}`;

/**
 * `getColour`'s modulus is private, so read it off the values instead: the lattice permutations cycle
 * through every colour within two steps, so a 3x3 patch of lattice cells across all aspects sees them
 * all.
 */
function countColours(tiling: IsohedralTiling): number {
	const seen = new Set<number>();
	for (let a = 0; a < 3; ++a) {
		for (let b = 0; b < 3; ++b) {
			for (let asp = 0; asp < tiling.numAspects(); ++asp) {
				seen.add(tiling.getColour(a, b, asp));
			}
		}
	}
	return seen.size;
}

function describe(ih: number): IsohedralTypeInfo {
	const tiling = new IsohedralTiling(ih);

	const edgeShapes: EdgeKind[] = [];
	for (let i = 0; i < tiling.numEdgeShapes(); ++i) {
		edgeShapes.push(kindOf(tiling.getEdgeShape(i)));
	}

	let edgeWord = "";
	for (const edge of tiling.shape()) {
		const letter = String.fromCharCode(97 + edge.id);
		edgeWord += edge.rev ? letter.toUpperCase() : letter;
	}

	return {
		ih,
		label: pad(ih),
		available: true,
		marked: false,
		gs: null,
		numParams: tiling.numParameters(),
		numVertices: tiling.numVertices(),
		numAspects: tiling.numAspects(),
		numEdgeShapes: tiling.numEdgeShapes(),
		edgeShapes,
		edgeWord,
		defaultParams: tiling.getParameters(),
		numColours: countColours(tiling),
	};
}

/**
 * Split a G&S tile symbol into one token per boundary edge.
 *
 * A token is a letter naming the edge's transitivity class, optionally signed: `+` and `-` are the two
 * directions of an ORIENTED edge, and a bare letter is an unoriented one, an edge the tile group maps
 * to itself reversed. "ab+cb-" is four edges in three classes; "a+a-a+a-a+a-" is six edges in one.
 */
function tileSymbolEdges(symbol: string): { letter: string; reversed: boolean }[] {
	const out: { letter: string; reversed: boolean }[] = [];
	for (let i = 0; i < symbol.length; ++i) {
		const letter = symbol[i];
		const sign = symbol[i + 1];
		if (sign === "+" || sign === "-") {
			out.push({ letter, reversed: sign === "-" });
			i++;
		} else {
			out.push({ letter, reversed: false });
		}
	}
	return out;
}

/**
 * A marked type, described from Table 1 plus the geometry marked.ts builds for it.
 *
 * Every edge is an I edge — forced straight — which is Kaplan's whole account of why these twelve are
 * out of Tactile's reach, restated as data rather than as prose.
 */
function describeMarked(type: MarkedType): IsohedralTypeInfo {
	const edges = tileSymbolEdges(type.tileSymbol);
	const letters = [...new Set(edges.map((e) => e.letter))].sort();

	return {
		ih: type.ih,
		label: pad(type.ih),
		available: false,
		marked: true,
		gs: {
			laves: type.laves,
			tileGroup: type.tileGroup,
			tileGroupOrder: type.tileGroupOrder,
			tileSymbol: type.tileSymbol,
			adjacency: type.adjacency,
			wallpaper: type.wallpaper,
		},
		numParams: type.param ? 1 : 0,
		numVertices: edges.length,
		numAspects: type.aspects,
		numEdgeShapes: letters.length,
		edgeShapes: letters.map(() => "I" as EdgeKind),
		edgeWord: edges.map((e) => (e.reversed ? e.letter.toUpperCase() : e.letter)).join(""),
		defaultParams: type.param ? [type.param.def] : [],
		// The marked cell is already exactly periodic in both geometry and tint — the aspects ARE the
		// colour classes — so there is no supercell to take and nothing for `getColour` to cycle.
		numColours: 1,
	};
}

const AVAILABLE = new Set<number>(tilingTypes);

/** All 93, in IH order: 81 from Tactile, twelve from the marked construction. */
export const ISOHEDRAL_TYPES: IsohedralTypeInfo[] = Array.from({ length: MAX_IH }, (_, i) => {
	const ih = i + 1;
	if (AVAILABLE.has(ih)) return describe(ih);
	const m = markedType(ih);
	if (!m) throw new Error(`IH${ih} is neither a Tactile type nor one of the marked twelve`);
	return describeMarked(m);
});

/** The marked twelve, in IH order — same list as MARKED_TYPES, with the geometry attached. */
export const MARKED_INFO: readonly IsohedralTypeInfo[] = MARKED.map(describeMarked);

const BY_IH = new Map<number, IsohedralTypeInfo>(ISOHEDRAL_TYPES.map((t) => [t.ih, t]));

export function isohedralType(ih: number): IsohedralTypeInfo | undefined {
	return BY_IH.get(ih);
}

/** The type an unrecognised `?type=` falls back to. Four parameters, one aspect, three J edges. */
export const DEFAULT_IH = 1;

export function isIhNumber(value: string | null): boolean {
	if (value === null) return false;
	const n = Number(value.replace(/^IH/i, ""));
	return Number.isInteger(n) && n >= 1 && n <= MAX_IH;
}

export function parseIh(value: string | null): number {
	if (!isIhNumber(value)) return DEFAULT_IH;
	return Number((value as string).replace(/^IH/i, ""));
}
