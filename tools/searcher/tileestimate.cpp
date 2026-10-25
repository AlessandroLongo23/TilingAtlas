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

struct Search {
	Board b;
	vertex_classification vc;
	FastFaces const* faces = nullptr;
	Candidates const* cand = nullptr;
	int roots = 0;
	/** Per template, its symmetries: permutations of its half-edges keeping labels, neighbours and mirrors. */
	std::vector<std::vector<std::vector<int>>> aut;
};

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

// One node of the search: the partial tiling, and the template of every vertex in it, in order.
struct Node {
	Search const* s;
	tiling_t conf;
	std::vector<int> types;
	int root = 0;

	index_t best() const {   // Extender::choose_best_halfedge
		index_t best{};
		int least = std::numeric_limits<int>::max();
		for (auto ix : conf.indices())
			if (conf.is_free(ix)) {
				int r = s->faces->edges_needed_to_complete(conf, ix);
				if (r < least) best = ix, least = r;
			}
		return best;
	}
	bool join(index_t a, index_t b) {   // Extender::try_joining's tests, the edge left in place when they pass
		if (!conf.halfedges_compatible(a, b)) return false;
		if (!s->faces->can_be_adjacent(conf.left_label(a), conf.right_label(b)) ||
			!s->faces->can_be_adjacent(conf.right_label(a), conf.left_label(b))) return false;
		conf.add_edge(a, b);
		if (s->faces->check_adjacent_cw_face(conf, a) && s->faces->check_adjacent_ccw_face(conf, a)) return true;
		conf.remove_edge(a, b);
		return false;
	}
	void add_vertex(int t) { s->vc.push_vertex_to(conf, t), types.push_back(t); }
	void pop_vertex() { conf.pop_vertex(), types.pop_back(); }

	// A child: f glued to an existing half-edge (t < 0), or to half-edge ix of a new vertex of template t.
	struct Move { int t, ix; };
	void children(index_t f, std::vector<Move>& out) {   // Extender::extend and extend_by_adding_vertex
		out.clear();
		for (auto ix : conf.indices())
			if (conf.is_free(ix) && join(f, ix)) conf.remove_edge(f, ix), out.push_back({ -1, ix.get_value() });
		if ((int)types.size() >= s->b.kmax) return;
		auto const& list = s->cand->at(conf, f, *s->faces);
		auto it = std::lower_bound(list.begin(), list.end(), root, [](Candidates::Pair p, int t) { return p.t < t; });
		while (it != list.end()) {
			int const t = it->t, base = conf.num_halfedges();
			add_vertex(t);
			for (; it != list.end() && it->t == t; ++it)
				if (join(f, index_t{ base + it->i })) conf.remove_edge(f, index_t{ base + it->i }), out.push_back({ t, base + it->i });
			pop_vertex();
		}
	}
	void apply(index_t f, Move m) {
		if (m.t >= 0) add_vertex(m.t);
		conf.add_edge(f, index_t{ m.ix });
	}
	void undo(index_t f, Move m) {
		conf.remove_edge(f, index_t{ m.ix });
		if (m.t >= 0) pop_vertex();
	}
};

