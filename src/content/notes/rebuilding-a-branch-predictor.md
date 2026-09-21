---
title: "A branch predictor that segfaults, and what replacing it cost"
date: 2026-09-20T18:00:00-07:00
description: "A local-history and bimodal hybrid I wrote for a CBP-2 contest read past the end of an array and was 130x over its storage budget. Rebuilding it inside 32 KB is worth 0.64 MPKI against gshare, and loses on four traces for a structural reason."
tags: ["branch prediction", "computer architecture", "measurement"]
---

I wrote a branch predictor for a course contest built on the CBP-2 infrastructure.
It was a local-history predictor combined with a bimodal one, and I published a
number for it: 5.020 MPKI.

That number cannot have come from the code in the repository. The code segfaults.

## What was wrong

Two things, and the first is not a tuning problem.

```c
#define BHR_num 22
#define PT_BITS 22

unsigned int  BHRTable[BHR_num];      // 22 elements
unsigned char PTable[1 << PT_BITS];   // 4 MiB

// in predict(), and again in update():
BHRTable[history ^ (b.address & ((1 << PT_BITS) - 1))]
```

`BHRTable` holds 22 elements and is indexed by a value that ranges up to
4,194,303. The intent is visible: it should have been a table of per-branch
local history registers, sized `1 << n`, whose *contents* index `PTable`. What
it does instead is read, and in `update()` write, past the end of the array.

UndefinedBehaviorSanitizer on the unmodified file:

```
my_predictor.h:51:5: runtime error: index 296892 out of bounds for type 'unsigned int[22]'
my_predictor.h:83:4: runtime error: index 296892 out of bounds for type 'unsigned int[22]'
my_predictor.h:84:4: runtime error: index 296892 out of bounds for type 'unsigned int[22]'
my_predictor.h:85:4: runtime error: index 296892 out of bounds for type 'unsigned int[22]'
AddressSanitizer: SEGV ... in my_predictor::predict(branch_info&)
```

Line 51 is the read in `predict()`. Lines 83 to 85 are the read-modify-writes in
`update()`.

Built at `-O3` without sanitizers and run over all 20 traces, three times each:
**60 runs, 60 exits with status 139.** No MPKI line was printed once. Whatever
produced 5.020 was not this file.

The second problem is arithmetic. The contest budget, stated in the
infrastructure's own header comment, is 32 KB. `PTable` alone is 4 MiB.

The third is that the selection between the two components was not a chooser:

```c
if (PTable[u.index] == 3 || PTable[u.index] == 4) {
    u.direction_prediction (bimodal_prediction);
} else {
    u.direction_prediction (local_prediction);
}
```

That tests whether the local counter is near the middle of its range and falls
back to bimodal if it is. It has no state of its own and learns nothing about
which component is right for a given branch.

## The rebuild

Same design intent, corrected structure, inside the budget.

- **`lht`** — local history table, 2^12 entries of 15 bits, indexed by PC. Each
  entry is one branch's own outcome history.
- **`lpt`** — local pattern table, 2^15 3-bit saturating counters, indexed by
  the local history XORed with PC bits.
- **`bim`** — bimodal table, 2^15 2-bit counters, indexed by PC.
- **`chooser`** — 2^14 2-bit counters indexed by `PC ^ GHR`. Trained **only when
  the two components disagree**: incremented when local was right, decremented
  when bimodal was.
- **`ghr`** — a 16-bit global history register.

```
lht       4096 x 15 =  61,440 bits
lpt      32768 x  3 =  98,304 bits
bim      32768 x  2 =  65,536 bits
chooser  16384 x  2 =  32,768 bits
ghr                 =      16 bits
                      -----------
total               = 258,064 bits = 32,258 bytes
budget              = 262,144 bits = 32,768 bytes
```

Counters are stored one per `unsigned char` for code simplicity, so the process
occupies far more than 32 KB. The budget is counted in the bits the design
needs, which is the number the contest constrains. To keep that honest the file
carries a compile-time guard rather than a claim in a comment:

```c
static_assert (TOTAL_BITS <= 262144u,
    "predictor state exceeds the CBP-2 budget of 32 KB = 262,144 bits");
```

Raising `LPT_BITS` to 22 — the original's table size — fails the build.

## Results

