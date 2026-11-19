import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const data=JSON.parse(read('src/content/approved-case-studies.json'));
const expected=['chick-muy-caliente','riches','bring-love-back','inkzilla','brewty','chit-chat'];
const byId=Object.fromEntries(data.studies.map(s=>[s.id,s]));
const reader=read('src/CaseStudyReader.jsx');
const gallery=read('src/ProjectsSequence.jsx');
const stylesheet=read('src/ProjectsSequence.css');
const viewerStyles=read('src/CaseStudyReader.css');
test('the six approved case studies remain distinct with first-person narratives',()=>{
 assert.deepEqual(data.studies.map(s=>s.id),expected);
 data.studies.forEach(s=>{assert.ok(/\\bI\\s/.test(s.intro),s.id+' first person');assert.ok(s.highlight.startsWith('#'),s.id+' marker color');});
});
test('no source images in the live reader point at missing repository assets',()=>{
 for(const study of data.studies){
  const paths=[study.cover,...study.sections.flatMap(s=>[s.src,s.before,s.after,...(s.srcs||[])])].filter(Boolean);
  for(const path of paths) assert.ok(existsSync(resolve(root,'public'+path)),study.id+' missing '+path);
 }
});
test('brand-specific approved layouts and effects remain captured',()=>{
 assert.equal(byId['chit-chat'].highlight.toUpperCase(),'#F7B00B');
 assert.equal(byId['inkzilla'].highlight.toUpperCase(),'#DC342E');
 assert.equal(byId['chick-muy-caliente'].highlight.toUpperCase(),'#F0BB28');
 assert.ok(byId.riches.sections.some(s=>s.type==='grid'&&s.columns===2&&s.srcs.length===4));
 assert.ok(byId['bring-love-back'].sections.some(s=>s.type==='compare'));
 assert.ok(byId['bring-love-back'].sections.some(s=>s.type==='video'));
 assert.ok(byId.brewty.layoutToPreserve.includes('three'));
 assert.ok(byId.inkzilla.layoutToPreserve.includes('comparison'));
 assert.ok(byId['chit-chat'].layoutToPreserve.includes('clock-it'));
});
test('reader has navigation, looping media, comparison and marker rules',()=>{
 for(const token of ['role="dialog"','aria-modal="true"','setActive','onScroll={cycleScroll}','type="range"','playsInline','autoPlay','muted','loop'])
  assert.ok(reader.includes(token),token);
 assert.ok(viewerStyles.includes('jw-case-marker'));
 assert.ok(viewerStyles.includes('jw-case-grid--3'));
});
test('existing 21-card choreography remains; gallery case study actions clickable',()=>{
 assert.ok(gallery.includes('const CARD_COUNT = 21'));
 assert.ok(gallery.includes('LivePaperRenderer'));
 assert.ok(gallery.includes('HomePaperMotion'));
 assert.ok(gallery.includes('CaseStudyReader'));
 assert.ok(gallery.includes('Explore all six'));
 assert.ok(gallery.includes('setOpenedProject(PROJECTS[activeRef.current])'));
 assert.ok(stylesheet.includes('.jw-projects-stage__details{pointer-events:auto;}'));
});
