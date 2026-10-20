// Frame finder: every region that a polyform tiles in exactly two ways with no tile in the same place
// in both, up to N tiles per tiling, on any heesch-sat grid.
//
// The search is Frame Finder's (FrameFinder.html; baseline.js is that code made grid-generic):
// place one tile of tiling 0 on the region's lowest cell, then repeatedly take the debt cell (covered
// by one tiling, not the other) with the fewest legal tiles and branch on them, until both tilings
// cover the same region; keep it if it has exactly two tilings. Changes, none of which loses a frame:
//   * tiling 1's tile on the anchor cell has a higher orientation index than tiling 0's. Both
//     tilings have a tile based on the anchor (the region's lowest cell is every covering tile's
//     lowest cell), and they differ because no tile is shared, so swapping the two tilings maps
//     every frame onto one search with this order. Halves the search.
//   * the tile-count and balance bounds are applied to each candidate before it is placed (they
//     depend only on how many of its cells the other tiling covers), so MRV counts only tiles that
//     survive them and a debt with none left kills the branch at once;
//   * debts are kept as incremental lists, not recomputed from every placed tile at every node;
//   * "same tile in the other tiling" is one lookup in a per-cell owner array;
//   * the tiling counter only tries each orientation's lowest cell on the lowest uncovered cell
//     (any other cell of the tile would put a tile cell below it, which is covered already);
//   * the branches run on threads with dynamic pickup.
// Output keys are the canonical forms baseline.js prints, so the two frame sets compare directly.
//
// Build: clang++ -std=c++20 -O3 -march=native -I../heesch-sat/src -o frames frames.cpp
// Usage: ./frames <grid> <N> [-threads k] [-noreflect] [-depth d] [-detail] [-tilings lo hi] < tiles
//   (one "n1 n2 t ..." line each). -tilings keeps the regions whose tiling count is lo..hi, not just 2,
//   and prints each one's count: the search still finds every minimal disjoint pair of tilings (see
//   below), so this lists the regions that carry one, by how many tilings they have in all.
//   -detail adds what the page draws: the tile's solver points and, per frame, both tilings as cell
//   maps of it, the holes and the overlap pieces (see Searcher::detail).
#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cstring>
#include <map>
#include <mutex>
#include <set>
#include <string>
#include <thread>

#include "gridspec.h"

using std::vector;
using C3 = std::array<int, 3>;  // (n1, n2, t)

static bool less3( const C3& a, const C3& b )
{
	return a[1] != b[1] ? a[1] < b[1] : a[0] != b[0] ? a[0] < b[0] : a[2] < b[2];
}

struct Group {
	vector<const Sym*> syms;
	C3 apply( const Sym& S, const C3& c ) const
	{
		const Cell& m = S.img[c[2]];
		return { S.A[0][0] * c[0] + S.A[0][1] * c[1] + m.n1, S.A[1][0] * c[0] + S.A[1][1] * c[1] + m.n2, m.t };
	}
	static void normalize( vector<C3>& cs )
	{
		int mx = INT32_MAX, my = INT32_MAX;
		for( auto& c : cs ) mx = std::min( mx, c[0] ), my = std::min( my, c[1] );
		for( auto& c : cs ) c[0] -= mx, c[1] -= my;
		std::sort( cs.begin(), cs.end(), less3 );
	}
	static std::array<int, 2> mins( const vector<C3>& cs )
	{
		std::array<int, 2> m { INT32_MAX, INT32_MAX };
		for( auto& c : cs ) m[0] = std::min( m[0], c[0] ), m[1] = std::min( m[1], c[1] );
		return m;
	}
	// The least image of cs; `how` gets the symmetry that made it and the shift that normalised it.
	vector<C3> canon( const vector<C3>& cs, std::pair<const Sym*, std::array<int, 2>>* how = nullptr ) const
	{
		vector<C3> best, t( cs.size() );
		for( const Sym* S : syms ) {
			for( size_t i = 0; i < cs.size(); ++i ) t[i] = apply( *S, cs[i] );
			auto m = mins( t );
			normalize( t );
			if( best.empty() || std::lexicographical_compare( t.begin(), t.end(), best.begin(), best.end(), less3 ) ) {
				best = t;
				if( how ) *how = { S, m };
			}
		}
		return best;
	}
	static std::string key( const vector<C3>& cs )
	{
		std::string s;
		for( size_t i = 0; i < cs.size(); ++i )
			s += ( i ? " " : "" ) + std::to_string( cs[i][0] ) + "," + std::to_string( cs[i][1] ) + "," + std::to_string( cs[i][2] );
		return s;
	}
};

