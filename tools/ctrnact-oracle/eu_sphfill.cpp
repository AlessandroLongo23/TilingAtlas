/*
 * eu_sphfill.cpp — a flood fill's CLOSE / NOT-CLOSE verdict, and nothing else.
 *
 * TWO fills now: develop_spherical's, in SO(3), and develop_euclid's, in SE(3) under
 * EU_FILL_EUCLID (documented at euclid_record below). They share the guard, the quantum, the
 * instance table and the map-consistency counts, which is most of the file; the name is the one
 * the spherical mode shipped under, kept so a running pipeline is not renamed underneath it.
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
 * Protocol, little-endian. The process is PERSISTENT: a worker starts one and feeds it batch after
 * batch, because spawning it per batch cost more than the walk on a run with many small files.
 *
 *   in:   int32 N                      attempts in this batch
 *         N x { int32 n; int32 guard; double rho;
 *               int32 rneig[n]; int32 glue[n]; double alpha[n] }
 *   out:  N bytes                      1 = closed within guard, 0 = did not
 *
 * ⚑ All N are READ before any byte is written, and the reply is flushed as one block. Interleaving
 * would deadlock: the writer is still writing when the reader would need to drain.
 *
 * EU_SPHFILL_MAPOK — also run the MAP-CONSISTENCY test, and reject on it.
 *
 * The verdict alone stopped being selective. Measured on the k=3 corpus after the great-circle fix:
 * of 698 blocks that survive the verdict, check_realized rejects 2,024 of its 2,031 calls — 99.7% —
 * and every one of them on mapOK, the COUNTING test: 2|E| == ninst, the face degrees sum to ninst,
 * and a {n/d} face traces exactly n darts. Seven realize. So the developer is being handed a hundred
 * blocks for every one it can use, and the thing that throws them out needs no geometry at all.
 *
 * ⚑ WHY THIS TEST AND NOT THE OTHERS. mapOK is integer counting over the instance set this function
 * already built. The rest of check_realized (edge CV, planarity, face regularity, integral density)
 * reads COORDINATES, and the coordinates here are not the ones the shelf ships: numpy's 3x3 matmul is
 * BLAS, not a naive triple product (it disagrees with one on 1,942 of 2,000 random pairs), so these
 * frames differ from the developer's by up to 2.3e-15. That is nine orders inside the 1e-6 key
 * quantum, so the MAP is identical and counting it here is sound; it is not zero, so no float this
 * side may ever reach public/. Returning the fill for the developer to use was tried and abandoned
 * for exactly that reason.
 *
 *   in:   as below, plus int32 nsize[n]   the polygon size at each dart, ftype's n
 *   out:  N x int32                       -1 did not close, 0 closed but mapOK false, 1 usable
 */
#include <cstdio>
#include <cstdint>
#include <cmath>
#include <vector>
#include <cstring>
#include <cstdlib>
#include <algorithm>

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

// ------------------------------------------------------------------------- the EUCLIDEAN fill
//
// EU_FILL_EUCLID — walk develop_euclid.develop instead of develop_sphere's.
//
// The two fills are the same breadth-first walk over dart instances, and the difference is what an
// instance IS. On the sphere it is (dart, frame) and one global edge arc rho folds every edge; in
// R^3 it is (dart, position, frame), each edge folds by its OWN dihedral, and the step across an
// edge translates by the frame's first column. So this reads theta[] per dart where the spherical
// record reads one rho, and the key carries the position.
//
// Everything else is shared with the mode above and that is why it lives in this file: the guard,
// the round-half-even quantum, the open-addressed instance table and the three map-consistency
// counts are identical, and a second binary would be a copy of all of it.
//
// ⚑ ASSOCIATION MATTERS. numpy evaluates `R @ Rz(a) @ Rx(b)` as `(R @ Rz(a)) @ Rx(b)`, so this does
// two multiplications in that order instead of folding Rz*Rx once per dart. The difference is ~1e-16
// per step against a 1e-6 key quantum, but the position ACCUMULATES over the walk where the
// spherical frame does not, so there is no reason to spend the margin.
//
//   in:   int32 n; int32 guard; int32 rneig[n]; int32 glue[n];
//         double alpha[n]; double theta[n]; int32 nsize[n]
//   out:  int32   -1 did not close, 0 closed but the map is inconsistent, 1 usable
//
// alpha[h] is develop_euclid's planar_angle at dart h (retrograde already applied by Python),
// theta[h] is the dihedral of dart h's EDGE — theta[eid[h]] — and nsize[h] is the ring length the
// face swept from h must trace, _nd(lvert[rneig[h]])[0]. Python owns all three.

