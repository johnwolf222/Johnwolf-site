import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  spiralGalleryPose, clockwiseTrack, galleryCameraProgress,
  galleryRowOffset, CAMERA_DESCENT, UNWIND_START, OFFSCREEN_START,
  TRAIN_START, TRAIN_END, GALLERY_FOCAL,
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
  const z = -d * 155;
  return {
    x: distance * Math.min(width * .218, 290) *
      (GALLERY_FOCAL - z) / GALLERY_FOCAL,
    y: galleryRowOffset(width, height) + d * height * .014,
    z,
    scale: 1 / (1 + d * .18),
    ry: -Math.sign(distance) * Math.min(65, d * 23),
    opacity: Math.pow(clamp((3.55 - d) / 3.3), .7),
  };
};
const rankFor = index => {
  const spotlight = FEATURED.indexOf(index + 1);
  return spotlight < 0 ? -1 : ORDER.indexOf(spotlight);
};
const slotFor = index => {
  const rank = rankFor(index);
  return rank >= 0 ? rank :
    7 + index - FEATURED_INDICES.filter(i => i < index).length;
};
const pose = (phase, index, width, height) =>
  spiralGalleryPose(phase, index, rankFor(index), width, height,
    targetFor(index + 1, width, height));
const projectedX = p => p.x * GALLERY_FOCAL /
  (GALLERY_FOCAL - p.z);
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('all 21 cards stay finite, solid and at bounded 3D scale', () => {
  for (const [width, height] of sizes) {
    for (let index = 0; index < 21; index++) {
      for (let tick = 0; tick <= 500; tick++) {
        const phase = tick / 500;
        const p = pose(phase, index, width, height);
        for (const key of ['x', 'y', 'z', 'scale', 'opacity',
          'rx', 'ry', 'rz']) assert.ok(Number.isFinite(p[key]), key);
        assert.ok(p.z <= 0, 'no sheets flying toward the camera');
        assert.ok(p.scale >= .1 && p.scale <= 1, 'bounded paper scale');
        assert.ok(p.opacity >= 0 && p.opacity <= 1, 'bounded alpha');
        if (phase >= .40 && phase <= OFFSCREEN_START) {
          assert.equal(p.opacity, 1,
            'every sheet must remain solid while the circle unwinds');
        }
        if (rankFor(index) < 0 && phase >= .40) {
          assert.equal(p.opacity, 1,
            'nonfeatured sheets must NEVER fade away');
        }
      }
    }
  }
});

test('before all sheets exit, featured and nonfeatured share the SAME track', () => {
  for (const [width, height] of sizes) {
    for (const phase of [.401, .46, .55, .67, .75, .82]) {
      for (let index = 0; index < 21; index++) {
        const track = clockwiseTrack(phase, slotFor(index), width, height);
        const p = pose(phase, index, width, height);
        assert.ok(Math.abs(track.x - p.x) < 1e-6);
        assert.ok(Math.abs(track.z - p.z) < 1e-6);
        assert.ok(Math.abs(track.y -
          (p.y + height * CAMERA_DESCENT *
            galleryCameraProgress(phase))) < 1e-6);
      }
    }
  }
});

test('all 21 cards keep equal arc-length separation while unwinding', () => {
  for (const [width, height] of sizes) {
    for (const phase of [.401, .46, .55, .67, .78, .82]) {
      const d = Array.from({ length: 21 }, (_, slot) =>
        clockwiseTrack(phase, slot, width, height).distance);
      const gaps = d.slice(1).map((x, i) => x - d[i]);
      assert.ok(Math.max(...gaps) - Math.min(...gaps) < 1e-6,
        'a card broke away or lost its even spacing');
      for (const slot of Array.from({ length: 21 }, (_, i) => i)) {
        const p = clockwiseTrack(phase, slot, width, height);
        if (p.exited) {
          assert.ok(p.x <= 0, 'bottom tangent must lead LEFT');
          assert.ok(Math.abs(p.y - Math.min(height * .35, 265)) < 1e-6,
            'cards must exit through the BOTTOM of the circle');
        }
      }
    }
  }
});

