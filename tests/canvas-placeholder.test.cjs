const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const panel = html.match(/<section[^>]*id="canvas-source"[^>]*>([\s\S]*?)<\/section>/)?.[1];
assert.ok(panel, 'Canvas placeholder exists');
assert.match(panel, /Coming soon/);
assert.match(panel, /your Canvas courses/);
assert.doesNotMatch(panel, /University of Washington|canvas\.uw\.edu/i);
assert.match(panel, /Canvas is not connected yet/);
for (const id of ['canvas-connect', 'canvas-course', 'canvas-materials']) {
  const button = panel.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))?.[0];
  assert.ok(button, `${id} is available for integration handoff`);
  assert.match(button, /\sdisabled(?:\s|>)/);
  assert.match(button, /type="button"/);
  assert.match(button, /aria-describedby="canvas-note"/);
}
assert.doesNotMatch(panel, /<(?:input|form|script)\b/, 'No credential fields or pretend integration');
assert.ok(html.indexOf('id="upload-form"') > html.indexOf(panel), 'Upload flow remains separate');
console.log('PASS: honest, disabled Canvas placeholders; no credentials; separate upload flow');
