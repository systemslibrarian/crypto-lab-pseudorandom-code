# Build brief — crypto-lab-pseudorandom-code

Written 15 November 2026. Paste this whole file to the coding agent, or save it as `brief.md`
in the new repo. It is self-contained apart from `_MASTER-TEMPLATE.md`, which must be in the
repo root (or readable at `audits/_MASTER-TEMPLATE.md` in the crypto-lab catalog repo).

Source papers are on the owner's machine at
`~/Downloads/crypto-lab-brief-sources/crypto-lab-pseudorandom-code/`. Read them there; do not
search the web for copies, do not copy the PDFs into the repo, do not commit them.

---

## KICKOFF (read this first)

Build a new Crypto Lab browser demo (Vite + TypeScript, static site, no backend) in the
repository **`crypto-lab-pseudorandom-code`**.

Read `_MASTER-TEMPLATE.md` in full and treat it as the BINDING spec for build, teaching,
look, accessibility, README and deploy. If `audits/kickoff.md` has been given to you, it
governs how you work inside this repo. This brief supplies only the demo-specific facts and
the acceptance checks. Where the template and this brief disagree on build/teach/look/a11y,
the template wins. Where this brief states cryptographic facts, check them against the cited
primary sources and by computation; if you find one wrong, do not silently deviate: write
"Brief said X; that is wrong because Y (source or computation)" in your report and build the
correct thing.

Build to every standard in the template, in its order: §1 Build, §3 Look, §2 Teach,
§4 Accessibility (including §4.1a setup rules, §4.1b claims suite, §4.1c mutation
discipline run from a script, §4.1d negative claim), §5 README, §6 Deploy with §6.1 and §6.2.

Hard rules (from the template; repeated because they are the ones that get broken):
real computation only, never a canned or simulated verdict; honest scoping in the page and
the README; do NOT weaken a gate to get a green run; if something cannot pass honestly,
leave it failing and say so. Do not touch the shared catalog files. Copy the top bar from an
existing lab. Copy the accessibility gate and `claims.spec.ts` shape from
`crypto-lab-schnorr-forge` and rewrite every lab-specific passage.

When done, report: one-line summary with the test count; the mutation ledger (each mutation,
killed or not); the rates your build measures (FACTS 8) beside the brief's; confirmation that
grouping / auto-merge / PR gate / workflow_dispatch are all present; and the card metadata
listed at the end of this brief.

---

## NEW DEMO BRIEF

- Repo name:         crypto-lab-pseudorandom-code
- Short name (H1):   Pseudorandom Code
- Subtitle:          A watermark that should look random · sparse parity checks · weak keys
- One-liner:         Browser-based pseudorandom error-correcting code — strings meant to look random to everyone yet be recognised by the key holder after bit flips, built from sparse parity checks as its 2024 paper defines it, then the 2025 observation that at practical sizes the public key itself contains repeated rows that let anyone tell a codeword from noise
- Concept to teach:  Undetectable and robust pull against each other: the detector needs many low-weight parity checks that codewords satisfy slightly more often than chance, and at sizes you can actually run, those checks leave fingerprints in the public key. An asymptotic guarantee does not tell you whether a concrete instance has it.
- Primitives/spec:   M. Christ and S. Gunn, "Pseudorandom Error-Correcting Codes" (CRYPTO 2024; IACR ePrint 2024/235): zero-bit public-key LDPC pseudorandom code (its Construction 2 and the key distribution of its section 2 overview). Analysis: "Cryptanalysis of LDPC-Based Pseudorandom Error-Correcting Codes" (IACR ePrint 2025/2283): weak-key distinguisher (its Attack-II). Take the authors' names for the second paper from its title page.
- Accent (--accent): #9ccc65   (not used by any of the 203 labs whose accent is recorded in the 12 November 2026 snapshot; confirm against the live catalog and against neighbouring cards)
- Favicon emoji:     🫥
- In scope:          see SCOPE below
- Non-goals:         see SCOPE below

