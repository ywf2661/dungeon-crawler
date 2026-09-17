# 난이도 상승 저주 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보통/하드코어 난이도에 "확정 시작 저주", "저주받은 유물"(일반 유물 제단 20% 확률), "저주받은 유물함"·"속죄의 제단"(미지의 사건 신규 2종)을 추가해 난이도를 실질적으로 올린다.

**Architecture:** 이 프로젝트는 빌드 도구/모듈 시스템이 없는 vanilla JS 정적 페이지다. 모든 `js/**/*.js`는 classic `<script>`로 순서대로 로드되어 하나의 전역 스코프를 공유한다(`player`/`RELICS`/`battleFlags` 등은 전부 전역 바인딩). 새 기능은 이 관례를 그대로 따라 기존 전역 함수/변수에 얹는다 — 모듈 import, 클래스, 새 파일 분리는 도입하지 않는다.

**Tech Stack:** Vanilla JS(ES6+, `"use strict"` classic scripts), 순수 HTML/CSS(index.html). 테스트 프레임워크나 번들러는 없다.

**Spec:** [docs/superpowers/specs/2026-09-17-difficulty-curses-design.md](../specs/2026-09-17-difficulty-curses-design.md)

## Global Constraints

- 신규 effect 키는 전부 기존 `getRelicSum(key)`/`hasRelicFlag(key)`([data/equipment.js:545-553](../../../js/data/equipment.js#L545-L553)) 조회 방식을 재사용한다 — `player.relics` 배열만 정확히 채우면 되고, 별도의 캐싱/적용 시점 로직을 새로 만들지 않는다.
- 저주의 지속시간 신호는 기존 `player.tempCurses`(`{curseId: tierIndex}`, [player.js:120](../../../js/player.js#L120))를 그대로 재사용한다 — 이 오브젝트에 없으면 영구, 있으면 구간 한정이라는 기존 규칙을 그대로 따르고 새 필드를 만들지 않는다.
- 이 저장소에는 테스트 프레임워크가 없다. 검증은 기존 관례(`node --check <file>`로 문법 확인 + 브라우저 수동 확인)를 그대로 따른다. 각 태스크 끝에 정확한 수동 확인 절차를 포함한다.
- 새 relic id는 전부 `relic_` 접두사, 새 effect 키는 camelCase — 기존 `RELICS` 명명 관례를 그대로 따른다.
- 커밋은 태스크 단위로 나눠서 한다(기존 저장소 커밋 로그 관례상 한국어 커밋 메시지, 기능 단위 커밋).

---

## 파일 구조 개요

| 파일 | 이번 작업에서의 역할 |
|---|---|
| `js/player.js` | `newPlayer()`에 `cursedRelicBundles:{}` 필드 추가 |
| `js/relics.js` | 저주 데이터 10개 추가, `PERMANENT_CURSE_POOL`/헬퍼 함수 3개 신설, `removeRelic()` 결속 해제 연동, `showRelicAltar()`/`showRelicSwapPrompt()`에 저주받은 유물 로직, `showCurseAltar()` 라벨 통일 |
| `js/data/equipment.js` | `equipItem()`/`unequipItem()`에 슬롯 봉인 체크 |
| `js/combat/battle-end.js` | `grantExp()`, 처치 골드 계산부에 `expGoldPct` 반영 |
| `js/combat/player-actions.js` | 스킬 쿨타임 세팅부에 `cooldownBonus` 반영 |
| `js/shop.js` | `discountMult`에 `shopPricePct` 반영 |
| `js/explore.js` | 신규 캐릭터 생성 직후 확정 시작 저주 적용 |
| `js/events.js` | 신규 미지의 사건 2종 추가, `showMysteryEvent()` 풀 등록 |
| `js/records.js` | `renderRelicCardGroup()` 라벨/접두사 표시 |

---

## Task 1: 신규 저주 데이터 등록 (RELICS + 두 풀)

**Files:**
- Modify: `js/relics.js:77-96` (기존 저주 5종 블록 뒤에 신규 항목 추가), `js/relics.js:144-149` (풀 정의부)

**Interfaces:**
- Produces: `RELICS`에 신규 id 10개(`relic_fadedmap`, `relic_rustedarmor`, `relic_forgottencharm`, `relic_barrenpurse`, `relic_stiffhands`, `relic_faintheart`, `relic_mildhunger`, `relic_fadingshadow`, `relic_thinhide`, `relic_shallowwell`), 전역 상수 `PERMANENT_CURSE_POOL`(배열). 이후 태스크(2~9)가 이 id들과 상수를 그대로 참조한다.

- [ ] **Step 1: `RELICS`에 신규 5종(구간/영구 공용) 추가**

`js/relics.js`의 96번째 줄(`relic_driedwell` 다음 줄) 바로 뒤에 삽입:

```js
    // 신규 확정 시작 저주 5종(사용자 기획 — 난이도 상승 장치). 구간 저주
    // 제단과 영구 확정 시작 저주/저주받은 유물 양쪽에 동일한 값으로 등록된다
    // (완화판이 따로 필요 없을 만큼 처음부터 "영구로 걸어도 되는" 강도로
    // 설계했다). expGoldPct/armorLocked/accessoryLocked/shopPricePct/
    // cooldownBonus는 전부 새 effect 키 — 각각 combat/battle-end.js,
    // data/equipment.js, shop.js, combat/player-actions.js에서 getRelicSum/
    // hasRelicFlag로 조회한다(2~3단계 참고).
    relic_fadedmap:      {type:'curse', name:'빛바랜 지도', desc:'경험치와 골드 획득량이 20% 줄어든다.', effect:{expGoldPct:-0.20}},
    relic_rustedarmor:   {type:'curse', name:'낡은 갑주', desc:'방어구 슬롯이 봉인되어 장착할 수 없다.', effect:{armorLocked:true}},
    relic_forgottencharm:{type:'curse', name:'잊혀진 장신구', desc:'장신구 슬롯이 봉인되어 장착할 수 없다.', effect:{accessoryLocked:true}},
    relic_barrenpurse:   {type:'curse', name:'메마른 지갑', desc:'상점 구매 가격이 30% 비싸진다.', effect:{shopPricePct:0.30}},
    relic_stiffhands:    {type:'curse', name:'굳은 손', desc:'재사용 대기시간이 있는 스킬의 쿨타임이 1턴 늘어난다.', effect:{cooldownBonus:1}},

    // 기존 구간용 저주 5종의 "영구용 완화판"(사용자 기획). permanentOnly:true는
    // CURSE_ALTAR_POOL 필터에서 제외하기 위한 표시일 뿐, deprecated와 달리
    // PERMANENT_CURSE_POOL에는 정상적으로 포함된다.
    relic_faintheart:    {type:'curse', permanentOnly:true, name:'여윈 심장',   desc:'최대 HP가 25% 줄어든다.', effect:{maxhpPct:-0.25}},
    relic_mildhunger:    {type:'curse', permanentOnly:true, name:'옅은 굶주림', desc:'레벨업으로는 체력·마나가 가득 차지 않는다(포션은 정상 사용 가능).', effect:{noPostBattleHeal:true}},
    relic_fadingshadow:  {type:'curse', permanentOnly:true, name:'옅어진 그림자', desc:'마주치는 모든 적의 공격력이 15% 오른다.', effect:{enemyAtkPct:0.15}},
    relic_thinhide:      {type:'curse', permanentOnly:true, name:'얇아진 가죽', desc:'받는 피해가 10% 늘어난다.', effect:{dmgTakenPctMult:0.10}},
    relic_shallowwell:   {type:'curse', permanentOnly:true, name:'얕아진 샘',   desc:'최대 마나가 25% 줄어든다.', effect:{maxmpPct:-0.25}},
```

- [ ] **Step 2: 두 풀 정의 수정**

`js/relics.js:148`의 기존 줄:
```js
  const CURSE_ALTAR_POOL = Object.keys(RELICS).filter(id=>RELICS[id].type==='curse' && !RELICS[id].deprecated);
```
을 아래로 교체(신규 5종은 합류, 완화판 5종은 `permanentOnly`로 제외):
```js
  const CURSE_ALTAR_POOL = Object.keys(RELICS).filter(id=>RELICS[id].type==='curse' && !RELICS[id].deprecated && !RELICS[id].permanentOnly);
  // 영구 컨텍스트(확정 시작 저주/저주받은 유물/저주받은 유물함) 전용 풀.
  // "완화판" 5종 + 신규 5종(구간용과 값을 공유) = 10개. 명시적으로 나열한다 —
  // CURSE_ALTAR_POOL과 자동 파생 관계가 아니라서 필터 하나로 유도할 수 없다.
  const PERMANENT_CURSE_POOL = [
    'relic_faintheart', 'relic_mildhunger', 'relic_fadingshadow', 'relic_thinhide', 'relic_shallowwell',
    'relic_fadedmap', 'relic_rustedarmor', 'relic_forgottencharm', 'relic_barrenpurse', 'relic_stiffhands',
  ];
```

- [ ] **Step 3: 문법 확인**

Run: `node --check js/relics.js`
Expected: 출력 없음(에러 없이 통과)

- [ ] **Step 4: 커밋**

```bash
git add js/relics.js
git commit -m "$(cat <<'EOF'
난이도 상승 저주 10종 데이터 추가(구간/영구 이중 풀)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 신규 effect 키 4개 배선

**Files:**
- Modify: `js/combat/battle-end.js:144-159` (처치 골드), `js/combat/battle-end.js:840-854` (`grantExp`)
- Modify: `js/data/equipment.js:222-267` (`equipItem`/`unequipItem`), `js/relics.js:400-414` (`applyRelicEffect` — 봉인 시 즉시 해제)
- Modify: `js/shop.js:58-59` (`discountMult`)
- Modify: `js/combat/player-actions.js:449-455` (쿨타임 세팅)

**Interfaces:**
- Consumes: Task 1의 `expGoldPct`/`armorLocked`/`accessoryLocked`/`shopPricePct`/`cooldownBonus` effect 키
- Produces: 네 effect 키가 실제 게임플레이에 반영됨. Task 5(확정 시작 저주)·Task 6(저주받은 유물)가 이 배선에 의존한다.

- [ ] **Step 1: 처치 골드에 `expGoldPct` 반영**

`js/combat/battle-end.js:154-159`의 기존 코드:
```js
      if(goldBoost>0) g = Math.round(g*(1+goldBoost));
      // 몰빵 각인(ju_bigbet, 황금 도박사) 실패 페널티 — 이번 전투에서 얻는
      // 골드가 반토막난다(battleFlags는 이번 전투 한정이라 자연히 다음
      // 전투로는 안 넘어간다).
      if(battleFlags && battleFlags.goldbetGoldPenalty) g = Math.round(g*0.5);
      player.gold += g;
```
를 아래로 교체(주의: `goldBoost`는 `>0`일 때만 곱해지는 기존 게이트라 음수 저주 효과를 여기 합치면 무시된다 — 반드시 별도 단계로 분리):
```js
      if(goldBoost>0) g = Math.round(g*(1+goldBoost));
      // 몰빵 각인(ju_bigbet, 황금 도박사) 실패 페널티 — 이번 전투에서 얻는
      // 골드가 반토막난다(battleFlags는 이번 전투 한정이라 자연히 다음
      // 전투로는 안 넘어간다).
      if(battleFlags && battleFlags.goldbetGoldPenalty) g = Math.round(g*0.5);
      // 빛바랜 지도(relic_fadedmap) 등 확정 시작 저주 — 경험치/골드 획득량
      // 감소. goldBoost와 같은 변수에 합치면 위 "goldBoost>0"에서 걸러져
      // 음수가 무시되므로 별도 곱셈으로 분리한다.
      const expGoldCursePct = getRelicSum('expGoldPct');
      if(expGoldCursePct<0) g = Math.round(g*(1+expGoldCursePct));
      player.gold += g;
```

- [ ] **Step 2: `grantExp()`에 `expGoldPct` 반영**

`js/combat/battle-end.js:840-846`의 기존 코드:
```js
  function grantExp(amount){
    // 정체된 맹세(relic_frozenvow): 경험치 획득 자체를 완전히 무효화한다.
    if(hasRelicFlag('noExpGain')) return [];
    // 오프닝 심리테스트(origin.js) "진실" 기질 — 경험치 획득 +8%.
    const expBonus = (player.originBonuses && player.originBonuses.truth) || 0;
    if(expBonus>0) amount = Math.round(amount*(1+expBonus));
    player.exp += amount;
```
를 아래로 교체:
```js
  function grantExp(amount){
    // 정체된 맹세(relic_frozenvow): 경험치 획득 자체를 완전히 무효화한다.
    if(hasRelicFlag('noExpGain')) return [];
    // 오프닝 심리테스트(origin.js) "진실" 기질 — 경험치 획득 +8%.
    const expBonus = (player.originBonuses && player.originBonuses.truth) || 0;
    if(expBonus>0) amount = Math.round(amount*(1+expBonus));
    // 빛바랜 지도(relic_fadedmap) 등 확정 시작 저주 — 경험치 획득량 감소.
    const expGoldCursePct = getRelicSum('expGoldPct');
    if(expGoldCursePct<0) amount = Math.round(amount*(1+expGoldCursePct));
    player.exp += amount;
```

- [ ] **Step 3: 장비 슬롯 봉인 — `equipItem()` 가드**

`js/data/equipment.js:222-234`의 기존 코드:
```js
  function equipItem(itemId){
    const item = getItemDef(itemId);
    if(!item) return;
    if(!player.equipOwned.includes(itemId)) return;
    const slot = item.slot;
    // 회랑의 기사(paladin_knight): 칼리버 X가 장착된 무기 슬롯은 플레이어가 직접
    // 건드릴 수 없다. 칼리버 X 자기 자신으로의 "교체"(예: 레벨업 재장착) 요청만
    // 예외로 허용한다 — combat/battle-end.js는 이 함수를 거치지 않고
    // reforgeCaliberX()를 직접 호출하므로, 사실상 이 슬롯은 플레이어 입력으로는
    // 절대 안 걸린다.
    if(slot==='weapon' && player.equipment.weapon && getItemDef(player.equipment.weapon) && getItemDef(player.equipment.weapon).storyWeapon){
      return;
    }
```
바로 뒤(`}` 다음 줄)에 삽입:
```js
    // 낡은 갑주(relic_rustedarmor)/잊혀진 장신구(relic_forgottencharm) — 해당
    // 슬롯 자체를 아예 건드릴 수 없게 막는다. 칼리버 X 잠금(storyWeapon)과
    // 동일한 "조기 return, 안내 메시지 없음" 패턴을 그대로 따른다.
    if(slot==='armor' && typeof hasRelicFlag==='function' && hasRelicFlag('armorLocked')) return;
    if(slot==='accessory' && typeof hasRelicFlag==='function' && hasRelicFlag('accessoryLocked')) return;
```

- [ ] **Step 4: 저주 적용 시점에 기존 장비 즉시 해제**

`js/relics.js:413-414`의 기존 코드:
```js
    if(e.spdFlat) player.spd += e.spdFlat;
    if(e.mpZero){ player.maxmp = 0; player.mp = 0; }
```
바로 뒤에 삽입:
```js
    // 낡은 갑주/잊혀진 장신구를 받아들이는 순간, 이미 장착 중이던 장비가
    // 있으면 즉시 해제한다(캐릭터는 기본 방어구를 장착한 채로 시작하므로,
    // 봉인만 걸고 기존 장비 스탯은 그대로 두면 "봉인"이라는 이름이 무색해짐).
    if(e.armorLocked && player.equipment.armor && typeof unequipItem==='function') unequipItem('armor');
    if(e.accessoryLocked && player.equipment.accessory && typeof unequipItem==='function') unequipItem('accessory');
```

- [ ] **Step 5: 상점 가격에 `shopPricePct` 반영**

`js/shop.js:58`의 기존 코드:
```js
    const discountMult = 1;
```
를 아래로 교체:
```js
    // 메마른 지갑(relic_barrenpurse) 등 확정 시작 저주 — 상점 구매가 인상.
    const discountMult = 1 + getRelicSum('shopPricePct');
```

- [ ] **Step 6: 스킬 쿨타임에 `cooldownBonus` 반영**

`js/combat/player-actions.js:449-453`의 기존 코드:
```js
    if(battleFlags){
      if(s.cooldown){
        if(!battleFlags.skillCooldowns) battleFlags.skillCooldowns = {};
        battleFlags.skillCooldowns[key] = s.cooldown;
      }
```
를 아래로 교체(주석: 쿨타임은 전투마다 리셋되는 `battleFlags` 소속이라, 굳은 손은 "런 시작 1회성"이 아니라 스킬을 쓸 때마다 상시 가산되어야 함 — 스펙 문서의 재설계 사유 그대로):
```js
    if(battleFlags){
      if(s.cooldown){
        if(!battleFlags.skillCooldowns) battleFlags.skillCooldowns = {};
        // 굳은 손(relic_stiffhands) — 쿨타임형 스킬을 쓸 때마다 +1턴. 쿨타임은
        // battleFlags 소속이라 전투마다 리셋되므로, 런 시작 시 1회만 적용하면
        // 첫 전투 이후 의미가 없어진다 — 스킬 시전마다 상시 가산해야 한다.
        battleFlags.skillCooldowns[key] = s.cooldown + getRelicSum('cooldownBonus');
      }
```

- [ ] **Step 7: 문법 확인**

Run: `node --check js/combat/battle-end.js && node --check js/data/equipment.js && node --check js/relics.js && node --check js/shop.js && node --check js/combat/player-actions.js`
Expected: 출력 없음(전부 통과)

- [ ] **Step 8: 커밋**

```bash
git add js/combat/battle-end.js js/data/equipment.js js/relics.js js/shop.js js/combat/player-actions.js
git commit -m "$(cat <<'EOF'
신규 저주 effect 키 4종(경험치/골드/슬롯봉인/상점가/쿨타임) 배선

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 유물-저주 결속 필드 + `removeRelic()` 연쇄 해제

**Files:**
- Modify: `js/player.js:120` (`cursedRelicBundles` 필드 추가)
- Modify: `js/relics.js:427-445` (`removeRelic()`)

**Interfaces:**
- Produces: `player.cursedRelicBundles`(`{relicId: curseId}`), `removeRelic(id)`가 결속된 저주를 자동으로 함께 제거. Task 4·6·7·8이 이 필드/동작에 의존한다.

- [ ] **Step 1: player 필드 추가**

`js/player.js:120`의 기존 줄:
```js
      tempCurses:{},
```
바로 뒤에 삽입:
```js
      // 유물-저주 결속(사용자 기획 — 저주받은 유물/유물함). {relicId: curseId}
      // 형태로, 이 유물을 removeRelic()으로 내려놓으면 결속된 저주도 함께
      // 사라진다(relics.js의 removeRelic() 참고).
      cursedRelicBundles:{},
```

- [ ] **Step 2: `removeRelic()`에 연쇄 해제 추가**

`js/relics.js:427-445`의 기존 코드:
```js
  function removeRelic(id){
    const idx = player.relics.indexOf(id);
    if(idx<0) return false;
    const delta = (player.relicAppliedDeltas && player.relicAppliedDeltas[id]) || {};
    if(delta.atk) player.atk = Math.max(1, player.atk - delta.atk);
    if(delta.def) player.def = Math.max(0, player.def - delta.def);
    if(delta.mag) player.mag = Math.max(0, player.mag - delta.mag);
    if(delta.maxhp) player.maxhp = Math.max(1, player.maxhp - delta.maxhp);
    if(delta.hp) player.hp = Math.max(1, player.hp - delta.hp);
    if(delta.maxmp) player.maxmp = Math.max(0, player.maxmp - delta.maxmp);
    if(delta.mp) player.mp = Math.max(0, player.mp - delta.mp);
    if(delta.spd) player.spd -= delta.spd;
    player.hp = Math.max(1, Math.min(player.hp, player.maxhp));
    player.mp = Math.max(0, Math.min(player.mp, player.maxmp));
    player.relics.splice(idx,1);
    if(player.relicAppliedDeltas) delete player.relicAppliedDeltas[id];
    if(id==='relic_merchantseal') player.merchantSealStack = 0;
    return true;
  }
```
를 아래로 교체:
```js
  function removeRelic(id){
    const idx = player.relics.indexOf(id);
    if(idx<0) return false;
    const delta = (player.relicAppliedDeltas && player.relicAppliedDeltas[id]) || {};
    if(delta.atk) player.atk = Math.max(1, player.atk - delta.atk);
    if(delta.def) player.def = Math.max(0, player.def - delta.def);
    if(delta.mag) player.mag = Math.max(0, player.mag - delta.mag);
    if(delta.maxhp) player.maxhp = Math.max(1, player.maxhp - delta.maxhp);
    if(delta.hp) player.hp = Math.max(1, player.hp - delta.hp);
    if(delta.maxmp) player.maxmp = Math.max(0, player.maxmp - delta.maxmp);
    if(delta.mp) player.mp = Math.max(0, player.mp - delta.mp);
    if(delta.spd) player.spd -= delta.spd;
    player.hp = Math.max(1, Math.min(player.hp, player.maxhp));
    player.mp = Math.max(0, Math.min(player.mp, player.maxmp));
    player.relics.splice(idx,1);
    if(player.relicAppliedDeltas) delete player.relicAppliedDeltas[id];
    if(id==='relic_merchantseal') player.merchantSealStack = 0;
    // 저주받은 유물(사용자 기획): 이 id가 유물-저주 결속의 "유물" 쪽이면,
    // 결속된 저주도 함께 해제한다(재귀 호출 — curseId는 다시 cursedRelicBundles의
    // 키가 될 수 없으므로 무한 재귀 위험 없음).
    if(player.cursedRelicBundles && player.cursedRelicBundles[id]){
      const linkedCurseId = player.cursedRelicBundles[id];
      delete player.cursedRelicBundles[id];
      removeRelic(linkedCurseId);
    }
    return true;
  }
```

- [ ] **Step 3: 문법 확인**

Run: `node --check js/player.js && node --check js/relics.js`
Expected: 출력 없음

- [ ] **Step 4: 커밋**

```bash
git add js/player.js js/relics.js
git commit -m "$(cat <<'EOF'
유물-저주 결속 필드 추가 + removeRelic() 연쇄 해제

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 저주 적용 헬퍼 3종 (relics.js)

**Files:**
- Modify: `js/relics.js` (파일 상단 export 주석 갱신 + `PERMANENT_CURSE_POOL` 정의 바로 뒤에 함수 3개 추가)

**Interfaces:**
- Consumes: `PERMANENT_CURSE_POOL`(Task 1), `applyRelicEffect`/`RELICS`(기존), `player.cursedRelicBundles`(Task 3)
- Produces: `rollPermanentCurse()` → `string|null`(curseId), `applyStartingCurse()` → `string|null`(적용된 curseId), `applyCursedRelicBundle(relicId)` → `string|null`(적용된 curseId), `pickRandomUnownedRelic()` → `string|null`(relicId). Task 5(시작 저주)·Task 6(저주받은 유물)·Task 7(유물함 이벤트)이 이 4개 함수를 호출한다.

- [ ] **Step 1: export 주석 갱신**

`js/relics.js:6-12`의 기존 export 목록:
```
export(전역): DICE_EFFECT_LABELS, getLowHpScalingMult, hasBladeHiltSet, consumeOnHitBonuses,
              applyOutgoingDamageMods, revertDiceDelta, rollDiceEffectForBattle, getHourglassMult,
              RELICS, RELIC_ALTAR_POOL/FLOORS, CURSE_ALTAR_POOL/FLOORS, getRelicSlotUsage,
              getCurseCount / getCurseRewardMult / getCurseEpicBonus, getRelicDef,
              getCurseSealBypassChance, isCurseSealActive,
              applyRelicEffect, removeRelic, BLADE_HILT_IDS, rollRelicChoices, finalizeRelicPick,
              showRelicSwapPrompt, showRelicAltar, showCurseAltar, getRelicSkipCost
              findEquipmentForDepth, findRareDropForDepth, findEpicDropForDepth,
              applyMerchantSealPurchase
```
끝(`applyMerchantSealPurchase` 다음 줄)에 추가:
```
              PERMANENT_CURSE_POOL, rollPermanentCurse, applyStartingCurse,
              applyCursedRelicBundle, pickRandomUnownedRelic
```

- [ ] **Step 2: 헬퍼 4개 추가**

Task 1에서 추가한 `PERMANENT_CURSE_POOL` 정의 바로 뒤(`js/relics.js`, 원래 149번째 줄 `CURSE_ALTAR_FLOORS` 선언 앞)에 삽입:

```js
  // 영구 저주 하나를 무작위로 고른다(이미 가진 건 제외). 확정 시작
  // 저주/저주받은 유물/저주받은 유물함이 전부 이 함수를 공유한다.
  function rollPermanentCurse(){
    const pool = PERMANENT_CURSE_POOL.filter(id=>!(player.relics||[]).includes(id));
    if(!pool.length) return null;
    return pool[Math.floor(Math.random()*pool.length)];
  }

  // 확정 시작 저주(사용자 기획) — 유물과 결속되지 않은 단독 영구 저주.
  // player.tempCurses에 기록하지 않으므로(=영구) 구간 보스로도 안 풀린다.
  function applyStartingCurse(){
    const id = rollPermanentCurse();
    if(!id) return null;
    applyRelicEffect(id);
    player.relics.push(id);
    return id;
  }

  // 저주받은 유물(사용자 기획) — relicId에 영구 저주 하나를 결속시킨다.
  // 호출부(showRelicAltar/showRelicSwapPrompt/저주받은 유물함 이벤트)가
  // relicId 자체의 획득(applyRelicEffect/player.relics.push)은 이미 처리한
  // 뒤에 호출한다는 전제.
  function applyCursedRelicBundle(relicId){
    const curseId = rollPermanentCurse();
    if(!curseId) return null;
    applyRelicEffect(curseId);
    player.relics.push(curseId);
    player.cursedRelicBundles = player.cursedRelicBundles || {};
    player.cursedRelicBundles[relicId] = curseId;
    if(typeof showToast==='function'){
      const r = RELICS[relicId];
      showToast(`<h3>☠ 저주받은 ${r ? r.name : ''}</h3><p>손에 넣은 순간, 서늘한 기운이 영구히 당신을 옭아맨다.</p>`, '#9a5aff');
    }
    return curseId;
  }

  // 저주받은 유물함(events.js) 전용 — 미보유 일반 유물(저주형/칼날·칼자루
  // 제외) 중 하나를 무작위로 고른다. rollRelicChoices()의 명명 유물 풀
  // 필터링 규칙과 동일하게 맞춘다.
  function pickRandomUnownedRelic(){
    const owned = player.relics||[];
    const pool = RELIC_ALTAR_POOL.filter(id=>!BLADE_HILT_IDS.includes(id) && !owned.includes(id));
    if(!pool.length) return null;
    return pool[Math.floor(Math.random()*pool.length)];
  }

```

- [ ] **Step 3: 문법 확인**

Run: `node --check js/relics.js`
Expected: 출력 없음

- [ ] **Step 4: 커밋**

```bash
git add js/relics.js
git commit -m "$(cat <<'EOF'
영구 저주 적용 헬퍼 4종 추가(rollPermanentCurse/applyStartingCurse/applyCursedRelicBundle/pickRandomUnownedRelic)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 확정 시작 저주 (런 시작 훅)

**Files:**
- Modify: `js/explore.js:181` (신규 캐릭터 생성 직후)

**Interfaces:**
- Consumes: `applyStartingCurse()`(Task 4), `player.difficulty`(기존)

**중요:** 이 훅은 **오직 `js/explore.js:181`**(진짜 신규 캐릭터 생성)에만 넣는다. `js/combat/battle-end.js:415`에도 `newPlayer()` 호출이 있지만 그건 하드코어 사망 후 "각성의 제단" 환생 흐름으로, 직후에 `oldRelics.forEach(id=> applyRelicEffect(id))`로 이전 생의 유물(저주 포함)을 그대로 복원한다 — 여기에 또 시작 저주를 굴리면 저주가 중복 누적된다.

- [ ] **Step 1: 훅 추가**

`js/explore.js:181-184`의 기존 코드:
```js
    player = newPlayer(nameInput, selectedJobId, selectedDifficulty);
    depth = 0; town = true; enemy = null; battleOver = false; subMode = null;
    inBossDen = false; bossDenFloor = 0;
    battleFlags = {guardian:false, phoenix:false, firstStrikeUsed:false, execCount:0, execReady:false, gambleStacks:0, jackpotGauge:0, jackpotArmed:false, paladinAwoken:false, paladinUltUsed:false, hourglassTurn:0, witchClockUsedThisTurn:false, rig:null};
```
를 아래로 교체:
```js
    player = newPlayer(nameInput, selectedJobId, selectedDifficulty);
    // 확정 시작 저주(사용자 기획 — 난이도 상승 장치): 보통/하드코어는 런
    // 시작과 동시에 영구 저주 하나를 무작위로 짊어진다. 쉬움은 제외.
    // relics.js의 PERMANENT_CURSE_POOL(10종)에서 무작위 1개.
    if(player.difficulty==='normal' || player.difficulty==='hardcore'){
      applyStartingCurse();
    }
    depth = 0; town = true; enemy = null; battleOver = false; subMode = null;
    inBossDen = false; bossDenFloor = 0;
    battleFlags = {guardian:false, phoenix:false, firstStrikeUsed:false, execCount:0, execReady:false, gambleStacks:0, jackpotGauge:0, jackpotArmed:false, paladinAwoken:false, paladinUltUsed:false, hourglassTurn:0, witchClockUsedThisTurn:false, rig:null};
```

- [ ] **Step 2: 문법 확인**

Run: `node --check js/explore.js`
Expected: 출력 없음

- [ ] **Step 3: 브라우저 수동 확인**

로컬 정적 서버로 `index.html`을 띄운 뒤:
1. 이름 아무거나(예: `tester`), 난이도 **보통** 선택 후 게임 시작
2. ✦ 유물 버튼 클릭 → "☠ 저주" 그룹에 저주가 정확히 1개 있는지 확인(효과는 매번 무작위이므로 어떤 항목인지는 무관, 개수만 확인)
3. 새로고침 후 다시 새 캐릭터를 **쉬움**으로 시작 → ✦ 유물 화면에 저주가 0개인지 확인
4. 다시 **보통**으로 다른 이름으로 여러 번 시작해보며(3~4회) 매번 다른/같은 저주가 무작위로 나오는지 확인(완전히 다른 결과가 최소 2종 이상 나오면 정상)

- [ ] **Step 4: 커밋**

```bash
git add js/explore.js
git commit -m "$(cat <<'EOF'
보통/하드코어 시작 시 확정 저주 1개 자동 적용

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 저주받은 유물 (일반 유물 제단 20% 확률)

**Files:**
- Modify: `js/relics.js:546-581` (`showRelicSwapPrompt`), `js/relics.js:589-695` (`showRelicAltar`)

**Interfaces:**
- Consumes: `applyCursedRelicBundle(relicId)`(Task 4)
- Produces: `showRelicSwapPrompt(newId, altarOverlay, isMystery, onFinalized)` — 4번째 파라미터 추가(기존 3-인자 호출부는 `onFinalized`가 `undefined`가 되어 그대로 동작, 하위 호환 유지)

- [ ] **Step 1: `showRelicSwapPrompt`에 콜백 파라미터 추가**

`js/relics.js:546`의 기존 시그니처:
```js
  function showRelicSwapPrompt(newId, altarOverlay, isMystery){
```
를 아래로 교체:
```js
  function showRelicSwapPrompt(newId, altarOverlay, isMystery, onFinalized){
```

같은 함수 안, `js/relics.js:570-580`의 기존 코드:
```js
    panel.querySelectorAll('.relic-card').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const discardId = btn.dataset.id;
        const discardR = RELICS[discardId];
        removeRelic(discardId);
        addLog(`[${discardR.name}]을(를) 내려놓았다.`, 'warn');
        finalizeRelicPick(newId, isMystery);
        overlay.remove();
        if(altarOverlay) altarOverlay.remove();
      });
    });
```
를 아래로 교체:
```js
    panel.querySelectorAll('.relic-card').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const discardId = btn.dataset.id;
        const discardR = RELICS[discardId];
        removeRelic(discardId);
        addLog(`[${discardR.name}]을(를) 내려놓았다.`, 'warn');
        finalizeRelicPick(newId, isMystery);
        // 저주받은 유물(사용자 기획) — 교체 경로로 새 유물을 받을 때도
        // 저주 결속이 빠지지 않도록 동일하게 콜백을 호출한다.
        if(typeof onFinalized==='function') onFinalized();
        overlay.remove();
        if(altarOverlay) altarOverlay.remove();
      });
    });
```

- [ ] **Step 2: `showRelicAltar`에 20% 확률 저주 슬롯 판정 추가**

`js/relics.js:589-595`의 기존 코드:
```js
  function showRelicAltar(atDepth, onDone, opts){
    opts = opts || {};
    const namedCount = opts.namedCount || 2;
    let rerollLeft = opts.freeReroll ? 1 : 0;
    let choices, mysteryIdx;
    ({choices, mysteryIdx} = rollRelicChoices(namedCount));
    if(!choices.length){ if(typeof onDone==='function') onDone(); return; } // 고를 수 있는 신규 유물이 더 없다
```
를 아래로 교체:
```js
  function showRelicAltar(atDepth, onDone, opts){
    opts = opts || {};
    const namedCount = opts.namedCount || 2;
    let rerollLeft = opts.freeReroll ? 1 : 0;
    let choices, mysteryIdx;
    ({choices, mysteryIdx} = rollRelicChoices(namedCount));
    if(!choices.length){ if(typeof onDone==='function') onDone(); return; } // 고를 수 있는 신규 유물이 더 없다
    // 저주받은 유물(사용자 기획) — 이 제단 방문에 20% 확률로 (？？？ 슬롯을
    // 제외한) 선택지 중 하나가 몰래 저주와 묶여 나온다. 카드 겉모습은 완전히
    // 평범하다 — 고른 순간에만 발각된다(applyCursedRelicBundle의 토스트).
    let cursedIdx = -1;
    const cursedCandidates = choices.map((_,i)=>i).filter(i=>i!==mysteryIdx);
    if(cursedCandidates.length && Math.random() < 0.20){
      cursedIdx = cursedCandidates[Math.floor(Math.random()*cursedCandidates.length)];
    }
```

같은 함수 안, `js/relics.js:651-664`의 기존 클릭 핸들러:
```js
      panel.querySelectorAll('.relic-card').forEach((btn,i)=>{
        btn.addEventListener('click', ()=>{
          if(btn.disabled) return;
          const id = btn.dataset.id;
          const isMystery = (i===mysteryIdx);
          if(getRelicSlotUsage() >= player.relicSlots){
            showRelicSwapPrompt(id, overlay, isMystery);
            return;
          }
          finalizeRelicPick(id, isMystery);
          overlay.remove();
          if(typeof onDone==='function') onDone();
        });
      });
```
를 아래로 교체:
```js
      panel.querySelectorAll('.relic-card').forEach((btn,i)=>{
        btn.addEventListener('click', ()=>{
          if(btn.disabled) return;
          const id = btn.dataset.id;
          const isMystery = (i===mysteryIdx);
          const isCursedPick = (i===cursedIdx);
          if(getRelicSlotUsage() >= player.relicSlots){
            showRelicSwapPrompt(id, overlay, isMystery, isCursedPick ? ()=>applyCursedRelicBundle(id) : null);
            return;
          }
          finalizeRelicPick(id, isMystery);
          if(isCursedPick) applyCursedRelicBundle(id);
          overlay.remove();
          if(typeof onDone==='function') onDone();
        });
      });
```

주의: `renderCards()`가 리롤 버튼 클릭 시 다시 호출되며 `({choices, mysteryIdx} = rollRelicChoices(namedCount));`로 재추첨한다(`js/relics.js:672` 부근, 이번 작업에서 안 건드림) — `cursedIdx`는 `showRelicAltar` 함수 스코프에 있고 `renderCards` 안에서 재계산되지 않으므로, 리롤해도 최초에 뽑힌 `cursedIdx` 위치가 그대로 남는다. 이번 작업 범위에서는 "리롤 시 저주 슬롯도 새로 판정되어야 하는지"는 다루지 않는다(기존 리롤은 각성의 제단 전용 옵션이라 노출 빈도가 낮음) — 필요해지면 별도 태스크로 분리한다.

- [ ] **Step 3: 문법 확인**

Run: `node --check js/relics.js`
Expected: 출력 없음

- [ ] **Step 4: 브라우저 수동 확인**

1. 이름 `admin`으로 시작(직업 아무거나) → 전직 즉시 레벨15(기존 디버그 치트)
2. 탐험 화면에서 6층까지 진행해 첫 유물 제단 도달 — 3택1 화면에서는 겉보기 구분이 없는지 확인
3. 유물을 하나 고른다 — 20% 확률이라 한 번에 안 걸릴 수 있음. 안 걸리면 새로고침 없이 사망(디버그로 즉시 재도전 어려우므로) 대신, 브라우저 콘솔에서 `Math.random = () => 0.01;` 실행 후 유물 제단을 다시 열어(다음 유물 제단 도달 시) 강제로 20% 조건을 항상 통과시켜 저주받은 유물 발동을 확인. 확인 후 콘솔에서 `location.reload()`로 원상복구
4. 저주받은 유물이 발동하면: 선택 즉시 토스트("☠ 저주받은 [유물명]")가 뜨는지, ✦ 유물 화면에서 그 유물 이름 앞에 "저주받은 "이 붙어있는지, 저주 그룹에 새 저주가 1개 추가됐는지 확인
5. 유물 슬롯이 가득 찬 상태(장신구 등 제단에서 여러 번 획득)에서 같은 시나리오를 재현해 교체 프롬프트 경로에서도 저주가 정상적으로 걸리는지 확인

- [ ] **Step 5: 커밋**

```bash
git add js/relics.js
git commit -m "$(cat <<'EOF'
일반 유물 제단에 저주받은 유물(20% 확률) 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 저주받은 유물함 (미지의 사건 신규 이벤트)

**Files:**
- Modify: `js/events.js:27-38` (`showMysteryEvent` 핸들러 배열), `js/events.js` 파일 끝(새 함수 추가)

**Interfaces:**
- Consumes: `pickRandomUnownedRelic()`/`applyCursedRelicBundle()`(Task 4), `finalizeRelicPick`/`showRelicSwapPrompt`/`getRelicSlotUsage`(기존 relics.js)
- Produces: `showCursedRelicChestEvent()` — `showMysteryEvent()` 풀에 상시 등록(조건 없음)

- [ ] **Step 1: 핸들러 배열에 등록**

`js/events.js:28-38`의 기존 배열 마지막 줄:
```js
      showTailorWorkshopEvent, showArchivistNoteEvent, showDiggerToolboxEvent, showJesterPropsEvent,
    ];
```
를 아래로 교체:
```js
      showTailorWorkshopEvent, showArchivistNoteEvent, showDiggerToolboxEvent, showJesterPropsEvent,
      showCursedRelicChestEvent,
    ];
```

- [ ] **Step 2: 이벤트 함수 추가**

파일 끝(마지막 함수 뒤)에 추가:

```js

  // 30) 저주받은 유물함(사용자 기획 — 난이도 상승 장치) — 열면 유물과 저주가
  // 영구로 함께 딸려온다. relics.js의 applyCursedRelicBundle()이 저주받은
  // 유물(일반 제단, 20% 확률)과 동일한 결속 로직을 그대로 재사용한다 — 유물을
  // 나중에 교체하면 저주도 함께 사라지는 규칙도 동일하게 적용된다.
  function showCursedRelicChestEvent(){
    const {overlay, panel} = eventOverlay('저주받은 유물함',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 10px;">녹슨 사슬로 칭칭 감긴 함 하나가 놓여 있다. 안에 무엇이 들었는지는 열어보기 전엔 알 수 없다.</p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">
        <button class="btn btn-danger" id="me-chest-open">연다</button>
        <button class="btn" id="me-chest-skip">열지 않고 떠난다</button>
      </div>`);
    panel.querySelector('#me-chest-open').addEventListener('click', ()=>{
      const relicId = pickRandomUnownedRelic();
      if(!relicId){
        addLog('함을 열었지만 이미 가진 것뿐이었다. 안에는 아무것도 없었다.', 'warn');
        closeMysteryEvent(overlay);
        return;
      }
      if(getRelicSlotUsage() >= player.relicSlots){
        overlay.remove();
        showRelicSwapPrompt(relicId, null, false, ()=>applyCursedRelicBundle(relicId));
        return;
      }
      finalizeRelicPick(relicId, false);
      applyCursedRelicBundle(relicId);
      closeMysteryEvent(overlay);
    });
    panel.querySelector('#me-chest-skip').addEventListener('click', ()=>{
      addLog('불길한 함을 그대로 두고 떠났다.', 'warn');
      closeMysteryEvent(overlay);
    });
  }
```

- [ ] **Step 3: 문법 확인**

Run: `node --check js/events.js`
Expected: 출력 없음

- [ ] **Step 4: 브라우저 수동 확인**

1. 브라우저 콘솔에서 `Math.random` 원본을 백업해두고(`const orig = Math.random;`), `showMysteryEvent = showCursedRelicChestEvent;`로 임시 오버라이드(간단 확인용 — 실제 미지의 사건 노드를 밟을 때 이 함수가 항상 뜨게 함)
2. 미지의 사건 노드 진입 → "저주받은 유물함" 오버레이가 뜨는지 확인
3. "연다" 클릭 → 유물 획득 로그 + 저주 토스트가 모두 뜨는지, ✦ 유물 화면에서 유물 이름 접두사와 저주 그룹 증가가 함께 반영됐는지 확인
4. 새로고침 후 다시 진입해 "열지 않고 떠난다"를 눌러 아무 변화 없이 종료되는지 확인
5. 확인 후 `location.reload()`로 오버라이드 원복

- [ ] **Step 5: 커밋**

```bash
git add js/events.js
git commit -m "$(cat <<'EOF'
미지의 사건에 저주받은 유물함 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 속죄의 제단 (미지의 사건 신규 이벤트)

**Files:**
- Modify: `js/events.js:27-38` (핸들러 배열에 조건부 등록), `js/events.js` 파일 끝(새 함수 추가)
- Modify: `js/combat/battle-end.js:278-284` (구간 정화 대상 산출 — 참고만, 코드 변경 없음. Step 2에서 이유 설명)

**Interfaces:**
- Consumes: `removeRelic()`(기존, Task 3에서 연쇄 해제 추가됨), `player.tempCurses`(기존)
- Produces: `showAtonementAltarEvent()` — `player.relics`에 `type==='curse'`가 1개 이상 있을 때만 풀에 등록

- [ ] **Step 1: 핸들러 배열에 조건부 등록**

`js/events.js:38-41`의 기존 코드(Task 7에서 이미 `showCursedRelicChestEvent`를 배열 안에 추가한 상태):
```js
    // "부서진 톱니 장신구"(아이온 파편)는 마녀의 시계 보유자에게만 이벤트
    // 풀이 열린다(멈춘 시계공방과 같은 게이트, 사용자 기획).
    if((player.relics||[]).includes('relic_witchclock')) handlers.push(showGearShardEvent);
```
바로 앞에 삽입:
```js
    // 속죄의 제단(사용자 기획 — 난이도 상승 장치) — 현재 걸려있는 저주가
    // 1개 이상 있을 때만 풀에 등장한다. 0개면 이 이벤트 자체가 후보에서
    // 빠지고 나머지 이벤트 중에서 균등 확률로 뽑힌다.
    if((player.relics||[]).some(id=>RELICS[id] && RELICS[id].type==='curse')) handlers.push(showAtonementAltarEvent);
```

- [ ] **Step 2: 이벤트 함수 추가**

파일 끝(Task 7에서 추가한 `showCursedRelicChestEvent` 뒤)에 추가:

```js

  // 31) 속죄의 제단(사용자 기획 — 난이도 상승 장치) — 현재 걸려있는 저주
  // (구간 한정 포함 전부) 중 하나를 골라 제거한다. 대가로 최대 HP가 영구히
  // 15% 줄어든다. 구간 한정 저주를 여기서 미리 제거하면 player.tempCurses의
  // 해당 항목도 함께 지운다 — 안 지우면 나중에 그 구간 보스를 잡을 때
  // combat/battle-end.js의 정화 로직이 "이미 없어진 저주"를 정화 대상으로
  // 잘못 집계해, 이미 받은 속죄 효과에 더해 구간 클리어 시의 전스탯 +4%
  // 보너스까지 중복으로 받게 된다.
  function showAtonementAltarEvent(){
    const curseIds = (player.relics||[]).filter(id=>RELICS[id] && RELICS[id].type==='curse');
    const {overlay, panel} = eventOverlay('속죄의 제단',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 10px;">피 냄새가 나는 제단이다. 짊어진 저주 하나를 씻어내는 대신, 생명력 그 자체를 나눠줘야 한다.</p>
       <div id="me-atonement-list" class="relic-grid"></div>`,
      `<div style="text-align:center;"><button class="btn" id="me-atonement-skip">떠난다</button></div>`);
    const listEl = panel.querySelector('#me-atonement-list');
    curseIds.forEach(id=>{
      const r = RELICS[id];
      const btn = document.createElement('button');
      btn.className = 'relic-card type-curse';
      btn.innerHTML = `<div class="relic-type">☠ 정화 대상</div><div class="relic-name">${r.name}</div><div class="relic-desc">${r.desc}</div>`;
      btn.addEventListener('click', ()=>{
        removeRelic(id);
        if(player.tempCurses) delete player.tempCurses[id];
        const hpCut = Math.round(player.maxhp*0.15);
        player.maxhp = Math.max(1, player.maxhp-hpCut);
        player.hp = Math.max(1, Math.min(player.hp, player.maxhp));
        addLog(`[${r.name}]을(를) 씻어냈다… 대가로 최대 HP가 ${hpCut} 줄었다.`, 'warn');
        renderStatus();
        saveGame();
        closeMysteryEvent(overlay);
      });
      listEl.appendChild(btn);
    });
    panel.querySelector('#me-atonement-skip').addEventListener('click', ()=>{
      addLog('제단을 뒤로하고 떠났다.', 'warn');
      closeMysteryEvent(overlay);
    });
  }
