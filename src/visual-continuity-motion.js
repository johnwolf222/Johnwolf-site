/** Smoothly reveal the one shared purple field AFTER the white homepage. */
export function sharedGlowReveal(workTop, viewportHeight) {
  if (!Number.isFinite(workTop) || !Number.isFinite(viewportHeight) ||
      viewportHeight <= 0) return 0;
  const t = Math.max(0, Math.min(1,
    (viewportHeight * .9 - workTop) / (viewportHeight * .75)));
  return t * t * (3 - 2 * t);
}
