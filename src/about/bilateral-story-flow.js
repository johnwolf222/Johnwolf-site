import {centeredHeadWordParts} from './head-word-split.js';

/** Natural reading order, with two independently measured text corridors.
 * Words split ONLY at their true head intersection. Every target rectangle
 * is allocated before painting: no per-word transforms that can collide.
 */
export function layoutBilateralStory(paragraphs,width,head,lineHeight=32,paragraphGap=17,safety=12){
 const valid=n=>Number.isFinite(n);
 if(!valid(width)||width<=20||!valid(lineHeight)||lineHeight<=0)
  return {placements:[],rows:[],height:0,bilateralRows:0,splitWords:0};
 const placements=[],rows=[];
 let y=0,bilateralRows=0,splitWords=0;
 const rx=head&&valid(head.left)&&valid(head.right)?
  Math.max(1,(head.right-head.left)/2+12):0;
 const ry=head&&valid(head.top)&&valid(head.bottom)?
  Math.max(1,(head.bottom-head.top)/2+12):0;
 const cx=head?(head.left+head.right)/2:0;
 const cy=head?(head.top+head.bottom)/2:0;
 const lanesAt=mid=>{
  if(!rx||!ry)return [{start:0,end:width}];
  const ratio=Math.abs(mid-cy)/ry;
  if(ratio>=1)return [{start:0,end:width}];
  const span=rx*Math.sqrt(1-ratio*ratio);
  const leftEnd=Math.max(0,Math.min(width,cx-span-safety));
  const rightStart=Math.max(0,Math.min(width,cx+span+safety));
  const lanes=[];
  if(leftEnd>=38)lanes.push({start:0,end:leftEnd,side:'left'});
  if(width-rightStart>=38)lanes.push({start:rightStart,end:width,side:'right'});
  return lanes;
 };
 for(const paragraph of paragraphs){
  const tokens=Array.isArray(paragraph)?paragraph:[];
  let i=0,guard=0;
  while(i<tokens.length && guard++<Math.max(90,tokens.length*8)){
   const lanes=lanesAt(y+lineHeight/2);
   const initial=i,from=placements.length;
   let laneIndex=0,x=lanes[0]?.start||0,placed=0,inLane=0;
   while(i<tokens.length && laneIndex<lanes.length){
    const lane=lanes[laneIndex],token=tokens[i];
    const w=Number(token.width);
    if(!valid(w)||w<=0){i++;continue;}
    const spacing=inLane?Math.max(0,token.spaceWidth||0):0;
    const at=x+spacing,available=lane.end-at;
    if(w<=available+.01){
     placements.push({token,part:'whole',x:at,y,width:w});
     x=at+w;i++;placed++;inLane++;continue;
    }
    // A crossing word becomes two actual halves, left -> right.
    if(laneIndex===0&&lanes.length===2&&
       valid(token.firstWidth)&&valid(token.lastWidth)&&
       token.firstWidth>0&&token.lastWidth>0&&
       token.firstWidth<=available+.01&&
       token.lastWidth<=lanes[1].end-lanes[1].start+.01){
     placements.push({token,part:'first',x:at,y,width:token.firstWidth});
     placements.push({token,part:'last',x:lanes[1].start,y,width:token.lastWidth});
     splitWords++;i++;placed++;laneIndex=1;
     x=lanes[1].start+token.lastWidth;inLane=1;continue;
    }
    laneIndex++;
    if(laneIndex<lanes.length){x=lanes[laneIndex].start;inLane=0;}
   }
   rows.push({y,start:from,end:placements.length,lanes});
   if(lanes.length===2&&placed)bilateralRows++;
   y+=lineHeight;
   // A very long word waits for full-width space after the head.
   if(!placed&&i===initial&&lanes.length===1&&
      lanes[0].start===0&&lanes[0].end===width){
    const token=tokens[i];
    placements.push({token,part:'whole',x:0,y:y-lineHeight,
      width:Math.min(width,token.width)});
    i++;
   }
  }
  y+=Math.max(0,paragraphGap);
 }
 return {placements,rows,height:Math.ceil(y),bilateralRows,splitWords};
}

const finite=n=>Number.isFinite(n);
const px=n=>Math.round(n*10)/10+'px';

