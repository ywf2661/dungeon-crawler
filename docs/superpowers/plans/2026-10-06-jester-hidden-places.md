# 딜러의 장갑 — 숨겨진 장소(진실의 조각 + 숨겨진 도박장) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 딜러의 장갑 바꿔치기로 손자국 3칸 중 진짜 비밀 칸을 들어 올리면 그 자리가 🕯 숨겨진 장소로 바뀌고, 들어가면 진실의 조각(도박사만 아는 거래의 진실 5조각, 영구 기록, 다 모으면 엔딩 장면 추가) 또는 숨겨진 도박장(카드판·야바위 컵을 런 제한 없이 한 판)이 열린다.

**Architecture:** 순수 로직(비밀 배정/판정/종류 굴리기/조각 순서/도박장 탁자 고르기/엔딩 줄 끼우기)은 `js/jester-shell.js`에 추가하고 node vm으로 테스트. 조각 문구·진실 캐시·이야기 칸/도박장 화면은 새 파일 `js/jester-den.js`. 영구 저장은 `js/storage.js`(`specdex`와 같은 패턴). 노드맵 쪽(손자국, 드러남, `'secret'` 노드)은 `js/nodemap.js`. 엔딩 장면은 `js/combat/battle-end.js`의 `showEnding()`에 한 줄 호출.

**Tech Stack:** Vanilla JS(classic `<script>`, 공유 전역), CSS, Node `vm`+`assert`, 헤드리스 Chrome(playwright-core + 시스템 Chrome).

**Spec:** `docs/superpowers/specs/2026-10-06-jester-hidden-places-design.md`

## Global Constraints

- 비밀 배정: 장갑 보유 + 이번 구간 바꿔치기 미사용 + 바꿀 쌍 존재(`nodeSwapAvailable`)일 때 지연 배정. 진짜 1 + 미끼 최대 2, 전부 `nodeSwapCandidates` 안에서. `player.nodeSecret = {id, decoys, found}`.
- `enterNodeMapTier()`에서 `player.nodeSecret = null`.
- 손자국은 잿빛 손바닥 SVG(희미하게, 칸 바닥에 깔려 글자를 가리지 않음, 잠긴 칸 흐림을 같이 받음), 전체 지도 오버레이에서만, 진짜/미끼 구분 없이. 이번 구간 바꿔치기를 쓰면 사라짐. 게임 안 안내 문구는 발견 팝업/로그 외에 추가하지 않는다.
- 드러남: 바꿔치기 두 칸 중 하나가 진짜면 교환 직후 그 칸 `type='secret'`(옮겨 오던 종류는 사라짐), `secretKind` 저장, `found=true`.
- 종류: 남은 조각 있으면 story 60% / den 40%, 다 모았으면 항상 den.
- 발견 팝업: "들어 올린 자리 밑으로, 계단이 아래로 이어진다." / "숨겨진 장소를 찾았다." 로그 "🕯 숨겨진 장소를 찾았다."(가려진 지도여도 같음).
- `NODE_TYPES.secret = {icon:'🕯', label:'숨겨진 장소', weight:0}`. 바꿔치기 대상(`NODE_SWAP_TYPES`)에는 넣지 않는다.
- 이야기 칸: 다음 조각(가장 앞 미열람 번호)을 화면 전에 영구 기록(`jestertruth`), 최대HP 20% 회복. 이름(아이온/아코스) 노출 금지.
- 도박장: 등록부에서 최대 2탁자, 한 판. 도박장 모드는 `jesterTableSeen`/`jesterShellSeen`을 건드리지 않는다.
- 엔딩: `player.job==='jester'` && 조각 1~5 전부 → 시조는 "하나를 지키지 못했다" 줄 뒤, 아이온(첫/재)은 첫 줄 뒤에 추가 장면.
- 진실 기록은 판 밖 영구 저장이라 롤백되지 않는다. `nodeSecret`은 체크포인트에 넣지 않는다.

## Review Focus

1. 손자국 배정 직후 새로고침으로 진짜 위치를 다시 굴릴 수 없어야 한다 — 배정 즉시 `saveGame()`(Task 3 코드, Task 4 헤드리스: 저장본에 `nodeSecret` 존재).
2. 드러난 🕯 칸은 다시 바꿔치기 대상이 되면 안 된다 — `nodeSwapCandidates`가 `'secret'` 제외(Task 1 테스트).
3. 이야기 칸으로 굴려졌는데 그사이 다섯 조각을 다 봤다면(다른 캐릭터로) 빈 화면 대신 도박장이 열려야 한다 — `showJesterTruthRoom` 폴백(Task 2 코드, Task 4 헤드리스).
4. 도박장에서 연 카드판/야바위는 런당 1회 플래그를 세우지 않고, 물음표 이벤트로 연 것은 그대로 세운다 — Task 2 코드, Task 4 헤드리스.
5. 사망 후 같은 구간 새 지도에서 이전 지도의 비밀 id가 남아 엉뚱한 칸이 비밀이 되면 안 된다 — `enterNodeMapTier` 초기화(Task 3 코드, Task 4 헤드리스).

---

### Task 1: 순수 로직 — 비밀 배정/판정/조각 순서/도박장 탁자/엔딩 줄

**Files:**
- Modify: `js/jester-shell.js` (파일 끝에 추가, 머리 주석 export 목록 갱신)
- Modify: `tests/jester-shell.test.js` (`console.log('jester-shell: OK');` 앞에 추가)

**Interfaces:**
- Consumes: 같은 파일의 `nodeSwapCandidates(nodeMap, nodeRow)`.
- Produces:
  - `JESTER_TRUTH_COUNT` (5)
  - `assignNodeSecret(nodeMap, nodeRow, rng?) → {id, decoys:string[], found:false} | null`
  - `resolveSecretSwap(a, b, secret) → node | null`
  - `nextTruthIndex(seen:number[]) → 1..5 | -1`, `truthComplete(seen) → boolean`
  - `rollSecretKind(seen, rng?) → 'story' | 'den'`
  - `pickDenTables(list, n, rng?) → list의 부분 배열(길이 ≤ n, 중복 없음)`
  - `TRUTH_ENDING_LINES` (`{progenitor:string[], witch:string[]}`), `insertTruthEndingLines(lines, kind) → lines`

- [ ] **Step 1: 실패하는 테스트**

`tests/jester-shell.test.js`의 `console.log('jester-shell: OK');` 바로 앞에:

