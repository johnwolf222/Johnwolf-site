import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import './ContactCard.css';
import NewHomepage from './NewHomepage.jsx';
import ProjectsSequence from './ProjectsSequence.jsx';
import VisualContinuity from './VisualContinuity.jsx';
import AboutExperience from './AboutExperience.jsx';

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
// Client-friendly groupings of the services already presented across About.
// Native optgroups keep keyboard, screen-reader and phone pickers accessible.
const contactProjectGroups = [
 [
  "Branding & strategy",
  [
   "Logo design",
   "Brand identity",
   "Brand strategy",
   "Brand evaluation",
   "Concept development",
   "Design systems",
   "Creative direction"
  ]
 ],
 [
  "Web & product",
  [
   "Website design",
   "Website development",
   "UI/UX design",
   "Product design",
   "Product research",
   "Digital prototyping",
   "AI prompt development"
  ]
 ],
 [
  "Visual & print",
  [
   "Visual design",
   "Illustration",
   "Packaging design",
   "Stationery design",
   "Print design & prepress",
   "Typography",
   "Marketing collateral",
   "Art direction"
  ]
 ],
 [
  "Content & consulting",
  [
   "Content creation",
   "Content guidelines",
   "Visual storytelling",
   "Creative consulting"
  ]
 ]
];

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
  <form className="contact-form" onSubmit={submit} aria-busy={sending} aria-labelledby="contact-form-heading">
   <div className="contact-form__intro">
    <div className="contact-form__eyebrow"><span className="contact-form__pulse" aria-hidden="true" /> PROJECT INQUIRY</div>
    <h3 id="contact-form-heading">Let's make something great.</h3>
    <p>Share a little about your idea to get the conversation started.</p>
   </div>
   <div className="contact-field-pair">
    <label>Name<input name="name" autoComplete="name" required maxLength={120} placeholder="Your name"/></label>
    <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com"/></label>
   </div>
   <label>What do you have in mind?
    <select name="projectType" defaultValue="" required>
     <option value="" disabled>Select a project type</option>
     {contactProjectGroups.map(([group, options]) =>
      <optgroup key={group} label={group}>
       {options.map(option => <option key={option} value={option}>{option}</option>)}
      </optgroup>
     )}
     <option value="Something else">Something else</option>
    </select>
   </label>
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
   <NewHomepage/>
   <ProjectsSequence/>
   <AboutExperience/>
   <Contact/>
  </main>
  <footer><span>JOHN WOLF © {new Date().getFullYear()}</span><a href="#home">Back to top ↑</a></footer>
 </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
