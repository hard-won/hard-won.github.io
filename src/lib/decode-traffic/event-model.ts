/**
 * Deterministic NARRATIVE event ledgers for one decoder layer and for one
 * blocked projection.
 *
 * Ported from the review package's `reference/event-model.mjs`. Milliseconds
 * are display time, not silicon timing. The schedule is a conservative
 * serial, cache-first illustration: its serializations are teaching choices,
 * not claims that an implementation must order the work this way.
 *
 * The plates in `src/components/plates/` read their stage list, tensor
 * identities, block ownership and reduction structure from here, so the
 * drawings and the validated ledger cannot disagree.
 */

import type { ModelConfig } from './traffic-model.ts';

/** Semantic stages of one layer, in document order. Not ten GPU kernels. */
export const STAGES: readonly (readonly [string, string])[] = Object.freeze([
  ['norm1', 'RMSNorm'],
  ['qkv', 'Q/K/V projections'],
  ['rope', 'RoPE (Q,K)'],
  ['append', 'KV append'],
  ['attention', 'Attention'],
  ['o', 'O projection'],
  ['res1', 'Residual add'],
  ['norm2', 'RMSNorm'],
  ['mlp', 'MLP'],
  ['res2', 'Residual add'],
  ['unshown', 'Unshown model work'],
] as const);

export type Edge = [string, string];

/** The only hops a layer-scene packet may take. Routes are validated. */
export const LAYER_EDGES: readonly Edge[] = Object.freeze([
  ['COMPUTE', 'BUF'],
  ['BUF', 'COMPUTE'],
  ['BUF', 'MC'],
  ['MC', 'BUF'],
  ['MC', 'HBM'],
  ['HBM', 'MC'],
] as Edge[]);

export interface LedgerEvent {
  id: string;
  stage: string;
  kind: string;
  startMs: number;
  endMs: number;
  deps: string[];
  /** Tensor identity, where the event moves one. */
  tensor?: string;
  /** Node sequence; every consecutive pair must be a drawn edge. */
  route?: string[];
  coefficients?: string;
  targets?: string[];
  notTargets?: string[];
  position?: number;
  validBefore?: number;
  validAfter?: number;
  includesCurrent?: boolean;
  skip?: string;
  label?: string;
  owner?: string;
  destinations?: string[];
  retainedCopy?: boolean;
  output?: string;
  contributors?: number[];
  column?: number;
  /** Nominal payload, attached by attachLayerPayloads. */
  payloadBytes?: number;
  /** Only events flagged here are summed; a read return is the same
   *  transfer as its service, not a second memory read. */
  isAccountingEvent?: boolean;
  accountingScope?: string;
}

export interface StageWindow {
  id: string;
  label: string;
  startMs: number;
  endMs: number;
}

export interface LayerScene {
  scene: 'layer';
  T0: number;
  stepIndex: number;
  events: LedgerEvent[];
  stageWindows: StageWindow[];
  edges: readonly Edge[];
  durationMs: number;
  countScope: string;
}

export interface ProjectionScene {
  scene: 'projection';
  R: number;
  C: number;
  events: LedgerEvent[];
  edges: Edge[];
  durationMs: number;
  stageWindows?: StageWindow[];
}

export type Scene = LayerScene | ProjectionScene;

type EventMeta = Omit<LedgerEvent, 'id' | 'stage' | 'kind' | 'startMs' | 'endMs' | 'deps'>;

class Ledger {
  events: LedgerEvent[] = [];
  map: Map<string, LedgerEvent> = new Map();

  add(id: string, stage: string, kind: string, durationMs: number, deps: string[] = [], meta: EventMeta = {}): string {
    if (this.map.has(id)) throw new Error(`Duplicate event ${id}`);
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Invalid duration');
    for (const d of deps) if (!this.map.has(d)) throw new Error(`Missing dependency ${d}`);
    const startMs = Math.max(0, ...deps.map((d) => (this.map.get(d) as LedgerEvent).endMs));
    const e: LedgerEvent = { id, stage, kind, startMs, endMs: startMs + durationMs, deps: [...deps], ...meta };
    this.events.push(e);
    this.map.set(id, e);
    return id;
  }
}

