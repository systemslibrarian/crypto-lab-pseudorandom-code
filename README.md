# Pseudorandom Code

**A watermark that should look random · sparse parity checks · weak keys**

Browser-based pseudorandom error-correcting code — strings meant to look random to everyone yet be
recognised by the key holder after bit flips, built from sparse parity checks as its 2024 paper
defines it, then the 2025 observation that at practical sizes the public key itself contains
repeated rows that let anyone tell a codeword from noise.

**Live demo:** https://systemslibrarian.github.io/crypto-lab-pseudorandom-code/

---

## What It Is

A **pseudorandom error-correcting code** (PRC) is an error-correcting code with a strange extra
requirement: any polynomial number of its codewords must look random to anyone without the key,
while the key holder can still recognise a codeword after a constant fraction of its bits have been
flipped. The two requirements pull against each other — error-correcting codes are built out of
redundancy and pseudorandomness is the absence of discernible structure — which is why the primitive
is interesting at all. It is the cryptographic core of an *undetectable* watermark: a scheme whose
marked outputs are computationally indistinguishable from unmarked ones.

This lab implements the **zero-bit public-key LDPC pseudorandom code** of Miranda Christ and Sam
Gunn, *Pseudorandom Error-Correcting Codes* (CRYPTO 2024; IACR ePrint 2024/235) — its Construction 2
with the key distribution of its section 2.2 overview, restated with its permutation as Algorithm 1
of the cryptanalysis paper below. "Zero-bit" means the detector answers one question: *is this one of
mine?* That is all a watermark needs.

- **Secret key:** a parity-check matrix `P`, `r = ⌊0.99n⌋` rows, each of weight exactly `t`, plus a
  one-time pad `z`.
- **Public key:** a generator matrix `G` of shape `n × g` with `P·G = 0`, plus the same `z`.
- **Encode:** draw a seed `u` and Bernoulli(η) noise `e`; emit `G·u ⊕ z ⊕ e`.
- **Decode:** accept iff `wt(P·(x ⊕ z)) < (1/2 − r^(−1/4))·r`. Because `P·G = 0`, the seed cancels
  and the syndrome reads the noise.

It then implements **Attack-II** of Tianrui Wang, Anyu Wang, Tianshuo Cong, Delong Ran, Jinyuan Liu
and Xiaoyun Wang, *Cryptanalysis of LDPC-Based Pseudorandom Error-Correcting Codes* (IACR ePrint
2025/2283), section 4.2. Every appended row of `G` is the sum of `t − 1` rows of `G0`, so there are
only `C(k, t−1)` rows it could be — against `r` of them. At `n = 4096, t = 3` that is 820
possibilities for 4,055 rows, so rows repeat by pigeonhole before any birthday argument is needed,
and two positions carrying the same row of `G` agree in a codeword with probability
`1/2 + (1−2η)²/2` instead of `1/2`. Anyone holding the public key can find them by hashing and count.

**Sizes run here:** `n ∈ {4096, 8192}`, `t ∈ {3…8}`, `g = 64`, `η ∈ [0, 0.25]`. One attack is built:
Attack-II. **Not production crypto — a teaching demo at toy sizes.** The parameters are chosen so a
key generates and three hundred trials run inside a browser tab, not so anything here is secure.

---

## Exhibits

1. **Keys.** Generate `(P, G, z)` in a Web Worker. `P·G = 0` is verified over every one of the
   `r` parity checks before the key is used, and the verdict says so. One real check is stepped
   through: XOR the rows of `G` at its first `t − 1` positions and compare, byte for byte, against
   the row at its last — they are equal, which is why that check annihilates every codeword. A few
   sparse rows of `P` are shown as column indices with each check's own unit column marked, and a
   table counts how many checks each position sits in.
2. **Encode and detect.** A codeword and a uniformly random string side by side, each with its
   syndrome weight against the threshold and a verdict. Then the same question over 300 of each,
   with the counts and the number of runs beside them.
3. **Robustness.** A substitution-rate slider. The page predicts the composed noise rate
   `η′ = η + δ − 2ηδ` and the mean syndrome weight before you run, then measures acceptance over 300
   codewords. The syndrome-weight histogram carries the exhibit's real finding and has a text table
   beside it.
