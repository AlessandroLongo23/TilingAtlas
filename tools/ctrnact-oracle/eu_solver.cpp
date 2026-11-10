/*
 * eu_solver.cpp
 *
 *  Created on: 10. 12. 2021
 *      Author: Marek
 */

#include <vector>
#include <array>
#include <string>
#include <fstream>
#include <algorithm>
#include <iostream>
#include <cstdlib>
#include <cstring>
#include <charconv>
#include <deque>
#include <iterator>
#include <ctime>
#include <cerrno>
#include <sys/stat.h>
#include <fcntl.h>
#include <filesystem>
#include <functional>
#include <sys/wait.h>
#include <sys/mman.h>
#include <unistd.h>

std::string solvercode = "eu";
std::string filepath = "out/";
std::string listfile = solvercode + "solver_";
std::string genfile = solvercode + "output";

#ifndef MAXNUM
#define MAXNUM 11        // max k to enumerate; override with g++ -DMAXNUM=<k>
#endif
constexpr int maxnum = MAXNUM;
constexpr int seen = 0;  // emit every k in [1, maxnum] (original used seen=13 to emit only k=14)

// The noncounting-vertex cap (EU_NCBUDGET, default 8) was REMOVED 2026-08-07. It was an
// incompleteness knob that had to be certified by budget-fixpoint on every run, and the k<=3
// star24full catalog contains tilings with exactly 8 dent-fill vertices — the default sat ON the
// observed maximum, so one more dent and it would have silently dropped tilings. Uncapped (B=99)
// refused ZERO times and produced the identical catalog at k<=3, which makes uncapped == B=99 there.
// Dents cannot chain (two 2-valent vertices cannot be adjacent — the curvature argument, AL
// 2026-08-06), so their number is bounded by the counting structure. max_nc below is the tripwire
// that keeps that visible instead of enforcing a guess.
static long max_nc = 0;   // most dent-fill vertices seen in any configuration
static std::vector<int> NC_IDX;
// FIX B: candidate index.  A face that crosses a glue (x,y) must have (face_join)
//   lvert[rneig[y]] in {CLASS_NEXT, CLASS_PREV}[lvert[x]]
// in BOTH directions.  For a glue of firstfree to a dart of a candidate type that is two O(1) class
// equalities, knowable before the vertex is materialised.  Bucket every (type, rep) by the pair
//   A = class at the rep,  B = class at the rep's right neighbour,  mir = whether the rep is its own mirror
// and look up (NEXT[b], NEXT[a], mirrored) from the current configuration.
//
// 4-BUCKET UNION (2026-08-08). That lookup is a SINGLE bucket only when CLASS_PREV == CLASS_NEXT and
// NEXT is an involution — the BUCKET_OK property. Derive it without that assumption. Gluing free dart
// e to candidate dart f makes a face cross the new glue in each direction, and a face's first step
// may be either CLASS_NEXT or CLASS_PREV:
//     crossing e -> f :  lvert[rneig[f]] in {NEXT, PREV}[a]        , a = lvert[e]
//     crossing f -> e :  lvert[rneig[e]] in {NEXT, PREV}[lvert[f]] , b = lvert[rneig[e]]
// PREV is NEXT's inverse permutation, so the second reads lvert[f] in {PREV, NEXT}[b]. Two choices on
// each side is FOUR admissible (A, B) pairs, hence four buckets, and their union is the candidate pool.
// Under BUCKET_OK the two choices coincide pointwise, qkeys() returns n == 1, and the pool is the same
// single bucket the fast path always used — which is why check-regular stays byte-identical.
//
// Soundness is one-directional and worth stating: the four conditions are NECESSARY (they come from
// steps face_join checks), so the union never drops an admissible candidate. It is not sufficient:
// a face also LOCKS its direction after its first step, which the union deliberately forgets, so
// the union admits some candidates that face_join then rejects. Costs work, cannot lose a tiling.
static bool BUCKET_OK = false;
static int NCLS = 0;
static inline int cand_key(int A, int B, bool mir) { return (A * NCLS + B) * 2 + (mir ? 1 : 0); }
// Copies of the class tables, so qkeys() can be defined here rather than after the table declarations.
static const int *CN_ = 0, *CP_ = 0;   // set in main() before any qkeys() call
// The admissible target keys for gluing to free dart e (a = lvert[e], b = lvert[rneig[e]], mir).
// Writes 1..4 keys, returns the count. n == 1 exactly when NEXT == PREV at both a and b.
static inline int qkeys(int a, int b, bool mir, int* out) {
    const int A1 = CN_[b], A2 = CP_[b];
    const int B1 = CN_[a], B2 = CP_[a];
    int n = 0;
    out[n++] = cand_key(A1, B1, mir);
    if (B2 != B1)   out[n++] = cand_key(A1, B2, mir);
    if (A2 != A1) { out[n++] = cand_key(A2, B1, mir);
        if (B2 != B1) out[n++] = cand_key(A2, B2, mir); }
    return n;
}
static std::vector<char> TYPE_OK;   // vertex types that can occur in a tiling (see face_filter)
// PAIR FILTER — gluing firstfree to candidate dart f fixes successor(lneig[firstfree]) = f, so the
// face through x = lneig[firstfree] can only still close if tkey(x) is reachable from Q(f) in exactly
// c-2 steps for some allowed c. Both keys are known before the vertex is materialised. One bit each.
static std::vector<unsigned long long> OKPAIR;   // bitmap over tkey(x) * NKEY + Q(f)
static bool PAIRFILTER = true;   // off for palettes where the bucket key is not a sound identity
static int NKEY_ = 0;
static inline bool pair_ok(int tk, int qf) {
    if (!PAIRFILTER) return true;
    const size_t b = (size_t)tk * NKEY_ + qf;
    return (OKPAIR[b >> 6] >> (b & 63)) & 1ULL;
}
// With the 4-bucket union a dart has up to four query keys, and the face can close if ANY of them
// admits it. OR, not AND: taking the conjunction would reject branches the union just proved reachable.
static inline bool pair_ok_any(int tk, const int* qf, int n) {
    if (!PAIRFILTER) return true;
    for (int i = 0; i < n; i++) if (pair_ok(tk, qf[i])) return true;
    return false;
}
// FIX 3 — the key constrains a REP, not a type. Admitting a whole type because one of its ~12
// reps matches meant the inner loop glued and checked the other 11 for nothing: measured
// 6,691,818 reps iterated against 724,811 that can match, 89.2% waste. Entries are (type, rep),
// built in ascending (type, rep-order) so the visit order is exactly what the full scan gave.
// qf = the query keys of rneig(f), 1 under BUCKET_OK and up to 4 without it; tkrev = tkey(lneig(f)).
// nqf holds their count in its low three bits and, above them, what extend's count rules ask of the dart:
// 8 lneig(f) is f's mirror image, 16 rneig(f) is, 32 rneig(f) is f itself, 64 f is its own mirror image.
// `ord` is the position this entry would occupy in a full ascending scan, so merging several buckets
// by `ord` reproduces the single-bucket visit order exactly and emission order never depends on how
// many buckets the union happened to touch.
struct CandEnt { int gr; int rrep; int ord; int tkrev; int nqf; int qf[4]; };
static std::vector<std::vector<CandEnt> > CAND;      // (type, rep) pairs, ascending
static std::vector<std::vector<CandEnt> > CAND_NC;   // the noncounting subset (composes with fix A)
static std::vector<CandEnt> FULL_ALL, FULL_NC;       // fallback when the bucket key is unsound
// Scratch for the >1-bucket union, indexed by DFS depth. extend() recurses from inside the loop that
// is reading the merged pool, so a single shared buffer would be clobbered by the child call and the
// parent would resume iterating the child's candidates. Capacity at each depth persists across nodes.
//
// ⚑ deque, NOT vector, and the difference is a use-after-free. The parent holds a pointer into its own
// depth's buffer across the recursive call; a deeper call growing the container would reallocate a
// vector and move every element, leaving that pointer dangling. std::deque guarantees references to
// existing elements survive insertion at either end, so the parent's pointer stays valid.
static std::deque<std::vector<CandEnt> > MERGE_STACK;
   // indices of noncounting types, ascending
static long nckzero = 0;         // closed all-noncounting solutions suppressed
static bool has_noncounting = false;  // set in main(); false for the regular palette

// Coarse-grained parallelism (runtime, no rebuild). The initex() loop over first vertex types is a
// PARTITION of the whole search: extend() never adds a type below vertype[0] (the min-type-root
// invariant, line ~654), so the subtree seeded at first-type i holds exactly the tilings whose
// minimum vertex type is i — disjoint across i. Worker w of EU_SHARD_N handles {i : i % N == w},
// writing to its own out dir; the raw union across workers is IDENTICAL to a sequential run, so the
// pruned catalog is byte-identical (the acceptance gate). No shared state: each worker is its own
// process. Default N=1 => sequential, unchanged.
static const int shard_n = std::getenv("EU_SHARD_N") ? atoi(std::getenv("EU_SHARD_N")) : 1;
// NOT const: EU_FORK (see main) re-points a forked child at its own shard index after the alphabet is
// built, which is the whole reason the fork saves memory.
static int shard_w = std::getenv("EU_SHARD_W") ? atoi(std::getenv("EU_SHARD_W")) : 0;

// DEPTH-2 SHARDING (EU_SHARD_D2=<f>, default 1 = the depth-1 behaviour above, unchanged).
//
// Why: the depth-1 partition cannot split a single first-type subtree, and one always dominates. The
// slowest shard was 218 s of 1109 total at k=7 on 200 shards (19.7%) and 803 s of 4140 at k=8 on 400
// (19.4%) — a fixed FRACTION, so throwing shards at it buys nothing. To go below it the partition has
// to cut INSIDE the heavy root.
//
// The cut: extend() called on a one-vertex root branches into root-level children (glue firstfree to
// an existing free dart, or add a vertex type and glue to one of its darts). Those children partition
// the root's subtree, and every solution is either emitted AT the root level (the branch closed) or
// lives under exactly one child. Numbering the surviving root-level branches and slicing that number
// is therefore exact, the same argument as the depth-1 split one level down.
//
// The counter is safe to share across roots because the branch sequence does not depend on shard
// state: a skipped branch makes and undoes the same glue as a taken one, and the face rules read only
// the configuration. Every shard with the same w1 walks the same roots in the same order and so
// assigns the same numbers.
//
// TWO LEVELS, not one, because pure depth-2 would make every shard redo every root's level-1 work
// (min_slack + the candidate scan + a glue per branch), duplicated N times. Instead
// EU_SHARD_N is still the TOTAL shard count and EU_SHARD_D2 says how many ways each root is split:
//   N1 = N / D2 roots slices, w1 = W / D2      (which roots this shard walks)
//   D2      branch slices,    w2 = W % D2      (which of that root's branches it descends)
// so root-level work is duplicated D2 times, not N. D2=1 reproduces the old partition exactly.
// ⚑ EU_SHARD_N must be divisible by EU_SHARD_D2; main() refuses otherwise rather than silently
// dropping the remainder, which would lose tilings.
static const int shard_d2 = std::getenv("EU_SHARD_D2") ? atoi(std::getenv("EU_SHARD_D2")) : 1;
static int shard_n1 = (shard_d2 > 1) ? shard_n / shard_d2 : shard_n;
static int shard_w1 = (shard_d2 > 1) ? shard_w / shard_d2 : shard_w;
static int shard_w2 = (shard_d2 > 1) ? shard_w % shard_d2 : 0;
// Adopt shard index w. Same arithmetic as the initializers above; a forked child calls it.
static void shard_set(int w) {
    shard_w  = w;
    shard_n1 = (shard_d2 > 1) ? shard_n / shard_d2 : shard_n;
    shard_w1 = (shard_d2 > 1) ? w / shard_d2 : w;
    shard_w2 = (shard_d2 > 1) ? w % shard_d2 : 0;
}
static long long branch_ctr = 0;   // root-level branch number; see shard_take_branch()

// DYNAMIC SPLITTING (EU_FORK=<P> EU_SPLIT=<D>, 2026-11-06). The static slices above leave one heavy slice
// setting the wall time. Here every forked worker walks the top D levels identically, numbers the accepted
// branches of the depth-D nodes in walk order, and explores a branch only while it holds that branch's
// ticket from a counter in shared memory, claiming the next ticket when the branch is done. Tickets only
// grow and every worker walks every number, so each branch is explored exactly once and idle workers take
// the next one (Martin Olivier's solver gets this balance from work donation between threads). Nothing a
// worker finds below depth D may change its walk above it: orderly pruning (EU_ORDERLY) reads only the
// node itself, and closures met above D are written by worker 0 alone.
//
// Under EU_ORDERLY the run then writes what one process writes, byte for byte (2026-11-10). A single
// process emits its blocks in branch order, and orderly emits each tiling from one branch only, so every
// worker heads each block with the branch it came from and merge_split puts them back in that order and
// numbers the serials as it goes. (Without orderly which copy of a tiling is written first depends on
// timing, and the serials still collide across workers.)
static int split_depth = 0;            // D; 0 = off
static long long* TICKET = nullptr;    // MAP_SHARED counter
static long long my_ticket = -1;
static long long in_branch = -1;       // the branch this worker is exploring, -1 above depth D
static int fork_index = 0;

// True iff this shard owns the next root-level branch (or, under EU_SPLIT, holds its ticket). Called
// only after the glue has passed the face rules, so the numbering counts real work and skips nothing
// that another shard would also skip.
static inline bool shard_take_branch() {
    if (split_depth == 0) return (branch_ctr++ % shard_d2) == shard_w2;
    if (branch_ctr++ != my_ticket) return false;
    in_branch = my_ticket;
    return true;
}
static inline void shard_done_branch() {
    if (split_depth > 0) { in_branch = -1; my_ticket = __atomic_fetch_add(TICKET, 1, __ATOMIC_RELAXED); }
}

// EU_PROGRESS=<seconds>: throttled progress heartbeat to STDERR from initex() — the current first
// vertex type i/symbolcount, a rough percent, and elapsed seconds. STDERR only (the catalog is on
// stdout), so the pruned catalog stays byte-identical; default 0 => silent. Coarse: the top-level loop
// over first vertex types is very non-uniform in cost, so the percent tracks SEEDS processed, not work
// done — a rough progress signal, not a linear ETA. Fires at seed boundaries, so a single slow seed's
// extend() shows as a silent stretch (informative in itself).
static const int progress_sec = std::getenv("EU_PROGRESS") ? atoi(std::getenv("EU_PROGRESS")) : 0;

// Per-node debug trace (euoutput1.txt: a line for every configuration the DFS touches). It is pure
// hot-path overhead — string-building + I/O done once per search node — and never feeds the search
// or the emitted solutions. Default OFF; -DEU_TRACE=1 restores Marek's original tracing, and with it
// trace_faces() checks min_slack against a walk of every face at every node.
#ifndef EU_TRACE
#define EU_TRACE 0
#endif
constexpr bool eu_trace = EU_TRACE;

// EU_STREAM (runtime toggle, no rebuild needed): when set, writesolution() emits each solution
// block to std::cout instead of to a per-family file, so the solver can be piped
// straight into the pruner (eu_solver | eu_pruner) with raw blocks never landing on disk. The
// block format itself is unchanged; only the sink changes.
static const bool eu_stream = std::getenv("EU_STREAM") != nullptr;

// EU_NOCYCLES — drop the per-face cycle text from an emitted block. OPT-IN, so every existing caller
// is byte-identical without it.
//
// A raw block is five header lines, then one line per face cycle, then "---". NOTHING READS THE CYCLE
// LINES. eu_pruner takes vertypeline/signatureline/tesline/conwayline and then skips forward to the
// "---"; develop_spherical and develop_euclid read the PRUNED blocks, which never had them.
//
// Measured on star-wide b00002 at k<=3 (187,522 blocks): 710 bytes per block with them, 267 without,
// so they are 62% of everything the solver writes and everything the pruner then reads past. The
// function that produces them, writecyclefinal, is 18% of the solver by `sample`. The PRUNED output
// is byte-identical either way, which is the check that matters.
//
// The separator still goes out, because that is what the pruner's skip loop stops on.
static const bool eu_nocycles = std::getenv("EU_NOCYCLES") != nullptr;

// EU_PRUNED (with EU_ORDERLY): write the catalogue itself. Orderly emits every tiling once and nothing
// else, so eu_pruner would keep every block and only reformat it, at about the cost of the search (regular
// k<=12: 13.0e9 instructions against 11.7e9). With this each block goes out as the pruner writes it (no
// "Number of vertex types" line, no cycles, a "Count type" line) into out/pruned/eupruned_<k>_<family>.txt,
// the files the pruner would have made from this run's raw output, byte for byte.
static const bool eu_pruned = std::getenv("EU_PRUNED") != nullptr;

struct vertexdef {
    std::string symbol;
    std::vector<std::string> label;
    std::vector<int> lneig;
    std::vector<int> rneig;
    std::vector<int> mirro;
    std::vector<int> lvert;   // corner-CLASS id per dart (regular palette: bijective with size)
    // EDGE TYPE per dart, 0 = untyped. A dart is (half-edge, side) and both sides of a half-edge
    // carry the same type, so gluing is legal only between darts of equal type. Empty on the
    // compiled-table path and on CTRNTB01 files, where EDGE_TYPED stays false and nothing reads it.
    std::vector<int> etype;
    int ferkval;
    std::string code;
    int counting;             // 1 = true (>=3-tile) vertex, 0 = dent-fill point (non-vertex)
    // Explicit Aut-orbit representative darts to try when attaching a fresh vertex of
    // this type. Replaces Marek's "first size/ferkval darts" prefix rule, which is NOT
    // a transversal for words that are chiral AND rotationally symmetric (star palettes
    // hit this; the prefix would silently drop tilings). For the regular palette the
    // generator certifies reps == {0..ran-1}, so behavior is byte-identical.
    std::vector<int> reps;
};

// OPEN FACES, KEPT AS THE GLUES ARE MADE (2026-11-10). A face is a chain of corners (d, rneig[d]) linked by
// glue[rneig[d]]. An open one runs from a free dart, its left end, to a free dart, its right end, and every
// free dart is the left end of exactly one open face and the right end of exactly one. So the open faces are
// records on the free darts: gluing x to y joins the face that ended at x to the face that started at y, in
// O(1), and every rule the search reads off a face (the class sequence, the length against L, the least
// slack, a face with no slack left) is read off its record. Before this each node walked every face of
// the configuration several times over.
// A growable array that does not initialise what it grows. add_vertex fills every entry it adds, and
// std::vector::resize zeroed each one first: eight arrays for every vertex tried.
template <class T> struct Arr {
    T* p = nullptr;
    int n = 0, cap = 0;
    Arr() {}
    Arr(const Arr&) = delete;
    Arr& operator=(const Arr&) = delete;
    ~Arr() { std::free(p); }
    void resize(int m) {
        if (m > cap) { cap = std::max(2 * cap, m + 64); p = (T*)std::realloc(p, sizeof(T) * (size_t)cap); }
        n = m;
    }
    T& operator[](size_t i) { return p[i]; }
    const T& operator[](size_t i) const { return p[i]; }
    T* data() { return p; }
    const T* data() const { return p; }
    size_t size() const { return (size_t)n; }
    const T* begin() const { return p; }
    const T* end() const { return p + n; }
};
struct Face {
    int rend, cnt, lo, dir;   // of the face this dart is the left end of: right end, corners, lowest dart, class direction (0 = one corner)
    int lend;                 // of the face this dart is the right end of: left end
};
struct FaceUndo { int s, r; Face was; int lend; };   // a join: the left end's record and the right end's lend, as they were
struct configuration {
    Arr<int> lneig;
    Arr<int> rneig;
    Arr<int> mirro;
    Arr<int> lvert;           // corner-class ids (see vertexdef)
    Arr<int> etype;           // per-dart edge type, parallel to lvert (empty unless EDGE_TYPED)
    Arr<int> glue;
    Arr<int> vof;             // dart -> vertex, and voff: vertex -> its first dart
    std::vector<int> voff;
    std::vector<int> vertype;
    int num = 0;              // total vertex types incl. noncounting (drives labels/framing)
    int kcnt = 0;             // counting vertex types only (drives k, maxnum, file naming)
    int dfs_depth = 0;
    Arr<Face> face;
    std::vector<unsigned long long> freeb;   // a bit per free dart
    int nfree = 0;
    std::vector<FaceUndo> ftrail;            // joins and glued darts, undone last first (undo_to)
    std::vector<int> gtrail;
};