export function makeLayerLedger({ T0 = 2048, stepIndex = 0 }: { T0?: number; stepIndex?: number } = {}): LayerScene {
  if (!Number.isSafeInteger(T0) || T0 < 1 || !Number.isSafeInteger(stepIndex) || stepIndex < 0)
    throw new RangeError('Prefilled scene requires T0>=1 and stepIndex>=0');
  const l = new Ledger();
  function read(prefix: string, stage: string, tensor: string, dep: string): string {
    const req = l.add(`${prefix}.request`, stage, 'request', 120, [dep], { tensor, route: ['BUF', 'MC', 'HBM'] });
    const svc = l.add(`${prefix}.service`, stage, 'memory-read', 220, [req], { tensor });
    return l.add(`${prefix}.return`, stage, 'read-return', 260, [svc], { tensor, route: ['HBM', 'MC', 'BUF'] });
  }
  function linear(prefix: string, stage: string, tensor: string, dep: string): string {
    const ret = read(prefix, stage, tensor, dep);
    return l.add(`${prefix}.compute`, stage, 'linear-compute', 400, [ret, dep], { tensor });
  }
  const norm = l.add('norm1.compute', 'norm1', 'norm', 650, [], {
    coefficients: 'resident; omitted from large-matrix traffic',
  });
  // Q/K/V are logically parallel branches. This narrative deliberately schedules them serially.
  const q = linear('q', 'qkv', 'Wq', norm);
  const k = linear('k', 'qkv', 'Wk', q);
  const v = linear('v', 'qkv', 'Wv', k);
  const rope = l.add('rope.compute', 'rope', 'rope', 650, [q, k, v], { targets: ['q', 'k'], notTargets: ['v'] });
  const update = l.add('kv.update', 'append', 'logical-kv-update', 300, [rope, v], { position: T0 + stepIndex });
  const wr = l.add('kv.write', 'append', 'write-transfer', 500, [update], {
    tensor: 'K_new,V_new',
    route: ['COMPUTE', 'BUF', 'MC', 'HBM'],
  });
  // Waiting for memory visibility is a CHOSEN serial illustration, not a universal HBM completion rule.
  const visible = l.add('kv.visible', 'append', 'kv-visible', 150, [wr], {
    validBefore: T0 + stepIndex,
    validAfter: T0 + stepIndex + 1,
  });
  const kr = read('attn.k', 'attention', 'K[0:T]', visible);
  const qk = l.add('attn.qk', 'attention', 'qk', 500, [kr, rope], { includesCurrent: true });
  const soft = l.add('attn.softmax', 'attention', 'softmax', 650, [qk]);
  const vr = read('attn.v', 'attention', 'V[0:T]', soft);
  const pv = l.add('attn.pv', 'attention', 'pv', 500, [vr, soft], { includesCurrent: true });
  const o = linear('o', 'o', 'Wo', pv);
  const res = l.add('res1.compute', 'res1', 'residual', 600, [o], { skip: 'layer_input' });
  const n2 = l.add('norm2.compute', 'norm2', 'norm', 650, [res], { coefficients: 'resident' });
  const gate = linear('gate', 'mlp', 'Wgate', n2);
  const up = linear('up', 'mlp', 'Wup', gate);
  const glu = l.add('mlp.gate', 'mlp', 'silu-multiply', 650, [gate, up]);
  const down = linear('down', 'mlp', 'Wdown', glu);
  const res2 = l.add('res2.compute', 'res2', 'residual', 600, [down, res], { skip: 'after_attention_residual' });
  l.add('model.unshown', 'unshown', 'unshown-work', 1600, [res2], {
    label: 'Remaining/other layers, LM head and sampling omitted',
  });
  const events = l.events;
  const stageWindows: StageWindow[] = STAGES.map(([id, label]) => {
    const e = events.filter((x) => x.stage === id);
    return {
      id,
      label,
      startMs: Math.min(...e.map((x) => x.startMs)),
      endMs: Math.max(...e.map((x) => x.endMs)),
    };
  });
  const scene: LayerScene = {
    scene: 'layer',
    T0,
    stepIndex,
    events,
    stageWindows,
    edges: LAYER_EDGES,
    durationMs: Math.max(...events.map((e) => e.endMs)),
    countScope: 'one chosen layer',
  };
  validateLayerSemantics(scene);
  return scene;
}

export interface SceneState {
  tMs: number;
  phase: string | null;
  complete: string[];
  active: LedgerEvent[];
  /** Valid KV positions in this layer, or null outside a layer scene. */
  kvValid: number | null;
}

