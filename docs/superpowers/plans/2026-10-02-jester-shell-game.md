# 도박사 전용 이벤트 "야바위 컵" + 유물 "딜러의 장갑" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도박사에게만 뜨는 야바위 컵 3판 미니게임(컵 섞기 연출)과, 3번 모두 맞히면 얻는 유물 "딜러의 장갑"(구간마다 1회 노드맵 칸 두 개의 종류 바꿔치기)을 추가한다.

**Architecture:** 순수 로직(등장 조건/판돈/정산/섞기 순서/동전 추적/바꿔치기 대상 판정/체크포인트 마이그레이션)은 새 파일 `js/jester-shell.js`(node vm 테스트). 이벤트 화면은 `events.js`의 `showJesterShellEvent()` — 컵 위치는 `transform:translateX`, 섞기는 Web Animations API(`element.animate`)로 호를 그리며 교차, 들림은 안쪽 `.js-shell`의 `translate`로 분리. 바꿔치기는 `nodemap.js`의 `renderNodeMapArea()`에 모드 플래그를 두고 대상 칸만 누를 수 있게 다시 그린다. 카드판 브랜치(`jester-card-table`) 위에서 작업.

**Tech Stack:** Vanilla JS(classic `<script>`, 공유 전역), CSS, Web Animations API, Node `vm`+`assert`, 헤드리스 Chrome(playwright-core + 시스템 Chrome).

**Spec:** `docs/superpowers/specs/2026-10-02-jester-shell-game-design.md`

## Global Constraints

- 등장: `player.job === 'jester'` && `!player.jesterShellSeen`, 가중치 3, 뜬 순간 `jesterShellSeen = true`.
- 판돈 `30 + depth*3`, 황금 도박사 2배. 골드 부족이면 앉을 수 없음. 앉는 즉시 `saveGame()`.
- 3판 고정. 판별 섞기: 5회·420ms, 7회·320ms, 9회·240ms. 동전은 처음 가운데(슬롯 1).
- 정산(수령액, 판돈 포함): 0 → 0, 1 → 판돈, 2 → 판돈×2, 3 → 판돈×3 + `relic_dealerglove`, 유물 보유 시 3 → 판돈×4.
- 사기꾼(`jester_debtcollector`): 이벤트 동안 1회 "소매로 슬쩍 들추기"(고르기 전 컵 하나를 잠깐 들춤).
- 유물 `relic_dealerglove`: `type:'wild'`, `eventOnly:true`, `effect:{nodeSwap:true}`. 슬롯 1칸, 가득 차면 `showRelicSwapPrompt`.
- 바꿔치기: 구간마다 1회(`player.nodeSwapTier = player.tierIndex`). 대상은 `rIdx > nodeRow`이고 종류가 `combat/elite/shop/rest/event`. 같은 종류끼리 불가. 가능한 쌍이 없으면 버튼 숨김.
- `jesterShellSeen`, `nodeSwapTier`를 마을 체크포인트에 포함 + 예전 체크포인트 마이그레이션.
- `hideDepth` 유물 보유 시 바꿔치기 로그에 종류를 밝히지 않음.
- 딜러는 손만 남은 존재, 말하지 않음. 이름(아이온/아코스) 노출 금지. 3D(`preserve-3d`) 쓰지 않음.

## Review Focus

1. 섞기 연출 도중이나 들추기 도중 컵을 눌러도 선택이 되면 안 된다 — `picking` 플래그(Task 2 코드, Task 4 헤드리스).
2. 바꿔치기 모드에서 칸을 눌러 이동(`pickNode`)이 일어나면 안 되고, 모드가 아닐 때는 기존 이동이 그대로여야 한다 — Task 3 코드, Task 4 헤드리스.
3. 바꿔치기 후 저장·새로고침해도 바뀐 종류가 유지되고, 같은 구간에서 두 번 쓸 수 없어야 한다 — Task 4 헤드리스(저장된 nodeMap 확인, 버튼 숨김).
4. 쉬움/보통 사망 롤백 후 그 구간에서 장갑을 다시 쓸 수 있어야 한다 — Task 1 마이그레이션 테스트 + Task 4 롤백 확인.
5. 지도를 접은 상태(`nodeMapCollapsed`)에서 바꿔치기 버튼을 누르면 지도가 펼쳐져야 한다 — Task 3 코드.

---

### Task 1: `js/jester-shell.js` — 순수 로직 + 단위 테스트

**Files:**
- Create: `js/jester-shell.js`, `tests/jester-shell.test.js`
- Modify: `index.html` (`<script src="js/jester-table.js"></script>` 다음 줄)

**Interfaces:**
- Produces:
  - `JESTER_SHELL_WEIGHT` (3), `JESTER_SHELL_ROUNDS` (`[{swaps:5,ms:420},{swaps:7,ms:320},{swaps:9,ms:240}]`)
  - `jesterShellEligible(p) → boolean`, `jesterShellStake(p, depth) → number`
  - `jesterShellPayout(stake, hits, hasRelic) → number`
  - `jesterShellSwaps(count, rng?) → Array<[a,b]>` (a≠b, 0..2)
  - `jesterShellTrack(startSlot, swaps) → slot`
  - `NODE_SWAP_TYPES` (`['combat','elite','shop','rest','event']`)
  - `nodeSwapCandidates(nodeMap, nodeRow) → node[]`, `canSwapNodePair(a, b) → boolean`
  - `nodeSwapAvailable(p) → boolean`
  - `migrateJesterShellCheckpoint(cp)`

- [ ] **Step 1: 실패하는 테스트**

`tests/jester-shell.test.js`:

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `node tests/jester-shell.test.js`
Expected: FAIL — `ENOENT ... js/jester-shell.js`

- [ ] **Step 3: `js/jester-shell.js` 작성**

