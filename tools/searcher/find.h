// `tilesearch <board> --find`: look for ONE tiling that meets every required set, not for all of them.
// Included by tilesearch.cpp after Board, read_board and the rest it uses.
//
// The required sets (`require` and `require face` lines) are the targets. Each step is a board derived
// from the user's (some targets dropped, some vertex lines dropped) searched one k at a time, upward,
// by this same executable with --first (stop at the first tiling) and --seconds (a time limit per k):
//   1. pairs: every two targets on the full board. Complete per k, so a pair with no tiling up to kmax
//      proves the whole set has none (a tiling meeting all targets meets each pair), and the highest k a
//      pair first appears at is a proven lower bound for the whole set;
//   2. union: every target, on only the vertex lines the pair tilings use. Incomplete by design: what it
//      finds is a tiling, an empty k proves nothing. This is the step that found the three hexagonal
//      stars together at k = 27 (experiments/results/star-existence-2026-10-30.log);
//   3. full: every target on the full board from the lower bound up, complete per k (raises the bound);
//   4. grow, with four targets or more: from the earliest pair, add one target at a time on the vertex
//      lines of the last tiling and of the pair tilings that involve the new target.
// Steps live under find/ in the run folder, each with result.txt, so a stopped find run started again
// skips the steps it finished. The tiling found goes to solver_<name>/ like a normal run's output.
#pragma once
#ifdef _WIN32
#define FIND_POPEN _popen
#define FIND_PCLOSE _pclose
#else
#include <sys/wait.h>
#define FIND_POPEN popen
#define FIND_PCLOSE pclose
#endif

namespace find {

struct Step {
    int found = 0;               // k of the tiling found, 0 for none
    int through = 0;             // the highest k searched to the end without a tiling
    bool timed = false;          // stopped by the time limit at k = through + 1
    fs::path cert;               // the certificate file of the tiling found
    std::set<int> types;         // the board vertex lines it uses
};

struct Finder {
    Board const& b;
    std::string exe;
    int threads, nice;
    double seconds;
    fs::path base, root;
    std::vector<std::string> targets;   // the require lines, in board order
    std::map<std::string, std::string> printed;   // a certificate's corner label -> the board symbol
    int steps_done = 0, steps_all = 0;
    std::vector<std::string> notes;   // per target: the comment on its board line (the app writes `# face ...`)
    // find.json, the run as the app shows it: one record per step, rewritten as each step and k moves on
    struct Rec { std::string name, what, state = "running"; int lines = 0, kfrom = 0, kto = 0, k = 0, found = 0, through = 0; bool kept = false; };
    std::vector<Rec> recs;
    int proven = 0, result = 0;
    bool done = false;
    bool prune = false;   // the steps run with --prune-balance: set when the board has types no tiling can use
    std::chrono::steady_clock::time_point const t0 = std::chrono::steady_clock::now();

    Finder(Board const& b, std::string exe, int threads, int nice, double seconds)
        : b(b), exe(std::move(exe)), threads(threads), nice(nice), seconds(seconds), base(fs::absolute(".")), root(base / "find") {
        for (auto const& l : b.normalized)
            if (l.rfind("require ", 0) == 0) targets.push_back(l);
        for (auto const& [s, c] : b.codes) {
            std::ostringstream p;
            p << corner_decoder{ c };
            printed[p.str()] = s, printed[s] = s;
        }
    }

    /** The board with only the targets in `keep` and, when `lines` is given, only those vertex lines
     *  (renumbering `require` and `initial`); "" when a target or `initial` loses every vertex. */
    std::string board(std::vector<int> const& keep, std::set<int> const* lines, int kmin, int kmax) const {
        std::map<int, int> to;   // old vertex number (1-based) -> new
        int v = 0, n = 0;
        for (auto const& l : b.normalized)
            if (l.rfind("vertex ", 0) == 0) { v++; if (!lines || lines->count(v - 1)) to[v] = ++n; }
        std::ostringstream out;
        v = 0;
        int t = -1;
        for (auto const& l : b.normalized) {
            std::istringstream ss(l);
            std::string kw;
            ss >> kw;
            if (kw == "k") { out << "k " << kmin << " " << kmax << "\n"; continue; }
            if (kw == "vertex") { if (to.count(++v)) out << l << "\n"; continue; }
            bool numbers = kw == "initial" || (kw == "require" && l.rfind("require face", 0) != 0);
            if (kw == "require" && std::find(keep.begin(), keep.end(), ++t) == keep.end()) continue;
            if (!numbers || l == "initial all") { out << l << "\n"; continue; }
            std::string line = kw;
            for (int x; ss >> x;)
                if (to.count(x)) line += " " + std::to_string(to[x]);
            if (line == kw) return "";
            out << line << "\n";
        }
        return out.str();
    }

