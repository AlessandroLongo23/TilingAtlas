import { Vector } from "@/classes/Vector";

export type Segment = [Vector, Vector];
export type MarkerKind = "centroid" | "dent" | "tip";
export interface Marker { point: Vector; kind: MarkerKind; hue?: number; }
export interface Face { vertices: Vector[]; }

export const PRIORITY: Record<MarkerKind, number> = { centroid: 0, dent: 1, tip: 2 };
export const HUE: Record<MarkerKind, number> = { centroid: 125, dent: 42, tip: 210 };

const QUANT = 1e5;
export const keyOf = (v: Vector): string => `${Math.round(v.x * QUANT)},${Math.round(v.y * QUANT)}`;

export function signedArea(pts: Vector[]): number {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
}

export function pointInPolygon(poly: Vector[], p: Vector): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
        const crosses = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
        if (crosses) inside = !inside;
    }
    return inside;
}

/** Intersection of line (p1 + s·d1) with line (p2 + t·d2). Null if parallel. */
export function lineIntersect(p1: Vector, d1: Vector, p2: Vector, d2: Vector): Vector | null {
    const denom = Vector.cross(d1, d2);
    if (Math.abs(denom) < 1e-12) return null;
    const diff = Vector.sub(p2, p1);
    const s = Vector.cross(diff, d2) / denom;
    return new Vector(p1.x + d1.x * s, p1.y + d1.y * s);
}

/** Tip point = intersection of the two inward-normal lines through the halfways of adjacent edges. */
export function tipPoint(hPrev: Vector, nPrev: Vector, hCur: Vector, nCur: Vector): Vector | null {
    return lineIntersect(hPrev, nPrev, hCur, nCur);
}

/**
 * Planar arrangement of `segments`: dedupe endpoints, optionally add interior transversal crossings as
 * vertices, then split every segment at any vertex on its interior (T-junctions and those crossings).
 * The result is a proper planar subdivision — every shared point is a vertex and no segment crosses
 * another except at a vertex. Shared by `extractFaces` (face tracing) and `buildInterlaceMap` (the weave
 * graph). With `splitCrossings = false` transversal crossings are NOT added (the classic construction
 * never crosses mid-segment); pass `true` once rays pass through each other (intersection-count > 1) or
 * the contact point is split off the midpoint (edge offset > 0), where real crossings land mid-segment.
 */
