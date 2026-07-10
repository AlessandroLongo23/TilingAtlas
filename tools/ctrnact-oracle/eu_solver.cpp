/*
 * eu_solver.cpp
 *
 *  Created on: 10. 12. 2021
 *      Author: Marek
 */

#include <vector>
#include <array>
#include <string>
#include <fstream>
#include <algorithm>
#include <iostream>
#include <cstdlib>

std::string solvercode = "eu";
std::string filepath = "out/";
std::string listfile = solvercode + "solver_";
std::string genfile = solvercode + "output";

#ifndef MAXNUM
#define MAXNUM 11        // max k to enumerate; override with g++ -DMAXNUM=<k>
#endif
constexpr int maxnum = MAXNUM;
constexpr int seen = 0;  // emit every k in [1, maxnum] (original used seen=13 to emit only k=14)

// EU_NCBUDGET: cap on noncounting vertex types (dent-fill points, star palettes only; the
// regular palette has none). A heuristic cap is an incompleteness knob, so every hit is
// counted and reported loudly at exit; certify by budget-fixpoint (identical catalogs at
// B and B+1). See docs/ctrnact-proof-program-2026-07-10.md §4.4.
static const int nc_budget = std::getenv("EU_NCBUDGET") ? atoi(std::getenv("EU_NCBUDGET")) : 8;
static long ncbudget_hits = 0;   // fresh noncounting vertex skipped because budget reached
static long nckzero = 0;         // closed all-noncounting solutions suppressed
static bool has_noncounting = false;  // set in main(); false for the regular palette

// Per-node debug trace (euoutput1.txt: a line for every configuration the DFS touches). It is pure
// hot-path overhead — string-building + I/O done once per search node — and never feeds the search
// or the emitted solutions (those go to `globe` in writesolution). Default OFF; -DEU_TRACE=1 restores
// Marek's original tracing. The mincycle computation inside writecycle() runs regardless of this flag.
#ifndef EU_TRACE
#define EU_TRACE 0
#endif
constexpr bool eu_trace = EU_TRACE;

// EU_STREAM (runtime toggle, no rebuild needed): when set, writesolution() emits each solution
// block to std::cout instead of to a per-family file under `globe`, so the solver can be piped
// straight into the pruner (eu_solver | eu_pruner) with raw blocks never landing on disk. The
// block format itself is unchanged; only the sink changes.
static const bool eu_stream = std::getenv("EU_STREAM") != nullptr;

struct vertexdef {
    std::string symbol;
    std::vector<std::string> label;
    std::vector<int> lneig;
    std::vector<int> rneig;
    std::vector<int> mirro;
    std::vector<int> lvert;   // corner-CLASS id per dart (regular palette: bijective with size)
    int ferkval;
    std::string code;
    int counting;             // 1 = true (>=3-tile) vertex, 0 = dent-fill point (non-vertex)
};

struct configuration {
    std::vector<std::string> label;
    std::vector<int> lneig;
    std::vector<int> rneig;
    std::vector<int> mirro;
    std::vector<int> lvert;   // corner-class ids (see vertexdef)
    std::vector<int> glue;
    std::vector<int> vertype;
    int num;                  // total vertex types incl. noncounting (drives labels/framing)
    int kcnt;                 // counting vertex types only (drives k, maxnum, file naming)
    int dfs_depth;
};

// mainlist + class tables are generated per palette by alphabets/gen_alphabet.py
// (resolved via -I tables/$(PALETTE); regular reproduces the legacy 44 entries exactly).
#include "solver_tables.inc"

int symbolcount;

struct runt {
    std::string soltype;
    int solnum;
};

std::vector<runt> runtotal;

struct vertypesolv {
    std::vector<int> vertices;
    int count;
};

std::vector<vertypesolv> vertypesolved;

int solcount = 0;
int solfound = 0;

std::vector<int> mincycle;

std::ofstream globe;
std::ofstream gen;

std::string fname(int num);
std::string finename(configuration const& conf);
int ferk(vertexdef const& x);
std::string edgelabel(std::string edge, int tile);
std::string conwaysymbol(std::string const& first, std::string const& second);
std::string writeconway(configuration const& conf);
std::string verbalvertices(std::vector<int> const& vertype);
bool checkpart(configuration const& conf);
int writecycle(configuration const& conf, std::ostream& filen);
std::vector<int> sigresult(std::vector<int> const& vertype);
std::string sig(std::vector<int> const& result);
std::string signature(std::vector<int> const& vertype);
std::string filesignature(std::vector<int> const& vertype);
int vertypesolvedadd(std::vector<int> const& vertype);
int initex();
int writecyclefinal(configuration const& conf, std::ostream& filen);
int writesolution(configuration const& conf);

