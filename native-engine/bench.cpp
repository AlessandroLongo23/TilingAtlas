// Matched micro-benchmark: N iterations of an independent mulZeta→mul→add→conj chain in native
// int128 exact arithmetic. Prints wall time + a checksum (must equal the TS bench's checksum → a
// bonus correctness cross-check). Pair with bench.ts (same computation).
#include <cstdio>
#include <chrono>
#include "cyclotomic.hpp"

int main(int argc, char** argv) {
    long N = argc > 1 ? atol(argv[1]) : 2000000;
    const Ring* R = &Ring::create(24);
    Cyclo x(R, {3, -1, 4, 1, -5, 9, -2, 6}, 7);
    Cyclo y(R, {1, 2, -3, 0, 5, -1, 2, 4}, 3);
    Cyclo z(R, {-2, 5, 1, -4, 0, 3, -1, 2}, 5);
    i128 checksum = 0;
    auto t0 = std::chrono::steady_clock::now();
    for (long i = 0; i < N; i++) {
        Cyclo t = x.mulZeta((int)(i % 24)).mul(y).add(z).conj();
        t.ensureCanon();  // deferred gcd ⇒ canonicalize before reading num/den (matches TS/bench-fast checksum)
        checksum += t.num[0] + t.den;
    }
    auto t1 = std::chrono::steady_clock::now();
    double ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
    printf("native: N=%ld  %.1f ms  %.2f Mops/s  checksum=%s\n",
           N, ms, N / ms / 1000.0, to_string128(checksum).c_str());
    return 0;
}