export function buildArrangement(segments: Segment[], splitCrossings: boolean = false): { pts: Vector[]; edges: [number, number][] } {
    // Hot path: this runs on every frame of an Islamic slider drag, over thousands of pooled segments (see
    // buildMeshFromPatch). Everything below that looks like a micro-optimisation is one — string keys for
    // vertices, grid cells, edges and half-edges, plus a Vector allocation per candidate point, together
    // dominated the cost. Semantics are unchanged and deliberately so: same buckets, same insertion order,
    // same comparisons, therefore the same vertices, the same `edges` ORDER (face tracing walks it) and the
    // same faces. tests/islamic-arrangement-digest.test.ts pins that byte-for-byte.

    // 1. Dedupe endpoints to vertex indices. Nested numeric Map (rx → ry → index) instead of a "rx,ry"
    //    string key: identical bucketing, no string per vertex.
    const pts: Vector[] = [];
    const byX = new Map<number, Map<number, number>>();
    const vid = (v: Vector): number => {
        const rx = Math.round(v.x * QUANT);
        const ry = Math.round(v.y * QUANT);
        let row = byX.get(rx);
        if (row === undefined) { row = new Map(); byX.set(rx, row); }
        const hit = row.get(ry);
        if (hit !== undefined) return hit;
        const i = pts.length;
        row.set(ry, i);
        pts.push(v.copy());
        return i;
    };
    const raw: [number, number][] = [];
    for (const [a, b] of segments) {
        const i = vid(a), j = vid(b);
        if (i !== j) raw.push([i, j]);
    }

    // 1b. Interior transversal crossings become vertices so step 2 splits both segments there. A spatial
    //     grid over the segments' bounding boxes keeps this near-linear instead of O(edges²): a real
    //     crossing means the two segments overlap in space, so they share a grid cell and the pair is
    //     still tested. Candidates are sorted ascending, so the crossing points are created in the same
    //     order the old all-pairs loop created them (byte-identical output). This is the path
    //     edge-offset>0 / intersection-count>1 take; the un-gridded O(edges²) version was the Edge Offset
    //     drag bottleneck (offset 0 skips this block entirely, which is why only offset>0 was slow).
    if (splitCrossings) {
        let lenSum0 = 0;
        for (const [a, b] of raw) lenSum0 += Vector.distance(pts[a], pts[b]);
        const xcell = raw.length ? Math.max(1e-6, lenSum0 / raw.length) : 1;
        // gx → gy → edge indices. The cell walk is inlined at both use sites, so no key array is built per
        // segment (cellsOf used to return a fresh string[] twice per segment).
        const xgrid = new Map<number, Map<number, number[]>>();
        for (let e = 0; e < raw.length; e++) {
            const P = pts[raw[e][0]], Q = pts[raw[e][1]];
            const gx1 = Math.floor(Math.max(P.x, Q.x) / xcell), gy1 = Math.floor(Math.max(P.y, Q.y) / xcell);
            for (let gx = Math.floor(Math.min(P.x, Q.x) / xcell); gx <= gx1; gx++) {
                let col = xgrid.get(gx);
                if (col === undefined) { col = new Map(); xgrid.set(gx, col); }
                for (let gy = Math.floor(Math.min(P.y, Q.y) / xcell); gy <= gy1; gy++) {
                    let arr = col.get(gy);
                    if (arr === undefined) { arr = []; col.set(gy, arr); }
                    arr.push(e);
                }
            }
        }
        // Reused across segments: `cand` collects candidate edge indices and `stamp` dedupes them without a
        // per-segment Set — stamp[b] === a means b is already in cand for segment a, and `a` only ever
        // increases. Sorting is still ascending, which is what keeps the crossing order identical.
        const stamp = new Int32Array(raw.length).fill(-1);
        const cand: number[] = [];
        for (let a = 0; a < raw.length; a++) {
            const [a0, a1] = raw[a];
            const P1 = pts[a0], Q1 = pts[a1];
            const d1x = Q1.x - P1.x, d1y = Q1.y - P1.y;
            cand.length = 0;
            const cgx1 = Math.floor(Math.max(P1.x, Q1.x) / xcell), cgy1 = Math.floor(Math.max(P1.y, Q1.y) / xcell);
            for (let gx = Math.floor(Math.min(P1.x, Q1.x) / xcell); gx <= cgx1; gx++) {
                const col = xgrid.get(gx);
                if (col === undefined) continue;
                for (let gy = Math.floor(Math.min(P1.y, Q1.y) / xcell); gy <= cgy1; gy++) {
                    const arr = col.get(gy);
                    if (arr === undefined) continue;
                    for (let n = 0; n < arr.length; n++) {
                        const b = arr[n];
                        if (b > a && stamp[b] !== a) { stamp[b] = a; cand.push(b); }
                    }
                }
            }
            cand.sort((x, y) => x - y);
            for (let ci = 0; ci < cand.length; ci++) {
                const b = cand[ci];
                const [b0, b1] = raw[b];
                if (a0 === b0 || a0 === b1 || a1 === b0 || a1 === b1) continue; // share an endpoint
                const P2 = pts[b0], Q2 = pts[b1];
                const d2x = Q2.x - P2.x, d2y = Q2.y - P2.y;
                const denom = d1x * d2y - d1y * d2x;
                if (Math.abs(denom) < 1e-12) continue; // parallel
                const dfx = P2.x - P1.x, dfy = P2.y - P1.y;
                const sPar = (dfx * d2y - dfy * d2x) / denom;
                const tPar = (dfx * d1y - dfy * d1x) / denom;
                if (sPar <= 1e-7 || sPar >= 1 - 1e-7 || tPar <= 1e-7 || tPar >= 1 - 1e-7) continue; // interior only
                vid(new Vector(P1.x + d1x * sPar, P1.y + d1y * sPar));
            }
        }
    }

    // 2. Split each edge at any vertex lying on its interior (T-junctions). A spatial grid over the
    //    points keeps this near-linear instead of O(edges × points) — essential once the whole tiling
    //    is pooled into one arrangement (thousands of segments when zoomed out). Duplicate/coincident
    //    segments collapse here because the edge set is keyed by the unordered vertex pair.
    //
    //    `pts` is final now (1b is the only thing that grows it), so a pair (min,max) packs losslessly into
    //    one number, min·N + max — a Set<number> in place of the old Set<string> of `"a-b"` keys, which
    //    also removes the split("-").map(Number) parse when the edge list is materialised. Insertion order
    //    is what a Set iterates, and it is unchanged, so `edges` comes out in exactly the old order.
    const N = pts.length;
    const edgeSet = new Set<number>();
    const addEdge = (a: number, b: number) => { edgeSet.add(a < b ? a * N + b : b * N + a); };
    let lenSum = 0;
    for (const [a, b] of raw) lenSum += Vector.distance(pts[a], pts[b]);
    const gcell = raw.length ? Math.max(1e-6, lenSum / raw.length) : 1;
    const pgrid = new Map<number, Map<number, number[]>>();
    for (let k = 0; k < pts.length; k++) {
        const gx = Math.floor(pts[k].x / gcell), gy = Math.floor(pts[k].y / gcell);
        let col = pgrid.get(gx);
        if (col === undefined) { col = new Map(); pgrid.set(gx, col); }
        let arr = col.get(gy);
        if (arr === undefined) { arr = []; col.set(gy, arr); }
        arr.push(k);
    }
    // Same stamp trick as 1b, over POINTS this time, replacing the per-edge `seen` Set. `onT`/`onI` are the
    // old `{t, idx}[]` split into parallel arrays and sorted through an index permutation — the sort key and
    // its stability are unchanged, so equal t values keep their insertion order exactly as before.
    const pstamp = new Int32Array(pts.length).fill(-1);
    const onT: number[] = [];
    const onI: number[] = [];
    const ord: number[] = [];
    for (let ri = 0; ri < raw.length; ri++) {
        const [a, b] = raw[ri];
        const A = pts[a], B = pts[b];
        const abx = B.x - A.x, aby = B.y - A.y;
        const len2 = abx * abx + aby * aby;
        if (len2 < 1e-18) continue;
        onT.length = 0; onI.length = 0;
        const gx1 = Math.floor(Math.max(A.x, B.x) / gcell), gy1 = Math.floor(Math.max(A.y, B.y) / gcell);
        for (let gx = Math.floor(Math.min(A.x, B.x) / gcell); gx <= gx1; gx++) {
            const col = pgrid.get(gx);
            if (col === undefined) continue;
            for (let gy = Math.floor(Math.min(A.y, B.y) / gcell); gy <= gy1; gy++) {
                const arr = col.get(gy);
                if (arr === undefined) continue;
                for (let n = 0; n < arr.length; n++) {
                    const k = arr[n];
                    if (k === a || k === b || pstamp[k] === ri) continue;
                    pstamp[k] = ri;
                    const K = pts[k];
                    const t = ((K.x - A.x) * abx + (K.y - A.y) * aby) / len2;
                    if (t <= 1e-7 || t >= 1 - 1e-7) continue;
                    // Written exactly as the Vector version was (project, then subtract the point) so the
                    // floating-point result is bit-identical, not merely algebraically equal.
                    const dx = (A.x + abx * t) - K.x, dy = (A.y + aby * t) - K.y;
                    if (dx * dx + dy * dy < 1e-12) { onT.push(t); onI.push(k); }
                }
            }
        }
        ord.length = 0;
        for (let i = 0; i < onT.length; i++) ord.push(i);
        ord.sort((x, y) => onT[x] - onT[y]);
        let prev = a;
        for (let i = 0; i < ord.length; i++) {
            const idx = onI[ord[i]];
            if (prev !== idx) addEdge(prev, idx);
            prev = idx;
        }
        if (prev !== b) addEdge(prev, b);
    }
    const edges: [number, number][] = [];
    for (const k of edgeSet) { const a = Math.floor(k / N); edges.push([a, k - a * N]); }
    return { pts, edges };
}