```js
"use strict";
/*
도박사 전용 물음표 이벤트 "야바위 컵"(3판, 맞힌 횟수로 정산) + 유물 "딜러의 장갑"
(구간마다 1회 노드맵 칸 바꿔치기) — 순수 로직.
설계: docs/superpowers/specs/2026-10-02-jester-shell-game-design.md
export(전역): JESTER_SHELL_WEIGHT, JESTER_SHELL_ROUNDS, jesterShellEligible, jesterShellStake,
       jesterShellPayout, jesterShellSwaps, jesterShellTrack, NODE_SWAP_TYPES, nodeSwapCandidates,
       canSwapNodePair, nodeSwapAvailable, migrateJesterShellCheckpoint
주의: 화면은 events.js의 showJesterShellEvent()(컵)와 nodemap.js의 renderNodeMapArea()(바꿔치기).
     이 파일은 DOM을 만지지 않는다(tests/jester-shell.test.js가 node vm으로 바로 불러 쓴다).
*/

  const JESTER_SHELL_WEIGHT = 3;
  // 판별 섞기 횟수와 "한 번 바꿀 때"의 시간(ms). 판이 갈수록 많고 빨라진다.
  const JESTER_SHELL_ROUNDS = [{swaps:5, ms:420}, {swaps:7, ms:320}, {swaps:9, ms:240}];

  // 기본 직업이 도박사인 캐릭터만, 런당 1회(player.jesterShellSeen).
  function jesterShellEligible(p){
    return !!(p && p.job==='jester' && !p.jesterShellSeen);
  }
  // 카드판과 같은 판돈: 30 + 층×3, 황금 도박사 2배.
  function jesterShellStake(p, depth){
    const base = 30 + (depth||0)*3;
    return p && p.specialization==='jester_goldbet' ? base*2 : base;
  }
  // 맞힌 횟수 → 수령액(판돈 포함). 무작위로 찍으면 기대값이 정확히 판돈 1배라,
  // 눈으로 따라간 만큼만 이득이 된다. 3번이면 유물(이미 있으면 4배).
  function jesterShellPayout(stake, hits, hasRelic){
    if(hits>=3) return hasRelic ? stake*4 : stake*3;
    if(hits===2) return stake*2;
    if(hits===1) return stake;
    return 0;
  }
  // 서로 다른 두 컵(슬롯 0~2)을 바꾸는 순서를 미리 정한다. 화면은 이 순서를 그대로 재생하므로
  // 눈으로 따라가면 반드시 맞힐 수 있다(딜러가 몰래 속이지 않는다).
  function jesterShellSwaps(count, rng){
    const r = rng || Math.random;
    const pairs = [[0,1],[0,2],[1,2]];
    const out = [];
    for(let i=0;i<count;i++){
      const pair = pairs[Math.min(2, Math.floor(r()*3))];
      out.push(r() < 0.5 ? [pair[0], pair[1]] : [pair[1], pair[0]]);
    }
    return out;
  }
  // 동전이 든 슬롯이 섞기 순서를 거치며 어디로 가는지.
  function jesterShellTrack(startSlot, swaps){
    let s = startSlot;
    (swaps||[]).forEach(([a,b])=>{ if(s===a) s = b; else if(s===b) s = a; });
    return s;
  }

  // ── 딜러의 장갑(relic_dealerglove) 바꿔치기 ──
  // 보스/중간보스/유물 제단/저주 제단은 고정 — 매 구간 유물 제단을 확정으로 끌어오는 걸 막는다.
  const NODE_SWAP_TYPES = ['combat','elite','shop','rest','event'];
  // 이번 구간 지도에서 아직 지나지 않은 줄(rIdx > nodeRow)의 바꿀 수 있는 칸.
  function nodeSwapCandidates(nodeMap, nodeRow){
    const out = [];
    (nodeMap||[]).forEach((row, rIdx)=>{
      if(rIdx <= nodeRow) return;
      row.forEach(n=>{ if(NODE_SWAP_TYPES.includes(n.type)) out.push(n); });
    });
    return out;
  }
  function canSwapNodePair(a, b){
    return !!(a && b && a!==b && NODE_SWAP_TYPES.includes(a.type) && NODE_SWAP_TYPES.includes(b.type) && a.type!==b.type);
  }
  // 유물 보유 + 이번 구간 미사용 + 서로 다른 종류의 대상이 두 가지 이상.
  function nodeSwapAvailable(p){
    if(!p || !(p.relics||[]).includes('relic_dealerglove')) return false;
    if(!p.nodeMap || p.nodeSwapTier===p.tierIndex) return false;
    const types = new Set(nodeSwapCandidates(p.nodeMap, p.nodeRow).map(n=>n.type));
    return types.size >= 2;
  }
  // 쉬움/보통 사망 롤백(마을 체크포인트)은 유물·구간을 되돌린다 — 야바위 노출 여부와 장갑 사용
  // 구간도 함께 되돌려야 다시 노리거나 쓸 수 있다. 이 기능 이전 체크포인트엔 키가 없으므로 채운다.
  function migrateJesterShellCheckpoint(cp){
    if(!cp) return;
    if(cp.jesterShellSeen===undefined) cp.jesterShellSeen = false;
    if(cp.nodeSwapTier===undefined) cp.nodeSwapTier = null;
  }
```

`index.html`의 `<script src="js/jester-table.js"></script>` 다음 줄에 `<script src="js/jester-shell.js"></script>`.

- [ ] **Step 4: 통과 확인**

Run: `node tests/jester-shell.test.js && node tests/jester-table.test.js && node tests/spec-story.test.js && node tests/timepatrol.test.js && node --check js/jester-shell.js`
Expected: `jester-shell: OK` 및 나머지 OK.

- [ ] **Step 5: Commit**

