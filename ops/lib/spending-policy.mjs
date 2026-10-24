// Server configuration controls paid work. No HTTP setting can enable this guard.
export function protectPaidTools(tools, {enabled = false} = {}) {
 const wrapped = {...tools, ready: () => ({...tools.ready(), spendingPaused: !enabled})};
 for (const name of ['angles','draftStoryboard','checkStoryboard','reviseStoryboard','runCheckers','submit']) {
  wrapped[name] = async (...args) => {
   if (!enabled) throw Object.assign(Error('Paid fulfillment work is paused. Explicit authorization and server configuration are required.'), {status:423,code:'spending_paused'});
   return tools[name](...args);
  };
 }
 return wrapped;
}
export function requirePaidWork(tools) {
 if (tools.ready().spendingPaused === true) throw Object.assign(Error('Paid fulfillment work is paused.'), {status:423,code:'spending_paused'});
}
