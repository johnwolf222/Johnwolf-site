import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  spiralGalleryPose, galleryCameraProgress, galleryRowOffset,
  CAMERA_DESCENT, TRAIN_START, TRAIN_END,
} from '../src/SpiralGalleryMotion.js';

const FEATURED = [9, 7, 5, 11, 2, 1, 10];
const ORDER = [4, 5, 6, 0, 1, 2, 3];
const FEATURED_INDICES = FEATURED.map(id => id - 1);
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
    y: galleryRowOffset(width, height) + d * height * .014,
    z: -d * 155,
    scale: 1 / (1 + d * .18),
    ry: -Math.sign(distance) * Math.min(65, d * 23),
    opacity: Math.pow(clamp((3.55 - d) / 3.3), .7),
  };
};
const rankFor = index => {
  const spotlight = FEATURED.indexOf(index + 1);
  return spotlight < 0 ? -1 : ORDER.indexOf(spotlight);
};
const pose = (phase, index, width, height) =>
  spiralGalleryPose(phase, index, rankFor(index), width, height,
    targetFor(index + 1, width, height));

test('all 21 sheets have finite bounded trajectories on desktop, mobile, wide', () => {
  for (const [width, height] of sizes) {
    for (let index = 0; index < 21; index++) {
      for (let tick = 0; tick <= 500; tick++) {
        const p = pose(tick / 500, index, width, height);
        for (const key of ['x', 'y', 'z', 'scale', 'opacity',
          'rx', 'ry', 'rz']) assert.ok(Number.isFinite(p[key]), key);
        assert.ok(p.z <= 0, 'never fly toward the camera');
        assert.ok(p.scale >= .1 && p.scale <= 1, 'bounded paper scale');
        assert.ok(p.opacity >= 0 && p.opacity <= 1, 'bounded alpha');
      }
    }
  }
});

test('all seven featured sheets reach exact gallery coordinates without jumps', () => {
  for (const [width, height] of sizes) {
    for (const id of FEATURED) {
      const destination = targetFor(id, width, height);
      const landed = pose(TRAIN_END, id - 1, width, height);
      for (const key of ['x', 'y', 'z', 'scale', 'ry', 'opacity']) {
        assert.ok(Math.abs(landed[key] - destination[key]) < 1e-6,
          'gallery mismatch: ' + key);
      }
      assert.deepEqual(landed, pose(1, id - 1, width, height),
        'no post-landing jump');
    }
  }
});

test('all 21 orbit centers are equally spaced along the ellipse', () => {
  for (const [width, height] of sizes) {
    const positions = [];
    for (let index = 0; index < 21; index++) {
      const rank = rankFor(index);
      const slot = rank >= 0 ? rank :
        7 + index - FEATURED_INDICES.filter(i => i < index).length;
      positions[slot] = pose(.50, index, width, height);
    }
    const gaps = positions.map((p, i) => {
      const next = positions[(i + 1) % 21];
      return Math.hypot(next.x - p.x, next.y - p.y);
    });
    assert.ok(Math.max(...gaps) / Math.min(...gaps) < 1.08,
      'uneven spacing around the head');
  }
});

test('the seven gallery sheets move as a perfectly spaced horizontal train', () => {
  for (const [width, height] of sizes) {
    for (const phase of [.77, .82, .87, .91, .95, .98]) {
      const offsets = FEATURED.map(id => {
        const p = pose(phase, id - 1, width, height);
        const destination = targetFor(id, width, height);
        return p.x - destination.x;
      });
      assert.ok(Math.max(...offsets) - Math.min(...offsets) < 1e-6,
        'train cars drift out of formation');
      if (phase === .77) {
        for (const id of FEATURED) {
          const p = pose(phase, id - 1, width, height);
          assert.ok(p.x < -width * .5, 'train must leave left viewport');
        }
      }
    }
  }
});

test('orbit exits and offscreen U-turn have continuous velocity', () => {
  for (const [width, height] of sizes) {
    for (const id of FEATURED) {
      const rank = rankFor(id - 1);
      for (const join of [.61 + rank * .008, TRAIN_START]) {
        const dt = .00001;
        const before = pose(join - dt, id - 1, width, height);
        const middle = pose(join, id - 1, width, height);
        const after = pose(join + dt, id - 1, width, height);
        const distance = (a, b) =>
          Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        const incoming = distance(before, middle);
        const outgoing = distance(middle, after);
        assert.ok(Math.abs(incoming - outgoing) /
          Math.max(incoming, outgoing, 1e-8) < .05,
        'velocity kink at join ' + join);
      }
    }
  }
});

test('nonfeatured sheets clear, reverse is deterministic, footer stays free', () => {
  for (const [width, height] of sizes) {
    for (let index = 0; index < 21; index++) {
      const a = pose(.68, index, width, height);
      pose(.92, index, width, height);
      assert.deepEqual(pose(.68, index, width, height), a);
      if (!FEATURED.includes(index + 1)) {
        assert.equal(pose(.85, index, width, height).opacity, 0);
      }
    }
    const paperWidth = width <= 800 ?
      Math.min(width * .55, 285) : Math.min(width * .26, 370);
    assert.ok(height / 2 + galleryRowOffset(width, height) +
      paperWidth / 2 <= height - 105, 'arrows obstructed by center card');
  }
  assert.equal(galleryCameraProgress(.91), 1);
  assert.equal(CAMERA_DESCENT, .36);
});

test('the paper postprocess never punches a hole after rays have faded', () => {
  const renderer = readFileSync(new URL('../src/LivePaperRenderer.jsx',
    import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/ProjectsSequence.css',
    import.meta.url), 'utf8');
  assert.match(renderer, /if \(uRayStrength <= 0\.001\) \{\s*gl_FragColor = original;/);
  assert.match(css, /z-index: 15;/);
  assert.match(css, /background: transparent;/);
});