```bash
git add js/jester-shell.js tests/jester-shell.test.js index.html
git commit -m "야바위 컵/딜러의 장갑 순수 로직(jester-shell.js) + 단위 테스트"
```

---

### Task 2: 야바위 컵 이벤트 화면 + 컵 CSS + 풀 주입 + 유물 정의 + 체크포인트

**Files:**
- Modify: `js/events.js` (풀 주입: 카드판 push 블록 다음 / 함수: `// 도박사 전용 — 뒷골목 카드판` 주석 바로 위)
- Modify: `index.html` (`.jt-ace` 관련 `@keyframes jtAce{...}` 줄 다음에 CSS)
- Modify: `js/relics.js` (`relic_aceinsleeve` 정의 다음 줄)
- Modify: `js/explore.js` (`makeTownCheckpoint()`의 `jesterTableSeen` 줄 다음, 로드 마이그레이션 `migrateJesterCheckpoint` 줄 다음)

**Interfaces:**
- Consumes: Task 1 전부, 기존 `eventOverlay`, `closeMysteryEvent`, `showDialogueSequence`, `addLog`, `renderStatus`, `renderExplore`, `saveGame`, `getRelicSlotUsage`, `finalizeRelicPick`, `showRelicSwapPrompt`.
- Produces: `showJesterShellEvent()`, `RELICS.relic_dealerglove`, DOM `.js-cup[data-slot]`, `#js-btns`, `#js-info`, `#js-hits`.

- [ ] **Step 1: 풀 주입**

`js/events.js`의 `for(let i=0;i<JESTER_TABLE_WEIGHT;i++) handlers.push(showJesterTableEvent);`를 닫는 `}` 다음 줄에:

```js
    // 도박사 전용 "야바위 컵"(js/jester-shell.js): 기본 직업이 도박사면 3배 가중치, 런당 1회.
    if(typeof jesterShellEligible==='function' && jesterShellEligible(player)){
      for(let i=0;i<JESTER_SHELL_WEIGHT;i++) handlers.push(showJesterShellEvent);
    }
```

- [ ] **Step 2: 유물 정의**

`js/relics.js`의 `relic_aceinsleeve: {...},` 줄 다음에:

```js
    // 딜러의 장갑(도박사 전용 이벤트 "야바위 컵" 3번 모두 맞힘 보상, js/jester-shell.js).
    // eventOnly — 제단에 안 나온다. 효과는 nodemap.js의 바꿔치기 버튼(nodeSwapAvailable)이 처리한다.
    relic_dealerglove: {type:'wild', name:'딜러의 장갑', desc:'구간마다 한 번, 노드맵에서 아직 가지 않은 칸 두 개의 정체를 서로 바꿔치기할 수 있다(보스·제단 제외).', effect:{nodeSwap:true}, eventOnly:true},
```

- [ ] **Step 3: 체크포인트**

`js/explore.js`의 `makeTownCheckpoint()`에서 `jesterTableSeen: !!player.jesterTableSeen,` 다음 줄에:

```js
      // 야바위 컵/딜러의 장갑(js/jester-shell.js) — 롤백되면 다시 노리고, 그 구간에서 장갑을 다시 쓸 수 있게.
      jesterShellSeen: !!player.jesterShellSeen,
      nodeSwapTier: player.nodeSwapTier===undefined ? null : player.nodeSwapTier,
```

같은 파일 `migrateJesterCheckpoint(player.townCheckpoint);` 줄 다음에:

```js
      migrateJesterShellCheckpoint(player.townCheckpoint); // 야바위 컵/딜러의 장갑 이전 체크포인트(js/jester-shell.js)
```

- [ ] **Step 4: 컵 CSS**

`index.html`의 `@keyframes jtAce{...}` 줄 다음에:

```css
  /* 야바위 컵(도박사 전용 이벤트, js/events.js showJesterShellEvent). 컵 위치는 .js-cup의
     transform(translateX — 섞기는 Web Animations API), 들림은 안쪽 .js-shell의 translate로
     따로 움직여 서로 덮어쓰지 않는다. 3D는 쓰지 않는다. */
  .js-table{position:relative; height:120px; width:258px; margin:4px auto 6px;}
  .js-hand{position:absolute; top:0; left:0; font-size:28px; transition:transform .18s ease; pointer-events:none; z-index:5;}
  .js-cup{position:absolute; left:0; bottom:6px; width:70px; height:66px; z-index:2;}
  .js-table.picking .js-cup{cursor:pointer;}
  .js-table.picking .js-cup:hover .js-shell{filter:brightness(1.18);}
  .js-shell{position:absolute; inset:0; z-index:2; background:linear-gradient(180deg,#a06c3c,#5a3418);
    clip-path:polygon(16% 0,84% 0,100% 100%,0 100%); transition:translate .3s ease;}
  .js-cup.lifted .js-shell{translate:0 -48px;}
  .js-coin{display:none; position:absolute; left:50%; bottom:4px; width:26px; height:26px; margin-left:-13px; border-radius:50%;
    background:radial-gradient(circle at 35% 35%,#fff3b0,#e6c34a 55%,#a07a1a); box-shadow:0 0 6px #e6c34a88; z-index:1;}
  .js-cup.has-coin .js-coin{display:block;}
  .js-cup.win .js-coin{animation:jsCoinWin .7s ease-out;}
  @keyframes jsCoinWin{0%{box-shadow:0 0 0 #e6c34a00; scale:1;} 40%{box-shadow:0 0 26px #ffe27aee; scale:1.25;} 100%{box-shadow:0 0 8px #e6c34a88; scale:1;}}
  .js-cup.lose .js-shell{background:linear-gradient(180deg,#a8503a,#5a2418); animation:jsLose .5s ease;}
  @keyframes jsLose{0%,100%{rotate:0deg;} 25%{rotate:-7deg;} 50%{rotate:7deg;} 75%{rotate:-4deg;}}
```

