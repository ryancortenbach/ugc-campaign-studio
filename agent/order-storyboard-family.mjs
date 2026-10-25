import {createHash} from 'node:crypto';
export const storyboardPlanHash=plan=>createHash('sha256').update(JSON.stringify(plan??null)).digest('hex');
export function storyboardRoot(store,id,{strict=true}={}){
 let current=id;const seen=new Set();
 const invalid=message=>{if(strict)throw Object.assign(Error(message),{status:409});return null;};
 for(let i=0;i<100;i++){
  if(seen.has(current))return invalid('This storyboard has a cyclic version history.');seen.add(current);
  const board=store.getStoryboard(current);if(!board)return invalid('A referenced storyboard or its version ancestor is missing.');
  if(!board.parent_id)return current;current=board.parent_id;
 }
 return invalid('This storyboard version history is too deep.');
}
