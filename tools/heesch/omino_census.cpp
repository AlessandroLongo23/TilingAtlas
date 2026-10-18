// Census of polyominoes by Heesch number, without SAT for all but a few shapes.
//
// Almost every large polyomino has Heesch number 0 (99.5 % of hole-free 22-ominoes), and the proof is
// local: arc consistency on "which copy covers this halo cell" wipes out a domain. Its two questions,
// whether a copy at some offset overlaps the shape and whether two copies at some relative offset overlap
// each other, are bit lookups in the difference sets S_j - S_i of the shape's orientations.
//
// The same consistency settles most of the rest. Run around each copy of the first corona, with the
// shape and that copy as obstacles, it proves there is no 2-corona (Hh = 1) once the copies that cannot
// be surrounded are removed. Tilers are found by choosing an isohedral corona over the live copies and
// checking that its group, taken modulo its translations, covers the torus exactly once. Shapes left
// undecided go to free_heesch.
//
// Modes:
//   omino_census enum N                     count fixed, free and hole-free N-ominoes
//   omino_census test < shapes.txt          verdict per free_heesch shape line: 0, T, 1 or ?
//   omino_census deep < shapes.txt          the same, trying periods of up to 16 copies
//   omino_census deepcert < shapes.txt      deep, with a tiling certificate (JSON) in place of each T
//   omino_census tilers N PART PARTS        enumerate and classify; a certificate per tiler proved
//   omino_census run N PART PARTS           enumerate and classify; counts on stderr (JSON), undecided
//                                           shapes on stdout as free_heesch lines
//   omino_census sample N PART PARTS EVERY  print every EVERY-th hole-free shape
#include <algorithm>
#include <array>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <numeric>
#include <sstream>
#include <string>
#include <unordered_set>
#include <vector>

using std::vector;
using u64 = uint64_t;

constexpr int MAXN = 32, MAXH = 4 * MAXN + 8;
static double now() { return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count(); }

// ------------------------------------------------------------------------------- the group
// R_k: rotate by k&3 quarter turns, then mirror x when k&4.
static inline void rot(int k, int x, int y, int& X, int& Y) {
	for (int r = 0; r < (k & 3); ++r) { int t = x; x = -y; y = t; }
	if (k & 4) x = -x;
	X = x, Y = y;
}
static int MUL[8][8], INV[8];
static void init_group() {
	int M[8][4];
	for (int k = 0; k < 8; ++k) {
		int x, y;
		rot(k, 1, 0, x, y), M[k][0] = x, M[k][2] = y;
		rot(k, 0, 1, x, y), M[k][1] = x, M[k][3] = y;
	}
	for (int a = 0; a < 8; ++a)
		for (int b = 0; b < 8; ++b) {
			int p[4] = {M[a][0] * M[b][0] + M[a][1] * M[b][2], M[a][0] * M[b][1] + M[a][1] * M[b][3],
			            M[a][2] * M[b][0] + M[a][3] * M[b][2], M[a][2] * M[b][1] + M[a][3] * M[b][3]};
			for (int k = 0; k < 8; ++k)
				if (!memcmp(p, M[k], sizeof p)) MUL[a][b] = k;
		}
	for (int a = 0; a < 8; ++a)
		for (int b = 0; b < 8; ++b)
			if (MUL[a][b] == 0) INV[a] = b;
}

// ------------------------------------------------------------------------------- the shape
// Unique orientations u = 0..nu-1 (u = 0 is the shape itself): rows OR[u], height OH[u], width OW[u].
// Group element k gives orientation KU[k] with offset NK[k]: R_k S = S_{KU[k]} + NK[k].
static int N, nu, OH[8], OW[8], UK[8], KU[8], NKX[8], NKY[8];
static uint32_t OR[8][MAXN];

static void load(vector<std::pair<int, int>> cells) {
	N = int(cells.size());
	int mx = 1 << 30, my = 1 << 30;
	for (auto [x, y] : cells) mx = std::min(mx, x), my = std::min(my, y);
	for (auto& [x, y] : cells) x -= mx, y -= my;  // the identity is the copy at (0, 0)
	nu = 0;
	for (int k = 0; k < 8; ++k) {
		int xs[MAXN], ys[MAXN], ax = 1 << 30, ay = 1 << 30;
		for (int i = 0; i < N; ++i) rot(k, cells[i].first, cells[i].second, xs[i], ys[i]), ax = std::min(ax, xs[i]), ay = std::min(ay, ys[i]);
		uint32_t r[MAXN] = {};
		int h = 0, w = 0;
		for (int i = 0; i < N; ++i) r[ys[i] - ay] |= 1u << (xs[i] - ax), h = std::max(h, ys[i] - ay + 1), w = std::max(w, xs[i] - ax + 1);
		NKX[k] = ax, NKY[k] = ay;
		int u = -1;
		for (int j = 0; j < nu && u < 0; ++j)
			if (OH[j] == h && !memcmp(OR[j], r, sizeof(uint32_t) * h)) u = j;
		if (u < 0) {
			u = nu++;
			memcpy(OR[u], r, sizeof r), OH[u] = h, OW[u] = w, UK[u] = k;
		}
		KU[k] = u;
	}
}

static inline bool cell_of(int u, int x, int y) { return unsigned(x) < 32 && unsigned(y) < unsigned(OH[u]) && (OR[u][y] >> x & 1); }

