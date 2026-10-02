# 도박사 전용 이벤트 "뒷골목 카드판" + 유물 "소매 속 에이스" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도박사에게만 뜨는 하이로우 3연승 물음표 이벤트와, 3연승 보상 유물(매 전투 다음 운 스킬 성공 확률 +15%p)을 추가한다.

**Architecture:** 판돈/판정/배당/등장 조건 같은 순수 로직은 새 파일 `js/jester-table.js`(node vm 단위 테스트). 화면은 `events.js`의 `showJesterTableEvent()`(오버레이 안 버튼을 단계마다 갈아 끼우는 상태 머신). 유물은 `relics.js`의 `RELICS`에 `eventOnly:true`로 정의하고 제단 풀에서 제외, 효과는 `combat/battle-setup.js`가 전투 시작 시 기존 1회 보정 장치 `player.fateBoostChance`를 채우는 한 줄.

**Tech Stack:** Vanilla JS(classic `<script>`, 공유 전역), Node `vm`+`assert` 단위 테스트, 헤드리스 Chrome(playwright-core + 시스템 Chrome).

**Spec:** `docs/superpowers/specs/2026-10-02-jester-card-table-design.md`

## Global Constraints

- 등장: `player.job === 'jester'` && `!player.jesterTableSeen`. 가중치 3. 이벤트가 뜬 순간 `jesterTableSeen = true`.
- 판돈 `30 + depth*3`, 황금 도박사(`jester_goldbet`) 2배. 소지 골드 < 판돈이면 앉을 수 없다.
- 카드 1~13 균등. 고른 방향으로 엄격히 크면/작으면 승리, 같은 숫자는 패배.
- 멈춤 수령액(판돈 포함): 1승 판돈×2, 2승 판돈×3. 3연승: 판돈 반환 + 유물. 유물 이미 보유 시 3연승은 판돈×4.
- 사기꾼(`jester_debtcollector`): 이벤트 동안 1회 "패를 바꿔치기"(높다/낮다 고르기 전 딜러 카드 재추첨).
- 유물 `relic_aceinsleeve`: `type:'wild'`, `effect:{firstLuckBonus:0.15}`, `eventOnly:true`. 전투 시작 시 `player.fateBoostChance = Math.max(player.fateBoostChance||0, getRelicSum('firstLuckBonus'))`.
- 슬롯 1칸 차지. 가득 차면 기존 `showRelicSwapPrompt(id, null, false, onFinalized)`.
- `RELIC_ALTAR_POOL`에서 `eventOnly` 제외.
- 딜러는 "손만 남은" 존재, 말하지 않는다(story.md 8장 7번 결). 이름(아이온/아코스) 노출 금지.

## Review Focus

1. 버튼 연타로 배당을 두 번 받거나 판돈을 두 번 내면 안 된다 — 클릭 즉시 버튼 영역을 비우고 `{once:true}` (Task 3 코드, Task 4 헤드리스에서 연타 확인).
2. 골드가 판돈보다 적으면 "판에 앉는다"가 비활성이어야 한다 — Task 4 헤드리스 확인.
3. 유물 슬롯이 가득 찬 상태에서 3연승 → 교체 화면이 떠야 하고, 끝나면 노드맵으로 돌아와야 한다 — Task 4 헤드리스 확인.
4. 도박사가 아닌 직업(하이브리드에서 job이 jester가 아닌 경우 포함)에겐 절대 안 뜬다 — Task 1 테스트.
5. 유물이 일반 유물 제단 후보에 섞이면 안 된다 — Task 2 확인(헤드리스에서 `RELIC_ALTAR_POOL` 검사).
   (알려진 영향: `records.js`의 유물 도감 완성 업적은 `Object.keys(RELICS).length` 기준이라, 이 유물이 추가되면 도감 완성에 도박사 카드판 3연승이 필요해진다 — 의도된 수집 요소로 두고 보고만 한다.)

---

### Task 1: `js/jester-table.js` — 순수 로직 + 단위 테스트

**Files:**
- Create: `js/jester-table.js`
- Create: `tests/jester-table.test.js`
- Modify: `index.html` (`<script src="js/spec-story.js"></script>` 다음 줄)

**Interfaces:**
- Produces:
  - `JESTER_TABLE_WEIGHT` (3), `JESTER_TABLE_WIN_STREAK` (3)
  - `jesterTableEligible(p) → boolean`
  - `jesterTableStake(p, depth) → number`
  - `jesterTablePayout(stake, wins, hasRelic) → number` (수령액, 판돈 포함)
  - `jesterTableDraw(rng?) → 1..13`
  - `jesterTableJudge(card, next, pickHigh) → boolean`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/jester-table.test.js`:

```js
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

