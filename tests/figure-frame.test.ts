/**
 * The renderer's sampler, swept over the whole timeline.
 *
 * `tests/reference.test.ts` proves the ledger is a valid dependency graph.
 * This file proves the thing that actually gets drawn never contradicts it:
 * that no arithmetic is shown running before its operands have landed, that
 * no parcel is ever drawn off a line the figure draws, and that the KV
 * count moves at exactly one instant.
 *
 * It samples `src/lib/figure/frame.ts` — the same functions the Astro
 * component calls at build time and the browser runtime calls per frame.
 * There is no test-only rendering path.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { makeLayerLedger, makeProjectionLedger, LAYER_EDGES } from '../src/lib/decode-traffic/index.ts';
import {
  annotateLayer,
  annotateProjection,
  LANE,
  lanePct,
  sampleLayer,
  sampleProjection,
  projectionLayout,
  PROJECTION_WIDE,
  PROJECTION_NARROW,
  boundaries,
  nextBoundary,
  isCompute,
} from '../src/lib/figure/frame.ts';

const layer = annotateLayer(makeLayerLedger({ T0: 2048, stepIndex: 0 }));
const projection = annotateProjection(makeProjectionLedger(2, 3));
const wide = projectionLayout(projection, PROJECTION_WIDE);
const narrow = projectionLayout(projection, PROJECTION_NARROW);

/** Every 10 ms, plus both sides of every event boundary. */
function sweep(durationMs: number, extra: number[]): number[] {
  const ts: number[] = [];
  for (let t = 0; t <= durationMs; t += 10) ts.push(t);
  for (const b of extra) ts.push(Math.max(0, b - 1), b, Math.min(durationMs, b + 1));
  return ts;
}

const layerTimes = sweep(layer.durationMs, boundaries(layer));
const projTimes = sweep(projection.durationMs, boundaries(projection));

test('the drawn lane is exactly the model’s declared edge set', () => {
  const drawn = new Set<string>();
  for (let i = 1; i < LANE.length; i++) {
    drawn.add(`${LANE[i - 1]}->${LANE[i]}`);
    drawn.add(`${LANE[i]}->${LANE[i - 1]}`);
  }
  const declared = new Set(LAYER_EDGES.map(([a, b]) => `${a}->${b}`));
  assert.deepEqual([...drawn].sort(), [...declared].sort());
  assert.equal(lanePct('HBM') < lanePct('COMPUTE'), true);
});

test('layer view: nothing computes before every dependency has completed', () => {
  const byId = new Map(layer.events.map((e) => [e.id, e]));
  for (const t of layerTimes) {
    const f = sampleLayer(layer, t);
    if (f.compute.state !== 'active') continue;
    const running = layer.events.find((e) => isCompute(e) && e.startMs <= f.tMs && f.tMs < e.endMs);
    assert.ok(running, `compute-active at ${t} with no active arithmetic event`);
    for (const d of running.deps) {
      const dep = byId.get(d);
      assert.ok(dep && dep.endMs <= f.tMs, `${running.id} active at ${t} but ${d} has not completed`);
    }
  }
});

test('layer view: attention arithmetic never runs while its keys or values are in flight', () => {
  for (const t of layerTimes) {
    const f = sampleLayer(layer, t);
    const inFlight = new Set(f.parcels.map((p) => p.id));
    if (inFlight.has('attn.k.return') || inFlight.has('attn.k.request') || inFlight.has('attn.k.service'))
      assert.notEqual(f.phase === 'attention' && f.compute.state, 'active');
    if (inFlight.has('attn.k.return'))
      assert.equal(f.compute.state, 'waiting', `keys in flight at ${t} but compute reads ${f.compute.state}`);
    if (inFlight.has('attn.v.return')) assert.equal(f.compute.state, 'waiting');
  }
});

test('layer view: a waiting compute always names an operand that has not arrived', () => {
  for (const t of layerTimes) {
    const f = sampleLayer(layer, t);
    if (f.compute.state === 'waiting') assert.ok(f.compute.needs.length > 0, `empty needs at ${t}`);
    if (f.compute.state === 'active') assert.equal(f.compute.needs.length, 0);
  }
});

