/**
 * Original, seekable paper-current choreography for the homepage.
 *
 * Visual goals: a curved three-dimensional ring passage, a continuous
 * departure tangent, and inertial wind-driven outward flight. This module
 * intentionally uses independent trajectory math rather than vendor code.
 *
 * The approved 21 individual artworks, scroll handoff, and GPU renderer all
 * consume the same per-sheet poses. There is no asset substitution.
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

const PI = Math.PI;
const TAU = 2 * PI;
const GOLDEN = PI * (3 - Math.sqrt(5));
const STEP = 1 / 60;
const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (t, start, end) => {
  const x = clamp((t - start) / Math.max(.00001, end - start));
  return x * x * (3 - 2 * x);
};
const bezier = (p0, p1, p2, p3, u) => {
  const v = 1 - u;
  return v * v * v * p0 + 3 * v * v * u * p1 +
    3 * v * u * u * p2 + u * u * u * p3;
};

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createLane(index, width, height, preset) {
  const rand = random((preset.seed * 4099 + (index + 1) * 10007) >>> 0);
  const theta = index * GOLDEN + (rand() - .5) * .18;
  const outwardX = Math.cos(theta);
  const outwardY = Math.sin(theta);
  const lateralX = -outwardY;
  const lateralY = outwardX;
  const shortSide = Math.max(1, Math.min(width, height));
  const ring = shortSide * preset.ring;

  // The passage has depth: sheets travel from behind its opening to a lip,
  // where the curve's outgoing tangent becomes the free-flight velocity.
  const passTime = 1.48 + (rand() - .5) * .20;
  // Enter at the ring's inner throat; the opening, not the distant
  // free-flight field, controls this early center-only approach.
  // Exit control point and tangent are unchanged from the approved flight.
  const startR = ring * .75;
  const controlR1 = ring * .74;
  const controlR2 = ring * .81;
  const lipR = ring * 1.08;
  const startZ = -760;
  const controlZ1 = -590;
  const controlZ2 = -294;
  const lipZ = -224;
  const radialAtLip = 3 * (lipR - controlR2) / passTime;
  const depthAtLip = 3 * (lipZ - controlZ2) / passTime;

  const screenExit = Math.min(
    (width * .5 + shortSide * .21) / Math.max(.10, Math.abs(outwardX)),
    (height * .5 + shortSide * .21) / Math.max(.10, Math.abs(outwardY)),
  );
  const flightSpan = Math.max(.1, preset.flight - passTime);
  const targetRadialSpeed = Math.max(45, (screenExit - lipR) / flightSpan);
  const yawPhase = rand() * TAU;
  const pitchPhase = rand() * TAU;
  const rollPhase = rand() * TAU;
  const gustPhase = rand() * TAU;
  const lateralPhase = rand() * TAU;
  const airflow = .8 + rand() * .45;
  const spin = (rand() < .5 ? -1 : 1) * (.07 + rand() * .13);
  const baseRoll = theta * 180 / PI + 90;
  const ringRX = 10 * Math.sin(pitchPhase + 3.7);
  const ringRY = 13 * Math.cos(yawPhase + 2.8);
  const ringRZ = baseRoll + 9 * Math.sin(rollPhase + 2.5);

  let x = outwardX * lipR;
  let y = outwardY * lipR;
  let z = lipZ;
  let vx = outwardX * radialAtLip;
  let vy = outwardY * radialAtLip;
  let vz = depthAtLip;
  let travelled = false;
  const frames = [];
  const count = Math.ceil(preset.flight / STEP);

  for (let i = 0; i <= count; i++) {
    const time = Math.min(preset.flight, i * STEP);
    const withinPassage = time <= passTime;
    let px, py, pz, rx, ry, rz;

    if (withinPassage) {
      const u = clamp(time / passTime);
      const r = bezier(startR, controlR1, controlR2, lipR, u);
      px = outwardX * r;
      py = outwardY * r;
      pz = bezier(startZ, controlZ1, controlZ2, lipZ, u);
      const facingChange = 1 - smooth(u, .22, .98);
      rx = ringRX + facingChange * 53 * outwardY;
      ry = ringRY + facingChange * 58 * outwardX;
      rz = ringRZ + facingChange * 14 * Math.sin(rollPhase);
    } else {
      // The first free-flight sample uses the exact lip position and outgoing
      // derivative. Continuous acceleration then changes that velocity; the
      // sheet is never teleported to an unrelated random orbit.
      if (!travelled) {
        travelled = true;
        x = outwardX * lipR;
        y = outwardY * lipR;
        z = lipZ;
      }
      const t = time - passTime;
      const windA = Math.sin(x * .0029 + y * .0016 + t * .94 + gustPhase);
      const windB = Math.cos(y * .0041 - x * .0017 - t * 1.33 + lateralPhase);
      const windC = Math.sin(t * 2.12 + rollPhase);
      const lateral = airflow * (24 * windA + 16 * windB + 8 * windC);
      const radial = targetRadialSpeed *
        (1 + .11 * Math.sin(t * 1.04 + yawPhase));
      const wantedVX = outwardX * radial + lateralX * lateral;
      const wantedVY = outwardY * radial + lateralY * lateral;
      const wantedVZ = 54 + 22 * Math.sin(t * .66 + pitchPhase);
      const drag = Math.min(1, STEP * 1.4);
      vx = mix(vx, wantedVX, drag);
      vy = mix(vy, wantedVY, drag);
      vz = mix(vz, wantedVZ, Math.min(1, STEP * 1.9));
      x += vx * STEP;
      y += vy * STEP;
      z += vz * STEP;
      px = x;
      py = y;
      pz = z;

      const direction = Math.atan2(vy, vx);
      const unwrapped = direction +
        Math.round((theta - direction) / TAU) * TAU;
      const settle = smooth(t, 0, .82);
      const swing = Math.sin(t * 1.46 + pitchPhase);
      const yaw = Math.sin(t * 1.22 + yawPhase);
      rx = mix(ringRX, 30 * swing + 8 * Math.sin(t * 2.8 + rollPhase), settle);
      ry = mix(ringRY, 40 * yaw + 9 * Math.cos(t * 2.1 + pitchPhase), settle);
      rz = mix(ringRZ, (unwrapped + PI / 2) * 180 / PI +
        11 * Math.sin(t * 1.74 + rollPhase) + 15 * spin * t, settle);
    }

    const release = smooth(time, passTime, passTime + .64);
    // Ring-specific vertex wrapping is strongest as the sheet clears
    // the curved lip, then disappears without changing its center path.
    const wrap = smooth(time, .22, .87) *
      (1 - smooth(time, passTime - .16, passTime + .78));
    const visibility = smooth(time, .12, .96) *
      (1 - smooth(time, preset.flight - 1.20, preset.flight - .10));
    const scale = mix(.20, .43, smooth(time, .18, preset.flight - .38)) *
      (.94 + .1 * Math.sin(index * 2.18 + .2));
    const curl = clamp((.47 +
      .23 * Math.sin(time * 1.54 + rollPhase) +
      .11 * Math.cos(time * 3.11 + yawPhase)) *
      (.16 + .84 * release) * preset.curl, 0, 1.20);
    // Flutter amplitude follows the sheet's simulated airspeed.
    // A small phase variation keeps the motion organic, while its
    // primary magnitude comes from flight rather than an independent
    // high-frequency ripple timer.
    const flightSpeed = Math.hypot(vx, vy, vz);
    const windLoading = clamp(
      flightSpeed / Math.max(60, targetRadialSpeed), .45, 1.45);
    const flutter = clamp((.57 +
      .13 * Math.sin(time * 1.83 + pitchPhase) +
      .07 * Math.cos(time * 2.38 + rollPhase)) *
      (.38 + .62 * windLoading) * release * preset.flutter, 0, 1.20);
    frames.push({
      x: px, y: py, z: pz, rx, ry, rz,
      scale, opacity: visibility, curl, flutter, wrap, time,
    });
  }
  return frames;
}

export function createHomePaperMotion(width, height, config = HOME_PAPER_PRESET) {
  const lanes = Array.from({ length: config.count },
    (_, index) => createLane(index, width, height, config));
  return {
    width, height, config,
    age(index, clock) {
      const birth = index * config.duration / config.count;
      return ((clock - birth) / config.duration % 1 + 1) % 1;
    },
    pose(index, normalizedAge) {
      const life = normalizedAge * config.duration;
      const frames = lanes[index];
      if (life >= config.flight) {
        return { ...frames[frames.length - 1], opacity: 0 };
      }
      const at = life / STEP;
      const lower = Math.floor(at);
      const fraction = at - lower;
      const before = frames[Math.min(lower, frames.length - 1)];
      const after = frames[Math.min(lower + 1, frames.length - 1)];
      if (!fraction) return before;
      return {
        x: mix(before.x, after.x, fraction),
        y: mix(before.y, after.y, fraction),
        z: mix(before.z, after.z, fraction),
        rx: mix(before.rx, after.rx, fraction),
        ry: mix(before.ry, after.ry, fraction),
        rz: mix(before.rz, after.rz, fraction),
        scale: mix(before.scale, after.scale, fraction),
        opacity: mix(before.opacity, after.opacity, fraction),
        curl: mix(before.curl, after.curl, fraction),
        flutter: mix(before.flutter, after.flutter, fraction),
        wrap: mix(before.wrap, after.wrap, fraction),
        time: life,
      };
    },
  };
}
