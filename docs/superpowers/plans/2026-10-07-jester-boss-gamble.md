# 도박사 유물 세트 "딜러의 판" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도박사 유물 3개를 모으면 보스전을 미니게임 한 판으로 끝낼 수 있게 한다(선택제, 지면 사망).

**Architecture:** 세트/제안 조건/게임 고르기/스물하나 판정은 `js/jester-den-games.js`의 순수 함수(단위 테스트). 기존 게임 4개에 `opts.boss`(판돈 없음·보스전 승리 기준·`onResult(won)`)를 더하고, 흐름(버튼·확인·결과 처리)·최종보스 게임·세트 장면은 새 파일 `js/jester-boss-gamble.js`. 승패는 기존 `checkBattleEnd()`로 처리해 보상·엔딩 경로를 그대로 탄다.

**Tech Stack:** Vanilla JS(classic script, 공유 전역), Node vm+assert, 헤드리스 Chrome(playwright-core).

**Spec:** `docs/superpowers/specs/2026-10-07-jester-boss-gamble-design.md`

## Global Constraints

- 세트 = `relic_aceinsleeve` + `relic_dealerglove` + `relic_edgecandle`.
- 대상 = `enemy.isBoss`(층별보스·시간의 파수꾼·최종보스). 선택제, 첫 행동 후엔 제안 없음.
- 보스전 승리 기준: 카드판 2연승, 야바위 3판 중 2번, 쥐 경주 내 쥐 1등, 도둑잡기 승리, 최종보스는 시간의 스물하나(동점 다시, 버스트 시 1회 되감기).
- 이기면 기존 처치 경로(광폭화 건너뜀), 지면 HP 0 → 기존 사망 경로. 판돈 없음, 지나가기 없음.
- 건 순간 `player.bossGambleUsed = nodeCurrentId||'boss'` 저장, `pickNode`/`enterNodeMapTier`에서 초기화.
- 이름(아이온/아코스) 직접 노출 금지. 딜러 정체는 방울로만 암시.

## Review Focus

- 조우 대사 팝업이 떠 있는 동안 버튼이 눌려도 흐름이 꼬이지 않는지(대사 오버레이가 위를 덮으므로 클릭 불가 — 헤드리스로 대사 중 버튼 상태 확인).
- 이기고 처치 연출 중(0.9초) 다른 입력(명령 버튼)이 막혀 있는지 — `setCommandsEnabled(false)` 유지.
- 최종보스 승리 시 엔딩이 정상 진행(`showEnding`)되는지, 진최종보스 광폭화가 끼어들지 않는지.
- 보스전 모드 게임에 판돈/지나가기 버튼이 남지 않는지(목숨을 건 판에서 빠져나갈 길 없음).
- 사망 롤백 후 같은 구간 보스(`t{n}boss` 같은 id)에서 다시 제안되는지(초기화 확인).

---

### Task 1: 순수 로직(세트·제안·게임 고르기·스물하나)

**Files:** Modify `js/jester-den-games.js`(끝에 추가), Test `tests/jester-den-games.test.js`(`console.log` 앞)

**Interfaces — Produces:** `JESTER_SET_RELICS`, `jesterSetComplete(p)→bool`, `bossGambleEligible(p, e)→bool`, `BOSS_GAMBLE_GAMES`, `bossGambleGame(e, rng)→'final21'|'table'|'shell'|'rats'|'thief'`, `BOSS_TABLE_STREAK=2`, `BOSS_SHELL_HITS=2`, `bjTotal(cards)→number`, `bjDealerHits(cards)→bool`, `bjOutcome(mine, theirs)→'win'|'lose'|'push'`.

- [ ] **Step 1: 실패하는 테스트**

