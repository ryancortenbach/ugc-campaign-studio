import Anthropic from '@anthropic-ai/sdk';
import {betaZodOutputFormat} from '@anthropic-ai/sdk/helpers/beta/zod';

// Sonnet 5.5 plans and writes; Haiku 5.5 grades and scores. Ryan chose these over Opus on 2026-10-24.
export const models={main:process.env.AGENT_MODEL||'claude-sonnet-5-5',grader:process.env.AGENT_GRADER_MODEL||'claude-haiku-5-5'};
const pricePerMTok={'claude-sonnet-5-5':[2,10],'claude-haiku-5-5':[0.1,0.5]};
export const llmEnabled=()=>Boolean(process.env.ANTHROPIC_API_KEY);
let client;

export function costOf(model,usage){
 const [input,output]=pricePerMTok[model]||[0,0];
 const uncached=(usage?.input_tokens||0)+(usage?.cache_creation_input_tokens||0)*1.25+(usage?.cache_read_input_tokens||0)*0.1;
 return (uncached*input+(usage?.output_tokens||0)*output)/1e6;
}

export async function structured({role='main',system,prompt,schema,effort='low',maxTokens=8000}){
 if(!llmEnabled())throw Object.assign(Error('ANTHROPIC_API_KEY is not set'),{code:'no_key'});
 client??=new Anthropic();
 const model=role==='grader'?models.grader:models.main;
 const fallback=model.startsWith('claude-sonnet-5-5')?{betas:['server-side-fallback-2026-07-01'],fallbacks:'default'}:{};
 const res=await client.beta.messages.parse({model,max_tokens:maxTokens,system,messages:[{role:'user',content:prompt}],output_config:{effort,format:betaZodOutputFormat(schema)},...fallback});
 if(res.stop_reason==='refusal')throw Object.assign(Error('The model declined this request'),{code:'refusal'});
 if(res.stop_reason==='max_tokens'||!res.parsed_output)throw Object.assign(Error('The model returned no usable structured output'),{code:'no_output'});
 return {data:res.parsed_output,model:res.model,usage:res.usage,cost:costOf(model,res.usage)};
}
