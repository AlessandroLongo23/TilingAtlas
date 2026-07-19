import { Vector } from "@/classes/Vector";
import { keyOf, lineIntersect, buildArrangement, type Segment, type Face } from "@/utils/islamicArrangement";

/**
 * Interlace (woven-band) geometry for the Islamic star construction. Given the pooled construction
 * `Segment[]` (two rays per tile edge, rooted at the edge midpoint), this builds a planar "map" whose
 * crossings are the shared edge midpoints (4-valent) and whose star tips are bends (2-valent), assigns
 * a consistent over/under weave, and offsets each edge into a band with mitres, caps and under-trims.
 *
 * The map is the same idiom as `extractFaces` in islamicArrangement.ts: endpoints deduped by `keyOf`,
 * neighbours sorted CCW by angle. Unlike `extractFaces` it does NOT split T-junctions — a ray landing
 * on another ray's body shows up as an odd-degree vertex and is handled by the degenerate fallback.
 */

/** One edge-end incident to a vertex: which edge, which of its two endpoints, and the outgoing ray. */
export interface InterlaceEnd {
    edge: number;
    end: 0 | 1;
    dir: Vector;   // UNIT direction leaving this vertex along the edge
    angle: number; // dir.heading(), used to sort neighbours CCW
}

export interface InterlaceVertex {
    pos: Vector;
    ends: InterlaceEnd[]; // sorted CCW by angle (the NeighbourMap)
}

export interface InterlaceEdge {
    a: Vector;
    b: Vector;
    keyA: string;
    keyB: string;
    underA: boolean; // over/under state at endpoint A, filled by assignOverUnder
    underB: boolean; // over/under state at endpoint B
    assigned: boolean;
}

export interface InterlaceMap {
    vertices: InterlaceVertex[];
    edges: InterlaceEdge[];
    vertexOf: Map<string, number>;
}

/**
 * Build the weave graph: a proper planar arrangement (endpoints deduped, segments split at T-junctions
 * and — when `splitCrossings` — transversal crossings), with each vertex's incident edge-ends sorted CCW
 * by angle. Splitting is what lets the weave see crossings the classic construction leaves mid-segment
 * (edge offset > 0, intersection-count > 1); with it off, the clean construction passes straight through.
 */
export function buildInterlaceMap(segments: Segment[], splitCrossings: boolean = false): InterlaceMap {
    const { pts, edges: arrEdges } = buildArrangement(segments, splitCrossings);
    const vertices: InterlaceVertex[] = pts.map((p) => ({ pos: p, ends: [] }));
    const vertexOf = new Map<string, number>();
    for (let i = 0; i < pts.length; i++) vertexOf.set(keyOf(pts[i]), i);

    const edges: InterlaceEdge[] = [];
    for (const [ia, ib] of arrEdges) {
        const a = pts[ia], b = pts[ib];
        const ei = edges.length;
        edges.push({ a: a.copy(), b: b.copy(), keyA: keyOf(a), keyB: keyOf(b), underA: false, underB: false, assigned: false });
        const dirA = Vector.sub(b, a).normalize();
        const dirB = Vector.sub(a, b).normalize();
        vertices[ia].ends.push({ edge: ei, end: 0, dir: dirA, angle: dirA.heading() });
        vertices[ib].ends.push({ edge: ei, end: 1, dir: dirB, angle: dirB.heading() });
    }

    for (const vert of vertices) vert.ends.sort((x, y) => x.angle - y.angle);
    return { vertices, edges, vertexOf };
}

/** One border segment of a strap, with its unit OUTWARD normal (pointing away from the strap fill) so
 *  the emboss style can light each edge — highlight where it faces the light, shadow where it faces away. */
export interface OutlineSeg { a: Vector; b: Vector; n: Vector; }

