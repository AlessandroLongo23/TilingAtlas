// Where does the engine's search go, and what would cut it? Walks the engine's own tree (tileestimate's
// walker, which --exact checks against the engine) and measures, per node:
//   productive  its subtree completes a tiling
//   fc-dead     forward checking would end it: some free half-edge has no partner left (no free half-edge
//               it glues to, no vertex that may still be added); the nodes below the topmost ones are saved
//   duplicate   a partial tiling isomorphic to it (labels, vertex types, gluing, mirrors) was explored
//               earlier in the same root, so a transposition table would skip its subtree
// and, as an alternative search, branches on the free half-edge with the fewest options (fail first).
// Build: see build.sh. Usage: prof <board> --k <kmin> <kmax> [stats|mrv|both]
#include "te.cpp"   // tileestimate.cpp with its main renamed (build.sh)
#include <unordered_set>

namespace prof {
using namespace est;

// The committed engine's rule (the face nearest to closing), the baseline every policy here starts from.
static index_t face_best(Node const& n) {
	index_t best{};
	int least = INT_MAX;
	for (auto ix : n.conf.indices())
		if (n.conf.is_free(ix)) {
			int r = n.s->faces->edges_needed_to_complete(n.conf, ix);
			if (r < least) best = ix, least = r;
		}
	return best;
}

// ── exact canonical form of a partial tiling ──
// Colours refined over the half-edge operations (left, right, mirror, opposite), then a breadth-first
// numbering from every half-edge of the smallest colour class; the least code is canonical (the class is
// invariant, and a code from a start determines the structure up to the map sending the start to 0).
struct Canon {
	std::vector<uint64_t> col, nxt, code, best;
	std::vector<int> idx, queue;
	static uint64_t mix(uint64_t h, uint64_t x) {
		h ^= x + 0x9e3779b97f4a7c15ULL + (h << 6) + (h >> 2);
		return h * 0xff51afd7ed558ccdULL;
	}
	std::pair<uint64_t, uint64_t> of(Node const& n) {
		auto const& c = n.conf;
		int const H = c.num_halfedges();
		col.assign(H, 0), nxt.assign(H, 0);
		for (int h = 0; h < H; h++) {
			index_t ix{ h };
			uint64_t x = mix(c.label(ix), c.left_label(ix));
			x = mix(x, (c.is_free(ix) ? 1 : 0) | (c.mirror(ix).has_value() ? 2 : 0) | (c.is_mirror(ix) ? 4 : 0));
			col[h] = mix(x, n.types[c.vertex_index(ix)]);
		}
		auto opv = [&](index_t ix) { return ix.has_value() ? (int)ix.get_value() : -1; };
		size_t classes = 0;
		for (int round = 0; round < H; round++) {
			for (int h = 0; h < H; h++) {
				index_t ix{ h };
				uint64_t x = col[h];
				for (int o : { opv(c.right_neighbour(ix)), opv(c.left_neighbour(ix)), opv(c.mirror(ix)), opv(c.opposite(ix)) })
					x = mix(x, o < 0 ? 7 : col[o]);
				nxt[h] = x;
			}
			col.swap(nxt);
			std::vector<uint64_t> s(col);
			std::sort(s.begin(), s.end());
			size_t k = std::unique(s.begin(), s.end()) - s.begin();
			if (k == classes) break;
			classes = k;
		}
		// the smallest class (ties: the least colour)
		std::unordered_map<uint64_t, int> size;
		for (auto x : col) size[x]++;
		uint64_t pick = 0;
		int ps = INT_MAX;
		for (auto [x, s] : size)
			if (s < ps || (s == ps && x < pick)) pick = x, ps = s;
		best.clear();
		for (int s0 = 0; s0 < H; s0++) {
			if (col[s0] != pick) continue;
			idx.assign(H, -1), queue.clear(), code.clear();
			idx[s0] = 0, queue.push_back(s0);
			for (size_t q = 0; q < queue.size(); q++) {
				index_t ix{ queue[q] };
				code.push_back(mix(mix(c.label(ix), c.left_label(ix)), n.types[c.vertex_index(ix)]));
				code.push_back((c.is_free(ix) ? 1 : 0) | (c.mirror(ix).has_value() ? 2 : 0) | (c.is_mirror(ix) ? 4 : 0));
				for (int o : { opv(c.right_neighbour(ix)), opv(c.left_neighbour(ix)), opv(c.mirror(ix)), opv(c.opposite(ix)) }) {
					if (o < 0) { code.push_back(UINT64_MAX); continue; }
					if (idx[o] < 0) idx[o] = (int)queue.size(), queue.push_back(o);
					code.push_back(idx[o]);
				}
			}
			if (best.empty() || code < best) best.swap(code);
		}
		uint64_t a = 1469598103934665603ULL, b = 0x84222325cbf29ce4ULL;
		for (auto x : best) a = mix(a, x), b = mix(b ^ 0x5bd1e995, x * 0x2545F4914F6CDD1DULL);
		return { a, b };
	}
};
struct PairHash { size_t operator()(std::pair<uint64_t, uint64_t> const& p) const { return p.first ^ (p.second * 31); } };

// ── options of a free half-edge: what the search could glue it to ──
static int options(Node& n, index_t g, int cap) {
	int k = 0;
	auto const& conf = n.conf;
	for (auto ix : conf.indices())
		if (conf.is_free(ix) && n.join(g, ix)) {
			n.conf.remove_edge(g, ix);
			if (++k >= cap) return k;
		}
	if ((int)n.types.size() >= n.s->b.kmax) return k;
	auto const& list = n.s->cand->at(n.conf, g, *n.s->faces);
	auto it = std::lower_bound(list.begin(), list.end(), n.root, [](Candidates::Pair p, int t) { return p.t < t; });
	while (it != list.end()) {
		int const t = it->t, base = n.conf.num_halfedges();
		n.add_vertex(t);
		for (; it != list.end() && it->t == t; ++it)
			if (n.join(g, index_t{ base + it->i })) {
				n.conf.remove_edge(g, index_t{ base + it->i });
				if (++k >= cap) { n.pop_vertex(); return k; }
			}
		n.pop_vertex();
	}
	return k;
}

struct Stats {
	uint64_t nodes = 0, productive = 0, complete = 0, dead_budget = 0, dead_options = 0;
	uint64_t fc_dead_top = 0, fc_saved = 0, dup_top = 0, dup_saved = 0, dup_nodes = 0;
	std::map<int, std::array<uint64_t, 4>> by_n;   // vertices -> nodes, productive, fc-dead, duplicate
	std::unordered_set<std::pair<uint64_t, uint64_t>, PairHash> seen;
	Canon canon;
	bool want_dup = true;
	int dup_max_n = 99;
};

// returns {subtree nodes, productive}
static std::pair<uint64_t, bool> walk_stats(Node& n, Stats& st, bool in_fc, bool in_dup) {
	st.nodes++;
	int const nv = n.conf.num_vertices();
	auto& row = st.by_n[nv];
	row[0]++;
	index_t f = face_best(n);
	if (!f.has_value()) {
		bool ok = nv >= n.s->b.kmin;
		st.complete += ok;
		st.productive += ok;
		row[1] += ok;
		return { 1, ok };
	}
	// forward check: every free half-edge needs a partner
	bool fc = false;
	for (auto g : n.conf.indices())
		if (n.conf.is_free(g) && options(n, g, 1) == 0) { fc = true; break; }
	if (fc) row[2]++;
	bool dup = false;
	if (st.want_dup && nv <= st.dup_max_n) {
		auto key = st.canon.of(n);
		dup = !st.seen.insert(key).second;
		if (dup) row[3]++, st.dup_nodes++;
	}
	std::vector<Node::Move> ms;
	n.children(f, ms);
	if (ms.empty()) (nv >= n.s->b.kmax ? st.dead_budget : st.dead_options)++;
	uint64_t sub = 1;
	bool prod = false;
	for (auto m : ms) {
		n.apply(f, m);
		auto [s, p] = walk_stats(n, st, in_fc || fc, in_dup || dup);
		n.undo(f, m);
		sub += s, prod = prod || p;
	}
	if (fc && !in_fc) st.fc_dead_top++, st.fc_saved += sub - 1;
	if (dup && !in_dup) st.dup_top++, st.dup_saved += sub - 1;
	if (prod) st.productive++, row[1]++;
	if (fc && prod) std::cerr << "BUG: a forward-check-dead node completed a tiling\n";
	return { sub, prod };
}

// ── fail first: branch on the free half-edge with the fewest options ──
struct Alt {
	uint64_t nodes = 0, complete = 0;
	std::set<std::vector<uint32_t>> unique;
	bool fc = false;    // also stop at a node where some free half-edge has none
};
static void walk_mrv(Node& n, Alt& a) {
	a.nodes++;
	index_t f = face_best(n);
	if (!f.has_value()) {
		int k = n.conf.num_vertices();
		if (k < n.s->b.kmin) return;
		a.complete++;
		if (auto form = canonical_form_if_minimal(n.conf, uint32_t{})) a.unique.insert(*form);
		return;
	}
	int least = INT_MAX;
	index_t pick{};
	for (auto g : n.conf.indices())
		if (n.conf.is_free(g)) {
			int o = options(n, g, least);
			if (o < least) least = o, pick = g;
			if (o == 0) break;
		}
	if (least == 0) return;
	std::vector<Node::Move> ms;
	n.children(pick, ms);
	for (auto m : ms) n.apply(pick, m), walk_mrv(n, a), n.undo(pick, m);
}
// ── cheap variants: label-level tests only (mirror type and the two corner pairs, as join() tests first) ──
// A free half-edge's label options: free half-edges it passes those tests with, plus, below the vertex
// budget, the (type, half-edge) pairs the candidate list holds from the root's type on. Both over-count the
// real options, so a zero is a real zero: pruning on it is sound.
static bool label_ok(tiling_t const& c, FastFaces const& F, index_t a, index_t b) {
	return c.halfedges_compatible(a, b) && F.can_be_adjacent(c.left_label(a), c.right_label(b)) &&
		   F.can_be_adjacent(c.right_label(a), c.left_label(b));
}
static int label_options(Node const& n, index_t g, std::vector<index_t> const& free) {
	int k = 0;
	for (auto h : free) k += label_ok(n.conf, *n.s->faces, g, h);
	if ((int)n.types.size() < n.s->b.kmax) {
		auto const& list = n.s->cand->at(n.conf, g, *n.s->faces);
		k += int(list.end() - std::lower_bound(list.begin(), list.end(), n.root, [](Candidates::Pair p, int t) { return p.t < t; }));
	}
	return k;
}
// ── exact candidate counts, memoized by the free half-edge's local context ──
// Gluing g to a fresh vertex's half-edge runs the face test on g's two faces; what it reads of the tiling is
// the partial face on each side as the walk in FastFaces::check_adjacent_cw_face sees it, and the fresh vertex
// is fixed by its type. So the count of candidate placements that pass is a function of: both sides' label
// sequences and where their ends sit relative to g, g's mirror flags, and the root. VALIDATE=1 recomputes on
// every hit and aborts on a difference.
// The partial face on one side of g, walked away from g until a free half-edge: from g's neighbour around its
// vertex, across glued edges (cw_step or ccw_step), as the face boundary goes.
static void chain(tiling_t const& conf, index_t g, bool right, std::vector<uint64_t>& key) {
	auto rel = [&](index_t x) -> uint64_t { return x == g ? 1 : conf.mirror(g).has_value() && x == conf.mirror(g) ? 2 : 0; };
	index_t x = right ? conf.right_neighbour(g) : conf.left_neighbour(g);
	for (int steps = 0; steps < 256; steps++) {
		key.push_back((uint64_t)(uint32_t)conf.label(x) << 32 | (uint64_t)(uint32_t)conf.left_label(x) << 4 | rel(x) << 2 |
					  (conf.is_free(x) ? 1 : 0) | (conf.mirror(x).has_value() ? 0 : 0));
		key.push_back((conf.mirror(x).has_value() ? 1 : 0) | (conf.is_mirror(x) ? 2 : 0));
		if (conf.is_free(x) || rel(x)) break;
		x = right ? conf.ccw_step(x) : conf.cw_step(x);   // as corner<T, true>::operator++ walks (right, then across)
	}
	key.push_back(UINT64_MAX);
}
static void side(tiling_t const& conf, index_t h, index_t g, std::vector<uint64_t>& key) {
	(void)g;
	key.push_back((uint64_t)(uint32_t)conf.label(h) << 32 | (uint32_t)conf.left_label(h));
	chain(conf, h, true, key);
	chain(conf, h, false, key);
}
struct VecHash { size_t operator()(std::vector<uint64_t> const& v) const { uint64_t h = 1469598103934665603ULL; for (auto x : v) h = (h ^ x) * 1099511628211ULL; return h; } };
static thread_local std::unordered_map<std::vector<uint64_t>, std::vector<int>, VecHash> cand_memo;   // context -> passing types, sorted (one per passing pair)
static uint64_t memo_hits = 0, memo_misses = 0;
static void cand_passing(Node& n, index_t g, std::vector<int>& out) {   // every candidate placement of g that passes, any root
	out.clear();
	auto const& list = n.s->cand->at(n.conf, g, *n.s->faces);
	auto it = list.begin();
	while (it != list.end()) {
		int const t = it->t, base = n.conf.num_halfedges();
		n.add_vertex(t);
		for (; it != list.end() && it->t == t; ++it)
			if (n.join(g, index_t{ base + it->i })) n.conf.remove_edge(g, index_t{ base + it->i }), out.push_back(t);
		n.pop_vertex();
	}
}
static int cand_memoized(Node& n, index_t g) {
	thread_local std::vector<uint64_t> key;
	key.clear();
	key.push_back((n.conf.mirror(g).has_value() ? 1 : 0) | (n.conf.is_mirror(g) ? 2 : 0));
	side(n.conf, g, g, key);
	if (n.conf.mirror(g).has_value()) side(n.conf, n.conf.mirror(g), g, key);
	auto it = cand_memo.find(key);
	if (it == cand_memo.end()) {
		memo_misses++;
		std::vector<int> v;
		cand_passing(n, g, v);
		it = cand_memo.emplace(key, std::move(v)).first;
	} else {
		memo_hits++;
		if (std::getenv("VALIDATE")) {
			std::vector<int> v;
			cand_passing(n, g, v);
			if (v != it->second) { std::cerr << "MEMO KEY INCOMPLETE\n"; std::abort(); }
		}
	}
	auto const& v = it->second;
	return int(v.end() - std::lower_bound(v.begin(), v.end(), n.root));
}

enum class Choose { engine, label_mrv, exact_mrv, joins_mrv, joins_mrv_tie, joins_fc_face, lazy_exact, memo_exact };
struct Policy { Choose choose = Choose::engine; bool label_fc = false; };
struct Out { uint64_t nodes = 0, complete = 0, minimal = 0; std::set<std::vector<uint32_t>> unique; };
static void walk_alt(Node& n, Out& o, Policy const& p) {
	o.nodes++;
	index_t f = face_best(n);
	if (!f.has_value()) {
		if (n.conf.num_vertices() < n.s->b.kmin) return;
		o.complete++;
		if (auto form = canonical_form_if_minimal(n.conf, uint32_t{})) o.minimal++, o.unique.insert(*form);
		return;
	}
	if (p.label_fc || p.choose == Choose::label_mrv) {
		thread_local std::vector<index_t> free;
		free.clear();
		for (auto g : n.conf.indices()) if (n.conf.is_free(g)) free.push_back(g);
		int least = INT_MAX;
		index_t pick = f;
		for (auto g : free) {
			int k = label_options(n, g, free);
			if (k == 0 && p.label_fc) return;
			if (p.choose == Choose::label_mrv && k < least) least = k, pick = g;
		}
		f = pick;
	} else if (p.choose == Choose::joins_mrv_tie || p.choose == Choose::joins_fc_face) {
		// joins_mrv_tie: fewest options, ties to the face nearest closing (his rule); joins_fc_face: his rule,
		// with the dead test only
		thread_local std::vector<index_t> free;
		free.clear();
		for (auto g : n.conf.indices()) if (n.conf.is_free(g)) free.push_back(g);
		bool budget = (int)n.types.size() < n.s->b.kmax;
		bool tie = p.choose == Choose::joins_mrv_tie;
		std::pair<int, int> least{ INT_MAX, INT_MAX };
		for (auto g : free) {
			int k = 0;
			if (budget) {
				auto const& list = n.s->cand->at(n.conf, g, *n.s->faces);
				k = int(list.end() - std::lower_bound(list.begin(), list.end(), n.root, [](Candidates::Pair q, int t) { return q.t < t; }));
			}
			int cap = tie ? (least.first == INT_MAX ? INT_MAX : least.first + 1) : 1;
			for (auto h : free) {
				if (k >= cap) break;
				if (label_ok(n.conf, *n.s->faces, g, h) && n.join(g, h)) n.conf.remove_edge(g, h), k++;
			}
			if (k == 0) return;
			std::pair<int, int> key{ tie ? std::min(k, cap) : 0, n.s->faces->edges_needed_to_complete(n.conf, g) };
			if (key < least) least = key, f = g;
		}
	} else if (p.choose == Choose::joins_mrv) {
		// exact joins (face tests included) plus the label-level count of vertices that may be added; a zero
		// in both is a real zero
		thread_local std::vector<index_t> free;
		free.clear();
		for (auto g : n.conf.indices()) if (n.conf.is_free(g)) free.push_back(g);
		int least = INT_MAX;
		bool budget = (int)n.types.size() < n.s->b.kmax;
		for (auto g : free) {
			int k = 0;
			if (budget) {
				auto const& list = n.s->cand->at(n.conf, g, *n.s->faces);
				k = int(list.end() - std::lower_bound(list.begin(), list.end(), n.root, [](Candidates::Pair q, int t) { return q.t < t; }));
			}
			for (auto h : free) {
				if (k >= least) break;
				if (label_ok(n.conf, *n.s->faces, g, h) && n.join(g, h)) n.conf.remove_edge(g, h), k++;
			}
			if (k == 0) return;
			if (k < least) least = k, f = g;
		}
	} else if (p.choose == Choose::memo_exact) {
		thread_local std::vector<index_t> free;
		free.clear();
		for (auto g : n.conf.indices()) if (n.conf.is_free(g)) free.push_back(g);
		bool budget = (int)n.types.size() < n.s->b.kmax;
		int least = INT_MAX;
		for (auto g : free) {
			int k = budget ? cand_memoized(n, g) : 0;
			for (auto h : free) {
				if (k >= least) break;
				if (label_ok(n.conf, *n.s->faces, g, h) && n.join(g, h)) n.conf.remove_edge(g, h), k++;
			}
			if (k == 0) return;
			if (k < least) least = k, f = g;
		}
	} else if (p.choose == Choose::lazy_exact) {
		// upper bounds first (exact joins + label-level candidates), then exact counts in increasing bound order
		// until no bound can beat the best exact count
		thread_local std::vector<index_t> free;
		thread_local std::vector<std::pair<int, int>> ub;
		free.clear(), ub.clear();
		for (auto g : n.conf.indices()) if (n.conf.is_free(g)) free.push_back(g);
		bool budget = (int)n.types.size() < n.s->b.kmax;
		int joins_of_best = 0;
		std::vector<int> joins(free.size());
		for (size_t i = 0; i < free.size(); i++) {
			auto g = free[i];
			int c = 0, j = 0;
			if (budget) {
				auto const& list = n.s->cand->at(n.conf, g, *n.s->faces);
				c = int(list.end() - std::lower_bound(list.begin(), list.end(), n.root, [](Candidates::Pair q, int t) { return q.t < t; }));
			}
			for (auto h : free) if (label_ok(n.conf, *n.s->faces, g, h) && n.join(g, h)) n.conf.remove_edge(g, h), j++;
			if (c + j == 0) return;
			joins[i] = j;
			ub.push_back({ c + j, (int)i });
		}
		(void)joins_of_best;
		std::sort(ub.begin(), ub.end());
		int best = INT_MAX;
		for (auto [bound, i] : ub) {
			if (bound >= best) break;
			int ex = !budget ? joins[i] : options(n, free[i], best);
			if (ex == 0) return;
			if (ex < best) best = ex, f = free[i];
		}
	} else if (p.choose == Choose::exact_mrv) {
		int least = INT_MAX;
		for (auto g : n.conf.indices())
			if (n.conf.is_free(g)) {
				int k = options(n, g, least);
				if (k < least) least = k, f = g;
				if (k == 0) return;
			}
	}
	std::vector<Node::Move> ms;
	n.children(f, ms);
	for (auto m : ms) n.apply(f, m), walk_alt(n, o, p), n.undo(f, m);
}
// ── after fail first: where the nodes are, and a one-vertex budget bound ──
// With one vertex left to add, every free half-edge that glues to no free half-edge must glue to that one
// new vertex, so some type (from the root's on) must be a candidate for all of them. "cover-dead" counts the
// nodes where none is, and the nodes below the topmost of them.
struct Stats2 {
	uint64_t nodes = 0, productive = 0, cover_dead = 0, cover_saved = 0;
	std::map<int, std::array<uint64_t, 3>> by_n;   // vertices -> nodes, productive, childless
};
static std::pair<uint64_t, bool> walk2(Node& n, Stats2& st, bool in_dead) {
	st.nodes++;
	int const nv = n.conf.num_vertices();
	auto& row = st.by_n[nv];
	row[0]++;
	bool dead;
	index_t f = n.best(dead);
	if (dead) { row[2]++; return { 1, false }; }
	if (!f.has_value()) {
		bool ok = nv >= n.s->b.kmin;
		row[1] += ok, st.productive += ok;
		return { 1, ok };
	}
	bool cover_dead = false;
	if (nv == n.s->b.kmax - 1) {
		std::vector<index_t> free, lonely;
		for (auto g : n.conf.indices()) if (n.conf.is_free(g)) free.push_back(g);
		for (auto g : free) {
			bool any = false;
			for (auto h : free) if (!any && label_ok(n.conf, *n.s->faces, g, h) && n.join(g, h)) n.conf.remove_edge(g, h), any = true;
			if (!any) lonely.push_back(g);
		}
		if (lonely.size() > 1) {
			std::set<int> common;
			bool first = true;
			for (auto g : lonely) {
				auto const& list = n.s->cand->at(n.conf, g, *n.s->faces);
				std::set<int> ts;
				for (auto it = std::lower_bound(list.begin(), list.end(), n.root, [](Candidates::Pair q, int t) { return q.t < t; }); it != list.end(); ++it) ts.insert(it->t);
				if (first) common = ts, first = false;
				else { std::set<int> x; std::set_intersection(common.begin(), common.end(), ts.begin(), ts.end(), std::inserter(x, x.begin())); common.swap(x); }
			}
			cover_dead = common.empty();
		}
	}
	std::vector<Node::Move> ms;
	n.children(f, ms);
	if (ms.empty()) row[2]++;
	uint64_t sub = 1;
	bool prod = false;
	for (auto m : ms) {
		n.apply(f, m);
		auto [x, p] = walk2(n, st, in_dead || cover_dead);
		n.undo(f, m);
		sub += x, prod = prod || p;
	}
	if (cover_dead && !in_dead) st.cover_dead++, st.cover_saved += sub - 1;
	if (cover_dead && prod) std::cerr << "BUG: a cover-dead node completed a tiling\n";
	if (prod) row[1]++, st.productive++;
	return { sub, prod };
}
// ── the last vertex level: what kills a node there ──
// At the vertex budget a node can only glue free half-edges to each other. For each node there that dies
// (dead or childless), is some free half-edge of the newest vertex without a label-level partner among the
// other free half-edges (itself included)? That test needs only labels, so the parent could run it per
// (type, half-edge) before building the child.
struct Last { uint64_t nodes = 0, died = 0, newest_lonely = 0, any_lonely = 0, survived_but_lonely = 0; };
static bool walk_last(Node& n, Last& L) {   // returns productive
	int const nv = n.conf.num_vertices();
	bool dead;
	index_t f = n.best(dead);
	bool at_budget = nv == n.s->b.kmax && f.has_value() || (dead && nv == n.s->b.kmax);
	bool newest = false, any = false;
	if (nv == n.s->b.kmax && (dead || f.has_value())) {
		std::vector<index_t> free;
		for (auto g : n.conf.indices()) if (n.conf.is_free(g)) free.push_back(g);
		int const vs = n.conf.num_halfedges() - n.s->vc.valence_of(n.types.back()) * 0;
		(void)vs;
		for (auto g : free) {
			bool partner = false;
			for (auto h : free) if (label_ok(n.conf, *n.s->faces, g, h)) { partner = true; break; }
			if (!partner) {
				any = true;
				if (n.conf.vertex_index(g) == nv - 1) newest = true;
			}
		}
	}
	if (dead) {
		if (nv == n.s->b.kmax) L.nodes++, L.died++, L.newest_lonely += newest, L.any_lonely += any;
		return false;
	}
	if (!f.has_value()) return nv >= n.s->b.kmin;
	std::vector<Node::Move> ms;
	n.children(f, ms);
	bool prod = false;
	for (auto m : ms) { n.apply(f, m); prod = walk_last(n, L) || prod; n.undo(f, m); }
	if (at_budget) {
		L.nodes++;
		if (!prod) L.died++, L.newest_lonely += newest, L.any_lonely += any;
		else if (any) L.survived_but_lonely++;
	}
	return prod;
}
// ── canonical start: one start vertex per tiling ──
// A tiling is found from every vertex of the root's type. Ring code of a vertex: the (type, offset) of what
// each of its half-edges is glued to, least over rotations. Prune when the start's ring and another
// root-type vertex's ring are both complete and the other's code is smaller: the tiling is still found from
// a vertex of least code. Measured here: nodes with and without, and the unique tilings must not change.
static bool ring(Node const& n, int v, std::vector<uint64_t>& code) {
	auto const& c = n.conf;
	int const st = [&] { for (auto ix : c.indices()) if (c.vertex_index(ix) == v) return (int)ix.get_value(); return -1; }();
	int const val = n.s->vc.valence_of(n.types[v]) * 0 + [&] { int k = 0; for (auto ix : c.indices()) k += c.vertex_index(ix) == v; return k; }();
	std::vector<uint64_t> seq;
	for (int j = 0; j < val; j++) {
		index_t h{ st + j };
		if (c.is_free(h)) return false;
		index_t o = c.opposite(h);
		int ov = c.vertex_index(o);
		int ost = c.neighbourhood(o).vertex_start.get_value();
		seq.push_back((uint64_t)n.types[ov] << 16 | (uint64_t)(o.get_value() - ost));
	}
	code.assign(seq.begin(), seq.end());
	for (int r = 1; r < val; r++) {
		std::vector<uint64_t> rot(seq.begin() + r, seq.end());
		rot.insert(rot.end(), seq.begin(), seq.begin() + r);
		if (rot < code) code = rot;
	}
	return true;
}
static bool beaten(Node const& n) {
	std::vector<uint64_t> mine, other;
	if (!ring(n, 0, mine)) return false;
	for (int v = 1; v < n.conf.num_vertices(); v++)
		if (n.types[v] == n.types[0] && ring(n, v, other) && other < mine) return true;
	return false;
}
static void walk_canon(Node& n, Out& o, bool prune) {
	o.nodes++;
	if (prune && beaten(n)) return;
	bool dead;
	index_t f = n.best(dead);
	if (dead) return;
	if (!f.has_value()) {
		if (n.conf.num_vertices() < n.s->b.kmin) return;
		o.complete++;
		if (auto form = canonical_form_if_minimal(n.conf, uint32_t{})) o.minimal++, o.unique.insert(*form);
		return;
	}
	std::vector<Node::Move> ms;
	n.children(f, ms);
	for (auto m : ms) n.apply(f, m), walk_canon(n, o, prune), n.undo(f, m);
}
}   // namespace prof

