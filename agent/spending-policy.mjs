import {campaignDemoTrigger} from './campaign-demo.mjs';
import {clientDemoPromptBrands} from './client-demo.mjs';

// Persisted review mode. It has no HTTP unlock route.
export function spendingPaused(store){
 if(!store.db.prepare("select name from sqlite_master where type='table' and name='settings'").get())return false;
 const row=store.db.prepare("select value from settings where key='spendingPaused'").get();
 return row?.value==='true';
}

export function spendingRequestAllowed(method,pathname,body={}){
 // Logo and offer GETs disable their paid fallback in the server's shared resolver.
 if(method==='GET')return true;
 if(method!=='POST')return false;
 if(pathname==='/api/client-demo/tasks'||pathname==='/api/campaign-demo/start')return true;
 if(/^\/api\/tasks\/\d+\/client-review$/.test(pathname))return true;
 if(['/api/chat','/api/assistant'].includes(pathname)&&(clientDemoPromptBrands(body.message).length||campaignDemoTrigger(body.message)))return true;
 if(pathname==='/api/production/call'||pathname==='/api/uploads'||pathname==='/api/profile')return true;
 if(/^\/api\/tasks\/\d+\/storyboard$/.test(pathname)||/^\/api\/leads\/\d+(?:\/storyboard)?$/.test(pathname))return true;
 if(/^\/api\/whop\/orders\/[A-Za-z0-9_-]+\/context$/.test(pathname))return true;
 // Final video and delivery use local ffmpeg, free Supabase Storage and a Gmail draft. No paid provider is called.
 if(/^\/api\/whop\/orders\/[A-Za-z0-9_-]+\/(?:final|deliver)$/.test(pathname))return true;
 if(/^\/api\/tasks\/\d+\/control$/.test(pathname))return ['pause','stop'].includes(body.action);
 if(pathname==='/api/autopilot'||pathname==='/api/whop')return body.enabled===false;
 if(/^\/api\/browser\/[\w.:-]+\/close$/.test(pathname)||/^\/api\/renders\/\d+\/cancel$/.test(pathname))return true;
 if(pathname==='/api/renders'||pathname==='/api/renders/import'||/^\/api\/renders\/\d+\/revise$/.test(pathname))return true;
 return false;
}