bool simplify(configuration const& conf);
int extend(configuration& slist);

std::string finename(configuration const& conf) {
    std::string m = fname(conf.kcnt) + "_";
    for (int t = 0; t < (int)TILE_FAM.size(); t++) {
        bool present = false;
        for (int c : conf.lvert) if (CLASS_TILE[c] == t) { present = true; break; }
        if (present) m += TILE_FAM[t];
    }
    return m;
}

std::string fname(int num) {
    std::string m = std::to_string(num);
    if (num < 10) {
        m = "0" + m;
    }
    return m;
}

int ferk(vertexdef const& x) {
    int r = x.lneig.size();
    int q = r / x.ferkval;
    return q;
}

std::string edgelabel(std::string edge, int tile) {
    std::string m = edge;
    if (tile > 3) {
        m = m + "@" + std::to_string(tile);
    }
    else {
        for (int i = 0; i < tile; i++) {
            m = m + "'";
        }
    }
    return m;
}

std::string conwaysymbol(std::string const& first, std::string const& second) {
    int mirrornum = 0;
    std::string mfirst = first;
    std::string msecond = second;
    if (first[0] == '*') {
        mfirst = mfirst.substr(1);
        mirrornum++;
    }
    if (second[0] == '*') {
        msecond = msecond.substr(1);
        mirrornum++;
    }
    bool same = mfirst == msecond;
    if (mirrornum != 1) {
        if (same) {
            return "(" + mfirst + ")";
        }
        else {
            return "(" + mfirst + " " + msecond + ")";
        }
    }
    else {
        if (same) {
            return "[" + mfirst + "]";
        }
        else {
            return "[" + mfirst + " " + msecond + "]";
        }
    }
}

std::string writeconway(configuration const& conf) {
    std::vector<int> smet = {};
    std::string conwaystring = "";
    for (int cy = 0; cy < (int)conf.glue.size(); cy++) {
        if ((std::find(smet.begin(), smet.end(), cy) == smet.end()) && (conf.glue[cy] != -1)) {
            std::string first = conf.label[cy];
            std::string second = conf.label[conf.glue[cy]];
            smet.push_back(cy);
            smet.push_back(conf.glue[cy]);
            smet.push_back(conf.mirro[cy]);
            smet.push_back(conf.glue[conf.mirro[cy]]);
            conwaystring = conwaystring + conwaysymbol(first, second);
        }
    }
    return conwaystring;
}

std::string verbalvertices(std::vector<int> const& vertype) {
    std::string s = "";
    for (int i : vertype) s = s + mainlist[i].symbol + ", ";
    return s.substr(0, s.size() - 2);
}

// Face-cycle validity over corner CLASSES. Regular palette (period p=1, CLASS_NEXT=id,
// L=n) degenerates to Marek's original: same class along the cycle, closed length divides
// n, open length <= n. Star tiles (p=2, point/dent alternating word of length L=2n): the
// class must advance +1 mod p along the walk, a closed cycle must be a whole number of
// word periods (count % p == 0) AND a divisor of L (rotation symmetry of the tile), an
// open cycle must not exceed L. p <= 2 is asserted by the generator; the +1-advance rule
// is orientation-safe only up to p=2.
bool checkpart(configuration const& conf) {
    for (int i = 0; i < (int)conf.rneig.size(); i++) {
        int free = i;
        int rfree = conf.rneig[free];
        int expect = conf.lvert[rfree];
        const int L = CLASS_L[expect];
        const int p = CLASS_P[expect];
        int count = 1;
        bool passt = false;
        while (!passt) {
            free = conf.glue[rfree];
            if (free == -1) {
                if (count > L) {
                    return false;
                }
                else {
                    passt = true;
                }
            }
            else if (free == i) {
                if (count % p != 0 || L % count != 0) {
                    return false;
                }
                else {
                    passt = true;
                }
            }
            else {
                rfree = conf.rneig[free];
                expect = CLASS_NEXT[expect];
                count++;
                if (conf.lvert[rfree] != expect) {
                    return false;
                }
            }
        }
    }
    return true;
}