// The tile's orientations laid out on a box of W x H lattice points, T cells each; cell index
// (y W + x) T + t. Offsets are taken from each orientation's lowest cell, so D[r][0] = 0.
struct Problem {
	int T, K, NOR, N, W, H, G, anchorBase;
	vector<int> D, type0;                              // D[r K + j]
	// Tiles on a cell of each type: orientation r, the cell's offset in it, and the other K - 1 cells
	// relative to that cell, nearest first (the ones most likely to be covered already).
	struct Cand { int r, off, rel; };
	vector<vector<Cand>> byType;
	vector<int> rel;
	vector<vector<int>> startsByType;                  // cell type -> r whose lowest cell has that type
	int NC = 0;
	vector<int> cls;                                   // balance class of each orientation
	// For drawing: the tile as given (normalised), and each orientation as symmetry made[r] of it,
	// shifted by -shift[r] lattice steps.
	vector<C3> tile;
	vector<vector<C3>> orient;
	vector<const Sym*> made;
	vector<std::array<int, 2>> shift;

	const Spec& spec;

	Problem( const Spec& g, const Group& grp, vector<C3> tile_, int N_ ) : T( g.T ), N( N_ ), tile( tile_ ), spec( g )
	{
		Group::normalize( tile );
		std::set<vector<C3>> seen;
		for( const Sym* S : grp.syms ) {
			vector<C3> o;
			for( auto& c : tile ) o.push_back( grp.apply( *S, c ) );
			auto m = Group::mins( o );
			Group::normalize( o );
			if( seen.insert( o ).second ) orient.push_back( o ), made.push_back( S ), shift.push_back( m );
		}
		NOR = (int)orient.size(), K = (int)tile.size();
		int ext = 1;
		for( auto& o : orient ) for( auto& c : o ) ext = std::max( { ext, std::abs( c[0] - o[0][0] ) + 1, c[1] - o[0][1] + 1 } );
		// At most 2N tiles, each overlapping the ones before: nothing gets further than 2N ext away.
		W = 2 * ( 2 * N * ext ) + 2 * ext + 4, H = 2 * N * ext + 2 * ext + 4, G = W * H * T;
		anchorBase = ( 2 * W + W / 2 ) * T;
		D.resize( NOR * K ), type0.resize( NOR ), byType.resize( T ), startsByType.resize( T );
		for( int r = 0; r < NOR; ++r ) {
			const auto& o = orient[r];
			type0[r] = o[0][2];
			startsByType[o[0][2]].push_back( r );
			for( int j = 0; j < K; ++j ) {
				D[r * K + j] = ( ( o[j][1] - o[0][1] ) * W + ( o[j][0] - o[0][0] ) ) * T + o[j][2] - o[0][2];
			}
			for( int j = 0; j < K; ++j ) {
				vector<std::pair<int, int>> near;
				for( int i = 0; i < K; ++i ) if( i != j ) {
					int dx = o[i][0] - o[j][0], dy = o[i][1] - o[j][1];
					near.push_back( { dx * dx + dy * dy, D[r * K + i] - D[r * K + j] } );
				}
				std::stable_sort( near.begin(), near.end(), []( auto& a, auto& b ) { return a.first < b.first; } );
				byType[o[j][2]].push_back( { r, D[r * K + j], (int)rel.size() } );
				for( auto& q : near ) rel.push_back( q.second );
			}
		}
		// The balance rule (baseline.js balanceClasses): orientations grouped by type-count vector;
		// with affinely independent vectors the region fixes each group's count in both tilings.
		vector<vector<long long>> vecs;
		cls.resize( NOR );
		for( int r = 0; r < NOR; ++r ) {
			vector<long long> v( T, 0 );
			for( auto& c : orient[r] ) v[c[2]]++;
			auto it = std::find( vecs.begin(), vecs.end(), v );
			cls[r] = (int)( it - vecs.begin() );
			if( it == vecs.end() ) vecs.push_back( v );
		}
		if( vecs.size() >= 2 ) {
			vector<vector<long long>> rows;
			for( size_t i = 1; i < vecs.size(); ++i ) {
				rows.emplace_back( T );
				for( int j = 0; j < T; ++j ) rows.back()[j] = vecs[i][j] - vecs[0][j];
			}
			size_t rank = 0;
			for( int col = 0; col < T && rank < rows.size(); ++col ) {
				size_t p = rank;
				while( p < rows.size() && !rows[p][col] ) ++p;
				if( p == rows.size() ) continue;
				std::swap( rows[rank], rows[p] );
				for( size_t i = 0; i < rows.size(); ++i ) if( i != rank && rows[i][col] ) {
					long long f = rows[i][col], h = rows[rank][col];
					for( int j = 0; j < T; ++j ) rows[i][j] = rows[i][j] * h - rows[rank][j] * f;
				}
				++rank;
			}
			if( rank == rows.size() ) NC = (int)vecs.size();
		}
	}
};

