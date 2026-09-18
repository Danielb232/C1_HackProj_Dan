# Echo

Local-first course study companion for TAPIA challenge #8. No built-in biology material or cloud API keys.

## Get the code

```sh
git clone https://github.com/Danielb232/C1_HackProj_Dan.git
cd C1_HackProj_Dan
```

## Run locally (macOS)

Requires Python 3, Poppler (`pdftotext`), and Ollama with `qwen2.5:3b` downloaded.

```sh
brew install poppler ollama
brew services start ollama
ollama pull qwen2.5:3b
python3 server.py
```

Open http://localhost:8000. The old `python3 -m http.server` command is no longer sufficient. Echo binds only to loopback and serves an explicit list of public assets, not the workspace. No cloud requests or remote fonts are used. After installation, generation can work offline.

The model download is approximately 1.9 GB. Keep this terminal running while using Echo. This is a local app, not a GitHub Pages deployment. Python uses only its standard library; Node.js is needed only for the frontend test commands below. On other operating systems, install Python, Poppler, and Ollama using their platform-specific instructions before running the same server command.

For a quick test, upload `tests/fixtures/syllabus.txt` as the syllabus and `tests/fixtures/reading.txt` as the reading. These are clearly labeled synthetic research-methods examples, not student documents. No uploaded PDFs, browser study history, API keys, or model weights are included in this repository.

## Workflow

1. Upload a syllabus plus a chapter/paper (PDF, UTF-8 TXT, MD). PDFs must contain text; no OCR. Maximum 10 MB each. Select PDF page ranges for large documents. Both sources share a model-aware token budget, rather than separate character caps (see below). Page labels refer to physical PDF pages.
2. Inspect extracted text. PDF tables, equations, and multiple columns can extract poorly. Upload a clean text excerpt if needed.
3. Generate locally: syllabus alignment, three concepts, two map relationships, a critical-review sheet, and three multiple-choice questions. Typically 1–3 minutes; slower hardware may time out. Malformed output or mismatched quotes fails visibly, with no canned fallback.
4. A human teammate checks answers and source passages in Learn. Approval/flags and notes persist. Flagged questions are excluded from quizzes; proposed concept-map connections can also be flagged and excluded. Draft questions remain available but visibly marked as not checked. Quotes matching source text does not establish answer correctness, complete coverage, or sound reasoning. In testing, the small model produced both an unsupported connection and semantically overlapping answer options: review is essential, not ceremonial.
5. Choose an answer, report confidence, then see feedback. Missed and correct-but-uncertain answers have separate queues.
6. Reload or close and reopen using the same browser/origin. Memory → Re-quiz only missed concepts. This repeats saved questions; it does not generate fresh variants.

### Concept map and progression

The Study view draws the concept map as inline SVG (no library, no network): the reading in the center, each concept around it, and the model's proposed connections as labeled arrows. Flagged connections are drawn dashed. Nodes are keyboard-focusable; selecting one shows its summary and source passage. Node color shows progress from a Leitner ladder counted in quiz sessions, not calendar days: grey not attempted, red missed, amber learning or relearning, green mastered. A wrong answer drops a concept to box 1 and makes it due next session; a confident correct answer moves it up one box (box 2 counts as mastered) and it is due again after that many sessions; a correct but unsure answer holds its box. The Review table shows the same box and due session. The ladder is stored with the pack in this browser and never leaves it.

## Inclusion and judge pitch

### Canvas handoff (UI placeholder only)

Sources includes a clearly labeled, disabled three-step Canvas flow, not tied to a specific school: connect → choose a class → select syllabus and reading. No authentication, API calls, credentials, or imports are implemented. File uploads remain the working source path; do not present Canvas as connected in the demo.

The integration teammate can wire up `#canvas-connect`, `#canvas-course`, and `#canvas-materials` inside `#canvas-source` in `index.html`. Styles are scoped to `.canvas-placeholder` and `.canvas-actions`. No backend or study-generation code was changed for this placeholder.

### Current demo features

