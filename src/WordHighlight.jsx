import React from 'react';
import {centeredHeadWordParts} from './about/head-word-split.js';

/**
 * Every word gets its own non-interactive highlight target without changing
 * spaces, punctuation, text content, font metrics, or the original copy.
 * 3D story planes use the matching word ranges in floating-story.js.
 */
export default function WordHighlight({ children, headSplit = false }) {
  if (typeof children !== 'string') return children;
  return children.split(/(\s+)/u).map((part, index) => {
    if (!/\S/u.test(part)) return part;
    const halves = headSplit ? centeredHeadWordParts(part) : null;
    if (!halves) return <span className="jw-hover-word" key={index}>{part}</span>;
    // Both inline halves concatenate to the ORIGINAL word, so the desktop
    // typography, source text, selection and 3D transcription are preserved.
    return <span className="jw-hover-word jw-head-splittable" key={index}>
      <span className="jw-head-word-first">{halves[0]}</span><span className="jw-head-word-last">{halves[1]}</span>
    </span>;
  });
}
