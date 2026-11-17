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
  assert.match(vertex, /float limit = radius \* \(3\.141593 - \.872665\)/);
  assert.match(vertex, /vec2 centerOnRim = openingCurve\(centerTravel, arcRadius\)/);
  assert.match(vertex, /vec2 vertexOnRim = openingCurve\(distance, arcRadius\)/);
  assert.match(vertex, /vec3 rimWorld = uCardCenter \+/);
  assert.match(source, /uArcRadius: \{ value: 1 \}/);
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

test('entry begins along the inner throat; free flight retains its approved samples', () => {
  const code = readFileSync(new URL('../src/HomePaperMotion.js', import.meta.url), 'utf8');
  assert.match(code, /const startR = ring \* \.75;/);
  assert.match(code, /const controlR1 = ring \* \.74;/);
  assert.match(code, /const controlR2 = ring \* \.81;/);
  assert.match(code, /const lipR = ring \* 1\.08;/);
  const motion = createHomePaperMotion(1280,720);
  const approved = [{"id":0,"time":2,"xyz":[292.94969050916006,6.84563545105634,-175.37459993209418],"rotation":[-10.54450517322082,19.379585948718375,79.7800319812095]},{"id":5,"time":4,"xyz":[366.3294092155736,-302.4033840601245,-21.94947952946829],"rotation":[-0.8104326345262738,40.7710587582229,756.8241943988892]},{"id":12,"time":7,"xyz":[-653.1788277099239,-365.0952972916118,166.5117762030517],"rotation":[21.797517411081934,-28.804068776086332,1769.6883838936337]},{"id":20,"time":2.5,"xyz":[-227.88494256235515,-252.99643621662403,-111.08732896636948],"rotation":[-9.63100961476302,3.571454870604627,2846.861086743537]}];
  for (const sample of approved) {
    const pose = motion.pose(sample.id, sample.time/12);
    const observed = [pose.x,pose.y,pose.z,pose.rx,pose.ry,pose.rz];
    const expected = [...sample.xyz,...sample.rotation];
    observed.forEach((value,i) => assert.ok(Math.abs(value-expected[i]) < 1e-9,
      'approved flight state altered after leaving the rim: ' + sample.id +
        '/' + sample.time + '/' + i));
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
