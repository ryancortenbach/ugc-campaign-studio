import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

// No network and no credits: fetch, Claude and Higgsfield are all stubs, and the data folder is a temp dir.
const tmp=mkdtempSync(path.join(tmpdir(),'research-'));
process.env.AGENT_DATA_DIR=tmp;delete process.env.EXA_API_KEY;
const {openStore}=await import('./store.mjs');
const products=await import('./tools/products.mjs');
const research=await import('./research.mjs');
const ugc=await import('./ugc.mjs');
const hf=await import('./tools/higgsfield.mjs');
const {createRunner}=await import('./runner.mjs');

const DASH=new RegExp(String.fromCharCode(0x2014));
const PNG=Buffer.from('89504e470d0a1a0a','hex');
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const img=(type='image/png',bytes=PNG)=>new Response(bytes,{status:200,headers:{'content-type':type}});
const shopify={products:[
 {title:'Heavy Tee',handle:'heavy-tee',product_type:'T-Shirts',tags:['summer'],images:[{src:'https://cdn.shopify.com/s/files/tee.jpg'}],variants:[{price:'38.00'}]},
 {title:'Wide Jeans',handle:'wide-jeans',product_type:'',tags:'denim, bottoms',images:[{src:'https://cdn.shopify.com/s/files/jeans.jpg'}],variants:[{price:'98.00'}]},
 {title:'Coach Jacket',handle:'coach',product_type:'Outerwear',tags:[],images:[{src:'https://cdn.shopify.com/s/files/jacket.jpg'}],variants:[{price:'120.00'}]},
 {title:'Gift Card',handle:'gift',product_type:'Gift Cards',tags:[],images:[{src:'https://cdn.shopify.com/s/files/gc.jpg'}],variants:[{price:'50.00'}]},
 {title:'Mystery Item',handle:'mystery',product_type:'',tags:[],images:[{src:'https://cdn.shopify.com/s/files/m.jpg'}],variants:[{price:'10.00'}]},
 {title:'No Photo Tee',handle:'nophoto',product_type:'Tee',tags:[],images:[],variants:[{price:'10.00'}]}
]};
function shopFetch({noProducts=false}={}){
 const calls=[];
 const impl=async url=>{
  const u=new URL(url);calls.push(u.pathname+u.search);
  if(u.pathname==='/meta.json')return json({currency:'USD'});
  if(u.pathname==='/products.json')return noProducts?new Response('nope',{status:404}):json(shopify);
  if(u.hostname==='cdn.shopify.com')return img();
  return new Response('missing',{status:404});
 };
 impl.calls=calls;return impl;
}

test('Shopify JSON parses into products with real prices, currency, sized images and rule-based kinds',()=>{
 const rows=products.parseShopify(shopify,'https://brand.com','USD');
 assert.equal(rows.length,6);
 assert.equal(rows[0].url,'https://brand.com/products/heavy-tee');
 assert.equal(rows[0].price,'38.00');assert.equal(rows[0].currency,'USD');
 assert.match(rows[0].imageUrl,/^https:\/\/cdn\.shopify\.com\/s\/files\/tee\.jpg\?width=1000$/);
 assert.deepEqual(rows[1].tags,['denim','bottoms']);
 const kind=r=>products.classifyKind(r);
 assert.equal(kind(rows[0]),'top');assert.equal(kind(rows[1]),'bottom');assert.equal(kind(rows[2]),'outerwear');assert.equal(kind(rows[3]),'other');assert.equal(kind(rows[4]),null);
 assert.equal(kind({title:'Shirt Jacket'}),'outerwear');
 assert.equal(kind({title:'Trucker Cap'}),'headwear');
 assert.equal(kind({title:'Court Sneaker'}),'footwear');
 assert.equal(kind({title:'Canvas Tote Bag'}),'accessory');
 assert.equal(kind({title:'Pleated Trousers'}),'bottom');
 assert.equal(kind({title:'Garment Dyed Hoodie'}),'top');
 assert.equal(kind({title:'Item 4',productType:'Hats'}),'headwear');
 assert.equal(kind({title:'Item 5',tags:['cargo pants']}),'bottom');
});

