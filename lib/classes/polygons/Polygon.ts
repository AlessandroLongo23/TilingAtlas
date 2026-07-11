import { useConfiguration } from "@/stores/configuration";
import { isWithinConvexHull, segmentsIntersect, getAngleAtVertex, isWithinTolerance } from '@/utils';
import { Vector } from '@/classes';
import { Cyclotomic } from "../Cyclotomic";
import type { CyclotomicRing } from "../Cyclotomic";
import { tolerance } from "@/utils/tolerance";
import { islamicAnglesForHalfways } from "@/utils/islamicNoise";
import { exactPolygonsOverlap } from "../algorithm/exact/exactOverlap";
import { type Marker, tipPoint } from "@/utils/islamicArrangement";

export class Polygon {
    n: number;
    name: string;
    neighbors: Polygon[];
    edgeNeighbors: Polygon[];
    nextState: number;
    hue: number;
    vertices: Vector[];
    halfways: Vector[];
    centroid: Vector;
    angle: number;
    anchor: Vector;
    dir: Vector;
    golNeighbors?: Polygon[];
    alive_neighbors: number;
    interior_angle: number;
    sides: number[];
    angles: number[];

    // --- Exact coordinate representation (source of truth when present) ---
    // See docs/CYCLOTOMIC_SPEC.md. When set, `vertices`/`halfways`/`centroid` are a derived
    // float cache (refreshFloatCache), never hand-edited. Decisions use the exact fields.
    ring?: CyclotomicRing;
    exactVertices?: Cyclotomic[];
    exactHalfways?: Cyclotomic[];
    exactCentroid?: Cyclotomic;
    /** Integer ζ-exponent (direction in units of 2π/N) of each edge vertexᵢ → vertexᵢ₊₁. */
    edgeDirs?: number[];
    /** True for non-convex star tiles (set by ExactStarPolygon). Disambiguates a star from a regular
     *  n-gon of the same edge-count `n` (e.g. 4*_{π/4} vs the square), which `n` alone cannot. Drives
     *  corner-aware VC tokens and the star-gated exact overlap predicate. Undefined ⇒ regular. */
    isStar?: boolean;

    constructor(n: number = 3) {
        this.n = n;
        this.angle = 0;
        this.neighbors = [];
        this.edgeNeighbors = [];
        this.sides = [];
        this.angles = [];

        this.hue = 0;
        this.alive_neighbors = 0;
    }

    calculateSides = () => {
        this.sides = this.vertices.map((v, index) => Vector.distance(v, this.vertices[(index + 1) % this.vertices.length]));
    }

    calculateAngles = () => {
        this.angles = this.vertices.map(v => getAngleAtVertex(this.vertices, v));
    }

    calculateCentroid = () => {
        this.centroid = new Vector()
        let signed_area = 0
        for (let i = 0; i < this.vertices.length; i++) {
            const curr_vertex = this.vertices[i];
            const next_vertex = this.vertices[(i + 1) % this.vertices.length];
            signed_area += (curr_vertex.x * next_vertex.y - next_vertex.x * curr_vertex.y);
        }
        signed_area /= 2;

        for (let i = 0; i < this.vertices.length; i++) {
            const curr_vertex = this.vertices[i];
            const next_vertex = this.vertices[(i + 1) % this.vertices.length];
            this.centroid.x += (curr_vertex.x + next_vertex.x) * (curr_vertex.x * next_vertex.y - next_vertex.x * curr_vertex.y);
            this.centroid.y += (curr_vertex.y + next_vertex.y) * (curr_vertex.x * next_vertex.y - next_vertex.x * curr_vertex.y);
        }
        this.centroid.x /= 6 * signed_area;
        this.centroid.y /= 6 * signed_area;
    }

    calculateHalfways = () => {
        this.halfways = [];
        for (let i = 0; i < this.vertices.length; i++) {
            this.halfways.push(Vector.midpoint(this.vertices[i], this.vertices[(i + 1) % this.vertices.length]));
        }
    }

    calculateAngle = (): void => {
        this.angle = Vector.sub(this.vertices[0], this.centroid).heading();
    }

    // ---------------------------------------------------------------------------
    // Exact coordinate representation
    // ---------------------------------------------------------------------------

    hasExact = (): boolean => !!this.exactVertices;

