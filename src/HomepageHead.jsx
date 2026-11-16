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

  useEffect(() => {
    const host = stage.current;
    const surface = canvas.current;
    if (!host || !surface) return undefined;

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
    let visible = false;
    let frameId = 0;
    let lastFrame = 0;
    let geometry = null;
    let scale = 1;
    // Capture the real model's transparent silhouette into the front-most
    // outline mask. No hand-drawn oval or static substitute can track yaw,
    // blinking and cursor-following geometry accurately.
    const alphaMaskCanvas = document.createElement('canvas');
    // We do not read the mask back to JS. That forced a GPU readback stall
    // on every update, interrupting the rolling letters and cursor-following head.
    const alphaMaskContext = alphaMaskCanvas.getContext('2d');
    let lastMaskFrame = -Infinity;
    let maskEncoding = false;
    let currentMaskUrl = null;
    const retiredMaskUrls = new Set();
    let maskGeneration = 0;
    const releaseMaskUrl = url => {
      if (!url) return;
      retiredMaskUrls.delete(url);
      URL.revokeObjectURL(url);
    };
    const refreshOutlineMask = (now, force = false) => {
      if (!alphaMaskContext || maskEncoding ||
          (!force && now - lastMaskFrame < 38)) return;
      const outline = document.querySelector('.jw-title-head-ink');
      const text = document.querySelector('.jw-title-head-ink__artboard');
      if (!outline || !text) return;
      const bounds = text.getBoundingClientRect();
      if (bounds.bottom < 0 || bounds.top > window.innerHeight) return;

      const vw = Math.max(1, window.innerWidth);
      const vh = Math.max(1, window.innerHeight);
      const width = Math.min(700, Math.max(390, Math.round(vw * .75)));
      const height = Math.max(1, Math.round(width * vh / vw));
      if (alphaMaskCanvas.width !== width || alphaMaskCanvas.height !== height) {
        alphaMaskCanvas.width = width;
        alphaMaskCanvas.height = height;
      }
      const ratio = width / vw;
      const rect = surface.getBoundingClientRect();
      alphaMaskContext.clearRect(0, 0, width, height);
      // Called immediately after the GLB render, while the original
      // transparent silhouette is available in the WebGL framebuffer.
      try {
        alphaMaskContext.drawImage(surface,
          rect.left * ratio, rect.top * ratio,
          rect.width * ratio, rect.height * ratio);
      } catch {
        return; // Retain the previous valid mask.
      }

      lastMaskFrame = now;
      maskEncoding = true;
      const generation = ++maskGeneration;
      // toBlob moves PNG encoding off the critical animation frame. Keep one
      // request in flight; never queue copies when a slower device is busy.
      alphaMaskCanvas.toBlob(blob => {
        maskEncoding = false;
        if (!live || generation !== maskGeneration || !blob?.size ||
            !outline.isConnected) return;
        const nextMaskUrl = URL.createObjectURL(blob);
        const previous = currentMaskUrl;
        currentMaskUrl = nextMaskUrl;
        const maskValue = 'url("' + nextMaskUrl + '")';
        outline.style.maskImage = maskValue;
        outline.style.webkitMaskImage = maskValue;
        outline.dataset.maskReady = 'true';
        if (previous) {
          retiredMaskUrls.add(previous);
          // Retain the prior frame until the new blob-backed mask has reached
          // the compositor; revoking it immediately can flash blank in Safari.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => releaseMaskUrl(previous));
          });
        }
      // WebP retains the transparency silhouette, with a much smaller
      // compressed mask than PNG. Browsers without WebP encoding fall back to
      // PNG automatically according to the canvas API.
      }, 'image/webp', 0.96);
    };

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
      if (!live || !loaded || !visible || document.hidden) return;
      const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
      lastFrame = now;
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
      refreshOutlineMask(now);
      frameId = requestAnimationFrame(animate);
    };
    const start = () => {
      if (!live || !loaded || !visible || document.hidden || frameId) return;
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
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      if (visible) start();
      else stop();
    }, { threshold: 0.01 });
    observer.observe(host);
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
      refreshOutlineMask(performance.now(), true);
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
      maskGeneration += 1; // Discard any encoding callback finishing after unmount.
      if (currentMaskUrl) URL.revokeObjectURL(currentMaskUrl);
      for (const url of retiredMaskUrls) URL.revokeObjectURL(url);
      retiredMaskUrls.clear();
      stop();
      triggerRef.current = null;
      observer.disconnect();
      resizer.disconnect();
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
      renderer.dispose();
    };
  }, []);

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
      />
      {failed && <span className="jw-new-home__sr-only">3D rendering is unavailable; a static portrait is displayed.</span>}
    </div>
  );
}