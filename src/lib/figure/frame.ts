/**
 * The figure's single renderer contract:
 *
 *     ledger (src/lib/decode-traffic) -> sampleFrame(scene, tMs) -> drawn state
 *
 * Nothing in this module invents an event, a time or a dependency. Every
 * value it returns is read out of the validated ledger, and the only
 * independent variable is `tMs`. `DataflowFigure.astro` calls these
 * functions once at build time to emit the static frame, the browser
 * runtime calls the same functions on every animation tick, and
 * `tests/figure-frame.test.ts` calls them to sweep the whole timeline.
 * There is no second implementation of any of this anywhere.
 *
 * Pure: no DOM, no timers, no globals. Geometry is returned as numbers;
 * turning a number into an attribute is the caller's job.
 */

import { stateAt } from '../decode-traffic/event-model.ts';
import type { LayerScene, LedgerEvent, ProjectionScene } from '../decode-traffic/event-model.ts';

/* -------------------------------------------------------------------------
   Naming. A ledger event carries a kind and a tensor; a reader needs a
   phrase. These maps are presentation only: they rename what the ledger
   already says, and they never add an event or reorder one.
------------------------------------------------------------------------- */

/** What a linear compute over this weight matrix produces. */
const PRODUCES: Record<string, string> = {
  Wq: 'Q',
  Wk: 'K',
  Wv: 'V',
  Wo: 'ATTENTION OUTPUT',
  Wgate: 'GATE',
  Wup: 'UP',
  Wdown: 'MLP OUTPUT',
};

/** Residual skip sources, worded exactly as FIG. 01 words them. */
const SKIP: Record<string, string> = {
  layer_input: 'THE LAYER INPUT',
  after_attention_residual: 'THE POST-ATTN STATE',
};

/** Human node names for the four drawn endpoints of the layer view. */
export const NODE_NAME: Record<string, string> = {
  HBM: 'DEVICE MEMORY',
  MC: 'MEMORY CONTROLLER',
  BUF: 'LOCAL BUFFERS',
  COMPUTE: 'COMPUTE',
};

/** Event kinds that are arithmetic. Everything else is traffic or state. */
const COMPUTE_KINDS = new Set([
  'norm',
  'linear-compute',
  'rope',
  'logical-kv-update',
  'qk',
  'softmax',
  'pv',
  'silu-multiply',
  'residual',
  'unshown-work',
  'local-partial',
  'accumulate',
]);

export function isCompute(e: LedgerEvent): boolean {
  return COMPUTE_KINDS.has(e.kind);
}

/** A short phrase naming what this event is, built from the ledger's fields. */
export function describe(e: LedgerEvent): string {
  const t = e.tensor ?? '';
  switch (e.kind) {
    case 'request':
      return `REQUEST ${t}`;
    case 'memory-read':
      return `MEMORY SERVICE ${t}`;
    case 'read-return':
      return `READ RETURN ${t}`;
    case 'write-transfer':
      return `WRITE ${t}`;
    case 'kv-visible':
      return `KV VISIBLE THROUGH POSITION ${(e.validAfter ?? 1) - 1}`;
    case 'norm':
      return 'RMSNORM';
    case 'linear-compute':
      return `COMPUTE ${PRODUCES[t] ?? t} FROM ${t}`;
    case 'rope':
      return `ROPE ON ${(e.targets ?? []).join(' AND ').toUpperCase()}, NOT ${(e.notTargets ?? [])
        .join(',')
        .toUpperCase()}`;
    case 'logical-kv-update':
      return `APPEND K,V AT POSITION ${e.position}`;
    case 'qk':
      return 'SCORES = Q · Kt';
    case 'softmax':
      return 'SOFTMAX OVER THE SCORES';
    case 'pv':
      return 'ATTENTION OUTPUT = P · V';
    case 'silu-multiply':
      return 'SILU(GATE) x UP';
    case 'residual':
      return `RESIDUAL ADD OF ${SKIP[e.skip ?? ''] ?? 'THE SKIP SOURCE'}`;
    case 'unshown-work':
      return 'OTHER LAYERS, FINAL NORM, LM HEAD AND SAMPLING: NOT SHOWN';
    case 'scene-start':
      return 'ARRAY IDLE, NOTHING DELIVERED YET';
    case 'weight-delivery':
      return `WEIGHT BLOCK ${t} TO ${e.owner}`;
    case 'activation-delivery':
      return `ACTIVATION SLICE ${t} TO ${e.owner}`;
    case 'local-partial':
      return `${e.owner} COMPUTES ${e.output}`;
    case 'partial-transfer':
      return `PARTIAL SUM FROM ROW ${(e.contributors ?? []).join(',')} DOWN COLUMN ${e.column}`;
    case 'accumulate':
      return `ACCUMULATE ROWS ${(e.contributors ?? []).join(',')} IN COLUMN ${e.column}`;
    case 'output-delivery':
      return `OUTPUT SLICE y[J${e.column}] FROM ROWS ${(e.contributors ?? []).join(',')}`;
    default:
      return e.kind.toUpperCase();
  }
}

