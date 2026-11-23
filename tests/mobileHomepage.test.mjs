import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rollingGlyphs } from '../src/rollingTitleGlyphs.js';
import { galleryHeadPlacement, galleryCameraProgress, CAMERA_DESCENT, spiralGalleryPose } from '../src/SpiralGalleryMotion.js';
import { sectionBoundaryDelta, rearmSectionBoundary } from '../src/about/section-boundary-snap.js';
import { sharedGlowReveal } from '../src/visual-continuity-motion.js';
import { isMobileHeadTap, centeredToolScrollLeft } from '../src/about/mobile-interactions.js';
import { mobileStoryExclusion } from '../src/about/mobile-story-flow.js';
import {centeredHeadWordParts, headWordEdgeDistance, headPartingSlots} from '../src/about/head-word-split.js';

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
  assert.match(seq, /const duration = homeGalleryTransitionDuration\(/);
  assert.match(seq, /markGallerySettled, 'sine\.inOut'/);
  assert.match(seq, /const returnViewports = Math\.abs\(window\.scrollY - pinned\.start\)/);
  assert.match(seq, /queuedGalleryDeparture = origin\.direction/);
  assert.match(seq, /next === 'about'\) leaveForAbout\(\)/);
  assert.match(seq, /next === 'home'\) leaveForHome\(\)/);
  assert.match(seq, /animatePageTo\(pinned\.start, duration,/);
  assert.match(seq, /returnViewports, width <= 700/);
  assert.match(seq, /pinSpacing: true/);
});

