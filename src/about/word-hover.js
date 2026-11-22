/**
 * Pixel-accurate per-word texture ranges used by the original Three.js
 * About story. Text measurements are passed in so this stays headless and
 * independently testable in Node without a canvas or browser.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function wordRangesForLine(text, measureWidth, pad, boxWidth) {
  const ranges = [];
  for (const match of text.matchAll(/\S+/gu)) {
    const start = pad + measureWidth(text.slice(0, match.index));
    const end = pad + measureWidth(
      text.slice(0, match.index + match[0].length)
    );
    ranges.push({
      word: match[0],
      u0: clamp((start - 2) / boxWidth, 0, 1),
      u1: clamp((end + 2) / boxWidth, 0, 1),
    });
  }
  return ranges;
}

export function hoveredWordAtUV(ranges, u, v) {
  if (!Number.isFinite(u) || !Number.isFinite(v) ||
      v < .18 || v > .82) return null;
  return ranges.find(range => u >= range.u0 && u <= range.u1) ?? null;
}