/** The short tag drawn beside a moving parcel. */
export function parcelLabel(e: LedgerEvent): string {
  if (e.kind === 'request') return `REQ ${e.tensor}`;
  if (e.kind === 'partial-transfer') return `PSUM ROWS ${(e.contributors ?? []).join(',')}`;
  if (e.kind === 'output-delivery') return `y[J${e.column}]`;
  return e.tensor ?? e.kind.toUpperCase();
}

/* -------------------------------------------------------------------------
   Interpolation. A parcel is only ever drawn between two nodes that the
   ledger lists as consecutive on its route, and the drawing lists as an
   edge. Time within the event is split evenly per hop. Position along a
   path is a picture of ordering, not of propagation speed.
------------------------------------------------------------------------- */

export interface Pt {
  x: number;
  y: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Which hop of `route` the event is on at `tMs`, and how far along it. */
export function hopAt(e: LedgerEvent, tMs: number): { from: string; to: string; f: number } {
  const route = e.route ?? [];
  if (route.length < 2) throw new RangeError(`${e.id} has no route to interpolate`);
  const p = clamp01((tMs - e.startMs) / (e.endMs - e.startMs));
  const hops = route.length - 1;
  const scaled = p * hops;
  const i = Math.min(Math.floor(scaled), hops - 1);
  return { from: route[i] as string, to: route[i + 1] as string, f: scaled - i };
}

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

/** Distance-parameterised point along a polyline. */
export function alongPolyline(points: Pt[], f: number): Pt {
  if (points.length === 1) return points[0] as Pt;
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Pt;
    const b = points[i] as Pt;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    seg.push(d);
    total += d;
  }
  if (total === 0) return points[0] as Pt;
  let want = clamp01(f) * total;
  for (let i = 0; i < seg.length; i++) {
    const d = seg[i] as number;
    if (want <= d || i === seg.length - 1) {
      const a = points[i] as Pt;
      const b = points[i + 1] as Pt;
      const local = d === 0 ? 0 : clamp01(want / d);
      return { x: lerp(a.x, b.x, local), y: lerp(a.y, b.y, local) };
    }
    want -= d;
  }
  return points[points.length - 1] as Pt;
}

/* =========================================================================
   VIEW A — layer traffic
   ========================================================================= */

/**
 * The four drawn endpoints, top to bottom. `LAYER_EDGES` in the model is
 * exactly the set of adjacent pairs of this list in both directions, which
 * is why a single vertical lane can carry every route the ledger declares.
 */
export const LANE: readonly string[] = ['HBM', 'MC', 'BUF', 'COMPUTE'];

/** Position of a node on the lane, as a percentage of the lane's height. */
export function lanePct(node: string): number {
  const i = LANE.indexOf(node);
  if (i < 0) throw new RangeError(`${node} is not on the drawn lane`);
  return ((i + 0.5) / LANE.length) * 100;
}

export interface LayerParcel {
  id: string;
  kind: string;
  label: string;
  tensor: string;
  /** Percent down the lane: 0 is the device-memory end. */
  pct: number;
  /** Toward device memory, or toward compute. */
  dir: 'up' | 'down';
  from: string;
  to: string;
}

export type BandState = 'idle' | 'transit' | 'active' | 'ready';

export interface Band {
  id: string;
  state: BandState;
  text: string;
}

export interface Row {
  k: string;
  v: string;
}

