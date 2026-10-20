// Audit of frames -detail output: every copy, mapped from the tile's solver points by its cell map,
// lands on cells; each tiling covers the frame's region exactly once; the two share no tile. With
// --original, on the triangle grid, also checks the two tilings, the holes and the overlap pieces
// against the unmodified FrameFinder.html engine (original-engine.js).
//
// Usage: ./frames <grid> <N> -detail < tiles | node check_detail.js <grid> [--original N]
'use strict';
const fs = require('fs');
const path = require('path');

const [grid, flag, origN] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(path.join(__dirname, 'grids.json'), 'utf8'))[grid];
const [[ax, ay], [bx, by]] = spec.V, det = ax * by - ay * bx;
/** A solver point back to its cell [n1, n2, t], or null when it is no cell. */
function cellOf(x, y) {
  for (let t = 0; t < spec.T; t++) {
    const dx = x - spec.origin[t][0], dy = y - spec.origin[t][1];
    const n1 = (by * dx - bx * dy) / det, n2 = (ax * dy - ay * dx) / det;
    if (Number.isInteger(n1) && Number.isInteger(n2)) return [n1, n2, t];
  }
  return null;
}
const key = (c) => c.join(',');
/** One tiling as its copies' cell sets: each copy is the tile's points through one cell map. */
function copies(pts, maps) {
  const out = [];
  for (let i = 0; i < maps.length; i += 6) {
    const [a, b, c, d, e, f] = maps.slice(i, i + 6), cells = [];
    for (let j = 0; j < pts.length; j += 2) {
      const cl = cellOf(a * pts[j] + b * pts[j + 1] + c, d * pts[j] + e * pts[j + 1] + f);
      if (!cl) throw new Error(`copy ${i / 6} maps a cell off the grid`);
      cells.push(key(cl));
    }
    out.push(cells.sort());
  }
  return out;
}

let checked = 0, bad = 0, original = 0;
const G = flag === '--original' ? require('./baseline.js')(spec, true) : null;
const E = flag === '--original' ? require('./original-engine.js') : null;
for (const line of fs.readFileSync(0, 'utf8').split('\n').filter((l) => l.trim())) {
  const row = JSON.parse(line);
  let orig = null;
  if (E) {
    // The original's frames, by canonical key, with their tilings, holes and pieces.
    const v = row.tile.split(/\s+/).map(Number), tile = [];
    for (let i = 0; i + 2 < v.length; i += 3) tile.push([v[i], v[i + 1] - v[i + 2], v[i + 2]]);
    const s = new E.Searcher(E.normalize(E.dedupe(tile)), +origN, true);
    s.runAll();
    orig = new Map(s.frames.map(E.decorate).map((f) => {
      const conv = (cs) => cs.map((c) => [c[0], c[1] + c[2], c[2]]);
      return [G.keyOf(G.canon(conv(f.cells))), { f, conv }];
    }));
  }
  row.frames.forEach((k, i) => {
    const d = row.detail[i], region = k.split(' ').sort();
    const [t1, t2] = d.t.map((m) => copies(row.pts, m));
    const errs = [];
    for (const [name, tl] of [['tiling 1', t1], ['tiling 2', t2]]) {
      const all = tl.flat().sort();
      if (tl.length !== d.n) errs.push(`${name} has ${tl.length} copies, not ${d.n}`);
      if (all.length !== new Set(all).size) errs.push(`${name} overlaps itself`);
      if (all.join(' ') !== region.join(' ')) errs.push(`${name} does not cover the region`);
    }
    const s1 = new Set(t1.map((c) => c.join(' ')));
    if (t2.some((c) => s1.has(c.join(' ')))) errs.push('the tilings share a tile');
    if (orig) {
      const o = orig.get(k);
      if (!o) errs.push('the original engine has no such frame');
      else {
        // The original's tilings in canonical position: through any symmetry that takes its region
        // to the canonical one (a symmetry of the region swaps or keeps its only two tilings).
        const want = region.join(' ');
        const imgs = spec.syms.map((S) => (cs) => {
          const m = cs.map((c) => [S.A[0][0] * c[0] + S.A[0][1] * c[1] + S.img[c[2]][0], S.A[1][0] * c[0] + S.A[1][1] * c[1] + S.img[c[2]][1], S.img[c[2]][2]]);
          const mx = Math.min(...m.map((c) => c[0])), my = Math.min(...m.map((c) => c[1]));
          return m.map((c) => [c[0] - mx, c[1] - my, c[2]]);
        });
        const pair = (tl) => tl.map((c) => c.join(' ')).sort().join(' | ');
        const mine = [pair(t1), pair(t2)].sort().join(' || ');
        const match = imgs.some((img) => {
          const regionCells = o.conv(o.f.cells), m = img(regionCells);
          if (m.map(key).sort().join(' ') !== want) return false;
          // The same map, with the region's normalising shift, applied to every copy.
          const S = spec.syms[imgs.indexOf(img)];
          const ap = (c) => [S.A[0][0] * c[0] + S.A[0][1] * c[1] + S.img[c[2]][0], S.A[1][0] * c[0] + S.A[1][1] * c[1] + S.img[c[2]][1], S.img[c[2]][2]];
          const full = regionCells.map(ap), mx = Math.min(...full.map((c) => c[0])), my = Math.min(...full.map((c) => c[1]));
          const place = (tile) => o.conv(tile).map(ap).map((c) => key([c[0] - mx, c[1] - my, c[2]])).sort();
          const theirs = [pair(o.f.tiling1.map(place)), pair(o.f.tiling2.map(place))].sort().join(' || ');
          return theirs === mine;
        });
        if (!match) errs.push('the tilings differ from the original');
        if (JSON.stringify(o.f.holes.slice().sort((a, b) => a - b)) !== JSON.stringify(d.h)) errs.push(`holes ${d.h} vs original ${o.f.holes}`);
        const op = Object.keys(o.f.pieces).map(Number).sort((a, b) => a - b).map((n) => [n, o.f.pieces[n]]);
        if (JSON.stringify(op) !== JSON.stringify(d.p)) errs.push(`pieces ${JSON.stringify(d.p)} vs original ${JSON.stringify(op)}`);
        if (!errs.length) original++;
      }
    }
    checked++;
    if (errs.length) { bad++; if (bad <= 5) console.log(`frame ${k}: ${errs.join('; ')}`); }
  });
}
console.log(`${grid}: ${checked} frames audited, ${bad} failed${E ? `, ${original} identical to the original engine` : ''}`);
process.exit(bad ? 1 : 0);