- [ ] **Step 5: 이벤트 함수**

`js/events.js`의 `// 도박사 전용 — 뒷골목 카드판(js/jester-table.js).` 주석 바로 위에:

```js
  // 도박사 전용 — 야바위 컵(js/jester-shell.js). 손만 남은 딜러가 컵 셋을 섞는다. 3판을 끝까지 하고
  // 맞힌 횟수로 정산. 섞는 순서는 jesterShellSwaps()가 미리 정하고 화면은 그대로 재생한다(정직한 게임).
  // 연출 중엔 picking=false라 컵을 눌러도 무시되고, 타이머는 오버레이가 닫혔으면 아무것도 하지 않는다.
  const JS_SLOT_W = 94;
  function showJesterShellEvent(){
    player.jesterShellSeen = true;
    const stake = jesterShellStake(player, depth);
    const {overlay, panel} = eventOverlay('야바위 컵',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 10px;">
        엎어진 컵 세 개와, 그 위를 맴도는 손. 손목 위로는 아무것도 없다.<br>손가락이 금화 한 닢을 튕겨 올렸다가, 가운데 컵 아래로 밀어 넣는다.
      </p>
      <div class="jt-streak" id="js-hits"></div>
      <div class="js-table" id="js-table"><div class="js-hand" id="js-hand">🫳</div></div>
      <p id="js-info" style="text-align:center;color:var(--gold-bright);font-size:13px;min-height:18px;margin:0 0 10px;">판돈 ${stake}G — 세 판. 맞힌 만큼 돌려준다. 세 번 다 맞히면, 딜러가 무언가를 벗어 준다.</p>`,
      `<div id="js-btns" style="display:flex; flex-direction:column; gap:8px;"></div>`);
    const table = panel.querySelector('#js-table');
    const hand = panel.querySelector('#js-hand');
    const info = panel.querySelector('#js-info');
    const btns = panel.querySelector('#js-btns');
    const hitsEl = panel.querySelector('#js-hits');
    let round = 0, hits = 0, coinSlot = 1, picking = false, peeking = false;
    let peekLeft = player.specialization==='jester_debtcollector' ? 1 : 0;
    const wait = ms=> new Promise(res=> setTimeout(res, ms));
    const later = (fn, ms)=> setTimeout(()=>{ if(overlay.isConnected) fn(); }, ms);
    const setButtons = list=>{
      btns.innerHTML = list.map((b,i)=>`<button class="btn" data-i="${i}" ${b.disabled?'disabled':''}>${b.label}</button>`).join('');
      btns.querySelectorAll('button').forEach(el=> el.addEventListener('click', ()=>{
        setButtons([]);
        list[+el.dataset.i].on();
      }, {once:true}));
    };
    const drawHits = ()=>{ hitsEl.innerHTML = [0,1,2].map(i=> `<span class="${i<hits?'on':''}">●</span>`).join(''); };
    const cups = []; // cups[slot] = 그 슬롯에 지금 놓인 컵 요소
    const placeCup = (el, slot)=>{ el.style.transform = `translateX(${slot*JS_SLOT_W}px)`; el.dataset.slot = slot; };
    const lift = (slot, on)=> cups[slot].classList.toggle('lifted', on);
    for(let s=0;s<3;s++){
      const el = document.createElement('div');
      el.className = 'js-cup' + (s===1 ? ' has-coin' : '');
      el.innerHTML = '<div class="js-coin"></div><div class="js-shell"></div>';
      table.appendChild(el);
      placeCup(el, s);
      cups.push(el);
      el.addEventListener('click', ()=> onCup(+el.dataset.slot));
    }
    hand.style.transform = `translateX(${JS_SLOT_W+21}px)`;
    // 두 컵이 서로 슬롯을 바꾼다: 하나는 앞으로 크게(커지며 위로 겹침), 하나는 뒤로 작게 지나간다.
    const swapOnce = (a, b, ms)=> new Promise(res=>{
      const A = cups[a], B = cups[b];
      const ax = a*JS_SLOT_W, bx = b*JS_SLOT_W, mid = (ax+bx)/2;
      hand.style.transform = `translateX(${mid+21}px)`;
      A.style.zIndex = 3; B.style.zIndex = 1;
      const opt = {duration:ms, easing:'ease-in-out', fill:'forwards'};
      const animA = A.animate([{transform:`translateX(${ax}px)`}, {transform:`translateX(${mid}px) translateY(10px) scale(1.12)`}, {transform:`translateX(${bx}px)`}], opt);
      const animB = B.animate([{transform:`translateX(${bx}px)`}, {transform:`translateX(${mid}px) translateY(-8px) scale(0.9)`}, {transform:`translateX(${ax}px)`}], opt);
      animB.onfinish = ()=>{
        placeCup(A, b); placeCup(B, a);
        animA.cancel(); animB.cancel();
        A.style.zIndex = ''; B.style.zIndex = '';
        cups[a] = B; cups[b] = A;
        res();
      };
    });
    const end = (text, cls)=>{ addLog(text, cls); renderStatus(); saveGame(); closeMysteryEvent(overlay); };
    const playRound = async ()=>{
      const cfg = JESTER_SHELL_ROUNDS[round];
      info.textContent = `${round+1}판 — 동전은 이 컵 아래.`;
      lift(coinSlot, true); await wait(750); if(!overlay.isConnected) return;
      lift(coinSlot, false); await wait(400); if(!overlay.isConnected) return;
      info.textContent = `${round+1}판 — 손이 컵을 섞는다…`;
      const swaps = jesterShellSwaps(cfg.swaps);
      for(const [a,b] of swaps){
        if(!overlay.isConnected) return;
        await swapOnce(a, b, cfg.ms);
      }
      coinSlot = jesterShellTrack(coinSlot, swaps);
      info.textContent = '동전이 든 컵을 고르세요.';
      picking = true;
      table.classList.add('picking');
      setButtons(peekLeft>0 ? [{label:'👁 소매로 슬쩍 들추기 (1회)', on:()=>{
        peekLeft--; peeking = true;
        info.textContent = '몰래 들춰 볼 컵을 고르세요.';
      }}] : []);
    };
    const onCup = slot=>{
      if(!picking) return;
      if(peeking){
        peeking = false; picking = false;
        lift(slot, true);
        later(()=>{ lift(slot, false); picking = true; info.textContent = '동전이 든 컵을 고르세요.'; }, 700);
        return;
      }
      picking = false;
      table.classList.remove('picking');
      setButtons([]);
      const won = slot===coinSlot;
      lift(slot, true);
      if(won){ hits++; cups[slot].classList.add('win'); }
      else { cups[slot].classList.add('lose'); later(()=> lift(coinSlot, true), 500); }
      later(()=>{
        drawHits();
        info.textContent = won ? `맞혔다! (${hits}/3)` : `빈 컵이다. (${hits}/3)`;
        round++;
        if(round < JESTER_SHELL_ROUNDS.length){
          setButtons([{label:`다음 판 (${round+1}/3)`, on:()=>{
            cups.forEach(c=> c.classList.remove('lifted','win','lose'));
            later(playRound, 400);
          }}]);
        } else {
          setButtons([{label:'정산한다', on:settle}]);
        }
      }, 1100);
    };
    const settle = ()=>{
      const hasGlove = (player.relics||[]).includes('relic_dealerglove');
      const pay = jesterShellPayout(stake, hits, hasGlove);
      player.gold += pay;
      if(hits<3 || hasGlove){
        end(hits===0 ? `야바위 컵에서 하나도 못 맞혔다. 판돈 ${stake}G를 잃었다.` : `야바위 컵에서 ${hits}번 맞혔다. 골드 +${pay}G`, hits===0 ? 'warn' : 'gold');
        return;
      }
      addLog(`야바위 컵에서 세 번 모두 맞혔다. 골드 +${pay}G`, 'gold');
      overlay.remove();
      const done = ()=>{ renderStatus(); saveGame(); renderExplore([]); };
      showDialogueSequence([
        '딜러의 손이 멈칫하더니, 천천히 장갑 한 짝을 벗어 탁자 위에 내려놓는다.',
        '장갑 안은 비어 있다. 그런데도 손가락 끝이, 아직 무언가를 쥐고 있는 것처럼 오므라져 있다.',
      ], {onDone: ()=>{
        if(getRelicSlotUsage() >= player.relicSlots) showRelicSwapPrompt('relic_dealerglove', null, false, done);
        else { finalizeRelicPick('relic_dealerglove', false); done(); }
      }});
    };
    drawHits();
    setButtons([
      {label:`판에 앉는다 (판돈 ${stake}G)`, disabled: player.gold<stake, on:()=>{
        // 판돈을 낸 즉시 저장(jesterShellSeen 포함) — 새로고침으로 무르기 방지(카드판과 같음).
        player.gold -= stake; renderStatus(); saveGame(); playRound();
      }},
      {label:'지나간다', on:()=> end('야바위 판을 지나쳤다.')},
    ]);
  }

