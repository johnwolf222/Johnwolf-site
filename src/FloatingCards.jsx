import React, { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './FloatingCards.css';

gsap.registerPlugin(ScrollTrigger);

// Exact silhouettes separated from the user's "Animated cards (place holder)"
// artwork. The 540 x 303 source is aligned to the 16:9 homepage artboard.
const CARDS = [
  { id: 1, x: 168, y: 3, w: 59, h: 65 },
  { id: 2, x: 392, y: 49, w: 39, h: 47 },
  { id: 3, x: 289, y: 56, w: 51, h: 45 },
  { id: 4, x: 78, y: 84, w: 32, h: 47 },
  { id: 5, x: 0, y: 115, w: 26, h: 65 },
  { id: 6, x: 496, y: 129, w: 44, h: 64 },
  { id: 7, x: 345, y: 153, w: 68, h: 60 },
  { id: 8, x: 153, y: 166, w: 64, h: 63 },
  { id: 9, x: 276, y: 209, w: 46, h: 30 },
  { id: 10, x: 357, y: 274, w: 55, h: 29 },
  { id: 11, x: 212, y: 281, w: 50, h: 22 },
  { id: 12, x: 83, y: 283, w: 42, h: 20 },
];

// Six fully visible, identifiable cards enter the selected-work gallery.
// The remaining decorative edge cards disperse as the section changes.
const GALLERY_ORDER = [1, 3, 7, 8, 2, 4];

export default function FloatingCards() {
  const root = useRef(null);
  const items = useRef([]);
  const interiors = useRef([]);

  useLayoutEffect(() => {
    const home = document.querySelector('#home');
    const work = document.querySelector('#work');
    const board = document.querySelector('.jw-new-home__artboard');
    if (!home || !work || !board || !items.current.every(Boolean)) return undefined;

    const media = gsap.matchMedia();

    const layout = card => {
      // Compensate for the original SVG's 1.78 artboard-unit left offset.
      const rect = board.getBoundingClientRect();
      const scale = rect.width / 540;
      return {
        x: rect.left + (card.x - 0.667) * scale,
        y: rect.top + window.scrollY + card.y * scale,
        width: card.w * scale,
        height: card.h * scale,
      };
    };

    const destination = card => {
      const slot = GALLERY_ORDER.indexOf(card.id);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (slot >= 0) {
        const mobile = vw <= 700;
        const columns = mobile ? 2 : 3;
        const xs = mobile ? [0.275, 0.725] : [0.235, 0.5, 0.765];
        const ys = mobile ? [0.38, 0.60, 0.81] : [0.47, 0.77];
        const col = slot % columns;
        const row = Math.floor(slot / columns);
        const wLimit = mobile ? Math.min(vw * 0.37, 158) : Math.min(vw * 0.24, 225);
        const hLimit = mobile ? Math.min(vh * 0.18, 138) : Math.min(vh * 0.24, 185);
        const size = Math.min(wLimit / card.w, hLimit / card.h);
        const width = card.w * size;
        const height = card.h * size;
        return {
          x: xs[col] * vw - width / 2,
          y: ys[row] * vh - height / 2,
          width,
          height,
          rotation: (slot % 2 ? -1 : 1) * (slot % 3 + 1) * 2.5,
          opacity: 1,
          scale: 1,
        };
      }
      // Small cropped border cards peel away rather than becoming awkward
      // enlarged fragments of a project image in the actual gallery.
      const from = layout(card);
      const direction = from.x + from.width / 2 < vw / 2 ? -1 : 1;
      return {
        x: from.x + direction * vw * 0.68,
        y: from.y + (card.id % 2 ? -1 : 1) * vh * 0.24,
        width: from.width,
        height: from.height,
        rotation: direction * 28,
        opacity: 0,
        scale: 0.70,
      };
    };

    media.add('(prefers-reduced-motion: no-preference)', () => {
      const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' } });
      CARDS.forEach((card, i) => {
        const node = items.current[i];
        tl.fromTo(node,
          {
            x: () => layout(card).x,
            y: () => layout(card).y,
            width: () => layout(card).width,
            height: () => layout(card).height,
            rotation: 0,
            opacity: 1,
            scale: 1,
            immediateRender: true,
          },
          {
            x: () => destination(card).x,
            y: () => destination(card).y,
            width: () => destination(card).width,
            height: () => destination(card).height,
            rotation: () => destination(card).rotation,
            opacity: () => destination(card).opacity,
            scale: () => destination(card).scale,
            duration: 1,
            ease: 'power2.inOut',
          }, 0);
        // Each card's resting 3D motion is driven by one shared, continuous
        // phase below. It is independent of the scroll/position timeline.
        if (GALLERY_ORDER.includes(card.id)) {
          tl.to(node, {
            y: () => destination(card).y - window.innerHeight * 0.28,
            opacity: 0,
            scale: 0.86,
            duration: 0.29,
            ease: 'power2.in',
          }, 1.70);
        }
      });
      // Hole Zero One study: the moving cards occupy real-looking depth and
      // gently change attitude around a clear central opening. On HOME, only
      // a small drift/tilt/breath is active; the infinite orbit triggered by
      // scrolling is a later, separately approved phase.
      //
      // Use a continuous analytic phase rather than back-and-forth tweens.
      // Its smooth, unequal frequencies avoid the artificial synchronized
      // "ping-pong" look, while the source artwork stays pixel-identical.
      const startedAt = gsap.ticker.time;
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      let lastWeight = -1;
      let homeWeight = 1;
      const measureIdleWeight = () => {
        const y = Math.max(0, -home.getBoundingClientRect().top);
        const fraction = Math.min(1, y / Math.max(1, window.innerHeight * 0.62));
        // Fade resting movement away naturally as scroll takes control.
        homeWeight = 1 - fraction * fraction * (3 - 2 * fraction);
      };
      const tickIdle = time => {
        if (homeWeight <= 0 && lastWeight === 0) return;
        const elapsed = Math.max(0, time - startedAt);
        const ramp = Math.min(1, elapsed / 1.4);
        const weight = homeWeight * ramp * ramp * (3 - 2 * ramp);
        lastWeight = weight;
        const artScale = Math.min(3.1, board.getBoundingClientRect().width / 540);
        CARDS.forEach((card, i) => {
          const node = interiors.current[i];
          if (!node) return;
          const phase = i * goldenAngle;
          const omega = 2 * Math.PI / (6.8 + (i % 5) * 0.82);
          // An elliptical, slightly asymmetric float, with independent
          // pitch/yaw and depth breathing inspired by the source globe camera.
          const x = Math.sin(elapsed * omega + phase) * 4.8 * artScale * weight;
          const y = Math.cos(elapsed * omega * 0.83 + phase * 1.12) * 6.1 * artScale * weight;
          const z = Math.sin(elapsed * omega * 0.67 + phase * 1.47) * 20 * weight;
          const pitch = Math.sin(elapsed * omega * 0.76 + phase) * 4.3 * weight;
          const yaw = Math.cos(elapsed * omega * 0.63 + phase) * 6.0 * weight;
          const roll = Math.sin(elapsed * omega * 0.95 + phase * 1.2) * 2.0 * weight;
          const scale = 1 + Math.sin(elapsed * omega * 0.71 + phase) * 0.022 * weight;
          gsap.set(node, { x, y, z, rotationX: pitch, rotationY: yaw, rotationZ: roll, scale });
        });
      };
      const stopIdle = () => {
        gsap.ticker.remove(tickIdle);
        window.removeEventListener('scroll', measureIdleWeight);
        window.removeEventListener('resize', measureIdleWeight);
        gsap.set(interiors.current.filter(Boolean), { clearProps: 'transform' });
      };
      measureIdleWeight();
      gsap.ticker.add(tickIdle);
      window.addEventListener('scroll', measureIdleWeight, { passive: true });
      window.addEventListener('resize', measureIdleWeight, { passive: true });

      // At halfway through the total two-section scroll the cards occupy
      // their Selected Work positions. They remain there until work is leaving.
      tl.to({}, { duration: 0.99 }, 1);
      const st = ScrollTrigger.create({
        trigger: home,
        start: 'top top',
        endTrigger: work,
        end: 'bottom top',
        scrub: 0.85,
        animation: tl,
        invalidateOnRefresh: true,
      });
      return () => {
        st.kill();
        tl.kill();
        stopIdle();
      };
    });

    media.add('(prefers-reduced-motion: reduce)', () => {
      // Static, scroll-selectable arrangements for motion-sensitive viewers.
      const update = () => {
        const showWork = work.getBoundingClientRect().top < window.innerHeight * 0.55;
        CARDS.forEach((card, i) => {
          const homeRect = layout(card);
          const workRect = destination(card);
          gsap.set(items.current[i], showWork ? workRect : {
            ...homeRect, opacity: 1, rotation: 0, scale: 1,
          });
        });
      };
      const trigger = ScrollTrigger.create({
        trigger: home,
        start: 'top top',
        endTrigger: work,
        end: 'bottom top',
        onUpdate: update,
        onRefresh: update,
      });
      update();
      return () => trigger.kill();
    });

    return () => {
      media.revert();
    };
  }, []);

  return (
    <div className="jw-floating-card-stage" ref={root} aria-hidden="true">
      {CARDS.map((card, i) => (
        <div
          className="jw-floating-card"
          key={card.id}
          ref={node => { items.current[i] = node; }}
          style={{ opacity: 0 }}
        >
          <div className="jw-floating-card__drift" ref={node => { interiors.current[i] = node; }}>
            <img
              src={`/new-homepage/cards/card-${String(card.id).padStart(2, '0')}.svg`}
              alt=""
              draggable="false"
              loading="eager"
            />
          </div>
        </div>
      ))}
    </div>
  );
}