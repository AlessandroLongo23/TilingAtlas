# Build the fast C++ Čtrnáct oracle path (solver + pruner).
# maxnum (largest k enumerated) defaults to 11; override with:  make MAXNUM=13
CXX      ?= g++
CXXFLAGS ?= -O2 -std=c++17
MAXNUM   ?= 11

.PHONY: all clean
all: eu_solver eu_pruner

eu_solver: eu_solver.cpp
	$(CXX) $(CXXFLAGS) -DMAXNUM=$(MAXNUM) -o $@ $<

eu_pruner: eu_pruner.cpp pruner_tables.inc
	$(CXX) $(CXXFLAGS) -o $@ $<

clean:
	rm -f eu_solver eu_pruner
