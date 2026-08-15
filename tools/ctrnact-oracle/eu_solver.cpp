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
#include <deque>
#include <iterator>
#include <ctime>

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
// FIX B — candidate index.  checkpart walks a face across a glue (x,y) and demands
//   lvert[rneig[y]] in {CLASS_NEXT, CLASS_PREV}[lvert[x]]
// in BOTH directions.  For a glue of firstfree to a dart of a candidate type that is two O(1) class
// equalities, knowable before the vertex is materialised.  Bucket every (type, rep) by the pair
//   A = class at the rep,  B = class at the rep's right neighbour,  mir = whether the rep is its own mirror
// and look up (NEXT[b], NEXT[a], mirrored) from the current configuration.
//
// 4-BUCKET UNION (2026-08-08). That lookup is a SINGLE bucket only when CLASS_PREV == CLASS_NEXT and
// NEXT is an involution — the BUCKET_OK property. Derive it without that assumption. Gluing free dart
// e to candidate dart f makes the face walk cross the new glue in both directions, and checkface's
// first step accepts either CLASS_NEXT or CLASS_PREV:
//     crossing e -> f :  lvert[rneig[f]] in {NEXT, PREV}[a]        , a = lvert[e]
//     crossing f -> e :  lvert[rneig[e]] in {NEXT, PREV}[lvert[f]] , b = lvert[rneig[e]]
// PREV is NEXT's inverse permutation, so the second reads lvert[f] in {PREV, NEXT}[b]. Two choices on
// each side is FOUR admissible (A, B) pairs, hence four buckets, and their union is the candidate pool.
// Under BUCKET_OK the two choices coincide pointwise, qkeys() returns n == 1, and the pool is the same
// single bucket the fast path always used — which is why check-regular stays byte-identical.
//
// Soundness is one-directional and worth stating: the four conditions are NECESSARY (they come from
// steps checkface performs), so the union never drops an admissible candidate. It is not sufficient —
// checkface also LOCKS the direction after its first step, which the union deliberately forgets — so
// the union admits some candidates that checkpart_inc then rejects. Costs work, cannot lose a tiling.
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
// reps matches meant the inner loop glued and checkpart-ed the other 11 for nothing: measured
// 6,691,818 reps iterated against 724,811 that can match, 89.2% waste. Entries are (type, rep),
// built in ascending (type, rep-order) so the visit order is exactly what the full scan gave.
// qf = the query keys of rneig(f), 1 under BUCKET_OK and up to 4 without it; tkrev = tkey(lneig(f)).
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
static const int shard_w = std::getenv("EU_SHARD_W") ? atoi(std::getenv("EU_SHARD_W")) : 0;

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
// state: a skipped branch sets and clears the same glue as a taken one, and checkpart_inc reads only
// the configuration. Every shard with the same w1 walks the same roots in the same order and so
// assigns the same numbers.
//
// TWO LEVELS, not one, because pure depth-2 would make every shard redo every root's level-1 work
// (writecycle + the candidate scan + checkpart_inc per branch) — duplicated N times. Instead
// EU_SHARD_N is still the TOTAL shard count and EU_SHARD_D2 says how many ways each root is split:
//   N1 = N / D2 roots slices, w1 = W / D2      (which roots this shard walks)
//   D2      branch slices,    w2 = W % D2      (which of that root's branches it descends)
// so root-level work is duplicated D2 times, not N. D2=1 reproduces the old partition exactly.
// ⚑ EU_SHARD_N must be divisible by EU_SHARD_D2; main() refuses otherwise rather than silently
// dropping the remainder, which would lose tilings.
static const int shard_d2 = std::getenv("EU_SHARD_D2") ? atoi(std::getenv("EU_SHARD_D2")) : 1;
static const int shard_n1 = (shard_d2 > 1) ? shard_n / shard_d2 : shard_n;
static const int shard_w1 = (shard_d2 > 1) ? shard_w / shard_d2 : shard_w;
static const int shard_w2 = (shard_d2 > 1) ? shard_w % shard_d2 : 0;
static long long branch_ctr = 0;   // root-level branch number; see shard_take_branch()

