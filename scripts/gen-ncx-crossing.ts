// Writes lib/tilings/ncx-crossing.ts: which non-convex regular-faced solids pass through themselves.
//
// Run after any rebuild of lib/render/nonconvexSolids.ts:  pnpm tsx scripts/gen-ncx-crossing.ts
// tests/ncx-crossing.test.ts fails if the result stops partitioning the shipped shelf, so a stale run
// is loud rather than quietly wrong.
//
// TWO SOURCES, UNIONED, and the reason is a bug in one of them.
//
// The shelf generator (tools/ctrnact-oracle/gen_nonconvex_shelf.py) measures this while building the
// solids and writes its answer into the comment above each entry. That answer is mostly right and it is
// the only one that knows about the degenerate contacts described below — but it opens with
//
//     if i == j or set(fi) & set(fj): continue
//
// so it never compares two faces that SHARE A VERTEX. On a small solid nearly every pair does, and four
// solids are misfiled by it: their faces plainly pass through one another and it reports them embedded.
// ⚑ AL caught ncx-6-11-7 by looking at it (2026-08-22); the other three fell out of the same check.
//
// So this runs a second, independent test over the shipped geometry — every ordered face pair, no
// exclusions, an edge of one piercing the STRICT interior of the other — and unions the two. The union
// only ever adds, which is the safe direction: it cannot un-flag a solid the generator flagged.
import { readFileSync, writeFileSync } from "node:fs";
import { SPHERICAL_SOLIDS } from "../lib/render/sphericalSolids";

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V): V => { const n = norm(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };

// Coordinates ship to nine decimals, so a real margin is ~1e-1 and a designed coincidence ~1e-11.
// Anything under this counts as ON the boundary, which is a touch and not a piercing.
const EPS = 1e-7;

function planeOf(face: number[], vs: V[]) {
	const a = vs[face[0]];
	for (let i = 1; i + 1 < face.length; i++) {
		const n = cross(sub(vs[face[i]], a), sub(vs[face[i + 1]], a));
		if (norm(n) > 1e-9) return { n: unit(n), a };
	}
	return null;
}

/** Strictly inside this convex planar face — every regular polygon is convex, so a same-side test does. */
function strictlyInside(X: V, face: number[], vs: V[], n: V): boolean {
	for (let i = 0; i < face.length; i++) {
		const p = vs[face[i]];
		const q = vs[face[(i + 1) % face.length]];
		if (dot(cross(sub(q, p), sub(X, p)), n) < EPS) return false;
	}
	return true;
}

/** Does an edge of some face pierce the strict interior of another? Shared vertices are no exemption. */
function piercesAnInterior(vs: V[], faces: number[][]): boolean {
	const planes = faces.map((f) => planeOf(f, vs));
	for (let bi = 0; bi < faces.length; bi++) {
		const B = faces[bi];
		const pl = planes[bi];
		if (!pl) continue;
		const flipped: V = [-pl.n[0], -pl.n[1], -pl.n[2]];
		for (let ai = 0; ai < faces.length; ai++) {
			if (ai === bi) continue;
			const A = faces[ai];
			for (let k = 0; k < A.length; k++) {
				const p = vs[A[k]];
				const q = vs[A[(k + 1) % A.length]];
				const sp = dot(pl.n, sub(p, pl.a));
				const sq = dot(pl.n, sub(q, pl.a));
				if (Math.abs(sp - sq) < 1e-12) continue; // parallel to the plane
				const t = sp / (sp - sq);
				if (t <= EPS || t >= 1 - EPS) continue; // meets the plane at an endpoint of the edge
				const X: V = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), p[2] + t * (q[2] - p[2])];
				// The ring's winding is not guaranteed, so accept either orientation of the same-side test.
				if (strictlyInside(X, B, vs, pl.n) || strictlyInside(X, B, vs, flipped)) return true;
			}
		}
	}
	return false;
}

// ── the generator's own answer, out of the comments it writes ────────────────────────────────────
const src = readFileSync("lib/render/nonconvexSolids.ts", "utf8");
const said = new Map<string, boolean>();
for (const line of src.split("\n")) {
	// ⚑ The flag is a comma-separated TOKEN, not the end of the line: ncx-7-15-10-a reads
	// "…, self-intersecting, inscribed" because it is the one solid here with a circumsphere.
	const m = /^\/\/ (ncx-[\w-]+)\s+—\s*(.*)$/.exec(line.trim());
	if (!m) continue;
	const tokens = m[2].split(",").map((t) => t.trim());
	const flag = tokens.find((t) => t === "self-intersecting" || t === "embedded");
	if (!flag) throw new Error(`no self-intersecting/embedded flag on: ${line.trim()}`);
	said.set(m[1], flag === "self-intersecting");
}
if (said.size === 0) throw new Error("no annotations found — did the comment format change?");

// ── union it with the measurement ────────────────────────────────────────────────────────────────
const ncx = SPHERICAL_SOLIDS.filter((s) => s.id.startsWith("ncx-"));
const crossing: string[] = [];
const embedded: string[] = [];
const added: string[] = [];
for (const s of ncx) {
	const theirs = said.get(s.id);
	if (theirs === undefined) throw new Error(`${s.id} is on the shelf with no annotation — re-check the comment format`);
	const measured = piercesAnInterior(s.vertices as V[], s.faces);
	if (measured && !theirs) added.push(s.id);
	(theirs || measured ? crossing : embedded).push(s.id);
}

const out = `// GENERATED by scripts/gen-ncx-crossing.ts. Re-run it after rebuilding lib/render/nonconvexSolids.ts;
// tests/ncx-crossing.test.ts fails if this drifts from the shipped shelf.
//
// WHAT IT MEANS. A non-convex regular-faced solid is SELF-INTERSECTING when its surface passes through
// itself, and EMBEDDED when it does not — non-convex, but a polyhedron in the ordinary sense. The shelf
// holds both and they are different kinds of object, which is why the library lets you ask for one.
//
// ⚑ The shelf generator's own measurement skips any two faces that SHARE A VERTEX, and on a small solid
// nearly every pair does — so it filed four solids as embedded whose faces plainly cross. The script
// unions its answer with an independent test that exempts no pair. See the script for the details.

/** The ${crossing.length} solids whose surface passes through itself. */
export const NCX_SELF_INTERSECTING: ReadonlySet<string> = new Set([
${crossing.map((id) => `\t"${id}",`).join("\n")}
]);

/** The ${embedded.length} that do not: non-convex, but embedded. */
export const NCX_EMBEDDED: ReadonlySet<string> = new Set([
${embedded.map((id) => `\t"${id}",`).join("\n")}
]);

/** Whether this solid passes through itself. False for anything that is not on the "ncx-" shelf. */
export const ncxSelfIntersects = (solid: string | undefined): boolean =>
\tsolid != null && NCX_SELF_INTERSECTING.has(solid);
`;
writeFileSync("lib/tilings/ncx-crossing.ts", out);
console.log(`wrote lib/tilings/ncx-crossing.ts — ${crossing.length} self-intersecting, ${embedded.length} embedded`);
console.log(`the generator had ${[...said.values()].filter(Boolean).length}; the measurement added ${added.length}: ${added.join(", ")}`);
