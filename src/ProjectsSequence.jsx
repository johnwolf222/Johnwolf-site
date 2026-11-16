import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './ProjectsSequence.css';

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
const cubic = (a, b, c, d, t) => {
  const s = 1 - t;
  return s * s * s * a + 3 * s * s * t * b +
    3 * s * t * t * c + t * t * t * d;
};
const landingVh = .28;
const stepVh = .78;
const docTop = node => window.scrollY + node.getBoundingClientRect().top;
const focusOf = (index, scrollY, top, h) =>
  clamp((scrollY - (top + h * landingVh)) / (h * stepVh),
    0, PROJECTS.length - 1);

/**
 * Four distinct phases on ONE reversible GSAP scroll timeline:
 * (1) Every existing artwork returns to the origin behind the one GLB head.
 * (2) Each sheet exits separately and circles AROUND the head in a helical trail.
 * (3) The same sheets curve towards the left edge and towards the viewer.
 * (4) The seven featured sheets slide into gallery positions LEFT TO RIGHT.
 *
 * The SAME twenty-one controllable paper elements render on Home and Projects.
 * No MP4, no crossfade, and no substitution of cards during the transition.
 */
export default function ProjectsSequence() {
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const cardRefs = useRef([]);
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
      width = window.innerWidth;
      height = window.innerHeight;
    }


    const TAU = Math.PI * 2;
    const GOLDEN_ANGLE = 2.399963229728653;
    const HOME_PERIOD = 12;
    function homeAge(index, time) {
      return ((time / HOME_PERIOD + index * 0.618033988749895) % 1 + 1) % 1;
    }
    function homePose(index, age) {
      // The geometry of the Home flight is now a live, reversible function.
      // Rewind by decreasing age, not by swapping or guessing positions.
      const angle = index * GOLDEN_ANGLE - Math.PI * .48 +
        Math.sin(age * TAU * .9 + index * .31) * .23;
      const r = smooth(age, 0, 1);
      const radiusX = width * (.055 + .62 * r);
      const radiusY = height * (.09 + .57 * r);
      const wind = Math.sin(age * TAU * 1.85 + index * .53) *
        Math.sin(age * Math.PI) * Math.min(width, height) * .045;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      return {
        x: dx * radiusX - dy * wind,
        y: dy * radiusY + dx * wind,
        z: mix(-710, 345, age),
        scale: mix(.09, .55 + (index % 4) * .025, smooth(age, .02, .85)),
        ry: Math.sin(age * TAU * .86 + index * .71) * 65,
        rz: Math.cos(age * TAU * .65 + index * .48) * 27,
        opacity: smooth(age, .02, .15) * (1 - smooth(age, .87, 1)),
      };
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
      return {
        x: distance * Math.min(width * .218, 290),
        y: height * .235 + d * height * .014,
        z: -d * 155,
        scale: 1 / (1 + d * .18),
        ry: -Math.sign(distance) * Math.min(65, d * 23),
        opacity: Math.pow(clamp((3.55 - d) / 3.3), .7),
      };
    }

    function positionCard(card, index, phase, galleryFocus, exitFade) {
      const order = index / (CARD_COUNT - 1);
      const id = index + 1;
      const target = targetForCard(id, galleryFocus);
      const spotlight = PROJECTS.findIndex(project => project.image === id);
      const rank = spotlight < 0 ? -1 : ENTRY_ORDER.indexOf(spotlight);

      // PHASE 1 · Reverse the ACTUAL moving Home cards into their shared
      // origin. A captured clock means no flicker or discontinuity at handoff.
      const initialAge = homeAge(index, capturedClock ?? homeClock);
      const rewind = smooth(phase, .012, .272);
      const flight = homePose(index, initialAge * (1 - rewind));
      const originX = flight.x;
      const originY = flight.y;
      const originZ = flight.z;
      const originScale = flight.scale;
      const originRotY = flight.ry;
      const originRotZ = flight.rz;

      // PHASE 2 · The trail follows the SAME winding helical curve. Each
      // sheet begins behind the head, one after another, spaced on the clock.
      // The last sheet finishes its full orbit before the leftward sweep.
      const releaseStart = .304 + index * .0160;
      const orbit = smooth(phase, releaseStart, releaseStart + .170);
      const radius = smooth(orbit, 0, .42);
      const headAngle = -Math.PI * .49 +
        Math.PI * 2.72 * orbit +
        index * .55 * smooth(orbit, .34, 1);
      const ringX = Math.cos(headAngle) * Math.min(width * .37, 490) * radius;
      const stairHeight = (order - .5) * height * .83 +
        Math.sin(headAngle) * height * .13;
      const ringY = stairHeight * radius;
      const ringZ = mix(-710, Math.sin(headAngle) * 350 - 135, orbit);
      const ringScale = mix(.09, .53 + Math.sin(headAngle) * .09, orbit);
      const ringRotY = Math.cos(headAngle) * 58 * radius;
      const ringRotZ = Math.sin(headAngle) * 16 * radius;
      const orbitStarted = phase >= releaseStart;
      const baseX = orbitStarted ? ringX : originX;
      const baseY = orbitStarted ? ringY : originY;
      const baseZ = orbitStarted ? ringZ : originZ;
      const baseScale = orbitStarted ? ringScale : originScale;
      const baseRY = orbitStarted ? ringRotY : originRotY;
      const baseRZ = orbitStarted ? ringRotZ : originRotZ;

      // PHASE 3 · A common swooping turn, from the completed helical
      // arrangement TOWARDS THE LEFT EDGE. The curve travels forwards in
      // perspective instead of cutting straight to the gallery.
      const sweep = smooth(phase, .806, .893);
      const edgeX = -width * (.425 + (1 - order) * .060);
      const edgeY = height * .235 + (order - .5) * height * .25;
      const edgeZ = 310 + Math.sin(headAngle) * 92;
      const edgeScale = .55;
      const sweepX = cubic(ringX, ringX - width * .34,
        edgeX + width * .18, edgeX, sweep);
      const sweepY = cubic(ringY, ringY + height * .12,
        edgeY - height * .19, edgeY, sweep);
      const sweepZ = cubic(ringZ, ringZ + 220,
        edgeZ + 160, edgeZ, sweep);
      const sweepScale = mix(ringScale, edgeScale, sweep);

      // PHASE 4 · LAND LEFT TO RIGHT, not together. The first gallery
      // focus has a circular perspective arc, so the order must be spatial:
      // far left -> near left -> center -> near right -> far right.
      const landingStart = .895 + Math.max(rank, 0) * .0103;
      const landingEnd = .957 + Math.max(rank, 0) * .0064;
      const landing = rank < 0 ? 0 :
        smooth(phase, landingStart, landingEnd);
      const landedX = cubic(edgeX, edgeX + width * .18,
        target.x - Math.min(width * .24, 280), target.x, landing);
      const landedY = cubic(edgeY, edgeY - height * .15,
        target.y - height * .10, target.y, landing);
      const landedZ = cubic(edgeZ, edgeZ + 115,
        target.z + 125, target.z, landing);
      const landedScale = mix(edgeScale, target.scale, landing);

      const enteredSweep = phase >= .806;
      const x = enteredSweep ? landedX :
        (orbitStarted ? baseX : originX);
      const y = enteredSweep ? landedY :
        (orbitStarted ? baseY : originY);
      const z = enteredSweep ? landedZ :
        (orbitStarted ? baseZ : originZ);
      const scale = enteredSweep ? landedScale :
        (orbitStarted ? baseScale : originScale);
      // Between 0.806 and 0.893, feed the actual sweep into the landing
      // start. It is the SAME DOM element and one continuous transform.
      const finalX = enteredSweep ? (phase < .893 ? sweepX : x) : x;
      const finalY = enteredSweep ? (phase < .893 ? sweepY : y) : y;
      const finalZ = enteredSweep ? (phase < .893 ? sweepZ : z) : z;
      const finalScale = enteredSweep ? (phase < .893 ? sweepScale : scale) : scale;
      const rotY = enteredSweep ?
        mix(ringRotY, target.ry, landing) : baseRY;
      const rotZ = enteredSweep ? ringRotZ * (1 - landing) : baseRZ;

      // Each card remains the SAME element, including its original image.
      // It is visible in the Home current, winds down into the head, and
      // reappears individually in the helical trail.
      const emerging = smooth(phase, releaseStart + .006, releaseStart + .075);
      const rewindOpacity = phase < .304 ? flight.opacity : 0;
      const unfeaturedFade = rank < 0 ?
        1 - smooth(phase, .834, .921) : 1;
      const opacity = (orbitStarted ? emerging : rewindOpacity) *
        mix(1, target.opacity, landing) * unfeaturedFade * exitFade;

      // The 21 cards live as SINGLE document-level elements, not inside
      // the stage stacking context. This places the rear side behind the
      // original 3D head (z 10) and the front of the orbit ahead (z 12).
      const inFront = orbitStarted && phase < .89 &&
        Math.sin(headAngle) > .13 && radius > .46;
      const onGallery = rank >= 0 && phase >= landingEnd;
      // On Home the paper layer stays behind the approved headline (z=2).
      // During the spiral each card can pass in front of / behind the head
      // using the same DOM node, never a replacement image.
      card.style.zIndex = String(phase === 0 ? 1 :
        (inFront || (enteredSweep && !onGallery && rank >= 0) ? 12 : 10));
      card.style.transform = 'perspective(1350px) translate3d(' +
        finalX.toFixed(2) + 'px,' + finalY.toFixed(2) + 'px,' +
        finalZ.toFixed(2) + 'px) rotateY(' +
        rotY.toFixed(2) + 'deg) rotateZ(' + rotZ.toFixed(2) +
        'deg) scale(' + finalScale.toFixed(4) + ')';
      card.style.opacity = String(opacity);
      card.style.visibility = opacity < .008 ? 'hidden' : 'visible';
      card.dataset.phase = phase === 0 ? 'home-current' :
        phase < .272 ? 'rewind' :
          phase < releaseStart ? 'behind-head' :
            phase < .806 ? 'spiral' :
              phase < .893 ? 'left-sweep' :
                phase < landingEnd ? 'slide-in' : 'gallery';
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
      const headRise = smooth(p, .803, .993);

      // Fade all Home lettering IN PLACE. Do not move any text off the page,
      // and do not modify the approved per-letter rolling GSAP timeline.
      if (title) title.style.opacity = String(textFade);
      if (ink) ink.style.opacity = String(textFade * exitFade);
      if (subtitle) subtitle.style.opacity = String(subFade);
      if (indicators) indicators.style.opacity = String(subFade);
      if (bottom) bottom.style.opacity = String(bottomFade);
      home.style.setProperty('--jw-home-blow', '0');

      const headOpacity = exitFade;
      head.style.opacity = String(headOpacity);
      head.style.visibility = headOpacity < .005 ? 'hidden' : 'visible';
      head.style.setProperty('--jw-head-shift',
        (-height * .305 * headRise).toFixed(2) + 'px');
      head.style.setProperty('--jw-head-scale',
        (1 - .16 * headRise).toFixed(4));

      stage.style.opacity = String(isShown ? sceneOpacity : 0);
      stage.style.visibility = isShown ? 'visible' : 'hidden';
      stage.style.backgroundColor = 'rgba(255,255,255,' +
        smooth(p, .30, .65).toFixed(3) + ')';
      if (copy) copy.style.opacity = String(smooth(p, .922, .992) * exitFade);

      for (let i = 0; i < CARD_COUNT; i++) {
        if (cardRefs.current[i]) {
          positionCard(cardRefs.current[i], i, p, galleryFocus, exitFade);
        }
      }

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
        Math.min(.05, Math.max(0, (now - lastAnimationFrame) / 1000)) : 0;
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
