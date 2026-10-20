// Dump every heesch-sat grid as the frame finder's abstract grid (gridspec.h), as JSON on stdout,
// for baseline.js. frames.cpp builds the same spec in-process.
//
// Build (from tools/frames/): clang++ -std=c++20 -O2 -I../heesch-sat/src -o grid_spec grid_spec.cpp
// Usage: ./grid_spec > grids.json
//        gen -iamond -size 6 -free | ./grid_spec -cells   (shapes as cell lists, one per line)
#include <cstring>

#include "gridspec.h"

static void printCells( const std::vector<Cell>& cs )
{
	for( size_t i = 0; i < cs.size(); ++i ) printf( "%s[%d,%d,%d]", i ? "," : "", cs[i].n1, cs[i].n2, cs[i].t );
}

// heesch-sat shape lines ("I? x y x y ...", as gen writes them) to "n1 n2 t n1 n2 t ..." lines.
template<typename grid>
void cells( const char *line )
{
	std::vector<int> v;
	for( const char *q = line + 2; *q; ) {
		char *e;
		long x = strtol( q, &e, 10 );
		if( e == q ) break;
		v.push_back( (int)x );
		q = e;
	}
	for( size_t i = 0; i + 1 < v.size(); i += 2 ) {
		Cell c = cellOf<grid>( typename grid::point_t( v[i], v[i + 1] ) );
		printf( "%s%d %d %d", i ? " " : "", c.n1, c.n2, c.t );
	}
	printf( "\n" );
}

int main( int argc, char **argv )
{
	if( argc > 1 && !strcmp( argv[1], "-cells" ) ) {
		char line[1 << 16];
		while( fgets( line, sizeof line, stdin ) ) {
			if( strlen( line ) < 3 ) continue;
			dispatchGrid( cells, getGridType( line[0] ), line );
		}
		return 0;
	}
	printf( "{" );
	for( size_t k = 0; k < std::size( GRID_NAMES ); ++k ) {
		Spec g;
		specByName( GRID_NAMES[k], g );
		printf( "%s\n\"%s\": {\"T\": %d, \"V\": [[%d,%d],[%d,%d]], \"origin\": [", k ? "," : "", GRID_NAMES[k], g.T, g.V[0][0],
		        g.V[0][1], g.V[1][0], g.V[1][1] );
		for( int t = 0; t < g.T; ++t ) printf( "%s[%d,%d]", t ? "," : "", g.origin[t][0], g.origin[t][1] );
		printf( "], \"adj\": [" );
		for( int t = 0; t < g.T; ++t ) { printf( "%s[", t ? ", " : "" ); printCells( g.adj[t] ); printf( "]" ); }
		printf( "],\n \"syms\": [" );
		for( size_t s = 0; s < g.syms.size(); ++s ) {
			const Sym& S = g.syms[s];
			printf( "%s\n  {\"A\": [[%d,%d],[%d,%d]], \"refl\": %s, \"img\": [", s ? "," : "", S.A[0][0], S.A[0][1], S.A[1][0],
			        S.A[1][1], S.refl ? "true" : "false" );
			printCells( S.img );
			printf( "]}" );
		}
		printf( "]}" );
	}
	printf( "\n}\n" );
	return 0;
}
