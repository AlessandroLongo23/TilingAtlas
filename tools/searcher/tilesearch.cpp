// tilesearch: run Marek Čtrnáct's tiling engine on a board file (docs/searcher/board-format.md).
//
// Each of his pt_*.exe is the engine plus a main() that hard-codes one board and calls
// find_and_write_tilings. This is that main() once, reading the board from a text file. It builds the
// same arguments his mains build and runs his search, with two changes to how the run is organised
// (not to what it finds; see search and Fingerprints):
//   - progress is checkpointed per root vertex, and in a large run per unit of a root (UNIT_DEPTH), so a
//     stopped run resumes with the roots and units it had not finished;
//   - duplicates are recognised by a 128-bit fingerprint of the canonical form, not the form itself.
//
// usage: tilesearch <board> [--k <kmin> <kmax>] [--threads <n>] [--nice <n>] [--resume] [--gzip] [--progress] [--dump]
//                  [--first] [--seconds <s>] [--find] [--no-local-death] [--balance] [--prune-balance]
//   --gzip writes the certificate files as .txt.gz (each one a run of gzip members; zcat reads it whole).
//   --resume continues a stopped run in this folder (the board must be the same).
//   --progress prints `progress <seconds> <total> <k>:<count>... nodes <n>` twice a second (n: the nodes
//   visited so far, within 4096 per thread) with `active <r>:<units done>/<units>...` (the roots in hand, units
//   counted as the root's head finds them; one unit when the run has none), and `roots <done> <all> [<r>]` at
//   every root boundary, r the root just finished (read by the app).
//   Before the first root it prints `stage <name> <done> <all>`: `tables 0 0` while it builds its tables, then
//   `roots` (trying each required set as the start, when there are two or more) and `rank` (the root order),
//   counting root types.
//   --dump prints the engine arguments the board compiles to and exits (the parser's test hook).
//   --first writes the first tiling found and exits; --seconds <s> exits with status 4 past s seconds (with --progress).
//   --find looks for one tiling meeting every required set, by stepping stones (find.h); --seconds is then per k.
//   --balance prints, as one JSON line, the vertex types no periodic tiling can use (edge balance, balance.h) and exits.
//   --prune-balance leaves those out of the search, and per root the types that cannot share a tiling with it.
#include <random>
#include <sys/resource.h>
#include <zlib.h>
#include <atomic>
#include <climits>
#include <memory>
#include <condition_variable>
#include <functional>
#include <deque>
#include <algorithm>
#include <charconv>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <cerrno>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <map>
#include <mutex>
#include <regex>
#include <set>
#include <sstream>
#include <thread>
#include <unordered_map>
#include <numeric>
#include <utility>
#include <vector>

#include "face_types.h"
#include "solutions_processor.h"
#include "tiling_extender.h"

using namespace tilings;
namespace fs = std::filesystem;

static int const MAX_SETS = 64;   // required sets, initial counting as one: one bit each (Required)
static int const MAX_K = 254;     // Required::need counts the vertices still to add in a byte, 255 meaning none can
static bool chiral = false;       // `chiral yes`: only tilings with no reflection or glide reflection (Sides)

struct Board {
    std::string name;
    int kmin = 0, kmax = 0;
    std::vector<std::vector<int>> faces, apeirogons, vertices;
    bool permutations = false;
    bool chiral = false;                   // `chiral yes`: no reflection or glide reflection among its symmetries
    std::vector<int> initial;              // 0-based vertex lines, empty = all
    std::vector<std::vector<int>> require; // per `require` line: 0-based vertex lines, a tiling holds one of each
    // per `require face` line: its faces (each written out in full, an apeirogon as its period); a tiling holds one of them
    std::vector<std::vector<std::vector<int>>> require_faces;
    std::vector<std::vector<char>> require_faces_inf;   // per face of each line: an apeirogon (`x inf`)
    std::set<int> flat = { 0 };            // corners along a side, which run along many faces: Pi and the edge corners
    bool colors_labeled = false;           // `colors labeled`: all-A and all-B are two tilings
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
        for (std::string s; ss >> s;) {
            // in face, vertex and require lines, A3^2 is shorthand for A3 A3 (board.ts expands it the same way)
            auto c = s.find('^');
            bool power = !t.empty() && (t[0] == "face" || t[0] == "vertex" || t[0] == "require") && c != std::string::npos
                && c > 0 && c + 1 < s.size() && s[c + 1] != '0' && s.find_first_not_of("0123456789", c + 1) == std::string::npos
                && s.size() - c - 1 <= 4;
            if (!power) { t.push_back(s); continue; }
            for (int n = std::atoi(s.c_str() + c + 1); n > 0; n--) t.push_back(s.substr(0, c));
        }
        if (t.empty()) continue;
        std::string norm = t[0];
        for (size_t i = 1; i < t.size(); i++) norm += " " + t[i];
        b.normalized.push_back(norm);
        auto const& kw = t[0];
        if (kw == "name" && t.size() == 2) b.name = t[1];
        else if (kw == "k" && t.size() == 3) {
            b.kmin = std::atoi(t[1].c_str()), b.kmax = std::atoi(t[2].c_str()), has_k = true;
            if (b.kmin < 1 || b.kmax < b.kmin || b.kmax > MAX_K) fail(lineno, "k needs 1 <= kmin <= kmax <= " + std::to_string(MAX_K));
        }
        else if ((kw == "angle" && (t.size() == 2 || t.size() == 3)) || (kw == "edge" && t.size() >= 2)) {
            // `edge <sym> [length <L>] [drawn|hidden|bump|bite]`: the 180° corner at the midpoint of a side
            // of that edge type. To the search it is a corner like any other; the length and the style are
            // for drawing, and the vertex lines that pair edge corners are the gluing rule.
            for (size_t i = 2, styled = 0; kw == "edge" && i < t.size(); i++) {
                static const std::set<std::string> styles{ "drawn", "hidden", "bump", "bite" };
                if (t[i] == "length" && i + 1 < t.size()) i++;
                else if (!styles.count(t[i]) || styled++) fail(lineno, "edge takes 'length <L>' and one of drawn, hidden, bump, bite");
            }
            if (t[1] == "x" || b.codes.count(t[1])) fail(lineno, "symbol '" + t[1] + "' declared twice or reserved");
            int c = corner_code(t[1], next_x);
            if (c < 0) fail(lineno, "label number too large");
            for (auto const& [s, other] : b.codes)
                if (other == c) fail(lineno, "'" + t[1] + "' and '" + s + "' encode to the same corner");
            b.codes[t[1]] = c;   // the value is read by geometry checks, which are not built yet
            if (kw == "edge") b.flat.insert(c);
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
        else if (kw == "chiral" && t.size() == 2 && (t[1] == "yes" || t[1] == "no")) chiral = b.chiral = t[1] == "yes";
        else if (kw == "initial" && t.size() >= 2) {
            if (t.size() == 2 && t[1] == "all") continue;
            for (size_t i = 1; i < t.size(); i++) {
                int v = std::atoi(t[i].c_str());
                if (std::to_string(v) != t[i] || v < 1) fail(lineno, "initial takes vertex numbers or 'all'");
                b.initial.push_back(v - 1);
            }
        }
        else if (kw == "require" && t.size() >= 3 && t[1] == "face") {
            // require face a b c [x m] [| face d e f [x m] ...]: one of these faces, each up to turning and mirroring
            std::vector<std::vector<int>> alts;
            std::vector<char> inf;
            for (size_t i = 1; i < t.size();) {
                if (t[i] != "face") fail(lineno, "require face takes faces, each written 'face <corners> [x m]', separated by |");
                size_t e = i + 1;
                while (e < t.size() && t[e] != "|") e++;
                auto x = std::find(t.begin() + i + 1, t.begin() + e, "x");
                size_t end = x - t.begin();
                int m = 1;
                bool apeirogon = false;
                if (end < e) {
                    if (end + 2 != e) fail(lineno, "the repeat count follows x, and ends the face");
                    apeirogon = t[end + 1] == "inf";
                    m = apeirogon ? 1 : std::atoi(t[end + 1].c_str());
                    if (m < 1 || (!apeirogon && std::to_string(m) != t[end + 1]))
                        fail(lineno, "face multiplier must be a positive integer or inf");
                }
                auto w = word(t, i + 1, end);
                std::vector<int> full;
                for (int r = 0; r < m; r++) full.insert(full.end(), w.begin(), w.end());
                alts.push_back(full);
                inf.push_back(apeirogon);
                i = e + 1;
            }
            b.require_faces.push_back(alts);
            b.require_faces_inf.push_back(inf);
        }
        else if (kw == "require" && t.size() >= 2) {
            std::vector<int> set;
            for (size_t i = 1; i < t.size(); i++) {
                int v = std::atoi(t[i].c_str());
                if (std::to_string(v) != t[i] || v < 1) fail(lineno, "require takes vertex numbers");
                set.push_back(v - 1);
            }
            b.require.push_back(set);
        }
        else if (kw == "colors" && t.size() == 2 && (t[1] == "labeled" || t[1] == "unlabeled")) b.colors_labeled = t[1] == "labeled";
        else if (kw == "search" && t.size() == 2) {
            if (t[1] != "vertices") fail(lineno, "search faces is not implemented yet");
        }
        else if (kw == "geometry" && t.size() == 2) {
            if (t[1] != "none") fail(lineno, "geometry checks are not implemented yet");
        }
        else if (kw == "optional" || kw == "subsets" || kw == "vary")
            fail(lineno, "'" + kw + "' belongs to a study board, which The Tiling Searcher runs as a study: one board per row");
        else fail(lineno, "cannot read '" + norm + "'");
    }
    if (b.name.empty() || !has_k || b.faces.empty() && b.apeirogons.empty() || b.vertices.empty())
        fail(lineno, "a board needs name, k, at least one face and at least one vertex");
    std::sort(b.initial.begin(), b.initial.end());
    b.initial.erase(std::unique(b.initial.begin(), b.initial.end()), b.initial.end());
    for (int v : b.initial)
        if (v >= (int)b.vertices.size()) fail(lineno, "initial names vertex " + std::to_string(v + 1) + ", which does not exist");
    for (auto& set : b.require) {
        std::sort(set.begin(), set.end());
        set.erase(std::unique(set.begin(), set.end()), set.end());
        for (int v : set)
            if (v >= (int)b.vertices.size()) fail(lineno, "require names vertex " + std::to_string(v + 1) + ", which does not exist");
    }
    if (b.require.size() + !b.initial.empty() > MAX_SETS && !b.require.empty())
        fail(lineno, "at most 64 required sets, initial counting as one");
    return b;
}

