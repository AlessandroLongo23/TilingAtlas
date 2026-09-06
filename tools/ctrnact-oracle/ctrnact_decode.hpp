#pragma once
// Shared Čtrnáct decode: a pruned conway block (vertypeline + conway string) → the quotient half-edge
// graph (rneig/lneig/mirro/lvert/glue/label). Faithful C++ port of pruner.py's decode(). Single source
// used by BOTH eu_pruner (isomorphism dedup) and eu_develop (exact geometry) — previously duplicated in
// each .cpp, which risked the two drifting and producing inconsistent graphs. Owns the pruner_tables.inc
// include (raw .inc, no guard) so the .cpp units include only this header, never the tables directly.
#include <string>
#include <vector>
#include <unordered_map>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
// Generated per palette by alphabets/gen_alphabet.py, resolved via -I tables/$(PALETTE):
// legacy arrays (symbollist + {r,l}neig/mirro/lvert/label listin) plus clslistin
// (corner-class ids), countinglist (1 = true vertex, 0 = dent-fill point) and class tables.
#ifdef EU_RUNTIME_TABLES
// Same nine tables, read from tables.bin at startup. For alphabets whose .inc the compiler cannot
// take — see ctrnact_runtime_tables.hpp. It defines etypelistin too.
#include "ctrnact_runtime_tables.hpp"
#else
#include "pruner_tables.inc"

// PTAB_ETYPE ships in every generated pruner table and nothing built a nested view of it, so every
// refinement in eu_pruner has been seeded on (cls, fam) while the solver seeds on
// (cls*ETSPAN + etype, fam). A dart is (half-edge, side) and its EDGE TYPE is part of the structure —
// a leg may not be glued to a hypotenuse — so an isomorphism has to preserve it and a congruence has
// to refine it. Both of the pruner's tests were therefore working with less than the truth.
static const std::vector<std::vector<int> > etypelistin = _ptab_nest(PTAB_ETYPE, PTAB_OFF, PTAB_N);
#endif

static std::string countsignature; // set by buildvertextypes; read by the pruner's signature bucketing

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

// LABEL KEYS AS INTEGERS.
//
// decode() built a std::string per dart — edgelabel() concatenates — and makeglue then hashed all of
// them into a string-keyed map to look up two darts per glue token. On star-wide b118 that is ~30
// string constructions and one string hash table per block, 3.85M blocks: `sample` put allocation at
// 40% of the pruner and memcmp at 20%.
//
// A label is base + (tile apostrophes, or "@tile"), and decipher() reads it back as (mirror, num,
// til). When no base carries an apostrophe or '@' — true of every palette in this repo, checked at
// startup — the tile part is exactly `til = j` and the triple is a faithful key for the string. So
// carry the triple packed into an int and never build the string at all.
//
// ⚑ The guard is not decoration. With an apostrophe in a base the map stops being injective:
// base "0'" at j=5 renders "0'@5", which decipher reads as til = 1*10+5 = 15 — the same triple as
// base "0" at j=15. Different strings, one key, and a wrong gluing. LABELS_SIMPLE is false then and
// the string path below runs unchanged.
static bool LABELS_SIMPLE = true, LABELS_SCANNED = false;
static std::vector<std::vector<int> > LBL_KEY0;   // [type][dart] -> (num << 1) | mirror

static inline int lbl_pack(int num, int til, bool mirror) {
	return ((num * 65536 + til) << 1) | (mirror ? 1 : 0);
}

static void scan_labels() {
	if (LABELS_SCANNED) return;
	LABELS_SCANNED = true;
	LBL_KEY0.resize(labellistin.size());
	for (size_t t = 0; t < labellistin.size(); t++) {
		LBL_KEY0[t].resize(labellistin[t].size());
		for (size_t d = 0; d < labellistin[t].size(); d++) {
			const std::string& b = labellistin[t][d];
			if (b.find('\'') != std::string::npos || b.find('@') != std::string::npos)
				LABELS_SIMPLE = false;
			size_t i = 0; bool mir = false; int num = 0;
			if (i < b.size() && b[i] == '*') { mir = true; i++; }
			while (i < b.size() && isnum(b[i])) { num = num * 10 + (b[i] - '0'); i++; }
			LBL_KEY0[t][d] = (num << 1) | (mir ? 1 : 0);
		}
	}
}

