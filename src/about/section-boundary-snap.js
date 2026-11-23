/**
 * Soft, interruptible landings for the About entrance, capabilities and
 * Contact. Never intercept native gestures or pin a reading viewport.
 * The Home/Projects transition and Tools panel retain their own controllers.
 */
export function sectionBoundaryDelta(top, viewportHeight, consumed = false,
  direction = 0) {
  if (consumed || !Number.isFinite(top) ||
      !Number.isFinite(viewportHeight) || viewportHeight <= 0)
    return null;
  // Snap only in the actual scroll direction, never backwards over About.
  if ((top > 0 && direction < 0) ||
      (top < 0 && direction >= 0)) return null;
  const ahead = Math.min(viewportHeight * .49, 440);
  const behind = Math.min(viewportHeight * .42, 380);
  if (top > ahead || top < -behind || Math.abs(top) < 7) return null;
  return top;
}
export function rearmSectionBoundary(top, viewportHeight) {
  return Number.isFinite(top) && Number.isFinite(viewportHeight) &&
    viewportHeight > 0 &&
    (top > viewportHeight * .77 || top < -viewportHeight * .70);
}
export function installSectionBoundarySnap() {
  if (typeof window === 'undefined') return () => {};
  // iPhone/iPad-sized screens traverse Capabilities -> Tools -> Contact
  // with one uninterrupted native scroll. The independent Tools aligner
  // must never compete with an auto-snap toward Capabilities or Contact.
  // About's original entrance landing remains available.
  const mobile = window.matchMedia('(max-width: 800px)').matches;
  const targets = (mobile ? ['about'] :
    ['about', 'about-capabilities', 'contact'])
    .map(id => document.getElementById(id)).filter(Boolean);
  if (!targets.length) return () => {};
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const consumed = new Set();
  let touching = false, timer = 0, frame = 0, lastInput = 0;
  let previousBehavior = null, disposed = false;
  let lastScrollY = window.scrollY, scrollDirection = 0;
  function restoreBehavior() {
    if (previousBehavior === null) return;
    root.style.scrollBehavior = previousBehavior;
    previousBehavior = null;
  }
  function cancel() {
    if (timer) clearTimeout(timer);
    timer = 0;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    restoreBehavior();
  }
  function userInput() {
    lastInput = performance.now();
    cancel();
  }
  function onTouchStart() { touching = true; userInput(); }
  function onTouchEnd() {
    touching = false;
    lastInput = performance.now();
    queue();
  }
  function onKey(event) {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp',
      'Home', 'End', ' '].includes(event.key)) userInput();
  }
  function queue() {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(trySnap, 180);
  }
  function trySnap() {
    timer = 0;
    if (disposed || frame || touching || reduced.matches) return;
    if (performance.now() - lastInput < 200) { queue(); return; }
    const viewport = window.innerHeight;
    const candidates = targets.map(node => ({
      node, delta: sectionBoundaryDelta(
        node.getBoundingClientRect().top, viewport, consumed.has(node),
        scrollDirection),
    })).filter(item => item.delta !== null);
    candidates.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
    const chosen = candidates[0];
    if (!chosen) return;
    const { node, delta } = chosen;
    consumed.add(node);
    const start = window.scrollY;
    const duration = Math.min(460, Math.max(250, Math.abs(delta) * 1.05));
    const started = performance.now();
    previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    const ease = t => t * t * (3 - 2 * t);
    const tick = now => {
      if (disposed) return;
      const t = Math.min(1, (now - started) / duration);
      window.scrollTo(0, start + delta * ease(t));
      if (t < 1) frame = requestAnimationFrame(tick);
      else { frame = 0; restoreBehavior(); }
    };
    frame = requestAnimationFrame(tick);
  }
  function onScroll() {
    const y = window.scrollY;
    if (Math.abs(y - lastScrollY) > .5)
      scrollDirection = Math.sign(y - lastScrollY);
    lastScrollY = y;
    const viewport = window.innerHeight;
    for (const node of targets) {
      if (rearmSectionBoundary(node.getBoundingClientRect().top, viewport))
        consumed.delete(node);
    }
    if (!frame && !reduced.matches) queue();
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('scrollend', onScroll, { passive: true });
  window.addEventListener('wheel', userInput, { passive: true, capture: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  window.addEventListener('pointerdown', userInput, { passive: true });
  window.addEventListener('keydown', onKey);
  return () => {
    disposed = true;
    cancel();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('scrollend', onScroll);
    window.removeEventListener('wheel', userInput, true);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
    window.removeEventListener('pointerdown', userInput);
    window.removeEventListener('keydown', onKey);
  };
}