    /** The vertex lines a certificate's tiling uses (line 2 lists its vertex orbits as `(a, b, c)Sym`),
     *  and every line of at most two corners, which costs nothing and fills notches and edge midpoints. */
    std::set<int> types_of(fs::path const& cert) const {
        std::ifstream in(cert);
        std::string line;
        std::getline(in, line), std::getline(in, line);
        auto key = [&](std::vector<int> w) {
            if (b.permutations) { std::sort(w.begin(), w.end()); return w; }
            std::vector<int> best;
            for (int m = 0; m < 2; m++, std::reverse(w.begin(), w.end()))
                for (size_t i = 0; i < w.size(); i++) {
                    std::vector<int> r(w.begin() + i, w.end());
                    r.insert(r.end(), w.begin(), w.begin() + i);
                    if (best.empty() || r < best) best = r;
                }
            return best;
        };
        std::map<std::vector<int>, std::vector<int>> lines;
        std::set<int> used;
        for (size_t i = 0; i < b.vertices.size(); i++) {
            lines[key(b.vertices[i])].push_back(int(i));
            if (b.vertices[i].size() <= 2) used.insert(int(i));
        }
        static const std::regex orbit("\\(([^)]*)\\)");
        for (std::sregex_iterator m(line.begin(), line.end(), orbit), e; m != e; ++m) {
            std::vector<int> w;
            std::istringstream ss(std::regex_replace((*m)[1].str(), std::regex(","), " "));
            for (std::string s; ss >> s;)
                if (printed.count(s)) w.push_back(b.codes.at(printed.at(s)));
            auto it = lines.find(key(w));
            if (it != lines.end()) used.insert(it->second.begin(), it->second.end());
        }
        return used;
    }

    static std::string quote(std::string const& s) { return "\"" + s + "\""; }

    /** Search `text` for its first tiling, k = kfrom.. kto, each k its own child run under find/<name>/. */
    Step run(std::string const& name, std::string const& text, int kfrom, int kto, std::string const& what) {
        Step st;
        recs.push_back({ name, what });
        for (size_t at = text.find("vertex "); at != std::string::npos; at = text.find("\nvertex ", at + 1)) recs.back().lines++;
        recs.back().kfrom = kfrom, recs.back().kto = kto;
        fs::path dir = root / name;
        make_dirs(dir);
        {   // a step finished in an earlier session of this run, on the same board, is taken as it was
            std::ifstream old(dir / "step.board");
            std::string was((std::istreambuf_iterator<char>(old)), std::istreambuf_iterator<char>());
            std::ifstream res(dir / "result.txt");
            std::string kind;
            if (was == text && res >> kind >> st.found >> st.through >> st.timed) {
                std::string c;
                if (st.found && std::getline(res >> std::ws, c)) st.cert = c, st.types = types_of(st.cert);
                recs.back().kept = true;
                report(what, st, true);
                return st;
            }
        }
        write_file(dir / "step.board", text);
        st.through = kfrom - 1;
        for (int k = kfrom; k <= kto && !st.found && !st.timed; k++) {
            fs::path kd = dir / ("k" + std::to_string(k));
            fs::remove_all(kd);   // a k cut short by a stop
            make_dirs(kd);
            std::string cmd = quote(exe) + " " + quote((dir / "step.board").string()) + " --k " + std::to_string(k) + " "
                + std::to_string(k) + " --threads " + std::to_string(threads) + " --first --progress";
            if (seconds > 0) cmd += " --seconds " + std::to_string(int(seconds));
            if (nice) cmd += " --nice " + std::to_string(nice);
            if (prune) cmd += " --prune-balance";
#ifdef _WIN32
            cmd = "\"" + cmd + "\"";   // cmd /c strips one pair of quotes round the whole line
#endif
            std::cout << "stage find " << steps_done << " " << steps_all << std::endl;
            recs.back().k = k;
            write_json();
            fs::current_path(kd);
            FILE* p = FIND_POPEN(cmd.c_str(), "r");
            fs::current_path(base);
            if (!p) { std::cout << "cannot start " << cmd << std::endl; std::exit(3); }
            char buf[4096];
            std::string first;
            while (std::fgets(buf, sizeof buf, p))
                if (std::strncmp(buf, "first ", 6) == 0) first = buf;
                else if (std::strncmp(buf, "progress ", 9) == 0)   // the app's clock: the whole find's time
                    std::cout << "progress " << std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count() << " 0" << std::endl;
            int code = FIND_PCLOSE(p);
#ifndef _WIN32
            code = WIFEXITED(code) ? WEXITSTATUS(code) : 128;
#endif
            if (!first.empty()) {
                std::istringstream ss(first.substr(6));
                std::string file;
                ss >> st.found >> file;
                st.cert = kd / ("solver_" + b.name) / file;
                st.types = types_of(st.cert);
            } else if (code == 4) st.timed = true;
            else if (code == 0) st.through = k;
            else if (code == WRITE_FAILED) { std::cout << "step " << name << ": a write failed at k=" << k << std::endl; std::exit(WRITE_FAILED); }
            else { std::cout << "step " << name << " failed at k=" << k << " (exit " << code << ")" << std::endl; std::exit(3); }
        }
        write_file(dir / "result.txt", "step " + std::to_string(st.found) + " " + std::to_string(st.through) + " " + std::to_string(st.timed) + "\n" + st.cert.string() + "\n");
        report(what, st, false);
        return st;
    }