// Difference tables S_j - S_i, built on first use: bit (dx + 32) of row (dy + 64).
struct PadDiff { u64 row[128]; };
static PadDiff XP[8][8];
static bool have[8][8];
static int lo_[8][8], hi_[8][8];
static void reset_tables() {
	static bool init = false;
	if (!init) { memset(XP, 0, sizeof XP); for (auto& r : lo_) for (auto& v : r) v = 64; for (auto& r : hi_) for (auto& v : r) v = 64; init = true; }
	memset(have, 0, sizeof have);
}
static const u64* tab(int j, int i) {
	if (!have[j][i]) {
		have[j][i] = true;
		u64* R = XP[j][i].row;
		for (int r = lo_[j][i]; r < hi_[j][i]; ++r) R[r] = 0;
		int lo = 128, hi = 0;
		if (i != j && have[i][j]) {
			// S_j - S_i is the point reflection of S_i - S_j: rows reversed, bits reversed
			const u64* Q = XP[i][j].row;
			lo = 128 - hi_[i][j] + 1, hi = 128 - lo_[i][j] + 1;
			for (int r = lo; r < hi; ++r) R[r] = __builtin_bitreverse64(Q[128 - r]) << 1;
		} else
			for (int by = 0; by < OH[i]; ++by)
				for (uint32_t bits = OR[i][by]; bits; bits &= bits - 1) {
					int bx = __builtin_ctz(bits);
					for (int y = 0; y < OH[j]; ++y) R[y - by + 64] |= u64(OR[j][y]) << (32 - bx);
					lo = std::min(lo, -by + 64), hi = std::max(hi, OH[j] - by + 64);
				}
		lo_[j][i] = lo, hi_[j][i] = hi;
	}
	return XP[j][i].row;
}
// Do copy j at t and copy i at p overlap?  t - p in S_i - S_j.
static inline bool overlap(int j, int tx, int ty, int i, int px, int py) {
	int dx = tx - px + 32, dy = ty - py + 64;
	if (unsigned(dx) >= 64 || unsigned(dy) >= 128) return false;
	return tab(i, j)[dy] >> dx & 1;
}

// ------------------------------------------------------------------------------- consistency nets
// Halo of a centre copy, every other cell off limits when an obstacle copy covers it. A value at halo
// cell h is (orientation j, cell (x, y) of S_j) for the copy S_j + h - (x, y); domains are bitboards.
static const int DX[8] = {1, 1, 0, -1, -1, -1, 0, 1}, DY[8] = {0, 1, 1, 1, 0, -1, -1, -1};
static long N_REVISE = 0, N_COMPAT = 0;

// HC halo cells at most, on a G x G grid around the centre copies.
template <int HC, int G>
struct NetT {
	static constexpr int MAXOB = 48;
	int nh, bx0, by0, bw, bh;
	int16_t hidx[G][G];
	int hx[HC], hy[HC], nbr[HC][8], tight[HC];
	uint32_t A[HC][8][MAXN];
	char built[HC], dirty[HC];
	int nalive[HC], ndirty;
	uint8_t lastj[HC][8][8];
	int nob, obu[MAXOB], obx[MAXOB], oby[MAXOB];
	const NetT* R;
	int16_t ridx[HC];

	int at(int x, int y) const {
		x -= bx0, y -= by0;
		return unsigned(x) < unsigned(bw) && unsigned(y) < unsigned(bh) ? hidx[y][x] : -1;
	}
	// Obstacles u[i] at (x[i], y[i]); the halo is the cells next to the first `ncentre` of them that no
	// obstacle covers. Values at cells R also has must be alive there. False when the grid is too small.
	bool setup(int n, const int* u, const int* x, const int* y, int ncentre, const NetT* r) {
		if (n > MAXOB) return false;
		nob = n;
		for (int i = 0; i < n; ++i) obu[i] = u[i], obx[i] = x[i], oby[i] = y[i];
		R = r;
		int x0 = 1 << 30, y0 = 1 << 30, x1 = -(1 << 30), y1 = -(1 << 30);
		for (int i = 0; i < ncentre; ++i) x0 = std::min(x0, x[i]), y0 = std::min(y0, y[i]), x1 = std::max(x1, x[i] + OW[u[i]]), y1 = std::max(y1, y[i] + OH[u[i]]);
		bx0 = x0 - 1, by0 = y0 - 1, bw = x1 - x0 + 2, bh = y1 - y0 + 2;
		if (bw > G || bh > G) return false;
		// occupancy (obstacles) and centre cells on the box with a margin of 2
		static uint8_t occ[G + 4][G + 4];
		for (int yy = 0; yy < bh + 4; ++yy)
			for (int xx = 0; xx < bw + 4; ++xx) occ[yy][xx] = 0;
		for (int i = 0; i < n; ++i)
			for (int ry = 0; ry < OH[u[i]]; ++ry)
				for (uint32_t bits = OR[u[i]][ry]; bits; bits &= bits - 1) {
					int X = x[i] + __builtin_ctz(bits) - bx0 + 2, Y = y[i] + ry - by0 + 2;
					if (unsigned(X) < unsigned(bw + 4) && unsigned(Y) < unsigned(bh + 4)) occ[Y][X] |= i < ncentre ? 3 : 1;
				}
		nh = 0;
		for (int yy = 0; yy < bh; ++yy)
			for (int xx = 0; xx < bw; ++xx) {
				hidx[yy][xx] = -1;
				if (occ[yy + 2][xx + 2]) continue;
				bool t = false;
				for (int d = 0; d < 8 && !t; ++d) t = occ[yy + 2 + DY[d]][xx + 2 + DX[d]] & 2;
				if (!t) continue;
				if (nh == HC) return false;
				int h = nh++;
				hidx[yy][xx] = int16_t(h), hx[h] = xx + bx0, hy[h] = yy + by0;
			}
		for (int h = 0; h < nh; ++h) {
			for (int d = 0; d < 8; ++d) nbr[h][d] = at(hx[h] + DX[d], hy[h] + DY[d]);
			int t = 0, X = hx[h] - bx0 + 2, Y = hy[h] - by0 + 2;
			for (int dy = -2; dy <= 2; ++dy)
				for (int dx = -2; dx <= 2; ++dx) t += occ[Y + dy][X + dx] != 0;
			tight[h] = t;
			built[h] = 0, dirty[h] = 1;
			ridx[h] = int16_t(R ? R->at(hx[h], hy[h]) : -1);
		}
		ndirty = nh;
		return true;
	}
	bool build(int h) {
		if (built[h]) return nalive[h] > 0;
		built[h] = 1;
		int cnt = 0;
		const int rh = ridx[h];
		const bool restrict = rh >= 0 && R->built[rh];
		for (int j = 0; j < nu; ++j) {
			for (int y = 0; y < OH[j]; ++y) A[h][j][y] = OR[j][y];
			for (int o = 0; o < nob; ++o) {
				int ox = hx[h] - obx[o], oy = hy[h] - oby[o];
				int s = 32 - ox;
				if (s >= 64 || s <= -32) continue;
				const u64* X = tab(j, obu[o]);
				for (int y = 0; y < OH[j]; ++y) {
					int r = y - oy + 64;
					if (unsigned(r) >= 128) continue;
					u64 w = s >= 0 ? X[r] >> s : X[r] << -s;
					A[h][j][y] &= ~uint32_t(w);
				}
			}
			if (restrict)
				for (int y = 0; y < OH[j]; ++y) A[h][j][y] &= R->A[rh][j][y];
			for (int y = 0; y < OH[j]; ++y) cnt += __builtin_popcount(A[h][j][y]);
			for (int d = 0; d < 8; ++d) lastj[h][j][d] = uint8_t(j);
		}
		nalive[h] = cnt;
		return cnt > 0;
	}
	void build_all() {
		for (int h = 0; h < nh; ++h) build(h);
	}
	void touch(int h) {
		if (!dirty[h]) dirty[h] = 1, ++ndirty;
	}
	// Arc consistency to a fixpoint; true on a wipe-out.
	bool propagate() {
		while (ndirty) {
			int h = -1;
			long best = 1L << 40;
			for (int c = 0; c < nh; ++c) {
				if (!dirty[c]) continue;
				long score = built[c] ? nalive[c] : 1000 - tight[c];
				if (score < best) best = score, h = c;
			}
			dirty[h] = 0, --ndirty;
			++N_REVISE;
			if (!build(h)) return true;
			for (int d = 0; d < 8; ++d)
				if (nbr[h][d] >= 0 && !build(nbr[h][d])) return true;
			bool killed = false;
			for (int i1 = 0; i1 < nu; ++i1)
				for (int y = 0; y < OH[i1]; ++y) {
					uint32_t bits = A[h][i1][y];
					while (bits) {
						int x = __builtin_ctz(bits);
						bits &= bits - 1;
						bool ok = true;
						for (int d = 0; d < 8 && ok; ++d) {
							int g = nbr[h][d];
							if (g < 0) continue;
							int ex = x + DX[d], ey = y + DY[d];
							if (unsigned(ey) < unsigned(OH[i1]) && unsigned(ex) < 32 && (A[g][i1][ey] >> ex & 1)) continue;  // same copy
							int sh = 32 - ex;
							bool sup = false;
							int j0 = lastj[h][i1][d];
							for (int k = 0; k < nu && !sup; ++k) {
								int j = j0 + k < nu ? j0 + k : j0 + k - nu;
								const u64* Xr = tab(j, i1) + 64 - ey;
								const uint32_t* Ag = A[g][j];
								uint32_t acc = 0;
								for (int yy = 0; yy < OH[j]; ++yy) acc |= Ag[yy] & ~uint32_t(Xr[yy] >> sh);
								N_COMPAT += OH[j];
								if (acc) sup = true, lastj[h][i1][d] = uint8_t(j);
							}
							ok = sup;
						}
						if (!ok) A[h][i1][y] &= ~(1u << x), --nalive[h], killed = true;
					}
				}
			if (!nalive[h]) return true;
			if (killed)
				for (int d = 0; d < 8; ++d)
					if (nbr[h][d] >= 0) touch(nbr[h][d]);
		}
		return false;
	}
	// Remove copy (u at tx, ty) from every halo cell it covers.
	void kill(int u, int tx, int ty) {
		for (int y = 0; y < OH[u]; ++y)
			for (uint32_t bits = OR[u][y]; bits; bits &= bits - 1) {
				int x = __builtin_ctz(bits);
				int h = at(tx + x, ty + y);
				if (h < 0 || !built[h] || !(A[h][u][y] >> x & 1)) continue;
				A[h][u][y] &= ~(1u << x), --nalive[h], touch(h);
				for (int d = 0; d < 8; ++d)
					if (nbr[h][d] >= 0) touch(nbr[h][d]);
			}
	}
};

