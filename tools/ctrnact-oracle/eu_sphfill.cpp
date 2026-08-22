/*
 * eu_sphfill.cpp — the spherical flood fill's CLOSE / NOT-CLOSE verdict, and nothing else.
 *
 * develop_spherical.develop_block spends essentially all of its time discovering that a map does not
 * close: on star-wide k=3, 458 of 458 sampled fills run to the guard. That verdict needs no exact
 * arithmetic — only the fills that SUCCEED produce coordinates anybody ships — so it can be answered
 * here at C speed and the survivors re-developed by the Python developer, unchanged, for the geometry.
 *
 * ⚑ THIS OWNS NO GEOMETRY DECISIONS. Python solves for rho, picks the densities, the retrograde
 * subsets and the sign, and computes the per-dart interior angle; this reads the angles and does the
 * walk. Everything that decides WHAT is developed stays in one place.
 *
 * The walk and the key are the same as develop_sphere's: instances are (dart, frame), the frame steps
 * by R·Rz(alpha[h]) around a vertex and by R·M across an edge, and the key is the dart with columns 2
 * and 0 of the frame rounded at TOL. Same rounding (round-half-even), same order of multiplication.
 *
 * Protocol, little-endian, on stdin — one record per attempt:
 *     int32   n          darts
 *     int32   guard      instance bound (develop_spherical.instance_bound)
 *     double  rho        edge arc
 *     int32   rneig[n]
 *     int32   glue[n]
 *     double  alpha[n]   signed, retrograde-adjusted interior angle at dart h
 * and one byte per attempt on stdout: 1 = closed within guard, 0 = did not.
 */
#include <cstdio>
#include <cstdint>
#include <cmath>
#include <vector>
#include <cstring>

static const double TOL = 1e-6;

struct Mat3 { double m[9]; };

static inline Mat3 mul(const Mat3& a, const Mat3& b) {
    Mat3 r;
    for (int i = 0; i < 3; i++)
        for (int j = 0; j < 3; j++)
            r.m[i*3+j] = a.m[i*3+0]*b.m[0*3+j] + a.m[i*3+1]*b.m[1*3+j] + a.m[i*3+2]*b.m[2*3+j];
    return r;
}

// numpy rounds half to even, and so does C99 rint under the default mode. round() does NOT (it rounds
// half away from zero), and using it would disagree with the developer on exact .5 quanta.
static inline int64_t q(double v) { return (int64_t)std::rint(v / TOL); }

struct Key { int32_t h; int64_t a, b, c, d, e, f; };

static inline uint64_t hashkey(const Key& k) {
    uint64_t x = 1469598103934665603ULL;
    const int64_t v[7] = { k.h, k.a, k.b, k.c, k.d, k.e, k.f };
    for (int i = 0; i < 7; i++) { x ^= (uint64_t)v[i]; x *= 1099511628211ULL; }
    x ^= x >> 29; x *= 0xBF58476D1CE4E5B9ULL; x ^= x >> 32;
    return x;
}
static inline bool same(const Key& x, const Key& y) {
    return x.h == y.h && x.a == y.a && x.b == y.b && x.c == y.c && x.d == y.d && x.e == y.e && x.f == y.f;
}

int main() {
    std::vector<int32_t> rneig, glue;
    std::vector<double> alpha;
    std::vector<Mat3> RZ;
    std::vector<Key> keys;          // open-addressed table, slot -> key
    std::vector<int32_t> slot;      // slot -> instance index, -1 empty
    std::vector<int32_t> stackH;
    std::vector<Mat3> stackR;

    for (;;) {
        int32_t n = 0, guard = 0; double rho = 0;
        if (std::fread(&n, 4, 1, stdin) != 1) break;
        if (std::fread(&guard, 4, 1, stdin) != 1) break;
        if (std::fread(&rho, 8, 1, stdin) != 1) break;
        rneig.resize(n); glue.resize(n); alpha.resize(n);
        if ((int)std::fread(rneig.data(), 4, n, stdin) != n) break;
        if ((int)std::fread(glue.data(), 4, n, stdin) != n) break;
        if ((int)std::fread(alpha.data(), 8, n, stdin) != n) break;

        RZ.resize(n);
        for (int h = 0; h < n; h++) {
            const double c = std::cos(alpha[h]), s = std::sin(alpha[h]);
            Mat3& z = RZ[h];
            z.m[0]=c; z.m[1]=-s; z.m[2]=0; z.m[3]=s; z.m[4]=c; z.m[5]=0; z.m[6]=0; z.m[7]=0; z.m[8]=1;
        }
        Mat3 M;
        { const double c = std::cos(rho), s = std::sin(rho);
          M.m[0]=-c; M.m[1]=0; M.m[2]=s; M.m[3]=0; M.m[4]=-1; M.m[5]=0; M.m[6]=s; M.m[7]=0; M.m[8]=c; }

        int cap = 16; while (cap < guard * 4) cap <<= 1;
        const uint32_t mask = (uint32_t)cap - 1;
        slot.assign(cap, -1);
        keys.clear(); keys.reserve(guard + 8);
        stackH.clear(); stackR.clear();

        auto insert = [&](int32_t h, const Mat3& R) -> bool {   // true if new
            Key k; k.h = h;
            k.a = q(R.m[2]); k.b = q(R.m[5]); k.c = q(R.m[8]);   // column 2, rows 0..2
            k.d = q(R.m[0]); k.e = q(R.m[3]); k.f = q(R.m[6]);   // column 0, rows 0..2
            uint32_t p = (uint32_t)(hashkey(k) & mask);
            for (;;) {
                const int32_t idx = slot[p];
                if (idx < 0) { slot[p] = (int32_t)keys.size(); keys.push_back(k); return true; }
                if (same(keys[idx], k)) return false;
                p = (p + 1) & mask;
            }
        };

        Mat3 I; std::memset(I.m, 0, sizeof(I.m)); I.m[0]=I.m[4]=I.m[8]=1;
        insert(0, I);
        stackH.push_back(0); stackR.push_back(I);
        long pops = 0; bool closed = true;
        while (!stackH.empty()) {
            if (++pops > guard) { closed = false; break; }
            const int32_t h = stackH.back(); const Mat3 R = stackR.back();
            stackH.pop_back(); stackR.pop_back();
            const Mat3 RA = mul(R, RZ[h]);
            if (insert(rneig[h], RA)) { stackH.push_back(rneig[h]); stackR.push_back(RA); }
            const Mat3 RM = mul(R, M);
            if (insert(glue[h], RM))  { stackH.push_back(glue[h]);  stackR.push_back(RM); }
            if ((long)keys.size() > guard) { closed = false; break; }
        }
        unsigned char out = closed ? 1 : 0;
        std::fwrite(&out, 1, 1, stdout);
    }
    std::fflush(stdout);
    return 0;
}
