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

console.log('spec-story: OK');
