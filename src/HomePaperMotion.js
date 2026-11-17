/**
 * Homepage-only paper current, inspired by the observable behavior of
 * Premotio's Hole 01 preset. This is an independent implementation.
 *
 * Each artwork owns a deterministic, reversible nine-second journey:
 * central ring -> curved release -> inertial wind-driven free flight.
 * All 21 journeys are staggered around one 12-second clock.
 *
 * Every transform/rotation/curl sample is reproducible. Scrolling can seek
 * each unique sheet backwards without changing the card or swapping media.
 */
export const HOME_PAPER_PRESET = Object.freeze({
  count: 21,
  duration: 12,
  flight: 9,
  ring: .31,
  cardSize: 390,
  curl: 1,
  flutter: 1,
  seed: 1,
});
const TAU = 2 * Math.PI;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const STEP = 1 / 60;
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t, a, b) => {
  const v = clamp((t - a) / Math.max(.00001, b - a));
  return v * v * (3 - 2 * v);
};
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function createLane(index, width, height, config) {
  const noise = random(config.seed * 4099 + (index + 1) * 10007);
  const angle = index * GOLDEN + (noise() - .5) * .20;
  const xRay = Math.cos(angle);
  const yRay = Math.sin(angle);
  const acrossX = -yRay;
  const acrossY = xRay;
  const shortest = Math.min(width, height);
  const ring = shortest * config.ring;
  const body = shortest * .135;
  const screenExit = Math.min(
    (width * .5 + shortest * .12) / Math.max(.12, Math.abs(xRay)),
    (height * .5 + shortest * .12) / Math.max(.12, Math.abs(yRay)),
  );
  const reach = Math.max(ring + shortest * .20, screenExit);
  const release = 1.52 + (noise() - .5) * .19;
  const wander = .8 + noise() * .45;
  const tilt = noise() * TAU;
  const wobble = noise() * TAU;
  const roll = noise() * TAU;
  const spin = (noise() < .5 ? -1 : 1) * (.16 + noise() * .27);
  const baseSpeed = (reach - ring * .98) / (config.flight - release);
  const drift = (noise() - .5) * 13;
  const gustPhase = [noise() * TAU, noise() * TAU, noise() * TAU];
  const frames = [];
  let px = xRay * ring;
  let py = yRay * ring;
  let vx = xRay * baseSpeed + acrossX * drift;
  let vy = yRay * baseSpeed + acrossY * drift;

  for (let i = 0; i <= Math.ceil(config.flight / STEP); i++) {
    const t = Math.min(config.flight, i * STEP);
    const out = t > release;
    let x, y, z, rx, ry, rz, curl, flutter, scale;

    if (!out) {
      // Paper follows the inside of a three-dimensional curved ring before
      // its free-flight release; the bend is in the radial-depth cross-section.
      const u = ease(t, 0, release);
      const phi = Math.PI * (1 - u) * .82;
      const r = body + (ring - body) * ease(u, .12, .96);
      x = xRay * r;
      y = yRay * r;
      z = -690 + 410 * u + 85 * Math.sin(phi);
      const ringTilt = (1 - u) * 47;
      rx = ringTilt * yRay + 9 * Math.sin(tilt + u * 4);
      ry = ringTilt * xRay + 13 * Math.cos(wobble + u * 3);
      rz = angle * 180 / Math.PI + 90 +
        12 * Math.sin(roll + u * 2.5);
    } else {
      const flightT = t - release;
      const u = clamp(flightT / (config.flight - release));
      if (i > 0) {
        // Inertial advection through a bounded, multi-frequency wind field.
        // Gusts depend on position and time, not random frame changes.
        const wave1 = Math.sin(
          (px * .0038 + py * .0021) + flightT * .97 + gustPhase[0]);
        const wave2 = Math.cos(
          (py * .0048 - px * .0016) - flightT * 1.43 + gustPhase[1]);
        const wave3 = Math.sin(flightT * 2.12 + gustPhase[2]);
        const sideways = (wave1 * 26 + wave2 * 17 + wave3 * 9) * wander;
        const flow = 1 + .11 * Math.sin(flightT * 1.04 + tilt);
        const goalVX = xRay * baseSpeed * flow + acrossX * sideways;
        const goalVY = yRay * baseSpeed * flow + acrossY * sideways;
        const inertia = Math.min(1, STEP * 1.28);
        vx = lerp(vx, goalVX, inertia);
        vy = lerp(vy, goalVY, inertia);
        px += vx * STEP;
        py += vy * STEP;
      }
      // Damped freedom of rotation: orientation is related to velocity,
      // gently turning with the current rather than spinning in-place.
      const travelDirection = Math.atan2(vy, vx);
      const air = Math.sin(flightT * 1.8 + wobble) +
        .48 * Math.sin(flightT * 3.5 + tilt);
      x = px;
      y = py;
      z = lerp(-280, 165, ease(u, 0, .94)) +
        Math.sin(flightT * 1.12 + roll) * 33;
      rx = Math.sin(flightT * 1.12 + tilt) * 28 +
        Math.cos(flightT * 2.2 + roll) * 8;
      ry = Math.sin(flightT * 1.3 + wobble) * 44 +
        9 * Math.sin(flightT * 2.8 + tilt);
      rz = (travelDirection + Math.PI / 2) * 180 / Math.PI +
        13 * air + spin * flightT * 18;
    }

    const show = ease(t, .16, 1.13) *
      (1 - ease(t, config.flight - 1.24, config.flight - .12));
    // A shallow natural swing in apparent size, never a bounce or scale pop.
    scale = lerp(.145, .295, ease(t, .20, config.flight - .32)) *
      (.92 + .12 * Math.sin(index * 2.18 + .2));
    curl = clamp(.50 +
      .24 * Math.sin(t * 1.62 + roll) +
      .13 * Math.cos(t * 3.15 + wobble), .12, .92);
    flutter = clamp(.66 + .20 * Math.sin(t * 2.13 + tilt) +
      .12 * Math.cos(t * 3.6 + roll), .24, 1);
    frames.push({ x, y, z, rx, ry, rz, scale, opacity: show,
      curl, flutter, time: t });
  }
  return frames;
}

