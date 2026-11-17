#!/usr/bin/env node
/**
 * Run the mutation ledger (§4.1c of audits/_MASTER-TEMPLATE.md).
 *
 * The five manual steps — invert a condition in the SOURCE, confirm the build
 * SUCCEEDS, confirm the bundle hash CHANGES, confirm the owning test FAILS,
 * restore — are a person's checklist, and a person performing them writes the
 * result down afterwards. That is where they fail. This script performs them
 * and writes what it observed, so the ledger is the run's account rather than
 * the author's.
 *
 * A KILL REQUIRES ALL FOUR RULES, and the script enforces each one:
 *
 *  1. THE OWNING COMMAND PASSED UNMUTATED IN THE SAME RUN. Every command named
 *     by a mutation is run clean once at the start. If it was already red,
 *     nothing it says under mutation means anything, and the run aborts.
 *  2. THE PATCH ACTUALLY CHANGED THE FILE. Each anchor must occur EXACTLY ONCE
 *     — zero occurrences means the source moved under the ledger, more than
 *     one means the patch is ambiguous — and the bytes on disk must differ
 *     afterwards.
 *  3. THE RUN SERVED THE MUTATED CODE. Proved two ways, because one is not
 *     enough to trust a red run: the built bundle's hash must MOVE, and the
 *     browser suites run with CI=1 so `reuseExistingServer` cannot answer from
 *     a preview server still holding the port from an earlier, unmutated run.
 *  4. A PATCH THAT DOES NOT COMPILE IS "DOES NOT BUILD" AND IS NEVER A KILL.
 *     A failed build leaves the previous good bundle in place, so the suite
 *     would pass green against code that no longer exists.
 *
 * Restoration is surgical: the original bytes of every touched file are held
 * in memory and written back, then compared, so a session that dies mid-check
 * cannot strand an inverted condition in the tree — and `--check` at the end
 * confirms the working tree is byte-identical to where it started.
 */

import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { createHash } from 'node:crypto';
import { openSync, closeSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS, MUTATIONS } from './mutations.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const LEDGER = join(ROOT, 'audits', 'MUTATION-LEDGER.md');

const only = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1].split(',').map(Number)
  : null;

function run(cmd, args, env = {}) {
  const started = Date.now();
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    out: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    seconds: ((Date.now() - started) / 1000).toFixed(1),
  };
}