static Node start(Search const& s, int r) {
	Node n{ &s, {}, {}, r };
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
		index_t f = p.best();
		if (!f.has_value()) return 1;   // closed, and mapped into t: it is t
		index_t g = t.conf.opposite(index_t{ phi[f.get_value()] });
		if (!g.has_value()) return 0;
		if (int ix = psi[g.get_value()]; ix >= 0) {   // glue to a half-edge already placed
			if (!p.conf.is_free(index_t{ ix }) || !p.join(f, index_t{ ix })) return 0;
			int r = replay();
			p.conf.remove_edge(f, index_t{ ix });
			return r;
		}
		int const vs = t.conf.neighbourhood(g).vertex_start.get_value(), tw = type_of[g.get_value()], o = g.get_value() - vs;
		if ((int)p.types.size() >= s.b.kmax || tw < t.root) return 0;
		int count = 0;
		for (auto const& sigma : s.aut[tw]) {   // the new vertex, lined up every way that puts a representative on g
			int i = int(std::find(sigma.begin(), sigma.end(), o) - sigma.begin());
			if (!s.vc.is_representative_of_orbit(tw, i)) continue;
			int const base = p.conf.num_halfedges();
			p.add_vertex(tw);
			place(base, vs, sigma);
			if (p.join(f, index_t{ base + i })) count += replay(), p.conf.remove_edge(f, index_t{ base + i });
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

// ── exact: the whole tree ──

struct Tally {
	uint64_t nodes = 0, multiplicity_right = 0, multiplicity_wrong = 0;
	std::map<int, uint64_t> complete, unique;
	std::map<std::vector<uint32_t>, std::array<int, 2>> seen;   // canonical form -> (times reached, multiplicity)
};

static void walk(Node& n, Tally& t) {
	t.nodes++;
	index_t f = n.best();
	if (!f.has_value()) {
		int k = n.conf.num_vertices();
		if (k < n.s->b.kmin) return;
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

// ── estimate: random probes ──

struct Moments {
	double n = 0, s = 0, ss = 0;
	void add(double x) { n++, s += x, ss += x * x; }
	double mean() const { return n ? s / n : 0; }
	double var_of_mean() const { return n > 1 ? std::max(0.0, ss / n - mean() * mean()) / (n - 1) : 0; }
};
struct RootStats {
	Moments nodes, cpu, path_nodes, tilings;
	double cross = 0;   // sum over probes of cpu * path_nodes, for the ratio's variance
	std::map<int, Moments> complete, unique;
	std::mutex m;
};

using Clock = std::chrono::steady_clock;
static double since(Clock::time_point t) { return std::chrono::duration<double>(Clock::now() - t).count(); }

// What the engine does at a complete tiling (main's on_tiling): fingerprint it, and write the certificate
// of a minimal one. Every reach is fingerprinted; a minimal tiling is written once, so its writing is
// charged at 1/m of the reach.
static double leaf_cost(Node const& n, original_tiling_writer& writer, bool& minimal, double& write) {
	auto const t0 = Clock::now();
	Fingerprints::Key key;
	minimal = fingerprint_if_minimal(n.conf, key);
	double const fp = since(t0);
	write = 0;
	if (minimal) {
		auto const t1 = Clock::now();
		thread_local std::ostringstream text;
		text.str("");
		writer.write_content(text, n.conf);
		write = since(t1);
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
		auto const t0 = Clock::now();
		nodes += w;
		index_t f = n.best();
		if (!f.has_value()) {
			cpu += w * since(t0);
			if (n.conf.num_vertices() >= s.b.kmin) {
				bool minimal;
				double write;
				cpu += w * leaf_cost(n, writer, minimal, write);
				if (minimal) cpu += w * write / multiplicity(n);
			}
			return { cpu, nodes };
		}
		n.children(f, ms);
		cpu += w * since(t0);
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
	double nodes = 0;
	std::map<int, double> complete, unique;
	std::vector<Node::Move> ms;
	std::uniform_real_distribution<double> u01;
	auto kind = [](Node const& n) {
		int free = 0;
		for (auto ix : n.conf.indices()) free += n.conf.is_free(ix);
		return std::pair{ (int)n.types.size(), free };
	};
	while (!level.empty()) {
		std::map<std::pair<int, int>, Item> next;
		for (auto& [n, w] : level) {
			nodes += w;
			index_t f = n.best();
			if (!f.has_value()) {
				int k = n.conf.num_vertices();
				if (k >= s.b.kmin) {
					complete[k] += w;
					Fingerprints::Key key;
					if (fingerprint_if_minimal(n.conf, key)) unique[k] += w / multiplicity(n);
				}
				continue;
			}
			n.children(f, ms);
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
	for (int k = s.b.kmin; k <= s.b.kmax; k++) st.complete[k].add(complete[k]), st.unique[k].add(unique[k]);
}

static int estimate(Search const& s, std::vector<int> const& roots, double seconds, int threads, uint64_t seed) {
	std::vector<RootStats> stats(s.roots);
	std::atomic<uint64_t> next{ 0 }, probes{ 0 };
	auto const t0 = Clock::now();
	auto report = [&] {
		double nodes = 0, nodes_var = 0, cpu = 0, path_nodes = 0;
		std::map<int, std::array<double, 4>> per_k;   // complete, its variance, unique, its variance
		for (int r : roots) {
			auto& st = stats[r];
			std::lock_guard<std::mutex> l(st.m);
			nodes += st.nodes.mean(), nodes_var += st.nodes.var_of_mean();
			cpu += st.cpu.mean(), path_nodes += st.path_nodes.mean();
			for (auto& [k, m] : st.complete) per_k[k][0] += m.mean(), per_k[k][1] += m.var_of_mean();
			for (auto& [k, m] : st.unique) per_k[k][2] += m.mean(), per_k[k][3] += m.var_of_mean();
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
		std::cout << "estimate " << since(t0) << " " << probes.load() << " nodes " << nodes << " " << std::sqrt(nodes_var) << " cpu "
				  << nodes * per_node << " " << nodes * per_node * std::sqrt(rel) << "\n";
		for (int k = s.b.kmin; k <= s.b.kmax; k++)
			std::cout << "k " << k << " complete " << per_k[k][0] << " " << std::sqrt(per_k[k][1]) << " unique " << per_k[k][2] << " "
					  << std::sqrt(per_k[k][3]) << "\n";
		std::cout << "end" << std::endl;
	};
	if (roots.empty()) return report(), 0;
	// After a first pass of a few probes per root, a tenth of the probes go round-robin and the rest to each
	// root in proportion to its estimated size in nodes (better than half and half on every board measured), which the probes estimate well (within a few percent on
	// every board measured). Weighing by each root's observed spread instead (Neyman allocation) was
	// measured and rejected: a root whose first probes came in low is then starved, and its estimate stays
	// low (hybrid_2_9830 k = 2 came out 25% low on every seed; experiments/results/searcher-estimate-2026-10-25.md).
	int const first_pass = 4;
	double const by_size = std::getenv("TILEESTIMATE_BY_SIZE") ? std::atof(std::getenv("TILEESTIMATE_BY_SIZE")) : 0.9;
	std::mutex alloc_mutex;
	std::discrete_distribution<int> pick;
	bool weighed = false;
	auto reweigh = [&] {
		std::vector<double> w;
		for (int r : roots) w.push_back(stats[r].nodes.mean() + 1e-9);
		std::lock_guard<std::mutex> l(alloc_mutex);
		pick = std::discrete_distribution<int>(w.begin(), w.end());
		weighed = true;
	};
	std::vector<std::thread> pool;
	for (int i = 0; i < threads; i++)
		pool.emplace_back([&, i] {
			std::mt19937_64 rng(seed + 0x9e3779b97f4a7c15ULL * (i + 1));
			original_tiling_writer writer{ s.vc };   // one per thread: it keeps state while writing
			std::uniform_real_distribution<double> u01;
			while (since(t0) < seconds) {
				uint64_t j = next++;
				int r;
				if (j < first_pass * roots.size() || !weighed || u01(rng) >= by_size) r = roots[j % roots.size()];
				else {
					std::lock_guard<std::mutex> l(alloc_mutex);
					r = roots[pick(rng)];
				}
				probe(s, writer, r, rng, stats[r]);
				probes++;
			}
		});
	for (double t = 0.5; t < seconds; t += 0.5) {
		std::this_thread::sleep_for(std::chrono::duration<double>(std::max(0.0, t - since(t0))));
		if (next >= first_pass * roots.size()) reweigh();
		if (t == std::floor(t)) report();
	}
	for (auto& t : pool) t.join();
	report();
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
	for (int i = 2; i < argc; i++) {
		std::string a = argv[i];
		if (a == "--k" && i + 2 < argc) s.b.kmin = std::atoi(argv[++i]), s.b.kmax = std::atoi(argv[++i]);
		else if (a == "--seconds" && i + 1 < argc) seconds = std::atof(argv[++i]);
		else if (a == "--threads" && i + 1 < argc) threads = std::max(1, std::atoi(argv[++i]));
		else if (a == "--seed" && i + 1 < argc) seed = std::stoull(argv[++i]);
		else if (a == "--skip" && i + 1 < argc) {   // a run's roots.done: estimate only the roots still to do
			std::ifstream f(argv[++i]);
			for (std::string line; std::getline(f, line);)
				if (!line.empty()) skip.insert(std::atoi(line.c_str()));
		}
		else if (a == "--exact") is_exact = true;
		else { std::cerr << usage; return 2; }
	}
	// the vertex templates in the engine's order (tilesearch main: the initial vertices first)
	std::vector<std::vector<int>> order;
	for (int v : s.b.initial) order.push_back(s.b.vertices[v]);
	for (int v = 0; v < (int)s.b.vertices.size(); v++)
		if (!std::binary_search(s.b.initial.begin(), s.b.initial.end(), v)) order.push_back(s.b.vertices[v]);
	int const n_initial = s.b.initial.empty() ? (int)order.size() : (int)s.b.initial.size();
	for (int i = 0; i < (int)order.size(); i++) {
		int n = s.b.permutations ? s.vc.add_vertex_with_permutations(order[i]) : s.vc.add_vertex(order[i]);
		if (i < n_initial) s.roots += n;
	}
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
