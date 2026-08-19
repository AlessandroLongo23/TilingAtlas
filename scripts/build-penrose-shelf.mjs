#!/usr/bin/env node
// Build the PENROSE shelf from developed cells: one shard per k under public/penrose/, plus the atlas
// rows the /library and /play shelves read.
//
//   node scripts/build-penrose-shelf.mjs <cells.json>
//
// Penrose's kite and dart, enumerated WITHOUT the matching rules. Both come from the Robinson
// triangles — the kite is two acute golden triangles (36-72-72, sides 1:phi:phi) glued along a long
// side, the dart two obtuse ones (108-36-36, sides phi:1:1) glued along a short side — so the kite is
// [72,72,144,72] with edges [phi,1,1,phi] and the dart [36,216,36,72] with edges [1,1,phi,phi]. Every
// angle is a multiple of 36 degrees and every edge is 1 or phi, which is why the palette lives at
// D=10 in Z[zeta10], where phi = 2cos(36) = zeta + zeta^-1 is already an algebraic integer.
//
// The arrows Penrose decorates these edges with are what force aperiodicity, and they are NOT edge
// types: an arrow is directed, and edge types glue like to like. So what this shelf holds is the
// complementary catalogue — every edge-to-edge PERIODIC tiling the two shapes admit when only their
// lengths have to match. They are plentiful, starting with the two p2 rotation tilings (kite alone,
// dart alone) and the phi-rhombus built from one of each.
//
// CERTIFICATION, repeated here because the shelf is what ships. Three things are checked and one of
// them is new: every face must be EXACTLY a kite or a dart (angle multiset and edge multiset both),
// the faces of one entry must cover its period cell, and every vertex must see a full turn. That last
// check needs the interior angle, not the unsigned one between two edges — the dart's 216 degree notch
// reads as 144 under Math.abs(atan2(...)), which is what the sibling shelves use and can, because
// every planigon and every 45-45-90 tile is convex. Here each face is oriented counter-clockwise first
// and the angle taken in [0, 360), so a reflex corner counts as reflex.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { stringifyAtlas } from './atlas/encode.mjs';

const ARGS = process.argv.slice(2);
if (!ARGS.length) {
	console.error('usage: node scripts/build-penrose-shelf.mjs <cells.json>');
	process.exit(1);
}
const entries = JSON.parse(readFileSync(ARGS[0], 'utf8'));
const OUT = path.join(process.cwd(), 'public', 'penrose');
const PUB = path.join(process.cwd(), 'public');

const PHI = (1 + Math.sqrt(5)) / 2;
const LENGTHS = [1, PHI];
const KITE = { angles: [72, 72, 72, 144], edges: [1, 1, PHI, PHI] };
const DART = { angles: [36, 36, 72, 216], edges: [1, 1, PHI, PHI] };

// THE TWO TILES NEED THEIR OWN FILL. Every other shelf lets the renderer colour a tile by its side
// count, with a small drift for how far the outline is from regular — and that is exactly what fails
// here. The kite and the dart are both quadrilaterals, so both take polygonHue(4) = 45° and both drift
// a little way toward red, landing within a few degrees of each other: a Penrose tiling rendered that
// way is one flat orange field with no way to see which tile is which. So each carries an explicit
// `hue`, the per-polygon override the renderers already honour for polyominoes (whose pieces have the
// same problem — one boundary side count, several tiles). The kite keeps the quadrilateral's own 45°,
// so the shelf still reads as part of the atlas; the dart takes a cool hue well clear of it.
const KITE_HUE = 45;
const DART_HUE = 205;

