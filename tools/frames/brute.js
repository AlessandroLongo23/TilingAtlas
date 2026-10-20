// Independent check of the frame search: grow every edge-connected union of n tiles one tile at a
// time (deduplicated up to symmetry), enumerate every tiling of each, and keep the regions with
// exactly two tilings that share no tile. Complete: a frame is edge-connected (its tilings factor
// over components, so a second component would carry a shared tile), and removing a leaf tile of a
// spanning tree of one tiling leaves an edge-connected union of n - 1 tiles.
//
// Usage: node brute.js <grid> <nmax> [noreflect] < shapes   prints, per tile and n, the canonical keys.
'use strict';
const fs = require('fs');
const path = require('path');
const makeGrid = require('./baseline.js');

const [grid, nmax, flag] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(path.join(__dirname, 'grids.json'), 'utf8'))[grid];
const G = makeGrid(spec, flag !== 'noreflect');
const ck = c => c.join(',');

function tilings(orient, cells) {
  const inR = new Set(cells.map(ck)), cov = new Set(), out = [], cur = [];
  const order = cells.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);
  (function rec(i) {
    while (i < order.length && cov.has(ck(order[i]))) i++;
    if (i === order.length) { out.push(cur.map(t => t.join(' ')).sort()); return; }
    const c = order[i];
    for (const O of orient) for (const o of O) {
      if (o[2] !== c[2]) continue;
      const t = O.map(q => [q[0] + c[0] - o[0], q[1] + c[1] - o[1], q[2]]), ks = t.map(ck);
      if (ks.some(k => !inR.has(k) || cov.has(k))) continue;
      ks.forEach(k => cov.add(k)); cur.push(ks.sort());
      rec(i + 1);
      cur.pop(); ks.forEach(k => cov.delete(k));
      if (out.length > 2) return;
    }
  })(0);
  return out;
}

for (const line of fs.readFileSync(0, 'utf8').split('\n').filter(l => l.trim())) {
  const v = line.trim().split(/\s+/).map(Number), tile = [];
  for (let i = 0; i + 2 < v.length; i += 3) tile.push([v[i], v[i + 1], v[i + 2]]);
  const orient = G.buildOrients(tile);
  let layer = new Map([[G.keyOf(G.canon(tile)), G.canon(tile)]]);
  const res = {};
  for (let n = 2; n <= +nmax; n++) {
    const next = new Map();
    for (const cells of layer.values()) {
      const S = new Set(cells.map(ck)), border = new Set();
      cells.forEach(c => spec.adj[c[2]].forEach(d => {
        const k = ck([c[0] + d[0], c[1] + d[1], d[2]]);
        if (!S.has(k)) border.add(k);
      }));
      for (const bk of border) {
        const b = bk.split(',').map(Number);
        for (const O of orient) for (const o of O) {
          if (o[2] !== b[2]) continue;
          const add = O.map(q => [q[0] + b[0] - o[0], q[1] + b[1] - o[1], q[2]]);
          if (add.some(c => S.has(ck(c)))) continue;
          const cn = G.canon(cells.concat(add)), key = G.keyOf(cn);
          if (!next.has(key)) next.set(key, cn);
        }
      }
    }
    layer = next;
    res[n] = [...layer.entries()].filter(([, c]) => {
      const t = tilings(orient, c);
      return t.length === 2 && !t[0].some(x => t[1].includes(x));
    }).map(([k]) => k).sort();
  }
  console.log(JSON.stringify({ tile: line.trim(), byN: res }));
}