/**
 * Bounded faces of the arrangement of `segments`. See `buildArrangement` for `splitCrossings`. Interior
 * faces come out CCW; the outer face(s) are dropped.
 */
export function extractFaces(segments: Segment[], splitCrossings: boolean = false): Face[] {
    const { pts, edges } = buildArrangement(segments, splitCrossings);

    // Adjacency, sorted CCW by angle. The angle is computed ONCE per neighbour and the permutation sorted,
    // instead of calling atan2 twice per comparison inside the comparator — same key, same (stable) tie
    // order, ~2·log(degree) fewer transcendental calls per vertex.
    const adj: number[][] = pts.map(() => []);
    for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
    const angBuf: number[] = [];
    const ordBuf: number[] = [];
    for (let a = 0; a < pts.length; a++) {
        const nb = adj[a];
        if (nb.length < 2) continue;
        const A = pts[a];
        angBuf.length = 0; ordBuf.length = 0;
        for (let i = 0; i < nb.length; i++) {
            const P = pts[nb[i]];
            angBuf.push(Math.atan2(P.y - A.y, P.x - A.x));
            ordBuf.push(i);
        }
        ordBuf.sort((x, y) => angBuf[x] - angBuf[y]);
        const sorted = new Array<number>(nb.length);
        for (let i = 0; i < nb.length; i++) sorted[i] = nb[ordBuf[i]];
        adj[a] = sorted;
    }

    // A degree-1 (pendant) vertex means a segment endpoint dangles in open space instead of meeting
    // another segment — impossible for the closed Islamic construction, but if the caller ever violates
    // that (e.g. a ray dropped for having no partner), the trace detours into the spur and back, making
    // the containing face non-simple. Never let that pass silently.
    if (pts.some((_, a) => adj[a].length === 1)) {
        console.warn("extractFaces: a degree-1 (pendant) vertex — a dangling segment endpoint will make its face non-simple");
    }

    // Trace faces: at each vertex the next half-edge is the one just clockwise of the reverse. Half-edges
    // are keyed as a·N + b in a Set<number> — the old `"a->b"` string was allocated twice per step of every
    // trace (once to test, once to mark), which on a few thousand edges is tens of thousands of throwaway
    // strings per rebuild. Directed and injective for a, b < N, so the traversal is unchanged.
    const N = pts.length;
    const visited = new Set<number>();
    const faces: Face[] = [];
    for (const [u, v] of edges) {
        for (let dir = 0; dir < 2; dir++) {
            const a0 = dir === 0 ? u : v;
            const b0 = dir === 0 ? v : u;
            if (visited.has(a0 * N + b0)) continue;
            const loop: number[] = [];
            let a = a0, b = b0;
            let guard = 0;
            let key = a * N + b;
            while (!visited.has(key) && guard++ < 100000) {
                visited.add(key);
                loop.push(a);
                const nb = adj[b];
                const ia = nb.indexOf(a);
                const c = nb[(ia - 1 + nb.length) % nb.length];
                a = b; b = c;
                key = a * N + b;
            }
            if (guard >= 100000) console.warn("extractFaces: face-trace guard hit — the face may be truncated");
            const verts = new Array<Vector>(loop.length);
            for (let i = 0; i < loop.length; i++) verts[i] = pts[loop[i]];
            faces.push({ vertices: verts });
        }
    }

    // Keep interior faces (CCW, positive area); drop the outer face(s) and degenerate ones.
    const result: Face[] = [];
    for (const f of faces) if (signedArea(f.vertices) > 1e-9) result.push(f);
    return result;
}

