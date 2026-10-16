
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
  awaitingRedeem: ["Ставка поставлена · выиграла · ожидает погашения"],
  paperWin: ["прогноз зашёл"], paperLoss: ["прогноз не зашёл"], selectedNoTrade: ["Выбрано · реальной ставки нет"],
  win: ["выигрыш"], lose: ["проигрыш"], voided: ["возврат"], suspended: ["приостановлена"], inPlay: ["в игре"],
  ofBank: ["%"], autoBetsPlaced: ["автоставок поставлено"], baStaked: ["поставлено"], secLast: ["Последние"],
  noPersonalBets: ["нет"], selectedPicks: ["выбрано"], personalOnly: ["вне отбора"]
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
  personalBets: () => (context.personalStore && context.personalStore.session === context.sessionKey()) ? context.personalStore.rows : [],
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
  segment("function personalTradesFromHistory(state){", "// Статистика торгового счёта")
].join("\n");
vm.runInContext(src, context);
const fixture = "2026-10-15T17:00:00Z|tampa bay rays@cleveland guardians";
const pick = {sport:"mlb", entry_id:"paper", side:"home", match:"Tampa Bay Rays @ Cleveland Guardians",
  commence:"2026-10-15T17:00:00+00:00", session_date:"2026-10-15", real_stake:0, result:1,
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
test("owner sees confirmed purchase when public selection exists", () => {
  load([trade]);
  const mine = context.personalTradeRows();
  assert.equal(mine.length, 1);
  assert.equal(mine[0]._realTrade, true);
  assert.equal(mine[0].result, null);
  assert.equal(mine[0].pnl, null);
  assert.equal(mine[0].stake, 3.3426);
  const shown = context.withResolution(mine, feed)[0];
  assert.equal(shown._resolution, 1);
  assert.equal(shown.pnl, null);
  assert.equal(shown.result, null);
  const htmlRow = context.betRow(shown);
  assert.match(htmlRow, /Ставка поставлена · выиграла · ожидает погашения/);
  assert.doesNotMatch(htmlRow, /Автоставка поставлена|выигрыш|\+2\.|27\.10|33\.45|2\.85/);
  const picks = context.selectionDisplayRows(feed);
  assert.equal(picks.length, 1);
  assert.equal(picks[0].session_date, "2026-10-15");
  assert.equal(picks[0]._wallet, false);
  assert.equal(picks[0].pnl, null);
  assert.match(context.betRow(picks[0]), /прогноз зашёл/);
  assert.doesNotMatch(context.betRow(picks[0]), /Автоставка поставлена/);
});
test("empty public selection does not hide the purchase", () => {
  load([trade]);
  const empty = {mode:"PAPER_ONLY", real_stake:0, bets:[], session:{bets_list:[]}, history:[]};
  assert.equal(context.selectionDisplayRows(empty).length, 0);
  const mine = context.withResolution(context.personalTradeRows(), empty);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].pnl, null);
  const htmlRow = context.betRow(mine[0]);
  assert.match(htmlRow, /Автоставка поставлена/);
  assert.doesNotMatch(htmlRow, /ожидает погашения|2\.85|33\.45/);
});
test("another session cannot read the purchase", () => {
  load([trade]);
  context.session = "other";
  assert.equal(context.personalTradeRows().length, 0);
  context.session = "owner";
  assert.equal(context.personalTradeRows().length, 1);
});
test("refresh does not duplicate the operation", () => {
  load([trade, trade, Object.assign({}, trade)]);
  assert.equal(context.personalTradeRows().length, 1);
});
test("UNKNOWN is reconciling and not a placed bet", () => {
  load([unknown]);
  const row = context.personalTradeRows()[0];
  assert.equal(row._realTrade, false);
  assert.equal(row._unknown, true);
  const htmlRow = context.betRow(row);
  assert.match(htmlRow, /сверяется/);
  assert.doesNotMatch(htmlRow, /Автоставка поставлена/);
});
test("paper win is not added to real pnl without a confirmed claim", () => {
  const parsed = load([trade]);
  assert.equal(parsed.rows[0].claim_confirmed, false);
  assert.equal(parsed.rows[0].pnl, null);
  const card = context.walletDayCard("2026-10-15", context.personalTradeRows());
  assert.doesNotMatch(card, /27\.|2\.85|W-/);
});
test("confirmed claim on the same fixture is the only pnl", () => {
  load([trade, {kind:"CLAIM", state:"CONFIRMED", operation_id:"claim-1", fixture_id:fixture, side:"home", realized_pnl_units:"2847400"}]);
  const row = context.personalTradeRows()[0];
  assert.equal(row.claim_confirmed, true);
  assert.equal(row.result, 1);
  assert.ok(Math.abs(row.pnl - 2.8474) < 1e-9);
  const htmlRow = context.betRow(context.withResolution([row], feed)[0]);
  assert.match(htmlRow, /выигрыш/);
  assert.match(htmlRow, /2\.85/);
  assert.doesNotMatch(htmlRow, /ожидает погашения/);
});
test("real Cleveland history renders awaiting redemption without paper profit", () => {
  const real = {kind:"TRADE", state:"CONFIRMED", operation_id:"91cebdd2-033d-485b-a449-e03fe034bd36",
    fixture_id:fixture, side:"home", match:"Cleveland Guardians — Tampa Bay Rays",
    average_price:null, amount_units:"3420112", created_at:"2026-10-15T16:31:22.342556+00:00", sport:"mlb",
    order_id:null, result:"FILLED", realized_pnl_units:null};
  load([real]);
  const shown = context.withResolution(context.personalTradeRows(), feed)[0];
  assert.equal(shown.stake, 3.420112);
  assert.equal(shown.pnl, null);
  const htmlRow = context.betRow(shown);
  assert.match(htmlRow, /Ставка поставлена · выиграла · ожидает погашения/);
  assert.match(htmlRow, /3\.42 pUSD/);
  assert.doesNotMatch(htmlRow, /33\.45|27\.10|2\.85|\+2/);
  const card = context.walletDayCard("2026-10-15", [shown]);
  assert.doesNotMatch(card, /W-|2\.85|27\.|33\.45/);
  assert.match(card, /3\.42/);
});
test("fixture and side still gate the green match flag", () => {
  load([trade]);
  const away = Object.assign({}, pick, {side:"away"});
  assert.equal(context.forecastRow(away)._realTrade, false);
  assert.equal(context.forecastRow(pick)._realTrade, true);
});