console.log('jester-table: OK');
```

- [ ] **Step 2: 실패 확인**

Run: `node tests/jester-table.test.js`
Expected: FAIL — `ENOENT ... js/jester-table.js`

- [ ] **Step 3: `js/jester-table.js` 작성**

```js
"use strict";
/*
도박사 전용 물음표 이벤트 "뒷골목 카드판"(하이로우 3연승) — 순수 로직.
설계: docs/superpowers/specs/2026-10-02-jester-card-table-design.md
export(전역): JESTER_TABLE_WEIGHT, JESTER_TABLE_WIN_STREAK, jesterTableEligible, jesterTableStake,
       jesterTablePayout, jesterTableDraw, jesterTableJudge
주의: 화면은 events.js의 showJesterTableEvent(). 이 파일은 DOM을 만지지 않는다
     (tests/jester-table.test.js가 node vm으로 바로 불러 쓴다).
*/

  // 이벤트 풀 가중치(다른 이벤트 1 대비)와 유물까지 필요한 연승 수.
  const JESTER_TABLE_WEIGHT = 3;
  const JESTER_TABLE_WIN_STREAK = 3;

  // 기본 직업이 도박사인 캐릭터만(전직 전후·전직 종류 무관), 런당 1회(player.jesterTableSeen).
  function jesterTableEligible(p){
    return !!(p && p.job==='jester' && !p.jesterTableSeen);
  }
  // 판돈 30 + 층×3. 황금 도박사는 2배(배당 배율은 같으므로 수령액도 자연히 2배).
  function jesterTableStake(p, depth){
    const base = 30 + (depth||0)*3;
    return p && p.specialization==='jester_goldbet' ? base*2 : base;
  }
  // 멈췄을 때 받는 금액(이미 낸 판돈 포함). 1승 2배, 2승 3배.
  // 3연승은 판돈만 돌려받고 유물을 얻는다 — 유물을 이미 가졌다면(하드코어 재시작 런) 4배.
  function jesterTablePayout(stake, wins, hasRelic){
    if(wins>=JESTER_TABLE_WIN_STREAK) return hasRelic ? stake*4 : stake;
    if(wins===2) return stake*3;
    if(wins===1) return stake*2;
    return 0;
  }
  function jesterTableDraw(rng){
    return 1 + Math.floor((rng||Math.random)()*13);
  }
  // pickHigh=true면 "높다". 같은 숫자는 패배(딜러의 몫).
  function jesterTableJudge(card, next, pickHigh){
    return pickHigh ? next>card : next<card;
  }
```

`index.html`의 `<script src="js/spec-story.js"></script>` 다음 줄에:

```html
<script src="js/jester-table.js"></script>
```

- [ ] **Step 4: 통과 확인**

Run: `node tests/jester-table.test.js && node tests/spec-story.test.js && node tests/timepatrol.test.js && node --check js/jester-table.js`
Expected: `jester-table: OK`, 나머지 테스트도 OK.

- [ ] **Step 5: Commit**

```bash
git add js/jester-table.js tests/jester-table.test.js index.html
git commit -m "도박사 카드판 순수 로직(jester-table.js) + 단위 테스트"
```

---

### Task 2: 유물 "소매 속 에이스" — 정의, 제단 제외, 전투 시작 효과

**Files:**
- Modify: `js/relics.js` (`RELICS`의 `relic_firststrike` 정의 다음 줄, `RELIC_ALTAR_POOL` 정의)
- Modify: `js/combat/battle-setup.js` (`battleFlags` 초기화 블록 — 타임패트롤 시작 단서 줄 다음)

**Interfaces:**
- Produces: `RELICS.relic_aceinsleeve`, 전투 시작 시 `player.fateBoostChance` 보정.
- Consumes: `getRelicSum(key)` (`js/data/equipment.js`)

- [ ] **Step 1: 유물 정의**

`js/relics.js`에서 `relic_firststrike: {...},` 줄 다음에:

```js
    // 소매 속 에이스(도박사 전용 이벤트 "뒷골목 카드판" 3연승 보상, js/jester-table.js).
    // eventOnly — 유물 제단에는 나오지 않는다. 효과는 전투 시작 시 기존 1회 보정 장치
    // (player.fateBoostChance — 정보료/촉과 같은 것)를 채우는 방식(combat/battle-setup.js).
    relic_aceinsleeve: {type:'wild', name:'소매 속 에이스', desc:'전투가 시작될 때마다, 다음 운 스킬(동전 던지기·승부수·마지막 카드·베팅) 하나의 성공 확률이 15%p 오른다.', effect:{firstLuckBonus:0.15}, eventOnly:true},