struct Vec3 { double v[3]; };

static inline Vec3 step_along(const Vec3& t, const Mat3& R) {   // t + R[:, 0]
    return Vec3{{ t.v[0] + R.m[0], t.v[1] + R.m[3], t.v[2] + R.m[6] }};
}

struct EKey { int32_t h; int64_t q[9]; };      // dart, position, frame column 0, frame column 2

static inline uint64_t ehash(const EKey& k) {
    uint64_t x = 1469598103934665603ULL;
    x ^= (uint64_t)(int64_t)k.h; x *= 1099511628211ULL;
    for (int i = 0; i < 9; i++) { x ^= (uint64_t)k.q[i]; x *= 1099511628211ULL; }
    x ^= x >> 29; x *= 0xBF58476D1CE4E5B9ULL; x ^= x >> 32;
    return x;
}
static inline bool esame(const EKey& a, const EKey& b) {
    if (a.h != b.h) return false;
    for (int i = 0; i < 9; i++) if (a.q[i] != b.q[i]) return false;
    return true;
}
static inline uint64_t vhash(int64_t a, int64_t b, int64_t c) {
    uint64_t x = 1469598103934665603ULL;
    const int64_t v[3] = { a, b, c };
    for (int i = 0; i < 3; i++) { x ^= (uint64_t)v[i]; x *= 1099511628211ULL; }
    x ^= x >> 29; x *= 0xBF58476D1CE4E5B9ULL; x ^= x >> 32;
    return x;
}