```

- [ ] **Step 3: 문법 확인**

Run: `node --check js/events.js`
Expected: 출력 없음

- [ ] **Step 4: 브라우저 수동 확인**

1. 저주가 하나도 없는 새 캐릭터(쉬움)로 미지의 사건을 여러 번 겪어보며 "속죄의 제단"이 절대 뜨지 않는지 확인(핸들러 배열에 안 들어갔으므로 등장 자체가 불가능 — 여러 번 반복해 우연히도 안 나온다는 걸 확인하는 게 아니라, 코드상 배제됐음을 신뢰하되 최소 5회 정도 훑어 이상 없는지 확인)
2. 보통 난이도로 시작(확정 시작 저주 1개 보유 상태) → 미지의 사건에서 "속죄의 제단"이 뜰 수 있는지 확인(여러 번 재시도 필요할 수 있음, 확률은 다른 이벤트와 동일한 균등 분배)
3. 저주 목록에서 하나를 선택 → 로그에 "씻어냈다… 최대 HP가 N 줄었다"가 뜨고, ✦ 유물 화면에서 저주 그룹 개수가 1개 줄고 최대 HP가 실제로 감소했는지 확인
4. 저주받은 유물로 얻은 저주(유물과 결속된 것)를 속죄의 제단에서 지워도 그 유물 자체는 "저주받은" 접두사만 사라지고(결속 해제와 무관하게 유물 자체는 남음 — 이 이벤트는 저주만 단독 제거하는 경로) 계속 보유 중인지 확인

- [ ] **Step 5: 커밋**

```bash
git add js/events.js
git commit -m "$(cat <<'EOF'
미지의 사건에 속죄의 제단 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: UI — 구간 한정/영구 라벨 + 저주받은 유물 접두사

