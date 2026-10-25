// tilesearch: run Marek Čtrnáct's tiling engine on a board file (docs/searcher/board-format.md).
//
// Each of his pt_*.exe is the engine plus a main() that hard-codes one board and calls
// find_and_write_tilings. This is that main() once, reading the board from a text file. It builds the
// same arguments his mains build and runs his search, with two changes to how the run is organised
// (not to what it finds; see search and Fingerprints):
//   - progress is checkpointed per root vertex, so a stopped run resumes with the roots it had not finished;
//   - duplicates are recognised by a 128-bit fingerprint of the canonical form, not the form itself.
//
// usage: tilesearch <board> [--k <kmin> <kmax>] [--threads <n>] [--nice <n>] [--resume] [--gzip] [--progress] [--dump]
//   --gzip writes the certificate files as .txt.gz (each one a run of gzip members; zcat reads it whole).
//   --resume continues a stopped run in this folder (the board must be the same).
//   --progress prints `progress <seconds> <total> <k>:<count>...` twice a second and `roots <done> <all>`
//   at every root boundary (read by the app).
//   --dump prints the engine arguments the board compiles to and exits (the parser's test hook).
#include <sys/resource.h>
#include <zlib.h>
#include <atomic>
#include <memory>
#include <condition_variable>
#include <functional>
#include <deque>
#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <map>
#include <mutex>
#include <regex>
#include <set>
#include <sstream>
#include <thread>
#include <vector>

#include "face_types.h"
#include "solutions_processor.h"
#include "tiling_extender.h"

using namespace tilings;
namespace fs = std::filesystem;

struct Board {
    std::string name;
    int kmin = 0, kmax = 0;
    std::vector<std::vector<int>> faces, apeirogons, vertices;
    bool permutations = false;
    std::vector<int> initial;              // 0-based vertex lines, empty = all
    std::vector<std::string> normalized;   // the board as run: no comments, single spaces
    std::map<std::string, int> codes;      // symbol -> corner code
};

[[noreturn]] static void fail(int line, std::string const& msg) {
    std::cerr << "board line " << line << ": " << msg << "\n";
    std::exit(2);
}

// Marek's labels keep his encoding, so certificates and file names match his binaries: Pi is the 180°
// corner (code 0), an optional letter of SMLABCDEFG plus a number or "oo" is encode_corner(number,
// letter) with no letter as 0. Any other symbol gets a free code that prints as X<n>; symbols.txt maps it
// back. A bare "oo" encodes to 0 like Pi, so declaring both is refused as a collision.
static int corner_code(std::string const& sym, int& next_x) {
    static const std::regex marek("([SMLABCDEFG]?)([1-9][0-9]*|oo)");
    std::smatch m;
    if (sym == "Pi") return 0;
    if (std::regex_match(sym, m, marek)) {
        int number = m[2] == "oo" ? 0 : std::stoi(m[2]);
        if (number > 0xffff) return -1;
        return encode_corner(number, m[1].length() ? int(std::string("SMLABCDEFG").find(m[1].str()[0])) + 1 : 0, 0);
    }
    return encode_corner(next_x++, N_ANGLE_LABELS + 1, 0);
}

static Board read_board(std::string const& path) {
    std::ifstream in(path);
    if (!in) { std::cerr << "cannot open " << path << "\n"; std::exit(2); }
    Board b;
    int next_x = 1, lineno = 0;
    bool has_k = false;
    std::string raw;
    auto word = [&](std::vector<std::string> const& t, size_t from, size_t to) {
        std::vector<int> w;
        for (size_t i = from; i < to; i++) {
            auto it = b.codes.find(t[i]);
            if (it == b.codes.end()) fail(lineno, "symbol '" + t[i] + "' has no angle line");
            w.push_back(it->second);
        }
        if (w.empty()) fail(lineno, "empty word");
        return w;
    };
    while (std::getline(in, raw)) {
        lineno++;
        std::istringstream ss(raw.substr(0, raw.find('#')));
        std::vector<std::string> t;
        for (std::string s; ss >> s;) t.push_back(s);
        if (t.empty()) continue;
        std::string norm = t[0];
        for (size_t i = 1; i < t.size(); i++) norm += " " + t[i];
        b.normalized.push_back(norm);
        auto const& kw = t[0];
        if (kw == "name" && t.size() == 2) b.name = t[1];
        else if (kw == "k" && t.size() == 3) {
            b.kmin = std::atoi(t[1].c_str()), b.kmax = std::atoi(t[2].c_str()), has_k = true;
            if (b.kmin < 1 || b.kmax < b.kmin || b.kmax > 128) fail(lineno, "k needs 1 <= kmin <= kmax <= 128");
        }
        else if (kw == "angle" && (t.size() == 2 || t.size() == 3)) {
            if (t[1] == "x" || b.codes.count(t[1])) fail(lineno, "symbol '" + t[1] + "' declared twice or reserved");
            int c = corner_code(t[1], next_x);
            if (c < 0) fail(lineno, "label number too large");
            for (auto const& [s, other] : b.codes)
                if (other == c) fail(lineno, "'" + t[1] + "' and '" + s + "' encode to the same corner");
            b.codes[t[1]] = c;   // the value is read by geometry checks, which are not built yet
        }
        else if (kw == "face" && t.size() >= 2) {
            auto x = std::find(t.begin(), t.end(), "x");
            size_t end = x - t.begin();
            std::string mult = x == t.end() ? "1" : (x + 2 == t.end() ? *(x + 1) : "");
            auto w = word(t, 1, end);
            if (mult == "inf") b.apeirogons.push_back(w);
            else {
                int m = std::atoi(mult.c_str());
                if (m < 1 || std::to_string(m) != mult) fail(lineno, "face multiplier must be a positive integer or inf");
                std::vector<int> f;
                for (int i = 0; i < m; i++) f.insert(f.end(), w.begin(), w.end());
                b.faces.push_back(f);
            }
        }
        else if (kw == "vertex" && t.size() >= 2) b.vertices.push_back(word(t, 1, t.size()));
        else if (kw == "permutations" && t.size() == 2 && (t[1] == "yes" || t[1] == "no")) b.permutations = t[1] == "yes";
        else if (kw == "initial" && t.size() >= 2) {
            if (t.size() == 2 && t[1] == "all") continue;
            for (size_t i = 1; i < t.size(); i++) {
                int v = std::atoi(t[i].c_str());
                if (std::to_string(v) != t[i] || v < 1) fail(lineno, "initial takes vertex numbers or 'all'");
                b.initial.push_back(v - 1);
            }
        }
        else if (kw == "search" && t.size() == 2) {
            if (t[1] != "vertices") fail(lineno, "search faces is not implemented yet");
        }
        else if (kw == "geometry" && t.size() == 2) {
            if (t[1] != "none") fail(lineno, "geometry checks are not implemented yet");
        }
        else fail(lineno, "cannot read '" + norm + "'");
    }
    if (b.name.empty() || !has_k || b.faces.empty() && b.apeirogons.empty() || b.vertices.empty())
        fail(lineno, "a board needs name, k, at least one face and at least one vertex");
    std::sort(b.initial.begin(), b.initial.end());
    b.initial.erase(std::unique(b.initial.begin(), b.initial.end()), b.initial.end());
    for (int v : b.initial)
        if (v >= (int)b.vertices.size()) fail(lineno, "initial names vertex " + std::to_string(v + 1) + ", which does not exist");
    return b;
}