test('layer view: every parcel sits between two adjacent lane nodes', () => {
  for (const t of layerTimes) {
    for (const p of sampleLayer(layer, t).parcels) {
      assert.equal(Math.abs(LANE.indexOf(p.from) - LANE.indexOf(p.to)), 1, `${p.id} jumps ${p.from}->${p.to}`);
      const lo = Math.min(lanePct(p.from), lanePct(p.to));
      const hi = Math.max(lanePct(p.from), lanePct(p.to));
      assert.ok(p.pct >= lo - 1e-9 && p.pct <= hi + 1e-9, `${p.id} at ${p.pct}% is off its hop at ${t}`);
    }
  }
});

test('layer view: device memory only services a tensor whose request has landed', () => {
  const byId = new Map(layer.events.map((e) => [e.id, e]));
  for (const t of layerTimes) {
    const f = sampleLayer(layer, t);
    const hbm = f.bands.find((b) => b.id === 'HBM');
    if (hbm?.state !== 'active') continue;
    const svc = layer.events.find((e) => e.kind === 'memory-read' && e.startMs <= f.tMs && f.tMs < e.endMs);
    assert.ok(svc);
    const req = byId.get(svc.deps[0] as string);
    assert.ok(req && req.kind === 'request' && req.endMs <= f.tMs);
  }
});

test('layer view: KV count is the prefilled baseline until kv.visible ends, then baseline+1', () => {
  const visible = layer.events.find((e) => e.kind === 'kv-visible');
  assert.ok(visible);
  for (const t of layerTimes) {
    const f = sampleLayer(layer, t);
    assert.equal(f.kvBaseline, 2048);
    assert.equal(f.kvValid, t >= visible.endMs ? 2049 : 2048, `wrong KV count at ${t}`);
  }
});

test('layer view: no stage is marked done before its window closes', () => {
  for (const t of layerTimes) {
    const f = sampleLayer(layer, t);
    for (const w of layer.stageWindows) {
      if (f.stage[w.id] === 'done') assert.ok(w.endMs <= f.tMs, `${w.id} done early at ${t}`);
      if (f.stage[w.id] === 'now') assert.ok(w.startMs <= f.tMs && f.tMs < w.endMs);
    }
  }
});

test('layer view: both residual adds are stages, and each names its own skip source', () => {
  const f = sampleLayer(layer, layer.durationMs);
  assert.equal(f.stage['res1'], 'done');
  assert.equal(f.stage['res2'], 'done');
  const res1 = sampleLayer(layer, 9400);
  assert.match(res1.compute.label, /THE LAYER INPUT/);
  const res2 = sampleLayer(layer, 14300);
  assert.match(res2.compute.label, /THE POST-ATTN STATE/);
});

test('layer view: the readout never prints a percentage or a utilization figure', () => {
  for (const t of layerTimes) {
    for (const row of sampleLayer(layer, t).readout) {
      assert.doesNotMatch(row.v, /%|UTILI[SZ]ATION|OCCUPANCY|SATURAT/i, `at ${t}: ${row.v}`);
    }
  }
});

test('projection view: a tile computes only with its own weight block and row activation in hand', () => {
  for (const t of projTimes) {
    for (const layout of [wide, narrow]) {
      for (const tile of sampleProjection(projection, layout, t).tiles) {
        if (tile.computeActive || tile.localReady)
          assert.ok(
            tile.weightReady && tile.activationReady,
            `${tile.id} computing at ${t} without W=${tile.weightReady} x=${tile.activationReady}`,
          );
      }
    }
  }
});

test('projection view: a tile a weight block merely passes through is not weight-ready', () => {
  // weight.1.0 routes WBUF>WROOT0>T00>T10 and completes at 1000 ms; T00 was
  // already the owner of weight.0.0, so use the column where the pass-through
  // happens before the transiting block's own owner has it.
  const during = sampleProjection(projection, wide, 1450); // weight.1.1 in flight through T01
  const t11 = during.tiles.find((x) => x.id === 'T11');
  const t01 = during.tiles.find((x) => x.id === 'T01');
  assert.equal(t11?.weightReady, false, 'T11 is ready before its block arrives');
  assert.equal(t01?.weightReady, true, 'T01 owns W[J1,I0], which landed at 1300 ms');
  const parcel = during.parcels.find((p) => p.id === 'weight.1.1');
  assert.ok(parcel, 'W[J1,I1] should be in flight at 1450 ms');
});

