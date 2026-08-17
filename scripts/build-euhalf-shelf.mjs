#!/usr/bin/env node
// Build the EUCLIDEAN HALF-POLYGON shelf: four boards, one shard per (board, k) under public/euhalf/.
//
//   node scripts/build-euhalf-shelf.mjs
//
// A board is half a regular n-gon — cut vertex-to-vertex or midpoint-to-midpoint — and the whole
// Euclidean family is these four plus two already shipped elsewhere (the 30-60-90 half-triangle is in
// the planigon palette, the 45-45-90 half-square is the tri45 shelf). Everything from n=7 up is
// provably empty; see experiments/results/euclidean-half-polygons-2026-08-14.log.
//
// NOT EDGE-TO-EDGE, since 2026-08-17. Marek Čtrnáct pointed out that the first cut of this shelf missed
// every arrangement in which one tile's edge is met by TWO neighbours instead of one, because the engine
// glues whole edge to whole edge. Every board here has a side of length 2 and a side of length 1, so
// every board could host one. The input is now the `-split` palettes, where the divisible edges carry a
// flat 180° corner at the division point and the same search finds both kinds; the shipped tilings are
// all still here (verified by exact congruence, board by board) and are heavily outnumbered by the new
// ones. See experiments/results/euhalf-nonedge-to-edge-2026-08-17.log.
//
// Input is tools/ctrnact-oracle/develop_tri45.py output: each entry carries its exact period lattice
// and its developed faces, so this certifies, dedupes and writes.
//
// THREE CERTIFICATES, AND THE THIRD IS THE ONE THAT MATTERS. Re-run here on purpose, against the bytes
// that ship rather than the developer's scratch dir:
//   shape  every face is congruent to the board's tile — same side multiset, same angle multiset.
//   area   the faces of one entry cover its period cell exactly: too little is a gap, too much an
//          overlap.
//   angle  every vertex sees exactly 360 degrees, summed over the faces meeting there, reduced modulo
//          the period lattice. This is the one that catches a tiling wrapping a point more than once,
//          and shape and area BOTH pass on those — a fourfold cover has fourfold area inside a cell
//          four times as large. Its absence shipped 23 non-tilings to the tri45 shelf on 2026-08-13.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { stringifyAtlas } from './atlas/encode.mjs';

const ROOT = process.cwd();
const ORACLE = path.join(ROOT, 'tools', 'ctrnact-oracle');
const OUT = path.join(ROOT, 'public', 'euhalf');
const PUB = path.join(ROOT, 'public');
const TOL = 1e-6;
const COT18 = 1 / Math.tan(Math.PI / 10);

// The k slices that ride the eager atlas bundle; everything above ships as a lazy shard.
const EAGER_MAX = 4;

