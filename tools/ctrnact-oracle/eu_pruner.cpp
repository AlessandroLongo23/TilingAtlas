/*
 * eu_pruner.cpp — C++ port of work/pruner.py (Marek Čtrnáct's k-uniform pruner, adapted).
 * Faithful transliteration of the dedup core: decode(conway->glue graph) + simplify (WL
 * canonical-form test) + compare (isomorphism dedup, bucketed by signature). Reproduces the
 * pruner's exact distinct counts; ~30-50x faster (compiled vs CPython). Milestone-1 output is
 * decode.py-compatible (skips the .tes assembly + post-'---' conway, which decode ignores).
 *
 *   g++ -O2 -std=c++17 -o eu_pruner eu_pruner.cpp
 *   EU_OUT=<rawdir> EU_KMIN=1 EU_KMAX=11 ./eu_pruner
 */
#include <vector>
#include <string>
#include <set>
#include <unordered_map>
#include <map>
#include <fstream>
#include <sstream>
#include <iostream>
#include <algorithm>
#include <filesystem>
#include <cstdlib>
#include <cstdio>
#include <chrono>
#ifdef PROFILE
static double prof_decode = 0, prof_simpl = 0, prof_fpcmp = 0;
#endif

namespace fs = std::filesystem;
#include "pruner_tables.inc"

// ---------- global solution store (mirrors the Python globals) ----------
// Node indices live in [0, le); int16_t is lossless well past any reachable k. `label` was stored
// but never read (comparesolutions uses only the five arrays), so it is dropped, not narrowed.
struct Sol {
	std::vector<int16_t> rneig, lneig, lvert, mirro, glue;
};
static std::vector<Sol> sols;                 // every kept solution
static std::vector<std::string> siglist;      // distinct signatures
static std::vector<std::vector<int>> sollist; // sig index -> indices into sols
static std::unordered_map<std::string, int> sigIndex;
static std::string countsignature;

// ---------- string helpers ----------
static std::string edgelabel(const std::string& edge, int tile) {
	std::string m = edge;
	if (tile > 3) m += "@" + std::to_string(tile);
	else for (int i = 0; i < tile; i++) m += "'";
	return m;
}

// ---------- conway parsing ----------
static bool isnum(char c) { return c >= '0' && c <= '9'; }

// decipher a token like "*0''" or "0@5" -> (mirror, num, til)
struct Dec { bool mirror; int num; int til; };
static Dec decipher(const std::string& x) {
	std::string s = x + " ";
	size_t i = 0; Dec d{false, 0, 0};
	if (s[i] == '*') { d.mirror = true; i++; }
	while (isnum(s[i])) { d.num = d.num * 10 + (s[i] - '0'); i++; }
	while (s[i] == '\'') { d.til++; i++; }
	if (s[i] == '@') { i++; while (isnum(s[i])) { d.til = d.til * 10 + (s[i] - '0'); i++; } }
	return d;
}

static int findindex(const std::string& c) {
	for (size_t i = 0; i < c.size(); i++) if (c[i] == ')' || c[i] == ']') return (int)i;
	return -1;
}

// deciphersymbol: "[0]" or "(3 0')" -> [first, second]
static void deciphersymbol(const std::string& symbol, std::string& first, std::string& second) {
	bool mirror = symbol[0] == '[';
	first.clear();
	size_t ind = 1;
	auto stop = [](char c) { return c == ' ' || c == ')' || c == ']'; };
	while (!stop(symbol[ind])) { first += symbol[ind]; ind++; }
	if (symbol[ind] == ' ') {
		ind++; second.clear();
		while (symbol[ind] != ')' && symbol[ind] != ']') { second += symbol[ind]; ind++; }
	} else {
		second = first;
	}
	if (mirror) second = "*" + second;
}