int writecycle(configuration const& conf, std::ostream& filen) {
    mincycle = { -1,TABLE_MAXL + 1 };
    int v = 0;
    std::vector<int> smet = {};
    for (int cy = 0; cy < (int)conf.glue.size(); cy++) {
        std::string mainst = "";
        int count = 0;
        bool complete = false;
        if (std::find(smet.begin(), smet.end(), cy) == smet.end()) {
            int left = cy;
            while ((conf.glue[left] != -1) && (conf.glue[left] != conf.rneig[cy])) {
                left = conf.lneig[conf.glue[left]];
            }
            if (conf.glue[left] == -1) {
                int stable = left;
                int right = conf.rneig[left];
                int vstable = CLASS_L[conf.lvert[right]];
                bool cont = true;
                while (cont) {
                    smet.push_back(left);
                    if (eu_trace) mainst = mainst + conf.label[left] + "/" + conf.label[right] + "(" + CLASS_DISP[conf.lvert[right]] + ")-";
                    count++;
                    left = conf.glue[right];
                    if (left != -1) {
                        right = conf.rneig[left];
                    }
                    else {
                        int dif = vstable - count;
                        if (dif < mincycle[1]) {
                            mincycle = { stable,dif };
                        }
                        cont = false;
                    }
                }
            }
            else {
                left = cy;
                int right = conf.rneig[left];
                v = CLASS_L[conf.lvert[right]];
                bool cont = true;
                complete = true;
                while (cont) {
                    smet.push_back(left);
                    if (eu_trace) mainst = mainst + conf.label[left] + "/" + conf.label[right] + "(" + CLASS_DISP[conf.lvert[right]] + ")-";
                    count++;
                    left = conf.glue[right];
                    if (left != cy) {
                        right = conf.rneig[left];
                    }
                    else {
                        cont = false;
                    }
                }
            }
            if (eu_trace) {
                if (complete) {
                    mainst = mainst.substr(0, mainst.size() - 1);
                    int ratio = v / count;
                    if (ratio != 1) {
                        mainst = " [" + mainst + "]x" + std::to_string(ratio);
                    }
                    else {
                        mainst = " " + mainst;
                    }
                }
                filen << mainst << "\n";
            }
        }
    }
    return 0;
}

std::string sig(std::vector<int> const& result) {
    std::string s = "";
    for (int i = 0; i < (int)result.size(); i++) {
        if (result[i] > 0) {
            s = s + mainlist[i].symbol;
            if (result[i] > 1) {
                s = s + "x" + std::to_string(result[i]);
            }
            s = s + ", ";
        }
    }
    return s.substr(0, s.size() - 2);
}

std::vector<int> sigresult(std::vector<int> const& vertype) {
    std::vector<int> result(symbolcount, 0);
    for (int i : vertype) result[i]++;
    return result;
}

std::string signature(std::vector<int> const& vertype) {
    return sig(sigresult(vertype));
}

std::string filesignature(std::vector<int> const& vertype) {
    std::vector<int> result = sigresult(vertype);
    std::string s = "";
    for (int i = 0; i < (int)result.size(); i++) {
        if (result[i] > 0) {
            s = s + mainlist[i].code;
            if (result[i] > 1) {
                s = s + std::to_string(result[i]);
            }
            s = s + " ";
        }
    }
    return s.substr(0, s.size() - 1);
}

int vertypesolvedadd(std::vector<int> const& vertype) {
    std::vector<int> result = sigresult(vertype);
    std::vector<int> res2;
    int x = 0;
    while (x < (int)vertypesolved.size()) {
        res2 = vertypesolved[x].vertices;
        if (result == res2) {
            vertypesolved[x].count++;
            return x;
        }
        x++;
    }
    vertypesolved.push_back({ result,1 });
    return x;
}

int initex() {
    for (int i = 0; i < symbolcount; i++) {
        configuration newconf;
        newconf.label = mainlist[i].label;
        newconf.lneig = mainlist[i].lneig;
        newconf.rneig = mainlist[i].rneig;
        newconf.mirro = mainlist[i].mirro;
        newconf.lvert = mainlist[i].lvert;
        newconf.vertype = { i };
        newconf.num = 1;
        newconf.kcnt = mainlist[i].counting;
        newconf.dfs_depth = 0;
        newconf.glue = std::vector<int>(newconf.lneig.size(), -1);
        extend(newconf);
    }
    return 0;
}