test('scrapeProducts reads Shopify first, uses rules before Haiku, drops gift cards and photo-less items, and caches images',async()=>{
 const fetchImpl=shopFetch();
 const asked=[];
 const llm=async({prompt})=>{asked.push(JSON.parse(prompt));return {data:{kinds:asked[0].map(i=>({index:i.index,kind:'accessory'}))},cost:0.0002};};
 const dir=path.join(tmp,'products-a');
 const out=await products.scrapeProductsDetailed({domain:'brand.com',url:'https://brand.com/',leadId:7,dir,fetchImpl,llm,enabled:()=>true});
 assert.equal(out.source,'shopify /products.json');
 assert.deepEqual(fetchImpl.calls.filter(c=>c.startsWith('/products')),['/products.json?limit=50']);
 assert.deepEqual(out.products.map(p=>p.title).sort(),['Coach Jacket','Heavy Tee','Mystery Item','Wide Jeans']);
 assert.equal(asked.length,1,'Haiku is called once, for the one title the rules could not place');
 assert.deepEqual(asked[0].map(i=>i.title),['Mystery Item']);
 assert.equal(out.products.find(p=>p.title==='Mystery Item').kind,'accessory');
 assert.equal(out.cost,0.0002);
 assert.ok(out.products.every(p=>KINDS_OK.includes(p.kind)&&p.image&&p.currency==='USD'));
 assert.deepEqual(readdirSync(path.join(dir,'7')).sort(),out.products.map(p=>p.image).sort());
 assert.ok(out.products.length<=24);
 const noKey=await products.scrapeProductsDetailed({domain:'brand.com',leadId:8,dir,fetchImpl,llm:async()=>{throw Error('must not be called');},enabled:()=>false});
 assert.equal(noKey.products.find(p=>p.title==='Mystery Item').kind,'other');
});
const KINDS_OK=products.KINDS;

test('scrapeProducts falls back to collections/all, then Squarespace JSON, then the homepage og:image',async()=>{
 const seen=[];
 const viaCollections=async url=>{const u=new URL(url);seen.push(u.pathname);
  if(u.pathname==='/collections/all/products.json')return json(shopify);
  if(u.hostname==='cdn.shopify.com')return img();
  return new Response('x',{status:404});};
 const a=await products.scrapeProductsDetailed({domain:'brand.com',fetchImpl:viaCollections,fetchHome:async()=>({links:[]}),enabled:()=>false});
 assert.equal(a.source,'shopify /collections/all');assert.ok(seen.indexOf('/products.json')<seen.indexOf('/collections/all/products.json'));
 const squarespace={items:[{title:'The Field Jacket',fullUrl:'/shop/p/field-jacket',assetUrl:'https://images.squarespace-cdn.com/content/v1/x/jacket.png',tags:['jacket'],structuredContent:{variants:[{priceMoney:{currency:'USD',value:'349.00'}}],priceMoney:{currency:'USD',value:'0.00'}}},{title:'Gift Card',fullUrl:'/shop/p/gc',assetUrl:'https://images.squarespace-cdn.com/content/v1/x/gc.png',structuredContent:{variants:[]}}]};
 const viaSquare=async url=>{const u=new URL(url);
  if(u.pathname==='/shop'&&u.searchParams.get('format')==='json')return json(squarespace);
  return new Response('x',{status:404});};
 const b=await products.scrapeProductsDetailed({domain:'brand.com',fetchImpl:viaSquare,fetchHome:async()=>({links:[{href:'https://brand.com/shop',text:'Shop'}]}),enabled:()=>false});
 assert.equal(b.source,'squarespace ?format=json');assert.equal(b.products.length,1);
 assert.deepEqual([b.products[0].title,b.products[0].kind,b.products[0].price,b.products[0].currency],['The Field Jacket','outerwear','349.00','USD']);
 assert.match(b.products[0].imageUrl,/format=1000w$/);
 const html='<html><head><meta property="og:image" content="https://brand.com/hero.jpg"><meta property="og:title" content="Brand Home"></head></html>';
 const viaHome=async url=>new URL(url).pathname==='/'?new Response(html,{status:200,headers:{'content-type':'text/html'}}):new Response('x',{status:404});
 const c=await products.scrapeProductsDetailed({domain:'brand.com',fetchImpl:viaHome,fetchHome:async()=>({links:[]}),enabled:()=>false});
 assert.equal(c.source,'homepage og:image');assert.equal(c.products[0].imageUrl,'https://brand.com/hero.jpg');
 const none=await products.scrapeProductsDetailed({domain:'brand.com',fetchImpl:async()=>new Response('x',{status:404}),fetchHome:async()=>({links:[]}),enabled:()=>false});
 assert.deepEqual(none.products,[]);
 await assert.rejects(()=>products.scrapeProductsDetailed({domain:'localhost',fetchImpl:async()=>json({})}),/Blocked|valid domain/);
 await assert.rejects(()=>products.scrapeProductsDetailed({domain:'192.168.0.5',fetchImpl:async()=>json({})}),/Blocked/);
});

