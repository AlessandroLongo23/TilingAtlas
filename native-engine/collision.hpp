// Native port of the DFS's collision layer (PeriodSolver.ts): the overlap predicates the fill uses to
// reject self-overlapping cells and mis-placed tiles. This is where the two already-validated collision
// primitives get wired in behind Polygon.intersects's star gate:
//   - star pair  → exactPolygonsOverlap (overlap.hpp), exact ℤ[ζ₂₄], sound for reflex dents
//   - convex pair → polygonIntersectsConvex (polygon_float.hpp), the bit-identical float broadphase
// Everything above them (bbox cull, centroid-distance cull, isEquivalent skip) is a float/exact-key
// broadphase; the final decision is one of those two validated primitives.
#pragma once
#include <string>
#include <vector>
#include <cmath>
#include "fillctx.hpp"
#include "overlap.hpp"

struct Box { double minX, maxX, minY, maxY; };

inline std::vector<Vec> floatVerts(const Poly& p) {
    std::vector<Vec> o; o.reserve(p.verts.size());
    for (const Cyclo& v : p.verts) o.push_back(v.toVector());
    return o;
}
inline std::vector<Vec> floatHalfways(const Poly& p) {
    std::vector<Vec> o; o.reserve(p.halfways.size());
    for (const Cyclo& h : p.halfways) o.push_back(h.toVector());
    return o;
}

// bbox over the float vertex cache (Math.min/max, ±Infinity init).
inline Box bbox(const Poly& p) {
    double minX = INFINITY, maxX = -INFINITY, minY = INFINITY, maxY = -INFINITY;
    for (const Cyclo& vc : p.verts) {
        Vec v = vc.toVector();
        minX = jsMin(minX, v.x); maxX = jsMax(maxX, v.x);
        minY = jsMin(minY, v.y); maxY = jsMax(maxY, v.y);
    }
    return Box{ minX, maxX, minY, maxY };
}
inline bool bboxOverlap(const Box& a, const Box& b) {
    double m = 1e-9;
    return !(a.maxX < b.minX - m || b.maxX < a.minX - m || a.maxY < b.minY - m || b.maxY < a.minY - m);
}

// isEquivalent: exact path (our tiles always carry exact vertices) — equal iff same length + same key.
inline bool polyIsEquivalent(const Poly& a, const Poly& b) {
    if (a.verts.size() != b.verts.size()) return false;
    return a.exactKey() == b.exactKey();
}

// Polygon.intersects: star gate (either star → exact predicate) else convex float broadphase. tol =
// tolerance = 1e-6 (the default), the same double on both sides.
inline bool polyIntersects(const Poly& a, const Poly& b) {
    if (a.isStar || b.isStar) return exactPolygonsOverlap(a.verts, b.verts);
    return polygonIntersectsConvex(floatVerts(a), floatHalfways(a), a.centroid.toVector(),
                                   floatVerts(b), floatHalfways(b), b.centroid.toVector(), 1e-6);
}

// True iff P properly overlaps a DIFFERENT tile of the (prebuilt) block. cullR = R_P + maxCircum (the
// exact overlap-impossibility radius) + 1e-9 slack.
inline bool properOverlapWithBlock(const Poly& P, const std::vector<Poly>& block, const FillCtx& ctx) {
    Vec pc = P.centroid.toVector();
    Box pBox = bbox(P);
    std::string pKey = P.exactKey();
    double circumP = 0;
    for (const Cyclo& wc : P.verts) { Vec w = wc.toVector(); circumP = jsMax(circumP, jsHypot(w.x - pc.x, w.y - pc.y)); }
    double cullR = circumP + ctx.maxCircum + 1e-9;
    for (const Poly& q : block) {
        if (q.exactKey() == pKey) continue;
        Vec qc = q.centroid.toVector();
        if (jsHypot(pc.x - qc.x, pc.y - qc.y) > cullR) continue;
        if (!bboxOverlap(pBox, bbox(q))) continue;
        if (!polyIsEquivalent(P, q) && polyIntersects(P, q)) return true;
    }
    return false;
}

// Cheap necessary self-overlap test: does any rep overlap one of its 8 nearest lattice translates?
inline bool coreSelfOverlapsNearest(const std::vector<Poly>& reps, const FillCtx& ctx) {
    Cyclo u = ctx.u, v = ctx.v;
    Cyclo nu = u.scaleRational(-1), nv = v.scaleRational(-1);
    std::vector<Cyclo> Ts = { u, nu, v, nv, u.add(v), nu.add(nv), u.add(nv), nu.add(v) };
    for (const Poly& rep : reps) {
        Box rb = bbox(rep);
        for (const Cyclo& T : Ts) {
            Poly q = rep.translateExact(T);
            if (!bboxOverlap(rb, bbox(q))) continue;
            if (!polyIsEquivalent(rep, q) && polyIntersects(rep, q)) return true;
        }
    }
    return false;
}

// True iff two distinct (non-coincident) tiles in the block properly overlap. O(|block|²).
inline bool blockHasProperOverlap(const std::vector<Poly>& block) {
    std::vector<Box> boxes; boxes.reserve(block.size());
    for (const Poly& p : block) boxes.push_back(bbox(p));
    for (size_t i = 0; i < block.size(); i++)
        for (size_t j = i + 1; j < block.size(); j++) {
            if (!bboxOverlap(boxes[i], boxes[j])) continue;
            if (!polyIsEquivalent(block[i], block[j]) && polyIntersects(block[i], block[j])) return true;
        }
    return false;
}

// RANK-1 periodic reduction of blockHasProperOverlap: reps-vs-block (O(reps·block)); falls back to the
// O(block²) all-pairs check when the witness-containment guard cannot be assured.
inline bool blockOverlapPeriodic(const std::vector<Poly>& reps, const std::vector<Poly>& block,
                                 const FillCtx& ctx, double Rabs) {
    if (1.5 * ctx.cellDiam + 0.1 + 2 * ctx.maxCircum > Rabs + ctx.cellDiam + 2) {
        return blockHasProperOverlap(block); // guard: a rep's overlap partner may escape the block
    }
    for (const Poly& rep : reps) if (properOverlapWithBlock(rep, block, ctx)) return true;
    return false;
}