test('mobile About chapters use content-driven flow rather than fixed viewport positions', () => {
  const css = read('../src/AboutExperience.css');
  const about = read('../src/AboutExperience.jsx');
  const head = read('../src/HomepageHead.jsx');
  const mobile = css.split('@media (max-width: 800px) {').at(-1);
  assert.match(mobile, /\.jw-about-story-messages \{[\s\S]*?position: relative;/);
  assert.match(mobile, /display: flex;\s*flex-direction: column;/);
  assert.match(mobile, /gap: clamp\(48px, 7svh, 80px\)/);
  assert.match(mobile, /padding: max\(0px, calc\(100svh - 110px\)\) clamp\(46px, 12vw, 62px\) 0;/);
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
  assert.match(page, /entry\.target\.classList\.add\('is-in-view'\)/);
  assert.match(page, /chapterVisibility\.unobserve\(entry\.target\)/);
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



test('mobile About preserves original paragraphs while rendering two measured nonoverlapping line runs',()=>{
 const css=read('../src/AboutExperience.css');
 const source=read('../src/about/bilateral-story-flow.js');
 const entry=read('../src/about/mobile-story-flow.js');
 const about=read('../src/AboutExperience.jsx');
 assert.match(css,/\.jw-about-message\.jw-about-bilateral-active > p \{/);
 assert.match(css,/\.jw-about-bilateral-layer \{/);
 assert.match(css,/\.jw-about-message \.jw-hover-word\.jw-about-bilateral-word \{/);
 assert.match(css,/overflow-wrap: normal;/);
 assert.match(css,/word-break: normal;/);
 assert.match(source,/export function layoutBilateralStory/);
 assert.match(source,/return \{placements,rows,height:Math\.ceil\(y\),bilateralRows,splitWords\}/);
 assert.match(source,/layer\.setAttribute\('aria-hidden','true'\)/);
 assert.match(source,/article\.appendChild\(layer\)/);
 assert.match(source,/article\.classList\.add\('jw-about-bilateral-active'\)/);
 assert.match(entry,/export \{installMobileStoryFlow\} from '\.\/bilateral-story-flow\.js'/);
 assert.match(about,/installMobileStoryFlow\(section\)/);
});
test('an ellipse follows the same projected head in either text direction', () => {
  const article = { left: 24, right: 366, top: 200, bottom: 650 };
  const head = { left: 150, right: 238, top: 320, bottom: 530 };
  for (const side of ['left','right']) {
    const shape = mobileStoryExclusion(article,head,side);
    assert.equal(shape.side,side);
    assert.ok(shape.width > 0 && shape.width <= 342);
    const anchor = side==='right' ? article.right-shape.width : article.left;
    assert.equal(anchor+shape.cx,194);
    assert.equal(shape.cy,225);
    assert.ok(shape.rx > 44 && shape.ry > 105);
  }
  assert.equal(mobileStoryExclusion(article,
    {left:401,right:500,top:320,bottom:530},'left'),null);
  assert.equal(mobileStoryExclusion(article,null,'left'),null);
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
  assert.match(source, /uniform float uMobileDOM;/);
  assert.match(source, /if \(uMobileDOM > 0\.5\) \{/);
  assert.match(source, /min\(refractedBase, vec3\(\.30\)\)/);
  assert.match(source, /glassAlpha = max\(refractedInk \* \.76, lightAlpha \* \.72\)/);
  assert.match(source, /uniforms\.uMobileDOM\.value = window\.innerWidth <= 800 \? 1 : 0/);
  assert.match(source, /if \(!rendered\)\s+for \(const line of headlineLines\) line\.style\.visibility = ''/);
  assert.match(source, /if \(!keepMobileHeadline\)\s+for\(const line of headlineLines\)line\.style\.visibility='hidden'/);
  assert.match(source, /if \(!keepMobileHeadline\) renderer\.render\(headlineScene,overlayCamera\)/);
  // The original wave remains; its separate mobile DOM copy is not wiped
  // by an unrelated headline animationend or a conflicting transform.
  assert.match(about, /--jw-about-wave-delay/);
  assert.match(about, /\.jw-about-message \.jw-hover-word'/);
  assert.match(about, /impactCleanup = window\.setTimeout\(clearImpact, 1550\)/);
  assert.match(css, /@keyframes jw-about-mobile-ink-impact/);
  assert.match(css, /translate: 4px -4px/);
  assert.match(css, /\.jw-about-message \.jw-hover-word \{[\s\S]*?transform: none;/);
  assert.match(css, /0%, 100% \{ filter: none; translate: 0 0; scale: 1; \}/);
});



test('bilateral geometry updates use one head projection and do not reposition original text',()=>{
 const source=read('../src/about/bilateral-story-flow.js');
 const about=read('../src/AboutExperience.jsx');
 assert.match(source,/const laid=layoutBilateralStory\(e\.paragraphs/);
 assert.match(source,/section\.addEventListener\('jw-about-head-envelope',onHead\)/);
 assert.match(source,/window\.addEventListener\('scroll',schedule,\{passive:true\}\)/);
 assert.match(source,/e\.article\.style\.minHeight=required\+'px'/);
 assert.match(source,/window\.innerWidth<=800/);
 assert.match(source,/e\.layer\.remove\(\)/);
 assert.doesNotMatch(source,/preventDefault|word\.style\.transform/);
 assert.match(about,/disposeMobileStory\(\)/);
});
test('mobile Tools crossing has a single native scroll owner and never bounces between controllers', () => {
  const toolsSnap = read('../src/about/tools-soft-snap.js');
  const boundaries = read('../src/about/section-boundary-snap.js');
  const about = read('../src/AboutExperience.jsx');
  assert.match(about, /installToolsSoftSnap\(section, toolsPanel\)/);
  assert.match(toolsSnap, /if \(window\.matchMedia\('\(max-width: 800px\)'\)\.matches\) return \(\) => \{\};/);
  assert.match(boundaries, /mobile \? \['about'\] :\s*\['about', 'about-capabilities', 'contact'\]/);
  // Desktop remains unchanged, including its native reverse/forward snap.
  assert.match(toolsSnap, /window\.addEventListener\('scroll', onScroll, \{ passive: true \}\)/);
  assert.match(boundaries, /window\.addEventListener\('scroll', onScroll, \{ passive: true \}\)/);
  assert.match(boundaries, /sectionBoundaryDelta\(/);
});

test('paper GPU redraws stop in About and Tools but preserve Home/Projects and reversibility', async () => {
  const { needsPaperFrame } = await import('../src/about/paper-frame-visibility.js');
  assert.equal(needsPaperFrame(0, 0, false, false), true, 'Home ring plays');
  assert.equal(needsPaperFrame(.7, 0, true, true), true, 'Home train runs');
  assert.equal(needsPaperFrame(1, .5, true, true), true, 'gallery papers depart');
  assert.equal(needsPaperFrame(1, 1, false, true), true, 'clear departure once');
  assert.equal(needsPaperFrame(1, 1, false, false), false, 'Tools does not redraw papers');
  assert.equal(needsPaperFrame(1, 1, false, false), false, 'Contact does not redraw papers');
  assert.equal(needsPaperFrame(1, .8, false, false), true, 'reverse entrance redraws');
  assert.equal(needsPaperFrame(.5, 1, false, false), true, 'reverse Home redraws');
  const sequence = read('../src/ProjectsSequence.jsx');
  assert.match(sequence, /if \(needsPaperFrame\(p, handoff, isShown, showing\)\)/);
  assert.match(sequence, /gpuPaperRef\.current\?\.draw\(p\)/);
  const head = read('../src/HomepageHead.jsx');
  assert.match(head, /lastStoryChapter\.getBoundingClientRect\(\)\.bottom > -80/);
  assert.match(head, /const motion = controller\.update\(dt\)/);
});

test('Upgrade 3 centers mobile About copy between matching safe gutters, away from vertical ABOUT', () => {
  const css = read('../src/AboutExperience.css');
  const mobile = css.split('@media (max-width: 800px) {').at(-1);
  assert.match(css, /#root \.about\.jw-about-experience > \.jw-about-heading/);
  assert.match(mobile, /\.jw-about-story-messages \{[\s\S]*?padding: max\(0px, calc\(100svh - 110px\)\) clamp\(46px, 12vw, 62px\) 0;/);
  assert.match(mobile, /\.jw-about-message, \.jw-about-message\.story-left, \.jw-about-message\.story-right \{[\s\S]*?width: 100%;[\s\S]*?margin-inline: auto;/);
  for (const width of [320, 375, 390, 430, 700, 800]) {
    const gutter = Math.max(46, Math.min(width * .12, 62));
    assert.ok(gutter >= 46, 'the text must clear the sticky vertical ABOUT letters');
    assert.ok(width - 2 * gutter >= 220, 'readable mobile paragraph width remains');
    assert.equal((width - 2 * gutter) / 2 + gutter, width / 2,
      'left and right insets must remain equal');
  }
  // Keep the approved 3D-head text flow and all original story blocks.
  const about = read('../src/AboutExperience.jsx');
  assert.equal((about.match(/<article[^>]*data-story="/g) || []).length, 4);
  assert.match(about, /installMobileStoryFlow\(section\)/);
  assert.match(mobile, /\.jw-about-bilateral-layer \{/);
});

test('one moving glow is visible throughout the post-Home site without section seams', () => {
  assert.equal(sharedGlowReveal(1000,800),0,'the homepage remains white');
  assert.equal(sharedGlowReveal(720,800),0,'before Work enters, no glow');
  assert.equal(sharedGlowReveal(120,800),1,'Work has full purple glow');
  assert.equal(sharedGlowReveal(-350,800),1,'About and Contact share the glow');
  assert.equal(sharedGlowReveal(NaN,800),0);
  assert.equal(sharedGlowReveal(0,0),0);
  let last=0;
  for(let top=720;top>=120;top-=30){
    const now=sharedGlowReveal(top,800);
    assert.ok(now>=last && now<=1,'glow appears smoothly, not in steps');
    last=now;
  }
  const component=read('../src/VisualContinuity.jsx');
  const css=read('../src/visual-continuity.css');
  const about=read('../src/AboutExperience.css');
  assert.match(component,/targetVisibility=sharedGlowReveal\(workTop,height\)/);
  assert.match(component,/\['#work',64,59\]/);
  assert.match(component,/\['#about',37,47\]/);
  assert.match(component,/\['#contact',64,55\]/);
  assert.match(component,/\['footer',48,46\]/);
  assert.equal((component.match(/className="site-light-field"/g)||[]).length,1);
  assert.match(css,/\.site-light-field \{[\s\S]*?position:fixed/);
  assert.match(css,/#root main \{ position:relative;z-index:1;background:transparent; \}/);
  assert.match(css,/#root footer \{[\s\S]*?background:transparent;/);
  assert.match(css,/#root \.contact-section \{ background:transparent; \}/);
  assert.match(about,/background: transparent;/);
  assert.doesNotMatch(about,/background-attachment: fixed/);
  assert.doesNotMatch(css,/filter:blur\(26px\)/);
  assert.match(component,/mq\.matches\?0:time\/1000/);
});

test('split fragments preserve every original letter, punctuation and word order', () => {
  for (const token of ['fortunate','experienced.','intangible','imaginations,',
    'function','beautiful','“subjective.”','Photoshop,','development,']) {
    const halves=centeredHeadWordParts(token);
    assert.ok(halves);
    assert.equal(halves.join(''),token);
    assert.ok(halves[0].length && halves[1].length);
  }
  for (const token of ['a','to','head','life!','3D','I']) {
    assert.equal(centeredHeadWordParts(token),null);
  }
  assert.equal(centeredHeadWordParts(null),null);
  const render=read('../src/WordHighlight.jsx');
  const about=read('../src/AboutExperience.jsx');
  assert.match(render,/headSplit = false/);
  assert.match(render,/centeredHeadWordParts\(part\)/);
  assert.match(render,/jw-head-splittable/);
  assert.match(render,/jw-head-word-first/);
  assert.match(render,/jw-head-word-last/);
  assert.match(about,/<WordHighlight headSplit>Well, it's the creation/);
  assert.match(about,/<WordHighlight>Design is life!<\/WordHighlight>/,
    'the original Home/About intro is still intact');
});

test('word halves land on opposite sides of the projected head at the same line height',()=>{
  const article={left:46,right:344,top:200,bottom:640};
  const head={left:157,right:233,top:290,bottom:490};
  const center=headPartingSlots(article,head,390,34,43);
  assert.ok(center,'middle-height word has two safe outside positions');
  assert.ok(center.leftX+34 < head.left,
    'first half must be entirely to the LEFT of the silhouette');
  assert.ok(center.rightX > head.right,
    'second half must start to the RIGHT of the silhouette');
  assert.ok(center.rightX-center.leftX>90,
    'the travel must be across the head, not a tiny letter gap');
  assert.ok(center.leftX >= article.left);
  assert.ok(center.rightX+43 <= article.right);
  const shoulder=headPartingSlots(article,head,306,34,43);
  assert.ok(shoulder,'curved head shoulder remains available');
  assert.ok(shoulder.opening<center.opening,
    'word halves follow the actual narrowing head outline by height');
  assert.equal(headPartingSlots(article,head,390,100,130),null,
    'if both halves cannot fit, keep the original word intact');
  assert.equal(headPartingSlots(article,head,100,34,43),null);
  assert.equal(headPartingSlots(article,null,390,34,43),null);
});

test('measured two-sided rows allocate left and right words without overlap',async()=>{
 const {layoutBilateralStory}=await import('../src/about/bilateral-story-flow.js');
 const make=(w,a=0,b=0)=>({text:'word',width:w,
   firstWidth:a,lastWidth:b,spaceWidth:5});
 const head={left:110,right:190,top:-10,bottom:130};
 const result=layoutBilateralStory([[
   make(50),make(70,30,40),make(30),make(42),
   make(40),make(45),make(25)]],300,head,32,17,10);
 assert.ok(result.bilateralRows>0);
 assert.ok(result.splitWords>=1,'a crossing word divides across head');
 const all=result.placements;
 const from=new Map();
 for(const row of result.rows){
   const line=all.slice(row.start,row.end).sort((a,b)=>a.x-b.x);
   for(let i=1;i<line.length;i++){
     assert.ok(line[i-1].x+line[i-1].width<=line[i].x+.1,
       'all fragments and words must occupy nonoverlapping rectangles');
   }
   for(const place of line){
     assert.ok(place.x>=0&&place.x+place.width<=300+.1);
   }
 }
 const divided=all.filter(p=>p.part!=='whole');
 assert.ok(divided.length>=2);
 assert.equal(divided[0].token,divided[1].token);
 assert.ok(divided[0].x<divided[1].x);
});
test('bilateral text cannot hijack scrolling, alter desktop or leave clone layers behind',()=>{
 const source=read('../src/about/bilateral-story-flow.js');
 const about=read('../src/AboutExperience.jsx');
 assert.match(source,/window\.innerWidth<=800&&!reduced\.matches/);
 assert.match(source,/window\.addEventListener\('scroll',schedule,\{passive:true\}\)/);
 assert.match(source,/if\(raf\)cancelAnimationFrame\(raf\)/);
 assert.match(source,/layer\.setAttribute\('aria-hidden','true'\)/);
 assert.match(source,/e\.layer\.remove\(\)/);
 assert.doesNotMatch(source,/window\.scrollTo\(|preventDefault|ScrollTrigger\.refresh/);
 assert.match(about,/<WordHighlight headSplit>Photoshop, Illustrator, Procreate/);
});
test('two-sided copy preserves all words in order, restores full-width rows and never stacks over the head',async()=>{
 const {layoutBilateralStory}=await import('../src/about/bilateral-story-flow.js');
 const tokens=['Well,',"it's",'the','creation','of','the',"mind's",'eye,']
  .map((t,i)=>({text:t,width:20+t.length*5,firstWidth:17,
     lastWidth:25,spaceWidth:5}));
 const layout=layoutBilateralStory([tokens],300,
   {left:110,right:190,top:40,bottom:160},31,17,10);
 const first=layout.rows[0].lanes;
 assert.equal(first.length,1,'full-width lines precede the face');
 assert.ok(layout.rows.some(r=>r.lanes.length===2),
   'left/right line runs are visible simultaneously');
 const seen=new Set();
 for(const p of layout.placements)seen.add(p.token);
 assert.deepEqual([...seen].map(t=>t.text),tokens.map(t=>t.text),
   'source word order is preserved without duplication');
 const source=read('../src/about/bilateral-story-flow.js');
 const css=read('../src/AboutExperience.css');
 assert.match(source,/const lanes=lanesAt\(y\+lineHeight\/2\)/);
 assert.match(css,/\.jw-about-message \.jw-hover-word\.jw-about-bilateral-word \{/);
 assert.doesNotMatch(css,/\.jw-head-splittable\.is-head-splitting \{\s*position: relative;\s*display: block;/);
});

test('bilateral glyphs override original inline word styles without resurrecting white cards',()=>{
 const source=read('../src/about/bilateral-story-flow.js');
 const css=read('../src/AboutExperience.css');
 assert.match(source,/article\.classList\.add\('jw-about-flow-active'\)/);
 assert.match(source,/article\.classList\.remove\('jw-about-bilateral-active','jw-about-flow-active'\)/);
 assert.match(source,/e\.article\.classList\.remove\('jw-about-bilateral-active','jw-about-flow-active'\)/);
 const block=css.match(/#root \.about\.jw-about-experience \.jw-about-message \.jw-hover-word\.jw-about-bilateral-word \{([^}]+)\}/)?.[1];
 assert.ok(block,'measured ink must override the standard WordHighlight CSS');
 assert.match(block,/position: absolute;/);
 assert.match(block,/display: inline-block;/);
 assert.match(block,/transform: translate3d\(0,0,0\);/);
 assert.match(css,/\.jw-about-message\.jw-about-flow-active \{[\s\S]*?background: transparent;/);
});

test('newly split word fragments never animate across neighboring words',()=>{
 const code=read('../src/about/bilateral-story-flow.js');
 const css=read('../src/AboutExperience.css');
 assert.match(code,/const entering=node\.style\.opacity!=='1'/);
 assert.match(code,/Math\.abs\(x-previousX\)>26\?'0ms':'.18s'/);
 assert.match(code,/else node\.style\.transitionDuration='0ms'/);
 const visual=css.match(/#root \.about\.jw-about-experience \.jw-about-message \.jw-hover-word\.jw-about-bilateral-word \{([^}]+)\}/)?.[1];
 assert.ok(visual);
 assert.doesNotMatch(visual,/transition:[^;]*opacity/);
});
