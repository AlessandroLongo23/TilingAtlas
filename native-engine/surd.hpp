// Native port of lib/classes/algorithm/exact/Surd.ts — exact arithmetic in ℚ(√2,√3) = ℚ(ζ₂₄)⁺.
// A Surd is (P + Q√2 + R√3 + S√6)/D, gcd-canonicalized, D > 0. This is where exact AREAS and the
// signed lattice determinant det = Im(conj(u)·v) live. Faithful to the TS incl. the semi-static
// error-bound sign() filter; int128 coefficients. The bridges (imSurd/reSurd/detSurd/…) convert
// between ℤ[ζ₂₄] points (Cyclo) and their exact real Surds.
#pragma once
#include <string>
#include <vector>
#include <cmath>
#include <stdexcept>
#include "int128.hpp"
#include "cyclotomic.hpp"

// Correctly-rounded doubles of the irrational constants (match the TS literals exactly).
static const double SIGN_SQRT2 = 1.4142135623730951;  // Math.SQRT2
static const double SIGN_SQRT3 = 1.7320508075688772;
static const double SIGN_SQRT6 = 2.449489742783178;
static const double NUM_EPSILON = 2.220446049250313e-16;  // Number.EPSILON = 2^-52
static const int C_SIGN = 32;

struct Surd {
    i128 P, Q, R, S, D;  // (P + Q√2 + R√3 + S√6)/D, D > 0, gcd(P,Q,R,S,D)=1

    Surd(i128 P_ = 0, i128 Q_ = 0, i128 R_ = 0, i128 S_ = 0, i128 D_ = 1) {
        if (D_ == 0) throw std::runtime_error("Surd: zero denominator");
        if (D_ < 0) { P_ = -P_; Q_ = -Q_; R_ = -R_; S_ = -S_; D_ = -D_; }
        i128 g = D_;
        g = gcd128(g, P_); g = gcd128(g, Q_); g = gcd128(g, R_); g = gcd128(g, S_);
        if (g == 0) g = 1;
        P = P_ / g; Q = Q_ / g; R = R_ / g; S = S_ / g; D = D_ / g;
    }

    static Surd rational(i128 p, i128 q = 1) { return Surd(p, 0, 0, 0, q); }

    Surd add(const Surd& o) const {
        return Surd(P * o.D + o.P * D, Q * o.D + o.Q * D, R * o.D + o.R * D, S * o.D + o.S * D, D * o.D);
    }
    Surd neg() const { return Surd(-P, -Q, -R, -S, D); }
    Surd sub(const Surd& o) const { return add(o.neg()); }
    // √2·√2=2, √3·√3=3, √6·√6=6, √2·√3=√6, √2·√6=2√3, √3·√6=3√2.
    Surd mul(const Surd& o) const {
        i128 nP = P * o.P + 2 * Q * o.Q + 3 * R * o.R + 6 * S * o.S;
        i128 nQ = P * o.Q + Q * o.P + 3 * R * o.S + 3 * S * o.R;
        i128 nR = P * o.R + R * o.P + 2 * Q * o.S + 2 * S * o.Q;
        i128 nS = P * o.S + S * o.P + Q * o.R + R * o.Q;
        OVF_GUARD(nP); OVF_GUARD(nQ); OVF_GUARD(nR); OVF_GUARD(nS);
        return Surd(nP, nQ, nR, nS, D * o.D);
    }
    Surd scaleRational(i128 p, i128 q = 1) const { return Surd(P * p, Q * p, R * p, S * p, D * q); }

    Surd inverse() const {
        if (isZero()) throw std::runtime_error("Surd: inverse of zero");
        Surd y2(P, -Q, R, -S, D), y3(P, Q, -R, -S, D), y23(P, -Q, -R, S, D);
        Surd m = y2.mul(y3).mul(y23);
        Surd norm = mul(m);
        if (norm.Q != 0 || norm.R != 0 || norm.S != 0) throw std::runtime_error("Surd::inverse: norm not rational");
        return m.scaleRational(norm.D, norm.P);
    }
    Surd div(const Surd& o) const { return mul(o.inverse()); }

    bool equals(const Surd& o) const { return P == o.P && Q == o.Q && R == o.R && S == o.S && D == o.D; }
    bool isZero() const { return P == 0 && Q == 0 && R == 0 && S == 0; }
    bool isRational() const { return Q == 0 && R == 0 && S == 0; }
    Surd abs() const { return sign() < 0 ? neg() : *this; }

