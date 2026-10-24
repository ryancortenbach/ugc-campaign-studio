import {defineNitroConfig} from 'nitro/config';
import {fileURLToPath} from 'node:url';
export default defineNitroConfig({buildDir:fileURLToPath(new URL('./.nitro-build',import.meta.url)),modules:['workflow/nitro'],vercel:{entryFormat:'node'},publicAssets:[{dir:'../../public',baseURL:'/'}],routes:{'/**':{handler:'./src/index.ts',format:'node'}}});
