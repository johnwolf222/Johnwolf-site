/**
 * Twenty-one solid paper sheets on one evenly spaced 3D current.
 * The seven featured projects peel left, clear the viewport, and return
 * together as a consistently spaced train to their approved gallery slots.
 * Deterministic in either scroll direction; no animation-side state.
 */
export const CAMERA_DESCENT = .36;
export const TRAIN_START = .765;
export const TRAIN_END = .99;
const TAU = Math.PI * 2;
const FEATURED_INDICES = [8, 6, 4, 10, 1, 0, 9];
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (x, a, b) => {
  const t = clamp((x - a) / Math.max(.000001, b - a));
  return t * t * (3 - 2 * t);
};
const smoother = t => {
  const x = clamp(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
const quintic = (p, t) => {
  const s = 1 - t;
  return s ** 5 * p[0] + 5 * s ** 4 * t * p[1] +
    10 * s ** 3 * t * t * p[2] + 10 * s * s * t ** 3 * p[3] +
    5 * s * t ** 4 * p[4] + t ** 5 * p[5];
};

// In an ellipse, equal angular gaps are NOT equal distances. Invert the
// measured perimeter so all 21 cards have equal center-to-center spacing.
let arcCache;
function arcAngle(fraction, a, b) {
  const key = a + ':' + b;
  if (!arcCache || arcCache.key !== key) {
    const samples = 384;
    const cumulative = [0];
    let x = a, y = 0;
    for (let i = 1; i <= samples; i++) {
      const theta = i * TAU / samples;
      const nextX = a * Math.cos(theta);
      const nextY = b * Math.sin(theta);
      cumulative.push(cumulative[i - 1] + Math.hypot(nextX - x, nextY - y));
      x = nextX; y = nextY;
    }
    arcCache = { key, cumulative, samples,
      total: cumulative[samples] };
  }
  const wrapped = ((fraction % 1) + 1) % 1;
  const target = wrapped * arcCache.total;
  let lo = 0, hi = arcCache.samples;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arcCache.cumulative[mid] < target) lo = mid;
    else hi = mid;
  }
  const before = arcCache.cumulative[lo];
  const after = arcCache.cumulative[hi];
  return (lo + (target - before) / Math.max(1e-8, after - before)) *
    TAU / arcCache.samples;
}

function orbitAt(phase, slot, width, height) {
  const radiusX = Math.min(width * .37, 500);
  const radiusY = Math.min(height * .35, 265);
  const growth = smoother((phase - .285) / .145);
  const orbitClock = (phase - .285) / (.69 - .285);
  const angle = arcAngle(slot / 21 + .90 * orbitClock,
    radiusX, radiusY);
  const x = radiusX * growth * Math.cos(angle);
  const y = radiusY * growth * Math.sin(angle);
  return {
    x, y, z: mix(-690, -370, smooth(phase, .29, .60)),
    scale: mix(.16, .31, smooth(phase, .30, .45)),
    rx: 12 * Math.sin(angle + slot * .21) * growth,
    ry: 23 * Math.cos(angle) * growth,
    rz: 11 * Math.sin(angle + .4) * growth,
    angle,
  };
}

function orbitSlot(index, rank) {
  if (rank >= 0) return rank;
  const featuredBefore = FEATURED_INDICES.filter(i => i < index).length;
  return 7 + index - featuredBefore;
}

export function galleryRowOffset(width, height) {
  // Leave a full-height, unobstructed footer for the gallery arrows/dots.
  // The artwork is placed by its actual maximum rendered paper width.
  const paperWidth = width <= 800 ?
    Math.min(width * .55, 285) : Math.min(width * .26, 370);
  return Math.min(height * .235,
    height * .5 - paperWidth * .5 - 110);
}

export function galleryCameraProgress(phase) {
  return smooth(phase, .34, .895);
}

export function spiralGalleryPose(phase, index, rank, width, height, target) {
  const slot = orbitSlot(index, rank);
  const isFeatured = rank >= 0;
  const exitStart = .61 + rank * .008;
  const cameraLift = height * CAMERA_DESCENT * galleryCameraProgress(phase);
  const orbit = orbitAt(phase, slot, width, height);
  let { x, y, z, scale, rx, ry, rz } = orbit;
  let settle = 0;
  let stage = 'spiral';

  if (isFeatured && phase > exitStart && phase < TRAIN_START) {
    // Peel left in the SAME orbit tangent, then bend into a shared row
    // outside the viewport. All seven are offscreen before returning.
    const duration = TRAIN_START - exitStart;
    const v = clamp((phase - exitStart) / duration);
    const origin = orbitAt(exitStart, slot, width, height);
    const previous = orbitAt(exitStart - .00001, slot, width, height);
    const tangent = key =>
      (origin[key] - previous[key]) / .00001 * duration / 5;
    const offset = width * 1.55 + 60;
    const rowY = target.y + height * CAMERA_DESCENT;
    const stageX = target.x - offset;
    const stageY = rowY + height * .065;
    const stageZ = target.z - 160;
    x = quintic([origin.x, origin.x + tangent('x'),
      Math.min(origin.x - width * .22, stageX + width * .25),
      stageX + width * .06, stageX, stageX], v);
    y = quintic([origin.y, origin.y + tangent('y'),
      origin.y + height * .09 + (rank - 3) * height * .035,
      stageY + height * .025, stageY, stageY], v);
    z = quintic([origin.z, origin.z + tangent('z'),
      mix(origin.z, stageZ, .3), stageZ, stageZ, stageZ], v);
    const eased = smoother(v);
    scale = mix(origin.scale, target.scale * .72, eased);
    rx = mix(origin.rx, 0, eased);
    ry = mix(origin.ry, target.ry * .65, eased);
    rz = mix(origin.rz, 0, eased);
    stage = 'swirl-left';
  } else if (isFeatured && phase >= TRAIN_START) {
    // One shared horizontal translation: spacing is IDENTICAL for every
    // featured sheet throughout the entire return, not only at landing.
    const t = smoother((phase - TRAIN_START) /
      (TRAIN_END - TRAIN_START));
    const offset = width * 1.55 + 60;
    const rowY = target.y + height * CAMERA_DESCENT;
    x = target.x - offset * (1 - t);
    y = rowY + height * .065 * (1 - t);
    z = target.z - 160 * (1 - t);
    scale = target.scale * mix(.72, 1, t);
    rx = 0;
    ry = target.ry * mix(.65, 1, t);
    rz = 0;
    settle = t;
    stage = phase >= TRAIN_END ? 'gallery' : 'train-to-row';
  }

  const emergence = smooth(phase, .295, .40);
  const opacity = isFeatured
    ? emergence * mix(1, target.opacity, smooth(phase, .955, TRAIN_END))
    : emergence * (1 - smooth(phase, .70, .845));
  // The front-side sheet is genuinely opaque: the head mask only applies
  // to sheets passing BEHIND the head, never to the train crossing in front.
  const front = isFeatured && phase > exitStart ||
    (Math.sin(orbit.angle) > .10 && phase > .40);
  return {
    x, y: y - cameraLift, z, scale, rx, ry, rz,
    opacity, front, settle, start: .285, end: TRAIN_END,
    u: clamp((phase - .285) / (TRAIN_END - .285)), stage,
  };
}