```js
// ── 도박사 유물 세트: 보스전 딜러의 판 ──
const SET = "['relic_aceinsleeve','relic_dealerglove','relic_edgecandle']";
assert.strictEqual(run(`jesterSetComplete({relics:${SET}})`), true);
assert.strictEqual(run("jesterSetComplete({relics:['relic_aceinsleeve','relic_dealerglove']})"), false);
assert.strictEqual(run('jesterSetComplete(null)'), false);
assert.strictEqual(run(`bossGambleEligible({relics:${SET}, nodeCurrentId:'t0boss'}, {isBoss:true})`), true);
assert.strictEqual(run(`bossGambleEligible({relics:${SET}, nodeCurrentId:'t0r1n0'}, {isBoss:false})`), false, '보스 아님');
assert.strictEqual(run(`bossGambleEligible({relics:['relic_aceinsleeve'], nodeCurrentId:'t0boss'}, {isBoss:true})`), false, '세트 미완성');
assert.strictEqual(run(`bossGambleEligible({relics:${SET}, nodeCurrentId:'t0boss', bossGambleUsed:'t0boss'}, {isBoss:true})`), false, '이 칸에서 이미 걸었음');
assert.strictEqual(run(`bossGambleEligible({relics:${SET}, nodeCurrentId:'t1boss', bossGambleUsed:'t0boss'}, {isBoss:true})`), true, '다른 칸');
assert.strictEqual(run(`bossGambleEligible({relics:${SET}, nodeCurrentId:null, bossGambleUsed:'boss'}, {isBoss:true})`), false, '칸 id 없으면 boss 키');
assert.strictEqual(run(`bossGambleEligible({relics:${SET}}, null)`), false);
assert.deepStrictEqual(J(run('BOSS_GAMBLE_GAMES')), ['table','shell','rats','thief']);
assert.strictEqual(run("bossGambleGame({isBoss:true, isFinal:true}, ()=>0)"), 'final21');
assert.strictEqual(run("bossGambleGame({isBoss:true}, ()=>0)"), 'table');
assert.strictEqual(run("bossGambleGame({isBoss:true}, ()=>0.999)"), 'thief');
assert.strictEqual(run('BOSS_TABLE_STREAK'), 2);
assert.strictEqual(run('BOSS_SHELL_HITS'), 2);
// 스물하나: A는 11, 넘으면 1
assert.strictEqual(run('bjTotal([1,13])'), 21);
assert.strictEqual(run('bjTotal([1,1])'), 12);
assert.strictEqual(run('bjTotal([10,9,5])'), 24);
assert.strictEqual(run('bjTotal([1,5,10])'), 16);
assert.strictEqual(run('bjTotal([1,1,9])'), 21);
assert.strictEqual(run('bjTotal([12,11])'), 20, 'J·Q·K는 10');
assert.strictEqual(run('bjDealerHits([10,6])'), true);
assert.strictEqual(run('bjDealerHits([10,7])'), false);
assert.strictEqual(run('bjDealerHits([1,6])'), false, '소프트 17도 멈춘다');
assert.strictEqual(run('bjOutcome([10,9,5],[10,7])'), 'lose', '내가 넘으면 패배');
assert.strictEqual(run('bjOutcome([10,9],[10,6,8])'), 'win', '보스가 넘으면 승리');
assert.strictEqual(run('bjOutcome([10,9],[10,7])'), 'win');
assert.strictEqual(run('bjOutcome([10,7],[10,9])'), 'lose');
assert.strictEqual(run('bjOutcome([10,8],[9,9])'), 'push');
```

- [ ] **Step 2: 실패 확인** — `node tests/jester-den-games.test.js` → `ReferenceError: jesterSetComplete is not defined`.

- [ ] **Step 3: 구현(파일 끝에 추가, 헤더 export 목록에도 추가)**

