import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/LivePaperRenderer.jsx', import.meta.url), 'utf8');
const vertex = source.split('const VERTEX = \`')[1]?.split('\`;')[0];
const fragment = source.split('const PAPER_FRAGMENT = \`')[1]?.split('\`;')[0];

test('only the paper center-opening geometry gets a rim surface', () => {
  assert.ok(vertex && fragment);
  assert.match(vertex, /float toroidY = rimRadius \*/);
  assert.match(vertex, /float toroidZ = rimRadius \*/);
  assert.match(vertex, /float rimAngle = mix\(3\.141593, \.872665, emergence\)/);
  assert.match(source, /uRimRadius: \{ value: 1 \}/);
  assert.match(source, /uExitWrap\.value = pose\.wrap \?\? 0/);
  assert.match(source, /Math\.min\(width, height\) \* \.33 \* \(\.11 \/ \.312\)/);
});

test('outer edge reveals first while still crossing the hole', () => {
  assert.match(vertex, /float acrossRim = emergence \+ across \* \.52;/);
  assert.match(vertex, /float visibleFraction = smoothstep\(\.28, \.56, acrossRim\);/);
  assert.match(vertex, /vOpeningReveal = mix\(1\.0, visibleFraction, rimGate\);/);
  assert.match(fragment, /float alpha = paper\.a \* uOpacity \* vOpeningReveal;/);
  // The original white/clear alpha mask must remain in place.
  assert.match(fragment, /alpha \*= 1\. - maskAlpha \* uHeadOpacity;/);
});

test('free-flight geometry and alpha are unmodified after rimGate becomes zero', () => {
  assert.match(vertex, /float rimGate = clamp\(uExitWrap, 0\.0, 1\.0\);/);
  assert.match(vertex, /pos\.xy = vec2\(along, mix\(bentAcross, toroidY, rimGate\)\);/);
  assert.match(vertex, /pos\.z = mix\(originalZ, toroidZ \+ paperRipple, rimGate\);/);
  assert.match(vertex, /vOpeningReveal = mix\(1\.0, visibleFraction, rimGate\);/);
  // The pre-existing paper behavior must remain the neutral component.
  assert.match(vertex, /float originalZ = bulge \* \.72 \+ paperRipple \+ ringLipArc;/);
});