    // −1 | 0 | +1, exact. Float filter first (accepted only when provably the true sign), else exact.
    int sign() const {
        if (isZero()) return 0;
        double p = (double)P;
        double q = (double)Q * SIGN_SQRT2;
        double r = (double)R * SIGN_SQRT3;
        double s = (double)S * SIGN_SQRT6;
        double d = (double)D;
        double f = (p + q + r + s) / d;
        double M = (std::fabs(p) + std::fabs(q) + std::fabs(r) + std::fabs(s)) / d;
        if (std::isfinite(f) && std::fabs(f) > C_SIGN * NUM_EPSILON * M) return f > 0 ? 1 : -1;
        return signExact();
    }
    int cmp(const Surd& o) const { return sub(o).sign(); }

    // Float value — broadphase only, never a decision. SIGN_SQRT2/3/6 are the same doubles as V8's
    // Math.SQRT2 / Math.sqrt(3) / Math.sqrt(6); matched op order + -ffp-contract=off ⇒ bit-identical.
    double toFloat() const {
        return ((double)P + (double)Q * SIGN_SQRT2 + (double)R * SIGN_SQRT3 + (double)S * SIGN_SQRT6) / (double)D;
    }

    // Exact sign via rational enclosures of √2,√3,√6 at doubling precision (int128-bounded).
    int signExact() const {
        i128 T = (i128)1 << 32;
        for (int iter = 0; iter < 256; iter++) {
            if (T >> 61) throw std::runtime_error("Surd::signExact: precision exceeds int128 (unexpected for real inputs)");
            i128 T2 = T * T;
            i128 lo2 = isqrt128(2 * T2), hi2 = lo2 + 1;
            i128 lo3 = isqrt128(3 * T2), hi3 = lo3 + 1;
            i128 lo6 = isqrt128(6 * T2), hi6 = lo6 + 1;
            auto lo = [](i128 c, i128 l, i128 h) { return c >= 0 ? c * l : c * h; };
            auto hi = [](i128 c, i128 l, i128 h) { return c >= 0 ? c * h : c * l; };
            i128 Lnum = P * T + lo(Q, lo2, hi2) + lo(R, lo3, hi3) + lo(S, lo6, hi6);
            i128 Hnum = P * T + hi(Q, lo2, hi2) + hi(R, lo3, hi3) + hi(S, lo6, hi6);
            if (Lnum > 0) return 1;
            if (Hnum < 0) return -1;
            T <<= 8;
        }
        throw std::runtime_error("Surd::signExact: failed to separate from zero");
    }

    std::string encode() const {  // matches the test-trace format {P,Q,R,S,D}
        return to_string128(P) + "," + to_string128(Q) + "," + to_string128(R) + "," + to_string128(S) + "," + to_string128(D);
    }
};

// ---- bridges (ℤ[ζ₂₄] ↔ ℚ(√2,√3)); require N=24 ----
inline Surd tileAreaSurd(int n) {
    switch (n) {
        case 3: return Surd(0, 0, 1, 0, 4);
        case 4: return Surd(1, 0, 0, 0, 1);
        case 6: return Surd(0, 0, 3, 0, 2);
        case 8: return Surd(2, 2, 0, 0, 1);
        case 12: return Surd(6, 0, 3, 0, 1);
        default: throw std::runtime_error("tileAreaSurd: unsupported n");
    }
}
inline Surd imSurd(const Cyclo& c) {
    if (c.ring->N != 24) throw std::runtime_error("imSurd: requires N=24");
    c.ensureCanon();
    const auto& b = c.num;
    return Surd(2 * b[2] + 4 * b[6], -b[1] + 2 * b[3] + b[5] + b[7], 2 * b[4], b[1] + b[5] + b[7], 4 * c.den);
}
inline Surd reSurd(const Cyclo& c) {
    if (c.ring->N != 24) throw std::runtime_error("reSurd: requires N=24");
    c.ensureCanon();
    const auto& b = c.num;
    return Surd(4 * b[0] + 2 * b[4], b[1] + 2 * b[3] - b[5] + b[7], 2 * b[2], b[1] + b[5] - b[7], 4 * c.den);
}
inline Surd detSurd(const Cyclo& u, const Cyclo& v) { return imSurd(u.conj().mul(v)); }
inline Surd polygonAreaSurd(const std::vector<Cyclo>& verts) {
    Surd acc(0, 0, 0, 0, 1);
    int L = (int)verts.size();
    for (int i = 0; i < L; i++) acc = acc.add(detSurd(verts[i], verts[(i + 1) % L]));
    return acc.scaleRational(1, 2).abs();
}