using Net = NetT<MAXH, MAXN + 4>;
static Net BASE, SUB;
static NetT<1024, 3 * MAXN + 8> PATCH;

// ------------------------------------------------------------------------------- live copies
// The copies still alive in BASE, with the halo cells each covers and which ones overlap.
constexpr int MAXC = 2048, MAXW = MAXC / 64;
struct Cp { int u, tx, ty; u64 cov[2]; };
static Cp CP[MAXC];
static int ncp, NW;
static u64 INC[MAXC][MAXW];
static int16_t CIDX[8][96][96];  // copy index by (u, tx + 48, ty + 48), -1 when absent
static int cidx(int u, int tx, int ty) {
	unsigned X = unsigned(tx + 48), Y = unsigned(ty + 48);
	return X < 96 && Y < 96 ? CIDX[u][X][Y] : -1;
}
static bool collect(bool pairs) {
	for (int i = 0; i < ncp; ++i) CIDX[CP[i].u][CP[i].tx + 48][CP[i].ty + 48] = -1;
	ncp = 0;
	const Net& B = BASE;
	for (int h = 0; h < B.nh; ++h)
		for (int j = 0; j < nu; ++j)
			for (int y = 0; y < OH[j]; ++y)
				for (uint32_t bits = B.A[h][j][y]; bits; bits &= bits - 1) {
					int x = __builtin_ctz(bits), tx = B.hx[h] - x, ty = B.hy[h] - y;
					int c = cidx(j, tx, ty);
					if (c < 0) {
						if (ncp == MAXC) return false;
						c = ncp++;
						CP[c] = {j, tx, ty, {0, 0}};
						CIDX[j][tx + 48][ty + 48] = int16_t(c);
					}
					CP[c].cov[h >> 6] |= u64(1) << (h & 63);
				}
	NW = (ncp + 63) / 64;
	if (!pairs) return true;
	for (int a = 0; a < ncp; ++a) {
		memset(INC[a], 0, sizeof(u64) * NW);
		INC[a][a >> 6] |= u64(1) << (a & 63);
	}
	for (int a = 0; a < ncp; ++a)
		for (int b = a + 1; b < ncp; ++b)
			if (overlap(CP[a].u, CP[a].tx, CP[a].ty, CP[b].u, CP[b].tx, CP[b].ty)) INC[a][b >> 6] |= u64(1) << (b & 63), INC[b][a >> 6] |= u64(1) << (a & 63);
	return true;
}

