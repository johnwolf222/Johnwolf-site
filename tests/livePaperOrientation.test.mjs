import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/LivePaperRenderer.jsx', import.meta.url), 'utf8');
const vertex = source.split('const VERTEX = \`')[1]?.split('\`;')[0];

test('the GPU paper retains a horizontal curl across each sheet', () => {
  assert.ok(vertex, 'the paper vertex shader is present');
  assert.match(vertex, /float across = pos\.y;/);
  assert.match(vertex, /float along = pos\.x;/);
  assert.match(vertex, /float phi = across \* bend;/);
  assert.match(vertex, /pos\.xy = vec2\(along, bentAcross\);/);
});

test('subtle flutter varies across paper width, independent of the horizontal curl', () => {
  assert.match(vertex, /float ripplePhase = along \* 3\.14159/);
  assert.match(vertex, /float paperRipple = uFlutter \* \.042 \* sin\(ripplePhase\);/);
  assert.match(vertex, /float rippleSlope = uFlutter \* \.042 \* 3\.14159/);
  assert.doesNotMatch(vertex, /sin\(across \* 13\.8/);
  assert.doesNotMatch(vertex, /float twist =/);
});

test('curl and flutter can be independently enabled or disabled', () => {
  assert.match(vertex, /float bend = max\(\.0001, uCurl \* 2\.12 \+ uExitWrap \* 2\.0\)/);
  assert.match(vertex, /pos\.z = bulge \* \.72 \+ paperRipple;/);
});
