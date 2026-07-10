// Native port of lib/classes/algorithm/exact/exactOverlap.ts — exact proper-overlap test for polygons
// in ℤ[ζ₂₄], sound for NON-CONVEX (star) tiles. Every decision is the sign of a Surd derived from
// conj(·)·(·) products; no intersection coordinates are ever built. Built entirely on the validated
// Cyclo/Surd layer. pointInPolygon returns 1=in / 2=on / 0=out (TS 'in'/'on'/'out').
#pragma once
#include <vector>
#include "cyclotomic.hpp"
#include "surd.hpp"

// sign of (b−a)×(c−a)
inline int orient2D(const Cyclo& a, const Cyclo& b, const Cyclo& c) {
    return detSurd(b.sub(a), c.sub(a)).sign();
}
// sign of u·v = Re(conj(u)·v)
inline int dotSign(const Cyclo& u, const Cyclo& v) {
    return reSurd(u.conj().mul(v)).sign();
}
// sign of (p.y − q.y) = Im(p − q)
inline int imSign(const Cyclo& p, const Cyclo& q) {
    return imSurd(p.sub(q)).sign();
}
// with (a,b,p) collinear, is p within the closed segment [a,b]?
inline bool onSegmentColinear(const Cyclo& a, const Cyclo& b, const Cyclo& p) {
    return dotSign(p.sub(a), b.sub(a)) >= 0 && dotSign(p.sub(b), a.sub(b)) >= 0;
}
// do (a1,a2),(b1,b2) cross strictly in their interiors?
inline bool segmentsProperlyCross(const Cyclo& a1, const Cyclo& a2, const Cyclo& b1, const Cyclo& b2) {
    int o1 = orient2D(a1, a2, b1), o2 = orient2D(a1, a2, b2);
    int o3 = orient2D(b1, b2, a1), o4 = orient2D(b1, b2, a2);
    return o1 != 0 && o2 != 0 && o3 != 0 && o4 != 0 && o1 != o2 && o3 != o4;
}
// collinear edges overlapping on a positive sub-segment with interiors on the SAME side
inline bool collinearSameSideOverlap(const Cyclo& a1, const Cyclo& a2, const Cyclo& b1, const Cyclo& b2) {
    if (orient2D(a1, a2, b1) != 0 || orient2D(a1, a2, b2) != 0) return false;
    Cyclo d = a2.sub(a1);
    if (dotSign(d, b2.sub(b1)) <= 0) return false;
    auto t = [&](const Cyclo& x) { return reSurd(d.conj().mul(x.sub(a1))); };
    Surd L = t(a2), tb1 = t(b1), tb2 = t(b2);
    Surd minB = tb1.cmp(tb2) <= 0 ? tb1 : tb2;
    Surd maxB = tb1.cmp(tb2) <= 0 ? tb2 : tb1;
    Surd Z;  // zero
    Surd lo = Z.cmp(minB) >= 0 ? Z : minB;   // max(0, minB)
    Surd hi = L.cmp(maxB) <= 0 ? L : maxB;   // min(L, maxB)
    return hi.cmp(lo) > 0;
}
// strict containment: 1='in', 2='on', 0='out'
inline int pointInPolygon(const std::vector<Cyclo>& verts, const Cyclo& p) {
    int L = (int)verts.size();
    for (int i = 0; i < L; i++) {
        const Cyclo& a = verts[i];
        const Cyclo& b = verts[(i + 1) % L];
        if (orient2D(a, b, p) == 0 && onSegmentColinear(a, b, p)) return 2;  // on
    }
    int wn = 0;
    for (int i = 0; i < L; i++) {
        const Cyclo& a = verts[i];
        const Cyclo& b = verts[(i + 1) % L];
        int sa = imSign(a, p), sb = imSign(b, p);
        if (sa <= 0) { if (sb > 0 && orient2D(a, b, p) > 0) wn++; }
        else { if (sb <= 0 && orient2D(a, b, p) < 0) wn--; }
    }
    return wn != 0 ? 1 : 0;  // in : out
}
// true iff interiors intersect in positive area
inline bool exactPolygonsOverlap(const std::vector<Cyclo>& A, const std::vector<Cyclo>& B) {
    int la = (int)A.size(), lb = (int)B.size();
    for (int i = 0; i < la; i++) {
        const Cyclo& a1 = A[i];
        const Cyclo& a2 = A[(i + 1) % la];
        for (int j = 0; j < lb; j++) {
            const Cyclo& b1 = B[j];
            const Cyclo& b2 = B[(j + 1) % lb];
            if (segmentsProperlyCross(a1, a2, b1, b2)) return true;
            if (collinearSameSideOverlap(a1, a2, b1, b2)) return true;
        }
    }
    for (const Cyclo& v : A) if (pointInPolygon(B, v) == 1) return true;
    for (const Cyclo& v : B) if (pointInPolygon(A, v) == 1) return true;
    for (int i = 0; i < la; i++) {
        Cyclo m = A[i].add(A[(i + 1) % la]).scaleRational(1, 2);
        if (pointInPolygon(B, m) == 1) return true;
    }
    for (int j = 0; j < lb; j++) {
        Cyclo m = B[j].add(B[(j + 1) % lb]).scaleRational(1, 2);
        if (pointInPolygon(A, m) == 1) return true;
    }
    return false;
}
