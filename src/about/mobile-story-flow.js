/**
 * Native-DOM equivalent of the desktop head-clearance story.
 * Keeps the four original paragraphs in the accessibility tree and moves
 * only visible line copies along a seekable ellipse surrounding the ACTUAL
 * projected 3D head. Never prevents or writes window scroll.
 */
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

export function mobileStoryCorridorWidth(head, viewportWidth) {
  if (!head || ![head.left, head.right, viewportWidth].every(Number.isFinite) ||
      viewportWidth <= 0) return 0;
  const available = Math.min(head.left, viewportWidth - head.right) - 28;
  return Math.max(48, Math.min(146, Math.floor(available)));
}

export function mobileStoryLineX(side, lineWidth, screenY, head, viewportWidth) {
  if (!head || ![head.left, head.right, head.top, head.bottom,
    lineWidth, screenY, viewportWidth].every(Number.isFinite) ||
    viewportWidth <= 0 || lineWidth <= 0) return 0;
  const centerX = (head.left + head.right) * .5;
  const centerY = (head.top + head.bottom) * .5;
  const rx = Math.max(8, (head.right - head.left) * .5 + 9);
  const ry = Math.max(8, (head.bottom - head.top) * .5 + 14);
  const dy = Math.abs((screenY - centerY) / ry);
  // This varies continuously from no displacement outside the model to
  // full face/beanie clearance alongside its widest projected outline.
  const displacement = dy >= 1 ? 0 :
    (rx + 11) * Math.sqrt(Math.max(0, 1 - dy * dy));
  const x = side === 'left'
    ? Math.min(viewportWidth * .5, centerX - displacement) - lineWidth
    : Math.max(viewportWidth * .5, centerX + displacement);
  const edge = Math.min(10, Math.max(0, (viewportWidth - lineWidth) / 2));
  return clamp(x, edge, Math.max(edge, viewportWidth - lineWidth - edge));
}

