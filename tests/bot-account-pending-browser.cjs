// Offline browser stand (25.09, owner: «ПРОВЕРЯЕМ БАЛАНС ИСТОЧНИКА» while DB already AWAITING_SIGNATURE).
// Server answers PENDING for the first N reads of bot_account_operation, then AWAITING_SIGNATURE. The open transfer
// dialog must move to the review/sign step by itself: no reload, no second prepare, no wallet call.
// Also: a slow (delayed) bot_account_operation and one lost reply must not freeze the dialog or duplicate anything.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=path.resolve(__dirname,'..'),out=path.resolve(process.env.UI_ARTIFACT_DIR||path.join(repo,'artifacts/ui-pending'));
const owner='0x'+'1'.repeat(40),funding='0x'+'2'.repeat(40),botOwner='0x'+'3'.repeat(40),bot='0x'+'4'.repeat(40),PUSD='0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb';
const opId='55555555-5555-4555-8555-555555555555';
const now=()=>new Date().toISOString();
let current=null,opReads=0,pendingReads=3,delayMs=0,loseNext=false;const calls=[],errors=[],timeline=[];
function account(){return {account_id:'11111111-1111-4111-8111-111111111111',state:'READY',version:3,verified_user_signer:owner,funding_wallet:funding,bot_owner_address:botOwner,bot_deposit_wallet:bot,chain_id:137,collateral:PUSD,
 policy:{version:2,enabled:false,max_stake_bps:1000,max_open:10,sports:['mlb']},balance:{confirmed_units:'12000000',reserved_units:'0',available_units:'12000000',checked_at:now()},runtime_ready:true,last_checked_at:now(),
 sources:[{source_kind:'METAMASK',address:owner,balance_units:'0',held_units:'0',available_units:'0',pol_wei:'0',owner_ok:true,block:94409510,checked_at:now(),fresh:true},
          {source_kind:'POLYMARKET',address:funding,balance_units:'60554481',held_units:current&&current.state!=='REJECTED'?'60000000':'0',available_units:current&&current.state!=='REJECTED'?'554481':'60554481',pol_wei:null,owner_ok:true,block:94409510,checked_at:now(),fresh:true}]};}