// Marek's tracker keeps every canonical form for the whole run: about 1 KB per tiling at k=3 of
// hybrid_2_9830, which fills 24 GB after ~20M tilings (experiments/results/searcher-memory-2026-10-25.md).
// This keeps two independent 64-bit hashes of the form instead, ~40 bytes per tiling. Two different
// tilings collide with probability about N^2 / 2^129: below 1e-20 for a billion tilings.
struct Fingerprints {
    struct Key { uint64_t a, b; bool operator==(Key const& o) const { return a == o.a && b == o.b; } };
    static uint64_t mix(uint64_t x) {   // murmur3 fmix64, a bijection
        x ^= x >> 33; x *= 0xff51afd7ed558ccdULL; x ^= x >> 33; x *= 0xc4ceb9fe1a85ec53ULL; return x ^ (x >> 33);
    }
    static Key of(std::vector<uint32_t> const& form) {
        uint64_t a = 0x9e3779b97f4a7c15ULL ^ form.size(), b = 0x2545f4914f6cdd1dULL + form.size();
        for (uint32_t w : form) a = mix(a ^ w), b = mix(b + w * 0x100000001b3ULL);
        return { a, b | 1 };   // b is never 0, so {0, 0} can mark an empty slot
    }
    // Open addressing in 16 shards, each with its own lock: 16 bytes per key at most 70% full, no
    // allocation per key, and threads finding tilings of one root rarely wait for each other.
    struct Shard { std::mutex m; std::vector<Key> slots; size_t used = 0; };
    Shard shard[16];
    bool first_time(Key k) {
        Shard& s = shard[k.b >> 60];
        std::lock_guard<std::mutex> lock(s.m);
        if ((s.used + 1) * 10 > s.slots.size() * 7) {
            std::vector<Key> old(std::max<size_t>(64, s.slots.size() * 2), Key{ 0, 0 });
            old.swap(s.slots);
            for (Key const& e : old) if (e.b) place(s, e);
        }
        size_t const mask = s.slots.size() - 1;
        for (size_t i = k.a & mask;; i = (i + 1) & mask) {
            if (!s.slots[i].b) { s.slots[i] = k; s.used++; return true; }
            if (s.slots[i] == k) return false;
        }
    }
    static void place(Shard& s, Key k) {
        size_t const mask = s.slots.size() - 1;
        size_t i = k.a & mask;
        while (s.slots[i].b) i = (i + 1) & mask;
        s.slots[i] = k;
    }
};

