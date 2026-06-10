# Hand-authored standalone TikZ figures

One `.tex` per figure, `standalone` class, sharing `../preamble-shared.tex` so fonts and colors
match the generated figures exactly. The build compiles everything here with `latexmk` and
delivers PDFs alongside the generated ones.

Template:

```latex
\documentclass[border=1mm]{standalone}
\input{../preamble-shared.tex}
\begin{document}
\begin{tikzpicture}
  % ...
\end{tikzpicture}
\end{document}
```

Planned figures (thesis TODOs):
- `dfs-tree.tex` — partial DFS-tree (algorithm §3.2)
- `seed-assembly.tex` — seed-assembly DFS steps (algorithm §3.6)
- `architecture.tex` — high-level pipeline architecture
- D-symbol graphs (Delaney–Dress chapter material)
