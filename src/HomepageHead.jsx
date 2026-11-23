import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { HeadController, pointerRelativeToHead } from './about/controller.js';
import { installSurfaceRipple } from './about/ripple.js';
import { installFloatingStory } from './about/floating-story.js';
import { installOpticalRipple } from './about/optical-ripple.js';
import { isMobileHeadTap } from './about/mobile-interactions.js';

// The exact 20 MB, SHA-verified Candidate F head already used by /about.html.
// Reuse the model and motion controller, not a generated or approximate portrait.
const HEAD_MODEL = '/about/head-interactive.glb';

export default function HomepageHead({ reducedMotion = false, onImpact, onAnchor }) {
  const stage = useRef(null);
  const canvas = useRef(null);
  const triggerRef = useRef(null);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const onImpactRef = useRef(onImpact);
  onImpactRef.current = onImpact;
  const onAnchorRef = useRef(onAnchor);
  onAnchorRef.current = onAnchor;
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
    const aboutSection = document.querySelector('.jw-about-experience');
    const aboutLines = aboutSection
      ? [...aboutSection.querySelectorAll('.jw-about-line')] : [];
    // Both effects live in this exact existing renderer, not a second head.
    // The text-planes remain hidden until Section 3 is actually onscreen.
    const floatingStory = aboutSection && !reducedRef.current &&
      window.innerWidth > 800
      ? installFloatingStory(scene, camera, host, aboutSection) : null;
    floatingStory?.setVisible(false);
    const opticalRipple = aboutSection && !reducedRef.current
      ? installOpticalRipple(renderer, scene, camera, pivot, aboutLines) : null;
    let aboutColorTarget = 0;
    let aboutColorAmount = 0;
    const onAboutColor = event => {
      aboutColorTarget = event.detail?.enabled ? 1 : 0;
    };
    window.addEventListener('jw-about-color', onAboutColor);
    const aboutBounds = () => aboutSection?.getBoundingClientRect();
    const aboutIsVisible = () => {
      const rect = aboutBounds();
      return Boolean(rect && rect.top < window.innerHeight &&
        rect.bottom > 0);
    };
    const fireImpact = center => {
      if (aboutIsVisible()) {
        floatingStory?.triggerImpact(center.x, center.y);
        opticalRipple?.trigger(center.x, center.y,
          surface.getBoundingClientRect(), controller.time);
        window.dispatchEvent(new CustomEvent('jw-about-impact', {
          detail: center,
        }));
      } else {
        onImpactRef.current?.(center);
      }
    };
    let live = true;
    let loaded = false;
    let frameId = 0;
    let lastFrame = 0;
    let geometry = null;
    let scale = 1;
    let headHalfHeight = 0.49;
    let visualAnchorFrames = 0;
    let aboutProjectionFrames = 0;
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
      opticalRipple?.resize();
      if (loaded) { publishHeadAnchor(); publishVisibleHeadOrbit(); }
    };
    let headTouch = null;
    let activeTouchId = null;
    const followScreenPoint = (clientX, clientY) => {
      if (!live || !loaded) return;
      // Follow every finger position on the page, regardless of whether
      // the touch began on Home, a project, a story word, or a button.
      const center = headScreenCenter();
      const target = pointerRelativeToHead(
        clientX, clientY, center.x, center.y,
        window.innerWidth, window.innerHeight,
      );
      controller.movePointer(target.x, target.y);
    };
    const onPointerMove = event => {
      if (event.pointerType !== 'touch')
        followScreenPoint(event.clientX, event.clientY);
    };
    const onTouchStart = event => {
      if (activeTouchId !== null) return;
      const touch = event.changedTouches?.[0];
      if (!touch) return;
      activeTouchId = touch.identifier;
      followScreenPoint(touch.clientX, touch.clientY);
    };
    const onTouchMove = event => {
      if (activeTouchId === null) return;
      const touch = Array.from(event.touches).find(
        candidate => candidate.identifier === activeTouchId);
      if (touch) followScreenPoint(touch.clientX, touch.clientY);
    };
    const onTouchEnd = event => {
      if (activeTouchId === null) return;
      if (Array.from(event.touches).some(
          touch => touch.identifier === activeTouchId)) return;
      activeTouchId = null;
      controller.movePointer(0, 0);
    };
    const onBlur = () => {
      activeTouchId = null;
      controller.movePointer(0, 0);
    };
    const getContact = event => {
      // The old `visible` identifier was undeclared and could throw on any
      // pointer hit. Read the real shared head layer instead.
      const layer = host.closest('.jw-continuous-head');
      if (!live || !loaded || layer?.style.visibility === 'hidden' ||
          Number(layer?.style.opacity || 1) <= .005) return null;
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
    // Anchor the MOBILE paper circle to the rendered GLB geometry itself.
    // The earlier anchor was a static mask and did not track the real head.
    // Project each visible mesh's eight local bounding-box corners through
    // the actual head camera: no GPU readback, guesswork or canvas midpoint.
    const publishVisibleHeadOrbit = () => {
      if (!geometry || window.innerWidth > 800) return;
      const layer = host.closest('.jw-continuous-head');
      if (!layer) return;
      geometry.updateWorldMatrix(true, true);
      camera.updateMatrixWorld();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      const corner = new THREE.Vector3();
      geometry.traverse(node => {
        if (!node.isMesh || !node.visible || !node.geometry) return;
        if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        const box = node.geometry.boundingBox;
        if (!box || box.isEmpty()) return;
        for (const x of [box.min.x, box.max.x]) {
          for (const y of [box.min.y, box.max.y]) {
            for (const z of [box.min.z, box.max.z]) {
              corner.set(x, y, z).applyMatrix4(node.matrixWorld).project(camera);
              minX = Math.min(minX, corner.x);
              maxX = Math.max(maxX, corner.x);
              minY = Math.min(minY, corner.y);
              maxY = Math.max(maxY, corner.y);
            }
          }
        }
      });
      if (![minX, maxX, minY, maxY].every(Number.isFinite)) return;
      const rect = surface.getBoundingClientRect();
      const cx = rect.left + rect.width * (.5 + (minX + maxX) * .25);
      const cy = rect.top + rect.height * (.5 - (minY + maxY) * .25);
      // Publish the same REAL projected mesh silhouette used for the
      // mobile paper ring. Native About text lines then steer around
      // its changing ellipse rather than passing under the head.
      if (aboutSection && aboutIsVisible()) {
        aboutSection.dispatchEvent(new CustomEvent('jw-about-head-envelope', {
          detail: {
            left: rect.left + (minX * .5 + .5) * rect.width,
            right: rect.left + (maxX * .5 + .5) * rect.width,
            top: rect.top + (.5 - maxY * .5) * rect.height,
            bottom: rect.top + (.5 - minY * .5) * rect.height,
          },
        }));
      }
      // Store the face's LOCAL offset from its own GLB canvas center.
      // Unlike the old window.innerHeight-based subtraction this remains
      // invariant if Safari grows its visual viewport, or Projects scales
      // and translates the entire head artboard. The paper ring and GPU
      // silhouette mask consume this same source of truth.
      const scale = Number.parseFloat(
        layer.style.getPropertyValue('--jw-head-scale')) || 1;
      const surfaceCenterX = rect.left + rect.width * .5;
      const surfaceCenterY = rect.top + rect.height * .5;
      layer.style.setProperty('--jw-visible-head-orbit-x',
        ((cx - surfaceCenterX) / scale).toFixed(3) + 'px');
      layer.style.setProperty('--jw-visible-head-orbit-y',
        ((cy - surfaceCenterY) / scale).toFixed(3) + 'px');
    };
    // The typography uses the *projected model center and top*, not the
    // 16:9 artboard midpoint. Publish only on load and resize: following every
    // animated nod would make mobile text jitter alongside the head.
    const publishHeadAnchor = () => {
      if (!loaded || !onAnchorRef.current) return;
      pivot.updateWorldMatrix(true, false);
      const center = pivot.getWorldPosition(new THREE.Vector3());
      const top = center.clone().add(new THREE.Vector3(0, headHalfHeight, 0));
      const bottom = center.clone().add(new THREE.Vector3(0, -headHalfHeight, 0));
      const projectedCenter = center.project(camera);
      const projectedTop = top.project(camera);
      const projectedBottom = bottom.project(camera);
      const rect = surface.getBoundingClientRect();
      onAnchorRef.current({
        x: rect.left + (projectedCenter.x * .5 + .5) * rect.width,
        y: rect.top + (.5 - projectedCenter.y * .5) * rect.height,
        topY: rect.top + (.5 - projectedTop.y * .5) * rect.height,
        bottomY: rect.top + (.5 - projectedBottom.y * .5) * rect.height,
      });
    };
    const reactToHeadContact = contact => {
      const projected = contact.point.clone().project(camera);
      const side = projected.x < -0.07 ? -1 : projected.x > 0.07 ? 1 : 0;
      if (controller.hit(side)) {
        rippleSurfaces.get(contact.object)?.trigger(contact.point, controller.time, 1);
        fireImpact(headScreenCenter());
      }
    };
    const onPointerDown = event => {
      // A touch meant for words, tools, or another control must not
      // accidentally hit the head behind it.
      if (event.target.closest?.(
        'button, a, input, textarea, select, .jw-about-message, .jw-about-tools'))
        return;
      const contact = getContact(event);
      if (!contact) return;
      if (event.pointerType === 'touch') {
        if (window.innerWidth > 800 || !aboutIsVisible()) return;
        headTouch = {
          id: event.pointerId, x: event.clientX,
          y: event.clientY, contact,
        };
        // A tap reacts on release; a drag follows the finger without a
        // recoil or stealing the browser's native vertical scrolling.
        return;
      }
      reactToHeadContact(contact);
    };
    const onPointerUp = event => {
      if (!headTouch || headTouch.id !== event.pointerId) return;
      const initial = headTouch;
      headTouch = null;
      if (event.type !== 'pointercancel' &&
          isMobileHeadTap(initial.x, initial.y,
            event.clientX, event.clientY) && aboutIsVisible())
        reactToHeadContact(initial.contact);
      if (activeTouchId === null) controller.movePointer(0, 0);
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
      const aboutActive = aboutIsVisible();
      // Re-measure the actual moving beanie/face every fourth frame while
      // About is visible. The rest of the website keeps its existing fast
      // one-time orbit and typography anchor measurements.
      if (aboutActive && window.innerWidth <= 800 &&
          ++aboutProjectionFrames % 4 === 0)
        publishVisibleHeadOrbit();
      const rect = aboutBounds();
      aboutSection?.classList.toggle('jw-about-reading',
        aboutActive && rect.top < -window.innerHeight * .62);
      if (!aboutActive) aboutColorTarget = 0;
      aboutColorAmount += (aboutColorTarget - aboutColorAmount) *
        (1 - Math.exp(-dt * 5.5));
      for (const ripple of rippleSurfaces.values()) {
        ripple.colorMix.value = aboutColorAmount;
        ripple.update(controller.time);
      }
      // On desktop reuse the original shader-driven scroll layout. On
      // phones/reduced-motion retain the exact source paragraphs as DOM
      // text, where a full-height CSS transform cannot clip the prose.
      const storyActive = aboutActive && floatingStory &&
        window.innerWidth > 800 && !reducedRef.current;
      if (storyActive) {
        floatingStory.update(dt);
        floatingStory.setVisible(true);
        aboutSection.classList.add('jw-about-three-ready');
      } else {
        floatingStory?.setVisible(false);
        aboutSection?.classList.remove('jw-about-three-ready');
      }
      for (const { mesh, index } of morphTargets) {
        mesh.morphTargetInfluences[index] = motion.blink;
      }
      if (aboutActive && opticalRipple && !reducedRef.current) {
        opticalRipple.setEnabled(true);
        opticalRipple.render(controller.time);
      } else {
        renderer.render(scene, camera);
      }
      // Measure again once the first animation frame has applied its
      // real -0.115 head Y translation, not just the load-time GLB pose.
      if (visualAnchorFrames < 2) {
        publishVisibleHeadOrbit();
        visualAnchorFrames++;
      }
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
        fireImpact(headScreenCenter());
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
    // Passive touch listeners remain active during native vertical scrolling.
    // No touch-action overrides, pointer capture, or preventDefault calls.
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
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
      headHalfHeight = dimensions.y * scale * 0.5;
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
      // Pre-size About's scroll story before the user gets there, so the
      // section doesn't collapse while the gallery is swiping offscreen.
      floatingStory?.prepare();
      loaded = true;
      publishHeadAnchor();
      publishVisibleHeadOrbit();
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
      window.removeEventListener('jw-about-color', onAboutColor);
      floatingStory?.dispose();
      opticalRipple?.dispose();
      aboutSection?.classList.remove('jw-about-three-ready', 'jw-about-reading');
      surface.removeEventListener('webglcontextlost', onContextLost);
      surface.removeEventListener('webglcontextrestored', onContextRestored);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      activeTouchId = null;
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      headTouch = null;
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