- Focus: one concept at a time and one small action; ADHD-paced presentation.
- Read: short summaries, increased spacing and comfortable line lengths; dyslexia-friendly intent, not a clinical or accessibility certification.
- Listen: semantic, linear screen-reader output and keyboard controls; no speech synthesis is implied.
- Local small language model: source-derived generation without cloud token charges. Processing still uses local compute and a bounded context window.
- Upload → inspect → generate → human check → quiz/confidence → saved memory → missed-only review.
- The required concept map (with progress-colored nodes), review sheet, quiz, persistent session-based spaced repetition, and human answer-check flow are present. For the live demo, ask a real teammate to verify answers; software tests are not that human check.

## Data and limitations

### Model-aware limits and measurements

Every preview reads the installed model's architecture/context maximum from Ollama `/api/show`. Echo uses the smaller of that maximum and its requested runtime allocation (`ECHO_CONTEXT_TOKENS`, default 12,288). The installed Qwen model reported 32,768 at implementation time; Echo does **not** assume that maximum is fast or safe for every computer. The runtime default remains an explicit performance policy, not a hardware benchmark.

The **entire constructed prompt** is budgeted: both sources, passage IDs, instructions, and JSON schema. From the allocated context we reserve 2,100 output tokens, 256 formatting tokens, and 20% for estimation error. These reserves are conservative engineering policies, not empirically optimal values. The initial estimate counts ASCII at 3 bytes/token and non-ASCII at 1 byte/token; it is **not an exact tokenizer count**. Preview shows the estimate, available space, both context sizes, and the reserves. Over-budget sources remain visible for inspection, but generation is disabled; choose fewer PDF pages or upload an excerpt. Missing model metadata also blocks generation, with no invented capacity fallback. The server independently rechecks the budget before generation.

Completed model calls provide actual `prompt_eval_count`, `eval_count`, and elapsed time. Measured prompt density can increase the estimate for subsequent requests in the same server session; it never relaxes the baseline based on a few easy inputs. Only a numeric maximum ratio and sample count are held in server memory, reset on restart. No document content is retained for calibration. Each successful saved guide includes its own usage measurements, visible under Study → Source references → Measured model usage. Older guides remain compatible. Near-full measured prompts are rejected rather than publishing a possibly truncated result. Estimates and margins cannot guarantee exact tokenization or semantic coverage; no automatic chunk retrieval is implemented.

The **10 MB upload cap** and **500,000 extracted characters per file** are independent reader/preview resource guards, not model or Canvas limits. They remain explicit safety policies. Raising the context allocation can consume more RAM and time; fitting the budget does not establish answer quality. Human source checking remains required.

Implementation references: [Ollama model information](https://github.com/ollama/ollama/blob/main/docs/api.md#show-model-information), [generation usage fields](https://docs.ollama.com/api/generate).

Live smoke test (2026-09-18, bundled synthetic syllabus/reading, Qwen 2.5 3B): estimated 1,643 prompt tokens; Ollama reported 1,193 input tokens, 634 output tokens, and 81.3 seconds. All three concepts passed structural/source-quote validation. A larger synthetic preview estimated 32,570 tokens and was blocked without dropping its extracted passages. This is one functional test, not a representative performance/quality benchmark or evidence that the reserve settings are optimal.

### Local data

The original files are decoded locally in memory; PDF extraction uses automatically cleaned temporary files. Extracted text, generated packs, human checks, and progress are saved in this browser's localStorage. They are not encrypted and can be read by other users of the same browser. Remove a pack in Sources to delete its browser copy; original files remain untouched. Clearing browser data also deletes progress. localhost and 127.0.0.1 have separate storage. Each generated pack has independent memory; regenerating does not transfer old answers to changed questions.

Ollama receives the selected source text, not learner history. Uploaded instructions are treated as untrusted data, but prompt injection and factual errors remain possible; never execute instructions contained in a generated pack. All generated text is escaped before rendering. Server logs record requests, not document contents. The server only exposes allowlisted assets and validates local Host/Origin headers.

## Tests

```sh
python3 -m unittest discover -s tests -v
node --check app.js
node tests/frontend.test.cjs
node tests/theme.test.cjs
node tests/canvas-placeholder.test.cjs
```

Ollama structured-output reference: https://docs.ollama.com/capabilities/structured-outputs