// canonical_form_if_minimal (tiling_properties.h): the same refinement, sort for sort, and the same
// test (the tiling is dropped when two half-edges stay in one class, i.e. it covers a smaller quotient),
// with buffers kept per thread. His version allocated three vectors for every complete tiling,
// duplicates included, and allocation was the largest cost on output-heavy boards.
static bool fingerprint_if_minimal(tiling_t const& t, Fingerprints::Key& key) {
    using Row = std::pair<std::array<uint32_t, 5>, uint32_t>;
    thread_local std::vector<uint32_t> eq, form, ranks;
    thread_local std::vector<Row> data;
    thread_local std::vector<std::pair<uint64_t, uint32_t>> packed;
    int const n = t.num_halfedges();
    // Labels are replaced by their ranks: the sort below sees the same order, so it makes the same classes.
    ranks.clear();
    for (int i = 0; i < n; i++) ranks.push_back(t.left_label(index_t{ i }));
    std::sort(ranks.begin(), ranks.end());
    ranks.erase(std::unique(ranks.begin(), ranks.end()), ranks.end());
    eq.resize(n);
    for (int i = 0; i < n; i++) eq[i] = uint32_t(std::lower_bound(ranks.begin(), ranks.end(), (uint32_t)t.left_label(index_t{ i })) - ranks.begin());
    // Every entry is now below n, so while n^5 fits in 64 bits a row packs into one number that sorts
    // exactly as the 5-tuple does (n <= 7131); larger tilings sort the tuples.
    bool const pack = n <= 7131;
    int classes = 1, last = 0;
    while (classes > last) {
        last = classes;
        if (pack) {
            packed.resize(n);
            for (int i = 0; i < n; i++) {
                index_t ix{ i };
                uint64_t k = eq[i];
                k = k * n + eq[t.opposite(ix).value];
                k = k * n + eq[t.left_neighbour(ix).value];
                k = k * n + eq[t.right_neighbour(ix).value];
                k = k * n + eq[t.mirror(ix).value];
                packed[i] = { k, (uint32_t)i };
            }
            std::sort(packed.begin(), packed.end());
            eq[packed[0].second] = 0;
            classes = 1;
            for (int i = 1; i < n; i++) {
                if (packed[i].first != packed[i - 1].first) classes++;
                eq[packed[i].second] = classes - 1;
            }
        } else {
            data.resize(n);
            for (int i = 0; i < n; i++) {
                index_t ix{ i };
                data[i] = { { eq[i], eq[t.opposite(ix).value], eq[t.left_neighbour(ix).value], eq[t.right_neighbour(ix).value],
                              eq[t.mirror(ix).value] }, (uint32_t)i };
            }
            std::sort(data.begin(), data.end());
            eq[data[0].second] = 0;
            classes = 1;
            for (int i = 1; i < n; i++) {
                if (data[i].first != data[i - 1].first) classes++;
                eq[data[i].second] = classes - 1;
            }
        }
    }
    if (classes != n) return false;
    form.resize(4 * n);
    for (int i = 0; i < n; i++) {
        index_t ix{ i };
        uint32_t* f = &form[4 * eq[i]];
        f[0] = eq[t.opposite(ix).value], f[1] = eq[t.mirror(ix).value], f[2] = eq[t.left_neighbour(ix).value], f[3] = t.left_label(ix);
    }
    key = Fingerprints::of(form);
    return true;
}

// is_orientable (tiling_properties.h): the same flood fill from half-edge 0 over left, right and opposite
// links, true when it misses a half-edge; with a reused stack and epoch-stamped marks, no allocation.
static bool orientable(tiling_t const& t) {
    thread_local std::vector<uint32_t> mark;
    thread_local std::vector<int> stack;
    thread_local uint32_t epoch = 0;
    int const n = t.num_halfedges();
    if ((int)mark.size() < n) mark.resize(n, 0);
    if (++epoch == 0) std::fill(mark.begin(), mark.end(), 0), epoch = 1;
    stack.assign(1, 0);
    mark[0] = epoch;
    int reached = 1;
    while (!stack.empty()) {
        index_t ix{ stack.back() };
        stack.pop_back();
        for (index_t nb : { t.right_neighbour(ix), t.left_neighbour(ix), t.opposite(ix) })
            if (nb.has_value() && mark[nb.value] != epoch) mark[nb.value] = epoch, reached++, stack.push_back(nb.value);
    }
    return reached < n;
}

// One root vertex's share of the search. The search never adds a vertex type below its root, so root r
// finds exactly the tilings whose lowest vertex type is r: roots partition the output, and each can be
// deduplicated, written and checkpointed on its own while all of them share one thread pool.
// What one thread has found for one root since it last handed over: tilings are batched per thread and
// handed to the root once per task, not once per tiling (that lock was the largest wait on squares_edges).
struct Batch {
    int root = -1;
    std::map<std::string, std::string> out;
    std::map<int, size_t> counts;
    size_t bytes = 0;
};
static thread_local Batch batch;

struct Root {
    Fingerprints seen;
    std::atomic<int> tasks{ 1 };         // queued or running subtrees; 0 means the root is finished
    std::mutex mutex;                    // guards counts and buffered output
    std::map<int, size_t> counts;
    std::map<std::string, std::string> out;
    size_t buffered = 0;
};

// Counters for the end-of-run statistics, kept per thread and summed when a worker exits.
static std::atomic<uint64_t> total_nodes{ 0 }, total_complete{ 0 };
static thread_local uint64_t my_nodes = 0, my_complete = 0;
// Hand-off depth in edges below a task's start; 2 measured best across the bench boards. TILESEARCH_SPLIT overrides it.
static int split_depth = 2;

