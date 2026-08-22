#!/usr/bin/env python3
"""Develop a pruned tree in parallel and merge the cells.

One block is completely independent of every other, so this hands them out across processes and merges
the JSON at the end. develop_spherical.py alone is one process over one directory, which is the right
shape for a few thousand blocks and the wrong one for a few hundred thousand — the bucketed k=2 run on
star-wide emits 422,206.

⚑ A WORK QUEUE, NOT A STATIC SPLIT, and the difference is most of the wall clock. Blocks were dealt to
workers up front — first round-robin by file size, then longest-processing-time-first by block count —
and both are guesses at a cost nobody can predict. Block costs do not merely vary, they are pathological:
on a k=4 shard, 12 of 88 blocks were 94% of the time, because a block that fails on "no dihedral
solution" is nearly free and one that stalls propagation runs a 3000-start multistart. Measured with the
LPT split at ten workers: three workers ran 27 s and the other seven finished in 0 to 9 s, so the machine
sat 60% idle while the run waited on the unlucky three.

Handing blocks out ONE AT A TIME as workers come free needs no prediction at all. The floor becomes the
single most expensive block instead of the worst assignment, and on the same shard the wall clock went
from 28 s to 13 s with no change to what is computed.

Usage: python3 run_develop_sharded.py --palette star-wide --pruned <dir> --out <cells.json> \
           --workers 8 --kmin 2 --kmax 2 --log <logfile>
"""
import argparse, collections, json, multiprocessing as mp, os, sys, time

_HERE = os.path.dirname(os.path.abspath(__file__))


def _init(palette, maxdens, developer):
    """Per-worker setup. The palette is read at import time, so it has to be in the environment before
    the developer module is imported — which under `spawn` (the macOS default) is right here."""
    os.environ["EU_PALETTE"] = palette
    os.environ["EU_MAXDENS"] = str(maxdens)
    # One BLAS thread per worker. The developer's inner loop is many small matmuls, so a multithreaded
    # BLAS inside every one of ten processes only fights itself for the four performance cores.
    os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "1")
    os.environ.setdefault("OMP_NUM_THREADS", "1")
    os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
    sys.path.insert(0, _HERE)
    global _DEV, _NARGS
    _DEV = __import__(os.path.splitext(developer)[0])
    import inspect
    _NARGS = len(inspect.signature(_DEV.develop_block).parameters)


def _develop_one(block):
    # ⚑ The two developers disagree on arity: develop_euclid.develop_block(b, maxretro) takes the retro
    # budget, develop_spherical.develop_block(b) does not. Both return (records, error).
    return _DEV.develop_block(block, 0) if _NARGS > 1 else _DEV.develop_block(block)


def _develop_file(job):
    """One pruned FILE, read by the worker itself.

    ⚑ The parent used to parse every block and pickle it to a worker: on star-wide k=3 that is 10 GB
    of text through a pipe, single-threaded, and it became the bottleneck once the fill was in C and
    the planning was cached. Handing over a PATH costs nothing and parallelises the reading too. The
    merged records do not depend on which worker read which file.
    """
    path, size = job
    recs, errs, npre, nin = [], [], 0, 0
    for chunk in _DEV.file_chunks(path, size):
        nin += len(chunk)
        r, e, p = _develop_chunk(chunk)
        recs.extend(r); errs.extend(e); npre += p
    return recs, errs, npre, nin


