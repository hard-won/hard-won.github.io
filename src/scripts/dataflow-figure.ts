/**
 * The figure's runtime. One clock, one sampler, no schedules.
 *
 * This module owns exactly three things: a time value, the controls that
 * move it, and the act of writing a sampled frame onto the DOM that
 * `DataflowFigure.astro` already rendered. It computes no timing, holds no
 * per-element period, and starts no timer other than a single
 * `requestAnimationFrame` loop. Every state it writes comes out of
 * `sampleLayer` / `sampleProjection` in `src/lib/figure/frame.ts`, called
 * against the ledger the page was built from, which arrives inline as the
 * model's own serialized output. Build, browser and tests therefore sample
 * the same events through the same functions.
 *
 * If this module never loads, the page keeps the static frame the build
 * emitted — a real frame of the same model, not a placeholder.
 */

import { sampleLayer, sampleProjection, nextBoundary } from '../lib/figure/frame.ts';
import type {
  DrawnLayerScene,
  DrawnProjectionScene,
  LayerFrame,
  ProjectionFrame,
  Pt,
  Row,
} from '../lib/figure/frame.ts';

type ViewId = 'layer' | 'projection';

/**
 * Display rate per view. This scales the one clock; it does not give any
 * element a period of its own. The projection view runs at half speed
 * because it has several parcels in flight at once to read.
 */
const RATE: Record<ViewId, number> = { layer: 1, projection: 0.5 };

