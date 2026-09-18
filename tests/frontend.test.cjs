// No browser state is touched: exercise app logic with a minimal DOM test double.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const storage = new Map();
function boot() {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {innerHTML:'',textContent:'',dataset:{},disabled:false,
        classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),toggle:(c,v)=>v?classes.add(c):classes.delete(c),contains:c=>classes.has(c)},
        addEventListener(){}, setAttribute(){}, removeAttribute(){}, scrollIntoView(){},
        querySelectorAll(){return []}, insertAdjacentHTML(_,html){this.innerHTML+=html}});
    }
    return elements.get(id);
  }
  const context = vm.createContext({console, Date, JSON, String, Number, Object, Array, Map, Set,
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    sessionStorage:{getItem:()=>null,removeItem(){},setItem(){}},
    document:{getElementById:element,querySelectorAll:()=>[],querySelector:()=>element('selector')},
    fetch:async()=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>({ready:true,model:'test'})}),
    setInterval, clearInterval, location:{reload(){}}, confirm:()=>false});
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  return {context,element,run:code=>vm.runInContext(code,context)};
}
let app=boot();
app.run(`
course={id:'test-a', created:new Date().toISOString(),memory:{},checks:{},sources:{reading:{name:'reading.txt',kind:'text section',chunks:[{id:'R1',page:1,text:'Source text'}]},syllabus:{name:'syllabus.txt',kind:'text section',chunks:[{id:'S1',page:1,text:'Goals'}]}},plan:{title:'Test A',alignment:'Goals',syllabus_id:'S1',review:{big_picture:'A',critical_question:'B',limitation:'C'},relationships:[{from:0,to:1,label:'relates'},{from:1,to:2,label:'supports'}],concepts:[0,1,2].map(i=>({title:'Concept '+i,summary:'Summary',source_id:'R1',quote:'Source text',question:'Question '+i,answers:['A','B','C','D'],correct:1,explanation:'Because B'}))}};
library.courses[course.id]=course;library.active=course.id;
startQuiz('all');selectAnswer(0);
`);
assert.equal(app.element('feedback').classList.contains('hidden'),true,'Answer must be hidden until confidence is given');
assert.equal(app.run('Object.keys(course.memory).length'),0);
app.run("recordConfidence('confident');questionIndex++;renderQuestion();selectAnswer(1);recordConfidence('guessing');questionIndex++;renderQuestion();selectAnswer(1);recordConfidence('confident');");
assert.equal(app.run("JSON.stringify(indices('missed'))"),'[0]');
assert.equal(app.run("JSON.stringify(indices('uncertain'))"),'[1]');
assert.equal(app.run('course.sessions'),1,'A quiz run is one session');
assert.equal(app.run("[0,1,2].map(i=>progressFor(i).status).join()"),'missed,learning,mastered','Wrong → missed; correct-unsure holds box 1; correct-confident reaches mastery box');
assert.equal(app.run("[0,1,2].map(i=>progressFor(i).nextDueSession).join()"),'2,2,3','Missed and unsure concepts are due next session; mastered waits a box longer');
app.run("startQuiz('missed')");
assert.equal(app.run('course.sessions'),2);
assert.equal(app.element('quiz-count').textContent,'Question 1 of 1');
assert.equal(app.element('question-text').textContent,'Question 0');
app=boot();
assert.equal(app.run('course.id'),'test-a','Real save/restore must retain course');
assert.equal(app.run("JSON.stringify(indices('missed'))"),'[0]','Missed queue must survive reload');
app.run("course.checks[0]={state:'flagged'}");
assert.equal(app.run("indices('missed').length"),0,'Flagged question must be excluded');
app.run("const oldCourse=course;course=JSON.parse(JSON.stringify(course));course.id='test-b';course.memory={};course.checks={};library.courses[course.id]=course;library.active=course.id;persist();");
assert.equal(app.run("indices('missed').length"),0,'New source set must not inherit learning signals');
assert.equal(app.run('Object.keys(oldCourse.memory).length'),3,'Switching courses must preserve old memory');
assert.equal(app.run(`safe('<img src=x onerror="x">')`),'&lt;img src=x onerror=&quot;x&quot;&gt;');
console.log('PASS: confidence-before-feedback, missed-only filter, uncertain queue, reload persistence, human flags, course isolation, escaped output');
app.run("setView('upload',false)");
assert.equal(app.element('workspace-title').textContent,'Add course material');
assert.equal(app.element('session-summary').classList.contains('hidden'),true);
app.run("setView('learn',false);setMode('read')");
assert.equal(app.element('workspace-title').textContent,app.run('course.plan.title'));
assert.equal(app.element('session-summary').classList.contains('hidden'),false);
assert.match(app.element('mode-description').textContent,/Dyslexia-friendly/);
app.run("setView('showcase',false)");
assert.equal(app.element('workspace-title').textContent,'Judge demo guide');
console.log('PASS: workflow headings, contextual summary visibility, mode explanations, separate demo guide');
app.run("pendingFiles={};pendingBudget={fits:false};setBusy(false)");
assert.equal(app.element('generate-button').disabled, true, 'Over-budget generation stays disabled after loading');
app.run("pendingBudget={fits:true};setBusy(false)");
assert.equal(app.element('generate-button').disabled, false);
app.run("setBusy(true)");
assert.equal(app.element('generate-button').disabled, true);
app.run("renderBudget({fits:false,error:'Model unavailable'})");
assert.equal(app.element('context-budget').textContent, 'Model unavailable');
app.run("renderBudget({fits:false,prompt_estimate:9000,prompt_budget:7000,remaining:-2000,context:12000,model_max:32000,output_reserve:2100,template_reserve:256,safety_reserve:2400,calibration_samples:0,source_estimates:{syllabus:100,reading:8000}})");
assert.match(app.element('context-budget').textContent, /Over estimated budget/);
assert.match(app.element('context-budget').textContent, /not tokenizer measurements/);
assert.match(app.element('context-budget').textContent, /2,000 estimated tokens/);
console.log('PASS: context budget gating, unavailable model feedback, honest estimates');