export interface ColoredFace { face: Face; hue: number; kind: MarkerKind; }

let warnedDentTip = false;

/** Color each face by the highest-priority marker it contains. Marker-free faces are omitted. */
export function colorFaces(faces: Face[], markers: Marker[]): ColoredFace[] {
    const out: ColoredFace[] = [];
    for (const face of faces) {
        let best: MarkerKind | null = null;
        const present = new Set<MarkerKind>();
        for (const m of markers) {
            if (!pointInPolygon(face.vertices, m.point)) continue;
            present.add(m.kind);
            if (best === null || PRIORITY[m.kind] < PRIORITY[best]) best = m.kind;
        }
        if (best === null) continue;
        if (!warnedDentTip && present.has("dent") && present.has("tip") && !present.has("centroid")) {
            warnedDentTip = true;
            console.warn("colorFaces: a face holds a dent and a tip but no centroid — falling back to dent > tip");
        }
        out.push({ face, hue: HUE[best], kind: best });
    }
    return out;
}

/** Dedupe markers by quantized location, keeping the highest-priority kind on a collision. */
export function dedupeMarkers(markers: Marker[]): Marker[] {
    const byKey = new Map<string, Marker>();
    for (const m of markers) {
        const k = keyOf(m.point);
        const prev = byKey.get(k);
        if (!prev || PRIORITY[m.kind] < PRIORITY[prev.kind]) byKey.set(k, m);
    }
    return [...byKey.values()];
}

