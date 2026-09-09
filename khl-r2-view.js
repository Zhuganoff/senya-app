/* Sandbox KHL research in the existing Games surface. No wallet/bet authority. */
(function () {
  'use strict';
  const words = {
    title:['КХЛ · исследовательские прогнозы','KHL · research forecasts','KHL · 研究预测'],
    note:['Это прогнозы, не поставленные ставки.','These are forecasts, not placed bets.','这些是预测，不是已下注投注。'],
    disabled:['Дебаты выключены: ожидается разрешение бюджета.','Debates disabled: budget approval pending.','辩论已关闭：等待预算批准。'],
    enabled:['Дебаты разрешены в исследовательском режиме.','Debates enabled for research.','研究模式辩论已启用。'],
    loading:['Загружаем прогнозы КХЛ…','Loading KHL forecasts…','正在加载 KHL 预测…'],
    error:['Не удалось обновить прогнозы. Повторим автоматически.','Could not refresh forecasts. Retrying automatically.','预测更新失败，将自动重试。'],
    missing:['Лента стратегии ещё не опубликована.','The strategy feed has not been published yet.','策略数据尚未发布。'],
    stale:['Снимок устарел — актуальность не подтверждена.','Snapshot is stale; freshness is unconfirmed.','快照已过期，无法确认实时性。'],
    empty:['На этот игровой день в ленте нет матчей.','No matches in this feed for the current game day.','当前比赛日暂无比赛。'],
    wait:['Ожидаем волну','Waiting for wave','等待分析时段'],
    noRecord:['Ожидаем запись решения','Waiting for a recorded decision','等待决策记录'],
    interrupted:['Проверка начата, итог ещё не записан','Check started; final result not yet recorded','检查已开始，结果尚未记录'],
    blocked:['Прогноз не подтверждён','Forecast not confirmed','预测未确认'],
    model:['Прогноз','Forecast','预测'],
    debate:['Дебаты','Debates','辩论'],
    complete:['завершены','completed','已完成'],
    notRun:['не запускались','not run','未运行'],
    incomplete:['нет подтверждённого заключения','no confirmed conclusion','尚无确认结论'],
    noMarket:['контракт не подтверждён на Polymarket','contract not confirmed on Polymarket','Polymarket 合约未确认'],
    correct:['прогноз верный','forecast correct','预测正确'],
    incorrect:['прогноз неверный','forecast incorrect','预测错误'],
    outcome:['Итог матча','Final score','最终比分'],
    more:['Нажми для подробностей','Tap for details','点击查看详情'],
    winner:['Победа','Win','获胜'],
    overtime:['с ОТ и буллитами','including OT and shootouts','含加时和点球'],
    reg:['60 минут','60 minutes','60 分钟'],
    handicap:['Фора','Handicap','让分'],
    total:['Тотал','Total','总进球'],
    over:['больше','over','大于'],
    under:['меньше','under','小于'],
    period:['период','period','节'],
    updated:['Обновлено','Updated','更新于'],
    off:['Стратегия приостановлена','Strategy paused','策略已暂停'],
    paperMode:['Бумажный режим: R2 открывает виртуальные позиции в общем кошельке песочницы. Это не реальные деньги.','Paper mode: R2 opens virtual positions in the shared sandbox wallet. Not real money.','模拟模式：R2 在沙盒共享钱包中开立虚拟仓位。非真实资金。'],
    budgetPaused:['Дебаты приостановлены: лимит расходов','Debates paused: spending limit reached','辩论已暂停：达到支出上限'],
    providerPaused:['Дебаты приостановлены: провайдер отклонил запрос','Debates paused: provider rejected the request','辩论已暂停：服务商拒绝了请求'],
    llmOn:['Живые дебаты включены','Live debates enabled','实时辩论已启用'],
    paperOpened:['Бумажная позиция открыта','Paper position opened','已开立模拟仓位'],
    paperExisting:['Бумажная позиция уже была открыта','Paper position already open','模拟仓位已存在'],
    paperRefused:['Ставка не открыта','No bet opened','未开立投注'],
    paperNotAttempted:['Ставка не рассматривалась','Bet not considered','未考虑投注'],
    stake:['стейк','stake','注额'],
    budget:['Бюджет дебатов','Debate budget','辩论预算'],
    invalid:['Настройки стратегии не подтверждены','Strategy configuration unconfirmed','策略配置未确认']
  };
  const tr=(key,lang)=>words[key]?.[lang==='en'?1:lang==='zh'?2:0] || key;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const when=(value,lang)=>new Date(value).toLocaleTimeString(lang==='en'?'en-GB':lang==='zh'?'zh-CN':'ru-RU',{hour:'2-digit',minute:'2-digit'});
  const safeTime=v=>typeof v==='string' && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
  function valid(feed){
    const modeOk = (feed && feed.schema_version===1 && feed.mode==='RESEARCH_ONLY' && feed.open_allowed===false)
      || (feed && feed.schema_version===2 && ((feed.mode==='RESEARCH_ONLY' && feed.open_allowed===false) || (feed.mode==='PAPER_PRIMARY' && feed.open_allowed===true && feed.real_stake===0)));
    return !!feed && modeOk && feed.sport==='khl' && safeTime(feed.generated_at) && Array.isArray(feed.games) && feed.games.length<=80
      && feed.games.every(g=>Number.isSafeInteger(g.game_id) && g.game_id>0 && typeof g.home==='string' && g.home.length<=90
        && typeof g.away==='string' && g.away.length<=90 && safeTime(g.commence) && Array.isArray(g.waves) && g.waves.length<=2
        && g.waves.every(w=>w && typeof w==='object' && ['T60','T30'].includes(w.stage) && typeof w.status==='string'));
  }
  function label(c,g,lang){
    if(!c || typeof c.probability!=='number' || !Number.isFinite(c.probability) || c.probability<0 || c.probability>1) return '—';
    const team=c.side==='home'?g.home:c.side==='away'?g.away:'';
    let value='';
    if(c.family==='winner' && team && c.market_basis==='FULL_GAME_OT_SHOOTOUT') value=`${tr('winner',lang)} ${team} (${tr('overtime',lang)})`;
    else if(c.family==='handicap' && team && [1.5,-1.5].includes(c.line) && c.market_basis==='REGULATION_60_MIN') value=`${tr('handicap',lang)} ${team} ${c.line>0?'+':''}${c.line} (${tr('reg',lang)})`;
    else if(['total','period_total'].includes(c.family) && ['over','under'].includes(c.side)
      && (c.family==='total' && c.line===5.5 && c.market_basis==='REGULATION_60_MIN'
        || c.family==='period_total' && c.line===1.5 && [1,2,3].includes(c.period) && c.market_basis===`PERIOD_${c.period}`))
      value=`${tr('total',lang)} ${tr(c.side,lang)} ${c.line} · ${c.family==='total'?tr('reg',lang):c.period+' '+tr('period',lang)}`;
    return value ? `${value} · ${(100*c.probability).toFixed(1)}%` : '—';
  }
  function status(w,lang){
    if(w.status==='WAITING_WAVE') return `${tr('wait',lang)}${safeTime(w.due_at)?' '+when(w.due_at,lang):''}`;
    if(w.status==='NO_RECORDED_WAVE') return tr('noRecord',lang);
    if(w.status==='STARTED_WITHOUT_RESULT') return tr('interrupted',lang);
    if(w.status!=='SHADOW_RECORDED') return tr('blocked',lang);
    return `${tr('debate',lang)}: ${['COMPLETE','MARKET_UNSUPPORTED'].includes(w.debate_status)?tr('complete',lang):w.debate_status==='LLM_DISABLED'?tr('notRun',lang):tr('incomplete',lang)}`;
  }
  function waveHtml(w,g,lang){
    let html=`<div class="section">${esc(w.stage)} · ${esc(status(w,lang))}</div>`;
    for(const branch of ['core','debate']){
      const c=w[branch+'_choice']; if(!c) continue;
      html+=`<div class="sel">${esc(tr(branch==='core'?'model':'debate',lang))}: ${esc(label(c,g,lang))}</div>`;
      if(!c.market_supported) html+=`<div class="sel">${esc(tr('noMarket',lang))}</div>`;
      const result=w.result?.[branch];
      if(['CORRECT','INCORRECT'].includes(result)) html+=`<div class="sel ${result==='CORRECT'?'pos':'neg'}">${esc(tr(result==='CORRECT'?'correct':'incorrect',lang))}</div>`;
    }
    const po=w.paper_open;
    if(po && typeof po==='object' && ['OPENED','EXISTING','REFUSED','NOT_ATTEMPTED'].includes(po.status) && po.real_stake!==undefined ? po.real_stake===0 : true){
      if(po.status==='OPENED'||po.status==='EXISTING'){
        const team=po.side==='home'?g.home:po.side==='away'?g.away:'';
        const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
        html+=`<div class="sel pos">${esc(tr(po.status==='OPENED'?'paperOpened':'paperExisting',lang))}: ${esc(team)}${num(po.odds_net)!==null?' · '+num(po.odds_net).toFixed(2):''}${num(po.stake_usd_paper)!==null?' · '+esc(tr('stake',lang))+' $'+num(po.stake_usd_paper).toFixed(2):''} · PAPER</div>`;
      } else {
        html+=`<div class="sel">${esc(tr(po.status==='REFUSED'?'paperRefused':'paperNotAttempted',lang))}${po.reason?': '+esc(String(po.reason).slice(0,60)):''}</div>`;
      }
    }
    if(Array.isArray(w.score)&&w.score.length===2&&w.score.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=50)) html+=`<div class="sel">${esc(tr('outcome',lang))}: ${w.score.join(':')}</div>`;
    return html;
  }
  function gamesToday(feed,now){
    const begin=new Date(now);begin.setUTCMinutes(0,0,0);if(begin.getUTCHours()<6)begin.setUTCDate(begin.getUTCDate()-1);begin.setUTCHours(6);
    return feed.games.filter(g=>Date.parse(g.commence)>=+begin&&Date.parse(g.commence)<+begin+86400000);
  }
  function render(feed,{lang='ru',now=Date.now(),error=false}={}){
    if(!valid(feed)) return `<div class="loading">${esc(tr(error?'error':'loading',lang))}</div>`;
    let html=`<div class="section">${esc(tr('title',lang))}</div><div class="sel">${esc(tr(feed.mode==='PAPER_PRIMARY'?'paperMode':'note',lang))}</div>`;
    const llm=feed.llm_status;
    html+=`<div class="sel">${esc(tr(feed.activation==='OFF'?'off':feed.activation==='INVALID'?'invalid':llm==='BUDGET_PAUSED'?'budgetPaused':llm==='PROVIDER_PAUSED'?'providerPaused':(llm==='ENABLED'||llm==='ENABLED_RESEARCH')?(feed.mode==='PAPER_PRIMARY'?'llmOn':'enabled'):'disabled',lang))}</div>`;
    if(feed.budget && typeof feed.budget==='object' && Number.isFinite(feed.budget.cap_usd) && Number.isFinite(feed.budget.reserved_usd)) html+=`<div class="sel">${esc(tr('budget',lang))}: $${feed.budget.reserved_usd.toFixed(2)} / $${feed.budget.cap_usd.toFixed(2)}</div>`;
    if(error) html+=`<div class="loading">${esc(tr('error',lang))}</div>`;
    if(now-Date.parse(feed.generated_at)>900000 || Date.parse(feed.generated_at)>now+30000) html+=`<div class="loading">${esc(tr('stale',lang))}</div>`;
    html+=`<div class="sel">${esc(tr('updated',lang))}: ${esc(when(feed.generated_at,lang))}</div>`;
    const games=gamesToday(feed,now);
    if(!games.length) return html+`<div class="loading">${esc(tr('empty',lang))}</div>`;
    for(const g of games){
      const waves=g.waves.filter(w=>['T60','T30'].includes(w.stage));
      const active=[...waves].reverse().find(w=>w.status!=='WAITING_WAVE') || waves[0];
      const selected=active?.debate_choice || active?.core_choice;
      html+=`<div class="bet" data-r2="${esc(g.game_id+'|'+g.commence)}" role="button" tabindex="0"><div class="res">🏒</div><div class="m"><div class="match">${esc(g.home)} — ${esc(g.away)}</div><div class="sel">${esc(selected?label(selected,g,lang):status(active||{},lang))}</div><div class="sel">${esc(tr('more',lang))}</div></div><div class="odds">${esc(when(g.commence,lang))}</div></div>`;
    }
    return html;
  }
  const api={valid,label,status,render,gamesToday,waveHtml};
  if(typeof module!=='undefined'&&module.exports){module.exports=api;return;}
  // Both the profile and origin must match; copying this script into aisports does nothing.
  if(typeof APP_PROFILE==='undefined'||APP_PROFILE!=='main'||typeof SB==='undefined'||SB!=='https://gqlfnhlrpteqfdfyhavl.supabase.co/rest/v1')return;
  let feed=null,error=false,pending=false,last=0,seq=0,timer=null;
  const lang=()=>typeof LANG==='string'?LANG:'ru';
  const baseRender=renderSched;
  // Keep the normal schedule, including its prices and error states. Research
  // is an additional set of rows in the same existing list, never its fallback.
  function draw(){baseRender();const box=document.getElementById('schedList');if(box&&__schedSport==='khl')box.insertAdjacentHTML('beforeend',render(feed,{lang:lang(),error}));}
  async function load(){
    if(pending||Date.now()-last<30000)return;
    pending=true;last=Date.now();const version=++seq,controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const r=await fetch(SB+'/app_assets?select=content&name=eq.khl_r2_feed&limit=1',{headers:H,cache:'no-store',signal:controller.signal});
      if(!r.ok)throw Error('FEED_UNAVAILABLE');const rows=await r.json();
      if(!Array.isArray(rows)||rows.length!==1)throw Error('FEED_MISSING');
      const next=typeof rows[0].content==='string'?JSON.parse(rows[0].content):rows[0].content;
      if(!valid(next))throw Error('FEED_INVALID');if(version!==seq)return;
      feed=next;error=false;
      const chip=document.querySelector('#schedChips [data-sp="khl"]');
      if(chip&&gamesToday(feed,Date.now()).length)chip.classList.remove('off');
    }catch(_){if(version===seq)error=true;}
    finally{clearTimeout(timeout);pending=false;if(__schedSport==='khl')draw();}
  }
  renderSched=function(){if(__schedSport==='khl'){draw();load();}else baseRender();};
  function show(target){
    if(!valid(feed))return;const g=feed.games.find(g=>g.game_id+'|'+g.commence===target.dataset.r2);if(!g)return;
    document.getElementById('msBody').innerHTML=`<div class="k">${esc(g.home)} — ${esc(g.away)}</div><div class="sel">${esc(tr('note',lang()))}</div>`+g.waves.filter(w=>['T60','T30'].includes(w.stage)).map(w=>waveHtml(w,g,lang())).join('');
    document.getElementById('msov').style.display='flex';
  }
  document.addEventListener('click',e=>{const target=e.target.closest?.('[data-r2]');if(target)show(target);});
  document.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.matches?.('[data-r2]')){e.preventDefault();show(e.target);}});
  const startTimer=()=>{clearInterval(timer);timer=setInterval(()=>{if(!document.hidden&&__schedSport==='khl'&&document.getElementById('pane-sched')?.style.display!=='none')load();},30000);};
  startTimer();
  window.addEventListener('pageshow',startTimer);
  window.addEventListener('pagehide',()=>clearInterval(timer));
})();
