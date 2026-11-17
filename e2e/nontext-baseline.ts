/**
 * Known WCAG 1.4.11 / generated-content findings in this lab, captured through
 * the gate's own path so the baseline and the check cannot disagree.
 *
 * THIS FILE IS A TO-DO LIST, NOT A SET OF EXEMPTIONS. The gate ratchets on it:
 *   - a finding NOT listed here fails the run, so a regression cannot land;
 *   - a listed finding whose ratio gets WORSE fails, so the list cannot rot;
 *   - a listed finding that no longer appears ALSO fails, so a fixed entry must
 *     be deleted and the file can only shrink toward empty.
 * The last rule is what stops an allowlist becoming a permanent exemption.
 *
 * `unverified: true` marks an absolutely-positioned pseudo-element. It can paint
 * outside its host and the oracle measures it against the host's backdrop, so
 * that ratio is NOT trustworthy — hand-measure before acting on it.
 *
 * IT IS EMPTY, AND THAT IS THE POINT — this is the terminal state of the
 * ratchet, not an unrun check. It was captured through the gate's own path
 * with `NT_BASELINE_CAPTURE=1` set, over every driven state, and the capture
 * printed nothing: this lab's controls were authored against §4.2 from the
 * start rather than fixed afterwards. The shapes that would otherwise land
 * here are the ones the stylesheet comments call out by name — `.btn-primary`
 * and `.tab-btn.active` take an `--accent-ink` border rather than painting
 * their edge the same colour as their own fill; every button, select and
 * hovered tab takes `--control-border` rather than the decorative `--border`;
 * and the histogram legend's `.swatch` squares carry an edge because an
 * accent-filled 0.7rem square with no border is a 1.4.11 case on its own.
 */
export const NONTEXT_BASELINE: Record<
  string,
  { ratio: number; required: number; unverified: boolean }
> = {};
