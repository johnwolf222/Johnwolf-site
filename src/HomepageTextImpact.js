import { useCallback, useEffect, useRef } from 'react';

// A lightweight adaptation of the About-page damped radial text wave. All
// displacement uses CSS's independent "translate" property: this NEVER writes
// to "transform", which the approved title roll and subtitle reveal own.
const TITLE_INK_LEFT = [107, 137, 180, 158, 86, 163, 216];
const DURATION = 2300; // Includes travel time from the head to the outer labels.
const SPEED = 840;     // px per second: stagger outward by physical distance.

const getCenter = node => {
  const r = node.getBoundingClientRect();
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
};

export function useHomepageTextImpact(homeRef, index, reducedMotion) {
  const frame = useRef(0);
  const targets = useRef([]);
  const reducedRef = useRef(reducedMotion);
  const indexRef = useRef(index);
  reducedRef.current = reducedMotion;
  indexRef.current = index;

  const stop = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    for (const { node } of targets.current) {
      if (node.isConnected) node.style.translate = '';
    }
    targets.current = [];
  }, []);

  useEffect(() => () => stop(), [stop]);

  return useCallback(origin => {
    if (reducedRef.current || !origin || !Number.isFinite(origin.x) ||
        !Number.isFinite(origin.y)) return;
    const home = homeRef.current;
    if (!home) return;
    stop();

    // Cover ALL visible homepage typography, including the persistent header.
    // The buttons keep their hit targets fixed; only their arrow glyphs react.
    const elements = [
      ...document.querySelectorAll('.header .wordmark, .header nav a'),
      ...home.querySelectorAll('.jw-new-home__counter, .jw-new-home__scroll, .jw-impact-arrow'),
    ];

    // During 3D rolling, GSAP rotates the GLYPH WRAPPER. Displace only its
    // inner SVG so the rolling timeline, timing and transforms never change.
    for (const scene of home.querySelectorAll('.jw-roll-scene')) {
      if (getComputedStyle(scene).visibility !== 'visible') continue;
      elements.push(...scene.querySelectorAll('.jw-roll-glyph svg'));
    }

    const subtitle = home.querySelector('.jw-new-home__subtitle-clip');
    const artboard = home.querySelector('.jw-new-home__artboard');
    if (subtitle && artboard) elements.push(subtitle);

    const artRect = artboard?.getBoundingClientRect();
    const subtitlePoint = artRect && {
      x: artRect.left + artRect.width * (TITLE_INK_LEFT[indexRef.current] + 105) / 1440,
      y: artRect.top + artRect.height * 300 / 810,
    };

    // Snapshot positions before the effect. No per-frame layout reads, avoiding
    // jitter from measuring already-shifted text (a known About-page issue).
    targets.current = elements.filter(node => {
      if (!node.isConnected || getComputedStyle(node).visibility === 'hidden') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).map(node => {
      const center = node === subtitle && subtitlePoint ? subtitlePoint : getCenter(node);
      const dx = center.x - origin.x;
      const dy = center.y - origin.y;
      return {
        node, dx, dy, distance: Math.hypot(dx, dy),
        magnitude: node.matches('.jw-roll-glyph svg') ? 12 :
                   node === subtitle ? 9 : 7,
      };
    });

    const started = performance.now();
    const tick = now => {
      const age = Math.max(0, (now - started) / 1000);
      for (const item of targets.current) {
        if (!item.node.isConnected) continue;
        const arrival = age - item.distance / SPEED;
        let x = 0, y = 0;
        if (arrival > 0 && arrival < 1.75) {
          // Original About physics: fast impact, spring oscillation, decay.
          const wave = item.magnitude *
            (1 - Math.exp(-arrival * 24)) *
            Math.exp(-arrival * 3.1) *
            Math.sin(arrival * Math.PI * 2 / 0.48);
          x = wave * item.dx / (item.distance + 16);
          y = wave * item.dy / (item.distance + 16) * 0.65;
        }
        item.node.style.translate = `${x.toFixed(3)}px ${y.toFixed(3)}px`;
      }
      if ((now - started) < DURATION) {
        frame.current = requestAnimationFrame(tick);
      } else {
        stop();
      }
    };
    frame.current = requestAnimationFrame(tick);
  }, [homeRef, stop]);
}