// EDGE TYPES. False for every palette that declares none (and for the whole compiled-table
// path), in which case conf.etype stays empty and none of this costs anything beyond one branch.
static bool EDGE_TYPED = false;
// COMPLEMENTARY gluing (bubble tiles): the two sides of an edge must DIFFER, not agree. A bump must
// meet a bite, so the matching relation is irreflexive and no relabelling of a like-to-like alphabet
// can express it. With exactly two edge types "differ" IS the complement, so no pairing convention
// is needed. develop_marked.py --complement re-checks every glue, which is what catches a run whose
// palette is complementary but whose solver was launched without this knob.
static const bool EDGE_COMPL = std::getenv("EU_EDGE_COMPL") != nullptr;
// SIDED CLASSES. A dart is (half-edge, side); lvert stores the SIDE-0 corner class and CLASS_SIGMA
// maps it to the side-1 one. They differ only when a tile's mirror image permutes its corner classes
// — never for an equilateral tile, so sigma is the identity for the regular, star, isotoxal, scaled
// and polyomino palettes.
//
// The search reads NOTHING through sigma, and that is a measured result, not an omission. Letting a
// gluing choose which side it joins to — a flip bit per seam, the obvious reading of "a chirality bit
// per dart" — was implemented and REVERTED: on tri45all it found no tiling the sided classes alone do
// not, cost a 26x redundancy (33,798 raw solutions pruning to the same 1,309), and on fdsq, where the
// answer is known, it filed 41 of 1,420 patterns under the WRONG k. Gluing f to i with a flip is the
// same pair of face constraints as gluing f to mirro[i] without one, with the two faces exchanged, so
// the freedom was already in the enumeration. Sidedness belongs in the alphabet; the seam has none.
static bool SIGMA_TRIVIAL = true;

// Does this alphabet carry edge types? Read off the loaded mainlist, so the COMPILED and the RUNTIME
// table paths reach the same answer. It used to live inside the runtime loader alone, which meant
// `eu_solver.<palette>` — the binary run-oracle-parallel.sh uses — ran every edge-typed palette with
// its gluing constraint OFF: on the planigons that was 23/76/298 where the constrained search finds
// 18/67/233, the extra "tilings" gluing edges of different lengths to each other.
static void detect_edge_types();
// One past the largest edge-type id, so (class, edge type) packs into one int for the WL colour.
static int ETSPAN = 1;
// mainlist + class tables are generated per palette by alphabets/gen_alphabet.py
// (resolved via -I tables/$(PALETTE); regular reproduces the legacy 44 entries exactly).
#include <map>
#ifdef EU_RUNTIME_TABLES
// ---------------------------------------------------------------------------------------------
// RUNTIME ALPHABET. Same symbols solver_tables.inc defines, read from tables.bin at startup
// instead of compiled in. The compiled path remains the default and is untouched — build with
// RUNTIME_TABLES=1 to get this one, and `make check-regular` still gates the compiled path.
//
// The wall this removes: the alphabet is normally C++ source, and `g++ -O2` OOMs on a 588 MB
// single-line file of millions of string literals long before any search begins (combined-z24,
// 1,747,450 vertex types, 2026-07-12). The data is 100-200 MB in RAM — trivial here. Nothing about
// the search changes; this is purely how the tables arrive.
//
// Format is documented in gen_alphabet.py emit_binary(). Little-endian i32 throughout, which is
// every machine this runs on; a big-endian host would need byte swaps and is not supported.
// ---------------------------------------------------------------------------------------------
static int TABLE_D = 0, TABLE_MAXL = 0;
std::vector<vertexdef> mainlist;
static std::vector<int> CLASS_UNITS, CLASS_L, CLASS_P, CLASS_NEXT, CLASS_PREV, CLASS_TILE, CLASS_SIGMA;
static std::vector<std::string> CLASS_DISP, TILE_FAM, TILE_NAME;

namespace {
struct TableReader {
    const unsigned char* p; const unsigned char* end;
    void need(size_t n) const {
        if ((size_t)(end - p) < n) { std::cerr << "tables.bin: truncated\n"; std::exit(2); }
    }
    int i32() { need(4); int v; std::memcpy(&v, p, 4); p += 4; return v; }
    std::string str() { int n = i32(); need((size_t)n); std::string s((const char*)p, (size_t)n); p += n; return s; }
    std::vector<int> iv() { int n = i32(); std::vector<int> v((size_t)n); for (int i = 0; i < n; i++) v[i] = i32(); return v; }
    std::vector<std::string> sv() { int n = i32(); std::vector<std::string> v((size_t)n); for (int i = 0; i < n; i++) v[i] = str(); return v; }
};
}

