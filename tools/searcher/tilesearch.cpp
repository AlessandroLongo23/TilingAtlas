// tilesearch: run Marek Čtrnáct's tiling engine on a board file (docs/searcher/board-format.md).
//
// Each of his pt_*.exe is the engine plus a main() that hard-codes one board and calls
// find_and_write_tilings. This is that main() once, reading the board from a text file. It builds the
// same arguments his mains build and runs his search, with two changes to how the run is organised
// (not to what it finds; see search and Fingerprints):
//   - progress is checkpointed per root vertex, so a stopped run resumes with the roots it had not finished;
//   - duplicates are recognised by a 128-bit fingerprint of the canonical form, not the form itself.
//
// usage: tilesearch <board> [--k <kmin> <kmax>] [--threads <n>] [--nice <n>] [--resume] [--progress] [--dump]
//   --resume continues a stopped run in this folder (the board must be the same).
//   --progress prints `progress <seconds> <total> <k>:<count>...` twice a second and `roots <done> <all>`
//   at every root boundary (read by the app).
//   --dump prints the engine arguments the board compiles to and exits (the parser's test hook).
#include <sys/resource.h>
#include <atomic>
#include <memory>
#include <unordered_set>
#include <condition_variable>
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
            if (b.kmin < 1 || b.kmax < b.kmin) fail(lineno, "k needs 1 <= kmin <= kmax");
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
    struct Hash { size_t operator()(Key const& k) const { return k.a; } };
    std::unordered_set<Key, Hash> seen;
    std::mutex mutex;
    static uint64_t mix(uint64_t x) {   // murmur3 fmix64, a bijection
        x ^= x >> 33; x *= 0xff51afd7ed558ccdULL; x ^= x >> 33; x *= 0xc4ceb9fe1a85ec53ULL; return x ^ (x >> 33);
    }
    bool first_time(std::vector<uint32_t> const& form) {
        uint64_t a = 0x9e3779b97f4a7c15ULL ^ form.size(), b = 0x2545f4914f6cdd1dULL + form.size();
        for (uint32_t w : form) a = mix(a ^ w), b = mix(b + w * 0x100000001b3ULL);
        std::lock_guard<std::mutex> lock(mutex);
        return seen.insert({ a, b }).second;
    }
};

// One root vertex's share of the search. The search never adds a vertex type below its root, so root r
// finds exactly the tilings whose lowest vertex type is r: roots partition the output, and each can be
// deduplicated, written and checkpointed on its own while all of them share one thread pool.
struct Root {
    Fingerprints seen;
    std::atomic<int> tasks{ 1 };         // queued or running subtrees; 0 means the root is finished
    std::mutex mutex;                    // guards counts and buffered output
    std::map<int, size_t> counts;
    std::map<std::string, std::string> out;
    size_t buffered = 0;
};

// for_each_tiling_threaded (tiling_extender.h) with every root counted, so the caller learns when each
// one finishes. on_tiling(r, conf) and on_root_done(r) run on worker threads.
template<class FaceType, class FT, class FD>
static void search(std::vector<int> const& roots, int kmax, vertex_classification const& vc, FaceType const& faces,
                   int threads, std::vector<std::unique_ptr<Root>>& state, FT on_tiling, FD on_root_done) {
    thread_pool pool{};
    pool.initialise(threads);
    auto finish = [&](int r) { if (--state[r]->tasks == 0) on_root_done(r); };
    for (int r : roots) {
        tiling_extender s{ tiling_t{}, faces, vc,
            [&](auto const& s) {   // hand subtrees to idle threads, exactly as his engine does
                if (s.num_iterations % 10 != 0 || !pool.wanting_tasks()) return true;
                auto clone{ s };
                state[clone.first_vertex]->tasks++;
                pool.add_task_to_queue([clone, &finish]() mutable { clone.extend(); finish(clone.first_vertex); return false; });
                return false;
            },
            [&](auto const& s) { on_tiling(s.first_vertex, s.conf); } };
        s.add_vertex(r);
        s.first_vertex = r;
        s.max_num_vertices = kmax;
        pool.add_task_to_queue([s, &finish]() mutable { s.extend(); finish(s.first_vertex); return false; });
    }
    pool.wait_until_empty();
    pool.terminate();
}

