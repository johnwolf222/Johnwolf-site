import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { rollingGlyphs } from './rollingTitleGlyphs.js';
import { HEAD_SILHOUETTE_MASK } from './approvedHeadSilhouetteMask.js';

const glyphPosition = glyph => ({
  left: (glyph.x / 1440 * 100) + '%',
  top: (glyph.y / 810 * 100) + '%',
  width: (glyph.w / 1440 * 100) + '%',
  height: (225 / 810 * 100) + '%',
});

/**
 * ONE GSAP clock drives the purple text and its thin white companion outline.
 * The outline is portaled above the 3D head, with a pre-approved alpha
 * silhouette bundled into the first paint. No URL swapping or image loading
 * can interrupt the glyphs. Its position follows the SAME head canvas.
 */
export default function RollingTitle({ index, direction = 1, reducedMotion = false, onRollComplete }) {
  const scenes = useRef([]);
  const outlineScenes = useRef([]);
  const titleRoot = useRef(null);
  const outlineRoot = useRef(null);
  const motion = useRef(null);
  const current = useRef(index);
  const initialized = useRef(false);
  const settledCallback = useRef(onRollComplete);
  settledCallback.current = onRollComplete;

  // Keep the portaled outlines in *exactly* the same physical artboard
  // coordinates as the original glyphs, including natural vertical scrolling.
  useLayoutEffect(() => {
    const title = titleRoot.current;
    const overlay = outlineRoot.current;
    if (!title || !overlay) return undefined;
    const position = () => {
      const r = title.getBoundingClientRect();
      overlay.style.left = r.left + 'px';
      overlay.style.top = r.top + 'px';
      overlay.style.width = r.width + 'px';
      overlay.style.height = r.height + 'px';
      const headSurface = document.querySelector('.jw-new-home__head-canvas');
      if (headSurface) {
        // The mask is a snapshot in the *original head canvas coordinates*.
        // Moving just its CSS geometry keeps it over the one persistent head
        // through Home, scrolling and Projects, without replacing any image.
        const head = headSurface.getBoundingClientRect();
        const mask = overlay.parentElement;
        mask.style.maskSize = head.width + 'px ' + head.height + 'px';
        mask.style.webkitMaskSize = mask.style.maskSize;
        mask.style.maskPosition = head.left + 'px ' + head.top + 'px';
        mask.style.webkitMaskPosition = mask.style.maskPosition;
      }
    };
    // Position is a cheap layout read plus CSS transform/mask geometry.
    // Apply it synchronously: scheduling another animation frame left the
    // outline in the previous position during rapid wheel/touch scrolling.
    // The MutationObserver below repositions again after Projects changes
    // Home/head CSS variables, before the browser paints the new scroll frame.
    const syncPosition = () => position();
    // Projects updates its vertical-scroll CSS variable in the same scroll
    // event. Read the *final* geometry only after that update, never before:
    // otherwise the white outline trails the purple text by several pixels.
    const home = title.closest('.jw-new-home');
    const styles = new MutationObserver(syncPosition);
    if (home) styles.observe(home, { attributes: true, attributeFilter: ['style'] });
    const movingHead = document.querySelector('.jw-continuous-head__artboard');
    if (movingHead) styles.observe(movingHead, { attributes: true, attributeFilter: ['style'] });
    const observer = new ResizeObserver(syncPosition);
    observer.observe(title);
    window.addEventListener('scroll', syncPosition, { passive: true });
    window.addEventListener('resize', syncPosition);
    position();
    return () => {
      styles.disconnect();
      observer.disconnect();
      window.removeEventListener('scroll', syncPosition);
      window.removeEventListener('resize', syncPosition);
    };
  }, []);

  useLayoutEffect(() => {
    const panels = scenes.current;
    const outlines = outlineScenes.current;
    if (panels.length !== rollingGlyphs.length || !panels.every(Boolean) ||
        outlines.length !== rollingGlyphs.length || !outlines.every(Boolean)) return undefined;

    if (motion.current) {
      const interrupted = motion.current;
      motion.current = null;
      interrupted.progress(1);
      interrupted.kill();
    }

    if (!initialized.current) {
      panels.forEach((panel, i) => {
        gsap.set([panel, outlines[i]], { autoAlpha: i === index ? 1 : 0 });
        gsap.set([...panel.querySelectorAll('.jw-roll-glyph'),
          ...outlines[i].querySelectorAll('.jw-roll-glyph')], {
          rotationX: 0, autoAlpha: 1,
        });
      });
      initialized.current = true;
      current.current = index;
      return undefined;
    }

    const fromIndex = current.current;
    if (fromIndex === index) return undefined;
    current.current = index;

    const previous = panels[fromIndex];
    const previousOutline = outlines[fromIndex];
    const incoming = panels[index];
    const incomingOutline = outlines[index];
    const oldChars = previous.querySelectorAll('.jw-roll-glyph');
    const oldOutlineChars = previousOutline.querySelectorAll('.jw-roll-glyph');
    const newChars = incoming.querySelectorAll('.jw-roll-glyph');
    const newOutlineChars = incomingOutline.querySelectorAll('.jw-roll-glyph');

    panels.forEach((panel, i) => {
      if (i !== fromIndex && i !== index) {
        gsap.set([panel, outlines[i]], { autoAlpha: 0 });
      }
    });
    gsap.set([previous, previousOutline, incoming, incomingOutline], { autoAlpha: 1 });
    gsap.set([...oldChars, ...oldOutlineChars], { rotationX: 0, autoAlpha: 1 });

    if (reducedMotion) {
      gsap.set([previous, previousOutline], { autoAlpha: 0 });
      gsap.set([...newChars, ...newOutlineChars], { rotationX: 0, autoAlpha: 1 });
      settledCallback.current?.();
      return undefined;
    }

    const clockwise = direction >= 0;
    gsap.set([...newChars, ...newOutlineChars], {
      rotationX: clockwise ? -90 : 90, autoAlpha: 0,
    });
    const staggerFrom = clockwise ? 'start' : 'end';
    const exit = {
      rotationX: clockwise ? 90 : -90,
      autoAlpha: 0,
      duration: 0.82,
      stagger: { each: 0.065, from: staggerFrom },
      ease: 'power2.inOut',
    };
    const enter = {
      rotationX: 0,
      autoAlpha: 1,
      duration: 0.9,
      stagger: { each: 0.065, from: staggerFrom },
      ease: 'power2.out',
    };
    const tl = gsap.timeline({
      onComplete: () => {
        gsap.set([previous, previousOutline], { autoAlpha: 0 });
        gsap.set([...oldChars, ...oldOutlineChars], {
          rotationX: 0, autoAlpha: 1,
        });
        motion.current = null;
        settledCallback.current?.();
      },
    });
    // These pairs start at identical timeline positions and use identical
    // staggering. There is no secondary timer and no independent approximation.
    tl.to(oldChars, exit, 0);
    tl.to(oldOutlineChars, { ...exit, stagger: { ...exit.stagger } }, 0);
    tl.to(newChars, enter, 0.22);
    tl.to(newOutlineChars, { ...enter, stagger: { ...enter.stagger } }, 0.22);
    motion.current = tl;
    return undefined;
  }, [index, direction, reducedMotion]);

  useLayoutEffect(() => () => motion.current?.kill(), []);

  const renderScenes = outline => rollingGlyphs.map((glyphs, sceneIndex) => (
    <div
      key={sceneIndex}
      className={'jw-roll-scene' + (outline ? ' jw-roll-scene--head-ink' : '')}
      ref={node => {
        if (outline) outlineScenes.current[sceneIndex] = node;
        else scenes.current[sceneIndex] = node;
      }}
      style={{ visibility: sceneIndex === 0 ? 'visible' : 'hidden' }}
    >
      {glyphs.map((glyph, glyphIndex) => (
        <span key={glyphIndex}
          className={'jw-roll-glyph' + (outline ? ' jw-roll-glyph--head-ink' : '')}
          style={glyphPosition(glyph)}>
          <svg xmlns="http://www.w3.org/2000/svg"
            viewBox={`-7 -195 ${glyph.w} 225`}
            preserveAspectRatio="none" focusable="false" aria-hidden="true">
            <path d={glyph.d}
              fill={outline ? 'none' : '#8a4cf3'}
              stroke={outline ? '#ffffff' : 'none'}
              strokeWidth={outline ? 2.4 : undefined}
              strokeLinejoin={outline ? 'round' : undefined} />
          </svg>
        </span>
      ))}
    </div>
  ));

  return (
    <>
      <div ref={titleRoot}
        className="jw-new-home__layer jw-new-home__rolling-title"
        aria-hidden="true">
        {renderScenes(false)}
      </div>
      {createPortal(
        <div className="jw-title-head-ink" aria-hidden="true"
          style={{
            maskImage: `url("${HEAD_SILHOUETTE_MASK}")`,
            WebkitMaskImage: `url("${HEAD_SILHOUETTE_MASK}")`,
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
          }}>
          <div ref={outlineRoot} className="jw-title-head-ink__artboard">
            {renderScenes(true)}
          </div>
        </div>, document.body)}
    </>
  );
}
