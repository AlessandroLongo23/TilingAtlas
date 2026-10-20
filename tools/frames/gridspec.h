// A heesch-sat grid as the abstract data the frame finder needs.
//
// A cell is (n1, n2, t): a lattice point n1 V1 + n2 V2 plus one of T cell types (the cell whose
// heesch-sat point is origins[t] + n1 V1 + n2 V2).
//   adj[t]   the edge neighbours of type t, as offsets [dn1, dn2, t'];
//   syms[s]  each heesch-sat orientation as an integer matrix A on the lattice and, per type, the
//            image img[t] of cell (0, 0, t): cell (n, t) maps to (A n + img[t].n, img[t].t);
//   refl     whether the orientation reverses handedness.
// makeSpec checks every map against heesch-sat itself on a window of cells.
#pragma once
#include <cstdio>
#include <cstdlib>
#include <array>
#include <iostream>
#include <vector>

#include "grid.h"

struct Cell { int n1, n2, t; };
// X: the heesch-sat orientation itself, (x, y) -> (X0 x + X1 y + X2, X3 x + X4 y + X5) on solver points.
struct Sym { int A[2][2]; bool refl; std::vector<Cell> img; int X[6]; };
// origin[t] and V: a cell's solver point is origin[t] + n1 V[0] + n2 V[1].
struct Spec { int T; std::vector<std::vector<Cell>> adj; std::vector<Sym> syms; std::vector<std::array<int, 2>> origin; int V[2][2]; };

template<typename grid>
Cell cellOf( typename grid::point_t p )
{
	int t = (int)grid::getTileType( p );
	if( t < 0 ) { fprintf( stderr, "point (%d,%d) is not a cell\n", p.getX(), p.getY() ); exit( 1 ); }
	int dx = p.getX() - grid::origins[t].getX(), dy = p.getY() - grid::origins[t].getY();
	int a = grid::translationV1.getX(), b = grid::translationV2.getX();
	int c = grid::translationV1.getY(), d = grid::translationV2.getY(), det = a * d - b * c;
	int n1 = d * dx - b * dy, n2 = -c * dx + a * dy;
	if( n1 % det || n2 % det ) { fprintf( stderr, "point (%d,%d) is off the lattice\n", p.getX(), p.getY() ); exit( 1 ); }
	return { n1 / det, n2 / det, t };
}

template<typename grid>
typename grid::point_t pointOf( const Cell& c )
{
	using point_t = typename grid::point_t;
	return point_t( grid::origins[c.t].getX() + c.n1 * grid::translationV1.getX() + c.n2 * grid::translationV2.getX(),
	                grid::origins[c.t].getY() + c.n1 * grid::translationV1.getY() + c.n2 * grid::translationV2.getY() );
}

template<typename grid>
Spec makeSpec()
{
	using point_t = typename grid::point_t;
	Spec g;
	g.T = (int)grid::num_tile_types;
	g.V[0][0] = grid::translationV1.getX(), g.V[0][1] = grid::translationV1.getY();
	g.V[1][0] = grid::translationV2.getX(), g.V[1][1] = grid::translationV2.getY();
	for( int t = 0; t < g.T; ++t ) g.origin.push_back( { (int)grid::origins[t].getX(), (int)grid::origins[t].getY() } );
	for( int t = 0; t < g.T; ++t ) {
		point_t p = grid::origins[t];
		const auto *ev = grid::getEdgeNeighbourVectors( p );
		g.adj.emplace_back();
		for( size_t i = 0; i < grid::numEdgeNeighbours( p ); ++i )
			g.adj[t].push_back( cellOf<grid>( p + point_t( ev[i].getX(), ev[i].getY() ) ) );
	}
	for( size_t s = 0; s < grid::num_orientations; ++s ) {
		xform<int> X = grid::orientations[s];
		Sym S;
		S.X[0] = X.a_, S.X[1] = X.b_, S.X[2] = X.c_, S.X[3] = X.d_, S.X[4] = X.e_, S.X[5] = X.f_;
		for( int t = 0; t < g.T; ++t ) S.img.push_back( cellOf<grid>( X * pointOf<grid>( { 0, 0, t } ) ) );
		// The lattice part: where the translates by V1 and V2 of the type-0 cell go.
		Cell e1 = cellOf<grid>( X * pointOf<grid>( { 1, 0, 0 } ) ), e2 = cellOf<grid>( X * pointOf<grid>( { 0, 1, 0 } ) );
		S.A[0][0] = e1.n1 - S.img[0].n1; S.A[0][1] = e2.n1 - S.img[0].n1;
		S.A[1][0] = e1.n2 - S.img[0].n2; S.A[1][1] = e2.n2 - S.img[0].n2;
		S.refl = S.A[0][0] * S.A[1][1] - S.A[0][1] * S.A[1][0] < 0;
		for( int n1 = -6; n1 <= 6; ++n1 ) for( int n2 = -6; n2 <= 6; ++n2 ) for( int t = 0; t < g.T; ++t ) {
			Cell got = cellOf<grid>( X * pointOf<grid>( { n1, n2, t } ) );
			if( got.n1 != S.A[0][0] * n1 + S.A[0][1] * n2 + S.img[t].n1 || got.n2 != S.A[1][0] * n1 + S.A[1][1] * n2 + S.img[t].n2
			    || got.t != S.img[t].t ) {
				fprintf( stderr, "orientation %zu is not affine on cells\n", s );
				exit( 1 );
			}
		}
		g.syms.push_back( S );
	}
	return g;
}

// The grid named on the command line ("omino", "iamond", ...), as a spec.
inline bool specByName( const std::string& name, Spec& g )
{
	using c = int16_t;
	if( name == "omino" ) g = makeSpec<OminoGrid<c>>();
	else if( name == "iamond" ) g = makeSpec<IamondGrid<c>>();
	else if( name == "hex" ) g = makeSpec<HexGrid<c>>();
	else if( name == "kite" ) g = makeSpec<KiteGrid<c>>();
	else if( name == "drafter" ) g = makeSpec<DrafterGrid<c>>();
	else if( name == "abolo" ) g = makeSpec<AboloGrid<c>>();
	else if( name == "halfcairo" ) g = makeSpec<HalfCairoGrid<c>>();
	else if( name == "octasquare" ) g = makeSpec<OctaSquareGrid<c>>();
	else if( name == "trihex" ) g = makeSpec<TriHexGrid<c>>();
	else if( name == "bevelhex" ) g = makeSpec<BevelHexGrid<c>>();
	else return false;
	return true;
}

inline const char *GRID_NAMES[] = { "omino", "iamond", "hex", "kite", "drafter", "abolo", "halfcairo", "octasquare", "trihex", "bevelhex" };