// -99 on a short read: the stream is out of frame and the caller must stop, not answer.
static int32_t euclid_record(bool want_mapok) {
    int32_t n = 0, guard = 0;
    if (std::fread(&n, 4, 1, stdin) != 1) return -99;
    if (std::fread(&guard, 4, 1, stdin) != 1) return -99;
    if (n <= 0 || guard <= 0) return -99;
    std::vector<int32_t> rneig(n), glue(n), nsize(n);
    std::vector<double> alpha(n), theta(n);
    if ((int)std::fread(rneig.data(), 4, n, stdin) != n) return -99;
    if ((int)std::fread(glue.data(),  4, n, stdin) != n) return -99;
    if ((int)std::fread(alpha.data(), 8, n, stdin) != n) return -99;
    if ((int)std::fread(theta.data(), 8, n, stdin) != n) return -99;
    if ((int)std::fread(nsize.data(), 4, n, stdin) != n) return -99;

    std::vector<Mat3> RZ(n), RX(n), XE(n);
    for (int h = 0; h < n; h++) {
        const double ca = std::cos(alpha[h]), sa = std::sin(alpha[h]);
        RZ[h] = Mat3{{ ca, -sa, 0.0, sa, ca, 0.0, 0.0, 0.0, 1.0 }};
        // the exterior angle phi = pi - theta, shared by the fold about the new edge and the step
        // across it — develop_euclid's Rx(pi - theta) and cross_edge(theta)
        const double cb = std::cos(M_PI - theta[h]), sb = std::sin(M_PI - theta[h]);
        RX[h] = Mat3{{ 1.0, 0.0, 0.0, 0.0, cb, -sb, 0.0, sb, cb }};
        XE[h] = Mat3{{ -1.0, 0.0, 0.0, 0.0, -cb, sb, 0.0, sb, cb }};
    }

    int cap = 16; while (cap < (guard + 4) * 4) cap <<= 1;
    const uint32_t mask = (uint32_t)cap - 1;
    std::vector<int32_t> slot((size_t)cap, -1);
    std::vector<EKey> keys; keys.reserve(guard + 8);
    std::vector<int32_t> instH; std::vector<Vec3> instT; std::vector<Mat3> instR;
    instH.reserve(guard + 8); instT.reserve(guard + 8); instR.reserve(guard + 8);

    auto mk = [](int32_t h, const Vec3& t, const Mat3& R) {
        EKey k; k.h = h;
        k.q[0] = q(t.v[0]); k.q[1] = q(t.v[1]); k.q[2] = q(t.v[2]);
        k.q[3] = q(R.m[0]); k.q[4] = q(R.m[3]); k.q[5] = q(R.m[6]);
        k.q[6] = q(R.m[2]); k.q[7] = q(R.m[5]); k.q[8] = q(R.m[8]);
        return k;
    };
    auto get = [&](int32_t h, const Vec3& t, const Mat3& R, bool& isnew) -> int32_t {
        const EKey k = mk(h, t, R);
        uint32_t p = (uint32_t)(ehash(k) & mask);
        for (;;) {
            const int32_t idx = slot[p];
            if (idx < 0) {
                const int32_t id = (int32_t)keys.size();
                slot[p] = id; keys.push_back(k);
                instH.push_back(h); instT.push_back(t); instR.push_back(R);
                isnew = true; return id;
            }
            if (esame(keys[idx], k)) { isnew = false; return idx; }
            p = (p + 1) & mask;
        }
    };
    auto findi = [&](int32_t h, const Vec3& t, const Mat3& R) -> int32_t {
        const EKey k = mk(h, t, R);
        uint32_t p = (uint32_t)(ehash(k) & mask);
        for (;;) {
            const int32_t idx = slot[p];
            if (idx < 0) return -1;
            if (esame(keys[idx], k)) return idx;
            p = (p + 1) & mask;
        }
    };

    const Mat3 I{{ 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0 }};
    const Vec3 O{{ 0.0, 0.0, 0.0 }};
    std::vector<int32_t> stack;
    std::vector<int32_t> rnA, rnB;             // the same-vertex relation, one pair per pop
    bool isnew = false;
    get(0, O, I, isnew);
    stack.push_back(0);
    long pops = 0; bool closed = true;
    while (!stack.empty()) {
        if (++pops > guard) { closed = false; break; }
        const int32_t i = stack.back(); stack.pop_back();
        const int32_t h = instH[i];
        const Vec3 t = instT[i];               // by value: get() may reallocate the instance vectors
        const Mat3 R = instR[i];
        const int32_t hn = rneig[h];
        const Mat3 Rn = mul(mul(R, RZ[hn]), RX[hn]);
        int32_t j = get(hn, t, Rn, isnew);
        rnA.push_back(i); rnB.push_back(j);    // both sit at the SAME map vertex, by construction
        if (isnew) stack.push_back(j);
        j = get(glue[h], step_along(t, R), mul(R, XE[h]), isnew);
        if (isnew) stack.push_back(j);
        if ((long)keys.size() > guard) { closed = false; break; }
    }
    if (!closed) return -1;
    if (!want_mapok) return 1;

    const size_t ni = instH.size();
    // VERTEX IDS ARE THE QUANTISED POSITION, which is develop_euclid.vid exactly — no normalisation,
    // because a Euclidean vertex is a point and not a direction.
    size_t vcap = 16; while (vcap < (ni + 4) * 4) vcap <<= 1;
    std::vector<int32_t> vslot(vcap, -1);
    std::vector<int64_t> vkey;                 // 3 per vertex
    auto vidx = [&](const Vec3& t) -> int32_t {
        const int64_t a = q(t.v[0]), b = q(t.v[1]), c = q(t.v[2]);
        uint32_t p = (uint32_t)(vhash(a, b, c) & (uint32_t)(vcap - 1));
        for (;;) {
            const int32_t s = vslot[p];
            if (s < 0) {
                const int32_t id = (int32_t)(vkey.size() / 3);
                vslot[p] = id; vkey.push_back(a); vkey.push_back(b); vkey.push_back(c);
                return id;
            }
            if (vkey[s*3] == a && vkey[s*3+1] == b && vkey[s*3+2] == c) return s;
            p = (uint32_t)((p + 1) & (vcap - 1));
        }
    };
    std::vector<int32_t> vid(ni);
    for (size_t i = 0; i < ni; i++) vid[i] = vidx(instT[i]);
    std::vector<uint64_t> ep; ep.reserve(ni);
    for (size_t i = 0; i < ni; i++) {
        const int32_t vB = vidx(step_along(instT[i], instR[i])), vA = vid[i];
        if (vA != vB) {
            const uint32_t lo = (uint32_t)(vA < vB ? vA : vB), hi = (uint32_t)(vA < vB ? vB : vA);
            ep.push_back(((uint64_t)lo << 32) | hi);
        }
    }
    std::sort(ep.begin(), ep.end());
    ep.erase(std::unique(ep.begin(), ep.end()), ep.end());
    // ⚑ AFTER the edge pass. develop_euclid's vid() creates on demand and the edge loop calls it, so
    // len(V) is the count once both passes have run.
    const size_t nV = vkey.size() / 3;

    bool ok = (2 * ep.size() == ni);
    if (ok) {
        std::vector<char> seen(ni, 0);
        size_t degsum = 0;
        for (size_t st0 = 0; st0 < ni && ok; st0++) {
            if (seen[st0]) continue;
            const int32_t want = nsize[instH[st0]];
            size_t len = 0; int32_t idx = (int32_t)st0; bool ring = false;
            for (long it = 0; it < guard; it++) {
                seen[idx] = 1; len++;
                const int32_t hh = instH[idx], hn = rneig[hh];
                const Mat3 Rn = mul(mul(instR[idx], RZ[hn]), RX[hn]);
                idx = findi(glue[hn], step_along(instT[idx], Rn), mul(Rn, XE[hn]));
                if (idx < 0) { ok = false; break; }     // "face trace escaped the instance set"
                if (idx == (int32_t)st0) { ring = true; break; }
            }
            if (!ok) break;
            if (!ring || (int32_t)len != want) { ok = false; break; }
            degsum += len;
        }
        ok = ok && (degsum == ni);
    }
    // THE PINCH: map vertices are orbits of the instance set under the rneig step, which never moves
    // the position, so a fill that sends two of them to one point has merged a vertex and the solid
    // touches itself there. develop_euclid computes nvmap the same way and check_realized compares.
    if (ok) {
        std::vector<int32_t> parent(ni);
        for (size_t i = 0; i < ni; i++) parent[i] = (int32_t)i;
        auto find = [&](int32_t x) {
            while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; }
            return x;
        };
        for (size_t e = 0; e < rnA.size(); e++) {
            const int32_t ra = find(rnA[e]), rb = find(rnB[e]);
            if (ra != rb) parent[ra] = rb;
        }
        size_t nvmap = 0;
        for (size_t i = 0; i < ni; i++) if (find((int32_t)i) == (int32_t)i) nvmap++;
        ok = (nvmap == nV);
    }
    return ok ? 1 : 0;
}

