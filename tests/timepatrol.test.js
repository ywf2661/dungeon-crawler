"use strict";
// 실행: node tests/timepatrol.test.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = vm.createContext({console});
['js/data/skills.js','js/data/jobs.js','js/combat/timepatrol.js'].forEach(f=>{
  vm.runInContext(fs.readFileSync(f,'utf8'), ctx, {filename:f});
});
const run = code => vm.runInContext(code, ctx);
const arr = code => Array.from(run(code));

// 풀 규모와 유효성
const normal = arr('TP_POOL_NORMAL'), ult = arr('TP_POOL_ULT');
assert.strictEqual(normal.length, 21, '일반 21개');
assert.strictEqual(ult.length, 10, '궁극기 10개');
assert.strictEqual(new Set(normal.concat(ult)).size, 31, '중복 없음');
normal.concat(ult).forEach(k=>{
  const t = run(`SKILLDB['${k}'] && SKILLDB['${k}'].type`);
  assert.ok(t, `SKILLDB에 없음: ${k}`);
  assert.ok(!['passive','arm','elementpact','chalnaReserve'].includes(t), `풀에 들어가면 안 되는 타입: ${k}(${t})`);
});
ult.forEach(k=> assert.ok(run(`SKILLDB['${k}'].cooldown===3`) , `궁극기는 쿨 3: ${k}`));

// 위력/가중치 수치 (스펙: 궁극기 확률 12% → 27%)
assert.ok(Math.abs(run('tpBorrowPower(0)') - 0.7) < 1e-9);
assert.ok(Math.abs(run('tpBorrowPower(5)') - 1.0) < 1e-9);
assert.ok(Math.abs(run('tpBorrowPower(9)') - 1.0) < 1e-9, '상한 100%');
const ultShare = c => { const u = 10*run(`tpWeight('jesterAllIn',${c})`); return u/(u+21); };
assert.ok(Math.abs(ultShare(0) - 3/24) < 1e-9);
assert.ok(Math.abs(ultShare(5) - 8/29) < 1e-9);
assert.strictEqual(run("tpWeight('tpNothing',0)"), 1);

// 추첨
const three = arr('tpPickKeys(3, 0)');
assert.strictEqual(three.length, 3);
assert.strictEqual(new Set(three).size, 3, '무복원');
assert.strictEqual(run('tpPickKeys(1,0,{rng:()=>0})[0]'), normal[0], 'rng=0 → 첫 항목');
assert.strictEqual(run('tpPickKeys(1,0,{rng:()=>0.999999})[0]'), ult[ult.length-1], 'rng≈1 → 마지막 항목');
for(let i=0;i<200;i++){
  assert.ok(!ult.includes(run('tpPickKeys(1,5,{allowUlt:false})[0]')), 'allowUlt:false면 궁극기 없음');
}
assert.ok(!arr("tpPickKeys(50,0,{canBorrow:k=>k!=='jesterAllIn'})").includes('jesterAllIn'), 'canBorrow 필터');
assert.strictEqual(arr('tpPickKeys(99,0)').length, 31, '풀보다 많이 요청하면 풀 전체');

// 전직 분기/스킬 데이터
const specIds = arr("JOB_SPECIALIZATIONS.mechanic.map(s=>s.id)");
assert.ok(specIds.includes('mechanic_timepatrol'), '전직 분기 등록');
assert.ok(specIds.includes('mechanic_stoker') && specIds.includes('mechanic_accumulator'), '기존 분기 보존');
const spec = "JOB_SPECIALIZATIONS.mechanic.find(s=>s.id==='mechanic_timepatrol')";
assert.strictEqual(run(`${spec}.masterySkillId`), 'mastery_timesync');
assert.strictEqual(run(`${spec}.activeSkillId`), 'tpReceive');
assert.strictEqual(run(`${spec}.skillLevels[12]`), 'tpVerify');
assert.strictEqual(run(`${spec}.skillLevels[15]`), 'tpLockdown');
['mastery_timesync','tpReceive','tpVerify','tpLockdown'].forEach(k=> assert.ok(run(`!!SKILLDB['${k}']`), `SKILLDB.${k}`));
assert.strictEqual(run('SKILLDB.tpReceive.mp'), 8);
assert.strictEqual(run('SKILLDB.tpVerify.mp'), 12);
assert.strictEqual(run('SKILLDB.tpLockdown.mp'), 20);
assert.strictEqual(run('SKILLDB.tpLockdown.cooldown'), 3);

// 단서 시스템: 마스터리가 있을 때만, 최대 5
run(`var player = {skills:[]}; var battleFlags = {};`);
run('tpAddClue(1)');
assert.strictEqual(run('tpClues()'), 0, '마스터리 없으면 단서 없음');
run(`player.skills.push('mastery_timesync')`);
run('tpAddClue(1)'); run('tpAddClue(1)');
assert.strictEqual(run('tpClues()'), 2);
run('tpAddClue(9)');
assert.strictEqual(run('tpClues()'), 5, '상한 5');

console.log('timepatrol.test.js: OK');