4. **Does it look random?** The frequency (monobit) and runs tests of NIST SP 800-22 Rev 1a on the
   codeword and on a random string. Both read unremarkable for both — and the page states plainly
   that this shows nothing about pseudorandomness.
5. **The public key gives it away.** Find the repeated rows of `G` by hashing, show the comparisons
   with the bits they compare, and run the distinguisher on a codeword and on a random string. This
   exhibit uses the public key only: the function that computes it takes a type with no `P` field.
6. **Choosing t.** The weak-key probability computed live from the formula for every `t`, beside the
   robustness each `t` can still afford — and then a clearly marked list of what this lab does not
   show.

---

## When to Use It

Use it to see a cryptographic primitive and a concrete-parameter attack on the same page: to watch
`P·G = 0` do its work, to feel how small the detector's statistical edge really is, and to see an
asymptotic guarantee and a practical distinguisher coexist without either being wrong.

**Do NOT** read this page as a verdict on pseudorandom codes in general, or on any deployed
watermark. It shows **one key distribution at small sizes**. The 2024 paper's proofs are asymptotic
and this page does not contradict them; it shows what happens at an `n` you can run in a browser,
where `k = n − r` is 41 or 82. It also builds one of three attacks: a key with no repeated rows of
`G` defeats Attack-II and says nothing whatever about Attack-I or Attack-III, and the page reports
"no repeated rows" as a refusal to claim anything rather than as a pass.

Also do not use any of this to protect anything. There is no language model, no image model, no
token-level embedding, no multi-bit message, and no deletion robustness here.

---

## Live Demo

https://systemslibrarian.github.io/crypto-lab-pseudorandom-code/

Pick `n` and `t`, set the noise rate, and press **Generate a new key** — everything below reads that
one key. Draw a codeword and watch the detector accept it while rejecting a random string. Raise the
substitution rate until acceptance collapses. Then open exhibit 5 and watch a distinguisher holding
nothing but the public key separate the very strings exhibit 4 just called unremarkable.

---

## What Can Go Wrong

**Undetectable and robust pull against each other, and the squeeze is tightest exactly where you can
run it.** The detector needs many low-weight parity checks that codewords satisfy slightly more often
than chance. Low weight is what makes the checks informative — a weight-`t` check is unsatisfied with
probability `1/2 − (1−2η)^t/2`, which climbs toward `1/2` as `t` grows — and low weight is also what
makes the appended rows of `G` come from a small set. At `n = 4096, η = 0.05` the trade-off is
visible in one row of the exhibit-6 table: `t = 3` tolerates substitutions up to `δ ≈ 0.150` and is
weak with probability 1; `t = 8` is weak with probability 0.31 and tolerates `δ ≈ 0.033`. An
asymptotic guarantee does not tell you whether a concrete instance has the property.

**Acceptance is not a sharp step at the threshold.** This is a property of this key distribution at
small `n`, observed here rather than stated by either paper. Each of the `k` information positions
sits in about `r(t−1)/k` checks — roughly 198 at `n = 4096, t = 3` — so a single noise bit landing on
one flips about two hundred checks at once. The syndrome weight therefore moves in steps of that size
and has a long right tail: in a 300-codeword run at `η = 0.05` the mean is near 552 and the heaviest
syndrome observed was 1,222, where independent checks would have put the maximum within about 65 of
the mean. A codeword can be rejected at a noise rate where the average codeword is accepted
comfortably.

**Comparisons inside one group are not independent.** A group of `m` positions sharing a row of `G`
contributes `m − 1` comparisons, each against the group's first member — so they all turn on that one
position's noise bit, and when it is flipped the whole group disagrees at once. The independent unit
is the group. With hundreds of groups the full-key attack is unaffected, but a truncated handful of
comparisons is noisier than its count suggests, which is why the page refuses a verdict on a single
string below 30 comparisons. (Found here by a test that assumed independence and went red.)

**Passing statistical randomness tests means very little.** Pseudorandomness is a claim about every
efficient adversary. The frequency and runs tests are two particular adversaries that count ones and
count switches, and the codewords sail through both while a distinguisher with the public key tells
them apart.

---