```

- [ ] **Step 2: 제단 풀 제외**

`js/relics.js`의
`const RELIC_ALTAR_POOL = Object.keys(RELICS).filter(id=>RELICS[id].type!=='curse');`
를 다음으로 교체:

```js
  // eventOnly(소매 속 에이스 등 이벤트 전용 보상)도 제단에서 뺀다.
  const RELIC_ALTAR_POOL = Object.keys(RELICS).filter(id=>RELICS[id].type!=='curse' && !RELICS[id].eventOnly);
```

- [ ] **Step 3: 전투 시작 효과**

`js/combat/battle-setup.js`에서
`if(hasSpecPerk(player, 'mechanic_timepatrol')) battleFlags.timeClues = SPEC_PERK.mechanic_timepatrol;`
다음 줄에:

```js
    // 소매 속 에이스(relic_aceinsleeve) — 매 전투 다음 운 스킬 하나의 성공 확률 +15%p.
    // 정보료/촉이 이미 더 큰 보정을 걸어 뒀다면 그 값을 유지한다.
    const aceLuckBonus = getRelicSum('firstLuckBonus');
    if(aceLuckBonus>0) player.fateBoostChance = Math.max(player.fateBoostChance||0, aceLuckBonus);
```

- [ ] **Step 4: 문법 확인**

Run: `node --check js/relics.js && node --check js/combat/battle-setup.js && grep -c "eventOnly" js/relics.js`
Expected: 오류 없음, 마지막 출력 `2` 이상(정의 1 + 필터 1, 주석 포함 시 그 이상).

- [ ] **Step 5: Commit**

```bash
git add js/relics.js js/combat/battle-setup.js
git commit -m "유물 소매 속 에이스 — 이벤트 전용(제단 제외), 매 전투 다음 운 스킬 성공 확률 +15%p"
```

---

### Task 3: 이벤트 화면 `showJesterTableEvent()` + 풀 주입

**Files:**
- Modify: `js/events.js` (`showMysteryEvent()`의 전직 전용 이벤트 push 블록 다음, `showSpecEvent()` 함수 바로 위에 새 함수)

**Interfaces:**
- Consumes: Task 1 전부, `RELICS.relic_aceinsleeve`(Task 2), 기존 `eventOverlay`, `closeMysteryEvent`, `showDialogueSequence`, `addLog`, `renderStatus`, `renderExplore`, `saveGame`, `getRelicSlotUsage`, `finalizeRelicPick(id, isMystery)`, `showRelicSwapPrompt(newId, altarOverlay, isMystery, onFinalized)`.
- Produces: `showJesterTableEvent()` (전역), `player.jesterTableSeen`.

- [ ] **Step 1: 풀 주입**

`js/events.js`의 `showMysteryEvent()`에서 전직 전용 이벤트 push 블록(`for(let i=0;i<SPEC_EVENT_WEIGHT;i++) handlers.push(showSpecEvent);`를 닫는 `}`) 다음 줄에:

```js
    // 도박사 전용 "뒷골목 카드판"(js/jester-table.js): 기본 직업이 도박사면 3배 가중치, 런당 1회.
    if(typeof jesterTableEligible==='function' && jesterTableEligible(player)){
      for(let i=0;i<JESTER_TABLE_WEIGHT;i++) handlers.push(showJesterTableEvent);
    }
```

- [ ] **Step 2: 이벤트 함수**

`js/events.js`의 `// 전직 전용 이벤트(js/spec-story.js의 SPEC_EVENTS)` 주석 바로 위에:

