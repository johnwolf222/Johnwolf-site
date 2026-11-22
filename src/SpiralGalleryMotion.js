/**
 * One continuous, clockwise, arc-length-spaced stream of all 21 sheets.
 * Each card follows the lower tangent of the SAME ellipse, exits LEFT
 * without fading or breaking away, and clears the viewport completely.
 * Only after the entire procession is offscreen do the seven gallery
 * sheets execute their invisible U-turn and re-enter as a horizontal train.
 * All motion is scroll-seekable and reversible; Hole 01 is untouched.
 */
export const CAMERA_DESCENT = .36;
export const GALLERY_FOCAL = 1350;
export const UNWIND_START = .40;
export const OFFSCREEN_START = .82;
export const TRAIN_START = .89;
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

// Phone aspect ratios previously made the orbit taller than it was wide.
// Keep the desktop ellipse unchanged; mobile uses one shared physical radius.
export function galleryOrbitRadii(width, height) {
  if (width <= 700) {
    const radius = Math.min(width * .40, height * .35, 265);
    return { x: radius, y: radius };
  }
  return {
    x: Math.min(width * .37, 500),
    y: Math.min(height * .35, 265),
  };
}

function orbitAt(phase, slot, width, height) {
  const { x: radiusX, y: radiusY } = galleryOrbitRadii(width, height);
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

// One master track, not 21 individually timed peel-off animations.
// Increasing arc-length on screen (positive Y downward) is CLOCKWISE.
// At the ellipse's bottom, its tangent is already pointing LEFT.
export function clockwiseTrack(phase, slot, width, height) {
  if (phase <= UNWIND_START) {
    const early = orbitAt(phase, slot, width, height);
    return { ...early, exited: false, distance: null };
  }
  const { x: radiusX, y: radiusY } = galleryOrbitRadii(width, height);
  arcAngle(0, radiusX, radiusY);
  const perimeter = arcCache.total;
  const duration = OFFSCREEN_START - UNWIND_START;
  const elapsed = clamp(phase - UNWIND_START, 0, duration);
  // Match the original orbit's position AND velocity at the handoff.
  const startFraction = .90 * (UNWIND_START - .285) / (.69 - .285);
  const startingSpeed = perimeter * .90 / (.69 - .285);
  // Last sheet must pass the bottom and be fully left of the viewport.
  // All sheets retain their arc-length separation during the exit.
  const travelNeeded = perimeter * 1.01 + width * 1.1 + 220;
  const acceleration = (travelNeeded - startingSpeed * duration) /
    (duration * duration);
  const travel = startingSpeed * elapsed + acceleration * elapsed * elapsed;
  const distance = (slot / 21 + startFraction - 1) * perimeter + travel;
  const bottom = perimeter * .25;
  const beyondBottom = Math.max(0, distance - bottom);
  const exited = distance >= bottom;
  const angle = exited ? Math.PI / 2 :
    arcAngle(distance / perimeter, radiusX, radiusY);
  const growth = smoother((phase - .285) / .145);
  return {
    x: exited ? -beyondBottom * growth :
      radiusX * growth * Math.cos(angle),
    y: exited ? radiusY * growth :
      radiusY * growth * Math.sin(angle),
    z: mix(-690, -370, smooth(phase, .29, .60)),
    scale: mix(.16, .31, smooth(phase, .30, .45)),
    rx: 12 * Math.sin(angle + slot * .21) * growth,
    ry: 23 * Math.cos(angle) * growth,
    rz: 11 * Math.sin(angle + .4) * growth,
    angle, exited, distance,
  };
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

/**
 * The original GLB stays mounted in its single fixed body-level canvas.
 * Its artboard starts at viewport center on Home, follows the apparent
 * camera descent, then settles in a stable top-center gallery position.
 * No fade, duplicate head, reparenting or per-project repositioning.
 */
export function galleryHeadPlacement(phase, height, width = Infinity) {
  const cameraShift = -height * CAMERA_DESCENT *
    galleryCameraProgress(phase);
  // The rendered face sits slightly below the artboard center because of
  // the approved GLB pivot. Compensate without changing its 3D controller.
  const faceCenterY = Math.max(148, Math.min(height * .225, 210));
  const galleryShift = faceCenterY - height * .5 - 20;
  // On phones, follow the same vertical camera drift as the paper ring
  // until all sheets nearly complete the orbit. Desktop timing is unchanged.
  const settle = width <= 700 ? smooth(phase, .82, .99) :
    smooth(phase, .66, .86);
  return {
    shift: mix(cameraShift, galleryShift, settle),
    scale: 1 - .24 * smooth(phase, .84, .995),
  };
}

export function spiralGalleryPose(phase, index, rank, width, height, target) {
  const slot = orbitSlot(index, rank);
  const featured = rank >= 0;
  const cameraLift = height * CAMERA_DESCENT * galleryCameraProgress(phase);
  const path = clockwiseTrack(phase, slot, width, height);
  let { x, y, z, scale, rx, ry, rz } = path;
  let settle = 0;
  let stage = phase <= UNWIND_START ? 'clockwise-orbit' :
    path.exited ? 'bottom-tangent-left' : 'clockwise-orbit';

  // ALL 21 sheets are already offscreen before this point. There is no
  // selection or fading visible while the clockwise ring is unwinding.
  if (phase > OFFSCREEN_START && !featured) {
    const prior = clockwiseTrack(OFFSCREEN_START, slot, width, height);
    const prev = clockwiseTrack(OFFSCREEN_START - .00001,
      slot, width, height);
    const speed = (prior.x - prev.x) / .00001;
    x = prior.x + speed * (phase - OFFSCREEN_START);
    y = prior.y;
    z = prior.z;
    scale = prior.scale;
    rx = prior.rx;
    ry = prior.ry;
    rz = prior.rz;
    stage = 'offscreen-left';
  } else if (phase > OFFSCREEN_START && featured) {
    const origin = clockwiseTrack(OFFSCREEN_START, slot, width, height);
    const projectedX = target.x * GALLERY_FOCAL /
      (GALLERY_FOCAL - target.z);
    // Entire row begins beyond the left edge, including the rightmost
    // featured card, and shares the same projected X translation.
    const offset = width * 1.8 + 300;
    const stageZ = target.z - 160;
    const stageX = (projectedX - offset) *
      (GALLERY_FOCAL - stageZ) / GALLERY_FOCAL;
    const stageY = target.y + height * CAMERA_DESCENT + height * .065;

    if (phase < TRAIN_START) {
      // Turn around completely OUTSIDE the viewport. A quintic with
      // matched incoming tangent prevents the old abrupt breakaway.
      const duration = TRAIN_START - OFFSCREEN_START;
      const t = clamp((phase - OFFSCREEN_START) / duration);
      const before = clockwiseTrack(OFFSCREEN_START - .00001,
        slot, width, height);
      const velocityX = (origin.x - before.x) / .00001;
      x = quintic([origin.x, origin.x + velocityX * duration / 5,
        Math.min(origin.x - width * .3, stageX - width * .45),
        stageX - width * .22, stageX, stageX], t);
      y = quintic([origin.y, origin.y, origin.y + height * .12,
        stageY + height * .12, stageY, stageY], t);
      const eased = smoother(t);
      z = mix(origin.z, stageZ, eased);
      scale = mix(origin.scale, target.scale * .72, eased);
      rx = mix(origin.rx, 0, eased);
      ry = mix(origin.ry, target.ry * .65, eased);
      rz = mix(origin.rz, 0, eased);
      stage = 'offscreen-u-turn';
    } else {
      // Re-enter from LEFT as a train: all seven cards have exactly
      // the same SCREEN-SPACE translation despite their 3D depths.
      // No individual landing tween, replacement or visible reordering.
      const t = smoother((phase - TRAIN_START) /
        (TRAIN_END - TRAIN_START));
      z = target.z - 160 * (1 - t);
      x = (projectedX - offset * (1 - t)) *
        (GALLERY_FOCAL - z) / GALLERY_FOCAL;
      y = stageY + (target.y + height * CAMERA_DESCENT - stageY) * t;
      scale = target.scale * mix(.72, 1, t);
      rx = 0;
      ry = target.ry * mix(.65, 1, t);
      rz = 0;
      settle = t;
      stage = phase >= TRAIN_END ? 'gallery' : 'train-to-row';
    }
  }

  const emergence = smooth(phase, .295, .40);
  // The 14 nonfeatured sheets never fade out during the transition.
  // They stay solid and physically continue offscreen to the left.
  const opacity = featured
    ? emergence * mix(1, target.opacity, smooth(phase, .955, TRAIN_END))
    : emergence;
  const front = phase > OFFSCREEN_START ||
    (Math.sin(path.angle) > .10 && phase > .40);
  return {
    x, y: y - cameraLift, z, scale, rx, ry, rz,
    opacity, front, settle, start: .285, end: TRAIN_END,
    u: clamp((phase - .285) / (TRAIN_END - .285)), stage,
  };
}
