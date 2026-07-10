// Native port of KUniformityChecker.countVertexOrbits — the exact k-uniformity gate. Reconstruct a
// periodic block from the cell + basis, find the tiling's symmetry group (rotations/reflections/glides
// as g(z)=ζ^r·z+T or ζ^r·conj(z)+T, each verified to map every interior tile onto an existing tile and
// to preserve the lattice), then count vertex orbits by union-find over surrounded-vertex lattice
// classes. Returns the orbit count, or -1 for "cannot gate" (degenerate ⇒ caller keeps the tiling).
//
// The orbit COUNT is invariant to iteration order (it is the number of union-find classes and the
// symmetry relation is representative-independent), so it is bit-identical to the TS regardless of the
// exact incidence/rep order; every underlying float (toVector/jsHypot/jsRound) is already bit-pinned.
#pragma once
#include <string>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <algorithm>
#include <functional>
#include <cmath>
#include "cyclotomic.hpp"
#include "polygon.hpp"
#include "exactkey.hpp"      // CycloKey / PolyKey: allocation-free exact membership keys (no decimal string)
#include "certificate.hpp"   // latticeEquivExact

// Exact test w = m·u + n·v (float solve, exact-verified) — the gate's lattice-preservation check.
inline bool isLatticeCombo(const Cyclo& w, const Cyclo& u, const Cyclo& v) {
    if (w.isZero()) return true;
    Vec d = w.toVector(), a = u.toVector(), b = v.toVector();
    double det = a.x * b.y - a.y * b.x;
    if (std::fabs(det) < 1e-6) return false;
    double m = (d.x * b.y - d.y * b.x) / det;
    double n = (a.x * d.y - a.y * d.x) / det;
    double mi = jsRound(m), ni = jsRound(n);
    if (std::fabs(m - mi) > 1e-3 || std::fabs(n - ni) > 1e-3) return false;
    return w.sub(u.scaleRational((i128)(long)mi).add(v.scaleRational((i128)(long)ni))).isZero();
}

