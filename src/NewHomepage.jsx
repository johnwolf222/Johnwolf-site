import React, { useEffect, useRef, useState } from 'react';
import EmergingSubtitle from './EmergingSubtitle.jsx';
import './NewHomepage.css';
import RollingTitle from './RollingTitle.jsx';
import HomepageHead from './HomepageHead.jsx';
import { useHomepageTextImpact } from './HomepageTextImpact.js';

/**
 * The source SVGs come from JohnWolf_homepage.zip. They have a shared 16:9
 * coordinate system, so they remain independent layers instead of a flattened
 * screenshot. Head and cards are temporary visual references; the shared
 * WebGL/card motion layer will replace them after their trajectories are set.
 */
const ART = '/new-homepage/';
const SCENES = [
  { slug: 'portfolio', label: 'Portfolio' },
  { slug: 'branding', label: 'Branding' },
  { slug: 'designer', label: 'Visual Designer' },
  { slug: 'creation', label: 'Content Creation' },
  { slug: 'guidelines', label: 'Content Guidelines' },
  { slug: 'learning', label: 'AI Machine Learning' },
  { slug: 'solving', label: 'Problem Solving' },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

export default function NewHomepage() {
  const homeRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [manual, setManual] = useState(false);
  const touch = useRef(null);
  const rollDirection = useRef(1);
  const idleTimer = useRef(null);
  const subtitle = useRef(null);
  const currentIndex = useRef(0);
  const desiredIndex = useRef(0);
  const queued = useRef(null);
  const transitioning = useRef(false);
  const disposed = useRef(false);
  const navigateRef = useRef(null);
  const reduced = useReducedMotion();

  const scene = SCENES[index];
  const textImpact = useHomepageTextImpact(homeRef, index, reduced);

  // First submerge the dot and subtitle beneath the top edge of the title;
  // only then change the index, which triggers the existing GSAP title roll.
  const beginTransition = (next, direction) => {
    if (transitioning.current) {
      queued.current = { next, direction };
      return;
    }
    if (next === currentIndex.current) return;
    transitioning.current = true;
    (subtitle.current?.sink() ?? Promise.resolve()).then(() => {
      if (disposed.current) return;
      rollDirection.current = direction;
      currentIndex.current = next;
      setIndex(next);
    });
  };

  const titleHasSettled = () => {
    // Rise back out only once the per-letter title animation has finished.
    (subtitle.current?.rise() ?? Promise.resolve()).then(() => {
      if (disposed.current) return;
      transitioning.current = false;
      const pending = queued.current;
      queued.current = null;
      if (pending) beginTransition(pending.next, pending.direction);
    });
  };

  const requestAdvance = (value, mode = 'step', isManual = true) => {
    const prior = desiredIndex.current;
    const next = ((mode === 'step' ? prior + value : value) % SCENES.length + SCENES.length) % SCENES.length;
    const direction = mode === 'step' ? Math.sign(value) || 1 : next < prior ? -1 : 1;
    desiredIndex.current = next;
    if (isManual) {
      setManual(true);
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => setManual(false), 10000);
    }
    beginTransition(next, direction);
  };
  navigateRef.current = requestAdvance;

  // The four-second timer stays intact. Requests made during a roll are queued
  // rather than interrupting and corrupting the approved lettering timeline.
  useEffect(() => {
    if (reduced || manual) return undefined;
    const timer = window.setInterval(() => navigateRef.current?.(1, 'step', false), 4000);
    return () => window.clearInterval(timer);
  }, [reduced, manual]);

  // Preload each small source SVG so the next subtitle is ready as its title rolls.
  useEffect(() => {
    const images = SCENES.map(item => {
      const image = new Image();
      image.src = `${ART}subtitle-${item.slug}.svg`;
      return image;
    });
    return () => {
      disposed.current = true;
      window.clearTimeout(idleTimer.current);
      images.forEach(image => { image.onload = null; });
    };
  }, []);

  const pointerStart = event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    touch.current = { x: event.clientX, y: event.clientY };
  };
  const pointerEnd = event => {
    if (!touch.current) return;
    const dx = event.clientX - touch.current.x;
    const dy = event.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      requestAdvance(dx < 0 ? 1 : -1);
    }
  };

  return (
    <section id="home" ref={homeRef} className="jw-new-home" aria-label="John Wolf Vision homepage">
      <div
        className="jw-new-home__artboard"
        onPointerDown={pointerStart}
        onPointerUp={pointerEnd}
        onPointerCancel={() => { touch.current = null; }}
      >
        {/* Shared cards render once outside Home and Work so they can cross both sections. */}
        <RollingTitle index={index} direction={rollDirection.current} reducedMotion={reduced} onRollComplete={titleHasSettled} />
        <HomepageHead reducedMotion={reduced} onImpact={textImpact} />
        <img key={`outline-${scene.slug}`} className="jw-new-home__layer jw-new-home__outline" src={`${ART}outline-${scene.slug}.svg`} alt="" aria-hidden="true" draggable="false" />
        <EmergingSubtitle ref={subtitle} index={index} slug={scene.slug} reducedMotion={reduced} />
        <div className="jw-new-home__indicators" aria-label="Choose a featured discipline">
          {SCENES.map((item, i) => (
            <button
              key={item.slug}
              type="button"
              className={`jw-new-home__indicator${i === index ? ' is-active' : ''}`}
              aria-label={`Show ${item.label}`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => requestAdvance(i, 'direct')}
            />
          ))}
        </div>
      </div>
      <div className="jw-new-home__bottom-bar">
        <span className="jw-new-home__counter" aria-live="polite">{scene.label}</span>
        <div className="jw-new-home__buttons">
          <button type="button" onClick={() => requestAdvance(-1)} aria-label="Previous discipline"><span className="jw-impact-arrow" aria-hidden="true">←</span></button>
          <button type="button" onClick={() => requestAdvance(1)} aria-label="Next discipline"><span className="jw-impact-arrow" aria-hidden="true">→</span></button>
        </div>
        <a className="jw-new-home__scroll" href="#work">Explore work ↓</a>
      </div>
      <h1 className="jw-new-home__sr-only">John Wolf — {scene.label}</h1>
    </section>
  );
}
