---
title: "Building a GPU by hand (2)"
date: 2024-06-04T23:03:29-07:00
displayDate: "2024-06-04"
slug: "GPU2"
lang: en
category: "gpu"
tags: []
source:
  title: "adam-maj/tiny-gpu"
  url: "https://github.com/adam-maj/tiny-gpu"
description: "A walk-through of the device control register and the dispatcher in adam-maj/tiny-gpu, including the block-count ceiling division and the per-core block dispatch logic."
originalUrl: "/2024/06/04/GPU2/"
---
The last part covered tiny-gpu's architecture, its top-level design, and the whole simulation workflow. This part goes through the individual blocks.

# Device Control Register

It controls which thread is to run in the kernel.

It is just the internally generated control signal with a DFF added before it goes out to the kernel.

# Dispatcher

Start with the IO.

```verilog
// Kernel Metadata
input wire [7:0] thread_count,

// Core States
input reg [NUM_CORES-1:0] core_done,
output reg [NUM_CORES-1:0] core_start,
output reg [NUM_CORES-1:0] core_reset,
output reg [7:0] core_block_id [NUM_CORES-1:0],
output reg [$clog2(THREADS_PER_BLOCK):0] core_thread_count [NUM_CORES-1:0],

// Kernel Execution
output reg done
```

Inputs:

-   `thread_count`: the total number of threads to execute.
-   `core_done`: per-core status signal saying the core has finished its current block.

Outputs:

-   `core_start`: starts each core.
-   `core_reset`: resets each core.
-   `core_block_id`: the block ID each core is working on.
-   `core_thread_count`: the number of threads each core is working on.
-   `done`: kernel execution complete.

Block dispatch. What this module does is take the start signal, split the threads into blocks of a fixed size, hand those blocks out to the cores to process, and raise `done` once every block has been processed. Each core's status is indicated by `core_done`; once a core has finished its current block, the module resets it and dispatches a new block (if there are blocks left to process).

On a GPU, once the work is split into blocks, the blocks can be handed to several compute cores at once, which is what makes it parallel. For example, with 1000 threads split into 10 blocks of 100 threads, processing the blocks in parallel is far faster than running 1000 threads serially.

🤔 Picture a core as a workstation and a thread as a worker; a block is what you get when you split all the workers into small work groups. Those groups then go to different cores.

---

```verilog
assign total_blocks = (thread_count + THREADS_PER_BLOCK - 1) / THREADS_PER_BLOCK;
```

This one needs explaining. It computes how many blocks are needed to process a given number of threads.

The point of `thread_count + THREADS_PER_BLOCK - 1` is to avoid a rounding error when working out how many blocks are needed. An example makes it clear:

-   **thread\_count**: the total number of threads to process.
-   **THREADS\_PER\_BLOCK**: the number of threads in one block.

This line computes how many blocks (`total_blocks`) are needed for all the threads, in these steps:

1.  **thread\_count + THREADS\_PER\_BLOCK - 1**: add the threads per block to the total thread count, then subtract one.
2.  **(thread\_count + THREADS\_PER\_BLOCK - 1) / THREADS\_PER\_BLOCK**: divide that by the threads per block to get the number of blocks needed.

When you want to split a number into as many blocks as possible with every block the same size, you have to account for rounding up. Say you have `N` items (threads), and each block holds `k` items (threads per block).

$$
\\text{blocks\_needed} = \\left\\lceil \\frac{N}{k} \\right\\rceil
$$
where
$$
\\left\\lceil \\cdot \\right\\rceil
$$
denotes **rounding up**. Rounding up is there to guarantee that even when the last block is not full, a whole block is still needed to hold what is left over.

The formula `(thread_count + THREADS_PER_BLOCK - 1) / THREADS_PER_BLOCK` achieves that rounding up. Mathematically:

$$
\\left\\lceil \\frac{N}{k} \\right\\rceil = \\frac{N + k - 1}{k}
$$

### Examples

A couple of concrete examples to check the formula:

1.  `thread_count` of 250, `THREADS_PER_BLOCK` of 100:
    $$
    \\frac{250 + 100 - 1}{100} = \\frac{349}{100} = 3.49 \\rightarrow 3
    $$
    That is 3 blocks, 100 threads each, with the last block holding 50 threads.
    
2.  `thread_count` of 301, `THREADS_PER_BLOCK` of 100:
    $$
    \\frac{301 + 100 - 1}{100} = \\frac{400}{100} = 4
    $$
    That is 4 blocks, 100 threads each, with the last block holding 1 thread.
    

