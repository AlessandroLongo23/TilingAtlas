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
 *
 * EU_SPHFILL_INSTANCES — return the FILL, not just the verdict.
 *
 * The verdict protocol throws away the very thing it just computed. A survivor's instance set is
 * (dart, frame) pairs, and develop_sphere then walks the identical fill again in Python to rebuild
 * them. That cost nothing while survivors were 10,890 of 40,487,641 blocks (0.027%). The great-circle
 * fix changed the arithmetic: a hemisphere config closes by construction, survivors on the k=3 corpus
 * run at 3.4%, and a survivor costs 19.6 ms of Python against 0.036 ms for the verdict — 545x. Handing
 * the fill back removes one of the two identical walks.
 *
 * ⚑ OPT-IN, because a running job must not have its protocol changed underneath it. Without the
 * variable this binary is byte-for-byte the old one on the wire.
 *
 *   out:  N x int32 status            -1 did not close, -2 closed but payload capped, else ninst
 *         then, in attempt order, for each status > 0:
 *               ninst x { int32 h; double R[9] }
 *
 * The cap bounds one batch's reply: 20,000 attempts at 3% closure and 2,160 instances each would be
 * 93 MB, which is survivable but not something to leave unbounded. Past it the verdict is still
 * exact (-2 means CLOSED) and Python refills those few itself.
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

int main() {
    std::vector<int32_t> rneig, glue;
    std::vector<double> alpha;
    std::vector<Mat3> RZ;
    std::vector<Key> keys;          // open-addressed table, slot -> key
    std::vector<int32_t> slot;      // slot -> instance index, -1 empty
    std::vector<int32_t> stackH;
    std::vector<Mat3> stackR;

    std::vector<unsigned char> verdicts;
    const bool want_inst = std::getenv("EU_SPHFILL_INSTANCES") != nullptr;
    const bool want_mapok = std::getenv("EU_SPHFILL_MAPOK") != nullptr;
    std::vector<int32_t> nsize;
    const size_t PAYLOAD_CAP = 256u << 20;               // bytes of instance payload per batch
    std::vector<int32_t> status;                         // instance protocol: one int32 per attempt
    std::vector<unsigned char> payload;
    std::vector<int32_t> instH;                          // this attempt's darts, in discovery order
    std::vector<Mat3> instR;                             // …and its frames
    for (;;) {
      int32_t N = 0;
      if (std::fread(&N, 4, 1, stdin) != 1) break;
      verdicts.clear(); verdicts.reserve(N);
      status.clear(); status.reserve(N); payload.clear();
      for (int32_t rec = 0; rec < N; rec++) {
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
        const bool keep_inst = want_inst || want_mapok;
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
        if (want_inst) {
            if (!closed) {
                status.push_back(-1);
            } else {
                const size_t need = instH.size() * (4 + 9 * 8);
                if (payload.size() + need > PAYLOAD_CAP) {
                    status.push_back(-2);                 // closed; Python refills this one
                } else {
                    status.push_back((int32_t)instH.size());
                    const size_t at = payload.size();
                    payload.resize(at + need);
                    unsigned char* w = payload.data() + at;
                    for (size_t i = 0; i < instH.size(); i++) {
                        std::memcpy(w, &instH[i], 4); w += 4;
                        std::memcpy(w, instR[i].m, 9 * 8); w += 9 * 8;
                    }
                }
            }
        }
      }
      if (want_mapok) {
          std::fwrite(status.data(), 4, status.size(), stdout);
      } else if (want_inst) {
          std::fwrite(status.data(), 4, status.size(), stdout);
          if (!payload.empty()) std::fwrite(payload.data(), 1, payload.size(), stdout);
      } else {
          std::fwrite(verdicts.data(), 1, verdicts.size(), stdout);
      }
      std::fflush(stdout);
    }
    return 0;
}