const BOARDS = [
	{
		id: 'hexv', label: '{6} halved by its long diagonal', cells: 'run-eu-half-hex-v-split-k6/eu-half-hex-v-split-cells.json',
		cellsEdgeToEdge: 'run-eu-half-hex-v-k13/eu-half-hex-v-cells.json',
		D: 6, hue: 205, tile: '60-120-120-60 trapezoid',
		angles: [60, 120, 120, 60], sides: [1, 1, 1, 2],
		note: 'Half a regular hexagon, cut by the long diagonal from a vertex to the opposite vertex. Two of '
			+ 'them glue along the long side to make a hexagon, so this board cannot be empty; what the '
			+ 'catalogue counts is everything else the trapezoid does. Isosceles, so achiral, and the only '
			+ 'board of the four whose two edge lengths are both rational (1 and 2).',
	},
	{
		id: 'pent', label: '{5} halved by its mirror', cells: 'run-eu-half-pent-split-k9/eu-half-pent-split-cells.json',
		cellsEdgeToEdge: 'run-eu-half-pent-k14/eu-half-pent-cells.json',
		D: 20, hue: 28, tile: '54-108-108-90 quadrilateral',
		angles: [54, 108, 108, 90], sides: [1, 2, 2, COT18],
		note: 'Half a regular pentagon, cut by its mirror from a vertex to the midpoint of the opposite edge. '
			+ 'Five is odd, so this is the only cut a pentagon has. THE REGULAR PENTAGON DOES NOT TILE THE '
			+ 'PLANE AND THIS HALF OF IT DOES, at k=1 and twice over — nothing obstructs the halves the way '
			+ 'the whole tile is obstructed. Scalene and chiral, so the palette carries a mirror twin. Its '
			+ 'long side is the pentagon’s height, R + apothem = cot 18° = √(5+2√5), which '
			+ 'is an algebraic integer of ℤ[ζ₂₀] but none of the named surds — it is '
			+ 'the chord sum 2cos 18° + 2cos 54°.',
	},
	{
		id: 'hexm', label: '{6} halved between opposite edges', cells: 'run-eu-half-hex-m-split-k9/eu-half-hex-m-split-cells.json',
		cellsEdgeToEdge: 'run-eu-half-hex-m-k6/eu-half-hex-m-cells.json',
		D: 12, hue: 140, tile: '90-120-120-120-90 pentagon',
		angles: [90, 120, 120, 120, 90], sides: [1, 2, 2, 1, 2 * Math.sqrt(3)],
		note: 'The hexagon’s other cut, joining the midpoints of two opposite edges, which makes a '
			+ 'pentagon with two right angles. Its long side is the width across the hexagon, 2√3 at '
			+ 'twice the hexagon’s own side. Its 2√3 side decomposes into nothing, but its two sides '
			+ 'of length 2 are each two unit sides, so those can be met by a pair of neighbours; the single '
			+ 'edge-to-edge tiling at k=2 is joined by a hundred more once they are.',
	},
	{
		id: 'sqmid', label: '{4} halved between opposite edges', cells: 'run-eu-half-sq-mid-split-k6/eu-half-sq-mid-split-cells.json',
		cellsEdgeToEdge: 'run-eu-half-sq-mid-k6/eu-half-sq-mid-cells.json',
		D: 4, hue: 320, tile: '1×2 rectangle (the domino)',
		angles: [90, 90, 90, 90], sides: [1, 2, 1, 2],
		note: 'The square’s midpoint cut is the DOMINO. Edge-to-edge it has exactly ONE tiling, provably: '
			+ 'every corner is a right angle flanked by one long and one short side, so the four edges at a '
			+ 'vertex alternate long/short; two edges separated by one other sit at 180° and are therefore '
			+ 'collinear; so the long edges lie on one family of parallel lines and the short edges on the '
			+ 'perpendicular family, which is the aligned grid and nothing else. That argument assumes every '
			+ 'edge is matched whole, and a domino’s long side is two short sides, so it need not be: allow a '
			+ 'long side to be met by two tiles and running bond, herringbone and basketweave all appear. They '
			+ 'are the reason this board goes from one tiling to tens of thousands.',
	},
];

// A face arrives from a `-split` palette carrying FLAT 180° corners at the points where its edge may be
// divided by a neighbour (see the palette comments and gen_alphabet's min_len gate). Those corners are a
// modelling device, not part of the tile: the trapezoid is a 4-gon whether or not its long side is met by
// one tile or two. They are kept for the ANGLE certificate, where a divided edge contributes its 180° and
// every vertex still closes at exactly 360, and dropped for the SHAPE certificate and for what ships, so
// the catalogue says quadrilateral and the renderer draws one.
const dropCollinear = (f) => {
	const out = [];
	for (let t = 0; t < f.length; t++) {
		const p = f[(t - 1 + f.length) % f.length], c = f[t], n = f[(t + 1) % f.length];
		const cross = (c[0] - p[0]) * (n[1] - p[1]) - (c[1] - p[1]) * (n[0] - p[0]);
		if (Math.abs(cross) > 1e-7) out.push(c);
	}
	return out.length >= 3 ? out : f;
};
// COUNTING THE T-JUNCTIONS, which is not the same as counting flat corners. In a `-split` palette EVERY
// tile carries its flat corners all the time; what says whether an edge is actually DIVIDED is what sits
// opposite. Two tiles meeting flush put their flat corners at the same point, and that point sees exactly
// two corners, 180 + 180. A genuinely divided edge puts a flat corner against two or more real ones. So a
// T-junction is a vertex position holding a 180 AND more than two corners in total. Testing for a flat
// corner alone marked all 444 eager records non-edge-to-edge, including the ones that plainly are not.
const tJunctions = (faces, T1, T2, residueFn) => {
	const seen = new Map();
	for (const f of faces) {
		for (let t = 0; t < f.length; t++) {
			const p = f[t], u = f[(t - 1 + f.length) % f.length], v = f[(t + 1) % f.length];
			const ux = u[0] - p[0], uy = u[1] - p[1], vx = v[0] - p[0], vy = v[1] - p[1];
			const th = Math.abs((Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) * 180) / Math.PI);
			const key = residueFn(p, T1, T2);
			const rec = seen.get(key) ?? { corners: 0, flat: false };
			rec.corners++;
			if (Math.abs(th - 180) < 1e-6) rec.flat = true;
			seen.set(key, rec);
		}
	}
	let n = 0;
	for (const r of seen.values()) if (r.flat && r.corners > 2) n++;
	return n;
};

