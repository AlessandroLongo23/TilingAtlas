// Dump the geometry of every grid heesch-sat knows, as JSON on stdout, so lib/heesch/grids.json is
// generated from the solver's own grid classes instead of transcribed from them.
//
// For each grid: the translation lattice, the page basis, and every cell within a box of the origin
// with its corners in grid (cell) coordinates. gen_grids.py reduces the cells to one per translation
// class and scales everything to integers.
//
// Build (from tools/heesch/):  clang++ -std=c++20 -I../heesch-sat/src -I/opt/homebrew/include \
//                                -o dump_grids dump_grids.cpp
#include <iostream>
#include <set>
#include <vector>

#include "grid.h"

template<typename grid>
void dump( const char *name, bool& first )
{
	using point_t = typename grid::point_t;
	const int R = 14;

	// Every cell reachable from the origin cells by crossing edges, inside the box.
	std::set<std::pair<int, int>> seen;
	std::vector<point_t> work;
	for( size_t i = 0; i < grid::num_tile_types; ++i ) {
		work.push_back( grid::origins[i] );
	}
	std::vector<point_t> cells;
	while( !work.empty() ) {
		point_t p = work.back();
		work.pop_back();
		if( p.getX() < -R || p.getX() > R || p.getY() < -R || p.getY() > R ) continue;
		if( !seen.insert( { p.getX(), p.getY() } ).second ) continue;
		cells.push_back( p );
		const auto *nv = grid::getEdgeNeighbourVectors( p );
		for( size_t i = 0; i < grid::numEdgeNeighbours( p ); ++i ) {
			work.push_back( p + point_t( nv[i].getX(), nv[i].getY() ) );
		}
	}

	auto e1 = grid::gridToPage( { 1.0, 0.0 } );
	auto e2 = grid::gridToPage( { 0.0, 1.0 } );
	std::cout << ( first ? "" : ",\n" ) << "\"" << name << "\": {\"prefix\": \""
		<< gridTypeAbbreviation( grid::grid_type ) << "\", \"period\": [["
		<< (int)grid::translationV1.getX() << "," << (int)grid::translationV1.getY() << "],["
		<< (int)grid::translationV2.getX() << "," << (int)grid::translationV2.getY() << "]], \"page\": [["
		<< e1.getX() << "," << e1.getY() << "],[" << e2.getX() << "," << e2.getY() << "]], \"cells\": [";
	first = false;
	bool fc = true;
	for( const auto& p : cells ) {
		std::cout << ( fc ? "" : "," ) << "\n {\"at\": [" << (int)p.getX() << "," << (int)p.getY() << "], \"verts\": [";
		fc = false;
		const auto *vv = grid::getVertexVectors( p );
		point_t c = grid::getVertexCentre( p );
		for( size_t i = 0; i < grid::numVertices( p ); ++i ) {
			auto g = grid::vertexToGrid( c + point_t( vv[i].getX(), vv[i].getY() ) );
			std::cout << ( i ? "," : "" ) << "[" << g.getX() << "," << g.getY() << "]";
		}
		std::cout << "]}";
	}
	std::cout << "]}";
}

int main()
{
	std::cout.precision( 12 );
	bool first = true;
	std::cout << "{\n";
	dump<OminoGrid<int16_t>>( "omino", first );
	dump<IamondGrid<int16_t>>( "iamond", first );
	dump<HexGrid<int16_t>>( "hex", first );
	dump<KiteGrid<int16_t>>( "kite", first );
	dump<DrafterGrid<int16_t>>( "drafter", first );
	dump<AboloGrid<int16_t>>( "abolo", first );
	dump<HalfCairoGrid<int16_t>>( "halfcairo", first );
	dump<OctaSquareGrid<int16_t>>( "octasquare", first );
	dump<TriHexGrid<int16_t>>( "trihex", first );
	dump<BevelHexGrid<int16_t>>( "bevelhex", first );
	std::cout << "\n}\n";
	return 0;
}