```js
// ── 숨겨진 장소 ──
assert.strictEqual(run('JESTER_TRUTH_COUNT'), 5);

// 드러난 비밀 칸은 바꿔치기 대상이 아니다
assert.deepStrictEqual(JSON.parse(run(`JSON.stringify(nodeSwapCandidates([[{id:'s',type:'secret'},{id:'k',type:'shop'}]], -1).map(n=>n.id))`)), ['k']);

// 비밀 배정: 진짜 1 + 미끼 최대 2, 전부 후보 안, 중복 없음
run(`var smap = [
  [{id:'x0', type:'combat'}],
  [{id:'s1', type:'shop'}, {id:'s2', type:'event'}, {id:'s3', type:'relic'}],
  [{id:'s4', type:'elite'}, {id:'s5', type:'rest'}],
  [{id:'sb', type:'boss'}],
];`);
for(let i=0;i<100;i++){
  const sec = JSON.parse(run('JSON.stringify(assignNodeSecret(smap, 0))'));
  const pool = ['s1','s2','s4','s5'];
  assert.ok(pool.includes(sec.id));
  assert.strictEqual(sec.decoys.length, 2);
  sec.decoys.forEach(d=>{ assert.ok(pool.includes(d)); assert.notStrictEqual(d, sec.id); });
  assert.notStrictEqual(sec.decoys[0], sec.decoys[1]);
  assert.strictEqual(sec.found, false);
}
// 후보가 적으면 있는 만큼, 없으면 null
assert.strictEqual(JSON.parse(run('JSON.stringify(assignNodeSecret(smap, 1))')).decoys.length, 1, '남은 후보 s4,s5 → 진짜 1 + 미끼 1');
assert.strictEqual(run('assignNodeSecret(smap, 2)'), null);
assert.strictEqual(run('assignNodeSecret(null, -1)'), null);
// rng 경계
assert.ok(['s1','s2','s4','s5'].includes(JSON.parse(run('JSON.stringify(assignNodeSecret(smap, 0, ()=>0))')).id));
assert.ok(['s1','s2','s4','s5'].includes(JSON.parse(run('JSON.stringify(assignNodeSecret(smap, 0, ()=>0.999999))')).id));

// 바꿔치기 판정
run("var sec = {id:'s2', decoys:['s1','s4'], found:false};");
assert.strictEqual(run("resolveSecretSwap({id:'s2'},{id:'s5'},sec).id"), 's2');
assert.strictEqual(run("resolveSecretSwap({id:'s5'},{id:'s2'},sec).id"), 's2');
assert.strictEqual(run("resolveSecretSwap({id:'s1'},{id:'s4'},sec)"), null, '미끼만');
assert.strictEqual(run("resolveSecretSwap({id:'s2'},{id:'s5'},Object.assign({},sec,{found:true}))"), null, '이미 찾음');
assert.strictEqual(run("resolveSecretSwap({id:'s2'},{id:'s5'},null)"), null);

// 조각 순서
assert.strictEqual(run('nextTruthIndex([])'), 1);
assert.strictEqual(run('nextTruthIndex([1,2])'), 3);
assert.strictEqual(run('nextTruthIndex([2,3])'), 1, '가장 앞 미열람');
assert.strictEqual(run('nextTruthIndex([1,2,3,4,5])'), -1);
assert.strictEqual(run('nextTruthIndex(null)'), 1);
assert.strictEqual(run('truthComplete([5,4,3,2,1])'), true);
assert.strictEqual(run('truthComplete([1,2,3,4])'), false);

// 종류 굴리기
assert.strictEqual(run('rollSecretKind([], ()=>0.59)'), 'story');
assert.strictEqual(run('rollSecretKind([], ()=>0.6)'), 'den');
assert.strictEqual(run('rollSecretKind([1,2,3,4,5], ()=>0)'), 'den', '다 모으면 항상 도박장');

// 도박장 탁자
assert.strictEqual(JSON.parse(run("JSON.stringify(pickDenTables(['a','b','c'], 2))")).length, 2);
assert.deepStrictEqual(JSON.parse(run("JSON.stringify(pickDenTables(['a','b'], 2).sort())")), ['a','b']);
assert.strictEqual(JSON.parse(run("JSON.stringify(pickDenTables(['a'], 2))")).length, 1);
for(let i=0;i<50;i++){ const t = JSON.parse(run("JSON.stringify(pickDenTables(['a','b','c'], 2))")); assert.notStrictEqual(t[0], t[1]); }

// 엔딩 줄 끼우기
run(`var pl = ['왕관이 굴러떨어진다.', '손자국.', '"...하나를 지키지 못했다. 그래서 남은 이들만큼은, 놓을 수가 없었지."', '원혼들.'];`);
run("insertTruthEndingLines(pl, 'progenitor');");
assert.strictEqual(run('pl[3]'), run('TRUTH_ENDING_LINES.progenitor[0]'));
assert.strictEqual(run('pl.length'), 4 + run('TRUTH_ENDING_LINES.progenitor.length'));
assert.strictEqual(run('pl[pl.length-1]'), '원혼들.');
run(`var wl = ['시계가 산산조각 난다.', {text:'"…또 왔군."', title:'아이온'}];`);
run("insertTruthEndingLines(wl, 'witch');");
assert.strictEqual(run('wl[1]'), run('TRUTH_ENDING_LINES.witch[0]'));
assert.strictEqual(run('wl[wl.length-1].title'), '아이온');
run("var nl = ['a','b']; insertTruthEndingLines(nl, 'progenitor');");
assert.strictEqual(run('nl[1]'), run('TRUTH_ENDING_LINES.progenitor[0]'), '앵커가 없으면 첫 줄 뒤');
run("var xl = ['a']; insertTruthEndingLines(xl, 'nope');");
assert.strictEqual(run('xl.length'), 1);
```

- [ ] **Step 2: 실패 확인**

Run: `node tests/jester-shell.test.js`
Expected: FAIL — `ReferenceError: JESTER_TRUTH_COUNT is not defined`

- [ ] **Step 3: 구현**

`js/jester-shell.js` 머리 주석의 export 목록 마지막 줄 `canSwapNodePair, nodeSwapAvailable, migrateJesterShellCheckpoint`를 다음으로 교체:

```
       canSwapNodePair, nodeSwapAvailable, migrateJesterShellCheckpoint,
       JESTER_TRUTH_COUNT, assignNodeSecret, resolveSecretSwap, nextTruthIndex, truthComplete,
       rollSecretKind, pickDenTables, TRUTH_ENDING_LINES, insertTruthEndingLines
```

파일 끝에 추가:

```js

  // ── 숨겨진 장소(진실의 조각 + 숨겨진 도박장) ──
  // 설계: docs/superpowers/specs/2026-10-06-jester-hidden-places-design.md
  // 화면은 js/jester-den.js(이야기 칸/도박장)와 nodemap.js(손자국/드러남).
  const JESTER_TRUTH_COUNT = 5;
  function shuffled(list, r){
    const out = list.slice();
    for(let i=out.length-1;i>0;i--){ const j = Math.min(i, Math.floor(r()*(i+1))); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  // 바꿀 수 있는 칸 중 하나 밑에 비밀을 숨기고, 손자국을 찍을 미끼를 최대 2개 고른다.
  // 진짜와 미끼는 화면에서 구분되지 않는다(야바위 컵 셋처럼).
  function assignNodeSecret(nodeMap, nodeRow, rng){
    const pool = shuffled(nodeSwapCandidates(nodeMap, nodeRow).map(n=>n.id), rng || Math.random);
    if(!pool.length) return null;
    return {id:pool[0], decoys:pool.slice(1, 3), found:false};
  }
  // 바꿔치기로 든 두 칸 중 진짜 비밀 칸(이미 찾았으면 없음).
  function resolveSecretSwap(a, b, secret){
    if(!secret || secret.found) return null;
    if(a && a.id===secret.id) return a;
    if(b && b.id===secret.id) return b;
    return null;
  }
  // 아직 안 본 가장 앞 조각 번호(1부터). 다 봤으면 -1.
  function nextTruthIndex(seen){
    const s = seen || [];
    for(let i=1;i<=JESTER_TRUTH_COUNT;i++) if(!s.includes(i)) return i;
    return -1;
  }
  function truthComplete(seen){ return nextTruthIndex(seen)===-1; }
  // 드러난 장소의 종류. 남은 조각이 있으면 이야기 60% / 도박장 40%, 다 모았으면 항상 도박장.
  function rollSecretKind(seen, rng){
    if(truthComplete(seen)) return 'den';
    return (rng || Math.random)() < 0.6 ? 'story' : 'den';
  }
  // 도박장에 놓을 탁자(등록부에서 최대 n개, 중복 없음).
  function pickDenTables(list, n, rng){
    return shuffled(list || [], rng || Math.random).slice(0, n);
  }
  // 다섯 조각을 모두 본 도박사의 엔딩 추가 장면. 이름은 쓰지 않는다(story.md 8장).
  const TRUTH_ENDING_LINES = {
    progenitor: [
      '서신함에서 찾은 편지를, 왕 앞에 내려놓는다.',
      '"…그걸, 읽었나."',
      '"값을 묻지 않던 자였다. 그래서 더, 미안했지."',
    ],
    witch: [
      '보랏빛 손수건을 내민다.',
      '"…그걸, 어디서."',
      '그녀가 삐뚤빼뚤한 땀을 손끝으로 쓸어 본다.',
      '"…서툴렀지. 바늘을 처음 쥐어 봤으니까."',
    ],
  };
  // 시조는 "하나를 지키지 못했다" 줄 뒤(없으면 첫 줄 뒤), 아이온은 첫 줄 뒤에 끼운다.
  function insertTruthEndingLines(lines, kind){
    const add = TRUTH_ENDING_LINES[kind];
    if(!add) return lines;
    let at = 1;
    if(kind==='progenitor'){
      const i = lines.findIndex(l=> String(typeof l==='string' ? l : (l && l.text)).includes('하나를 지키지 못했다'));
      if(i>=0) at = i+1;
    }
    lines.splice(at, 0, ...add);
    return lines;
  }
```

- [ ] **Step 4: 통과 확인**

Run: `node tests/jester-shell.test.js && node tests/jester-table.test.js && node tests/spec-story.test.js && node tests/timepatrol.test.js && node --check js/jester-shell.js`
Expected: `jester-shell: OK` 및 나머지 OK.

- [ ] **Step 5: Commit**

```bash
git add js/jester-shell.js tests/jester-shell.test.js
git commit -m "숨겨진 장소 순수 로직 — 비밀 배정/판정, 조각 순서, 도박장 탁자, 엔딩 줄 끼우기"
```

---

### Task 2: 진실의 조각·숨겨진 도박장 화면 + 영구 저장 + 도박장 모드 + 엔딩 장면

**Files:**
- Create: `js/jester-den.js`
- Modify: `js/storage.js` (export 주석 + `addToSpecDex` 함수 다음)
- Modify: `index.html` (`<script src="js/jester-shell.js"></script>` 다음 줄)
- Modify: `js/events.js` (`showJesterShellEvent`, `showJesterTableEvent` 시작부)
- Modify: `js/combat/battle-end.js` (`insertSpecEndingLines(lines, ...)` 줄 다음)

**Interfaces:**
- Consumes: Task 1 전부. 기존 `eventOverlay(title, bodyHtml, buttonsHtml) → {overlay, panel}`, `closeMysteryEvent(overlay)`, `showDialogueSequence(lines, {title, onDone})`, `addLog`, `renderStatus`, `renderExplore`, `saveGame`, `showJesterTableEvent`, `showJesterShellEvent`, storage 내부 `storageAvailable/hasArtifactStorage/hasLocalStorage`.
- Produces: `JESTER_TRUTH_FRAGMENTS`(`[{title, lines}]` ×5), 전역 캐시 `let jesterTruthSeen`(number[]), `JESTER_DEN_GAMES`(`[{id, name, desc, start()}]`), `showJesterTruthRoom()`, `showJesterDen()`, storage `JESTERTRUTH_KEY`, `loadJesterTruth() → Promise<number[]>`, `addJesterTruth(idx) → Promise<number[]>`. `showJesterTableEvent(opts)`, `showJesterShellEvent(opts)`(`opts.den`).

- [ ] **Step 1: 영구 저장**

`js/storage.js` 머리 주석의 `SPECDEX_KEY, loadSpecDex, addToSpecDex,` 를 다음으로 교체:

```
              SPECDEX_KEY, loadSpecDex, addToSpecDex, JESTERTRUTH_KEY, loadJesterTruth, addJesterTruth,
```

`addToSpecDex` 함수가 끝나는 `return dex;\n  }` 다음, `// ---------- 업적` 주석 앞에:

```js
  // ---------- 진실의 조각(도박사 전용 숨겨진 장소, 본 조각 번호 배열 — 런이 끝나도 영구) ----------
  // js/jester-den.js가 시작 시 한 번 읽어 캐시(jesterTruthSeen)에 두고, 조각을 볼 때 여기에 추가한다.
  const JESTERTRUTH_KEY = 'jestertruth';
  async function loadJesterTruth(){
    if(!storageAvailable()) return [];
    try{
      if(hasArtifactStorage()){
        const res = await window.storage.get(JESTERTRUTH_KEY, false);
        if(res && res.value) return JSON.parse(res.value);
      } else if(hasLocalStorage()){
        const raw = window.localStorage.getItem(JESTERTRUTH_KEY);
        if(raw) return JSON.parse(raw);
      }
    }catch(e){ /* 기록 없음, 정상 */ }
    return [];
  }
  async function addJesterTruth(idx){
    const seen = await loadJesterTruth();
    if(seen.includes(idx)) return seen;
    seen.push(idx);
    const payload = JSON.stringify(seen);
    try{
      if(hasArtifactStorage()) await window.storage.set(JESTERTRUTH_KEY, payload, false);
      else if(hasLocalStorage()) window.localStorage.setItem(JESTERTRUTH_KEY, payload);
    }catch(e){ /* ignore */ }
    return seen;
  }
```

- [ ] **Step 2: `js/jester-den.js` 작성**

