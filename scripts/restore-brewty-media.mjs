import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const videoFiles=[
 {name:'steam-pattern-film.mp4',parts:8,bytes:3618348,sha256:'9341714336f3ed9d54e222e1a00057bb289b1d498a7f92cb7550c4484043df18'},
 {name:'brand-film.mp4',parts:6,bytes:2418742,sha256:'46700bbe05029df4642a5fd558099e42f0e6944651a377baa38277adfe46403b'}
];
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const media of videoFiles){
 const target=join(root,'public','brands','brewty',media.name);
 if(existsSync(target)){
  const current=readFileSync(target);
  if(current.length===media.bytes&&sha256(current)===media.sha256){console.log('[brewty] Verified '+media.name);continue;}
 }
 const parts=Array.from({length:media.parts},(_,i)=>{
  const file=join(root,'media-source','brewty',media.name+'.part'+String(i).padStart(3,'0'));
  return readFileSync(file);
 });
 const assembled=Buffer.concat(parts);
 if(assembled.length!==media.bytes||sha256(assembled)!==media.sha256)
  throw new Error('Brewty video integrity failed for '+media.name+'; refusing deployment');
 mkdirSync(join(root,'public','brands','brewty'),{recursive:true});
 const temp=target+'.tmp';
 try{writeFileSync(temp,assembled);renameSync(temp,target);}
 catch(error){rmSync(temp,{force:true});throw error;}
 console.log('[brewty] Assembled and checksum-verified '+media.name);
}