```js
  // 도박사 전용 — 뒷골목 카드판(js/jester-table.js). 손만 남은 딜러와 하이로우 3연승.
  // 버튼 영역을 단계마다 갈아 끼우는 상태 머신: 앉기 → (딜러 카드 → 높다/낮다 → 승패)
  // 반복 → 멈춤/패배/3연승. 클릭 즉시 버튼을 비워 연타로 두 번 정산되지 않게 한다.
  function showJesterTableEvent(){
    player.jesterTableSeen = true;
    const stake = jesterTableStake(player, depth);
    const {overlay, panel} = eventOverlay('뒷골목 카드판',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 10px;">
        회랑 한구석, 낡은 탁자 위에서 카드를 섞는 손이 있다. 손목 위로는 아무것도 없다.<br>손가락이 탁자를 두 번 두드리고, 빈 의자 쪽을 가리킨다.
      </p>
      <p id="jt-info" style="text-align:center;color:var(--gold-bright);font-size:13px;min-height:18px;margin:0 0 10px;">판돈 ${stake}G — 세 판을 내리 이기면, 딜러의 소매 속에 든 것을 건넨다.</p>`,
      `<div id="jt-btns" style="display:flex; flex-direction:column; gap:8px;"></div>`);
    const info = panel.querySelector('#jt-info');
    const btns = panel.querySelector('#jt-btns');
    let wins = 0, card = 0;
    let swapLeft = player.specialization==='jester_debtcollector' ? 1 : 0;
    const setButtons = list=>{
      btns.innerHTML = list.map((b,i)=>`<button class="btn" data-i="${i}" ${b.disabled?'disabled':''}>${b.label}</button>`).join('');
      btns.querySelectorAll('button').forEach(el=> el.addEventListener('click', ()=>{
        setButtons([]);
        list[+el.dataset.i].on();
      }, {once:true}));
    };
    const end = (text, cls)=>{
      addLog(text, cls);
      renderStatus();
      saveGame();
      closeMysteryEvent(overlay);
    };
    const deal = ()=>{
      card = jesterTableDraw();
      info.textContent = `${wins}승 — 딜러의 카드: ${card}`;
      const opts = [{label:'⬆ 높다', on:()=>reveal(true)}, {label:'⬇ 낮다', on:()=>reveal(false)}];
      if(swapLeft>0) opts.push({label:'🃏 패를 바꿔치기 (1회)', on:()=>{ swapLeft--; deal(); }});
      setButtons(opts);
    };
    const reveal = pickHigh=>{
      const next = jesterTableDraw();
      if(!jesterTableJudge(card, next, pickHigh)){
        info.textContent = `${card} → ${next}. 손가락이 판돈을 쓸어 간다.`;
        setButtons([{label:'일어선다', on:()=> end(`뒷골목 카드판에서 졌다. 판돈 ${stake}G를 잃었다.`, 'warn')}]);
        return;
      }
      wins++;
      if(wins>=JESTER_TABLE_WIN_STREAK){
        info.textContent = `${card} → ${next}. 세 판을 내리 이겼다.`;
        setButtons([{label:'손을 내민다', on:winAll}]);
        return;
      }
      const pay = jesterTablePayout(stake, wins, false);
      info.textContent = `${card} → ${next}. ${wins}승! 지금 멈추면 ${pay}G.`;
      setButtons([
        {label:`멈춘다 (${pay}G 받기)`, on:()=>{ player.gold += pay; end(`뒷골목 카드판에서 ${wins}승 후 멈췄다. 골드 +${pay}G`, 'gold'); }},
        {label:'계속한다', on:deal},
      ]);
    };
    const winAll = ()=>{
      const hasAce = (player.relics||[]).includes('relic_aceinsleeve');
      const pay = jesterTablePayout(stake, wins, hasAce);
      player.gold += pay;
      if(hasAce){
        end(`뒷골목 카드판에서 세 판을 내리 이겼다. 딜러가 소매를 털어 보이고는 골드를 밀어 준다. 골드 +${pay}G`, 'gold');
        return;
      }
      addLog(`뒷골목 카드판에서 세 판을 내리 이겼다. 판돈 ${pay}G를 돌려받았다.`, 'gold');
      overlay.remove();
      const done = ()=>{ renderStatus(); saveGame(); renderExplore([]); };
      showDialogueSequence([
        '딜러의 손이 잠시 멈추더니, 소매 속에서 카드 한 장을 꺼내 탁자 위로 밀어 준다.',
        '스페이드 에이스. 모서리가 닳도록 오래 쥐고 있던 카드다.',
      ], {onDone: ()=>{
        if(getRelicSlotUsage() >= player.relicSlots) showRelicSwapPrompt('relic_aceinsleeve', null, false, done);
        else { finalizeRelicPick('relic_aceinsleeve', false); done(); }
      }});
    };
    setButtons([
      {label:`판에 앉는다 (판돈 ${stake}G)`, disabled: player.gold<stake, on:()=>{ player.gold -= stake; renderStatus(); deal(); }},
      {label:'지나간다', on:()=> end('카드판을 지나쳤다.')},
    ]);
  }

