# 타임패트롤 (기관사 2차 전직) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기관사 2차 전직 "타임패트롤"을 추가한다 — 다른 직업 2차 전직 액티브 스킬(32개 풀)을 "잔상"으로 랜덤 발동하는 수신/검증/봉쇄령 스킬 세트.

**Architecture:** 새 파일 `js/combat/timepatrol.js`에 풀/가중치 추첨(순수 함수)과 "빌려쓰기 실행기" `castBorrowed()`를 둔다. 실행기는 `playerSkill(key, true)`(isRetry=true → MP/쿨타임 검사·차감 생략)를 호출하고, 그동안만 전역 `enemyTurn/setCommandsEnabled/resetCommandUI/checkBattleEnd`를 가로채 "스킬이 끝났다"는 신호를 잡아 연쇄 발동·원복을 처리한다. 위력(70%+단서×6%)은 `applyOutgoingDamageMods`의 한 줄 훅, 토글류(혈서/원소 계약/희생의 맹세)는 `battleFlags.borrow*` 플래그를 읽는 조건 확장으로 처리한다.

**Tech Stack:** 바닐라 JS 클래식 스크립트(전역 함수, 빌드/모듈 없음). 순수 함수 테스트는 Node 20의 `vm`+`assert`(프레임워크 없음), 전투 통합은 브라우저 수동 스모크.

**Spec:** `docs/superpowers/specs/2026-09-21-timepatrol-design.md`

## Global Constraints

- 스킬 풀 32개 = 일반 22 + 궁극기(Lv15) 10. 예약형(선혈각인/분신 배가/정보료)·패시브·찰나 예약형·강령 소환 계열 Lv12/15·총사령관의 명령·임계 폭주는 제외.
- 잔상 위력 = 원본의 70% + 단서 1개당 6% (최대 100%). 빌린 스킬의 스탯 기준은 max(공격력, 마력).
- 궁극기 가중치 = 0.3 + 단서×0.1 (최대 0.8), 일반 스킬 1. 궁극기 확률: 단서 0개 12%, 5개 약 27%.
- 단서: 스킬 사용/피격 시 +1, 최대 5. 현장 검증(Lv12, MP 12)은 단서 2 소모 후 랜덤 3개 중 선택. 시간 봉쇄령(Lv15, MP 20, 쿨 3턴)은 단서 전부 소모, 2 + floor(단서/2)회(최대 4) 연속 발동, 연속 발동 중 궁극기 제외.
- 타임라인 수신(Lv10 액티브, MP 8), 시간대 동조(Lv10 패시브).
- 토글: 혈서/원소 계약/희생의 맹세는 각각 50% 확률. 희생의 맹세는 영구 스탯 변화 없이 HP 8% 소모 + 피해 +50%.
- 폭주 사출은 가상 압력 100 기준, 실제 압력 소모/증가 없음. 강령 소환은 BOSSES + TIME_GUARDIAN 랜덤 1개(4턴). 베팅/올인은 실제 골드를 걸고 실제로 잃는다.
- CODING_RULES.md: 기존 함수/변수/DOM id·class 유지, 최소 범위 수정, 새 라이브러리 금지, 기존 파일 로드 순서 유지(새 스크립트는 `player-actions.js` 뒤에 추가).
- 주석/메시지는 한국어, 기존 파일의 주석 밀도와 스타일을 따른다. 각 파일 상단은 `"use strict";` + 설명 주석.

## 스펙 대비 조정 (구현 중 발견)

1. 제외 관리: SKILLDB에 "빌려쓰기 불가" 표시를 32곳에 넣는 대신 `timepatrol.js`의 화이트리스트 배열(`TP_POOL_NORMAL/ULT`) 한 곳에서 관리한다(결과 동일, 수정 파일 감소).
2. "조건 미충족 시 재추첨(최대 3회)"은 추첨 전에 `tpCanBorrow()`로 풀을 걸러내는 방식으로 대체한다(재추첨보다 단순하고 동치).
3. 마녀/시계 적 보너스는 적 데이터에 태그가 없어(확인함) 구현하지 않는다(스펙 확인사항 3의 대체안: 스토리 연출로만).
4. 로봇 배치 잔상은 피해 스킬이 아니라 `applyOutgoingDamageMods`를 거치지 않으므로 위력 배율 없이 원본 그대로 배치된다(마력 기준이라 기관사에 적합).

## File Structure

| 파일 | 역할 |
|---|---|
| Create `js/combat/timepatrol.js` | 풀/가중치/추첨(순수), 단서, `castBorrowed` 실행기, 수신/검증/봉쇄령 핸들러, 선택 오버레이 |
| Create `tests/timepatrol.test.js` | Node vm 기반 순수 로직/데이터 검증 |
| Modify `js/data/skills.js` | `mastery_timesync`, `tpReceive`, `tpVerify`, `tpLockdown` 4개 추가 |
| Modify `js/data/jobs.js` | `JOB_SPECIALIZATIONS.mechanic`에 `mechanic_timepatrol` 분기 추가 |
| Modify `js/combat/job-advancement.js` | 전직 확정 토스트 |
| Modify `js/data/equipment.js` | `applyOutgoingDamageMods`에 `borrowMult` 한 줄 |
| Modify `js/combat/player-actions.js` | 토글 조건 확장 3곳, 폭주 사출 가상 압력, 단서 증가/스킬 분기/가드 |
| Modify `js/combat/enemy-turn.js` | 피격 시 단서 +1 |
| Modify `js/combat/battle-fx.js` | 스킬 메뉴: 현장 검증 비활성 조건, 단서 표시 |
| Modify `js/combat/battle-setup.js` | 전투 시작 시 `restoreBorrow()` 방어 호출 |
| Modify `index.html` | `timepatrol.js` 스크립트 태그 |
| Modify `CURRENT_STATUS.md`, spec | 상태/조정 반영 |

---

### Task 1: 풀·가중치·추첨 순수 로직 + 테스트

**Files:**
- Create: `js/combat/timepatrol.js`
- Create: `tests/timepatrol.test.js`

