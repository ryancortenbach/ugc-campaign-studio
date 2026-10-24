import {defineNitroConfig} from 'nitro/config';
export default defineNitroConfig({modules:['workflow/nitro'],vercel:{entryFormat:'node'},publicAssets:[{dir:'../../public',baseURL:'/'}],routes:{'/**':{handler:'./src/index.ts',format:'node'}}});