const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const shoelace = (f) => {
	let a2 = 0;
	for (let t = 0; t < f.length; t++) {
		const u = f[t], v = f[(t + 1) % f.length];
		a2 += u[0] * v[1] - v[0] * u[1];
	}
	return a2 / 2;
};
// Interior angles and edge lengths of a face, with the face turned counter-clockwise first so that a
// reflex corner reads above 180 instead of folding back under it.
const profile = (face) => {
	const f = shoelace(face) < 0 ? [...face].reverse() : face;
	const n = f.length, angles = [], edges = [];
	for (let t = 0; t < n; t++) {
		const p = f[t], u = f[(t - 1 + n) % n], v = f[(t + 1) % n];
		edges.push(dist(p, v));
		const vx = v[0] - p[0], vy = v[1] - p[1], ux = u[0] - p[0], uy = u[1] - p[1];
		let th = (Math.atan2(vx * uy - vy * ux, vx * ux + vy * uy) * 180) / Math.PI;
		if (th < 0) th += 360;
		angles.push(th);
	}
	return { angles: angles.sort((a, b) => a - b), edges: edges.sort((a, b) => a - b) };
};
const residue = (p, T1, T2) => {
	const det = T1[0] * T2[1] - T1[1] * T2[0];
	let a = (p[0] * T2[1] - p[1] * T2[0]) / det;
	let b = (T1[0] * p[1] - T1[1] * p[0]) / det;
	a -= Math.floor(a + 1e-9);
	b -= Math.floor(b + 1e-9);
	if (a > 1 - 1e-7) a -= 1;
	if (b > 1 - 1e-7) b -= 1;
	return `${Math.round((a * T1[0] + b * T2[0]) * 1e4)},${Math.round((a * T1[1] + b * T2[1]) * 1e4)}`;
};
const matches = (prof, tile) =>
	prof.angles.length === 4 &&
	Math.max(...prof.angles.map((a, i) => Math.abs(a - tile.angles[i]))) < 1e-4 &&
	Math.max(...prof.edges.map((e, i) => Math.abs(e - tile.edges[i]))) < 1e-6;

let worstShape = 0, worstArea = 0, worstAngle = 0;
const shapes = { kite: 0, dart: 0 };
const strays = [];
for (const e of entries) {
	const cell = Math.abs(e.T1[0] * e.T2[1] - e.T1[1] * e.T2[0]);
	let area = 0;
	const ang = new Map();
	for (const f of e.faces) {
		const prof = profile(f);
		for (const L of prof.edges) worstShape = Math.max(worstShape, Math.min(...LENGTHS.map((x) => Math.abs(L - x))));
		if (matches(prof, KITE)) shapes.kite++;
		else if (matches(prof, DART)) shapes.dart++;
		else strays.push({ id: e.id, angles: prof.angles, edges: prof.edges });
		// The turn each vertex sees, accumulated over every corner that lands on it modulo the lattice.
		const src = shoelace(f) < 0 ? [...f].reverse() : f;
		const n = src.length;
		for (let i = 0; i < n; i++) {
			const p = src[i], u = src[(i - 1 + n) % n], v = src[(i + 1) % n];
			const vx = v[0] - p[0], vy = v[1] - p[1], ux = u[0] - p[0], uy = u[1] - p[1];
			let th = (Math.atan2(vx * uy - vy * ux, vx * ux + vy * uy) * 180) / Math.PI;
			if (th < 0) th += 360;
			const key = residue(p, e.T1, e.T2);
			ang.set(key, (ang.get(key) ?? 0) + th);
		}
		area += Math.abs(shoelace(f));
	}
	worstArea = Math.max(worstArea, Math.abs(area - cell) / cell);
	for (const total of ang.values()) worstAngle = Math.max(worstAngle, Math.abs(total - 360));
}
if (strays.length || worstShape > 1e-6 || worstArea > 1e-6 || worstAngle > 0.5) {
	console.error(`penrose: REFUSING to write — ${strays.length} face(s) neither kite nor dart, edge err ${worstShape.toExponential(2)}, area err ${worstArea.toExponential(2)}, worst vertex ${(360 + worstAngle).toFixed(1)}°`);
	for (const s of strays.slice(0, 5)) console.error(`  ${s.id}: angles ${s.angles.map((a) => a.toFixed(1))} edges ${s.edges.map((x) => x.toFixed(4))}`);
	process.exit(2);
}

