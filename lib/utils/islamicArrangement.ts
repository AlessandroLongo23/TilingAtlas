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
 * Bounded faces of the arrangement of `segments`. Assumes the segments never cross transversally
 * (true for the Islamic construction: a ray always stops on contact), so the only vertices are
 * shared endpoints and T-junctions. Interior faces come out CCW; the outer face(s) are dropped.
 */
export function extractFaces(segments: Segment[]): Face[] {
    // 1. Dedupe endpoints to vertex indices.
    const idxOf = new Map<string, number>();
    const pts: Vector[] = [];
    const vid = (v: Vector): number => {
        const k = keyOf(v);
        let i = idxOf.get(k);
        if (i === undefined) { i = pts.length; idxOf.set(k, i); pts.push(v.copy()); }
        return i;
    };
    const raw: [number, number][] = [];
    for (const [a, b] of segments) {
        const i = vid(a), j = vid(b);
        if (i !== j) raw.push([i, j]);
    }

    // 2. Split each edge at any vertex lying on its interior (T-junctions). A spatial grid over the
    //    points keeps this near-linear instead of O(edges × points) — essential once the whole tiling
    //    is pooled into one arrangement (thousands of segments when zoomed out).
    const edges = new Set<string>();
    const undirected = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    let lenSum = 0;
    for (const [a, b] of raw) lenSum += Vector.distance(pts[a], pts[b]);
    const gcell = raw.length ? Math.max(1e-6, lenSum / raw.length) : 1;
    const pgrid = new Map<string, number[]>();
    for (let k = 0; k < pts.length; k++) {
        const key = `${Math.floor(pts[k].x / gcell)},${Math.floor(pts[k].y / gcell)}`;
        let arr = pgrid.get(key); if (!arr) { arr = []; pgrid.set(key, arr); } arr.push(k);
    }
    for (const [a, b] of raw) {
        const A = pts[a], B = pts[b];
        const AB = Vector.sub(B, A);
        const len2 = AB.dot(AB);
        if (len2 < 1e-18) continue;
        const gx0 = Math.floor(Math.min(A.x, B.x) / gcell), gx1 = Math.floor(Math.max(A.x, B.x) / gcell);
        const gy0 = Math.floor(Math.min(A.y, B.y) / gcell), gy1 = Math.floor(Math.max(A.y, B.y) / gcell);
        const seen = new Set<number>();
        const on: { t: number; idx: number }[] = [];
        for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
            const arr = pgrid.get(`${gx},${gy}`);
            if (!arr) continue;
            for (const k of arr) {
                if (k === a || k === b || seen.has(k)) continue;
                seen.add(k);
                const AP = Vector.sub(pts[k], A);
                const t = AP.dot(AB) / len2;
                if (t <= 1e-7 || t >= 1 - 1e-7) continue;
                const proj = new Vector(A.x + AB.x * t, A.y + AB.y * t);
                if (Vector.distance(proj, pts[k]) < 1e-6) on.push({ t, idx: k });
            }
        }
        on.sort((x, y) => x.t - y.t);
        let prev = a;
        for (const { idx } of on) { if (prev !== idx) edges.add(undirected(prev, idx)); prev = idx; }
        if (prev !== b) edges.add(undirected(prev, b));
    }

    // 3. Adjacency, sorted CCW by angle.
    const adj: number[][] = pts.map(() => []);
    for (const e of edges) {
        const [a, b] = e.split("-").map(Number);
        adj[a].push(b); adj[b].push(a);
    }
    const ang = (a: number, b: number) => Math.atan2(pts[b].y - pts[a].y, pts[b].x - pts[a].x);
    for (let a = 0; a < pts.length; a++) adj[a].sort((x, y) => ang(a, x) - ang(a, y));

    // A degree-1 (pendant) vertex means a segment endpoint dangles in open space rather than meeting
    // another segment — impossible for the closed Islamic construction, but if the caller ever violates
    // that (e.g. a ray dropped for having no partner), the trace detours into the spur and back, making
    // the containing face non-simple. Never let that pass silently.
    if (pts.some((_, a) => adj[a].length === 1)) {
        console.warn("extractFaces: a degree-1 (pendant) vertex — a dangling segment endpoint will make its face non-simple");
    }

    // 4. Trace faces: at each vertex the next half-edge is the one just clockwise of the reverse.
    const visited = new Set<string>();
    const he = (a: number, b: number) => `${a}->${b}`;
    const faces: Face[] = [];
    for (const e of edges) {
        const [u, v] = e.split("-").map(Number);
        for (const [a0, b0] of [[u, v], [v, u]] as [number, number][]) {
            if (visited.has(he(a0, b0))) continue;
            const loop: number[] = [];
            let a = a0, b = b0;
            let guard = 0;
            while (!visited.has(he(a, b)) && guard++ < 100000) {
                visited.add(he(a, b));
                loop.push(a);
                const nb = adj[b];
                const ia = nb.indexOf(a);
                const c = nb[(ia - 1 + nb.length) % nb.length];
                a = b; b = c;
            }
            if (guard >= 100000) console.warn("extractFaces: face-trace guard hit — the face may be truncated");
            faces.push({ vertices: loop.map((i) => pts[i]) });
        }
    }

    // 5. Keep interior faces (CCW, positive area); drop the outer face(s) and degenerate ones.
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
