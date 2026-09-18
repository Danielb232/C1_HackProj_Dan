const $ = id => document.getElementById(id);
const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE = 'echo-courses-v2';
let library = {courses: {}, active: null};
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE));
  if (saved?.courses && typeof saved.courses === 'object') library = saved;
} catch { /* A damaged save must not prevent uploading new sources. */ }
let course = library.courses[library.active] || null;
let currentMode = 'focus', focusStep = 0, queue = [], questionIndex = 0, chosen = null, answered = false;
let pendingFiles = null, pendingBudget = null, busy = false;

function persist() {
  try { localStorage.setItem(STORAGE, JSON.stringify(library)); $('storage-warning').classList.add('hidden'); return true; }
  catch { $('storage-warning').textContent='Browser storage is full or unavailable. This session works, but new changes will not survive a reload. Remove an old saved course or allow browser storage.'; $('storage-warning').classList.remove('hidden'); return false; }
}
function status(message, error = false) {
  $('upload-status').textContent = message;
  $('upload-status').classList.toggle('error', error);
}
function setView(view, scroll = true) {
  if (['learn','quiz','memory'].includes(view) && !course) view = 'upload';
  const headings = {
    upload: ['Add course material', 'Turn a syllabus and reading into a study guide and quiz. Return later to practice what you missed.'],
    learn: [course?.plan.title || 'Study your reading', 'Review the concepts, then check your understanding with a quiz.'],
    quiz: ['Check your understanding', 'Choose an answer, then report your confidence before seeing the result.'],
    memory: ['Review what needs practice', 'Resume this source set with your saved answers and confidence signals.'],
    showcase: ['Judge demo guide', 'A practical walkthrough of the course-study challenge, including what Echo does and does not verify.'],
  };
  $('workspace-title').textContent = headings[view][0];
  $('workspace-description').textContent = headings[view][1];
  $('session-summary').classList.toggle('hidden', !course || ['upload', 'showcase'].includes(view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === view));
  document.querySelectorAll('.step').forEach(s => {
    s.classList.toggle('active', s.dataset.view === view);
    if (s.dataset.view === view) s.setAttribute('aria-current', 'step'); else s.removeAttribute('aria-current');
  });
  if (view === 'memory') renderMemory();
  if (view === 'quiz' && !queue.length) startQuiz('all', false);
  if (scroll) document.querySelector('.stepper').scrollIntoView({behavior:'instant', block:'start'});
}
function setBusy(value) {
  busy = value;
  $('upload-form').querySelectorAll('input, button').forEach(e => e.disabled = value);
  $('generate-button').disabled = value || !pendingFiles || pendingBudget?.fits !== true;
  $('source-preview').setAttribute('aria-busy', String(value));
  renderLibrary();
}
async function api(path, body) {
  const response = await fetch(path, body ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {});
  if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Start Echo with python3 server.py, not the old static file server.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Local request failed.');
  return data;
}
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}
async function upload(event) {
  event.preventDefault();
  setBusy(true); pendingFiles = null; pendingBudget = null; $('source-preview').classList.add('hidden');
  status('Reading your selected files locally…');
  try {
    const files = {};
    for (const kind of ['syllabus', 'reading']) {
      const file = $(`${kind}-file`).files[0];
      if (!file || !file.size || file.size > 10 * 1024 * 1024) throw new Error('Choose two nonempty files, no larger than 10 MB each.');
      files[kind] = {name:file.name, data:await readFile(file), start:$(`${kind}-start`).value, end:$(`${kind}-end`).value};
    }
    const result = await api('/api/extract', files);
    pendingFiles = files;
    pendingBudget = result.budget;
    renderBudget(pendingBudget);
    $('preview-text').innerHTML = Object.values(result.sources).map(doc => `<article class="preview-document"><h2>${safe(doc.name)}</h2><p>${doc.chunks.length} source passages · ${doc.chunks.reduce((n,c)=>n+c.text.length,0).toLocaleString()} characters</p><div class="extracted" tabindex="0" aria-label="Extracted text from ${safe(doc.name)}">${doc.chunks.map(c => `<p><strong>${safe(c.id)} · ${safe(doc.kind)} ${c.page}</strong><br>${safe(c.text)}</p>`).join('')}</div></article>`).join('');
    $('source-preview').classList.remove('hidden');
    status(pendingBudget?.fits ? 'Sources fit the estimated budget. Inspect the preview, then build your study pack.' : 'Preview available, but generation is blocked. Check the context budget below.', !pendingBudget?.fits);
  } catch (error) { status(error.message, true); }
  finally { setBusy(false); }
}
function renderBudget(b) {
  const target = $('context-budget');
  target.classList.toggle('error', !b?.fits);
  if (!b || b.error) {
    target.textContent = b?.error || 'Context budget unavailable. Preview again before generating.';
    return;
  }
  const n = value => Number(value).toLocaleString();
  const sources = b.source_estimates || {};
  target.textContent = `${b.fits ? 'Within estimated budget' : 'Over estimated budget'} · ${n(b.prompt_estimate)} / ${n(b.prompt_budget)} prompt tokens\n` +
    `Both sources share the budget, including instructions and source labels. Source-only baseline estimates: syllabus ${n(sources.syllabus)}, reading ${n(sources.reading)}.\n` +
    `Context allocated: ${n(b.context)} tokens (model maximum: ${n(b.model_max)}). Reserved: ${n(b.output_reserve)} for the answer, ${n(b.template_reserve)} for formatting, ${n(b.safety_reserve)} for estimation error.\n` +
    `Token counts are estimates, not tokenizer measurements. ${n(b.calibration_samples)} measured local runs checked this server session; calibration can tighten the estimate. ` +
    (b.fits ? 'Fitting does not guarantee speed, accuracy, or complete coverage.' : `Reduce by about ${n(-b.remaining)} estimated tokens: select fewer PDF pages or upload an excerpt, then preview again. Your text has not been shortened.`);
}
async function generate() {
  if (!pendingFiles || !pendingBudget?.fits || busy) return;
  setBusy(true);
  const started = Date.now();
  const progress = () => status(`Your local SLM is connecting the syllabus to the reading, building three concepts, a review sheet, and a quiz… ${Math.floor((Date.now()-started)/1000)}s\nUsually 1–3 minutes on this computer. Keep this tab open. Your current course is preserved until the new pack succeeds.`);
  progress(); const timer = setInterval(progress, 10000);
  try {
    const result = await api('/api/generate', pendingFiles);
    // Changed question meanings/indices must never inherit old answers.
    const id = `${result.id}-${Date.now()}`;
    course = {...result, id, memory:{}, checks:{}, created:new Date().toISOString()};
    library.courses[id] = course; library.active = id;
    clearInterval(timer);
    const saved = persist();
    if (saved) status('Study pack created from your uploads and saved on this browser. Review the generated answers with a teammate.');
    queue = []; focusStep = 0; renderCourse();
    pendingFiles = null; $('source-preview').classList.add('hidden');
    setView('learn');
  } catch (error) { clearInterval(timer); status(error.message, true); }
  finally { clearInterval(timer); setBusy(false); }
}
function renderLibrary() {
  const entries = Object.values(library.courses);
  $('course-list').innerHTML = entries.length ? entries.map(c => `<div class="saved-row"><span>${safe(c.plan.title)}<small>${safe(c.sources.reading.name)} · ${new Date(c.created).toLocaleDateString()}</small></span><button class="quiet-button" data-open="${safe(c.id)}" ${busy?'disabled':''}>${c.id === course?.id ? 'Resume current' : 'Open'}</button><button class="quiet-button" data-delete="${safe(c.id)}" ${busy?'disabled':''}>Remove</button></div>`).join('') : '<p>No saved guides yet. Upload both files to get started.</p>';
}
function renderCourse() {
  document.querySelectorAll('[data-needs-course]').forEach(e => e.disabled = !course);
  renderLibrary(); updateFocus();
  if (!course) return;
  renderStudy(); renderSources(); renderMemory();
}
function sourceDetails(c) {
  const doc = course.sources.reading;
  const passage = doc.chunks.find(p=>p.id===c.source_id);
  return `<details><summary>${safe(c.source_id)} · Reading · ${safe(doc.kind)} ${passage?.page ?? '?'}</summary><p class="source-document">${safe(doc.name)}</p><blockquote>${safe(c.quote)}</blockquote><p>${safe(passage?.text)}</p></details>`;
}
function renderSources() {
  const usage = course.usage;
  $('generation-usage').textContent = usage ? `This run: ${usage.actual_prompt_tokens == null ? 'unavailable' : Number(usage.actual_prompt_tokens).toLocaleString()} measured input tokens; ${usage.actual_output_tokens == null ? 'unavailable' : Number(usage.actual_output_tokens).toLocaleString()} output tokens. Context allocated: ${Number(usage.budget.context).toLocaleString()}. Runtime: ${usage.generation_seconds}s. These measurements describe this run, not a quality score.` : 'Token measurements are available for newly generated guides.';
  $('fact-ledger').innerHTML = course.plan.concepts.map(c=>`<li><strong>${safe(c.title)}</strong>${sourceDetails(c)}</li>`).join('');
  const s = course.sources.syllabus.chunks.find(c=>c.id===course.plan.syllabus_id);
  $('fact-ledger').insertAdjacentHTML('beforeend', `<li><strong>Syllabus connection</strong><details><summary>${safe(course.plan.syllabus_id)} · Syllabus · ${safe(course.sources.syllabus.kind)} ${s?.page}</summary><p class="source-document">${safe(course.sources.syllabus.name)}</p><p>${safe(s?.text)}</p></details></li>`);
}
function renderStudy() {
  if (!course) return;
  const p = course.plan;
  const concept = (c,i) => `<h2>${i+1}. ${safe(c.title)}</h2><p>${safe(c.summary)}</p><p class="source-ref">Source ${safe(c.source_id)}</p>`;
  let material;
  if (currentMode === 'focus') material = `<div class="focus-step">${concept(p.concepts[focusStep],focusStep)}<p><strong>Small next action:</strong> Explain this idea in one sentence before moving on.</p></div><div class="focus-controls"><button class="quiet-button" id="focus-prev" ${focusStep===0?'disabled':''}>← Previous</button><span>Idea ${focusStep+1} of 3</span><button class="quiet-button" id="focus-next" ${focusStep===2?'disabled':''}>Next →</button></div>`;
  else if (currentMode === 'read') material = `<div class="read-sheet">${p.concepts.map(concept).join('')}</div>`;
  else material = `<ol class="listen-list">${p.concepts.map(c=>`<li><h2>${safe(c.title)}</h2><p>${safe(c.summary)}</p><p class="source-ref">Reading reference: ${safe(c.source_id)}</p></li>`).join('')}</ol>`;
  const reviews = p.concepts.map((c,i) => {
    const check = course.checks[i];
    return `<div class="human-check"><details><summary>Check answer ${i+1}: ${safe(c.title)} · ${safe(check?.state || 'not checked')}</summary><p>${safe(c.question)}</p><ol type="A">${c.answers.map(a=>`<li>${safe(a)}</li>`).join('')}</ol><p><strong>Model answer: ${safe(c.answers[c.correct])}</strong></p><p>${safe(c.explanation)}</p>${sourceDetails(c)}<label for="note-${i}">Teammate’s verification note</label><textarea id="note-${i}" maxlength="600" placeholder="What did you confirm or flag?">${safe(check?.note || '')}</textarea><button class="quiet-button" data-check="${i}" data-result="approved">I checked this against the source</button><button class="quiet-button" data-check="${i}" data-result="flagged">Flag answer — exclude from quiz</button></details></div>`;
  }).join('');
  const links = p.relationships.map((r,i)=>{
    const content = `<span class="map-pair"><span>${safe(p.concepts[r.from].title)}</span><span aria-label="connects to">→</span><span>${safe(p.concepts[r.to].title)}</span></span><span class="connection-label">${safe(r.label)}</span>`;
    return course.mapFlags?.[i] ? `<details class="map-link"><summary>Connection ${i+1} flagged — excluded from the map</summary><p>${content}</p><p>Needs source review; not approved learning material.</p></details>` : `<div class="map-link">${content}<br><button class="quiet-button" data-flag-link="${i}">Flag connection ${i+1} for review</button></div>`;
  }).join('');
  const alignment = p.alignment.trim() === p.syllabus_id ? 'Compare these concepts with the cited syllabus objective; the model did not explain its alignment.' : p.alignment;
  $('study-card').innerHTML = `<p class="study-alignment">${safe(alignment)} <span class="source-ref">Syllabus reference: ${safe(p.syllabus_id)}</span></p>${material}
    <section><h2>Concept map · draft</h2><p>Check these proposed connections against the source references.</p><div aria-label="Concept relationships">${links}</div></section>
    <section class="review-sheet"><h2>Critical-review sheet · draft</h2><p><strong>Big picture.</strong> ${safe(p.review.big_picture)}</p><p><strong>Challenge the idea.</strong> ${safe(p.review.critical_question)}</p><p><strong>Limits / open questions.</strong> ${safe(p.review.limitation)}</p></section>
    <section><h2>Check the answer key</h2><p>Ask a teammate to compare each answer with the source. Flagged questions are excluded from the quiz.</p>${reviews}<button class="primary-button" id="start-all">Start quiz</button></section>`;
  $('audit-banner').textContent = 'Source IDs and quoted excerpts matched the uploaded text. Summaries, connections, and quiz answers remain model-generated and need human review.';
  $('audit-banner').classList.remove('hidden');
}
function setMode(mode) {
  currentMode = mode;
  $('mode-description').textContent = {
    focus: 'One concept at a time, with a short next action. ADHD-paced presentation.',
    read: 'All concepts in one view, with wider spacing and short lines. Dyslexia-friendly presentation.',
    listen: 'A linear outline with semantic headings and keyboard controls. Use with your screen reader.',
  }[mode];
  document.querySelectorAll('.mode-card').forEach(card => {
    const selected = card.dataset.mode === mode;
    card.classList.toggle('selected',selected); card.setAttribute('aria-checked',String(selected)); card.tabIndex=selected?0:-1;
  });
  renderStudy();
}
function indices(kind) {
  if (!course) return [];
  return course.plan.concepts.map((_,i)=>i).filter(i => course.checks[i]?.state !== 'flagged' && (kind==='all' || (kind==='missed' ? course.memory[i]?.correct === false : course.memory[i]?.correct === true && course.memory[i]?.confidence !== 'confident')));
}
function startQuiz(kind='all', navigate=true) {
  queue = indices(kind); questionIndex = 0;
  renderQuestion(); if (navigate) setView('quiz');
}
function renderQuestion() {
  $('confidence-wrap').classList.add('hidden'); $('feedback').classList.add('hidden'); $('next-question').classList.add('hidden');
  chosen = null; answered = false;
  if (!queue.length) {
    $('quiz-count').textContent = 'No eligible questions'; $('question-concept').textContent = '';
    $('question-text').textContent = 'No questions in this queue. Flagged questions are excluded; check the Memory tab or review your sources.';
    $('answers').innerHTML = ''; return;
  }
  const q = course.plan.concepts[queue[questionIndex]];
  $('quiz-count').textContent = `Question ${questionIndex+1} of ${queue.length}`;
  $('question-concept').textContent = `${q.title} · ${course.checks[queue[questionIndex]]?.state==='approved' ? 'human-checked' : 'model draft — not human-checked'}`;
  $('question-text').textContent = q.question;
  $('answers').innerHTML = q.answers.map((a,i)=>`<button class="answer" data-answer="${i}"><span>${String.fromCharCode(65+i)}.</span> ${safe(a)}</button>`).join('');
}
function selectAnswer(index) {
  if (answered) return;
  chosen = index;
  document.querySelectorAll('.answer').forEach((b,i)=>{b.classList.toggle('selected',i===index);b.setAttribute('aria-pressed',String(i===index));});
  $('confidence-wrap').classList.remove('hidden');
  document.querySelectorAll('[data-confidence]').forEach(b=>b.disabled=false);
}
function recordConfidence(value) {
  if (answered || chosen === null) return;
  answered = true;
  const index = queue[questionIndex], q = course.plan.concepts[index], correct = chosen===q.correct;
  course.memory[index] = {correct, confidence:value, attemptedAt:new Date().toISOString(), attempts:(course.memory[index]?.attempts||0)+1};
  const saved = persist();
  document.querySelectorAll('.answer').forEach((b,i)=>{b.disabled=true;b.classList.toggle('correct',i===q.correct);b.classList.toggle('wrong',i===chosen&&!correct);});
  document.querySelectorAll('[data-confidence]').forEach(b=>b.disabled=true);
  $('feedback').innerHTML = `<strong>${correct?'Correct against this answer key.':'Let’s revisit this idea.'}</strong> ${safe(q.explanation)} ${sourceDetails(q)}${saved?'':'<p>Warning: this attempt could not be saved to browser storage.</p>'}`;
  $('feedback').classList.remove('hidden');
  $('next-question').textContent = questionIndex===queue.length-1 ? 'See my next-session plan' : 'Continue';
  $('next-question').classList.remove('hidden'); updateFocus();
}
function renderMemory() {
  if (!course) return;
  const entries = Object.entries(course.memory), missed = indices('missed'), uncertain = indices('uncertain');
  $('memory-count').textContent = `${entries.length} concepts tracked in this source set`;
  $('plan-title').textContent = !entries.length ? 'Take a quiz to build your review plan' : missed.length ? `${missed.length} missed concept${missed.length===1?'':'s'} to revisit` : 'No missed concepts in the review queue';
  $('plan-copy').textContent = 'Missed-only review repeats the saved questions for concepts you answered incorrectly. Correct but uncertain answers have a separate practice queue. Flagged questions are excluded.';
  $('plan-tag').textContent = entries.length ? 'SAVED SIGNALS' : 'NOT ATTEMPTED';
  $('targeted-list').innerHTML = missed.map(i=>`<span class="target-chip">${safe(course.plan.concepts[i].title)}</span>`).join('');
  $('start-targeted').disabled = !missed.length;
  $('start-uncertain').disabled = !uncertain.length;
  $('start-uncertain').textContent = `Practice uncertain answers (${uncertain.length})`;
  $('memory-table').innerHTML = entries.length ? entries.map(([i,v])=>`<tr><td><strong>${safe(course.plan.concepts[i].title)}</strong></td><td>${v.correct?'Correct':'Incorrect'} · ${safe(v.confidence)}</td><td>${course.checks[i]?.state==='flagged'?'Excluded: human flagged':!v.correct?'Missed-only queue':v.confidence!=='confident'?'Optional confidence practice':'No immediate retry'}</td><td>${v.attempts} attempt${v.attempts===1?'':'s'}</td></tr>`).join('') : '<tr><td colspan="4">No attempts for these sources yet.</td></tr>';
}
function updateFocus() {
  $('course-name').textContent = course?.plan.title || 'Study workspace';
  const missed = indices('missed');
  $('focus-title').textContent = course ? (missed.length ? course.plan.concepts[missed[0]].title : course.plan.title) : 'Start with your material';
  $('signal-value').textContent = !course || !Object.keys(course.memory).length ? 'No attempts yet' : `${missed.length} missed · ${indices('uncertain').length} uncertain`;
}
async function checkModel() {
  try {
    const d = await api('/api/health');
    $('model-status').textContent = d.ready ? `● Local SLM · ${d.model}` : '○ Start Ollama · qwen2.5:3b required';
  } catch { $('model-status').textContent = '○ Start Echo: python3 server.py'; }
}

