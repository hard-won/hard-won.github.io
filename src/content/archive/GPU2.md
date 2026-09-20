---
title: "手搓GPU（二）"
date: 2024-06-04T23:03:29-07:00
displayDate: "2024-06-04"
slug: "GPU2"
lang: zh
categories: ["技术", "数字IC", "GPU"]
tags: []
originalUrl: "/2024/06/04/GPU2/"
---
上篇介绍了GPU的架构和顶层设计。还有整个simulation的workflow。下面介绍各个部分。

# Device Control Register

用来控制要在kernel里跑哪个thread。

就是在内部产生的control信号加上一个DFF再输出到kernel

# Dispatcher

先看IO

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

输入信号：

-   `thread_count`：要执行的线程总数。
-   `core_done`：每个核心完成当前块的状态信号。

输出信号：

-   `core_start`：启动每个core的信号。
-   `core_reset`：重置每个core的信号。
-   `core_block_id`：每个core正在处理的block ID。
-   `core_thread_count`：每个core正在处理的thread数量。
-   `done`：kernel执行完成信号。

Block Dispatch 这个模块的主要功能是在接收到开始信号后，按照每block固定的thread数，将线程分派给各个core进行处理，并在所有block处理完后发出done信号。每个核心的状态由 `core_done` 信号指示，当核心完成其当前block的处理后，模块将其reset并派发新的 block（如果还有剩余block需要处理）。

在GPU里，将任务分成多个block后，可以将这些block分配给多个计算核心（cores）同时处理，从而实现并行计算。例如，如果有1000个thread，分成每block 100个thread，10个block，并行处理这些块会比串行处理1000个thread要快得多。

🤔想象 一个core是一个work station，thread是每个工人，block就是把全部工人分成几个小work group。然后分配给不同的core。

---

```verilog
assign total_blocks = (thread_count + THREADS_PER_BLOCK - 1) / THREADS_PER_BLOCK;
```

这里需要特别解释。这里是计算出需要多少个块（blocks）来处理给定数量的线程（threads）。

`thread_count + THREADS_PER_BLOCK - 1`这个步骤的目的是为了在计算需要多少个块时避免舍入错误。我们用一个示例来说明：

-   **thread\_count**：表示要处理的线程总数（总线程数）。
-   **THREADS\_PER\_BLOCK**：表示每个块中的线程数（每块线程数）。

这行代码计算了需要多少个块（`total_blocks`）来处理所有线程，具体步骤如下：

1.  **thread\_count + THREADS\_PER\_BLOCK - 1**：先将总线程数加上每块线程数再减去1。
2.  **(thread\_count + THREADS\_PER\_BLOCK - 1) / THREADS\_PER\_BLOCK**：再将上述结果除以每块线程数，得到需要的块数。

当我们想要将一个数分成尽量多的块，并且每块的大小相等时，需要考虑上取整的情况。假设我们有 `N` 个项目（threads），每个块包含 `k` 个项目（threads per block）。

$$
\\text{blocks\_needed} = \\left\\lceil \\frac{N}{k} \\right\\rceil
$$
其中，
$$
\\left\\lceil \\cdot \\right\\rceil
$$
表示**上取整**。上取整的目的是确保即使最后一个块没有满，也需要一个完整的块来包含剩余的项目。

通过 `(thread_count + THREADS_PER_BLOCK - 1) / THREADS_PER_BLOCK` 这个公式，可以实现上取整的效果。数学上，可以理解为：

$$
\\left\\lceil \\frac{N}{k} \\right\\rceil = \\frac{N + k - 1}{k}
$$

### 例子

我们用几个具体的例子来验证这个公式：

1.  如果 `thread_count` 为 250，`THREADS_PER_BLOCK` 为 100：
    $$
    \\frac{250 + 100 - 1}{100} = \\frac{349}{100} = 3.49 \\rightarrow 3
    $$
    这表示需要3个块，每个块100个线程，最后一个块包含50个线程。
    
2.  如果 `thread_count` 为 301，`THREADS_PER_BLOCK` 为 100：
    $$
    \\frac{301 + 100 - 1}{100} = \\frac{400}{100} = 4
    $$
    这表示需要4个块，每个块100个线程，最后一个块包含1个线程。
    

这个技巧广泛用于需要将一组项目分成尽量多的块且每块大小相等的情况中。

[dispatch.sv](http://dispatch.sv) 的代码逻辑：

1.  **复位处理**：复位时，清除所有状态寄存器，重置核心状态。
2.  **启动逻辑**：如果收到 `start` 信号，初始化执行，并复位所有核心。
3.  **块派发**：根据核心的复位状态和派发的块数，决定是否向核心派发新的块。
4.  **核心完成处理**：如果核心完成当前块，更新完成块数，并复位核心。

有部分代码需要详细讲解一下：

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

其中

初始化和开始执行

```verilog
if (!start_execution) begin
    start_execution <= 1;
    for (int i = 0; i < NUM_CORES; i++) begin
        core_reset[i] <= 1;
    end
end
```

当收到 `start` 信号时，首先检查 `start_execution` 标志。如果这是第一次开始执行，则将 `start_execution` 设为1，并reset所有核心。这个标志确保在整个过程中只进行一次初始化。

然后检查所有块是否已完成处理

```verilog
if (blocks_done == total_blocks) begin
    done <= 1;
end
```

每个时钟周期检查 `blocks_done` 是否等于 `total_blocks`。如果所有块都已处理完毕，则将 `done` 信号设为1，表示任务完成。

重点是这个dispatch派发逻辑：

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

遍历所有核心，如果某个核心处于重置状态（`core_reset[i]` 为1），则将其复位标志清除（`core_reset[i] <= 0`）。然后检查是否还有未分配的块（`blocks_dispatched < total_blocks`）。如果有未分配的块，则将该块分配给当前核心，并更新相关信号：

-   `core_start[i]`：启动当前核心。
    
-   `core_block_id[i]`：分配当前块的ID。
    
-   `core_thread_count[i]`：设置当前核心处理的线程数。如果这是最后一个块，thread数量可能放不满block。
    
-   `blocks_dispatched`：递增已分配块的计数。
    
    ```
      core_thread_count[i] <= (blocks_dispatched == total_blocks - 1)
        ? thread_count - (blocks_dispatched * THREADS_PER_BLOCK)
        : THREADS_PER_BLOCK;
    
    ```
    

core\_thread\_count\[i\] 是第i个core（当前core）正在处理的thread数量。

`THREADS_PER_BLOCK`一个block放满的thread数量

`thread_count`是thread的总数，`blocks_dispatched * THREADS_PER_BLOCK`是目前已经分配过的thread数。

所以这里的逻辑是：如果dispatch到block到了最后一个block，就把剩下的（不足一个满block）thread放进最后一个block里。如果不是最后一个block，那就用thread放满block。