// ------------------------------------------------------------------------------- a corona exists?
// Exhaustive search over the live copies: cover every halo cell, no two copies overlapping.
static long NODES = 0, NODE_LIMIT = 200000;
static int corona_dfs(u64 c0, u64 c1, const u64* ex) {
	if (++NODES > NODE_LIMIT) return -1;
	const Net& B = BASE;
	int best = -1, bc = 1 << 30;
	for (int h = 0; h < B.nh; ++h) {
		if ((h < 64 ? c0 : c1) >> (h & 63) & 1) continue;
		int cnt = 0;
		for (int c = 0; c < ncp; ++c)
			if ((CP[c].cov[h >> 6] >> (h & 63) & 1) && !(ex[c >> 6] >> (c & 63) & 1)) ++cnt;
		if (cnt < bc) bc = cnt, best = h;
		if (!cnt) return 0;
	}
	if (best < 0) return 1;
	u64 nx[MAXW];
	for (int c = 0; c < ncp; ++c) {
		if (!(CP[c].cov[best >> 6] >> (best & 63) & 1) || (ex[c >> 6] >> (c & 63) & 1)) continue;
		for (int w = 0; w < NW; ++w) nx[w] = ex[w] | INC[c][w];
		int r = corona_dfs(c0 | CP[c].cov[0], c1 | CP[c].cov[1], nx);
		if (r) return r;
	}
	return 0;
}

// ------------------------------------------------------------------------------- isohedral tilings
// An isometry x -> R_k x + v, and the copy it makes.
struct Iso { int k, x, y; };
static Iso iso_of(int c) {
	int k = UK[CP[c].u];
	return {k, CP[c].tx - NKX[k], CP[c].ty - NKY[k]};
}
static Iso compose(Iso a, Iso b) {
	int X, Y;
	rot(a.k, b.x, b.y, X, Y);
	return {MUL[a.k][b.k], X + a.x, Y + a.y};
}
static Iso inverse(Iso a) {
	int ki = INV[a.k], X, Y;
	rot(ki, -a.x, -a.y, X, Y);
	return {ki, X, Y};
}
static int copy_index(Iso g) { return cidx(KU[g.k], g.x + NKX[g.k], g.y + NKY[g.k]); }

// 2D lattice in Hermite form: (A, 0), (B, C).
struct Lat {
	long A = 0, B = 0, C = 0;
	void add(long x, long y) {
		if (y < 0) x = -x, y = -y;
		if (y == 0) { A = std::gcd(A, std::labs(x)); return; }
		if (C == 0) { B = x, C = y; return; }
		// extended gcd on (C, y)
		long a = C, b = y, s0 = 1, s1 = 0, t0 = 0, t1 = 1;
		while (b) {
			long q = a / b, r = a - q * b;
			a = b, b = r;
			long s2 = s0 - q * s1, t2 = t0 - q * t1;
			s0 = s1, s1 = s2, t0 = t1, t1 = t2;
		}
		long g = a;  // = s0 C + t0 y
		long nB = s0 * B + t0 * x;
		long zx = (y / g) * B - (C / g) * x;  // y-component zero
		A = std::gcd(A, std::labs(zx));
		B = nB, C = g;
		if (A) B = ((B % A) + A) % A;
	}
	// reduce a point into [0, A) x [0, C)
	void reduce(long& x, long& y) const {
		long q = y >= 0 ? y / C : -((-y + C - 1) / C);
		y -= q * C, x -= q * B;
		x = ((x % A) + A) % A;
	}
};

static long N_VERIFY = 0;
// The last tiling proved: a lattice in Hermite form (A, 0), (B, C) and the copies (u at tx, ty) in one
// period, so that the copies and their translates by the lattice cover the plane once.
static long CERT_A, CERT_B, CERT_C;
static vector<std::array<int, 3>> CERT;
// Develop the group generated by the chosen copies, take its translations, and check that the orbit of
// the shape reduced modulo them covers the torus exactly once: a periodic tiling, proved.
static bool torus_ok(const vector<int>& chosen) {
	++N_VERIFY;
	vector<Iso> gen;
	for (int c : chosen) gen.push_back(iso_of(c));
	auto key = [](const Iso& g) { return (u64(g.k) << 40) | (u64(uint32_t(g.x + (1 << 19))) << 20) | u64(uint32_t(g.y + (1 << 19))); };
	std::unordered_set<u64> seen;
	vector<Iso> all{{0, 0, 0}}, front{{0, 0, 0}};
	seen.insert(key(all[0]));
	Lat L;
	for (int depth = 0; depth < 5 && all.size() < 4000; ++depth) {
		vector<Iso> nxt;
		for (auto& g : front)
			for (auto& a : gen) {
				Iso h = compose(g, a);
				if (seen.insert(key(h)).second) {
					nxt.push_back(h), all.push_back(h);
					if (h.k == 0) L.add(h.x, h.y);
				}
			}
		front.swap(nxt);
	}
	if (!L.A || !L.C) return false;
	long area = L.A * L.C;
	if (area % N || area > 8 * N) return false;
	vector<int> cnt(area, 0);
	std::unordered_set<u64> cls;
	long covered = 0;
	CERT.clear();
	for (auto& g : all) {
		int u = KU[g.k];
		long tx = g.x + NKX[g.k], ty = g.y + NKY[g.k];
		L.reduce(tx, ty);
		if (!cls.insert((u64(u) << 40) | (u64(tx) << 20) | u64(ty)).second) continue;
		CERT.push_back({u, int(tx), int(ty)});
		for (int y = 0; y < OH[u]; ++y)
			for (uint32_t bits = OR[u][y]; bits; bits &= bits - 1) {
				long X = tx + __builtin_ctz(bits), Y = ty + y;
				L.reduce(X, Y);
				if (cnt[Y * L.A + X]++) return false;
				++covered;
			}
	}
	CERT_A = L.A, CERT_B = L.B, CERT_C = L.C;
	return covered == area;
}

