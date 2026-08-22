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
	std::vector<int16_t> fam;   // vertex-figure id per dart; see Graph::fam in ctrnact_decode.hpp
};
static std::vector<Sol> sols;                 // every kept solution
static std::vector<std::string> siglist;      // distinct signatures
static std::vector<std::vector<int>> sollist; // sig index -> indices into sols
static std::unordered_map<std::string, int> sigIndex;

// ---------- out-of-core solution store (EU_SPILL) ----------
// Marek Čtrnáct's proposal, 2026-08-03. The DFS itself costs almost no memory (measured 12.0 MB
// at k=13 against the pruner's 846.4 MB); ALL of the pruner's RAM is `sols`, the kept solutions
// retained so later candidates can be arbitrated against them. But the bucket key
// (sigline, fingerprint) is an isomorphism invariant, so a duplicate is NEVER compared outside
// its own bucket, and measured buckets are tiny (mean 6.3, max 400 at k=13). The store therefore
// does not have to be resident: spill it to disk and read back only the few solutions in the
// matching bucket.
//
// EU_SPILL=<MB> caps resident solution bytes; unset or 0 keeps everything in RAM (the previous
// behaviour). Input order and every keep/discard verdict are untouched, so the emitted catalog is
// byte-identical with the knob on or off — that equality is the acceptance gate for this change.
static size_t spillLimitBytes = 0;
static size_t solsResidentBytes = 0;
static std::vector<long long> solOff;   // per solution: -1 = resident in `sols`, else spill offset
static std::FILE* spillF = nullptr;
static std::string spillPath;
static long long spillWrites = 0, spillReads = 0, spillBytesOut = 0;
// Telemetry: how big the store actually gets, independent of where it lives. storeTotalPeak is
// what the in-RAM design must hold; residentPeak is what it holds with spilling on.
static size_t storeTotalBytes = 0, storeTotalPeak = 0, residentPeak = 0;

static inline size_t solBytes(const Sol& s) {
	return (s.rneig.size() + s.lneig.size() + s.lvert.size()
	        + s.mirro.size() + s.glue.size() + s.fam.size()) * sizeof(int16_t);
}

// Append every still-resident solution to the spill file and free its vectors.
static void spillResident() {
	if (!spillF) {
		spillF = std::fopen(spillPath.c_str(), "w+b");
		if (!spillF) {
			std::cerr << "eu_pruner: cannot open spill file " << spillPath << "\n";
			std::exit(1);
		}
	}
	std::fseek(spillF, 0, SEEK_END);
	long long off = std::ftell(spillF);
	for (size_t i = 0; i < sols.size(); i++) {
		if (solOff[i] >= 0) continue;                  // already spilled
		Sol& s = sols[i];
		int32_t le = (int32_t)s.rneig.size();
		std::fwrite(&le, sizeof(le), 1, spillF);
		std::fwrite(s.rneig.data(), sizeof(int16_t), le, spillF);
		std::fwrite(s.lneig.data(), sizeof(int16_t), le, spillF);
		std::fwrite(s.lvert.data(), sizeof(int16_t), le, spillF);
		std::fwrite(s.mirro.data(), sizeof(int16_t), le, spillF);
		std::fwrite(s.glue.data(), sizeof(int16_t), le, spillF);
		std::fwrite(s.fam.data(), sizeof(int16_t), le, spillF);
		solOff[i] = off;
		off += (long long)sizeof(le) + 6LL * le * (long long)sizeof(int16_t);
		std::vector<int16_t>().swap(s.rneig);
		std::vector<int16_t>().swap(s.lneig);
		std::vector<int16_t>().swap(s.lvert);
		std::vector<int16_t>().swap(s.mirro);
		std::vector<int16_t>().swap(s.glue);
		std::vector<int16_t>().swap(s.fam);
		spillWrites++;
	}
	std::fflush(spillF);
	spillBytesOut = off;
	solsResidentBytes = 0;
}

