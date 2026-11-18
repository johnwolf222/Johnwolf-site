import test from 'node:test';
import assert from 'node:assert/strict';
import {
  spiralGalleryPose, galleryCameraProgress, CAMERA_DESCENT,
} from '../src/SpiralGalleryMotion.js';

const FEATURED = [9, 7, 5, 11, 2, 1, 10];
const ORDER = [4, 5, 6, 0, 1, 2, 3];
const sizes = [[1350, 722], [390, 844], [1920, 1080]];
const clamp = x => Math.max(0, Math.min(1, x));
const targetFor = (id, width, height) => {
  const spotlight = FEATURED.indexOf(id);
  if (spotlight < 0) return {
    x: -width * .6, y: height * .85, z: -550,
    scale: .16, ry: -65, opacity: 0,
  };
  let distance = spotlight;
  while (distance > FEATURED.length / 2) distance -= FEATURED.length;
  const d = Math.abs(distance);
  return {
    x: distance * Math.min(width * .218, 290),
    y: height * .235 + d * height * .014,
    z: -d * 155,
    scale: 1 / (1 + d * .18),
    ry: -Math.sign(distance) * Math.min(65, d * 23),
    opacity: Math.pow(clamp((3.55 - d) / 3.3), .7),
  };
};
const pose = (phase, index, width, height) => {
  const spotlight = FEATURED.indexOf(index + 1);
  const rank = spotlight < 0 ? -1 : ORDER.indexOf(spotlight);
  return spiralGalleryPose(phase, index, rank,
    width, height, targetFor(index + 1, width, height));
};

test('all 21 sheets have finite bounded trajectories on desktop, mobile, wide', () => {
  for (const [width, height] of sizes) {
    for (let index = 0; index < 21; index++) {
      for (let tick = 0; tick <= 400; tick++) {
        const p = pose(tick / 400, index, width, height);
        for (const key of ['x', 'y', 'z', 'scale', 'opacity',
          'rx', 'ry', 'rz']) assert.ok(Number.isFinite(p[key]), key);
        assert.ok(p.z <= 0, 'never fly toward the camera');
        assert.ok(p.scale >= .1 && p.scale <= 1, 'bounded paper scale');
        assert.ok(p.opacity >= 0 && p.opacity <= 1, 'bounded alpha');
      }
    }
  }
});

test('all seven featured sheets reach exact gallery coordinates left-to-right', () => {
  for (const [width, height] of sizes) {
    for (let index = 0; index < 21; index++) {
      const spotlight = FEATURED.indexOf(index + 1);
      if (spotlight < 0) continue;
      const rank = ORDER.indexOf(spotlight);
      const destination = targetFor(index + 1, width, height);
      const arrival = .91 + rank * .012;
      const landed = pose(arrival, index, width, height);
      for (const key of ['x', 'y', 'z', 'scale', 'ry', 'opacity']) {
        assert.ok(Math.abs(landed[key] - destination[key]) < 1e-6,
          'gallery mismatch: ' + key);
      }
      assert.deepEqual(pose(arrival, index, width, height),
        pose(1, index, width, height), 'no post-landing jump');
    }
  }
});

test('orbit joins the landing curve with matched position and velocity', () => {
  for (const [width, height] of sizes) {
    for (let index = 0; index < 21; index++) {
      const spotlight = FEATURED.indexOf(index + 1);
      if (spotlight < 0) continue;
      const rank = ORDER.indexOf(spotlight);
      const start = .285 + index * .0115;
      const end = .91 + rank * .012;
      const join = start + .70 * (end - start);
      const dt = .00001;
      const before = pose(join - dt, index, width, height);
      const middle = pose(join, index, width, height);
      const after = pose(join + dt, index, width, height);
      const speed = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      const incoming = speed(before, middle);
      const outgoing = speed(middle, after);
      assert.ok(Math.abs(incoming - outgoing) /
        Math.max(incoming, outgoing, 1e-8) < .05,
      'velocity kink at spiral exit');
    }
  }
});

test('the spiral keeps moving rather than freezing between phases', () => {
  for (const [width, height] of sizes) {
    for (let index = 0; index < 21; index++) {
      const spotlight = FEATURED.indexOf(index + 1);
      const rank = spotlight < 0 ? -1 : ORDER.indexOf(spotlight);
      const start = .285 + index * .0115;
      const end = rank < 0 ? .88 : .91 + rank * .012;
      for (let u = .20; u < .67; u += .04) {
        const at = start + u * (end - start);
        const a = pose(at - .0002, index, width, height);
        const b = pose(at + .0002, index, width, height);
        assert.ok(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) > .25,
          'sheet stalled during active orbit');
      }
    }
  }
});

test('unfeatured sheets clear before the gallery and reverse is seekable', () => {
  for (const [width, height] of sizes) {
    for (let index = 0; index < 21; index++) {
      const a = pose(.68, index, width, height);
      pose(.92, index, width, height);
      assert.deepEqual(pose(.68, index, width, height), a);
      if (!FEATURED.includes(index + 1)) {
        assert.equal(pose(.88, index, width, height).opacity, 0);
      }
    }
  }
  assert.equal(galleryCameraProgress(.91), 1);
  assert.equal(CAMERA_DESCENT, .36);
});