```js
  // ── 도박사 유물 세트 "딜러의 판" ── 셋을 모두 지니면 보스전을 한 판 승부로 끝낼 수 있다(지면 쓰러진다).
  // 흐름/화면은 jester-boss-gamble.js. 설계: docs/superpowers/specs/2026-10-07-jester-boss-gamble-design.md
  const JESTER_SET_RELICS = ['relic_aceinsleeve', 'relic_dealerglove', 'relic_edgecandle'];
  function jesterSetComplete(p){ return !!p && JESTER_SET_RELICS.every(id=> (p.relics||[]).includes(id)); }
  // 제안 조건: 세트 완성 + 보스(층별·파수꾼·최종 모두 isBoss) + 이 칸에서 아직 안 걸었음(새로고침 재도전 방지).
  function bossGambleEligible(p, e){
    if(!jesterSetComplete(p) || !(e && e.isBoss)) return false;
    return p.bossGambleUsed !== (p.nodeCurrentId || 'boss');
  }
  const BOSS_GAMBLE_GAMES = ['table', 'shell', 'rats', 'thief'];
  function bossGambleGame(e, rng){
    if(e && e.isFinal) return 'final21';
    return BOSS_GAMBLE_GAMES[Math.min(3, Math.floor((rng || Math.random)()*4))];
  }
  // 보스전 승리 기준(판돈 없이 승패만): 카드판 2연승, 야바위 3판 중 2번(쥐 경주는 1등, 도둑잡기는 승리).
  const BOSS_TABLE_STREAK = 2, BOSS_SHELL_HITS = 2;

  // ── 최종보스 전용 "시간의 스물하나" ── 카드 1~13(A=11 또는 1, J·Q·K=10). 21을 넘으면 진다.
  function bjTotal(cards){
    let t = 0, aces = 0;
    cards.forEach(n=>{ if(n===1){ aces++; t += 11; } else t += Math.min(10, n); });
    while(t > 21 && aces > 0){ t -= 10; aces--; }
    return t;
  }
  // 보스(딜러)는 17 이상이 될 때까지 받는다(소프트 17 포함 멈춤).
  function bjDealerHits(cards){ return bjTotal(cards) < 17; }
  function bjOutcome(mine, theirs){
    const a = bjTotal(mine), b = bjTotal(theirs);
    if(a > 21) return 'lose';
    if(b > 21) return 'win';
    return a > b ? 'win' : a < b ? 'lose' : 'push';
  }
```

- [ ] **Step 4: 통과 확인** — `node tests/jester-den-games.test.js` → OK.
- [ ] **Step 5: 커밋** — "딜러의 판 순수 로직(세트·제안 조건·게임 고르기·스물하나) + 단위 테스트"

### Task 2: 기존 게임 4개의 보스전 모드

**Files:** Modify `js/events.js`(`showJesterShellEvent`, `showJesterTableEvent`), `js/jester-den.js`(`showRatRace`, `showThiefGame`). Test: 헤드리스 `<scratchpad>/verify-boss-gamble.js modes`.

**Interfaces — Consumes:** `BOSS_TABLE_STREAK`, `BOSS_SHELL_HITS`(Task 1). **Produces:** 네 함수 모두 `opts = {boss:true, onResult(won)}`를 받으면 판돈·지나가기 없이 한 판 후 오버레이를 닫고 `onResult(won)` 호출.

공통 규칙: `const boss = opts && opts.boss ? opts : null;` 판돈 `stake = boss ? 0 : 기존`. 앉기 버튼은 `boss ? '판에 앉는다' : 기존`, 보스면 `disabled:false`, 골드 차감·저장 없음, **지나간다 버튼 없음**. 끝나면 `const bossEnd = won=>{ overlay.remove(); boss.onResult(won); };`.

- [ ] **Step 1: 헤드리스 테스트(`modes`)** — 각 게임을 `{boss:true, onResult:w=>window.__res=w}`로 직접 열어:
  - 카드판: `jesterTableDraw`를 [5,9,5,9]로 고정 → 높다·계속·높다 → "판을 거둔다" → `__res===true`, 연승 점 2개, 앉기 화면에 지나간다 없음. [5,3]으로 고정 → 높다 → "일어선다" → `false`.
  - 야바위: `jesterShellSwaps=()=>[]`(섞지 않음, 동전은 1번 슬롯) → 매 판 1번 컵 → "판을 거둔다" → `true`. 0번 컵만 → `false`.
  - 쥐 경주: 결승 시 `st.winner = 내 쥐`로 덮어쓰면 `true`, 다른 쥐면 `false`. 반환점 선택지 없음, 쥐 버튼에 판돈 표기 없음, 지나간다 없음.
  - 도둑잡기: 기존 고정 패 스텁으로 이기면 `true`, 지면 `false`, 앉기에 판돈·지나간다 없음.
