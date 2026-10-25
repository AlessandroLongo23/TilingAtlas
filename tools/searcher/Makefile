# tilesearch links Marek Čtrnáct's engine from his source tree, which is not in git (no license yet).
# Point MAREK_SRC at the unpacked planar_tilings.zip.
MAREK_SRC ?= ../../materials/marek-source
ENGINE = covering_tiling embedding hyperbolic_geometry solutions_processor thread_pool \
         tiling_search tiling_writer vertex_classification vertices
CXX ?= clang++
CXXFLAGS ?= -std=c++20 -O2

tilesearch: tilesearch.cpp $(ENGINE:%=$(MAREK_SRC)/src/%.cpp)
	$(CXX) $(CXXFLAGS) -I$(MAREK_SRC)/include $^ -o $@

# tileestimate compiles tilesearch.cpp into itself (its main renamed), so it walks the engine's own search.
tileestimate: tileestimate.cpp tilesearch.cpp $(ENGINE:%=$(MAREK_SRC)/src/%.cpp)
	$(CXX) $(CXXFLAGS) -I$(MAREK_SRC)/include -I. tileestimate.cpp $(ENGINE:%=$(MAREK_SRC)/src/%.cpp) -o $@
