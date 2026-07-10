// Native port of the CONVEX float overlap path in lib/classes/polygons/Polygon.ts (intersects, the
// regular fast path) + its helpers in lib/utils/geometry.ts (sdf / isWithinConvexHull /
// segmentsIntersect) and the Vector ops it uses (lib/classes/Vector.ts). This is the float broadphase
// for regular (non-star) tiles; star pairs go through the exact predicate in overlap.hpp instead.
//
// "Byte-identical" here means bit-identical IEEE-754 doubles. That holds only under matched op order:
//   - compile with -ffp-contract=off so `a*b + c` stays two rounded ops (no fused multiply-add),
//   - no reassociation (default -O2, no -ffast-math),
//   - Apple-silicon / SSE 64-bit doubles (no x87 80-bit intermediates).
// The one transcendental is atan2, used ONLY as the sort key in sortPointsByAngle. For a convex
// polygon the vertex angles about the centroid are well separated (>=~2pi/12), so a last-ULP atan2
// difference between V8 and libm can never flip the sort order -> sdf stays bit-identical. The
// differential test would surface it as a real failure if that assumption ever broke.
#pragma once
#include <vector>
#include <cmath>
#include <algorithm>
#include "vec.hpp"

// JS Math.min/Math.max semantics: NaN propagates; -0 < +0. std::min/std::max do NEITHER, so the
// clamp in sdf and the tMin/tMax in segmentsIntersect need these to match V8 bit-for-bit on the
// degenerate inputs (real convex tiles never hit them, but the port stays faithful regardless).
inline double jsMin(double a, double b) {
    if (std::isnan(a) || std::isnan(b)) return NAN;
    if (a < b) return a;
    if (b < a) return b;
    return std::signbit(a) ? a : b;   // equal (incl. +-0): -0 is the smaller
}
inline double jsMax(double a, double b) {
    if (std::isnan(a) || std::isnan(b)) return NAN;
    if (a > b) return a;
    if (b > a) return b;
    return std::signbit(a) ? b : a;   // equal (incl. +-0): +0 is the larger
}

// JS Math.round: round to nearest, ties toward +Infinity (NOT std::round, which rounds ties away from
// zero — they disagree on negative halves: Math.round(-2.5)=-2 vs std::round(-2.5)=-3). Computed via
// floor + exact fractional compare so the 0.4999999999999999 tie-adjacent case matches V8 too.
inline double jsRound(double x) {
    if (std::isnan(x) || std::isinf(x)) return x;
    double r = std::floor(x);
    double frac = x - r;          // exact for the magnitudes here (|x| well below 2^52)
    return frac < 0.5 ? r : r + 1.0;   // frac == 0.5 -> r+1 (toward +Inf)
}

// V8 Math.hypot(x,y): NOT std::hypot (differs ~1 ULP on ~40% of inputs) and NOT naive sqrt(x*x+y*y).
// V8 scales by the max abs value and sums the squares with a Neumaier compensation, then sqrt·max.
// Spec order: any ±inf ⇒ +inf (even alongside NaN); else any NaN ⇒ NaN. Replicated so the DFS's
// float culls (which compare toVector distances to radii via Math.hypot) are bit-identical to V8.
inline double jsHypot(double x, double y) {
    x = std::fabs(x); y = std::fabs(y);
    if (std::isinf(x) || std::isinf(y)) return INFINITY;
    if (std::isnan(x) || std::isnan(y)) return NAN;
    double max = x > y ? x : y;
    if (max == 0.0) return 0.0;
    double vals[2] = { x, y };
    double sum = 0.0, comp = 0.0;   // Neumaier compensated sum of (v/max)^2
    for (int i = 0; i < 2; i++) {
        double n = vals[i] / max;
        double summand = n * n;
        double prelim = sum + summand;
        if (std::fabs(sum) >= std::fabs(summand)) comp += (sum - prelim) + summand;
        else comp += (summand - prelim) + sum;
        sum = prelim;
    }
    return std::sqrt(sum + comp) * max;
}

// sortPointsByAngle (geometry.ts): centroid = (sum v)/n by left-fold from (0,0), then scale by 1/n;
// stable sort by heading = atan2(y - cy, x - cx). Returns a sorted COPY (the TS sorts in place, but
// the returned VALUE of sdf is invariant to that mutation, which is all the differential test reads).
inline std::vector<Vec> sortPointsByAngle(const std::vector<Vec>& verts) {
    Vec c{0.0, 0.0};
    for (const Vec& v : verts) { c.x = c.x + v.x; c.y = c.y + v.y; }
    double inv = 1.0 / (double)verts.size();
    c.x = c.x * inv; c.y = c.y * inv;
    std::vector<Vec> out = verts;
    std::vector<double> key(out.size());
    for (size_t i = 0; i < out.size(); i++) key[i] = std::atan2(out[i].y - c.y, out[i].x - c.x);
    // index sort keeps stability (std::stable_sort of parallel arrays) and mirrors V8's stable sort.
    std::vector<size_t> idx(out.size());
    for (size_t i = 0; i < idx.size(); i++) idx[i] = i;
    std::stable_sort(idx.begin(), idx.end(), [&](size_t a, size_t b) { return key[a] < key[b]; });
    std::vector<Vec> sorted(out.size());
    for (size_t i = 0; i < idx.size(); i++) sorted[i] = out[idx[i]];
    return sorted;
}

