#!/usr/bin/env node
// Build the tri45 shelf from developed cells: one shard per k under public/tri45/.
//
//   node scripts/build-tri45-shelf.mjs <cells.json>
//
// Input is tools/ctrnact-oracle/develop_tri45.py output. Each entry already carries its exact period
// lattice and its developed triangles, so this only splits by k, re-certifies, and writes.
//
// Certification repeated here on purpose: the developer runs on a scratch dir and the shelf is what
// ships, so the invariant is checked against the bytes that land in public/. A triangle must be
// 1 : 1 : sqrt2, and the triangles of one entry must cover its fundamental domain exactly.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { stringifyAtlas } from './atlas/encode.mjs';

// One shelf, several palettes: pass `tag=family=cells.json` per palette and they merge, each keeping
// its own family string so /library can tell them apart inside one tile class.
const ARGS = process.argv.slice(2);
if (!ARGS.length) {
  console.error('usage: node scripts/build-tri45-shelf.mjs <tag=family=cells.json> [...]');
  process.exit(1);
}
const OUT = path.join(process.cwd(), 'public', 'tri45');
const PALETTES = ARGS.map((a) => {
  const i = a.indexOf('='), j = a.indexOf('=', i + 1);
  return { tag: a.slice(0, i), family: a.slice(i + 1, j), rows: JSON.parse(readFileSync(a.slice(j + 1), 'utf8')) };
});
const rawEntries = PALETTES.flatMap((p) => p.rows.map((r) => ({ ...r, tag: p.tag, family: p.family })));

const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

// ---- the two things a `-split` palette needs, both lifted from build-euhalf-shelf.mjs -------------
//
// A `-split` palette models a divisible edge by putting a FLAT 180° corner at its division point, so
// the ordinary search can glue two neighbours onto one edge. The corner is a modelling device, not part
// of the tile: the big 45-45-90 triangle is a triangle whether its hypotenuse meets one neighbour or
// two. It has to stay for the ANGLE certificate, where a divided edge contributes its 180° and the
// vertex still closes at exactly 360, and it has to go before anything else looks at the face.
const dropCollinear = (f) => {
  const out = [];
  for (let t = 0; t < f.length; t++) {
    const p = f[(t - 1 + f.length) % f.length], c = f[t], n = f[(t + 1) % f.length];
    const cross = (c[0] - p[0]) * (n[1] - p[1]) - (c[1] - p[1]) * (n[0] - p[0]);
    if (Math.abs(cross) > 1e-7) out.push(c);
  }
  return out.length >= 3 ? out : f;
};

// IS THIS CELL PRIMITIVE? The flat corners give the search more ways to label the same geometry, and
// some of them close on a lattice COARSER than the tiling's own. Such a record is one tiling written
// twice as large, and the congruence fingerprint below cannot see it: that test re-anchors inside a
// window of fixed radius, so a supercell and its primitive cell produce the same local picture only if
// the window happens to reach far enough — and the whole point of a supercell is that it need not.
// On the half-polygon shelf this filter dropped 63,031 of sqmid's 80,676 records.
//
// The test is direct. Any translation carrying the tiling to itself carries some face to a face of the
// same shape, so every candidate is a difference of two same-shape face centroids. If one of those,
// taken modulo the lattice, is nonzero and maps the whole marker set onto itself, the cell is a
// supercell.
const centroidOf = (f) => [f.reduce((u, q) => u + q[0], 0) / f.length, f.reduce((u, q) => u + q[1], 0) / f.length];
const profileOf = (f) => {
  const sides = [], angs = [];
  for (let t = 0; t < f.length; t++) {
    const p = f[t], u = f[(t - 1 + f.length) % f.length], v = f[(t + 1) % f.length];
    sides.push(dist(p, v));
    const ux = u[0] - p[0], uy = u[1] - p[1], vx = v[0] - p[0], vy = v[1] - p[1];
    angs.push(Math.abs((Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) * 180) / Math.PI));
  }
  return { sides: sides.sort((a, b) => a - b), angs: angs.sort((a, b) => a - b) };
};

