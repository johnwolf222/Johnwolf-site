import {headWordEdgeDistance} from './head-word-split.js';
/**
 * Browser-native sentence wrapping around the SAME projected 3D head.
 * One invisible CSS shape changes the line widths for each paragraph.
 * No independent word transforms, cloned text, or overlap-prone positions.
 */
const finite = n => Number.isFinite(n);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export function mobileStoryExclusion(article, head, side='right', gap=14) {
  if (!article || !head || ![
      article.left, article.right, article.top, article.bottom,
      head.left, head.right, head.top, head.bottom, gap,
    ].every(finite) || article.right <= article.left ||
      head.right <= head.left || head.bottom <= head.top || gap < 0)
    return null;
  if (head.right + gap <= article.left ||
      head.left - gap >= article.right) return null;
  const widthTotal = article.right - article.left;
  const width = clamp(side === 'right'
    ? article.right - head.left + gap
    : head.right - article.left + gap, 1, widthTotal);
  const floatLeft = side === 'right' ? article.right - width : article.left;
  return {
    width, side,
    cx: (head.left + head.right) / 2 - floatLeft,
    cy: (head.top + head.bottom) / 2 - article.top,
    rx: (head.right - head.left) / 2 + gap,
    ry: (head.bottom - head.top) / 2 + gap + 2,
  };
}

export function installMobileStoryFlow(section) {
  if (typeof window === 'undefined' || !section) return () => {};
  const articles = [...section.querySelectorAll('.jw-about-message')];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const enabled = () => window.innerWidth <= 800 && !reduced.matches;
  const entries = [];
  let lastWidth = window.innerWidth, wasEnabled = false;
  let head = null, frame = 0, splitFrame = 0, disposed = false;
  const activeSplits = new Set();
  const clearSplits = () => {
    for (const word of activeSplits) {
      word.classList.remove('is-head-splitting');
      word.style.removeProperty('--jw-head-word-gap');
    }
    activeSplits.clear();
  };
  const scheduleSplits = () => {
    if (!disposed && !splitFrame)
      splitFrame = requestAnimationFrame(updateSplits);
  };
  function updateSplits() {
    splitFrame = 0;
    if (disposed || !enabled() || !head) {
      clearSplits();
      return;
    }
    // Wait until the CSS-shape paragraph wrapping finishes; read the
    // browser-calculated word boxes, never create arbitrary word positions.
    const candidates = [];
    for (const entry of entries) {
      const article = entry.article.getBoundingClientRect();
      if (article.bottom < head.top - 45 ||
          article.top > head.bottom + 45) continue;
      for (const word of entry.words) {
        const box = word.getBoundingClientRect();
        if (box.bottom < head.top - 30 ||
            box.top > head.bottom + 30) continue;
        const distance = headWordEdgeDistance(box, head);
        if (distance > (activeSplits.has(word) ? 67 : 43)) continue;
        candidates.push({word,top:box.top,
          distance:distance-(activeSplits.has(word)?12:0)});
      }
    }
    candidates.sort((a,b)=>a.distance-b.distance);
    // At most two words on different lines can split at any moment.
    const next=new Map();
    for (const candidate of candidates) {
      if (next.size>=2) break;
      if ([...next.values()].some(other =>
        Math.abs(other.top-candidate.top)<16)) continue;
      next.set(candidate.word,candidate);
    }
    for (const word of activeSplits) {
      if (next.has(word)) continue;
      word.classList.remove('is-head-splitting');
      word.style.removeProperty('--jw-head-word-gap');
    }
    activeSplits.clear();
    for (const {word,distance} of next.values()) {
      const gap=Math.round(Math.max(8,Math.min(16,
        16-Math.max(0,distance)*.13)));
      word.style.setProperty('--jw-head-word-gap',gap+'px');
      word.classList.add('is-head-splitting');
      activeSplits.add(word);
    }
  }

  function build() {
    clearSplits();
    for (const e of entries) e.float.remove();
    entries.length = 0;
    for (const article of articles) {
      article.classList.remove('jw-about-flow-active');
      article.style.minHeight = '';
    }
    wasEnabled = enabled();
    if (!wasEnabled) return;
    for (const article of articles) {
      // Reserve once, BEFORE inserting the float. Safari cannot use
      // animated text height to control the About -> Tools boundary.
      const natural = Math.max(
        article.getBoundingClientRect().height, article.scrollHeight);
      const height = Math.ceil(natural + Math.max(
        206, Math.min(285, window.innerHeight * .3)));
      const side = article.classList.contains('story-left') ? 'right' : 'left';
      const float = document.createElement('span');
      float.className = 'jw-about-head-exclusion jw-about-head-exclusion--' + side;
      float.setAttribute('aria-hidden', 'true');
      float.style.width = '1px';
      float.style.height = height + 'px';
      float.style.shapeOutside = 'ellipse(0px 0px at 0px 0px)';
      article.insertBefore(float, article.firstChild);
      article.style.minHeight = height + 'px';
      article.classList.add('jw-about-flow-active');
      entries.push({
        article, float, side, height, shape: '', width: '',
        words: [...article.querySelectorAll('.jw-head-splittable')],
      });
    }
  }
  function schedule() {
    if (!disposed && !frame) frame = requestAnimationFrame(position);
  }
  const px = n => (Math.round(n / 3) * 3) + 'px';

  function position() {
    frame = 0;
    if (disposed || !enabled()) return;
    // Read all box geometry first, then update all invisible float shapes.
    const candidates = entries.map(entry => {
      const rect = entry.article.getBoundingClientRect();
      return {
        entry,
        bounds: head ? mobileStoryExclusion(rect, head, entry.side) : null,
      };
    });
    for (const { entry, bounds } of candidates) {
      const outside = !bounds ||
        bounds.cy + bounds.ry < -24 ||
        bounds.cy - bounds.ry > entry.height + 24;
      const width = outside ? '1px' : px(bounds.width);
      const shape = outside ? 'ellipse(0px 0px at 0px 0px)' :
        'ellipse(' + px(bounds.rx) + ' ' + px(bounds.ry) +
        ' at ' + px(bounds.cx) + ' ' + px(bounds.cy) + ')';
      if (width !== entry.width) {
        entry.float.style.width = width;
        entry.width = width;
      }
      if (shape !== entry.shape) {
        entry.float.style.shapeOutside = shape;
        entry.shape = shape;
      }
    }
    // Separate frame: allow browser native wrapping to settle before
    // choosing which actual word is closest to the moving silhouette.
    scheduleSplits();
  }
  function onHead(event) {
    const next = event.detail;
    if (!next || ![next.left,next.right,next.top,next.bottom].every(finite) ||
        next.right <= next.left || next.bottom <= next.top) return;
    head = next;
    schedule();
  }
  function onResize() {
    if (window.innerWidth !== lastWidth || enabled() !== wasEnabled) {
      lastWidth = window.innerWidth;
      build();
    }
    schedule();
  }
  build();
  section.addEventListener('jw-about-head-envelope', onHead);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  reduced.addEventListener?.('change', onResize);
  document.fonts?.ready.then(() => { if (!disposed) schedule(); });
  return () => {
    disposed = true;
    if (frame) cancelAnimationFrame(frame);
    if (splitFrame) cancelAnimationFrame(splitFrame);
    clearSplits();
    section.removeEventListener('jw-about-head-envelope', onHead);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', onResize);
    reduced.removeEventListener?.('change', onResize);
    for (const e of entries) e.float.remove();
    for (const article of articles) {
      article.classList.remove('jw-about-flow-active');
      article.style.minHeight = '';
    }
  };
}
