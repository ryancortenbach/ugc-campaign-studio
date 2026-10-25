import {parseProductionPacket} from './runtime/import-packet.js';
import {planFindings} from './runtime/planner.js';
import {fields} from './runtime/brief.js';
const byId=id=>document.getElementById(id);
let epoch=0;
const list=(id,values)=>{const nodes=values.map(value=>{const li=document.createElement('li');li.textContent=value;return li;});byId(id).replaceChildren(...nodes);};
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
for(const button of document.querySelectorAll('[data-packet]'))button.addEventListener('click',async()=>{
 const request=++epoch;byId('result').hidden=true;byId('status').textContent='Reading the selected draft. No provider request.';
 try{
  const response=await fetch('manifest.json');if(!response.ok)throw Error('Manifest unavailable.');const manifest=await response.json(),record=manifest.packets.find(p=>p.id===button.dataset.packet);if(!record)throw Error('Unknown draft.');
  const file=await fetch(record.file);if(!file.ok)throw Error('Packet unavailable.');const raw=await file.text();if(await digest(raw)!==record.sha256)throw Error('Packet bytes do not match the recorded gate evidence.');
  const parsed=parseProductionPacket(raw);if(request!==epoch)return;
  byId('inspection-title').textContent=record.title;byId('status').textContent='Inspected '+record.id+' draft locally. No campaign installed.';
  list('missing',fields.filter(([key])=>!parsed.brief[key].trim()).map(([key])=>key));list('findings',planFindings(parsed.storyboard));list('preflight',record.preflightIssues.map(issue=>issue.category+': '+issue.evidence+' '+issue.fix));
  byId('timeline').replaceChildren(...parsed.storyboard.shots.map(shot=>{const div=document.createElement('div');div.className='timeline-shot';const label=document.createElement('b');label.textContent=shot.start+' to '+(shot.start+shot.duration)+'s';const p=document.createElement('p');p.textContent=shot.action;div.append(label,p);return div;}));
  byId('risk').textContent=record.risk;byId('timing').textContent=record.timingAdjustment.reason;byId('normalized').textContent=JSON.stringify(parsed.storyboard,null,2);byId('result').hidden=false;
 }catch(error){if(request!==epoch)return;byId('status').textContent='Inspection stopped: '+error.message;}
});