test('the image guard rejects private hosts, non-images, odd types, empty and oversized files, and unsafe redirects',async()=>{
 const never=async()=>{throw Error('fetch must not be reached');};
 for(const bad of ['http://127.0.0.1/a.png','https://localhost/a.png','http://10.0.0.5/a.png','http://192.168.1.2/a.png','http://169.254.169.254/latest','http://[::1]/a.png','ftp://example.com/a.png','file:///etc/passwd','https://user:pw@example.com/a.png','not a url'])
  await assert.rejects(()=>products.fetchProductImage(bad,{fetchImpl:never}),/Blocked/,bad);
 await assert.rejects(()=>products.fetchProductImage('https://example.com/a',{fetchImpl:async()=>new Response('<html>',{headers:{'content-type':'text/html'}})}),/Not an image/);
 await assert.rejects(()=>products.fetchProductImage('https://example.com/a.svg',{fetchImpl:async()=>img('image/svg+xml',Buffer.from('<svg/>'))}),/Unsupported/);
 await assert.rejects(()=>products.fetchProductImage('https://example.com/a.png',{fetchImpl:async()=>img('image/png',Buffer.alloc(0))}),/Empty/);
 await assert.rejects(()=>products.fetchProductImage('https://example.com/a.png',{fetchImpl:async()=>img('image/png',Buffer.alloc(products.MAX_IMAGE_BYTES+1))}),/Too large/);
 await assert.rejects(()=>products.fetchProductImage('https://example.com/a.png',{fetchImpl:async()=>new Response('',{status:302,headers:{location:'http://127.0.0.1/secret.png'}})}),/Blocked redirect/);
 await assert.rejects(()=>products.fetchProductImage('https://example.com/a.png',{fetchImpl:async()=>new Response('no',{status:404})}),/HTTP 404/);
 const ok=await products.fetchProductImage('https://example.com/a.png',{fetchImpl:async()=>img('image/webp',PNG)});
 assert.equal(ok.ext,'webp');assert.equal(ok.data.length,PNG.length);
 const hop=await products.fetchProductImage('https://example.com/a.png',{fetchImpl:async u=>String(u).includes('moved')?img():new Response('',{status:301,headers:{location:'https://cdn.example.com/moved.png'}})});
 assert.equal(hop.ext,'png');
});

const catalog=[
 {title:'Heavy Tee',kind:'top',imageUrl:'https://cdn.shopify.com/tee.jpg?width=1000',price:'38.00'},
 {title:'Gift Card',kind:'other',imageUrl:'https://cdn.shopify.com/gc.jpg',price:'50.00'},
 {title:'Tote Bag',kind:'accessory',imageUrl:'https://cdn.shopify.com/bag.jpg',price:'20.00'},
 {title:'Wide Jeans',kind:'bottom',imageUrl:'https://cdn.shopify.com/jeans.jpg',price:'98.00'}
];
const fakeLlm=data=>async()=>({data,cost:0.012,model:'claude-sonnet-5-5'});

test('profileBrand returns chips, snaps signature to real titles, and clamps the hero index into the product list',async()=>{
 const sent=[];
 const ok=await research.profileBrand({company:'Brand',homeText:'Heavy cotton tees for NYC skaters',products:catalog,evidence:'skate brand',llm:async a=>{sent.push(a);return fakeLlm({audience:['18-24','NYC skate kids','Skaters, 18-24','x'.repeat(80),'a','b','c'],style:['Boxy','Heavy cotton','Vintage wash'],signature:['heavy tee','Not A Product','Wide Jeans'],hero:{productIndex:3,why:'Signature denim, clean flat photo'}})();}});
 assert.equal(ok.audience.length,5);assert.ok(ok.audience.every(c=>c.length<=48));
 assert.deepEqual(ok.signature,['Heavy Tee','Wide Jeans']);
 assert.deepEqual(ok.hero,{productIndex:3,why:'Signature denim, clean flat photo'});
 assert.equal(ok.cost,0.012);assert.equal(sent[0].role,'main');assert.equal(sent[0].effort,'medium');
 assert.deepEqual(JSON.parse(sent[0].prompt).products.map(p=>p.productIndex),[0,1,2,3]);
 assert.doesNotMatch(sent[0].system,DASH);
 const high=await research.profileBrand({company:'B',products:catalog,llm:fakeLlm({audience:[],style:[],signature:[],hero:{productIndex:99,why:'x'}})});
 assert.equal(high.hero.productIndex,3,'out of range is clamped to the last product (which is apparel with a photo)');
 const low=await research.profileBrand({company:'B',products:catalog,llm:fakeLlm({audience:[],style:[],signature:[],hero:{productIndex:-4,why:'x'}})});
 assert.equal(low.hero.productIndex,0);
 const gift=await research.profileBrand({company:'B',products:catalog,llm:fakeLlm({audience:[],style:[],signature:[],hero:{productIndex:1,why:'x'}})});
 assert.equal(gift.hero.productIndex,0,'a gift card hero is swapped for the first apparel product with a photo');
 const bag=await research.profileBrand({company:'B',products:catalog,llm:fakeLlm({audience:[],style:[],signature:[],hero:{productIndex:2,why:'x'}})});
 assert.equal(bag.hero.productIndex,0);
 const none=await research.profileBrand({company:'B',products:[],llm:fakeLlm({audience:['a'],style:[],signature:[],hero:{productIndex:5,why:'x'}})});
 assert.equal(none.hero,null);
});