/** A hash over every emitted asset — the proof that a change reached the browser. */
function bundleHash() {
  const dir = join(ROOT, 'dist', 'assets');
  const hash = createHash('sha256');
  for (const name of readdirSync(dir).sort()) {
    hash.update(name);
    hash.update(readFileSync(join(dir, name)));
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * Was this run red because the TEST bit, or because the harness fell over?
 *
 * "A kill requires the run to have served the mutated code" is not satisfied
 * by any red run whatsoever. A preview server that never started, a connection
 * refused, a browser that failed to launch — each of those goes red without a
 * single assertion having been evaluated, and counting one as a kill is how a
 * gate certifies itself against a check that never ran. It is not theoretical
 * here: a sibling lab built in the same window took this lab's port for a few
 * seconds, two mutations came back red with `Process from config.webServer was
 * not able to start`, and the first version of this script recorded both as
 * kills.
 *
 * So a red run is classified, and only a red run that reached the assertions
 * counts. Anything else is INCONCLUSIVE — reported, never counted.
 */
const HARNESS_FAILURE = [
  /webServer was not able to start/i,
  /Port \d+ is already in use/i,
  /ECONNREFUSED/,
  /browserType\.launch/i,
  /Executable doesn't exist/i,
  /Timed out waiting \d+ms from config\.webServer/i,
  /No tests found/i,
  /Cannot find module/i,
];

function harnessFailed(output) {
  const matched = HARNESS_FAILURE.find((pattern) => pattern.test(output));
  return matched ? String(matched) : null;
}

/** The first line of a runner's output that names a failure, for the ledger. */
function firstFinding(output) {
  const lines = output.split('\n');

  // Vitest and Playwright both print a summary count. How MANY tests a
  // mutation knocked over says more than which one happened to be reported
  // first — the first is an artefact of file ordering, the count is a
  // measurement of how much of the suite was standing on that line.
  const vitest = output.match(/Tests\s+(\d+) failed \| (\d+) passed/);
  const playwright = output.match(/(\d+) failed/);
  const named = lines
    .map((line) => line.match(/^\s*(?:FAIL|✘|×)\s+(.*)$/))
    .find(Boolean);
  const first = named ? named[1].trim().replace(/\s+\d+ms$/, '').slice(0, 170) : null;
  if (vitest && first) return `${vitest[1]} of ${Number(vitest[1]) + Number(vitest[2])} tests failed; first: ${first}`;
  if (playwright && first) return `${playwright[1]} failed; first: ${first}`;

  const patterns = [
    // tsc's own diagnostics first: `src/x.ts(12,3): error TS6133: ...`.
    /^(\S+\(\d+,\d+\): error TS\d+: .*)$/m,
    /^\s*(?:FAIL|✘|×)\s+(.*)$/,
    /AssertionError: (.*)$/,
    /Error: (.*)$/,
  ];
  for (const pattern of patterns) {
    for (const line of lines) {
      const m = line.match(pattern);
      if (m) return m[1].trim().slice(0, 240);
    }
  }
  return '(the command failed; see its output)';
}

function readFile(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function applyPatches(patches) {
  const originals = new Map();
  for (const patch of patches) {
    if (!originals.has(patch.file)) originals.set(patch.file, readFile(patch.file));
  }
  for (const patch of patches) {
    const before = readFile(patch.file);
    const occurrences = before.split(patch.anchor).length - 1;
    if (occurrences !== 1) {
      restore(originals);
      throw new Error(
        `anchor must occur exactly once in ${patch.file}, found ${occurrences}:\n${patch.anchor}`,
      );
    }
    const after = before.replace(patch.anchor, patch.replace);
    if (after === before) {
      restore(originals);
      throw new Error(`patch to ${patch.file} changed nothing`);
    }
    writeFileSync(join(ROOT, patch.file), after);
  }
  return originals;
}

function restore(originals) {
  for (const [file, content] of originals) {
    writeFileSync(join(ROOT, file), content);
    if (readFile(file) !== content) throw new Error(`failed to restore ${file}`);
  }
}

/**
 * Refuse to start while something else holds the Playwright port.
 *
 * This is the §4.1 trap stated as a precondition rather than discovered as a
 * confusing red run: a preview server left listening from an earlier,
 * UNMUTATED build is exactly the thing that makes a mutation check report
 * "not caught" and send someone to fix a test that works. `CI=1` below stops
 * Playwright REUSING it, which turns the hazard into a startup error — but an
 * error about a port, three screens into a long run, reads as a flake. Say it
 * here instead.
 */
/**
 * A clean working tree, or no run at all.
 *
 * "Commit the real work BEFORE mutating" is §4.1c's first hard-won rule, and
 * it is enforced here rather than remembered. It was earned in this repo: a
 * `git add -A && git commit` issued while a mutation run was live committed
 * `NEGATIVE_CLAIM = ''` — a mutation, mid-check — into main. The run restored
 * the file correctly afterwards, which is exactly what made it invisible: the
 * tree was right and only the COMMIT was wrong.
 *
 * Refusing on a dirty tree closes both halves of that. Nothing can be
 * committed from under a run, because there is nothing uncommitted to commit;
 * and the final "working tree unchanged" check below has a known-good state to
 * compare against instead of a mixture.
 */
const dirty = spawnSync('git', ['status', '--porcelain', '--', 'src', 'e2e'], {
  cwd: ROOT,
  encoding: 'utf8',
});
if ((dirty.stdout ?? '').trim() !== '') {
  console.error(
    'The working tree under src/ and e2e/ has uncommitted changes:\n\n' +
      dirty.stdout +
      '\nCommit them first. A mutation run rewrites these files and restores them afterwards, so a\n' +
      'session that dies mid-check strands an inverted condition in the tree — and a commit made\n' +
      'while a run is live captures a mutation as if it were the source. Both have happened here.',
  );
  process.exit(1);
}

/**
 * One run at a time. Two concurrent runs patch and restore the same files, so
 * each measures the other's mutations as its own baseline — which is how a
 * clean tree reports a red baseline and a kill reports a stale ledger. The
 * port probe below catches the browser half of that collision; this catches
 * the unit half, which holds no port at all.
 */
const LOCK = join(ROOT, 'node_modules', '.mutation-run.lock');
let lockFd;
try {
  lockFd = openSync(LOCK, 'wx');
} catch {
  console.error(
    `Another mutation run holds ${LOCK}. Two runs patching the same files measure each other rather\n` +
      `than the source, so this one stops. If no run is live, delete that file.`,
  );
  process.exit(1);
}
/**
 * The patches currently applied, so a killed run restores them.
 *
 * The `finally` around each mutation covers a thrown error; it does NOT cover
 * SIGTERM, and a run killed between applying a patch and restoring it leaves
 * an inverted condition in the tree. That has happened here twice under a
 * background runner that kills long jobs. So the live patch set is held here
 * and the same signal handler that releases the lock puts the files back.
 */
let liveOriginals = null;

const releaseLock = () => {
  if (liveOriginals !== null) {
    try {
      restore(liveOriginals);
      console.error('\nInterrupted mid-mutation; the patched files were restored.');
    } catch (error) {
      console.error(`\nInterrupted mid-mutation and COULD NOT RESTORE: ${error.message}`);
    }
    liveOriginals = null;
  }
  try {
    closeSync(lockFd);
    rmSync(LOCK, { force: true });
  } catch {
    /* already gone */
  }
};
process.on('exit', releaseLock);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    releaseLock();
    process.exit(130);
  });
}