export function stateAt(scene: Scene, tMs: number): SceneState {
  if (!Number.isFinite(tMs)) throw new RangeError('Time must be finite');
  const t = Math.max(0, Math.min(tMs, scene.durationMs));
  const complete = scene.events.filter((e) => e.endMs <= t).map((e) => e.id);
  const active = scene.events.filter((e) => e.startMs <= t && t < e.endMs);
  const phase = scene.stageWindows?.find((s) => s.startMs <= t && t < s.endMs)?.id ?? null;
  const validEvent = scene.events.find((e) => e.kind === 'kv-visible');
  if (scene.scene === 'layer' && !validEvent) throw new Error('Layer scene is missing its kv-visible event');
  return {
    tMs: t,
    phase,
    complete,
    active,
    kvValid:
      scene.scene === 'layer' && validEvent ? scene.T0 + scene.stepIndex + (validEvent.endMs <= t ? 1 : 0) : null,
  };
}

export function validateLedger(scene: Scene): boolean {
  const byId = new Map(scene.events.map((e) => [e.id, e]));
  if (byId.size !== scene.events.length) throw new Error('Duplicate IDs');
  const edges = new Set(scene.edges.map(([a, b]) => `${a}->${b}`));
  for (const e of scene.events) {
    if (!Number.isFinite(e.startMs) || !Number.isFinite(e.endMs) || e.startMs < 0 || e.endMs <= e.startMs)
      throw new Error(`Invalid interval ${e.id}`);
    for (const dep of e.deps) {
      const producer = byId.get(dep);
      if (!producer || producer.endMs > e.startMs) throw new Error(`Causality violation ${dep}->${e.id}`);
    }
    for (let i = 1; i < (e.route?.length ?? 0); i++) {
      const route = e.route as string[];
      if (!edges.has(`${route[i - 1]}->${route[i]}`)) throw new Error(`Nonexistent edge on ${e.id}`);
    }
  }
  return true;
}

/** Distinct scene: one block GEMV; no attention/KV claims are made by this network. */
export function makeProjectionLedger(R = 2, C = 3): ProjectionScene {
  if (!Number.isSafeInteger(R) || !Number.isSafeInteger(C) || R < 1 || C < 1 || R > 8 || C > 8)
    throw new RangeError('Supported demonstration dimensions are 1..8');
  const l = new Ledger();
  const edges: Edge[] = [];
  const weights: Record<string, string> = {};
  const acts: Record<string, string> = {};
  const local: Record<string, string> = {};
  const start = l.add('projection.start', 'weights', 'scene-start', 400);
  let tail = start;
  for (let c = 0; c < C; c++) {
    edges.push(['WBUF', `WROOT${c}`], [`WROOT${c}`, `T0${c}`]);
    for (let r = 1; r < R; r++) edges.push([`T${r - 1}${c}`, `T${r}${c}`]);
    for (let r = 0; r < R; r++) {
      const route = ['WBUF', `WROOT${c}`, ...Array.from({ length: r + 1 }, (_, j) => `T${j}${c}`)];
      tail = l.add(`weight.${r}.${c}`, 'weights', 'weight-delivery', 300, [tail], {
        tensor: `W[J${c},I${r}]`,
        owner: `T${r}${c}`,
        destinations: [`T${r}${c}`],
        route,
      });
      weights[`${r}.${c}`] = tail;
    }
  }
  for (let r = 0; r < R; r++) {
    edges.push([`A${r}`, `T${r}0`]);
    let prev = tail;
    for (let c = 0; c < C; c++) {
      if (c > 0) edges.push([`T${r}${c - 1}`, `T${r}${c}`]);
      const src = c === 0 ? `A${r}` : `T${r}${c - 1}`;
      prev = l.add(`activation.${r}.${c}`, 'activation', 'activation-delivery', 350, [prev], {
        tensor: `x[I${r}]`,
        owner: `T${r}${c}`,
        route: [src, `T${r}${c}`],
        retainedCopy: true,
      });
      acts[`${r}.${c}`] = prev;
    }
  }
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++)
      local[`${r}.${c}`] = l.add(
        `local.${r}.${c}`,
        'compute',
        'local-partial',
        500,
        [weights[`${r}.${c}`], acts[`${r}.${c}`]],
        { owner: `T${r}${c}`, output: `z[${r},${c}]` },
      );
  for (let c = 0; c < C; c++) {
    let sum = local[`0.${c}`];
    for (let r = 1; r < R; r++) {
      const hop = l.add(`psum.${r}.${c}`, 'reduce', 'partial-transfer', 350, [sum], {
        route: [`T${r - 1}${c}`, `T${r}${c}`],
        contributors: Array.from({ length: r }, (_, i) => i),
        column: c,
      });
      sum = l.add(`sum.${r}.${c}`, 'reduce', 'accumulate', 400, [hop, local[`${r}.${c}`]], {
        contributors: Array.from({ length: r + 1 }, (_, i) => i),
        column: c,
      });
    }
    edges.push([`T${R - 1}${c}`, `ACC${c}`]);
    l.add(`output.${c}`, 'output', 'output-delivery', 450, [sum], {
      route: [`T${R - 1}${c}`, `ACC${c}`],
      contributors: Array.from({ length: R }, (_, i) => i),
      column: c,
    });
  }
  const scene: ProjectionScene = {
    scene: 'projection',
    R,
    C,
    events: l.events,
    edges,
    durationMs: Math.max(...l.events.map((e) => e.endMs)) + 800,
  };
  validateProjectionSemantics(scene);
  return scene;
}

