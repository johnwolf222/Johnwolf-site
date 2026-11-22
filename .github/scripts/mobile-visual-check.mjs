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
    await page.close();
  }
  if (errors.length) throw new Error('Browser errors: '+errors.join('\n'));
} finally {
  await browser.close();
}
