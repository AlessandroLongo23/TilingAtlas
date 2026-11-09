// The depth-first loop of homogeneous.py, in C++ for speed. Same search, same order, same pruning: the
// catalogue (figures, flags, the two known involutions, symmetries, subgroups, candidates) is built by
// homogeneous.py and read from stdin; every finished symbol goes to stdout as one line for Python to read.
//
//   homogeneous_dfs <start> < catalogue.txt          each figure owns at most one cell (vertex, edge kinds)
//   homogeneous_dfs <start> <kmax> [h [part parts depth]] < catalogue.txt   face-stars kind (h: the start's h-th
//       stabilizer only; part i of n: only every n-th subtree at that depth, from the i-th): the figures are vertex stars and may recur,
//       at most kmax cells (vertex orbits) in all; the catalogue ends with the face table. Every face is read as
//       it grows: an open one must be a run of corners of a valid face figure that no closed face orbit owns yet, a
//       complete one such a figure, and a closed face orbit claims its figure.
//   out: "R <n> F0 f0 F1 f1 ... | s0 | s1 | s2" per symbol (chambers as figure and flag, then the three
//   involutions); "N <nodes> <cap hits>" last, where a cap hit is a branch the cap on cells cut (none: the
//   result holds for every k)
#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <unordered_map>
#include <vector>
using namespace std;
typedef vector<int> VI;

struct Fig {
  int nf;
  VI m01, m12, in1, in2;      // in1, in2: the two known involutions on flags (indices I1 < I2)
  vector<VI> aut, sub;        // sub: per subgroup, flag -> orbit number in first-seen order
  vector<vector<pair<int, VI>>> reach;  // per flag: (figure', its flags the chamber may be, up to symmetry)
  VI word;                    // face-stars: per flag, the star read from that flag's face (index into WORDS)
};

int EXT, I1, I2, START, KMAX = 0;
vector<Fig> F;
VI eF, ef, wd, s[3];          // per chamber: figure, flag, star word
vector<VI> of;                // per cell: flag -> chamber
vector<VI> cells;             // per figure: its cells
unordered_map<string, int> WORDS, FULL;  // star word -> index; a face's corner words, any placement -> figure
unordered_map<string, VI> RUN;  // the first 1 .. p-1 corner words of any placement -> the figures that have them
vector<char> owned;           // figure -> some closed face orbit has it
long long nodes = 0, hits = 0, cut = 0;
int PART = 0, PARTS = 1, DEPTH = -1;
auto T0 = chrono::steady_clock::now();

int rd() { int x; if (scanf("%d", &x) != 1) exit(2); return x; }
VI rdv(int n) { VI v(n); for (auto& x : v) x = rd(); return v; }
string str(const VI& v) { return string(v.begin(), v.end()); }   // words < 256 and sizes < 256: one byte each

void add(int G, const VI& H) {
  int j = of.size(), base = eF.size(), nf = F[G].nf, k = 0;
  of.push_back(VI(nf));
  for (int f = 0; f < nf; f++) {
    of[j][f] = base + H[f];
    if (H[f] == k) { eF.push_back(G); ef.push_back(f); wd.push_back(KMAX ? F[G].word[f] : -1); k++; }
  }
  for (int x = base; x < (int)eF.size(); x++)
    for (int i = 0; i < 3; i++)
      s[i].push_back(i == I1 ? of[j][F[G].in1[ef[x]]] : i == I2 ? of[j][F[G].in2[ef[x]]] : -1);
  cells[G].push_back(j);
}

void drop(int G) {
  int n = of.back()[0];
  eF.resize(n); ef.resize(n); wd.resize(n);
  for (int i = 0; i < 3; i++) s[i].resize(n);
  of.pop_back();
  cells[G].pop_back();
}

int mval(int a, int b, int x) {
  if (a > b) swap(a, b);
  return a == 0 && b == 1 ? F[eF[x]].m01[ef[x]] : a == 1 && b == 2 ? F[eF[x]].m12[ef[x]] : 2;
}

