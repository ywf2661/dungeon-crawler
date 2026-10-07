"use strict";
// 실행: node tests/jester-den-games.test.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = vm.createContext({console, Math});
vm.runInContext(fs.readFileSync('js/jester-den-games.js','utf8'), ctx, {filename:'js/jester-den-games.js'});
const run = code => vm.runInContext(code, ctx);
const J = x => JSON.parse(JSON.stringify(x));
const seq = (...v)=>{ let i=0; return ()=> v[i++ % v.length]; };
let seed = 12345; const lcg = ()=>{ seed = (seed*1103515245 + 12345) % 2147483648; return seed/2147483648; };

// ── 쥐 경주 ──
assert.strictEqual(run('RAT_TRACK'), 12);
assert.strictEqual(run('RAT_HALF'), 6);
const kinds = J(run('Object.keys(RAT_KINDS)'));
assert.deepStrictEqual(kinds, ['gray','coward','late','plague','glutton','tailer']);
for(let i=0;i<200;i++){ const L = J(ctx.ratLineup()); assert.strictEqual(new Set(L).size, 4); assert.ok(L.every(k=>kinds.includes(k))); }
for(let i=0;i<300;i++){ const c = J(ctx.ratCrumbs()); assert.strictEqual(c.length, 2); assert.ok(c[0]<c[1] && c[0]>=2 && c[1]<=10); }

// 회색 꼬리: 0.5 → 2칸
let st = ctx.ratNewRace(['gray','gray','gray','gray'], []);
assert.deepStrictEqual(J(ctx.ratStep(st, seq(0.5))), {half:false, finished:false});
assert.deepStrictEqual(J(st.rats.map(r=>r.pos)), [2,2,2,2]);
ctx.ratStep(st, seq(0.7)); // 0.7 → 1칸
assert.deepStrictEqual(J(st.rats.map(r=>r.pos)), [3,3,3,3]);

// 겁쟁이: 뒤에 있던 역병쥐가 앞지르면 다음 틱 멈칫. 이 틱에 선두가 6을 넘어 반환점 보고.
st = ctx.ratNewRace(['coward','plague','gray','gray'], []);
st.rats[0].pos = 5; st.rats[1].pos = 4;
assert.deepStrictEqual(J(ctx.ratStep(st, seq(0.9, 0.1, 0.9, 0.9))), {half:true, finished:false});
assert.deepStrictEqual(J(st.rats.map(r=>r.pos)), [6,7,1,1]);
assert.strictEqual(st.rats[0].scared, true);
ctx.ratStep(st, seq(0.1)); // 겁쟁이 0칸(난수 안 씀), 역병쥐 3칸, 회색 2칸씩
assert.deepStrictEqual(J(st.rats.map(r=>r.pos)), [6,10,3,3]);
assert.strictEqual(st.rats[0].scared, false, '다시 추월당하지 않았으면 풀림');

// 늦둥이: 6칸 전 1칸(0.5) / 이후 2칸(0.5) / 이후 3칸(0.1)
st = ctx.ratNewRace(['late','gray','gray','gray'], []);
ctx.ratStep(st, seq(0.5, 0.9, 0.9, 0.9)); assert.strictEqual(st.rats[0].pos, 1);
st.rats[0].pos = 6; ctx.ratStep(st, seq(0.5, 0.9, 0.9, 0.9)); assert.strictEqual(st.rats[0].pos, 8);
ctx.ratStep(st, seq(0.1, 0.9, 0.9, 0.9)); assert.strictEqual(st.rats[0].pos, 11);

// 역병쥐: 0.1 → 3, 0.3 → 0, 0.9 → 1
st = ctx.ratNewRace(['plague','gray','gray','gray'], []);
ctx.ratStep(st, seq(0.1, 0.9, 0.9, 0.9)); assert.strictEqual(st.rats[0].pos, 3);
ctx.ratStep(st, seq(0.3, 0.9, 0.9, 0.9)); assert.strictEqual(st.rats[0].pos, 3);
ctx.ratStep(st, seq(0.9, 0.9, 0.9, 0.9)); assert.strictEqual(st.rats[0].pos, 4);

