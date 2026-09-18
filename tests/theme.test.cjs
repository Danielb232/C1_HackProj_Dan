const fs = require('node:fs');
const assert = require('node:assert/strict');
const css = fs.readFileSync('styles.css', 'utf8');
const tokens = Object.fromEntries([...css.matchAll(/--([a-z-]+):\s*(#[a-f\d]{6});/gi)].map(m => [m[1], m[2].toLowerCase()]));
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(foreground, background, minimum) {
  const a = luminance(tokens[foreground]), b = luminance(tokens[background]);
  const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  assert.ok(ratio >= minimum, `${foreground}/${background}: ${ratio.toFixed(2)} < ${minimum}`);
}
assert.equal(tokens.accent, '#007aff');
for (const surface of ['paper', 'white', 'soft', 'accent-soft']) {
  for (const text of ['ink', 'muted', 'accent-text']) contrast(text, surface, 4.5);
}
contrast('warning-text', 'warning-soft', 4.5);
contrast('error', 'paper', 4.5);
contrast('ink', 'success-soft', 4.5);
contrast('ink', 'error-soft', 4.5);
// Exact #007AFF with white is ~4.02:1. Primary labels use large bold text
// (19px / 700) so the applicable text-contrast threshold is 3:1.
const primary = css.match(/\.primary-button\s*\{([^}]+)\}/)[1];
assert.match(primary, /font-size:\s*19px/);
assert.match(primary, /font-weight:\s*700/);
contrast('on-accent', 'accent', 3);
contrast('on-accent', 'accent-hover', 3);
contrast('accent', 'paper', 3);
// Map nodes carry a white concept number, and legend dots must be distinguishable on paper.
for (const status of ['status-unseen', 'status-missed', 'status-learning', 'status-mastered']) {
  contrast('on-accent', status, 4.5);
  contrast(status, 'paper', 3);
}
assert.doesNotMatch(css, /#315c47|#244936|#fafaf7|#f0f3ee/i);
console.log('PASS: exact blue accent, readable text/surface pairs, primary-label contrast, semantic feedback colors');