// A LIFO task stack like jtg::thread_pool's, plus atomic counts of queued tasks and of idle threads, so
// a running search can ask "is anyone waiting for work?" without taking the lock.
class Pool {
    std::mutex m;
    std::condition_variable work, all_done;
    std::vector<std::function<void()>> stack;
    std::atomic<int> queued{ 0 }, idle{ 0 };
    int busy = 0;
    bool stop = false;
public:
    bool hungry() const { return idle.load(std::memory_order_relaxed) > queued.load(std::memory_order_relaxed); }
    void push(std::function<void()> f) {
        { std::lock_guard<std::mutex> l(m); stack.push_back(std::move(f)); queued++; }
        work.notify_one();
    }
    void run(int n) {   // returns when every task, including the ones tasks pushed, has finished
        std::vector<std::thread> threads;
        for (int i = 0; i < n; i++) threads.emplace_back([this] {
            for (;;) {
                std::function<void()> f;
                {
                    std::unique_lock<std::mutex> l(m);
                    idle++;
                    work.wait(l, [&] { return stop || !stack.empty(); });
                    idle--;
                    if (stack.empty()) break;
                    f = std::move(stack.back());
                    stack.pop_back();
                    queued--;
                    busy++;
                }
                f();
                std::lock_guard<std::mutex> l(m);
                if (--busy == 0 && stack.empty()) all_done.notify_all();
            }
            total_nodes += my_nodes;
            total_complete += my_complete;
        });
        {
            std::unique_lock<std::mutex> l(m);
            all_done.wait(l, [&] { return busy == 0 && stack.empty(); });
            stop = true;
        }
        work.notify_all();
        for (auto& t : threads) t.join();
    }
};

// GenericFaceChecker (face_types.h), giving the same answer to every call, without its costs: it tested
// adjacency with std::find over a std::set, built a std::vector for every face it walked (twice per
// glue), and tried every offset of every face word. Here adjacency is a bit matrix, the walk reuses one
// buffer per thread, and matching starts only at offsets that carry the segment's first letter (every
// other offset fails on that letter, in both directions). TILESEARCH_CROSSCHECK=1 runs both checkers on
// every call and aborts on the first disagreement.
struct FastFaces {
    std::vector<cyclic_word_with_symmetries> words;
    std::vector<int> letters;                              // sorted distinct labels of the face words
    std::vector<uint64_t> adj;                             // adjacency bits, rows of `stride` words
    std::vector<std::vector<std::pair<int, int>>> starts;  // per letter id: (word, offset) carrying it
    int stride = 0;
    // id(): a perfect hash of the letters, found at startup (one multiply and one compare per lookup;
    // the binary search it replaces ran four times per glue attempt).
    std::vector<int> slot_code, slot_id;
    uint32_t mul = 0;
    int shift = 0;

    FastFaces(std::vector<std::vector<int>> const& faces, std::vector<std::vector<int>> const& apeirogons) {
        for (auto const& f : faces) words.push_back(cyclic_word_with_symmetries{ f }.maximal_symmetry());
        for (auto const& a : apeirogons) words.push_back(cyclic_word_with_symmetries{ a, 0 }.maximal_symmetry());
        for (auto const& w : words)
            for (int i = 0; i < w.rotational_generator(); i++) letters.push_back(w.letter(i));
        std::sort(letters.begin(), letters.end());
        letters.erase(std::unique(letters.begin(), letters.end()), letters.end());
        for (int bits = 3;; bits++) {
            if ((1u << bits) < 2 * letters.size()) continue;
            shift = 32 - bits;
            for (uint32_t m = 0x9e3779b1u, tries = 0; tries < 10000 && !mul; m += 2, tries++) {
                slot_code.assign(1u << bits, -1);
                bool clash = false;
                for (size_t i = 0; i < letters.size() && !clash; i++) {
                    uint32_t h = (uint32_t)letters[i] * m >> shift;
                    clash = slot_code[h] != -1;
                    slot_code[h] = letters[i];
                }
                if (!clash) mul = m;
            }
            if (mul) break;
        }
        slot_id.assign(slot_code.size(), -1);
        for (size_t i = 0; i < letters.size(); i++) slot_id[(uint32_t)letters[i] * mul >> shift] = (int)i;
        stride = ((int)letters.size() + 63) / 64;
        adj.assign(letters.size() * stride, 0);
        starts.resize(letters.size());
        auto set = [&](int a, int b) { adj[a * stride + b / 64] |= 1ULL << (b % 64); };
        for (int wi = 0; wi < (int)words.size(); wi++)
            for (int i = 0; i < words[wi].rotational_generator(); i++) {
                int a = id(words[wi].letter(i)), b = id(words[wi].letter(i + 1));
                set(a, b), set(b, a);
                starts[a].push_back({ wi, i });
            }
    }
    int id(int c) const {
        uint32_t h = (uint32_t)c * mul >> shift;
        return slot_code[h] == c ? slot_id[h] : -1;
    }
    bool can_be_adjacent(corner_t c1, corner_t c2) const {
        int a = id(c1), b = id(c2);
        return a >= 0 && b >= 0 && (adj[a * stride + b / 64] >> (b % 64) & 1);
    }
    bool check_adjacent_cw_face(tiling_t const& conf, index_t ix) const {
        counterclockwise_corner<tiling_t> c{ conf, ix };
        auto const [n, is_loop] = advance_to_back_or_loop(c, c.end());
        (void)n;
        thread_local std::vector<int> seg;
        seg.clear();
        index_t const start = c.back;
        for (index_t h = start;;) {   // GenericFaceChecker::get_cw_face
            seg.push_back(conf.right_label(h));
            if (conf.is_free(h)) break;
            h = conf.cw_step(h);
            if (h == start) break;
        }
        int const s0 = id(seg[0]), q = (int)seg.size();
        if (s0 < 0) return false;
        for (auto [wi, p] : starts[s0]) {   // cyclic_word_lookuptable::find_quotient / find_partial_quotient
            auto const& w = words[wi];
            if (is_loop ? (w.size() % q != 0 || q % w.rotational_generator() != 0) : (w.size() > 0 && q > w.size())) continue;
            bool fwd = true, rev = true;
            for (int i = 1; i < q && fwd; i++) fwd = seg[i] == w.letter(p + i);
            if (fwd) return true;
            for (int i = 1; i < q && rev; i++) rev = seg[i] == w.letter(p - i);
            if (rev) return true;
        }
        return false;
    }
    bool check_adjacent_ccw_face(tiling_t const& conf, index_t ix) const { return check_adjacent_cw_face(conf, conf.mirror(ix)); }
    int edges_needed_to_complete(tiling_t const& conf, index_t ix) const {
        index_t it = conf.right_neighbour(ix);
        int len = 0;
        while (!conf.is_free(it)) it = conf.ccw_step(it), len++;
        return -len;
    }
};

