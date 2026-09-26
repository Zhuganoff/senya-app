const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.resolve(__dirname, '../aisports/index.html'), 'utf8');
function segment(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start);
  return html.slice(a, b);
}
const context = {APP_PROFILE: 'aisports', OFFICIAL_PERSONAL_LISTS: true,
  privateRows: [], personalBets: () => context.privateRows,
  ICO_BY_SPORT: {mlb: '⚾ ', tennis: '🎾 ', soccer: '⚽ ', khl: '🏒 ', nfl: '🏈 '}};
vm.createContext(context);
vm.runInContext(segment('function selectedPicks(feed){', '// v106 (блок C')
  + segment('function feedBetToRow(b){', 'function feedSession(feed, d){'), context);
const fixture = '2026-09-25T22:41:00Z|pittsburgh pirates@detroit tigers';
const pick = (sport, entry_id, side='home') => ({sport, entry_id, side,
  match: 'Pittsburgh Pirates @ Detroit Tigers', commence: '2026-09-25T22:41:00+00:00',
  session_date: '2026-09-25', real_stake: 0});
test('official selections contain only MLB and soccer; sandbox retains its sports', () => {
  const feed = {mode:'PAPER_ONLY', real_stake:0,
    bets:[pick('mlb','m'),pick('soccer','s')], session:{bets_list:[pick('mlb','m')]},
    history:[{bets_list:[pick('tennis','t'),pick('khl','k'),pick('nfl','n')]}]};
  assert.deepEqual([...new Set(context.selectedPicks(feed).map(b=>b.sport))].sort(), ['mlb','soccer']);
  assert.equal(context.selectedPicks(feed).length, 2);
  context.OFFICIAL_PERSONAL_LISTS = false;
  assert.equal(context.selectedPicks(feed).length, 5);
  context.OFFICIAL_PERSONAL_LISTS = true;
  assert.equal(context.selectedPicks({...feed, mode:'REAL'}).length, 0);
  assert.equal(context.selectedPicks({...feed, bets:[{...pick('mlb','unsafe'), real_stake:1}],session:{bets_list:[]},history:[]}).length, 0);
});
test('green check requires the same fixture, side and current private history', () => {
  const row = pick('mlb','m');
  assert.equal(context.selectionEventId(row), fixture);
  context.privateRows = [{sport:'mlb',fixture_id:fixture,side:'away',_realTrade:true}];
  assert.equal(context.forecastRow(row)._realTrade,false);
  context.privateRows = [{sport:'mlb',fixture_id:fixture.replace('2026-09-25','2026-09-24'),side:'home',_realTrade:true}];
  assert.equal(context.forecastRow(row)._realTrade,false);
  context.privateRows = [{sport:'mlb',fixture_id:fixture,side:'home',_realTrade:true}];
  assert.equal(context.forecastRow(row)._realTrade,true);
  context.privateRows = [];
  assert.equal(context.forecastRow(row)._realTrade,false);
});