const addLead=(store,over={})=>{const task=store.createTask('t');return store.createLead({taskId:task.id,domain:over.domain||'brand.com',company:'Brand',url:'https://brand.com/',market:'m',territory:'t',status:'drafted',evidence:'skate brand',...over});};

test('researchLead scrapes, profiles, saves both on the lead, logs shopify.products and claude.profile, and records costs',async()=>{
 const store=openStore(':memory:');const lead=addLead(store);
 assert.equal(lead.products,null);assert.equal(lead.brand_profile,null);
 const spent=[],events=[];
 const out=await research.researchLead({store,lead,homeText:'tees',spend:(usd,provider,note)=>spent.push([usd,provider,note]),log:(type,title,extra={})=>events.push({type,title,...extra}),deps:{
  scrape:async a=>{assert.equal(a.leadId,lead.id);assert.equal(a.domain,'brand.com');return {products:catalog.slice(0,1),source:'shopify /products.json',cost:0.0003};},
  profile:async a=>({audience:['18-24'],style:['Boxy'],signature:['Heavy Tee'],hero:{productIndex:0,why:'x'},cost:0.011,model:'claude-sonnet-5-5'})}});
 assert.equal(out.products.length,1);
 const saved=store.getLead(lead.id);
 assert.equal(saved.products[0].title,'Heavy Tee');
 assert.deepEqual(saved.brand_profile,{audience:['18-24'],style:['Boxy'],signature:['Heavy Tee'],hero:{productIndex:0,why:'x'}});
 assert.deepEqual(spent.map(s=>s[1]),['claude','claude']);assert.equal(Math.round(spent.reduce((s,x)=>s+x[0],0)*10000),113);
 assert.ok(events.some(e=>e.tool==='shopify.products')&&events.some(e=>String(e.tool).startsWith('claude.profile')));
 assert.equal(research.isResearching(lead.id),false);
 const failing=await research.researchLead({store,lead:store.getLead(lead.id),homeText:'x',log:(t,title,e)=>events.push({t,title,...e}),deps:{scrape:async()=>{throw Error('boom');},profile:async()=>{throw Error('no key');}}});
 assert.deepEqual(failing.products,[]);assert.equal(store.getLead(lead.id).products.length,0);
});

test('research routes: POST starts a job (409 while one runs) and GET serves the cached picture only for real products',async()=>{
 const store=openStore(':memory:');const lead=addLead(store);
 class Raw{constructor(type,data,headers){this.type=type;this.data=data;this.headers=headers;}}
 let release;const gate=new Promise(r=>{release=r;});
 const jobs=[];
 const dir=path.join(tmp,'products-route');mkdirSync(path.join(dir,String(lead.id)),{recursive:true});
 const routes=research.researchRoutes({store,Raw,dir,start:p=>jobs.push(p),deps:{scrape:async()=>{await gate;return {products:[{...catalog[0],image:'0.png'}],source:'shopify /products.json',cost:0};},profile:async()=>({audience:['a'],style:['b'],signature:[],hero:{productIndex:0,why:'x'},cost:0.01}),fetchHome:async()=>({text:'home'})}});
 const find=(method,url)=>{for(const [m,re,fn] of routes){const hit=url.match(re);if(m===method&&hit)return ()=>fn(hit,{},new URL(url,'http://x'));}throw Error('no route');};
 const first=find('POST',`/api/leads/${lead.id}/research`)();
 assert.equal(first.started,true);
 assert.throws(find('POST',`/api/leads/${lead.id}/research`),e=>e.status===409);
 assert.throws(find('POST','/api/leads/999/research'),e=>e.status===404);
 release();await Promise.all(jobs);
 const done=store.getLead(lead.id);assert.equal(done.products.length,1);assert.equal(done.brand_profile.hero.productIndex,0);
 assert.doesNotThrow(find('POST',`/api/leads/${lead.id}/research`),'a finished job can be started again');
 await Promise.all(jobs);
 assert.throws(find('GET',`/api/leads/${lead.id}/products/0/image`),e=>e.status===404,'no cached file yet');
 require_write(path.join(dir,String(lead.id),'0.png'));
 const served=find('GET',`/api/leads/${lead.id}/products/0/image`)();
 assert.ok(served instanceof Raw);assert.equal(served.type,'image/png');assert.deepEqual(served.data,PNG);
 assert.match(served.headers['Content-Security-Policy'],/sandbox/);
 assert.throws(find('GET',`/api/leads/${lead.id}/products/5/image`),e=>e.status===404);
});
import {writeFileSync} from 'node:fs';
const require_write=f=>writeFileSync(f,PNG);

// ---------- product clip: concept, plan, checks and the approve flow ----------

