/**
 * Pure, dependency-free byte and FLOP accounting for one decode step.
 *
 * Ported from the review package's `reference/traffic-model.mjs`. Every
 * numeric statement in `src/content/notes/decode-step-as-traffic.mdx` and
 * every digit drawn by the plates in `src/components/plates/` comes from
 * this module, so that the prose, the figures and the tests cannot drift
 * apart.
 *
 * This is a nominal payload model: tensor element counts times a format
 * width, each selected element counted once. It is NOT a DRAM transaction
 * trace, a simulator, or a measurement. No padding, ECC, quantisation
 * metadata, cache residency, reread or transaction granularity is modelled.
 */

export interface ModelConfig {
  /** Layers, assumed uniform. */
  L: number;
  /** Hidden width; must equal nQ * dH. */
  d: number;
  /** Query heads. */
  nQ: number;
  /** Key/value heads; nQ must be an integer multiple of nKV. */
  nKV: number;
  /** Head dimension. */
  dH: number;
  /** Gated MLP intermediate width. */
  dFF: number;
  /** Vocabulary size. */
  vocab: number;
  /** Nominal bytes per stored weight element. */
  bW: number;
  /** Nominal bytes per stored KV element. */
  bKV: number;
  /** Nominal bytes per activation element. */
  bA: number;
}

function positive(name: string, value: unknown, integer = false, allowZero = false): void {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (allowZero ? value < 0 : value <= 0) ||
    (integer && !Number.isSafeInteger(value))
  ) {
    throw new RangeError(`${name}: invalid value ${value}`);
  }
}

export function checkModel(m: ModelConfig): void {
  for (const k of ['L', 'd', 'nQ', 'nKV', 'dH', 'dFF', 'vocab'] as const) positive(k, m[k], true);
  for (const k of ['bW', 'bKV', 'bA'] as const) positive(k, m[k]);
  if (m.d !== m.nQ * m.dH) throw new RangeError('d must equal nQ*dH');
  if (m.nKV > m.nQ || m.nQ % m.nKV !== 0) throw new RangeError('Invalid GQA grouping');
}

/**
 * The worked example throughout the Note: the Llama-2-7B shape the roofline
 * survey tabulates. Two bytes per weight, KV and activation element.
 */
export const EXAMPLE: Readonly<ModelConfig> = Object.freeze({
  L: 32,
  d: 4096,
  nQ: 32,
  nKV: 32,
  dH: 128,
  dFF: 11008,
  vocab: 32000,
  bW: 2,
  bKV: 2,
  bA: 2,
});

export interface TrafficCounts {
  /** Matrix elements in one layer's dense linear operations. */
  perLayerMatrixElements: number;
  /** Matrix elements executed by one full one-token pass, LM head included. */
  pMat: number;
  /** KV bytes per valid position, across all layers: 2*L*nKV*dH*bKV. */
  cKV: number;
  weightPayload: number;
  kvUniquePayload: number;
  kvAppendPayload: number;
  kvOldColdReadPayload: number;
  attentionMatmulFlops: number;
  weightOnlyIntensity: number;
  attentionKVOnlyIntensity: number;
  /** Formal payload-equality point. Not a latency crossover, and not
   *  guaranteed to lie inside a runnable context or memory budget. */
  formalCrossoverT: number;
}

/**
 * @param T Valid KV positions visible to the current attention, including
 *          the position just appended.
 */
