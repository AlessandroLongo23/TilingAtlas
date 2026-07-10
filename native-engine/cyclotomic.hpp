// Native port of lib/classes/Cyclotomic.ts — an element of ℚ(ζ_N) ⊂ ℂ (a 2D point), stored as
// a length-φ coefficient vector in the power basis, reduced mod Φ_N, gcd-canonicalized, den > 0.
// Faithful to the TS: same reduction, same canonical form, same key() string. int128 coefficients
// (TS uses bigint). Immutable value type; every op returns a new Cyclo.
#pragma once
#include <vector>
#include <array>
#include <string>
#include <stdexcept>
#include <cstdint>
#include <cstring>
#include "int128.hpp"
#include "vec.hpp"

inline double bits2d(uint64_t b) { double d; std::memcpy(&d, &b, sizeof d); return d; }

struct Ring {
    int N, phi;
    std::vector<i128> phiPoly;  // length phi+1, monic (phiPoly[phi]==1)
    // cos/sin of 2πj/N for j=0..phi-1, BAKED as the exact IEEE-754 bits the TS ring computes (Math.cos/
    // Math.sin evaluated once in V8). Baking the bits — instead of recomputing cos/sin natively, which
    // would differ ~1 ULP from V8 — makes toVector bit-identical, so the DFS's exact canonicalization
    // (which sits on float culls of toVector positions) reproduces the TS exactly.
    std::vector<double> basisCos, basisSin;

    Ring(int N_, int phi_, std::vector<i128> pp, std::vector<uint64_t> cosBits, std::vector<uint64_t> sinBits)
        : N(N_), phi(phi_), phiPoly(std::move(pp)) {
        for (uint64_t b : cosBits) basisCos.push_back(bits2d(b));
        for (uint64_t b : sinBits) basisSin.push_back(bits2d(b));
    }

    static const Ring& create(int N) {
        // Φ₁₂ = x⁴ − x² + 1 ; basis bits dumped from CyclotomicRing.create(12).basisCos/basisSin.
        static const Ring R12(12, 4, {1, 0, -1, 0, 1},
            {0x3ff0000000000000ULL, 0x3febb67ae8584cabULL, 0x3fe0000000000001ULL, 0x3c91a62633145c07ULL},
            {0x0000000000000000ULL, 0x3fdfffffffffffffULL, 0x3febb67ae8584caaULL, 0x3ff0000000000000ULL});
        // Φ₂₄ = x⁸ − x⁴ + 1 ; basis bits dumped from CyclotomicRing.create(24).basisCos/basisSin.
        static const Ring R24(24, 8, {1, 0, 0, 0, -1, 0, 0, 0, 1},
            {0x3ff0000000000000ULL, 0x3feee8dd4748bf15ULL, 0x3febb67ae8584cabULL, 0x3fe6a09e667f3bcdULL,
             0x3fe0000000000001ULL, 0x3fd0907dc1930690ULL, 0x3c91a62633145c07ULL, 0xbfd0907dc193068eULL},
            {0x0000000000000000ULL, 0x3fd0907dc1930690ULL, 0x3fdfffffffffffffULL, 0x3fe6a09e667f3bccULL,
             0x3febb67ae8584caaULL, 0x3feee8dd4748bf15ULL, 0x3ff0000000000000ULL, 0x3feee8dd4748bf15ULL});
        if (N == 12) return R12;
        if (N == 24) return R24;
        throw std::runtime_error("Ring: unsupported N (have 12, 24)");
    }

    // Reduce a raw coefficient array (any length) to canonical length-φ by long division by Φ_N.
    std::vector<i128> reduce(std::vector<i128> r) const {
        for (int i = (int)r.size() - 1; i >= phi; --i) {
            i128 c = r[i];
            if (c == 0) continue;
            for (int j = 0; j <= phi; ++j) { r[i - phi + j] -= c * phiPoly[j]; OVF_GUARD(r[i - phi + j]); }
        }
        r.resize(phi, 0);
        return r;
    }
};

