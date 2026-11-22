import React from 'react';

/**
 * Every word gets its own non-interactive highlight target without changing
 * spaces, punctuation, text content, font metrics, or the original copy.
 * 3D story planes use the matching word ranges in floating-story.js.
 */
export default function WordHighlight({ children }) {
  if (typeof children !== 'string') return children;
  return children.split(/(\s+)/u).map((part, index) =>
    /\S/u.test(part)
      ? <span className="jw-hover-word" key={index}>{part}</span>
      : part
  );
}