```js
"use strict";
/*
딜러의 장갑 — 숨겨진 장소 화면: 진실의 조각(이야기 칸) + 숨겨진 도박장.
설계: docs/superpowers/specs/2026-10-06-jester-hidden-places-design.md
export(전역): JESTER_TRUTH_FRAGMENTS, jesterTruthSeen, JESTER_DEN_GAMES, showJesterTruthRoom, showJesterDen
의존성: jester-shell.js(nextTruthIndex/JESTER_TRUTH_COUNT/pickDenTables), storage.js(loadJesterTruth/addJesterTruth),
       events.js(eventOverlay/closeMysteryEvent/showJesterTableEvent/showJesterShellEvent), ui/dialogue.js
주의: 진실의 조각은 "도박사만 아는 진실" — 주민들이 모르는 거래의 실상(story.md 2장)을 간접 서술로만 드러낸다.
     이름(아이온/아코스)은 쓰지 않는다. 왕자의 병상은 "잠긴 육아실"이 다루므로 쓰지 않는다.
*/

  const JESTER_TRUTH_FRAGMENTS = [
    {title:'봉인된 서신함', lines:[
      '먼지 쌓인 서신함. 왕실 문장이 찍힌 편지 한 통이, 보내지 못한 것처럼 다시 접혀 있다.',
      '「시간을 다룬다는 그대에게. 내 아이가 변해 가고 있소. 왕관이든 보물고든, 원하는 값을 말해 주시오.」',
      '여백에, 다른 필체로. 「값은 받지 않겠습니다. 제게도 지키고 싶은 사람이 있으니까요.」',
      '왕국을 바쳤다는 소문과는, 값부터가 달랐다.',
    ]},
    {title:'기사단 숙소의 침상', lines:[
      '기사단 숙소. 침상 하나만 유독 가지런하다. 벽에는 칼을 걸던 자국만 남았다 — 칼은 없다.',
      '머리맡에 보랏빛 실로 수놓은 손수건. 땀이 삐뚤빼뚤하다. 바늘을 처음 쥐어 본 손이다.',
      '베개 밑의 쪽지. 「그대가 마법을 끝내면, 이번엔 내가 그대를 지키겠소.」',
    ]},
    {title:'미완성 마법진', lines:[
      '바닥을 뒤덮은 거대한 마법진. 절반만 빛을 머금었고, 나머지 절반은 아직 분필 선이다.',
      '벽에 날짜를 센 금이 빼곡하다. 어느 날부터는 금이 두 줄씩 그어져 있다 — 하루를 이틀처럼 쓴 것처럼.',
      '「조금만 더.」 같은 글씨가, 갈수록 흐트러진 채 몇 번이고 적혀 있다.',
    ]},
    {title:'격리 병동의 침상', lines:[
      '봉쇄된 병동 맨 안쪽. 이불 위로 검은 얼룩이 번진 침상 하나. 곁에 칼을 세워 두었던 자국.',
      '머리맡의 모래시계는 모래가 전부 아래로 흘러내린 채 서 있다 — 이 회랑에서 유일하게, 끝까지 흐른 시간.',
      '창밖으로 탑 꼭대기가 보인다. 보랏빛이 새어 나온다. 마법은, 아직 끝나지 않았다.',
    ]},
    {title:'시계탑 꼭대기', lines:[
      '마법진이 남김없이 빛나고 있다. 완성된 것이다.',
      '그 한가운데, 누군가 오래 무릎 꿇었던 자국. 곁에 떨어진 보랏빛 손수건 — 숙소 침상에 있던 그것이다.',
      '탑 아래에서 종이 울렸고, 모든 것이 멈췄다. 한 걸음, 늦게.',
      '아무도 왕국을 팔지 않았다. 둘 다 각자의 하나를 붙들려 했고, 둘 다 놓쳤을 뿐이다.',
    ]},
  ];

  // 본 조각 번호(판 밖 영구 기록)의 캐시 — 엔딩(battle-end.js)이 동기적으로 읽는다.
  let jesterTruthSeen = [];
  if(typeof loadJesterTruth==='function'){
    loadJesterTruth().then(v=>{ jesterTruthSeen = Array.isArray(v) ? v : []; });
  }

  // 숨겨진 도박장 게임 등록부. 새 미니게임은 여기에 항목을 추가하는 것만으로 붙는다.
  const JESTER_DEN_GAMES = [
    {id:'table', name:'뒷골목 카드판', desc:'높다/낮다, 세 판을 내리 이기면 소매 속의 것을.', start:()=> showJesterTableEvent({den:true})},
    {id:'shell', name:'야바위 컵', desc:'섞이는 컵을 눈으로 따라간다. 세 판.', start:()=> showJesterShellEvent({den:true})},
  ];

  // 이야기 칸: 다음 조각을 화면 전에 기록하고(새로고침으로 잃지 않게), 최대HP 20% 회복.
  // 다섯 조각을 이미 다 봤으면(다른 캐릭터로 모은 경우 등) 도박장으로 대신 연다.
  function showJesterTruthRoom(){
    const idx = nextTruthIndex(jesterTruthSeen);
    if(idx<0){ showJesterDen(); return; }
    const frag = JESTER_TRUTH_FRAGMENTS[idx-1];
    jesterTruthSeen = jesterTruthSeen.concat([idx]);
    if(typeof addJesterTruth==='function') addJesterTruth(idx);
    const heal = Math.round(player.maxhp*0.2);
    player.hp = Math.min(player.maxhp, player.hp+heal);
    renderStatus(); saveGame();
    showDialogueSequence(frag.lines, {title:`🕯 ${frag.title}`, onDone: ()=>{
      addLog(`🕯 진실의 조각 ${idx}/${JESTER_TRUTH_COUNT} — ${frag.title}. (HP +${heal})`, 'gold');
      renderExplore([]);
    }});
  }

  // 숨겨진 도박장: 탁자 최대 2개 중 하나를 골라 한 판. 각 게임이 자기 판돈/지나가기 버튼을 가진다.
  function showJesterDen(){
    const tables = pickDenTables(JESTER_DEN_GAMES, 2);
    const {overlay, panel} = eventOverlay('숨겨진 도박장',
      `<p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 14px;">
        계단 끝, 촛불 하나 아래에 탁자들이 놓여 있다.<br>손만 남은 딜러가 소매를 걷으며 빈자리를 가리킨다.
      </p>`,
      `<div style="display:flex; flex-direction:column; gap:8px;">`
      + tables.map((g,i)=>`<button class="btn" data-den="${i}">${g.name}<br><span style="opacity:.7;font-size:11px;">${g.desc}</span></button>`).join('')
      + `<button class="btn" id="den-leave">그냥 나간다</button></div>`);
    panel.querySelectorAll('[data-den]').forEach(b=> b.addEventListener('click', ()=>{
      overlay.remove();
      tables[+b.dataset.den].start();
    }, {once:true}));
    panel.querySelector('#den-leave').addEventListener('click', ()=>{
      addLog('숨겨진 도박장을 그냥 나왔다.');
      closeMysteryEvent(overlay);
    }, {once:true});
  }
```