int main() {
    std::vector<int32_t> rneig, glue;
    std::vector<double> alpha;
    std::vector<Mat3> RZ;
    std::vector<Key> keys;          // open-addressed table, slot -> key
    std::vector<int32_t> slot;      // slot -> instance index, -1 empty
    std::vector<int32_t> stackH;
    std::vector<Mat3> stackR;

    std::vector<unsigned char> verdicts;
    const bool want_mapok = std::getenv("EU_SPHFILL_MAPOK") != nullptr;
    const bool want_euclid = std::getenv("EU_FILL_EUCLID") != nullptr;
    std::vector<int32_t> nsize;
    std::vector<int32_t> status;                         // instance protocol: one int32 per attempt
    std::vector<int32_t> instH;                          // this attempt's darts, in discovery order
    std::vector<Mat3> instR;                             // …and its frames
    for (;;) {
      int32_t N = 0;
      if (std::fread(&N, 4, 1, stdin) != 1) break;
      verdicts.clear(); verdicts.reserve(N);
      status.clear(); status.reserve(N);
      for (int32_t rec = 0; rec < N; rec++) {
        if (want_euclid) {                       // a different record layout and a different walk
            const int32_t st = euclid_record(want_mapok);
            if (st == -99) return 1;             // short read: the stream is out of frame
            status.push_back(st);
            continue;
        }
        int32_t n = 0, guard = 0; double rho = 0;
        if (std::fread(&n, 4, 1, stdin) != 1) return 1;
        if (std::fread(&guard, 4, 1, stdin) != 1) return 1;
        if (std::fread(&rho, 8, 1, stdin) != 1) return 1;
        rneig.resize(n); glue.resize(n); alpha.resize(n);
        if ((int)std::fread(rneig.data(), 4, n, stdin) != n) return 1;
        if ((int)std::fread(glue.data(), 4, n, stdin) != n) return 1;
        if ((int)std::fread(alpha.data(), 8, n, stdin) != n) return 1;
        if (want_mapok) {
            nsize.resize(n);
            if ((int)std::fread(nsize.data(), 4, n, stdin) != n) return 1;
        }

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

        instH.clear(); instR.clear();
        const bool keep_inst = want_mapok;
        auto insert = [&](int32_t h, const Mat3& R) -> bool {   // true if new
            Key k; k.h = h;
            k.a = q(R.m[2]); k.b = q(R.m[5]); k.c = q(R.m[8]);   // column 2, rows 0..2
            k.d = q(R.m[0]); k.e = q(R.m[3]); k.f = q(R.m[6]);   // column 0, rows 0..2
            uint32_t p = (uint32_t)(hashkey(k) & mask);
            for (;;) {
                const int32_t idx = slot[p];
                if (idx < 0) {
                    slot[p] = (int32_t)keys.size(); keys.push_back(k);
                    if (keep_inst) { instH.push_back(h); instR.push_back(R); }
                    return true;
                }
                if (same(keys[idx], k)) return false;
                p = (p + 1) & mask;
            }
        };

        auto find_inst = [&](int32_t h, const Mat3& R) -> int32_t {
            Key k; k.h = h;
            k.a = q(R.m[2]); k.b = q(R.m[5]); k.c = q(R.m[8]);
            k.d = q(R.m[0]); k.e = q(R.m[3]); k.f = q(R.m[6]);
            uint32_t p = (uint32_t)(hashkey(k) & mask);
            for (;;) {
                const int32_t idx = slot[p];
                if (idx < 0) return -1;
                if (same(keys[idx], k)) return idx;
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
        // MAP CONSISTENCY, the same three counts check_realized runs, on the fill just built.
        int mapok = -1;                                  // -1 = not asked
        if (want_mapok) {
            mapok = 0;
            if (closed) {
                const size_t ni = instH.size();
                // vertex id = quantised UNIT column 2, exactly as vid_of normalises before rounding
                std::vector<int64_t> vkey(ni * 3);
                std::vector<int32_t> vid(ni);
                auto vid_of = [&](const Mat3& R, int64_t* out) {
                    double x = R.m[2], y = R.m[5], z = R.m[8];
                    const double nn = std::sqrt(x*x + y*y + z*z);
                    x /= nn; y /= nn; z /= nn;
                    out[0] = q(x); out[1] = q(y); out[2] = q(z);
                };
                std::vector<int64_t> vtab; std::vector<int32_t> vidx;   // linear-probe on 3 int64
                auto vlookup = [&](const int64_t* k3) -> int32_t {
                    for (size_t i = 0; i < vidx.size(); i++)
                        if (vtab[i*3]==k3[0] && vtab[i*3+1]==k3[1] && vtab[i*3+2]==k3[2]) return vidx[i];
                    vtab.push_back(k3[0]); vtab.push_back(k3[1]); vtab.push_back(k3[2]);
                    vidx.push_back((int32_t)vidx.size());
                    return vidx.back();
                };
                for (size_t i = 0; i < ni; i++) { vid_of(instR[i], &vkey[i*3]); vid[i] = vlookup(&vkey[i*3]); }
                // edges: {vid(R), vid(R*M)} over every instance, distinct undirected pairs
                std::vector<uint64_t> ep; ep.reserve(ni);
                for (size_t i = 0; i < ni; i++) {
                    int64_t k3[3]; Mat3 Rg = mul(instR[i], M); vid_of(Rg, k3);
                    const int32_t vB = vlookup(k3), vA = vid[i];
                    if (vA != vB) {
                        const uint32_t lo = (uint32_t)(vA < vB ? vA : vB), hi = (uint32_t)(vA < vB ? vB : vA);
                        ep.push_back(((uint64_t)lo << 32) | hi);
                    }
                }
                std::sort(ep.begin(), ep.end());
                ep.erase(std::unique(ep.begin(), ep.end()), ep.end());
                bool ok = (2 * ep.size() == ni);
                // faces: orbits of (glue[rneig[h]], R*Rz(alpha[h])*M); ring length must be ftype's n
                if (ok) {
                    std::vector<char> seen(ni, 0);
                    size_t degsum = 0;
                    for (size_t st0 = 0; st0 < ni && ok; st0++) {
                        if (seen[st0]) continue;
                        const int32_t want = nsize[instH[st0]];
                        size_t len = 0; int32_t idx2 = (int32_t)st0;
                        for (;;) {
                            if (idx2 < 0 || seen[idx2]) { ok = (idx2 == (int32_t)st0 && len > 0); break; }
                            seen[idx2] = 1; len++;
                            const int32_t hh = instH[idx2];
                            const Mat3 Rn = mul(mul(instR[idx2], RZ[hh]), M);
                            idx2 = find_inst(glue[rneig[hh]], Rn);
                            if (idx2 == (int32_t)st0) break;
                            if (len > (size_t)guard) { ok = false; break; }
                        }
                        if (!ok) break;
                        if ((int32_t)len != want) { ok = false; break; }
                        degsum += len;
                    }
                    ok = ok && (degsum == ni);
                }
                mapok = ok ? 1 : 0;
            }
        }
        verdicts.push_back(closed ? 1 : 0);
        if (want_mapok) status.push_back(closed ? mapok : -1);
      }
      if (want_mapok || want_euclid) {
          std::fwrite(status.data(), 4, status.size(), stdout);
      } else {
          std::fwrite(verdicts.data(), 1, verdicts.size(), stdout);
      }
      std::fflush(stdout);
    }
    return 0;
}
