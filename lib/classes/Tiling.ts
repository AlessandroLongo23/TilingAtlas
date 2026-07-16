import { type Polygon, Vector, type Gyration, type Reflection, type GlideReflection } from '@/classes';
import type { VertexConfiguration } from '@/classes/algorithm/VertexConfiguration';
import { islamicAnglesForHalfways, islamicTipsAngleFromSlider } from '@/utils/islamicNoise';
import { tolerance } from "@/utils/tolerance";
import { WAVE_MIN_SCALE } from "@/lib/utils/tilingTransition";
import { useConfiguration } from "@/stores/configuration";
import { sortPointsByAngleAndDistance, isWithinTolerance, deduplicatePolygons, vertexFigureHue } from '@/utils';
import { extractFaces, colorFacesByMarkerThenTile, type TileLite, type TileColoredFace, type Marker, type Segment } from "@/utils/islamicArrangement";
import { orbitColor } from "@/lib/utils/orbitColors";

export type VCWithOccurrences = { vc: VertexConfiguration; occurrences: number };

export class Tiling {
    nodes: Polygon[];
    anchorNodes: Polygon[];
    vcs: VCWithOccurrences[] = [];
    newLayerNodes: Polygon[];
    seedNodes: Polygon[];
    coreNode: Polygon | null;

    // Largest tile circumradius (centroid→vertex, world units), set by the play-mode grid builder.
    // Used as the draw-time off-screen cull margin so a tile that clips the viewport is never dropped.
    maxRadius?: number;

    // tiling check
    translationalCellBasis: [Vector, Vector] | null = null;
    originPolygon: Polygon | null = null;
    gyrations: Gyration[] | null = null;
    reflections: Reflection[] | null = null;
    glideReflections: GlideReflection[] | null = null;

    // Cached Islamic star-fill: the colored arrangement cells + the raw construction segments (for the
    // border lines), recomputed only when the tiling's node set or the angle changes, not per frame.
    private islamicFillCache?: { nodesRef: Polygon[]; theta: number; colored: TileColoredFace[]; segments: Segment[] };

    constructor() {
        this.nodes = [];
        this.anchorNodes = [];

        this.newLayerNodes = [];
        this.seedNodes = [];
        this.coreNode = null;
    }

