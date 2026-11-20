import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const data=JSON.parse(read('src/content/approved-case-studies.json'));
const expected=['chick-muy-caliente','riches','bring-love-back','inkzilla','brewty','chit-chat','nurush'];
const byId=Object.fromEntries(data.studies.map(s=>[s.id,s]));
const reader=read('src/CaseStudyReader.jsx');
const gallery=read('src/ProjectsSequence.jsx');
const stylesheet=read('src/ProjectsSequence.css');
const viewerStyles=read('src/CaseStudyReader.css');
test('the seven approved case studies remain distinct with first-person narratives',()=>{
 assert.deepEqual(data.studies.map(s=>s.id),expected);
 data.studies.forEach(s=>{assert.ok(s.intro.includes('I '),s.id+' first person');assert.ok(s.highlight.startsWith('#'),s.id+' marker color');});
});
test('no source images in the live reader point at missing repository assets',()=>{
 for(const study of data.studies){
  const paths=[study.cover,...study.sections.flatMap(s=>[s.src,s.before,s.after,...(s.srcs||[])])].filter(Boolean);
  for(const path of paths) assert.ok(existsSync(resolve(root,'public'+path)),study.id+' missing '+path);
 }
});
test('brand-specific approved layouts and effects remain captured',()=>{
 assert.equal(byId['chit-chat'].highlight.toUpperCase(),'#F7B00B');
 assert.equal(byId.nurush.highlight.toUpperCase(),'#126311');
 assert.equal(byId.nurush.cover,'/brands/nurush/stories-cover.webp');
 assert.ok(byId.nurush.sections.some(s=>s.src==='/brands/nurush/green-identity.webp'));
 assert.equal(byId['inkzilla'].highlight.toUpperCase(),'#DC342E');
 assert.equal(byId['chick-muy-caliente'].highlight.toUpperCase(),'#F0BB28');
 assert.ok(byId.riches.sections.some(s=>s.type==='grid'&&s.columns===2&&s.srcs.length===4));
 assert.ok(byId['bring-love-back'].sections.some(s=>s.type==='compare'));
 assert.ok(byId['bring-love-back'].sections.some(s=>s.type==='video'));
 assert.equal(byId.brewty.sections[0].type,'image');
 assert.equal(byId.brewty.sections[0].src,'/brands/brewty/combined-artwork.webp');
 assert.equal(byId.brewty.sections.length,3);
 assert.equal(byId.brewty.sections.filter(s=>s.type==='video').length,2);
 assert.ok(byId.brewty.sections.find(s=>s.src==='/brands/brewty/brand-film.mp4')?.title.includes('5-second'));
 assert.ok(byId.brewty.sections.find(s=>s.src==='/brands/brewty/steam-pattern-film.mp4')?.title.includes('24.98-second'));
 assert.ok(read('scripts/restore-brewty-media.mjs').includes("name:'steam-pattern-film.mp4',parts:28,bytes:12705523"));
 assert.ok(read('scripts/restore-brewty-media.mjs').includes("name:'brand-film.mp4',parts:7,bytes:2780133"));
 assert.ok(!byId.brewty.sections.some(s=>s.type==='grid'));
 assert.ok(!byId.brewty.sections.some(s=>s.src==='/brands/brewty/colored-character.webp'));
 assert.ok(byId.brewty.layoutToPreserve.includes('combined Brewty.png'));
 assert.equal(byId.brewty.coverInGrid,true);
 assert.ok(byId.inkzilla.layoutToPreserve.includes('comparison'));
 assert.ok(byId['chit-chat'].layoutToPreserve.includes('clock-it'));
});
test('reader has navigation, looping media, comparison and marker rules',()=>{
 for(const token of ['role="dialog"','aria-modal="true"','setActive','onScroll={cycleScroll}','type="range"','playsInline','autoPlay','muted','loop'])
  assert.ok(reader.includes(token),token);
 assert.ok(viewerStyles.includes('jw-case-marker'));
 assert.ok(viewerStyles.includes('jw-case-grid--3'));
 assert.ok(viewerStyles.includes('jw-case-grid--brewty'));
 assert.ok(reader.includes('IntersectionObserver'));
 assert.ok(reader.includes('video.defaultMuted=true'));
 assert.ok(reader.includes('video.loop=true'));
});
test('NURUSH opens from both its case-study cover and the approved Nurusa featured card',()=>{
 assert.equal(byId.nurush.name,'NURUSH');
 assert.ok(reader.includes("if(normalized==='nurusa')return 'nurush'"));
 assert.ok(reader.includes('onClick={()=>{setActive(item.id);setDetails(false);}}'));
 assert.ok(reader.includes('const lookup=Object.fromEntries(entries.map(item=>[item.id,item]))'));
 assert.ok(gallery.includes("name: 'Nurusa'"));
});
test('existing 21-card choreography remains; gallery case study actions clickable',()=>{
 assert.ok(gallery.includes('const CARD_COUNT = 21'));
 assert.ok(gallery.includes('LivePaperRenderer'));
 assert.ok(gallery.includes('HomePaperMotion'));
 assert.ok(gallery.includes('CaseStudyReader'));
 assert.ok(gallery.includes('Explore all seven'));
 assert.ok(gallery.includes('setOpenedProject(PROJECTS[activeRef.current])'));
 assert.ok(stylesheet.includes('.jw-projects-stage__details{pointer-events:auto;}'));
});
