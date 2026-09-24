// Funding source choice and the MetaMask route: controller-level acceptance, fake RPC and wallet only.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const api=require('../aisports/bot-account.js');
const {Controller,PUSD,validateWalletTransfer,opStateKey}=api;
const NOW=1800700000000;
const accountId='11111111-1111-4111-8111-111111111111',opId='33333333-3333-4333-8333-333333333333';
const owner='0x'+'1'.repeat(40),funding='0x'+'2'.repeat(40),botOwner='0x'+'3'.repeat(40),bot='0x'+'4'.repeat(40);
const clone=x=>JSON.parse(JSON.stringify(x));
const fresh=new Date(NOW-5000).toISOString();
function account({poly='72554481',mm='20000000',pol='1000000000000000000',held='0',stale=false}={}){
 return {account_id:accountId,state:'READY',version:3,verified_user_signer:owner,funding_wallet:funding,bot_owner_address:botOwner,bot_deposit_wallet:bot,chain_id:137,collateral:PUSD,
  policy:{version:2,enabled:false,max_stake_bps:700,max_open:10,sports:['mlb']},balance:{confirmed_units:'0',reserved_units:'0',available_units:'0',checked_at:fresh},runtime_ready:true,runtime_expires_at:new Date(NOW+60000).toISOString(),
  sources:[{source_kind:'METAMASK',address:owner,balance_units:mm,held_units:held,available_units:String(BigInt(mm)>BigInt(held)?BigInt(mm)-BigInt(held):0n),pol_wei:pol,owner_ok:true,block:1000,checked_at:stale?new Date(NOW-600000).toISOString():fresh,fresh:!stale},
           {source_kind:'POLYMARKET',address:funding,balance_units:poly,held_units:'0',available_units:poly,pol_wei:null,owner_ok:true,block:1000,checked_at:fresh,fresh:!stale}]};
}
function mmOperation(amount='10000000',state='AWAITING_SIGNATURE'){
 const data='0xa9059cbb'+bot.slice(2).padStart(64,'0')+BigInt(amount).toString(16).padStart(64,'0');
 return {operation_id:opId,kind:'FUNDING',state,source_kind:'METAMASK',amount_units:amount,fee_units:'0',
  intent:{account_id:accountId,operation_id:opId,kind:'FUNDING',chain_id:137,token:PUSD,source:owner,source_kind:'METAMASK',recipient:bot,amount_units:amount,verified_user_signer:owner,nonce:opId,expires_at:new Date(NOW+300000).toISOString()},
  challenge:state==='AWAITING_SIGNATURE'?{type:'erc20_transfer',signer:owner,from:owner,token:PUSD,recipient:bot,amount_units:amount,chain_id:137,data}:null};
}
function setup({acct=account(),op=mmOperation(),wallet={},server={}}={}){
 let a=acct,o=op;const calls=[],walletCalls=[];
 const reply=extra=>({api_version:1,status:'OK',account:clone(a),operation:clone(o),...extra});
 const rpc=async(name,p)=>{calls.push({name,p});
  if(server[name]){const r=await server[name](p,{get o(){return o;},set o(x){o=x;}});if(r!==undefined)return r;}
  if(name==='bot_account_get')return {api_version:1,status:'OK',account:clone(a)};
  if(name==='bot_account_history')return {api_version:1,status:'OK',operations:o?[clone(o)]:[]};
  if(name==='bot_account_operation')return reply();
  if(name==='bot_account_prepare_transfer'){o=p.p_source==='METAMASK'?mmOperation(String(BigInt(Math.round(Number(p.p_amount)*1e6)))):{...mmOperation(),source_kind:'POLYMARKET',state:'PENDING',challenge:null,amount_units:String(BigInt(Math.round(Number(p.p_amount)*1e6)))};return reply();}
  if(name==='bot_account_begin_wallet_tx'){o={...o,state:'WALLET_PENDING',challenge:null};return reply();}
  if(name==='bot_account_attach_tx'){o={...o,state:'SUBMITTED',tx_hash:p.p_tx_hash};return reply();}
  if(name==='bot_account_wallet_outcome'){o={...o,state:'UNKNOWN',reason:p.p_outcome==='LOST'?'WALLET_RESPONSE_LOST':'WALLET_DECLINE_REPORTED'};return reply();}
  if(name==='bot_account_cancel_unsent'){o={...o,state:'REJECTED',reason:'NOT_SENT_'+p.p_reason,challenge:null};return reply();}
  return reply();};
 const provider={request:async p=>{walletCalls.push(p.method);
  if(wallet[p.method])return wallet[p.method](p);
  if(['eth_accounts','eth_requestAccounts'].includes(p.method))return [owner];
  if(p.method==='eth_chainId')return '0x89';
  if(p.method==='eth_call')return '0x'+(20000000).toString(16).padStart(64,'0');
  if(p.method==='eth_estimateGas')return '0xea60';
  if(p.method==='eth_gasPrice')return '0x'+(100e9).toString(16);
  if(p.method==='eth_getBalance')return '0x'+(10n**18n).toString(16);
  if(p.method==='eth_sendTransaction')return '0x'+'ab'.repeat(32);
  throw Error('unexpected wallet method '+p.method);}};
 const c=new Controller({rpc,session:()=>'user-A',wallet:async()=>provider,resolveWallet:async()=>null,eligibility:async()=>true,now:()=>NOW,rpcTimeoutMs:50,uuid:(()=>{let n=0;return ()=>'key-'+(++n);})()});
 c.reset();return {c,calls,walletCalls,names:()=>calls.map(x=>x.name),setAccount:x=>a=x,setOp:x=>o=x,op:()=>o};
}
async function ready(s,op){await s.c.refresh();if(op!==undefined)s.c.state.operation=op;}

