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
  uniform float uOpeningScale;
  uniform float uArcRadius;
  uniform float uOuterRim;
  uniform float uFocal;
  uniform float uSheetExtent;
  uniform float uSheetWidth;
  uniform vec2 uOutward;

  // Cross-section of the rounded opening. Sheets first travel along its
  // nearly vertical inner wall, then bend over its circular rim and out.
  // This is used for individual mesh vertices, never the card flight.
  vec2 openingCurve(float s, float radius) {
    // Return absolute radius and depth around the inner wall and rim.
    // A negative distance is still inside the vertical throat.
    if (s < 0.0) return vec2(uOuterRim - radius, s);
    float arcEnd = radius * (3.141593 - .872665);
    float angle = 3.141593 - min(s, arcEnd) / radius;
    float remaining = max(0.0, s - arcEnd);
    return vec2(
      uOuterRim + radius * cos(angle) + remaining * sin(angle),
      radius * sin(angle) - remaining * cos(angle)
    );
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    // The approved paper shader is the exact free-flight fallback.
    float across = pos.y;
    float along = pos.x;
    float bend = max(.0001, uCurl * 2.12 + uExitWrap * 2.0);
    float phi = across * bend;
    float bentAcross = sin(phi) / bend;
    float bulge = (1. - cos(phi)) / bend;
    float edge = pow(clamp(abs(across) * 2., 0., 1.), 1.5);
    float ripplePhase = along * 3.14159 + uTime * 8.1 +
      uSeed * 1.61;
    float paperRipple = uFlutter * .042 * sin(ripplePhase);
    float rippleSlope = uFlutter * .042 * 3.14159 * cos(ripplePhase);
    pos.xy = vec2(along, bentAcross);
    pos.z = bulge * .72 + paperRipple;
    float lightFacing = .5 + .5 * cos(phi + .4 + rippleSlope);
    vLight = clamp(.79 + .26 * lightFacing -
      .055 * abs(rippleSlope) -
      .06 * edge * uCurl, .61, 1.06);

    float rimGate = clamp(uExitWrap, 0.0, 1.0);
    vOpeningReveal = 1.0;
    if (rimGate > .0001) {
      // Map the *entire opening* into camera space. The previous
      // approach was anchored to the moving card center, which placed
      // its paper inside the empty hole and washed it out.
      float arcRadius = max(8.0, uArcRadius);
      float arcEnd = arcRadius * (3.141593 - .872665);
      float advance = smoothstep(.42, 2.76, uTime);
      float halfHeight = 0.5 * uSheetExtent;
      float centerTravel = mix(-halfHeight - arcRadius * .10,
        arcEnd + halfHeight, advance);

      // The leading edge is the local lower Y edge, independently of
      // the sheet's later free-flight rotation. Its tangential width
      // stays perpendicular to the sheet's radial exit lane.
      vec3 radial = vec3(uOutward, 0.0);
      vec3 tangential = vec3(-uOutward.y, uOutward.x, 0.0);
      float distance = centerTravel - position.y * uSheetExtent;
      float offset = position.x * uSheetWidth;
      vec2 vertexOnRim = openingCurve(distance, arcRadius);
      float depthBase = uFocal - uFocal / .55 - arcRadius;
      // Match the paper's apparent size at the rim to its free-flight
      // size. The previous full-size rim mesh shrank sharply when its
      // depth was handed back to the moving sheet, looking like a dive.
      // Scale around the curved rim center, keeping the existing
      // opening path and vertex-by-vertex reveal timing unchanged.
      vec2 centerOnRim = openingCurve(centerTravel, arcRadius);
      vec3 rimCenter = radial * centerOnRim.x +
        vec3(0.0, 0.0, depthBase + centerOnRim.y);
      vec3 ordinaryWorld = (modelMatrix * vec4(pos, 1.0)).xyz;
      // Keep the projected center on the SAME outward trajectory while
      // the paper peels around the opening. Otherwise the rim path stalls
      // and then abruptly catches up with free flight as wrap fades.
      vec3 ordinaryCenter = (modelMatrix *
        vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float freeDepth = max(1.0, uFocal - ordinaryCenter.z);
      float rimDepth = max(1.0, uFocal - rimCenter.z);
      float freeRadius = length(ordinaryCenter.xy) *
        uFocal / freeDepth;
      float rimRadius = centerOnRim.x * uFocal / rimDepth;
      rimCenter += radial *
        ((freeRadius - rimRadius) * rimDepth / uFocal);
      vec3 rimWorld = rimCenter + uOpeningScale * (
        radial * (vertexOnRim.x - centerOnRim.x) +
        tangential * offset +
        vec3(0.0, 0.0, vertexOnRim.y - centerOnRim.y));
      vec3 emergingWorld = mix(ordinaryWorld, rimWorld, rimGate);

      // The trailing part is still inside the opening. Only the
      // emerged radial length becomes visible, one vertex at a time.
      float visibleFraction = smoothstep(0.0,
        arcRadius * .42 * 1.570796, distance);
      vOpeningReveal = mix(1.0, visibleFraction, rimGate);
      gl_Position = projectionMatrix * viewMatrix *
        vec4(emergingWorld, 1.0);
    } else {
      // This branch preserves the exact original paper coordinates,
      // orientation, size and perspective after the ring passage.
      gl_Position = projectionMatrix * modelViewMatrix *
        vec4(pos, 1.0);
    }
  }
`;
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

  float ease01(float value) {
    value = clamp(value, 0.0, 1.0);
    return value * value * (3.0 - 2.0 * value);
  }
  // The reference separates white light into continuous red, green
  // and blue components. Each tap weights color and coverage on its own.
  vec3 spectralWeight(float t) {
    vec3 prism = clamp(
      abs(mod(t * 4.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0,
      0.0, 1.0);
    return mix(vec3(1.0), prism, 0.85);
  }
  void main() {
    vec4 original = texture2D(uPaper, vUv);
    // The circular Hole 01 alpha cutout belongs ONLY to Home. The old
    // postprocess kept punching a white hole through the sheets even when
    // all chromatic rays had faded out, creating the blocking head glow.
    if (uRayStrength <= 0.001) {
      gl_FragColor = original;
      return;
    }
    vec2 pixel = vUv * uSize;
    vec2 offset = pixel - 0.5 * uSize;
    float distanceFromHole = length(offset);
    vec2 direction = offset / max(1.0, distanceFromHole);
    float shorter = min(uSize.x, uSize.y);
    float throatWidth = max(1.0, uRingRadius * (0.11 / 0.312));
    float innerRim = max(1.0, uRingRadius - throatWidth);
    float holePosition = (distanceFromHole - uRingRadius) / throatWidth;
    float holeWeight = uNearRays *
      exp(-pow((holePosition + 1.0) / 0.60, 2.0));
    vec2 normalizedEdge = abs(vUv * 2.0 - 1.0);
    float edgeWeight = uEdgeRays * ease01(
      (max(normalizedEdge.x, normalizedEdge.y) - 0.80) / 0.20);

    // The hole is formed by disappearing paper. It is not an extra
    // decorative shape painted over the approved homepage artwork.
    float innerVisibility = 1.0 - ease01(uRayStrength) *
      exp(-pow(distanceFromHole / max(1.0, innerRim * 0.82), 2.0));

    // Preserve the established section-edge treatment; the enlarged
    // chromatic sampling is local to the paper crossing the inner lip.
    float nearReach = throatWidth * holeWeight * 0.46;
    float edgeReach = shorter * edgeWeight * 0.058;
    float reach = uRayStrength * (nearReach + edgeReach);
    if (reach < 0.75) {
      gl_FragColor = vec4(original.rgb,
        original.a * innerVisibility);
      return;
    }

    // Accumulate color and alpha independently. The old seven-sample
    // blur mixed the unexposed transparent original into its result,
    // making the emerging rainbow almost invisible on white.
    vec3 colorAccum = vec3(0.0);
    vec3 coverAccum = vec3(0.0);
    vec3 weightAccum = vec3(0.0);
    float sampleCount = clamp(ceil(reach / 3.0), 4.0, 16.0);
    float jitter = fract(52.9829189 * fract(dot(
      gl_FragCoord.xy, vec2(.06711056, .00583715))));
    for (int k = 0; k < 16; k++) {
      if (float(k) >= sampleCount) break;
      float t = (float(k) + jitter) / sampleCount;
      vec2 uvAt = (pixel +
        direction * reach * (t - 0.5)) / uSize;
      vec4 ink = vec4(0.0);
      if (uvAt.x >= 0.0 && uvAt.x <= 1.0 &&
          uvAt.y >= 0.0 && uvAt.y <= 1.0)
        ink = texture2D(uPaper, uvAt);
      vec3 wavelength = spectralWeight(t);
      colorAccum += ink.rgb * wavelength;
      coverAccum += ink.a * wavelength;
      weightAccum += wavelength;
    }
    vec3 channelCoverage = coverAccum /
      max(weightAccum, vec3(0.0001));
    float coverage = max(channelCoverage.r,
      max(channelCoverage.g, channelCoverage.b));
    // Do not divide color by alpha a second time: that produced
    // nearly-white fringes instead of the distinct colored paper edge.
    vec3 visibleColor = colorAccum /
      max(weightAccum, vec3(0.0001));
    gl_FragColor = vec4(visibleColor * innerVisibility,
      coverage * innerVisibility);
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
          uOpeningScale: { value: 1 },
          uArcRadius: { value: 1 },
          uOuterRim: { value: 1 },
          uFocal: { value: FOCAL },
          uSheetExtent: { value: 1 },
          uSheetWidth: { value: 1 },
          uOutward: { value: new THREE.Vector2(1, 0) },
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
        // The rounded hole is evaluated in world units, using the
        // same radial departure for every vertex in this sheet.
        const ringOuter = Math.min(width, height) * .33 / .55;
        item.material.uniforms.uOuterRim.value = ringOuter;
        item.material.uniforms.uArcRadius.value =
          ringOuter * (.11 / .312);
        // A partly hidden sheet retains its physical size while
        // wrapping the rim. Its approved flight scale is unaffected
        // because the rim uniform is ignored after release.
        const openingSheetSize = Math.min(390,
          Math.min(width, height) * .55);
        item.material.uniforms.uSheetExtent.value =
          openingSheetSize * item.heightFactor;
        item.material.uniforms.uSheetWidth.value =
          openingSheetSize * item.widthFactor;
        // The rim is farther from the camera than free flight. Compensate
        // for that perspective difference so the sheet never swells at
        // the opening and then appears to plunge away on release.
        const rimCameraDistance = FOCAL / .55 +
          item.material.uniforms.uArcRadius.value;
        const freeCameraDistance = Math.max(1, FOCAL - pose.z);
        item.material.uniforms.uOpeningScale.value =
          Math.max(.05, Math.min(1.5,
            (sheetSize / openingSheetSize) *
            rimCameraDistance / freeCameraDistance));
        const radialLength = Math.max(1, Math.hypot(pose.x, pose.y));
        item.material.uniforms.uOutward.value.set(
          pose.x / radialLength, -pose.y / radialLength);
        item.material.uniforms.uTime.value = pose.time;
      }
      // The optical rays belong to Home. Fade them away as the existing
      // scroll sequence hands sheets into the Projects gallery.
      const rayFade = Math.max(0, Math.min(1, 1 - progress / .18));
      const rayStrength = rayFade * rayFade * (3 - 2 * rayFade);
      raysMaterial.uniforms.uRayStrength.value = rayStrength;
      if (rayStrength <= .001) {
        // Once Home's optical rays are gone, Projects needs only the
        // original 21 paper meshes. Drawing them directly skips the
        // full-viewport offscreen texture and second shader pass on EVERY
        // swipe frame. This does not change any pose, texture or head mask.
        renderer.setRenderTarget(null);
        renderer.clear();
        renderer.render(world, camera);
      } else {
        // Keep the approved two-pass chromatic rays during Home/transition.
        renderer.setRenderTarget(paperTarget);
        renderer.clear();
        renderer.render(world, camera);
        renderer.setRenderTarget(null);
        renderer.clear();
        renderer.render(raysScene, raysCamera);
      }
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