const sonnet=(over={})=>async({schema,system,prompt})=>({data:{identity:'A woman in her 20s with a dark ponytail',wardrobe:'Wearing the Heavy Tee, relaxed fit',environment:'A sunny apartment hallway',voice:'Warm and casual',camera:'Handheld phone, chest height, slight push in',action:'She smooths the tee and smiles to camera',dialogue:'',audio:'Soft room tone',creativeDirection:'Bright natural light, easy pacing',stillPrompt:'A woman in her 20s with a dark ponytail takes a mirror selfie in a sunny hallway wearing the Heavy Tee',...over},cost:0.01,model:'claude-sonnet-5-5',_seen:{schema,system,prompt}});
const ctxFor=(over={})=>({company:'Brand',url:'https://brand.com/',offer:'AI UGC',reasons:['good'],evidence:'skate brand',homeText:'Heavy tees',hero:{index:0,title:'Heavy Tee',kind:'top',imageUrl:'https://cdn.shopify.com/tee.jpg?width=1000',price:'38.00',why:'signature'},profile:{audience:['18-24','NYC skate kids'],style:['Boxy'],signature:['Heavy Tee']},...over});

test('a concept with a hero product builds a two-step plan whose still input carries the product image URL',async()=>{
 let sent;
 const made=await ugc.writeConcept(ctxFor(),async a=>{sent=a;return sonnet()(a);});
 assert.ok(made.plan,'a plan exists');
 assert.equal(made.plan.type,'product_clip');assert.equal(made.plan.step,'still');
 assert.equal(made.plan.still.endpoint,hf.endpoints['reference-still']);
 assert.deepEqual(made.plan.still.input.image_urls,['https://cdn.shopify.com/tee.jpg?width=1000']);
 assert.equal(made.plan.still.input.aspect_ratio,'9:16');
 assert.match(made.plan.still.input.prompt,/Heavy Tee/);assert.match(made.plan.still.input.prompt,/dark ponytail/);
 assert.equal(made.plan.video.endpoint,hf.endpoints['image-to-video']);
 assert.equal(made.plan.video.input.image_url,undefined,'the still does not exist yet, so the video has no image_url until it completes');
 assert.equal(made.plan.video.input.duration,5);assert.equal(made.plan.video.input.resolution,'720p');
 // Framing and camera come from the garment kind in code, never from the writer, so they cannot contradict the product shot.
 assert.match(made.plan.video.input.prompt,/Camera: waist-up selfie at arm length/);assert.match(made.plan.video.input.prompt,/No zoom, no push-in/);assert.doesNotMatch(made.plan.video.input.prompt,/Handheld phone/);
 assert.equal(made.input,made.plan.video.input);
 const brief=JSON.parse(sent.prompt);
 assert.equal(brief.heroProduct.title,'Heavy Tee');assert.deepEqual(brief.audience,['18-24','NYC skate kids']);
 assert.match(sent.system,/stillPrompt/);
 const check=ugc.checkInput(made);
 assert.equal(check.image_url,'https://cdn.shopify.com/tee.jpg?width=1000');assert.match(check.prompt,/Step 1/);assert.match(check.prompt,/Step 2/);
 const plain=await ugc.writeConcept(ctxFor({hero:undefined,profile:undefined}),sonnet());
 assert.equal(plain.plan,undefined);assert.equal(plain.input.image_url,undefined);
 const all=JSON.stringify([made,plain]);assert.doesNotMatch(all,DASH);
});

test('heroFromLead needs a public apparel photo; otherwise the lead keeps text-to-video',()=>{
 const base={products:catalog.map(p=>({...p})),brand_profile:{audience:['a'],style:['b'],signature:[],hero:{productIndex:0,why:'w'}}};
 const h=ugc.heroFromLead(base);assert.equal(h.hero.title,'Heavy Tee');assert.equal(h.hero.index,0);assert.deepEqual(h.profile.audience,['a']);
 assert.equal(ugc.heroFromLead({products:null}),null);assert.equal(ugc.heroFromLead({products:[]}),null);
 assert.equal(ugc.heroFromLead({products:[{title:'Tote',kind:'accessory',imageUrl:'https://cdn.shopify.com/t.jpg'}]}),null);
 assert.equal(ugc.heroFromLead({products:[{title:'Tee',kind:'top',imageUrl:'http://127.0.0.1/t.jpg'}]}),null);
 assert.equal(ugc.heroFromLead({products:[{title:'Tee',kind:'top',imageUrl:null}]}),null);
 assert.equal(ugc.heroFromLead({products:[{title:'Tee',kind:'top',imageUrl:'https://cdn.shopify.com/t.jpg'}]}).hero.index,0,'products without a profile still pick the first apparel photo');
});

const good={passed:true,results:[{id:'a',name:'A',score:95,summary:'ok',issues:[],cost:0.001}],cost:0.003};
function videoFor(over={}){
 const calls={estimate:[],check:[]};
 return {calls,enabled:()=>({ok:true}),endpoint:hf.endpoints['text-to-video'],priceFrom:hf.priceFrom,
  concept:ctx=>ugc.writeConcept(ctx,sonnet()),revise:(ctx,f,c)=>ugc.reviseConcept(ctx,f,c,sonnet()),
  check:async a=>{calls.check.push(a);return good;},
  estimate:async(endpoint,input)=>{calls.estimate.push([endpoint,input]);return endpoint===hf.endpoints['reference-still']?{type:'estimate',usd:'0.070'}:{pricing_description:'roughly $0.4622 per second of generated video at 720p'};},...over};
}
const researched=(store,over={})=>{const l=addLead(store,over);return store.updateLead(l.id,{products:catalog,brand_profile:{audience:['18-24','NYC skate kids'],style:['Boxy'],signature:['Heavy Tee'],hero:{productIndex:0,why:'signature'}}});};