static void load_tables_bin(const char* path) {
    std::ifstream f(path, std::ios::binary);
    if (!f) { std::cerr << "EU_TABLES: cannot open " << path << "\n"; std::exit(2); }
    std::vector<unsigned char> buf((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
    const bool v3 = buf.size() >= 8 && std::memcmp(buf.data(), "CTRNTB03", 8) == 0;
    const bool v2 = v3 || (buf.size() >= 8 && std::memcmp(buf.data(), "CTRNTB02", 8) == 0);
    if (buf.size() < 8 || (!v2 && std::memcmp(buf.data(), "CTRNTB01", 8) != 0)) {
        std::cerr << "EU_TABLES: " << path << " is not a CTRNTB01/02/03 table file\n"; std::exit(2);
    }
    TableReader r{ buf.data() + 8, buf.data() + buf.size() };
    TABLE_D = r.i32(); TABLE_MAXL = r.i32();
    const int ncls = r.i32(), ntiles = r.i32(), ntypes = r.i32();
    auto fixed = [&](std::vector<int>& v) { v.resize((size_t)ncls); for (int i = 0; i < ncls; i++) v[i] = r.i32(); };
    fixed(CLASS_UNITS); fixed(CLASS_L); fixed(CLASS_P); fixed(CLASS_NEXT); fixed(CLASS_PREV); fixed(CLASS_TILE);
    // CLASS_SIGMA arrived with CTRNTB03; an older table file means an equilateral-only alphabet,
    // where sigma is the identity.
    if (v3) fixed(CLASS_SIGMA);
    else { CLASS_SIGMA.resize((size_t)ncls); for (int i = 0; i < ncls; i++) CLASS_SIGMA[i] = i; }
    CLASS_DISP = r.sv(); TILE_FAM = r.sv(); TILE_NAME = r.sv();
    if ((int)CLASS_DISP.size() != ncls || (int)TILE_NAME.size() != ntiles) {
        std::cerr << "tables.bin: class/tile count mismatch\n"; std::exit(2);
    }
    mainlist.resize((size_t)ntypes);
    for (int i = 0; i < ntypes; i++) {
        vertexdef& d = mainlist[i];
        d.symbol = r.str(); d.code = r.str();
        d.ferkval = r.i32(); d.counting = r.i32();
        d.label = r.sv(); d.lneig = r.iv(); d.rneig = r.iv(); d.mirro = r.iv(); d.lvert = r.iv(); d.reps = r.iv();
        if (v2) d.etype = r.iv();
    }
    if (r.p != r.end) { std::cerr << "tables.bin: " << (r.end - r.p) << " trailing bytes\n"; std::exit(2); }
    detect_edge_types();
    std::cerr << "tables: " << ntypes << " vertex types, " << ncls << " classes, D=" << TABLE_D
              << (EDGE_TYPED ? ", EDGE TYPES ON" : "")
              << " (runtime, " << path << ")\n";
}
#else
#include "solver_tables.inc"
#endif
#include "hyp_feas.h"   // EU_HYPFEAS: angle feasibility of a block's vertex types (negative-defect palettes)
#include "congruence.hpp"   // simplify_inner's covering test, shared with eu_pruner

// Defined where BOTH table paths have `mainlist` in scope. Which is the point: it used to live inside
// the runtime loader alone, so the compiled binary — the one run-oracle-parallel.sh uses — left
// EDGE_TYPED false and ran every edge-typed palette with its gluing constraint off.
static void detect_edge_types() {
    for (size_t t = 0; t < mainlist.size(); t++)
        for (size_t q = 0; q < mainlist[t].etype.size(); q++)
            if (mainlist[t].etype[q]) {
                EDGE_TYPED = true;
                if (mainlist[t].etype[q] >= ETSPAN) ETSPAN = mainlist[t].etype[q] + 1;
            }
}

int symbolcount;

// FIX 7 — the label was a std::string built per dart per materialisation: concatenation plus
// std::to_string, ~1.8e9 times at k=2, measured at 30% of runtime. The pieces are a base string from
// the palette tables and a tile index, so intern the bases once and carry a packed int. Only the
// output paths ever need the text, and the one hot read (does the label start with '*') becomes a
// lookup on the interned base.
static std::vector<std::string> LBASE;        // interned base strings
static std::vector<char> LBASE_STAR;          // does base i start with '*'
static std::map<std::string, int> LBASE_IDX;

// A label piece of at most 8 bytes, written as one word: a base without its star, or a vertex's suffix.
struct Tok { char c[8]; int n; };
static Tok make_tok(const std::string& s) {
    if (s.size() > 8) { std::cerr << "label piece longer than 8 bytes: " << s << "\n"; std::exit(2); }
    Tok t = { { 0, 0, 0, 0, 0, 0, 0, 0 }, (int)s.size() };
    std::memcpy(t.c, s.data(), s.size());
    return t;
}
static inline char* put(char* p, const Tok& t) { std::memcpy(p, t.c, 8); return p + t.n; }   // needs 8 bytes of room
static std::vector<Tok> LBASE_TOK;            // base i without its star
static int lbase_id(const std::string& b) {
    std::map<std::string, int>::iterator it = LBASE_IDX.find(b);
    if (it != LBASE_IDX.end()) return it->second;
    int id = (int)LBASE.size();
    LBASE.push_back(b);
    LBASE_STAR.push_back(!b.empty() && b[0] == '*' ? 1 : 0);
    LBASE_TOK.push_back(make_tok(b.substr(LBASE_STAR.back())));
    LBASE_IDX[b] = id;
    return id;
}
static std::vector<std::vector<int> > LBASE_OF;   // [type][dart] -> interned base id
// A dart's label is its type's base string and its vertex's number, so it is derived, not stored per dart:
// the base, then one apostrophe per vertex up to three and "@n" beyond. (FIX 7 kept a packed int per dart
// and FIX 16a a cache of rendered strings; both are gone with the per-dart copy.) Every base is digits
// with an optional leading '*', so two labels are one text only as the same base on the same vertex.
static inline int dart_base(configuration const& c, int d) {
    const int v = c.vof[d];
    return LBASE_OF[c.vertype[v]][d - c.voff[v]];
}
static inline bool dart_star(configuration const& c, int d) { return LBASE_STAR[dart_base(c, d)] != 0; }
static std::vector<Tok> SUFFIX;   // a vertex's suffix: one apostrophe per vertex up to three, "@n" beyond
static const Tok* suffix_toks(int n) {   // the first n of them
    while ((int)SUFFIX.size() < n)
        SUFFIX.push_back(make_tok(SUFFIX.size() > 3 ? "@" + std::to_string(SUFFIX.size()) : std::string(SUFFIX.size(), '\''))); 
    return SUFFIX.data();
}
static std::string label_text(configuration const& c, int d) {
    const Tok& t = suffix_toks(c.vof[d] + 1)[c.vof[d]];
    return LBASE[dart_base(c, d)] + std::string(t.c, (size_t)t.n);
}

// long long, not int: this counts DFS nodes, and runs now reach billions. composite-convex k<=4
// (2026-08-08) printed "nodes: -1898351957" — a signed 32-bit wrap at ~2.15e9, so every node figure
// from a long run was silently wrong. The pricing arguments in docs/ctrnact-solver-optimizations.md
// are built on this number, so a wrapped counter is a misleading measurement, not a cosmetic bug.
long long solcount = 0;

std::ofstream gen;

std::string conwaysymbol(std::string const& first, std::string const& second);
std::string verbalvertices(std::vector<int> const& vertype);
int vertypesolvedadd(std::vector<int> const& vertype);
int initex();
int writesolution(configuration const& conf);

bool simplify(configuration const& conf);
static inline bool edge_ok(configuration const& c, int x, int y) {
    if (!EDGE_TYPED) return true;
    const int a = c.etype[x], b = c.etype[y];
    if (a == 0 || b == 0) return true;   // 0 is a wildcard: an untyped edge glues to anything
    return EDGE_COMPL ? a != b : a == b;
}

int extend(configuration& slist, int firstfree, int minc);

// A BLOCK IS WRITTEN THROUGH A RAW CURSOR (2026-11-10). It has a few hundred pieces of one to a dozen bytes, and
// an append apiece, with a std::to_string for every number, was a fifth of a run that is mostly tilings.
// Each writer returns the cursor after what it wrote; the caller sizes the room (writesolution).
static inline char* put_s(char* p, const std::string& s) { std::memcpy(p, s.data(), s.size()); return p + s.size(); }
template <size_t N> static inline char* put_l(char* p, const char (&s)[N]) { std::memcpy(p, s, N - 1); return p + N - 1; }
static inline char* put_n(char* p, long long v) { return std::to_chars(p, p + 20, v).ptr; }
static inline char* put_k(char* p, int k) { if (k < 10) *p++ = '0'; return put_n(p, k); }   // a file name's k: two digits
// What a cursor writer wrote, as a string (the trace's use of them).
template <class F> static std::string text_of(size_t room, F f) {
    std::string s(room, '\0');
    s.resize((size_t)(f(&s[0]) - s.data()));
    return s;
}

std::string conwaysymbol(std::string const& first, std::string const& second) {
    int mirrornum = 0;
    std::string mfirst = first;
    std::string msecond = second;
    if (first[0] == '*') {
        mfirst = mfirst.substr(1);
        mirrornum++;
    }
    if (second[0] == '*') {
        msecond = msecond.substr(1);
        mirrornum++;
    }
    bool same = mfirst == msecond;
    if (mirrornum != 1) {
        if (same) {
            return "(" + mfirst + ")";
        }
        else {
            return "(" + mfirst + " " + msecond + ")";
        }
    }
    else {
        if (same) {
            return "[" + mfirst + "]";
        }
        else {
            return "[" + mfirst + " " + msecond + "]";
        }
    }
}

// The Conway glue line: at most 35 bytes a dart (two brackets, a space, four pieces of at most 8). A glue
// drags its mirror image along, so the four darts {cy, glue, their mirror images} are written once, at the
// lowest of them.
static char* writeconway(configuration const& conf, char* p) {
    const int* G = conf.glue.data(); const int* M = conf.mirro.data(); const int* VO = conf.vof.data();
    const Tok* suffix = suffix_toks(conf.num);
    const int NDARTS = (int)conf.glue.size();
    static std::vector<const int*> base;   // per vertex: its type's label bases, placed so that a dart indexes them
    base.resize(conf.num);
    for (int v = 0; v < conf.num; v++) base[v] = LBASE_OF[conf.vertype[v]].data() - conf.voff[v];
    for (int v1 = 0, cy = 0; v1 < conf.num; v1++) {
        for (const int end = v1 + 1 < conf.num ? conf.voff[v1 + 1] : NDARTS; cy < end; cy++) {
            const int g = G[cy], m = M[cy];
            if (g < cy || m < cy || G[m] < cy) continue;   // free (-1), or written at a lower dart
            // conwaysymbol's text: the two labels without their stars, once if they are one label, in
            // square brackets when exactly one is on the mirror side
            const int v2 = VO[g], b1 = base[v1][cy], b2 = base[v2][g];
            const Tok& first = LBASE_TOK[b1];
            const Tok& second = LBASE_TOK[b2];
            const bool square = LBASE_STAR[b1] != LBASE_STAR[b2];
            *p++ = square ? '[' : '(';
            p = put(put(p, first), suffix[v1]);
            if (v1 != v2 || first.n != second.n || std::memcmp(first.c, second.c, 8) != 0) {
                *p++ = ' ';
                p = put(put(p, second), suffix[v2]);
            }
            *p++ = square ? ']' : ')';
        }
    }
    return p;
}

std::string verbalvertices(std::vector<int> const& vertype) {
    std::string s;
    for (int i : vertype) { s += mainlist[i].symbol; s += ", "; }
    if (s.size() >= 2) s.resize(s.size() - 2);
    return s;
}

// DYNAMIC FACE CLOSURE (probe). An open face must have `count <= L`, which discards the count.
// A face that has already walked `count` darts can only close at an admissible c > count, and the
// remaining chain must be realizable: with the walk open at dart `rfree` and started at `i`,
//     tkey(i) reachable from Q(rfree) in exactly (c - count - 1) key steps.
// acc[src][dst] has bit b set iff dst is in Reach_{b-1}(src), so the whole test is
//     (acc >> 0) << count  &  allowed   != 0
// i.e. two shifts and an AND once the two keys are known. This is information the STATIC filter cannot
// have: it must assume every count.
static std::vector<std::vector<unsigned long long> > DYN_ACC;   // per orbit, n*n
static std::vector<int> DYN_LOC, DYN_KORB, DYN_N;
static std::vector<unsigned long long> DYN_ALLOWED;             // per orbit, bit c per admissible c
static bool DYN_READY = false;

// The test on the two keys: tk_i = tkey(i), and qs = the query keys of rfree.
static inline bool dyn_keys_close(int tk_i, const int* qs, int nq, int count) {
    const int o = DYN_KORB[tk_i];
    if (o < 0) return true;                                    // unknown -> do not reject
    const int lj = DYN_LOC[tk_i];
    if (lj < 0 || count >= 63) return true;
    // The open dart has 1..4 query keys under the 4-bucket union. The face can still close if ANY of
    // them reaches tkey(i) at an admissible length, so this is a disjunction; requiring all of them
    // would reject branches that are genuinely closable and lose tilings.
    for (int t = 0; t < nq; t++) {
        const int q_r = qs[t];
        if (DYN_KORB[q_r] != o) return true;                   // unknown/other orbit -> do not reject
        const int li = DYN_LOC[q_r];
        if (li < 0) return true;
        const unsigned long long m = DYN_ACC[o][(size_t)li * DYN_N[o] + lj];
        // closing at total length c needs tkey(i) in Reach_{c-count}(q_r), i.e. acc bit (c-count+1);
        // shifting left by (count-1) lands that bit on c, where DYN_ALLOWED has its bits.
        if (((m << (count - 1)) & DYN_ALLOWED[o]) != 0ULL) return true;
    }
    return false;
}
static inline int tkey_at(configuration const& c, int d) { return cand_key(c.lvert[d], c.lvert[c.rneig[d]], c.mirro[d] == d); }
static inline int qkeys_at(configuration const& c, int d, int* out) { return qkeys(c.lvert[d], c.lvert[c.rneig[d]], c.mirro[d] == d, out); }
static inline bool dyn_can_close(configuration const& conf, int i, int rfree, int count) {
    int qs[4];
    const int nq = qkeys_at(conf, rfree, qs);
    return dyn_keys_close(tkey_at(conf, i), qs, nq, count);
}

// Add a vertex of type g: its darts, all free, each the one-corner face (d, rneig[d]).
static void add_vertex(configuration& c, int g) {
    const vertexdef& VD = mainlist[g];
    const int l = (int)c.rneig.size(), sl = (int)VD.rneig.size(), n = l + sl, v = (int)c.vertype.size();
    // One sized grow per array, then raw-pointer stores (FIX 8). Capacity persists across the DFS because
    // drop_vertex shrinks with resize(), so the grow almost never reallocates.
    c.rneig.resize(n); c.lneig.resize(n); c.mirro.resize(n); c.lvert.resize(n); c.glue.resize(n);
    c.vof.resize(n); c.face.resize(n); c.freeb.resize(((size_t)n + 63) >> 6);
    if (EDGE_TYPED) c.etype.resize(n);
    int* RN = c.rneig.data(); int* LN = c.lneig.data(); int* MI = c.mirro.data(); int* LV = c.lvert.data();
    int* GL = c.glue.data(); int* VO = c.vof.data(); Face* F = c.face.data();
    const int* srn = VD.rneig.data(); const int* sln = VD.lneig.data();
    const int* smi = VD.mirro.data(); const int* slv = VD.lvert.data();
    for (int j = 0; j < sl; j++) {
        const int d = l + j;
        RN[d] = l + srn[j]; LN[d] = l + sln[j]; MI[d] = l + smi[j]; LV[d] = slv[j];
        GL[d] = -1; VO[d] = v;
        F[d].rend = l + srn[j]; F[d].cnt = 1; F[d].lo = d; F[d].dir = 0; F[d].lend = l + sln[j];
        c.freeb[(size_t)d >> 6] |= 1ULL << (d & 63);
    }
    if (EDGE_TYPED) for (int j = 0; j < sl; j++) c.etype[l + j] = VD.etype[j];
    c.voff.push_back(l); c.vertype.push_back(g);
    c.num++; c.kcnt += VD.counting; c.nfree += sl;
}
// Remove the last vertex, whose darts are all free again.
static void drop_vertex(configuration& c) {
    const int l = c.voff.back(), n = (int)c.rneig.size();
    for (int d = l; d < n; d++) c.freeb[(size_t)d >> 6] &= ~(1ULL << (d & 63));
    c.rneig.resize(l); c.lneig.resize(l); c.mirro.resize(l); c.lvert.resize(l); c.glue.resize(l);
    c.vof.resize(l); c.face.resize(l); c.freeb.resize(((size_t)l + 63) >> 6);
    if (EDGE_TYPED) c.etype.resize(l);
    c.num--; c.kcnt -= mainlist[c.vertype.back()].counting; c.nfree -= n - l;
    c.voff.pop_back(); c.vertype.pop_back();
}

// Face validity over corner CLASSES, checked where two faces join. Regular palette (period p=1,
// CLASS_NEXT=id, L=n) degenerates to Marek's original: same class along the face, closed length divides
// n, open length <= n. Star tiles (p=2, point/dent alternating word of length L=2n): the class must
// advance +1 mod p along the face, a closed face must be a whole number of word periods (count % p == 0)
// AND a divisor of L (rotation symmetry of the tile), an open face must not exceed L. For arbitrary p
// (composite tiles, and MIRROR placements that traverse the boundary backwards) the direction is locked
// by the face's first step to CLASS_NEXT or CLASS_PREV (Face::dir), so the advance rule is
// orientation-safe for any p; p=1 (regular) locks +1 immediately since CLASS_PREV==CLASS_NEXT==id.
//
// x has just been glued to y: the face that ended at x runs on into the face that started at y. False when
// the joined face breaks a rule. Marek's checkface applied these rules by walking the face from each of
// its darts; a face that kept them on both sides of the seam keeps them iff the seam does.
static inline bool face_join(configuration& c, int x, int y) {
    Face* F = c.face.data();
    const int s = F[x].lend, cx = c.lvert[x], cy = c.lvert[c.rneig[y]];
    if (s == y) {   // the face closes on itself
        const int n = F[y].cnt;
        if (n % CLASS_P[cx] != 0 || CLASS_L[cx] % n != 0) return false;
        return n == 1 || cy == (F[y].dir > 0 ? CLASS_NEXT[cx] : CLASS_PREV[cx]);
    }
    int d = F[s].dir;
    if (d == 0) { if (cy == CLASS_NEXT[cx]) d = 1; else if (cy == CLASS_PREV[cx]) d = -1; else return false; }
    else if (cy != (d > 0 ? CLASS_NEXT[cx] : CLASS_PREV[cx])) return false;
    if (F[y].dir != 0 && F[y].dir != d) return false;
    const int n = F[s].cnt + F[y].cnt, r = F[y].rend;
    if (n > CLASS_L[cx]) return false;
    c.ftrail.push_back({ s, r, F[s], F[r].lend });
    F[s].rend = r; F[s].cnt = n; F[s].dir = d; F[r].lend = s;
    if (F[y].lo < F[s].lo) F[s].lo = F[y].lo;
    return true;
}
// Glue free darts a and b (a == b: a dart to itself). False when a face through the seam breaks a rule; the
// caller undoes to its mark either way.
static inline bool cglue(configuration& c, int a, int b) {
    c.glue[a] = b; c.glue[b] = a;
    c.freeb[(size_t)a >> 6] &= ~(1ULL << (a & 63)); c.freeb[(size_t)b >> 6] &= ~(1ULL << (b & 63));
    c.gtrail.push_back(a); c.nfree--;
    if (a == b) return face_join(c, a, a);
    c.gtrail.push_back(b); c.nfree--;
    return face_join(c, a, b) && face_join(c, b, a);
}
static inline void undo_to(configuration& c, size_t fmark, size_t gmark) {
    for (Face* F = c.face.data(); c.ftrail.size() > fmark; c.ftrail.pop_back()) {
        const FaceUndo& u = c.ftrail.back();
        F[u.s] = u.was; F[u.r].lend = u.lend;
    }
    for (; c.gtrail.size() > gmark; c.gtrail.pop_back()) {
        const int d = c.gtrail.back();
        c.glue[d] = -1; c.freeb[(size_t)d >> 6] |= 1ULL << (d & 63); c.nfree++;
    }
}
// The joins since `from` name the faces a glue touched. None of them, if still open, may be unable to reach
// an admissible length. Asking from the left end is enough: a walk from any other dart of the face asks
// the same of a suffix, which the chain already built then answers.
// known: two faces already asked about, each as left end, right end and count; one that still reads so
// is not asked again.
static inline bool faces_can_close(configuration const& c, size_t from, const int* known = nullptr) {
    if (DYN_READY)
        for (size_t i = from; i < c.ftrail.size(); i++) {
            const int s = c.ftrail[i].s;
            if (c.glue[s] != -1) continue;
            const Face& f = c.face[s];
            if (known && ((s == known[0] && f.rend == known[1] && f.cnt == known[2]) ||
                          (s == known[3] && f.rend == known[4] && f.cnt == known[5]))) continue;
            if (!dyn_can_close(c, s, f.rend, f.cnt)) return false;
        }
    return true;
}

// FORCED CLOSURE (from Martin Olivier's solver, 2026-11-06). An open face that has reached its full length L
// (slack 0) can neither grow nor close elsewhere, so its two free ends must be glued now. Without this
// every such move cost a node: the search picks the zero-slack face, and every candidate but one fails.
// After each branch glue the faces it touched (the joins since `from`) are closed to a fixpoint. Only
// nodes with a single surviving child disappear, so the same configurations close in the same order and the
// catalogue is byte-identical. Regular k<=12: 7.68M -> 2.24M nodes. EU_NOFORCE=1 turns it off.
static const bool no_force = std::getenv("EU_NOFORCE") != nullptr;
static long long forced_glues = 0;
// False = the branch is dead. The caller's undo_to takes the forced glues back with its own.
static bool propagate_forced(configuration& c, size_t from) {
    if (no_force) return true;
    for (size_t i = from; i < c.ftrail.size(); i++) {
        const int s = c.ftrail[i].s;
        if (c.glue[s] != -1) continue;                        // closed, or joined on under another left end
        const int r = c.face[s].rend;
        if (c.face[s].cnt != CLASS_L[c.lvert[r]]) continue;
        const bool ms = c.mirro[s] == s;
        if (ms != (c.mirro[r] == r)) return false;
        if (EDGE_TYPED && (!edge_ok(c, s, r) || (!ms && !edge_ok(c, c.mirro[s], c.mirro[r])))) return false;
        const size_t m = c.ftrail.size();
        if (!cglue(c, s, r)) return false;
        if (!ms) {
            const int a = c.mirro[s], b = c.mirro[r];
            if (c.glue[a] != -1 || c.glue[b] != -1) { if (c.glue[a] != b) return false; }
            else if (!cglue(c, a, b)) return false;
        }
        forced_glues++;
        if (!faces_can_close(c, m)) return false;
    }
    return true;
}

// The open face with the least slack, the first in dart order among equals (the one holding the lowest
// dart): its left free end, and its slack. The search branches on it; Marek's writecycle found it by
// walking every face at every node.
static inline int min_slack(configuration const& c, int& slack) {
    int best = -1, bs = TABLE_MAXL + 1, blo = 0;
    const Face* F = c.face.data(); const int* LV = c.lvert.data(); const int* RN = c.rneig.data();
    for (size_t w = 0; w < c.freeb.size(); w++)
        for (unsigned long long bits = c.freeb[w]; bits; bits &= bits - 1) {
            const int f = (int)(w << 6) + __builtin_ctzll(bits);
            const int sl = CLASS_L[LV[RN[f]]] - F[f].cnt;
            if (sl < bs || (sl == bs && F[f].lo < blo)) { best = f; bs = sl; blo = F[f].lo; }
        }
    slack = bs;
    return best;
}
// The lowest free dart >= from, -1 when there is none.
static inline int next_free(configuration const& c, int from) {
    for (size_t w = (size_t)from >> 6; w < c.freeb.size(); w++, from = (int)(w << 6)) {
        const unsigned long long bits = c.freeb[w] & (~0ULL << (from & 63));
        if (bits) return (int)(w << 6) + __builtin_ctzll(bits);
    }
    return -1;
}

// EU_TRACE: every face as Marek's writecycle printed it, and a check of min_slack against the walk of
// every face that it replaced.
static void trace_faces(configuration const& conf, std::ostream& filen, int ff, int slack) {
    int best = -1, bs = TABLE_MAXL + 1;
    std::vector<char> met(conf.glue.size(), 0);
    for (int cy = 0; cy < (int)conf.glue.size(); cy++) {
        if (met[cy]) continue;
        int left = cy;
        while (conf.glue[left] != -1 && conf.glue[left] != conf.rneig[cy]) left = conf.lneig[conf.glue[left]];
        const bool open = conf.glue[left] == -1;
        if (!open) left = cy;
        const int first = left, L = CLASS_L[conf.lvert[conf.rneig[left]]];
        std::string mainst;
        int count = 0;
        do {
            const int right = conf.rneig[left];
            met[left] = 1;
            mainst += label_text(conf, left) + "/" + label_text(conf, right) + "(" + CLASS_DISP[conf.lvert[right]] + ")-";
            count++;
            left = conf.glue[right];
        } while (left != -1 && left != first);
        if (open) { if (L - count < bs) { best = first; bs = L - count; } }
        else {
            mainst.pop_back();
            mainst = L / count != 1 ? " [" + mainst + "]x" + std::to_string(L / count) : " " + mainst;
        }
        filen << mainst << "\n";
    }
    if (best != ff || bs != slack) { std::cerr << "trace: min_slack disagrees with the walk of every face\n"; std::abort(); }
}

// FIX 16d — both signatures walked a vector as long as the WHOLE ALPHABET to read `num` non-zeros.
// Sorting the vertype (conf.num ints) visits the same types in the same ascending order, so the text is
// identical, and the cost stops depending on how big the palette is: star24full's 60,927 entries were
// being scanned to find at most a dozen.
static std::vector<int> SIG_SORT;
static const std::vector<int>& sorted_vertype(std::vector<int> const& vertype) {
    SIG_SORT.assign(vertype.begin(), vertype.end());
    std::sort(SIG_SORT.begin(), SIG_SORT.end());
    return SIG_SORT;
}

// Room for one mention of every type in v: its symbol or its code, a count and a separator.
static size_t types_room(std::vector<int> const& v) {
    size_t n = 0;
    for (int t : v) n += std::max(mainlist[t].symbol.size(), mainlist[t].code.size()) + 16;
    return n;
}
// Both take the SORTED types.
static char* signature(std::vector<int> const& v, char* p) {
    for (size_t a = 0, b; a < v.size(); a = b) {
        for (b = a; b < v.size() && v[b] == v[a]; b++) {}
        if (a) p = put_l(p, ", ");
        p = put_s(p, mainlist[v[a]].symbol);
        if (b - a > 1) { *p++ = 'x'; p = put_n(p, (long long)(b - a)); }
    }
    return p;
}
static char* filesignature(std::vector<int> const& v, char* p) {
    for (size_t a = 0, b; a < v.size(); a = b) {
        for (b = a; b < v.size() && v[b] == v[a]; b++) {}
        if (a) *p++ = ' ';
        p = put_s(p, mainlist[v[a]].code);
        if (b - a > 1) p = put_n(p, (long long)(b - a));
    }
    return p;
}

// FIX 15 — the emission counter was O(solutions x signatures x alphabet), with a COPY per compare.
//
// It exists only to number the .tes files: solutions sharing a vertex-type multiset get 1, 2, 3, ...
// The old body built a length-`symbolcount` occurrence vector per solution, then walked every
// signature seen so far, ASSIGNING each stored vector into `res2` before comparing it. Three costs
// stacked: an allocation the size of the whole alphabet, a full vector copy per candidate, and a
// linear scan that grows with the answer set.
//
// Nobody had measured it, because until the star searches every run emitted a few hundred solutions.
// star-wide bucket b00002 at k<=3 emits 187,522, and `sample` puts memmove + __assign_with_size +
// memcmp under this one function at 64% of the whole search.
//
// Two vertype vectors have equal occurrence counts exactly when they are equal as MULTISETS, so the sorted
// vertype (length = conf.num, a handful of ints) is a faithful key and the alphabet-sized vector is
// not needed at all. Hash it; the counts, the numbering and therefore every .tes name are unchanged.
namespace {
struct VecHash {
    size_t operator()(std::vector<int> const& v) const {
        size_t h = 1469598103934665603ULL;            // FNV-1a over the raw ints
        for (int x : v) { h ^= (size_t)(unsigned)x; h *= 1099511628211ULL; }
        return h;
    }
};
}
#include <unordered_map>
#include <string_view>
static std::unordered_map<std::vector<int>, int, VecHash> VTS_COUNT;   // sorted vertype -> solutions so far

// Count one more solution of this vertex-type multiset; returns its serial, and leaves the types sorted
// in SIG_SORT.
int vertypesolvedadd(std::vector<int> const& vertype) { return ++VTS_COUNT[sorted_vertype(vertype)]; }

// EU_STAR_ROOTS=1 — root the search ONLY at star-bearing vertex types (AL, 2026-08-31).
//
// extend() never adds a vertex type below vertype[0], so every configuration's types are >= its root.
// If the alphabet is ordered with every star-bearing type before every regular-only one, then a solid
// carrying at least one star FACE has a star type as its minimum, and rooting only at star types
// finds exactly the star-bearing solids and loses nothing. What it skips is the regular-only subtree,
// which on the one-star isotox-sub-10_12 at k<=2 is 25% of the nodes but 84% of the raw blocks and
// 65% of the bytes written — and blocks and bytes, not nodes, are what stop a k=3 run.
//
// STAR_ROOTS is the count of the leading run of star-bearing types. main() refuses the flag unless
// those types really are a PREFIX, because on an unordered alphabet this silently loses solids.
static int STAR_ROOTS = -1;
static const bool star_roots = std::getenv("EU_STAR_ROOTS") != nullptr;

static const bool orderly = std::getenv("EU_ORDERLY") != nullptr;
static bool orderly_ok(configuration const& P, bool full);
static int branch_dart(configuration const& c, int& slack);
int initex() {
    long t_start = (long)time(nullptr), last_progress = t_start;
    const int root_end = (star_roots && STAR_ROOTS >= 0) ? STAR_ROOTS : symbolcount;
    for (int i = 0; i < root_end; i++) {
        if (shard_n1 > 1 && i % shard_n1 != shard_w1) continue;  // this worker's slice of the roots
        if (!TYPE_OK[i]) continue;                             // type cannot occur in any tiling
        if (hf::mode && !hf::feasible({i})) continue;          // cannot close at any edge (EU_HYPFEAS)
        if (progress_sec > 0) {
            long now = (long)time(nullptr);
            if (now - last_progress >= progress_sec) {
                last_progress = now;
                std::cerr << "[progress] shard " << shard_w << "/" << shard_n
                          << " seed " << i << "/" << symbolcount
                          << " (" << (symbolcount ? 100 * i / symbolcount : 0) << "%)  "
                          << (now - t_start) << "s elapsed" << std::endl;
            }
        }
        configuration newconf;
        add_vertex(newconf, i);
        int slack;
        const int ff = branch_dart(newconf, slack);
        if (orderly) (void)orderly_ok(newconf, false);   // forms ALIVE[0]: the root's other frames
        extend(newconf, ff, slack);
    }
    return 0;
}


// The face cycles of a block, appended to `out`. FIX 16b: on a star search that emits millions of blocks
// this was most of the emission path, itself half the run (star-wide b00002, k<=3), so the dart stamps and
// the cycle strings are reused buffers. Nothing reads the lines (EU_NOCYCLES drops them).
static void writecyclefinal(configuration const& conf, std::string& out) {
    if (eu_nocycles) { out += "---\n"; return; }
    static std::vector<unsigned> smet_stamp;
    static unsigned smet_gen = 0;
    const int NDARTS = (int)conf.glue.size();
    if ((int)smet_stamp.size() < NDARTS) smet_stamp.resize(NDARTS, 0u);
    if (++smet_gen == 0u) { std::fill(smet_stamp.begin(), smet_stamp.end(), 0u); smet_gen = 1u; }
    static std::vector<std::string> mainstlist;
    static std::vector<int> sublist;
    suffix_toks(conf.num);
    size_t nmain = 0;                     // entries of mainstlist in use this call
    sublist.clear();
    bool ultrachiral = true;
    // The face from dart `first` as the next entry; returns the lowest mirror image of its darts. ratio is
    // the first face's for its mirror image too (0 = work it out).
    auto walk = [&](int first, int& ratio) {
        if (mainstlist.size() <= nmain) mainstlist.resize(nmain + 1);
        std::string& mainst = mainstlist[nmain++];
        mainst.clear();
        int count = 0, minmirror = NDARTS, left = first;
        do {
            const int right = conf.rneig[left];
            smet_stamp[left] = smet_gen;
            if (conf.mirro[right] < minmirror) minmirror = conf.mirro[right];
            const Tok vs = SUFFIX[conf.vof[left]];   // left and right are darts of one vertex
            mainst += LBASE[dart_base(conf, left)]; mainst.append(vs.c, (size_t)vs.n); mainst += '/';
            mainst += LBASE[dart_base(conf, right)]; mainst.append(vs.c, (size_t)vs.n); mainst += '(';
            mainst += CLASS_DISP[conf.lvert[right]]; mainst += ")-";
            count++;
            left = conf.glue[right];
        } while (left != first);
        mainst.pop_back();
        if (ratio == 0) ratio = CLASS_L[conf.lvert[conf.rneig[first]]] / count;
        if (ratio != 1) { mainst.insert(mainst.begin(), '['); mainst += "]x"; mainst += std::to_string(ratio); }
        return minmirror;
    };
    for (int cy = 0; cy < NDARTS; cy++) {
        if (smet_stamp[cy] == smet_gen) continue;
        int ratio = 0;
        const int minmirror = walk(cy, ratio);
        if (smet_stamp[minmirror] == smet_gen) { sublist.push_back(0); ultrachiral = false; }
        else { walk(minmirror, ratio); sublist.push_back(1); sublist.push_back(2); }
    }
    static std::string header;
    for (size_t m = 0; m < nmain; m++) {
        if (sublist[m] == 0) { out += std::to_string(m); out += ": "; }
        else if (sublist[m] == 1) {
            header = ultrachiral ? std::to_string(m / 2) + ": " : std::to_string(m) + "/" + std::to_string(m + 1) + ": ";
            out += header;
        }
        else out.append(header.size(), ' ');
        out += mainstlist[m]; out += '\n';
    }
    out += "---\n";
}

// FAMILY FILES. Marek's writesolution opened and closed out/eusolver_<family>.txt for every block (3.0 s of
// system time against 3.8 s of user on star-wide b00002 at k<=3). Each family now has a buffer, written out
// with write(2) when it reaches 64 KB. The first write of a family truncates its file and every later one
// appends. At most 48 descriptors stay open, the least recently written closed first (macOS ships a soft
// limit of 256, and the family count is data-dependent: up to one per k per subset of tile families). All
// buffers together are held to 32 MB: past that every one is written and freed.
struct FamOut { std::string path, buf; int fd = -1; bool made = false; long long used = 0; };
static std::map<std::string, FamOut> FAMS;
static std::string FAM_LAST;
static FamOut* FAM_LASTP = nullptr;
static int FAM_OPEN = 0;
static size_t FAM_HELD = 0;

static FamOut& family_out(const char* fine, size_t n) {
    if (!FAM_LASTP || FAM_LAST.size() != n || std::memcmp(FAM_LAST.data(), fine, n) != 0) {
        FAM_LAST.assign(fine, n);
        FAM_LASTP = &FAMS[FAM_LAST];
        if (FAM_LASTP->path.empty()) FAM_LASTP->path = filepath + (eu_pruned ? "pruned/eupruned_" : listfile) + FAM_LAST + ".txt";
    }
    return *FAM_LASTP;
}
static void family_write(FamOut& o) {
    static long long clock = 0;
    if (o.fd < 0) {
        if (FAM_OPEN >= 48) {
            FamOut* v = nullptr;
            for (auto& kv : FAMS) if (kv.second.fd >= 0 && (!v || kv.second.used < v->used)) v = &kv.second;
            close(v->fd); v->fd = -1; FAM_OPEN--;
        }
        if (eu_pruned) mkdir((filepath + "pruned").c_str(), 0755);
        o.fd = open(o.path.c_str(), O_WRONLY | O_CREAT | (o.made ? O_APPEND : O_TRUNC), 0644);
        if (o.fd >= 0) FAM_OPEN++;
        o.made = true;
    }
    o.used = ++clock;
    for (size_t done = 0; done < o.buf.size(); ) {
        const ssize_t w = o.fd < 0 ? -1 : write(o.fd, o.buf.data() + done, o.buf.size() - done);
        if (w <= 0) { std::cerr << "cannot write " << o.path << "\n"; std::exit(2); }
        done += (size_t)w;
    }
    FAM_HELD -= o.buf.size();
    o.buf.clear();
}
// Write every buffer out and free it; with `done`, close the files too.
static void family_streams_close(bool done = true) {
    for (auto& kv : FAMS) {
        FamOut& o = kv.second;
        if (!o.buf.empty()) { family_write(o); std::string().swap(o.buf); }
        if (done && o.fd >= 0) { close(o.fd); o.fd = -1; FAM_OPEN--; }
    }
}

// A lossy set of 128-bit hashes: 4-way buckets, round-robin eviction, all-zero = empty. Mapped MAP_SHARED
// before EU_FORK forks, it is one table for every worker. Words are read and written atomically; a racing
// reader can see one new and one old word, which matches a probe only by a 2^-64-scale coincidence, so a
// race can let a duplicate through but cannot invent a hit.
struct HashSet128 {
    unsigned long long* slot = nullptr;   // 8 words per bucket: (h1, h2) x 4
    unsigned char* victim = nullptr;
    size_t mask = 0;
    void init(long mb, bool shared) {
        size_t buckets = 1;
        while (buckets * 128 <= (size_t)mb << 20) buckets *= 2;
        if (shared) {
            void* p = mmap(nullptr, buckets * 64, PROT_READ | PROT_WRITE, MAP_SHARED | MAP_ANON, -1, 0);
            void* v = mmap(nullptr, buckets, PROT_READ | PROT_WRITE, MAP_SHARED | MAP_ANON, -1, 0);
            if (p == MAP_FAILED || v == MAP_FAILED) { std::cerr << "HashSet128: mmap failed\n"; std::exit(2); }
            slot = (unsigned long long*)p; victim = (unsigned char*)v;   // anonymous maps start zeroed
        } else {
            slot = (unsigned long long*)calloc(buckets * 64, 1); victim = (unsigned char*)calloc(buckets, 1);
        }
        mask = buckets - 1;
    }
    bool seen_or_insert(unsigned long long h1, unsigned long long h2) {
        if (h1 == 0 && h2 == 0) h2 = 1;
        unsigned long long* e = slot + (((size_t)(h1 ^ (h2 >> 11)) & mask) << 3);
        auto ld = [](unsigned long long* p) { return __atomic_load_n(p, __ATOMIC_RELAXED); };
        for (int w = 0; w < 4; w++) if (ld(e + 2 * w) == h1 && ld(e + 2 * w + 1) == h2) return true;
        int w = 0;
        while (w < 4 && (ld(e + 2 * w) | ld(e + 2 * w + 1))) w++;
        if (w == 4) {
            unsigned char* v = victim + ((e - slot) >> 3);
            w = __atomic_load_n(v, __ATOMIC_RELAXED) & 3;
            __atomic_store_n(v, (unsigned char)((w + 1) & 3), __ATOMIC_RELAXED);
        }
        __atomic_store_n(e + 2 * w, h1, __ATOMIC_RELAXED); __atomic_store_n(e + 2 * w + 1, h2, __ATOMIC_RELAXED);
        return false;
    }
};
static bool tables_shared = false;   // EU_FORK: the leaf set lives in shared memory

// LEAF DEDUP (2026-11-06). simplify() leaves the canonical hash of a minimal closure in LEAF_H1/H2, under
// isomorphisms that also preserve vertex type, so an equal hash is a duplicate the pruner would drop. It
// is not written, but its serial (the n of "eu raw <sig> <n>.tes", carried by ctrnact-* ids) is still
// counted, so every kept block stays byte-identical. Regular k<=8: 14,849 minimal closures, 5,569 written,
// exactly the final count. Lossy: an evicted hash only lets a duplicate through. EU_LEAF_MB (default 256)
// sizes it; 0 turns it off, and so does EU_ORDERLY unless a size is given: orderly builds every closed
// configuration once (leaf_dups read 0 on 58 palettes and modes), so the hash would be refined for nothing.
static const long leaf_mb = std::getenv("EU_LEAF_MB") ? atol(std::getenv("EU_LEAF_MB")) : orderly ? 0 : 256;
static long long leaf_dups = 0;
static HashSet128 LEAF_SET;
extern unsigned long long LEAF_H1, LEAF_H2;

// The catalogue's "Count type" line, as eu_pruner's buildvertextypes derives it from the vertex list: the
// number of distinct vertex figures (a symbol up to its first ')'), then, when one repeats, how often each
// occurs, largest first.
static char* count_type(std::vector<int> const& vertype, char* p) {
    static std::vector<int> figure, slot, ids, times;   // slot[figure]: its place in ids and times, -1 between calls
    if (figure.empty()) {
        std::map<std::string, int> seen;
        for (const vertexdef& V : mainlist)
            figure.push_back(seen.emplace(V.symbol.substr(0, V.symbol.find(')') + 1), (int)seen.size()).first->second);
        slot.assign(seen.size(), -1);
    }
    ids.clear(); times.clear();
    for (int t : vertype) {
        int& at = slot[figure[t]];
        if (at < 0) { at = (int)ids.size(); ids.push_back(figure[t]); times.push_back(1); } else times[at]++;
    }
    for (int f : ids) slot[f] = -1;
    p = put_n(p, (long long)ids.size());
    std::sort(times.begin(), times.end(), std::greater<int>());
    if (times[0] == 1) return p;
    p = put_l(p, " (");
    for (int m : times) p = put_n(p, m);
    *p++ = ')';
    return p;
}

int writesolution(configuration const& conf) {
    if (leaf_mb > 0) {
        if (!LEAF_SET.slot) LEAF_SET.init(leaf_mb, tables_shared);
        if (LEAF_SET.seen_or_insert(LEAF_H1, LEAF_H2)) {
            vertypesolvedadd(conf.vertype);   // keeps the serial of every later block
            leaf_dups++;
            return 0;
        }
    }
    static Arr<char> blk;
    static std::vector<char> present;
    static std::string cycles;
    static size_t fam_room = 0;
    if (!fam_room) for (const std::string& f : TILE_FAM) fam_room += f.size() + 1;
    const int serial = vertypesolvedadd(conf.vertype);   // leaves the types sorted in SIG_SORT
    blk.resize((int)(4 * types_room(conf.vertype) + 12 * conf.vertype.size() + 35 * conf.glue.size() + fam_room + 256));
    char* p = blk.data();
    if (!eu_pruned) { p = put_l(p, "Number of vertex types: "); p = put_n(p, conf.num); *p++ = '\n'; }
    for (int t : conf.vertype) { p = put_s(p, mainlist[t].symbol); p = put_l(p, ", "); }   // verbalvertices
    p[-2] = '\n'; p--;
    // What stands between the vertex list and the serial depends on the types as a multiset alone, and
    // tilings of one multiset come close together: the text is kept for the last multisets met, one per
    // slot of a small table (it serves 77% of the blocks at regular k<=14 and 83% at k<=16).
    struct Mid { std::vector<int> types; std::string text; size_t sig_at = 0; FamOut* fam = nullptr; };
    static std::vector<Mid> mids(1 << 12);
    const size_t hs = VecHash()(SIG_SORT);
    Mid& mid = mids[(hs ^ hs >> 29) & (mids.size() - 1)];
    if (mid.types != SIG_SORT) {
        char* const p0 = p;
        p = signature(SIG_SORT, p);
        if (eu_pruned) { p = put_l(p, "\nCount type: "); p = count_type(conf.vertype, p); }
        // dirsig prefix (NN/NN_fam/filesig/) so decode.py/develop.py's tes_id() can parse the id. It
        // matches the Python solver's tesline; the C++ original omitted it.
        p = put_l(p, "\nTES file: ");
        mid.sig_at = (size_t)(p - p0);
        p = put_k(p, conf.kcnt); *p++ = '/';
        const char* const fine = p;   // the family: k, then the tile families present
        p = put_k(p, conf.kcnt); *p++ = '_';
        present.assign(TILE_FAM.size(), 0);
        for (int c : conf.lvert) if ((size_t)CLASS_TILE[c] < present.size()) present[CLASS_TILE[c]] = 1;
        for (size_t t = 0; t < present.size(); t++) if (present[t]) p = put_s(p, TILE_FAM[t]);
        mid.fam = eu_stream ? nullptr : &family_out(fine, (size_t)(p - fine));
        *p++ = '/';
        const char* const filesig = p;
        p = filesignature(SIG_SORT, p);
        const size_t nfilesig = (size_t)(p - filesig);
        *p++ = '/'; p = put_s(p, solvercode); p = put_l(p, " raw ");
        std::memcpy(p, filesig, nfilesig); p += nfilesig; *p++ = ' ';
        mid.types = SIG_SORT;
        mid.text.assign(p0, (size_t)(p - p0));
        p = p0;
    }
    const size_t sig_at = (size_t)(p - blk.data()) + mid.sig_at;
    p = put_s(p, mid.text);
    const size_t serial_at = (size_t)(p - blk.data());
    p = put_n(p, serial); p = put_l(p, ".tes\n");
    p = writeconway(conf, p); *p++ = '\n';
    if (eu_pruned) p = put_l(p, "---\n\n");
    else {
        cycles.clear();
        writecyclefinal(conf, cycles);
        cycles += "\n\n";
        const size_t at = (size_t)(p - blk.data());
        blk.resize((int)(at + cycles.size()));
        p = put_s(blk.data() + at, cycles);
    }
    const size_t len = (size_t)(p - blk.data());
    if (eu_stream) { std::cout.write(blk.data(), (std::streamsize)len); return 0; }
    FamOut& o = *mid.fam;
    const size_t was = o.buf.size();
    // for merge_split: the block's place in a single process's order (a closure above the split falls
    // between two branches), its length, and where its signature and its serial start
    if (split_depth > 0 && orderly) {
        char h[96], *q = h;
        *q++ = '#'; q = put_n(q, in_branch >= 0 ? 2 * in_branch + 1 : 2 * branch_ctr); *q++ = ' ';
        q = put_n(q, (long long)len); *q++ = ' '; q = put_n(q, (long long)sig_at); *q++ = ' ';
        q = put_n(q, (long long)serial_at); *q++ = '\n';
        o.buf.append(h, (size_t)(q - h));
    }
    o.buf.append(blk.data(), len);
    FAM_HELD += o.buf.size() - was;
    if (o.buf.size() >= (1u << 16)) family_write(o);
    else if (FAM_HELD > (32u << 20)) family_streams_close(false);
    return 0;
}

// EU_SPLIT under EU_ORDERLY: the workers' family files, merged into the files one process would have
// written. Each worker's blocks are in branch order already, so this is a merge by the heading
// writesolution gave them, with the serial of "eu raw <sig> <n>.tes" counted afresh per signature.
static void merge_split(int nfork) {
    namespace fs = std::filesystem;
    const std::string sub = filepath + (eu_pruned ? "pruned/" : "");
    auto dir = [&](int c) { return "fork" + std::to_string(c) + "/" + sub; };
    std::map<std::string, uintmax_t> sizes;
    for (int c = 0; c < nfork; c++)
        if (fs::is_directory(dir(c)))
            for (const fs::directory_entry& e : fs::directory_iterator(dir(c))) if (e.is_regular_file()) sizes[e.path().filename().string()] += e.file_size();
    fs::create_directories(sub);
    // The files are independent, so the workers' count of processes merges them, largest first.
    std::vector<std::pair<uintmax_t, std::string> > names;
    for (const auto& kv : sizes) names.push_back({ kv.second, kv.first });
    std::sort(names.rbegin(), names.rend());
    // A worker's file of one family, read in order through a buffer. Mapped instead, the pages the workers
    // had just written and the system had not yet put on disk made every fault wait for them: 2.4 s for the
    // 1.1 GB of k<=16, against 0.6 s for the same files once on disk. read(2) takes them from the cache.
    struct In {
        int fd = -1;
        std::vector<char> buf;
        size_t at = 0, end = 0;   // buf[at, end) is unread
        long long tag = 0;
        size_t len = 0, sig = 0, serial = 0;
        bool live = false;
        const char* need(size_t n) {   // n unread bytes in a row, or what is left of the file
            if (end - at < n) {
                if (at) { std::memmove(buf.data(), buf.data() + at, end - at); end -= at; at = 0; }
                if (buf.size() < n) buf.resize(std::max(n, (size_t)1 << 20));
                for (ssize_t r; end < buf.size() && (r = read(fd, buf.data() + end, buf.size() - end)) > 0; ) end += (size_t)r;
            }
            return buf.data() + at;
        }
        void head() {   // read "#<place> <length> <signature at> <serial at>\n"; the block is next
            const char* h = need(96);
            if (!(live = at < end)) return;
            char* q;
            tag = strtoll(h + 1, &q, 10); len = strtoull(q, &q, 10); sig = strtoull(q, &q, 10); serial = strtoull(q, &q, 10);
            at += (size_t)(q + 1 - h);
        }
    };
    auto merge_one = [&](const std::string& name) {
        std::vector<In> in(nfork);
        for (int c = 0; c < nfork; c++)
            if ((in[c].fd = open((dir(c) + name).c_str(), O_RDONLY)) >= 0) in[c].head();
        const int ofd = open((sub + name).c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
        if (ofd < 0) { std::cerr << "merge_split: cannot write " << sub << name << "\n"; _exit(2); }
        std::string out;
        auto flush = [&]() {
            for (size_t done = 0; done < out.size(); ) {
                const ssize_t w = write(ofd, out.data() + done, out.size() - done);
                if (w <= 0) { std::cerr << "merge_split: write failed on " << sub << name << "\n"; _exit(2); }
                done += (size_t)w;
            }
            out.clear();
        };
        std::unordered_map<std::string_view, int> serial;   // a signature lives in one family, so per file
        std::deque<std::string> sigs;                       // the text the map's keys point into
        for (;;) {
            In* b = nullptr;
            for (In& s : in) if (s.live && (!b || s.tag < b->tag)) b = &s;
            if (!b) break;
            const char* blk = b->need(b->len);
            const char* dot = (const char*)memchr(blk + b->serial, '.', b->len - b->serial);   // the worker's serial ends at ".tes"
            const std::string_view sig(blk + b->sig, b->serial - 1 - b->sig);
            auto it = serial.find(sig);
            if (it == serial.end()) { sigs.emplace_back(sig); it = serial.emplace(sigs.back(), 0).first; }
            char num[24];
            out.append(blk, b->serial);
            out.append(num, (size_t)(put_n(num, ++it->second) - num));
            out.append(dot, (size_t)(blk + b->len - dot));
            if (out.size() > (4u << 20)) flush();
            b->at += b->len;
            b->head();
        }
        flush();
        close(ofd);
        for (int c = 0; c < nfork; c++) if (in[c].fd >= 0) { close(in[c].fd); fs::remove(dir(c) + name); }
    };
    std::vector<pid_t> kids;
    for (int c = 0; c < nfork; c++) {
        const pid_t pid = fork();
        if (pid < 0) { std::cerr << "fork failed\n"; std::exit(2); }
        if (pid == 0) {
            for (size_t i = (size_t)c; i < names.size(); i += (size_t)nfork) merge_one(names[i].second);
            _exit(0);
        }
        kids.push_back(pid);
    }
    for (pid_t pid : kids) {
        int st = 0;
        waitpid(pid, &st, 0);
        if (!WIFEXITED(st) || WEXITSTATUS(st)) { std::cerr << "merge_split: a merge process failed\n"; std::exit(2); }
    }
    std::error_code ec;   // the workers' folders, when nothing else is left in them
    for (int c = 0; c < nfork; c++)
        for (const std::string& d : { dir(c), "fork" + std::to_string(c) + "/" + filepath, "fork" + std::to_string(c) }) fs::remove(d, ec);
    std::cerr << "split: " << names.size() << " files of " << nfork << " workers merged into " << sub << "\n";
}

// Instrumentation for pricing isomorph-free generation (2026-08-07). simplify() is a WL refinement
// run at every CLOSURE; canonical augmentation would need a test of this kind at every NODE, so the
// break-even is cost(test) vs cost(node), not a ratio of leaf counts.
//   simplify_calls / simplify_true  — how much isomorph rejection already happens at leaves
//   EU_DOUBLE_SIMPLIFY=1            — call simplify twice per closure and discard the second result.
//     The catalog is untouched (same return value used), so the timing delta against a normal run
//     divided by simplify_calls is a clean per-call cost. Measuring by stubbing simplify out instead
//     would change what gets emitted and therefore change downstream work, contaminating the number.
static long long simplify_calls = 0, simplify_true = 0;
static const bool dbl_simplify = std::getenv("EU_DOUBLE_SIMPLIFY") != nullptr;
// EU_WL_ONLY=1 restores the pre-2026-08-20 seed colour (corner class alone). Kept as the A/B switch
// that produced the numbers in the note below; it is an INCOMPLETE mode, not a speed dial.
static const bool wl_only = std::getenv("EU_WL_ONLY") != nullptr;
bool simplify_inner(configuration const& conf);
bool simplify(configuration const& conf) {
    simplify_calls++;
    if (dbl_simplify) (void)simplify_inner(conf);
    const bool r = simplify_inner(conf);
    if (r) simplify_true++;
    return r;
}

// MINIMALITY, AND THE INVARIANT ITS SEED COLOUR WAS MISSING (2026-08-20).
//
// simplify_inner is not a heuristic isomorphism test, it is Moore partition refinement: it computes
// the COARSEST congruence on the darts that refines the seed colouring and commutes with rneig,
// lneig, mirro and glue, and accepts the closure iff that congruence is trivial. That is exactly the
// right question. A configuration is C = T/H for the tiling T and a subgroup H of its symmetry
// group; it is a record only when H is the WHOLE group, i.e. when C admits no proper quotient; and
// the proper quotients of a connected map are precisely its nontrivial congruences.
//
// The seed colour was wrong. It was the CORNER CLASS alone (plus the edge type where the palette has
// them), and a covering C -> C' preserves more than that: a dart of C is an H-orbit of darts of T, it
// sits at one vertex of T, and its image sits at the SAME vertex — so the whole vertex figure, the
// full cyclic word of the vertex, is an invariant of the covering and no congruence may merge across
// it. Corner class does not imply vertex figure. Over a single-tile equilateral alphabet it implies
// nothing at all: every dart of every configuration carries corner class 0.
//
// The cost of the omission was a family of solids. Triangles only, k <= 5: the solver builds 308
// closed configurations and the old seed passes 3 (tetrahedron, octahedron, icosahedron). The
// triangular bipyramid is built — v0 = (3,3,3)S3, v1 = (3,3,3,3)S2a, glue (0 0')(1'), three darts —
// and rejected, because with one seed colour the whole three-dart set is a congruence, whose quotient
// is the one-dart tetrahedron block. That "quotient" merges a 3-valent vertex with a 4-valent one and
// is not a covering of anything. With the vertex figure in the seed the partition starts as
// {0} {1,2}, splits on the glue image, discretizes, and the bipyramid is emitted. Same for the rest
// of the 2-orbit deltahedra: J12, J13, J17, J51, J84.
//
// The family id is the vertex figure, read off the alphabet symbol: gen_alphabet writes
// "(" + word + ")" + optional "|edges|" + variant, cyclic_reps has already canonicalized the word up
// to rotation and reflection, and the variant is exactly the part that a fold is allowed to change
// ((3,3,3)F, A, R3 and S3 are four foldings of one figure and share the prefix "(3,3,3)"). Two
// distinct figures can only collide here if two corner classes share a display name, which makes the
// seed COARSER than the truth — the safe direction, since a coarser seed accepts strictly less.
//
// Strictly a loosening: the new seed refines the old one, a finer seed gives a finer congruence, and
// every closure the old test accepted had the discrete congruence already. `make check-regular` is
// byte-identical (measured) and the star gate is unchanged.
static std::vector<int> TYPE_FAM;      // vertex-type -> vertex-figure id
static int NFAM = 0;
//
// ⚑ THE ID LOOKUP IS A HASH, NOT A SCAN (2026-08-31). It was a linear scan over every figure seen so
// far, so this function cost types x figures string comparisons — quadratic in the alphabet, and
// nearly the worst case possible here because almost every vertex type is its OWN figure (measured:
// 207,589 figures over 219,868 types on isotox-mixed, 80,345 over 87,121 on isotox-pair5-6). That is
// ~2.3e10 comparisons on isotox-mixed, a visible slice of its 15-minute solve, and ~3.4e14 on the
// 11-star isotoxal palette: about 310 HOURS in this one function before a single search node is
// expanded, paid AGAIN by every shard process, which is what made the full run look untouchable.
// The map assigns ids in first-seen scan order exactly as the scan did, so TYPE_FAM, NFAM and every
// catalogue built on them are unchanged; check-regular stays byte-identical.
static void build_type_families() {
    // string_view, not string: the key is a prefix of mainlist[t].symbol, which outlives this loop and
    // is neither mutated nor reallocated in it, and the keys measure 29-43 chars on this alphabet —
    // past libc++'s 22-char SSO, so a copy would be one more heap allocation per vertex type.
    std::unordered_map<std::string_view, int> keys;
    TYPE_FAM.assign(mainlist.size(), -1);
    keys.reserve(mainlist.size() * 2);
    for (size_t t = 0; t < mainlist.size(); t++) {
        const std::string& sym = mainlist[t].symbol;
        size_t cut = sym.find(')');
        if (cut == std::string::npos) cut = sym.size() - 1;         // no word: whole symbol is the key
        else if (cut + 1 < sym.size() && sym[cut + 1] == '|') {     // free-edge palettes: keep |edges|
            size_t e = sym.find('|', cut + 2);
            if (e != std::string::npos) cut = e;
        }
        TYPE_FAM[t] = keys.try_emplace(std::string_view(sym).substr(0, cut + 1),
                                       (int)keys.size()).first->second;
    }
    NFAM = (int)keys.size();
    std::cerr << "vertex figures: " << NFAM << " over " << mainlist.size() << " types\n";
}

// FIX 17, REDONE (2026-11-06, after Martin Olivier's canonical.cpp). simplify runs at every closure and is
// most of the leaf cost. 83% of closures (regular k<=12) are coverings, which congruence.hpp now rejects
// without refining; refine() runs on the minimal rest, for the canonical hash the leaf dedup keys on.
//
// refine() is exact colour refinement with a canonical numbering. Cells are ranges of `perm`, a dart's
// colour is its cell's start, and a dirty cell splits by the SORTED tuple (colour of R, L, M, G), a free G
// reading as a sentinel. Every decision reads colours only, so the final numbering is an isomorphism
// invariant. The fixpoint is the coarsest partition refining `seed` that R, L, M, G respect, the one Moore
// refinement reaches, so discreteness is the verdict simplify always gave. When discrete, h1/h2 hash the
// relation table in canonical order with `tag` per dart: equal hashes mean an isomorphism preserving
// R, L, M, G, seed and tag, up to a 2^-128-scale collision.
static inline unsigned long long mix64(unsigned long long x) {
    x ^= x >> 30; x *= 0xbf58476d1ce4e5b9ULL; x ^= x >> 27; x *= 0x94d049bb133111ebULL; x ^= x >> 31;
    return x;
}
static bool refine(configuration const& c, const long long* seed, const long long* tag,
                   unsigned long long& h1, unsigned long long& h2) {
    const int n = (int)c.glue.size();
    if (n >= 65535) return false;
    static std::vector<int> col, perm, cend;
    static std::vector<unsigned char> dirty;
    static std::vector<std::pair<unsigned long long, int> > keyed;
    static std::vector<std::pair<long long, int> > sd;
    col.resize(n); perm.resize(n); cend.resize(n); keyed.resize(n); sd.resize(n);
    dirty.assign(n, 0);
    for (int i = 0; i < n; i++) sd[i] = { seed[i], i };
    std::sort(sd.begin(), sd.begin() + n);
    for (int p = 0; p < n; ) {
        int q = p;
        while (q < n && sd[q].first == sd[p].first) q++;
        cend[p] = q; dirty[p] = (q - p) > 1;
        for (int j = p; j < q; j++) { perm[j] = sd[j].second; col[sd[j].second] = p; }
        p = q;
    }
    const int* R = c.rneig.data(); const int* L = c.lneig.data();
    const int* M = c.mirro.data(); const int* G = c.glue.data();
    auto key = [&](int d) -> unsigned long long {
        return ((unsigned long long)col[R[d]] << 48) | ((unsigned long long)col[L[d]] << 32) |
               ((unsigned long long)col[M[d]] << 16) | (G[d] < 0 ? 65535ULL : (unsigned long long)col[G[d]]);
    };
    for (bool again = true; again; ) {
        again = false;
        for (int s = 0; s < n; ) {
            const int e = cend[s];
            if (e - s == 1 || !dirty[s]) { s = e; continue; }
            dirty[s] = 0;
            for (int j = s; j < e; j++) keyed[j] = { key(perm[j]), perm[j] };
            std::sort(keyed.begin() + s, keyed.begin() + e);
            if (keyed[s].first == keyed[e - 1].first) { s = e; continue; }
            again = true;
            for (int a = s; a < e; ) {
                int b = a;
                while (b < e && keyed[b].first == keyed[a].first) b++;
                cend[a] = b;
                for (int j = a; j < b; j++) {
                    const int d = keyed[j].second;
                    perm[j] = d;
                    if (col[d] != a) {
                        col[d] = a;
                        dirty[col[L[d]]] = 1; dirty[col[R[d]]] = 1; dirty[col[M[d]]] = 1;
                        if (G[d] >= 0) dirty[col[G[d]]] = 1;
                    }
                }
                a = b;
            }
            for (int a = s; a < e; a = cend[a]) dirty[a] = (cend[a] - a) > 1;
            s = e;
        }
    }
    for (int s = 0; s < n; s = cend[s]) if (cend[s] - s > 1) return false;
    h1 = 0x9e3779b97f4a7c15ULL ^ (unsigned long long)n; h2 = 0xc2b2ae3d27d4eb4fULL + (unsigned long long)n;
    for (int k = 0; k < n; k++) {
        const int d = perm[k];
        const unsigned long long w = key(d), t = mix64((unsigned long long)seed[d] ^ mix64((unsigned long long)tag[d]));
        h1 = mix64(h1 ^ w ^ t) + 0x632be59bd9b4e019ULL;
        h2 = mix64(h2 + w * 0x9e3779b97f4a7c15ULL + t) ^ (h1 >> 17);
    }
    return true;
}

unsigned long long LEAF_H1 = 0, LEAF_H2 = 0;   // canonical hash of the last minimal closure (leaf dedup)
static std::vector<long long> SIMP_SEED, SIMP_TAG;
// Set by orderly_ok on a closed P when a replay read P's whole code off it: an automorphism of P. Its
// orbits are a congruence (it keeps R, L, M, G, corner class, edge type and vertex type, and moves every
// dart), so P is a covering and the test below need not run.
static bool ORD_AUTO = false;
bool simplify_inner(configuration const& conf) {
    if (ORD_AUTO) return false;
    const int le = (int)conf.rneig.size(), ets = EDGE_TYPED ? ETSPAN : 1;
    const int* R = conf.rneig.data(); const int* L = conf.lneig.data(); const int* M = conf.mirro.data(); const int* G = conf.glue.data();
    auto seed_of = [&](int d, int fam) { return (long long)(EDGE_TYPED ? conf.lvert[d] * ETSPAN + conf.etype[d] : conf.lvert[d]) * NFAM + fam; };
    // covering test first: congruence.hpp. Seeds are small numbers on all but the widest alphabets, so
    // without the leaf set their classes are counted in place (the hash of the seeds was two fifths of the
    // test): count[seed] is zero between calls, seen lists the seeds met, in the order of their first darts.
    static std::vector<int> cls, count, seen;
    if (leaf_mb <= 0 && (long long)NCLS * ets * NFAM <= (1 << 20)) {
        if (count.empty()) count.assign((size_t)NCLS * ets * NFAM, 0);
        cls.resize(le); seen.clear();
        for (int v = 0, d = 0; v < conf.num; v++) {
            const int end = v + 1 < conf.num ? conf.voff[v + 1] : le, f = wl_only ? 0 : TYPE_FAM[conf.vertype[v]];
            for (; d < end; d++) if (count[cls[d] = (int)seed_of(d, f)]++ == 0) seen.push_back(cls[d]);
        }
        int g = 0, least = seen[0], a = 0;
        for (int sd : seen) { g = std::gcd(g, count[sd]); if (count[sd] < count[least]) least = sd; }
        for (int sd : seen) count[sd] = 0;
        if (g <= 1) return true;
        while (cls[a] != least) a++;
        return !congruence_from(le, R, L, M, G, cls.data(), a);
    }
    SIMP_SEED.resize(le); SIMP_TAG.resize(le);
    for (int v = 0, d = 0; v < conf.num; v++)
        for (const int end = v + 1 < conf.num ? conf.voff[v + 1] : le; d < end; d++) {
            SIMP_SEED[d] = seed_of(d, wl_only ? 0 : TYPE_FAM[conf.vertype[v]]);
            SIMP_TAG[d] = conf.vertype[v];
        }
    if (has_congruence(le, R, L, M, G, SIMP_SEED.data())) return false;
    // the refinement is for the leaf set's hash alone
    if (leaf_mb > 0 && !refine(conf, SIMP_SEED.data(), SIMP_TAG.data(), LEAF_H1, LEAF_H2)) {
        std::cerr << "simplify: refinement and congruence test disagree\n"; std::abort();
    }
    return true;
}

// ORDERLY GENERATION (EU_ORDERLY=1, 2026-11-06). Every closed configuration, minimal or covering, is built
// exactly once, from its canonical root. A node P is built from root (vertex 0, identity frame) by a
// sequence of branch moves, its CODE. Replaying the search from another root (v, frame a) of the minimal
// type (same min-slack dart choice, same forced closures) reads that root's code off P's glues until it
// meets a free dart. The canonical copy is the one whose root has the least code, so:
//   - another root smaller at a position both have determined: no completion of P is canonical, prune P;
//   - larger: that root never wins below P, drop it for the subtree;
//   - at a closure every replay is complete, so exactly one copy survives (leaf_dups reads 0).
// Frames are the vertex type's automorphisms (R, L, M, class and edge type kept: the generator's Aut). The
// action is free, so the frame taking a dart to its orbit's rep is unique. A replay keeps its state between
// nodes in a pool that follows the DFS, and is not rerun while the dart it stalled on is still free:
// glues are only ever added below a node, so it would stall there again.
//
// Regular k<=12, one core: 2.24M -> 850K nodes, 1.10M -> 215K closures, 2.4x fewer instructions; the gain
// grows with k. Same set of tilings on 9 palettes (raw outputs pruned together keep the same count). Little
// to gain at k<=3 on large alphabets, where it costs up to 23%. ⚑ It emits a different labelled copy of
// each tiling, so serials in "eu raw <sig> <n>.tes", and ctrnact-* ids, change: opt-in until ids stop
// depending on the search. experiments/results/orderly-generation-2026-11-06.md.
static std::vector<std::vector<std::vector<int> > > T_AUT, T_AUTINV;   // [type][frame][local dart]
static std::vector<std::vector<int> > T_TOREP, T_REPOF;   // [type][dart]: frame taking it to its rep, the rep
static std::vector<int> T_ID;                             // [type]: the identity frame
static std::vector<int> T_FIRST;                          // [type]: the dart a search rooted at it branches on first
static void type_auts(int t) {
    if (T_AUT.empty()) { T_AUT.resize(symbolcount); T_AUTINV.resize(symbolcount); T_TOREP.resize(symbolcount);
                         T_REPOF.resize(symbolcount); T_ID.assign(symbolcount, -1); T_FIRST.assign(symbolcount, -1); }
    if (!T_AUT[t].empty()) return;
    const vertexdef& V = mainlist[t];
    const int n = (int)V.rneig.size();
    auto same = [&](int p, int q) { return V.lvert[p] == V.lvert[q] && (!EDGE_TYPED || V.etype[p] == V.etype[q]); };
    for (int img0 = 0; img0 < n; img0++) {
        if (!same(0, img0)) continue;
        std::vector<int> phi(n, -1), st = { 0 };
        phi[0] = img0;
        bool ok = true;
        while (!st.empty() && ok) {
            const int x = st.back(); st.pop_back();
            const int ys[3] = { V.rneig[x], V.lneig[x], V.mirro[x] };
            const int fys[3] = { V.rneig[phi[x]], V.lneig[phi[x]], V.mirro[phi[x]] };
            for (int u = 0; u < 3 && ok; u++) {
                if (phi[ys[u]] >= 0) ok = phi[ys[u]] == fys[u];
                else if ((ok = same(ys[u], fys[u]))) { phi[ys[u]] = fys[u]; st.push_back(ys[u]); }
            }
        }
        if (ok) T_AUT[t].push_back(phi);
    }
    std::vector<char> isrep(n, 0);
    for (int r : V.reps) isrep[r] = 1;
    T_TOREP[t].assign(n, -1); T_REPOF[t].assign(n, -1);
    for (int a = 0; a < (int)T_AUT[t].size(); a++) {
        std::vector<int> inv(n);
        for (int q = 0; q < n; q++) {
            const int r = T_AUT[t][a][q];
            inv[r] = q;
            if (r == q && q == 0) T_ID[t] = a;
            if (isrep[r] && T_TOREP[t][q] < 0) { T_TOREP[t][q] = a; T_REPOF[t][q] = r; }
        }
        T_AUTINV[t].push_back(inv);
    }
    for (int q = 0; q < n; q++)
        if (T_TOREP[t][q] < 0) { std::cerr << "orderly: type " << t << " dart " << q << " has no rep in its orbit\n"; std::abort(); }
    configuration one;
    add_vertex(one, t);
    int slack;
    const int ff = min_slack(one, slack);
    T_FIRST[t] = dart_star(one, ff) ? one.mirro[ff] : ff;
}
// Any fixed order on moves is exact; this one exposes a wrong root soonest of the five measured: a fresh
// vertex before a glue to a placed dart, higher types first. Regular k<=11: 373K nodes against 467K for
// placed darts first, ascending types.
static inline long long enc_exist(int i) { return (1LL << 50) + i; }
static inline long long enc_new(int g, int r) { return ((1LL << 32) - g) * 4096 + r; }
static std::vector<long long> MOVES;      // MOVES[d]: the branch move at code position d
// A REPLAY KEEPS NO COPY (2026-11-10). The copy Q a replay built by making P's first s moves from another
// root was, dart for dart, P's own ancestor after s moves: both start from one vertex of the root's type,
// and the search is a function of the moves. So the dart the replay branches on at step s is the dart
// the search branched on there (BRANCH[s]), its vertices are P's first ones under the same numbers, and
// all a replay holds is where it sends them: the vertex of P and the frame for each. It used to build
// and undo a configuration of its own, a fifth of a run.
struct RState {
    std::vector<int> qv2p, qaut;   // its vertex -> P's vertex, frame (its local dart = AUT[type][frame] of P's)
    std::vector<int> pv2q;         // P's vertex -> its vertex, -1 = not reached
    int s;                         // code positions matched
};
static std::vector<int> BRANCH;           // BRANCH[d]: the dart the search branches on after d moves
static std::deque<RState> RPOOL;          // stack slots: the replays first needed at code length D live below POOL_END[D]
static std::vector<int> POOL_END;
static int pool_used = 0;
static inline int pool_alloc() { if (pool_used == (int)RPOOL.size()) RPOOL.emplace_back(); return pool_used++; }
// wait: the P dart its replay stalled on; st: its replay, -1 while the first move is undecided (it needs
// none); nv, s: where the replay stood before this node advanced it (nv < 0: it did not).
struct AltRoot { int v, a, wait, st, nv, s; };
static std::vector<std::vector<AltRoot> > ALIVE;   // ALIVE[D]: undecided roots at code length D
static std::vector<int> ALIVE_NV;                  // P's vertex count when ALIVE[D] was formed
static long long ord_pruned = 0, ord_rejected = 0, ord_replays = 0, ord_skips = 0;
enum { R_TIED, R_PRUNE, R_DROP, R_GO };
static int REPLAY_WAIT = -1;

static void rs_undo(RState& R, AltRoot const& m) {
    for (; (int)R.qv2p.size() > m.nv; R.qv2p.pop_back(), R.qaut.pop_back()) R.pv2q[R.qv2p.back()] = -1;
    R.s = m.s;
}
// The least-slack dart of c, or its mirror image when its label is starred: where the search branches.
static int branch_dart(configuration const& c, int& slack) {
    const int ff = min_slack(c, slack), d = (int)c.dfs_depth;
    if ((int)BRANCH.size() <= d) BRANCH.resize(d + 1);
    BRANCH[d] = dart_star(c, ff) ? c.mirro[ff] : ff;
    return ff;
}
// The first move of the replay rooted at (v, a), read before it has a state: every frame of a type branches
// on the same dart first. R_GO = it is P's own first move, so the replay goes on.
static int first_move(configuration const& P, int v, int a, int D, bool full) {
    const int t0 = P.vertype[v];
    const int x = P.voff[v] + T_AUTINV[t0][a][T_FIRST[t0]], y = P.glue[x];
    REPLAY_WAIT = -1;
    if (y < 0) { REPLAY_WAIT = x; return R_TIED; }
    const int pv = P.vof[y], g = P.vertype[pv], qy = y - P.voff[pv];
    long long code;
    if (pv == v) code = enc_exist(T_AUT[t0][a][qy]);
    else { type_auts(g); code = enc_new(g, T_REPOF[g][qy]); }
    if (D <= 0) return full ? R_DROP : R_TIED;
    if (code != MOVES[0]) return code < MOVES[0] ? R_PRUNE : R_DROP;
    return R_GO;
}
// Continue the replay in R on P, whose code has length D. full = P is closed.
static int replay_from(configuration const& P, RState& R, int D, bool full) {
    ord_replays++;
    REPLAY_WAIT = -1;
    R.pv2q.resize(P.vertype.size(), -1);
    for (;; R.s++) {
        const int s = R.s;
        if (s == D && full) { ORD_AUTO = true; return R_TIED; }   // P's whole code, read off another root: an automorphism
        const int ff = BRANCH[s], qv = P.vof[ff];
        const int x = P.voff[R.qv2p[qv]] + T_AUTINV[P.vertype[qv]][R.qaut[qv]][ff - P.voff[qv]], y = P.glue[x];
        if (y < 0) { REPLAY_WAIT = x; return R_TIED; }
        if (s == D) return R_TIED;
        const int pv = P.vof[y], q2 = R.pv2q[pv], g = P.vertype[pv], qy = y - P.voff[pv];
        long long code;
        if (q2 >= 0) code = enc_exist(P.voff[q2] + T_AUT[g][R.qaut[q2]][qy]);
        else { type_auts(g); code = enc_new(g, T_REPOF[g][qy]); }
        if (code != MOVES[s]) return code < MOVES[s] ? R_PRUNE : R_DROP;
        // The move is P's own, so are the forced closures after it: nothing to make, only the vertex to map.
        if (q2 < 0) { R.pv2q[pv] = (int)R.qv2p.size(); R.qv2p.push_back(pv); R.qaut.push_back(T_TOREP[g][qy]); }
    }
}
// Take back what orderly_ok did to the replays at code length D.
static void orderly_undo(int D) {
    for (const AltRoot& r : ALIVE[D]) if (r.nv >= 0) rs_undo(RPOOL[r.st], r);
}
// False = prune P (full: reject the closure). True: the caller calls orderly_undo when P's subtree is done.
static bool orderly_ok(configuration const& P, bool full) {
    const int D = P.dfs_depth, nv = (int)P.vertype.size(), t0 = P.vertype[0];
    type_auts(t0);
    if ((int)ALIVE.size() <= D) { ALIVE.resize(D + 1); ALIVE_NV.resize(D + 1); POOL_END.resize(D + 1); }
    pool_used = D == 0 ? 0 : POOL_END[D - 1];
    std::vector<AltRoot>& out = ALIVE[D];
    out.clear();
    ALIVE_NV[D] = nv;
    ORD_AUTO = false;
    auto decide = [&](AltRoot r) {   // false = P is not canonical
        r.nv = -1;
        if (!full && r.wait >= 0 && P.glue[r.wait] == -1) { ord_skips++; out.push_back(r); return true; }
        int res = R_GO;
        const bool fresh = r.st < 0;
        if (fresh) {
            res = first_move(P, r.v, r.a, D, full);
            if (res == R_GO) {
                RState& R = RPOOL[r.st = pool_alloc()];
                R.qv2p.assign(1, r.v); R.qaut.assign(1, r.a); R.pv2q.assign(nv, -1); R.pv2q[r.v] = 0; R.s = 0;
            }
        } else {
            r.nv = (int)RPOOL[r.st].qv2p.size(); r.s = RPOOL[r.st].s;
        }
        if (res == R_GO) res = replay_from(P, RPOOL[r.st], D, full);
        if (res == R_TIED) { r.wait = REPLAY_WAIT; out.push_back(r); return true; }
        if (!fresh) rs_undo(RPOOL[r.st], r);   // the parent's replay goes on from where it stood
        else if (r.st >= 0) pool_used--;
        return res == R_DROP;
    };
    bool ok = true;
    const int frames = (int)T_AUT[t0].size();
    if (D == 0) { for (int a = 0; a < frames && ok; a++) if (a != T_ID[t0]) ok = decide({ 0, a, -1, -1, -1, 0 }); }
    else {
        for (size_t i = 0; i < ALIVE[D - 1].size() && ok; i++) ok = decide(ALIVE[D - 1][i]);
        for (int v = ALIVE_NV[D - 1]; v < nv && ok; v++)
            if (P.vertype[v] == t0) for (int a = 0; a < frames && ok; a++) ok = decide({ v, a, -1, -1, -1, 0 });
    }
    if (!ok) { (full ? ord_rejected : ord_pruned)++; orderly_undo(D); out.clear(); return false; }
    POOL_END[D] = pool_used;
    return true;
}

// A branch glue has been accepted: close the forced faces (the joins since `from` name the faces it
// touched), then emit the configuration if it is closed or recurse into it. True when it recursed (the old
// `success`). The caller's undo_to takes everything back.
static bool visit_child(configuration& c, size_t from) {
    if (!propagate_forced(c, from)) return false;
    const bool closed = c.nfree == 0;
    if (closed && split_depth > 0 && c.dfs_depth < split_depth && fork_index != 0) return false;   // worker 0 writes these
    if (closed && c.kcnt <= seen) { nckzero++; return false; }   // closed but zero counting vertices: not a tiling record
    int slack = 0;
    const int ff = closed ? -1 : branch_dart(c, slack);
    if (orderly && !orderly_ok(c, closed)) return false;
    if (!closed) extend(c, ff, slack);
    else if (simplify(c)) writesolution(c);
    if (orderly) orderly_undo(c.dfs_depth);
    return !closed;
}

// firstfree: the least-slack dart of slist (branch_dart), minc: its slack.
int extend(configuration& slist, int firstfree, const int minc) {
    slist.dfs_depth++;
    // Root level (the one-vertex seed from initex) is where the depth-2 cut is made. Deeper calls
    // never consult the shard, so the subtree below a taken branch is explored whole.
    const bool shard_here = split_depth > 0 ? slist.dfs_depth == split_depth
                                            : (shard_d2 > 1 && slist.dfs_depth == 1);
    std::vector<std::string> potential = {};
    int success = 0;
    if (eu_trace) {
        if (solcount % 100000 == 0) {
            gen.close();
            gen.open(filepath + genfile + "1.txt");
        }
        gen << "Resolving configuration " << solcount + 1 << "\n";
        gen << verbalvertices(slist.vertype) << "\n";
        gen << text_of(types_room(slist.vertype), [&](char* p) { return signature(sorted_vertype(slist.vertype), p); }) << "\n";
        gen << std::to_string(slist.num) << "\n";
        gen << text_of(35 * slist.glue.size() + 8, [&](char* p) { return writeconway(slist, p); }) << "\n";
    }
    if (eu_trace) trace_faces(slist, gen, firstfree, minc);
    firstfree = BRANCH[slist.dfs_depth - 1];
    const int mff = slist.mirro[firstfree];
    const bool mirrored = mff == firstfree;
    if (eu_trace) gen << "firstfree = " << std::to_string(firstfree) << "(" << label_text(slist, firstfree) << "), between " <<
        CLASS_DISP[slist.lvert[firstfree]] << " and " << CLASS_DISP[slist.lvert[mff]] <<
        ". Difference = " << std::to_string(minc) << "\n";
    // FIX 9 — the SAME two class equalities fix 2 hoisted for the add-a-vertex branch also govern this
    // one, and nothing was checking them here: the face rules were asked 2.48e9 times at k=2, mostly
    // from this loop, to reject gluings that two comparisons rule out. a_cls/b_cls are loop-invariant.
    const int a_cls = slist.lvert[firstfree];
    const int b_cls = slist.lvert[slist.rneig[firstfree]];
    // Same two class equalities as the candidate lookup, generalized: B in {NEXT,PREV}[a] and
    // A in {NEXT,PREV}[b]. Under BUCKET_OK the two alternatives coincide and this is the old test.
    const int wB1 = CLASS_NEXT[a_cls], wB2 = CLASS_PREV[a_cls];
    const int wA1 = CLASS_NEXT[b_cls], wA2 = CLASS_PREV[b_cls];
    // Every child is the glue of firstfree to a dart i (and of their mirror images, unless both lie on a
    // mirror or i is firstfree's own image), taken back by undo_to before the next.
    const size_t fm = slist.ftrail.size(), gm = slist.gtrail.size();
    // COUNTS BEFORE THE GLUE (2026-11-10). Write X for the face that starts at firstfree and Y for the one
    // that ends there. Gluing firstfree to i puts the face that ends at i before X and the face that starts
    // at i after Y, and the mirror glue does the same to the mirror images. A face longer than L, or closed
    // at a length L is no multiple of, fails a join, so a dart or a vertex type that would make one is
    // passed over before anything is glued or built: regular k<=14, 5.1M of 8.5M glues to placed darts
    // and 2.0M of 5.9M fresh vertices. Each test is a join's own (same counts, same class) or, where it
    // adds up several faces, holds because L is one number along a face (UNIFORM_L, else those are off).
    static const bool UNIFORM_L = []() {
        for (size_t c = 0; c < CLASS_L.size(); c++)
            if (CLASS_L[CLASS_NEXT[c]] != CLASS_L[c] || CLASS_L[CLASS_PREV[c]] != CLASS_L[c]) return false;
        return true;
    }();
    auto bad_close = [](int n, int cls) { return n % CLASS_P[cls] != 0 || CLASS_L[cls] % n != 0; };
    const int sY = slist.face[firstfree].lend, rX = slist.face[firstfree].rend;
    const int cntX = slist.face[firstfree].cnt, cntY = slist.face[sY].cnt;
    const int LX = CLASS_L[b_cls], LY = CLASS_L[a_cls];
    auto doomed = [&](int i) {   // a placed dart i
        const Face* F = slist.face.data();
        const int si = F[i].lend, Ai = slist.lvert[i];
        if (sY == i ? bad_close(cntY, a_cls) : cntY + F[i].cnt > LY) return true;   // the first join, as face_join decides it
        if (si == firstfree ? i != firstfree && bad_close(cntX, Ai) : UNIFORM_L && F[si].cnt + cntX > LX) return true;   // the second
        if (!UNIFORM_L || mirrored || i == mff) return false;
        const int mi = slist.mirro[i];   // X or Y its own mirror image: the mirror glue lengthens it again
        return (rX == mff && si != firstfree && si != mi && cntX + F[si].cnt + F[mi].cnt > LX) ||
               (sY == mff && F[i].rend != mi && cntY + F[i].cnt + F[F[mi].lend].cnt > LY);
    };
    auto glue_to = [&](int i, const int* known = nullptr) {
        return cglue(slist, firstfree, i) && (mirrored || i == mff || cglue(slist, mff, slist.mirro[i]))
            && faces_can_close(slist, fm, known);
    };
    for (int i = next_free(slist, 0); i >= 0; i = next_free(slist, i + 1)) {
        if (mirrored != (slist.mirro[i] == i)) continue;
        {
            const int Bi = slist.lvert[slist.rneig[i]], Ai = slist.lvert[i];
            if ((Bi != wB1 && Bi != wB2) || (Ai != wA1 && Ai != wA2)) continue;
        }
        // EDGE TYPES: a leg may not be glued to a hypotenuse. Checked on the mirror pair
        // too, since a non-mirrored glue drags its mirror image along with it.
        if (EDGE_TYPED) {
            if (!edge_ok(slist, firstfree, i)) continue;
            if (!mirrored && !edge_ok(slist, mff, slist.mirro[i])) continue;
        }
        if (doomed(i)) continue;
        if (glue_to(i) && (!shard_here || shard_take_branch())) {
            if (orderly) { MOVES.resize(std::max<size_t>(MOVES.size(), slist.dfs_depth)); MOVES[slist.dfs_depth - 1] = enc_exist(i); }
            if (visit_child(slist, fm)) {
                success++;
                if (eu_trace) potential.push_back(conwaysymbol(label_text(slist, firstfree), label_text(slist, i)));
            }
            if (shard_here) shard_done_branch();
        }
        undo_to(slist, fm, gm);
    }
    bool canK = slist.kcnt < maxnum;
    {
        const long nc = slist.num - slist.kcnt;
        if (nc > max_nc) max_nc = nc;
    }
    if (canK || has_noncounting) {
        // When kcnt == maxnum only a noncounting type can still be added, and those are 304 of
        // 60,927 in star24full. Walking the whole alphabet to `continue` past the other 60,623 was
        // 99.6% of every loop trip in the k=1 probe (8.13e9 of 8.16e9). NC_IDX is ascending, so
        // this visits the same types in the same order — emission order is unchanged.
        const bool nc_only = !canK;
        const std::vector<CandEnt>* pool;
        int qk[4];
        const int nq = CAND.empty() ? 0 : qkeys(a_cls, b_cls, mirrored, qk);
        if (nq == 1) {
            pool = nc_only ? &CAND_NC[qk[0]] : &CAND[qk[0]];   // BUCKET_OK path, unchanged
        } else if (nq > 1) {
            // Merge the union by `ord` so the visit order matches a full ascending scan. Each source
            // is pre-seeked to vertype[0]: ord is assigned in (type, rep) order, so gr is
            // non-decreasing along it and the outer lower_bound stays valid on the result.
            const size_t d = (size_t)(slist.dfs_depth < 0 ? 0 : slist.dfs_depth);
            while (MERGE_STACK.size() <= d) MERGE_STACK.push_back(std::vector<CandEnt>());
            std::vector<CandEnt>& buf = MERGE_STACK[d];
            buf.clear();
            const std::vector<CandEnt>* src[4];
            size_t idx[4];
            for (int t = 0; t < nq; t++) {
                src[t] = nc_only ? &CAND_NC[qk[t]] : &CAND[qk[t]];
                idx[t] = (size_t)(std::lower_bound(src[t]->begin(), src[t]->end(), slist.vertype[0],
                                  [](CandEnt const& e, int v) { return e.gr < v; }) - src[t]->begin());
            }
            for (;;) {
                int best = -1;
                for (int t = 0; t < nq; t++)
                    if (idx[t] < src[t]->size() &&
                        (best < 0 || (*src[t])[idx[t]].ord < (*src[best])[idx[best]].ord)) best = t;
                if (best < 0) break;
                buf.push_back((*src[best])[idx[best]++]);
            }
            pool = &buf;
        } else {
            pool = nc_only ? &FULL_NC : &FULL_ALL;
        }
        int gidx = (int)(std::lower_bound(pool->begin(), pool->end(), slist.vertype[0],
                         [](CandEnt const& e, int v) { return e.gr < v; }) - pool->begin());
        const int gend = (int)pool->size();
        // PAIR FILTER — gluing firstfree to f fixes successor(x) = f for x = lneig[firstfree], so the
        // face through x must still be able to close. tkey(x) is loop-invariant. Reject before
        // materialising, and skip a type entirely when none of its reps survives.
        const int tk_x = tkey_at(slist, slist.lneig[firstfree]);
        // The gluing is symmetric, so it also fixes successor(lneig(f)) = firstfree. That REVERSE face
        // must be able to close as well, and nothing checked it: one more bit lookup per candidate.
        // NOTE the dart: successor(y) = glue[rneig[y]], so the chain continues from Q(rneig[firstfree]),
        // NOT Q(firstfree). Using the bucket key here is off by one dart and mixes two class orbits.
        int qf_x[4];
        const int nqf_x = qkeys_at(slist, slist.rneig[firstfree], qf_x);
        // THE SAME TWO FACES, WITH THEIR LENGTHS (2026-11-10). The face that ends at firstfree gains the
        // corner (f, rneig f) and the face that starts there gains (lneig f, f), so the dynamic test on
        // both is known from the candidate's keys before its vertex exists. Four of five vertices were
        // built only to fail it. Exact: a face that passes after the whole glue passed at this stage too.
        const int c1 = slist.face[slist.face[firstfree].lend].cnt + 1, c2 = slist.face[firstfree].cnt + 1;
        const int tk_s1 = tkey_at(slist, slist.face[firstfree].lend);
        int q_r2[4];
        const int nq_r2 = qkeys_at(slist, slist.face[firstfree].rend, q_r2);
        auto cand_ok = [&](CandEnt const& e) {
            const int nqf = e.nqf & 7;
            return pair_ok_any(tk_x, e.qf, nqf) && pair_ok_any(e.tkrev, qf_x, nqf_x) &&
                   (!DYN_READY || (dyn_keys_close(tk_s1, e.qf, nqf, c1) && dyn_keys_close(e.tkrev, q_r2, nq_r2, c2)));
        };
        // A fresh vertex glued at its dart q puts the corner (lneig q, q) before X and (q, rneig q) after Y,
        // and the mirror glue puts their mirror images after X's mirror image and before Y's. So a corner
        // that is its own mirror image joins a face to its mirror image, or closes a face that is its own;
        // one that is not lengthens such a face twice.
        const bool xself = rX == mff, yself = sY == mff, xy = sY == firstfree;
        const bool x1 = xself ? bad_close(cntX + 1, slist.lvert[mff]) : UNIFORM_L && cntX + 1 + slist.face[slist.face[mff].lend].cnt > LX;
        const bool y1 = !yself && UNIFORM_L && cntY + 1 + slist.face[mff].cnt > LY;
        const bool x2 = xself && UNIFORM_L && cntX + 2 > LX, y2 = yself && UNIFORM_L && cntY + 2 > LY;
        auto doomed_new = [&](CandEnt const& e) {
            const vertexdef& VD = mainlist[e.gr];
            const int q = e.rrep;
            if (e.nqf & 32)   // one corner (q, q), after Y and before X
                return xy ? bad_close(cntX + 1, VD.lvert[q]) : cntY + 1 + cntX > CLASS_L[VD.lvert[q]];
            if (!(e.nqf & 64)) {
                if (e.nqf & 8 ? x1 : x2) return true;
                if (e.nqf & 16 ? (yself ? bad_close(cntY + 1, VD.lvert[VD.mirro[q]]) : y1) : y2) return true;
            }
            return xy && cntX + 2 > CLASS_L[VD.lvert[q]];   // X is Y: both corners go to it
        };
        // One pass: a type's vertex is built when the first of its reps passes the filters, and stays
        // for the rest of them.
        const int l = (int)slist.rneig.size();
        int built = -1;
        for (; gidx < gend; gidx++) {
            const CandEnt& e = (*pool)[gidx];
            const vertexdef& VD = mainlist[e.gr];
            // Counting types are bounded by maxnum (= k). Noncounting (dent-fill) types are not
            // bounded at all any more — see the max_nc note at the top.
            if (!cand_ok(e) || mirrored != ((e.nqf & 64) != 0) || doomed_new(e) || (VD.counting && !canK)) continue;
            if (built != e.gr) {
                if (built >= 0) drop_vertex(slist);
                add_vertex(slist, built = e.gr);
            }
            const int i = l + e.rrep;
            if (EDGE_TYPED) {
                if (!edge_ok(slist, firstfree, i)) continue;
                if (!mirrored && !edge_ok(slist, mff, slist.mirro[i])) continue;
            }
            // EU_HYPFEAS, after the cheap structural test: if the block's types cannot close
            // together, neither can any block grown from it (types only accumulate). Proven, so
            // nothing is lost; see hyp_feas.h. Cached per type set, so the other reps are free.
            const int known[6] = { sY, l + VD.rneig[e.rrep], c1, l + VD.lneig[e.rrep], rX, c2 };   // cand_ok's two
            if (glue_to(i, known) && (!hf::mode || hf::feasible_with(slist.vertype, e.gr)) &&
                (!shard_here || shard_take_branch())) {
                if (orderly) { MOVES.resize(std::max<size_t>(MOVES.size(), slist.dfs_depth)); MOVES[slist.dfs_depth - 1] = enc_new(e.gr, e.rrep); }
                if (visit_child(slist, fm)) {
                    success++;
                    if (eu_trace) potential.push_back(conwaysymbol(label_text(slist, firstfree), label_text(slist, i)) + " " + VD.symbol);
                }
                if (shard_here) shard_done_branch();
            }
            undo_to(slist, fm, gm);
        }
        if (built >= 0) drop_vertex(slist);
    }
    if (eu_trace) {
        gen << "Added " << std::to_string(success) << " partial solution";
        if (success != 1) {
            gen << "s";
        }
        gen << "\n";
        if (potential.size() > 0) {
            for (int p = 0; p < (int)potential.size() - 1; p++) {
                gen << potential[p] << "; ";
            }
            gen << potential[potential.size() - 1] << "\n";
        }
        gen << "\n";
    }
    solcount++;
    if (eu_trace) std::cout << std::to_string(solcount) << " - depth " << slist.dfs_depth << "      \r";
    slist.dfs_depth--;
    return 0;
}

// Face-walk keys. tkey(f) identifies f as a GLUING TARGET; qkey(e) is the key a free dart e demands
// of whatever gets glued to it. successors(x) = { f : tkey(f) == qkey(rneig[x]) } — the same identity
// fix 2 uses to bucket candidates, reused here to reason about whether a face can ever close.
static inline int tkey_of(const vertexdef& V, int f) {
    return cand_key(V.lvert[f], V.lvert[V.rneig[f]], V.mirro[f] == f);
}
// The 1..4 query keys of dart e. Under BUCKET_OK this set is a singleton, so every filter
// below reduces to its old self and the golden catalogs stay byte-identical.
static inline int qkeys_of(const vertexdef& V, int e, int* out) {
    return qkeys(V.lvert[e], V.lvert[V.rneig[e]], V.mirro[e] == e, out);
}
// The digraph the filters walk assumes every successor key sits in the SAME CLASS_NEXT orbit as its
// source ("measured: zero cross-orbit steps"). The BFS indexes successors with a global loc[] and
// never re-checks the orbit, so a cross-orbit edge would write into another orbit's slot and corrupt
// the reachability — and since dropping reachability KILLS types, that direction can lose tilings.
// Count them instead of assuming; a nonzero count disables the filters rather than mis-filtering.
static long XORB_STEPS = 0;

// FACE-CLOSURE FILTER — deletes vertex types that cannot occur in any tiling, at any k.
//
// face_join says a CLOSED face satisfies count % p == 0 && L % count == 0, so it is not enough for a
// dart to lie on SOME cycle of the face-successor digraph: a length-5 cycle around a triangle (L=3)
// is not a face. Measured on star24full: 60,927 types -> 2,372.
//
// The test collapses to the key level. successors(x) = S(Q(x)) where S(K) = darts whose tkey is K,
// so a closed walk x -> f1 -> ... -> f_{c-1} -> x forces the key chain
//     Q(x) = tkey(f1) -> Q(f1) = tkey(f2) -> ... -> Q(f_{c-1}) = tkey(x),
// i.e. c-1 steps in the key digraph R(K) = { Q(f) : f in S(K) }. So:
//
//   dart x is alive  <=>  exists c | L(x), c % p(x) == 0, with tkey(x) reachable from Q(x)
//                         in EXACTLY c-1 steps of R.
//
// R has ~16k nodes against 751k darts, and it decomposes by CLASS_NEXT orbit (measured: zero
// cross-orbit steps), so this is bitset reachability on a few hundred nodes per component.
// Face-closure filter. A vertex type whose faces can never close cannot occur in ANY tiling at any k,
// so it is deleted from the alphabet before the search starts. Sound, k-independent, ~0.05 s.
// Runs on EVERY palette since the 4-bucket union (2026-08-08). The successor relation comes from
// qkeys_of(), which enumerates all 1-4 admissible keys instead of assuming the single involution one,
// so the digraph below is a RELAXATION on period-p palettes: more edges, more reachability, fewer
// kills. Sound in the direction that matters, since only under-approximating reachability can delete
// a vertex type that a real tiling uses.
static void face_filter() {
    const int NT = (int)mainlist.size();
    TYPE_OK.assign(NT, 1);
    // EDGE_COMPL: refuse, for the same reason as the cross-orbit case below. This digraph walks
    // CORNER CLASSES only and knows nothing about edge types, which is sound while the two sides of
    // an edge agree. Under complementary matching it under-approximates and deletes reachable types:
    // measured on bubble-tri at k<=2, filtering on gave 1 raw block where filtering off gives 79,
    // losing the T{1,2} tiling among others. Losing tilings is a correctness bug, not a slow path.
    if (EDGE_COMPL || std::getenv("EU_NOFILTER")) return;
    const int NKEY = NCLS * NCLS * 2;
    std::vector<int> orb(NCLS, -1), orbL, orbP;
    for (int c = 0; c < NCLS; c++) {
        if (orb[c] != -1) continue;
        int id = (int)orbL.size(); orbL.push_back(CLASS_L[c]); orbP.push_back(CLASS_P[c]);
        int q = c; do { orb[q] = id; q = CLASS_NEXT[q]; } while (q != c);
    }
    std::vector<char> liveT(TYPE_OK);

    for (int round = 1;; round++) {
        // ---- key digraph R over live darts, plus each key's orbit ----
        std::vector<std::vector<int> > R(NKEY);
        std::vector<int> korb(NKEY, -1);
        for (int T = 0; T < NT; T++) {
            if (!liveT[T]) continue;
            const vertexdef& V = mainlist[T];
            for (int f = 0; f < (int)V.rneig.size(); f++) {
                int qs[4];
                const int nq = qkeys_of(V, V.rneig[f], qs);
                const int tk = tkey_of(V, f);
                korb[tk] = orb[V.lvert[V.rneig[f]]];
                for (int t = 0; t < nq; t++) R[tk].push_back(qs[t]);
            }
        }
        for (int K = 0; K < NKEY; K++)
            if (!R[K].empty()) { std::sort(R[K].begin(), R[K].end()); R[K].erase(std::unique(R[K].begin(), R[K].end()), R[K].end()); }
        // ---- compact per-orbit key index ----
        std::vector<int> loc(NKEY, -1);
        std::vector<std::vector<int> > keys((size_t)orbL.size());
        for (int K = 0; K < NKEY; K++) if (korb[K] >= 0) { loc[K] = (int)keys[korb[K]].size(); keys[korb[K]].push_back(K); }
        // ---- exact-t reachability per orbit, t = 0 .. L-1 ----
        // ALIVE[o] is a bitmask over c: bit c set for (src,dst) pairs achievable in c-1 steps.
        std::vector<std::vector<unsigned long long> > OKMASK((size_t)orbL.size());
        for (size_t o = 0; o < orbL.size(); o++) {
            const int n = (int)keys[o].size();
            if (!n) continue;
            const int L = orbL[o], P = orbP[o];
            const int W = (n + 63) / 64;
            std::vector<unsigned long long> cur((size_t)n * W, 0ULL), nxt;
            for (int i = 0; i < n; i++) cur[(size_t)i * W + i / 64] |= 1ULL << (i % 64);   // t = 0: identity
            OKMASK[o].assign((size_t)n * n, 0ULL);                                        // pair -> set of c
            auto record = [&](int c) {
                for (int i = 0; i < n; i++)
                    for (int j = 0; j < n; j++)
                        if (cur[(size_t)i * W + j / 64] >> (j % 64) & 1ULL) OKMASK[o][(size_t)i * n + j] |= 1ULL << c;
            };
            for (int t = 0; t <= L; t++) {
                int c = t + 1;
                if (c <= L && c % P == 0 && L % c == 0) record(c);
                if (t == L) break;
                nxt.assign((size_t)n * W, 0ULL);
                for (int i = 0; i < n; i++)
                    for (int j = 0; j < n; j++)
                        if (cur[(size_t)i * W + j / 64] >> (j % 64) & 1ULL)
                            for (size_t e = 0; e < R[keys[o][j]].size(); e++) {
                                const int K2 = R[keys[o][j]][e];
                                if (korb[K2] >= 0 && korb[K2] != (int)o) { XORB_STEPS++; continue; }
                                int d = loc[K2];
                                if (d >= 0) nxt[(size_t)i * W + d / 64] |= 1ULL << (d % 64);
                            }
                cur.swap(nxt);
            }
        }
        // ---- a dart survives if SOME allowed c works; a type dies if any dart dies ----
        int killed = 0, nlive = 0;
        for (int T = 0; T < NT; T++) {
            if (!liveT[T]) continue;
            const vertexdef& V = mainlist[T];
            bool ok = true;
            // ⚑ THE UNION, NOT THE SINGLE CLASS_NEXT KEY (2026-08-31). R above is built from
            // qkeys_of — all 1..4 admissible successor keys — but this test used to start its chain
            // from qkey_of, which is only qkeys_of's element 0. On a palette where CLASS_PREV !=
            // CLASS_NEXT that declares impossible every face which must be walked in the PREV
            // direction, and a face locks its direction only at its first step and accepts either.
            // THAT is the trihex 475 -> 2 and tetromino 76 -> 20 catastrophe, not the reflex corner it
            // was blamed on. Under BUCKET_OK the two forms are the same key, so every pinned table and
            // all three gate palettes are untouched (measured: regular 44/44, tri-only 16/16,
            // star-ico-d 329/329, isotox-cmp8-2 26,214/28,549 — delta 0 everywhere). The change only
            // ADDS admissible chain starts, so it can only kill FEWER types: monotone in the safe
            // direction, and it cannot newly trip the XORB_STEPS self-disable because round 1 already
            // runs on every type.
            for (int x = 0; x < (int)V.rneig.size() && ok; x++) {
                const int tk = tkey_of(V, x);
                const int o = korb[tk];
                if (o < 0 || loc[tk] < 0) { ok = false; break; }
                int qs[4];
                const int nq = qkeys_of(V, V.rneig[x], qs);
                bool any = false;
                for (int t = 0; t < nq && !any; t++)
                    if (loc[qs[t]] >= 0 && korb[qs[t]] == o
                        && OKMASK[o][(size_t)loc[qs[t]] * keys[o].size() + loc[tk]] != 0ULL) any = true;
                if (!any) ok = false;
            }
            if (!ok) { liveT[T] = 0; killed++; } else nlive++;
        }
        if (!killed) {
            if (XORB_STEPS) {
                // The per-orbit BFS cannot represent these, and the only representation it has left is
                // "unreachable", which kills types that may be fine. Refuse to filter at all.
                TYPE_OK.assign(NT, 1);
                PAIRFILTER = false;
                std::cerr << "face filter: DISABLED — " << XORB_STEPS
                          << " cross-orbit successor steps; the per-orbit reachability cannot model them "
                             "and under-approximating would delete reachable vertex types\n";
                return;
            }
            TYPE_OK.swap(liveT);
            if (nlive != NT)
                std::cerr << "face filter: " << nlive << " of " << NT
                          << " vertex types can occur in a tiling (" << (NT - nlive) << " impossible)\n";
            return;
        }
    }
}


// Build OKPAIR: bit (tk, qf) set iff a face through a dart with target key tk can still close when its
// successor's query key is qf. Same per-orbit bitset reachability as lenscan; here the mask is queried
// at bit c-1 (one step already consumed by fixing the successor), so it is recorded at EVERY t.
static void build_okpair() {
    const int NT = (int)mainlist.size();
    if (!PAIRFILTER || EDGE_COMPL || std::getenv("EU_NOFILTER")) { PAIRFILTER = false; return; }
    NKEY_ = NCLS * NCLS * 2;
    OKPAIR.assign(((size_t)NKEY_ * NKEY_ + 63) / 64, 0ULL);
    std::vector<int> orb(NCLS, -1), orbL, orbP;
    for (int c = 0; c < NCLS; c++) {
        if (orb[c] != -1) continue;
        int id = (int)orbL.size(); orbL.push_back(CLASS_L[c]); orbP.push_back(CLASS_P[c]);
        int q = c; do { orb[q] = id; q = CLASS_NEXT[q]; } while (q != c);
    }
    std::vector<std::vector<int> > R(NKEY_);
    std::vector<int> korb(NKEY_, -1);
    for (int T = 0; T < NT; T++) {
        if (!TYPE_OK[T]) continue;
        const vertexdef& V = mainlist[T];
        for (int f = 0; f < (int)V.rneig.size(); f++) {
            int qs[4];
            const int nq = qkeys_of(V, V.rneig[f], qs);
            const int tk = tkey_of(V, f);
            korb[tk] = orb[V.lvert[V.rneig[f]]];
            for (int t = 0; t < nq; t++) R[tk].push_back(qs[t]);
        }
    }
    for (int K = 0; K < NKEY_; K++)
        if (!R[K].empty()) { std::sort(R[K].begin(), R[K].end()); R[K].erase(std::unique(R[K].begin(), R[K].end()), R[K].end()); }
    std::vector<int> loc(NKEY_, -1);
    std::vector<std::vector<int> > keys((size_t)orbL.size());
    for (int K = 0; K < NKEY_; K++) if (korb[K] >= 0) { loc[K] = (int)keys[korb[K]].size(); keys[korb[K]].push_back(K); }
    long set_bits = 0;
    for (size_t o = 0; o < orbL.size(); o++) {
        const int n = (int)keys[o].size(); if (!n) continue;
        const int L = orbL[o], P = orbP[o], W = (n + 63) / 64;
        unsigned long long allowed = 0ULL;      // bit c-1 for each admissible closed-face length c >= 2
        for (int c = P; c <= L; c += P) if (L % c == 0 && c >= 2) allowed |= 1ULL << (c - 1);
        std::vector<unsigned long long> cur((size_t)n * W, 0ULL), nxt, acc((size_t)n * n, 0ULL);
        for (int i = 0; i < n; i++) cur[(size_t)i * W + i / 64] |= 1ULL << (i % 64);
        for (int t = 0; t <= L; t++) {
            const int c = t + 1;
            if (c < 64)
                for (int i = 0; i < n; i++)
                    for (int j = 0; j < n; j++)
                        if (cur[(size_t)i * W + j / 64] >> (j % 64) & 1ULL) acc[(size_t)i * n + j] |= 1ULL << c;
            if (t == L) break;
            nxt.assign((size_t)n * W, 0ULL);
            for (int i = 0; i < n; i++)
                for (int j = 0; j < n; j++)
                    if (cur[(size_t)i * W + j / 64] >> (j % 64) & 1ULL)
                        for (size_t e = 0; e < R[keys[o][j]].size(); e++) {
                            int d = loc[R[keys[o][j]][e]];
                            if (d >= 0) nxt[(size_t)i * W + d / 64] |= 1ULL << (d % 64);
                        }
            cur.swap(nxt);
        }
        // acc[src][dst] bit b  <=>  dst in Reach_{b-1}(src).  Pair (x,f) needs bit c-1 with src=Q(f),
        // dst=tkey(x) — so OKPAIR is indexed (tkey(x)=dst, qf=src).
        for (int i = 0; i < n; i++)
            for (int j = 0; j < n; j++)
                if (acc[(size_t)i * n + j] & allowed) {
                    size_t b = (size_t)keys[o][j] * NKEY_ + keys[o][i];
                    OKPAIR[b >> 6] |= 1ULL << (b & 63); set_bits++;
                }
    }
    std::cerr << "OKPAIR: " << set_bits << " admissible (tkey, Q(f)) pairs\n";
}


// Build the persistent reachability tables the dynamic test reads. Same per-orbit bitset walk the
// static face filter already does; here the result is KEPT and recorded at every step t (not only at
// admissible c), because the dynamic query asks for bit (c - count), not bit c.
static void dyn_build() {
    // ⚑ MUST be guarded on BUCKET_OK, exactly like face_filter() and build_okpair(). dyn_can_close()
    // identifies a dart through cand_key(), and that key is only a valid successor identity when
    // CLASS_PREV == CLASS_NEXT with NEXT an involution — the property BUCKET_OK tests. On a palette
    // where it fails the keys address the wrong orbit, the filter rejects reachable branches, and
    // TILINGS ARE SILENTLY LOST.
    //
    // Measured 2026-08-07 on composite-convex (BUCKET_OK false): k<=2 gave 147 kept with the dynamic
    // filter against 288 with it off — 141 real tilings gone, no error, no warning. The bug was
    // invisible until now because every palette the filter was developed and gated against (regular,
    // star24full, ring*) has BUCKET_OK true, so `make check-regular` and every star digest passed
    // throughout. The blast radius is the composite/scaled family: composite-convex,
    // composite-decomp, and any other palette with period-p corners.
    //
    // RESOLVED 2026-08-08 by the 4-bucket union: the successor relation is now built from qkeys_of(),
    // which enumerates every admissible key instead of assuming the single involution one, and
    // dyn_can_close() accepts if ANY of them can close. That restores the filter on period-p palettes
    // and the composite-convex k<=2 count is back to 288. The guard that remains is PAIRFILTER, which
    // face_filter clears when it found cross-orbit steps it cannot model.
    if (!PAIRFILTER) return;   // leaves DYN_READY false => dyn_can_close() is never consulted
    const int NKEY = NCLS * NCLS * 2;
    std::vector<int> orb(NCLS, -1), orbL, orbP;
    for (int c = 0; c < NCLS; c++) {
        if (orb[c] != -1) continue;
        int id = (int)orbL.size(); orbL.push_back(CLASS_L[c]); orbP.push_back(CLASS_P[c]);
        int q = c; do { orb[q] = id; q = CLASS_NEXT[q]; } while (q != c);
    }
    std::vector<std::vector<int> > R(NKEY);
    DYN_KORB.assign(NKEY, -1);
    for (int T = 0; T < (int)mainlist.size(); T++) {
        if (!TYPE_OK[T]) continue;
        const vertexdef& V = mainlist[T];
        for (int f = 0; f < (int)V.rneig.size(); f++) {
            int qs[4];
            const int nq = qkeys_of(V, V.rneig[f], qs);
            const int tk = cand_key(V.lvert[f], V.lvert[V.rneig[f]], V.mirro[f] == f);
            DYN_KORB[tk] = orb[V.lvert[V.rneig[f]]];
            for (int t = 0; t < nq; t++) R[tk].push_back(qs[t]);
        }
    }
    for (int K = 0; K < NKEY; K++)
        if (!R[K].empty()) { std::sort(R[K].begin(), R[K].end()); R[K].erase(std::unique(R[K].begin(), R[K].end()), R[K].end()); }
    DYN_LOC.assign(NKEY, -1);
    std::vector<std::vector<int> > keys((size_t)orbL.size());
    for (int K = 0; K < NKEY; K++) if (DYN_KORB[K] >= 0) { DYN_LOC[K] = (int)keys[DYN_KORB[K]].size(); keys[DYN_KORB[K]].push_back(K); }
    DYN_ACC.assign(orbL.size(), std::vector<unsigned long long>());
    DYN_N.assign(orbL.size(), 0);
    DYN_ALLOWED.assign(orbL.size(), 0ULL);
    for (size_t o = 0; o < orbL.size(); o++) {
        const int n = (int)keys[o].size(); DYN_N[o] = n; if (!n) continue;
        const int L = orbL[o], P = orbP[o], W = (n + 63) / 64;
        for (int c = P; c <= L && c < 64; c += P) if (L % c == 0) DYN_ALLOWED[o] |= 1ULL << c;
        std::vector<unsigned long long> cur((size_t)n * W, 0ULL), nxt;
        for (int i = 0; i < n; i++) cur[(size_t)i * W + i / 64] |= 1ULL << (i % 64);
        DYN_ACC[o].assign((size_t)n * n, 0ULL);
        for (int t = 0; t <= L; t++) {
            if (t + 1 < 64)
                for (int i = 0; i < n; i++)
                    for (int j = 0; j < n; j++)
                        if (cur[(size_t)i * W + j / 64] >> (j % 64) & 1ULL) DYN_ACC[o][(size_t)i * n + j] |= 1ULL << (t + 1);
            if (t == L) break;
            nxt.assign((size_t)n * W, 0ULL);
            for (int i = 0; i < n; i++)
                for (int j = 0; j < n; j++)
                    if (cur[(size_t)i * W + j / 64] >> (j % 64) & 1ULL)
                        for (size_t e = 0; e < R[keys[o][j]].size(); e++) {
                            int d = DYN_LOC[R[keys[o][j]][e]];
                            if (d >= 0) nxt[(size_t)i * W + d / 64] |= 1ULL << (d % 64);
                        }
            cur.swap(nxt);
        }
    }
    DYN_READY = true;
}

int main() {
#ifdef EU_RUNTIME_TABLES
    // Must precede everything: symbolcount, mainlist and the CLASS_ tables are all empty until this
    // runs, so any table read before it would silently see a zero-size alphabet and enumerate nothing.
    {
        const char* tp = std::getenv("EU_TABLES");
        if (!tp) { std::cerr << "built with RUNTIME_TABLES=1 but EU_TABLES is unset\n"; return 2; }
        load_tables_bin(tp);
    }
#endif
    // A remainder here would leave root slices no shard walks, i.e. silently missing tilings. Refuse.
    if (shard_d2 > 1 && (shard_d2 > shard_n || shard_n % shard_d2 != 0)) {
        std::cerr << "EU_SHARD_D2=" << shard_d2 << " must divide EU_SHARD_N=" << shard_n
                  << " (and not exceed it) — refusing to run an incomplete partition\n";
        return 2;
    }
    if (eu_pruned && !orderly) { std::cerr << "EU_PRUNED needs EU_ORDERLY: the default search writes a tiling more than once\n"; return 2; }
    if (orderly)
        std::cerr << "EU_ORDERLY: same tilings, each written once from its canonical root, so the serials in "
                     "ctrnact-* ids differ from a default run. Not for shipping until ids are canonical.\n";
    if (shard_d2 > 1)
        std::cerr << "shard " << shard_w << "/" << shard_n << ": roots " << shard_w1 << "/" << shard_n1
                  << ", root-branches " << shard_w2 << "/" << shard_d2 << "\n";
    detect_edge_types();          // no-op on the runtime path, which already ran it after loading
    for (int c = 0; c < (int)CLASS_SIGMA.size(); c++)
        if (CLASS_SIGMA[c] != c) { SIGMA_TRIVIAL = false; break; }
    if (!SIGMA_TRIVIAL)
        std::cerr << "sided classes: sigma is not the identity on this alphabet\n";
    symbolcount = mainlist.size();
    build_type_families();        // seed colour for simplify(); must precede the first closure
    {
        // A class is a STAR class when its tile's name carries the '*' of an isotoxal outline
        // ("10*12"); a vertex type is star-bearing when any of its darts sits on one.
        std::vector<char> star_class(CLASS_TILE.size(), 0);
        for (size_t c = 0; c < CLASS_TILE.size(); c++) {
            const int t = CLASS_TILE[c];
            if (t >= 0 && t < (int)TILE_NAME.size() && TILE_NAME[t].find('*') != std::string::npos)
                star_class[c] = 1;
        }
        int last_star = -1, first_plain = -1, nstar = 0;
        for (size_t i = 0; i < mainlist.size(); i++) {
            bool bear = false;
            for (size_t d = 0; d < mainlist[i].lvert.size() && !bear; d++) {
                const int c = mainlist[i].lvert[d];
                if (c >= 0 && c < (int)star_class.size() && star_class[c]) bear = true;
            }
            if (bear) { last_star = (int)i; nstar++; }
            else if (first_plain < 0) first_plain = (int)i;
        }
        STAR_ROOTS = (first_plain < 0) ? (int)mainlist.size() : first_plain;
        if (star_roots) {
            if (last_star >= 0 && first_plain >= 0 && last_star > first_plain) {
                std::cerr << "EU_STAR_ROOTS: the star-bearing types are NOT a prefix of this alphabet "
                             "(first plain " << first_plain << ", last star " << last_star << ") — "
                             "rooting only at them would lose solids. Regenerate the palette with "
                             "\"starFirst\": true, or drop the flag.\n";
                return 2;
            }
            std::cerr << "star roots: " << STAR_ROOTS << " of " << mainlist.size()
                      << " types (" << nstar << " star-bearing); the regular-only subtree is skipped\n";
        }
    }
    for (int i = 0; i < (int)mainlist.size(); i++)
        if (!mainlist[i].counting) { has_noncounting = true; NC_IDX.push_back(i); }
    LBASE_OF.resize(mainlist.size());
    for (size_t gr = 0; gr < mainlist.size(); gr++) {
        LBASE_OF[gr].resize(mainlist[gr].label.size());
        for (size_t gg = 0; gg < mainlist[gr].label.size(); gg++)
            LBASE_OF[gr][gg] = lbase_id(mainlist[gr].label[gg]);
    }
    NCLS = (int)CLASS_NEXT.size();
    CN_ = CLASS_NEXT.data(); CP_ = CLASS_PREV.data();   // must precede the first qkeys() call
    // BUCKET_OK says whether the admissible (A,B) pair is unique, i.e. whether qkeys() returns 1
    // everywhere and the union degenerates to the single bucket the engine used before 2026-08-08. The
    // candidate index handles both cases, so nothing there branches on it — but the three FILTERS do,
    // since it is exactly the condition under which their per-orbit reachability is the certified
    // pre-union one (see the gate below). It stopped being reporting-only on 2026-08-31.
    BUCKET_OK = true;
    for (int c = 0; c < NCLS && BUCKET_OK; c++)
        if (CLASS_PREV[c] != CLASS_NEXT[c] || CLASS_NEXT[CLASS_NEXT[c]] != c) BUCKET_OK = false;
    // EU_NOBUCKET — diagnostic: turn the whole stack off (face filter, pair filter, dynamic filter,
    // candidate bucketing) and scan every type at every node. Only ever removes optimizations, so it
    // cannot lose a tiling; it prices the stack on any palette. Measured on isotox-cx45-z24, see
    // experiments/results/period3-palette-2026-08-07.md.
    // ⚑ THE GATE IS !BUCKET_OK, NOT "SOME CORNER IS 180° OR WIDER" (2026-08-31). It read the corner
    // ANGLE until today, on the reasoning that a reflex or flat corner sits at a 2-VALENT vertex the
    // face-closure model does not describe — measured damage: tetromino's k=1 catalog fell 76 -> 20,
    // trihex k<=3 fell 475 -> 2. The damage was real; the diagnosis was wrong. The defect was the
    // single-CLASS_NEXT-key alive test in face_filter (fixed above), which declares impossible every
    // face that has to be walked in the CLASS_PREV direction. That is vacuous exactly when
    // CLASS_PREV == CLASS_NEXT, i.e. under BUCKET_OK — and tetromino and trihex are both
    // BUCKET_OK=false, while every isotoxal palette is BUCKET_OK=true by construction: a regular tile
    // is a CLASS_NEXT self-loop and an isotoxal star is exactly two classes, point and dent, swapped
    // by NEXT. So the old gate switched the filters off on precisely the palettes where they are
    // provably identical to the pre-2026-08-08 certified ones.
    //
    // Measured, both directions, this machine: isotox-cmp8-2 k<=2 full run, filters on vs off, raw
    // blocks 7,497,140 EITHER WAY and all 227 out/eusolver_*.txt cksum-identical, for 432,679,770 ->
    // 358,714,952 nodes. isotox-mixed shard 0 of 64, byte-identical over 111 MB of solver output, for
    // 98,637,170 -> 54,007,313 nodes = 1.83x. Kill rate grows with the palette: 8.2% of types at one
    // star, 19.6% at two, 30.0% at three, 67.9% on the 20-tile isotox-sph.
    //
    // Kept conservative for !BUCKET_OK: the alive-test fix makes the filter sound there too in the
    // monotone direction, but it does not PROVE the residual kills are sound, so those palettes keep
    // the filters off until someone gates them properly.
    //
    // The CANDIDATE INDEX is unaffected and stays on either way — it is a necessary-condition prune
    // straight out of a face's first step, with no closure model in it (EU_NOFILTER=1, i.e.
    // bucketing only, reproduces the old 76 on tetromino exactly).
    if (std::getenv("EU_NOBUCKET")) {
        TYPE_OK.assign(mainlist.size(), 1);
        PAIRFILTER = false;
    } else if (!BUCKET_OK && !std::getenv("EU_UNSAFE_FILTERS")) {
        TYPE_OK.assign(mainlist.size(), 1);
        PAIRFILTER = false;
        std::cerr << "filters: DISABLED — CLASS_PREV != CLASS_NEXT, so the per-orbit face-closure "
                     "reachability cannot be trusted to keep every real vertex type "
                     "(candidate index stays on)\n";
    } else {
        // EU_UNSAFE_FILTERS — kept ONLY to price the gate and to reproduce an older run. On a
        // !BUCKET_OK palette it can still delete real tilings (473 of 475 on trihex).
        if (!BUCKET_OK)
            std::cerr << "filters: FORCED ON by EU_UNSAFE_FILTERS on a CLASS_PREV != CLASS_NEXT "
                         "palette — this can DELETE REAL TILINGS; the catalogue is not complete\n";
        face_filter();
        if (!std::getenv("EU_NODYN")) dyn_build();
    }
    std::cerr << "bucket key unique (BUCKET_OK): " << (BUCKET_OK ? "yes" : "no — 4-bucket union active")
              << "\n";
    // ONE build for every palette now. Entries carry `ord`, their index in this ascending (type, rep)
    // scan, which is what lets the union of several buckets be visited in full-scan order. FULL_ALL is
    // kept only for EU_NOBUCKET, the diagnostic that reproduces the old unbucketed cost.
    {
        const bool force_full = std::getenv("EU_NOBUCKET") != 0;
        if (!force_full) {
            CAND.assign((size_t)NCLS * NCLS * 2, std::vector<CandEnt>());
            CAND_NC.assign((size_t)NCLS * NCLS * 2, std::vector<CandEnt>());
        }
        int ord = 0;
        for (int gr = 0; gr < (int)mainlist.size(); gr++)
            for (int rrep : mainlist[gr].reps) {
                if (!TYPE_OK[gr]) continue;
                const vertexdef& V = mainlist[gr];
                CandEnt e; e.gr = gr; e.rrep = rrep; e.ord = ord++;
                e.nqf = qkeys_of(V, V.rneig[rrep], e.qf) | (V.lneig[rrep] == V.mirro[rrep]) << 3 | (V.rneig[rrep] == V.mirro[rrep]) << 4 |
                        (V.rneig[rrep] == rrep) << 5 | (V.mirro[rrep] == rrep) << 6;
                e.tkrev = tkey_of(V, V.lneig[rrep]);
                if (force_full) {
                    FULL_ALL.push_back(e);
                    if (!V.counting) FULL_NC.push_back(e);
                } else {
                    const int key = cand_key(V.lvert[rrep], V.lvert[V.rneig[rrep]],
                                             V.mirro[rrep] == rrep);
                    CAND[key].push_back(e);
                    if (!V.counting) CAND_NC[key].push_back(e);
                }
            }
    }
    build_okpair();
    // Same reason as eu_pruner: with EU_STREAM the catalog goes out through std::cout one small
    // insertion at a time, and the stdio tie makes every one of them pay for a lock. Nothing here
    // uses printf.
    std::ios::sync_with_stdio(false);
    if (eu_trace) {
        int filecount = 1;
        gen.open(filepath + genfile + std::to_string(filecount) + ".txt");
    }
    hf::init(TABLE_D);
    // EU_FORK=<P> — P WORKER PROCESSES SHARING ONE ALPHABET (2026-08-31).
    //
    // The pool runner gets its parallelism from P independent solver processes, and each one builds
    // the whole alphabet for itself. That is free at 220k vertex types (414 MB) and impossible at the
    // 11-outline palette's ~9.7M (measured 2.0 kB/type, so ~19 GB) — one copy fills a 24 GB machine
    // and the run is stuck on a single core for want of RAM, not of time.
    //
    // Everything above this line is built once and never written again: mainlist, CAND/CAND_NC,
    // TYPE_OK, OKPAIR, DYN_ACC, the CLASS_ tables. So fork here and the children share every one of
    // those pages copy-on-write — P workers cost ~19 GB plus each one's small search state, not
    // P x 19 GB. No thread safety is involved: separate address spaces, and the shared pages are
    // read-only in practice.
    //
    // Child c takes shard indices {i : i % P == c} of the EU_SHARD_N decomposition and runs initex()
    // once per index, so over-decomposition still works — which matters, because the skew at
    // EU_SHARD_N == P is severe (run-oracle-parallel.sh measured one shard at 64% of the work at
    // N=8). It writes into fork<c>/out/, which the merge step globs alongside s*/out/.
    const int nfork = std::getenv("EU_FORK") ? atoi(std::getenv("EU_FORK")) : 0;
    if (nfork > 1) {
        if (eu_stream) {
            // Every child would write the catalogue into the same inherited stdout, interleaved at
            // whatever granularity the buffers flush at. There is no catalogue to salvage from that.
            std::cerr << "EU_FORK and EU_STREAM are incompatible: the workers share one stdout\n";
            return 2;
        }
        split_depth = std::getenv("EU_SPLIT") ? atoi(std::getenv("EU_SPLIT")) : 0;
        if (split_depth > 0) {
            if (shard_n > 1) { std::cerr << "EU_SPLIT replaces EU_SHARD_N; set one or the other\n"; return 2; }
            TICKET = (long long*)mmap(nullptr, 4096, PROT_READ | PROT_WRITE, MAP_SHARED | MAP_ANON, -1, 0);
            if (TICKET == MAP_FAILED) { std::cerr << "mmap failed\n"; return 2; }
            if (!orderly)
                std::cerr << "EU_SPLIT: counts are exact, but every worker numbers its own serials, so ctrnact-* "
                             "ids collide across workers (60,447 of 413,361 at regular k<=14). Not for shipping. "
                             "With EU_ORDERLY the run writes what one process writes.\n";
        }
        else if (shard_n % nfork != 0) {
            std::cerr << "EU_FORK=" << nfork << " must divide EU_SHARD_N=" << shard_n
                      << " — refusing to run an incomplete partition\n";
            return 2;
        }
        // One leaf set for all workers: a hit drops a closure another worker has written.
        // EU_SHARED_TABLES=0: one per worker.
        tables_shared = !std::getenv("EU_SHARED_TABLES") || atoi(std::getenv("EU_SHARED_TABLES")) != 0;
        if (tables_shared && leaf_mb > 0) LEAF_SET.init(leaf_mb, true);
        std::cerr << "fork: " << nfork << " workers over " << shard_n
                  << " shards, sharing one alphabet\n";
        std::vector<pid_t> kids;
        for (int c = 0; c < nfork; c++) {
            const pid_t pid = fork();
            if (pid < 0) { std::cerr << "fork failed\n"; return 2; }
            if (pid == 0) {
                char dir[64];
                snprintf(dir, sizeof dir, "fork%d", c);
                if (mkdir(dir, 0755) && errno != EEXIST) _exit(3);
                if (chdir(dir)) _exit(3);
                if (mkdir("out", 0755) && errno != EEXIST) _exit(3);
                fork_index = c;
                if (split_depth > 0) {   // walk everything, explore the tickets this worker wins
                    my_ticket = __atomic_fetch_add(TICKET, 1, __ATOMIC_RELAXED);
                    initex();
                }
                else for (int i = c; i < shard_n; i += nfork) {
                    shard_set(i);
                    // ⚑ MUST reset. shard_take_branch() slices the root-level branch NUMBER, and the
                    // numbering is only a partition because every shard sharing a w1 counts the same
                    // sequence from zero. Carrying the counter into the next shard index would shift
                    // the slice and silently drop branches — i.e. lose tilings.
                    branch_ctr = 0;
                    initex();
                }
                family_streams_close();
                std::cerr << "fork" << c << ": nodes " << solcount << "\n";
                hf::report();
                _exit(0);
            }
            kids.push_back(pid);
        }
        int bad = 0;
        for (pid_t pid : kids) {
            int st = 0;
            waitpid(pid, &st, 0);
            if (!WIFEXITED(st) || WEXITSTATUS(st)) bad++;
        }
        if (bad) { std::cerr << bad << " fork worker(s) failed\n"; return 2; }
        if (split_depth > 0 && orderly) merge_split(nfork);
        return 0;
    }
    initex();
    family_streams_close();     // flush and close the per-family output handles (FIX 18)
    hf::report();
    if (eu_trace) gen.close();
    // DFS node count: one per extend() call, i.e. every partial configuration the search expanded.
    // Needed to price isomorph-free generation. The duplication table counts emitted LEAVES (raw
    // blocks / kept blocks = 3.84x at k=8), but canonical augmentation pays a canonicity test at
    // every NODE, so the break-even is a ratio of per-node costs, not of leaf counts. STDERR only —
    // the catalog is on stdout and in out/*.txt, so this cannot perturb a digest.
    std::cerr << "nodes: " << solcount
              << "  simplify_calls: " << simplify_calls
              << "  simplify_true: " << simplify_true
              << "  forced: " << forced_glues << "  leaf_dups: " << leaf_dups
              << "\n";
    if (orderly)
        std::cerr << "orderly: pruned " << ord_pruned << " nodes, rejected " << ord_rejected << " closures, "
                  << ord_replays << " replays (" << ord_skips << " skipped)\n";
    if (max_nc > 0)
        std::cerr << "note: up to " << max_nc << " dent-fill (noncounting) vertices per configuration; "
                  << "no cap is applied.\n";
    if (nckzero > 0) {
        std::cerr << "note: " << nckzero << " closed all-noncounting configuration(s) "
                  << "suppressed (no true vertex; not tilings by the Myers convention).\n";
    }
    return 0;
}