export interface TileLite { vertices: Vector[]; hue: number; }
export interface TileColoredFace { face: Face; hue: number; }

/**
 * Color each face by the source tile that contains its centroid, so the fill inherits the original
 * per-tile colors. At the degenerate angle (construction lines lie on the tile edges) the faces are
 * the tiles, so this reproduces the plain tiling exactly, and the color moves continuously as the
 * angle changes. A spatial grid over the tiles' bounding boxes keeps the point location near-linear.
 */
export function colorFacesBySourceTile(faces: Face[], tiles: TileLite[]): TileColoredFace[] {
    const bbox = tiles.map((t) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const v of t.vertices) {
            if (v.x < minX) minX = v.x; if (v.y < minY) minY = v.y;
            if (v.x > maxX) maxX = v.x; if (v.y > maxY) maxY = v.y;
        }
        return { minX, minY, maxX, maxY };
    });
    let extentSum = 0;
    for (const b of bbox) extentSum += (b.maxX - b.minX) + (b.maxY - b.minY);
    const cell = tiles.length ? Math.max(1e-6, extentSum / (2 * tiles.length)) : 1;
    const grid = new Map<string, number[]>();
    for (let i = 0; i < tiles.length; i++) {
        const b = bbox[i];
        for (let gx = Math.floor(b.minX / cell); gx <= Math.floor(b.maxX / cell); gx++)
            for (let gy = Math.floor(b.minY / cell); gy <= Math.floor(b.maxY / cell); gy++) {
                const key = `${gx},${gy}`;
                let arr = grid.get(key); if (!arr) { arr = []; grid.set(key, arr); } arr.push(i);
            }
    }
    const out: TileColoredFace[] = [];
    for (const face of faces) {
        let cx = 0, cy = 0;
        for (const v of face.vertices) { cx += v.x; cy += v.y; }
        cx /= face.vertices.length; cy /= face.vertices.length;
        const cand = grid.get(`${Math.floor(cx / cell)},${Math.floor(cy / cell)}`);
        if (!cand) continue;
        const p = new Vector(cx, cy);
        for (const i of cand) {
            const b = bbox[i];
            if (cx < b.minX || cx > b.maxX || cy < b.minY || cy > b.maxY) continue;
            if (pointInPolygon(tiles[i].vertices, p)) { out.push({ face, hue: tiles[i].hue }); break; }
        }
    }
    return out;
}