// makeglue: build the glue array from the conway string
static std::vector<int> makeglue(const std::string& conway, const std::vector<int>& mirro,
                                 const std::vector<std::string>& label) {
	std::unordered_map<std::string, int> lidx;
	for (size_t i = 0; i < label.size(); i++) lidx[label[i]] = (int)i;
	std::vector<int> glue(mirro.size(), -1);
	std::string c = conway;
	while (c.size() > 1) {
		int ind = findindex(c);
		std::string symbol = c.substr(0, ind + 1);
		c = c.substr(ind + 1);
		std::string t0, t1;
		deciphersymbol(symbol, t0, t1);
		int k[2];
		const std::string* toks[2] = {&t0, &t1};
		for (int i = 0; i < 2; i++) {
			Dec w = decipher(*toks[i]);
			std::string st = (w.mirror ? "*" : "") + edgelabel(std::to_string(w.num), w.til);
			auto it = lidx.find(st);
			k[i] = (it == lidx.end() ? -1 : it->second);
		}
		glue[k[0]] = k[1];
		glue[k[1]] = k[0];
		glue[mirro[k[0]]] = mirro[k[1]];
		glue[mirro[k[1]]] = mirro[k[0]];
	}
	return glue;
}

// ---------- buildvertextypes: parse the "(3,3,6,6)A, (…)S6" line, set countsignature ----------
static std::vector<int> buildvertextypes(const std::string& vertypeline) {
	std::vector<int> vertextypes;
	std::string g = vertypeline + ", ";
	std::vector<std::string> sym2list;
	std::vector<int> sym2code;
	while (!g.empty()) {
		size_t ind = g.find(' ');
		if (ind == std::string::npos) break;
		std::string sym = g.substr(0, ind - 1);          // drop the comma before the space
		size_t sym2i = sym.find(')');
		std::string sym2 = sym.substr(0, sym2i + 1);
		auto it = std::find(sym2list.begin(), sym2list.end(), sym2);
		if (it == sym2list.end()) { sym2list.push_back(sym2); sym2code.push_back(1); }
		else sym2code[it - sym2list.begin()]++;
		g = g.substr(ind + 1);
		int ind2 = (int)(std::find(symbollist.begin(), symbollist.end(), sym) - symbollist.begin());
		vertextypes.push_back(ind2);
	}
	countsignature = std::to_string(sym2list.size());
	bool high = false;
	std::string secsig = " (";
	std::vector<int> codes = sym2code;
	while (!codes.empty()) {
		int mi = (int)(std::max_element(codes.begin(), codes.end()) - codes.begin());
		int m = codes[mi];
		if (m > 1) high = true;
		codes.erase(codes.begin() + mi);
		secsig += std::to_string(m);   // codcon(x) == str(x) always (Python bug is faithful)
	}
	secsig += ")";
	if (high) countsignature += secsig;
	return vertextypes;
}

// ---------- decode: vertypeline + conway -> full glue graph ----------
struct Graph {
	std::vector<int> rneig, lneig, mirro, lvert, glue;
	std::vector<std::string> label;
};
static Graph decode(const std::string& vertypeline, const std::string& conwayline) {
	Graph gph;
	std::vector<int> vt = buildvertextypes(vertypeline);
	for (size_t j = 0; j < vt.size(); j++) {
		int i = vt[j];
		int l = (int)gph.rneig.size();
		int sl = (int)rneiglistin[i].size();
		for (int gg = 0; gg < sl; gg++) {
			gph.rneig.push_back(l + rneiglistin[i][gg]);
			gph.lneig.push_back(l + lneiglistin[i][gg]);
			gph.mirro.push_back(l + mirrolistin[i][gg]);
			gph.lvert.push_back(lvertlistin[i][gg]);
			gph.label.push_back(edgelabel(labellistin[i][gg], (int)j));
		}
	}
	gph.glue = makeglue(conwayline, gph.mirro, gph.label);
	return gph;
}