// A point reduced modulo the period lattice, keyed in CARTESIAN coordinates. Used by both the angle
// certificate and the supercell filter, so it is defined once here.
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
const isPrimitive = (faces, T1, T2) => {
  const marks = faces.map((f) => ({ c: centroidOf(f), s: profileOf(f) }));
  const key = (p) => residue(p, T1, T2);
  const have = new Set(marks.map((m) => key(m.c)));
  const same = (a, b) => a.sides.length === b.sides.length
    && a.sides.every((x, i) => Math.abs(x - b.sides[i]) < 1e-6)
    && a.angs.every((x, i) => Math.abs(x - b.angs[i]) < 1e-4);
  for (let j = 1; j < marks.length; j++) {
    if (!same(marks[0].s, marks[j].s)) continue;
    const t = [marks[j].c[0] - marks[0].c[0], marks[j].c[1] - marks[0].c[1]];
    if (key(t) === key([0, 0])) continue;                       // a lattice vector: not a new symmetry
    let all = true;
    for (const m of marks) {
      const img = key([m.c[0] + t[0], m.c[1] + t[1]]);
      if (!have.has(img)) { all = false; break; }
      const dst = marks.find((n) => key(n.c) === img);
      if (!dst || !same(m.s, dst.s)) { all = false; break; }
    }
    if (all) return false;
  }
  return true;
};
const entries = rawEntries.filter((e) => isPrimitive(e.faces, e.T1, e.T2));
if (entries.length !== rawEntries.length) {
  console.log(`  supercell filter: dropped ${rawEntries.length - entries.length} of ${rawEntries.length} descriptions`);
}

