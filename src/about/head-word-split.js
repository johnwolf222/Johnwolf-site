/** A split never drops letters, whitespace, or punctuation. */
export function centeredHeadWordParts(token) {
  if(typeof token!=='string')return null;
  const characters=Array.from(token);
  const letters=characters.filter(c=>/\p{L}/u.test(c));
  if(letters.length<5)return null;
  const half=Math.floor(letters.length/2);
  let seen=0,cut=0;
  for(const c of characters) {
    cut+=c.length;
    if(/\p{L}/u.test(c)&&++seen>=half)break;
  }
  if(cut>=token.length)return null;
  return [token.slice(0,cut),token.slice(cut)];
}

/** Screen-space distance of a word's end to the actual projected head rim. */
export function headWordEdgeDistance(word,head) {
  const a=[word?.left,word?.right,word?.top,word?.bottom,
    head?.left,head?.right,head?.top,head?.bottom];
  if(!a.every(Number.isFinite)||word.right<=word.left||
    head.right<=head.left||head.bottom<=head.top)return Infinity;
  const cy=(word.top+word.bottom)*.5, hy=(head.top+head.bottom)*.5;
  const ry=(head.bottom-head.top)*.5+28;
  const y=Math.abs(cy-hy)/ry;
  if(y>=1)return Infinity;
  const rx=(head.right-head.left)*.5+15;
  const half=rx*Math.sqrt(Math.max(0,1-y*y));
  const hx=(head.left+head.right)*.5;
  if(word.right<hx-half)return hx-half-word.right;
  if(word.left>hx+half)return word.left-hx-half;
  return 0;
}

/**
 * Compute actual LEFT and RIGHT landing positions for the two original
 * word fragments, hugging the elliptical profile of the PROJECTED head
 * at the word's current line height. All coordinates are in screen pixels.
 * Return null rather than drawing fragments on top of nearby sentences
 * when a phone has insufficient room on either side.
 */
export function headPartingSlots(article, head, y, firstWidth, lastWidth,
  clearance = 9) {
  const values = [
    article?.left, article?.right, head?.left, head?.right,
    head?.top, head?.bottom, y, firstWidth, lastWidth, clearance,
  ];
  if (!values.every(Number.isFinite) || article.right <= article.left ||
      head.right <= head.left || head.bottom <= head.top ||
      firstWidth <= 0 || lastWidth <= 0 || clearance < 0) return null;
  const cy = (head.top + head.bottom) / 2;
  const ry = (head.bottom - head.top) / 2 + 18;
  const vertical = (y - cy) / ry;
  if (Math.abs(vertical) >= 1) return null;
  const cx = (head.left + head.right) / 2;
  const rx = (head.right - head.left) / 2 + 13;
  const profile = rx * Math.sqrt(1 - vertical * vertical);
  const leftEdge = cx - profile - clearance;
  const rightEdge = cx + profile + clearance;
  const leftX = leftEdge - firstWidth;
  const rightX = rightEdge;
  // A dedicated in-flow row reserves the entire width: no neighboring
  // word shares the line and neither fragment can leave the side gutters.
  if (leftX < article.left + 4 ||
      rightX + lastWidth > article.right - 4) return null;
  return {
    leftX, rightX, leftEdge, rightEdge,
    opening: rightX - (leftX + firstWidth),
  };
}
