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
      assert.ok(Math.abs(after.rz - before.rz) < 6,
      'rotation discontinuity in sheet ' + id + ' at frame ' + frame);
      assert.ok(Math.abs(after.opacity - before.opacity) < .06,
      'opacity pop in sheet ' + id + ' at frame ' + frame);
    }
  }
});


test('every sheet travels through a deep ring passage before outward release', () => {
  for (const [width, height] of [[390, 844], [1280, 720], [1920, 1080]]) {
    const motion = createHomePaperMotion(width, height);
    for (let id = 0; id < 21; id++) {
      const back = motion.pose(id, .015 / 12);
      const lip = motion.pose(id, 1.7 / 12);
      const free = motion.pose(id, 5 / 12);
      assert.ok(back.z < -680, 'sheet begins behind ring: ' + id);
      assert.ok(lip.z > -290, 'sheet reaches ring lip: ' + id);
      assert.ok(lip.z - back.z > 360, 'ring passage has meaningful depth: ' + id);
      assert.ok(Math.hypot(free.x, free.y) > Math.hypot(lip.x, lip.y) + 60,
        'sheet departs outward rather than orbiting in place: ' + id);
    }
  }
});

test('paper changes from guided ring posture into flexible wind-driven flight', () => {
  const motion = createHomePaperMotion(1280, 720);
  for (let id = 0; id < 21; id++) {
    const guide = motion.pose(id, .15 / 12);
    const free = motion.pose(id, 4 / 12);
    assert.ok(guide.flutter < .001, 'paper is guided during ring entry');
    assert.ok(free.flutter > .1, 'paper begins fluttering after release');
    assert.ok(free.curl > guide.curl,
      'free flight bends more than the guided entry');
  }
});


test('flutter is controlled by simulated flight and can be disabled separately', () => {
  const noFlutter = createHomePaperMotion(1280, 720,
    {...HOME_PAPER_PRESET, flutter: 0});
  const normal = createHomePaperMotion(1280, 720);
  const optionalFlutter = createHomePaperMotion(1280, 720,
    {...HOME_PAPER_PRESET, flutter: 1});
  const noCurl = createHomePaperMotion(1280, 720,
    {...HOME_PAPER_PRESET, curl: 0});
  for (let i = 0; i < HOME_PAPER_PRESET.count; i++) {
    assert.equal(noFlutter.pose(i, 4 / 12).flutter, 0);
    assert.equal(noCurl.pose(i, 4 / 12).curl, 0);
    assert.equal(normal.pose(i, 4 / 12).flutter, 0);
    assert.ok(optionalFlutter.pose(i, 4 / 12).flutter > 0.1);
    assert.ok(normal.pose(i, .8 / 12).flutter < .001);
  }
});

test('each page follows repeated 3D rise and dip after the hole', () => {
  assert.equal(HOME_PAPER_PRESET.flutter, 0);
  for (const [w,h] of [[390, 844], [1280,720], [1920,1080]]) {
    const motion = createHomePaperMotion(w,h);
    for (let id = 0; id < HOME_PAPER_PRESET.count; id++) {
      const z = [];
      for (let s = 2.25; s <= 8; s += .17) z.push(motion.pose(id, s/12).z);
      const delta = z.slice(1).map((v,k) => v-z[k]);
      const reversals = delta.slice(1).filter((v,k) => v*delta[k]<0).length;
      assert.ok(reversals >= 3,
        'sheet ' + id + ' lacks repeated crests/dips at ' + w + 'px');
    }
  }
});
