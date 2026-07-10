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
#include "pruner_tables.inc"

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
	std::vector<int> cls;    // corner-class ids (WL color; regular: bijective with lvert)
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
			gph.cls.push_back(clslistin[i][gg]);
			gph.label.push_back(edgelabel(labellistin[i][gg], (int)j));
		}
	}
	gph.glue = makeglue(conwayline, gph.mirro, gph.label);
	return gph;
}