// IS THIS CELL PRIMITIVE? A `-split` palette can describe one tiling on a SUPERCELL: the flat corners
// give the search more ways to label the same geometry, and some of them close on a lattice coarser than
// the tiling's own. Such a record is not a new tiling, it is the same one written twice as large, and the
// congruence dedup cannot see it — that predicate maps lattice onto lattice UNIMODULARLY, and a supercell
// is by definition not unimodularly related to the cell inside it. Caught on hexv k=1: 3 records where
// only 2 tilings exist, the extra one a 4-tile description of a 2-tile tiling.
//
// The test is direct. Any translation carrying the tiling to itself carries some face to a face of the
// same shape, so every candidate is a difference of two same-shape face centroids. If one of those, taken
// modulo the lattice, is nonzero and maps the whole marker set onto itself, the cell is a supercell.
const isPrimitive = (faces, T1, T2, residueFn) => {
	const marks = faces.map((f) => ({ c: centroid(f), s: profile(f) }));
	const key = (p) => residueFn(p, T1, T2);
	const have = new Set(marks.map((m) => key(m.c)));
	const sameProfile = (a, b) => a.sides.length === b.sides.length
		&& a.sides.every((x, i) => Math.abs(x - b.sides[i]) < 1e-6)
		&& a.angs.every((x, i) => Math.abs(x - b.angs[i]) < 1e-4);
	for (let j = 1; j < marks.length; j++) {
		if (!sameProfile(marks[0].s, marks[j].s)) continue;
		const t = [marks[j].c[0] - marks[0].c[0], marks[j].c[1] - marks[0].c[1]];
		if (key(t) === key([0, 0])) continue;                       // a lattice vector: not a new symmetry
		let all = true;
		for (const m of marks) {
			const img = key([m.c[0] + t[0], m.c[1] + t[1]]);
			if (!have.has(img)) { all = false; break; }
			const dst = marks.find((n) => key(n.c) === img);
			if (!dst || !sameProfile(m.s, dst.s)) { all = false; break; }
		}
		if (all) return false;
	}
	return true;
};

const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const centroid = (f) => [f.reduce((u, q) => u + q[0], 0) / f.length, f.reduce((u, q) => u + q[1], 0) / f.length];
const shoelace = (f) => {
	let a2 = 0;
	for (let t = 0; t < f.length; t++) { const u = f[t], v = f[(t + 1) % f.length]; a2 += u[0] * v[1] - v[0] * u[1]; }
	return Math.abs(a2 / 2);
};
const profile = (f) => {
	const sides = [], angs = [];
	for (let t = 0; t < f.length; t++) {
		const p = f[t], u = f[(t - 1 + f.length) % f.length], v = f[(t + 1) % f.length];
		sides.push(dist(p, v));
		const ux = u[0] - p[0], uy = u[1] - p[1], vx = v[0] - p[0], vy = v[1] - p[1];
		angs.push(Math.abs((Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) * 180) / Math.PI));
	}
	return { sides: sides.sort((a, b) => a - b), angs: angs.sort((a, b) => a - b) };
};
const frac = (p, T1, T2) => {
	const det = T1[0] * T2[1] - T1[1] * T2[0];
	return [(p[0] * T2[1] - p[1] * T2[0]) / det, (T1[0] * p[1] - T1[1] * p[0]) / det];
};
const wrap = (t) => { const w = t - Math.round(t); return Math.abs(w) < TOL ? 0 : w; };
// The VERTEX KEY for the angle certificate: a point reduced modulo the period lattice, keyed in
// CARTESIAN coordinates. Lifted verbatim from build-tri45-shelf.mjs, and it has to be — my own version
// keyed the FRACTIONAL coordinates through `wrap`, which put a vertex at fraction ~0 on either side of
// zero into the keys "0" and "-0" and merged unrelated points, reporting a 660-degree vertex on a board
// where all 27,159 records are clean. The floor-with-epsilon lands in [0,1), the near-1 nudge closes the
// wrap seam, and `|0` normalises -0.
const residue = (p, T1, T2) => {
	let [a, b] = frac(p, T1, T2);
	a -= Math.floor(a + 1e-9);
	b -= Math.floor(b + 1e-9);
	if (a > 1 - 1e-7) a -= 1;
	if (b > 1 - 1e-7) b -= 1;
	return `${Math.round((a * T1[0] + b * T2[0]) * 1e4) | 0},${Math.round((a * T1[1] + b * T2[1]) * 1e4) | 0}`;
};
const modDist = (p, q, T1, T2) => {
	const [fa, fb] = frac([p[0] - q[0], p[1] - q[1]], T1, T2);
	let best = Infinity;
	for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
		const a = fa - Math.round(fa) + i, b = fb - Math.round(fb) + j;
		best = Math.min(best, Math.hypot(a * T1[0] + b * T2[0], a * T1[1] + b * T2[1]));
	}
	return best;
};
const shapeOf = (verts) => {
	const [cx, cy] = centroid(verts);
	return verts.map(([x, y]) => [x - cx, y - cy]);
};
// Multiset comparison with tolerance, NEVER by sorting coordinates first: a rotated copy of a symmetric
// face differs in the last bits, so two vertices sharing an x can sort either way and an element-wise
// test then calls a tiling different from itself. That bug was caught by the penrose self-check.
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