export interface LayerFrame {
  view: 'layer';
  tMs: number;
  durationMs: number;
  /** Ledger stage id currently being explained, or null past the end. */
  phase: string | null;
  /** Per stage: already shown, being shown, or still ahead. */
  stage: Record<string, 'done' | 'now' | 'next'>;
  parcels: LayerParcel[];
  bands: Band[];
  compute: { state: 'active' | 'waiting' | 'idle'; label: string; needs: string[] };
  kvBaseline: number;
  kvValid: number;
  kvPending: boolean;
  /** True while the ledger is in its unshown-work window. */
  replay: boolean;
  /** Qualitative operand demand of the current stage. Never a measurement. */
  demand: string;
  readout: Row[];
}

/** Events of one stage, in ledger order. */
function ofStage(scene: LayerScene, stage: string): LedgerEvent[] {
  return scene.events.filter((e) => e.stage === stage);
}

/**
 * Qualitative operand demand, read off the stage's own events: which class
 * of operand it pulls across the memory boundary. Not a utilization figure,
 * and deliberately not a number.
 */
export function stageDemand(scene: LayerScene, stage: string | null): string {
  if (stage === null) return 'NONE';
  const e = ofStage(scene, stage);
  const matrices = e.filter((x) => x.kind === 'memory-read' && (x.tensor ?? '').startsWith('W'));
  if (matrices.length)
    return `LARGE-MATRIX READ: ${matrices.map((x) => x.tensor).join(', ')} (QUALITATIVE, NOT MEASURED)`;
  if (e.some((x) => x.kind === 'memory-read'))
    return 'KV READ, T VISIBLE POSITIONS (QUALITATIVE, NOT MEASURED)';
  if (e.some((x) => x.kind === 'write-transfer'))
    return 'KV WRITE, ONE POSITION (QUALITATIVE, NOT MEASURED)';
  if (stage === 'unshown') return 'NOT SHOWN IN THIS VIEW';
  return 'NO LARGE OPERAND CROSSES THE MEMORY BOUNDARY IN THIS STAGE';
}

