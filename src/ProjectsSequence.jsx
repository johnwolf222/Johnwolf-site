import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './ProjectsSequence.css';
import LivePaperRenderer from './LivePaperRenderer.jsx';
import CaseStudyReader from './CaseStudyReader.jsx';
import { createHomePaperMotion } from './HomePaperMotion.js';
import { spiralGalleryPose, galleryHeadPlacement, galleryRowOffset, GALLERY_FOCAL, TRAIN_START, TRAIN_END } from './SpiralGalleryMotion.js';
import {
  wrapGalleryFocus, wrappedGalleryDistance, nearestGalleryIndex,
  stepGalleryFocus, dragGalleryFocus, gallerySeamOpacity,
  galleryRestScrollY, shouldAutoLand, galleryExitFade,
  initialGalleryWheelState, galleryWheelGesture,
  initialGalleryVerticalState, galleryVerticalExitGesture,
  gallerySnapDuration, gallerySwipeDirection,
} from './GalleryLoopMotion.js';

gsap.registerPlugin(ScrollTrigger);

// Seven approved featured projects, in their established sequence.
export const PROJECTS = [
  { image: 9, name: 'Souly Unboxed', description: 'Brand identity and visual communication.' },
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
const fileFor = id => '/new-homepage/approved-cards/' +
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
    if (!home || !section || !stage || !head) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let sectionTop = 0;
    let sectionHeight = 0;
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

    function measure() {
      sectionTop = docTop(section);
      sectionHeight = section.getBoundingClientRect().height;
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
      window.scrollY < sectionTop + sectionHeight - height * .23;

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
        y: galleryRowOffset(width, height) + d * height * .014,
        z,
        scale: 1 / (1 + d * .18),
        ry: -Math.sign(distance) * Math.min(65, d * 23),
        opacity: Math.pow(clamp((3.55 - d) / 3.3), .7) *
          (loopEnabled ? gallerySeamOpacity(distance) : 1),
      };
    }

    function positionCard(card, index, phase, galleryFocus, exitFade) {
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
      const finalX = started ? motion.x : flight.x;
      const finalY = started ? motion.y : flight.y;
      const finalZ = started ? motion.z : flight.z;
      const finalScale = started ? motion.scale : flight.scale;
      const rotX = started ? motion.rx : flight.rx;
      const rotY = started ? motion.ry : flight.ry;
      const rotZ = started ? motion.rz : flight.rz;
      const opacity = (started ? motion.opacity : flight.opacity) * exitFade;
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
      card.dataset.phase = phase === 0 ? 'home-current' :
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
      // One viewport for Projects: remain fully visible while locked,
      // then gently fade the shared head/cards as About takes the screen.
      const exitFade = galleryExitFade(scrollY, sectionTop,
        sectionHeight, height);
      const stageOpacity = smooth(p, .09, .19) * exitFade;
      const isShown = stageOpacity > .008 &&
        scrollY < sectionTop + sectionHeight - height * .09;
      const sceneOpacity = galleryActive ? exitFade : stageOpacity;
      const textFade = 1 - smooth(p, .035, .252);
      const subFade = 1 - smooth(p, .050, .250);
      const bottomFade = 1 - smooth(p, .018, .210);
      // Keep the SAME live GLB at the top center of Projects, not offscreen.
      // Only the eventual departure from the Projects section may fade it.
      const headPlacement = galleryHeadPlacement(p, height);

      // Fade all Home lettering IN PLACE. Do not move any text off the page,
      // and do not modify the approved per-letter rolling GSAP timeline.
      if (title) title.style.opacity = String(textFade);
      if (ink) ink.style.opacity = String(textFade * exitFade);
      if (subtitle) subtitle.style.opacity = String(subFade);
      if (indicators) indicators.style.opacity = String(subFade);
      if (bottom) bottom.style.opacity = String(bottomFade);
      home.style.setProperty('--jw-home-blow', '0');

      head.style.opacity = String(exitFade);
      head.style.visibility = exitFade < .005 ? 'hidden' : 'visible';
      head.style.setProperty('--jw-head-shift',
        headPlacement.shift.toFixed(2) + 'px');
      head.style.setProperty('--jw-head-scale',
        headPlacement.scale.toFixed(4));

      stage.style.opacity = String(isShown ? sceneOpacity : 0);
      stage.style.visibility = isShown ? 'visible' : 'hidden';
      stage.dataset.galleryInteractive = canInteract() && isShown
        ? 'true' : 'false';
      if (copy) copy.style.opacity = String(smooth(p, .922, .992) * exitFade);

      for (let i = 0; i < CARD_COUNT; i++) {
        if (cardRefs.current[i]) {
          positionCard(cardRefs.current[i], i, p, galleryFocus, exitFade);
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
      window.scrollY < sectionTop + sectionHeight - height * .23;

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
    const animatePageTo = (target, duration, onDone) => {
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
        y: target, duration, ease: 'power3.inOut',
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
      exitReadyAt = performance.now() + 550;
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
      animatePageTo(docTop(about), 1.0, () => {
        snapState = 'idle';
      });
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
      if (shouldAutoLand(exact, previous, y, snapState,
          TRAIN_START, 1.001) &&
          y < galleryAnchor() - height * .04) {
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
        // Absorb the momentum tail of the gesture that triggered landing.
        exitReadyAt = now + 220;
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
      if (point && point.clientY - origin.y < -35) leaveForAbout();
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
    const settleTo = index => {
      cancelTween();
      const destination = wrapGalleryFocus(index);
      loopTarget = destination;
      const delta = wrappedGalleryDistance(destination, loopFocus);
      if (reduced.matches || Math.abs(delta) < .0001) {
        loopFocus = destination;
        render();
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
    galleryControlsRef.current = {
      canInteract,
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
        loopFocus = loopEnabled ? loopFocus : scrollFocus();
        if (!loopEnabled) loopTarget = nearestGalleryIndex(loopFocus);
        loopEnabled = true;
        loopDragging = false;
        settleTo(stepGalleryFocus(loopTarget, direction));
        return true;
      },
      select(index) {
        if (!canInteract()) return false;
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
    galleryControlsRef.current.hold();
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = event => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
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
      const withinCard = event.clientX >= window.innerWidth * .34 &&
        event.clientX <= window.innerWidth * .66 &&
        event.clientY >= window.innerHeight * .22 &&
        event.clientY <= window.innerHeight * .85;
      if (!cancelled && withinCard && galleryControlsRef.current?.canInteract())
        setOpenedProject(PROJECTS[activeRef.current]);
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
  useEffect(() => {
    if (!openedProject) return;
    const close = event => { if (event.key === 'Escape') setOpenedProject(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [openedProject]);
  return (
    <>
    <section id="work" ref={sectionRef} className="jw-projects-journey" aria-labelledby="jw-projects-heading">
      <div ref={stageRef} className={'jw-projects-stage' + (visible ? ' is-visible' : '')}
        style={{ opacity: 0, visibility: 'hidden' }}>
        <div
          className={'jw-projects-stage__swipe-surface' +
            (dragging ? ' is-dragging' : '')}
          aria-label="Swipe left or right to move one project at a time; tap the center project to open its case study"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={event => finishPointer(event)}
          onPointerCancel={event => finishPointer(event, true)}
          onLostPointerCapture={event => finishPointer(event, true)}
        />

        <div className="jw-projects-stage__information" ref={copyRef}>
          <h2 id="jw-projects-heading">PROJECTS</h2>
          <div className="jw-projects-stage__details" aria-live="polite" aria-atomic="true">
            <h3>{project.name}</h3>
            <p>{project.description}</p>
            <button className="jw-case-open-button" type="button" onClick={() => setOpenedProject(project)} aria-label={'Open case study for ' + project.name}>View case study ↗</button>
            <button className="jw-case-open-button jw-case-open-all" type="button" onClick={() => setOpenedProject({name:'Explore all case studies'})}>Explore all six ↗</button>
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
    {openedProject && <CaseStudyReader selectedProject={openedProject} onClose={() => setOpenedProject(null)} />}
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