$('upload-form').addEventListener('submit', upload);
$('upload-form').addEventListener('change',()=>{pendingFiles=null;pendingBudget=null;$('generate-button').disabled=true;$('source-preview').classList.add('hidden');});
$('generate-button').addEventListener('click', generate);
$('refresh-plan').addEventListener('click',()=>setView('upload'));
document.querySelectorAll('.step').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.querySelectorAll('.mode-card').forEach((b,i,buttons)=>{
  b.addEventListener('click',()=>setMode(b.dataset.mode));
  b.addEventListener('keydown',event=>{if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(event.key)){event.preventDefault();const target=buttons[(i+(['ArrowRight','ArrowDown'].includes(event.key)?1:2))%3];setMode(target.dataset.mode);target.focus();}});
});
$('study-card').addEventListener('click',event=>{
  const button = event.target.closest('button'); if (!button) return;
  if (button.id==='focus-next'||button.id==='focus-prev') {focusStep+=button.id==='focus-next'?1:-1;renderStudy();$('study-card').querySelector('.focus-step h2').setAttribute('tabindex','-1');$('study-card').querySelector('.focus-step h2').focus();}
  if (button.id==='start-all') startQuiz();
  if (button.dataset.flagLink !== undefined) {
    course.mapFlags ||= {};
    course.mapFlags[button.dataset.flagLink] = true;
    persist(); renderStudy();
  }
  if (button.dataset.check !== undefined) {
    const index=button.dataset.check;
    course.checks[index]={state:button.dataset.result,note:$(`note-${index}`).value,at:new Date().toISOString()};
    const saved=persist(); queue=[]; renderStudy(); updateFocus();
    $('audit-banner').textContent = saved ? `Human review saved: ${course.plan.concepts[index].title} — ${button.dataset.result}.` : 'Review updated for this session but could not be saved. Browser storage is unavailable or full.';
  }
});
$('answers').addEventListener('click',event=>{const b=event.target.closest('[data-answer]');if(b)selectAnswer(Number(b.dataset.answer));});
document.querySelectorAll('[data-confidence]').forEach(b=>b.addEventListener('click',()=>recordConfidence(b.dataset.confidence)));
$('next-question').addEventListener('click',()=>{if(questionIndex+1<queue.length){questionIndex++;renderQuestion();}else{queue=[];setView('memory');}});
$('start-targeted').addEventListener('click',()=>startQuiz('missed'));
$('start-uncertain').addEventListener('click',()=>startQuiz('uncertain'));
$('restart-session').addEventListener('click',()=>{sessionStorage.setItem('echo-return-memory','yes');location.reload();});
$('course-list').addEventListener('click',event=>{
  const button=event.target.closest('button'); if (!button||busy) return;
  if (button.dataset.open) {library.active=button.dataset.open;course=library.courses[library.active];persist();queue=[];focusStep=0;renderCourse();setView('learn');}
  if (button.dataset.delete && confirm('Remove this saved study pack, its source text, and its progress from this browser? This cannot be undone. Your original files are not changed.')) {
    delete library.courses[button.dataset.delete];
    if(course?.id===button.dataset.delete){course=null;library.active=null;queue=[];}
    persist();renderCourse();status('Removed that saved pack, its extracted text, and progress from this browser. Original files were not changed.');setView('upload');
  }
});
renderCourse(); setMode('focus'); checkModel();
if(course){const memory=sessionStorage.getItem('echo-return-memory');sessionStorage.removeItem('echo-return-memory');setView(memory?'memory':'learn',false);}else setView('upload',false);
