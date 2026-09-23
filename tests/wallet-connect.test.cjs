const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const {createConnector,INTEGRITY,BUNDLE}=require('../aisports/wallet-connect.js');
function windowFake(ethereum){return {ethereum,location:{origin:'https://official.example',href:'https://official.example/?tgWebAppData=NEVER_FORWARD#initData=SECRET'},Event:class{constructor(type){this.type=type;}},addEventListener(){},dispatchEvent(){}};}
test('injected MetaMask uses the real selected provider without SDK load',async()=>{
 const provider={isMetaMask:true,request:async()=>[]};let loads=0;
 const c=createConnector({window:windowFake(provider),polygonRPC:'https://polygon.example',loadSDK:async()=>{loads++;}});
 assert.equal(await c.connect(),provider);assert.equal(loads,0);
});
test('desktop without extension connects same-page SDK mobile transport with origin-only metadata',async()=>{
 const calls=[],provider={request:async()=>[]};
 const client={connect:async options=>calls.push(options),getProvider:()=>provider};
 const c=createConnector({window:windowFake(),polygonRPC:'https://polygon.example',loadSDK:async()=>({createEVMClient:async options=>{calls.push(options);return client;}})});
 const [a,b]=await Promise.all([c.connect(),c.connect()]);assert.equal(a,provider);assert.equal(b,provider);
 assert.deepEqual(calls,[{dapp:{name:'AI Sports',url:'https://official.example'},api:{supportedNetworks:{'0x89':'https://polygon.example'}},analytics:{enabled:false},debug:false,skipAutoAnnounce:true,ui:{headless:false,preferExtension:false},mobile:{useDeeplink:false}},{chainIds:['0x89']}]);
 assert.doesNotMatch(JSON.stringify(calls),/SECRET|initData|tgWebAppData/);
});
test('a rejected SDK connection can retry without replacing provider with fictitious success',async()=>{
 let attempt=0;const provider={request:async()=>[]};
 const c=createConnector({window:windowFake(),polygonRPC:'https://polygon.example',loadSDK:async()=>({createEVMClient:async()=>({connect:async()=>{if(++attempt===1)throw Object.assign(Error('cancelled'),{code:4001});},getProvider:()=>provider})})});
 await assert.rejects(c.connect());assert.equal(await c.connect(),provider);assert.equal(attempt,2);
});
test('shipped official SDK bundle matches locked source integrity, manifest and browser SRI',()=>{
 const root=path.resolve(__dirname,'../aisports'),manifest=JSON.parse(fs.readFileSync(path.join(root,'vendor/metamask-connect-manifest.json'))),bytes=fs.readFileSync(path.join(root,BUNDLE));
 assert.equal(manifest.version,'2.1.1');assert.equal(manifest.package,'@metamask/connect-evm');
 assert.equal(manifest.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
 assert.equal(INTEGRITY,'sha384-'+crypto.createHash('sha384').update(bytes).digest('base64'));assert.equal(manifest.sri,INTEGRITY);
 const lock=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../tools/wallet-sdk/package-lock.json')));
 assert.equal(lock.packages['node_modules/@metamask/connect-evm'].integrity,manifest.npm_integrity);
 assert.ok(!lock.packages['node_modules/@metamask/sdk']);
});