// True iff this shard owns the next root-level branch. Called ONLY at dfs_depth==1 and only after
// checkpart_inc has accepted the branch, so the numbering counts real work and skips nothing that
// another shard would also skip.
static inline bool shard_take_branch() {
    return (branch_ctr++ % shard_d2) == shard_w2;
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
// or the emitted solutions (those go to `globe` in writesolution). Default OFF; -DEU_TRACE=1 restores
// Marek's original tracing. The mincycle computation inside writecycle() runs regardless of this flag.
#ifndef EU_TRACE
#define EU_TRACE 0
#endif
constexpr bool eu_trace = EU_TRACE;

// EU_STREAM (runtime toggle, no rebuild needed): when set, writesolution() emits each solution
// block to std::cout instead of to a per-family file under `globe`, so the solver can be piped
// straight into the pruner (eu_solver | eu_pruner) with raw blocks never landing on disk. The
// block format itself is unchanged; only the sink changes.
static const bool eu_stream = std::getenv("EU_STREAM") != nullptr;

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

struct configuration {
    std::vector<int> label;   // FIX 7: packed (base-string id, tile), rendered only for output
    std::vector<int> lneig;
    std::vector<int> rneig;
    std::vector<int> mirro;
    std::vector<int> lvert;   // corner-class ids (see vertexdef)
    std::vector<int> etype;   // per-dart edge type, parallel to lvert (empty unless EDGE_TYPED)
    std::vector<int> glue;
    std::vector<int> vertype;
    int num;                  // total vertex types incl. noncounting (drives labels/framing)
    int kcnt;                 // counting vertex types only (drives k, maxnum, file naming)
    int dfs_depth;
};

// EDGE TYPES. False for every palette that declares none (and for the whole compiled-table
// path), in which case conf.etype stays empty and none of this costs anything beyond one branch.
static bool EDGE_TYPED = false;
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
std::string edgelabel(const std::string& edge, int tile);   // defined below
static std::vector<std::string> LBASE;        // interned base strings
static std::vector<char> LBASE_STAR;          // does base i start with '*'
static std::map<std::string, int> LBASE_IDX;

static int lbase_id(const std::string& b) {
    std::map<std::string, int>::iterator it = LBASE_IDX.find(b);
    if (it != LBASE_IDX.end()) return it->second;
    int id = (int)LBASE.size();
    LBASE.push_back(b);
    LBASE_STAR.push_back(!b.empty() && b[0] == '*' ? 1 : 0);
    LBASE_IDX[b] = id;
    return id;
}
static std::vector<std::vector<int> > LBASE_OF;   // [type][dart] -> interned base id
static inline int label_code(int base_id, int tile) { return base_id * 4096 + tile; }
static inline bool label_star(int code) { return LBASE_STAR[code / 4096] != 0; }
static std::string label_str(int code) { return edgelabel(LBASE[code / 4096], code % 4096); }

struct runt {
    std::string soltype;
    int solnum;
};

std::vector<runt> runtotal;

struct vertypesolv {
    std::vector<int> vertices;
    int count;
};

std::vector<vertypesolv> vertypesolved;

// long long, not int: this counts DFS nodes, and runs now reach billions. composite-convex k<=4
// (2026-08-08) printed "nodes: -1898351957" — a signed 32-bit wrap at ~2.15e9, so every node figure
// from a long run was silently wrong. The pricing arguments in docs/ctrnact-solver-optimizations.md
// are built on this number, so a wrapped counter is a misleading measurement, not a cosmetic bug.
long long solcount = 0;
int solfound = 0;

std::vector<int> mincycle;

std::ofstream globe;
std::ofstream gen;

std::string fname(int num);
std::string finename(configuration const& conf);
int ferk(vertexdef const& x);
std::string edgelabel(const std::string& edge, int tile);
std::string conwaysymbol(std::string const& first, std::string const& second);
std::string writeconway(configuration const& conf);
std::string verbalvertices(std::vector<int> const& vertype);
bool checkpart(configuration const& conf);
static bool checkpart_inc(configuration const& conf, const int* changed, int nchanged);
int writecycle(configuration const& conf, std::ostream& filen);
std::vector<int> sigresult(std::vector<int> const& vertype);
std::string sig(std::vector<int> const& result);
std::string signature(std::vector<int> const& vertype);
std::string filesignature(std::vector<int> const& vertype);
int vertypesolvedadd(std::vector<int> const& vertype);
int initex();
int writecyclefinal(configuration const& conf, std::ostream& filen);
int writesolution(configuration const& conf);

bool simplify(configuration const& conf);
static inline bool edge_ok(configuration const& c, int x, int y) {
    if (!EDGE_TYPED) return true;
    const int a = c.etype[x], b = c.etype[y];
    return a == 0 || b == 0 || a == b;   // 0 is a wildcard: an untyped edge glues to anything
}

int extend(configuration& slist);

std::string finename(configuration const& conf) {
    std::string m = fname(conf.kcnt) + "_";
    for (int t = 0; t < (int)TILE_FAM.size(); t++) {
        bool present = false;
        for (int c : conf.lvert) if (CLASS_TILE[c] == t) { present = true; break; }
        if (present) m += TILE_FAM[t];
    }
    return m;
}

std::string fname(int num) {
    std::string m = std::to_string(num);
    if (num < 10) {
        m = "0" + m;
    }
    return m;
}

int ferk(vertexdef const& x) {
    int r = x.lneig.size();
    int q = r / x.ferkval;
    return q;
}

std::string edgelabel(const std::string& edge, int tile) {
    std::string m = edge;
    if (tile > 3) {
        m = m + "@" + std::to_string(tile);
    }
    else {
        for (int i = 0; i < tile; i++) {
            m = m + "'";
        }
    }
    return m;
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

std::string writeconway(configuration const& conf) {
    std::vector<int> smet = {};
    std::string conwaystring = "";
    for (int cy = 0; cy < (int)conf.glue.size(); cy++) {
        if ((std::find(smet.begin(), smet.end(), cy) == smet.end()) && (conf.glue[cy] != -1)) {
            std::string first = label_str(conf.label[cy]);
            std::string second = label_str(conf.label[conf.glue[cy]]);
            smet.push_back(cy);
            smet.push_back(conf.glue[cy]);
            smet.push_back(conf.mirro[cy]);
            smet.push_back(conf.glue[conf.mirro[cy]]);
            conwaystring = conwaystring + conwaysymbol(first, second);
        }
    }
    return conwaystring;
}

std::string verbalvertices(std::vector<int> const& vertype) {
    std::string s = "";
    for (int i : vertype) s = s + mainlist[i].symbol + ", ";
    return s.substr(0, s.size() - 2);
}

// Face-cycle validity over corner CLASSES. Regular palette (period p=1, CLASS_NEXT=id,
// L=n) degenerates to Marek's original: same class along the cycle, closed length divides
// n, open length <= n. Star tiles (p=2, point/dent alternating word of length L=2n): the
// class must advance +1 mod p along the walk, a closed cycle must be a whole number of
// word periods (count % p == 0) AND a divisor of L (rotation symmetry of the tile), an
// open cycle must not exceed L. For arbitrary p (composite tiles, and MIRROR placements
// that traverse the boundary backwards) the walk direction is locked from the first
// observed step to CLASS_NEXT or CLASS_PREV, so the advance rule is orientation-safe for
// any p; p=1 (regular) locks +1 immediately since CLASS_PREV==CLASS_NEXT==id.
// One face, walked from dart i. Extracted verbatim from the old checkpart body.

// DYNAMIC FACE CLOSURE (probe). checkface's open branch returns `count <= L`, discarding the count.
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
static long dyn_open = 0, dyn_reject = 0;

static inline bool dyn_can_close(configuration const& conf, int i, int rfree, int count) {
    const int tk_i = cand_key(conf.lvert[i], conf.lvert[conf.rneig[i]], conf.mirro[i] == i);
    const int o = DYN_KORB[tk_i];
    if (o < 0) return true;                                    // unknown -> do not reject
    const int lj = DYN_LOC[tk_i];
    if (lj < 0 || count >= 63) return true;
    // The open dart has 1..4 query keys under the 4-bucket union. The face can still close if ANY of
    // them reaches tkey(i) at an admissible length, so this is a disjunction; requiring all of them
    // would reject branches that are genuinely closable and lose tilings.
    int qs[4];
    const int nq = qkeys(conf.lvert[rfree], conf.lvert[conf.rneig[rfree]],
                         conf.mirro[rfree] == rfree, qs);
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

static inline bool checkface(configuration const& conf, int i) {
    int free = i;
    int rfree = conf.rneig[free];
    int expect = conf.lvert[rfree];
    const int L = CLASS_L[expect];
    const int p = CLASS_P[expect];
    int count = 1;
    int dirlock = 0;
    for (;;) {
        free = conf.glue[rfree];
        if (free == -1) {
            if (!(count <= L)) return false;
            // ACTIVE: an open face that cannot reach an admissible total length is a dead branch.
            return !DYN_READY || dyn_can_close(conf, i, rfree, count);
        }
        if (free == i)  return (count % p == 0) && (L % count == 0);
        rfree = conf.rneig[free];
        int actual = conf.lvert[rfree];
        if (dirlock == 0) {
            if (actual == CLASS_NEXT[expect]) dirlock = 1;
            else if (actual == CLASS_PREV[expect]) dirlock = -1;
            else return false;
        }
        expect = (dirlock == 1) ? CLASS_NEXT[expect] : CLASS_PREV[expect];
        count++;
        if (actual != expect) return false;
    }
}

bool checkpart(configuration const& conf) {
    for (int i = 0; i < (int)conf.rneig.size(); i++)
        if (!checkface(conf, i)) return false;
    return true;
}

// FIX 4 — the parent configuration already passed, and gluing one edge can only change the faces whose
// walk REACHES that edge. The forward step is free -> glue[rneig[free]], so the starts that reach a
// changed position x are found by stepping backwards from lneig[x] via free -> lneig[glue[free]].
// Walking those and nothing else is equivalent to the full scan, and costs chain length instead of
// configuration size.
static bool checkpart_inc(configuration const& conf, const int* changed, int nchanged) {
    for (int t = 0; t < nchanged; t++) {
        const int x = changed[t];
        if (x < 0) continue;
        const int start = conf.lneig[x];
        int free = start;
        for (;;) {
            if (!checkface(conf, free)) return false;
            const int prev = conf.glue[free];
            if (prev == -1) break;
            free = conf.lneig[prev];
            if (free == start) break;         // closed cycle: every start on it already checked
        }
    }
    return true;
}

int writecycle(configuration const& conf, std::ostream& filen) {
    mincycle = { -1,TABLE_MAXL + 1 };
    int v = 0;
    // was: std::vector<int> smet + std::find per dart => O(darts^2) and an allocation per node.
    // Generation stamp: bump a counter instead of clearing the array, so the per-call O(darts) fill
    // (3.1e9 writes at k=2) disappears.
    static std::vector<unsigned> smet_stamp;
    static unsigned smet_gen = 0;
    const int NDARTS = (int)conf.glue.size();
    if ((int)smet_stamp.size() < NDARTS) smet_stamp.resize(NDARTS, 0u);
    ++smet_gen;
    for (int cy = 0; cy < NDARTS; cy++) {
        std::string mainst;
        int count = 0;
        bool complete = false;
        if (smet_stamp[cy] != smet_gen) {
            int left = cy;
            while ((conf.glue[left] != -1) && (conf.glue[left] != conf.rneig[cy])) {
                left = conf.lneig[conf.glue[left]];
            }
            if (conf.glue[left] == -1) {
                int stable = left;
                int right = conf.rneig[left];
                int vstable = CLASS_L[conf.lvert[right]];
                bool cont = true;
                while (cont) {
                    smet_stamp[left] = smet_gen;
                    if (eu_trace) mainst = mainst + label_str(conf.label[left]) + "/" + label_str(conf.label[right]) + "(" + CLASS_DISP[conf.lvert[right]] + ")-";
                    count++;
                    left = conf.glue[right];
                    if (left != -1) {
                        right = conf.rneig[left];
                    }
                    else {
                        int dif = vstable - count;
                        if (dif < mincycle[1]) {
                            mincycle = { stable,dif };
                        }
                        cont = false;
                    }
                }
            }
            else {
                left = cy;
                int right = conf.rneig[left];
                v = CLASS_L[conf.lvert[right]];
                bool cont = true;
                complete = true;
                while (cont) {
                    smet_stamp[left] = smet_gen;
                    if (eu_trace) mainst = mainst + label_str(conf.label[left]) + "/" + label_str(conf.label[right]) + "(" + CLASS_DISP[conf.lvert[right]] + ")-";
                    count++;
                    left = conf.glue[right];
                    if (left != cy) {
                        right = conf.rneig[left];
                    }
                    else {
                        cont = false;
                    }
                }
            }
            if (eu_trace) {
                if (complete) {
                    mainst = mainst.substr(0, mainst.size() - 1);
                    int ratio = v / count;
                    if (ratio != 1) {
                        mainst = " [" + mainst + "]x" + std::to_string(ratio);
                    }
                    else {
                        mainst = " " + mainst;
                    }
                }
                filen << mainst << "\n";
            }
        }
    }
    return 0;
}

std::string sig(std::vector<int> const& result) {
    std::string s = "";
    for (int i = 0; i < (int)result.size(); i++) {
        if (result[i] > 0) {
            s = s + mainlist[i].symbol;
            if (result[i] > 1) {
                s = s + "x" + std::to_string(result[i]);
            }
            s = s + ", ";
        }
    }
    return s.substr(0, s.size() - 2);
}

std::vector<int> sigresult(std::vector<int> const& vertype) {
    std::vector<int> result(symbolcount, 0);
    for (int i : vertype) result[i]++;
    return result;
}

std::string signature(std::vector<int> const& vertype) {
    return sig(sigresult(vertype));
}

std::string filesignature(std::vector<int> const& vertype) {
    std::vector<int> result = sigresult(vertype);
    std::string s = "";
    for (int i = 0; i < (int)result.size(); i++) {
        if (result[i] > 0) {
            s = s + mainlist[i].code;
            if (result[i] > 1) {
                s = s + std::to_string(result[i]);
            }
            s = s + " ";
        }
    }
    return s.substr(0, s.size() - 1);
}

int vertypesolvedadd(std::vector<int> const& vertype) {
    std::vector<int> result = sigresult(vertype);
    std::vector<int> res2;
    int x = 0;
    while (x < (int)vertypesolved.size()) {
        res2 = vertypesolved[x].vertices;
        if (result == res2) {
            vertypesolved[x].count++;
            return x;
        }
        x++;
    }
    vertypesolved.push_back({ result,1 });
    return x;
}

int initex() {
    long t_start = (long)time(nullptr), last_progress = t_start;
    for (int i = 0; i < symbolcount; i++) {
        if (shard_n1 > 1 && i % shard_n1 != shard_w1) continue;  // this worker's slice of the roots
        if (!TYPE_OK[i]) continue;                             // type cannot occur in any tiling
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
        newconf.label.clear();
        for (size_t q = 0; q < mainlist[i].label.size(); q++)
            newconf.label.push_back(label_code(LBASE_OF[i][q], 0));
        newconf.lneig = mainlist[i].lneig;
        newconf.rneig = mainlist[i].rneig;
        newconf.mirro = mainlist[i].mirro;
        newconf.lvert = mainlist[i].lvert;
        if (EDGE_TYPED) newconf.etype = mainlist[i].etype;
        newconf.vertype = { i };
        newconf.num = 1;
        newconf.kcnt = mainlist[i].counting;
        newconf.dfs_depth = 0;
        newconf.glue = std::vector<int>(newconf.lneig.size(), -1);
        extend(newconf);
    }
    return 0;
}


int writecyclefinal(configuration const& conf, std::ostream& filen) {
    int v = 0;
    std::vector<int> smet = {};
    std::vector<std::string> mainstlist = {};
    std::vector<int> sublist = {};
    bool ultrachiral = true;
    std::vector<int> repeatlist = {};
    for (int cy = 0; cy < (int)conf.glue.size(); cy++) {
        std::string mainst = "";
        int count = 0;
        int minmirror = conf.glue.size();
        if (std::find(smet.begin(), smet.end(), cy) == smet.end()) {
            int left = cy;
            int right = conf.rneig[left];
            v = CLASS_L[conf.lvert[right]];
            bool cont = true;
            while (cont) {
                smet.push_back(left);
                if (conf.mirro[right] < minmirror) {
                    minmirror = conf.mirro[right];
                }
                mainst = mainst + label_str(conf.label[left]) + "/" + label_str(conf.label[right]) + "(" + CLASS_DISP[conf.lvert[right]] + ")-";
                count++;
                left = conf.glue[right];
                if (left != cy) {
                    right = conf.rneig[left];
                }
                else {
                    cont = false;
                }
            }
            mainst = mainst.substr(0, mainst.size() - 1);
            int ratio = v / count;
            repeatlist.push_back(ratio);
            if (ratio != 1) {
                mainst = "[" + mainst + "]x" + std::to_string(ratio);
            }
            mainstlist.push_back(mainst);
            if (std::find(smet.begin(), smet.end(), minmirror) != smet.end()) {
                sublist.push_back(0);
                ultrachiral = false;
            }
            else {
                int left = minmirror;
                mainst = "";
                right = conf.rneig[left];
                v = CLASS_L[conf.lvert[right]];
                cont = true;
                while (cont) {
                    smet.push_back(left);
                    mainst = mainst + label_str(conf.label[left]) + "/" + label_str(conf.label[right]) + "(" + CLASS_DISP[conf.lvert[right]] + ")-";
                    count++;
                    left = conf.glue[right];
                    if (left != minmirror) {
                        right = conf.rneig[left];
                    }
                    else {
                        cont = false;
                    }
                }
                mainst = mainst.substr(0, mainst.size() - 1);
                repeatlist.push_back(ratio);
                if (ratio != 1) {
                    mainst = "[" + mainst + "]x" + std::to_string(ratio);
                }
                mainstlist.push_back(mainst);
                sublist.push_back(1);
                sublist.push_back(2);
            }
        }
    }
    std::string header;
    std::string subheader;
    for (int m = 0; m < (int)mainstlist.size(); m++) {
        std::string mainst = mainstlist[m];
        int sub = sublist[m];
        if (sub == 0) {
            filen << std::to_string(m) << ": " << mainst;
        }
        else if (sub == 1) {
            if (!ultrachiral) {
                header = std::to_string(m) + "/" + std::to_string(m + 1) + ": ";
            }
            else {
                header = std::to_string(m / 2) + ": ";
            }
            subheader = std::string(header.size(), ' ');
            filen << header << mainst;
        }
        else {
            filen << subheader << mainst;
        }
        filen << "\n";
    }
    filen << "---\n";
    return 0;
}

int writesolution(configuration const& conf) {
    solfound++;
    std::string fine = finename(conf);
    std::string vv = verbalvertices(conf.vertype);
    std::string versig = signature(conf.vertype);
    std::string wc = writeconway(conf);
    int re = vertypesolvedadd(conf.vertype);
    std::string ret = std::to_string(vertypesolved[re].count);
    std::string filesig = filesignature(conf.vertype);
    // dirsig prefix (NN/NN_fam/filesig/) so decode.py/develop.py's tes_id() can parse the id —
    // matches the Python solver's tesline; the C++ original omitted it.
    std::string tesfile1 = fname(conf.kcnt) + "/" + fine + "/" + filesig + "/"
                         + solvercode + " raw " + filesig + " " + ret + ".tes";

    std::ostream* blkp;
    if (eu_stream) {
        blkp = &std::cout;
    } else {
        std::string fullname = filepath + listfile + fine + ".txt";
        bool found = false;
        for (auto& rt : runtotal) if (fine == rt.soltype) { rt.solnum++; found = true; break; }
        if (!found) runtotal.push_back(runt{fine, 1});
        globe.open(fullname, found ? std::ios::app : std::ios::out);
        blkp = &globe;
    }
    std::ostream& blk = *blkp;
    blk << "Number of vertex types: " << conf.num << "\n"
        << vv << "\n" << versig << "\n"
        << "TES file: " << tesfile1 << "\n"
        << wc << "\n";
    writecyclefinal(conf, blk);
    blk << "\n\n";
    if (!eu_stream) globe.close();
    return 0;
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
bool simplify_inner(configuration const& conf);
bool simplify(configuration const& conf) {
    simplify_calls++;
    if (dbl_simplify) (void)simplify_inner(conf);
    const bool r = simplify_inner(conf);
    if (r) simplify_true++;
    return r;
}
bool simplify_inner(configuration const& conf) {
    int le = conf.rneig.size();

    std::vector<int> eq_class(le, 0);

    int num_eq_class = 1;

    int last_num_eq_class = 0;

    while (num_eq_class > last_num_eq_class) {
        using vertex_data = std::array<int, 6>;
        std::vector<std::pair<vertex_data, int > > data(le);

        last_num_eq_class = num_eq_class;
        for (int i = 0; i < le; i++) {
            // Seed colour: the corner class, and the EDGE TYPE where the class alone does not
            // separate the darts. On a free-edge palette every dart of the square grid is the same
            // class and only its edge type differs, so colouring by class alone makes the refinement
            // homogeneous, it never discretizes, and every closure is rejected as non-rigid. Off
            // unless the alphabet declares edge types, so every equilateral palette is untouched.
            data[i].first[0] = EDGE_TYPED ? conf.lvert[i] * ETSPAN + conf.etype[i] : conf.lvert[i];
            data[i].first[1] = eq_class[i];
            data[i].first[2] = eq_class[conf.mirro[i]];
            data[i].first[3] = eq_class[conf.glue[i]];
            data[i].first[4] = eq_class[conf.lneig[i]];
            data[i].first[5] = eq_class[conf.rneig[i]];
            data[i].second = i;
        }

        sort(data.begin(), data.end());
        eq_class[data[0].second] = 0;

        num_eq_class = 0;

        for (int i = 1; i < le; i++) {
            if (data[i].first != data[i - 1].first) num_eq_class++;
            eq_class[data[i].second] = num_eq_class;
        }

        num_eq_class++;
    }

    return num_eq_class == le;
}

int extend(configuration& slist) {
    slist.dfs_depth++;
    // Root level (the one-vertex seed from initex) is where the depth-2 cut is made. Deeper calls
    // never consult the shard, so the subtree below a taken branch is explored whole.
    const bool shard_here = (shard_d2 > 1 && slist.dfs_depth == 1);
    std::vector<std::string> potential = {};
    int success = 0;
    if (eu_trace) {
        if (solcount % 100000 == 0) {
            gen.close();
            gen.open(filepath + genfile + "1.txt");
        }
        gen << "Resolving configuration " << solcount + 1 << "\n";
        gen << verbalvertices(slist.vertype) << "\n";
        gen << signature(slist.vertype) << "\n";
        gen << std::to_string(slist.num) << "\n";
        gen << writeconway(slist) << "\n";
    }
    writecycle(slist, gen);   // computes global mincycle (read below) — must run even without tracing
    int firstfree;
    int minc;
    firstfree = mincycle[0];
    minc = mincycle[1];
    if (label_star(slist.label[firstfree])) {
        firstfree = slist.mirro[firstfree];
    }
    bool mirrored = (slist.mirro[firstfree] == firstfree);
    if (eu_trace) gen << "firstfree = " << std::to_string(firstfree) << "(" << label_str(slist.label[firstfree]) << "), between " <<
        CLASS_DISP[slist.lvert[firstfree]] << " and " << CLASS_DISP[slist.lvert[slist.mirro[firstfree]]] <<
        ". Difference = " << std::to_string(minc) << "\n";
    // FIX 9 — the SAME two class equalities fix 2 hoisted for the add-a-vertex branch also govern this
    // one, and nothing was checking them here: checkpart_inc was called 2.48e9 times at k=2, mostly
    // from this loop, to reject gluings that two comparisons rule out. a_cls/b_cls are loop-invariant.
    const int a_cls = slist.lvert[firstfree];
    const int b_cls = slist.lvert[slist.rneig[firstfree]];
    // Same two class equalities as the candidate lookup, generalized: B in {NEXT,PREV}[a] and
    // A in {NEXT,PREV}[b]. Under BUCKET_OK the two alternatives coincide and this is the old test.
    const int wB1 = CLASS_NEXT[a_cls], wB2 = CLASS_PREV[a_cls];
    const int wA1 = CLASS_NEXT[b_cls], wA2 = CLASS_PREV[b_cls];
    for (int i = 0; i < (int)slist.rneig.size(); i++) {
        if (slist.glue[i] == -1) {
            bool mirroredi = slist.mirro[i] == i;
            if (mirrored == mirroredi) {
                {
                    const int Bi = slist.lvert[slist.rneig[i]], Ai = slist.lvert[i];
                    if ((Bi != wB1 && Bi != wB2) || (Ai != wA1 && Ai != wA2)) continue;
                }
                // EDGE TYPES: a leg may not be glued to a hypotenuse. Checked on the mirror pair
                // too, since a non-mirrored glue drags its mirror image along with it.
                if (EDGE_TYPED) {
                    if (!edge_ok(slist, firstfree, i)) continue;
                    if (!mirrored && !edge_ok(slist, slist.mirro[firstfree], slist.mirro[i])) continue;
                }
                slist.glue[firstfree] = i;
                slist.glue[i] = firstfree;
                if (!mirrored) {
                    slist.glue[slist.mirro[firstfree]] = slist.mirro[i];
                    slist.glue[slist.mirro[i]] = slist.mirro[firstfree];
                }
                configuration& newconf = slist;
                const int chg1[4] = { firstfree, i,
                                      mirrored ? -1 : newconf.mirro[firstfree],
                                      mirrored ? -1 : newconf.mirro[i] };
                if (checkpart_inc(newconf, chg1, 4) && (!shard_here || shard_take_branch())) {
                    if (std::find(newconf.glue.begin(), newconf.glue.end(), -1) == newconf.glue.end()) {
                        if (newconf.kcnt > seen) {
                            if (simplify(newconf)) {
                                writesolution(newconf);
                            }
                        }
                        else nckzero++;   // closed but zero counting vertices: not a tiling record
                    }
                    else {
                        success++;
                        extend(newconf);
                        if (eu_trace) potential.push_back(conwaysymbol(label_str(newconf.label[firstfree]), label_str(newconf.label[i])));
                    }
                }
                slist.glue[firstfree] = -1;
                slist.glue[i] = -1;
                if (!mirrored) {
                    slist.glue[slist.mirro[firstfree]] = -1;
                    slist.glue[slist.mirro[i]] = -1;
                }
            }
        }
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
        const int px = slist.lneig[firstfree];
        const int tk_x = cand_key(slist.lvert[px], slist.lvert[slist.rneig[px]], slist.mirro[px] == px);
        // The gluing is symmetric, so it also fixes successor(lneig(f)) = firstfree. That REVERSE face
        // must be able to close as well, and nothing checked it: one more bit lookup per candidate.
        // NOTE the dart: successor(y) = glue[rneig[y]], so the chain continues from Q(rneig[firstfree]),
        // NOT Q(firstfree). Using the bucket key here is off by one dart and mixes two class orbits.
        const int rf = slist.rneig[firstfree];
        int qf_x[4];
        const int nqf_x = qkeys(slist.lvert[rf], slist.lvert[slist.rneig[rf]],
                                slist.mirro[rf] == rf, qf_x);
        while (gidx < gend) {
            const int gr = (*pool)[gidx].gr;
            {
                bool any = false;
                for (int q = gidx; q < gend && (*pool)[q].gr == gr; q++)
                    if (pair_ok_any(tk_x, (*pool)[q].qf, (*pool)[q].nqf) &&
                        pair_ok_any((*pool)[q].tkrev, qf_x, nqf_x)) { any = true; break; }
                if (!any) { while (gidx < gend && (*pool)[gidx].gr == gr) gidx++; continue; }
            }
            // Counting types are bounded by maxnum (= k). Noncounting (dent-fill) types are not
            // bounded at all any more — see the max_nc note at the top.
            bool skip = false;
            if (mainlist[gr].counting && !canK) skip = true;
            if (skip) { while (gidx < gend && (*pool)[gidx].gr == gr) gidx++; continue; }
            int l = slist.rneig.size();
            configuration& newconf = slist;
            // FIX 8 — was 6 push_backs per dart: 10.6e9 capacity-checked appends at k=2. One sized
            // grow per array, then raw-pointer stores. Capacity persists across the DFS because
            // teardown shrinks with resize(), so the grow almost never reallocates.
            const vertexdef& VD = mainlist[gr];
            const int symbollength = (int)VD.rneig.size();
            const int newsz = l + symbollength;
            newconf.rneig.resize(newsz); newconf.lneig.resize(newsz); newconf.mirro.resize(newsz);
            newconf.lvert.resize(newsz); newconf.label.resize(newsz); newconf.glue.resize(newsz);
            if (EDGE_TYPED) newconf.etype.resize(newsz);
            int* RN = newconf.rneig.data(); int* LN = newconf.lneig.data();
            int* MI = newconf.mirro.data(); int* LV = newconf.lvert.data();
            int* LB = newconf.label.data(); int* GL = newconf.glue.data();
            const int* srn = VD.rneig.data(); const int* sln = VD.lneig.data();
            const int* smi = VD.mirro.data(); const int* slv = VD.lvert.data();
            int* ET = EDGE_TYPED ? newconf.etype.data() : nullptr;
            const int* set_ = EDGE_TYPED ? VD.etype.data() : nullptr;
            const int* sbo = LBASE_OF[gr].data();
            const int tilenum = newconf.num;
            for (int gg = 0; gg < symbollength; gg++) {
                const int d = l + gg;
                RN[d] = l + srn[gg];
                LN[d] = l + sln[gg];
                MI[d] = l + smi[gg];
                LV[d] = slv[gg];
                if (ET) ET[d] = set_[gg];
                LB[d] = label_code(sbo[gg], tilenum);
                GL[d] = -1;
            }
            newconf.vertype.push_back(gr);
            newconf.num++;
            newconf.kcnt += mainlist[gr].counting;
            while (gidx < gend && (*pool)[gidx].gr == gr) {
                const int rrep = (*pool)[gidx].rrep;
                const bool pok = pair_ok_any(tk_x, (*pool)[gidx].qf, (*pool)[gidx].nqf) &&
                                 pair_ok_any((*pool)[gidx].tkrev, qf_x, nqf_x);
                gidx++;
                if (!pok) continue;
                int i = l + rrep;
                configuration& newconf2 = newconf;
                bool mirroredi = newconf2.mirro[i] == i;
                if (mirrored == mirroredi) {
                    if (EDGE_TYPED) {
                        if (!edge_ok(newconf2, firstfree, i)) continue;
                        if (!mirrored && !edge_ok(newconf2, newconf2.mirro[firstfree], newconf2.mirro[i])) continue;
                    }
                    newconf2.glue[firstfree] = i;
                    newconf2.glue[i] = firstfree;
                    if (!mirrored) {
                        newconf2.glue[newconf2.mirro[firstfree]] = newconf2.mirro[i];
                        newconf2.glue[newconf2.mirro[i]] = newconf2.mirro[firstfree];
                    }
                    const int chg2[4] = { firstfree, i,
                                          mirrored ? -1 : newconf2.mirro[firstfree],
                                          mirrored ? -1 : newconf2.mirro[i] };
                    if (checkpart_inc(newconf2, chg2, 4) && (!shard_here || shard_take_branch())) {
                        if (std::find(newconf2.glue.begin(), newconf2.glue.end(), -1) == newconf2.glue.end()) {
                            if (newconf2.kcnt > seen) {
                                if (simplify(newconf2)) {
                                    writesolution(newconf2);
                                }
                            }
                            else nckzero++;
                        }
                        else {
                            success++;
                            extend(newconf2);
                            if (eu_trace) potential.push_back(conwaysymbol(label_str(newconf2.label[firstfree]), label_str(newconf2.label[i])) + " " + mainlist[gr].symbol);
                        }
                    }
                    newconf2.glue[firstfree] = -1;
                    newconf2.glue[i] = -1;
                    if (!mirrored) {
                        newconf2.glue[newconf2.mirro[firstfree]] = -1;
                        newconf2.glue[newconf2.mirro[i]] = -1;
                    }
                }
            }
            newconf.num--;
            newconf.kcnt -= mainlist[gr].counting;
            newconf.vertype.pop_back();
            newconf.rneig.resize(l);
            newconf.lneig.resize(l);
            newconf.mirro.resize(l);
            newconf.lvert.resize(l);
            if (EDGE_TYPED) newconf.etype.resize(l);
            newconf.label.resize(l);
            newconf.glue.resize(l);
        }
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
static inline int qkey_of(const vertexdef& V, int e) {
    return cand_key(CLASS_NEXT[V.lvert[V.rneig[e]]], CLASS_NEXT[V.lvert[e]], V.mirro[e] == e);
}
static inline int tkey_of(const vertexdef& V, int f) {
    return cand_key(V.lvert[f], V.lvert[V.rneig[f]], V.mirro[f] == f);
}
// The 1..4 query keys of dart e. Under BUCKET_OK this is exactly {qkey_of(V, e)}, so every filter
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
// checkface says a CLOSED face satisfies count % p == 0 && L % count == 0, so it is not enough for a
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
    if (std::getenv("EU_NOFILTER")) return;
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
            for (int x = 0; x < (int)V.rneig.size() && ok; x++) {
                int tk = tkey_of(V, x), qk = qkey_of(V, V.rneig[x]);
                int o = korb[tk];
                if (o < 0 || loc[qk] < 0 || loc[tk] < 0 || korb[qk] != o) { ok = false; break; }
                if (OKMASK[o][(size_t)loc[qk] * keys[o].size() + loc[tk]] == 0ULL) ok = false;
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
    if (!PAIRFILTER || std::getenv("EU_NOFILTER")) { PAIRFILTER = false; return; }
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
    if (shard_d2 > 1)
        std::cerr << "shard " << shard_w << "/" << shard_n << ": roots " << shard_w1 << "/" << shard_n1
                  << ", root-branches " << shard_w2 << "/" << shard_d2 << "\n";
    detect_edge_types();          // no-op on the runtime path, which already ran it after loading
    for (int c = 0; c < (int)CLASS_SIGMA.size(); c++)
        if (CLASS_SIGMA[c] != c) { SIGMA_TRIVIAL = false; break; }
    if (!SIGMA_TRIVIAL)
        std::cerr << "sided classes: sigma is not the identity on this alphabet\n";
    symbolcount = mainlist.size();
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
    // BUCKET_OK is now REPORTING ONLY: it says whether the admissible (A,B) pair happens to be unique,
    // i.e. whether qkeys() will return 1 everywhere and the union degenerates to the single bucket the
    // engine used before 2026-08-08. Nothing branches on it any more; the union handles both cases.
    BUCKET_OK = true;
    for (int c = 0; c < NCLS && BUCKET_OK; c++)
        if (CLASS_PREV[c] != CLASS_NEXT[c] || CLASS_NEXT[CLASS_NEXT[c]] != c) BUCKET_OK = false;
    // EU_NOBUCKET — diagnostic: turn the whole stack off (face filter, pair filter, dynamic filter,
    // candidate bucketing) and scan every type at every node. Only ever removes optimizations, so it
    // cannot lose a tiling; it prices the stack on any palette. Measured on isotox-cx45-z24, see
    // experiments/results/period3-palette-2026-08-07.md.
    // ⚑ FLAT-CORNER PALETTES GET NO FILTERS. A corner of exactly D/2 units (180°) is a degenerate
    // boundary position — the scaled/doubled construction's "s-1 flat corners per side", and every
    // polyomino corner that is not a real turn. It sits at a 2-VALENT vertex, and the face-closure
    // model the three filters share does not describe those: measured 2026-08-08 on tetromino, the
    // static filter called 68,038 of 68,370 vertex types impossible and the k=1 catalog fell from 76
    // to 20 — 56 real tilings deleted, silently. regular-scaled-123 lost 4 of 222 the same way.
    //
    // This was invisible until today for the same reason the dyn_build bug was: BUCKET_OK is false on
    // every flat-corner palette (their periods exceed 2), so the filters had never once run against
    // one. The 4-bucket union switched them on and the unsoundness surfaced immediately.
    //
    // The CANDIDATE INDEX is unaffected and stays on — it is a necessary-condition prune straight out
    // of checkface's first step, with no closure model in it, and it is where the speedup lives
    // anyway (EU_NOFILTER=1, i.e. bucketing only, reproduces the old 76 on tetromino exactly).
    bool has_flat = false;
    for (int c = 0; c < NCLS && !has_flat; c++) if (CLASS_UNITS[c] * 2 == TABLE_D) has_flat = true;
    if (std::getenv("EU_NOBUCKET")) {
        TYPE_OK.assign(mainlist.size(), 1);
        PAIRFILTER = false;
    } else if (has_flat) {
        TYPE_OK.assign(mainlist.size(), 1);
        PAIRFILTER = false;
        std::cerr << "filters: DISABLED — palette has flat 180° corners, whose 2-valent vertices the "
                     "face-closure model does not describe (candidate index stays on)\n";
    } else {
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
                e.nqf = qkeys_of(V, V.rneig[rrep], e.qf);
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
    if (eu_trace) {
        int filecount = 1;
        gen.open(filepath + genfile + std::to_string(filecount) + ".txt");
    }
    initex();
    if (eu_trace) gen.close();
    // DFS node count: one per extend() call, i.e. every partial configuration the search expanded.
    // Needed to price isomorph-free generation. The duplication table counts emitted LEAVES (raw
    // blocks / kept blocks = 3.84x at k=8), but canonical augmentation pays a canonicity test at
    // every NODE, so the break-even is a ratio of per-node costs, not of leaf counts. STDERR only —
    // the catalog is on stdout and in out/*.txt, so this cannot perturb a digest.
    std::cerr << "nodes: " << solcount
              << "  simplify_calls: " << simplify_calls
              << "  simplify_true: " << simplify_true << "\n";
    if (max_nc > 0)
        std::cerr << "note: up to " << max_nc << " dent-fill (noncounting) vertices per configuration; "
                  << "no cap is applied.\n";
    if (nckzero > 0) {
        std::cerr << "note: " << nckzero << " closed all-noncounting configuration(s) "
                  << "suppressed (no true vertex; not tilings by the Myers convention).\n";
    }
    return 0;
}