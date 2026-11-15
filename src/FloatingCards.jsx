import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import './FloatingCards.css';

// Independent implementation of Premotio Hole 01's user-supplied settings.
// Its motion follows a single shared radial field, not independently drifting
// cards. The images are the originals supplied in Cards.zip; the same scene
// persists from Home through Selected Work without re-mounting.
const DIR = '/new-homepage/approved-cards/';
const ASPECTS = [
  1087 / 1446, 1087 / 1446, 1087 / 1446, 1024 / 1535,
  1087 / 1446, 1087 / 1446, 1087 / 1446, 1087 / 1446,
  1087 / 1446, 1087 / 1446, 1087 / 1446, 1087 / 1446,
  896 / 1200,
];
const HOLE = Object.freeze({
  way: 'out', count: 18, seed: 1, ring: 0.31, cardSize: 390,
  flight: 9, period: 12, curl: 1, flutter: 1, lens: 0.2,
  raysNear: 1, raysEdge: 1, shade: 0.30,
});
const TAU = Math.PI * 2;
const PHI = Math.PI * (3 - Math.sqrt(5));
const FOCAL = 1100;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const smooth = (a, b, n) => {
  const x = clamp((n - a) / Math.max(0.00001, b - a), 0, 1);
  return x * x * (3 - 2 * x);
};
const rand = n => {
  const t = Math.sin(n * 127.1 + HOLE.seed * 91.7) * 43758.5453;
  return t - Math.floor(t);
};
const urlFor = n => `${DIR}${String(n + 1).padStart(2, '0')}.webp`;

const VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Optical treatment acts ONLY on the 3D card layer. It produces the faint
// chromatic streaks by the ring and screen edges while protecting sharp card
// detail through the rest of the field. It never blurs the locked typography.
const FRAGMENT = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D frame;
  uniform vec2 resolution;
  uniform float ringRadius;
  uniform float lens;
  uniform float nearRays;
  uniform float edgeRays;
  void main() {
    vec2 centered = (vUv - 0.5) * resolution;
    float distancePx = length(centered);
    float minDim = min(resolution.x, resolution.y);
    vec2 ray = normalize(centered + vec2(0.0001));
    float ringZone = exp(-pow((distancePx - ringRadius) / (minDim * 0.105), 2.0));
    float edge = smoothstep(0.80, 1.0,
      max(abs(vUv.x * 2.0 - 1.0), abs(vUv.y * 2.0 - 1.0)));
    float lensPull = lens * 0.12 * exp(-pow(distancePx / max(ringRadius, 1.0), 2.0));
    vec2 uv = 0.5 + (vUv - 0.5) * (1.0 + lensPull);
    float span = minDim * (0.012 * nearRays * ringZone + 0.018 * edgeRays * edge);
    vec2 delta = ray * span / resolution;
    vec4 crisp = texture2D(frame, uv);
    vec4 blurSum = vec4(0.0);
    for (int i = 0; i < 7; ++i) {
      float p = (float(i) - 3.0) / 3.0;
      vec4 sampleColor = texture2D(frame, uv + p * delta);
      // Subtle RGB separation resembles the reference's ray treatment.
      sampleColor.r = texture2D(frame, uv + (p + 0.14) * delta).r;
      sampleColor.b = texture2D(frame, uv + (p - 0.14) * delta).b;
      blurSum += sampleColor;
    }
    blurSum /= 7.0;
    float rayBlend = min(0.48, nearRays * ringZone * 0.28 + edgeRays * edge * 0.37);
    vec4 color = mix(crisp, blurSum, rayBlend);
    gl_FragColor = vec4(color.rgb, color.a);
  }
