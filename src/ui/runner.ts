/**
 * The shared run control: a button, a live progress line, and a cancel.
 *
 * Three exhibits run trials and all three need the same three things, but more
 * importantly they need the same DISCIPLINE: a run reports the number of runs
 * it came from, a cancelled run leaves no partial counts rendered, and a run
 * whose key changed underneath it is discarded rather than drawn under the new
 * parameters.
 */

import { EngineCancelled } from '../prc/workerClient.js';
import type { TrialResult, TrialSpec } from '../prc/trials.js';
import { h, num } from './dom.js';
import { store } from './store.js';

export interface RunControl {
  readonly element: HTMLElement;
  /** Disable the button while no key is loaded. */
  setEnabled(enabled: boolean): void;
  /** Start a run as if the button had been pressed. */
  trigger(): void;
}

export function createRunControl(opts: {
  id: string;
  label: string;
  spec: () => TrialSpec;
  onResult: (result: TrialResult, serial: number) => void;
  onCleared: () => void;
  extraControls?: HTMLElement[];
}): RunControl {
  const progress = h('span', { class: 'progress-text', role: 'status', 'aria-live': 'polite' });
  const cancel = h(
    'button',
    { type: 'button', class: 'btn btn-ghost', id: `${opts.id}-cancel`, hidden: true },
    'Cancel',
  ) as HTMLButtonElement;
  const run = h('button', { type: 'button', class: 'btn btn-primary', id: `${opts.id}-run` }, opts.label) as HTMLButtonElement;

  cancel.addEventListener('click', () => {
    store.engine.cancel();
    progress.textContent = 'Cancelling at the end of the current chunk…';
  });

  run.addEventListener('click', async () => {
    const spec = opts.spec();
    // The serial at the moment the run STARTED. If the key changes while the
    // worker is running, the result belongs to a key that is no longer on
    // screen and is dropped rather than rendered.
    const serial = store.current.serial;
    run.disabled = true;
    cancel.hidden = false;
    opts.onCleared();
    progress.textContent = `Running 0 of ${num(spec.trials)} trials…`;
    try {
      const result = await store.engine.runTrials(spec, (done, total) => {
        progress.textContent = `Running ${num(done)} of ${num(total)} trials…`;
      });
      if (store.current.serial !== serial) {
        progress.textContent = 'The key changed while that run was in flight, so its counts were discarded.';
        return;
      }
      progress.textContent = `Done: ${num(result.codeword.trials)} codewords${
        result.random ? ` and ${num(result.random.trials)} random strings` : ''
      }.`;
      opts.onResult(result, serial);
    } catch (error) {
      if (error instanceof EngineCancelled) {
        // No partial counts: a rate quoted from an unknown number of runs is
        // worse than no rate at all.
        progress.textContent = 'Cancelled. No partial counts were kept.';
        return;
      }
      progress.textContent = `The run failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      run.disabled = store.current.key === null;
      cancel.hidden = true;
    }
  });

  const element = h(
    'div',
    { class: 'run-row' },
    run,
    ...(opts.extraControls ?? []),
    cancel,
    progress,
  );

  return {
    element,
    setEnabled(enabled: boolean): void {
      run.disabled = !enabled;
      if (!enabled) progress.textContent = '';
    },
    trigger(): void {
      // Through the real button, so an automatic first run takes exactly the
      // same path a reader's click takes — including the disable, the cancel
      // button, the progress line and the serial check.
      if (!run.disabled) run.click();
    },
  };
}