// FIGURE ID PER TYPE, not per dart. figure_id() built a key string and then LINEARLY SCANNED every
// figure seen so far comparing strings — and decode() called it once per DART. ~98 figures on
// star-wide times ~30 darts times 3.85M blocks is billions of string comparisons for a value that
// depends only on the vertex type.
static std::vector<int> FIGURE_OF_TYPE;
static int figure_id(const std::string& sym);
static inline int figure_of_type(int t) {
	if (FIGURE_OF_TYPE.empty()) FIGURE_OF_TYPE.assign(symbollist.size(), -1);
	int& v = FIGURE_OF_TYPE[t];
	if (v < 0) v = figure_id(symbollist[t]);
	return v;
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

// Same walk, no strings: scan the conway line by index, decipher each token into (mirror, num, til)
// and look the dart up by the packed key. lkey has a few dozen entries so a linear scan beats a hash.
static void makeglue_fast(const std::string& c, const std::vector<int>& mirro,
                          const std::vector<int>& lkey, std::vector<int>& glue) {
	glue.assign(mirro.size(), -1);
	size_t p = 0;
	const size_t n = c.size();
	while (p + 1 < n) {
		size_t e = p;
		while (e < n && c[e] != ')' && c[e] != ']') e++;
		if (e >= n) break;
		const bool mirror = (c[p] == '[');
		// first token
		size_t a = p + 1, b = a;
		while (b < e && c[b] != ' ') b++;
		Dec w0 = decipher(c.substr(a, b - a));
		Dec w1;
		if (b < e) { w1 = decipher(c.substr(b + 1, e - b - 1)); }
		else       { w1 = w0; }
		if (mirror) w1.mirror = !w1.mirror;      // deciphersymbol prefixes '*' to the second token
		int k[2] = { -1, -1 };
		const Dec* ws[2] = { &w0, &w1 };
		for (int i = 0; i < 2; i++) {
			const int want = lbl_pack(ws[i]->num, ws[i]->til, ws[i]->mirror);
			for (size_t q = 0; q < lkey.size(); q++) if (lkey[q] == want) { k[i] = (int)q; break; }
		}
		glue[k[0]] = k[1];
		glue[k[1]] = k[0];
		glue[mirro[k[0]]] = mirro[k[1]];
		glue[mirro[k[1]]] = mirro[k[0]];
		p = e + 1;
	}
}

// SYMBOL LOOKUP — this was a linear std::find over the WHOLE alphabet, with a string compare at
// every step, run once per vertex token per block. On star-wide that is 50,229 symbols, and `sample`
// put buildvertextypes at 64% of the pruner on one star bucket (2,608 of 4,100 samples, plus most of
// the 871 in memcmp). The pruner reads far more blocks than the solver writes types, so this is the
// same shape of mistake as the solver's emission counter and it costs more.
//
// Index it once. std::find returns the FIRST match, so the map keeps the first insertion and a
// duplicated symbol resolves exactly as before; a symbol that is absent still returns
// symbollist.size(), which is the sentinel the palette-mismatch abort below tests for.
static std::unordered_map<std::string, int>& symbol_index_map() {
	static std::unordered_map<std::string, int> m;
	if (m.empty()) {
		m.reserve(symbollist.size() * 2);
		for (size_t i = 0; i < symbollist.size(); i++) m.emplace(symbollist[i], (int)i);
	}
	return m;
}
static int symbol_index(const std::string& sym) {
	std::unordered_map<std::string, int>& m = symbol_index_map();
	std::unordered_map<std::string, int>::const_iterator it = m.find(sym);
	return it == m.end() ? (int)symbollist.size() : it->second;
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
		int ind2 = symbol_index(sym);
		if (ind2 == (int)symbollist.size()) {
			// unknown symbol would index past every table (silent UB); cannot fire on
			// valid input from the matching solver palette — a mismatch means the solver
			// and this binary were built against different generated tables.
			std::fprintf(stderr, "FATAL: unknown vertex symbol '%s' (palette mismatch?)\n", sym.c_str());
			std::abort();
		}
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

// ---------- counting-k: true (>=3-tile) vertex types only, per the Myers convention ----------
static int countk(const std::vector<int>& vertextypes) {
	int k = 0;
	for (int vt : vertextypes) k += countinglist[vt];
	return k;
}

// ---------- decode: vertypeline + conway -> full glue graph ----------
struct Graph {
	std::vector<int> rneig, lneig, mirro, lvert, glue;
	std::vector<int> etype;  // per-dart edge type, 0 where the palette declares none
	std::vector<int> lkey;   // packed (num, tile, mirror) per dart — replaces `label` where LABELS_SIMPLE
	std::vector<int> cls;    // corner-class ids (WL color; regular: bijective with lvert)
	// VERTEX-FIGURE id per dart — the alphabet symbol with its site-symmetry variant stripped, so
	// (3,3,3)S3, R3, A and F all share one id. Both refinements below (simplify's minimality test
	// and comparesolutions' isomorphism test) are seeded on `cls` alone, and `cls` says which CORNER
	// a dart sits in, never which VERTEX. On an equilateral single-tile alphabet every dart of every
	// block carries corner class 0: simplify then finds the whole dart set to be one congruence
	// class and rejects the block, and comparesolutions calls any two blocks with the same dart
	// count isomorphic. gen_alphabet's A6 certificate has been reporting exactly this for years —
	// "(3,3,3)S3 ~= (3,3,3,3)S4 — pruner dedup unreliable here" — one dart each, same corner class,
	// indistinguishable. A covering of maps sends a dart to a dart at the SAME vertex of the tiling,
	// so the vertex figure is a covering invariant and belongs in the seed. With it the triangular
	// bipyramid survives; without it the whole 2-orbit deltahedron family (J12/J13/J17/J51/J84) is
	// deleted between the solver and the pruner. (2026-08-20; see the note in eu_solver.cpp.)
	std::vector<int> fam;
	std::vector<std::string> label;
};
// Symbol -> vertex-figure key: gen_alphabet writes "(" + word + ")" + optional "|edges|" + variant,
// and cyclic_reps has already canonicalized the word up to rotation and reflection. Duplicated in
// eu_solver.cpp, which does not include this header.
static std::string figure_key(const std::string& sym) {
	size_t cut = sym.find(')');
	if (cut == std::string::npos) return sym;
	if (cut + 1 < sym.size() && sym[cut + 1] == '|') {
		size_t e = sym.find('|', cut + 2);
		if (e != std::string::npos) cut = e;
	}
	return sym.substr(0, cut + 1);
}
static int figure_id(const std::string& sym) {
	static std::vector<std::string> keys;
	const std::string k = figure_key(sym);
	for (size_t i = 0; i < keys.size(); i++) if (keys[i] == k) return (int)i;
	keys.push_back(k);
	return (int)keys.size() - 1;
}
// decode_into: the same decode, writing into a caller-owned Graph so a hot loop can reuse its
// buffers. Constructing a Graph is eight vector allocations, and the pruner does it 3.85M times on
// one star bucket; `sample` had malloc/free at 38% of the run after the string labels went.
static void decode_into(Graph& gph, const std::string& vertypeline, const std::string& conwayline) {
	scan_labels();
	gph.rneig.clear(); gph.lneig.clear(); gph.mirro.clear(); gph.lvert.clear();
	gph.cls.clear(); gph.fam.clear(); gph.lkey.clear(); gph.label.clear(); gph.etype.clear();
	std::vector<int> vt = buildvertextypes(vertypeline);
	for (size_t j = 0; j < vt.size(); j++) {
		int i = vt[j];
		int l = (int)gph.rneig.size();
		int sl = (int)rneiglistin[i].size();
		const int fig = figure_of_type(i);            // per TYPE; was recomputed per dart
		for (int gg = 0; gg < sl; gg++) {
			gph.rneig.push_back(l + rneiglistin[i][gg]);
			gph.lneig.push_back(l + lneiglistin[i][gg]);
			gph.mirro.push_back(l + mirrolistin[i][gg]);
			gph.lvert.push_back(lvertlistin[i][gg]);
			gph.cls.push_back(clslistin[i][gg]);
			gph.etype.push_back(etypelistin[i][gg]);
			gph.fam.push_back(fig);
			if (LABELS_SIMPLE) {
				const int k0 = LBL_KEY0[i][gg];
				gph.lkey.push_back(lbl_pack(k0 >> 1, (int)j, (k0 & 1) != 0));
			} else {
				gph.label.push_back(edgelabel(labellistin[i][gg], (int)j));
			}
		}
	}
	if (LABELS_SIMPLE) makeglue_fast(conwayline, gph.mirro, gph.lkey, gph.glue);
	else               gph.glue = makeglue(conwayline, gph.mirro, gph.label);
}

static Graph decode(const std::string& vertypeline, const std::string& conwayline) {
	Graph gph;
	decode_into(gph, vertypeline, conwayline);
	return gph;
}
