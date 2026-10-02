# 전직별 물음표 이벤트 · 엔딩 분기 (스토리 연결 5종) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회랑의 기사/시간술사/찰나의 검사/역병숙주/타임패트롤에게 전직 후 전용 물음표 이벤트 1종(①메커닉 강화/②안전 보상/③지나간다)과 엔딩 3종(파수꾼/시조/마녀) 전용 대사를 추가한다.

**Architecture:** 데이터와 순수 로직(퍼크 판정, 이벤트 효과, 엔딩 대사 표, 끼워넣기 함수)은 새 파일 `js/spec-story.js` 한 곳에 모은다 — `node`의 `vm`으로 단위 테스트할 수 있게(`tests/timepatrol.test.js`와 같은 방식). 화면(오버레이/버튼)은 `events.js`의 `showSpecEvent()`, 퍼크 수치는 기존 공식 5곳에 한 줄씩, 엔딩은 `combat/battle-end.js`의 `showEnding()`이 `insertSpecEndingLines()`를 호출한다. 기존 타임패트롤 작별 장면 하드코딩은 이 표로 옮긴다.

**Tech Stack:** Vanilla JS(classic `<script>`, 공유 전역 scope), Node `vm` + `assert` 단위 테스트, 헤드리스 Chrome(playwright-core + 시스템 Chrome) 실전 확인.

**Spec:** `docs/superpowers/specs/2026-10-02-spec-events-endings-design.md`

## Global Constraints

- 대상 전직 5종만: `paladin_knight`, `mage_time`, `warrior_chalna`, `rogue_alchemist`, `mechanic_timepatrol`.
- 전용 이벤트 가중치 5(다른 이벤트 1 대비), 런당 1회(`player.specEventSeen`).
- ① 선택 시 `player.specEventPerk = true`. 퍼크 판정은 `player.specEventPerk && player.specialization===<id>`.
- 퍼크 수치: 성휘참 피해 ×1.15 / 시간 왜곡 확률 +0.05 / 찰나 **콤보** 배율 ×1.15 / 잠식 스택당 피해 ×1.2 / 전투 시작 단서 1.
- ① 대가: 기사 최대HP -5%(영구) / 시간술사 다음 전투 저주(`applyNextBattleCurse`) / 찰나 현재 HP -20%(최소 1 남김) / 역병숙주 최대HP -8%(영구) / 타임패트롤 없음.
- ② "영구 소량" = `Math.max(1, Math.round(스탯*0.05))`. 기사 def, 시간술사 maxmp, 찰나 spd, 타임패트롤 mag. 역병숙주는 `grantSpecificPotion('potion')` ×2.
- 최대HP 감소 시 `hp = Math.min(hp, maxhp)`.
- 스택형 신규 장치 금지. 이름(아이온/아코스) 직접 노출 금지 — 단, 마녀 엔딩의 `{title:'아이온'}` 화자 표기는 기존 마녀 엔딩과 동일하게 허용.
- 엔딩 끼우기 앵커: 파수꾼 `'이제 이 회랑의 가장 깊은 곳을 지키는 것은'` 앞 / 시조 `'돌기둥이 하나씩 허물어지고, 회랑을 지탱하던'` 앞 / 마녀 1회차 `'돌기둥이 하나씩 허물어지고, 시간의 파편들'` 앞 / 마녀 재클리어 마지막 줄 앞. 앵커 없으면 아무것도 끼우지 않는다.
- 코드 스타일: 들여쓰기 2칸 top-level, 한국어 주석, 기존 주석 밀도에 맞춘다.

## Review Focus

1. 전직 전(specialization null)이나 대상 밖 전직(예: `warrior_purist`)에서 전용 이벤트가 풀에 들어가면 안 된다 — Task 1 테스트.
2. 낮은 HP에서 찰나 ①을 골라도 죽으면 안 된다(HP 1 이상 유지), 최대HP 감소 후 hp가 maxhp를 넘으면 안 된다 — Task 1 테스트.
3. 쉬움/보통 사망 시 마을 체크포인트로 롤백하는데, 스탯 대가만 되돌아가고 퍼크는 남는 공짜 퍼크 — Task 2에서 `makeTownCheckpoint()`에 두 필드 추가 + 헤드리스 확인(Task 5).
4. 타임패트롤이 잔상으로 성휘참을 빌려 써도 기사 퍼크가 붙으면 안 된다 — Task 1 테스트(`hasSpecPerk`는 specialization까지 확인).
5. 누군가 엔딩 본문 문구를 고치면 앵커가 깨져 전직 대사가 조용히 사라진다 — Task 4 테스트가 `battle-end.js` 소스에 앵커 문자열이 존재하는지 확인.

---

### Task 1: `js/spec-story.js` — 퍼크 판정 + 이벤트 데이터/효과

**Files:**
- Create: `js/spec-story.js`
- Create: `tests/spec-story.test.js`
- Modify: `index.html:1616` (스크립트 태그 추가)

**Interfaces:**
- Produces:
  - `SPEC_EVENT_WEIGHT` (number, 5)
  - `SPEC_PERK` (object: specId → number)
  - `hasSpecPerk(p, specId) → boolean`
  - `specEventEligible(p) → boolean`
  - `SPEC_EVENTS[specId] = {title, intro, perkLabel, safeLabel, skipLog, perk(p) → {lines?, log, cls}, safe(p) → {lines?, log, cls}}`
