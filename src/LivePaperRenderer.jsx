import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { HEAD_SILHOUETTE_MASK } from './approvedHeadSilhouetteMask.js';
import './LivePaperRenderer.css';

const TOTAL = 21;
const FOCAL = 1350;
const imageFor = index => '/new-homepage/approved-cards/' +
  String(index + 1).padStart(2, '0') + (index >= 13 ? '.avif' : '.webp');

const VERTEX = \`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
\`;
// The rear pass is composited WITHOUT covering the original GLB head. The
// mask is the same approved permanent head silhouette as the headline ink.
const COMPOSITE = \`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPaper;
  uniform sampler2D uHead;
  uniform vec4 uHeadBounds;
  uniform float uHeadOpacity;
  void main() {
    vec4 paper = texture2D(uPaper, vUv);
    vec2 maskUV = (vUv - uHeadBounds.xy) /
      max(uHeadBounds.zw, vec2(.0001));
    float inside = step(0., maskUV.x) * step(0., maskUV.y) *
      step(maskUV.x, 1.) * step(maskUV.y, 1.);
    float silhouette = inside * texture2D(uHead, clamp(maskUV, 0., 1.)).a;
    float alpha = paper.a * (1. - silhouette * uHeadOpacity);
    gl_FragColor = vec4(paper.rgb, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
\`;

function deform(item, curl, time) {
  const bend = Math.max(.001, Math.min(1.15, curl));
  const position = item.geometry.attributes.position;
  const color = item.geometry.attributes.color;
  const original = item.original;
  const axis = .28 + item.index * .027;
  const ca = Math.cos(axis), sa = Math.sin(axis);
  for (let i = 0; i < position.count; i++) {
    const p = i * 3;
    const sx = original[p], sy = original[p + 1];
    const across = sx * ca + sy * sa;
    const along = sy * ca - sx * sa;
    const angle = across * bend * 1.8;
    const curved = Math.sin(angle) / (bend * 1.8);
    const depth = (1 - Math.cos(angle)) / (bend * 1.8);
    const edge = .38 + .62 * Math.pow(Math.min(1, Math.abs(across) * 2), 1.35);
    const flutter = curl * .067 * edge *
      Math.sin(along * 12.2 - time * 2.8 + item.index * .73);
    const torsion = curl * .021 * Math.sin(along * 5.1 +
      time * 3.4 + item.index * .38) * Math.abs(across);
    const px = curved * ca - (along + torsion) * sa;
    const py = curved * sa + (along + torsion) * ca;
    position.setXYZ(i, px, py, depth * .83 + flutter);
    const shade = 1 - .19 * Math.abs(Math.sin(angle)) -
      .12 * Math.min(1, Math.abs(flutter) * 5);
    color.setXYZ(i, shade, shade, shade);
  }
  position.needsUpdate = true;
  color.needsUpdate = true;
}

/**
 * The one continuous card renderer. Exactly 21 meshes, each containing the
 * approved image on one bendable tessellated surface. No video, no duplicate
 * scene, no DOM-strip layers. The original GLB head keeps its renderer and
 * is occluded in the paper's single GPU composite using its locked mask.
 */
const LivePaperRenderer = forwardRef(function LivePaperRenderer(props, ref) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  useImperativeHandle(ref, () => ({
    get ready() { return Boolean(engineRef.current?.ready); },
    setPose(index, pose) {
      const e = engineRef.current;
      if (e && e.poses[index]) e.poses[index] = pose;
    },
    draw(progress) { engineRef.current?.draw(progress); },
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas, alpha: true, antialias: true, premultipliedAlpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      // The flat fallback is the same set of 21 approved DOM artworks.
      return undefined;
    }
    renderer.setClearColor(0, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    let disposed = false;
    let ready = false;
    const behind = new THREE.Scene();
    const ahead = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 1, 9000);
    camera.position.z = FOCAL;
    const compositor = new THREE.Scene();
    const compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    compositeCamera.position.z = 1;
    const uniforms = {
      uPaper: { value: null },
      uHead: { value: null },
      uHeadBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
      uHeadOpacity: { value: 1 },
    };
    const compositeMaterial = new THREE.ShaderMaterial({
      uniforms, vertexShader: VERTEX, fragmentShader: COMPOSITE,
      depthTest: false, depthWrite: false, transparent: true,
      toneMapped: false,
    });
    const compositeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMaterial);
    compositor.add(compositeQuad);
    const items = [];
    const poses = Array(TOTAL).fill(null);
    for (let index = 0; index < TOTAL; index++) {
      const geometry = new THREE.PlaneGeometry(1, 1, 14, 18);
      const pos = geometry.attributes.position;
      const original = pos.array.slice();
      const colors = new Float32Array(pos.count * 3).fill(1);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff, side: THREE.DoubleSide,
        transparent: true, depthWrite: false,
        vertexColors: true, toneMapped: false, opacity: 0,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.rotation.order = 'YXZ';
      behind.add(mesh);
      items.push({ index, geometry, material, mesh, original, front: false,
        mapReady: false });
    }

    const loader = new THREE.TextureLoader();
    const textures = [];
    let maskTexture;
    let rearTarget;
    let width = 1, height = 1, dpr = 1;
    let paperWidth = 270, paperHeight = 420;
    function resize() {
      if (disposed) return;
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      dpr = Math.min(window.devicePixelRatio || 1, width < 700 ? 1 : 1.5);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      camera.fov = THREE.MathUtils.radToDeg(
        2 * Math.atan(height / (2 * FOCAL)));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      rearTarget?.dispose();
      rearTarget = new THREE.WebGLRenderTarget(
        Math.max(1, Math.round(width * dpr)),
        Math.max(1, Math.round(height * dpr)),
        { format: THREE.RGBAFormat, depthBuffer: true },
      );
      rearTarget.texture.minFilter = THREE.LinearFilter;
      rearTarget.texture.magFilter = THREE.LinearFilter;
      uniforms.uPaper.value = rearTarget.texture;
      const card = document.querySelector('.jw-projects-stage__card');
      paperWidth = card?.offsetWidth ||
        (width <= 800 ? Math.min(width * .55, 285) : Math.min(width * .26, 370));
      paperHeight = card?.offsetHeight ||
        (width <= 800 ? Math.min(height * .43, 390) : Math.min(height * .55, 495));
    }

    function draw(progress) {
      if (!ready || disposed || !rearTarget) return;
      const head = document.querySelector('.jw-continuous-head');
      const surface = document.querySelector('.jw-new-home__head-canvas');
      if (surface) {
        const rect = surface.getBoundingClientRect();
        uniforms.uHeadBounds.value.set(
          rect.left / width, (height - rect.bottom) / height,
          rect.width / width, rect.height / height,
        );
      }
      uniforms.uHeadOpacity.value =
        Math.max(0, Math.min(1, Number(head?.style.opacity || '1')));
      canvas.style.zIndex = progress < .275 ? '1' : '12';
      for (const item of items) {
        const pose = poses[item.index];
        if (!pose || pose.opacity < .006 || !item.mapReady) {
          item.mesh.visible = false;
          continue;
        }
        item.mesh.visible = true;
        if (pose.front !== item.front) {
          if (item.front) ahead.remove(item.mesh);
          else behind.remove(item.mesh);
          (pose.front ? ahead : behind).add(item.mesh);
          item.front = pose.front;
        }
        item.mesh.position.set(pose.x, -pose.y, pose.z);
        item.mesh.scale.set(
          paperWidth * pose.scale, paperHeight * pose.scale,
          paperWidth * pose.scale,
        );
        item.mesh.rotation.set(
          -THREE.MathUtils.degToRad(pose.rx),
          THREE.MathUtils.degToRad(pose.ry),
          -THREE.MathUtils.degToRad(pose.rz),
          'YXZ',
        );
        item.material.opacity = pose.opacity;
        deform(item, pose.curl, pose.time);
      }
      renderer.setRenderTarget(rearTarget);
      renderer.clear();
      renderer.render(behind, camera);
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(compositor, compositeCamera);
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(ahead, camera);
      renderer.autoClear = true;
      if (!canvas.classList.contains('is-ready')) {
        canvas.classList.add('is-ready');
        document.body.classList.add('jw-live-paper-ready');
      }
    }

    const engine = { poses, draw, get ready() { return ready; } };
    engineRef.current = engine;
    const contextLost = e => {
      e.preventDefault();
      ready = false;
      canvas.classList.remove('is-ready');
      document.body.classList.remove('jw-live-paper-ready');
    };
    canvas.addEventListener('webglcontextlost', contextLost);
    resize();
    window.addEventListener('resize', resize, { passive: true });
    const texturePromises = items.map(item => new Promise(resolve => {
      loader.load(imageFor(item.index), texture => {
        if (disposed) { texture.dispose(); resolve(false); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        item.material.map = texture;
        item.material.needsUpdate = true;
        item.mapReady = true;
        textures.push(texture);
        resolve(true);
      }, undefined, () => resolve(false));
    }));
    const maskPromise = new Promise(resolve => {
      loader.load(HEAD_SILHOUETTE_MASK, texture => {
        if (disposed) { texture.dispose(); resolve(false); return; }
        maskTexture = texture;
        uniforms.uHead.value = texture;
        resolve(true);
      }, undefined, () => resolve(false));
    });
    Promise.all([...texturePromises, maskPromise]).then(ok => {
      if (!disposed && ok.every(Boolean)) {
        ready = true;
        // The caller already owns the same card positions and clock; draw
        // those poses on the GPU before hiding the flat fallback.
        draw(0);
      }
    });

    return () => {
      disposed = true;
      engineRef.current = null;
      canvas.classList.remove('is-ready');
      document.body.classList.remove('jw-live-paper-ready');
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', contextLost);
      items.forEach(item => {
        item.geometry.dispose();
        item.material.dispose();
      });
      textures.forEach(texture => texture.dispose());
      maskTexture?.dispose();
      rearTarget?.dispose();
      compositeQuad.geometry.dispose();
      compositeMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return createPortal(
    <canvas ref={canvasRef} className="jw-live-paper-canvas"
      aria-hidden="true" />, document.body
  );
});

export default LivePaperRenderer;
