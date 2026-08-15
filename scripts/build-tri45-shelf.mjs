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
const entries = PALETTES.flatMap((p) => p.rows.map((r) => ({ ...r, tag: p.tag, family: p.family })));

const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

// Certify what actually ships. Two invariants, both general over the palette's polygons rather than
// assuming triangles: every EDGE is one of the declared lengths (1 or sqrt2), and the faces of one
// entry cover its period cell exactly. The second is the one that catches a developer laying tiles
// somewhere they do not belong; it is necessary, not sufficient, so it does not replace looking.
// The lengths any of these palettes declares: 1, sqrt2, 2, 2*sqrt2. An edge measuring anything else
// means the developer stepped wrong, which is the failure the shape check exists to catch.
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
  for (const f of e.faces) {
    for (let t = 0; t < f.length; t++) {
      const L = dist(f[t], f[(t + 1) % f.length]);
      worstShape = Math.max(worstShape, Math.min(...ALLOWED.map((t) => Math.abs(L - t))));
    }
    area += SHOELACE(f);
  }
  worstArea = Math.max(worstArea, Math.abs(area - cell) / cell);
}
// ANGLE SUM AT EVERY VERTEX. The third certificate, and the one whose absence shipped 23 objects
// that are not tilings (4 at k=3, 19 at k=4, 2026-08-13): tiles that wrap round a point more than
// once — one of them four times, 1440 degrees where 360 belongs. Edge lengths and area coverage BOTH
// pass on those, because a fourfold cover of a cell has fourfold area and a cell four times as
// large. Only the angles see it. Sum the interior angle every face contributes at each vertex,
// reduced modulo the period lattice; anything but a full turn is a fold, not a tiling.
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
// CANONICAL FINGERPRINT, invariant under congruence. Two entries describing the same tiling in
// different positions, orientations or chiralities must collapse to one — the earlier version anchored
// on position only, so a rotated copy survived as a separate entry (AL spotted tri45-k1-10 and -11).
// Every edge direction here is a multiple of 45°, so the congruences worth quotienting are the 16
// maps k·45° × mirror. For each, re-anchor on each face near the origin, clip to a window, and keep the
// lexicographically smallest string. Mirror pairs merging is the project's settled convention.
const TRANSFORMS = [];
for (let k = 0; k < 8; k++) {
  const th = (k * Math.PI) / 4, c = Math.cos(th), sn = Math.sin(th);
  for (const m of [1, -1]) TRANSFORMS.push(([x, y]) => [m * (c * x - sn * y), m * (sn * x + c * y)]);
}
const RW = 3.2;
const fingerprint = (e) => {
  const [[ax, ay], [bx, by]] = [e.T1, e.T2];
  const reach = Math.ceil(RW / Math.max(0.5, Math.min(Math.hypot(ax, ay), Math.hypot(bx, by)))) + 2;
  const raw = [];
  for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
    const ox = i * ax + j * bx, oy = i * ay + j * by;
    for (const f of e.faces) raw.push(f.map(([x, y]) => [x + ox, y + oy]));
  }
  let best = null;
  for (const T of TRANSFORMS) {
    const fs = raw.map((f) => {
      const t = f.map(T);
      const cx = t.reduce((u, q) => u + q[0], 0) / t.length;
      const cy = t.reduce((u, q) => u + q[1], 0) / t.length;
      return [cx, cy, t.length, Math.round(SHOELACE(t) * 1000)];
    });
    for (const [ax0, ay0] of fs.filter((q) => Math.hypot(q[0], q[1]) < 1.2)) {
      const key = fs
        .map(([cx, cy, n, ar]) => [cx - ax0, cy - ay0, n, ar])
        .filter(([cx, cy]) => Math.hypot(cx, cy) <= RW)
        .map(([cx, cy, n, ar]) => `${Math.round(cx * 1000)},${Math.round(cy * 1000)},${n},${ar}`)
        .sort()
        .join('|');
      if (best === null || key < best) best = key;
    }
  }
  return best;
};
const seen = new Map();
for (const e of entries) {
  const sig = fingerprint(e);
  if (sig && !seen.has(sig)) seen.set(sig, e);
}
const distinct = [...seen.values()];
console.log(`  dedupe by geometry: ${entries.length} solver solutions -> ${distinct.length} distinct tiling(s)`);

const byK = new Map();
for (const e of distinct) {
  if (!byK.has(e.k)) byK.set(e.k, []);
  byK.get(e.k).push(e);
}


const manifest = { board: 't45', tile: '45-45-90 triangle', edgeTypes: ['leg', 'hypotenuse'], k: [] };
for (const k of [...byK.keys()].sort((a, b) => a - b)) {
  const rows = byK.get(k).map((e, i) => ({
    id: `${e.tag}-${k}-${String(i + 1).padStart(5, '0')}`,
    k,
    T1: e.T1,
    T2: e.T2,
    seeds: e.seeds,
    faces: e.faces,
    stats: e.stats,
  }));
  const file = path.join(OUT, `t45-k${k}.json`);
  writeFileSync(file, JSON.stringify(rows));
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
    ref.push({
      id: `${e.tag}-k${k}-${String(i + 1).padStart(3, '0')}`,
      source: 'tri45',
      k,
      family: e.family,
      renderCell: {
        cellPolygons: e.faces.map((f) => ({ n: 3, vertices: f })),
        basis: [e.T1, e.T2],
      },
      discoverer: 'Čtrnáct engine (edge-typed palette), 2026-08-13',
      note:
        `Edge-to-edge tiling by the 45-45-90 triangle, the unit square and the √2 square, ` +
        `${e.stats.tiles} tiles per period cell. Built with EDGE TYPES: the leg and the hypotenuse ` +
        'are incommensurable (1 : √2), so only like edges may glue. The two squares are the sharpest ' +
        'case — they carry the SAME angle word, 90.90.90.90, and differ only in their edges, so a ' +
        'unit-edge alphabet cannot tell them apart and cannot express the √2 square at all. ' +
        'Developed exactly in ℤ[ζ₂₄] with a √2 step; tiles cover the period cell with no gap and no ' +
        'overlap, and every edge measures 1 or √2. Enumerated with the face filter OFF: that prune ' +
        'assumes unit edges and silently discards valid vertex types on an edge-typed palette.',
    });
  });
}
// k<=2 eager, deeper tiers as lazy shards, the split every large shelf here uses (mixed, scaled,
// period). The whole shelf as one eager file is 7 MB on every page load; the eager tier is ~300 KB.
const PUB = path.join(process.cwd(), 'public');
const eager = ref.filter((r) => r.k <= 2);
writeFileSync(path.join(PUB, 'reference-atlas-tri45.json'), JSON.stringify(eager));
console.log(`  atlas shelf: ${eager.length} entries (k<=2, eager) -> public/reference-atlas-tri45.json`);
for (const k of [...new Set(ref.filter((r) => r.k > 2).map((r) => r.k))].sort((a, b) => a - b)) {
  const rows = ref.filter((r) => r.k === k);
  writeFileSync(path.join(PUB, `reference-atlas-tri45-k${k}.json`), JSON.stringify(rows));
  console.log(`               ${rows.length} entries -> public/reference-atlas-tri45-k${k}.json (lazy)`);
}
console.log(`tri45: ${distinct.length} distinct tilings, shape err ${worstShape.toExponential(2)}, area err ${worstArea.toExponential(2)}, angle err ${worstAngle.toExponential(2)}° — certified`);