// ---------- simplify: bitset WL refinement; true = "simplest" (no non-trivial equivalence) ----------
// Faithful reimplementation of the Python std::set version, using per-node bitsets (word-parallel
// membership/clear, zero heap churn). The refinement fixpoint is order-independent, so this yields
// identical results; reusable static workspace avoids per-call allocation over the ~150k blocks.
static bool simplify(const Graph& g) {
	int le = (int)g.rneig.size();
	int nw = (le + 63) >> 6;
	static std::vector<uint64_t> A, snap;
	A.assign((size_t)le * nw, 0);
	snap.resize(nw);
	auto row = [&](int i) -> uint64_t* { return &A[(size_t)i * nw]; };
	auto test = [&](int i, int j) -> bool { return (row(i)[j >> 6] >> (j & 63)) & 1ULL; };
	uint64_t lastmask = (le & 63) ? ((1ULL << (le & 63)) - 1) : ~0ULL;
	for (int i = 0; i < le; i++) {
		uint64_t* r = row(i);
		for (int w = 0; w < nw; w++) r[w] = ~0ULL;
		r[nw - 1] = lastmask;
	}
	bool change = true;
	while (change) {
		change = false;
		for (int i = 0; i < le; i++) {
			uint64_t* ri = row(i);
			for (int w = 0; w < nw; w++) snap[w] = ri[w];          // snapshot alias[i] (Python: ali = copy)
			for (int w = 0; w < nw; w++) {
				uint64_t bits = snap[w];
				while (bits) {
					int j = (w << 6) + __builtin_ctzll(bits);
					bits &= bits - 1;
					if (g.lvert[i] != g.lvert[j]
					    || !test(j, i)
					    || !test(g.mirro[i], g.mirro[j])
					    || !test(g.glue[i], g.glue[j])
					    || !test(g.rneig[i], g.rneig[j])
					    || !test(g.lneig[i], g.lneig[j])) {
						ri[j >> 6] &= ~(1ULL << (j & 63));
						change = true;
					}
				}
			}
		}
	}
	for (int i = 0; i < le; i++) {                                 // nun = some node not a singleton
		uint64_t* r = row(i); int c = 0;
		for (int w = 0; w < nw; w++) c += __builtin_popcountll(r[w]);
		if (c != 1) return false;
	}
	return true;
}

// ---------- comparesolutions: is graph x isomorphic to stored solution `sol`? (bitset WL) ----------
// Combined 2·le-node graph (x = nodes 0..le-1, sol = le..2le-1); refine the cross-alias partition.
// nun (some node keeps >1 alias) ⇒ a consistent x↔sol mapping survives ⇒ duplicate. Bitset +
// reusable buffers: this is called once per duplicate block (tens of thousands), so std::set was
// the 50s bottleneck; identical logic, ~50x cheaper per call.
static bool comparesolutions(const Graph& x, int solIdx) {
	const Sol& s = sols[solIdx];
	int le = (int)x.rneig.size();
	if ((int)s.rneig.size() != le) return false;   // same signature ⇒ same le; guard anyway
	int n = 2 * le, nw = (n + 63) >> 6;
	static std::vector<int> rn, ln, mi, lv, gl;
	rn.resize(n); ln.resize(n); mi.resize(n); lv.resize(n); gl.resize(n);
	for (int i = 0; i < le; i++) {
		rn[i] = x.rneig[i]; ln[i] = x.lneig[i]; mi[i] = x.mirro[i]; lv[i] = x.lvert[i]; gl[i] = x.glue[i];
		rn[le + i] = le + s.rneig[i]; ln[le + i] = le + s.lneig[i];
		mi[le + i] = le + s.mirro[i]; lv[le + i] = s.lvert[i]; gl[le + i] = le + s.glue[i];
	}
	static std::vector<uint64_t> A, snap;
	A.assign((size_t)n * nw, 0);
	snap.resize(nw);
	auto row = [&](int i) -> uint64_t* { return &A[(size_t)i * nw]; };
	auto test = [&](int i, int j) -> bool { return (row(i)[j >> 6] >> (j & 63)) & 1ULL; };
	auto setb = [&](int i, int j) { row(i)[j >> 6] |= (1ULL << (j & 63)); };
	for (int i = 0; i < le; i++) {                       // alias[i] = {le..2le-1} ∪ {i}
		uint64_t* r = row(i);
		for (int j = le; j < n; j++) r[j >> 6] |= (1ULL << (j & 63));
		setb(i, i);
	}
	for (int i = 0; i < le; i++) {                       // alias[le+i] = {0..le-1} ∪ {le+i}
		uint64_t* r = row(le + i);
		for (int j = 0; j < le; j++) r[j >> 6] |= (1ULL << (j & 63));
		setb(le + i, le + i);
	}
	bool change = true;
	while (change) {
		change = false;
		for (int i = 0; i < n; i++) {
			uint64_t* ri = row(i);
			for (int w = 0; w < nw; w++) snap[w] = ri[w];
			for (int w = 0; w < nw; w++) {
				uint64_t bits = snap[w];
				while (bits) {
					int j = (w << 6) + __builtin_ctzll(bits);
					bits &= bits - 1;
					if (lv[i] != lv[j]
					    || !test(j, i)
					    || !test(mi[i], mi[j])
					    || !test(gl[i], gl[j])
					    || !test(rn[i], rn[j])
					    || !test(ln[i], ln[j])) {
						ri[j >> 6] &= ~(1ULL << (j & 63));
						change = true;
					}
				}
			}
		}
	}
	for (int i = 0; i < n; i++) {                         // nun -> isomorphic (duplicate)
		uint64_t* r = row(i); int c = 0;
		for (int w = 0; w < nw; w++) c += __builtin_popcountll(r[w]);
		if (c != 1) return true;
	}
	return false;
}

