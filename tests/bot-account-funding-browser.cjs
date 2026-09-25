// Offline browser acceptance for funding source choice (Astra 24.09). All requests intercepted; no live RPC/wallet.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=path.resolve(__dirname,'..'),out=path.resolve(process.env.UI_ARTIFACT_DIR||path.join(repo,'artifacts/ui-funding'));
const owner='0x'+'1'.repeat(40),funding='0x'+'2'.repeat(40),botOwner='0x'+'3'.repeat(40),bot='0x'+'4'.repeat(40),PUSD='0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb';
const oldId='65ce28bd-899c-44e2-8679-7f03aa576a3b',mmId='44444444-4444-4444-8444-444444444444';
const now=()=>new Date().toISOString();
let mm={balance:'0',pol:'0'},operations=[],current=null;const calls=[],errors=[];
function account(){return {account_id:'11111111-1111-4111-8111-111111111111',state:'READY',version:3,verified_user_signer:owner,funding_wallet:funding,bot_owner_address:botOwner,bot_deposit_wallet:bot,chain_id:137,collateral:PUSD,
 policy:{version:2,enabled:false,max_stake_bps:1000,max_open:10,sports:['mlb']},balance:{confirmed_units:'0',reserved_units:'0',available_units:'0',checked_at:now()},runtime_ready:true,last_checked_at:now(),
 sources:[{source_kind:'METAMASK',address:owner,balance_units:mm.balance,held_units:'0',available_units:mm.balance,pol_wei:mm.pol,owner_ok:true,block:94367497,checked_at:now(),fresh:true},
          {source_kind:'POLYMARKET',address:funding,balance_units:'72554481',held_units:'0',available_units:'72554481',pol_wei:null,owner_ok:true,block:94367497,checked_at:now(),fresh:true}]};}
const expired={operation_id:oldId,kind:'FUNDING',state:'REJECTED',phase:'DONE',amount_units:'75000000',source_kind:'POLYMARKET',source_address:funding,reason:'EXPIRED_UNSENT',created_at:'2026-09-24T12:56:53Z',
 intent:{account_id:'11111111-1111-4111-8111-111111111111',operation_id:oldId,kind:'FUNDING',chain_id:137,token:PUSD,source:funding,recipient:bot,amount_units:'75000000',verified_user_signer:owner,nonce:oldId,expires_at:'2026-09-24T13:06:53Z'}};
