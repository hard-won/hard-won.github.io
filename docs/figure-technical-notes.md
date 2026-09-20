# FIG. 01 — technical notes

What `src/components/DataflowFigure.astro` encodes, in three strictly separated
parts:

- **[A. Cited claims](#a-cited-claims)** — statements with a source that was
  fetched and read, and that actually supports the statement it is attached to.
- **[B. Assumptions of the depicted configuration](#b-assumptions-of-the-depicted-configuration)**
  — things the figure draws that are design choices, not facts about any
  shipping part. Nothing here is sourced, and nothing here should be repeated
  as though it were.
- **[C. Omissions and simplifications](#c-omissions-and-simplifications)** —
  what is absent, so nobody mistakes a schematic for a model.

The plate prints no number carrying a unit — no GB/s, no FLOP/byte, no latency,
no percentage. Every quantitative statement is here, in prose. Where a source's
number differs from a number this figure was originally briefed to encode, the
number below is the source's.

---

## A. Cited claims

### A1 — The operator order

| # | Claim | Source |
|---|---|---|
| 1 | A Llama-style decoder layer is **pre-norm**: the norm is applied to each sublayer's input and the residual is added after the sublayer. | `meta-llama/llama`, `llama/model.py`, `TransformerBlock.forward`: `h = x + self.attention(self.attention_norm(x), ...)`; `out = h + self.feed_forward(self.ffn_norm(h))`. [2] |
| 2 | Within attention the order is **QKV projection → RoPE → append K,V to the cache → attend over the whole cache → output projection**. | Same file, `Attention.forward`: `wq/wk/wv` → `apply_rotary_emb(xq, xk, freqs_cis)` → `self.cache_k[..., start_pos:start_pos+seqlen] = xk` (and `cache_v`) → read cache → `repeat_kv` → softmax attention → `self.wo(output)`. [2] |
| 3 | **`KV READ` is not a peer operator of `QKV PROJ`.** It is operand traffic belonging to attention, in exactly the way a weight fetch is operand traffic belonging to a projection. This is the error the rebuild exists to fix: the figure tags `ATTN` with `RD KV` and gives KV read no block of its own. | Follows from claim 2. Corroborated by the per-operator decomposition in [1] Table 1, whose decode rows are `q_proj`, `k_proj`, `v_proj`, `o_proj`, `qk_matmul`, `sv_matmul`, `softmax`, `norm`, `add` — there is no "KV read" operator. |
| 4 | Three operators of the layer read weights (`QKV PROJ`, `O PROJ`, `MLP`), one writes KV (`KV APPEND`), one reads KV (`ATTN`). | Claims 1–3. |

Precision the figure does not draw: RoPE is applied to Q and K only, never to V
(`apply_rotary_emb(xq, xk, freqs_cis)` takes two tensors).

### A2 — HBM structure

| # | Claim | Source |
|---|---|---|
| 5 | An HBM3 stack's 1024-bit interface is divided into **16 independent 64-bit channels**, and each channel is split into **two 32-bit pseudo-channels** — 32 pseudo-channels per stack. The figure divides every channel bar into two lanes for this reason. | Synopsys, *What Designers Need to Know About HBM3*: "this 1024-bit interface is now divided into 16 64-bit channels"; "the width of the pseudo-channels has been reduced to 4 bytes". [3] |
| 6 | The two pseudo-channels of a channel **share a command bus and execute commands individually**, and because the C/A bus runs slower than the data bus, command and address can be sent to the two pseudo-channels **in an interleaved fashion**. This is the mechanism the figure's alternating lane sweep depicts. | AMD, *Memory controller with pseudo-channel support*, US 12,117,945 B2. [4] |
| 7 | **The address-to-channel/bank/row mapping is a memory-controller policy, and the choice is worth roughly an order of magnitude** in achieved throughput. Changing nothing but the bank/row/column mapping moved sequential-traversal throughput by about that much on an FPGA HBM stack. | Wang et al., *Benchmarking High Bandwidth Memory on FPGAs*, §IV-B and Table II. [8] Scope: HBM2 on a Xilinx U280, and its policies permute row, bank-group, bank and column **within** a channel. |
| 8 | It is a policy and not a law, and real controllers differ. The Xilinx AXI HBM controller does **not** interleave across channels by default — each pseudo-channel owns a contiguous 256 MB region, and out-of-region traffic must cross a switch at a cost. | Xilinx, Vitis Tutorials — *Using HBM: Overview*. [7] Corroborated by [8] §II: "A pseudo channel is only allowed to access its associated HBM channel that has its own address region of memory." A different controller model chooses the opposite: the gem5/Rambus HBM2 model "interleaves the memory requests across pseudo channels at a granularity of 64B". [6] |

**Not claimed, anywhere, by the figure or by this document: "the pseudo-channel
is selected by address bit BA4."** That wording appears in search-engine
summaries and could not be found in US 12,117,945 B2, in US 12,073,114 B2, or
in the Synopsys HBM3 documentation. JESD238 is paywalled and was not read. The
figure encodes only claim 6's mechanism.

### A3 — The on-chip network

| # | Claim | Source |
|---|---|---|
| 9 | An accelerator's distribution network must support **unicast, multicast and broadcast** delivery — point-to-point flits to arbitrary tiles are the wrong picture. | Flexagon §3.1: "the DN needs to support unicast, multicast and broad-cast data delivery." [9] Corroborated by [10] Table VIII. |
| 10 | The reason is **reuse**: the same weights and activations feed many PEs, so traffic is one-to-many on the way in and many-to-one on the way back. The figure draws weight delivery as a tree that fans out to every tile on a row. | Dave et al. §VIII-A: "Data can be reused spatially by distributing it to multiple PEs or functional units... Most accelerators leverage spatial reuse with multicast or broadcast NoC." [10] Tiwari et al.: DNN accelerator traffic is one-to-many and many-to-one, and mesh-based NoCs cannot support it efficiently. [11] |
| 11 | **Partial sums are forwarded and accumulated along one dimension toward an edge** — spatio-temporal reduction — rather than drifting between neighbours. | Dave et al. §VIII-B-3 ("Spatio-temporal"): "when data streams through PEs of a systolic array, there is an inter-PE spatial reduction of partial outputs (via PEs of each column). Then, the bottom PE-row provides the reduced partial outputs to accumulator buffers (CompAct, TPU)." [10] |
| 12 | In a **weight-stationary** array the dimension is the column: activations traverse the rows, partial sums traverse the columns, with activation multicast and partial-sum fan-in. | Scale-out Systolic Arrays. [12] |
| 13 | The TPU is built that way: accumulators sit **below** the matrix unit. | Jouppi et al. §2: "The 16-bit products are collected in the 4 MiB of 32-bit Accumulators below the matrix unit"; Fig. 4: "data flows in from the left, and the weights are loaded from the top." [13] |

### A4 — Decode is memory-bandwidth-bound

| # | Claim | Source |
|---|---|---|
| 14 | **Every operator of the decode stage is memory-bound.** The figure encodes this with two bars drawn in the same grammar: four channel bars that never leave the top of their range, and one `TILES` bar that spends the step near the bottom of its. | [1] §4: "in the decode stage, all computations are memory-bound, resulting in performance significantly below the computational capacity of the GPU's computation units." Table 1 labels all nine decode rows "memory". |
| 15 | The gap between decode arithmetic intensity and the hardware ridge point is about **two orders of magnitude**. | [1] Table 1 — Llama-2-7b, **batch 1, sequence 2048, FP16, NVIDIA A6000**: arithmetic intensity **1 OP/byte** for all six projections, 0.99 for `qk_matmul` and `sv_matmul`, 1.25 softmax, 1.75 norm, 0.25 add. The ridge point is not printed; it follows from the same table — the compute ceiling is 155 T OPS and AI = 1 yields 768 G OPS, so bandwidth is 768 GB/s and the ridge is **155e12 / 768e9 ≈ 202 OP/byte**, matching the turning point drawn near 200 in Fig. 5. |
| 16 | The same gap on current hardware. | NVIDIA H100 **SXM** [14]: BFLOAT16 tensor-core peak 1,979 TFLOPS *with sparsity*, i.e. **≈ 989.5 TFLOPS dense**; memory bandwidth **3.35 TB/s**. Ridge ≈ 989.5e12 / 3.35e12 ≈ **295 FLOP/byte**. H100 NVL/PCIe differs materially (≈ 836 TFLOPS dense over 3.9 TB/s ≈ 214 FLOP/byte), so the part must be named. |
| 17 | At batch size one **every weight is read from HBM once per token**, and the compute core is largely idle while it happens. | Pope et al. §2: these tensors "need to be transferred from HBM to the compute cores of the chip once per forward pass (prefill or decode step)"; §2.1: the KV cache is loaded from off-chip memory "once for every token generated during which the computational core of the chip is essentially idle." [15] |

**Two numbers from the original brief were not inherited.** The brief gave
"~3–15 FLOP/byte against a ridge point near 100 FLOP/byte on H100". The cited
paper measures **≈ 1 OP/byte** at batch 1, on an **A6000**, against a ridge near
**202**; the H100 SXM BF16 dense ridge is **≈ 295**, not 100. Because the plate
prints no number, only the qualitative gap is encoded, and the corrected figures
live here.

### A5 — Traffic proportions

| # | Claim | Source |
|---|---|---|
| 18 | **Weight traffic dominates per-token traffic at short sequence lengths**, which is why the weight class is drawn as a whole network lighting up while KV is a handful of small flits. | Pope et al. §2.1: "At small batch sizes and sequence lengths, the time to load weights dominates." [15] |
| 19 | **The KV cache grows by this token's K and V at every decode step, per layer.** The figure shows the write leaving a tile, crossing the controller edge into HBM, and the gauge gaining a group of cells on arrival. | [1] §2.1: `K_cat = [K_cache, X_dec·W_k]`, `V_cat = [V_cache, X_dec·W_v]`, "These newly computed ... are then appended to the KV cache"; each layer is "equipped with its own unique KV cache." |
| 20 | **Attention at step T reads O(T) of cache, so KV read traffic grows every step.** The figure emits 2, then 4, then 6 KV-read flits across the three steps of the loop. | [1] §2.1 and §6: "a long sequence length may increase the memory access overhead of KV-cache reading in each decoding step." |
| 21 | **Cumulative KV read traffic over a generation is O(T²).** | A one-line consequence of claim 20 summed over T steps. No source found prints it, so it is a **derivation, not a citation**. Pope et al. make the neighbouring point that "inference cost from the attention mechanism scales quadratically with input sequence length." [15] |
| 22 | **Where the crossover lands is workload-dependent, and the figure does not assert it.** Nothing on the plate says at which sequence length KV traffic overtakes weight traffic. | Pope et al. §2 states both ends and no constant: "At small batch sizes and sequence lengths, the time to load weights dominates. At larger batch sizes and sequence lengths (e.g. 2048+ tokens with batch size 512+), the time to load the KV cache dominates." [15] The site's own note derives the expression `T* = P·b_w / (2·L·n_kv·d_h·b_kv)`. |

---

## B. Assumptions of the depicted configuration

None of this is sourced. All of it is a drawing decision. It is listed
separately because the figure would be misleading if any of it were read as a
fact about a shipping part.

### B1 — The accelerator model

The interconnect band is not "a generic mesh". It is one assumed machine, and
the figure should only be read against it.

| # | Assumed | Why it is only an assumption |
|---|---|---|
| A | Weight-stationary tiles in a **2D mesh**. | A dataflow and topology choice. Real accelerators use Benes networks, trees, buses, crossbars and hierarchies; [9] builds its distribution network as a Benes network, not a mesh. |
| B | **Memory controllers at one die edge**, drawn on the left between the channels and the array. | No primary source was found for this placement. It is a plausible and common floorplan, and it is drawn because the figure needs the interface to be *somewhere* and putting it on one side makes the distance the traffic crosses visible. Nothing more. |
| C | Weights **multicast from that edge** along a trunk down the edge and a branch along each row. | The *need* for multicast is cited (claims 9–10). This tree shape, and rooting it at the memory edge, is drawn, not sourced. **These row branches are not the systolic weight-load path.** Claim 13 has the TPU loading weights into the array from the top; the rows here are the NoC delivering weight blocks from HBM to the tiles, which happens at a different level. The figure draws the delivery, not the load, and puts it on rows so that it stays perpendicular to the reduction in D. |
| D | Partial sums reduce **down each column** into an accumulator bank at the bottom edge. | The direction is consistent with claims 11–13, but the bank's position and the one-flit-per-column rendering are drawing choices. Distribution on rows and reduction on columns also makes the two directions perpendicular, so they can never be confused — a legibility decision as much as an architectural one. |
| E | Four HBM channels; a 4×4 tile array (4×3 on the narrow plate). | HBM3 has **sixteen** channels per stack (claim 5). The counts on the plate are illustrative. |

**Departure from the brief, logged.** The brief for this figure pinned "partial
sums reduced along a row toward the edge". The figure reduces down columns
instead. The brief's own correction permitted "a row or a column"; claims 12–13
show the column is the weight-stationary convention; and perpendicular
directions are unambiguous where two opposing streams on the same rows are not.

### B2 — The HBM stripe sweep

The figure draws all four channels busy at once, with the served stripe sweeping
CH0 → CH1 → CH2 → CH3 in staggered phase.

**This is what fine-grained cross-channel interleaving looks like, and
fine-grained cross-channel interleaving is assumed, not demonstrated.** No
source was found showing that a real device interleaves a weight tensor across
all HBM channels. What *is* cited is that the address map is a controller policy
(claim 7) and that controllers genuinely differ (claim 8) — the Xilinx default
gives each pseudo-channel its own contiguous region, which would produce a
completely different picture.

The plate states the assumption on itself, in a footnote beside the key:
`ASSUMES FINE-GRAIN CHANNEL INTERLEAVE`.

The two-lane split within each channel bar, and the sweep alternating between
the lanes, depicts claim 6's mechanism (shared C/A bus, commands executed
individually, C/A interleaved between the two pseudo-channels). The figure does
**not** name an address bit, and no address bit should be inferred from it.

### B3 — Everything else on the plate that is a drawing decision

| # | Assumed |
|---|---|
| F | **Occupancy fills are qualitative.** No axis, no units. Their peaks are placed by operator, not measured. The channel/`TILES` contrast encodes the direction of claims 14–16, not their magnitude. |
| G | **The eight operator slots are equal width.** That is an *order*, not a latency breakdown; real operator durations differ by more than an order of magnitude. |
| H | **The KV gauge is an occupancy readout, not a capacity limit.** It is segmented because a cache grows a page at a time, it gains one group per step, and six of its eighteen cells are never reached in the loop — a full bar would read as a measured ceiling. |
| I | **Traffic volumes are not to scale.** Weights are drawn as a whole network lighting up and KV as a few flits to encode the *direction* of claims 18–20. The ratio on the plate is not a measured ratio. |
| J | **The loop rates mean nothing.** The 18s loop, the 6s step and the 4.5s stripe cycle are drawing rates chosen for legibility. |
| K | **Three decode steps and a reset.** A real sequence is thousands of steps; the gauge would not fit on the page. |
| L | The tile drawing — a router with an input queue compartment beside a PE — is a **pictogram**. Queue depth, occupancy and backpressure are not modelled. |

---

## C. Omissions and simplifications

Everything absent, so nothing here is mistaken for a model.

**Memory**
- No refresh. No bank conflicts, no row-buffer hits or misses, no bus
  turnaround, no read/write turnaround penalty, no controller queueing. The
  ordering effects that make the address map matter (claim 7) are exactly the
  effects that do not appear.
- One stack. No stack-to-stack or NUMA structure. No ECC, no repair, no
  thermal throttling.
- No distinction between the KV write path and the weight read path other than
  direction — no write buffering, no write-combining.

**Interconnect**
- One statically routed multicast tree shape. No arbitration, no virtual
  channels, no credit-based flow control, no congestion, no deadlock avoidance,
  and no flit/packet distinction — a "flit" here is a parcel of traffic and
  nothing more.
- No local scratchpad, no SRAM hierarchy between HBM and the array, no
  double-buffering of weights.
- The accumulator bank tints on arrival; accumulation width, spill and
  writeback are not shown.
- One tile, one PE. No intra-tile datapath, no systolic skew, no pipeline fill
  or drain.

**Workload**
- **Batch of one.** Batching is the knob that changes the conclusion, and the
  figure assumes it away.
- One layer, one decode step. **No prefill** — prefill is compute-bound and
  would look nothing like this.
- **No grouped-query or multi-query attention.** Head grouping directly scales
  KV traffic and is not drawn.
- No KV quantisation, no paged attention, no block granularity, no
  fragmentation, no eviction, no prefix sharing.
- Dense model only. In a mixture of experts the per-token active parameter
  count is a fraction of the total and the weight term stops being constant.
- No speculative decoding, where one weight read verifies several tokens.
- No tensor, pipeline or sequence parallelism; no inter-device collectives.
- RoPE is drawn as one block and the two residual adds are not drawn at all.
  Residual adds do move bytes ([1] Table 1 gives `add` an intensity of 0.25);
  they are omitted for space, as the brief permitted. Their *position* in the
  order is still correct, because nothing was reordered to make room.

---

## References

1. Z. Yuan et al., "LLM Inference Unveiled: Survey and Roofline Model
   Insights." <https://arxiv.org/abs/2402.16363>
2. Meta, `meta-llama/llama`, `llama/model.py`.
   <https://github.com/meta-llama/llama/blob/main/llama/model.py>
3. Synopsys, "What Designers Need to Know About HBM3."
   <https://www.synopsys.com/articles/hbm3-ip-dwtb.html>
4. H. Kanayama and Y. Yao, "Memory controller with pseudo-channel support."
   US Patent 12,117,945 B2, Advanced Micro Devices, 2024.
   <https://patents.google.com/patent/US12117945B2/en>
5. *(withdrawn — see "Sources deliberately not cited")*
6. M. Akram, M. Babaie, W. Elsasser, J. Lowe-Power, "Modeling HBM2 Memory
   Controller." gem5 Users' Workshop @ ISCA 2022.
   <https://arch.cs.ucdavis.edu/assets/papers/gem5Users_HBM_2022.pdf>
7. Xilinx, Vitis Tutorials — "Using HBM: Overview."
   <https://xilinx.github.io/Vitis-Tutorials/2021-1/build/html/docs/Hardware_Acceleration/Feature_Tutorials/07-using-hbm/1_overview.html>
8. Z. Wang, H. Huang, J. Zhang, G. Alonso, "Benchmarking High Bandwidth Memory
   on FPGAs." <https://arxiv.org/abs/2005.04324>
9. F. Muñoz-Martínez et al., "Flexagon." §3.1.
   <https://arxiv.org/abs/2301.10852>
10. S. Dave et al., "Hardware Acceleration of Sparse and Irregular Tensor
    Computations of ML Models." §VIII-A, §VIII-B-3, Table VIII.
    <https://arxiv.org/abs/2007.00864>
11. B. Tiwari, M. Yang, X. Wang, Y. Jiang, "Data Streaming and Traffic
    Gathering in Mesh-based NoC for Deep Neural Network Acceleration."
    <https://arxiv.org/abs/2108.02569>
12. A. C. Yüzügüler et al., "Scale-out Systolic Arrays." TACO,
    DOI 10.1145/3572917; preprint <https://arxiv.org/abs/2203.11540>
13. N. Jouppi et al., "In-Datacenter Performance Analysis of a Tensor
    Processing Unit." §2, Fig. 4. <https://arxiv.org/abs/1704.04760>
14. NVIDIA, H100 Tensor Core GPU product page (SXM column).
    <https://www.nvidia.com/en-us/data-center/h100/>
15. R. Pope et al., "Efficiently Scaling Transformer Inference." §2, §2.1.
    <https://arxiv.org/abs/2211.05102>

### Sources deliberately not cited

- **JESD238 (HBM3)** — paywalled, not read. Claim 6 rests on [4].
- **Intel HBM2 FPGA IP User Guide** (the BA4 pseudo-channel selector) — both
  URLs failed (403 / table-of-contents only). Not cited, and the claim it would
  support is not encoded anywhere in the figure.
- **PIMMiner, arXiv 2306.10257** §4.3.1 — states that a default address mapping
  interleaves consecutive addresses across channels. **Withdrawn (ref 5) on
  review:** it describes one PIM platform's default mapping and is not evidence
  that an accelerator interleaves a weight tensor across HBM channels, which is
  the claim it was going to be attached to. That claim is now listed as an
  assumption (§B2) with no source at all, which is the honest place for it.
- **Kwon et al., NOCS'17, "Rethinking NoCs for spatial neural network
  accelerators"** — text not retrieved; claim 10 rests on [9], [10], [11].
- **arXiv 2501.17567** (wireless multi-chip AI accelerators) — relevant only to
  multicast congestion, and [9]–[11] say it more directly.