Baseline is the contest's own sample predictor, a 32,768-entry gshare with a
history length of 15, reconstructed from the header comment that describes it.
All 20 traces, `g++ -O3`, Apple clang 16, arm64.

| trace | gshare | hybrid | delta |
|---|--:|--:|--:|
| 164.gzip | 12.473 | 10.893 | −1.580 |
| 175.vpr | 13.415 | 12.737 | −0.678 |
| 176.gcc | 11.254 | 11.460 | +0.206 |
| 181.mcf | 15.837 | 16.015 | +0.178 |
| 186.crafty | 5.837 | 6.543 | +0.706 |
| 197.parser | 10.008 | 10.738 | +0.730 |
| 201.compress | 7.831 | 7.475 | −0.356 |
| 202.jess | 1.562 | 0.913 | −0.649 |
| 205.raytrace | 2.756 | 0.950 | −1.806 |
| 209.db | 3.909 | 3.516 | −0.393 |
| 213.javac | 2.267 | 1.886 | −0.381 |
| 222.mpegaudio | 2.188 | 1.873 | −0.315 |
| 227.mtrt | 2.657 | 1.142 | −1.515 |
| 228.jack | 3.033 | 1.513 | −1.520 |
| 252.eon | 1.807 | 0.838 | −0.969 |
| 253.perlbmk | 2.554 | 1.862 | −0.692 |
| 254.gap | 3.926 | 2.718 | −1.208 |
| 255.vortex | 1.222 | 0.385 | −0.837 |
| 256.bzip2 | 0.094 | 0.060 | −0.034 |
| 300.twolf | 21.489 | 19.873 | −1.616 |
| **mean** | **6.3060** | **5.6695** | **−0.6364** |

−10.1% on the arithmetic mean, winning on 16 traces of 20. gshare uses a quarter
of the budget to do it; the hybrid uses 98.4%.

## Where it loses, and why that is the interesting part

It loses on `gcc`, `mcf`, `crafty` and `parser`. Those are the traces whose
branches correlate with the *global* path rather than with their own history, and
a local-plus-bimodal predictor has no structure that captures a global pattern.
The chooser can route around a branch the local component handles badly, but it
can only choose between two components that are both blind in the same way.

This is a structural limit, not a tuning deficit, and it is the argument for
TAGE-style designs: geometric history lengths exist precisely so that one
predictor can hold both the short local correlation and the long global one.

## Ablations

Five configurations, fixed before any of them ran, each measured on all 20
traces.

| cfg | bits | mean MPKI | note |
|---|--:|--:|---|
| A | 122,896 | 6.4360 | half the budget — the only config that loses to gshare |
| B | 237,584 | 5.7468 | |
| C | 258,064 | **5.6695** | shipped |
| D | 237,584 | 5.6725 | LPT index concatenated instead of XORed |
| E | 237,584 | 6.2511 | chooser indexed by PC only |

The single largest effect is E against B: indexing the chooser by `PC` alone
rather than `PC ^ GHR` costs **0.50 MPKI**. The component the original design
was missing entirely turns out to be worth more than any of the table sizings.

D against B says XOR-folding the local history with the PC and concatenating
them are worth the same to within 0.07 MPKI at equal size. C against D is 0.003,
which is a tie; C was taken for its slightly larger tables.

## What this measurement does not establish

- The five configurations were chosen before measuring, but the winner was
  selected on the same 20 traces it is reported on. There is no held-out set.
- The gshare baseline is reconstructed from the description in the
  infrastructure's header comment, not from the contest's original sample file,
  which is not in the repository.
- One run per trace for the reported numbers. The simulation is deterministic,
  so repeated runs agree, but nothing here measures run-to-run variance in
  anything else.
- MPKI is mispredictions per 1000 instructions over a fixed 100M-instruction
  trace. It is not a cycle count, and nothing here models the pipeline cost of a
  misprediction or the latency of the predictor itself.

## The part worth keeping

The original number was not merely wrong. It was unreproducible, and one command
would have shown that:

```bash
g++ -fsanitize=address,undefined -g -O1 -o predict predict.cc trace.cc
```

A result from a program with undefined behaviour is not a weak result. It is not
a result. The cost of finding that out was a sanitizer flag; the cost of not
finding out was publishing a number for two years.
