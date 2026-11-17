/**
 * The main thread's side of the worker.
 *
 * Only this file and `trials.worker.ts` know that a worker exists. Everything
 * in `src/prc/` apart from these two is a pure function of its arguments,
 * which is what lets the whole engine be unit-tested without a DOM or a worker
 * at all.
 *
 * One rule governs the protocol: a response is matched to its request by ID,
 * and a response whose ID is not the current one is DROPPED. Without that, a
 * learner who changes t while a 2,000-trial run is in flight gets the old
 * run's numbers rendered under the new parameters.
 */

import type { SerializedKey } from './keygen.js';
import type { TrialResult, TrialSpec } from './trials.js';
import type { WorkerRequest, WorkerResponse } from './trials.worker.js';

export interface KeyResult {
  readonly key: SerializedKey;
  readonly verifiedChecks: number;
}

export class EngineCancelled extends Error {
  constructor() {
    super('The run was cancelled.');
    this.name = 'EngineCancelled';
  }
}

interface Pending {
  resolve: (value: never) => void;
  reject: (error: Error) => void;
  onProgress?: (done: number, total: number) => void;
}

export class PrcEngine {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private inFlightTrials: number | null = null;

  constructor() {
    this.worker = new Worker(new URL('./trials.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.receive(event.data);
    this.worker.onerror = (event) => {
      // A worker that fails to load rejects every outstanding request rather
      // than leaving the page spinning on a promise that can never settle.
      const message = event.message || 'The computation worker failed to start.';
      for (const [, entry] of this.pending) entry.reject(new Error(message));
      this.pending.clear();
    };
  }

  private receive(response: WorkerResponse): void {
    const entry = this.pending.get(response.id);
    if (entry === undefined) return; // a superseded request: drop it
    switch (response.kind) {
      case 'progress':
        entry.onProgress?.(response.done, response.total);
        return;
      case 'key':
        this.pending.delete(response.id);
        entry.resolve({ key: response.key, verifiedChecks: response.verifiedChecks } as never);
        return;
      case 'trials-done':
        this.pending.delete(response.id);
        if (this.inFlightTrials === response.id) this.inFlightTrials = null;
        entry.resolve(response.result as never);
        return;
      case 'cancelled':
        this.pending.delete(response.id);
        if (this.inFlightTrials === response.id) this.inFlightTrials = null;
        entry.reject(new EngineCancelled());
        return;
      case 'error':
        this.pending.delete(response.id);
        if (this.inFlightTrials === response.id) this.inFlightTrials = null;
        entry.reject(new Error(response.message));
        return;
    }
  }

  private send<T>(request: WorkerRequest, onProgress?: (done: number, total: number) => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.set(request.id, { resolve: resolve as (value: never) => void, reject, onProgress });
      this.worker.postMessage(request);
    });
  }

  /** Generate a fresh key. The worker verifies P G = 0 before replying. */
  generateKey(n: number, t: number, eta: number): Promise<KeyResult> {
    const id = this.nextId++;
    return this.send<KeyResult>({ kind: 'keygen', id, n, t, eta });
  }

  /** Change the noise rate WITHOUT resampling the key. */
  setEta(eta: number): Promise<KeyResult> {
    const id = this.nextId++;
    return this.send<KeyResult>({ kind: 'set-eta', id, eta });
  }

  /**
   * Run trials. Rejects with `EngineCancelled` if `cancel()` lands first.
   *
   * Any run already in flight is cancelled: two overlapping runs would render
   * two sets of counts into the same panel in whatever order they finished.
   */
  runTrials(spec: TrialSpec, onProgress?: (done: number, total: number) => void): Promise<TrialResult> {
    this.cancel();
    const id = this.nextId++;
    this.inFlightTrials = id;
    return this.send<TrialResult>({ kind: 'trials', id, spec }, onProgress);
  }

  /** Ask the worker to stop the current run at the next chunk boundary. */
  cancel(): void {
    if (this.inFlightTrials === null) return;
    this.worker.postMessage({ kind: 'cancel', id: this.inFlightTrials } satisfies WorkerRequest);
  }

  get busy(): boolean {
    return this.inFlightTrials !== null;
  }
}
