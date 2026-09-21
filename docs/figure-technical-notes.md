# The homepage figure — technical notes

What `src/components/DataflowFigure.astro` encodes, in three strictly separated
parts:

- **[A. Cited claims](#a-cited-claims)** — statements with a source that was
  fetched and read, and that actually supports the statement it is attached to.
- **[B. Assumptions of the depicted configuration](#b-assumptions-of-the-depicted-configuration)**
  — things the figure draws that are design or presentation choices, not facts
  about any shipping part. Nothing here is sourced, and nothing here should be
  repeated as though it were.
- **[C. Omissions and simplifications](#c-omissions-and-simplifications)** —
  what is absent, so nobody mistakes a schematic for a model.

The figure prints no number carrying a unit: no GB/s, no FLOP/byte, no latency,
no percentage, no bar whose length stands for a rate. The one integer it does
print is a count of valid KV positions. Every quantitative statement about this
workload lives in the Note, [*A decode step, as
traffic*](../src/content/notes/decode-step-as-traffic.mdx), and is derived in
`src/lib/decode-traffic/traffic-model.ts`.

**The figure is a rendering of a tested model, not a drawing of one.**
`src/lib/decode-traffic/event-model.ts` holds the event ledger — every event,
its duration, its dependencies and its route — and validates it on
construction. `src/lib/figure/frame.ts` turns `(ledger, t)` into the complete
visual state of a frame. The component calls it once at build time for the
static frame; `src/scripts/dataflow-figure.ts` calls the same functions on each
tick. There are no CSS keyframes, no transitions and no independent periods in
the figure, so a claim below that is enforced by the ledger is enforced in every
frame, not just the one that was checked.

Tests: `tests/reference.test.ts` and `tests/note-numbers.test.ts` cover the
model and the Note's numbers; `tests/figure-frame.test.ts` sweeps the sampler
across both scenes at 10 ms intervals and at every event boundary.

---

## A. Cited claims

### A1 — The operator order (View A)

| # | Claim | Source | Where it is enforced |
|---|---|---|---|
| 1 | A Llama-style decoder layer is **pre-norm**: the norm is applied to each sublayer's input and the residual is added after the sublayer, so there are **two residual adds** per layer and each adds a different thing. | `meta-llama/llama`, `llama/model.py`, `TransformerBlock.forward`: `h = x + self.attention(self.attention_norm(x), ...)`; `out = h + self.feed_forward(self.ffn_norm(h))`. [1] | `STAGES` has `res1` and `res2`; each residual event records its own `skip` source, and `validateLayerSemantics` asserts `res1` skips `layer_input` and `res2` skips `after_attention_residual`. The stage strip prints those two sources verbatim. |
| 2 | Within attention the order is **QKV projection → RoPE → append K,V to the cache → attend over the whole valid range → output projection**. | Same file, `Attention.forward`: `wq/wk/wv` → `apply_rotary_emb(xq, xk, freqs_cis)` → `self.cache_k[..., start_pos:start_pos+seqlen] = xk` (and `cache_v`) → read cache → `repeat_kv` → softmax attention → `self.wo(output)`. [1] | The ledger's dependency edges. `attn.qk` depends on `attn.k.return`; `o.compute` depends on `attn.pv`. |
| 3 | **RoPE is applied to Q and K only, never to V** (`apply_rotary_emb(xq, xk, freqs_cis)` takes two tensors). | Same file. [1] | The `rope` event records `targets: ['q','k']` and `notTargets: ['v']`; the stage label `ROPE (Q,K)` is generated from those fields. |
| 4 | **A KV read is not a peer operator of a projection.** It is operand traffic belonging to attention, exactly as a weight fetch is operand traffic belonging to a projection. | Follows from claim 2, and corroborated by the per-operator decomposition in [2] Table 1, whose decode rows are `q_proj`, `k_proj`, `v_proj`, `o_proj`, `qk_matmul`, `sv_matmul`, `softmax`, `norm`, `add` — there is no "KV read" operator. | KV reads are `request` / `memory-read` / `read-return` events **inside** the `attention` stage. They are parcels on the lane, never stage boxes. |
| 5 | **The current token contributes its own key and value to its own attention**, so the range attention reads includes the position just appended. | [1], `Attention.forward`: the cache is written at `start_pos` and then read as `keys = self.cache_k[:bsz, : start_pos + seqlen]`. | `kv.visible` records `validBefore = T0 + stepIndex` and `validAfter = T0 + stepIndex + 1`, and `attn.k.request` depends on `kv.visible`. The counter increments at exactly that event and nowhere else. |
| 6 | **At batch size one every weight is read from memory once per forward pass, and the compute core is largely idle while that happens.** | Pope et al. §2: these tensors "need to be transferred from HBM to the compute cores of the chip once per forward pass (prefill or decode step)"; §2.1: the KV cache is loaded from off-chip memory "once for every token generated during which the computational core of the chip is essentially idle." [3] | Each weight matrix has exactly one `memory-read` event per layer visit, and the COMPUTE band reads `WAITING FOR …` for every instant a read is outstanding. |

### A2 — Operand distribution and reduction (View B)

| # | Claim | Source | Where it is enforced |
|---|---|---|---|
| 7 | An accelerator's distribution network carries **one-to-many traffic on the way in and many-to-one on the way back**, because the same operands feed many processing elements. | Dave et al. §VIII-A: "Data can be reused spatially by distributing it to multiple PEs or functional units… Most accelerators leverage spatial reuse with multicast or broadcast NoC." [4] Flexagon §3.1: the distribution network "needs to support unicast, multicast and broad-cast data delivery." [5] | View B draws the row activation slice `x[I_r]` delivered once and forwarded across the row — one-to-many — and partial sums converging down each column — many-to-one. |
| 8 | **Partial sums are forwarded and accumulated along one dimension toward an edge**, rather than drifting between neighbours. | Dave et al. §VIII-B-3 ("Spatio-temporal"): "when data streams through PEs of a systolic array, there is an inter-PE spatial reduction of partial outputs (via PEs of each column). Then, the bottom PE-row provides the reduced partial outputs to accumulator buffers." [4] | `psum.r.c` routes `T(r-1)c → Trc`; `sum.r.c` depends on both that hop and the receiving tile's own local product; `output.c` routes `T(R-1)c → ACCc`. `validateProjectionSemantics` checks the contributor list at every step. |
| 9 | Reduction **down the column, with activations traversing the rows**, is the weight-stationary convention, and accumulators sit at the far edge. | Scale-out Systolic Arrays [6]. Jouppi et al. §2: "The 16-bit products are collected in the 4 MiB of 32-bit Accumulators below the matrix unit"; Fig. 4: "data flows in from the left, and the weights are loaded from the top." [7] | The drawn edge set: `A_r → T_r0 → T_r1 → T_r2` horizontally, `WBUF → WROOT_c → T0c → T1c → ACC_c` vertically. |
| 10 | **"Weight-stationary" does not by itself license sending the same weights to every tile.** Stationarity says where an operand rests during an execution phase; it does not fix the partitioning. | [6] describes the dataflow, not a partitioning rule; [4] §VIII-A distinguishes reuse mechanisms from mappings. This entry exists because the previous version of this figure drew an undifferentiated weight multicast trunk and called it weight-stationary. | View B gives every block exactly one owner: `weight.r.c` carries `W[J_c, I_r]` with `owner: T{r}{c}` and `destinations: [T{r}{c}]`. A block that transits a nearer tile does not make that tile ready — `tests/figure-frame.test.ts` asserts this at 1.450 s, where `W[J1,I1]` is passing through `T01` and `T11` is still not weight-ready. |

### A3 — Algebra of the blocked product

| # | Claim | Source | Where it is enforced |
|---|---|---|---|
| 11 | With rows partitioning the reduction index and columns partitioning the output index, `y[J_c] = Σ_r W[J_c, I_r] · x[I_r]` reproduces the unblocked product exactly. | Elementary; proved by execution rather than cited. | `blockedMatvec()` in `traffic-model.ts` returns both the blocked result and the direct one, and `tests/reference.test.ts` asserts they agree and that every element of `W` has exactly one owner. |

---

## B. Assumptions of the depicted configuration

None of this is sourced. All of it is a drawing or presentation decision. It is
listed separately because the figure would mislead if any of it were read as a
fact about a shipping part.

### B1 — The schedule

| # | Assumed |
|---|---|
| A | **The layer's work is serialized.** Q, K and V are three logically parallel projections; the ledger runs them one after another so a reader can follow one operand at a time. Nothing about the hardware requires it, and the caption says the schedule is a chosen serial illustration. |
| B | **Cache-first: the appended K and V are written toward memory and become visible before attention reads the range.** This is a depiction, not a hardware law. An implementation may keep the current K and V on chip, forward them into the kernel, or overlap the write with the read. Drawing the round trip makes the dependency visible; the caption says so, and the Note argues the payload accounting separately (`C·T` unique payload versus `C·(T−1)` cold read of the older cache). |
| C | **No prefetch, no overlap, no fusion.** Every read is requested, serviced and returned before its consumer runs. A real implementation that prefetched would be a different, also-valid picture; this one was chosen because overlap is what made the previous figure's causality unreadable. |
| D | **The durations are legibility settings.** The layer scene is 16.2 s and the projection scene 5.75 s of display time, the latter played at 0.5×. Stage boxes are equal width. Real operator durations differ by more than an order of magnitude, so the strip is an **order**, not a latency breakdown — printed on the figure as `EVENT ORDER ONLY · NOT A LATENCY SCALE`. |
| E | **Position along a path does not encode propagation speed.** A parcel's time is split evenly across the hops its route declares. |

### B2 — The topology

| # | Assumed |
|---|---|
| F | **Four endpoints in a line — device memory, memory controller, local buffers, compute.** A schematic boundary diagram, not a die floorplan, and not a claim about where a controller sits. The drawn lane is exactly `LAYER_EDGES`, and `tests/figure-frame.test.ts` asserts the two sets are equal, so no parcel can cross a line the figure does not draw. |
| G | **Weight and KV traffic share those endpoints** while keeping distinct tensor identities. The figure does not claim they share a physical path. |
| H | **A 2×3 tile array in View B.** Tiles hold submatrices and local arithmetic and storage; they are not six scalar PEs, and their drawn size is not a claim about area. The fixture in `blockedMatvec()` is a demonstration size, not a layer shape. |
| I | **The column link carries two different things** — a weight block descending to its owner, and a partial sum descending to be accumulated. Both are drawn on the same line because the ledger routes both there; they are told apart by parcel class and by the readout. |

### B3 — What the visual states mean

| # | Assumed |
|---|---|
| J | **Stage highlight, compute-waiting and compute-active are three distinct states**, drawn distinctly: an accent-marked stage box, a dashed marker on the compute band, and a filled accent band. A highlighted stage means "this is the phase being explained, possibly waiting"; only the filled band means arithmetic is running with its operands in hand. |
| K | **Request, read return and KV write are three distinct parcel classes**, told apart by fill and shape, not by colour alone. A request carries no payload (`payloadBytes: 0` in `attachLayerPayloads`). |
| L | **Operand demand is qualitative.** The figure names what class of operand a stage pulls across the memory boundary and appends `(QUALITATIVE, NOT MEASURED)`. There is no occupancy fill, no percentage and no bar whose length stands for a rate. Low arithmetic intensity bounds attainable throughput; it does not measure how busy a channel is, and the earlier version of this figure drew that confusion as two utilization-shaped bars. |
| M | **The KV readout is a count of valid positions for this one layer**, from a prefilled baseline of `T0 = 2048` to 2049. It is not capacity, not allocation, and not a page count. At wrap the figure says the count returns to that baseline; context never appears to evaporate mid-pass. |
| N | **`UNSHOWN WORK` is a separator, not an estimate.** The other layers, the final norm, the LM head and sampling are not drawn, and the width of that box says nothing about their cost. One layer never emits a sampled token. |
| O | **The static frames are chosen, and stated.** View A ships at 5.700 s, where attention is highlighted, `K[0:T]` is between device memory and the buffers, and compute reads `WAITING`. View B ships at 3.600 s, with a partial sum descending column 1 while two tiles are still forming their own products. These are the frames rendered without JavaScript and under `prefers-reduced-motion`. |

---

## C. Omissions and simplifications

Everything absent, so nothing here is mistaken for a model.

**Memory**

- No refresh, no bank conflicts, no row-buffer hits or misses, no bus
  turnaround, no read/write turnaround penalty, no controller queueing, no
  transaction granularity. The ordering effects that make an address map matter
  are exactly the effects that do not appear.
- No channel structure, no pseudo-channels, no address-to-channel map. The
  figure previously drew a sixteen-lane channel sweep on its own free-running
  cycle; that mechanism now lives only in the Note's FIG. 02, where it is a
  static mapping example with an explicit toy policy, and where the plate says
  in as many words that it is not service order.
- No cache residency, no reuse across passes, no write buffering or
  write-combining. Payloads, where `attachLayerPayloads` attaches them, are
  nominal element counts times a format width — not a DRAM transaction trace.

**Interconnect**

- No arbitration, no virtual channels, no credit-based flow control, no
  congestion, no deadlock avoidance, no port or bandwidth limits, no FIFO
  depth, and no flit/packet distinction — a parcel here is one transfer and
  nothing more. View B is a dependency-valid narrative, not a cycle-accurate
  NoC simulation, and says so on the plate.
- No claim that a particular mesh or commercial accelerator routes this way,
  and no claim that native multicast hardware exists or is required. Source
  replication, routed replication and software reduction all have different
  costs, and none of them is modelled.
- No scratchpad hierarchy between memory and the array, no double buffering,
  no intra-tile datapath, no systolic skew, no pipeline fill or drain.
  Accumulation width, spill and writeback are not shown.

**Workload**

- **Batch of one.** Batching is the knob that changes the conclusion, and the
  figure assumes it away.
- **One layer of one decode step**, titled as such. Not one decode step, not
  the whole forward pass, and no prefill.
- No grouped-query or multi-query grouping diagram; the ledger's `nKV` is a
  symbol, and how heads are grouped is not drawn.
- No KV quantisation, no paged attention, no block granularity, no
  fragmentation, no eviction, no prefix sharing, no sliding window.
- Dense model only; in a mixture of experts the per-token active parameter
  count is a fraction of the total and the weight term stops being constant.
- No speculative decoding, no tensor, pipeline or sequence parallelism, no
  inter-device collectives.
- Norm scale vectors are parameters but not large matrices; they are recorded
  in the ledger as resident and are not drawn as traffic. On-chip activation
  movement is not drawn in View A either, and its absence is not evidence that
  it is negligible.

---

## References

1. Meta, Llama reference implementation, `llama/model.py` —
   `Attention.forward`, `FeedForward`, `TransformerBlock.forward`.
   <https://github.com/meta-llama/llama/blob/main/llama/model.py>
2. Z. Yuan et al., "LLM Inference Unveiled: Survey and Roofline Model
   Insights." Table 1's per-operator decode decomposition.
   <https://arxiv.org/abs/2402.16363>
3. R. Pope et al., "Efficiently Scaling Transformer Inference." §2, §2.1.
   <https://arxiv.org/abs/2211.05102>
4. S. Dave et al., "Hardware Acceleration of Sparse and Irregular Tensor
   Computations of ML Models." §VIII-A, §VIII-B-3.
   <https://arxiv.org/abs/2007.00864>
5. F. Muñoz-Martínez et al., "Flexagon." §3.1.
   <https://arxiv.org/abs/2301.10852>
6. A. C. Yüzügüler et al., "Scale-out Systolic Arrays." TACO,
   DOI 10.1145/3572917; preprint <https://arxiv.org/abs/2203.11540>
7. N. Jouppi et al., "In-Datacenter Performance Analysis of a Tensor
   Processing Unit." §2, Fig. 4. <https://arxiv.org/abs/1704.04760>

### Claims withdrawn in this rebuild

These were in the previous version of this document, attached to parts of the
figure that no longer exist. They are listed rather than deleted so the change
is auditable.

- **"Every operator of the decode stage is memory-bound," encoded as two
  occupancy bars** (four channel bars near the top of their range, one `TILES`
  bar near the bottom). The cited statement is about arithmetic intensity
  against a memory bound; the bars read as measured utilization of a channel
  and of the processing elements, which no source supported and this figure
  never measured. Both bars are gone. The intensity argument is made in the
  Note, in bytes and FLOP, where it can be checked.
- **The A6000 and H100 ridge-point framing** (≈202 and ≈295 FLOP/byte). Correct
  arithmetic, but it described a roofline the figure did not draw, and mixing
  a GDDR6 part into an HBM discussion invited exactly the conflation the Note
  now separates. The roofline discussion belongs to the Note.
- **The HBM3 pseudo-channel sweep** and the claim that a weight tensor is
  interleaved fine-grained across all channels. The sweep ran on its own 4.5 s
  cycle, independent of any operator, so it implied channels busy during
  RMSNorm and RoPE. It is gone from the figure; the structure and the address
  map survive as a static example in the Note.
- **"The KV cache grows a page at a time."** Pages are not modelled anywhere,
  and the statement contradicted the Note's own exclusion of paged attention.
  The readout now counts valid positions.
- **"2, then 4, then 6 KV-read flits across the three steps."** Parcel count
  was standing in for payload growth on a figure with no block identities. The
  count of valid positions carries that now, and the growth argument is the
  Note's.
- **KV described as fragmented per head, weights as contiguous.** Layout is a
  placement choice, not a property of the tensor's role; the figure asserts no
  physical layout at all.
- **"Prefill is compute-bound"** as an unqualified statement. It depends on
  sequence length, shape and implementation.