test('prepareLeadVideo parks a researched lead at checks_passed with the still and the video as one plan and a combined estimate, submitting nothing',async()=>{
 const store=openStore(':memory:');const lead=researched(store);
 const video=videoFor();
 const out=await ugc.prepareLeadVideo({store,lead,ctx:{company:'Brand',url:lead.url,offer:'AI UGC',reasons:[],evidence:'',homeText:''},video});
 const r=out.render;
 assert.equal(r.status,'checks_passed');assert.equal(r.estimate_usd,'2.38','0.07 still + 2.31 video');
 assert.equal(r.endpoint,hf.endpoints['reference-still'],'the row mirrors the current step, which is the still');
 assert.deepEqual(r.input.image_urls,[catalog[0].imageUrl]);
 assert.equal(r.plan.still.estimate_usd,'0.07');assert.equal(r.plan.video.estimate_usd,'2.31');
 assert.equal(r.plan.video.endpoint,hf.endpoints['image-to-video']);assert.equal(r.plan.hero.title,'Heavy Tee');
 assert.equal(r.request_id,null);assert.equal(r.submission_key,null);assert.equal(r.approved_at,null);
 assert.equal(video.calls.check[0].input.image_url,catalog[0].imageUrl,'the checkers see the combined plan');
 assert.ok(video.calls.estimate.some(([e,i])=>e===hf.endpoints['image-to-video']&&i.image_url===catalog[0].imageUrl),'the video is priced with the product photo standing in for the still');
 assert.equal(store.spendSummary().providers.find(p=>p.provider==='higgsfield'),undefined);
 const bare=addLead(store,{domain:'bare.com'});
 const plain=await ugc.prepareLeadVideo({store,lead:bare,ctx:{company:'Bare',url:bare.url,offer:'x',reasons:[],evidence:'',homeText:''},video:videoFor({concept:ctx=>ugc.writeConcept(ctx,sonnet()),endpoint:hf.endpoints['text-to-video'],estimate:async()=>({pricing_description:'roughly $0.4622 per second of generated video at 720p'})})});
 assert.equal(plain.render.plan,null);assert.equal(plain.render.endpoint,hf.endpoints['text-to-video']);assert.equal(plain.render.estimate_usd,'2.31');
});

test('lead videos keep revising beyond five until every checker reaches the pass score',async()=>{
 const store=openStore(':memory:'),lead=researched(store);let checks=0,revisions=0;
 const video=videoFor({check:async()=>({passed:true,results:[{id:'a',name:'A',score:++checks>7?hf.PASS_SCORE:hf.PASS_SCORE-1,summary:'review',issues:[{severity:'minor',evidence:'x',fix:'tighten'}],cost:0}],cost:0}),revise:async(ctx,f,c)=>{revisions++;return ugc.reviseConcept(ctx,f,c,sonnet());}});
 const out=await ugc.prepareLeadVideo({store,lead,ctx:{company:'Brand',url:lead.url,offer:'x',reasons:[],evidence:'',homeText:''},video});
 assert.equal(revisions,7);assert.equal(checks,8);assert.equal(out.render.status,'checks_passed');assert.equal(out.render.request_id,null);assert.ok(video.calls.estimate.length>0);
});

function fakeHiggsfield({stillUrl='https://cdn.higgsfield.ai/still.png'}={}){
 const submits=[],downloads=[];
 return {submits,downloads,
  priceFrom:hf.priceFrom,estimate:async()=>({usd:'0.100'}),
  approveAndSubmit:async(endpoint,input,key)=>{submits.push({endpoint,input,key});return {request_id:`req-${submits.length}`,status:'queued'};},
  download:async(url,dir,name)=>{downloads.push([url,name]);return path.join(dir,name);},stillUrl};
}
async function readyRender(){
 const store=openStore(':memory:');const lead=researched(store);
 const out=await ugc.prepareLeadVideo({store,lead,ctx:{company:'Brand',url:lead.url,offer:'x',reasons:[],evidence:'',homeText:''},video:videoFor()});
 return {store,lead,render:out.render};
}