    void report(std::string const& what, Step const& st, bool kept) {
        steps_done++;
        Rec& r = recs.back();
        r.state = st.found ? "found" : st.timed ? "timed" : "none", r.found = st.found, r.through = st.through;
        write_json();
        std::cout << what << ": ";
        if (st.found) std::cout << "a tiling at k=" << st.found << " on " << st.types.size() << " vertex lines";
        else if (st.timed) std::cout << "none up to k=" << st.through << ", time limit at k=" << st.through + 1;
        else std::cout << "none up to k=" << st.through;
        std::cout << (kept ? " (from an earlier session)" : "") << std::endl;
        std::cout << "stage find " << steps_done << " " << steps_all << std::endl;
    }

    static std::string esc(std::string const& x) {
        std::string o;
        for (char c : x) o += c == '"' || c == '\\' ? std::string("\\") + c : std::string(1, c);
        return o;
    }
    void write_json() const {
        std::ostringstream j;
        j << "{\"targets\":[";
        for (size_t t = 0; t < targets.size(); t++) j << (t ? "," : "") << "\"" << esc(label(int(t))) << "\"";
        j << "],\"seconds\":" << seconds << ",\"prune\":" << (prune ? "true" : "false") << ",\"proven\":" << proven
          << ",\"found\":" << result << ",\"done\":" << (done ? "true" : "false") << ",\"steps\":[";
        for (size_t i = 0; i < recs.size(); i++) {
            Rec const& r = recs[i];
            std::string kind = r.name.substr(0, r.name.find('-'));
            std::vector<int> ts;   // the targets in the step's name (pair-1-2, grow-1-3-4); none named means all
            for (size_t at = r.name.find('-'); kind != "union" && at != std::string::npos; at = r.name.find('-', at + 1))
                ts.push_back(std::atoi(r.name.c_str() + at + 1) - 1);
            j << (i ? "," : "") << "{\"name\":\"" << esc(r.name) << "\",\"kind\":\"" << kind << "\",\"what\":\"" << esc(r.what)
              << "\",\"targets\":[";
            for (size_t x = 0; x < ts.size(); x++) j << (x ? "," : "") << ts[x];
            // complete: every k up to `through` searched on the full board, so an empty k there proves something
            j << "],\"complete\":" << (kind == "pair" || kind == "full" || kind == "all" ? "true" : "false") << ",\"lines\":" << r.lines
              << ",\"kfrom\":" << r.kfrom << ",\"kto\":" << r.kto << ",\"k\":" << r.k << ",\"state\":\"" << r.state
              << "\",\"found\":" << r.found << ",\"through\":" << r.through << ",\"kept\":" << (r.kept ? "true" : "false") << "}";
        }
        j << "]}\n";
        write_file(base / "find.json.part", j.str());
        std::error_code ec;
        fs::rename(base / "find.json.part", base / "find.json", ec);
        if (ec) errno = ec.value(), io_failed("write", base / "find.json");
    }