- [ ] **Step 2: 실패 확인** — 보스 옵션을 무시해 판돈 버튼/정산이 나오므로 FAIL.
- [ ] **Step 3: 구현**
  - `showJesterTableEvent`: `if(!den && !boss) player.jesterTableSeen = true;` 도입 지문 보스면
    `'보스 앞, 손만 남은 딜러가 카드를 섞는다. 두 판을 내리 이기면 승부는 끝난다.'`, 안내
    `boss ? '두 판을 내리 이기면 이긴다. 한 번이라도 지면 — 끝이다.' : 기존`. `const need = boss ? BOSS_TABLE_STREAK : JESTER_TABLE_WIN_STREAK;`
    `drawStreak`/연승 판정에 `need`. 패배 분기: 보스면 버튼 `일어선다 → bossEnd(false)`. `wins>=need`: 보스면 `판을 거둔다 → bossEnd(true)`.
    `wins<need`: 보스면 버튼은 `계속한다`만.
  - `showJesterShellEvent`: `if(!den && !boss) player.jesterShellSeen = true;` 안내 `boss ? '세 판 중 두 번 맞히면 이긴다.' : 기존`.
    `settle` 맨 앞: `if(boss){ bossEnd(hits >= BOSS_SHELL_HITS); return; }`, 마지막 판 버튼 라벨 보스면 `판을 거둔다`.
  - `showRatRace(opts)`: 쥐 버튼 `boss ? \`${name}에 건다\` : 기존`, 판돈 차감·저장 없음, 안내 `내 쥐가 1등으로 들어오면 이긴다.`,
    `tick`의 반환점 조건에 `&& !boss`, `finish` 맨 앞: 보스면 `won = st.winner===pick` → 버튼 `판을 거둔다`/`일어선다` → `bossEnd(won)`.
    지나간다는 보스면 넣지 않는다.
  - `showThiefGame(opts)`: 앉기 보스면 판돈 없이, 안내 `boss ? '패를 먼저 다 털면 이긴다.' : 기존`, `checkEnd`에서 보스면
    버튼 `판을 거둔다`/`일어선다` → `bossEnd(w==='me')`.
- [ ] **Step 4: 통과 확인** — `node verify-boss-gamble.js modes` 전부 PASS, `node verify-den-games.js` 42/42 유지(회귀).
- [ ] **Step 5: 커밋** — "카드판·야바위·쥐 경주·도둑잡기 보스전 모드(판돈 없음, 보스전 승리 기준)"

### Task 3: 딜러의 판 흐름 + 시간의 스물하나 + 세트 장면

**Files:** Create `js/jester-boss-gamble.js`. Modify `index.html`(`#bt-command-area` 안 `#cmd-main` 앞에 버튼 행, `<script>` — `jester-den.js` 다음), `js/combat/battle-fx.js:155`(`setCommandsEnabled`), `js/combat/battle-setup.js:1126`(`startBattle` 끝), `js/nodemap.js`(`pickNode`, `enterNodeMapTier`), `js/relics.js`(`finalizeRelicPick` 끝).

**Interfaces — Consumes:** Task 1 전부, Task 2 `opts.boss`, `denButtons`/`DEN_INTRO_STYLE`/`DEN_INFO_STYLE`(jester-den.js), `getEnrageSteps(e)`(battle-setup.js), `checkBattleEnd()`, `jesterTableDraw()`/`jesterTableCardLabel(n)`. **Produces:** `showBossGambleOffer()`, `hideBossGambleOffer()`, `startBossGamble()`, `resolveBossGamble(won)`, `showFinal21(onResult)`, `maybeShowJesterSetScene()`.

- [ ] **Step 1: 헤드리스 테스트(`flow`, `final`, `scene`)**
  - flow: 세트 유물 + 1구간 지도(보스 칸만) → 보스 칸 진입 → `#boss-gamble-row` 보임. 공격 버튼 → 사라짐. 세트 없음 → 안 보임.
    일반 전투 → 안 보임. 다시 보스전 → 버튼 → 확인창 "건다" → `bossGambleUsed==='t0boss'`이고 저장됨 → 게임 고르기를 `thief`로 고정 +
    이기는 패 스텁 → 판을 거둔다 → `battleOver`, `enemy.hp===0`, 2.5초 뒤 탐험 화면 + 보스 보상 선택창 경로. 같은 칸 재제안 없음
    (`showBossGambleOffer()` 후 숨김). 지는 패 스텁 → 일어선다 → 게임오버 화면, `deathCount===1`.
  - final: `startBattle(true, true, false)`(세트 보유, 노드 없음) → 버튼 → 건다 → 시간의 스물하나(`jesterTableDraw`를 [10,9,10,7]로 고정 →
    멈춘다 → 19 대 17 승리) → 판을 거둔다 → `player.endingSeen===true`. 버스트: [10,6,10,7,9,4]로 고정 → 한 장 더(9 → 25) →
    "시간을 되감는다" 보임 → 되감기 → 16, 되감기 버튼 사라짐 → 한 장 더(4 → 20) → 멈춘다 → 20 대 17 승리.
  - scene: 유물 둘 보유 → `finalizeRelicPick('relic_edgecandle')` → 대화 1회, `jesterSetSeen===true`. 다시 호출 → 대화 없음.