test('projection view: an output column carries no contributor until its delivery completes', () => {
  for (const t of projTimes) {
    const f = sampleProjection(projection, wide, t);
    for (const col of f.columns) {
      const out = projection.events.find((e) => e.id === `output.${col.c}`);
      assert.ok(out);
      assert.equal(col.delivered, out.endMs <= f.tMs, `column ${col.c} delivery wrong at ${t}`);
      if (col.delivered) assert.deepEqual(col.contributors, [0, 1]);
      else assert.deepEqual(col.contributors, [], `column ${col.c} shows an output it has not received at ${t}`);
      // The running sum may reach both rows before delivery, but never before
      // the accumulate that produced it has completed.
      if (col.running.length === 2) {
        const sum = projection.events.find((e) => e.id === `sum.1.${col.c}`);
        assert.ok(sum && sum.endMs <= f.tMs, `column ${col.c} claims a full sum at ${t}`);
      }
    }
  }
});

test('projection view: every parcel rides a declared edge, inside the drawn frame', () => {
  const declared = new Set(projection.edges.map(([a, b]) => `${a}>${b}`));
  for (const layout of [wide, narrow]) {
    for (const t of projTimes) {
      for (const p of sampleProjection(projection, layout, t).parcels) {
        assert.ok(declared.has(`${p.from}>${p.to}`), `${p.id} rides undrawn ${p.from}->${p.to}`);
        assert.ok(layout.path[`${p.from}>${p.to}`], 'edge has no polyline');
        assert.ok(p.x >= 0 && p.x <= layout.spec.w, `${p.id} x=${p.x} outside ${layout.spec.id}`);
        assert.ok(p.y >= 0 && p.y <= layout.spec.h, `${p.id} y=${p.y} outside ${layout.spec.id}`);
      }
    }
  }
});

test('projection view: tile ownership is the blocked mapping, one owner per block', () => {
  const f = sampleProjection(projection, wide, projection.durationMs);
  const owners = new Map<string, string>();
  for (const tile of f.tiles) {
    assert.equal(tile.weight, `W[J${tile.c},I${tile.r}]`);
    assert.equal(tile.activation, `x[I${tile.r}]`);
    assert.equal(owners.has(tile.weight), false, `${tile.weight} has two owners`);
    owners.set(tile.weight, tile.id);
  }
  assert.equal(owners.size, projection.R * projection.C);
  assert.deepEqual(
    f.columns.map((c) => c.label),
    ['y[J0]', 'y[J1]', 'y[J2]'],
  );
});

test('both layouts place the same nodes, only at different coordinates', () => {
  assert.deepEqual(Object.keys(wide.anchor).sort(), Object.keys(narrow.anchor).sort());
  assert.deepEqual(Object.keys(wide.path).sort(), Object.keys(narrow.path).sort());
  assert.notDeepEqual(wide.anchor['T00'], narrow.anchor['T00']);
});

test('stepping lands on ledger boundaries only, and wraps', () => {
  const bs = boundaries(layer);
  assert.equal(bs[0], 0);
  assert.equal(bs[bs.length - 1], layer.durationMs);
  let t = 0;
  for (let i = 0; i < 12; i++) {
    t = nextBoundary(layer, t);
    assert.ok(bs.includes(t), `${t} is not an event boundary`);
  }
  assert.equal(nextBoundary(layer, layer.durationMs), 0);
});

test('the static frames the figure ships are the ones they claim to be', () => {
  const a = sampleLayer(layer, 5700);
  assert.equal(a.phase, 'attention');
  assert.equal(a.compute.state, 'waiting');
  assert.deepEqual(
    a.parcels.map((p) => p.id),
    ['attn.k.return'],
  );
  assert.equal(a.kvValid, 2049);
  // The two highlights the old figure conflated, at the same instant.
  assert.equal(a.stage['attention'], 'now');
  assert.equal(a.bands.find((b) => b.id === 'COMPUTE')?.state, 'waiting');
  const b = sampleProjection(projection, wide, 3600);
  assert.equal(b.columns[0]?.delivered, false);
  assert.ok(b.parcels.length > 0, 'the projection static frame should show traffic');
});
