import { useCallback, useEffect, useRef } from 'react';

// A soft, elastic ripple that travels OUTWARD through the letters rather than
// shaking them in place. Individual CSS translate/rotate/scale properties leave
// GSAP's locked transform-based title roll and subtitle reveal untouched.
const TITLE_INK_LEFT = [107, 137, 180, 158, 86, 163, 216];
const SPEED = 790;      // Traveling wave front (pixels per second).
const CREST = 0.94;    // One broad, flexible outward bend.
const RETURN = 0.70;   // One small, gentle elastic rebound; no rapid oscillation.
const SETTLE = CREST + RETURN;

// Smooth single-crest pulse followed by a quiet undershoot. A high-frequency
// sine gave the old effect a shaky appearance; this produces a fluid flex.
const sampleRipple = arrival => {
  if (arrival <= 0 || arrival >= SETTLE) return 0;
  if (arrival < CREST) {
    return Math.pow(Math.sin(Math.PI * arrival / CREST), 1.32);
  }
  return -0.13 * Math.sin(Math.PI * (arrival - CREST) / RETURN);
};

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
      if (!node.isConnected) continue;
      node.style.translate = '';
      node.style.rotate = '';
      node.style.scale = '';
      node.style.transformOrigin = '';
      if (node instanceof SVGElement) node.style.transformBox = '';
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
      const distance = Math.hypot(dx, dy);
      const isTitle = node.matches('.jw-roll-glyph svg');
      const isSubtitle = node === subtitle;
      // Rotate/expand around the visible ink, not the subtitle's 1440x810
      // transparent artboard. Keep the original letter geometry untouched.
      if (isSubtitle) {
        const box = node.getBoundingClientRect();
        node.style.transformOrigin =
          `${(center.x - box.left).toFixed(2)}px ${(center.y - box.top).toFixed(2)}px`;
      } else {
        node.style.transformOrigin = '50% 50%';
      }
      if (node instanceof SVGElement) node.style.transformBox = 'fill-box';
      return {
        node, dx, dy, distance,
        ux: dx / Math.max(16, distance),
        uy: dy / Math.max(16, distance),
        magnitude: isTitle ? 23 : isSubtitle ? 13 : 10,
        stretch: isTitle ? 0.09 : isSubtitle ? 0.055 : 0.045,
        bend: isTitle ? 3.6 : isSubtitle ? 1.8 : 1.5,
      };
    });

    const started = performance.now();
    const maxDistance = Math.max(0, ...targets.current.map(item => item.distance));
    const durationMs = (maxDistance / SPEED + SETTLE + 0.06) * 1000;
    const tick = now => {
      const age = Math.max(0, (now - started) / 1000);
      for (const item of targets.current) {
        if (!item.node.isConnected) continue;
        const flex = sampleRipple(age - item.distance / SPEED);
        const outward = item.magnitude * flex;
        // A connected elastic sheet: the crest bends, elongates and eases back
        // as it travels. The slight tangential lift makes it a wave, not a shake.
        const x = outward * item.ux - 1.5 * flex * item.uy;
        const y = outward * item.uy * 0.74 + 1.3 * flex * item.ux;
        const angle = item.bend * flex * (item.ux >= 0 ? 1 : -1);
        const sx = 1 + item.stretch * flex;
        const sy = 1 - item.stretch * 0.56 * flex;
        item.node.style.translate = `${x.toFixed(3)}px ${y.toFixed(3)}px`;
        item.node.style.rotate = `${angle.toFixed(3)}deg`;
        item.node.style.scale = `${sx.toFixed(4)} ${sy.toFixed(4)}`;
      }
      if ((now - started) < durationMs) {
        frame.current = requestAnimationFrame(tick);
      } else {
        stop();
      }
    };
    frame.current = requestAnimationFrame(tick);
  }, [homeRef, stop]);
}