export function sampleLayer(scene: LayerScene, tMs: number): LayerFrame {
  const s = stateAt(scene, tMs);
  const done = new Set(s.complete);
  const activeIds = new Set(s.active.map((e) => e.id));
  const byId = new Map(scene.events.map((e) => [e.id, e]));

  const parcels: LayerParcel[] = s.active
    .filter((e) => (e.route ?? []).length > 1)
    .map((e) => {
      const { from, to, f } = hopAt(e, s.tMs);
      return {
        id: e.id,
        kind: e.kind,
        label: parcelLabel(e),
        tensor: e.tensor ?? '',
        pct: lerp(lanePct(from), lanePct(to), f),
        dir: LANE.indexOf(to) < LANE.indexOf(from) ? ('up' as const) : ('down' as const),
        from,
        to,
      };
    });

  // The next arithmetic the ledger has not finished, and what it still lacks.
  const pending = scene.events
    .filter((e) => isCompute(e) && !done.has(e.id))
    .sort((a, b) => a.startMs - b.startMs)[0];
  const activeCompute = s.active.find((e) => isCompute(e));
  const needs = pending ? pending.deps.filter((d) => !done.has(d)).map((d) => parcelLabel(byId.get(d) as LedgerEvent)) : [];

  const compute: LayerFrame['compute'] = activeCompute
    ? { state: 'active', label: describe(activeCompute), needs: [] }
    : pending
      ? { state: needs.length ? 'waiting' : 'idle', label: describe(pending), needs }
      : { state: 'idle', label: 'NOTHING LEFT IN THIS LAYER', needs: [] };

  // Operands that have landed in a buffer and whose consumer has not yet run.
  const held = scene.events
    .filter(
      (e) =>
        e.kind === 'read-return' &&
        done.has(e.id) &&
        scene.events.some((c) => c.deps.includes(e.id) && !done.has(c.id)),
    )
    .map((e) => e.tensor as string);

  const serving = s.active.find((e) => e.kind === 'memory-read');
  const bands: Band[] = [
    {
      id: 'HBM',
      state: serving ? 'active' : parcels.some((p) => p.from === 'HBM' || p.to === 'HBM') ? 'transit' : 'idle',
      text: serving ? `SERVICING ${serving.tensor}` : 'NO SERVICE IN PROGRESS',
    },
    {
      id: 'MC',
      state: parcels.length ? 'transit' : 'idle',
      text: parcels.length ? `FORWARDING ${parcels.map((p) => p.label).join(', ')}` : 'NO PARCEL IN FLIGHT',
    },
    {
      id: 'BUF',
      state: held.length ? 'ready' : parcels.some((p) => p.from === 'BUF' || p.to === 'BUF') ? 'transit' : 'idle',
      text: held.length ? `OPERAND READY: ${held.join(', ')}` : 'NO OPERAND HELD FOR A WAITING CONSUMER',
    },
    {
      id: 'COMPUTE',
      state: compute.state === 'active' ? 'active' : 'idle',
      text:
        compute.state === 'active'
          ? compute.label
          : compute.state === 'waiting'
            ? `WAITING FOR ${compute.needs.join(', ')}`
            : 'IDLE',
    },
  ];

  const stage: Record<string, 'done' | 'now' | 'next'> = {};
  for (const w of scene.stageWindows)
    stage[w.id] = w.endMs <= s.tMs ? 'done' : w.id === s.phase ? 'now' : 'next';

  const visible = scene.events.find((e) => e.kind === 'kv-visible') as LedgerEvent;
  const kvPending = activeIds.has('kv.write') || activeIds.has('kv.update') || activeIds.has('kv.visible');

  const frame: LayerFrame = {
    view: 'layer',
    tMs: s.tMs,
    durationMs: scene.durationMs,
    phase: s.phase,
    stage,
    parcels,
    bands,
    compute,
    kvBaseline: scene.T0 + scene.stepIndex,
    kvValid: s.kvValid ?? scene.T0,
    kvPending,
    replay: s.phase === 'unshown',
    demand: stageDemand(scene, s.phase),
    readout: [],
  };

  const stageLabel = scene.stageWindows.find((w) => w.id === s.phase)?.label ?? 'END OF THE DEPICTED LAYER';
  const inFlight = s.active.filter((e) => (e.route ?? []).length > 1);
  frame.readout = [
    { k: 'T', v: `${(s.tMs / 1000).toFixed(3)} s OF ${(scene.durationMs / 1000).toFixed(1)} s (ORDER, NOT LATENCY)` },
    { k: 'STAGE', v: stageLabel.toUpperCase() },
    {
      k: 'IN FLIGHT',
      v: inFlight.length
        ? inFlight
            .map((e) => {
              const p = parcels.find((x) => x.id === e.id) as LayerParcel;
              const cause = e.deps.map((d) => describe(byId.get(d) as LedgerEvent)).join('; ');
              const forWhom = scene.events
                .filter((c) => c.deps.includes(e.id))
                .map((c) => describe(c))
                .join('; ');
              return `${describe(e)} · ${(e.route ?? []).join(' -> ')} · NOW ${p.from}->${p.to} · BECAUSE ${cause || 'THE LAYER STARTED'} · FOR ${forWhom || 'NO LATER EVENT'}`;
            })
            .join('  ||  ')
        : 'NOTHING ON THE LANE',
    },
    { k: 'BUFFERS', v: held.length ? `HOLDING ${held.join(', ')} FOR A CONSUMER THAT HAS NOT RUN` : 'EMPTY' },
    {
      k: 'COMPUTE',
      v:
        compute.state === 'active'
          ? `RUNNING ${compute.label}`
          : compute.state === 'waiting'
            ? `NOT READY: ${compute.label} STILL NEEDS ${compute.needs.join(', ')}`
            : compute.label,
    },
    {
      k: 'KV',
      v: `VALID POSITIONS THIS LAYER ${frame.kvBaseline} -> ${frame.kvValid}${kvPending ? ' (APPEND IN PROGRESS)' : ''}`,
    },
    { k: 'DEMAND', v: frame.demand },
  ];
  return frame;
}

/* =========================================================================
   VIEW B — projection mapping
   ========================================================================= */

export interface ProjectionSpec {
  id: 'wide' | 'narrow';
  w: number;
  h: number;
  /** Half-width and half-height of a tile box. */
  tw: number;
  th: number;
  /** x of the first column centre, and the column pitch. */
  c0: number;
  pitch: number;
  /** y of the first tile row centre, and the row pitch. */
  r0: number;
  rowPitch: number;
  /** y of the weight-buffer bar, and of the WROOT junction ticks. */
  wbufY: number;
  rootY: number;
  /** y of the accumulator boxes. */
  accY: number;
  /** x range of the row activation sources. */
  ax: number;
  aw: number;
}

