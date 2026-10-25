export const fields = [
  ['brand', 'What is the brand and what does it sell? Include its website if you have one.'],
  ['audience', 'Who should this campaign reach? Describe their situation, frustrations, and desired outcome.'],
  ['offer', 'What exact offer and call to action should the ad use? Include the price or destination if known.'],
  ['objective', 'What should success look like? Tell me the platform, campaign goal, number of videos, and target length.'],
  ['avatar', 'Describe your creator avatar: appearance, age range, personality, wardrobe, setting, and details that must stay consistent.'],
  ['voice', 'How should the avatar sound? Include accent, tone, pacing, delivery, and any voice reference you own or can use.'],
  ['creative', 'What is the creative direction? Share the hook, story, product demonstration, visual style, and reference links.'],
  ['constraints', 'What are the limits? Budget, deadline, approved product claims, forbidden claims, likeness permissions, and anything to avoid.']
];
export const emptyBrief = () => Object.fromEntries(fields.map(([key]) => [key, '']));
export function normalizeBrief(input) {
  return Object.fromEntries(fields.map(([key]) => [key, typeof input?.[key] === 'string' ? input[key].slice(0, 6000) : '']));
}
export function nextField(brief) { return fields.find(([key]) => !brief[key]?.trim()); }
export function guidedTurn(input) {
  const brief = normalizeBrief(input.brief);
  const field = nextField(brief);
  if (field && input.message?.trim()) brief[field[0]] = input.message.trim().slice(0,6000);
  const next = nextField(brief);
  return {brief, reply: next ? next[1] : 'Your intake is complete. Review the brief and export the production packet. Claims, scripts, and generation spend still need your approval.', mode:'guided', complete:!next};
}
export function productionPacket(brief) {
  const b=normalizeBrief(brief);
  return {
    schemaVersion:'0.1.0', status: nextField(b) ? 'intake_incomplete' : 'ready_for_creative_review',
    brief:b,
    missing:fields.filter(([key])=>!b[key].trim()).map(([key])=>key),
    avatarBible:{identity:b.avatar,voice:b.voice,consistency:['Use the same approved face reference across shots.','Lock wardrobe, proportions, hair, and distinguishing features.','Keep the voice ID and reference performance stable.'],references:[],approval:'pending'},
    campaign:{brand:b.brand,audience:b.audience,offer:b.offer,objective:b.objective,creativeDirection:b.creative,constraints:b.constraints},
    production:{workflow:['Review brand facts and approved claims','Approve avatar reference and voice','Write and approve script variants','Build per-shot prompts and reference tags','Estimate cost and approve generation','Generate, review, and version clips','Assemble, caption, and mix','Approve final deliverables'],
      shotTemplate:{id:'shot-01',durationSeconds:null,camera:'',action:'',dialogue:'',referenceTags:[],audio:'',negativeConstraints:[],status:'needs_storyboard'},
      generation:{provider:'Higgsfield',model:null,aspectRatio:'9:16',resolution:null,durationSeconds:null,audio:null,budgetApproved:false,submitted:false}},
    integrations:{research:'Exa, not connected',humanReview:'Terac, not connected',checkout:'Whop, not connected',generation:'Higgsfield, not connected'},
    approvals:{script:false,likeness:false,claims:false,spend:false,finalDelivery:false}
  };
}
