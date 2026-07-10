// Native port of the DFS soundness core (PeriodSolver.ts): the gap-free completeness certificate
// (isCompleteTiling), primitivity (isPrimitive verdict), the state key, the P1 vertex-class extender
// (extendV), and latticeEquivExact. This is where the "all and only" claim cashes out — every DECISION
// here is exact (Surd area equality, exact-key saturation, exact overlap); floats only pre-reject.
#pragma once
#include <string>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <algorithm>
#include <cmath>
#include "cyclotomic.hpp"
#include "surd.hpp"
#include "polygon.hpp"
#include "fillctx.hpp"
#include "collision.hpp"
#include "analyze.hpp"

// Baked float area of a unit-edge regular n-gon (n/(4·tan(π/n)) evaluated once in V8). Star tiles carry
// their own exact area → toFloat. Matches tileAreaFloatFor byte-for-byte (broadphase pre-reject only).
inline double regularAreaFloat(int n) {
    switch (n) {
        case 3:  return bits2d(0x3fdbb67ae8584cadULL);
        case 4:  return bits2d(0x3ff0000000000001ULL);
        case 6:  return bits2d(0x4004c8dc2e423980ULL);
        case 12: return bits2d(0x4026646e17211cc0ULL);
        default: return (double)n / (4.0 * std::tan(3.141592653589793 / n)); // {3,4,6,12} are baked; others unused
    }
}
inline double tileAreaFloat(const Poly& p) { return p.isStar ? polygonAreaSurd(p.verts).toFloat() : regularAreaFloat(p.n); }
inline Surd tileAreaSurdFor(const Poly& p) { return polygonAreaSurd(p.verts); }

// Exact test a−b ∈ Λ=ℤu+ℤv: float solve picks the integer combo (jsRound, 1e-3 window), exact-verified.
inline bool latticeEquivExact(const Cyclo& a, const Cyclo& b, const Cyclo& u, const Cyclo& v) {
    Cyclo diff = a.sub(b);
    if (diff.isZero()) return true;
    Vec d = diff.toVector(), au = u.toVector(), av = v.toVector();
    double det = au.x * av.y - au.y * av.x;
    if (std::fabs(det) < 1e-6) return false;
    double m = (d.x * av.y - d.y * av.x) / det;
    double n = (au.x * d.y - au.y * d.x) / det;
    double mi = jsRound(m), ni = jsRound(n);
    if (std::fabs(m - mi) > 1e-3 || std::fabs(n - ni) > 1e-3) return false;
    return diff.sub(u.scaleRational((i128)(long)mi).add(v.scaleRational((i128)(long)ni))).isZero();
}

// V = number of distinct vertex classes mod Λ among ALL cell-polygon vertices (no dent skip — this is
// the exported vertexClassCount, not the P1 extendV). Exercises latticeEquivExact over every vertex.
inline int vertexClassCount(const std::vector<Poly>& reps, const Cyclo& u, const Cyclo& v) {
    std::vector<Cyclo> vReps;
    for (const Poly& p : reps)
        for (const Cyclo& w : p.verts) {
            bool found = false;
            for (const Cyclo& r : vReps) if (latticeEquivExact(w, r, u, v)) { found = true; break; }
            if (!found) vReps.push_back(w);
        }
    return (int)vReps.size();
}

// P1 vertex-class extender: append poly's TRUE-vertex classes (a star's POINTS only — even indices;
// dents are t=2 non-vertices) not already lattice-equivalent to a present class.
inline std::vector<Cyclo> extendV(const std::vector<Cyclo>& parent, const Poly& poly,
                                  const Cyclo& uL, const Cyclo& vL) {
    std::vector<Cyclo> out = parent;
    for (size_t i = 0; i < poly.verts.size(); i++) {
        if (poly.isStar && (i % 2 == 1)) continue;    // skip dents
        const Cyclo& w = poly.verts[i];
        bool found = false;
        for (const Cyclo& r : out) if (latticeEquivExact(w, r, uL, vL)) { found = true; break; }
        if (!found) out.push_back(w);
    }
    return out;
}

// Canonical DAG state key: sorted reduced exact keys joined by '|'.
inline std::string stateKey(const std::vector<Poly>& reps) {
    std::vector<std::string> ks; ks.reserve(reps.size());
    for (const Poly& p : reps) ks.push_back(p.exactKey());
    std::sort(ks.begin(), ks.end());
    std::string s; for (size_t i = 0; i < ks.size(); i++) { if (i) s += "|"; s += ks[i]; }
    return s;
}