`index.html`의 `<script src="js/jester-shell.js"></script>` 다음 줄에 `<script src="js/jester-den.js"></script>`.

- [ ] **Step 3: 도박장 모드(`events.js`)**

`function showJesterShellEvent(){\n    player.jesterShellSeen = true;` 를:

```js
  function showJesterShellEvent(opts){
    // 숨겨진 도박장(js/jester-den.js)에서 열면 런당 1회 플래그를 세우지 않는다.
    const den = !!(opts && opts.den);
    if(!den) player.jesterShellSeen = true;
```

같은 함수의 도입 지문 `엎어진 컵 세 개와, 그 위를 맴도는 손. 손목 위로는 아무것도 없다.` 를:

```
${den ? '촛불 아래 탁자 위, 엎어진 컵 세 개. 손이 소매를 걷어 올린다.' : '엎어진 컵 세 개와, 그 위를 맴도는 손. 손목 위로는 아무것도 없다.'}
```

`function showJesterTableEvent(){\n    player.jesterTableSeen = true;` 를:

```js
  function showJesterTableEvent(opts){
    // 숨겨진 도박장(js/jester-den.js)에서 열면 런당 1회 플래그를 세우지 않는다.
    const den = !!(opts && opts.den);
    if(!den) player.jesterTableSeen = true;
```

같은 함수의 도입 지문 `회랑 한구석, 낡은 탁자 위에서 카드를 섞는 손이 있다. 손목 위로는 아무것도 없다.` 를:

```
${den ? '촛불 아래 탁자 위에서, 손이 카드를 섞고 있다.' : '회랑 한구석, 낡은 탁자 위에서 카드를 섞는 손이 있다. 손목 위로는 아무것도 없다.'}
```

(물음표 이벤트 풀은 `handlers.push(showJesterShellEvent)`처럼 인자 없이 호출하므로 기존 동작 그대로다.)

- [ ] **Step 4: 엔딩 장면(`battle-end.js`)**

`insertSpecEndingLines(lines, player.specialization, isWitch ? 'witch' : 'progenitor', player.name, isWitchRepeat);` 줄 다음에:

```js
      // 진실의 조각 다섯을 모두 본 도박사(js/jester-den.js) — 편지/손수건 장면을 더한다.
      if(player.job==='jester' && typeof truthComplete==='function' && typeof jesterTruthSeen!=='undefined' && truthComplete(jesterTruthSeen)){
        insertTruthEndingLines(lines, isWitch ? 'witch' : 'progenitor');
      }
```

- [ ] **Step 5: 확인**

Run: `node --check js/jester-den.js && node --check js/storage.js && node --check js/events.js && node --check js/combat/battle-end.js && node tests/jester-shell.test.js`
Expected: 오류 없음, `jester-shell: OK`.

- [ ] **Step 6: Commit**

```bash
git add js/jester-den.js js/storage.js index.html js/events.js js/combat/battle-end.js
git commit -m "진실의 조각/숨겨진 도박장 화면, 영구 기록(jestertruth), 도박장 모드, 엔딩 장면"
```

---

### Task 3: 노드맵 — 손자국, 드러남, 🕯 숨겨진 장소 노드

**Files:**
- Modify: `js/nodemap.js` (`NODE_TYPES`, `enterNodeMapTier`, `resolveNode`, `commitNodeSwap`, `renderNodeMapRows`)
- Modify: `index.html` (`.node-btn.node-swap-dim{...}` 줄 다음에 CSS)

**Interfaces:**
- Consumes: Task 1 `assignNodeSecret`, `resolveSecretSwap`, `rollSecretKind`; Task 2 `jesterTruthSeen`, `showJesterTruthRoom`, `showJesterDen`; 기존 `nodeSwapAvailable`, `showDialogueSequence`.
- Produces: `NODE_TYPES.secret`, `player.nodeSecret`, 노드 `type:'secret'`/`secretKind`, 클래스 `.node-secret`/`.node-marked`/`.node-secret-mark`.

- [ ] **Step 1: 노드 종류 + 구간 초기화 + 진입**

`NODE_TYPES`의 `midboss:{icon:'⏳', label:'???',        weight:0},` 다음 줄에:

```js
    // 딜러의 장갑으로 드러난 숨겨진 장소(js/jester-den.js) — 무작위 배정 풀에는 안 나온다.
    secret: {icon:'🕯', label:'숨겨진 장소', weight:0},
```

`enterNodeMapTier()`의 `player.nodeVisited = [];` 다음 줄에:

```js
    // 숨은 칸(딜러의 장갑) — 노드 id 형식이 구간마다 같아서 새 지도마다 반드시 비운다.
    player.nodeSecret = null;
```

`resolveNode()`의 `case 'event':` 블록(`break;`까지) 다음에:

```js
      case 'secret':
        addLog('촛불 하나가, 계단 아래를 비춘다.', 'gold');
        setTimeout(()=> node.secretKind==='story' ? showJesterTruthRoom() : showJesterDen(), 400);
        break;
```

- [ ] **Step 2: 드러남(`commitNodeSwap`)**

`commitNodeSwap`의 `player.nodeSwapTier = player.tierIndex;` 줄 다음에:

```js
    // 숨은 칸을 들었다면 그 자리가 숨겨진 장소가 된다(그 자리로 옮겨 오던 종류는 사라진다).
    const hit = resolveSecretSwap(a, b, player.nodeSecret);
    if(hit){
      hit.type = 'secret';
      hit.secretKind = rollSecretKind(typeof jesterTruthSeen!=='undefined' ? jesterTruthSeen : []);
      player.nodeSecret.found = true;
    }
```

같은 함수의 `saveGame();\n    refreshNodeMapOverlay();\n    renderNodeMapArea();` 를:

```js
    if(hit) addLog('🕯 숨겨진 장소를 찾았다.', 'gold');
    saveGame();
    refreshNodeMapOverlay();
    renderNodeMapArea();
    if(hit) showDialogueSequence(['들어 올린 자리 밑으로, 계단이 아래로 이어진다.', '숨겨진 장소를 찾았다.']);
```

- [ ] **Step 3: 손자국(`renderNodeMapRows`)**

`renderNodeMapRows` 위(함수 선언 바로 앞)에:

```js
  // 딜러의 장갑 — 바꿔치기를 쓸 수 있는 구간이면 숨은 칸을 정해 둔다(지연 배정). 정하자마자 저장해
  // 새로고침으로 위치를 다시 굴릴 수 없게 한다.
  function ensureNodeSecret(){
    if(player.nodeSecret || typeof nodeSwapAvailable!=='function' || !nodeSwapAvailable(player)) return;
    player.nodeSecret = assignNodeSecret(player.nodeMap, player.nodeRow);
    if(player.nodeSecret) saveGame();
  }
  // 칸 바닥에 찍힌 잿빛 손자국(index.html의 #dealer-hand 그림). 각도·위치·얼룩 질감을 칸 id에서
  // 정해서 다시 그려도 같은 자리에 같은 모양으로 남는다. 진짜/미끼는 겉으로 구분되지 않는다.
  function handprintSvg(id){
    let h = 0;
    for(const c of id) h = (h*31 + c.charCodeAt(0)) >>> 0;
    const rot = h%77 - 38, dx = (h>>>7)%19 - 9, dy = (h>>>12)%13 - 7, v = (h>>>17)%3;
    return `<svg class="node-secret-mark" viewBox="0 0 100 130" aria-hidden="true" style="--rot:${rot}deg; --dx:${dx}px; --dy:${dy}px">`
      + `<g filter="url(#dealer-smudge${v})"><use href="#dealer-hand"/></g></svg>`;
  }
```