struct CrossCheck {
    GenericFaceChecker slow;
    FastFaces fast;
    CrossCheck(std::vector<std::vector<int>> const& faces, std::vector<std::vector<int>> const& apeirogons) : fast(faces, apeirogons) {
        for (auto const& f : faces) slow.add_face(f);
        for (auto const& a : apeirogons) slow.add_apeirogon(a);
    }
    template<class T> static T same(T a, T b, char const* what) {
        if (a != b) { std::cerr << "CROSSCHECK: " << what << " differs\n"; std::abort(); }
        return a;
    }
    bool can_be_adjacent(corner_t a, corner_t b) const { return same(slow.can_be_adjacent(a, b), fast.can_be_adjacent(a, b), "can_be_adjacent"); }
    bool check_adjacent_cw_face(tiling_t const& c, index_t i) const { return same(slow.check_adjacent_cw_face(c, i), fast.check_adjacent_cw_face(c, i), "cw face"); }
    bool check_adjacent_ccw_face(tiling_t const& c, index_t i) const { return same(slow.check_adjacent_ccw_face(c, i), fast.check_adjacent_ccw_face(c, i), "ccw face"); }
    int edges_needed_to_complete(tiling_t const& c, index_t i) const { return same(slow.edges_needed_to_complete(c, i), fast.edges_needed_to_complete(c, i), "edges needed"); }
};

// The tiling's half-edge vector, reached legally through a pointer to its protected member.
struct HalfedgesOf : tiling_t { static constexpr auto member = &HalfedgesOf::m_halfedges; };

// Which (vertex template, representative half-edge) pairs can glue to a free half-edge at all, by the
// two tests try_joining applies before it touches the tiling: same mirror type, and both corner pairs
// adjacent in some face word. Keyed by the free half-edge's mirror type and the ids of its two corner
// labels; each list is in the order tiling_extender visits pairs (template ascending, then offset).
struct Candidates {
    struct Pair { int t, i; };
    std::vector<std::vector<Pair>> lists;
    int nl = 0;
    template<class Faces>
    Candidates(vertex_classification const& vc, Faces const& faces, FastFaces const& ids) : nl((int)ids.letters.size()) {
        lists.resize(4 * (nl + 1) * (nl + 1));
        for (int t = 0; t < vc.count(); t++) {
            tiling_t one;
            vc.push_vertex_to(one, t);
            for (int i = 0; i < vc.valence_of(t); i++) {
                if (!vc.is_representative_of_orbit(t, i)) continue;
                index_t h{ i };
                for (int key = 0; key < (int)lists.size(); key++) {
                    auto [hm, im, l1, r1] = unkey(key);
                    if (l1 == nl || r1 == nl) continue;   // a label in no face word glues to nothing
                    bool compatible = hm == one.mirror(h).has_value() && im == one.is_mirror(h);
                    if (compatible && faces.can_be_adjacent(ids.letters[l1], one.right_label(h)) &&
                        faces.can_be_adjacent(ids.letters[r1], one.left_label(h)))
                        lists[key].push_back({ t, i });
                }
            }
        }
    }
    std::array<int, 4> unkey(int key) const { int n = nl + 1; return { key / (2 * n * n), key / (n * n) % 2, key / n % n, key % n }; }
    std::vector<Pair> const& at(tiling_t const& conf, index_t f, FastFaces const& ids) const {
        auto lid = [&](int c) { int x = ids.id(c); return x < 0 ? nl : x; };
        int n = nl + 1;
        return lists[((conf.mirror(f).has_value() ? 1 : 0) * 2 + (conf.is_mirror(f) ? 1 : 0)) * n * n
                     + lid(conf.left_label(f)) * n + lid(conf.right_label(f))];
    }
};

// tiling_extender (tiling_extender.h): the same search, glue for glue, with two costs removed.
//  - Adding a vertex visits only the pairs Candidates lists for the free half-edge. His loop pushed every
//    template above the root and let try_joining reject it; the pairs skipped are exactly the ones
//    try_joining rejects before touching the tiling.
//  - push_vertex_from reserves exactly size + valence, so every push reallocated the whole half-edge
//    vector. Capacity now grows geometrically first, which turns that reserve into a no-op.
template<class Faces, class FI, class FS>
struct Extender {
    tiling_t conf;
    Faces const* faces;
    FastFaces const* ids;
    vertex_classification const* vc;
    Candidates const* cand;
    FI iteration;
    FS solution;
    size_t num_iterations = 0, max_num_vertices = 0, num_vertices_added = 0;
    int first_vertex = 0;
    size_t task_nodes = 0;   // nodes this task has visited
    int base_edges = 0;      // edges when this task started

