import test from 'node:test';
import assert from 'node:assert/strict';
import { createFloatingPaperDynamics, sampleSharedAir } from
  '../src/HomePaperAirflow.js';
import { createHomePaperMotion, HOME_PAPER_PRESET } from
  '../src/HomePaperMotion.js';

test('the air field is shared, smooth and independent of sheet index', () => {
  const before = sampleSharedAir(180, 50, -160, 3.2, 1);
  const again = sampleSharedAir(180, 50, -160, 3.2, 1);
  const next = sampleSharedAir(181, 50, -160, 3.217, 1);
  assert.deepEqual(before, again);
  assert.notDeepEqual(before, next);
  const delta = Math.hypot(...next.velocity.map((n,i) => n-before.velocity[i]));
  assert.ok(delta < 2, 'shared current must evolve continuously');
});

test('a paper sheet develops bounded three-axis motion from the wind', () => {
  const initial = {
    seed: 1, birth: 0, theta: Math.PI / 4,
    ringRotation: [5, 10, 120],
    position: [200, 200, -224],
    velocity: [90, 90, 140],
    radialSpeed: 123,
  };
  const first = createFloatingPaperDynamics(initial);
  const second = createFloatingPaperDynamics(initial);
  let previous = null, changedAxes = [0, 0, 0];
  for (let step = 1; step <= 440; step++) {
    const a = first.step(step / 60);
    const b = second.step(step / 60);
    assert.deepEqual(a, b, 'tumbling must be deterministic for scroll rewind');
    for (const key of ['x','y','z','rx','ry','rz','curl','flutter'])
      assert.ok(Number.isFinite(a[key]), 'finite pose: ' + key);
    if (previous) {
      for (let axis = 0; axis < 3; axis++) {
        const key = ['rx', 'ry', 'rz'][axis];
        const delta = Math.abs(a[key] - previous[key]);
        changedAxes[axis] += delta;
        assert.ok(delta < 5, 'no sudden rotational pop on ' + key);
      }
    }
    previous = a;
  }
  assert.ok(changedAxes.every(v => v > 5), 'wind moves all 3 rotation axes');
});

test('each of the 21 sheets keeps moving outward with smooth flight frames', () => {
  const motion = createHomePaperMotion(1280, 720);
  for (let id = 0; id < HOME_PAPER_PRESET.count; id++) {
    let previous = null;
    for (let frame = 0; frame <= 540; frame++) {
      const p = motion.pose(id, frame / 720);
      if (previous) {
        assert.ok(Math.hypot(p.x - previous.x, p.y - previous.y) < 9);
        assert.ok(Math.abs(p.rz - previous.rz) < 6);
      }
      previous = p;
    }
    const lip = motion.pose(id, 1.7 / 12);
    const away = motion.pose(id, 5 / 12);
    assert.ok(Math.hypot(away.x, away.y) >
      Math.hypot(lip.x, lip.y) + 60);
    assert.ok(away.flutter > .1 && away.curl > .1);
  }
});

test('curl and flutter controls remain truly independent', () => {
  const plain = createHomePaperMotion(1280, 720,
    { ...HOME_PAPER_PRESET, curl: 0, flutter: 0 });
  const visible = createHomePaperMotion(1280, 720);
  for (let i = 0; i < HOME_PAPER_PRESET.count; i++) {
    assert.equal(plain.pose(i, 4 / 12).curl, 0);
    assert.equal(plain.pose(i, 4 / 12).flutter, 0);
    assert.ok(visible.pose(i, 4 / 12).curl > .1);
    assert.ok(visible.pose(i, 4 / 12).flutter > .1);
  }
});
