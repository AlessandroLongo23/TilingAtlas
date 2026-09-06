#pragma once
// RUNTIME ALPHABET FOR THE PRUNER/DEVELOPER SIDE — the same nine tables pruner_tables.inc defines,
// read from tables.bin at startup instead of compiled in.
//
// Why this exists. The alphabet is normally C++ source. eu_solver already had a runtime path for
// exactly one reason — `g++ -O2` OOMs on a 588 MB .inc long before the search starts — but
// eu_pruner never did, so a palette too big to compile could be SEARCHED and then not pruned, which
// is the same as not being runnable. The 11-outline isotoxal palette is that palette: ~5.65M vertex
// types, a 1.54 GB pruner_tables.inc, and 2.3 GB of tables.bin that loads in seconds.
//
// The format is documented in alphabets/gen_alphabet.py emit_binary()/BinWriter. Little-endian i32
// throughout, which is every machine this runs on; a big-endian host would need byte swaps and is
// not supported.
//
// ⚑ The reader below is a second implementation of the one in eu_solver.cpp's EU_RUNTIME_TABLES
// block. They are kept separate because they fill different structures — the solver builds its own
// `vertexdef` array, this one fills the nine legacy `...listin` vectors the decode header and the
// pruner were written against — and merging them would mean routing both through a third
// representation that neither wants.
#include <cstring>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <iterator>
#include <string>
#include <vector>

static int TABLE_D = 0, TABLE_MAXL = 0;
static std::vector<std::string> symbollist, codelist;
static std::vector<std::vector<std::string> > labellistin;
static std::vector<std::vector<int> > lneiglistin, rneiglistin, mirrolistin, lvertlistin, clslistin;
static std::vector<int> countinglist, ferkvallist;
static std::vector<int> CLASS_UNITS, CLASS_L, CLASS_P, CLASS_NEXT, CLASS_PREV, CLASS_TILE, CLASS_SIGMA;
static std::vector<std::string> CLASS_DISP, TILE_FAM, TILE_NAME;

namespace ctrntb {
struct Reader {
	const unsigned char *p, *end;
	void need(size_t n) const {
		if ((size_t)(end - p) < n) { std::cerr << "tables.bin: truncated\n"; std::exit(2); }
	}
	int i32() { need(4); int v; std::memcpy(&v, p, 4); p += 4; return v; }
	std::string str() { int n = i32(); need((size_t)n); std::string s((const char*)p, (size_t)n); p += n; return s; }
	std::vector<int> iv() { int n = i32(); std::vector<int> v((size_t)n); for (int i = 0; i < n; i++) v[i] = i32(); return v; }
	std::vector<std::string> sv() { int n = i32(); std::vector<std::string> v((size_t)n); for (int i = 0; i < n; i++) v[i] = str(); return v; }
};
}

// etypelistin is filled here too, so the decode header's compiled-path definition is skipped under
// EU_RUNTIME_TABLES rather than duplicated.
static std::vector<std::vector<int> > etypelistin;

static void load_pruner_tables_bin(const char* path) {
	std::ifstream f(path, std::ios::binary);
	if (!f) { std::cerr << "EU_TABLES: cannot open " << path << "\n"; std::exit(2); }
	std::vector<unsigned char> buf((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
	const bool v3 = buf.size() >= 8 && std::memcmp(buf.data(), "CTRNTB03", 8) == 0;
	const bool v2 = v3 || (buf.size() >= 8 && std::memcmp(buf.data(), "CTRNTB02", 8) == 0);
	if (buf.size() < 8 || (!v2 && std::memcmp(buf.data(), "CTRNTB01", 8) != 0)) {
		std::cerr << "EU_TABLES: " << path << " is not a CTRNTB01/02/03 table file\n"; std::exit(2);
	}
	ctrntb::Reader r{ buf.data() + 8, buf.data() + buf.size() };
	TABLE_D = r.i32(); TABLE_MAXL = r.i32();
	const int ncls = r.i32(), ntiles = r.i32(), ntypes = r.i32();
	auto fixed = [&](std::vector<int>& v) { v.resize((size_t)ncls); for (int i = 0; i < ncls; i++) v[i] = r.i32(); };
	fixed(CLASS_UNITS); fixed(CLASS_L); fixed(CLASS_P); fixed(CLASS_NEXT); fixed(CLASS_PREV); fixed(CLASS_TILE);
	// CLASS_SIGMA arrived with CTRNTB03; an older file is an equilateral-only alphabet, sigma = id.
	if (v3) fixed(CLASS_SIGMA);
	else { CLASS_SIGMA.resize((size_t)ncls); for (int i = 0; i < ncls; i++) CLASS_SIGMA[i] = i; }
	CLASS_DISP = r.sv(); TILE_FAM = r.sv(); TILE_NAME = r.sv();
	if ((int)CLASS_DISP.size() != ncls || (int)TILE_NAME.size() != ntiles) {
		std::cerr << "tables.bin: class/tile count mismatch\n"; std::exit(2);
	}
	symbollist.resize((size_t)ntypes); codelist.resize((size_t)ntypes);
	ferkvallist.resize((size_t)ntypes); countinglist.resize((size_t)ntypes);
	labellistin.resize((size_t)ntypes); lneiglistin.resize((size_t)ntypes);
	rneiglistin.resize((size_t)ntypes); mirrolistin.resize((size_t)ntypes);
	lvertlistin.resize((size_t)ntypes); clslistin.resize((size_t)ntypes);
	etypelistin.resize((size_t)ntypes);
	for (int i = 0; i < ntypes; i++) {
		symbollist[i] = r.str(); codelist[i] = r.str();
		ferkvallist[i] = r.i32(); countinglist[i] = r.i32();
		labellistin[i] = r.sv(); lneiglistin[i] = r.iv(); rneiglistin[i] = r.iv(); mirrolistin[i] = r.iv();
		// ONE array serves both. tables.bin carries the corner-CLASS ids (gen_alphabet writes e.cls
		// here and its docstring says so); the .inc's separate PTAB_LVERT is a display-numeric alias
		// used only where classes happen to be numeric, and the single reader of lvertlistin in
		// ctrnact_decode.hpp wants the class id.
		clslistin[i] = r.iv();
		lvertlistin[i] = clslistin[i];
		std::vector<int> reps = r.iv();
		(void)reps;                       // the pruner does not use the transversal; the solver does
		etypelistin[i] = v2 ? r.iv() : std::vector<int>(clslistin[i].size(), 0);
	}
	if (r.p != r.end) { std::cerr << "tables.bin: " << (r.end - r.p) << " trailing bytes\n"; std::exit(2); }
	std::cerr << "tables: " << ntypes << " vertex types, " << ncls << " classes, D=" << TABLE_D
	          << " (runtime, " << path << ")\n";
}

// Call once, before anything reads a table. Aborts with a clear message when EU_TABLES is unset,
// which is otherwise a zero-size alphabet that silently prunes nothing.
static void load_runtime_tables_or_die() {
	const char* tp = std::getenv("EU_TABLES");
	if (!tp) { std::cerr << "built with RUNTIME_TABLES=1 but EU_TABLES is unset\n"; std::exit(2); }
	load_pruner_tables_bin(tp);
}