```

- [ ] **Step 6: 확인**

Run: `node --check js/events.js && node --check js/relics.js && node --check js/explore.js && node tests/jester-shell.test.js`
Expected: 오류 없음, `jester-shell: OK`.

- [ ] **Step 7: Commit**

```bash
git add js/events.js js/relics.js js/explore.js index.html
git commit -m "도박사 전용 이벤트 야바위 컵 — 화면/컵 섞기 연출, 유물 딜러의 장갑 정의, 체크포인트"
```

---

### Task 3: 노드맵 바꿔치기 (`nodemap.js`)

**Files:**
- Modify: `js/nodemap.js` (`let nodeMapCollapsed = false;` 다음, `renderNodeMapArea()` 안 진행 표시줄/칸 렌더/리스너)
- Modify: `index.html` (`.node-btn.node-locked{...}` 줄 다음에 CSS)

**Interfaces:**
- Consumes: `nodeSwapAvailable(p)`, `nodeSwapCandidates(map,row)`, `canSwapNodePair(a,b)` (Task 1), `NODE_TYPES`, `addLog`, `saveGame`, `hasRelicFlag`, `Sound.click`.
- Produces: 버튼 `#node-swap-btn`, 칸 클래스 `.node-swap-target/.node-swap-picked/.node-swap-dim`, 속성 `data-swap`.

- [ ] **Step 1: 모드 상태 + 처리 함수**

`js/nodemap.js`의 `let nodeMapCollapsed = false;` 다음 줄에:

```js
  // 딜러의 장갑(relic_dealerglove, js/jester-shell.js) 바꿔치기 모드. 켜져 있으면 지도에서 대상 칸만
  // 누를 수 있고(이동 없음), 두 칸을 고르면 야바위 컵처럼 엇갈리는 연출 뒤 종류를 맞바꾼다.
  let nodeSwapMode = false;
  let nodeSwapFirst = null;
  let nodeSwapAnimating = false;
  function findMapNode(id){
    for(const row of (player.nodeMap||[])){ const n = row.find(x=>x.id===id); if(n) return n; }
    return null;
  }
  function commitNodeSwap(a, b){
    const hidden = typeof hasRelicFlag==='function' && hasRelicFlag('hideDepth');
    const la = (NODE_TYPES[a.type]||{}).label, lb = (NODE_TYPES[b.type]||{}).label;
    [a.type, b.type] = [b.type, a.type];
    player.nodeSwapTier = player.tierIndex;
    nodeSwapMode = false; nodeSwapFirst = null; nodeSwapAnimating = false;
    addLog(hidden ? '🫳 딜러의 장갑으로 무언가를 바꿔쳤다.' : `🫳 딜러의 장갑으로 [${la}]과(와) [${lb}]을(를) 바꿔쳤다.`, 'gold');
    saveGame();
    renderNodeMapArea();
  }
  function onNodeSwapPick(id){
    if(nodeSwapAnimating) return;
    if(!nodeSwapFirst || nodeSwapFirst===id){
      nodeSwapFirst = nodeSwapFirst===id ? null : id;
      renderNodeMapArea();
      return;
    }
    const a = findMapNode(nodeSwapFirst), b = findMapNode(id);
    if(!canSwapNodePair(a, b)){ addLog('같은 종류의 칸끼리는 바꿔칠 수 없다.'); return; }
    const elA = document.querySelector(`#node-map-rows [data-nodeid="${a.id}"]`);
    const elB = document.querySelector(`#node-map-rows [data-nodeid="${b.id}"]`);
    if(!elA || !elB || typeof elA.animate!=='function'){ commitNodeSwap(a, b); return; }
    nodeSwapAnimating = true;
    const ra = elA.getBoundingClientRect(), rb = elB.getBoundingClientRect();
    const dx = rb.left-ra.left, dy = rb.top-ra.top;
    const opt = {duration:520, easing:'ease-in-out', fill:'forwards'};
    elA.style.zIndex = 3; elB.style.zIndex = 1;
    elA.animate([{transform:'translate(0,0)'}, {transform:`translate(${dx/2}px,${dy/2+14}px) scale(1.15)`}, {transform:`translate(${dx}px,${dy}px)`}], opt);
    const animB = elB.animate([{transform:'translate(0,0)'}, {transform:`translate(${-dx/2}px,${-dy/2-10}px) scale(0.88)`}, {transform:`translate(${-dx}px,${-dy}px)`}], opt);
    animB.onfinish = ()=> commitNodeSwap(a, b);
  }
```

- [ ] **Step 2: 진행 표시줄에 버튼**

`renderNodeMapArea()`의 진행 표시줄 HTML에서
``+ `<button id="node-map-toggle" ...`` 줄 **앞**에:

```js
        + (nodeSwapMode
            ? `<button id="node-swap-btn" class="btn" style="padding:3px 10px; font-size:11px; width:auto; pointer-events:auto;">✕ 바꿔치기 취소</button>`
            : (typeof nodeSwapAvailable==='function' && nodeSwapAvailable(player)
                ? `<button id="node-swap-btn" class="btn" style="padding:3px 10px; font-size:11px; width:auto; pointer-events:auto;">🫳 바꿔치기</button>` : ''))
```

그리고 `const toggleBtn = document.getElementById('node-map-toggle');` 줄 **앞**에:

```js
      const swapBtn = document.getElementById('node-swap-btn');
      if(swapBtn) swapBtn.addEventListener('click', ()=>{
        if(nodeSwapAnimating) return;
        nodeSwapMode = !nodeSwapMode;
        nodeSwapFirst = null;
        if(nodeSwapMode) nodeMapCollapsed = false; // 접힌 지도에선 칸을 고를 수 없다
        renderNodeMapArea();
      });
      if(nodeSwapMode) progressLabel.insertAdjacentHTML('beforeend', `<div style="color:var(--gold-bright); margin-top:4px;">바꿔칠 칸 두 개를 고르세요 (보스·제단 제외, 같은 종류끼리는 불가)</div>`);
```

- [ ] **Step 3: 칸 렌더링**

`renderNodeMapArea()`에서 `rowsEl.innerHTML = player.nodeMap.map((row, rIdx)=>{` 줄 **앞**에:

```js
    const swapIds = nodeSwapMode ? new Set(nodeSwapCandidates(player.nodeMap, player.nodeRow).map(n=>n.id)) : null;
```

칸 버튼을 만드는 `return \`<button class="${cls}" data-nodeid="${n.id}" ${clickable?\`data-node="${n.id}"\`:'disabled'}>\`` 줄을 다음으로 교체:

```js
        let attrs = clickable ? `data-node="${n.id}"` : 'disabled';
        if(swapIds){
          if(swapIds.has(n.id)){
            cls += ' node-swap-target' + (nodeSwapFirst===n.id ? ' node-swap-picked' : '');
            attrs = `data-swap="${n.id}"`;
          } else {
            cls += ' node-swap-dim';
            attrs = 'disabled';
          }
        }
        return `<button class="${cls}" data-nodeid="${n.id}" ${attrs}>`
```

리스너 부분
`rowsEl.querySelectorAll('[data-node]').forEach(btn=>{ ... pickNode(btn.dataset.node); });`
를 다음으로 교체(바꿔치기 모드에선 `data-node`가 없으므로 이동이 일어나지 않는다):

```js
    rowsEl.querySelectorAll('[data-node]').forEach(btn=>{
      btn.addEventListener('click', ()=>{ Sound.click(); pickNode(btn.dataset.node); });
    });
    rowsEl.querySelectorAll('[data-swap]').forEach(btn=>{
      btn.addEventListener('click', ()=>{ Sound.click(); onNodeSwapPick(btn.dataset.swap); });
    });
```

- [ ] **Step 4: CSS**

`index.html`의 `.node-btn.node-locked{...}` 줄 다음에:

```css
  /* 딜러의 장갑 바꿔치기 모드(js/nodemap.js) — 대상 칸은 잠김 표시를 덮어쓰고 금빛으로, 나머지는 흐리게. */
  .node-btn.node-swap-target{opacity:1 !important; filter:none !important; border-color:var(--gold-bright) !important; box-shadow:0 0 10px #e6c34a77; cursor:pointer; position:relative;}
  .node-btn.node-swap-picked{translate:0 -6px; box-shadow:0 0 18px #e6c34acc;}
  .node-btn.node-swap-dim{opacity:.3;}
```

