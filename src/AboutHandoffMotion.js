/**
 * The Projects → About transition is one continuous, reversible function of
 * native scroll. It never swaps cards, recreates the 3D head, or edits Home.
 */
const clamp = (v, a = 0, b = 1) =>
  Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
const ease = t => { const x = clamp(t); return x * x * (3 - 2 * x); };
const mix = (a, b, t) => a + (b - a) * t;

// Gallery is stationary at its .10vh landing. The last .70 viewport of
// Section 2 becomes a visible, scroll-seekable departure into About.
export function aboutHandoffProgress(scrollY, galleryTop, galleryHeight, viewportHeight) {
  const end = galleryTop + galleryHeight;
  const start = end - viewportHeight * .70;
  return ease((scrollY - start) / Math.max(1, end - start));
}

// Exactly the original seven featured sheets sweep RIGHT, retaining their
// natural texture, perspective, and order. The fourteen nonfeatured Home
// sheets remain offscreen left and can never accidentally cross the page.
export function departingCardOffset(progress, rank, width, height) {
  const p = clamp(progress);
  if (rank < 0) return {
    x: 0, y: 0, ry: 0, opacity: 1 - ease((p - .95) / .05),
  };
  const delay = rank * .012;
  const t = ease((p - delay) / (1 - delay));
  return {
    x: (width * 2.75 + 550) * t,
    y: -height * .07 * t,
    ry: -14 * t,
    // Cards stay fully opaque until their rightward exit has cleared
    // even the widest perspective-rotated sheet.
    opacity: 1 - ease((t - .96) / .04),
  };
}

// The ONE Candidate F GLB moves down into the original centered Design Is
// Life composition. Keep the artboard centered for its 3D story text planes.
export function aboutHeadPose(progress, galleryPose, width, height) {
  const t = ease(progress);
  const desktop = width > 800;
  return {
    x: 0,
    shift: mix(galleryPose.shift, desktop ? 20 : Math.min(height * .26, 220), t),
    scale: mix(galleryPose.scale, desktop ? .92 : .90, t),
  };
}

// Keep the approved GLB alive all the way through About. Only when the
// visitor approaches Contact do we clear the fixed head; reverse scroll
// restores exactly the same pose and visibility.
export function aboutHeadOpacity(scrollY, aboutBottom, viewportHeight) {
  const start = aboutBottom - viewportHeight * .56;
  const end = aboutBottom - viewportHeight * .08;
  return 1 - ease((scrollY - start) / Math.max(1, end - start));
}