// Choose, for every cell edge-adjacent to the shape, the copy across that edge: no overlaps, closed
// under inverse and under the relative position of two chosen copies that share an edge.
static long ISO_NODES = 0, ISO_LIMIT = 20000;
static u64 EDGE[2];  // halo cells edge-adjacent to the shape
static int shares_edge(int a, int b) {
	const Cp &p = CP[a], &q = CP[b];
	for (int d = 0; d < 8; d += 2)
		if (overlap(q.u, q.tx + DX[d], q.ty + DY[d], p.u, p.tx, p.ty)) return 1;
	return 0;
}
struct IsoState {
	u64 cov[2];
	u64 ex[MAXW];
	u64 in[MAXW];
	vector<int> chosen;
};
static bool iso_add(IsoState& s, int c) {
	if (c < 0) return false;
	if (s.in[c >> 6] >> (c & 63) & 1) return true;
	if (s.ex[c >> 6] >> (c & 63) & 1) return false;
	s.in[c >> 6] |= u64(1) << (c & 63);
	for (int w = 0; w < NW; ++w) s.ex[w] |= INC[c][w];
	s.ex[c >> 6] &= ~(u64(1) << (c & 63));
	s.cov[0] |= CP[c].cov[0], s.cov[1] |= CP[c].cov[1];
	size_t start = s.chosen.size();
	s.chosen.push_back(c);
	// closure, breadth first over the newly added copies
	for (size_t q = start; q < s.chosen.size(); ++q) {
		int a = s.chosen[q];
		Iso ga = iso_of(a);
		if (!iso_add(s, copy_index(inverse(ga)))) return false;
		for (size_t r = 0; r < s.chosen.size(); ++r) {
			int b = s.chosen[r];
			if (b == a || !shares_edge(a, b)) continue;
			Iso gb = iso_of(b);
			if (!iso_add(s, copy_index(compose(inverse(ga), gb)))) return false;
			if (!iso_add(s, copy_index(compose(inverse(gb), ga)))) return false;
		}
	}
	return true;
}
static int iso_tries;
static int iso_dfs(const IsoState& s) {
	if (++ISO_NODES > ISO_LIMIT) return -1;
	int best = -1, bc = 1 << 30;
	for (int h = 0; h < BASE.nh; ++h) {
		if (!(EDGE[h >> 6] >> (h & 63) & 1) || (s.cov[h >> 6] >> (h & 63) & 1)) continue;
		int cnt = 0;
		for (int c = 0; c < ncp; ++c)
			if ((CP[c].cov[h >> 6] >> (h & 63) & 1) && !(s.ex[c >> 6] >> (c & 63) & 1)) ++cnt;
		if (!cnt) return 0;
		if (cnt < bc) bc = cnt, best = h;
	}
	if (best < 0) {
		if (++iso_tries > 64) return -1;
		return torus_ok(s.chosen) ? 1 : 0;
	}
	for (int c = 0; c < ncp; ++c) {
		if (!(CP[c].cov[best >> 6] >> (best & 63) & 1) || (s.ex[c >> 6] >> (c & 63) & 1)) continue;
		IsoState t = s;
		if (!iso_add(t, c)) continue;
		int r = iso_dfs(t);
		if (r) return r;
	}
	return 0;
}

// ------------------------------------------------------------------------------- periodic tilings
// A tiling with k copies per period is an exact cover of the torus Z^2 / L for a lattice L of index k n.
// Every lattice of that index, in Hermite form (A, 0), (B, C), is tried with the shape itself pinned at
// the origin (any periodic tiling can be moved so that one of its copies is there); a lattice is dropped
// at once when a lattice vector lies in S - S, which would make the shape overlap its own translate.
struct Torus {
	int A, B, C, m;
	int at(int x, int y) const {
		int q = y >= 0 ? y / C : -((-y + C - 1) / C);
		y -= q * C, x -= q * B;
		x %= A;
		if (x < 0) x += A;
		return y * A + x;
	}
};
static long TOR_NODES = 0, TOR_LIMIT = 4000, N_LATTICES = 0;
static int TOR_K = 0, PER_K = 8;
constexpr int TW = 4;  // torus up to 256 cells
// Cells of copy u at (px, py) on the torus, or false when it meets `used` or itself.
static bool tor_place(const Torus& T, int u, int px, int py, const u64* used, u64* out) {
	for (int w = 0; w < TW; ++w) out[w] = 0;
	for (int y = 0; y < OH[u]; ++y)
		for (uint32_t bits = OR[u][y]; bits; bits &= bits - 1) {
			int c = T.at(px + __builtin_ctz(bits), py + y);
			u64 b = u64(1) << (c & 63);
			if ((used[c >> 6] | out[c >> 6]) & b) return false;
			out[c >> 6] |= b;
		}
	return true;
}
// Copies placed so far (orientation, position on the torus). Two copies that touch in the lifted tiling
// stand in a relative position a^-1 b that is a copy around the shape in some tiling, so it must be one
// of the live copies (for any choice of a among the isometries that make it).
static int PU[64], PX_[64], PY[64], NPL;
static bool tor_neighbours_ok(const Torus& T, int u, int px, int py) {
	int k = UK[u];
	for (int q = 0; q < NPL; ++q) {
		int kq = UK[PU[q]];
		Iso gq_inv = inverse(Iso{kq, PX_[q] - NKX[kq], PY[q] - NKY[kq]});
		int dx0 = px - PX_[q], dy0 = py - PY[q];
		for (int j = -(40 / T.C) - 1; j <= 40 / T.C + 1; ++j) {
			int dy = dy0 + j * T.C;
			if (dy < -34 || dy > 34) continue;
			int bx = dx0 + j * T.B;
			int i0 = (-34 - bx) / T.A - 1, i1 = (34 - bx) / T.A + 1;
			for (int i = i0; i <= i1; ++i) {
				int dx = bx + i * T.A;
				if (dx < -34 || dx > 34 || (!dx && !dy && u == PU[q])) continue;  // the copy itself
				bool touch = false;
				for (int d = 0; d < 8 && !touch; ++d) touch = overlap(u, dx + DX[d], dy + DY[d], PU[q], 0, 0);
				if (!touch) continue;
				Iso r = compose(gq_inv, Iso{k, PX_[q] + dx - NKX[k], PY[q] + dy - NKY[k]});
				if (copy_index(r) < 0) return false;
			}
		}
	}
	return true;
}
static int tor_dfs(const Torus& T, const u64* used) {
	if (++TOR_NODES > TOR_LIMIT) return -1;
	int c = -1;
	for (int w = 0; w < TW && c < 0; ++w) {
		u64 free_ = ~used[w];
		if (w * 64 + 64 > T.m) free_ &= T.m - w * 64 >= 64 ? ~u64(0) : (u64(1) << std::max(0, T.m - w * 64)) - 1;
		if (free_) c = w * 64 + __builtin_ctzll(free_);
	}
	if (c < 0) {
		CERT.clear();
		for (int q = 0; q < NPL; ++q) CERT.push_back({PU[q], PX_[q], PY[q]});
		CERT_A = T.A, CERT_B = T.B, CERT_C = T.C;
		return 1;
	}
	int cx = c % T.A, cy = c / T.A;
	u64 pl[TW], nx[TW];
	for (int u = 0; u < nu; ++u)
		for (int y = 0; y < OH[u]; ++y)
			for (uint32_t bits = OR[u][y]; bits; bits &= bits - 1) {
				int px = cx - __builtin_ctz(bits), py = cy - y;
				if (!tor_place(T, u, px, py, used, pl)) continue;
				if (!tor_neighbours_ok(T, u, px, py)) continue;
				for (int w = 0; w < TW; ++w) nx[w] = used[w] | pl[w];
				PU[NPL] = u, PX_[NPL] = px, PY[NPL] = py, ++NPL;
				int r = tor_dfs(T, nx);
				--NPL;
				if (r) return r;
			}
	return 0;
}
static bool periodic(int kmax) {
	const u64* D = tab(0, 0);
	// offsets v where S + v touches S: (S dilated by one cell) - S
	static u64 TCH[128];
	memset(TCH, 0, sizeof TCH);
	for (int by = 0; by < OH[0]; ++by)
		for (uint32_t bits = OR[0][by]; bits; bits &= bits - 1) {
			int bx = __builtin_ctz(bits);
			for (int y = -1; y <= OH[0]; ++y) {
				u64 r = 0;
				for (int dy = -1; dy <= 1; ++dy)
					if (unsigned(y + dy) < unsigned(OH[0])) r |= u64(OR[0][y + dy]);
				r <<= 1;  // cell x at bit x + 1, so that x = -1 fits
				r = (r << 1) | r | (r >> 1);
				TCH[y - by + 64] |= (r << (32 - bx)) >> 1;
			}
		}
	for (int k = 2; k <= kmax; ++k) {
		int m = k * N;
		if (m > 64 * TW) break;
		for (int A = 1; A <= m; ++A) {
			if (m % A) continue;
			int C = m / A;
			for (int B = 0; B < A; ++B) {
				// a lattice vector inside S - S (|dx| < 32, |dy| < 64) rules the lattice out
				bool bad = false;
				for (int j = -(63 / C); j <= 63 / C && !bad; ++j)
					for (int i = -((32 + std::abs(j * B)) / A) - 1; i <= (32 + std::abs(j * B)) / A + 1 && !bad; ++i) {
						if (!i && !j) continue;
						int dx = i * A + j * B, dy = j * C;
						if (unsigned(dx + 32) >= 64 || unsigned(dy + 64) >= 128) continue;
						if (D[dy + 64] >> (dx + 32) & 1) bad = true;
						// a translate touching the shape is a neighbour in the tiling: it must be a live copy
						else if ((TCH[dy + 64] >> (dx + 32) & 1) && cidx(0, dx, dy) < 0) bad = true;
					}
				if (bad) continue;
				++N_LATTICES;
				Torus T{A, B, C, m};
				u64 used[TW] = {}, pl[TW];
				if (!tor_place(T, 0, 0, 0, used, pl)) continue;
				TOR_NODES = 0;
				PU[0] = 0, PX_[0] = 0, PY[0] = 0, NPL = 1;
				if (!tor_neighbours_ok(T, 0, 0, 0)) continue;  // the shape against its own translates
				if (tor_dfs(T, pl) == 1) { TOR_K = k; return true; }
			}
		}
	}
	return false;
}

