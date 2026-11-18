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
  let pitch = ringRX, yaw = ringRY, roll = ringRZ;
  let pitchRate = 0, yawRate = 0, rollRate = 0;
  const birth = index * preset.duration / preset.count;
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
      // One coherent spatial current for all cards, with inertial response.
      const clock = birth + time;
      const a = Math.sin(x * .0026 + y * .0018 + clock * .71);
      const b = Math.cos(y * .0031 - x * .0015 - clock * .87);
      const c = Math.sin((x-y) * .0017 + z * .0012 + clock * .54);
      const airX = 26*a + 13*b, airY = -24*b + 12*c, airZ = 12*a-9*c;
      const follow = 1-Math.exp(-1.05*STEP);
      vx += (outwardX*targetRadialSpeed+airX-vx)*follow;
      vy += (outwardY*targetRadialSpeed+airY-vy)*follow;
      vz += (54+airZ-vz)*follow;
      x += vx*STEP; y += vy*STEP; z += vz*STEP;
      px = x;
      py = y;
      pz = z;

      // Spring-damped aerodynamic tilting replaces scripted sine rotations.
      const crosswind=-outwardY*airX+outwardX*airY;
      const headwind=outwardX*airX+outwardY*airY;
      const targets=[
        ringRX+32*Math.tanh((airZ+headwind*.35)/35),
        ringRY+38*Math.tanh(crosswind/26),
        ringRZ+22*Math.tanh(crosswind/25)
      ];
      const rates=[pitchRate,yawRate,rollRate],angles=[pitch,yaw,roll];
      for(let k=0;k<3;k++){
        rates[k]+=(2.8*(targets[k]-angles[k])-2.5*rates[k])*STEP;
        angles[k]+=rates[k]*STEP;
      }
      [pitchRate,yawRate,rollRate]=rates;
      [pitch,yaw,roll]=angles;
      rx=pitch;ry=yaw;rz=roll;
    }

    const release = smooth(time, passTime, passTime + .64);
    // Ring-specific vertex wrapping is strongest as the sheet clears
    // the curved lip, then disappears without changing its center path.
    // Keep the sheet attached to the opening from its first (hidden)
    // frame. Ramping the wrap UP after the sheet became visible pulled
    // it backwards into the hole and made it appear to pop in and out.
    // Only the outward release is animated.
    const wrap = 1 - smooth(time, passTime - .16, passTime + .78);
    const visibility = smooth(time, .12, .96) *
      (1 - smooth(time, preset.flight - 1.20, preset.flight - .10));
    const scale = mix(.20, .43, smooth(time, .18, preset.flight - .38)) *
      (.94 + .1 * Math.sin(index * 2.18 + .2));
    const flightSpeed=Math.hypot(vx,vy,vz);
    const loading=clamp(flightSpeed/Math.max(60,targetRadialSpeed),.45,1.45);
    const angular=clamp((Math.abs(pitchRate)+Math.abs(yawRate)+Math.abs(rollRate))/90,0,1);
    const curl=clamp((.43+.31*angular+.15*loading)*(.16+.84*release)*preset.curl,0,1.2);
    const flutter=clamp((.48+.34*angular+.15*loading)*release*preset.flutter,0,1.2);
    frames.push({
      x: px, y: py, z: pz, rx, ry, rz,
      scale, opacity: visibility, curl, flutter, wrap, time,
    });
  }
  return frames;
}

// When the Home section begins scrolling, visible sheets keep travelling
// OUTWARD until they have faded. The gallery's later orbit is untouched.
export function seekHomePaperOutward(initialAge, phase, config = HOME_PAPER_PRESET) {
  const endAge = config.flight / config.duration;
  return mix(initialAge, Math.max(initialAge, endAge),
    smooth(phase, .012, .272));
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
