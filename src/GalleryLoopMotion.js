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

/** Section 2 is one resting viewport; landing is a finite scroll snap. */
export const GALLERY_LANDING_VH = .10;

export function galleryRestScrollY(sectionTop, viewportHeight) {
  return sectionTop + viewportHeight * GALLERY_LANDING_VH;
}

export function shouldAutoLand(phase, previousY, currentY, state,
  trainStart = .89, trainEnd = .99) {
  return state === 'idle' && phase >= trainStart &&
    phase < trainEnd && Number.isFinite(previousY) &&
    currentY > previousY + .5;
}

export function galleryExitFade(scrollY, sectionTop, sectionHeight,
  viewportHeight) {
  const start = sectionTop + sectionHeight - viewportHeight * .54;
  const span = Math.max(1, viewportHeight * .43);
  const t = Math.max(0, Math.min(1, (scrollY - start) / span));
  return 1 - t * t * (3 - 2 * t);
}