export function traffic(m: ModelConfig, T: number): TrafficCounts {
  checkModel(m);
  positive('T', T, true);
  const perLayerMatrixElements = 2 * m.d * m.d + 2 * m.d * m.nKV * m.dH + 3 * m.d * m.dFF;
  const pMat = m.L * perLayerMatrixElements + m.d * m.vocab;
  const cKV = 2 * m.L * m.nKV * m.dH * m.bKV;
  const result: TrafficCounts = {
    perLayerMatrixElements,
    pMat,
    cKV,
    weightPayload: pMat * m.bW,
    kvUniquePayload: cKV * T,
    kvAppendPayload: cKV,
    kvOldColdReadPayload: cKV * (T - 1),
    attentionMatmulFlops: 4 * m.L * m.nQ * T * m.dH,
    weightOnlyIntensity: 2 / m.bW,
    attentionKVOnlyIntensity: (2 * (m.nQ / m.nKV)) / m.bKV,
    formalCrossoverT: (pMat * m.bW) / cKV,
  };
  if (Object.values(result).some((x) => !Number.isFinite(x) || Math.abs(x) > Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Calculation exceeds safe numeric range');
  }
  return result;
}

/**
 * Cumulative unique KV payload over D passes that follow a prefill of T0
 * positions: C * [D*T0 + D*(D+1)/2].
 *
 * @param T0 Valid positions per layer after prefill.
 * @param D  ONE-TOKEN FORWARD PASSES after prefill, not necessarily the
 *           number of sampled output tokens.
 */
export function cumulativeKV(m: ModelConfig, T0: number, D: number): number {
  checkModel(m);
  positive('T0', T0, true, true);
  positive('D', D, true, true);
  const c = 2 * m.L * m.nKV * m.dH * m.bKV;
  const result = c * (D * T0 + (D * (D + 1)) / 2);
  if (!Number.isSafeInteger(result)) throw new RangeError('Payload is not a safe integer');
  return result;
}

/**
 * Toy PHYSICAL address-to-channel policy used by FIG. 02.
 *
 * G is an illustrative chunk, NOT a JEDEC burst or a named device's line
 * size. Address order is not the controller's service order.
 */
export function channelForAddress(address: number, G = 256, channels = 16): number {
  positive('address', address, true, true);
  positive('G', G, true);
  positive('channels', channels, true);
  return Math.floor(address / G) % channels;
}

export interface CrossCheck {
  qFlops: number;
  qWeight: number;
  qInputOutput: number;
  qFullIO: number;
  qFullIntensity: number;
  qkFlops: number;
  keys: number;
  query: number;
  scores: number;
  qkQueryOnlyIntensity: number;
  qkFullIO: number;
  qkFullIntensity: number;
  residualFlops: number;
  residualStandaloneIO: number;
  residualStandaloneIntensity: number;
  gateFlops: number;
  gateWeight: number;
  prefillQFlops: number;
  prefillQFullIO: number;
  prefillQIntensity: number;
}

/**
 * Per-operator numbers quoted in the Note's arithmetic example. A multiply-add
 * counts as two FLOP; a standalone operator is charged its full I/O at one
 * stated memory boundary — input reads and output writes.
 */
export function numericalCrossCheck(m: ModelConfig = EXAMPLE, T = 2048): CrossCheck {
  checkModel(m);
  positive('T', T, true);
  const qFlops = 2 * m.d * m.d;
  const qWeight = m.d * m.d * m.bW;
  const qInputOutput = 2 * m.d * m.bA;
  const qkFlops = 2 * m.nQ * T * m.dH;
  const keys = T * m.nKV * m.dH * m.bKV;
  const query = m.nQ * m.dH * m.bA;
  const scores = m.nQ * T * m.bA;
  return {
    qFlops,
    qWeight,
    qInputOutput,
    qFullIO: qWeight + qInputOutput,
    qFullIntensity: qFlops / (qWeight + qInputOutput),
    qkFlops,
    keys,
    query,
    scores,
    qkQueryOnlyIntensity: qkFlops / (keys + query),
    qkFullIO: keys + query + scores,
    qkFullIntensity: qkFlops / (keys + query + scores),
    residualFlops: m.d,
    residualStandaloneIO: 3 * m.d * m.bA,
    residualStandaloneIntensity: 1 / (3 * m.bA),
    gateFlops: 2 * m.d * m.dFF,
    gateWeight: m.d * m.dFF * m.bW,
    prefillQFlops: 2 * T * m.d * m.d,
    prefillQFullIO: qWeight + 2 * T * m.d * m.bA,
    prefillQIntensity: (2 * T * m.d * m.d) / (qWeight + 2 * T * m.d * m.bA),
  };
}

export interface Range {
  start: number;
  end: number;
}

export function partitions(n: number, parts: number): Range[] {
  positive('n', n, true);
  positive('parts', parts, true);
  if (parts > n) throw new RangeError('Empty partitions not supported');
  return Array.from({ length: parts }, (_, i) => ({
    start: Math.floor((i * n) / parts),
    end: Math.floor(((i + 1) * n) / parts),
  }));
}

export interface MatvecBlock {
  r: number;
  c: number;
  owner: string;
  inputRange: Range;
  outputRange: Range;
  partial: number[];
}

export interface BlockedMatvec {
  /** Row partitions of the input/reduction index K. */
  I: Range[];
  /** Column partitions of the output index M. */
  J: Range[];
  blocks: MatvecBlock[];
  y: number[];
  direct: number[];
}

/**
 * Block ownership for FIG. 03: Tile(r,c) owns W[J_c, I_r]. Rows partition the
 * input/reduction index K, columns partition the output index M, and every
 * element of W has exactly one owner. Returned `y` is the blocked result and
 * `direct` the unblocked one; they must agree.
 */
export function blockedMatvec(W: number[][], x: number[], R = 2, C = 3): BlockedMatvec {
  if (
    !Array.isArray(W) ||
    !W.length ||
    !Array.isArray(x) ||
    !x.length ||
    x.some((v) => typeof v !== 'number' || !Number.isFinite(v)) ||
    W.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== x.length ||
        row.some((v) => typeof v !== 'number' || !Number.isFinite(v)),
    )
  ) {
    throw new TypeError('Expected finite rectangular W[M,K] and x[K]');
  }
  const I = partitions(x.length, R);
  const J = partitions(W.length, C);
  const blocks: MatvecBlock[] = [];
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const ir = I[r];
      const jc = J[c];
      const partial = W.slice(jc.start, jc.end).map((row) =>
        row.slice(ir.start, ir.end).reduce((s, w, i) => s + w * x[ir.start + i], 0),
      );
      blocks.push({ r, c, owner: `T${r}${c}`, inputRange: ir, outputRange: jc, partial });
    }
  }
  const y = Array<number>(W.length).fill(0);
  for (const b of blocks) {
    const jc = J[b.c];
    b.partial.forEach((v, i) => {
      y[jc.start + i] += v;
    });
  }
  const direct = W.map((row) => row.reduce((s, w, i) => s + w * x[i], 0));
  return { I, J, blocks, y, direct };
}