let grandTotal = 0, grandRaw = 0;
const manifest = {};
const eager = [];
const lazy = new Map();

for (const B of BOARDS) {
	// TWO SOURCES, AND THE SPLIT ONE ONLY REACHES SO FAR. The `-split` palette finds everything the
	// unsplit one finds and much more, but it pays for it: one geometric tiling appears under many
	// combinatorial labellings once flat corners are in play (35,193 solver solutions for 856 tilings on
	// hexv), so the reachable k is lower. The unsplit runs go far deeper and are still correct as far as
	// they go — they are simply the edge-to-edge SUBSET. So take the split records up to their ceiling
	// and the unsplit records above it, and say so per board rather than silently shipping a shallower
	// shelf than the one it replaces.
	const split = JSON.parse(readFileSync(path.join(ORACLE, B.cells), 'utf8'));
	const splitMax = Math.max(...split.map((e) => e.k));
	const deeper = B.cellsEdgeToEdge
		? JSON.parse(readFileSync(path.join(ORACLE, B.cellsEdgeToEdge), 'utf8')).filter((e) => e.k > splitMax)
		: [];
	const allEntries = [...split, ...deeper];
	const entries = allEntries.filter((e) => isPrimitive(e.faces, e.T1, e.T2, residue));
	const supercells = allEntries.length - entries.length;
	if (supercells) console.log(`  ${B.id}: dropped ${supercells} supercell description(s) of ${allEntries.length}`);
	B.splitMax = splitMax;
	B.deeperMax = deeper.length ? Math.max(...deeper.map((e) => e.k)) : splitMax;
	grandRaw += entries.length;
	const want = { sides: [...B.sides].sort((a, b) => a - b), angs: [...B.angles].sort((a, b) => a - b) };

	// ---- certify -------------------------------------------------------------------------------
	let worstShape = 0, worstArea = 0, worstAngle = 0;
	const strays = [];
	for (const e of entries) {
		const cell = Math.abs(e.T1[0] * e.T2[1] - e.T1[1] * e.T2[0]);
		let area = 0;
		const ang = new Map();
		for (const f of e.faces) {
			// Shape is judged on the REAL tile, so the flat corners of a divided edge come off first.
			const pr = profile(dropCollinear(f));
			if (pr.sides.length !== want.sides.length) { strays.push(e.id); continue; }
			for (let t = 0; t < pr.sides.length; t++) {
				worstShape = Math.max(worstShape, Math.abs(pr.sides[t] - want.sides[t]), Math.abs(pr.angs[t] - want.angs[t]) / 90);
			}
			area += shoelace(f);
			for (let t = 0; t < f.length; t++) {
				const p = f[t], u = f[(t - 1 + f.length) % f.length], v = f[(t + 1) % f.length];
				const ux = u[0] - p[0], uy = u[1] - p[1], vx = v[0] - p[0], vy = v[1] - p[1];
				const th = Math.abs((Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) * 180) / Math.PI);
				const key = residue(p, e.T1, e.T2);
				ang.set(key, (ang.get(key) ?? 0) + th);
			}
		}
		worstArea = Math.max(worstArea, Math.abs(area - cell) / cell);
		for (const total of ang.values()) worstAngle = Math.max(worstAngle, Math.abs(total - 360));
	}
	if (strays.length || worstShape > 1e-5 || worstArea > 1e-6 || worstAngle > 0.5) {
		console.error(`euhalf/${B.id}: REFUSING to write — ${strays.length} stray face(s), shape err `
			+ `${worstShape.toExponential(2)}, area err ${worstArea.toExponential(2)}, worst vertex `
			+ `${(360 + worstAngle).toFixed(1)}°`);
		process.exit(2);
	}

	// ---- dedupe by congruence, exactly -----------------------------------------------------------
	// The point group is the rotations by 2π/D and a real reflection: every edge direction the
	// developer can produce is a multiple of 2π/D, so a congruence between two entries of this board
	// must be one of these composed with a translation. Mirror pairs merging is the settled convention.
	const TRANSFORMS = [];
	for (const mir of [false, true]) {
		for (let r = 0; r < B.D; r++) {
			const th = (2 * Math.PI * r) / B.D, c = Math.cos(th), sn = Math.sin(th);
			TRANSFORMS.push({ mir, f: ([x, y]) => { const a = mir ? -x : x; return [c * a - sn * y, sn * a + c * y]; } });
		}
	}
	const ROT_ONLY = TRANSFORMS.filter((t) => !t.mir);
	const markers = (e, T, b1, b2) => e.faces.map((f) => {
		const t = T ? f.map(T.f) : f;
		return { fr: frac(centroid(t), b1, b2), shape: shapeOf(t) };
	});
	const congruent = (A, Bx, transforms) => {
		const mb = markers(Bx, null, Bx.T1, Bx.T2);
		for (const T of transforms) {
			const [p, q] = [T.f(A.T1), T.f(A.T2)].map((v) => frac(v, Bx.T1, Bx.T2));
			const ip = p.map(Math.round), iq = q.map(Math.round);
			if (Math.abs(p[0] - ip[0]) > TOL || Math.abs(p[1] - ip[1]) > TOL) continue;
			if (Math.abs(q[0] - iq[0]) > TOL || Math.abs(q[1] - iq[1]) > TOL) continue;
			if (Math.abs(Math.abs(ip[0] * iq[1] - ip[1] * iq[0]) - 1) > TOL) continue;
			const ma = markers(A, T, Bx.T1, Bx.T2);
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
	const signature = (e) => {
		const cs = e.faces.map(centroid);
		const latt = [];
		for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
			if (!i && !j) continue;
			latt.push(Math.round(Math.hypot(i * e.T1[0] + j * e.T2[0], i * e.T1[1] + j * e.T2[1]) * 1e6));
		}
		const pairs = [];
		for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
			pairs.push(Math.round(modDist(cs[i], cs[j], e.T1, e.T2) * 1e6));
		}
		const area = Math.abs(e.T1[0] * e.T2[1] - e.T1[1] * e.T2[0]);
		return [e.k, e.faces.length, Math.round(area * 1e6), latt.sort((a, b) => a - b).join(','),
			pairs.sort((a, b) => a - b).join(',')].join('|');
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

	// SELF-CHECK THE ORACLE BEFORE TRUSTING IT. A predicate that always answered "different" would
	// report a clean dedup too, so it has to prove it is alive: rotate, optionally reflect and shift
	// each sampled entry off its own lattice, and it must come back congruent to itself.
	{
		let pos = 0;
		for (let i = 0; i < entries.length; i += Math.max(1, Math.floor(entries.length / 25))) {
			const e = entries[i];
			const T = TRANSFORMS[(i * 7) % TRANSFORMS.length];
			const t = [0.31 + 0.07 * (i % 5), -0.19 - 0.11 * (i % 3)];
			const shift = ([x, y]) => [x + t[0], y + t[1]];
			const clone = { k: e.k, T1: T.f(e.T1), T2: T.f(e.T2), faces: e.faces.map((f) => f.map(T.f).map(shift)) };
			if (!congruent(clone, e, TRANSFORMS)) {
				console.error(`euhalf/${B.id}: congruence oracle FAILED to recognise ${e.id} moved onto itself`);
				process.exit(2);
			}
			pos++;
		}
		console.log(`  ${B.id}: congruence self-check — ${pos} transformed copies recognised`);
	}

	const rot = reduce(ROT_ONLY);
	const distinct = reduce(TRANSFORMS).keep.sort((a, b) => a.k - b.k);
	console.log(`  ${B.id}: ${entries.length} solver solutions -> ${rot.keep.length} up to rotation `
		+ `-> ${distinct.length} distinct up to rotation AND reflection   `
		+ `(shape ${worstShape.toExponential(1)}, area ${worstArea.toExponential(1)}, vertex ${(360 + worstAngle).toFixed(2)}°)`);

	const byK = new Map();
	for (const e of distinct) {
		if (!byK.has(e.k)) byK.set(e.k, []);
		byK.get(e.k).push(e);
	}
	mkdirSync(OUT, { recursive: true });
	const ks = [...byK.keys()].sort((a, b) => a - b);
	manifest[B.id] = { label: B.label, tile: B.tile, D: B.D, ks, counts: {} };
	for (const k of ks) {
		const rows = byK.get(k).map((e, i) => ({
			id: `euh${B.id}-${k}-${String(i + 1).padStart(5, '0')}`,
			k, T1: e.T1, T2: e.T2, seeds: e.seeds, faces: e.faces, stats: e.stats,
		}));
		// NO per-board shard is written. The sibling shelves write one and the app never reads it —
		// `loadShelfShard` fetches `/reference-atlas-<shelf>-k<k>.json` and nothing else — so on a shelf
		// this size the copy is 77 MB of disk for nothing, and `public/` is already 2 GB with Marek
		// asking about space. Provenance lives where it belongs, in tools/ctrnact-oracle/run-*/, and the
		// manifest below records what was built.
		void rows;
		manifest[B.id].counts[k] = rows.length;
		grandTotal += rows.length;
		const ref = byK.get(k).map((e, i) => {
			const divided = tJunctions(e.faces, e.T1, e.T2, residue);
			return {
				id: `euh${B.id}-k${k}-${String(i + 1).padStart(4, '0')}`,
				source: 'euhalf',
				euHalfBoard: B.id,
				k,
				family: B.label,
				renderCell: {
					cellPolygons: e.faces.map(dropCollinear).map((f) => ({ n: f.length, vertices: f, hue: B.hue })),
					basis: [e.T1, e.T2],
				},
				discoverer: `Čtrnáct engine (eu-half palette), 2026-08-14`,
				// Deliberately NOT asserting "edge-to-edge" when the count is zero. The T-junction detector
				// agrees with the original edge-to-edge enumeration exactly on pent, hexm, sqmid and on hexv
				// at k=1 and k=3, and reports 9 more than it should across hexv k=2 and k=4. Until that is
				// run down, a positive count is a claim worth making and a zero is not.
				note: `Periodic tiling by the ${B.tile}, `
					+ `${e.faces.length} per period cell`
					+ (divided
						? `, with ${divided} T-junction${divided === 1 ? '' : 's'} per cell where one tile's edge `
							+ 'is met by two neighbours instead of being matched whole. '
						: '. ')
					+ `${B.note} `
					+ 'Certified here: every face is exactly the tile, the faces cover the period cell with no gap '
					+ 'and no overlap, and every vertex sees a full turn.',
			};
		});
		if (k <= EAGER_MAX) eager.push(...ref);
		else {
			if (!lazy.has(k)) lazy.set(k, []);
			lazy.get(k).push(...ref);
		}
	}
}

writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
writeFileSync(path.join(PUB, 'reference-atlas-euhalf.json'), stringifyAtlas(eager));
console.log(`\n  ${grandRaw} solver solutions -> ${grandTotal} distinct tilings on the shelf`);
console.log(`  atlas: ${eager.length} entries (k<=${EAGER_MAX}, eager) -> public/reference-atlas-euhalf.json`);
for (const k of [...lazy.keys()].sort((a, b) => a - b)) {
	writeFileSync(path.join(PUB, `reference-atlas-euhalf-k${k}.json`), stringifyAtlas(lazy.get(k)));
	console.log(`         ${lazy.get(k).length} entries -> public/reference-atlas-euhalf-k${k}.json (lazy)`);
}
console.log(`  lazy k slices: [${[...lazy.keys()].sort((a, b) => a - b).join(', ')}]`);