    std::string label(int t) const {
        if (t < int(notes.size()) && !notes[t].empty()) return notes[t];
        if (targets[t].rfind("require face ", 0) == 0) {
            // the first face, its word cut to its period: `A12p30 A12d30 x 12`, not the word written out 12 times
            std::istringstream ss(targets[t].substr(13));
            std::vector<std::string> w;
            int m = 1, alts = 0;
            bool inf = false;
            for (std::string x; ss >> x;) {
                if (x == "|") { alts++; continue; }
                if (alts) continue;
                if (x == "x") { ss >> x; inf = x == "inf"; m = inf ? 1 : std::atoi(x.c_str()); continue; }
                if (x != "face") w.push_back(x);
            }
            size_t p = 1;
            while (p < w.size() && (w.size() % p || !std::equal(w.begin() + p, w.end(), w.begin()))) p++;
            std::string l = "face";
            for (size_t i = 0; i < p; i++) l += " " + w[i];
            l += inf ? " x inf" : " x " + std::to_string(m * int(w.size() / p));
            return alts ? l + " (or " + std::to_string(alts) + " more)" : l;
        }
        // a set of vertex numbers says nothing read aloud
        return "set " + std::to_string(t + 1) + " (" + std::to_string(std::count(targets[t].begin(), targets[t].end(), ' ')) + " vertices)";
    }

    int finish(Step const& st, int lower) {
        proven = lower, result = st.found, done = true;
        write_json();
        fs::path dir = base / ("solver_" + b.name);
        make_dirs(dir);
        if (st.found) {
            std::error_code ec;
            fs::copy_file(st.cert, dir / st.cert.filename(), fs::copy_options::overwrite_existing, ec);
            if (ec) errno = ec.value(), io_failed("write", dir / st.cert.filename());
            fs::path sym = st.cert.parent_path() / "symbols.txt";
            if (fs::exists(sym)) fs::copy_file(sym, dir / "symbols.txt", fs::copy_options::overwrite_existing, ec);
            if (ec) errno = ec.value(), io_failed("write", dir / "symbols.txt");
        }
        std::ostringstream census;
        for (int k = b.kmin; k <= b.kmax; k++) census << "k=" << k << " -- " << (k == st.found) << "\n";
        census << "MAX\n";
        write_file(dir / "census.txt", census.str());
        double secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
        if (lower > b.kmin) std::cout << "proven: no tiling meets every target below k=" << lower << std::endl;
        if (!st.found) std::cout << "no tiling found up to k=" << b.kmax << std::endl;
        std::cout << "\nFinished with " << (st.found ? 1 : 0) << " solutions after " << secs << "s.\n";
        return 0;
    }

    /** Whether the balance LP (balance.h) finds vertex types no periodic tiling can use. Pruning them is
     *  sound (checked on every board, experiments/results/balance-prune-2026-10-30.log) but costs a second
     *  or two of setup and can change the planner's choices, so the steps prune only when there is
     *  something to prune. */
    bool has_dead(std::string const& board_path) const {
        FILE* p = FIND_POPEN((quote(exe) + " " + quote(board_path) + " --balance").c_str(), "r");
        if (!p) return false;
        std::string out;
        char buf[4096];
        while (std::fgets(buf, sizeof buf, p)) out += buf;
        FIND_PCLOSE(p);
        std::smatch t, a;
        static const std::regex types("\"types\":(\\d+)"), alive("\"alive_types\":(\\d+)");
        return std::regex_search(out, t, types) && std::regex_search(out, a, alive) && std::stoi(a[1]) < std::stoi(t[1]);
    }

