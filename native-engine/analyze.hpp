// Native port of the DFS's block-analysis layer (PeriodSolver.ts): classify every vertex within one
// cell of the origin as surrounded (allowed VC), open (a gap to fill), or contradictory (over-full or
// disallowed VC), and return the nearest open vertex. Pure exact/integer geometry (edge directions and
// corner angles are exact ints) on a float cull (toVector positions vs judgeR/incR via jsHypot).
//
// The incidence map is iterated in JS-Map INSERTION order, because analyze's open-vertex tiebreak
// (nearest wins, first-seen on a tie) and its return-contradiction-on-first-bad-vertex both depend on
// that order — an unordered_map would diverge on ties. So it is an insertion-ordered vector + index map.
#pragma once
#include <string>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <algorithm>
#include <cmath>
#include "cyclotomic.hpp"
#include "polygon.hpp"
#include "fillctx.hpp"

struct Interval { int start, units, n; };

// canonicalVCName: dihedral (rotation + reflection) minimum of a cyclic token sequence.
inline std::string vc_rotMin(const std::vector<std::string>& a) {
    std::string best; bool has = false;
    for (size_t i = 0; i < a.size(); i++) {
        std::string r;
        for (size_t k = 0; k < a.size(); k++) { if (k) r += ","; r += a[(i + k) % a.size()]; }
        if (!has || r < best) { best = r; has = true; }
    }
    return best;
}
inline std::string canonicalVCName(const std::vector<std::string>& ns) {
    std::string f = vc_rotMin(ns);
    std::vector<std::string> rev(ns.rbegin(), ns.rend());
    std::string r = vc_rotMin(rev);
    return f < r ? f : r;
}

// A tile touching vertex v at its corner `idx` (the shared-vertex index).
using Inc = std::pair<const Poly*, int>;

// coveredIntervals: each incident corner covers the CCW arc [dOut, dOut+interior].
inline std::vector<Interval> coveredIntervals(const std::vector<Inc>& polys, int N) {
    std::vector<Interval> out;
    for (const Inc& pi : polys) {
        int dOut = pi.first->edgeDirs[pi.second];
        int units = pi.first->cornerAngleUnits(pi.second);
        out.push_back(Interval{ ((dOut % N) + N) % N, units, pi.first->n });
    }
    return out;
}

// gapStartRay: smallest ray that ENDS a covered interval but does not START one (-1 if none).
inline int gapStartRay(const std::vector<Interval>& intervals, int N) {
    std::unordered_set<int> starts;
    for (const Interval& it : intervals) starts.insert(it.start);
    int bestRay = -1;
    for (const Interval& it : intervals) {
        int e = (it.start + it.units) % N;       // Math.round of an integer ⇒ the integer itself
        int r = ((e % N) + N) % N;
        if (!starts.count(r)) { if (bestRay < 0 || r < bestRay) bestRay = r; }
    }
    return bestRay;
}

// vcRingNames: corner tokens in CCW edge-direction order (stable sort, matching V8's stable Array.sort).
inline std::vector<std::string> vcRingNames(const std::vector<Inc>& polys, int N) {
    std::vector<std::pair<int, std::string>> ws;
    for (const Inc& pi : polys)
        ws.push_back({ ((pi.first->edgeDirs[pi.second] % N) + N) % N, pi.first->cornerToken(pi.second) });
    std::stable_sort(ws.begin(), ws.end(), [](const auto& a, const auto& b) { return a.first < b.first; });
    std::vector<std::string> out; for (auto& w : ws) out.push_back(w.second);
    return out;
}

// analyze result: 0 = torus closed, 1 = open vertex found, 2 = contradiction. On open, carries the
// open vertex key + gapStartRay(d0) + the sorted covered-interval multiset (the decision-relevant data).
// kind: 0 closed, 1 open, 2 contradiction. On open, vtx holds the open vertex (1 elem) for torusFill.
struct AnalyzeOut { int kind; std::string openKey; int d0; std::string ivs; std::vector<Cyclo> vtx; };

