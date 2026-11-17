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
  assert.match(post, /vec3 spectralWeight\(float t\)/);
  assert.match(post, /colorAccum \+= ink\.rgb \* wavelength/);
  assert.match(source, /renderer\.setRenderTarget\(paperTarget\)/);
  assert.match(source, /renderer\.render\(world, camera\)/);
  assert.match(source, /renderer\.render\(raysScene, raysCamera\)/);
});

test('optical effect fades before paper enters the projects gallery', () => {
  assert.match(source, /1 - progress \/ \.18/);
  assert.match(source, /raysMaterial\.uniforms\.uRayStrength\.value/);
});


test('color separation is confined to ring crossing and section exit', () => {
  assert.match(post, /float throatWidth = max\(1\.0, uRingRadius \* \(0\.11 \/ 0\.312\)\)/);
  assert.match(post, /float holePosition = \(distanceFromHole - uRingRadius\) \/ throatWidth/);
  assert.match(post, /exp\(-pow\(\(holePosition \+ 1\.0\) \/ 0\.60, 2\.0\)\)/);
  assert.match(post, /float edgeWeight = uEdgeRays \* ease01/);
  assert.match(post, /float nearReach = throatWidth \* holeWeight \* 0\.46;/);
  assert.match(post, /float edgeReach = shorter \* edgeWeight \* 0\.058;/);
  assert.match(post, /float reach = uRayStrength \* \(nearReach \+ edgeReach\);/);
  assert.match(post, /if \(reach < 0\.75\)/);
  assert.doesNotMatch(post, /reach = min\(48\.0/);
});


test('inner rim optics align with the reference throat, without changing edge optics', () => {
  assert.match(source, /Math.min\(width, height\) \* \.33 \* dpr/);
  assert.match(post, /float throatWidth = max\(1\.0, uRingRadius \* \(0\.11 \/ 0\.312\)\)/);
  assert.match(post, /float edgeReach = shorter \* edgeWeight \* 0\.058;/);
  assert.match(post, /float sampleCount = clamp\(ceil\(reach \/ 3\.0\), 4\.0, 16\.0\)/);
});


test('the center optical pass creates a clear hole with colored paper on its inner rim', () => {
  assert.match(post, /float innerRim = max\(1\.0, uRingRadius - throatWidth\)/);
  assert.match(post, /float innerVisibility = 1\.0 -/);
  assert.match(post, /exp\(-pow\(distanceFromHole \/ max\(1\.0, innerRim \* 0\.82\), 2\.0\)\)/);
  assert.match(post, /vec3 spectralWeight\(float t\)/);
  assert.match(post, /colorAccum \+= ink\.rgb \* wavelength/);
  assert.match(post, /coverAccum \+= ink\.a \* wavelength/);
  assert.match(post, /float sampleCount = clamp\(ceil\(reach \/ 3\.0\), 4\.0, 16\.0\)/);
  assert.match(post, /visibleColor \* innerVisibility/);
  assert.match(post, /coverage \* innerVisibility/);
  assert.doesNotMatch(post, /mix\(original\.rgb, fringeColor/);
});

test('chromatic paper edges preserve sampled channel separation', () => {
  assert.match(post, /mod\(t \* 4\.0 \+ vec3\(0\.0, 4\.0, 2\.0\), 6\.0\)/);
  assert.match(post, /return mix\(vec3\(1\.0\), prism, 0\.85\);/);
  assert.match(post, /colorAccum \+= ink\.rgb \* wavelength;/);
  assert.match(post, /coverAccum \+= ink\.a \* wavelength;/);
  assert.match(post, /visibleColor = colorAccum \/\s*max\(weightAccum/);
  assert.doesNotMatch(post, /colorAccum \+= ink\.rgb \* ink\.a \* wavelength/);
  assert.doesNotMatch(post, /premultiplied \/ max\(coverage/);
});