    int go(std::string const& board_path) {
        prune = has_dead(board_path);
        {   // the comments of the require lines: the app writes the face a vertex set stands for there
            std::ifstream in(board_path);
            for (std::string l; std::getline(in, l);) {
                size_t h = l.find('#'), s0 = l.find_first_not_of(" \t");
                if (s0 == std::string::npos || l.compare(s0, 8, "require ") != 0) continue;
                std::string c = h == std::string::npos ? "" : l.substr(h + 1);
                c.erase(0, c.find_first_not_of(" \t"));
                while (!c.empty() && std::isspace((unsigned char)c.back())) c.pop_back();
                notes.push_back(l.compare(s0, 13, "require face ") == 0 ? "" : c);
            }
        }
        int const n = int(targets.size());
        std::vector<int> all(n);
        std::iota(all.begin(), all.end(), 0);
        std::cout << "find: one tiling meeting " << n << " target" << (n == 1 ? "" : "s") << ", k " << b.kmin << ".." << b.kmax
                  << (seconds > 0 ? ", at most " + std::to_string(int(seconds)) + " s per k" : "")
                  << (prune ? "; the board has vertex types no tiling can use, so the steps prune them" : "") << std::endl;
        if (n <= 2) {
            steps_all = 1;
            Step st = run("all", board(all, nullptr, b.kmin, b.kmax), b.kmin, b.kmax, "every target");
            return finish(st, st.timed ? b.kmin : st.through + 1);
        }
        // 1. pairs
        std::map<std::pair<int, int>, Step> pair;
        steps_all = n * (n - 1) / 2 + 2;
        int lower = b.kmin;
        for (int i = 0; i < n; i++)
            for (int j = i + 1; j < n; j++) {
                Step st = run("pair-" + std::to_string(i + 1) + "-" + std::to_string(j + 1), board({ i, j }, nullptr, b.kmin, b.kmax),
                              b.kmin, b.kmax, "pair " + label(i) + " + " + label(j));
                if (!st.found && !st.timed) {
                    std::cout << "proven: no tiling meets both, so none meets every target, up to k=" << b.kmax << std::endl;
                    return finish(st, b.kmax + 1);
                }
                if (st.found) lower = std::max(lower, st.found);
                proven = lower;
                pair[{ i, j }] = st;
            }
        // 2. unions of pair tilings' vertex lines. A small board searches far faster, so first the unions that
        //    still cover every target with the fewest pairs: for each target c, the pairs (c, t). Then all pairs.
        std::vector<std::pair<std::set<int>, std::string>> unions;
        for (int c = 0; c <= n; c++) {
            std::set<int> ls;
            for (auto const& [ij, s] : pair)
                if (c == n || ij.first == c || ij.second == c) ls.insert(s.types.begin(), s.types.end());
            bool seen = false;
            for (auto const& u : unions) seen |= u.first == ls;
            if (!seen) unions.push_back({ ls, c == n ? "all" : std::to_string(c + 1) });
        }
        std::stable_sort(unions.begin(), unions.end(), [](auto const& x, auto const& y) { return x.first.size() < y.first.size(); });
        steps_all += int(unions.size()) - 1;
        Step st;
        for (auto const& [ls, tag] : unions) {
            std::string ub = board(all, &ls, lower, b.kmax);
            if (ub.empty()) continue;
            st = run("union-" + tag, ub, lower, b.kmax,
                     "every target, on " + std::to_string(ls.size()) + " vertex lines (pair tilings " +
                         (tag == "all" ? "all" : "with " + label(std::stoi(tag) - 1)) + ")");
            if (st.found) return finish(st, lower);
        }
        // 3. the full board, complete per k
        st = run("full", board(all, nullptr, lower, b.kmax), lower, b.kmax, "every target, full board");
        if (st.found) return finish(st, lower);
        if (!st.timed) return finish(st, b.kmax + 1);
        lower = std::max(lower, st.through + 1);
        proven = lower;
        if (n < 4) return finish(st, lower);
        // 4. grow from the earliest pair
        auto pr = [&](int a, int c) { return pair[{ std::min(a, c), std::max(a, c) }]; };
        std::vector<int> have;
        Step cur;
        for (auto const& [ij, s] : pair)
            if (s.found && (!cur.found || s.found < cur.found)) cur = s, have = { ij.first, ij.second };
        steps_all = steps_done + (n - 2) * (n - 1) / 2;
        while (cur.found && int(have.size()) < n) {
            Step best;
            int add = -1;
            for (int t = 0; t < n; t++) {
                if (std::find(have.begin(), have.end(), t) != have.end()) continue;
                std::set<int> ls = cur.types;
                int from = cur.found;
                for (int s : have) {
                    Step const& p = pr(t, s);
                    ls.insert(p.types.begin(), p.types.end());
                    from = std::max(from, p.found);
                }
                std::vector<int> keep = have;
                keep.push_back(t);
                std::sort(keep.begin(), keep.end());
                std::string name = "grow";
                for (int x : keep) name += "-" + std::to_string(x + 1);
                std::string gb = board(keep, &ls, from, b.kmax);
                if (gb.empty()) continue;
                Step s = run(name, gb, from, b.kmax, "targets " + name.substr(5) + ", on " + std::to_string(ls.size()) + " vertex lines");
                if (s.found && (!best.found || s.found < best.found)) best = s, add = t;
            }
            if (add < 0) break;
            cur = best, have.push_back(add);
        }
        return finish(int(have.size()) == n ? cur : Step{}, lower);
    }
};

}  // namespace find