test('P0: 75 over the 72.554481 source is refused before any request or wallet, with numbers',async()=>{
 const s=setup({op:null});await ready(s);
 await s.c.prepare('FUNDING','75','POLYMARKET');
 assert.equal(s.c.state.error,'INSUFFICIENT_BALANCE');
 assert.equal(s.c.state.fundingCheck.available_units,'72554481');assert.equal(s.c.state.fundingCheck.needed_units,'75000000');
 assert.ok(!s.names().includes('bot_account_prepare_transfer'));assert.deepEqual(s.walletCalls,[]);assert.equal(s.c.state.busy,false);
});
test('MetaMask with 0 pUSD or no gas: refused, 0 wallet calls, 0 prepare calls',async()=>{
 for(const acct of [account({mm:'0'}),account({pol:'0'})]){
  const s=setup({acct,op:null});await ready(s);await s.c.prepare('FUNDING','1','METAMASK');
  assert.ok(['INSUFFICIENT_BALANCE','GAS_UNAVAILABLE'].includes(s.c.state.error));assert.ok(!s.names().includes('bot_account_prepare_transfer'));assert.deepEqual(s.walletCalls,[]);
 }
});
test('stale snapshot is BALANCE_UNAVAILABLE; server refusal keeps its funding check',async()=>{
 const s=setup({acct:account({stale:true}),op:null});await ready(s);await s.c.prepare('FUNDING','1','POLYMARKET');assert.equal(s.c.state.error,'BALANCE_UNAVAILABLE');
 const t=setup({op:null,server:{bot_account_prepare_transfer:()=>({api_version:1,status:'INSUFFICIENT_BALANCE',account:account(),operation:null,funding_check:{status:'INSUFFICIENT_BALANCE',available_units:'5',needed_units:'6'}})}});
 await ready(t);await t.c.prepare('FUNDING','6','POLYMARKET');assert.equal(t.c.state.error,'INSUFFICIENT_BALANCE');assert.equal(t.c.state.fundingCheck.available_units,'5');
});
test('chosen source is sent; idempotency key differs per source',async()=>{
 const s=setup({op:null});await ready(s);await s.c.prepare('FUNDING','5','METAMASK');s.c.state.operation=null;await s.c.prepare('FUNDING','5','POLYMARKET');
 const p=s.calls.filter(x=>x.name==='bot_account_prepare_transfer');assert.deepEqual(p.map(x=>x.p.p_source),['METAMASK','POLYMARKET']);assert.notEqual(p[0].p.p_idempotency_key,p[1].p.p_idempotency_key);
});
test('variant a: new funding allowed while an UNKNOWN one waits, not while one awaits confirmation',async()=>{
 const s=setup({acct:account({held:'10000000'}),op:null});await ready(s,{...mmOperation('10000000','UNKNOWN'),challenge:null});
 await s.c.prepare('FUNDING','9','METAMASK');assert.equal(s.c.state.error,null);assert.equal(s.calls.filter(x=>x.name==='bot_account_prepare_transfer').length,1);
 const t=setup({acct:account({held:'10000000'}),op:null});await ready(t,mmOperation());await t.c.prepare('FUNDING','1','METAMASK');assert.equal(t.c.state.error,'OPERATION_IN_PROGRESS');
 const u=setup({acct:account({held:'10000000'}),op:null});await ready(u);await u.c.prepare('FUNDING','11','METAMASK');assert.equal(u.c.state.error,'INSUFFICIENT_BALANCE');assert.ok(!u.names().includes('bot_account_prepare_transfer'));
});
test('MetaMask happy path: checks, begin BEFORE the wallet, one sendTransaction, hash attached',async()=>{
 const s=setup();await ready(s,mmOperation());await s.c.sendFromWallet(true);
 const n=s.names(),w=s.walletCalls;
 assert.ok(n.indexOf('bot_account_begin_wallet_tx')>=0&&n.indexOf('bot_account_attach_tx')>n.indexOf('bot_account_begin_wallet_tx'));
 assert.deepEqual(w,['eth_requestAccounts','eth_chainId','eth_call','eth_estimateGas','eth_gasPrice','eth_getBalance','eth_sendTransaction']);
 assert.equal(s.c.state.operation.state,'SUBMITTED');assert.ok(!w.includes('eth_signTypedData_v4')&&!w.includes('wallet_switchEthereumChain'));
});
test('exact transaction: from EOA to pUSD, transfer(AISports, amount), no approve, chain 137',async()=>{
 let sent;const s=setup({wallet:{eth_sendTransaction:p=>{sent=p.params[0];return '0x'+'cd'.repeat(32);}}});await ready(s,mmOperation('10000000'));await s.c.sendFromWallet(true);
 assert.deepEqual(sent,{from:owner,to:PUSD,data:'0xa9059cbb'+bot.slice(2).padStart(64,'0')+(10000000).toString(16).padStart(64,'0'),value:'0x0',chainId:'0x89'});
 for(const change of [o=>o.challenge.recipient=funding,o=>o.challenge.token=owner,o=>o.challenge.data='0x095ea7b3'+o.challenge.data.slice(10),o=>o.challenge.amount_units='1',o=>o.challenge.from=botOwner,o=>o.intent.recipient=funding,o=>o.challenge.chain_id=1,o=>o.challenge.extra='x']){
  const o=mmOperation();change(o);assert.throws(()=>validateWalletTransfer(o,account(),NOW));
 }
});
test('pre-send failures: wrong chain, low pUSD, low gas -> REJECTED not sent, no begin, no wallet transaction',async()=>{
 for(const [wallet,reason] of [[{eth_chainId:()=> '0x1'},'CHAIN_MISMATCH'],[{eth_call:()=> '0x'+'0'.repeat(64)},'BALANCE_LOW'],[{eth_getBalance:()=> '0x1'},'GAS_LOW']]){
  const s=setup({wallet});await ready(s,mmOperation());await s.c.sendFromWallet(true);
  assert.equal(s.c.state.error,'NOT_SENT_'+reason);assert.equal(s.calls.find(x=>x.name==='bot_account_cancel_unsent').p.p_reason,reason);
  assert.ok(!s.names().includes('bot_account_begin_wallet_tx'));assert.ok(!s.walletCalls.includes('eth_sendTransaction'));
 }
});
test('other wallet account: nothing cancelled, nothing begun, no transaction',async()=>{
 const s=setup({wallet:{eth_requestAccounts:()=>[botOwner]}});await ready(s,mmOperation());await s.c.sendFromWallet(true);
 assert.equal(s.c.state.error,'WALLET_CHANGED');assert.ok(!s.names().some(n=>['bot_account_cancel_unsent','bot_account_begin_wallet_tx'].includes(n)));assert.ok(!s.walletCalls.includes('eth_sendTransaction'));
});
test('wallet decline after begin: UNKNOWN via wallet_outcome, never cancel_unsent, no second transaction',async()=>{
 const s=setup({wallet:{eth_sendTransaction:()=>{throw {code:4001};}}});await ready(s,mmOperation());await s.c.sendFromWallet(true);
 assert.equal(s.c.state.error,'WALLET_DECLINE_REPORTED');assert.equal(s.c.state.operation.state,'UNKNOWN');
 assert.equal(s.calls.find(x=>x.name==='bot_account_wallet_outcome').p.p_outcome,'DECLINED');assert.ok(!s.names().includes('bot_account_cancel_unsent'));
 await s.c.sendFromWallet(true);assert.equal(s.walletCalls.filter(m=>m==='eth_sendTransaction').length,1);
});
test('wallet never answers or answers garbage: LOST, UNKNOWN, no retry',async()=>{
 for(const fn of [()=>{throw Error('disconnected');},()=>'not-a-hash']){
  const s=setup({wallet:{eth_sendTransaction:fn}});await ready(s,mmOperation());await s.c.sendFromWallet(true);
  assert.equal(s.c.state.error,'WALLET_RESPONSE_LOST');assert.equal(s.calls.find(x=>x.name==='bot_account_wallet_outcome').p.p_outcome,'LOST');assert.ok(!s.names().includes('bot_account_attach_tx'));
 }
});
test('lost begin reply: wallet opens only if the server shows WALLET_PENDING',async()=>{
 const lostButRecorded=setup({server:{bot_account_begin_wallet_tx:(p,st)=>{st.o={...st.o,state:'WALLET_PENDING',challenge:null};throw Error('lost');}}});
 await ready(lostButRecorded,mmOperation());await lostButRecorded.c.sendFromWallet(true);assert.equal(lostButRecorded.walletCalls.filter(m=>m==='eth_sendTransaction').length,1);
 const lostNotRecorded=setup({server:{bot_account_begin_wallet_tx:()=>{throw Error('lost');}}});
 await ready(lostNotRecorded,mmOperation());await lostNotRecorded.c.sendFromWallet(true);assert.ok(!lostNotRecorded.walletCalls.includes('eth_sendTransaction'));
});
test('hung RPC: bounded wait, named error, busy released, nothing repeated',async()=>{
 const s=setup({op:null,server:{bot_account_prepare_transfer:()=>new Promise(()=>{})}});await ready(s);
 await s.c.prepare('FUNDING','5','POLYMARKET');assert.equal(s.c.state.error,'SOURCE_TIMEOUT');assert.equal(s.c.state.busy,false);
 assert.equal(s.calls.filter(x=>x.name==='bot_account_prepare_transfer').length,1);
});
test('refresh on PENDING / WALLET_PENDING / UNKNOWN / REJECTED only reads and never opens the wallet',async()=>{
 for(const state of ['PENDING','WALLET_PENDING','UNKNOWN','REJECTED','AWAITING_SIGNATURE']){
  const o={...mmOperation('10000000',state),...(state==='AWAITING_SIGNATURE'?{}:{challenge:null})};
  const s=setup({op:o});await s.c.refresh();await s.c.refresh();
  assert.ok(s.names().every(n=>['bot_account_get','bot_account_history','bot_account_operation'].includes(n)),state);
  assert.deepEqual(s.walletCalls,[]);assert.equal(s.c.state.operation.state,state);
 }
});
test('status keys: checking, MetaMask awaiting, wallet pending, refused funding',()=>{
 assert.equal(opStateKey({kind:'FUNDING',state:'PENDING'}),'CHECKING');assert.equal(opStateKey({kind:'FUNDING',state:'AWAITING_SIGNATURE',source_kind:'METAMASK'}),'AWAITING_WALLET_TX');
 assert.equal(opStateKey({kind:'FUNDING',state:'AWAITING_SIGNATURE',source_kind:'POLYMARKET'}),'AWAITING_SIGNATURE');assert.equal(opStateKey({kind:'FUNDING',state:'WALLET_PENDING'}),'WALLET_PENDING');
 assert.equal(opStateKey({kind:'FUNDING',state:'REJECTED'}),'REJECTED_NO_DEBIT');assert.equal(opStateKey({kind:'WITHDRAW',state:'REJECTED'}),'REJECTED');
});
test('two users: each call carries only its own initData',async()=>{
 const a=setup(),b=setup();b.c.session=()=>'user-B';b.c.reset();await Promise.all([a.c.refresh(),b.c.refresh()]);
 assert.ok(a.calls.every(x=>x.p.p_init_data==='user-A'));assert.ok(b.calls.every(x=>x.p.p_init_data==='user-B'));
});
test('wallet outcome cannot be recorded (both branches): explicit UNKNOWN, reconciliation continues, no REJECTED, no resend',async()=>{
 for(const sendTx of [()=>{throw {code:4001};},()=>{throw Error('disconnected');},()=>'not-a-hash']){
  const s=setup({wallet:{eth_sendTransaction:sendTx},server:{bot_account_wallet_outcome:()=>{throw Error('rpc down');}}});
  await ready(s,mmOperation());await s.c.sendFromWallet(true);
  assert.equal(s.c.state.error,'WALLET_OUTCOME_UNRECORDED');
  assert.equal(s.c.state.operation.state,'UNKNOWN');assert.equal(s.c.state.operation.reason,'WALLET_OUTCOME_UNRECORDED');
  assert.ok(!s.names().includes('bot_account_cancel_unsent'));assert.ok(!s.names().includes('bot_account_attach_tx'));
  assert.equal(s.calls.filter(x=>x.name==='bot_account_wallet_outcome').length,1);
  await s.c.sendFromWallet(true);assert.equal(s.walletCalls.filter(m=>m==='eth_sendTransaction').length,1);
  assert.equal(s.c.state.busy,false);assert.notEqual(s.c.state.operation.state,'REJECTED');
 }
});