    show = (
        ctx,
        showPolygonPoints: boolean,
        opacity: number = 1,
        circlePacking: boolean = false,
        cull?: (c: Vector) => boolean,
        scaleOf?: (c: Vector) => number,
        skipFill: boolean = false,
    ): void => {
        // Read config ONCE per draw, not once per tile. The plain path below used to delegate to
        // Polygon.show, which re-read Zustand state AND queried the DOM ("dark" class) for every tile
        // every frame — the dominant cost at zoomed-out tile counts. Stroke is uniform across tiles, so
        // set it once here; only the per-tile fill (hue) varies inside the loop. `cull`, when given,
        // skips tiles outside the viewport (see makeVisibilityCull in canvas.tsx). `scaleOf`, when given,
        // shrinks each tile toward its own centroid (see makeWaveScale) — the selection transition.
        const cfg = useConfiguration.getState();
        const zoom = cfg.controls.zoom;
        const lineWidthValue = cfg.lineWidth;
        if (lineWidthValue <= 0) {
            ctx.noStroke();
        } else {
            ctx.strokeWeight(lineWidthValue / zoom);
            // White stroke only when tiles are outline-only on a dark theme; dark otherwise (HSB bright).
            const useLightStroke = !cfg.showPolygonFill && document.documentElement.classList.contains("dark");
            ctx.stroke(0, 0, useLightStroke ? 100 : 0, opacity);
        }

        if (circlePacking) {
            for (let i = 0; i < this.nodes.length; i++) {
                const node = this.nodes[i];
                if (cull && !cull(node.centroid)) continue;
                const s = scaleOf ? scaleOf(node.centroid) : 1;
                if (s < WAVE_MIN_SCALE) continue;
                const radius = node.halfways?.length > 0
                    ? Vector.distance(node.centroid, node.halfways[0]) * s
                    : 0;
                if (radius > 0) {
                    ctx.fill(node.hue, 40, 100 / opacity, 1.0 * opacity);
                    ctx.ellipse(node.centroid.x, node.centroid.y, radius * 2, radius * 2);
                }
            }
        } else if (cfg.isIslamic) {
            if (this.nodes.some((n) => n.isStar)) {
                // Star tiling: fill each arrangement cell with its source tile's colour, then the black
                // construction lines as cell borders. No base underneath (redundant and costly). Cells
                // span tiles (dent triangles form where a star's rays meet a neighbour's at the shared
                // edge), so the fill works over the whole tiling's arrangement, not per tile — hence the
                // whole-tiling arrangement is (deliberately) NOT viewport-culled.
                this.drawIslamicStarFill(ctx, opacity);
            } else {
                // Dentless tiling: keep the previous regular Islamic fill.
                this.drawIslamicVertexRegions(ctx, opacity);
                for (const node of this.nodes) node.showIslamicFilled(ctx, opacity);
            }
        } else {
            // Hot path: inline fill + shape, reusing the stroke set once above. No push/pop, no per-tile
            // getState, no DOM read — the fill (hue) is the only thing that varies per tile.
            const showFill = cfg.showPolygonFill;
            const fillV = 100 / opacity;
            // Tiles are painted OPAQUE: at α<1 the near-black surface bleeds through and drops every fill's
            // perceived lightness by ~0.13 (that is the whole reason the inversive view looked brighter —
            // its shader writes alpha 1). `opacity` still multiplies, so the layer fade-in is unaffected.
            const fillA = 1.0 * opacity;
            if (!skipFill) {
                for (let i = 0; i < this.nodes.length; i++) {
                    const node = this.nodes[i];
                    if (cull && !cull(node.centroid)) continue;
                    // Selection transition: the tile is drawn scaled about its own centroid. s === 1 is the
                    // normal path (no per-vertex arithmetic); below WAVE_MIN_SCALE it has collapsed to a point
                    // and is dropped, so it doesn't linger as a dot of stroke.
                    const s = scaleOf ? scaleOf(node.centroid) : 1;
                    if (s < WAVE_MIN_SCALE) continue;
                    if (showFill) ctx.fill(node.hue, 40, fillV, fillA);
                    else ctx.noFill();
                    const vs = node.vertices;
                    ctx.beginShape();
                    if (s >= 1) {
                        for (let k = 0; k < vs.length; k++) ctx.vertex(vs[k].x, vs[k].y);
                    } else {
                        const cx = node.centroid.x, cy = node.centroid.y;
                        for (let k = 0; k < vs.length; k++) {
                            ctx.vertex(cx + (vs[k].x - cx) * s, cy + (vs[k].y - cy) * s);
                        }
                    }
                    ctx.endShape(ctx.CLOSE);
                }
            }
            // Points sit on the untransformed outline, so they'd float off a scaled tile — hide them for
            // the duration of a transition.
            if (showPolygonPoints && !scaleOf) {
                const r = 5 / zoom;
                // Always a black border, independent of the tile line-stroke setting (push/pop so it does
                // not leak into later draws — this is off the hot path, only when points are shown).
                ctx.push();
                ctx.stroke(0, 0, 0);
                ctx.strokeWeight(1 / zoom);
                for (let i = 0; i < this.nodes.length; i++) {
                    const node = this.nodes[i];
                    if (cull && !cull(node.centroid)) continue;
                    ctx.fill(0, 100, 100);
                    ctx.ellipse(node.centroid.x, node.centroid.y, r);
                    ctx.fill(120, 100, 100);
                    for (const h of node.halfways) ctx.ellipse(h.x, h.y, r);
                    ctx.fill(240, 100, 100);
                    for (const v of node.vertices) ctx.ellipse(v.x, v.y, r);
                }
                ctx.pop();
            }
        }

        const showDualConnectionsValue = cfg.showDualConnections;
        if (showDualConnectionsValue)
            this.drawDualConnections(ctx);
    }

