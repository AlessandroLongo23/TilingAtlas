import { describe, expect, it } from "vitest";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { familyOfSub, SUB_ORDER } from "@/lib/services/referenceAtlas";
import { FAMILY_LABEL, SUB_LABEL } from "@/lib/services/shelfLabels";
import {
	SHELF_ORDER,
	SHELVES,
	isDiskSurface,
	isSphereSurface,
	kNounOf,
	lensAppliesTo,
	shelfOf,
	surfaceOf,
	type ShelfId,
} from "@/lib/services/shelfRegistry";

// The shelf axis is the one that grows every week — Marek is still sending boards — and it had no guard
// of any kind until now. `Record<ShelfId, ShelfDef>` catches a shelf declared but not described, at
// compile time. What it cannot catch is a shelf described WRONGLY, or a consumer that still keeps its own
// private list of shelf fields, and both of those are what shipped broken in v1.13.0. That is this file.

/** A record carrying exactly one shelf payload, which is what every real catalogue entry is. */
const rec = (patch: Record<string, unknown> = {}): CatalogueTiling =>
	({
		canonicalKey: "t",
		k: 1,
		family: "f",
		renderCell: null,
		certified: false,
		runIds: [],
		...patch,
	}) as unknown as CatalogueTiling;

/** A record on one shelf, carrying the smallest payload the registry actually reads into. The stub is
 *  deliberately partial: the registry is supposed to dispatch on the FIELD's presence, and a test that
 *  had to build a whole 3.4.n.4 pattern to ask which canvas draws it would be testing the wrong thing. */
const on = (id: ShelfId) => rec({ [id]: stubFor(id) });

describe("the shelf registry", () => {
	it("dispatches over every shelf exactly once", () => {
		// SHELF_ORDER is what `shelfOf` walks. A shelf missing from it is a shelf that resolves to null and
		// silently takes the flat p5 controls — the exact failure mode this registry exists to end.
		const ids = Object.keys(SHELVES) as ShelfId[];
		expect([...SHELF_ORDER].sort()).toEqual([...ids].sort());
		expect(new Set(SHELF_ORDER).size).toBe(SHELF_ORDER.length);
	});

	it("gives every shelf a surface, and every def the field it is keyed by", () => {
		for (const [id, def] of Object.entries(SHELVES)) {
			expect(def.field, `${id} is keyed by the wrong field`).toBe(id);
			const surface = surfaceOf(on(id as ShelfId));
			expect(surface, `${id} resolved to the flat canvas`).not.toBe("flat");
		}
	});

	it("puts the 3.4.n.4 tilings on the disk and their solids on the sphere", () => {
		// THE REGRESSION. Both shelves shipped in v1.13.0 counting as flat in the sidebar while _play-client
		// had already routed them to the disk / sphere and blanked the p5 layer, so 36,945 hyperbolic and 20
		// spherical records offered symmetry elements, fundamental domain, vertex orbits and polygon points
		// over a canvas that could not draw any of them — plus an Inversive checkbox the page would refuse.
		const hyp = surfaceOf(on("hypPoly"));
		expect(hyp).toBe("diskColors");
		expect(isDiskSurface(hyp)).toBe(true);

		const sph = surfaceOf(on("sphPoly"));
		expect(isSphereSurface(sph)).toBe(true);
	});

	it("follows a Schwarz board to whichever geometry its payload names", () => {
		// The one shelf spanning two geometries, and the reason `surface` may be a function at all.
		expect(surfaceOf(rec({ schwarz: { geometry: "spherical" } }))).toBe("sphereEdges");
		expect(surfaceOf(rec({ schwarz: { geometry: "hyperbolic" } }))).toBe("diskEdges");
	});

	it("offers the conformal lens exactly where there is a period lattice to reduce into", () => {
		// `lensApplies` (the checkbox) and `lensActive` (the renderer) are now one predicate, so a shelf can
		// no longer be offered a lens the page refuses to honour — which is how hypPoly got one.
		for (const id of SHELF_ORDER) {
			const t = on(id);
			const s = surfaceOf(t);
			expect(lensAppliesTo(t), `${id}`).toBe(!isDiskSurface(s) && !isSphereSurface(s));
		}
		// A plain Euclidean tiling carries no shelf payload at all, and is the lens's home case.
		expect(lensAppliesTo(rec({}))).toBe(true);
		expect(surfaceOf(rec({}))).toBe("flat");
		expect(shelfOf(rec({}))).toBeNull();
	});

	it("names k only where it does not mean the vertex-orbit count of a uniform tiling", () => {
		// Naming it everywhere would be noise; naming it nowhere is how one "k = 2" came to mean three
		// different quantities in one list.
		expect(kNounOf(on("pentEdges"))).toBe("vertex orbits");
		expect(kNounOf(on("ihEdges"))).toBe("vertex orbits");
		expect(kNounOf(on("hypColors"))).toBe("colored vertices");
		// The ordinary reading keeps its bare "k = 2".
		expect(kNounOf(on("developed"))).toBeNull();
		expect(kNounOf(rec({}))).toBeNull();
	});
});