`renderNodeMapRows`의 `const swapIds = nodeSwapMode ? ...` 줄 다음에:

```js
    ensureNodeSecret();
    const sec = player.nodeSecret;
    const markIds = (sec && !sec.found && nodeSwapAvailable(player)) ? new Set([sec.id, ...sec.decoys]) : null;
```

같은 함수의 `if(n.type==='midboss') cls += ' node-midboss';` 다음 줄에:

```js
        if(n.type==='secret') cls += ' node-secret';
        const marked = !!(markIds && markIds.has(n.id));
        if(marked) cls += ' node-marked';
```

칸 HTML의 `+ \`<span class="node-icon">${def.icon}</span><span class="node-label">${def.label}</span>\`` 를:

```js
          + `<span class="node-icon">${def.icon}</span><span class="node-label">${def.label}</span>`
          + (marked ? handprintSvg(n.id) : '')
```

- [ ] **Step 4: 손자국 그림 + CSS**

사용자 확정(미리보기 아티팩트 3판): 잿빛 손바닥이 칸 위에 비스듬히 찍힌 **희미한** 얼룩. 칸 바닥에 깔려
아이콘/글자를 가리지 않고, 아직 못 가는 줄에선 칸의 흐림(40%)을 같이 받는다. 깜빡임 없음.
게임 안 안내 문구는 발견 팝업/로그 외에 추가하지 않는다.

`index.html`의 `<script src="js/sound.js"></script>` 줄 바로 앞에(그림 원본 — 화면에 보이지 않는 정의):

```html
<!-- 딜러의 장갑 손자국 그림(js/nodemap.js handprintSvg). 손바닥+손가락 넷+엄지, 필터가 가장자리를
     번지게 하고(displacement) 군데군데 끊긴 얼룩(grain)을 만든다. 질감 3종은 seed만 다르다. -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <defs>
    <filter id="dealer-smudge0" x="-25%" y="-25%" width="150%" height="150%"><feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="3" result="warp"/><feDisplacementMap in="SourceGraphic" in2="warp" scale="8" xChannelSelector="R" yChannelSelector="G" result="rough"/><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3 0 0 0 -1.05" result="grain"/><feComposite in="rough" in2="grain" operator="in"/></filter>
    <filter id="dealer-smudge1" x="-25%" y="-25%" width="150%" height="150%"><feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="17" result="warp"/><feDisplacementMap in="SourceGraphic" in2="warp" scale="8" xChannelSelector="R" yChannelSelector="G" result="rough"/><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="29"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3 0 0 0 -1.05" result="grain"/><feComposite in="rough" in2="grain" operator="in"/></filter>
    <filter id="dealer-smudge2" x="-25%" y="-25%" width="150%" height="150%"><feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="41" result="warp"/><feDisplacementMap in="SourceGraphic" in2="warp" scale="8" xChannelSelector="R" yChannelSelector="G" result="rough"/><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="53"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3 0 0 0 -1.05" result="grain"/><feComposite in="rough" in2="grain" operator="in"/></filter>
    <symbol id="dealer-hand" viewBox="0 0 100 130">
      <path fill="currentColor" d="M22 64 Q19 100 35 117 Q52 128 70 118 Q85 104 82 68 Q66 57 51 59 Q35 57 22 64 Z"/>
      <rect fill="currentColor" x="23" y="20" width="14" height="48" rx="7" transform="rotate(-9 30 66)"/>
      <rect fill="currentColor" x="40" y="9" width="14" height="56" rx="7" transform="rotate(-2 47 64)"/>
      <rect fill="currentColor" x="56" y="15" width="13.5" height="51" rx="6.8" transform="rotate(6 63 64)"/>
      <rect fill="currentColor" x="70" y="32" width="12" height="39" rx="6" transform="rotate(14 76 68)"/>
      <rect fill="currentColor" x="6" y="62" width="14" height="38" rx="7" transform="rotate(-40 18 92)"/>
    </symbol>
  </defs>
</svg>
```

`index.html`의 `.node-btn.node-swap-dim{opacity:.3;}` 다음 줄에:

```css
  /* 숨은 칸 손자국(진짜 1 + 미끼 2, 겉으로 구분 없음)과 드러난 숨겨진 장소(js/nodemap.js).
     손자국은 칸 바닥의 얼룩 — 아이콘/글자를 그 위로 올려 가리지 않는다. */
  .node-btn .node-icon, .node-btn .node-label{position:relative; z-index:1;}
  .node-btn.node-marked{position:relative;}
  .node-secret-mark{position:absolute; left:50%; top:50%; width:50px; height:65px; color:#e2d6bb; opacity:.42;
    pointer-events:none; z-index:0; mix-blend-mode:screen;
    transform:translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) rotate(var(--rot));}
  .node-btn.node-secret{border-color:#b48cff; box-shadow:0 0 10px #b48cff66;}
```

- [ ] **Step 5: 확인**

Run: `node --check js/nodemap.js && node tests/jester-shell.test.js`
Expected: 오류 없음, `jester-shell: OK`.

- [ ] **Step 6: Commit**

```bash
git add js/nodemap.js index.html
git commit -m "딜러의 장갑 숨은 칸 — 손자국 3칸, 들어 올리면 숨겨진 장소로 드러남, 🕯 노드 진입"
```

---

### Task 4: 헤드리스 실전 확인 + 문서

**Files:**
- Create(스크래치패드, 커밋 안 함): `<scratchpad>/verify-hidden-places.js`
- Modify: `story.md`(6장 서사 전달 장치에 행 추가), `CURRENT_STATUS.md`

- [ ] **Step 1: 확인 스크립트**

playwright-core는 `C:/Users/HYGOOD/AppData/Local/Temp/claude/c--dc-dungeon-crawler/76fa3d21-599e-496a-a6e0-dae103154824/scratchpad/node_modules/playwright-core`에 있다(저장소엔 node_modules 없음).

`<scratchpad>/verify-hidden-places.js`:

