/**
 * The mutation ledger: every mutation as a CONCRETE PATCH, never as a sentence
 * describing an edit.
 *
 * §4.1c of audits/_MASTER-TEMPLATE.md. A sentence describing a mutation cannot
 * be replayed, and a paragraph describing a run is the author's side of the
 * claim rather than the run's. So each entry below names a file, an anchor
 * that must occur EXACTLY ONCE in it, and the replacement — and
 * `scripts/mutation.mjs` applies them, builds, runs the owning command, and
 * writes what it observed.
 *
 * The nine numbered mutations are the ones the build brief requires. Two more
 * are here because the brief's own standards demand them: one degrades a
 * colour token the accessibility gate owns (a gate is worth what a mutation
 * proves), and one deletes the negative-claim sentence (§4.1d: delete the
 * text and assertion 3 must fail, or the negative-claim test is decorative).
 */

/**
 * Commands a mutation can be judged by. Each is run clean first, in the same
 * run. `browser: true` marks the ones that need this lab's Playwright port, so
 * the runner can wait for it rather than reading a collision as a result.
 */
export const COMMANDS = {
  unit: { cmd: 'npx', args: ['vitest', 'run'], label: 'npm test (Vitest)', browser: false },
  claims: {
    cmd: 'npx',
    args: ['playwright', 'test', '--project=claims'],
    label: 'claims suite',
    browser: true,
  },
  a11y: {
    cmd: 'npx',
    args: ['playwright', 'test', '--project=a11y'],
    label: 'accessibility gate',
    browser: true,
  },
};

