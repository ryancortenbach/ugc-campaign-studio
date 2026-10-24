export const ROLE_WORDS=new Set(['info','support','cs','cx','returns','exchanges','billing','accounts','payments','hello','hi','hey','hola','contact','contactus','sales','press','team','admin','orders','order','help','care','service','services','customerservice','customercare','customersupport','wholesale','shop','store','marketing','partnerships','partnership','partners','partner','collabs','collab','collaborations','noreply','donotreply','office','general','inquiries','inquiry','enquiries','enquiry','mail','studio','media','pr','creators','creator','influencer','influencers','brand','brands','newsletter','feedback','questions','booking','bookings','events','community','social','content','hq','web','website','ecommerce','accounting','jobs','careers','hr','sale','ambassador','ambassadors']);
const letters=value=>String(value||'').toLowerCase().replace(/[^a-z]/g,'');
export function isRoleMailbox(email,{domain=''}={}){
 const local=String(email||'').trim().toLowerCase().split('@')[0];
 const words=local.split(/[._+\-]+/).map(word=>word.replace(/\d+$/,'')).filter(Boolean);
 if(ROLE_WORDS.has(letters(local))||words.some(word=>ROLE_WORDS.has(word)))return true;
 const brand=letters(String(domain||'').toLowerCase().replace(/^www\./,'').split('.')[0]);
 return Boolean(brand)&&(letters(local)===brand||(words.length>0&&words.every(word=>word===brand)));
}
