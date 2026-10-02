"use strict";
// 실행: node tests/jester-table.test.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = vm.createContext({console, Math});
vm.runInContext(fs.readFileSync('js/jester-table.js','utf8'), ctx, {filename:'js/jester-table.js'});
const run = code => vm.runInContext(code, ctx);

assert.strictEqual(run('JESTER_TABLE_WEIGHT'), 3);
assert.strictEqual(run('JESTER_TABLE_WIN_STREAK'), 3);

// 등장 조건: 기본 직업이 도박사인 캐릭터만, 런당 1회
assert.strictEqual(run("jesterTableEligible({job:'jester'})"), true);
assert.strictEqual(run("jesterTableEligible({job:'jester', specialization:'jester_goldbet'})"), true, '전직 후에도');
assert.strictEqual(run("jesterTableEligible({job:'mage', job2:'jester'})"), false, '기본 직업이 도박사가 아니면 없음');
assert.strictEqual(run("jesterTableEligible({job:'warrior'})"), false);
assert.strictEqual(run("jesterTableEligible({job:'jester', jesterTableSeen:true})"), false, '런당 1회');
assert.strictEqual(run('jesterTableEligible(null)'), false);

// 판돈: 30 + 층×3, 황금 도박사 2배
assert.strictEqual(run("jesterTableStake({job:'jester'}, 10)"), 60);
assert.strictEqual(run("jesterTableStake({job:'jester', specialization:'jester_goldbet'}, 10)"), 120);
assert.strictEqual(run("jesterTableStake({job:'jester', specialization:'jester_debtcollector'}, 0)"), 30);

// 배당(수령액, 판돈 포함)
assert.strictEqual(run('jesterTablePayout(60, 0, false)'), 0);
assert.strictEqual(run('jesterTablePayout(60, 1, false)'), 120);
assert.strictEqual(run('jesterTablePayout(60, 2, false)'), 180);
assert.strictEqual(run('jesterTablePayout(60, 3, false)'), 60, '3연승은 판돈 반환(+유물)');
assert.strictEqual(run('jesterTablePayout(60, 3, true)'), 240, '유물 보유 시 4배');

// 판정: 엄격 비교, 같은 숫자는 패배
assert.strictEqual(run('jesterTableJudge(7, 8, true)'), true);
assert.strictEqual(run('jesterTableJudge(7, 6, true)'), false);
assert.strictEqual(run('jesterTableJudge(7, 6, false)'), true);
assert.strictEqual(run('jesterTableJudge(7, 7, true)'), false, '같은 숫자 패배(높다)');
assert.strictEqual(run('jesterTableJudge(7, 7, false)'), false, '같은 숫자 패배(낮다)');

// 카드: 1~13, rng 경계
assert.strictEqual(run('jesterTableDraw(()=>0)'), 1);
assert.strictEqual(run('jesterTableDraw(()=>0.999999)'), 13);
for(let i=0;i<500;i++){ const c = run('jesterTableDraw()'); assert.ok(c>=1 && c<=13 && Number.isInteger(c)); }

// 카드 표기
assert.strictEqual(run('jesterTableCardLabel(1)'), 'A');
assert.strictEqual(run('jesterTableCardLabel(7)'), '7');
assert.strictEqual(run('jesterTableCardLabel(10)'), '10');
assert.strictEqual(run('jesterTableCardLabel(11)'), 'J');
assert.strictEqual(run('jesterTableCardLabel(12)'), 'Q');
assert.strictEqual(run('jesterTableCardLabel(13)'), 'K');

// 예전 세이브의 마을 체크포인트(필드 없음)는 "안 봄"으로 채운다 — 롤백으로 유물이 사라져도 다시 얻을 수 있게
run("var oldCp = {gold:100}; migrateJesterCheckpoint(oldCp);");
assert.strictEqual(run("oldCp.jesterTableSeen"), false);
run("var newCp = {jesterTableSeen:true}; migrateJesterCheckpoint(newCp);");
assert.strictEqual(run("newCp.jesterTableSeen"), true, "이미 있는 값은 그대로");
run("migrateJesterCheckpoint(null);");

console.log('jester-table: OK');