const PORT = 4245;

/**
 * A CONNECT, on BOTH stacks.
 *
 * Binding is the obvious test and it is wrong here: `vite preview` listens on
 * `localhost`, which on macOS is `::1`, while a probe that binds `127.0.0.1`
 * — or `0.0.0.0`, which does not collide with an IPv6-only listener —
 * succeeds and reports the port free. That false negative cost a run: the
 * probe passed, Playwright then refused to start, and the whole thing read as
 * a flake. Connecting to each family by literal address asks the only question
 * that matters: is anything answering on this port?
 */
async function portInUse(address) {
  return new Promise((done) => {
    const socket = createConnection({ host: address, port: PORT });
    socket.setTimeout(1500);
    socket.once('connect', () => {
      socket.destroy();
      done(true);
    });
    const clear = () => {
      socket.destroy();
      done(false);
    };
    socket.once('error', clear);
    socket.once('timeout', clear);
  });
}
/**
 * Twice, a second apart, because a server that has just been killed keeps
 * accepting for a moment: its listening socket is gone but the kernel still
 * completes connections already in the backlog, so a single probe reports a
 * freshly-freed port as held. Two agreeing probes separated by a second tell
 * a live server from a dying one, and the cost of the wait is paid once per
 * run.
 */
async function anyStackHolds() {
  const held = await Promise.all([portInUse('127.0.0.1'), portInUse('::1')]);
  return held.some(Boolean);
}
/**
 * Wait for the port rather than refusing on the first look.
 *
 * Two things make a short wait the right behaviour instead of an immediate
 * stop. A server that has just been killed keeps accepting for a moment — its
 * listening socket is gone but the kernel still completes connections already
 * in the backlog — so a single probe reports a freshly-freed port as held. And
 * when a sibling lab is built in the same window, its own Playwright runs take
 * the port in bursts; MUTATION_PORT_WAIT seconds is long enough to sit one out.
 *
 * It still REFUSES at the end rather than proceeding. Running against someone
 * else's preview is the failure this guard exists to prevent, and waiting
 * politely for it would be the same mistake with better manners.
 */
const WAIT_SECONDS = Number(process.env.MUTATION_PORT_WAIT ?? 300);

/** Wait up to `WAIT_SECONDS` for the port, and report whether it came free. */
async function waitForPort(what) {
  if (!(await anyStackHolds())) return true;
  const until = Date.now() + WAIT_SECONDS * 1000;
  console.log(`  port ${PORT} is busy before ${what}; waiting up to ${WAIT_SECONDS}s`);
  while (Date.now() < until) {
    await new Promise((done) => setTimeout(done, 5000));
    if (!(await anyStackHolds())) {
      console.log(`  port ${PORT} freed`);
      return true;
    }
  }
  return false;
}