```

- [ ] **Step 3: 문법/테스트 확인**

Run: `node --check js/events.js && node tests/jester-table.test.js`
Expected: 오류 없음, `jester-table: OK`. (화면 동작은 Task 4 헤드리스.)

- [ ] **Step 4: Commit**

```bash
git add js/events.js
git commit -m "도박사 전용 물음표 이벤트 뒷골목 카드판 화면 + 이벤트 풀 주입"
```

---

### Task 4: 헤드리스 실전 확인 + 문서

**Files:**
- Create(스크래치패드, 커밋 안 함): `<scratchpad>/verify-jester-table.js` (playwright-core는 이미 스크래치패드에 설치됨 — 없으면 `npm i playwright-core --prefix "<scratchpad>"`)
- Modify: `story.md` (6장 표 "물음표 이벤트" 행), `CURRENT_STATUS.md` ("최근 작업" 최상단)

- [ ] **Step 1: 확인 스크립트**

`<scratchpad>/verify-jester-table.js`:

```js
const { chromium } = require('playwright-core');
(async()=>{
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e=> errors.push(String(e)));
  await page.goto('file:///C:/dc/dungeon-crawler/index.html');
  await page.waitForTimeout(500);
  const out = await page.evaluate(()=>{
    const r = {};
    window.showDialogueSequence = (lines, opts)=>{ if(opts && opts.onDone) opts.onDone(); };
    // 카드 순서를 고정: queue에서 하나씩 꺼낸다
    let queue = [];
    window.jesterTableDraw = ()=> queue.shift();
    const btn = label=> [...document.querySelectorAll('#jt-btns button')].find(b=> b.textContent.includes(label));
    const setup = (spec, gold)=>{
      document.querySelectorAll('.shop-overlay').forEach(o=>o.remove());
      player = newPlayer('테스터', 'jester', 'normal'); depth = 10; town = false;
      player.specialization = spec || null; player.gold = gold;
    };
    // 1) 골드 부족 → 앉기 비활성
    setup(null, 10); showJesterTableEvent();
    r.sitDisabledWhenPoor = btn('판에 앉는다').disabled;
    r.seenOnShow = player.jesterTableSeen;
    btn('지나간다').click();
    // 2) 1승 후 멈춤: 판돈 60 → 120 수령, 연타해도 한 번만
    setup(null, 100); showJesterTableEvent();
    queue = [7, 9]; btn('판에 앉는다').click(); btn('높다').click();
    const stopBtn = btn('멈춘다'); stopBtn.click(); stopBtn.click();
    r.goldAfterStop = player.gold; // 100 - 60 + 120 = 160
    // 3) 같은 숫자 패배
    setup(null, 100); showJesterTableEvent();
    queue = [7, 7]; btn('판에 앉는다').click(); btn('높다').click();
    r.tieLoses = !!btn('일어선다'); btn('일어선다').click();
    r.goldAfterTie = player.gold; // 40
    // 4) 3연승 → 유물 획득(슬롯 여유)
    setup(null, 100); player.relicSlots = 3; showJesterTableEvent();
    queue = [2, 9, 12, 3, 1, 5]; btn('판에 앉는다').click();
    btn('높다').click(); btn('계속한다').click(); btn('낮다').click(); btn('계속한다').click(); btn('높다').click();
    btn('손을 내민다').click();
    r.gotAce = player.relics.includes('relic_aceinsleeve');
    r.goldAfterWin = player.gold; // 판돈 반환 → 100
    // 6) 슬롯 가득 → 교체 화면
    document.querySelectorAll('.shop-overlay').forEach(o=>o.remove());
    setup(null, 100); player.relicSlots = 1; player.relics = ['relic_firststrike'];
    showJesterTableEvent();
    queue = [2, 9, 12, 3, 1, 5]; btn('판에 앉는다').click();
    btn('높다').click(); btn('계속한다').click(); btn('낮다').click(); btn('계속한다').click(); btn('높다').click();
    btn('손을 내민다').click();
    r.swapPromptShown = !!document.getElementById('relic-swap-overlay');
    document.querySelector('#relic-swap-overlay .relic-card').click();
    r.afterSwap = player.relics.slice();
    // 7) 사기꾼 바꿔치기 1회 제한
    setup('jester_debtcollector', 100); showJesterTableEvent();
    queue = [7, 3, 9]; btn('판에 앉는다').click();
    r.swapOffered = !!btn('바꿔치기'); btn('바꿔치기').click();
    r.swapOfferedAgain = !!btn('바꿔치기');
    r.cardAfterSwap = document.getElementById('jt-info').textContent;
    // 8) 황금 도박사 판돈 2배, 도박사 아니면 자격 없음, 제단 풀 제외
    r.goldbetStake = jesterTableStake({specialization:'jester_goldbet'}, 10);
    r.warriorEligible = jesterTableEligible(newPlayer('x','warrior','normal'));
    r.inAltarPool = RELIC_ALTAR_POOL.includes('relic_aceinsleeve');
    return r;
  });
  // 5) 유물 보유 시 전투 시작 보정 — 전투 시작 연출이 비동기라 따로 띄우고 기다린 뒤 읽는다
  await page.evaluate(()=>{
    document.querySelectorAll('.shop-overlay').forEach(o=>o.remove());
    player = newPlayer('테스터', 'jester', 'easy'); depth = 10; town = false;
    player.relics = ['relic_aceinsleeve']; player.fateBoostChance = 0;
    showScreen('battle'); startBattle(false);
  });
  await page.waitForTimeout(2500);
  out.fateBoostAtBattle = await page.evaluate(()=> player.fateBoostChance);
  console.log(JSON.stringify(out, null, 2));
  console.log('NON-AUDIO ERRORS:', errors.filter(e=> !/CORS|ERR_FAILED/.test(e)));
  await browser.close();
})();
```

- [ ] **Step 2: 실행**

Run: `cd "<scratchpad>" && node verify-jester-table.js`
Expected:
- `sitDisabledWhenPoor:true`, `seenOnShow:true`
- `goldAfterStop:160`(연타해도 한 번만 정산), `tieLoses:true`, `goldAfterTie:40`
- `gotAce:true`, `goldAfterWin:100`, `fateBoostAtBattle:0.15`
- `swapPromptShown:true`, `afterSwap`가 `['relic_aceinsleeve']`
- `swapOffered:true`, `swapOfferedAgain:false`, `cardAfterSwap`에 `3`
- `goldbetStake:120`, `warriorEligible:false`, `inAltarPool:false`
- `NON-AUDIO ERRORS: []`

실패 항목이 있으면 해당 Task로 돌아가 고친다.

- [ ] **Step 3: 문서**

`story.md` 6장 표 "물음표 이벤트" 행 끝 ` |` 앞에:
`, **뒷골목 카드판(신규 — 도박사 전용, 3배 가중치·런당 1회, 손만 남은 딜러와 하이로우 3연승, 보상 유물 소매 속 에이스, js/jester-table.js)**`

`CURRENT_STATUS.md`의 `## 최근 작업 (이번 세션 — 전직별 물음표 이벤트/엔딩 분기, 스토리 연결 5종)` 제목의 "이번 세션"을 "이전 세션"으로 바꾸고, 그 위에:

```markdown
## 최근 작업 (이번 세션 — 도박사 전용 이벤트 "뒷골목 카드판" + 유물 "소매 속 에이스")

- 설계: `docs/superpowers/specs/2026-10-02-jester-card-table-design.md`,
  계획: `docs/superpowers/plans/2026-10-02-jester-card-table.md`
- 사용자 방향: 도박사는 미니게임식 요소를 더 주고 싶음(이번이 첫 번째).
- 이벤트: 기본 직업 도박사만, 3배 가중치, 런당 1회(`player.jesterTableSeen`). 하이로우 3연승
  (같은 숫자 패배). 판돈 30+층×3(황금 도박사 2배), 1승 멈춤 2배·2승 멈춤 3배, 3연승 판돈 반환 +
  유물(이미 보유 시 4배). 사기꾼은 딜러 카드 바꿔치기 1회. 3연승 확률 기본 36%/사기꾼 42%(시뮬).
- 유물 `relic_aceinsleeve`: eventOnly(제단 제외), 매 전투 시작 시 `player.fateBoostChance`를
  0.15 이상으로(동전/승부수/마지막 카드/베팅 중 먼저 쓰는 하나가 소비).
- 순수 로직 `js/jester-table.js`, 테스트 `node tests/jester-table.test.js`.
- 알려진 영향: 유물 도감 완성 업적에 이 유물이 포함된다(도박사 카드판 3연승 필요).
- 헤드리스 Chrome 확인: <Step 2 결과 요약>
- 미검증: 실제 플레이 체감(등장 빈도, 연출 톤).
```

- [ ] **Step 4: Commit**

```bash
git add story.md CURRENT_STATUS.md
git commit -m "뒷골목 카드판/소매 속 에이스 문서 반영"
```
