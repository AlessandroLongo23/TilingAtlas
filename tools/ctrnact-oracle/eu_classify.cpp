// eu_classify — wallpaper + Bravais classification of 12-direction period cells in int32 over ℤ[ω]
// (ω=ζ₁₂). Native port of lib/classes/symmetry/nClassify.ts (blind mode), validated label-for-label
// against it (and thus against the exact analyzeSymmetry). Reads a flat tiling stream on stdin, writes
// id,k,lattice,group,orbifold CSV on stdout.
//
// Flat input, one tiling per line (whitespace-separated):
//   <id> <k> <T1a T1b T1c T1d> <T2a T2b T2c T2d> <nseed> <s0a s0b s0c s0d  s1a ...>
// The cells JSON that develop.py emits is converted with cells_to_flat.py.
//
// Sound in int: cells are rank-4 integer vectors with |coeff| ≤ ~210 (magnitude probe), every product
// ≤ ~3.5e5 — int32 has 26e12× headroom. Every symmetry decision is exact integer equality; only the
// lattice length/angle test uses double (as analyzeSymmetry does).
#include <cstdio>
#include <cstdint>
#include <cmath>
#include <array>
#include <vector>
#include <string>
#include <unordered_set>
#include <algorithm>
#include <iostream>
#include <sstream>

using std::array;
using std::vector;
using std::string;
using Vec = array<int, 4>;

static const double S3 = std::sqrt(3.0);

// ω⁴ = ω²−1: ×ω is this ℤ-linear map; conj is ω↦ω⁻¹. Both preserve ℤ[ω].
static inline Vec mulw(const Vec& v) { return {-v[3], v[0], v[1] + v[3], v[2]}; }
static inline Vec conjv(const Vec& v) { return {v[0] + v[2], v[1], -v[2], -v[1] - v[3]}; }
static inline Vec addv(const Vec& a, const Vec& b) { return {a[0]+b[0], a[1]+b[1], a[2]+b[2], a[3]+b[3]}; }
static inline Vec subv(const Vec& a, const Vec& b) { return {a[0]-b[0], a[1]-b[1], a[2]-b[2], a[3]-b[3]}; }
static inline bool isZero(const Vec& v) { return v[0]==0 && v[1]==0 && v[2]==0 && v[3]==0; }
static inline bool eqv(const Vec& a, const Vec& b) { return a[0]==b[0] && a[1]==b[1] && a[2]==b[2] && a[3]==b[3]; }
static inline Vec mulwPow(Vec v, int m) { m = ((m % 12) + 12) % 12; for (int i = 0; i < m; i++) v = mulw(v); return v; }
static inline Vec addLC(const Vec& t, int a, const Vec& T1, int b, const Vec& T2) {
	return {t[0]+a*T1[0]+b*T2[0], t[1]+a*T1[1]+b*T2[1], t[2]+a*T1[2]+b*T2[2], t[3]+a*T1[3]+b*T2[3]};
}
// ℤ[ω] multiply via ω-power expansion.
static inline Vec zmul(const Vec& p, const Vec& q) {
	Vec acc{0,0,0,0};
	for (int i = 0; i < 4; i++) if (p[i]) { Vec t = mulwPow(q, i); for (int j = 0; j < 4; j++) acc[j] += p[i]*t[j]; }
	return acc;
}
static inline double xOf(const Vec& v) { return v[0] + v[2]/2.0 + v[1]*S3/2.0; }
static inline double yOf(const Vec& v) { return v[3] + v[1]/2.0 + v[2]*S3/2.0; }

// w = α·T1 + β·T2 for integers α,β? Solve in ℂ (double), round, verify EXACTLY. O(1).
static bool inLattice(const Vec& T1, const Vec& T2, const Vec& w) {
	double ax=xOf(T1), ay=yOf(T1), bx=xOf(T2), by=yOf(T2), wx=xOf(w), wy=yOf(w);
	double det = ax*by - ay*bx;
	if (std::fabs(det) < 1e-9) return false;
	long al = std::lround((wx*by - wy*bx)/det);
	long be = std::lround((ax*wy - ay*wx)/det);
	Vec lc = addLC(Vec{0,0,0,0}, (int)al, T1, (int)be, T2);
	return eqv(lc, w);
}