// sdf (geometry.ts): signed distance, negative inside. Point-in-polygon via ray cast + nearest-edge
// distance. Bit-for-bit transcription of the arithmetic (grouping preserved).
inline double sdf(const std::vector<Vec>& verts, const Vec& point) {
    double minDistanceSq = INFINITY;
    bool inside = false;
    std::vector<Vec> vs = sortPointsByAngle(verts);
    int n = (int)vs.size();
    for (int i = 0, j = n - 1; i < n; j = i++) {
        const Vec& vi = vs[j];
        const Vec& vj = vs[i];
        double ex = vj.x - vi.x;
        double ey = vj.y - vi.y;
        double wx = point.x - vi.x;
        double wy = point.y - vi.y;
        double eLenSq = ex * ex + ey * ey;
        double t = jsMax(0.0, jsMin(1.0, (wx * ex + wy * ey) / eLenSq));
        if (std::isnan(t)) t = 0.0;
        double cx = vi.x + t * ex;
        double cy = vi.y + t * ey;
        double dx = point.x - cx;
        double dy = point.y - cy;
        double distSq = dx * dx + dy * dy;
        if (distSq < minDistanceSq) minDistanceSq = distSq;
        bool intersect = ((vi.y > point.y) != (vj.y > point.y)) &&
                         (point.x < (vj.x - vi.x) * (point.y - vi.y) / (vj.y - vi.y) + vi.x);
        if (intersect) inside = !inside;
    }
    double distance = std::sqrt(minDistanceSq);
    return inside ? -distance : distance;
}

inline bool isWithinConvexHull(const std::vector<Vec>& verts, const Vec& point, double tol) {
    return sdf(verts, point) < -tol;
}

// segmentsIntersect (geometry.ts): true iff (p1,p2) and (p3,p4) intersect, with a shared-endpoint
// carve-out (two shared points => coincident, not an intersection) and a collinear-overlap branch.
inline bool segmentsIntersect(const Vec& p1, const Vec& p2, const Vec& p3, const Vec& p4, double tol) {
    auto eq = [&](const Vec& a, const Vec& b) { return std::fabs(a.x - b.x) < tol && std::fabs(a.y - b.y) < tol; };
    bool p1p3 = eq(p1, p3), p1p4 = eq(p1, p4), p2p3 = eq(p2, p3), p2p4 = eq(p2, p4);
    int shared = (p1p3 ? 1 : 0) + (p1p4 ? 1 : 0) + (p2p3 ? 1 : 0) + (p2p4 ? 1 : 0);
    if (shared == 2) return false;
    double denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    double numT = (p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x);
    double numU = (p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x);
    if (std::fabs(denom) < tol) {
        if (std::fabs(numT) < tol && std::fabs(numU) < tol) {
            double dx = p2.x - p1.x;
            double dy = p2.y - p1.y;
            double lenSq = dx * dx + dy * dy;
            if (lenSq < tol) return false;
            double t3 = ((p3.x - p1.x) * dx + (p3.y - p1.y) * dy) / lenSq;
            double t4 = ((p4.x - p1.x) * dx + (p4.y - p1.y) * dy) / lenSq;
            double tMin = jsMin(t3, t4);
            double tMax = jsMax(t3, t4);
            if (tMin < 1 - tol && tMax > tol) return true;
        }
        return false;
    }
    double t = numT / denom;
    double u = numU / denom;
    bool tInterior = t > tol && t < 1 - tol;
    bool uInterior = u > tol && u < 1 - tol;
    if (tInterior && uInterior) return true;
    if (shared == 0) {
        bool tOnSegment = t > -tol && t < 1 + tol;
        bool uOnSegment = u > -tol && u < 1 + tol;
        if (tOnSegment && uOnSegment) return true;
    }
    return false;
}

// The CONVEX branch of Polygon.intersects (lines 388-411): centroid-in-hull both ways, then every
// vertex + halfway of each inside the other, then all edge-pair crossings. `this` = A, `other` = B.
// containsPoint(pt) == isWithinConvexHull(ownVertices, pt, tol). The star gate above it (exact
// predicate) is NOT here — star pairs are dispatched to exactPolygonsOverlap in overlap.hpp.
inline bool polygonIntersectsConvex(
    const std::vector<Vec>& av, const std::vector<Vec>& ah, const Vec& ac,
    const std::vector<Vec>& bv, const std::vector<Vec>& bh, const Vec& bc, double tol) {
    if (isWithinConvexHull(av, bc, tol)) return true;   // this.containsPoint(other.centroid)
    if (isWithinConvexHull(bv, ac, tol)) return true;   // other.containsPoint(this.centroid)
    for (size_t i = 0; i < av.size(); i++) {
        if (isWithinConvexHull(bv, av[i], tol)) return true;
        if (isWithinConvexHull(bv, ah[i], tol)) return true;
    }
    for (size_t i = 0; i < bv.size(); i++) {
        if (isWithinConvexHull(av, bv[i], tol)) return true;
        if (isWithinConvexHull(av, bh[i], tol)) return true;
    }
    int la = (int)av.size(), lb = (int)bv.size();
    for (int i = 0; i < la; i++) {
        const Vec& p1 = av[i];
        const Vec& p2 = av[(i + 1) % la];
        for (int j = 0; j < lb; j++) {
            const Vec& p3 = bv[j];
            const Vec& p4 = bv[(j + 1) % lb];
            if (segmentsIntersect(p1, p2, p3, p4, tol)) return true;
        }
    }
    return false;
}