// ---- isomorphism-invariant fingerprint (3-round WL color-refinement hash) ----
// Isomorphic graphs ⇒ identical fingerprint (the refinement is canonical), so bucketing by it
// NEVER separates real duplicates. comparesolutions remains the arbiter within a bucket, so the
// fingerprint only skips work — it cannot change the result. Purely a speed lever.
static inline uint64_t mix(uint64_t h, uint64_t x) {
	h ^= x + 0x9e3779b97f4a7c15ULL + (h << 6) + (h >> 2);
	return h;
}
static uint64_t fingerprint(const Graph& g) {
	int le = (int)g.rneig.size();
	std::vector<uint64_t> col(le), nc(le);
	for (int i = 0; i < le; i++) col[i] = 1469598103934665603ULL ^ (uint64_t)(g.lvert[i] + 1);
	for (int r = 0; r < 3; r++) {
		for (int i = 0; i < le; i++) {
			uint64_t h = col[i] * 1099511628211ULL;
			h = mix(h, col[g.mirro[i]] * 2 + 1);
			h = mix(h, col[g.glue[i]] * 2 + 3);
			h = mix(h, col[g.rneig[i]] * 2 + 5);
			h = mix(h, col[g.lneig[i]] * 2 + 7);
			nc[i] = h;
		}
		col.swap(nc);
	}
	std::sort(col.begin(), col.end());
	uint64_t f = (uint64_t)le;
	for (uint64_t c : col) f = mix(f, c);
	return f;
}

// store bucketed by (sigline, fingerprint): both are isomorphism invariants, so a real duplicate
// always shares both keys ⇒ comparesolutions is guaranteed to see it. Near-O(1) bucket size.
static std::unordered_map<std::string, std::vector<int>> bucket;
static std::string keyOf(const std::string& sigline, uint64_t fp) {
	return sigline + '\x01' + std::to_string(fp);
}

static bool compareToSeen(const Graph& g, const std::string& key) {
	auto it = bucket.find(key);
	if (it == bucket.end()) return false;
	for (int idx : it->second) if (comparesolutions(g, idx)) return true;
	return false;
}

static std::vector<int16_t> narrow(const std::vector<int>& v) { return {v.begin(), v.end()}; }

static void addsolution(const Graph& g, const std::string& key) {
	Sol s{ narrow(g.rneig), narrow(g.lneig), narrow(g.lvert), narrow(g.mirro), narrow(g.glue) };
	sols.push_back(std::move(s));
	bucket[key].push_back((int)sols.size() - 1);
}

// ---------- file processing ----------
static std::string filecodebase;
static std::string OUTDIR, PRUNEDDIR;
static long keptTotal = 0;

static std::vector<std::string> readlines(const std::string& path) {
	std::vector<std::string> v;
	std::ifstream f(path);
	std::string line;
	while (std::getline(f, line)) { if (!line.empty() && line.back() == '\r') line.pop_back(); v.push_back(line); }
	return v;
}