/** A cache is regenerated only when the viewport actually changes. */
export function createHomePaperMotion(width, height, config = HOME_PAPER_PRESET) {
  const lanes = Array.from({ length: config.count },
    (_, index) => createLane(index, width, height, config));
  return {
    width, height, config,
    /** Global home clock is cyclic; sample any sheet at an arbitrary time. */
    age(index, clock) {
      const birth = index * config.duration / config.count;
      return ((clock - birth) / config.duration % 1 + 1) % 1;
    },
    pose(index, normalizedAge) {
      const life = normalizedAge * config.duration;
      if (life >= config.flight) {
        const last = lanes[index][lanes[index].length - 1];
        return { ...last, opacity: 0 };
      }
      const position = life / STEP;
      const a = Math.floor(position);
      const fract = position - a;
      const frames = lanes[index];
      const from = frames[Math.min(a, frames.length - 1)];
      const to = frames[Math.min(a + 1, frames.length - 1)];
      if (!fract) return from;
      // Interpolating all coordinates gives scroll-reversible movement even
      // under slow, pixel-by-pixel scrubbing (no animation state to restart).
      return {
        x: lerp(from.x, to.x, fract),
        y: lerp(from.y, to.y, fract),
        z: lerp(from.z, to.z, fract),
        rx: lerp(from.rx, to.rx, fract),
        ry: lerp(from.ry, to.ry, fract),
        rz: lerp(from.rz, to.rz, fract),
        scale: lerp(from.scale, to.scale, fract),
        opacity: lerp(from.opacity, to.opacity, fract),
        curl: lerp(from.curl, to.curl, fract),
        flutter: lerp(from.flutter, to.flutter, fract),
        time: life,
      };
    },
  };
}
