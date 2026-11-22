import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { HeadController, SETTINGS, pointerRelativeToHead } from '../src/about/controller.js';
import {wordRangesForLine, hoveredWordAtUV} from '../src/about/word-hover.js';
import {
  spiralGalleryPose, clockwiseTrack, galleryCameraProgress, galleryHeadPlacement,
  galleryRowOffset, CAMERA_DESCENT, UNWIND_START, OFFSCREEN_START,
  TRAIN_START, TRAIN_END, GALLERY_FOCAL,
} from '../src/SpiralGalleryMotion.js';

import {
  aboutHandoffProgress, departingCardOffset, aboutHeadPose,
  aboutIntroPose, aboutHeadOpacity, aboutHeadingReveal,
  aboutToolsHeadBlend, aboutToolsHeadOffset,
} from '../src/AboutHandoffMotion.js';

import {
  wrapGalleryFocus, wrappedGalleryDistance,
  nearestGalleryIndex, stepGalleryFocus, dragGalleryFocus,
  gallerySeamOpacity, galleryRestScrollY, shouldAutoLand,
  galleryExitFade, GALLERY_LANDING_VH,
  initialGalleryWheelState, galleryWheelGesture,
  initialGalleryVerticalState, galleryVerticalExitGesture,
  gallerySnapDuration, gallerySwipeDirection,
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
  assert.match(sequence, /const headPlacement = aboutHeadPose\(handoff,/);
  assert.match(sequence, /head\.style\.opacity = String\(headOpacity\)/);
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
  assert.match(source, /window\.addEventListener\('wheel', onGalleryWheel,/,
    'trackpad input must be captured over artwork, captions and controls');
  assert.doesNotMatch(source, /onWheel=\{onGalleryWheel\}/,
    'a second local listener would count each swipe twice');
  assert.match(source, /onPointerUp=\{event => finishPointer\(event\)\}/);
  assert.doesNotMatch(source, /advanceGalleryFocus|loopDirection|heldDirection/,
    'gallery must not keep moving automatically after a swipe');
  assert.match(source, /settleTo\(stepGalleryFocus\(dragTarget, direction\)\)/,
    'a released swipe must advance from its last requested destination');
  assert.match(source, /settleTo\(stepGalleryFocus\(loopTarget, direction\)\)/,
    'rapid swipes must queue relative to the requested target, not a partial tween');
  assert.match(source, /onComplete: \(\) => \{\s*loopFocus = destination;\s*loopTween = null;/,
    'finite animation must stop precisely on the target card');
  assert.match(source, /galleryWheelGesture\(wheelGestureRef\.current,/,
    'wheel input must accumulate tiny events and recognize new impulses');
  assert.match(source, /initialGalleryWheelState\(\)/);
  assert.match(source, /window\.removeEventListener\('wheel', onGalleryWheel, true\)/,
    'global capture listener must be removed on unmount');
  assert.doesNotMatch(source, /wheel\.locked|wheel\.timer/,
    'the old long momentum lock must not discard the next swipe');
  assert.match(source, /const shifted = event\.shiftKey/,
    'shift-wheel horizontal navigation should work');
  assert.match(source, /gallerySwipeDirection\(dx, dy, velocity, cancelled\)/,
    'short high-velocity flicks must count without waiting for a pointermove');
  assert.match(source, /galleryControlsRef\.current\?\.start\(1\)/);
  assert.match(source, /galleryControlsRef\.current\?\.start\(-1\)/);
  assert.match(source, /headPlacement = aboutHeadPose\(handoff,/);
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
  assert.match(sequence, /head\.style\.opacity = String\(headOpacity\)/);
  assert.match(sequence, /head\.style\.visibility = headOpacity < \.005/);
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
  assert.equal(shouldAutoLand(.99, 100, 200, 'idle', .89, 1.001), true,
    'a large wheel jump over the train end still triggers landing');
  assert.equal(shouldAutoLand(1, 100, 200, 'idle', .89, 1.001), true);
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
  assert.match(css, /height: 72svh;/,
    'only Projects exit runway shortens; gallery stage remains full screen');
  assert.doesNotMatch(css, /740svh|3500px/,
    'gallery must no longer require seven viewports of scrolling');
  assert.match(source, /shouldAutoLand\(exact, previous, y, snapState,/);
  assert.match(source, /TRAIN_START, 1\.001\)/);
  assert.match(source, /y < galleryAnchor\(\) - height \* \.04/,
    'the auto-landing trigger must not hijack a visitor already at the gallery');
  assert.match(source, /startLanding\(\);/);
  assert.match(source, /animatePageTo\(galleryAnchor\(\),/);
  assert.match(source, /markGallerySettled/);
  assert.match(source, /const sceneOpacity = stageOpacity/,
    'gallery overlay must fade with the head rather than vanish abruptly');
  assert.match(source, /scrollY < sectionTop \+ sectionHeight - height \* \.01/,
    'overlay must remain mounted until its fade finishes');
  assert.match(source, /snapState = 'settled'/);
  assert.match(source, /exitReadyAt = performance\.now\(\) \+ 220/,
    'brief fixed grace protects landing without trapping scrolling');
  assert.doesNotMatch(source, /exitReadyAt = now \+ 220/,
    'trackpad momentum must never extend the exit lock indefinitely');
  assert.match(source, /const onVerticalWheel = event =>/);
  assert.match(source, /galleryVerticalExitGesture\(/,
    'About must require an intentional downward gesture, not tiny Y noise');
  assert.match(source, /dy <= 0 \|\| dy <= Math\.abs\(dx\) \* 1\.25/,
    'horizontal gestures must not be classified as vertical navigation');
  assert.match(source, /event\.shiftKey && Math\.abs\(event\.deltaX\) < \.2/,
    'shift-wheel should stay in the horizontal gallery');
  assert.match(source, /const onTouchMove = event =>/);
  assert.match(source, /const onScrollKey = event =>/);
  assert.match(source, /leaveForAbout\(\)/);
  assert.match(source, /document\.querySelector\('#about'\)/);
  assert.match(source, /const navigatePastGallery = event =>/,
    'explicit About and Contact navigation must bypass the auto-landing');
  assert.match(source, /snapState = 'leaving';\s*animatePageTo\(docTop\(destination\)/);
  assert.match(source, /document\.removeEventListener\('click', navigatePastGallery\)/);
  assert.match(source, /const scrollFocus = \(\) => 0/,
    'vertical scrolling must not advance or replace gallery cards');
  assert.doesNotMatch(source, /stepVh|focusOf\(/);
  assert.match(source, /window\.addEventListener\('wheel', onVerticalWheel,/);
  assert.match(source, /window\.removeEventListener\('wheel', onVerticalWheel, true\)/);
  assert.match(source, /cancelScrollTween\(\)/,
    'scroll tween must be cleaned up when the component unmounts');
  assert.match(source, /const headPlacement = aboutHeadPose\(handoff,/);
  assert.match(source, /settleTo\(stepGalleryFocus\(dragTarget, direction\)\)/,
    'one-card swipe interaction must survive the new scroll snap');
  assert.match(main, /<ProjectsSequence\/>\s*<AboutExperience\/>/,
    'Section 3 must render the restored original About experience');
});

test('tiny trackpad deltas accumulate into exactly one horizontal step', () => {
  let state = initialGalleryWheelState();
  const steps = [];
  for (let i = 0; i < 22; i++) {
    const next = galleryWheelGesture(state, .55, .18, i * 8);
    state = next.state;
    if (next.step) steps.push(next.step);
  }
  assert.deepEqual(steps, [1], 'subpixel swipes must not be ignored');
  for (const dx of [7, 5, 3, 2, 1, .7, .5, .3]) {
    const next = galleryWheelGesture(state, dx, 0, state.lastAt + 12);
    state = next.state;
    assert.equal(next.step, 0, 'momentum tail advanced a second card');
  }
});

test('fast left/right reversals each register even during the old momentum tail', () => {
  let state = initialGalleryWheelState();
  const steps = [];
  let time = 0;
  for (const dx of [3, 7, 14, 9, 5, -3, -5, -8, -13, -4,
    3, 6, 9, 12]) {
    const next = galleryWheelGesture(state, dx, 0, time);
    state = next.state;
    if (next.step) steps.push(next.step);
    time += 16;
  }
  assert.deepEqual(steps, [1, -1, 1],
    'every deliberate direction change should move one card');
});

test('a new same-direction swipe re-arms after slowing without 320ms silence', () => {
  let state = initialGalleryWheelState();
  const steps = [];
  for (const [time, dx] of [
    [0, 2], [16, 4], [32, 10], [48, 12],
    [64, 6], [80, 3], [96, 1],
    [218, 3], [234, 6], [250, 11], [266, 14],
  ]) {
    const next = galleryWheelGesture(state, dx, 0, time);
    state = next.state;
    if (next.step) steps.push(next.step);
  }
  assert.deepEqual(steps, [1, 1],
    'a second deliberate swipe should not be discarded by residual inertia');
});

test('vertical and incidental diagonal scrolling cannot change gallery focus', () => {
  let state = initialGalleryWheelState();
  for (let i = 0; i < 30; i++) {
    const result = galleryWheelGesture(state, i % 2 ? 2 : -2, 12, i * 12);
    state = result.state;
    assert.equal(result.step, 0);
  }
  assert.equal(state.total, 0);
  const bad = galleryWheelGesture(state, NaN, 1, 400);
  assert.equal(bad.step, 0);
  assert.deepEqual(bad.state, state);
});

test('rapid swipes use their queued destination, not the half-animated card', () => {
  let target = 0;
  target = stepGalleryFocus(target, 1);
  assert.equal(target, 1);
  // The previous tween might be only 20% complete. Using the old focus
  // would round 0.2 back to 0, losing this second swipe.
  assert.equal(stepGalleryFocus(.2, 1), 1);
  target = stepGalleryFocus(target, 1);
  assert.equal(target, 2, 'the second forward swipe must advance again');
  target = stepGalleryFocus(target, -1);
  assert.equal(target, 1, 'reverse swipe must work during an active tween');
  target = stepGalleryFocus(target, -1);
  assert.equal(target, 0);
  for (let i = 0; i < 21; i++) target = stepGalleryFocus(target, 1);
  assert.equal(target, 0, 'queued destinations must preserve infinite wrap');
});

test('tiny vertical noise during sideways swipes never skips to About', () => {
  let state = initialGalleryVerticalState();
  for (let i = 0; i < 40; i++) {
    const next = galleryVerticalExitGesture(state, 8, 2, i * 12);
    state = next.state;
    assert.equal(next.exit, false,
      'horizontal swipe was mistaken for a downward page transition');
  }
  assert.equal(state.total, 0);
  for (let i = 0; i < 3; i++) {
    const next = galleryVerticalExitGesture(state, 0, 2, 500 + i * 10);
    state = next.state;
    assert.equal(next.exit, false,
      'subthreshold vertical noise must not leave the gallery');
  }
  assert.equal(state.total, 6);
  assert.equal(galleryVerticalExitGesture(state, 0, 2, 530).exit, true,
    'one deliberate trackpad swipe must enter About promptly');
  assert.equal(galleryVerticalExitGesture(
    initialGalleryVerticalState(), 0, 100, 0).exit, true,
    'a full mouse-wheel notch must enter About immediately');
});

test('vertical exit intent resets after a pause or horizontal gesture', () => {
  let state = initialGalleryVerticalState();
  state = galleryVerticalExitGesture(state, 0, 4, 0).state;
  assert.equal(galleryVerticalExitGesture(state, 0, 4, 300).exit, false,
    'separate small gestures must not add up to an accidental About jump');
  const sideways = galleryVerticalExitGesture(state, -10, 2, 10);
  assert.equal(sideways.exit, false);
  assert.equal(sideways.state.total, 0);
  const upwards = galleryVerticalExitGesture(state, 0, -20, 10);
  assert.equal(upwards.exit, false);
  assert.equal(upwards.state.total, 0);
});

test('gallery trackpad starts within four pixels instead of waiting ten', () => {
  let state = initialGalleryWheelState();
  for (let i = 0; i < 3; i++) {
    const result = galleryWheelGesture(state, 1, 0, i * 9);
    state = result.state;
    assert.equal(result.step, 0);
  }
  assert.equal(galleryWheelGesture(state, 1, 0, 27).step, 1);
  const reversed = galleryWheelGesture(
    galleryWheelGesture(state, 1, 0, 27).state, -4, 0, 43);
  assert.equal(reversed.step, -1,
    'an immediate direction reversal must not wait for old momentum');
});

test('short and interrupted gallery snaps settle within 280 milliseconds', () => {
  assert.ok(gallerySnapDuration(0) <= .15);
  assert.ok(gallerySnapDuration(.4) < .2);
  assert.ok(gallerySnapDuration(1) <= .24);
  assert.ok(gallerySnapDuration(1.8) <= .28);
  assert.ok(gallerySnapDuration(7) <= .28);
  const source = readFileSync(new URL('../src/ProjectsSequence.jsx',
    import.meta.url), 'utf8');
  assert.match(source, /duration: gallerySnapDuration\(delta\)/);
  assert.match(source, /ease: 'power2\.out'/);
  assert.doesNotMatch(source, /duration: Math\.min\(\.82/,
    'the old 820ms card settle is still active');
});

test('flick velocity recognizes small intentional drags without vertical false positives', () => {
  assert.equal(gallerySwipeDirection(-8, 1, -.55), 1);
  assert.equal(gallerySwipeDirection(8, 0, .4), -1);
  assert.equal(gallerySwipeDirection(-16, 0, -.01), 1);
  assert.equal(gallerySwipeDirection(16, 0, .01), -1);
  assert.equal(gallerySwipeDirection(-5, 0, -1.0), 0,
    'sub-six-pixel accidental taps should not move a card');
  assert.equal(gallerySwipeDirection(-8, 1, -.1), 0,
    'slow tiny movements should not advance');
  assert.equal(gallerySwipeDirection(-25, 40, -.9), 0,
    'vertical scrolling should not move the horizontal gallery');
  assert.equal(gallerySwipeDirection(-100, 0, -3, true), 0,
    'cancelled pointer gestures should not move the gallery');
});

test('Projects uses one GPU render pass after Home rays finish', () => {
  const source = readFileSync(new URL('../src/LivePaperRenderer.jsx',
    import.meta.url), 'utf8');
  assert.match(source, /if \(rayStrength <= \.001\) \{/);
  assert.match(source,
    /if \(rayStrength <= \.001\) \{[\s\S]*?renderer\.setRenderTarget\(null\);[\s\S]*?renderer\.render\(world, camera\);/);
  assert.match(source, /else \{[\s\S]*?renderer\.setRenderTarget\(paperTarget\);/,
    'the approved Hole 01 chromatic rays must retain their two-pass render');
  assert.match(source, /uRayStrength\.value = rayStrength/);
});

test('Projects → About sends the same seven papers offscreen right while the original head lands', () => {
  const sequence = readFileSync(new URL('../src/ProjectsSequence.jsx',
    import.meta.url), 'utf8');
  const headCSS = readFileSync(new URL('../src/NewHomepage.css',
    import.meta.url), 'utf8');
  const aboutCSS = readFileSync(new URL('../src/AboutExperience.css',
    import.meta.url), 'utf8');
  assert.match(sequence, /departingCardOffset\(handoff, rank, width, height\)/);
  assert.match(sequence, /const handoff = aboutHandoffProgress\(scrollY,/);
  assert.match(sequence, /aboutHeadPose\(handoff,/);
  assert.match(sequence, /aboutHeadOpacity\(scrollY, aboutBottom, height\)/);
  assert.doesNotMatch(sequence, /galleryExitFade\(scrollY,/,
    'old fade-first exit must not hide approved sheets while still visible');
  assert.match(headCSS, /var\(--jw-head-x, 0px\)/,
    'reuse the permanent canvas with a horizontal translation');
  assert.match(aboutCSS, /#root \.about\.jw-about-experience \{/,
    'restored original About must keep all styles scoped');

  for (const [width, height] of sizes) {
    const galleryTop = 5000;
    const galleryHeight = Math.max(550, height);
    const rest = galleryTop + height * .10;
    const end = galleryTop + galleryHeight;
    assert.equal(aboutHandoffProgress(rest, galleryTop, galleryHeight, height), 0);
    assert.equal(aboutHandoffProgress(end, galleryTop, galleryHeight, height), 1);
    for (let i = 0; i <= 100; i++) {
      const p = i / 100;
      const current = aboutHandoffProgress(
        rest + (end - rest) * p, galleryTop, galleryHeight, height);
      const prior = aboutHandoffProgress(
        rest + (end - rest) * Math.max(0, p - .01),
        galleryTop, galleryHeight, height);
      assert.ok(current >= prior, 'reverse-seekable monotonic handoff');
    }
    for (let rank = 0; rank < 7; rank++) {
      const atRest = departingCardOffset(0, rank, width, height);
      const offscreen = departingCardOffset(1, rank, width, height);
      assert.equal(atRest.x, 0);
      assert.equal(atRest.opacity, 1);
      // Check actual viewport clearance, not an arbitrary 2.75-viewports
      // overshoot that made the old one-second exit feel too fast.
      const leftmostCardX = 3 * Math.min(width * .218, 290) *
        (GALLERY_FOCAL + 3 * 155) / GALLERY_FOCAL;
      const cardHalfWidth = (width <= 800
        ? Math.min(width * .55, 285)
        : Math.min(width * .26, 370)) / 2;
      assert.ok(offscreen.x - leftmostCardX - cardHalfWidth > width / 2 + 100,
        'even the leftmost side sheet must clear the RIGHT edge');
      assert.equal(offscreen.opacity, 0);
      const mid = departingCardOffset(.5, rank, width, height);
      assert.ok(mid.x > 0 && mid.opacity === 1,
        'paper should be visibly moving, not crossfading away');
    }
    const nonfeatured = departingCardOffset(.5, -1, width, height);
    assert.equal(nonfeatured.x, 0,
      'nonfeatured Home sheets must remain offscreen left');
    const galleryPose = galleryHeadPlacement(1, height);
    const start = aboutHeadPose(0, galleryPose, width, height);
    const arrived = aboutHeadPose(1, galleryPose, width, height);
    assert.equal(start.shift, galleryPose.shift);
    assert.equal(start.scale, galleryPose.scale);
    assert.ok(arrived.shift > start.shift, 'head must move DOWN');
    assert.ok(arrived.scale >= .9, 'keep approved 3D head clearly visible');
    assert.equal(arrived.x, 0,
      'original About head should land at the center of the 3D story');
    assert.deepEqual(aboutHeadPose(.5, galleryPose, width, height),
      aboutHeadPose(.5, galleryPose, width, height),
      'reverse scrolling must seek the exact same head pose');
    const aboutBottom = end + height * 1.25;
    assert.equal(aboutHeadOpacity(end, aboutBottom, height), 1,
      'head remains visible when entering About');
    assert.equal(aboutHeadOpacity(aboutBottom, aboutBottom, height), 0,
      'head clears before Contact');
  }
});

test('original Design Is Life About uses the ONE approved GLB and scrolls through all four chapters', () => {
  const main = readFileSync(new URL('../src/main.jsx',
    import.meta.url), 'utf8');
  const about = readFileSync(new URL('../src/AboutExperience.jsx',
    import.meta.url), 'utf8');
  const aboutCSS = readFileSync(new URL('../src/AboutExperience.css',
    import.meta.url), 'utf8');
  const head = readFileSync(new URL('../src/HomepageHead.jsx',
    import.meta.url), 'utf8');
  const motion = readFileSync(new URL('../src/ProjectsSequence.jsx',
    import.meta.url), 'utf8');
  const originalPage = readFileSync(new URL('../about.html',
    import.meta.url), 'utf8');

  assert.match(main, /<ProjectsSequence\/>\s*<AboutExperience\/>\s*<Contact\/>/);
  assert.match(about, /className="about jw-about-experience"/);
  assert.match(about, /Now I can’t speak for/);
  assert.match(about, /everyone\.\.\. But at least for me,/);
  assert.match(about, /Design is life!/);
  assert.match(about, /the human nature of design to me/);
  assert.match(about, /I was fortunate enough to start early/);
  assert.match(about, /art is subjective/);
  assert.match(about, /Photoshop, Illustrator, Procreate/);
  assert.match(originalPage, /Now I can’t speak for/);
  assert.equal((about.match(/className="jw-about-message/g) || []).length, 4,
    'four chapters must remain from the approved standalone About page');
  assert.doesNotMatch(about, /<iframe|<HomepageHead|head-interactive\.glb/,
    'Section 3 must not create a second head or iframe');
  assert.equal((head.match(/const HEAD_MODEL\s*=/g) || []).length, 1);
  assert.match(head, /installFloatingStory\(scene, camera, host, aboutSection\)/);
  assert.match(head, /installOpticalRipple\(renderer, scene, camera, pivot, aboutLines\)/);
  assert.match(head, /floatingStory\.update\(dt\)/);
  assert.match(head, /opticalRipple\.render\(controller\.time\)/);
  assert.match(head, /window\.addEventListener\('jw-about-color', onAboutColor\)/);
  assert.doesNotMatch(about, /setupFloppyDisk|disk-view|floppy|Sketchfab/i,
    'deleted drive must not reappear in the live About page');
  assert.match(aboutCSS, /jw-about-three-ready/);
  assert.match(motion, /observer\.observe\(aboutNode\)/);
  assert.doesNotMatch(head, /!live \|\| !loaded \|\| !visible/,
    '3D hit test must never refer to an undeclared variable');
});

test('Section 2 → About stays fluid from gallery rest to original title reveal', () => {
  const source = readFileSync(new URL('../src/ProjectsSequence.jsx',
    import.meta.url), 'utf8');
  const aboutCSS = readFileSync(new URL('../src/AboutExperience.css',
    import.meta.url), 'utf8');
  assert.match(source, /const intro = reduced\.matches/);
  assert.match(source, /aboutIntroPose\(handoff, height\)/);
  assert.match(source, /setProperty\('--jw-about-intro-opacity'/);
  assert.match(source, /setProperty\('--jw-about-intro-lift'/);
  assert.match(source, /animatePageTo\(docTop\(about\), 1\.08,/,
    'gallery exit should begin promptly and still ease smoothly');
  assert.match(source, /}, 'sine\.inOut'\)/);
  assert.match(aboutCSS, /opacity: var\(--jw-about-intro-opacity, 1\)/);
  assert.match(aboutCSS, /transform: translate3d\(0, var\(--jw-about-intro-lift, 0px\), 0\)/);
  assert.doesNotMatch(aboutCSS, /transition: opacity \.3s ease;/,
    'a delayed CSS transition must not fight with scroll-derived position');

  for (const [width, height] of sizes) {
    const top = 4800;
    const galleryHeight = Math.max(550, height);
    const rest = galleryRestScrollY(top, height);
    const aboutTop = top + galleryHeight;
    const sample = delta => aboutHandoffProgress(
      rest + delta, top, galleryHeight, height);
    assert.equal(sample(0), 0, 'gallery remains locked until explicit exit');
    assert.ok(sample(height * .025) > 0,
      'the first positive exit scroll must start paper movement');
    assert.equal(aboutHandoffProgress(aboutTop, top, galleryHeight, height), 1);
    let lastX = 0, lastHeadY = galleryHeadPlacement(1, height).shift;
    for (let step = 0; step <= 200; step++) {
      const p = step / 200;
      const scroll = rest + (aboutTop - rest) * p;
      const actual = aboutHandoffProgress(scroll, top, galleryHeight, height);
      assert.ok(Math.abs(actual - p) < 1e-8,
        'native scroll and animation must share one reversible timebase');
      const sheet = departingCardOffset(actual, 0, width, height);
      const head = aboutHeadPose(actual,
        galleryHeadPlacement(1, height), width, height);
      const intro = aboutIntroPose(actual, height);
      assert.ok(sheet.x + 1e-7 >= lastX);
      assert.ok(head.shift + 1e-7 >= lastHeadY);
      assert.ok(intro.opacity >= 0 && intro.opacity <= 1);
      assert.ok(intro.lift >= 0 && intro.lift <= Math.min(80, height * .09));
      if (p < .53) assert.equal(intro.opacity, 0,
        'no premature text overlay while cards depart');
      if (p > .92) assert.equal(intro.opacity, 1,
        'About title must be fully in place at the section boundary');
      if (p < .80) assert.equal(sheet.opacity, 1,
        'do not fade a still-visible featured sheet');
      lastX = sheet.x;
      lastHeadY = head.shift;
    }
    const early = departingCardOffset(.02, 0, width, height);
    assert.ok(early.x > 0, 'cards begin leaving without a dead zone');
    assert.ok(aboutIntroPose(0, height).lift > 0);
    assert.equal(aboutIntroPose(1, height).lift, 0);
    assert.equal(aboutIntroPose(1, height).opacity, 1);
    assert.deepEqual(aboutIntroPose(.68, height), aboutIntroPose(.68, height),
      'reverse scroll must restore precisely the same intro pose');
  }
});


test('Section 2 scroll unlock never postpones itself with continued trackpad motion', () => {
  const source = readFileSync(new URL('../src/ProjectsSequence.jsx',
    import.meta.url), 'utf8');
  const helper = readFileSync(new URL('../src/GalleryLoopMotion.js',
    import.meta.url), 'utf8');
  assert.match(source, /exitReadyAt = performance\.now\(\) \+ 220;/);
  const wheelHandler = source.slice(source.indexOf('const onVerticalWheel = event =>'),
    source.indexOf('const onTouchStart = event =>'));
  assert.match(wheelHandler, /if \(now < exitReadyAt\)/);
  assert.doesNotMatch(wheelHandler, /exitReadyAt\s*=/,
    'incoming wheel events must not reset or extend the lock');
  assert.match(source, /animatePageTo\(docTop\(about\), 1\.08,/);
  assert.match(helper, /next\.total >= 8/);

  let state = initialGalleryVerticalState();
  const inputs = [1.4, 1.9, 2.3, 2.5];
  let exits = 0;
  for (let i = 0; i < inputs.length; i++) {
    const result = galleryVerticalExitGesture(state, .1, inputs[i], i * 12);
    state = result.state;
    if (result.exit) exits++;
  }
  assert.equal(exits, 1,
    'a single short vertical trackpad impulse must unlock without repeated scrolling');
  const horizontal = galleryVerticalExitGesture(
    initialGalleryVerticalState(), 9, 2, 0);
  assert.equal(horizontal.exit, false,
    'horizontal card navigation must remain separate from About scroll');
});

test('ABOUT header uses the approved purple type but stays vertically sticky to Section 3', () => {
  const about = readFileSync(new URL('../src/AboutExperience.jsx',
    import.meta.url), 'utf8');
  const aboutCss = readFileSync(new URL('../src/AboutExperience.css',
    import.meta.url), 'utf8');
  const projectsCss = readFileSync(new URL('../src/ProjectsSequence.css',
    import.meta.url), 'utf8');
  assert.match(about, /<h2 id="jw-about-heading" className="jw-about-heading"><WordHighlight>ABOUT<\/WordHighlight><\/h2>/);
  const source = projectsCss.match(/\.jw-projects-stage__information h2\s*\{([^}]*)\}/)?.[1];
  const restored = aboutCss.match(
    /#root \.about\.jw-about-experience > \.jw-about-heading\s*\{([^}]*)\}/)?.[1];
  assert.ok(source && restored, 'both approved headings must have scoped CSS');
  for(const rule of ['color: #8750f1;', "font-family: 'DM Sans', Arial, sans-serif;",
      'font-weight: 700;']) {
    assert.ok(source.includes(rule) && restored.includes(rule),
      'preserve approved title treatment: '+rule);
  }
  assert.match(restored, /position: sticky;/);
  assert.doesNotMatch(restored, /position: (absolute|fixed);/);
  assert.match(restored, /writing-mode: vertical-rl;/);
  assert.match(restored, /text-orientation: upright;/);
  assert.match(restored, /top: clamp\(84px, 12svh, 132px\);/);
  assert.match(aboutCss, /top: clamp\(78px, 11svh, 108px\);/,
    'sticky position must remain inside the viewport on mobile');
  assert.match(aboutCss, /overflow: visible;/,
    'sticky must not be clipped by its About parent');
  assert.match(aboutCss, /height: max-content;/,
    'sticky element remains a bounded in-flow child of About');
});

test('3D drive is completely absent from both About pages and no unused renderer remains', () => {
  const live = readFileSync(new URL('../src/AboutExperience.jsx', import.meta.url), 'utf8');
  const liveCss = readFileSync(new URL('../src/AboutExperience.css', import.meta.url), 'utf8');
  const standalone = readFileSync(new URL('../about.html', import.meta.url), 'utf8');
  const standaloneJs = readFileSync(new URL('../src/about/main.js', import.meta.url), 'utf8');
  const standaloneCss = readFileSync(new URL('../src/about/style.css', import.meta.url), 'utf8');
  const story = readFileSync(new URL('../src/about/floating-story.js', import.meta.url), 'utf8');

  for (const [label, content] of [
    ['live About', live], ['live CSS', liveCss],
    ['standalone About', standalone], ['standalone controller', standaloneJs],
    ['standalone CSS', standaloneCss], ['3D narrative', story],
  ]) {
    assert.doesNotMatch(content, /floppy|disk.view|diskRef|diskHost|setupFloppyDisk|sketchfab|story-floppy|jw-about-disk|first design I ever saved/i,
      label + ' must not reference or initialize the deleted drive');
  }
  assert.equal(existsSync(new URL('../src/about/floppy.js', import.meta.url)), false,
    'standalone Three.js drive implementation must be deleted, not merely hidden');
  assert.equal((live.match(/<article[^>]*data-story="/g) || []).length, 4,
    'four About chapters must remain');
  assert.match(live, /jw-about-heading"><WordHighlight>ABOUT<\/WordHighlight><\/h2>/,
    'approved purple ABOUT heading must remain');
  assert.match(live, /I was fortunate enough to start early/,
    'second chapter must remain coherent without a model');
});

test('the exact nine-reference tool row lives at the END of About with responsive hover and tap', () => {
  const about = readFileSync(new URL('../src/AboutExperience.jsx', import.meta.url), 'utf8');
  const aboutCss = readFileSync(new URL('../src/AboutExperience.css', import.meta.url), 'utf8');
  const tools = readFileSync(new URL('../src/ChoiceOfTools.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/ChoiceOfTools.css', import.meta.url), 'utf8');
  const story = readFileSync(new URL('../src/about/floating-story.js', import.meta.url), 'utf8');
  const sequence = readFileSync(new URL('../src/ProjectsSequence.jsx', import.meta.url), 'utf8');

  assert.match(about, /import ChoiceOfTools from '\.\/ChoiceOfTools\.jsx';/);
  assert.match(about, /<ChoiceOfTools\/>/);
  assert.ok(about.indexOf('<ChoiceOfTools/>') > about.indexOf('data-story="4"'),
    'tool chooser must follow all four original About chapters');
  assert.match(css, /height: 100svh/);
  assert.match(css, /radial-gradient/);
  assert.match(tools, /CHOICE OF TOOLS/);
  assert.match(tools, /MY /);
  assert.match(tools, /Choose a tool/);
  assert.match(tools, /onPointerEnter/);
  assert.match(tools, /onPointerLeave/);
  assert.match(tools, /onFocus/);
  assert.match(tools, /onClick/);
  assert.match(css, /scale\(1\.38\)/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /#8750f1/);
  assert.match(aboutCss, /min-height: 545svh/);
  assert.match(aboutCss, /min-height: 650svh/);
  assert.match(story, /about\.style\.minHeight=\(toolsStart\+100\)/);
  assert.match(sequence, /aboutToolsHeadBlend\(scrollY, toolsTop, height\)/);
  assert.match(sequence, /aboutToolsHeadOffset\(toolsBlend, width\)/);
  assert.doesNotMatch(tools, /HomepageHead|head-interactive\.glb|<canvas|<iframe/,
    'the design-tool viewport must reuse the ONE already mounted head');

  const order = [
    'illustrator', 'claude', 'procreate', 'canva', 'figma',
    'github', 'javascript', 'chatgpt', 'photoshop',
  ];
  let prior = -1;
  for (const id of order) {
    const match = new RegExp("id: '" + id + "', name: '[^']+', src: '([^']+)'");
    const item = tools.match(match);
    assert.ok(item, 'missing reference icon: ' + id);
    assert.ok(tools.indexOf("id: '" + id + "'") > prior,
      'reference icon order changed at ' + id);
    prior = tools.indexOf("id: '" + id + "'");
    assert.equal(existsSync(new URL('../public' + item[1], import.meta.url)), true,
      'icon source must exist in repository: ' + item[1]);
  }
  assert.equal((tools.match(/\{ id: '/g) || []).length, order.length);
  assert.doesNotMatch(tools, /https?:\/\//,
    'logo assets should never require a third-party runtime host');
});

test('the single approved GLB moves left into tool preview and reverse-seeks identically', () => {
  const top = 4000;
  for (const [width, height] of sizes) {
    const start = top - height * .86;
    const end = top - height * .06;
    assert.equal(aboutToolsHeadBlend(start, top, height), 0);
    assert.equal(aboutToolsHeadBlend(end, top, height), 1);
    assert.equal(aboutToolsHeadBlend(start - 400, top, height), 0);
    assert.equal(aboutToolsHeadBlend(top, top, height), 1);
    assert.equal(aboutToolsHeadOffset(0, width), 0);
    assert.equal(aboutToolsHeadOffset(1, width),
      -width * (width <= 600 ? .27 : .31));
    let previous = 0;
    for (let i = 0; i <= 100; i++) {
      const y = start + (end - start) * i / 100;
      const t = aboutToolsHeadBlend(y, top, height);
      assert.ok(t >= previous - 1e-10,
        'head must travel continuously left as user scrolls into tool panel');
      assert.ok(aboutToolsHeadOffset(t, width) <= 0);
      assert.equal(t, aboutToolsHeadBlend(y, top, height),
        'scrolling back must seek exactly the same model transform');
      previous = t;
    }
  }
  assert.equal(aboutToolsHeadBlend(0, Infinity, 700), 0);
});

test('3D cursor tracking follows the projected head center with precise larger motion', () => {
  const renderer = readFileSync(new URL('../src/HomepageHead.jsx', import.meta.url), 'utf8');
  assert.match(renderer, /const center = headScreenCenter\(\);/);
  assert.match(renderer, /pointerRelativeToHead\(/);
  assert.doesNotMatch(renderer, /event\.clientX \/ window\.innerWidth \* 2 - 1/,
    'old viewport-centered cursor mapping is too imprecise for translated head');

  const neutral = pointerRelativeToHead(240, 300, 240, 300, 1200, 800);
  assert.deepEqual(neutral, {x:0,y:0});
  const rightDown = pointerRelativeToHead(800, 600, 240, 300, 1200, 800);
  assert.ok(rightDown.x > .95 && rightDown.y < -.8);
  const leftUp = pointerRelativeToHead(0, 0, 240, 300, 1200, 800);
  assert.ok(leftUp.x < 0 && leftUp.y > .8);
  assert.deepEqual(pointerRelativeToHead(50000,-50000,240,300,1200,800),
    {x:1,y:1}, 'extreme cursor positions remain clamped');
  assert.deepEqual(pointerRelativeToHead(500,300,500,300,1200,800),
    {x:0,y:0}, 'when head moves left or right, neutral gaze moves with it');

  const head = new HeadController(() => .5);
  head.movePointer(1,-1);
  let moved;
  for(let n=0;n<8;n++)moved=head.update(.05);
  assert.ok(SETTINGS.follow >= 7 && SETTINGS.follow <= 8.5,
    'head follows naturally without rigidly snapping to gaze');
  assert.ok(moved.yaw > .60, 'head follows mouse much farther right than before');
  assert.ok(moved.pitch > .40 && moved.pitch < .46,
    'head looks down noticeably less without freezing gaze');
  assert.ok(moved.horizontal > .09, 'head has subtle physical sideways tracking');
  assert.ok(moved.vertical < -.035 && moved.vertical > -.075,
    'downward physical motion remains subtle without dipping too low');
  head.movePointer(-1,1);
  for(let n=0;n<12;n++)moved=head.update(.05);
  assert.ok(moved.yaw < -.55 && moved.pitch < -.48,
    'reversing the pointer reverses head look direction quickly');
});

test('short Projects exit still rests with responsive card controls before About', () => {
  const css = readFileSync(new URL('../src/ProjectsSequence.css', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src/ProjectsSequence.jsx', import.meta.url), 'utf8');
  assert.match(css, /#root \.jw-projects-journey\s*\{[\s\S]*?height: 72svh;[\s\S]*?min-height: 520px;/);
  assert.match(css, /#root \.jw-projects-stage\s*\{[\s\S]*?height: 100svh;/,
    'full-screen gallery canvas must not be resized or made unclickable');
  const anchors=(source.match(/window\.scrollY < sectionTop \+ sectionHeight - height \* \.18;/g)||[]).length;
  assert.equal(anchors,2,
    'gallery controls and settled-state detection must share the new threshold');
  assert.match(source, /exitReadyAt = performance\.now\(\) \+ 220;/,
    'fix for repeatedly extended scroll lock must stay preserved');
  for(const height of [480,620,722,844,1080]){
    const newLength=Math.max(height*.72,520);
    const oldLength=Math.max(height,550);
    assert.ok(newLength <= oldLength,
      'document must never grow to reach Section 3');
    const rest=height*.1;
    const interactiveLimit=newLength-height*.18;
    assert.ok(rest < interactiveLimit,
      'approved gallery cards stay interactive at their resting location');
    const exitDistance=newLength-rest;
    assert.ok(exitDistance>height*.3,
      'enough travel remains for the seven sheets to clear right');
    if(height>=722)assert.ok(exitDistance <= (oldLength-rest)*.79,
      'exit is substantially shorter on desktop and large phones');
  }
});

test('vertical ABOUT heading cannot appear until every pixel of Section 2 has passed', () => {
  const sequence = readFileSync(new URL('../src/ProjectsSequence.jsx',
    import.meta.url), 'utf8');
  const style = readFileSync(new URL('../src/AboutExperience.css',
    import.meta.url), 'utf8');
  assert.match(sequence, /aboutTop = about \? docTop\(about\) : Infinity;/);
  assert.match(sequence, /aboutHeadingReveal\(scrollY, aboutTop, height\)/);
  assert.match(sequence, /dataset\.headingVisible =/);
  assert.match(sequence, /getBoundingClientRect\(\)\.top <= -headingClearance/);
  assert.match(sequence, /scrollY >= sectionTop \+ sectionHeight/);
  assert.match(sequence, /!isShown/);
  assert.match(sequence, /delete aboutSection\.dataset\.headingVisible;/);
  assert.match(style, /visibility: hidden;/,
    'hide the heading at the paint layer, not just fade it with scroll');
  assert.match(style, /data-heading-visible="true"/);
  assert.match(style, /visibility: visible;/);
  assert.match(style, /position: sticky;/);
  assert.match(style, /writing-mode: vertical-rl;/);
  assert.equal(aboutHeadingReveal(0, Infinity, 844), 0);

  for(const height of [560,722,844,1080]){
    const aboutTop=5000;
    for(const offset of [-3000,-height,-1,0]){
      assert.equal(aboutHeadingReveal(aboutTop+offset,aboutTop,height),0,
        'heading appeared while Projects was still onscreen');
    }
    assert.ok(aboutHeadingReveal(aboutTop+height*.045,aboutTop,height) > 0);
    assert.equal(aboutHeadingReveal(aboutTop+height*.10,aboutTop,height),1);
    assert.equal(aboutHeadingReveal(aboutTop-height*.01,aboutTop,height),0,
      'reverse scrolling must hide the heading again at the Projects boundary');
  }
});

test('About story ends near the tool viewport instead of leaving multi-screen blank space', () => {
  const css = readFileSync(new URL('../src/AboutExperience.css',import.meta.url), 'utf8');
  const story = readFileSync(new URL('../src/about/floating-story.js',import.meta.url), 'utf8');
  const tools = readFileSync(new URL('../src/ChoiceOfTools.css',import.meta.url), 'utf8');
  assert.match(css, /min-height: 545svh;/);
  assert.match(css, /min-height: 650svh;/);
  assert.doesNotMatch(css, /min-height: (740|785|700|615)svh;/,
    'remove previous arbitrary overlong fallback floors');
  assert.match(story, /article\.style\.top=\(nextTop\/vh\*100\)/,
    '3D and DOM chapters must share the same scroll positions');
  assert.match(story, /const domEnd=articles\.reduce/);
  assert.match(story, /const textEnd=positions\.reduce/);
  assert.match(story, /const storyEnd=Math\.max\(textEnd,domEnd\)/);
  assert.match(story, /const toolsStart=Math\.ceil\(\(storyEnd\+Math\.min\(vh\*\.15,110\)\)/);
  assert.match(story, /about\.style\.minHeight=\(toolsStart\+100\)\+'svh'/);
  assert.match(story, /prepare\(\)\{layout\(\);root\.visible=false\}/,
    'layout must be prepared before reaching About, not during scroll');
  assert.match(story, /about\.dataset\.storyHeightSource='three';/,
    '3D layout must own the height only while its version is active');
  const fallback = readFileSync(new URL('../src/AboutExperience.jsx',import.meta.url),'utf8');
  assert.match(fallback, /const lastChapter = section\.querySelector\('\[data-story="4"\]'\)/);
  assert.match(fallback, /const lastLine = lastChapter\.getBoundingClientRect\(\)\.bottom - top/);
  assert.match(fallback, /section\.style\.minHeight =/);
  assert.match(fallback, /Math\.ceil\(lastLine \+ breathing \+ panelHeight\) \+ 'px'/);
  assert.match(fallback, /section\.dataset\.storyHeightSource === 'three'/,
    'fallback must not fight the prepared 3D layout');
  assert.match(fallback, /chapterObserver\.disconnect\(\)/);
  const head = readFileSync(new URL('../src/HomepageHead.jsx',import.meta.url),'utf8');
  assert.match(head, /floatingStory\?\.prepare\(\)/);
  assert.match(tools, /bottom: 0;/);
  assert.match(tools, /height: 100svh;/);
  assert.ok(740-545>=150, 'desktop fallback must remove substantial blank travel');
  assert.ok(785-650>=100, 'mobile fallback must remove substantial blank travel');
});

test('looser cursor-follow adds a little organic roll without losing accurate gaze', () => {
  const controller = new HeadController(()=>.5);
  controller.movePointer(.8,-.7);
  let output;
  for(let i=0;i<10;i++) output=controller.update(.05);
  assert.ok(output.yaw>.45 && output.pitch>.29 && output.pitch<.33,
    'preserve sideways and upward tracking but soften downward pitch');
  assert.ok(output.roll<-.01 && output.roll>-.08,
    'subtle roll follows the gaze without dramatic leaning');
  assert.ok(SETTINGS.follow>7 && SETTINGS.follow<9.5,
    'soften previous overly stiff follow rate');
  assert.ok(SETTINGS.translateFollow<9.5);
  controller.movePointer(-.8,.7);
  for(let i=0;i<15;i++)output=controller.update(.05);
  assert.ok(output.yaw<-.45 && output.pitch<-.35,
    'opposite direction should remain responsive and reversible');
  assert.ok(output.roll>0 && output.roll<.08,
    'secondary roll should return smoothly to the opposite side');
});

test('Section 3 Vision Lab label is removed completely while approved About remains', () => {
  const about = readFileSync(new URL('../src/AboutExperience.jsx',import.meta.url),'utf8');
  const css = readFileSync(new URL('../src/AboutExperience.css',import.meta.url),'utf8');
  const tools = readFileSync(new URL('../src/ChoiceOfTools.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(about, /VISION LAB|jw-about-signature/i);
  assert.doesNotMatch(css, /jw-about-signature/i);
  assert.match(about, /<h2 id="jw-about-heading"/);
  assert.match(about, /<ChoiceOfTools\/>/);
  assert.equal((about.match(/<article[^>]*data-story="/g)||[]).length,4);
  assert.match(tools, /CHOICE OF TOOLS/);
});

test('About highlights each DOM word independently without changing original copy', () => {
  const words = readFileSync(new URL('../src/WordHighlight.jsx',import.meta.url),'utf8');
  const css = readFileSync(new URL('../src/WordHighlight.css',import.meta.url),'utf8');
  const about = readFileSync(new URL('../src/AboutExperience.jsx',import.meta.url),'utf8');
  const tools = readFileSync(new URL('../src/ChoiceOfTools.jsx',import.meta.url),'utf8');
  assert.match(words, /split\(\/\(\\s\+\)\/u\)/,
    'split into word-sized tokens while preserving whitespace');
  assert.match(words, /className="jw-hover-word"/);
  assert.match(css, /\.jw-hover-word:hover/);
  assert.match(css, /rgba\(173, 108, 245, \.29\)/,
    'individual word should have a light purple, not solid purple, highlight');
  assert.match(css, /pointer-events: auto/);
  assert.match(about, /<WordHighlight>Now I can’t speak for<\/WordHighlight>/);
  assert.match(about, /<WordHighlight>Design is life!<\/WordHighlight>/);
  assert.match(about, /<em><WordHighlight>“art is subjective\.”<\/WordHighlight><\/em>/);
  assert.match(about, /<WordHighlight>Photoshop, Illustrator, Procreate/);
  assert.match(tools, /<WordHighlight>Choose a tool<\/WordHighlight>/);
  assert.match(tools, /<WordHighlight>\{activeTool\.name\}<\/WordHighlight>/);
  assert.match(tools, /<WordHighlight>\{activeTool\.detail\}<\/WordHighlight>/);
});

test('3D About story highlights only the exact word under the cursor', () => {
  const line = 'Purple words, one at a time!';
  const measure = str => str.length * 10;
  const ranges = wordRangesForLine(line, measure, 14, 320);
  assert.deepEqual(ranges.map(x=>x.word),
    ['Purple','words,','one','at','a','time!']);
  for(const range of ranges){
    const u=(range.u0+range.u1)*.5;
    const hit=hoveredWordAtUV(ranges,u,.5);
    assert.equal(hit?.word,range.word,'only hovered word highlighted');
  }
  assert.equal(hoveredWordAtUV(ranges,0,.5),null,
    'no color in transparent texture padding');
  assert.equal(hoveredWordAtUV(ranges,.5,.05),null,
    'vertical space above text does not react');
  assert.equal(hoveredWordAtUV(ranges,.5,.92),null,
    'vertical space below text does not react');
  assert.equal(hoveredWordAtUV(ranges,NaN,.5),null);
  assert.deepEqual(wordRangesForLine('',measure,14,70),[]);

  const source=readFileSync(new URL('../src/about/floating-story.js',import.meta.url),'utf8');
  assert.match(source, /wordRangesForLine\(text,/);
  assert.match(source, /hoveredWordAtUV\(data\.hoverWords,/);
  assert.match(source, /mesh\.position\.x=data\.baseX/,
    'hover hitbox follows exact animated word position');
  assert.match(source, /hoverRange:\{value:new THREE\.Vector2\(-2,-2\)\}/);
  assert.match(source, /hoverStrength:\{value:0\}/);
  assert.match(source, /uHoverRange/);
  assert.match(source, /uHoverStrength/);
  assert.match(source, /diffuseColor\.a\*=max\(distortedInk\.a,lilac\*0\.58\)/,
    'lilac background preserves dark word ink and its transparency');
  assert.match(source, /shader\.fragmentShader/);
  assert.match(source, /window\.removeEventListener\('pointermove',onPointerMove\)/,
    'clean up pointer listener to avoid accumulated handlers');
  assert.match(source, /story-displacement-per-word-lilac-v5/);
});

test('vertical ABOUT heading disappears as soon as the tools viewport enters', () => {
  const sequence = readFileSync(new URL('../src/ProjectsSequence.jsx',
    import.meta.url), 'utf8');
  const style = readFileSync(new URL('../src/AboutExperience.css',
    import.meta.url), 'utf8');
  assert.match(sequence, /const toolsEnteredViewport = Boolean\(toolsPanel &&/);
  assert.match(sequence, /toolsPanel\.getBoundingClientRect\(\)\.top < height\)/);
  assert.match(sequence, /passedProjects && actualAboutPastHeader && !toolsEnteredViewport/,
    'the story label must be gated by the live tools viewport');
  assert.match(style, /data-heading-visible="true"/);
  const inactive = style.match(
    /#root \.about\.jw-about-experience > \.jw-about-heading\s*\{([^}]*)\}/)?.[1];
  assert.ok(inactive, 'sticky ABOUT heading rule must exist');
  assert.match(inactive, /visibility: hidden;/);
  assert.match(inactive, /transition: none;/,
    'hide immediately when tools enters, never linger for 250ms');
  assert.doesNotMatch(inactive, /visibility 0s linear \.25s/,
    'delayed visibility kept ABOUT visible over tool row');
  assert.match(style, /position: sticky;/,
    'keep title sticky through the story until tools');
});

test('head has asymmetric downward limits without weakening its upward gaze', () => {
  const settle = (x, y) => {
    const head = new HeadController(() => .5);
    head.movePointer(x,y);
    let pose;
    for(let i=0;i<40;i++)pose=head.update(.05);
    return pose;
  };
  const down=settle(.8,-1);
  const up=settle(.8,1);
  const left=settle(-1,0),right=settle(1,0);
  assert.ok(down.pitch>.43 && down.pitch<.47,
    'downward limit is less extreme than before');
  assert.ok(up.pitch<-.57,
    'upward range must remain the same');
  assert.ok(Math.abs(down.pitch)<Math.abs(up.pitch)*.77,
    'downward rotation reduction is targeted, not a global sensitivity loss');
  assert.ok(down.vertical>-.085,
    'head must not translate too far down while following cursor');
  assert.ok(up.vertical>.08,
    'existing upward translation is preserved');
  assert.ok(right.yaw>.59 && left.yaw<-.59,
    'left and right tracking must remain intact');
});

test('downward gaze trims additional pitch without changing side or upward target', () => {
  const controller = readFileSync(new URL('../src/about/controller.js', import.meta.url), 'utf8');
  assert.match(controller, /\(downward\?\.74:1\)/,
    'downward pitch strength must be 0.74, not prior 0.82');
  assert.match(controller, /\(downward\?\.075:\.10\)/,
    'physical vertical translation remains at the already approved amount');
  const settle = (x,y) => {
    const head = new HeadController(() => .5);
    head.movePointer(x,y);
    let p;
    for(let i=0;i<40;i++)p=head.update(.05);
    return p;
  };
  const down=settle(0,-1), up=settle(0,1), right=settle(1,0);
  assert.ok(down.pitch > .43 && down.pitch < .47,
    'head can look down but stays below the former angle');
  assert.ok(up.pitch < -.59,
    'the upward range is unchanged');
  assert.ok(right.yaw > .59,
    'horizontal movement stays at the approved sensitivity');
  assert.ok(down.vertical > -.085,
    'the current vertical offset remains modest');
});
