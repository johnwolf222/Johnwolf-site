/**
 * Projects → About uses ONE scroll coordinate for the original seven sheets,
 * the existing approved Candidate F head, and the original About headline.
 * All three are seekable and reverse perfectly, with no new scene/model.
 */
const clamp = (v, a = 0, b = 1) =>
  Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
const ease = t => { const x = clamp(t); return x * x * (3 - 2 * x); };
const smoother = t => {
  const x = clamp(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
const mix = (a, b, t) => a + (b - a) * t;

// Start exactly at the Gallery's .10vh resting anchor, not a dead zone
// 20% into the next scrolling gesture. Finish at the top of Section 3.
export function aboutHandoffProgress(scrollY, galleryTop, galleryHeight, viewportHeight) {
  const start = galleryTop + viewportHeight * .10;
  const end = galleryTop + galleryHeight;
  return clamp((scrollY - start) / Math.max(1, end - start));
}

// The seven existing 3D sheets move as a coordinated stream, not scattered
// particles. The short stagger is intentionally subtle (six ranks × 0.6%).
// The physical exit is long enough to clear the leftmost side card, but no
// longer than needed: the previous 2.75vw+550 move looked like a sudden whip.
export function departingCardOffset(progress, rank, width, height) {
  const p = clamp(progress);
  if (rank < 0) return {
    x: 0, y: 0, ry: 0, opacity: 1 - ease((p - .96) / .04),
  };
  const delay = rank * .006;
  const t = smoother((p - delay) / (1 - delay));
  return {
    x: (width * 1.90 + 550) * t,
    y: -height * .055 * t,
    ry: -11 * t,
    // No visible dissolve. Cards disappear only after leaving the frame.
    opacity: 1 - ease((t - .98) / .02),
  };
}

// One continuous, non-linear head movement with zero initial/final speed.
// It lands in the original Design Is Life CENTER, exactly as the original
// About typography expects. There is no second renderer or GLB.
export function aboutHeadPose(progress, galleryPose, width, height) {
  const t = smoother(progress);
  const desktop = width > 800;
  return {
    x: 0,
    shift: mix(galleryPose.shift, desktop ? 20 : Math.min(height * .26, 220), t),
    scale: mix(galleryPose.scale, desktop ? .92 : .90, t),
  };
}

// The original About opener enters organically from below only once the
// rightward cards have mostly cleared the reading area.
export function aboutIntroPose(progress, viewportHeight) {
  const appear = ease((clamp(progress) - .54) / .37);
  return {
    opacity: appear,
    lift: Math.min(80, viewportHeight * .09) * (1 - smoother(appear)),
  };
}

// Keep the approved GLB through the whole long-form story. Only at Contact
// does it leave, with the same deterministic inverse while reverse scrolling.
export function aboutHeadOpacity(scrollY, aboutBottom, viewportHeight) {
  const start = aboutBottom - viewportHeight * .56;
  const end = aboutBottom - viewportHeight * .08;
  return 1 - ease((scrollY - start) / Math.max(1, end - start));
}

/**
 * The existing fixed GLB glides LEFT while the final About tool viewport
 * enters the screen. Scroll reversal seeks the exact same head position;
 * no second head/portrait/canvas is created.
 */
export function aboutToolsHeadBlend(scrollY, toolsTop, viewportHeight) {
  if (!Number.isFinite(toolsTop)) return 0;
  const start = toolsTop - viewportHeight * .86;
  const end = toolsTop - viewportHeight * .06;
  return ease((scrollY - start) / Math.max(1, end - start));
}

export function aboutToolsHeadOffset(progress, viewportWidth) {
  const slide = viewportWidth <= 600 ? .27 : .31;
  return -viewportWidth * slide * clamp(progress);
}