    /**
     * Install exact vertices as the source of truth. Computes the exact centroid as the
     * vertex mean (Σvᵢ)/n (NOT the signed-area formula — that needs field inversion the
     * Cyclotomic API does not provide; for regular polygons the mean equals the true
     * centroid by symmetry) and the exact halfway points, then derives the float cache.
     */
    setExactVertices = (verts: Cyclotomic[], edgeDirs: number[]): void => {
        this.ring = verts[0].ring;
        this.exactVertices = verts;
        this.edgeDirs = edgeDirs;
        const count = BigInt(verts.length);
        let sum = verts[0];
        for (let i = 1; i < verts.length; i++) sum = sum.add(verts[i]);
        this.exactCentroid = sum.scaleRational(1n, count);
        this.exactHalfways = verts.map((v, i) =>
            v.add(verts[(i + 1) % verts.length]).scaleRational(1n, 2n)
        );
        this.refreshFloatCache();
    }

    /** Recompute the float caches (vertices/halfways/centroid/anchor/dir/angle/sides/angles)
     *  from the exact source of truth. The float cache is never hand-edited. */
    refreshFloatCache = (): void => {
        if (!this.exactVertices) return;
        // invalidate memoized exact lookups — the exact vertices just changed
        this._exactKey = undefined;
        this._vertexKeySet = undefined;
        this._vertexKeyIndex = undefined;
        this.vertices = this.exactVertices.map((v) => v.toVector());
        this.halfways = this.exactHalfways
            ? this.exactHalfways.map((h) => h.toVector())
            : (this.calculateHalfways(), this.halfways);
        this.centroid = this.exactCentroid ? this.exactCentroid.toVector() : (this.calculateCentroid(), this.centroid);
        this.calculateSides();
        this.calculateAngles();
        this.anchor = this.vertices[0].copy();
        this.dir = Vector.sub(this.vertices[1], this.vertices[0]);
        this.calculateAngle();
    }

    /** Exact rotation by ζ^k around an exact origin (rotation by 2πk/N). Mutates + refreshes. */
    rotateZeta = (origin: Cyclotomic, k: number): Polygon => {
        if (!this.exactVertices || !this.ring) throw new Error("rotateZeta: no exact vertices");
        const N = this.ring.N;
        const rot = (z: Cyclotomic) => z.sub(origin).mulZeta(k).add(origin);
        this.exactVertices = this.exactVertices.map(rot);
        if (this.exactHalfways) this.exactHalfways = this.exactHalfways.map(rot);
        if (this.exactCentroid) this.exactCentroid = rot(this.exactCentroid);
        if (this.edgeDirs) this.edgeDirs = this.edgeDirs.map((d) => (((d + k) % N) + N) % N);
        this.refreshFloatCache();
        return this;
    }

    /** Exact translation by an exact vector. Mutates + refreshes. edgeDirs unchanged. */
    translateExact = (t: Cyclotomic): Polygon => {
        if (!this.exactVertices) throw new Error("translateExact: no exact vertices");
        this.exactVertices = this.exactVertices.map((v) => v.add(t));
        if (this.exactHalfways) this.exactHalfways = this.exactHalfways.map((h) => h.add(t));
        if (this.exactCentroid) this.exactCentroid = this.exactCentroid.add(t);
        this.refreshFloatCache();
        return this;
    }

    /**
     * Exact reflection across the line through `origin` at angle axisK·π/N. The reflection
     * z ↦ ζ^{axisK}·conj(z) (about the origin) preserves the N-grid, so edge directions stay
     * integers. Reverses vertex order (orientation flip) and recomputes edgeDirs. Mutates.
     */
    mirrorZeta = (origin: Cyclotomic, axisK: number): Polygon => {
        if (!this.exactVertices || !this.ring) throw new Error("mirrorZeta: no exact vertices");
        const refl = (z: Cyclotomic) => z.sub(origin).conj().mulZeta(axisK).add(origin);
        this.exactVertices = this.exactVertices.map(refl).reverse();
        if (this.exactHalfways) this.exactHalfways = this.exactHalfways.map(refl).reverse();
        if (this.exactCentroid) this.exactCentroid = refl(this.exactCentroid);
        this.recomputeEdgeDirsExact();
        this.refreshFloatCache();
        return this;
    }