GitHub "About" line: use the one-liner above.

---

## PRE-FLIGHT (verify, do not assume)

1. Confirm the repository name is free under `systemslibrarian` and no catalog card is titled
   "Pseudorandom Code".
2. In the catalog repo, search `CATALOG.md` and the lab READMEs for `pseudorandom code`,
   `pseudorandom error-correcting`, `PRC`, `undetectable watermark`, `planted XOR`. What the
   brief author found (12 November 2026 snapshot): no lab mentions the primitive; one lab
   teaches watermark detection for generated text with a keyed statistical detector. If a
   lab already builds a pseudorandom code, STOP and report. Link that watermark lab, the
   labs on learning parity with noise and on low-density parity-check or code-based schemes
   that you actually find, under Related Demos, saying how this differs.
3. Playwright port: ask the catalog tool (`node tools/port-sync.js` in the catalog repo). If you
   cannot reach the catalog repo, stop and ask the owner for a port. Never 4173.

---

## SOURCES AND WHAT EACH IS FOR

- **ePrint 2024/235** (71 pages; in the sources folder). Read by the brief author: abstract,
  the overview passage that defines the key distribution (FACTS 2), Construction 2 and
  Lemma 4's statement (FACTS 3 and 4). NOT read: the proofs, the multi-bit and
  deletion-robust constructions, the watermarking and steganography sections. Read the
  overview and section 5 before writing any explanatory text.
- **ePrint 2025/2283** (24 pages; in the folder). Read by the brief author: abstract,
  contributions, its restatement of the construction (its Construction 1 and Algorithm 1),
  and section 4.2 (Attack-II) with its weak-key probability formula. NOT read in detail:
  Attack-I (partial key recovery), Attack-III (noise overlay), the proposed defences, and
  the experiments on real models. Name those on the page only after reading them.
- A 2026 survey of pseudorandom codes and several 2026 constructions are in the owner's
  library and were not used here. Do not describe the state of the field beyond what you read.

---

## FACTS (write tests from these, not from your code)

1. **Goal** (2024/235 abstract). A pseudorandom code is an error-correcting code whose
   codewords, in any polynomial number, look random to anyone without the key, while the key
   holder can still recognise a corrupted codeword. A "zero-bit" code only answers "is this
   one of mine?", which is what a watermark needs.
2. **Key distribution** (2024/235, overview; restated as Algorithm 1 in 2025/2283). With
   k = n − r "information" positions and r = 0.99n checks: sample G0 uniformly in
   F2^(k×g). For i = 1 … r sample a random s_i in F2^k of weight t − 1 and append the row
   s_i·G0 to G. The i-th row of P is s_i followed by the i-th unit vector, so P has row
   weight t and P·G = 0. The 2025 paper's version then applies one random permutation to the
   n positions (rows of G, columns of P). **This lab:** r = ⌊0.99 n⌋, permutation applied,
   n and t chosen by the learner from n ∈ {4096, 8192}, t ∈ {3, …, 8}, g = 64.
3. **Scheme** (Construction 2). Public key (G, z) with z a uniformly random n-bit pad; secret
   key (P, z). Encode: sample u in F2^g and noise e with each bit 1 with probability η;
   output G·u ⊕ z ⊕ e. Decode: accept if the weight of P·(x ⊕ z) is below (1/2 − ζ)·r.
   Lemma 4 uses ζ = r^(−1/4) and row weight t at most a small multiple of log n.
4. **Why it decodes.** P·(x ⊕ z) = P·e. A check of weight t is unsatisfied with probability
   1/2 − (1 − 2η)^t / 2 for a codeword and 1/2 for an unrelated string. Extra substitutions
   at rate δ act like noise η' = η + δ − 2ηδ.
