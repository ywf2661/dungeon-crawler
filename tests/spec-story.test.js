"use strict";
// 실행: node tests/spec-story.test.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const calls = {curse:0, potion:0};
const ctx = vm.createContext({console,
  applyNextBattleCurse: ()=>{ calls.curse++; },
  grantSpecificPotion: key=>{ calls.potion++; return `${key} 획득`; },
});
vm.runInContext(fs.readFileSync('js/spec-story.js','utf8'), ctx, {filename:'js/spec-story.js'});
const run = code => vm.runInContext(code, ctx);
const SPECS = ['paladin_knight','mage_time','warrior_chalna','rogue_alchemist','mechanic_timepatrol'];
const mk = (spec, extra) => Object.assign({name:'테스터', specialization:spec, hp:500, maxhp:1000, mp:40, maxmp:100,
  atk:200, def:100, mag:120, spd:30, equipment:{weapon:null}}, extra||{});
ctx.mk = mk;

// 대상 5종이 데이터 표에 전부, 그리고 정확히 그만큼 있다
assert.deepStrictEqual(Object.keys(run('SPEC_PERK')).sort(), SPECS.slice().sort());
assert.deepStrictEqual(Object.keys(run('SPEC_EVENTS')).sort(), SPECS.slice().sort());
assert.strictEqual(run('SPEC_EVENT_WEIGHT'), 5);

// 노출 조건
assert.strictEqual(run("specEventEligible(mk(null))"), false, '전직 전엔 없음');
assert.strictEqual(run("specEventEligible(mk('warrior_purist'))"), false, '대상 밖 전직엔 없음');
assert.strictEqual(run("specEventEligible(mk('mage_time'))"), true);
assert.strictEqual(run("specEventEligible(mk('mage_time',{specEventSeen:true}))"), false, '런당 1회');

// 퍼크 판정은 전직까지 확인(타임패트롤이 성휘참을 빌려도 기사 퍼크 없음)
assert.strictEqual(run("hasSpecPerk(mk('paladin_knight',{specEventPerk:true}),'paladin_knight')"), true);
assert.strictEqual(run("hasSpecPerk(mk('mechanic_timepatrol',{specEventPerk:true}),'paladin_knight')"), false);
assert.strictEqual(run("hasSpecPerk(mk('paladin_knight'),'paladin_knight')"), false, '퍼크 안 골랐으면 없음');

// 기사 ①: 최대HP -5%, hp 클램프, 칼리버 단계별 대사가 서로 다름
run("var pk = mk('paladin_knight',{hp:1000, equipment:{weapon:'caliberx_1'}}); var rk = SPEC_EVENTS.paladin_knight.perk(pk);");
assert.strictEqual(run('pk.maxhp'), 950);
assert.strictEqual(run('pk.hp'), 950, 'hp가 새 maxhp를 넘지 않음');
const stageLine = w => run(`SPEC_EVENTS.paladin_knight.perk(mk('paladin_knight',{equipment:{weapon:'${w}'}})).lines[1]`);
assert.strictEqual(new Set(['caliberx_1','caliberx_2','caliberx_3'].map(stageLine)).size, 3, '단계별 대사 3종');
// 기사 ②: 방어력 +5%
run("var pk2 = mk('paladin_knight'); SPEC_EVENTS.paladin_knight.safe(pk2);");
assert.strictEqual(run('pk2.def'), 105);

// 시간술사 ①: 저주 호출, ②: 최대MP +5%와 MP 동반 증가
run("SPEC_EVENTS.mage_time.perk(mk('mage_time'));");
assert.strictEqual(calls.curse, 1);
run("var pt = mk('mage_time'); SPEC_EVENTS.mage_time.safe(pt);");
assert.strictEqual(run('pt.maxmp'), 105);
assert.strictEqual(run('pt.mp'), 45);

// 찰나 ①: 현재 HP -20%, 낮은 HP에서도 1은 남는다
run("var pc = mk('warrior_chalna',{hp:500}); SPEC_EVENTS.warrior_chalna.perk(pc);");
assert.strictEqual(run('pc.hp'), 400);
run("var pc1 = mk('warrior_chalna',{hp:1}); SPEC_EVENTS.warrior_chalna.perk(pc1);");
assert.strictEqual(run('pc1.hp'), 1, 'HP 1에서 죽지 않음');
run("var pc2 = mk('warrior_chalna'); SPEC_EVENTS.warrior_chalna.safe(pc2);");
assert.strictEqual(run('pc2.spd'), 32);

// 역병숙주 ①: 최대HP -8%, ②: 물약 2회 지급
run("var pa = mk('rogue_alchemist',{hp:1000}); SPEC_EVENTS.rogue_alchemist.perk(pa);");
assert.strictEqual(run('pa.maxhp'), 920);
assert.strictEqual(run('pa.hp'), 920);
run("SPEC_EVENTS.rogue_alchemist.safe(mk('rogue_alchemist'));");
assert.strictEqual(calls.potion, 2);