    /**
     * Recompute integer edge directions exactly for unit-edge polygons: each edge vector
     * vᵢ₊₁ − vᵢ equals ζ^k for exactly one k (rigid isometries preserve unit edges). Found by
     * exact equality search over the ring's roots — no float, boundary-safe.
     */
    recomputeEdgeDirsExact = (): void => {
        if (!this.exactVertices || !this.ring) return;
        const ring = this.ring;
        const verts = this.exactVertices;
        const dirs: number[] = [];
        for (let i = 0; i < verts.length; i++) {
            const edge = verts[(i + 1) % verts.length].sub(verts[i]);
            // O(1) lookup of the unit-edge ζ-exponent instead of an O(N) bigint-equality scan.
            const k = ring.expFromZetaKey(edge.key());
            dirs.push(k === undefined ? -1 : k); // −1 if non-unit (irregular polygon, out of core scope)
        }
        this.edgeDirs = dirs;
    }

    /**
     * Interior angle at corner `i` (the vertex `exactVertices[i]`), in units of 2π/N (a full turn =
     * N; on the decisive N=24 path this is π/12 units, a full vertex = 24). Computed EXACTLY from
     * `edgeDirs` as the reflex-aware heading change, so it is correct for non-convex tiles: every
     * corner of a regular n-gon returns N(n−2)/(2n) (= 12(n−2)/n at N=24), while a star's point and
     * dent corners return their differing angles (e.g. 4*_{π/4}: point 3, dent 15). Replaces the
     * convex-only per-polygon `angleUnits(n) = 12(n−2)/n`. */
    cornerAngleUnits = (i: number): number => {
        if (!this.edgeDirs || !this.ring) throw new Error('cornerAngleUnits: no exact edge directions');
        const N = this.ring.N;
        const L = this.edgeDirs.length;
        const prev = (i - 1 + L) % L;
        // exterior turn at vertex i = (outgoing edge dir) − (incoming edge dir), in 2π/N steps.
        const ext = (((this.edgeDirs[i] - this.edgeDirs[prev]) % N) + N) % N;
        // interior = π − exterior = N/2 − ext (reflex-aware via mod N: a reflex dent wraps to >N/2).
        return (((N / 2 - ext) % N) + N) % N;
    };

    /** Token naming corner `i` for VC-name building: the bare edge-count `n` for a regular tile (so the
     *  regular VC alphabet stays BYTE-IDENTICAL), or a point/dent-tagged token for a star corner —
     *  distinct α and point-vs-reflex-dent give distinct tokens (4*_{π/4}: point "4*p@3", dent "4*d@15").
     *  The allowed-VC set and the tested vertices MUST name through this single function or they silently
     *  fail to match. */
    cornerToken = (i: number): string => {
        if (!this.isStar) return String(this.n);
        const u = this.cornerAngleUnits(i);
        const straight = (this.ring?.N ?? 24) / 2; // π in 2π/N units; reflex (dent) ⇒ u > straight
        return `${this.n}*${u > straight ? 'd' : 'p'}@${u}`;
    };

    /** Empty same-subclass instance (no vertices). Used by `transformedRigid` to build a fresh
     *  polygon without the eager float rebuild that `clone()` triggers. Abstract. */
    makeEmptyLike = (): Polygon => {
        throw new Error('Abstract method called');
    }

    /** Like `refreshFloatCache` but only the fields the collision/broadphase path reads
     *  (vertices, halfways, centroid). Skips sides/angles/anchor/dir/angle — none are read in the
     *  expansion or in `RegularPolygon.encode` (exact anchor+dir). Clears the memoized exact keys. */
    refreshFloatCacheLite = (): void => {
        if (!this.exactVertices) return;
        this._exactKey = undefined;
        this._vertexKeySet = undefined;
        this._vertexKeyIndex = undefined;
        this.vertices = this.exactVertices.map((v) => v.toVector());
        if (this.exactHalfways) this.halfways = this.exactHalfways.map((h) => h.toVector());
        if (this.exactCentroid) this.centroid = this.exactCentroid.toVector();
    }