test('approve submits the still first with an Idempotency-Key, and the video only after the still completes, using the still result as image_url',async()=>{
 const {store,lead,render}=await readyRender();
 const higgsfield=fakeHiggsfield();let n=0;
 const clips=ugc.createClips({store,higgsfield,renderDir:path.join(tmp,'renders'),newKey:()=>`k${++n}`});
 assert.equal(higgsfield.submits.length,0,'nothing is submitted before the click');
 await assert.rejects(()=>clips.approve(render.id,{estimate:'9.99'}),e=>e.status===409);
 assert.equal(higgsfield.submits.length,0);
 const polled=[];
 const done=await clips.approve(render.id,{estimate:render.estimate_usd},{poll:id=>polled.push(id)});
 assert.equal(higgsfield.submits.length,1,'exactly one submit: the still');
 assert.equal(higgsfield.submits[0].endpoint,hf.endpoints['reference-still']);
 assert.deepEqual(higgsfield.submits[0].input.image_urls,[catalog[0].imageUrl]);
 assert.match(higgsfield.submits[0].key,new RegExp(`^render-${render.id}-k1$`));
 assert.equal(done.render.status,'queued');assert.equal(done.render.request_id,'req-1');assert.deepEqual(polled,[render.id]);
 assert.equal(done.render.plan.still.request_id,'req-1');assert.equal(done.render.plan.step,'still');
 const ledger=()=>store.db.prepare("select usd,note from spend where provider='higgsfield' order by id").all();
 assert.deepEqual(ledger().map(r=>r.usd),[0.07],'only the still step is recorded at the click');
 await assert.rejects(()=>clips.approve(render.id,{estimate:render.estimate_usd}),e=>e.status===409,'a second click cannot submit again');
 // the still is still rendering: the video is not submitted
 assert.deepEqual(await clips.onStatus(render.id,{status:'in_progress'}),{running:true});
 assert.equal(higgsfield.submits.length,1);assert.equal(store.getRender(render.id).status,'in_progress');
 // the still completes: the video goes out with the still's result as its image_url
 const after=await clips.onStatus(render.id,{status:'completed',images:[{url:higgsfield.stillUrl}]});
 assert.deepEqual(after,{running:true});
 assert.equal(higgsfield.submits.length,2);
 assert.equal(higgsfield.submits[1].endpoint,hf.endpoints['image-to-video']);
 assert.equal(higgsfield.submits[1].input.image_url,higgsfield.stillUrl);
 assert.equal(higgsfield.submits[1].input.duration,5);
 assert.match(higgsfield.submits[1].key,new RegExp(`^render-${render.id}-video-k2$`));
 assert.notEqual(higgsfield.submits[1].key,higgsfield.submits[0].key);
 const mid=store.getRender(render.id);
 assert.equal(mid.endpoint,hf.endpoints['image-to-video']);assert.equal(mid.request_id,'req-2');assert.equal(mid.status,'queued');
 assert.equal(mid.plan.step,'video');assert.equal(mid.plan.still.status,'completed');assert.equal(mid.plan.still.result_url,higgsfield.stillUrl);
 assert.equal(mid.plan.video.request_id,'req-2');assert.equal(mid.input.image_url,higgsfield.stillUrl);
 assert.deepEqual(ledger().map(r=>r.usd),[0.07,2.31],'spend recorded per step');
 assert.ok(higgsfield.downloads.some(([u,name])=>u===higgsfield.stillUrl&&name===`render-${render.id}-still.png`));
 // from here the server's normal handling finishes the video
 assert.equal(await clips.onStatus(render.id,{status:'completed',video:{url:'https://cdn.higgsfield.ai/v.mp4'}}),null);
 const events=store.listEvents({leadId:lead.id});
 assert.ok(events.some(e=>/reference photo is rendering first/.test(e.title))&&events.some(e=>/Submitting the 5 second video/.test(e.title)));
});

test('a failed still never submits the video; an uncertain video submit is not retried; text-to-video renders approve exactly as before',async()=>{
 const a=await readyRender();const h1=fakeHiggsfield();
 const c1=ugc.createClips({store:a.store,higgsfield:h1});
 await c1.approve(a.render.id,{estimate:a.render.estimate_usd});
 assert.deepEqual(await c1.onStatus(a.render.id,{status:'nsfw'}),{running:false});
 assert.equal(h1.submits.length,1);assert.equal(a.store.getRender(a.render.id).status,'failed');
 const b=await readyRender();const h2=fakeHiggsfield();const c2=ugc.createClips({store:b.store,higgsfield:h2});
 await c2.approve(b.render.id,{estimate:b.render.estimate_usd});
 h2.approveAndSubmit=async()=>{throw Error('timeout');};
 assert.deepEqual(await c2.onStatus(b.render.id,{status:'completed',images:[{url:h2.stillUrl}]}),{running:false});
 const stuck=b.store.getRender(b.render.id);
 assert.equal(stuck.status,'submission_unknown');assert.equal(stuck.plan.step,'video');assert.ok(stuck.plan.video.submission_key);
 assert.equal(b.store.db.prepare("select count(*) n from spend where provider='higgsfield'").get().n,1,'the failed video submit records no spend');
 // a plain text-to-video render
 const store=openStore(':memory:');const lead=addLead(store,{domain:'plain.com'});
 const video=videoFor({endpoint:hf.endpoints['text-to-video'],estimate:async()=>({pricing_description:'roughly $0.4622 per second of generated video at 720p'}),concept:ctx=>ugc.writeConcept(ctx,sonnet())});
 const out=await ugc.prepareLeadVideo({store,lead,ctx:{company:'Plain',url:lead.url,offer:'x',reasons:[],evidence:'',homeText:''},video});
 const h3=fakeHiggsfield();const c3=ugc.createClips({store,higgsfield:h3});
 await c3.approve(out.render.id,{estimate:out.render.estimate_usd});
 assert.equal(h3.submits.length,1);assert.equal(h3.submits[0].endpoint,hf.endpoints['text-to-video']);
 assert.equal(await c3.onStatus(out.render.id,{status:'completed',video:{url:'x'}}),null,'plain renders are left to the server');
 assert.equal(c3.approveUsd(store.getRender(out.render.id)),'2.31');
});