    void add_vertex(int t) {
        auto& h = conf.*HalfedgesOf::member;
        size_t need = h.size() + vc->valence_of(t);
        if (h.capacity() < need) h.reserve(std::max(2 * h.capacity(), need));
        num_vertices_added++;
        vc->push_vertex_to(conf, t);
    }
    void remove_last_vertex() { num_vertices_added--; conf.pop_vertex(); }

    index_t choose_best_halfedge() const {
        index_t best{};
        int least = std::numeric_limits<int>::max();
        for (auto ix : conf.indices()) {
            if (!conf.is_free(ix)) continue;
            int const r = faces->edges_needed_to_complete(conf, ix);
            if (r < least) best = ix, least = r;
        }
        return best;
    }
    void extend() {
        num_iterations++;
        task_nodes++;
        if (!iteration(*this)) return;
        index_t const f = choose_best_halfedge();
        if (!f.has_value()) { solution(*this); return; }
        for (auto ix : conf.indices())
            if (conf.is_free(ix)) try_joining(f, ix);
        if (num_vertices_added < max_num_vertices) extend_by_adding_vertex(f);
    }
    void extend_by_adding_vertex(index_t f) {
        auto const& list = cand->at(conf, f, *ids);
        auto it = std::lower_bound(list.begin(), list.end(), first_vertex, [](Candidates::Pair p, int t) { return p.t < t; });
        while (it != list.end()) {
            int const t = it->t, base = conf.num_halfedges();
            add_vertex(t);
            for (; it != list.end() && it->t == t; ++it) try_joining(f, index_t{ base + it->i });
            remove_last_vertex();
        }
    }
    void try_joining(index_t a, index_t b) {
        if (!conf.halfedges_compatible(a, b)) return;
        if (!faces->can_be_adjacent(conf.left_label(a), conf.right_label(b)) ||
            !faces->can_be_adjacent(conf.right_label(a), conf.left_label(b))) return;
        conf.add_edge(a, b);
        if (faces->check_adjacent_cw_face(conf, a) && faces->check_adjacent_ccw_face(conf, a)) extend();
        conf.remove_edge(a, b);
    }
};

// for_each_tiling_threaded (tiling_extender.h) with every root counted, so the caller learns when each
// one finishes. on_tiling(r, conf), on_task_end() and on_root_done(r) run on worker threads.
template<class FaceType, class FT, class FE, class FD>
static void search(std::vector<int> const& roots, int kmax, vertex_classification const& vc, FaceType const& faces,
                   FastFaces const& ids, int threads, std::vector<std::unique_ptr<Root>>& state, FT on_tiling, FE on_task_end,
                   FD on_root_done) {
    Pool pool;
    Candidates const cand(vc, faces, ids);
    // A task hands over its output before its root's count drops, so a root that reaches 0 has all of it.
    auto finish = [&](int r) { on_task_end(); if (--state[r]->tasks == 0) on_root_done(r); };
    for (int r : roots) {
        Extender s{ tiling_t{}, &faces, &ids, &vc, &cand,
            [&](auto const& s) {
                // Give this node's subtree away only when a thread is waiting for work, and only near the top
                // of this task's own subtree, where the work is (his engine gave away whatever node it was at,
                // every 10 nodes while 64 tasks were not yet queued: mostly small deep subtrees, handed back and
                // forth through the lock). Never at a task's first node, or a task would only pass itself on.
                my_nodes++;
                if (s.task_nodes < 2 || !pool.hungry() || s.conf.num_edges() - s.base_edges > split_depth) return true;
                auto clone{ s };
                clone.task_nodes = 0;
                clone.base_edges = clone.conf.num_edges();
                state[clone.first_vertex]->tasks++;
                pool.push([clone, &finish]() mutable { clone.extend(); finish(clone.first_vertex); });
                return false;
            },
            [&](auto const& s) { my_complete++; on_tiling(s.first_vertex, s.conf); } };
        s.add_vertex(r);
        s.first_vertex = r;
        s.max_num_vertices = kmax;
        pool.push([s, &finish]() mutable { s.extend(); finish(s.first_vertex); });
    }
    pool.run(threads);
}