    /**
     * Hot-path fused rigid isometry → a NEW transformed polygon, replacing
     * `clone()`+`mirrorZeta()`+`rotateZeta()`+`translateExact()` (which each rebuild the float
     * cache — up to 4× redundant trig per polygon). The isometry is, about `origin`:
     * optional reflection conj∘ζ^axisK, then rotation ζ^rotK, then `+translation`. Composed once:
     *   reflect → conj(z−o)·ζ^{axisK+rotK} + o + t ;   else → (z−o)·ζ^{rotK} + o + t.
     *
     * `mode`:
     *  - `'exact'` — sets only exact vertices/halfways/centroid and clears memo keys. NO float
     *    rebuild, NO edgeDirs, NO vertex reversal. For the exact-only alignment test, which reads
     *    only `exactKey()` (order-independent) and `vertices.length` (transform-invariant).
     *  - `'full'` — reverses vertices on reflect (restores CCW for the float overlap test),
     *    recomputes integer `edgeDirs` (O(n)), and does ONE lite float refresh. For the collision
     *    broadphase and for polygons that enter the patch.
     */
    transformedRigid = (
        origin: Cyclotomic,
        reflect: boolean,
        axisK: number,
        rotK: number,
        translation: Cyclotomic,
        mode: 'exact' | 'full'
    ): Polygon => {
        if (!this.exactVertices || !this.exactCentroid || !this.ring) {
            throw new Error('transformedRigid: no exact vertices');
        }
        const N = this.ring.N;
        const rk = (((rotK % N) + N) % N);
        const ak = ((((axisK + rotK) % N) + N) % N);
        const map = (z: Cyclotomic): Cyclotomic => {
            const d = z.sub(origin);
            const r = reflect ? d.conj().mulZeta(ak) : d.mulZeta(rk);
            return r.add(origin).add(translation);
        };

        const out = this.makeEmptyLike();
        out.ring = this.ring;
        let verts = this.exactVertices.map(map);
        let halfways = this.exactHalfways ? this.exactHalfways.map(map) : undefined;
        const centroid = map(this.exactCentroid);

        if (mode === 'full' && reflect) {
            verts = verts.reverse();
            if (halfways) halfways = halfways.reverse();
        }

        out.exactVertices = verts;
        out.exactHalfways = halfways;
        out.exactCentroid = centroid;
        out._exactKey = undefined;
        out._vertexKeySet = undefined;
        out._vertexKeyIndex = undefined;

        if (mode === 'full') {
            out.recomputeEdgeDirsExact();
            out.refreshFloatCacheLite();
        } else {
            // exact mode: float vertices are not rebuilt; only their COUNT is read (by isEquivalent's
            // length guard), and the count is transform-invariant — so reuse the source array.
            out.vertices = this.vertices;
        }
        return out;
    }

    rotate = (origin: Vector, angle: number): Polygon => {
        this.centroid = Vector.add(origin, Vector.sub(this.centroid, origin).rotate(angle));
        this.angle = (this.angle + angle) % (Math.PI * 2);

        for (let i = 0; i < this.vertices.length; i++) {
            this.vertices[i] = Vector.add(origin, Vector.sub(this.vertices[i], origin).rotate(angle));
        }
        for (let i = 0; i < this.halfways.length; i++) {
            this.halfways[i] = Vector.add(origin, Vector.sub(this.halfways[i], origin).rotate(angle));
        }

        return this;
    }

    translate = (vector: Vector): Polygon => {
        this.centroid.add(vector);
        for (let i = 0; i < this.vertices.length; i++) {
            this.vertices[i] = Vector.add(this.vertices[i], vector);
        }
        for (let i = 0; i < this.halfways.length; i++) {
            this.halfways[i] = Vector.add(this.halfways[i], vector);
        }

        return this;
    }

    mirror = (point: Vector, dir: Vector): Polygon => {
        this.angle = (2 * dir.heading() - this.angle + 2 * Math.PI) % (2 * Math.PI);
        
        this.centroid.mirrorByPointAndDir(point.copy(), dir.copy());
        
        for (let i = 0; i < this.vertices.length; i++) {
            this.vertices[i].mirrorByPointAndDir(point.copy(), dir.copy());
        }
        this.vertices.reverse();

        for (let i = 0; i < this.halfways.length; i++) {
            this.halfways[i].mirrorByPointAndDir(point.copy(), dir.copy());
        }
        this.halfways.reverse();

        return this;
    }

    /**
     * @param point - the point of the reflection
     * @param dir - the direction of the reflection axis
     * @param delta - the amount it translates in the same direction as the reflection axis
     * @returns the polygon after the glide
     * @description A glide is a reflection followed by a translation in the same direction to the reflection axis
     */
    glide = (point: Vector, dir: Vector, delta: number): Polygon => {
        dir = dir.normalize();

        // first apply the reflection
        this.mirror(point, dir);

        // then translate in the same direction as the reflection axis
        this.translate(Vector.scale(dir, delta));

        return this;
    }

    containsPoint = (point: Vector, tol: number = tolerance): boolean => {
        return isWithinConvexHull(this.vertices, point, tol);
    }

