/**
 * Small, deterministic mobile About interaction helpers.
 * No scroll preventDefault or model-specific state lives here.
 */
export function isMobileHeadTap(startX, startY, endX, endY, tolerance = 16) {
  return [startX, startY, endX, endY, tolerance].every(Number.isFinite) &&
    tolerance >= 0 && Math.hypot(endX - startX, endY - startY) <= tolerance;
}

export function centeredToolScrollLeft(offsetLeft, itemWidth,
  viewportWidth, maximumScrollLeft) {
  if (![offsetLeft, itemWidth, viewportWidth, maximumScrollLeft]
    .every(Number.isFinite)) return 0;
  const target = offsetLeft + itemWidth / 2 - viewportWidth / 2;
  return Math.max(0, Math.min(Math.max(0, maximumScrollLeft), target));
}
