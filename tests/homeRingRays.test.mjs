import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHomePaperMotion, HOME_PAPER_PRESET } from '../src/HomePaperMotion.js';

const source = readFileSync(new URL('../src/LivePaperRenderer.jsx', import.meta.url), 'utf8');
const vertex = source.split('const VERTEX = \`')[1]?.split('\`;')[0];
const post = source.split('const RAYS_FRAGMENT = \`')[1]?.split('\`;')[0];

test('ring lip wraps the geometry only while each sheet exits', () => {
  const motion = createHomePaperMotion(1216, 690);
  for (let i = 0; i < HOME_PAPER_PRESET.count; i++) {
    const approach = motion.pose(i, .9 / 12);
    const flying = motion.pose(i, 3 / 12);
    assert.ok(approach.wrap > .75, 'visible wrap at the lip ' + i);
    assert.ok(flying.wrap < .001, 'lip wrap clears in free flight ' + i);
    assert.ok(approach.opacity > 0, 'sheet exists at lip ' + i);
  }
  assert.match(vertex, /uExitWrap \* 2\.0/);
  assert.match(vertex, /vec2 openingCurve\(float s, float radius\)/);
  assert.match(source, /uExitWrap\.value = pose\.wrap \?\? 0/);
});

test('optical pass samples chromatic streaks from the paper layer', () => {
  assert.ok(post, 'postprocess shader is registered');
  assert.match(post, /uniform sampler2D uPaper;/);
  assert.match(post, /float holeWeight = uNearRays/);
  assert.match(post, /float edgeWeight = uEdgeRays/);
  assert.match(post, /vec3 spectrum = vec3\(/);
  assert.match(post, /sampleColor\.rgb \* sampleColor\.a \* spectrum/);
  assert.match(source, /renderer\.setRenderTarget\(paperTarget\)/);
  assert.match(source, /renderer\.render\(world, camera\)/);
  assert.match(source, /renderer\.render\(raysScene, raysCamera\)/);
});

test('optical effect fades before paper enters the projects gallery', () => {
  assert.match(source, /1 - progress \/ \.18/);
  assert.match(source, /raysMaterial\.uniforms\.uRayStrength\.value/);
});


test('color separation is confined to ring crossing and section exit', () => {
  assert.match(post, /float throatWidth = max\(1\.0, uRingRadius \* \(\.11 \/ \.312\)\)/);
  assert.match(post, /float throatPosition = \(radialDistance - uRingRadius\) \/ throatWidth/);
  assert.match(post, /exp\(-pow\(\(throatPosition \+ 1\.0\) \/ \.60, 2\.0\)\)/);
  assert.match(post, /float edgeInset = min\(/);
  assert.match(post, /smoothstep\(shortSide \* \.025, shortSide \* \.16, edgeInset\)/);
  assert.match(post, /float effect = clamp\(max\(holeWeight, edgeWeight\) \* uRayStrength/);
  assert.match(post, /if \(effect < \.006\) \{\s*gl_FragColor = original;/);
  assert.match(post, /float nearReach = throatWidth \* holeWeight \* \.46;/);
  assert.match(post, /float edgeReach = edgeWeight \* \(3\.0 \+ shortSide \* \.024\);/);
  assert.match(post, /float reach = uRayStrength \* max\(nearReach, edgeReach\);/);
  assert.doesNotMatch(post, /reach = min\(48\.0/);
});


test('inner rim optics align with the reference throat, without changing edge optics', () => {
  assert.match(source, /Math.min\(width, height\) \* \.33 \* dpr/);
  assert.match(post, /float throatWidth = max\(1\.0, uRingRadius \* \(\.11 \/ \.312\)\)/);
  assert.match(post, /float edgeReach = edgeWeight \* \(3\.0 \+ shortSide \* \.024\);/);
  assert.match(post, /max\(holeWeight \* \.80, edgeWeight \* \.56\)/);
});