/**
 * Color each face by the highest-priority FIXED marker it contains (centroid > dent > tip), using
 * that marker's tile hue. Because markers are stationary, a cell's colour is anchored and can't swap
 * as the angle sweeps (the centre always holds the star's centroid). A face with no marker falls back
 * to the tile that contains its centroid, so nothing is left unfilled. Grid-accelerated on both sides.
 */
export function colorFacesByMarkerThenTile(faces: Face[], markers: Marker[], tiles: TileLite[]): TileColoredFace[] {
    const bbox = tiles.map((t) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const v of t.vertices) {
            if (v.x < minX) minX = v.x; if (v.y < minY) minY = v.y;
            if (v.x > maxX) maxX = v.x; if (v.y > maxY) maxY = v.y;
        }
        return { minX, minY, maxX, maxY };
    });
    let extentSum = 0;
    for (const b of bbox) extentSum += (b.maxX - b.minX) + (b.maxY - b.minY);
    const cell = tiles.length ? Math.max(1e-6, extentSum / (2 * tiles.length)) : 1;

    const tileGrid = new Map<string, number[]>();
    for (let i = 0; i < tiles.length; i++) {
        const b = bbox[i];
        for (let gx = Math.floor(b.minX / cell); gx <= Math.floor(b.maxX / cell); gx++)
            for (let gy = Math.floor(b.minY / cell); gy <= Math.floor(b.maxY / cell); gy++) {
                const k = `${gx},${gy}`;
                let arr = tileGrid.get(k); if (!arr) { arr = []; tileGrid.set(k, arr); } arr.push(i);
            }
    }
    const markerGrid = new Map<string, number[]>();
    for (let i = 0; i < markers.length; i++) {
        const k = `${Math.floor(markers[i].point.x / cell)},${Math.floor(markers[i].point.y / cell)}`;
        let arr = markerGrid.get(k); if (!arr) { arr = []; markerGrid.set(k, arr); } arr.push(i);
    }

    const out: TileColoredFace[] = [];
    for (const face of faces) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, cx = 0, cy = 0;
        for (const v of face.vertices) {
            if (v.x < minX) minX = v.x; if (v.y < minY) minY = v.y;
            if (v.x > maxX) maxX = v.x; if (v.y > maxY) maxY = v.y;
            cx += v.x; cy += v.y;
        }
        cx /= face.vertices.length; cy /= face.vertices.length;

        // 1. Highest-priority stationary marker inside the face anchors the colour.
        let best: Marker | null = null;
        const seen = new Set<number>();
        for (let gx = Math.floor(minX / cell); gx <= Math.floor(maxX / cell); gx++)
            for (let gy = Math.floor(minY / cell); gy <= Math.floor(maxY / cell); gy++) {
                const arr = markerGrid.get(`${gx},${gy}`);
                if (!arr) continue;
                for (const mi of arr) {
                    if (seen.has(mi)) continue; seen.add(mi);
                    const m = markers[mi];
                    if (best && PRIORITY[m.kind] >= PRIORITY[best.kind]) continue;
                    if (pointInPolygon(face.vertices, m.point)) best = m;
                }
            }
        if (best) { out.push({ face, hue: best.hue ?? 0 }); continue; }

        // 2. Fallback: the tile that contains the face centroid, so no cell is left unfilled.
        const cand = tileGrid.get(`${Math.floor(cx / cell)},${Math.floor(cy / cell)}`);
        if (!cand) continue;
        const p = new Vector(cx, cy);
        for (const i of cand) {
            const b = bbox[i];
            if (cx < b.minX || cx > b.maxX || cy < b.minY || cy > b.maxY) continue;
            if (pointInPolygon(tiles[i].vertices, p)) { out.push({ face, hue: tiles[i].hue }); break; }
        }
    }
    return out;
}

export type AbcClass = "A" | "B" | "C";
export interface AbcFace { face: Face; klass: AbcClass; hue: number; } // hue is meaningful only for class A