inline std::string encodeIntervals(std::vector<Interval> ivs) {
    std::sort(ivs.begin(), ivs.end(), [](const Interval& a, const Interval& b) {
        if (a.start != b.start) return a.start < b.start;
        if (a.units != b.units) return a.units < b.units;
        return a.n < b.n;
    });
    std::string s;
    for (size_t i = 0; i < ivs.size(); i++) {
        if (i) s += ",";
        s += std::to_string(ivs[i].start) + ":" + std::to_string(ivs[i].units) + ":" + std::to_string(ivs[i].n);
    }
    return s;
}

inline AnalyzeOut analyze(const std::vector<Poly>& reps, const FillCtx& ctx,
                          const std::vector<Poly>* prebuilt = nullptr) {
    double judgeR = ctx.cellDiam + 0.5;
    // torusFill passes its DFS-carried block; analyze's open-vertex tiebreak + first-bad-vertex return
    // depend on the block's iteration order, so it must be the SAME order, not a fresh rebuild.
    std::vector<Poly> localBlock;
    const std::vector<Poly>* blockP = prebuilt;
    if (!blockP) { localBlock = buildBlock(reps, ctx, 5); blockP = &localBlock; }
    const std::vector<Poly>& block = *blockP;
    double incR = judgeR + ctx.maxCircum + 0.01;
    // insertion-ordered incidence: keys in first-seen order (JS Map order)
    std::vector<std::pair<Cyclo, std::vector<Inc>>> inc;
    std::unordered_map<std::string, int> incIdx;
    for (const Poly& p : block) {
        Vec cf = p.centroid.toVector();
        if (jsHypot(cf.x, cf.y) > incR) continue;
        for (size_t i = 0; i < p.verts.size(); i++) {
            std::string kk = p.verts[i].key();
            auto it = incIdx.find(kk);
            int e;
            if (it == incIdx.end()) { e = (int)inc.size(); incIdx[kk] = e; inc.push_back({ p.verts[i], {} }); }
            else e = it->second;
            inc[e].second.push_back({ &p, (int)i });
        }
    }
    int bestIdx = -1; double bestDist = 0; std::vector<Interval> bestIntervals;
    for (size_t idx = 0; idx < inc.size(); idx++) {
        const Cyclo& v = inc[idx].first;
        const std::vector<Inc>& polys = inc[idx].second;
        Vec vf = v.toVector();
        double dist = jsHypot(vf.x, vf.y);
        if (dist > judgeR) continue;
        std::vector<Interval> intervals = coveredIntervals(polys, ctx.N);
        int totalUnits = 0; for (const Interval& it : intervals) totalUnits += it.units;
        if ((double)totalUnits > (double)ctx.N + 0.5) return { 2, "", -1, "", {} }; // over-fill ⇒ contradiction
        if (std::fabs((double)totalUnits - ctx.N) < 0.5) {
            std::unordered_set<std::string> t;
            for (const Inc& pi : polys) t.insert(pi.first->exactKey());
            if (t.size() < 3) continue;                       // legal dent-fill (Myers non-vertex)
            std::string name = canonicalVCName(vcRingNames(polys, ctx.N));
            if (!ctx.allowed.count(name)) return { 2, "", -1, "", {} }; // disallowed VC ⇒ contradiction
            continue;
        }
        if (bestIdx < 0 || dist < bestDist) { bestIdx = (int)idx; bestDist = dist; bestIntervals = intervals; }
    }
    if (bestIdx >= 0)
        return { 1, inc[bestIdx].first.key(), gapStartRay(bestIntervals, ctx.N), encodeIntervals(bestIntervals), { inc[bestIdx].first } };
    return { 0, "", -1, "", {} };
}

inline std::string encodeAnalyze(const AnalyzeOut& a) {
    if (a.kind == 2) return "C";
    if (a.kind == 1) return "O~" + a.openKey + "~" + std::to_string(a.d0) + "~" + a.ivs;
    return "closed";
}
