import React, { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { rollingGlyphs } from './rollingTitleGlyphs.js';

/**
 * A per-glyph, 3D rolling title adapted from GSAP's Rolling Text demo.
 * Each glyph is an original vector outline, extracted from the supplied Canva
 * SVG artboards rather than being re-typeset in a different font. The HTML
 * wrappers provide consistent 3D rotations across browser SVG engines.
 */
export default function RollingTitle({ index, direction = 1, reducedMotion = false }) {
  const scenes = useRef([]);
  const current = useRef(index);
  const motion = useRef(null);
  const initialized = useRef(false);

  useLayoutEffect(() => {
    const panels = scenes.current;
    if (!panels.every(Boolean)) return undefined;

    // Finish any interrupted roll before accepting another input, so rapid
    // arrows, dots, and swipes never leave stray letters on screen.
    if (motion.current) {
      motion.current.progress(1);
      motion.current.kill();
      motion.current = null;
    }

    if (!initialized.current) {
      panels.forEach((panel, panelIndex) => {
        gsap.set(panel, { autoAlpha: panelIndex === index ? 1 : 0 });
        gsap.set(panel.querySelectorAll('.jw-roll-glyph'), { rotationX: 0, autoAlpha: 1 });
      });
      initialized.current = true;
      current.current = index;
      return undefined;
    }

    const fromIndex = current.current;
    if (fromIndex === index) return undefined;
    current.current = index;

    const previous = panels[fromIndex];
    const incoming = panels[index];
    const oldChars = previous.querySelectorAll('.jw-roll-glyph');
    const newChars = incoming.querySelectorAll('.jw-roll-glyph');

    panels.forEach((panel, panelIndex) => {
      if (panelIndex !== fromIndex && panelIndex !== index) gsap.set(panel, { autoAlpha: 0 });
    });
    gsap.set([previous, incoming], { autoAlpha: 1 });
    gsap.set(oldChars, { rotationX: 0, autoAlpha: 1 });

    if (reducedMotion) {
      gsap.set(previous, { autoAlpha: 0 });
      gsap.set(newChars, { rotationX: 0, autoAlpha: 1 });
      return undefined;
    }

    const clockwise = direction >= 0;
    gsap.set(newChars, { rotationX: clockwise ? -90 : 90, autoAlpha: 0 });
    const tl = gsap.timeline({
      onComplete: () => {
        gsap.set(previous, { autoAlpha: 0 });
        gsap.set(oldChars, { rotationX: 0, autoAlpha: 1 });
        motion.current = null;
      },
    });
    const staggerFrom = clockwise ? 'start' : 'end';
    tl.to(oldChars, {
      rotationX: clockwise ? 90 : -90,
      autoAlpha: 0,
      duration: 0.82,
      stagger: { each: 0.065, from: staggerFrom },
      ease: 'power2.inOut',
    }, 0);
    tl.to(newChars, {
      rotationX: 0,
      autoAlpha: 1,
      duration: 0.9,
      stagger: { each: 0.065, from: staggerFrom },
      ease: 'power2.out',
    }, 0.22);
    motion.current = tl;
    return undefined;
  }, [index, direction, reducedMotion]);

  useLayoutEffect(() => () => motion.current?.kill(), []);

  return (
    <div className="jw-new-home__layer jw-new-home__rolling-title" aria-hidden="true">
      {rollingGlyphs.map((glyphs, sceneIndex) => (
        <div
          key={sceneIndex}
          className="jw-roll-scene"
          ref={element => { scenes.current[sceneIndex] = element; }}
          style={{ visibility: sceneIndex === 0 ? 'visible' : 'hidden' }}
        >
          {glyphs.map((glyph, glyphIndex) => (
            <span
              key={glyphIndex}
              className="jw-roll-glyph"
              style={{
                left: `${(glyph.x / 1440) * 100}%`,
                top: `${(glyph.y / 810) * 100}%`,
                width: `${(glyph.w / 1440) * 100}%`,
                height: `${(225 / 810) * 100}%`,
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox={`-7 -195 ${glyph.w} 225`} preserveAspectRatio="none" focusable="false" aria-hidden="true">
                <path d={glyph.d} fill="#8a4cf3" />
              </svg>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}