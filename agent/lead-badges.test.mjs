import test from 'node:test';
import assert from 'node:assert/strict';
import {primaryLeadStatus,contactSummary} from './public/lead-badges.js';
test('one primary status selects the furthest milestone or next blocker without hiding terminal outcomes',()=>{
 const draft={status:'sent',readiness:{ready:false,missing:['clip','email','gmail']}};
 assert.equal(primaryLeadStatus({status:'contacted',simulatedJourney:true},{draft}).label,'Whop checkout successful');
 assert.equal(contactSummary({simulatedJourney:true}).label,'Mutual connection');
 assert.equal(contactSummary({simulatedJourney:true}).cls,'s-mutual');
 assert.equal(primaryLeadStatus({status:'replied'},{draft}).label,'Email received');
 assert.equal(primaryLeadStatus({status:'contacted'},{draft}).label,'Outreach sent');
 assert.equal(primaryLeadStatus({status:'drafted'},{draft:{...draft,status:'gmail_draft'}}).label,'Needs email');
 assert.equal(primaryLeadStatus({status:'drafted'},{draft:{readiness:{ready:false,missing:['clip','instagram']}}}).label,'Connect Instagram');
 assert.equal(primaryLeadStatus({status:'rejected'},{draft,dmReady:true,fallback:['Not a fit','s-idle']}).label,'Not a fit');
 assert.equal(primaryLeadStatus({status:'replied',contact_kind:'instagram'}).provider,'instagram');
});
test('contact discovery distinguishes a person, a shared inbox and missing or unfinished research',()=>{
 assert.deepEqual(contactSummary({contact_kind:'personal',contact_email:'ryan@brand.example'}),{label:'Email found',cls:'s-ok',icon:'check',detail:'ryan@brand.example'});
 assert.equal(contactSummary({contact_kind:'role',contact_email:'support@brand.example'}).label,'Shared inbox');
 assert.equal(contactSummary({contact_kind:'personal',contact_email:'info@brand.example'}).label,'Shared inbox');
 assert.equal(contactSummary({contact_kind:'none',status:'drafted'}).label,'No public email');
 assert.equal(contactSummary({contact_kind:'personal',contact_email:''}).cls,'s-bad');
 assert.equal(contactSummary({status:'found'}).label,'Not checked');
 assert.equal(contactSummary({contact_email:'person@brand.example'}).label,'Email needs review');
});