export interface Band {
    // Full-length strap polygon: butt through every crossing (an under strand tucks fully beneath the
    // over strand rather than being trimmed), mitred at bends, capped at tips. Drawn as a solid fill.
    fill: Vector[];
    // Border segments to stroke. The over/under illusion lives here: an under strand's two side edges
    // stop exactly on the over strand's edge line (parallel to the over strand at any crossing angle),
    // while the over strand's edges run through unbroken. This is what "makes the stroke do the work".
    outline: OutlineSeg[];
}

export interface InterlaceParams {
    width: number;           // full band width, world units
    startUnder: boolean;     // chirality seed
    squareCap?: boolean;     // tip treatment: true (default) extends the cap by width/2, false = butt
    weave?: boolean;         // true (default) breaks under strands for over/under; false = flat outlined straps
    splitCrossings?: boolean; // split transversal crossings (edge offset > 0 or intersection-count > 1)
}

const endUnder = (e: InterlaceEdge, end: 0 | 1): boolean => (end === 0 ? e.underA : e.underB);
const setEndUnder = (e: InterlaceEdge, end: 0 | 1, v: boolean): void => {
    if (end === 0) e.underA = v; else e.underB = v;
};

/**
 * Assign a consistent over/under weave. Around each vertex the ends alternate by angular-sort parity
 * (so a 4-valent crossing reads over/under/over/under and a collinear continuation keeps its state);
 * along each edge the state flips (over at one crossing, under at the next). Because the map is even
 * degree at every real crossing, the alternation never conflicts. `startUnder` seeds the two chiral
 * weaves (flipping it inverts every crossing). Returns `degenerate` if an odd-degree (≥3) vertex or a
 * propagation conflict forced an inconsistent assignment — callers may then fall back to plain lines.
 */
export function assignOverUnder(map: InterlaceMap, startUnder: boolean): { degenerate: boolean } {
    const { vertices, edges, vertexOf } = map;
    let degenerate = false;

    // vertex index for each edge endpoint, and the end's position in that vertex's sorted `ends`.
    const endInfo = edges.map((e) => ({ va: vertexOf.get(e.keyA)!, vb: vertexOf.get(e.keyB)! }));

    const queue: number[] = [];
    for (let s = 0; s < edges.length; s++) {
        if (edges[s].assigned) continue;
        // Seed a fresh component.
        edges[s].underA = startUnder;
        edges[s].underB = !startUnder;
        edges[s].assigned = true;
        queue.push(endInfo[s].va, endInfo[s].vb);
        while (queue.length) {
            const vi = queue.shift()!;
            const vert = vertices[vi];
            const deg = vert.ends.length;
            if (deg >= 3 && deg % 2 === 1) degenerate = true;
            // Phase from any already-assigned incident end: under(end_i) = phase XOR (i & 1).
            let phase: boolean | null = null;
            for (let i = 0; i < deg; i++) {
                const en = vert.ends[i];
                if (!edges[en.edge].assigned) continue;
                const u = endUnder(edges[en.edge], en.end);
                phase = (i & 1) ? !u : u;
                break;
            }
            if (phase === null) continue; // no anchor yet; revisited once a neighbour assigns one
            for (let i = 0; i < deg; i++) {
                const en = vert.ends[i];
                const want = (i & 1) ? !phase : phase;
                const e = edges[en.edge];
                if (e.assigned) {
                    if (endUnder(e, en.end) !== want) degenerate = true;
                    continue;
                }
                setEndUnder(e, en.end, want);
                const other: 0 | 1 = en.end === 0 ? 1 : 0;
                setEndUnder(e, other, !want); // an edge flips along its length
                e.assigned = true;
                const info = endInfo[en.edge];
                queue.push(en.end === 0 ? info.vb : info.va);
            }
        }
    }
    return { degenerate };
}