// DEDUPE BY CONGRUENCE, EXACTLY. The sibling shelves fingerprint a radius-10 PATCH of each tiling and
// compare strings, which is quadratic in the patch and dies here: 4,505 entries times 20 transforms
// times 24 anchors times a 15,000-face patch does not finish. It is also only as sound as the window
// is wide. This does the decisive thing instead, in two stages.
//
//   1. Bucket by an invariant that survives every rotation, reflection and translation: the tile mix,
//      the exact cell area, the multiset of short lattice-vector lengths, and the multiset of
//      shape-labelled distances between tile centres measured MODULO THE LATTICE. Congruent tilings
//      always land in the same bucket, so nothing can be missed by bucketing alone.
//   2. Inside a bucket, decide congruence outright: try each of the twenty maps (ten rotations by 36
//      degrees, with and without a reflection), require it to carry one period lattice onto the other
//      as a lattice, then require some translation to carry every tile onto a tile of the same shape
//      and orientation. That is the definition, not a proxy for it.
//
// The point group is the 36-degree one because every edge direction in this palette is a multiple of
// 2pi/10. The reflection is a REAL one (x -> -x); the sibling shelves negate both coordinates, which
// is a 180-degree rotation and so was already in their rotation list — those shelves never merged
// mirror pairs at all. Merging them is the project's settled convention, and the count the reflection
// merges is printed below rather than buried.
const TRANSFORMS = [];
for (const mir of [false, true]) {
	for (let r = 0; r < 10; r++) {
		const th = (r * Math.PI) / 5, c = Math.cos(th), sn = Math.sin(th);
		TRANSFORMS.push({ mir, f: ([x, y]) => { const a = mir ? -x : x; return [c * a - sn * y, sn * a + c * y]; } });
	}
}
const ROT_ONLY = TRANSFORMS.filter((t) => !t.mir);
const TOL = 1e-6;
const centroid = (f) => [f.reduce((u, q) => u + q[0], 0) / f.length, f.reduce((u, q) => u + q[1], 0) / f.length];
const kindOf = (f) => (matches(profile(f), KITE) ? 0 : 1);

// Fractional coordinates in a lattice basis, and the shortest representative of a difference vector.
const frac = (p, T1, T2) => {
	const det = T1[0] * T2[1] - T1[1] * T2[0];
	return [(p[0] * T2[1] - p[1] * T2[0]) / det, (T1[0] * p[1] - T1[1] * p[0]) / det];
};
const wrap = (t) => { const w = t - Math.round(t); return Math.abs(w) < TOL ? 0 : w; };
const modDist = (p, q, T1, T2) => {
	const [fa, fb] = frac([p[0] - q[0], p[1] - q[1]], T1, T2);
	let best = Infinity;
	for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
		const a = fa - Math.round(fa) + i, b = fb - Math.round(fb) + j;
		best = Math.min(best, Math.hypot(a * T1[0] + b * T2[0], a * T1[1] + b * T2[1]));
	}
	return best;
};

const signature = (e) => {
	const cs = e.faces.map(centroid), ks = e.faces.map(kindOf);
	const latt = [];
	for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
		if (!i && !j) continue;
		latt.push(Math.round(Math.hypot(i * e.T1[0] + j * e.T2[0], i * e.T1[1] + j * e.T2[1]) * 1e6));
	}
	const pairs = [];
	for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
		pairs.push(`${Math.min(ks[i], ks[j])}${Math.max(ks[i], ks[j])}:${Math.round(modDist(cs[i], cs[j], e.T1, e.T2) * 1e6)}`);
	}
	const area = Math.abs(e.T1[0] * e.T2[1] - e.T1[1] * e.T2[0]);
	return [e.k, e.faces.length, ks.filter((x) => !x).length, Math.round(area * 1e6),
		latt.sort((a, b) => a - b).join(','), pairs.sort().join(',')].join('|');
};

// The oriented shape of a face: its vertex offsets from its own centre. Kite and dart have the same
// edge multiset, so size alone cannot tell them apart; this can, and it turns with the face.
//
// COMPARED AS A MULTISET WITH TOLERANCE, never by sorting first. Sorting on a float coordinate is the
// bug the self-check above caught: a rotated copy of a face differs from the original in the last bits,
// so two vertices that share an x coordinate — which the kite and the dart both have, being symmetric —
// can sort either way round, and an element-wise comparison then calls a tiling different from itself.
const shapeOf = (verts) => {
	const [cx, cy] = centroid(verts);
	return verts.map(([x, y]) => [x - cx, y - cy]);
};
const sameShape = (a, b) => {
	if (a.length !== b.length) return false;
	const used = new Array(b.length).fill(false);
	return a.every((p) => {
		const i = b.findIndex((q, j) => !used[j] && Math.abs(p[0] - q[0]) < 1e-5 && Math.abs(p[1] - q[1]) < 1e-5);
		if (i < 0) return false;
		used[i] = true;
		return true;
	});
};

// Tile centres in fractional coordinates of ONE basis — always the target's. Reading A's centres in
// A's own transformed basis instead would be wrong: the two bases differ by a unimodular change even
// when they span the same lattice, so the fractions would not be comparable.
const markers = (e, T, b1, b2) => e.faces.map((f) => {
	const t = T ? f.map(T.f) : f;
	return { fr: frac(centroid(t), b1, b2), shape: shapeOf(t) };
});

