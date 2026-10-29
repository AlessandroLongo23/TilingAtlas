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
//   --progress prints `progress <seconds> <total> <k>:<count>... nodes <n>` twice a second (n: the nodes
//   visited so far, within 4096 per thread) and `roots <done> <all>` at every root boundary (read by the app).
//   Before the first root it prints `stage <name> <done> <all>`: `tables 0 0` while it builds its tables, then
//   `roots` (trying each required set as the start, when there are two or more) and `rank` (the root order),
//   counting root types.
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
#include <cmath>
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
#include <unordered_map>
#include <numeric>
#include <utility>
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
    std::vector<std::vector<int>> require; // per `require` line: 0-based vertex lines, a tiling holds one of each
    // per `require face` line: its faces (each written out in full); a tiling holds one of them
    std::vector<std::vector<std::vector<int>>> require_faces;
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
        else if (kw == "require" && t.size() >= 3 && t[1] == "face") {
            // require face a b c [x m] [| face d e f [x m] ...]: one of these faces, each up to turning and mirroring
            std::vector<std::vector<int>> alts;
            for (size_t i = 1; i < t.size();) {
                if (t[i] != "face") fail(lineno, "require face takes faces, each written 'face <corners> [x m]', separated by |");
                size_t e = i + 1;
                while (e < t.size() && t[e] != "|") e++;
                auto x = std::find(t.begin() + i + 1, t.begin() + e, "x");
                size_t end = x - t.begin();
                int m = 1;
                if (end < e) {
                    if (end + 2 != e) fail(lineno, "the repeat count follows x, and ends the face");
                    m = std::atoi(t[end + 1].c_str());
                    if (m < 1 || std::to_string(m) != t[end + 1]) fail(lineno, "face multiplier must be a positive integer");
                }
                auto w = word(t, i + 1, end);
                std::vector<int> full;
                for (int r = 0; r < m; r++) full.insert(full.end(), w.begin(), w.end());
                alts.push_back(full);
                i = e + 1;
            }
            b.require_faces.push_back(alts);
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
    if (b.require.size() + !b.initial.empty() > 16 && !b.require.empty())
        fail(lineno, "at most 16 required sets, initial counting as one");
    return b;
}

// ── required faces (`require face`): checked on each finished tiling ──
//
// A closed tiling's face, walked as the face checker walks it (right label, then cw step until it is back),
// is the quotient of the face's word: its labels repeated round the face give the word, up to turning and
// mirroring. A tiling passes when every `require face` line has one of its faces among them.
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
template<class Conf> static bool holds_required_faces(std::vector<std::vector<std::vector<int>>> const& req, Conf const& conf) {
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
    for (auto const& alts : req) {
        bool hit = false;
        for (size_t i = 0; i < alts.size() && !hit; i++)
            for (size_t j = 0; j < faces.size() && !hit; j++) hit = same_cycle(faces[j], alts[i]);
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

// canonical_form_if_minimal (tiling_properties.h): the same refinement, sort for sort, and the same
// test (the tiling is dropped when two half-edges stay in one class, i.e. it covers a smaller quotient),
// with buffers kept per thread. His version allocated three vectors for every complete tiling,
// duplicates included, and allocation was the largest cost on output-heavy boards.
// The canonical form itself, with every label read through `lab` (a recolouring; null reads them as they
// are). False when the tiling covers a smaller quotient, which no relabelling changes.
static bool canonical_form(tiling_t const& t, std::unordered_map<int, int> const* lab, std::vector<uint32_t>& form) {
    using Row = std::pair<std::array<uint32_t, 5>, uint32_t>;
    thread_local std::vector<uint32_t> eq, ranks;
    auto label = [&](index_t ix) -> uint32_t {
        int c = t.left_label(ix);
        if (lab) if (auto it = lab->find(c); it != lab->end()) c = it->second;
        return (uint32_t)c;
    };
    thread_local std::vector<Row> data;
    thread_local std::vector<std::pair<uint64_t, uint32_t>> packed;
    int const n = t.num_halfedges();
    // Labels are replaced by their ranks: the sort below sees the same order, so it makes the same classes.
    ranks.clear();
    for (int i = 0; i < n; i++) ranks.push_back(label(index_t{ i }));
    std::sort(ranks.begin(), ranks.end());
    ranks.erase(std::unique(ranks.begin(), ranks.end()), ranks.end());
    eq.resize(n);
    for (int i = 0; i < n; i++) eq[i] = uint32_t(std::lower_bound(ranks.begin(), ranks.end(), label(index_t{ i })) - ranks.begin());
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
        f[0] = eq[t.opposite(ix).value], f[1] = eq[t.mirror(ix).value], f[2] = eq[t.left_neighbour(ix).value], f[3] = label(ix);
    }
    return true;
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
        if (ok && image(&lab) == same) recolorings.push_back(lab);
    } while (std::next_permutation(perm.begin(), perm.end()));
}

