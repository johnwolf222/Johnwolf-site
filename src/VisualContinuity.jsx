import React,{useEffect,useRef} from 'react';
import {sharedGlowReveal} from './visual-continuity-motion.js';
import './visual-continuity.css';

// ONE continuous light field behind Projects, About, Tools and Contact.
// Home stays plain white; the field never remounts at section changes.
export default function VisualContinuity(){
 const field=useRef(null);
 useEffect(()=>{
  const node=field.current;
  if(!node)return undefined;
  const mq=window.matchMedia('(prefers-reduced-motion: reduce)');
  const [primary,secondary]=node.children;
  const work=document.getElementById('work');
  const anchors=[
   ['#work',64,59],['#about',37,47],
   ['#contact',64,55],['footer',48,46],
  ].map(([selector,x,y])=>[document.querySelector(selector),x,y]);
  let frame=0,measureFrame=0,disposed=false,last=0;
  let x=59,y=55,visibility=0;
  let targetX=59,targetY=55,targetVisibility=0;
  const render=time=>{
   frame=0;
   if(disposed)return;
   const dt=last?Math.min(.06,(time-last)/1000):1/60;
   last=time;
   const blend=mq.matches?1:1-Math.exp(-dt/.8);
   x+=(targetX-x)*blend;
   y+=(targetY-y)*blend;
   visibility+=(targetVisibility-visibility)*blend;
   const t=mq.matches?0:time/1000;
   // Subtle independent movement carries the SAME glow across sections.
   // Transforms only: no scroll writes or full-screen blur repaints.
   primary.style.transform=`translate3d(${(x-50)*.45+Math.sin(t*.28)*12}%,${(y-50)*.45+Math.cos(t*.23)*10}%,0)`;
   secondary.style.transform=`translate3d(${(50-x)*.43-Math.sin(t*.21+.8)*11}%,${(50-y)*.4-Math.cos(t*.19+.6)*9}%,0)`;
   if(targetVisibility===0&&visibility<.003)visibility=0;
   node.style.opacity=String(Math.max(0,Math.min(1,
    visibility*(mq.matches?1:.94+.06*Math.sin(t*.44)))));
   if(!mq.matches&&(visibility>.002||targetVisibility>.002))
    frame=requestAnimationFrame(render);
   else last=0;
  };
  const measure=()=>{
   if(disposed)return;
   const height=Math.max(1,window.innerHeight);
   const workTop=work?.getBoundingClientRect().top;
   targetVisibility=sharedGlowReveal(workTop,height);
   let total=0,tx=0,ty=0;
   for(const [section,ax,ay] of anchors){
    if(!section)continue;
    const rect=section.getBoundingClientRect();
    const visible=Math.max(0,
      Math.min(rect.bottom,height)-Math.max(0,rect.top));
    const weight=visible/height;
    total+=weight;tx+=weight*ax;ty+=weight*ay;
   }
   if(total>0){
    targetX=tx/total;
    targetY=ty/total;
   }
   if(!frame)frame=requestAnimationFrame(render);
  };
  const schedule=()=>{
   if(!measureFrame)measureFrame=requestAnimationFrame(()=>{
    measureFrame=0;measure();
   });
  };
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule,{passive:true});
  mq.addEventListener?.('change',schedule);
  schedule();
  // Existing title entrance effects remain separate from the light field.
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
   if(!entry.isIntersecting||mq.matches)return;
   entry.target.animate([
    {opacity:0,transform:'translate(0,28px) skewY(-2deg) scale(1.025,.96)'},
    {opacity:1,transform:'translate(0,-2px) skewY(.3deg) scale(.995,1.015)',offset:.75},
    {opacity:1,transform:'none'}
   ],{duration:850,easing:'cubic-bezier(.22,.7,.2,1)'});
   observer.unobserve(entry.target);
  }),{threshold:.25});
  document.querySelectorAll(
   '.logo-creations-title,.brand-gallery-heading,.about h2'
  ).forEach(el=>observer.observe(el));
  return()=>{
   disposed=true;
   cancelAnimationFrame(frame);
   cancelAnimationFrame(measureFrame);
   observer.disconnect();
   window.removeEventListener('scroll',schedule);
   window.removeEventListener('resize',schedule);
   mq.removeEventListener?.('change',schedule);
  };
 },[]);
 return <div ref={field} className="site-light-field" aria-hidden="true"><span/><span/></div>;
}
