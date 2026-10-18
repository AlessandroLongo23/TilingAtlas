// Heesch numbers of free polyforms: shapes glued edge to edge from unit regular polygons, whose
// copies meet edge to edge anywhere, on no grid. The search behind free_solver.py, which enumerates
// the shapes, feeds them here, and turns the answers into page records.
//
// Corners live in Z[zeta12], exactly; a copy is an isometry z -> zeta^r (conj z if f) + t. The search
// follows Kaplan (2022) with three additions:
//   * Neighbour reduction by depth. A_j is the set of placements that are first-corona copies of some
//     j-corona (holes allowed) round the shape. In any patch, a copy with j full coronas round it has
//     its neighbours placed as some member of A_j (its own j-neighbourhood is such a j-corona), so
//     corona k of an n-patch is grown from corona k-1 through A_{n-k+1}, and touching pairs outside it
//     are excluded.
//   * An isohedral check at corona 1 (Kaplan's closure clauses) whose answer is verified: the surround
//     found is developed as a group orbit to L coronas and checked for overlaps.
//   * Holes allowed first, level by level until a corona fails; the strict number is found walking
//     back, with a disk check that blocks each defect it finds (every prefix of coronas a disk).
//
// Input, one shape per line:  ncells  (nverts  a b c d ...) per cell, corners as Z[zeta12] coordinates.
// Output, one JSON object per line: hc, hh, capped, iso, the strict patch "w" and the loose patch
// "wh" as [level, f, r, a, b, c, d] per copy, and timings.
//
// Usage: free_heesch -L 3 < shapes.txt

#include <cadical.hpp>

#include <algorithm>
#include <array>
#include <climits>
#include <chrono>
#include <cmath>
#include <complex>
#include <cstdint>
#include <cstdio>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <set>
#include <tuple>
#include <vector>

using std::vector;
using cplx = std::complex<double>;
static const double EPS = 1e-7;

// ------------------------------------------------------------------------------------ Z[zeta12]
struct Z {
	int a = 0, b = 0, c = 0, d = 0;  // a + b z + c z^2 + d z^3, z^4 = z^2 - 1
	Z operator+(const Z& o) const { return {a + o.a, b + o.b, c + o.c, d + o.d}; }
	Z operator-(const Z& o) const { return {a - o.a, b - o.b, c - o.c, d - o.d}; }
	Z operator-() const { return {-a, -b, -c, -d}; }
	bool operator==(const Z& o) const { return a == o.a && b == o.b && c == o.c && d == o.d; }
	bool operator!=(const Z& o) const { return !(*this == o); }
	bool operator<(const Z& o) const {
		if (a != o.a) return a < o.a;
		if (b != o.b) return b < o.b;
		if (c != o.c) return c < o.c;
		return d < o.d;
	}
};
static Z mulz(const Z& v) { return {-v.d, v.a, v.b + v.d, v.c}; }
static Z ZK[12];
static cplx ZF[4];
static cplx zf(const Z& v) { return double(v.a) * ZF[0] + double(v.b) * ZF[1] + double(v.c) * ZF[2] + double(v.d) * ZF[3]; }
static uint64_t vkey(const Z& v) {
	auto p = [](int x) { return uint64_t(uint16_t(x + 32768)); };
	return p(v.a) | p(v.b) << 16 | p(v.c) << 32 | p(v.d) << 48;
}
static Z unkey(uint64_t k) {
	auto q = [](uint64_t x) { return int(x & 0xffff) - 32768; };
	return {q(k), q(k >> 16), q(k >> 32), q(k >> 48)};
}

// Orientation o = 12 f + r; its linear map as an integer 4x4 matrix on the coordinates.
struct Mat { int m[4][4]; };
static Mat LIN[24];
static int OMUL[24][24], OINV[24];
static Z lin(int o, const Z& v) {
	const auto& m = LIN[o].m;
	return {m[0][0] * v.a + m[0][1] * v.b + m[0][2] * v.c + m[0][3] * v.d,
	        m[1][0] * v.a + m[1][1] * v.b + m[1][2] * v.c + m[1][3] * v.d,
	        m[2][0] * v.a + m[2][1] * v.b + m[2][2] * v.c + m[2][3] * v.d,
	        m[3][0] * v.a + m[3][1] * v.b + m[3][2] * v.c + m[3][3] * v.d};
}
static void init_ring() {
	ZK[0] = {1, 0, 0, 0};
	for (int k = 1; k < 12; ++k) ZK[k] = mulz(ZK[k - 1]);
	for (int k = 0; k < 4; ++k) ZF[k] = std::polar(1.0, k * M_PI / 6);
	for (int o = 0; o < 24; ++o) {
		int f = o / 12, r = o % 12;
		for (int j = 0; j < 4; ++j) {
			// image of the basis element z^j: conj gives z^{-j}, then rotate by r
			Z img = ZK[((f ? -j : j) + r + 24) % 12];
			LIN[o].m[0][j] = img.a, LIN[o].m[1][j] = img.b, LIN[o].m[2][j] = img.c, LIN[o].m[3][j] = img.d;
		}
	}
	for (int g = 0; g < 24; ++g) {
		int fg = g / 12, rg = g % 12;
		OINV[g] = fg ? g : (12 - rg) % 12;
		for (int a = 0; a < 24; ++a) {
			int fa = a / 12, ra = a % 12;
			OMUL[g][a] = 12 * (fg ^ fa) + ((fg ? rg - ra : rg + ra) + 24) % 12;
		}
	}
}

struct Iso {
	int o = 0;
	Z t;
	bool operator==(const Iso& x) const { return o == x.o && t == x.t; }
	bool operator<(const Iso& x) const { return o != x.o ? o < x.o : t < x.t; }
};
static Z apply(const Iso& g, const Z& v) { return lin(g.o, v) + g.t; }
static Iso compose(const Iso& g, const Iso& a) { return {OMUL[g.o][a.o], apply(g, a.t)}; }
static Iso inverse(const Iso& g) { return {OINV[g.o], -lin(OINV[g.o], g.t)}; }
static uint64_t ikey(const Iso& g) {
	auto p = [](int x) {
		if (x < -8000 || x > 8000) { fprintf(stderr, "translation out of range\n"); exit(2); }
		return uint64_t(uint16_t(x + 8192)) & 0x3fff;
	};
	return uint64_t(g.o) | p(g.t.a) << 5 | p(g.t.b) << 19 | p(g.t.c) << 33 | p(g.t.d) << 47;
}

// ------------------------------------------------------------------------------------ geometry
static bool overlap(const vector<cplx>& p, const vector<cplx>& q) {
	for (const auto* poly : {&p, &q}) {
		size_t n = poly->size();
		for (size_t i = 0; i < n; ++i) {
			cplx e = (*poly)[(i + 1) % n] - (*poly)[i];
			cplx nrm(e.imag(), -e.real());
			double amax = -1e300, amin = 1e300, bmax = -1e300, bmin = 1e300;
			for (auto z : p) { double s = z.real() * nrm.real() + z.imag() * nrm.imag(); amax = std::max(amax, s), amin = std::min(amin, s); }
			for (auto z : q) { double s = z.real() * nrm.real() + z.imag() * nrm.imag(); bmax = std::max(bmax, s), bmin = std::min(bmin, s); }
			if (amax <= bmin + EPS || bmax <= amin + EPS) return false;
		}
	}
	return true;
}

struct EdgeHash {
	size_t operator()(const std::pair<uint64_t, uint64_t>& e) const { return std::hash<uint64_t>()(e.first * 0x9E3779B97F4A7C15ULL ^ e.second); }
};
using Edge = std::pair<uint64_t, uint64_t>;

// Open addressing, linear probing, uint64 keys (never 0) to int values.
struct FastMap {
	vector<uint64_t> k;
	vector<int> v;
	size_t mask = 0, n = 0;
	FastMap() : FastMap(16) {}
	explicit FastMap(size_t cap) {
		size_t c = 16;
		while (c < cap * 2) c <<= 1;
		k.assign(c, 0), v.assign(c, 0), mask = c - 1;
	}
	static size_t h(uint64_t x) {
		x ^= x >> 33, x *= 0xff51afd7ed558ccdULL, x ^= x >> 33, x *= 0xc4ceb9fe1a85ec53ULL, x ^= x >> 33;
		return size_t(x);
	}
	int get(uint64_t key, int dflt = -1) const {
		for (size_t i = h(key) & mask;; i = (i + 1) & mask) {
			if (k[i] == key) return v[i];
			if (k[i] == 0) return dflt;
		}
	}
	bool has(uint64_t key) const { return get(key, INT32_MIN) != INT32_MIN; }
	// The value slot for key, created with dflt when absent; second says whether it was created.
	std::pair<int*, bool> put(uint64_t key, int dflt) {
		if ((n + 1) * 2 > k.size()) grow();
		for (size_t i = h(key) & mask;; i = (i + 1) & mask) {
			if (k[i] == key) return {&v[i], false};
			if (k[i] == 0) { k[i] = key, v[i] = dflt, ++n; return {&v[i], true}; }
		}
	}
	void grow() {
		FastMap g(k.size());
		for (size_t i = 0; i < k.size(); ++i)
			if (k[i]) *g.put(k[i], v[i]).first = v[i];
		*this = std::move(g);
	}
};

struct Shape {
	vector<vector<Z>> cells;
	vector<Z> verts;
	vector<std::pair<Z, Z>> edges;
	vector<Z> vs[24];
	vector<std::pair<Z, Z>> es[24];
	vector<vector<cplx>> polys[24];
	// Each cell of each orientation named by its lowest corner, the direction of the edge leaving it
	// counter-clockwise, and its side count: (lo, dir, sides).
	struct CellPos { Z lo; int dir, sides; };
	vector<CellPos> cellpos[24];
	vector<cplx> cellmid[24];  // centroid of each cell, per orientation
	vector<double> cellrad;  // circumradius of each cell
	cplx centre;
	double radius = 0;
	vector<Iso> sym;
	std::unordered_set<uint64_t> base_verts;
	vector<std::pair<int, Z>> by_dir[12];  // (orientation, start corner) of oriented edges per direction
	FastMap memo{1 << 12};

