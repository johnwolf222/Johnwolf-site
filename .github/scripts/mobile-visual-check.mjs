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
      return {
        width: window.innerWidth, height: window.innerHeight,
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
      return { scrollY: window.scrollY, orbit, headCanvas: {
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
    await page.close();
  }
  if (errors.length) throw new Error('Browser errors: '+errors.join('\n'));
} finally {
  await browser.close();
}
