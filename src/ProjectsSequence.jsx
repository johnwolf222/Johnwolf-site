import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './ProjectsSequence.css';
import LivePaperRenderer from './LivePaperRenderer.jsx';
import { createHomePaperMotion } from './HomePaperMotion.js';
import { spiralGalleryPose, galleryCameraProgress, galleryRowOffset, CAMERA_DESCENT, GALLERY_FOCAL } from './SpiralGalleryMotion.js';

gsap.registerPlugin(ScrollTrigger);

// Seven approved featured projects, in their established sequence.
export const PROJECTS = [
  { image: 9, name: 'Souly Unboxed', description: 'Brand identity and visual communication.' },
  { image: 7, name: 'Chick Muy Caliente', description: 'Branding and promotional design.' },
  { image: 5, name: 'Better Mate', description: 'An expressive identity for Better Mate.' },
  { image: 11, name: 'Food & Hospitality', description: 'Creative direction and food-focused imagery.' },
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
const landingVh = .28;
const stepVh = .78;
const docTop = node => window.scrollY + node.getBoundingClientRect().top;
const focusOf = (index, scrollY, top, h) =>
  clamp((scrollY - (top + h * landingVh)) / (h * stepVh),
    0, PROJECTS.length - 1);

/**
 * ONE reversible GSAP scroll choreography:
 * (1) Existing Home artworks rewind into the same GLB head.
 * (2) Individual sheets travel in a continuously moving spiral around it.
 * (3) The camera descends as the sheets turn through a tangent-matched curve.
 * (4) Seven approved projects settle into their original bottom gallery row
 *     left-to-right, while the remaining artworks flow away unobtrusively.
 * No intermediate stopping positions, scale spikes, or image replacements.
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
  const activeRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [visible, setVisible] = useState(false);

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

    function targetForCard(id, galleryFocus) {
      const spotlightIndex = PROJECTS.findIndex(project => project.image === id);
      if (spotlightIndex < 0) {
        return { x: -width * .6, y: height * .85, z: -550, scale: .16,
          ry: -65, opacity: 0 };
      }
      const count = PROJECTS.length;
      let distance = spotlightIndex - galleryFocus;
      while (distance > count / 2) distance -= count;
      while (distance < -count / 2) distance += count;
      const d = Math.abs(distance);
      const z = -d * 155;
      const projectedX = distance * Math.min(width * .218, 290);
      return {
        x: projectedX * (GALLERY_FOCAL - z) / GALLERY_FOCAL,
        y: galleryRowOffset(width, height) + d * height * .014,
        z,
        scale: 1 / (1 + d * .18),
        ry: -Math.sign(distance) * Math.min(65, d * 23),
        opacity: Math.pow(clamp((3.55 - d) / 3.3), .7),
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
      if (p > .0001 && capturedClock === null) {
        capturedClock = homeClock;
      } else if (p <= .0001 && capturedClock !== null) {
        // Scrolling all the way back resumes the original clock exactly
        // where the full rewind started, with no visual jump.
        homeClock = capturedClock;
        capturedClock = null;
      }
      const scrollY = window.scrollY;
      const galleryFocus = focusOf(0, scrollY, sectionTop, height);
      const galleryActive = scrollY >= sectionTop - height * .25;
      const exitAt = sectionTop + sectionHeight - height * 1.16;
      const exitFade = 1 - smooth(scrollY, exitAt, exitAt + height * .8);
      const stageOpacity = smooth(p, .09, .19) * exitFade;
      const isShown = stageOpacity > .008 &&
        scrollY < sectionTop + sectionHeight - height * .23;
      const sceneOpacity = galleryActive ? 1 : stageOpacity;
      const textFade = 1 - smooth(p, .035, .252);
      const subFade = 1 - smooth(p, .050, .250);
      const bottomFade = 1 - smooth(p, .018, .210);
      const cameraDescent = galleryCameraProgress(p);
      const headRise = smooth(p, .78, .995);
      const headFade = 1 - smooth(p, .81, .985);

      // Fade all Home lettering IN PLACE. Do not move any text off the page,
      // and do not modify the approved per-letter rolling GSAP timeline.
      if (title) title.style.opacity = String(textFade);
      if (ink) ink.style.opacity = String(textFade * exitFade);
      if (subtitle) subtitle.style.opacity = String(subFade);
      if (indicators) indicators.style.opacity = String(subFade);
      if (bottom) bottom.style.opacity = String(bottomFade);
      home.style.setProperty('--jw-home-blow', '0');

      const headOpacity = exitFade * headFade;
      head.style.opacity = String(headOpacity);
      head.style.visibility = headOpacity < .005 ? 'hidden' : 'visible';
      head.style.setProperty('--jw-head-shift',
        (-height * (CAMERA_DESCENT * cameraDescent +
          .22 * headRise)).toFixed(2) + 'px');
      head.style.setProperty('--jw-head-scale',
        (1 - .24 * headRise).toFixed(4));

      stage.style.opacity = String(isShown ? sceneOpacity : 0);
      stage.style.visibility = isShown ? 'visible' : 'hidden';
      if (copy) copy.style.opacity = String(smooth(p, .922, .992) * exitFade);

      for (let i = 0; i < CARD_COUNT; i++) {
        if (cardRefs.current[i]) {
          positionCard(cardRefs.current[i], i, p, galleryFocus, exitFade);
        }
      }
      gpuPaperRef.current?.draw(p);

      const nextActive = Math.round(galleryFocus);
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
    const syncFromScroll = () => {
      if (disposed) return;
      const y = window.scrollY;
      if (y === lastNativePosition && pinned.start === lastPinStart &&
        pinned.end === lastPinEnd) return;
      lastNativePosition = y;
      lastPinStart = pinned.start;
      lastPinEnd = pinned.end;
      const exact = clamp((y - pinned.start) /
        Math.max(pinned.end - pinned.start, 1));
      timeline.progress(exact);
      render();
    };
    const frameSync = now => {
      const dt = lastAnimationFrame ?
        Math.min(.25, Math.max(0, (now - lastAnimationFrame) / 1000)) : 0;
      lastAnimationFrame = now;
      syncFromScroll();
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
      measure();
      ScrollTrigger.refresh();
      render();
    };
    const onReduced = () => {
      ScrollTrigger.refresh();
      render();
    };
    const navigateToGallery = event => {
      const a = event.target.closest?.('a[href="#work"]');
      if (!a || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      window.history.replaceState(null, '', '#work');
      window.scrollTo({
        top: docTop(section) + window.innerHeight * landingVh,
        behavior: reduced.matches ? 'instant' : 'smooth',
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    document.addEventListener('click', navigateToGallery);
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
      cancelAnimationFrame(syncFrame);
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('click', navigateToGallery);
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
    const section = sectionRef.current;
    if (!section) return;
    const i = clamp(index, 0, PROJECTS.length - 1);
    window.scrollTo({
      top: docTop(section) + window.innerHeight * (landingVh + i * stepVh),
      behavior: 'smooth',
    });
  }
  function next() {
    if (activeRef.current >= PROJECTS.length - 1) {
      document.querySelector('#about')?.scrollIntoView({ behavior: 'smooth' });
    } else goTo(activeRef.current + 1);
  }
  function previous() {
    if (activeRef.current <= 0) {
      document.querySelector('#home')?.scrollIntoView({ behavior: 'smooth' });
    } else goTo(activeRef.current - 1);
  }
  const project = PROJECTS[activeIndex];
  return (
    <>
    <section id="work" ref={sectionRef} className="jw-projects-journey" aria-labelledby="jw-projects-heading">
      <div ref={stageRef} className={'jw-projects-stage' + (visible ? ' is-visible' : '')}
        style={{ opacity: 0, visibility: 'hidden' }}>

        <div className="jw-projects-stage__information" ref={copyRef}>
          <h2 id="jw-projects-heading">PROJECTS</h2>
          <div className="jw-projects-stage__details" aria-live="polite" aria-atomic="true">
            <h3>{project.name}</h3>
            <p>{project.description}</p>
          </div>
          <div className="jw-projects-stage__controls" aria-label="Featured projects">
            <button type="button" onClick={previous} aria-label="Previous featured project">←</button>
            <div className="jw-projects-stage__dots">
              {PROJECTS.map((item, index) =>
                <button key={item.image} type="button" onClick={() => goTo(index)}
                  className={activeIndex === index ? 'is-selected' : ''}
                  aria-label={'Show ' + item.name}
                  aria-current={activeIndex === index ? 'step' : undefined} />
              )}
            </div>
            <button type="button" onClick={next} aria-label="Next featured project">→</button>
            <span className="jw-projects-stage__count">{String(activeIndex + 1).padStart(2, '0')} / 07</span>
          </div>
        </div>
      </div>
    </section>
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