const congruent = (A, B, transforms) => {
	const mb = markers(B, null, B.T1, B.T2);
	for (const T of transforms) {
		// Does this map carry A's period lattice onto B's? Both images must be integer combinations of
		// B's basis, and the integer matrix must be unimodular — same lattice, not merely a sublattice.
		const [p, q] = [T.f(A.T1), T.f(A.T2)].map((v) => frac(v, B.T1, B.T2));
		const ip = p.map(Math.round), iq = q.map(Math.round);
		if (Math.abs(p[0] - ip[0]) > TOL || Math.abs(p[1] - ip[1]) > TOL) continue;
		if (Math.abs(q[0] - iq[0]) > TOL || Math.abs(q[1] - iq[1]) > TOL) continue;
		if (Math.abs(Math.abs(ip[0] * iq[1] - ip[1] * iq[0]) - 1) > TOL) continue;
		const ma = markers(A, T, B.T1, B.T2);
		for (const anchor of ma) {
			const da = [mb[0].fr[0] - anchor.fr[0], mb[0].fr[1] - anchor.fr[1]];
			const used = new Array(mb.length).fill(false);
			let all = true;
			for (const m of ma) {
				const fa = m.fr[0] + da[0], fb = m.fr[1] + da[1];
				let hit = -1;
				for (let i = 0; i < mb.length && hit < 0; i++) {
					if (used[i]) continue;
					if (Math.abs(wrap(fa - mb[i].fr[0])) < 1e-5 && Math.abs(wrap(fb - mb[i].fr[1])) < 1e-5
						&& sameShape(m.shape, mb[i].shape)) hit = i;
				}
				if (hit < 0) { all = false; break; }
				used[hit] = true;
			}
			if (all) return true;
		}
	}
	return false;
};

const reduce = (transforms) => {
	const buckets = new Map();
	for (const e of entries) {
		const s = signature(e);
		if (!buckets.has(s)) buckets.set(s, []);
		buckets.get(s).push(e);
	}
	let biggest = 0;
	const keep = [];
	for (const group of buckets.values()) {
		biggest = Math.max(biggest, group.length);
		const reps = [];
		for (const e of group) if (!reps.some((r) => congruent(e, r, transforms))) reps.push(e);
		keep.push(...reps);
	}
	return { keep, biggest, buckets: buckets.size };
};

// SELF-CHECK THE ORACLE BEFORE TRUSTING IT. This dedup reports how many entries it merged, and on this
// catalogue the answer is none — which is exactly what a congruence test that always says "different"
// would also report. So the predicate is made to prove it is alive: every sampled entry is rotated by
// a multiple of 36 degrees, optionally reflected, and shifted by a vector that is NOT in its lattice,
// and must come back congruent to itself; entries at different k must not.
{
	let pos = 0, neg = 0;
	for (let i = 0; i < entries.length; i += Math.max(1, Math.floor(entries.length / 40))) {
		const e = entries[i];
		const T = TRANSFORMS[(i * 7) % TRANSFORMS.length];
		const t = [0.31 + 0.07 * (i % 5), -0.19 - 0.11 * (i % 3)];
		const shift = ([x, y]) => [x + t[0], y + t[1]];
		const clone = { k: e.k, T1: T.f(e.T1), T2: T.f(e.T2), faces: e.faces.map((f) => f.map(T.f).map(shift)) };
		if (!congruent(clone, e, TRANSFORMS)) {
			console.error(`penrose: REFUSING to write — congruence test failed to recognise ${e.id} rotated/reflected/translated onto itself. The dedup oracle is broken, so "0 duplicates" would mean nothing.`);
			process.exit(2);
		}
		pos++;
		const other = entries.find((o) => o.k !== e.k && o.faces.length !== e.faces.length);
		if (other && congruent(other, e, TRANSFORMS)) {
			console.error(`penrose: REFUSING to write — congruence test called ${other.id} (k=${other.k}) congruent to ${e.id} (k=${e.k}).`);
			process.exit(2);
		}
		if (other) neg++;
	}
	console.log(`  congruence oracle self-check: ${pos} transformed copies recognised, ${neg} non-congruent pairs rejected`);
}

const rot = reduce(ROT_ONLY);
const full = reduce(TRANSFORMS);
const distinct = full.keep.sort((a, b) => a.k - b.k);
console.log(`  faces: ${shapes.kite} kites, ${shapes.dart} darts, 0 anything else`);
console.log(`  invariant buckets: ${full.buckets} (largest ${full.biggest} entries)`);
console.log(`  dedupe by congruence: ${entries.length} solver solutions -> ${rot.keep.length} up to rotation -> ${distinct.length} distinct up to rotation AND reflection`);