function init(root: HTMLElement): void {
  const json = root.querySelector('script[data-dfg-scenes]');
  if (!json?.textContent) return;
  let scenes: { layer: DrawnLayerScene; projection: DrawnProjectionScene };
  try {
    scenes = JSON.parse(json.textContent) as { layer: DrawnLayerScene; projection: DrawnProjectionScene };
  } catch {
    return; // keep the static frame rather than replace it with a broken one
  }

  const $ = <T extends Element>(sel: string): T[] => Array.from(root.querySelectorAll<T>(sel));

  const stageEls = $<HTMLElement>('[data-stage-id]');
  const bandEls = $<HTMLElement>('.dfg__band');
  const bandTextEls = $<HTMLElement>('[data-band-text]');
  const laneEls = $<HTMLElement>('.dfg__parcel');
  const tileEls = $<SVGElement>('.dfg-tile');
  const accEls = $<SVGElement>('.dfg-acc');
  const layerRows = $<HTMLElement>('[data-readout="layer"] dd');
  const projRows = $<HTMLElement>('[data-readout="projection"] dd');
  const kvEl = root.querySelector<HTMLElement>('[data-kv]');
  const kvWrap = root.querySelector<HTMLElement>('[data-kv-pending]');
  const kvNote = root.querySelector<HTMLElement>('[data-kvnote]');
  const live = root.querySelector<HTMLElement>('[data-live]');
  const toggleBtn = root.querySelector<HTMLButtonElement>('[data-act="toggle"]');

  /**
   * Each plate is drawn at its own scale, so each carries its own geometry —
   * and that geometry is read back off the lines the plate actually draws.
   * A parcel therefore cannot be placed anywhere except on a rendered edge.
   */
  const plates = $<SVGElement>('.dfg__svg').map((el) => {
    const path: Record<string, Pt[]> = {};
    for (const ln of Array.from(el.querySelectorAll<SVGElement>('[data-edge-id]')))
      path[ln.dataset.edgeId as string] = (ln.getAttribute('points') ?? '').split(' ').map((pair) => {
        const xy = pair.split(',');
        return { x: Number(xy[0]), y: Number(xy[1]) };
      });
    return { layout: { path }, parcels: Array.from(el.querySelectorAll<SVGElement>('.dfg-parcel')) };
  });
  const geometry = plates[0]?.layout ?? { path: {} };

  /* ---- the clock ---- */

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const t: Record<ViewId, number> = { layer: Number(root.dataset.t ?? 0), projection: 3600 };
  let view: ViewId = 'layer';
  let userPaused = reduced.matches;
  let offscreen = false;
  let hidden = document.hidden;
  let last = 0;

  /* ---- writing a sampled frame onto the rendered DOM ---- */

  function write(cells: HTMLElement[], rows: Row[]): void {
    rows.forEach((r, i) => {
      const el = cells[i];
      if (el && el.textContent !== r.v) el.textContent = r.v;
    });
  }

  function paintLayer(f: LayerFrame): void {
    for (const el of stageEls) el.dataset.state = f.stage[el.dataset.stageId as string] ?? 'next';
    f.bands.forEach((b, i) => {
      const el = bandEls[i];
      const tx = bandTextEls[i];
      if (el) el.dataset.state = b.state;
      if (tx && tx.textContent !== b.text) tx.textContent = b.text;
    });
    const moving = new Map(f.parcels.map((p) => [p.id, p]));
    for (const el of laneEls) {
      const p = moving.get(el.dataset.eventId as string);
      if (!p) {
        if (el.dataset.state !== 'off') el.dataset.state = 'off';
        continue;
      }
      el.dataset.state = 'on';
      el.dataset.dir = p.dir;
      el.style.top = `${p.pct.toFixed(3)}%`;
    }
    if (kvEl) kvEl.textContent = String(f.kvValid);
    if (kvWrap) kvWrap.dataset.kvPending = String(f.kvPending);
    if (kvNote) {
      const next = (f.replay ? kvNote.dataset.replayNote : kvNote.dataset.baseNote) ?? '';
      if (kvNote.textContent !== next) kvNote.textContent = next;
    }
    write(layerRows, f.readout);
  }

  function paintProjection(f: ProjectionFrame): void {
    for (const el of tileEls) {
      const s = f.tiles.find((x) => x.id === el.dataset.nodeId);
      if (!s) continue;
      el.dataset.w = String(s.weightReady);
      el.dataset.a = String(s.activationReady);
      el.dataset.z = String(s.localReady);
      el.dataset.state = s.computeActive ? 'active' : s.localReady ? 'ready' : 'idle';
    }
    for (const el of accEls) {
      const col = f.columns.find((c) => `ACC${c.c}` === el.dataset.nodeId);
      el.dataset.state = col?.delivered ? 'ready' : 'idle';
    }
    for (const plate of plates) {
      const moving = new Map(
        sampleProjection(scenes.projection, plate.layout, f.tMs).parcels.map((p) => [p.id, p]),
      );
      for (const g of plate.parcels) {
        const p = moving.get(g.dataset.eventId as string);
        if (!p) {
          if (g.dataset.state !== 'off') g.dataset.state = 'off';
          continue;
        }
        g.dataset.state = 'on';
        g.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
      }
    }
    write(projRows, f.readout);
  }

  function paint(): void {
    root.dataset.t = String(Math.round(t[view]));
    if (view === 'layer') paintLayer(sampleLayer(scenes.layer, t.layer));
    else paintProjection(sampleProjection(scenes.projection, geometry, t.projection));
  }

  /* ---- controls ---- */

  function say(msg: string): void {
    if (live) live.textContent = msg;
  }

  function setPaused(paused: boolean): void {
    userPaused = paused;
    if (toggleBtn) {
      toggleBtn.textContent = paused ? 'PLAY' : 'PAUSE';
      toggleBtn.setAttribute('aria-pressed', String(paused));
    }
  }

  function setView(next: ViewId): void {
    view = next;
    root.dataset.view = next;
    for (const b of $<HTMLButtonElement>('[data-view-btn]'))
      b.setAttribute('aria-pressed', String(b.dataset.viewBtn === next));
    paint();
    say(root.querySelector(`.dfg__view[data-view="${next}"]`)?.getAttribute('aria-label') ?? next);
  }

  root.addEventListener('click', (ev) => {
    const btn = (ev.target as Element | null)?.closest<HTMLButtonElement>('button');
    if (!btn || !root.contains(btn)) return;
    if (btn.dataset.viewBtn) return setView(btn.dataset.viewBtn as ViewId);
    const act = btn.dataset.act;
    if (act === 'toggle') {
      setPaused(!userPaused);
      say(userPaused ? 'Paused.' : 'Playing.');
    } else if (act === 'replay') {
      t[view] = 0;
      setPaused(false);
      paint();
      say('Replaying.');
    } else if (act === 'step') {
      setPaused(true);
      t[view] = nextBoundary(view === 'layer' ? scenes.layer : scenes.projection, t[view]);
      paint();
      say((view === 'layer' ? layerRows : projRows).map((c) => c.textContent).join('. '));
    }
  });

  /* ---- the single loop ---- */

  function tick(now: number): void {
    const dt = last === 0 ? 0 : now - last;
    last = now;
    if (!userPaused && !offscreen && !hidden) {
      const scene = view === 'layer' ? scenes.layer : scenes.projection;
      t[view] += dt * RATE[view];
      if (t[view] >= scene.durationMs) t[view] = 0;
      paint();
    }
    requestAnimationFrame(tick);
  }

  /* ---- pause where nobody can see it, without losing a deliberate pause --- */

  if ('IntersectionObserver' in window)
    new IntersectionObserver(
      (entries) => {
        for (const e of entries) offscreen = !e.isIntersecting;
        last = 0;
      },
      { threshold: 0 },
    ).observe(root);

  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    last = 0;
  });

  reduced.addEventListener('change', (e) => {
    if (e.matches) setPaused(true);
  });

  /**
   * Test seam. Seeking goes through the same sampler the clock uses; it is a
   * scoped event on this element rather than a global, and there is no
   * privileged path into rendering behind it.
   */
  root.addEventListener('dfg:seek', (ev) => {
    const d = (ev as CustomEvent<{ tMs?: number; view?: ViewId }>).detail ?? {};
    if (d.view) setView(d.view);
    if (typeof d.tMs === 'number') {
      setPaused(true);
      const scene = view === 'layer' ? scenes.layer : scenes.projection;
      t[view] = Math.max(0, Math.min(d.tMs, scene.durationMs));
      paint();
    }
  });

  root.dataset.js = 'on';
  setPaused(userPaused);
  setView('layer');
  requestAnimationFrame(tick);
}

for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-figure="dataflow"]'))) init(el);
