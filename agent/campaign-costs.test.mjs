import test from 'node:test';import assert from 'node:assert/strict';import {campaignCosts} from './public/campaign-costs.js';
test('presentation costs start at zero and advance without inventing a Terac charge or voice dollar price',()=>{
 const steps=['task','research','solari-research','icp','character','voice','sample','terac-sync','outreach','full-render'].map(id=>({id}));
 const initial=campaignCosts(steps,-1),full=campaignCosts(steps,9,{voiceCharacters:63232});assert.equal(initial.higgsfield.spent,0);assert.equal(full.higgsfield.spent,7.2);assert.equal(full.claude.spent,3.22);assert.equal(full.terac.spent,0);assert.equal(full.elevenlabs.spent,null);assert.match(full.elevenlabs.usage,/63,232/);
 for(let i=0;i<steps.length-1;i++){const a=campaignCosts(steps,i),b=campaignCosts(steps,i+1);for(const k of Object.keys(a))assert.ok((b[k].spent||0)>=(a[k].spent||0));}
});
