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

/**
 * A trackpad emits many tiny deltas and a long decaying momentum tail.
 * Accumulate the tiny deltas rather than discarding them. Trigger exactly
 * once per gesture, but re-arm immediately for a genuine direction reversal,
 * a fresh acceleration after the momentum has slowed, or a quiet gap.
 * No fixed timeout lock: quick successive swipes are never discarded merely
 * because the previous gesture is still sending residual events.
 */
export function initialGalleryWheelState() {
  return {
    lastAt: -Infinity, total: 0, fired: false, direction: 0,
    previous: 0, peak: 0, quiet: false, riseStreak: 0,
    triggerAt: -Infinity,
  };
}

export function galleryWheelGesture(state, deltaX, deltaY, now) {
  const prior = state || initialGalleryWheelState();
  if (![deltaX, deltaY, now].every(Number.isFinite))
    return { state: prior, step: 0 };
  const magnitude = Math.abs(deltaX);
  // Treat modest diagonal motion as horizontal, but leave actual vertical
  // scrolling to the existing About transition.
  if (magnitude < .2 || magnitude < Math.abs(deltaY) * .95)
    return { state: prior, step: 0 };

  const sign = Math.sign(deltaX);
  const idle = now - prior.lastAt > 145 || now < prior.lastAt;
  const reversed = prior.fired && sign !== prior.direction &&
    magnitude >= 1.5;
  const slowed = prior.quiet ||
    (prior.fired && prior.previous <= Math.max(3, prior.peak * .18));
  // A single late momentum packet may jump in magnitude. Require two
  // consecutive accelerations to distinguish a NEW swipe from that noise.
  const rising = magnitude >= 2 &&
    magnitude >= prior.previous * 1.4 &&
    magnitude > prior.previous + 1.5
    ? prior.riseStreak + 1 : 0;
  const newImpulse = prior.fired && slowed &&
    now - prior.triggerAt >= 85 && magnitude >= 5 &&
    rising >= 2;
  const reset = idle || reversed || newImpulse;
  const next = reset ? initialGalleryWheelState() : { ...prior };
  next.lastAt = now;
  next.quiet = reset ? false : slowed;
  next.previous = magnitude;
  next.peak = Math.max(next.peak, magnitude);
  next.riseStreak = reset ? 0 : rising;

  if (next.fired) return { state: next, step: 0 };
  // Accumulate small events, including subpixel trackpad movement.
  // A single wheel notch (often deltaMode=line) can also fire immediately.
  next.total += deltaX;
  // Low threshold means the first two or three small trackpad events
  // start the card immediately, instead of accumulating a visible pause.
  if (Math.abs(next.total) < 4) return { state: next, step: 0 };
  next.fired = true;
  next.direction = Math.sign(next.total);
  next.triggerAt = now;
  return { state: next, step: next.direction };
}

/**
 * A horizontal swipe often includes a few tiny positive Y deltas.
 * Only a deliberate, sustained downward gesture may leave the gallery.
 * Mouse wheel notches still pass in one event; trackpad deltas accumulate.
 */
export function initialGalleryVerticalState() {
  return { lastAt: -Infinity, total: 0 };
}

export function galleryVerticalExitGesture(state, deltaX, deltaY, now) {
  const prior = state || initialGalleryVerticalState();
  if (![deltaX, deltaY, now].every(Number.isFinite) ||
      deltaY <= 0 || deltaY <= Math.abs(deltaX) * 1.25)
    return { state: initialGalleryVerticalState(), exit: false };
  const reset = now - prior.lastAt > 150 || now < prior.lastAt;
  const next = reset ? initialGalleryVerticalState() : { ...prior };
  next.lastAt = now;
  next.total += deltaY;
  return { state: next, exit: next.total >= 26 };
}

/**
 * Snap duration for a direct, interruptible card carousel. A normal
 * one-card step settles in roughly a quarter-second rather than the old
 * .42s (or .82s for successive gestures during an active animation).
 * Very short corrections are faster; a multi-card target remains bounded.
 */
export function gallerySnapDuration(distance) {
  const d = Math.abs(Number.isFinite(distance) ? distance : 0);
  return Math.max(.14, Math.min(.28, .14 + d * .09));
}

/**
 * Release a direct drag based on distance OR a quick flick. A fast short
 * flick should count even when no extra pointermove arrived before release.
 * Diagonal/vertical gestures never change cards.
 */
export function gallerySwipeDirection(dx, dy, velocityX = 0, cancelled = false) {
  if (cancelled || ![dx, dy, velocityX].every(Number.isFinite))
    return 0;
  if (Math.abs(dx) <= Math.abs(dy) * .9) return 0;
  if (Math.abs(dx) >= 16 ||
      (Math.abs(dx) >= 6 && Math.abs(velocityX) >= .3))
    return dx < 0 ? 1 : -1;
  return 0;
}