bool ok(int x) {
  VI& se = s[EXT];
  for (int i : {I1, I2}) {
    VI& si = s[i];
    int m = mval(EXT, i, x), y = x, r = 0, z;
    bool closed = false;
    while (true) {
      z = se[y];
      if (z < 0) break;
      y = si[z]; r++;
      if (y == x) { closed = true; break; }
    }
    if (closed) { if (m % r) return false; continue; }
    int rb = 0; y = x;
    while (true) { z = se[si[y]]; if (z < 0) break; y = z; rb++; }
    if (r + rb + 1 > m) return false;
  }
  return true;
}

// face-stars: the face of chamber x read corner by corner (corner i+1 = s0 s1 of corner i, each corner's star read
// from the face). -1: no valid figure fits; >= 0: x's face orbit has just closed and claims this figure; -2: neither.
int faceCheck(int x) {
  int p = F[eF[x]].m01[ef[x]], a = x;
  for (int t = 0; t < p && s[0][a] >= 0; t++) a = s[1][s[0][a]];
  string key;
  for (int b = a; (int)key.size() < p;) {
    key.push_back((char)wd[b]);
    if ((int)key.size() == p || (b = s[0][s[1][b]]) < 0) break;
  }
  if ((int)key.size() < p) {
    auto it = RUN.find(key);
    if (it != RUN.end())
      for (int id : it->second)
        if (!owned[id]) return -2;
    return -1;
  }
  auto it = FULL.find(key);
  if (it == FULL.end() || owned[it->second]) return -1;
  for (int y = x;;) {
    int z = s[0][y];
    if (z < 0) return -2;
    if ((y = s[1][z]) == x) break;
  }
  owned[it->second] = 1;
  return it->second;
}

bool alive() {
  if (KMAX && (int)of.size() < KMAX) return true;
  bool capped = KMAX > 0;
  VI& se = s[EXT];
  for (int x = 0; x < (int)se.size(); x++) {
    if (se[x] >= 0) continue;
    bool any = false;
    for (auto& [G, fl] : F[eF[x]].reach[ef[x]]) {
      if (!KMAX && cells[G].empty()) { any = true; break; }
      for (int j : cells[G]) {
        for (int g : fl) { int y = of[j][g]; if (y == x || se[y] < 0) { any = true; break; } }
        if (any) break;
      }
      if (any) break;
    }
    if (!any) { hits += capped; return false; }
  }
  return true;
}

void emit() {
  printf("R %d", (int)eF.size());
  for (size_t x = 0; x < eF.size(); x++) printf(" %d %d", eF[x], ef[x]);
  for (int i = 0; i < 3; i++) { printf(" |"); for (int y : s[i]) printf(" %d", y); }
  printf("\n");
}

void dfs(int depth);

void attempt(int x, int y, int depth) {
  s[EXT][x] = y; s[EXT][y] = x;
  if (ok(x)) {
    int c = KMAX ? faceCheck(x) : -2;
    if (c != -1 && alive()) dfs(depth + 1);
    if (c >= 0) owned[c] = 0;
  }
  s[EXT][x] = -1; s[EXT][y] = -1;
}

void dfs(int depth) {
  if (depth == DEPTH && cut++ % PARTS != PART) return;
  if (!(++nodes & 0xFFFFFF)) {
    double t = chrono::duration<double>(chrono::steady_clock::now() - T0).count();
    fprintf(stderr, "   ... start %d: %lld nodes, %d chambers deep, %.0f s\n", START, nodes, (int)eF.size(), t);
    fflush(stderr);
  }
  VI& se = s[EXT];
  int x = -1, best = 1 << 30;
  for (int z = 0; z < (int)se.size(); z++) {   // fill the open chamber whose face or vertex is nearest to closing
    if (se[z] >= 0) continue;
    for (int i : {I1, I2}) {
      int k = 0, y = z, w;
      while ((w = se[s[i][y]]) >= 0 && w != z) { y = w; k++; }
      if (mval(EXT, i, z) - k < best) { best = mval(EXT, i, z) - k; x = z; }
    }
    if (best <= 1) break;
  }
  if (x < 0) { emit(); return; }
  int G0 = eF[x], f0 = ef[x];
  for (auto& [G, fl] : F[G0].reach[f0]) {
    for (size_t i = 0, n = cells[G].size(); i < n; i++) {   // a cell already in the symbol
      VI cand;
      for (int g : fl) { int y = of[cells[G][i]][g]; if (find(cand.begin(), cand.end(), y) == cand.end()) cand.push_back(y); }
      sort(cand.begin(), cand.end());
      for (int y : cand)
        if (y == x || s[EXT][y] < 0) attempt(x, y, depth);
    }
    if (KMAX ? (int)of.size() < KMAX : cells[G].empty())   // a new cell, under each stabilizer
      for (auto& H : F[G].sub) { add(G, H); attempt(x, of.back()[fl[0]], depth); drop(G); }
    else hits += KMAX > 0;
  }
}

