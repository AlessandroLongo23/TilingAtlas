// tileestimate: how big a tilesearch run will be, in tilings per k and in CPU time, before or while it runs.
//
// usage: tileestimate <board> [--k <kmin> <kmax>] [--seconds <s>] [--threads <n>] [--seed <n>] [--skip <roots.done>]
//        tileestimate <board> [--k <kmin> <kmax>] --exact
//
// Knuth's estimator (Math. Comp. 29, 1975) in Chen's stratified form (see `probe`): sample the search
// tree, weighting each node met by the inverse of its chance of being met. The weighted sum of any
// quantity over those nodes is an unbiased estimate of its sum over the whole tree: here the nodes, the
// complete tilings per k, the unique tilings per k, and the CPU time the engine spends. Roots are sampled
// in turn and summed (a stratified sample), so a run's finished roots can be left out.
//
// It is the engine's own search: this file compiles tilesearch.cpp (its main renamed) and walks the tree
// its Extender walks, child for child, with its board reader, face checker, candidate lists and
// fingerprint, so the time measured at a node is the time the engine spends there. --exact walks the
// whole tree and must report the engine's `stats` counts.
//
// Duplicates. The engine keeps a complete tiling only if its canonical form is minimal (no symmetry left)
// and new in its root, and the search reaches one tiling many times. A minimal tiling T is reached once
// for every start that rebuilds it: the root's template placed on a vertex of T in one of the ways its
// own symmetry allows. After that every step is forced (the half-edge to glue is chosen by a fixed rule,
// and T says what it glues to), up to how each new vertex lines up, which is again one of its template's
// symmetries. `multiplicity` replays the search along T from every start and counts those that rebuild
// it; a sampled tiling weighted by 1/m(T) makes the unique count unbiased. --exact checks m(T) against
// the times the full search reaches T, for every tiling.
//
// Output, each second: `estimate <seconds> <probes> nodes <n> <se> cpu <s> <se>`, then per k
// `k <k> complete <n> <se> unique <n> <se>`, then `end`. With --exact, `exact ...` lines.
#define main tilesearch_main
#include "tilesearch.cpp"
#undef main

#include <random>

namespace est {


// ── exact: the whole tree ──

struct Tally {
	uint64_t nodes = 0, multiplicity_right = 0, multiplicity_wrong = 0;
	std::map<int, uint64_t> complete, unique;
	std::map<std::vector<uint32_t>, std::array<int, 2>> seen;   // canonical form -> (times reached, multiplicity)
};

static void walk(Node& n, Tally& t) {
	t.nodes++;
	bool dead;
	index_t f = n.best(dead);
	if (dead) return;
	if (!f.has_value()) {
		int k = n.k;
		if (k < n.s->b.kmin || required.missing(n.types)) return;
		t.complete[k]++;
		if (auto form = canonical_form_if_minimal(n.conf, uint32_t{})) {
			auto& e = t.seen[*form];
			if (e[0]++ == 0) t.unique[k]++, e[1] = multiplicity(n);
		}
		return;
	}
	std::vector<Node::Move> ms;
	n.children(f, ms);
	for (auto m : ms) n.apply(f, m), walk(n, t), n.undo(f, m);
}

static int exact(Search const& s) {
	Tally all;
	for (int r = 0; r < s.roots; r++) {
		Tally t;
		Node n = start(s, r);
		walk(n, t);
		all.nodes += t.nodes;
		for (auto [k, c] : t.complete) all.complete[k] += c;
		for (auto [k, u] : t.unique) all.unique[k] += u;
		for (auto const& [form, e] : t.seen) (e[0] == e[1] ? all.multiplicity_right : all.multiplicity_wrong)++;
	}
	uint64_t complete = 0, unique = 0;
	for (auto [k, c] : all.complete) complete += c;
	for (auto [k, u] : all.unique) unique += u;
	std::cout << "exact nodes " << all.nodes << " complete " << complete << " unique " << unique << "\n";
	for (auto [k, c] : all.complete) std::cout << "exact k " << k << " complete " << c << " unique " << all.unique[k] << "\n";
	std::cout << "exact multiplicity right for " << all.multiplicity_right << " of "
			  << all.multiplicity_right + all.multiplicity_wrong << " unique tilings\n";
	return all.multiplicity_wrong ? 1 : 0;
}


static int estimate(Search const& s, std::vector<int> const& roots, double seconds, int threads, uint64_t seed) {
	Sampler sm(s, roots, seed);
	auto report = [&](double t) {
		Totals const tt = sm.totals();
		std::map<int, std::array<double, 4>> per_k;   // complete, its variance, unique, its variance
		for (int r : roots) {
			auto& st = sm.stats[r];
			std::lock_guard<std::mutex> l(st.m);
			for (auto& [k, m] : st.complete) per_k[k][0] += m.mean(), per_k[k][1] += m.var_of_mean();
			for (auto& [k, m] : st.unique) per_k[k][2] += m.mean(), per_k[k][3] += m.var_of_mean();
		}
		std::cout << "estimate " << t << " " << sm.probes.load() << " nodes " << tt.nodes << " " << tt.nodes_se << " cpu " << tt.cpu
				  << " " << tt.cpu_se << "\n";
		for (int k = s.b.kmin; k <= s.b.kmax; k++)
			std::cout << "k " << k << " complete " << per_k[k][0] << " " << std::sqrt(per_k[k][1]) << " unique " << per_k[k][2] << " "
					  << std::sqrt(per_k[k][3]) << "\n";
		std::cout << "end" << std::endl;
	};
	sm.run(seconds, threads, report);
	report(sm.seconds);
	return 0;
}

}   // namespace est