	static int dir_of(const Z& d) {
		for (int k = 0; k < 12; ++k)
			if (ZK[k] == d) return k;
		fprintf(stderr, "edge is not a unit vector\n");
		exit(2);
	}

	explicit Shape(const vector<vector<Z>>& cs) : cells(cs) {
		std::unordered_set<Edge, EdgeHash> all;
		for (auto& c : cells)
			for (size_t i = 0; i < c.size(); ++i) all.insert({vkey(c[i]), vkey(c[(i + 1) % c.size()])});
		for (auto& c : cells)
			for (size_t i = 0; i < c.size(); ++i) {
				Z u = c[i], v = c[(i + 1) % c.size()];
				if (!all.count({vkey(v), vkey(u)})) edges.push_back({u, v});
			}
		std::sort(edges.begin(), edges.end(), [](auto& x, auto& y) { return x.first < y.first || (x.first == y.first && x.second < y.second); });
		for (auto& e : edges) verts.push_back(e.first);
		std::sort(verts.begin(), verts.end());
		verts.erase(std::unique(verts.begin(), verts.end()), verts.end());
		for (auto& v : verts) base_verts.insert(vkey(v));
		for (int o = 0; o < 24; ++o) {
			Iso g{o, Z{}};
			for (auto& v : verts) vs[o].push_back(apply(g, v));
			for (auto& [u, v] : edges)
				es[o].push_back(o >= 12 ? std::make_pair(apply(g, v), apply(g, u)) : std::make_pair(apply(g, u), apply(g, v)));
			for (auto& c : cells) {
				vector<cplx> p;
				vector<Z> q;
				for (auto& v : c) p.push_back(zf(apply(g, v))), q.push_back(apply(g, v));
				polys[o].push_back(p);
				cplx mid = 0;
				for (auto& z : p) mid += z;
				cellmid[o].push_back(mid / double(p.size()));
				if (o == 0) cellrad.push_back(std::abs(p[0] - cellmid[0].back()));
				if (o >= 12) std::reverse(q.begin(), q.end());
				size_t m = std::min_element(q.begin(), q.end()) - q.begin();
				cellpos[o].push_back({q[m], dir_of(q[(m + 1) % q.size()] - q[m]), int(q.size())});
			}
			for (auto& [u, v] : es[o]) by_dir[dir_of(v - u)].push_back({o, u});
		}
		cplx s = 0;
		for (auto& v : verts) s += zf(v);
		centre = s / double(verts.size());
		for (auto& v : verts) radius = std::max(radius, std::abs(zf(v) - centre));
		auto key0 = cellkey(Iso{});
		Z lo = verts[0];
		for (int o = 0; o < 24; ++o) {
			Z m = *std::min_element(vs[o].begin(), vs[o].end());
			Iso g{o, lo - m};
			if (cellkey(g) == key0) sym.push_back(g);
		}
	}

	vector<vector<uint64_t>> cellkey(const Iso& g) const {
		vector<vector<uint64_t>> out;
		for (auto& c : cells) {
			vector<uint64_t> k;
			for (auto& v : c) k.push_back(vkey(apply(g, v)));
			std::sort(k.begin(), k.end());
			out.push_back(k);
		}
		std::sort(out.begin(), out.end());
		return out;
	}

	Iso canon(const Iso& g) const {
		if (sym.size() == 1) return g;
		Iso best = compose(g, sym[0]);
		for (size_t i = 1; i < sym.size(); ++i) {
			Iso h = compose(g, sym[i]);
			if (h < best) best = h;
		}
		return best;
	}

	cplx centre_of(const Iso& g) const {
		cplx c = g.o >= 12 ? std::conj(centre) : centre;
		return zf(g.t) + c * std::polar(1.0, (g.o % 12) * M_PI / 6);
	}

	char classify(const Iso& rel) {
		if (rel == Iso{}) return 'O';
		if (std::abs(centre_of(rel) - centre) > 2 * radius + EPS) return 'N';
		cplx tf = zf(rel.t);
		for (size_t i = 0; i < polys[0].size(); ++i)
			for (size_t j = 0; j < polys[rel.o].size(); ++j) {
				// Cells farther apart than their circumradii cannot meet.
				if (std::abs(cellmid[rel.o][j] + tf - cellmid[0][i]) >= cellrad[i] + cellrad[j] - EPS) continue;
				auto q = polys[rel.o][j];
				for (auto& z : q) z += tf;
				if (overlap(polys[0][i], q)) return 'O';
			}
		for (auto& v : vs[rel.o])
			if (base_verts.count(vkey(v + rel.t))) return 'T';
		return 'N';
	}

	// The relation of copy h to copy g ('O' overlap, 'T' share a corner, 'N' apart), and the canonical
	// placement of h relative to g.
	std::pair<char, Iso> relation(const Iso& g, const Iso& h) { return relation_inv(inverse(g), h); }
	std::pair<char, Iso> relation_inv(const Iso& ginv, const Iso& h) {
		Iso rel = canon(compose(ginv, h));
		uint64_t k = ikey(rel);
		auto [slot, fresh] = memo.put(k, 0);
		if (fresh) *slot = classify(rel);
		return {char(*slot), rel};
	}
};

// A unit cell placed: lowest corner (13 bits a coordinate), edge direction, side count.
static int SIDE_IX(int sides) { return sides == 3 ? 0 : sides == 4 ? 1 : sides == 6 ? 2 : 3; }
static const int SIDES_OF[4] = {3, 4, 6, 12};
static const int TURN_OF[4] = {4, 3, 2, 1};
static uint64_t ckey(const Z& lo, int dir, int sides) {
	auto p = [](int x) {
		if (x < -4000 || x > 4000) { fprintf(stderr, "cell out of range\n"); exit(2); }
		return uint64_t(x + 4096) & 0x1fff;
	};
	return 1ULL << 60 | p(lo.a) | p(lo.b) << 13 | p(lo.c) << 26 | p(lo.d) << 39 | uint64_t(dir) << 52 | uint64_t(SIDE_IX(sides)) << 56;
}
static void cell_unkey(uint64_t k, Z& lo, int& dir, int& sides) {
	auto q = [](uint64_t x) { return int(x & 0x1fff) - 4096; };
	lo = {q(k), q(k >> 13), q(k >> 26), q(k >> 39)};
	dir = int(k >> 52) & 15, sides = SIDES_OF[(k >> 56) & 3];
}
static vector<Z> cell_corners(const Z& lo, int dir, int sides) {
	vector<Z> out{lo};
	Z p = lo;
	for (int i = 0; i < sides - 1; ++i) p = p + ZK[(dir + i * TURN_OF[SIDE_IX(sides)]) % 12], out.push_back(p);
	return out;
}

static vector<Z> corners_of(uint64_t k) {
	Z lo; int d, sides;
	cell_unkey(k, lo, d, sides);
	return cell_corners(lo, d, sides);
}

struct Cand {
	Iso iso, inv;
	vector<uint64_t> cells;
	vector<uint64_t> verts;
	vector<Edge> edges;
	cplx centre;
};

using Model = vector<std::pair<int, int>>;  // (level, candidate)

struct Enc {
	int n = 0, nvars = 0;
	vector<int> lits;  // clauses, each ended by 0
	vector<int> used;  // candidates in the encoding; local index = position
	FastMap local;  // cand + 1 -> local index
	vector<std::array<int, 8>> xvar;  // per local index and level: the variable, or 0
	FastMap vid, eid;  // corner key -> id; (id a + 1) << 32 | (id b + 1) -> edge id
	vector<int> vown_at, vown, eown_at, eown;  // owners (candidates) per corner id and edge id, CSR
	int xv(int i, int k) const {
		int li = local.get(uint64_t(i) + 1);
		return li < 0 ? 0 : xvar[li][k];
	}
	int edge_id(uint64_t a, uint64_t b) const {
		int va = vid.get(a), vb = vid.get(b);
		return va < 0 || vb < 0 ? -1 : eid.get(uint64_t(va + 1) << 32 | uint64_t(vb + 1));
	}
};

static vector<std::pair<std::string, int>> SOLVER_OPTS;
static bool APAIRS = true;
static bool PERIODIC = true;  // look for periodic tilings once a shape has two coronas
static int P_KMAX = 8, P_LATTICES = 100, P_WORDS = 6, P_VECS = 600;
static bool ISO_FAST = true;
static bool ISO_FULL = false;  // Kaplan's closure check over all corona-1 copies (the fast check finds what it finds)  // edge-only isohedral check before anything else
static bool CELLAMO = true;  // overlap by cells: one at-most-one per cell, pairs only for crossing cells  // exclude touching pairs placed outside R (experiment switch)
static void configure(CaDiCaL::Solver& s) {
	s.set("lucky", 0);  // the lucky-phase probes cost more than they find on these instances
	for (auto& [k, v] : SOLVER_OPTS) s.set(k.c_str(), v);
}

static double now() {
	return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count();
}

struct Search {
	Shape S;
	vector<Cand> cands;
	std::unordered_map<uint64_t, int> index;
	std::ostringstream stats;
	double t0;

	explicit Search(const vector<vector<Z>>& cells) : S(cells), t0(now()) { cand(Iso{}); }

	// Do two distinct cells share interior? Memoized on their kinds, directions and relative offset.
	FastMap crossmemo{1 << 10};
	bool cells_cross(uint64_t ka, uint64_t kb) {
		Z la, lb; int da, sa, db, sb;
		cell_unkey(ka, la, da, sa);
		cell_unkey(kb, lb, db, sb);
		// Exact memo key: offset, both directions, both kinds packed without overlap.
		uint64_t key = 0;
		Z d = lb - la;
		auto p = [](int x) { return uint64_t(x + 64) & 0x7f; };
		if (std::abs(d.a) < 60 && std::abs(d.b) < 60 && std::abs(d.c) < 60 && std::abs(d.d) < 60) {
			key = 1ULL << 63 | p(d.a) | p(d.b) << 7 | p(d.c) << 14 | p(d.d) << 21 | uint64_t(da) << 28 | uint64_t(db) << 32 |
			      uint64_t(SIDE_IX(sa)) << 36 | uint64_t(SIDE_IX(sb)) << 38;
			int got = crossmemo.get(key);
			if (got >= 0) return got;
		}
		vector<cplx> pa, pb;
		for (auto& v : cell_corners(la, da, sa)) pa.push_back(zf(v));
		for (auto& v : cell_corners(lb, db, sb)) pb.push_back(zf(v));
		bool r = overlap(pa, pb);
		if (key) crossmemo.put(key, r);
		return r;
	}