- Consumes(호출 시점, 전역): `applyNextBattleCurse()`, `grantSpecificPotion(key) → string` (둘 다 `js/events.js`)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/spec-story.test.js`:

```js
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node tests/spec-story.test.js`
Expected: FAIL — `ENOENT: no such file or directory, open 'js/spec-story.js'`

- [ ] **Step 3: `js/spec-story.js` 작성**

```js
"use strict";
/*
전직별 물음표 이벤트 · 엔딩 분기(스토리 연결 5종) — 데이터와 순수 로직.
설계: docs/superpowers/specs/2026-10-02-spec-events-endings-design.md
export(전역): SPEC_EVENT_WEIGHT, SPEC_PERK, hasSpecPerk, specEventEligible, SPEC_EVENTS
의존성(호출 시점에만): events.js(applyNextBattleCurse/grantSpecificPotion)
주의: 화면(오버레이/버튼)은 events.js의 showSpecEvent()가 맡는다. 이 파일은 DOM을
     만지지 않는다(tests/spec-story.test.js가 node vm으로 바로 불러 쓴다).
*/

  // 전직 후 이벤트 풀 가중치(다른 이벤트 1 대비). 런당 1회(player.specEventSeen).
  const SPEC_EVENT_WEIGHT = 5;
  // 이벤트 ①(메커닉 강화)을 고르면 player.specEventPerk=true — 아래 값이 각 공식에 한 줄씩 들어간다.
  const SPEC_PERK = {
    paladin_knight: 1.15,      // 성휘참 피해 배율(combat/player-actions.js)
    mage_time: 0.05,           // 시간 왜곡 확률 가산(combat/enemy-turn.js getTimeWarpExtraChance)
    warrior_chalna: 1.15,      // 찰나 콤보 배율(combat/player-actions.js chalnaStrike)
    rogue_alchemist: 1.2,      // 잠식 스택당 피해 배율(combat/enemy-turn.js getVenomDmgPerStack)
    mechanic_timepatrol: 1,    // 전투 시작 단서(combat/battle-setup.js battleFlags 초기화)
  };

  // specialization까지 확인한다 — 타임패트롤이 잔상으로 성휘참을 빌려 써도 기사 퍼크는 안 붙는다.
  function hasSpecPerk(p, specId){
    return !!(p && p.specEventPerk && p.specialization===specId);
  }
  function specEventEligible(p){
    return !!(p && p.specialization && !p.specEventSeen && SPEC_EVENTS[p.specialization]);
  }

  // 기존 이벤트 관례(낡은 서고 등): 스탯의 5%, 최소 1.
  function specSmallGain(p, stat){
    const d = Math.max(1, Math.round((p[stat]||0)*0.05));
    p[stat] += d;
    if(stat==='maxmp') p.mp = Math.min(p.maxmp, (p.mp||0)+d);
    return d;
  }
  function specLoseMaxHp(p, pct){
    const d = Math.max(1, Math.round(p.maxhp*pct));
    p.maxhp -= d;
    p.hp = Math.min(p.hp, p.maxhp);
    return d;
  }

  const SPEC_EVENTS = {
    // 회랑의 기사 — 칼리버 X 단계(caliberx_1/2/3)에 따라 검의 반응이 갈린다.
    paladin_knight: {
      title:'빈 검집',
      intro:'부서진 갑주 걸이 옆, 주인 없는 검집 하나가 걸려 있다. 가죽은 다 삭았지만, 칼리버 X와 길이도 폭도 꼭 맞을 것 같다.',
      perkLabel:'검을 꽂아본다 (성휘참 피해 +15%, 최대HP -5% · 영구)',
      safeLabel:'검집만 챙긴다 (방어력 소량 · 영구)',
      skipLog:'검집을 그대로 두고 지나쳤다.',
      perk(p){
        const w = p.equipment && p.equipment.weapon;
        const stageLine = w==='caliberx_3' ? '검집이 검을 알아보지 못한다. 억지로 밀어 넣자, 무언가가 손목을 타고 조금 빠져나간다.'
          : w==='caliberx_2' ? '검이 잠시 망설이다, 이윽고 들어간다. 손끝에 낯선 저릿함이 남는다.'
          : '검이 편안하게 미끄러져 들어간다. 마치 오래전부터 이곳이 제자리였던 것처럼.';
        const lost = specLoseMaxHp(p, 0.05);
        return {lines:['칼리버 X를 검집에 천천히 밀어 넣는다.', stageLine, '다시 뽑아 든 검신이, 아까보다 조금 더 무겁다.'],
          log:`빈 검집에 칼리버 X를 꽂았다. 성휘참 피해 +15% (영구), 최대HP -${lost} (영구).`, cls:'gold'};
      },
      safe(p){ const d = specSmallGain(p, 'def'); return {log:`빈 검집을 챙겼다. 방어력 +${d} (영구)`, cls:'gold'}; },
    },
    mage_time: {
      title:'거꾸로 흐르는 모래시계',
      intro:'작업대 위에 모래시계 하나가 놓여 있다. 모래가 아래에서 위로 떨어지고 있다. 이상하게도, 그게 전혀 이상하게 느껴지지 않는다.',
      perkLabel:'뒤집는다 (시간 왜곡 확률 +5%p · 영구, 대신 다음 전투에서 저주)',
      safeLabel:'모래를 한 줌 쥔다 (최대MP 소량 · 영구)',
      skipLog:'모래시계를 그대로 두고 지나쳤다.',
      perk(p){
        applyNextBattleCurse();
        return {lines:['모래시계를 뒤집는다. 모래가, 이번엔 제대로 아래로 떨어지기 시작한다.', '그 순간 몸속의 시간이 한 박자 앞서 나간다. 대신 무언가가, 비어버린 그 한 박자를 노려본다.'],
          log:'모래시계를 뒤집었다. 시간 왜곡 확률 +5%p (영구). 불길한 기운이 스며든다(다음 전투 받는 피해 +15%).', cls:'warn'};
      },
      safe(p){ const d = specSmallGain(p, 'maxmp'); return {log:`거꾸로 흐르던 모래를 한 줌 쥐었다. 최대MP +${d} (영구)`, cls:'gold'}; },
    },
    warrior_chalna: {
      title:'끝나지 않은 검격',
      intro:'허공에, 누군가 베다 만 검의 궤적이 반쯤 그어진 채 멈춰 있다. 칼날이 지나간 자리만 빛나고, 그 끝은 어디에도 닿지 않았다.',
      perkLabel:'궤적을 이어 벤다 (찰나 콤보 피해 +15% · 영구, 현재 HP -20%)',
      safeLabel:'궤적을 따라 휘둘러 본다 (속도 소량 · 영구)',
      skipLog:'멈춘 궤적을 건드리지 않고 지나쳤다.',
      perk(p){
        const lost = Math.max(0, Math.min(p.hp-1, Math.round(p.hp*0.2)));
        p.hp -= lost;
        return {lines:['멈춘 궤적의 끝에서부터 검을 이어 휘두른다.', '찰나가 닫히는 순간 — 남의 찰나가, 거꾸로 나를 벤다.'],
          log:`끝나지 않은 검격을 이어 벴다. 찰나 콤보 피해 +15% (영구). HP -${lost}`, cls:'gold'};
      },
      safe(p){ const d = specSmallGain(p, 'spd'); return {log:`궤적을 따라 검을 휘둘러 봤다. 속도 +${d} (영구)`, cls:'gold'}; },
    },
    // 역병숙주 — 진료 기록의 "그 손님"은 역병 시절의 일기장의 "낯선 손님"과 이어진다(이름은 말하지 않는다).
    rogue_alchemist: {
      title:'역병 의원의 진료실',
      intro:'역병 의원의 진료실이다. 선반엔 표본 병들이 늘어서 있고, 진료 기록 마지막 장만 겨우 읽힌다.<br>"그 손님이 다녀간 뒤로 환자가 더는 늘지 않는다. …줄지도 않는다."',
      perkLabel:'남은 표본을 몸에 받아들인다 (잠식 피해 +20%, 최대HP -8% · 영구)',
      safeLabel:'약병을 챙긴다 (물약 2개)',
      skipLog:'진료실 문을 조용히 닫고 나왔다.',
      perk(p){
        const lost = specLoseMaxHp(p, 0.08);
        return {lines:['표본 병의 마개를 연다. 검은 기운이 기다렸다는 듯 손끝으로 스며든다.', '몸 안의 역병이, 오래된 친척을 맞이하듯 낮게 웅성거린다.'],
          log:`역병 표본을 받아들였다. 잠식 피해 +20% (영구), 최대HP -${lost} (영구).`, cls:'gold'};
      },
      safe(p){ return {log:`약병을 챙겼다. ${grantSpecificPotion('potion')} ${grantSpecificPotion('potion')}`, cls:'gold'}; },
    },
    // 타임패트롤 — 몸 주인(기관사)과 목소리("???")가 처음으로 의견이 갈린다. 정체는 끝까지 말하지 않는다.
    mechanic_timepatrol: {
      title:'두 번 찍힌 발자국',
      intro:'바닥에 발자국이 찍혀 있다. 같은 자리에, 똑같은 발자국이 두 번 — 한 치의 어긋남도 없이 겹쳐서.',
      perkLabel:'목소리를 따른다 (매 전투 단서 1개로 시작 · 영구)',
      safeLabel:'내 손으로 고친다 (마력 소량 · 영구)',
      skipLog:'발자국을 밟지 않게 비켜 지나갔다.',
      perk(p){
        return {lines:[{text:'…증거다. 같은 순간이 두 번 지나갔다는.', title:'???'}, {text:'기록해 둬라. 앞으로 어느 현장에 가든, 이걸 들고 시작한다.', title:'???'}],
          log:'발자국을 기록해 두었다. 매 전투를 단서 1개로 시작한다 (영구).', cls:'gold'};
      },
      safe(p){
        const d = specSmallGain(p, 'mag');
        return {lines:[{text:'…증거다. 건드리지 마라.', title:'???'}, {text:'내 몸이야. 어긋난 건, 내 손으로 맞춘다.', title:p.name},
          '공구 끝으로 발자국 하나를 조심스럽게 긁어내, 겹친 자국을 하나로 맞춘다.', {text:'…고집하고는.', title:'???'}],
          log:`겹친 발자국을 손수 맞춰 놓았다. 마력 +${d} (영구)`, cls:'gold'};
      },
    },
  };