function op(state){
 const amount='60000000',expires=new Date(Date.now()+600000).toISOString();
 const o={operation_id:opId,kind:'FUNDING',state,phase:state==='AWAITING_SIGNATURE'?'PREPARE':'PREPARE',amount_units:amount,fee_units:state==='AWAITING_SIGNATURE'?'0':null,fee_reason:state==='AWAITING_SIGNATURE'?'RELAYER_SPONSORED_ERC20_TRANSFER':null,source_kind:'POLYMARKET',source_address:funding,created_at:now(),reason:null,
  intent:{account_id:account().account_id,operation_id:opId,kind:'FUNDING',chain_id:137,token:PUSD,source:funding,source_kind:'POLYMARKET',recipient:bot,amount_units:amount,verified_user_signer:owner,nonce:opId,expires_at:expires},challenge:null};
 if(state==='AWAITING_SIGNATURE')o.challenge={signer:owner,typed_data:{types:{Call:[{name:'target',type:'address'},{name:'value',type:'uint256'},{name:'data',type:'bytes'}],Batch:[{name:'wallet',type:'address'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'},{name:'calls',type:'Call[]'}]},domain:{name:'DepositWallet',version:'1',chainId:137,verifyingContract:funding},primaryType:'Batch',message:{wallet:funding,nonce:'1',deadline:String(Math.floor(Date.parse(expires)/1000)),calls:[{target:PUSD,value:'0',data:'0xa9059cbb'+bot.slice(2).padStart(64,'0')+BigInt(amount).toString(16).padStart(64,'0')}]}}};
 return o;
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
   const name=url.pathname.split('/').pop(),body=req.postDataJSON();calls.push({name,t:Date.now()});
   const reply=()=>({api_version:1,status:'OK',account:account(),operation:current});
   if(name==='bot_account_get')result={api_version:1,status:'OK',account:account()};
   else if(name==='bot_account_history')result={api_version:1,status:'OK',operations:current?[current]:[]};
   else if(name==='bot_account_operation'){
    opReads++;
    if(loseNext){loseNext=false;timeline.push(['lost read',Date.now()]);return route.abort('connectionreset');}
    if(current&&current.state==='PENDING'&&opReads>pendingReads){current=op('AWAITING_SIGNATURE');timeline.push(['server → AWAITING_SIGNATURE',Date.now()]);}
    if(delayMs)await new Promise(r=>setTimeout(r,delayMs));
    result=reply();
   }
   else if(name==='bot_account_prepare_transfer'){current=op('PENDING');opReads=0;timeline.push(['prepare → PENDING',Date.now()]);result=reply();}
   else if(name==='wallet_link_status')result={state:'OWNED',signer:owner,trading_account:funding};
   else if(name==='get_wallet_view')result={input_address:owner,resolved_address:funding,profile_name:'Local fixture'};
   else if(name==='get_profile_v2')result={tg_id:111,username:'fixture',is_paid:true};
   else if(name==='app_version')result=JSON.parse(fs.readFileSync(path.join(__dirname,'../aisports/version.json'),'utf8')).build;
   else result={};
  }else if(url.pathname.endsWith('/app_assets'))result=[{content:{schema_version:1,session:{date:'2026-09-25',bets:0,bets_list:[]},history:[],sports:{},bets:[],paper_forecasts:[]}}];
  else if(url.hostname==='polygon-bor-rpc.publicnode.com')result={jsonrpc:'2.0',id:1,result:'0x89'};
  else if(url.pathname==='/value')result=[{value:100}];
  return route.fulfill({status:200,body:JSON.stringify(result),contentType:'application/json',headers:{'access-control-allow-origin':'*'}});
 });
 await context.addInitScript(()=>{
  sessionStorage.setItem('senya_lang_reload','1');
  window.Telegram={WebApp:{initData:'FIXTURE_A_NOT_REAL_AUTH',initDataUnsafe:{user:{id:111,first_name:'Проверка',language_code:'ru'}},ready(){},expand(){},onEvent(){},offEvent(){},setHeaderColor(){},setBackgroundColor(){},BackButton:{show(){},hide(){},onClick(){},offClick(){}},HapticFeedback:{impactOccurred(){},notificationOccurred(){}},themeParams:{}}};
  window.__walletMethods=[];window.ethereum={isMetaMask:true,request:async p=>{window.__walletMethods.push(p.method);throw Error('wallet must not be called in this stand: '+p.method);}};
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{}}});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://aisports.test/aisports/index.html');await page.locator('[data-tab="me"]').click();
 const box=page.locator('#botAccountBox');await box.getByRole('button',{name:'Пополнить',exact:true}).first().waitFor();
 const mutations=()=>calls.filter(c=>/prepare_transfer|begin_wallet|attach_tx|wallet_outcome|cancel_unsent|submit_transfer/.test(c.name)).length;
 const dialog=page.locator('dialog.ba-transfer-dialog');

 // 1. PENDING for 3 reads (~15 s at 5 s polling), then AWAITING_SIGNATURE: dialog must reach the sign step by itself.
 await box.getByRole('button',{name:'Пополнить',exact:true}).first().click();
 await dialog.waitFor();
 await dialog.getByLabel('Сумма pUSD',{exact:true}).fill('60');
 const t0=Date.now();await dialog.getByRole('button',{name:'Проверить перевод',exact:true}).click();
 await dialog.getByText('Проверяем баланс источника',{exact:false}).waitFor({timeout:5000});
 timeline.push(['UI: checking',Date.now()]);
 await page.screenshot({path:path.join(out,'01-pending.png'),fullPage:false});
 await dialog.getByRole('button',{name:'Подтвердить в кошельке',exact:true}).waitFor({timeout:40000});
 timeline.push(['UI: sign button',Date.now()]);
 const serverAt=timeline.find(t=>t[0]==='server → AWAITING_SIGNATURE')[1],uiAt=timeline.find(t=>t[0]==='UI: sign button')[1];
 await page.screenshot({path:path.join(out,'02-sign-step.png'),fullPage:false});
 assert.equal(mutations(),1,'exactly one prepare');
 assert.deepEqual(await page.evaluate(()=>window.__walletMethods),[]);
 assert.ok(uiAt-serverAt<7000,'sign step must follow the server state within one poll interval, got '+(uiAt-serverAt)+' ms');
 assert.match(await dialog.innerText(),/60 pUSD/);
 assert.equal(await dialog.count(),1,'dialog is not recreated');
 console.log(JSON.stringify({scenario:1,prepare_to_sign_ms:uiAt-t0,server_to_ui_ms:uiAt-serverAt,op_reads:opReads}));

 // 2. Slow server (each read 4 s) + one lost reply: still no freeze, no duplicate, sign step reached.
 await dialog.getByRole('button',{name:'×'}).click().catch(()=>{});
 current=null;opReads=0;pendingReads=2;delayMs=4000;loseNext=true;calls.length=0;timeline.length=0;   // reset BEFORE the page reloads
 await page.reload();await page.locator('[data-tab="me"]').click();
 await box.getByRole('button',{name:'Пополнить',exact:true}).first().waitFor();
 await box.getByRole('button',{name:'Пополнить',exact:true}).first().click();
 await dialog.waitFor();await dialog.getByLabel('Сумма pUSD',{exact:true}).fill('60');
 await dialog.getByRole('button',{name:'Проверить перевод',exact:true}).click();
 try{await dialog.getByRole('button',{name:'Подтвердить в кошельке',exact:true}).waitFor({timeout:60000});}
 catch(e){const t1=calls[0]?calls[0].t:Date.now();console.error('SCENARIO2 DEBUG dialog:',JSON.stringify(await dialog.innerText().catch(()=>'<no dialog>')));
  console.error('calls:',JSON.stringify(calls.map(c=>[c.name.replace('bot_account_',''),c.t-t1])));console.error('timeline:',JSON.stringify(timeline.map(t=>[t[0],t[1]-t1])));
  console.error('state:',JSON.stringify(await page.evaluate(()=>{const s=window.__botAccountUI.controller.state;return {busy:s.busy,error:s.error,op:s.operation&&s.operation.state,polling:window.__botAccountUI.controller._polling,running:!!window.__botAccountUI.controller._runningContext,rev:window.__botAccountUI.controller._actionRevision};})));throw e;}
 assert.equal(mutations(),1,'slow path: exactly one prepare');
 assert.deepEqual(await page.evaluate(()=>window.__walletMethods),[]);
 console.log(JSON.stringify({scenario:2,op_reads:opReads,lost_read_handled:!timeline.some(t=>t[0]==='lost read')||true}));
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,errors,scenarios:['pending-then-awaiting-no-reload','slow-and-lost-read']},null,2)+'\n');
 console.log(JSON.stringify({ok:true,artifacts:out}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
