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
#include "ctrnact_decode.hpp" // shared decode + pruner_tables.inc + countsignature (also used by eu_develop)

// ---------- global solution store (mirrors the Python globals) ----------
// Node indices live in [0, le); int16_t is lossless well past any reachable k. `label` was stored
// but never read (comparesolutions uses only the five arrays), so it is dropped, not narrowed.
// `lvert` here stores the corner-CLASS id (WL color) — for the regular palette that is a
// bijective recoloring of the polygon size, so partitions and verdicts are unchanged.
struct Sol {
	std::vector<int16_t> rneig, lneig, lvert, mirro, glue;
};
static std::vector<Sol> sols;                 // every kept solution
static std::vector<std::string> siglist;      // distinct signatures
static std::vector<std::vector<int>> sollist; // sig index -> indices into sols
static std::unordered_map<std::string, int> sigIndex;
// countsignature + the decode machinery (edgelabel/decipher/makeglue/buildvertextypes, Graph, decode)
// live in ctrnact_decode.hpp, shared with eu_develop (was duplicated here; single source now).

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
					if (g.cls[i] != g.cls[j]
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
		rn[i] = x.rneig[i]; ln[i] = x.lneig[i]; mi[i] = x.mirro[i]; lv[i] = x.cls[i]; gl[i] = x.glue[i];
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
	for (int i = 0; i < le; i++) col[i] = 1469598103934665603ULL ^ (uint64_t)(g.cls[i] + 1);
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
	Sol s{ narrow(g.rneig), narrow(g.lneig), narrow(g.cls), narrow(g.mirro), narrow(g.glue) };
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

// Read solver blocks from a stream (EU_STREAM). Each block: "Number of vertex types: N",
// vertypeline, signatureline, "TES file: ...", conwayline, then cycle/blank lines. We read the four
// header fields, then let the outer loop resync on the next "Number of vertex types:" — cycle/blank
// lines never start with that prefix, so no explicit blank-counting is needed. Dedup is identical to
// processfile; kept blocks route to per-k output files eupruned_<NN>.txt.
static long processstream(std::istream& in, int konly, std::map<int,long>& keptByK) {
	long kept = 0; std::string line;
	std::map<int, std::ofstream> outByK;
	while (std::getline(in, line)) {
		if (line.rfind("Number of vertex types:", 0) != 0) continue;   // sync to a block header
		std::string vertypeline, signatureline, tesline, conwayline;
		if (!std::getline(in, vertypeline) || !std::getline(in, signatureline)
		    || !std::getline(in, tesline)  || !std::getline(in, conwayline)) break;
		int k = countk(buildvertextypes(vertypeline));       // counting types only (Myers convention);
		                                                     // buildvertextypes also sets countsignature
		if (konly > 0 && k != konly) continue;               // drop before the expensive decode
		Graph g = decode(vertypeline, conwayline);           // recomputes the same countsignature
		if (!simplify(g)) continue;
		std::string key = keyOf(signatureline, fingerprint(g));
		if (compareToSeen(g, key)) continue;
		addsolution(g, key);
		kept++; keptByK[k]++;
		auto it = outByK.find(k);
		if (it == outByK.end()) {
			char nn[4]; std::snprintf(nn, sizeof(nn), "%02d", k);
			it = outByK.emplace(k, std::ofstream(PRUNEDDIR + "eupruned_" + nn + ".txt")).first;
		}
		it->second << vertypeline << "\n" << signatureline << "\n"
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

	bool stream = std::getenv("EU_STREAM") != nullptr;
	int konly = std::getenv("EU_KONLY") ? atoi(std::getenv("EU_KONLY")) : 0;
	if (stream) {
		std::map<int,long> keptByK;
		long kept = processstream(std::cin, konly, keptByK);
		for (auto& kv : keptByK)                                  // same "  k=<k> : <n>" format as file mode
			std::cerr << "  k=" << kv.first << " : " << kv.second << "\n";
		std::cerr << "total kept: " << kept << "\n";
		return 0;
	}

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
