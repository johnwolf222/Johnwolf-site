import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { HEAD_SILHOUETTE_MASK } from './approvedHeadSilhouetteMask.js';
import './LivePaperRenderer.css';

const TOTAL = 21;
const FOCAL = 1350;
const imageFor = index => '/new-homepage/approved-cards/' +
  String(index + 1).padStart(2, '0') + (index >= 13 ? '.avif' : '.webp');

const VERTEX = `
  varying vec2 vUv;
  varying float vLight;
  uniform float uCurl;
  uniform float uFlutter;
  uniform float uTime;
  uniform float uSeed;
  void main() {
    vUv = uv;
    vec3 pos = position;
    // Bend each paper sheet around a gently rotated material axis.
    float a = .34 + uSeed * .041;
    vec2 axis = vec2(cos(a), sin(a));
    float across = dot(pos.xy, axis);
    float along = dot(pos.xy, vec2(-axis.y, axis.x));
    float bend = max(.0001, uCurl * 2.12);
    float phi = across * bend;
    float bentAcross = sin(phi) / bend;
    float bulge = (1. - cos(phi)) / bend;
    float edge = pow(clamp(abs(across) * 2., 0., 1.), 1.5);
    float paperRipple = uFlutter * (.022 + edge * .039) *
      (sin(along * 13.8 + uTime * 3.6 + uSeed * .83) +
       .33 * sin(along * 21. + uTime * 5.4 + uSeed * .47));
    float twist = uFlutter * edge * .022 *
      sin(along * 8.6 - uTime * 2.8 + uSeed * .31);
    pos.xy = axis * bentAcross +
      vec2(-axis.y, axis.x) * (along + twist);
    pos.z = bulge * .72 + paperRipple;
    float lightFacing = .5 + .5 * cos(phi + .4);
    vLight = clamp(.79 + .26 * lightFacing -
      .10 * abs(paperRipple) * 6. -
      .06 * edge * uCurl, .61, 1.06);
    gl_Position = projectionMatrix * modelViewMatrix *
      vec4(pos, 1.0);
  }
`;
// A SINGLE render pass: every bendable paper mesh samples the GLB's
// permanent alpha silhouette only when behind the head. Front papers pass
// over it normally. Avoids two scene passes and an expensive framebuffer copy.
const PAPER_FRAGMENT = `
  precision highp float;
  varying vec2 vUv;
  varying float vLight;
  uniform sampler2D uTexture;
  uniform sampler2D uHead;
  uniform vec4 uHeadBounds;
  uniform float uHeadOpacity;
  uniform float uBehind;
  uniform float uOpacity;
  uniform vec2 uResolution;
  void main() {
    vec4 paper = texture2D(uTexture, vUv);
    float alpha = paper.a * uOpacity;
    if (uBehind > .5) {
      vec2 uvScreen = gl_FragCoord.xy / uResolution;
      vec2 maskUV = (uvScreen - uHeadBounds.xy) /
        max(uHeadBounds.zw, vec2(.0001));
      float inside = step(0., maskUV.x) * step(0., maskUV.y) *
        step(maskUV.x, 1.) * step(maskUV.y, 1.);
      float maskAlpha = inside *
        texture2D(uHead, clamp(maskUV, 0., 1.)).a;
      alpha *= 1. - maskAlpha * uHeadOpacity;
    }
    gl_FragColor = vec4(paper.rgb * vLight, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
/** Render all 21 cards from the same continuous GPU geometry/clock. */
const LivePaperRenderer = forwardRef(function LivePaperRenderer(props, ref) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  useImperativeHandle(ref, () => ({
    get ready() { return Boolean(engineRef.current?.ready); },
    setPose(index, pose) {
      const e = engineRef.current;
      if (e && index >= 0 && index < TOTAL) e.poses[index] = pose;
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
    // Two WebGL contexts (the permanent GLB head and paper) overwhelm
    // software-only rasterizers. Preserve the same 21 DOM sheets/GSAP clock
    // as an accessible fallback on SwiftShader/llvmpipe rather than freezing
    // the page. Hardware accelerated browsers keep the fully bendable mesh.
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpuName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) :
      gl.getParameter(gl.RENDERER);
    if (/swiftshader|llvmpipe|software renderer|software rasterizer/i.test(String(gpuName))) {
      canvas.dataset.backend = 'software-fallback';
      renderer.dispose();
      return undefined;
    }
    canvas.dataset.backend = 'gpu-paper';
        renderer.setClearColor(0, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    let disposed = false;
    let ready = false;
    const world = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 1, 9000);
    camera.position.z = FOCAL;
    const sharedUniforms = {
      uHead: { value: null },
      uHeadBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
      uHeadOpacity: { value: 1 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    };
    const items = [];
    const poses = Array(TOTAL).fill(null);
    const physicalOrientation = new THREE.Quaternion();
    const plannedOrientation = new THREE.Quaternion();
    for (let index = 0; index < TOTAL; index++) {
      const geometry = new THREE.PlaneGeometry(1, 1, 28, 28);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          ...sharedUniforms,
          uTexture: { value: null },
          uOpacity: { value: 0 },
          uBehind: { value: 1 },
          uCurl: { value: 0 },
          uFlutter: { value: 0 },
          uTime: { value: 0 },
          uSeed: { value: index },
        },
        vertexShader: VERTEX,
        fragmentShader: PAPER_FRAGMENT,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.rotation.order = 'YXZ';
      world.add(mesh);
      items.push({ index, geometry, material, mesh,
        widthFactor: 1, heightFactor: 1, mapReady: false });
    }

    const loader = new THREE.TextureLoader();
    const textures = [];
    let maskTexture;
    let width = 1, height = 1, dpr = 1;
    let paperWidth = 270;
    function resize() {
      if (disposed) return;
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      // The original head uses its own canvas; cap the independent paper
      // raster at native pixel density to avoid doubling GPU fill pressure.
      dpr = Math.min(window.devicePixelRatio || 1, 1);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      camera.fov = THREE.MathUtils.radToDeg(
        2 * Math.atan(height / (2 * FOCAL)));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      sharedUniforms.uResolution.value.set(width * dpr, height * dpr);
      const card = document.querySelector('.jw-projects-stage__card');
      paperWidth = card?.offsetWidth ||
        (width <= 800 ? Math.min(width * .55, 285) : Math.min(width * .26, 370));
      // Natural card aspect is taken from EACH loaded texture, never from
      // the generic DOM card's rectangular layout box.
    }

    let scheduled = 0;
    let pendingProgress = 0;
    function draw(progress) {
      pendingProgress = progress;
      if (!ready || disposed || scheduled) return;
      // ScrollTrigger, resizing and the Home clock may all request a render
      // in the same animation frame. Collapse them into ONE GPU draw with the
      // newest 21 poses, rather than rendering the entire scene repeatedly.
      scheduled = requestAnimationFrame(() => {
        scheduled = 0;
        renderNow(pendingProgress);
      });
    }
    function renderNow(progress) {
      if (!ready || disposed) return;
      const head = document.querySelector('.jw-continuous-head');
      const surface = document.querySelector('.jw-new-home__head-canvas');
      if (surface) {
        const rect = surface.getBoundingClientRect();
        sharedUniforms.uHeadBounds.value.set(
          rect.left / width, (height - rect.bottom) / height,
          rect.width / width, rect.height / height,
        );
      }
      sharedUniforms.uHeadOpacity.value =
        Math.max(0, Math.min(1, Number(head?.style.opacity || '1')));
      canvas.style.zIndex = progress < .275 ? '1' : '12';
      for (const item of items) {
        const pose = poses[item.index];
        if (!pose || pose.opacity < .006 || !item.mapReady) {
          item.mesh.visible = false;
          continue;
        }
        item.mesh.visible = true;
        item.material.uniforms.uBehind.value = pose.front ? 0 : 1;
        item.mesh.position.set(pose.x, -pose.y, pose.z);
        // The locked Hole 01 card size is 390px on desktop; the Gallery's
        // established cards use their own width. Ease between those sizes
        // during scroll, without changing the transition's choreography.
        const homeSize = width > 800 ?
          Math.min(390, paperWidth * 1.25) : paperWidth;
        const blendT = Math.max(0, Math.min(1, progress / .14));
        const eased = blendT * blendT * (3 - 2 * blendT);
        const sheetExtent = paperWidth + (homeSize - paperWidth) * (1 - eased);
        const sheetSize = sheetExtent * pose.scale;
        item.mesh.scale.set(
          sheetSize * item.widthFactor,
          sheetSize * item.heightFactor,
          sheetSize,
        );
        item.mesh.rotation.set(
          -THREE.MathUtils.degToRad(pose.rx),
          THREE.MathUtils.degToRad(pose.ry),
          -THREE.MathUtils.degToRad(pose.rz),
          'YXZ',
        );
        // On Home the actual airflow simulation owns the paper's 3D
        // orientation. Blend back to the existing GSAP gallery rotations as
        // scrolling begins; never restart the card or swap its texture.
        if (pose.q && progress < .10) {
          plannedOrientation.copy(item.mesh.quaternion);
          physicalOrientation.fromArray(pose.q).normalize();
          const t = THREE.MathUtils.clamp(
            (progress - .012) / (.092 - .012), 0, 1);
          const blend = t * t * (3 - 2 * t);
          item.mesh.quaternion.copy(physicalOrientation)
            .slerp(plannedOrientation, blend);
        }
        item.material.uniforms.uOpacity.value = pose.opacity;
        item.material.uniforms.uCurl.value = pose.curl;
        item.material.uniforms.uFlutter.value = pose.flutter ?? 1;
        item.material.uniforms.uTime.value = pose.time;
      }
      renderer.clear();
      renderer.render(world, camera);
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
        // Approved Hole 01: Card aspect = Natural. Normalize each sheet
        // inside a square bounding size without ever stretching its artwork.
        const image = texture.image;
        const intrinsicW = image?.naturalWidth || image?.width || 1;
        const intrinsicH = image?.naturalHeight || image?.height || 1;
        const aspect = Math.max(.08, Math.min(12, intrinsicW / intrinsicH));
        item.widthFactor = Math.min(1, aspect);
        item.heightFactor = Math.min(1, 1 / aspect);
                texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        item.material.uniforms.uTexture.value = texture;
        item.mapReady = true;
        textures.push(texture);
        resolve(true);
      }, undefined, () => resolve(false));
    }));
    const maskPromise = new Promise(resolve => {
      loader.load(HEAD_SILHOUETTE_MASK, texture => {
        if (disposed) { texture.dispose(); resolve(false); return; }
        maskTexture = texture;
        sharedUniforms.uHead.value = texture;
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
      cancelAnimationFrame(scheduled);
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
      renderer.dispose();
    };
  }, []);

  return createPortal(
    <canvas ref={canvasRef} className="jw-live-paper-canvas"
      aria-hidden="true" />, document.body
  );
});

export default LivePaperRenderer;