int main(int argc, char** argv) {
  if (argc != 2 && argc != 3 && argc != 4 && argc != 7) {
    fprintf(stderr, "usage: homogeneous_dfs start [kmax [h [part parts depth]]] < catalogue\n");
    return 1;
  }
  START = atoi(argv[1]);
  if (argc >= 3) KMAX = atoi(argv[2]);
  int H = argc >= 4 ? atoi(argv[3]) : -1;
  if (argc == 7) PART = atoi(argv[4]), PARTS = atoi(argv[5]), DEPTH = atoi(argv[6]);
  EXT = rd(); I1 = rd(); I2 = rd();
  int n = rd();
  F.resize(n); cells.resize(n);
  for (auto& g : F) {
    g.nf = rd();
    g.m01 = rdv(g.nf); g.m12 = rdv(g.nf); g.in1 = rdv(g.nf); g.in2 = rdv(g.nf);
    int na = rd(); for (int i = 0; i < na; i++) g.aut.push_back(rdv(g.nf));
    int ns = rd(); for (int i = 0; i < ns; i++) g.sub.push_back(rdv(g.nf));
    g.reach.resize(g.nf);
    for (int f = 0; f < g.nf; f++) {
      int no = rd();
      for (int i = 0; i < no; i++) { int G = rd(), c = rd(); g.reach[f].push_back({G, VI{c}}); }
    }
  }
  if (KMAX) {                             // the face table: star words, then per figure all its placements
    int nw = rd();
    if (nw > 255) { fprintf(stderr, "too many star words\n"); return 1; }
    for (int i = 0; i < nw; i++) WORDS[str(rdv(rd()))] = i;
    int nfig = rd();
    owned.assign(nfig, 0);
    for (int id = 0; id < nfig; id++) {
      int p = rd(), ni = rd();
      for (int i = 0; i < ni; i++) {
        string key = str(rdv(p));
        FULL[key] = id;
        for (int l = 1; l < p; l++) {
          VI& ids = RUN[key.substr(0, l)];
          if (ids.empty() || ids.back() != id) ids.push_back(id);
        }
      }
    }
    for (auto& g : F) {                   // the star read from each flag's face: (face, across s2, onwards)
      g.word.resize(g.nf);
      for (int f = 0; f < g.nf; f++) {
        VI w{g.m01[f]};
        for (int y = g.in2[f]; (int)w.size() < g.m12[f]; y = g.in2[g.in1[y]]) w.push_back(g.m01[y]);
        auto it = WORDS.find(str(w));
        g.word[f] = it == WORDS.end() ? -1 : it->second;
      }
    }
  }
  for (auto& g : F)                       // the flags a chamber of figure' may be: images of c, c first
    for (auto& row : g.reach) {
      vector<pair<int, VI>> kept;
      for (auto& [G, fl] : row) {
        if (G < START) continue;
        int c = fl[0]; VI out{c};
        for (auto& p : F[G].aut) { bool dup = false; for (int h : out) dup |= h == p[c]; if (!dup) out.push_back(p[c]); }
        kept.push_back({G, out});
      }
      row = kept;
    }
  for (int h = 0; h < (int)F[START].sub.size(); h++)
    if (H < 0 || h == H) { add(START, F[START].sub[h]); dfs(0); drop(START); }
  printf("N %lld %lld\n", nodes, hits);
  return 0;
}