// ── required faces (`require face`): checked on each finished tiling ──
//
// A closed tiling's face, walked as the face checker walks it (right label, then cw step until it is back),
// is the quotient of the face's word: its labels repeated round the face give the word, up to turning and
// mirroring. An apeirogon's ring in the quotient goes round its period some number of times, so there the
// period repeated gives the ring. A tiling passes when every `require face` line has one of its faces among them.
static bool same_cycle(std::vector<int> const& seg, std::vector<int> const& w) {
    size_t q = seg.size(), n = w.size();
    if (!q || n % q) return false;
    for (size_t s = 0; s < n; s++)
        for (int dir : { 1, -1 }) {
            size_t i = 0;
            for (; i < n; i++)
                if (seg[i % q] != w[(s + n + dir * (long)i) % n]) break;
            if (i == n) return true;
        }
    return false;
}
template<class Conf> static bool holds_required_faces(std::vector<std::vector<std::vector<int>>> const& req,
                                                      std::vector<std::vector<char>> const& inf, Conf const& conf) {
    if (req.empty()) return true;
    thread_local std::vector<std::vector<int>> faces;
    thread_local std::vector<int> seg;
    faces.clear();
    std::set<int> seen;
    for (auto ix : conf.indices()) {
        if (seen.count(ix.value)) continue;
        seg.clear();
        for (auto h = ix;;) {
            seen.insert(h.value);
            seg.push_back(conf.right_label(h));
            h = conf.cw_step(h);
            if (h == ix || seg.size() > 4096) break;
        }
        faces.push_back(seg);
    }
    for (size_t r = 0; r < req.size(); r++) {
        auto const& alts = req[r];
        bool hit = false;
        for (size_t i = 0; i < alts.size() && !hit; i++)
            for (size_t j = 0; j < faces.size() && !hit; j++)
                hit = inf[r][i] ? same_cycle(alts[i], faces[j]) : same_cycle(faces[j], alts[i]);
        if (!hit) return false;
    }
    return true;
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

// THE VERTEX FIGURE IN THE MINIMALITY TEST (2026-11-09). A tiling is written only when its configuration covers no smaller
// one, and the test refines a colouring of the half-edges; its seed was the corner label alone. A covering keeps every
// half-edge at the same vertex, so the vertex's whole figure (its word, round the vertex) is an invariant too, and labels
// do not imply it: on a board of one polygon at vertices of two degrees every label is the same, the refinement stays
// one class, and every tiling read as a covering. hyp-k2 at k = 2 lost 1,319 of 52,450 tilings that way, among them all
// 584 by hexagons at vertices of degree 5 and 6 (a Delaney-Dress census gives the same 584; eu_solver fixed its seed the
// same way on 2026-08-20, eu_solver.cpp's MINIMALITY note). The stored half-edges are folded by each vertex's rotations,
// so the structure cannot tell those vertices apart either: the figure also goes into the canonical form, or two such
// tilings could share a key.
// The figure is the vertex type's word with colours read away (`<base>@<letter>` as `<base>`), up to rotation and
// reflection, so a recolouring keeps it. The label seed is tried first and the figure added only when that leaves
// classes, so a tiling the label seed already settles is numbered as before; its form gains the figures after its old
// entries, so forms order as before wherever they differed. Runs begun before engine mark 5 resume without it.
static thread_local std::vector<int> const* cur_types = nullptr;   // the leaf's vertex types, set before on_tiling
static std::vector<uint32_t> type_fig;   // per vertex type of the run's classification: its figure's number
static bool figures_on = true;           // off for a run resumed from before mark 5
static bool figures() { return figures_on && !type_fig.empty() && cur_types != nullptr; }
static uint32_t figure_of(tiling_t const& t, index_t ix) { return type_fig[(*cur_types)[t.neighbourhood(ix).vertex_ix]]; }

// canonical_form_if_minimal (tiling_properties.h): the same refinement, sort for sort, and the same
// test (the tiling is dropped when two half-edges stay in one class, i.e. it covers a smaller quotient),
// with buffers kept per thread. His version allocated three vectors for every complete tiling,
// duplicates included, and allocation was the largest cost on output-heavy boards.
// The canonical form itself, with every label read through `lab` (a recolouring; null reads them as they
// are). False when the tiling covers a smaller quotient, which no relabelling changes.
// figs: 0 the label seed; 1 the label seed, and the figures appended to the form; 2 the figure and label seed, appended.
static bool canonical_form_global(tiling_t const& t, std::unordered_map<int, int> const* lab, std::vector<uint32_t>& form, int figs = 0) {
    using Row = std::pair<std::array<uint32_t, 5>, uint32_t>;
    thread_local std::vector<uint32_t> eq;
    thread_local std::vector<uint64_t> ranks;
    auto label = [&](index_t ix) -> uint32_t {
        int c = t.left_label(ix);
        if (lab) if (auto it = lab->find(c); it != lab->end()) c = it->second;
        return (uint32_t)c;
    };
    thread_local std::vector<Row> data;
    thread_local std::vector<std::pair<uint64_t, uint32_t>> packed;
    int const n = t.num_halfedges();
    // Labels are replaced by their ranks: the sort below sees the same order, so it makes the same classes.
    auto seed = [&](index_t ix) -> uint64_t { return figs == 2 ? uint64_t(figure_of(t, ix)) << 32 | label(ix) : label(ix); };
    ranks.clear();
    for (int i = 0; i < n; i++) ranks.push_back(seed(index_t{ i }));
    std::sort(ranks.begin(), ranks.end());
    ranks.erase(std::unique(ranks.begin(), ranks.end()), ranks.end());
    eq.resize(n);
    for (int i = 0; i < n; i++) eq[i] = uint32_t(std::lower_bound(ranks.begin(), ranks.end(), seed(index_t{ i })) - ranks.begin());
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
    form.resize(figs ? 5 * n : 4 * n);
    for (int i = 0; i < n; i++) {
        index_t ix{ i };
        uint32_t* f = &form[4 * eq[i]];
        f[0] = eq[t.opposite(ix).value], f[1] = eq[t.mirror(ix).value], f[2] = eq[t.left_neighbour(ix).value], f[3] = label(ix);
        if (figs) form[4 * n + eq[i]] = figure_of(t, ix);
    }
    return true;
}

// figs: 0 the label seed; 1 the label seed, and the figures appended to the form; 2 the figure and label seed, appended.
// When the label seed leaves classes, fig_split says whether one of them holds two figures. If none does, the figure seed
// ends in the same classes (they already respect it), so the second refinement would only confirm the covering.
static thread_local bool fig_split = false;
static bool canonical_form_classes(tiling_t const& t, std::unordered_map<int, int> const* lab, std::vector<uint32_t>& form, int figs = 0) {
    using Row = std::pair<std::array<uint32_t, 5>, uint32_t>;
    thread_local std::vector<uint32_t> eq;
    thread_local std::vector<uint64_t> ranks;
    auto label = [&](index_t ix) -> uint32_t {
        int c = t.left_label(ix);
        if (lab) if (auto it = lab->find(c); it != lab->end()) c = it->second;
        return (uint32_t)c;
    };
    thread_local std::vector<Row> data;
    thread_local std::vector<std::pair<uint64_t, uint32_t>> packed;
    int const n = t.num_halfedges();
    // Labels are replaced by their ranks: the sort below sees the same order, so it makes the same classes.
    auto seed = [&](index_t ix) -> uint64_t { return figs == 2 ? uint64_t(figure_of(t, ix)) << 32 | label(ix) : label(ix); };
    ranks.clear();
    for (int i = 0; i < n; i++) ranks.push_back(seed(index_t{ i }));
    std::sort(ranks.begin(), ranks.end());
    ranks.erase(std::unique(ranks.begin(), ranks.end()), ranks.end());
    eq.resize(n);
    for (int i = 0; i < n; i++) eq[i] = uint32_t(std::lower_bound(ranks.begin(), ranks.end(), seed(index_t{ i })) - ranks.begin());
    // Every entry is now below n, so while n^5 fits in 64 bits a row packs into one number that sorts
    // exactly as the 5-tuple does (n <= 7131); larger tilings sort the tuples.
    //
    // Each round sorts only inside the classes of the round before (2026-11-06). The global sort ordered rows by
    // their first entry, the half-edge's own class, so it only ever reordered half-edges within one class, ties by
    // index; sorting each class of two or more on its own, singletons left in place, gives the same order and the
    // same dense numbering, so forms and fingerprints are unchanged. TILESEARCH_CHECK_CANON=1 runs the global sort
    // beside it on every call and aborts on any difference.
    bool const pack = n <= 7131;
    int classes = 1, last = 0;
    if (pack) {
        thread_local std::vector<uint32_t> ord, cnt;
        thread_local std::vector<int> cell_end;   // cell_end[p]: one past the class starting at position p
        ord.resize(n), cell_end.assign(n, 0), packed.resize(n);
        cnt.assign(n + 1, 0);   // the half-edges by label rank, ties by index (ranks are below n: a counting sort)
        for (int i = 0; i < n; i++) cnt[eq[i] + 1]++;
        for (int r = 0; r < n; r++) cnt[r + 1] += cnt[r];
        for (int i = 0; i < n; i++) ord[cnt[eq[i]]++] = (uint32_t)i;
        for (int p = 0; p < n; ) {
            int q = p + 1;
            while (q < n && eq[ord[q]] == eq[ord[p]]) q++;
            cell_end[p] = q, p = q;
        }
        classes = 0;   // dense class numbers in this order, as the global sort's ranks
        for (int p = 0; p < n; p = cell_end[p]) { for (int j = p; j < cell_end[p]; j++) eq[ord[j]] = (uint32_t)classes; classes++; }
        while (classes > last) {
            last = classes;
            for (int p = 0; p < n; p = cell_end[p]) {   // every key from this round's numbers, then sort each class
                int const e = cell_end[p];
                if (e - p == 1) continue;
                for (int j = p; j < e; j++) {
                    index_t ix{ (int)ord[j] };
                    uint64_t k = eq[ord[j]];
                    k = k * n + eq[t.opposite(ix).value];
                    k = k * n + eq[t.left_neighbour(ix).value];
                    k = k * n + eq[t.right_neighbour(ix).value];
                    k = k * n + eq[t.mirror(ix).value];
                    packed[j] = { k, ord[j] };
                }
                std::sort(packed.begin() + p, packed.begin() + e);
            }
            classes = 0;   // split where the key changes, renumber densely in order
            for (int p = 0; p < n; ) {
                int const e = cell_end[p];
                if (e - p == 1) { eq[ord[p]] = (uint32_t)classes++; p = e; continue; }
                int a = p;
                for (int j = p; j < e; j++) {
                    ord[j] = packed[j].second;
                    if (j > p && packed[j].first != packed[j - 1].first) { cell_end[a] = j; a = j; classes++; }
                    eq[ord[j]] = (uint32_t)classes;
                }
                cell_end[a] = e;
                classes++;
                p = e;
            }
        }
    } else {
        while (classes > last) {
            last = classes;
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
    if (classes != n) {
        if (figs == 1) {
            thread_local std::vector<int64_t> fig_of_class;
            fig_of_class.assign(classes, -1);
            fig_split = false;
            for (int i = 0; i < n && !fig_split; i++) {
                int64_t const f = figure_of(t, index_t{ i });
                if (fig_of_class[eq[i]] < 0) fig_of_class[eq[i]] = f;
                else fig_split = fig_of_class[eq[i]] != f;
            }
        }
        return false;
    }
    form.resize(figs ? 5 * n : 4 * n);
    for (int i = 0; i < n; i++) {
        index_t ix{ i };
        uint32_t* f = &form[4 * eq[i]];
        f[0] = eq[t.opposite(ix).value], f[1] = eq[t.mirror(ix).value], f[2] = eq[t.left_neighbour(ix).value], f[3] = label(ix);
        if (figs) form[4 * n + eq[i]] = figure_of(t, ix);
    }
    return true;
}

static bool const check_canon = std::getenv("TILESEARCH_CHECK_CANON") != nullptr;
static bool canonical_form(tiling_t const& t, std::unordered_map<int, int> const* lab, std::vector<uint32_t>& form) {
    int figs = figures() ? 1 : 0;
    bool r = canonical_form_classes(t, lab, form, figs);
    if (!r && figs && fig_split) r = canonical_form_classes(t, lab, form, figs = 2);
    if (check_canon) {
        thread_local std::vector<uint32_t> g;
        if (canonical_form_global(t, lab, g, figs) != r || (r && g != form)) {
            std::cerr << "TILESEARCH_CHECK_CANON: the class-wise sort and the global sort disagree (" << t.num_halfedges() << " half-edges)\n";
            std::abort();
        }
    }
    return r;
}

// ── colourings up to permuting the colours (`colors unlabeled`, the default on a coloured board) ──
//
// A coloured corner is `<base>@<letter>` (A4@B). Each permutation of the board's colour letters that maps
// the board onto itself (faces, vertices, initial and the required sets, as sets) relabels corner codes.
// A tiling is written only when no such recolouring gives a smaller canonical form, so of the tilings
// that differ only by their colours exactly one, the least, survives. That needs no memory shared between
// roots, which matters: the recolourings of a tiling can have different least vertex types, so they are
// found from different roots and the per-root dedup never sees them together.
static std::vector<std::unordered_map<int, int>> recolorings;
// COLOUR CLASSES BY KEY (2026-11-06). A colour class's representative is the member with the least key: (1) its least
// vertex type, (2) its signature vector, (3) its canonical form. A colour letter's signature counts the half-edges of
// each base corner that carry it. The recolourings form a group, so exactly one member of each class passes.
//   - Leaf test: per recolouring, the recoloured least type and signature vector are compared first (cheap); only the
//     recolourings tying on both get a canonical form.
//   - Colour cut: the least type is the search's root and types only get added, so a vertex whose recoloured type is
//     below the root type kills the node (its type is skipped), and a root some recolouring maps below itself is not
//     searched.
// recolor_letters: per recolouring, its letter map. sig_slot: per corner code, letter * nbase + base, or -1 when it has
// no colour. recolor_type[r][t]: type t recoloured by r, matched on templates (see the table's build after classify).
// TILESEARCH_COLOR_SIG=0 turns all of it off, TILESEARCH_COLOR_CUT=0 the cut only; TILESEARCH_CLASSKEY=1 makes TILESEARCH_KEYS
// write each tiling's old class key (its least canonical form over all recolourings), to compare builds.
static std::vector<std::array<int, 8>> recolor_letters;
static std::vector<int> sig_slot;
static int sig_nbase = 0;
static std::vector<std::vector<int>> recolor_type;
static std::vector<int> recolor_min_type;          // least recoloured type, per type
static void const* cut_vc = nullptr;               // the classification the tables index (the run's, not a probe's)
static bool color_sig = !std::getenv("TILESEARCH_COLOR_SIG") || std::string(std::getenv("TILESEARCH_COLOR_SIG")) != "0";
static bool const class_key_dump = std::getenv("TILESEARCH_CLASSKEY") != nullptr;

/** A word's key: the least of its rotations and mirror images, or its sorted letters when `multiset`. */
static std::vector<int> word_key(std::vector<int> w, bool multiset) {
    if (multiset) { std::sort(w.begin(), w.end()); return w; }
    std::vector<int> best = w;
    for (int dir = 0; dir < 2; dir++, std::reverse(w.begin(), w.end()))
        for (size_t i = 0; i < w.size(); i++) {
            std::rotate(w.begin(), w.begin() + 1, w.end());
            best = std::min(best, w);
        }
    return best;
}

static void find_recolorings(Board const& b) {
    recolorings.clear();
    recolor_letters.clear();
    sig_slot.clear();
    sig_nbase = 0;
    if (b.colors_labeled) return;
    static const std::regex colored_re("(.+)@([A-H])");
    std::map<int, std::pair<std::string, int>> colored;   // code -> (base, letter)
    std::map<std::pair<std::string, int>, int> code_of;
    std::set<int> used;
    for (auto const& [sym, c] : b.codes) {
        std::smatch m;
        if (!std::regex_match(sym, m, colored_re)) continue;
        int L = m[2].str()[0] - 'A';
        colored[c] = { m[1].str(), L };
        code_of[{ m[1].str(), L }] = c;
        used.insert(L);
    }
    if (used.size() < 2 || used.size() > 6) return;   // 6! = 720 recolourings at most
    {
        std::map<std::string, int> base_ix;
        int maxc = 0;
        for (auto const& [c, bl] : colored) { base_ix.emplace(bl.first, (int)base_ix.size()); maxc = std::max(maxc, c); }
        sig_nbase = (int)base_ix.size();
        sig_slot.assign(maxc + 1, -1);
        for (auto const& [c, bl] : colored) if (c >= 0) sig_slot[c] = bl.second * sig_nbase + base_ix[bl.first];
    }
    std::vector<int> letters(used.begin(), used.end()), perm = letters;
    auto keys = [&](std::vector<std::vector<int>> const& ws, bool multiset, std::unordered_map<int, int> const* lab) {
        std::set<std::vector<int>> out;
        for (auto w : ws) {
            if (lab) for (auto& c : w) if (auto it = lab->find(c); it != lab->end()) c = it->second;
            out.insert(word_key(w, multiset));
        }
        return out;
    };
    auto pick = [&](std::vector<int> const& idx) {
        std::vector<std::vector<int>> ws;
        for (int i : idx) ws.push_back(b.vertices[i]);
        return ws;
    };
    // what a recolouring must map onto itself, as sets of words
    auto image = [&](std::unordered_map<int, int> const* lab) {
        std::vector<std::set<std::vector<int>>> parts{ keys(b.faces, false, lab), keys(b.apeirogons, false, lab),
                                                        keys(b.vertices, b.permutations, lab), keys(pick(b.initial), b.permutations, lab) };
        std::set<std::set<std::vector<int>>> req, reqf;
        for (auto const& r : b.require) req.insert(keys(pick(r), b.permutations, lab));
        for (auto const& r : b.require_faces) reqf.insert(keys(r, false, lab));
        return std::make_tuple(parts, req, reqf);
    };
    auto const same = image(nullptr);
    do {
        if (perm == letters) continue;
        std::unordered_map<int, int> lab;
        bool ok = true;
        for (auto const& [c, bl] : colored) {
            int to = perm[std::find(letters.begin(), letters.end(), bl.second) - letters.begin()];
            auto it = code_of.find({ bl.first, to });
            if (it == code_of.end()) { ok = false; break; }
            lab[c] = it->second;
        }
        if (ok && image(&lab) == same) {
            recolorings.push_back(lab);
            std::array<int, 8> lm;
            for (int L = 0; L < 8; L++) lm[L] = L;
            for (size_t i = 0; i < letters.size(); i++) lm[letters[i]] = perm[i];
            recolor_letters.push_back(lm);
        }
    } while (std::next_permutation(perm.begin(), perm.end()));
}

// ── coverings, rejected by congruence closure (eu_solver's congruence.hpp, 2026-11-06) ──
// A complete tiling is connected and opposite, left, right and mirror permute its half-edges, so the classes
// canonical_form refines to are a block system with blocks of one size: it covers a smaller quotient iff the
// anchor half-edge a shares its class with some b of the same label, iff the union-find closure of (a, b) under
// the four links never merges two labels (that closure lies inside any congruence holding the pair). A wrong b
// fails within a few steps, where the refinement runs to its end. Exact, so it only decides the coverings early;
// a half-edge without a mirror (which canonical_form reads as index -1) leaves the verdict to canonical_form.
// TILESEARCH_CONGRUENCE=0 turns it off.
static bool const congruence_test = !std::getenv("TILESEARCH_CONGRUENCE") || std::string(std::getenv("TILESEARCH_CONGRUENCE")) != "0";
static bool covers_quotient(tiling_t const& t) {
    int const n = t.num_halfedges();
    thread_local std::vector<int> par, touched;
    thread_local std::vector<std::pair<int, int>> work;
    for (int i = (int)par.size(); i < n; i++) par.push_back(i);
    auto lab = [&](int x) { return t.left_label(index_t{ x }); };
    auto find = [&](int x) { while (par[x] != x) par[x] = par[par[x]], x = par[x]; return x; };
    for (int i = 0; i < n; i++)
        if (!t.mirror(index_t{ i }).has_value()) return false;   // canonical_form decides these
    int const a = 0, la = lab(0);   // any anchor gives the same verdict
    bool const figs = figures();   // and the vertex figure, which a covering keeps as it keeps the label
    for (int b = 1; b < n; b++) {
        if (lab(b) != la || (figs && figure_of(t, index_t{ b }) != figure_of(t, index_t{ a }))) continue;
        bool ok = true;
        work.assign(1, { a, b });
        while (ok && !work.empty()) {
            auto const [u, v] = work.back();
            work.pop_back();
            int const x = find(u), y = find(v);
            if (x == y) continue;
            if (lab(x) != lab(y) || (figs && figure_of(t, index_t{ x }) != figure_of(t, index_t{ y }))) { ok = false; break; }
            par[y] = x, touched.push_back(y);
            index_t const iu{ u }, iv{ v };
            index_t const mu = t.mirror(iu), mv = t.mirror(iv);
            work.push_back({ t.opposite(iu).value, t.opposite(iv).value });
            work.push_back({ t.left_neighbour(iu).value, t.left_neighbour(iv).value });
            work.push_back({ t.right_neighbour(iu).value, t.right_neighbour(iv).value });
            work.push_back({ mu.value, mv.value });
        }
        for (int x : touched) par[x] = x;
        touched.clear();
        if (ok) return true;
    }
    return false;
}

// The run's own test: as fingerprint_if_minimal, but a key already seen is dropped before the recolourings are
// tried (they decide the same way for every copy of a tiling, so the first copy settled it). Colour boards ran up to
// 720 refinements per duplicate. TILESEARCH_EARLY_SEEN=0 turns it off.
static bool const early_seen = !std::getenv("TILESEARCH_EARLY_SEEN") || std::string(std::getenv("TILESEARCH_EARLY_SEEN")) != "0";
static bool const check_force = std::getenv("TILESEARCH_CHECK_FORCE") != nullptr;
template<class Seen> static bool new_minimal(tiling_t const& t, Fingerprints::Key& key, Seen& seen) {
    thread_local std::vector<uint32_t> form, other;
    // Which test first: the union-find decides a covering in a few steps but is wasted on a minimal tiling, whose
    // refinement runs anyway for its key. Per thread, the observed covering rate picks the order (both give the
    // same verdict): union-find first while coverings are at least 30% of leaves (regular boards: 55-85%), the
    // refinement first below that (bubble, colours: 1-5%).
    thread_local uint32_t n_leaves = 0, n_covers = 0;
    thread_local bool uf_first = true;
    auto covered = [&] { n_covers++; return false; };
    if (++n_leaves == 1024) uf_first = n_covers * 10 >= n_leaves * 3, n_leaves /= 2, n_covers /= 2;
    if (congruence_test && uf_first && covers_quotient(t)) return covered();
    if (!canonical_form(t, nullptr, form)) return covered();
    key = Fingerprints::of(form);
    if (early_seen && !seen.first_time(key)) return false;
    if (color_sig && !recolorings.empty()) {
        thread_local std::vector<int> sig, ties;
        int const nb = sig_nbase, n = t.num_halfedges();
        sig.assign(8 * nb, 0);
        for (int i = 0; i < n; i++) {
            int const c = t.left_label(index_t{ i });
            if (c >= 0 && c < (int)sig_slot.size() && sig_slot[c] >= 0) sig[sig_slot[c]]++;
        }
        ties.clear();
        bool const cut = cut_vc != nullptr && cur_types != nullptr && !cur_types->empty();
        int const t0 = cut ? (*cur_types)[0] : 0;
        for (size_t r = 0; r < recolorings.size(); r++) {
            if (cut) {   // first key: the recoloured tiling's least type, never below t0 once the cut ran
                int m = INT_MAX;
                for (int ty : *cur_types) m = std::min(m, recolor_type[r][ty]);
                if (m < t0) return false;
                if (m > t0) continue;
            }
            // second key: recolouring by letter map p moves letter L's signature to p(L)
            auto const& lm = recolor_letters[r];
            int inv[8];
            for (int L = 0; L < 8; L++) inv[lm[L]] = L;
            int cmp = 0;
            for (int j = 0; j < 8 && cmp == 0; j++)
                for (int q = 0; q < nb; q++) {
                    int const x = sig[inv[j] * nb + q], y = sig[j * nb + q];
                    if (x != y) { cmp = x < y ? -1 : 1; break; }
                }
            if (cmp < 0) return false;
            if (cmp == 0) ties.push_back((int)r);
        }
        for (int r : ties) {   // third key: the canonical form, only for the recolourings tying on both
            canonical_form(t, &recolorings[r], other);
            if (other < form) return false;
        }
        bool const fresh = early_seen || seen.first_time(key);   // by the tiling's own key, before any debug swap
        if (fresh && class_key_dump) {
            thread_local std::vector<uint32_t> best;
            best = form;
            for (auto const& lab : recolorings) { canonical_form(t, &lab, other); if (other < best) best = other; }
            key = Fingerprints::of(best);
        }
        return fresh;
    }
    for (auto const& lab : recolorings) {
        canonical_form(t, &lab, other);
        if (other < form) return false;
    }
    return early_seen || seen.first_time(key);
}

static bool fingerprint_if_minimal(tiling_t const& t, Fingerprints::Key& key) {
    thread_local std::vector<uint32_t> form, other;
    if (congruence_test && covers_quotient(t)) return false;
    if (!canonical_form(t, nullptr, form)) return false;
    for (auto const& lab : recolorings) {
        canonical_form(t, &lab, other);
        if (other < form) return false;   // a recolouring is the representative
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

// ── the certificate text: original_tiling_writer::write_content (tiling_writer.cpp), byte for byte ──
// Written into a reused string instead of an ostream, numbers by to_chars (it was 29-61% of the search thread on
// the output-heavy boards, 2026-11-07). A vertex's symbol is the lookup the writer makes (lookup_vertex_type_index
// on the vertex's word, which does not tell axis classes apart), made once per vertex type of the search and kept:
// the vertex holds that type's template, so its word is the same every time. TILESEARCH_FAST_WRITER=0 writes with
// Marek's writer; TILESEARCH_CHECK_WRITER=1 writes with both and aborts at the first difference.
static bool const fast_writer = !std::getenv("TILESEARCH_FAST_WRITER") || std::string(std::getenv("TILESEARCH_FAST_WRITER")) != "0";
static bool const check_writer = std::getenv("TILESEARCH_CHECK_WRITER") != nullptr;
static void put_int(std::string& out, int v) { char b[16]; out.append(b, std::to_chars(b, b + sizeof b, v).ptr); }
struct StrOut { std::string& s; };   // what corner_decoder's operator<< writes to
static StrOut& operator<<(StrOut& o, char const* x) { o.s += x; return o; }
static StrOut& operator<<(StrOut& o, char x) { o.s += x; return o; }
static StrOut& operator<<(StrOut& o, int x) { put_int(o.s, x); return o; }
// conway_representation_t: the half-edge's place in its vertex (its mirror's, starred), the vertex as primes to 3, @n after
struct ConwayRep { bool mirrored; int ix, v; };
static ConwayRep conway_rep(tiling_t const& t, index_t ix) {
    auto const& n = t.neighbourhood(ix);
    bool const m = !(ix <= n.mirror);
    return { m, (m ? n.mirror : ix) - n.vertex_start, n.vertex_ix };
}
static void put_rep(std::string& out, ConwayRep r, bool star) {
    if (star && r.mirrored) out += '*';
    put_int(out, r.ix);
    if (r.v > 3) out += '@', put_int(out, r.v);
    else out.append(r.v, '\'');
}
// for_each_vertex's orbit from the vertex's first half-edge, read as for_each_vertex_type reads it
static int vertex_symbol(tiling_t const& t, vertex_classification const& vc, index_t start) {
    index_t const mirror_start = t.mirror(start);
    std::optional<int> axis;
    std::vector<corner_t> corners;
    for (index_t ix = start;;) {
        if (ix == mirror_start) axis = (int)corners.size() + 1;
        corners.push_back(t.left_label(ix));
        if ((ix = t.right_neighbour(ix)) == start) break;
    }
    auto const r = vc.lookup_vertex_type_index(cyclic_word_with_symmetries{ corners, 1, axis });
    return r ? *r : -1;
}
static void write_certificate(std::string& out, tiling_t const& t, vertex_classification const& vc, std::vector<int> const* types) {
    thread_local std::vector<int> sym, by_type, sorted;   // each vertex's symbol; each search type's
    thread_local void const* by_type_vc = nullptr;
    if (by_type_vc != &vc) by_type.clear(), by_type_vc = &vc;
    sym.clear();
    for (auto ix : t.indices()) {
        auto const& n = t.neighbourhood(ix);
        if (n.vertex_start != ix) continue;
        int s;
        if (!types) s = vertex_symbol(t, vc, ix);
        else {
            int const ty = (*types)[n.vertex_ix];
            if (ty >= (int)by_type.size()) by_type.resize(ty + 1, -2);
            if (by_type[ty] == -2) by_type[ty] = vertex_symbol(t, vc, ix);
            s = by_type[ty];
        }
        if (s >= 0) sym.push_back(s);   // the writer skips a vertex its lookup misses
    }
    out += "Number of vertices: ", put_int(out, t.num_vertices()), out += '\n';
    for (size_t i = 0; i < sym.size(); i++) out += i ? ", " : "", out += vc.symbol_of(sym[i]);
    out += '\n';
    sorted = sym;
    std::sort(sorted.begin(), sorted.end());
    for (size_t i = 0, j; i < sorted.size(); i = j) {
        for (j = i; j < sorted.size() && sorted[j] == sorted[i]; j++) {}
        out += i ? ", " : "", out += vc.symbol_of(sorted[i]);
        if (j - i > 1) out += 'x', put_int(out, int(j - i));
    }
    out += '\n';
    for (auto ix : complete_edges_of(t)) {   // conwaysymbols
        ConwayRep const a = conway_rep(t, ix), b = conway_rep(t, t.opposite(ix));
        bool const flip = a.mirrored != b.mirrored;
        out += flip ? '[' : '(';
        put_rep(out, a, false);
        if (a.ix != b.ix || a.v != b.v) out += ' ', put_rep(out, b, false);
        out += flip ? ']' : ')';
    }
    out += '\n';
    StrOut so{ out };
    for (auto& face : faces_of(t)) {
        bool first = true;
        for (auto& c : face) {
            if (!first) out += " - ";
            put_rep(out, conway_rep(t, c.back), true);
            out += '/';
            put_rep(out, conway_rep(t, c.forward), true);
            out += '(';
            so << corner_decoder{ t.right_label(c.forward) };
            out += ')';
            first = false;
        }
        out += '\n';
    }
    out += "---\n\n";
}
// The certificate of t into out (replacing it): `types` is each vertex's search type, or null to look each one up
static void certificate(std::string& out, original_tiling_writer& writer, tiling_t const& t, vertex_classification const& vc,
                        std::vector<int> const* types) {
    out.clear();
    if (fast_writer && !check_writer) return write_certificate(out, t, vc, types);
    thread_local std::ostringstream os;
    os.str("");
    writer.write_content(os, t);
    if (!fast_writer) { out = os.view(); return; }
    write_certificate(out, t, vc, types);
    if (out != os.view()) {
        std::string const slow{ os.view() };
        size_t i = 0;
        while (i < out.size() && i < slow.size() && out[i] == slow[i]) i++;
        std::cerr << "TILESEARCH_CHECK_WRITER: the texts differ at byte " << i << "\n--- writer:\n" << slow << "--- fast:\n" << out;
        std::abort();
    }
}

// Every file the run writes is checked, and the first that fails ends it at once with exit code 5, naming the file.
// Unchecked, a full disk lost 26 of 3,4,6,12 k <= 13's 882 files while the run printed "Finished", wrote a whole
// census and exited 0 (2026-11-07). Ending before the next write keeps the unit or root that failed out of
// units.done and roots.done, so --resume searches it again (and the merge it was in is undone by merge.pending).
static int const WRITE_FAILED = 5;
[[noreturn]] static void io_failed(char const* what, fs::path const& file) {
    int const e = errno;
    std::cerr << "cannot " << what << " " << file.string() << ": " << (e ? std::strerror(e) : "failed") << std::endl;
    std::_Exit(WRITE_FAILED);
}
/** `text` written to `file` (opened with `mode`: std::ios::app to append), and closed: a write fails on the close too. */
static void write_file(fs::path const& file, std::string_view text, std::ios::openmode mode = {}) {
    std::ofstream f(file, mode | std::ios::out);
    f.write(text.data(), std::streamsize(text.size()));
    f.close();
    if (!f) io_failed("write", file);
}
static void make_dirs(fs::path const& dir) {
    std::error_code ec;
    fs::create_directories(dir, ec);
    if (ec) errno = ec.value(), io_failed("create", dir);
}
/** A file of lines that a failed append can have left half a line at the end of: cut back to its last whole line. */
static void drop_torn_line(fs::path const& file) {
    std::ifstream in(file, std::ios::binary);
    std::string s((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    in.close();
    if (s.empty() || s.back() == '\n') return;
    std::error_code ec;
    fs::resize_file(file, s.rfind('\n') + 1, ec);   // npos + 1 is 0: no whole line at all
    if (ec) errno = ec.value(), io_failed("write", file);
}

// from's bytes appended to to, a block at a time (`out << in.rdbuf()` moved them one character at a time: 2-18% of
// the CPU on the output boards, and the merge of the last root is the end of an 8-thread run)
static void append_file(fs::path const& from, fs::path const& to) {
    thread_local std::vector<char> buf(1 << 20);
    std::ifstream in(from, std::ios::binary);
    std::ofstream out(to, std::ios::app | std::ios::binary);
    while (in.read(buf.data(), (std::streamsize)buf.size()) || in.gcount() > 0) out.write(buf.data(), in.gcount());
    if (!in.eof()) io_failed("read", from);
    out.close();
    if (!out) io_failed("write", to);
}

// One root vertex's share of the search. The search never adds a vertex type below its root, so root r
// finds exactly the tilings whose lowest vertex type is r: roots partition the output, and each can be
// deduplicated, written and checkpointed on its own while all of them share one thread pool.
// What one thread has found for one root since it last handed over: tilings are batched per thread and
// handed to the root once per task, not once per tiling (that lock was the largest wait on squares_edges).
struct Batch {
    int root = -1, unit = 0;
    std::map<std::string, std::string> out;
    std::map<int, size_t> counts;
    size_t bytes = 0;
    std::vector<Fingerprints::Key> keys;
};
static thread_local Batch batch;

// ── which vertices a tiling must hold ──
//
// A tiling is found only from its lowest vertex type, and the engine never adds a type below its root, so
// the lines a tiling must hold one of go first and are the roots (as tiling_search::set_specifications
// does): with `require`, the smallest required set (`initial` counting as one more), so a tiling holding
// a vertex of every set is found once; without, `initial` (every line when there is none).
//
// Required sets also prune on the k budget. A vertex of type t is added only if the fewest types, from the
// root's on, that could meet every set still missing after it fit in the vertices left after it; and a
// complete tiling is kept only if it meets every set. Sound: on a branch to a tiling T that meets every
// set, vertices are only ever added, so T's vertices still to come number at most the vertices left, are
// of types from the root's on, and meet every set still missing; their types bound that fewest number, so
// no step of the branch is cut, and the search reaches every such T exactly as often as without pruning.
// Counting the sets still missing instead (a vertex can be in several) does cut such branches. Tested
// against the unpruned engine in experiments/results/required-sets-2026-10-26.log.
#include "balance.h"

// ── required sets ──
//
// A tiling must hold a vertex of every required set; a branch is cut when the sets it still misses need more
// vertices than its k has left. That need is a set cover: the fewest types, from the root on in the engine's
// order (a tiling holds no type before its root), meeting every missing set, flat types free. It was one exact
// table of 2^sets entries per root, which capped the sets at 16 (60 MB on a board of 900 roots; 20 sets would
// take 1 GB). The sets split into groups that share no vertex type, and the cover of a union of groups is the
// sum of their covers (a type helps one group only), so each group keeps a table of its own: exact, and as
// tight as the one table was. The usual case, one vertex configuration per set (the amalgama's 14 regular
// ones), is all groups of one, kept as two bitmasks per root and counted by a popcount. A group past
// GROUP_EXACT sets is bounded by counting instead: its missing sets over the most of them one type meets.
// MAX_SETS: at the board reader. TILESEARCH_GROUP_EXACT lowers GROUP_EXACT, to test the counted bound.
static int const GROUP_EXACT = std::getenv("TILESEARCH_GROUP_EXACT") ? std::atoi(std::getenv("TILESEARCH_GROUP_EXACT")) : 16;
struct Required {
    std::vector<uint64_t> mask;               // per vertex type: the sets it is in
    uint64_t all = 0;                         // one bit per set; 0 when nothing is required
    uint64_t single = 0;                      // the sets in groups of one
    std::vector<uint64_t> none, free;         // [root]: single sets no type from it on meets; those a flat one meets
    struct Group {
        uint64_t bits = 0;
        std::vector<int> sets;                // its sets, local bit i is global bit sets[i]
        std::vector<std::vector<uint8_t>> cover;   // exact: [root][local subset] the fewest types from it on
        std::vector<uint64_t> reach;          // counted: [root] its sets some type from it on meets
        int most = 1;                         // counted: the most of its sets one non-flat type meets
        std::vector<uint64_t> costly;         // counted: [root] its sets no flat type from it on meets
    };
    std::vector<Group> groups;

    uint64_t missing(std::vector<int> const& types) const {
        uint64_t m = all;
        for (size_t i = 0; m && i < types.size(); i++) m &= ~mask[types[i]];
        return m;
    }
    /** The fewest vertices that count (not flat) still to add from `root` on to meet the sets `m`; 255: none can. */
    int need(int root, uint64_t m) const {
        if (m & single & none[root]) return 255;
        int c = std::popcount(m & single & ~free[root]);
        for (auto const& g : groups) {
            uint64_t const mm = m & g.bits;
            if (!mm) continue;
            if (!g.cover.empty()) {
                uint32_t local = 0;
                for (size_t i = 0; i < g.sets.size(); i++) local |= uint32_t((mm >> g.sets[i]) & 1) << i;
                c += g.cover[root][local];
            } else {
                if (mm & ~g.reach[root]) return 255;
                int const n = std::popcount(mm & g.costly[root]);
                c += (n + g.most - 1) / g.most;
            }
            if (c >= 255) return 255;
        }
        return c;
    }
    /** Whether a vertex of type t may join a tiling rooted at `root` that misses `miss`, with `left` after it. */
    // --prune-balance: per root, the set of types its subtree may add (balance::per_root)
    std::vector<int> bal_root;
    std::vector<std::vector<uint8_t>> bal_sets;
    bool may_add(uint64_t miss, int root, int t, size_t left) const {
        if (!bal_root.empty() && !bal_sets[bal_root[root]][t]) return false;
        return !all || need(root, miss & ~mask[t]) <= (int)left;
    }
};
static Required required;

// ── k: the vertices that count ──
//
// k counts the vertex orbits where three or more faces meet. A vertex of two corners is a point along a
// straight side (Pi Pi) or a corner filling a notch (90 against 270), and the atlas does not count it:
// `B4 Pi x 4` alone is 1-uniform, not 2. So the search budgets such flat vertices apart, kmax for the
// others and `flat_max` for them, and reports k without them.
//
// flat_max loses no tiling of k <= kmax. Every face has a corner at a vertex that counts (a face whose
// boundary were all flat would share the plane with one neighbour), so there are at most kmax x (largest
// valence) face orbits. Round a face, the corners between two that count all sit at flat vertices, so they
// are symbols that occur in a flat vertex line: at most `run` of them, the longest such stretch of its word.
// Each flat vertex orbit holds at least one of those corner orbits. A board with no flat vertex lines gets
// 0, and searches exactly as before.
static size_t flat_max = 0;
// the corners round type t: valence_of counts only the half-edges stored, the word folded by its rotations
static bool is_flat(vertex_classification const& vc, int t) { return vc.word_with_symmetries(t).size() < 3; }
static size_t flat_budget(Board const& b, int kmax = 0) {   // kmax 0: the board's
    if (!kmax) kmax = b.kmax;
    std::set<int> flatable;
    size_t dmax = 0, longest_word = 0;
    for (auto const& v : b.vertices) {
        dmax = std::max(dmax, v.size());
        if (v.size() < 3) flatable.insert(v.begin(), v.end());
    }
    if (flatable.empty()) return 0;
    size_t run = 0;
    bool unbounded = false;
    auto stretch = [&](std::vector<int> const& w, bool line) {
        size_t n = w.size(), best = 0, cur = 0;
        longest_word = std::max(longest_word, n);
        for (size_t i = 0; i < 2 * n; i++) best = std::max(best, cur = flatable.count(w[i % n]) ? cur + 1 : 0);
        if (best < n) return best;
        if (line) unbounded = true;   // an apeirogon every corner of which may sit at a flat vertex
        return n - 1;
    };
    for (auto const& f : b.faces) run = std::max(run, stretch(f, false));
    for (auto const& a : b.apeirogons) run = std::max(run, stretch(a, true));
    if (unbounded) {
        run = longest_word * (size_t)kmax;
        if (kmax == b.kmax) std::cerr << "warning: an apeirogon may run along flat vertices only; flat vertices capped at " << kmax * dmax * run
                  << ", which is not proven enough\n";
    }
    return (size_t)kmax * dmax * run;
}

/**
 * The required sets: the `require` lines, one per `require face` line (with `faces`), and `initial` as one more
 * when there are any. A `require face` line's set is the vertex lines holding a corner of one of its faces, those
 * along a side aside: a tiling holding one of the faces has a vertex holding each of its corners, so the set
 * prunes and picks the start soundly, and it says exactly what the line says when no other face has those
 * corners. The face check on each finished tiling stays, so what is found does not change. A set of every line,
 * one already there, and those past the 16 the engine takes are left out.
 */
static std::vector<std::vector<int>> required_sets(Board const& b, bool faces = true) {
    auto sets = b.require;
    for (auto const& alts : b.require_faces) {
        if (!faces || sets.size() + !b.initial.empty() >= MAX_SETS) break;
        std::set<int> corners;
        bool bounded = true;
        for (auto const& f : alts) {   // a face of side corners only would bound nothing
            bool real = false;
            for (int c : f) if (!b.flat.count(c)) corners.insert(c), real = true;
            bounded &= real;
        }
        std::vector<int> set;
        for (int v = 0; bounded && v < (int)b.vertices.size(); v++)
            if (std::any_of(b.vertices[v].begin(), b.vertices[v].end(), [&](int c) { return corners.count(c); })) set.push_back(v);
        if (bounded && set.size() < b.vertices.size() && std::find(sets.begin(), sets.end(), set) == sets.end()) sets.push_back(set);
    }
    if (!sets.empty() && !b.initial.empty()) sets.push_back(b.initial);
    return sets;
}

/**
 * The board's vertex lines in the engine's order, and how many of the first are roots. A tiling holds a vertex
 * of every required set, so the search may start from any one of them: required set `pick`, or by default the
 * one of fewest lines (`plan` picks by measured cost).
 */
static std::pair<std::vector<int>, int> vertex_order(Board const& b, int pick = -1, bool faces = true) {
    auto const sets = required_sets(b, faces);
    auto const first = sets.empty() ? b.initial
        : pick >= 0 ? sets[pick]
        : *std::min_element(sets.begin(), sets.end(), [](auto const& x, auto const& y) { return x.size() < y.size(); });
    std::vector<int> order = first;
    for (int v = 0; v < (int)b.vertices.size(); v++)
        if (!std::binary_search(first.begin(), first.end(), v)) order.push_back(v);
    return { order, first.empty() ? (int)order.size() : (int)first.size() };
}

/** The vertex types, line by line in `order`, with `required` set up for them; returns how many are roots. */
static int classify(Board const& b, std::vector<int> const& order, int root_lines, vertex_classification& vc, std::vector<int>* line_of = nullptr) {
    auto const sets = required_sets(b);
    required = Required{};
    int roots = 0;
    // --prune-balance drops the types no tiling uses (balance.h); kept whole when no root type would remain
    std::set<balance::Word> const* alive = balance::prune ? &balance::alive_words(b) : nullptr;
    if (alive) {
        vertex_classification probe;
        int live = 0;
        for (int i = 0; i < root_lines; i++) live += balance::add_line(b, b.vertices[order[i]], probe, alive);
        if (!live) alive = nullptr;
    }
    for (int i = 0; i < (int)order.size(); i++) {
        auto const& w = b.vertices[order[i]];
        int const n = balance::add_line(b, w, vc, alive);
        if (i < root_lines) roots += n;
        if (line_of && i < root_lines) line_of->insert(line_of->end(), n, i);
        uint64_t m = 0;
        for (size_t k = 0; k < sets.size(); k++)
            if (std::binary_search(sets[k].begin(), sets[k].end(), order[i])) m |= uint64_t(1) << k;
        required.mask.insert(required.mask.end(), n, m);
    }
    if (balance::prune && balance::per_root_enabled) balance::per_root(b, vc, roots, required.bal_root, required.bal_sets, std::cout);
    else required.bal_root.clear(), required.bal_sets.clear();   // no per-root sets: may_add checks none
    if (sets.empty()) return roots;
    int const S = (int)sets.size(), T = (int)required.mask.size();
    required.all = S == 64 ? ~uint64_t(0) : (uint64_t(1) << S) - 1;
    // the groups: sets joined when some type is in both (union-find over the sets)
    std::vector<int> up(S);
    std::iota(up.begin(), up.end(), 0);
    std::function<int(int)> top = [&](int x) { return up[x] == x ? x : up[x] = top(up[x]); };
    for (uint64_t m : required.mask)
        for (int i = 0, first = -1; i < S; i++)
            if (m >> i & 1) first < 0 ? void(first = i) : void(up[top(i)] = top(first));
    std::map<int, uint64_t> bits;
    for (int i = 0; i < S; i++) bits[top(i)] |= uint64_t(1) << i;
    // groups of one: per root, the single sets no type from it on meets, and those a flat type meets (free)
    for (auto [r, g] : bits) if (std::popcount(g) == 1) required.single |= g;
    required.none.assign(roots, 0), required.free.assign(roots, 0);
    uint64_t any = 0, flat = 0;
    for (int t = T - 1; t >= 0; t--) {
        any |= required.mask[t] & required.single;
        if (is_flat(vc, t)) flat |= required.mask[t] & required.single;
        if (t < roots) required.none[t] = required.single & ~any, required.free[t] = flat;
    }
    for (auto [r, g] : bits) {
        if (std::popcount(g) == 1) continue;
        Required::Group G;
        G.bits = g;
        for (int i = 0; i < S; i++) if (g >> i & 1) G.sets.push_back(i);
        int const n = (int)G.sets.size();
        auto local = [&](uint64_t m) {
            uint32_t l = 0;
            for (int i = 0; i < n; i++) l |= uint32_t((m >> G.sets[i]) & 1) << i;
            return l;
        };
        if (n <= GROUP_EXACT) {
            // fewest types from t on meeting each subset of the group, each type taken at most once; roots only
            uint32_t const full = (uint32_t(1) << n) - 1;
            std::vector<uint8_t> next(full + 1, 255);
            next[0] = 0;
            G.cover.resize(roots);
            for (int t = T - 1; t >= 0; t--) {
                uint32_t const mt = local(required.mask[t]);
                if (mt) {
                    std::vector<uint8_t> cur(next.size());
                    for (uint32_t m = 0; m <= full; m++) {
                        uint8_t const take = next[m & ~mt];
                        cur[m] = std::min<int>(next[m], take == 255 ? 255 : take + !is_flat(vc, t));   // a flat vertex is no k
                    }
                    next.swap(cur);
                }
                if (t < roots) G.cover[t] = next;
            }
        } else {
            G.reach.assign(roots, 0), G.costly.assign(roots, 0);
            uint64_t reach = 0, cheap = 0;
            for (int t = T - 1; t >= 0; t--) {
                uint64_t const mt = required.mask[t] & g;
                reach |= mt;
                if (is_flat(vc, t)) cheap |= mt;
                else G.most = std::max(G.most, std::popcount(mt));
                if (t < roots) G.reach[t] = reach, G.costly[t] = g & ~cheap;
            }
        }
        required.groups.push_back(std::move(G));
    }
    // TILESEARCH_CHECK_REQ: the groups against the one table they replaced, every root and every missing subset
    if (std::getenv("TILESEARCH_CHECK_REQ") && S <= 20) {
        std::vector<uint8_t> next(size_t(1) << S, 255);
        next[0] = 0;
        size_t bad = 0, checked = 0;
        for (int t = T - 1; t >= 0; t--) {
            std::vector<uint8_t> cur(next.size());
            for (uint64_t m = 0; m < next.size(); m++) {
                uint8_t const take = next[m & ~required.mask[t]];
                cur[m] = std::min<int>(next[m], take == 255 ? 255 : take + !is_flat(vc, t));
            }
            next.swap(cur);
            if (t < roots)
                for (uint64_t m = 0; m < next.size(); m++, checked++)
                    if (bool exact = required.groups.empty() || std::all_of(required.groups.begin(), required.groups.end(), [](auto const& g) { return !g.cover.empty(); });
                        exact ? required.need(t, m) != next[m] : required.need(t, m) > next[m])
                        bad++;
        }
        std::cerr << "required check: " << checked << " (root, subset) pairs, " << required.groups.size() << " groups of 2+ sets, "
                  << std::popcount(required.single) << " single sets, " << bad << " wrong" << std::endl;
        if (bad) std::abort();
    }
    return roots;
}

// One unit of a root (see search): its output until the root is merged, and the keys it added to the root's
// `seen`, kept so a checkpoint can write them and a resume can load them.
struct Unit {
    std::atomic<int> tasks{ 1 };         // queued or running subtrees; 0 means the unit is finished
    std::map<int, size_t> counts;
    std::map<std::string, std::string> out;
    size_t buffered = 0;
    std::vector<Fingerprints::Key> keys;
};
struct Root {
    Fingerprints seen;                   // shared by its units, so dedup spans them
    std::atomic<int> tasks{ 1 };         // queued or running subtrees of all its units; 0 means the root is finished
    std::mutex mutex;                    // guards units and counts
    std::map<int, Unit> units;           // the units in hand, 0 the head
    std::map<int, size_t> counts;        // over all its units, earlier sessions' included
    std::set<int> skip;                  // units finished in an earlier session
    std::atomic<int> next_unit{ 1 }, units_done{ 0 };
    std::atomic<bool> started{ false };
    int depth = 0;                       // its units start at this many edges (search)
    Root() { units[0]; }
};

// Counters for the end-of-run statistics, kept per thread and summed when a worker exits.
static std::atomic<uint64_t> total_nodes{ 0 }, total_complete{ 0 };
static thread_local uint64_t my_nodes = 0, my_complete = 0;
static std::atomic<uint64_t> live_nodes{ 0 };   // for --progress: each thread adds its nodes 4096 at a time
// a trial search (`plan`) stops once live_nodes passes node_cap, and says so in `capped`
static std::atomic<uint64_t> node_cap{ UINT64_MAX };
static std::atomic<bool> capped{ false };
// Hand-off depth in edges below a task's start; 2 measured best across the bench boards. TILESEARCH_SPLIT overrides it.
static int split_depth = 2;
// Units (search): when the plan predicts UNIT_NODES nodes or more per root (a minute or more of one thread at
// 1-3 us a node), each root is split into one unit per node at the least depth where it has UNIT_TARGET nodes, at
// most UNIT_DEPTH edges. Depth in edges alone does not do: at 3 edges a root of squares_edges has 3,245 nodes and
// one of 123_1_4657 has 2 to 6 (its first moves are forced). Below UNIT_NODES a stop loses little, and a board of
// thousands of small roots would write a units.done line per unit for nothing. The run keeps UNIT_DEPTH and the
// rule in `units` (the numbering depends on the rule, and a resume's plan may pick the other one); without that
// file a run has no units. TILESEARCH_UNITS=<depth> forces the most depth, 0 no split.
static int const UNIT_DEPTH = 12, UNIT_TARGET = 64;
static double const UNIT_NODES = 5e7;
// latest.txt, the tiling the app shows while no root has closed: rewritten at most this often
static int64_t const LATEST_MS = std::getenv("TILESEARCH_LATEST_MS") ? std::atoll(std::getenv("TILESEARCH_LATEST_MS")) : 30000;

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
// not const: a run begun before mark 4 resumes with the walk-length rule (see engine_mark in main)
static bool slack_rule = !std::getenv("TILESEARCH_SLACK") || std::string(std::getenv("TILESEARCH_SLACK")) != "0";
struct FastFaces {
    std::vector<cyclic_word_with_symmetries> words;
    std::vector<int> letters;                              // sorted distinct labels of the face words
    std::vector<uint64_t> adj;                             // adjacency bits, rows of `stride` words
    std::vector<std::vector<std::pair<int, int>>> starts;  // per letter id: (word, offset) carrying it
    // Every open stretch of a finite face, read either way, once per distinct content: the open-segment test is
    // then one hash lookup and an exact compare, not a scan of `starts` (a6mix: 645 faces over 26 labels, so
    // starts[EB] held 3,741 entries and a failing test walked them all, 140 us a node).
    // `closes`: the stretch, read as a whole closed face, is that face (word size a multiple of len, len a multiple of
    // its period: the test the scan below applies to loops).
    struct Stretch { int word, offset, dir, len; bool closes; };
    std::unordered_map<uint64_t, std::vector<Stretch>> stretches;
    std::vector<int> infinite;                             // apeirogon words: an open stretch of any length fits
    std::vector<int> shortest;                             // per letter id: the shortest word holding it (face_full)
    bool indexed = false;   // only where some label starts many stretches: on small boards the scan is faster
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
        shortest.assign(letters.size(), INT_MAX);
        for (int wi = 0; wi < (int)words.size(); wi++)
            for (int i = 0; i < words[wi].rotational_generator(); i++) {
                int& m = shortest[id(words[wi].letter(i))];
                m = std::min(m, words[wi].size() > 0 ? (int)words[wi].size() : INT_MAX);
            }
        for (auto const& st : starts) indexed = indexed || st.size() > 64;
        for (int wi = 0; indexed && wi < (int)words.size(); wi++) {
            auto const& w = words[wi];
            if (w.size() == 0) { infinite.push_back(wi); continue; }
            for (int p = 0; p < w.rotational_generator(); p++)
                for (int dir : { 1, -1 }) {
                    uint64_t h = HASH0;
                    for (int len = 1; len <= w.size(); len++) {
                        h = step(h, w.letter(p + dir * (len - 1)));
                        bool const closes = w.size() % len == 0 && len % w.rotational_generator() == 0;
                        auto& bucket = stretches[h];
                        bool seen = false;
                        for (auto const& o : bucket) seen = seen || (o.len == len && o.closes == closes && same(o, w, p, dir, len));
                        if (!seen) bucket.push_back({ wi, p, dir, len, closes });
                    }
                }
        }
        build_trie();
    }
    // Every reading of every finite face word, from every offset, both ways, as a trie on corner labels; a node keeps the
    // fewest corners any word reading it still lacks (its slack). The face rule steps it along a walk: one child lookup
    // per corner. Readings no finite word has fall off the trie (an apeirogon's, or a dead walk's): they never close.
    // Children are a dense row per node, indexed by the letter's id: one read per corner, which matters because orderly's
    // replays run the face rule at every step (with a scan of a child list, slack cost more per node than it saved).
    struct TrieNode { int rem; std::vector<std::pair<int, int>> kids; };
    std::vector<TrieNode> trie;   // built with child lists, then flattened into trie_next / trie_rem
    std::vector<int> trie_next, trie_rem;
    bool trie_dense = false;      // false: the rows would pass 256 MB, so the child lists stay (same slack, slower)
    int trie_child(int node, int c) const {   // during the build only
        for (auto const& [l, k] : trie[node].kids) if (l == c) return k;
        return -1;
    }
    int trie_step(int node, int c) const {
        if (!trie_dense) return trie_child(node, c);
        int const l = id(c);
        return l < 0 ? -1 : trie_next[(size_t)node * letters.size() + l];
    }
    int trie_slack(int node) const { return trie_dense ? trie_rem[node] : trie[node].rem; }
    // Every finite word one length m and no apeirogons: every walk at a node passed the face check, so a word reads it
    // and its slack is m minus its corners, the walk-length rule's order exactly. No trie is built then (2026-11-07:
    // the hyperbolic bubble boards paid 8% for trie walks that picked the same half-edges).
    int uniform_m = -1;
    void build_trie() {
        uniform_m = 0;
        for (auto const& w : words) {
            if (w.size() == 0 || (uniform_m && w.size() != uniform_m)) { uniform_m = -1; break; }
            uniform_m = w.size();
        }
        if (uniform_m > 0) return;
        trie.assign(1, TrieNode{ 1 << 20, {} });
        for (auto const& w : words) {
            int const m = w.size();
            if (m == 0) continue;   // apeirogons: no slack to read
            for (int p = 0; p < w.rotational_generator(); p++)
                for (int d : { 1, -1 }) {
                    int node = 0;
                    for (int i = 0; i < m; i++) {
                        int const c = w.letter(p + d * i);
                        int k = trie_child(node, c);
                        if (k < 0) { k = (int)trie.size(); trie[node].kids.push_back({ c, k }); trie.push_back(TrieNode{ 1 << 20, {} }); }
                        node = k;
                        trie[node].rem = std::min(trie[node].rem, m - (i + 1));
                    }
                }
        }
        size_t const L = letters.size();
        // Dense rows cost nodes x letters x 4 bytes. The worst of 4,027 saved boards needs 54 MB; past 256 MB (a board
        // with ~100 labels and long words) keep the child lists instead.
        trie_dense = trie.size() * L * sizeof(int) <= (size_t(256) << 20);
        if (!trie_dense) return;
        trie_next.assign(trie.size() * L, -1);
        trie_rem.resize(trie.size());
        for (size_t v = 0; v < trie.size(); v++) {
            trie_rem[v] = trie[v].rem;
            for (auto const& [c, k] : trie[v].kids) trie_next[v * L + id(c)] = k;
        }
        trie.clear();
        trie.shrink_to_fit();
    }
    static constexpr uint64_t HASH0 = 0xcbf29ce484222325ULL;
    static uint64_t step(uint64_t h, int c) { return (h ^ (uint32_t)c) * 0x100000001b3ULL; }
    // whether stretch o reads as word w from offset p in direction dir, for len letters
    bool same(Stretch const& o, cyclic_word_with_symmetries const& w, int p, int dir, int len) const {
        auto const& v = words[o.word];
        for (int i = 0; i < len; i++) if (v.letter(o.offset + o.dir * i) != w.letter(p + dir * i)) return false;
        return true;
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
        if (indexed) {
            uint64_t h = HASH0;
            for (int x : seg) h = step(h, x);
            if (auto it = stretches.find(h); it != stretches.end())
                for (auto const& o : it->second) {
                    if (o.len != q || (is_loop && !o.closes)) continue;
                    auto const& w = words[o.word];
                    bool ok = true;
                    for (int i = 0; i < q && ok; i++) ok = seg[i] == w.letter(o.offset + o.dir * i);
                    if (ok) return true;
                }
            if (infinite.empty()) return false;
        }
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
    /** Whether an open face reading `seg` (the face check's walk) can take no more corners: no apeirogon and no word
     *  longer than it reads it. Gluing its end to anything but its other end then makes it longer, so fails. */
    bool face_full(std::vector<int> const& seg) const {
        int const q = (int)seg.size(), s0 = id(seg[0]);
        if (s0 < 0 || q < shortest[s0]) return false;   // every word that could read it is longer
        for (auto [wi, p] : starts[s0]) {
            auto const& w = words[wi];
            if (w.size() > 0 && (int)w.size() <= q) continue;   // holds no longer stretch
            bool fwd = true, rev = true;
            for (int i = 1; i < q && fwd; i++) fwd = seg[i] == w.letter(p + i);
            if (fwd) return false;
            for (int i = 1; i < q && rev; i++) rev = seg[i] == w.letter(p - i);
            if (rev) return false;
        }
        return true;
    }
    // TRUE SLACK (2026-11-06). The face rule branches on the free half-edge whose open face needs the fewest corners to
    // close: the least, over the face words that read its walk forward or backward, of word length minus walk length.
    // A walk no finite word reads (an apeirogon's) never closes and comes last. This was minus the walk length (Marek's GenericFaceChecker; his UnitRegularFaceChecker had true
    // slack), which branches on the LONGEST walk whatever its polygon: on regulars k <= 13 that cost 2,009,799 internal
    // nodes against 1,247,861 with slack, eu_solver's count to 0.4%, same tilings (experiments/results/
    // searcher-node-gap-2026-11-06.md). Ties go to the FIRST such half-edge in index order (face_rule_choice's strict
    // <), as in eu_solver: the tie-break is not cosmetic, last-instead-of-first takes eu_solver's regular k <= 11 from
    // 1.15M to 3.80M nodes. The slack is read off a trie of the face words' readings (build_trie), one step per corner.
    // TILESEARCH_SLACK=0 restores the walk-length rule (runs begun before it must resume with it); TILESEARCH_CHECK_SLACK=1
    // recomputes every slack from the words and aborts on a difference.
    // The slack of ix's open face, and the free half-edge its walk stops at (none when the walk fell off the trie).
    int slack_end(tiling_t const& conf, index_t ix, index_t& end) const {
        index_t it = conf.right_neighbour(ix);
        if (uniform_m > 0) {
            int q = 1;
            while (!conf.is_free(it)) it = conf.ccw_step(it), q++;
            end = it;
            return uniform_m - q;
        }
        int node = trie_step(0, conf.label(ix));
        while (node >= 0 && !conf.is_free(it)) { node = trie_step(node, conf.label(conf.opposite(it))); it = conf.ccw_step(it); }
        if (node < 0) { end = index_t{}; return 1 << 20; }
        end = it;
        return trie_slack(node);
    }
    static inline bool const check_slack = std::getenv("TILESEARCH_CHECK_SLACK") != nullptr;
    int edges_needed_to_complete(tiling_t const& conf, index_t ix) const {
        index_t it = conf.right_neighbour(ix);
        int len = 0;
        if (!slack_rule) {
            while (!conf.is_free(it)) it = conf.ccw_step(it), len++;
            return -len;
        }
        index_t end;
        int const r = slack_end(conf, ix, end);
        if (check_slack && r != naive_slack(conf, ix)) {
            std::cerr << "TILESEARCH_CHECK_SLACK: the trie gives " << r << ", the words give " << naive_slack(conf, ix) << "\n";
            std::abort();
        }
        return r;
    }
    // The face rule's half-edge under true slack: least slack, ties to the lowest index. Each open face is walked once
    // already: a free half-edge's walk covers the face on its right, and an open face lies to the right of one of its
    // two free ends only, so there is no second walk to save (checked 2026-11-07: from the far end the walk reads
    // another face).
    index_t face_pick(tiling_t const& c) const {
        index_t best{};
        int least = std::numeric_limits<int>::max();
        if (uniform_m > 0 && !check_slack) {   // slack = m - corners: the walk rule's own loop, the same order and ties
            for (auto ix : c.indices()) {
                if (!c.is_free(ix)) continue;
                index_t it = c.right_neighbour(ix);
                int len = 0;
                while (!c.is_free(it)) it = c.ccw_step(it), len++;
                if (-len < least) best = ix, least = -len;
            }
            return best;
        }
        for (auto ix : c.indices()) {
            if (!c.is_free(ix)) continue;
            index_t end;
            int const r = slack_end(c, ix, end);
            if (check_slack && r != naive_slack(c, ix)) {
                std::cerr << "TILESEARCH_CHECK_SLACK: slack " << r << " against " << naive_slack(c, ix) << "\n";
                std::abort();
            }
            if (r < least) best = ix, least = r;
        }
        return best;
    }
    // The verify mode's reference: the walk's corners matched against every finite face word, every offset, both ways.
    int naive_slack(tiling_t const& conf, index_t ix) const {
        std::vector<int> seg{ conf.label(ix) };
        for (index_t it = conf.right_neighbour(ix); !conf.is_free(it); it = conf.ccw_step(it)) seg.push_back(conf.label(conf.opposite(it)));
        int const q = (int)seg.size();
        int best = 1 << 20;
        for (auto const& w : words) {
            int const m = w.size();
            if (m == 0 || m < q) continue;
            for (int p = 0; p < w.rotational_generator(); p++)
                for (int d : { 1, -1 }) {
                    bool ok = true;
                    for (int i = 0; i < q && ok; i++) ok = seg[i] == w.letter(p + d * i);
                    if (ok) best = std::min(best, m - q);
                }
        }
        return best;
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
    // the generic checker knows only the walk-length rule, so under true slack this one measure is not compared
    int edges_needed_to_complete(tiling_t const& c, index_t i) const {
        int const f = fast.edges_needed_to_complete(c, i);
        return slack_rule ? f : same(slow.edges_needed_to_complete(c, i), f, "edges needed");
    }
};

// The tiling's half-edge vector, reached legally through a pointer to its protected member.
struct HalfedgesOf : tiling_t { static constexpr auto member = &HalfedgesOf::m_halfedges; };

// Which (vertex template, representative half-edge) pairs can glue to a free half-edge at all, by the
// two tests try_joining applies before it touches the tiling: same mirror type, and both corner pairs
// adjacent in some face word. Keyed by the free half-edge's mirror type and the ids of its two corner
// labels; each list is in the order tiling_extender visits pairs (template ascending, then offset).
struct Candidates {
    struct Pair { int t, i; bool operator==(Pair const&) const = default; };
    std::vector<std::vector<Pair>> lists;
    // What the face test sees of a fresh vertex glued at half-edge i: the corner labels on both sides of i and
    // of its mirror, and the mirror flags. Pairs with one signature pass or fail together (`passing_pairs`).
    std::vector<std::vector<int>> sig;   // [type][half-edge]
    int n_sigs = 0;
    // Type numbers differ between vertex classifications (the start-set trials and the ranking build their own), so
    // anything cached from these lists is keyed by this table's own number too.
    uint64_t const id = [] { static std::atomic<uint64_t> next{ 1 }; return next++; }();
    int nl = 0;
    template<class Faces>
    Candidates(vertex_classification const& vc, Faces const& faces, FastFaces const& ids) : nl((int)ids.letters.size()) {
        lists.resize(4 * (nl + 1) * (nl + 1));
        std::map<std::vector<int64_t>, int> sigs;
        sig.resize(vc.count());
        // per corner label, the letters it can sit beside in some face word: a pair goes only to the keys of
        // those, where testing every key per pair cost minutes on a board of thousands of vertex types
        std::unordered_map<int, std::vector<int>> adj;
        auto beside = [&](int c) -> std::vector<int> const& {
            auto [it, fresh] = adj.try_emplace(c);
            if (fresh)
                for (int l = 0; l < nl; l++)
                    if (faces.can_be_adjacent(ids.letters[l], c)) it->second.push_back(l);
            return it->second;
        };
        int const n = nl + 1;
        for (int t = 0; t < vc.count(); t++) {
            tiling_t one;
            vc.push_vertex_to(one, t);
            for (int i = 0; i < one.num_halfedges(); i++) {
                // i, its mirror and their neighbours on both sides: the face walk can visit no other half-edge
                // of a fresh vertex (only i and its mirror get glued); their labels, flags and which coincide
                index_t h{ i }, m = one.mirror(h);
                std::vector<index_t> near{ h, one.left_neighbour(h), one.right_neighbour(h) };
                if (m.has_value()) near.insert(near.end(), { m, one.left_neighbour(m), one.right_neighbour(m) });
                std::vector<int64_t> k;
                for (auto x : near) {
                    k.push_back(one.label(x)), k.push_back(one.left_label(x));
                    k.push_back((one.mirror(x).has_value() ? 1 : 0) | (one.is_mirror(x) ? 2 : 0));
                    for (auto y : near) k.push_back(x == y);
                }
                sig[t].push_back(sigs.emplace(k, (int)sigs.size()).first->second);
            }
            for (int i = 0; i < vc.valence_of(t); i++) {
                if (!vc.is_representative_of_orbit(t, i)) continue;
                index_t h{ i };
                // the key's mirror flags must be h's own; a label in no face word (nl) glues to nothing
                int const flags = (one.mirror(h).has_value() ? 2 : 0) + (one.is_mirror(h) ? 1 : 0);
                auto const& left = beside(one.right_label(h));
                auto const& right = beside(one.left_label(h));
                for (int l1 : left)
                    for (int r1 : right) lists[(flags * n + l1) * n + r1].push_back({ t, i });
            }
        }
        n_sigs = (int)sigs.size();
    }
    std::vector<Pair> const& at(tiling_t const& conf, index_t f, FastFaces const& ids) const {
        auto lid = [&](int c) { int x = ids.id(c); return x < 0 ? nl : x; };
        int n = nl + 1;
        return lists[((conf.mirror(f).has_value() ? 1 : 0) * 2 + (conf.is_mirror(f) ? 1 : 0)) * n * n
                     + lid(conf.left_label(f)) * n + lid(conf.right_label(f))];
    }
};

// ── which free half-edge to branch on ──
//
// Fail first. Any free half-edge will do: it must end up glued to something, so trying everything it can
// glue to loses no tiling. His rule took the one on the face nearest to closing. This takes the one with
// the fewest options, and ends the node when some free half-edge has none, as Knuth's Dancing Links picks
// the column with fewest rows and as look-ahead does in Brinkmann, McKay and von Nathusius' fullerene
// generator (MATCH 48, 2003). Options are the free half-edges it glues to, by try_joining's own tests, plus,
// while a vertex may still be added, the new-vertex pairs from the root's type on that pass them
// (`passing_pairs`). A required set may still refuse a type, so this can over-count but never under-count:
// a zero is a real zero. Most of the search is dead ends below the vertex budget, which this cuts off a
// level or more early: A6_30 to k 6 went from 66.9M nodes to 0.33M, same tilings
// (experiments/results/search-speedups-2026-10-26.log). Counting costs more per node, so his rule can win
// where there are few dead ends, but by little: over 93 boards (tilesearch-rule-calibration-2026-10-28.log)
// his rule's search was at most 1.14x faster, and up to 100x and more slower (21 boards past a 20 s cap
// that fail first did in under 1.5 s). A 2-vertex pilot that picked between them chose his rule 30x
// wrongly on a star board, so fail first is the rule; TILESEARCH_FACE_FIRST=1 still forces his.
static bool face_first = false;

template<class Faces>
static bool can_join(tiling_t& conf, Faces const& faces, index_t a, index_t b) {   // try_joining's tests, nothing kept
    if (!conf.halfedges_compatible(a, b)) return false;
    if (!faces.can_be_adjacent(conf.left_label(a), conf.right_label(b)) || !faces.can_be_adjacent(conf.right_label(a), conf.left_label(b)))
        return false;
    conf.add_edge(a, b);
    bool const ok = faces.check_adjacent_cw_face(conf, a) && faces.check_adjacent_ccw_face(conf, a);
    conf.remove_edge(a, b);
    return ok;
}

// ── the new vertices a free half-edge can take, by its local context ──
//
// Whether g glues to half-edge i of a fresh vertex of type t (try_joining's tests) depends only on t, i and
// what the face test reads of the tiling: the partial face on each side of g and of its mirror, walked away
// from g until a free half-edge as corner<T, true> walks, with its labels and where it meets g again. So the
// pairs that pass are a function of that context: each thread computes them once per context and keeps them
// (dynamic programming over local contexts; whole partial tilings almost never repeat, measured). This makes
// the option count exact for new vertices at about the cost of the candidate list's length, and the vertex
// step tries only pairs that pass. Within a context, pairs whose fresh vertex looks the same near the glued
// half-edge (Candidates::sig) pass or fail together, so a context costs one face test per signature. A6_30 to
// k 6: 1.6M nodes -> 0.33M and 2.4x less CPU than counting the candidate list; a cold cache costs up to a
// second on small runs. The context key was checked against the direct count at every cache hit on six
// boards (experiments/search-speedups-2026-10-26/prof.cpp, VALIDATE=1) and the signatures against every
// placement's own test on nine (build with -DCHECK_PASSING). Keys are 128-bit hashes, as the tiling
// fingerprints are; a thread's table is emptied when it holds about 40 MB.
struct ContextHash { size_t operator()(Fingerprints::Key const& k) const { return k.a ^ (k.b * 0x9e3779b97f4a7c15ULL); } };
static void feed(Fingerprints::Key& k, uint64_t x) { k.a = Fingerprints::mix(k.a ^ x), k.b = Fingerprints::mix(k.b + x * 0x100000001b3ULL); }
static void context_chain(tiling_t const& conf, index_t h, bool right, Fingerprints::Key& k) {
    auto rel = [&](index_t x) -> uint64_t { return x == h ? 1 : conf.mirror(h).has_value() && x == conf.mirror(h) ? 2 : 0; };
    index_t x = right ? conf.right_neighbour(h) : conf.left_neighbour(h);
    for (int steps = 0; steps < 256; steps++) {
        feed(k, (uint32_t)conf.label(x)), feed(k, (uint32_t)conf.left_label(x));
        feed(k, rel(x) << 4 | (conf.is_free(x) ? 1 : 0) | (conf.mirror(x).has_value() ? 2 : 0) | (conf.is_mirror(x) ? 8 : 0));
        if (conf.is_free(x) || rel(x)) break;
        x = right ? conf.ccw_step(x) : conf.cw_step(x);
    }
    feed(k, UINT64_MAX);
}
static Fingerprints::Key context_of(tiling_t const& conf, index_t g) {
    Fingerprints::Key k{ 0x9e3779b97f4a7c15ULL, 0x2545f4914f6cdd1dULL };
    feed(k, (conf.mirror(g).has_value() ? 1 : 0) | (conf.is_mirror(g) ? 2 : 0));
    for (index_t h : { g, conf.mirror(g) }) {
        if (!h.has_value()) continue;
        feed(k, (uint32_t)conf.label(h)), feed(k, (uint32_t)conf.left_label(h));
        context_chain(conf, h, true, k), context_chain(conf, h, false, k);
    }
    k.b |= 1;
    return k;
}
// Each thread keeps its own table (no lock on a hit); a context missing there is looked up in a table shared by
// all threads, in 16 locked shards, before it is computed, so a context costs its face tests once per run, not
// once per thread. Lists are immutable once made and shared by pointer.
using PairList = std::shared_ptr<std::vector<Candidates::Pair> const>;
struct SharedContexts {
    struct Shard { std::mutex m; std::unordered_map<Fingerprints::Key, PairList, ContextHash> map; size_t held = 0; };
    Shard shard[16];
};
static SharedContexts shared_contexts;

/** The candidate pairs of g, from every type, that pass try_joining's tests; the reference is valid until this thread's
 *  next call, the list it holds for as long as it is kept. */
template<class Faces>
static PairList const& passing_list(tiling_t& conf, Faces const& faces, FastFaces const& ids,
                                    vertex_classification const& vc, Candidates const& cand, index_t g) {
    thread_local std::unordered_map<Fingerprints::Key, PairList, ContextHash> mine;
    thread_local size_t held = 0;             // pairs kept, plus 8 a context for its key and node
    thread_local std::vector<int8_t> by_sig;   // one test per signature (Candidates::sig)
    auto key = context_of(conf, g);
    feed(key, cand.id), key.b |= 1;
    if (auto it = mine.find(key); it != mine.end()) return it->second;
    if (held > (4u << 20)) mine.clear(), held = 0;   // ~40 MB a thread
    auto& sh = shared_contexts.shard[key.b >> 60];
    PairList list;
    {
        std::lock_guard<std::mutex> l(sh.m);
        if (auto it = sh.map.find(key); it != sh.map.end()) list = it->second;
    }
    if (!list) {
        auto out = std::make_shared<std::vector<Candidates::Pair>>();
        by_sig.assign(cand.n_sigs, -1);
        for (auto const& p : cand.at(conf, g, ids)) {
            int8_t& r = by_sig[cand.sig[p.t][p.i]];
            if (r < 0) {
                int const base = conf.num_halfedges();
                vc.push_vertex_to(conf, p.t);
                r = can_join(conf, faces, g, index_t{ base + p.i });
                conf.pop_vertex();
            }
#ifdef CHECK_PASSING
            int const base = conf.num_halfedges();
            vc.push_vertex_to(conf, p.t);
            if (can_join(conf, faces, g, index_t{ base + p.i }) != (r > 0)) { std::cerr << "signature does not decide the face test\n"; std::abort(); }
            conf.pop_vertex();
#endif
            if (r) out->push_back(p);
        }
        list = std::move(out);
        std::lock_guard<std::mutex> l(sh.m);
        if (sh.held > (8u << 20) / 16 * 8) sh.map.clear(), sh.held = 0;   // ~8 x 40 MB over all shards
        sh.held += list->size() + 8;
        sh.map.emplace(key, list);
    }
    held += list->size() + 8;
    return mine.emplace(key, std::move(list)).first->second;
}
template<class Faces>
static std::vector<Candidates::Pair> const& passing_pairs(tiling_t& conf, Faces const& faces, FastFaces const& ids,
                                                          vertex_classification const& vc, Candidates const& cand, index_t g) {
    return *passing_list(conf, faces, ids, vc, cand, g);
}

// ── each free half-edge's passing pairs, kept from node to node ──
// Fail first asks for the pairs of every free half-edge at every node, and hashing their contexts took ~35% of its time
// (B3p30 k <= 12). A glue changes only the contexts whose face walks (context_chain) reach a half-edge it glued: a walk
// reads each half-edge's labels and whether it is free, and only the glued ones changed. Walking back from each glued
// half-edge, both ways, finds the one free half-edge whose walk reaches it (the walks are deterministic); it and its
// mirror are marked changed at the glue and again at its undo, and a new vertex's half-edges when it is pushed. Every
// other half-edge keeps the list it had. The face rule asks for one list a node, and keeping them cost it 8-13%
// (A6p30, B4,C6, hyperbolic colorings), so it neither keeps nor marks them. TILESEARCH_CHECK_CTX=1 recomputes every list it hands out and aborts on a
// difference (checked on the bench boards and the sound-cuts set, 2026-10-31).
static bool const check_ctx = std::getenv("TILESEARCH_CHECK_CTX") != nullptr;
struct CtxCache {
    std::vector<uint64_t> changed;                     // per half-edge: when its context last changed
    std::vector<std::pair<uint64_t, PairList>> entry;  // per half-edge: when its list was found, and the list
    uint64_t clock = 0;
    void grow(size_t n) { if (changed.size() < n) changed.resize(n, 0), entry.resize(n); }
    void touch(int h) { grow(h + 1), changed[h] = ++clock; }
    struct Changed { int n = 0; int h[24]; void add(int x) { h[n++] = x; } };
    /** The half-edges whose context gluing a to its opposite changes (with the glue in place). */
    static Changed changed_by(tiling_t const& c, index_t a) {
        Changed out;
        auto owner = [&](index_t o) { out.add(o.get_value()); if (c.mirror(o).has_value()) out.add(c.mirror(o).get_value()); };
        for (index_t e : { a, c.opposite(a), c.mirror(a), c.mirror(c.opposite(a)) }) {
            if (!e.has_value()) continue;
            out.add(e.get_value());
            // walks run right_neighbour(h), ccw_step...: back is opposite(left_neighbour(x)), to a free one; and
            // left_neighbour(h), cw_step...: back is opposite(right_neighbour(x)). Each step is a permutation, so a closed
            // face (no free half-edge on it, no owner) brings the walk back to e.
            index_t x = e;
            for (int i = 0; i < 260; i++) { index_t const l = c.left_neighbour(x); if (c.is_free(l)) { owner(l); break; } x = c.opposite(l); if (x == e) break; }
            x = e;
            for (int i = 0; i < 260; i++) { index_t const r = c.right_neighbour(x); if (c.is_free(r)) { owner(r); break; } x = c.opposite(r); if (x == e) break; }
        }
        return out;
    }
    template<class Faces>
    PairList const& list(tiling_t& conf, Faces const& faces, FastFaces const& ids, vertex_classification const& vc, Candidates const& cand, index_t g) {
        int const h = g.get_value();
        grow(h + 1);
        auto& [made, l] = entry[h];
        if (l && made > changed[h]) {
            if (check_ctx && *passing_list(conf, faces, ids, vc, cand, g) != *l) { std::cerr << "CHECK_CTX: a kept list is stale\n"; std::abort(); }
            return l;
        }
        l = passing_list(conf, faces, ids, vc, cand, g), made = ++clock;
        return l;
    }
};

/**
 * What the node may still add: vertices toward k, room for a flat one, and the required sets still missing. Fail
 * first counts a half-edge's options from the root on whenever any vertex may be added, so once a budget binds, a
 * half-edge whose options are all new vertices the budgets refuse still counted as open, and the search walked on
 * to find it a step or more later. With this, such a half-edge ends the node: 45degree k <= 14 -25% CPU, B3p30
 * k <= 13 -43%, A12p60,A12p90 k <= 13 -34%, spear +5%, the same tilings (experiments/results/sound-cuts-bz2-2026-10-31.log).
 */
struct Budget {
    int k_left = 1;
    bool flat_room = true;
    uint64_t miss = 0;
    bool binds() const { return k_left <= 0 || !flat_room || miss; }
    bool fits(vertex_classification const& vc, int root, int t) const {   // Extender's room and required tests
        bool const flat = is_flat(vc, t);
        return (flat ? flat_room : k_left > 0) && required.may_add(miss, root, t, k_left - !flat);
    }
};

/** The free half-edge to branch on; none when the tiling is closed, or when `dead` (some free half-edge has no option). */
template<class Faces>
static index_t choose_halfedge(tiling_t& conf, Faces const& faces, FastFaces const& ids, vertex_classification const& vc,
                               Candidates const& cand, int root, bool can_add, bool& dead, Budget const& budget = {}, CtxCache* cc = nullptr) {
    dead = false;
    index_t best{};
    int least = std::numeric_limits<int>::max();
    if (face_first) {
        if constexpr (std::is_same_v<Faces, FastFaces>)
            if (slack_rule) return faces.face_pick(conf);
        for (auto ix : conf.indices()) {
            if (!conf.is_free(ix)) continue;
            int const r = faces.edges_needed_to_complete(conf, ix);
            if (r < least) best = ix, least = r;
        }
        return best;
    }
    thread_local std::vector<index_t> free;
    thread_local std::vector<int8_t> known;   // a glue is symmetric (same labels, same two faces): each pair is tested once
    free.clear();
    for (auto ix : conf.indices())
        if (conf.is_free(ix)) free.push_back(ix);
    size_t const n = free.size();
    known.assign(n * n, -1);
    // newest first: a half-edge with no option is most often on the vertex just added, and finding it ends
    // the node before the older half-edges are counted
    bool const binds = can_add && budget.binds();
    for (size_t i = n; i-- > 0;) {
        index_t const g = free[i];
        int k = 0, joins = 0;
        Candidates::Pair const *lo = nullptr, *hi = nullptr;
        if (can_add) {
            auto const& list = cc ? *cc->list(conf, faces, ids, vc, cand, g) : passing_pairs(conf, faces, ids, vc, cand, g);
            hi = list.data() + list.size();
            lo = list.data() + (std::lower_bound(list.begin(), list.end(), root, [](Candidates::Pair p, int t) { return p.t < t; }) - list.begin());
            k = int(hi - lo);
        }
        auto join = [&](size_t j) {
            int8_t& r = known[i * n + j];
            if (r < 0) r = known[j * n + i] = can_join(conf, faces, g, free[j]);
            return (int)r;
        };
        for (size_t j = 0; j < n && k < least; j++) { int const r = join(j); k += r, joins += r; }
        if (k == 0) { dead = true; return {}; }
        if (binds && joins == 0) {   // all counted options are new vertices: does any still fit the budgets?
            bool fits = false;
            for (auto p = lo; p != hi && !fits; ++p) fits = budget.fits(vc, root, p->t);
            for (size_t j = 0; j < n && !fits; j++) fits = join(j);   // the count may have stopped before the joins
            if (!fits) { dead = true; return {}; }
        }
        if (k < least) least = k, best = g;
    }
    return best;
}

/** A template's symmetries: the permutations of its half-edges that keep labels, neighbours and mirrors (p[j]: j's image). */
static std::vector<std::vector<int>> symmetries(vertex_classification const& vc, int t) {
    tiling_t x;
    vc.push_vertex_to(x, t);
    int const n = x.num_halfedges();
    std::vector<std::vector<int>> out;
    for (int s0 = 0; s0 < n; s0++) {
        std::vector<int> p(n, -1), todo{ 0 };
        p[0] = s0;
        bool ok = true;
        while (ok && !todo.empty()) {
            index_t a{ todo.back() }, b{ p[todo.back()] };
            todo.pop_back();
            ok = x.left_label(a) == x.left_label(b) && x.right_label(a) == x.right_label(b) &&
                 x.mirror(a).has_value() == x.mirror(b).has_value();
            for (auto [u, v] : { std::pair{ x.right_neighbour(a), x.right_neighbour(b) },
                                 { x.left_neighbour(a), x.left_neighbour(b) }, { x.mirror(a), x.mirror(b) } }) {
                if (!ok || !u.has_value()) continue;
                int& q = p[u.get_value()];
                if (q < 0) q = v.get_value(), todo.push_back(u.get_value());
                else ok = q == v.get_value();
            }
        }
        std::vector<bool> hit(n);
        for (int q : p) ok = ok && q >= 0 && !hit[q] && (hit[q] = true);
        if (ok) out.push_back(p);
    }
    return out;
}

// ── the root's symmetries ──
// A root template with symmetries (a word like A B A B, not folded) is placed in a tiling in |aut| ways, and the
// search, which fixes the root, reaches every tiling once per way: its dead ends too. A node is kept only while the
// root's glued neighbours, read in half-edge order, are no greater than read through any symmetry g (lex-leader).
// A neighbour reads as its type and its half-edge's orbit under that type's symmetries, which no placement changes;
// a free half-edge ends the comparison undecided. Sound: of the placements of a tiling's vertex, the least reading
// is never cut (a cut needs a decided greater position, which the least has against no g), and the search finds
// every tiling from every placement. TILESEARCH_SYMBREAK=0 turns it off.
static bool sym_break = !std::getenv("TILESEARCH_SYMBREAK") || std::string(std::getenv("TILESEARCH_SYMBREAK")) != "0";
struct RootSyms {
    std::vector<std::vector<int>> orbit;              // per type, per half-edge: the least half-edge of its orbit
    std::vector<std::vector<std::vector<int>>> aut;   // per type: its symmetries but the identity
    RootSyms(vertex_classification const& vc, int roots) : orbit(vc.count()), aut(roots) {
        for (int t = 0; t < vc.count(); t++) {
            auto const all = symmetries(vc, t);
            orbit[t].resize(all.empty() ? 0 : all[0].size());
            for (int j = 0; j < (int)orbit[t].size(); j++) {
                orbit[t][j] = j;
                for (auto const& p : all) orbit[t][j] = std::min(orbit[t][j], p[j]);
            }
            if (t < roots)
                for (auto const& p : all)
                    for (int j = 0; j < (int)p.size(); j++)
                        if (p[j] != j) { aut[t].push_back(p); break; }
        }
    }
    /** Whether the node made by gluing a to its opposite is cut: by the root's symmetries, or by a vertex of the root's
     *  type that reads less than the root (the tiling is then found from that vertex as root). */
    bool cut(tiling_t const& c, std::vector<int> const& types, index_t a) const {
        int const r = types[0], n = (int)orbit[r].size();
        // what the glue changed: the root's reading, or that of another vertex of the root's type
        auto other = [&](index_t h) { auto const& nb = c.neighbourhood(h); return nb.vertex_ix != 0 && types[nb.vertex_ix] == r; };
        index_t const b = c.opposite(a);
        if (a.get_value() >= n && b.get_value() >= n && !other(a) && !other(b)) return false;
        auto const& G = aut[r];
        auto val = [&](int h) -> int64_t {
            if (c.is_free(index_t{ h })) return -1;
            index_t const p = c.opposite(index_t{ h });
            auto const& nb = c.neighbourhood(p);
            int const t = types[nb.vertex_ix];
            return (int64_t)t << 20 | orbit[t][p.get_value() - nb.vertex_start.get_value()];
        };
        thread_local std::vector<int64_t> v;
        v.resize(n);
        for (int j = 0; j < n; j++) v[j] = val(j);
        for (auto const& g : G)   // the root's own placements: a decided greater position cuts
            for (int j = 0; j < n; j++) {
                int64_t const x = v[j], y = v[g[j]];
                if (x < 0 || y < 0 || x < y) break;
                if (x > y) return true;
            }
        // another vertex of the root's type that reads less than the root every way it can be placed (each decided)
        auto less = [&](int s, std::vector<int> const* g) {
            for (int j = 0; j < n; j++) {
                int64_t const x = val(s + (g ? (*g)[j] : j));
                if (x < 0 || v[j] < 0 || x > v[j]) return false;
                if (x < v[j]) return true;
            }
            return false;
        };
        for (int i = 1, s = n; i < (int)types.size(); s += (int)orbit[types[i]].size(), i++) {
            if (types[i] != r || !less(s, nullptr)) continue;
            bool all = true;
            for (auto const& g : G) all = all && less(s, &g);
            if (all) return true;
        }
        return false;
    }
};
static RootSyms const* run_syms = nullptr;   // the run's (main), for the Extender

// ── open faces must close ──
// An open face of a partial tiling runs from a free half-edge f back through glued edges to the free half-edge g
// at its other end, and the face words say how many corners r are missing. In the plane, any completion puts r
// vertices there whose consecutive half-edges pass try_joining's label tests. A vertex of the ring enters through a
// half-edge of class `in` and leaves through its left neighbour (class `out`), so whether the face can close is
// reachability over half-edge classes (a class: the two corner labels and the mirror kind): from f, r ring
// vertices, then g. A glue changes only the faces through it, so a node checks those; every answer is cached per
// thread. Sound: no tiling is lost (sound-cuts-engine-2026-10-31.log). Fail first finds most of these dead
// ends a step later anyway; the face rule never looks, and there it cut A6p30 k <= 15 from 24 s to 4.6 s.
static bool ring_check = false;
// On with the face rule, off with fail first; TILESEARCH_RING=0/1 forces it. The plan cannot choose it by probing:
// what it saves lies deep, where probes rarely reach (A6p30 k <= 15: probes put the face rule at 1.1M nodes, the
// truth is 17.9M; they saw the check's cost and not its 81% saving). In the engine, face rule on vs off: A6p30
// -81% CPU, B4,C6 -46%, 3-stars -96% nodes; worst 1247 +2%, hyperbolic colorings +7%. Fail first on vs off: 1247
// +39%, B4,C6 +21% (fail first already finds most of these a step later). sound-cuts-engine-2026-10-31.log.
static bool ring_for(bool face) {
    if (char const* e = std::getenv("TILESEARCH_RING")) return std::string(e) == "1";
    return face;
}
struct RingTables;
static RingTables const* run_ring = nullptr;   // the run's tables (main), for the Extender
struct RingTables {
    std::vector<std::array<int, 3>> key;              // per class: label, left label, mirror kind
    std::vector<std::vector<int>> cls;                // per template, per half-edge offset: its class
    std::vector<std::vector<uint64_t>> outs;          // per in class: the out classes some template pairs with it
    int W = 0;                                        // words per class bitset
    uint64_t serial;                                  // the threads' caches go by this, never by an address
    explicit RingTables(vertex_classification const& vc) {
        static std::atomic<uint64_t> made{ 0 };
        serial = ++made;
        std::map<std::array<int, 3>, int> id;
        std::vector<std::vector<std::pair<int, int>>> io(vc.count());
        for (int t = 0; t < vc.count(); t++) {
            tiling_t x;
            vc.push_vertex_to(x, t);
            std::vector<int> c;
            for (auto ix : x.indices()) {
                std::array<int, 3> k{ x.label(ix), x.left_label(ix), !x.mirror(ix).has_value() ? 0 : x.is_mirror(ix) ? 1 : 2 };
                c.push_back(id.try_emplace(k, (int)key.size()).first->second);
                if ((int)key.size() < (int)id.size()) key.push_back(k);
            }
            for (auto ix : x.indices()) io[t].push_back({ c[ix.get_value()], c[x.left_neighbour(ix).get_value()] });
            cls.push_back(std::move(c));
        }
        W = ((int)key.size() + 63) / 64;
        outs.assign(key.size(), std::vector<uint64_t>(W, 0));
        for (auto const& v : io) for (auto [i, o] : v) outs[i][o / 64] |= 1ULL << (o % 64);
    }
};
template<class F> static void each_bit(std::vector<uint64_t> const& b, F f) {
    for (int w = 0; w < (int)b.size(); w++) for (uint64_t x = b[w]; x; x &= x - 1) f(w * 64 + __builtin_ctzll(x));
}
// The open faces the glue at a changed or made: the faces through its edge and its mirror's, each by its free start f
// (a face is read from f forward, x -> opposite(right_neighbour(x)), so f lies back from the glued half-edge by
// cw_step), and when the glue brought a vertex in, its other corners, each a face of one corner so far.
static void near_glue(tiling_t const& c, index_t a, std::vector<index_t>& out) {
    out.clear();
    auto add = [&](index_t y) { if (std::find(out.begin(), out.end(), y) == out.end()) out.push_back(y); };
    for (index_t e : { a, c.opposite(a), c.mirror(a), c.mirror(c.opposite(a)) }) {
        if (!e.has_value()) continue;
        index_t y = e;   // a closed face has no free start: the walk comes back to e
        for (int i = 0; i < 256 && !c.is_free(y); i++) if ((y = c.cw_step(y)) == e) break;
        if (c.is_free(y)) add(y);
    }
    for (index_t e : { a, c.opposite(a) }) {   // a fresh vertex: glued at e (and its mirror) only
        bool fresh = true;
        for (index_t x = c.right_neighbour(e); fresh && x != e; x = c.right_neighbour(x)) fresh = c.is_free(x) || x == c.mirror(e);
        if (!fresh) continue;
        for (index_t x = c.right_neighbour(e); x != e; x = c.right_neighbour(x)) if (c.is_free(x)) add(x);
    }
}
static bool faces_close(tiling_t const& c, std::vector<int> const& types, RingTables const& T, FastFaces const& F, index_t last) {
    struct Cache {
        uint64_t serial = 0;
        std::vector<std::vector<uint64_t>> join;   // per class a, computed when first needed: classes b that join(a, b) passes
        std::unordered_map<uint64_t, bool> memo;   // (a, r, g) -> closes
    };
    thread_local Cache cache;
    if (cache.serial != T.serial) cache = Cache{ T.serial, std::vector<std::vector<uint64_t>>(T.key.size()), {} };
    auto join = [&](int a) -> std::vector<uint64_t> const& {
        auto& row = cache.join[a];
        if (row.empty()) {
            row.assign(T.W, 0);
            for (int b = 0; b < (int)T.key.size(); b++)
                if (T.key[a][2] == T.key[b][2] && F.can_be_adjacent(T.key[a][1], T.key[b][0]) && F.can_be_adjacent(T.key[a][0], T.key[b][1]))
                    row[b / 64] |= 1ULL << (b % 64);
        }
        return row;
    };
    auto cls = [&](index_t ix) { auto const& nb = c.neighbourhood(ix); return T.cls[types[nb.vertex_ix]][ix.get_value() - nb.vertex_start.get_value()]; };
    auto closes = [&](int a, int r, int g) {
        uint64_t const key = (uint64_t)a << 40 | (uint64_t)g << 16 | (uint64_t)r;
        if (auto it = cache.memo.find(key); it != cache.memo.end()) return it->second;
        std::vector<uint64_t> layer(T.W, 0), in(T.W);
        layer[a / 64] |= 1ULL << (a % 64);
        for (int step = 0; step < r; step++) {
            std::fill(in.begin(), in.end(), 0);
            each_bit(layer, [&](int x) { auto const& j = join(x); for (int w = 0; w < T.W; w++) in[w] |= j[w]; });
            std::fill(layer.begin(), layer.end(), 0);
            each_bit(in, [&](int i) { for (int w = 0; w < T.W; w++) layer[w] |= T.outs[i][w]; });
        }
        bool ok = false;
        each_bit(layer, [&](int x) { ok = ok || (join(x)[g / 64] >> (g % 64) & 1); });
        return cache.memo[key] = ok;
    };
    thread_local std::vector<index_t> ends;
    thread_local std::vector<int> seg;
    near_glue(c, last, ends);
    for (index_t f : ends) {
        seg.clear();
        index_t x = f;
        bool loop = false;
        for (int i = 0; i < 256 && !loop; i++) {
            seg.push_back(c.label(x));
            index_t const rn = c.right_neighbour(x);
            if (c.is_free(rn)) break;
            x = c.opposite(rn);
            loop = x == f;
        }
        if (loop || seg.size() >= 256) continue;
        int const a = cls(f), g = cls(c.right_neighbour(x)), q = (int)seg.size();
        bool ok = false;
        uint64_t tried = 0;   // the missing lengths already tested
        auto reading = [&](int wi, int r) {
            if (F.words[wi].size() == 0 || r >= 64) { ok = true; return; }   // an apeirogon, or past the cache key: alive
            if (!(tried >> r & 1)) tried |= 1ULL << r, ok = closes(a, r, g);
        };
        if (F.indexed) {   // the readings of exactly this stretch, by its hash (FastFaces' index)
            if (!F.infinite.empty()) continue;
            uint64_t h = FastFaces::HASH0;
            for (int s : seg) h = FastFaces::step(h, s);
            auto it = F.stretches.find(h);
            if (it == F.stretches.end()) continue;
            for (auto const& o : it->second) {
                if (ok || o.len != q) continue;
                auto const& w = F.words[o.word];
                bool same = true;
                for (int i = 0; i < q && same; i++) same = seg[i] == w.letter(o.offset + o.dir * i);
                if (same) reading(o.word, w.size() - q);
            }
        } else {
            int const s0 = F.id(seg[0]);
            if (s0 < 0) continue;
            for (auto [wi, p] : F.starts[s0]) {
                auto const& w = F.words[wi];
                if (ok || (w.size() > 0 && q > w.size())) continue;
                bool fwd = true, rev = true;
                for (int i = 1; i < q && fwd; i++) fwd = seg[i] == w.letter(p + i);
                for (int i = 1; i < q && rev; i++) rev = seg[i] == w.letter(p - i);
                if (fwd || rev) reading(wi, w.size() - q);
            }
        }
        if (!ok) return false;
    }
    return true;
}

// ── chiral boards ──
// Marek's half-edge structure holds every vertex orbit twice, once per hand: a template is two loops of m
// half-edges, the second the mirror of the first, and a glue also glues the two mirrors. (A template whose
// symmetry has a reflection is one loop: a vertex on a mirror axis.) A tiling has no reflection and no glide
// reflection exactly when the two hands never meet: its half-edges split into two halves, mirror images of
// each other, with no glue between them. So (Marek, 2 November 2026) `chiral yes` drops the templates on an
// axis (balance::add_line) and keeps, per vertex, which of its loops is on the root's side: a glue must join
// two half-edges on the same side. That rejects a half-edge glued to its own mirror (an edge across an axis)
// and any cycle of glues that comes back mirrored (a glide). A new vertex takes its side from its first glue.
struct Sides {
    std::vector<int8_t> flip;   // per vertex: 1 when its second loop is on the root's side; -1 before its first glue
    void push() { flip.push_back(flip.empty() ? 0 : -1); }
    void pop() { flip.pop_back(); }
    // the side of half-edge ix, -1 while its vertex has none
    int side(tiling_t const& c, vertex_classification const& vc, std::vector<int> const& types, index_t ix) const {
        auto const& n = c.neighbourhood(ix);
        int const f = flip[n.vertex_ix];
        return f < 0 ? -1 : f ^ int(ix - n.vertex_start >= vc.valence_of(types[n.vertex_ix]) / 2);
    }
    bool ok(tiling_t const& c, vertex_classification const& vc, std::vector<int> const& types, index_t a, index_t b) const {
        int const sa = side(c, vc, types, a), sb = side(c, vc, types, b);
        return sa < 0 || sb < 0 || sa == sb;
    }
    // gives b's vertex a's side when it has none (a's when a's has none); returns the vertex set, else -1
    int settle(tiling_t const& c, vertex_classification const& vc, std::vector<int> const& types, index_t a, index_t b) {
        if (side(c, vc, types, b) >= 0) std::swap(a, b);
        int const sa = side(c, vc, types, a);
        if (sa < 0 || side(c, vc, types, b) >= 0) return -1;
        auto const& n = c.neighbourhood(b);
        int const v = n.vertex_ix, loop = b - n.vertex_start >= vc.valence_of(types[v]) / 2;
        flip[v] = int8_t(sa ^ loop);   // so side(b) == sa
        return v;
    }
    void unsettle(int v) { if (v >= 0) flip[v] = -1; }
};
// TILESEARCH_CHECK_CHIRAL (tests): a run without `chiral yes` keeps only the tilings whose half-edges never reach
// their own mirror, found by walking neighbours and glues; it shares nothing with Sides, so its census must match
// the same board's with `chiral yes`.
static bool const check_chiral = std::getenv("TILESEARCH_CHECK_CHIRAL") != nullptr;
static bool reverses(tiling_t const& c) {
    int const n = c.num_halfedges();
    std::vector<int8_t> seen(n, -1);   // the side each half-edge was reached on
    std::vector<int> todo;
    for (int s = 0; s < n; s++) {
        if (seen[s] >= 0) continue;
        seen[s] = 0, todo.assign(1, s);
        while (!todo.empty()) {
            index_t const h{ todo.back() };
            todo.pop_back();
            int const sd = seen[h.value];
            auto reach = [&](index_t x, int sx) {
                if (!x.has_value()) return true;
                if (seen[x.value] < 0) { seen[x.value] = int8_t(sx), todo.push_back(x.value); return true; }
                return seen[x.value] == sx;
            };
            if (!reach(c.left_neighbour(h), sd) || !reach(c.right_neighbour(h), sd) || !reach(c.opposite(h), sd) ||
                !reach(c.mirror(h), 1 - sd)) return true;
        }
    }
    return false;
}

// tiling_extender (tiling_extender.h): the same search, glue for glue, with two costs removed.
//  - Adding a vertex visits only the pairs Candidates lists for the free half-edge. His loop pushed every
//    template above the root and let try_joining reject it; the pairs skipped are exactly the ones
//    try_joining rejects before touching the tiling.
//  - push_vertex_from reserves exactly size + valence, so every push reallocated the whole half-edge
//    vector. Capacity now grows geometrically first, which turns that reserve into a no-op.
// ── orderly generation (EU_ORDERLY in eu_solver, 2026-11-06; TILESEARCH_ORDERLY=1) ──
// Every closed configuration is built once, from its canonical root. A root is a vertex of the root's type with a
// frame (an automorphism of its template, `symmetries`); the code of a root is the sequence of branch moves the
// search makes reaching that copy (the face rule's half-edge, glued to a placed half-edge, or to a fresh vertex at
// its orbit's representative), forced closures included. The canonical copy is the root with the least code; a
// node where another root's code is already smaller is cut, one where it is larger drops that root. Here only with
// the face rule, whose choice is a function of the configuration and so can be replayed on another copy. The
// symmetry cut (sym_break) picks its own copy and is off in this mode.
static bool orderly_on = false;
static bool orderly_dec = false;   // decoupled: every root's code read by the lowest-free rule (fail-first runs)
struct OrderlyTables {
    std::vector<std::vector<std::vector<int>>> aut, autinv;   // [type][frame][local half-edge]
    std::vector<std::vector<int>> torep, repof;                // [type][half-edge]: the frame to its rep, the rep
    bool ok = true;
    std::string why;
    OrderlyTables(vertex_classification const& vc) {
        int const n = vc.count();
        aut.resize(n), autinv.resize(n), torep.resize(n), repof.resize(n);
        for (int t = 0; t < n && ok; t++) {
            auto all = symmetries(vc, t);
            int const v = vc.valence_of(t);
            if (all.empty() || (int)all[0].size() != v) { ok = false, why = "type without its identity"; break; }
            aut[t] = all;
            torep[t].assign(v, -1), repof[t].assign(v, -1);
            for (int a = 0; a < (int)all.size(); a++) {
                std::vector<int> inv(v);
                for (int q = 0; q < v; q++) inv[all[a][q]] = q;
                autinv[t].push_back(inv);
            }
            for (int q = 0; q < v; q++) {
                int found = 0;
                for (int a = 0; a < (int)all.size(); a++)
                    if (vc.is_representative_of_orbit(t, all[a][q])) {
                        if (!found++) torep[t][q] = a, repof[t][q] = all[a][q];
                    }
                // the engine attaches fresh vertices at its representatives: each orbit must hold exactly one, and a
                // representative's own frame must be the identity, or the codes would not be the search's
                if (found != 1) { ok = false, why = "an orbit with " + std::to_string(found) + " representatives"; break; }
                if (vc.is_representative_of_orbit(t, q) && all[torep[t][q]][q] != q) { ok = false, why = "a representative moved by its frame"; break; }
            }
        }
    }
};
static OrderlyTables const* run_orderly = nullptr;
static inline long long enc_exist(int i) { return (1LL << 50) + i; }
static inline long long enc_new(int g, int r) { return ((1LL << 32) - g) * 4096 + r; }
/** open_face's walk on any configuration: labels into seg, the two free ends (far, end); false for a loop. */
static bool open_face_in(tiling_t const& c, index_t g, index_t& far, index_t& end, std::vector<int>& seg) {
    counterclockwise_corner<tiling_t> cc{ c, g };
    auto const [n, is_loop] = advance_to_back_or_loop(cc, cc.end());
    (void)n;
    if (is_loop) return false;
    seg.clear();
    index_t const start = cc.back;
    for (index_t h = start;;) {
        seg.push_back(c.right_label(h));
        if (c.is_free(h)) { end = h; break; }
        h = c.cw_step(h);
        if (h == start) return false;
    }
    far = c.right_neighbour(start);
    return far.has_value() && c.is_free(far);
}
/** The face rule's half-edge (choose_halfedge with face_first), on any configuration. */
static index_t face_rule_choice(tiling_t const& c, FastFaces const& F) {
    if (slack_rule) return F.face_pick(c);
    index_t best{};
    int least = std::numeric_limits<int>::max();
    for (auto ix : c.indices()) {
        if (!c.is_free(ix)) continue;
        int const r = F.edges_needed_to_complete(c, ix);
        if (r < least) best = ix, least = r;
    }
    return best;
}

// Forced glues (Martin Olivier's forced closure, epsln/k-uniform-enumeration, generalised to face words): after a
// glue, a free half-edge on a face it touched whose options (fail first's count: the joins plus, while a vertex may
// be added, the passing new-vertex pairs from the root's type on) are exactly one join is glued at once, to a
// fixpoint, before the next node. The count never under-counts, so a forced glue is the only move that half-edge
// has in any completion; it saves the node that would make it. TILESEARCH_FORCE=0 turns it off.
static bool forcing = !std::getenv("TILESEARCH_FORCE") || std::string(std::getenv("TILESEARCH_FORCE")) != "0";
template<class Faces, class FI, class FS>
struct Extender {
    tiling_t conf;
    Faces const* faces;
    FastFaces const* ids;
    vertex_classification const* vc;
    Candidates const* cand;
    FI iteration;
    FS solution;
    size_t num_iterations = 0, max_num_vertices = 0, num_vertices_added = 0;   // vertices that count toward k
    size_t num_flat = 0, max_flat = 0;                                         // and flat ones (flat_max)
    int first_vertex = 0;
    int unit = 0;            // which unit of the root (search)
    Unit* part = nullptr;
    size_t task_nodes = 0;   // nodes this task has visited
    int base_edges = 0;      // edges when this task started
    std::vector<int> types;  // each vertex's type, for the required sets
    index_t last{};          // the half-edge of the glue that made this node (ring_check)
    CtxCache ctx;            // the free half-edges' passing pairs, kept between nodes
    Sides sides;             // chiral: each vertex's side

    void add_vertex(int t) {
        auto& h = conf.*HalfedgesOf::member;
        size_t need = h.size() + vc->valence_of(t);
        if (h.capacity() < need) h.reserve(std::max(2 * h.capacity(), need));
        ++(is_flat(*vc, t) ? num_flat : num_vertices_added);
        int const base = conf.num_halfedges();
        vc->push_vertex_to(conf, t);
        types.push_back(t);
        if (chiral) sides.push();
        if (!face_first) for (int i = base; i < conf.num_halfedges(); i++) ctx.touch(i);   // indices are reused after a pop
    }
    void remove_last_vertex() { --(is_flat(*vc, types.back()) ? num_flat : num_vertices_added); conf.pop_vertex(); types.pop_back(); if (chiral) sides.pop(); }
    bool room(int t) const { return is_flat(*vc, t) ? num_flat < max_flat : num_vertices_added < max_num_vertices; }
    bool can_add() const { return num_vertices_added < max_num_vertices || num_flat < max_flat; }

    struct Forced { index_t a, b; int settled; CtxCache::Changed changed; };
    std::vector<Forced> forced;   // the glues propagate made, undone by unwind
    std::vector<index_t> queue;
    mutable index_t open_end{};   // open_face's free end on the walk (the other is `far`)
    void enqueue_owners(index_t a) {   // the free half-edges whose faces the glue at a touched
        auto const ch = CtxCache::changed_by(conf, a);
        for (int i = 0; i < ch.n; i++)
            if (conf.is_free(index_t{ ch.h[i] })) queue.push_back(index_t{ ch.h[i] });
    }
    /** The open face on g's clockwise side, as the face check walks it: its corner labels into seg, and the free
     *  half-edge at its far end; false when the walk closes on itself. */
    bool open_face(index_t g, index_t& far, std::vector<int>& seg) const {
        counterclockwise_corner<tiling_t> c{ conf, g };
        auto const [n, is_loop] = advance_to_back_or_loop(c, c.end());
        (void)n;
        if (is_loop) return false;
        seg.clear();
        index_t const start = c.back;
        for (index_t h = start;;) {
            seg.push_back(conf.right_label(h));
            if (conf.is_free(h)) { open_end = h; break; }
            h = conf.cw_step(h);
            if (h == start) return false;
        }
        far = conf.right_neighbour(start);
        return far.has_value() && conf.is_free(far);
    }
    /** Glue every forced closure, to a fixpoint; false when the node is dead or cut. A face changes only when an edge is
     *  glued into it, so after each glue the two faces through the new edge (the face check's two: a's clockwise face
     *  and its mirror's) are walked; one that is open and full (face_full) has one possible move, gluing its two
     *  free ends, which is made at once. */
    bool propagate(index_t a) {
        thread_local std::vector<int> seg;
        queue.clear();
        queue.push_back(a);
        while (!queue.empty()) {
            index_t const e = queue.back();
            queue.pop_back();
            for (index_t x : { e, conf.mirror(e) }) {
                if (!x.has_value() || conf.is_free(x)) continue;
                index_t far{};
                if (!open_face(x, far, seg) || !ids->face_full(seg)) continue;
                index_t const g = far, partner = open_end;   // the face's two free ends
                if (!partner.has_value() || partner == g || !conf.is_free(g) || !conf.is_free(partner)) continue;
                if (check_force) verify_forced(g, partner);
                if (!can_join(conf, *faces, g, partner)) return false;                  // its one move fails: dead
                if (chiral && !sides.ok(conf, *vc, types, g, partner)) return false;
                Forced f{ g, partner, chiral ? sides.settle(conf, *vc, types, g, partner) : -1, {} };
                conf.add_edge(g, partner);
                if (!face_first) f.changed = CtxCache::changed_by(conf, g);
                for (int i = 0; i < f.changed.n; i++) ctx.touch(f.changed.h[i]);
                forced.push_back(f);
                if (sym_break && run_syms && run_syms->cut(conf, types, g)) return false;
                if (ring_check && run_ring && !faces_close(conf, types, *run_ring, *ids, g)) return false;
                queue.push_back(g);   // the faces through the forced edge, in turn
            }
        }
        return true;
    }
    /** TILESEARCH_CHECK_FORCE=1: fail first's own count must give g exactly one option, the join to p. */
    void verify_forced(index_t g, index_t p) {
        int joins = 0;
        bool hit = false;
        for (auto ix : conf.indices())
            if (conf.is_free(ix) && can_join(conf, *faces, g, ix)) joins++, hit = hit || ix == p;
        size_t pairs = 0;
        if (can_add()) {
            auto const& list = passing_pairs(conf, *faces, *ids, *vc, *cand, g);
            pairs = list.end() - std::lower_bound(list.begin(), list.end(), first_vertex, [](Candidates::Pair q, int t) { return q.t < t; });
        }
        if (joins > 1 || (joins == 1 && !hit) || pairs) {
            std::cerr << "CHECK_FORCE: forced half-edge has " << joins << " joins (partner " << (hit ? "among them" : "not among them") << ") and " << pairs << " new-vertex pairs\n";
            std::abort();
        }
    }
    void unwind(size_t mark) {
        while (forced.size() > mark) {
            Forced const& f = forced.back();
            for (int i = 0; i < f.changed.n; i++) ctx.touch(f.changed.h[i]);
            conf.remove_edge(f.a, f.b);
            sides.unsettle(f.settled);
            forced.pop_back();
        }
    }

    // orderly generation (see orderly_on): the code so far, and the alternative roots still undecided per depth
    int depth = 0;                    // branch moves on the path to this node
    long long pending = 0;            // the move try_joining is about to make
    std::vector<long long> moves;     // moves[d]: the branch move at code position d
    struct RState { tiling_t Q; std::vector<int> qv2p, qaut, pv2q, qtype, qstart; std::vector<long long> code; int s = 0, nfree = 0, low = 0; bool done = false, broken = false; };
    struct Alt { int v, a, wait, st; };
    std::deque<RState> pool;
    std::vector<int> pool_end;
    int pool_used = 0;
    std::vector<std::vector<Alt>> alive;
    std::vector<int> alive_nv;
    int replay_wait = -1;
    enum { R_TIED, R_PRUNE, R_DROP };
    int pool_alloc() { if (pool_used == (int)pool.size()) pool.emplace_back(); return pool_used++; }
    std::vector<int> pstart;   // P's vertex -> its first half-edge (rebuilt per test)
    void rs_add(RState& R, int g, int pv, int a) {
        int const before = R.Q.num_halfedges();
        R.qstart.push_back(before);
        vc->push_vertex_to(R.Q, g);
        R.nfree += R.Q.num_halfedges() - before;
        R.qv2p.push_back(pv), R.qaut.push_back(a), R.qtype.push_back(g);
        R.pv2q[pv] = (int)R.qv2p.size() - 1;
    }
    int q2p(RState const& R, index_t d) const {
        auto const& nb = R.Q.neighbourhood(d);
        int const qv = nb.vertex_ix, g = R.qtype[qv];
        return pstart[R.qv2p[qv]] + run_orderly->autinv[g][R.qaut[qv]][d.get_value() - nb.vertex_start.get_value()];
    }
    void rs_glue(RState& R, index_t a, index_t b) {   // the free half-edges the glue (and its mirror) uses up
        index_t xs[4] = { a, b, R.Q.mirror(a), R.Q.mirror(b) };
        int was = 0;
        for (int i = 0; i < 4; i++) {
            bool dup = !xs[i].has_value();
            for (int j = 0; j < i && !dup; j++) dup = xs[j] == xs[i];
            if (!dup && R.Q.is_free(xs[i])) was |= 1 << i;
        }
        R.Q.add_edge(a, b);
        for (int i = 0; i < 4; i++) if (was >> i & 1 && !R.Q.is_free(xs[i])) R.nfree--;
    }
    /** Continue the replay R on this node (code length D). full: the node is closed. */
    int replay_from(RState& R, int D, bool full) {
        replay_wait = -1;
        R.pv2q.resize(types.size(), -1);
        thread_local std::vector<int> seg;
        thread_local std::vector<index_t> work;
        for (;; R.s++) {
            int const s = R.s;
            if (R.nfree == 0) return full && s < D ? R_PRUNE : R_TIED;   // a strict prefix is smaller; equal = automorphism
            index_t const ff = face_rule_choice(R.Q, *ids);
            index_t const x{ q2p(R, ff) }, y = conf.opposite(x);
            if (!y.has_value()) { replay_wait = x.get_value(); return R_TIED; }
            auto const& nb = conf.neighbourhood(y);
            int const pv = nb.vertex_ix, qv = R.pv2q[pv], g = types[pv], qy = y.get_value() - nb.vertex_start.get_value();
            long long code;
            int partner = -1;
            if (qv >= 0) { partner = R.qstart[qv] + run_orderly->aut[g][R.qaut[qv]][qy]; code = enc_exist(partner); }
            else code = enc_new(g, run_orderly->repof[g][qy]);
            if (s >= D) return full ? R_DROP : R_TIED;
            if (code != moves[s]) return code < moves[s] ? R_PRUNE : R_DROP;
            if (qv < 0) {
                int const base = R.Q.num_halfedges();
                rs_add(R, g, pv, run_orderly->torep[g][qy]);
                partner = base + run_orderly->repof[g][qy];
            }
            rs_glue(R, ff, index_t{ partner });
            if (!forcing) continue;
            work.assign(1, ff);   // forced closure, as propagate makes it, read off this node
            while (!work.empty()) {
                index_t const e = work.back();
                work.pop_back();
                for (index_t z : { e, R.Q.mirror(e) }) {
                    if (!z.has_value() || R.Q.is_free(z)) continue;
                    index_t far{}, end{};
                    if (!open_face_in(R.Q, z, far, end, seg) || !ids->face_full(seg)) continue;
                    if (!end.has_value() || end == far) continue;
                    // the node made this closure too (it is at its forcing fixpoint); if not, decide nothing
                    if (conf.opposite(index_t{ q2p(R, far) }) != index_t{ q2p(R, end) }) return R_TIED;
                    rs_glue(R, far, end);
                    work.push_back(far);
                }
            }
        }
    }
    // ── decoupled (fail-first runs): the search branches by its own rule, so OUR code is a replay too. Every root's code
    // is read off this node by a rule that is a function of its replay copy alone (the lowest free half-edge, then the
    // forced closures), kept with the copy and resumed; codes are compared only where both are determined.
    void init_replay(RState& R, int t0, int v, int a, int nv) {
        R.Q = tiling_t{}, R.qv2p.clear(), R.qaut.clear(), R.qtype.clear(), R.qstart.clear(), R.code.clear();
        R.pv2q.assign(nv, -1), R.s = 0, R.nfree = 0, R.low = 0, R.done = R.broken = false;
        rs_add(R, t0, v, a);
    }
    void advance(RState& R) {
        replay_wait = -1;
        if (R.broken) return;
        R.pv2q.resize(types.size(), -1);
        thread_local std::vector<int> seg;
        thread_local std::vector<index_t> work;
        for (;;) {
            if (R.nfree == 0) { R.done = true; return; }
            while (!R.Q.is_free(index_t{ R.low })) R.low++;   // glues are never undone in a replay: the lowest only rises
            index_t const ff{ R.low };
            index_t const x{ q2p(R, ff) }, y = conf.opposite(x);
            if (!y.has_value()) { replay_wait = x.get_value(); return; }
            auto const& nb = conf.neighbourhood(y);
            int const pv = nb.vertex_ix, qv = R.pv2q[pv], g = types[pv], qy = y.get_value() - nb.vertex_start.get_value();
            int partner;
            if (qv >= 0) partner = R.qstart[qv] + run_orderly->aut[g][R.qaut[qv]][qy], R.code.push_back(enc_exist(partner));
            else {
                R.code.push_back(enc_new(g, run_orderly->repof[g][qy]));
                int const base = R.Q.num_halfedges();
                rs_add(R, g, pv, run_orderly->torep[g][qy]);
                partner = base + run_orderly->repof[g][qy];
            }
            rs_glue(R, ff, index_t{ partner });
            if (!forcing) continue;
            work.assign(1, ff);
            while (!work.empty()) {
                index_t const e = work.back();
                work.pop_back();
                for (index_t z : { e, R.Q.mirror(e) }) {
                    if (!z.has_value() || R.Q.is_free(z)) continue;
                    index_t far{}, end{};
                    if (!open_face_in(R.Q, z, far, end, seg) || !ids->face_full(seg)) continue;
                    if (!end.has_value() || end == far) continue;
                    if (conf.opposite(index_t{ q2p(R, far) }) != index_t{ q2p(R, end) }) { R.broken = true; return; }   // decide nothing
                    rs_glue(R, far, end);
                    work.push_back(far);
                }
            }
        }
    }
    /** Another root's code against ours, where both are determined. */
    static int compare_codes(RState const& O, RState const& X) {
        if (O.broken || X.broken) return R_TIED;
        size_t const n = std::min(O.code.size(), X.code.size());
        for (size_t i = 0; i < n; i++)
            if (X.code[i] != O.code[i]) return X.code[i] < O.code[i] ? R_PRUNE : R_DROP;
        if (X.done && X.code.size() < O.code.size()) return R_PRUNE;   // a complete strict prefix is smaller
        if (O.done && O.code.size() < X.code.size()) return R_DROP;
        return R_TIED;                                                   // equal and complete: an automorphism
    }
    std::vector<int> ours_st, ours_wait;
    bool orderly_ok_dec(bool full) {
        int const D = depth, nv = (int)types.size(), t0 = types[0];
        auto const& T = *run_orderly;
        if ((int)alive.size() <= D) alive.resize(D + 1), alive_nv.resize(D + 1), pool_end.resize(D + 1), ours_st.resize(D + 1), ours_wait.resize(D + 1);
        pool_used = D == 0 ? 0 : pool_end[D - 1];
        std::vector<Alt>& out = alive[D];
        out.clear();
        alive_nv[D] = nv;
        thread_local std::vector<Alt> cand;
        cand.clear();
        int const nf = (int)T.aut[t0].size();
        if (D == 0) { for (int a = 1; a < nf; a++) cand.push_back({ 0, a, -1, -1 }); }
        else {
            cand = alive[D - 1];
            for (int v = alive_nv[D - 1]; v < nv; v++)
                if (types[v] == t0) for (int a = 0; a < nf; a++) cand.push_back({ v, a, -1, -1 });
        }
        if (cand.empty() && (D == 0 || alive[D - 1].empty())) { pool_end[D] = pool_used; if (D) ours_st[D] = ours_st[D - 1], ours_wait[D] = ours_wait[D - 1]; else ours_st[D] = -1; return true; }
        pstart.assign(nv, 0);
        for (int v = 1; v < nv; v++) pstart[v] = pstart[v - 1] + vc->valence_of(types[v - 1]);
        // ours: resumed when the half-edge it stalled on has been glued
        int os = D == 0 ? -1 : ours_st[D - 1], ow = D == 0 ? -1 : ours_wait[D - 1];
        if (os < 0 || full || ow < 0 || !conf.is_free(index_t{ ow })) {
            int const slot = pool_alloc();
            if (os >= 0) pool[slot] = pool[os]; else init_replay(pool[slot], t0, 0, 0, nv);
            advance(pool[slot]);
            os = slot, ow = replay_wait;
        }
        ours_st[D] = os, ours_wait[D] = ow;
        for (Alt const& r : cand) {
            int slot = r.st, w = r.wait;
            bool fresh = false;
            if (slot < 0 || full || w < 0 || !conf.is_free(index_t{ w })) {
                int const ns = pool_alloc();
                if (slot >= 0) pool[ns] = pool[slot]; else init_replay(pool[ns], t0, r.v, r.a, nv);
                advance(pool[ns]);
                slot = ns, w = replay_wait, fresh = true;
            }
            int const res = compare_codes(pool[os], pool[slot]);
            if (res == R_PRUNE) { pool_end[D] = pool_used; return false; }
            if (res == R_DROP) { if (fresh && slot == pool_used - 1) pool_used--; continue; }
            out.push_back({ r.v, r.a, w, slot });
        }
        pool_end[D] = pool_used;
        return true;
    }
    /** False = cut this node (full: reject the closure). */
    bool orderly_ok(bool full) {
        if (orderly_dec) return orderly_ok_dec(full);
        int const D = depth, nv = (int)types.size(), t0 = types[0];
        auto const& T = *run_orderly;
        if ((int)alive.size() <= D) alive.resize(D + 1), alive_nv.resize(D + 1), pool_end.resize(D + 1);
        pool_used = D == 0 ? 0 : pool_end[D - 1];
        std::vector<Alt>& out = alive[D];
        out.clear();
        alive_nv[D] = nv;
        pool_end[D] = pool_used;
        thread_local std::vector<Alt> cand;
        cand.clear();
        int const nf = (int)T.aut[t0].size();
        if (D == 0) { for (int a = 1; a < nf; a++) cand.push_back({ 0, a, -1, -1 }); }   // symmetries() lists the identity first
        else {
            cand = alive[D - 1];
            for (int v = alive_nv[D - 1]; v < nv; v++)
                if (types[v] == t0) for (int a = 0; a < nf; a++) cand.push_back({ v, a, -1, -1 });
        }
        if (cand.empty()) return true;
        pstart.assign(nv, 0);
        for (int v = 1; v < nv; v++) pstart[v] = pstart[v - 1] + vc->valence_of(types[v - 1]);
        for (Alt const& r : cand) {
            if (!full && r.st >= 0 && r.wait >= 0 && conf.is_free(index_t{ r.wait })) { out.push_back(r); continue; }
            int const slot = pool_alloc();
            RState& R = pool[slot];
            if (r.st >= 0) R = pool[r.st];
            else {
                R.Q = tiling_t{}, R.qv2p.clear(), R.qaut.clear(), R.qtype.clear(), R.qstart.clear(), R.code.clear(), R.low = 0, R.done = R.broken = false, R.pv2q.assign(nv, -1), R.s = 0, R.nfree = 0;
                rs_add(R, t0, r.v, r.a);
            }
            int const res = replay_from(R, D, full);
            if (res == R_PRUNE) { pool_end[D] = pool_used; return false; }
            if (res == R_DROP) { pool_used--; continue; }
            out.push_back({ r.v, r.a, replay_wait, slot });
        }
        pool_end[D] = pool_used;
        return true;
    }

    void extend() {
        num_iterations++;
        task_nodes++;
        if (!iteration(*this)) return;
        if (sym_break && run_syms && last.has_value() && run_syms->cut(conf, types, last)) return;
        if (ring_check && run_ring && last.has_value() && !faces_close(conf, types, *run_ring, *ids, last)) return;
        bool dead;
        Budget const budget{ int(max_num_vertices) - int(num_vertices_added), num_flat < max_flat, required.missing(types) };
        index_t const f = choose_halfedge(conf, *faces, *ids, *vc, *cand, first_vertex, can_add(), dead, budget, &ctx);
        if (dead) return;
        if (orderly_on && depth == 0 && types.size() == 1 && !orderly_ok(false)) return;   // the root's other frames
        if (!f.has_value()) {
            if (orderly_on && !orderly_ok(true)) return;
            if (!required.missing(types) && !(check_chiral && reverses(conf))) solution(*this);
            return;
        }
        for (auto ix : conf.indices())
            if (conf.is_free(ix)) pending = enc_exist(ix.get_value()), try_joining(f, ix);
        if (can_add()) extend_by_adding_vertex(f);
    }
    void extend_by_adding_vertex(index_t f) {
        // Fail first knows which pairs pass (the context cache; a copy, as the table may be emptied further down). The
        // face rule asks the cache too while no budget binds (B4,C6 k <= 10 -16% CPU, spear k <= 8 -21%); once one
        // binds, most types are refused before any test, and filling the cache for all of them cost more (freedraw
        // 3,4,6 k <= 3 +58%), so it pushes the candidates and lets try_joining test them, as his search did.
        bool const cached = !face_first || (num_vertices_added < max_num_vertices && (num_flat < max_flat || !max_flat) && !required.missing(types));
        // held, so it stays valid below; the kept lists are fewest options' (the face rule asks once a node)
        PairList const passing = !cached ? nullptr : face_first ? passing_list(conf, *faces, *ids, *vc, *cand, f) : ctx.list(conf, *faces, *ids, *vc, *cand, f);
        auto const& list = cached ? *passing : cand->at(conf, f, *ids);
        auto it = std::lower_bound(list.begin(), list.end(), first_vertex, [](Candidates::Pair p, int t) { return p.t < t; });
        uint64_t const miss = required.missing(types);
        while (it != list.end()) {
            int const t = it->t, base = conf.num_halfedges();
            if (!room(t) || !required.may_add(miss, first_vertex, t, max_num_vertices - num_vertices_added - !is_flat(*vc, t)) ||
                (cut_vc == (void const*)vc && recolor_min_type[t] < first_vertex)) {
                while (it != list.end() && it->t == t) ++it;
                continue;
            }
            add_vertex(t);
            for (; it != list.end() && it->t == t; ++it) pending = enc_new(t, it->i), try_joining(f, index_t{ base + it->i });
            remove_last_vertex();
        }
    }
    void try_joining(index_t a, index_t b) {
        if (!conf.halfedges_compatible(a, b)) return;
        if (!faces->can_be_adjacent(conf.left_label(a), conf.right_label(b)) ||
            !faces->can_be_adjacent(conf.right_label(a), conf.left_label(b))) return;
        if (chiral && !sides.ok(conf, *vc, types, a, b)) return;
        int const settled = chiral ? sides.settle(conf, *vc, types, a, b) : -1;
        conf.add_edge(a, b);
        if (faces->check_adjacent_cw_face(conf, a) && faces->check_adjacent_ccw_face(conf, a)) {
            index_t const was = last;
            auto const changed = face_first ? CtxCache::Changed{} : CtxCache::changed_by(conf, a);   // fewest options' lists only
            for (int i = 0; i < changed.n; i++) ctx.touch(changed.h[i]);
            size_t const mark = forced.size();
            if (!forcing || propagate(a)) {
                if (orderly_on) {
                    if ((int)moves.size() <= depth) moves.resize(depth + 1);
                    moves[depth++] = pending;
                    if (orderly_ok(false)) last = a, extend(), last = was;
                    depth--;
                } else last = a, extend(), last = was;
            }
            unwind(mark);
            for (int i = 0; i < changed.n; i++) ctx.touch(changed.h[i]);
        }
        conf.remove_edge(a, b);
        sides.unsettle(settled);
    }
};


/**
 * Per root type of `order`, the nodes of its search to `depth` vertices (unpruned by required sets): over the
 * whole alphabet when `whole`, else from its own type on, as the search goes. Also each root type's line
 * (its place in `order`).
 */
// With --progress, the startup's long steps print `stage <name> <done> <total>` twice a second, so a board of
// thousands of root types does not look frozen before its first `roots` line.
static bool show_stages = false;
// --first: write the first tiling found and exit; --seconds: exit with status 4 past this many seconds
// (checked with the progress line). Both serve --find (find.h), which runs this executable per step.
static bool first_only = false;
static double time_limit = 0;

/** The least depth in edges, below `most`, at which root r's search has UNIT_TARGET nodes; else `most`. */
template<class Faces>
static int unit_depth_of(int r, int most, int kmax, vertex_classification const& vc, Faces const& faces, FastFaces const& ids, Candidates const& cand) {
    for (int d = 1; d < most; d++) {
        int n = 0;
        Extender p{ tiling_t{}, &faces, &ids, &vc, &cand, [&](auto const& s) { return s.conf.num_edges() < d || (n++, false); }, [](auto const&) {} };
        p.add_vertex(r);
        p.first_vertex = r, p.max_num_vertices = kmax, p.max_flat = flat_max;
        p.extend();
        if (n >= UNIT_TARGET) return d;
    }
    return most;
}

// for_each_tiling_threaded (tiling_extender.h) with every root counted, so the caller learns when each
// one finishes. With unit_depth > 0 each root is split into units: its head (unit 0) searches the nodes
// above the root's depth (unit_depth_of, at most unit_depth edges) on one thread, so it meets the rest in the same order every time, and numbers
// each node at that depth 1, 2, ...; each becomes a task of its own. A unit in the root's `skip`
// is not searched (the head still runs, to number the others). on_tiling(r, u, conf, k), on_task_end()
// and on_unit_done(r, u, root_done) run on worker threads; on_unit_done runs when a unit finishes or,
// with root_done, when its root does (that unit's own call may then come after it).
template<class FaceType, class FT, class FE, class FD>
static void search(std::vector<int> const& roots, int kmax, vertex_classification const& vc, FaceType const& faces,
                   FastFaces const& ids, Candidates const& cand, int threads, std::vector<std::unique_ptr<Root>>& state, FT on_tiling, FE on_task_end,
                   FD on_unit_done, int unit_depth = 0) {
    Pool pool;
    // A task hands over its output before its counts drop, so a unit or root that reaches 0 has all of it.
    auto finish = [&](int r, int u, Unit* p) {
        on_task_end();
        bool const whole = --p->tasks == 0;
        if (whole) state[r]->units_done++;
        bool const root = --state[r]->tasks == 0;
        if (whole || root) on_unit_done(r, u, root);
    };
    thread_local std::vector<std::function<void()>> found;   // the head's units, pushed once it is done
    for (int r : roots) {
        Extender s{ tiling_t{}, &faces, &ids, &vc, &cand,
            [&](auto const& s) {
                if ((++my_nodes & 4095) == 0 && live_nodes.fetch_add(4096, std::memory_order_relaxed) + 4096 >= node_cap.load(std::memory_order_relaxed))
                    capped.store(true, std::memory_order_relaxed);
                if (capped.load(std::memory_order_relaxed)) return false;
                if (unit_depth && !s.unit) {   // the head is never handed off
                    Root& st = *state[s.first_vertex];
                    if (s.conf.num_edges() < st.depth) return true;
                    int const u = st.next_unit++;
                    if (st.skip.count(u)) return false;
                    auto clone{ s };
                    clone.unit = u, clone.task_nodes = 0, clone.base_edges = clone.conf.num_edges();
                    { std::lock_guard<std::mutex> l(st.mutex); clone.part = &st.units[u]; }
                    st.tasks++;
                    found.push_back([clone, &finish]() mutable { clone.extend(); finish(clone.first_vertex, clone.unit, clone.part); });
                    return false;
                }
                // Give this node's subtree away only when a thread is waiting for work, and only near the top
                // of this task's own subtree, where the work is (his engine gave away whatever node it was at,
                // every 10 nodes while 64 tasks were not yet queued: mostly small deep subtrees, handed back and
                // forth through the lock). Never at a task's first node, or a task would only pass itself on.
                if (s.task_nodes < 2 || !pool.hungry() || s.conf.num_edges() - s.base_edges > split_depth) return true;
                auto clone{ s };
                clone.task_nodes = 0;
                clone.base_edges = clone.conf.num_edges();
                state[clone.first_vertex]->tasks++;
                clone.part->tasks++;
                pool.push([clone, &finish]() mutable { clone.extend(); finish(clone.first_vertex, clone.unit, clone.part); });
                return false;
            },
            [&](auto const& s) { my_complete++; cur_types = &s.types; on_tiling(s.first_vertex, s.unit, s.conf, (int)s.num_vertices_added); cur_types = nullptr; } };
        s.add_vertex(r);
        s.first_vertex = r;
        s.part = &state[r]->units[0];
        s.max_num_vertices = kmax;
        s.max_flat = flat_max;
        pool.push([s, &finish, &pool, &state, unit_depth, kmax, &vc, &faces, &ids, &cand]() mutable {
            state[s.first_vertex]->started = true;
            if (unit_depth) state[s.first_vertex]->depth = unit_depth_of(s.first_vertex, unit_depth, kmax, vc, faces, ids, cand);
            if (!(cut_vc == (void const*)&vc && recolor_min_type[s.first_vertex] < s.first_vertex)) s.extend();
            // last first: the stack is LIFO, so one thread runs the units in the head's order
            for (auto it = found.rbegin(); it != found.rend(); ++it) pool.push(std::move(*it));
            found.clear();
            finish(s.first_vertex, 0, s.part);
        });
    }
    pool.run(threads);
}

// ── probes: Knuth's estimator, shared by the plan below and tileestimate.cpp ──

namespace est {

struct Search {
	Board b;
	vertex_classification vc;
	FastFaces const* faces = nullptr;
	Candidates const* cand = nullptr;
	int roots = 0;
	/** Per template, its symmetries: permutations of its half-edges keeping labels, neighbours and mirrors. */
	std::vector<std::vector<std::vector<int>>> aut;
	int depth = 0;        // the most vertices, when not the board's kmax (the plan's ranking: its shallow trees)
	bool whole = false;   // trees over the whole alphabet, not only the types from the root on (the ranking)
	std::shared_ptr<RingTables const> ring;   // for ring_check; none: the check is skipped
	std::shared_ptr<RootSyms const> syms;     // for sym_break; none: the check is skipped
	int kmax() const { return depth ? depth : b.kmax; }
};

// One node of the search: the partial tiling, and the template of every vertex in it, in order.
struct Node {
	Search const* s;
	tiling_t conf;
	std::vector<int> types;
	int root = 0;

	int k = 0, flat = 0;   // vertices that count toward k, and flat ones (tilesearch.cpp flat_max)
	bool room(int t) const { return is_flat(s->vc, t) ? flat < (int)flat_max : k < s->kmax(); }
	bool can_add() const { return k < s->kmax() || flat < (int)flat_max; }

	std::vector<index_t> glued;   // the half-edge of each glue on the way here (ring_check needs the last)
	Sides sides;                  // chiral: each vertex's side (set when a move places it)
	index_t best(bool& dead) {   // Extender::extend's choice (choose_halfedge), after its symmetry and ring checks
		if (sym_break && s->syms && !glued.empty() && s->syms->cut(conf, types, glued.back())) { dead = true; return {}; }
		if (ring_check && s->ring && !glued.empty() && !faces_close(conf, types, *s->ring, *s->faces, glued.back())) { dead = true; return {}; }
		return choose_halfedge(conf, *s->faces, *s->faces, s->vc, *s->cand, root, can_add(), dead, Budget{ s->kmax() - k, flat < (int)flat_max, required.missing(types) });
	}
	bool join(index_t a, index_t b) {   // Extender::try_joining's tests, the edge left in place when they pass
		if (!conf.halfedges_compatible(a, b)) return false;
		if (!s->faces->can_be_adjacent(conf.left_label(a), conf.right_label(b)) ||
			!s->faces->can_be_adjacent(conf.right_label(a), conf.left_label(b))) return false;
		if (chiral && !sides.ok(conf, s->vc, types, a, b)) return false;
		conf.add_edge(a, b);
		if (s->faces->check_adjacent_cw_face(conf, a) && s->faces->check_adjacent_ccw_face(conf, a)) return true;
		conf.remove_edge(a, b);
		return false;
	}
	void add_vertex(int t) { ++(is_flat(s->vc, t) ? flat : k), s->vc.push_vertex_to(conf, t), types.push_back(t); if (chiral) sides.push(); }
	void pop_vertex() { --(is_flat(s->vc, types.back()) ? flat : k), conf.pop_vertex(), types.pop_back(); if (chiral) sides.pop(); }

	// A child: f glued to an existing half-edge (t < 0), or to half-edge ix of a new vertex of template t.
	struct Move { int t, ix; };
	void children(index_t f, std::vector<Move>& out) {   // Extender::extend and extend_by_adding_vertex
		out.clear();
		for (auto ix : conf.indices())
			if (conf.is_free(ix) && join(f, ix)) conf.remove_edge(f, ix), out.push_back({ -1, ix.get_value() });
		if (!can_add()) return;
		uint64_t const miss = required.missing(types);
		// the pairs that pass the join tests, from the context cache while no budget binds (Extender's rule)
		bool const cached = k < s->kmax() && (flat < (int)flat_max || !flat_max) && !miss;
		std::vector<Candidates::Pair> passing;
		if (cached) passing = passing_pairs(conf, *s->faces, *s->faces, s->vc, *s->cand, f);
		auto const& list = cached ? passing : s->cand->at(conf, f, *s->faces);
		auto it = std::lower_bound(list.begin(), list.end(), root, [](Candidates::Pair p, int t) { return p.t < t; });
		while (it != list.end()) {
			int const t = it->t, base = conf.num_halfedges();
			if (!room(t) || !required.may_add(miss, root, t, s->kmax() - k - !is_flat(s->vc, t))) {   // Extender's tests
				while (it != list.end() && it->t == t) ++it;
				continue;
			}
			if (cached) {
				for (; it != list.end() && it->t == t; ++it) out.push_back({ t, base + it->i });
				continue;
			}
			add_vertex(t);
			for (; it != list.end() && it->t == t; ++it)
				if (join(f, index_t{ base + it->i })) conf.remove_edge(f, index_t{ base + it->i }), out.push_back({ t, base + it->i });
			pop_vertex();
		}
	}
	void apply(index_t f, Move m) {
		if (m.t >= 0) add_vertex(m.t);
		if (chiral) sides.settle(conf, s->vc, types, f, index_t{ m.ix });
		conf.add_edge(f, index_t{ m.ix });
		glued.push_back(f);
	}
	void undo(index_t f, Move m) {
		glued.pop_back();
		conf.remove_edge(f, index_t{ m.ix });
		if (m.t >= 0) pop_vertex();
	}
};

static Node start(Search const& s, int r) {
	Node n{ &s, {}, {}, s.whole ? 0 : r };
	n.add_vertex(r);
	return n;
}

/** How many times the search reaches the complete tiling `t`: the starts whose replay rebuilds it. */
static int multiplicity(Node const& t) {
	Search const& s = *t.s;
	std::vector<int> start_of, type_of(t.conf.num_halfedges());
	for (auto ix : t.conf.indices())
		if (t.conf.neighbourhood(ix).vertex_start == ix) start_of.push_back(ix.get_value());
	for (int v = 0; v < (int)start_of.size(); v++)
		for (int j = 0; j < s.vc.valence_of(t.types[v]); j++) type_of[start_of[v] + j] = t.types[v];
	Node p = start(s, t.root);
	std::vector<int> phi, psi(t.conf.num_halfedges(), -1);   // p's half-edges in t, and back
	auto place = [&](int base, int vs, std::vector<int> const& sigma) {
		phi.resize(base + sigma.size());
		for (int j = 0; j < (int)sigma.size(); j++) phi[base + j] = vs + sigma[j], psi[vs + sigma[j]] = base + j;
	};
	auto unplace = [&](int base) {
		for (int j = base; j < (int)phi.size(); j++) psi[phi[j]] = -1;
		phi.resize(base);
	};
	std::function<int()> replay = [&]() -> int {
		bool dead;
		index_t f = p.best(dead);
		if (dead) return 0;
		if (!f.has_value()) return 1;   // closed, and mapped into t: it is t
		index_t g = t.conf.opposite(index_t{ phi[f.get_value()] });
		if (!g.has_value()) return 0;
		if (int ix = psi[g.get_value()]; ix >= 0) {   // glue to a half-edge already placed
			if (!p.conf.is_free(index_t{ ix }) || !p.join(f, index_t{ ix })) return 0;
			p.glued.push_back(f);   // best()'s cuts read the last glue, as the search's do
			int r = replay();
			p.glued.pop_back();
			p.conf.remove_edge(f, index_t{ ix });
			return r;
		}
		int const vs = t.conf.neighbourhood(g).vertex_start.get_value(), tw = type_of[g.get_value()], o = g.get_value() - vs;
		if (!p.room(tw) || tw < t.root) return 0;
		int count = 0;
		for (auto const& sigma : s.aut[tw]) {   // the new vertex, lined up every way that puts a representative on g
			int i = int(std::find(sigma.begin(), sigma.end(), o) - sigma.begin());
			if (!s.vc.is_representative_of_orbit(tw, i)) continue;
			int const base = p.conf.num_halfedges();
			p.add_vertex(tw);
			place(base, vs, sigma);
			if (p.join(f, index_t{ base + i })) p.glued.push_back(f), count += replay(), p.glued.pop_back(), p.conf.remove_edge(f, index_t{ base + i });
			unplace(base);
			p.pop_vertex();
		}
		return count;
	};
	int m = 0;
	for (int v = 0; v < (int)start_of.size(); v++)
		if (t.types[v] == t.root)
			for (auto const& sigma : s.aut[t.root]) place(0, start_of[v], sigma), m += replay(), unplace(0);
	return m;
}

// ── estimate: random probes ──

struct Moments {
	double n = 0, s = 0, ss = 0;
	void add(double x) { n++, s += x, ss += x * x; }
	double mean() const { return n ? s / n : 0; }
	double var_of_mean() const { return n > 1 ? std::max(0.0, ss / n - mean() * mean()) / (n - 1) : 0; }
};
struct RootStats {
	Moments nodes, cpu, path_nodes, tilings;
	Moments level_cpu;   // CPU seconds timed in the level-wide probe itself (see probe): what the plan compares
	double cross = 0;   // sum over probes of cpu * path_nodes, for the ratio's variance
	std::map<int, Moments> complete, unique;
	std::mutex m;
};

using Clock = std::chrono::steady_clock;
static double since(Clock::time_point t) { return std::chrono::duration<double>(Clock::now() - t).count(); }
// A probe's timings are this thread's CPU time, so a pause while the machine is busy (another search, another
// program) does not count as work. Wall time made the plan's rule flip between runs: on bubble 4 (k <= 6) the face
// rule's estimate ranged 173-1,840 s over five runs (experiments/results/tilesearch-plan-variance-2026-10-30.log).
// Windows keeps the wall clock: its thread clock ticks every 15.6 ms, coarser than a node.
#ifdef _WIN32
static double cpu_now() { return std::chrono::duration<double>(Clock::now().time_since_epoch()).count(); }
#else
static double cpu_now() { timespec t; clock_gettime(CLOCK_THREAD_CPUTIME_ID, &t); return t.tv_sec + t.tv_nsec * 1e-9; }
#endif

// What the engine does at a complete tiling (main's on_tiling): fingerprint it, and write the certificate
// of a minimal one. Every reach is fingerprinted; a minimal tiling is written once, so its writing is
// charged at 1/m of the reach.
static double leaf_cost(Node const& n, original_tiling_writer& writer, bool& minimal, double& write) {
	double const t0 = cpu_now();
	Fingerprints::Key key;
	minimal = fingerprint_if_minimal(n.conf, key);
	double const fp = (cpu_now() - t0);
	write = 0;
	if (minimal) {
		double const t1 = cpu_now();
		thread_local std::string text;
		certificate(text, writer, n.conf, n.s->vc, &n.types);
		write = (cpu_now() - t1);
	}
	return fp;
}

// The engine's time per node, by Knuth's single path: it works on one tiling as the engine's depth-first
// walk does, so the time measured at a node is the engine's (the level-wide probe below keeps hundreds of
// tilings in flight and measured 44-71% high). A path's time is noisy, and so is its node count, but
// together: their ratio, times the level-wide probe's node count, is the CPU estimate (a ratio estimator;
// experiments/results/searcher-estimate-2026-10-25.md). Returns {weighted time, weighted nodes}.
static std::pair<double, double> path_cpu(Search const& s, original_tiling_writer& writer, int r, std::mt19937_64& rng) {
	Node n = start(s, r);
	double w = 1, cpu = 0, nodes = 0;
	std::vector<Node::Move> ms;
	for (;;) {
		double const t0 = cpu_now();
		nodes += w;
		bool dead;
		index_t f = n.best(dead);
		if (dead) return { cpu + w * (cpu_now() - t0), nodes };
		if (!f.has_value()) {
			cpu += w * (cpu_now() - t0);
			if (n.k >= s.b.kmin && !required.missing(n.types)) {
				bool minimal;
				double write;
				cpu += w * leaf_cost(n, writer, minimal, write);
				if (minimal) cpu += w * write / (s.aut.empty() ? 1 : multiplicity(n));   // the plan has no symmetries: write charged whole
			}
			return { cpu, nodes };
		}
		n.children(f, ms);
		cpu += w * (cpu_now() - t0);
		if (ms.empty()) return { cpu, nodes };
		w *= ms.size();
		n.apply(f, ms[std::uniform_int_distribution<size_t>(0, ms.size() - 1)(rng)]);
	}
}

// One probe: Chen's heuristic sampling (SIAM J. Comput. 21, 1992). The tree is walked a level at a time
// (a level adds one edge), every child of the level's nodes is kept, and children of the same kind (same
// vertex count, same number of free half-edges) are merged into one representative carrying their total
// weight, picked among them in proportion to weight. Still unbiased, like Knuth's single path, but rare
// branches are not lost: a probe sees every kind of node at every level.
static void probe(Search const& s, original_tiling_writer& writer, int r, std::mt19937_64& rng, RootStats& st) {
	struct Item { Node n; double w; };
	std::vector<Item> level{ { start(s, r), 1.0 } };
	double nodes = 0, level_cpu = 0;
	std::map<int, double> complete, unique;
	std::vector<Node::Move> ms;
	std::uniform_real_distribution<double> u01;
	auto kind = [](Node const& n) {
		int free = 0;
		for (auto ix : n.conf.indices()) free += n.conf.is_free(ix);
		return std::pair{ (int)n.types.size(), free };   // all vertices: a flat one changes the node too
	};
	while (!level.empty()) {
		std::map<std::pair<int, int>, Item> next;
		for (auto& [n, w] : level) {
			nodes += w;
			bool dead;
			double const c0 = est::cpu_now();   // the engine's own work at this node, weighted like its count
			index_t f = n.best(dead);
			if (dead) {
				level_cpu += w * (cpu_now() - c0);
				continue;
			}
			if (!f.has_value()) {
				int k = n.k;
				if (k >= s.b.kmin && !required.missing(n.types)) {
					complete[k] += w;
					Fingerprints::Key key;
					bool const minimal = fingerprint_if_minimal(n.conf, key);
					level_cpu += w * (cpu_now() - c0);
					// unique counts need the templates' symmetries (tileestimate); the plan skips them
					if (minimal && !s.aut.empty()) unique[k] += w / multiplicity(n);
				} else level_cpu += w * (cpu_now() - c0);
				continue;
			}
			n.children(f, ms);
			level_cpu += w * (cpu_now() - c0);
			for (auto m : ms) {
				Node c = n;
				c.apply(f, m);
				auto key = kind(c);
				auto it = next.find(key);
				if (it == next.end()) next.emplace(key, Item{ std::move(c), w });
				else if (it->second.w += w; u01(rng) < w / it->second.w) it->second.n = std::move(c);
			}
		}
		level.clear();
		for (auto& [key, item] : next) level.push_back(std::move(item));
	}
	auto const [cpu, path_nodes] = path_cpu(s, writer, r, rng);
	double total = 0;
	for (auto [k, u] : unique) total += u;
	std::lock_guard<std::mutex> l(st.m);
	st.nodes.add(nodes), st.cpu.add(cpu), st.path_nodes.add(path_nodes), st.tilings.add(total), st.cross += cpu * path_nodes;
	st.level_cpu.add(level_cpu);
	for (int k = s.b.kmin; k <= s.b.kmax; k++) st.complete[k].add(complete[k]), st.unique[k].add(unique[k]);
}

/** Nodes and CPU seconds over a set of roots, each with its standard error. */
/** Nodes and CPU seconds over a set of roots, each with its standard error. `cpu` is the path ratio estimate (the
 *  calibrated one tileestimate reports); `level_cpu` is timed in the level-wide probe, whose spread is the nodes',
 *  far below a single path's: the plan compares ways by it (a path's time swung 10x between runs). */
struct Totals { double nodes = 0, nodes_se = 0, cpu = 0, cpu_se = 0, level_cpu = 0, level_cpu_se = 0; };

/**
 * Probes a set of roots, round after round: its counts carry over, so a caller can probe a little, look, and
 * probe more. After a first pass of a few probes per root, a tenth of the probes go round-robin and the rest to
 * each root in proportion to its estimated size in nodes (better than half and half on every board measured),
 * which the probes estimate well (within a few percent on every board measured). Weighing by each root's
 * observed spread instead (Neyman allocation) was measured and rejected: a root whose first probes came in low
 * is then starved, and its estimate stays low (hybrid_2_9830 k = 2 came out 25% low on every seed;
 * experiments/results/searcher-estimate-2026-10-25.md).
 */
struct Sampler {
	static constexpr int FIRST_PASS = 4;
	Search const& s;
	std::vector<int> roots;
	std::vector<RootStats> stats;
	std::atomic<uint64_t> next{ 0 }, probes{ 0 };
	uint64_t seed, rounds = 0;
	double seconds = 0;   // spent probing so far, over every round
	std::mutex alloc;
	std::discrete_distribution<int> pick;
	bool weighed = false;
	// The first pass visits the roots in a fixed shuffled order, not theirs: the plan ranks roots cheapest first,
	// so a first pass cut short in that order saw only the cheap ones (1247_1_0612 k <= 2: fewest estimated
	// ~5e3 nodes against 7.57M). totals() extrapolates the roots not yet probed from the probed ones.
	std::vector<int> pass;
	Sampler(Search const& s, std::vector<int> r, uint64_t seed) : s(s), roots(std::move(r)), stats(s.roots), seed(seed), pass(roots) {
		std::shuffle(pass.begin(), pass.end(), std::mt19937_64(0x51ed5eedULL + seed));
	}

	void reweigh() {
		if (next < FIRST_PASS * roots.size()) return;
		std::vector<double> w;
		for (int r : roots) w.push_back(stats[r].nodes.mean() + 1e-9);
		std::lock_guard<std::mutex> l(alloc);
		pick = std::discrete_distribution<int>(w.begin(), w.end());
		weighed = true;
	}
	/** Probe for `secs` on `threads` threads; `each_second(t)` runs on this thread once a second, t counted over every round. */
	void run(double secs, int threads, std::function<void(double)> const& each_second = {}) {
		if (roots.empty()) return;
		double const by_size = std::getenv("TILEESTIMATE_BY_SIZE") ? std::atof(std::getenv("TILEESTIMATE_BY_SIZE")) : 0.9;
		auto const t0 = Clock::now();
		uint64_t const round = rounds++;
		std::vector<std::thread> pool;
		for (int i = 0; i < threads; i++)
			pool.emplace_back([&, i] {
				std::mt19937_64 rng(seed + 0x9e3779b97f4a7c15ULL * (i + 1) + 0xbf58476d1ce4e5b9ULL * round);
				original_tiling_writer writer{ s.vc };   // one per thread: it keeps state while writing
				std::uniform_real_distribution<double> u01;
				while (since(t0) < secs) {
					uint64_t const j = next++;
					int r;
					if (j < FIRST_PASS * roots.size() || !weighed || u01(rng) >= by_size) r = pass[j % pass.size()];
					else {
						std::lock_guard<std::mutex> l(alloc);
						r = roots[pick(rng)];
					}
					probe(s, writer, r, rng, stats[r]);
					probes++;
				}
			});
		double const before = seconds;
		for (double t = 0.1; t < secs; t += 0.1) {
			std::this_thread::sleep_for(std::chrono::duration<double>(std::max(0.0, t - since(t0))));
			reweigh();
			if (each_second && std::floor(before + t) > std::floor(before + t - 0.1)) each_second(before + t);
		}
		for (auto& t : pool) t.join();
		reweigh();
		seconds += secs;
	}
	Totals totals() {
		double nodes = 0, nodes_var = 0, cpu = 0, path_nodes = 0, level = 0, level_var = 0;
		Moments node_means, level_means;   // over the probed roots: the spread between roots
		for (int r : roots) {
			auto& st = stats[r];
			std::lock_guard<std::mutex> l(st.m);
			if (!st.nodes.n) continue;
			nodes += st.nodes.mean(), nodes_var += st.nodes.var_of_mean();
			cpu += st.cpu.mean(), path_nodes += st.path_nodes.mean();
			level += st.level_cpu.mean(), level_var += st.level_cpu.var_of_mean();
			node_means.add(st.nodes.mean()), level_means.add(st.level_cpu.mean());
		}
		// Roots not yet probed: the probed ones are a random sample of them (the shuffled first pass), so scale up,
		// and add the sampling variance of a total from m of N (with the finite-population correction).
		double const N = roots.size(), m = node_means.n;
		if (m > 0 && m < N) {
			double const f = N / m;
			auto between = [&](Moments const& x) { return N * N * x.var_of_mean() * (1 - m / N); };   // var(N x mean)
			nodes_var = nodes_var * f + between(node_means), level_var = level_var * f + between(level_means);
			nodes *= f, cpu *= f, path_nodes *= f, level *= f;
		}
		// seconds per node along the paths, times the nodes. Its relative variance is the nodes' plus the
		// ratio's (delta method: per root, the variance of cpu - ratio * path_nodes, over path_nodes squared).
		double const per_node = path_nodes > 0 ? cpu / path_nodes : 0;
		double ratio_var = 0;
		for (int r : roots) {
			auto& st = stats[r];
			std::lock_guard<std::mutex> l(st.m);
			if (st.cpu.n < 2) continue;
			double const n = st.cpu.n, cov = (st.cross / n - st.cpu.mean() * st.path_nodes.mean());
			double const var = st.cpu.var_of_mean() * (n - 1) + per_node * per_node * st.path_nodes.var_of_mean() * (n - 1) - 2 * per_node * cov;
			ratio_var += std::max(0.0, var) / (n - 1);
		}
		double const rel = (nodes > 0 ? nodes_var / (nodes * nodes) : 0) + (path_nodes > 0 ? ratio_var / (path_nodes * path_nodes) : 0);
		return { nodes, std::sqrt(nodes_var), nodes * per_node, nodes * per_node * std::sqrt(rel), level, std::sqrt(level_var) };
	}
};

}   // namespace est

/**
 * Local death: the words among `alive` that no tiling at any k can use, proven by the search itself. From each
 * type, search over the whole alphabet (every alive word, no root order) up to `depth` vertices: a branch that
 * reaches the depth or the flat budget, or closes, may continue into a tiling, so it counts as alive; a type is
 * dead only when every branch ends in a contradiction first (best() finds a half-edge with no move), which no
 * larger k changes. Complements the balance LP, which proves by counting (balance.h calls this in its fixpoint).
 * Over the 74 finished runs of 2026-10-30, depth 4 proved 1,966 never-used lines dead and no used one
 * (experiments/results/local-death-2026-10-30.log). Returns the dead words, keyed as balance keys them.
 */
std::set<balance::Word> local_dead(Board const& b, std::set<balance::Word> const& alive, int depth) {
    est::Search s;
    s.b = b;
    for (auto const& w : b.vertices) balance::add_line(b, w, s.vc, &alive);
    s.roots = s.vc.count();
    FastFaces const faces(b.faces, b.apeirogons);
    Candidates const cand(s.vc, faces, faces);
    s.faces = &faces, s.cand = &cand, s.whole = true, s.depth = depth;
    Required const kept = std::exchange(required, Required{});   // no required-set pruning: dead must mean dead
    size_t const kept_flat = std::exchange(flat_max, flat_budget(b, depth));
    std::vector<char> dead(s.roots, 0);
    std::atomic<int> next{ 0 };
    // A type past LOCAL_NODES nodes, and every type once the call has spent LOCAL_TOTAL, counts as alive: nothing
    // is proven there, so the caps only weaken the test. Dead types die in small trees (A12 three-star, star24full:
    // the same deaths at 1e4 as at 1e6), and 2,400 types x 1e6 cost hours on A6p90,A6p90.150.
    // A clock bounds it too: a node can cost 140 us (a6mix, 2,118 lines), so node caps alone allowed hours.
    static uint64_t const LOCAL_NODES = 10000, LOCAL_TOTAL = 50000000;
    static double const LOCAL_SECONDS = 2;
    std::atomic<uint64_t> spent{ 0 };
    std::atomic<bool> late{ false };
    auto const t0 = est::Clock::now();
    std::function<bool(est::Node&, uint64_t&)> alive_below = [&](est::Node& n, uint64_t& nodes) {
        if ((++nodes & 15) == 0 && est::since(t0) > LOCAL_SECONDS) late = true;
        if (late || nodes > LOCAL_NODES || n.k >= s.kmax() || n.flat >= (int)flat_max) return true;
        bool contradiction;
        index_t f = n.best(contradiction);
        if (contradiction) return false;
        if (!f.has_value()) return true;
        std::vector<est::Node::Move> ms;
        n.children(f, ms);
        for (auto m : ms) {
            n.apply(f, m);
            bool const a = alive_below(n, nodes);
            n.undo(f, m);
            if (a) return true;
        }
        return false;
    };
    std::vector<std::thread> pool;
    for (unsigned i = 0; i < std::max(1u, std::thread::hardware_concurrency()); i++)
        pool.emplace_back([&] {
            for (int t; (t = next++) < s.roots;) {
                est::Node n = est::start(s, t);
                uint64_t nodes = 0;
                if (!late && est::since(t0) > LOCAL_SECONDS) late = true;   // most types stop before the 16-node check
                if (late || spent.load(std::memory_order_relaxed) > LOCAL_TOTAL) continue;   // over budget: alive
                dead[t] = !alive_below(n, nodes);
                spent += nodes;
            }
        });
    for (auto& th : pool) th.join();
    required = kept, flat_max = kept_flat;
    // a word stands for a type and its mirror image: dead only when every type keyed by it is
    std::set<balance::Word> out, live;
    for (int t = 0; t < s.roots; t++) {
        auto const& cw = s.vc.word_with_symmetries(t);
        balance::Word x;
        for (int i = 0; i < cw.size(); i++) x.push_back(cw.letter(i));
        (dead[t] ? out : live).insert(std::min(balance::least_rotation(x), balance::reversed(x)));
    }
    for (auto const& w : live) out.erase(w);
    return out;
}

// ── the start set and the branching rule ──
//
// A run picks the required set it starts from and its branching rule (fewest options, or the face nearest to
// closing) by probing each pair at the run's own kmax: Knuth's estimator (est::Sampler, the one tileestimate
// reports with) gives each pair's search size and CPU time, and the least time wins. It replaced trial searches
// to k <= 1, 2, 3, ... whose growth was carried on to kmax. The rules' costs cross as k grows (A12p60.120: fewest
// options takes fewer nodes up to k = 10 and 36x more at k = 22), so the carried growth picked wrong (glider
// k <= 6: 24 s against 3.7 s); a round of trials past the budget was thrown away whole (3^7 k <= 5: 299 s of
// trials, none of them used); and the budget counted nodes, where a node of one rule cost 6x one of the other.
// On the 2026-10-28 benchmark the probes' picks came within 3% of the best rule in total, the trials' within 48%
// (experiments/results/tilesearch-probe-rule-2026-10-30.log, tilesearch-preprocess-profile-2026-10-30.log).
// Each pair is probed PLAN_ROUND at a time until it has had PLAN_SHARE of the best estimated search time on the
// run's threads, at least PLAN_MIN and at most PLAN_MAX; a pair PLAN_BEHIND times the best is dropped.
// TILESEARCH_FACE_FIRST / TILESEARCH_FAIL_FIRST force the rule.
static double const PLAN_SHARE = 0.02, PLAN_MIN = 0.1, PLAN_MAX = 1.5, PLAN_ROUND = 0.1, PLAN_BEHIND = 8, PLAN_HEAVY = 0.4;

/** One way to run the search: the required set it starts from, its branching rule, and what its probes say. */
struct Way {
    int pick;            // required set (vertex_order), -1 for the default
    bool face;
    est::Totals est{};   // its nodes and CPU seconds at kmax
    double secs = 0;     // probed so far
    bool out = false;
    bool capped = false;   // dropped before probing: its ranking would have cost more than the plan allows
};

/** The vertex types of one start set, with its required-set tables, ready to probe. */
struct SetTables {
    est::Search s;
    Required req;
    std::vector<int> order, line_of;   // the vertex lines in order; per root type, its line
    int lines = 0;                     // root lines
    std::unique_ptr<Candidates> cand;
};

/**
 * The order of the run in `dir` and its roots: its order.txt, whose first lines are one required set (any
 * the run chose), or the board's default order for a run from before the ranking. Null with no order.txt.
 */
static std::pair<std::vector<int>, int> recorded_order(fs::path const& dir, Board const& b, int& pick) {
    std::ifstream f(dir / "order.txt");
    pick = -1;
    if (!f) return vertex_order(b);
    std::vector<int> order;
    for (int v; f >> v;) order.push_back(v - 1);
    auto same = [](std::vector<int> a, std::vector<int> c) { std::sort(a.begin(), a.end()); std::sort(c.begin(), c.end()); return a == c; };
    for (pick = -1; pick < (int)required_sets(b).size(); pick++) {
        auto const [o, n] = vertex_order(b, pick);
        if (order.size() == o.size() && same({ order.begin(), order.begin() + n }, { o.begin(), o.begin() + n }) && same(order, o))
            return { order, n };
    }
    // a run started before `require face` lines gave sets: its order has no start set from them
    if (auto const [o, n] = vertex_order(b, -1, false); !b.require_faces.empty() && same(order, o)
        && same({ order.begin(), order.begin() + n }, { o.begin(), o.begin() + n }))
        return pick = -1, std::pair{ order, n };
    std::cerr << "cannot resume: " << dir / "order.txt" << " does not fit the board\n";
    std::exit(2);
}

/** What a run settles before it searches, the same in tilesearch and tileestimate: the start set, the rule,
 *  the roots' order, and what the probes measured. */
struct Plan {
    std::vector<int> order;
    int roots = 0;
    int pick = -1;
    std::vector<Way> ways;   // every way probed, when there was a choice
    double probed = 0;       // seconds spent probing the ways, and ranking those ranked after the first probes
    bool ranked = false;
    bool recorded = false;   // the rule is the run's own (its `rule` file), not measured again
    double predicted = 0;    // the chosen way's estimated nodes to kmax
};

static double const RANK_MAX = 30;   // s: the most the ranking may take, per thread
static double const RANK_SHARE = 0.5, RANK_FLOOR = 1;   // a fewest-options way's ranking cap (plan): see there
/**
 * Root r searches only the types from r on, so each node of the search is visited from one start only: its
 * first type in the order. Putting first the root lines whose types grow the smallest trees over the whole
 * alphabet (to 3 vertices under fewest options, 2 under the face rule) makes those starts the cheap ones: on
 * A6_30 this cut the search to 3% of its nodes at k <= 4 (experiments/results/vertex-order-2026-10-26.log,
 * search-speedups-2026-10-26.log). The trees' sizes are estimated by probes: counting them exactly took 344 s on
 * Board_0_931302 (k <= 5) and could outgrow the search itself (123_1_4657 at k <= 2 ran for hours). Unless every
 * root type is probed within RANK_MAX the board's order stays. Any order finds the same tilings, each once.
 */
static int const RANK_PROBES = 8;
/** Ranks `order`'s root lines; false (the order kept) when that would take past `cap` CPU seconds over the threads
 *  (default RANK_MAX each). */
static bool rank_roots(Board const& b, SetTables& set, std::vector<int>& order, int threads, double cap = 0) {
    if (set.lines < 2) return false;
    Required const kept = std::exchange(required, Required{});   // the trees skip the required-set pruning
    set.s.depth = std::min(face_first ? 2 : 3, b.kmax), set.s.whole = true;
    // RANK_PROBES probes per root type, each type's from a seed of its own, so the order does not depend on how the
    // threads interleave: the same run ranks alike every time.
    std::vector<est::RootStats> stats(set.s.roots);
    std::atomic<int> next{ 0 }, done{ 0 };
    std::atomic<bool> late{ false };
    // The cap is CPU seconds summed over the threads, not wall time: under load the wall clock stretched past
    // RANK_MAX on some runs of 1247_1_0612 and not others, and those fell back to the board's order (10x nodes).
    std::atomic<uint64_t> cpu_us{ 0 };
    int const workers = std::max(1, threads);
    double const most_us = 1e6 * (cap > 0 ? cap : RANK_MAX * workers);
    std::vector<std::thread> pool;
    for (int i = 0; i < workers; i++)
        pool.emplace_back([&] {
            original_tiling_writer writer{ set.s.vc };
            for (int t; !late && (t = next++) < set.s.roots; done++) {
                std::mt19937_64 rng(0x9e3779b97f4a7c15ULL * (t + 1));
                double const c0 = est::cpu_now();
                for (int j = 0; j < RANK_PROBES && !late; j++) est::probe(set.s, writer, t, rng, stats[t]);
                if ((cpu_us += uint64_t(1e6 * (est::cpu_now() - c0))) > most_us) late = true;
            }
        });
    while (show_stages && done < set.s.roots && !late) {
        std::cout << "stage rank " << done << " " << set.s.roots << std::endl;
        std::this_thread::sleep_for(std::chrono::milliseconds(250));
    }
    for (auto& th : pool) th.join();
    set.s.depth = 0, set.s.whole = false;
    required = kept;
    if (late) return false;
    std::vector<double> weight(set.lines);
    for (int t = 0; t < set.s.roots; t++) weight[set.line_of[t]] += stats[t].nodes.mean();
    std::vector<int> place(set.lines);
    std::iota(place.begin(), place.end(), 0);
    std::stable_sort(place.begin(), place.end(), [&](int x, int y) { return weight[x] < weight[y]; });
    std::vector<int> ranked;
    for (int i : place) ranked.push_back(order[i]);
    ranked.insert(ranked.end(), order.begin() + set.lines, order.end());
    order = ranked;
    return true;
}

static Plan plan(Board const& b, int threads, fs::path const* resume_dir) {
    // the ways are probed on the global alive set: per-root balance runs once, in main's classify of the chosen order
    balance::per_root_enabled = false;
    struct Restore { ~Restore() { balance::per_root_enabled = true; } } const restore;
    Plan p;
    std::vector<int> recorded;
    if (resume_dir) std::tie(recorded, p.roots) = recorded_order(*resume_dir, b, p.pick);
    // A resumed run, and tileestimate beside a running one, keep the rule the run chose: probing again could pick
    // the other, and the estimate would then be of a search the run is not doing.
    if (std::ifstream rf; resume_dir && (rf.open(*resume_dir / "rule"), rf)) {
        std::string r, ring;
        rf >> r >> ring;   // a run before ring_check wrote only the rule
        face_first = r == "face", ring_check = ring == "ring", p.recorded = true, p.order = recorded;   // as the run chose
        return p;
    }
    std::vector<int> picks{ p.pick };
    if (!resume_dir && required_sets(b).size() > 1) {
        picks.clear();
        for (int i = 0; i < (int)required_sets(b).size(); i++) picks.push_back(i);
    }
    std::vector<bool> rules{ false, true };
    if (std::getenv("TILESEARCH_FACE_FIRST")) rules = { true };
    else if (std::getenv("TILESEARCH_FAIL_FIRST")) rules = { false };
    for (int pk : picks)
        for (bool f : rules) p.ways.push_back({ pk, f });

    // Each way is probed on the root order it would run: its start set's lines, ranked under its own rule. Probing
    // the board's order and ranking only the winner compared searches no run does: ranking can cut a search to
    // a few % of its nodes, and by different amounts per set (tilesearch-start-set-truth-2026-10-30.log).
    FastFaces const fast(b.faces, b.apeirogons);
    flat_max = flat_budget(b);
    std::vector<std::unique_ptr<SetTables>> sets;   // per way
    std::vector<bool> ranked;
    auto tables = [&](SetTables& t) {
        t.s = est::Search{}, t.line_of.clear();
        t.s.b = b;
        t.s.roots = classify(b, t.order, t.lines, t.s.vc, &t.line_of);
        t.req = required;
        t.cand = std::make_unique<Candidates>(t.s.vc, fast, fast);
        t.s.faces = &fast, t.s.cand = t.cand.get();
        t.s.ring = std::make_shared<RingTables>(t.s.vc);
        t.s.syms = std::make_shared<RootSyms>(t.s.vc, t.s.roots);
    };
    std::vector<std::unique_ptr<est::Sampler>> samplers(p.ways.size());
    sets.resize(p.ways.size()), ranked.assign(p.ways.size(), false);
    // A way's tables, ranked under its rule; a ranking past `cap` CPU seconds drops the way (0: RANK_MAX, kept unranked).
    auto prepare = [&](size_t i, double cap) {
        Way& w = p.ways[i];
        if (show_stages) std::cout << "stage tables 0 0" << std::endl;
        auto t = std::make_unique<SetTables>();
        std::tie(t->order, t->lines) = resume_dir ? std::pair{ recorded, p.roots } : vertex_order(b, w.pick);
        tables(*t);
        face_first = w.face, ring_check = ring_for(w.face);
        if (!resume_dir && t->lines >= 2) {
            ranked[i] = rank_roots(b, *t, t->order, threads, cap);
            if (ranked[i]) tables(*t);
            else if (cap > 0) { w.out = w.capped = true; return; }
        }
        std::vector<int> roots(t->s.roots);
        std::iota(roots.begin(), roots.end(), 0);
        samplers[i] = std::make_unique<est::Sampler>(t->s, roots, 1);
        sets[i] = std::move(t);
    };
    auto probe_round = [&](size_t i) {
        Way& w = p.ways[i];
        required = sets[i]->req, face_first = w.face, ring_check = ring_for(w.face);
        samplers[i]->run(PLAN_ROUND, threads);
        w.secs += PLAN_ROUND, w.est = samplers[i]->totals();
    };
    // The face ways first: their ranking is cheap (trees 2 vertices deep), and a round of probes then prices their
    // search. That price bounds the ranking a fewest-options way may spend (3 deep, often 10x the cost): no more than
    // RANK_SHARE of the search it could beat, or RANK_FLOOR a thread. Unbounded, ranking was most of the run where the
    // face rule wins: freedraw 3,4,6 k <= 3 ranked for 9.2 s of an 11.7 s run, 1247_1_0612 k <= 2 for 10.7 s of 15.5 s.
    auto const t0 = est::Clock::now();
    double priced = 0;
    for (size_t i = 0; i < p.ways.size(); i++)
        if (p.ways[i].face) {
            prepare(i, 0), probe_round(i);
            if (double const c = p.ways[i].est.level_cpu; c > 0 && (priced == 0 || c < priced)) priced = c;
        }
    for (size_t i = 0; i < p.ways.size(); i++)
        if (!p.ways[i].face) prepare(i, priced > 0 ? std::max(RANK_SHARE * priced, RANK_FLOOR * threads) : 0);
    double budget = PLAN_MIN;
    for (bool more = true; more;) {
        more = false;
        for (size_t i = 0; i < p.ways.size(); i++) {
            Way& w = p.ways[i];
            if (w.out || w.secs >= budget) continue;
            more = true;
            probe_round(i);
            if (show_stages) std::cout << "stage plan " << int(10 * est::since(t0)) << " " << int(10 * PLAN_MAX * p.ways.size()) << std::endl;
        }
        double best = 0;
        for (auto const& w : p.ways)
            if (!w.out && w.est.level_cpu > 0 && (best == 0 || w.est.level_cpu < best)) best = w.est.level_cpu;
        if (p.ways.size() > 1) budget = std::clamp(PLAN_SHARE * best / threads, PLAN_MIN, PLAN_MAX);
        for (auto& w : p.ways)
            if (!w.out && w.secs >= 2 * PLAN_ROUND && best > 0 && w.est.level_cpu > PLAN_BEHIND * best) w.out = true;
    }
    // A heavy tail among the two cheapest ways (a standard error over half its estimate) that could swap them: a few
    // draws decided the pick.
    // 45degree k <= 20 went to fewest options (79M nodes, 460 s CPU) once in 12 runs, with fewest 1.3 s +- 0.2 against
    // the face rule's 6.4 s +- 5.7 (its truth 2.2 s): both rules' trees are heavy-tailed there. Both ways then get
    // PLAN_HEAVY seconds of probes in all, a fixed amount: probing until the gap looks clear lets a loose estimate stop
    // on a low draw.
    {
        size_t a = SIZE_MAX, c = SIZE_MAX;   // the cheapest way and the next
        for (size_t i = 0; i < p.ways.size(); i++) {
            if (p.ways[i].out || p.ways[i].est.level_cpu <= 0) continue;
            if (a == SIZE_MAX || p.ways[i].est.level_cpu < p.ways[a].est.level_cpu) c = a, a = i;
            else if (c == SIZE_MAX || p.ways[i].est.level_cpu < p.ways[c].est.level_cpu) c = i;
        }
        auto loose = [&](size_t i) { return p.ways[i].est.level_cpu_se > 0.5 * p.ways[i].est.level_cpu; };
        // and only when one standard error either way could swap them: A6p30's fewest options, 87 s +- 45 against the
        // face rule's 2.9 s, cannot win and was probed for nothing (+0.7 s on a 2.3 s run)
        auto reach = [&](size_t i, double sign) { return p.ways[i].est.level_cpu + sign * p.ways[i].est.level_cpu_se; };
        if (c != SIZE_MAX && (loose(a) || loose(c)) && reach(c, -1) < reach(a, 1))
            for (size_t i : { a, c })
                while (p.ways[i].secs < PLAN_HEAVY - 1e-9) probe_round(i);
    }
    p.probed = est::since(t0);
    // Dropped ways count too: a lucky early draw can drop a rule whose rival's estimate then grows past it.
    Way const* pickw = &p.ways[0];
    for (auto const& w : p.ways)
        if (w.est.level_cpu > 0 && (pickw->est.level_cpu <= 0 || w.est.level_cpu < pickw->est.level_cpu)) pickw = &w;
    p.pick = pickw->pick, face_first = pickw->face, ring_check = ring_for(pickw->face), p.predicted = pickw->est.nodes;
    size_t const wi = pickw - p.ways.data();
    required = sets[wi]->req;
    p.roots = sets[wi]->lines;
    p.order = sets[wi]->order;
    p.ranked = ranked[wi];
    if (p.ways.size() == 1) p.ways.clear();
    return p;
}

#include "find.h"

int main(int argc, char** argv) {
    char const* usage = "usage: tilesearch <board> [--k <kmin> <kmax>] [--threads <n>] [--nice <n>] [--resume] [--gzip] [--progress] [--dump] [--first] [--seconds <s>] [--find] [--no-local-death] [--balance] [--prune-balance]\n";
    if (argc < 2) { std::cerr << usage; return 2; }
    Board b = read_board(argv[1]);
    int threads = std::max(1u, std::thread::hardware_concurrency()), nice = 0;
    bool dump = false, progress = false, resume = false, gzip = false, find_mode = false;
    for (int i = 2; i < argc; i++) {
        std::string a = argv[i];
        if (a == "--k" && i + 2 < argc) b.kmin = std::atoi(argv[++i]), b.kmax = std::atoi(argv[++i]);
        else if (a == "--threads" && i + 1 < argc) threads = std::max(1, std::atoi(argv[++i]));
        else if (a == "--nice" && i + 1 < argc) nice = std::atoi(argv[++i]);
        else if (a == "--dump") dump = true;
        else if (a == "--progress") progress = show_stages = true;
        else if (a == "--resume") resume = true;
        else if (a == "--gzip") gzip = true;
        else if (a == "--first") first_only = true;
        else if (a == "--seconds" && i + 1 < argc) time_limit = std::atof(argv[++i]);
        else if (a == "--find") find_mode = true;
        else if (a == "--balance") { balance::report(b, required_sets(b), std::cout); return 0; }
        else if (a == "--prune-balance") balance::prune = true;
        else if (a == "--no-local-death") balance::local = false;   // LP only in the fixpoint (before --balance, which answers at once)
        else { std::cerr << "unknown argument " << a << "\n" << usage; return 2; }
    }
    if (b.kmin < 1 || b.kmax < b.kmin || b.kmax > MAX_K) { std::cerr << "--k needs 1 <= kmin <= kmax <= " << MAX_K << "\n"; return 2; }
    if (first_only) gzip = false;   // one plain file, read back by --find
    if (find_mode) {
        // the steps run this executable: by the path it was started with, else (found on PATH) by name
        std::string self = argv[0];
        if (self.find_first_of("/\\") != std::string::npos) self = fs::absolute(self).string();
        return find::Finder(b, self, threads, nice, time_limit).go(argv[1]);
    }
    if (nice) setpriority(PRIO_PROCESS, 0, nice);   // before any thread exists, so all of them inherit it
    flat_max = flat_budget(b);
    find_recolorings(b);
    if (!recolorings.empty())
        std::cout << "colours: tilings that differ only by permuting colours count once (" << recolorings.size() + 1
                  << " recolourings keep the board)" << std::endl;
    if (char const* t = std::getenv("TILESEARCH_SPLIT")) split_depth = std::atoi(t);

    // the roots first (see `vertex_order`); a run ranks them below, once it knows whether it resumes
    auto [order, n_initial] = vertex_order(b);

    if (dump) {
        auto list = [](char const* tag, std::vector<std::vector<int>> const& ws) {
            for (auto const& w : ws) {
                std::cout << tag;
                for (int c : w) std::cout << " " << c;
                std::cout << "\n";
            }
        };
        std::vector<std::vector<int>> words;
        for (int v : order) words.push_back(b.vertices[v]);
        list("face", b.faces); list("apeirogon", b.apeirogons); list("vertex", words);
        std::cout << "permutations " << b.permutations << "\nchiral " << b.chiral << "\ninitial " << n_initial << "\n";
        for (auto const& set : required_sets(b)) {
            std::cout << "require";
            for (int v : set) std::cout << " " << v + 1;
            std::cout << "\n";
        }
        return 0;
    }

    // Layout. solver_<name>/ holds the finished output, the board, roots.done (one line per finished
    // root with its counts), in a run split into units `units` and units.done (one line per unit finished
    // before its root, `<r> <u> <counts>`), and, only while a root is being merged in, merge.pending. A
    // root's output is written under .part/ first and appended to the real files when the root completes,
    // so a stop never leaves half a root in them.
    fs::path const base = fs::absolute("."), dir = base / ("solver_" + b.name), part = base / ".part";
    fs::path const done_file = dir / "roots.done", pending_file = dir / "merge.pending", units_file = dir / "units.done";
    std::ostringstream board_text;
    for (auto const& l : b.normalized)
        board_text << (l.rfind("k ", 0) == 0 ? "k " + std::to_string(b.kmin) + " " + std::to_string(b.kmax) : l) << "\n";
    bool const resuming = fs::exists(dir) && !fs::is_empty(dir);
    if (resuming && !resume) { std::cerr << dir << " is not empty: pass --resume to continue it, or move it away\n"; return 2; }
    // A run's units are numbered on its search tree, which forced closure and orderly generation change. This engine
    // marks its runs' board.txt, so an engine from before them refuses to resume one ("a different board") instead of
    // renumbering its units; a run without the mark was begun before them, and resumes on their old tree (`legacy`).
    // Each change to the tree, or to which tiling of a colour class is written, gets its own mark: a run resumes with the
    // rules it began with, or roots done and roots to come would disagree (units renumbered, or a class written twice
    // or never). Mark 2: forced closure and orderly generation. Mark 3: also colour classes by key and the colour cut.
    // Mark 4: also true slack in the face rule (FastFaces::edges_needed_to_complete).
    std::string const engine_mark2 = "# engine: forced closure and orderly generation (resumable by this engine or later)\n";
    std::string const engine_mark3 = "# engine 3: forced closure, orderly generation, colour classes by key (resumable by this engine or later)\n";
    std::string const engine_mark4 = "# engine 4: forced closure, orderly generation, colour classes by key, true slack (resumable by this engine or later)\n";
    std::string const engine_mark = "# engine 5: forced closure, orderly generation, colour classes by key, true slack, vertex figures in the minimality test (resumable by this engine or later)\n";
    bool legacy = false;   // begun before mark 2
    if (resuming) {
        std::ifstream old(dir / "board.txt");
        std::string was((std::istreambuf_iterator<char>(old)), std::istreambuf_iterator<char>());
        legacy = was == board_text.str();
        bool const mark2 = was == board_text.str() + engine_mark2, mark3 = was == board_text.str() + engine_mark3;
        bool const mark4 = was == board_text.str() + engine_mark4;
        if (!legacy && !mark2 && !mark3 && !mark4 && was != board_text.str() + engine_mark) { std::cerr << "cannot resume: " << dir / "board.txt" << " is a different board\n"; return 2; }
        if (legacy || mark2) color_sig = false, std::cout << "engine: resuming a run from before colour classes by key, so with the colour rules it began with" << std::endl;
        if (legacy || mark2 || mark3) slack_rule = false, std::cout << "engine: resuming a run from before true slack, so with the walk-length face rule" << std::endl;
        if (legacy || mark2 || mark3 || mark4)
            figures_on = false, std::cout << "engine: resuming a run from before vertex figures in the minimality test, so with labels alone (a fresh run can find tilings this one misses)" << std::endl;
    }
    fs::remove(dir / "latest.txt");   // a stopped session's, from a root it dropped
    Plan const pl = plan(b, threads, resuming ? &dir : nullptr);
    order = pl.order, n_initial = pl.roots;
    int unit_depth = 0;   // see UNIT_DEPTH
    // the units' numbering needs the same search: rule, ring_check and sym_break (older runs wrote fewer fields)
    if (std::ifstream uf{ dir / "units" }; resuming && uf >> unit_depth >> face_first) {
        int g = 0, sb = 0;
        if (uf >> g) ring_check = g;
        uf >> sb, sym_break = sym_break && sb;
    }
    if (!pl.ways.empty()) {   // what the probes measured: per way, its estimated nodes and CPU seconds at kmax
        std::cout << "plan: probed " << std::setprecision(2) << pl.probed << " s, estimated at k <= " << b.kmax << ":" << std::setprecision(3);
        for (auto const& w : pl.ways) {
            std::cout << " [" << (w.face ? "face" : "fewest");
            if (w.pick >= 0) std::cout << " set " << w.pick + 1;
            if (w.capped) std::cout << " ranking past its cap, dropped]";
            else std::cout << " " << w.est.nodes << " nodes, " << w.est.level_cpu << " s +- " << w.est.level_cpu_se << (w.out ? ", dropped]" : "]");
        }
        std::cout << std::setprecision(6) << std::endl;
    }
    if (pl.pick >= 0) std::cout << "roots: from required set " << pl.pick + 1 << std::endl;
    std::cout << "branching: " << (face_first ? "on the face nearest to closing" : "on the fewest options") << (ring_check ? ", open faces checked" : "")
              << (pl.ranked || resuming ? "" : " (roots in the board's order)") << std::endl;
    std::set<int> done;
    std::map<int, std::set<int>> kept;                    // per root not yet merged: its units in units.done
    std::map<int, std::map<int, size_t>> kept_counts;     // and their tilings per k
    std::vector<std::atomic<uint64_t>> per_k(MAX_K + 1);   // tilings per k: finished roots plus the running ones
    if (resuming) {
        gzip = fs::exists(dir / "gzip");
        drop_torn_line(done_file), drop_torn_line(units_file);   // a run that ended on a failed write
        std::ifstream df(done_file);
        for (std::string line; std::getline(df, line);) {
            std::istringstream ls(line);
            int r; ls >> r; done.insert(r);
            for (std::string kv; ls >> kv;) per_k[std::stoi(kv)] += std::stoull(kv.substr(kv.find(':') + 1));
        }
        df.close();
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
        // units finished by roots not yet merged: their output and keys stay under .part, their counts count
        std::ifstream uf(units_file);
        std::ostringstream live;
        for (std::string line; std::getline(uf, line);) {
            std::istringstream ls(line);
            int r, u;
            if (!(ls >> r >> u) || done.count(r) || !kept[r].insert(u).second) continue;
            live << line << "\n";
            for (std::string kv; ls >> kv;) {
                size_t const k = std::stoi(kv), n = std::stoull(kv.substr(kv.find(':') + 1));
                per_k[k] += n, kept_counts[r][k] += n;
            }
        }
        uf.close();
        if (fs::exists(units_file)) write_file(units_file, live.str());
    } else {
        make_dirs(dir);
        {
            std::ostringstream f;
            for (size_t i = 0; i < order.size(); i++) f << (i ? " " : "") << order[i] + 1;
            f << "\n";
            write_file(dir / "order.txt", f.str());
        }
        write_file(dir / "board.txt", board_text.str() + engine_mark);
        // read back by --resume and by tileestimate
        write_file(dir / "rule", std::string(face_first ? "face" : "fewest") + (ring_check ? " ring" : "") + "\n");
        if (gzip) write_file(dir / "gzip", "");   // the format of this run's certificates, read back by --resume
        write_file(dir / "named", "");   // certificates say the board's own symbols, not X<n>; read back by --resume
        std::ostringstream f;
        for (auto const& [s, c] : b.codes) {
            std::ostringstream printed;
            printed << corner_decoder{ c };
            if (printed.str() != s) f << printed.str() << " " << s << "\n";
        }
        write_file(dir / "symbols.txt", f.str());
    }

    if (show_stages) std::cout << "stage tables 0 0" << std::endl;
    vertex_classification vc{};
    int const roots = classify(b, order, n_initial, vc);
    {   // the vertex figures (type_fig): each type's word, colours read away, up to rotation and reflection
        std::unordered_map<int, int> base;   // corner code -> its base symbol's number
        std::map<std::string, int> base_ids;
        for (auto const& [sym, c] : b.codes)
            base[c] = base_ids.try_emplace(sym.substr(0, sym.find('@')), (int)base_ids.size()).first->second;
        std::map<std::vector<int>, uint32_t> ids;
        type_fig.assign(vc.count(), 0);
        for (int t = 0; t < vc.count(); t++) {
            auto const& w = vc.word_with_symmetries(t);
            std::vector<int> word, best;
            for (int i = 0; i < (int)w.size(); i++) { auto const it = base.find(w.letter(i)); word.push_back(it == base.end() ? -1 - w.letter(i) : it->second); }
            for (int r = 0; r < 2; r++, std::reverse(word.begin(), word.end()))
                for (size_t j = 0; j < word.size(); j++) {
                    std::vector<int> x(word.begin() + j, word.end());
                    x.insert(x.end(), word.begin(), word.begin() + j);
                    if (best.empty() || x < best) best = x;
                }
            type_fig[t] = ids.try_emplace(best, (uint32_t)ids.size()).first->second;
        }
    }
    if (color_sig && !recolorings.empty() && !(std::getenv("TILESEARCH_COLOR_CUT") && std::string(std::getenv("TILESEARCH_COLOR_CUT")) == "0")) {
        // The recoloured type, matched on templates: type t's template with its labels recoloured must be isomorphic to
        // exactly one type's template (labels, mirror kind, right, left and mirror links, as symmetries() checks). Not
        // vc.lookup_vertex_type_index, which ignores the mirror axis: on colors3_4 it gave A4@B A4@C A4@B A4@C with its
        // mirror through the B corners for the one through the C corners, which the swap B <-> C exchanges, and the cut
        // lost tilings. No match or two, a map that is not a permutation, or one its inverse does not undo: cut off.
        recolor_type.assign(recolorings.size(), std::vector<int>(vc.count(), -1));
        recolor_min_type.resize(vc.count());
        std::vector<tiling_t> tpl(vc.count());
        std::map<std::pair<int, std::vector<int>>, std::vector<int>> bucket;   // (half-edges, sorted labels) -> types
        auto labels_of = [](tiling_t const& x, std::unordered_map<int, int> const* lab) {
            std::vector<int> v;
            for (int i = 0; i < x.num_halfedges(); i++)
                for (int c : { x.left_label(index_t{ i }), x.right_label(index_t{ i }) }) {
                    if (lab) if (auto it = lab->find(c); it != lab->end()) c = it->second;
                    v.push_back(c);
                }
            std::sort(v.begin(), v.end());
            return v;
        };
        for (int t = 0; t < vc.count(); t++) {
            vc.push_vertex_to(tpl[t], t);
            bucket[{ tpl[t].num_halfedges(), labels_of(tpl[t], nullptr) }].push_back(t);
        }
        auto iso = [](tiling_t const& x, std::unordered_map<int, int> const& lab, tiling_t const& y) {
            int const n = x.num_halfedges();
            if (y.num_halfedges() != n) return false;
            auto L = [&](int c) { auto it = lab.find(c); return it == lab.end() ? c : it->second; };
            for (int s0 = 0; s0 < n; s0++) {
                std::vector<int> p(n, -1), todo{ 0 };
                p[0] = s0;
                bool ok = true;
                while (ok && !todo.empty()) {
                    index_t const u0{ todo.back() }, v0{ p[todo.back()] };
                    todo.pop_back();
                    ok = L(x.left_label(u0)) == y.left_label(v0) && L(x.right_label(u0)) == y.right_label(v0) &&
                         x.mirror(u0).has_value() == y.mirror(v0).has_value();
                    for (auto [u, v] : { std::pair{ x.right_neighbour(u0), y.right_neighbour(v0) },
                                         { x.left_neighbour(u0), y.left_neighbour(v0) }, { x.mirror(u0), y.mirror(v0) } }) {
                        if (!ok || !u.has_value()) continue;
                        if (!v.has_value()) { ok = false; break; }
                        int& q = p[u.get_value()];
                        if (q < 0) q = v.get_value(), todo.push_back(u.get_value());
                        else ok = q == v.get_value();
                    }
                }
                std::vector<bool> hit(n);
                for (int q : p) ok = ok && q >= 0 && !hit[q] && (hit[q] = true);
                if (ok) return true;
            }
            return false;
        };
        bool ok = true;
        for (size_t r = 0; r < recolorings.size() && ok; r++)
            for (int t = 0; t < vc.count() && ok; t++) {
                auto const it = bucket.find({ tpl[t].num_halfedges(), labels_of(tpl[t], &recolorings[r]) });
                int found = -1, matches = 0;
                if (it != bucket.end())
                    for (int u : it->second) if (iso(tpl[t], recolorings[r], tpl[u])) found = u, matches++;
                if (matches != 1) { ok = false; break; }
                recolor_type[r][t] = found;
            }
        // each recolouring permutes the types, and undoing it (the inverse letter map) gives every type back
        for (size_t r = 0; r < recolorings.size() && ok; r++) {
            std::vector<char> hit(vc.count(), 0);
            for (int t = 0; t < vc.count() && ok; t++) { if (hit[recolor_type[r][t]]) ok = false; hit[recolor_type[r][t]] = 1; }
            int inv = -1;
            for (size_t q = 0; q < recolorings.size() && inv < 0; q++) {
                bool id = true;
                for (int L = 0; L < 8 && id; L++) id = recolor_letters[q][recolor_letters[r][L]] == L;
                if (id) inv = (int)q;
            }
            if (inv < 0) { ok = false; break; }
            for (int t = 0; t < vc.count() && ok; t++) ok = recolor_type[inv][recolor_type[r][t]] == t;
        }
        if (ok) {
            for (int t = 0; t < vc.count(); t++) {
                recolor_min_type[t] = t;
                for (size_t r = 0; r < recolorings.size(); r++) recolor_min_type[t] = std::min(recolor_min_type[t], recolor_type[r][t]);
            }
            cut_vc = &vc;
            int skipped = 0;
            for (int t = 0; t < roots; t++) skipped += recolor_min_type[t] < t;
            std::cout << "colour cut: on (" << skipped << " of " << roots << " roots map below themselves)" << std::endl;
        } else std::cout << "colour cut: off (a recoloured type has no unique match, or the map is not a permutation)" << std::endl;
    }
    std::unique_ptr<RingTables const> ring_tables;
    if (ring_check) ring_tables = std::make_unique<RingTables>(vc), run_ring = ring_tables.get();
    std::unique_ptr<RootSyms const> root_syms;
    std::unique_ptr<OrderlyTables const> orderly_tables;
    if (legacy) forcing = false, std::cout << "engine: resuming a run from before forced closure, so without it and without orderly" << std::endl;
    char const* ord_env = std::getenv("TILESEARCH_ORDERLY");
    if (std::string const o = ord_env ? ord_env : "1"; o != "0" && !legacy) {
        // coupled (the search's own moves are the code) needs the face rule; under fewest options it would be unsound,
        // so those runs use the decoupled codes
        orderly_dec = !face_first || o == "dec";
        if (orderly_tables = std::make_unique<OrderlyTables>(vc); !orderly_tables->ok)
            std::cout << "orderly: off (" << orderly_tables->why << ")" << std::endl;
        else orderly_on = true, run_orderly = orderly_tables.get(), sym_break = false,
             std::cout << "orderly: on (" << (orderly_dec ? "decoupled, lowest free half-edge" : "coupled, face rule") << ")" << std::endl;
    }
    if (sym_break) root_syms = std::make_unique<RootSyms>(vc, roots), run_syms = root_syms.get();
    original_tiling_writer writer{ vc };
    if (!resuming) {
        char const* forced = std::getenv("TILESEARCH_UNITS");
        unit_depth = forced ? std::atoi(forced) : pl.predicted >= UNIT_NODES * roots ? UNIT_DEPTH : 0;
        if (unit_depth > 0)
            write_file(dir / "units", std::to_string(unit_depth) + " " + std::to_string(face_first) + " " + std::to_string(ring_check) + " " + std::to_string(sym_break) + "\n");
    }
    if (unit_depth > 0) std::cout << "units: each root split where it has " << UNIT_TARGET << " partial tilings, at most " << unit_depth << " edges deep" << std::endl;

    // A free symbol (outside Marek's encoding) prints as X<n>, decimal in certificates and hex in file
    // names; both are rewritten as the board's own symbol. A run begun before this keeps X<n> when
    // resumed, so its files stay alike; symbols.txt still maps X<n> for those.
    std::map<std::string, std::string> in_text, in_name;
    if (!resuming || fs::exists(dir / "named"))
        for (auto const& [sym, c] : b.codes) {
            std::ostringstream dec, hex;
            dec << corner_decoder{ c };
            hex << std::hex << corner_decoder{ c };
            if (dec.str()[0] != 'X' || dec.str() == sym) continue;
            std::string safe = sym;
            for (char& ch : safe)
                if (std::string("/\\:*?\"<>|").find(ch) != std::string::npos) ch = '_';
            in_text[dec.str()] = sym, in_name[hex.str()] = safe;
        }
    auto relabel = [](std::string const& s, std::map<std::string, std::string> const& to, std::string const& digits) {
        std::string out;
        for (size_t i = 0; i < s.size();) {
            size_t j = i + 1;
            if (s[i] == 'X')
                while (j < s.size() && digits.find(s[j]) != std::string::npos) j++;
            auto it = j > i + 1 ? to.find(s.substr(i, j - i)) : to.end();
            if (it != to.end()) out += it->second, i = j;
            else out += s[i++];
        }
        return out;
    };

    // Output: the file names solutions_processor::process builds, written per unit under .part/<r>/<u>/ and
    // appended to the real files, unit by unit, when the root finishes (merge.pending makes that append
    // undoable). A unit that finishes before its root is checkpointed: its output stays under .part, its keys
    // are written beside it, and a line in units.done says so, so a resume searches it no more.
    auto is_number = [](fs::path const& p) { auto n = p.filename().string(); return !n.empty() && std::to_string(std::atoi(n.c_str())) == n; };
    {
        std::vector<fs::path> stale;   // everything under .part but the units in units.done
        if (fs::exists(part))
            for (auto const& e : fs::directory_iterator(part)) {
                auto const it = is_number(e.path()) ? kept.find(std::stoi(e.path().filename().string())) : kept.end();
                if (it == kept.end() || !e.is_directory()) { stale.push_back(e.path()); continue; }
                for (auto const& f : fs::directory_iterator(e.path()))
                    if (!is_number(f.path()) || !it->second.count(std::stoi(f.path().filename().string()))) stale.push_back(f.path());
            }
        for (auto const& f : stale) fs::remove_all(f);
    }
    auto unit_dir = [&](int r, int u) { return part / std::to_string(r) / std::to_string(u); };
    std::vector<int> todo;
    std::vector<std::unique_ptr<Root>> state(roots);
    std::mutex state_mutex;   // the ticker reads state while the merger drops finished roots
    for (int r = 0; r < roots; r++) {
        if (done.count(r)) continue;
        todo.push_back(r), state[r] = std::make_unique<Root>();
        auto const it = kept.find(r);
        if (it == kept.end()) continue;
        Root& st = *state[r];
        st.skip = it->second, st.counts = kept_counts[r];
        st.units_done = int(st.skip.size() - st.skip.count(0));   // the head is counted when it runs again
        for (int u : st.skip) {
            std::ifstream kf(unit_dir(r, u) / "keys", std::ios::binary);
            for (Fingerprints::Key k; kf.read((char*)&k, sizeof k);) st.seen.first_time(k);
        }
    }
    // a unit's folder under .part/ is made when it first has output: most have none, and making 77,075 of
    // them up front took 12 s on a star board
    auto spill = [&](int r, int u, Unit& p) {   // caller holds the root's mutex, or is the only one left
        if (!p.out.empty()) make_dirs(unit_dir(r, u));
        for (auto& [name, text] : p.out) {
            if (!gzip) { write_file(unit_dir(r, u) / name, text, std::ios::app | std::ios::binary); continue; }
            // one gzip member per spill; level 1: this text compresses ~10x even so, and level 6 costs more time
            fs::path const gz = unit_dir(r, u) / (name + ".gz");
            gzFile z = gzopen(gz.c_str(), "ab1");
            if (!z) io_failed("write", gz);
            bool const wrote = gzwrite(z, text.data(), (unsigned)text.size()) == (int)text.size();
            if (gzclose(z) != Z_OK || !wrote) io_failed("write", gz);
        }
        p.out.clear();
        p.buffered = 0;
    };
    auto t0 = std::chrono::steady_clock::now();
    auto report = [&] {
        size_t total = 0;
        std::ostringstream ks;
        for (int k = 1; k <= b.kmax; k++)
            if (uint64_t n = per_k[k]) total += n, ks << " " << k << ":" << n;
        double const now = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
        std::cout << "progress " << now << " " << total << ks.str() << " nodes " << live_nodes << std::endl;
        if (!std::cout) std::_Exit(3);   // whoever reads the progress is gone (a stopped --find, on Windows too)
        if (time_limit > 0 && now > time_limit) { std::cout << "time limit" << std::endl; std::_Exit(4); }
        // the roots in hand, each with its units finished and found so far
        std::ostringstream act;
        {
            std::lock_guard<std::mutex> l(state_mutex);
            for (int r : todo)
                if (state[r] && state[r]->started) act << " " << r << ":" << state[r]->units_done << "/" << state[r]->next_unit;
        }
        std::cout << "active" << act.str() << std::endl;
    };
    if (progress) std::cout << "roots " << done.size() << " " << roots << std::endl;
    auto hand_over = [&] {   // this thread's batch, into its unit's buffer
        if (batch.root < 0) return;
        Root& st = *state[batch.root];
        std::lock_guard<std::mutex> lock(st.mutex);
        Unit& p = st.units.at(batch.unit);
        for (auto const& [k, n] : batch.counts) st.counts[k] += n, p.counts[k] += n;
        for (auto& [file, text] : batch.out) p.out[file] += text;
        p.keys.insert(p.keys.end(), batch.keys.begin(), batch.keys.end());
        p.buffered += batch.bytes;
        if (p.buffered > (1 << 20)) spill(batch.root, batch.unit, p);
        batch = Batch{};
    };
    // k: the vertex orbits that count (`flat_max`); the certificate still lists every orbit
    auto on_tiling = [&](int r, int u, auto const& conf, int k) {
        if (k < b.kmin) return;
        if (!holds_required_faces(b.require_faces, b.require_faces_inf, conf)) return;
        Root& st = *state[r];
        if (!st.skip.empty() && st.skip.count(u)) return;   // the head, run again only to number the units
        Fingerprints::Key key;
        if (!new_minimal(conf, key, st.seen)) return;
        {   // TILESEARCH_KEYS=<file>: every written tiling's canonical key, to compare engines tiling for tiling
            static char const* const keys = std::getenv("TILESEARCH_KEYS");
            static FILE* kf = keys ? std::fopen(keys, "w") : nullptr;
            if (keys) { static std::mutex km; std::lock_guard<std::mutex> l(km);
                if (!kf || std::fprintf(kf, "%d %016llx%016llx\n", k, (unsigned long long)key.a, (unsigned long long)key.b) < 0 || std::fflush(kf))
                    io_failed("write", keys); }
        }
        // solutions_processor::process, with its streams and the std::set of corners kept per thread
        thread_local std::ostringstream name;
        thread_local std::string text;
        thread_local std::vector<corner_t> corners;
        name.str("");
        corners.clear();
        for (auto ix : conf.indices()) corners.push_back(conf.label(ix));
        std::sort(corners.begin(), corners.end());
        corners.erase(std::unique(corners.begin(), corners.end()), corners.end());
        name << b.name << "solver_" << (k < 10 ? "0" : "") << k << "_";
        {
            // the corners in hex, as Marek's binaries name files; free symbols by name unless that runs too long
            thread_local std::ostringstream cs;
            cs.str("");
            cs << std::hex;
            for (auto c : corners) cs << corner_decoder{ c };
            std::string named = in_name.empty() ? cs.str() : relabel(cs.str(), in_name, "0123456789abcdef");
            name << (named.size() <= 160 ? named : cs.str());
        }
        name << (orientable(conf) ? "_o" : "") << "_" << conf.num_edges() << "." << writer.extension();
        certificate(text, writer, conf, vc, cur_types);
        if (!in_text.empty()) text = relabel(text, in_text, "0123456789");
        if (first_only) {
            static std::mutex m;
            std::lock_guard<std::mutex> l(m);
            write_file(dir / name.str(), text, std::ios::binary);
            write_file(dir / "census.txt", "k=" + std::to_string(k) + " -- 1\nMAX\n");
            std::cout << "first " << k << " " << name.str() << std::endl;
            std::_Exit(0);
        }
        // latest.txt: one tiling to show while no root has closed, for display only (a stop still drops an open
        // root's tilings). The first at once, then at most every LATEST_MS; one thread wins each turn.
        {
            static std::atomic<int64_t> latest_at{ -1 };
            int64_t const ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - t0).count();
            int64_t was = latest_at.load(std::memory_order_relaxed);
            if ((was < 0 || ms - was >= LATEST_MS) && latest_at.compare_exchange_strong(was, ms)) {
                write_file(dir / "latest.tmp", text, std::ios::binary);
                std::error_code ec;
                fs::rename(dir / "latest.tmp", dir / "latest.txt", ec);
            }
        }
        per_k[k]++;
        if (batch.root != r || batch.unit != u) hand_over();
        batch.root = r, batch.unit = u;
        batch.counts[k]++;
        if (unit_depth) batch.keys.push_back(key);
        batch.bytes += text.size();
        batch.out[name.str()] += text;
        if (batch.bytes > (1 << 18)) hand_over();
    };
    // Finished units and roots are written by one thread of their own, in the order they finish: a worker
    // that finished a root used to merge it under a lock, and the others queued behind it (~6% of hybrid_2_9830).
    std::mutex merge_mutex;
    std::condition_variable merge_cv;
    std::deque<std::pair<int, int>> merge_queue;   // (root, unit), unit -1 for the whole root
    bool merging = true;
    auto checkpoint = [&](int r, int u) {
        if (done.count(r)) return;   // its root finished meanwhile, and was merged with it
        Root& st = *state[r];
        std::lock_guard<std::mutex> l(st.mutex);
        Unit& p = st.units.at(u);
        if (!st.skip.count(u)) {
            spill(r, u, p);
            if (!p.keys.empty()) {
                make_dirs(unit_dir(r, u));
                write_file(unit_dir(r, u) / "keys", { (char const*)p.keys.data(), p.keys.size() * sizeof p.keys[0] }, std::ios::binary);
            }
            std::ostringstream uf;
            uf << r << " " << u;
            for (auto const& [k, n] : p.counts) uf << " " << k << ":" << n;
            uf << "\n";
            write_file(units_file, uf.str(), std::ios::app);
        }
        st.units.erase(u);
    };
    auto merge = [&](int r) {
        Root& st = *state[r];
        for (auto& [u, p] : st.units) spill(r, u, p);
        std::map<int, fs::path> units;   // by number: a file gets its units' text in their order
        if (fs::exists(part / std::to_string(r)))
            for (auto const& e : fs::directory_iterator(part / std::to_string(r))) units[std::stoi(e.path().filename().string())] = e.path();
        std::vector<fs::path> files;
        std::set<fs::path> names;
        for (auto const& [u, d] : units)
            for (auto const& e : fs::directory_iterator(d))
                if (e.path().filename() != "keys") files.push_back(e.path()), names.insert(e.path().filename());
        {   // whole or not at all: a half-written list would undo the wrong files (written under .part, then moved)
            std::ostringstream pf;
            pf << r << "\n";
            for (auto const& f : names)
                pf << (fs::exists(dir / f) ? (long long)fs::file_size(dir / f) : -1LL) << " " << f.string() << "\n";
            make_dirs(part);
            write_file(part / "merge.pending", pf.str());
            std::error_code ec;
            fs::rename(part / "merge.pending", pending_file, ec);
            if (ec) errno = ec.value(), io_failed("write", pending_file);
        }
        for (auto const& f : files)
            append_file(f, dir / f.filename());
        {
            std::ostringstream df;
            df << r;
            for (auto const& [k, n] : st.counts) df << " " << k << ":" << n;
            df << "\n";
            write_file(done_file, df.str(), std::ios::app);
        }
        fs::remove(pending_file);
        fs::remove_all(part / std::to_string(r));
        done.insert(r);
        { std::lock_guard<std::mutex> l(state_mutex); state[r].reset(); }   // its fingerprints are no longer needed
        if (progress) std::cout << "roots " << done.size() << " " << roots << " " << r << std::endl;
    };
    std::thread merger([&] {
        for (;;) {
            std::pair<int, int> job;
            {
                std::unique_lock<std::mutex> l(merge_mutex);
                merge_cv.wait(l, [&] { return !merge_queue.empty() || !merging; });
                if (merge_queue.empty()) return;
                job = merge_queue.front();
                merge_queue.pop_front();
            }
            if (job.second < 0) merge(job.first); else checkpoint(job.first, job.second);
        }
    });
    auto on_unit_done = [&](int r, int u, bool root_done) {
        { std::lock_guard<std::mutex> l(merge_mutex); merge_queue.emplace_back(r, root_done ? -1 : u); }
        merge_cv.notify_one();
    };
    std::mutex tick_mutex;
    std::condition_variable tick;
    bool searching = true;
    std::thread ticker([&] {
        std::unique_lock<std::mutex> lock(tick_mutex);
        while (progress && !tick.wait_for(lock, std::chrono::milliseconds(500), [&] { return !searching; })) report();
    });
    FastFaces const fast(b.faces, b.apeirogons);
    if (std::getenv("TILESEARCH_CROSSCHECK"))
    {
        CrossCheck const cross(b.faces, b.apeirogons);
        search(todo, b.kmax, vc, cross, fast, Candidates(vc, cross, fast), threads, state, on_tiling, hand_over, on_unit_done, unit_depth);
    } else
        search(todo, b.kmax, vc, fast, fast, Candidates(vc, fast, fast), threads, state, on_tiling, hand_over, on_unit_done, unit_depth);
    { std::lock_guard<std::mutex> l(merge_mutex); merging = false; }
    merge_cv.notify_one();
    merger.join();
    fs::remove_all(part);
    fs::remove(units_file);   // every root is in roots.done
    fs::remove(dir / "latest.txt");   // every tiling is in the files
    { std::lock_guard<std::mutex> lock(tick_mutex); searching = false; }
    tick.notify_all();
    ticker.join();
    if (progress) { std::cout << "roots " << done.size() << " " << roots << std::endl; report(); }
    double secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();

    size_t total = 0;
    std::ostringstream census;
    for (int k = b.kmin; k <= b.kmax; k++) census << "k=" << k << " -- " << per_k[k] << "\n", total += per_k[k];
    census << "MAX\n";
    write_file(dir / "census.txt", census.str());
    std::cout << "\nFinished with " << total << " solutions after " << secs << "s.\n";
    std::cout << "stats nodes " << total_nodes << " complete " << total_complete << " unique " << total << "\n";
    return 0;
}