// ------------------------------------------------------------------------------- two coronas
// A first-corona copy P lies in a 2-corona only when P's own halo can be covered by copies missing the
// shape and P, which at the shape's halo must be values still alive there. Copies that fail are removed
// and the shape's net propagated again, to a fixpoint. A wipe-out proves there is no 2-corona.
static long N_SUB = 0;
static int level2() {
	for (int round = 0; round < 6; ++round) {
		if (!collect(false)) return -1;
		int killed = 0;
		for (int c = 0; c < ncp; ++c) {
			++N_SUB;
			int ou[2] = {CP[c].u, 0}, ox[2] = {CP[c].tx, 0}, oy[2] = {CP[c].ty, 0};
			SUB.setup(2, ou, ox, oy, 1, &BASE);
			if (SUB.propagate()) BASE.kill(CP[c].u, CP[c].tx, CP[c].ty), ++killed;
		}
		if (!killed) return 0;
		if (BASE.propagate()) return 1;
	}
	return 0;
}
// Every first corona over the copies still alive, each checked on its own: consistency on the halo of
// the patch (the shape and that corona as obstacles). 1 when every corona wipes out (no 2-corona),
// 0 when one survives, -1 when there are too many coronas to look at.
static long N_CORONAS = 0, CORONA_CAP = 2000;
static int every_corona() {
	if (!collect(true)) return -1;
	int ou[NetT<1, 1>::MAXOB], ox[NetT<1, 1>::MAXOB], oy[NetT<1, 1>::MAXOB], depth = 1, verdict = 1;
	ou[0] = 0, ox[0] = 0, oy[0] = 0;
	long seen = 0;
	NODES = 0;
	auto go = [&](auto&& self, u64 c0, u64 c1, const u64* ex) -> bool {  // false: stop
		if (++NODES > NODE_LIMIT) { verdict = -1; return false; }
		int best = -1, bc = 1 << 30;
		for (int h = 0; h < BASE.nh; ++h) {
			if ((h < 64 ? c0 : c1) >> (h & 63) & 1) continue;
			int cnt = 0;
			for (int c = 0; c < ncp; ++c)
				if ((CP[c].cov[h >> 6] >> (h & 63) & 1) && !(ex[c >> 6] >> (c & 63) & 1)) ++cnt;
			if (!cnt) return true;
			if (cnt < bc) bc = cnt, best = h;
		}
		if (best < 0) {
			++N_CORONAS;
			if (++seen > CORONA_CAP || depth > NetT<1, 1>::MAXOB) { verdict = -1; return false; }
			if (!PATCH.setup(depth, ou, ox, oy, depth, nullptr) || !PATCH.propagate()) { verdict = 0; return false; }
			return true;
		}
		u64 nx[MAXW];
		for (int c = 0; c < ncp; ++c) {
			if (!(CP[c].cov[best >> 6] >> (best & 63) & 1) || (ex[c >> 6] >> (c & 63) & 1)) continue;
			for (int w = 0; w < NW; ++w) nx[w] = ex[w] | INC[c][w];
			ou[depth] = CP[c].u, ox[depth] = CP[c].tx, oy[depth] = CP[c].ty, ++depth;
			bool more = self(self, c0 | CP[c].cov[0], c1 | CP[c].cov[1], nx);
			--depth;
			if (!more) return false;
		}
		return true;
	};
	u64 ex[MAXW] = {};
	go(go, 0, 0, ex);
	return verdict;
}

