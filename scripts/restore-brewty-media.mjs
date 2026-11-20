import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const videoFiles=[
 {name:'steam-pattern-film.mp4',parts:28,bytes:12705523,sha256:'0189e1b9ebd69205dba7e716b2e10815cd159b5bf1a5f294b63709e51ddccdf6'},
 {name:'brand-film.mp4',parts:7,bytes:2780133,sha256:'292a743805ef17dc047d4b8c6f06d926b8ca7255afb49a8b9008f0770b94f2a6'}
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