```

`index.html`의 `<script src="js/combat/timepatrol.js"></script>` 바로 다음 줄에 추가:

```html
<script src="js/spec-story.js"></script>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node tests/spec-story.test.js && node tests/timepatrol.test.js && node --check js/spec-story.js`
Expected: `spec-story: OK` 출력, timepatrol 테스트도 통과, 문법 오류 없음.

- [ ] **Step 5: Commit**

```bash
git add js/spec-story.js tests/spec-story.test.js index.html
git commit -m "전직 전용 이벤트 데이터/효과(spec-story.js) + 단위 테스트"
```

---

### Task 2: 이벤트 화면 + 이벤트 풀 주입 + 체크포인트 필드

**Files:**
- Modify: `js/events.js` (`showMysteryEvent()` 조건부 push 블록 끝, 새 함수 `showSpecEvent()`는 `showNurseryEvent()` 바로 위)
- Modify: `js/explore.js:617` (`makeTownCheckpoint()`의 `relicSkipRerollCount` 줄 다음)

**Interfaces:**
- Consumes: `SPEC_EVENT_WEIGHT`, `SPEC_EVENTS`, `specEventEligible(p)` (Task 1). 기존 `eventOverlay`, `closeMysteryEvent`, `showDialogueSequence`, `renderStatus`, `renderExplore`, `addLog`, `saveGame`.
- Produces: `showSpecEvent()` (전역), `player.specEventSeen`, `player.specEventPerk`.

- [ ] **Step 1: 이벤트 풀 주입**

`js/events.js`의 `showMysteryEvent()`에서 `if((player.jackPrinceDialogueCount||0) >= 3 && !player.nurseryEventSeen) handlers.push(showNurseryEvent);` 바로 다음 줄에:

```js
    // 전직 전용 이벤트(js/spec-story.js, 스토리 연결 5종): 전직 후 다른 이벤트의
    // 5배 가중치로 풀에 들어가고, 한 번 보면(player.specEventSeen) 그 런에선 다시 안 뜬다.
    if(typeof specEventEligible==='function' && specEventEligible(player)){
      for(let i=0;i<SPEC_EVENT_WEIGHT;i++) handlers.push(showSpecEvent);
    }
