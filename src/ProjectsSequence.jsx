import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './ProjectsSequence.css';
import LivePaperRenderer from './LivePaperRenderer.jsx';
import CaseStudyReader from './CaseStudyReader.jsx';
import { createHomePaperMotion } from './HomePaperMotion.js';
import {
  aboutHandoffProgress, departingCardOffset, aboutHeadPose,
  aboutIntroPose, aboutHeadOpacity, aboutHeadingReveal,
  aboutToolsHeadBlend, aboutToolsHeadOffset,
} from './AboutHandoffMotion.js';
import { spiralGalleryPose, galleryHeadPlacement, galleryRowOffset, GALLERY_FOCAL, TRAIN_START, TRAIN_END } from './SpiralGalleryMotion.js';
import {
  wrapGalleryFocus, wrappedGalleryDistance, nearestGalleryIndex,
  stepGalleryFocus, dragGalleryFocus, gallerySeamOpacity,
  galleryRestScrollY, shouldAutoLand,
  initialGalleryWheelState, galleryWheelGesture,
  initialGalleryVerticalState, galleryVerticalExitGesture,
  gallerySnapDuration, gallerySwipeDirection,
} from './GalleryLoopMotion.js';

gsap.registerPlugin(ScrollTrigger);

// Seven approved featured projects, in their established sequence.
export const PROJECTS = [
  { image: 9, name: 'Riches Cosmetics', description: 'Cosmetics branding and visual identity.' },
  { image: 7, name: 'Chick Muy Caliente', description: 'Branding and promotional design.' },
  { image: 5, name: 'Better Mate', description: 'An expressive identity for Better Mate.' },
  { image: 11, name: 'Brewty', description: 'Coffee branding and visual identity.' },
  { image: 2, name: 'Nurusa', description: 'Healthy food service branding.' },
  { image: 1, name: 'Inkzilla', description: 'Tattoo shop identity and visual design.' },
  { image: 10, name: 'One on One', description: 'Identity and creative presentation.' },
];
const CARD_COUNT = 21;
const CARD_IDS = Array.from({ length: CARD_COUNT }, (_, i) => i + 1);
// Left-to-right placement in the gallery as viewed from its first focus.
const ENTRY_ORDER = [4, 5, 6, 0, 1, 2, 3];
const fileFor = id => id === 9 ? '/brands/riches-approved-vertical.png' : '/new-homepage/approved-cards/' +
  String(id).padStart(2, '0') + (id > 13 ? '.avif' : '.webp');
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const smooth = (n, a, b) => {
  const t = clamp((n - a) / Math.max(b - a, 0.00001));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
// Section 2 is ONE stationary gallery viewport, not seven scroll steps.
const docTop = node => window.scrollY + node.getBoundingClientRect().top;

/**
 * ONE reversible GSAP scroll choreography:
 * (1) Existing Home artworks rewind into the same GLB head.
 * (2) ALL 21 sheets circle clockwise and leave through the SAME bottom
 *     tangent, one after another, with constant arc-length separation.
 * (3) The camera descends while the entire procession travels LEFT.
 * (4) Only after ALL sheets clear the screen do seven featured artworks
 *     turn around offscreen and slide back in as the gallery row.
 * The remaining 14 stay opaque and continue offscreen, never fading out.
 * No visible selection, intermediate stop, or image replacement.
 *
 * The SAME 21 controllable sheets render on Home and Projects.
 * No MP4, crossfade, or substitution of artwork during the transition.
 */
export default function ProjectsSequence() {
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const cardRefs = useRef([]);
  const gpuPaperRef = useRef(null);
  const copyRef = useRef(null);
  const galleryControlsRef = useRef(null);
  const gestureRef = useRef(null);
  // Accumulate even subpixel trackpad deltas, and recognize each new
  // horizontal impulse independently of the previous momentum tail.
  const wheelGestureRef = useRef(initialGalleryWheelState());
  const verticalGestureRef = useRef(initialGalleryVerticalState());
  const activeRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [openedProject, setOpenedProject] = useState(null);
  const hoveredRef = useRef(-1);

  useEffect(() => {
    const home = document.querySelector('#home');
    const section = sectionRef.current;
    const stage = stageRef.current;
    const head = document.querySelector('.jw-continuous-head');
    const title = document.querySelector('.jw-new-home__rolling-title');
    const ink = document.querySelector('.jw-title-head-ink');
    const subtitle = document.querySelector('.jw-new-home__subtitle-clip');
    const indicators = document.querySelector('.jw-new-home__indicators');
    const bottom = document.querySelector('.jw-new-home__bottom-bar');
    const copy = copyRef.current;
    const aboutSection = document.querySelector('#about');
    const toolsPanel = aboutSection?.querySelector('#about-tools');
    const capabilitiesPanel = aboutSection?.querySelector('#about-capabilities');
    if (!home || !section || !stage || !head) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let sectionTop = 0;
    let sectionHeight = 0;
    let aboutTop = Infinity;
    let aboutBottom = Infinity;
    let toolsTop = Infinity;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let homeMotion = createHomePaperMotion(width, height);
    let active = -1;
    let showing = false;
    let disposed = false;
    const travel = { progress: 0 };
    // The live Home current has an actual clock. Scrolling freezes it, so
    // each sheet rewinds from its exact visible state along its own path.
    let homeClock = 3.45;
    let capturedClock = null;
    let lastAnimationFrame = 0;
    // The scroll choreography owns the landing. Once the gallery is ready,
    // one swipe/arrow press advances exactly ONE of the seven real sheets.
    // The index wraps forever, but movement stops after each smooth settle.
    let loopEnabled = false;
    let loopFocus = 0;
    // Keep the requested destination separate from the in-flight position.
    // Otherwise rapid successive swipes can round to the same card and
    // appear to be ignored while the previous settle tween is running.
    let loopTarget = 0;
    let loopDragging = false;
    let dragOrigin = 0;
    let dragTarget = 0;
    let loopTween = null;
    // Native scroll controls the paper orbit until the returning train
    // enters at TRAIN_START. Then one finite scroll tween completes the
    // landing and places the visitor at the gallery's resting position.
    // The NEXT independent downward gesture enters Section 3 (About).
    let scrollTween = null;
    let snapState = 'idle'; // idle | landing | settled | leaving
    let exitReadyAt = 0;
    let previousScrollBehavior = null;
    let touchOrigin = null;
    // Preserve the original viewport-centered Home head at page entry.
    // Subsequent alignment uses only movement relative to this baseline,
    // not the artboard's absolute offset (which raised the resting head).
    // Capture one stable projected orbit pivot at Home. Never follow
    // animated face bounds or the pinned Home element while rewinding.
    let mobileOrbitPivot = null;

    function measure() {
      sectionTop = docTop(section);
      sectionHeight = section.getBoundingClientRect().height;
      const about = document.querySelector('#about');
      aboutTop = about ? docTop(about) : Infinity;
      aboutBottom = about ? aboutTop + about.getBoundingClientRect().height : Infinity;
      toolsTop = toolsPanel ? docTop(toolsPanel) : Infinity;
      const nextWidth = window.innerWidth;
      const nextHeight = window.innerHeight;
      if (width !== nextWidth || height !== nextHeight) {
        width = nextWidth;
        height = nextHeight;
        homeMotion = createHomePaperMotion(width, height);
      }
    }


    // Home uses one deterministic, reversible path per artwork. The ring,
    // release and airflow simulation is created once per viewport size;
    // scrolling seeks those SAME paths backward, without replacing cards.
    function homeAge(index, time) {
      return homeMotion.age(index, time);
    }
    function homePose(index, age) {
      return homeMotion.pose(index, age);
    }

    const scrollFocus = () => 0; // Vertical scrolling never cycles projects.
    const canInteract = () =>
      travel.progress >= TRAIN_END - .0001 &&
      window.scrollY >= sectionTop - height * .25 &&
      window.scrollY < sectionTop + sectionHeight - height * .18;

    function targetForCard(id, galleryFocus) {
      const spotlightIndex = PROJECTS.findIndex(project => project.image === id);
      if (spotlightIndex < 0) {
        return { x: -width * .6, y: height * .85, z: -550, scale: .16,
          ry: -65, opacity: 0 };
      }
      const distance = wrappedGalleryDistance(spotlightIndex, galleryFocus);
      const d = Math.abs(distance);
      const z = -d * 155;
      const projectedX = distance * Math.min(width * .218, 290);
      return {
        x: projectedX * (GALLERY_FOCAL - z) / GALLERY_FOCAL,
        // Mobile reference: gallery lives below the head/details area,
        // with the neighboring real cards peeking in from both sides.
        y: (width <= 700 ? height * .305 :
          galleryRowOffset(width, height)) + d * height * .014,
        z,
        scale: 1 / (1 + d * .18),
        ry: -Math.sign(distance) * Math.min(65, d * 23),
        opacity: Math.pow(clamp((3.55 - d) / 3.3), .7) *
          (loopEnabled ? gallerySeamOpacity(distance) : 1),
      };
    }

    // This anchor is measured inside the actual GLB renderer from each
    // visible mesh's projected 3D bounds. Do not use the artboard, canvas
    // midpoint, or prerecorded occlusion silhouette as its position.
    function mobileHeadOrbitOffset() {
      if (width > 700) return { x: 0, y: 0 };
      const x = Number.parseFloat(
        head.style.getPropertyValue('--jw-visible-head-orbit-x'));
      const y = Number.parseFloat(
        head.style.getPropertyValue('--jw-visible-head-orbit-y'));
      if (!mobileOrbitPivot && Number.isFinite(x) && Number.isFinite(y))
        mobileOrbitPivot = { x, y };
      return mobileOrbitPivot || { x: 0, y: 0 };
    }

    function positionCard(card, index, phase, galleryFocus, handoff, orbitOffset) {
      const id = index + 1;
      const target = targetForCard(id, galleryFocus);
      const spotlight = PROJECTS.findIndex(project => project.image === id);
      const rank = spotlight < 0 ? -1 : ENTRY_ORDER.indexOf(spotlight);

      // PHASE 1 · Reverse the ACTUAL moving Home cards into their shared
      // origin. A captured clock means no flicker or discontinuity at handoff.
      const initialAge = homeAge(index, capturedClock ?? homeClock);
      const rewind = smooth(phase, .012, .272);
      const flight = homePose(index, initialAge * (1 - rewind));

      // Each sheet follows a single seekable 3D trajectory. No pause at
      // the former spiral/sweep boundary and no extra landing tween.
      const motion = spiralGalleryPose(phase, index, rank,
        width, height, target);
      const started = phase >= motion.start;
      // The existing seven gallery sheets travel RIGHT together during
      // Projects → About; the remaining Home papers stay offscreen left.
      const depart = departingCardOffset(handoff, rank, width, height);
      const finalZ = started ? motion.z : flight.z;
      // The homepage ring must already be centered on the projected head
      // BEFORE scrolling begins (phase 0). Keep that same origin through the
      // rewind and orbit; release it only once the sheets exit offscreen.
      // Depth correction keeps every sheet aligned to one screen-space pivot.
      const orbitBlend = width <= 700
        ? 1 - smooth(phase, .82, .89)
        : 0;
      const depthCorrection = (GALLERY_FOCAL - finalZ) / GALLERY_FOCAL;
      const finalX = (started ? motion.x : flight.x) + depart.x +
        orbitOffset.x * orbitBlend * depthCorrection;
      const finalY = (started ? motion.y : flight.y) + depart.y +
        orbitOffset.y * orbitBlend * depthCorrection;
      const finalScale = started ? motion.scale : flight.scale;
      const rotX = started ? motion.rx : flight.rx;
      const rotY = (started ? motion.ry : flight.ry) + depart.ry;
      const rotZ = started ? motion.rz : flight.rz;
      const opacity = (started ? motion.opacity : flight.opacity) * depart.opacity;
      const front = started && motion.front;

      // Skip the duplicate DOM rasterization work while our ONE GPU surface
      // is running. The original DOM images remain a ready fallback, and are
      // re-synchronized on the next frame if WebGL is lost or unsupported.
      if (!gpuPaperRef.current?.ready) {
        card.style.zIndex = String(phase === 0 ? 1 : (front ? 12 : 10));
        card.style.transform = 'perspective(1350px) translate3d(' +
          finalX.toFixed(2) + 'px,' + finalY.toFixed(2) + 'px,' +
          finalZ.toFixed(2) + 'px) rotateY(' +
          rotY.toFixed(2) + 'deg) rotateX(' + rotX.toFixed(2) +
          'deg) rotateZ(' + rotZ.toFixed(2) +
          'deg) scale(' + finalScale.toFixed(4) + ')';
        card.style.opacity = String(opacity);
        card.style.visibility = opacity < .008 ? 'hidden' : 'visible';
      }
      // One clock controls the GPU bend and the same 3D trajectory.
      // Sheets flatten only as they approach their final gallery slot.
      const time = (capturedClock ?? homeClock) -
        smooth(phase, .01, .272) * 2.4 +
        smooth(phase, .304, .806) * 4.8 +
        smooth(phase, .806, .992) * 1.6;
      const flutter = Math.sin(time * 2.7 + index * .73) * .28 +
        Math.sin(time * 4.4 + index * 1.14) * .13;
      // Flexible in flight; flat and still once a gallery slot is reached.
      const homeCurl = flight.curl;
      const transitionCurl = Math.max(.12, .46 + flutter * .38) *
        (1 - motion.settle);
      const curl = mix(homeCurl, transitionCurl,
        smooth(phase, .012, .085));
      gpuPaperRef.current?.setPose(index, {
        x: finalX, y: finalY, z: finalZ,
        rx: rotX, ry: rotY, rz: rotZ,
        scale: finalScale, opacity,
        front, curl,
        // The hole shader must follow this sheet's own age, not the global
        // Home clock. Blend back to the existing gallery clock only after
        // the ring wrap has faded during the approved scroll transition.
        time: mix(flight.time, time, smooth(phase, .012, .085)),
        flutter: mix(flight.flutter, .75, smooth(phase, .012, .085)) *
          (1 - motion.settle),
        wrap: flight.wrap * (1 - smooth(phase, .012, .085)),
      });
      card.dataset.depth = String(finalZ);
      card.dataset.phase = handoff > .001 && rank >= 0 ? 'depart-right' :
        phase === 0 ? 'home-current' :
        phase < .272 ? 'rewind' :
          started ? motion.stage : 'behind-head';
    }

    function render() {
      if (disposed) return;
      const p = reduced.matches ? (travel.progress < .5 ? 0 : 1) :
        travel.progress;
      // Reverse-scrolling into the original 21-sheet transition returns
      // control to ScrollTrigger; it never inherits a drifting gallery.
      if (travel.progress < TRAIN_END - .001 && loopEnabled) {
        loopTween?.kill();
        loopTween = null;
        loopEnabled = false;
        loopDragging = false;
        loopTarget = 0;
      }
      if (p > .0001 && capturedClock === null) {
        capturedClock = homeClock;
      } else if (p <= .0001 && capturedClock !== null) {
        // Scrolling all the way back resumes the original clock exactly
        // where the full rewind started, with no visual jump.
        homeClock = capturedClock;
        capturedClock = null;
      }
      const scrollY = window.scrollY;
      const galleryFocus = loopEnabled && travel.progress >= TRAIN_END
        ? loopFocus : scrollFocus();
      const galleryActive = scrollY >= sectionTop - height * .25;
      // Render the actual cards until they have swept past the RIGHT edge.
      const handoff = aboutHandoffProgress(scrollY,
        sectionTop, sectionHeight, height);
      const stageOpacity = smooth(p, .09, .19) *
        (1 - smooth(handoff, .96, 1));
      const isShown = stageOpacity > .008 &&
        scrollY < sectionTop + sectionHeight - height * .01;
      const sceneOpacity = stageOpacity;
      const textFade = 1 - smooth(p, .035, .252);
      const subFade = 1 - smooth(p, .050, .250);
      const bottomFade = 1 - smooth(p, .018, .210);
      // Keep the SAME mounted Candidate F GLB, following the scroll down
      // into the About composition; fade only when Contact approaches.
      const headPlacement = aboutHeadPose(handoff,
        galleryHeadPlacement(p, height, width), width, height);
      // One mobile pose curve: centered through Home, upper-left in
      // Projects, then back to the exact same center through About.
      // The SAME progress also releases Home's pinned-artboard correction.
      // Do not add independent mobile position offsets to this curve.
      const mobileHomeToProjects = width <= 700
        ? smooth(p, .89, .99) : 0;
      const mobileProjectsToAbout = width <= 700
        ? smooth(handoff, .02, .72) : 0;
      const mobileProjectsWeight =
        mobileHomeToProjects * (1 - mobileProjectsToAbout);
      if (width <= 700) {
        headPlacement.x = -width * .285 * mobileProjectsWeight;
        headPlacement.shift = -height * .125 * mobileProjectsWeight;
        headPlacement.scale = 1 - .23 * mobileProjectsWeight;
      }
      const headOpacity = aboutHeadOpacity(scrollY, aboutBottom, height);
      // Move the existing Candidate F head from the original About center
      // toward the reference's LEFT portrait slot as tools enter view.
      const toolsBlend = aboutToolsHeadBlend(scrollY, toolsTop, height);
      const toolHeadX = aboutToolsHeadOffset(toolsBlend, width);
      const intro = reduced.matches
        ? { opacity: 1, lift: 0 }
        : aboutIntroPose(handoff, height);

      // Fade all Home lettering IN PLACE. Do not move any text off the page,
      // and do not modify the approved per-letter rolling GSAP timeline.
      if (title) title.style.opacity = String(textFade);
      if (ink) ink.style.opacity = String(textFade);
      if (subtitle) subtitle.style.opacity = String(subFade);
      if (indicators) indicators.style.opacity = String(subFade);
      if (bottom) bottom.style.opacity = String(bottomFade);
      home.style.setProperty('--jw-home-blow', '0');

      // The original About title rises into place only as the departing
      // sheets clear the right edge. Native scroll keeps its document position;
      // opacity/settle are derived from the SAME motion clock, no separate
      // CSS animation or layout reflow.
      if (aboutSection) {
        // A STRICT paint gate: do not show the vertical sticky ABOUT label
        // until the actual About section is WELL past the viewport top AND
        // Projects has fully cleared. This avoids premature overlap even
        // while the two sections are pinning, snapping or reverse-scrolling.
        const headingClearance = Math.min(height * .12, 96);
        const passedProjects = scrollY >= sectionTop + sectionHeight &&
          !isShown && aboutHeadingReveal(scrollY, aboutTop, height) >= 1;
        const actualAboutPastHeader =
          aboutSection.getBoundingClientRect().top <= -headingClearance;
        // The vertical ABOUT title belongs to the story, not the tools.
        // Hide the INSTANT any part of the tool panel enters the viewport.
        // Reading the live rectangle also handles dynamic story height and
        // reverses correctly when scrolling upward toward the chapters.
        const toolsEnteredViewport = Boolean(toolsPanel &&
          toolsPanel.getBoundingClientRect().top < height);
        const capabilitiesEnteredViewport = Boolean(capabilitiesPanel &&
          capabilitiesPanel.getBoundingClientRect().top < height);
        aboutSection.dataset.headingVisible =
          passedProjects && actualAboutPastHeader && !toolsEnteredViewport &&
          !capabilitiesEnteredViewport ? 'true' : 'false';
        aboutSection.style.setProperty('--jw-about-intro-opacity',
          intro.opacity.toFixed(4));
        aboutSection.style.setProperty('--jw-about-intro-lift',
          intro.lift.toFixed(2) + 'px');
      }
      head.style.opacity = String(headOpacity);
      head.style.visibility = headOpacity < .005 ? 'hidden' : 'visible';
      // The fixed GLB artboard is already centered on the viewport.
      // Following the pinned Home DOM rectangle introduced a second,
      // direction-dependent position that shifted the head/ring on rewind.
      // Keep the correction at zero; only the single mobile pose curve
      // is permitted to move the GLB toward Projects and back to About.
      head.style.setProperty('--jw-home-align-x', '0px');
      head.style.setProperty('--jw-home-align-y', '0px');
      head.style.setProperty('--jw-head-x',
        (headPlacement.x + toolHeadX).toFixed(2) + 'px');
      head.style.setProperty('--jw-head-shift',
        headPlacement.shift.toFixed(2) + 'px');
      head.style.setProperty('--jw-head-scale',
        headPlacement.scale.toFixed(4));

      stage.style.opacity = String(isShown ? sceneOpacity : 0);
      stage.style.visibility = isShown ? 'visible' : 'hidden';
      stage.dataset.galleryInteractive = canInteract() && isShown
        ? 'true' : 'false';
      if (copy) copy.style.opacity = String(smooth(p, .922, .992) *
        (1 - smooth(handoff, .02, .38)));

      const orbitOffset = mobileHeadOrbitOffset();
      for (let i = 0; i < CARD_COUNT; i++) {
        if (cardRefs.current[i]) {
          positionCard(cardRefs.current[i], i, p, galleryFocus, handoff, orbitOffset);
        }
      }
      gpuPaperRef.current?.draw(p);

      const nextActive = nearestGalleryIndex(galleryFocus);
      if (nextActive !== active) {
        active = nextActive;
        activeRef.current = nextActive;
        setActiveIndex(nextActive);
      }
      if (isShown !== showing) {
        showing = isShown;
        setVisible(isShown);
      }
    }

    // ONE GSAP ScrollTrigger pins Home while the text disappears and the
    // 21 cards travel. Pin spacing lets Projects follow naturally after the
    // choreographed transition, without scrolling the Home artboard away.
    // The timeline remains paused; ScrollTrigger pins Home and directly
    // seeks that ONE choreography from the native scroll position. This
    // avoids asynchronous scrub tweens and missed reverse/anchor positions.
    const timeline = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
    timeline.to(travel, {
      progress: 1, duration: 1, ease: 'none', onUpdate: render,
    }, 0);
    const pinned = ScrollTrigger.create({
      id: 'jw-home-to-projects',
      trigger: home,
      start: 'top top',
      end: () => '+=' + Math.round(window.innerHeight * 4.25),
      pin: true,
      pinSpacing: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: self => {
        timeline.progress(clamp((window.scrollY - self.start) /
          Math.max(self.end - self.start, 1)));
      },
      onRefresh: self => {
        measure();
        timeline.progress(clamp((window.scrollY - self.start) /
          Math.max(self.end - self.start, 1)));
        render();
      },
    });

    let lastNativePosition = NaN;
    let lastPinStart = NaN;
    let lastPinEnd = NaN;
    let syncFrame = 0;
    const galleryAnchor = () => galleryRestScrollY(docTop(section), height);
    const restingInGallery = () =>
      travel.progress >= TRAIN_END - .0001 &&
      window.scrollY >= sectionTop - height * .10 &&
      window.scrollY < sectionTop + sectionHeight - height * .18;

    const restoreScrollBehavior = () => {
      if (previousScrollBehavior === null) return;
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
      previousScrollBehavior = null;
    };
    const cancelScrollTween = () => {
      scrollTween?.kill();
      scrollTween = null;
      restoreScrollBehavior();
    };
    const animatePageTo = (target, duration, onDone, scrollEase = 'power3.inOut') => {
      cancelScrollTween();
      const root = document.documentElement;
      previousScrollBehavior = root.style.scrollBehavior;
      // The global stylesheet sets scroll-behavior:smooth. Override it
      // temporarily so each GSAP frame is an exact, reversible scroll seek.
      root.style.scrollBehavior = 'auto';
      if (reduced.matches) {
        window.scrollTo(0, target);
        restoreScrollBehavior();
        onDone();
        return;
      }
      const cursor = { y: window.scrollY };
      scrollTween = gsap.to(cursor, {
        y: target, duration, ease: scrollEase,
        onUpdate: () => window.scrollTo(0, cursor.y),
        onComplete: () => {
          window.scrollTo(0, target);
          scrollTween = null;
          restoreScrollBehavior();
          onDone();
        },
      });
    };
    const markGallerySettled = () => {
      snapState = 'settled';
      // Fixed short landing grace. Never extend it for each trackpad
      // momentum packet: that previously trapped visitors in Section 2.
      exitReadyAt = performance.now() + 220;
      // Freeze the first project in its approved position. From here
      // only explicit left/right gestures change the active project.
      if (!loopEnabled) {
        loopFocus = 0;
        loopTarget = 0;
        loopEnabled = true;
      }
      render();
    };
    const startLanding = () => {
      if (snapState === 'landing') return;
      if (snapState === 'settled' && restingInGallery()) return;
      snapState = 'landing';
      const viewports = Math.abs(galleryAnchor() - window.scrollY) /
        Math.max(1, height);
      animatePageTo(galleryAnchor(), Math.min(2, 1.2 + viewports * .15),
        markGallerySettled);
    };
    const leaveForAbout = () => {
      if (snapState !== 'settled') return;
      const about = document.querySelector('#about');
      if (!about) return;
      snapState = 'leaving';
      // An intentional gallery exit now traverses the actual scroll-driven
      // 3D movement at a legible pace, instead of the old one-second whip.
      animatePageTo(docTop(about), 1.08, () => {
        snapState = 'idle';
      }, 'sine.inOut');
    };
    const syncFromScroll = () => {
      if (disposed) return;
      const y = window.scrollY;
      if (y === lastNativePosition && pinned.start === lastPinStart &&
        pinned.end === lastPinEnd) return;
      const previous = lastNativePosition;
      lastNativePosition = y;
      lastPinStart = pinned.start;
      lastPinEnd = pinned.end;
      const exact = clamp((y - pinned.start) /
        Math.max(pinned.end - pinned.start, 1));
      timeline.progress(exact);
      render();
      // A fast wheel gesture can skip the narrow train phase entirely.
      // Land whenever forward scrolling has reached the gallery approach,
      // even if the pinned transition completed between scroll events.
      const approachingGallery = (
        shouldAutoLand(exact, previous, y, snapState,
          TRAIN_START, 1.001) ||
        // Initial scroll/refresh can enter the gallery approach before
        // lastNativePosition has been initialized.
        (snapState === 'idle' && !Number.isFinite(previous) &&
          exact >= TRAIN_START)
      ) && y < galleryAnchor() - height * .04;
      if (approachingGallery) {
        startLanding();
      } else if (snapState === 'idle' && restingInGallery()) {
        // Direct #work navigation, browser history, or reverse from About.
        markGallerySettled();
      } else if (snapState === 'settled' &&
          (y < sectionTop - height * .25 ||
           y >= sectionTop + sectionHeight - height * .18)) {
        snapState = 'idle';
      }
    };
    const frameSync = now => {
      const dt = lastAnimationFrame ?
        Math.min(.25, Math.max(0, (now - lastAnimationFrame) / 1000)) : 0;
      lastAnimationFrame = now;
      syncFromScroll();
      // Gallery focus changes only during an intentional drag or a finite
      // GSAP settle. There is NO idle/autoplay gallery advancement.
      // Idle motion is live (and pause-able), even before scrolling begins.
      // The same 21 card elements are then controlled by ScrollTrigger.
      if (capturedClock === null && travel.progress < .0001 &&
          window.scrollY <= pinned.start + 1 && !document.hidden) {
        if (!reduced.matches) homeClock += dt;
        render();
      }
      syncFrame = requestAnimationFrame(frameSync);
    };
    const onScroll = () => {
      pinned.update();
      syncFromScroll();
    };
    const onResize = () => {
      const wasLanding = snapState === 'landing';
      const wasLeaving = snapState === 'leaving';
      cancelScrollTween();
      measure();
      ScrollTrigger.refresh();
      if (wasLanding) {
        const root = document.documentElement;
        const original = root.style.scrollBehavior;
        root.style.scrollBehavior = 'auto';
        window.scrollTo(0, galleryAnchor());
        root.style.scrollBehavior = original;
        markGallerySettled();
      } else if (wasLeaving) {
        snapState = 'idle';
      }
      render();
    };
    const onVerticalWheel = event => {
      if (snapState === 'landing' || snapState === 'leaving') {
        if (event.cancelable) event.preventDefault();
        verticalGestureRef.current = initialGalleryVerticalState();
        return;
      }
      if (snapState !== 'settled' || !restingInGallery()) {
        verticalGestureRef.current = initialGalleryVerticalState();
        return;
      }
      // Shift-wheel is horizontal gallery navigation, never a request to
      // move to About. Tiny vertical noise from a sideways trackpad swipe
      // must not eject the visitor from the locked gallery.
      if (event.shiftKey && Math.abs(event.deltaX) < .2) return;
      const unit = event.deltaMode === 1 ? 16 :
        event.deltaMode === 2 ? window.innerHeight : 1;
      const dx = event.deltaX * unit;
      const dy = event.deltaY * unit;
      if (dy <= 0 || dy <= Math.abs(dx) * 1.25) {
        verticalGestureRef.current = initialGalleryVerticalState();
        return;
      }
      if (event.cancelable) event.preventDefault();
      const now = performance.now();
      if (now < exitReadyAt) {
        // Brief fixed protection against the wheel gesture that landed
        // the gallery. Do NOT move exitReadyAt here: continuous trackpad
        // packets used to postpone the exit indefinitely.
        verticalGestureRef.current = initialGalleryVerticalState();
        return;
      }
      const result = galleryVerticalExitGesture(
        verticalGestureRef.current, dx, dy, now);
      verticalGestureRef.current = result.state;
      if (result.exit) leaveForAbout();
    };
    const onTouchStart = event => {
      if (snapState !== 'settled' || !restingInGallery()) return;
      const point = event.touches[0];
      if (point) touchOrigin = { x: point.clientX, y: point.clientY,
        up: false };
    };
    const onTouchMove = event => {
      if (snapState === 'landing' || snapState === 'leaving') {
        if (event.cancelable) event.preventDefault();
        return;
      }
      if (snapState !== 'settled' || !touchOrigin) return;
      const point = event.touches[0];
      if (!point) return;
      const dx = point.clientX - touchOrigin.x;
      const dy = point.clientY - touchOrigin.y;
      if (dy < -12 && Math.abs(dy) > Math.abs(dx) * 1.25) {
        touchOrigin.up = true;
        if (event.cancelable) event.preventDefault();
      }
    };
    const onTouchEnd = event => {
      const origin = touchOrigin;
      touchOrigin = null;
      if (!origin || !origin.up || snapState !== 'settled' ||
          performance.now() < exitReadyAt) return;
      const point = event.changedTouches[0];
      if (point && point.clientY - origin.y < -22) leaveForAbout();
    };
    const onScrollKey = event => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey ||
          event.metaKey) return;
      if (!['ArrowDown', 'PageDown', ' '].includes(event.key)) return;
      if (snapState === 'landing' || snapState === 'leaving') {
        event.preventDefault();
        return;
      }
      if (event.target?.closest?.(
          'input, textarea, select, button, a, [contenteditable]')) return;
      if (snapState !== 'settled' || !restingInGallery()) return;
      event.preventDefault();
      if (performance.now() >= exitReadyAt) leaveForAbout();
    };
    const cancelTween = () => {
      loopTween?.kill();
      loopTween = null;
    };
    const settleTo = (index, onDone) => {
      cancelTween();
      const destination = wrapGalleryFocus(index);
      loopTarget = destination;
      const delta = wrappedGalleryDistance(destination, loopFocus);
      if (reduced.matches || Math.abs(delta) < .0001) {
        loopFocus = destination;
        render();
        onDone?.();
        return;
      }
      const from = loopFocus;
      const tween = { progress: 0 };
      loopTween = gsap.to(tween, {
        progress: 1,
        // A carousel should respond at once and settle promptly. Never
        // stretch an interrupted or queued swipe into a long animation.
        duration: gallerySnapDuration(delta),
        ease: 'power2.out',
        onUpdate: () => {
          loopFocus = wrapGalleryFocus(from + delta * tween.progress);
          render();
        },
        onComplete: () => {
          loopFocus = destination;
          loopTween = null;
          render();
          onDone?.();
        },
      });
    };
    const onReduced = () => {
      if (reduced.matches && loopEnabled) {
        settleTo(nearestGalleryIndex(loopFocus));
      }
      ScrollTrigger.refresh();
      render();
    };
    const allowedCards = PROJECTS.map(project => project.image - 1);
    const pickGalleryCard = (clientX, clientY) => {
      if (!canInteract()) return -1;
      if (gpuPaperRef.current?.ready) {
        const imageIndex = gpuPaperRef.current.pickCard(
          clientX, clientY, allowedCards);
        return PROJECTS.findIndex(project => project.image - 1 === imageIndex);
      }
      // The same selection works for reduced motion / software WebGL.
      const matches = PROJECTS.map((project, index) => {
        const card = cardRefs.current[project.image - 1];
        if (!card || card.style.visibility === 'hidden') return null;
        const bounds = card.getBoundingClientRect();
        if (clientX < bounds.left || clientX > bounds.right ||
            clientY < bounds.top || clientY > bounds.bottom) return null;
        return { index, depth: Number(card.dataset.depth || -10000) };
      }).filter(Boolean).sort((a, b) => b.depth - a.depth);
      return matches[0]?.index ?? -1;
    };
    const hoverGalleryCard = index => {
      if (hoveredRef.current === index) return;
      const previous = hoveredRef.current;
      hoveredRef.current = index;
      if (previous >= 0) cardRefs.current[PROJECTS[previous].image - 1]
        ?.classList.remove('is-hovered');
      if (index >= 0) {
        const card = cardRefs.current[PROJECTS[index].image - 1];
        const image = card?.querySelector('img');
        // Match the actual fitted artwork, not the transparent letterbox in
        // the DOM fallback's fixed-size paper container.
        if (card && image?.naturalWidth && image?.naturalHeight) {
          const fit = Math.min(card.clientWidth / image.naturalWidth,
            card.clientHeight / image.naturalHeight);
          card.style.setProperty('--jw-hover-art-width',
            image.naturalWidth * fit + 'px');
          card.style.setProperty('--jw-hover-art-height',
            image.naturalHeight * fit + 'px');
        }
        card?.classList.add('is-hovered');
      }
      gpuPaperRef.current?.setHovered(
        index < 0 ? -1 : PROJECTS[index].image - 1);
      if (stageRef.current) stageRef.current.dataset.hoveredCard =
        index >= 0 ? 'true' : 'false';
    };
    galleryControlsRef.current = {
      canInteract,
      pick: pickGalleryCard,
      hover: hoverGalleryCard,
      selectAndOpen(index) {
        if (!canInteract() || index < 0 || index >= PROJECTS.length)
          return false;
        hoverGalleryCard(-1);
        loopFocus = loopEnabled ? loopFocus : scrollFocus();
        if (!loopEnabled) loopTarget = nearestGalleryIndex(loopFocus);
        loopEnabled = true;
        loopDragging = false;
        // Focus the chosen side sheet FIRST; open its existing reader only
        // after the paper is in the approved central position.
        settleTo(index, () => setOpenedProject(PROJECTS[index]));
        return true;
      },
      returnToGallery() {
        measure();
        cancelScrollTween();
        const root = document.documentElement;
        const previous = root.style.scrollBehavior;
        root.style.scrollBehavior = 'auto';
        window.scrollTo(0, galleryAnchor());
        root.style.scrollBehavior = previous;
        pinned.update();
        syncFromScroll();
        markGallerySettled();
      },
      hold() {
        loopTween?.pause();
      },
      resume() {
        if (!loopDragging) loopTween?.resume();
      },
      beginDrag() {
        if (!canInteract()) return;
        cancelTween();
        loopFocus = loopEnabled ? loopFocus : scrollFocus();
        if (!loopEnabled) loopTarget = nearestGalleryIndex(loopFocus);
        loopEnabled = true;
        loopDragging = true;
        dragOrigin = loopFocus;
        dragTarget = loopTarget;
      },
      drag(deltaX) {
        if (!loopDragging) return;
        const spacing = Math.min(width * .218, 290);
        // Drag follows the finger, but never previews more than one card.
        const preview = clamp(deltaX, -spacing * .9, spacing * .9);
        loopFocus = dragGalleryFocus(dragOrigin, preview, spacing);
        render();
      },
      release(direction) {
        if (!loopDragging) return;
        loopDragging = false;
        // A short/cancelled swipe returns to its original card.
        // Either intentional direction moves ONE card and then stops.
        settleTo(stepGalleryFocus(dragTarget, direction));
      },
      start(direction) {
        if (!canInteract()) return false;
        hoverGalleryCard(-1);
        loopFocus = loopEnabled ? loopFocus : scrollFocus();
        if (!loopEnabled) loopTarget = nearestGalleryIndex(loopFocus);
        loopEnabled = true;
        loopDragging = false;
        settleTo(stepGalleryFocus(loopTarget, direction));
        return true;
      },
      select(index) {
        if (!canInteract()) return false;
        hoverGalleryCard(-1);
        loopFocus = loopEnabled ? loopFocus : scrollFocus();
        if (!loopEnabled) loopTarget = nearestGalleryIndex(loopFocus);
        loopEnabled = true;
        loopDragging = false;
        settleTo(index);
        return true;
      },
    };
    const navigateToGallery = event => {
      const a = event.target.closest?.('a[href="#work"]');
      if (!a || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      window.history.replaceState(null, '', '#work');
      startLanding();
    };
    const navigatePastGallery = event => {
      // Explicit About/Contact links must not be intercepted by the
      // auto-landing trigger while they travel through the pinned Home.
      const a = event.target.closest?.('a[href="#about"], a[href="#contact"]');
      if (!a || event.defaultPrevented || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const hash = a.getAttribute('href');
      const destination = document.querySelector(hash);
      if (!destination) return;
      event.preventDefault();
      window.history.replaceState(null, '', hash);
      snapState = 'leaving';
      animatePageTo(docTop(destination), 1.2, () => {
        snapState = 'idle';
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('wheel', onVerticalWheel,
      { passive: false, capture: true });
    // Wheel events must be heard over the artwork, captions AND controls.
    // Listening only on the swipe plane misses trackpad gestures whenever
    // a different overlay receives the event.
    window.addEventListener('wheel', onGalleryWheel,
      { passive: false, capture: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove,
      { passive: false, capture: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('keydown', onScrollKey);
    document.addEventListener('click', navigateToGallery);
    document.addEventListener('click', navigatePastGallery);
    reduced.addEventListener?.('change', onReduced);
    const observer = new ResizeObserver(() => {
      measure();
      render();
    });
    observer.observe(section);
    const aboutNode = document.querySelector('#about');
    // The original 3D story sizes its own chapter space after Three.js
    // initializes; refresh the shared head exit boundary when it does.
    if (aboutNode) observer.observe(aboutNode);

    // Create the pin before measuring the gallery's document coordinates.
    ScrollTrigger.refresh();
    measure();
    syncFromScroll();
    syncFrame = requestAnimationFrame(frameSync);

    return () => {
      disposed = true;
      cancelScrollTween();
      cancelTween();
      wheelGestureRef.current = initialGalleryWheelState();
      verticalGestureRef.current = initialGalleryVerticalState();
      hoverGalleryCard(-1);
      galleryControlsRef.current = null;
      cancelAnimationFrame(syncFrame);
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('wheel', onVerticalWheel, true);
      window.removeEventListener('wheel', onGalleryWheel, true);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove, true);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('keydown', onScrollKey);
      document.removeEventListener('click', navigateToGallery);
      document.removeEventListener('click', navigatePastGallery);
      reduced.removeEventListener?.('change', onReduced);
      pinned.kill();
      timeline.kill();
      for (const el of [title, ink, subtitle, indicators, bottom]) {
        if (el) el.style.opacity = '';
      }
      home.style.removeProperty('--jw-home-blow');
      if (aboutSection) {
        delete aboutSection.dataset.headingVisible;
        aboutSection.style.removeProperty('--jw-about-intro-opacity');
        aboutSection.style.removeProperty('--jw-about-intro-lift');
      }
      head.style.removeProperty('--jw-head-x');
      head.style.removeProperty('--jw-head-shift');
      head.style.removeProperty('--jw-head-scale');
      head.style.opacity = '';
      head.style.visibility = '';
    };
  }, []);

  function goTo(index) {
    if (galleryControlsRef.current?.select(index)) return;
    const section = sectionRef.current;
    if (!section) return;
    window.scrollTo({
      top: galleryRestScrollY(docTop(section), window.innerHeight),
      behavior: 'smooth',
    });
  }
  function next() {
    if (galleryControlsRef.current?.start(1)) return;
    if (activeRef.current >= PROJECTS.length - 1) {
      document.querySelector('#about')?.scrollIntoView({ behavior: 'smooth' });
    } else goTo(activeRef.current + 1);
  }
  function previous() {
    if (galleryControlsRef.current?.start(-1)) return;
    if (activeRef.current <= 0) {
      document.querySelector('#home')?.scrollIntoView({ behavior: 'smooth' });
    } else goTo(activeRef.current - 1);
  }
  const onPointerDown = event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!galleryControlsRef.current?.canInteract()) return;
    const now = performance.now();
    gestureRef.current = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      lastX: event.clientX, lastAt: now, startedAt: now,
      velocityX: 0, horizontal: false,
    };
    gestureRef.current.tappedIndex =
      galleryControlsRef.current.pick(event.clientX, event.clientY);
    galleryControlsRef.current.hold();
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = event => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) {
      if (event.pointerType === 'mouse')
        galleryControlsRef.current?.hover(
          galleryControlsRef.current.pick(event.clientX, event.clientY));
      return;
    }
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const now = performance.now();
    const dt = now - gesture.lastAt;
    if (dt > 0) {
      const instantaneous = (event.clientX - gesture.lastX) / dt;
      gesture.velocityX = .65 * instantaneous + .35 * gesture.velocityX;
    }
    gesture.lastX = event.clientX;
    gesture.lastAt = now;
    if (!gesture.horizontal) {
      // Vertical gestures must remain native page scrolling.
      if (Math.abs(dy) > 18 && Math.abs(dy) > Math.abs(dx) * 1.5) {
        gestureRef.current = null;
        galleryControlsRef.current?.resume();
        return;
      }
      if (Math.abs(dx) < 6 || Math.abs(dx) <= Math.abs(dy) * .9)
        return;
      gesture.horizontal = true;
      galleryControlsRef.current?.hover(-1);
      galleryControlsRef.current?.beginDrag();
      setDragging(true);
    }
    galleryControlsRef.current?.drag(dx);
  };
  const finishPointer = (event, cancelled = false) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const now = performance.now();
    const totalVelocity = dx / Math.max(1, now - gesture.startedAt);
    const recentVelocity = now - gesture.lastAt < 85
      ? gesture.velocityX : 0;
    const velocity = Math.abs(recentVelocity) > Math.abs(totalVelocity)
      ? recentVelocity : totalVelocity;
    const direction = gallerySwipeDirection(dx, dy, velocity, cancelled);
    if (gesture.horizontal) {
      galleryControlsRef.current?.release(direction);
    } else if (direction) {
      // Flicks that finish before the next pointermove still count.
      galleryControlsRef.current?.beginDrag();
      galleryControlsRef.current?.release(direction);
    } else {
      galleryControlsRef.current?.resume();
      const target = galleryControlsRef.current?.pick(
        event.clientX, event.clientY) ?? -1;
      if (!cancelled && target >= 0 && target === gesture.tappedIndex)
        galleryControlsRef.current?.selectAndOpen(target);
    }
    gestureRef.current = null;
    setDragging(false);
  };
  const onGalleryWheel = event => {
    if (!galleryControlsRef.current?.canInteract()) {
      wheelGestureRef.current = initialGalleryWheelState();
      return;
    }
    // The browser may report pixels, lines or pages. Convert to pixels
    // before accumulating, so mice and trackpads have equal reliability.
    const unit = event.deltaMode === 1 ? 16 :
      event.deltaMode === 2 ? window.innerWidth : 1;
    const shifted = event.shiftKey && Math.abs(event.deltaX) < .2;
    const dx = (shifted ? event.deltaY : event.deltaX) * unit;
    const dy = (shifted ? 0 : event.deltaY) * unit;
    if (Math.abs(dx) < .2 || Math.abs(dx) < Math.abs(dy) * .95) return;
    // Horizontal wheel input belongs to the gallery; never let it nudge
    // the page or accidentally trigger the vertical About transition.
    if (event.cancelable) event.preventDefault();
    const result = galleryWheelGesture(wheelGestureRef.current,
      dx, dy, performance.now());
    wheelGestureRef.current = result.state;
    if (result.step) galleryControlsRef.current?.start(result.step);
  };
  const project = PROJECTS[activeIndex];
  const closeCaseStudy = React.useCallback(() => {
    setOpenedProject(null);
    // Wait for the reader's body-scroll lock to be released, then restore
    // the exact Section 2 gallery anchor instead of falling into About.
    requestAnimationFrame(() =>
      galleryControlsRef.current?.returnToGallery());
  }, []);
  return (
    <>
    <section id="work" ref={sectionRef} className="jw-projects-journey" aria-labelledby="jw-projects-heading">
      <div ref={stageRef} className={'jw-projects-stage' + (visible ? ' is-visible' : '')}
        style={{ opacity: 0, visibility: 'hidden' }}>
        <div
          className={'jw-projects-stage__swipe-surface' +
            (dragging ? ' is-dragging' : '')}
          aria-label="Swipe left or right to change projects; select any visible card to bring it to the front and open its case study"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={() => galleryControlsRef.current?.hover(-1)}
          onPointerUp={event => finishPointer(event)}
          onPointerCancel={event => finishPointer(event, true)}
          onLostPointerCapture={event => finishPointer(event, true)}
        />

        <div className="jw-projects-stage__information" ref={copyRef}>
          <h2 id="jw-projects-heading">PROJECTS</h2>
          <div className="jw-projects-stage__details" aria-live="polite" aria-atomic="true">
            <h3>{project.name}</h3>
            <p>{project.description}</p>
          </div>
          <div className="jw-projects-stage__case-actions">
            <button className="jw-case-open-button" type="button" onClick={() => setOpenedProject(project)} aria-label={'Open case study for ' + project.name}>View case study ↗</button>
            <button className="jw-case-open-button jw-case-open-all" type="button" onClick={() => setOpenedProject({name:'All case studies'})}>All case studies</button>
          </div>
          <div className="jw-projects-stage__controls" aria-label="Featured projects">
            <button type="button" onClick={previous} aria-label="Previous project">←</button>
            <div className="jw-projects-stage__dots">
              {PROJECTS.map((item, index) =>
                <button key={item.image} type="button" onClick={() => goTo(index)}
                  className={activeIndex === index ? 'is-selected' : ''}
                  aria-label={'Show ' + item.name}
                  aria-current={activeIndex === index ? 'step' : undefined} />
              )}
            </div>
            <button type="button" onClick={next} aria-label="Next project">→</button>
            <span className="jw-projects-stage__count">{String(activeIndex + 1).padStart(2, '0')} / 07</span>
          </div>
        </div>
      </div>
    </section>
    {openedProject && <CaseStudyReader selectedProject={openedProject} onClose={closeCaseStudy} />}
    <LivePaperRenderer ref={gpuPaperRef} />
    {CARD_IDS.map((id, index) => createPortal(
      <div className="jw-projects-stage__card" key={id}
        ref={node => { cardRefs.current[index] = node; }}
        data-artwork={id} data-phase="scatter"
        style={{ opacity: 0, visibility: 'hidden', zIndex: 10 }}>
        <img src={fileFor(id)} alt="" draggable="false" />
      </div>, document.body, 'project-sheet-' + id
    ))}
  </>
  );
}
