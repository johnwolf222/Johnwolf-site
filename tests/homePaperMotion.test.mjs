import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHomePaperMotion, HOME_PAPER_PRESET,
} from '../src/HomePaperMotion.js';

test('approved Hole 01-inspired homepage keeps its 21 live sheets and timing', () => {
  assert.equal(HOME_PAPER_PRESET.count, 21);
  assert.equal(HOME_PAPER_PRESET.duration, 12);
  assert.equal(HOME_PAPER_PRESET.flight, 9);
  assert.equal(HOME_PAPER_PRESET.ring, .31);
  const motion = createHomePaperMotion(1280, 720);
  for (let sec = 0; sec <= 12; sec++) {
    const positions = Array.from({ length: 21 },
      (_, i) => motion.pose(i, motion.age(i, sec)));
    const visible = positions.filter(x => x.opacity > .12);
    assert.ok(visible.length >= 12 && visible.length <= 18,
      'balanced paper density at second ' + sec);
    for (const pose of visible) {
      for (const field of ['x', 'y', 'z', 'rx', 'ry', 'rz',
        'scale', 'curl', 'flutter', 'opacity']) {
        assert.ok(Number.isFinite(pose[field]),
          'non-finite ' + field);
      }
      assert.ok(pose.opacity <= 1 && pose.opacity >= 0);
    }
  }
});

test('airflow positions are deterministic and scroll-reversible', () => {
  const first = createHomePaperMotion(1280, 720);
  const second = createHomePaperMotion(1280, 720);
  for (let id = 0; id < 21; id++) {
    for (const time of [0, .53, 3.17, 7.25, 11.99]) {
      const age = first.age(id, time);
      assert.deepEqual(first.pose(id, age), second.pose(id, age));
      assert.ok(Math.abs(first.age(id, time) - first.age(id, time + 12)) < 1e-12);
    }
  }
});

test('all sheets exit the ring without visual jumps or unwanted spins', () => {
  const motion = createHomePaperMotion(1280, 720);
  for (let id = 0; id < 21; id++) {
    for (let frame = 1; frame <= 540; frame++) {
      const before = motion.pose(id, (frame - 1) / 720);
      const after = motion.pose(id, frame / 720);
      assert.ok(Math.hypot(
        after.x - before.x, after.y - before.y) < 9,
      'position discontinuity in sheet ' + id + ' at frame ' + frame);
      // Euler angles can change discontinuously at a gimbal singularity
      // even when the physical 3D orientation is perfectly continuous.
      // Measure geodesic quaternion rotation instead.
      const dot = Math.min(1, Math.abs(before.q.reduce(
        (sum, value, axis) => sum + value * after.q[axis], 0)));
      const physicalDegrees = 2 * Math.acos(dot) * 180 / Math.PI;
      assert.ok(physicalDegrees < 5,
        'physical rotation discontinuity in sheet ' + id + ' at frame ' + frame);
      assert.ok(Math.abs(after.opacity - before.opacity) < .06,
      'opacity pop in sheet ' + id + ' at frame ' + frame);
    }
  }
});
