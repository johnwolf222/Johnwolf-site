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
import { createFloatingPaperDynamics } from './HomePaperAirflow.js';

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

  // All sheets sample one globally timed, spatially continuous air current.
  // Ring entry below remains unchanged; the shared integrator begins at its lip.
  const floating = createFloatingPaperDynamics({
    seed: preset.seed,
    birth: index * preset.duration / preset.count,
    theta,
    ringRotation: [ringRX, ringRY, ringRZ],
    position: [outwardX * lipR, outwardY * lipR, lipZ],
    velocity: [
      outwardX * radialAtLip, outwardY * radialAtLip, depthAtLip,
    ],
    radialSpeed: targetRadialSpeed,
    curl: preset.curl,
    flutter: preset.flutter,
    step: STEP,
  });
  const frames = [];
  const count = Math.ceil(preset.flight / STEP);

  for (let i = 0; i <= count; i++) {
    const time = Math.min(preset.flight, i * STEP);
    const withinPassage = time <= passTime;
    let px, py, pz, rx, ry, rz, flightPose;

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
      // Momentum, three-axis tumbling, and aerodynamic deformation all come
      // from one shared spatial wind field—not independent wobble timers.
      flightPose = floating.step(time);
      px = flightPose.x;
      py = flightPose.y;
      pz = flightPose.z;
      rx = flightPose.rx;
      ry = flightPose.ry;
      rz = flightPose.rz;
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
    // Guided entry is stable; aerodynamic motion progressively takes over
    // after the lip. Each control remains independently disable-able.
    const curl = withinPassage ? .06 * preset.curl :
      (.08 + .92 * release) * flightPose.curl;
    const flutter = withinPassage ? 0 : release * flightPose.flutter;
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