// ------------------------------------------------------------------------------- classification
enum Verdict { H0, TILER, H1, UNDECIDED };
static const char* VNAME[] = {"0", "T", "1", "?"};
static double T_AC = 0, T_ISO = 0, T_COR = 0, T_L2 = 0, T_PER = 0;

static Verdict classify(const vector<std::pair<int, int>>& cells) {
	double t0 = now();
	load(cells);
	reset_tables();
	int zero[1] = {0};
	BASE.setup(1, zero, zero, zero, 1, nullptr);
	bool h0 = BASE.propagate();
	double t1 = now();
	T_AC += t1 - t0;
	if (h0) return H0;
	BASE.build_all();
	if (!collect(true)) return UNDECIDED;
	EDGE[0] = EDGE[1] = 0;
	for (int h = 0; h < BASE.nh; ++h)
		for (int d = 0; d < 8; d += 2)
			if (cell_of(0, BASE.hx[h] + DX[d], BASE.hy[h] + DY[d])) EDGE[h >> 6] |= u64(1) << (h & 63);
	IsoState s{};
	ISO_NODES = 0, iso_tries = 0;
	int iso = iso_dfs(s);
	double t2 = now();
	T_ISO += t2 - t1;
	if (iso == 1) return TILER;
	u64 ex[MAXW] = {};
	NODES = 0;
	int cor = corona_dfs(0, 0, ex);
	double t3 = now();
	T_COR += t3 - t2;
	if (cor == 0) return H0;
	int l2 = cor == 1 ? level2() : 0;
	double t4 = now();
	T_L2 += t4 - t3;
	t3 = t4;
	if (l2 == 1) return H1;
	if (cor == 1 && every_corona() == 1) { T_L2 += now() - t4; return H1; }
	t4 = now();
	bool per = periodic(PER_K);
	T_PER += now() - t4;
	return per ? TILER : UNDECIDED;
}

// ------------------------------------------------------------------------------- enumeration
// Redelmeier's algorithm for fixed polyominoes; a fixed polyomino is kept when it is the canonical
// representative of its free class (least row encoding over the eight orientations, among those
// with width <= height).
static bool canonical(const int* xs, const int* ys, int n) {
	int mx = 1 << 30, my = 1 << 30, Mx = -(1 << 30), My = -(1 << 30);
	for (int i = 0; i < n; ++i) mx = std::min(mx, xs[i]), my = std::min(my, ys[i]), Mx = std::max(Mx, xs[i]), My = std::max(My, ys[i]);
	int w = Mx - mx + 1, h = My - my + 1;
	if (w > h) return false;  // its quarter turn has width < height
	uint32_t base[MAXN] = {};
	for (int i = 0; i < n; ++i) base[ys[i] - my] |= 1u << (xs[i] - mx);
	for (int k = 1; k < 8; ++k) {
		// only the orientations that keep width <= height compete
		if (((k & 1) ? h : w) != w) continue;
		uint32_t r[MAXN] = {};
		int ax = 1 << 30, ay = 1 << 30, tx[MAXN], ty[MAXN];
		for (int i = 0; i < n; ++i) rot(k, xs[i] - mx, ys[i] - my, tx[i], ty[i]), ax = std::min(ax, tx[i]), ay = std::min(ay, ty[i]);
		for (int i = 0; i < n; ++i) r[ty[i] - ay] |= 1u << (tx[i] - ax);
		if (memcmp(r, base, sizeof(uint32_t) * h) < 0) return false;
	}
	return true;
}

static bool hole_free(const int* xs, const int* ys, int n) {
	int mx = 1 << 30, my = 1 << 30, Mx = -(1 << 30), My = -(1 << 30);
	for (int i = 0; i < n; ++i) mx = std::min(mx, xs[i]), my = std::min(my, ys[i]), Mx = std::max(Mx, xs[i]), My = std::max(My, ys[i]);
	int w = Mx - mx + 3, h = My - my + 3;  // one empty cell of margin all round
	u64 occ[MAXN + 2] = {}, reach[MAXN + 2] = {};
	for (int i = 0; i < n; ++i) occ[ys[i] - my + 1] |= u64(1) << (xs[i] - mx + 1);
	u64 full = (w >= 64 ? ~u64(0) : (u64(1) << w) - 1);
	reach[0] = full & ~occ[0];
	bool grew = true;
	while (grew) {
		grew = false;
		for (int y = 0; y < h; ++y) {
			u64 nb = reach[y];
			if (y > 0) nb |= reach[y - 1];
			if (y + 1 < h) nb |= reach[y + 1];
			nb &= full & ~occ[y];
			while (true) {  // spread along the row
				u64 s = (nb | (nb << 1) | (nb >> 1)) & full & ~occ[y];
				if (s == nb) break;
				nb = s;
			}
			if (nb != reach[y]) reach[y] = nb, grew = true;
		}
	}
	int empty = 0, got = 0;
	for (int y = 0; y < h; ++y) empty += __builtin_popcountll(full & ~occ[y]), got += __builtin_popcountll(reach[y]);
	return empty == got;
}