	int cand(const Iso& g) {
		uint64_t k = ikey(g);
		auto it = index.find(k);
		if (it != index.end()) return it->second;
		Cand c;
		c.iso = g, c.inv = inverse(g);
		for (auto& v : S.vs[g.o]) c.verts.push_back(vkey(v + g.t));
		for (auto& [u, v] : S.es[g.o]) c.edges.push_back({vkey(u + g.t), vkey(v + g.t)});
		c.centre = S.centre_of(g);
		for (auto& cp : S.cellpos[g.o]) c.cells.push_back(ckey(cp.lo + g.t, cp.dir, cp.sides));
		cands.push_back(std::move(c));
		index.emplace(k, int(cands.size()) - 1);
		return int(cands.size()) - 1;
	}

	vector<Iso> edge_matches(const Iso& g) {
		vector<Iso> out;
		for (auto& [u0, v0] : S.es[g.o]) {
			Z a = u0 + g.t, b = v0 + g.t;
			for (auto& [o, u] : S.by_dir[Shape::dir_of(a - b)]) out.push_back(S.canon(Iso{o, b - u}));
		}
		return out;
	}

	vector<int> level1() {
		vector<int> found;
		vector<Iso> queue{Iso{}};
		std::unordered_set<uint64_t> seen{ikey(Iso{})};
		while (!queue.empty()) {
			Iso g = queue.back();
			queue.pop_back();
			for (auto& h : edge_matches(g)) {
				if (!seen.insert(ikey(h)).second) continue;
				if (S.relation(Iso{}, h).first != 'T') continue;
				found.push_back(cand(h));
				queue.push_back(h);
			}
		}
		std::sort(found.begin(), found.end());
		return found;
	}

	vector<int> next_level(const vector<int>& prev, const vector<Iso>& A) {
		std::unordered_set<int> out;
		for (int i : prev) {
			Iso g = cands[i].iso;
			for (auto& a : A) {
				Iso h = S.canon(compose(g, a));
				auto it = index.find(ikey(h));
				if (it != index.end() && out.count(it->second)) continue;
				if (S.relation(Iso{}, h).first != 'N') continue;
				out.insert(cand(h));
			}
		}
		vector<int> v(out.begin(), out.end());
		std::sort(v.begin(), v.end());
		return v;
	}

