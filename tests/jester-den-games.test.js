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

console.log('jester-den-games: OK');