test('the runner researches every pursued lead before the video concept is written, and nothing reaches Higgsfield without an approve',async()=>{
 const store=openStore(':memory:');
 const order=[];let submitted=0;
 const video=videoFor({concept:async ctx=>{order.push(`concept:${ctx.hero?.title||'none'}`);return ugc.writeConcept(ctx,sonnet());},revise:undefined});
 const researchTool=async({store:s,lead,spend,log,homeText})=>{order.push(`research:${lead.domain}:${homeText}`);spend(0.011,'claude','brand profile');log('tool_result','researched',{tool:'claude.profile'});s.updateLead(lead.id,{products:catalog,brand_profile:{audience:['18-24'],style:['Boxy'],signature:[],hero:{productIndex:0,why:'x'}}});};
 const tools={
  loadProfile:()=>({senderName:'Ryan',company:'Mint Labs',offer:'AI UGC',senderFact:'x',cta:'y',rules:'z'}),brainMode:()=>'fake',exaMode:()=>'rest',siteMode:()=>'fetch',gmailEnabled:()=>false,draftAccount:()=>'x',
  plan:async()=>({data:{reply:'ok',markets:['m'],territories:['t'],maxDrafts:1,qualify:'q',exclusions:[],searchQueries:[{query:'q1',market:'m',territory:'t'}]},cost:0,model:'fake'}),
  search:async()=>({via:'fake',costUsd:0,requestId:'r',results:[{title:'Alpha | Shop',url:'https://alpha.com/x',text:'a brand'}]}),
  visit:async url=>({via:'fake',sessionId:null,screenshot:null,domain:new URL(url).hostname,socials:{instagram:'https://www.instagram.com/alpha/'},pages:[{url,title:'a',chars:1}],homeText:'Heavy tees',contactText:'',emails:[{email:'hello@alpha.com',sourceUrl:url,excerpt:'x'}],best:{email:'hello@alpha.com',sourceUrl:url,excerpt:'x'}}),
  logo:async()=>({ok:true,checked:true,cost:0,logo:{checked:true,isRealLogo:true,matchesBrand:true,quality:90,reason:'fake'}}),
  value:async()=>({data:{valueScore:90,verdict:'keep',reason:'ok'},cost:0,model:'fake'}),
  score:async({lead})=>({data:{company:lead.company,fitScore:80,decision:'pursue',reasons:['good'],risks:[],personalDetail:'d'},cost:0,model:'fake'}),
  draft:async({graded})=>({data:{subject:`Hi ${graded.company}`,body:'Hello\n\nRyan'},cost:0,model:'fake'}),
  createDraft:async()=>{throw Error('no gmail');},steer:async({currentPlan})=>({data:{reply:'ok',action:'continue',plan:currentPlan,skipDomains:[]},cost:0,model:'fake'}),

  research:researchTool,video};
 const real=hf.approveAndSubmit;
 const runner=createRunner(store,tools);await runner.wait(runner.start('go').id);
 assert.equal(submitted,0);
 const l=store.listLeads()[0];
 assert.deepEqual(order.slice(0,2),[`research:alpha.com:Heavy tees`,'concept:Heavy Tee'],'research first, then a concept that already knows the hero product');
 const [r]=store.listRenders({leadId:l.id});
 assert.equal(r.status,'checks_passed');assert.equal(r.request_id,null);assert.ok(r.plan&&r.plan.type==='product_clip');
 assert.equal(store.db.prepare("select count(*) n from spend where provider='higgsfield'").get().n,0);
 assert.equal(typeof real,'function');
});

test('no em dash appears in the new modules',async()=>{
 const {readFileSync}=await import('node:fs');
 for(const f of ['research.mjs','ugc.mjs','tools/products.mjs','tools/higgsfield.mjs','research.test.mjs'])assert.doesNotMatch(readFileSync(new URL(`./${f}`,import.meta.url),'utf8'),DASH,f);
});
