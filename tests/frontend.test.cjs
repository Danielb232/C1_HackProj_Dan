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
app.run("startQuiz('missed')");
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