function mmOp(state,extra={}){
 const data='0xa9059cbb'+bot.slice(2).padStart(64,'0')+(10000000).toString(16).padStart(64,'0');
 return {operation_id:mmId,kind:'FUNDING',state,amount_units:'10000000',fee_units:'0',source_kind:'METAMASK',source_address:owner,created_at:now(),
  intent:{account_id:'11111111-1111-4111-8111-111111111111',operation_id:mmId,kind:'FUNDING',chain_id:137,token:PUSD,source:owner,source_kind:'METAMASK',recipient:bot,amount_units:'10000000',verified_user_signer:owner,nonce:mmId,expires_at:new Date(Date.now()+300000).toISOString()},
  challenge:state==='AWAITING_SIGNATURE'?{type:'erc20_transfer',signer:owner,from:owner,token:PUSD,recipient:bot,amount_units:'10000000',chain_id:137,data}:null,...extra};
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||chromium.executablePath()});
 try{
 const context=await browser.newContext({viewport:{width:390,height:900},deviceScaleFactor:1,reducedMotion:'reduce'});
 await context.routeWebSocket(/.*/,ws=>ws.close());
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.hostname==='aisports.test'){
   const filename=path.resolve(repo,'.'+decodeURIComponent(url.pathname));
   if(filename.startsWith(repo+path.sep)&&fs.existsSync(filename)&&fs.statSync(filename).isFile())return route.fulfill({body:fs.readFileSync(filename),contentType:filename.endsWith('.html')?'text/html':filename.endsWith('.js')?'application/javascript':'application/octet-stream'});
  }
  if(req.resourceType()==='script')return route.fulfill({body:'',contentType:'application/javascript'});
  let result=[];
  if(url.pathname.includes('/rpc/')){
   const name=url.pathname.split('/').pop(),body=req.postDataJSON();calls.push({name,body});
   const reply=()=>({api_version:1,status:'OK',account:account(),operation:current});
   if(name==='bot_account_get')result={api_version:1,status:'OK',account:account()};
   else if(name==='bot_account_history')result={api_version:1,status:'OK',operations:current&&!operations.includes(current)?[current,...operations]:operations};
   else if(name==='bot_account_operation')result=reply();
   else if(name==='bot_account_prepare_transfer'){current=mmOp('AWAITING_SIGNATURE');result=reply();}
   else if(name==='bot_account_begin_wallet_tx'){current=mmOp('WALLET_PENDING',{reason:'WALLET_PENDING',wallet_requested_at:now()});result=reply();}
   else if(name==='wallet_link_status')result={state:'OWNED',signer:owner,trading_account:funding};
   else if(name==='get_wallet_view')result={input_address:owner,resolved_address:funding,profile_name:'Local fixture'};
   else if(name==='get_profile_v2')result={tg_id:111,username:'fixture',is_paid:true};
   else if(name==='app_version')result=JSON.parse(fs.readFileSync(path.join(__dirname,'../aisports/version.json'),'utf8')).build;
   else result={};
  }else if(url.pathname.endsWith('/app_assets'))result=[{content:{schema_version:1,session:{date:'2026-09-24',bets:0,bets_list:[]},history:[],sports:{},bets:[],paper_forecasts:[]}}];
  else if(url.hostname==='polygon-bor-rpc.publicnode.com')result={jsonrpc:'2.0',id:1,result:'0x89'};
  else if(url.pathname==='/value')result=[{value:100}];
  return route.fulfill({status:200,body:JSON.stringify(result),contentType:'application/json',headers:{'access-control-allow-origin':'*'}});
 });
 await context.addInitScript(()=>{
  sessionStorage.setItem('senya_lang_reload','1');
  window.Telegram={WebApp:{initData:'FIXTURE_A_NOT_REAL_AUTH',initDataUnsafe:{user:{id:111,first_name:'Проверка',language_code:'ru'}},ready(){},expand(){},onEvent(){},offEvent(){},setHeaderColor(){},setBackgroundColor(){},BackButton:{show(){},hide(){},onClick(){},offClick(){}},HapticFeedback:{impactOccurred(){},notificationOccurred(){}},themeParams:{}}};
  window.__walletMethods=[];window.__sent=[];
  window.ethereum={isMetaMask:true,request:async p=>{window.__walletMethods.push(p.method);
   if(['eth_accounts','eth_requestAccounts'].includes(p.method))return ['0x'+'1'.repeat(40)];
   if(p.method==='eth_chainId')return '0x89';
   if(p.method==='eth_call')return '0x'+(20000000).toString(16).padStart(64,'0');
   if(p.method==='eth_estimateGas')return '0xea60';if(p.method==='eth_gasPrice')return '0x174876e800';if(p.method==='eth_getBalance')return '0xde0b6b3a7640000';
   if(p.method==='eth_sendTransaction'){window.__sent.push(p.params[0]);return new Promise(()=>{});}   // the wallet never answers
   throw Error('Unexpected wallet method '+p.method);}};
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.__clipboardValue=value;}}});
 });
 const open=async()=>{const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://aisports.test/aisports/index.html');await page.locator('[data-tab="me"]').click();
  const box=page.locator('#botAccountBox');await box.getByRole('button',{name:'Обновить',exact:true}).first().waitFor();return {page,box};};
 const mutations=()=>calls.filter(c=>/prepare_transfer|begin_wallet|attach_tx|wallet_outcome|cancel_unsent|submit_transfer/.test(c.name)).length;

 // 1. Past refusals stay in private history and are not reintroduced on the main account screen.
 operations=[expired];current=null;
 let {page,box}=await open();
 assert.doesNotMatch(await box.innerText(),/Мои операции и ставки|Пополнение 75 pUSD|На исходном кошельке/);
 await box.getByRole('button',{name:'Настройки',exact:true}).click();
 const settings=page.getByRole('dialog',{name:'Настройки'});
 await settings.waitFor();assert.equal(await settings.locator('input').inputValue(),'10');
 await settings.getByRole('button',{name:'Закрыть'}).click();assert.equal(await settings.count(),0);
 await page.evaluate(()=>showWalletPairing('metamask://connect/mwp?p='+'A'.repeat(700)));
 const pair=page.getByRole('dialog',{name:'Подключение MetaMask'});
 await pair.waitFor();assert.ok((await pair.locator('canvas').evaluate(c=>c.width))>0);
 await pair.getByRole('button',{name:'Подтвердить в MetaMask'}).waitFor();
 await pair.screenshot({path:path.join(out,'00-metamask-pairing.png')});
 await page.evaluate(()=>showWalletPairing(null));assert.equal(await pair.count(),0);
 await page.evaluate(()=>showWalletPairing('https://untrusted.example/connect/mwp?p=AAA'));
 assert.equal(await page.getByRole('dialog',{name:'Подключение MetaMask'}).count(),0);
 await box.locator('.ba-bar').waitFor({state:'detached',timeout:5000});           // the read finishes…
 await page.waitForTimeout(6000);assert.equal(await box.locator('.ba-bar').count(),0,'screen must not spin after REJECTED'); // …and no poll restarts it
 assert.equal(calls.filter(c=>c.name==='bot_account_operation').length,0,'a terminal operation is not polled');
 await page.screenshot({path:path.join(out,'01-old-refusal-hidden.png'),fullPage:true});

 // 2. Compact source menu: 75 from Polymarket is refused before any request or wallet.
 await box.getByRole('button',{name:'Пополнить',exact:true}).first().click();
 const picker=box.getByRole('button',{name:'Откуда пополнить'});
 assert.equal(await box.getByRole('option').count(),0,'source choices stay collapsed until opened');
 await picker.click();assert.equal(await box.getByRole('option').count(),2);
 await box.getByRole('option',{name:/Из MetaMask/}).click();
 assert.equal(await box.getByRole('option').count(),0);
 assert.match(await box.innerText(),/На MetaMask нет pUSD в Polygon\. Выберите счёт Polymarket или пополните MetaMask именно pUSD/);
 await picker.click();await box.getByRole('option',{name:/Со счёта Polymarket/}).click();
 await box.getByLabel('Сумма pUSD',{exact:true}).fill('75');await box.getByRole('button',{name:'Проверить перевод',exact:true}).click();
 await box.getByText('доступно 72.554481 pUSD, нужно 75 pUSD',{exact:false}).waitFor();
 assert.equal(mutations(),0);assert.deepEqual(await page.evaluate(()=>window.__walletMethods),[]);
 await page.screenshot({path:path.join(out,'02-source-menu-75-refused.png'),fullPage:true});
 // MetaMask with 0 pUSD: refused, still 0 wallet calls.
 await picker.click();await box.getByRole('option',{name:/Из MetaMask/}).click();
 await box.getByLabel('Сумма pUSD',{exact:true}).fill('1');await box.getByRole('button',{name:'Проверить перевод',exact:true}).click();
 await box.getByText('доступно 0 pUSD, нужно 1 pUSD',{exact:false}).waitFor();
 assert.equal(mutations(),0);assert.deepEqual(await page.evaluate(()=>window.__walletMethods),[]);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile overflow');
 await page.close();

 // 3. MetaMask funded: review says "network transaction", then the wallet never answers -> WALLET_PENDING.
 mm={balance:'20000000',pol:'1000000000000000000'};
 ({page,box}=await open());
 await box.getByRole('button',{name:'Пополнить',exact:true}).first().click();
 await box.getByRole('button',{name:'Откуда пополнить'}).click();await box.getByRole('option',{name:/Из MetaMask/}).click();
 await box.getByLabel('Сумма pUSD',{exact:true}).fill('10');await box.getByRole('button',{name:'Проверить перевод',exact:true}).click();
 await box.getByText('Перевод готов — подтвердите в MetaMask',{exact:false}).waitFor();
 const review=await box.innerText();assert.match(review,/Сетевая транзакция из MetaMask/);assert.match(review,/Газ в POL/);
 assert.equal(await box.locator('[data-primary=true]').count(),1);
 await page.screenshot({path:path.join(out,'03-metamask-review.png'),fullPage:true});
 await box.locator('input[type=checkbox]').last().check();await box.getByRole('button',{name:'Отправить из MetaMask',exact:true}).click();
 await box.getByText('Ждём подтверждения в кошельке',{exact:false}).first().waitFor();
 const sent=await page.evaluate(()=>window.__sent);assert.equal(sent.length,1);
 assert.deepEqual(sent[0],{from:owner,to:PUSD,data:'0xa9059cbb'+bot.slice(2).padStart(64,'0')+(10000000).toString(16).padStart(64,'0'),value:'0x0',chainId:'0x89'});
 const methods=await page.evaluate(()=>window.__walletMethods);assert.ok(!methods.includes('eth_signTypedData_v4')&&!methods.includes('wallet_switchEthereumChain'));
 assert.equal(calls.filter(c=>c.name==='bot_account_begin_wallet_tx').length,1);assert.equal(calls.filter(c=>c.name==='bot_account_attach_tx').length,0);
 await page.close();

 // 4. Reloads in every waiting state: right status, only reads, wallet untouched, "Обновить" creates nothing.
 const cases=[['WALLET_PENDING',{reason:'WALLET_PENDING'},/Ждём подтверждения в кошельке/],['UNKNOWN',{reason:'WALLET_RESPONSE_LOST'},/Исход уточняется — повторный перевод не отправляется/],
  ['REJECTED',{reason:'NOT_SENT_GAS_LOW'},null],['AWAITING_SIGNATURE',{},/Перевод готов — подтвердите в MetaMask/],['PENDING',{},/Проверяем баланс источника/]];
 for(const [state,extra,expected] of cases){
  current=mmOp(state,extra);operations=[current];const before=mutations();
  ({page,box}=await open());if(expected)await box.getByText(expected).first().waitFor();
  else assert.doesNotMatch(await box.innerText(),/Пополнение 10 pUSD не выполнено|Мои операции и ставки/);
  await box.getByRole('button',{name:'Обновить',exact:true}).first().click();await page.waitForTimeout(300);
  assert.equal(mutations(),before,state+': refresh must not create or send');assert.deepEqual(await page.evaluate(()=>window.__walletMethods),[],state);
  await page.screenshot({path:path.join(out,'04-reload-'+state.toLowerCase()+'.png'),fullPage:true});
  if(state==='UNKNOWN'){const reads=calls.filter(c=>c.name==='bot_account_operation').length,head=await box.locator('.ba-head').elementHandle();await page.waitForTimeout(5600);
   assert.ok(calls.filter(c=>c.name==='bot_account_operation').length>reads,'unfinished operation is re-read automatically');assert.equal(mutations(),before);
   assert.equal(await head.evaluate(el=>el.isConnected),true,'unchanged poll must not replace the profile card');}
  await page.close();
 }
 assert.deepEqual(errors,[]);
 assert.ok(calls.filter(x=>x.name.startsWith('bot_account_')).every(x=>x.body.p_init_data==='FIXTURE_A_NOT_REAL_AUTH'));
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({offline:true,errors,rpcCalls:calls.length,scenarios:['old-refusal-hidden','settings-modal','unchanged-poll-keeps-profile-dom','compact-source-menu','75-over-72.554481-refused-before-request','metamask-0-pusd-refused','metamask-review-network-transaction','wallet-never-answers-wallet-pending','exact-erc20-transfer','reload-wallet-pending','reload-unknown-auto-reread','reload-rejected-hidden','reload-awaiting','reload-checking','refresh-read-only'],physicalWallet:'NOT_OBSERVED'},null,2)+'\n');
 console.log(JSON.stringify({ok:true,artifacts:out,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
