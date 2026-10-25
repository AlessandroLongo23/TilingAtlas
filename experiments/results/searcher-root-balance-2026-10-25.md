# Root balance of the searcher (per-root finish time and tilings), for an ETA
## squares_edges, k <= 5, 2026-10-25 02:57:56
wall 1.9 s, 25 roots, 53060 tilings
  25% of roots done at 0.05 s = 3% of the run
  50% of roots done at 0.11 s = 5% of the run
  75% of roots done at 0.32 s = 17% of the run
  90% of roots done at 0.76 s = 39% of the run
  largest roots by tilings: root 8: 30002 (57%), done at 1.9 s, root 5: 9229 (17%), done at 1.6 s, root 12: 4482 (8%), done at 0.8 s
## hybrid_2_9830, k <= 2, 2026-10-25 02:57:58
wall 31.6 s, 156 roots, 2673362 tilings
  25% of roots done at 1.57 s = 5% of the run
  50% of roots done at 15.79 s = 50% of the run
  75% of roots done at 22.07 s = 70% of the run
  90% of roots done at 27.53 s = 87% of the run
  largest roots by tilings: root 72: 215740 (8%), done at 28.3 s, root 75: 143803 (5%), done at 20.0 s, root 74: 118249 (4%), done at 19.3 s
## 123_1_4657, k <= 3, 2026-10-25 02:58:30
wall 4.7 s, 2225 roots, 349 tilings
  25% of roots done at 0.21 s = 5% of the run
  50% of roots done at 0.32 s = 7% of the run
  75% of roots done at 0.43 s = 9% of the run
  90% of roots done at 0.49 s = 10% of the run
  largest roots by tilings: root 2: 169 (48%), done at 4.5 s, root 4: 132 (38%), done at 4.1 s, root 5: 21 (6%), done at 0.7 s

## tileestimate --exact against the engine (2026-10-25)
### squares_edges.board k<=5
exact nodes 2989800 complete 304869 unique 53060
exact k 1 complete 187 unique 13
exact k 2 complete 1399 unique 153
exact k 3 complete 7821 unique 1254
exact k 4 complete 45883 unique 7848
exact k 5 complete 249579 unique 43792
exact multiplicity right for 53060 of 53060 unique tilings
./tilesearch $1 --dump  0.00s user 0.00s system 67% cpu 0.002 total
./tileestimate --k 1 $2 --exact  7.90s user 0.07s system 97% cpu 8.170 total
### 123_1_4657.board k<=3
exact nodes 10411297 complete 2243 unique 349
exact k 1 complete 14 unique 2
exact k 2 complete 251 unique 43
exact k 3 complete 1978 unique 304
exact multiplicity right for 349 of 349 unique tilings
./tilesearch $1 --dump  0.00s user 0.00s system 65% cpu 0.003 total
./tileestimate --k 1 $2 --exact  39.00s user 0.26s system 97% cpu 40.246 total
