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

// ── 숨겨진 장소 ──
assert.strictEqual(run('JESTER_TRUTH_COUNT'), 5);

// 드러난 비밀 칸은 바꿔치기 대상이 아니다
assert.deepStrictEqual(JSON.parse(run(`JSON.stringify(nodeSwapCandidates([[{id:'s',type:'secret'},{id:'k',type:'shop'}]], -1).map(n=>n.id))`)), ['k']);

// 비밀 배정: 진짜 1 + 미끼 최대 2, 전부 후보 안, 중복 없음
run(`var smap = [
  [{id:'x0', type:'combat'}],
  [{id:'s1', type:'shop'}, {id:'s2', type:'event'}, {id:'s3', type:'relic'}],
  [{id:'s4', type:'elite'}, {id:'s5', type:'rest'}],
  [{id:'sb', type:'boss'}],
];`);
for(let i=0;i<100;i++){
  const sec = JSON.parse(run('JSON.stringify(assignNodeSecret(smap, 0))'));
  const pool = ['s1','s2','s4','s5'];
  assert.ok(pool.includes(sec.id));
  assert.strictEqual(sec.decoys.length, 2);
  sec.decoys.forEach(d=>{ assert.ok(pool.includes(d)); assert.notStrictEqual(d, sec.id); });
  assert.notStrictEqual(sec.decoys[0], sec.decoys[1]);
  assert.strictEqual(sec.found, false);
}
// 후보가 적으면 있는 만큼, 없으면 null
assert.strictEqual(JSON.parse(run('JSON.stringify(assignNodeSecret(smap, 1))')).decoys.length, 1, '남은 후보 s4,s5 → 진짜 1 + 미끼 1');
assert.strictEqual(run('assignNodeSecret(smap, 2)'), null);
assert.strictEqual(run('assignNodeSecret(null, -1)'), null);
// rng 경계
assert.ok(['s1','s2','s4','s5'].includes(JSON.parse(run('JSON.stringify(assignNodeSecret(smap, 0, ()=>0))')).id));
assert.ok(['s1','s2','s4','s5'].includes(JSON.parse(run('JSON.stringify(assignNodeSecret(smap, 0, ()=>0.999999))')).id));

// 바꿔치기 판정
run("var sec = {id:'s2', decoys:['s1','s4'], found:false};");
assert.strictEqual(run("resolveSecretSwap({id:'s2'},{id:'s5'},sec).id"), 's2');
assert.strictEqual(run("resolveSecretSwap({id:'s5'},{id:'s2'},sec).id"), 's2');
assert.strictEqual(run("resolveSecretSwap({id:'s1'},{id:'s4'},sec)"), null, '미끼만');
assert.strictEqual(run("resolveSecretSwap({id:'s2'},{id:'s5'},Object.assign({},sec,{found:true}))"), null, '이미 찾음');
assert.strictEqual(run("resolveSecretSwap({id:'s2'},{id:'s5'},null)"), null);

// 조각 순서
assert.strictEqual(run('nextTruthIndex([])'), 1);
assert.strictEqual(run('nextTruthIndex([1,2])'), 3);
assert.strictEqual(run('nextTruthIndex([2,3])'), 1, '가장 앞 미열람');
assert.strictEqual(run('nextTruthIndex([1,2,3,4,5])'), -1);
assert.strictEqual(run('nextTruthIndex(null)'), 1);
assert.strictEqual(run('truthComplete([5,4,3,2,1])'), true);
assert.strictEqual(run('truthComplete([1,2,3,4])'), false);

// 종류 굴리기
assert.strictEqual(run('rollSecretKind([], ()=>0.59)'), 'story');
assert.strictEqual(run('rollSecretKind([], ()=>0.6)'), 'den');
assert.strictEqual(run('rollSecretKind([1,2,3,4,5], ()=>0)'), 'den', '다 모으면 항상 도박장');

// 도박장 탁자
assert.strictEqual(JSON.parse(run("JSON.stringify(pickDenTables(['a','b','c'], 2))")).length, 2);
assert.deepStrictEqual(JSON.parse(run("JSON.stringify(pickDenTables(['a','b'], 2).sort())")), ['a','b']);
assert.strictEqual(JSON.parse(run("JSON.stringify(pickDenTables(['a'], 2))")).length, 1);
for(let i=0;i<50;i++){ const t = JSON.parse(run("JSON.stringify(pickDenTables(['a','b','c'], 2))")); assert.notStrictEqual(t[0], t[1]); }

// 엔딩 줄 끼우기
run(`var pl = ['왕관이 굴러떨어진다.', '손자국.', '"...하나를 지키지 못했다. 그래서 남은 이들만큼은, 놓을 수가 없었지."', '원혼들.'];`);
run("insertTruthEndingLines(pl, 'progenitor');");
assert.strictEqual(run('pl[3]'), run('TRUTH_ENDING_LINES.progenitor[0]'));
assert.strictEqual(run('pl.length'), 4 + run('TRUTH_ENDING_LINES.progenitor.length'));
assert.strictEqual(run('pl[pl.length-1]'), '원혼들.');
run(`var wl = ['시계가 산산조각 난다.', {text:'"…또 왔군."', title:'아이온'}];`);
run("insertTruthEndingLines(wl, 'witch');");
assert.strictEqual(run('wl[1]'), run('TRUTH_ENDING_LINES.witch[0]'));
assert.strictEqual(run('wl[wl.length-1].title'), '아이온');
run("var nl = ['a','b']; insertTruthEndingLines(nl, 'progenitor');");
assert.strictEqual(run('nl[1]'), run('TRUTH_ENDING_LINES.progenitor[0]'), '앵커가 없으면 첫 줄 뒤');
run("var xl = ['a']; insertTruthEndingLines(xl, 'nope');");
assert.strictEqual(run('xl.length'), 1);
console.log('jester-shell: OK');