	// Clauses for an n-corona patch, holes allowed. R[k] (keys of placements relative to a copy):
	// where a neighbour of a level-k copy may sit; empty R: no restriction.
	Enc encode(const vector<vector<int>>& levels, int n, const vector<FastMap>& R) {
		Enc E;
		E.n = n;
		int var = 0;
		double tA = now();
		auto& cl = E.lits;
		auto add = [&](std::initializer_list<int> c) { cl.insert(cl.end(), c); cl.push_back(0); };
		for (int k = 0; k <= n; ++k)
			for (int i : levels[k]) {
				auto [slot, fresh] = E.local.put(uint64_t(i) + 1, int(E.used.size()));
				if (fresh) E.used.push_back(i), E.xvar.push_back({});
				E.xvar[*slot][k] = ++var;
			}
		int nu = int(E.used.size());
		vector<int> y(nu);
		// Dense corner and edge ids, with each candidate's corner and edge ids.
		vector<int> cv_at(nu + 1), cv, ce_at(nu + 1), ce;
		for (int li = 0; li < nu; ++li) {
			const Cand& c = cands[E.used[li]];
			for (auto w : c.verts) {
				auto [slot, fresh] = E.vid.put(w, int(E.vid.n));
				cv.push_back(*slot);
			}
			cv_at[li + 1] = int(cv.size());
		}
		int nv = int(E.vid.n);
		for (int li = 0; li < nu; ++li) {
			for (auto& [a, b] : cands[E.used[li]].edges) {
				uint64_t key = uint64_t(E.vid.get(a) + 1) << 32 | uint64_t(E.vid.get(b) + 1);
				ce.push_back(*E.eid.put(key, int(E.eid.n)).first);
			}
			ce_at[li + 1] = int(ce.size());
		}
		int ne = int(E.eid.n);
		auto csr = [&](int count, const vector<int>& at, const vector<int>& ids, vector<int>& own_at, vector<int>& own) {
			own_at.assign(count + 1, 0);
			for (int id : ids) ++own_at[id + 1];
			for (int i = 0; i < count; ++i) own_at[i + 1] += own_at[i];
			own.assign(ids.size(), 0);
			vector<int> fill(own_at.begin(), own_at.end() - 1);
			for (int li = 0; li < nu; ++li)
				for (int q = at[li]; q < at[li + 1]; ++q) own[fill[ids[q]]++] = li;
		};
		csr(nv, cv_at, cv, E.vown_at, E.vown);
		csr(ne, ce_at, ce, E.eown_at, E.eown);
		// Each edge's endpoints and its reverse.
		vector<std::pair<int, int>> ends(ne);
		for (int li = 0; li < nu; ++li) {
			auto& es = cands[E.used[li]].edges;
			for (size_t q = 0; q < es.size(); ++q) ends[ce[ce_at[li] + q]] = {E.vid.get(es[q].first), E.vid.get(es[q].second)};
		}
		vector<int> rev(ne);
		for (int e = 0; e < ne; ++e) rev[e] = E.eid.get(uint64_t(ends[e].second + 1) << 32 | uint64_t(ends[e].first + 1));

		add({E.xvar[E.local.get(1)][0]});
		for (int li = 0; li < nu; ++li) {
			int yi = y[li] = ++var;
			auto& xs = E.xvar[li];
			cl.push_back(-yi);
			for (int k = 0; k <= n; ++k)
				if (xs[k]) cl.push_back(xs[k]);
			cl.push_back(0);
			for (int a = 0; a <= n; ++a)
				if (xs[a]) {
					add({-xs[a], yi});
					for (int b = a + 1; b <= n; ++b)
						if (xs[b]) add({-xs[a], -xs[b]});
				}
		}
		size_t l_y = cl.size();
		// Edge variables are read only at the corners of inner copies (matching, closing): create them
		// only for edges with an end there.
		vector<char> innerv(nv, 0);
		for (int li = 0; li < nu; ++li) {
			bool inn = false;
			for (int k = 0; k < n; ++k) inn |= E.xvar[li][k] != 0;
			if (inn)
				for (int q = cv_at[li]; q < cv_at[li + 1]; ++q) innerv[cv[q]] = 1;
		}
		vector<int> U(ne, 0);
		for (int e = 0; e < ne; ++e) {
			if (!innerv[ends[e].first] && !innerv[ends[e].second]) continue;
			int u = U[e] = ++var;
			cl.push_back(-u);
			for (int q = E.eown_at[e]; q < E.eown_at[e + 1]; ++q) cl.push_back(y[E.eown[q]]);
			cl.push_back(0);
			for (int q = E.eown_at[e]; q < E.eown_at[e + 1]; ++q) add({-y[E.eown[q]], u});
		}
		size_t l_U = cl.size();
		vector<int> T(size_t(nv) * (n + 1), 0);  // (corner, level) -> var
		for (int w = 0; w < nv; ++w)
			for (int k = 0; k < n; ++k) {  // nothing lies beyond the outer corona to read T at level n
				int first = int(cl.size());
				for (int q = E.vown_at[w]; q < E.vown_at[w + 1]; ++q)
					if (int v = E.xvar[E.vown[q]][k]) cl.push_back(v);
				if (int(cl.size()) == first) continue;
				int tv = T[size_t(w) * (n + 1) + k] = ++var;
				vector<int> at(cl.begin() + first, cl.end());
				cl.resize(first);
				cl.push_back(-tv);
				cl.insert(cl.end(), at.begin(), at.end());
				cl.push_back(0);
				for (int v : at) add({-v, tv});
			}
		size_t l_T = cl.size();
		double tB = now();
		// Pairs: overlap excludes; a touching neighbour of an inner copy must sit as R allows.
		double cell = 2 * S.radius + 1e-6;
		std::unordered_map<uint64_t, vector<int>> grid;
		auto bkey = [](long bx, long by) { return uint64_t(bx + (1L << 30)) << 32 | uint64_t(by + (1L << 30)); };
		for (int li = 0; li < nu; ++li) {
			auto c = cands[E.used[li]].centre;
			grid[bkey(long(std::floor(c.real() / cell)), long(std::floor(c.imag() / cell)))].push_back(li);
		}
		long npair = 0, nover = 0, nA = 0;
		// With overlap handled by cells, only pairs with an inner copy can yield a clause.
		vector<char> has_inner(nu, 0);
		for (int li = 0; li < nu; ++li)
			for (int k = 0; k < n; ++k) has_inner[li] |= E.xvar[li][k] != 0;
		vector<double> cx(nu), cy(nu);
		for (int li = 0; li < nu; ++li) cx[li] = cands[E.used[li]].centre.real(), cy[li] = cands[E.used[li]].centre.imag();
		const double cell2 = cell * cell;
		for (auto& [bk, mine] : grid) {
			long bx = long(bk >> 32) - (1L << 30), by = long(bk & 0xffffffff) - (1L << 30);
			for (int li : mine) {
				if (CELLAMO && !has_inner[li]) continue;
				const Cand& ci = cands[E.used[li]];
				for (int dx = -1; dx <= 1; ++dx)
					for (int dy = -1; dy <= 1; ++dy) {
						auto it = grid.find(bkey(bx + dx, by + dy));
						if (it == grid.end()) continue;
						for (int lj : it->second) {
							// Each unordered pair once: from its inner end when only one end is inner.
							if (CELLAMO && !has_inner[lj] ? false : E.used[lj] <= E.used[li]) continue;
							if (lj == li) continue;
							double ddx = cx[lj] - cx[li], ddy = cy[lj] - cy[li];
							if (ddx * ddx + ddy * ddy > cell2) continue;
							const Cand& cj = cands[E.used[lj]];
							++npair;
							auto [c, rel] = S.relation_inv(ci.inv, cj.iso);
							if (c == 'O') {
								if (!CELLAMO) add({-y[li], -y[lj]});
								++nover;
							} else if (c == 'T' && APAIRS && !R.empty()) {
								uint64_t rk = ikey(rel);
								for (int k = 0; k < n; ++k)
									if (E.xvar[li][k] && !R[k].has(rk)) add({-E.xvar[li][k], -y[lj]}), ++nA;
								if (!has_inner[lj]) continue;
								uint64_t rb = ikey(S.relation_inv(cj.inv, ci.iso).second);
								for (int k = 0; k < n; ++k)
									if (E.xvar[lj][k] && !R[k].has(rb)) add({-E.xvar[lj][k], -y[li]}), ++nA;
							}
						}
					}
			}
		}
		size_t l_P = cl.size();
		double tC = now();
		long ncellcl = 0, ncross = 0;
		if (CELLAMO) {
			// Copies overlap exactly when two of their cells do: the same cell (at most one owner), or
			// two different cells that cross (possible only off a grid).
			FastMap cid;
			vector<vector<int>> owners;
			for (int li = 0; li < nu; ++li)
				for (auto k : cands[E.used[li]].cells) {
					auto [slot, fresh] = cid.put(k, int(owners.size()));
					if (fresh) owners.emplace_back();
					owners[*slot].push_back(y[li]);
				}
			int nc = int(owners.size());
			vector<uint64_t> keys(nc);
			for (size_t i = 0; i < cid.k.size(); ++i)
				if (cid.k[i]) keys[cid.v[i]] = cid.k[i];
			vector<int> C(nc, 0);
			auto cvar = [&](int c) {
				if (!C[c]) {
					C[c] = ++var;
					for (int yv : owners[c]) add({-yv, C[c]});
				}
				return C[c];
			};
			for (int c = 0; c < nc; ++c) {
				auto& o = owners[c];
				if (o.size() < 2) continue;
				if (o.size() <= 4) {
					for (size_t a = 0; a < o.size(); ++a)
						for (size_t b = a + 1; b < o.size(); ++b) add({-o[a], -o[b]}), ++ncellcl;
					continue;
				}
				int prev = 0;  // sequential counter
				for (size_t a = 0; a < o.size(); ++a) {
					if (prev) add({-o[a], -prev}), ++ncellcl;
					if (a + 1 == o.size()) break;
					int sv = ++var;
					add({-o[a], sv}), ++ncellcl;
					if (prev) add({-prev, sv}), ++ncellcl;
					prev = sv;
				}
			}
			// Crossing cells: distinct cells whose interiors meet, found near each other by centroid.
			vector<cplx> mid(nc);
			for (int c = 0; c < nc; ++c) {
				Z lo; int dir, sides;
				cell_unkey(keys[c], lo, dir, sides);
				cplx m = 0;
				for (auto& v : cell_corners(lo, dir, sides)) m += zf(v);
				mid[c] = m / double(sides);
			}
			const double reach = 2 * 1.9318517;  // two circumradii of the largest cell a free shape can hold (a dodecagon)
			std::unordered_map<uint64_t, vector<int>> cgrid;
			for (int c = 0; c < nc; ++c) cgrid[bkey(long(std::floor(mid[c].real() / reach)), long(std::floor(mid[c].imag() / reach)))].push_back(c);
			for (auto& [bk, mine] : cgrid) {
				long bx = long(bk >> 32) - (1L << 30), by = long(bk & 0xffffffff) - (1L << 30);
				for (int a : mine)
					for (int dx = -1; dx <= 1; ++dx)
						for (int dy = -1; dy <= 1; ++dy) {
							auto it = cgrid.find(bkey(bx + dx, by + dy));
							if (it == cgrid.end()) continue;
							for (int b : it->second) {
								if (b <= a || std::abs(mid[a] - mid[b]) >= reach) continue;
								if (!cells_cross(keys[a], keys[b])) continue;
								add({-cvar(a), -cvar(b)}), ++ncross;
							}
						}
			}
		}
		size_t l_C = cl.size();
		double tD = now();
		// Inner copies: every boundary edge matched, every corner closed.
		vector<vector<int>> inner(nv);
		for (int li = 0; li < nu; ++li)
			for (int k = 0; k < n; ++k) {
				int v = E.xvar[li][k];
				if (!v) continue;
				for (int q = ce_at[li]; q < ce_at[li + 1]; ++q) {
					int r = rev[ce[q]];
					if (r >= 0) add({-v, U[r]});
					else add({-v});
				}
				for (int q = cv_at[li]; q < cv_at[li + 1]; ++q) inner[cv[q]].push_back(v);
			}
		size_t l_I = cl.size();
		vector<vector<int>> at_vert(nv);
		for (int e = 0; e < ne; ++e)
			if (U[e]) at_vert[ends[e].first].push_back(e), at_vert[ends[e].second].push_back(e);
		for (int w = 0; w < nv; ++w) {
			if (inner[w].empty()) continue;
			int closed = ++var;
			for (int v : inner[w]) add({-v, closed});
			for (int e : at_vert[w]) {
				if (rev[e] >= 0) add({-closed, -U[e], U[rev[e]]});
				else add({-closed, -U[e]});
			}
		}
		size_t l_K = cl.size();
		// A level-k copy touches level k-1 and nothing below it.
		for (int li = 0; li < nu; ++li)
			for (int k = 1; k <= n; ++k) {
				int v = E.xvar[li][k];
				if (!v) continue;
				cl.push_back(-v);
				for (int q = cv_at[li]; q < cv_at[li + 1]; ++q)
					if (int t = T[size_t(cv[q]) * (n + 1) + k - 1]) cl.push_back(t);
				cl.push_back(0);
				for (int q = cv_at[li]; q < cv_at[li + 1]; ++q)
					for (int m = 0; m < k - 1; ++m)
						if (int t = T[size_t(cv[q]) * (n + 1) + m]) add({-v, -t});
			}
		E.nvars = var;
		stats << "{\"n\":" << n << ",\"cands\":[";
		for (int k = 0; k <= n; ++k) stats << (k ? "," : "") << levels[k].size();
		stats << "],\"vars\":" << var << ",\"lits\":" << cl.size() << ",\"pairs\":" << npair << ",\"over\":" << nover
		      << ",\"l_y\":" << l_y << ",\"l_U\":" << l_U - l_y << ",\"l_T\":" << l_T - l_U << ",\"l_pairs\":" << l_P - l_T
		      << ",\"l_cells\":" << l_C - l_P << ",\"l_inner\":" << l_I - l_C << ",\"l_close\":" << l_K - l_I << ",\"l_touch\":" << cl.size() - l_K
		      << ",\"Apairs\":" << nA << ",\"cellcl\":" << ncellcl << ",\"cross\":" << ncross << ",\"t_base\":" << tB - tA
		      << ",\"t_pairs\":" << tC - tB << ",\"t_cells\":" << tD - tC << ",\"t_rest\":" << now() - tD << ",\"t\":" << now() - t0 << "},";
		return E;
	}

	static void load(CaDiCaL::Solver& s, const Enc& E) {
		for (int l : E.lits) s.add(l);
	}

	Model model(const Enc& E, CaDiCaL::Solver& s) {
		Model m;
		for (size_t li = 0; li < E.used.size(); ++li)
			for (int k = 0; k <= E.n; ++k)
				if (int v = E.xvar[li][k]; v && s.val(v) > 0) m.push_back({k, E.used[li]});
		std::sort(m.begin(), m.end());
		return m;
	}

	// The first way a patch fails to be a disk at some prefix of coronas: a pinch (a corner the boundary
	// passes through twice) or a hole (a second boundary loop). Returns false when every prefix is a disk.
	struct Flaw { int k; vector<int> at_fault; bool vert; uint64_t where; vector<Edge> ring; };
	bool defect(const Model& m, Flaw& fl) {
		int top = 0;
		for (auto& [lv, _] : m) top = std::max(top, lv);
		for (int k = 0; k <= top; ++k) {
			std::unordered_map<Edge, int, EdgeHash> edges;
			vector<int> members;
			for (auto& [lv, i] : m)
				if (lv <= k) {
					members.push_back(i);
					for (auto& e : cands[i].edges) edges[e] = i;
				}
			std::unordered_map<uint64_t, vector<uint64_t>> out;
			for (auto& [e, i] : edges)
				if (!edges.count({e.second, e.first})) out[e.first].push_back(e.second);
			// Deterministic order: by vertex key.
			vector<uint64_t> keys;
			for (auto& [w, _] : out) keys.push_back(w);
			std::sort(keys.begin(), keys.end());
			for (auto w : keys)
				if (out[w].size() > 1) {
					fl.k = k, fl.vert = true, fl.where = w;
					for (int i : members)
						if (std::find(cands[i].verts.begin(), cands[i].verts.end(), w) != cands[i].verts.end()) fl.at_fault.push_back(i);
					return true;
				}
			uint64_t low = keys[0];
			auto lowf = [](uint64_t w) { auto z = zf(unkey(w)); return std::make_pair(z.imag(), z.real()); };
			for (auto w : keys)
				if (lowf(w) < lowf(low)) low = w;
			std::unordered_set<uint64_t> todo(keys.begin(), keys.end());
			while (!todo.empty()) {
				uint64_t start = *std::min_element(todo.begin(), todo.end());
				todo.erase(start);
				vector<uint64_t> loop{start};
				uint64_t cur = out[start][0];
				while (cur != start) {
					todo.erase(cur);
					loop.push_back(cur);
					cur = out[cur][0];
				}
				if (std::find(loop.begin(), loop.end(), low) == loop.end()) {
					fl.k = k, fl.vert = false;
					std::unordered_set<int> fault;
					for (size_t i = 0; i < loop.size(); ++i) {
						Edge e{loop[i], loop[(i + 1) % loop.size()]};
						fl.ring.push_back(e);
						fault.insert(edges[e]);
					}
					fl.at_fault.assign(fault.begin(), fault.end());
					std::sort(fl.at_fault.begin(), fl.at_fault.end());
					return true;
				}
			}
		}
		return false;
	}