int main(int argc, char** argv) {
	using namespace est;
	char const* usage =
		"usage: tileestimate <board> [--k <kmin> <kmax>] [--seconds s] [--threads n] [--seed n] [--skip roots.done] [--exact]\n";
	if (argc < 2) { std::cerr << usage; return 2; }
	Search s{ read_board(argv[1]) };
	int threads = 1;
	double seconds = 10;
	uint64_t seed = std::random_device{}();
	bool is_exact = false;
	std::set<int> skip;
	std::string skip_file;
	for (int i = 2; i < argc; i++) {
		std::string a = argv[i];
		if (a == "--k" && i + 2 < argc) s.b.kmin = std::atoi(argv[++i]), s.b.kmax = std::atoi(argv[++i]);
		else if (a == "--seconds" && i + 1 < argc) seconds = std::atof(argv[++i]);
		else if (a == "--threads" && i + 1 < argc) threads = std::max(1, std::atoi(argv[++i]));
		else if (a == "--seed" && i + 1 < argc) seed = std::stoull(argv[++i]);
		else if (a == "--skip" && i + 1 < argc) {   // a run's roots.done: estimate only the roots still to do
			std::ifstream f(skip_file = argv[++i]);
			for (std::string line; std::getline(f, line);)
				if (!line.empty()) skip.insert(std::atoi(line.c_str()));
		}
		else if (a == "--exact") is_exact = true;
		else { std::cerr << usage; return 2; }
	}
	if (s.b.kmin < 1 || s.b.kmax < s.b.kmin || s.b.kmax > MAX_K) { std::cerr << "--k needs 1 <= kmin <= kmax <= " << MAX_K << "\n"; return 2; }
	// the vertex templates in the engine's order, roots first, and its required sets (tilesearch.cpp): a
	// running run's recorded order (order.txt beside its roots.done), else the order a new run would rank
	flat_max = flat_budget(s.b);
	fs::path const run_dir = fs::path(skip_file).parent_path();
	Plan const pl = plan(s.b, (int)std::thread::hardware_concurrency(), skip_file.empty() ? nullptr : &run_dir);
	auto const& order = pl.order;
	int const root_lines = pl.roots;
	s.roots = classify(s.b, order, root_lines, s.vc);
	if (ring_check) s.ring = std::make_shared<RingTables>(s.vc);   // the plan's choice (or the running run's)
	if (sym_break) s.syms = std::make_shared<RootSyms>(s.vc, s.roots);
	for (int t = 0; t < s.vc.count(); t++) s.aut.push_back(symmetries(s.vc, t));
	FastFaces const faces(s.b.faces, s.b.apeirogons);
	Candidates const cand(s.vc, faces, faces);
	s.faces = &faces, s.cand = &cand;
	if (is_exact) return exact(s);
	std::vector<int> roots;
	for (int r = 0; r < s.roots; r++)
		if (!skip.count(r)) roots.push_back(r);
	return estimate(s, roots, seconds, threads, seed);
}
