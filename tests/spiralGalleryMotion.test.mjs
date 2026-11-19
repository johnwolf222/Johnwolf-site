import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  spiralGalleryPose, clockwiseTrack, galleryCameraProgress, galleryHeadPlacement,
  galleryRowOffset, CAMERA_DESCENT, UNWIND_START, OFFSCREEN_START,
  TRAIN_START, TRAIN_END, GALLERY_FOCAL,
} from '../src/SpiralGalleryMotion.js';

import {
  wrapGalleryFocus, wrappedGalleryDistance,
  nearestGalleryIndex, stepGalleryFocus, dragGalleryFocus,
  gallerySeamOpacity, galleryRestScrollY, shouldAutoLand,
  galleryExitFade, GALLERY_LANDING_VH,
} from '../src/GalleryLoopMotion.js';

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
      // The ellipse is still completing its original gentle expansion
      // when the leading sheet reaches the bottom tangent.
      const g = clamp((exit - .285) / .145);
      const growth = g * g * g * (g * (g * 6 - 15) + 10);
      assert.ok(Math.abs(center.y -
        Math.min(height * .35, 265) * growth) < .001);
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

test('one GLB remains anchored at top center after the paper train lands', () => {
  for (const [width, height] of sizes) {
    const atHome = galleryHeadPlacement(0, height);
    assert.ok(Math.abs(atHome.shift) < 1e-9, 'approved Home placement changed');
    assert.equal(atHome.scale, 1, 'approved Home head scale changed');
    const expectedCenter = Math.max(148, Math.min(height * .225, 210));
    const settled = galleryHeadPlacement(.86, height);
    const landed = galleryHeadPlacement(1, height);
    assert.ok(Math.abs(landed.shift + height / 2 + 20 -
      expectedCenter) < 1e-6, 'head not at top center');
    assert.ok(Math.abs(settled.shift - landed.shift) < 1e-6,
      'head must remain stationary while gallery projects advance');
    assert.ok(Math.abs(landed.scale - .76) < 1e-6,
      'approved smaller gallery head scale changed');
    for (let tick = 0; tick <= 100; tick++) {
      const position = galleryHeadPlacement(tick / 100, height);
      assert.ok(Number.isFinite(position.shift));
      assert.ok(Number.isFinite(position.scale));
      assert.ok(position.scale > .7 && position.scale <= 1);
    }
  }
  const sequence = readFileSync(new URL('../src/ProjectsSequence.jsx',
    import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/NewHomepage.css',
    import.meta.url), 'utf8');
  assert.match(sequence, /const headPlacement = galleryHeadPlacement\(p, height\)/);
  assert.match(sequence, /head\.style\.opacity = String\(exitFade\)/);
  assert.doesNotMatch(sequence, /headFade|headRise/,
    'old head fade or upward ejection is still present');
  assert.match(css, /\.jw-continuous-head\s*\{[\s\S]*?position: fixed;/);
  assert.match(css, /\.jw-continuous-head__artboard\s*\{[\s\S]*?left: 50%;/);
});

test('one swipe advances exactly one project and then settles', () => {
  const spacing = 290;
  assert.equal(dragGalleryFocus(0, -spacing, spacing), 1,
    'left drag previews the next project');
  assert.equal(dragGalleryFocus(0, spacing, spacing), 6,
    'right drag previews the previous project');
  for (let start = 0; start < 7; start++) {
    assert.equal(stepGalleryFocus(start, 1), (start + 1) % 7,
      'left swipe advances exactly one card');
    assert.equal(stepGalleryFocus(start, -1), (start + 6) % 7,
      'right swipe returns exactly one card');
    assert.equal(stepGalleryFocus(start, 0), start,
      'cancelled swipe stays on the current card');
  }
  let focus = 0;
  for (let i = 0; i < 35; i++) {
    focus = stepGalleryFocus(focus, 1);
    assert.equal(focus, (i + 1) % 7,
      'five complete loops must never stop at an end');
  }
  for (let i = 0; i < 35; i++) {
    focus = stepGalleryFocus(focus, -1);
    assert.equal(focus, (35 - i - 1) % 7,
      'reverse movement must also wrap seamlessly');
  }
  assert.equal(stepGalleryFocus(6.8, 1), 1,
    'interrupted settling animation must advance from nearest card');
  assert.equal(stepGalleryFocus(.2, -1), 6);
  assert.equal(stepGalleryFocus(2.49, 0), 2);
  assert.equal(stepGalleryFocus(2.51, 0), 3);
  assert.equal(nearestGalleryIndex(6.6), 0);
  assert.equal(nearestGalleryIndex(-.6), 6);
  assert.equal(wrapGalleryFocus(7), 0);
  assert.equal(wrapGalleryFocus(-1), 6);
});

test('the seven real sheets wrap offscreen without a visible seam', () => {
  for (const [width, height] of sizes) {
    const spacing = Math.min(width * .218, 290);
    for (let tick = 0; tick < 700; tick++) {
      const focus = tick / 100;
      const distances = FEATURED.map((id, index) =>
        wrappedGalleryDistance(index, focus));
      assert.ok(distances.every(d => Math.abs(d) <= 3.5));
      const centered = nearestGalleryIndex(focus);
      assert.ok(Math.abs(distances[centered]) <= .5);
      for (let index = 0; index < FEATURED.length; index++) {
        const d = distances[index];
        const depth = -Math.abs(d) * 155;
        const target = {
          x: d * spacing * (GALLERY_FOCAL - depth) / GALLERY_FOCAL,
          y: galleryRowOffset(width, height) +
            Math.abs(d) * height * .014,
          z: depth,
          scale: 1 / (1 + Math.abs(d) * .18),
          ry: -Math.sign(d) * Math.min(65, Math.abs(d) * 23),
          opacity: Math.pow(clamp((3.55 - Math.abs(d)) / 3.3), .7) *
            gallerySeamOpacity(d),
        };
        const p = spiralGalleryPose(1, FEATURED[index] - 1,
          ORDER.indexOf(index), width, height, target);
        for (const key of ['x', 'y', 'z', 'scale', 'opacity'])
          assert.ok(Number.isFinite(p[key]));
        assert.ok(Math.abs(p.x - target.x) < 1e-6);
        assert.ok(Math.abs(p.opacity - target.opacity) < 1e-6);
      }
    }
    // At the exact cyclic boundary the center sheet does not jump.
    const left = wrappedGalleryDistance(0, 6.9999);
    const right = wrappedGalleryDistance(0, .0001);
    assert.ok(Math.abs(left - right) < .001);
  }
  assert.equal(gallerySeamOpacity(3.5), 0);
  assert.equal(gallerySeamOpacity(-3.5), 0);
  assert.equal(gallerySeamOpacity(3.0), 1);
});

test('gallery swipe controls preserve the original scroll and head', () => {
  const source = readFileSync(new URL('../src/ProjectsSequence.jsx',
    import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/ProjectsSequence.css',
    import.meta.url), 'utf8');
  assert.match(source, /onPointerDown=\{onPointerDown\}/);
  assert.match(source, /onPointerMove=\{onPointerMove\}/);
  assert.match(source, /onWheel=\{onGalleryWheel\}/);
  assert.match(source, /onPointerUp=\{event => finishPointer\(event\)\}/);
  assert.doesNotMatch(source, /advanceGalleryFocus|loopDirection|heldDirection/,
    'gallery must not keep moving automatically after a swipe');
  assert.match(source, /settleTo\(stepGalleryFocus\(dragOrigin, direction\)\)/,
    'a released swipe must settle at one neighboring card');
  assert.match(source, /settleTo\(stepGalleryFocus\(loopFocus, direction\)\)/,
    'arrow and trackpad controls must settle at one neighboring card');
  assert.match(source, /onComplete: \(\) => \{\s*loopFocus = destination;\s*loopTween = null;/,
    'finite animation must stop precisely on the target card');
  assert.match(source, /wheel\.locked = Boolean\(galleryControlsRef/,
    'momentum wheel events must not cause repeated card advances');
  assert.match(source, /wheel\.timer = window\.setTimeout/,
    'wheel gesture lock must release after the gesture ends');
  assert.match(source, /galleryControlsRef\.current\?\.start\(1\)/);
  assert.match(source, /galleryControlsRef\.current\?\.start\(-1\)/);
  assert.match(source, /headPlacement = galleryHeadPlacement\(p, height\)/);
  assert.match(css, /touch-action: pan-y;/,
    'horizontal gesture surface must not prevent vertical page scrolling');
  assert.match(css, /z-index: 50;/);
  assert.match(css, /pointer-events: auto;/);
});

test('original homepage 3D head stays mounted and renders through section two', () => {
  const home = readFileSync(new URL('../src/NewHomepage.jsx',
    import.meta.url), 'utf8');
  const head = readFileSync(new URL('../src/HomepageHead.jsx',
    import.meta.url), 'utf8');
  const sequence = readFileSync(new URL('../src/ProjectsSequence.jsx',
    import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/NewHomepage.css',
    import.meta.url), 'utf8');
  assert.match(home, /createPortal\(\s*<div className="jw-continuous-head"/,
    'Home must mount the ONE persistent head outside the pinned artboard');
  assert.match(home, /<HomepageHead reducedMotion=\{reduced\}/);
  assert.match(head, /const HEAD_MODEL = '\/about\/head-interactive\.glb'/,
    'must retain the approved original GLB model');
  assert.doesNotMatch(head, /new IntersectionObserver\(/,
    'pinning must not accidentally pause the visible fixed head');
  assert.match(head, /const headOnscreen =/);
  assert.match(head, /requestAnimationFrame\(animate\)/);
  assert.match(head, /webglcontextlost/);
  assert.match(head, /setReady\(false\)/,
    'a lost WebGL context must restore the visible static head');
  assert.match(head, /head-placeholder\.svg/,
    'keep the approved static head until the actual GLB is drawn');
  assert.match(sequence, /head\.style\.opacity = String\(exitFade\)/);
  assert.match(sequence, /head\.style\.visibility = exitFade < \.005/);
  assert.match(sequence, /galleryHeadPlacement\(p, height\)/);
  assert.match(css, /\.jw-continuous-head\s*\{\s*position: fixed;/);
  assert.match(css, /\.jw-continuous-head__artboard\s*\{[\s\S]*?left: 50%;/);
  for (const height of [722, 844, 1080]) {
    const atHome = galleryHeadPlacement(0, height);
    const settled = galleryHeadPlacement(1, height);
    assert.ok(Math.abs(atHome.shift) < 1e-9);
    assert.equal(atHome.scale, 1);
    assert.ok(settled.shift < 0);
    assert.equal(settled.scale, .76);
  }
});

test('the train automatically lands at a safe single-viewport gallery stop', () => {
  assert.equal(GALLERY_LANDING_VH, .10);
  for (const height of [480, 722, 844, 1080]) {
    const top = height * 5.25;
    const sectionHeight = Math.max(height, 550);
    const rest = galleryRestScrollY(top, height);
    assert.equal(rest, top + height * .10);
    assert.ok(rest < top + sectionHeight - height * .23,
      'gallery must remain interactive at the landing position');
    assert.equal(galleryExitFade(rest, top, sectionHeight, height), 1,
      'head and artwork must be fully opaque after landing');
    assert.equal(galleryExitFade(top + sectionHeight,
      top, sectionHeight, height), 0,
      'head and artwork must clear completely before About');
    assert.ok(galleryExitFade(top + sectionHeight - height * .30,
      top, sectionHeight, height) < 1,
      'the gallery should gently fade on departure');
  }
  assert.equal(shouldAutoLand(.8899, 100, 200, 'idle'), false);
  assert.equal(shouldAutoLand(.89, 100, 200, 'idle'), true);
  assert.equal(shouldAutoLand(.95, 100, 200, 'idle'), true);
  assert.equal(shouldAutoLand(.99, 100, 200, 'idle'), false);
  assert.equal(shouldAutoLand(.95, 200, 100, 'idle'), false,
    'reverse scrolling must not force a new landing');
  assert.equal(shouldAutoLand(.95, 100, 200, 'landing'), false);
  assert.equal(shouldAutoLand(.95, 100, 200, 'settled'), false);
  assert.equal(shouldAutoLand(.95, 100, 200, 'leaving'), false);
  assert.equal(shouldAutoLand(.95, NaN, 200, 'idle'), false);
});

test('Section 2 waits after auto-landing and the next scroll enters About', () => {
  const source = readFileSync(new URL('../src/ProjectsSequence.jsx',
    import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/ProjectsSequence.css',
    import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.jsx',
    import.meta.url), 'utf8');
  assert.match(css, /height: 100svh;/);
  assert.doesNotMatch(css, /740svh|3500px/,
    'gallery must no longer require seven viewports of scrolling');
  assert.match(source, /shouldAutoLand\(exact, previous, y, snapState,/);
  assert.match(source, /startLanding\(\);/);
  assert.match(source, /animatePageTo\(galleryAnchor\(\),/);
  assert.match(source, /markGallerySettled/);
  assert.match(source, /snapState = 'settled'/);
  assert.match(source, /exitReadyAt = performance\.now\(\) \+ 550/,
    'the triggering scroll gesture must not immediately skip About');
  assert.match(source, /const onVerticalWheel = event =>/);
  assert.match(source, /const onTouchMove = event =>/);
  assert.match(source, /const onScrollKey = event =>/);
  assert.match(source, /leaveForAbout\(\)/);
  assert.match(source, /document\.querySelector\('#about'\)/);
  assert.match(source, /const scrollFocus = \(\) => 0/,
    'vertical scrolling must not advance or replace gallery cards');
  assert.doesNotMatch(source, /stepVh|focusOf\(/);
  assert.match(source, /window\.addEventListener\('wheel', onVerticalWheel,/);
  assert.match(source, /window\.removeEventListener\('wheel', onVerticalWheel, true\)/);
  assert.match(source, /cancelScrollTween\(\)/,
    'scroll tween must be cleaned up when the component unmounts');
  assert.match(source, /const headPlacement = galleryHeadPlacement\(p, height\)/);
  assert.match(source, /settleTo\(stepGalleryFocus\(dragOrigin, direction\)\)/,
    'one-card swipe interaction must survive the new scroll snap');
  assert.match(main, /<ProjectsSequence\/>\s*<section id="about"/,
    'Section 3 remains the existing About section, not a replacement');
});
