import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rollingGlyphs } from '../src/rollingTitleGlyphs.js';
import { galleryHeadPlacement, galleryCameraProgress, CAMERA_DESCENT, spiralGalleryPose } from '../src/SpiralGalleryMotion.js';
import { sectionBoundaryDelta, rearmSectionBoundary } from '../src/about/section-boundary-snap.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../src/NewHomepage.css');
const title = read('../src/RollingTitle.jsx');
const subtitle = read('../src/EmergingSubtitle.jsx');
const homepage = read('../src/NewHomepage.jsx');
const head = read('../src/HomepageHead.jsx');

test('mobile typography gets its anchor from the actual projected 3D head', () => {
  assert.match(head, /const publishHeadAnchor = \(\) =>/);
  assert.match(head, /pivot\.getWorldPosition\(new THREE\.Vector3\(\)\)/);
  assert.match(head, /headHalfHeight = dimensions\.y \* scale \* 0\.5/);
  assert.match(head, /onAnchorRef\.current\(\{/);
  assert.match(homepage, /const receiveHeadAnchor = point =>/);
  assert.match(homepage, /point\.topY - rect\.top/);
  assert.match(homepage, /point\.bottomY - rect\.top/);
  assert.match(head, /const projectedBottom = bottom\.project\(camera\)/);
  assert.match(homepage, /onAnchor=\{receiveHeadAnchor\}/);
  assert.match(homepage, /style=\{mobileHeadAnchorStyle\}/);
});

test('mobile title and its white silhouette are re-centered together behind head', () => {
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /\.jw-new-home__rolling-title \.jw-roll-scene,/);
  assert.match(css, /\.jw-title-head-ink \.jw-roll-scene/);
  assert.match(css, /translate\(var\(--jw-head-local-x, 50%\), var\(--jw-head-local-y, 50%\)\)/);
  assert.match(css, /scale\(\.90\)/);
  assert.match(css, /translate\(calc\(0% - var\(--jw-title-center, 50%\)\), -50%\)/);
  assert.match(title, /const TITLE_INK_CENTERS = rollingGlyphs\.map/);
  assert.match(title, /'--jw-title-center': TITLE_INK_CENTERS\[sceneIndex\]/);
  assert.match(title, /className="jw-title-head-ink__artboard" style=\{anchorStyle\}/);
});

test('every animated title fits within a centered phone artboard with side margins', () => {
  assert.equal(rollingGlyphs.length, 7);
  for (const glyphs of rollingGlyphs) {
    const minX = Math.min(...glyphs.map(g => g.x));
    const maxX = Math.max(...glyphs.map(g => g.x + g.w));
    const centeredLeft = 0.5 - .90 * (maxX - minX) / (2 * 1440);
    const centeredRight = 0.5 + .90 * (maxX - minX) / (2 * 1440);
    assert.ok(centeredLeft > .035 && centeredRight < .965,
      'each enlarged title must remain inside its own phone artboard');
  }
});

test('the original purple dot and subtitle remain one centered SVG above head', () => {
  assert.match(subtitle, /const SUBTITLE_INK_MIDPOINT = \[/);
  assert.match(subtitle, /'--jw-subtitle-mobile-center'/);
  assert.match(css, /width: 280vw;\s*height: 157\.5vw;/);
  assert.match(css, /left: calc\(var\(--jw-head-local-x, 50%\) - var\(--jw-subtitle-mobile-center\)\)/);
  assert.match(css, /top: calc\(var\(--jw-head-local-top, 35%\) - 20px - 58\.33vw\)/);
  assert.match(subtitle, /src={`\/new-homepage\/subtitle-\$\{slug\}\.svg`}/);
  assert.match(subtitle, /sink: \(\) => animateTo/);
  assert.match(subtitle, /rise: \(\) => animateTo/);
});

test('phone-only indicators follow the rendered bottom edge of the 3D head', () => {
  assert.match(css, /--jw-head-local-bottom, 100%/);
  assert.match(homepage, /'--jw-head-local-bottom'/);
  assert.match(css, /\.jw-new-home__indicators \{\s*top: calc\(var\(--jw-head-local-bottom/);
});

test('mobile head remains at its original height during the outward paper orbit', () => {
  const height = 844;
  const phase = .78;
  const ringShift = -height * CAMERA_DESCENT * galleryCameraProgress(phase);
  const mobile = galleryHeadPlacement(phase, height, 390);
  const desktop = galleryHeadPlacement(phase, height, 1280);
  assert.equal(mobile.shift, 0,
    'mobile head must not descend to the misplaced paper mask');
  assert.ok(Math.abs(desktop.shift - ringShift) > 1,
    'desktop should retain its earlier approved settle');
  assert.equal(galleryHeadPlacement(0, height, 390).shift, 0);
  assert.ok(Math.abs(galleryHeadPlacement(0, height, 1280).shift) < 1e-8);
  for (const p of [0, .12, .40, .78, .89, .99, 1]) {
    assert.deepEqual(galleryHeadPlacement(p, height, 390),
      { shift: 0, scale: 1 }, 'mobile head must not move on Home');
  }
  const mobileCard = spiralGalleryPose(.65, 0, -1, 390, height,
    { x: 0, y: 0, z: 0, scale: 1, ry: 0, opacity: 1 });
  const desktopCard = spiralGalleryPose(.65, 0, -1, 1280, height,
    { x: 0, y: 0, z: 0, scale: 1, ry: 0, opacity: 1 });
  assert.ok(Number.isFinite(mobileCard.y) && Number.isFinite(desktopCard.y));
  const sequence = read('../src/ProjectsSequence.jsx');
  assert.match(sequence, /galleryHeadPlacement\(p, height, width\)/);
});

test('all seven original scenes and their paper/head animation systems remain intact', () => {
  assert.equal((homepage.match(/slug: '/g) || []).length, 7);
  assert.match(homepage, /<RollingTitle/);
  assert.match(homepage, /<EmergingSubtitle/);
  assert.match(homepage, /jw-continuous-head/);
  assert.match(homepage, /Shared cards render once outside Home and Work/);
});

test('homepage replaces arrow buttons with an accessible animated swipe-up cue', () => {
  assert.doesNotMatch(homepage, /jw-new-home__buttons|Previous discipline|Next discipline/);
  assert.doesNotMatch(css, /jw-new-home__buttons/);
  assert.match(homepage, /className="jw-new-home__swipe-cue" href="#work"/);
  assert.match(homepage, /aria-label="Swipe up or tap to explore selected work"/);
  assert.match(css, /\.jw-new-home__swipe-cue \{[\s\S]*?left: 50%;[\s\S]*?bottom: 0;/);
  assert.match(css, /@keyframes jw-swipe-cue-rise/);
  assert.match(css, /\.jw-new-home__swipe-cue-chevrons::before/);
  assert.match(css, /animation: none;/);
  assert.match(homepage, /onPointerUp=\{pointerEnd\}/);
  assert.match(homepage, /requestAdvance\(i, 'direct'\)/);
});

test('new boundaries settle About, capabilities and Contact only near their entrance', () => {
  assert.equal(sectionBoundaryDelta(200, 800), 200);
  assert.equal(sectionBoundaryDelta(-200, 800, false, -1), -200);
  assert.equal(sectionBoundaryDelta(-200, 800, false, 1), null);
  assert.equal(sectionBoundaryDelta(-200, 800), null);
  assert.equal(sectionBoundaryDelta(200, 800, false, -1), null);
  assert.equal(sectionBoundaryDelta(0, 800), null);
  assert.equal(sectionBoundaryDelta(700, 800), null);
  assert.equal(sectionBoundaryDelta(-500, 800), null);
  assert.equal(sectionBoundaryDelta(200, 800, true), null);
  assert.equal(rearmSectionBoundary(700, 800), true);
  assert.equal(rearmSectionBoundary(-650, 800), true);
  assert.equal(rearmSectionBoundary(-100, 800), false);
  const source = read('../src/about/section-boundary-snap.js');
  const app = read('../src/main.jsx');
  assert.match(app, /installSectionBoundarySnap\(\)/);
  assert.match(source, /'about', 'about-capabilities', 'contact'/);
  assert.doesNotMatch(source, /ScrollTrigger|preventDefault|pin:/);
  assert.match(source, /window\.addEventListener\('touchstart', onTouchStart, \{ passive: true \}\)/);
  assert.match(source, /window\.removeEventListener\('touchend', onTouchEnd\)/);
  assert.match(source, /scrollDirection = Math\.sign\(y - lastScrollY\)/);
  assert.match(source, /scrollDirection\),/);
  assert.match(source, /top < 0 && direction >= 0/);
});
test('a first mobile swipe starts the complete 21-card transition, reverse is preserved', () => {
  const seq = read('../src/ProjectsSequence.jsx');
  assert.match(seq, /width <= 700 \? \.018 : TRAIN_START/);
  assert.match(seq, /const duration = width <= 700/);
  assert.match(seq, /queuedGalleryDeparture = origin\.direction/);
  assert.match(seq, /next === 'about'\) leaveForAbout\(\)/);
  assert.match(seq, /next === 'home'\) leaveForHome\(\)/);
  assert.match(seq, /animatePageTo\(pinned\.start, 1\.28,/);
  assert.match(seq, /pinSpacing: true/);
});

test('mobile About chapters use content-driven flow rather than fixed viewport positions', () => {
  const css = read('../src/AboutExperience.css');
  const about = read('../src/AboutExperience.jsx');
  const head = read('../src/HomepageHead.jsx');
  const mobile = css.split('@media (max-width: 800px) {').at(-1);
  assert.match(mobile, /\.jw-about-story-messages \{[\s\S]*?position: relative;/);
  assert.match(mobile, /display: flex;\s*flex-direction: column;/);
  assert.match(mobile, /gap: clamp\(60px, 10svh, 100px\)/);
  assert.match(mobile, /\.jw-about-message\[data-story\] \{ top: auto !important; \}/);
  assert.doesNotMatch(mobile, /\.jw-about-message\[data-story="[1-4]"\] \{ top:/);
  assert.match(about, /lastChapter\.getBoundingClientRect\(\)\.bottom - top/);
  assert.match(about, /section\.style\.minHeight =/);
  assert.equal((about.match(/<article[^>]*data-story="/g) || []).length, 4);
  // The mobile layout does not instantiate a second portrait/3D story.
  assert.match(head, /window\.innerWidth > 800[\s\S]*?installFloatingStory/);
  assert.doesNotMatch(about, /<HomepageHead|head-interactive\.glb/);
});

test('mobile tool selection can toggle off after touch focus without losing keyboard preview', () => {
  const source = read('../src/ChoiceOfTools.jsx');
  assert.match(source, /onClick=\{\(\) => setPicked\(previous => previous === tool\.id \? null : tool\.id\)\}/);
  assert.match(source, /event\.currentTarget\.matches\(':focus-visible'\)/);
  assert.match(source, /setHovered\(tool\.id\)/);
  assert.match(source, /onPointerEnter=\{event => onEnter\(event, tool\.id\)\}/);
});
