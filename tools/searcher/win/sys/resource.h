// Windows has no <sys/resource.h>. tilesearch.cpp calls setpriority only for --nice, which the app does
// not pass on Windows (it lowers the process priority itself, electron/runs.ts), so a no-op is exact.
// Found by the mingw build only: Makefile's WINFLAGS puts this directory first on the include path.
#pragma once
#define PRIO_PROCESS 0
inline int setpriority(int, int, int) { return 0; }