int writecyclefinal(configuration const& conf, std::ostream& filen) {
    int v = 0;
    std::vector<int> smet = {};
    std::vector<std::string> mainstlist = {};
    std::vector<int> sublist = {};
    bool ultrachiral = true;
    std::vector<int> repeatlist = {};
    for (int cy = 0; cy < (int)conf.glue.size(); cy++) {
        std::string mainst = "";
        int count = 0;
        int minmirror = conf.glue.size();
        if (std::find(smet.begin(), smet.end(), cy) == smet.end()) {
            int left = cy;
            int right = conf.rneig[left];
            v = CLASS_L[conf.lvert[right]];
            bool cont = true;
            while (cont) {
                smet.push_back(left);
                if (conf.mirro[right] < minmirror) {
                    minmirror = conf.mirro[right];
                }
                mainst = mainst + conf.label[left] + "/" + conf.label[right] + "(" + CLASS_DISP[conf.lvert[right]] + ")-";
                count++;
                left = conf.glue[right];
                if (left != cy) {
                    right = conf.rneig[left];
                }
                else {
                    cont = false;
                }
            }
            mainst = mainst.substr(0, mainst.size() - 1);
            int ratio = v / count;
            repeatlist.push_back(ratio);
            if (ratio != 1) {
                mainst = "[" + mainst + "]x" + std::to_string(ratio);
            }
            mainstlist.push_back(mainst);
            if (std::find(smet.begin(), smet.end(), minmirror) != smet.end()) {
                sublist.push_back(0);
                ultrachiral = false;
            }
            else {
                int left = minmirror;
                mainst = "";
                right = conf.rneig[left];
                v = CLASS_L[conf.lvert[right]];
                cont = true;
                while (cont) {
                    smet.push_back(left);
                    mainst = mainst + conf.label[left] + "/" + conf.label[right] + "(" + CLASS_DISP[conf.lvert[right]] + ")-";
                    count++;
                    left = conf.glue[right];
                    if (left != minmirror) {
                        right = conf.rneig[left];
                    }
                    else {
                        cont = false;
                    }
                }
                mainst = mainst.substr(0, mainst.size() - 1);
                repeatlist.push_back(ratio);
                if (ratio != 1) {
                    mainst = "[" + mainst + "]x" + std::to_string(ratio);
                }
                mainstlist.push_back(mainst);
                sublist.push_back(1);
                sublist.push_back(2);
            }
        }
    }
    std::string header;
    std::string subheader;
    for (int m = 0; m < (int)mainstlist.size(); m++) {
        std::string mainst = mainstlist[m];
        int sub = sublist[m];
        if (sub == 0) {
            filen << std::to_string(m) << ": " << mainst;
        }
        else if (sub == 1) {
            if (!ultrachiral) {
                header = std::to_string(m) + "/" + std::to_string(m + 1) + ": ";
            }
            else {
                header = std::to_string(m / 2) + ": ";
            }
            subheader = std::string(header.size(), ' ');
            filen << header << mainst;
        }
        else {
            filen << subheader << mainst;
        }
        filen << "\n";
    }
    filen << "---\n";
    return 0;
}

int writesolution(configuration const& conf) {
    solfound++;
    std::string fine = finename(conf);
    std::string vv = verbalvertices(conf.vertype);
    std::string versig = signature(conf.vertype);
    std::string wc = writeconway(conf);
    int re = vertypesolvedadd(conf.vertype);
    std::string ret = std::to_string(vertypesolved[re].count);
    std::string filesig = filesignature(conf.vertype);
    // dirsig prefix (NN/NN_fam/filesig/) so decode.py/develop.py's tes_id() can parse the id —
    // matches the Python solver's tesline; the C++ original omitted it.
    std::string tesfile1 = fname(conf.kcnt) + "/" + fine + "/" + filesig + "/"
                         + solvercode + " raw " + filesig + " " + ret + ".tes";

    std::ostream* blkp;
    if (eu_stream) {
        blkp = &std::cout;
    } else {
        std::string fullname = filepath + listfile + fine + ".txt";
        bool found = false;
        for (auto& rt : runtotal) if (fine == rt.soltype) { rt.solnum++; found = true; break; }
        if (!found) runtotal.push_back(runt{fine, 1});
        globe.open(fullname, found ? std::ios::app : std::ios::out);
        blkp = &globe;
    }
    std::ostream& blk = *blkp;
    blk << "Number of vertex types: " << conf.num << "\n"
        << vv << "\n" << versig << "\n"
        << "TES file: " << tesfile1 << "\n"
        << wc << "\n";
    writecyclefinal(conf, blk);
    blk << "\n\n";
    if (!eu_stream) globe.close();
    return 0;
}

