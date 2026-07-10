// Same computation as bench.cpp, but with the REPRESENTATION optimized (the actual lever):
//   - fixed std::array<i128,8> on the stack, zero heap allocation per op
//   - reduction mod Φ₂₄ = x⁸−x⁴+1 (x^i = x^{i-4} − x^{i-8}) inlined on a fixed raw buffer
//   - gcd-canonicalization DEFERRED to the read point, not every intermediate op
// Canonicalizes once before the checksum, so output equals the faithful/TS checksum.
#include <cstdio>
#include <array>
#include <chrono>
#include "int128.hpp"

using A8 = std::array<i128, 8>;
struct FC { A8 num; i128 den; };

// fold a raw coefficient buffer raw[0..len-1] (degree len-1) down to degree < 8, in place; return low 8
static inline A8 fold(i128* raw, int len) {
    for (int i = len - 1; i >= 8; --i) {
        i128 c = raw[i];
        if (c == 0) continue;
        raw[i - 4] += c;   // x^i = x^{i-4} − x^{i-8}
        raw[i - 8] -= c;
        raw[i] = 0;
    }
    A8 o; for (int i = 0; i < 8; i++) o[i] = raw[i];
    return o;
}
static inline FC fmul(const FC& a, const FC& b) {
    i128 raw[15] = {0};
    for (int i = 0; i < 8; i++) { if (!a.num[i]) continue; for (int j = 0; j < 8; j++) raw[i + j] += a.num[i] * b.num[j]; }
    return {fold(raw, 15), a.den * b.den};
}
static inline FC fmulZeta(const FC& a, int k) {
    k = ((k % 24) + 24) % 24;
    i128 raw[32] = {0};
    for (int j = 0; j < 8; j++) raw[j + k] += a.num[j];
    return {fold(raw, 8 + k), a.den};
}
static inline FC fadd(const FC& a, const FC& b) {
    A8 n; for (int i = 0; i < 8; i++) n[i] = a.num[i] * b.den + b.num[i] * a.den;
    return {n, a.den * b.den};
}
static inline FC fconj(const FC& a) {
    i128 raw[24] = {0};
    for (int j = 0; j < 8; j++) raw[(24 - j) % 24] += a.num[j];
    return {fold(raw, 24), a.den};
}
static inline void canon(FC& a) {
    i128 g = abs128(a.den);
    for (int i = 0; i < 8; i++) g = gcd128(g, a.num[i]);
    if (g == 0) g = 1;
    i128 d = a.den / g;
    for (int i = 0; i < 8; i++) a.num[i] /= g;
    if (d < 0) { d = -d; for (int i = 0; i < 8; i++) a.num[i] = -a.num[i]; }
    a.den = d;
}

int main(int argc, char** argv) {
    long N = argc > 1 ? atol(argv[1]) : 3000000;
    FC x{{3, -1, 4, 1, -5, 9, -2, 6}, 7};
    FC y{{1, 2, -3, 0, 5, -1, 2, 4}, 3};
    FC z{{-2, 5, 1, -4, 0, 3, -1, 2}, 5};
    canon(x); canon(y); canon(z);
    i128 checksum = 0;
    auto t0 = std::chrono::steady_clock::now();
    for (long i = 0; i < N; i++) {
        FC t = fconj(fadd(fmul(fmulZeta(x, (int)(i % 24)), y), z));
        canon(t);
        checksum += t.num[0] + t.den;
    }
    auto t1 = std::chrono::steady_clock::now();
    double ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
    printf("native-fast: N=%ld  %.1f ms  %.2f Mops/s  checksum=%s\n", N, ms, N / ms / 1000.0, to_string128(checksum).c_str());
    return 0;
}
