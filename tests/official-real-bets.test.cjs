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
  sportMlb: ["Бейсбол MLB"], sportSoccer: ["Футбол"], originPaper: ["прогноз стратегии · PAPER"]
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
  segment("function claimPnlTxt(n){", "// Статистика торгового счёта")
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
  context.window.__privateRealBets = {session: context.sessionKey(), rows: parsed.rows};
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
  assert.match(htmlRow, /Выиграла · ожидает погашения/);
  assert.doesNotMatch(face(htmlRow), /Выиграла · ожидает погашения|Автоставка поставлена|Ставка поставлена/);
  assert.match(face(htmlRow), /3,34 USD/);
  assert.match(face(htmlRow), /✓/);
  assert.doesNotMatch(htmlRow, /27\.10|33\.45|2\.85|6\.19|@—/);
  assert.doesNotMatch(face(htmlRow), /1\.81022/);
  assert.match(htmlRow, /коэффициент прогноза 1\.81022/);
  assert.match(htmlRow, /Цена сделки/);
});
test("empty public selection still shows that day's confirmed trade once", () => {
  load([trade]);
  const empty = {mode:"PAPER_ONLY", real_stake:0, bets:[], session:{bets_list:[], date:"2026-10-15"}, history:[]};
  const rows = context.daySelectionRows(empty, "2026-10-15");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pnl, null);
  const htmlRow = context.dayPickRow(rows[0]);
  assert.match(htmlRow, /Сделка подтверждена/);
  assert.doesNotMatch(htmlRow, /ожидает погашения|2\.85|33\.45|@—/);
  assert.match(face(htmlRow), /3,34 USD/);
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
  assert.match(row, /сверяется/);
  assert.doesNotMatch(row, /Автоставка поставлена|✓|USD/);
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
  assert.match(htmlRow, /Выплата получена/);
  assert.match(htmlRow, /\+2\.847400 USD/);
  assert.doesNotMatch(htmlRow, /ожидает погашения|pUSD/);
});
test("real Cleveland history renders awaiting redemption without paper profit", () => {
  const real = {kind:"TRADE", state:"CONFIRMED", operation_id:"91cebdd2-033d-485b-a449-e03fe034bd36",
    fixture_id:fixture, side:"home", match:"Cleveland Guardians — Tampa Bay Rays",
    average_price:null, amount_units:"3420112", created_at:"2026-10-15T16:31:22.342556+00:00", sport:"mlb",
    order_id:null, result:"FILLED", realized_pnl_units:null};
  load([real]);
  const shown = context.daySelectionRows(feed, "2026-10-15")[0];
  assert.equal(shown.stake, 3.420112);
  assert.equal(shown.pnl, null);
  const htmlRow = context.dayPickRow(shown);
  assert.match(face(htmlRow), /3,42 USD/);
  assert.match(htmlRow, /Выиграла · ожидает погашения/);
  assert.match(htmlRow, /3,420112 USD/);
  assert.match(htmlRow, /Цена недоступна/);
  assert.doesNotMatch(face(htmlRow), /1\.81022|@—/);
  assert.doesNotMatch(htmlRow, /33\.45|27\.10|2\.85|6\.19|\+2/);
});
test("one market payout is split by cost and Cleveland is not the gross mark", () => {
  const cleveland = {kind:"TRADE", state:"CONFIRMED", operation_id:"91cebdd2-033d-485b-a449-e03fe034bd36",
    fixture_id:fixture, side:"home", match:"Cleveland Guardians — Tampa Bay Rays",
    amount_units:"3420112", created_at:"2026-10-15T16:31:22Z", sport:"mlb"};
  const claim = {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-cleveland", realized_pnl_units:"2770530",
    intent:{resolution:{trades:[{operation_id:cleveland.operation_id, cost_units:"3419470"}]}}};
  const shown = load([cleveland, claim]).rows[0];
  assert.equal(shown.pnl, 2.77053);
  const htmlRow = context.dayPickRow(context.daySelectionRows(feed, "2026-10-15")[0]);
  assert.match(htmlRow, /Выплата получена/);
  assert.match(htmlRow, /\+2\.770530 USD/);
  assert.doesNotMatch(htmlRow, /2\.85|pUSD/);
  const first = {kind:"TRADE", state:"CONFIRMED", operation_id:"buy-1", fixture_id:fixture, side:"home",
    amount_units:"1000000", created_at:"2026-10-15T16:00:00Z", sport:"mlb"};
  const second = Object.assign({}, first, {operation_id:"buy-2", amount_units:"3000000"});
  const shared = {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-shared", realized_pnl_units:"4000000",
    intent:{resolution:{trades:[{operation_id:"buy-1", cost_units:"1000000"}, {operation_id:"buy-2", cost_units:"3000000"}]}}};
  const rows = load([first, second, shared]).rows;
  assert.equal(rows.find(r => r.operation_id === "buy-1").pnl, 1);
  assert.equal(rows.find(r => r.operation_id === "buy-2").pnl, 3);
  const merged = context.daySelectionRows(feed, "2026-10-15");
  assert.equal(merged.length, 1);
  assert.equal(merged[0].pnl, 4);
  assert.equal(merged[0].stake, 4);
});
test("October 15 shows only Cleveland and Royals stay in the September history", () => {
  const cleveland = {kind:"TRADE", state:"CONFIRMED", operation_id:"91cebdd2-033d-485b-a449-e03fe034bd36",
    fixture_id:fixture, side:"home", match:"Tampa Bay Rays @ Cleveland Guardians",
    average_price:null, amount_units:"3420112", created_at:"2026-10-15T16:31:22Z", sport:"mlb"};
  const royals = {kind:"TRADE", state:"CONFIRMED", operation_id:"53cd147e-4d2a-483f-8ee0-2fa01dd9ef81",
    fixture_id:"2026-09-26T23:10:00Z|athletics@kansas city royals", side:"home",
    match:"Athletics @ Kansas City Royals", amount_units:"3600000",
    created_at:"2026-09-26T22:43:05Z", sport:"mlb"};
  const royalsClaim = {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-royals", realized_pnl_units:"-3597750",
    intent:{resolution:{trades:[{operation_id:royals.operation_id, cost_units:"3597750"}]}}};
  load([cleveland, royals, royalsClaim]);
  const day = context.daySelectionRows(feed, "2026-10-15");
  assert.equal(day.length, 1);
  assert.match(day[0].match, /Cleveland/);
  const block = context.dayPickHead("2026-10-15", day) + day.map(context.dayPickRow).join("");
  assert.doesNotMatch(block, /Royals|Kansas|7[,.]020112|7[,.]02/);
  assert.match(block, /3,42 USD/);
  assert.match(block, /⚾/);
  assert.equal(block.split("<article").length - 1, 1);
  const hist = context.personalHistoryHtml(context.personalTradeRows());
  assert.match(hist, /data-day="2026-10-15"/);
  assert.match(hist, /data-day="2026-09-26"/);
  assert.match(hist, /Kansas City Royals/);
  assert.match(hist, /pickline lose/);
  assert.match(hist, /×/);
  assert.match(hist, /−3\.597750 USD/);
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
  assert.doesNotMatch(ballHtml, /USD|class="mark"|Автоставка/);
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