	// A patch whose every prefix of coronas is a disk: each defect a model shows is forbidden as a
	// pattern (these copies at these levels, with nothing that would mend it) and the solver asked again.
	// The model passes when every prefix of coronas is a disk; otherwise its defect is forbidden as a
	// pattern (these copies at these levels, with nothing that would mend it), valid for every patch.
	bool passes_or_block(const Enc& E, CaDiCaL::Solver& s, const Model& m) {
		Flaw fl;
		if (!defect(m, fl)) return true;
		std::unordered_map<int, int> level;
		for (auto& [lv, i] : m) level[i] = lv;
		std::unordered_set<int> menders;
		if (fl.vert) {
			int w = E.vid.get(fl.where);
			for (int q = E.vown_at[w]; q < E.vown_at[w + 1]; ++q) {
				int j = E.used[E.vown[q]];
				if (std::find(fl.at_fault.begin(), fl.at_fault.end(), j) == fl.at_fault.end()) menders.insert(j);
			}
		} else {
			for (auto& [a, b] : fl.ring) {
				int e = E.edge_id(b, a);
				if (e < 0) continue;
				for (int q = E.eown_at[e]; q < E.eown_at[e + 1]; ++q) menders.insert(E.used[E.eown[q]]);
			}
		}
		for (int i : fl.at_fault) s.add(-E.xv(i, level[i]));
		for (int j : menders)
			for (int mm = 0; mm <= fl.k; ++mm)
				if (int v = E.xv(j, mm)) s.add(v);
		s.add(0);
		return false;
	}

	// A patch whose every prefix of coronas is a disk.
	bool strict(const Enc& E, Model& out, CaDiCaL::Solver* live = nullptr) {
		CaDiCaL::Solver fresh;
		if (!live) configure(fresh), load(fresh, E);
		CaDiCaL::Solver& s = live ? *live : fresh;
		while (true) {
			if (s.solve() != 10) return false;
			Model m = model(E, s);
			if (passes_or_block(E, s, m)) { out = m; return true; }
		}
	}

	// Develop surround N as a group orbit to L coronas; true when no two copies overlap.
	// A fast first look for isohedral tilings, on edges alone: the copies sharing an edge with a tile
	// generate an isohedral tiling, so it is enough to choose, among the placements edge-matched to the
	// shape, one per boundary edge, closed under inverse and under the relative position of any two
	// chosen copies that share an edge. Each choice is developed and checked: no overlaps, and the
	// shape's every corner closed. Nothing else is built when it succeeds.
	//
	// Without the closure clauses the same problem is a relaxation of the first corona (any corona has a
	// non-overlapping copy on each boundary edge), so when it has no solution the shape has none:
	// `ring` comes back false and the Heesch number is 0, with nothing else built.
	bool iso_fast(int L, bool& ring, int tries = 16) {
		ring = false;
		vector<Iso> E;
		FastMap eix;
		for (auto& a : edge_matches(Iso{}))
			if (S.relation(Iso{}, a).first == 'T' && eix.put(ikey(a), int(E.size())).second) E.push_back(a);
		int m = int(E.size());
		if (!m) return false;
		CaDiCaL::Solver s;
		configure(s);
		// Edges of each placement, and who owns each directed edge.
		std::unordered_map<Edge, vector<int>, EdgeHash> own;
		vector<vector<Edge>> ed(m);
		for (int i = 0; i < m; ++i)
			for (auto& [u, v] : S.es[E[i].o]) {
				Edge e{vkey(u + E[i].t), vkey(v + E[i].t)};
				ed[i].push_back(e);
				own[e].push_back(i);
			}
		// Every boundary edge of the shape matched by exactly one chosen copy.
		for (auto& [u, v] : S.es[0]) {
			auto it = own.find({vkey(v), vkey(u)});
			if (it == own.end()) return false;
			for (int i : it->second) s.add(i + 1);
			s.add(0);
		}
		double cell = 2 * S.radius + 1e-6;
		vector<cplx> cs(m);
		for (int i = 0; i < m; ++i) cs[i] = S.centre_of(E[i]);
		for (int i = 0; i < m; ++i)
			for (int j = i + 1; j < m; ++j)
				if (std::abs(cs[i] - cs[j]) <= cell && S.relation(E[i], E[j]).first == 'O') s.clause(-(i + 1), -(j + 1));
		if (s.solve() != 10) return false;  // no ring of copies on the edges: no corona at all
		ring = true;
		// Inverse closure and relative closure for copies sharing an edge, under a selector.
		const int act = m + 1;
		for (int i = 0; i < m; ++i) {
			int j = eix.get(ikey(S.canon(inverse(E[i]))));
			if (j < 0) s.clause(-act, -(i + 1));
			else if (j != i) s.clause(-act, -(i + 1), j + 1);
		}
		for (int i = 0; i < m; ++i)
			for (auto& [a, b] : ed[i]) {
				auto it = own.find({b, a});
				if (it == own.end()) continue;
				for (int j : it->second) {
					if (j == i) continue;
					int r = eix.get(ikey(S.relation(E[i], E[j]).second));
					if (r < 0) s.clause(-act, -(i + 1), -(j + 1));
					else s.clause(-act, -(i + 1), -(j + 1), r + 1);
				}
			}
		for (int t = 0; t < tries; ++t) {
			s.assume(act);
			if (s.solve() != 10) return false;
			vector<Iso> N;
			vector<int> used;
			for (int i = 0; i < m; ++i)
				if (s.val(i + 1) > 0) N.push_back(E[i]), used.push_back(i + 1);
			s.add(-act);
			for (int v : used) s.add(-v);
			s.add(0);  // next time, a different choice
			if (develops(N, std::max(L, 2) + 1, true)) return true;
		}
		return false;
	}

	bool develops(const vector<Iso>& N, int L, bool corners = false) {
		std::unordered_map<uint64_t, Iso> tiles{{ikey(Iso{}), Iso{}}};
		vector<Iso> front{Iso{}};
		for (int k = 1; k <= L; ++k) {
			vector<Iso> nxt;
			for (auto& g : front)
				for (auto& a : N) {
					Iso h = S.canon(compose(g, a));
					if (tiles.emplace(ikey(h), h).second) nxt.push_back(h);
				}
			front = nxt;
		}
		vector<std::pair<Iso, cplx>> all;
		for (auto& [_, g] : tiles) all.push_back({g, S.centre_of(g)});
		double cell = 2 * S.radius + 1e-6;
		for (size_t i = 0; i < all.size(); ++i)
			for (size_t j = i + 1; j < all.size(); ++j)
				if (std::abs(all[i].second - all[j].second) <= cell && S.relation(all[i].first, all[j].first).first == 'O') return false;
		if (corners) {
			// The shape's corners closed: every edge at one of them has its reverse in the patch.
			std::unordered_set<Edge, EdgeHash> edges;
			for (auto& [g, _] : all)
				for (auto& [u, v] : S.es[g.o]) edges.insert({vkey(u + g.t), vkey(v + g.t)});
			for (auto& [u, v] : S.es[0])
				if (!edges.count({vkey(v), vkey(u)})) return false;
			for (auto& w : S.verts) {
				uint64_t k = vkey(w);
				for (auto& e : edges)
					if ((e.first == k || e.second == k) && !edges.count({e.second, e.first})) return false;
			}
		}
		return true;
	}

	bool isohedral(const Enc& E, CaDiCaL::Solver& s, const vector<int>& A_idx, int L, Model& patch, int& used, int tries = 64) {
		int act = E.nvars + 1;
		std::unordered_set<int> inA(A_idx.begin(), A_idx.end());
		for (int c : A_idx) {
			auto it = index.find(ikey(S.canon(inverse(cands[c].iso))));
			if (it == index.end() || !inA.count(it->second)) s.clause(-act, -E.xv(c, 1));
			else if (it->second != c) s.clause(-act, -E.xv(c, 1), E.xv(it->second, 1));
		}
		for (int c : A_idx)
			for (int d : A_idx) {
				if (d == c) continue;
				auto [rc, rel] = S.relation(cands[c].iso, cands[d].iso);
				if (rc != 'T') continue;
				auto it = index.find(ikey(rel));
				if (it == index.end() || !inA.count(it->second)) s.clause(-act, -E.xv(c, 1), -E.xv(d, 1));
				else s.clause(-act, -E.xv(c, 1), -E.xv(d, 1), E.xv(it->second, 1));
			}
		for (int t = 0; t < tries; ++t) {
			used = t + 1;
			s.assume(act);
			if (s.solve() != 10) return false;
			Model m = model(E, s);
			vector<Iso> N;
			for (auto& [k, i] : m)
				if (k == 1) N.push_back(cands[i].iso);
			if (develops(N, L)) { patch = m; return true; }
			s.add(-act);
			for (auto& [k, i] : m)
				if (k == 1) s.add(-E.xv(i, 1));
			s.add(0);
		}
		return false;
	}

	// The level-1 copies that appear in some model: each solve asks for a model using at least one
	// copy not yet seen, so one UNSAT settles every copy left.
	std::unordered_set<int> cover(const Enc& E, CaDiCaL::Solver& s, const Model& first, const vector<int>& pool) {
		std::unordered_set<int> got;
		for (auto& [k, i] : first)
			if (k == 1) got.insert(i);
		int calls = 0;
		double t_last = 0, t_all = now();
		while (true) {
			vector<int> rest;
			for (int c : pool)
				if (!got.count(c) && E.xv(c, 1)) rest.push_back(E.xv(c, 1));
			if (rest.empty()) break;
			for (int v : rest) s.constrain(v), s.phase(v);  // prefer models that use copies not yet seen
			s.constrain(0);
			double tc = now();
			int r = s.solve();
			++calls, t_last = now() - tc;
			if (r != 10) break;
			for (auto& [k, i] : model(E, s))
				if (k == 1) got.insert(i);
		}
		stats << "{\"cover_calls\":" << calls << ",\"cover_last\":" << t_last << ",\"cover_t\":" << now() - t_all << ",\"pool\":" << pool.size() << "},";
		return got;
	}