    intersects = (other: Polygon, tol: number = tolerance): boolean => {
        // Star-gated EXACT proper-overlap: the float path below leans on `containsPoint`/
        // `isWithinConvexHull`, a CONVEX-hull point test that misclassifies points in a star's reflex
        // dents (NOTES §9.4). When either tile is a star (and both carry exact vertices), decide overlap
        // exactly in ℤ[ζ₂₄] (sign-only, no intersection coords). Convex×convex keeps the float path, so
        // the regular decisive path is byte-identical; the exact predicate is validated to AGREE with this
        // float one on convex pairs (tests/exact-overlap.test.ts).
        if ((this.isStar || other.isStar) && this.exactVertices && other.exactVertices) {
            return exactPolygonsOverlap(this.exactVertices, other.exactVertices);
        }
        if (this.containsPoint(other.centroid, tol)) return true;
        if (other.containsPoint(this.centroid, tol)) return true;

        for (let i = 0; i < this.vertices.length; i++) {
            if (other.containsPoint(this.vertices[i], tol)) return true;
            if (other.containsPoint(this.halfways[i], tol)) return true;
        }

        for (let i = 0; i < other.vertices.length; i++) {
            if (this.containsPoint(other.vertices[i], tol)) return true;
            if (this.containsPoint(other.halfways[i], tol)) return true;
        }

        for (let i = 0; i < this.vertices.length; i++) {
            const p1 = this.vertices[i];
            const p2 = this.vertices[(i + 1) % this.vertices.length];
            for (let j = 0; j < other.vertices.length; j++) {
                const p3 = other.vertices[j];
                const p4 = other.vertices[(j + 1) % other.vertices.length];
                if (segmentsIntersect(p1, p2, p3, p4, tol)) return true;
            }
        }

        return false;
    }

    getAngleAtVertex = (vertex: Vector): number => {
        return getAngleAtVertex(this.vertices, vertex);
    }

    show = (ctx, showPolygonPoints, customColor = null, opacity = 0.80) => {
        if (this.centroid.x < -ctx.width / 2 - 10 || this.centroid.y < -ctx.height / 2 - 10 || this.centroid.x > ctx.width / 2 + 10 || this.centroid.y > ctx.height / 2 + 10)
            return;

        ctx.push();

        // this.calculateHue();
        
        const cfg = useConfiguration.getState();
        const lineWidthValue = cfg.lineWidth;
        if (lineWidthValue <= 0) {
            ctx.noStroke();
        } else {
            ctx.strokeWeight(lineWidthValue / cfg.controls.zoom);
            // Outline-only tiles on a dark canvas need a light stroke to be visible; a colored fill
            // (or a light theme) reads best with the dark stroke. HSB: (0,0,100)=white, (0,0,0)=black.
            const lightStroke = !cfg.showPolygonFill && document.documentElement.classList.contains("dark");
            ctx.stroke(0, 0, lightStroke ? 100 : 0, opacity);
        }

        if (cfg.isIslamic) {
            // Islamic line mode: dim base tile + thick construction lines (no fill). The tiling path
            // (Tiling.show) draws these in two ordered passes; this keeps a lone node.show consistent.
            this.showIslamicDimBase(ctx, opacity);
            this.showIslamicLines(ctx, opacity);
        } else {
            if (cfg.showPolygonFill) {
                ctx.fill(customColor || this.hue, 40, 100 / opacity, 0.80 * opacity);
            } else {
                ctx.noFill();
            }
            ctx.beginShape();
            for (let i = 0; i < this.vertices.length; i++) {
                ctx.vertex(this.vertices[i].x, this.vertices[i].y);
            }
            ctx.endShape(ctx.CLOSE);
        }

        if (showPolygonPoints) {
            ctx.fill(0, 100, 100);
            ctx.ellipse(this.centroid.x, this.centroid.y, 5 / useConfiguration.getState().controls.zoom);
            
            ctx.fill(120, 100, 100);
            for (let i = 0; i < this.halfways.length; i++) {
                ctx.ellipse(this.halfways[i].x, this.halfways[i].y, 5 / useConfiguration.getState().controls.zoom);
            }
            
            ctx.fill(240, 100, 100);
            for (let i = 0; i < this.vertices.length; i++) {
                ctx.ellipse(this.vertices[i].x, this.vertices[i].y, 5 / useConfiguration.getState().controls.zoom);
            }
        }

        ctx.pop();
    }