/**
 * Offset every edge into a band. Each edge yields one closed strip polygon `[Aleft, Bleft, Bright,
 * Aright]`, whose corners are the join points computed per incident vertex: a square/butt cap at a
 * degree-1 tip, a mitre at a degree-2 bend, and at a crossing the over strand runs straight through
 * while the under strand is trimmed back to the over boundary (minus `gap`). Requires `assignOverUnder`
 * to have run so the over/under state per edge-end is known.
 */
const leftNormal = (d: Vector): Vector => new Vector(-d.y, d.x); // rotate +90°

/** Per-edge-end corner data: the FILL corners (left/right of the outgoing dir), the OUTLINE corners
 *  (same as fill, except an under strand's are clipped to the over strand's edge), and whether this end
 *  is a tip (its outline gets a cap) — a crossing end never caps, which is what leaves the weave break. */
interface EndCorners { fL: Vector; fR: Vector; oL: Vector; oR: Vector; tip: boolean; }

export function buildBands(map: InterlaceMap, params: { width: number; squareCap?: boolean; weave?: boolean }): Band[] {
    const h = params.width / 2;
    const square = params.squareCap !== false;
    const weave = params.weave !== false;
    const { vertices, edges, vertexOf } = map;

    // Join point of the wedge between two consecutive ends (`ea` CCW-earlier, `eb` CCW-later): intersect
    // ea's left-offset line with eb's right-offset line. Null (collinear/parallel offsets) → caller butts.
    const joinPoint = (pos: Vector, ea: InterlaceEnd, eb: InterlaceEnd): Vector | null => {
        const pA = Vector.add(pos, Vector.scale(leftNormal(ea.dir), h));
        const pB = Vector.add(pos, Vector.scale(leftNormal(eb.dir), -h));
        return lineIntersect(pA, ea.dir, pB, eb.dir);
    };

    const corners = (vi: number, k: number): EndCorners => {
        const vert = vertices[vi];
        const ends = vert.ends;
        const deg = ends.length;
        const me = ends[k];
        const pos = vert.pos;
        const nMe = leftNormal(me.dir);
        const buttL = Vector.add(pos, Vector.scale(nMe, h));
        const buttR = Vector.add(pos, Vector.scale(nMe, -h));

        if (deg === 1) {
            const ext = square ? Vector.scale(me.dir, -h) : new Vector(0, 0); // extend the cap outward
            const fL = Vector.add(buttL, ext), fR = Vector.add(buttR, ext);
            return { fL, fR, oL: fL, oR: fR, tip: true };
        }

        // 4-valent (or higher even) crossing. The FILL always runs straight through (butt at pos), so an
        // under strand tucks fully beneath the over strand. For the OUTLINE, the over strand runs through
        // unbroken, while the under strand's side edges are clipped to the over strand's near edge — the
        // break follows the over edge exactly, at any crossing angle.
        if (deg >= 4) {
            const meUnder = endUnder(edges[me.edge], me.end);
            // Over strand, or the 'outline' style (no weave): straps cross flat, all borders drawn full.
            if (!meUnder || !weave) return { fL: buttL, fR: buttR, oL: buttL, oR: buttR, tip: false };
            const over = ends.find((x) => !endUnder(edges[x.edge], x.end));
            if (!over) return { fL: buttL, fR: buttR, oL: buttL, oR: buttR, tip: false };
            const nOver = leftNormal(over.dir);
            const s = me.dir.dot(nOver);
            if (Math.abs(s) < 1e-9) return { fL: buttL, fR: buttR, oL: buttL, oR: buttR, tip: false };
            // The over edge the under strand meets first, coming from its body (+me.dir side of pos).
            const edgePt = Vector.add(pos, Vector.scale(nOver, Math.sign(s) * h));
            const oL = lineIntersect(buttL, me.dir, edgePt, over.dir) ?? buttL;
            const oR = lineIntersect(buttR, me.dir, edgePt, over.dir) ?? buttR;
            return { fL: buttL, fR: buttR, oL, oR, tip: false };
        }

        // Degree 2 (bend) or degree 3 (odd/degenerate): plain mitre against the angular neighbours.
        const next = ends[(k + 1) % deg];
        const prev = ends[(k - 1 + deg) % deg];
        const fL = joinPoint(pos, me, next) ?? buttL;
        const fR = joinPoint(pos, prev, me) ?? buttR;
        return { fL, fR, oL: fL, oR: fR, tip: false };
    };

    const bands: Band[] = [];
    for (let ei = 0; ei < edges.length; ei++) {
        const e = edges[ei];
        const va = vertexOf.get(e.keyA)!, vb = vertexOf.get(e.keyB)!;
        const ka = vertices[va].ends.findIndex((x) => x.edge === ei && x.end === 0);
        const kb = vertices[vb].ends.findIndex((x) => x.edge === ei && x.end === 1);
        const A = corners(va, ka);
        const B = corners(vb, kb);
        // Edge-oriented ring [Aleft, Bleft, Bright, Aright]: at end 0 edge-left = outgoing-left; at end 1
        // the outgoing dir is reversed, so edge-left = outgoing-right.
        const fill = [A.fL, B.fR, B.fL, A.fR];
        const uAB = Vector.sub(e.b, e.a).normalize();
        const nL = leftNormal(uAB); // outward normal of the edge-left side; the edge-right side is -nL
        const outline: OutlineSeg[] = [
            { a: A.oL, b: B.oR, n: nL },
            { a: A.oR, b: B.oL, n: Vector.scale(nL, -1) },
        ];
        // End caps only at genuine tips (never at a crossing); their outward normal is along the strap axis.
        if (A.tip) outline.push({ a: A.fL, b: A.fR, n: Vector.scale(uAB, -1) });
        if (B.tip) outline.push({ a: B.fL, b: B.fR, n: uAB });
        bands.push({ fill, outline });
    }
    return bands;
}

