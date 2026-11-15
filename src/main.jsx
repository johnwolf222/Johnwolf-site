import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import NewHomepage,{FloatingWorkSection} from './NewHomepage.jsx';
import FloatingCards from './FloatingCards.jsx';
import VisualContinuity from './VisualContinuity.jsx';

function PurpleCursor(){
 useEffect(()=>{
  const html=document.documentElement;
  const point=event=>html.classList.toggle('purple-native-cursor',event.pointerType==='mouse');
  document.addEventListener('pointerover',point,{passive:true});
  return()=>{
   html.classList.remove('purple-native-cursor');
   document.removeEventListener('pointerover',point);
  };
 },[]);
 return null;
}
const contactServices = [
 ['Logo design', 'A distinctive mark for a new business or a brand ready for a refresh, with versions that work across print and digital.'],
 ['Brand identity', 'A visual system that brings your logo, color, typography, and imagery together, with guidelines your team can use.'],
 ['Websites', 'A responsive website that presents your work or business clearly and makes it easy for visitors to take the next step.'],
];

function Contact(){
 const [status,setStatus]=useState(''),[sending,setSending]=useState(false);
 const endpoint=import.meta.env.VITE_CONTACT_ENDPOINT?.trim();
 const email=import.meta.env.VITE_CONTACT_EMAIL?.trim() || 'johnwolf.connect@gmail.com';
 const canContact=Boolean(endpoint||email);
 const submit=async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  if(sending||!canContact)return;
  const inquiry=Object.fromEntries(new FormData(form));
  if(!endpoint){
   const subject=encodeURIComponent(`Project inquiry — ${inquiry.projectType}`);
   const body=encodeURIComponent(`Name: ${inquiry.name}\r\nEmail: ${inquiry.email}\r\n\r\n${inquiry.message}`);
   window.location.href=`mailto:${email}?subject=${subject}&body=${body}`;
   setStatus('Finish sending your inquiry in your email app.');
   return;
  }
  setSending(true);setStatus('');
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(inquiry)});
   if(!response.ok)throw new Error('Delivery failed');
   setStatus('Thank you. Your inquiry has been submitted.');form.reset();
  }catch{setStatus('Your inquiry could not be sent. Your details are still here so you can try again.')}
  finally{setSending(false)}
 };
 return <section id="contact" className="contact-section" aria-labelledby="contact-heading">
  <div className="contact-copy"><span className="kicker">LET’S WORK TOGETHER</span><h2 id="contact-heading">An idea worth<br/><i>bringing to life.</i></h2><p>Tell me what you’re building, what you need, and when you’d like to launch.</p>
   <div className="contact-explore" aria-label="Explore ways to work together">
    {contactServices.map(([label,description])=><details key={label} className="contact-explore-option"><summary>{label}<span aria-hidden="true">+</span></summary><div className="contact-explore-reveal"><p>{description}</p></div></details>)}
   </div>
  </div>
  <form className="contact-form" onSubmit={submit} aria-busy={sending}>
   <div className="contact-field-pair">
    <label>Name<input name="name" autoComplete="name" required maxLength={120} placeholder="Your name"/></label>
    <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com"/></label>
   </div>
   <label>What do you have in mind?<select name="projectType" defaultValue="" required><option value="" disabled>Select a project type</option><option>Logo design</option><option>Brand identity</option><option>Website design</option><option>Something else</option></select></label>
   <label>Project details<textarea name="message" rows={5} required maxLength={6000} placeholder="A little about your project, goals, and timing."/></label>
   <button className="contact-submit" type="submit" disabled={sending||!canContact}>{sending?'Sending…':endpoint||!email?'Send inquiry':'Open email draft'} <span aria-hidden="true">↗</span></button>
   <p className="contact-status" role="status">{canContact?status:'Project inquiries will open once a contact address is available.'}</p>
  </form>
 </section>;
}


function App(){
 return <div>
  <VisualContinuity/>
  <PurpleCursor/>
  <header className="header">
   <a href="#home" className="wordmark">JOHN<span>WOLF</span><b>.</b></a>
   <nav aria-label="Main navigation">
    <a href="#home">Home</a>
    <a href="#work">Selected Work</a>
    <a href="#about">About</a>
    <a href="#contact">Contact</a>
   </nav>
  </header>
  <main id="top">
   <FloatingCards/>
   <NewHomepage/>
   <FloatingWorkSection/>
   <section id="about" className="about"><span className="kicker">CREATIVE PRACTICE</span><h2>Design is how<br/>I make ideas <i>felt.</i></h2><p>I'm John Wolf. My work connects logo design, brand identity, and digital experiences through clarity and purpose.</p><a href="#contact" className="contact-note">Let’s work together ↗</a></section>
   <Contact/>
  </main>
  <footer><span>JOHN WOLF © {new Date().getFullYear()}</span><a href="#home">Back to top ↑</a></footer>
 </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