**Interfaces:**
- Produces (전역, 이후 태스크가 사용):
  - `TP_POOL_NORMAL: string[]`(22), `TP_POOL_ULT: string[]`(10), `TP_MAX_CLUES = 5`
  - `tpBorrowPower(clues:number): number` — 0.7~1.0
  - `tpWeight(key:string, clues:number): number`
  - `tpPickKeys(n:number, clues:number, opts?:{allowUlt?:boolean, canBorrow?:(k)=>boolean, rng?:()=>number}): string[]` — 가중치 무복원 추첨
  - `tpCanBorrow(key:string): boolean`
  - `tpClues(): number` — 현재 전투 단서

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/timepatrol.test.js`:

```js
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
assert.strictEqual(normal.length, 22, '일반 22개');
assert.strictEqual(ult.length, 10, '궁극기 10개');
assert.strictEqual(new Set(normal.concat(ult)).size, 32, '중복 없음');
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
const ultShare = c => { const u = 10*run(`tpWeight('jesterAllIn',${c})`); return u/(u+22); };
assert.ok(Math.abs(ultShare(0) - 3/25) < 1e-9);
assert.ok(Math.abs(ultShare(5) - 8/30) < 1e-9);
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
assert.strictEqual(arr('tpPickKeys(99,0)').length, 32, '풀보다 많이 요청하면 풀 전체');