/** Full pipeline: build the map, assign the weave, offset into bands. */
export function buildIslamicInterlace(segments: Segment[], params: InterlaceParams): { bands: Band[]; degenerate: boolean } {
    const map = buildInterlaceMap(segments, params.splitCrossings);
    const { degenerate } = assignOverUnder(map, params.startUnder);
    const bands = buildBands(map, { width: params.width, squareCap: params.squareCap, weave: params.weave });
    return { bands, degenerate };
}

/**
 * Two-colour the faces of the pattern so no two faces sharing an edge get the same colour (the
 * checkerboard / zellij field). Builds face adjacency from shared boundary edges and BFS-colours each
 * component; because the star arrangement is even-degree everywhere it is bipartite, so this is a proper
 * 2-colouring. Returns a colour (0 or 1) per input face. Non-bipartite components fall back best-effort.
 */
export function twoColorFaces(faces: Face[]): number[] {
    const edgeFaces = new Map<string, number[]>();
    const faceEdges: string[][] = faces.map(() => []);
    for (let fi = 0; fi < faces.length; fi++) {
        const vs = faces[fi].vertices;
        for (let i = 0; i < vs.length; i++) {
            const a = keyOf(vs[i]), b = keyOf(vs[(i + 1) % vs.length]);
            if (a === b) continue;
            const ek = a < b ? `${a}|${b}` : `${b}|${a}`;
            faceEdges[fi].push(ek);
            let arr = edgeFaces.get(ek); if (!arr) { arr = []; edgeFaces.set(ek, arr); } arr.push(fi);
        }
    }
    const color = new Array<number>(faces.length).fill(-1);
    for (let start = 0; start < faces.length; start++) {
        if (color[start] !== -1) continue;
        color[start] = 0;
        const queue = [start];
        while (queue.length) {
            const f = queue.shift()!;
            for (const ek of faceEdges[f]) {
                for (const g of edgeFaces.get(ek)!) {
                    if (g === f) continue;
                    if (color[g] === -1) { color[g] = color[f] ^ 1; queue.push(g); }
                }
            }
        }
    }
    return color;
}