`;

function StillCards() {
  return (
    <div className="jw-paper-fallback" aria-hidden="true">
      {ASPECTS.map((_, i) => (
        <img
          key={i}
          src={urlFor(i)}
          alt=""
          style={{
            left: `${50 + 37 * Math.cos(i * PHI)}%`,
            top: `${50 + 41 * Math.sin(i * PHI)}%`,
            transform: `translate(-50%,-50%) rotate(${(i * 29) % 50 - 25}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export default function FloatingCards() {
  const canvasRef = useRef(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const home = document.getElementById('home');
    const work = document.getElementById('work');
    if (!canvas || !home || !work) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) { setFallback(true); return undefined; }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas, alpha: true, antialias: true,
        powerPreference: 'high-performance', premultipliedAlpha: false,
      });
    } catch (error) {
      console.warn('Hole 01 card flow requires WebGL; showing still cards.', error);
      setFallback(true);
      return undefined;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0, 0);
    const world = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 1, 8000);
    camera.position.z = FOCAL;
    const post = new THREE.Scene();
    const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    postCamera.position.z = 1;
    const uniforms = {
      frame: { value: null },
      resolution: { value: new THREE.Vector2(1, 1) },
      ringRadius: { value: 200 },
      lens: { value: HOLE.lens },
      nearRays: { value: HOLE.raysNear },
      edgeRays: { value: HOLE.raysEdge },
    };
    const postMaterial = new THREE.ShaderMaterial({
      uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT,
      transparent: true, depthTest: false, depthWrite: false,
      toneMapped: false,
    });
    const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial);
    post.add(postQuad);

    const loader = new THREE.TextureLoader();
    const textures = Array(ASPECTS.length).fill(null);
    const cards = [];
    const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    let target = null;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let frame = 0;
    let previous = 0;
    let clock = 0;
    let currentRate = 1;
    let hasScrolled = window.scrollY > 8;
    let destroyed = false;
    let contextLost = false;

    // Per-card properties are seeded, fixed and repeatable. Even with thirteen
    // distinct original images, the 18-card layout stays equally populated.
    for (let i = 0; i < HOLE.count; i++) {
      const imageIndex = i % ASPECTS.length;
      const aspect = ASPECTS[imageIndex];
      const geometry = new THREE.PlaneGeometry(aspect, 1, 30, 30);
      const positions = geometry.attributes.position;
      const original = positions.array.slice();
      const colors = new Float32Array(positions.count * 3).fill(1);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff, vertexColors: true,
        side: THREE.DoubleSide, transparent: true,
        opacity: 0, depthWrite: false, toneMapped: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.visible = false;
      world.add(mesh);
      cards.push({
        imageIndex, mesh, geometry, original, material,
        angle: i * PHI + (rand(i + 0.1) - 0.5) * 0.22,
        phase: rand(i + 2.1) * TAU,
        gust: rand(i + 3.7) * 2 - 1,
        tilt: rand(i + 5.3) * 2 - 1,
        index: i,
      });
    }

    ASPECTS.forEach((_, imageIndex) => {
      loader.load(urlFor(imageIndex), texture => {
        if (destroyed) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = maxAniso;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        textures[imageIndex] = texture;
        for (const card of cards) {
          if (card.imageIndex === imageIndex) {
            card.material.map = texture;
            card.material.needsUpdate = true;
          }
        }
      }, undefined, error => {
        console.warn(`Card asset ${imageIndex + 1} unavailable`, error);
      });
    });

    function resize() {
      if (destroyed) return;
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      dpr = Math.min(window.devicePixelRatio || 1, width < 700 ? 1.1 : 1.5);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(height / (2 * FOCAL)));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      target?.dispose();
      target = new THREE.WebGLRenderTarget(
        Math.max(1, Math.floor(width * dpr)), Math.max(1, Math.floor(height * dpr)),
        { format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false },
      );
      target.texture.minFilter = THREE.LinearFilter;
      target.texture.magFilter = THREE.LinearFilter;
      uniforms.frame.value = target.texture;
      uniforms.resolution.value.set(target.width, target.height);
      uniforms.ringRadius.value = HOLE.ring * Math.min(width, height) * dpr;
    }

    const onScroll = () => { if (window.scrollY > 8) hasScrolled = true; };
    const onLost = event => {
      event.preventDefault();
      contextLost = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      setFallback(true);
    };
    canvas.addEventListener('webglcontextlost', onLost);

    // The shared ring is the organizing principle: cards emerge along its rim,
    // drift in a loosely curved current, grow in perspective, and leave beyond
    // the viewport before their 12-second cycle repeats. No on-screen teleport.
    function drawCard(c, time) {
      const age = ((time - c.index * (HOLE.period / HOLE.count)) % HOLE.period + HOLE.period) % HOLE.period;
      if (age >= HOLE.flight || !c.material.map) {
        c.mesh.visible = false;
        return;
      }
      const u = age / HOLE.flight;
      const z = -1920 + 1570 * smooth(0.0, 0.98, u)
        + 120 * Math.sin(u * TAU + c.phase) * Math.sin(u * Math.PI);
      const perspective = FOCAL / (FOCAL - z);
      const angle = c.angle + 0.17 * Math.sin(u * Math.PI * 1.18 + c.gust)
        + 0.06 * Math.sin(u * TAU * 1.7 + c.phase);
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const ring = HOLE.ring * Math.min(width, height);
      const outer = Math.min(
        (width * 0.5 + 200) / Math.max(0.06, Math.abs(dx)),
        (height * 0.5 + 200) / Math.max(0.06, Math.abs(dy)),
      );
      const radial = ring * 0.79 + (outer - ring * 0.79) * Math.pow(u, 1.18);
      const wind = (Math.sin(u * 10.2 + c.phase) * 24 +
        Math.sin(u * 4.7 + c.phase * 0.72) * 21) * Math.sin(u * Math.PI);
      const xScreen = radial * dx + wind * -dy;
      const yScreen = radial * dy + wind * dx;
      c.mesh.position.set(xScreen / perspective, -yScreen / perspective, z);

      const size = HOLE.cardSize * Math.min(1, Math.min(width / 1440, height / 810));
      c.mesh.scale.set(size, size, size);

      // Large but controlled tumbling: the middle of the card remains readable
      // while the border turns through genuine 3D foreshortening.
      const turn = u * TAU;
      c.mesh.rotation.set(
        0.70 * Math.sin(turn * 0.87 + c.phase) + 0.18 * c.tilt,
        0.90 * Math.sin(turn * 0.72 + c.phase * 0.81),
        c.angle + 0.50 * Math.sin(turn * 0.75 + c.phase * 1.16),
        'YXZ',
      );

      const flutter = Math.sin(turn * 2.55 + c.phase) * 0.52 +
        Math.sin(turn * 4.1 + c.phase * 1.34) * 0.24;
      const lift = Math.sin(Math.PI * u) * Math.sin(Math.PI * u);
      const curvature = HOLE.curl * (0.33 + 0.95 * lift + 0.27 * flutter);
      const paperWave = HOLE.flutter * (0.055 + 0.055 * lift);
      const tiltAxis = c.phase * 0.26 + turn * 0.19;
      const ca = Math.cos(tiltAxis);
      const sa = Math.sin(tiltAxis);
      const pos = c.geometry.attributes.position;
      const color = c.geometry.attributes.color;
      const arr = c.original;
      for (let j = 0; j < pos.count; j++) {
        const ix = j * 3;
        const sx = arr[ix];
        const sy = arr[ix + 1];
        const across = sx * ca + sy * sa;
        const along = sy * ca - sx * sa;
        const bend = Math.max(0.04, curvature);
        const curved = Math.sin(across * bend) / bend;
        const depth = (1 - Math.cos(across * bend)) / bend;
        const ripple = paperWave *
          Math.sin(along * 11.5 - time * 2.3 + c.phase) *
          (0.35 + 0.65 * Math.pow(Math.min(1, Math.abs(across) * 2), 1.3));
        const px = curved * ca - along * sa;
        const py = curved * sa + along * ca;
        pos.setXYZ(j, px, py, depth + ripple);
        const diffuse = 1 - HOLE.shade *
          (0.13 + 0.52 * Math.abs(Math.sin(across * bend)) + 0.16 * Math.abs(ripple));
        color.setXYZ(j, diffuse, diffuse, diffuse);
      }
      pos.needsUpdate = true;
      color.needsUpdate = true;
      c.material.opacity = smooth(0.02, 0.16, u) *
        (1 - smooth(0.86, 1.0, u));
      c.mesh.visible = c.material.opacity > 0.005;
    }

    function animate(now) {
      frame = requestAnimationFrame(animate);
      if (destroyed || contextLost) return;
      const h = home.getBoundingClientRect();
      const w = work.getBoundingClientRect();
      const visible = h.top < height && w.bottom > 0;
      canvas.style.opacity = visible ? String(smooth(-height * 0.14, height * 0.22, w.bottom)) : '0';
      if (!visible || document.hidden) { previous = now; return; }
      const delta = previous ? Math.min(0.05, Math.max(0, (now - previous) / 1000)) : 0;
      previous = now;
      // A continuously moving resting field; scrolling sustains the same
      // flight model without resetting the phase or remounting any cards.
      currentRate += ((hasScrolled ? 1.12 : 1.0) - currentRate) *
        (1 - Math.exp(-2 * delta));
      clock += delta * currentRate;
      for (const card of cards) drawCard(card, clock);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(world, camera);
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(post, postCamera);
    }

    resize();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    frame = requestAnimationFrame(animate);
    return () => {
      destroyed = true;
      if (frame) cancelAnimationFrame(frame);
      canvas.removeEventListener('webglcontextlost', onLost);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
      for (const item of cards) {
        item.geometry.dispose();
        item.material.dispose();
        world.remove(item.mesh);
      }
      for (const texture of textures) texture?.dispose();
      target?.dispose();
      postQuad.geometry.dispose();
      postMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="jw-floating-card-stage" role="presentation" aria-label="Hole 01 flowing portfolio cards">
      <canvas ref={canvasRef} className="jw-paper-flow-canvas" aria-hidden="true" />
      {fallback && <StillCards />}
    </div>
  );
}