5. **Weak keys** (2025/2283 section 4.2). Each of the r appended rows of G is the sum of
   t − 1 rows of G0, so there are only N = C(k, t − 1) possible rows. If two positions i, j
   of G carry identical rows, then for every codeword x_i ⊕ x_j ⊕ z_i ⊕ z_j = e_i ⊕ e_j,
   which is 0 with probability 1/2 + (1 − 2η)^2 / 2: far from 1/2. Anyone holding the public
   key can find identical rows by hashing and test this. Probability that a key has at least
   one identical pair among the appended rows: 1 − ∏_{i=0}^{r−1} (1 − i/N). The paper reports
   this is nearly 100% for t = 3 and 4 at the parameters used for text watermarking.
6. **The paper's wider claim** (abstract): its three attacks undermine the claimed guarantees
   across practically feasible parameter ranges, with watermark detection at a cost of about
   2^22 operations in one example; it also proposes defences. This lab builds Attack-II only.
7. **Exact values to test** (computed from the formulas above):

   | n | k | r | threshold (1/2 − r^(−1/4))·r | P_weak for t = 3,4,5 | t = 6 | t = 7 | t = 8 |
   |---|---|---|---|---|---|---|---|
   | 4096 | 41 | 4055 | 1519.3 | 1.0000 | 1.0000 | 0.8394 | 0.3062 |
   | 8192 | 82 | 8110 | 3200.4 | 1.0000 | 0.7004 | 0.0896 | 0.0086 |

   Unsatisfied-check probability for a codeword: η = 0.05: 0.1355 (t = 3), 0.2048 (t = 5),
   0.2609 (t = 7); η = 0.10: 0.2440, 0.3362, 0.3951. Pair agreement probability:
   0.9050 at η = 0.05, 0.8200 at η = 0.10, 0.9418 at η = 0.03.
8. **What the brief author measured** (Python with numpy, n = 4096, g = 64, one key per row,
   300 codewords and 300 random strings each; 15 November 2026):

   | t, η | codewords accepted | random accepted | mean syndrome weight (formula) | repeated-row comparisons | pair agreement, codeword / random | public-key distinguisher: codewords flagged / random flagged |
   |---|---|---|---|---|---|---|
   | 3, 0.05 | 300/300 | 0/300 | 559 (549) | 3,241 | 0.905 / 0.500 | 300/300, 0/300 |
   | 3, 0.10 | 295/300 | 0/300 | 970 (989) | 3,244 | 0.819 / 0.500 | 300/300, 0/300 |
   | 5, 0.05 | 288/300 | 0/300 | 863 (830) | 82 | 0.908 / 0.499 | 300/300, 0/300 |
   | 7, 0.03 | 288/300 | 0/300 | 684 (713) | 0 | not applicable | no repeated rows in that key |
   | 7, 0.05 | 266/300 | 0/300 | 1018 (1058) | 2 | 0.905 / 0.502 | 249/300, 73/300 (two comparisons are too few for one string) |

   "Repeated-row comparisons": group positions by identical row of G; compare every member
   of a group with the group's first member. The distinguisher flags a string when the
   fraction of agreeing comparisons exceeds 1/2 + (1 − 2η)^2 / 4.
   With extra substitutions at (t = 3, η = 0.05): accepted 199, 172, 106, 19 of 200 at
   δ = 0.05, 0.10, 0.15, 0.20.
9. **An effect a learner will see and the page must explain.** Acceptance is not a sharp
   step at the threshold. Each of the k information positions sits in about r(t − 1)/k checks
   (about 198 at n = 4096, t = 3), so one noise bit landing there flips about 200 checks at
   once and the syndrome weight has a heavy tail (maximum 1,491 against a mean of 559 in the
   first row above). That is a property of this key distribution at small n, observed by the
   brief author; it is not a statement from either paper.

---

## SCOPE

In scope, as exhibits in this order:

1. **Keys.** Generate (P, G, z); show a few sparse rows of P, the shape of G, and P·G = 0
   checked in full.
2. **Encode and detect.** A codeword and a random string side by side; syndrome weight
   against the threshold; many-trial counts.