// 타임패트롤 ①: 스탯 변화 없음, ②: 마력 +5%와 플레이어 이름이 화자로 등장
run("var pp = mk('mechanic_timepatrol'); var rp = SPEC_EVENTS.mechanic_timepatrol.perk(pp);");
assert.strictEqual(run('pp.mag'), 120);
run("var pp2 = mk('mechanic_timepatrol'); var rp2 = SPEC_EVENTS.mechanic_timepatrol.safe(pp2);");
assert.strictEqual(run('pp2.mag'), 126);
assert.ok(run("rp2.lines.some(l=> l && l.title==='테스터')"));

// 모든 이벤트가 화면에 필요한 필드를 갖고, 효과는 log 문자열을 돌려준다
SPECS.forEach(s=>{
  ['title','intro','perkLabel','safeLabel','skipLog'].forEach(f=> assert.ok(run(`typeof SPEC_EVENTS.${s}.${f}==='string' && SPEC_EVENTS.${s}.${f}.length>0`), `${s}.${f}`));
  ['perk','safe'].forEach(f=> assert.ok(run(`typeof SPEC_EVENTS.${s}.${f}(mk('${s}')).log==='string'`), `${s}.${f}().log`));
});

// ── 엔딩 분기 ──
const ENDING_SPECS = SPECS;
// 15칸(5전직 × 3엔딩)이 전부 채워져 있다
ENDING_SPECS.forEach(s=> ['watcher','progenitor','witch'].forEach(k=>{
  const out = run(`SPEC_ENDING_LINES.${s}.${k}('테스터')`);
  assert.ok(Array.isArray(out) && out.length>=2, `${s}.${k}`);
}));
// 앵커가 실제 battle-end.js 본문에 존재한다(본문 문구가 바뀌면 여기서 잡힌다)
const endSrc = fs.readFileSync('js/combat/battle-end.js','utf8');
Object.values(run('SPEC_ENDING_ANCHORS')).forEach(a=> assert.ok(endSrc.includes(a), `앵커 없음: ${a}`));

ctx.base = (kind) => kind==='watcher'
  ? ['첫 줄', '이제 이 회랑의 가장 깊은 곳을 지키는 것은, 한때 용사였던 무언가다.']
  : kind==='progenitor'
  ? ['첫 줄', '어딘가 더 깊은 곳에서, 시계 초침 소리가 아주 희미하게 울린다.', '끝']
  : ['첫 줄', '돌기둥이 하나씩 허물어지고, 시간의 파편들이 빛무리와 함께 흩어진다.', '끝'];
// 앵커 바로 앞에 끼운다
run("var w = insertSpecEndingLines(base('watcher'), 'paladin_knight', 'watcher', '테스터', false);");
assert.strictEqual(run('w.length'), 4);
assert.ok(run("w[w.length-1].startsWith('이제 이 회랑의 가장 깊은 곳을')"), '앵커 줄이 맨 뒤에 유지');
assert.ok(run("w.some(l=> typeof l==='string' && l.includes('테스터'))"), '기사 파수꾼 엔딩에 이름');
run("var pr = insertSpecEndingLines(base('progenitor'), 'mage_time', 'progenitor', '테스터', false);");
assert.ok(run("pr[pr.length-2].startsWith('어딘가 더 깊은 곳에서, 시계 초침')"));
// 마녀 재클리어는 마지막 줄 앞
run("var wr = insertSpecEndingLines(['a','b','\"회랑, 다시 놓아주다.\"'], 'warrior_chalna', 'witch', '테스터', true);");
assert.strictEqual(run('wr[wr.length-1]'), '"회랑, 다시 놓아주다."');
assert.strictEqual(run('wr.length'), 5);
// 대상 밖 전직/전직 전/앵커 없음 → 그대로
assert.strictEqual(run("insertSpecEndingLines(base('watcher'), 'warrior_purist', 'watcher', 'x', false).length"), 2);
assert.strictEqual(run("insertSpecEndingLines(base('watcher'), null, 'watcher', 'x', false).length"), 2);
assert.strictEqual(run("insertSpecEndingLines(['앵커 없는 본문'], 'paladin_knight', 'progenitor', 'x', false).length"), 1);
// 기존 타임패트롤 작별 장면이 그대로 옮겨졌다
assert.ok(run("SPEC_ENDING_LINES.mechanic_timepatrol.witch('테스터').some(l=> l.title==='테스터' && l.text==='…끝까지, 이름도 안 알려주는군.')"));

// 예전 세이브의 마을 체크포인트(필드 없음)는 "퍼크 없음"으로 채운다 — 롤백 시 공짜 퍼크 방지
run("var oldCp = {maxhp:1000}; migrateSpecCheckpoint(oldCp);");
assert.strictEqual(run("oldCp.specEventPerk"), false);
assert.strictEqual(run("oldCp.specEventSeen"), false);
run("var newCp = {specEventSeen:true, specEventPerk:true}; migrateSpecCheckpoint(newCp);");
assert.strictEqual(run("newCp.specEventPerk"), true, "이미 있는 값은 건드리지 않음");
run("migrateSpecCheckpoint(null);");
console.log('spec-story: OK');