template <class G>
static bool preserves(const Vec& T1, const Vec& T2, const vector<Vec>& seed, G g) {
	for (const auto& v : seed) {
		Vec gv = g(v);
		bool ok = false;
		for (const auto& w : seed) if (inLattice(T1, T2, subv(gv, w))) { ok = true; break; }
		if (!ok) return false;
	}
	return true;
}

static const int CRYST_ROT[7] = {2,3,4,6,8,9,10};
static inline int igcd(int a, int b) { a=std::abs(a); b=std::abs(b); while(b){int t=a%b;a=b;b=t;} return a; }
static inline int orderOfRot(int m) { return 12 / igcd(m, 12); }
static inline bool rotPreservesLattice(const Vec& T1, const Vec& T2, int m) {
	return inLattice(T1, T2, mulwPow(T1, m)) && inLattice(T1, T2, mulwPow(T2, m));
}
static inline bool refPreservesLattice(const Vec& T1, const Vec& T2, int m) {
	return inLattice(T1, T2, mulwPow(conjv(T1), m)) && inLattice(T1, T2, mulwPow(conjv(T2), m));
}

static int rotNMax(const Vec& T1, const Vec& T2, const vector<Vec>& seed) {
	const Vec& v0 = seed[0];
	int nMax = 1;
	for (int m : CRYST_ROT) {
		int order = orderOfRot(m);
		if (order <= nMax) continue;
		if (!rotPreservesLattice(T1, T2, m)) continue;
		for (const auto& w : seed) {
			Vec t = subv(w, mulwPow(v0, m));
			if (preserves(T1, T2, seed, [&](const Vec& z){ return addv(mulwPow(z, m), t); })) { if (order > nMax) nMax = order; break; }
		}
	}
	return nMax;
}

// hasMirror / hasGlide / mirror-angle count. Per reflection power m, collect deduped-mod-Λ translation
// reps that are symmetries, then WINDOW each rep over Λ-translates: τ = ω^m·t̄+t depends on the translate
// (τ(t0+aT1+bT2)=τ(t0)+τ_lin(aT1+bT2)), so a power carries a mirror iff SOME translate has τ=0 — the ±5
// window analyzeSymmetry uses. hasGlide is only consulted where there is no mirror (pgg/pg), where every
// glide is essential, so the offset/essential bookkeeping is not needed here.
static void reflectionInventory(const Vec& T1, const Vec& T2, const vector<Vec>& seed,
                                bool& hasMirror, bool& hasGlide, int& mAngles) {
	const Vec& v0 = seed[0];
	hasMirror = false; hasGlide = false; mAngles = 0;
	for (int m = 0; m < 12; m++) {
		if (!refPreservesLattice(T1, T2, m)) continue;
		vector<Vec> reps;
		for (const auto& w : seed) {
			Vec t = subv(w, mulwPow(conjv(v0), m));
			if (!preserves(T1, T2, seed, [&](const Vec& z){ return addv(mulwPow(conjv(z), m), t); })) continue;
			bool dup = false;
			for (const auto& r : reps) if (inLattice(T1, T2, subv(t, r))) { dup = true; break; }
			if (!dup) reps.push_back(t);
		}
		bool mirrorAtM = false, glideAtM = false;
		for (const auto& t0 : reps) {
			for (int a = -5; a <= 5 && !(mirrorAtM && glideAtM); a++)
				for (int b = -5; b <= 5 && !(mirrorAtM && glideAtM); b++) {
					Vec t = addLC(t0, a, T1, b, T2);
					Vec tau = addv(mulwPow(conjv(t), m), t);
					if (isZero(tau)) mirrorAtM = true; else glideAtM = true;
				}
			if (mirrorAtM && glideAtM) break;
		}
		if (mirrorAtM) { hasMirror = true; mAngles++; }
		if (glideAtM) hasGlide = true;
	}
}

