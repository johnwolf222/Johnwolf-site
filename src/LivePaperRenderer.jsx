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
  varying float vOpeningReveal;
  uniform float uCurl;
  uniform float uFlutter;
  uniform float uTime;
  uniform float uSeed;
  uniform float uExitWrap;
  uniform float uRimRadius;
  void main() {
    vUv = uv;
    vec3 pos = position;
    // Fold lines cross each sheet horizontally in its local coordinates.
    // The bend changes with local Y, not X. Sheet rotation is handled
    // separately by its 3D pose so the fold follows the paper naturally.
    float across = pos.y;
    float along = pos.x;
    // Fold the sheet around the ring lip during departure. This shapes
    // individual vertices but does not move or rearrange card centers.
    float bend = max(.0001, uCurl * 2.12 + uExitWrap * 2.0);
    float phi = across * bend;
    float bentAcross = sin(phi) / bend;
    float bulge = (1. - cos(phi)) / bend;
    float edge = pow(clamp(abs(across) * 2., 0., 1.), 1.5);
    // The wide curl bends along local Y; the much smaller air ripple
    // travels across local X. Keep these effects separate so a sheet
    // has a horizontal fold without horizontal bands of flutter.
    // Use one broad wave, rather than several sharp fabric-like wrinkles.
    float ripplePhase = along * 3.14159 + uTime * 8.1 +
      uSeed * 1.61;
    float paperRipple = uFlutter * .042 * sin(ripplePhase);
    float rippleSlope = uFlutter * .042 * 3.14159 * cos(ripplePhase);
    // CENTER OPENING ONLY: feed each vertex along the rounded rim,
    // rather than bending and revealing the entire card at once.
    // Geometry is a circular cross-section around the opening; the
    // cross-section radius is tied to the physical ring, not an
    // arbitrary screen-space ripple.
    float rimGate = clamp(uExitWrap, 0.0, 1.0);
    float emergence = smoothstep(.18, 1.68, uTime);
    float rimAngle = mix(3.141593, .872665, emergence);
    float rimRadius = max(.16, uRimRadius);
    float vertexArc = across / rimRadius;
    float toroidY = rimRadius *
      (cos(rimAngle - vertexArc) - cos(rimAngle));
    float toroidZ = rimRadius *
      (sin(rimAngle - vertexArc) - sin(rimAngle));

    // At full emergence the paper becomes the original curled free
    // sheet. The gate reaches precisely zero after the opening, so
    // all approved free-flight vertices remain unchanged.
    float leadingEdge = smoothstep(.02, .5, across);
    float trailingEdge = smoothstep(.02, .5, -across);
    float ringLipArc = rimGate *
      (.24 * leadingEdge * leadingEdge -
       .38 * trailingEdge * trailingEdge);
    float originalZ = bulge * .72 + paperRipple + ringLipArc;
    pos.xy = vec2(along, mix(bentAcross, toroidY, rimGate));
    pos.z = mix(originalZ, toroidZ + paperRipple, rimGate);

    // The outer edge peels through first. Only the part that has
    // crossed the rim is visible; the trailing edge remains hidden.
    // Free-flight sheets have an exactly neutral reveal multiplier.
    float acrossRim = emergence + across * .52;
    float visibleFraction = smoothstep(.28, .56, acrossRim);
    vOpeningReveal = mix(1.0, visibleFraction, rimGate);
    float lightFacing = .5 + .5 * cos(phi + .4 + rippleSlope);
    float rimFacing = .5 + .5 *
      sin(rimAngle - vertexArc);
    vLight = clamp(.79 + .26 *
      mix(lightFacing, rimFacing, rimGate) -
      .055 * abs(rippleSlope) -
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
  varying float vOpeningReveal;
  uniform sampler2D uTexture;
  uniform sampler2D uHead;
  uniform vec4 uHeadBounds;
  uniform float uHeadOpacity;
  uniform float uBehind;
  uniform float uOpacity;
  uniform vec2 uResolution;
  void main() {
    vec4 paper = texture2D(uTexture, vUv);
    float alpha = paper.a * uOpacity * vOpeningReveal;
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

// Radial color separation belongs to the paper image, not to the title
// or 3D head. It is a second pass over this SAME renderer/canvas.
const RAYS_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
const RAYS_FRAGMENT = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPaper;
  uniform vec2 uSize;
  uniform float uRingRadius;
  uniform float uNearRays;
  uniform float uEdgeRays;
  uniform float uRayStrength;

  void main() {
    vec4 original = texture2D(uPaper, vUv);
    vec2 fromCenter = (vUv - .5) * uSize;
    float radialDistance = length(fromCenter);
    vec2 outward = fromCenter / max(1.0, radialDistance);
    float shortSide = min(uSize.x, uSize.y);

    // Only the two crossing points get chromatic softness: emergence
    // around the opening, and disappearance at the section boundaries.
    // Hole 01's chromatic softness belongs on the INNER rim:
    // the sheet crosses the rounded throat before leaving the ring.
    float throatWidth = max(1.0, uRingRadius * (.11 / .312));
    float throatPosition = (radialDistance - uRingRadius) / throatWidth;
    float holeWeight = uNearRays *
      exp(-pow((throatPosition + 1.0) / .60, 2.0));
    float edgeInset = min(
      min(vUv.x, 1.0 - vUv.x) * uSize.x,
      min(vUv.y, 1.0 - vUv.y) * uSize.y
    );
    float edgeWeight = uEdgeRays *
      (1.0 - smoothstep(shortSide * .025, shortSide * .16, edgeInset));
    float effect = clamp(max(holeWeight, edgeWeight) * uRayStrength, 0.0, 1.0);

    // Between the opening and the edges the papers stay perfectly crisp:
    // neither a time-based trail nor a permanent lens blur is drawn.
    if (effect < .006) {
      gl_FragColor = original;
      return;
    }

    // A short, local RGB fringe rather than a long radial smear.
    // Preserve the existing section-edge treatment; only the inner
    // opening gets its own, physically located radial softness.
    float nearReach = throatWidth * holeWeight * .46;
    float edgeReach = edgeWeight * (3.0 + shortSide * .024);
    float reach = uRayStrength * max(nearReach, edgeReach);
    vec3 colorSum = vec3(0.0);
    vec3 colorWeights = vec3(0.0);
    float sampledAlpha = 0.0;
    for (int i = 0; i < 7; i++) {
      float t = (float(i) + .5) / 7.0;
      vec2 sampleUV = vUv + outward * (t - .5) * reach / uSize;
      vec4 sampleColor = texture2D(uPaper, sampleUV);
      vec3 spectrum = vec3(
        smoothstep(.12, .83, 1.0 - t),
        1.0 - .70 * abs(t * 2.0 - 1.0),
        smoothstep(.12, .83, t)
      );
      colorSum += sampleColor.rgb * sampleColor.a * spectrum;
      colorWeights += sampleColor.a * spectrum;
      sampledAlpha += sampleColor.a / 7.0;
    }

    vec3 fringeColor = colorSum / max(colorWeights, vec3(.0001));
    float haloAlpha = sampledAlpha * effect * .40;
    float outputAlpha = max(original.a, haloAlpha);
    float colorMix = uRayStrength *
      max(holeWeight * .80, edgeWeight * .56);
    gl_FragColor = vec4(mix(original.rgb, fringeColor, colorMix), outputAlpha);
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
    // Render the existing paper objects to an offscreen texture before
    // their radial chromatic trail is composited to the same canvas.
    const paperTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
    });
    const raysScene = new THREE.Scene();
    const raysCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const raysGeometry = new THREE.PlaneGeometry(2, 2);
    const raysMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uPaper: { value: paperTarget.texture },
        uSize: { value: new THREE.Vector2(1, 1) },
        uRingRadius: { value: 1 },
        uNearRays: { value: 1 },
        uEdgeRays: { value: 1 },
        uRayStrength: { value: 1 },
      },
      vertexShader: RAYS_VERTEX,
      fragmentShader: RAYS_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      transparent: false,
      toneMapped: false,
    });
    raysScene.add(new THREE.Mesh(raysGeometry, raysMaterial));
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
          uExitWrap: { value: 0 },
          uRimRadius: { value: 1 },
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
      paperTarget.setSize(width * dpr, height * dpr);
      raysMaterial.uniforms.uSize.value.set(width * dpr, height * dpr);
      raysMaterial.uniforms.uRingRadius.value =
        Math.min(width, height) * .33 * dpr;
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
        item.material.uniforms.uOpacity.value = pose.opacity;
        item.material.uniforms.uCurl.value = pose.curl;
        item.material.uniforms.uFlutter.value = pose.flutter ?? 1;
        item.material.uniforms.uExitWrap.value = pose.wrap ?? 0;
        // The ring's rounded throat has a radius proportional to
        // the opening. Scale into the sheet's local coordinates.
        item.material.uniforms.uRimRadius.value =
          Math.min(width, height) * .33 * (.11 / .312) /
          Math.max(1, sheetSize);
        item.material.uniforms.uTime.value = pose.time;
      }
      // The optical rays belong to Home. Fade them away as the existing
      // scroll sequence hands sheets into the Projects gallery.
      const rayFade = Math.max(0, Math.min(1, 1 - progress / .18));
      raysMaterial.uniforms.uRayStrength.value =
        rayFade * rayFade * (3 - 2 * rayFade);
      renderer.setRenderTarget(paperTarget);
      renderer.clear();
      renderer.render(world, camera);
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(raysScene, raysCamera);
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
      paperTarget.dispose();
      raysGeometry.dispose();
      raysMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return createPortal(
    <canvas ref={canvasRef} className="jw-live-paper-canvas"
      aria-hidden="true" />, document.body
  );
});

export default LivePaperRenderer;
