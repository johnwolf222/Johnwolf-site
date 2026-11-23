/**
 * The four original paragraphs form their OWN readable mobile lines.
 * Do not manufacture 80px-wide copies: they split whole words into
 * hundreds of rows and make the About page needlessly long.
 *
 * Each original word remains in normal document flow. When its native
 * position approaches the actual projected 3D face, its paint moves
 * outside the face's ellipse without changing the paragraph's layout.
 * Original source, hover targets and screen-reader reading order survive.
 */
const safe = value => Number.isFinite(value);

export function mobileWordAvoidance(word, head, viewportWidth) {
  if (!head || !word || ![word.left,word.top,word.width,word.height,
      head.left,head.right,head.top,head.bottom,viewportWidth].every(safe) ||
      viewportWidth <= 0 || word.width <= 0 || word.height <= 0 ||
      head.right <= head.left || head.bottom <= head.top)
    return { x: 0, y: 0 };

  const cx = word.left + word.width / 2;
  const cy = word.top + word.height / 2;
  const hx = (head.left + head.right) / 2;
  const hy = (head.top + head.bottom) / 2;
  // Include the full word's painted extent and a small safety margin.
  const rx = (head.right - head.left) / 2 + word.width / 2 + 15;
  const ry = (head.bottom - head.top) / 2 + word.height / 2 + 17;
  const dx = cx - hx;
  const dy = cy - hy;
  const nx = dx / rx;
  const ny = dy / ry;
  if (nx * nx + ny * ny >= 1) return { x: 0, y: 0 };

  // Prefer a lateral route: words visually flow around the face instead
  // of stacking up in a narrow 1-word column. Don't leave the viewport.
  const edge = 12;
  const crossX = rx * Math.sqrt(Math.max(0, 1 - ny * ny));
  const leftStep = Math.max(0, dx + crossX + 3);
  const rightStep = Math.max(0, crossX - dx + 3);
  const leftRoom = Math.max(0, word.left - edge);
  const rightRoom = Math.max(0, viewportWidth - edge -
    (word.left + word.width));
  const lateral = [];
  if (leftStep <= leftRoom) lateral.push({ x: -leftStep, y: 0 });
  if (rightStep <= rightRoom) lateral.push({ x: rightStep, y: 0 });
  if (lateral.length) {
    // Keep words on their original side when both routes are possible.
    const preferredSign = dx < 0 ? -1 : 1;
    lateral.sort((a, b) =>
      (Math.sign(a.x) === preferredSign ? 0 : 1) -
      (Math.sign(b.x) === preferredSign ? 0 : 1));
    return lateral[0];
  }

  // Near a screen edge there may be no room beside the head. The same
  // elliptical clearance can then be taken above or below it, without
  // narrowing, chopping or rebuilding the paragraph.
  const crossY = ry * Math.sqrt(Math.max(0, 1 - nx * nx));
  const upStep = Math.max(0, dy + crossY + 3);
  const downStep = Math.max(0, crossY - dy + 3);
  return { x: 0, y: dy < 0 ? -upStep : downStep };
}

export function installMobileStoryFlow(section) {
  if (typeof window === 'undefined' || !section) return () => {};
  const articles = [...section.querySelectorAll('.jw-about-message')];
  if (!articles.length) return () => {};
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const wordsByArticle = articles.map(article => ({
    article,
    words: [...article.querySelectorAll('.jw-hover-word')],
  }));
  let head = null;
  let frame = 0;
  let disposed = false;
  const positions = new Map();
  // Plain paragraphs are always visible and readable even if the model
  // fails, arrives late, or reduced-motion is enabled.
  articles.forEach(article => article.classList.add('jw-about-flow-active'));

  const schedule = () => {
    if (!disposed && !frame) frame = requestAnimationFrame(position);
  };
  function position() {
    frame = 0;
    if (disposed || window.innerWidth > 800) return;
    const changes = [];
    for (const { article, words } of wordsByArticle) {
      const bounds = article.getBoundingClientRect();
      const canAvoid = Boolean(head && !reduced.matches &&
        bounds.bottom > head.top - 100 &&
        bounds.top < head.bottom + 100);
      if (!canAvoid && !words.some(word => positions.has(word))) continue;
      // All reads happen before ANY style writes. Offset positions are
      // unaffected by paint-only transforms and cannot feed back into wrap.
      for (const word of words) {
        let next = { x: 0, y: 0 };
        if (canAvoid) {
          const width = word.offsetWidth;
          const height = word.offsetHeight;
          const localLeft = word.offsetLeft;
          const localTop = word.offsetTop;
          const top = bounds.top + localTop;
          if (top + height >= head.top - 20 &&
              top <= head.bottom + 20) {
            next = mobileWordAvoidance({
              left: bounds.left + localLeft,
              top, width, height,
            }, head, window.innerWidth);
          }
        }
        const previous = positions.get(word);
        if (next.x === 0 && next.y === 0 && !previous) continue;
        if (next.x === 0 && next.y === 0) {
          positions.delete(word);
          changes.push([word, '']);
        } else {
          const transform = 'translate3d(' +
            next.x.toFixed(1) + 'px,' + next.y.toFixed(1) + 'px,0)';
          if (previous !== transform) {
            positions.set(word, transform);
            changes.push([word, transform]);
          }
        }
      }
    }
    for (const [word, transform] of changes)
      word.style.transform = transform;
  }

  function onHead(event) {
    const next = event.detail;
    if (!next || ![next.left,next.right,next.top,next.bottom].every(safe) ||
        next.right <= next.left || next.bottom <= next.top) return;
    head = next;
    schedule();
  }
  const onResize = () => schedule();
  section.addEventListener('jw-about-head-envelope', onHead);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  reduced.addEventListener?.('change', schedule);
  document.fonts?.ready.then(() => {
    if (!disposed) schedule();
  });
  return () => {
    disposed = true;
    if (frame) cancelAnimationFrame(frame);
    section.removeEventListener('jw-about-head-envelope', onHead);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', onResize);
    reduced.removeEventListener?.('change', schedule);
    for (const word of positions.keys()) word.style.transform = '';
    positions.clear();
    articles.forEach(article => article.classList.remove(
      'jw-about-flow-active'));
  };
}
