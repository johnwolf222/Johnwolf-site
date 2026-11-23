import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rollingGlyphs } from '../src/rollingTitleGlyphs.js';
import { galleryHeadPlacement, galleryCameraProgress, CAMERA_DESCENT, spiralGalleryPose } from '../src/SpiralGalleryMotion.js';
import { sectionBoundaryDelta, rearmSectionBoundary } from '../src/about/section-boundary-snap.js';
import { isMobileHeadTap, centeredToolScrollLeft } from '../src/about/mobile-interactions.js';
import {
  mobileStoryCorridorWidth, mobileStoryLineX,
} from '../src/about/mobile-story-flow.js';

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
  assert.match(source, /setPicked\(previous => previous === id \? null : id\)/);
  assert.match(source, /onClick=\{event => onPick\(event, tool\.id\)\}/);
  assert.match(source, /event\.currentTarget\.matches\(':focus-visible'\)/);
  assert.match(source, /setHovered\(tool\.id\)/);
  assert.match(source, /onPointerEnter=\{event => onEnter\(event, tool\.id\)\}/);
});

test('mobile head reacts to a deliberate tap and follows touch without blocking scrolling', () => {
  assert.equal(isMobileHeadTap(100, 100, 110, 104), true);
  assert.equal(isMobileHeadTap(100, 100, 100, 116), true);
  assert.equal(isMobileHeadTap(100, 100, 100, 117), false);
  assert.equal(isMobileHeadTap(100, 100, 100, 250), false);
  assert.equal(isMobileHeadTap(NaN, 100, 100, 100), false);
  const source = read('../src/HomepageHead.jsx');
  assert.match(source, /let headTouch = null;/);
  assert.match(source, /headTouch\.id !== event\.pointerId/);
  assert.match(source, /window\.innerWidth > 800 \|\| !aboutIsVisible\(\)/);
  assert.match(source, /isMobileHeadTap\(initial\.x, initial\.y,/);
  assert.match(source, /reactToHeadContact\(initial\.contact\)/);
  assert.match(source, /window\.addEventListener\('pointerup', onPointerUp\)/);
  assert.match(source, /window\.addEventListener\('pointercancel', onPointerUp\)/);
  assert.match(source, /window\.removeEventListener\('pointercancel', onPointerUp\)/);
  const touchHandlers = source.slice(
    source.indexOf('const onPointerMove = event =>'),
    source.indexOf('const stop = () =>'));
  assert.doesNotMatch(touchHandlers, /event\.preventDefault\(\)/,
    'touch movement must not hijack vertical page scrolling');
});

test('mobile About story reveals each chapter and a tapped word highlights independently', () => {
  const page = read('../src/AboutExperience.jsx');
  const css = read('../src/AboutExperience.css');
  const ink = read('../src/WordHighlight.css');
  assert.match(page, /const chapterVisibility = new IntersectionObserver/);
  assert.match(page, /'is-in-view', entry\.isIntersecting/);
  assert.match(page, /section\.classList\.add\('jw-about-mobile-reveal-ready'\)/);
  assert.match(page, /window\.addEventListener\('scroll', clearTouchedWord, \{ passive: true \}\)/);
  assert.match(page, /section\.addEventListener\('pointerdown', onWordTouch, \{ passive: true \}\)/);
  assert.match(page, /chapterVisibility\.disconnect\(\)/);
  assert.match(css, /\.jw-about-mobile-reveal-ready \.jw-about-message\.is-in-view/);
  assert.match(css, /\.jw-about-mobile-reveal-ready \.jw-about-message \{\s*opacity: 1 !important/);
  assert.match(ink, /\.jw-hover-word\.is-touched/);
  assert.match(css, /data-tools-in-view="true"\] \.jw-about-color-switch/);
  assert.doesNotMatch(page, /<canvas|<HomepageHead/);
});

test('mobile tool chooser centers selected icons without moving the page or losing its native swipe row', () => {
  assert.equal(centeredToolScrollLeft(350, 62, 390, 800), 186);
  assert.equal(centeredToolScrollLeft(15, 62, 390, 800), 0);
  assert.equal(centeredToolScrollLeft(700, 62, 390, 400), 400);
  assert.equal(centeredToolScrollLeft(NaN, 62, 390, 400), 0);
  const tool = read('../src/ChoiceOfTools.jsx');
  const css = read('../src/ChoiceOfTools.css');
  assert.match(tool, /const rowRef = useRef\(null\)/);
  assert.match(tool, /centeredToolScrollLeft\(/);
  assert.match(tool, /row\.scrollTo\(\{/);
  assert.match(tool, /aria-pressed=\{tool\.id === picked\}/);
  assert.match(css, /overflow-x: auto;/);
  assert.match(css, /-webkit-overflow-scrolling: touch;/);
});

test('capability rows preserve reversible scroll motion while avoiding offscreen repaints', () => {
  const source = read('../src/AboutCapabilities.jsx');
  assert.match(source, /const segmentWidths = \[\]/);
  assert.match(source, /if \(rect\.bottom <= 0 \|\| rect\.top >= window\.innerHeight\) return/);
  assert.match(source, /new ResizeObserver\(measureSegments\)/);
  assert.match(source, /segmentWidths\[index\]/);
  assert.match(source, /requestAnimationFrame\(positionRows\)/);
  assert.match(source, /window\.addEventListener\('scroll', schedule, \{ passive: true \}\)/);
});

test('the persistent 3D head follows finger coordinates from any section without hijacking touch scroll', () => {
  const source = read('../src/HomepageHead.jsx');
  assert.match(source, /let activeTouchId = null;/);
  assert.match(source, /const followScreenPoint = \(clientX, clientY\) =>/);
  assert.match(source, /const onTouchStart = event =>/);
  assert.match(source, /const onTouchMove = event =>/);
  assert.match(source, /candidate\.identifier === activeTouchId/);
  assert.match(source, /followScreenPoint\(touch\.clientX, touch\.clientY\)/);
  assert.match(source, /window\.addEventListener\('touchmove', onTouchMove, \{ passive: true \}\)/);
  assert.match(source, /window\.addEventListener\('touchstart', onTouchStart, \{ passive: true \}\)/);
  assert.match(source, /window\.removeEventListener\('touchmove', onTouchMove\)/);
  assert.match(source, /activeTouchId = null;/);
  const touchScope = source.slice(source.indexOf('const followScreenPoint'),
    source.indexOf('const getContact'));
  assert.doesNotMatch(touchScope, /preventDefault|stopPropagation|setPointerCapture/);
  assert.match(source, /event\.target\.closest\?\.\(/,
    'head tap reaction still excludes buttons and story words');
  assert.match(source, /isMobileHeadTap\(initial\.x, initial\.y,/);
});

test('mobile About text lines bend around the actual projected face without clipping', () => {
  const bounds = { left: 120, right: 270, top: 300, bottom: 520 };
  assert.equal(mobileStoryCorridorWidth(bounds, 390), 92);
  assert.equal(mobileStoryCorridorWidth(null, 390), 0);
  assert.equal(mobileStoryCorridorWidth(bounds, 0), 0);
  for (const y of [120, 250, 300, 350, 410, 480, 520, 570, 700]) {
    const width = mobileStoryCorridorWidth(bounds, 390);
    const left = mobileStoryLineX('left', width, y, bounds, 390);
    const right = mobileStoryLineX('right', width, y, bounds, 390);
    assert.ok(left >= 0 && left + width <= 390,
      'left story line stays visible on the phone');
    assert.ok(right >= 0 && right + width <= 390,
      'right story line stays visible on the phone');
    assert.ok(left + width <= right,
      'two paths keep the central face corridor free');
  }
  const w = mobileStoryCorridorWidth(bounds, 390);
  const centerLeft = mobileStoryLineX('left', w, 410, bounds, 390);
  const centerRight = mobileStoryLineX('right', w, 410, bounds, 390);
  assert.ok(centerLeft + w < bounds.left,
    'left ink detours before the projected head');
  assert.ok(centerRight > bounds.right,
    'right ink detours past the projected head');
  assert.ok(mobileStoryLineX('left', w, 240, bounds, 390) >
    centerLeft, 'moving into the head zone visibly bends lines left');
  assert.equal(mobileStoryLineX('left', w, 410, bounds, 390),
    centerLeft, 'identical scrolling restores the identical text pose');
});

test('mobile story preserves original accessible copy and dynamically avoids the face silhouette', () => {
  const module = read('../src/about/mobile-story-flow.js');
  const headSource = read('../src/HomepageHead.jsx');
  const about = read('../src/AboutExperience.jsx');
  const css = read('../src/AboutExperience.css');
  assert.match(module, /paragraph\.querySelectorAll\('\.jw-hover-word'\)/);
  assert.match(module, /layer\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(module, /node\.className = 'jw-about-flow-line'/);
  assert.match(module, /position\(\)/);
  assert.doesNotMatch(module, /preventDefault|window\.scrollTo\(/);
  assert.match(module, /window\.addEventListener\('scroll', schedule, \{ passive: true \}\)/);
  assert.match(headSource, /geometry\.updateWorldMatrix\(true, true\)/);
  assert.match(headSource, /'jw-about-head-envelope'/);
  assert.match(headSource, /aboutProjectionFrames % 4 === 0/);
  assert.match(about, /installMobileStoryFlow\(section\)/);
  assert.match(about, /disposeMobileStory\(\)/);
  assert.match(css, /\.jw-about-message\.jw-about-flow-active \{/);
  assert.match(css, /\.jw-about-flow-line \{/);
  assert.match(css, /\.jw-about-flow-active > p \{/);
  assert.match(css, /background: transparent;/);
});

test('head tap optical shader preserves dark About ink rather than painting white fog', () => {
  const source = read('../src/about/optical-ripple.js');
  const about = read('../src/AboutExperience.jsx');
  const css = read('../src/AboutExperience.css');
  // A white offscreen WebGL source is NOT an opaque replacement image.
  assert.match(source, /float glassAlpha = max\(textCoverage \* \.96, lightAlpha\)/);
  assert.match(source, /float alpha = disc \* \(1\.0 - headCoverage\) \* glassAlpha;/);
  assert.doesNotMatch(source, /float alpha = disc \* \(1\.0 - headCoverage\) \* \(0\.98/);
  assert.match(source, /float lightAlpha = min\(\.58, opticalLight \* \.32\)/);
  assert.match(source, /float headCoverage = texture2D\(uHeadMask, vUv\)\.a/);
  assert.match(source, /const keepMobileHeadline = window\.innerWidth <= 800/);
  assert.match(source, /if \(!keepMobileHeadline\)\s+for\(const line of headlineLines\)line\.style\.visibility='hidden'/);
  assert.match(source, /if \(!keepMobileHeadline\) renderer\.render\(headlineScene,overlayCamera\)/);
  // The original wave remains; its separate mobile DOM copy is not wiped
  // by an unrelated headline animationend or a conflicting transform.
  assert.match(about, /--jw-about-wave-delay/);
  assert.match(about, /impactCleanup = window\.setTimeout\(clearImpact, 1550\)/);
  assert.match(css, /@keyframes jw-about-mobile-ink-impact/);
  assert.match(css, /translate: 4px -4px/);
  assert.match(css, /\.jw-about-flow-line \{[\s\S]*?transform: translate3d\(0, 0, 0\)/);
  assert.match(css, /0%, 100% \{ filter: none; translate: 0 0; scale: 1; \}/);
});
