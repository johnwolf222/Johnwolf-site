import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const cover={
 name:'case-study-cover-2026.png',
 parts:4,
 bytes:3409719,
 sha256:'d7c5e2a770003c9adecd029d857fccc8fa0d8fd3ebcf74dd72ffc3975a501a30'
};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const target=join(root,'public','brands','inkzilla',cover.name);
if(existsSync(target)){
 const existing=readFileSync(target);
 if(existing.length===cover.bytes&&sha256(existing)===cover.sha256){
  console.log('[case-cover] Verified exact Inkzilla cover');
  process.exit(0);
 }
}
const parts=Array.from({length:cover.parts},(_,i)=>readFileSync(
 join(root,'media-source','case-covers',cover.name+'.part'+String(i).padStart(3,'0'))
));
const original=Buffer.concat(parts);
if(original.length!==cover.bytes||sha256(original)!==cover.sha256)
 throw new Error('Inkzilla original cover integrity failed; refusing deployment');
mkdirSync(join(root,'public','brands','inkzilla'),{recursive:true});
const temp=target+'.tmp';
try{writeFileSync(temp,original);renameSync(temp,target)}
catch(error){rmSync(temp,{force:true});throw error}
console.log('[case-cover] Restored byte-exact Inkzilla cover');