    calculateIslamicTips = (angle: number | number[]): Vector[] => {
        const tips: Vector[] = [];
        const beta = Math.PI / this.n;
        const gamma = Math.PI / 2 - beta;
        const side = 0.5;
        for (let i = 0; i < this.halfways.length; i++) {
            const a = Array.isArray(angle) ? angle[i] : angle;
            const epsilon = Math.PI - beta - a / 2;
            const dist = side * Math.tan(gamma) * Math.sin(beta) / Math.sin(epsilon);
            const perp = Vector.sub(this.centroid, this.halfways[i]);
            const dir2 = Vector.rotate(perp, -a / 2).normalize();
            tips.push(new Vector(
                this.halfways[i].x + dir2.x * dist,
                this.halfways[i].y + dir2.y * dist,
            ));
        }
        return tips;
    }

    /**
     * Correct, shape-agnostic Islamic/Hankin line construction (replaces `calculateIslamicTips`, which
     * assumed a regular convex n-gon). For each edge, two rays leave the edge midpoint at ±theta from
     * the TRUE inward edge-normal; each ray stops at its nearest forward intersection with any OTHER
     * ray of the tile. Returns one `[midpoint, endpoint]` segment per ray (2·edges total). Works for
     * non-convex star tiles, where the old closed form put tips outside the tile.
     *
     * `theta` is measured from the inward normal: 0 ⇒ along the normal (all meetings collapse to the
     * centroid), π/2 ⇒ along the edge. Accepts a per-edge array (animated angle) or a scalar.
     */
    calculateIslamicSegments = (angle: number | number[]): [Vector, Vector][] => {
        const nEdges = this.halfways.length;
        const eps = 1e-9;
        // Two inward rays per edge, at ±theta from the true inward edge-normal.
        const origins: Vector[] = [];
        const dirs: Vector[] = [];
        const edgeOf: number[] = [];
        for (let i = 0; i < nEdges; i++) {
            const v0 = this.vertices[i];
            const v1 = this.vertices[(i + 1) % nEdges];
            const edge = Vector.sub(v1, v0);
            // Rotate the edge +90° to a candidate normal, then flip it to the centroid side — the true
            // interior side for any tile star-shaped about its centroid (regular stars always are).
            let nrm = new Vector(-edge.y, edge.x).normalize();
            if (nrm.dot(Vector.sub(this.centroid, this.halfways[i])) < 0) nrm = nrm.scale(-1);
            const a = Array.isArray(angle) ? angle[i] : angle;
            origins.push(this.halfways[i], this.halfways[i]);
            dirs.push(Vector.rotate(nrm, a), Vector.rotate(nrm, -a));
            edgeOf.push(i, i);
        }
        const R = dirs.length;

        // Growing-line simulation. Every ray grows at unit speed from its midpoint and stops the instant
        // its tip touches ANOTHER ray's already-drawn body. This is the closure-correct reading of "stop
        // at the first intersection": a bare nearest-crossing stops a ray on the partner's DISCARDED tail
        // (the partner reaches that point only AFTER it has itself terminated), which leaves visible gaps.
        // Build one arrival event per (ray, crossing) and resolve them in time order.
        type Arrival = { time: number; ray: number; partner: number; partnerTime: number };
        const arrivals: Arrival[] = [];
        for (let i = 0; i < R; i++) {
            for (let j = i + 1; j < R; j++) {
                if (edgeOf[i] === edgeOf[j]) continue; // siblings share the origin
                const denom = Vector.cross(dirs[i], dirs[j]);
                if (Math.abs(denom) < eps) continue; // parallel
                const diff = Vector.sub(origins[j], origins[i]);
                const ti = Vector.cross(diff, dirs[j]) / denom;
                const tj = Vector.cross(diff, dirs[i]) / denom;
                if (ti <= eps || tj <= eps) continue; // both rays must reach it going forward
                arrivals.push({ time: ti, ray: i, partner: j, partnerTime: tj });
                arrivals.push({ time: tj, ray: j, partner: i, partnerTime: ti });
            }
        }
        arrivals.sort((a, b) => a.time - b.time);

        const stop = new Array<number>(R).fill(Infinity);
        for (const ev of arrivals) {
            if (stop[ev.ray] <= ev.time + eps) continue; // this ray already terminated at/before here
            // The partner's body covers the crossing iff the partner reached it no later than we did
            // (partnerTime ≤ time) and was still alive there (it did not stop before partnerTime).
            if (ev.partnerTime <= ev.time + eps && stop[ev.partner] >= ev.partnerTime - eps) {
                stop[ev.ray] = ev.time;
            }
        }

        const segments: [Vector, Vector][] = [];
        for (let i = 0; i < R; i++) {
            if (!isFinite(stop[i])) {
                // No partner body ever caught this ray. Impossible for a regular star (D_n symmetry
                // guarantees a mate); a general non-convex tile could reach here. Never drop silently.
                console.warn(`calculateIslamicSegments: a ray from edge ${edgeOf[i]} of ${this.name} found no partner`);
                continue;
            }
            segments.push([origins[i], Vector.add(origins[i], Vector.scale(dirs[i], stop[i]))]);
        }
        return segments;
    }