3. **Robustness.** A flip-rate control; measured acceptance against the formula of FACTS 4,
   with the heavy tail of FACTS 9 shown as a histogram with a text summary.
4. **Does it look random?** Bit frequency and a runs count on codewords: unremarkable. State
   plainly that passing these shows nothing about pseudorandomness.
5. **The public key gives it away.** Find repeated rows of G; show the comparisons; run the
   distinguisher on codewords and on random strings without touching P.
6. **Choosing t.** The weak-key probability table computed live from the formula, beside the
   robustness lost as t grows (FACTS 4). Then a clearly marked list of what this lab does
   not show: the other two attacks and the defences in the 2025 paper.

Non-goals (say so on the page and in the README): any language or image model; token-level
watermark embedding; multi-bit messages; deletion robustness; Attack-I and Attack-III; any
claim that avoiding repeated rows makes an instance secure; any claim about deployed
watermarks.

---

## SECURITY / CORRECTNESS INVARIANTS

1. P·G = 0 over F2 is verified for every generated key before it is used.
2. The distinguisher in exhibit 5 is given (G, z) and the string only (enforce by function
   signature; a test passes an object without P).
3. All randomness comes from `crypto.getRandomValues`; weight-(t − 1) vectors and the
   permutation are sampled without bias (rejection sampling; Fisher-Yates).
4. Counts and rates are counted from runs, with the number of runs shown.
5. Bit matrices are stored packed (typed arrays); syndrome computation uses the t column
   indices of each row of P, not a dense product. Key generation and trials run in a
   cancellable Web Worker.

---

## ARCHITECTURE

Pure modules, no DOM: `bits.ts`, `keygen.ts`, `code.ts` (encode, syndrome weight, decode),
`weak.ts` (repeated rows, comparisons, distinguisher, P_weak formula in log space),
`trials.ts` (worker). UI modules render from returned data only.

---

## UI AND VISUAL SEMANTICS

Follow §3. The secret-key panel and the public-key panel are visually and textually
separate; exhibit 5 states in words that it uses the public panel only. Histograms have a
text table alternative. Verdicts are words, never colour alone.

---

## EDGE CASES (each fails closed and teaches via its message)

- A key with no repeated rows: exhibit 5 says so and does not claim a result.
- Fewer than 30 comparisons: the page says a single string is not enough and shows the
  measured overlap instead of a verdict.
- η outside [0, 0.25], t outside 3 … 8, n outside the two offered sizes: refused.
- A string of the wrong length: refused.
- t − 1 > k: refused (cannot sample the sparse vector).

---

## EXTENSION SEAMS (shape now, do not build)

A `KeyDistribution` interface so a revised key generation (the 2025 paper proposes one) or a
different construction could be compared. An `Attack` interface for the two attacks not
built. Name these on the page as "not built here".

---

## ACCEPTANCE CHECKS — expected outcomes, derived independently of any implementation

**A. Algebra.** For 20 random keys at each offered n and t: every row of P has weight
exactly t; P·G = 0; G has n rows and g columns; the permutation is a bijection. Hand-sized
check written out in the test: k = 4, g = 3, t = 3, G0 rows (1,0,1), (0,1,1), (1,1,0),
(0,0,1); s = (1,0,1,0) gives appended row (0,1,1); s = (0,1,0,1) gives (0,1,0);
s = (1,1,0,0) gives (1,1,0).

**B. Formula values.** Every number in FACTS 7, to four decimals (P_weak computed in log
space; the threshold to one decimal).

**C. Decoding.** For a codeword with e = 0 the syndrome is all zero. Flipping one bit at a
position that is the unit entry of a row of P flips exactly that one check; flipping an
information position flips exactly the checks whose s_i contains it (test against the key).

**D. Rates** (slow tests, tagged), n = 4096, at least 300 strings each: (t = 3, η = 0.05)
codewords accepted at least 97%, random strings accepted 0; mean syndrome weight of
codewords between 480 and 640; with δ = 0.20 accepted at most 25%.

