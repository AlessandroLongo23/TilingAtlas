// Native port of the exact placed-polygon object: the decision-carrying core of Polygon.ts +
// RegularPolygon.fromAnchorAndDirExact + ExactStarPolygon.isotoxal. Everything the DFS decides on
// (identity, corner angles, VC tokens) is computed here from exact ℤ[ζ_N] vertices — no float.
//
// A Poly is immutable after construction (the TS produces NEW polygons for every transform), so the
// transforms return fresh Polys. Fields mirror the TS "exact source of truth":
//   verts      = exactVertices (boundary walk, CCW)
//   halfways   = exactHalfways (edge midpoints) — needed by the float broadphase in polygon_float.hpp
//   centroid   = exactCentroid = (Σ verts)/count  (vertex mean; the true centroid for regular tiles)
//   edgeDirs   = integer ζ-exponent of edge vᵢ→vᵢ₊₁ (a unit edge is ζ^k for exactly one k)
//   name       = getName(): "n" for a regular n-gon, "n*@α" for a star (matches exactKey's namespace)
#pragma once
#include <string>
#include <vector>
#include <algorithm>
#include "cyclotomic.hpp"

struct Poly {
    const Ring* ring;
    int n;                        // edge-count param: sides for a regular n-gon, POINTS for a star (2n verts)
    bool isStar;
    int alphaU;                   // star point interior angle (pi/12 units); 0 for regular
    std::string name;
    std::vector<Cyclo> verts;
    std::vector<Cyclo> halfways;
    Cyclo centroid;
    std::vector<int> edgeDirs;
    mutable std::string exactKeyCache_;  // memoized exactKey() (Poly is immutable after construction)

    Poly(const Ring* r, int n_, bool star, int alpha, std::string nm,
         std::vector<Cyclo> vs, std::vector<Cyclo> hw, Cyclo cen, std::vector<int> ed)
        : ring(r), n(n_), isStar(star), alphaU(alpha), name(std::move(nm)),
          verts(std::move(vs)), halfways(std::move(hw)), centroid(std::move(cen)), edgeDirs(std::move(ed)) {}

    // setExactVertices (Polygon.ts): derive centroid (vertex mean) + halfway midpoints from verts+edgeDirs.
    static Poly fromExact(const Ring* r, int n_, bool star, int alpha, std::string nm,
                          std::vector<Cyclo> vs, std::vector<int> ed) {
        Cyclo sum = vs[0];
        for (size_t i = 1; i < vs.size(); i++) sum = sum.add(vs[i]);
        Cyclo cen = sum.scaleRational(1, (i128)vs.size());
        std::vector<Cyclo> hw;
        hw.reserve(vs.size());
        for (size_t i = 0; i < vs.size(); i++)
            hw.push_back(vs[i].add(vs[(i + 1) % vs.size()]).scaleRational(1, 2));
        return Poly(r, n_, star, alpha, std::move(nm), std::move(vs), std::move(hw), std::move(cen), std::move(ed));
    }

    // RegularPolygon.fromAnchorAndDirExact: unit-edge boundary walk, exterior turn N/n each vertex.
    static Poly regular(const Ring* r, int n_, const Cyclo& anchor, int dirIndex) {
        int N = r->N;
        int turn = N / n_;                       // exterior turn 2pi/n in units of 2pi/N (integer since n | N)
        std::vector<Cyclo> vs;
        std::vector<int> ed;
        Cyclo p = anchor;
        int dir = ((dirIndex % N) + N) % N;
        for (int i = 0; i < n_; i++) {
            vs.push_back(p);
            ed.push_back(dir);
            p = p.add(Cyclo::zeta(r, dir));
            dir = (dir + turn) % N;
        }
        return fromExact(r, n_, false, 0, std::to_string(n_), std::move(vs), std::move(ed));
    }