## Real-World Usage

The 2024 paper's stated application is **undetectable watermarking for language-model output**: the
watermarking strategy is to replace some of the randomness a generative algorithm uses with the
output of a PRC, so that watermarked text is computationally indistinguishable from the model's
ordinary output. The paper gives an undetectable scheme robust to cropping and to a constant rate of
random substitutions and deletions — the first, it says, to tolerate a constant error rate — and a
second application to steganography. Its introduction notes that several major companies have pledged
to embed watermarks in generated content; it does not say what any of them run, and neither does this
page.

The 2025 cryptanalysis is the reason this lab exists in the shape it does. Its abstract reports that
its three attacks undermine LDPC-PRC's claimed security guarantees **across all practically feasible
parameter regimes**, with watermark detection at a cost of about `2²²` operations in one of its
examples, and that weak keys appear with nearly 100% probability at `t = 3` and `t = 4` for the
language-model parameters it studies. It implements its attacks against DeepSeek and Stable Diffusion
and proposes three defences, including a revised key generation function.

**Nothing on this page was measured against a shipped product, and neither paper is cited here for
one.** This lab builds the construction and Attack-II at browser sizes; the model experiments, the
other two attacks and the defences were not read in detail for it and are not implemented.

---

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-pseudorandom-code
cd crypto-lab-pseudorandom-code
npm install
npm run dev            # http://localhost:5173
```

```bash
npm test               # the unit and correctness suite (Vitest)
npm run build          # typecheck, then the production bundle
npm run test:a11y      # the axe WCAG 2.1 A/AA gate, against the built site
npm run test:claims    # the claims suite
npm run test:e2e:all   # everything above plus the cross-browser flows
npm run mutation       # replay the mutation ledger (see below)
```

No backend and no runtime dependencies. The cryptography is hand-rolled over typed arrays because
the inspectable internals *are* the subject; key material is generated per session in memory and is
never persisted or transmitted.

---

## Related Demos

- **[Token Tell](https://systemslibrarian.github.io/crypto-lab-token-tell/)** — the other side of
  this coin. It runs the real SynthID-Text keyed detector over watermarked text: a *heuristic*
  watermark with a keyed statistical detector, where this lab builds the cryptographic primitive
  that aims to make such a detector's marks provably undetectable without the key.
- **[Noisy Parity](https://systemslibrarian.github.io/crypto-lab-noisy-parity/)** — Learning Parity
  with Noise in the HB and HB+ authentication protocols. LPN is the assumption this construction's
  pseudorandomness rests on; Noisy Parity attacks LPN-based protocols directly, where this lab takes
  LPN as given and attacks the *key distribution* instead.
- **[BIKE Vault](https://systemslibrarian.github.io/crypto-lab-bike-vault/)** — QC-MDPC codes and
  belief-propagation decoding in a post-quantum KEM. Sparse parity checks again, used as a trapdoor
  for key encapsulation rather than for pseudorandomness, and decoded properly rather than by
  counting unsatisfied checks.
- **[McEliece Gate](https://systemslibrarian.github.io/crypto-lab-mceliece-gate/)** — the oldest
  code-based public-key scheme, where the trapdoor is a hidden Goppa structure rather than low-weight
  parity checks.

---

## Build & Verify

**TEST_COUNTS_PLACEHOLDER**

**The formula table, asserted to four decimal places** (`src/prc/params.test.ts`). Every value was
computed independently of this implementation before it existed, and the tests carry the literals
rather than re-deriving the expressions the source uses:

| n | k | r | threshold `(1/2 − r^(−1/4))·r` | P(weak) t = 3,4,5 | t = 6 | t = 7 | t = 8 |
|---|---|---|---|---|---|---|---|
| 4096 | 41 | 4055 | 1519.3 | 1.0000 | 1.0000 | 0.8394 | 0.3062 |
| 8192 | 82 | 8110 | 3200.4 | 1.0000 | 0.7004 | 0.0896 | 0.0086 |

Unsatisfied-check probability `1/2 − (1−2η)^t/2`: at η = 0.05, **0.1355** (t = 3), **0.2048**
(t = 5), **0.2609** (t = 7); at η = 0.10, **0.2440**, **0.3362**, **0.3951**. Pair-agreement
probability `1/2 + (1−2η)²/2`: **0.9050** at η = 0.05, **0.8200** at η = 0.10, **0.9418** at η = 0.03.

**Measured rates** (this build, 17 November 2026; `n = 4096`, `g = 64`, one freshly generated key per
row, 300 codewords and 300 random strings each). Counted from runs, never read off a formula — the
bounds are held on every CI run by `src/prc/rates.test.ts` and `src/prc/weak.test.ts`:

| t, η | codewords accepted | random accepted | mean syndrome weight (formula) | repeated-row comparisons | pair agreement codeword / random | flagged by the public key, codewords / random |
|---|---|---|---|---|---|---|
| 3, 0.05 | 300/300 | 0/300 | 552 (549) | 3,245 | 0.905 / 0.500 | 300/300, 0/300 |
| 3, 0.10 | 296/300 | 0/300 | 987 (989) | 3,249 | 0.821 / 0.499 | 300/300, 0/300 |
| 5, 0.05 | 290/300 | 0/300 | 826 (830) | 84 | 0.906 / 0.503 | 300/300, 0/300 |
| 7, 0.03 | 288/300 | 0/300 | 700 (713) | 2 | 0.935 / 0.507 | no verdict — 2 comparisons |
| 7, 0.05 | 264/300 | 0/300 | 1,061 (1,058) | 2 | 0.907 / 0.480 | no verdict — 2 comparisons |

With extra substitutions at (t = 3, η = 0.05): **196, 174, 94, 32** of 200 accepted at
δ = 0.05, 0.10, 0.15, 0.20. The δ = 0.15 point sits almost exactly on the line — the mean syndrome
weight there is 1,520.5 against a threshold of 1,519.3 — so it is the noisiest measurement on the
page by design.

The last two rows are where this build deliberately differs from a naive one: with only two
comparisons available, **the page refuses a verdict on a single string** rather than reporting one.
A distinguisher that called a string either way on two bits would report both false positives and
false negatives at a high rate, which is what the comparison floor exists to prevent.

**The mutation ledger** (`audits/MUTATION-LEDGER.md`, `scripts/mutations.mjs`). Eleven mutations,
each recorded as a concrete patch — a file, an anchor that must occur exactly once, and its
replacement — rather than as a sentence describing an edit. `npm run mutation` applies each one,
confirms the build still succeeds, confirms the built bundle's hash moved, runs the owning command
with `CI=1` so no reused preview server can answer from unmutated code, and writes what it observed.
A patch that does not compile is recorded as DOES NOT BUILD and is never counted as a kill.

**The accessibility gate.** `npm run build && npm run test:a11y` must pass with zero violations:
`@axe-core/playwright` against the production build, across every state the lab renders, at desktop
and 380px. The gate asserts axe's `incomplete` bucket as well as its `violations`, runs the WCAG tag
set and the landmark rules as two separate `analyze()` calls (chaining `withTags` and `withRules`
silently discards the first), and adds four oracles axe has no rule for at all: composite-aware
contrast arithmetic over every text node, non-text contrast ratcheted against a baseline that is
**empty**, keyboard reachability of scrolling regions, and reflow. Nothing is injected into the page
and no panel is revealed from script; every wait is on a real completion signal, because this lab
computes in a worker and a fixed timeout is how axe ends up scanning an empty container.

---

## Performance

Everything is real computation in the browser, and the parameters were chosen so that it is fast
enough not to need faking. Bit matrices are stored packed in typed arrays, and the syndrome is
computed from the `t` column indices of each row of `P` rather than as a dense product — at
`n = 8192, t = 8` that is 65,000 bit reads instead of a 66-million-bit matrix multiply.

On a 2024 laptop: a key at `n = 4096` generates and self-verifies in a few milliseconds; 300
encode-and-decode cycles with the control arm and the distinguisher take well under a second; the
whole unit suite — which generates 240 keys for its algebra checks alone and samples 300 keys' worth
of sparse vectors for the weak-key rate — runs in about ten seconds. Key generation and trial runs
happen in a cancellable module Web Worker, driven one chunk per macrotask so that a cancel really
lands rather than waiting for the loop to finish.

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
