// Native port of the DFS's lattice-reduction and block-geometry layer from PeriodSolver.ts:
// reducePolygon / canonicalRep / dedupModLattice / buildBlock. Exact IDENTITY (exact keys) on top of a
// FLOAT broadphase (toVector positions, jsHypot distances, jsRound lattice-integer picks) — every float
// primitive is already bit-identical to V8, so these are bit-identical too.
//
// FillCtx holds the per-lattice scalars that makeCtx computes ONCE in TS and passes across the coarse
// boundary (the port does not recompute lattice geometry). This is the subset the reduction/block layer
// reads; later layers extend it (cellAreaSurd, allowed, polySizes, starTiles, orbitFloor, ...).
#pragma once
#include <string>
#include <vector>
#include <set>
#include <unordered_set>
#include <cmath>
#include <utility>
#include "cyclotomic.hpp"
#include "surd.hpp"
#include "polygon.hpp"
#include "polygon_float.hpp"

static constexpr int BLOCK_INDEX_CAP = 60;

struct FillCtx {
    const Ring* ring;
    Cyclo u, v;
    Vec uV, vV;
    double det, cellDiam, minLen, cellArea, maxCircum;
    int N, maxCellPolys, orbitFloor;
    std::unordered_set<std::string> allowed;   // canonical allowed-VC names (analyze / certificate); empty by default
    Surd cellAreaSurd;                          // exact |det Λ| (certificate area leg); default ZERO
    std::vector<int> polySizes;                 // regular tile sizes the fill may seat
    std::vector<std::pair<int, int>> starTiles; // C3 star palette: (n, alphaU) variants
    int k = 0;                                  // target uniformity (early gate + OP-1)
    std::vector<std::vector<int>> feasVectors;  // P3 stage B: F*(Λ) Pareto-max per-size tile counts,
                                                // aligned to polySizes; EMPTY ⇒ domination prune off
                                                // (byte-identical pre-P3 behavior; k≥3 regular only)

    FillCtx(const Ring* r, Cyclo u_, Cyclo v_, Vec uV_, Vec vV_, double det_, double cellDiam_,
            double minLen_, double cellArea_, double maxCircum_, int maxCellPolys_, int orbitFloor_)
        : ring(r), u(std::move(u_)), v(std::move(v_)), uV(uV_), vV(vV_), det(det_), cellDiam(cellDiam_),
          minLen(minLen_), cellArea(cellArea_), maxCircum(maxCircum_), N(r->N),
          maxCellPolys(maxCellPolys_), orbitFloor(orbitFloor_) {}
};

// reducePolygon: subtract the integer combo m·u+n·v nearest the centroid to bring it into the
// fundamental cell. Float solve picks m,n; the translation is exact.
inline Poly reducePolygon(const Poly& p, const FillCtx& ctx) {
    Vec c = p.centroid.toVector();
    double a = (c.x * ctx.vV.y - c.y * ctx.vV.x) / ctx.det;
    double b = (ctx.uV.x * c.y - ctx.uV.y * c.x) / ctx.det;
    long ma = (long)jsRound(a);
    long mb = (long)jsRound(b);
    if (ma == 0 && mb == 0) return p;
    Cyclo T = ctx.u.scaleRational((i128)(-ma)).add(ctx.v.scaleRational((i128)(-mb)));
    return p.translateExact(T);
}

// canonicalRep: lex-min exact key among the class's lattice translates whose centroid lies within
// ~1.5 cells of the origin (the SAME set for every class member ⇒ boundary-rounding-immune).
struct CanonRep { std::string key; Poly poly; };
inline CanonRep canonicalRep(const Poly& p, const FillCtx& ctx) {
    Poly r0 = reducePolygon(p, ctx);
    Poly bestPoly = r0;
    std::string bestKey = r0.exactKey();
    double lim = 1.5 * ctx.cellDiam + 0.1;
    for (int i = -2; i <= 2; i++) {
        for (int j = -2; j <= 2; j++) {
            if (i == 0 && j == 0) continue;
            Cyclo T = ctx.u.scaleRational((i128)i).add(ctx.v.scaleRational((i128)j));
            Poly q = r0.translateExact(T);
            Vec cf = q.centroid.toVector();
            if (jsHypot(cf.x, cf.y) > lim) continue;
            std::string kq = q.exactKey();
            if (kq < bestKey) { bestKey = kq; bestPoly = q; }
        }
    }
    return CanonRep{ bestKey, bestPoly };
}

// dedupModLattice: one canonical representative per lattice class, preserving first-seen order.
inline std::vector<Poly> dedupModLattice(const std::vector<Poly>& polys, const FillCtx& ctx) {
    std::unordered_set<std::string> seen;
    std::vector<Poly> out;
    for (const Poly& p : polys) {
        CanonRep cr = canonicalRep(p, ctx);
        if (seen.count(cr.key)) continue;
        seen.insert(cr.key);
        out.push_back(cr.poly);
    }
    return out;
}

// buildBlock: cell + its lattice neighbours within absolute radius Rabs of the origin. TIGHT (m,n)
// index bounds from the perpendicular-distance formula, clamped by BLOCK_INDEX_CAP (a binding clamp is
// flagged in makeCtx TS-side, not here).
inline std::vector<Poly> buildBlock(const std::vector<Poly>& reps, const FillCtx& ctx, double Rabs) {
    std::vector<Poly> out;
    std::unordered_set<std::string> seen;
    double limit = Rabs + ctx.cellDiam + 2;
    double lu = jsHypot(ctx.uV.x, ctx.uV.y);
    double lv = jsHypot(ctx.vV.x, ctx.vV.y);
    double area = std::fabs(ctx.det);
    int Mm = std::min(BLOCK_INDEX_CAP, (int)std::ceil((limit * lv) / area) + 1);
    int Mn = std::min(BLOCK_INDEX_CAP, (int)std::ceil((limit * lu) / area) + 1);
    for (int m = -Mm; m <= Mm; m++) {
        for (int n = -Mn; n <= Mn; n++) {
            double tx = (double)m * ctx.uV.x + (double)n * ctx.vV.x;
            double ty = (double)m * ctx.uV.y + (double)n * ctx.vV.y;
            if (jsHypot(tx, ty) > limit + ctx.cellDiam) continue;
            bool identity = (m == 0 && n == 0);
            Cyclo T = identity ? Cyclo::zero(ctx.ring)
                               : ctx.u.scaleRational((i128)m).add(ctx.v.scaleRational((i128)n));
            for (const Poly& rep : reps) {
                Poly q = identity ? rep : rep.translateExact(T);
                Vec cf = q.centroid.toVector();
                if (jsHypot(cf.x, cf.y) > limit) continue;
                std::string key = q.exactKey();
                if (seen.count(key)) continue;
                seen.insert(key);
                out.push_back(q);
            }
        }
    }
    return out;
}