// Transparent read-through: resident solutions are returned in place, spilled ones are pulled back
// into a single reusable scratch buffer. Only one is live per comparesolutions() call.
static const Sol& solAt(int idx) {
	if (solOff[idx] < 0) return sols[idx];
	static Sol scratch;
	std::fseek(spillF, solOff[idx], SEEK_SET);
	int32_t le = 0;
	if (std::fread(&le, sizeof(le), 1, spillF) != 1) {
		std::cerr << "eu_pruner: short read from spill file\n";
		std::exit(1);
	}
	auto rd = [&](std::vector<int16_t>& v) {
		v.resize(le);
		if (le && std::fread(v.data(), sizeof(int16_t), le, spillF) != (size_t)le) {
			std::cerr << "eu_pruner: short read from spill file\n";
			std::exit(1);
		}
	};
	rd(scratch.rneig); rd(scratch.lneig); rd(scratch.lvert); rd(scratch.mirro); rd(scratch.glue);
	rd(scratch.fam);
	spillReads++;
	return scratch;
}
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
					    || g.fam[i] != g.fam[j]
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
	const Sol& s = solAt(solIdx);   // resident, or read back from the spill file
	int le = (int)x.rneig.size();
	if ((int)s.rneig.size() != le) return false;   // same signature ⇒ same le; guard anyway
	int n = 2 * le, nw = (n + 63) >> 6;
	static std::vector<int> rn, ln, mi, lv, gl, fm;
	rn.resize(n); ln.resize(n); mi.resize(n); lv.resize(n); gl.resize(n); fm.resize(n);
	for (int i = 0; i < le; i++) {
		rn[i] = x.rneig[i]; ln[i] = x.lneig[i]; mi[i] = x.mirro[i]; lv[i] = x.cls[i]; gl[i] = x.glue[i];
		fm[i] = x.fam[i];
		rn[le + i] = le + s.rneig[i]; ln[le + i] = le + s.lneig[i];
		mi[le + i] = le + s.mirro[i]; lv[le + i] = s.lvert[i]; gl[le + i] = le + s.glue[i];
		fm[le + i] = s.fam[i];
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
					    || fm[i] != fm[j]
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
	for (int i = 0; i < le; i++)
		col[i] = mix(1469598103934665603ULL ^ (uint64_t)(g.cls[i] + 1), (uint64_t)(g.fam[i] + 1));
	// SIX ROUNDS, not three. The fingerprint's only job is to keep the bucket small enough that
	// comparesolutions — an exact relation refinement over the disjoint union of two graphs, ~8 us —
	// runs rarely. Three rounds does that on the regular palette (mean bucket 6.3) and does NOT on
	// star blocks: on star-wide b00000, 1,076,011 blocks at k=3, three rounds gives a max bucket of
	// 168 and 2,368,755 comparisons where six gives 16 and 518,313 — 4.6x fewer, for three more
	// passes over a colour array that `sample` puts at 1.3% of the run. Same 597,760 kept either way;
	// more WL rounds refine an isomorphism invariant, so isomorphic graphs still share the key and
	// the verdicts cannot move.
	for (int r = 0; r < 6; r++) {
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
	Sol s{ narrow(g.rneig), narrow(g.lneig), narrow(g.cls), narrow(g.mirro), narrow(g.glue),
	       narrow(g.fam) };
	size_t b = solBytes(s);
	solsResidentBytes += b;
	storeTotalBytes += b;
	if (storeTotalBytes > storeTotalPeak) storeTotalPeak = storeTotalBytes;
	if (solsResidentBytes > residentPeak) residentPeak = solsResidentBytes;
	sols.push_back(std::move(s));
	solOff.push_back(-1);
	bucket[key].push_back((int)sols.size() - 1);
	if (spillLimitBytes && solsResidentBytes > spillLimitBytes) spillResident();
}

// One line of store telemetry, printed at the end of either mode.
static void reportStore() {
	std::cerr << "store: peak " << (storeTotalPeak / 1048576.0) << " MB total, "
	          << (residentPeak / 1048576.0) << " MB resident";
	if (spillLimitBytes)
		std::cerr << "  (spill " << spillWrites << " out / " << spillReads << " back, "
		          << (spillBytesOut / 1048576.0) << " MB on disk)";
	std::cerr << "\n";
}

// Free the whole store (see the per-k note at the call site).
static void resetStore() {
	sols.clear(); bucket.clear(); solOff.clear();
	solsResidentBytes = 0; storeTotalBytes = 0;
	if (spillF) { std::fclose(spillF); std::remove(spillPath.c_str()); spillF = nullptr; }
}

// ---------- file processing ----------
static std::string filecodebase;
static std::string OUTDIR, PRUNEDDIR;
static long keptTotal = 0;

// SIGNATURE SHARDING (EU_SIGSHARD_N / EU_SIGSHARD_W, default 1/0 = the old single-process pass).
//
// The dedup key is keyOf(signatureline, fingerprint), so two blocks are only ever compared when their
// SIGNATURE LINES are equal. An isomorphism class therefore lives entirely inside one signature, and
// splitting the input by a hash of that line is exact: every duplicate still meets its representative,
// and within a shard the blocks arrive in input order, so first-seen-wins picks the same one.
//
// Why it is needed: the whole star-wide k=3 run is 359 s and ONE bucket is 224 s of it, of which 101 s
// is its pruner (10.7 s is the solve). 99% of that bucket's 3.85M blocks sit in a single family, so
// splitting by family — the other obvious cut — buys nothing there.
// SHARDING THE DEDUP (EU_SIGSHARD_N / EU_SIGSHARD_W, default 1/0 = one process, unchanged).
//
// compareToSeen only ever compares two blocks when their FULL key — keyOf(signatureline,
// fingerprint) — is equal, so partitioning the input by a hash of that key is exact: every duplicate
// still meets its representative, and within a shard blocks arrive in input order so first-seen-wins
// picks the same one. Each shard writes its own file; the merged set is identical.
//
// ⚑ SHARDING ON THE SIGNATURE ALONE DOES NOT WORK, and the measurement is why this keys on the whole
// thing. b00118's dominant family is 3,813,645 blocks over just 189 distinct signature lines, and the
// heaviest is 16.7% of them. Hashing those 189 weights into 8 bins put 29-52% on one shard; weighting
// by block count and assigning longest-processing-time-first fixed the balance and barely moved the
// clock (48.4s -> 44.5s), because cost is superlinear in signature size — the shard holding the
// biggest signature ran 39.8s while the other seven ran 6.5-10.4s. The full key splits the same file
// into ~587,000 buckets, which balances on its own.
//
// The price is that decode + fingerprint must run in EVERY shard, since the key is not knowable
// without them. `sample` puts those at ~9% of the pruner, against the 46% in compareToSeen that this
// actually divides.
static int SIGSHARD_N = 1, SIGSHARD_W = 0;
static inline bool key_mine(const std::string& key) {
	if (SIGSHARD_N <= 1) return true;
	size_t h = 1469598103934665603ULL;
	for (unsigned char c : key) { h ^= c; h *= 1099511628211ULL; }
	h ^= h >> 29; h *= 0xBF58476D1CE4E5B9ULL; h ^= h >> 32;
	return (int)(h % (size_t)SIGSHARD_N) == SIGSHARD_W;
}
static std::string shard_suffix() {
	return SIGSHARD_N > 1 ? (".s" + std::to_string(SIGSHARD_W)) : std::string();
}

static long processfile(const std::string& fam) {
	std::string filecode = filecodebase + "_" + fam;
	std::string inpath = OUTDIR + "eusolver_" + filecode + ".txt";
	if (!fs::exists(inpath)) return 0;
	// STREAM the file, do not slurp it. This used to read the whole thing into a vector<string>
	// holding EVERY line, most of them face-cycle text it then skips.
	//
	// ⚑ This is a MEMORY fix, not a speed fix, and the distinction is the whole point. On b00000's
	// 749 MB raw file the two are the same wall clock (38.8s vs 40.2s, noise) but peak RSS goes
	// 2.41 GB -> 0.67 GB. Ten of these run at once under run_k2_buckets.py --workers 10, so the old
	// version wanted 24 GB on a 24 GB machine: the star-wide k=3 run's stragglers were pruners
	// thrashing, not pruners computing. The per-block loop only ever needs four lines at a time.
	std::ifstream in(inpath);
	std::ofstream globe(PRUNEDDIR + "eupruned_" + filecode + shard_suffix() + ".txt");
	long kept = 0;
	std::string line, vertypeline, signatureline, tesline, conwayline;
	auto rd = [&](std::string& dst) -> bool {
		if (!std::getline(in, dst)) return false;
		if (!dst.empty() && dst.back() == '\r') dst.pop_back();
		return true;
	};
	while (rd(line)) {                                  // "Number of vertex types: N"
		if (!rd(vertypeline) || !rd(signatureline) || !rd(tesline) || !rd(conwayline)) break;
		// skip the face-cycle lines, then the "---" separator and the two blank lines after it
		while (rd(line) && !(!line.empty() && line[0] == '-')) {}
		if (!rd(line) || !rd(line)) { /* trailing block: fall through and process it */ }
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
		// key first, so a shard can drop a block it does not own before the expensive work.
		// simplify moves after it: it cannot change the key, and a block it rejects is dropped
		// either way — now only by its owning shard, which sees exactly the same blocks.
		std::string key = keyOf(signatureline, fingerprint(g));
		if (!key_mine(key)) continue;
		if (!simplify(g)) continue;
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
		std::string key = keyOf(signatureline, fingerprint(g));
		if (!key_mine(key)) continue;
		if (!simplify(g)) continue;
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

	// EU_SPILL=<MB>: cap resident solution bytes, spilling the rest to disk (see the store note
	// above). 0/unset = everything in RAM, the previous behaviour.
	if (const char* sp = std::getenv("EU_SPILL")) spillLimitBytes = (size_t)atof(sp) * 1048576ULL;
	spillPath = OUTDIR + ".eu_pruner_spill.bin";

	bool stream = std::getenv("EU_STREAM") != nullptr;
	int konly = std::getenv("EU_KONLY") ? atoi(std::getenv("EU_KONLY")) : 0;
	if (stream) {
		std::map<int,long> keptByK;
		long kept = processstream(std::cin, konly, keptByK);
		for (auto& kv : keptByK)                                  // same "  k=<k> : <n>" format as file mode
			std::cerr << "  k=" << kv.first << " : " << kv.second << "\n";
		std::cerr << "total kept: " << kept << "\n";
		reportStore();
		resetStore();
		return 0;
	}

	if (const char* v = std::getenv("EU_SIGSHARD_N")) SIGSHARD_N = std::max(1, atoi(v));
	if (const char* v = std::getenv("EU_SIGSHARD_W")) SIGSHARD_W = atoi(v);

	int KMIN = std::getenv("EU_KMIN") ? atoi(std::getenv("EU_KMIN")) : 1;
	int KMAX = std::getenv("EU_KMAX") ? atoi(std::getenv("EU_KMAX")) : 11;

	for (int k = KMIN; k <= KMAX; k++) {
		// buckets never cross k (the signature key encodes the vertex-type count), so a finished k
		// can be freed: caps RAM at the single largest k instead of the cumulative range.
		resetStore();
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
	reportStore();
	resetStore();
#ifdef PROFILE
	std::cerr << "PROFILE  decode=" << prof_decode << "s  simplify=" << prof_simpl
	          << "s  fp+compare=" << prof_fpcmp << "s\n";
#endif
	return 0;
}
