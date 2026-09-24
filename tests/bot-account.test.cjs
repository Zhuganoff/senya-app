const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const api=require('../aisports/bot-account.js');
const {Controller,parseUnits,formatUnits,validateTransfer,stateLabel,PUSD}=api;
const NOW=1800700000000;
const accountId='11111111-1111-4111-8111-111111111111';
const operationId='22222222-2222-4222-8222-222222222222';
const owner='0x'+'1'.repeat(40),funding='0x'+'2'.repeat(40),botOwner='0x'+'3'.repeat(40),bot='0x'+'4'.repeat(40);
function account(){return {account_id:accountId,state:'READY',version:3,verified_user_signer:owner,funding_wallet:funding,bot_owner_address:botOwner,bot_deposit_wallet:bot,chain_id:137,collateral:PUSD,policy:{version:2,enabled:false,max_stake_bps:700,max_open:10,sports:['mlb']},balance:{confirmed_units:'100000000',reserved_units:'20000000',available_units:'80000000',checked_at:new Date(NOW).toISOString()},runtime_ready:true,runtime_expires_at:new Date(NOW+60000).toISOString(),last_checked_at:new Date(NOW).toISOString()};}
const clone=x=>JSON.parse(JSON.stringify(x));
function operation(kind='WITHDRAW'){
 const expiry=new Date(NOW+300000).toISOString();
 const o={operation_id:operationId,kind,state:'AWAITING_SIGNATURE',amount_units:'2500000',fee_units:'0',intent:{account_id:accountId,operation_id:operationId,kind,chain_id:137,token:PUSD,source:kind==='FUNDING'?funding:bot,recipient:kind==='FUNDING'?bot:funding,amount_units:'2500000',verified_user_signer:owner,nonce:operationId,expires_at:expiry}};
 const td={types:{AISportsWithdrawal:[{name:'accountId',type:'string'},{name:'operationId',type:'string'},{name:'token',type:'address'},{name:'amount',type:'uint256'},{name:'recipient',type:'address'},{name:'nonce',type:'string'},{name:'deadline',type:'uint256'}]},primaryType:'AISportsWithdrawal',domain:{name:'AISports',version:'1',chainId:137,verifyingContract:bot},message:{accountId,operationId,token:PUSD,amount:'2500000',recipient:funding,nonce:operationId,deadline:String((NOW+300000)/1000)}};
 if(kind==='FUNDING'){
  td.primaryType='Batch';td.domain={name:'DepositWallet',version:'1',chainId:137,verifyingContract:funding};
  td.types={Call:[{name:'target',type:'address'},{name:'value',type:'uint256'},{name:'data',type:'bytes'}],Batch:[{name:'wallet',type:'address'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'},{name:'calls',type:'Call[]'}]};
  td.message={wallet:funding,calls:[{target:PUSD,value:'0',data:'0xa9059cbb'+bot.slice(2).padStart(64,'0')+BigInt(o.amount_units).toString(16).padStart(64,'0')}],nonce:'123',deadline:String((NOW+300000)/1000)};
 }
 o.challenge={signer:owner,typed_data:td};return o;
}
function setup({mutate,request}={}){
 let auth='telegram-user-A',a=account(),o=operation(); const calls=[],walletCalls=[],renders=[];
 const provider={request:async p=>{walletCalls.push(p);if(request)return request(p);if(['eth_accounts','eth_requestAccounts'].includes(p.method))return [owner];if(p.method==='eth_chainId')return '0x89';if(p.method==='eth_signTypedData_v4')return '0x'+'a'.repeat(130);throw Error('unexpected wallet method');}};
 const rpc=async(name,p)=>{calls.push({name,p}); if(mutate){const r=await mutate(name,p);if(r!==undefined)return r;}if(name==='bot_account_get')return {api_version:1,status:'OK',account:clone(a)};if(name==='bot_account_history')return {api_version:1,status:'OK',operations:[]};if(name==='bot_account_operation')return {api_version:1,status:'OK',operation:clone(o)};return {api_version:1,status:'OK',account:clone(a),operation:{...clone(o),state:'PENDING'}};};
 const c=new Controller({rpc,session:()=>auth,wallet:async()=>provider,resolveWallet:async()=>({status:'ok',proxy:funding,name:'Account'}),eligibility:async()=>true,render:s=>renders.push(clone(s)),now:()=>NOW,uuid:()=>operationId});
 c.reset();return {c,calls,walletCalls,renders,provider,setAuth:x=>auth=x,setOp:x=>o=x,setAccount:x=>a=x};
}
test('decimal amounts retain micro-pUSD precision and reject ambiguous amounts',()=>{
 assert.equal(parseUnits('12345678901234567890.123456'),'12345678901234567890123456');assert.equal(formatUnits('12345678901234567890123456'),'12345678901234567890.123456');
 for(const x of [0,true,'0','-1','NaN','Infinity','1e3','1.0000001',' 1','01','1,2','.2','2.'])assert.throws(()=>parseUnits(x));
});
test('funding and withdrawal validate exact intent, recipient, collateral, amount and expiry',()=>{
 for(const kind of ['FUNDING','WITHDRAW'])assert.doesNotThrow(()=>validateTransfer(operation(kind),account(),NOW));
 for(const change of [o=>o.intent.account_id=operationId,o=>o.intent.amount_units='1',o=>o.intent.recipient=owner,o=>o.intent.chain_id=1,o=>o.challenge.signer=botOwner,o=>o.intent.token=owner,o=>o.intent.nonce='different',o=>o.intent.expires_at=new Date(NOW-1).toISOString()]){const o=operation();change(o);assert.throws(()=>validateTransfer(o,account(),NOW));}
 for(const change of [o=>o.challenge.typed_data.message.calls.push(clone(o.challenge.typed_data.message.calls[0])),o=>o.challenge.typed_data.message.calls[0].data='0x095ea7b3',o=>o.challenge.typed_data.message.calls[0].value='1',o=>o.challenge.typed_data.domain.verifyingContract=bot,o=>o.challenge.typed_data.message.calls[0].target=owner,o=>o.challenge.typed_data.message.deadline='1']){const o=operation('FUNDING');change(o);assert.throws(()=>validateTransfer(o,account(),NOW));}
});
test('new account creation requires custody consent and reuses idempotency key on lost reply',async()=>{
 let attempts=0;const s=setup({mutate:(n)=>{if(n==='bot_account_create'&&++attempts===1)throw Error('timeout');}});
 await s.c.create(false);assert.equal(s.calls.length,0);
 await s.c.create(true);await s.c.create(true);
 const c=s.calls.filter(x=>x.name==='bot_account_create');assert.equal(c.length,2);assert.equal(c[0].p.p_idempotency_key,c[1].p.p_idempotency_key);assert.deepEqual(Object.keys(c[0].p).sort(),['p_idempotency_key','p_init_data']);
});
test('provider-denied account retry uses current initData and one idempotency key',async()=>{
 const s=setup();const a=account();a.state='ERROR';a.reason='PROVIDER_ACCESS_DENIED';a.bot_owner_address=null;a.bot_deposit_wallet=null;s.setAccount(a);
 await s.c.refresh();await s.c.retryProvision();await s.c.retryProvision();
 const calls=s.calls.filter(x=>x.name==='bot_account_retry');assert.equal(calls.length,2);
 assert.equal(calls[0].p.p_init_data,'telegram-user-A');assert.equal(calls[0].p.p_idempotency_key,calls[1].p.p_idempotency_key);
 assert.deepEqual(Object.keys(calls[0].p).sort(),['p_idempotency_key','p_init_data']);
});
test('all private reads and mutations use current initData and no client tenant ID',async()=>{
 const s=setup();await s.c.refresh();await s.c.settings('6.25');await s.c.enable(true);await s.c.stop();
 for(const {name,p} of s.calls){assert.equal(p.p_init_data,'telegram-user-A',name);assert.ok(!('p_tg' in p||'account_id' in p||'key_ref' in p));}
 const changed=s.calls.find(x=>x.name==='bot_account_settings');assert.equal(changed.p.p_settings.max_stake_bps,625);assert.equal(changed.p.p_expected_version,2);assert.deepEqual(Object.keys(changed.p.p_settings).sort(),['max_stake_bps','sports']);
});
test('invalid policy or missing consent cannot enable or create a hidden daily cap',async()=>{
 const s=setup();await s.c.refresh();await s.c.enable(false);for(const p of ['10.01','0','Infinity','-1','1e1','5.123'])await s.c.settings(p);
 assert.ok(!s.calls.some(x=>['bot_account_enable','bot_account_settings'].includes(x.name)));
});
test('browser eligibility strictly validates the official response without session data',async()=>{
 let request;
 assert.equal(await api.checkEligibility(async(url,options)=>{request={url,options};return {ok:true,json:async()=>({blocked:false,country:'KZ',ip:'not-retained'})};}),true);
 assert.equal(request.url,'https://polymarket.com/api/geoblock');assert.equal(request.options.credentials,'omit');assert.equal(request.options.referrerPolicy,'no-referrer');assert.ok(!request.options.body);
 assert.equal(await api.checkEligibility(async()=>({ok:true,json:async()=>({blocked:true,country:'US'})})),false);
 for(const data of [null,{},[],{blocked:'false',country:'KZ'},{blocked:false}])await assert.rejects(api.checkEligibility(async()=>({ok:true,json:async()=>data})),/GEOBLOCK_UNVERIFIED/);
 await assert.rejects(api.checkEligibility(async()=>({ok:false})),/GEOBLOCK_UNVERIFIED/);
});
test('blocked or unavailable user location cannot call enable RPC',async()=>{
 for(const value of [false,null]){const s=setup();await s.c.refresh();s.c.eligibility=async()=>value;await s.c.enable(true);assert.ok(!s.calls.some(c=>c.name==='bot_account_enable'));assert.equal(s.c.state.error,value===false?'GEOBLOCKED':'GEOBLOCK_UNVERIFIED');}
 const s=setup();await s.c.refresh();s.c.eligibility=async()=>{s.setAuth('B');return true;};await s.c.enable(true);assert.equal(s.c.state.account,null);assert.ok(!s.calls.some(c=>c.name==='bot_account_enable'));
});
test('enabled label requires runtime readiness, independent of old session grants',()=>{
 const a=account();a.policy.enabled=true;a.runtime_ready=false;assert.equal(stateLabel({account:a},NOW),'PREPARING');a.runtime_ready=true;a.reason='NO_SIGNAL';assert.equal(stateLabel({account:a},NOW),'ACTIVE_NO_SIGNAL');a.policy.enabled=false;a.reason='USER_STOP';assert.equal(stateLabel({account:a},NOW),'STOPPED');
});
test('A late response never paints after user changes to B',async()=>{
 let resolve;const s=setup({mutate:n=>n==='bot_account_get'?new Promise(r=>resolve=r):undefined});
 const p=s.c.refresh();s.setAuth('telegram-user-B');s.c.reset();resolve({api_version:1,status:'OK',account:account()});await p;
 assert.equal(s.c.state.account,null);assert.ok(!s.renders.some(r=>r.account));
});
test('wallet account change during signature prevents submit',async()=>{
 let signed=false;const s=setup({request:async p=>{if(p.method==='eth_chainId')return '0x89';if(p.method==='eth_signTypedData_v4'){signed=true;return '0x'+'a'.repeat(130);}return [signed?botOwner:owner];}});
 await s.c.refresh();s.c.state.operation=operation();await s.c.signTransfer(true);
 assert.equal(s.c.state.error,'WALLET_CHANGED');assert.ok(!s.calls.some(x=>x.name==='bot_account_submit_transfer'));
});
test('wallet rejection and session change during wallet prompt cannot submit',async()=>{
 const rejected=setup({request:async p=>{if(p.method==='eth_chainId')return '0x89';if(p.method==='eth_signTypedData_v4')throw {code:4001};return [owner];}});
 await rejected.c.refresh();rejected.c.state.operation=operation();await rejected.c.signTransfer(true);assert.equal(rejected.c.state.error,'WALLET_REJECTED');assert.ok(!rejected.calls.some(x=>x.name==='bot_account_submit_transfer'));
 let release;const s=setup({request:async p=>{if(p.method==='eth_chainId')return '0x89';if(p.method==='eth_signTypedData_v4')return new Promise(r=>release=r);return [owner];}});
 await s.c.refresh();s.c.state.operation=operation();const pending=s.c.signTransfer(true);while(!release)await new Promise(r=>setImmediate(r));s.setAuth('B');release('0x'+'a'.repeat(130));await pending;assert.ok(!s.calls.some(x=>x.name==='bot_account_submit_transfer'));
});
test('lost submit response retains UNKNOWN and retries only reads',async()=>{
 const s=setup({mutate:n=>{if(n==='bot_account_submit_transfer')throw Error('lost reply');}});await s.c.refresh();s.c.state.operation=operation();await s.c.signTransfer(true);
 assert.equal(s.c.state.operation.state,'UNKNOWN');await s.c.signTransfer(true);assert.equal(s.calls.filter(x=>x.name==='bot_account_submit_transfer').length,1);
});
test('reviewed intent cannot change before signature and unknown fee blocks wallet',async()=>{
 const s=setup();await s.c.refresh();s.c.state.operation=operation();const changed=operation();changed.amount_units='3500000';changed.intent.amount_units='3500000';changed.challenge.typed_data.message.amount='3500000';s.setOp(changed);await s.c.signTransfer(true);assert.equal(s.walletCalls.length,0);
 s.c.state.operation=operation();s.c.state.operation.fee_units=null;await s.c.signTransfer(true);assert.equal(s.c.state.error,'FEES_UNVERIFIED');assert.equal(s.walletCalls.length,0);
});
test('returning OWNED user reuses proof without duplicate wallet link signature',async()=>{
 const s=setup({mutate:n=>n==='wallet_link_status'?{state:'OWNED',signer:owner,trading_account:funding}:undefined});await s.c.connect();assert.ok(!s.calls.some(x=>x.name==='wallet_link_challenge'));assert.ok(!s.walletCalls.some(x=>x.method==='eth_signTypedData_v4'));assert.equal(s.c.state.account.account_id,accountId);
});
test('pending ownership proof is resumed without issuing another challenge',async()=>{
 const s=setup({mutate:n=>n==='wallet_link_status'?{state:'PENDING',trading_account:funding}:undefined});await s.c.connect();assert.equal(s.c.state.status,'OWNERSHIP_PENDING');assert.ok(!s.calls.some(x=>x.name==='wallet_link_challenge'));
});
test('new user proves personal ownership in-page and only submits exact WalletLink',async()=>{
 const nonce='0x'+'9'.repeat(64),types={EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'}],WalletLink:[{name:'purpose',type:'string'},{name:'app',type:'string'},{name:'network',type:'string'},{name:'tradingAccount',type:'address'},{name:'signer',type:'address'},{name:'telegramUserId',type:'uint256'},{name:'nonce',type:'bytes32'},{name:'issuedAt',type:'uint256'},{name:'expiresAt',type:'uint256'}]};
 const td={types,primaryType:'WalletLink',domain:{name:'AI Sports (official)',version:'1',chainId:137},message:{purpose:'Только подтверждение контроля кошелька и привязка для просмотра в AI Sports. НЕ разрешает торговлю, переводы, approve и расходование средств.',app:'AI Sports official — @aisports0bot',network:'Polygon (chainId 137)',tradingAccount:funding,signer:owner,telegramUserId:'111',nonce,issuedAt:String(NOW/1000),expiresAt:String(NOW/1000+300)}};
 const s=setup({mutate:n=>({wallet_link_status:{state:'VIEW'},set_wallet_view:{resolved_address:funding},wallet_link_challenge:{status:'CHALLENGE',nonce,typed_data:td},wallet_link_submit:{status:'PENDING'}}[n])});
 await s.c.connect();assert.equal(s.c.state.status,'OWNERSHIP_PENDING');const signed=s.walletCalls.find(x=>x.method==='eth_signTypedData_v4');assert.deepEqual(JSON.parse(signed.params[1]),td);assert.equal(s.calls.find(x=>x.name==='wallet_link_submit').p.p_nonce,nonce);
 assert.ok(!s.calls.some(x=>x.name.startsWith('trading_grant')));
});
test('stale runtime or read failure cannot leave an enabled label',()=>{
 const a=account();a.policy.enabled=true;a.runtime_expires_at=new Date(NOW-1).toISOString();assert.equal(stateLabel({account:a},NOW),'STALE');a.runtime_expires_at=new Date(NOW+60000).toISOString();assert.equal(stateLabel({account:a,error:'SOURCE_UNAVAILABLE'},NOW),'STALE');
});
test('parallel refresh cannot unlock a mutation already in flight',async()=>{
 let release;const s=setup({mutate:n=>n==='bot_account_create'?new Promise(r=>release=r):undefined});
 const p=s.c.create(true);await s.c.refresh();assert.equal(s.c.state.busy,true);assert.equal(s.calls.length,1);release({api_version:1,status:'OK',account:account()});await p;assert.equal(s.c.state.busy,false);
});
test('STOP after a later enable uses the new policy version, not stale account revision',async()=>{
 const s=setup();let serial=0;s.c.uuid=()=>`request-${++serial}`;await s.c.refresh();await s.c.stop();s.c.state.account.policy.version=3;s.c.state.account.policy.enabled=true;await s.c.stop();
 const calls=s.calls.filter(c=>c.name==='bot_account_stop');assert.notEqual(calls[0].p.p_idempotency_key,calls[1].p.p_idempotency_key);
});
test('a completed transfer may be followed by another of the same amount without reusing the old operation',async()=>{
 const s=setup({mutate:n=>n==='bot_account_prepare_transfer'?{api_version:1,status:'OK',account:account(),operation:{...operation('FUNDING'),state:'PENDING'}}:undefined});let serial=0;s.c.uuid=()=>`request-${++serial}`;await s.c.refresh();await s.c.prepare('FUNDING','2.5');s.c.state.operation.state='CONFIRMED';await s.c.prepare('FUNDING','2.5');
 const calls=s.calls.filter(c=>c.name==='bot_account_prepare_transfer');assert.notEqual(calls[0].p.p_idempotency_key,calls[1].p.p_idempotency_key);
});
test('reload restores unfinished operation from private history',async()=>{
 const s=setup({mutate:n=>n==='bot_account_history'?{api_version:1,status:'OK',operations:[{...operation(),challenge:null}]}:undefined});await s.c.refresh();assert.equal(s.c.state.operation.state,'AWAITING_SIGNATURE');assert.equal(s.c.state.operation.operation_id,operationId);assert.equal(s.walletCalls.length,0);
});
test('ten independently authenticated controllers use the same API without cross-state',async()=>{
 const list=Array.from({length:10},(_,i)=>{const s=setup();s.setAuth('user-'+i);return s;});await Promise.all(list.map(s=>s.c.refresh()));
 for(let i=0;i<list.length;i++){assert.ok(list[i].calls.every(x=>x.p.p_init_data==='user-'+i));assert.notEqual(list[i].c.state,list[(i+1)%10].c.state);}
 list[0].setAuth('guest');list[0].c.reset();assert.equal(list[0].c.state.account,null);assert.ok(list[1].c.state.account);
});
test('official page uses private module, no raw session URL/test-page redirects/public bot projection',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../aisports/index.html'),'utf8');const BUILD=(html.match(/const BUILD = "(v\d+)"/)||[])[1];assert.ok(BUILD,'в index.html нет BUILD');
 assert.ok(html.includes('bot-account.js?v='+BUILD)&&html.includes('wallet-connect.js?v='+BUILD),'модули подключены не той версией, что BUILD');assert.ok(!html.includes('aisports-wallet-test/'));assert.ok(!html.includes('feed.bot_account'));assert.ok(!html.includes('target.hash = location.hash'));assert.ok(!html.includes('trading_grant_request'));
 for(const code of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(x=>x.trim()))assert.doesNotThrow(()=>new vm.Script(code));
 const official=JSON.parse(fs.readFileSync(path.join(__dirname,'../aisports/version.json')));const root=JSON.parse(fs.readFileSync(path.join(__dirname,'../version.json')));assert.equal(official.build,BUILD);assert.equal(root.build,official.build);assert.match(html,/const BUILD = "v\d+"/);
});
