import test from 'node:test';
import assert from 'node:assert/strict';
import {eventNotification,notificationIcon} from './public/provider-notifications.js';
test('confirmed Gmail sends and inbound messages use the Gmail identity and distinct labels',()=>{
 const sent=eventNotification({id:1,type:'draft',tool:'gmail.send',title:'Sent to person@example.com',data:{draftId:3,messageId:'confirmed'}});
 assert.equal(sent.provider,'gmail');assert.equal(sent.title,'Email sent');assert.equal(sent.key,'gmail-sent-draft:3');
 assert.equal(eventNotification({type:'draft',tool:'sentwatch',title:'Sent: person@example.com'}).title,'Email sent');
 assert.equal(eventNotification({type:'email_received',tool:'gmail.inbound',title:'A real inbound event'}).title,'Email received');
 assert.equal(eventNotification({type:'draft',tool:'sentwatch',title:'Draft deleted in Gmail: person@example.com'}).title,'Draft removed');
 assert.match(eventNotification({type:'sent',tool:'gmail.send',data:{mode:'simulated'}}).title,/simulated/);
});
test('starting a tool, reading a message, a failed send or a non-email reply is not a confirmed Gmail notification',()=>{
 for(const event of [{type:'tool_call',tool:'gmail.send',title:'Sent to person@example.com'},{type:'error',tool:'gmail.send'},{type:'tool_result',tool:'gmail.messages.get',data:{status:'success'}},{type:'tool_result',tool:'gmail.send',data:{status:'error'}},{type:'reply',tool:'instagram.reply'}])assert.equal(eventNotification(event),null);
 assert.match(notificationIcon('higgsfield'),/\/logos\/higgsfield.png/);assert.match(notificationIcon('gmail'),/alt="Gmail"/);assert.equal(notificationIcon('../unsafe'), '');
});
