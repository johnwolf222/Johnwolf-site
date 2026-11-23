import {headWordEdgeDistance,headPartingSlots} from './head-word-split.js';
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

  // Word halves are decorative screen-space ink, not replacement DOM
  // paragraphs. The ORIGINAL inline text never leaves natural layout.
  // A single aria-hidden layer is enough for the whole About experience.
  const partingLayer = document.createElement('div');
  partingLayer.className = 'jw-about-word-parting-layer';
  partingLayer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(partingLayer);
  const activeSplits = new Map();
  const returning = new Map();
  const formatPx = n => (Math.round(n * 10) / 10) + 'px';
  const translate = (x, y) =>
    'translate3d(' + formatPx(x) + ',' + formatPx(y) + ',0)';

  const clearParting = (word, state) => {
    if (state.startFrame) cancelAnimationFrame(state.startFrame);
    if (state.closingTimer) clearTimeout(state.closingTimer);
    state.first.remove();
    state.last.remove();
    word.classList.remove('is-head-splitting');
  };
  const clearSplits = () => {
    for (const [word, state] of activeSplits) clearParting(word, state);
    for (const [word, state] of returning) clearParting(word, state);
    activeSplits.clear();
    returning.clear();
  };
  const piece = (text, computed) => {
    const node = document.createElement('span');
    node.className = 'jw-about-parted-fragment';
    node.textContent = text;
    node.style.font = computed.font;
    node.style.letterSpacing = computed.letterSpacing;
    node.style.color = computed.color;
    node.style.textTransform = computed.textTransform;
    node.style.fontKerning = computed.fontKerning;
    partingLayer.appendChild(node);
    return node;
  };
  const moveTo = (state, slots, rect) => {
    if (state.startFrame) {
      state.pending = {slots, rect};
      return;
    }
    const top = rect.top + state.inkOffsetY;
    const fx = slots.leftX, lx = slots.rightX;
    if (!state.target ||
        Math.abs(fx - state.target.fx) > .6 ||
        Math.abs(top - state.target.top) > .6)
      state.first.style.transform = translate(fx, top);
    if (!state.target ||
        Math.abs(lx - state.target.lx) > .6 ||
        Math.abs(top - state.target.top) > .6)
      state.last.style.transform = translate(lx, top);
    state.target = {fx, lx, top};
  };
  const rejoin = word => {
    const state = activeSplits.get(word);
    if (!state) return;
    activeSplits.delete(word);
    returning.set(word, state);
    if (state.startFrame) {
      cancelAnimationFrame(state.startFrame);
      state.startFrame = 0;
    }
    // No opacity trick or layout collapse: the two visible pieces travel
    // back to the original inline letters, then the original ink returns.
    const a = state.sourceFirst.getBoundingClientRect();
    const b = state.sourceLast.getBoundingClientRect();
    state.first.style.transform = translate(a.left, a.top);
    state.last.style.transform = translate(b.left, b.top);
    state.closingTimer = setTimeout(() => {
      if (returning.get(word) !== state) return;
      returning.delete(word);
      clearParting(word, state);
    }, 345);
  };
  const splitWord = (word, slots, rect) => {
    if (activeSplits.has(word) || returning.has(word)) return;
    const sourceFirst = word.querySelector('.jw-head-word-first');
    const sourceLast = word.querySelector('.jw-head-word-last');
    if (!sourceFirst || !sourceLast) return;
    const a = sourceFirst.getBoundingClientRect();
    const b = sourceLast.getBoundingClientRect();
    if (!a.width || !b.width) return;
    const computed = getComputedStyle(word);
    const first = piece(sourceFirst.textContent, computed);
    const last = piece(sourceLast.textContent, computed);
    first.style.transform = translate(a.left, a.top);
    last.style.transform = translate(b.left, b.top);
    const state = {
      first, last, sourceFirst, sourceLast,
      inkOffsetY: a.top - rect.top,
      firstWidth: a.width, lastWidth: b.width,
      startFrame: 0, closingTimer: 0, pending: null, target: null,
    };
    activeSplits.set(word, state);
    // Keep the source word's exact width, baseline and line wrapping.
    // Only the ink is hidden; no full-width row is inserted.
    word.classList.add('is-head-splitting');
    state.startFrame = requestAnimationFrame(() => {
      state.startFrame = 0;
      const chosen = state.pending || {slots, rect};
      state.pending = null;
      moveTo(state, chosen.slots, chosen.rect);
    });
  };
  const scheduleSplits = () => {
    if (!disposed && !splitFrame)
      splitFrame = requestAnimationFrame(updateSplits);
  };
  const overlapsPeer = (entry, word, slots, y, height, a, b) => {
    // The head's far side is normally empty because CSS Shapes wraps
    // around it. Reject any split if either landing would cover real ink.
    const left = slots.leftX, right = slots.rightX;
    for (const other of entry.allWords) {
      if (other === word) continue;
      const r = other.getBoundingClientRect();
      if (r.bottom <= y + 2 || r.top >= y + height - 2) continue;
      const collisionLeft = r.left < left + a - 2 && r.right > left + 2;
      const collisionRight = r.left < right + b - 2 && r.right > right + 2;
      if (collisionLeft || collisionRight) return true;
    }
    return false;
  };
  function updateSplits() {
    splitFrame = 0;
    if (disposed || !enabled() || !head) {
      clearSplits();
      return;
    }
    const candidates = [];
    for (const entry of entries) {
      const area = entry.article.getBoundingClientRect();
      if (area.bottom < head.top || area.top > head.bottom) continue;
      for (const word of entry.words) {
        if (returning.has(word)) continue;
        const rect = word.getBoundingClientRect();
        const midY = (rect.top + rect.bottom) / 2;
        // The previous version pulled "creation" apart ABOVE the face.
        // Require the actual word baseline to cross the visible head.
        if (midY < head.top + 6 || midY > head.bottom - 6) continue;
        const state = activeSplits.get(word);
        const first = word.querySelector('.jw-head-word-first');
        const last = word.querySelector('.jw-head-word-last');
        if (!first || !last) continue;
        const a = state?.firstWidth || first.getBoundingClientRect().width;
        const b = state?.lastWidth || last.getBoundingClientRect().width;
        const slots = headPartingSlots(area, head, midY, a, b);
        if (!slots) continue;
        const distance = headWordEdgeDistance(rect, head);
        if (distance > (state ? 68 : 39)) continue;
        if (overlapsPeer(entry, word, slots, rect.top, rect.height, a, b))
          continue;
        candidates.push({
          word, rect, slots, distance: distance - (state ? 16 : 0),
        });
      }
    }
    candidates.sort((a,b) => a.distance - b.distance);
    // One legible split at a time; other sentences keep their normal flow.
    const chosen = candidates[0];
    for (const word of activeSplits.keys())
      if (word !== chosen?.word) rejoin(word);
    if (!chosen) return;
    const existing = activeSplits.get(chosen.word);
    if (existing) moveTo(existing, chosen.slots, chosen.rect);
    else splitWord(chosen.word, chosen.slots, chosen.rect);
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
        allWords: [...article.querySelectorAll('.jw-hover-word')],
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
    partingLayer.remove();
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