// -1 = null (cannot gate). Otherwise the exact vertex-orbit count.
inline int countVertexOrbits(const std::vector<Poly>& cellPolygons, const Cyclo& u, const Cyclo& v) {
    if (cellPolygons.empty()) return -1;
    const Ring* ring = cellPolygons[0].ring;
    int N = ring->N;                     // gate is N=24-only in the TS; callers use the N=24 ring
    const int FULL_TURN_UNITS = N;

    // Replicate the cell over a (2R+1)² window.
    const int R = 3;
    std::vector<Poly> patch;
    std::unordered_set<PolyKey, PolyKeyHash> seenBlock;
    for (int mi = -R; mi <= R; mi++)
        for (int ni = -R; ni <= R; ni++) {
            Cyclo t = u.scaleRational((i128)mi).add(v.scaleRational((i128)ni));
            for (const Poly& cp : cellPolygons) {
                Poly q = cp.translateExact(t);
                PolyKey k = polyKeyOf(q);
                if (seenBlock.count(k)) continue;
                seenBlock.insert(std::move(k));
                patch.push_back(std::move(q));
            }
        }

    // Float block centre (broadphase).
    double cx = 0, cy = 0;
    for (const Poly& p : patch) { Vec c = p.centroid.toVector(); cx += c.x; cy += c.y; }
    cx /= patch.size(); cy /= patch.size();
    auto distC = [&](const Poly& p) { Vec c = p.centroid.toVector(); return jsHypot(c.x - cx, c.y - cy); };

    Vec uV = u.toVector(), vV = v.toVector();
    double cellDiam = jsMax(jsHypot(uV.x, uV.y), jsHypot(vV.x, vV.y));
    if (cellDiam < 1e-6) return -1;
    double candR = 1.6 * cellDiam, verifyR = 1.1 * cellDiam, vertR = 1.6 * cellDiam;

    std::unordered_set<PolyKey, PolyKeyHash> blockKeySet;
    for (const Poly& p : patch) blockKeySet.insert(polyKeyOf(p));
    double det = uV.x * vV.y - uV.y * vV.x;
    if (std::fabs(det) < 1e-6) return -1;
    std::vector<const Poly*> interior;
    for (const Poly& p : patch) if (distC(p) <= verifyR) interior.push_back(&p);
    if (interior.empty()) return -1;

    // Reference polygon: closest to the centre (first-min on tie).
    const Poly* P0 = &patch[0]; double bestD = distC(patch[0]);
    for (const Poly& p : patch) { double d = distC(p); if (d < bestD) { bestD = d; P0 = &p; } }
    Cyclo c0 = P0->centroid;
    std::string p0Name = P0->name;

    auto mapPoint = [&](const Cyclo& z, bool reflect, int r, const Cyclo& T) {
        return (reflect ? z.conj().mulZeta(r) : z.mulZeta(r)).add(T);
    };
    // transformedKey/reducedMappedKey return the EXACT PolyKey (name + mapped centroid + sorted mapped
    // vertices) instead of a decimal string — used only for equality (`!=`) / membership (`blockKeySet`),
    // which is exactly equivalent to the old string compare (Cyclo::key is a lossless serialization), so
    // the orbit count is byte-identical; the vertex multiset may sort in any consistent order.
    auto transformedKey = [&](const Poly& p, bool reflect, int r, const Cyclo& T) -> PolyKey {
        PolyKey k;
        k.name = p.name;
        k.centroid = cycloKey(mapPoint(p.centroid, reflect, r, T));
        k.verts.reserve(p.verts.size());
        for (const Cyclo& vx : p.verts) k.verts.push_back(cycloKey(mapPoint(vx, reflect, r, T)));
        std::sort(k.verts.begin(), k.verts.end(), cycloKeyLess);
        return k;
    };
    auto reducedMappedKey = [&](const Poly& p, bool reflect, int r, const Cyclo& T) -> PolyKey {
        Cyclo gc = mapPoint(p.centroid, reflect, r, T);
        Vec g = gc.toVector();
        double dx = g.x - cx, dy = g.y - cy;
        long a = (long)jsRound((dx * vV.y - dy * vV.x) / det);
        long b = (long)jsRound((uV.x * dy - uV.y * dx) / det);
        Cyclo Tred = u.scaleRational((i128)(-a)).add(v.scaleRational((i128)(-b)));
        PolyKey k;
        k.name = p.name;
        k.centroid = cycloKey(gc.add(Tred));
        k.verts.reserve(p.verts.size());
        for (const Cyclo& vx : p.verts) k.verts.push_back(cycloKey(mapPoint(vx, reflect, r, T).add(Tred)));
        std::sort(k.verts.begin(), k.verts.end(), cycloKeyLess);
        return k;
    };

    // Find the symmetry group.
    struct Sym { bool reflect; int r; Cyclo T; };
    std::vector<Sym> syms;
    std::unordered_set<std::string> symSig;
    for (const Poly& Q : patch) {
        if (Q.name != p0Name || distC(Q) > candR) continue;
        Cyclo cQ = Q.centroid;
        PolyKey qKey = polyKeyOf(Q);
        for (bool reflect : { false, true }) {
            for (int r = 0; r < N; r++) {
                Cyclo Mc0 = reflect ? c0.conj().mulZeta(r) : c0.mulZeta(r);
                Cyclo T = cQ.sub(Mc0);
                if (!(transformedKey(*P0, reflect, r, T) == qKey)) continue;
                std::string sig = std::string(reflect ? "1" : "0") + ":" + std::to_string(r) + ":" + T.key();
                if (symSig.count(sig)) continue;
                Cyclo Mu = reflect ? u.conj().mulZeta(r) : u.mulZeta(r);
                Cyclo Mv = reflect ? v.conj().mulZeta(r) : v.mulZeta(r);
                if (!isLatticeCombo(Mu, u, v) || !isLatticeCombo(Mv, u, v)) continue;
                bool ok = true;
                for (const Poly* p : interior)
                    if (!blockKeySet.count(reducedMappedKey(*p, reflect, r, T))) { ok = false; break; }
                if (!ok) continue;
                symSig.insert(sig);
                syms.push_back({ reflect, r, T });
            }
        }
    }
    if (syms.empty()) return -1;

    // Surrounded-vertex incidence (insertion order).
    struct IncV { Cyclo vertex; int units; std::unordered_set<std::string> tiles; };
    std::vector<IncV> incVec;
    std::unordered_map<CycloKey, int, CycloKeyHash> incIdx;  // exact vertex key, no decimal string (grouping only)
    for (const Poly& p : patch) {
        const std::string& pk = p.exactKey();  // cached; tiles set stays string (t≥3 distinct-tile test)
        for (size_t i = 0; i < p.verts.size(); i++) {
            int uUnit = p.cornerAngleUnits((int)i);
            CycloKey k = cycloKey(p.verts[i]);
            auto it = incIdx.find(k);
            if (it == incIdx.end()) {
                int e = (int)incVec.size(); incIdx[k] = e;
                incVec.push_back(IncV{ p.verts[i], uUnit, { pk } });
            } else { incVec[it->second].units += uUnit; incVec[it->second].tiles.insert(pk); }
        }
    }
    std::vector<Cyclo> reps;
    for (const IncV& e : incVec) {
        if (e.units != FULL_TURN_UNITS) continue;
        if (e.tiles.size() < 3) continue;
        Vec vv = e.vertex.toVector();
        if (jsHypot(vv.x - cx, vv.y - cy) > vertR) continue;
        bool dup = false;
        for (const Cyclo& rp : reps) if (latticeEquivExact(e.vertex, rp, u, v)) { dup = true; break; }
        if (dup) continue;
        reps.push_back(e.vertex);
    }
    if (reps.empty()) return -1;

    // Union-find: rep i ~ rep j iff some symmetry maps i onto j (mod lattice).
    std::vector<int> parent(reps.size());
    for (size_t i = 0; i < reps.size(); i++) parent[i] = (int)i;
    std::function<int(int)> find = [&](int x) { while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    auto uni = [&](int a, int b) { int ra = find(a), rb = find(b); if (ra != rb) parent[ra] = rb; };
    for (size_t i = 0; i < reps.size(); i++) {
        for (const Sym& g : syms) {
            Cyclo gw = mapPoint(reps[i], g.reflect, g.r, g.T);
            for (size_t j = 0; j < reps.size(); j++) {
                if (find((int)i) == find((int)j)) continue;
                if (latticeEquivExact(gw, reps[j], u, v)) { uni((int)i, (int)j); break; }
            }
        }
    }
    std::unordered_set<int> roots;
    for (size_t i = 0; i < reps.size(); i++) roots.insert(find((int)i));
    return (int)roots.size();
}
