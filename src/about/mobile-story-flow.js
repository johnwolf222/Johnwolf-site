/** Ellipse measurement helper, retained for projection tests. */
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


export {installMobileStoryFlow} from './bilateral-story-flow.js';