```

- [ ] **Step 2: `showSpecEvent()` 추가**

`js/events.js`의 `// 30) 잠긴 육아실` 주석 블록 바로 위에:

```js
  // 전직 전용 이벤트(js/spec-story.js의 SPEC_EVENTS) — ①메커닉 강화/②안전 보상/③지나간다.
  // 뜬 순간 specEventSeen을 세워 어떤 선택을 하든 런당 1회로 끝난다.
  function showSpecEvent(){
    const ev = SPEC_EVENTS[player.specialization];
    if(!ev) return;
    player.specEventSeen = true;
    const {overlay, panel} = eventOverlay(ev.title,
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">${ev.intro}</p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn" id="me-perk">${ev.perkLabel}</button>
        <button class="btn" id="me-safe">${ev.safeLabel}</button>
        <button class="btn" id="me-skip">지나간다</button>
      </div>`);
    const finish = res=>{
      overlay.remove();
      const done = ()=>{ renderStatus(); addLog(res.log, res.cls); saveGame(); renderExplore([]); };
      if(res.lines && res.lines.length) showDialogueSequence(res.lines, {onDone: done});
      else done();
    };
    panel.querySelector('#me-perk').addEventListener('click', ()=>{
      player.specEventPerk = true;
      finish(ev.perk(player));
    });
    panel.querySelector('#me-safe').addEventListener('click', ()=> finish(ev.safe(player)));
    panel.querySelector('#me-skip').addEventListener('click', ()=>{
      addLog(ev.skipLog);
      saveGame();
      closeMysteryEvent(overlay);
    });
  }
```

- [ ] **Step 3: 마을 체크포인트에 두 필드 추가**

`js/explore.js`의 `makeTownCheckpoint()`에서 `relicSkipRerollCount: player.relicSkipRerollCount||0,` 다음 줄에:

```js
      // 전직 전용 이벤트(js/spec-story.js) — 최대HP 같은 대가는 위 스탯과 함께
      // 되돌아가므로, 퍼크/노출 여부도 같이 되돌려야 공짜 퍼크가 안 생긴다.
      specEventSeen: !!player.specEventSeen,
      specEventPerk: !!player.specEventPerk,
```

(`applyTownCheckpoint()`는 나머지 키를 `player[k] = cp[k]`로 복원하므로 수정 불필요.)

- [ ] **Step 4: 문법/테스트 확인**

Run: `node --check js/events.js && node --check js/explore.js && node tests/spec-story.test.js`
Expected: 오류 없음, `spec-story: OK`. (화면 동작은 Task 5에서 헤드리스로 확인.)

- [ ] **Step 5: Commit**

```bash
git add js/events.js js/explore.js
git commit -m "전직 전용 물음표 이벤트 화면/풀 주입, 마을 체크포인트에 퍼크 필드 포함"
```

---

### Task 3: 퍼크 수치 연결(공식 5곳)

**Files:**
- Modify: `js/combat/player-actions.js` (성휘참 블록 ≈3519, 찰나 콤보 ≈1130)
- Modify: `js/combat/enemy-turn.js` (`getTimeWarpExtraChance()` ≈1610, `getVenomDmgPerStack()` ≈1700)
- Modify: `js/combat/battle-setup.js` (`battleFlags` 초기화 ≈964)

**Interfaces:**
- Consumes: `hasSpecPerk(p, specId)`, `SPEC_PERK` (Task 1)

- [ ] **Step 1: 성휘참**

`js/combat/player-actions.js`에서 `// 성좌의 가호(pa_knight_b, 회랑의 기사 방어구 각인 — 택1 B안)` 주석 바로 위에:

```js
    // 빈 검집(전직 전용 이벤트 ①, js/spec-story.js) — 성휘참 피해 영구 +15%.
    if(key==='paladinHolyRend' && hasSpecPerk(player, 'paladin_knight')) dmg = Math.round(dmg*SPEC_PERK.paladin_knight);
```

- [ ] **Step 2: 찰나 콤보**

`js/combat/player-actions.js`의 `chalnaStrike` 분기에서 `if(hasForestrike2) mult *= 0.85;`를 닫는 `}` 바로 다음 줄에:

```js
      // 끝나지 않은 검격(전직 전용 이벤트 ①, js/spec-story.js) — 콤보 검격만 +15%.
      if(combo && hasSpecPerk(player, 'warrior_chalna')) mult *= SPEC_PERK.warrior_chalna;
```

