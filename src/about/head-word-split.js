/** A split never drops letters, whitespace, or punctuation. */
export function centeredHeadWordParts(token) {
  if(typeof token!=='string')return null;
  const characters=Array.from(token);
  const letters=characters.filter(c=>/\p{L}/u.test(c));
  if(letters.length<6)return null;
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