	// ---------------------------------------------------------------- periodic tilings
	// Does the shape tile periodically with k copies per period, k <= kmax? Candidate periods are the
	// translations reachable by short words in A (in a tiling every copy is surrounded to every depth,
	// so neighbours sit as in the deepest A computed); lattices are pairs of them whose cell holds a
	// whole number of copies. For each lattice a SAT instance on the torus: copies modulo the lattice,
	// each chosen copy surrounded (edges and corners, modulo the lattice), each cell used once, crossing
	// cells excluded. A model is lifted to the plane and checked before it is believed.
	struct Lattice { Z v1, v2; cplx f1, f2; double det; int k, words = 0; };

	static uint64_t ekey(const Z& a, int d) { return ikey(Iso{d, a}) | 1ULL << 62; }

	Z reduce(const Lattice& lt, const Z& p, cplx at) const {
		at += cplx(0.0012345678, 0.0007654321);  // keep points off the cell's boundary
		double al = (at.real() * lt.f2.imag() - at.imag() * lt.f2.real()) / lt.det;
		double be = (lt.f1.real() * at.imag() - lt.f1.imag() * at.real()) / lt.det;
		long fa = long(std::floor(al)), fb = long(std::floor(be));
		Z q = p;
		for (int c = 0; c < 4; ++c) {
			int* qc = c == 0 ? &q.a : c == 1 ? &q.b : c == 2 ? &q.c : &q.d;
			const int* x1 = c == 0 ? &lt.v1.a : c == 1 ? &lt.v1.b : c == 2 ? &lt.v1.c : &lt.v1.d;
			const int* x2 = c == 0 ? &lt.v2.a : c == 1 ? &lt.v2.b : c == 2 ? &lt.v2.c : &lt.v2.d;
			*qc -= int(fa) * *x1 + int(fb) * *x2;
		}
		return q;
	}
	Z rz(const Lattice& lt, const Z& p) const { return reduce(lt, p, zf(p)); }
	Iso riso(const Lattice& lt, const Iso& g) const {
		Z shift = reduce(lt, Z{}, S.centre_of(g)) ;  // -(lattice vector) taking g's centre home
		return S.canon(Iso{g.o, g.t + shift});
	}

	double shape_area() const {
		double a = 0;
		for (auto& p : S.polys[0])
			for (size_t i = 0; i < p.size(); ++i) a += (std::conj(p[i]) * p[(i + 1) % p.size()]).imag() / 2;
		return a;
	}

	std::set<std::tuple<int, long, long, long, long>> tried_lattices;

	bool periodic(const vector<Iso>& A, int kmax, int max_lattices, int& k_found) {
		double area = shape_area();
		// Translations from words of length <= 3 in A.
		vector<Iso> words{Iso{}}, layer{Iso{}};
		std::unordered_set<uint64_t> seen{ikey(Iso{})};
		vector<Z> trans;
		vector<int> tlen;  // shortest word reaching each translation
		std::unordered_set<uint64_t> tseen;
		for (int len = 1; len <= P_WORDS; ++len) {
			vector<Iso> next;
			for (auto& g : layer)
				for (auto& a : A) {
					Iso h = compose(g, a);
					if (!seen.insert(ikey(h)).second) continue;
					next.push_back(h);
					if (h.o == 0 && h.t != Z{} && tseen.insert(vkey(h.t)).second) trans.push_back(h.t), tlen.push_back(len);
				}
			layer = std::move(next);
			if (layer.size() > 200000) break;
		}
		{
			vector<size_t> ord(trans.size());
			for (size_t i = 0; i < ord.size(); ++i) ord[i] = i;
			std::sort(ord.begin(), ord.end(), [&](size_t x, size_t y) { return std::norm(zf(trans[x])) < std::norm(zf(trans[y])); });
			vector<Z> t2;
			vector<int> l2;
			for (size_t i : ord) t2.push_back(trans[i]), l2.push_back(tlen[i]);
			trans = std::move(t2), tlen = std::move(l2);
		}
		if (int(trans.size()) > P_VECS) trans.resize(P_VECS), tlen.resize(P_VECS);
		vector<Lattice> lats;
		auto& lseen = tried_lattices;
		for (size_t i = 0; i < trans.size(); ++i)
			for (size_t j = i + 1; j < trans.size(); ++j) {
				cplx f1 = zf(trans[i]), f2 = zf(trans[j]);
				double det = f1.real() * f2.imag() - f1.imag() * f2.real();
				double kk = std::abs(det) / area;
				int k = int(std::lround(kk));
				if (k < 1 || k > kmax || std::abs(kk - k) > 1e-6) continue;
				Z v1 = trans[i], v2 = trans[j];
				if (det < 0) std::swap(v1, v2), std::swap(f1, f2), det = -det;
				// Lagrange reduction for a canonical key of the lattice.
				cplx a = f1, b = f2;
				for (int it = 0; it < 64; ++it) {
					if (std::norm(a) > std::norm(b)) std::swap(a, b);
					double mu = std::round((a.real() * b.real() + a.imag() * b.imag()) / std::norm(a));
					if (mu == 0) break;
					b -= mu * a;
				}
				auto r = [](double x) { return long(std::lround(x * 1e5)); };
				if (a.real() < -1e-9 || (std::abs(a.real()) < 1e-9 && a.imag() < 0)) a = -a;
				if (b.real() < -1e-9 || (std::abs(b.real()) < 1e-9 && b.imag() < 0)) b = -b;
				if (!lseen.insert({k, r(a.real()), r(a.imag()), r(b.real()), r(b.imag())}).second) continue;
				lats.push_back({v1, v2, f1, f2, det, k, tlen[i] + tlen[j]});
			}
		std::stable_sort(lats.begin(), lats.end(), [](const Lattice& x, const Lattice& y) { return x.words != y.words ? x.words < y.words : x.k < y.k; });
		stats << "{\"ptrans\":" << trans.size() << ",\"plats\":" << lats.size() << ",\"pA\":" << A.size() << "},";
		int tried = 0;
		for (auto& lt : lats) {
			if (tried++ >= max_lattices) break;
			// A lattice is hopeless when the shape overlaps one of its own translates by it.
			bool self = false;
			for (auto& [z, f] : shifts(lt, 2 * S.radius + 1e-6))
				if (std::abs(f) > 1e-9 && S.relation(Iso{}, S.canon(Iso{0, z})).first == 'O') { self = true; break; }
			if (self) continue;
			if (torus(lt, A)) { k_found = lt.k; return true; }
		}
		return false;
	}

	// Every lattice vector of length at most D, with its float image.
	static vector<std::pair<Z, cplx>> shifts(const Lattice& lt, double D) {
		double hmin = lt.det / std::max(std::abs(lt.f1), std::abs(lt.f2));
		int M = int(std::ceil(D / hmin)) + 1;
		vector<std::pair<Z, cplx>> out;
		for (int i = -M; i <= M; ++i)
			for (int j = -M; j <= M; ++j) {
				cplx f = double(i) * lt.f1 + double(j) * lt.f2;
				if (std::abs(f) > D) continue;
				Z z;
				z.a = i * lt.v1.a + j * lt.v2.a, z.b = i * lt.v1.b + j * lt.v2.b, z.c = i * lt.v1.c + j * lt.v2.c, z.d = i * lt.v1.d + j * lt.v2.d;
				out.push_back({z, f});
			}
		return out;
	}
	double domain_diam(const Lattice& lt) const { return std::max(std::abs(lt.f1 + lt.f2), std::abs(lt.f1 - lt.f2)); }