/**
 * Annotate ONE-LAYER nominal payloads. Count only isAccountingEvent=true;
 * service and return are two visual events for the same transfer, not two
 * HBM reads. This is the chosen cold/read-once cache-first baseline, not
 * measured transactions.
 */
export function attachLayerPayloads(scene: LayerScene, m: ModelConfig): LayerScene {
  if (scene.scene !== 'layer') throw new TypeError('Expected a layer scene');
  for (const k of ['d', 'nKV', 'dH', 'dFF', 'bW', 'bKV'] as const)
    if (!Number.isFinite(m[k]) || m[k] <= 0) throw new RangeError(`Invalid ${k}`);
  const T = scene.T0 + scene.stepIndex + 1;
  const weights: Record<string, number> = {
    Wq: m.d * m.d,
    Wk: m.d * m.nKV * m.dH,
    Wv: m.d * m.nKV * m.dH,
    Wo: m.d * m.d,
    Wgate: m.d * m.dFF,
    Wup: m.d * m.dFF,
    Wdown: m.d * m.dFF,
  };
  const nominal = (tensor: string | undefined): number =>
    tensor !== undefined && tensor in weights
      ? (weights[tensor] as number) * m.bW
      : tensor === 'K[0:T]' || tensor === 'V[0:T]'
        ? T * m.nKV * m.dH * m.bKV
        : tensor === 'K_new,V_new'
          ? 2 * m.nKV * m.dH * m.bKV
          : 0;
  return {
    ...scene,
    events: scene.events.map((e) => ({
      ...e,
      payloadBytes: e.kind === 'request' ? 0 : nominal(e.tensor),
      isAccountingEvent: e.kind === 'memory-read' || e.kind === 'write-transfer',
      accountingScope: 'one-layer nominal payload; not physical transactions',
    })),
  };
}

