// Section 2 → Section 3. Reversible scroll-derived choreography.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
const ease=t=>{const x=clamp(t);return x*x*(3-2*x)};
const mix=(a,b,t)=>a+(b-a)*t;

// Section 2 rests at .10vh; the final .70 viewport carries the exit.
export function aboutHandoffProgress(scrollY,galleryTop,galleryHeight,viewportHeight){
 const end=galleryTop+galleryHeight;
 const start=end-viewportHeight*.70;
 return ease((scrollY-start)/Math.max(1,end-start));
}

// Same cards and depth ordering as Projects. Only the exit offsets change.
export function departingCardOffset(progress,index,rank,width,height){
 const delay=(rank<0?0:rank)*.014;
 const amount=ease((clamp(progress)-delay)/(1-delay));
 return {x:width*2.75*amount,y:-height*.09*amount,ry:-14*amount,
  opacity:1-ease((clamp(progress)-.80)/.19)};
}

// Do not remount or duplicate the exact approved GLB.
export function aboutHeadPose(progress,galleryPose){
 const t=ease(progress);
 return {shift:mix(galleryPose.shift,0,t),scale:mix(galleryPose.scale,1,t)};
}

// The single head stays visible for the original About story, then clears before Contact.
export function aboutHeadOpacity(scrollY,aboutBottom,viewportHeight){
 const start=aboutBottom-viewportHeight*1.22;
 const end=aboutBottom-viewportHeight*.16;
 return 1-ease((scrollY-start)/Math.max(1,end-start));
}
