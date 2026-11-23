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

  const activeSplits = new Map();
  const returning = new Map();
  const firstPart = word => word.querySelector('.jw-head-word-first');
  const lastPart = word => word.querySelector('.jw-head-word-last');
  const formatPx = value => (Math.round(value * 10) / 10) + 'px';
  const moveTo = (word, state, slots, rect) => {
    // The absolute children are inside a dedicated, natural-flow line.
    // Both sides follow the changing head curve using compositor transforms.
    const left = slots.leftX - rect.left;
    const right = slots.rightX - rect.left;
    if (!Number.isFinite(state.left) ||
        Math.abs(left - state.left) >= .8) {
      state.left = left;
      word.style.setProperty('--jw-head-first-x', formatPx(left));
    }
    if (!Number.isFinite(state.right) ||
        Math.abs(right - state.right) >= .8) {
      state.right = right;
      word.style.setProperty('--jw-head-last-x', formatPx(right));
    }
  };
  const resetWord = word => {
    word.classList.remove('is-head-splitting', 'is-head-positioned');
    word.style.removeProperty('--jw-head-first-x');
    word.style.removeProperty('--jw-head-last-x');
  };
  const clearSplits = () => {
    for (const [word,state] of activeSplits) {
      for (const animation of state.animations) animation.cancel();
      resetWord(word);
    }
    activeSplits.clear();
    for (const [word,state] of returning) {
      for (const animation of state.animations) animation.cancel();
      resetWord(word);
    }
    returning.clear();
  };
  const rejoin = word => {
    const state = activeSplits.get(word);
    if (!state) return;
    activeSplits.delete(word);
    for (const animation of state.animations) animation.cancel();
    const rect = word.getBoundingClientRect();
    // The two pieces visibly travel inward as a single original word
    // before the dedicated row returns to the surrounding sentence.
    const pairWidth = state.firstWidth + state.lastWidth;
    const joinX = Math.max(0, (rect.width - pairWidth) / 2);
    const duration = 260;
    const options = {
      duration, easing:'cubic-bezier(.3,.0,.25,1)', fill:'forwards',
    };
    const anim1 = state.first.animate([
      {transform:'translate3d('+formatPx(state.left)+',0,0)',opacity:1},
      {transform:'translate3d('+formatPx(joinX)+',0,0)',opacity:.05},
    ],options);
    const anim2 = state.last.animate([
      {transform:'translate3d('+formatPx(state.right)+',0,0)',opacity:1},
      {transform:'translate3d('+
        formatPx(joinX+state.firstWidth)+',0,0)',opacity:.05},
    ],options);
    const closing = {animations:[anim1,anim2]};
    returning.set(word,closing);
    Promise.allSettled(closing.animations.map(a=>a.finished)).then(()=>{
      if (returning.get(word) !== closing) return;
      returning.delete(word);
      for (const animation of closing.animations) animation.cancel();
      resetWord(word);
    });
  };
  const splitWord = (word,entry,part) => {
    if (returning.has(word) || activeSplits.has(word)) return;
    const first = firstPart(word), last = lastPart(word);
    if (!first || !last) return;
    // Capture ORIGINAL text positions before making one reserved row.
    const firstOrigin = first.getBoundingClientRect();
    const lastOrigin = last.getBoundingClientRect();
    const firstWidth = firstOrigin.width;
    const lastWidth = lastOrigin.width;
    if (!firstWidth || !lastWidth) return;
    word.classList.add('is-head-splitting');
    const rect = word.getBoundingClientRect();
    const article = entry.article.getBoundingClientRect();
    const slots = headPartingSlots(article,head,
      (rect.top+rect.bottom)/2,firstWidth,lastWidth);
    if (!slots) {
      resetWord(word);
      return;
    }
    const state = {first,last,firstWidth,lastWidth,
      left:NaN,right:NaN,animations:[]};
    // Set target compositor coordinates, then animate *from the exact
    // source glyph positions* to opposite edges of the moving face.
    moveTo(word,state,slots,rect);
    word.classList.add('is-head-positioned');
    const animationOptions = {
      duration:430,easing:'cubic-bezier(.22,.75,.2,1)',
    };
    const firstAnimation = first.animate([
      {transform:'translate3d('+
        formatPx(firstOrigin.left-rect.left)+','+
        formatPx(firstOrigin.top-rect.top)+',0)',opacity:1},
      {transform:'translate3d('+formatPx(state.left)+',0,0)',opacity:1},
    ],animationOptions);
    const lastAnimation = last.animate([
      {transform:'translate3d('+
        formatPx(lastOrigin.left-rect.left)+','+
        formatPx(lastOrigin.top-rect.top)+',0)',opacity:1},
      {transform:'translate3d('+formatPx(state.right)+',0,0)',opacity:1},
    ],animationOptions);
    state.animations=[firstAnimation,lastAnimation];
    activeSplits.set(word,state);
  };
  const scheduleSplits = () => {
    if (!disposed && !splitFrame)
      splitFrame = requestAnimationFrame(updateSplits);
  };
  function updateSplits() {
    splitFrame=0;
    if(disposed || !enabled() || !head){
      clearSplits();
      return;
    }
    const candidates=[];
    // Read geometry for the original word boxes and ONLY ONE active row.
    for(const entry of entries){
      const region=entry.article.getBoundingClientRect();
      if(region.bottom < head.top-65 ||
         region.top > head.bottom+65) continue;
      for(const word of entry.words){
        if(returning.has(word))continue;
        const rect=word.getBoundingClientRect();
        if(rect.bottom < head.top-40 ||
           rect.top > head.bottom+40) continue;
        const state=activeSplits.get(word);
        const first=firstPart(word),last=lastPart(word);
        if(!first || !last)continue;
        const a=state?.firstWidth || first.getBoundingClientRect().width;
        const b=state?.lastWidth || last.getBoundingClientRect().width;
        const slots=headPartingSlots(region,head,
          (rect.top+rect.bottom)/2,a,b);
        if(!slots)continue;
        const distance=headWordEdgeDistance(rect,head);
        if(distance>(state ? 95 : 54))continue;
        candidates.push({word,entry,rect,slots,distance:
          distance-(state?22:0)});
      }
    }
    candidates.sort((a,b)=>a.distance-b.distance);
    // Keep one well-formed sentence row: unlimited scattered word halves
    // caused the old overlap bug, especially on the 390px iPhone viewport.
    const chosen=candidates[0];
    for(const word of activeSplits.keys())
      if(word !== chosen?.word)rejoin(word);
    if(!chosen)return;
    const current=activeSplits.get(chosen.word);
    if(current)moveTo(chosen.word,current,
      chosen.slots,chosen.rect);
    else splitWord(chosen.word,chosen.entry,chosen.slots);
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