int main(int argc, char** argv) {
	using namespace est;
	using namespace prof;
	if (argc < 2) { std::cerr << "usage: prof <board> [--k kmin kmax] [stats|mrv|both] [--dup-max-n n]\n"; return 2; }
	Search s{ read_board(argv[1]) };
	std::string mode = "both";
	int dup_max = 99;
	for (int i = 2; i < argc; i++) {
		std::string a = argv[i];
		if (a == "--k" && i + 2 < argc) s.b.kmin = std::atoi(argv[++i]), s.b.kmax = std::atoi(argv[++i]);
		else if (a == "--dup-max-n" && i + 1 < argc) dup_max = std::atoi(argv[++i]);
		else mode = a;
	}
	auto [order, root_lines] = vertex_order(s.b);
	choose_rule(s.b, order, root_lines, (int)std::thread::hardware_concurrency());
	order = rank_roots(s.b, order, root_lines, (int)std::thread::hardware_concurrency());
	s.roots = classify(s.b, order, root_lines, s.vc);
	FastFaces const faces(s.b.faces, s.b.apeirogons);
	Candidates const cand(s.vc, faces, faces);
	s.faces = &faces, s.cand = &cand;
	auto t0 = std::chrono::steady_clock::now();
	auto secs = [&] { return std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count(); };
	if (mode == "stats" || mode == "both") {
		Stats total;
		std::map<int, std::array<uint64_t, 4>> by_n;
		for (int r = 0; r < s.roots; r++) {
			Stats st;
			st.dup_max_n = dup_max;
			Node n = start(s, r);
			walk_stats(n, st, false, false);
			for (auto [k, v] : st.by_n) for (int j = 0; j < 4; j++) by_n[k][j] += v[j];
			total.nodes += st.nodes, total.productive += st.productive, total.complete += st.complete;
			total.dead_budget += st.dead_budget, total.dead_options += st.dead_options;
			total.fc_dead_top += st.fc_dead_top, total.fc_saved += st.fc_saved;
			total.dup_top += st.dup_top, total.dup_saved += st.dup_saved, total.dup_nodes += st.dup_nodes;
		}
		auto pct = [&](uint64_t x) { return 100.0 * x / std::max<uint64_t>(1, total.nodes); };
		std::printf("stats nodes %llu complete %llu productive %llu (%.3f%%) %.1f s\n", (unsigned long long)total.nodes,
					(unsigned long long)total.complete, (unsigned long long)total.productive, pct(total.productive), secs());
		std::printf("stats childless: at the vertex budget %llu, below it %llu\n", (unsigned long long)total.dead_budget,
					(unsigned long long)total.dead_options);
		std::printf("stats forward check: %llu topmost dead nodes, %llu nodes below them (%.1f%%)\n",
					(unsigned long long)total.fc_dead_top, (unsigned long long)total.fc_saved, pct(total.fc_saved));
		std::printf("stats duplicates (n <= %d): %llu duplicate nodes, %llu topmost, %llu nodes below them (%.1f%%)\n", dup_max,
					(unsigned long long)total.dup_nodes, (unsigned long long)total.dup_top, (unsigned long long)total.dup_saved,
					pct(total.dup_saved));
		for (auto [k, v] : by_n)
			std::printf("stats n=%d nodes %llu productive %llu fc-dead %llu duplicate %llu\n", k, (unsigned long long)v[0],
						(unsigned long long)v[1], (unsigned long long)v[2], (unsigned long long)v[3]);
	}
	if (mode == "canon") {
		for (bool prune : { false, true }) {
			t0 = std::chrono::steady_clock::now();
			Out o;
			uint64_t uniq = 0;
			for (int r = 0; r < s.roots; r++) { Out orr; Node n = start(s, r); walk_canon(n, orr, prune); o.nodes += orr.nodes, o.complete += orr.complete, o.minimal += orr.minimal, uniq += orr.unique.size(); }
			std::printf("canon %-8s nodes %12llu complete %9llu minimal %9llu unique %7llu %6.2f s\n", prune ? "pruned" : "plain",
						(unsigned long long)o.nodes, (unsigned long long)o.complete, (unsigned long long)o.minimal, (unsigned long long)uniq, secs());
		}
		return 0;
	}
	if (mode == "last") {
		Last L;
		for (int r = 0; r < s.roots; r++) { Node n = start(s, r); walk_last(n, L); }
		std::printf("last level: %llu nodes, %llu die; of those, a half-edge with no label partner: %llu on the newest vertex, %llu anywhere; productive yet flagged %llu (must be 0)\n",
					(unsigned long long)L.nodes, (unsigned long long)L.died, (unsigned long long)L.newest_lonely,
					(unsigned long long)L.any_lonely, (unsigned long long)L.survived_but_lonely);
		return 0;
	}
	if (mode == "stats2") {
		Stats2 st;
		for (int r = 0; r < s.roots; r++) { Node n = start(s, r); walk2(n, st, false); }
		std::printf("stats2 rule %s nodes %llu productive %llu (%.2f%%), one-vertex cover would cut %llu nodes below %llu (%.1f%%) %.1f s\n",
					face_first ? "face" : "fail-first", (unsigned long long)st.nodes, (unsigned long long)st.productive,
					100.0 * st.productive / st.nodes, (unsigned long long)st.cover_saved, (unsigned long long)st.cover_dead,
					100.0 * st.cover_saved / st.nodes, secs());
		for (auto [k, v] : st.by_n)
			std::printf("stats2 n=%d nodes %llu productive %llu childless %llu\n", k, (unsigned long long)v[0], (unsigned long long)v[1], (unsigned long long)v[2]);
		return 0;
	}
	if (mode == "alt") {
		struct V { char const* name; Policy p; };
		for (V v : { V{ "engine", {} }, V{ "engine+labelFC", { Choose::engine, true } }, V{ "labelMRV", { Choose::label_mrv, false } },
					 V{ "labelMRV+labelFC", { Choose::label_mrv, true } }, V{ "joinsMRV+FC", { Choose::joins_mrv, false } }, V{ "joinsMRVtie+FC", { Choose::joins_mrv_tie, false } }, V{ "face+joinsFC", { Choose::joins_fc_face, false } }, V{ "exactMRV+FC", { Choose::exact_mrv, false } }, V{ "lazyExact", { Choose::lazy_exact, false } }, V{ "memoExact", { Choose::memo_exact, false } } }) {
			t0 = std::chrono::steady_clock::now();
			Out o;
			uint64_t uniq = 0;
			for (int r = 0; r < s.roots; r++) {
				Out orr;
				Node n = start(s, r);
				walk_alt(n, orr, v.p);
				o.nodes += orr.nodes, o.complete += orr.complete, o.minimal += orr.minimal, uniq += orr.unique.size();
			}
			if (v.p.choose == Choose::memo_exact) std::printf("memo hits %llu misses %llu\n", (unsigned long long)memo_hits, (unsigned long long)memo_misses);
			std::printf("alt %-18s nodes %12llu complete %9llu (minimal %llu) unique %7llu %8.2f s\n", v.name, (unsigned long long)o.nodes,
						(unsigned long long)o.complete, (unsigned long long)o.minimal, (unsigned long long)uniq, secs());
			std::fflush(stdout);
		}
		return 0;
	}
	if (mode == "mrv" || mode == "both") {
		t0 = std::chrono::steady_clock::now();
		Alt a;
		uint64_t uniq = 0;
		for (int r = 0; r < s.roots; r++) {
			Alt ar;
			Node n = start(s, r);
			walk_mrv(n, ar);
			a.nodes += ar.nodes, a.complete += ar.complete, uniq += ar.unique.size();
		}
		std::printf("mrv nodes %llu complete %llu unique %llu %.1f s\n", (unsigned long long)a.nodes,
					(unsigned long long)a.complete, (unsigned long long)uniq, secs());
	}
}