console.log('timepatrol.test.js: OK');
```

- [ ] **Step 2: 실패 확인**

Run: `node tests/timepatrol.test.js`
Expected: FAIL — `ENOENT ... js/combat/timepatrol.js` (파일 없음)

- [ ] **Step 3: 최소 구현**

`js/combat/timepatrol.js` (이 태스크에서는 순수 부분만; 실행기/핸들러는 Task 3~4에서 같은 파일에 이어 붙인다):

```js
"use strict";
/*
기관사 2차 전직 "타임패트롤"(mechanic_timepatrol) — 다른 직업 2차 전직의 액티브 스킬을
"잔상"으로 빌려 쓰는 로직.
export(전역): TP_POOL_NORMAL, TP_POOL_ULT, TP_MAX_CLUES, tpClues, tpBorrowPower, tpWeight,
              tpPickKeys, tpCanBorrow
의존성: data/skills.js(SKILLDB). battleFlags는 전역 전투 상태(typeof로 방어).
주의: 풀은 화이트리스트다. 예약형(선혈각인/분신 배가/정보료)·패시브·소환수 전제 스킬·
     총사령관의 명령·임계 폭주는 일부러 넣지 않았다(스펙 참고).
*/
  // 일반 22개(각 직업 2차 전직의 Lv10/12 액티브).
  const TP_POOL_NORMAL = [
    'warriorBloodpactActive',                                   // 혈맹의 검투사
    'chalnaSlowStrike','chalnaMidStrike','chalnaFastStrike',    // 찰나의 검사(예약형 제외)
    'mageElementStrike','mageElementWave',                      // 계약술사
    'mageHaste','mageTimeRewind',                               // 시간술사
    'mageCurseNova','mageCurseBrand',                           // 저주술사
    'rogueShadowStrike',                                        // 환영도적
    'rogueVenomInject',                                         // 역병숙주
    'necroSummon',                                              // 원혼 강탈자(보스 랜덤 소환)
    'paladinJudgmentLight',                                     // 순교자
    'paladinHolyRend','paladinDarkPrayer',                      // 회랑의 기사
    'mechanicOverloadDischarge',                                // 폭주 화부(가상 압력)
    'mechanicDeployRecon','mechanicDeployFirepower','mechanicDeployShield', // 강철 군단장
    'jesterGoldBet',                                            // 황금 도박사(실제 골드)
    'jesterDoubleDice',                                         // 사기꾼
  ];
  // 궁극기(Lv15) 10개 — 가중치가 낮고 단서로 오른다.
  const TP_POOL_ULT = [
    'warriorBloodpactUltimate','chalnaTriBeat','mageElementStorm','mageTimeParadox',
    'mageCurseBloom','rogueUndeadParade','paladinMartyrUltimate','paladinCaliberXFinale',
    'jesterAllIn','jesterFateSwap',
  ];
  const TP_MAX_CLUES = 5;

  function tpClues(){
    return (typeof battleFlags!=='undefined' && battleFlags && battleFlags.timeClues) || 0;
  }
  // 잔상 위력 배율: 70% + 단서 1개당 6%, 최대 100%.
  function tpBorrowPower(clues){ return Math.min(1, 0.7 + 0.06*clues); }
  // 일반 1, 궁극기 0.3 + 단서×0.1(최대 0.8).
  function tpWeight(key, clues){
    return TP_POOL_ULT.includes(key) ? Math.min(0.8, 0.3 + 0.1*clues) : 1;
  }
  // 지금 발동 가능한 스킬인지(조건 미충족 스킬은 추첨 전에 걸러낸다).
  function tpCanBorrow(key){
    const s = SKILLDB[key];
    if(!s) return false;
    // 운명 뒤바꾸기(hpswap)는 전투당 사용 횟수 제한이 있다.
    if(s.type==='hpswap' && typeof battleFlags!=='undefined' && battleFlags && (battleFlags.fateSwapUsedCount||0) >= 1) return false;
    return true;
  }
  // 가중치 무복원 추첨. rng는 테스트에서 주입한다.
  function tpPickKeys(n, clues, opts){
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const ok = opts.canBorrow || (()=>true);
    const pool = TP_POOL_NORMAL.concat(opts.allowUlt===false ? [] : TP_POOL_ULT)
      .filter(k=> SKILLDB[k] && ok(k));
    const out = [];
    while(out.length<n && pool.length){
      const total = pool.reduce((a,k)=>a+tpWeight(k,clues), 0);
      let r = rng()*total, idx = 0;
      for(; idx<pool.length-1; idx++){ r -= tpWeight(pool[idx], clues); if(r<0) break; }
      out.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return out;
  }
```

- [ ] **Step 4: 통과 확인**

Run: `node tests/timepatrol.test.js`
Expected: `timepatrol.test.js: OK`

> 실패 시: `SKILLDB에 없음: <key>`가 나오면 그 키의 철자를 `js/data/skills.js`에서 다시 확인해 배열을 고친다(스킬 키 32개는 스펙 조사 시 실제 코드에서 확인한 값). `쿨 3` 단언이 깨지는 궁극기가 있으면 그 스킬의 cooldown 필드를 확인하고, 실제로 쿨이 없다면 이 단언만 그 스킬 제외로 조정한다.

- [ ] **Step 5: Commit**

```bash
git add js/combat/timepatrol.js tests/timepatrol.test.js
git commit -m "타임패트롤: 잔상 풀/가중치/추첨 순수 로직과 테스트 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: 스킬 데이터 + 전직 분기 등록

**Files:**
- Modify: `js/data/skills.js` (도박사 섹션 시작 직전, 주석 `// 도박사 - 운명의 반란자(jester_rebel)` 위)
- Modify: `js/data/jobs.js` (`mechanic` 배열, 강철 군단장 항목 뒤)
- Modify: `js/combat/job-advancement.js` (시간술사 토스트 블록 뒤)
- Modify: `tests/timepatrol.test.js`
- Modify: `index.html` (스크립트 태그)

**Interfaces:**
- Consumes: Task 1의 없음(데이터만).
- Produces: SKILLDB 키 `mastery_timesync`(type `passive`), `tpReceive`(type `tpReceive`), `tpVerify`(type `tpVerify`), `tpLockdown`(type `tpLockdown`, cooldown 3); 전직 id `mechanic_timepatrol`.

- [ ] **Step 1: 실패하는 테스트 추가** — `tests/timepatrol.test.js`의 `console.log('...OK')` 바로 위에 추가:

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `node tests/timepatrol.test.js`
Expected: FAIL — `전직 분기 등록`

- [ ] **Step 3: 스킬 데이터 추가** — `js/data/skills.js`에서 아래 한 줄(정확히 이 문자열)을 찾아 그 **앞에** 삽입:

찾을 문자열: `    // 도박사 - 운명의 반란자(jester_rebel)`

삽입할 내용:

```js
    // 기관사 - 타임패트롤(mechanic_timepatrol) — 다른 시간대의 잔상을 수신해 다른 직업의
    // 2차 전직 액티브 스킬을 빌려 쓴다. 실제 로직은 combat/timepatrol.js(풀/실행기)와
    // combat/player-actions.js의 tp* 분기에 있다. 잔상 풀은 timepatrol.js의 화이트리스트.
    mastery_timesync: {name:'시간대 동조', mp:0, type:'passive',
      desc:'스킬을 쓰거나 피격당할 때마다 단서가 쌓인다(최대 5). 단서가 많을수록 잔상 스킬의 위력이 오르고(원본의 70% + 단서당 6%), 궁극기 잔상이 나올 확률이 커진다'},
    tpReceive: {name:'타임라인 수신', mp:8, type:'tpReceive',
      desc:'다른 시간대의 잔상을 수신해, 다른 직업의 2차 전직 스킬 하나를 무작위로 발동한다'},
    tpVerify: {name:'현장 검증', mp:12, type:'tpVerify',
      desc:'단서 2개를 소모해, 수신된 잔상 3개 중 원하는 하나를 골라 발동한다'},
    tpLockdown: {name:'시간 봉쇄령', mp:20, type:'tpLockdown', cooldown:3,
      desc:'쌓인 단서를 전부 소모해 잔상을 연달아 쏟아낸다(기본 2회 + 단서 2개당 1회, 최대 4회). 궁극기 잔상은 나오지 않는다'},

```

- [ ] **Step 4: 전직 분기 추가** — `js/data/jobs.js`에서 아래 블록을 찾아 교체.

찾을 문자열:

```js
        skillLevels: {12:'legionFullSquadSynergy', 15:'legionCommand'}},
    ],
```

교체할 내용:

```js
        skillLevels: {12:'legionFullSquadSynergy', 15:'legionCommand'}},
      // 타임패트롤(mechanic_timepatrol): 미래에서 정신만 넘어온 시간 수사관. 다른 직업 2차
      // 전직의 액티브 스킬을 "잔상"으로 랜덤 발동한다(combat/timepatrol.js). 압력도 로봇도 쓰지
      // 않고, 단서를 쌓아 랜덤을 통제해 가는 것이 핵심 루프다. 설계: docs/superpowers/specs/.
      {id:'mechanic_timepatrol', name:'타임패트롤', icon:'🕰️',
        desc:'미래의 어느 시점에서 정신만 넘어온 시간 수사관. 다른 시간대, 다른 직업의 스킬을 잔상으로 불러와 쓴다. 무엇이 나올지는 모르지만, 단서를 쌓을수록 수사는 진척된다.',
        masteryName:'시간대 동조', masteryDesc:'스킬을 쓰거나 피격당할 때마다 단서가 쌓인다(최대 5). 단서가 많을수록 잔상 스킬의 위력이 오르고 궁극기 잔상이 나올 확률이 커진다.', masterySkillId:'mastery_timesync',
        activeName:'타임라인 수신', activeDesc:'다른 시간대의 잔상을 수신해, 다른 직업의 2차 전직 스킬 하나를 무작위로 발동한다.', activeSkillId:'tpReceive',
        skillLevels: {12:'tpVerify', 15:'tpLockdown'}},
    ],
```

- [ ] **Step 5: 전직 토스트 추가** — `js/combat/job-advancement.js`에서 찾을 문자열(시간술사 토스트 블록의 끝):

```js
        showToast(`<h3>⏳ 시간술사</h3><p>멈춰버린 회랑 어딘가에서 새어 나온 시간의 파편이, 어느새 손끝에 스며들어 있었다.</p>`, '#9fd8ff');
      }
```

그 바로 뒤에 추가:

```js
      // 타임패트롤(mechanic_timepatrol): 전직 확정 순간의 토스트. 정체(미래의 수사관)를
      // 직접 밝히지 않고 낯선 목소리로만 암시한다(간접 서술 원칙, story.md 8장).
      if(specId==='mechanic_timepatrol' && typeof showToast==='function'){
        showToast(`<h3>🕰️ 타임패트롤</h3><p>머릿속에서 낯선 목소리가 낮게 속삭였다. "이 시간대는… 어긋나 있어."</p>`, '#9fd8ff');
      }
```

- [ ] **Step 6: index.html 스크립트 태그** — `<script src="js/combat/player-actions.js"></script>` 다음 줄에 추가:

```html
<script src="js/combat/timepatrol.js"></script>
```

- [ ] **Step 7: 통과 + 구문 확인**

Run: `node tests/timepatrol.test.js && for f in js/data/skills.js js/data/jobs.js js/combat/job-advancement.js js/combat/timepatrol.js; do node --check "$f" && echo "ok $f"; done`
Expected: `timepatrol.test.js: OK` 와 4줄의 `ok ...`

- [ ] **Step 8: Commit**

```bash
git add js/data/skills.js js/data/jobs.js js/combat/job-advancement.js index.html tests/timepatrol.test.js
git commit -m "타임패트롤: 전직 분기와 스킬 4종 데이터 등록

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: 빌려쓰기 실행기 + 전투 훅(잔상 위력/토글/가상 압력)

이 태스크의 훅들은 `battleFlags.borrow*` 플래그가 켜져 있을 때만 동작하므로, 병합해도 기존 직업 동작은 변하지 않는다.

**Files:**
- Modify: `js/combat/timepatrol.js` (실행기 추가)
- Modify: `js/data/equipment.js` (`applyOutgoingDamageMods`)
- Modify: `js/combat/player-actions.js` (토글 3곳 + 폭주 사출)
- Modify: `js/combat/battle-setup.js` (전투 시작 원복)

**Interfaces:**
- Consumes: Task 1의 `tpBorrowPower`, SKILLDB, `playerSkill(key, isRetry)`, 전역 `enemyTurn/setCommandsEnabled/resetCommandUI/checkBattleEnd`, `player`, `battleFlags`, `BOSSES`, `TIME_GUARDIAN`(typeof 방어).
- Produces:
  - `castBorrowed(key:string, done:()=>void, clues?:number): void` — `key` 스킬을 잔상으로 발동하고, 끝나면(적 턴 진입/명령창 복구 신호 감지 시) 모든 임시 상태를 원복한 뒤 `done()` 호출. 전투가 그 사이 끝나면 원복만 하고 `done()`은 호출하지 않는다.
  - `restoreBorrow(): void` — 멱등 원복(전투 시작 시 방어 호출용).
  - `battleFlags` 플래그: `borrowing`, `borrowMult`, `borrowBloodPact`, `borrowElementPact`, `borrowMartyr`.

- [ ] **Step 1: 실행기 구현** — `js/combat/timepatrol.js`에서 파일 헤더 export 주석의 마지막 줄을 `tpPickKeys, tpCanBorrow, castBorrowed, restoreBorrow`로 고치고, 파일 끝에 추가:

```js

  /* ---------- 빌려쓰기 실행기 ---------- */
  // playerSkill(key, true)로 스킬을 발동하되(isRetry=true → MP/쿨타임 검사·차감 생략),
  // 그동안만 전역 enemyTurn/setCommandsEnabled/resetCommandUI/checkBattleEnd를 가로채
  // "이 스킬이 끝났다"는 신호를 잡는다. 대부분의 스킬은 끝에서 enemyTurn()을 부르고, 턴을
  // 소모하지 않는 스킬(강령 소환 등)은 setCommandsEnabled(true)로 끝난다. 신호가 오면 임시
  // 상태를 전부 원복한 뒤 done()을 호출한다(연쇄 발동/마지막 적 턴 진입은 done의 몫).
  // 전투가 그 사이 끝나면(checkBattleEnd()가 true) 원복만 하고 done()은 부르지 않는다.
  const _tp = {active:false, key:null, real:null, saved:null};

  function restoreBorrow(){
    if(!_tp.active) return;
    window.enemyTurn = _tp.real.enemyTurn;
    window.setCommandsEnabled = _tp.real.setCommandsEnabled;
    window.resetCommandUI = _tp.real.resetCommandUI;
    window.checkBattleEnd = _tp.real.checkBattleEnd;
    player.atk = _tp.saved.atk;
    player.necroSummonType = _tp.saved.necroSummonType;
    if(battleFlags){
      ['borrowing','borrowMult','borrowBloodPact','borrowElementPact','borrowMartyr'].forEach(f=>{ delete battleFlags[f]; });
      // playerSkill이 빌린 스킬 키로 쿨타임을 걸어 뒀다면 지운다(내 스킬이 아니다).
      if(battleFlags.skillCooldowns) delete battleFlags.skillCooldowns[_tp.key];
    }
    _tp.active = false;
  }

  function castBorrowed(key, done, clues){
    restoreBorrow(); // 혹시 남아 있는 이전 상태 정리(멱등)
    const power = tpBorrowPower(clues===undefined ? tpClues() : clues);
    _tp.key = key;
    _tp.real = {enemyTurn, setCommandsEnabled, resetCommandUI, checkBattleEnd};
    _tp.saved = {atk: player.atk, necroSummonType: player.necroSummonType};
    _tp.active = true;
    const finish = ()=>{
      if(!_tp.active) return;
      restoreBorrow();
      done();
    };
    window.enemyTurn = finish;
    window.resetCommandUI = finish;
    window.setCommandsEnabled = en=>{ if(en) finish(); else _tp.real.setCommandsEnabled(false); };
    window.checkBattleEnd = function(){
      const over = _tp.real.checkBattleEnd.apply(null, arguments);
      if(over) restoreBorrow();
      return over;
    };
    // 잔상 위력(applyOutgoingDamageMods가 읽음) + 토글류 50% 랜덤 적용.
    battleFlags.borrowing = true;
    battleFlags.borrowMult = power;
    battleFlags.borrowBloodPact = Math.random() < 0.5;
    battleFlags.borrowElementPact = Math.random() < 0.5;
    battleFlags.borrowMartyr = Math.random() < 0.5;
    // 스탯 기준: 물리 스킬도 기관사에게 위력이 나오도록 max(공격력, 마력)을 쓴다.
    player.atk = Math.max(player.atk, player.mag);
    // 강령 소환: 마을 계약 대신 층별 보스(+시간의 파수꾼) 중 하나를 랜덤 소환한다.
    if(key==='necroSummon'){
      const bosses = BOSSES.concat(typeof TIME_GUARDIAN!=='undefined' ? [TIME_GUARDIAN] : []);
      player.necroSummonType = bosses[Math.floor(Math.random()*bosses.length)].type;
    }
    playerSkill(key, true);
  }
```

- [ ] **Step 2: 잔상 위력 훅** — `js/data/equipment.js`의 `applyOutgoingDamageMods`에서 찾을 문자열(파일 내 유일):

```js
    mult *= (ctx.onHitMult||1);
```

교체:

```js
    mult *= (ctx.onHitMult||1);
    // 타임패트롤 잔상(combat/timepatrol.js의 castBorrowed): 빌려 쓴 스킬의 위력 배율.
    if(typeof battleFlags!=='undefined' && battleFlags && battleFlags.borrowMult) mult *= battleFlags.borrowMult;
```

- [ ] **Step 3: 토글 훅 3곳 + 폭주 사출** — `js/combat/player-actions.js`에서 다음 4개를 각각 `Edit`로 교체(모두 파일 내 유일해야 한다; 아니라면 주변 줄을 포함해 유일하게 만든다).

(a) 원소 계약(~L3446)

찾기:
```js
    if(s.type==='magic' && key!=='mageTripleElement' && player.skills && player.skills.includes('mastery_elementpact')){
```
교체:
```js
    if(s.type==='magic' && key!=='mageTripleElement' && ((player.skills && player.skills.includes('mastery_elementpact')) || (battleFlags && battleFlags.borrowElementPact))){
```

(b) 혈서(~L3508)

찾기:
```js
    let bloodPactMsg = '';
    if(player.bloodPactArmed){
```
교체:
```js
    let bloodPactMsg = '';
    if(player.bloodPactArmed || (battleFlags && battleFlags.borrowBloodPact)){
```

(c) 희생의 맹세 — 잔상 전용 분기(영구 스탯 변화 없음). 찾기:
```js
    let martyrVowMsg = '';
    let instantMartyrTriggered = false;
```
교체:
```js
    let martyrVowMsg = '';
    let instantMartyrTriggered = false;
    // 타임패트롤 잔상: 희생의 맹세가 걸리면 영구 스탯 변화 없이 HP 8%를 바치고 피해 +50%.
    if(key==='paladinJudgmentLight' && battleFlags && battleFlags.borrowMartyr){
      const hpCostBM = Math.max(1, Math.round(player.maxhp*0.08));
      if(player.hp > hpCostBM){
        player.hp -= hpCostBM;
        dmg = Math.round(dmg*1.5);
        martyrVowMsg = ` 순교자의 맹세가 잔상으로 스쳐, HP ${hpCostBM}을(를) 바쳐 위력이 크게 올랐다!`;
      }
    }
```

(d) 폭주 사출 가상 압력(~L1949-1985) — 3곳:

찾기:
```js
      const edefS = getEffectiveEnemyDef(enemy.def);
      const pressure = battleFlags.pressure||0;
```
교체:
```js
      const edefS = getEffectiveEnemyDef(enemy.def);
      // 타임패트롤 잔상: 실제 압력 대신 가상 압력 100(폭주 화부의 기본 상한)으로 계산한다.
      const pressure = battleFlags.borrowing ? 100 : (battleFlags.pressure||0);
```
찾기:
```js
        battleFlags.pressure = Math.min(getPressureCap(), pressure + (typeof getPressureGainUsed==='function' ? getPressureGainUsed(s) : s.pressureGainOnUse));
        applyOverheatOverflowDamage(battleFlags.pressure);
```
교체:
```js
        if(!battleFlags.borrowing){ // 잔상은 실제 압력을 쌓지 않는다
          battleFlags.pressure = Math.min(getPressureCap(), pressure + (typeof getPressureGainUsed==='function' ? getPressureGainUsed(s) : s.pressureGainOnUse));
          applyOverheatOverflowDamage(battleFlags.pressure);
        }
```
찾기:
```js
        setBattleMsg(`${player.name}의 ${s.name}!`, `압력 ${pressure}을(를) 그대로 유지한 채 ${dmg}의 피해를 입혔다! 오히려 압력이 ${battleFlags.pressure}까지 더 쌓였다.`);
```
교체:
```js
        setBattleMsg(`${player.name}의 ${s.name}!`, battleFlags.borrowing
          ? `잔상의 압력 ${pressure}이(가) 터져 ${dmg}의 피해를 입혔다!`
          : `압력 ${pressure}을(를) 그대로 유지한 채 ${dmg}의 피해를 입혔다! 오히려 압력이 ${battleFlags.pressure}까지 더 쌓였다.`);
```

> 주의: `pressureCO`(임계 폭주)의 `const pressureCO = battleFlags.pressure||0;`는 건드리지 않는다. (d)의 첫 교체는 `edefS` 줄과 함께 찾아야 유일하다.

- [ ] **Step 4: 전투 시작 원복** — `js/combat/battle-setup.js`에서 찾을 문자열(startBattle 안, explore.js의 유사 줄과 구분되도록 `snakeskinUsed:false`까지 포함):

```js
    battleFlags = {guardian:false, phoenix:false, firstStrikeUsed:false, execCount:0, execReady:false, gambleStacks:0, jackpotGauge:0, jackpotArmed:false, paladinAwoken:false, paladinUltUsed:false, hourglassTurn:0, witchClockUsedThisTurn:false, snakeskinUsed:false
```

그 **앞에** 한 줄 삽입(들여쓰기 4칸):

```js
    // 타임패트롤 잔상 실행 도중 전투가 끝나 임시 상태(가로챈 전역 함수, 바뀐 공격력)가 남아
    // 있을 수 있으니 새 전투 시작 전에 멱등 원복한다(combat/timepatrol.js).
    if(typeof restoreBorrow==='function') restoreBorrow();
```

- [ ] **Step 5: 구문/회귀 확인**

Run: `for f in js/combat/timepatrol.js js/data/equipment.js js/combat/player-actions.js js/combat/battle-setup.js; do node --check "$f" && echo "ok $f"; done && node tests/timepatrol.test.js`
Expected: 4줄 `ok ...` + `timepatrol.test.js: OK`

- [ ] **Step 6: 브라우저 스모크(훅이 기존 직업을 안 깨는지)**

`index.html`을 브라우저로 열고(로컬 파일 그대로), 기존 캐릭터(예: 마법사/전사)로 전투 1회 진행.
Expected: 스킬 사용/적 턴/승리가 평소와 동일, 콘솔 에러 없음.
콘솔에서 `enemyTurn.name`, `checkBattleEnd.name` 확인 → 각각 `enemyTurn`, `checkBattleEnd`.

- [ ] **Step 7: Commit**

```bash
git add js/combat/timepatrol.js js/data/equipment.js js/combat/player-actions.js js/combat/battle-setup.js
git commit -m "타임패트롤: 빌려쓰기 실행기와 잔상 위력/토글/가상 압력 전투 훅 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: 스킬 3종 핸들러 + 단서 시스템 + 메뉴 연동

**Files:**
- Modify: `js/combat/timepatrol.js` (핸들러/선택 오버레이/단서)
- Modify: `js/combat/player-actions.js` (가드 + 단서 증가 + 분기 3개)
- Modify: `js/combat/enemy-turn.js` (피격 단서)
- Modify: `js/combat/battle-fx.js` (메뉴)
- Modify: `tests/timepatrol.test.js`

**Interfaces:**
- Consumes: Task 1/3의 `tpPickKeys`, `tpCanBorrow`, `tpClues`, `TP_MAX_CLUES`, `castBorrowed`, SKILLDB의 `tp*` 타입, 전역 `playBanner(text, cls)`, `setBattleMsg(l1,l2)`, `enemyTurn`, `battleOver`.
- Produces: `tpAddClue(n)`, `tpReceive()`, `tpVerify()`, `tpLockdown()`, `tpShowChoice(keys, onPick)` (전역).

- [ ] **Step 1: 실패하는 테스트 추가** — `console.log('...OK')` 위에 추가(단서 증가/상한/전제 마스터리):

```js
// 단서 시스템: 마스터리가 있을 때만, 최대 5
run(`var player = {skills:[]}; var battleFlags = {};`);
run('tpAddClue(1)');
assert.strictEqual(run('tpClues()'), 0, '마스터리 없으면 단서 없음');
run(`player.skills.push('mastery_timesync')`);
run('tpAddClue(1)'); run('tpAddClue(1)');
assert.strictEqual(run('tpClues()'), 2);
run('tpAddClue(9)');
assert.strictEqual(run('tpClues()'), 5, '상한 5');
```

- [ ] **Step 2: 실패 확인**

Run: `node tests/timepatrol.test.js`
Expected: FAIL — `tpAddClue is not defined`

- [ ] **Step 3: 핸들러 구현** — `js/combat/timepatrol.js` 파일 헤더 export 주석에 `tpAddClue, tpReceive, tpVerify, tpLockdown, tpShowChoice`를 이어 적고, 파일 끝에 추가:

```js

  /* ---------- 단서 / 스킬 핸들러 ---------- */
  // 시간대 동조(mastery_timesync)가 있을 때만 쌓인다. 단서는 전투마다 초기화되는
  // battleFlags에 저장되므로 전투가 끝나면 자연히 사라진다.
  function tpAddClue(n){
    if(!(player.skills && player.skills.includes('mastery_timesync'))) return;
    battleFlags.timeClues = Math.min(TP_MAX_CLUES, (battleFlags.timeClues||0) + n);
  }

  // 타임라인 수신: 잔상 하나를 무작위로 발동.
  function tpReceive(){
    const key = tpPickKeys(1, tpClues(), {canBorrow: tpCanBorrow})[0];
    if(!key){
      setBattleMsg('타임라인 수신', '수신되는 잔상이 없다…');
      enemyTurn();
      return;
    }
    playBanner('⏳ 타임라인 수신!', 'def');
    castBorrowed(key, ()=>enemyTurn());
  }

  // 현장 검증: (단서 2개는 playerSkill의 가드가 확인) 잔상 3개 중 하나를 골라 발동.
  function tpVerify(){
    const c = tpClues();
    battleFlags.timeClues = c - 2;
    const keys = tpPickKeys(3, c, {canBorrow: tpCanBorrow});
    if(!keys.length){ enemyTurn(); return; }
    // 위력은 소모 전 단서 기준으로 계산한다(c를 castBorrowed에 넘김).
    tpShowChoice(keys, k=> castBorrowed(k, ()=>enemyTurn(), c));
  }

  // 시간 봉쇄령: 단서를 전부 소모해 2 + floor(단서/2)회(최대 4) 연속 발동. 궁극기 제외.
  function tpLockdown(){
    const c = tpClues();
    const n = Math.min(4, 2 + Math.floor(c/2));
    battleFlags.timeClues = 0;
    playBanner('⏳ 시간 봉쇄령!', 'def');
    let i = 0;
    const next = ()=>{
      if(i>=n){ enemyTurn(); return; }
      i++;
      const key = tpPickKeys(1, c, {allowUlt:false, canBorrow: tpCanBorrow})[0];
      if(!key){ enemyTurn(); return; }
      setTimeout(()=>{ if(!battleOver) castBorrowed(key, next, c); }, 350);
    };
    next();
  }

  // 3개 중 하나를 고르는 오버레이. 전직 선택창(showJobAdvancement)의 기존 클래스를
  // 그대로 재사용한다(새 CSS 없음). 취소 불가 — MP는 이미 소모됐다.
  function tpShowChoice(keys, onPick){
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel';
    panel.innerHTML = `<h3>현장 검증</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;line-height:1.6;margin-bottom:12px;">수신된 잔상 중 하나를 고른다.</p>
      <div class="job-card-grid"></div>`;
    const grid = panel.querySelector('.job-card-grid');
    keys.forEach(k=>{
      const sk = SKILLDB[k];
      const card = document.createElement('div');
      card.className = 'job-card';
      card.innerHTML = `<div class="ji-icon">${TP_POOL_ULT.includes(k) ? '✨' : '⏳'}</div>
        <div class="ji-name">${sk.name}</div>
        <div class="ji-desc">${sk.desc}</div>`;
      card.addEventListener('click', ()=>{ overlay.remove(); onPick(k); });
      grid.appendChild(card);
    });
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
  }
```

- [ ] **Step 4: playerSkill 연동** — `js/combat/player-actions.js`:

(a) 현장 검증 가드(MP를 깎기 전에 막는다 — 기존 가드들과 같은 이유). 찾기:
```js
    const freeCast = mpCost>0 && hasRelicFlag('freeCastChance') && Math.random() < getRelicSum('freeCastChance');
```
그 **앞에** 삽입:
```js
    // 현장 검증(타임패트롤 레벨12)은 단서 2개가 필요하다. MP를 깎기 전에 막는다.
    if(s.type==='tpVerify' && (battleFlags.timeClues||0) < 2){
      setCommandsEnabled(true);
      setBattleMsg(s.name, '단서가 부족하다! 단서가 2개 이상 있어야 현장을 검증할 수 있다.');
      return;
    }

```

(b) 단서 증가 + 분기. 찾기(토글 분기 `arm` 블록 뒤, `elementpact` 블록 시작):
```js
    if(s.type==='elementpact'){
      // 화염/빙결/번개계약(계약술사) — 서로 배타적인 3방향 토글.
```
그 **앞에** 삽입:
```js
    // 타임패트롤: 스킬을 쓸 때마다 단서 +1(잔상 발동 중이거나 검증/봉쇄령 자신은 제외 —
    // 이 둘은 단서를 소모하는 스킬이라 여기서 다시 쌓으면 소모량이 상쇄된다).
    if(!(battleFlags && battleFlags.borrowing) && s.type!=='tpVerify' && s.type!=='tpLockdown'){
      tpAddClue(1);
    }
    if(s.type==='tpReceive'){ tpReceive(); return; }
    if(s.type==='tpVerify'){ tpVerify(); return; }
    if(s.type==='tpLockdown'){ tpLockdown(); return; }

```

- [ ] **Step 5: 피격 단서** — `js/combat/enemy-turn.js`에서 찾기(유일):
```js
      player.hp = Math.max(0, player.hp - mitigated);
      checkPaladinAwoken();
```
교체:
```js
      player.hp = Math.max(0, player.hp - mitigated);
      // 타임패트롤(mastery_timesync): 피격당할 때마다 단서 +1.
      if(mitigated>0 && typeof tpAddClue==='function') tpAddClue(1);
      checkPaladinAwoken();
```

- [ ] **Step 6: 스킬 메뉴** — `js/combat/battle-fx.js`:

(a) 찾기: `        const canUse = !usedOnce && player.mp>=mpCost && cdLeft<=0;`
교체:
```js
        const canUse = !usedOnce && player.mp>=mpCost && cdLeft<=0
          && !(s.type==='tpVerify' && !((battleFlags && battleFlags.timeClues)>=2));
```
(b) 찾기:
```js
        // 2차 전직(찰나검사 등) 스킬에 한해 이름 옆에 한자를 괄호로 병기(사용자 요청).
        if(displayHanja) displayName = `${displayName}(${displayHanja})`;
```
그 **앞에** 삽입:
```js
        // 타임패트롤 스킬은 설명 끝에 현재 단서 수를 붙여 보여준다.
        if(s.type==='tpReceive' || s.type==='tpVerify' || s.type==='tpLockdown'){
          displayDesc += ` [단서 ${(battleFlags && battleFlags.timeClues)||0}/${TP_MAX_CLUES}]`;
        }
```

- [ ] **Step 7: 테스트/구문**

Run: `node tests/timepatrol.test.js && for f in js/combat/timepatrol.js js/combat/player-actions.js js/combat/enemy-turn.js js/combat/battle-fx.js; do node --check "$f" && echo "ok $f"; done`
Expected: `timepatrol.test.js: OK` + 4줄 `ok ...`

- [ ] **Step 8: Commit**

```bash
git add js/combat/timepatrol.js js/combat/player-actions.js js/combat/enemy-turn.js js/combat/battle-fx.js tests/timepatrol.test.js
git commit -m "타임패트롤: 수신/검증/봉쇄령 스킬 핸들러, 단서 시스템, 스킬 메뉴 연동

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: 32개 풀 스모크 테스트 + 풀 확정 + 문서

이 태스크는 브라우저에서 실제로 돌려 본다. `playerSkill`이 3천 줄 단일 함수라 스킬별 특이 동작(마지막에 턴을 안 넘기는 스킬, 중간에 UI를 리셋하는 스킬 등)은 실행해 보기 전엔 확인이 안 된다.

**Files:**
- Modify: `js/combat/timepatrol.js` (문제 스킬을 풀에서 제거하거나 `tpCanBorrow`에 조건 추가)
- Modify: `tests/timepatrol.test.js` (풀 개수 단언)
- Modify: `docs/superpowers/specs/2026-09-21-timepatrol-design.md`, `CURRENT_STATUS.md`

- [ ] **Step 1: 레벨 10+ 기관사 준비**

브라우저에서 기관사로 레벨 10 이상까지 진행하거나(디버그/관리자 계정이 있으면 사용), 전직 선택창에서 "타임패트롤"을 선택. 전직 토스트와 스킬 메뉴에 `타임라인 수신` 표시 확인. 레벨 12/15에서 `현장 검증`/`시간 봉쇄령` 지급 확인(콘솔: `player.skills`).

- [ ] **Step 2: 실제 스킬 3종 동작 확인**

전투 중:
1. 타임라인 수신 사용 → 랜덤 잔상 발동, 배너 표시, 피해 발생, **적 턴이 정확히 한 번** 진행, 명령창 복구.
2. 스킬 메뉴 설명 끝의 `[단서 n/5]`가 스킬 사용/피격 때마다 늘어남(최대 5).
3. 단서 2 미만일 때 현장 검증이 비활성, 2 이상이면 3장 선택창이 뜨고 선택한 스킬이 발동, 단서 -2.
4. 시간 봉쇄령: 단서 소모, 2~4회 연속 발동, 마지막에 적 턴 1회, 쿨타임 3턴.
5. 전투가 잔상 발동 중 끝나도(적을 잡는 경우) 다음 전투에서 `enemyTurn.name==='enemyTurn'`, `player.atk`가 전직 전 값 그대로.

- [ ] **Step 3: 풀 32개 개별 검증**

전투 중 콘솔에서 스킬 키마다 아래를 실행(전투를 새로 시작하거나 적이 살아 있을 때):

```js
(function(k){ const a=player.atk, hp=player.hp, mp=player.mp; castBorrowed(k, ()=>enemyTurn(), 0); setTimeout(()=>console.log(k,'atk',a,'->',player.atk,'mp',mp,'->',player.mp,'borrow flags',Object.keys(battleFlags).filter(x=>x.startsWith('borrow'))), 3000); })('rogueVenomInject')
```

각 키에 대해 다음을 모두 확인(하나라도 어기면 문제 스킬):
- 정확히 한 번 적 턴이 진행되고 명령창이 복구된다(적 턴이 두 번 오거나 명령창이 잠기면 문제).
- 로그의 `atk a -> b`에서 a===b(공격력 원복), `mp`가 그대로(빌린 스킬은 MP 무소모), `borrow flags`가 빈 배열.
- 콘솔 에러 없음.

확인 대상 키(32개): `TP_POOL_NORMAL` 22개 + `TP_POOL_ULT` 10개. 특히 유의:
- `mageHaste`, `mageTimeRewind`: 적 턴을 건너뛰거나 상태를 되감는 스킬 — 적 턴이 두 번 오거나 되감기 결과가 이상하면 풀에서 제거.
- `necroSummon`: 보스가 매번 다르게 소환되는지, 4턴 소환수가 자동 공격하는지.
- `jesterGoldBet`/`jesterAllIn`: 실제 골드가 늘고 줄어드는지(스펙대로).
- `mechanicOverloadDischarge`: `battleFlags.pressure`가 전후로 동일한지, 피해가 0이 아닌지.
- `mechanicDeploy*`: 로봇이 배치되고 3턴 후 사라지는지.
- `paladinJudgmentLight`: `player.maxhp`가 전후로 동일한지(영구 감소 없음).
- 토글: 같은 스킬을 여러 번 발동해 혈서/원소 계약/희생의 맹세 메시지가 일부에만 뜨는지.

- [ ] **Step 4: 문제 스킬 처리**

문제가 있는 스킬은 (a) 조건만 문제면 `tpCanBorrow()`에 조건을 추가하고, (b) 근본적으로 안 맞으면 `TP_POOL_NORMAL/ULT`에서 제거한다. 제거하면 `tests/timepatrol.test.js`의 개수 단언(22/10/32, 확률 3/25·8/30, `tpPickKeys(99,0).length`)을 새 개수에 맞춰 고치고 스펙의 "풀 규모" 문단도 같이 고친다(궁극기 확률 = `0.3n/(0.3n+일반수)` 등 재계산).

- [ ] **Step 5: 최종 검증**

Run:
```bash
node tests/timepatrol.test.js
for f in js/combat/timepatrol.js js/combat/player-actions.js js/combat/enemy-turn.js js/combat/battle-fx.js js/combat/battle-setup.js js/combat/job-advancement.js js/data/skills.js js/data/jobs.js js/data/equipment.js; do node --check "$f" || echo "FAIL $f"; done
```
Expected: `timepatrol.test.js: OK`, `FAIL` 없음. 기존 직업(전사/마법사/도박사) 전투 1회씩 정상(콘솔 에러 없음)도 확인.

- [ ] **Step 6: 문서 반영**

- 스펙 `docs/superpowers/specs/2026-09-21-timepatrol-design.md`의 "개별 스킬 예외"에 있는 `SKILLDB 항목에 "빌려쓰기 불가" 표시` 문장을 `timepatrol.js의 화이트리스트(TP_POOL_NORMAL/ULT)로 관리한다`로, "재추첨" 언급을 `추첨 전 tpCanBorrow로 걸러낸다`로 고치고, 마녀 보너스 항목에 `적 태그가 없어 미구현`을 명시한다.
- `CURRENT_STATUS.md`: 파일을 읽어 기존 형식대로 "최근 변경사항"에 타임패트롤 추가(변경 파일, 검증 결과, 미검증 항목)를 짧게 적는다.

- [ ] **Step 7: Commit**

```bash
git add -A js tests docs CURRENT_STATUS.md index.html
git commit -m "타임패트롤: 스킬 풀 스모크 검증 반영, 문서 갱신

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage**
- 전직 분기/마스터리/액티브/Lv12/Lv15 → Task 2. 수치(MP 8/12/20, 쿨 3) → Task 2 + 테스트.
- 잔상 위력 70%+6% → Task 1(`tpBorrowPower`) + Task 3(훅). 스탯 기준 max(atk,mag) → Task 3. MP/쿨타임 미소모 → `isRetry=true`(Task 3) + 쿨타임 잔여 삭제.
- 궁극기 가중치/확률 → Task 1. 단서 → Task 4. 현장 검증 3택 UI → Task 4. 봉쇄령 연속(2+⌊c/2⌋, 최대 4, 궁극기 제외) → Task 4.
- 토글 50%(혈서/원소 계약/맹세, 맹세는 영구 변화 제거) → Task 3. 폭주 사출 가상 압력 → Task 3. 군단장 로봇 3종 → 풀(Task 1)+실행기(별도 코드 없음). 강령 소환 보스 랜덤 → Task 3. 골드 실제 → 별도 코드 없음(원본 그대로) + Task 5 확인.
- 풀 32개/제외 목록 → Task 1 테스트. 마녀 보너스 → "스펙 대비 조정"에 미구현 명시.

**Placeholder scan:** TBD/TODO 없음. Task 5는 실행 결과에 따라 풀을 줄일 수 있음을 절차로 명시(스펙 "구현 시 확인" 항목과 일치).

**Type/이름 일관성:** `castBorrowed(key, done, clues)`, `restoreBorrow()`, `tpPickKeys(n, clues, opts)`, `tpCanBorrow`, `tpClues`, `tpAddClue`, `tpShowChoice(keys, onPick)`(Task 4 호출부와 정의 일치), `battleFlags.borrow*` 5개 이름이 Task 3 정의·훅·`restoreBorrow` 목록에서 동일. `TP_MAX_CLUES`는 Task 1 정의, Task 4 메뉴에서 사용.

**알려진 위험(Task 5에서 실측):** (1) 스킬이 중간에 `resetCommandUI()`/`setCommandsEnabled(true)`를 부르면 조기 종료로 적 턴이 두 번 올 수 있음 — 해당 스킬은 풀에서 제거. (2) 가로챈 전역 함수는 잔상 발동 중에만 살아 있고, 전투 종료/전투 시작 시 `restoreBorrow()`로 원복된다. (3) 오버레이가 쓰는 `shop-overlay/shop-panel/job-card-grid/job-card` 클래스가 전투 화면에서도 올바르게 보이는지 Task 5 Step 2-3에서 확인.
