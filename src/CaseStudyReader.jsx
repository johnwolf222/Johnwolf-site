import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {gsap} from 'gsap';
import {createPortal} from 'react-dom';
import content from './content/approved-case-studies.json';
import './CaseStudyReader.css';

const entries=content.studies;
const lookup=Object.fromEntries(entries.map(item=>[item.id,item]));
const labelFor=name=>{
 const candidate=entries.find(item=>item.name.toLowerCase()===name?.toLowerCase());
 return candidate?.id||null;
};
const esc=s=>s.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');
function Ink({children,phrases=[]}){
 const text=String(children||'');
 const keys=phrases.filter(Boolean).sort((a,b)=>b.length-a.length);
 if(!keys.length)return text;
 const terms=new Set(keys.map(s=>s.toLowerCase()));
 const pattern=new RegExp('('+keys.map(esc).join('|')+')','gi');
 return text.split(pattern).map((chunk,i)=>terms.has(chunk.toLowerCase())?
   <mark className="jw-case-marker" key={i}>{chunk}</mark>:chunk);
}
function Comparison({section}){
 const [split,setSplit]=useState(50);
 return <figure className="jw-case-comparison">
  <div className="jw-case-comparison__head"><span>{section.title}</span><span>DRAG TO COMPARE</span></div>
  <div className="jw-case-comparison__stage" style={{'--jw-split':split+'%'}}>
   <img src={section.before} alt={section.beforeLabel+' version'} loading="lazy"/>
   <img className="jw-case-comparison__overlay" src={section.after} alt={section.afterLabel+' version'} loading="lazy"/>
   <div className="jw-case-comparison__line" aria-hidden="true"><span>↔</span></div>
   <input type="range" min="0" max="100" value={split} onChange={event=>setSplit(Number(event.target.value))}
     aria-label={'Compare '+section.title+' '+section.beforeLabel+' and '+section.afterLabel}/>
  </div>
  <figcaption><span>{section.beforeLabel}</span><span>{section.afterLabel}</span></figcaption>
 </figure>;
}
function StoryMedia({section,cycle}){
 if(section.type==='image')return <figure className="jw-case-image"><img src={section.src} alt={section.alt} loading="lazy" decoding="async"/></figure>;
 if(section.type==='grid')return <div className={'jw-case-grid jw-case-grid--'+section.columns} aria-label="Editorial art direction">
  {section.srcs.map((src,i)=><img key={src} src={src} alt={section.alts?.[i]||'Brand identity artwork'} loading="lazy" decoding="async"/>)}
 </div>;
 if(section.type==='text')return <div className="jw-case-interlude"><p><Ink phrases={section.emphasis}>{section.body}</Ink></p></div>;
 if(section.type==='video')return <figure className="jw-case-video"><video src={section.src} autoPlay={cycle===1} muted loop playsInline controls preload={cycle===1?'metadata':'none'} aria-label={section.title}/><figcaption>{section.title}</figcaption></figure>;
 if(section.type==='compare')return <Comparison section={section}/>;
 return null;
}
function OneCycle({study,cycle}){
 return <div className="jw-case-cycle">
  <div className="jw-case-narrative">
   <span className="jw-case-section-label">{study.eyebrow} · THE IDEA & THE EXECUTION</span>
   <h2 className="jw-case-study-heading">{study.name}</h2>
   <p><Ink phrases={study.highlights}>{study.intro}</Ink></p>
  </div>
  {study.cover&&<figure className="jw-case-image"><img src={study.cover} alt={study.name+' original brand artwork'} loading={cycle===1?'eager':'lazy'} decoding="async"/></figure>}
  {study.sections.map((section,i)=><StoryMedia key={i} section={section} cycle={cycle}/>)}
  {study.beats?.length>0&&<div className="jw-case-beats">{study.beats.map((text,i)=>
   <p key={i}><Ink phrases={study.highlights}>{text}</Ink></p>)}</div>}
  <div className="jw-case-end"><span>DESIGN BY JOHN WOLF</span><b>{study.name}</b></div>
 </div>;
}
export default function CaseStudyReader({selectedProject,onClose}){
 const [active,setActive]=useState(()=>labelFor(selectedProject?.name));
 const scrollRef=useRef(null);
 const closeRef=useRef(null);
 const sheetRef=useRef(null);
 const dragRef=useRef(null);
 const loopReady=useRef(false);
 const progressRef=useRef(null);
 const [details,setDetails]=useState(false);
 const [pullReady,setPullReady]=useState(false);
 const focusReturn=useRef(null);
 const study=active?lookup[active]:null;
 useLayoutEffect(()=>{
  const paper=sheetRef.current;
  if(!paper)return;
  if(window.matchMedia('(prefers-reduced-motion:reduce)').matches){setPullReady(true);return;}
  const origin=document.querySelector('.jw-projects-stage__details .jw-case-open-button')?.getBoundingClientRect();
  const r=origin||{left:innerWidth*.42,top:innerHeight*.40,width:innerWidth*.16,height:innerHeight*.22};
  const ctx=gsap.context(()=>{
   gsap.set(paper,{x:r.left,y:r.top,scaleX:Math.max(.04,r.width/innerWidth),scaleY:Math.max(.04,r.height/innerHeight),transformOrigin:'0 0',clipPath:'polygon(1% 4%,50% 0%,97% 5%,100% 96%,50% 100%,0% 95%)'});
   gsap.timeline({onComplete:()=>{gsap.set(paper,{clearProps:'transform,transformOrigin,clipPath'});setPullReady(true);}})
     .to(paper,{x:r.left*.28,y:r.top*.2,scaleX:.91,scaleY:.87,skewY:-2.5,clipPath:'polygon(3% 5%,26% 1%,51% 0%,76% 1%,94% 4%,100% 58%,96% 94%,72% 100%,43% 97%,0% 89%)',duration:.24,ease:'power2.inOut'})
     .to(paper,{x:0,y:0,scaleX:1,scaleY:1,skewY:0,clipPath:'polygon(0 0,100% 0,100% 100%,0 100%)',duration:.2,ease:'power2.out'});
  },paper);
  return()=>ctx.revert();
 },[]);
 useEffect(()=>{
  focusReturn.current=document.activeElement;
  const previous=document.body.style.overflow;
  document.body.style.overflow='hidden';
  closeRef.current?.focus();
  const onKey=event=>{
   if(event.key==='Escape'){event.preventDefault();onClose();}
   if(event.key==='Tab'){
    const items=[...document.querySelectorAll('.jw-case-reader button:not([disabled]),.jw-case-reader input:not([disabled]),.jw-case-reader a[href]')];
    if(!items.length)return;
    const first=items[0],last=items[items.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
  };
  window.addEventListener('keydown',onKey);
  return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',onKey);focusReturn.current?.focus?.({preventScroll:true});};
 },[onClose]);
 useEffect(()=>{
  if(!study||!scrollRef.current)return;
  const root=scrollRef.current;
  loopReady.current=false;
  const id=requestAnimationFrame(()=>{root.scrollTop=root.firstElementChild?.offsetHeight||0;loopReady.current=true;});
  return()=>cancelAnimationFrame(id);
 },[active]);
 const cycleScroll=event=>{
  const root=event.currentTarget,h=root.firstElementChild?.getBoundingClientRect().height||0;
  if(h<80||!loopReady.current)return;
  if(root.scrollTop<h*.5)root.scrollTop+=h;
  else if(root.scrollTop>h*1.5)root.scrollTop-=h;
  const progress=((root.scrollTop%h)+h)%h/h;
  if(progressRef.current)progressRef.current.style.strokeDashoffset=String(87.965*(1-progress));
 };
 useEffect(()=>{
  if(!study||!scrollRef.current)return;
  const scroll=scrollRef.current;
  let frame=0,lastY=scroll.scrollTop,lastTime=performance.now(),stretch=0;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const render=time=>{
   frame=0;
   const dt=Math.max(1,Math.min(50,time-lastTime));
   const delta=Math.abs(scroll.scrollTop-lastY);
   const target=reduce?0:.06*(1-Math.exp(-delta/dt/2.3));
   stretch+=(target-stretch)*(target>stretch?.22:.14);
   scroll.querySelectorAll('.jw-case-image img,.jw-case-grid img').forEach(img=>{
    if(Math.abs(stretch)>.0007)img.style.transform='scaleY('+(1+Math.min(stretch,24/Math.max(120,img.height)))+')';
    else img.style.removeProperty('transform');
   });
   lastY=scroll.scrollTop;lastTime=time;
   if(stretch>.0006)frame=requestAnimationFrame(render);
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(render)};
  scroll.addEventListener('scroll',schedule,{passive:true});
  const onDown=e=>{
   if(e.pointerType==='mouse'&&e.button!==0)return;
   if(e.target.closest('button,a,input,textarea,video'))return;
   dragRef.current={id:e.pointerId,y:e.clientY,moved:false};
  };
  const onMove=e=>{
   const drag=dragRef.current;if(!drag||drag.id!==e.pointerId)return;
   const dy=e.clientY-drag.y;if(!drag.moved&&Math.abs(dy)<5)return;
   drag.moved=true;drag.y=e.clientY;
   scroll.scrollTop-=dy;
  };
  const onUp=()=>{dragRef.current=null};
  scroll.addEventListener('pointerdown',onDown);
  window.addEventListener('pointermove',onMove);
  window.addEventListener('pointerup',onUp);
  window.addEventListener('pointercancel',onUp);
  return()=>{
   scroll.removeEventListener('scroll',schedule);
   scroll.removeEventListener('pointerdown',onDown);
   window.removeEventListener('pointermove',onMove);
   window.removeEventListener('pointerup',onUp);
   window.removeEventListener('pointercancel',onUp);
   cancelAnimationFrame(frame);
  };
 },[active]);
 const change=delta=>{
  if(!study){setActive(entries[0].id);return;}
  const index=entries.findIndex(item=>item.id===study.id);
  setActive(entries[(index+delta+entries.length)%entries.length].id);
 };
 return createPortal(<div className="jw-case-reader" role="dialog" aria-modal="true" aria-label={study?study.name+' case study':'John Wolf case studies'}>
  <div className="jw-case-sheet" ref={sheetRef}>
   <aside className="jw-case-meta" aria-label="Case study information">
    <span>{study?.eyebrow||'SELECTED WORK'}</span>
    <span>{study?'Identity & creative direction':'Case studies & visual identity'}</span>
    <span>Designer: John Wolf</span>
   </aside>
   <button type="button" className="jw-case-details-toggle" onClick={()=>setDetails(x=>!x)} aria-expanded={details}>{details?'Close details':'View details'}</button>
   {details&&<aside className="jw-case-details"><h3>{study?.name||'Case studies'}</h3><p>{study?.intro||'Six identities created by John Wolf.'}</p><p>Scroll or drag vertically. The gallery repeats continuously.</p></aside>}
   {!study?<div className="jw-case-library" aria-label="Choose a case study">
     <div className="jw-case-library__intro"><span>JOHN WOLF · SELECTED WORK</span><h2>Stories behind the work.</h2><p>Six identities and the thinking behind each one.</p></div>
     <div className="jw-case-library__grid">{entries.map(item=><button type="button" className="jw-case-tile" key={item.id} onClick={()=>{setActive(item.id);setDetails(false);}} style={{'--jw-case-color':item.highlight}}>
       {item.cover?<img src={item.cover} alt="" loading="lazy"/>:<div className="jw-case-tile__type">{item.name}</div>}
       <span>{item.name}<b>↗</b></span>
     </button>)}</div>
    </div>:<div ref={scrollRef} className="jw-case-scroll" style={{'--jw-case-color':study.highlight}} onScroll={cycleScroll} key={study.id} tabIndex={0} aria-label={study.name+' case study, scroll or drag vertically'}>
     {[0,1,2].map(cycle=><OneCycle key={cycle} study={study} cycle={cycle}/>)}
    </div>}
   {study&&<div className="jw-case-progress" aria-label="Reading progress"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" opacity=".25"/><circle ref={progressRef} cx="20" cy="20" r="14" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="87.965" strokeDashoffset="87.965" transform="rotate(-90 20 20)"/></svg></div>}
   <nav className="jw-case-bottom-nav" aria-label="Switch case study">
    {study?<><button type="button" onClick={()=>change(-1)} aria-label="Previous case study">←</button><span>{study.name}</span><button type="button" onClick={()=>change(1)} aria-label="Next case study">→</button></>:<span>JOHN WOLF · SELECTED WORK</span>}
   </nav>
   <button type="button" className="jw-case-library-toggle" onClick={()=>{setActive(null);setDetails(false);}}>All case studies</button>
   <button type="button" ref={closeRef} className="jw-case-exit" aria-label="Close case study" onClick={onClose}>×</button>
  </div>
 </div>,document.body);
}