```js
const { chromium } = require('C:/Users/HYGOOD/AppData/Local/Temp/claude/c--dc-dungeon-crawler/76fa3d21-599e-496a-a6e0-dae103154824/scratchpad/node_modules/playwright-core');
(async()=>{
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page = await browser.newPage({viewport:{width:400, height:780}});
  const errors = [];
  page.on('pageerror', e=> errors.push(String(e)));
  page.on('console', m=>{ if(m.type()==='error') errors.push(m.text()); });
  await page.goto('file:///C:/dc/dungeon-crawler/index.html');
  await page.evaluate(()=> localStorage.removeItem('jestertruth'));
  await page.reload();
  await page.waitForTimeout(600);
  const W = ms=> page.waitForTimeout(ms);
  const ev = (fn, arg)=> page.evaluate(fn, arg);
  const r = {};
  // 대화창은 줄만 기록하고 바로 넘긴다
  await ev(()=>{ window.__dlg = []; window.showDialogueSequence = (lines, opts)=>{ window.__dlg.push(lines); if(opts && opts.onDone) opts.onDone(); }; });
  const setupMap = ()=> ev(()=>{
    document.querySelectorAll('.shop-overlay').forEach(o=>o.remove());
    player = newPlayer('테스터', 'jester', 'normal'); town = false; depth = 21;
    player.tierIndex = 2; player.relics = ['relic_dealerglove']; player.relicSlots = 3;
    player.nodeMap = [
      [{id:'t2r0n0', type:'combat', connections:['t2r1n0','t2r1n1']}],
      [{id:'t2r1n0', type:'shop', connections:['t2r2n0']}, {id:'t2r1n1', type:'event', connections:['t2r2n1']}],
      [{id:'t2r2n0', type:'elite', connections:['t2boss']}, {id:'t2r2n1', type:'rest', connections:['t2boss']}],
      [{id:'t2boss', type:'boss', connections:[]}],
    ];
    player.nodeRow = 0; player.nodeCurrentId = 't2r0n0'; player.nodeVisited = ['t2r0n0']; player.nodeSecret = null;
    showScreen('explore'); renderExplore([]);
    document.getElementById('node-map-open').click();
  });
  const swap = (x, y)=> ev(([x, y])=>{
    document.querySelector('#node-swap-bar #node-swap-btn').click();
    document.querySelector(`[data-swap="${x}"]`).click();
    document.querySelector(`[data-swap="${y}"]`).click();
  }, [x, y]);

  // 1) 손자국 3칸 + 저장
  await setupMap();
  r.marks = await ev(()=> document.querySelectorAll('.node-secret-mark').length); // 3
  r.secretInMarks = await ev(()=> [...document.querySelectorAll('.node-marked')].map(b=>b.dataset.nodeid).includes(player.nodeSecret.id));
  await W(600);
  r.secretSaved = await ev(()=>{ const s = JSON.parse(localStorage.getItem('savegame')); return !!(s.player.nodeSecret && s.player.nodeSecret.id); });

  // 2) 진짜를 들어 올림 → 그 자리가 숨겨진 장소, 팝업, 로그
  const sid = await ev(()=> player.nodeSecret.id);
  const partner = await ev(sid=> ['t2r1n0','t2r1n1','t2r2n0','t2r2n1'].find(id=> id!==sid), sid);
  await swap(sid, partner); await W(900);
  r.revealedType = await ev(sid=> { for(const row of player.nodeMap) for(const n of row) if(n.id===sid) return n.type; }, sid); // 'secret'
  r.kindStored = await ev(sid=> { for(const row of player.nodeMap) for(const n of row) if(n.id===sid) return n.secretKind; }, sid);
  r.foundFlag = await ev(()=> player.nodeSecret.found);
  r.popup = await ev(()=> JSON.stringify(window.__dlg[window.__dlg.length-1]));
  r.foundLog = await ev(()=> [...document.querySelectorAll('#ex-log .entry')].some(e=> e.textContent.includes('숨겨진 장소를 찾았다')));
  r.marksGone = await ev(()=> document.querySelectorAll('.node-secret-mark').length===0);
  r.secretNotSwappable = await ev(sid=> !nodeSwapCandidates(player.nodeMap, -1).some(n=>n.id===sid), sid);
  await page.screenshot({path:'hp-revealed.png'});

  // 3) 이야기 칸 → 조각 ①, HP 회복, 영구 기록 → 다음은 ②
  r.story1 = await ev(sid=>{
    let node; for(const row of player.nodeMap) for(const n of row) if(n.id===sid) node = n;
    node.secretKind = 'story';
    document.querySelectorAll('.shop-overlay').forEach(o=>o.remove());
    player.hp = 10; window.__dlg = [];
    resolveNode(node);
    return node.id;
  }, sid);
  await W(700);
  r.story1First = await ev(()=> window.__dlg[0] && window.__dlg[0][0]);
  r.story1Heal = await ev(()=> player.hp > 10);
  r.cache1 = await ev(()=> jesterTruthSeen.slice());
  r.stored1 = await ev(()=> localStorage.getItem('jestertruth'));
  r.story2First = await ev(()=>{ window.__dlg = []; showJesterTruthRoom(); return window.__dlg[0][0]; });

  // 4) 도박장 → 탁자 2개, 카드판 한 판(도박장 모드는 플래그 불변), 물음표 이벤트 경로는 플래그 세움
  r.den = await ev(()=>{
    document.querySelectorAll('.shop-overlay').forEach(o=>o.remove());
    player.jesterTableSeen = false; player.jesterShellSeen = false; player.gold = 500;
    showJesterDen();
    const btns = [...document.querySelectorAll('[data-den]')];
    const names = btns.map(b=>b.textContent);
    btns.find(b=> b.textContent.includes('카드판') || b.textContent.includes('야바위')).click();
    const opened = document.querySelector('#mystery-event-overlay h3').textContent;
    return {count: btns.length, names, opened, tableSeen: player.jesterTableSeen, shellSeen: player.jesterShellSeen};
  });
  r.eventPathSetsFlag = await ev(()=>{
    document.querySelectorAll('.shop-overlay').forEach(o=>o.remove());
    player.jesterTableSeen = false; showJesterTableEvent();
    const v = player.jesterTableSeen;
    document.querySelectorAll('.shop-overlay').forEach(o=>o.remove());
    return v;
  });

  // 5) 다섯 조각 다 본 뒤의 이야기 칸 → 도박장 폴백
  r.fallbackDen = await ev(()=>{
    jesterTruthSeen = [1,2,3,4,5];
    document.querySelectorAll('.shop-overlay').forEach(o=>o.remove());
    showJesterTruthRoom();
    const t = document.querySelector('#mystery-event-overlay h3');
    const v = t && t.textContent.includes('숨겨진 도박장');
    document.querySelectorAll('.shop-overlay').forEach(o=>o.remove());
    return v;
  });
  r.allDoneRollsDen = await ev(()=> rollSecretKind(jesterTruthSeen, ()=>0));

  // 6) 미끼만 든 바꿔치기 → 비밀 칸 없음, 손자국 사라짐
  await setupMap();
  const decoys = await ev(()=> player.nodeSecret.decoys);
  const sid2 = await ev(()=> player.nodeSecret.id);
  const others = ['t2r1n0','t2r1n1','t2r2n0','t2r2n1'].filter(id=> id!==sid2);
  await ev(()=> document.querySelectorAll('.shop-overlay').forEach(o=>o.remove()));
  await ev(()=> document.getElementById('node-map-open').click());
  await swap(others[0], others[1]); await W(900);
  r.missNoSecret = await ev(()=> !player.nodeMap.some(row=> row.some(n=> n.type==='secret')));
  r.missMarksGone = await ev(()=> document.querySelectorAll('.node-secret-mark').length===0);
  r.decoyCount = decoys.length; // 2

  // 7) 새 구간 지도 → nodeSecret 초기화
  r.resetOnNewTier = await ev(()=>{
    document.querySelectorAll('.shop-overlay').forEach(o=>o.remove());
    player.tierIndex = 1; enterNodeMapTier();
    return player.nodeSecret===null;
  });

  // 8) 엔딩 장면: 도박사 + 다섯 조각 → 추가, 비도박사 → 없음
  const endingLines = (job, type)=> ev(([job, type])=>{
    document.querySelectorAll('.shop-overlay,.dialogue-overlay').forEach(o=>o.remove());
    window.__dlg = [];
    window.showDialogueSequence = (lines)=>{ window.__dlg.push(lines); };
    player = newPlayer('테스터', job, 'normal'); player.deathCount = 0;
    jesterTruthSeen = [1,2,3,4,5];
    enemy = {type, name:'x'};
    showEnding(true);
    return window.__dlg[0].map(l=> typeof l==='string' ? l : l.text);
  }, [job, type]);
  const prog = await endingLines('jester', 'progenitor');
  const anchor = prog.findIndex(l=> l.includes('하나를 지키지 못했다'));
  r.progInserted = prog[anchor+1]==='서신함에서 찾은 편지를, 왕 앞에 내려놓는다.' && prog[anchor+2]==='"…그걸, 읽었나."';
  const witch = await endingLines('jester', 'timewitch');
  r.witchInserted = witch[1]==='보랏빛 손수건을 내민다.';
  const nonJester = await endingLines('warrior', 'progenitor');
  r.nonJesterClean = !nonJester.some(l=> l.includes('서신함'));

  console.log(JSON.stringify(r, null, 2));
  console.log('NON-AUDIO ERRORS:', errors.filter(e=> !/CORS|ERR_FAILED/.test(e)));
  await browser.close();
})();
```

