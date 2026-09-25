// Offline browser stand (owner 25.09: «висит на ГОТОВ К ПОДТВЕРЖДЕНИЮ, QR не появляется»). While the transfer <dialog> is modal,
// the MetaMask pairing card must be ABOVE it (top layer), show a QR canvas and its button must be clickable. SDK is stubbed to emit a pairing URI.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const repo=path.resolve(__dirname,'..');const out=path.resolve(process.env.UI_ARTIFACT_DIR||path.join(repo,'artifacts/ui-pairing'));fs.mkdirSync(out,{recursive:true});
const owner='0x'+'1'.repeat(40),funding='0x'+'2'.repeat(40),botOwner='0x'+'3'.repeat(40),bot='0x'+'4'.repeat(40),PUSD='0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb';
const opId='55555555-5555-4555-8555-555555555555';const now=()=>new Date().toISOString();
const acc={account_id:'11111111-1111-4111-8111-111111111111',state:'READY',version:3,verified_user_signer:owner,funding_wallet:funding,bot_owner_address:botOwner,bot_deposit_wallet:bot,chain_id:137,collateral:PUSD,policy:{version:2,enabled:false,max_stake_bps:1000,max_open:10,sports:['mlb']},balance:{confirmed_units:'12000000',reserved_units:'0',available_units:'12000000',checked_at:now()},runtime_ready:true,last_checked_at:now(),sources:[{source_kind:'POLYMARKET',address:funding,balance_units:'60554481',held_units:'60000000',available_units:'554481',owner_ok:true,block:1,checked_at:now(),fresh:true},{source_kind:'METAMASK',address:owner,balance_units:'0',held_units:'0',available_units:'0',pol_wei:'0',owner_ok:true,block:1,checked_at:now(),fresh:true}]};
const expires=new Date(Date.now()+600000).toISOString();
const op={operation_id:opId,kind:'FUNDING',state:'AWAITING_SIGNATURE',phase:'PREPARE',amount_units:'60000000',fee_units:'0',source_kind:'POLYMARKET',source_address:funding,created_at:now(),intent:{account_id:acc.account_id,operation_id:opId,kind:'FUNDING',chain_id:137,token:PUSD,source:funding,source_kind:'POLYMARKET',recipient:bot,amount_units:'60000000',verified_user_signer:owner,nonce:opId,expires_at:expires},challenge:{signer:owner,typed_data:{types:{Call:[{name:'target',type:'address'},{name:'value',type:'uint256'},{name:'data',type:'bytes'}],Batch:[{name:'wallet',type:'address'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'},{name:'calls',type:'Call[]'}]},domain:{name:'DepositWallet',version:'1',chainId:137,verifyingContract:funding},primaryType:'Batch',message:{wallet:funding,nonce:'1',deadline:String(Math.floor(Date.parse(expires)/1000)),calls:[{target:PUSD,value:'0',data:'0xa9059cbb'+bot.slice(2).padStart(64,'0')+BigInt('60000000').toString(16).padStart(64,'0')}]}}}};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||chromium.executablePath()});
 try{
  const context=await browser.newContext({viewport:{width:390,height:900}});
  await context.routeWebSocket(/.*/,ws=>ws.close());
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());
   if(url.hostname==='aisports.test'){const f=path.resolve(repo,'.'+decodeURIComponent(url.pathname));if(f.startsWith(repo+path.sep)&&fs.existsSync(f)&&fs.statSync(f).isFile())return route.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.html')?'text/html':f.endsWith('.js')?'application/javascript':'application/octet-stream'});}
   if(req.resourceType()==='script')return route.fulfill({body:'',contentType:'application/javascript'});
   let result=[];
   if(url.pathname.includes('/rpc/')){const name=url.pathname.split('/').pop();
    if(name==='bot_account_get')result={api_version:1,status:'OK',account:acc};else if(name==='bot_account_history')result={api_version:1,status:'OK',operations:[op]};
    else if(name==='bot_account_operation')result={api_version:1,status:'OK',account:acc,operation:op};else if(name==='wallet_link_status')result={state:'OWNED',signer:owner,trading_account:funding};
    else if(name==='get_wallet_view')result={input_address:owner,resolved_address:funding,profile_name:'x'};else if(name==='get_profile_v2')result={tg_id:111,username:'fixture',is_paid:true};
    else if(name==='app_version')result=JSON.parse(fs.readFileSync(path.join(repo,'aisports/version.json'),'utf8')).build;else result={};}
   else if(url.pathname.endsWith('/app_assets'))result=[{content:{schema_version:1,session:{date:'2026-09-25',bets:0,bets_list:[]},history:[],sports:{},bets:[],paper_forecasts:[]}}];
   else if(url.pathname==='/value')result=[{value:100}];else result={jsonrpc:'2.0',id:1,result:'0x89'};
   return route.fulfill({status:200,body:JSON.stringify(result),contentType:'application/json',headers:{'access-control-allow-origin':'*'}});});
  await context.addInitScript(()=>{sessionStorage.setItem('senya_lang_reload','1');
   window.Telegram={WebApp:{initData:'FIXTURE_A_NOT_REAL_AUTH',initDataUnsafe:{user:{id:111,first_name:'П',language_code:'ru'}},ready(){},expand(){},onEvent(){},offEvent(){},setHeaderColor(){},setBackgroundColor(){},BackButton:{show(){},hide(){},onClick(){},offClick(){}},HapticFeedback:{impactOccurred(){},notificationOccurred(){}},themeParams:{}}};
   // no injected wallet: the page must go through SDK pairing (QR); we stub the SDK to emit a pairing URI and wait
   window.AISportsMetaMaskConnect={createEVMClient:async o=>({connect:async()=>{o.eventHandlers.displayUri('metamask://connect/mwp?p=stub&c=stub');await new Promise(()=>{});},getProvider:()=>null})};
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://aisports.test/aisports/index.html');await page.locator('[data-tab="me"]').click();
  const box=page.locator('#botAccountBox');await box.getByRole('button',{name:/Открыть|Подробнее|К переводу/}).first().waitFor({timeout:15000}).catch(()=>{});
  // open the transfer dialog for the awaiting operation
  const opener=box.locator('.ba-transfer-status button').first();await opener.waitFor({timeout:15000});await opener.click();
  const dialog=page.locator('dialog.ba-transfer-dialog');await dialog.waitFor();
  const modal=await dialog.evaluate(d=>d.matches(':modal'));
  await dialog.getByRole('button',{name:'Подтвердить в кошельке',exact:true}).click();
  await page.waitForTimeout(1500);
  const pair=page.locator('dialog.mm-pair-dialog');
  const exists=await pair.count(), visible=exists?await pair.isVisible():false;
  const topAt=await page.evaluate(()=>{const c=document.querySelector('.mm-pair-card');if(!c)return null;const r=c.getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return e?(e.className||e.tagName)+' inDialog='+!!e.closest('dialog.ba-transfer-dialog')+' inPair='+!!e.closest('dialog.mm-pair-dialog'):null;});
  let clickable='n/a';try{await page.locator('.mm-pair-card button.btn').click({timeout:2000});clickable='yes';}catch(e){clickable='NO: '+String(e.message).split('\n')[0].slice(0,120);}
  const qr=await page.locator('.mm-pair-card canvas.mm-pair-qr').count();
  const pairModal=exists?await pair.evaluate(d=>d.matches(':modal')):false;
  await page.screenshot({path:path.join(out,'pairing-over-transfer.png')});
  const report={dialog_is_modal:modal,pairing_dialog_modal:pairModal,pairing_visible:visible,qr_canvas:qr,element_at_card_center:topAt,pairing_button_clickable:clickable,errors};
  console.log(JSON.stringify(report));
  assert.equal(modal,true);assert.equal(pairModal,true,'pairing card must be a modal dialog in the top layer');
  assert.equal(qr,1,'QR canvas rendered');assert.equal(clickable,'yes','pairing button must be clickable above the transfer dialog');
  assert.ok(String(topAt).includes('inDialog=false'),'element at card center must not belong to the transfer dialog');
  // closing the pairing card returns to the (still open) transfer dialog
  await page.locator('.mm-pair-close').click();await page.waitForTimeout(300);
  assert.equal(await pair.count(),0);assert.equal(await dialog.evaluate(d=>d.open),true);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,...report},null,1));console.log(JSON.stringify({ok:true,artifacts:out}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