const portHeld = !(await waitForPort('the baseline'));
if (portHeld) {
  console.error(
    `Port ${PORT} is already in use. Something — most likely a \`vite preview\` left running — is\n` +
      `holding this lab's Playwright port. A mutation run against a server serving UNMUTATED code is\n` +
      `the precise failure §4.1 warns about, so this run stops here. Free the port and try again.`,
  );
  process.exit(1);
}

// ── 1. The clean baseline, in this same run ─────────────────────────────────
const selected = MUTATIONS.filter((m) => only === null || only.includes(m.id));
const neededCommands = [...new Set(selected.map((m) => m.owner))];

console.log('Baseline: building, then running every command a mutation is judged by.\n');
const baselineBuild = run('npm', ['run', 'build']);
if (!baselineBuild.ok) {
  console.error('The UNMUTATED build fails. Nothing below would mean anything.\n' + baselineBuild.out);
  process.exit(1);
}
const cleanHash = bundleHash();
console.log(`  build ok, bundle ${cleanHash}`);

/**
 * Run one owning command, waiting for the port and retrying a start failure.
 *
 * Retries are ONLY for a failure that never reached an assertion — a preview
 * server that could not bind, a browser that would not launch. A run that did
 * reach the assertions is returned as it stands, red or green: re-rolling a
 * real result until it reads the way the ledger wants is the opposite of what
 * this script is for.
 */
async function runOwning(name, what) {
  const { cmd, args, browser } = COMMANDS[name];
  if (browser) await waitForPort(what);
  let result = run(cmd, args, { CI: '1' });
  for (let attempt = 2; browser && !result.ok && harnessFailed(result.out) && attempt <= 4; attempt++) {
    console.log(`     could not start; waiting for the port, attempt ${attempt} of 4`);
    await waitForPort(`attempt ${attempt} of ${what}`);
    result = run(cmd, args, { CI: '1' });
  }
  return result;
}

const baseline = {};
for (const name of neededCommands) {
  const { label } = COMMANDS[name];
  const result = await runOwning(name, `the ${label} baseline`);
  baseline[name] = result;
  console.log(`  ${label}: ${result.ok ? 'PASS' : 'FAIL'} (${result.seconds}s)`);
  if (!result.ok) {
    console.error(
      `\nThe ${label} is RED before any mutation. Rule 1 of a kill is that the owning command passed\n` +
        `unmutated in the same run, so this run is abandoned rather than reported.\n`,
    );
    console.error(result.out.slice(-4000));
    process.exit(1);
  }
}

// ── 2. Each mutation ────────────────────────────────────────────────────────
const records = [];
for (const mutation of selected) {
  process.stdout.write(`\n[${mutation.id}] ${mutation.title}\n`);
  let originals;
  try {
    originals = applyPatches(mutation.patches);
    liveOriginals = originals;
  } catch (error) {
    records.push({ mutation, outcome: 'LEDGER-STALE', detail: String(error.message) });
    console.log(`     LEDGER STALE — ${error.message}`);
    continue;
  }

  try {
    const build = run('npm', ['run', 'build']);
    if (!build.ok) {
      // Rule 4. A failed build serves the previous bundle, so a green suite
      // here would prove nothing at all. The compiler's own words go in the
      // ledger: "the build failed" is not a finding anyone can act on.
      const why = firstFinding(build.out);
      records.push({ mutation, outcome: 'DOES-NOT-BUILD', detail: why });
      console.log(`     DOES NOT BUILD — ${why}\n${build.out.trim().split('\n').slice(-12).join('\n')}`);
      continue;
    }
    const mutatedHash = bundleHash();
    if (mutatedHash === cleanHash) {
      // Rule 3. The patch compiled to the same bytes, so whatever the suite
      // says next, it did not say it about this mutation.
      records.push({ mutation, outcome: 'UNREACHED', detail: `bundle hash did not move from ${cleanHash}` });
      console.log(`     UNREACHED — the bundle hash did not move`);
      continue;
    }

    const { label } = COMMANDS[mutation.owner];
    const result = await runOwning(mutation.owner, `mutation [${mutation.id}]`);
    const harness = result.ok ? null : harnessFailed(result.out);
    if (harness !== null) {
      // Red, but not from an assertion. Rule 3 is not satisfied: nothing was
      // measured, so nothing may be claimed.
      records.push({
        mutation,
        outcome: 'INCONCLUSIVE',
        detail: `the ${label} failed before reaching its assertions (${harness}) — not a kill`,
      });
      console.log(`     INCONCLUSIVE — the ${label} never ran: ${firstFinding(result.out)}`);
      continue;
    }
    if (result.ok) {
      records.push({
        mutation,
        outcome: 'SURVIVED',
        detail: `${label} still passed with the mutation in the bundle (${mutatedHash})`,
      });
      console.log(`     SURVIVED — ${label} still passed (${result.seconds}s)`);
    } else {
      records.push({
        mutation,
        outcome: 'KILLED',
        detail: `${label} failed: ${firstFinding(result.out)}`,
        bundle: `${cleanHash} -> ${mutatedHash}`,
        seconds: result.seconds,
      });
      console.log(`     KILLED by the ${label} (${result.seconds}s) — ${firstFinding(result.out)}`);
    }
  } finally {
    restore(originals);
    liveOriginals = null;
  }
}

