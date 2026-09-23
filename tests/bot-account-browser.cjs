// Offline browser acceptance. Every network request is intercepted; no live wallet/RPC/provider calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=path.resolve(__dirname,'..'),out=path.resolve(process.env.UI_ARTIFACT_DIR||path.join(repo,'artifacts/ui'));
const owner='0x'+'1'.repeat(40),funding='0x'+'2'.repeat(40),botOwner='0x'+'3'.repeat(40),bot='0x'+'4'.repeat(40);
const account={account_id:'11111111-1111-4111-8111-111111111111',state:'READY',version:3,verified_user_signer:owner,funding_wallet:funding,bot_owner_address:botOwner,bot_deposit_wallet:bot,chain_id:137,collateral:'0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb',policy:{version:2,enabled:false,max_stake_bps:700,max_open:10,sports:['mlb']},balance:{confirmed_units:'100000000',reserved_units:'20000000',available_units:'80000000',position_value_units:'18000000',realized_pnl_units:'-1000000',checked_at:new Date().toISOString()},runtime_ready:true,last_checked_at:new Date().toISOString()};
let mode='NOT_CREATED',operation=null;const calls=[],errors=[];
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||chromium.executablePath()});
 try{
 const context=await browser.newContext({viewport:{width:430,height:932},deviceScaleFactor:1,reducedMotion:'reduce'});
 await context.routeWebSocket(/.*/,ws=>ws.close());
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.hostname==='aisports.test'){
   const filename=path.resolve(repo,'.'+decodeURIComponent(url.pathname));
   if(filename.startsWith(repo+path.sep)&&fs.existsSync(filename)&&fs.statSync(filename).isFile())return route.fulfill({body:fs.readFileSync(filename),contentType:filename.endsWith('.html')?'text/html':filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':'application/octet-stream'});
  }
  if(req.resourceType()==='script')return route.fulfill({body:'',contentType:'application/javascript'});
  let result=[];
  if(url.pathname.includes('/rpc/')){
   const name=url.pathname.split('/').pop(),body=req.postDataJSON();calls.push({name,body});
   if(name==='bot_account_get')result={api_version:1,status:mode,account:mode==='OK'?account:null};
   else if(name==='bot_account_history')result={api_version:1,status:'OK',operations:operation?[operation]:[]};
   else if(name==='bot_account_operation'){if(operation?.state==='SUBMITTED')operation.state='CONFIRMED';result={api_version:1,status:'OK',operation};}
   else if(name==='bot_account_create'){mode='OK';result={api_version:1,status:'OK',account};}
   else if(name==='bot_account_prepare_transfer'){
    const id='22222222-2222-4222-8222-222222222222',expires=new Date(Date.now()+300000).toISOString(),amount='2500000';
    operation={operation_id:id,kind:body.p_kind,state:'AWAITING_SIGNATURE',amount_units:amount,fee_units:'0',intent:{account_id:account.account_id,operation_id:id,kind:body.p_kind,chain_id:137,token:account.collateral,source:funding,recipient:bot,amount_units:amount,verified_user_signer:owner,nonce:id,expires_at:expires},challenge:{signer:owner,typed_data:{types:{Call:[{name:'target',type:'address'},{name:'value',type:'uint256'},{name:'data',type:'bytes'}],Batch:[{name:'wallet',type:'address'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'},{name:'calls',type:'Call[]'}]},domain:{name:'DepositWallet',version:'1',chainId:137,verifyingContract:funding},primaryType:'Batch',message:{wallet:funding,nonce:'1',deadline:String(Math.floor(Date.parse(expires)/1000)),calls:[{target:account.collateral,value:'0',data:'0xa9059cbb'+bot.slice(2).padStart(64,'0')+BigInt(amount).toString(16).padStart(64,'0')}]}}}};
    result={api_version:1,status:'OK',account,operation};
   }
   else if(name==='bot_account_submit_transfer'){operation.state='SUBMITTED';operation.challenge=null;result={api_version:1,status:'OK',account,operation};}
   else if(name==='wallet_link_status')result={state:'OWNED',signer:owner,trading_account:funding};
   else if(name==='get_wallet_view')result={input_address:owner,resolved_address:funding,profile_name:'Local fixture'};
   else if(name==='get_profile_v2')result={tg_id:111,username:'fixture',is_paid:true};
   else if(name==='app_version')result='v128';
   else result={};
  }else if(url.pathname.endsWith('/app_assets'))result=[{content:{schema_version:1,session:{date:'2026-09-23',bets:0,bets_list:[]},history:[],sports:{},bets:[],paper_forecasts:[],personal_real_bets:[{PRIVATE_PUBLIC_LEAK:true}],bot_account:{bot_deposit_wallet:'PUBLIC_LEAK'}}}];
  else if(url.hostname==='polygon-bor-rpc.publicnode.com')result={jsonrpc:'2.0',id:1,result:'0x89'};
  else if(url.pathname==='/value')result=[{value:100}];
  return route.fulfill({status:200,body:JSON.stringify(result),contentType:'application/json',headers:{'access-control-allow-origin':'*'}});
 });
 await context.addInitScript(()=>{
  sessionStorage.setItem('senya_lang_reload','1');
  window.Telegram={WebApp:{initData:'FIXTURE_A_NOT_REAL_AUTH',initDataUnsafe:{user:{id:111,first_name:'Проверка',language_code:'ru'}},ready(){},expand(){},onEvent(){},offEvent(){},setHeaderColor(){},setBackgroundColor(){},BackButton:{show(){},hide(){},onClick(){},offClick(){}},HapticFeedback:{impactOccurred(){},notificationOccurred(){}},themeParams:{}}};
  window.__walletMethods=[];window.ethereum={isMetaMask:true,request:async p=>{window.__walletMethods.push(p.method);if(p.method==='eth_chainId')return '0x89';if(p.method==='eth_signTypedData_v4')return '0x'+'a'.repeat(130);if(['eth_accounts','eth_requestAccounts'].includes(p.method))return ['0x'+'1'.repeat(40)];throw Error('Unexpected wallet method');}};
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.__clipboardValue=value;}}});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://aisports.test/aisports/index.html');await page.locator('[data-tab="me"]').click();
 const box=page.locator('#botAccountBox');await box.getByRole('button',{name:'Создать торговый счёт',exact:true}).waitFor();
 assert.equal(await box.locator('[data-primary=true]').count(),1);
 await box.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'01-create-mobile.png'),fullPage:true});
 await box.locator('input[type=checkbox]').check();await box.getByRole('button',{name:'Создать торговый счёт',exact:true}).click();
 await box.getByRole('button',{name:'Пополнить',exact:true}).waitFor();await box.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'02-ready-mobile.png'),fullPage:true});
 await box.evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+scrollY-24));await page.screenshot({path:path.join(out,'06-account-mobile-viewport.png')});
 assert.match(await box.innerText(),/80 pUSD/);assert.doesNotMatch(await page.locator('body').innerText(),/PUBLIC_LEAK/);
 assert.equal(await box.getByRole('button',{name:'Копировать адрес AISports',exact:true}).getAttribute('title'),bot);
 await box.getByRole('button',{name:'Копировать адрес AISports',exact:true}).click();assert.equal(await page.evaluate(()=>window.__clipboardValue),bot);
 assert.doesNotMatch(await box.innerText(),/0x[0-9a-f]{40}| · v2/);assert.match(await box.innerText(),/Ключ счёта AISports хранит сервис/);assert.equal(await box.locator('[data-primary=true]').count(),1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile overflow');
 await box.getByRole('button',{name:'Пополнить',exact:true}).click();await box.getByLabel('Сумма pUSD',{exact:true}).fill('2.5');await box.getByRole('button',{name:'Проверить перевод',exact:true}).click();
 await box.getByRole('button',{name:'Подтвердить в кошельке',exact:true}).waitFor();await box.getByText('Перевод готов к подтверждению',{exact:false}).waitFor();
 assert.equal(await box.locator('[data-primary=true]').count(),1);assert.doesNotMatch(await box.innerText(),/0x[0-9a-f]{40}/);
 await page.screenshot({path:path.join(out,'05-review-funding.png'),fullPage:true});
 await box.locator('input[type=checkbox]').last().check();await box.getByRole('button',{name:'Подтвердить в кошельке',exact:true}).click();
 await box.getByText('Отправлено — ожидаем подтверждения',{exact:false}).first().waitFor();
 assert.equal(calls.filter(c=>c.name==='bot_account_submit_transfer').length,1);assert.equal((await page.evaluate(()=>window.__walletMethods)).filter(m=>m==='eth_signTypedData_v4').length,1);
 await box.getByRole('button',{name:'Обновить',exact:true}).click();await box.getByText('Пополнение · Подтверждено',{exact:true}).first().waitFor();
 await page.setViewportSize({width:1280,height:960});await page.screenshot({path:path.join(out,'03-ready-desktop.png'),fullPage:true});
 await page.evaluate(()=>{Telegram.WebApp.initData='FIXTURE_B_NOT_REAL_AUTH';Telegram.WebApp.initDataUnsafe.user={id:222,first_name:'Второй',language_code:'ru'};});mode='NOT_CONNECTED';
 await page.evaluate(()=>initMe());await box.getByRole('button',{name:'Подключить MetaMask',exact:true}).waitFor();
 assert.equal(await box.getByRole('button',{name:'Копировать адрес AISports',exact:true}).count(),0);assert.doesNotMatch(await box.innerText(),new RegExp(bot,'i'));await page.screenshot({path:path.join(out,'04-second-user.png'),fullPage:true});
 await page.addScriptTag({url:'https://aisports.test/aisports/vendor/metamask-connect-2.1.1.js'});
 const sdk=await page.evaluate(async()=>{
  const m=window.AISportsMetaMaskConnect;
  if(typeof m?.createEVMClient!=='function')throw Error('SDK export missing');
  const client=await m.createEVMClient({dapp:{name:'AI Sports offline QA',url:location.origin},api:{supportedNetworks:{'0x89':'https://polygon-bor-rpc.publicnode.com'}},analytics:{enabled:false},debug:false,skipAutoAnnounce:true,ui:{headless:false,preferExtension:false}});
  return {factory:typeof m.createEVMClient,providerRequest:typeof client.getProvider().request};
 });
 assert.equal(sdk.providerRequest,'function');assert.deepEqual(errors,[]);
 assert.ok(calls.filter(x=>x.name.startsWith('bot_account_')).every(x=>['FIXTURE_A_NOT_REAL_AUTH','FIXTURE_B_NOT_REAL_AUTH'].includes(x.body.p_init_data)));
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({offline:true,sdk,errors,rpcCalls:calls.length,scenarios:['create-consent','ready-account','two-wallet-labels','mobile-width','desktop-layout','prepare-funding','review-and-sign-exact-transfer','submit-and-poll-confirmation','session-A-to-B-cleared','public-feed-not-personal','actual-bundled-SDK-load'],physicalWallet:'NOT_OBSERVED'},null,2)+'\n');
 console.log(JSON.stringify({ok:true,artifacts:out,sdk,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