/** Independent semantic checks: a valid declared DAG is not enough if an input was omitted. */
function semanticHelpers(scene: Scene) {
  validateLedger(scene);
  const byId = new Map(scene.events.map((e) => [e.id, e]));
  const get = (id: string): LedgerEvent => {
    const e = byId.get(id);
    if (!e) throw new Error(`Missing semantic event ${id}`);
    return e;
  };
  function dependsOn(id: string, producer: string, seen = new Set<string>()): boolean {
    if (seen.has(id)) return false;
    seen.add(id);
    return get(id).deps.some((d) => d === producer || dependsOn(d, producer, seen));
  }
  function needs(id: string, producer: string): void {
    const e = get(id);
    const p = get(producer);
    if (!dependsOn(id, producer) || e.startMs < p.endMs)
      throw new Error(`Missing semantic dependency ${producer}->${id}`);
  }
  function same(actual: unknown, expected: unknown, label: string): void {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Semantic mismatch: ${label}`);
  }
  return { get, needs, same };
}

export function validateLayerSemantics(scene: Scene): boolean {
  if (scene.scene !== 'layer') throw new TypeError('Expected layer scene');
  const { get, needs, same } = semanticHelpers(scene);
  const inputs: Record<string, string> = {
    q: 'norm1.compute',
    k: 'norm1.compute',
    v: 'norm1.compute',
    o: 'attn.pv',
    gate: 'norm2.compute',
    up: 'norm2.compute',
    down: 'mlp.gate',
  };
  for (const [prefix, input] of Object.entries(inputs)) {
    needs(`${prefix}.service`, `${prefix}.request`);
    needs(`${prefix}.return`, `${prefix}.service`);
    needs(`${prefix}.compute`, `${prefix}.return`);
    needs(`${prefix}.compute`, input);
  }
  needs('rope.compute', 'q.compute');
  needs('rope.compute', 'k.compute');
  same(get('rope.compute').targets, ['q', 'k'], 'RoPE targets');
  same(get('rope.compute').notTargets, ['v'], 'V bypass');
  needs('kv.update', 'rope.compute');
  needs('kv.update', 'v.compute');
  needs('kv.write', 'kv.update');
  needs('kv.visible', 'kv.write');
  same(get('kv.visible').validBefore, scene.T0 + scene.stepIndex, 'KV before');
  same(get('kv.visible').validAfter, scene.T0 + scene.stepIndex + 1, 'KV increment');
  for (const prefix of ['attn.k', 'attn.v']) {
    needs(`${prefix}.service`, `${prefix}.request`);
    needs(`${prefix}.return`, `${prefix}.service`);
    needs(`${prefix}.request`, 'kv.visible');
  }
  needs('attn.qk', 'attn.k.return');
  needs('attn.qk', 'rope.compute');
  needs('attn.softmax', 'attn.qk');
  needs('attn.pv', 'attn.v.return');
  needs('attn.pv', 'attn.softmax');
  needs('res1.compute', 'o.compute');
  same(get('res1.compute').skip, 'layer_input', 'first residual');
  needs('norm2.compute', 'res1.compute');
  needs('mlp.gate', 'gate.compute');
  needs('mlp.gate', 'up.compute');
  needs('res2.compute', 'down.compute');
  needs('res2.compute', 'res1.compute');
  same(get('res2.compute').skip, 'after_attention_residual', 'second residual');
  needs('model.unshown', 'res2.compute');
  return true;
}

export function validateProjectionSemantics(scene: Scene): boolean {
  if (scene.scene !== 'projection') throw new TypeError('Expected projection scene');
  const { get, needs, same } = semanticHelpers(scene);
  const { R, C } = scene;
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const w = get(`weight.${r}.${c}`);
      const a = get(`activation.${r}.${c}`);
      const tile = `T${r}${c}`;
      same(w.owner, tile, 'weight owner');
      same(w.destinations, [tile], 'weight destination');
      same(w.tensor, `W[J${c},I${r}]`, 'weight identity');
      same(w.route?.at(-1), tile, 'weight arrival');
      same(a.tensor, `x[I${r}]`, 'activation identity');
      same(a.route?.at(-1), tile, 'activation arrival');
      if (c > 0) needs(a.id, `activation.${r}.${c - 1}`);
      needs(`local.${r}.${c}`, w.id);
      needs(`local.${r}.${c}`, a.id);
      same(get(`local.${r}.${c}`).owner, tile, 'local-product owner');
    }
  for (let c = 0; c < C; c++) {
    let previous = `local.0.${c}`;
    for (let r = 1; r < R; r++) {
      const p = get(`psum.${r}.${c}`);
      const s = get(`sum.${r}.${c}`);
      needs(p.id, previous);
      needs(s.id, p.id);
      needs(s.id, `local.${r}.${c}`);
      same(p.column, c, 'partial column');
      same(s.column, c, 'sum column');
      same(
        p.contributors,
        Array.from({ length: r }, (_, i) => i),
        'incoming contributors',
      );
      same(
        s.contributors,
        Array.from({ length: r + 1 }, (_, i) => i),
        'accumulated contributors',
      );
      previous = s.id;
    }
    const out = get(`output.${c}`);
    needs(out.id, previous);
    same(out.column, c, 'output column');
    same(
      out.contributors,
      Array.from({ length: R }, (_, i) => i),
      'output contributors',
    );
    same(out.route?.at(-1), `ACC${c}`, 'output destination');
  }
  return true;
}
