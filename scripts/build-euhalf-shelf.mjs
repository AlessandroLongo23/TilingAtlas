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
		id: 'hexv', label: '{6} halved by its long diagonal', cells: 'run-eu-half-hex-v-k13/eu-half-hex-v-cells.json',
		D: 6, hue: 205, tile: '60-120-120-60 trapezoid',
		angles: [60, 120, 120, 60], sides: [1, 1, 1, 2],
		note: 'Half a regular hexagon, cut by the long diagonal from a vertex to the opposite vertex. Two of '
			+ 'them glue along the long side to make a hexagon, so this board cannot be empty; what the '
			+ 'catalogue counts is everything else the trapezoid does. Isosceles, so achiral, and the only '
			+ 'board of the four whose two edge lengths are both rational (1 and 2).',
	},
	{
		id: 'pent', label: '{5} halved by its mirror', cells: 'run-eu-half-pent-k14/eu-half-pent-cells.json',
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
		id: 'hexm', label: '{6} halved between opposite edges', cells: 'run-eu-half-hex-m-k6/eu-half-hex-m-cells.json',
		D: 12, hue: 140, tile: '90-120-120-120-90 pentagon',
		angles: [90, 120, 120, 120, 90], sides: [1, 2, 2, 1, 2 * Math.sqrt(3)],
		note: 'The hexagon’s other cut, joining the midpoints of two opposite edges, which makes a '
			+ 'pentagon with two right angles. Its long side is the width across the hexagon, 2√3 at '
			+ 'twice the hexagon’s own side. Exactly one tiling, and nothing at k = 1 or 3..6.',
	},
	{
		id: 'sqmid', label: '{4} halved between opposite edges', cells: 'run-eu-half-sq-mid-k6/eu-half-sq-mid-cells.json',
		D: 4, hue: 320, tile: '1×2 rectangle (the domino)',
		angles: [90, 90, 90, 90], sides: [1, 2, 1, 2],
		note: 'The square’s midpoint cut is the DOMINO, and it has exactly ONE edge-to-edge tiling — '
			+ 'provably, not just to the depth searched. Every corner is a right angle flanked by one long '
			+ 'and one short side, so the four edges at a vertex alternate long/short; two edges separated by '
			+ 'one other sit at 180° and are therefore collinear; so the long edges lie on one family of '
			+ 'parallel lines and the short edges on the perpendicular family, which is the aligned grid and '
			+ 'nothing else. Running bond, herringbone and basketweave are T-junction patterns, so they are '
			+ 'absent from an edge-to-edge enumeration by definition rather than missing from it.',
	},
];

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
	const entries = JSON.parse(readFileSync(path.join(ORACLE, B.cells), 'utf8'));
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
			const pr = profile(f);
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
		const ref = byK.get(k).map((e, i) => ({
			id: `euh${B.id}-k${k}-${String(i + 1).padStart(4, '0')}`,
			source: 'euhalf',
			euHalfBoard: B.id,
			k,
			family: B.label,
			renderCell: {
				cellPolygons: e.faces.map((f) => ({ n: f.length, vertices: f, hue: B.hue })),
				basis: [e.T1, e.T2],
			},
			discoverer: `Čtrnáct engine (eu-half palette), 2026-08-14`,
			note: `Edge-to-edge periodic tiling by the ${B.tile} — ${e.faces.length} per period cell. ${B.note} `
				+ 'Certified here: every face is exactly the tile, the faces cover the period cell with no gap '
				+ 'and no overlap, and every vertex sees a full turn.',
		}));
		if (k <= EAGER_MAX) eager.push(...ref);
		else {
			if (!lazy.has(k)) lazy.set(k, []);
			lazy.get(k).push(...ref);
		}
	}
}

writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
writeFileSync(path.join(PUB, 'reference-atlas-euhalf.json'), JSON.stringify(eager));
console.log(`\n  ${grandRaw} solver solutions -> ${grandTotal} distinct tilings on the shelf`);
console.log(`  atlas: ${eager.length} entries (k<=${EAGER_MAX}, eager) -> public/reference-atlas-euhalf.json`);
for (const k of [...lazy.keys()].sort((a, b) => a - b)) {
	writeFileSync(path.join(PUB, `reference-atlas-euhalf-k${k}.json`), JSON.stringify(lazy.get(k)));
	console.log(`         ${lazy.get(k).length} entries -> public/reference-atlas-euhalf-k${k}.json (lazy)`);
}
console.log(`  lazy k slices: [${[...lazy.keys()].sort((a, b) => a - b).join(', ')}]`);