- [ ] **Step 2: 실패 확인** — `showBossGambleOffer is not defined` 등.
- [ ] **Step 3: 구현**
  - `index.html` — `<div class="cmd-grid" id="cmd-main">` 바로 앞:
    ```html
        <div id="boss-gamble-row" style="display:none; margin:0 0 8px;"><button class="btn" id="cmd-boss-gamble" style="width:100%; border-color:#c9a8ff; color:#e6d6ff;">🎲 딜러의 판 — 한 판으로 끝낸다</button></div>
    ```
    `<script src="js/jester-den.js"></script>` 다음 줄에 `<script src="js/jester-boss-gamble.js"></script>`.
  - `battle-fx.js` `setCommandsEnabled(en)` 끝: `if(!en && typeof hideBossGambleOffer==='function') hideBossGambleOffer();`
  - `battle-setup.js` `startBattle()` 마지막 줄 `maybeShowSpecialEncounterDialogue(...)` 다음: `if(typeof showBossGambleOffer==='function') showBossGambleOffer();`
  - `nodemap.js` — `pickNode`의 `player.nodeClearedId = null;` 다음 줄 `player.bossGambleUsed = null;`, `enterNodeMapTier`의 `player.nodeSecret = null;` 다음 줄 `player.bossGambleUsed = null;`.
  - `relics.js` `finalizeRelicPick` 끝(거꾸로 된 왕관 토스트 블록 다음): `if(typeof maybeShowJesterSetScene==='function') maybeShowJesterSetScene();`
  - `js/jester-boss-gamble.js` 전체:

```js
"use strict";
/*
도박사 유물 세트 "딜러의 판"(소매 속 에이스 + 딜러의 장갑 + 벼랑 끝의 촛불) — 보스전을 한 판 승부로.
세트를 완성하면 보스전(층별보스·시간의 파수꾼·최종보스) 시작 때 명령 버튼 위에 "한 판으로 끝낸다"가 뜨고, 첫 행동을 하면
사라진다(battle-fx.js setCommandsEnabled). 걸면 미니게임 결과로 승패가 난다 — 이기면 그 자리에서 처치(보상·엔딩은 평소와
같다, checkBattleEnd), 지면 그대로 쓰러진다. 층별보스·파수꾼은 도박장 게임 4종 중 무작위(보스전 모드), 최종보스는
"시간의 스물하나". 건 순간 player.bossGambleUsed에 칸 id를 저장해 새로고침으로 다시 걸지 못하게 한다(nodemap.js가 초기화).
설계: docs/superpowers/specs/2026-10-07-jester-boss-gamble-design.md
export(전역): showBossGambleOffer, hideBossGambleOffer, startBossGamble, resolveBossGamble, showFinal21, maybeShowJesterSetScene
의존성: jester-den-games.js, jester-den.js(denButtons/DEN_*_STYLE/showRatRace/showThiefGame), events.js(eventOverlay/
       showJesterTableEvent/showJesterShellEvent), jester-table.js(jesterTableDraw/jesterTableCardLabel),
       combat/battle-setup.js(getEnrageSteps), combat/battle-end.js(checkBattleEnd), combat/battle-fx.js, ui/dialogue.js
*/

  function showBossGambleOffer(){
    const row = document.getElementById('boss-gamble-row');
    if(row) row.style.display = (enemy && !battleOver && bossGambleEligible(player, enemy)) ? 'block' : 'none';
  }
  function hideBossGambleOffer(){
    const row = document.getElementById('boss-gamble-row');
    if(row) row.style.display = 'none';
  }
  function confirmBossGamble(){
    if(battleOver || !bossGambleEligible(player, enemy)) return;
    const {overlay, panel} = eventOverlay('딜러의 판',
      `<p style="${DEN_INTRO_STYLE}">${enemy.name} 앞으로, 손만 남은 딜러가 탁자를 편다.<br>이기면 그 자리에서 끝난다. 지면 — 그대로 쓰러진다.</p>`,
      `<div id="bg-btns" style="display:flex; flex-direction:column; gap:8px;"></div>`);
    denButtons(panel.querySelector('#bg-btns'), [
      {label:'🎲 건다', on:()=>{ overlay.remove(); startBossGamble(); }},
      {label:'그만둔다 (싸운다)', on:()=> overlay.remove()},
    ]);
  }
  const bossGambleBtn = document.getElementById('cmd-boss-gamble');
  if(bossGambleBtn) bossGambleBtn.addEventListener('click', confirmBossGamble);

  function startBossGamble(){
    setCommandsEnabled(false); // 버튼 행도 같이 숨는다
    // 건 순간 저장 — 지고 새로고침해 다시 거는 걸 막는다(이 칸에서는 다시 제안하지 않는다).
    player.bossGambleUsed = player.nodeCurrentId || 'boss';
    saveGame();
    const game = bossGambleGame(enemy);
    const opts = {boss:true, onResult: resolveBossGamble};
    if(game==='final21') showFinal21(resolveBossGamble);
    else if(game==='table') showJesterTableEvent(opts);
    else if(game==='shell') showJesterShellEvent(opts);
    else if(game==='rats') showRatRace(opts);
    else showThiefGame(opts);
  }
  // 이기면 기존 처치 경로(최종보스 광폭화 단계는 건너뛴다), 지면 HP 0 → 기존 사망 경로. 생존 장치는 거치지 않는다.
  function resolveBossGamble(won){
    if(battleOver) return;
    playBanner(won ? '판을 이겼다!' : '판을 잃었다…', won ? '' : 'enrage');
    setBattleMsg(won ? '딜러의 손이 판을 덮는다.' : '딜러의 손가락이, 그대를 가리킨다.', won ? `${enemy.name}이(가) 무너져 내린다.` : '');
    setTimeout(()=>{
      if(battleOver) return;
      if(won){
        enemy.phase = getEnrageSteps(enemy).length;
        enemy.usedUndying = true;
        enemy.hp = 0; enemy._prevHp = 0;
        document.getElementById('bt-ehp-bar').style.width = '0%';
      } else {
        player.hp = 0;
        renderStatus();
      }
      checkBattleEnd();
    }, 900);
  }

  // 최종보스 "시간의 스물하나": 보스가 딜러(17 이상까지 받음), 동점은 다시 나눈다. 21을 넘으면 한 번,
  // 시간을 되감아 방금 받은 카드를 무를 수 있다(되감기는 한 판 전체에 1회).
  const FINAL21_INTRO = {
    progenitor: '낡은 왕관 아래의 시선이, 딜러가 내민 카드에 머문다. "...끝까지 운에 맡기겠다는 건가."',
    timewitch: '시간의 마녀가 카드 한 장을 뒤집어 보고는 희미하게 웃는다. "되감는 건 내가 먼저였지. 해 보아라."',
  };
  function f21CardHtml(n, up){
    return `<div class="jt-card${up ? ' face-up' : ''}"><div class="jt-back"></div><div class="jt-front">${jesterTableCardLabel(n)}</div></div>`;
  }
  function showFinal21(onResult){
    const intro = FINAL21_INTRO[enemy.type] || `${enemy.name}이(가) 딜러의 손에서 카드를 받아 든다.`;
    const {overlay, panel} = eventOverlay('시간의 스물하나',
      `<p style="${DEN_INTRO_STYLE}">${intro}<br>21에 더 가까운 쪽이 이긴다. 넘으면 진다. 넘었을 때 한 번, 시간을 되감을 수 있다.</p>
      <div class="th-row" id="f21-boss"></div><p class="jt-hint" id="f21-boss-sum"></p>
      <div class="th-row" id="f21-me"></div><p class="jt-hint" id="f21-me-sum"></p>
      <p id="f21-info" style="${DEN_INFO_STYLE}"></p>`,
      `<div id="f21-btns" style="display:flex; flex-direction:column; gap:8px;"></div>`);
    const bossEl = panel.querySelector('#f21-boss'), meEl = panel.querySelector('#f21-me');
    const bossSum = panel.querySelector('#f21-boss-sum'), meSum = panel.querySelector('#f21-me-sum');
    const info = panel.querySelector('#f21-info'), btns = panel.querySelector('#f21-btns');
    let me = [], boss = [], hidden = true, rewindLeft = 1;
    const later = (fn, ms)=> setTimeout(()=>{ if(overlay.isConnected) fn(); }, ms);
    const draw = ()=>{
      bossEl.innerHTML = boss.map((n,i)=> f21CardHtml(n, !(hidden && i===1))).join('');
      meEl.innerHTML = me.map(n=> f21CardHtml(n, true)).join('');
      bossSum.textContent = `${enemy.name} — ${hidden ? '?' : bjTotal(boss)}`;
      meSum.textContent = `나 — ${bjTotal(me)}`;
    };
    const finish = res=>{
      hidden = false; draw();
      const line = `${bjTotal(me)} 대 ${bjTotal(boss)}`;
      if(res==='push'){
        info.textContent = `${line} — 비겼다. 다시 나눈다.`;
        denButtons(btns, [{label:'다시 받는다', on:deal}]);
        return;
      }
      const won = res==='win';
      info.textContent = `${line} — ${won ? '이겼다.' : '졌다.'}`;
      denButtons(btns, [{label: won ? '판을 거둔다' : '일어선다', on:()=>{ overlay.remove(); onResult(won); }}]);
    };
    const myTurn = ()=>{
      const t = bjTotal(me);
      if(t > 21){
        info.textContent = `${t} — 넘었다.`;
        const opts = [];
        if(rewindLeft > 0) opts.push({label:'⏳ 시간을 되감는다 (1회)', on:()=>{
          rewindLeft--; me.pop(); draw();
          info.textContent = '모래가 거꾸로 흐른다. 방금 받은 카드는, 받지 않은 것이 되었다.';
          later(myTurn, 700);
        }});
        opts.push({label:'받아들인다', on:()=> finish('lose')});
        denButtons(btns, opts);
        return;
      }
      info.textContent = t===21 ? '21.' : `${t}. 한 장 더?`;
      denButtons(btns, [
        {label:'한 장 더', on:()=>{ me.push(jesterTableDraw()); draw(); later(myTurn, 350); }},
        {label:'멈춘다', on:stand},
      ]);
    };
    const stand = ()=>{
      hidden = false; draw();
      info.textContent = `${enemy.name}이(가) 카드를 받는다…`;
      const step = ()=>{
        if(bjDealerHits(boss)){ boss.push(jesterTableDraw()); draw(); later(step, 600); return; }
        later(()=> finish(bjOutcome(me, boss)), 500);
      };
      later(step, 600);
    };
    function deal(){
      me = [jesterTableDraw(), jesterTableDraw()];
      boss = [jesterTableDraw(), jesterTableDraw()];
      hidden = true; draw();
      later(myTurn, 500);
    }
    deal();
  }

  // 세 번째 유물을 얻는 순간 1회(relics.js finalizeRelicPick). 딜러의 정체는 방울로만 암시한다.
  function maybeShowJesterSetScene(){
    if(!jesterSetComplete(player) || player.jesterSetSeen) return;
    player.jesterSetSeen = true;
    saveGame();
    showDialogueSequence([
      '세 가지가 손 안에서 맞물린다 — 소매 속의 에이스, 빈 장갑, 꺼지지 않는 몽당초.',
      '어디선가 작고 낡은 방울 소리가 난다. 광대 모자 끝에나 달려 있을 법한 방울이다.',
      '손만 남은 딜러가, 처음으로 고개 숙여 인사하는 시늉을 한다. 이제 판은 그대의 것이다.',
      {text:'이제 보스전을 시작할 때 "딜러의 판"으로 한 번에 끝낼 수 있다. 지면, 그대로 쓰러진다.', title:'🎲 딜러의 판'},
    ], {title:'🎲 세 개의 소지품'});
  }
```

- [ ] **Step 4: 통과 확인** — `node verify-boss-gamble.js` 전부 PASS, `node verify-den-games.js` 42/42, `node verify-refresh-farm.js` 14/14, 단위 테스트 5개.
- [ ] **Step 5: 커밋** — "딜러의 판: 보스전 한 판 승부 흐름 + 최종보스 시간의 스물하나 + 세트 완성 장면"

### Task 4: 문서

- [ ] story.md — 진실의 조각 행 뒤에 "딜러의 판(도박사 유물 세트)" 행(세 소지품·방울·보스전 한 판, 정체 미확정 암시만).
- [ ] CURRENT_STATUS.md — 이번 세션 항목(결정 사항 표 요약, 확인 필요 목록, 헤드리스 결과).
- [ ] 커밋 — "딜러의 판 문서 반영"
