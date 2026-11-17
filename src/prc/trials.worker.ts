/**
 * The worker: key generation and trial runs, cancellable.
 *
 * Both are real work — a key at n = 8192, t = 8 samples 8,110 sparse vectors
 * and then verifies 8,110 parity checks in full, and a 2,000-trial sweep
 * encodes 2,000 codewords and decodes 4,000 strings. On the main thread either
 * would freeze the page, and a learner who changed their mind mid-run would
 * have no way to say so.
 *
 * Cancellation is why the trial loop is a generator. A `for` loop inside one
 * message handler cannot be interrupted no matter how often it checks a flag,
 * because the `cancel` message is still sitting in the queue waiting for that
 * handler to return. Driving the generator one chunk per macrotask returns to
 * the event loop between chunks, so the flag is set by the time it is read.
 */

import {
  type KeyPair,
  type SerializedKey,
  deserializeKey,
  generateKey,
  serializeKey,
  withEta,
} from './keygen.js';
import { ParameterError, makeParams } from './params.js';
import { type TrialResult, type TrialSpec, runTrials } from './trials.js';

export type WorkerRequest =
  | { kind: 'keygen'; id: number; n: number; t: number; eta: number }
  | { kind: 'set-eta'; id: number; eta: number }
  | { kind: 'trials'; id: number; spec: TrialSpec }
  | { kind: 'cancel'; id: number };

export type WorkerResponse =
  | { kind: 'key'; id: number; key: SerializedKey; verifiedChecks: number }
  | { kind: 'progress'; id: number; done: number; total: number }
  | { kind: 'trials-done'; id: number; result: TrialResult }
  | { kind: 'cancelled'; id: number }
  | { kind: 'error'; id: number; message: string };

let current: KeyPair | null = null;
const cancelled = new Set<number>();

function post(message: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}

function pump(id: number, iterator: Generator<{ done: number; total: number }, TrialResult>): void {
  if (cancelled.has(id)) {
    cancelled.delete(id);
    post({ kind: 'cancelled', id });
    return;
  }
  let step: IteratorResult<{ done: number; total: number }, TrialResult>;
  try {
    step = iterator.next();
  } catch (error) {
    post({ kind: 'error', id, message: error instanceof Error ? error.message : String(error) });
    return;
  }
  if (step.done) {
    post({ kind: 'trials-done', id, result: step.value });
    return;
  }
  post({ kind: 'progress', id, done: step.value.done, total: step.value.total });
  // Back to the event loop, so a cancel sent during this chunk is delivered
  // before the next one starts.
  setTimeout(() => pump(id, iterator), 0);
}

self.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  const request = event.data;
  try {
    switch (request.kind) {
      case 'keygen': {
        const params = makeParams({ n: request.n, t: request.t, eta: request.eta });
        // generateKey refuses to return a key whose P G is not zero, so by the
        // time this line runs the invariant has been checked over all r rows.
        current = generateKey(params);
        const { payload, transfer } = serializeKey(current);
        post({ kind: 'key', id: request.id, key: payload, verifiedChecks: params.r }, transfer);
        return;
      }
      case 'set-eta': {
        if (current === null) throw new Error('No key has been generated yet.');
        // The matrices are untouched: eta is an encoder parameter.
        current = withEta(current, makeParams({ ...current.params, eta: request.eta }).eta);
        const { payload, transfer } = serializeKey(current);
        post({ kind: 'key', id: request.id, key: payload, verifiedChecks: current.params.r }, transfer);
        return;
      }
      case 'trials': {
        if (current === null) throw new Error('No key has been generated yet.');
        cancelled.delete(request.id);
        pump(request.id, runTrials(current, request.spec));
        return;
      }
      case 'cancel': {
        cancelled.add(request.id);
        return;
      }
    }
  } catch (error) {
    const message =
      error instanceof ParameterError || error instanceof Error ? error.message : String(error);
    post({ kind: 'error', id: request.id, message });
  }
};

// Re-exported so the client and the worker cannot drift on the shape of a key.
export { deserializeKey };