The trick is widely used wherever a set of items has to be split into as many equally sized blocks as possible.

The logic of `dispatch.sv`:

1.  **Reset handling**: on reset, clear every state register and reset the core states.
2.  **Start logic**: on the `start` signal, initialise execution and reset all the cores.
3.  **Block dispatch**: based on the cores' reset state and the number of blocks dispatched, decide whether to dispatch a new block to a core.
4.  **Core-completion handling**: when a core finishes its current block, update the count of completed blocks and reset the core.

Some of the code deserves a closer look:

```verilog
end else if (start) begin
    // EDA: Indirect way to get @(posedge start) without driving from 2 different clocks
    if (!start_execution) begin
        start_execution <= 1;
        for (int i = 0; i < NUM_CORES; i++) begin
            core_reset[i] <= 1;
        end
    end

    // If the last block has finished processing, mark this kernel as done executing
    if (blocks_done == total_blocks) begin
        done <= 1;
    end

    for (int i = 0; i < NUM_CORES; i++) begin
        if (core_reset[i]) begin
            core_reset[i] <= 0;

            // If this core was just reset, check if there are more blocks to be dispatched
            if (blocks_dispatched < total_blocks) begin
                core_start[i] <= 1;
                core_block_id[i] <= blocks_dispatched;
                core_thread_count[i] <= (blocks_dispatched == total_blocks - 1)
                    ? thread_count - (blocks_dispatched * THREADS_PER_BLOCK)
                    : THREADS_PER_BLOCK;

                blocks_dispatched = blocks_dispatched + 1;
            end
        end
    end

    for (int i = 0; i < NUM_CORES; i++) begin
        if (core_start[i] && core_done[i]) begin
            // If a core just finished executing it's current block, reset it
            core_reset[i] <= 1;
            core_start[i] <= 0;
            blocks_done = blocks_done + 1;
        end
    end
end
```

Taking it piece by piece.

Initialisation and starting execution:

```verilog
if (!start_execution) begin
    start_execution <= 1;
    for (int i = 0; i < NUM_CORES; i++) begin
        core_reset[i] <= 1;
    end
end
```

When `start` arrives, the first thing checked is the `start_execution` flag. If this is the first time execution has begun, `start_execution` is set to 1 and every core is reset. The flag is what makes sure initialisation happens exactly once over the whole run.

Then check whether every block has been processed:

```verilog
if (blocks_done == total_blocks) begin
    done <= 1;
end
```

Every clock cycle, check whether `blocks_done` equals `total_blocks`. If every block has been processed, `done` goes to 1 to say the work is finished.

The dispatch logic is the heart of it:

```verilog
for (int i = 0; i < NUM_CORES; i++) begin
    if (core_reset[i]) begin
        core_reset[i] <= 0;

        if (blocks_dispatched < total_blocks) begin
            core_start[i] <= 1;
            core_block_id[i] <= blocks_dispatched;
            core_thread_count[i] <= (blocks_dispatched == total_blocks - 1)
                ? thread_count - (blocks_dispatched * THREADS_PER_BLOCK)
                : THREADS_PER_BLOCK;

            blocks_dispatched = blocks_dispatched + 1;
        end
    end
end
```

Walk every core; if a core is in reset (`core_reset[i]` is 1), clear its reset flag (`core_reset[i] <= 0`). Then check whether any blocks are still unassigned (`blocks_dispatched < total_blocks`). If there are, assign one to this core and update the associated signals:

-   `core_start[i]`: start this core.
    
-   `core_block_id[i]`: assign this block's ID.
    
-   `core_thread_count[i]`: set the number of threads this core is to process. On the last block, there may not be enough threads to fill it.
    
-   `blocks_dispatched`: increment the count of dispatched blocks.
    
    ```
      core_thread_count[i] <= (blocks_dispatched == total_blocks - 1)
        ? thread_count - (blocks_dispatched * THREADS_PER_BLOCK)
        : THREADS_PER_BLOCK;
    
    ```
    

`core_thread_count[i]` is the number of threads core `i` (the current core) is processing.

`THREADS_PER_BLOCK` is the number of threads in a full block.

`thread_count` is the total number of threads, and `blocks_dispatched * THREADS_PER_BLOCK` is the number of threads already dispatched.

So the logic is: if the block being dispatched is the last one, put the remaining threads (less than a full block) into it. If it is not the last one, fill the block.