// Certify what actually ships. Two invariants, both general over the palette's polygons rather than
// assuming triangles: every EDGE is one of the declared lengths (1 or sqrt2), and the faces of one
// entry cover its period cell exactly. The second is the one that catches a developer laying tiles
// somewhere they do not belong; it is necessary, not sufficient, so it does not replace looking.
// The lengths any of these palettes declares: 1, sqrt2, 2, 2*sqrt2. An edge measuring anything else
// means the developer stepped wrong, which is the failure the shape check exists to catch. Measured on
// the REAL tile, so a `-split` palette's flat corners come off first: the divided hypotenuse of a big
// triangle would otherwise read as two edges of length 1, which is a legal length and would let a
// genuinely wrong step hide behind it.
const ALLOWED = [1, Math.SQRT2, 2, 2 * Math.SQRT2];
const SHOELACE = (f) => {
  let a2 = 0;
  for (let t = 0; t < f.length; t++) {
    const u = f[t], v = f[(t + 1) % f.length];
    a2 += u[0] * v[1] - v[0] * u[1];
  }
  return Math.abs(a2 / 2);
};
let worstShape = 0;
let worstArea = 0;
for (const e of entries) {
  const cell = Math.abs(e.T1[0] * e.T2[1] - e.T1[1] * e.T2[0]);
  let area = 0;
  for (const raw of e.faces) {
    const f = dropCollinear(raw);
    for (let t = 0; t < f.length; t++) {
      const L = dist(f[t], f[(t + 1) % f.length]);
      worstShape = Math.max(worstShape, Math.min(...ALLOWED.map((t) => Math.abs(L - t))));
    }
    area += SHOELACE(raw);
  }
  worstArea = Math.max(worstArea, Math.abs(area - cell) / cell);
}
// ANGLE SUM AT EVERY VERTEX. The third certificate, and the one whose absence shipped 23 objects
// that are not tilings (4 at k=3, 19 at k=4, 2026-08-13): tiles that wrap round a point more than
// once — one of them four times, 1440 degrees where 360 belongs. Edge lengths and area coverage BOTH
// pass on those, because a fourfold cover of a cell has fourfold area and a cell four times as
// large. Only the angles see it. Sum the interior angle every face contributes at each vertex,
// reduced modulo the period lattice; anything but a full turn is a fold, not a tiling. Run on the RAW
// faces, flat corners included: at a divided edge the 180° is exactly what makes the vertex close.
let worstAngle = 0;
for (const e of entries) {
  const ang = new Map();
  for (const f of e.faces) {
    for (let t = 0; t < f.length; t++) {
      const p = f[t], u = f[(t - 1 + f.length) % f.length], v = f[(t + 1) % f.length];
      const ux = u[0] - p[0], uy = u[1] - p[1], vx = v[0] - p[0], vy = v[1] - p[1];
      const th = Math.abs((Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) * 180) / Math.PI);
      const key = residue(p, e.T1, e.T2);
      ang.set(key, (ang.get(key) ?? 0) + th);
    }
  }
  for (const total of ang.values()) worstAngle = Math.max(worstAngle, Math.abs(total - 360));
}
if (worstShape > 1e-6 || worstArea > 1e-6 || worstAngle > 0.5) {
  console.error(`tri45: REFUSING to write — edge err ${worstShape.toExponential(2)}, area err ${worstArea.toExponential(2)}, worst vertex angle ${(360 + worstAngle).toFixed(1)}°`);
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });
// DEDUPE BY GEOMETRY. The solver emits 19 solutions at k<=3; developed, they are all the SAME tiling
// at different fundamental-cell sizes. That is not a developer artefact: at a vertex the four squares
// give 45+45 exactly when cut one way, so the vertex word 45.45.90.45.45.90 forces every square to the
// same diagonal, and all-/ and all-\ are mirror images that merge. One tiling. Shipping the raw 19
// would publish a count this file can disprove, so the shelf carries the distinct tilings only, and
// the inflated enumeration is recorded in experiments/results/tri45-edge-types-2026-08-13.md.
// DEDUPE BY EXACT CONGRUENCE. This used to be a WINDOW FINGERPRINT: clip the tiling to a radius-3.2
// patch, re-anchor on each face near the origin, take the lexicographically smallest string over the 16
// maps k·45° × mirror. That is a heuristic and it fails in the direction that costs tilings — two
// DIFFERENT tilings agreeing on a radius-3.2 patch collapse into one, and at k=4 with 16 tiles per cell
// a 3.2 patch is nowhere near enough to separate them. Measured after the split rebuild: 453 of the
// 5,313 previously shipped tilings had no congruent copy on the new shelf, while the per-palette
// containment against the same sources was exact at every k. The gap was entirely this fingerprint
// merging distinct tilings, differently before and after.
//
// Replaced with the oracle build-euhalf-shelf.mjs uses, which is exact rather than local: a congruence
// between two periodic tilings of this family is a rotation by a multiple of 15° (everything develops
// in ℤ[ζ₂₄]) times an optional reflection times a translation; it must carry one period lattice ONTO
// the other UNIMODULARLY, and then match every face to a face of the same shape. A cheap
// congruence-invariant signature buckets first so the quadratic part only runs inside a bucket. Mirror
// pairs merging is the project's settled convention.
const TRANSFORMS = [];
for (const mir of [false, true]) {
  for (let r = 0; r < 24; r++) {
    const th = (2 * Math.PI * r) / 24, c = Math.cos(th), sn = Math.sin(th);
    TRANSFORMS.push({ f: ([x, y]) => { const a = mir ? -x : x; return [c * a - sn * y, sn * a + c * y]; } });
  }
}
const frac = (p, T1, T2) => {
  const det = T1[0] * T2[1] - T1[1] * T2[0];
  return [(p[0] * T2[1] - p[1] * T2[0]) / det, (T1[0] * p[1] - T1[1] * p[0]) / det];
};
const wrap = (t) => { const w = t - Math.round(t); return Math.abs(w) < 1e-6 ? 0 : w; };
const shapeOf = (v) => { const [cx, cy] = centroidOf(v); return v.map(([x, y]) => [x - cx, y - cy]); };
// Multiset comparison with tolerance, NEVER by sorting coordinates first: a rotated copy of a symmetric
// face differs in the last bits, so two vertices sharing an x can sort either way and an element-wise
// test then calls a tiling different from itself.
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
const markers = (e, T, b1, b2) => e.real.map((f) => {
  const t = T ? f.map(T.f) : f;
  return { fr: frac(centroidOf(t), b1, b2), shape: shapeOf(t) };
});
const congruent = (A, B) => {
  const mb = markers(B, null, B.T1, B.T2);
  for (const T of TRANSFORMS) {
    const [p, q] = [T.f(A.T1), T.f(A.T2)].map((v) => frac(v, B.T1, B.T2));
    const ip = p.map(Math.round), iq = q.map(Math.round);
    if (Math.abs(p[0] - ip[0]) > 1e-6 || Math.abs(p[1] - ip[1]) > 1e-6) continue;
    if (Math.abs(q[0] - iq[0]) > 1e-6 || Math.abs(q[1] - iq[1]) > 1e-6) continue;
    if (Math.abs(Math.abs(ip[0] * iq[1] - ip[1] * iq[0]) - 1) > 1e-6) continue;
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
const modDist = (p, q, T1, T2) => {
  const [fa, fb] = frac([p[0] - q[0], p[1] - q[1]], T1, T2);
  let best = Infinity;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const a = fa - Math.round(fa) + i, b = fb - Math.round(fb) + j;
    best = Math.min(best, Math.hypot(a * T1[0] + b * T2[0], a * T1[1] + b * T2[1]));
  }
  return best;
};
// Rounded to 1e-3, not 1e-6: two palettes develop the same tiling by different routes and agree only to
// floating-point noise, so a finer key puts congruent entries in different buckets and the oracle never
// gets to compare them. 1e-3 is far below any real distinction on this palette (the shortest edge is 1).
const signature = (e) => {
  const cs = e.real.map(centroidOf);
  const latt = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    if (!i && !j) continue;
    latt.push(Math.round(Math.hypot(i * e.T1[0] + j * e.T2[0], i * e.T1[1] + j * e.T2[1]) * 1e3));
  }
  const pairs = [];
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    pairs.push(Math.round(modDist(cs[i], cs[j], e.T1, e.T2) * 1e3));
  }
  return [e.k, e.real.length, latt.sort((a, b) => a - b).join(','), pairs.sort((a, b) => a - b).join(',')].join('|');
};
// `real` is the tile set with the modelling corners off, and everything above reads it: a big triangle
// written as a 4-gon has an extra vertex and a centroid pulled toward its hypotenuse, so comparing raw
// faces would make one tiling look like two depending on which palette found it — and this dedup runs
// ACROSS palettes, tri45sq having no split and tri45all-split having one.
for (const e of entries) e.real = e.faces.map(dropCollinear);

