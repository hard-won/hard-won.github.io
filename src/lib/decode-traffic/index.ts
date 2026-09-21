/**
 * The shared semantic source for the decode-traffic Note.
 *
 * The prose in `src/content/notes/decode-step-as-traffic.mdx`, the three
 * static plates in `src/components/plates/` and `tests/reference.test.ts`
 * all read their facts from here. A number that appears in the article and
 * not in this module is a number nothing checks.
 *
 * Everything here is a nominal, pure-function teaching model: no DOM, no
 * side effects, no measurement, no hardware simulation.
 */

export * from './traffic-model.ts';
export * from './event-model.ts';
