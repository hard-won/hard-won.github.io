/**
 * Semantic tests for the decode-traffic model.
 *
 * Ported from the review package's `tests/reference.test.mjs`, unchanged
 * except for types: every assertion, literal and loop bound is the
 * original's. They run against `src/lib/decode-traffic/`, which is the
 * module the Note's plates import, so a passing run is evidence about the
 * published page and not about an unused copy.
 *
 * Run with `npm test` (Node's own runner; Node strips the types).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLE,traffic,cumulativeKV,numericalCrossCheck,channelForAddress,blockedMatvec,partitions} from '../src/lib/decode-traffic/traffic-model.ts';
import {makeLayerLedger,makeProjectionLedger,stateAt,validateLedger,STAGES,attachLayerPayloads,validateLayerSemantics,validateProjectionSemantics} from '../src/lib/decode-traffic/event-model.ts';
const approx=(a:number,b:number,tol=1e-10)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);

test('Per-layer dense matrices and LM head are counted explicitly',()=>{
 const a=traffic(EXAMPLE,2048);
 assert.equal(a.perLayerMatrixElements,202375168);
 assert.equal(a.pMat,6607077376);
 assert.equal(a.weightPayload,13214154752);
});
test('KV current-position definition and one-position append are consistent',()=>{
 const a=traffic(EXAMPLE,2048);
 assert.equal(a.cKV,524288);
 assert.equal(a.kvUniquePayload,1073741824);
 assert.equal(a.kvAppendPayload,524288);
 assert.equal(a.kvUniquePayload-a.kvOldColdReadPayload,a.kvAppendPayload);
});
test('GQA changes KV heads but retains query-head FLOP count',()=>{
 const a=traffic(EXAMPLE,2048),g=traffic({...EXAMPLE,nKV:8},2048);
 assert.equal(g.kvUniquePayload,a.kvUniquePayload/4);
 assert.equal(g.attentionMatmulFlops,a.attentionMatmulFlops);
 assert.equal(g.attentionKVOnlyIntensity,4);
});
test('GQA also changes K/V projection weights: do not hold Pmat constant implicitly',()=>{
 const a=traffic(EXAMPLE,2048),g=traffic({...EXAMPLE,nKV:8},2048);
 assert.ok(g.pMat<a.pMat);
 assert.notEqual(g.formalCrossoverT,a.formalCrossoverT*4);
});
test('Cumulative payload includes prompt and triangular decode terms',()=>{
 const D=11,T0=2048;
 const explicit=Array.from({length:D},(_,j)=>traffic(EXAMPLE,T0+j+1).kvUniquePayload).reduce((a,b)=>a+b,0);
 assert.equal(cumulativeKV(EXAMPLE,T0,D),explicit);
 assert.equal(cumulativeKV(EXAMPLE,T0,0),0);
});
test('Weight-only intensity is a denominator-limited approximation',()=>{
 const n=numericalCrossCheck();
 assert.equal(n.qWeight,33554432);
 assert.equal(n.qFullIO,33570816);
 assert.ok(n.qFullIntensity<traffic(EXAMPLE,2048).weightOnlyIntensity);
});
test('Query bytes alone do not explain QK intensity 0.99',()=>{
 const n=numericalCrossCheck();
 assert.equal(n.keys,16777216);assert.equal(n.query,8192);assert.equal(n.scores,131072);
 assert.equal(n.qkFullIO,16916480);
 assert.equal(n.qkQueryOnlyIntensity.toFixed(2),'1.00');
 assert.equal(n.qkFullIntensity.toFixed(2),'0.99');
});
test('Standalone residual includes two reads and one output write',()=>{
 const n=numericalCrossCheck();
 assert.equal(n.residualFlops,4096);
 assert.equal(n.residualStandaloneIO,24576);
 approx(n.residualStandaloneIntensity,1/6);
});
test('Prefill full-I/O example produces intensity 1024',()=>{
 const n=numericalCrossCheck();
 assert.equal(n.prefillQFlops,68719476736);
 assert.equal(n.prefillQFullIO,67108864);
 assert.equal(n.prefillQIntensity,1024);
});
test('Payload-only quantization does not create metadata or speedup claims',()=>{
 assert.equal(traffic({...EXAMPLE,bW:0.5},2048).weightOnlyIntensity,4);
 assert.equal(traffic({...EXAMPLE,bKV:1},2048).kvUniquePayload,traffic(EXAMPLE,2048).kvUniquePayload/2);
});
test('Toy 16-channel map does not wrap after channel 3',()=>{
 assert.deepEqual(Array.from({length:20},(_,i)=>channelForAddress(i*256)),[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0,1,2,3]);
 assert.equal(channelForAddress(255),0);assert.equal(channelForAddress(256),1);
});
test('Invalid model inputs fail rather than silently manufacturing counts',()=>{
 for(const m of [{...EXAMPLE,nKV:3},{...EXAMPLE,bW:0},{...EXAMPLE,d:4000}]) assert.throws(()=>traffic(m,2048));
 assert.throws(()=>traffic(EXAMPLE,0));assert.throws(()=>cumulativeKV(EXAMPLE,1,0.5));
});
test('Blocked map equals direct matvec across even and uneven partitions',()=>{
 for(let M=1;M<=7;M++)for(let K=1;K<=7;K++)for(let R=1;R<=Math.min(K,3);R++)for(let C=1;C<=Math.min(M,3);C++){
  const W=Array.from({length:M},(_,j)=>Array.from({length:K},(_,i)=>((j*7+i*3)%13)-6));
  const x=Array.from({length:K},(_,i)=>i-2);
  const a=blockedMatvec(W,x,R,C);assert.deepEqual(a.y,a.direct);
 }
});
test('Weight blocks uniquely partition W rather than multicast all W to every tile',()=>{
 const W=Array.from({length:6},()=>Array(4).fill(1)),x=[1,2,3,4];
 const {blocks}=blockedMatvec(W,x,2,3);const seen=new Set<string>();
 for(const b of blocks)for(let j=b.outputRange.start;j<b.outputRange.end;j++)for(let i=b.inputRange.start;i<b.inputRange.end;i++){
  const key=`${j}:${i}`;assert.ok(!seen.has(key));seen.add(key);
 }
 assert.equal(seen.size,24);
 assert.throws(()=>partitions(2,3));assert.throws(()=>blockedMatvec([[1,2]],[1]));
});
test('Layer ledger preserves major-stage order and complete scope',()=>{
 const s=makeLayerLedger();assert.ok(validateLedger(s));
 assert.deepEqual(s.stageWindows.map(x=>x.id),STAGES.map(x=>x[0]));
 for(let i=1;i<s.stageWindows.length;i++)assert.ok(s.stageWindows[i].startMs>=s.stageWindows[i-1].endMs);
 assert.equal(s.events.filter(e=>e.kind==='residual').length,2);
 assert.equal(s.events.filter(e=>e.kind==='linear-compute').length,7);
});
test('No QK/PV/O computation precedes required returns',()=>{
 const s=makeLayerLedger();const get=(id:string)=>s.events.find(e=>e.id===id)!;
 assert.ok(get('attn.qk').startMs>=get('attn.k.return').endMs);
 assert.ok(get('attn.pv').startMs>=get('attn.v.return').endMs);
 assert.ok(get('o.compute').startMs>=get('attn.pv').endMs);
 assert.ok(get('attn.qk').startMs>=get('kv.visible').endMs);
 assert.deepEqual(get('rope.compute').targets,['q','k']);
 assert.deepEqual(get('rope.compute').notTargets,['v']);
});
test('KV baseline survives replay and increments only at the chosen visibility boundary',()=>{
 for(let stepIndex=0;stepIndex<3;stepIndex++){
  const s=makeLayerLedger({T0:2048,stepIndex});const v=s.events.find(e=>e.id==='kv.visible')!;
  assert.equal(stateAt(s,0).kvValid,2048+stepIndex);
  assert.equal(stateAt(s,v.endMs-0.001).kvValid,2048+stepIndex);
  assert.equal(stateAt(s,v.endMs).kvValid,2049+stepIndex);
  assert.equal(stateAt(s,s.durationMs).kvValid,2049+stepIndex);
 }
});
test('Every intermediate display frame respects producer-before-consumer',()=>{
 const s=makeLayerLedger();
 for(let t=0;t<=s.durationMs;t+=17){
  const st=stateAt(s,t);const done=new Set(st.complete);
  for(const e of st.active)for(const dep of e.deps)assert.ok(done.has(dep),`${e.id} at ${t}`);
 }
});
test('Negative test: early attention computation is rejected',()=>{
 const s=structuredClone(makeLayerLedger());const e=s.events.find(x=>x.id==='attn.qk')!;
 e.startMs=0;e.endMs=500;assert.throws(()=>validateLedger(s),/Causality/);
});
test('Negative test: packet crossing an undrawn edge is rejected',()=>{
 const s=structuredClone(makeLayerLedger());s.events.find(e=>e.route)!.route=['BUF','HBM'];
 assert.throws(()=>validateLedger(s),/Nonexistent edge/);
});
test('Projection trace has unique weight owners and row-wise activation identity',()=>{
 const s=makeProjectionLedger();assert.ok(validateLedger(s));
 const w=s.events.filter(e=>e.kind==='weight-delivery');assert.equal(w.length,6);
 assert.equal(new Set(w.map(e=>e.tensor)).size,6);
 for(const e of w)assert.deepEqual(e.destinations,[e.owner]);
 for(let r=0;r<2;r++)assert.equal(new Set(s.events.filter(e=>e.id.startsWith(`activation.${r}.`)).map(e=>e.tensor)).size,1);
});
test('Each output contains contributions from its column only and all rows',()=>{
 for(const [R,C] of [[1,1],[2,3],[4,2]]){
  const s=makeProjectionLedger(R,C);
  const outs=s.events.filter(e=>e.kind==='output-delivery');assert.equal(outs.length,C);
  for(const e of outs)assert.deepEqual(e.contributors,Array.from({length:R},(_,i)=>i));
 }
});
test('Projection partials require local products; complete trace is seek-safe',()=>{
 const s=makeProjectionLedger();
 for(let t=0;t<=s.durationMs;t+=19){
  const st=stateAt(s,t);const done=new Set(st.complete);
  for(const e of st.active)for(const d of e.deps)assert.ok(done.has(d));
 }
});

test('One-layer payload ledger agrees with arithmetic without model-scope leakage',()=>{
 const s=attachLayerPayloads(makeLayerLedger({T0:2047}),EXAMPLE);
 const accounting=s.events.filter(e=>e.isAccountingEvent);
 const weights=accounting.filter(e=>e.tensor?.startsWith('W')).reduce((a,e)=>a+e.payloadBytes!,0);
 const kv=accounting.filter(e=>e.kind==='memory-read'&&!e.tensor!.startsWith('W')).reduce((a,e)=>a+e.payloadBytes!,0);
 assert.equal(weights,traffic(EXAMPLE,2048).perLayerMatrixElements*EXAMPLE.bW);
 assert.equal(kv,traffic(EXAMPLE,2048).kvUniquePayload/EXAMPLE.L);
 assert.equal(accounting.find(e=>e.kind==='write-transfer')!.payloadBytes,16384);
});
test('Read return is not counted as a second HBM read',()=>{
 const s=attachLayerPayloads(makeLayerLedger(),EXAMPLE);
 assert.ok(s.events.filter(e=>e.kind==='read-return').every(e=>e.payloadBytes!>0&&!e.isAccountingEvent));
 assert.ok(s.events.filter(e=>e.kind==='request').every(e=>e.payloadBytes===0));
});


test('Negative test: deleting the required K input cannot hide behind an otherwise valid DAG',()=>{
 const s=structuredClone(makeLayerLedger());s.events.find(e=>e.id==='attn.qk')!.deps=['rope.compute'];
 assert.ok(validateLedger(s));
 assert.throws(()=>validateLayerSemantics(s),/semantic dependency/);
});
test('Negative test: counting a KV position twice is rejected',()=>{
 const s=structuredClone(makeLayerLedger());const v=s.events.find(e=>e.id==='kv.visible')!;v.validAfter=v.validAfter!+1;
 assert.throws(()=>validateLayerSemantics(s),/KV increment/);
});
test('Negative test: duplicate or cross-column reduction contributions are rejected',()=>{
 const s=structuredClone(makeProjectionLedger());s.events.find(e=>e.id==='sum.1.0')!.contributors=[0,0];
 assert.throws(()=>validateProjectionSemantics(s),/contributors/);
 const s2=structuredClone(makeProjectionLedger());s2.events.find(e=>e.id==='output.0')!.column=1;
 assert.throws(()=>validateProjectionSemantics(s2),/output column/);
});
test('Negative test: output without the final reduction remains semantically invalid even if timed late',()=>{
 const s=structuredClone(makeProjectionLedger());s.events.find(e=>e.id==='output.0')!.deps=['local.0.0'];
 assert.ok(validateLedger(s));
 assert.throws(()=>validateProjectionSemantics(s),/semantic dependency/);
});