    /**
     * Typed marker points for the Islamic star fill: the centroid (always), plus for star tiles one
     * dent marker per reflex vertex (nudged toward the centroid so it never sits on a construction line)
     * and one tip marker per convex vertex (intersection of the two adjacent inward edge-normals). A
     * regular tile's tips collapse onto the centroid, so it emits the centroid only.
     */
    islamicMarkers = (): Marker[] => {
        const markers: Marker[] = [{ point: this.centroid.copy(), kind: "centroid" }];
        if (!this.isStar) return markers;
        const n = this.vertices.length;
        const winding = this.vertices.reduce((a, v, i) => {
            const w = this.vertices[(i + 1) % n];
            return a + (v.x * w.y - w.x * v.y);
        }, 0) >= 0 ? 1 : -1;
        const inwardNormal = (e: number): Vector => {
            const ev = Vector.sub(this.vertices[(e + 1) % n], this.vertices[e]);
            let nrm = new Vector(-ev.y, ev.x).normalize();
            if (nrm.dot(Vector.sub(this.centroid, this.halfways[e])) < 0) nrm = nrm.scale(-1);
            return nrm;
        };
        for (let k = 0; k < n; k++) {
            const prev = this.vertices[(k - 1 + n) % n];
            const cur = this.vertices[k];
            const next = this.vertices[(k + 1) % n];
            const cross = (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x);
            const convex = cross * winding > 0;
            if (convex) {
                const tp = tipPoint(this.halfways[(k - 1 + n) % n], inwardNormal((k - 1 + n) % n), this.halfways[k], inwardNormal(k));
                if (tp) markers.push({ point: tp, kind: "tip" });
            } else {
                const toC = Vector.sub(this.centroid, cur);
                markers.push({ point: Vector.add(cur, Vector.scale(toC, 0.05)), kind: "dent" });
            }
        }
        return markers;
    }

    private offScreen = (ctx): boolean =>
        this.centroid.x < -ctx.width / 2 - 10 || this.centroid.y < -ctx.height / 2 - 10 ||
        this.centroid.x > ctx.width / 2 + 10 || this.centroid.y > ctx.height / 2 + 10;

    /** Pass 1 of the Islamic line mode: the base tile drawn faint, so the construction lines dominate. */
    showIslamicDimBase = (ctx, opacity: number = 0.80): void => {
        if (this.offScreen(ctx)) return;
        const zoom = useConfiguration.getState().controls.zoom;
        ctx.push();
        ctx.strokeWeight(1 / zoom);
        ctx.stroke(0, 0, 0, 0.22 * opacity);              // faint outline
        ctx.fill(this.hue, 40, 100 / opacity, 0.22 * opacity); // dim fill
        ctx.beginShape();
        for (let i = 0; i < this.vertices.length; i++) ctx.vertex(this.vertices[i].x, this.vertices[i].y);
        ctx.endShape(ctx.CLOSE);
        ctx.pop();
    }

    /** Pass 2 of the Islamic line mode: the Hankin ray construction as thick lines, no fill. */
    showIslamicLines = (ctx, opacity: number = 1): void => {
        if (this.offScreen(ctx) || !this.vertices || !this.halfways) return;
        const cfg = useConfiguration.getState();
        const zoom = cfg.controls.zoom;
        let angle: number | number[] = Math.min(Math.max(cfg.islamicAngle, 0), 90) * Math.PI / 180;
        if (cfg.islamicAnimate) angle = islamicAnglesForHalfways(ctx, this.halfways);
        const segments = this.calculateIslamicSegments(angle);
        ctx.push();
        ctx.noFill();
        ctx.strokeWeight(Math.max(cfg.lineWidth, 1) * 2.5 / zoom); // slightly thicker than the base
        ctx.stroke(0, 0, 100, opacity);                            // white — pops on the dark canvas
        for (const [from, to] of segments) ctx.line(from.x, from.y, to.x, to.y);
        ctx.pop();
    }