static long processfile(const std::string& fam) {
	std::string filecode = filecodebase + "_" + fam;
	std::string inpath = OUTDIR + "eusolver_" + filecode + ".txt";
	if (!fs::exists(inpath)) return 0;
	std::vector<std::string> P = readlines(inpath);
	std::ofstream globe(PRUNEDDIR + "eupruned_" + filecode + ".txt");
	size_t lc = 0, lpr = P.size();
	long kept = 0;
	while (lc < lpr) {
		lc++; if (lc >= lpr) break; std::string vertypeline = P[lc];
		lc++; if (lc >= lpr) break; std::string signatureline = P[lc];
		lc++; if (lc >= lpr) break; std::string tesline = P[lc];
		lc++; if (lc >= lpr) break; std::string conwayline = P[lc];
		lc++;
		while (lc < lpr && !(!P[lc].empty() && P[lc][0] == '-')) lc++;
		lc += 3;
#ifdef PROFILE
		auto _t0 = std::chrono::steady_clock::now();
		Graph g = decode(vertypeline, conwayline);
		auto _t1 = std::chrono::steady_clock::now();
		bool _s = simplify(g);
		auto _t2 = std::chrono::steady_clock::now();
		prof_decode += std::chrono::duration<double>(_t1 - _t0).count();
		prof_simpl += std::chrono::duration<double>(_t2 - _t1).count();
		if (!_s) continue;
		auto _t3 = std::chrono::steady_clock::now();
		std::string key = keyOf(signatureline, fingerprint(g));
		bool _seen = compareToSeen(g, key);
		auto _t4 = std::chrono::steady_clock::now();
		prof_fpcmp += std::chrono::duration<double>(_t4 - _t3).count();
		if (_seen) continue;
		addsolution(g, key);
		kept++;
#else
		Graph g = decode(vertypeline, conwayline);
		if (!simplify(g)) continue;
		std::string key = keyOf(signatureline, fingerprint(g));
		if (compareToSeen(g, key)) continue;
		addsolution(g, key);
		kept++;
#endif
		// minimal decode.py-compatible block (skip cycles/.tes/assembly)
		globe << vertypeline << "\n" << signatureline << "\n"
		      << "Count type: " << countsignature << "\n"
		      << tesline << "\n" << conwayline << "\n---\n\n";
	}
	return kept;
}

// famof: eusolver_<NN>_<fam>.txt -> fam
static std::string famof(const std::string& fname) {
	// strip dir + "eusolver_" (9) + NN_ (3) prefix, and ".txt" (4) suffix
	std::string b = fs::path(fname).filename().string();
	return b.substr(9 + 3, b.size() - (9 + 3) - 4);
}

int main() {
	OUTDIR = std::getenv("EU_OUT") ? std::getenv("EU_OUT") : "out";
	if (OUTDIR.back() != '/') OUTDIR += "/";
	PRUNEDDIR = OUTDIR + "pruned/";
	fs::create_directories(PRUNEDDIR);
	int KMIN = std::getenv("EU_KMIN") ? atoi(std::getenv("EU_KMIN")) : 1;
	int KMAX = std::getenv("EU_KMAX") ? atoi(std::getenv("EU_KMAX")) : 11;

	for (int k = KMIN; k <= KMAX; k++) {
		// buckets never cross k (the signature key encodes the vertex-type count), so a finished k
		// can be freed: caps RAM at the single largest k instead of the cumulative range.
		sols.clear(); bucket.clear();
		char nn[4]; std::snprintf(nn, sizeof(nn), "%02d", k);
		filecodebase = nn;
		std::vector<std::string> fams;
		std::string prefix = std::string("eusolver_") + nn + "_";
		for (auto& e : fs::directory_iterator(OUTDIR)) {
			std::string b = e.path().filename().string();
			if (b.rfind(prefix, 0) == 0 && b.size() > 4 && b.substr(b.size() - 4) == ".txt")
				fams.push_back(famof(b));
		}
		std::sort(fams.begin(), fams.end());
		long kc = 0;
		for (auto& fam : fams) kc += processfile(fam);
		keptTotal += kc;
		std::cerr << "  k=" << k << " : " << kc << "\n";
	}
	std::cerr << "total kept: " << keptTotal << "\n";
#ifdef PROFILE
	std::cerr << "PROFILE  decode=" << prof_decode << "s  simplify=" << prof_simpl
	          << "s  fp+compare=" << prof_fpcmp << "s\n";
#endif
	return 0;
}