// SELF-CHECK THE ORACLE BEFORE TRUSTING IT. A predicate that always answered "different" would report a
// clean dedup too, so it has to prove it is alive: rotate, optionally reflect and shift each sampled
// entry off its own lattice, and it must come back congruent to itself.
{
  let n = 0;
  for (let i = 0; i < entries.length; i += Math.max(1, Math.floor(entries.length / 25))) {
    const e = entries[i], T = TRANSFORMS[(i * 7) % TRANSFORMS.length];
    const t = [0.31 + 0.07 * (i % 5), -0.19 - 0.11 * (i % 3)];
    const sh = ([x, y]) => [x + t[0], y + t[1]];
    const clone = { T1: T.f(e.T1), T2: T.f(e.T2), real: e.real.map((f) => f.map(T.f).map(sh)) };
    if (!congruent(clone, e)) {
      console.error(`tri45: congruence oracle FAILED to recognise an entry moved onto itself`);
      process.exit(2);
    }
    n++;
  }
  console.log(`  congruence self-check: ${n} transformed copies recognised`);
}
const bucketed = new Map();
for (const e of entries) {
  const s = signature(e);
  if (!bucketed.has(s)) bucketed.set(s, []);
  bucketed.get(s).push(e);
}
const distinct = [];
for (const group of bucketed.values()) {
  const reps = [];
  for (const e of group) if (!reps.some((r) => congruent(e, r))) reps.push(e);
  distinct.push(...reps);
}
distinct.sort((a, b) => a.k - b.k);
console.log(`  dedupe by exact congruence: ${entries.length} solver solutions -> ${distinct.length} distinct tiling(s)`
  + ` (${bucketed.size} signature buckets)`);

const byK = new Map();
for (const e of distinct) {
  if (!byK.has(e.k)) byK.set(e.k, []);
  byK.get(e.k).push(e);
}


