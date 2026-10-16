// v167 (владелец 16.10, §9.3–9.4): офлайн-стенд предзагрузки и памяти на jsdom — вся сеть подставная, живых RPC/кошельков нет.
// Запуск: JSDOM_MODULE=/путь/к/node_modules/jsdom node tests/app-preload.jsdom.cjs   (jsdom не входит в репозиторий Pages)
// Это не Telegram WebView владельца: раскладку (ширины) jsdom не считает, замеры — время JS до появления строк в DOM.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const {performance} = require("node:perf_hooks");
const {JSDOM, requestInterceptor, VirtualConsole} = require(process.env.JSDOM_MODULE || "jsdom");
const repo = path.resolve(__dirname, ".."), html = fs.readFileSync(path.join(repo, "aisports/index.html"), "utf8");
const BUILD = (html.match(/const BUILD = "([^"]+)"/) || [])[1];
const SB = "gnaviojsvtmukypdnaxk.supabase.co", FEED_SB = "gqlfnhlrpteqfdfyhavl.supabase.co";
const owner = "0x" + "1".repeat(40), funding = "0x" + "2".repeat(40), botOwner = "0x" + "3".repeat(40), bot = "0x" + "4".repeat(40);
const fixture = "2026-10-15T17:00:00Z|tampa bay rays@cleveland guardians";
const account = () => ({account_id: "11111111-1111-4111-8111-111111111111", state: "READY", version: 3, verified_user_signer: owner, funding_wallet: funding,
  bot_owner_address: botOwner, bot_deposit_wallet: bot, chain_id: 137, collateral: "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb",
  policy: {version: 2, enabled: false, max_stake_bps: 700, max_open: 10, sports: ["mlb"], sports_available: ["mlb"]},
  balance: {confirmed_units: "71172780", reserved_units: "0", available_units: "71172780", position_value_units: "0", realized_pnl_units: "-827220", checked_at: new Date().toISOString()},
  execution_region: {country: "KZ", blocked: false, checked_at: new Date().toISOString()}, runtime_ready: true, last_checked_at: new Date().toISOString()});
const cleveland = {kind: "TRADE", state: "CONFIRMED", operation_id: "91cebdd2-033d-485b-a449-e03fe034bd36", fixture_id: fixture, side: "home",
  match: "Tampa Bay Rays @ Cleveland Guardians", amount_units: "3420112", fee_units: "76870", created_at: "2026-10-15T16:31:22Z", filled_at: "2026-10-15T16:32:05Z", sport: "mlb"};
const claim = {kind: "CLAIM", state: "CONFIRMED", operation_id: "claim-cleveland", realized_pnl_units: "2770530", created_at: "2026-10-16T05:05:31Z",
  intent: {resolution: {trades: [{operation_id: cleveland.operation_id, cost_units: "3419470", shares_units: "6190000"}]}}};
const royals = {kind: "TRADE", state: "CONFIRMED", operation_id: "royals-26-09-stand", fixture_id: "2026-09-26T23:10:00Z|cleveland guardians@kansas city royals",
  side: "home", match: "Cleveland Guardians @ Kansas City Royals", amount_units: "3600000", created_at: "2026-09-26T22:43:05Z", sport: "mlb"};
const royalsClaim = {kind: "CLAIM", state: "CONFIRMED", operation_id: "claim-royals", realized_pnl_units: "-3597750", created_at: "2026-10-16T05:05:52Z",
  intent: {resolution: {trades: [{operation_id: royals.operation_id, cost_units: "3597750", shares_units: "6600000"}]}}};
const pick = {sport: "mlb", entry_id: "paper", side: "home", match: "Tampa Bay Rays @ Cleveland Guardians", selection: "Cleveland Guardians",
  commence: "2026-10-15T17:00:00+00:00", session_date: "2026-10-15", real_stake: 0, result: 1, stake_usd_paper: 33.45, pnl_usd_paper: 27.1, odds: 1.81022};
const feed = () => ({mode: "PAPER_ONLY", real_stake: 0, generated_ts: new Date().toISOString(), bets: [pick],
  session: {date: "2026-10-16", bets: 0, bets_list: [], matches: 0, skipped: 0, scheduled: {total: 3}}, history: [{date: "2026-10-15", bets: 1, bets_list: [pick]}],
  by_sport: {mlb: {wins: 43, losses: 18, settled: 61, emoji: "⚾"}}, totals: {wins: 43, losses: 18}, bank: {}});