- [ ] **Step 5: 확인**

Run: `node --check js/nodemap.js && node tests/jester-shell.test.js`
Expected: 오류 없음, OK.

- [ ] **Step 6: Commit**

```bash
git add js/nodemap.js index.html
git commit -m "딜러의 장갑 — 노드맵 바꿔치기 버튼/선택 모드/엇갈림 연출"
```

---

### Task 4: 헤드리스 실전 확인 + 문서

**Files:**
- Create(스크래치패드, 커밋 안 함): `<scratchpad>/verify-jester-shell.js`
- Modify: `story.md`(6장 물음표 이벤트 행), `CURRENT_STATUS.md`

- [ ] **Step 1: 확인 스크립트**

`<scratchpad>/verify-jester-shell.js`:

```js
const { chromium } = require('playwright-core');
(async()=>{
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page = await browser.newPage({viewport:{width:400, height:780}});
  const errors = [];
  page.on('pageerror', e=> errors.push(String(e)));
  page.on('console', m=>{ if(m.type()==='error') errors.push(m.text()); });
  await page.goto('file:///C:/dc/dungeon-crawler/index.html');
  await page.waitForTimeout(500);
  const W = ms=> page.waitForTimeout(ms);
  const ev = (fn, arg)=> page.evaluate(fn, arg);
  // 섞기 순서 고정: 매 판 [[0,1]] 한 번씩(동전 1 → 0 → 1 → 0), 대화창 즉시 넘김
  await ev(()=>{
    window.showDialogueSequence = (lines, opts)=>{ if(opts && opts.onDone) opts.onDone(); };
    window.jesterShellSwaps = (n)=> [[0,1]];
  });
  const setup = (spec, gold)=> ev(([spec, gold])=>{
    document.querySelectorAll('.shop-overlay').forEach(o=>o.remove());
    player = newPlayer('테스터', 'jester', 'normal'); depth = 10; town = false;
    player.specialization = spec || null; player.gold = gold; player.relicSlots = 3;
    showJesterShellEvent();
  }, [spec, gold]);
  const btn = l=> ev(l=>{ const b=[...document.querySelectorAll('#js-btns button')].find(x=>x.textContent.includes(l)); if(!b) throw new Error('버튼 없음: '+l); b.click(); }, l);
  const cup = s=> ev(s=> document.querySelector(`.js-cup[data-slot="${s}"]`).click(), s);
  const ROUND_WAIT = 2300; // 동전 보여주기 1150ms + 섞기 1회(최대 420ms) + 여유
  const r = {};

  // 1) 3번 모두 맞힘 → 유물 + 판돈×3 (동전: 1판 0, 2판 1, 3판 0)
  await setup(null, 100);
  await btn('판에 앉는다'); await W(ROUND_WAIT);
  r.clickDuringShuffleIgnored = true;
  await cup(0); await W(1300); await btn('다음 판'); await W(400+ROUND_WAIT);
  await page.screenshot({path:'js-round2.png'});
  await cup(1); await W(1300); await btn('다음 판'); await W(400+ROUND_WAIT);
  await cup(0); await W(1300);
  r.hitsLit = await ev(()=> document.querySelectorAll('#js-hits .on').length);
  await btn('정산한다'); await W(300);
  r.gotGlove = await ev(()=> player.relics.includes('relic_dealerglove'));
  r.goldAfter3 = await ev(()=> player.gold); // 100-60+180 = 220

  // 2) 0번 → 판돈 잃음, 연출 중 클릭 무시
  await setup(null, 100);
  await btn('판에 앉는다'); await W(300);
  await cup(0); // 섞기 도중 클릭 → 무시되어야 함
  await W(ROUND_WAIT-300);
  r.ignoredDuringShuffle = await ev(()=> document.querySelectorAll('#js-hits .on').length===0 && !document.querySelector('.js-cup.lifted'));
  await cup(1); await W(1300); await btn('다음 판'); await W(400+ROUND_WAIT);
  await cup(0); await W(1300); await btn('다음 판'); await W(400+ROUND_WAIT);
  await cup(1); await W(1300); await btn('정산한다'); await W(300);
  r.goldAfter0 = await ev(()=> player.gold); // 40

  // 3) 사기꾼 들추기 1회
  await setup('jester_debtcollector', 100);
  await btn('판에 앉는다'); await W(ROUND_WAIT);
  r.peekOffered = await ev(()=> !![...document.querySelectorAll('#js-btns button')].find(x=>x.textContent.includes('들추기')));
  await btn('들추기'); await cup(2); await W(200);
  r.peekLifted = await ev(()=> document.querySelector('.js-cup[data-slot="2"]').classList.contains('lifted'));
  await W(800);
  r.peekLowered = await ev(()=> !document.querySelector('.js-cup[data-slot="2"]').classList.contains('lifted'));
  r.peekGone = await ev(()=> !document.querySelector('#js-btns button'));

  // 4) 바꿔치기: 지도 만들고 두 칸 교환
  await ev(()=>{
    document.querySelectorAll('.shop-overlay').forEach(o=>o.remove());
    player = newPlayer('테스터', 'jester', 'normal'); town = false; depth = 21;
    player.tierIndex = 2; player.relics = ['relic_dealerglove'];
    player.nodeMap = [
      [{id:'r0a', type:'combat', connections:['r1a','r1b']}],
      [{id:'r1a', type:'shop', connections:['r2a']}, {id:'r1b', type:'relic', connections:['r2a']}],
      [{id:'r2a', type:'elite', connections:['boss']}],
      [{id:'boss', type:'boss', connections:[]}],
    ];
    player.nodeRow = 0; player.nodeCurrentId = 'r0a';
    showScreen('explore'); renderExplore([]);
  });
  r.swapBtnShown = await ev(()=> !!document.getElementById('node-swap-btn'));
  await ev(()=> document.getElementById('node-swap-btn').click());
  r.targets = await ev(()=> [...document.querySelectorAll('.node-swap-target')].map(b=>b.dataset.nodeid));
  r.altarNotTarget = await ev(()=> !document.querySelector('[data-nodeid="r1b"]').hasAttribute('data-swap'));
  await ev(()=> document.querySelector('[data-swap="r1a"]').click());
  await ev(()=> document.querySelector('[data-swap="r2a"]').click());
  await W(150);
  await page.screenshot({path:'js-mapswap.png'});
  await W(700);
  r.typesAfter = await ev(()=> [player.nodeMap[1][0].type, player.nodeMap[2][0].type]); // ['elite','shop']
  r.swapTier = await ev(()=> player.nodeSwapTier);
  r.swapBtnHiddenAfter = await ev(()=> !document.getElementById('node-swap-btn'));
  await W(600);
  r.savedTypes = await ev(()=>{ const s = JSON.parse(localStorage.getItem('savegame')||'null'); return s && [s.player.nodeMap[1][0].type, s.player.nodeMap[2][0].type]; });
  r.lastLog = await ev(()=> document.querySelector('#ex-log').lastElementChild.textContent);

  // 5) 체크포인트 롤백
  r.rollback = await ev(()=>{
    player.nodeSwapTier = null; player.jesterShellSeen = false;
    const cp = makeTownCheckpoint();
    player.nodeSwapTier = 2; player.jesterShellSeen = true;
    applyTownCheckpoint(cp);
    return [player.nodeSwapTier, player.jesterShellSeen];
  });
  r.inAltarPool = await ev(()=> RELIC_ALTAR_POOL.includes('relic_dealerglove'));

  console.log(JSON.stringify(r, null, 2));
  console.log('NON-AUDIO ERRORS:', errors.filter(e=> !/CORS|ERR_FAILED/.test(e)));
  await browser.close();
})();
```

