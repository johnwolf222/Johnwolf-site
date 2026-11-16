import React from 'react';
import './PaperSurface.css';

// One artwork, one persistent card element. Eleven linked strips approximate
// the bendable surface from the original Hole 01 geometry without a second
// WebGL context (the approved GLB head retains its own renderer).
export const PAPER_STRIPS = 11;

const SECTIONS = Array.from({ length: PAPER_STRIPS }, (_, index) => ({
  index,
  left: (index / PAPER_STRIPS * 100) + '%',
  width: (100 / PAPER_STRIPS) + '%',
  position: (index / (PAPER_STRIPS - 1) * 100) + '% 50%',
}));

export default function PaperSurface({ src }) {
  return (
    <div className="jw-paper-sheet" aria-hidden="true">
      <img className="jw-paper-sheet__fallback" src={src}
        alt="" draggable="false" loading="eager" decoding="async" />
      <div className="jw-paper-sheet__ribbon">
        {SECTIONS.map(panel => (
          <span
            key={panel.index}
            className="jw-paper-sheet__strip"
            data-strip={panel.index}
            style={{
              left: panel.left,
              width: panel.width,
              backgroundImage: 'url("' + src + '")',
              backgroundPosition: panel.position,
              backgroundSize: (PAPER_STRIPS * 100) + '% 100%',
            }}
          />
        ))}
      </div>
    </div>
  );
}