// 먹보: 3칸 가려다 부스러기(3)에서 멈추고 다음 틱은 쉰다, 부스러기 소비
st = ctx.ratNewRace(['glutton','gray','gray','gray'], [3, 9]);
st.rats[0].pos = 1;
ctx.ratStep(st, seq(0.1, 0.9, 0.9, 0.9));
assert.strictEqual(st.rats[0].pos, 3); assert.deepStrictEqual(J(st.crumbs), [9]); assert.strictEqual(st.rats[0].eating, 1);
ctx.ratStep(st, seq(0.9)); assert.strictEqual(st.rats[0].pos, 3, '먹느라 쉰다');
ctx.ratStep(st, seq(0.9)); assert.strictEqual(st.rats[0].pos, 5, '0.9 → 2칸');

// 따라쟁이: 선두 1~2칸 뒤면 0.5 확률로 +1
st = ctx.ratNewRace(['tailer','gray','gray','gray'], []);
st.rats[0].pos = 4; st.rats[1].pos = 5;
ctx.ratStep(st, seq(0.9, 0.1, 0.9, 0.9, 0.9)); assert.strictEqual(st.rats[0].pos, 6);
st = ctx.ratNewRace(['tailer','gray','gray','gray'], []);
st.rats[0].pos = 1; st.rats[1].pos = 5;
ctx.ratStep(st, seq(0.9)); assert.strictEqual(st.rats[0].pos, 2, '멀면 보너스 없음');

// 발 걸기: 그 틱 0칸, 난수 안 씀, 풀림
st = ctx.ratNewRace(['gray','gray','gray','gray'], []);
st.rats[0].tripped = true;
ctx.ratStep(st, seq(0.5));
assert.deepStrictEqual(J(st.rats.map(r=>r.pos)), [0,2,2,2]); assert.strictEqual(st.rats[0].tripped, false);

// 결승: 같은 틱 동착이면 더 멀리 간 쥐, 같으면 난수. 결승 틱엔 반환점 보고 안 함.
st = ctx.ratNewRace(['gray','gray','gray','gray'], []);
st.rats[0].pos = 11; st.rats[1].pos = 11;
assert.deepStrictEqual(J(ctx.ratStep(st, seq(0.5, 0.5, 0.9, 0.9, 0.9))), {half:false, finished:true});
assert.strictEqual(st.winner, 1, '13·13 동착 → 0.9로 두 번째');
st = ctx.ratNewRace(['gray','gray','gray','gray'], []);
st.rats[0].pos = 11; st.rats[1].pos = 11;
ctx.ratStep(st, seq(0.5, 0.9, 0.9, 0.9, 0.0)); // 13 vs 12
assert.strictEqual(st.winner, 0);

// 배당: 4개, 1.2~30, 소수 첫째 자리, 내재 확률 합이 대략 0.9~1.1
const odds = J(ctx.ratOdds(['gray','coward','late','plague'], [3,8], lcg, 600));
assert.strictEqual(odds.length, 4);
odds.forEach(o=>{ assert.ok(o>=1.2 && o<=30, String(o)); assert.ok(Math.abs(o*10 - Math.round(o*10)) < 1e-9); });
const implied = odds.reduce((s,o)=> s + 0.92/o, 0);
assert.ok(implied > 0.85 && implied < 1.15, String(implied));

// 정산
assert.strictEqual(ctx.ratPayout(60, 3.5, {won:true}), 210);
assert.strictEqual(ctx.ratPayout(60, 3.5, {won:true, raised:true}), 420);
assert.strictEqual(ctx.ratPayout(60, 3.5, {cashedOut:true}), 30);
assert.strictEqual(ctx.ratPayout(60, 3.5, {won:false}), 0);
assert.strictEqual(ctx.ratPayout(61, 1.5, {won:true}), 91, '내림');

