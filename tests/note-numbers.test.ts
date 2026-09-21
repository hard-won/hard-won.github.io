/**
 * The Note's prose is the last place a number can drift.
 *
 * The plates import src/lib/decode-traffic and draw what it returns, so they
 * cannot disagree with the model. Prose cannot import anything, so this file
 * closes the loop from the other side: every quantity the article states is
 * recomputed here from the model and looked up in the published text. If
 * someone changes a formula, or edits a digit by hand, a test fails instead
 * of a reader finding it.
 *
 * It checks presence, not absence: it cannot catch a wrong number the
 * article never claimed. It is a drift alarm, not a proofreader.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXAMPLE, traffic, cumulativeKV, numericalCrossCheck } from '../src/lib/decode-traffic/traffic-model.ts';

const NOTE = readFileSync(new URL('../src/content/notes/decode-step-as-traffic.mdx', import.meta.url), 'utf8');

/** The article writes long integers with thousands separators. */
const grouped = (n: number) => n.toLocaleString('en-US');

function states(label: string, text: string): void {
  assert.ok(NOTE.includes(text), `The Note should state ${label} as "${text}"`);
}

const T = 2048;
const a = traffic(EXAMPLE, T);
const n = numericalCrossCheck(EXAMPLE, T);

test('Model-wide payload figures in the prose come from the model', () => {
  states('P_mat', grouped(a.pMat));
  states('matrix-weight payload per pass', grouped(a.weightPayload));
  states('C, the KV bytes per position', grouped(a.cKV));
  states('KV payload at T=2048', grouped(a.kvUniquePayload));
});

test('The parameter-count reconciliation is the model plus what it omits', () => {
  const embedding = EXAMPLE.vocab * EXAMPLE.d;
  const normVectors = (2 * EXAMPLE.L + 1) * EXAMPLE.d;
  states('the embedding table', grouped(embedding));
  states('the norm scale vectors', grouped(normVectors));
  states('total parameters', grouped(a.pMat + embedding + normVectors));
  // The approximation the article makes is "about two per cent".
  const gap = 1 - a.pMat / (a.pMat + embedding + normVectors);
  assert.ok(gap > 0.015 && gap < 0.025, `P_mat is ${(gap * 100).toFixed(2)}% short of P, not about two per cent`);
});

test('Per-operator arithmetic in the prose comes from the model', () => {
  states('q_proj matrix elements', grouped(EXAMPLE.d * EXAMPLE.d));
  states('q_proj weight bytes', grouped(n.qWeight));
  states('q_proj vector bytes', grouped(n.qInputOutput));
  states('q_proj full I/O', grouped(n.qFullIO));
  states('q_proj full-I/O intensity', n.qFullIntensity.toFixed(6));
  states('key bytes', grouped(n.keys));
  states('query bytes', grouped(n.query));
  states('score bytes', grouped(n.scores));
  states('QK intensity with the score write', n.qkFullIntensity.toFixed(6));
  states('gate matrix elements', grouped(EXAMPLE.d * EXAMPLE.dFF));
  states('gate bytes', grouped(n.gateWeight));
  states('standalone residual I/O', grouped(n.residualStandaloneIO));
  states('the two-input residual convention', grouped(2 * EXAMPLE.d * EXAMPLE.bA));
  states('prefill q_proj FLOP', grouped(n.prefillQFlops));
  states('prefill q_proj bytes', grouped(n.prefillQFullIO));
  states('prefill q_proj intensity', String(n.prefillQIntensity));
});

test('The two rounded intensities the article contrasts really do round that way', () => {
  assert.equal(n.qkQueryOnlyIntensity.toFixed(2), '1.00');
  assert.equal(n.qkFullIntensity.toFixed(2), '0.99');
  states('the query-only rounding', '1.00');
  states('the full-I/O rounding', '0.99');
});

test('The crossover the article quotes is the model\'s formal solution', () => {
  assert.equal(a.formalCrossoverT, 25204);
  states('T*', grouped(a.formalCrossoverT));
});

test('The prompt term dominates until D = 2*T0 - 1, as the article says', () => {
  const T0 = 2048;
  const balance = 2 * T0 - 1;
  // Below the balance point the prompt term is the larger of the two.
  const promptTerm = (D: number) => D * T0;
  const triangular = (D: number) => (D * (D + 1)) / 2;
  assert.ok(promptTerm(balance - 1) > triangular(balance - 1));
  assert.equal(promptTerm(balance), triangular(balance));
  // and the closed form the article prints is the model's.
  const D = 11;
  assert.equal(cumulativeKV(EXAMPLE, T0, D), a.cKV * (D * T0 + (D * (D + 1)) / 2));
  states('the balance point', String(balance));
});

test('The A6000 ridge point follows from the two published figures', () => {
  const bandwidth = 768e9;
  const sparse = 309.7e12;
  const dense = sparse / 2;
  assert.equal(dense / 1e12, 154.85);
  assert.equal(Math.round(dense / bandwidth), 202);
  states('the published bandwidth', '768 GB/s');
  states('the sparse tensor figure', '309.7 TFLOPS');
  states('the dense ceiling', '154.85 TFLOPS');
  states('the ridge point', '202 FLOP/byte');
});