describe("the sidebar's display names", () => {
	it("cover every sub the catalogue can produce", () => {
		// v1.13.0 shipped eleven shelves with no entry, so the tree showed "spe-448" and "hpo-23" to
		// visitors for a fortnight. SUB_ORDER is generated from the board tables, so a new board lands here
		// the moment it is declared — and now fails this instead of reaching the sidebar as a slug.
		const missing = SUB_ORDER.filter((s) => s !== "" && !SUB_LABEL[s]);
		expect(missing, `no label for: ${missing.join(", ")}`).toEqual([]);
	});

	it("cover every family the tree can group by", () => {
		// familyOfSub's range, as exercised over the real SUB_ORDER rather than restated by hand.
		const families = new Set<string>();
		for (const s of SUB_ORDER) {
			const f = familyOfSub(s);
			if (f) families.add(f);
		}
		const missing = [...families].filter((f) => !FAMILY_LABEL[f]);
		expect(missing, `no heading for: ${missing.join(", ")}`).toEqual([]);
	});
});

/** The smallest payload that makes a shelf's field truthy — and, where the registry reads into it, real. */
function stubFor(id: ShelfId): unknown {
	if (id === "schwarz") return { geometry: "hyperbolic" };
	if (id === "freedraw") return { grid: "square", k: 1, a: 1, b: 0, d: 1, h: [0], v: [0], orbit: [0], id: "x" };
	if (id === "hypPoly") return { stats: { sizes: [3, 4, 7] } };
	return { id: "x" };
}

// Family ids are the React keys of the sidebar's family rows (`f:<class>:<family|_spine>`), so two subs
// of one class that resolve to different-but-colliding ids duplicate a key and make two rows toggle each
// other. That happened for real when the star-polyhedron subs shipped with no family: every unfamilied
// sub became its own run and each rendered as `_spine`. Two invariants keep it from recurring.
describe("sub families", () => {
	it("gives every shipped sub-axis prefix a family or leaves it deliberately on the spine", () => {
		for (const sub of SUB_ORDER) {
			const fam = familyOfSub(sub);
			// A namespaced prefix (three letters + "-") is a shelf and must be filed under one.
			if (/^[a-z]{3}-/.test(sub)) expect(fam, `${sub} has no family`).not.toBeNull();
		}
	});

	// The star shelf is ONE sub now, not one per density (AL, 2026-08-21) — the k rows below it divide it
	// instead. What still has to hold is that it is the whole of the non-convex family and nothing else
	// lands there: every star polyhedron is non-convex, and every other spherical board is convex.
	// "spt-solid" joined them on 2026-08-25 (the TOROIDAL solids, genus 1) and the "spg<g>-solid" rows
	// with it, one per genus above. Non-convex by the same argument as the rest — a saddle vertex is
	// non-convex by definition — and contiguous, since familyOfSub can only gather a run.
	it("files the star shelf and its no-circumsphere sibling as the non-convex family", () => {
		expect(SUB_ORDER).toContain("sst");
		expect(familyOfSub("sst")).toBe("sph-nonconvex");
		const nonconvex = SUB_ORDER.filter((s) => familyOfSub(s) === "sph-nonconvex");
		// The genus rows are declared over a RANGE, not over the genera that exist today, so assert the
		// shape and not the length: the three named rows first, then one row per genus from 2 up, in order.
		// ⚑ "hemi-solid" was a fourth row here for part of 2026-08-30 and is NOT one any more. The nine
		// hemipolyhedra are a k row, not a sub: the six with all-convex faces are "spn-solid" at k = 1
		// and the three with a {n/d} face are "sst" at k = 1, split by face type the way those two
		// headings already split (AL). Asserted as an absence so the row cannot quietly grow back.
		// ⚑ FOUR named rows since 2026-08-31: "sis-solid" joined between the star shelf and its
		// no-circumsphere sibling. Its faces are stars that do NOT cross themselves — the simple 2n-gon
		// outline — so it belongs beside "sst" and nowhere near the CONVEX heading, which is where it
		// landed until AL said so ("they are not johnson solids").
		expect(nonconvex.slice(0, 4)).toEqual(["sst", "sis-solid", "spn-solid", "spt-solid"]);
		expect(nonconvex).not.toContain("hemi-solid");
		expect(nonconvex.slice(4)).toEqual(nonconvex.slice(4).map((_, i) => `spg${i + 2}-solid`));
		// …and the convex family is the other three spherical shelves, contiguous so the tree can gather
		// them in one run (which tests/catalogue-sub-family.test.ts asserts generally).
		// Convex is the reference solids plus the halved boards. (The spherical 3.4.n.4 boards were here
		// too until 2026-08-21; all twenty of their solids were duplicates of reference records or the
		// rest of J72-J83, so the shelf was folded into that one and its rows retired.)
		const convex = SUB_ORDER.filter((s) => familyOfSub(s) === "sph-convex");
		expect(convex[0]).toBe("spx-solid");
		expect(convex.some((s) => s.startsWith("sph-") && s.endsWith("-half"))).toBe(true);
		expect(convex.some((s) => s.startsWith("spp-"))).toBe(false);
	});
});