int main(int argc, char** argv) {
    char const* usage = "usage: tilesearch <board> [--k <kmin> <kmax>] [--threads <n>] [--nice <n>] [--resume] [--progress] [--dump]\n";
    if (argc < 2) { std::cerr << usage; return 2; }
    Board b = read_board(argv[1]);
    int threads = std::max(1u, std::thread::hardware_concurrency()), nice = 0;
    bool dump = false, progress = false, resume = false;
    for (int i = 2; i < argc; i++) {
        std::string a = argv[i];
        if (a == "--k" && i + 2 < argc) b.kmin = std::atoi(argv[++i]), b.kmax = std::atoi(argv[++i]);
        else if (a == "--threads" && i + 1 < argc) threads = std::max(1, std::atoi(argv[++i]));
        else if (a == "--nice" && i + 1 < argc) nice = std::atoi(argv[++i]);
        else if (a == "--dump") dump = true;
        else if (a == "--progress") progress = true;
        else if (a == "--resume") resume = true;
        else { std::cerr << "unknown argument " << a << "\n" << usage; return 2; }
    }
    if (b.kmin < 1 || b.kmax < b.kmin) { std::cerr << "--k needs 1 <= kmin <= kmax\n"; return 2; }
    if (nice) setpriority(PRIO_PROCESS, 0, nice);   // before any thread exists, so all of them inherit it

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
    std::map<int, size_t> per_k;   // finished roots plus the running one
    std::mutex per_k_mutex;
    if (fs::exists(dir) && !fs::is_empty(dir)) {
        if (!resume) { std::cerr << dir << " is not empty: pass --resume to continue it, or move it away\n"; return 2; }
        std::ifstream old(dir / "board.txt");
        std::string was((std::istreambuf_iterator<char>(old)), std::istreambuf_iterator<char>());
        if (was != board_text.str()) { std::cerr << "cannot resume: " << dir / "board.txt" << " is a different board\n"; return 2; }
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
        std::ofstream f(dir / "symbols.txt");
        for (auto const& [s, c] : b.codes) {
            std::ostringstream printed;
            printed << corner_decoder{ c };
            if (printed.str() != s) f << printed.str() << " " << s << "\n";
        }
    }

    GenericFaceChecker face_checker{};
    for (auto const& f : b.faces) face_checker.add_face(f);
    for (auto const& a : b.apeirogons) face_checker.add_apeirogon(a);
    vertex_classification vc{};
    int roots = 0;
    for (int i = 0; i < (int)order.size(); i++) {
        int n = b.permutations ? vc.add_vertex_with_permutations(order[i]) : vc.add_vertex(order[i]);
        if (i < n_initial) roots += n;
    }
    original_tiling_writer writer{ vc };

    auto t0 = std::chrono::steady_clock::now();
    auto report = [&] {
        std::lock_guard<std::mutex> lock(per_k_mutex);
        size_t total = 0;
        std::ostringstream ks;
        for (auto const& [k, n] : per_k) total += n, ks << " " << k << ":" << n;
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
        for (auto& [name, text] : st.out) std::ofstream(part / std::to_string(r) / name, std::ios::app | std::ios::binary) << text;
        st.out.clear();
        st.buffered = 0;
    };
    std::mutex merge_mutex;
    if (progress) std::cout << "roots " << done.size() << " " << roots << std::endl;
    search(todo, b.kmax, vc, face_checker, threads, state,
        [&](int r, auto const& conf) {
            if (conf.num_vertices() < b.kmin) return;
            Root& st = *state[r];
            auto form = canonical_form_if_minimal(conf, uint32_t{});
            if (!form || !st.seen.first_time(*form)) return;
            std::ostringstream name, text;
            name << b.name << "solver_" << (conf.num_vertices() < 10 ? "0" : "") << conf.num_vertices() << "_" << std::hex;
            for (auto c : used_corners_of(conf)) name << corner_decoder{ c };
            name << std::dec << (is_orientable(conf) ? "_o" : "") << "_" << conf.num_edges() << "." << writer.extension();
            writer.write_content(text, conf);
            { std::lock_guard<std::mutex> lock(per_k_mutex); per_k[conf.num_vertices()]++; }
            std::lock_guard<std::mutex> lock(st.mutex);
            st.counts[conf.num_vertices()]++;
            st.buffered += text.str().size();
            st.out[name.str()] += text.str();
            if (st.buffered > (1 << 20)) spill(r, st);
        },
        [&](int r) {
            Root& st = *state[r];
            { std::lock_guard<std::mutex> lock(st.mutex); spill(r, st); }
            std::lock_guard<std::mutex> lock(merge_mutex);
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
        });
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
    return 0;
}