    // ExactStarPolygon.isotoxal: unit-edge walk with exterior turns cycling [12-beta, 12-alpha].
    // Vertex 0 is a convex POINT; corners then alternate dent/point (even idx = point, odd = dent).
    static Poly isotoxal(const Ring* r, int nPoints, int alphaU_, const Cyclo& anchor, int dirIndex) {
        int N = r->N;                            // requires N = 24 in the TS; callers use the N=24 ring
        int betaU = 24 - 24 / nPoints - alphaU_;
        int dentTurn = 12 - betaU;
        int pointTurn = 12 - alphaU_;
        std::vector<Cyclo> vs;
        std::vector<int> ed;
        Cyclo p = anchor;
        int dir = ((dirIndex % N) + N) % N;
        for (int i = 0; i < 2 * nPoints; i++) {
            vs.push_back(p);
            ed.push_back(dir);
            p = p.add(Cyclo::zeta(r, dir));
            int turn = (i % 2 == 0) ? dentTurn : pointTurn;   // edge 0 -> dent at v1, edge 1 -> point at v2, ...
            dir = (((dir + turn) % N) + N) % N;
        }
        std::string nm = std::to_string(nPoints) + "*@" + std::to_string(alphaU_);
        return fromExact(r, nPoints, true, alphaU_, std::move(nm), std::move(vs), std::move(ed));
    }

    // exactKey: canonical identity = name : centroid.key() : sorted vertex keys (";"-joined). Byte-identical
    // to Polygon.exactKey (JS default string sort == std::sort over ASCII keys). Memoized (mirrors the TS
    // `_exactKey`): Poly is immutable after construction, so the key is built once and cached; returns a
    // const ref so the hot repeat callers (stateKey per pop, blockKeySet/incidence per patch poly) pay no
    // per-call rebuild or malloc. exactKey is never empty (name is ≥1 char) ⇒ empty = "not yet computed".
    const std::string& exactKey() const {
        if (!exactKeyCache_.empty()) return exactKeyCache_;
        std::vector<std::string> vk;
        vk.reserve(verts.size());
        for (const Cyclo& v : verts) vk.push_back(v.key());
        std::sort(vk.begin(), vk.end());
        std::string s = name + ":" + centroid.key() + ":";
        for (size_t i = 0; i < vk.size(); i++) { if (i) s += ";"; s += vk[i]; }
        exactKeyCache_ = std::move(s);
        return exactKeyCache_;
    }

    // interior angle at corner i in 2pi/N units, reflex-aware (mod N): exterior turn = outDir - inDir,
    // interior = N/2 - exterior (mod N). Correct for star dents (returns > N/2).
    int cornerAngleUnits(int i) const {
        int N = ring->N;
        int L = (int)edgeDirs.size();
        int prev = (i - 1 + L) % L;
        int ext = (((edgeDirs[i] - edgeDirs[prev]) % N) + N) % N;
        return (((N / 2 - ext) % N) + N) % N;
    }

    // VC token naming corner i: bare "n" for a regular tile; point/dent-tagged for a star corner.
    std::string cornerToken(int i) const {
        if (!isStar) return std::to_string(n);
        int u = cornerAngleUnits(i);
        int straight = ring->N / 2;              // pi in 2pi/N units; reflex (dent) => u > straight
        return std::to_string(n) + "*" + (u > straight ? "d" : "p") + "@" + std::to_string(u);
    }

    // translateExact: shift verts/halfways/centroid by t (edgeDirs unchanged). Returns a fresh Poly.
    Poly translateExact(const Cyclo& t) const {
        std::vector<Cyclo> vs; vs.reserve(verts.size());
        for (const Cyclo& v : verts) vs.push_back(v.add(t));
        std::vector<Cyclo> hw; hw.reserve(halfways.size());
        for (const Cyclo& h : halfways) hw.push_back(h.add(t));
        Cyclo cen = centroid.add(t);
        return Poly(ring, n, isStar, alphaU, name, std::move(vs), std::move(hw), cen, edgeDirs);
    }
};
