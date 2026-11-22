import React, { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';

/**
 * Actual left-most purple pixels measured from the seven original 1440x810
 * Canva title SVGs. Align the LEFT EDGE of the supplied dot (111.35) to the
 * large title ink, rather than using one offset for every different word.
 * The original subtitle artwork is never re-typeset or separated from its dot.
 */
const TITLE_INK_LEFT = [107, 137, 180, 158, 86, 163, 216];
const DOT_LEFT = 111.351562;
// Midpoints of the original purple dot plus subtitle ink, measured in the
// seven 1440px SVGs (not the center of the full transparent SVG canvas).
const SUBTITLE_INK_MIDPOINT = [224.731, 191.595, 169.578, 298.861, 223.926, 181.557, 230.577];
const ARTBOARD_WIDTH = 1440;
const SUBMERGED_Y_PERCENT = 12;

const EmergingSubtitle = forwardRef(function EmergingSubtitle(
  { index, slug, reducedMotion = false }, ref
) {
  const imageRef = useRef(null);
  const tweenRef = useRef(null);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  const animateTo = (props, duration, ease) => new Promise(resolve => {
    const image = imageRef.current;
    if (!image) { resolve(); return; }
    // GSAP's onInterrupt resolves any outstanding motion promise so a new
    // navigation cannot leave the sequence waiting on a killed tween.
    tweenRef.current?.kill();
    if (reducedRef.current) {
      gsap.set(image, props);
      resolve();
      return;
    }
    tweenRef.current = gsap.to(image, {
      ...props,
      duration,
      ease,
      overwrite: 'auto',
      onComplete: () => { tweenRef.current = null; resolve(); },
      onInterrupt: resolve,
    });
  });

  useImperativeHandle(ref, () => ({
    sink: () => animateTo({ yPercent: SUBMERGED_Y_PERCENT, autoAlpha: 0 }, 0.38, 'power2.in'),
    rise: () => animateTo({ yPercent: 0, autoAlpha: 1 }, 0.34, 'power3.out'),
  }), []);

  useLayoutEffect(() => {
    const image = imageRef.current;
    gsap.set(image, { yPercent: SUBMERGED_Y_PERCENT, autoAlpha: 0 });
    const start = gsap.delayedCall(0.08, () => {
      animateTo({ yPercent: 0, autoAlpha: 1 }, 0.36, 'power3.out');
    });
    return () => {
      start.kill();
      tweenRef.current?.kill();
    };
  }, []);

  return (
    <div className="jw-new-home__layer jw-new-home__subtitle-clip" aria-hidden="true">
      <img
        ref={imageRef}
        className="jw-new-home__layer jw-new-home__subtitle"
        src={`/new-homepage/subtitle-${slug}.svg`}
        style={{
          '--jw-subtitle-desktop-left': `${((TITLE_INK_LEFT[index] - DOT_LEFT) / ARTBOARD_WIDTH) * 100}%`,
          '--jw-subtitle-mobile-center': `${(SUBTITLE_INK_MIDPOINT[index] / ARTBOARD_WIDTH) * 280}vw`,
        }}
        alt=""
        draggable="false"
      />
    </div>
  );
});

export default EmergingSubtitle;