// Public task page for a Mint Labs human panel. The only network calls are Supabase REST rpc (get_panel, submit_panel_response)
// and the final redirect to Terac's completion callback. No analytics, no third-party scripts.
(function(){
 var cfg=window.PANEL_CONFIG||{};
 var CALLBACK='https://terac.com/api/external/callback';
 var QUESTIONS=[
  ['stop_scrolling','Would this video make you stop scrolling?','No, I would scroll past','Yes, definitely'],
  ['real_customer','Does it feel like a real customer filmed it?','Clearly an ad','Totally real'],
  ['check_out','After watching, how likely are you to check out the brand?','Not at all','Very likely'],
  ['clear_product','How clear is it what the product is?','Not clear','Very clear']
 ];
 var params=new URLSearchParams(location.search);
 var token=params.get('t')||'';
 var submissionId=params.get('teracSubmissionId')||params.get('submissionId')||'';
 var participantId=params.get('participantId')||params.get('participant_id')||'';
 var app=document.getElementById('app');

 function el(tag,attrs,kids){
  var n=document.createElement(tag);
  Object.keys(attrs||{}).forEach(function(k){
   if(k==='text')n.textContent=attrs[k];
   else if(k==='class')n.className=attrs[k];
   else n.setAttribute(k,attrs[k]);
  });
  (kids||[]).forEach(function(c){n.appendChild(c);});
  return n;
 }
 function say(msg){app.textContent='';app.appendChild(el('p',{text:msg}));}
 function rpc(fn,body){
  return fetch(cfg.url+'/rest/v1/rpc/'+fn,{method:'POST',headers:{'apikey':cfg.anon,'Authorization':'Bearer '+cfg.anon,'Content-Type':'application/json'},body:JSON.stringify(body)})
   .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error((j&&j.message)||('HTTP '+r.status));return j;});});
 }
 function finish(){
  if(!submissionId){say('Thank you. Your answers were saved.');return;}
  var u=new URL(CALLBACK);
  ['submissionId','teracSubmissionId','taskId'].forEach(function(k){if(params.get(k))u.searchParams.set(k,params.get(k));});
  u.searchParams.set('result','completed');
  say('Thank you. Taking you back...');
  location.href=u.toString();
 }

 if(!cfg.url||!cfg.anon||!token){say('This study link is not valid.');return;}
 if(!/^[A-Za-z0-9_-]{8,64}$/.test(token)){say('This study link is not valid.');return;}

 rpc('get_panel',{p_token:token}).then(function(rows){
  var p=Array.isArray(rows)?rows[0]:null;
  if(!p){say('This study link is not valid.');return;}
  render(p);
 }).catch(function(){say('This page could not load. Please reload it.');});

 function render(p){
  var answers={},watched=false;
  var video=el('video',{controls:'',playsinline:'',preload:'metadata','webkit-playsinline':''});
  video.setAttribute('playsinline','');
  video.src=p.clip_url;
  var note=el('p',{class:'muted',text:'Watch the video to the end, then answer four quick questions.'});
  var kids=[
   el('h1',{text:'Rate a short video for '+p.brand}),
   el('p',{class:'muted',text:'This takes about 3 minutes. There are no right or wrong answers.'}),
   video,note
  ];
  if(p.offer_pdf_url){
   var link=el('a',{href:p.offer_pdf_url,target:'_blank',rel:'noopener',text:'Open the offer (PDF, 2 pages)'});
   kids.push(el('p',{},[link]));
  }
  var form=el('form',{novalidate:''});
  QUESTIONS.forEach(function(q,i){
   var fs=el('fieldset',{class:'q'},[el('legend',{text:(i+1)+') '+q[1]})]);
   var scale=el('div',{class:'scale'});
   for(var n=1;n<=10;n++){
    (function(n){
     var input=el('input',{type:'radio',name:q[0],value:String(n),'aria-label':String(n)});
     input.addEventListener('change',function(){answers[q[0]]=n;update();});
     scale.appendChild(el('label',{},[input,el('span',{text:String(n)})]));
    })(n);
   }
   fs.appendChild(scale);
   fs.appendChild(el('div',{class:'ends'},[el('span',{text:q[2]}),el('span',{text:q[3]})]));
   form.appendChild(fs);
  });
  var fs5=el('fieldset',{class:'q'},[el('legend',{text:'5) What is one thing that would make this video better?'})]);
  var ta=el('textarea',{maxlength:'1000',rows:'3','aria-label':'One thing that would make it better'});
  var count=el('div',{class:'count',text:'0 / 1000'});
  ta.addEventListener('input',function(){count.textContent=ta.value.length+' / 1000';update();});
  fs5.appendChild(ta);fs5.appendChild(count);form.appendChild(fs5);
  var btn=el('button',{type:'submit',text:'Submit',disabled:''});
  var err=el('p',{class:'err',text:'',role:'alert'});
  form.appendChild(btn);form.appendChild(err);
  kids.push(form);
  app.textContent='';kids.forEach(function(k){app.appendChild(k);});

  function ready(){
   if(!watched)return false;
   for(var i=0;i<QUESTIONS.length;i++)if(!answers[QUESTIONS[i][0]])return false;
   return ta.value.trim().length>=1;
  }
  function update(){btn.disabled=!ready();}
  video.addEventListener('timeupdate',function(){
   var need=Math.min(4,(video.duration||5)*0.8);
   if(!watched&&video.currentTime>=need){watched=true;note.textContent='Now answer the questions below.';update();}
  });
  video.addEventListener('ended',function(){if(!watched){watched=true;update();}});
  video.addEventListener('error',function(){note.textContent='The video could not load. Please reload this page.';});
  form.addEventListener('submit',function(e){
   e.preventDefault();
   if(!ready())return;
   btn.disabled=true;err.textContent='';
   var body={stop_scrolling:answers.stop_scrolling,real_customer:answers.real_customer,check_out:answers.check_out,clear_product:answers.clear_product,improve:ta.value.trim().slice(0,1000)};
   rpc('submit_panel_response',{p_token:token,p_submission_id:submissionId||('anon-'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)),p_participant_id:participantId||null,p_answers:body})
    .then(function(r){
     if(r&&(r.ok||r.error==='duplicate')){finish();return;}
     err.textContent='Your answers could not be saved ('+((r&&r.error)||'unknown')+'). Please check them and try again.';btn.disabled=false;
    })
    .catch(function(){err.textContent='Your answers could not be saved. Please try again.';btn.disabled=false;});
  });
 }
})();
