// A 2D float point — the native mirror of lib/classes/Vector.ts's (x,y). Kept in its own header so
// both cyclotomic.hpp (Cyclo::toVector) and polygon_float.hpp (the float broadphase) can use it
// without a circular include.
#pragma once

struct Vec { double x, y; };