/** One accessible original copy, one aria-hidden visual layout per chapter. */
export function installMobileStoryFlow(section){
 if(typeof window==='undefined'||!section)return()=>{};
 const articles=[...section.querySelectorAll('.jw-about-message')];
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 const enabled=()=>window.innerWidth<=800&&!reduced.matches;
 const entries=[];
 let head=null,raf=0,disposed=false,lastWidth=window.innerWidth,wasEnabled=enabled();
 const measureCanvas=document.createElement('canvas');
 const measureContext=measureCanvas.getContext('2d');
 function setup(){
  for(const e of entries)e.layer.remove();
  entries.length=0;
  for(const article of articles){
   article.classList.remove('jw-about-bilateral-active','jw-about-flow-active');
   article.style.minHeight='';
  }
  wasEnabled=enabled();
  if(!wasEnabled)return;
  for(const article of articles){
   const natural=Math.max(article.getBoundingClientRect().height,article.scrollHeight);
   const reserve=Math.ceil(natural+Math.max(220,Math.min(290,innerHeight*.32)));
   const layer=document.createElement('div');
   layer.className='jw-about-bilateral-layer';
   layer.setAttribute('aria-hidden','true');
   layer.style.visibility='hidden';
   const style=getComputedStyle(article);
   const size=parseFloat(style.fontSize)||20;
   const lineHeight=parseFloat(style.lineHeight)||size*1.55;
   const paragraphs=[];
   for(const p of article.querySelectorAll(':scope > p')){
    const tokens=[];
    for(const source of p.querySelectorAll('.jw-hover-word')){
     const text=source.textContent||'';
     const computed=getComputedStyle(source);
     if(measureContext)measureContext.font=computed.font||
      (computed.fontSize+' '+computed.fontFamily);
     const measure=str=>measureContext?
      measureContext.measureText(str).width:Math.max(1,str.length*size*.5);
     const halves=centeredHeadWordParts(text);
     const firstSource=source.querySelector('.jw-head-word-first');
     const lastSource=source.querySelector('.jw-head-word-last');
     const make=(value,part)=>{
      const node=document.createElement('span');
      node.className='jw-hover-word jw-about-bilateral-word'+
       (part?' jw-about-bilateral-fragment':'');
      node.textContent=value;
      node.style.font=computed.font;
      node.style.letterSpacing=computed.letterSpacing;
      node.style.fontStyle=computed.fontStyle;
      node.style.lineHeight=computed.lineHeight;
      node.style.color=computed.color;
      layer.appendChild(node);
      return node;
     };
     tokens.push({
      text,width:Math.max(1,source.getBoundingClientRect().width||measure(text)),
      firstWidth:halves?Math.max(1,
       firstSource?.getBoundingClientRect().width||measure(halves[0])):0,
      lastWidth:halves?Math.max(1,
       lastSource?.getBoundingClientRect().width||measure(halves[1])):0,
      spaceWidth:measure(' '),
      whole:make(text,false),
      first:halves?make(halves[0],true):null,
      last:halves?make(halves[1],true):null,
      previous:new Map(),
     });
    }
    paragraphs.push(tokens);
   }
   article.appendChild(layer);
   article.classList.add('jw-about-flow-active');
   article.style.minHeight=reserve+'px';
   entries.push({article,layer,paragraphs,lineHeight,
     paragraphGap:size*.85,lastHeight:reserve,active:false});
  }
 }
 const hide=e=>{
  if(!e.active)return;
  e.active=false;e.article.classList.remove('jw-about-bilateral-active');
  e.layer.style.visibility='hidden';
 };
 const place=(node,x,y,token,lineHeight)=>{
  if(!node)return;
  const key=x.toFixed(1)+','+y.toFixed(1);
  const old=token.previous.get(node);
  if(old!==key){
   if(old){
    const previousY=Number(old.split(',')[1]);
    node.style.transitionDuration=Math.abs(y-previousY)>lineHeight*.8?
     '0ms':'.18s';
   }
   node.style.transform='translate3d('+px(x)+','+px(y)+',0)';
   token.previous.set(node,key);
  }
  node.style.opacity='1';
 };
 function render(){
  raf=0;
  if(disposed||!enabled()||!head){
   for(const e of entries)hide(e);
   return;
  }
  for(const e of entries){
   const r=e.article.getBoundingClientRect();
   if(r.bottom<head.top-16||r.top>head.bottom+16){hide(e);continue;}
   const relative={left:head.left-r.left,right:head.right-r.left,
    top:head.top-r.top,bottom:head.bottom-r.top};
   const laid=layoutBilateralStory(e.paragraphs,Math.max(1,r.width),
    relative,e.lineHeight,e.paragraphGap,12);
   if(!laid.bilateralRows){hide(e);continue;}
   const targets=new Map();
   for(const position of laid.placements){
    const parts=targets.get(position.token)||{};
    parts[position.part]=position;
    targets.set(position.token,parts);
   }
   for(const paragraph of e.paragraphs)for(const token of paragraph){
    const p=targets.get(token)||{};
    for(const [part,node] of [
     ['whole',token.whole],['first',token.first],['last',token.last]]){
     if(!node)continue;
     if(p[part])place(node,p[part].x,p[part].y,token,e.lineHeight);
     else node.style.opacity='0';
    }
   }
   const required=Math.ceil(laid.height+18);
   if(required>e.lastHeight){
    e.lastHeight=required;e.article.style.minHeight=required+'px';
   }
   e.layer.style.visibility='visible';
   e.article.classList.add('jw-about-bilateral-active');
   e.active=true;
  }
 }
 const schedule=()=>{if(!disposed&&!raf)raf=requestAnimationFrame(render);};
 const onHead=event=>{
  const h=event.detail;
  if(!h||![h.left,h.right,h.top,h.bottom].every(finite)||
    h.right<=h.left||h.bottom<=h.top)return;
  head=h;schedule();
 };
 const onResize=()=>{
  if(innerWidth!==lastWidth||enabled()!==wasEnabled){
   lastWidth=innerWidth;setup();
  }
  schedule();
 };
 setup();
 section.addEventListener('jw-about-head-envelope',onHead);
 window.addEventListener('scroll',schedule,{passive:true});
 window.addEventListener('resize',onResize,{passive:true});
 reduced.addEventListener?.('change',onResize);
 document.fonts?.ready.then(()=>{if(!disposed){setup();schedule();}});
 return()=>{
  disposed=true;if(raf)cancelAnimationFrame(raf);
  section.removeEventListener('jw-about-head-envelope',onHead);
  window.removeEventListener('scroll',schedule);
  window.removeEventListener('resize',onResize);
  reduced.removeEventListener?.('change',onResize);
  for(const e of entries){
   e.layer.remove();e.article.classList.remove('jw-about-bilateral-active','jw-about-flow-active');
   e.article.style.minHeight='';
  }
 };
}
