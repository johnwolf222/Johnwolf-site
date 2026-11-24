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
test('the original seven approved case studies remain intact and Suggested Solutions is eighth',()=>{
 assert.deepEqual(data.studies.slice(0,7).map(s=>s.id),expected);
 assert.equal(data.studies.length,8);
 assert.equal(data.studies[7].id,'suggested-solutions');
 data.studies.forEach(s=>{assert.ok(s.intro.includes('I '),s.id+' first person');assert.ok(s.highlight.startsWith('#'),s.id+' marker color');});
});
test('no source images in the live reader point at missing repository assets',()=>{
 for(const study of data.studies){
  const paths=[study.cover,study.tileCover,...study.sections.flatMap(s=>[s.src,s.before,s.after,...(s.srcs||[])])].filter(Boolean);
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
 assert.equal(byId.brewty.coverInGrid,false);
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
 assert.ok(gallery.includes('All case studies'));
 assert.ok(gallery.includes('onClick={() => setOpenedProject(project)}'));
 assert.match(stylesheet,/\.jw-projects-stage__details\s*\{\s*pointer-events:\s*auto;/,
   'project details remain clickable regardless of CSS formatting');
});

test('all visible gallery sheets can be outlined and selected before the reader opens',()=>{
 const renderer=read('src/LivePaperRenderer.jsx');
 assert.ok(renderer.includes('new THREE.Raycaster()'), 'GPU card picking');
 assert.ok(renderer.includes('new THREE.LineLoop('), 'perspective-correct purple outline');
 assert.ok(renderer.includes('color: 0x8750f1'), 'signature purple');
 assert.ok(gallery.includes('selectAndOpen(index) {'), 'side sheets are actionable');
 assert.ok(gallery.includes('settleTo(index, () => setOpenedProject(PROJECTS[index]))'),
   'selected side sheet settles in front before opening');
 assert.ok(gallery.includes('galleryControlsRef.current.pick(event.clientX, event.clientY)'),
   'a click must hit an actual card, not only the center rectangle');
 assert.ok(!gallery.includes('const withinCard ='), 'old center-only hit target removed');
 assert.ok(stylesheet.includes('data-hovered-card'), 'pointer changes over any card');
 assert.ok(stylesheet.includes('--jw-hover-art-width'), 'fallback outline fits image dimensions');
 assert.ok(gallery.includes('image.naturalWidth * fit'), 'fallback uses the actual artwork aspect ratio');
});
test('every case-study close restores section two and the gallery button reads All case studies',()=>{
 assert.ok(gallery.includes('const closeCaseStudy = React.useCallback('));
 assert.ok(gallery.includes('onClose={closeCaseStudy}'));
 assert.ok(gallery.includes('returnToGallery() {'));
 assert.ok(gallery.includes('window.scrollTo(0, galleryAnchor())'));
 assert.ok(gallery.includes('markGallerySettled()'));
 assert.ok(gallery.includes('>All case studies</button>'));
 assert.ok(!gallery.includes('Explore all seven'));
 assert.ok(!gallery.includes('>Explore all ↗</button>'));
 assert.ok(gallery.includes("{name:'All case studies'}"));
});

test('Projects case-study actions sit beneath the body copy and use individual glass buttons',()=>{
 const row=stylesheet.match(/@media \(max-width: 700px\) \{\s*\.jw-projects-stage__case-actions \{([^}]+)\}/)?.[1];
 assert.ok(row,'mobile case-study actions stay inside the copy column');
 assert.match(row,/position: static;/);
 assert.match(row,/background: transparent;/);
 assert.match(row,/box-shadow: none;/);
 assert.doesNotMatch(row,/top: 39%|left: 0|justify-content: space-between/);
 assert.match(gallery,/<p>\{project\.description\}<\/p>\s*<div className="jw-projects-stage__case-actions">/,
   'buttons must flow immediately after the project description');
 const actionStyles=stylesheet.slice(
   stylesheet.indexOf('/* Anchor the two case-study actions directly below'),
   stylesheet.indexOf('/* The active pointer target is whichever')
 );
 assert.match(actionStyles,/\.jw-projects-stage__case-actions \{\s*position: static;/,
   'buttons are not positioned by a hard-coded viewport offset');
 assert.doesNotMatch(actionStyles,/position: absolute;|top: clamp\(305px|top: 39%/);
 assert.match(actionStyles,/\.jw-projects-stage__case-actions \.jw-case-open-button \{[\s\S]*?min-height: 44px/);
 assert.match(actionStyles,/background: rgba\(255, 255, 255, \.62\)/);
 assert.match(actionStyles,/backdrop-filter: blur\(16px\) saturate\(130%\)/);
 assert.match(actionStyles,/color: #171717;/);
 assert.match(actionStyles,/\.jw-projects-stage__case-actions \.jw-case-open-all \{[\s\S]*?background: rgba\(255, 255, 255, \.62\)/);
 assert.doesNotMatch(actionStyles,/linear-gradient\(135deg, #9453ee|color: #fff;/);
 assert.match(actionStyles,/\.jw-projects-stage__case-actions \.jw-case-open-button:focus-visible/);
 assert.match(actionStyles,/\.jw-projects-stage__case-actions \.jw-case-open-button:active/);
 assert.match(gallery,/jw-case-open-button__icon" aria-hidden="true">↗︎/);
 assert.ok(gallery.includes('onClick={() => setOpenedProject(project)}'));
 assert.ok(gallery.includes("onClick={() => setOpenedProject({name:'All case studies'})}"));
});

test('case-study viewer uses minimalist black floating controls with purple interaction only',()=>{
 assert.doesNotMatch(reader, /<aside className="jw-case-meta"/,
  'the top-left metadata block is gone, as approved');
 assert.match(reader, /className="jw-case-details-icon" aria-hidden="true"/,
  'details keep their own plus/minus affordance');
 assert.match(reader, /className="jw-case-library-toggle"/);
 assert.match(reader, /className="jw-case-bottom-nav"/);
 assert.match(reader, /className="jw-case-progress"/);
 assert.match(reader, /className="jw-case-exit"/);
 assert.match(viewerStyles, /\.jw-case-sheet\{[^}]*background:#fff;/,
  'the case-study sheet keeps a clean white background');
 const controls=viewerStyles.slice(
  viewerStyles.indexOf('/* The top-left case-study metadata sidebar has been removed. */'),
  viewerStyles.indexOf('/* Brewty: preserve all three original panels')
 );
 assert.ok(controls, 'the floating control styles exist');
 assert.doesNotMatch(controls, /rgba\(153,0,255|color:#fff/,
  'old purple-filled buttons and white icons must be removed');
 for(const name of ['jw-case-details-toggle','jw-case-library-toggle','jw-case-bottom-nav','jw-case-progress,.jw-case-exit']){
  assert.ok(controls.includes('.'+name), 'missing control '+name);
 }
 assert.match(controls, /\.jw-case-library-toggle::after\{/);
 assert.match(controls, /transform:scaleX\(0\)/,
  'purple underline stays hidden until interaction');
 assert.match(controls, /\.jw-case-library-toggle:hover::after\{transform:scaleX\(1\)\}/);
 assert.match(controls, /@media\(max-width:720px\)\{/,
  'small screen control layout remains supported');
});

test('each floating case-study button has its own white glass capsule, without a shared pill',()=>{
 const controls=viewerStyles.slice(
  viewerStyles.indexOf('/* The top-left case-study metadata sidebar has been removed. */'),
  viewerStyles.indexOf('/* Brewty: preserve all three original panels')
 );
 assert.match(controls,/\/\* Individual, translucent glass capsules; never a shared toolbar\. \*\//);
 assert.match(controls,/\.jw-case-details-toggle,\.jw-case-library-toggle,\.jw-case-bottom-nav button,\.jw-case-exit\{/);
 assert.match(controls,/background:rgba\(255,255,255,\.62\)/);
 assert.match(controls,/border-radius:999px/);
 assert.match(controls,/backdrop-filter:blur\(16px\) saturate\(130%\)/);
 assert.match(controls,/\.jw-case-bottom-nav\{background:transparent;border:0;box-shadow:none;backdrop-filter:none\}/);
 assert.match(controls,/\.jw-case-bottom-nav button,\.jw-case-exit\{border-radius:50%\}/);
 assert.match(controls,/border-color:rgba\(135,80,241,\.42\)/);
 assert.match(controls,/@media\(max-width:440px\)/);
 assert.doesNotMatch(reader,/<aside className="jw-case-meta"/);
});

test('original user-supplied case-study covers are byte-exact and shown without crop', async()=>{
 const {createHash}=await import('node:crypto');
 const covers=[
  ['chick-muy-caliente','/brands/chick-muy-caliente/case-study-cover-2026.png',1376,768,
   '7e4c4a200b3a9f0e000d04996aaced77e5a6d4b58d51851c42cd626f81b95b9a'],
  ['riches','/brands/riches/case-study-cover-2026.png',1920,1080,
   'a211fa47b9c49f6d6bb2e7c2748ce8b1be3d793ab7add6505c84cf45ed14b712']
 ];
 for(const [id,path,width,height,sha256] of covers){
  const study=byId[id];
  assert.equal(study.cover,path,'the story uses the approved replacement image');
  assert.equal(study.tileCover,path,'the case-study index uses the same replacement');
  const full=resolve(root,'public'+path);
  assert.ok(existsSync(full),'supplied cover asset must exist: '+path);
  const png=readFileSync(full);
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a','PNG format preserved');
  assert.equal(png.readUInt32BE(16),width,'source width must be unchanged');
  assert.equal(png.readUInt32BE(20),height,'source height must be unchanged');
  assert.equal(createHash('sha256').update(png).digest('hex'),sha256,
   'source artwork must be preserved byte-for-byte');
 }
 assert.ok(reader.includes('item.tileCover||item.cover'),
   'index must prefer the new tile cover');
 assert.match(viewerStyles,/\.jw-case-tile--custom-cover img\{object-fit:contain;/,
   'show the full cover, no cropped edges');
 assert.ok(gallery.includes("id === 9 ? '/brands/riches-approved-vertical.png'"),
   'approved Riches gallery card stays unchanged');
});

test('new Brewty and Inkzilla case-study covers are byte-exact and visible in index and reader',async()=>{
 const {createHash}=await import('node:crypto');
 const replacements=[
  ['brewty','/brands/brewty/case-study-cover-2026.png',1376,768,'12f66c27fe5a519c40ff117e4b11225d2347f234b564c8d2c2a5afec9e077e9b'],
  ['inkzilla','/brands/inkzilla/case-study-cover-2026.png',1920,1080,'d7c5e2a770003c9adecd029d857fccc8fa0d8fd3ebcf74dd72ffc3975a501a30']
 ];
 for(const [id,path,width,height,hash] of replacements){
  const study=byId[id],file=resolve(root,'public'+path);
  assert.equal(study.cover,path,id+' individual reader cover');
  assert.equal(study.tileCover,path,id+' case-study index tile');
  assert.ok(existsSync(file),'uploaded replacement must exist');
  const bytes=readFileSync(file);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16),width);
  assert.equal(bytes.readUInt32BE(20),height);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,
    'the complete original user image must be preserved');
 }
 assert.equal(byId.brewty.coverInGrid,false,'Brewty new cover must be visible inside case study');
 assert.equal(byId.brewty.sections.length,3,'approved Brewty artwork and two videos preserved');
 assert.equal(byId.inkzilla.sections.length,6,'existing Inkzilla interior media preserved');
 assert.ok(read('package.json').includes('restore-case-study-covers.mjs'));
 assert.ok(reader.includes('item.tileCover||item.cover'),'the index prefers the replacement cover');
 assert.match(viewerStyles,/\.jw-case-tile--custom-cover img\{object-fit:contain;/,
  'show full wide covers without crop');
});

test('mobile and desktop index cards fit original artwork without padded image frames',()=>{
 assert.match(viewerStyles,/\.jw-case-tile img\{display:block;width:100%;height:auto;aspect-ratio:auto;object-fit:contain\}/,
   'artwork is displayed at intrinsic aspect ratio, without forced image height');
 assert.doesNotMatch(viewerStyles,/\.jw-case-tile img,\.jw-case-tile__type\{height:/,
   'the fallback label tile must not impose its fixed height on real photographs');
 assert.match(viewerStyles,/\.jw-case-library__grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:25px;align-items:start\}/,
   'both columns stay aligned but shorter card boxes are never stretched');
 assert.match(viewerStyles,/\.jw-case-library__grid \.jw-case-tile\{align-self:start;height:auto\}/);
 assert.match(viewerStyles,/\.jw-case-library__grid \.jw-case-tile img\{height:auto;max-height:none;aspect-ratio:auto;object-fit:contain\}/);
 assert.match(viewerStyles,/\.jw-case-tile--custom-cover img\{object-fit:contain;background:transparent\}/,
   'new brand covers never inherit gray letterbox backgrounds');
 assert.match(viewerStyles,/\.jw-case-library__grid \.jw-case-tile > span\{min-height:0\}/,
   'project titles are not forced into oversized caption panels');
 assert.match(viewerStyles,/@media\(max-width:720px\)\{\s*\.jw-case-library__grid \.jw-case-tile > span\{padding:10px 12px 12px;font-size:clamp\(13px,3\.8vw,16px\);line-height:1\.22\}/,
   'phone titles fit directly beneath each natural-height cover');
 assert.match(reader,/<span>\{item.name\}<b aria-hidden="true">↗︎<\/b><\/span>/,
   'project arrows render as text, not blue emoji square icons');
 assert.match(viewerStyles,/\.jw-case-library__grid \.jw-case-tile:hover b\{color:#8750f1\}/,
   'signature purple remains the hover accent');
 assert.ok(reader.includes('onClick={()=>{setActive(item.id);setDetails(false);}}'),
   'the index cards still open the original individual readers');
});

test('bottom-center labels in both reader and All case studies index have clear individual glass pills',()=>{
 assert.match(reader,/className="jw-case-bottom-nav" aria-label="Switch case study"/);
 assert.match(reader,/\{study\.name\}<\/span>/,'active study name still appears in the center');
 assert.match(reader,/<span>JOHN WOLF · SELECTED WORK<\/span>/,
  'the all-cases index still shows the selected-work caption');
 const label=viewerStyles.slice(
  viewerStyles.indexOf('/* Individual glass backing for the centered study title AND index label.'),
  viewerStyles.indexOf('.jw-case-details-toggle,.jw-case-library-toggle,.jw-case-bottom-nav button,.jw-case-exit{')
 );
 assert.match(label,/\.jw-case-bottom-nav > span\{/,'only central text labels get the glass backing');
 assert.match(label,/background:rgba\(255,255,255,\.62\)/);
 assert.match(label,/border-radius:999px/);
 assert.match(label,/backdrop-filter:blur\(16px\) saturate\(130%\)/);
 assert.match(label,/min-height:44px/);
 assert.match(viewerStyles,/@media\(max-width:720px\)\{\s*\.jw-case-bottom-nav > span\{/);
 assert.match(viewerStyles,/@media\(max-width:440px\)\{\s*\.jw-case-bottom-nav > span\{/);
 assert.match(viewerStyles,/\.jw-case-bottom-nav\{background:transparent;border:0;box-shadow:none;backdrop-filter:none\}/,
  'arrows and text must not share a single glass bar');
});