- [ ] **Step 3: 시간 왜곡 확률**

`js/combat/enemy-turn.js`의 `getTimeWarpExtraChance()`에서 `return hasRegression ? 0.35 : 0.20;`를 교체:

```js
    // 거꾸로 흐르는 모래시계(전직 전용 이벤트 ①, js/spec-story.js) — +5%p.
    const perk = hasSpecPerk(player, 'mage_time') ? SPEC_PERK.mage_time : 0;
    return (hasRegression ? 0.35 : 0.20) + perk;
```

- [ ] **Step 4: 잠식 피해**

`js/combat/enemy-turn.js`의 `getVenomDmgPerStack()`에서 `const boost = getDotBoostRatio('poison');` 바로 위에:

```js
    // 역병 의원의 진료실(전직 전용 이벤트 ①, js/spec-story.js) — 스택당 피해 +20%.
    if(hasSpecPerk(player, 'rogue_alchemist')) per *= SPEC_PERK.rogue_alchemist;
```

- [ ] **Step 5: 시작 단서**

`js/combat/battle-setup.js`에서 `battleFlags.creed = null; battleFlags.creedStacks = 0;` 바로 다음 줄에:

```js
    // 두 번 찍힌 발자국(전직 전용 이벤트 ①, js/spec-story.js) — 매 전투 단서 1개로 시작.
    if(hasSpecPerk(player, 'mechanic_timepatrol')) battleFlags.timeClues = SPEC_PERK.mechanic_timepatrol;
```

- [ ] **Step 6: 문법 확인 + 연결 개수 확인**

Run: `node --check js/combat/player-actions.js && node --check js/combat/enemy-turn.js && node --check js/combat/battle-setup.js && grep -rn "hasSpecPerk(player" js/combat | wc -l`
Expected: 오류 없음, 마지막 출력 `5`.

- [ ] **Step 7: Commit**

```bash
git add js/combat/player-actions.js js/combat/enemy-turn.js js/combat/battle-setup.js
git commit -m "전직 전용 이벤트 퍼크 수치를 성휘참/찰나 콤보/시간 왜곡/잠식/단서 공식에 연결"
```

---

### Task 4: 엔딩 분기 — 대사 표 + 끼워넣기 + `showEnding()` 연결

**Files:**
- Modify: `js/spec-story.js` (파일 끝에 추가)
- Modify: `tests/spec-story.test.js` (`console.log('spec-story: OK');` 위에 추가)
- Modify: `js/combat/battle-end.js:553-566` (타임패트롤 하드코딩 교체), 파수꾼 분기 `lines` 정의 직후

**Interfaces:**
- Produces:
  - `SPEC_ENDING_ANCHORS = {watcher, progenitor, witch}` (string 접두어)
  - `SPEC_ENDING_LINES[specId][kind] = name => Array<string|{text,title}>` (kind: `'watcher'|'progenitor'|'witch'`)
  - `insertSpecEndingLines(lines, specId, kind, name, atEnd) → lines` (제자리 수정 후 같은 배열 반환)

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/spec-story.test.js`의 `console.log('spec-story: OK');` 바로 위에:

```js
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
  ? ['첫 줄', '돌기둥이 하나씩 허물어지고, 회랑을 지탱하던 저주의 뿌리가 빛무리와 함께 흩어진다.', '끝']
  : ['첫 줄', '돌기둥이 하나씩 허물어지고, 시간의 파편들이 빛무리와 함께 흩어진다.', '끝'];
// 앵커 바로 앞에 끼운다
run("var w = insertSpecEndingLines(base('watcher'), 'paladin_knight', 'watcher', '테스터', false);");
assert.strictEqual(run('w.length'), 4);
assert.ok(run("w[w.length-1].startsWith('이제 이 회랑의 가장 깊은 곳을')"), '앵커 줄이 맨 뒤에 유지');
assert.ok(run("w.some(l=> typeof l==='string' && l.includes('테스터'))"), '기사 파수꾼 엔딩에 이름');
run("var pr = insertSpecEndingLines(base('progenitor'), 'mage_time', 'progenitor', '테스터', false);");
assert.ok(run("pr[pr.length-2].startsWith('돌기둥이 하나씩 허물어지고, 회랑을')"));
// 마녀 재클리어는 마지막 줄 앞
run("var wr = insertSpecEndingLines(['a','b','\"회랑, 두 번째로 놓아주다.\"'], 'warrior_chalna', 'witch', '테스터', true);");
assert.strictEqual(run('wr[wr.length-1]'), '"회랑, 두 번째로 놓아주다."');
assert.strictEqual(run('wr.length'), 5);
// 대상 밖 전직/전직 전/앵커 없음 → 그대로
assert.strictEqual(run("insertSpecEndingLines(base('watcher'), 'warrior_purist', 'watcher', 'x', false).length"), 2);
assert.strictEqual(run("insertSpecEndingLines(base('watcher'), null, 'watcher', 'x', false).length"), 2);
assert.strictEqual(run("insertSpecEndingLines(['앵커 없는 본문'], 'paladin_knight', 'progenitor', 'x', false).length"), 1);
// 기존 타임패트롤 작별 장면이 그대로 옮겨졌다
assert.ok(run("SPEC_ENDING_LINES.mechanic_timepatrol.witch('테스터').some(l=> l.title==='테스터' && l.text==='…끝까지, 이름도 안 알려주는군.')"));
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node tests/spec-story.test.js`
Expected: FAIL — `ReferenceError: SPEC_ENDING_LINES is not defined`

- [ ] **Step 3: `js/spec-story.js`에 엔딩 표와 끼워넣기 함수 추가**

파일 상단 주석의 `export(전역):` 줄을 다음으로 교체:

```js
export(전역): SPEC_EVENT_WEIGHT, SPEC_PERK, hasSpecPerk, specEventEligible, SPEC_EVENTS,
       SPEC_ENDING_ANCHORS, SPEC_ENDING_LINES, insertSpecEndingLines