(async()=>{
  const streamApp = boot(); streamApp.context.TextDecoder = TextDecoder;
  const events = [];
  const data = Buffer.from('{"type":"progress","message":"Checking…"}\n{"type":"result","data":{"id":"stream-test"}}\n');
  const chunks = [data.subarray(0,12),data.subarray(12,44),data.subarray(44)];
  streamApp.context.fetch = async()=>({ok:true,headers:{get:()=> 'application/x-ndjson'},body:{getReader:()=>({
    read:async()=>chunks.length?{value:chunks.shift(),done:false}:{done:true},cancel:async()=>{},releaseLock(){}
  })}});
  streamApp.context.onTestProgress = message=>events.push(message);
  const result = await streamApp.run('streamGuide({},onTestProgress)');
  assert.equal(result.id,'stream-test'); assert.equal(events[0],'Checking…');
  streamApp.context.fetch = async()=>({ok:false,json:async()=>({error:'Already generating'})});
  await assert.rejects(streamApp.run('streamGuide({},onTestProgress)'),/Already generating/);
  console.log('PASS: split streamed messages, UTF-8 progress, completed guide, busy response');
})().catch(error=>{console.error(error);process.exitCode=1;});
// Leitner ladder is a pure function of the previous record, so the demo story is checkable directly.
assert.equal(app.run("var r=advance(undefined,false,'confident',1);JSON.stringify([r.box,r.status,r.nextDueSession])"),'[1,"missed",2]');
assert.equal(app.run("var r=advance({box:1,timesMissed:1},true,'confident',2);JSON.stringify([r.box,r.status,r.nextDueSession])"),'[2,"mastered",4]','Miss, then confident recovery next session → mastered');
assert.equal(app.run("var r=advance({box:1,timesMissed:1},true,'guessing',2);JSON.stringify([r.box,r.status])"),'[1,"relearning"]','A correct guess after a miss is not mastery');
assert.equal(app.run("var r=advance({box:1,timesMissed:1},false,'confident',2);JSON.stringify([r.box,r.status])"),'[1,"relearning"]','Second miss → relearning');
assert.equal(app.run("var r=advance({box:5,timesMissed:0},true,'confident',3);JSON.stringify([r.box,r.nextDueSession])"),'[5,8]','Box is capped and spacing grows with the box');
assert.equal(app.run("var r=advance({box:3,timesMissed:0},false,'confident',4);JSON.stringify([r.box,r.status])"),'[1,"missed"]','A mastered concept that is missed drops back to box 1');
assert.equal(app.run("course.memory={0:{correct:false,confidence:'confident',attempts:1}};progressFor(0).status"),'missed','Records saved before progression existed still get a status');
// The map is inline SVG built from the plan: one focusable node per concept, colored by status, flagged links dashed.
app.run("course.memory={};course.mapFlags={};setMode('focus');course.sessions=0;startQuiz('all',false);selectAnswer(0);recordConfidence('confident');questionIndex++;renderQuestion();selectAnswer(1);recordConfidence('confident');setMode('read')");
const card = app.element('study-card').innerHTML;
assert.match(card, /<svg class="map-svg"/);
assert.match(card, /class="map-node missed" role="button" tabindex="0" data-map-node="0"/, 'Missed concept node is red');
assert.match(card, /class="map-node mastered" role="button" tabindex="0" data-map-node="1"/, 'Mastered concept node is green');
assert.match(card, /class="map-node unseen" role="button" tabindex="0" data-map-node="2"/, 'Unattempted concept node is grey');
assert.equal((card.match(/<g class="map-edge">/g)||[]).length, 2, 'Both proposed connections are drawn');
assert.match(card, /aria-label="Concept 1: Concept 0\. Missed\./);
app.run("course.mapFlags={1:true};renderStudy()");
assert.match(app.element('study-card').innerHTML, /<g class="map-edge flagged">.*Connection 2 flagged/, 'Flagged connection is drawn dashed and labeled');
app.run("setMode('focus');focusStep=2;renderStudy()");
assert.match(app.element('study-card').innerHTML, /class="map-node unseen current"/, 'Focus mode highlights the current concept on the map');
app.run("selectMapNode(0)");
assert.match(app.element('map-detail').innerHTML, /<strong>1\. Concept 0<\/strong> · <span class="status-dot missed"><\/span>Missed · box 1 of 5 · 1 attempt/);
app.run("course.plan.concepts[0].title='<b>x</b>';renderStudy()");
assert.doesNotMatch(app.element('study-card').innerHTML, /<b>x<\/b>/, 'Map labels are escaped');
app.run("renderMemory()");
assert.match(app.element('memory-table').innerHTML, /Missed · box 1<\/td>.*Missed-only queue · due in session 2/);
console.log('PASS: Leitner ladder, session counting, SVG concept map colored by progress, flagged edges, focus highlight, escaped labels');
