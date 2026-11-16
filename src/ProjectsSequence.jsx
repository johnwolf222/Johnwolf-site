import React, { useEffect, useRef, useState } from 'react';
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
 * Home stays visibly pinned while one GSAP ScrollTrigger timeline drives the
 * entire transition. No second 3D head, no moving Home artboard, no new video.
 * The immutable Premotio export dissolves into 21 separate artwork objects.
 * Each sheet emerges from BEHIND the same head, winds into the descending
 * staircase, then sweeps left/forward and lands in the established 7-card arc.
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
    const video = document.querySelector('.jw-floating-card-stage');
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
    let ticker = null;

    function measure() {
      sectionTop = docTop(section);
      sectionHeight = section.getBoundingClientRect().height;
      width = window.innerWidth;
      height = window.innerHeight;
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
      const start = .15 + order * .235;
      // Staggered, one-by-one emergence. The head sits on a higher layer, so
      // each sheet is genuinely hidden behind it at its small origin.
      const reveal = smooth(phase, start, start + .083);
      const orbit = smooth(phase, start, Math.min(.688, start + .31));
      const theta = index * .74 - Math.PI * .58 + orbit * Math.PI * 1.92;
      const radial = smooth(orbit, .05, .45);
      const orbitX = Math.cos(theta) * Math.min(width * .41, 610) * radial;
      const stairY = (order - .5) * height * 1.35 +
        Math.sin(theta) * height * .14 + height * .13;
      const orbitY = mix(0, stairY, smooth(orbit, .03, .8));
      const orbitZ = mix(-590, Math.sin(theta) * 270 - 160, orbit);
      const orbitScale = mix(.13, .47 + .12 * Math.sin(theta), orbit);
      const target = targetForCard(index + 1, galleryFocus);

      // Each sheet leaves the spiral from its own final orbit position,
      // sweeps LEFT, curves TOWARD the viewer, then fans to its assigned
      // seven-card position. Stagger is preserved all the way to landing.
      const land = smooth(phase, .713 + order * .048, .941 + order * .059);
      const x = cubic(orbitX, orbitX - width * .32,
        -width * .29 + target.x * .18, target.x, land);
      const y = cubic(orbitY, orbitY + height * .15,
        target.y - height * .28, target.y, land);
      const z = cubic(orbitZ, orbitZ + 220,
        475 - Math.abs(target.x) * .13, target.z, land);
      const scale = cubic(orbitScale, orbitScale * 1.13,
        Math.max(1.08, target.scale * 1.18), target.scale, land);
      const rotY = mix(Math.cos(theta) * 56, target.ry, land);
      const rotZ = Math.sin(theta) * 17 * (1 - land);
      const opacity = reveal * mix(1, target.opacity, land) * exitFade;

      card.style.transform =
        'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) +
        'px,' + z.toFixed(2) + 'px) rotateY(' + rotY.toFixed(2) +
        'deg) rotateZ(' + rotZ.toFixed(2) + 'deg) scale(' +
        scale.toFixed(4) + ')';
      card.style.opacity = String(opacity);
      card.style.visibility = opacity < .008 ? 'hidden' : 'visible';
      card.style.zIndex = String(40 + Math.round(z / 10));
      card.dataset.phase = land > .999 ? 'gallery' :
        orbit > .03 ? 'spiral' : 'behind-head';
    }

    function render() {
      if (disposed) return;
      const p = reduced.matches ? (travel.progress < .5 ? 0 : 1) :
        travel.progress;
      const scrollY = window.scrollY;
      const galleryFocus = focusOf(0, scrollY, sectionTop, height);
      const galleryActive = scrollY >= sectionTop - height * .25;
      const exitAt = sectionTop + sectionHeight - height * 1.16;
      const exitFade = 1 - smooth(scrollY, exitAt, exitAt + height * .8);
      const stageOpacity = smooth(p, .09, .23) * exitFade;
      const isShown = stageOpacity > .008 &&
        scrollY < sectionTop + sectionHeight - height * .23;
      const sceneOpacity = galleryActive ? 1 : stageOpacity;
      const textFade = 1 - smooth(p, .045, .33);
      const subFade = 1 - smooth(p, .07, .31);
      const bottomFade = 1 - smooth(p, .02, .22);
      const videoFade = 1 - smooth(p, .12, .485);
      const headRise = smooth(p, .47, .97);

      // Fade all Home lettering IN PLACE. Do not move any text off the page,
      // and do not modify the approved per-letter rolling GSAP timeline.
      if (title) title.style.opacity = String(textFade);
      if (ink) ink.style.opacity = String(textFade * exitFade);
      if (subtitle) subtitle.style.opacity = String(subFade);
      if (indicators) indicators.style.opacity = String(subFade);
      if (bottom) bottom.style.opacity = String(bottomFade);
      home.style.setProperty('--jw-home-blow', '0');

      if (video) video.style.opacity = String(videoFade);
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
      if (copy) copy.style.opacity = String(smooth(p, .85, .998) * exitFade);

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
    const timeline = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        id: 'jw-home-to-projects',
        trigger: home,
        start: 'top top',
        end: () => '+=' + Math.round(window.innerHeight * 2.85),
        pin: true,
        pinSpacing: true,
        anticipatePin: 1,
        scrub: reduced.matches ? true : .28,
        invalidateOnRefresh: true,
        onRefresh: () => {
          measure();
          render();
        },
      },
    });
    timeline.to(travel, { progress: 1, duration: 1,
      ease: 'none', onUpdate: render }, 0);

    const onScroll = () => {
      // This also updates the carousel AFTER the pin's GSAP timeline ends.
      // ScrollTrigger retains progress=1 until reversing into the pin.
      render();
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
    render();

    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('click', navigateToGallery);
      reduced.removeEventListener?.('change', onReduced);
      timeline.scrollTrigger?.kill();
      timeline.kill();
      for (const el of [title, ink, subtitle, indicators, bottom, video]) {
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
    <section id="work" ref={sectionRef} className="jw-projects-journey" aria-labelledby="jw-projects-heading">
      <div ref={stageRef} className={'jw-projects-stage' + (visible ? ' is-visible' : '')}
        style={{ opacity: 0, visibility: 'hidden' }}>
        <div className="jw-projects-stage__scene" aria-hidden="true">
          {CARD_IDS.map((id, index) => (
            <div className="jw-projects-stage__card" key={id}
              ref={node => { cardRefs.current[index] = node; }}
              data-artwork={id}>
              <img src={fileFor(id)} alt="" draggable="false" />
            </div>
          ))}
        </div>
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
  );
}
