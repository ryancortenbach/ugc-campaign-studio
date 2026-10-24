// Record the user's PS2 style requirement without submitting generation or changing approval.
import{readFileSync,writeFileSync}from'node:fs';
import{openStore}from'../agent/store.mjs';
import{campaignVisualStyle}from'../agent/campaign-demo.mjs';
const file=new URL('../agent/public/client-demo-data-v2.json',import.meta.url),packet=JSON.parse(readFileSync(file)),store=openStore();
try{
 for(const brand of packet.brands.filter(b=>['disobedient','vylin'].includes(b.id))){
  brand.visualStyle={...campaignVisualStyle};
  if(brand.id==='disobedient'){
   brand.persona.wardrobe='The same heather grey pullover and blue/red printed chest artwork throughout the PS2 cutscene. User-directed printed-front creative variation.';
   brand.storyboardImageKind='generated_video_frame';
   brand.storyboardCaption='Corrected PS2 game-character garment reference from the existing generated video. Preserve the fictional low-poly avatar, printed hoodie and game world throughout.';
  }
  const task=store.getTask(brand.taskId);if(!task)continue;
  store.updateTask(task.id,{plan:{...task.plan,creativeBrief:{...task.plan.creativeBrief,visualStyle:campaignVisualStyle,character:{...task.plan.creativeBrief?.character,appearance:brand.persona.description,wardrobe:brand.persona.wardrobe,style:campaignVisualStyle.label}},clientDemo:{...task.plan.clientDemo,packet:brand}}});
 }
 writeFileSync(file,JSON.stringify(packet,null,2)+'\n');
 console.log(JSON.stringify({style:campaignVisualStyle.label,brands:['disobedient','vylin'],newProviderCalls:0,approvalChanged:false}));
}finally{store.db.close();}
