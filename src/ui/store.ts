/**
 * The one key in play, and who to tell when it changes.
 *
 * Every exhibit reads the SAME key. That is a teaching decision before it is
 * an architectural one: a lab where exhibit 2 accepted a codeword from one key
 * while exhibit 5 found repeated rows in another would invite the reader to
 * compare two numbers that were never about the same object.
 *
 * It also makes retirement simple and total. Changing n, t or eta, or pressing
 * Generate, bumps `serial`; every panel re-renders from the new state and
 * every verdict on screen belongs to the controls currently on screen.
 */

import { type KeyPair, deserializeKey } from '../prc/keygen.js';
import { type Params, makeParams } from '../prc/params.js';
import { PrcEngine } from '../prc/workerClient.js';

export interface LabState {
  readonly params: Params;
  readonly key: KeyPair | null;
  readonly verifiedChecks: number;
  readonly status: 'generating' | 'ready' | 'error';
  readonly error: string | null;
  /** Increments whenever the key or any parameter changes. */
  readonly serial: number;
  /** Set when the last change was eta alone, so panels can say the key is the same. */
  readonly sameKeyAs: number | null;
}

type Listener = (state: LabState) => void;

const DEFAULTS = { n: 4096, t: 3, eta: 0.05 };

export class LabStore {
  readonly engine = new PrcEngine();
  private listeners: Listener[] = [];
  private state: LabState = {
    params: makeParams(DEFAULTS),
    key: null,
    verifiedChecks: 0,
    status: 'generating',
    error: null,
    serial: 0,
    sameKeyAs: null,
  };
  /** Guards against an older keygen reply overwriting a newer one. */
  private generation = 0;

  get current(): LabState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(next: Partial<LabState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners.slice()) listener(this.state);
  }

  /** Generate a new key for the current parameters, or for new ones. */
  async regenerate(changes: Partial<{ n: number; t: number; eta: number }> = {}): Promise<void> {
    const { n, t, eta } = { ...this.state.params, ...changes };
    const generation = ++this.generation;
    let params: Params;
    try {
      params = makeParams({ n, t, eta });
    } catch (error) {
      // A refused parameter set is reported and the previous key is left
      // alone: discarding a good key because a control was typed into badly
      // would lose the reader's place as well as their evidence.
      this.emit({ status: 'error', error: error instanceof Error ? error.message : String(error) });
      return;
    }
    this.emit({ params, status: 'generating', error: null, key: null, sameKeyAs: null });
    try {
      const result = await this.engine.generateKey(params.n, params.t, params.eta);
      if (generation !== this.generation) return; // superseded
      this.emit({
        key: deserializeKey(result.key),
        verifiedChecks: result.verifiedChecks,
        status: 'ready',
        error: null,
        serial: this.state.serial + 1,
        sameKeyAs: null,
      });
    } catch (error) {
      if (generation !== this.generation) return;
      this.emit({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Change the noise rate on the SAME key.
   *
   * The serial still moves, because every verdict on screen was measured at
   * the old rate and is now stale — but `sameKeyAs` records that the matrices
   * did not change, which is what lets the key panel say so.
   */
  async setEta(eta: number): Promise<void> {
    if (this.state.key === null) return this.regenerate({ eta });
    const generation = ++this.generation;
    let params: Params;
    try {
      params = makeParams({ ...this.state.params, eta });
    } catch (error) {
      this.emit({ status: 'error', error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const previousSerial = this.state.serial;
    try {
      const result = await this.engine.setEta(params.eta);
      if (generation !== this.generation) return;
      this.emit({
        params,
        key: deserializeKey(result.key),
        verifiedChecks: result.verifiedChecks,
        status: 'ready',
        error: null,
        serial: previousSerial + 1,
        sameKeyAs: previousSerial,
      });
    } catch (error) {
      if (generation !== this.generation) return;
      this.emit({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }

  /** The key, or a throw. Panels only render their evidence when it is ready. */
  requireKey(): KeyPair {
    if (this.state.key === null) throw new Error('No key is loaded.');
    return this.state.key;
  }
}

export const store = new LabStore();
