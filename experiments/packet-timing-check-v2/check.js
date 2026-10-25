import {parseProductionPacket as candidate} from './runtime/import-packet.js';
import {parseProductionPacket as baseline} from './runtime/baseline-import-packet.js';
import {makePlan} from './runtime/planner.js';
function fixture(){const plan=makePlan({},5);plan.shots.forEach((shot,i)=>Object.assign(shot,{start:[0,1.2,3.4][i],duration:[1.2,2.2,1.6][i]}));plan.generation={spendApproved:true,submitted:true,estimatedCredits:99};return {brief:{},production:{storyboard:plan,storyboardVersions:[{savedAt:'',reason:'Fixture',plan:structuredClone(plan)}]}};}
const raw=JSON.stringify(fixture()),checks=[];
function check(label,run){try{if(!run())throw Error('Unexpected result');checks.push({label,passed:true});}catch(error){checks.push({label,passed:false,error:error.message});}}
function rejects(parser,packet){try{parser(JSON.stringify(packet));return false;}catch(error){return /contiguous/.test(error.message);}}
check('Baseline reproduces the decimal timing rejection',()=>rejects(baseline,fixture()));
check('Candidate accepts the same authored decimal timeline',()=>candidate(raw).storyboard.shots[2].start===3.4);
check('Current and historical plans retain authored values and reset forged approvals',()=>{const parsed=candidate(raw);return [parsed.storyboard,parsed.versions[0].plan].every(p=>p.shots[1].duration===2.2&&p.shots[2].start===3.4&&p.generation.spendApproved===false&&p.generation.submitted===false&&p.generation.estimatedCredits===null);});
check('Normalized packet round trip remains importable',()=>{const a=candidate(raw),b=candidate(JSON.stringify({brief:a.brief,production:{storyboard:a.storyboard,storyboardVersions:a.versions}}));return JSON.stringify(a.storyboard)===JSON.stringify(b.storyboard);});
for(const [label,offset]of [['gap',1e-10],['overlap',-1e-10]])check('Candidate rejects a real '+label+' of 0.0000000001 seconds',()=>{const packet=fixture();packet.production.storyboard.shots[1].start+=offset;return rejects(candidate,packet);});
check('Candidate rejects string timing values',()=>{const packet=fixture();packet.production.storyboard.shots[1].start='1.2';return rejects(candidate,packet);});
const list=document.getElementById('checks');for(const row of checks){const li=document.createElement('li');li.textContent=(row.passed?'PASS: ':'FAIL: ')+row.label+(row.error?' ('+row.error+')':'');list.append(li);}
document.getElementById('status').textContent=checks.filter(c=>c.passed).length+' of '+checks.length+' checks passed';