const byK = new Map();
for (const e of distinct) {
	if (!byK.has(e.k)) byK.set(e.k, []);
	byK.get(e.k).push(e);
}
mkdirSync(OUT, { recursive: true });
const manifest = { board: 'penrose', tile: 'Penrose kite and dart', k: [] };
const ref = [];
for (const k of [...byK.keys()].sort((a, b) => a - b)) {
	const rows = byK.get(k).map((e, i) => ({
		id: `penrose-${k}-${String(i + 1).padStart(5, '0')}`,
		k, T1: e.T1, T2: e.T2, seeds: e.seeds, faces: e.faces, stats: e.stats,
	}));
	writeFileSync(path.join(OUT, `penrose-k${k}.json`), stringifyAtlas(rows));
	manifest.k.push({ k, count: rows.length, file: `/penrose/penrose-k${k}.json` });
	console.log(`  k=${k}: ${rows.length} tilings -> public/penrose/penrose-k${k}.json`);
	byK.get(k).forEach((e, i) => {
		const isKite = e.faces.map((f) => matches(profile(f), KITE));
		const kites = isKite.filter(Boolean).length, darts = isKite.length - kites;
		const mix = kites && darts ? `${kites} kite${kites > 1 ? 's' : ''} and ${darts} dart${darts > 1 ? 's' : ''}`
			: kites ? `${kites} kite${kites > 1 ? 's' : ''} and no darts` : `${darts} dart${darts > 1 ? 's' : ''} and no kites`;
		ref.push({
			id: `penrose-k${k}-${String(i + 1).padStart(3, '0')}`,
			source: 'penrose',
			k,
			family: 'Penrose kite and dart (no matching rules)',
			renderCell: {
				cellPolygons: e.faces.map((f, q) => ({ n: f.length, vertices: f, hue: isKite[q] ? KITE_HUE : DART_HUE })),
				basis: [e.T1, e.T2],
			},
			discoverer: 'Čtrnáct engine (penrose palette), 2026-08-14',
			note:
				`Edge-to-edge PERIODIC tiling by Penrose's kite and dart — ${mix} per period cell. Both tiles ` +
				'are built from the Robinson triangles: the kite is two acute golden triangles (36-72-72, ' +
				'sides 1 : φ : φ) glued along a long side, the dart two obtuse ones (108-36-36, sides ' +
				'φ : 1 : 1) glued along a short side. So every angle is a multiple of 36° and every edge is ' +
				'1 or φ, and the palette develops exactly in ℤ[ζ₁₀], where φ = 2cos 36° = ζ + ζ⁻¹. The ' +
				'arrows Penrose decorates these edges with are what force aperiodicity, and they are not ' +
				'edge types — an arrow is directed, edge types glue like to like — so this is the ' +
				'complementary catalogue: what the two shapes admit when only their lengths must match. ' +
				'Certified here: every face is exactly a kite or a dart, the faces cover the period cell ' +
				'with no gap and no overlap, and every vertex sees a full turn with the dart’s 216° notch ' +
				'counted as reflex.',
		});
	});
}
writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
// k<=3 eager, deeper tiers as lazy shards — the split the mixed, scaled, period and tri45 shelves all
// use. The whole shelf as one eager file is 18.7 MB on every page load; the eager tier is ~0.5 MB.
const eager = ref.filter((r) => r.k <= 3);
writeFileSync(path.join(PUB, 'reference-atlas-penrose.json'), stringifyAtlas(eager));
console.log(`  atlas shelf: ${eager.length} entries (k<=3, eager) -> public/reference-atlas-penrose.json`);
for (const k of [...new Set(ref.filter((r) => r.k > 3).map((r) => r.k))].sort((a, b) => a - b)) {
	const rows = ref.filter((r) => r.k === k);
	writeFileSync(path.join(PUB, `reference-atlas-penrose-k${k}.json`), stringifyAtlas(rows));
	console.log(`               ${rows.length} entries -> public/reference-atlas-penrose-k${k}.json (lazy)`);
}
console.log(`penrose: ${distinct.length} distinct tilings, shape err ${worstShape.toExponential(2)}, area err ${worstArea.toExponential(2)}, angle err ${worstAngle.toExponential(2)}° — certified`);