**Files:**
- Modify: `js/records.js:250-260` (`renderRelicCardGroup`)
- Modify: `js/relics.js:721-722` (`showCurseAltar` 라벨 통일)

**Interfaces:**
- Consumes: `player.tempCurses`(기존), `player.cursedRelicBundles`(Task 3)

- [ ] **Step 1: `renderRelicCardGroup` 라벨/접두사 반영**

`js/records.js:250-260`의 기존 코드:
```js
  function renderRelicCardGroup(ids, typeLabel){
    return `<div class="relic-grid">` + ids.map(id=>{
      const r = RELICS[id];
      if(!r) return '';
      return `<div class="relic-card type-${r.type}" style="cursor:default;">
        <div class="relic-type">${typeLabel[r.type]}</div>
        <div class="relic-name">${r.name}</div>
        <div class="relic-desc">${getRelicDisplayDesc(id)}</div>
      </div>`;
    }).join('') + `</div>`;
  }
```
를 아래로 교체:
```js
  function renderRelicCardGroup(ids, typeLabel){
    return `<div class="relic-grid">` + ids.map(id=>{
      const r = RELICS[id];
      if(!r) return '';
      // 구간 한정/영구 구분(사용자 기획) — player.tempCurses에 이 id가
      // 있으면 구간 한정(저주 제단 유래), 없으면 영구(확정 시작 저주/
      // 저주받은 유물/저주받은 유물함 유래).
      let typeText = typeLabel[r.type];
      if(r.type==='curse'){
        const isTemp = !!(player.tempCurses && player.tempCurses[id]!==undefined);
        typeText = isTemp ? '⏳ 저주 (구간 한정)' : '⛓ 저주 (영구)';
      }
      // 저주받은 유물(사용자 기획) — 이 유물에 결속된 저주가 있으면 이름 앞에
      // "저주받은 "을 붙인다(원본 RELICS[id].name 자체는 건드리지 않는다).
      const isCursedBundle = !!(player.cursedRelicBundles && player.cursedRelicBundles[id]);
      const displayName = isCursedBundle ? `저주받은 ${r.name}` : r.name;
      return `<div class="relic-card type-${r.type}" style="cursor:default;">
        <div class="relic-type">${typeText}</div>
        <div class="relic-name">${displayName}</div>
        <div class="relic-desc">${getRelicDisplayDesc(id)}</div>
      </div>`;
    }).join('') + `</div>`;
  }
```