// ── 도둑잡기 ──
assert.strictEqual(run('THIEF_JOKER'), 'X');
for(let i=0;i<500;i++){
  const d = J(ctx.thiefDeal());
  ['A','K','Q'].forEach(c=>{ assert.strictEqual(d.me.filter(x=>x===c).length, 1); assert.strictEqual(d.dealer.filter(x=>x===c).length, 1); });
  assert.strictEqual(d.me.concat(d.dealer).filter(x=>x==='X').length, 1);
  assert.strictEqual(d.me.includes('X'), d.jokerMine);
}
assert.strictEqual(J(ctx.thiefDeal(seq(0.1, 0.5))).jokerMine, true);
assert.strictEqual(J(ctx.thiefDeal(seq(0.9, 0.5))).jokerMine, false);
run("var f1 = ['A','X'], t1 = ['A','K']; var r1 = thiefTake(f1, 0, t1);");
assert.deepStrictEqual(J(run('r1')), {card:'A', paired:true});
assert.deepStrictEqual(J(run('[f1, t1]')), [['X'], ['K']]);
run("var f2 = ['X'], t2 = ['A']; var r2 = thiefTake(f2, 0, t2);");
assert.deepStrictEqual(J(run('r2')), {card:'X', paired:false});
assert.deepStrictEqual(J(run('[f2, t2]')), [[], ['A','X']]);
assert.strictEqual(run("thiefWinner([], ['X'])"), 'me');
assert.strictEqual(run("thiefWinner(['X'], [])"), 'dealer');
assert.strictEqual(run("thiefWinner(['A'], ['A','X'])"), null);
assert.strictEqual(ctx.thiefTell(true, ()=>0.69), 'flinch');
assert.strictEqual(ctx.thiefTell(true, ()=>0.7), 'calm');
assert.strictEqual(ctx.thiefTell(false, ()=>0.29), 'flinch');
assert.strictEqual(ctx.thiefTell(false, ()=>0.3), 'calm');
assert.strictEqual(run("thiefDealerPick(['A','K','X'], ()=>0.99)"), 2);
assert.strictEqual(run("thiefDealerPick(['A','K','X'], ()=>0)"), 0);
assert.strictEqual(ctx.thiefPayout(60, true), 120);
assert.strictEqual(ctx.thiefPayout(60, false), 0);
// 무작위로 끝까지 두면 반드시 한쪽이 이긴다(조커를 쥔 쪽이 진다)
for(let g=0; g<2000; g++){
  run("var d = thiefDeal(), me = d.me, de = d.dealer, turn = 0, w = null;" +
      "while(!(w = thiefWinner(me, de))){ if(turn++ % 2 === 0) thiefTake(de, thiefDealerPick(de), me); else thiefTake(me, thiefDealerPick(me), de); if(turn > 50) break; }");
  const w = run('w'), loserHand = J(run("w==='me' ? de : me"));
  assert.ok(w==='me' || w==='dealer');
  assert.deepStrictEqual(loserHand, ['X']);
}

// ── 공통 보상 ──
assert.strictEqual(ctx.pickDenPrizeKind(()=>0), 'potion');
assert.strictEqual(ctx.pickDenPrizeKind(()=>0.5), 'stone');
assert.strictEqual(ctx.pickDenPrizeKind(()=>0.999), 'seal');
assert.strictEqual(ctx.denRelicRoll(false, false, ()=>0), null);
assert.strictEqual(ctx.denRelicRoll(true, false, ()=>0.49), 'relic');
assert.strictEqual(ctx.denRelicRoll(true, false, ()=>0.5), null);
assert.strictEqual(ctx.denRelicRoll(true, true, ()=>0.1), 'gold');
assert.strictEqual(ctx.denRelicRoll(true, true, ()=>0.9), null);

// ── 벼랑 끝의 촛불 ──
assert.strictEqual(run('EDGE_CANDLE_RELIC'), 'relic_edgecandle');
assert.strictEqual(run("getLowHpLuckBonus({relics:['relic_edgecandle'], hp:30, maxhp:100})"), 0.2, '30%는 켜짐');
assert.strictEqual(run("getLowHpLuckBonus({relics:['relic_edgecandle'], hp:31, maxhp:100})"), 0, '31%는 꺼짐');
assert.strictEqual(run("getLowHpLuckBonus({relics:[], hp:1, maxhp:100})"), 0, '유물 없음');
assert.strictEqual(run("getLowHpLuckBonus(null)"), 0);