**E. Weak keys.** At (4096, 3) every generated key has repeated rows (10 keys). At
(8192, 8) the fraction of 300 keys with a repeated row is between 0 and 3% (formula
0.86%); for this count the test may sample only the sparse vectors s_i, since two appended
rows of G coincide whenever their s_i do. Distinguisher at (4096, 3, η = 0.05): codewords flagged at least 99%, random strings
flagged at most 1%, 300 each; measured pair agreement between 0.88 and 0.93 for codewords
and between 0.47 and 0.53 for random strings.

**F. Mutations that must be killed (§4.1c, run from a script, each a concrete patch).**
(1) s_i sampled with weight t instead of t − 1; (2) the unit entry of P's row omitted
(P·G ≠ 0); (3) the permutation applied to G's rows but not to P's columns; (4) the pad z
left out of decoding; (5) threshold uses r^(−1/2); (6) the distinguisher reads P; (7) the
distinguisher's verdict is set when comparisons exist instead of from the measured
agreement (killed by the random-string half of check E); (8) P_weak computed with
N = C(k, t); (9) acceptance uses "≤" on a syndrome weight computed over only the first half
of the checks. A surviving mutation is reported, not explained away.

**G. Fail-closed paths, each a NAMED test:** every item under EDGE CASES; invariants 1
and 2.

**H. Claims suite (§4.1b).** At minimum: the syndrome weight on screen equals the one the
test recomputes from the rendered key indices and string; "accepted" appears exactly when
that weight is below the threshold on screen; the number of comparisons shown equals the
number the test derives by grouping the rendered rows of G; the agreement fraction shown
equals the test's count; the P_weak figure shown equals the formula for the n and t on
screen; stale verdicts are retired when n, t, η or the key changes; the no-op guard; the
`[hidden]` probe.

---

## NEGATIVE CLAIM (§4.1d)

Claim, scoped to the key on the page: **"Passing the randomness checks on this page says
nothing about whether these strings can be told from noise: for this key, anyone holding the
public key can tell, without the secret."**

Evidence fixture: exhibit 5 on a (4096, 3) key at η = 0.05. The exhibit-4 checks all read
"unremarkable", the secret-key detector accepts the codeword, and the verdict reads
`LOOKS RANDOM TO THE TESTS — AND THE PUBLIC KEY TELLS THEM APART`, with the negative-claim
sentence and the comparison count visible in that state.

Bite fixture for mutation (7): the same key with a uniformly random string. Comparisons
exist; agreement is near one half; the page must say "not distinguished from noise". The
three assertions and two bite tests are as §4.1d specifies.

---

## README NOTES

Follow §5. "What It Is" names the primitive, the construction, the sizes run, the one attack
built, and "not production crypto — a teaching demo at toy sizes". "When to Use It" must
include a "do NOT": do not read this page as a verdict on pseudorandom codes in general, or
on any deployed watermark; it shows one key distribution at small sizes. "What Can Go Wrong"
is the lesson of the concept line, plus FACTS 9. "Real-World Usage": only what you can cite;
if you describe watermarking of model outputs, cite the papers and say whether anything is
deployed only if a primary source says so. "Build & Verify" states the test count, the
formula table, the measured rates with trial counts, and the a11y gate. Credit both papers
by title and authors with ePrint links; no links to PDF copies elsewhere.

---

## CARD METADATA TO REPORT BACK (for the catalog session; do not edit the catalog yourself)

Title: Pseudorandom Code. Subtitle as above. Suggested categories: CODES & LATTICES or the
nearest existing category, ATTACKS (confirm against the catalog's CATEGORIES). Suggested
level: advanced. Chips: only what the source implements (LDPC pseudorandom code, sparse
parity checks, zero-bit detection, weak-key distinguisher). Accent #9ccc65.

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