// Exact p4m/p4g and p3m1/p31m split: does every top-order rotation centre lie on a mirror? Port of
// allTopCentersOnMirrorExact. c = num/D, D = 1 − ω^{m*}. Consulted only for nMax ∈ {3,4}.
static bool allTopCentersOnMirror(const Vec& T1, const Vec& T2, const vector<Vec>& seed, int nMax) {
	const Vec& v0 = seed[0];
	int mStar = -1;
	for (int m : CRYST_ROT) {
		if (orderOfRot(m) != nMax) continue;
		if (!rotPreservesLattice(T1, T2, m)) continue;
		bool sym = false;
		for (const auto& w : seed) {
			Vec t = subv(w, mulwPow(v0, m));
			if (preserves(T1, T2, seed, [&](const Vec& z){ return addv(mulwPow(z, m), t); })) { sym = true; break; }
		}
		if (sym) { mStar = m; break; }
	}
	if (mStar < 0) return false;
	const Vec ONE{1,0,0,0};
	Vec D = subv(ONE, mulwPow(ONE, mStar));
	Vec Dc = subv(ONE, mulwPow(ONE, (12 - mStar) % 12));
	vector<Vec> repsT;
	for (const auto& w : seed) {
		Vec t = subv(w, mulwPow(v0, mStar));
		if (!preserves(T1, T2, seed, [&](const Vec& z){ return addv(mulwPow(z, mStar), t); })) continue;
		bool dup = false;
		for (const auto& r : repsT) if (inLattice(T1, T2, subv(t, r))) { dup = true; break; }
		if (!dup) repsT.push_back(t);
	}
	Vec DT1 = zmul(D, T1), DT2 = zmul(D, T2);
	vector<Vec> centerNums;
	for (const auto& t : repsT)
		for (int a = -2; a <= 2; a++)
			for (int b = -2; b <= 2; b++) {
				Vec num = addLC(t, a, T1, b, T2);
				bool dup = false;
				for (const auto& mm : centerNums) if (inLattice(DT1, DT2, subv(num, mm))) { dup = true; break; }
				if (!dup) centerNums.push_back(num);
			}
	struct Refl { int m; Vec s0; };
	vector<Refl> refls;
	for (int m = 0; m < 12; m++) {
		if (!refPreservesLattice(T1, T2, m)) continue;
		for (const auto& w : seed) {
			Vec s0 = subv(w, mulwPow(conjv(v0), m));
			if (!preserves(T1, T2, seed, [&](const Vec& z){ return addv(mulwPow(conjv(z), m), s0); })) continue;
			bool dup = false;
			for (const auto& r : refls) if (r.m == m && inLattice(T1, T2, subv(s0, r.s0))) { dup = true; break; }
			if (!dup) refls.push_back({m, s0});
		}
	}
	if (refls.empty()) return false;
	Vec DDc = zmul(D, Dc);
	Vec DDcT1 = zmul(DDc, T1), DDcT2 = zmul(DDc, T2);
	for (const auto& num : centerNums) {
		bool on = false;
		for (const auto& r : refls) {
			Vec val = subv(subv(zmul(Dc, num), zmul(mulwPow(D, r.m), conjv(num))), zmul(r.s0, DDc));
			if (inLattice(DDcT1, DDcT2, val)) { on = true; break; }
		}
		if (!on) return false;
	}
	return true;
}

// ---- lattice shape ----
static bool intCombo(const Vec& w, const Vec& a, const Vec& b) {
	double ax=xOf(a), ay=yOf(a), bx=xOf(b), by=yOf(b), wx=xOf(w), wy=yOf(w);
	double det = ax*by - ay*bx;
	if (std::fabs(det) < 1e-9) return false;
	long al = std::lround((wx*by - wy*bx)/det), be = std::lround((ax*wy - ay*wx)/det);
	return eqv(addLC(Vec{0,0,0,0}, (int)al, a, (int)be, b), w);
}
static inline bool sameLat(const Vec& a, const Vec& b, const Vec& c, const Vec& d) {
	return intCombo(c,a,b) && intCombo(d,a,b) && intCombo(a,c,d) && intCombo(b,c,d);
}
static bool isOblique(const Vec& u, const Vec& v) {
	for (int m = 1; m < 12; m++) { if (m == 6) continue; if (sameLat(u, v, mulwPow(u, m), mulwPow(v, m))) return false; }
	for (int m = 0; m < 12; m++) if (sameLat(u, v, mulwPow(conjv(u), m), mulwPow(conjv(v), m))) return false;
	return true;
}
static void gaussReduce(Vec a, Vec b, Vec& ru, Vec& rv) {
	Vec u = a, v = b;
	auto m2 = [](const Vec& c){ double x=xOf(c), y=yOf(c); return x*x + y*y; };
	for (int it = 0; it < 64; it++) {
		if (m2(u) > m2(v)) { std::swap(u, v); continue; }
		double uu = m2(u);
		if (uu < 1e-12) break;
		double dot = xOf(u)*xOf(v) + yOf(u)*yOf(v);
		long t = std::lround(dot / uu);
		if (t == 0) break;
		v = Vec{v[0]-(int)t*u[0], v[1]-(int)t*u[1], v[2]-(int)t*u[2], v[3]-(int)t*u[3]};
	}
	ru = u; rv = v;
}
enum Lat { SQUARE, HEX, RHOMBIC, RECT, OBLIQUE };
static Lat classifyLattice(const Vec& T1, const Vec& T2) {
	if (isOblique(T1, T2)) return OBLIQUE;
	Vec ru, rv; gaussReduce(T1, T2, ru, rv);
	double ax=xOf(ru), ay=yOf(ru), bx=xOf(rv), by=yOf(rv);
	double lu = std::hypot(ax, ay), lv = std::hypot(bx, by);
	double ang = std::acos((ax*bx + ay*by)/(lu*lv)) * 180.0 / M_PI;
	bool eqLen = std::fabs(lu - lv) < 1e-6;
	bool a90 = std::fabs(ang - 90) < 1e-6;
	bool a60 = std::fabs(ang - 60) < 1e-6 || std::fabs(ang - 120) < 1e-6;
	if (eqLen && a60) return HEX;
	if (eqLen && a90) return SQUARE;
	if (eqLen) return RHOMBIC;
	if (a90) return RECT;
	return RHOMBIC;
}
static const char* latName(Lat l) {
	switch (l) { case SQUARE: return "square"; case HEX: return "hexagonal"; case RHOMBIC: return "rhombic"; case RECT: return "rectangular"; default: return "oblique"; }
}

