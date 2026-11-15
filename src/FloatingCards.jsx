import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import './FloatingCards.css';

// Hole Zero One-inspired flowing-paper field. Each source remains the exact
// image supplied in Cards.zip, independently addressable in the scene.
// The source file is a reference for motion, not included in our bundle.
const SOURCE = '/new-homepage/approved-cards/';
const CARD_ASPECTS = [
  1087 / 1446, 1087 / 1446, 1087 / 1446, 1024 / 1535,
  1087 / 1446, 1087 / 1446, 1087 / 1446, 1087 / 1446,
  1087 / 1446, 1087 / 1446, 1087 / 1446, 1087 / 1446,
  896 / 1200,
];
const COUNT = CARD_ASPECTS.length;
const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const CAMERA_Z = 15;
const FOV = 38;
const IDLE_SPEED = 0.073; // full passage roughly every 14 seconds
const SCROLL_SPEED = 0.116; // scroll engages the sustained, faster flow

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function FallbackCards() {
  return (
    <div className="jw-paper-fallback">
      {CARD_ASPECTS.map((_, i) => (
        <img
          key={i}
          src={`${SOURCE}${String(i + 1).padStart(2, '0')}.webp`}
          alt=""
          loading="eager"
          style={{
            '--i': i,
            left: `${50 + 42 * Math.cos(i * GOLDEN_ANGLE)}%`,
            top: `${50 + 42 * Math.sin(i * GOLDEN_ANGLE)}%`,
            transform: `translate(-50%,-50%) rotate(${((i * 17) % 48) - 24}deg)`,
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

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas, alpha: true, antialias: true, powerPreference: 'high-performance',
        premultipliedAlpha: false,
      });
    } catch (error) {
      console.warn('Floating cards WebGL unavailable; showing sharp image fallback.', error);
      setFallback(true);
      return undefined;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    camera.position.z = CAMERA_Z;
    const loader = new THREE.TextureLoader();
    const cards = [];
    const textures = [];
    const imageUrls = CARD_ASPECTS.map((_, index) =>
      `${SOURCE}${String(index + 1).padStart(2, '0')}.webp`);
    const maxAnisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    let disposed = false;
    let webglUnavailable = false;
    let frame = 0;
    let time0 = 0;
    let travel = 0;
    let cyclesPerSecond = IDLE_SPEED;
    let startedScroll = window.scrollY > 8;
    let screenW = 1;
    let screenH = 1;
    let viewW = 1;
    let viewH = 1;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    function measure() {
      if (disposed) return;
      screenW = Math.max(1, window.innerWidth);
      screenH = Math.max(1, window.innerHeight);
      camera.aspect = screenW / screenH;
      camera.updateProjectionMatrix();
      viewH = 2 * CAMERA_Z * Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
      viewW = viewH * camera.aspect;
      renderer.setSize(screenW, screenH, false);
    }

    const noteScroll = () => {
      if (window.scrollY > 8) startedScroll = true;
    };

    const onLost = event => {
      event.preventDefault();
      webglUnavailable = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      setFallback(true);
    };
    canvas.addEventListener('webglcontextlost', onLost);

    // A segmented plane is genuine flexible geometry, not a rigid CSS card.
    // Its two edges and corners curl independently as it travels through 3D.
    CARD_ASPECTS.forEach((aspect, index) => {
      const geometry = new THREE.PlaneGeometry(1, 1, 12, 16);
      const original = geometry.attributes.position.array.slice();
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);
      cards.push({ mesh, geometry, material, original, aspect, index });
      loader.load(imageUrls[index], texture => {
        if (disposed) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = maxAnisotropy;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        material.map = texture;
        material.needsUpdate = true;
        textures.push(texture);
      }, undefined, error => {
        console.warn(`Floating card ${index + 1} could not load:`, error);
      });
    });

    // No teleports in the visible field: each card fades in near the central
    // opening, follows a curved outward path, and fades after crossing an edge.
    // The modulo phase loops indefinitely, with an even distribution of cards.
    function place(card, elapsed) {
      const { mesh, geometry, material, original, index, aspect } = card;
      const p = ((index / COUNT + travel + 0.17) % 1 + 1) % 1;
      const angle = index * GOLDEN_ANGLE + p * 1.25 + 0.22;
      const xDirection = Math.cos(angle);
      const yDirection = Math.sin(angle);
      const inner = viewH * 0.18;
      const edgeX = viewW * 0.5 / Math.max(0.085, Math.abs(xDirection));
      const edgeY = viewH * 0.5 / Math.max(0.085, Math.abs(yDirection));
      const outer = Math.min(edgeX, edgeY) + viewH * 0.24;
      const radius = inner + (outer - inner) * Math.pow(p, 0.93);
      const sway = 0.036 * Math.sin(elapsed * 0.88 + index * 1.9);
      const depth = -0.65 + 1.25 * Math.sin(p * TAU * 0.75 + index * 0.9);

      mesh.position.set(
        Math.cos(angle + sway) * radius,
        Math.sin(angle + sway) * radius,
        depth,
      );
      const worldH = viewH * (0.123 + 0.073 * p) *
        (1 + 0.08 * Math.sin(index * 2.7 + p * TAU));
      mesh.scale.set(worldH * aspect, worldH, worldH);

      // The sheets bank, twist and roll while remaining recognizable rather
      // than constantly turning edge-on. No CSS blur or enlarged tiny sprites.
      const flutter = elapsed * (1.4 + index % 4 * 0.12) + index * 1.72;
      mesh.rotation.set(
        0.20 * Math.sin(flutter * 0.71) + 0.16 * Math.sin(angle),
        0.32 * Math.sin(flutter * 0.58) + 0.19 * Math.cos(angle + p),
        0.18 * Math.sin(index * 1.2 + p * 3.3) + 0.15 * (p - 0.4),
      );

      const vertices = geometry.attributes.position;
      const bend = 0.085 + 0.052 * Math.sin(flutter * 0.64);
      const flex = 0.045 * Math.sin(flutter * 1.17);
      for (let v = 0; v < vertices.count; v++) {
        const j = v * 3;
        const ux = original[j];
        const uy = original[j + 1];
        const edgeCurl = Math.pow(Math.abs(ux) * 2, 1.55);
        // Rounded page curvature with independently flexing leading/trailing
        // corners, making the card behave like thin moving paper.
        const z = bend * edgeCurl * (0.5 + 0.5 * Math.cos(uy * 3 + flutter * 0.8))
          + flex * Math.sin(Math.PI * (ux + 0.5)) * Math.sin(uy * 3.8 + flutter);
        vertices.setXYZ(v, ux, uy + 0.012 * Math.sin(ux * 3.4 + flutter) * edgeCurl, z);
      }
      vertices.needsUpdate = true;

      const appearance = smooth(0.0, 0.12, p) * (1 - smooth(0.85, 1.0, p));
      const distanceFade = clamp(1 - Math.max(0, -depth - 0.25) * 0.09, 0.82, 1);
      material.opacity = appearance * distanceFade;
      mesh.visible = material.opacity > 0.008 && !!material.map;
    }

    function animate(now) {
      frame = requestAnimationFrame(animate);
      if (disposed || webglUnavailable) return;
      const insidePage = home.getBoundingClientRect().top < screenH &&
        work.getBoundingClientRect().bottom > 0;
      const workBottom = work.getBoundingClientRect().bottom;
      const exitOpacity = smooth(-0.15 * screenH, 0.18 * screenH, workBottom);
      canvas.style.opacity = `${insidePage ? exitOpacity : 0}`;
      if (!insidePage || document.hidden) { time0 = now; return; }

      const dt = time0 ? Math.min(0.06, (now - time0) / 1000) : 0;
      time0 = now;
      if (!reduced.matches) {
        cyclesPerSecond += ((startedScroll ? SCROLL_SPEED : IDLE_SPEED) - cyclesPerSecond) *
          (1 - Math.exp(-dt * 2.3));
        travel += dt * cyclesPerSecond;
      }
      const elapsed = reduced.matches ? 0 : travel / IDLE_SPEED;
      for (const card of cards) place(card, elapsed);
      renderer.render(scene, camera);
    }

    measure();
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('scroll', noteScroll, { passive: true });
    frame = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      canvas.removeEventListener('webglcontextlost', onLost);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', noteScroll);
      for (const c of cards) {
        c.geometry.dispose();
        c.material.dispose();
        scene.remove(c.mesh);
      }
      for (const texture of textures) texture.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="jw-floating-card-stage" aria-label="Flowing selected artwork" role="presentation">
      <canvas ref={canvasRef} className="jw-paper-flow-canvas" aria-hidden="true" />
      {fallback && <FallbackCards />}
    </div>
  );
}