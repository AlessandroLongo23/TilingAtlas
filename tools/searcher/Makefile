# tilesearch links Marek Čtrnáct's engine from his source tree, which is not in git (no license yet).
# Point MAREK_SRC at the unpacked planar_tilings.zip.
MAREK_SRC ?= ../../materials/marek-source
ENGINE = covering_tiling embedding hyperbolic_geometry solutions_processor thread_pool \
         tiling_search tiling_writer vertex_classification vertices
CXX ?= clang++
CXXFLAGS ?= -std=c++20 -O2

tilesearch: tilesearch.cpp $(ENGINE:%=$(MAREK_SRC)/src/%.cpp)
	$(CXX) $(CXXFLAGS) -I$(MAREK_SRC)/include $^ -lz -o $@

# tileestimate compiles tilesearch.cpp into itself (its main renamed), so it walks the engine's own search.
tileestimate: tileestimate.cpp tilesearch.cpp $(ENGINE:%=$(MAREK_SRC)/src/%.cpp)
	$(CXX) $(CXXFLAGS) -I$(MAREK_SRC)/include -I. tileestimate.cpp $(ENGINE:%=$(MAREK_SRC)/src/%.cpp) -lz -o $@

# Windows, cross-compiled from a Mac with mingw-w64 (brew install mingw-w64). ZLIB_WIN is a zlib built
# for mingw: zlib.h and libz.a in one directory (make -f win32/Makefile.gcc PREFIX=x86_64-w64-mingw32- libz.a).
# win/ shims <sys/resource.h> and gzopen on a wide path (win/gzwide.h); -include condition_variable covers Marek's thread_pool.h, which uses it
# without including it (MSVC forgives that, GCC does not). Static, so the .exe needs no MinGW DLLs.
WINCXX ?= x86_64-w64-mingw32-g++
WINFLAGS = -std=c++20 -O2 -static -Iwin -I$(ZLIB_WIN) -include condition_variable -include win/gzwide.h

tilesearch.exe: tilesearch.cpp $(ENGINE:%=$(MAREK_SRC)/src/%.cpp)
	$(WINCXX) $(WINFLAGS) -I$(MAREK_SRC)/include $^ -L$(ZLIB_WIN) -lz -o $@

tileestimate.exe: tileestimate.cpp tilesearch.cpp $(ENGINE:%=$(MAREK_SRC)/src/%.cpp)
	$(WINCXX) $(WINFLAGS) -I$(MAREK_SRC)/include -I. tileestimate.cpp $(ENGINE:%=$(MAREK_SRC)/src/%.cpp) -L$(ZLIB_WIN) -lz -o $@