- [ ] **Step 2: 실행 + 스크린샷 확인**

Run: `cd "<scratchpad>" && node verify-jester-shell.js`
Expected:
- `hitsLit:3`, `gotGlove:true`, `goldAfter3:220`
- `ignoredDuringShuffle:true`, `goldAfter0:40`
- `peekOffered:true`, `peekLifted:true`, `peekLowered:true`, `peekGone:true`
- `swapBtnShown:true`, `targets:['r1a','r2a']`, `altarNotTarget:true`, `typesAfter:['elite','shop']`, `swapTier:2`, `swapBtnHiddenAfter:true`, `savedTypes:['elite','shop']`, `lastLog`에 `[상점]`과 `[정예 전투]`
- `rollback:[null,false]`, `inAltarPool:false`
- `NON-AUDIO ERRORS: []`
- `js-round2.png`(컵 셋, 연승 1칸 금빛), `js-mapswap.png`(두 칸이 엇갈려 움직이는 중)을 Read로 확인. 섞기 도중 프레임도 따로 한 장 찍어(앉은 뒤 약 1300ms) 컵이 앞뒤로 엇갈리는지 본다.

실패 항목이 있으면 해당 Task로 돌아가 고친다.

- [ ] **Step 3: 문서**

`story.md` 6장 표 "물음표 이벤트" 행 끝 ` |` 앞에:
`, **야바위 컵(신규 — 도박사 전용, 3배 가중치·런당 1회, 손만 남은 딜러가 컵 셋을 섞음, 3판 맞힌 횟수로 정산, 보상 유물 딜러의 장갑 — 노드맵 칸 바꿔치기, js/jester-shell.js)**`

`CURRENT_STATUS.md`의 `## 최근 작업 (이번 세션 — 도박사 전용 이벤트 "뒷골목 카드판" + 유물 "소매 속 에이스")`의 "이번 세션"을 "이전 세션"으로 바꾸고 그 위에:

```markdown
## 최근 작업 (이번 세션 — 도박사 전용 이벤트 "야바위 컵" + 유물 "딜러의 장갑")

- 설계: `docs/superpowers/specs/2026-10-02-jester-shell-game-design.md`,
  계획: `docs/superpowers/plans/2026-10-02-jester-shell-game.md`
- 도박사 미니게임 두 번째. 카드판(운+멈출지 판단)과 달리 눈으로 따라가는 집중력 게임.
- 이벤트: 기본 직업 도박사만, 3배 가중치, 런당 1회(`player.jesterShellSeen`). 3판 고정, 섞기 5·7·9회
  (420·320·240ms). 정산: 0→0, 1→판돈, 2→×2, 3→×3+유물(보유 시 ×4). 찍기 기대값 = 판돈 1배.
  사기꾼 들추기 1회. 앉는 즉시 저장. 섞는 순서는 `jesterShellSwaps()`가 미리 정함(정직한 게임).
- 연출: 컵 위치 translateX + Web Animations API(앞으로 크게/뒤로 작게 엇갈림), 🫳 손이 따라다님,
  들림은 `.js-shell` translate로 분리.
- 유물 `relic_dealerglove`: 구간마다 1회 노드맵 미방문 칸 두 개 종류 바꿔치기(보스·중간보스·
  유물/저주 제단 제외, 같은 종류 불가). `player.nodeSwapTier`. 가려진 지도(`hideDepth`)와 함께면 로그도 가림.
- 체크포인트: `jesterShellSeen`, `nodeSwapTier` 포함 + 예전 체크포인트 마이그레이션.
- 헤드리스 Chrome 확인: <Step 2 결과 요약>
- 미검증: 실제 플레이 체감(3판 난이도, 바꿔치기 활용도).
```

- [ ] **Step 4: Commit**

```bash
git add story.md CURRENT_STATUS.md
git commit -m "야바위 컵/딜러의 장갑 문서 반영"
```