struct Cyclo {
    const Ring* ring;
    // A fixed stack array (φ(24)=8 max) instead of a heap vector ⇒ no malloc/free per op. `num`/`den` are
    // REDUCED mod Φ_N and sign-normalized (den > 0) eagerly, but the gcd-DIVISION is DEFERRED to the first
    // read (`ensureCanon`, cached): a Cyclo built by a chain of ops and read once pays one gcd, not one per
    // intermediate. `mutable` because canonicalization changes the REPRESENTATION, not the value. Every
    // direct reader of num/den (key/toVector/equals/cycloKey/the surd bridge/difftest) calls ensureCanon
    // first, so the observed (num,den) is the unique canonical form — byte-identical to the eager version.
    mutable std::array<i128, 8> num;  // num[0..phi-1] meaningful, num[phi..7] = 0
    mutable i128 den;                 // > 0 (sign eager); gcd-reduced iff canon_
    mutable bool canon_;

    // Construct from a raw coefficient buffer raw[0..rawLen-1] (rawLen ≥ φ before reduction): reduce mod
    // Φ_N (unless skipReduce ⇒ caller guarantees rawLen == φ) and normalize the sign; gcd is deferred.
    Cyclo(const Ring* ring_, const i128* raw, int rawLen, i128 den_, bool skipReduce) : ring(ring_) {
        if (den_ == 0) throw std::runtime_error("Cyclo: zero denominator");
        int phi = ring_->phi;
        i128 buf[32];
        for (int i = 0; i < rawLen; i++) buf[i] = raw[i];
        if (!skipReduce) {
            for (int i = rawLen - 1; i >= phi; --i) {
                i128 c = buf[i];
                if (c == 0) continue;
                for (int j = 0; j <= phi; ++j) { buf[i - phi + j] -= c * ring_->phiPoly[j]; OVF_GUARD(buf[i - phi + j]); }
            }
        }
        for (int i = 0; i < phi; i++) num[i] = buf[i];
        for (int i = phi; i < 8; i++) num[i] = 0;
        if (den_ < 0) { den_ = -den_; for (int i = 0; i < phi; i++) num[i] = -num[i]; }
        den = den_;
        canon_ = false;
    }

    // Deferred gcd-canonicalization (idempotent): divide num/den by their gcd so the representation is the
    // unique canonical form. Sign is already normalized in the ctor, so this only removes a common factor.
    void ensureCanon() const {
        if (canon_) return;
        int phi = ring->phi;
        i128 g = abs128(den);
        for (int i = 0; i < phi; i++) g = gcd128(g, num[i]);
        if (g == 0) g = 1;  // all-zero numerator
        if (g != 1) { den /= g; for (int i = 0; i < phi; i++) num[i] /= g; }
        canon_ = true;
    }
    // Delegating vector ctor: keeps the difftest/bench parse sites (Cyclo(ring, vector, den, skip)) working.
    Cyclo(const Ring* ring_, const std::vector<i128>& raw, i128 den_ = 1, bool skipReduce = false)
        : Cyclo(ring_, raw.data(), (int)raw.size(), den_, skipReduce) {}

    static Cyclo zero(const Ring* r) { i128 z[8] = {0}; return Cyclo(r, z, r->phi, 1, true); }
    static Cyclo one(const Ring* r) { i128 z[8] = {0}; z[0] = 1; return Cyclo(r, z, r->phi, 1, true); }
    static Cyclo fromRational(const Ring* r, i128 p, i128 q = 1) { i128 z[8] = {0}; z[0] = p; return Cyclo(r, z, r->phi, q, true); }

