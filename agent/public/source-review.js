const mounts=new WeakMap();
const asText=v=>typeof v==='string'?v:v==null?'':JSON.stringify(v,null,2);
export async function paintSourceReview({el,api,esc,toast=()=>{},renderId,isCurrent=()=>true,draftNote='',notice=''}={}){
 const mount={renderId};mounts.set(el,mount);
 const live=()=>mounts.get(el)===mount&&el.isConnected&&isCurrent();
 if(!live())return;
 const base=`/api/renders/${encodeURIComponent(renderId)}/source-review`;
 el.innerHTML='<p class="faint" role="status">Loading source comparison...</p>';
 let data;
 try{data=await api(base);if(data?.renderId!==renderId)throw Error('Source comparison did not match this render.');}
 catch(error){if(!live())return;el.innerHTML=`<p role="alert">${esc(error.message)}</p><button class="btn sm" type="button" data-source-reload>Reload comparison</button>`;el.querySelector('button').onclick=()=>{if(live())paintSourceReview({el,api,esc,toast,renderId,isCurrent,draftNote});};return;}
 if(!live())return;
 const s=data.snapshot||{},shot=s.matchingShot||{},plan=s.storyboardPlan||{};
 const valid=data.canReview===true&&s.input&&typeof s.input==='object'&&!Array.isArray(s.input)&&s.storyboardPlan&&typeof s.storyboardPlan==='object'&&!Array.isArray(s.storyboardPlan)&&s.matchingShot&&typeof s.matchingShot==='object'&&!Array.isArray(s.matchingShot)&&Number.isSafeInteger(data.storyboardId)&&data.storyboardId>0&&/^[a-f0-9]{64}$/.test(data.expectedRenderHash||'')&&/^[a-f0-9]{64}$/.test(data.expectedPlanHash||'')&&Number.isSafeInteger(data.expectedReviewId)&&data.expectedReviewId>=0;
 const fields=pairs=>{const rows=pairs.filter(([,value])=>value).map(([key,value])=>`<dt>${esc(key)}</dt><dd>${esc(asText(value))}</dd>`);return rows.length?`<dl class="sr-fields">${rows.join('')}</dl>`:'';};
 const locks=fields([['Character',plan.identity],['Wardrobe',plan.wardrobe],['Environment',plan.environment],['Voice',plan.voice],['Direction',plan.creativeDirection],['Constraints',plan.constraints]]);
 const target=fields([['Camera',shot.camera],['Action',shot.action],['Dialogue',shot.dialogue],['Audio',shot.audio]]);
 const status=data.associated?(data.recordMatchesCurrent?'Operator match recorded for this intent':'Current local source association'):'Source association needs review';
 el.innerHTML=`<div class="sr-head"><div><p class="sr-eyebrow">SOURCE COMPARISON</p><h2 tabindex="-1" data-source-heading>${esc(s.renderTitle||`Render ${renderId}`)}</h2></div><button class="btn sm" type="button" data-source-reload>Reload comparison</button></div>
 <p class="sr-status" role="status">${esc(status)}</p><p class="sr-help">Compare the current intent with the storyboard shot before recording a match. This does not approve video quality, rendering spend or delivery.</p>
 ${notice?`<p class="sr-notice" role="status">${esc(notice)}</p>`:''}
 <div class="sr-columns"><section class="sr-box"><h3>Storyboard target</h3><p class="faint">${esc(s.storyboardTitle||'No saved storyboard')} ${s.shotId?`/ ${esc(s.shotId)}`:''}</p>${target||'<p class="faint">No unique target shot is available.</p>'}${locks?`<details><summary>Character and scene locks</summary>${locks}</details>`:''}</section>
 <section class="sr-box"><h3>Current render intent</h3><pre class="sr-prompt">${esc(asText(s.input?.prompt)||'No prompt recorded.')}</pre><details><summary>All input parameters</summary><pre>${esc(asText({model:s.endpoint,input:s.input}))}</pre></details></section></div>
 ${valid?`<form class="sr-form"><label>Review note<textarea name="sourceNote" rows="3" maxlength="2000" required placeholder="Explain why this revised intent still matches the planned shot.">${esc(draftNote)}</textarea></label><label class="sr-confirm"><input type="checkbox" name="sourceConfirm">I reviewed this exact intent and confirm it matches the storyboard shot.</label><button class="btn go" type="submit" disabled>Record source match</button></form>`:'<p class="sr-block" role="status">A match cannot be recorded without complete saved lineage and one unique storyboard shot. It cannot be inferred from a title or order.</p>'}
 ${data.record?`<details class="sr-record"><summary>Latest saved review note${data.recordMatchesCurrent?'':' (earlier intent)'}</summary><p>${esc(data.record.note)}</p><p class="faint">${esc(data.record.at)}</p></details>`:''}`;
 const form=el.querySelector('form'),reload=el.querySelector('[data-source-reload]');let pending=false;
 const refresh=async(text,note)=>{if(!live())return;await paintSourceReview({el,api,esc,toast,renderId,isCurrent,draftNote:note,notice:text});if(isCurrent()&&el.isConnected&&mounts.get(el)?.renderId===renderId)(el.querySelector('[data-source-heading]')||el.querySelector('[data-source-reload]'))?.focus();};
 reload.onclick=()=>{if(!pending&&live())refresh('Snapshots refreshed. Compare again before confirming.',form?.querySelector('textarea')?.value??draftNote);};
 if(!form)return;
 const note=form.querySelector('textarea'),confirm=form.querySelector('input[type=checkbox]'),submit=form.querySelector('button');
 const enable=()=>{submit.disabled=pending||!confirm.checked||!note.value.trim()||note.value.length>2000;};note.oninput=enable;confirm.onchange=enable;
 form.onsubmit=async event=>{
  event.preventDefault();if(pending||!live()||!confirm.checked||!note.value.trim()||note.value.length>2000)return;
  pending=true;[note,confirm,submit,reload].forEach(n=>n.disabled=true);const savedNote=note.value;
  let message;
  try{await api(base,{storyboardId:data.storyboardId,expectedRenderHash:data.expectedRenderHash,expectedPlanHash:data.expectedPlanHash,expectedReviewId:data.expectedReviewId,confirmMatches:true,note:savedNote});message='Source review recorded. Render checks and spending approval are unchanged.';}
  catch(error){message=`The request could not be confirmed: ${error.message} Review the reloaded state before trying again.`;}
  if(live())await refresh(message,savedNote);
 };
}