const money = () => ({api_version: 1, status: "OK", hours: 24, since: new Date(Date.now() - 86400000).toISOString(), server_time: new Date().toISOString(),
  realized_all_units: "-827220", claims_total: 2, settled_window_units: "-827220", settled_window_count: 2, claims_without_settled_at: 0, window_complete: true,
  purchases_window_count: 1, purchases_without_filled_at: 0});
const telegram = (id, tag) => ({initData: `query_id=FIXTURE_${tag}_NOT_REAL_AUTH&user=${id}&hash=${"f".repeat(32)}${tag}`, initDataUnsafe: {user: {id, first_name: "Проверка", language_code: "ru"}},
  ready(){}, expand(){}, onEvent(){}, offEvent(){}, setHeaderColor(){}, setBackgroundColor(){}, openLink(){}, platform: "ios", colorScheme: "light", themeParams: {},
  BackButton: {show(){}, hide(){}, onClick(){}, offClick(){}}, HapticFeedback: {impactOccurred(){}, notificationOccurred(){}, selectionChanged(){}}});

function makeServer(opts = {}) {
  const calls = [], gates = {}, server = {calls, history: opts.history || [cleveland, claim, royals, royalsClaim], pages: opts.pages || null, missingPage: !!opts.missingPage,
    delay: Object.assign({}, opts.delay || {}), gate: new Set(opts.gate || []), account: account(), feed: feed(), money: money(), userOf: () => ""};
  server.release = name => { const g = gates[name]; if (g) { delete gates[name]; g.forEach(r => r()); } };
  server.waitGate = async name => { while (!gates[name]) await new Promise(r => setTimeout(r, 2)); };
  const hold = name => new Promise(r => { (gates[name] = gates[name] || []).push(r); });
  const reply = (status, data) => ({ok: status >= 200 && status < 300, status, headers: {get: () => "application/json"}, json: async () => data, text: async () => JSON.stringify(data)});
  server.fetch = async (url, o = {}) => {
    const u = new URL(String(url), "https://aisports.test/aisports/index.html"); const t = performance.now();
    let name = "";
    if (u.pathname.endsWith("version.json")) return reply(200, {build: BUILD});
    if (u.hostname === SB && u.pathname.includes("/rpc/")) name = u.pathname.split("/").pop();
    else if (u.pathname.endsWith("/app_assets")) name = "app_assets:" + (u.hostname === FEED_SB ? "strategy" : "core");
    else if (u.pathname.includes("/senya_schedule")) name = "senya_schedule";
    else if (u.pathname.includes("/senya_match_stats")) name = "senya_match_stats";
    else name = "other:" + u.hostname + u.pathname;
    const body = o.body ? JSON.parse(o.body) : {};
    const user = body.p_init_data ? String(body.p_init_data).replace(/.*user=(\d+).*/, "$1") : "";
    calls.push({name, t, user});
    if (o.signal) { const abort = () => {}; o.signal.addEventListener("abort", abort); }
    if (server.gate.has(name)) await Promise.race([hold(name), new Promise((_, rej) => o.signal && o.signal.addEventListener("abort", () => rej(Object.assign(new Error("AbortError"), {name: "AbortError"}))))]);
    if (server.delay[name]) await new Promise(r => setTimeout(r, server.delay[name]));
    if (server.fail && server.fail[name]) return reply(server.fail[name], {});
    if (name.startsWith("app_assets")) return reply(200, [{content: server.feed}]);
    if (name === "senya_schedule" || name === "senya_match_stats") return reply(200, []);
    if (name === "bot_account_get") return reply(200, {api_version: 1, status: "OK", account: server.account});
    if (name === "bot_account_history_page") {
      if (server.missingPage) return reply(404, {});
      if (server.pages) { const pg = server.pages[body.p_cursor || "head"]; return reply(200, {api_version: 1, status: "OK", operations: pg.operations, has_more: pg.has_more, next_cursor: pg.next_cursor || null}); }
      const hist = server.historyByUser && server.historyByUser[user] !== undefined ? server.historyByUser[user] : server.history;
      return reply(200, {api_version: 1, status: "OK", operations: hist, has_more: false, next_cursor: null});
    }
    if (name === "bot_account_history") return reply(200, {api_version: 1, status: "OK", operations: server.history});
    if (name === "bot_account_money") return reply(200, server.money);
    if (name === "bot_account_operation") return reply(200, {api_version: 1, status: "OK", operation: null});
    if (name === "get_profile_v2") return reply(200, {tg_id: 111, username: "fixture", is_paid: true});
    if (name === "wallet_link_status") return reply(200, {state: "OWNED", signer: owner, trading_account: funding});
    if (name === "get_wallet_view" || name === "set_wallet_view" || name === "clear_wallet_view") return reply(404, {});
    return reply(404, {});
  };
  return server;
}
// jsdom 30: подресурсы страницы (bot-account.js, wallet-connect.js) отдаются с диска перехватчиком; наружу ничего не уходит
const localResources = {interceptors: [requestInterceptor(request => {
  const u = new URL(request.url);
  if (u.hostname === "aisports.test") {
    const rel = u.pathname.replace(/^\/aisports\//, ""), p = path.join(repo, "aisports", rel), alt = path.join(repo, rel);
    const file = fs.existsSync(p) ? p : fs.existsSync(alt) ? alt : null;
    if (file) return new Response(fs.readFileSync(file), {headers: {"Content-Type": "application/javascript"}});
  }
  return new Response("", {status: 404});       // telegram-web-app.js и прочее внешнее: подменено заглушками в beforeParse
})]};
async function openApp({server, user = 111, tag = "A", storage = null, denyStorage = false, pageshowEarly = false} = {}) {
  const errors = []; const vc = new VirtualConsole(); vc.on("jsdomError", e => { if (!/not implemented|Could not load script/i.test(String(e && e.message))) errors.push(String(e && e.message || e)); });
  const t0 = performance.now();
  const dom = new JSDOM(html, {url: "https://aisports.test/aisports/index.html", runScripts: "dangerously", resources: localResources, pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) {
      window.Telegram = {WebApp: telegram(user, tag)};
      window.fetch = server.fetch;
      window.matchMedia = () => ({matches: false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}});
      window.scrollTo = () => {}; window.HTMLElement.prototype.scrollIntoView = () => {}; window.document.getAnimations = () => [];
      try { window.crypto.randomUUID = () => require("node:crypto").randomUUID(); } catch (e) { Object.defineProperty(window, "crypto", {value: {randomUUID: () => require("node:crypto").randomUUID(), getRandomValues: a => require("node:crypto").webcrypto.getRandomValues(a)}}); }
      Object.defineProperty(window.navigator, "clipboard", {value: {writeText: async () => {}}});
      window.sessionStorage.setItem("senya_lang_reload", "1");          // заставку не гоняем
      if (storage) for (const [k, v] of Object.entries(storage)) window.localStorage.setItem(k, v);
      if (denyStorage) { const thrower = { get length(){ throw new Error("SecurityError"); }, getItem(){ throw new Error("SecurityError"); }, setItem(){ throw new Error("SecurityError"); }, removeItem(){ throw new Error("SecurityError"); }, clear(){ throw new Error("SecurityError"); }, key(){ throw new Error("SecurityError"); } };
        Object.defineProperty(window, "localStorage", {get(){ return thrower; }}); }
      window.addEventListener("error", e => errors.push(String(e.message)));
      if (pageshowEarly) window.document.addEventListener("readystatechange", () => { if (window.document.readyState === "interactive") window.dispatchEvent(new window.Event("pageshow")); });
    }});
  const w = dom.window;
  await new Promise(r => { if (w.document.readyState === "complete") r(); else w.addEventListener("load", r); });
  const api = {dom, w, d: w.document, errors, t0, server,
    tick: ms => new Promise(r => setTimeout(r, ms)),
    rows: (id = "bets") => Array.from(w.document.querySelectorAll(`#${id} article`)),
    text: (id = "bets") => w.document.getElementById(id).textContent,
    click: tab => { const b = w.document.querySelector(`.bnav-item[data-tab="${tab}"]`); b.click(); },
    calls: (...names) => server.calls.filter(c => !names.length || names.includes(c.name)),
    until: async (fn, ms = 3000) => { const end = performance.now() + ms; while (performance.now() < end) { if (fn()) return true; await new Promise(r => setTimeout(r, 5)); } return false; },
    ctl: () => w.__botAccountController};
  return api;
}
const results = [];
const note = (k, v) => { results.push([k, v]); console.log(`  · ${k}: ${v}`); };
async function s1_cold_start() {
  console.log("S1 холодный старт на «Ставках»: запросы без визита в профиль; история раньше money → карточка уже есть");
  const server = makeServer({gate: ["bot_account_history_page", "bot_account_money"]});
  const app = await openApp({server});
  const names = app.calls().map(c => c.name);
  assert.ok(names.includes("bot_account_get"), "счёт запрошен при старте: " + names.join(","));
  assert.ok(names.includes("app_assets:strategy"), "лента отбора запрошена при старте");
  assert.ok(names.includes("senya_schedule"), "расписание запрошено при старте");
  const first = Math.min(...app.calls("bot_account_get", "app_assets:strategy", "senya_schedule").map(c => c.t));
  note("S1 первый запрос данных после открытия, мс", (first - app.t0).toFixed(0));
  assert.equal(app.d.querySelector('.bnav-item[data-tab="me"]').classList.contains("active"), false, "профиль не открывался");
  await server.waitGate("bot_account_history_page");
  // до ответа истории: прогноз дня уже виден как «Прогноз», денег нет, состояние — одной строкой списка
  assert.equal(app.rows().filter(a => /Поставлено|В расчёте|USD/.test(a.textContent)).length, 0, "до ответа истории денежных строк нет: " + app.text());
  assert.ok(app.rows().some(a => /Прогноз/.test(a.textContent)), "прогноз дня виден сразу (структура заполняется по мере готовности)");
  assert.match(app.text(), /Личная история обновляется…/);
  assert.doesNotMatch(app.text(), /сверка с личной историей|Личная история ещё загружается/);
  const tRel = performance.now(); server.release("bot_account_history_page");
  assert.ok(await app.until(() => app.rows().some(a => /Поставлено 3,42 USD/.test(a.textContent))), "карточка Cleveland появилась после истории: " + app.text());
  note("S1 от ответа истории до карточки в DOM, мс", (performance.now() - tRel).toFixed(0));
  assert.equal(app.calls("bot_account_money").length, 1, "money запрошен один раз и ещё не отвечен");
  const card = app.rows().find(a => /Cleveland/.test(a.textContent)).textContent;
  assert.match(card, /Поставлено 3,42 USD/); assert.match(card, /Прибыль \+2,77 USD/);
  assert.doesNotMatch(card, /Выплата|Цена|Доли|резерв|сверка|Загружается/);
  assert.match(app.text(), /Комиссия Polymarket: 0,08 USD · включена/);
  server.release("bot_account_money"); server.gate.clear();                 // дальше сеть отвечает сразу
  assert.ok(await app.until(() => app.ctl().state.money && app.ctl().state.money.status === "OK"));
  assert.deepEqual(app.errors, [], "ошибок страницы нет");
  return app;
}
async function s2_navigation(app) {
  console.log("S2 десять переходов Ставки→Игры→Дашборд→Профиль→Ставки: без новых запросов в пределах свежести, строки на месте");
  const before = app.calls().length;
  const dataNames = ["bot_account_get", "bot_account_history_page", "bot_account_history", "bot_account_money", "app_assets:strategy", "app_assets:core", "senya_schedule"];
  const beforeData = app.calls(...dataNames).length;
  let maxShow = 0;
  for (let i = 0; i < 10; i++) {
    for (const tab of ["sched", "dash", "me", "stats"]) {
      const t = performance.now(); app.click(tab);
      if (tab === "stats") { const ok = app.rows().some(a => /Cleveland/.test(a.textContent)); assert.ok(ok, `переход ${i}: строки на месте`); maxShow = Math.max(maxShow, performance.now() - t); }
      if (tab === "dash") assert.ok(app.rows("personalHistory").length >= 1, "дашборд: последние ставки из памяти");
    }
    await app.tick(5);
  }
  await app.tick(50);
  const afterData = app.calls(...dataNames).length;
  note("S2 запросов данных до/после 10 циклов переходов", `${beforeData}/${afterData}`);
  note("S2 всего сетевых вызовов до/после", `${before}/${app.calls().length}`);
  note("S2 макс. время от нажатия до готового списка, мс", maxShow.toFixed(2));
  assert.equal(afterData, beforeData, "навигация в пределах свежести не порождает запросов данных");
  assert.ok(maxShow < 100, "показ готового списка быстрее 100 мс");
  assert.deepEqual(app.errors, []);
}
async function s3_stale_many_initiators(app) {
  console.log("S3 просроченный снимок + несколько инициаторов: одно чтение, прежний список виден");
  const ctl = app.ctl(); ctl.state.historyAt = Date.now() - 60000;
  app.server.gate.add("bot_account_history_page");
  const b = {get: app.calls("bot_account_get").length, hist: app.calls("bot_account_history_page").length};
  app.click("stats"); app.d.dispatchEvent(new app.w.Event("visibilitychange")); app.click("dash"); app.click("stats"); app.w.dispatchEvent(new app.w.Event("pageshow"));
  await app.server.waitGate("bot_account_history_page");
  assert.ok(app.rows().some(a => /Cleveland/.test(a.textContent)), "во время чтения строки не заменены загрузчиком");
  assert.equal(app.calls("bot_account_get").length - b.get, 1, "один запрос счёта на всех инициаторов");
  assert.equal(app.calls("bot_account_history_page").length - b.hist, 1, "один запрос истории");
  app.server.release("bot_account_history_page"); app.server.gate.delete("bot_account_history_page");
  const done = await app.until(() => !ctl.state.busy && ctl.state.historyAt > Date.now() - 2000);
  assert.ok(done, "чтение завершилось после снятия задержки: " + JSON.stringify({busy: ctl.state.busy, error: ctl.state.error, detail: ctl.state.errorDetail, historyAt: ctl.state.historyAt, now: Date.now(), tail: app.calls().slice(-6).map(c => c.name)}));
  note("S3 запросов счёта/истории на 5 инициаторов", "1/1");
}
async function s4_archive_kept() {
  console.log("S4 новая первая страница не уничтожает догруженный архив, курсор сохраняется");
  const pages = {head: {operations: [cleveland, claim], has_more: true, next_cursor: "c1"}, c1: {operations: [royals, royalsClaim], has_more: false}};
  const server = makeServer({pages}); const app = await openApp({server});
  const ctl = app.ctl(); assert.ok(await app.until(() => ctl.state.historyLoaded && !ctl.state.busy));
  assert.equal(ctl.state.history.length, 2); assert.equal(ctl.state.historyHasMore, true);
  await ctl.historyMore(); assert.equal(ctl.state.history.length, 4); assert.equal(ctl.state.historyPages, 2); assert.equal(ctl.state.historyComplete, true);
  ctl.state.historyAt = Date.now() - 60000; await ctl.refresh();
  assert.equal(ctl.state.history.length, 4, "архив (Royals) остался после перечитывания первой страницы");
  assert.ok(ctl.state.history.some(o => o.operation_id === royals.operation_id));
  assert.equal(ctl.state.historyComplete, true, "полнота от последней догруженной страницы, не от первой");
  app.click("dash"); await app.tick(20);
  assert.match(app.text("personalHistory"), /Cleveland/);
  assert.deepEqual(app.errors, []);
}
async function s5_profile_and_pageshow() {
  console.log("S5 первый вход в профиль и pageshow (до и после DOMContentLoaded) не очищают историю");
  for (const early of [false, true]) {
    const server = makeServer(); const app = await openApp({server, pageshowEarly: early});
    assert.ok(await app.until(() => app.rows().some(a => /Cleveland/.test(a.textContent))), "строки загружены (pageshow " + (early ? "до" : "после") + " DOMContentLoaded)");
    const hist = app.calls("bot_account_history_page").length;
    app.click("me"); await app.tick(30); app.click("stats");
    assert.ok(app.rows().some(a => /Cleveland/.test(a.textContent)), "после профиля строки на месте");
    app.w.dispatchEvent(new app.w.Event("pageshow")); app.d.dispatchEvent(new app.w.Event("visibilitychange")); await app.tick(30);
    assert.ok(app.rows().some(a => /Cleveland/.test(a.textContent)), "после pageshow/visibilitychange строки на месте");
    assert.ok(app.w.__privateRealBets && app.w.__privateRealBets.loaded === true, "приватная память не сброшена");
    assert.equal(app.calls("bot_account_history_page").length, hist, "свежий снимок: профиль и pageshow не перечитывают историю");
    assert.deepEqual(app.errors, []);
  }
}
async function s6_timeout_and_errors() {
  console.log("S6 таймаут истории: конечное состояние, без legacy-запроса, без вечной загрузки, снимок остаётся");
  const server = makeServer(); const app = await openApp({server});
  const ctl = app.ctl(); assert.ok(await app.until(() => ctl.state.historyLoaded && !ctl.state.busy));
  ctl.rpcTimeoutMs = 150; ctl.state.historyAt = Date.now() - 60000; server.gate.add("bot_account_history_page");
  app.click("stats"); await app.tick(400);
  assert.equal(ctl.state.busy, false, "после таймаута экран не занят");
  assert.equal(ctl.state.error, "SOURCE_TIMEOUT");
  assert.equal(app.calls("bot_account_history").length, 0, "таймаут не запускает legacy-запрос");
  assert.ok(app.rows().some(a => /Cleveland/.test(a.textContent)), "последний удачный снимок остался на экране");
  assert.match(app.text(), /Не удалось обновить личную историю/);
  assert.equal(app.w.__acctSync.state, "error");
  server.release("bot_account_history_page"); server.gate.delete("bot_account_history_page");
  console.log("S6b отсутствующий курсорный RPC (404): один legacy-запрос");
  const s2 = makeServer({missingPage: true}); const app2 = await openApp({server: s2});
  assert.ok(await app2.until(() => app2.ctl().state.historyLoaded && !app2.ctl().state.busy));
  assert.equal(app2.calls("bot_account_history").length, 1); assert.equal(app2.ctl().state.historySource, "legacy");
  assert.ok(app2.rows().some(a => /Cleveland/.test(a.textContent)));
  console.log("S6c запрет хранилища и битый снимок: приложение работает, RAM и сеть живы");
  const s3 = makeServer(); const app3 = await openApp({server: s3, denyStorage: true});
  assert.ok(await app3.until(() => app3.rows().some(a => /Cleveland/.test(a.textContent))), "строки при запрещённом localStorage");
  const s4 = makeServer(); const app4 = await openApp({server: s4, storage: {"aisports.account.v1": "{broken json"}});
  assert.ok(await app4.until(() => app4.rows().some(a => /Cleveland/.test(a.textContent))), "строки при битом снимке");
  assert.deepEqual(app.errors.concat(app2.errors, app3.errors, app4.errors), []);
}
async function s7_snapshot_restore() {
  console.log("S7 повторный запуск: снимок своего пользователя виден до сети, чужой — нет");
  const mine = JSON.stringify({v: 1, uid: "111", accountId: account().account_id, at: Date.now() - 60000, account: account(), money: money(), history: [cleveland, claim]});
  const server = makeServer({gate: ["bot_account_history_page", "bot_account_get"]});
  const app = await openApp({server, storage: {"aisports.account.v1": mine}});
  await app.tick(30);
  assert.ok(app.rows().some(a => /Поставлено 3,42 USD/.test(a.textContent)), "карточка из снимка до ответа сети: " + app.text());
  assert.equal(app.ctl().state.restored, true); assert.equal(app.w.__acctRefreshAt, 0, "восстановленный снимок свежим не считается");
  assert.equal(app.calls("bot_account_get").length, 1, "фоновое чтение стартовало сразу");
  server.release("bot_account_get"); await server.waitGate("bot_account_history_page"); server.release("bot_account_history_page");
  assert.ok(await app.until(() => app.ctl().state.restored === false && app.ctl().state.historyLoaded));
  assert.ok(app.rows().some(a => /Kansas City Royals/.test(a.textContent)) || app.rows().some(a => /Cleveland/.test(a.textContent)));
  const foreign = JSON.stringify({v: 1, uid: "999", accountId: account().account_id, at: Date.now() - 60000, account: account(), money: money(), history: [cleveland, claim]});
  const s2 = makeServer({gate: ["bot_account_history_page"]}); const app2 = await openApp({server: s2, storage: {"aisports.account.v1": foreign}});
  await app2.tick(30);
  assert.equal(app2.rows().some(a => /Поставлено/.test(a.textContent)), false, "чужой снимок не показан");
  assert.equal(app2.w.localStorage.getItem("aisports.account.v1"), null, "чужой снимок удалён");
  s2.release("bot_account_history_page");
  assert.deepEqual(app.errors.concat(app2.errors), []);
}
async function s8_user_switch() {
  console.log("S8 пользователь A → B: запоздалый ответ A не появляется у B");
  const server = makeServer(); const app = await openApp({server, user: 111, tag: "A"});
  const ctl = app.ctl(); assert.ok(await app.until(() => ctl.state.historyLoaded && !ctl.state.busy));
  ctl.state.historyAt = Date.now() - 60000; server.gate.add("bot_account_history_page");
  app.click("stats"); await server.waitGate("bot_account_history_page");          // запрос A в полёте
  app.w.Telegram.WebApp = telegram(222, "B"); server.historyByUser = {"222": []};   // смена пользователя: у B покупок нет, у A остаются
  app.click("me"); await app.tick(10);
  assert.equal(app.rows().filter(a => /Поставлено|В расчёте|USD/.test(a.textContent)).length, 0, "после смены пользователя приватные строки очищены");
  server.gate.delete("bot_account_history_page"); server.release("bot_account_history_page");  // поздний ответ A (с покупкой Cleveland) и ответ B
  await app.tick(150); app.click("stats"); await app.tick(30);
  assert.equal(app.rows().filter(a => /Поставлено|В расчёте|USD/.test(a.textContent)).length, 0, "деньги A не появились у B: " + app.text());
  assert.equal((app.w.__privateRealBets && app.w.__privateRealBets.rows || []).length, 0, "приватная память B пуста");
  assert.ok(!(ctl.state.history || []).some(o => o.operation_id === cleveland.operation_id), "история A не записана в сессию B");
  const snap = JSON.parse(app.w.localStorage.getItem("aisports.account.v1"));
  assert.equal(snap.uid, "222", "единственный слот снимка теперь подписан B");
  assert.ok(!snap.history.some(o => o.operation_id === cleveland.operation_id), "в снимке B нет операций A");
  assert.deepEqual(app.errors, []);
}
function s9_widths() {
  console.log("S9 ширины: jsdom раскладку не считает — проверяется только отсутствие фиксированных ширин в карточке");
  const css = html.slice(0, html.indexOf("</style>"));
  const block = css.split("\n").filter(l => /\.pickline|\.pick-more|\.pick-detail/.test(l)).join("\n");
  const fixed = (block.match(/(?<!min-|max-|flex: ?0 0 )width:\s*(\d+)px/g) || []).filter(m => Number(m.match(/\d+/)[0]) > 48);
  assert.deepEqual(fixed, [], "карточка без фиксированных широких элементов: " + fixed.join(","));
  assert.match(block, /overflow-wrap:anywhere/);
  note("S9 фиксированных ширин > 48px в стилях карточки", "0 (раскладка на 320/360/390 в jsdom не измеряется)");
}
(async () => {
  const app = await s1_cold_start(); await s2_navigation(app); await s3_stale_many_initiators(app);
  await s4_archive_kept(); await s5_profile_and_pageshow(); await s6_timeout_and_errors(); await s7_snapshot_restore(); await s8_user_switch(); s9_widths();
  console.log("ALL PASS: jsdom preload stand (" + results.length + " измерений), живой сети и WebView не было");
  fs.mkdirSync(path.join(repo, "artifacts"), {recursive: true});
  fs.writeFileSync(path.join(repo, "artifacts", "preload-jsdom-measurements.json"), JSON.stringify({build: BUILD, at: new Date().toISOString(), results}, null, 1));
  process.exit(0);
})().catch(e => { console.error("FAIL:", e && e.stack || e); process.exit(1); });