    /** Vertex-orbit overlay: one filled dot per tiling vertex, colored by its orbit id
     *  (node.orbitOfCorner) with an equidistant hue among `k` orbits, at the tile-default S/B, and a
     *  black outline. Constant on-screen size (world radius / zoom). Nodes with no orbit data fall back
     *  to a single color (orbit 0 of k=1). Drawn inside the world transform, on top of the tiles; the
     *  caller suppresses it during the selection transition and in Islamic mode. */
    drawVertexOrbits = (ctx, k: number, cull?: (c: Vector) => boolean): void => {
        const cfg = useConfiguration.getState();
        const zoom = cfg.controls.zoom;
        const diameter = 8 / zoom;
        ctx.strokeWeight(1.5 / zoom);
        ctx.stroke(0, 0, 0); // always a black outline
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            if (cull && !cull(node.centroid)) continue;
            const oc = node.orbitOfCorner;
            const vs = node.vertices;
            for (let c = 0; c < vs.length; c++) {
                const o = oc ? oc[c] : 0; // no orbit data → single color (orbit 0)
                if (o < 0) continue; // corner is not a tiling vertex (e.g. star dent-fill)
                const col = orbitColor(o, k);
                ctx.fill(col.h, col.s, col.b);
                ctx.ellipse(vs[c].x, vs[c].y, diameter, diameter);
            }
        }
    }

    /** Star-tiling Islamic fill: color each cell of the whole-tiling construction arrangement by the
     *  source tile that contains it, then draw the construction lines as black cell borders. Cached
     *  per (node set, angle) — a static view just redraws the cache, so panning stays smooth. */
    drawIslamicStarFill = (ctx, opacity: number = 1): void => {
        const cfg = useConfiguration.getState();
        const theta = Math.min(Math.max(cfg.islamicAngle, 0), 90);
        const cache = this.islamicFillCache;
        // Animated mode re-picks the per-edge angle every frame, so it can't be cached.
        const fresh = cache && !cfg.islamicAnimate && cache.nodesRef === this.nodes && cache.theta === theta;
        if (!fresh) {
            const angle = (theta * Math.PI) / 180;
            const segments: Segment[] = [];
            const tiles: TileLite[] = [];
            const markers: Marker[] = [];
            for (const node of this.nodes) {
                if (!node.vertices || !node.halfways) continue;
                const a: number | number[] = cfg.islamicAnimate ? islamicAnglesForHalfways(ctx, node.halfways) : angle;
                for (const s of node.calculateIslamicSegments(a)) segments.push(s);
                tiles.push({ vertices: node.vertices, hue: node.hue });
                for (const m of node.islamicMarkers()) markers.push(m);
            }
            const colored = colorFacesByMarkerThenTile(extractFaces(segments), markers, tiles);
            this.islamicFillCache = { nodesRef: this.nodes, theta, colored, segments };
        }
        const { colored, segments } = this.islamicFillCache!;

        // Colored cells, using the same fill params as the plain tiling so 90° is pixel-identical.
        ctx.push();
        ctx.noStroke();
        for (const { face, hue } of colored) {
            ctx.fill(hue, 40, 100 / opacity, 1.0 * opacity);
            ctx.beginShape();
            for (const v of face.vertices) ctx.vertex(v.x, v.y);
            ctx.endShape(ctx.CLOSE);
        }
        ctx.pop();

        // Construction lines as cell borders: black, following the Line-stroke slider width.
        const lw = cfg.lineWidth;
        if (lw > 0) {
            ctx.push();
            ctx.noFill();
            ctx.strokeWeight(lw / cfg.controls.zoom);
            ctx.stroke(0, 0, 0);
            for (const [from, to] of segments) ctx.line(from.x, from.y, to.x, to.y);
            ctx.pop();
        }
    }

    showGraph = (ctx): void => {
        this.show(ctx, false, 0.5);

        const zoom = useConfiguration.getState().controls.zoom;
        ctx.push();
        ctx.stroke(0, 0, 100);
        ctx.strokeWeight(2 / zoom);

        const seen = new Set<string>();
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            for (const neighbor of node.neighbors ?? []) {
                const j = this.nodes.indexOf(neighbor);
                if (j < 0) continue;
                const key = i < j ? `${i}-${j}` : `${j}-${i}`;
                if (seen.has(key)) continue;
                seen.add(key);
                ctx.line(
                    node.centroid.x,
                    node.centroid.y,
                    neighbor.centroid.x,
                    neighbor.centroid.y
                );
            }
        }

        ctx.noStroke();
        ctx.fill(0, 0, 100);
        const r = 4 / zoom;
        for (const node of this.nodes) {
            ctx.ellipse(node.centroid.x, node.centroid.y, r, r);
        }
        ctx.pop();
    }

    drawConstructionPoints = (ctx): void => {
        let uniqueCentroids: Vector[] = [];
        for (let anchorNode of this.anchorNodes)
            if (!uniqueCentroids.some(c => isWithinTolerance(c, anchorNode.centroid)))
                uniqueCentroids.push(anchorNode.centroid);
        let uniqueCentroidsSorted = sortPointsByAngleAndDistance(uniqueCentroids);
        uniqueCentroidsSorted = uniqueCentroidsSorted.filter(centroid => !isWithinTolerance(centroid, new Vector()));

        let uniqueHalfways: Vector[] = [];
        for (let anchorNode of this.anchorNodes)
            for (let halfway of anchorNode.halfways)
                if (!uniqueHalfways.some(h => isWithinTolerance(h, halfway)))
                    uniqueHalfways.push(halfway);
        let uniqueHalfwaysSorted = sortPointsByAngleAndDistance(uniqueHalfways);

        let uniqueVertices: Vector[] = [];
        for (let anchorNode of this.anchorNodes)
            for (let vertex of anchorNode.vertices)
                if (!uniqueVertices.some(v => isWithinTolerance(v, vertex)))
                    uniqueVertices.push(vertex);
        let uniqueVerticesSorted = sortPointsByAngleAndDistance(uniqueVertices);


        let offset = new Vector(6 / useConfiguration.getState().controls.zoom, 0 / useConfiguration.getState().controls.zoom)
        let pointSize = 6 / useConfiguration.getState().controls.zoom

        ctx.scale(1, -1);
        ctx.textSize(18 / useConfiguration.getState().controls.zoom);
        ctx.fill(0, 0, 100);
        ctx.stroke(0, 0, 0);

        ctx.strokeWeight(1 / useConfiguration.getState().controls.zoom);

        for (let i in uniqueCentroidsSorted)
            ctx.ellipse(uniqueCentroidsSorted[i].x, -uniqueCentroidsSorted[i].y, pointSize);

        for (let i in uniqueHalfwaysSorted)
            ctx.ellipse(uniqueHalfwaysSorted[i].x, -uniqueHalfwaysSorted[i].y, pointSize);

        for (let i in uniqueVerticesSorted)
            ctx.ellipse(uniqueVerticesSorted[i].x, -uniqueVerticesSorted[i].y, pointSize);

        ctx.strokeWeight(3 / useConfiguration.getState().controls.zoom);

        for (let i in uniqueCentroidsSorted)
            ctx.text('c' + (i + 1), uniqueCentroidsSorted[i].x + offset.x, -uniqueCentroidsSorted[i].y + offset.y);

        for (let i in uniqueHalfwaysSorted)
            ctx.text('h' + (i + 1), uniqueHalfwaysSorted[i].x + offset.x, -uniqueHalfwaysSorted[i].y + offset.y);

        for (let i in uniqueVerticesSorted)
            ctx.text('v' + (i + 1), uniqueVerticesSorted[i].x + offset.x, -uniqueVerticesSorted[i].y + offset.y);

        
        const showDualConnectionsValue = useConfiguration.getState().showDualConnections;
        if (showDualConnectionsValue)
            this.drawDualConnections(ctx, true);
    }

    drawIslamicVertexRegions = (ctx, opacity: number = 1): void => {
        const cfg = useConfiguration.getState();
        const animate = cfg.islamicAnimate;
        const baseAngle = islamicTipsAngleFromSlider(cfg.islamicAngle);

        const tipsCache = new Map<Polygon, Vector[]>();
        const getTips = (tile: Polygon): Vector[] => {
            let t = tipsCache.get(tile);
            if (!t) {
                let angle: number | number[] = baseAngle;
                if (animate) {
                    angle = islamicAnglesForHalfways(ctx, tile.halfways);
                }
                t = tile.calculateIslamicTips(angle);
                tipsCache.set(tile, t);
            }
            return t;
        };

        const QUANT = 1e5;
        const keyOf = (v: Vector) => `${Math.round(v.x * QUANT)},${Math.round(v.y * QUANT)}`;

        type Corner = { tile: Polygon; cornerIdx: number; position: Vector };
        const fans = new Map<string, Corner[]>();
        for (const tile of this.nodes) {
            if (!tile.vertices || !tile.halfways) continue;
            for (let ci = 0; ci < tile.vertices.length; ci++) {
                const v = tile.vertices[ci];
                const key = keyOf(v);
                let arr = fans.get(key);
                if (!arr) { arr = []; fans.set(key, arr); }
                arr.push({ tile, cornerIdx: ci, position: v });
            }
        }

        ctx.push();
        ctx.noStroke();

        for (const corners of fans.values()) {
            if (corners.length < 2) continue;

            const V = corners[0].position;

            const withAngle = corners.map(c => ({
                c,
                ang: Math.atan2(c.tile.centroid.y - V.y, c.tile.centroid.x - V.x),
            }));
            withAngle.sort((a, b) => a.ang - b.ang);
            const ordered = withAngle.map(w => w.c);

            let interiorSum = 0;
            let interiorOk = true;
            for (const c of ordered) {
                const a = c.tile.angles?.[c.cornerIdx];
                if (typeof a === 'number' && isFinite(a)) interiorSum += a;
                else { interiorOk = false; break; }
            }
            if (!interiorOk) continue;
            if (Math.abs(interiorSum - 2 * Math.PI) > 1e-3) continue;

            type Arms = { ccwArm: Vector; cwArm: Vector; tip: Vector };
            const armsOf = (c: Corner): Arms => {
                const n = c.tile.halfways.length;
                const hPrev = c.tile.halfways[(c.cornerIdx - 1 + n) % n];
                const hNext = c.tile.halfways[c.cornerIdx];
                const tip = getTips(c.tile)[(c.cornerIdx - 1 + n) % n];
                const tc = c.tile.centroid;
                const tcx = tc.x - V.x, tcy = tc.y - V.y;
                const px = hPrev.x - V.x, py = hPrev.y - V.y;
                const crossPrev = tcx * py - tcy * px;
                if (crossPrev > 0) return { ccwArm: hPrev, cwArm: hNext, tip };
                return { ccwArm: hNext, cwArm: hPrev, tip };
            };

            const armsArr = ordered.map(armsOf);
            const hue = vertexFigureHue(ordered.map(c => c.tile.n));

            ctx.fill(hue, 40, 100 / opacity, 1.0 * opacity);
            ctx.beginShape();
            for (let i = 0; i < ordered.length; i++) {
                ctx.vertex(armsArr[i].cwArm.x, armsArr[i].cwArm.y);
                ctx.vertex(armsArr[i].tip.x, armsArr[i].tip.y);
            }
            ctx.endShape(ctx.CLOSE);
        }

        ctx.pop();
    }

    drawDualConnections = (ctx, flipY = false): void => {
        const zoom = useConfiguration.getState().controls.zoom;
        ctx.push();
        ctx.strokeWeight(2 / zoom);
        ctx.stroke(0, 0, 100, 0.9);
        ctx.fill(0, 0, 100);

        const seen = new Set<string>();
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            for (const neighbor of node.edgeNeighbors ?? []) {
                const j = this.nodes.indexOf(neighbor);
                if (j < 0) continue;
                const key = i < j ? `${i}-${j}` : `${j}-${i}`;
                if (seen.has(key)) continue;
                seen.add(key);
                ctx.line(
                    node.centroid.x,
                    flipY ? -node.centroid.y : node.centroid.y,
                    neighbor.centroid.x,
                    flipY ? -neighbor.centroid.y : neighbor.centroid.y
                );
            }
        }

        ctx.noStroke();
        const r = 4 / zoom;
        for (const node of this.nodes) {
            ctx.ellipse(
                node.centroid.x,
                flipY ? -node.centroid.y : node.centroid.y,
                r,
                r
            );
        }
        ctx.pop();
    }

    rotate = (origin: Vector, angle: number): void => {
        for (let node of this.nodes) {
            node.rotate(origin, angle);
        }
    }

    static rotate = (tiling: Tiling, origin: Vector, angle: number): Tiling => {
        const rotatedTiling: Tiling = tiling.clone();
        rotatedTiling.rotate(origin, angle);
        return rotatedTiling;
    }

    reflect = (axis: Vector, point: Vector): void => {
        for (let node of this.nodes) {
            node.mirror(point, axis);
        }
    }

    static reflect = (tiling: Tiling, axis: Vector, point: Vector): Tiling => {
        const reflectedTiling: Tiling = tiling.clone();
        reflectedTiling.reflect(axis, point);
        return reflectedTiling;
    }

    translate = (vector: Vector): void => {
        for (let node of this.nodes) {
            node.translate(vector);
        }
    }

    static translate = (tiling: Tiling, vector: Vector): Tiling => {
        const translatedTiling: Tiling = tiling.clone();
        translatedTiling.translate(vector);
        return translatedTiling;
    }

    clone = (): Tiling => {
        const newTiling: Tiling = new Tiling();
        newTiling.nodes = this.nodes.map(node => node.clone());
        newTiling.anchorNodes = this.anchorNodes.map(node => node.clone());
        return newTiling;
    }

    static merge = (tilingA: Tiling, tilingB: Tiling, tol: number = tolerance): Tiling => {
        const mergedTiling: Tiling = tilingA.clone();
        mergedTiling.nodes.push(...tilingB.nodes);
        mergedTiling.nodes = deduplicatePolygons(mergedTiling.nodes, tol);
        return mergedTiling;
    }

    isEquivalent = (other: Tiling, tol: number = tolerance): boolean => {
        if (!other) return false;

        const mergedTiling: Tiling = Tiling.merge(this, other, tol);

        for (let i = 0; i < mergedTiling.nodes.length - 1; i++) {
            const polygon = mergedTiling.nodes[i];
            for (let j = i + 1; j < mergedTiling.nodes.length; j++) {
                const otherPolygon = mergedTiling.nodes[j];
                if (polygon.intersects(otherPolygon, tol)) {
                    return false;
                }
            }
        }

        return true;
    }

    showNeighbors = (ctx, showPolygonPoints: boolean): void => {
        const lineWidthValue = useConfiguration.getState().lineWidth;
        if (lineWidthValue <= 0) {
            ctx.noStroke();
        } else {
            ctx.strokeWeight(lineWidthValue / useConfiguration.getState().controls.zoom);
            // White stroke only when tiles are outline-only on a dark theme; dark otherwise (HSB bright).
            const useLightStroke = !useConfiguration.getState().showPolygonFill && document.documentElement.classList.contains("dark");
            ctx.stroke(0, 0, useLightStroke ? 100 : 0);
        }
        
        const mouseWorldX = (ctx.mouseX - ctx.width / 2) / useConfiguration.getState().controls.zoom;
        const mouseWorldY = (-ctx.mouseY + ctx.height / 2) / useConfiguration.getState().controls.zoom;
        const mousePoint = new Vector(mouseWorldX, mouseWorldY);
        
        for (let node of this.nodes) {
            if (node.containsPoint(mousePoint)) {
                node.show(ctx, showPolygonPoints, ctx.color(0, 0, 100));

                for (let neighbor of node.neighbors) {
                    neighbor.show(ctx, showPolygonPoints, ctx.color(240, 100, 100, 0.5));
                    ctx.line(
                        node.centroid.x,
                        node.centroid.y,
                        neighbor.centroid.x,
                        neighbor.centroid.y
                    );
                    ctx.ellipse(
                        neighbor.centroid.x,
                        neighbor.centroid.y,
                        1/5,
                        1/5
                    );
                }

                ctx.fill(0, 0, 0);
                ctx.ellipse(
                    node.centroid.x,
                    node.centroid.y,
                    1/5,
                    1/5
                );
            }
        }
        
        const showDualConnectionsValue = useConfiguration.getState().showDualConnections;
        if (showDualConnectionsValue)
            this.drawDualConnections(ctx);
    }

    exportGraph = () => {
        let graph = {
            n: this.nodes.length,
            edges: []
        };
        
        const nodeMap = new Map();
        this.nodes.forEach((node, index) => {
            nodeMap.set(node, index);
        });
        
        this.nodes.forEach((node, nodeIndex) => {
            if (node.neighbors && node.neighbors.length > 0) {
                node.neighbors.forEach(neighbor => {
                    const neighborIndex = nodeMap.get(neighbor);
                    if (neighborIndex !== undefined) {
                        const edgeExists = graph.edges.some(e => 
                            (e.source === nodeIndex && e.target === neighborIndex) || 
                            (e.source === neighborIndex && e.target === nodeIndex)
                        );
                        
                        if (!edgeExists) {
                            graph.edges.push({
                                source: nodeIndex,
                                target: neighborIndex,
                                type: 'neighbor'
                            });
                        }
                    }
                });
            }
        });
        
        const jsonData = JSON.stringify(graph, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tiling-graph.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        return graph;
    }
}