	bool torus(const Lattice& lt, const vector<Iso>& A) {
		// Copies modulo the lattice, reachable from the base in fewer than k steps through A.
		vector<Iso> P{riso(lt, Iso{})};
		FastMap pid;
		pid.put(ikey(P[0]), 0);
		vector<Iso> front = P;
		for (int d = 1; d < lt.k && !front.empty(); ++d) {
			vector<Iso> nxt;
			for (auto& g : front)
				for (auto& a : A) {
					Iso h = riso(lt, S.canon(compose(g, a)));
					if (pid.put(ikey(h), int(P.size())).second) P.push_back(h), nxt.push_back(h);
				}
			front = std::move(nxt);
			if (P.size() > 200000) return false;
		}
		int np = int(P.size());
		CaDiCaL::Solver s;
		configure(s);
		int var = np;  // y_g = g + 1
		s.add(1), s.add(0);
		// Edges (reduced start, direction) and their owners; corners; cells.
		FastMap eid, cid;
		vector<vector<int>> eown, cown;
		vector<vector<std::pair<int, uint64_t>>> pedges(np);  // per copy: (edge id, reverse edge key)
		vector<vector<uint64_t>> pverts(np);
		for (int g = 0; g < np; ++g) {
			auto& is = P[g];
			for (auto& [u, v] : S.es[is.o]) {
				Z a = u + is.t, b = v + is.t;
				int d = Shape::dir_of(b - a);
				uint64_t k = ekey(rz(lt, a), d), rk = ekey(rz(lt, b), (d + 6) % 12);
				auto [slot, fresh] = eid.put(k, int(eown.size()));
				if (fresh) eown.emplace_back();
				eown[*slot].push_back(g + 1);
				pedges[g].push_back({*slot, rk});
				pverts[g].push_back(vkey(rz(lt, a)));
			}
			for (auto& cp : S.cellpos[is.o]) {
				uint64_t k = ckey(rz(lt, cp.lo + is.t), cp.dir, cp.sides);
				auto [slot, fresh] = cid.put(k, int(cown.size()));
				if (fresh) cown.emplace_back();
				cown[*slot].push_back(g + 1);
			}
		}
		int ne = int(eown.size());
		vector<int> U(ne);
		for (int e = 0; e < ne; ++e) {
			U[e] = ++var;
			s.add(-U[e]);
			for (int y : eown[e]) s.add(y);
			s.add(0);
			for (int y : eown[e]) s.clause(-y, U[e]);
		}
		// Every chosen copy surrounded: its edges matched, its corners closed.
		std::unordered_map<uint64_t, vector<int>> at_vert;  // reduced corner -> edge ids touching it
		vector<uint64_t> ekeys(ne);
		for (size_t i = 0; i < eid.k.size(); ++i)
			if (eid.k[i]) ekeys[eid.v[i]] = eid.k[i];
		auto e_from = [](uint64_t k) {  // start corner and direction of an edge key
			Iso g;
			auto q = [](uint64_t x) { return int(x & 0x3fff) - 8192; };
			g.o = int(k & 31), g.t = {q(k >> 5), q(k >> 19), q(k >> 33), q(k >> 47)};
			return g;
		};
		for (int e = 0; e < ne; ++e) {
			Iso st = e_from(ekeys[e]);
			at_vert[vkey(st.t)].push_back(e);
			at_vert[vkey(rz(lt, st.t + ZK[st.o]))].push_back(e);
		}
		auto rev_of = [&](int e) {
			Iso st = e_from(ekeys[e]);
			return eid.get(ekey(rz(lt, st.t + ZK[st.o]), (st.o + 6) % 12));
		};
		std::unordered_map<uint64_t, int> closed;
		for (int g = 0; g < np; ++g) {
			for (auto& [e, rk] : pedges[g]) {
				int r = eid.get(rk);
				if (r >= 0) s.clause(-(g + 1), U[r]);
				else s.clause(-(g + 1));
			}
			for (auto w : pverts[g]) {
				auto [it, fresh] = closed.emplace(w, 0);
				if (fresh) it->second = ++var;
				s.clause(-(g + 1), it->second);
			}
		}
		for (auto& [w, cv] : closed)
			for (int e : at_vert[w]) {
				int r = rev_of(e);
				if (r >= 0) s.clause(-cv, -U[e], U[r]);
				else s.clause(-cv, -U[e]);
			}
		// Cells: at most one owner each; crossing cells exclude each other.
		int nc = int(cown.size());
		vector<uint64_t> ckeys(nc);
		for (size_t i = 0; i < cid.k.size(); ++i)
			if (cid.k[i]) ckeys[cid.v[i]] = cid.k[i];
		vector<int> C(nc);
		for (int c = 0; c < nc; ++c) {
			C[c] = ++var;
			for (int y : cown[c]) s.clause(-y, C[c]);
			auto& o = cown[c];
			for (size_t a = 0; a < o.size(); ++a)
				for (size_t b = a + 1; b < o.size(); ++b) s.clause(-o[a], -o[b]);
		}
		// Crossing: each reduced cell against every reduced cell shifted by small lattice vectors.
		vector<vector<cplx>> poly(nc);
		vector<cplx> mid(nc);
		for (int c = 0; c < nc; ++c) {
			for (auto& v : corners_of(ckeys[c])) poly[c].push_back(zf(v));
			cplx m = 0;
			for (auto& z : poly[c]) m += z;
			mid[c] = m / double(poly[c].size());
		}
		const double reach = 2 * 1.9318517;
		std::unordered_map<uint64_t, vector<std::pair<int, cplx>>> grid;
		auto bk = [&](cplx z) { return uint64_t(long(std::floor(z.real() / reach)) + (1L << 30)) << 32 | uint64_t(long(std::floor(z.imag() / reach)) + (1L << 30)); };
		auto sh_list = shifts(lt, reach + domain_diam(lt) + 4);
		for (int c = 0; c < nc; ++c)
			for (auto& [_, sh] : sh_list) grid[bk(mid[c] + sh)].push_back({c, sh});
		for (int a = 0; a < nc; ++a) {
			long bx = long(std::floor(mid[a].real() / reach)), by = long(std::floor(mid[a].imag() / reach));
			for (int dx = -1; dx <= 1; ++dx)
				for (int dy = -1; dy <= 1; ++dy) {
					auto it = grid.find(uint64_t(bx + dx + (1L << 30)) << 32 | uint64_t(by + dy + (1L << 30)));
					if (it == grid.end()) continue;
					for (auto& [b, sh] : it->second) {
						if (b == a && std::abs(sh) < 1e-9) continue;
						if (std::abs(mid[b] + sh - mid[a]) >= reach) continue;
						vector<cplx> q = poly[b];
						for (auto& z : q) z += sh;
						if (overlap(poly[a], q)) s.clause(-C[a], -C[b]);
					}
				}
		}
		if (s.solve() != 10) return false;
		vector<Iso> chosen;
		for (int g = 0; g < np; ++g)
			if (s.val(g + 1) > 0) chosen.push_back(P[g]);
		return lifted_ok(lt, chosen);
	}

	// Lift a torus tiling to the plane and check it there: no two copies overlap, and every chosen
	// copy is surrounded (its edges matched, its corners closed) by the copies around it.
	bool lifted_ok(const Lattice& lt, const vector<Iso>& chosen) {
		vector<Iso> tiles;
		for (auto& g : chosen)
			for (auto& [sh, _] : shifts(lt, 4 * S.radius + domain_diam(lt) + 2)) tiles.push_back(S.canon(Iso{g.o, g.t + sh}));
		double cell = 2 * S.radius + 1e-6;
		vector<cplx> cs;
		for (auto& g : tiles) cs.push_back(S.centre_of(g));
		std::unordered_set<Edge, EdgeHash> edges;
		for (auto& g : tiles)
			for (auto& [u, v] : S.es[g.o]) edges.insert({vkey(u + g.t), vkey(v + g.t)});
		for (auto& g : chosen) {
			cplx cg = S.centre_of(g);
			for (size_t j = 0; j < tiles.size(); ++j)
				if (!(tiles[j] == g) && std::abs(cs[j] - cg) <= cell && S.relation(g, tiles[j]).first == 'O') return false;
			for (auto& [u, v] : S.es[g.o]) {
				if (!edges.count({vkey(v + g.t), vkey(u + g.t)})) return false;
			}
			for (auto& w0 : S.vs[g.o]) {
				uint64_t w = vkey(w0 + g.t);
				for (auto& e : edges)
					if ((e.first == w || e.second == w) && !edges.count({e.second, e.first})) return false;
			}
		}
		return true;
	}

	struct Result { int hc = 0, hh = 0, period = 0; bool capped = false, iso = false; Model w, wh; };

	Result run(int L) {
		Result res;
		if (ISO_FAST) {
			double tf = now();
			bool ring = true;
			bool ok = iso_fast(L, ring);
			stats << "{\"iso_fast\":" << ok << ",\"ring\":" << ring << ",\"tf\":" << now() - tf << ",\"t\":" << now() - t0 << "},";
			if (ok) {
				res.capped = res.iso = true, res.hh = L;
				return res;
			}
			if (!ring) return res;  // Hc = Hh = 0
		}
		vector<int> L1 = level1();
		vector<vector<int>> levels{{0}, L1};
		Enc enc1 = encode(levels, 1, {});
		CaDiCaL::Solver s1;
		configure(s1);
		load(s1, enc1);
		if (s1.solve() != 10) return res;
		// Neighbour reduction: the level-1 copies that appear in some 1-corona.
		Model loose1 = model(enc1, s1);
		// A shape that tiles isohedrally needs nothing else, so that check comes before the reduction.
		Model isopatch;
		double ti = now();
		int iso_tries = 0;
		bool iso_ok = ISO_FULL && isohedral(enc1, s1, L1, L, isopatch, iso_tries);
		stats << "{\"iso_t\":" << now() - ti << ",\"iso_tries\":" << iso_tries << ",\"t\":" << now() - t0 << "},";
		if (iso_ok) {
			res.capped = res.iso = true, res.hh = L, res.wh = isopatch;
			stats << "{\"L1\":" << L1.size() << ",\"t\":" << now() - t0 << "},";
			return res;
		}
		std::unordered_set<int> Aset = cover(enc1, s1, loose1, L1);
		vector<int> A_idx(Aset.begin(), Aset.end());
		std::sort(A_idx.begin(), A_idx.end());
		stats << "{\"L1\":" << L1.size() << ",\"A1\":" << A_idx.size() << ",\"t\":" << now() - t0 << "},";
		vector<vector<Iso>> As{{}, {}};
		for (int i : A_idx) As[1].push_back(cands[i].iso);
		vector<Enc> encs;
		encs.push_back(Enc{});
		encs.push_back(std::move(enc1));
		vector<Model> loose{{}, loose1};
		std::unique_ptr<CaDiCaL::Solver> last;
		res.hh = 1;
		for (int n = 2; n <= L; ++n) {
			int m = int(As.size()) - 1;
			vector<const vector<Iso>*> Rv;
			vector<FastMap> R;
			for (int k = 0; k < n; ++k) {
				Rv.push_back(&As[std::min(n - k, m)]);
				FastMap keys(Rv.back()->size());
				for (auto& a : *Rv.back()) keys.put(ikey(a), 1);
				R.push_back(std::move(keys));
			}
			vector<vector<int>> lv{{0}, {}};
			for (auto& a : *Rv[0]) lv[1].push_back(cand(a));
			std::sort(lv[1].begin(), lv[1].end());
			for (int k = 1; k < n; ++k) lv.push_back(next_level(lv[k], *Rv[k]));
			Enc e = encode(lv, n, R);
			auto sp = std::make_unique<CaDiCaL::Solver>();
			CaDiCaL::Solver& s = *sp;
			configure(s);
			load(s, e);
			if (s.solve() != 10) break;
			loose.push_back(model(e, s));
			res.hh = n;
			if (n < L) {
				vector<int> pool;
				for (auto& a : As.back()) pool.push_back(index.at(ikey(a)));
				std::unordered_set<int> An = cover(e, s, loose.back(), pool);
				vector<int> Ai(An.begin(), An.end());
				std::sort(Ai.begin(), Ai.end());
				vector<Iso> Anv;
				for (int i : Ai) Anv.push_back(cands[i].iso);
				As.push_back(Anv);
				stats << "{\"A" << n << "\":" << Anv.size() << ",\"t\":" << now() - t0 << "},";
				// Two coronas and more: worth asking whether the shape tiles periodically.
				// Only once the neighbour sets have settled: a tiler's stop shrinking (its true neighbours
				// survive every depth), a deep non-tiler's keep falling away.
				if (n >= 2 && PERIODIC && 4 * As[n].size() >= 3 * As[n - 1].size()) {
					int k = 0;
					double tp = now();
					bool ok = periodic(Anv, P_KMAX, P_LATTICES << (n - 2), k);
					stats << "{\"periodic\":" << k << ",\"tp\":" << now() - tp << ",\"t\":" << now() - t0 << "},";
					if (ok) {
						res.capped = true, res.hh = L, res.period = k, res.wh = loose.back();
						return res;
					}
				}
			}
			encs.push_back(std::move(e));
			last = std::move(sp);  // the deepest corona found; the strict search starts on it
		}
		res.wh = loose[res.hh];
		if (res.hh == L) {
			res.capped = true;
			return res;
		}
		for (int lev = res.hh; lev >= 1; --lev) {
			Model m;
			CaDiCaL::Solver* live = lev == 1 ? &s1 : lev == res.hh ? last.get() : nullptr;
			if (strict(encs[lev], m, live)) {
				res.hc = lev, res.w = m;
				break;
			}
		}
		return res;
	}
};