// COUNTING THE T-JUNCTIONS, and that is not the same as counting flat corners. In a `-split` palette
// every big triangle carries its flat corner all the time; what says whether an edge is actually
// DIVIDED is what sits opposite. Two big triangles meeting hypotenuse-to-hypotenuse put their flat
// corners at the same point, which sees exactly two corners, 180 + 180. A genuinely divided edge puts a
// flat corner against two or more real ones. So a T-junction is a vertex position holding a 180 AND
// more than two corners in total.
const tJunctions = (e) => {
  const seen = new Map();
  for (const f of e.faces) {
    for (let t = 0; t < f.length; t++) {
      const p = f[t], u = f[(t - 1 + f.length) % f.length], v = f[(t + 1) % f.length];
      const ux = u[0] - p[0], uy = u[1] - p[1], vx = v[0] - p[0], vy = v[1] - p[1];
      const th = Math.abs((Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) * 180) / Math.PI);
      const key = residue(p, e.T1, e.T2);
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

const manifest = { board: 't45', tile: '45-45-90 triangle', edgeTypes: ['leg', 'hypotenuse'], k: [] };
for (const k of [...byK.keys()].sort((a, b) => a - b)) {
  const rows = byK.get(k).map((e, i) => ({
    id: `${e.tag}-${k}-${String(i + 1).padStart(5, '0')}`,
    k,
    T1: e.T1,
    T2: e.T2,
    seeds: e.seeds,
    // Flat corners off: they were a way of asking the search a question, and the answer is a triangle.
    faces: e.real,
    stats: e.stats,
  }));
  const file = path.join(OUT, `t45-k${k}.json`);
  writeFileSync(file, stringifyAtlas(rows));
  manifest.k.push({ k, count: rows.length, file: `/tri45/t45-k${k}.json` });
  console.log(`  k=${k}: ${rows.length} tilings -> public/tri45/t45-k${k}.json`);
}
writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

// The atlas shelf itself. These are plain Euclidean tilings with polygon cells, so they need no new
// renderer: `renderCell = { cellPolygons, basis }` is the shape the flat p5 canvas already draws, the
// same one the mixed and scaled shelves ship. One reference-atlas-<source>.json, one source branch in
// tileClassOf, one bestEffort fetch, and it appears in /library and /play together.
const ref = [];
for (const k of [...byK.keys()].sort((a, b) => a - b)) {
  byK.get(k).forEach((e, i) => {
    const faces = e.real;
    const divided = tJunctions(e);
    // What this entry is actually MADE of, read off the geometry instead of asserted. The three
    // palettes on this shelf hold different tiles — tri45x has no square at all — and the old note
    // promised "the 45-45-90 triangle, the unit square and the √2 square" on every record of all three.
    const kinds = new Set(faces.map((f) => {
      const a = SHOELACE(f);
      if (f.length === 4) return Math.abs(a - 1) < 1e-6 ? 'the unit square' : 'the √2 square';
      return Math.abs(a - 0.5) < 1e-6 ? 'the 45-45-90 triangle' : 'its double-scale copy';
    }));
    const ORDER = ['the 45-45-90 triangle', 'its double-scale copy', 'the unit square', 'the √2 square'];
    const made = ORDER.filter((s) => kinds.has(s));
    ref.push({
      id: `${e.tag}-k${k}-${String(i + 1).padStart(3, '0')}`,
      source: 'tri45',
      k,
      family: e.family,
      renderCell: {
        // `n` drives the polygon-species facet, so it has to be the face's real side count — it was
        // pinned at 3 here, which filed every square on this shelf under "triangle".
        cellPolygons: faces.map((f) => ({ n: f.length, vertices: f })),
        basis: [e.T1, e.T2],
      },
      discoverer: 'Čtrnáct engine (edge-typed palette), 2026-08-13',
      note:
        `Periodic tiling by ${made.length === 1 ? made[0] : `${made.slice(0, -1).join(', ')} and ${made[made.length - 1]}`}, ` +
        `${e.stats.tiles} tiles per period cell` +
        (divided
          ? `, with ${divided} T-junction${divided === 1 ? '' : 's'} per cell where one tile's edge is met ` +
            'by two neighbours instead of being matched whole. '
          : '. ') +
        'Built with EDGE TYPES: the leg and the hypotenuse ' +
        'are incommensurable (1 : √2), so only like edges may glue. The two squares are the sharpest ' +
        'case — they carry the SAME angle word, 90.90.90.90, and differ only in their edges, so a ' +
        'unit-edge alphabet cannot tell them apart and cannot express the √2 square at all. ' +
        'Developed exactly in ℤ[ζ₂₄] with a √2 step; tiles cover the period cell with no gap and no ' +
        'overlap, every edge measures 1, √2 or 2, and every vertex sees a full turn. Enumerated with ' +
        'the face filter OFF: that prune assumes unit edges and silently discards valid vertex types ' +
        'on an edge-typed palette.',
    });
  });
}
// k<=2 eager, deeper tiers as lazy shards, the split every large shelf here uses (mixed, scaled,
// period). The whole shelf as one eager file is 7 MB on every page load; the eager tier is ~300 KB.
const PUB = path.join(process.cwd(), 'public');
const eager = ref.filter((r) => r.k <= 2);
writeFileSync(path.join(PUB, 'reference-atlas-tri45.json'), stringifyAtlas(eager));
console.log(`  atlas shelf: ${eager.length} entries (k<=2, eager) -> public/reference-atlas-tri45.json`);
for (const k of [...new Set(ref.filter((r) => r.k > 2).map((r) => r.k))].sort((a, b) => a - b)) {
  const rows = ref.filter((r) => r.k === k);
  writeFileSync(path.join(PUB, `reference-atlas-tri45-k${k}.json`), stringifyAtlas(rows));
  console.log(`               ${rows.length} entries -> public/reference-atlas-tri45-k${k}.json (lazy)`);
}
console.log(`tri45: ${distinct.length} distinct tilings, shape err ${worstShape.toExponential(2)}, area err ${worstArea.toExponential(2)}, angle err ${worstAngle.toExponential(2)}° — certified`);