bool simplify(configuration const& conf) {
    int le = conf.rneig.size();

    std::vector<int> eq_class(le, 0);

    int num_eq_class = 1;

    int last_num_eq_class = 0;

    while (num_eq_class > last_num_eq_class) {
        using vertex_data = std::array<int, 6>;
        std::vector<std::pair<vertex_data, int > > data(le);

        last_num_eq_class = num_eq_class;
        for (int i = 0; i < le; i++) {
            data[i].first[0] = conf.lvert[i];
            data[i].first[1] = eq_class[i];
            data[i].first[2] = eq_class[conf.mirro[i]];
            data[i].first[3] = eq_class[conf.glue[i]];
            data[i].first[4] = eq_class[conf.lneig[i]];
            data[i].first[5] = eq_class[conf.rneig[i]];
            data[i].second = i;
        }

        sort(data.begin(), data.end());
        eq_class[data[0].second] = 0;

        num_eq_class = 0;

        for (int i = 1; i < le; i++) {
            if (data[i].first != data[i - 1].first) num_eq_class++;
            eq_class[data[i].second] = num_eq_class;
        }

        num_eq_class++;
    }

    return num_eq_class == le;
}

int extend(configuration& slist) {
    slist.dfs_depth++;
    std::vector<std::string> potential = {};
    int success = 0;
    if (eu_trace) {
        if (solcount % 100000 == 0) {
            gen.close();
            gen.open(filepath + genfile + "1.txt");
        }
        gen << "Resolving configuration " << solcount + 1 << "\n";
        gen << verbalvertices(slist.vertype) << "\n";
        gen << signature(slist.vertype) << "\n";
        gen << std::to_string(slist.num) << "\n";
        gen << writeconway(slist) << "\n";
    }
    writecycle(slist, gen);   // computes global mincycle (read below) — must run even without tracing
    int firstfree;
    int minc;
    firstfree = mincycle[0];
    minc = mincycle[1];
    if (slist.label[firstfree][0] == '*') {
        firstfree = slist.mirro[firstfree];
    }
    bool mirrored = (slist.mirro[firstfree] == firstfree);
    if (eu_trace) gen << "firstfree = " << std::to_string(firstfree) << "(" << slist.label[firstfree] << "), between " <<
        CLASS_DISP[slist.lvert[firstfree]] << " and " << CLASS_DISP[slist.lvert[slist.mirro[firstfree]]] <<
        ". Difference = " << std::to_string(minc) << "\n";
    for (int i = 0; i < (int)slist.rneig.size(); i++) {
        if (slist.glue[i] == -1) {
            bool mirroredi = slist.mirro[i] == i;
            if (mirrored == mirroredi) {
                slist.glue[firstfree] = i;
                slist.glue[i] = firstfree;
                if (!mirrored) {
                    slist.glue[slist.mirro[firstfree]] = slist.mirro[i];
                    slist.glue[slist.mirro[i]] = slist.mirro[firstfree];
                }
                configuration& newconf = slist;
                if (checkpart(newconf)) {
                    if (std::find(newconf.glue.begin(), newconf.glue.end(), -1) == newconf.glue.end()) {
                        if (newconf.kcnt > seen) {
                            if (simplify(newconf)) {
                                writesolution(newconf);
                            }
                        }
                        else nckzero++;   // closed but zero counting vertices: not a tiling record
                    }
                    else {
                        success++;
                        extend(newconf);
                        if (eu_trace) potential.push_back(conwaysymbol(newconf.label[firstfree], newconf.label[i]));
                    }
                }
                slist.glue[firstfree] = -1;
                slist.glue[i] = -1;
                if (!mirrored) {
                    slist.glue[slist.mirro[firstfree]] = -1;
                    slist.glue[slist.mirro[i]] = -1;
                }
            }
        }
    }
    bool canK = slist.kcnt < maxnum;
    bool canNC = has_noncounting && (slist.num - slist.kcnt) < nc_budget;
    if (canK || canNC) {
        for (int gr = slist.vertype[0]; gr < symbolcount; gr++) {
            // per-category budget: counting types against maxnum (=k), noncounting
            // (dent-fill) types against the loud EU_NCBUDGET cap
            if (mainlist[gr].counting) {
                if (!canK) continue;
            } else {
                if (!has_noncounting) continue;
                if (!canNC) { ncbudget_hits++; continue; }
            }
            int l = slist.rneig.size();
            configuration& newconf = slist;
            int symbollength = mainlist[gr].rneig.size();
            for (int gg = 0; gg < symbollength; gg++) {
                newconf.rneig.push_back(l + mainlist[gr].rneig[gg]);
                newconf.lneig.push_back(l + mainlist[gr].lneig[gg]);
                newconf.mirro.push_back(l + mainlist[gr].mirro[gg]);
                newconf.lvert.push_back(mainlist[gr].lvert[gg]);
                newconf.label.push_back(edgelabel(mainlist[gr].label[gg], newconf.num));
                newconf.glue.push_back(-1);
            }
            newconf.vertype.push_back(gr);
            newconf.num++;
            newconf.kcnt += mainlist[gr].counting;
            int ran = ferk(mainlist[gr]);
            for (int i = l; i < l + ran; i++) {
                configuration& newconf2 = newconf;
                bool mirroredi = newconf2.mirro[i] == i;
                if (mirrored == mirroredi) {
                    newconf2.glue[firstfree] = i;
                    newconf2.glue[i] = firstfree;
                    if (!mirrored) {
                        newconf2.glue[newconf2.mirro[firstfree]] = newconf2.mirro[i];
                        newconf2.glue[newconf2.mirro[i]] = newconf2.mirro[firstfree];
                    }
                    if (checkpart(newconf2)) {
                        if (std::find(newconf2.glue.begin(), newconf2.glue.end(), -1) == newconf2.glue.end()) {
                            if (newconf2.kcnt > seen) {
                                if (simplify(newconf2)) {
                                    writesolution(newconf2);
                                }
                            }
                            else nckzero++;
                        }
                        else {
                            success++;
                            extend(newconf2);
                            if (eu_trace) potential.push_back(conwaysymbol(newconf2.label[firstfree], newconf2.label[i]) + " " + mainlist[gr].symbol);
                        }
                    }
                    newconf2.glue[firstfree] = -1;
                    newconf2.glue[i] = -1;
                    if (!mirrored) {
                        newconf2.glue[newconf2.mirro[firstfree]] = -1;
                        newconf2.glue[newconf2.mirro[i]] = -1;
                    }
                }
            }
            newconf.num--;
            newconf.kcnt -= mainlist[gr].counting;
            newconf.vertype.pop_back();
            newconf.rneig.resize(l);
            newconf.lneig.resize(l);
            newconf.mirro.resize(l);
            newconf.lvert.resize(l);
            newconf.label.resize(l);
            newconf.glue.resize(l);
        }
    }
    if (eu_trace) {
        gen << "Added " << std::to_string(success) << " partial solution";
        if (success != 1) {
            gen << "s";
        }
        gen << "\n";
        if (potential.size() > 0) {
            for (int p = 0; p < (int)potential.size() - 1; p++) {
                gen << potential[p] << "; ";
            }
            gen << potential[potential.size() - 1] << "\n";
        }
        gen << "\n";
    }
    solcount++;
    if (eu_trace) std::cout << std::to_string(solcount) << " - depth " << slist.dfs_depth << "      \r";
    slist.dfs_depth--;
    return 0;
}

int main() {
    symbolcount = mainlist.size();
    for (auto const& v : mainlist) if (!v.counting) has_noncounting = true;
    if (eu_trace) {
        int filecount = 1;
        gen.open(filepath + genfile + std::to_string(filecount) + ".txt");
    }
    initex();
    if (eu_trace) gen.close();
    if (ncbudget_hits > 0) {
        std::cerr << "EU_NCBUDGET WARNING: noncounting-vertex budget (" << nc_budget
                  << ") bound the search " << ncbudget_hits << " time(s). COMPLETENESS NOT "
                  << "CERTIFIED for this run — re-run with EU_NCBUDGET=" << (nc_budget + 1)
                  << " and require identical catalogs (budget-fixpoint certificate).\n";
    }
    if (nckzero > 0) {
        std::cerr << "note: " << nckzero << " closed all-noncounting configuration(s) "
                  << "suppressed (no true vertex; not tilings by the Myers convention).\n";
    }
    return 0;
}