// Exact gap-free certificate: (c) Σ tile area == |det Λ| (exact Surd), (b) every vertex within one cell
// surrounded (2π) with an allowed VC, (a) no proper overlap. occurringOut (optional) collects every
// judged t≥3 VC name — complete only on a true return. (The opDoom OP-1 short-circuit is applied by the
// caller in torusFill, not here; this is the pure geometric certificate.)
inline bool isCompleteTiling(const std::vector<Poly>& reps, const FillCtx& ctx, const Surd& cellAreaSurd,
                             std::unordered_set<std::string>* occurringOut = nullptr) {
    // (c) area — float pre-reject then exact decision.
    double area = 0; for (const Poly& p : reps) area += tileAreaFloat(p);
    if (std::fabs(area - ctx.cellArea) > 1e-4 * std::fmax(1.0, ctx.cellArea)) return false;
    Surd areaSurd;  // ZERO
    for (const Poly& p : reps) areaSurd = areaSurd.add(tileAreaSurdFor(p));
    if (areaSurd.cmp(cellAreaSurd) != 0) return false;

    double certRabs = ctx.cellDiam + 8;
    std::vector<Poly> block = buildBlock(reps, ctx, certRabs);
    double judgeR = ctx.cellDiam + 0.5;
    // incidence, insertion order (JS Map)
    std::vector<std::pair<Cyclo, std::vector<Inc>>> inc;
    std::unordered_map<std::string, int> incIdx;
    for (const Poly& p : block) {
        for (size_t i = 0; i < p.verts.size(); i++) {
            std::string kk = p.verts[i].key();
            auto it = incIdx.find(kk);
            int e;
            if (it == incIdx.end()) { e = (int)inc.size(); incIdx[kk] = e; inc.push_back({ p.verts[i], {} }); }
            else e = it->second;
            inc[e].second.push_back({ &p, (int)i });
        }
    }
    // (b) saturation: every judged vertex fully surrounded + allowed (t≥3) or a legal 2-tile dent-fill.
    int judged = 0;
    for (auto& entry : inc) {
        Vec vf = entry.first.toVector();
        if (jsHypot(vf.x, vf.y) > judgeR) continue;
        judged++;
        std::vector<Interval> intervals = coveredIntervals(entry.second, ctx.N);
        int totalUnits = 0; for (const Interval& it : intervals) totalUnits += it.units;
        if (std::fabs((double)totalUnits - ctx.N) > 0.5) return false; // gap or over-full
        std::unordered_set<std::string> t;
        for (const Inc& pi : entry.second) t.insert(pi.first->exactKey());
        if (t.size() < 3) continue;                      // legal dent-fill
        std::string name = canonicalVCName(vcRingNames(entry.second, ctx.N));
        if (!ctx.allowed.count(name)) return false;
        if (occurringOut) occurringOut->insert(name);
    }
    if (judged == 0) return false;

    // (a) no proper overlap (RANK-1 periodic reduction).
    if (blockOverlapPeriodic(reps, block, ctx, certRabs)) return false;
    return true;
}

// True iff Λ is the PRIMITIVE period (no smaller translation maps the cell-tiling onto itself). Verdict
// only — the TS supercellRejectionGuard is diagnostics that never change the verdict, so it is omitted.
inline bool isPrimitive(const std::vector<Poly>& reps, const FillCtx& ctx) {
    if (reps.size() <= 1) return true;
    std::unordered_set<std::string> repKeys;
    for (const Poly& r : reps) repKeys.insert(r.exactKey());
    for (size_t i = 0; i < reps.size(); i++) {
        for (size_t j = 0; j < reps.size(); j++) {
            if (i == j || reps[i].name != reps[j].name) continue;   // getName() == name
            Cyclo t = reps[j].centroid.sub(reps[i].centroid);
            if (t.isZero()) continue;
            bool all = true;
            for (const Poly& r : reps) {
                Poly rt = r.translateExact(t);
                if (!repKeys.count(canonicalRep(rt, ctx).key)) { all = false; break; }
            }
            if (all) return false;   // sub-lattice witness ⇒ non-primitive
        }
    }
    return true;
}
