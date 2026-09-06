// The polar reciprocal, checked against the one dual family the literature enumerates.
import { describe, expect, it } from "vitest";
import { dualCompound, dualIsIsohedral, faceOrbits, midradius, vertexOrbits, polarDual } from "@/lib/render/dualSolid";
import { polyhedronForId, SPHERICAL_SOLIDS } from "@/lib/render/sphericalSolids";
import { facePlane } from "@/lib/render/dualSolid";
import type { Polyhedron, Vec3 } from "@/lib/render/platonicSolids";

const dualOf = (id: string) => {
	const r = polarDual(polyhedronForId(id)!);
	expect("dual" in r, `${id}: refused`).toBe(true);
	return (r as { dual: Polyhedron }).dual;
};
const census = (p: Polyhedron) => {
	const c = new Map<number, number>();
	for (const f of p.faces) c.set(f.length, (c.get(f.length) ?? 0) + 1);
	return [...c].sort((a, b) => a[0] - b[0]).map(([n, k]) => `${k}{${n}}`).join("+");
};

describe("the polar reciprocal", () => {
	// The Platonic duals are the operator's own self-check: they are each other, so any scaling or
	// centring error shows up as the wrong face count immediately.
	it("sends each Platonic solid to its partner", () => {
		for (const [a, want] of [["tetrahedron", "4{3}"], ["cube", "8{3}"], ["octahedron", "6{4}"],
			["dodecahedron", "20{3}"], ["icosahedron", "12{5}"]] as const) {
			expect(census(dualOf(a)), a).toBe(want);
		}
	});

	// THE LOAD-BEARING TEST. Reciprocating the 13 Archimedean solids must give the 13 Catalan solids,
	// by face census AND by a measured single face orbit. This is what separates the reciprocal from
	// platonicSolids' centroid dual, which gets these wrong.
	it("sends the 13 Archimedean solids to the 13 Catalan solids, every one isohedral", () => {
		const CATALAN: [string, string, string][] = [
			["truncated-tetrahedron", "12{3}", "triakis tetrahedron"],
			["cuboctahedron", "12{4}", "rhombic dodecahedron"],
			["truncated-cube", "24{3}", "triakis octahedron"],
			["truncated-octahedron", "24{3}", "tetrakis hexahedron"],
			["rhombicuboctahedron", "24{4}", "deltoidal icositetrahedron"],
			["truncated-cuboctahedron", "48{3}", "disdyakis dodecahedron"],
			["snub-cube", "24{5}", "pentagonal icositetrahedron"],
			["icosidodecahedron", "30{4}", "rhombic triacontahedron"],
			["truncated-dodecahedron", "60{3}", "triakis icosahedron"],
			["truncated-icosahedron", "60{3}", "pentakis dodecahedron"],
			["rhombicosidodecahedron", "60{4}", "deltoidal hexecontahedron"],
			["truncated-icosidodecahedron", "120{3}", "disdyakis triacontahedron"],
			["snub-dodecahedron", "60{5}", "pentagonal hexecontahedron"],
		];
		expect(CATALAN).toHaveLength(13);
		for (const [id, want, name] of CATALAN) {
			const d = dualOf(id);
			expect(census(d), `${id} -> ${name}`).toBe(want);
			expect(faceOrbits(d).orbits, `${name} is not isohedral`).toBe(1);
		}
	});

	// Planarity is the property the centroid dual does NOT have, and the reason this operator exists.
	it("gives every dual face a single plane, across the whole registry", () => {
		let checked = 0;
		for (const s of SPHERICAL_SOLIDS) {
			const r = polarDual(s);
			if (!("dual" in r)) continue;
			const V = r.dual.vertices as Vec3[];
			for (const f of r.dual.faces) {
				if (f.length < 3) continue;
				const { n, d } = facePlane(V, f);
				for (const i of f) {
					expect(Math.abs(n[0] * V[i][0] + n[1] * V[i][1] + n[2] * V[i][2] - d),
						`${s.id}: a dual face is not planar`).toBeLessThan(1e-6);
				}
			}
			checked++;
		}
		expect(checked, "most of the registry should reciprocate").toBeGreaterThan(400);
	});

	// ⚑ THE TEST THAT WAS MISSING, and the reason the Catalan check alone was not enough. A convex
	// solid reciprocates to a convex one, so every dual face has to be a CONVEX ring in the cyclic
	// order it ships in — all its turns the same way. The old angular ordering satisfied the face
	// census and the isohedral check and still returned crossed rings on the elongated Johnson solids,
	// which fan-triangulate into overlapping slivers. Census and orbit counts cannot see ring ORDER;
	// this can.
	it("gives every dual face of a convex solid a convex ring, in order", () => {
		const convex = SPHERICAL_SOLIDS.filter(
			(s) => !s.id.startsWith("ncx-") && !s.id.startsWith("hemi-") && !s.id.startsWith("tor-")
				&& !/^gen\d+-/.test(s.id) && !s.id.startsWith("iso-"),
		);
		expect(convex.length).toBeGreaterThan(100);
		for (const s of convex) {
			const r = polarDual(s);
			if (!("dual" in r)) continue;
			const V = r.dual.vertices as Vec3[];
			for (const f of r.dual.faces) {
				if (f.length < 4) continue; // a triangle is convex in any order
				const { n } = facePlane(V, f);
				let pos = 0, neg = 0;
				for (let i = 0; i < f.length; i++) {
					const a = V[f[i]], b = V[f[(i + 1) % f.length]], c = V[f[(i + 2) % f.length]];
					const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]] as Vec3;
					const w = [c[0]-b[0], c[1]-b[1], c[2]-b[2]] as Vec3;
					const t: Vec3 = [u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0]];
					const sgn = t[0]*n[0] + t[1]*n[1] + t[2]*n[2];
					if (sgn > 1e-9) pos++; else if (sgn < -1e-9) neg++;
				}
				expect(pos === 0 || neg === 0,
					`${s.id}: a dual face turns both ways — the ring order is crossed`).toBe(true);
			}
		}
	});

	// The refusal is a theorem, not a failure: a hemipolyhedron's faces pass through the centre, so its
	// dual — the acron — has vertices on the plane at infinity and no finite coordinate list holds one.
	it("refuses every hemipolyhedron, and names the faces through the centre", () => {
		const hemi = SPHERICAL_SOLIDS.filter((s) => s.id.startsWith("hemi-"));
		expect(hemi).toHaveLength(9);
		for (const s of hemi) {
			const r = polarDual(s);
			expect("refusal" in r, `${s.id} should have no dual in R³`).toBe(true);
			expect((r as { refusal: { facesThroughCentre: number } }).refusal.facesThroughCentre,
				s.id).toBeGreaterThan(0);
		}
	});

	// Isohedral is measured, not assumed — so it has to come out FALSE where the input is not uniform.
	// A Johnson solid is by definition not vertex-transitive, so its dual is not face-transitive.
	it("does not call a Johnson dual isohedral", () => {
		for (const id of ["gyrobifastigium", "snub-disphenoid", "pentagonal-cupola"]) {
			expect(faceOrbits(dualOf(id)).orbits, id).toBeGreaterThan(1);
			expect(dualIsIsohedral(polyhedronForId(id)!), id).toBe(false);
		}
		for (const id of ["cube", "cuboctahedron", "snub-dodecahedron"])
			expect(dualIsIsohedral(polyhedronForId(id)!), id).toBe(true);
	});

	// THE IDENTITY THIS FILE RESTS ON, asserted over the whole registry because it is what caught three
	// separate tolerance bugs here: negative zero in a rounded coordinate key, an absolute match radius
	// on duals whose vertices are orders of magnitude apart, and coplanar faces collapsing two dual
	// vertices into one. Reciprocation commutes with every orthogonal map, so a solid and its dual have
	// the same isometry group and the dual's face orbits are the solid's vertex orbits.
	//
	// The exceptions are counted, not waved through. A handful of duals have vertices spanning so many
	// orders of magnitude that no single tolerance reads the point set correctly — that is why the view
	// reports `vertexOrbits` of the SOLID and never `faceOrbits` of the dual.
	it("gives a dual its solid's own isometry group, on all but a counted few", () => {
		let checked = 0, disagree = 0;
		for (const s of SPHERICAL_SOLIDS) {
			const r = polarDual(s);
			if (!("dual" in r)) continue;
			checked++;
			if (faceOrbits(r.dual).groupOrder !== vertexOrbits(s).groupOrder) disagree++;
		}
		expect(checked).toBeGreaterThan(400);
		// 4 of 440 on 2026-08-31. If this grows, a tolerance has drifted — do not raise the number
		// without finding out which solid moved and why.
		expect(disagree, "duals whose measured group disagrees with their solid's").toBeLessThanOrEqual(4);
	});

	// The second refusal reason, and it is a geometric fact about the SOLID: two coplanar faces
	// reciprocate to one point, so the dual has fewer vertices than the solid has faces and is not a
	// polyhedron. Every one of these is on the non-convex shelf.
	it("refuses a solid with coplanar faces, and counts them", () => {
		let coplanar = 0, infinity = 0;
		for (const s of SPHERICAL_SOLIDS) {
			const r = polarDual(s);
			if (!("refusal" in r)) continue;
			if (r.refusal.coplanarFacePairs > 0) coplanar++;
			else infinity++;
		}
		expect(infinity, "the nine hemipolyhedra, plus genus/ncx faces through the centre").toBeGreaterThan(8);
		expect(coplanar, "solids whose reciprocal collapses two faces onto one vertex").toBeGreaterThan(0);
	});
	// THE COMPOUND, and the two different answers to "is it always possible".
	//
	// DRAWABLE wherever the dual exists. MEANINGFUL only where the solid has a MIDSPHERE — one sphere
	// tangent to every edge — because that is what fixes the relative size of the two components and
	// makes their edges cross. The classic dual compounds are exactly these: the stella octangula, the
	// cube and octahedron, the dodecahedron and icosahedron.
	it("builds a compound only where a midsphere exists, and it is both solids", () => {
		let built = 0, hasDual = 0;
		for (const s of SPHERICAL_SOLIDS) {
			if ("dual" in polarDual(s)) hasDual++;
			const c = dualCompound(s);
			if (!("compound" in c)) continue;
			built++;
			expect(midradius(s), `${s.id}: built a compound with no midsphere`).not.toBeNull();
			// It really is both solids: vertices and faces are the two sets, nothing merged, and the
			// split index is where the dual's faces begin so the view can colour them apart.
			const dual = polarDual(s, c.radius) as { dual: Polyhedron };
			expect(c.compound.vertices.length).toBe(s.vertices.length + dual.dual.vertices.length);
			expect(c.compound.faces.length).toBe(s.faces.length + dual.dual.faces.length);
			expect(c.dualFaceStart).toBe(s.faces.length);
		}
		expect(built).toBeGreaterThan(20);
		// The point of the refusal: far more solids have a dual than can carry a compound.
		expect(built).toBeLessThan(hasDual / 2);
	});

	// On a midsphere the two components' edges are tangent to ONE sphere, which is the whole content of
	// "canonical" here — measured, not asserted from the name.
	it("puts both components' edges on the same midsphere, where there is one", () => {
		for (const id of ["tetrahedron", "cube", "octahedron", "dodecahedron", "icosahedron", "cuboctahedron"]) {
			const p = polyhedronForId(id)!;
			const m = midradius(p);
			expect(m, `${id} should have a midsphere`).not.toBeNull();
			const c = dualCompound(p);
			expect("compound" in c, id).toBe(true);
			// Every edge of the COMPOUND — both components — at the same distance from the centre.
			const mm = midradius((c as { compound: Polyhedron }).compound);
			expect(mm, `${id}: the compound's edges are not on one sphere`).not.toBeNull();
			expect(mm as number).toBeCloseTo(m as number, 9);
		}
	});

	// …and it must REFUSE where there is no midsphere. These three are what AL saw go wrong: without a
	// midsphere nothing fixes the two components' relative size, and the pentagonal cupola's dual comes
	// out with vertices from 1.05 to 4.74 against the solid's 0.57 to 1.00 — one swallows the other.
	it("refuses a compound for a solid with no midsphere", () => {
		for (const id of ["gyrobifastigium", "elongated-pentagonal-gyrobicupola", "pentagonal-cupola"]) {
			expect(midradius(polyhedronForId(id)!), id).toBeNull();
			const c = dualCompound(polyhedronForId(id)!);
			expect("refusal" in c, `${id} should have no compound`).toBe(true);
			// …while the DUAL alone is still fine for all three. The refusal is about the pairing.
			expect("dual" in polarDual(polyhedronForId(id)!), id).toBe(true);
		}
	});
});