export const MUTATIONS = [
  {
    id: 1,
    title: 's_i is sampled with weight t instead of t - 1',
    why:
      'The construction appends the sum of t - 1 rows of G0 and then gives the check a unit column ' +
      'of its own, for a row weight of t. Sampling t of them makes the sparse vector and the parity ' +
      'check disagree about which rows were summed.',
    owner: 'unit',
    expect: 'killed',
    patches: [
      {
        file: 'src/prc/keygen.ts',
        anchor: 'const s = sampleDistinct(k, t - 1, pool, stream);',
        replace: 'const s = sampleDistinct(k, t, pool, stream);',
      },
    ],
  },
  {
    id: 2,
    title: "the unit entry of P's row is omitted, so P G != 0",
    why:
      'Without its own column, a check sums the s_i rows of G0 and stops — which is the appended row ' +
      'itself, not zero. This is the one line that makes P G = 0 rather than P G = (the appended row).',
    owner: 'unit',
    expect: 'killed',
    patches: [
      {
        file: 'src/prc/keygen.ts',
        anchor: 'P[pBase + t - 1] = appended;',
        replace: 'P[pBase + t - 1] = P[pBase];',
      },
    ],
  },
  {
    id: 3,
    title: "the permutation is applied to G's rows but not to P's columns",
    why:
      'Permuting the positions has to move the rows of G and the columns of P together. Moving only ' +
      'the rows leaves every check pointing at whatever landed in its old slots.',
    owner: 'unit',
    expect: 'killed',
    patches: [
      {
        file: 'src/prc/keygen.ts',
        anchor: 'P[pBase + a] = perm[info];',
        replace: 'P[pBase + a] = info;',
      },
      {
        file: 'src/prc/keygen.ts',
        anchor: 'P[pBase + t - 1] = appended;',
        replace: 'P[pBase + t - 1] = k + i;',
      },
    ],
  },
  {
    id: 4,
    title: 'the pad z is left out of decoding',
    why:
      'Decode computes wt(P (x + z)). Drop z and the all-zero string decodes for every key — which is ' +
      'exactly the hole Christ & Gunn added the pad to close.',
    owner: 'unit',
    expect: 'killed',
    patches: [
      // The pad is replaced by an all-zero one rather than deleted from the
      // XOR: dropping the term outright leaves `z` destructured and unused,
      // which `noUnusedLocals` turns into a compile error — and a mutation
      // that does not build proves nothing, because the suite then runs
      // against the previous bundle.
      {
        file: 'src/prc/code.ts',
        anchor: '  const { P, t, r, z } = sk;\n  let unsatisfied = 0;',
        replace:
          '  const { P, t, r } = sk;\n' +
          '  const z = new Uint32Array((sk.n + 31) >>> 5);\n' +
          '  let unsatisfied = 0;',
      },
    ],
  },
  {
    id: 5,
    title: 'the acceptance threshold uses r^(-1/2) instead of r^(-1/4)',
    why:
      'Lemma 4 of 2024/235 fixes zeta at r^(-1/4). r^(-1/2) moves the line from 0.375 r to 0.484 r, ' +
      'which is close enough to r/2 that random strings start decoding.',
    owner: 'unit',
    expect: 'killed',
    patches: [
      {
        file: 'src/prc/params.ts',
        anchor: 'return (0.5 - Math.pow(r, -0.25)) * r;',
        replace: 'return (0.5 - Math.pow(r, -0.5)) * r;',
      },
    ],
  },
  {
    id: 6,
    title: 'the distinguisher reads the secret key',
    why:
      'Invariant 2: exhibit 5 is given (G, z) and the string only. The patch widens the signature to ' +
      'accept P and pairs positions that share a parity check — read from the SECRET key — instead of ' +
      'positions carrying identical rows of G. The claims suite re-derives that panel from the public ' +
      'half alone, so a panel that started consulting P would have to coincide with it.',
    owner: 'claims',
    expect: 'killed',
    patches: [
      {
        file: 'src/prc/weak.ts',
        anchor:
          'export function findRepeatedRows(pk: PublicKey): RepeatedRows {\n  const { n, G, wordsPerRow } = pk;',
        replace:
          'export function findRepeatedRows(pk: PublicKey & { P?: Int32Array; t?: number }): RepeatedRows {\n' +
          '  if (pk.P !== undefined && pk.t !== undefined) {\n' +
          '    const pairs: number[] = [];\n' +
          '    for (let i = 0; i + 1 < pk.P.length; i += pk.t) pairs.push(pk.P[i], pk.P[i + 1]);\n' +
          '    const flat = Int32Array.from(pairs);\n' +
          '    return { groups: [], pairs: flat, comparisons: flat.length / 2, distinctRows: pk.n };\n' +
          '  }\n' +
          '  const { n, G, wordsPerRow } = pk;',
      },
      {
        file: 'src/ui/weakPanel.ts',
        anchor: 'const repeated = findRepeatedRows(key.pk);',
        replace: 'const repeated = findRepeatedRows({ ...key.pk, P: key.sk.P, t: key.sk.t });',
      },
    ],
  },
  {
    id: 7,
    title: "the distinguisher's verdict is set when comparisons exist, not from the agreement",
    why:
      'A weak key means the attack HAS evidence to look at; it does not mean every string is a ' +
      'codeword. Setting the verdict from the existence of comparisons flags uniformly random strings ' +
      'at 100%.',
    owner: 'unit',
    expect: 'killed',
    patches: [
      {
        file: 'src/prc/weak.ts',
        anchor: 'const flagged = enough && agreement > limit;',
        replace: 'const flagged = comparisons > 0;',
      },
    ],
  },
  {
    id: 8,
    title: 'the weak-key probability is computed with N = C(k, t)',
    why:
      'Each appended row sums t - 1 rows of G0; the t-th entry of the check is its own unit column, ' +
      'which is not a row of G0 at all. C(k, t) is a bigger urn, so every weak-key probability in the ' +
      'table comes out too small.',
    owner: 'unit',
    expect: 'killed',
    patches: [
      {
        file: 'src/prc/params.ts',
        anchor: 'return binomial(k, t - 1);',
        replace: 'return binomial(k, t);',
      },
    ],
  },
  {
    id: 9,
    title: 'acceptance uses <= on a syndrome weight over only the first half of the checks',
    why:
      'Half the checks means half the expected weight against an unchanged threshold, so everything ' +
      'decodes — codewords, random strings, anything.',
    owner: 'unit',
    expect: 'killed',
    patches: [
      {
        file: 'src/prc/code.ts',
        anchor: '  const weight = syndromeWeight(sk, x);\n  const limit = threshold(sk.r);',
        replace:
          '  const weight = syndromeWeight({ ...sk, r: Math.floor(sk.r / 2) }, x);\n  const limit = threshold(sk.r);',
      },
      {
        file: 'src/prc/code.ts',
        anchor: 'return { weight, threshold: limit, accepted: weight < limit, checks: sk.r };',
        replace: 'return { weight, threshold: limit, accepted: weight <= limit, checks: sk.r };',
      },
    ],
  },
  {
    id: 10,
    title: 'the muted text token is degraded below 4.5:1',
    why:
      'A gate is worth exactly what a mutation proves. --text-dim carries every explanatory paragraph ' +
      'on the page; dropping its lightness to #5a6472 puts it at about 3.4:1 on the page background, ' +
      'under the 4.5:1 SC 1.4.3 needs. axe cannot see most of this page’s surfaces, so the kill has ' +
      'to come from the arithmetic contrast walk in e2e/contrast.ts.',
    owner: 'a11y',
    expect: 'killed',
    patches: [
      {
        file: 'src/style.css',
        anchor: '  --text-dim: #b3bdc8; /* muted by lower lightness, never by opacity */',
        replace: '  --text-dim: #5a6472; /* MUTATION: degraded below 4.5:1 */',
      },
    ],
  },
  {
    id: 11,
    title: 'the negative-claim sentence is deleted from the page',
    why:
      '§4.1d: delete the negative-claim text and assertion 3 must fail. A negative-claim test that ' +
      'survives its own text being removed is decorative.',
    owner: 'claims',
    expect: 'killed',
    patches: [
      {
        file: 'src/ui/weakPanel.ts',
        anchor:
          "export const NEGATIVE_CLAIM =\n" +
          "  'Passing the randomness checks on this page says nothing about whether these strings can be told ' +\n" +
          "  'from noise: for this key, anyone holding the public key can tell, without the secret.';",
        replace: "export const NEGATIVE_CLAIM = '';",
      },
    ],
  },
];
