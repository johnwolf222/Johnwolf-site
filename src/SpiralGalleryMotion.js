/**
 * Seekable, continuous 3D path from the approved Home current to Projects.
 * Each sheet winds around the SAME head, follows a tangent-matched bend,
 * and reaches its gallery slot without a second slide or an abrupt stop.
 * This module owns only transition geometry; Home, art assets, and gallery
 * ordering remain unchanged.
 */
export const CAMERA_DESCENT = .36;
const TAU = Math.PI * 2;
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (x, a, b) => {
  const t = clamp((x - a) / Math.max(.000001, b - a));
  return t * t * (3 - 2 * t);
};
const quintic = (p, t) => {
  const s = 1 - t;
  return s ** 5 * p[0] + 5 * s ** 4 * t * p[1] +
    10 * s ** 3 * t * t * p[2] + 10 * s * s * t ** 3 * p[3] +
    5 * s * t ** 4 * p[4] + t ** 5 * p[5];
};

export function galleryCameraProgress(phase) {
  // Complete the descent BEFORE the first card reaches its final slot.
  return smooth(phase, .34, .895);
}

function orbitAt(t, order, width, height, flattenAtExit) {
  // Do not clamp the clock: unfeatured sheets keep flying while fading.
  const growth = smooth(t, 0, .25);
  const angle = -Math.PI * .5 + 3.25 * Math.PI * t +
    (order - .5) * .14;
  const radiusX = Math.min(width * .29, 420) * growth;
  const radiusY = Math.min(height * .33, 270) * growth;
  const x = Math.cos(angle) * radiusX;
  const y = Math.sin(angle) * radiusY +
    (order - .5) * height * .14 * growth;
  // Stay behind the camera's focal plane. The former +310px forward
  // excursion made sheets balloon over the head in the supplied recording.
  const z = -680 + 340 * Math.min(t, 1) -
    110 * Math.max(0, t - 1) + 30 * Math.sin(angle) * growth;
  const scale = mix(.11, .38, smooth(t, .05, .84));
  const flatten = flattenAtExit ? 1 - smooth(t, .83, 1) : 1;
  return {
    x, y, z, scale, angle,
    rx: 17 * Math.sin(angle * .82 + order * 1.3) * growth * flatten,
    ry: 31 * Math.cos(angle) * growth * flatten,
    rz: 15 * Math.sin(angle + .3) * growth * flatten,
  };
}

export function spiralGalleryPose(phase, index, rank, width, height, target) {
  const order = index / 20;
  const start = .285 + index * .0115;
  // Featured cards finish left-to-right; nonfeatured cards depart earlier.
  const end = rank < 0 ? .88 : .91 + rank * .012;
  const u = clamp((phase - start) / (end - start));
  const cameraLift = height * CAMERA_DESCENT * galleryCameraProgress(phase);
  const orbitPortion = .70;
  const orbitTime = u / orbitPortion;
  const isFeatured = rank >= 0;
  const onBend = isFeatured && u > orbitPortion;
  const orbit = orbitAt(orbitTime, order, width, height, isFeatured);
  let x = orbit.x;
  let y = orbit.y;
  let z = orbit.z;
  let scale = orbit.scale;
  let rx = orbit.rx;
  let ry = orbit.ry;
  let rz = orbit.rz;
  let settle = 0;

  if (onBend) {
    const v = clamp((u - orbitPortion) / (1 - orbitPortion));
    const origin = orbitAt(1, order, width, height, true);
    const prior = orbitAt(1 - .0001, order, width, height, true);
    // Match first derivatives at the orbit -> bend join. A quintic path
    // permits the final derivative to reach zero while entering from left.
    const tangent = (key) =>
      (origin[key] - prior[key]) / .0001 *
      (1 - orbitPortion) / (5 * orbitPortion);
    const rowY = target.y + height * CAMERA_DESCENT;
    const sweepX = Math.min(origin.x - width * .12,
      target.x - width * .15);
    const leadX = target.x - Math.min(width * .14, 190);
    x = quintic([origin.x, origin.x + tangent('x'), sweepX,
      leadX, target.x, target.x], v);
    y = quintic([origin.y, origin.y + tangent('y'),
      origin.y + height * (.13 + (rank - 3) * .025),
      rowY - height * .06 + (rank - 3) * height * .015,
      rowY, rowY], v);
    z = quintic([origin.z, origin.z + tangent('z'),
      -340 - rank * 15, target.z - 70, target.z, target.z], v);
    settle = smooth(v, .18, 1);
    scale = mix(origin.scale, target.scale, settle);
    rx = 0;
    ry = mix(0, target.ry, smooth(v, .08, 1));
    rz = 0;
  }

  const emergence = smooth(u, .025, .16);
  const unfeaturedFade = isFeatured ? 1 :
    1 - smooth(u, .53, .81);
  const galleryFade = isFeatured ?
    mix(1, target.opacity, smooth(u, .84, 1)) : 1;
  const opacity = emergence * unfeaturedFade * galleryFade;
  // A sheet may cross in front of the head only on the outer rim;
  // no front-layer sheets are allowed to sweep across the face.
  const outer = Math.abs(orbit.x) > width * .13 ||
    Math.abs(orbit.y) > height * .25;
  const front = (onBend && u > .77) ||
    (u > .2 && outer && Math.sin(orbit.angle) > .12);
  return {
    x, y: y - cameraLift, z, scale, rx, ry, rz,
    opacity, front, settle, u, start, end,
    stage: !u ? 'behind-head' :
      u < orbitPortion ? 'spiral' :
        isFeatured ? (u >= 1 ? 'gallery' : 'spiral-to-row') : 'departing',
  };
}