static bool fingerprint_if_minimal(tiling_t const& t, Fingerprints::Key& key) {
    thread_local std::vector<uint32_t> form, other;
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
struct Required {
    std::vector<uint32_t> mask;               // per vertex type: the sets it is in
    uint32_t all = 0;                         // one bit per set; 0 when nothing is required
    std::vector<std::vector<uint8_t>> cover;  // [root type][sets missing]: the fewest types from it on meeting them

    uint32_t missing(std::vector<int> const& types) const {
        uint32_t m = all;
        for (size_t i = 0; m && i < types.size(); i++) m &= ~mask[types[i]];
        return m;
    }
    /** Whether a vertex of type t may join a tiling rooted at `root` that misses `miss`, with `left` after it. */
    bool may_add(uint32_t miss, int root, int t, size_t left) const {
        return !all || cover[root][miss & ~mask[t]] <= left;
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

/** The required sets: the `require` lines, and `initial` as one more when both are given. */
static std::vector<std::vector<int>> required_sets(Board const& b) {
    auto sets = b.require;
    if (!sets.empty() && !b.initial.empty()) sets.push_back(b.initial);
    return sets;
}

/**
 * The board's vertex lines in the engine's order, and how many of the first are roots. A tiling holds a vertex
 * of every required set, so the search may start from any one of them: required set `pick`, or by default the
 * one of fewest lines (`plan` picks by measured cost).
 */
static std::pair<std::vector<int>, int> vertex_order(Board const& b, int pick = -1) {
    auto const sets = required_sets(b);
    auto const first = sets.empty() ? b.initial
        : pick >= 0 ? sets[pick]
        : *std::min_element(sets.begin(), sets.end(), [](auto const& x, auto const& y) { return x.size() < y.size(); });
    std::vector<int> order = first;
    for (int v = 0; v < (int)b.vertices.size(); v++)
        if (!std::binary_search(first.begin(), first.end(), v)) order.push_back(v);
    return { order, first.empty() ? (int)order.size() : (int)first.size() };
}

/** The vertex types, line by line in `order`, with `required` set up for them; returns how many are roots. */
static int classify(Board const& b, std::vector<int> const& order, int root_lines, vertex_classification& vc) {
    auto const sets = required_sets(b);
    required = Required{};
    int roots = 0;
    for (int i = 0; i < (int)order.size(); i++) {
        auto const& w = b.vertices[order[i]];
        int const n = b.permutations ? vc.add_vertex_with_permutations(w) : vc.add_vertex(w);
        if (i < root_lines) roots += n;
        uint32_t m = 0;
        for (size_t k = 0; k < sets.size(); k++)
            if (std::binary_search(sets[k].begin(), sets[k].end(), order[i])) m |= 1u << k;
        required.mask.insert(required.mask.end(), n, m);
    }
    if (sets.empty()) return roots;
    required.all = (1u << sets.size()) - 1;
    // fewest types from t on meeting each set of sets, each type taken at most once; kept for the roots only
    std::vector<uint8_t> next(required.all + 1, 255);
    next[0] = 0;
    required.cover.resize(roots);
    for (int t = (int)required.mask.size() - 1; t >= 0; t--) {
        std::vector<uint8_t> cur(next.size());
        for (uint32_t m = 0; m <= required.all; m++) {
            uint8_t const take = next[m & ~required.mask[t]];
            cur[m] = std::min<int>(next[m], take == 255 ? 255 : take + !is_flat(vc, t));   // a flat vertex is no k
        }
        next.swap(cur);
        if (t < roots) required.cover[t] = next;
    }
    return roots;
}

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
static std::atomic<uint64_t> live_nodes{ 0 };   // for --progress: each thread adds its nodes 4096 at a time
// a trial search (`plan`) stops once live_nodes passes node_cap, and says so in `capped`
static std::atomic<uint64_t> node_cap{ UINT64_MAX };
static std::atomic<bool> capped{ false };
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

/** The candidate pairs of g, from every type, that pass try_joining's tests; valid until this thread's next call. */
template<class Faces>
static std::vector<Candidates::Pair> const& passing_pairs(tiling_t& conf, Faces const& faces, FastFaces const& ids,
                                                          vertex_classification const& vc, Candidates const& cand, index_t g) {
    thread_local std::unordered_map<Fingerprints::Key, PairList, ContextHash> mine;
    thread_local size_t held = 0;             // pairs kept, plus 8 a context for its key and node
    thread_local std::vector<int8_t> by_sig;   // one test per signature (Candidates::sig)
    auto key = context_of(conf, g);
    feed(key, cand.id), key.b |= 1;
    if (auto it = mine.find(key); it != mine.end()) return *it->second;
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
    return *mine.emplace(key, std::move(list)).first->second;
}

/** The free half-edge to branch on; none when the tiling is closed, or when `dead` (some free half-edge has no option). */
template<class Faces>
static index_t choose_halfedge(tiling_t& conf, Faces const& faces, FastFaces const& ids, vertex_classification const& vc,
                               Candidates const& cand, int root, bool can_add, bool& dead) {
    dead = false;
    index_t best{};
    int least = std::numeric_limits<int>::max();
    if (face_first) {
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
    for (size_t i = n; i-- > 0;) {
        index_t const g = free[i];
        int k = 0;
        if (can_add) {
            auto const& list = passing_pairs(conf, faces, ids, vc, cand, g);
            k = int(list.end() - std::lower_bound(list.begin(), list.end(), root, [](Candidates::Pair p, int t) { return p.t < t; }));
        }
        for (size_t j = 0; j < n && k < least; j++) {
            int8_t& r = known[i * n + j];
            if (r < 0) r = known[j * n + i] = can_join(conf, faces, g, free[j]);
            k += r;
        }
        if (k == 0) { dead = true; return {}; }
        if (k < least) least = k, best = g;
    }
    return best;
}

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
    size_t num_iterations = 0, max_num_vertices = 0, num_vertices_added = 0;   // vertices that count toward k
    size_t num_flat = 0, max_flat = 0;                                         // and flat ones (flat_max)
    int first_vertex = 0;
    size_t task_nodes = 0;   // nodes this task has visited
    int base_edges = 0;      // edges when this task started
    std::vector<int> types;  // each vertex's type, for the required sets

    void add_vertex(int t) {
        auto& h = conf.*HalfedgesOf::member;
        size_t need = h.size() + vc->valence_of(t);
        if (h.capacity() < need) h.reserve(std::max(2 * h.capacity(), need));
        ++(is_flat(*vc, t) ? num_flat : num_vertices_added);
        vc->push_vertex_to(conf, t);
        types.push_back(t);
    }
    void remove_last_vertex() { --(is_flat(*vc, types.back()) ? num_flat : num_vertices_added); conf.pop_vertex(); types.pop_back(); }
    bool room(int t) const { return is_flat(*vc, t) ? num_flat < max_flat : num_vertices_added < max_num_vertices; }
    bool can_add() const { return num_vertices_added < max_num_vertices || num_flat < max_flat; }

    void extend() {
        num_iterations++;
        task_nodes++;
        if (!iteration(*this)) return;
        bool dead;
        index_t const f = choose_halfedge(conf, *faces, *ids, *vc, *cand, first_vertex, can_add(), dead);
        if (dead) return;
        if (!f.has_value()) {
            if (!required.missing(types)) solution(*this);
            return;
        }
        for (auto ix : conf.indices())
            if (conf.is_free(ix)) try_joining(f, ix);
        if (can_add()) extend_by_adding_vertex(f);
    }
    void extend_by_adding_vertex(index_t f) {
        // fail first knows which pairs pass (a copy: the table may be emptied further down)
        std::vector<Candidates::Pair> passing;
        if (!face_first) passing = passing_pairs(conf, *faces, *ids, *vc, *cand, f);
        auto const& list = face_first ? cand->at(conf, f, *ids) : passing;
        auto it = std::lower_bound(list.begin(), list.end(), first_vertex, [](Candidates::Pair p, int t) { return p.t < t; });
        uint32_t const miss = required.missing(types);
        while (it != list.end()) {
            int const t = it->t, base = conf.num_halfedges();
            if (!room(t) || !required.may_add(miss, first_vertex, t, max_num_vertices - num_vertices_added - !is_flat(*vc, t))) {
                while (it != list.end() && it->t == t) ++it;
                continue;
            }
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


/**
 * Per root type of `order`, the nodes of its search to `depth` vertices (unpruned by required sets): over the
 * whole alphabet when `whole`, else from its own type on, as the search goes. Also each root type's line
 * (its place in `order`).
 */
// With --progress, the startup's long steps print `stage <name> <done> <total>` twice a second, so a board of
// thousands of root types does not look frozen before its first `roots` line.
static bool show_stages = false;

// The vertex types and gluing tables of one order, kept so trials that walk the same order share one (3 s to
// build on a star board of 77,075 root types); the ranking drops it.
struct SmallTables {
    Board const* board;
    std::vector<int> order, line_of;   // line_of: per root type, its line's place in `order`
    int root_lines;
    vertex_classification vc{};
    FastFaces fast;
    std::unique_ptr<Candidates> cand;
    SmallTables(Board const& b, std::vector<int> const& o, int lines) : board(&b), order(o), root_lines(lines), fast(b.faces, b.apeirogons) {
        if (show_stages) std::cout << "stage tables 0 0" << std::endl;
        for (int i = 0; i < (int)order.size(); i++) {
            auto const& w = b.vertices[order[i]];
            int const n = b.permutations ? vc.add_vertex_with_permutations(w) : vc.add_vertex(w);
            if (i < root_lines) line_of.insert(line_of.end(), n, i);
        }
        cand = std::make_unique<Candidates>(vc, fast, fast);
    }
};
static std::unique_ptr<SmallTables> small_tables;

static std::vector<uint64_t> small_trees(Board const& b, std::vector<int> const& order, int root_lines, int depth, bool whole,
                                         int threads, std::vector<int>& line_of, char const* stage, uint64_t cap = UINT64_MAX) {
    if (!small_tables || small_tables->board != &b || small_tables->order != order || small_tables->root_lines != root_lines)
        small_tables = std::make_unique<SmallTables>(b, order, root_lines);
    auto const& vc = small_tables->vc;
    auto const& fast = small_tables->fast;
    auto const& cand = *small_tables->cand;
    line_of = small_tables->line_of;
    Required const kept = std::exchange(required, Required{});
    std::vector<uint64_t> tree(line_of.size());
    std::atomic<int> next{ 0 }, done{ 0 };
    std::atomic<uint64_t> shared{ 0 };   // nodes so far, added 4096 at a time; past `cap` every tree stops
    std::atomic<bool> over{ false };
    std::vector<std::thread> pool;
    for (int i = 0; i < std::max(1, threads); i++) pool.emplace_back([&] {
        uint64_t mine = 0;   // this thread's nodes, over all its trees
        for (int t; (t = next++) < (int)tree.size(); done++) {
            uint64_t nodes = 0;
            auto node = [&](auto const&) {
                if (over.load(std::memory_order_relaxed)) return false;
                nodes++;
                if (++mine % 4096 == 0 && (shared += 4096) >= cap) over = true;
                return true;
            };
            Extender s{ tiling_t{}, &fast, &fast, &vc, &cand, node, [](auto const&) {} };
            s.add_vertex(t);
            s.first_vertex = whole ? 0 : t;
            s.max_num_vertices = depth;
            s.max_flat = flat_max;
            s.extend();
            tree[t] = nodes;
        }
    });
    auto report = [&] { std::cout << "stage " << stage << " " << done << " " << tree.size() << std::endl; };
    if (show_stages) report();
    while (show_stages && done < (int)tree.size()) std::this_thread::sleep_for(std::chrono::milliseconds(500)), report();
    for (auto& th : pool) th.join();
    required = kept;
    return tree;
}

// for_each_tiling_threaded (tiling_extender.h) with every root counted, so the caller learns when each
// one finishes. on_tiling(r, conf), on_task_end() and on_root_done(r) run on worker threads.
template<class FaceType, class FT, class FE, class FD>
static void search(std::vector<int> const& roots, int kmax, vertex_classification const& vc, FaceType const& faces,
                   FastFaces const& ids, Candidates const& cand, int threads, std::vector<std::unique_ptr<Root>>& state, FT on_tiling, FE on_task_end,
                   FD on_root_done) {
    Pool pool;
    // A task hands over its output before its root's count drops, so a root that reaches 0 has all of it.
    auto finish = [&](int r) { on_task_end(); if (--state[r]->tasks == 0) on_root_done(r); };
    for (int r : roots) {
        Extender s{ tiling_t{}, &faces, &ids, &vc, &cand,
            [&](auto const& s) {
                // Give this node's subtree away only when a thread is waiting for work, and only near the top
                // of this task's own subtree, where the work is (his engine gave away whatever node it was at,
                // every 10 nodes while 64 tasks were not yet queued: mostly small deep subtrees, handed back and
                // forth through the lock). Never at a task's first node, or a task would only pass itself on.
                if ((++my_nodes & 4095) == 0 && live_nodes.fetch_add(4096, std::memory_order_relaxed) + 4096 >= node_cap.load(std::memory_order_relaxed))
                    capped.store(true, std::memory_order_relaxed);
                if (capped.load(std::memory_order_relaxed)) return false;
                if (s.task_nodes < 2 || !pool.hungry() || s.conf.num_edges() - s.base_edges > split_depth) return true;
                auto clone{ s };
                clone.task_nodes = 0;
                clone.base_edges = clone.conf.num_edges();
                state[clone.first_vertex]->tasks++;
                pool.push([clone, &finish]() mutable { clone.extend(); finish(clone.first_vertex); });
                return false;
            },
            [&](auto const& s) { my_complete++; on_tiling(s.first_vertex, s.conf, (int)s.num_vertices_added); } };
        s.add_vertex(r);
        s.first_vertex = r;
        s.max_num_vertices = kmax;
        s.max_flat = flat_max;
        pool.push([s, &finish]() mutable { s.extend(); finish(s.first_vertex); });
    }
    pool.run(threads);
}

// ── the start set and the branching rule ──
//
// A run picks the required set it starts from and its branching rule (fewest options, or the face nearest to
// closing) by measuring them: each pair runs the real search to k <= 1, 2, 3, ..., its nodes per k are fitted
// to a growth rate and carried on to kmax, and the fewest predicted nodes win. Measuring to a fixed small depth
// does not do: the rules' costs cross as k grows. On A12p60.120 fewest options takes fewer nodes up to k = 10
// and 36x more at k = 22 (33.1M against 0.91M), while on A6a60,C6a60 the face rule loses at every k (23M
// against 1.36M at k <= 8); one fixed rule, and a trial to 2 or 3 vertices, each got one of them badly wrong
// (experiments/results/tilesearch-rule-curves-2026-10-28.log). The trials stop once they have cost
// PLAN_SHARE of the cheapest prediction, so a long search is measured deeper and a short one hardly at all;
// a pair PLAN_BEHIND times the best at the same k is dropped. They may always spend PLAN_FIRST: the prediction
// from a few small k can be far too low (B12/120: 5,511 nodes from k <= 4, 2.3M at k <= 20), and 5% of it would
// stop them there (experiments/results/tilesearch-rule-choice-2026-10-28.log). TILESEARCH_FACE_FIRST / TILESEARCH_FAIL_FIRST
// force the rule.
static double const PLAN_SHARE = 0.05, PLAN_BEHIND = 30;
static uint64_t const PLAN_FIRST = 2000000;   // the least the trials may spend
static uint64_t const PLAN_TIMED = 20000;     // a trial this big is timed well enough to weigh nodes by seconds

/** One way to run the search: the required set it starts from, its branching rule, its nodes per k so far. */
struct Way {
    int pick;                     // required set (vertex_order), -1 for the default
    bool face;
    std::vector<uint64_t> nodes;  // [j - 1]: the search's nodes to k <= j
    double predicted = 0;         // its nodes to kmax
    double secs = 0;              // its last trial's seconds
    bool out = false;
    double per_node() const { return nodes.empty() ? 0 : secs / std::max<uint64_t>(1, nodes.back()); }
};
static double predict(Way const& w, int kmax) {
    auto const& n = w.nodes;
    int const j = (int)n.size();
    if (j == 0) return 0;
    double g = 1;   // growth per k, over the last two steps when there are two
    if (j >= 3) g = std::sqrt((double)n[j - 1] / std::max<uint64_t>(1, n[j - 3]));
    else if (j == 2) g = (double)n[1] / std::max<uint64_t>(1, n[0]);
    return n[j - 1] * std::pow(std::max(1.0, g), kmax - j);
}

/** The vertex types of one start set, with its required-set tables. */
struct SetTables {
    vertex_classification vc{};
    Required req;
    int roots = 0;
    std::unique_ptr<Candidates> cand;
};

/** The search's nodes to k <= j from every root, under `face`, UINT64_MAX past `cap`; and its seconds. */
static std::pair<uint64_t, double> trial(Board const& b, SetTables const& t, FastFaces const& fast, bool face, int j, uint64_t cap, int threads) {
    required = t.req;
    face_first = face;
    flat_max = flat_budget(b, j);
    std::vector<std::unique_ptr<Root>> state(t.roots);
    std::vector<int> roots(t.roots);
    for (int r = 0; r < t.roots; r++) roots[r] = r, state[r] = std::make_unique<Root>();
    total_nodes = 0, live_nodes = 0, node_cap = cap, capped = false;
    auto const t0 = std::chrono::steady_clock::now();
    search(roots, j, t.vc, fast, fast, *t.cand, threads, state, [](int, auto const&, int) {}, [] {}, [](int) {});
    double const secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    uint64_t const n = capped ? UINT64_MAX : total_nodes.load();
    total_nodes = 0, live_nodes = 0, node_cap = UINT64_MAX, capped = false;
    return { n, secs };
}

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
    std::cerr << "cannot resume: " << dir / "order.txt" << " does not fit the board\n";
    std::exit(2);
}

/** What a run settles before it searches, the same in tilesearch and tileestimate: the start set, the rule,
 *  the roots' order, and what the trials measured. */
struct Plan {
    std::vector<int> order;
    int roots = 0;
    int pick = -1;
    std::vector<Way> ways;   // every way tried, when there was a choice
    int depth = 0;           // the trials' last k
    bool ranked = false;
    bool timed = false;      // ways compared by predicted seconds, else nodes
};

/**
 * Root r searches only the types from r on, so each node of the search is visited from one start only: its
 * first type in the order. Putting first the root lines whose types grow the smallest trees over the whole
 * alphabet (to 3 vertices under fewest options, 2 under the face rule) makes those starts the cheap ones: on
 * A6_30 this cut the search to 3% of its nodes at k <= 4 (experiments/results/vertex-order-2026-10-26.log,
 * search-speedups-2026-10-26.log). Those trees skip the required-set pruning and take the full flat budget, so
 * they can outgrow the search itself (123_1_4657 at k <= 2 ran for hours): past `cap` nodes the board's order
 * stays. Any order finds the same tilings, each once.
 */
static bool rank_roots(Board const& b, std::vector<int>& order, int root_lines, int threads, uint64_t cap) {
    int const depth = std::min(face_first ? 2 : 3, b.kmax);
    if (root_lines < 2) return false;
    std::vector<int> line_of;   // per root type, its line's place in `order`
    auto const tree = small_trees(b, order, root_lines, depth, true, threads, line_of, "rank", cap);
    small_tables.reset();
    if (std::accumulate(tree.begin(), tree.end(), uint64_t{ 0 }) >= cap) return false;
    std::vector<uint64_t> weight(root_lines);
    for (size_t t = 0; t < tree.size(); t++) weight[line_of[t]] += tree[t];
    std::vector<int> place(root_lines);
    std::iota(place.begin(), place.end(), 0);
    std::stable_sort(place.begin(), place.end(), [&](int x, int y) { return weight[x] < weight[y]; });
    std::vector<int> ranked;
    for (int i : place) ranked.push_back(order[i]);
    ranked.insert(ranked.end(), order.begin() + root_lines, order.end());
    order = ranked;
    return true;
}

static Plan plan(Board const& b, int threads, fs::path const* resume_dir) {
    Plan p;
    std::vector<int> recorded;
    if (resume_dir) std::tie(recorded, p.roots) = recorded_order(*resume_dir, b, p.pick);
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

    if (b.kmax > 1) {
        FastFaces const fast(b.faces, b.apeirogons);
        std::map<int, std::unique_ptr<SetTables>> tables;
        for (int pk : picks) {
            auto t = std::make_unique<SetTables>();
            auto const [order, lines] = vertex_order(b, pk);
            t->roots = classify(b, order, lines, t->vc);
            t->req = required;
            t->cand = std::make_unique<Candidates>(t->vc, fast, fast);
            tables[pk] = std::move(t);
        }
        uint64_t spent = 0;
        auto best = [&] {
            double m = 0;
            for (auto const& w : p.ways) if (!w.out && w.nodes.size() > 1 && (m == 0 || w.predicted < m)) m = w.predicted;
            return m;
        };
        for (int j = 1; j < b.kmax; j++) {
            double const pred = best();
            double const allowed = std::max<double>(PLAN_FIRST, pred > 0 ? PLAN_SHARE * pred : 0);
            if (spent >= allowed) break;
            uint64_t const budget = (uint64_t)allowed - spent;
            // the cheapest so far first, so the rest are capped by it
            std::vector<Way*> live;
            for (auto& w : p.ways) if (!w.out) live.push_back(&w);
            std::stable_sort(live.begin(), live.end(), [](Way* x, Way* y) {
                return (x->nodes.empty() ? 0 : x->nodes.back()) < (y->nodes.empty() ? 0 : y->nodes.back()); });
            uint64_t low = UINT64_MAX, used = 0;
            bool over = false;
            for (Way* w : live) {
                if (show_stages) std::cout << "stage plan " << j << " " << b.kmax - 1 << std::endl;
                // past what is left of the budget the trials stop, alike for every way; only PLAN_BEHIND drops a way
                double const left = (double)budget - (double)used, behind = low == UINT64_MAX ? 1e300 : PLAN_BEHIND * low;
                if (left <= 0) { over = true; break; }
                uint64_t const cap = std::min(left, behind);
                auto const [n, secs] = trial(b, *tables[w->pick], fast, w->face, j, cap, threads);
                if (n == UINT64_MAX && left <= behind) { over = true; break; }
                used += n == UINT64_MAX ? cap : n;
                if (n == UINT64_MAX) { w->out = true; continue; }
                w->nodes.push_back(n);
                w->secs = secs;
                low = std::min(low, n);
            }
            spent += used;
            if (over) {   // keep k < j only, alike for every way
                for (auto& w : p.ways) if (w.nodes.size() == (size_t)j) w.nodes.pop_back();
                break;
            }
            p.depth = j;
            for (auto& w : p.ways) if (!w.out) w.predicted = predict(w, b.kmax);
            if (std::count_if(p.ways.begin(), p.ways.end(), [](Way const& w) { return !w.out; }) == 1) break;
        }
        flat_max = flat_budget(b);
    }
    // The least predicted time: nodes cost differently under the two rules (a node under fewest options took
    // 1.7-4x the time of one under the face rule on squares_edges and test), so each way's prediction is
    // weighted by its own seconds per node, once every live way's last trial has PLAN_TIMED nodes to time;
    // below that, nodes alone. Before any trial, or among equals, the first way (fewest options, default set).
    bool const timed = std::all_of(p.ways.begin(), p.ways.end(), [](Way const& w) { return w.out || (w.nodes.size() && w.nodes.back() >= PLAN_TIMED); });
    auto cost = [&](Way const& w) { return w.predicted * (timed ? w.per_node() : 1); };
    Way const* pickw = &p.ways[0];
    for (auto const& w : p.ways)
        if (!w.out && (pickw->out || (w.nodes.size() && cost(w) < cost(*pickw)))) pickw = &w;
    p.timed = timed;
    p.pick = pickw->pick;
    face_first = pickw->face;
    auto [order, roots] = vertex_order(b, p.pick);
    p.roots = roots;
    if (resume_dir) p.order = recorded;
    else {
        uint64_t const cap = std::max<double>(1e6, PLAN_SHARE * pickw->predicted);
        p.ranked = rank_roots(b, order, roots, threads, cap);
        p.order = order;
    }
    if (p.ways.size() == 1) p.ways.clear();
    return p;
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
        else if (a == "--progress") progress = show_stages = true;
        else if (a == "--resume") resume = true;
        else if (a == "--gzip") gzip = true;
        else { std::cerr << "unknown argument " << a << "\n" << usage; return 2; }
    }
    if (b.kmin < 1 || b.kmax < b.kmin || b.kmax > 128) { std::cerr << "--k needs 1 <= kmin <= kmax <= 128\n"; return 2; }
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
        std::cout << "permutations " << b.permutations << "\ninitial " << n_initial << "\n";
        for (auto const& set : required_sets(b)) {
            std::cout << "require";
            for (int v : set) std::cout << " " << v + 1;
            std::cout << "\n";
        }
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
    bool const resuming = fs::exists(dir) && !fs::is_empty(dir);
    if (resuming && !resume) { std::cerr << dir << " is not empty: pass --resume to continue it, or move it away\n"; return 2; }
    if (resuming) {
        std::ifstream old(dir / "board.txt");
        std::string was((std::istreambuf_iterator<char>(old)), std::istreambuf_iterator<char>());
        if (was != board_text.str()) { std::cerr << "cannot resume: " << dir / "board.txt" << " is a different board\n"; return 2; }
    }
    Plan const pl = plan(b, threads, resuming ? &dir : nullptr);
    order = pl.order, n_initial = pl.roots;
    if (!pl.ways.empty()) {   // what the trials measured: per way, its nodes at their last k and its prediction
        std::cout << "plan: to k <= " << pl.depth << ", predicted at k <= " << b.kmax << ":";
        for (auto const& w : pl.ways) {
            std::cout << " [" << (w.face ? "face" : "fewest");
            if (w.pick >= 0) std::cout << " set " << w.pick + 1;
            if (w.out) std::cout << " dropped]";
            else std::cout << " " << (w.nodes.empty() ? 0 : w.nodes.back()) << " -> " << (uint64_t)w.predicted << " nodes, " << (uint64_t)(w.per_node() * 1e9) << " ns/node]";
        }
        std::cout << (pl.timed ? " (by time)" : " (by nodes)") << std::endl;
    }
    if (pl.pick >= 0) std::cout << "roots: from required set " << pl.pick + 1 << std::endl;
    std::cout << "branching: " << (face_first ? "on the face nearest to closing" : "on the fewest options") << (pl.ranked || resuming ? "" : " (roots in the board's order)") << std::endl;
    std::set<int> done;
    std::array<std::atomic<uint64_t>, 129> per_k{};   // tilings per k: finished roots plus the running ones
    if (resuming) {
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
        {
            std::ofstream f(dir / "order.txt");
            for (size_t i = 0; i < order.size(); i++) f << (i ? " " : "") << order[i] + 1;
            f << "\n";
        }
        std::ofstream(dir / "board.txt") << board_text.str();
        if (gzip) std::ofstream(dir / "gzip");   // the format of this run's certificates, read back by --resume
        std::ofstream f(dir / "symbols.txt");
        for (auto const& [s, c] : b.codes) {
            std::ostringstream printed;
            printed << corner_decoder{ c };
            if (printed.str() != s) f << printed.str() << " " << s << "\n";
        }
    }

    small_tables.reset();   // a resume skips the ranking
    if (show_stages) std::cout << "stage tables 0 0" << std::endl;
    vertex_classification vc{};
    int const roots = classify(b, order, n_initial, vc);
    original_tiling_writer writer{ vc };

    auto t0 = std::chrono::steady_clock::now();
    auto report = [&] {
        size_t total = 0;
        std::ostringstream ks;
        for (int k = 1; k <= b.kmax; k++)
            if (uint64_t n = per_k[k]) total += n, ks << " " << k << ":" << n;
        std::cout << "progress " << std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count()
                  << " " << total << ks.str() << " nodes " << live_nodes << std::endl;
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
        if (!done.count(r)) todo.push_back(r), state[r] = std::make_unique<Root>();
    // a root's folder under .part/ is made when it first has output: most have none, and making 77,075 of
    // them up front took 12 s on a star board
    auto spill = [&](int r, Root& st) {   // caller holds st.mutex
        if (!st.out.empty()) fs::create_directories(part / std::to_string(r));
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
    // k: the vertex orbits that count (`flat_max`); the certificate still lists every orbit
    auto on_tiling = [&](int r, auto const& conf, int k) {
        if (k < b.kmin) return;
        if (!holds_required_faces(b.require_faces, conf)) return;
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
        name << b.name << "solver_" << (k < 10 ? "0" : "") << k << "_" << std::hex;
        for (auto c : corners) name << corner_decoder{ c };
        name << std::dec << (orientable(conf) ? "_o" : "") << "_" << conf.num_edges() << "." << writer.extension();
        writer.write_content(text, conf);
        per_k[k]++;
        if (batch.root != r) hand_over();
        batch.root = r;
        batch.counts[k]++;
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
            if (fs::exists(part / std::to_string(r)))
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
    {
        CrossCheck const cross(b.faces, b.apeirogons);
        search(todo, b.kmax, vc, cross, fast, Candidates(vc, cross, fast), threads, state, on_tiling, hand_over, on_root_done);
    } else
        search(todo, b.kmax, vc, fast, fast, Candidates(vc, fast, fast), threads, state, on_tiling, hand_over, on_root_done);
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