// Untried-set recursion (Redelmeier 1981) over cells (x, y) with y > 0, or y = 0 and x >= 0. The
// subtrees rooted at depth `split` are dealt round robin to PARTS workers.
template <class F>
static void redelmeier(int n, long part, long parts, int split, F&& visit) {
	constexpr int OX = MAXN + 1, WIDTH = 2 * MAXN + 3, MAXU = 4 * MAXN + 4;
	static char seen[MAXN + 2][WIDTH];
	memset(seen, 0, sizeof seen);
	static int ux[MAXN + 1][MAXU], uy[MAXN + 1][MAXU];
	int xs[MAXN], ys[MAXN];
	long counter = 0;
	auto go = [&](auto&& self, int size, int nu0) -> void {
		int* UX = ux[size];
		int* UY = uy[size];
		for (int nu1 = nu0; nu1 > 0;) {
			int x = UX[--nu1], y = UY[nu1];
			xs[size] = x, ys[size] = y;
			if (size + 1 == n) { visit(xs, ys, n); continue; }
			if (size + 1 == split && (counter++ % parts) != part) continue;
			int* NX = ux[size + 1];
			int* NY = uy[size + 1];
			memcpy(NX, UX, sizeof(int) * nu1), memcpy(NY, UY, sizeof(int) * nu1);
			int m = nu1, added[4][2], na = 0;
			const int d[4][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
			for (auto& dd : d) {
				int X = x + dd[0], Y = y + dd[1];
				if (Y < 0 || (Y == 0 && X < 0) || seen[Y][X + OX]) continue;
				seen[Y][X + OX] = 1;
				NX[m] = X, NY[m] = Y, ++m;
				added[na][0] = X, added[na][1] = Y, ++na;
			}
			self(self, size + 1, m);
			for (int a = 0; a < na; ++a) seen[added[a][1]][added[a][0] + OX] = 0;
		}
	};
	seen[0][OX] = 1;  // the root cell is taken
	ux[0][0] = 0, uy[0][0] = 0;
	go(go, 0, 1);
}

static void print_shape(const int* xs, const int* ys, int n) {
	// free_heesch line: unit squares with corners (x, 0, 0, y)
	std::ostringstream os;
	os << n;
	for (int i = 0; i < n; ++i) {
		int x = xs[i], y = ys[i];
		os << " 4 " << x << " 0 0 " << y << " " << x + 1 << " 0 0 " << y << " " << x + 1 << " 0 0 " << y + 1 << " " << x << " 0 0 " << y + 1;
	}
	std::cout << os.str() << "\n";
}

static vector<std::pair<int, int>> read_shape(const std::string& line) {
	std::istringstream is(line);
	int nc;
	is >> nc;
	vector<std::pair<int, int>> cells;
	for (int i = 0; i < nc; ++i) {
		int nv;
		is >> nv;
		int mx = 1 << 30, my = 1 << 30;
		for (int k = 0; k < nv; ++k) {
			int a, b, c, d;
			is >> a >> b >> c >> d;
			mx = std::min(mx, a), my = std::min(my, d);
		}
		cells.push_back({mx, my});
	}
	return cells;
}

// A tiler's certificate as one JSON line: the shape's cells, the lattice, and each copy in the period
// as the map (x, y) -> (a x + b y + c, d x + e y + f) on cell coordinates.
static void print_cert() {
	std::ostringstream os;
	os << "{\"c\":[";
	bool first = true;
	for (int y = 0; y < OH[0]; ++y)
		for (uint32_t bits = OR[0][y]; bits; bits &= bits - 1) os << (first ? "" : ",") << __builtin_ctz(bits) << "," << y, first = false;
	os << "],\"l\":[" << CERT_A << "," << CERT_B << "," << CERT_C << "],\"k\":[";
	for (size_t i = 0; i < CERT.size(); ++i) {
		auto [u, tx, ty] = CERT[i];
		int k = UK[u], a, d, b, e;
		rot(k, 1, 0, a, d), rot(k, 0, 1, b, e);
		os << (i ? "," : "") << a << "," << b << "," << tx - NKX[k] << "," << d << "," << e << "," << ty - NKY[k];
	}
	os << "]}";
	puts(os.str().c_str());
}

int main(int argc, char** argv) {
	init_group();
	memset(CIDX, -1, sizeof CIDX);
	std::string mode = argc > 1 ? argv[1] : "test";
	long count[4] = {};
	if (mode == "test" || mode == "deep" || mode == "deepcert") {
		if (mode != "test") PER_K = 16, TOR_LIMIT = 400000;  // longer periods, for the shapes the census left
		std::string line;
		long n = 0;
		double t0 = now();
		while (std::getline(std::cin, line)) {
			if (line.empty()) continue;
			Verdict v = classify(read_shape(line));
			++count[v], ++n;
			if (mode == "deepcert" && v == TILER) print_cert();
			else puts(VNAME[v]);
		}
		double t = now() - t0;
		fprintf(stderr, "%ld shapes: H0 %ld, tilers %ld, H1 %ld, undecided %ld; %.1f us/shape (consistency %.1f, isohedral %.1f, corona %.1f, level 2 %.1f, periodic %.1f; %.1f lattices, %.1f coronas)\n", n, count[H0], count[TILER], count[H1], count[UNDECIDED],
		        1e6 * t / n, 1e6 * T_AC / n, 1e6 * T_ISO / n, 1e6 * T_COR / n, 1e6 * T_L2 / n, 1e6 * T_PER / n, double(N_LATTICES) / n, double(N_CORONAS) / n);
		return 0;
	}
	int n = atoi(argv[2]);
	long part = argc > 3 ? atol(argv[3]) : 0, parts = argc > 4 ? atol(argv[4]) : 1;
	long every = mode == "sample" ? atol(argv[5]) : 0;
	int split = std::min(n - 1, 11);
	long fixed = 0, free_ = 0, holefree = 0;
	double t0 = now();
	vector<std::pair<int, int>> cells(n);
	redelmeier(n, part, parts, split, [&](const int* xs, const int* ys, int k) {
		++fixed;
		if (!canonical(xs, ys, k)) return;
		++free_;
		if (!hole_free(xs, ys, k)) return;
		++holefree;
		if (every) {
			if (holefree % every == 0) print_shape(xs, ys, k);
			return;
		}
		if (mode != "run" && mode != "tilers") return;
		for (int i = 0; i < k; ++i) cells[i] = {xs[i], ys[i]};
		Verdict v = classify(cells);
		++count[v];
		if (mode == "tilers") {
			if (v == TILER) print_cert();
		} else if (v == UNDECIDED)
			print_shape(xs, ys, k);
	});
	fprintf(stderr, "{\"n\":%d,\"part\":%ld,\"parts\":%ld,\"fixed\":%ld,\"free\":%ld,\"holefree\":%ld,\"h0\":%ld,\"tilers\":%ld,\"h1\":%ld,\"undecided\":%ld,\"s\":%.2f}\n", n, part, parts, fixed, free_, holefree,
	        count[H0], count[TILER], count[H1], count[UNDECIDED], now() - t0);
}