static void patch_json(std::ostream& os, const Search& s, const Model& m) {
	os << "[";
	bool first = true;
	for (auto& [k, i] : m) {
		auto& g = s.cands[i].iso;
		os << (first ? "" : ",") << "[" << k << "," << g.o / 12 << "," << g.o % 12 << "," << g.t.a << "," << g.t.b << "," << g.t.c << "," << g.t.d << "]";
		first = false;
	}
	os << "]";
}

// ------------------------------------------------------------------------------------ enumeration
// Every hole-free shape of `size` cells of the given kinds, glued edge to edge, up to isometry. All
// edge-connected shapes are grown (holes and pinches included, since a hole-free shape need not be
// reachable through hole-free ones) and only disks are written out. A shape is the sorted list of its
// cell keys, translated so its least corner sits at the origin; its canonical form is the least such
// list over the 24 orientations.
static uint64_t key_of_loop(const vector<Z>& q) {
	size_t m = std::min_element(q.begin(), q.end()) - q.begin();
	return ckey(q[m], Shape::dir_of(q[(m + 1) % q.size()] - q[m]), int(q.size()));
}
static vector<uint64_t> canonical(const vector<uint64_t>& shape) {
	vector<vector<Z>> cells;
	for (auto k : shape) cells.push_back(corners_of(k));
	vector<uint64_t> best;
	for (int o = 0; o < 24; ++o) {
		vector<vector<Z>> t;
		Z lo = lin(o, cells[0][0]);
		for (auto& c : cells) {
			vector<Z> q;
			for (auto& v : c) q.push_back(lin(o, v)), lo = std::min(lo, q.back());
			if (o >= 12) std::reverse(q.begin(), q.end());
			t.push_back(std::move(q));
		}
		vector<uint64_t> keys;
		for (auto& q : t) {
			for (auto& v : q) v = v - lo;
			keys.push_back(key_of_loop(q));
		}
		std::sort(keys.begin(), keys.end());
		if (best.empty() || keys < best) best = std::move(keys);
	}
	return best;
}
static bool is_disk(const vector<uint64_t>& shape) {
	std::unordered_set<Edge, EdgeHash> all;
	for (auto k : shape) {
		auto c = corners_of(k);
		for (size_t i = 0; i < c.size(); ++i) all.insert({vkey(c[i]), vkey(c[(i + 1) % c.size()])});
	}
	std::unordered_map<uint64_t, uint64_t> nxt;
	for (auto& [a, b] : all)
		if (!all.count({b, a}) && !nxt.emplace(a, b).second) return false;  // pinch: a corner left twice
	size_t n = 1;
	uint64_t start = nxt.begin()->first;
	for (uint64_t cur = nxt[start]; cur != start; cur = nxt[cur]) ++n;
	return n == nxt.size();  // one loop: no hole
}
struct VecHash {
	size_t operator()(const vector<uint64_t>& v) const {
		size_t h = v.size();
		for (auto x : v) h = h * 0x9E3779B97F4A7C15ULL ^ FastMap::h(x);
		return h;
	}
};
static void enumerate(const vector<int>& kinds, int size) {
	std::unordered_set<vector<uint64_t>, VecHash> level;
	for (int sides : kinds) level.insert(canonical({ckey(Z{}, 0, sides)}));
	for (int n = 1; n < size; ++n) {
		std::unordered_set<vector<uint64_t>, VecHash> grown;
		for (auto& shape : level) {
			vector<vector<cplx>> polys;
			std::unordered_set<Edge, EdgeHash> all;
			for (auto k : shape) {
				auto c = corners_of(k);
				vector<cplx> p;
				for (size_t i = 0; i < c.size(); ++i) all.insert({vkey(c[i]), vkey(c[(i + 1) % c.size()])}), p.push_back(zf(c[i]));
				polys.push_back(p);
			}
			for (auto& [a, b] : all) {
				if (all.count({b, a})) continue;
				for (int sides : kinds) {
					// The new cell runs b -> a along the boundary edge a -> b, counter-clockwise.
					Z zb = unkey(b), za = unkey(a);
					auto q = cell_corners(zb, Shape::dir_of(za - zb), sides);
					vector<cplx> p;
					for (auto& v : q) p.push_back(zf(v));
					bool clash = false;
					for (auto& o : polys) clash = clash || overlap(p, o);
					if (clash) continue;
					auto next = shape;
					next.push_back(key_of_loop(q));
					grown.insert(canonical(next));
				}
			}
		}
		level = std::move(grown);
		fprintf(stderr, "size %d: %zu edge-connected shapes\n", n + 1, level.size());
	}
	vector<vector<uint64_t>> out;
	for (auto& sh : level)
		if (is_disk(sh)) out.push_back(sh);
	std::sort(out.begin(), out.end());
	fprintf(stderr, "size %d: %zu hole-free\n", size, out.size());
	for (auto& sh : out) {
		std::ostringstream os;
		os << sh.size();
		for (auto k : sh) {
			auto c = corners_of(k);
			os << " " << c.size();
			for (auto& v : c) os << " " << v.a << " " << v.b << " " << v.c << " " << v.d;
		}
		std::cout << os.str() << "\n";
	}
}

int main(int argc, char** argv) {
	init_ring();
	int L = 3, size = 0;
	vector<int> kinds;
	for (int i = 1; i < argc; ++i)
		if (std::string(argv[i]) == "-enum" && i + 1 < argc) {
			std::string ks = argv[++i];
			for (auto name : {"triangle", "square", "hexagon", "dodecagon"})
				if (ks.find(name) != std::string::npos) kinds.push_back(std::string(name) == "triangle" ? 3 : std::string(name) == "square" ? 4 : std::string(name) == "hexagon" ? 6 : 12);
		} else if (std::string(argv[i]) == "-size" && i + 1 < argc) size = atoi(argv[++i]);
	if (!kinds.empty()) {
		init_ring();
		enumerate(kinds, size);
		return 0;
	}
	for (int i = 1; i < argc; ++i)
		if (std::string(argv[i]) == "-L" && i + 1 < argc) L = atoi(argv[++i]);
		else if (std::string(argv[i]) == "-noapairs") APAIRS = false;
		else if (std::string(argv[i]) == "-pairwise") CELLAMO = false;
		else if (std::string(argv[i]) == "-noperiodic") PERIODIC = false;
		else if (std::string(argv[i]) == "-noisofast") ISO_FAST = false;
		else if (std::string(argv[i]) == "-isofull") ISO_FULL = true;
		else if (std::string(argv[i]) == "-pk" && i + 1 < argc) P_KMAX = atoi(argv[++i]);
		else if (std::string(argv[i]) == "-plat" && i + 1 < argc) P_LATTICES = atoi(argv[++i]);
		else if (std::string(argv[i]) == "-pwords" && i + 1 < argc) P_WORDS = atoi(argv[++i]);
		else if (std::string(argv[i]) == "-pvecs" && i + 1 < argc) P_VECS = atoi(argv[++i]);
		else if (std::string(argv[i]) == "-opt" && i + 1 < argc) {
			std::string kv = argv[++i];
			auto eq = kv.find('=');
			SOLVER_OPTS.push_back({kv.substr(0, eq), atoi(kv.c_str() + eq + 1)});
		}
	std::string line;
	while (std::getline(std::cin, line)) {
		if (line.empty()) continue;
		std::istringstream is(line);
		int nc;
		is >> nc;
		vector<vector<Z>> cells(nc);
		for (auto& c : cells) {
			int nv;
			is >> nv;
			c.resize(nv);
			for (auto& v : c) is >> v.a >> v.b >> v.c >> v.d;
		}
		double t = now();
		Search s(cells);
		auto r = s.run(L);
		std::ostringstream os;
		os << "{\"hc\":";
		if (r.capped) os << "null"; else os << r.hc;
		os << ",\"hh\":" << r.hh << ",\"capped\":" << (r.capped ? "true" : "false") << ",\"iso\":" << (r.iso ? "true" : "false")
		   << ",\"period\":" << r.period << ",\"t\":" << now() - t << ",\"copies\":" << s.cands.size() << ",\"w\":";
		patch_json(os, s, r.w);
		os << ",\"wh\":";
		patch_json(os, s, r.wh);
		std::string st = s.stats.str();
		if (!st.empty()) st.pop_back();
		os << ",\"stats\":[" << st << "]}";
		std::cout << os.str() << std::endl;
	}
	return 0;
}
