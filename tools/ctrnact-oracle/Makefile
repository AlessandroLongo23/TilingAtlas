# Build the fast C++ Čtrnáct oracle path (solver + pruner).
# maxnum (largest k enumerated) defaults to 11; override with:  make MAXNUM=13
CXX      ?= g++
CXXFLAGS ?= -O2 -std=c++17
MAXNUM   ?= 11

.PHONY: all clean
all: eu_solver eu_pruner eu_classify

# .maxnum-<N> stamp: MAXNUM is a compile flag, not a file dependency — without the stamp,
# `make MAXNUM=13` after a MAXNUM=11 build is a silent no-op and the solver keeps the old k range.
eu_solver: eu_solver.cpp .maxnum-$(MAXNUM)
	$(CXX) $(CXXFLAGS) -DMAXNUM=$(MAXNUM) -o $@ $<

.maxnum-$(MAXNUM):
	rm -f .maxnum-*
	touch $@

eu_pruner: eu_pruner.cpp pruner_tables.inc
	$(CXX) $(CXXFLAGS) -o $@ $<

eu_classify: eu_classify.cpp
	$(CXX) $(CXXFLAGS) -o $@ $<

clean:
	rm -f eu_solver eu_pruner eu_classify