// ── 3. Restore, and prove it ────────────────────────────────────────────────
const finalBuild = run('npm', ['run', 'build']);
const finalHash = finalBuild.ok ? bundleHash() : '(build failed)';
const restored = finalHash === cleanHash;
console.log(
  `\nRestored: bundle ${finalHash} ${restored ? '== the pre-mutation hash' : '!= the pre-mutation hash'}`,
);
const status = run('git', ['status', '--porcelain', '--', 'src', 'e2e']);
const treeClean = status.out.trim() === '';
console.log(`Working tree under src/ and e2e/: ${treeClean ? 'unchanged' : 'DIRTY —\n' + status.out}`);

// ── 4. The ledger, written by the thing that ran it ─────────────────────────
const stamp = new Date().toISOString().slice(0, 10);
const lines = [
  '# Mutation ledger — crypto-lab-pseudorandom-code',
  '',
  '<!-- GENERATED BY scripts/mutation.mjs. Do not edit by hand: every `observed`',
  '     line below was written by the run that produced it, which is the whole',
  '     point of §4.1c. Re-run with `npm run mutation`. -->',
  '',
  `Run ${stamp}. Unmutated bundle \`${cleanHash}\`; after restoring, \`${finalHash}\`` +
    `${restored ? ' — identical.' : ' — NOT identical, investigate before trusting anything here.'}`,
  '',
  'A kill requires all four rules: the owning command passed unmutated in this same run; the patch',
  'changed the file (its anchor occurring exactly once); the built bundle hash moved, and the browser',
  'suites ran with `CI=1` so no reused preview server could answer from unmutated code; and a patch',
  'that does not compile is DOES NOT BUILD and is never a kill.',
  '',
  '| # | Mutation | Judged by | Outcome | Observed |',
  '|---|---|---|---|---|',
];
for (const record of records) {
  const { mutation, outcome, detail } = record;
  lines.push(
    `| ${mutation.id} | ${mutation.title} | ${COMMANDS[mutation.owner].label} | **${outcome}** | ` +
      `${detail.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`,
  );
}
lines.push('', '## Why each mutation is in the ledger', '');
for (const mutation of MUTATIONS) {
  lines.push(`**${mutation.id}. ${mutation.title}** — ${mutation.why}`, '');
  for (const patch of mutation.patches) {
    lines.push(`- \`${patch.file}\``);
  }
  lines.push('');
}
lines.push(
  '---',
  '',
  '*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*',
  '',
);
writeFileSync(LEDGER, lines.join('\n'));
console.log(`\nLedger written to audits/MUTATION-LEDGER.md`);

const notKilled = records.filter((r) => r.outcome !== 'KILLED');
if (notKilled.length > 0 || !restored || !treeClean) {
  console.error(
    `\n${notKilled.length} mutation(s) were not killed. A surviving mutation is REPORTED, not explained away.`,
  );
  for (const r of notKilled) console.error(`  [${r.mutation.id}] ${r.outcome}: ${r.detail}`);
  process.exit(1);
}
console.log(`\nAll ${records.length} mutations killed.`);