export const PROJECTION_WIDE: ProjectionSpec = {
  id: 'wide',
  w: 696,
  h: 322,
  tw: 70,
  th: 29,
  c0: 250,
  pitch: 166,
  r0: 141,
  rowPitch: 86,
  wbufY: 54,
  rootY: 84,
  accY: 286,
  ax: 8,
  aw: 132,
};

export const PROJECTION_NARROW: ProjectionSpec = {
  id: 'narrow',
  w: 292,
  h: 318,
  tw: 40,
  th: 28,
  c0: 64,
  pitch: 88,
  r0: 140,
  rowPitch: 84,
  wbufY: 54,
  rootY: 84,
  accY: 284,
  ax: 0,
  aw: 16,
};

export interface ProjectionLayout {
  spec: ProjectionSpec;
  /** Centre of every drawn node, by the ledger's own node id. */
  anchor: Record<string, Pt>;
  /** Polyline for every drawn edge, keyed `A>B`. Routes are built from these. */
  path: Record<string, Pt[]>;
}

const key = (a: string, b: string): string => `${a}>${b}`;

/**
 * Anchors and edge polylines for a `makeProjectionLedger(R,C)` scene. Every
 * edge the scene declares gets a drawn path here, and `projectionRoute`
 * refuses to place a parcel on a hop that has none — so a parcel can never
 * cross a line the reader cannot see.
 */
export function projectionLayout(scene: ProjectionScene, spec: ProjectionSpec): ProjectionLayout {
  const { R, C } = scene;
  const cx = (c: number): number => spec.c0 + c * spec.pitch;
  const ry = (r: number): number => spec.r0 + r * spec.rowPitch;
  const anchor: Record<string, Pt> = { WBUF: { x: cx(0), y: spec.wbufY } };
  for (let c = 0; c < C; c++) {
    anchor[`WROOT${c}`] = { x: cx(c), y: spec.rootY };
    anchor[`ACC${c}`] = { x: cx(c), y: spec.accY };
  }
  for (let r = 0; r < R; r++) {
    anchor[`A${r}`] = { x: spec.ax + spec.aw / 2, y: ry(r) };
    for (let c = 0; c < C; c++) anchor[`T${r}${c}`] = { x: cx(c), y: ry(r) };
  }

  const path: Record<string, Pt[]> = {};
  for (const [a, b] of scene.edges) {
    const pa = anchor[a] as Pt;
    const pb = anchor[b] as Pt;
    if (a === 'WBUF') {
      // Along the weight bar, then straight down that column's trunk.
      path[key(a, b)] = [
        { x: pa.x, y: pa.y },
        { x: pb.x, y: pa.y },
        { x: pb.x, y: pb.y },
      ];
    } else {
      path[key(a, b)] = [pa, pb];
    }
  }
  return { spec, anchor, path };
}

export interface ProjectionParcel {
  id: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  from: string;
  to: string;
}

export interface TileState {
  id: string;
  r: number;
  c: number;
  weight: string;
  activation: string;
  output: string;
  weightReady: boolean;
  activationReady: boolean;
  localReady: boolean;
  computeActive: boolean;
  /** Rows whose partial sums this tile has already absorbed. */
  holds: number[];
}

export interface ColumnState {
  c: number;
  label: string;
  /** Rows actually delivered into this accumulator. Empty until delivery. */
  contributors: number[];
  /** Rows folded into the running sum still held in the bottom tile. */
  running: number[];
  delivered: boolean;
}

export interface ProjectionFrame {
  view: 'projection';
  tMs: number;
  durationMs: number;
  parcels: ProjectionParcel[];
  tiles: TileState[];
  columns: ColumnState[];
  readout: Row[];
}