/**
 * A/B/C fill for the star construction. A = star-body faces (those holding a centroid or tip marker),
 * coloured by that marker's tile hue. The remaining background faces 2-colour bipartite over shared
 * edges into two classes: the parity A sits in is C (the small edge-centre diamonds that open once the
 * edge offset splits the contact point off the midpoint), the other parity is B (the side fields). At
 * edge offset 0 there is no diamond, so the C bucket is empty and this degrades to A + B on its own.
 * `degenerate` is set when A straddles both parities inside one connected component (star/dent tiles,
 * k≥2 orbits); the caller should then paint every background face as B (a clean two-tone) instead of
 * trusting the split. Verified bipartite with A confined to one parity on the regular Euclidean tilings
 * (squares/triangles/hexagons/4.8.8) at edge offsets 0–0.6 — see docs/ISLAMIC_TILINGS.md.
 */
export function colorFacesAbc(faces: Face[], markers: Marker[]): { faces: AbcFace[]; degenerate: boolean } {
    const n = faces.length;
    if (n === 0) return { faces: [], degenerate: false };

    // Face bounding boxes; a cell sized to the mean face extent keeps the marker point-location near-linear.
    const fb = faces.map((f) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const v of f.vertices) {
            if (v.x < minX) minX = v.x; if (v.y < minY) minY = v.y;
            if (v.x > maxX) maxX = v.x; if (v.y > maxY) maxY = v.y;
        }
        return { minX, minY, maxX, maxY };
    });
    let extent = 0;
    for (const b of fb) extent += (b.maxX - b.minX) + (b.maxY - b.minY);
    const cell = Math.max(1e-6, extent / (2 * n));

    // Grid the anchoring markers (centroid/tip only — dents don't anchor a star body). Nested numeric grid
    // and a stamp array in place of the old string keys and per-face Set: same buckets, same visit order,
    // no allocation per grid cell. This function is the largest single piece of an Islamic slider rebuild
    // (27.8ms of 62.6 at edge offset 0.2 on the worst family), and nearly all of it was string churn.
    const markerGrid = new Map<number, Map<number, number[]>>();
    for (let i = 0; i < markers.length; i++) {
        if (markers[i].kind !== "centroid" && markers[i].kind !== "tip") continue;
        const gx = Math.floor(markers[i].point.x / cell), gy = Math.floor(markers[i].point.y / cell);
        let col = markerGrid.get(gx);
        if (col === undefined) { col = new Map(); markerGrid.set(gx, col); }
        let arr = col.get(gy);
        if (arr === undefined) { arr = []; col.set(gy, arr); }
        arr.push(i);
    }

    // A detection: the highest-priority centroid/tip marker inside a face anchors it and gives its hue.
    const aHue = new Array<number>(n).fill(NaN); // NaN ⇒ not an A face (background)
    const mstamp = new Int32Array(markers.length).fill(-1);
    for (let fi = 0; fi < n; fi++) {
        const b = fb[fi];
        let best: Marker | null = null;
        const gx1 = Math.floor(b.maxX / cell), gy1 = Math.floor(b.maxY / cell);
        const gy0 = Math.floor(b.minY / cell);
        for (let gx = Math.floor(b.minX / cell); gx <= gx1; gx++) {
            const col = markerGrid.get(gx);
            if (col === undefined) continue;
            for (let gy = gy0; gy <= gy1; gy++) {
                const arr = col.get(gy);
                if (arr === undefined) continue;
                for (let ai = 0; ai < arr.length; ai++) {
                    const mi = arr[ai];
                    if (mstamp[mi] === fi) continue;
                    mstamp[mi] = fi;
                    const m = markers[mi];
                    if (best && PRIORITY[m.kind] >= PRIORITY[best.kind]) continue;
                    if (pointInPolygon(faces[fi].vertices, m.point)) best = m;
                }
            }
        }
        if (best) aHue[fi] = best.hue ?? 0;
    }

    // Bipartite 2-colouring over shared-edge adjacency, tracking a component id per face.
    //
    // Vertices are interned to integer ids by their QUANTised coordinates and each distinct undirected
    // pair gets a sequential edge id, so `faceEdges`/`edgeFaces` are plain number arrays. Before, every
    // face vertex produced a keyOf string and every face edge a second concatenated one — ~150k throwaway
    // strings on a 10k-face arrangement. The pair is canonicalised by id, not by string ordering,
    // which picks a different representative for the same pair and therefore groups identically.
    const vidByX = new Map<number, Map<number, number>>();
    let nVid = 0;
    const vidOf = (v: Vector): number => {
        const rx = Math.round(v.x * QUANT), ry = Math.round(v.y * QUANT);
        let col = vidByX.get(rx);
        if (col === undefined) { col = new Map(); vidByX.set(rx, col); }
        const hit = col.get(ry);
        if (hit !== undefined) return hit;
        const id = nVid++;
        col.set(ry, id);
        return id;
    };
    const edgeIdByLo = new Map<number, Map<number, number>>();
    const edgeFaces: number[][] = [];
    const faceEdges: number[][] = faces.map(() => []);
    for (let fi = 0; fi < n; fi++) {
        const vs = faces[fi].vertices;
        for (let i = 0; i < vs.length; i++) {
            const a = vidOf(vs[i]), b = vidOf(vs[(i + 1) % vs.length]);
            if (a === b) continue;
            const lo = a < b ? a : b, hi = a < b ? b : a;
            let col = edgeIdByLo.get(lo);
            if (col === undefined) { col = new Map(); edgeIdByLo.set(lo, col); }
            let ek = col.get(hi);
            if (ek === undefined) { ek = edgeFaces.length; col.set(hi, ek); edgeFaces.push([]); }
            faceEdges[fi].push(ek);
            edgeFaces[ek].push(fi);
        }
    }
    const parity = new Array<number>(n).fill(-1);
    const comp = new Array<number>(n).fill(-1);
    let nComp = 0;
    for (let start = 0; start < n; start++) {
        if (parity[start] !== -1) continue;
        const cid = nComp++;
        parity[start] = 0; comp[start] = cid;
        // A cursor, not queue.shift(): the shift moves the whole backing store on every step, and one
        // component can hold every face in the arrangement. Same visit order.
        const queue = [start];
        for (let qi = 0; qi < queue.length; qi++) {
            const f = queue[qi];
            const fe = faceEdges[f];
            for (let i = 0; i < fe.length; i++) {
                const inc = edgeFaces[fe[i]];
                for (let j = 0; j < inc.length; j++) {
                    const g = inc[j];
                    if (g === f) continue;
                    if (parity[g] === -1) { parity[g] = parity[f] ^ 1; comp[g] = cid; queue.push(g); }
                }
            }
        }
    }

    // Per component, the parity A occupies (majority of its A faces). A in both parities ⇒ degenerate.
    const aCount: [number, number][] = Array.from({ length: nComp }, () => [0, 0]);
    for (let fi = 0; fi < n; fi++) if (!Number.isNaN(aHue[fi])) aCount[comp[fi]][parity[fi]]++;
    let degenerate = false;
    const aParity = aCount.map(([c0, c1]) => {
        if (c0 > 0 && c1 > 0) degenerate = true;
        if (c0 === 0 && c1 === 0) return -1; // component holds no star body (a boundary sliver)
        return c0 >= c1 ? 0 : 1;
    });

    // Classify: A keeps its tile hue; background splits — A's parity ⇒ C (diamonds), the other ⇒ B.
    const out: AbcFace[] = [];
    for (let fi = 0; fi < n; fi++) {
        if (!Number.isNaN(aHue[fi])) { out.push({ face: faces[fi], klass: "A", hue: aHue[fi] }); continue; }
        const ap = aParity[comp[fi]];
        const klass: AbcClass = ap >= 0 && parity[fi] === ap ? "C" : "B";
        out.push({ face: faces[fi], klass, hue: 0 });
    }
    return { faces: out, degenerate };
}
