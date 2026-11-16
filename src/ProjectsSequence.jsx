import React, { useEffect, useRef, useState } from 'react';
import './ProjectsSequence.css';

// The seven center-card moments follow the approved moving-carousel reference.
// All 21 distinct approved artworks participate in the descending spiral.
export const PROJECTS = [
  { image: 9, name: 'Souly Unboxed', description: 'Brand identity and visual communication.' },
  { image: 7, name: 'Chick Muy Caliente', description: 'Branding and promotional design.' },
  { image: 5, name: 'Better Mate', description: 'An expressive identity for Better Mate.' },
  { image: 11, name: 'Food & Hospitality', description: 'Creative direction and food-focused imagery.' },
  { image: 2, name: 'Nurusa', description: 'Healthy food service branding.' },
  { image: 1, name: 'Inkzilla', description: 'Tattoo shop identity and visual design.' },
  { image: 10, name: 'One on One', description: 'Identity and creative presentation.' },
];
const ARTWORK_COUNT = 21;
const CARD_IDS = Array.from({ length: ARTWORK_COUNT }, (_, i) => i + 1);
const fileFor = id => '/new-homepage/approved-cards/' +
  String(id).padStart(2, '0') + (id > 13 ? '.avif' : '.webp');
const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const smooth = (n, a = 0, b = 1) => {
  const t = clamp((n - a) / (b - a || 1));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const cubic = (a, b, c, d, t) => {
  const n = 1 - t;
  return n * n * n * a + 3 * n * n * t * b + 3 * n * t * t * c + t * t * t * d;
};
const vhStep = 0.78;
const landingVh = 0.88;
const getSectionTop = node => window.scrollY + node.getBoundingClientRect().top;

/**
 * The homepage video is intentionally immutable. This is a separate,
 * scroll-scrubbed scene that takes over during the Home -> Projects passage.
 * The sheet positions are updated directly on rAF to avoid remounting
 * the 21 approved images as the scroll position changes.
 */
export default function ProjectsSequence() {
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const cardRefs = useRef([]);
  const copyRef = useRef(null);
  const currentRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    const copy = copyRef.current;
    // This is the SAME persistent HomepageHead GLB canvas, portaled out of Home.
    // No duplicate portrait exists in the Projects markup.
    const headLayer = document.querySelector('.jw-continuous-head');
    const homeLayer = document.querySelector('.jw-new-home');
    const videoStage = document.querySelector('.jw-floating-card-stage');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!section || !stage) return undefined;
    let frame = 0;
    let measuredTop = 0;
    let sectionHeight = 0;
    let viewportWidth = 0;
    let viewportHeight = 0;
    let scrollPosition = window.scrollY;
    let lastScroll = -Infinity;
    let lastVisible = false;
    let lastActive = -1;
    let alive = true;

    function measure() {
      measuredTop = getSectionTop(section);
      sectionHeight = section.getBoundingClientRect().height;
      viewportWidth = window.innerWidth;
      viewportHeight = window.innerHeight;
      requestDraw();
    }

    function positionCard(card, index, entry, focus, blend, w, h) {
      const phase = index / ARTWORK_COUNT;
      // Freeze the final spiral pose before landing, so the curved transfer
      // starts at precisely the last orbit position without teleporting.
      const spiralProgress = Math.min(entry, .62);
      const theta = phase * Math.PI * 5.2 + spiralProgress * Math.PI * 2.9;
      const radialX = Math.min(w * 0.40, 600);
      const spiralX = Math.cos(theta) * radialX;
      // Offset each consecutive sheet vertically: a descending helical stair.
      const spiralY = (phase - .5) * h * 1.24 +
        Math.sin(theta) * h * .13 + (spiralProgress - .32) * h * .52;
      const spiralZ = Math.sin(theta) * 260 - 140;
      const spiralRotY = Math.cos(theta) * 56;
      const spiralRotZ = Math.sin(theta) * 17;
      const spiralScale = .48 + .11 * Math.sin(theta);
      const spotlightIndex = PROJECTS.findIndex(project => project.image === index + 1);
      let carouselX, carouselY, carouselZ, carouselRotY, carouselScale, carouselOpacity;
      if (spotlightIndex >= 0) {
        const len = PROJECTS.length;
        // Cyclic shortest signed distance produces a complete seven-card
        // perspective arc even on the first and last spotlight.
        let dist = spotlightIndex - focus;
        while (dist > len / 2) dist -= len;
        while (dist < -len / 2) dist += len;
        const d = Math.abs(dist);
        carouselX = dist * Math.min(w * .218, 290);
        carouselY = h * .235 + d * h * .014;
        carouselZ = -d * 155;
        carouselRotY = -Math.sign(dist) * Math.min(65, d * 23);
        carouselScale = 1 / (1 + d * .18);
        // Sheets at the far end of the carousel disappear *before* wrapping
        // from one edge to the other, preventing a visible teleport.
        carouselOpacity = Math.pow(clamp((3.55 - d) / 3.3), .7);
      } else {
        carouselX = spiralX * 1.38;
        carouselY = h * .8 + spiralY * .35;
        carouselZ = -510;
        carouselRotY = spiralRotY;
        carouselScale = .2;
        carouselOpacity = 0;
      }
      // Cubic control points curve each sheet tangentially out of the orbit,
      // downward and around the persistent head to its carousel destination.
      // This replaces the visibly straight line from spiral to the card row.
      const tangentX = -Math.sin(theta);
      const tangentY = Math.cos(theta);
      const tangentDistance = Math.min(w * .23, 260);
      const x = cubic(spiralX,
        spiralX + tangentX * tangentDistance,
        carouselX + Math.sign(spiralX || 1) * Math.min(w * .12, 160),
        carouselX, blend);
      const y = cubic(spiralY,
        spiralY + tangentY * h * .21 + h * .07,
        carouselY - h * .15,
        carouselY, blend);
      const z = mix(spiralZ, carouselZ, blend);
      const ry = mix(spiralRotY, carouselRotY, blend);
      const rz = spiralRotZ * (1 - blend);
      const scale = mix(spiralScale, carouselScale, blend);
      // Dissolve the pre-rendered, approved Home video into its 21
      // independently moving card counterparts, not a sudden cut.
      const appear = smooth(entry, .14, .42);
      const opacity = appear * mix(1, carouselOpacity, blend);
      card.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' +
        y.toFixed(1) + 'px,' + z.toFixed(1) + 'px) rotateY(' +
        ry.toFixed(1) + 'deg) rotateZ(' + rz.toFixed(1) +
        'deg) scale(' + scale.toFixed(3) + ')';
      card.style.opacity = String(opacity);
      card.style.zIndex = String(40 + Math.round(z / 10));
      card.style.visibility = opacity < .01 ? 'hidden' : 'visible';
    }

    function draw(now = 0) {
      frame = 0;
      if (!alive) return;
      const yTarget = window.scrollY;
      const highPrecision = reduced.matches;
      // Use one clock: actual browser scroll. The browser already handles smooth
      // navigation; applying a second easing here caused the cards/head to lag
      // seconds behind touch scroll on mobile and miss the landing position.
      scrollPosition = yTarget;
      const w = viewportWidth || window.innerWidth;
      const h = viewportHeight || window.innerHeight;
      const start = measuredTop - h * .55;
      const land = measuredTop + h * landingVh;
      const entry = highPrecision ? (scrollPosition >= measuredTop ? 1 : 0) :
        clamp((scrollPosition - start) / (land - start));
      const blend = highPrecision ? 1 : smooth(entry, .62, 1);
      const focus = clamp((scrollPosition - land) / (h * vhStep), 0, PROJECTS.length - 1);
      const active = Math.round(focus);
      const exitStart = measuredTop + sectionHeight - h * 1.18;
      const exitFade = 1 - smooth(scrollPosition, exitStart, exitStart + h * .65);
      const stageShown = scrollPosition >= (highPrecision ? measuredTop : start) &&
        scrollPosition < measuredTop + sectionHeight - h * .2;
      const alpha = (highPrecision ? 1 : smooth(entry, .12, .37)) * exitFade;
      // Only the departure from Home fades its video. Scroll back and the exact
      // approved 21-sheet export returns at full opacity, unmodified.
      if (videoStage) {
        const fadeVideo = highPrecision ? (scrollPosition < measuredTop ? 1 : 0) :
          1 - smooth(entry, .14, .51);
        videoStage.style.opacity = String(fadeVideo);
      }
      stage.style.opacity = String(stageShown ? alpha : 0);
      stage.style.visibility = stageShown ? 'visible' : 'hidden';
      stage.style.backgroundColor = 'rgba(255,255,255,' +
        (highPrecision ? 1 : smooth(entry, .08, .42)).toFixed(3) + ')';
      // Keep the *original* GLB alive in fixed screen coordinates for Home,
      // the complete descending helix, and all seven project selections.
      // Its only movement is a deliberate, visible rise to the upper center.
      if (headLayer) {
        const rise = highPrecision ? (scrollPosition >= measuredTop ? 1 : 0) :
          smooth(entry, .27, .92);
        headLayer.style.setProperty('--jw-head-shift', (-h * .305 * rise).toFixed(1) + 'px');
        headLayer.style.setProperty('--jw-head-scale', (1 - .16 * rise).toFixed(4));
        headLayer.style.opacity = String(exitFade);
        headLayer.style.visibility = exitFade < .008 ? 'hidden' : 'visible';
      }
      if (homeLayer) {
        const blow = highPrecision ? 0 : smooth(scrollPosition, start + h * .05, measuredTop + h * .06);
        homeLayer.style.setProperty('--jw-home-blow', blow.toFixed(4));
      }
      if (copy) copy.style.opacity = String(blend * exitFade);
      for (let i = 0; i < ARTWORK_COUNT; i++) {
        const card = cardRefs.current[i];
        if (card) positionCard(card, i, entry, focus, blend, w, h);
      }
      if (active !== lastActive) {
        lastActive = active;
        currentRef.current = active;
        setActiveIndex(active);
      }
      if (stageShown !== lastVisible) {
        lastVisible = stageShown;
        setVisible(stageShown);
      }
      lastScroll = scrollPosition;

    }

    function requestDraw() {
      if (!frame) frame = requestAnimationFrame(draw);
    }
    const onResize = () => measure();
    const onReduced = () => requestDraw();
    const navigateToGallery = event => {
      const anchor = event.target.closest?.('a[href="#work"]');
      if (!anchor || event.defaultPrevented || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      window.history.replaceState(null, '', '#work');
      window.scrollTo({
        top: measuredTop + viewportHeight * landingVh,
        behavior: reduced.matches ? 'instant' : 'smooth',
      });
    };
    document.addEventListener('click', navigateToGallery);
    window.addEventListener('scroll', requestDraw, { passive: true });
    window.addEventListener('resize', onResize);
    reduced.addEventListener?.('change', onReduced);
    const observer = new ResizeObserver(measure);
    observer.observe(section);
    measure();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('click', navigateToGallery);
      window.removeEventListener('scroll', requestDraw);
      window.removeEventListener('resize', onResize);
      reduced.removeEventListener?.('change', onReduced);
      if (videoStage) videoStage.style.opacity = '';
      if (headLayer) {
        headLayer.style.removeProperty('--jw-head-shift');
        headLayer.style.removeProperty('--jw-head-scale');
        headLayer.style.opacity = '';
        headLayer.style.visibility = '';
      }
      if (homeLayer) homeLayer.style.removeProperty('--jw-home-blow');
    };
  }, []);

  function goTo(index) {
    const section = sectionRef.current;
    if (!section) return;
    const vh = window.innerHeight;
    const i = clamp(index, 0, PROJECTS.length - 1);
    const top = getSectionTop(section) + vh * (landingVh + i * vhStep);
    window.scrollTo({ top, behavior: 'smooth' });
  }
  function next() {
    if (currentRef.current >= PROJECTS.length - 1) {
      document.querySelector('#about')?.scrollIntoView({ behavior: 'smooth' });
    } else goTo(currentRef.current + 1);
  }
  function previous() {
    if (currentRef.current <= 0) {
      document.querySelector('#home')?.scrollIntoView({ behavior: 'smooth' });
    } else goTo(currentRef.current - 1);
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