def _develop_chunk(chunk):
    """A CHUNK, not a block, because develop_spherical has a C prefilter that answers 'does this fill
    close?' for a whole batch in one call and removes the ones where it does not — on a star search
    that is nearly all of them. Records are unchanged: a survivor goes through develop_block exactly
    as a single block always did.

    Chunking costs a little of the dynamic queue's balance, which was the point of chunksize=1. It is
    affordable now precisely BECAUSE of the prefilter: a rejected block costs a flat ~1.3 ms, so a
    chunk's cost is dominated by how many survivors it happens to hold, and those are rare.
    """
    n_in = len(chunk)
    if hasattr(_DEV, "prefilter") and getattr(_DEV, "PREFILTER", False):
        chunk = _DEV.prefilter(chunk)
    recs, errs = [], []
    for b in chunk:
        r, e = _develop_one(b)
        if r:
            recs.extend(r)
        else:
            errs.append(e)
    return recs, errs, n_in - len(chunk)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--palette", required=True)
    ap.add_argument("--pruned", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--kmin", type=int, default=2)
    ap.add_argument("--kmax", type=int, default=2)
    ap.add_argument("--maxdens", type=int, default=3)
    ap.add_argument("--log", default=None)
    ap.add_argument("--by-file", action="store_true",
                    help="hand each worker a pruned FILE instead of a chunk of blocks, so the parent "
                         "never reads or pickles the block text. Pays when the files are large.")
    ap.add_argument("--chunk", type=int, default=2000,
                    help="blocks per work item. develop_spherical prefilters a whole chunk in one C "
                         "call, so this trades a little queue balance for a lot of throughput.")
    ap.add_argument("--developer", default="develop_spherical.py",
                    help="develop_spherical.py (on S2) or develop_euclid.py (dihedral angles in R3)")
    args = ap.parse_args()
    logf = open(args.log, "w") if args.log and args.log != "/dev/null" else None

    def log(m):
        line = "[%s] %s" % (time.strftime("%H:%M:%S"), m)
        print(line, flush=True)
        if logf:
            logf.write(line + "\n"); logf.flush()

    os.environ["EU_PALETTE"] = args.palette
    os.environ["EU_MAXDENS"] = str(args.maxdens)
    sys.path.insert(0, _HERE)
    # Block IO and the palette install live in develop_spherical whichever developer runs — develop_euclid
    # imports them from there rather than duplicating them.
    import develop_spherical as blockio
    dev = __import__(os.path.splitext(args.developer)[0])
    # ⚑ STREAM the blocks, do not gather them. gather_blocks returns a list, and star-wide k=3 is
    # 40,487,641 blocks: tens of gigabytes of Python strings before a single one is developed. The
    # pool only ever needs the next chunk, and imap_unordered consumes an iterable lazily.
    # ⚑ WHICH DISPATCH IS FASTER DEPENDS ON THE FILE SIZE, measured both ways. Handing over paths
    # keeps 10 GB of block text out of the parent and off the pipes, which is what a star-wide k=3 run
    # wants (2,393 files, ~17,000 blocks each). Handing over chunks balances better when the files are
    # small: k=2 star-wide is 1,664 files of 254 blocks and chunks win there, 14.2s against 16.8s.
    # Default follows the mean file size.
    by_file = hasattr(blockio, "file_chunks") and args.by_file
    if by_file:
        files = blockio.block_files(args.pruned, args.kmin, args.kmax)
        if not files:
            sys.exit("no blocks under " + args.pruned)
        # biggest first: 2393 files over 10 workers, and the tail is what sets the wall clock
        files.sort(key=lambda f: -os.path.getsize(f))
        chunks = [(f, args.chunk) for f in files]
        nchunks = len(chunks)
        nblocks = 0                                   # counted as the workers report it
    elif hasattr(blockio, "stream_chunks"):
        nblocks = blockio.count_blocks(args.pruned, args.kmin, args.kmax)
        if not nblocks:
            sys.exit("no blocks under " + args.pruned)
        chunks = blockio.stream_chunks(args.pruned, args.kmin, args.kmax, args.chunk)
        nchunks = (nblocks + args.chunk - 1) // args.chunk
    else:
        blocks = blockio.gather_blocks(args.pruned, args.kmin, args.kmax)
        if not blocks:
            sys.exit("no blocks under " + args.pruned)
        nblocks = len(blocks)
        chunks = [blocks[i:i + args.chunk] for i in range(0, nblocks, args.chunk)]
        nchunks = len(chunks)
    log("%s in %d work items over %d workers"
        % ("%d files" % nchunks if by_file else "%d blocks" % nblocks, nchunks, args.workers))

    t0 = time.time()
    records, failed, prefiltered = [], [], 0
    ctx = mp.get_context("spawn")
    with ctx.Pool(args.workers, initializer=_init,
                  initargs=(args.palette, args.maxdens, args.developer)) as pool:
        last = 0.0
        done = 0
        # chunksize=1 on the CHUNK list: a worker takes the next chunk only when it has finished the
        # last one, so one pathological chunk delays nobody but itself.
        worker = _develop_file if by_file else _develop_chunk
        for out in pool.imap_unordered(worker, chunks, chunksize=1):
            if by_file:
                recs, errs, npre, nin = out
                nblocks += nin
            else:
                recs, errs, npre = out
            records.extend(recs)
            failed.extend(errs)
            prefiltered += npre
            done += 1
            el = time.time() - t0
            if el - last >= 30 or done == nchunks:
                last = el
                log("  develop %d/%d  blocks=%d  realized=%d  prefiltered=%d  %.0fs, ETA %.0fs"
                    % (done, nchunks, nblocks, len(records), prefiltered, el,
                       el / done * max(0, nchunks - done)))

    # Dedup only where the developer defines what a duplicate IS. develop_euclid has a congruence key
    # and its own run() applies it; the sharded path used to apply it per worker and concatenate, so a
    # solid realized in two shards came out twice. Doing it once over the merged set is what that always
    # meant to be. develop_spherical has no such key — its notion of duplicate is a geometric-signature
    # AUDIT that includes density and rho — so its records are concatenated untouched, exactly as before.
    if hasattr(dev, "finalise_records"):
        # develop_spherical collapses geometric duplicates and sorts before it writes. That used to live
        # inside its run(), so a sharded run would have merged the per-worker records and done NEITHER —
        # shipping a larger, unordered catalogue that looked fine. Same function, both paths.
        uniq = dev.finalise_records(records)
    elif hasattr(dev, "congruence_key"):
        seen, uniq = set(), []
        for r in records:
            k = dev.congruence_key(r)
            if k in seen:
                continue
            seen.add(k)
            uniq.append(r)
    else:
        uniq = records
    if len(uniq) != len(records):
        log("  %d records -> %d congruence classes" % (len(records), len(uniq)))
    json.dump(uniq, open(args.out, "w"))
    log("merged %d realized records -> %s (%.0fs total)" % (len(uniq), args.out, time.time() - t0))

    # THE REPORT IS THE COMPLETENESS EVIDENCE, so it is written here and not left in a scratch directory
    # for nobody to read. A block rejected for "no dihedral solution" is a fact about the map; one that
    # failed to converge is a gap; without this census the two are indistinguishable, and a shelf cannot
    # claim to be complete for a k it cannot account for.
    rp = os.path.splitext(args.out)[0] + "-report.txt"
    reasons = collections.Counter(e.get("reason", "?") for e in failed)
    with open(rp, "w") as fh:
        fh.write("develop report (k=%d..%d, %d workers)\n" % (args.kmin, args.kmax, args.workers))
        fh.write("%-15s: %d\n%-15s: %d\n%-15s: %d\n"
                 % ("blocks in", nblocks, "realized", len(uniq),
                    "non-realizable", len(failed) + prefiltered))
        if prefiltered:
            fh.write("   of which %d rejected by eu_sphfill (the flood fill does not close — a fact\n"
                     "   about the map, not a numerical failure)\n" % prefiltered)
        fh.write("\n")
        fh.write("non-realizable by reason\n")
        for why, n in reasons.most_common():
            fh.write("%6d  %s\n" % (n, why[:120]))
        fh.write("\n")
        for e in failed:
            fh.write("   - %s  config=%s  reason=%s\n"
                     % (e.get("id", "?"), e.get("config", "?"), e.get("reason", "?")))
    log("  report -> %s" % os.path.basename(rp))
    for why, n in reasons.most_common(5):
        log("     %5d  %s" % (n, why[:90]))


if __name__ == "__main__":
    main()