// ── 도박사 유물 세트: 보스전 딜러의 판 ──
const SET = "['relic_aceinsleeve','relic_dealerglove','relic_edgecandle']";
assert.strictEqual(run(`jesterSetComplete({relics:${SET}})`), true);
assert.strictEqual(run("jesterSetComplete({relics:['relic_aceinsleeve','relic_dealerglove']})"), false);
assert.strictEqual(run('jesterSetComplete(null)'), false);
assert.strictEqual(run(`bossGambleEligible({relics:${SET}, nodeCurrentId:'t0boss'}, {isBoss:true})`), true);
assert.strictEqual(run(`bossGambleEligible({relics:${SET}, nodeCurrentId:'t0r1n0'}, {isBoss:false})`), false, '보스 아님');
assert.strictEqual(run(`bossGambleEligible({relics:['relic_aceinsleeve'], nodeCurrentId:'t0boss'}, {isBoss:true})`), false, '세트 미완성');
assert.strictEqual(run(`bossGambleEligible({relics:${SET}, nodeCurrentId:'t0boss', bossGambleUsed:'t0boss'}, {isBoss:true})`), false, '이 칸에서 이미 걸었음');
assert.strictEqual(run(`bossGambleEligible({relics:${SET}, nodeCurrentId:'t1boss', bossGambleUsed:'t0boss'}, {isBoss:true})`), true, '다른 칸');
assert.strictEqual(run(`bossGambleEligible({relics:${SET}, nodeCurrentId:null, bossGambleUsed:'boss'}, {isBoss:true})`), false, '칸 id 없으면 boss 키');
assert.strictEqual(run(`bossGambleEligible({relics:${SET}}, null)`), false);
assert.deepStrictEqual(J(run('BOSS_GAMBLE_GAMES')), ['table','shell','rats','thief']);
assert.strictEqual(run("bossGambleGame({isBoss:true, isFinal:true}, ()=>0)"), 'final21');
assert.strictEqual(run("bossGambleGame({isBoss:true}, ()=>0)"), 'table');
assert.strictEqual(run("bossGambleGame({isBoss:true}, ()=>0.999)"), 'thief');
assert.strictEqual(run('BOSS_TABLE_STREAK'), 2);
assert.strictEqual(run('BOSS_SHELL_HITS'), 2);
// 스물하나: A는 11, 넘으면 1
assert.strictEqual(run('bjTotal([1,13])'), 21);
assert.strictEqual(run('bjTotal([1,1])'), 12);
assert.strictEqual(run('bjTotal([10,9,5])'), 24);
assert.strictEqual(run('bjTotal([1,5,10])'), 16);
assert.strictEqual(run('bjTotal([1,1,9])'), 21);
assert.strictEqual(run('bjTotal([12,11])'), 20, 'J·Q·K는 10');
assert.strictEqual(run('bjDealerHits([10,6])'), true);
assert.strictEqual(run('bjDealerHits([10,7])'), false);
assert.strictEqual(run('bjDealerHits([1,6])'), false, '소프트 17도 멈춘다');
assert.strictEqual(run('bjOutcome([10,9,5],[10,7])'), 'lose', '내가 넘으면 패배');
assert.strictEqual(run('bjOutcome([10,9],[10,6,8])'), 'win', '보스가 넘으면 승리');
assert.strictEqual(run('bjOutcome([10,9],[10,7])'), 'win');
assert.strictEqual(run('bjOutcome([10,7],[10,9])'), 'lose');
assert.strictEqual(run('bjOutcome([10,8],[9,9])'), 'push');
// 결과 문구: 왜 이겼는지/졌는지 보여 준다
assert.strictEqual(run("bjResultText([7,9,6],[1,12],'시조')"), '22 — 21을 넘었다. 졌다.');
assert.strictEqual(run("bjResultText([10,9],[10,6,8],'시조')"), '시조 24 — 21을 넘었다. 이겼다.');
assert.strictEqual(run("bjResultText([10,9],[10,7],'시조')"), '19 대 17 — 내가 21에 더 가깝다. 이겼다.');
assert.strictEqual(run("bjResultText([10,8],[1,12],'시조')"), '18 대 21 — 시조이(가) 21에 더 가깝다. 졌다.');
assert.strictEqual(run("bjResultText([10,8],[9,9],'시조')"), '18 대 18 — 비겼다. 다시 나눈다.');

// ── 유물 정의(relics.js): 이벤트 전용(제단 제외) + 도감 완성 조건 제외 ──
const rctx = vm.createContext({console, Math});
vm.runInContext(fs.readFileSync('js/relics.js','utf8'), rctx, {filename:'js/relics.js'});
const rrun = code => vm.runInContext(code, rctx);
assert.strictEqual(rrun("!!(RELICS.relic_edgecandle && RELICS.relic_edgecandle.eventOnly)"), true);
assert.strictEqual(rrun("RELICS.relic_edgecandle.dexOptional"), true);
assert.strictEqual(rrun("RELIC_ALTAR_POOL.includes('relic_edgecandle')"), false, '제단 제외');
assert.strictEqual(rrun("Object.keys(RELICS).filter(id=>RELICS[id].dexOptional).join()"), 'relic_edgecandle', '도감 선택 유물은 촛불 하나');

console.log('jester-den-games: OK');
