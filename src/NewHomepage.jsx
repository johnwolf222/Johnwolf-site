import React, { useEffect, useRef, useState } from 'react';
import './NewHomepage.css';
import RollingTitle from './RollingTitle.jsx';

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
  const [index, setIndex] = useState(0);
  const [manual, setManual] = useState(false);
  const touch = useRef(null);
  const rollDirection = useRef(1);
  const idleTimer = useRef(null);
  const reduced = useReducedMotion();

  // The seven provided title artworks retain their own proportions and layout.
  const scene = SCENES[index];
  const manualAdvance = next => {
    rollDirection.current = next < index ? -1 : 1;
    setIndex((next + SCENES.length) % SCENES.length);
    setManual(true);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setManual(false), 10000);
  };

  useEffect(() => {
    if (reduced || manual) return undefined;
    const timer = window.setInterval(() => {
      rollDirection.current = 1;
      setIndex(previous => (previous + 1) % SCENES.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [reduced, manual]);

  useEffect(() => () => window.clearTimeout(idleTimer.current), []);

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
      manualAdvance(index + (dx < 0 ? 1 : -1));
    }
  };

  return (
    <section id="home" className="jw-new-home" aria-label="John Wolf Vision homepage">
      <div
        className="jw-new-home__artboard"
        onPointerDown={pointerStart}
        onPointerUp={pointerEnd}
        onPointerCancel={() => { touch.current = null; }}
      >
        <img className="jw-new-home__layer jw-new-home__cards" src={`${ART}cards-placeholder.svg`} alt="" aria-hidden="true" draggable="false" />
        <RollingTitle index={index} direction={rollDirection.current} reducedMotion={reduced} />
        <img className="jw-new-home__layer jw-new-home__head" src={`${ART}head-placeholder.svg`} alt="" aria-hidden="true" draggable="false" />
        <img key={`outline-${scene.slug}`} className="jw-new-home__layer jw-new-home__outline" src={`${ART}outline-${scene.slug}.svg`} alt="" aria-hidden="true" draggable="false" />
        <img key={`subtitle-${scene.slug}`} className="jw-new-home__layer jw-new-home__subtitle" src={`${ART}subtitle-${scene.slug}.svg`} alt="" aria-hidden="true" draggable="false" />
        <div className="jw-new-home__indicators" aria-label="Choose a featured discipline">
          {SCENES.map((item, i) => (
            <button
              key={item.slug}
              type="button"
              className={`jw-new-home__indicator${i === index ? ' is-active' : ''}`}
              aria-label={`Show ${item.label}`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => manualAdvance(i)}
            />
          ))}
        </div>
      </div>
      <div className="jw-new-home__bottom-bar">
        <span className="jw-new-home__counter" aria-live="polite">{scene.label}</span>
        <div className="jw-new-home__buttons">
          <button type="button" onClick={() => manualAdvance(index - 1)} aria-label="Previous discipline">←</button>
          <button type="button" onClick={() => manualAdvance(index + 1)} aria-label="Next discipline">→</button>
        </div>
        <a className="jw-new-home__scroll" href="#work">Explore work ↓</a>
      </div>
      <h1 className="jw-new-home__sr-only">John Wolf — {scene.label}</h1>
    </section>
  );
}

// Dedicated home for the forthcoming floating-card gallery. This deliberately
// does not re-introduce the removed Logo Creations/Brand Guidelines components.
export function FloatingWorkSection() {
  return (
    <section id="work" className="jw-floating-work" aria-labelledby="jw-work-heading">
      <div className="jw-floating-work__intro">
        <span className="jw-floating-work__eyebrow">JOHN WOLF / SELECTED WORK</span>
        <h2 id="jw-work-heading">Work in motion.</h2>
        <p>Projects move beyond a static gallery. The floating cards will transition from the homepage into this space as their scroll choreography is finalized.</p>
      </div>
      <img className="jw-floating-work__art" src={`${ART}cards-placeholder.svg`} alt="Preview of the floating project-card artwork" loading="lazy" />
    </section>
  );
}