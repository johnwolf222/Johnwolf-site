/**
 * Gallery-only interaction math. The seven approved sheets keep their
 * established 3D positions; these helpers move the focus continuously
 * around their circular index space without duplicating or swapping art.
 */
export const PROJECT_LOOP_COUNT = 7;
export const PROJECT_LOOP_SPEED = .64; // cards per second, constant after swipe

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

export function advanceGalleryFocus(focus, direction, dt,
  speed = PROJECT_LOOP_SPEED, count = PROJECT_LOOP_COUNT) {
  // A backgrounded tab must not leap forward on its first visible frame.
  const seconds = Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
  return wrapGalleryFocus(focus + Math.sign(direction) *
    seconds * speed, count);
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