- [ ] **Step 2: 실행 + 스크린샷 확인**

Run: `cd "<scratchpad>" && node verify-hidden-places.js`
Expected:
- `marks:3`, `secretInMarks:true`, `secretSaved:true`
- `revealedType:'secret'`, `kindStored`는 `'story'` 또는 `'den'`, `foundFlag:true`, `popup`에 "숨겨진 장소를 찾았다", `foundLog:true`, `marksGone:true`, `secretNotSwappable:true`
- `story1First`가 "먼지 쌓인 서신함."으로 시작, `story1Heal:true`, `cache1:[1]`, `stored1:"[1]"`, `story2First`가 "기사단 숙소."로 시작
- `den.count:2`, `den.opened`가 "❓ 뒷골목 카드판" 또는 "❓ 야바위 컵", `den.tableSeen:false`, `den.shellSeen:false`, `eventPathSetsFlag:true`
- `fallbackDen:true`, `allDoneRollsDen:'den'`
- `missNoSecret:true`, `missMarksGone:true`, `decoyCount:2`
- `resetOnNewTier:true`
- `progInserted:true`, `witchInserted:true`, `nonJesterClean:true`
- `NON-AUDIO ERRORS: []`
- `hp-revealed.png`를 Read로 열어 🕯 칸이 보라 테두리로 보이는지 확인.

실패 항목이 있으면 해당 Task로 돌아가 고친다.

- [ ] **Step 3: 문서**

`story.md` 6장 표(`| 물음표 이벤트 | ...`) 바로 다음 줄에 행 추가:

```
| 진실의 조각(도박사 전용) | `jester-den.js` | 딜러의 장갑 바꿔치기로 손자국 3칸 중 진짜 숨은 칸을 들어 올리면 드러나는 🕯 숨겨진 장소. 이야기 칸이면 "거래의 진실" 5조각(봉인된 서신함/기사단 숙소의 침상/미완성 마법진/격리 병동의 침상/시계탑 꼭대기)을 발견 순서대로 하나씩 — 왕의 부탁과 대가 없음, 두 사람의 관계, 마법이 완성되기 전의 공백을 이름 없이 드러낸다. 판을 넘어 영구 기록(`jestertruth`), 다 모은 도박사는 시조/아이온 엔딩에 편지·손수건 장면이 더해진다. 숨겨진 도박장이면 카드판·야바위를 런 제한 없이 한 판 |
```

`CURRENT_STATUS.md`의 `## 최근 작업 (이번 세션 — 도박사 전용 이벤트 "야바위 컵" + 유물 "딜러의 장갑")`의 "이번 세션"을 "이전 세션"으로 바꾸고 그 위에:

```markdown
## 최근 작업 (이번 세션 — 딜러의 장갑 숨겨진 장소: 진실의 조각 + 숨겨진 도박장)

- 설계: `docs/superpowers/specs/2026-10-06-jester-hidden-places-design.md`,
  계획: `docs/superpowers/plans/2026-10-06-jester-hidden-places.md`
- 장갑 보유 구간이면 바꿀 수 있는 칸 중 하나 밑에 비밀(`player.nodeSecret`, 지연 배정 즉시 저장).
  전체 지도에 잿빛 손자국 3칸(진짜 1 + 미끼 2, 희미하게 칸 바닥에). 바꿔치기로 진짜를 들면 그 자리가 🕯 `type:'secret'`
  (옮겨 오던 종류는 사라짐) + 발견 팝업. 종류는 드러날 때 굴려 칸에 저장(조각 남음: 이야기 60/도박장 40).
- 이야기 칸: 진실의 조각 ①~⑤를 발견 순서대로(`js/jester-den.js`), 화면 전에 영구 기록(`jestertruth`),
  최대HP 20% 회복. 다 본 뒤엔 도박장 폴백. 다 모은 도박사는 시조/아이온 엔딩에 장면 추가.
- 숨겨진 도박장: 등록부 `JESTER_DEN_GAMES`에서 탁자 2개, 한 판. 카드판/야바위는 `{den:true}`로 열려
  런당 1회 플래그를 세우지 않는다. 2차 이후 새 게임(쥐 경주/스물하나/도둑잡기/홀덤)은 등록부에 추가.
- 헤드리스 Chrome 확인: <Step 2 결과 요약>
- 미검증: 실제 플레이 체감(손자국 찍기 난이도, 조각 문구의 몰입감).
```

- [ ] **Step 4: Commit**

```bash
git add story.md CURRENT_STATUS.md
git commit -m "숨겨진 장소(진실의 조각/숨겨진 도박장) 문서 반영"
```
