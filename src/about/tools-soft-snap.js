/**
 * A nearby tools viewport can settle into view ONCE. The user always keeps
 * native wheel, keyboard and touch scrolling: this is not a pinned section.
 * Pure geometry is shared between implementation and regression tests.
 */
export function toolSnapDelta(panelTop, viewportHeight, consumed = false,
  direction = 0) {
  if (!Number.isFinite(panelTop) || !Number.isFinite(viewportHeight) ||
      viewportHeight <= 0 || consumed) return null;
  // Land only when most of the full-screen tools section is already visible.
  // Don't pull the user back after they have started scrolling onward.
  // Once the user has crossed the panel, a forward scroll must not
  // yank them back. The symmetric rule preserves a deliberate reverse.
  if ((panelTop < 0 && direction >= 0) ||
      (panelTop > 0 && direction < 0)) return null;
  const ahead = Math.min(viewportHeight * .62, 560);
  const behind = Math.min(viewportHeight * .36, 320);
  if (panelTop > ahead || panelTop < -behind ||
      Math.abs(panelTop) < 7) return null;
  return panelTop;
}

export function rearmToolSnap(panelTop, viewportHeight) {
  if (!Number.isFinite(panelTop) || !Number.isFinite(viewportHeight) ||
      viewportHeight <= 0) return false;
  return panelTop > viewportHeight * .78 ||
    panelTop < -viewportHeight * .68;
}

/**
 * One brief seek after input settles. A fresh gesture cancels the animation
 * immediately; no wheel/touch/key event is prevented and no pin is created.
 */
export function installToolsSoftSnap(section, toolsPanel) {
  if (!section || !toolsPanel || typeof window === 'undefined') return () => {};
  // Touch/mobile: native scrolling owns the boundary. A second
  // scrollTo animation competing with the section-boundary controller
  // and iOS inertial scroll made the tools handoff oscillate.
  // Preserve the original one-time desktop landing only.
  if (window.matchMedia('(max-width: 800px)').matches) return () => {};
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const doc = document.documentElement;
  let consumed = false;
  let touching = false;
  let timer = 0;
  let frame = 0;
  let lastInput = 0;
  let priorScrollBehavior = null;
  let disposed = false;
  let lastScrollY = window.scrollY;
  let scrollDirection = 0;

  function restoreScrollBehavior() {
    if (priorScrollBehavior !== null) {
      doc.style.scrollBehavior = priorScrollBehavior;
      priorScrollBehavior = null;
    }
  }
  function cancelSnap() {
    if (timer) clearTimeout(timer);
    timer = 0;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    restoreScrollBehavior();
  }
  function userInput() {
    lastInput = performance.now();
    cancelSnap();
  }
  function onTouchStart() {
    touching = true;
    userInput();
  }
  function onTouchEnd() {
    touching = false;
    lastInput = performance.now();
  }
  function onKey(event) {
    if (['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' ']
      .includes(event.key)) userInput();
  }
  function queue() {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(trySnap, 170);
  }
  function trySnap() {
    timer = 0;
    if (disposed || frame || touching || reduced.matches || consumed) return;
    if (performance.now() - lastInput < 160) {
      queue();
      return;
    }
    const delta = toolSnapDelta(toolsPanel.getBoundingClientRect().top,
      window.innerHeight, consumed, scrollDirection);
    if (delta === null) return;
    consumed = true;
    const start = window.scrollY;
    const startTime = performance.now();
    const duration = Math.min(370, Math.max(200, Math.abs(delta) * 1.15));
    priorScrollBehavior = doc.style.scrollBehavior;
    doc.style.scrollBehavior = 'auto';
    const ease = t => t * t * (3 - 2 * t);
    const tick = now => {
      if (disposed) return;
      const t = Math.min(1, (now - startTime) / duration);
      window.scrollTo(0, start + delta * ease(t));
      if (t < 1) frame = requestAnimationFrame(tick);
      else {
        frame = 0;
        restoreScrollBehavior();
      }
    };
    frame = requestAnimationFrame(tick);
  }
  function onScroll() {
    const y = window.scrollY;
    if (Math.abs(y - lastScrollY) > .5 && !frame)
      scrollDirection = Math.sign(y - lastScrollY);
    lastScrollY = y;
    const top = toolsPanel.getBoundingClientRect().top;
    if (rearmToolSnap(top, window.innerHeight)) consumed = false;
    if (!frame && !consumed && !reduced.matches) queue();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('scrollend', onScroll, { passive: true });
  window.addEventListener('wheel', userInput, { passive: true, capture: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  window.addEventListener('pointerdown', userInput, { passive: true });
  window.addEventListener('keydown', onKey);
  const dispose = () => {
    disposed = true;
    cancelSnap();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('scrollend', onScroll);
    window.removeEventListener('wheel', userInput, true);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
    window.removeEventListener('pointerdown', userInput);
    window.removeEventListener('keydown', onKey);
  };
  return dispose;
}