export function installMobileStoryFlow(section) {
  if (typeof window === 'undefined' || !section) return () => {};
  const articles = [...section.querySelectorAll('.jw-about-message')];
  if (!articles.length) return () => {};

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const allLines = [];
  let head = null, frame = 0, disposed = false;
  let lastViewport = 0;
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) return () => {};

  const clear = () => {
    allLines.length = 0;
    for (const article of articles) {
      article.querySelector(':scope > .jw-about-flow-lines')?.remove();
      article.classList.remove('jw-about-flow-active');
    }
  };
  const schedule = () => {
    if (!disposed && !frame) frame = requestAnimationFrame(position);
  };
  function position() {
    frame = 0;
    if (disposed || !head || window.innerWidth > 800) return;
    const viewport = window.innerWidth;
    const height = window.innerHeight;
    // Read each article's geometry just once. Interleaving a bounding
    // read after every line transform forced repeated Safari layouts.
    const rects = new Map(articles.map(article =>
      [article, article.getBoundingClientRect()]));
    const transforms = [];
    for (const line of allLines) {
      const rect = rects.get(line.article);
      if (!rect || rect.bottom < -80 || rect.top > height + 80) continue;
      const cy = rect.top + line.y + line.height * .5;
      if (cy < -65 || cy > height + 65) continue;
      const x = mobileStoryLineX(
        line.side, line.width, cy, head, viewport);
      const localX = x - rect.left;
      transforms.push([line.node,
        'translate3d(' + localX.toFixed(2) + 'px,0,0)']);
    }
    for (const [node, transform] of transforms)
      if (node.style.transform !== transform)
        node.style.transform = transform;
  }
  function rebuild() {
    if (disposed) return;
    if (!head || window.innerWidth > 800) { clear(); return; }
    const vw = window.innerWidth;
    const corridor = mobileStoryCorridorWidth(head, vw);
    if (!corridor) return;
    clear();
    lastViewport = vw;

    articles.forEach(article => {
      const sourceParagraphs = [...article.querySelectorAll(':scope > p')];
      const style = getComputedStyle(article);
      const fontSize = parseFloat(style.fontSize) || 19;
      const fontFamily = style.fontFamily || 'Inter, Arial, sans-serif';
      const lineHeight = fontSize * 1.54;
      const side = article.classList.contains('story-left') ? 'left' : 'right';
      const layer = document.createElement('div');
      layer.className = 'jw-about-flow-lines';
      layer.setAttribute('aria-hidden', 'true');
      let y = 0;

      const wordWidth = token => {
        measure.font = (token.italic ? 'italic ' : '') +
          '400 ' + fontSize + 'px ' + fontFamily;
        return measure.measureText(token.text).width;
      };
      const space = (() => {
        measure.font = '400 ' + fontSize + 'px ' + fontFamily;
        return measure.measureText(' ').width;
      })();

      const addLine = (tokens, inkWidth) => {
        if (!tokens.length) return;
        const node = document.createElement('span');
        node.className = 'jw-about-flow-line';
        node.style.top = y.toFixed(2) + 'px';
        for (const token of tokens) {
          if (token.gap) node.appendChild(document.createTextNode(' '));
          const ink = document.createElement('span');
          ink.className = 'jw-hover-word';
          ink.textContent = token.text;
          if (token.italic) ink.style.fontStyle = 'italic';
          node.appendChild(ink);
        }
        layer.appendChild(node);
        allLines.push({
          article, node, side, y, height: lineHeight, width: inkWidth,
        });
        y += lineHeight;
      };

      for (const paragraph of sourceParagraphs) {
        const words = [...paragraph.querySelectorAll('.jw-hover-word')]
          .map(node => ({
            text: node.textContent,
            italic: Boolean(node.closest('em')),
          })).filter(word => word.text);
        const fragments = [];
        for (const word of words) {
          if (wordWidth(word) <= corridor) {
            fragments.push({ ...word, continued: false });
            continue;
          }
          // Exceptionally long words split across consecutive lines without
          // adding visible hyphens or changing the original accessible copy.
          let chunk = '';
          let continued = false;
          for (const character of Array.from(word.text)) {
            const next = chunk + character;
            if (chunk && wordWidth({ ...word, text: next }) > corridor) {
              fragments.push({
                text: chunk, italic: word.italic, continued,
              });
              chunk = character;
              continued = true;
            } else chunk = next;
          }
          if (chunk) fragments.push({
            text: chunk, italic: word.italic, continued,
          });
        }

        let current = [], currentWidth = 0;
        for (const token of fragments) {
          const width = wordWidth(token);
          let gap = current.length > 0 && !token.continued;
          let candidate = currentWidth + (gap ? space : 0) + width;
          if (current.length && candidate > corridor) {
            addLine(current, currentWidth);
            current = [];
            currentWidth = 0;
            gap = false;
            candidate = width;
          }
          current.push({ ...token, gap });
          currentWidth = candidate;
        }
        addLine(current, currentWidth);
        y += lineHeight * .64;
      }
      layer.style.height = Math.ceil(y + 2) + 'px';
      article.appendChild(layer);
      article.classList.add('jw-about-flow-active');
    });
    schedule();
  }

  function onHead(event) {
    const next = event.detail;
    if (!next || ![next.left, next.right, next.top, next.bottom]
      .every(Number.isFinite) || next.right <= next.left ||
      next.bottom <= next.top) return;
    head = next;
    // A turning head changes its projected width many times per second.
    // Rebuilding all DOM lines for those changes changed the About height,
    // reset word highlights, and caused unwanted scroll jumps. Construct
    // lines only on first load or a TRUE change of screen width.
    if (window.innerWidth !== lastViewport || !allLines.length)
      rebuild();
    else schedule();
  }
  const onResize = () => {
    if (!head) return;
    // Safari address-bar height changes are NOT new screen layouts.
    if (window.innerWidth !== lastViewport) rebuild();
    else schedule();
  };
  section.addEventListener('jw-about-head-envelope', onHead);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  document.fonts?.ready.then(() => {
    if (!disposed && head) rebuild();
  });
  return () => {
    disposed = true;
    if (frame) cancelAnimationFrame(frame);
    section.removeEventListener('jw-about-head-envelope', onHead);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', onResize);
    clear();
  };
}
