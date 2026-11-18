/** Deterministic shared-airfield integration for the homepage paper current.
 * No timers or mutable global state: every sheet precomputes the same path,
 * so scroll-scrubbing remains seekable and reversible.
 */
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const magnitude = v => Math.hypot(v[0],v[1],v[2]);
const unit = v => { const d=Math.max(1e-9,magnitude(v));return v.map(x=>x/d); };
const mulQuat = (a,b) => [
  a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
  a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
  a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
  a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]
];
const normalizeQuat = q => {const d=Math.max(1e-9,Math.hypot(...q));return q.map(x=>x/d);};
const rotate = (q,v) => {
  const qv=q.slice(0,3), u=cross(qv,v), w=cross(qv,u);
  return v.map((value,i)=>value+2*(q[3]*u[i]+w[i]));
};
function fromMeshEuler(rx,ry,rz) {
  // Mesh uses Three.js YXZ order: (-rx, +ry, -rz).
  const x=-rx*RAD/2,y=ry*RAD/2,z=-rz*RAD/2;
  const c1=Math.cos(x),c2=Math.cos(y),c3=Math.cos(z);
  const s1=Math.sin(x),s2=Math.sin(y),s3=Math.sin(z);
  return normalizeQuat([
    s1*c2*c3+c1*s2*s3,
    c1*s2*c3-s1*c2*s3,
    c1*c2*s3-s1*s2*c3,
    c1*c2*c3+s1*s2*s3
  ]);
}
function meshEuler(q, previous) {
  const [x,y,z,w]=q;
  const m11=1-2*(y*y+z*z),m13=2*(x*z+y*w);
  const m21=2*(x*y+z*w),m22=1-2*(x*x+z*z);
  const m23=2*(y*z-x*w),m31=2*(x*z-y*w),m33=1-2*(x*x+y*y);
  const pitch=Math.asin(-clamp(m23,-1,1));
  const yaw=Math.abs(m23)<.9999999?Math.atan2(m13,m33):Math.atan2(-m31,m11);
  const roll=Math.abs(m23)<.9999999?Math.atan2(m21,m22):0;
  const a=[-pitch*DEG,yaw*DEG,-roll*DEG];
  if (!previous) return a;
  const otherPitch=pitch>=0?Math.PI-pitch:-Math.PI-pitch;
  const b=[-otherPitch*DEG,(yaw+Math.PI)*DEG,-(roll+Math.PI)*DEG];
  const adjust=triplet=>triplet.map((v,i)=>v+360*Math.round((previous[i]-v)/360));
  const ca=adjust(a),cb=adjust(b);
  const error=t=>t.reduce((s,v,i)=>s+(v-previous[i])**2,0);
  return error(ca)<error(cb)?ca:cb;
}

/** A three-dimensional air current shared by every sheet. */
export function sampleSharedAir(x,y,z,clock,seed=1) {
  const phase=seed*.37;
  const p=x*.0033+y*.0014+z*.0008+clock*.78+phase;
  const q=-x*.0012+y*.0036-z*.0011-clock*1.04+phase*.71;
  const r=x*.0015-y*.0020+z*.0027+clock*.56-phase*.43;
  // Each term represents a large-scale, continuously moving curl mode.
  return {
    velocity:[
      35*Math.cos(p)+24*Math.sin(q),
      -32*Math.cos(q)+19*Math.sin(r),
      18*Math.sin(p-r)+12*Math.cos(q)
    ],
    vorticity:[.50*Math.sin(r),.40*Math.cos(p),.34*Math.sin(q)]
  };
}

/** Integrates 3D momentum and orientation in the shared current.
 * The existing paper shader applies the resulting flexible curl / flutter.
 */
export function createFloatingPaperDynamics({
  seed, birth, theta, ringRotation, position, velocity,
  radialSpeed, curl=1, flutter=1, step=1/60,
}) {
  let center=[...position];
  let momentum=[...velocity];
  let orientation=fromMeshEuler(...ringRotation);
  let lastAngles=[...ringRotation];
  let spin=[0,0,0];
  const radial=[Math.cos(theta),Math.sin(theta)];
  return {
    step(time) {
      const air=sampleSharedAir(...center,birth+time,seed);
      const desired=[
        radial[0]*radialSpeed+air.velocity[0],
        radial[1]*radialSpeed+air.velocity[1],
        58+air.velocity[2]
      ];
      const velocityLag=1-Math.exp(-.95*step);
      for(let k=0;k<3;k++) {
        momentum[k]+=(desired[k]-momentum[k])*velocityLag;
        center[k]+=momentum[k]*step;
      }
      const direction=unit(momentum);
      const normal=rotate(orientation,[0,0,1]);
      const lateral=cross(normal,direction);
      const torques=[
        1.38*lateral[0]+.52*air.vorticity[0],
        1.38*lateral[1]+.52*air.vorticity[1],
        .72*lateral[2]+.48*air.vorticity[2]
      ];
      const inertia=1.18;
      const damping=Math.exp(-.82*step);
      for(let k=0;k<3;k++)spin[k]=clamp(spin[k]*damping+torques[k]*step/inertia,-1.18,1.18);
      const delta=spin.map(w=>w*step);
      const rotation=magnitude(delta);
      if(rotation>1e-8){
        const s=Math.sin(rotation/2)/rotation;
        orientation=normalizeQuat(mulQuat([...delta.map(v=>v*s),Math.cos(rotation/2)],orientation));
      }
      const angles=meshEuler(orientation,lastAngles);
      lastAngles=angles;
      const differential=magnitude(desired.map((v,i)=>v-momentum[i]));
      const pressure=Math.abs(dot(normal,direction));
      const rotational=magnitude(spin);
      const load=clamp(.38+.45*pressure+.28*rotational+.0018*differential,.22,1.12);
      return {
        x:center[0],y:center[1],z:center[2],
        rx:angles[0],ry:angles[1],rz:angles[2],
        curl:clamp((.40+.52*load)*curl,0,1.2),
        flutter:clamp((.34+.34*load+.14*rotational)*flutter,0,1.2),
      };
    }
  };
}
