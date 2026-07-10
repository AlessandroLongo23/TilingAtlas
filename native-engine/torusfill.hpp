// Native port of PeriodSolver.torusFill — the DFS that enumerates every edge-to-edge completion of the
// seed core on the torus T = ℝ²/Λ. Assembled entirely from the validated layers (dedup / block /
// collision / analyze / certificate / primitivity / orbit gate). Returns the emitted cells (each a
// vector of one canonical polygon per lattice class).
//
// Faithful to the TS in the two places byte-identity is fragile:
//  - the DFS carries each cell's block and EXTENDS it by one tile's translates per child (never
//    rebuilds); analyze is handed that carried block, so its order-dependent tiebreaks match;
//  - the early k-gate (countVertexOrbits) runs BEFORE the certificate, exactly as ctx.gate does.
// Diagnostics (the TS diag counters, the star gap-fill spikeBreak, PS_FILL_PROFILE) are omitted — they
// never affect the emitted set. runGate mirrors "ctx.gate is set" (the enumeration path).
#pragma once
#include <string>
#include <vector>
#include <unordered_set>
#include "cyclotomic.hpp"
#include "polygon.hpp"
#include "fillctx.hpp"
#include "collision.hpp"
#include "analyze.hpp"
#include "certificate.hpp"
#include "orbitgate.hpp"

inline std::vector<std::vector<Poly>> torusFill(const std::vector<Poly>& corePolys, const FillCtx& ctx, bool runGate) {
    std::vector<std::vector<Poly>> results;
    std::vector<Poly> initial = dedupModLattice(corePolys, ctx);

    double initialArea = 0; for (const Poly& p : initial) initialArea += tileAreaFloat(p);
    if (initialArea > ctx.cellArea + 1e-6) return results;
    if (coreSelfOverlapsNearest(initial, ctx)) return results;
    std::vector<Poly> initialBlock = buildBlock(initial, ctx, 5);
    if (blockOverlapPeriodic(initial, initialBlock, ctx, 5)) return results;

    bool seedHasStar = !ctx.starTiles.empty();
    bool skipOP1 = seedHasStar;
    Cyclo uL = ctx.u, vL = ctx.v;

    std::vector<Cyclo> initialV;
    for (const Poly& p : initial) initialV = extendV(initialV, p, uL, vL);
    if ((int)initialV.size() > ctx.orbitFloor) return results;

    // P3 stage B — in-fill tile-multiset domination (docs/LATTICE_ADMISSIBILITY_PROOF.md): every
    // emitted cell's per-size counts equal a member of F*(Λ) (ctx.feasVectors, aligned to
    // polySizes); counts grow monotonically, so an undominated state is a dead branch. Empty
    // feasVectors (every pre-P3 request) ⇒ prune off, byte-identical.
    bool p3On = !ctx.feasVectors.empty() && ctx.starTiles.empty();
    int nSizes = (int)ctx.polySizes.size();
    auto sizeIdx = [&](int n) { for (int i = 0; i < nSizes; i++) if (ctx.polySizes[i] == n) return i; return -1; };
    auto dominated = [&](const std::vector<int>& c) {
        for (const auto& f : ctx.feasVectors) {
            bool ok = true;
            for (int i = 0; i < nSizes; i++) if (c[i] > f[i]) { ok = false; break; }
            if (ok) return true;
        }
        return false;
    };
    std::vector<int> initialCounts;
    if (p3On) {
        initialCounts.assign(nSizes, 0);
        for (const Poly& p : initial) { int i = sizeIdx(p.n); if (i >= 0) initialCounts[i]++; }
        if (!dominated(initialCounts)) return results;
    }

    struct Frame { std::vector<Poly> reps; std::vector<Poly> block; std::vector<Cyclo> vReps; std::vector<int> counts; };
    std::vector<Frame> stack;
    stack.push_back({ initial, initialBlock, initialV, initialCounts });
    std::unordered_set<std::string> seenState;

    while (!stack.empty()) {
        Frame fr = std::move(stack.back()); stack.pop_back();
        std::vector<Poly>& reps = fr.reps;
        std::vector<Poly>& block = fr.block;
        std::vector<Cyclo>& vReps = fr.vReps;
        std::vector<int>& counts = fr.counts;

        std::string sk = stateKey(reps);
        if (seenState.count(sk)) continue;
        seenState.insert(sk);
        if ((int)reps.size() > ctx.maxCellPolys) continue;

        AnalyzeOut analysis = analyze(reps, ctx, &block);   // carried block ⇒ order-faithful
        if (analysis.kind == 2) continue;                   // contradiction
        if (analysis.kind == 0) {                           // torus closed
            if (runGate) {
                int orbits = countVertexOrbits(reps, ctx.u, ctx.v);
                if (orbits != -1 && orbits != ctx.k) continue;   // early k-gate reject
            }
            std::unordered_set<std::string> occSet;
            std::unordered_set<std::string>* occ = skipOP1 ? nullptr : &occSet;
            bool cert = isCompleteTiling(reps, ctx, ctx.cellAreaSurd, occ);
            // OP-1 (non-star closure): V<k or occ ⊊ allowed ⇒ discard (byte-identical to the caller's
            // post-certificate discard; only diag counters move). Applied here to mirror opDoom.
            if (cert && !skipOP1) {
                if ((int)vReps.size() < ctx.k) cert = false;
                else if (occSet.size() != ctx.allowed.size()) cert = false;
            }
            if (cert && isPrimitive(reps, ctx)) results.push_back(reps);
            continue;
        }

        // open vertex: corner-complete its CW-most gap
        const Cyclo& w = analysis.vtx[0];
        int d0 = analysis.d0;
        if (d0 < 0) continue;
        std::unordered_set<std::string> repsKeys;
        for (const Poly& r : reps) repsKeys.insert(r.exactKey());

        auto place = [&](const Poly& P) {
            if (properOverlapWithBlock(P, block, ctx)) return;
            CanonRep pc = canonicalRep(P, ctx);
            if (repsKeys.count(pc.key)) return;                       // already present mod Λ
            std::vector<Poly> next = reps; next.push_back(pc.poly);
            if ((int)next.size() > ctx.maxCellPolys) return;
            std::vector<Cyclo> childV = extendV(vReps, pc.poly, uL, vL);
            if ((int)childV.size() > ctx.orbitFloor) return;         // P1 orbit-floor prune
            std::vector<int> childCounts = counts;
            if (p3On) {                                              // P3 stage-B domination prune
                int i = sizeIdx(pc.poly.n);
                if (i >= 0) childCounts[i]++;
                if (!dominated(childCounts)) return;
            }
            std::vector<Poly> childBlock = block;
            std::vector<Poly> add = buildBlock({ pc.poly }, ctx, 5);
            childBlock.insert(childBlock.end(), add.begin(), add.end());
            stack.push_back({ std::move(next), std::move(childBlock), std::move(childV), std::move(childCounts) });
        };
        for (int n : ctx.polySizes) place(Poly::regular(ctx.ring, n, w, d0));
        for (const auto& st : ctx.starTiles) place(Poly::isotoxal(ctx.ring, st.first, st.second, w, d0));
    }
    return results;
}