    showIslamicFilled = (ctx, opacity: number = 0.80, customColor: number | null = null) => {
        const cfg = useConfiguration.getState();
        const baseAngle = cfg.islamicAngle * Math.PI / 180;
        let angle: number | number[] = baseAngle;
        if (cfg.islamicAnimate) {
            angle = islamicAnglesForHalfways(ctx, this.halfways);
        }
        const tips = this.calculateIslamicTips(angle);

        ctx.push();
        ctx.noStroke();
        ctx.fill(customColor ?? this.hue, 40, 100 / opacity, 0.80 * opacity);
        ctx.beginShape();
        for (let i = 0; i < this.halfways.length; i++) {
            ctx.vertex(this.halfways[i].x, this.halfways[i].y);
            ctx.vertex(tips[i].x, tips[i].y);
        }
        ctx.endShape(ctx.CLOSE);
        ctx.pop();

        ctx.noFill();
        ctx.strokeWeight(useConfiguration.getState().lineWidth / useConfiguration.getState().controls.zoom);
        ctx.stroke(0, 0, 0);
        for (let i = 0; i < this.halfways.length; i++) {
            const h = this.halfways[i];
            const tipA = tips[i];
            const tipB = tips[(i - 1 + this.halfways.length) % this.halfways.length];
            ctx.line(h.x, h.y, tipA.x, tipA.y);
            ctx.line(h.x, h.y, tipB.x, tipB.y);
        }
    }

    getName = (coordinate: Vector | null = null): string => {
        throw new Error('Abstract method called');
    }

    // Memoized exact lookups. Patch polygons are immutable after creation (exact transforms
    // produce NEW polygons), so caching is safe and removes hot bigint work in the expander.
    private _exactKey?: string;
    private _vertexKeySet?: Set<string>;
    private _vertexKeyIndex?: Map<string, number>;

    /**
     * Canonical exact key: identity of the placed polygon (name + exact centroid + the
     * sorted set of exact vertex keys). Two placements are the same polygon iff equal keys.
     * Requires exact vertices. Memoized.
     */
    exactKey = (): string => {
        if (this._exactKey !== undefined) return this._exactKey;
        if (!this.exactVertices || !this.exactCentroid) throw new Error("exactKey: no exact vertices");
        const vk = this.exactVertices.map((v) => v.key()).sort().join(";");
        this._exactKey = `${this.getName()}:${this.exactCentroid.key()}:${vk}`;
        return this._exactKey;
    }

    /** Memoized set of exact vertex keys (fast `has(v.key())` instead of O(n) bigint equals). */
    vertexKeySet = (): Set<string> => {
        if (this._vertexKeySet) return this._vertexKeySet;
        this._vertexKeySet = new Set(this.exactVertices!.map((v) => v.key()));
        return this._vertexKeySet;
    }

    /** Memoized map exact-vertex-key → index (fast index lookup instead of O(n) bigint equals). */
    vertexKeyIndex = (): Map<string, number> => {
        if (this._vertexKeyIndex) return this._vertexKeyIndex;
        const m = new Map<string, number>();
        this.exactVertices!.forEach((v, i) => m.set(v.key(), i));
        this._vertexKeyIndex = m;
        return m;
    }

    isEquivalent = (other: Polygon, tol: number = tolerance): boolean => {
        if (this.vertices.length !== other.vertices.length) return false;

        // Exact path: identical iff same exact key (name + centroid + sorted vertex set). No ε.
        if (this.exactVertices && other.exactVertices) {
            return this.exactKey() === other.exactKey();
        }

        if (!isWithinTolerance(this.centroid, other.centroid, tol)) return false;

        for (let vertex of this.vertices) {
            if (!other.vertices.some(v => isWithinTolerance(v, vertex, tol))) return false;
        }

        for (let halfway of this.halfways) {
            if (!other.halfways.some(h => isWithinTolerance(h, halfway, tol))) return false;
        }
        return true;
    }

    isTranslated = (other: Polygon, tol: number = tolerance): boolean => {
        const translationVector: Vector = Vector.sub(other.centroid, this.centroid);
        if (translationVector.mag() < tol) return false;
        const translatedPolygon: Polygon = this.clone().translate(translationVector);
        return translatedPolygon.isEquivalent(other, tol);
    }

    clone = (): Polygon => {
        throw new Error('Abstract method called');
    }

    calculateVerticesFromCentroidAndAngle = (): void => {
        throw new Error('Abstract method called');
    }

    encode = (): Object => {
        throw new Error('Abstract method called');
    }
}