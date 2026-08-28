import { describe, expect, it } from "vitest";
import { BUBBLE_EDGE_STYLES, BUBBLE_KOCH_LEVELS, boardCornerAngle, pushEdge } from "@/lib/bubble/edges";
import { BUBBLE_GRID_ORDER, type BubbleGrid } from "@/lib/bubble/pattern";
import type { Pt } from "@/lib/render/cubic";

// THE geometric invariant of the shelf. A decorated tiling is valid exactly when each decorated tile is
// a SIMPLE closed curve: complementarity already guarantees that neighbours share their boundary curve
// exactly, so nothing else can make two tiles overlap. What CAN break is one tile against itself —
// two bites cutting in from edges that meet at a tight corner, or a bump on one edge crossing the bump
// on the next. Both showed up the first time this shipped: a semicircular profile tore the square
// board apart, and the jigsaw tab, crenel and dovetail all failed on the triangular one.
//
// So this walks every profile against every board's tiles under every bite word. It is the reason the
// depths in edges.ts are the numbers they are; loosen one and this goes red.

const regular = (n: number): [number, number][] =>
	Array.from({ length: n }, (_, i) => {
		const a = (2 * Math.PI * i) / n;
		return [Math.cos(a), Math.sin(a)] as [number, number];
	});
// Unit-sided 60° rhombus. Not a scaled square: its 60° corner is the binding one, which is why the
// rhombic board shares the triangle's depth budget rather than the square's.
const RHOMBUS: [number, number][] = [[0, 0], [1, 0], [1.5, Math.sqrt(3) / 2], [0.5, Math.sqrt(3) / 2]];

/** The prototiles each board actually places — the shapes a profile has to survive on that board. */
const TILES: Record<BubbleGrid, [number, number][][]> = {
	triangle: [regular(3)],
	square: [regular(4)],
	hex: [regular(6)],
	"tri-hex": [regular(3), regular(6)],
	"tri-square": [regular(3), regular(4)],
	"tri-sq-hex": [regular(3), regular(4), regular(6)],
	rhombus: [RHOMBUS],
	"rhomb-tri": [RHOMBUS, regular(3)],
	"rhomb-hex": [RHOMBUS, regular(6)],
	"rhomb-tri-hex": [RHOMBUS, regular(3), regular(6)],
};

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
// The straight RUN either side of a tab means two segments of one edge are exactly collinear, and their
// cross products come out at ±1e-17 with whichever sign the rounding lands on. A strict `> 0` reads that
// as a proper crossing: the dovetail "failed" on the hexagon for four hours over 1e-17. Anything under
// EPS is on the line, and a segment that merely touches another is not a crossing.
const EPS = 1e-12;
const side = (d: number) => (d > EPS ? 1 : d < -EPS ? -1 : 0);
const segmentsCross = (a: Pt, b: Pt, c: Pt, d: Pt) => {
	const s1 = side(cross(a, b, c));
	const s2 = side(cross(a, b, d));
	const s3 = side(cross(c, d, a));
	const s4 = side(cross(c, d, b));
	return s1 !== 0 && s2 !== 0 && s3 !== 0 && s4 !== 0 && s1 !== s2 && s3 !== s4;
};

/** Does this closed ring cross itself? O(n²) over ~400 points at worst, which is fine for a test. */
function isSimple(ring: Pt[]): boolean {
	const n = ring.length;
	for (let i = 0; i < n; i++)
		for (let j = i + 2; j < n; j++) {
			if (i === 0 && j === n - 1) continue; // the closing segment touches the first at a shared corner
			if (segmentsCross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return false;
		}
	return true;
}

describe("bubble edge profiles", () => {
	// Only the Koch profile has a parameter, and it gets every setting of it: the claim that the depth
	// budget is settled at level 1 is worth nothing unless levels 2–4 are checked against it.
	const LEVELS = (style: string) =>
		style === "koch"
			? Array.from({ length: BUBBLE_KOCH_LEVELS.max - BUBBLE_KOCH_LEVELS.min + 1 }, (_, i) => BUBBLE_KOCH_LEVELS.min + i)
			: [BUBBLE_KOCH_LEVELS.default];

	for (const { value: style } of BUBBLE_EDGE_STYLES) {
		it(`${style} keeps every tile on every board simple`, () => {
			const broken: string[] = [];
			for (const level of LEVELS(style))
			for (const grid of BUBBLE_GRID_ORDER)
				for (const pts of TILES[grid]) {
					const n = pts.length;
					for (let word = 0; word < 1 << n; word++) {
						const ring: Pt[] = [];
						// The prototiles above wind counter-clockwise, so the LEFT normal points into the tile:
						// a set bit is a bump (outward = false) and a clear bit is a bite.
						for (let i = 0; i < n; i++)
							pushEdge(ring, pts[i], pts[(i + 1) % n], !((word >> i) & 1), style, grid, level);
						if (!isSimple(ring)) broken.push(`${grid}/${n}-gon/${word.toString(2).padStart(n, "0")}/L${level}`);
						// And simple with MARGIN. A profile that clears itself by a fraction of a percent passes
						// the bare test and still renders as slivers — that is how the hexagonal board's uncapped
						// depth got through the first time. Shrinking the SUBSTRATE 12% deepens every decoration
						// by the same fraction of an edge, so this is the same tile asked for 12% more room.
						const tight: Pt[] = [];
						const small = pts.map(([x, y]) => [x * 0.88, y * 0.88] as [number, number]);
						for (let i = 0; i < n; i++)
							pushEdge(tight, small[i], small[(i + 1) % n], !((word >> i) & 1), style, grid, level);
						if (!isSimple(tight)) broken.push(`${grid}/${n}-gon/${word.toString(2).padStart(n, "0")}/L${level}/margin`);
					}
				}
			expect(broken).toEqual([]);
		});
	}

	// The depth budget is proportional to tan(φ/2) at the tile's tightest corner, which is what lets one
	// authored profile serve every board. These are the three angles that shows up as.
	it("reads the board's tightest corner off the tile set", () => {
		// Every board carrying a triangle or a rhombus is 60; only the pure square and hexagon boards
		// loosen. All three rhombic mixtures carry rhombi, so they take the tightest budget unchanged.
		expect(BUBBLE_GRID_ORDER.map(boardCornerAngle)).toEqual([60, 90, 120, 60, 60, 60, 60, 60, 60, 60]);
	});

	// The bump and the bite of one shared edge must be the SAME curve, drawn from the two sides. This is
	// the rule bite(t) = -bump(1-t) at the top of edges.ts, checked as the physical statement it is.
	it("draws one curve per shared edge, from either side", () => {
		for (const { value: style } of BUBBLE_EDGE_STYLES) {
			const a: [number, number] = [0.3, -0.7];
			const b: [number, number] = [1.9, 0.4];
			const fwd: Pt[] = [];
			pushEdge(fwd, a, b, true, style, "square");
			const back: Pt[] = [];
			pushEdge(back, b, a, false, style, "square");
			const rev = [...back, { x: a[0], y: a[1] }].reverse();
			const own = [...fwd, { x: b[0], y: b[1] }];
			expect(rev).toHaveLength(own.length);
			for (let i = 0; i < own.length; i++) expect(Math.hypot(own[i].x - rev[i].x, own[i].y - rev[i].y)).toBeLessThan(1e-12);
		}
	});
});
