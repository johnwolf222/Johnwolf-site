import { chromium } from 'playwright';
import fs from 'node:fs/promises';

await fs.mkdir('mobile-visual-artifacts', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
try {
  const errors = [];
  for (const [width, height] of [[390, 844], [430, 932]]) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.jw-new-home__head-canvas.is-ready', {
      timeout: 75000,
    });
    await page.waitForFunction(() => {
      const head = document.querySelector('.jw-continuous-head');
      return head && Number.isFinite(parseFloat(
        head.style.getPropertyValue('--jw-visible-head-orbit-y')));
    }, { timeout: 30000 });
    await page.waitForTimeout(2000);
    const measurement = await page.evaluate(() => {
      const h = document.querySelector('.jw-continuous-head');
      const c = h.querySelector('.jw-new-home__head-canvas');
      const rect = c.getBoundingClientRect();
      const artboard = document.querySelector('.jw-new-home__artboard')
        ?.getBoundingClientRect();
      return {
        width: window.innerWidth, height: window.innerHeight,
        artboardCenterY: artboard ? artboard.top + artboard.height / 2 : null,
        headCanvas: {left: rect.left,top: rect.top,width: rect.width,height: rect.height},
        actualHeadOrbitX: h.style.getPropertyValue('--jw-visible-head-orbit-x'),
        actualHeadOrbitY: h.style.getPropertyValue('--jw-visible-head-orbit-y'),
        modelReady: c.classList.contains('is-ready'),
        paperRendererCanvases: document.querySelectorAll('canvas').length
      };
    });
    await page.screenshot({
      path: 'mobile-visual-artifacts/home-' + width + 'x' + height + '.png',
      animations: 'disabled',
    });
    await fs.writeFile('mobile-visual-artifacts/metrics-' + width + '.json',
      JSON.stringify(measurement, null, 2));
    console.log('MOBILE VISUAL:', JSON.stringify(measurement));
    if (!measurement.modelReady) throw new Error('3D GLB was not rendered');
    if (!Number.isFinite(parseFloat(measurement.actualHeadOrbitY)))
      throw new Error('Real head anchor is unavailable');
    // Evaluate the fully formed circular card orbit, not only the initial
    // Home flying-paper scene. Keep actual scroll position deterministic.
    const pinEnd = await page.evaluate(() => {
      const pinned = window.ScrollTrigger?.getById?.('jw-home-to-projects');
      return pinned?.end ?? window.innerHeight * 4.25;
    });
    await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }),
      height * 4.25 * .40);
    await page.waitForTimeout(1600);
    const orbitMetrics = await page.evaluate(() => {
      const h = document.querySelector('.jw-continuous-head');
      const canvas = h.querySelector('.jw-new-home__head-canvas');
      const bounds = canvas.getBoundingClientRect();
      const orbit = {
        x: parseFloat(h.style.getPropertyValue('--jw-visible-head-orbit-x')),
        y: parseFloat(h.style.getPropertyValue('--jw-visible-head-orbit-y')),
      };
      const title = document.querySelector('.jw-new-home__artboard');
      const titleRect = title?.getBoundingClientRect();
      return { scrollY: window.scrollY, orbit,
        headScreenCenter: {
          x: window.innerWidth / 2 + orbit.x +
            (parseFloat(h.style.getPropertyValue('--jw-head-x')) || 0),
          y: window.innerHeight / 2 + orbit.y +
            (parseFloat(h.style.getPropertyValue('--jw-head-shift')) || 0),
        },
        artboardCenter: titleRect ? {
          x: titleRect.left + titleRect.width / 2,
          y: titleRect.top + titleRect.height / 2,
        } : null,
        headCanvas: {
          x: bounds.left, y: bounds.top,
          width: bounds.width, height: bounds.height,
        }};
    });
    await page.screenshot({
      path: 'mobile-visual-artifacts/ring-' + width + 'x' + height + '.png',
      animations: 'disabled',
    });
    await fs.writeFile('mobile-visual-artifacts/orbit-' + width + '.json',
      JSON.stringify(orbitMetrics, null, 2));
    console.log('MOBILE RING:', JSON.stringify(orbitMetrics));
    if (!Number.isFinite(orbitMetrics.orbit.x) ||
        !Number.isFinite(orbitMetrics.orbit.y))
      throw new Error('No real head orbit while scrolling');
    // The model's projected center must remain anchored to the HOME
    // artboard, not drift when the browser scrolls or its chrome resizes.
    // Record both positions so a failure can be diagnosed from artifacts.
    const beforeRelativeY = height / 2 +
      parseFloat(measurement.actualHeadOrbitY) -
      measurement.artboardCenterY;
    const afterRelativeY = orbitMetrics.headScreenCenter.y -
      orbitMetrics.artboardCenter.y;
    const driftY = afterRelativeY - beforeRelativeY;
    console.log('MOBILE HEAD DRIFT:', JSON.stringify({
      viewport: width + 'x' + height, beforeRelativeY,
      afterRelativeY, driftY,
    }));
    if (Math.abs(driftY) > 3)
      throw new Error('Mobile head moved relative to Home artboard by ' +
        driftY.toFixed(2) + 'px during card orbit');
    // Exercise the same scroll positions in reverse. A stable head must
    // return to the identical screen coordinates, not just look correct
    // during downward scrolling. This catches stale viewport/anchor values.
    const readHeadPose = () => page.evaluate(() => {
      const head = document.querySelector('.jw-continuous-head');
      const artboard = head.querySelector('.jw-continuous-head__artboard');
      const canvas = head.querySelector('.jw-new-home__head-canvas');
      const rect = artboard.getBoundingClientRect();
      const home = document.querySelector('.jw-new-home__artboard')
        .getBoundingClientRect();
      const style = getComputedStyle(artboard);
      return {
        scrollY: window.scrollY,
        innerHeight: window.innerHeight,
        visualViewportHeight: window.visualViewport?.height ?? null,
        headX: rect.left + rect.width / 2,
        headY: rect.top + rect.height / 2,
        headWidth: rect.width,
        headHeight: rect.height,
        homeX: home.left + home.width / 2,
        homeY: home.top + home.height / 2,
        transform: style.transform,
        headShift: head.style.getPropertyValue('--jw-head-shift'),
        homeAlignY: head.style.getPropertyValue('--jw-home-align-y'),
        modelReady: canvas.classList.contains('is-ready'),
      };
    });
    const scrollToAndSettle = async y => {
      await page.evaluate(target => window.scrollTo({
        top: target, behavior: 'instant',
      }), y);
      await page.waitForTimeout(600);
      return readHeadPose();
    };
    const midway = height * 4.25 * .40;
    const initialPose = await scrollToAndSettle(0);
    const forward = await scrollToAndSettle(midway);
    await scrollToAndSettle(height * 4.25 * .70);
    const reverse = await scrollToAndSettle(midway);
    const returnedHome = await scrollToAndSettle(0);
    const initialHomeY = initialPose.headY;
    const initialHomeX = initialPose.headX;
    const delta = (a, b) => Math.abs(a - b);
    const reverseMetrics = {
      viewport: width + 'x' + height,
      initialPose, forward, reverse, returnedHome,
      sameScrollDeltaX: delta(forward.headX, reverse.headX),
      sameScrollDeltaY: delta(forward.headY, reverse.headY),
      homeReturnDeltaX: delta(returnedHome.headX, initialHomeX),
      homeReturnDeltaY: delta(returnedHome.headY, initialHomeY),
    };
    await page.screenshot({
      path: 'mobile-visual-artifacts/reverse-home-' + width + '.png',
      animations: 'disabled',
    });
    await fs.writeFile('mobile-visual-artifacts/reverse-' + width + '.json',
      JSON.stringify(reverseMetrics, null, 2));
    console.log('MOBILE REVERSE:', JSON.stringify(reverseMetrics));
    if (reverseMetrics.sameScrollDeltaX > 3 ||
        reverseMetrics.sameScrollDeltaY > 3 ||
        reverseMetrics.homeReturnDeltaX > 3 ||
        reverseMetrics.homeReturnDeltaY > 3)
      throw new Error('Head does not return to its original screen position ' +
        'after reverse scrolling: ' + JSON.stringify(reverseMetrics));
    // After Home unpins, its DOM artboard scrolls away. The permanent
    // GLB must NOT follow that element offscreen during Section 2.
    const projectsY = await page.evaluate(() => {
      const section = document.querySelector('.jw-projects-journey');
      return window.scrollY + section.getBoundingClientRect().top;
    });
    await scrollToAndSettle(projectsY + height * .10);
    const projectsHead = await page.evaluate(() => {
      const head = document.querySelector('.jw-continuous-head');
      const canvas = head.querySelector('.jw-new-home__head-canvas');
      const rect = canvas.getBoundingClientRect();
      return {
        scrollY: window.scrollY,
        visible: getComputedStyle(head).visibility,
        opacity: Number(getComputedStyle(head).opacity),
        canvasTop: rect.top, canvasBottom: rect.bottom,
        alignY: parseFloat(head.style.getPropertyValue('--jw-home-align-y')) || 0,
        canvasReady: canvas.classList.contains('is-ready'),
      };
    });
    console.log('SECTION 2 HEAD:', JSON.stringify(projectsHead));
    await fs.writeFile('mobile-visual-artifacts/projects-head-' + width + '.json',
      JSON.stringify(projectsHead, null, 2));
    await page.screenshot({
      path: 'mobile-visual-artifacts/projects-head-' + width + '.png',
      animations: 'disabled',
    });
    if (!projectsHead.canvasReady || projectsHead.visible === 'hidden' ||
        projectsHead.opacity < .95 ||
        projectsHead.canvasBottom <= 0 ||
        projectsHead.canvasTop >= height ||
        Math.abs(projectsHead.alignY) > 3)
      throw new Error('Section 2 GLB is missing or following the offscreen ' +
        'Home artboard: ' + JSON.stringify(projectsHead));
    await page.close();
  }
  if (errors.length) throw new Error('Browser errors: '+errors.join('\n'));
} finally {
  await browser.close();
}
