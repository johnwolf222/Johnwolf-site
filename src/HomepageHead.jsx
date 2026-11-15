import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { HeadController } from './about/controller.js';
import { installSurfaceRipple } from './about/ripple.js';

// The exact 20 MB, SHA-verified Candidate F head already used by /about.html.
// Reuse the model and motion controller, not a generated or approximate portrait.
const HEAD_MODEL = '/about/head-interactive.glb';

export default function HomepageHead({ reducedMotion = false }) {
  const stage = useRef(null);
  const canvas = useRef(null);
  const triggerRef = useRef(null);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
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
    const onPointerDown = event => {
      // A click on a navigation/control must never recoil the head.
      if (event.target.closest?.('button, a, input, textarea, select')) return;
      const contact = getContact(event);
      if (!contact) return;
      const projected = contact.point.clone().project(camera);
      const side = projected.x < -0.07 ? -1 : projected.x > 0.07 ? 1 : 0;
      if (controller.hit(side)) {
        rippleSurfaces.get(contact.object)?.trigger(contact.point, controller.time, 1);
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
      frameId = requestAnimationFrame(animate);
    };
    const start = () => {
      if (!live || !loaded || !visible || document.hidden || frameId) return;
      lastFrame = 0;
      frameId = requestAnimationFrame(animate);
    };
    triggerRef.current = () => {
      if (!live || !loaded) return;
      controller.hit(0);
      start();
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