export function sampleProjection(
  scene: ProjectionScene,
  layout: ProjectionLayout,
  tMs: number,
): ProjectionFrame {
  const s = stateAt(scene, tMs);
  const done = new Set(s.complete);
  const active = new Set(s.active.map((e) => e.id));
  const { R, C } = scene;

  const parcels: ProjectionParcel[] = s.active
    .filter((e) => (e.route ?? []).length > 1)
    .map((e) => {
      const { from, to, f } = hopAt(e, s.tMs);
      const poly = layout.path[key(from, to)];
      if (!poly) throw new RangeError(`${e.id} rides ${from}->${to}, which is not a drawn edge`);
      const p = alongPolyline(poly, f);
      return { id: e.id, kind: e.kind, label: parcelLabel(e), x: p.x, y: p.y, from, to };
    });

  const tiles: TileState[] = [];
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const id = `T${r}${c}`;
      // Rows this tile has absorbed, taken from the ledger's own contributor
      // list: its accumulate if that has run, otherwise just its own row.
      const sum = scene.events.find((e) => e.id === `sum.${r}.${c}`);
      const holds: number[] =
        sum && done.has(sum.id) ? [...(sum.contributors ?? [])] : done.has(`local.${r}.${c}`) ? [r] : [];
      tiles.push({
        id,
        r,
        c,
        weight: `W[J${c},I${r}]`,
        activation: `x[I${r}]`,
        output: `z[${r},${c}]`,
        weightReady: done.has(`weight.${r}.${c}`),
        activationReady: done.has(`activation.${r}.${c}`),
        localReady: done.has(`local.${r}.${c}`),
        computeActive: active.has(`local.${r}.${c}`) || active.has(`sum.${r}.${c}`),
        holds: holds.sort((a, b) => a - b),
      });
    }

  const columns: ColumnState[] = [];
  for (let c = 0; c < C; c++) {
    const out = scene.events.find((e) => e.id === `output.${c}`) as LedgerEvent;
    const delivered = done.has(out.id);
    // Before delivery, the column's running total is whatever the deepest
    // completed accumulate in it says it is; row 0's own product before that.
    const accumulated = scene.events
      .filter((e) => e.kind === 'accumulate' && e.column === c && done.has(e.id))
      .map((e) => e.contributors ?? [])
      .sort((a, b) => b.length - a.length)[0];
    const running = accumulated ?? (done.has(`local.0.${c}`) ? [0] : []);
    columns.push({
      c,
      label: `y[J${c}]`,
      contributors: delivered ? (out.contributors ?? []) : [],
      running,
      delivered,
    });
  }

  const readout: Row[] = [
    { k: 'T', v: `${(s.tMs / 1000).toFixed(3)} s OF ${(scene.durationMs / 1000).toFixed(2)} s (DEPENDENCY ORDER)` },
    {
      k: 'IN FLIGHT',
      v: parcels.length
        ? parcels
            .map((p) => {
              const e = scene.events.find((x) => x.id === p.id) as LedgerEvent;
              const forWhom = scene.events
                .filter((c) => c.deps.includes(e.id))
                .map((c) => describe(c))
                .join('; ');
              return `${describe(e)} · ${p.from}->${p.to} · FOR ${forWhom || 'NO LATER EVENT'}`;
            })
            .join('  ||  ')
        : 'NOTHING ON A LINK',
    },
    {
      k: 'TILES',
      v: tiles
        .map(
          (t) =>
            `${t.id}[${t.weightReady ? 'W' : '-'}${t.activationReady ? 'x' : '-'}${t.localReady ? 'z' : '-'}]${t.computeActive ? '*' : ''}`,
        )
        .join(' '),
    },
    {
      k: 'OUTPUT',
      v: columns
        .map((col) =>
          col.delivered
            ? `${col.label} DELIVERED FROM ROWS ${col.contributors.join(',')}`
            : `${col.label} PENDING, COLUMN SUM HOLDS ROWS ${col.running.length ? col.running.join(',') : '-'}`,
        )
        .join(' · '),
    },
    { k: 'RULE', v: 'A TILE COMPUTES ONLY WITH ITS OWN W BLOCK AND ITS ROW ACTIVATION IN HAND' },
  ];

  return { view: 'projection', tMs: s.tMs, durationMs: scene.durationMs, parcels, tiles, columns, readout };
}

/* -------------------------------------------------------------------------
   Stepping. The STEP control moves to the next boundary in the ledger,
   never to an arbitrary offset, so every stepped frame is an event edge.
------------------------------------------------------------------------- */

export function boundaries(scene: LayerScene | ProjectionScene): number[] {
  const set = new Set<number>([0, scene.durationMs]);
  for (const e of scene.events) {
    set.add(e.startMs);
    set.add(e.endMs);
  }
  return [...set].sort((a, b) => a - b);
}

export function nextBoundary(scene: LayerScene | ProjectionScene, tMs: number): number {
  return boundaries(scene).find((b) => b > tMs + 1e-6) ?? 0;
}