- [ ] **Step 2: `showCurseAltar` 라벨 표기 통일**

`js/relics.js:721-722`의 기존 코드:
```js
        <button class="relic-card type-curse" id="curse-card" disabled>
          <div class="relic-type">저주${isCurseweaver?'':' (이 구간 한정)'}</div>
```
를 아래로 교체(저주술사는 원래도 영구였으므로 신규 아이콘 관례에 맞춰 라벨만 통일, 동작 변경 없음):
```js
        <button class="relic-card type-curse" id="curse-card" disabled>
          <div class="relic-type">${isCurseweaver?'⛓ 저주 (영구)':'⏳ 저주 (구간 한정)'}</div>
```

- [ ] **Step 3: 문법 확인**

Run: `node --check js/records.js && node --check js/relics.js`
Expected: 출력 없음

- [ ] **Step 4: 브라우저 수동 확인**

1. 보통 난이도로 시작(확정 시작 저주 1개) → ✦ 유물 화면에서 그 저주가 "⛓ 저주 (영구)"로 표시되는지 확인
2. 9층 저주 제단에서 저주를 하나 받아들인 뒤(저주술사가 아닌 직업) → ✦ 유물 화면에서 새로 받은 저주가 "⏳ 저주 (구간 한정)"으로 표시되는지, 확정 시작 저주는 여전히 "(영구)"로 남아 서로 구분되는지 확인
3. 구간 보스를 잡아 "이 구간 한정" 저주가 정화되는지(기존 동작 그대로 유지되는지) 확인 — 회귀 확인
4. 저주받은 유물이 걸린 유물의 이름 앞에 "저주받은 "이 붙어 보이는지 확인(Task 6/7에서 이미 확인했다면 생략 가능)

