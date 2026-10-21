// The Frame Finder search (FrameFinder.html, "same algorithm as frames.c") made grid-generic and
// nothing else: the debt search, its pruning, the tiling counter and the deduplication are the
// original's line for line. Only the triangle-specific pieces are replaced by a grid from
// grids.json: cells are [n1, n2, t] (lattice point and cell type), symmetries and neighbours come
// from the spec, and the up/down balance rule becomes the type-count rule it is a case of.
// This is the BASELINE the optimized frames.cpp is measured against on every grid.
//
// Usage: node baseline.js <grid> <N> [noreflect] < shapes   (one "n1 n2 t n1 n2 t ..." line per tile)
// Output: one line per tile: JSON {tile, frames: [canonical keys], nodes, closed, secs}.
'use strict';
const fs = require('fs');
const path = require('path');

function makeGrid(spec, reflections) {
  const T = spec.T, syms = spec.syms.filter(s => reflections || !s.refl);
  function symc(s, c) {
    const S = syms[s], m = S.img[c[2]];
    return [S.A[0][0] * c[0] + S.A[0][1] * c[1] + m[0], S.A[1][0] * c[0] + S.A[1][1] * c[1] + m[1], m[2]];
  }
  function cmp(a, b) { return a[1] - b[1] || a[0] - b[0] || a[2] - b[2]; }
  function cmpList(a, b) {
    for (let i = 0; i < a.length; i++) { const d = cmp(a[i], b[i]); if (d) return d; }
    return 0;
  }
  function normalize(cells) {
    let mx = Infinity, my = Infinity;
    cells.forEach(c => { if (c[0] < mx) mx = c[0]; if (c[1] < my) my = c[1]; });
    return cells.map(c => [c[0] - mx, c[1] - my, c[2]]).sort(cmp);
  }
  function canon(cells) {
    let best = null;
    for (let s = 0; s < syms.length; s++) {
      const t = normalize(cells.map(c => symc(s, c)));
      if (!best || cmpList(t, best) < 0) best = t;
    }
    return best;
  }
  function keyOf(cells) { return cells.map(c => c.join(',')).join(' '); }
  function buildOrients(tile) {
    const base = normalize(tile), out = [], keys = {};
    for (let s = 0; s < syms.length; s++) {
      const t = normalize(base.map(c => symc(s, c))), k = keyOf(t);
      if (!keys[k]) { keys[k] = 1; out.push(t); }
    }
    return out;
  }

  /* exact tiling counter: the original's, with T cell types per lattice point */
  function countTilings(orient, cells, limit) {
    const K = orient[0].length, n = cells.length, res = { count: 0 };
    if (!n || n % K) return res;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    cells.forEach(c => {
      if (c[0] < minx) minx = c[0]; if (c[1] < miny) miny = c[1];
      if (c[0] > maxx) maxx = c[0]; if (c[1] > maxy) maxy = c[1];
    });
    const mg = 2, ox = mg - minx, oy = mg - miny, w = maxx - minx + 1 + 2 * mg, h = maxy - miny + 1 + 2 * mg;
    const inR = new Uint8Array(w * h * T), cv = new Uint8Array(w * h * T);
    const order = cells.slice().sort(cmp);
    const oidx = order.map(c => ((c[1] + oy) * w + c[0] + ox) * T + c[2]);
    oidx.forEach(i => { inR[i] = 1; });
    const NOR = orient.length;
    function rec(pos) {
      while (pos < n && cv[oidx[pos]]) pos++;
      if (pos === n) { res.count++; return; }
      const c = order[pos];
      for (let r = 0; r < NOR; r++) {
        const O = orient[r];
        for (let i = 0; i < K; i++) {
          if (O[i][2] !== c[2]) continue;
          const tx = c[0] - O[i][0], ty = c[1] - O[i][1];
          let ok = true, j;
          for (j = 0; j < K; j++) {
            const x = O[j][0] + tx + ox, y = O[j][1] + ty + oy;
            if (x < 0 || y < 0 || x >= w || y >= h) { ok = false; break; }
            const id = (y * w + x) * T + O[j][2];
            if (!inR[id] || cv[id]) { ok = false; break; }
          }
          if (!ok) continue;
          for (j = 0; j < K; j++) cv[((O[j][1] + ty + oy) * w + O[j][0] + tx + ox) * T + O[j][2]] = 1;
          rec(pos + 1);
          for (j = 0; j < K; j++) cv[((O[j][1] + ty + oy) * w + O[j][0] + tx + ox) * T + O[j][2]] = 0;
          if (res.count >= limit) return;
        }
      }
    }
    rec(0);
    return res;
  }

  /* The balance rule, generalized: orientations are grouped by their type-count vector. When the
     distinct vectors are affinely independent, the region fixes how many tiles of each group a
     tiling uses, so both tilings use the same numbers (on the triangle grid: up-heavy and
     down-heavy tiles, the original rule). Otherwise the rule is off. */
  function balanceClasses(orient) {
    const vecs = [], cls = orient.map(O => {
      const v = new Array(T).fill(0); O.forEach(c => v[c[2]]++);
      const k = v.join(',');
      let i = vecs.findIndex(u => u.join(',') === k);
      if (i < 0) { i = vecs.length; vecs.push(v); }
      return i;
    });
    if (vecs.length < 2) return null;
    const rows = vecs.slice(1).map(v => v.map((x, j) => x - vecs[0][j]));
    let rank = 0;
    for (let col = 0; col < T && rank < rows.length; col++) {
      const p = rows.findIndex((r, i) => i >= rank && r[col] !== 0);
      if (p < 0) continue;
      [rows[rank], rows[p]] = [rows[p], rows[rank]];
      for (let i = 0; i < rows.length; i++) if (i !== rank && rows[i][col]) {
        const f = rows[i][col], g = rows[rank][col];
        rows[i] = rows[i].map((x, j) => x * g - rows[rank][j] * f);
      }
      rank++;
    }
    return rank === rows.length ? { cls, n: vecs.length } : null;
  }

  /* the debt-driven search: the original's Searcher with T types per lattice point */
  function Searcher(tile, N) {
    const orient = buildOrients(tile), NOR = orient.length, K = orient[0].length;
    const W = 4 * N * K + 4 * K + 8, G = W * W * T;
    const D = orient.map(O => Int32Array.from(O.map(c => (c[1] * W + c[0]) * T + c[2])));
    let riR = [], riD = [];
    for (let t = 0; t < T; t++) { riR.push([]); riD.push([]); }
    for (let r = 0; r < NOR; r++) for (let j = 0; j < K; j++) { riR[orient[r][j][2]].push(r); riD[orient[r][j][2]].push(D[r][j]); }
    riR = riR.map(a => Int32Array.from(a));
    riD = riD.map(a => Int32Array.from(a));
    const cov = [new Uint8Array(G), new Uint8Array(G)];
    const used = [new Uint8Array(NOR * G), new Uint8Array(NOR * G)];
    const plR = [new Int32Array(N + 2), new Int32Array(N + 2)], plB = [new Int32Array(N + 2), new Int32Array(N + 2)];
    const np = [0, 0], owe = [0, 0];
    const bal = balanceClasses(orient), NC = bal ? bal.n : 0;
    const cls = [new Int32Array(NC), new Int32Array(NC)];
    let anchor = 0;
    const maxC = NOR * K, depthMax = 2 * N + 2, candR = [], candB = [];
    for (let d = 0; d <= depthMax; d++) { candR.push(new Int32Array(maxC)); candB.push(new Int32Array(maxC)); }
    const seen = new Set(), frames = [];
    let nodes = 0, closed = 0, depth = 0;
    const centre = (W >> 1) * W * T + (W >> 1) * T;
    function placeStart(r) { anchor = centre + orient[r][0][2]; place(0, r, anchor - D[r][0]); }
    function removeStart() { unplace(0); anchor = 0; }
    function place(t, r, b) {
      const me = cov[t], ot = cov[1 - t], Dr = D[r];
      for (let j = 0; j < K; j++) { const c = b + Dr[j]; me[c] = 1; if (ot[c]) owe[t]--; else owe[1 - t]++; }
      used[t][r * G + b] = 1;
      if (bal) cls[t][bal.cls[r]]++;
      plR[t][np[t]] = r; plB[t][np[t]] = b; np[t]++;
    }
    function unplace(t) {
      const k = --np[t], r = plR[t][k], b = plB[t][k], me = cov[t], ot = cov[1 - t], Dr = D[r];
      for (let j = 0; j < K; j++) { const c = b + Dr[j]; me[c] = 0; if (ot[c]) owe[t]++; else owe[1 - t]--; }
      used[t][r * G + b] = 0;
      if (bal) cls[t][bal.cls[r]]--;
    }
    function cands(t, c, outR, outB, cap) {
      const o = c % T, R = riR[o], DD = riD[o], L = R.length, ct = cov[t], uo = used[1 - t];
      let n = 0;
      for (let e = 0; e < L; e++) {
        const r = R[e], b = c - DD[e];
        if (b + D[r][0] < anchor) continue;
        if (uo[r * G + b]) continue;
        const Dr = D[r];
        let j = 0;
        for (; j < K; j++) if (ct[b + Dr[j]]) break;
        if (j < K) continue;
        if (outR) { outR[n] = r; outB[n] = b; }
        if (++n >= cap) return n;
      }
      return n;
    }
    function cellOf(idx) { const t = idx % T, xy = (idx - t) / T; return [xy % W, Math.floor(xy / W), t]; }
    function recordRegion() {
      closed++;
      const cells = [];
      for (let i = 0; i < np[0]; i++) for (let j = 0; j < K; j++) cells.push(cellOf(plB[0][i] + D[plR[0][i]][j]));
      const cn = canon(cells), key = keyOf(cn);
      if (seen.has(key)) return;
      seen.add(key);
      if (countTilings(orient, cn, 3).count === 2) frames.push(key);
    }
    function balanced() {
      let s = 0;
      for (let i = 0; i < NC; i++) s += Math.max(cls[0][i], cls[1][i]);
      return s <= N;
    }
    function search() {
      nodes++;
      if (owe[0] === 0 && owe[1] === 0) { recordRegion(); return; }
      if (np[0] + Math.ceil(owe[0] / K) > N || np[1] + Math.ceil(owe[1] / K) > N) return;
      let best = 1 << 30, bt = -1, bc = 0, k;
      for (let t = 0; t < 2; t++) {
        const other = cov[1 - t];
        for (let i = 0; i < np[t]; i++) {
          const b = plB[t][i], Dr = D[plR[t][i]];
          for (let j = 0; j < K; j++) {
            const c = b + Dr[j];
            if (other[c]) continue;
            k = cands(1 - t, c, null, null, best);
            if (k < best) { best = k; bt = 1 - t; bc = c; if (!best) return; }
          }
        }
      }
      if (bt < 0) return;
      const CR = candR[depth], CB = candB[depth];
      k = cands(bt, bc, CR, CB, 1 << 30);
      for (let i = 0; i < k; i++) {
        place(bt, CR[i], CB[i]);
        if (bal && !balanced()) { unplace(bt); continue; }
        if (np[bt] + Math.ceil(owe[bt] / K) <= N && np[1 - bt] + Math.ceil(owe[1 - bt] / K) <= N) {
          depth++; search(); depth--;
        }
        unplace(bt);
      }
    }
    for (let r = 0; r < NOR; r++) { placeStart(r); search(); removeStart(); }
    return { frames, nodes, closed };
  }
  return { Searcher, canon, keyOf, countTilings, buildOrients };
}

module.exports = makeGrid;

if (require.main === module) {
  const [grid, N, flag] = process.argv.slice(2);
  const spec = JSON.parse(fs.readFileSync(path.join(__dirname, 'grids.json'), 'utf8'))[grid];
  const G = makeGrid(spec, flag !== 'noreflect');
  const lines = fs.readFileSync(0, 'utf8').split('\n').filter(l => l.trim());
  for (const line of lines) {
    const v = line.trim().split(/\s+/).map(Number), tile = [];
    for (let i = 0; i + 2 < v.length; i += 3) tile.push([v[i], v[i + 1], v[i + 2]]);
    const t0 = process.hrtime.bigint();
    const r = G.Searcher(tile, +N);
    const secs = Number(process.hrtime.bigint() - t0) / 1e9;
    console.log(JSON.stringify({ tile: line.trim(), frames: r.frames.sort(), nodes: r.nodes, closed: r.closed, secs }));
  }
}
