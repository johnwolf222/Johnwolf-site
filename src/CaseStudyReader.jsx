import React,{useEffect,useRef,useState} from 'react';
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
  <div className="jw-case-hero">
   {study.cover?<img className="jw-case-hero__art" src={study.cover} alt={study.name+' brand artwork'} loading={cycle===1?'eager':'lazy'}/>:<div className="jw-case-hero__plain" aria-hidden="true">{study.name}</div>}
   <div className="jw-case-hero__label"><span>{study.eyebrow}</span><h2>{study.name}</h2></div>
  </div>
  <div className="jw-case-narrative">
   <span className="jw-case-section-label">THE IDEA & THE EXECUTION</span>
   <p><Ink phrases={study.highlights}>{study.intro}</Ink></p>
  </div>
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
 const focusReturn=useRef(null);
 const study=active?lookup[active]:null;
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
  const id=requestAnimationFrame(()=>{root.scrollTop=root.firstElementChild?.getBoundingClientRect().height||0;});
  return()=>cancelAnimationFrame(id);
 },[active]);
 const cycleScroll=event=>{
  const root=event.currentTarget,h=root.firstElementChild?.getBoundingClientRect().height||0;
  if(h<80)return;
  if(root.scrollTop<h*.45)root.scrollTop+=h;
  else if(root.scrollTop>h*2.55)root.scrollTop-=h;
 };
 const change=delta=>{
  if(!study){setActive(entries[0].id);return;}
  const index=entries.findIndex(item=>item.id===study.id);
  setActive(entries[(index+delta+entries.length)%entries.length].id);
 };
 return createPortal(<div className="jw-case-reader" role="dialog" aria-modal="true" aria-label={study?study.name+' case study':'John Wolf case studies'}>
   <header className="jw-case-toolbar">
    <button type="button" ref={closeRef} className="jw-case-back" onClick={onClose}>← Back to projects</button>
    <span className="jw-case-toolbar__name">{study?.name||'Selected Case Studies'}</span>
    <button type="button" className="jw-case-index-link" onClick={()=>setActive(null)}>All case studies</button>
    {study&&<nav className="jw-case-arrow-nav" aria-label="Switch case study"><button type="button" onClick={()=>change(-1)} aria-label="Previous case study">←</button><button type="button" onClick={()=>change(1)} aria-label="Next case study">→</button></nav>}
    <button className="jw-case-exit" type="button" aria-label="Close" onClick={onClose}>×</button>
   </header>
   {!study?<div className="jw-case-library" aria-label="Choose a case study">
    <div className="jw-case-library__intro"><span>JOHN WOLF · SELECTED WORK</span><h2>Stories behind the work.</h2><p>Six identities and the thinking behind each one.</p></div>
    <div className="jw-case-library__grid">{entries.map(item=><button type="button" className="jw-case-tile" key={item.id} onClick={()=>setActive(item.id)} style={{'--jw-case-color':item.highlight}}>
      {item.cover?<img src={item.cover} alt="" loading="lazy"/>:<div className="jw-case-tile__type">{item.name}</div>}
      <span>{item.name}<b>↗</b></span>
    </button>)}</div>
   </div>:<div ref={scrollRef} className="jw-case-scroll" style={{'--jw-case-color':study.highlight}} onScroll={cycleScroll} key={study.id} tabIndex={0} aria-label={study.name+' case study, scroll or drag vertically'}>
    {[0,1,2].map(cycle=><OneCycle key={cycle} study={study} cycle={cycle}/>)}
   </div>}
  </div>,document.body);
}