- [ ] **Step 5: 커밋**

```bash
git add js/records.js js/relics.js
git commit -m "$(cat <<'EOF'
저주 UI에 구간한정/영구 구분 라벨과 저주받은 유물 접두사 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## 전체 회귀 확인 (모든 태스크 완료 후)

- [ ] **Step 1: 전체 문법 재확인**

Run: `for f in js/player.js js/relics.js js/data/equipment.js js/combat/battle-end.js js/combat/player-actions.js js/shop.js js/explore.js js/events.js js/records.js; do node --check "$f" || echo "FAIL: $f"; done`
Expected: `FAIL` 출력 없음

- [ ] **Step 2: 기존 저주 제단/유물 제단 회귀 확인**

쉬움 난이도로 새 캐릭터를 시작해, 기존 유물 제단(6/12/18/24/36/42/48층)과 저주 제단(9/21/33/44층)이 이전과 동일하게 동작하는지(3택1 UI, 슬롯 교체 프롬프트, 저주 수락/거절) 확인 — 이번 변경이 회귀를 일으키지 않았음을 확인하는 단계.

- [ ] **Step 3: 하드코어 사망→환생 흐름 회귀 확인**

하드코어로 시작(확정 시작 저주 1개 포함) → 일부러 사망 → 환생 후 ✦ 유물 화면에서 저주가 **2개로 늘지 않고 이전 생의 저주 그대로 유지**되는지 확인(Task 5의 "explore.js에만 훅을 넣는다" 결정이 정확히 반영됐는지 최종 검증).
