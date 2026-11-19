/**
 * Gallery-only interaction math. The seven approved sheets keep their
 * established 3D positions. Each gesture advances ONE project and settles;
 * indices wrap infinitely without automatic motion or duplicated artwork.
 */
export const PROJECT_LOOP_COUNT = 7;

export function wrapGalleryFocus(focus, count = PROJECT_LOOP_COUNT) {
  if (!Number.isFinite(focus) || count <= 0) return 0;
  return ((focus % count) + count) % count;
}

export function wrappedGalleryDistance(index, focus,
  count = PROJECT_LOOP_COUNT) {
  let distance = index - wrapGalleryFocus(focus, count);
  while (distance > count / 2) distance -= count;
  while (distance < -count / 2) distance += count;
  return distance;
}

export function nearestGalleryIndex(focus, count = PROJECT_LOOP_COUNT) {
  return Math.round(wrapGalleryFocus(focus, count)) % count;
}

export function stepGalleryFocus(focus, direction,
  count = PROJECT_LOOP_COUNT) {
  // One swipe = exactly one neighboring card, even if the previous
  // settling animation was interrupted halfway through.
  return wrapGalleryFocus(nearestGalleryIndex(focus, count) +
    Math.sign(direction), count);
}

export function dragGalleryFocus(start, deltaX, spacing,
  count = PROJECT_LOOP_COUNT) {
  return wrapGalleryFocus(start - deltaX / Math.max(1, spacing), count);
}

// At the ±3.5-card wrap seam, both sides are already outside the frame.
// Fade the last few offscreen pixels so a sheet never pops across edges.
export function gallerySeamOpacity(distance, count = PROJECT_LOOP_COUNT) {
  const t = Math.max(0, Math.min(1,
    (count / 2 - Math.abs(distance)) / .4));
  return t * t * (3 - 2 * t);
}
