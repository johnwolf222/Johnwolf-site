import { Euler, Quaternion, Vector3 } from 'three';

/**
 * One deterministic, integrated airflow simulation for each live artwork.
 * Position, 3D orientation and mesh pressure all respond to the SAME wind.
 *
 * The ring path is a short initial constraint, followed by free-flight.
 * No independent sinusoidal "card spinning" or decorative flutter.
 *
 * The complete flight is cached in advance so GSAP can seek it in reverse.
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
const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const DEG = 180 / Math.PI;
const STEP = 1 / 90;
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
function alignedRotation(rx, ry, rz) {
  // World/screen coordinates have opposite Y directions. Match the render
  // orientation, not the unprojected DOM Euler values.
  return new Quaternion().setFromEuler(
    new Euler(-rx / DEG, ry / DEG, -rz / DEG, 'YXZ'));
}
function unwrapDegrees(current, previous) {
  if (!Number.isFinite(previous)) return current;
  return current + 360 * Math.round((previous - current) / 360);
}
function createLane(index, width, height, config) {
  const noise = random(config.seed * 4099 + (index + 1) * 10007);
  const heading = index * GOLDEN + (noise() - .5) * .20;
  const dx = Math.cos(heading), dy = Math.sin(heading);
  const sideX = -dy, sideY = dx;
  const shortest = Math.min(width, height);
  const ringR = shortest * config.ring;
  const innerR = shortest * .135;
  const exitR = Math.max(
    ringR + shortest * .20,
    Math.min(
      (width * .5 + shortest * .12) / Math.max(.12, Math.abs(dx)),
      (height * .5 + shortest * .12) / Math.max(.12, Math.abs(dy))
    )
  );
  const releaseTime = 1.52 + (noise() - .5) * .19;
  const freeDuration = config.flight - releaseTime;
  const radialVelocity = (exitR - ringR) / freeDuration;
  const sideVelocity = (noise() - .5) * 18;
  const phases = Array.from({ length: 6 }, () => noise() * TAU);
  const gustGain = .82 + noise() * .42;
  const releaseRoll = (noise() - .5) * 23;
  const wobbleBias = (noise() - .5) * 2;
  const spinSign = noise() < .5 ? -1 : 1;
  const frames = [];
  const q = new Quaternion();
  const delta = new Quaternion();
  const localAxis = new Vector3();
  const facing = new Vector3();
  const airVector = new Vector3();
  const torque = new Vector3();
  const angVel = new Vector3(
    (noise() - .5) * .60,
    (noise() - .5) * .66,
    spinSign * (.30 + noise() * .30),
  );
  const euler = new Euler(0, 0, 0, 'YXZ');
  let x = dx * ringR, y = dy * ringR, z = -280;
  let vx = dx * radialVelocity + sideX * sideVelocity;
  let vy = dy * radialVelocity + sideY * sideVelocity;
  let prevEuler = null;
  let released = false;
  let pressure = 0, rush = 0;

  for (let frame = 0; frame <= Math.ceil(config.flight / STEP); frame++) {
    const t = Math.min(config.flight, frame * STEP);
    let rx, ry, rz;
    if (t <= releaseTime) {
      // Constrain the surface to the curved mouth until it reaches the
      // tangent release point. Rotation follows the curved surface.
      const u = ease(t, 0, releaseTime);
      const radius = lerp(innerR, ringR, ease(u, .12, .96));
      const arc = Math.PI * (1 - u) * .82;
      x = dx * radius;
      y = dy * radius;
      z = -690 + 410 * u + 85 * Math.sin(arc);
      const sideTilt = (1 - u) * 47;
      rx = sideTilt * dy + (1 - u) * 9 * Math.sin(phases[0] + u * 4);
      ry = sideTilt * dx + (1 - u) * 13 * Math.cos(phases[1] + u * 3);
      rz = heading * DEG + 90 + releaseRoll * (1 - u);
      q.copy(alignedRotation(rx, ry, rz));
      pressure = 0;
      rush = 0;
      if (frame === 0) prevEuler = [rx, ry, rz];
    } else {
      if (!released) {
        // Maintain the exact contact position/orientation as the card leaves
        // the ring. Air pressure takes over smoothly rather than resetting
        // an independent rotation animation.
        released = true;
        x = dx * ringR;
        y = dy * ringR;
        z = -280;
      }
      const flightT = t - releaseTime;
      const u = clamp(flightT / freeDuration);
      const entrain = ease(flightT, 0, .6);
      const wave1 = Math.sin(x * .0040 + y * .0021 +
        flightT * 1.08 + phases[0]);
      const wave2 = Math.cos(y * .0047 - x * .0019 -
        flightT * 1.37 + phases[1]);
      const wave3 = Math.sin(flightT * 2.12 + phases[2]);
      const sideways = gustGain * (wave1 * 46 + wave2 * 31 +
        wave3 * 16);
      const pulse = 1 + .12 * Math.sin(flightT * 1.02 + phases[3]);
      const flowX = dx * radialVelocity * pulse + sideX * sideways;
      const flowY = dy * radialVelocity * pulse + sideY * sideways;
      // A slowly changing out-of-plane gust is essential: flat 2D motion
      // cannot produce convincing aerodynamic flipping and bending.
      const verticalGust = (
        Math.sin(x * .0047 + flightT * 1.31 + phases[4]) * 49 +
        Math.cos(y * .0038 - flightT * 1.86 + phases[5]) * 34);
      facing.set(0, 0, 1).applyQuaternion(q);
      airVector.set(flowX - vx + dx * 45,
        -(flowY - vy + dy * 45), verticalGust);
      const relSpeed = Math.max(.001, airVector.length());
      const windDirection = airVector.clone().multiplyScalar(1 / relSpeed);
      const normalImpact = Math.abs(facing.dot(windDirection));
      // Orientation determines lift, and airflow produces a torque around
      // the card's actual 3D face normal. A damped angular velocity carries
      // momentum through gusts instead of jumping between Euler keyframes.
      const lift = entrain * 22 * normalImpact;
      const inertia = .84;
      vx += ((flowX - vx) * inertia + facing.x * lift) * STEP;
      vy += ((flowY - vy) * inertia - facing.y * lift) * STEP;
      x += vx * STEP;
      y += vy * STEP;
      torque.crossVectors(facing, windDirection);
      const swirl = new Vector3(
        Math.sin(x * .006 + flightT * 1.23 + phases[0]),
        Math.cos(y * .005 - flightT * 1.11 + phases[1]),
        Math.sin(flightT * 1.50 + phases[2]));
      angVel.addScaledVector(torque, (1.9 + normalImpact * 1.4) * STEP);
      angVel.addScaledVector(swirl, gustGain * .53 * STEP);
      angVel.multiplyScalar(Math.exp(-.72 * STEP));
      const rotationSpeed = Math.min(3.4, angVel.length());
      if (rotationSpeed > .001) {
        localAxis.copy(angVel).normalize();
        delta.setFromAxisAngle(localAxis, rotationSpeed * STEP);
        q.premultiply(delta).normalize();
      }
      pressure = lerp(pressure, normalImpact,
        clamp(STEP * 3.3));
      rush = lerp(rush,
        clamp((relSpeed + 35 * angVel.length()) / 180),
        clamp(STEP * 4.8));
      // The free sheet can drift in depth as air gets under its surface.
      z = lerp(-280, 165, ease(u, 0, .94)) +
        (normalImpact * 46 + Math.sin(flightT * 1.12 +
          phases[3]) * 26) * entrain;

      euler.setFromQuaternion(q, 'YXZ');
      rx = -euler.x * DEG;
      ry = euler.y * DEG;
      rz = -euler.z * DEG;
      if (prevEuler) {
        rx = unwrapDegrees(rx, prevEuler[0]);
        ry = unwrapDegrees(ry, prevEuler[1]);
        rz = unwrapDegrees(rz, prevEuler[2]);
      }
    }
    prevEuler = [rx, ry, rz];

    const fadeIn = ease(t, .16, 1.13);
    const fadeOut = 1 - ease(t, config.flight - 1.24,
      config.flight - .12);
    const opacity = fadeIn * fadeOut;
    const scale = lerp(.185, .405,
      ease(t, .20, config.flight - .32)) *
      (.92 + .12 * Math.sin(index * 2.18 + .2));
    const releaseBlend = ease(t, releaseTime, releaseTime + .55);
    const curl = releaseBlend *
      clamp(.10 + .92 * pressure + .16 * rush, .05, 1.07);
    const flutter = releaseBlend *
      clamp(.12 + rush * .60 + .20 * pressure, .08, .98);
    // A card physically conforms to the curved opening before releasing.
    // This drives geometry directly, rather than a separate "flutter" layer.
    const ringWrap = 1 - ease(t,
      releaseTime - .12, releaseTime + .48);
    frames.push({ x, y, z, rx, ry, rz, scale, opacity,
      curl, flutter, ringWrap, time: t,
      q: [q.x, q.y, q.z, q.w] });
  }
  return frames;
}

/** Cache deterministic motion once per viewport so it can be scrubbed in both directions. */
export function createHomePaperMotion(width, height, config = HOME_PAPER_PRESET) {
  const lanes = Array.from({ length: config.count },
    (_, index) => createLane(index, width, height, config));
  const interpQ1 = new Quaternion();
  const interpQ2 = new Quaternion();
  const interpolatedQ = new Quaternion();
  return {
    width, height, config,
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
      const at = life / STEP;
      const index0 = Math.floor(at);
      const frac = at - index0;
      const frames = lanes[index];
      const a = frames[Math.min(index0, frames.length - 1)];
      const b = frames[Math.min(index0 + 1, frames.length - 1)];
      if (!frac) return a;
      interpQ1.fromArray(a.q);
      interpQ2.fromArray(b.q);
      interpolatedQ.slerpQuaternions(interpQ1, interpQ2, frac);
      return {
        x: lerp(a.x, b.x, frac),
        y: lerp(a.y, b.y, frac),
        z: lerp(a.z, b.z, frac),
        rx: lerp(a.rx, b.rx, frac),
        ry: lerp(a.ry, b.ry, frac),
        rz: lerp(a.rz, b.rz, frac),
        scale: lerp(a.scale, b.scale, frac),
        opacity: lerp(a.opacity, b.opacity, frac),
        curl: lerp(a.curl, b.curl, frac),
        flutter: lerp(a.flutter, b.flutter, frac),
        ringWrap: lerp(a.ringWrap, b.ringWrap, frac),
        time: life,
        q: interpolatedQ.toArray(),
      };
    },
  };
}
