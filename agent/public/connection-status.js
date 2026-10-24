export function connectionStatus(row){
 if(!row.on)return ['Needs setup','s-you','triangle-alert'];
 if(row.verification==='configured')return ['Configured','s-idle','plug'];
 if(row.verification==='reachable')return ['Reachable','s-idle','globe'];
 if(row.verification==='network_error')return ['Network','s-you','wifi-off'];
 if(row.ok===false)return ['Error','s-bad','circle-x'];
 if(row.verification==='verified')return ['Connected','s-ok','circle-check'];
 return ['Not checked','s-idle','clock'];
}
