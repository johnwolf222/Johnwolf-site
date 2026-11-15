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
      const floats = [];
      CARDS.forEach((card, i) => {
        const node = items.current[i];
        const inner = interiors.current[i];
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
        // Subtle independent floating survives while scroll is stationary.
        floats.push(gsap.to(inner, {
          y: i % 2 ? 7 : -8,
          rotation: i % 3 ? -1.7 : 1.9,
          duration: 2.5 + (i % 4) * 0.54,
          repeat: -1, yoyo: true,
          ease: 'sine.inOut',
          delay: i * 0.09,
        }));
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
        floats.forEach(tween => tween.kill());
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