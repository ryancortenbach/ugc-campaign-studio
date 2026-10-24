// The presentation server has no background watchers. User clicks retain their existing permissions.
import '../agent/network-dns.mjs';
import http from 'node:http';
import {createApp} from '../agent/server.mjs';
http.createServer(createApp({panelsWatch:false})).listen(Number(process.env.AGENT_PORT||3200),'127.0.0.1',()=>console.log('Mint HTTP ready. Background watchers are off.'));
