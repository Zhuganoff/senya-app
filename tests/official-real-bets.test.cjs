const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const html = fs.readFileSync(require("path").resolve(__dirname, "../aisports/index.html"), "utf8");
function segment(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a);
  if (a < 0 || b <= a) throw new Error("missing " + start);
  return html.slice(a, b);
}
const I18N = {
  autoBetPlaced: ["Автоставка поставлена"], reconciling: ["сверяется"],
  awaitingRedeem: ["Выиграла · ожидает погашения"],
  payoutReceived: ["Выплата получена"],
  paperWin: ["прогноз зашёл"], paperLoss: ["прогноз не зашёл"], selectedNoTrade: ["Выбрано · реальной ставки нет"],
  win: ["выигрыш"], lose: ["проигрыш"], voided: ["возврат"], suspended: ["приостановлена"], inPlay: ["в игре"],
  ofBank: ["%"], autoBetsPlaced: ["автоставок поставлено"], baStaked: ["поставлено"], secLast: ["Последние"],
  noPersonalBets: ["нет"], selectedPicks: ["выбрано"], personalOnly: ["вне отбора"],
  realTradeConfirmed: ["Сделка подтверждена"], priceUnavailable: ["Цена недоступна"],
  fillPrice: ["Цена сделки"], forecastOddsLabel: ["коэффициент прогноза"], exactStake: ["Сумма"],
  payoutAmount: ["Выплата"], costAmount: ["Потрачено"], resultAmount: ["Результат"],
  taAvailable: ["Доступно"], taReserved: ["удержано"], taTotal: ["на счёте"],
  taHistoryLimited: ["История ещё загружается или неполная"], taNoBets: ["погашенных покупок ещё не было"],
  taPurchaseHint: ["по погашенным покупкам"], taPushes: ["без прибыли и убытка"],
  tradingAccount: ["Торговый счёт"],
  sportMlb: ["Бейсбол MLB"], sportSoccer: ["Футбол"], originPaper: ["прогноз стратегии · PAPER"],
  stakedLabel: ["Поставлено"], profitLabel: ["Прибыль"], lossLabel: ["Убыток"], zeroResultLabel: ["Результат"],
  inSettlement: ["В расчёте"], reconcilingState: ["Сверяется"], feeIncludedLine: ["Комиссия Polymarket: {x} · включена"], feeTiny: ["<0,01 USD"],
  listSyncing: ["Личная история обновляется…"], listUpdateFailed: ["Не удалось обновить личную историю"], dataAsOf: ["данные от {t}"]
};
const context = {
  APP_PROFILE: "aisports", OFFICIAL_PERSONAL_LISTS: true,
  ICO_BY_SPORT: {mlb: "⚾ ", soccer: "⚽ "},
  ICO_SPORT: {},
  LANG: "ru",
  window: {},
  Date, BigInt, Number, String, Set, Map, Object, Array,
  personalStore: null,
  session: "owner",
  sessionKey: () => context.session,
  t: (k) => (I18N[k] || [k])[0],
  v3Esc: (v) => String(v == null ? "" : v).replace(/[&<>"]/g, "_"),
  share: () => 0, oddsOf: (r) => r.best_odds ?? r.odds ?? null,
  gameTime: () => "", msFor: () => null, pusdTxt: (n) => Number(n).toFixed(2),
  fmtDay: (d) => d || "", dowOf: () => "", plBets: (n) => "ставок",
  HIDE_MONEY: true,
  resIco: () => "·", rowCls: () => ""
};
context.personalBets = () => (context.window.__privateRealBets && context.window.__privateRealBets.session === context.sessionKey())
  ? context.window.__privateRealBets.rows : [];
vm.createContext(context);
const src = [
  segment("function selectedPicks(feed){", "// v106 (блок C"),
  segment("function feedBetToRow(b){", "function feedSession(feed, d){"),
  segment("function isStale(r){", "function oddsOf(r){"),
  segment("function betRow(r){", "// ─────────── счёт и статистика"),
  segment("function readableMatch(raw){", "function feedSession(feed, d){"),
  segment("function personalTradeRows(){", "let __betsGen"),
  segment("function claimPnlTxt(n){", "function rerenderDashFromAccount")
].join("\n");
vm.runInContext(src, context);
const fixture = "2026-10-15T17:00:00Z|tampa bay rays@cleveland guardians";
const pick = {sport:"mlb", entry_id:"paper", side:"home", match:"Tampa Bay Rays @ Cleveland Guardians",
  selection:"Cleveland Guardians", commence:"2026-10-15T17:00:00+00:00", session_date:"2026-10-15", real_stake:0, result:1,
  stake_usd_paper:33.45, pnl_usd_paper:27.1, odds:1.81022};
const feed = {mode:"PAPER_ONLY", real_stake:0, bets:[pick], session:{bets_list:[pick], date:"2026-10-15"}, history:[]};
const trade = {kind:"TRADE", state:"CONFIRMED", operation_id:"op-guardians",
  fixture_id:fixture, side:"home", match:"Tampa Bay Rays — Cleveland Guardians",
  average_price:"0.54", amount_units:"3342600", created_at:"2026-10-15T16:32:05Z", sport:"mlb"};
const unknown = Object.assign({}, trade, {operation_id:"op-unknown", state:"UNKNOWN", amount_units:"1000000"});
function load(ops) {
  const parsed = context.personalTradesFromHistory({historyLoaded:true, history:ops});
  context.window.__privateRealBets = {session: context.sessionKey(), rows: parsed.rows, loaded: true, truncated: parsed.truncated};
  return parsed;
}
function face(htmlRow){ return String(htmlRow).split("pick-more")[0].replace(/aria-label="[^"]*"/g, ""); }
test("owner sees one Cleveland row for the selection day, without paper profit", () => {
  load([trade]);
  const rows = context.daySelectionRows(feed, "2026-10-15");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]._cash, true);
  assert.equal(rows[0].pnl, null);
  assert.equal(rows[0].selection, "Cleveland Guardians");
  const htmlRow = context.dayPickRow(rows[0]);
  // v167 (§9.2): до погашения — «В расчёте»; затраты не доказаны исполнением (нет fill_notional_units) → v173 (владелец 18.10): исход известен → «Выиграла · ожидает погашения», сумма — резерв
  assert.match(face(htmlRow), /Выиграла · ожидает погашения/);
  assert.match(face(htmlRow), /✓/);
  assert.doesNotMatch(htmlRow, /Автоставка поставлена|Ставка поставлена|Поставлено|коэффициент прогноза|Цена сделки|pick-more|Выплата/);   // v173: резерв и исход допустимы
  assert.doesNotMatch(htmlRow, /27\.10|33\.45|2\.85|6\.19|@—|1\.81022/);
});
test("empty public selection still shows that day's confirmed trade once", () => {
  load([trade]);
  const empty = {mode:"PAPER_ONLY", real_stake:0, bets:[], session:{bets_list:[], date:"2026-10-15"}, history:[]};
  const rows = context.daySelectionRows(empty, "2026-10-15");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pnl, null);
  const htmlRow = context.dayPickRow(rows[0]);
  assert.match(face(htmlRow), /В расчёте/);
  assert.doesNotMatch(htmlRow, /ожидает погашения|2\.85|33\.45|@—|Поставлено|Сделка подтверждена/);
});
test("another session cannot read the purchase", () => {
  load([trade]);
  context.session = "other";
  assert.equal(context.personalTradeRows().length, 0);
  assert.equal(context.daySelectionRows(feed, "2026-10-15").length, 1);
  assert.equal(context.daySelectionRows(feed, "2026-10-15")[0]._cash, false);
  context.session = "owner";
  assert.equal(context.personalTradeRows().length, 1);
});
test("refresh does not duplicate the operation", () => {
  load([trade, trade, Object.assign({}, trade)]);
  assert.equal(context.personalTradeRows().length, 1);
  assert.equal(context.daySelectionRows(feed, "2026-10-15").length, 1);
});
test("UNKNOWN is reconciling and not a placed bet", () => {
  load([unknown]);
  const row = context.historyCashRow(context.personalTradeRows()[0]);
  assert.match(row, /Сверяется/);
  assert.doesNotMatch(row, /Автоставка поставлена|✓|USD|pick-more/);
  assert.match(row, /pickline pending/);
});
test("paper win is not added to the day total", () => {
  load([trade]);
  const rows = context.daySelectionRows(feed, "2026-10-15");
  const block = context.dayPickHead("2026-10-15", rows) + rows.map(context.dayPickRow).join("");
  assert.equal(context.dayStakeUnits(rows), 3.3426);
  assert.doesNotMatch(block, /27\.|2\.85|W-|7[,.]02/);
});
test("confirmed claim on the same fixture is the only pnl", () => {
  load([trade, {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-1", fixture_id:fixture, side:"home", realized_pnl_units:"2847400"}]);
  const row = context.daySelectionRows(feed, "2026-10-15")[0];
  assert.equal(row.claim_confirmed, true);
  assert.equal(row.result, 1);
  assert.ok(Math.abs(row.pnl - 2.8474) < 1e-9);
  const htmlRow = context.dayPickRow(row);
  // прежний CLAIM без разбивки по долям: чистый результат известен, затраты — нет → только «Прибыль»
  assert.match(face(htmlRow), /Прибыль \+2,85 USD/);
  assert.doesNotMatch(htmlRow, /ожидает погашения|pUSD|Выплата|2\.847400|Поставлено/);
});
test("real Cleveland history renders awaiting redemption without paper profit", () => {
  const real = {kind:"TRADE", state:"CONFIRMED", operation_id:"91cebdd2-033d-485b-a449-e03fe034bd36",
    fixture_id:fixture, side:"home", match:"Cleveland Guardians — Tampa Bay Rays",
    average_price:null, amount_units:"3420112", created_at:"2026-10-15T16:31:22.342556+00:00", sport:"mlb",
    order_id:null, result:"FILLED", realized_pnl_units:null};
  load([real]);
  const shown = context.daySelectionRows(feed, "2026-10-15")[0];
  assert.equal(shown.stake, 3.420112);          // внутреннее поле: резерв операции
  assert.equal(shown.staked, null);             // на карточке резерв НЕ подставляется вместо затрат
  assert.equal(shown.pnl, null);
  const htmlRow = context.dayPickRow(shown);
  assert.match(face(htmlRow), /Выиграла · ожидает погашения/);
  assert.match(face(htmlRow), /✓/);
  assert.doesNotMatch(htmlRow, /3,420112|Первоначальный|Цена недоступна|Поставлено/);
  assert.doesNotMatch(face(htmlRow), /1\.81022|@—/);
  assert.doesNotMatch(htmlRow, /33\.45|27\.10|2\.85|6\.19|\+2/);
});
test("one market payout is split by redeemed shares and Cleveland is not the gross mark", () => {
  const cleveland = {kind:"TRADE", state:"CONFIRMED", operation_id:"91cebdd2-033d-485b-a449-e03fe034bd36",
    fixture_id:fixture, side:"home", match:"Cleveland Guardians — Tampa Bay Rays",
    amount_units:"3420112", created_at:"2026-10-15T16:31:22Z", sport:"mlb"};
  const claim = {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-cleveland", realized_pnl_units:"2770530",
    intent:{resolution:{trades:[{operation_id:cleveland.operation_id, cost_units:"3419470", shares_units:"6190000"}]}}};
  const shown = load([cleveland, claim]).rows[0];
  assert.equal(shown.pnl, 2.77053);
  const htmlRow = context.dayPickRow(context.daySelectionRows(feed, "2026-10-15")[0]);
  assert.match(face(htmlRow), /Поставлено 3,42 USD/);
  assert.match(face(htmlRow), /Прибыль \+2,77 USD/);
  assert.doesNotMatch(htmlRow, /2\.85|pUSD|Выплата|2\.770530|6,19/);
  const first = {kind:"TRADE", state:"CONFIRMED", operation_id:"buy-1", fixture_id:fixture, side:"home",
    amount_units:"1000000", created_at:"2026-10-15T16:00:00Z", sport:"mlb"};
  const second = Object.assign({}, first, {operation_id:"buy-2", amount_units:"3000000"});
  // п.3.2: A — 2 доли за 1 USD, B — 4 доли за 3 USD, выплата рынка 6 USD → выплаты 2 и 4 (по долям), результат +1 и +1
  const shared = {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-shared", realized_pnl_units:"2000000",
    intent:{resolution:{trades:[{operation_id:"buy-1", cost_units:"1000000", shares_units:"2000000"}, {operation_id:"buy-2", cost_units:"3000000", shares_units:"4000000"}]}}};
  const rows = load([first, second, shared]).rows;
  assert.equal(rows.find(r => r.operation_id === "buy-1").payout, 2);
  assert.equal(rows.find(r => r.operation_id === "buy-2").payout, 4);
  assert.equal(rows.find(r => r.operation_id === "buy-1").pnl, 1);
  assert.equal(rows.find(r => r.operation_id === "buy-2").pnl, 1);
  const merged = context.daySelectionRows(feed, "2026-10-15");
  assert.equal(merged.length, 1);
  assert.equal(merged[0].pnl, 2);
  assert.equal(merged[0].stake, 4);           // подтверждённые затраты обеих покупок
  // без shares_units разбивки нет: итог не выдумывается по себестоимости
  const noShares = {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-noshares", realized_pnl_units:"2000000",
    intent:{resolution:{trades:[{operation_id:"buy-1", cost_units:"1000000"}, {operation_id:"buy-2", cost_units:"3000000"}]}}};
  assert.equal(context.claimShares(noShares), null);
  // округление: 1 единица выплаты на 3 доли — сумма частей равна выплате до единицы
  const odd = {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-odd", realized_pnl_units:"-2999999",
    intent:{resolution:{trades:[{operation_id:"o1", cost_units:"1000000", shares_units:"1"}, {operation_id:"o2", cost_units:"1000000", shares_units:"1"}, {operation_id:"o3", cost_units:"1000000", shares_units:"1"}]}}};
  const parts = context.claimShares(odd);
  assert.equal(parts.reduce((a, p) => a + p.payout, 0n), 1n);
  assert.equal(parts[2].payout, 1n);
});
test("October 15 shows only Cleveland and Royals stay in the September history", () => {
  const cleveland = {kind:"TRADE", state:"CONFIRMED", operation_id:"91cebdd2-033d-485b-a449-e03fe034bd36",
    fixture_id:fixture, side:"home", match:"Tampa Bay Rays @ Cleveland Guardians",
    average_price:null, amount_units:"3420112", created_at:"2026-10-15T16:31:22Z", sport:"mlb"};
  const royals = {kind:"TRADE", state:"CONFIRMED", operation_id:"royals-26-09-stand",
    fixture_id:"2026-09-26T23:10:00Z|cleveland guardians@kansas city royals", side:"home",
    match:"Cleveland Guardians @ Kansas City Royals", amount_units:"3600000",
    created_at:"2026-09-26T22:43:05Z", sport:"mlb"};
  const royalsClaim = {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-royals", realized_pnl_units:"-3597750",
    intent:{resolution:{trades:[{operation_id:royals.operation_id, cost_units:"3597750", shares_units:"6600000"}]}}};
  load([cleveland, royals, royalsClaim]);
  const day = context.daySelectionRows(feed, "2026-10-15");
  assert.equal(day.length, 1);
  assert.match(day[0].match, /Cleveland/);
  const block = context.dayPickHead("2026-10-15", day) + day.map(context.dayPickRow).join("");
  assert.doesNotMatch(block, /Royals|Kansas|7[,.]020112|7[,.]02/);
  assert.match(block, /В расчёте|Выиграла · ожидает погашения/);
  assert.match(block, /⚾/);
  assert.equal(block.split("<article").length - 1, 1);
  const hist = context.personalHistoryHtml(context.personalTradeRows());
  assert.match(hist, /data-day="2026-10-15"/);
  assert.match(hist, /data-day="2026-09-26"/);
  assert.match(hist, /Kansas City Royals/);
  assert.match(hist, /pickline lose/);
  assert.match(hist, /×/);
  assert.match(hist, /Поставлено 3,60 USD/);
  assert.match(hist, /Убыток −3,60 USD/);
  assert.doesNotMatch(hist, /−3\.597750|Выплата/);
  const royalsHtml = hist.slice(hist.indexOf("2026-09-26"));
  assert.doesNotMatch(royalsHtml, /ожидает погашения|Выплата получена/);
  assert.doesNotMatch(hist, /pUSD|@—/);
});
test("soccer stays a forecast and six rows keep an icon without an odds column", () => {
  const soccer = {sport:"soccer", entry_id:"s", side:"home", match:"Alpha vs Beta", selection:"Alpha",
    session_date:"2026-10-15", real_stake:0, odds:2.1, result:1};
  const sfeed = {mode:"PAPER_ONLY", real_stake:0, bets:[pick, soccer], session:{date:"2026-10-15", bets_list:[pick, soccer]}, history:[]};
  load([trade]);
  const rows = context.daySelectionRows(sfeed, "2026-10-15");
  const ball = rows.find(r => r.sport === "soccer");
  assert.equal(ball._cash, false);
  const ballHtml = context.dayPickRow(ball);
  assert.match(ballHtml, /⚽/);
  // v172 (владелец 18.10): рассчитанный прогноз получает отметку исхода, денег и «Автоставки» по-прежнему нет
  assert.match(ballHtml, /pickline win/); assert.match(ballHtml, /class="mark"[^>]*>✓/); assert.match(ballHtml, /Прогноз · Выигрыш/);
  assert.doesNotMatch(ballHtml, /USD|Автоставка/);
  const six = Array.from({length:6}, (_, i) => context.dayPickRow({
    sport: i % 2 ? "soccer" : "mlb", _ico: i % 2 ? "⚽" : "⚾", match:"Long Match Name Number " + i,
    selection:"Side " + i, session_date:"2026-10-15", _cash:false, result:null, forecast_odds:null
  })).join("");
  assert.equal(six.split("⚾").length - 1, 3);
  assert.equal(six.split("⚽").length - 1, 3);
  assert.doesNotMatch(six, /class="odds"|@—/);
});
test("fixture and side still gate the green match flag", () => {
  load([trade]);
  const away = Object.assign({}, pick, {side:"away", entry_id:"away"});
  assert.equal(context.forecastRow(away)._realTrade, false);
  assert.equal(context.forecastRow(pick)._realTrade, true);
});
test("bottom navigation labels stay in place", () => {
  assert.match(html, /data-i18n="navDash">Дашборд/);
  assert.match(html, /data-i18n="navSched">Игры/);
  assert.match(html, /data-i18n="navStats">Ставки/);
  assert.match(html, /data-i18n="navEarn">Рефералы/);
  assert.match(html, /data-i18n="navMe">Профиль/);
});
test("dashboard selection history labels the forecast price and skips personal money", () => {
  const row = context.selectionHistoryRow(context.selectionDisplayRows(feed)[0]);
  assert.match(row, /1\.81022/);
  assert.match(row, /коэффициент прогноза/);
  assert.match(row, /Cleveland Guardians/);
  assert.match(row, /⚾/);
  assert.doesNotMatch(row, /USD|33\.45|pUSD|@—/);
});
function accountState(history, balance, extra){
  return Object.assign({historyLoaded:true, history, account:{bot_deposit_wallet:"0x" + "11".repeat(20), balance:Object.assign({
    available_units:"71172780", reserved_units:"0", confirmed_units:"71172780", realized_pnl_units:"-827220"
  }, balance || {})}}, extra || {});
}
// v164: денежный итог суток приходит с сервера (bot_account_money) — полнота окна не выводится из страницы истории
const money = (units, count, complete, missing) => ({status:"OK", hours:24, settled_window_units:String(units), settled_window_count:count,
  window_complete:complete !== false, claims_without_settled_at:missing || 0, realized_all_units:"-827220", claims_total:2});
test("confirmed claims show payout and cost apart from the result", () => {
  const cleveland = {kind:"TRADE", state:"CONFIRMED", operation_id:"91cebdd2-033d-485b-a449-e03fe034bd36",
    fixture_id:fixture, side:"home", match:"Tampa Bay Rays @ Cleveland Guardians",
    average_price:null, odds:1.81022, max_price:"0.5524", amount_units:"3420112",
    created_at:"2026-10-15T16:31:22Z", sport:"mlb"};
  const clevelandClaim = {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-cleveland", realized_pnl_units:"2770530",
    intent:{resolution:{trades:[{operation_id:cleveland.operation_id, cost_units:"3419470", shares_units:"6190000"}]}}};
  const royals = {kind:"TRADE", state:"CONFIRMED", operation_id:"royals-26-09-stand",
    fixture_id:"2026-09-26T23:10:00Z|cleveland guardians@kansas city royals", side:"home",
    match:"Cleveland Guardians @ Kansas City Royals", average_price:null, odds:1.9, amount_units:"3600000",
    created_at:"2026-09-26T22:43:05Z", sport:"mlb"};
  const royalsClaim = {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-royals", realized_pnl_units:"-3597750",
    intent:{resolution:{trades:[{operation_id:royals.operation_id, cost_units:"3597750", shares_units:"6600000"}]}}};
  load([cleveland, royals, clevelandClaim, royalsClaim]);
  const day = context.daySelectionRows(feed, "2026-10-15");
  assert.equal(day.length, 1);
  assert.equal(day[0].pnl, 2.77053);
  assert.equal(day[0].payout, 6.19);
  assert.equal(day[0].cost, 3.41947);
  assert.equal(day[0].fill_price, null);
  const htmlRow = context.dayPickRow(day[0]);
  // v167: лицо карточки — только «Поставлено» и чистый результат; выплата/потрачено/цена/коэффициент в карточке не показываются
  assert.match(face(htmlRow), /Поставлено 3,42 USD/);
  assert.match(face(htmlRow), /Прибыль \+2,77 USD/);
  assert.doesNotMatch(htmlRow, /Выплата|Потрачено|Результат \+|Цена|коэффициент|6,19|1\.81022|1\.85185|ожидает погашения|pick-more/);
  const hist = context.personalHistoryRows(feed);
  const royal = hist.find(r => r.operation_id === royals.operation_id);
  assert.equal(royal.pnl, -3.59775);
  assert.equal(royal.payout, 0);
  assert.equal(royal.session_date, "2026-09-26");
  const royalHtml = context.historyCashRow(royal);
  assert.match(face(royalHtml), /Поставлено 3,60 USD/);
  assert.match(face(royalHtml), /Убыток −3,60 USD/);
  assert.doesNotMatch(royalHtml, /ожидает погашения|Выплата|0,000000|−3\.597750|1\.81022/);
  assert.ok(Math.abs(day[0].pnl + royal.pnl + 0.82722) < 1e-9);
});
test("a paper coefficient is not used as the fill price", () => {
  const priced = Object.assign({}, trade, {average_price:"0.54", odds:1.81022, max_price:"0.55"});
  load([priced]);
  const row = context.daySelectionRows(feed, "2026-10-15")[0];
  assert.equal(row.fill_price, 0.54);          // данные остаются в учёте/диагностике
  const htmlRow = context.dayPickRow(row);
  assert.doesNotMatch(htmlRow, /0,54|1\.81022|1\.85185|Цена/);   // v167: карточка цену и коэффициент не показывает
});
test("one redemption of several buys counts each buy, and a short history has no percent", () => {
  const first = {kind:"TRADE", state:"CONFIRMED", operation_id:"buy-1", fixture_id:fixture, side:"home",
    amount_units:"1000000", created_at:"2026-10-15T16:00:00Z"};
  const second = Object.assign({}, first, {operation_id:"buy-2", amount_units:"3000000"});
  const loss = {kind:"TRADE", state:"CONFIRMED", operation_id:"buy-loss",
    fixture_id:"2026-09-26T23:10:00Z|other@club", side:"home", amount_units:"1000000", created_at:"2026-09-26T22:00:00Z"};
  const shared = {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-shared", realized_pnl_units:"4000000",
    created_at:"2026-10-16T12:00:00Z", updated_at:"2026-10-16T12:00:00Z", intent:{resolution:{trades:[
      {operation_id:"buy-1", cost_units:"1000000", shares_units:"2000000"}, {operation_id:"buy-2", cost_units:"3000000", shares_units:"4000000"}]}}};
  const lost = {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-loss", realized_pnl_units:"-1000000",
    created_at:"2026-10-16T12:00:00Z", updated_at:"2026-10-16T12:00:00Z", intent:{resolution:{trades:[{operation_id:"buy-loss", cost_units:"1000000", shares_units:"1800000"}]}}};
  const stats = context.tradingAccountStats(accountState([first, second, loss, shared, lost]));
  assert.equal(stats.unit, "purchases");
  assert.equal(stats.wins, 2);
  assert.equal(stats.losses, 1);
  assert.equal(stats.settled, 3);
  const text = context.winrateText(stats);
  assert.equal(text.rate, "67%");
  assert.match(text.detail, /по погашенным покупкам/);
  const partial = Array.from({length:199}, (_, i) => ({kind:"FUNDING", state:"CONFIRMED", operation_id:"f" + i, created_at:"2026-01-01T00:00:00Z"}));
  partial.push(shared);
  const cut = context.winrateText(context.tradingAccountStats(accountState(partial)));
  assert.equal(cut.rate, "—");
  assert.doesNotMatch(cut.rate + cut.detail, /%/);
  assert.match(cut.detail, /неполная/);
});
test("the main figure is the available balance and names a non-zero hold", () => {
  const open = context.accountCardHtml({available_units:"71172780", reserved_units:"0", confirmed_units:"71172780"});
  assert.match(open, /Доступно/);
  assert.match(open, /<div class="v">71,17 USD<\/div>/);
  assert.match(open, /<div class="d">71,172780 USD<\/div>/);
  assert.doesNotMatch(open, /удержано 0 USD/);
  assert.doesNotMatch(open, /Polymarket|Автоставки|0x/);
  const held = context.accountCardHtml({available_units:"66172780", reserved_units:"5000000", confirmed_units:"71172780"});
  assert.match(held, /<div class="v">66,17 USD<\/div>/);
  assert.match(held, /удержано 5 USD/);
  assert.match(held, /на счёте 71,17278 USD/);
  assert.doesNotMatch(held, /<div class="v">71,17 USD<\/div>/);
  assert.equal(context.moneyUnits("71172780", {decimals:2}), "71,17 USD");
  assert.equal(context.moneyUnits("71175000", {decimals:2}), "71,18 USD");
  assert.equal(context.moneyUnits("-827220", {decimals:2}), "−0,83 USD");
  const ledger = context.moneyUnits("-827220", {exact:true, sign:true});
  assert.equal(ledger, "−0,827220 USD");
});
test("midnight UTC and the winter boundary follow the saved game day", () => {
  assert.equal(context.sessionDateFromStart("2026-10-16T00:15:00Z"), "2026-10-15");
  assert.equal(context.sessionDateFromStart("2026-11-01T05:30:00Z"), "2026-10-31");
  assert.equal(context.sessionDateFromStart("2026-11-01T06:00:00Z"), "2026-11-01");
  assert.equal(context.sessionDateFromStart("2026-03-08T05:30:00Z"), "2026-03-07");
  const nightPick = {sport:"mlb", entry_id:"night", side:"home", match:"Away Team @ Home Team",
    selection:"Home Team", commence:"2026-11-01T05:30:00Z", session_date:"2026-11-01", real_stake:0, result:1, odds:1.5};
  const nightTrade = {kind:"TRADE", state:"CONFIRMED", operation_id:"night",
    fixture_id:"2026-11-01T05:30:00Z|away team@home team", side:"home", match:"Away Team @ Home Team",
    amount_units:"1000000", created_at:"2026-11-01T04:00:00Z", sport:"mlb"};
  const other = {kind:"TRADE", state:"CONFIRMED", operation_id:"other",
    fixture_id:"2026-10-31T18:00:00Z|other@club", side:"home", match:"Other @ Club",
    amount_units:"2000000", created_at:"2026-10-31T17:00:00Z", sport:"mlb"};
  const nfeed = {mode:"PAPER_ONLY", real_stake:0, bets:[nightPick], session:{date:"2026-11-01", bets_list:[nightPick]}, history:[]};
  load([nightTrade, other]);
  const savedDay = context.daySelectionRows(nfeed, "2026-11-01");
  assert.equal(savedDay.length, 1);
  assert.equal(savedDay[0]._cash, true);
  assert.equal(savedDay[0].session_date, "2026-11-01");
  const previous = context.daySelectionRows(nfeed, "2026-10-31");
  assert.equal(previous.length, 1);
  assert.match(previous[0].match, /Club/);
  const hist = context.personalHistoryRows(nfeed);
  assert.equal(hist.find(r => r.operation_id === "night").session_date, "2026-11-01");
  assert.equal(hist.find(r => r.operation_id === "other").session_date, "2026-10-31");
  const midPick = {sport:"mlb", entry_id:"mid", side:"home", match:"Late @ Early", selection:"Early",
    commence:"2026-10-16T00:15:00Z", session_date:"2026-10-15", real_stake:0, result:null};
  const midTrade = {kind:"TRADE", state:"CONFIRMED", operation_id:"mid",
    fixture_id:"2026-10-16T00:15:00Z|late@early", side:"home", match:"Late @ Early",
    amount_units:"1000000", created_at:"2026-10-16T00:20:00Z", sport:"mlb"};
  const mfeed = {mode:"PAPER_ONLY", real_stake:0, bets:[midPick], session:{date:"2026-10-15", bets_list:[midPick]}, history:[]};
  load([midTrade]);
  assert.equal(context.daySelectionRows(mfeed, "2026-10-15").length, 1);
  assert.equal(context.daySelectionRows(mfeed, "2026-10-15")[0]._cash, true);
  assert.equal(context.daySelectionRows(mfeed, "2026-10-16").length, 0);
});
test("UNKNOWN stays pending when the forecast already won", () => {
  load([unknown]);
  const row = context.withResolution(context.personalTradeRows(), feed)[0];
  assert.equal(row._resolution, 1);
  const htmlRow = context.historyCashRow(row);
  assert.match(htmlRow, /pickline pending/);
  assert.doesNotMatch(htmlRow, /pickline win|✓|glowbar green/);
});
// ── v161 (владелец 16.10): личные сделки на дашборде, подписи ожидания/погашений, пояс расписания ──
Object.assign(I18N, {
  histArchive: ["Архив ставок · {n}"], histCollapse: ["Свернуть архив"],
  v3Decisions: ["матчей в анализе"], v3Processed: ["обработано · {n} ожидают анализа"], ofWord: ["из"],
  schedDayNote: ["игровой день {d} (до 06:00 UTC) · время по часам устройства, {tz}"],
  awaitAnalysis: ["{k} из {n} обработано · {m} ожидают анализа. Волны проходят за 60 и 30 минут до старта."],
  noPickDay: ["Бот изучил все игры дня и не подобрал ни одной с преимуществом."],
  feedUnavailable: ["Лента отбора сейчас недоступна."], feedStale: ["Лента отбора не обновлялась {h} ч."],
  noMatchesDay: ["На этот игровой день матчей в отборе нет."],
  reservedLabel: ["Первоначальный резерв"], spentLabel: ["Потрачено"], feeLabel: ["Комиссия, уже включена"], sharesLabel: ["Доли"],
  lastSelection: ["Последний отбор"], newSelectionNotStarted: ["Новый отбор ещё не начался"], dayResult: ["Результат ставок"], allTimeResult: ["За всё время"],
  awaitingSettle: ["{n} ожидают расчёта"], noDayResult: ["подтверждённых результатов за этот день нет"], period24: ["Погашения за последние 24 часа"],
  drawSide: ["Ничья"], autoSportsLine: ["виды: {s}"], period24Incomplete: ["период неполный"], period24Unknown: ["период неизвестен: сервер не отдал денежный итог суток"], period24Short: ["погашения за 24 ч"],
  historyMoreNote: ["архив загружен частично — продолжение по кнопке"], histMore: ["Загрузить ещё"], histMoreBusy: ["загрузка…"], claimConfirmedAt: ["подтверждено"], claimTimeUnknown: ["время подтверждения в учёте не записано"], claimCreatedAt: ["задание создано"], gameDayLabel: ["игровой день"],
  restoredSnapshot: ["Снимок ленты от {t} ({m} мин назад)"], moneyMore: ["Подробнее о деньгах"], moneyLess: ["Свернуть"],
  stakeWord: ["ставка"], forecastWord: ["Прогноз"], forecastWon: ["Выигрыш"], forecastLost: ["Проигрыш"], forecastVoid: ["Возврат"], overWord: ["Больше"], underWord: ["Меньше"], oddsShort: ["кф"], reservedLabel: ["Резерв"], lostAwaitingSettle: ["Проиграла · ожидает расчёта"], awaitingRedeem: ["Выиграла · ожидает погашения"], drawSide: ["Ничья"], historyLoading: ["сверка с личной историей…"], historyLoadingLong: ["Личная история ещё загружается"],
  noRecentBets: ["За последние 24 часа ставок не было"], recentBasisSubmitted: ["по времени отправки ордера"],
  winOne: ["победа"], winFew: ["победы"], winMany: ["побед"], lossOne: ["поражение"], lossFew: ["поражения"], lossMany: ["поражений"],
  returnOne: ["возврат"], returnFew: ["возврата"], returnMany: ["возвратов"], settledOne: ["рассчитана"], settledFew: ["рассчитаны"], settledMany: ["рассчитано"],
  historyPartial: ["показаны последние 200 операций, история неполная"]
});
context.v3Num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(d) : "—"; };
function pane(id){ return html.slice(html.indexOf(`id="pane-${id}"`), html.indexOf(`<!-- /pane-${id} -->`) > 0 ? html.indexOf(`<!-- /pane-${id} -->`) : html.indexOf(`id="pane-${id}"`) + 4000); }
test("personal history moved from Games to the Dashboard markup", () => {
  const sched = html.slice(html.indexOf('id="pane-sched"'), html.indexOf('<!-- /pane-sched -->'));
  const dash = html.slice(html.indexOf('id="pane-dash"'), html.indexOf('<!-- /pane-dash -->'));
  assert.doesNotMatch(sched, /personalHistory|secPersonal/);
  assert.match(dash, /id="personalHistory"/);
  assert.match(dash, /data-i18n="secRealBets"/);
  assert.ok(dash.indexOf('id="topCards"') < dash.indexOf('id="personalHistory"'));
  assert.match(html, /Результат погашений за 24 часа/);
  assert.match(html, /taClaim24Hint/);
  assert.match(html, /\.grid \.card:first-child \.v\{font-size:clamp\([^}]*white-space:nowrap/);
});
test("the 24-hour block keeps only buys executed in the last day and the archive is always reachable", () => {
  const h = n => new Date(Date.now() - n * 3600000).toISOString();
  const mk = (i, day, submitted) => ({kind:"TRADE", state:"CONFIRMED", operation_id:"op-" + i, fixture_id:`${day}T17:00:00Z|away${i}@home${i}`,
    side:"home", match:`Away ${i} @ Home ${i}`, amount_units:"1000000", created_at:`${day}T16:00:00Z`, submitted_at:submitted, sport:"mlb"});
  // Cleveland исполнена 15.10 16:32Z — внутри суток (стенд: 20 ч назад); Royals 26.09 — вне суток, хотя погашена сегодня
  const cle = mk(1, "2026-10-15", h(20)), roy = mk(2, "2026-09-26", "2026-09-26T22:43:05Z");
  const royClaim = {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-roy", realized_pnl_units:"-3597750", created_at:h(1), updated_at:h(0),
    intent:{resolution:{trades:[{operation_id:"op-2", cost_units:"3597750", shares_units:"6600000"}]}}};
  load([cle, roy, royClaim]);
  const rows = context.personalHistoryRows(feed);
  const recent = context.recentTradeRows(rows);
  assert.equal(recent.length, 1); assert.equal(recent[0].operation_id, "op-1");
  const compact = context.personalHistoryBlockHtml(rows, false, false);
  assert.equal(compact.split("<article").length - 1, 1);
  assert.doesNotMatch(compact, /Home 2/);                       // Royals нет в сутках, несмотря на погашение сегодня
  assert.match(compact, /Архив ставок · 2/);                     // архив доступен и при двух покупках
  assert.match(compact, /по времени отправки ордера/);           // основа фильтра подписана, пока нет filled_at
  // через 25 часов после исполнения Cleveland уходит из суточного блока — остаётся только архив
  const later = context.personalHistoryBlockHtml(rows, false, false, Date.now() + 5 * 3600000);
  assert.equal(later.split("<article").length - 1, 0);
  assert.match(later, /За последние 24 часа ставок не было/);
  assert.match(later, /Архив ставок · 2/);
  // архив: обе покупки по исходным игровым дням
  const full = context.personalHistoryBlockHtml(rows, true, false);
  assert.equal(full.split("<article").length - 1, 2);
  assert.match(full, /data-day="2026-10-15"/); assert.match(full, /data-day="2026-09-26"/);
  // без времени исполнения покупка в суточный список не попадает, а в архиве есть
  const noTime = mk(3, "2026-10-16", undefined);
  load([noTime]);
  assert.equal(context.recentTradeRows(context.personalHistoryRows(feed)).length, 0);
  assert.match(context.personalHistoryBlockHtml(context.personalHistoryRows(feed), true, false), /Home 3/);
  // filled_at имеет приоритет над submitted_at
  const filled = Object.assign(mk(4, "2026-10-16", h(30)), {filled_at:h(2)});
  load([filled]);
  const r4 = context.personalHistoryRows(feed)[0];
  assert.equal(r4.exec_basis, "filled"); assert.equal(context.recentTradeRows([r4]).length, 1);
  assert.equal(context.personalHistoryBlockHtml([], false, false), "");
});
test("dashboard rows face the money result of a redeemed buy and keep the stake in the caption", () => {
  const cleveland = {kind:"TRADE", state:"CONFIRMED", operation_id:"91cebdd2-033d-485b-a449-e03fe034bd36",
    fixture_id:fixture, side:"home", match:"Tampa Bay Rays @ Cleveland Guardians", amount_units:"3420112", created_at:"2026-10-15T16:31:22Z", sport:"mlb"};
  const claim = {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-cleveland", realized_pnl_units:"2770530",
    intent:{resolution:{trades:[{operation_id:cleveland.operation_id, cost_units:"3419470", shares_units:"6190000"}]}}};
  const royals = {kind:"TRADE", state:"CONFIRMED", operation_id:"royals-26-09-stand",
    fixture_id:"2026-09-26T23:10:00Z|cleveland guardians@kansas city royals", side:"home", match:"Cleveland Guardians @ Kansas City Royals",
    amount_units:"3600000", created_at:"2026-09-26T22:43:05Z", sport:"mlb"};
  const royalsClaim = {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-royals", realized_pnl_units:"-3597750",
    intent:{resolution:{trades:[{operation_id:royals.operation_id, cost_units:"3597750", shares_units:"6600000"}]}}};
  load([cleveland, claim, royals, royalsClaim]);
  const rows = context.personalHistoryRows(feed);
  const cle = context.historyCashRow(rows.find(r => r.operation_id === cleveland.operation_id));
  // v167 (§9.2): одна короткая карточка — «Поставлено 3,42 USD · Прибыль +2,77 USD», победившая команда жирная
  assert.match(face(cle), /<b>Поставлено 3,42 USD<\/b>/);
  assert.match(face(cle), /<b class="pos">Прибыль \+2,77 USD<\/b>/);
  assert.match(face(cle), /<span class="winner">Cleveland Guardians<\/span>/);
  assert.match(face(cle), /class="pico"/);
  assert.doesNotMatch(cle, /2\.770530|class="sport"|Выплата|Потрачено|ставка 3,42|6,19|pick-more/);
  const roy = context.historyCashRow(rows.find(r => r.operation_id === royals.operation_id));
  assert.match(face(roy), /<b>Поставлено 3,60 USD<\/b>/);
  assert.match(face(roy), /<b class="neg">Убыток −3,60 USD<\/b>/);
  assert.match(roy, /pickline lose/);
  assert.doesNotMatch(roy, /Выплата|0,00/);
  // «Ставки» (отбор дня) — ТА ЖЕ карточка
  const dayRow = context.dayPickRow(context.daySelectionRows(feed, "2026-10-15")[0]);
  assert.match(face(dayRow), /Поставлено 3,42 USD/);
  assert.match(face(dayRow), /Прибыль \+2,77 USD/);
  assert.doesNotMatch(dayRow, /Потрачено|Результат \+|2\.770530/);
  // v173: не погашенная сделка — исход уже известен отбору → «Выиграла · ожидает погашения»; сумма — резерв, затраты не доказаны
  load([cleveland]);
  const open = context.historyCashRow(context.personalHistoryRows(feed)[0]);
  assert.match(face(open), /Резерв 3,42 USD<\/b> · <span class="pos">Выиграла · ожидает погашения<\/span>/);   // average_price нет → кф не показан
  assert.doesNotMatch(open, /\+2|6\.19|Поставлено|Прибыль/);
});
test("an untouched day reads as waiting for the waves, not as zero decisions", () => {
  const waiting = context.pendingAnalysisLabel({matches:0, skipped:0, scheduled:{total:5}});
  assert.equal(waiting.value, "0 из 5");
  assert.equal(waiting.label, "обработано · 5 ожидают анализа");
  const half = context.pendingAnalysisLabel({matches:2, skipped:1, scheduled:{total:5}});
  assert.equal(half.value, "2 из 5");
  assert.match(half.label, /3 ожидают/);          // п.3.1: пропуски — часть обработанных, второй раз не вычитаются
  const done = context.pendingAnalysisLabel({matches:5, skipped:0, scheduled:{total:5}});
  assert.equal(done.value, "5");
  assert.equal(done.label, "матчей в анализе");
  assert.equal(context.pendingAnalysisLabel({matches:5, skipped:2, scheduled:{total:5}}).label, "матчей в анализе");
  assert.equal(context.pendingAnalysisLabel({matches:3, skipped:2, scheduled:{total:5}}).pending, 2);
  // четыре состояния пустого дня (п.3.1)
  const now = Date.parse("2026-10-16T07:00:00Z");
  const fresh = s => ({mode:"PAPER_ONLY", real_stake:0, generated_ts:"2026-10-16T06:00:02Z", session:s, bets:[], history:[]});
  assert.match(context.dayStatusNote(fresh({matches:0, skipped:0, scheduled:{total:5}}), now), /0 из 5 обработано · 5 ожидают/);
  assert.match(context.dayStatusNote(fresh({matches:2, skipped:1, scheduled:{total:5}}), now), /2 из 5 обработано · 3 ожидают/);
  assert.match(context.dayStatusNote(fresh({matches:5, skipped:5, scheduled:{total:5}}), now), /не подобрал ни одной/);
  assert.match(context.dayStatusNote(fresh({matches:0, skipped:0, scheduled:{total:0}}), now), /матчей в отборе нет/);
  assert.match(context.dayStatusNote(null, now), /недоступна/);
  assert.match(context.dayStatusNote({mode:"PAPER_ONLY", generated_ts:"2026-10-15T20:00:00Z", session:{matches:0, scheduled:{total:5}}}, now), /не обновлялась 11 ч/);
  assert.doesNotMatch(context.dayStatusNote(null, now), /изучил все игры/);
});
test("schedule caption names the 06:00 UTC game day and the device zone", () => {
  const tz = context.deviceTzLabel(new Date("2026-10-16T22:00:00Z"));
  assert.match(tz, /^UTC[+−]\d\d:\d\d$/);
  const late = context.schedDayNoteText(new Date("2026-10-16T22:00:00Z"));
  assert.match(late, /игровой день 2026-10-16 \(до 06:00 UTC\)/);
  assert.match(late, new RegExp(tz.replace("+", "\\+")));
  const night = context.schedDayNoteText(new Date("2026-10-17T04:30:00Z"));
  assert.match(night, /2026-10-16/);
  const morning = context.schedDayNoteText(new Date("2026-10-17T06:00:00Z"));
  assert.match(morning, /2026-10-17/);
});
// ── v162 (п.3.3/3.4/4.3/4.4): период по времени денежного события, резерв против затрат, неполная история ──
test("the money period uses the confirmed settlement time only; without it the period is incomplete", () => {
  const buy = {kind:"TRADE", state:"CONFIRMED", operation_id:"buy-old", fixture_id:"2026-09-26T23:10:00Z|cleveland guardians@kansas city royals",
    side:"home", amount_units:"3600000", created_at:"2026-09-26T22:43:05Z", sport:"mlb"};
  const buyNew = Object.assign({}, buy, {operation_id:"buy-new", fixture_id:fixture, amount_units:"3420112", created_at:"2026-10-15T16:31:22Z"});
  const mk = (id, op, pnl, cost, extra) => Object.assign({kind:"CLAIM", state:"CONFIRMED", operation_id:id, realized_pnl_units:pnl,
    created_at:"2026-10-16T05:20:00Z", updated_at:new Date().toISOString(),
    intent:{resolution:{trades:[{operation_id:op, cost_units:cost, shares_units:"6190000"}]}}}, extra || {});
  // 1) сервер не отдал денежный итог (старый сервер / сбой) → период неизвестен; created_at/updated_at не подставляются
  let stats = context.tradingAccountStats(accountState([mk("c1", "buy-new", "2770530", "3419470"), mk("c2", "buy-old", "-3597750", "3597750"), buyNew, buy]));
  assert.equal(stats.pnl24, null);
  assert.equal(stats.period24Complete, false);
  assert.equal(stats.period24Known, false);
  assert.equal(context.claimMoneyTime(mk("x", "buy-new", "1", "1")), "");
  // 2) сервер: оба погашения подтверждены в цепи 16.10 05:05Z (блоки 95614536/95614550) — вместе −0,827220 за последние 24 ч
  stats = context.tradingAccountStats(accountState([mk("c1", "buy-new", "2770530", "3419470"), mk("c2", "buy-old", "-3597750", "3597750"), buyNew, buy], null, {money: money(-827220, 2, true)}));
  assert.equal(stats.pnl24, "-827220");
  assert.equal(stats.period24Complete, true);
  assert.equal(stats.pnl24Count, 2);
  // 3) сервер знает про CLAIM без доказанного времени → окно неполное, сумма не объявляется
  stats = context.tradingAccountStats(accountState([mk("c1", "buy-new", "2770530", "3419470"), mk("c2", "buy-old", "-3597750", "3597750"), buyNew, buy], null, {money: money(2770530, 1, false, 1)}));
  assert.equal(stats.pnl24, null); assert.equal(stats.period24Complete, false); assert.equal(stats.period24Known, true); assert.equal(stats.claimsWithoutTime, 1);
  // 4) контрпример владельца: первая страница — 200 свежих операций, старый CLAIM с сегодняшним расчётом в ней отсутствует;
  //    клиент НЕ объявляет полноту по created_at последней строки — сумму суток даёт только сервер
  const flood = Array.from({length: 200}, (_, i) => ({kind:"TRADE", state:"REJECTED", operation_id:"flood-" + i, created_at:new Date(Date.now() - i * 60000).toISOString()}));
  stats = context.tradingAccountStats(accountState(flood, null, {historyComplete:false, historyHasMore:true}));
  assert.equal(stats.pnl24, null); assert.equal(stats.period24Known, false); assert.equal(stats.settled, null);
  stats = context.tradingAccountStats(accountState(flood, null, {historyComplete:false, historyHasMore:true, money: money(-827220, 2, true)}));
  assert.equal(stats.pnl24, "-827220");                                           // старый CLAIM учтён сервером, хотя его нет на странице
  assert.equal(context.personalTradesFromHistory(accountState(flood, null, {historyComplete:false})).truncated, true);
  assert.equal(context.personalTradesFromHistory(accountState(flood, null, {historyComplete:true})).truncated, false);  // полнота — явный признак сервера
  assert.equal(context.personalTradesFromHistory(accountState(flood.slice(0, 3))).truncated, false);                     // старый сервер: меньше 200 строк
  // результат ИГРОВОГО ДНЯ не зависит от дня погашения: 15.10 → +2,770530; 26.09 → −3,597750
  load([mk("c1", "buy-new", "2770530", "3419470"), mk("c2", "buy-old", "-3597750", "3597750"), buyNew, buy]);
  const d15 = context.dayMoneyResult("2026-10-15", feed), d26 = context.dayMoneyResult("2026-09-26", feed), d16 = context.dayMoneyResult("2026-10-16", feed);
  assert.equal(d15.pnlUnits, "2770530"); assert.equal(d15.settled, 1); assert.equal(d15.open, 0);
  assert.equal(d26.pnlUnits, "-3597750");
  assert.equal(d16.pnlUnits, null); assert.equal(d16.trades, 0);
  const details = context.moneyDetailsHtml(feed, accountState([mk("c1", "buy-new", "2770530", "3419470"), mk("c2", "buy-old", "-3597750", "3597750"), buyNew, buy]));
  assert.match(details, /Cleveland Guardians.*игровой день 2026-10-15.*\+2\.770530 USD/);
  assert.match(details, /Kansas City Royals.*игровой день 2026-09-26.*−3\.597750 USD/);
  assert.match(details, /Результат \(2\): −0\.827220 USD/);
  assert.match(details, /период неизвестен/);
  assert.match(details, /задание создано/);
  const known = context.moneyDetailsHtml(feed, accountState([mk("c1", "buy-new", "2770530", "3419470"), mk("c2", "buy-old", "-3597750", "3597750"), buyNew, buy], null, {money: money(-827220, 2, true)}));
  assert.match(known, /Погашения за последние 24 часа: −0[.,]827220 USD \(2\)/);
  // открытая ставка без выплаты: день показывает ожидание, итог не объявляется
  load([buyNew]);
  const open = context.dayMoneyResult("2026-10-15", feed);
  assert.equal(open.pnlUnits, null); assert.equal(open.open, 1);
});
test("the card shows confirmed cost and one fee line; reserve, shares and price stay out of the card", () => {
  const cleveland = {kind:"TRADE", state:"CONFIRMED", operation_id:"91cebdd2-033d-485b-a449-e03fe034bd36",
    fixture_id:fixture, side:"home", match:"Tampa Bay Rays @ Cleveland Guardians", average_price:"0.54", fee_units:"76870",
    amount_units:"3420112", created_at:"2026-10-15T16:31:22Z", sport:"mlb"};
  const claim = {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-cleveland", realized_pnl_units:"2770530",
    intent:{resolution:{trades:[{operation_id:cleveland.operation_id, cost_units:"3419470", shares_units:"6190000"}]}}};
  const row = load([cleveland, claim]).rows[0];
  assert.equal(row.stake, 3.41947);          // подтверждённые затраты, не резерв 3,420112
  assert.equal(row.reserved, 3.420112);
  assert.equal(row.shares, 6.19);
  assert.equal(row.fill_price, 0.54);        // данные учёта остаются, на карточку не выводятся
  const htmlRow = context.dayPickRow(context.daySelectionRows(feed, "2026-10-15")[0]);
  assert.match(face(htmlRow), /Поставлено 3,42 USD/);
  assert.match(face(htmlRow), /Прибыль \+2,77 USD/);
  assert.match(htmlRow, /<button type="button" class="pickline-row"/);         // раскрытие есть — комиссия подтверждена
  assert.match(htmlRow, /pick-more" hidden><div class="pick-detail">Комиссия Polymarket: 0,08 USD · включена<\/div>/);
  assert.doesNotMatch(htmlRow, /Первоначальный резерв|Потрачено|Доли|Цена сделки|0,5524|3,420112|Сумма|Выплата|0,076870/);
  assert.equal(htmlRow.split("pick-detail").length - 1, 1);                    // ровно одна строка в раскрытии
  // без погашения: затраты не доказаны → суммы нет; с fill_notional_units+fee_units → «Поставлено» и «В расчёте»
  const open = load([cleveland]).rows[0];
  assert.equal(open.staked, undefined); assert.equal(open.cost_known, null);
  const openHtml = context.historyCashRow(open);
  assert.match(face(openHtml), /Резерв 3,42 USD<\/b> · <span>кф 1\.85<\/span> · <span>В расчёте/);   // v173: до исполнения — резерв, кф из average_price
  assert.doesNotMatch(openHtml, /Поставлено|Первоначальный/);
  const filled = load([Object.assign({}, cleveland, {fill_notional_units:"3342600"})]).rows[0];
  assert.equal(filled.cost_known, 3.41947);
  const filledHtml = context.historyCashRow(filled);
  assert.match(face(filledHtml), /Поставлено 3,42 USD/);
  assert.match(face(filledHtml), /В расчёте/);
  assert.doesNotMatch(filledHtml, /Прибыль|Убыток/);
});
test("a 200-operation history is marked partial in the archive button and gives no share", () => {
  const many = Array.from({length:200}, (_, i) => ({kind:"TRADE", state:"CONFIRMED", operation_id:"op" + i,
    fixture_id:`2026-10-${String(1 + (i % 9)).padStart(2, "0")}T17:00:00Z|a${i}@b${i}`, side:"home", match:`A${i} @ B${i}`,
    amount_units:"1000000", created_at:`2026-10-${String(1 + (i % 9)).padStart(2, "0")}T16:00:00Z`, sport:"mlb"}));
  const parsed = load(many);
  assert.equal(parsed.truncated, true);
  context.window.__privateRealBets.truncated = true;
  const rows = context.personalHistoryRows(feed);
  const compact = context.personalHistoryBlockHtml(rows, false, context.personalHistoryPartial());
  assert.match(compact, /Архив ставок · 200\+/);
  const full = context.personalHistoryBlockHtml(rows, true, true);
  assert.match(full, /история неполная/);
  assert.equal(context.winrateText(context.tradingAccountStats(accountState(many))).rate, "—");
  const few = load(many.slice(0, 5));
  assert.equal(few.truncated, false);
});
test("statistics by sport stay open with one heading, a short origin note and compact cards", () => {
  const dash = html.slice(html.indexOf('id="pane-dash"'), html.indexOf('<!-- /pane-dash -->'));
  assert.doesNotMatch(dash, /simToggle|secSimulation|showSection/);
  assert.match(dash, /data-i18n="wrBySport">Статистика по видам спорта/);
  assert.match(dash, /data-i18n="statsNote">По результатам отбора/);
  assert.match(dash, /data-i18n="secDayBets">История прогнозов/);
  assert.match(dash, /data-i18n="secRealBets">Ставки за 24 часа/);
  assert.match(dash, /<div id="simBody">/);
  assert.doesNotMatch(html, /Результаты отбора · симуляция/);
  const card = context.sportStatCardHtml("mlb", {wins:43, losses:18, returns:0, settled:61, emoji:"⚾"}, "Бейсбол MLB");
  assert.match(card, /class="pico"[^>]*>⚾/);
  assert.match(card, /scard-pct pos">70%/);
  assert.match(card, /43 победы · 18 поражений · 61 рассчитана/);
  const soccer = context.sportStatCardHtml("soccer", {wins:11, losses:7, returns:2, settled:20, emoji:"⚽"}, "Футбол");
  assert.match(soccer, /61%/); assert.match(soccer, /11 побед · 7 поражений · 2 возврата · 20 рассчитано/);
  const empty = context.sportStatCardHtml("mlb", {wins:0, losses:0, emoji:"⚾"}, "Бейсбол MLB");
  assert.match(empty, /scard-pct ">—/);
  assert.doesNotMatch(card + soccer, /PAPER|симуляц|W-/);
});
test("a forecast before the private history arrives is not declared a non-purchase", () => {
  context.window.__privateRealBets = null;            // история ещё не пришла
  assert.equal(context.personalHistoryLoading(), true);
  const row = context.dayPickRow(context.daySelectionRows(feed, "2026-10-15")[0]);
  // v167 (§9.2/9.3): в карточке нет длинных подписей сверки и нет утверждения «реальной ставки нет»; состояние — строкой списка
  assert.match(face(row), /Прогноз/);
  assert.doesNotMatch(row, /USD|сверка|Личная история|реальной ставки нет|pick-more/);
  load([]);                                           // история пришла пустой — честный прогноз
  assert.equal(context.personalHistoryLoading(), false);
  const after = context.dayPickRow(context.daySelectionRows(feed, "2026-10-15")[0]);
  assert.match(face(after), /Прогноз/);
  assert.doesNotMatch(after, /USD|Выбрано/);
});
// ── v167 (владелец 16.10, §9.2): комиссия без ложного нуля; состояния карточки ──
test("fee is summed only when every purchase of the card confirms it: [null]→hidden, [0]→0, [x,null]→hidden", () => {
  const mk = (id, fee) => ({sport:"mlb", operation_id:id, match:"Tampa Bay Rays @ Cleveland Guardians", selection:"Cleveland Guardians", side:"home",
    session_date:"2026-10-15", state:"CONFIRMED", _realTrade:true, _unknown:false, stake:1, fee, claim_confirmed:true, pnl:0.5, cost:1, payout:1.5, result:1});
  const merged = list => context.mergeDayRow(pick, list);
  assert.equal(merged([mk("a", null)]).fee, null);
  assert.equal(merged([mk("a", 0)]).fee, 0);
  assert.equal(merged([mk("a", 0.07687)]).fee, 0.07687);
  assert.equal(merged([mk("a", 0.07687), mk("b", null)]).fee, null, "одна покупка без комиссии — общая комиссия неизвестна");
  assert.equal(merged([mk("a", 0.07687), mk("b", 0.003)]).fee, 0.07987);
  assert.equal(context.cardFeeText(merged([mk("a", null)])), "");
  assert.equal(context.cardFeeText(merged([mk("a", 0)])), "Комиссия Polymarket: 0,00 USD · включена");
  assert.equal(context.cardFeeText(merged([mk("a", 0.004)])), "Комиссия Polymarket: <0,01 USD · включена");
  assert.equal(context.cardFeeText(merged([mk("a", 0.07687)])), "Комиссия Polymarket: 0,08 USD · включена");
  assert.equal(context.cardFeeText(merged([mk("a", 0.07687), mk("b", null)])), "");
  assert.equal(context.cardFeeText(Object.assign(merged([mk("a", 0.07687)]), {_cash:false})), "", "у прогноза комиссии нет");
  // раскрытия нет — нет и кнопки
  const noFee = context.dayPickRow(merged([mk("a", null)]));
  assert.doesNotMatch(noFee, /<button|pick-more|aria-expanded/);
  assert.match(noFee, /<div class="pickline-row"/);
});
test("card states: loss, zero, unsettled, unknown, forecast — no payout, no price, no odds", () => {
  const base = {sport:"mlb", match:"Tampa Bay Rays @ Cleveland Guardians", selection:"Cleveland Guardians", side:"home", session_date:"2026-10-15"};
  const loss = context.dayPickRow(Object.assign({}, base, {_cash:true, claim_confirmed:true, pnl:-3.59775, result:0, staked:3.59775, fee:0.08775}));
  assert.match(face(loss), /<b>Поставлено 3,60 USD<\/b> · <b class="neg">Убыток −3,60 USD<\/b>/);
  assert.match(loss, /×/); assert.match(loss, /pickline lose/); assert.match(loss, /Комиссия Polymarket: 0,09 USD · включена/);
  const zero = context.dayPickRow(Object.assign({}, base, {_cash:true, claim_confirmed:true, pnl:0, result:-1, staked:2}));
  assert.match(face(zero), /Поставлено 2,00 USD<\/b> · <b class="">Результат 0,00 USD/);
  assert.doesNotMatch(zero, /Прибыль|Убыток|class="mark"/);
  const open = context.dayPickRow(Object.assign({}, base, {_cash:true, claim_confirmed:false, pnl:null, staked:3.41947, _resolution:null}));
  assert.match(face(open), /Поставлено 3,42 USD<\/b> · <span>В расчёте<\/span>/);
  const unknown = context.dayPickRow(Object.assign({}, base, {_cash:true, _unknown:true}));
  assert.match(face(unknown), /Сверяется/); assert.doesNotMatch(unknown, /USD|Поставлено/);
  // v172 (владелец 18.10): рассчитанный прогноз — та же отметка исхода, что у покупки (✓/×, полоса, слово), но без денег
  const forecast = context.dayPickRow(Object.assign({}, base, {_cash:false, result:1, forecast_odds:1.81022}));
  assert.match(face(forecast), /<span class="winner">Cleveland Guardians<\/span> · 2026-10-15 · Прогноз · Выигрыш/);
  assert.match(forecast, /pickline win/); assert.match(forecast, /✓/); assert.match(forecast, /glowbar green/);
  assert.doesNotMatch(forecast, /USD|1\.81022|коэффициент/);
  const forecastLost = context.dayPickRow(Object.assign({}, base, {_cash:false, result:0}));
  assert.match(face(forecastLost), /Cleveland Guardians · 2026-10-15 · Прогноз · Проигрыш/);
  assert.match(forecastLost, /pickline lose/); assert.match(forecastLost, /×/); assert.match(forecastLost, /glowbar red/);
  assert.doesNotMatch(forecastLost, /class="winner"|USD/);
  const forecastOpen = context.dayPickRow(Object.assign({}, base, {_cash:false, result:null}));
  assert.match(face(forecastOpen), /Cleveland Guardians · 2026-10-15 · Прогноз<\/small>/);
  assert.match(forecastOpen, /pickline plain/); assert.doesNotMatch(forecastOpen, /class="mark"|glowbar|Выигрыш|Проигрыш/);
  const forecastVoid = context.dayPickRow(Object.assign({}, base, {_cash:false, result:-1}));
  assert.match(face(forecastVoid), /Прогноз · Возврат/); assert.doesNotMatch(forecastVoid, /class="mark"|glowbar/);
  assert.match(forecast, /aria-label="Бейсбол MLB\. Tampa Bay Rays @ Cleveland Guardians\. Cleveland Guardians\. Прогноз\. Выигрыш"/);
  for (const h of [loss, zero, open, unknown, forecast, forecastLost, forecastOpen]) assert.doesNotMatch(h, /Выплата|Цена|Доли|резерв|Потрачено|Сумма|прогноз зашёл|сверка с личной/);
  // aria: содержимое карточки читается целиком
  assert.match(loss, /aria-label="Бейсбол MLB\. Tampa Bay Rays @ Cleveland Guardians\. Cleveland Guardians\. Поставлено 3,60 USD\. Убыток −3,60 USD"/);
});
function fakeBox(){ return {innerHTML:"", querySelectorAll(){ return []; }}; }
test("regression: rows survive navigation and a repeated identical response (stuck loader on v161)", () => {
  const box = fakeBox();
  const rows = '<article class="pickline" data-key="a">row</article>';
  assert.equal(context.swapListHtml(box, rows), true);
  // v161: повторный вход писал загрузчик прямо в innerHTML, затем те же данные не перерисовывались
  box.innerHTML = '<div class="loading">Загрузка…</div>';
  assert.equal(context.swapListHtml(box, rows), true, "same data after a foreign write must render again");
  assert.match(box.innerHTML, /<article/);
  // новая точка входа загрузчика не стирает готовые строки
  assert.equal(context.swapListHtml(box, '<div class="loading">Загрузка…</div>', {loader:true}), false);
  assert.match(box.innerHTML, /<article/);
  // неизменившийся ответ при нетронутом DOM — без перерисовки
  assert.equal(context.swapListHtml(box, rows), false);
  // новый ответ — перерисовка; сброс сессии — через resetListBox, после него строки рисуются заново
  assert.equal(context.swapListHtml(box, rows + '<article data-key="b">b</article>'), true);
  box.textContent = ""; context.resetListBox(box, "нет");
  assert.equal(context.swapListHtml(box, rows), true);
  // пустой контейнер: загрузчик показывается, затем данные его заменяют
  const fresh = fakeBox();
  assert.equal(context.swapListHtml(fresh, '<div class="loading">Загрузка…</div>', {loader:true}), true);
  assert.equal(context.swapListHtml(fresh, rows), true);
  assert.match(fresh.innerHTML, /<article/);
});
test("the bets list keeps the last selection day until the new day's processing starts", () => {
  load([trade]);
  const waiting = {mode:"PAPER_ONLY", real_stake:0, bets:[pick], session:{bets_list:[], date:"2026-10-16", matches:0, skipped:0, scheduled:{total:5}}, history:[{date:"2026-10-15", bets:1, bets_list:[pick]}]};
  let view = context.selectionListDay(waiting);
  assert.deepEqual([view.date, view.current, view.started], ["2026-10-15", false, false]);
  let rows = context.daySelectionRows(waiting, view.date);
  assert.equal(rows.length, 1); assert.match(rows[0].match, /Cleveland/); assert.equal(rows[0]._cash, true);
  const head = context.dayPickHead(view.date, rows, view);
  assert.match(head, /Последний отбор · 2026-10-15/); assert.match(head, /Новый отбор ещё не начался/);
  // обработка началась (matches > 0) — список переходит на новый день, даже если строк пока нет
  const started = Object.assign({}, waiting, {session:Object.assign({}, waiting.session, {matches:1})});
  view = context.selectionListDay(started);
  assert.deepEqual([view.date, view.current], ["2026-10-16", true]);
  assert.equal(context.daySelectionRows(started, view.date).length, 0);
  assert.match(context.dayStatusNote(Object.assign({generated_ts:"2026-10-16T18:30:00Z"}, started), Date.parse("2026-10-16T19:00:00Z")), /1 из 5 обработано · 4 ожидают/);
  // прогноз в новом дне — тоже начало отбора
  const withPick = Object.assign({}, waiting, {bets:[pick, Object.assign({}, pick, {entry_id:"p16", session_date:"2026-10-16", commence:"2026-10-16T22:00:00+00:00", result:null})]});
  assert.equal(context.selectionListDay(withPick).date, "2026-10-16");
  // завершённый отбор без ставок не подменяется старой победой
  const done = Object.assign({generated_ts:"2026-10-16T22:30:00Z"}, waiting, {session:Object.assign({}, waiting.session, {matches:5, skipped:5})});
  assert.equal(context.selectionListDay(done).date, "2026-10-16");
  assert.match(context.dayStatusNote(done, Date.parse("2026-10-16T23:00:00Z")), /не подобрал ни одной/);
  assert.equal(context.selectionListDay(waiting).date, "2026-10-15");
});
test("rows carry a stable data-key so expanded details survive re-render", () => {
  load([trade]);
  const row = context.dayPickRow(context.daySelectionRows(feed, "2026-10-15")[0]);
  assert.match(row, /<article class="pickline [a-z]+" data-key="op-guardians"/);
  assert.match(row, /class="pickline-row" data-key="op-guardians"/);
  const forecast = context.dayPickRow({sport:"soccer", _ico:"⚽", match:"Alpha vs Beta", selection:"Alpha", side:"home", session_date:"2026-10-16", _cash:false, result:null});
  assert.match(forecast, /data-key="soccer\|Alpha vs Beta\|home\|2026-10-16"/);
});

// ── v165 (владелец 16.10): футбол наравне с MLB — реальная покупка счёта по 1X2, ничья как выбор, прогноз остаётся прогнозом ──
test("a confirmed soccer purchase becomes a money row next to MLB while a soccer forecast stays a forecast", () => {
  const sfix = "2026-10-16T19:00:00Z|levante@deportivo la coruña";
  const buy = {kind:"TRADE", state:"CONFIRMED", operation_id:"soccer-op-1", fixture_id:sfix, side:"draw", sport:"soccer",
    match:"Deportivo La Coruña — Levante", market_family:"1x2", average_price:"0.3100", amount_units:"3000000", created_at:"2026-10-16T18:36:00Z", filled_at:"2026-10-16T18:36:40Z"};
  const parsed = load([buy]);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].sport, "soccer");
  assert.equal(parsed.rows[0].selection, "Ничья");
  assert.equal(parsed.rows[0]._realTrade, true);
  assert.equal(context.teamForSide("Deportivo La Coruña — Levante", "home"), "Deportivo La Coruña");
  assert.equal(context.teamForSide("Deportivo La Coruña — Levante", "away"), "Levante");
  const merged = context.mergeDayRow({sport:"soccer", match:"Deportivo La Coruña — Levante", selection:"Ничья", side:"draw", session_date:"2026-10-16"}, parsed.rows);
  assert.equal(merged._cash, true);
  assert.equal(merged.stake, 3);
  const forecastOnly = context.mergeDayRow({sport:"soccer", match:"Alpha vs Beta", selection:"Alpha", side:"home", session_date:"2026-10-16"}, []);
  assert.equal(forecastOnly._cash, false);
});

test("dashboard last bets and archive use the same short card as «Ставки» (v167 §9.2.1)", () => {
  const cleveland = {kind:"TRADE", state:"CONFIRMED", operation_id:"91cebdd2-033d-485b-a449-e03fe034bd36",
    fixture_id:fixture, side:"home", match:"Cleveland Guardians — Tampa Bay Rays",
    amount_units:"3420112", created_at:"2026-10-15T16:31:22Z", sport:"mlb", fee_units:"76870"};
  const claim = {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-cleveland", realized_pnl_units:"2770530",
    intent:{resolution:{trades:[{operation_id:cleveland.operation_id, cost_units:"3419470", shares_units:"6190000"}]}}};
  load([cleveland, claim]);
  const html = context.walletCardList(context.personalTradeRows());
  assert.match(face(html), /Поставлено 3,42 USD/);
  assert.match(face(html), /Прибыль \+2,77 USD/);
  assert.match(html, /Комиссия Polymarket: 0,08 USD · включена/);
  assert.doesNotMatch(html, /Выплата получена|pUSD|@\d|Цена недоступна|Доли|резерв|3,420112|прогноз зашёл/);
  // UNKNOWN — «Сверяется», без денег; нерассчитанная — «В расчёте», резерв не подставляется
  load([Object.assign({}, cleveland, {operation_id:"op-u", state:"UNKNOWN"})]);
  const u = context.walletCardList(context.personalTradeRows());
  assert.match(face(u), /Сверяется/); assert.doesNotMatch(u, /Поставлено|Прибыль|3,42/);
  load([Object.assign({}, cleveland, {fee_units:null})]);
  const pend = context.walletCardList(context.personalTradeRows());
  assert.match(face(pend), /В расчёте/); assert.match(face(pend), /Резерв 3,42 USD/); assert.doesNotMatch(pend, /Поставлено|Комиссия/);
});

// ── v173 (владелец 18.10): подпись выбора как у бейсбола; коэффициент покупки; исход до погашения; резерв до подтверждения затрат ──
test("v173: soccer selection shows the team / Over N / Team (+N) instead of П1/П2/ТБ/Фора", () => {
  const lbl = (b) => context.feedBetToRow(Object.assign({sport:"soccer", session_date:"2026-10-17"}, b)).selection;
  assert.equal(lbl({match:"Espanyol vs Atlético Madrid", selection:"П2", side:"away", kind:"1x2"}), "Atlético Madrid");
  assert.equal(lbl({match:"Villarreal vs Elche CF", selection:"П1", side:"home", kind:"1x2"}), "Villarreal");
  assert.equal(lbl({match:"Troyes vs RC Lens", selection:"Ничья", side:"draw", kind:"1x2"}), "Ничья");
  assert.equal(lbl({match:"Everton vs Chelsea", selection:"ТБ 2.5", side:"over", kind:"total", line:2.5}), "Больше 2.5");
  assert.equal(lbl({match:"Everton vs Chelsea", selection:"ТМ 3.5", side:"under", kind:"total", line:3.5}), "Меньше 3.5");
  assert.equal(lbl({match:"Lille vs Brest", selection:"Фора +1 гости", side:"away", kind:"spread", line:1.0}), "Brest (+1)");
  assert.equal(lbl({match:"Lille vs Brest", selection:"Фора -1 хозяева", side:"home", kind:"spread", line:-1.0}), "Lille (−1)");
  // бейсбол без изменений: имя команды из «Away @ Home»
  assert.equal(lbl({sport:"mlb", match:"Tampa Bay Rays @ Cleveland Guardians", selection:"Tampa Bay Rays", side:"away"}), "Tampa Bay Rays");
  // нет данных для разбора — исходная подпись
  assert.equal(lbl({match:"", selection:"П2", side:"away", kind:"1x2"}), "П2");
  assert.equal(context.teamForSide("Lille vs Brest", "away"), "Brest");
});
test("v173: real card shows reserve until fills are proven, odds only from the confirmed fill price, and the known outcome before redemption", () => {
  const base = {sport:"mlb", match:"Tampa Bay Rays @ Cleveland Guardians", selection:"Tampa Bay Rays", side:"away", session_date:"2026-10-17", _cash:true, claim_confirmed:false, pnl:null};
  const noFill = context.dayPickRow(Object.assign({}, base, {staked:null, reserved:3.5582, fill_price:null, _resolution:null}));
  assert.match(face(noFill), /<b>Резерв 3,56 USD<\/b> · <span>В расчёте<\/span>/); assert.doesNotMatch(noFill, /кф|Поставлено/);
  const won = context.dayPickRow(Object.assign({}, base, {staked:3.55819, fill_price:0.51, _resolution:1}));
  assert.match(face(won), /<b>Поставлено 3,56 USD<\/b> · <span>кф 1\.96<\/span> · <span class="pos">Выиграла · ожидает погашения<\/span>/);
  assert.match(won, /pickline win/); assert.match(won, /✓/);
  const lost = context.dayPickRow(Object.assign({}, base, {staked:3.6, fill_price:0.5, _resolution:0}));
  assert.match(face(lost), /кф 2\.00<\/span> · <span class="neg">Проиграла · ожидает расчёта<\/span>/); assert.match(lost, /pickline lose/);
  const settled = context.dayPickRow(Object.assign({}, base, {claim_confirmed:true, pnl:2.77053, result:1, staked:3.41947, fill_price:0.54}));
  assert.match(face(settled), /<b>Поставлено 3,42 USD<\/b> · <span>кф 1\.85<\/span> · <b class="pos">Прибыль \+2,77 USD<\/b>/);
  assert.match(settled, /aria-label="[^"]*Поставлено 3,42 USD\. кф 1\.85\. Прибыль \+2,77 USD"/);
  // цена сигнала/прогноза коэффициентом не становится
  const noPrice = context.dayPickRow(Object.assign({}, base, {staked:3.5, fill_price:null, best_odds:1.96, forecast_odds:1.96}));
  assert.doesNotMatch(noPrice, /кф/);
});