// A cell's heesch-sat solver point, and composition of the solver's maps (x, y) -> (ax+by+c, dx+ey+f).
using Xf = std::array<long long, 6>;
static std::array<long long, 2> pointOf( const Spec& g, long long n1, long long n2, int t )
{
	return { g.origin[t][0] + n1 * g.V[0][0] + n2 * g.V[1][0], g.origin[t][1] + n1 * g.V[0][1] + n2 * g.V[1][1] };
}
static Xf compose( const Xf& A, const Xf& B )
{
	return { A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2],
	         A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5] };
}
static Xf shifted( const Sym& S, const Spec& g, long long u, long long v )
{
	return { S.X[0], S.X[1], S.X[2] + u * g.V[0][0] + v * g.V[1][0], S.X[3], S.X[4], S.X[5] + u * g.V[0][1] + v * g.V[1][1] };
}

struct Step { int t, r, b; };
struct Task { int r0; vector<Step> steps; };

struct Searcher {
	const Problem& P;
	const Group& grp;
	const int K, T;
	vector<uint8_t> st, cv;                            // st: bit t set where tiling t covers
	vector<int32_t> own[2], pos[2];
	vector<uint32_t> inR;
	uint32_t stamp = 0;
	vector<int> dl[2];                                  // debt lists: cells tiling t still has to cover
	vector<int> plR[2], plB[2];
	int np[2] = { 0, 0 }, anchor = 0, r0 = 0, depth = 0;
	vector<int> clsN[2];
	vector<vector<int>> candR, candB;
	vector<Step> path;
	int collectDepth = 0;
	vector<Task>* tasks = nullptr;
	long long nodes = 0, closed = 0;
	vector<std::string> frames, details;
	bool wantDetail = false;
	int keepFrom = 2, countCap = 3;                     // keep regions with keepFrom..countCap-1 tilings
	vector<int> region, order, counts;