    Cyclo add(const Cyclo& o) const {
        int phi = ring->phi;
        i128 n[8];
        for (int i = 0; i < phi; i++) { n[i] = num[i] * o.den + o.num[i] * den; OVF_GUARD(n[i]); }
        return Cyclo(ring, n, phi, den * o.den, true);
    }
    Cyclo sub(const Cyclo& o) const {
        int phi = ring->phi;
        i128 n[8];
        for (int i = 0; i < phi; i++) { n[i] = num[i] * o.den - o.num[i] * den; OVF_GUARD(n[i]); }
        return Cyclo(ring, n, phi, den * o.den, true);
    }
    Cyclo neg() const {
        int phi = ring->phi;
        i128 n[8];
        for (int i = 0; i < phi; i++) n[i] = -num[i];
        return Cyclo(ring, n, phi, den, true);
    }
    // Full multiply: convolve (degree ≤ 2φ−2), then reduce mod Φ_N.
    Cyclo mul(const Cyclo& o) const {
        int phi = ring->phi;
        i128 raw[16] = {0};  // 2φ−1 ≤ 15
        for (int i = 0; i < phi; i++) {
            if (num[i] == 0) continue;
            for (int j = 0; j < phi; j++) {
                if (o.num[j] == 0) continue;
                raw[i + j] += num[i] * o.num[j];
                OVF_GUARD(raw[i + j]);
            }
        }
        return Cyclo(ring, raw, 2 * phi - 1, den * o.den, false);
    }
    // Multiply by ζ^k: shift up by k, then reduce.
    Cyclo mulZeta(int k) const {
        int N = ring->N, phi = ring->phi;
        k = ((k % N) + N) % N;
        if (k == 0) return *this;
        i128 raw[32] = {0};  // φ + k ≤ 8 + 23 = 31
        for (int j = 0; j < phi; j++) raw[j + k] = num[j];
        return Cyclo(ring, raw, phi + k, den, false);
    }
    // Complex conjugate: ζ ↦ ζ^{N-1}.
    Cyclo conj() const {
        int N = ring->N, phi = ring->phi;
        i128 raw[24] = {0};
        for (int j = 0; j < phi; j++) raw[(N - j) % N] += num[j];
        return Cyclo(ring, raw, N, den, false);
    }
    Cyclo scaleRational(i128 p, i128 q = 1) const {
        if (q == 0) throw std::runtime_error("Cyclo::scaleRational: zero denominator");
        int phi = ring->phi;
        i128 n[8];
        for (int i = 0; i < phi; i++) { n[i] = num[i] * p; OVF_GUARD(n[i]); }
        return Cyclo(ring, n, phi, den * q, true);
    }
    Cyclo normSquared() const { return mul(conj()); }

    bool equals(const Cyclo& o) const {
        ensureCanon(); o.ensureCanon();
        if (den != o.den) return false;
        for (int i = 0; i < 8; i++) if (num[i] != o.num[i]) return false;  // tail zeros compare equal
        return true;
    }
    // isZero needs no canon: a zero VALUE has all-zero num regardless of a deferred common factor.
    bool isZero() const { for (int i = 0; i < 8; i++) if (num[i] != 0) return false; return true; }

    // Canonical key, byte-identical to TS `${den}|${num.join(",")}` — loops φ (NOT 8) so no tail-zero suffix.
    std::string key() const {
        ensureCanon();
        std::string s = to_string128(den) + "|";
        int phi = ring->phi;
        for (int i = 0; i < phi; i++) { if (i) s += ","; s += to_string128(num[i]); }
        return s;
    }
    static Cyclo zeta(const Ring* r, int k) { return one(r).mulZeta(k); }

    // Numeric evaluation Σ (num_j/den)·(cos,sin)(2πj/N) → float point. RENDER/CULL ONLY — never a
    // decision. Matched op order to the TS (mul then add, no FMA under -ffp-contract=off). At the DFS's
    // magnitudes (|num|≲200, den≤~24) every (double)num_j and (double)den is exact, so Number(bigint)
    // and the i128→double cast agree, and the baked basis makes the whole sum bit-identical to V8.
    Vec toVector() const {
        ensureCanon();  // required: non-reduced coeffs can exceed 2^53 ⇒ the (double) casts would round differently
        double d = (double)den;
        double x = 0.0, y = 0.0;
        int phi = ring->phi;
        for (int j = 0; j < phi; j++) {
            double a = (double)num[j] / d;
            x += a * ring->basisCos[j];
            y += a * ring->basisSin[j];
        }
        return Vec{ x, y };
    }
};
