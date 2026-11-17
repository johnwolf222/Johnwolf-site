import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/LivePaperRenderer.jsx', import.meta.url), 'utf8');
const vertex = source.split('const VERTEX = \`')[1]?.split('\`;')[0];

test('the GPU paper curl follows horizontal fold lines on each sheet', () => {
  assert.ok(vertex, 'the paper vertex shader is present');
  assert.match(vertex, /float across = pos\.y;/);
  assert.match(vertex, /float along = pos\.x;/);
  assert.match(vertex, /float phi = across \* bend;/);
  assert.match(vertex, /pos\.xy = vec2\(along \+ twist, bentAcross\);/);
});

test('the primary paper ripple runs across rows rather than vertical columns', () => {
  assert.match(vertex, /sin\(across \* 13\.8/);
  assert.match(vertex, /sin\(across \* 21\./);
  assert.doesNotMatch(vertex, /float a = \.34 \+ uSeed \* \.041/);
});