	Searcher( const Problem& P_, const Group& g ) : P( P_ ), grp( g ), K( P_.K ), T( P_.T )
	{
		for( int t = 0; t < 2; ++t ) {
			own[t].assign( P.G, 0 ), pos[t].assign( P.G, -1 );
			plR[t].resize( P.N + 2 ), plB[t].resize( P.N + 2 ), clsN[t].assign( std::max( P.NC, 1 ), 0 );
		}
		st.assign( P.G, 0 ), cv.assign( P.G, 0 ), inR.assign( P.G, 0 );
		candR.resize( 2 * P.N + 3, vector<int>( P.NOR * K ) ), candB = candR;
	}
	void addDebt( int t, int c ) { pos[t][c] = (int)dl[t].size(); dl[t].push_back( c ); }
	void dropDebt( int t, int c )
	{
		int i = pos[t][c], last = dl[t].back();
		dl[t][i] = last, pos[t][last] = i, dl[t].pop_back(), pos[t][c] = -1;
	}
	void place( int t, int r, int b )
	{
		const int* Dr = &P.D[r * K];
		for( int j = 0; j < K; ++j ) {
			int c = b + Dr[j];
			st[c] |= 1 << t;
			if( st[c] >> ( 1 - t ) & 1 ) dropDebt( t, c ); else addDebt( 1 - t, c );
		}
		own[t][b] = r + 1;
		if( P.NC ) clsN[t][P.cls[r]]++;
		plR[t][np[t]] = r, plB[t][np[t]] = b, np[t]++;
	}
	void unplace( int t )
	{
		int k = --np[t], r = plR[t][k], b = plB[t][k];
		const int* Dr = &P.D[r * K];
		for( int j = K - 1; j >= 0; --j ) {
			int c = b + Dr[j];
			st[c] &= ~( 1 << t );
			if( st[c] >> ( 1 - t ) & 1 ) addDebt( t, c ); else dropDebt( 1 - t, c );
		}
		own[t][b] = 0;
		if( P.NC ) clsN[t][P.cls[r]]--;
	}
	// Legal tiles of tiling t on cell c, up to cap. A tile is legal when it overlaps nothing of tiling
	// t, is not a tile of the other tiling, and leaves both tilings within N tiles: placing it with k
	// of its cells on the other tiling takes k debts off t and adds K - k to the other, so the bound
	// np + ceil(debts / K) <= N after placing is k >= kmin[t]. Likewise for the balance rule.
	int kmin[2], balTight = 0;
	void budget()
	{
		for( int t = 0; t < 2; ++t )
			kmin[t] = std::max( (int)dl[t].size() - ( P.N - np[t] - 1 ) * K, (int)dl[1 - t].size() + K - ( P.N - np[1 - t] ) * K );
		if( P.NC ) {
			int s = 0;
			for( int i = 0; i < P.NC; ++i ) s += std::max( clsN[0][i], clsN[1][i] );
			balTight = s >= P.N;
		}
	}
	// c is always a debt of t: covered by the other tiling, so it starts k at 1.
	int cands( int t, int c, int* outR, int* outB, int cap )
	{
		const uint8_t* s = st.data();
		const int32_t* ot = own[1 - t].data();
		const int km = kmin[t], mine = 1 << t, sh = 1 - t;
		int n = 0;
		for( const auto& e : P.byType[c % T] ) {
			int b = c - e.off, r = e.r;
			if( b < anchor || ot[b] == r + 1 ) continue;
			if( t == 1 && b == anchor && r <= r0 ) continue;
			if( balTight && clsN[t][P.cls[r]] >= clsN[1 - t][P.cls[r]] ) continue;
			const int* rel = &P.rel[e.rel];
			int j = 0, k = 1;
			for( ; j < K - 1; ++j ) {
				int v = s[c + rel[j]];
				if( v & mine ) break;
				k += v >> sh & 1;
			}
			if( j < K - 1 || k < km ) continue;
			if( outR ) outR[n] = r, outB[n] = b;
			if( ++n >= cap ) return n;
		}
		return n;
	}
	int count( int pos, int found, int limit )
	{
		while( pos < (int)order.size() && cv[order[pos]] ) ++pos;
		if( pos == (int)order.size() ) return found + 1;
		int c = order[pos];
		for( int r : P.startsByType[c % T] ) {
			const int* Dr = &P.D[r * K];
			int j = 0;
			while( j < K && inR[c + Dr[j]] == stamp && !cv[c + Dr[j]] ) ++j;
			if( j < K ) continue;
			for( j = 0; j < K; ++j ) cv[c + Dr[j]] = 1;
			found = count( pos + 1, found, limit );
			for( j = 0; j < K; ++j ) cv[c + Dr[j]] = 0;
			if( found >= limit ) break;
		}
		return found;
	}
	void record()
	{
		++closed;
		order.clear();
		for( int i = 0; i < np[0]; ++i ) for( int j = 0; j < K; ++j ) order.push_back( plB[0][i] + P.D[plR[0][i] * K + j] );
		std::sort( order.begin(), order.end() );
		++stamp;
		for( int c : order ) inR[c] = stamp;
		int c = count( 0, 0, countCap );
		if( c < keepFrom || c >= countCap ) return;
		vector<C3> cs;
		for( int c : order ) { int t = c % T, xy = c / T; cs.push_back( { xy % P.W, xy / P.W, t } ); }
		std::pair<const Sym*, std::array<int, 2>> how;
		frames.push_back( Group::key( grp.canon( cs, &how ) ) );
		if( wantDetail ) details.push_back( detail( cs, how, c ) );
		counts.push_back( c );
	}
	// What the page draws, in the canonical image of the frame and in heesch-sat solver points: each
	// tiling's copies as cell maps of the tile (six numbers a copy, as in a /heesch witness patch), the
	// holes' sizes in cells, and how the two tilings cut each other ([cells shared, pairs of tiles]).
	std::string detail( const vector<C3>& cs, const std::pair<const Sym*, std::array<int, 2>>& how, int tilings )
	{
		const Spec& g = P.spec;
		Xf canonXf = shifted( *how.first, g, -how.second[0], -how.second[1] );
		std::string out = "{\"n\": " + std::to_string( np[0] ) + ", \"t\": [";
		for( int t = 0; t < 2; ++t ) {
			out += t ? "], [" : "[";
			for( int i = 0; i < np[t]; ++i ) {
				int r = plR[t][i], b = plB[t][i], xy = b / T;
				const C3& o0 = P.orient[r][0];
				Xf copy = shifted( *P.made[r], g, xy % P.W - o0[0] - P.shift[r][0], xy / P.W - o0[1] - P.shift[r][1] );
				Xf m = compose( canonXf, copy );
				for( int k = 0; k < 6; ++k ) out += ( i || k ? "," : "" ) + std::to_string( m[k] );
			}
		}
		// Holes: the cells of the region's box (plus a margin) that no flood from its edge reaches.
		int x0 = INT32_MAX, y0 = INT32_MAX, x1 = INT32_MIN, y1 = INT32_MIN;
		for( auto& c : cs ) x0 = std::min( x0, c[0] ), x1 = std::max( x1, c[0] ), y0 = std::min( y0, c[1] ), y1 = std::max( y1, c[1] );
		x0 -= 2, y0 -= 2, x1 += 2, y1 += 2;
		std::set<C3> region( cs.begin(), cs.end() ), outside;
		auto inBox = [&]( const C3& c ) { return c[0] >= x0 && c[0] <= x1 && c[1] >= y0 && c[1] <= y1; };
		auto flood = [&]( C3 s, std::set<C3>& seen ) {
			int n = 0;
			vector<C3> st { s };
			seen.insert( s );
			while( !st.empty() ) {
				C3 c = st.back();
				st.pop_back(), ++n;
				for( const Cell& d : g.adj[c[2]] ) {
					C3 q { c[0] + d.n1, c[1] + d.n2, d.t };
					if( inBox( q ) && !region.count( q ) && seen.insert( q ).second ) st.push_back( q );
				}
			}
			return n;
		};
		for( int x = x0; x <= x1; ++x ) for( int y = y0; y <= y1; ++y ) for( int t = 0; t < T; ++t )
			if( ( x == x0 || x == x1 || y == y0 || y == y1 ) && !region.count( { x, y, t } ) && !outside.count( { x, y, t } ) )
				flood( { x, y, t }, outside );
		vector<int> holes;
		for( int x = x0; x <= x1; ++x ) for( int y = y0; y <= y1; ++y ) for( int t = 0; t < T; ++t )
			if( !region.count( { x, y, t } ) && !outside.count( { x, y, t } ) ) holes.push_back( flood( { x, y, t }, outside ) );
		std::sort( holes.begin(), holes.end() );
		out += "]], \"h\": [";
		for( size_t i = 0; i < holes.size(); ++i ) out += ( i ? "," : "" ) + std::to_string( holes[i] );
		// Overlap pieces: for each tile of one tiling and each tile of the other, the cells they share.
		std::map<int, int> who;
		for( int i = 0; i < np[0]; ++i ) for( int j = 0; j < K; ++j ) who[plB[0][i] + P.D[plR[0][i] * K + j]] = i;
		std::map<int, int> pieces;
		for( int i = 0; i < np[1]; ++i ) {
			std::map<int, int> shared;
			for( int j = 0; j < K; ++j ) shared[who[plB[1][i] + P.D[plR[1][i] * K + j]]]++;
			for( auto& [tile, k] : shared ) pieces[k]++;
		}
		out += "], \"p\": [";
		bool first = true;
		for( auto& [k, c] : pieces ) out += ( first ? "[" : ",[" ) + std::to_string( k ) + "," + std::to_string( c ) + "]", first = false;
		out += "]";
		if( countCap > 3 ) out += ", \"c\": " + std::to_string( tilings );
		return out + "}";
	}
	void search()
	{
		++nodes;
		if( dl[0].empty() && dl[1].empty() ) { record(); return; }
		if( collectDepth && depth == collectDepth ) { tasks->push_back( { r0, path } ); return; }
		budget();
		int best = INT32_MAX, bt = -1, bc = 0;
		for( int t = 0; t < 2; ++t )
			for( int c : dl[t] ) {
				int k = cands( t, c, nullptr, nullptr, best );
				if( k < best ) { best = k, bt = t, bc = c; if( !best ) return; }
			}
		int* CR = candR[depth].data();
		int* CB = candB[depth].data();
		int k = cands( bt, bc, CR, CB, INT32_MAX );
		for( int i = 0; i < k; ++i ) {
			place( bt, CR[i], CB[i] );
			path.push_back( { bt, CR[i], CB[i] } ), ++depth;
			search();
			--depth, path.pop_back();
			unplace( bt );
		}
	}
	void start( int r ) { r0 = r, anchor = P.anchorBase + P.type0[r], place( 0, r, anchor ); }
	void stop() { unplace( 0 ); }
	void run( const Task& task )
	{
		start( task.r0 );
		for( auto& s : task.steps ) place( s.t, s.r, s.b );
		path = task.steps, depth = (int)path.size();
		search();
		for( size_t i = task.steps.size(); i-- > 0; ) unplace( task.steps[i].t );
		stop();
		path.clear(), depth = 0, --nodes;  // the task's root was counted when it was split off
	}
};

