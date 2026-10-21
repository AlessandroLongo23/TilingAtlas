/* Frame search engine (same algorithm as frames.c).
   Cells are [x, y, o]; o = 0 up-pointing, 1 down-pointing triangle. */
var FrameEngine = (function () {
  'use strict';

  function symc(s, c) {
    var X = 3 * c[0] + 1 + c[2], Y = 3 * c[1] + 1 + c[2], t, r, nx, ny;
    if (s >= 6) { t = X; X = Y; Y = t; }
    for (r = 0; r < s % 6; r++) { nx = -Y; ny = X + Y; X = nx; Y = ny; }
    return (((X % 3) + 3) % 3) === 1 ? [(X - 1) / 3, (Y - 1) / 3, 0] : [(X - 2) / 3, (Y - 2) / 3, 1];
  }
  function cmp(a, b) { return a[1] - b[1] || a[0] - b[0] || a[2] - b[2]; }
  function cmpList(a, b) {
    for (var i = 0; i < a.length; i++) { var d = cmp(a[i], b[i]); if (d) return d; }
    return 0;
  }
  function normalize(cells) {
    var mx = Infinity, my = Infinity;
    cells.forEach(function (c) { if (c[0] < mx) mx = c[0]; if (c[1] < my) my = c[1]; });
    return cells.map(function (c) { return [c[0] - mx, c[1] - my, c[2]]; }).sort(cmp);
  }
  function canon(cells, nsym) {
    var best = null;
    for (var s = 0; s < nsym; s++) {
      var t = normalize(cells.map(function (c) { return symc(s, c); }));
      if (!best || cmpList(t, best) < 0) best = t;
    }
    return best;
  }
  function keyOf(cells) { return cells.map(function (c) { return c.join(','); }).join(' '); }
  function dedupe(cells) {
    var seen = {}, out = [];
    cells.forEach(function (c) { var k = c.join(','); if (!seen[k]) { seen[k] = 1; out.push([c[0], c[1], c[2]]); } });
    return out.sort(cmp);
  }

  function buildOrients(tile, nsym) {
    var base = normalize(dedupe(tile)), out = [], keys = {};
    for (var s = 0; s < nsym; s++) {
      var t = normalize(base.map(function (c) { return symc(s, c); })), k = keyOf(t);
      if (!keys[k]) { keys[k] = 1; out.push(t); }
    }
    return out;
  }

  /* neighbours of a triangle (through its three edges) */
  function neighbours(c) {
    var x = c[0], y = c[1];
    return c[2] === 0 ? [[x, y - 1, 1], [x, y, 1], [x - 1, y, 1]]   /* bottom, right, left */
                      : [[x, y, 0], [x, y + 1, 0], [x + 1, y, 0]];  /* lower-left, top, right */
  }
  function connected(cells) {
    if (!cells.length) return false;
    var set = {}, seen = {}, st = [cells[0]], n = 0;
    cells.forEach(function (c) { set[c.join(',')] = 1; });
    seen[cells[0].join(',')] = 1;
    while (st.length) {
      var c = st.pop(); n++;
      neighbours(c).forEach(function (d) { var k = d.join(','); if (set[k] && !seen[k]) { seen[k] = 1; st.push(d); } });
    }
    return n === cells.length;
  }

  /* ---------------- exact tiling counter */
  function countTilings(orient, cells, limit, keep) {
    var K = orient[0].length, n = cells.length, res = { count: 0, tilings: [] };
    keep = keep || 2;
    if (!n || n % K) return res;
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    cells.forEach(function (c) {
      if (c[0] < minx) minx = c[0]; if (c[1] < miny) miny = c[1];
      if (c[0] > maxx) maxx = c[0]; if (c[1] > maxy) maxy = c[1];
    });
    var mg = 2, ox = mg - minx, oy = mg - miny, w = maxx - minx + 1 + 2 * mg, h = maxy - miny + 1 + 2 * mg;
    var inR = new Uint8Array(w * h * 2), cv = new Uint8Array(w * h * 2);
    var order = cells.slice().sort(cmp);
    var oidx = order.map(function (c) { return ((c[1] + oy) * w + c[0] + ox) * 2 + c[2]; });
    oidx.forEach(function (i) { inR[i] = 1; });
    var NOR = orient.length, stack = [];
    function rec(pos) {
      while (pos < n && cv[oidx[pos]]) pos++;
      if (pos === n) {
        if (res.tilings.length < keep) res.tilings.push(stack.map(function (p) {
          return orient[p[0]].map(function (c) { return [c[0] + p[1], c[1] + p[2], c[2]]; });
        }));
        res.count++;
        return;
      }
      var c = order[pos];
      for (var r = 0; r < NOR; r++) {
        var O = orient[r];
        for (var i = 0; i < K; i++) {
          if (O[i][2] !== c[2]) continue;
          var tx = c[0] - O[i][0], ty = c[1] - O[i][1], ok = true, j, id, x, y;
          for (j = 0; j < K; j++) {
            x = O[j][0] + tx + ox; y = O[j][1] + ty + oy;
            if (x < 0 || y < 0 || x >= w || y >= h) { ok = false; break; }
            id = (y * w + x) * 2 + O[j][2];
            if (!inR[id] || cv[id]) { ok = false; break; }
          }
          if (!ok) continue;
          for (j = 0; j < K; j++) cv[((O[j][1] + ty + oy) * w + O[j][0] + tx + ox) * 2 + O[j][2]] = 1;
          stack.push([r, tx, ty]);
          rec(pos + 1);
          stack.pop();
          for (j = 0; j < K; j++) cv[((O[j][1] + ty + oy) * w + O[j][0] + tx + ox) * 2 + O[j][2]] = 0;
          if (res.count >= limit) return;
        }
      }
    }
    rec(0);
    return res;
  }

  /* ---------------- holes and overlap pieces (for display) */
  function holes(cells) {
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    cells.forEach(function (c) {
      if (c[0] < minx) minx = c[0]; if (c[1] < miny) miny = c[1];
      if (c[0] > maxx) maxx = c[0]; if (c[1] > maxy) maxy = c[1];
    });
    minx--; miny--; maxx++; maxy++;
    var w = maxx - minx + 1, h = maxy - miny + 1, m = new Uint8Array(w * h * 2), out = [];
    cells.forEach(function (c) { m[((c[1] - miny) * w + c[0] - minx) * 2 + c[2]] = 1; });
    for (var pass = 0; pass < 2; pass++) {
      for (var id = 0; id < w * h * 2; id++) {
        if (m[id] || (pass === 0 && id !== 0)) continue;
        var st = [id], area = 0; m[id] = 2;
        while (st.length) {
          var cur = st.pop(), o = cur & 1, xy = cur >> 1, x = xy % w, y = (xy / w) | 0;
          area++;
          var nb = o === 0 ? [[x, y], [x - 1, y], [x, y - 1]] : [[x, y], [x + 1, y], [x, y + 1]];
          for (var k = 0; k < 3; k++) {
            var nx = nb[k][0], ny = nb[k][1];
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            var nid = (ny * w + nx) * 2 + (1 - o);
            if (!m[nid]) { m[nid] = 2; st.push(nid); }
          }
        }
        if (pass === 1) out.push(area);
      }
    }
    return out;
  }
  function pieces(t1, t2) {
    var hist = {};
    t1.forEach(function (a) {
      var s = {}; a.forEach(function (c) { s[c.join(',')] = 1; });
      t2.forEach(function (b) {
        var k = 0; b.forEach(function (c) { if (s[c.join(',')]) k++; });
        if (k) hist[k] = (hist[k] || 0) + 1;
      });
    });
    return hist;
  }
  function sharedTiles(t1, t2) {
    var keys = {}, n = 0;
    t1.forEach(function (t) { keys[keyOf(t.slice().sort(cmp))] = 1; });
    t2.forEach(function (t) { if (keys[keyOf(t.slice().sort(cmp))]) n++; });
    return n;
  }

  /* ---------------- the debt-driven search */
  function Searcher(tile, N, reflections) {
    var nsym = reflections ? 12 : 6;
    var orient = buildOrients(tile, nsym), NOR = orient.length, K = orient[0].length;
    var W = 4 * N * K + 4 * K + 8, G = W * W * 2;
    var D = orient.map(function (O) { return Int32Array.from(O.map(function (c) { return (c[1] * W + c[0]) * 2 + c[2]; })); });
    var riR = [[], []], riD = [[], []];
    for (var r = 0; r < NOR; r++) for (var j = 0; j < K; j++) { riR[orient[r][j][2]].push(r); riD[orient[r][j][2]].push(D[r][j]); }
    riR = riR.map(function (a) { return Int32Array.from(a); });
    riD = riD.map(function (a) { return Int32Array.from(a); });
    var cov = [new Uint8Array(G), new Uint8Array(G)];
    var used = [new Uint8Array(NOR * G), new Uint8Array(NOR * G)];
    var plR = [new Int32Array(N + 2), new Int32Array(N + 2)], plB = [new Int32Array(N + 2), new Int32Array(N + 2)];
    var np = [0, 0], owe = [0, 0];
    /* balance: +1 / -1 for orientations with more up / more down triangles */
    var sgn = orient.map(function (O) { var u = 0; O.forEach(function (c) { u += c[2] ? -1 : 1; }); return u > 0 ? 1 : u < 0 ? -1 : 0; });
    var cls = [[0, 0], [0, 0]];
    /* anchor: the start tile covers the frame's lowest triangle; nothing may go below it */
    var anchor = 0;
    var maxC = NOR * K, depthMax = 2 * N + 2;
    var candR = [], candB = [];
    for (var d = 0; d <= depthMax; d++) { candR.push(new Int32Array(maxC)); candB.push(new Int32Array(maxC)); }
    var self = this;
    var seen = new Set();
    this.nodes = 0; this.balanced = 0; this.frames = [];
    this.orient = orient; this.K = K; this.N = N; this.nsym = nsym;
    var collectDepth = 0, depth = 0, path = [], tasks = null, startR = 0;
    var centre = (W >> 1) * W * 2 + (W >> 1) * 2;     /* grid index of the anchor triangle (up) */
    function placeStart(r) { anchor = centre + orient[r][0][2]; place(0, r, anchor - D[r][0]); }
    function removeStart() { unplace(0); anchor = 0; }

    function place(t, r, b) {
      var me = cov[t], ot = cov[1 - t], Dr = D[r];
      for (var j = 0; j < K; j++) {
        var c = b + Dr[j];
        me[c] = 1;
        if (ot[c]) owe[t]--; else owe[1 - t]++;
      }
      used[t][r * G + b] = 1;
      if (sgn[r] > 0) cls[t][0]++; else if (sgn[r] < 0) cls[t][1]++;
      plR[t][np[t]] = r; plB[t][np[t]] = b; np[t]++;
    }
    function unplace(t) {
      var k = --np[t], r = plR[t][k], b = plB[t][k], me = cov[t], ot = cov[1 - t], Dr = D[r];
      for (var j = 0; j < K; j++) {
        var c = b + Dr[j];
        me[c] = 0;
        if (ot[c]) owe[t]++; else owe[1 - t]--;
      }
      used[t][r * G + b] = 0;
      if (sgn[r] > 0) cls[t][0]--; else if (sgn[r] < 0) cls[t][1]--;
    }
    /* legal tiles of tiling t covering grid cell c */
    function cands(t, c, outR, outB, cap) {
      var o = c & 1, R = riR[o], DD = riD[o], L = R.length, ct = cov[t], uo = used[1 - t], n = 0;
      for (var e = 0; e < L; e++) {
        var r = R[e], b = c - DD[e];
        if (b + D[r][0] < anchor) continue;
        if (uo[r * G + b]) continue;
        var Dr = D[r], j = 0;
        for (; j < K; j++) if (ct[b + Dr[j]]) break;
        if (j < K) continue;
        if (outR) { outR[n] = r; outB[n] = b; }
        if (++n >= cap) return n;
      }
      return n;
    }
    function cellOf(idx) { var o = idx & 1, xy = idx >> 1; return [xy % W, (xy / W) | 0, o]; }
    function recordRegion() {
      self.balanced++;
      var cells = [];
      for (var i = 0; i < np[0]; i++) for (var j = 0; j < K; j++) cells.push(cellOf(plB[0][i] + D[plR[0][i]][j]));
      var cn = canon(cells, nsym), key = keyOf(cn);
      if (seen.has(key)) return;
      seen.add(key);
      var res = countTilings(orient, cn, 3);
      if (res.count === 2) self.frames.push({ key: key, cells: cn, tiling1: res.tilings[0], tiling2: res.tilings[1] });
    }
    function search() {
      self.nodes++;
      if (owe[0] === 0 && owe[1] === 0) { recordRegion(); return; }
      if (np[0] + Math.ceil(owe[0] / K) > N || np[1] + Math.ceil(owe[1] / K) > N) return;
      if (collectDepth && depth === collectDepth) { tasks.push({ r: startR, steps: path.slice(0, depth) }); return; }
      var best = 1 << 30, bt = -1, bc = 0, t, i, j, k;
      for (t = 0; t < 2; t++) {
        var other = cov[1 - t];
        for (i = 0; i < np[t]; i++) {
          var b = plB[t][i], Dr = D[plR[t][i]];
          for (j = 0; j < K; j++) {
            var c = b + Dr[j];
            if (other[c]) continue;
            k = cands(1 - t, c, null, null, best);
            if (k < best) { best = k; bt = 1 - t; bc = c; if (!best) return; }
          }
        }
      }
      if (bt < 0) return;
      var CR = candR[depth], CB = candB[depth];
      k = cands(bt, bc, CR, CB, 1 << 30);
      for (i = 0; i < k; i++) {
        place(bt, CR[i], CB[i]);
        if (Math.max(cls[0][0], cls[1][0]) + Math.max(cls[0][1], cls[1][1]) > N) { unplace(bt); continue; }
        if (np[bt] + Math.ceil(owe[bt] / K) <= N && np[1 - bt] + Math.ceil(owe[1 - bt] / K) <= N) {
          if (collectDepth) path[depth] = [bt, CR[i], CB[i]];
          depth++;
          search();
          depth--;
        }
        unplace(bt);
      }
    }

    /* split the search into independent branches */
    this.split = function (d) {
      collectDepth = d; depth = 0; tasks = [];
      for (startR = 0; startR < NOR; startR++) { placeStart(startR); search(); removeStart(); }
      collectDepth = 0;
      return tasks;
    };
    /* run one branch; returns frames found in it */
    this.runTask = function (task) {
      var before = self.frames.length, i, steps = task.steps;
      placeStart(task.r);
      for (i = 0; i < steps.length; i++) place(steps[i][0], steps[i][1], steps[i][2]);
      depth = steps.length;
      search();
      self.nodes--;
      for (i = steps.length - 1; i >= 0; i--) unplace(steps[i][0]);
      removeStart();
      depth = 0;
      return self.frames.slice(before);
    };
    /* whole search in one go */
    this.runAll = function () {
      depth = 0;
      for (var r = 0; r < NOR; r++) { placeStart(r); search(); removeStart(); }
      return self.frames;
    };
  }

  function sortFrames(frames) {
    return frames.sort(function (a, b) {
      return a.cells.length - b.cells.length || a.holes.length - b.holes.length || cmpList(a.cells, b.cells);
    });
  }
  function decorate(f) {
    if (!f.holes) f.holes = holes(f.cells);
    if (!f.pieces) f.pieces = pieces(f.tiling1, f.tiling2);
    f.tiles = f.tiling1.length; f.area = f.cells.length;
    return f;
  }

  /* ---------------- lenient reader for designer files (JSON or text) */
  function parseInput(text) {
    var out = { tile: [], region: [], maxTiles: null, reflections: null, name: null, results: null };
    try {
      var j = JSON.parse(text);
      if (j && j.frames && j.tile) { out.results = j; }
    } catch (e) { }
    var re = /"([^"]*)"|([A-Za-z0-9_+\-]+)/g, m, mode = 0, num = [], pending = 0;
    function lower(s) { return s.toLowerCase(); }
    while ((m = re.exec(text))) {
      var quoted = m[1] !== undefined, tok = quoted ? m[1] : m[2], L = lower(tok);
      if (pending === 3) { out.name = tok; pending = 0; continue; }
      if (pending === 1) { if (/^[+-]?\d+$/.test(tok)) { out.maxTiles = parseInt(tok, 10); pending = 0; continue; } pending = 0; }
      if (pending === 2) { out.reflections = !(L === 'false' || L === 'no' || L === '0'); pending = 0; continue; }
      if (L === 'tile' || L === 'piece' || L === 'polyiamond') { mode = 1; num = []; continue; }
      if (L === 'region' || L === 'frame' || L === 'cells' || L === 'shape' || L === 'triangles') { mode = 2; num = []; continue; }
      if (L === 'maxtiles' || L === 'max' || L === 'max_tiles') { pending = 1; mode = 0; continue; }
      if (L === 'reflections' || L === 'reflect' || L === 'mirror') { pending = 2; mode = 0; continue; }
      if (L === 'onesided' || L === 'one-sided') { out.reflections = false; continue; }
      if (L === 'tilename' || L === 'name') { pending = 3; continue; }
      if (L === 'x' || L === 'y' || L === 'o' || L === 'dir' || L === 'orient' || L === 'orientation') continue;
      if (L === 'frames' || L === 'tiling1' || L === 'tiling2' || L === 'format') { mode = 0; continue; }
      if (!mode) continue;
      if (num.length < 2) {
        if (!/^[+-]?\d+$/.test(tok)) { mode = 0; num = []; continue; }
        num.push(parseInt(tok, 10)); continue;
      }
      var o = (L === '0' || L === 'u' || L === 'up') ? 0 : (L === '1' || L === 'd' || L === 'down' || L === 'dn') ? 1 : -1;
      if (o < 0) { mode = 0; num = []; continue; }
      (mode === 1 ? out.tile : out.region).push([num[0], num[1], o]);
      num = [];
    }
    out.tile = dedupe(out.tile); out.region = dedupe(out.region);
    return out;
  }


  /* ---------------- "o" text format (same as Polyad Finder / Octiamond Tiler)
     'o' is a triangle, '.' or space is empty; triangles point up where
     row + column is odd.  Row r, column c  <->  cell (x, y, o):
       y = -(r+1);  up: x = (c+r+1)/2, o = 0;  down: x = (c+r)/2, o = 1   */
  function oToCell(r, c) {
    return (((r + c) % 2) + 2) % 2 === 1 ? [(c + r + 1) / 2, -(r + 1), 0] : [(c + r) / 2, -(r + 1), 1];
  }
  function cellToO(cell) {
    var r = -cell[1] - 1;
    return [r, cell[2] === 0 ? 2 * cell[0] - r - 1 : 2 * cell[0] - r];
  }
  function readO(text) {
    var shapes = [], name = null, rows = [];
    function flush() {
      var cells = [];
      rows.forEach(function (row, r) { for (var c = 0; c < row.length; c++) if (row[c] === 'o' || row[c] === 'O') cells.push(oToCell(r, c)); });
      if (cells.length) shapes.push({ name: name || ('Shape ' + (shapes.length + 1)), cells: cells });
    }
    String(text).replace(/\r/g, '').split('\n').forEach(function (ln) {
      var s = ln.trim();
      if (s.charAt(0) === '#') { flush(); name = s; rows = []; }
      else if (s === '') { if (rows.length) { flush(); name = null; rows = []; } }
      else rows.push(ln);
    });
    flush();
    return shapes;
  }
  function toO(cells) {
    if (!cells.length) return '';
    var rc = cells.map(cellToO);
    var mr = Math.min.apply(null, rc.map(function (p) { return p[0]; })), mc = Math.min.apply(null, rc.map(function (p) { return p[1]; }));
    var dr = -mr, dc = -mc;
    if ((((dr + dc) % 2) + 2) % 2) dc += 1;
    var rows = [];
    rc.forEach(function (p) { var r = p[0] + dr; (rows[r] = rows[r] || []).push(p[1] + dc); });
    var out = [];
    for (var r = 0; r < rows.length; r++) {
      var cs = rows[r] || [], m = cs.length ? Math.max.apply(null, cs) : -1, line = '';
      for (var c = 0; c <= m; c++) line += cs.indexOf(c) >= 0 ? 'o' : '.';
      out.push(line);
    }
    return out.join('\n');
  }
  /* does this text look like the o format (rather than JSON / coordinate lists)? */
  function looksLikeO(text) {
    var t = String(text);
    if (/[\[{]/.test(t)) return false;
    var lines = t.replace(/\r/g, '').split('\n').filter(function (l) { var s = l.trim(); return s && s.charAt(0) !== '#'; });
    return lines.length > 0 && lines.every(function (l) { return /^[ .oO]+$/.test(l); }) && /o/i.test(t);
  }

  /* ---------------- infinite series
     A frame F is cut by a lattice direction v into three parts along f, the
     projection onto v:  L (f < c-P), the slab M (c-P <= f < c) and R (f >= c),
     where P = f(v) is the slab width.  Member k of the series is
         F_k = L + M + (M+v) + ... + (M+kv) + (R+kv),
     so F_0 = F and each step adds one more copy of the slab.
     Proof that every member is a frame: process each F_k slab by slab.  A tile
     belongs to the slab holding its lowest-f triangle; the state after a slab is
     the set of later triangles already covered.  Away from the ends every slab
     looks the same, so the count of tilings is  c_k = h T^m t  (m = k-q+1) for one
     fixed transfer matrix T on r live states.  Then c_k - 2 obeys a linear
     recurrence of order at most r+1, so if it is 0 for m = 1..r+1 it is 0 for every
     m.  The same is done for ordered pairs of tilings with no tile in common, so
     every member has exactly two tilings and they share no tile.  The first few
     members (k < q) are checked directly. */
  var SERIES_DIRS = [[1, 0, 4], [0, 1, 4], [-1, 1, 4], [1, 1, 2], [-1, 2, 2], [2, -1, 2]]; /* direction, largest multiple */
  function cellKey(c) { return c[0] + ',' + c[1] + ',' + c[2]; }
  function keyCell(k) { var p = k.split(','); return [+p[0], +p[1], +p[2]]; }
  function fval(c, a, b) { var X = 3 * c[0] + 1 + c[2], Y = 3 * c[1] + 1 + c[2]; return 2 * X * a + 2 * Y * b + X * b + Y * a; }

  function Stretch(F, a, b, c) {
    var P = 6 * (a * a + a * b + b * b), L = [], M = [], R = [];
    F.forEach(function (x) { var v = fval(x, a, b); (v < c - P ? L : v < c ? M : R).push(x); });
    this.a = a; this.b = b; this.c = c; this.P = P; this.L = L; this.M = M; this.R = R;
  }
  Stretch.prototype.member = function (k) {
    var a = this.a, b = this.b, out = this.L.slice();
    if (k < 0) { this.R.forEach(function (x) { out.push([x[0] - a, x[1] - b, x[2]]); }); return out; }
    for (var j = 0; j <= k; j++) this.M.forEach(function (x) { out.push([x[0] + j * a, x[1] + j * b, x[2]]); });
    this.R.forEach(function (x) { out.push([x[0] + k * a, x[1] + k * b, x[2]]); });
    return out;
  };

  function frameCheck(orient, cells) {
    if (!cells.length || cells.length % orient[0].length) return null;
    var r = countTilings(orient, cells, 3, 2);
    if (r.count !== 2 || sharedTiles(r.tilings[0], r.tilings[1])) return null;
    return r;
  }

  /* transfer-matrix proof for one stretch; returns null (fails) or proof details */
  function proveStretch(orient, st, cap) {
    var a = st.a, b = st.b, P = st.P, c0 = st.c - P, K = orient[0].length;
    cap = cap || 3000;
    function slab(cl) { return Math.floor((fval(cl, a, b) - c0) / P); }
    var E = 0;
    orient.forEach(function (O) {
      var mn = Infinity, mx = -Infinity;
      O.forEach(function (cl) { var v = fval(cl, a, b); if (v < mn) mn = v; if (v > mx) mx = v; });
      if (mx - mn > E) E = mx - mn;
    });
    var q = Math.max(1, Math.floor((P - 1 + E) / P));
    var cells = st.member(q), reg = {}, bySlab = {}, minS = Infinity, maxS = -Infinity;
    cells.forEach(function (cl) {
      var k = cellKey(cl), s = slab(cl);
      reg[k] = s; (bySlab[s] = bySlab[s] || []).push(cl);
      if (s < minS) minS = s; if (s > maxS) maxS = s;
    });
    Object.keys(bySlab).forEach(function (s) { bySlab[s].sort(cmp); });
    var NOR = orient.length, aborted = false;

    /* every way to fill the uncovered triangles of slab j with tiles that belong to slab j */
    var fillMemo = {};
    function fill(j, covKeys) {
      var mk = j + '#' + covKeys.join(';');
      if (fillMemo[mk]) return fillMemo[mk];
      var list = bySlab[j] || [], used = new Set(covKeys), out = [], add = [], ids = [];
      function rec(i) {
        if (aborted) return;
        while (i < list.length && used.has(cellKey(list[i]))) i++;
        if (i === list.length) { out.push({ add: add.slice(), ids: ids.slice() }); if (out.length > 20000) aborted = true; return; }
        var cl = list[i];
        for (var r = 0; r < NOR; r++) {
          var O = orient[r];
          for (var ii = 0; ii < K; ii++) {
            if (O[ii][2] !== cl[2]) continue;
            var tx = cl[0] - O[ii][0], ty = cl[1] - O[ii][1], ks = [], ok = true;
            for (var jj = 0; jj < K; jj++) {
              var kk = (O[jj][0] + tx) + ',' + (O[jj][1] + ty) + ',' + O[jj][2], s = reg[kk];
              if (s === undefined || s < j || used.has(kk)) { ok = false; break; }
              ks.push(kk);
            }
            if (!ok) continue;
            ks.forEach(function (kk) { used.add(kk); });
            add.push.apply(add, ks); ids.push(r + ':' + tx + ',' + ty);
            rec(i + 1);
            ids.pop(); add.length -= K;
            ks.forEach(function (kk) { used.delete(kk); });
          }
        }
      }
      rec(0);
      fillMemo[mk] = out;
      return out;
    }
    function shiftKeys(keys, d) {
      return keys.map(function (k) { var c = keyCell(k); return (c[0] + d * a) + ',' + (c[1] + d * b) + ',' + c[2]; }).sort();
    }
    /* one slab step for every state of a map; lanes = 1 (tilings) or 2 (pairs with no common tile) */
    function advance(j, map, lanes, shift) {
      var out = {};
      Object.keys(map).forEach(function (sk) {
        var n = map[sk], parts = sk.split('|').map(function (p) { return p ? p.split(';') : []; });
        var fl = parts.map(function (p) { return fill(j, p); });
        function next(p, f) {
          var ks = p.concat(f.add).filter(function (k) { return reg[k] > j; });
          return shift ? shiftKeys(ks, -1).join(';') : ks.sort().join(';');
        }
        if (lanes === 1) fl[0].forEach(function (f) { var k = next(parts[0], f); out[k] = (out[k] || 0) + n; });
        else fl[0].forEach(function (f0) {
          var ids = {}; f0.ids.forEach(function (x) { ids[x] = 1; });
          var k0 = next(parts[0], f0);
          fl[1].forEach(function (f1) {
            for (var i = 0; i < f1.ids.length; i++) if (ids[f1.ids[i]]) return;
            var k = k0 + '|' + next(parts[1], f1);
            out[k] = (out[k] || 0) + n;
          });
        });
      });
      return out;
    }
    function proveLanes(lanes) {
      var empty = lanes === 1 ? '' : '|';
      var head = {}; head[empty] = 1;
      for (var j = minS; j < 0; j++) head = advance(j, head, lanes, false);
      if (aborted) return null;
      /* reachable states and the transfer matrix */
      var T = {}, order = Object.keys(head), seen = {};
      order.forEach(function (s) { seen[s] = 1; });
      for (var i = 0; i < order.length; i++) {
        var one = {}; one[order[i]] = 1;
        T[order[i]] = advance(0, one, lanes, true);
        if (aborted) return null;
        Object.keys(T[order[i]]).forEach(function (s) { if (!seen[s]) { seen[s] = 1; order.push(s); } });
        if (order.length > cap) return null;
      }
      /* completions from slab 1 onward */
      var tail = {};
      order.forEach(function (s) {
        var map = {};
        map[s.split('|').map(function (p) { return p ? shiftKeys(p.split(';'), 1).join(';') : ''; }).join('|')] = 1;
        for (var j = 1; j <= maxS; j++) map = advance(j, map, lanes, false);
        tail[s] = map[empty] || 0;
      });
      if (aborted) return null;
      /* keep states that can still reach a completion */
      var live = {}, rev = {}, stack = [];
      order.forEach(function (s) { Object.keys(T[s]).forEach(function (t) { (rev[t] = rev[t] || []).push(s); }); });
      order.forEach(function (s) { if (tail[s]) { live[s] = 1; stack.push(s); } });
      while (stack.length) { var s = stack.pop(); (rev[s] || []).forEach(function (p) { if (!live[p]) { live[p] = 1; stack.push(p); } }); }
      var r = Object.keys(live).length, x = {};
      Object.keys(head).forEach(function (s) { if (live[s]) x[s] = head[s]; });
      for (var m = 1; m <= r + 1; m++) {
        var y = {};
        Object.keys(x).forEach(function (s) {
          var row = T[s], n = x[s];
          Object.keys(row).forEach(function (t) { if (live[t]) y[t] = (y[t] || 0) + n * row[t]; });
        });
        x = y;
        var tot = 0;
        Object.keys(x).forEach(function (s) { tot += x[s] * tail[s]; if (x[s] > 1e15) tot = NaN; });
        if (tot !== 2) return null;
      }
      return { states: r, steps: r + 1 };
    }
    /* members below q are checked one by one */
    for (var k = 1; k < q; k++) if (!frameCheck(orient, st.member(k))) return null;
    var one = proveLanes(1); if (!one) return null;
    var two = proveLanes(2); if (!two) return null;
    return { q: q, states: one.states, pairStates: two.states, steps: Math.max(one.steps, two.steps) };
  }

  /* frames: [{key, cells}], all with the same tile.  Returns the proven series. */
  function findSeries(frames, tile, reflections, maxTiles, progress) {
    var nsym = reflections ? 12 : 6, orient = buildOrients(tile, nsym), K = orient[0].length;
    var byKey = {}; frames.forEach(function (f, i) { byKey[f.key] = i; });
    var out = [], tried = 0, total = 0, lastP = 0;
    var maxMult = 0; SERIES_DIRS.forEach(function (d) { maxMult = Math.max(maxMult, d[2]); });
    total = frames.length * maxMult;
    function keyFor(cells) { return keyOf(canon(cells, nsym)); }
    function sameFamily(memKeys) {
      for (var i = 0; i < out.length; i++) {
        var hit = 0;
        for (var j = 0; j < memKeys.length; j++) if (out[i].memberKeySet[memKeys[j]]) hit++;
        if (hit >= 2) return true;
      }
      return false;
    }
    for (var mult = 1; mult <= maxMult; mult++) {
      for (var fi = 0; fi < frames.length; fi++) {
        tried++;
        if (progress && (tried - lastP > 20 || tried === total)) { lastP = tried; progress(tried, total, out.length); }
        var F = frames[fi].cells;
        for (var di = 0; di < SERIES_DIRS.length; di++) {
          var dd = SERIES_DIRS[di];
          if (mult > dd[2]) continue;
          var a = dd[0] * mult, b = dd[1] * mult, P = 6 * (a * a + a * b + b * b);
          var cuts = {}, fvals = F.map(function (x) { return fval(x, a, b); });
          fvals.forEach(function (v) { cuts[v + 1] = 1; cuts[v + P + 1] = 1; });
          var doneM = {};
          Object.keys(cuts).map(Number).sort(function (x, y) { return x - y; }).forEach(function (c) {
            var st = new Stretch(F, a, b, c);
            if (!st.M.length || st.M.length % K) return;
            var mk = c + ':' + st.M.length + ':' + st.L.length;
            if (doneM[mk]) return; doneM[mk] = 1;
            var f1 = st.member(1);
            if (!frameCheck(orient, f1)) return;
            var f2c = st.member(2), f2 = frameCheck(orient, f2c);
            if (!f2) return;
            var k1 = keyFor(f1), k2 = keyFor(f2c);
            if (sameFamily([frames[fi].key, k1, k2])) return;
            var proof = proveStretch(orient, st);
            if (!proof) return;
            /* members: one step back if that is a frame too, then forward */
            var step = st.M.length / K, n0 = F.length / K, members = [], first = 0;
            var back = st.member(-1);
            if (back.length && frameCheck(orient, back)) first = -1;
            var last = Math.max(2, Math.ceil((maxTiles - n0) / step) + 1);
            var memKeys = [];
            for (var k = first; k <= last; k++) {
              var cs = k === 0 ? F : st.member(k), cn = canon(cs, nsym), key = keyOf(cn);
              var r = frameCheck(orient, cn);
              memKeys.push(key);
              members.push({ k: k, tiles: cs.length / K, area: cs.length, key: key, cells: cn,
                             tiling1: r ? r.tilings[0] : null, tiling2: r ? r.tilings[1] : null,
                             holes: holes(cn), listIndex: byKey[key] !== undefined ? byKey[key] : -1, proven: k >= 0 });
            }
            if (sameFamily(memKeys)) return;
            var set = {}; memKeys.forEach(function (k) { set[k] = 1; });
            out.push({ seedIndex: fi, dir: [a, b], step: step, cut: c, slab: st.M.length, proof: proof,
                       members: members, memberKeySet: set });
          });
        }
      }
    }
    out.forEach(function (s) { delete s.memberKeySet; });
    out.sort(function (x, y) { return x.members[0].area - y.members[0].area || x.step - y.step; });
    return out;
  }

  return {
    findSeries: findSeries, Stretch: Stretch, proveStretch: proveStretch, frameCheck: frameCheck,
    readO: readO, toO: toO, looksLikeO: looksLikeO, oToCell: oToCell, cellToO: cellToO,
    symc: symc, cmp: cmp, normalize: normalize, canon: canon, keyOf: keyOf, dedupe: dedupe,
    buildOrients: buildOrients, connected: connected, neighbours: neighbours,
    countTilings: countTilings, holes: holes, pieces: pieces, sharedTiles: sharedTiles,
    Searcher: Searcher, sortFrames: sortFrames, decorate: decorate, parseInput: parseInput
  };
})();
if (typeof module !== 'undefined') module.exports = FrameEngine;