static void identifyGroup(int nMax, bool hasMirror, bool hasGlide, int mAngles, bool allTopOnMirror,
                          bool isCentered, const char*& group, const char*& orbifold) {
	const char* g = "p1"; const char* o = "o";
	auto set = [&](const char* gg, const char* oo){ g = gg; o = oo; };
	switch (nMax) {
		case 2:
			if (!hasMirror) { if (hasGlide) set("pgg","22×"); else set("p2","2222"); }
			else if (isCentered) set("cmm","2*22");
			else if (mAngles >= 2) set("pmm","*2222"); else set("pmg","22*");
			break;
		case 3:
			if (!hasMirror) set("p3","333");
			else if (allTopOnMirror) set("p3m1","*333"); else set("p31m","3*3");
			break;
		case 4:
			if (!hasMirror) set("p4","442");
			else if (allTopOnMirror) set("p4m","*442"); else set("p4g","4*2");
			break;
		case 6:
			if (hasMirror) set("p6m","*632"); else set("p6","632");
			break;
		default:
			if (!hasMirror) { if (hasGlide) set("pg","××"); else set("p1","o"); }
			else if (isCentered) set("cm","*×"); else set("pm","**");
			break;
	}
	group = g; orbifold = o;
}

int main() {
	std::ios::sync_with_stdio(false);
	std::string line;
	std::ostringstream out;
	out << "id,k,lattice,group,orbifold\n";
	while (std::getline(std::cin, line)) {
		if (line.empty()) continue;
		std::istringstream ss(line);
		string id; int k, nseed;
		Vec T1, T2;
		if (!(ss >> id >> k)) continue;
		for (int i = 0; i < 4; i++) ss >> T1[i];
		for (int i = 0; i < 4; i++) ss >> T2[i];
		ss >> nseed;
		vector<Vec> seed(nseed);
		for (int s = 0; s < nseed; s++) for (int i = 0; i < 4; i++) ss >> seed[s][i];
		if (nseed == 0) { out << id << ',' << k << ",ERROR,ERROR,empty\n"; continue; }

		int nMax = rotNMax(T1, T2, seed);
		bool hasMirror, hasGlide; int mAngles;
		reflectionInventory(T1, T2, seed, hasMirror, hasGlide, mAngles);
		bool allTopOnMirror = (nMax == 3 || nMax == 4) ? allTopCentersOnMirror(T1, T2, seed, nMax) : false;
		Lat lat = classifyLattice(T1, T2);
		const char *group, *orbifold;
		identifyGroup(nMax, hasMirror, hasGlide, mAngles, allTopOnMirror, lat == RHOMBIC, group, orbifold);
		out << id << ',' << k << ',' << latName(lat) << ',' << group << ',' << orbifold << '\n';
	}
	std::cout << out.str();
	return 0;
}
