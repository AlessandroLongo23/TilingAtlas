"""A {3,q} hyperbolic triangulation ball, wired at the boundary, squared.

Benjamini-Schramm (Ann. Probab. 24, 1996): a transient bounded-degree planar graph
has a square tiling of a CYLINDER. Here the graph is a ball in the 7-regular
hyperbolic triangulation with its boundary wired to one sink; the source is the
centre. Circumference = total current, height = potential drop.
"""
from fractions import Fraction as Fr
import math

def ball(q, r):
    """Combinatorial ball of radius r in the {3,q} triangulation, plus a wired sink.

    Layer k+1 is built by walking the layer-k cycle: each layer-k vertex contributes
    q-p-4 private children (p = how many parents it has), and each layer-k EDGE
    contributes one child shared by its two endpoints. That is forced by asking every
    face to be a triangle and every interior vertex to have degree q.
    """
    faces = []
    nv = 1
    layer = [0]                      # layer 0
    parents = {0: 0}
    # layer 1: a q-cycle around the centre
    lay1 = list(range(1, q + 1)); nv += q
    for i in range(q):
        faces.append([0, lay1[i], lay1[(i + 1) % q]])
    for v in lay1: parents[v] = 1
    layer = lay1
    for _ in range(r - 1):
        nxt, kids = [], {}
        n = len(layer)
        shared = {}
        for i in range(n):                      # one shared child per layer edge
            shared[i] = None
        # walk the cycle, emitting children in order
        for i, v in enumerate(layer):
            p = parents[v]
            private = q - p - 4
            lst = []
            # shared child with the PREVIOUS vertex (already emitted) or make it now
            prev = (i - 1) % n
            if shared[prev] is None:
                shared[prev] = nv; nv += 1
            lst.append(shared[prev])
            for _ in range(private):
                lst.append(nv); nv += 1
            if shared[i] is None:
                shared[i] = nv; nv += 1
            lst.append(shared[i])
            kids[v] = lst
        # collect the next layer in cyclic order and record parent counts
        for i, v in enumerate(layer):
            for c in kids[v][:-1]:
                if c not in parents: parents[c] = 0
        for i, v in enumerate(layer):
            for c in kids[v]:
                parents[c] = parents.get(c, 0)
        for i, v in enumerate(layer):
            lst = kids[v]
            for c in lst: parents[c] = 0
        for i, v in enumerate(layer):
            for c in kids[v]: parents[c] += 1
        for i, v in enumerate(layer):
            lst = kids[v]
            for a, b in zip(lst, lst[1:]):
                faces.append([v, a, b])         # fan triangles at v
            nxtv = layer[(i + 1) % n]
            faces.append([v, nxtv, shared[i]])  # triangle over the layer edge
        # cyclic order of the new layer
        order = []
        for i, v in enumerate(layer):
            lst = kids[v]
            order.extend(lst[:-1])
        nxt = order
        layer = nxt
    # wire the outer boundary to a single sink
    sink = nv; nv += 1
    n = len(layer)
    for i in range(n):
        faces.append([layer[i], sink, layer[(i + 1) % n]])
    return nv, faces, sink, layer

def edges_of(faces):
    E = {}
    for f in faces:
        for i in range(len(f)):
            a, b = f[i], f[(i + 1) % len(f)]
            k = (min(a, b), max(a, b))
            E.setdefault(k, 0)
            E[k] += 1
    return E

if __name__ == "__main__":
    for r in (1, 2, 3, 4):
        nv, faces, sink, bnd = ball(7, r)
        E = edges_of(faces)
        bad = sum(1 for k, c in E.items() if c != 2)
        V, Ec, F = nv, len(E), len(faces)
        print(f"r={r}: V={V:5d} E={Ec:5d} F={F:5d}  chi={V-Ec+F:3d}  boundary={len(bnd):4d}  "
              f"edges used twice: {'yes' if bad==0 else f'NO ({bad} bad)'}")