int main(int argc, char** argv) {
    char const* usage = "usage: tilesearch <board> [--k <kmin> <kmax>] [--threads <n>] [--nice <n>] [--resume] [--gzip] [--progress] [--dump]\n";
    if (argc < 2) { std::cerr << usage; return 2; }
    Board b = read_board(argv[1]);
    int threads = std::max(1u, std::thread::hardware_concurrency()), nice = 0;
    bool dump = false, progress = false, resume = false, gzip = false;
    for (int i = 2; i < argc; i++) {
        std::string a = argv[i];
        if (a == "--k" && i + 2 < argc) b.kmin = std::atoi(argv[++i]), b.kmax = std::atoi(argv[++i]);
        else if (a == "--threads" && i + 1 < argc) threads = std::max(1, std::atoi(argv[++i]));
        else if (a == "--nice" && i + 1 < argc) nice = std::atoi(argv[++i]);
        else if (a == "--dump") dump = true;
        else if (a == "--progress") progress = true;
        else if (a == "--resume") resume = true;
        else if (a == "--gzip") gzip = true;
        else { std::cerr << "unknown argument " << a << "\n" << usage; return 2; }
    }
    if (b.kmin < 1 || b.kmax < b.kmin || b.kmax > 128) { std::cerr << "--k needs 1 <= kmin <= kmax <= 128\n"; return 2; }
    if (nice) setpriority(PRIO_PROCESS, 0, nice);   // before any thread exists, so all of them inherit it
    if (char const* t = std::getenv("TILESEARCH_SPLIT")) split_depth = std::atoi(t);

    // `initial` lists the vertices a tiling must contain one of. The engine seeds only from the first n
    // vertex lines and never adds a lower one, which finds exactly the tilings containing one of those
    // n, so the listed lines go first (as tiling_search::set_specifications does).
    std::vector<std::vector<int>> order;
    for (int v : b.initial) order.push_back(b.vertices[v]);
    for (int v = 0; v < (int)b.vertices.size(); v++)
        if (!std::binary_search(b.initial.begin(), b.initial.end(), v)) order.push_back(b.vertices[v]);
    int n_initial = b.initial.empty() ? (int)order.size() : (int)b.initial.size();

    if (dump) {
        auto list = [](char const* tag, std::vector<std::vector<int>> const& ws) {
            for (auto const& w : ws) {
                std::cout << tag;
                for (int c : w) std::cout << " " << c;
                std::cout << "\n";
            }
        };
        list("face", b.faces); list("apeirogon", b.apeirogons); list("vertex", order);
        std::cout << "permutations " << b.permutations << "\ninitial " << n_initial << "\n";
        return 0;
    }

    // Layout. solver_<name>/ holds the finished output, the board, roots.done (one line per finished
    // root with its counts) and, only while a root is being merged in, merge.pending. A root's output is
    // written under .part/ first and appended to the real files when the root completes, so a stop
    // never leaves half a root in them.
    fs::path const base = fs::absolute("."), dir = base / ("solver_" + b.name), part = base / ".part";
    fs::path const done_file = dir / "roots.done", pending_file = dir / "merge.pending";
    std::ostringstream board_text;
    for (auto const& l : b.normalized)
        board_text << (l.rfind("k ", 0) == 0 ? "k " + std::to_string(b.kmin) + " " + std::to_string(b.kmax) : l) << "\n";
    std::set<int> done;
    std::array<std::atomic<uint64_t>, 129> per_k{};   // tilings per k: finished roots plus the running ones
    if (fs::exists(dir) && !fs::is_empty(dir)) {
        if (!resume) { std::cerr << dir << " is not empty: pass --resume to continue it, or move it away\n"; return 2; }
        std::ifstream old(dir / "board.txt");
        std::string was((std::istreambuf_iterator<char>(old)), std::istreambuf_iterator<char>());
        if (was != board_text.str()) { std::cerr << "cannot resume: " << dir / "board.txt" << " is a different board\n"; return 2; }
        gzip = fs::exists(dir / "gzip");
        std::ifstream df(done_file);
        for (std::string line; std::getline(df, line);) {
            std::istringstream ls(line);
            int r; ls >> r; done.insert(r);
            for (std::string kv; ls >> kv;) per_k[std::stoi(kv)] += std::stoull(kv.substr(kv.find(':') + 1));
        }
        // A merge cut short: the files it was appending to go back to their recorded sizes, unless
        // the root reached roots.done, in which case the merge had finished.
        if (std::ifstream pf{ pending_file }) {
            int r; pf >> r;
            if (!done.count(r))
                for (long long size; pf >> size;) {
                    std::string name; pf.get(); std::getline(pf, name);
                    if (size < 0) fs::remove(dir / name); else fs::resize_file(dir / name, size);
                }
            fs::remove(pending_file);
        }
    } else {
        fs::create_directories(dir);
        std::ofstream(dir / "board.txt") << board_text.str();
        if (gzip) std::ofstream(dir / "gzip");   // the format of this run's certificates, read back by --resume
        std::ofstream f(dir / "symbols.txt");
        for (auto const& [s, c] : b.codes) {
            std::ostringstream printed;
            printed << corner_decoder{ c };
            if (printed.str() != s) f << printed.str() << " " << s << "\n";
        }
    }

    vertex_classification vc{};
    int roots = 0;
    for (int i = 0; i < (int)order.size(); i++) {
        int n = b.permutations ? vc.add_vertex_with_permutations(order[i]) : vc.add_vertex(order[i]);
        if (i < n_initial) roots += n;
    }
    original_tiling_writer writer{ vc };

    auto t0 = std::chrono::steady_clock::now();
    auto report = [&] {
        size_t total = 0;
        std::ostringstream ks;
        for (int k = 1; k <= b.kmax; k++)
            if (uint64_t n = per_k[k]) total += n, ks << " " << k << ":" << n;
        std::cout << "progress " << std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count()
                  << " " << total << ks.str() << std::endl;
    };
    std::mutex tick_mutex;
    std::condition_variable tick;
    bool searching = true;
    std::thread ticker([&] {
        std::unique_lock<std::mutex> lock(tick_mutex);
        while (progress && !tick.wait_for(lock, std::chrono::milliseconds(500), [&] { return !searching; })) report();
    });

    // Output: the file names solutions_processor::process builds, written per root under .part/<r>/ and
    // appended to the real files when the root finishes (merge.pending makes that append undoable).
    fs::remove_all(part);
    std::vector<int> todo;
    std::vector<std::unique_ptr<Root>> state(roots);
    for (int r = 0; r < roots; r++)
        if (!done.count(r)) todo.push_back(r), state[r] = std::make_unique<Root>(), fs::create_directories(part / std::to_string(r));
    auto spill = [&](int r, Root& st) {   // caller holds st.mutex
        for (auto& [name, text] : st.out) {
            if (!gzip) { std::ofstream(part / std::to_string(r) / name, std::ios::app | std::ios::binary) << text; continue; }
            // one gzip member per spill; level 1: this text compresses ~10x even so, and level 6 costs more time
            gzFile z = gzopen((part / std::to_string(r) / (name + ".gz")).c_str(), "ab1");
            gzwrite(z, text.data(), (unsigned)text.size());
            gzclose(z);
        }
        st.out.clear();
        st.buffered = 0;
    };
    if (progress) std::cout << "roots " << done.size() << " " << roots << std::endl;
    auto hand_over = [&] {   // this thread's batch, into its root's buffer
        if (batch.root < 0) return;
        Root& st = *state[batch.root];
        std::lock_guard<std::mutex> lock(st.mutex);
        for (auto const& [k, n] : batch.counts) st.counts[k] += n;
        for (auto& [file, text] : batch.out) st.out[file] += text;
        st.buffered += batch.bytes;
        if (st.buffered > (1 << 20)) spill(batch.root, st);
        batch = Batch{};
    };
    auto on_tiling = [&](int r, auto const& conf) {
        if (conf.num_vertices() < b.kmin) return;
        Root& st = *state[r];
        Fingerprints::Key key;
        if (!fingerprint_if_minimal(conf, key) || !st.seen.first_time(key)) return;
        // solutions_processor::process, with its streams and the std::set of corners kept per thread
        thread_local std::ostringstream name, text;
        thread_local std::vector<corner_t> corners;
        name.str(""), text.str("");
        corners.clear();
        for (auto ix : conf.indices()) corners.push_back(conf.label(ix));
        std::sort(corners.begin(), corners.end());
        corners.erase(std::unique(corners.begin(), corners.end()), corners.end());
        name << b.name << "solver_" << (conf.num_vertices() < 10 ? "0" : "") << conf.num_vertices() << "_" << std::hex;
        for (auto c : corners) name << corner_decoder{ c };
        name << std::dec << (orientable(conf) ? "_o" : "") << "_" << conf.num_edges() << "." << writer.extension();
        writer.write_content(text, conf);
        per_k[conf.num_vertices()]++;
        if (batch.root != r) hand_over();
        batch.root = r;
        batch.counts[conf.num_vertices()]++;
        batch.bytes += text.view().size();
        batch.out[name.str()] += text.view();
        if (batch.bytes > (1 << 18)) hand_over();
    };
    // Finished roots are merged by one thread of their own, in the order they finish: a worker that
    // finished a root used to do it under a lock, and the others queued behind it (~6% of hybrid_2_9830).
    std::mutex merge_mutex;
    std::condition_variable merge_cv;
    std::deque<int> merge_queue;
    bool merging = true;
    auto merge = [&](int r) {
            Root& st = *state[r];
            spill(r, st);
            std::vector<fs::path> files;
            for (auto const& e : fs::directory_iterator(part / std::to_string(r))) files.push_back(e.path());
            {
                std::ofstream pf(pending_file);
                pf << r << "\n";
                for (auto const& f : files)
                    pf << (fs::exists(dir / f.filename()) ? (long long)fs::file_size(dir / f.filename()) : -1LL) << " " << f.filename().string() << "\n";
            }
            for (auto const& f : files)
                std::ofstream(dir / f.filename(), std::ios::app | std::ios::binary) << std::ifstream(f, std::ios::binary).rdbuf();
            {
                std::ofstream df(done_file, std::ios::app);
                df << r;
                for (auto const& [k, n] : st.counts) df << " " << k << ":" << n;
                df << "\n";
            }
            fs::remove(pending_file);
            fs::remove_all(part / std::to_string(r));
            done.insert(r);
            state[r].reset();   // its fingerprints are no longer needed
            if (progress) std::cout << "roots " << done.size() << " " << roots << std::endl;
    };
    std::thread merger([&] {
        for (;;) {
            int r;
            {
                std::unique_lock<std::mutex> l(merge_mutex);
                merge_cv.wait(l, [&] { return !merge_queue.empty() || !merging; });
                if (merge_queue.empty()) return;
                r = merge_queue.front();
                merge_queue.pop_front();
            }
            merge(r);
        }
    });
    auto on_root_done = [&](int r) {
        { std::lock_guard<std::mutex> l(merge_mutex); merge_queue.push_back(r); }
        merge_cv.notify_one();
    };
    FastFaces const fast(b.faces, b.apeirogons);
    if (std::getenv("TILESEARCH_CROSSCHECK"))
        search(todo, b.kmax, vc, CrossCheck(b.faces, b.apeirogons), fast, threads, state, on_tiling, hand_over, on_root_done);
    else
        search(todo, b.kmax, vc, fast, fast, threads, state, on_tiling, hand_over, on_root_done);
    { std::lock_guard<std::mutex> l(merge_mutex); merging = false; }
    merge_cv.notify_one();
    merger.join();
    fs::remove_all(part);
    { std::lock_guard<std::mutex> lock(tick_mutex); searching = false; }
    tick.notify_all();
    ticker.join();
    if (progress) { std::cout << "roots " << done.size() << " " << roots << std::endl; report(); }
    double secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();

    size_t total = 0;
    std::ofstream census(dir / "census.txt");
    for (int k = b.kmin; k <= b.kmax; k++) census << "k=" << k << " -- " << per_k[k] << "\n", total += per_k[k];
    census << "MAX\n";
    std::cout << "\nFinished with " << total << " solutions after " << secs << "s.\n";
    std::cout << "stats nodes " << total_nodes << " complete " << total_complete << " unique " << total << "\n";
    return 0;
}
