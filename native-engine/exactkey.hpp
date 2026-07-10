// Allocation-free EXACT keys for hot membership containers — a drop-in replacement for the decimal-string
// Cyclo::key() / Poly::exactKey() when the key is used ONLY for equality/membership (a hash-set or
// hash-map lookup), never for the emitted lex-min representative. The win: no int128→decimal conversion,
// no string malloc — just a memcpy of the canonical coefficients and a byte hash.
//
// BYTE-IDENTITY ARGUMENT (why swapping string keys for these is safe here): Cyclo::key() is a LOSSLESS
// serialization of the canonical (num, den), so two Cyclos have equal key strings iff CycloKey ==. And
// exactKey()'s composite string "name:centroid:vsorted" is unambiguous (name/':'/';'/Cyclo::key charsets
// are disjoint), so two Polys have equal exactKey strings iff PolyKey ==. Since these containers are used
// only for membership (`.count`/`.find`) and equality (`!=`), never to CHOOSE a representative, the
// decisions are identical to the string version — and PolyKey may sort its vertex keys in ANY consistent
// order (equality of a multiset is order-free), so we sort by the cheap numeric CycloKey compare, not the
// string order. NOT for canonicalRep's lex-min pick (that is defined by decimal-STRING order → keep strings).
#pragma once
#include <array>
#include <vector>
#include <string>
#include <algorithm>
#include <cstdint>
#include "cyclotomic.hpp"

// Exact content of a Cyclo: canonical num (phi ≤ 8 coeffs, tail zero-filled) + den. Equality is exactly
// Cyclo::key() string equality; ordering is a cheap numeric lex order (used only to canonicalize vertex
// multisets — never to pick an emitted rep, so it need not match decimal-string order).
struct CycloKey {
    std::array<i128, 8> num;
    i128 den;
    int len;
    bool operator==(const CycloKey& o) const {
        if (len != o.len || den != o.den) return false;
        for (int i = 0; i < len; i++) if (num[i] != o.num[i]) return false;
        return true;
    }
};

inline CycloKey cycloKey(const Cyclo& c) {
    c.ensureCanon();  // membership equality needs the canonical rep (deferred-gcd Cyclos may be unreduced)
    CycloKey k;
    k.len = c.ring->phi;
    k.den = c.den;
    for (int i = 0; i < k.len; i++) k.num[i] = c.num[i];
    for (int i = k.len; i < 8; i++) k.num[i] = 0;
    return k;
}

inline bool cycloKeyLess(const CycloKey& a, const CycloKey& b) {
    for (int i = 0; i < 8; i++) { if (a.num[i] != b.num[i]) return a.num[i] < b.num[i]; }
    return a.den < b.den;
}

inline void hashI128(uint64_t& h, i128 x) {
    uint64_t lo = (uint64_t)x, hi = (uint64_t)(x >> 64);
    h ^= lo; h *= 1099511628211ULL;
    h ^= hi; h *= 1099511628211ULL;
}

struct CycloKeyHash {
    size_t operator()(const CycloKey& k) const {
        uint64_t h = 1469598103934665603ULL;
        for (int i = 0; i < k.len; i++) hashI128(h, k.num[i]);
        hashI128(h, k.den);
        return (size_t)h;
    }
};

// Exact content of a Poly's identity (name + centroid + vertex multiset), equality-equivalent to
// Poly::exactKey(). Vertices stored in numeric-sorted order so the multiset compares by ==.
struct PolyKey {
    std::string name;
    CycloKey centroid;
    std::vector<CycloKey> verts;
    bool operator==(const PolyKey& o) const {
        if (name != o.name || !(centroid == o.centroid) || verts.size() != o.verts.size()) return false;
        for (size_t i = 0; i < verts.size(); i++) if (!(verts[i] == o.verts[i])) return false;
        return true;
    }
};

// Build a PolyKey from a Poly's own centroid/verts (the untransformed identity).
inline PolyKey polyKeyOf(const Poly& p) {
    PolyKey k;
    k.name = p.name;
    k.centroid = cycloKey(p.centroid);
    k.verts.reserve(p.verts.size());
    for (const Cyclo& v : p.verts) k.verts.push_back(cycloKey(v));
    std::sort(k.verts.begin(), k.verts.end(), cycloKeyLess);
    return k;
}

struct PolyKeyHash {
    size_t operator()(const PolyKey& k) const {
        uint64_t h = 1469598103934665603ULL;
        for (char ch : k.name) { h ^= (uint64_t)(unsigned char)ch; h *= 1099511628211ULL; }
        CycloKeyHash ch;
        h ^= ch(k.centroid) + 0x9e3779b97f4a7c15ULL + (h << 6) + (h >> 2);
        for (const CycloKey& v : k.verts) h ^= ch(v) + 0x9e3779b97f4a7c15ULL + (h << 6) + (h >> 2);
        return (size_t)h;
    }
};
