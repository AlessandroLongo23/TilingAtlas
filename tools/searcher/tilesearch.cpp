// tilesearch: run Marek Čtrnáct's tiling engine on a board file (docs/searcher/board-format.md).
//
// Each of his pt_*.exe is the engine plus a main() that hard-codes one board and calls
// find_and_write_tilings. This is that main() once, reading the board from a text file. It builds the
// same arguments his mains build and runs the same loop as find_and_write_tilings_template
// (src/solutions_processor.cpp), adding only a per-k count for census.txt.
//
// usage: tilesearch <board> [--k <kmin> <kmax>] [--threads <n>] [--dump] [--progress]
//   --dump prints the engine arguments the board compiles to and exits (the parser's test hook).
//   --progress prints `progress <seconds> <total> <k>:<count>...` twice a second (read by the app).
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

int main(int argc, char** argv) {
    if (argc < 2) { std::cerr << "usage: tilesearch <board> [--k <kmin> <kmax>] [--threads <n>] [--dump] [--progress]\n"; return 2; }
    Board b = read_board(argv[1]);
    int threads = std::max(1u, std::thread::hardware_concurrency());
    bool dump = false, progress = false;
    for (int i = 2; i < argc; i++) {
        std::string a = argv[i];
        if (a == "--k" && i + 2 < argc) b.kmin = std::atoi(argv[++i]), b.kmax = std::atoi(argv[++i]);
        else if (a == "--threads" && i + 1 < argc) threads = std::max(1, std::atoi(argv[++i]));
        else if (a == "--dump") dump = true;
        else if (a == "--progress") progress = true;
        else { std::cerr << "unknown argument " << a << "\n"; return 2; }
    }
    if (b.kmin < 1 || b.kmax < b.kmin) { std::cerr << "--k needs 1 <= kmin <= kmax\n"; return 2; }

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

    // The engine opens solver_<name>/ files without checking, and appends to files an earlier run left
    // behind, so the folder is created here and must start empty.
    fs::path dir = "solver_" + b.name;
    if (fs::exists(dir) && !fs::is_empty(dir)) { std::cerr << dir << " is not empty; move it away first\n"; return 2; }
    fs::create_directories(dir);
    {
        std::ofstream f(dir / "board.txt");
        for (auto const& l : b.normalized)
            f << (l.rfind("k ", 0) == 0 ? "k " + std::to_string(b.kmin) + " " + std::to_string(b.kmax) : l) << "\n";
    }
    {
        std::ofstream f(dir / "symbols.txt");
        for (auto const& [s, c] : b.codes) {
            std::ostringstream printed;
            printed << corner_decoder{ c };
            if (printed.str() != s) f << printed.str() << " " << s << "\n";
        }
    }

    // find_and_write_tilings_template, with the face checker built as find_and_write_tilings builds it.
    GenericFaceChecker face_checker{};
    for (auto const& f : b.faces) face_checker.add_face(f);
    for (auto const& a : b.apeirogons) face_checker.add_apeirogon(a);
    vertex_classification vc{};
    int n_initial_templates = 0;
    for (int i = 0; i < (int)order.size(); i++) {
        int n = b.permutations ? vc.add_vertex_with_permutations(order[i]) : vc.add_vertex(order[i]);
        if (i < n_initial) n_initial_templates += n;
    }
    original_tiling_writer writer{ vc };
    solutions_processor solutions{ b.name, &writer };
    std::map<int, size_t> per_k;
    std::mutex per_k_mutex;

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
    for_each_unique_tiling_threaded(
        [&](auto const& conf) {
            { std::lock_guard<std::mutex> lock(per_k_mutex); per_k[conf.num_vertices()]++; }
            solutions.process(conf);
            return true; },
        b.kmin, b.kmax, vc, face_checker, threads, n_initial_templates);
    { std::lock_guard<std::mutex> lock(tick_mutex); searching = false; }
    tick.notify_all();
    ticker.join();
    solutions.results.flush();
    if (progress) report();
    double secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();

    std::ofstream census(dir / "census.txt");
    for (int k = b.kmin; k <= b.kmax; k++) census << "k=" << k << " -- " << per_k[k] << "\n";
    census << "MAX\n";
    std::cout << "\nFinished with " << solutions.results.num_results() << " solutions after " << secs << "s.\n";
    return 0;
}
