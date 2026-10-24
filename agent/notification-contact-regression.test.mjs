import test from 'node:test';
import assert from 'node:assert/strict';
import {contactSummary} from './public/lead-badges.js';
import {eventNotification} from './public/provider-notifications.js';

test('shared role addresses cannot receive a personal email success badge',()=>{
 for(const address of ['care@brand.example','marketing@brand.example','hello+team@brand.example','hello.uk@brand.example','returns@brand.example']){
  const badge=contactSummary({contact_kind:'personal',contact_email:address});
  assert.equal(badge.label,'Shared inbox',address);assert.notEqual(badge.cls,'s-ok',address);
 }
});
test('explicit failed or pending events never become confirmed sent or received email notices',()=>{
 for(const type of ['sent','email_sent','reply','email_received'])for(const status of ['failed','pending','running','cancelled']){
  assert.equal(eventNotification({id:1,type,tool:'gmail.send',title:'Not completed',data:{status}}),null,`${type}/${status}`);
 }
});