test('every card crosses the clockwise bottom tangent smoothly', () => {
  for (const [width, height] of sizes) {
    for (let slot = 0; slot < 21; slot++) {
      let lo = UNWIND_START, hi = OFFSCREEN_START;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (clockwiseTrack(mid, slot, width, height).exited) hi = mid;
        else lo = mid;
      }
      const exit = (lo + hi) / 2;
      const center = clockwiseTrack(exit, slot, width, height);
      assert.ok(Math.abs(center.x) < .001);
      assert.ok(Math.abs(center.y - Math.min(height * .35, 265)) < .001);
      const before = clockwiseTrack(exit - .00001, slot, width, height);
      const after = clockwiseTrack(exit + .00001, slot, width, height);
      assert.ok(Math.abs(before.y - after.y) < .01,
        'card jumped vertically at the tangent');
      assert.ok(before.x >= after.x,
        'card must move left through the bottom');
    }
  }
});

test('all 21 cards are completely OFFSCREEN LEFT before any return begins', () => {
  for (const [width, height] of sizes) {
    const paperWidth = width <= 800 ?
      Math.min(width * .55, 285) : Math.min(width * .26, 370);
    for (let index = 0; index < 21; index++) {
      const p = pose(OFFSCREEN_START, index, width, height);
      assert.ok(p.x < -width / 2 - paperWidth / 2,
        'entire procession must clear the left edge before turning');
      assert.equal(p.opacity, 1);
    }
    for (const phase of [.83, .85, .88, TRAIN_START]) {
      for (let index = 0; index < 21; index++) {
        const p = pose(phase, index, width, height);
        assert.ok(projectedX(p) < -width / 2 - paperWidth / 2,
          'offscreen U-turn leaked into view');
      }
    }
  }
});

test('seven featured cards return from left as one perspective-correct train', () => {
  for (const [width, height] of sizes) {
    for (const phase of [TRAIN_START, .91, .94, .97, .985, TRAIN_END]) {
      const offsets = FEATURED.map(id =>
        projectedX(pose(phase, id - 1, width, height)) -
        projectedX(targetFor(id, width, height)));
      assert.ok(Math.max(...offsets) - Math.min(...offsets) < 1e-6,
        'gallery train cars lost their equal screen-space translation');
    }
    const positions = FEATURED.map(id =>
      projectedX(pose(TRAIN_END, id - 1, width, height)))
      .sort((a, b) => a - b);
    const gaps = positions.slice(1).map((x, i) => x - positions[i]);
    assert.ok(Math.max(...gaps) - Math.min(...gaps) < 1e-6,
      'perspective compressed the final gallery gaps');
  }
});

test('featured landing matches approved gallery coordinates exactly', () => {
  for (const [width, height] of sizes) {
    for (const id of FEATURED) {
      const target = targetFor(id, width, height);
      const landed = pose(TRAIN_END, id - 1, width, height);
      for (const key of ['x', 'y', 'z', 'scale', 'ry', 'opacity']) {
        assert.ok(Math.abs(landed[key] - target[key]) < 1e-6,
          'gallery mismatch: ' + key);
      }
      assert.deepEqual(landed, pose(1, id - 1, width, height),
        'no jump after landing');
    }
  }
});

test('every junction is position-continuous and reverse-scroll deterministic', () => {
  for (const [width, height] of sizes) {
    for (let index = 0; index < 21; index++) {
      for (const join of [UNWIND_START, OFFSCREEN_START,
        TRAIN_START, TRAIN_END]) {
        const dt = .000001;
        const a = pose(join - dt, index, width, height);
        const b = pose(join, index, width, height);
        const c = pose(join + dt, index, width, height);
        assert.ok(gap(a, b) < .2, 'incoming jump at ' + join);
        assert.ok(gap(b, c) < .2, 'outgoing jump at ' + join);
      }
      const original = pose(.65, index, width, height);
      pose(.99, index, width, height);
      assert.deepEqual(pose(.65, index, width, height), original,
        'reverse-scroll path changed');
    }
  }
});

test('gallery footer stays clear; compositing does not punch out paper', () => {
  const renderer = readFileSync(new URL('../src/LivePaperRenderer.jsx',
    import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/ProjectsSequence.css',
    import.meta.url), 'utf8');
  for (const [width, height] of sizes) {
    const paperWidth = width <= 800 ?
      Math.min(width * .55, 285) : Math.min(width * .26, 370);
    assert.ok(height / 2 + galleryRowOffset(width, height) +
      paperWidth / 2 <= height - 105, 'arrows obstructed');
  }
  assert.equal(galleryCameraProgress(.91), 1);
  assert.match(renderer,
    /if \(uRayStrength <= 0\.001\) \{\s*gl_FragColor = original;/);
  assert.match(css, /z-index: 15;/);
  assert.match(css, /background: transparent;/);
});
