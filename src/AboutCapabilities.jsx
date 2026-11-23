import React, { useEffect, useRef } from 'react';
import {
  ABOUT_CAPABILITIES, CAPABILITY_DIRECTIONS, CAPABILITY_STARTS, marqueeOffset,
} from './about/capability-motion.js';
import './AboutCapabilities.css';

const rotate = start => [
  ...ABOUT_CAPABILITIES.slice(start), ...ABOUT_CAPABILITIES.slice(0, start),
];

export default function AboutCapabilities() {
  const sectionRef = useRef(null);
  const tracks = useRef([]);
  const segments = useRef([]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let disposed = false;
    const segmentWidths = [];
    const positionRows = () => {
      frame = 0;
      if (disposed) return;
      const rect = section.getBoundingClientRect();
      // Outside the viewport, keep the previous pose rather than forcing
      // five wide rows to repaint for every unrelated Home/Projects swipe.
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;
      // Seek by native scroll position; reversing scroll reverses every row.
      const scrollDistance = Math.max(0, Math.min(
        rect.height + window.innerHeight, window.innerHeight - rect.top,
      ));
      tracks.current.forEach((track, index) => {
        const segment = segments.current[index];
        if (!track || !segment) return;
        const width = segmentWidths[index] ||
          segment.getBoundingClientRect().width;
        const x = marqueeOffset(reduced.matches ? 0 : scrollDistance,
          width, CAPABILITY_DIRECTIONS[index]);
        track.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
      });
    };
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(positionRows);
    };
    const measureSegments = () => {
      segments.current.forEach((segment, index) => {
        if (segment)
          segmentWidths[index] = segment.getBoundingClientRect().width;
      });
      schedule();
    };
    const observer = new ResizeObserver(measureSegments);
    observer.observe(section);
    segments.current.forEach(segment => {
      if (segment) observer.observe(segment);
    });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    reduced.addEventListener?.('change', schedule);
    document.fonts?.ready.then(measureSegments);
    measureSegments();
    positionRows();
    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      reduced.removeEventListener?.('change', schedule);
    };
  }, []);

  return (
    <section id="about-capabilities" ref={sectionRef}
      className="jw-about-capabilities" aria-labelledby="jw-about-capabilities-title">
      <h3 id="jw-about-capabilities-title" className="jw-about-capabilities__sr-only">
        My creative capabilities
      </h3>
      <p className="jw-about-capabilities__sr-only">
        {ABOUT_CAPABILITIES.join(' • ')}
      </p>
      <div className="jw-about-capabilities__rows" aria-hidden="true">
        {CAPABILITY_DIRECTIONS.map((direction, row) => {
          const words = rotate(CAPABILITY_STARTS[row]);
          return (
            <div className="jw-about-capabilities__row" key={row}
              data-direction={direction === -1 ? 'left' : 'right'}>
              <div className="jw-about-capabilities__track"
                ref={node => { tracks.current[row] = node; }}>
                {[0, 1, 2].map(copy => (
                  <div className="jw-about-capabilities__segment" key={copy}
                    ref={copy === 1 ? node => { segments.current[row] = node; } : undefined}>
                    {words.map((word, index) => (
                      <React.Fragment key={word + index}>
                        <span className="jw-about-capabilities__phrase">{word}</span>
                        <span className="jw-about-capabilities__dot">•</span>
                      </React.Fragment>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