```

파일 끝에 추가:

```js
  // ── 엔딩 분기 ── combat/battle-end.js의 showEnding()이 기존 본문의 앵커 줄 바로 앞에
  // 전직 전용 대사를 끼운다(마녀 재클리어만 마지막 타이틀 줄 앞). 앵커 문구를 바꾸면
  // tests/spec-story.test.js가 잡는다.
  const SPEC_ENDING_ANCHORS = {
    watcher: '이제 이 회랑의 가장 깊은 곳을 지키는 것은',
    progenitor: '돌기둥이 하나씩 허물어지고, 회랑을 지탱하던',
    witch: '돌기둥이 하나씩 허물어지고, 시간의 파편들',
  };
  const SPEC_ENDING_LINES = {
    // 파수꾼 엔딩: 지워졌던 "Achos" 자리에 플레이어 이름이 새겨진다 — 다음 아코스가 된다.
    paladin_knight: {
      watcher: name=>['손에 쥔 칼리버 X가, 처음으로 조용해진다.', `검신 밑동, 이름이 지워졌던 자리에 낯선 글자가 희미하게 새겨지기 시작한다 — ${name}.`],
      progenitor: name=>['칼리버 X가 손을 떠나, 무너진 왕좌 앞에 스스로 꽂힌다.', '오래 지켜온 자리로, 이제야 돌아간 것처럼.'],
      witch: name=>['칼리버 X가 그녀 쪽으로 기울어진다.', '그녀가 아무 말 없이, 이름이 있던 자리를 손끝으로 쓸어내린다.'],
    },
    mage_time: {
      watcher: name=>['빌려 쓴 시간이, 한꺼번에 이자를 청구해 온다.', '손끝부터 굳어간다 — 멈춘 시계처럼.'],
      progenitor: name=>['몸에 깃들어 있던 낯선 시간의 감각이, 썰물처럼 빠져나간다.', '처음으로, 남들과 같은 속도로 숨을 쉰다.'],
      witch: name=>[{text:'"…그 힘. 내 것이었군."', title:'아이온'}, {text:'"괜찮다. 이제 그대 것이다. 나는 더는 쓸 일이 없으니."', title:'아이온'}],
    },
    // 마녀 엔딩: 직업 설명의 "시간의 파편"이 어디서 왔는지 회수한다.
    warrior_chalna: {
      watcher: name=>['마지막 일격의 찰나가, 끝내 다음 검격으로 이어지지 않는다.', `그 찰나 안에, ${name}은(는) 영원히 남겨진다.`],
      progenitor: name=>['시간이 흐르기 시작하자, 손끝에 스며 있던 파편들이 하나씩 빠져나가 빛무리에 섞인다.', '더는 찰나를 붙잡을 수 없다. 그래도 검은, 여전히 가볍다.'],
      witch: name=>['산산조각 난 시계의 파편 하나가 손등에 닿는다. 익숙한 감각 — 벨 때마다 스며들던, 그 찰나.', '그것이 어디서 왔는지, 이제야 안다.'],
    },
    rogue_alchemist: {
      watcher: name=>['몸 안의 역병이, 회랑의 공기와 처음으로 같은 박자로 숨 쉰다.', '병든 몸은, 이곳에서 가장 잘 어울리는 파수꾼이 된다.'],
      progenitor: name=>['원혼들이 빠져나갈 때, 몸 안의 검은 기운도 함께 끌려 나간다.', '핏줄이 처음으로, 원래 색을 되찾는다.'],
      witch: name=>['멈춰 있던 시간이 흐르자, 몸 안의 역병도 다시 나아가기 시작한다.', '흐르는 시간은, 병든 자에게도 공평하다.'],
    },
    // 시조 엔딩의 "시계를 찾아라"는 마녀 엔딩 루트 힌트. 마녀 엔딩은 기존 작별 장면을 그대로 옮겨왔다.
    mechanic_timepatrol: {
      watcher: name=>[{text:'…이 시간대는 실패다.', title:'???'}, {text:'기록은 남겨두지. 다음 시간대의 나를 위해.', title:'???'},
        {text:'…이 몸은 데려갈 수 없다. 미안하다.', title:'???'}, '머릿속의 낯선 기척이 먼저 사라지고, 혼자 남는다.'],
      progenitor: name=>[{text:'…아니다. 뒤틀림의 중심은 여기가 아니었다.', title:'???'}, {text:'…다음엔, 시계를 찾아라.', title:'???'}],
      witch: name=>[
        '그때, 머릿속 깊은 곳에서 낯선 목소리가 낮게 울린다.',
        {text:'…끝났군. 시간이, 제자리로 흐르기 시작했다.', title:'???'},
        {text:'이 몸은 돌려주지. 나는 여기까지다. …빌려줘서, 고마웠다.', title:'???'},
        {text:'…끝까지, 이름도 안 알려주는군.', title:name},
        '시계 소리처럼 아득하던 울림이 멀어지고, 오래도록 머릿속에 머물던 낯선 기척이 조용히 사라진다.',
      ],
    },
  };
  function insertSpecEndingLines(lines, specId, kind, name, atEnd){
    const make = specId && SPEC_ENDING_LINES[specId] && SPEC_ENDING_LINES[specId][kind];
    if(!make) return lines;
    const at = atEnd ? lines.length-1 : lines.findIndex(l=> typeof l==='string' && l.startsWith(SPEC_ENDING_ANCHORS[kind]));
    if(at>=0) lines.splice(at, 0, ...make(name));
    return lines;
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node tests/spec-story.test.js`
Expected: `spec-story: OK`

- [ ] **Step 5: `showEnding()` 연결 — 진엔딩**

`js/combat/battle-end.js`에서 `// 타임패트롤(mechanic_timepatrol) 전용 작별 장면(사용자 요청)`로 시작하는 주석 3줄과 그 아래 `if(isWitch && player.specialization==='mechanic_timepatrol'){ ... }` 블록 전체(≈553-566줄)를 다음으로 교체:

```js
      // 전직별 엔딩 대사(js/spec-story.js의 SPEC_ENDING_LINES) — 타임패트롤 작별 장면도
      // 이 표로 옮겼다. 마녀 재클리어는 마지막 타이틀 줄 앞, 나머지는 앵커 줄 앞에 끼운다.
      insertSpecEndingLines(lines, player.specialization, isWitch ? 'witch' : 'progenitor', player.name, isWitchRepeat);
```

- [ ] **Step 6: `showEnding()` 연결 — 파수꾼 엔딩**

같은 파일 `} else {` 분기에서 `'이제 이 회랑의 가장 깊은 곳을 지키는 것은, 한때 용사였던 무언가다.',` 다음의 `];` 바로 다음 줄에:

```js
      insertSpecEndingLines(lines, player.specialization, 'watcher', player.name, false);
```

- [ ] **Step 7: 문법/테스트 확인**

Run: `node --check js/combat/battle-end.js && node --check js/spec-story.js && node tests/spec-story.test.js && grep -c "mechanic_timepatrol" js/combat/battle-end.js`
Expected: 오류 없음, `spec-story: OK`, 마지막 출력 `0`(하드코딩 제거됨).

- [ ] **Step 8: Commit**

```bash
git add js/spec-story.js tests/spec-story.test.js js/combat/battle-end.js
git commit -m "전직별 엔딩 분기(파수꾼/시조/마녀) — 타임패트롤 작별 장면을 표로 일반화"
```

---

### Task 5: 헤드리스 실전 확인 + 문서 갱신

**Files:**
- Create(스크래치패드, 커밋 안 함): `<scratchpad>/verify-spec-story.js`
- Modify: `story.md` (5-1, 5-2, 5-5, 5-6, 5-8, 6장 표의 "물음표 이벤트"/"진엔딩 분기" 행)
- Modify: `CURRENT_STATUS.md` ("최근 작업" 최상단에 새 세션 블록)

**Interfaces:**
- Consumes: Task 1~4 전부.

- [ ] **Step 1: playwright-core 설치(스크래치패드)**

Run: `npm i playwright-core --prefix "<scratchpad>"`
Expected: 설치 성공. (브라우저는 시스템 Chrome `C:/Program Files/Google/Chrome/Application/chrome.exe` 사용 — 다운로드 불필요.)

- [ ] **Step 2: 확인 스크립트 작성**

`<scratchpad>/verify-spec-story.js`:

```js
const { chromium } = require('playwright-core');
(async()=>{
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e=> errors.push(String(e)));
  page.on('console', m=>{ if(m.type()==='error') errors.push(m.text()); });
  await page.goto('file:///C:/dc/dungeon-crawler/index.html');
  await page.waitForTimeout(500);
  const out = await page.evaluate(()=>{
    const r = {};
    // 대화창은 즉시 넘김 + 대사 수집
    window.__dlg = [];
    window.showDialogueSequence = (lines, opts)=>{ window.__dlg.push(lines); if(opts && opts.onDone) opts.onDone(); };
    const setup = (job, spec)=>{
      player = newPlayer('테스터', job, 'normal'); depth = 25; town = false;
      player.specialization = spec; player.jobChosenAt10 = true;
      if(spec==='paladin_knight') player.equipment.weapon = 'caliberx_2';
    };
    const cases = [['paladin','paladin_knight'],['mage','mage_time'],['warrior','warrior_chalna'],['rogue','rogue_alchemist'],['mechanic','mechanic_timepatrol']];
    // 1) 이벤트: ① 선택 → 퍼크/seen 플래그, 오버레이 닫힘
    r.events = cases.map(([job, spec])=>{
      setup(job, spec);
      const before = {maxhp:player.maxhp, hp:player.hp};
      showSpecEvent();
      const title = document.querySelector('#mystery-event-overlay h3').textContent;
      document.querySelector('#me-perk').click();
      return {spec, title, perk:player.specEventPerk, seen:player.specEventSeen, eligibleAfter:specEventEligible(player),
        overlayGone:!document.querySelector('#mystery-event-overlay'), before, after:{maxhp:player.maxhp, hp:player.hp}};
    });
    // 2) 이벤트 풀 가중치: 전직 후 handlers에 5번 들어가는지 — Math.random을 고정해 마지막 칸 선택
    setup('rogue','rogue_alchemist');
    const origRandom = Math.random; Math.random = ()=>0.999999;
    showMysteryEvent();
    Math.random = origRandom;
    r.lastHandlerIsSpec = document.querySelector('#mystery-event-overlay h3').textContent.includes('역병 의원의 진료실');
    document.querySelector('#me-skip').click();
    r.seenAfterSkip = player.specEventSeen;
    // 3) 퍼크 공식
    setup('mage','mage_time'); player.skills.push('mastery_timewarp'); r.warpBase = getTimeWarpExtraChance();
    player.specEventPerk = true; r.warpPerk = getTimeWarpExtraChance();
    setup('rogue','rogue_alchemist'); player.skills.push('mastery_venomstacks'); r.venomBase = getVenomDmgPerStack();
    player.specEventPerk = true; r.venomPerk = getVenomDmgPerStack();
    // 4) 체크포인트 롤백: 퍼크도 같이 되돌아간다
    setup('paladin','paladin_knight');
    const cp = makeTownCheckpoint();
    player.specEventPerk = true; player.specEventSeen = true;
    applyTownCheckpoint(cp);
    r.rollback = {perk:player.specEventPerk, seen:player.specEventSeen};
    // 5) 엔딩: 전직 × (파수꾼/시조/마녀) 끼운 대사가 나오는지
    r.endings = {};
    cases.forEach(([job, spec])=>{
      [['watcher', false, null], ['progenitor', true, 'progenitor'], ['witch', true, 'timewitch']].forEach(([kind, isTrue, type])=>{
        setup(job, spec);
        enemy = type ? {type} : {finalJobId:'warrior'};
        window.__dlg = [];
        showEnding(isTrue);
        const lines = window.__dlg[0] || [];
        const expected = SPEC_ENDING_LINES[spec][kind]('테스터');
        const firstText = l=> typeof l==='string' ? l : l.text;
        r.endings[`${spec}/${kind}`] = lines.map(firstText).includes(firstText(expected[0]));
      });
    });
    return r;
  });
  console.log(JSON.stringify(out, null, 2));
  console.log('ERRORS:', errors);
  await browser.close();
})();
```

- [ ] **Step 3: 실행**

Run: `cd "<scratchpad>" && node verify-spec-story.js`
Expected:
- `events[*]`: `perk:true`, `seen:true`, `eligibleAfter:false`, `overlayGone:true`. 기사 `after.maxhp`가 `before.maxhp`의 95%(반올림), 역병숙주 92%, 찰나 `after.hp`가 `before.hp`의 80%.
- `lastHandlerIsSpec:true`, `seenAfterSkip:true`
- `warpPerk - warpBase`가 0.05(부동소수 오차 허용), `venomPerk / venomBase`가 1.2
- `rollback`: `{perk:false, seen:false}`
- `endings` 15개 전부 `true`
- `ERRORS: []` (게임 자체가 내는 무관한 에러가 있으면 내용 확인 후 기록)

실패 항목이 있으면 해당 Task로 돌아가 고친 뒤 다시 실행한다.

- [ ] **Step 4: 문서 갱신**

`story.md`:
- 5-1/5-2/5-5/5-6/5-8 각 절 끝에 한 줄씩: `- **전직 전용 물음표 이벤트/엔딩(신규)**: "<이벤트 제목>" — ① <퍼크>/② <안전 보상>. 엔딩 3종(파수꾼/시조/마녀)에 전용 대사가 끼워진다(js/spec-story.js).` 기사 절에는 "파수꾼 엔딩에서 지워진 이름 자리에 플레이어 이름이 새겨진다(다음 아코스)", 타임패트롤 절에는 "시조 엔딩의 '다음엔, 시계를 찾아라'는 마녀 루트 힌트"를 덧붙인다.
- 6장 표 "물음표 이벤트" 행 끝에: `**전직 전용 이벤트 5종(신규 — 스토리 연결 전직만, 5배 가중치·런당 1회, js/spec-story.js)**`
- 6장 표 "진엔딩 분기" 행 끝에: `전직별 대사 끼우기(신규 — 파수꾼 엔딩 포함, SPEC_ENDING_LINES, 타임패트롤 작별 장면도 이 표로 이동)`

`CURRENT_STATUS.md`의 `## 최근 작업 (이번 세션 — ...)` 제목을 `## 최근 작업 (이전 세션 — ...)`으로 바꾸고, 그 위에 새 블록:

```markdown
## 최근 작업 (이번 세션 — 전직별 물음표 이벤트/엔딩 분기, 스토리 연결 5종)

- 설계: `docs/superpowers/specs/2026-10-02-spec-events-endings-design.md`,
  계획: `docs/superpowers/plans/2026-10-02-spec-events-endings.md`
- 대상: 회랑의 기사/시간술사/찰나의 검사/역병숙주/타임패트롤. 나머지 12종은 같은 틀로 추후 확장.
- 데이터/순수 로직은 `js/spec-story.js`(SPEC_EVENTS/SPEC_PERK/SPEC_ENDING_LINES),
  단위 테스트 `node tests/spec-story.test.js`. 화면은 `events.js`의 `showSpecEvent()`.
- 이벤트: 전직 후 5배 가중치, 런당 1회(`player.specEventSeen`). ① 선택 시
  `player.specEventPerk` → 성휘참 ×1.15 / 시간 왜곡 +5%p / 찰나 콤보 ×1.15 / 잠식 ×1.2 / 시작 단서 1.
  마을 체크포인트에 두 필드 포함(쉬움/보통 사망 롤백 시 공짜 퍼크 방지).
- 엔딩: 파수꾼/시조/마녀 3종 × 5전직 대사를 앵커 줄 앞에 끼움. 타임패트롤 작별 장면 하드코딩은 표로 이동.
- 헤드리스 Chrome 확인: <Step 3 결과 요약>
- 미검증: 실제 플레이에서 이벤트 체감 빈도, 대사 톤(사용자 확인 필요).
```

- [ ] **Step 5: Commit**

```bash
git add story.md CURRENT_STATUS.md
git commit -m "전직별 이벤트/엔딩 분기 문서 반영(story.md, CURRENT_STATUS.md)"
```
