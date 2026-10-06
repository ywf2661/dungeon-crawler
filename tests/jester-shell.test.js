"use strict";
// 실행: node tests/jester-shell.test.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = vm.createContext({console, Math});
vm.runInContext(fs.readFileSync('js/jester-shell.js','utf8'), ctx, {filename:'js/jester-shell.js'});
const run = code => vm.runInContext(code, ctx);

assert.strictEqual(run('JESTER_SHELL_WEIGHT'), 3);
assert.deepStrictEqual(JSON.parse(run('JSON.stringify(JESTER_SHELL_ROUNDS)')), [{swaps:5,ms:420},{swaps:7,ms:320},{swaps:9,ms:240}]);

// 등장 조건
assert.strictEqual(run("jesterShellEligible({job:'jester'})"), true);
assert.strictEqual(run("jesterShellEligible({job:'jester', specialization:'jester_debtcollector'})"), true);
assert.strictEqual(run("jesterShellEligible({job:'mage', job2:'jester'})"), false);
assert.strictEqual(run("jesterShellEligible({job:'jester', jesterShellSeen:true})"), false);
assert.strictEqual(run('jesterShellEligible(null)'), false);

// 판돈
assert.strictEqual(run("jesterShellStake({job:'jester'}, 10)"), 60);
assert.strictEqual(run("jesterShellStake({job:'jester', specialization:'jester_goldbet'}, 10)"), 120);

// 정산(수령액, 판돈 포함)
assert.strictEqual(run('jesterShellPayout(60, 0, false)'), 0);
assert.strictEqual(run('jesterShellPayout(60, 1, false)'), 60);
assert.strictEqual(run('jesterShellPayout(60, 2, false)'), 120);
assert.strictEqual(run('jesterShellPayout(60, 3, false)'), 180);
assert.strictEqual(run('jesterShellPayout(60, 3, true)'), 240);
// 무작위로 찍을 때 기대 수령액 = 판돈 1배(0:8/27, 1:12/27, 2:6/27, 3:1/27)
const ev = (8*0 + 12*1 + 6*2 + 1*3)/27;
assert.ok(Math.abs(ev - 1) < 1e-12);

// 섞기 순서: 길이, 서로 다른 두 컵, 범위
const swaps = JSON.parse(run('JSON.stringify(jesterShellSwaps(9))'));
assert.strictEqual(swaps.length, 9);
swaps.forEach(([a,b])=>{ assert.ok(a!==b); assert.ok(a>=0&&a<=2&&b>=0&&b<=2); });
for(let i=0;i<200;i++){ JSON.parse(run('JSON.stringify(jesterShellSwaps(5))')).forEach(([a,b])=> assert.ok(a!==b)); }
// rng 경계에서도 a≠b
JSON.parse(run('JSON.stringify(jesterShellSwaps(3, ()=>0))')).forEach(([a,b])=> assert.ok(a!==b));
JSON.parse(run('JSON.stringify(jesterShellSwaps(3, ()=>0.999999))')).forEach(([a,b])=> assert.ok(a!==b));

// 동전 추적
assert.strictEqual(run('jesterShellTrack(1, [[0,1]])'), 0);
assert.strictEqual(run('jesterShellTrack(1, [[0,2]])'), 1, '관계없는 컵끼리 바꾸면 그대로');
assert.strictEqual(run('jesterShellTrack(1, [[1,2],[0,2]])'), 0);
assert.strictEqual(run('jesterShellTrack(2, [])'), 2);

// 바꿔치기 대상
run(`var map = [
  [{id:'a', type:'combat'}],
  [{id:'b', type:'shop'}, {id:'c', type:'relic'}],
  [{id:'d', type:'elite'}, {id:'e', type:'midboss'}, {id:'g', type:'curse'}],
  [{id:'f', type:'boss'}],
];`);
assert.deepStrictEqual(JSON.parse(run('JSON.stringify(nodeSwapCandidates(map, 0).map(n=>n.id))')), ['b','d']);
assert.deepStrictEqual(JSON.parse(run('JSON.stringify(nodeSwapCandidates(map, 1).map(n=>n.id))')), ['d'], '지난 줄 제외');
assert.deepStrictEqual(JSON.parse(run('JSON.stringify(nodeSwapCandidates(map, -1).map(n=>n.id))')), ['a','b','d'], '구간 시작 전엔 첫 줄도');
assert.strictEqual(run("canSwapNodePair({type:'shop'},{type:'elite'})"), true);
assert.strictEqual(run("canSwapNodePair({type:'shop'},{type:'shop'})"), false, '같은 종류 불가');
assert.strictEqual(run("canSwapNodePair({type:'shop'},{type:'relic'})"), false, '제단 불가');
assert.strictEqual(run("canSwapNodePair({type:'boss'},{type:'combat'})"), false, '보스 불가');
assert.strictEqual(run('canSwapNodePair(null,{type:"combat"})'), false);

// 사용 가능 여부
run("var gp = {relics:['relic_dealerglove'], tierIndex:2, nodeMap:map, nodeRow:0};");
assert.strictEqual(run('nodeSwapAvailable(gp)'), true);
assert.strictEqual(run('nodeSwapAvailable(Object.assign({}, gp, {nodeSwapTier:2}))'), false, '이번 구간 이미 사용');
assert.strictEqual(run('nodeSwapAvailable(Object.assign({}, gp, {nodeSwapTier:1}))'), true, '지난 구간에 쓴 건 무관');
assert.strictEqual(run('nodeSwapAvailable(Object.assign({}, gp, {relics:[]}))'), false);
assert.strictEqual(run('nodeSwapAvailable(Object.assign({}, gp, {nodeRow:1}))'), false, '남은 대상이 한 종류뿐');
assert.strictEqual(run('nodeSwapAvailable(Object.assign({}, gp, {nodeMap:null}))'), false);

// 체크포인트 마이그레이션
run('var oc = {gold:1}; migrateJesterShellCheckpoint(oc);');
assert.strictEqual(run('oc.jesterShellSeen'), false);
assert.strictEqual(run('oc.nodeSwapTier'), null);
run('var nc = {jesterShellSeen:true, nodeSwapTier:3}; migrateJesterShellCheckpoint(nc);');
assert.strictEqual(run('nc.jesterShellSeen'), true);
assert.strictEqual(run('nc.nodeSwapTier'), 3);
run('migrateJesterShellCheckpoint(null);');

console.log('jester-shell: OK');