int main( int argc, char** argv )
{
	if( argc < 3 ) { fprintf( stderr, "usage: frames <grid> <N> [-threads k] [-noreflect] [-depth d] < tiles\n" ); return 1; }
	Spec g;
	if( !specByName( argv[1], g ) ) { fprintf( stderr, "unknown grid %s\n", argv[1] ); return 1; }
	int N = atoi( argv[2] ), threads = 1, depthSplit = 3;
	bool refl = true, detail = false;
	int keepFrom = 2, countCap = 3;
	for( int i = 3; i < argc; ++i ) {
		if( !strcmp( argv[i], "-threads" ) ) threads = atoi( argv[++i] );
		else if( !strcmp( argv[i], "-noreflect" ) ) refl = false;
		else if( !strcmp( argv[i], "-detail" ) ) detail = true;
		else if( !strcmp( argv[i], "-depth" ) ) depthSplit = atoi( argv[++i] );
		else if( !strcmp( argv[i], "-tilings" ) ) keepFrom = atoi( argv[++i] ), countCap = atoi( argv[++i] ) + 1;
	}
	Group grp;
	for( auto& S : g.syms ) if( refl || !S.refl ) grp.syms.push_back( &S );
	char line[1 << 16];
	while( fgets( line, sizeof line, stdin ) ) {
		vector<C3> tile;
		std::string text( line );
		while( !text.empty() && isspace( (unsigned char)text.back() ) ) text.pop_back();
		for( char* q = line;; ) {
			C3 c;
			int got = 0;
			for( int k = 0; k < 3; ++k ) {
				char* e;
				long v = strtol( q, &e, 10 );
				if( e == q ) break;
				c[k] = (int)v, q = e, ++got;
			}
			if( got < 3 ) break;
			tile.push_back( c );
		}
		if( tile.empty() ) continue;
		auto t0 = std::chrono::steady_clock::now();
		Problem P( g, grp, tile, N );
		std::map<std::string, std::pair<std::string, int>> frames;  // key -> detail (empty without -detail), tilings
		auto take = [&]( const Searcher& S ) {
			for( size_t i = 0; i < S.frames.size(); ++i ) frames.emplace( S.frames[i], std::make_pair( detail ? S.details[i] : "", S.counts[i] ) );
		};
		auto setup = [&]( Searcher& S ) { S.wantDetail = detail, S.keepFrom = keepFrom, S.countCap = countCap; };
		long long nodes = 0, closed = 0;
		if( threads <= 1 ) {
			Searcher S( P, grp );
			setup( S );
			for( int r = 0; r < P.NOR; ++r ) { S.start( r ); S.search(); S.stop(); }
			take( S ), nodes = S.nodes, closed = S.closed;
		} else {
			vector<Task> tasks;
			Searcher S0( P, grp );
			S0.collectDepth = depthSplit, S0.tasks = &tasks, setup( S0 );
			for( int r = 0; r < P.NOR; ++r ) { S0.start( r ); S0.search(); S0.stop(); }
			take( S0 ), nodes = S0.nodes, closed = S0.closed;
			std::atomic<size_t> next { 0 };
			std::mutex mu;
			vector<std::thread> pool;
			for( int w = 0; w < threads; ++w )
				pool.emplace_back( [&] {
					Searcher S( P, grp );
					setup( S );
					for( size_t i; ( i = next++ ) < tasks.size(); ) S.run( tasks[i] );
					std::lock_guard<std::mutex> lk( mu );
					take( S ), nodes += S.nodes, closed += S.closed;
				} );
			for( auto& th : pool ) th.join();
		}
		double secs = std::chrono::duration<double>( std::chrono::steady_clock::now() - t0 ).count();
		printf( "{\"tile\": \"%s\", \"frames\": [", text.c_str() );
		bool first = true;
		for( auto& f : frames ) printf( "%s\"%s\"", first ? "" : ", ", f.first.c_str() ), first = false;
		if( countCap > 3 ) {
			printf( "], \"tilings\": [" );
			first = true;
			for( auto& f : frames ) printf( "%s%d", first ? "" : ", ", f.second.second ), first = false;
		}
		printf( "], \"nodes\": %lld, \"closed\": %lld, \"secs\": %.4f", nodes, closed, secs );
		if( detail ) {
			// The tile's cells as solver points, which the cell maps act on; then each frame's drawing.
			printf( ", \"pts\": [" );
			for( size_t i = 0; i < P.tile.size(); ++i ) {
				auto q = pointOf( g, P.tile[i][0], P.tile[i][1], P.tile[i][2] );
				printf( "%s%lld,%lld", i ? "," : "", q[0], q[1] );
			}
			// Every orientation of the tile as a solver map, and the translation lattice: with them the page
			// can place any copy, and so list every tiling of a region, not only the pair stored here.
			printf( "], \"orient\": [" );
			for( int r = 0; r < P.NOR; ++r ) for( int k = 0; k < 6; ++k ) printf( "%s%d", r || k ? "," : "", P.made[r]->X[k] );
			printf( "], \"period\": [%d,%d,%d,%d", g.V[0][0], g.V[0][1], g.V[1][0], g.V[1][1] );
			printf( "], \"detail\": [" );
			first = true;
			for( auto& f : frames ) printf( "%s%s", first ? "" : ", ", f.second.first.c_str() ), first = false;
			printf( "]" );
		}
		printf( "}\n" );
		fflush( stdout );
	}
	return 0;
}
