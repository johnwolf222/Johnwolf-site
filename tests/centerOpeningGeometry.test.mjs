import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/LivePaperRenderer.jsx', import.meta.url), 'utf8');
const vertex = source.split('const VERTEX = \`')[1]?.split('\`;')[0];
const fragment = source.split('const PAPER_FRAGMENT = \`')[1]?.split('\`;')[0];

test('the center opening feeds each vertex over a curved physical rim', () => {
  assert.ok(vertex && fragment);
  assert.match(vertex, /vec2 openingCurve\(float s, float radius\)/);
  assert.match(vertex, /float arcEnd = radius \* \(3\.141593 - \.872665\)/);
  assert.match(vertex, /vec2 vertexOnRim = openingCurve\(distance, arcRadius\)/);
  assert.match(vertex, /float depthBase = uFocal - uFocal \/ \.55 - arcRadius;/);
  assert.match(vertex, /vec3 rimWorld = radial \* vertexOnRim\.x \+/);
  assert.match(vertex, /float distance = centerTravel - position\.y \* uSheetExtent;/);
  assert.match(source, /uOuterRim: \{ value: 1 \}/);
  assert.match(source, /uFocal: \{ value: FOCAL \}/);
  assert.match(source, /uOutward: \{ value: new THREE\.Vector2\(1, 0\) \}/);
});

test('the trailing paper reveals only after crossing the inner lip', () => {
  assert.match(vertex, /float visibleFraction = smoothstep\(0\.0,/);
  assert.match(vertex, /arcRadius \* \.42 \* 1\.570796, distance\)/);
  assert.match(vertex, /vOpeningReveal = mix\(1\.0, visibleFraction, rimGate\);/);
  assert.match(fragment, /float alpha = paper\.a \* uOpacity \* vOpeningReveal;/);
  assert.match(fragment, /alpha \*= 1\. - maskAlpha \* uHeadOpacity;/);
});

test('free flight uses the exact unchanged projection branch', () => {
  assert.match(vertex, /if \(rimGate > \.0001\) \{/);
  assert.match(vertex, /gl_Position = projectionMatrix \* modelViewMatrix \*/);
  assert.match(vertex, /vec4\(pos, 1\.0\);/);
  assert.match(vertex, /vOpeningReveal = 1\.0;/);
});

import { createHomePaperMotion } from '../src/HomePaperMotion.js';

test('guided entry remains intact and flight has bounded continuous rotation', () => {
  const motion = createHomePaperMotion(1280,720);
  for(let id=0;id<21;id++){
    const start=motion.pose(id,.015/12);
    const lip=motion.pose(id,1.7/12);
    const end=motion.pose(id,5/12);
    assert.ok(start.z < -680 && lip.z > -290);
    assert.ok(Math.hypot(end.x,end.y) > Math.hypot(lip.x,lip.y)+60);
    let prior=motion.pose(id,1.6/12);
    for(let frame=97;frame<=420;frame++){
      const next=motion.pose(id,frame/720);
      for(const key of ['rx','ry','rz']){
        assert.ok(Number.isFinite(next[key]));
        assert.ok(Math.abs(next[key]-prior[key]) < 6,
          'no rotational discontinuity: '+id+'/'+frame+'/'+key);
      }
      prior=next;
    }
  }
});


test('center approach reaches the inner rim before sheet release', () => {
  const motion = createHomePaperMotion(738,414);
  for (let id = 0; id < 21; id++) {
    const pose = motion.pose(id,.9/12);
    const projectedRadius = Math.hypot(pose.x,pose.y) *
      1350 / (1350 - pose.z);
    assert.ok(projectedRadius > 78 && projectedRadius < 90,
      'emerging sheet must remain at the inner throat: ' + id +
        ', radius ' + projectedRadius);
  }
});


test('inner rim projects to the opening instead of the card center', () => {
  const focal = 1350;
  for (const [width, height] of [[390, 844], [738, 414], [1280, 720]]) {
    const short = Math.min(width, height);
    const ringOuter = short * .33 / .55;
    const arcRadius = ringOuter * (.11 / .312);
    const depthBase = focal - focal / .55 - arcRadius;
    const innerRadius = ringOuter - arcRadius;
    const projected = innerRadius * focal / (focal - depthBase);
    assert.ok(projected > short * .195 && projected < short * .215,
      'hole throat should appear on the same visible rim across viewports');
  }
  assert.match(vertex, /if \(s < 0\.0\) return vec2\(uOuterRim - radius, s\);/);
  assert.match(source, /const openingSheetSize = Math\.min\(390,/);
  assert.match(source, /Math\.min\(width, height\) \* \.55\)/);
  assert.match(source, /openingSheetSize \* item\.heightFactor;/);
  assert.match(source, /openingSheetSize \* item\.widthFactor;/);
});

test('the paper presents its narrow rim-facing edge before its printed face', () => {
  assert.match(vertex, /float advance = smoothstep\(\.42, 2\.76, uTime\);/);
  const ease = t => {
    const p = Math.max(0, Math.min(1, (t - .42) / (2.76 - .42)));
    return p * p * (3 - 2 * p);
  };
  const short = 414, sheet = Math.min(390, short * .55);
  const rim = short * .33 / .55 * (.11 / .312);
  const start = -sheet / 2 - .1 * rim;
  const end = rim * (Math.PI - .872665) + sheet / 2;
  const at = t => start + (end - start) * ease(t);
  // In the early entry only the leading part of the sheet has
  // crossed the lip; the wide printed face stays hidden.
  assert.ok(at(.9) < 0);
  assert.ok(at(1.6) > 0);
  assert.ok(at(2.25) > rim);
  assert.match(vertex, /float visibleFraction = smoothstep\(0\.0,/);
});
