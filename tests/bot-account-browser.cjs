// Offline browser acceptance. Every network request is intercepted; no live wallet/RPC/provider calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=path.resolve(__dirname,'..'),out=path.resolve(process.env.UI_ARTIFACT_DIR||path.join(repo,'artifacts/ui'));
const owner='0x'+'1'.repeat(40),funding='0x'+'2'.repeat(40),botOwner='0x'+'3'.repeat(40),bot='0x'+'4'.repeat(40);
const account={account_id:'11111111-1111-4111-8111-111111111111',state:'READY',version:3,verified_user_signer:owner,funding_wallet:funding,bot_owner_address:botOwner,bot_deposit_wallet:bot,chain_id:137,collateral:'0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb',policy:{version:2,enabled:false,max_stake_bps:700,max_open:10,sports:['mlb']},balance:{confirmed_units:'100000000',reserved_units:'20000000',available_units:'80000000',position_value_units:'18000000',realized_pnl_units:'-1000000',checked_at:new Date().toISOString()},execution_region:{country:'KZ',blocked:false,checked_at:new Date().toISOString()},runtime_ready:true,last_checked_at:new Date().toISOString()};
let mode='NOT_CREATED',operation=null,geoBlocked=true;const calls=[],errors=[];
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
  if(url.hostname==='polymarket.com'&&url.pathname==='/api/geoblock')return route.fulfill({status:200,body:JSON.stringify({blocked:geoBlocked,country:geoBlocked?'PL':'KZ'}),contentType:'application/json',headers:{'access-control-allow-origin':'*'}});
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
   else if(name==='app_version')result=JSON.parse(fs.readFileSync(path.join(__dirname,'../aisports/version.json'),'utf8')).build;
   else result={};
  }else if(url.hostname==='gqlfnhlrpteqfdfyhavl.supabase.co' && url.pathname.endsWith('/app_assets')){
   const selected=(sport,entry_id,match,side='home',commence='2026-09-26T01:41:00Z')=>({sport,entry_id,match,side,commence,session_date:'2026-09-25',selection:side,odds:1.8,real_stake:0});
   const bets=[selected('mlb','m','Arizona Diamondbacks @ San Diego Padres','away'),selected('soccer','s','A vs B'),
     selected('tennis','t','C vs D'),selected('khl','k','E vs F'),selected('nfl','n','G vs H')];
   result=[{content:{mode:'PAPER_ONLY',real_stake:0,session:{date:'2026-09-26',bets:0,bets_list:[]},
     history:[{date:'2026-09-25',bets:5,bets_list:bets}],bets}}];
  }else if(url.pathname.endsWith('/app_assets'))result=[{content:{schema_version:1,mode:'PAPER_ONLY',real_stake:0,session:{date:'2026-09-23',bets:0,bets_list:[]},history:[],sports:{},bets:[],paper_forecasts:[],personal_real_bets:[{PRIVATE_PUBLIC_LEAK:true}],bot_account:{bot_deposit_wallet:'PUBLIC_LEAK'}}}];
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
 assert.equal(await page.evaluate(()=>botAccountController.eligibility()),false,'blocked device cannot enable through an allowed server');
 geoBlocked=false;
 assert.equal(await page.evaluate(()=>botAccountController.eligibility()),true,'both device and server must allow trading');
 await box.evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+scrollY-24));await page.screenshot({path:path.join(out,'06-account-mobile-viewport.png')});
 assert.match(await box.innerText(),/80 pUSD/);assert.doesNotMatch(await page.locator('body').innerText(),/PUBLIC_LEAK/);
 await box.getByText('Адреса кошельков',{exact:true}).click();
 assert.equal(await box.getByRole('button',{name:'Копировать адрес AISports',exact:true}).getAttribute('title'),bot);
 await box.getByRole('button',{name:'Копировать адрес AISports',exact:true}).click();assert.equal(await page.evaluate(()=>window.__clipboardValue),bot);
 assert.doesNotMatch(await box.innerText(),/0x[0-9a-f]{40}| · v2/);assert.match(await box.innerText(),/Ключ счёта AISports хранит сервис/);assert.equal(await box.locator('[data-primary=true]').count(),1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile overflow');
 const beforeWithdraw=calls.filter(c=>c.name==='bot_account_prepare_transfer').length,profileHeight=await box.evaluate(el=>el.getBoundingClientRect().height);
 await box.getByRole('button',{name:'Вывести',exact:true}).click();
 const withdraw=page.getByRole('dialog',{name:'Вывести'});await withdraw.waitFor();
 assert.match(await withdraw.innerText(),/Свободно: 80 pUSD/i);
 assert.equal(await box.evaluate(el=>el.getBoundingClientRect().height),profileHeight,'withdrawal must not expand the profile');
 await withdraw.locator('.ba-transfer-close').click();
 assert.equal(await page.getByRole('dialog',{name:'Вывести'}).count(),0);
 assert.equal(calls.filter(c=>c.name==='bot_account_prepare_transfer').length,beforeWithdraw,'opening and closing withdrawal cannot prepare a transfer');
 await box.getByRole('button',{name:'Пополнить',exact:true}).click();const transfer=page.getByRole('dialog',{name:'Пополнить'});await transfer.waitFor();
 assert.equal(await box.locator('.ba-transfer-input').count(),0);
 await transfer.getByLabel('Сумма pUSD',{exact:true}).fill('2.5');await transfer.getByRole('button',{name:'Проверить перевод',exact:true}).click();
 await transfer.getByRole('button',{name:'Подтвердить в кошельке',exact:true}).waitFor();await transfer.getByText('Перевод готов к подтверждению',{exact:false}).waitFor();
 assert.equal(await transfer.locator('[data-primary=true]').count(),1);assert.match(await transfer.innerText(),new RegExp(bot,'i'));assert.match(await transfer.innerText(),new RegExp(funding,'i'));
 await page.screenshot({path:path.join(out,'05-review-funding.png'),fullPage:true});
 await transfer.getByRole('button',{name:'Подтвердить в кошельке',exact:true}).click();
 await transfer.getByText('Отправлено — ожидаем подтверждения',{exact:false}).first().waitFor();
 assert.equal(calls.filter(c=>c.name==='bot_account_submit_transfer').length,1);assert.equal((await page.evaluate(()=>window.__walletMethods)).filter(m=>m==='eth_signTypedData_v4').length,1);
 await transfer.locator('.ba-transfer-close').click();
 await box.getByRole('button',{name:'Обновить',exact:true}).click();await box.getByText('Пополнение · Подтверждено',{exact:true}).first().waitFor();
 // v144: дашборд показывает кошелёк автоставок зелёным (адрес счёта AISports + свободный остаток), адрес копируется
 await page.locator('[data-tab="dash"]').click();const aw=page.locator('#autoWallet');await aw.waitFor({timeout:15000});
 await page.waitForFunction(()=>/0x4444…4444/.test(document.getElementById('autoWallet').textContent),null,{timeout:15000});
 const awText=await aw.evaluate(e=>e.textContent);assert.match(awText,/Автоставки · выключены/);assert.match(awText,/80 pUSD/);
 const first=page.locator('#topCards .card').first();const firstText=await first.evaluate(e=>e.textContent);
 assert.match(firstText,/Торговый счёт AISports/,'trading account is the main card');assert.match(firstText,/80 pUSD/);assert.match(firstText,/зарезервировано 20/);
 assert.match(firstText,/Кошелёк Polymarket \(просмотр\)/,'view wallet demoted to a line');
 const cards=await page.locator('#topCards .card').allTextContents();assert.match(cards[1],/Доля прибыльных расчётов/);assert.match(cards[1],/расчётов ещё не было/);assert.match(cards[2],/Прибыль автоставок за всё время/);assert.match(cards[2],/−1 pUSD/);assert.match(cards[3],/0 pUSD/);
 const partial=await page.evaluate(()=>tradingAccountStats({account:botAccountController.state.account,historyLoaded:true,history:Array.from({length:200},(_,i)=>({kind:'TRADE',state:'CONFIRMED',created_at:new Date(Date.now()-i*1000).toISOString()}))}));
 assert.equal(partial.settled,null,'200-row history cannot be presented as all-time W/L');assert.equal(partial.pnl24,null,'200 recent operations cannot prove the full 24-hour result');
 assert.equal(await aw.evaluate(e=>getComputedStyle(e).color),'rgb(34, 197, 94)','green font');
 await aw.locator('.aw-addr').click();assert.equal(await page.evaluate(()=>window.__clipboardValue),bot);
 await page.evaluate(()=>{botAccountController.state.account.policy.enabled=true;botAccountController.state.account.runtime_ready=false;botAccountController.render(botAccountController.state);});
 assert.match(await aw.innerText(),/Автоставки · приостановлены/i,'enabled policy with a stopped runtime cannot look active');
 await page.screenshot({path:path.join(out,'07-dash-auto-wallet.png'),fullPage:false});
 await page.locator('[data-tab="me"]').click();
 // The public strategy feed must never be mistaken for a personal trade. A confirmed
 // account operation appears in Bets; an unresolved order stays visibly unresolved.
 operation={operation_id:'33333333-3333-4333-8333-333333333333',kind:'TRADE',state:'CONFIRMED',
   fixture_id:'2026-09-26T01:41:00Z|arizona diamondbacks@san diego padres',
   match:'Arizona Diamondbacks — San Diego Padres',side:'away',average_price:'0.55',
   created_at:'2026-09-26T01:15:00Z'};
 await page.evaluate(()=>botAccountController.refresh());
 await page.locator('[data-tab="stats"]').click();
 await page.waitForFunction(()=>document.getElementById('bets').textContent.includes('Arizona Diamondbacks'));
 assert.match(await page.locator('#bets').innerText(),/Автоставка поставлена/i);
 assert.match(await page.locator('#bets').innerText(),/Футбол|КХЛ|НФЛ/,'selected sports are visible');
 assert.equal((await page.locator('#bets').innerText()).split('Arizona Diamondbacks @ San Diego Padres').length-1,1,'matched trade appears once');
 assert.doesNotMatch(await page.locator('#bets').innerText(),/PRIVATE_PUBLIC_LEAK/);
 await page.evaluate(()=>loadDay('2026-09-25'));
 assert.match(await page.locator('#dayBets').innerText(),/Arizona Diamondbacks/,'confirmed trade must appear on the private day');
 assert.doesNotMatch(await page.locator('#dayStat').innerText(),/0W-0L/,'filled order is not a settled result');
 operation={...operation,state:'UNKNOWN'};
 await page.evaluate(()=>botAccountController.refresh());
 await page.waitForFunction(()=>document.getElementById('bets').textContent.includes('Отправка не подтверждена'));
 assert.doesNotMatch(await page.locator('#bets').innerText(),/Автоставка поставлена/i);
 await page.locator('[data-tab="me"]').click();
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
