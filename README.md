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

1. Upload a syllabus plus a chapter/paper (PDF, UTF-8 TXT, MD). PDFs must contain text; no OCR. Maximum 10 MB each. Select PDF page ranges for large documents: 6,000 extracted characters for syllabus, 16,000 for reading. These limits keep the local model's context bounded; full textbooks are not supported. Nothing is silently truncated. Page labels refer to physical PDF pages.
2. Inspect extracted text. PDF tables, equations, and multiple columns can extract poorly. Upload a clean text excerpt if needed.
3. Generate locally: syllabus alignment, three concepts, two map relationships, a critical-review sheet, and three multiple-choice questions. Typically 1–3 minutes; slower hardware may time out. Malformed output or mismatched quotes fails visibly, with no canned fallback.
4. A human teammate checks answers and source passages in Learn. Approval/flags and notes persist. Flagged questions are excluded from quizzes; proposed concept-map connections can also be flagged and excluded. Draft questions remain available but visibly marked as not checked. Quotes matching source text does not establish answer correctness, complete coverage, or sound reasoning. In testing, the small model produced both an unsupported connection and semantically overlapping answer options: review is essential, not ceremonial.
5. Choose an answer, report confidence, then see feedback. Missed and correct-but-uncertain answers have separate queues.
6. Reload or close and reopen using the same browser/origin. Memory → Re-quiz only missed concepts. This repeats saved questions; it does not generate fresh variants or implement a calendar-based spaced-repetition schedule.

## Inclusion and judge pitch

### Canvas handoff (UI placeholder only)

Sources includes a clearly labeled, disabled three-step Canvas flow for University of Washington (`https://canvas.uw.edu/`): connect → choose a class → select syllabus and reading. No authentication, API calls, credentials, or imports are implemented. File uploads remain the working source path; do not present Canvas as connected in the demo.

The integration teammate can wire up `#canvas-connect`, `#canvas-course`, and `#canvas-materials` inside `#canvas-source` in `index.html`. Styles are scoped to `.canvas-placeholder` and `.canvas-actions`. No backend or study-generation code was changed for this placeholder.

### Current demo features

- Focus: one concept at a time and one small action; ADHD-paced presentation.
- Read: short summaries, increased spacing and comfortable line lengths; dyslexia-friendly intent, not a clinical or accessibility certification.
- Listen: semantic, linear screen-reader output and keyboard controls; no speech synthesis is implied.
- Local small language model: source-derived generation without cloud token charges. Processing still uses local compute and a bounded context window.
- Upload → inspect → generate → human check → quiz/confidence → saved memory → missed-only review.
- The required concept map, review sheet, quiz, persistent memory, and human answer-check flow are present. For the live demo, ask a real teammate to verify answers; software tests are not that human check.

## Data and limitations

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
