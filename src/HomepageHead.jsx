import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { HeadController } from './about/controller.js';
import { installSurfaceRipple } from './about/ripple.js';

// The exact 20 MB, SHA-verified Candidate F head already used by /about.html.
// Reuse the model and motion controller, not a generated or approximate portrait.
const HEAD_MODEL = '/about/head-interactive.glb';

export default function HomepageHead({ reducedMotion = false, onImpact }) {
  const stage = useRef(null);
  const canvas = useRef(null);
  const triggerRef = useRef(null);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const onImpactRef = useRef(onImpact);
  onImpactRef.current = onImpact;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [contextVersion, setContextVersion] = useState(0);

  useEffect(() => {
    const host = stage.current;
    const surface = canvas.current;
    if (!host || !surface) return undefined;
    // A restored WebGL context must not inherit the old 'ready' state.
    // Until the first real frame has been drawn, show the approved fallback.
    if (contextVersion > 0) {
      setReady(false);
      setFailed(false);
    }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: surface, alpha: true, antialias: true,
        powerPreference: 'high-performance',
      });
    } catch (error) {
      console.warn('[homepage head] WebGL unavailable; retaining approved static fallback', error);
      setFailed(true);
      return undefined;
    }

    renderer.setClearColor(0xffffff, 0);
    // Keep the approved head sharp without exhausting GPU memory while
    // the independent 21-sheet paper renderer is active on the same page.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    camera.position.set(0, 0, 5.1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd3c4e8, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbca8ff, 1.3);
    rim.position.set(-3, 2, -4);
    scene.add(rim);

    const pivot = new THREE.Group();
    const orient = new THREE.Group();
    scene.add(pivot);
    pivot.add(orient);
    orient.rotation.y = -Math.PI / 2; // The approved Blender model faces +X.

    const controller = new HeadController();
    const hitTester = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const targets = [];
    const rippleSurfaces = new Map();
    const morphTargets = [];
    let live = true;
    let loaded = false;
    let frameId = 0;
    let lastFrame = 0;
    let geometry = null;
    let scale = 1;
    // The outline uses an approved, pre-rendered alpha silhouette embedded
    // with the title on first paint. Never recapture/replace CSS mask URLs here:
    // that GPU readback and image decode caused visible blinking.

    const measure = () => {
      if (!live) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const onPointerMove = event => {
      if (!live || !loaded || event.pointerType === 'touch') return;
      controller.movePointer(
        THREE.MathUtils.clamp(event.clientX / window.innerWidth * 2 - 1, -1, 1),
        THREE.MathUtils.clamp(1 - event.clientY / window.innerHeight * 2, -1, 1),
      );
    };
    const onBlur = () => controller.movePointer(0, 0);
    const getContact = event => {
      if (!live || !loaded || !visible) return null;
      const bounds = surface.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) return null;
      ndc.set(
        (event.clientX - bounds.left) / bounds.width * 2 - 1,
        1 - (event.clientY - bounds.top) / bounds.height * 2,
      );
      pivot.updateWorldMatrix(true, true);
      hitTester.setFromCamera(ndc, camera);
      return hitTester.intersectObjects(targets, true)[0] || null;
    };
    // Project the center of the *moving* head so text waves originate from
    // its actual on-screen location, the same approach as the About experience.
    const headScreenCenter = () => {
      pivot.updateWorldMatrix(true, false);
      const position = pivot.getWorldPosition(new THREE.Vector3()).project(camera);
      const rect = surface.getBoundingClientRect();
      return {
        x: rect.left + (position.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (0.5 - position.y * 0.5) * rect.height,
      };
    };
    const onPointerDown = event => {
      // A click on a navigation/control must never recoil the head.
      if (event.target.closest?.('button, a, input, textarea, select')) return;
      const contact = getContact(event);
      if (!contact) return;
      const projected = contact.point.clone().project(camera);
      const side = projected.x < -0.07 ? -1 : projected.x > 0.07 ? 1 : 0;
      if (controller.hit(side)) {
        rippleSurfaces.get(contact.object)?.trigger(contact.point, controller.time, 1);
        onImpactRef.current?.(headScreenCenter());
      }
    };

    const stop = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      lastFrame = 0;
    };
    const animate = now => {
      frameId = 0;
      if (!live || !loaded || document.hidden) return;
      const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
      lastFrame = now;
      // The SAME body-level head persists from Home through the gallery.
      // Do not use IntersectionObserver to pause it: during GSAP pinning,
      // its fixed portal may be reported as outside the section despite
      // remaining onscreen. Only skip GPU drawing after its real exit.
      const headLayer = host.closest('.jw-continuous-head');
      const headOnscreen = headLayer?.style.visibility !== 'hidden' &&
        Number(headLayer?.style.opacity || 1) > .005;
      if (!headOnscreen) {
        frameId = requestAnimationFrame(animate);
        return;
      }
      const motion = controller.update(dt);
      if (reducedRef.current) {
        pivot.position.set(0, -0.115, 0);
        pivot.rotation.set(0, 0, 0);
        orient.scale.setScalar(scale);
      } else {
        // Stay in the exact center of the approved head placement in the artboard.
        pivot.position.set(motion.horizontal, -0.115 + motion.vertical, motion.depth);
        pivot.rotation.set(motion.pitch, motion.yaw, motion.roll, 'YXZ');
        orient.scale.setScalar(scale * motion.scale);
      }
      for (const ripple of rippleSurfaces.values()) ripple.update(controller.time);
      for (const { mesh, index } of morphTargets) {
        mesh.morphTargetInfluences[index] = motion.blink;
      }
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    const start = () => {
      if (!live || !loaded || document.hidden || frameId) return;
      lastFrame = 0;
      frameId = requestAnimationFrame(animate);
    };
    triggerRef.current = () => {
      if (!live || !loaded) return;
      if (controller.hit(0)) {
        onImpactRef.current?.(headScreenCenter());
        start();
      }
    };
    const onVisibility = () => document.hidden ? stop() : start();
    const onContextLost = event => {
      event.preventDefault();
      loaded = false;
      stop();
      setReady(false);
      setFailed(true);
    };
    const onContextRestored = () => {
      if (live) setContextVersion(version => version + 1);
    };
    surface.addEventListener('webglcontextlost', onContextLost);
    surface.addEventListener('webglcontextrestored', onContextRestored);
    const resizer = new ResizeObserver(measure);
    resizer.observe(host);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    measure();

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.loadAsync(HEAD_MODEL).then(async gltf => {
      if (!live) return;
      geometry = gltf.scene;
      geometry.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(geometry);
      const dimensions = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      // Slightly smaller homepage head (~8.4% reduction); keep its center and motion intact.
      scale = 0.98 / Math.max(dimensions.x, dimensions.y, dimensions.z);
      geometry.position.copy(center).multiplyScalar(-1);
      orient.scale.setScalar(scale);
      orient.add(geometry);
      geometry.traverse(node => {
        if (!node.isMesh) return;
        node.frustumCulled = false;
        targets.push(node);
        rippleSurfaces.set(node, installSurfaceRipple(node));
        Object.entries(node.morphTargetDictionary || {}).forEach(([name, index]) => {
          if (/blink|eyes.?close/i.test(name)) morphTargets.push({ mesh: node, index });
        });
      });
      try {
        await renderer.compileAsync(scene, camera);
      } catch (error) {
        console.warn('[homepage head] Shader warmup deferred to first frame', error);
      }
      if (!live) return;
      renderer.render(scene, camera);
      loaded = true;
      setReady(true);
      start();
    }).catch(error => {
      if (!live) return;
      console.warn('[homepage head] Approved model failed to load', error);
      setFailed(true);
    });

    return () => {
      live = false;
      stop();
      triggerRef.current = null;
      resizer.disconnect();
      surface.removeEventListener('webglcontextlost', onContextLost);
      surface.removeEventListener('webglcontextrestored', onContextRestored);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      geometry?.traverse(node => {
        if (!node.isMesh) return;
        node.geometry?.dispose();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach(material => material?.dispose());
      });
      try { renderer.dispose(); } catch {
        // A lost context may already have disposed its GPU resources.
      }
    };
  }, [contextVersion]);

  return (
    <div
      ref={stage}
      className="jw-new-home__head-stage"
      tabIndex={ready ? 0 : -1}
      role="button"
      aria-label="Interactive floating 3D head; follows the cursor. Press Enter or Space for a reaction."
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          triggerRef.current?.();
        }
      }}
    >
      <canvas
        ref={canvas}
        className={`jw-new-home__head-canvas${ready ? ' is-ready' : ''}`}
        aria-hidden="true"
      />
      <img
        className={`jw-new-home__layer jw-new-home__head-fallback${ready ? ' is-hidden' : ''}`}
        src="/new-homepage/head-placeholder.svg"
        alt=""
        draggable="false"
        aria-hidden="true"
        loading="eager"
        decoding="async"
      />
      {failed && <span className="jw-new-home__sr-only">3D rendering is unavailable; a static portrait is displayed.</span>}
    </div>
  );
}