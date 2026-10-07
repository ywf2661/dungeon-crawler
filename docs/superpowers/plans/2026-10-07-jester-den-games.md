# 숨겨진 도박장 2차 (쥐 경주 + 도둑잡기 + 벼랑 끝의 촛불 + admin7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 숨겨진 도박장에 도박장 전용 게임 2개(쥐 경주, 도둑잡기)와 대승 보상 유물 "벼랑 끝의 촛불", 테스트 모드 admin7을 붙인다.

**Architecture:** 순수 로직(쥐 이동/배당/정산, 도둑잡기 패/뽑기/반응, 공통 보상 판정, 촛불 보너스)은 새 파일 `js/jester-den-games.js`에 DOM 없이 두고 node vm 단위 테스트로 고정한다. 화면·공통 정산은 도박장 화면이 이미 있는 `js/jester-den.js`, CSS는 `index.html`. 유물은 `relics.js`에 정의하고 운 스킬 4곳이 보너스를 더한다.

**Tech Stack:** Vanilla JS(classic `<script>`, 공유 전역), CSS, Node `vm`+`assert`, 헤드리스 Chrome(playwright-core + 시스템 Chrome).

**Spec:** `docs/superpowers/specs/2026-10-07-jester-den-games-design.md`

## Global Constraints

- 판돈 `30 + 층×3`, 황금 도박사(`jester_goldbet`) 2배 — 기존 `jesterTableStake(player, depth)`를 그대로 쓴다.
- 판돈을 내는 순간 `saveGame()`.
- 도박장은 등록부(`JESTER_DEN_GAMES`) 4개 중 무작위 2개(`pickDenTables` 그대로).
- 승리 보상: 골드 + 현물 1개(물약/강화석/인장 조각 무작위). 대승이면 50%로 `relic_edgecandle`(이미 있으면 판돈×2 골드).
- 촛불: HP ≤ 최대HP×30%일 때 운 스킬 4종 성공 확률 +0.2, 기존 상한 유지. `eventOnly:true`, `dexOptional:true`.
- 이름(아이온/아코스) 직접 노출 금지, 딜러는 "손만 남은 딜러".
- preserve-3d 카드(`.jt-card`)에 filter/opacity를 직접 걸지 않는다(앞뒷면 `> div`에만).
- "쌓았다 터뜨리는" 구조 금지.

## Review Focus

- 골드가 판돈보다 적을 때 쥐 고르기/앉기/판돈 올리기 버튼이 비활성인지 — 음수 골드 방지(Task 4·5 헤드리스 확인).
- 연출 중 연타(버튼/카드 클릭)로 두 번 정산되지 않는지 — 버튼은 클릭 즉시 비우고, 도둑잡기는 `phase`로 막는다(Task 4·5).
- 유물 슬롯이 가득 찬 상태에서 촛불 획득 → 교체 화면(Task 4 `grantDenPrize`, 헤드리스 Task 7).
- 오버레이가 닫힌 뒤 남은 타이머가 DOM을 만지지 않는지 — `later()`가 `overlay.isConnected`를 확인(Task 4·5).
- 도둑잡기에서 딜러 패가 1장일 때 "다른 걸 뽑는다"가 안 나오는지(Task 5).

---

### Task 1: 쥐 경주 순수 로직

**Files:**
- Create: `js/jester-den-games.js`
- Test: `tests/jester-den-games.test.js`

**Interfaces:**
- Produces: `RAT_TRACK=12`, `RAT_HALF=6`, `RAT_KINDS{id:{name,desc,move}}`, `denShuffle(list, r)`, `ratLineup(rng)→string[4]`, `ratCrumbs(rng)→number[2]`, `ratNewRace(lineup, crumbs)→state`, `ratStep(state, rng)→{half, finished}`(state.winner 설정), `ratOdds(lineup, crumbs, rng, n)→number[4]`, `ratPayout(stake, odds, {won, raised, cashedOut})→number`.

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/jester-den-games.test.js` 첫 부분(쥐):

```js
"use strict";
// 실행: node tests/jester-den-games.test.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = vm.createContext({console, Math});
vm.runInContext(fs.readFileSync('js/jester-den-games.js','utf8'), ctx, {filename:'js/jester-den-games.js'});
const run = code => vm.runInContext(code, ctx);
const J = x => JSON.parse(JSON.stringify(x));
const seq = (...v)=>{ let i=0; return ()=> v[i++ % v.length]; };
let seed = 12345; const lcg = ()=>{ seed = (seed*1103515245 + 12345) % 2147483648; return seed/2147483648; };

// ── 쥐 경주 ──
assert.strictEqual(run('RAT_TRACK'), 12);
assert.strictEqual(run('RAT_HALF'), 6);
const kinds = J(run('Object.keys(RAT_KINDS)'));
assert.deepStrictEqual(kinds, ['gray','coward','late','plague','glutton','tailer']);
for(let i=0;i<200;i++){ const L = J(ctx.ratLineup()); assert.strictEqual(new Set(L).size, 4); assert.ok(L.every(k=>kinds.includes(k))); }
for(let i=0;i<300;i++){ const c = J(ctx.ratCrumbs()); assert.strictEqual(c.length, 2); assert.ok(c[0]<c[1] && c[0]>=2 && c[1]<=10); }

// 회색 꼬리: 0.5 → 2칸
let st = ctx.ratNewRace(['gray','gray','gray','gray'], []);
assert.deepStrictEqual(J(ctx.ratStep(st, seq(0.5))), {half:false, finished:false});
assert.deepStrictEqual(J(st.rats.map(r=>r.pos)), [2,2,2,2]);
ctx.ratStep(st, seq(0.7)); // 0.7 → 1칸
assert.deepStrictEqual(J(st.rats.map(r=>r.pos)), [3,3,3,3]);

// 겁쟁이: 뒤에 있던 역병쥐가 앞지르면 다음 틱 멈칫. 이 틱에 선두가 6을 넘어 반환점 보고.
st = ctx.ratNewRace(['coward','plague','gray','gray'], []);
st.rats[0].pos = 5; st.rats[1].pos = 4;
assert.deepStrictEqual(J(ctx.ratStep(st, seq(0.9, 0.1, 0.9, 0.9))), {half:true, finished:false});
assert.deepStrictEqual(J(st.rats.map(r=>r.pos)), [6,7,1,1]);
assert.strictEqual(st.rats[0].scared, true);
ctx.ratStep(st, seq(0.1)); // 겁쟁이 0칸(난수 안 씀), 역병쥐 3칸, 회색 2칸씩
assert.deepStrictEqual(J(st.rats.map(r=>r.pos)), [6,10,3,3]);
assert.strictEqual(st.rats[0].scared, false, '다시 추월당하지 않았으면 풀림');

// 늦둥이: 6칸 전 1칸(0.5) / 이후 2칸(0.5) / 이후 3칸(0.1)
st = ctx.ratNewRace(['late','gray','gray','gray'], []);
ctx.ratStep(st, seq(0.5, 0.9, 0.9, 0.9)); assert.strictEqual(st.rats[0].pos, 1);
st.rats[0].pos = 6; ctx.ratStep(st, seq(0.5, 0.9, 0.9, 0.9)); assert.strictEqual(st.rats[0].pos, 8);
ctx.ratStep(st, seq(0.1, 0.9, 0.9, 0.9)); assert.strictEqual(st.rats[0].pos, 11);

// 역병쥐: 0.1 → 3, 0.3 → 0, 0.9 → 1
st = ctx.ratNewRace(['plague','gray','gray','gray'], []);
ctx.ratStep(st, seq(0.1, 0.9, 0.9, 0.9)); assert.strictEqual(st.rats[0].pos, 3);
ctx.ratStep(st, seq(0.3, 0.9, 0.9, 0.9)); assert.strictEqual(st.rats[0].pos, 3);
ctx.ratStep(st, seq(0.9, 0.9, 0.9, 0.9)); assert.strictEqual(st.rats[0].pos, 4);

// 먹보: 3칸 가려다 부스러기(3)에서 멈추고 다음 틱은 쉰다, 부스러기 소비
st = ctx.ratNewRace(['glutton','gray','gray','gray'], [3, 9]);
st.rats[0].pos = 1;
ctx.ratStep(st, seq(0.1, 0.9, 0.9, 0.9));
assert.strictEqual(st.rats[0].pos, 3); assert.deepStrictEqual(J(st.crumbs), [9]); assert.strictEqual(st.rats[0].eating, 1);
ctx.ratStep(st, seq(0.9)); assert.strictEqual(st.rats[0].pos, 3, '먹느라 쉰다');
ctx.ratStep(st, seq(0.9)); assert.strictEqual(st.rats[0].pos, 5, '0.9 → 2칸');

// 따라쟁이: 선두 1~2칸 뒤면 0.5 확률로 +1
st = ctx.ratNewRace(['tailer','gray','gray','gray'], []);
st.rats[0].pos = 4; st.rats[1].pos = 5;
ctx.ratStep(st, seq(0.9, 0.1, 0.9, 0.9, 0.9)); assert.strictEqual(st.rats[0].pos, 6);
st = ctx.ratNewRace(['tailer','gray','gray','gray'], []);
st.rats[0].pos = 1; st.rats[1].pos = 5;
ctx.ratStep(st, seq(0.9)); assert.strictEqual(st.rats[0].pos, 2, '멀면 보너스 없음');

// 발 걸기: 그 틱 0칸, 난수 안 씀, 풀림
st = ctx.ratNewRace(['gray','gray','gray','gray'], []);
st.rats[0].tripped = true;
ctx.ratStep(st, seq(0.5));
assert.deepStrictEqual(J(st.rats.map(r=>r.pos)), [0,2,2,2]); assert.strictEqual(st.rats[0].tripped, false);

// 결승: 같은 틱 동착이면 더 멀리 간 쥐, 같으면 난수. 결승 틱엔 반환점 보고 안 함.
st = ctx.ratNewRace(['gray','gray','gray','gray'], []);
st.rats[0].pos = 11; st.rats[1].pos = 11;
assert.deepStrictEqual(J(ctx.ratStep(st, seq(0.5, 0.5, 0.9, 0.9, 0.9))), {half:false, finished:true});
assert.strictEqual(st.winner, 1, '13·13 동착 → 0.9로 두 번째');
st = ctx.ratNewRace(['gray','gray','gray','gray'], []);
st.rats[0].pos = 11; st.rats[1].pos = 11;
ctx.ratStep(st, seq(0.5, 0.9, 0.9, 0.9, 0.0)); // 13 vs 12
assert.strictEqual(st.winner, 0);

// 배당: 4개, 1.2~30, 소수 첫째 자리, 내재 확률 합이 대략 0.9~1.1
const odds = J(ctx.ratOdds(['gray','coward','late','plague'], [3,8], lcg, 600));
assert.strictEqual(odds.length, 4);
odds.forEach(o=>{ assert.ok(o>=1.2 && o<=30, String(o)); assert.ok(Math.abs(o*10 - Math.round(o*10)) < 1e-9); });
const implied = odds.reduce((s,o)=> s + 0.92/o, 0);
assert.ok(implied > 0.85 && implied < 1.15, String(implied));

// 정산
assert.strictEqual(ctx.ratPayout(60, 3.5, {won:true}), 210);
assert.strictEqual(ctx.ratPayout(60, 3.5, {won:true, raised:true}), 420);
assert.strictEqual(ctx.ratPayout(60, 3.5, {cashedOut:true}), 30);
assert.strictEqual(ctx.ratPayout(60, 3.5, {won:false}), 0);
assert.strictEqual(ctx.ratPayout(61, 1.5, {won:true}), 91, '내림');

console.log('jester-den-games: OK');
```

- [ ] **Step 2: 실패 확인** — `node tests/jester-den-games.test.js` → ENOENT(파일 없음).

- [ ] **Step 3: 구현** — `js/jester-den-games.js`:

```js
"use strict";
/*
숨겨진 도박장 전용 게임 — 쥐 경주 + 도둑잡기 + 공통 보상 판정 + 도박장 유물 "벼랑 끝의 촛불" 보너스. 순수 로직.
설계: docs/superpowers/specs/2026-10-07-jester-den-games-design.md
export(전역): RAT_TRACK, RAT_HALF, RAT_KINDS, denShuffle, ratLineup, ratCrumbs, ratNewRace, ratStep, ratOdds, ratPayout,
       THIEF_JOKER, thiefDeal, thiefTake, thiefWinner, thiefTell, thiefDealerPick, thiefPayout,
       DEN_PRIZE_KINDS, pickDenPrizeKind, denRelicRoll, EDGE_CANDLE_RELIC, getLowHpLuckBonus
주의: 화면은 jester-den.js(showRatRace/showThiefGame). 이 파일은 DOM을 만지지 않는다
     (tests/jester-den-games.test.js가 node vm으로 바로 불러 쓴다). 난수는 전부 rng 인자(없으면 Math.random).
*/

  function denShuffle(list, r){
    const a = list.slice();
    for(let i=a.length-1;i>0;i--){ const j = Math.floor(r()*(i+1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // ── 쥐 경주 ──
  const RAT_TRACK = 12, RAT_HALF = 6;
  // 성격 6종. move(rat, lead, r) = 이번 틱에 갈 칸 수(멈칫·먹기·발 걸기는 ratStep이 따로 처리).
  // lead는 틱 시작 시점의 선두 위치. 수치는 설계 문서 시뮬레이션(출전 시 승률 16~34%) 기준.
  const RAT_KINDS = {
    gray:    {name:'회색 꼬리', desc:'꾸준하다', move:(rat, lead, r)=> r()<0.6 ? 2 : 1},
    coward:  {name:'겁쟁이', desc:'빠르지만 추월당하면 겁먹는다', move:(rat, lead, r)=> r()<0.6 ? 2 : 1},
    late:    {name:'늦둥이', desc:'막판에 달린다', move:(rat, lead, r)=> rat.pos < RAT_HALF ? (r()<0.1 ? 2 : 1) : (r()<0.45 ? 3 : 2)},
    plague:  {name:'역병쥐', desc:'기복이 심하다', move:(rat, lead, r)=>{ const x = r(); return x<0.25 ? 3 : x<0.5 ? 0 : 1; }},
    glutton: {name:'먹보', desc:'부스러기를 보면 멈춘다', move:(rat, lead, r)=> r()<0.3 ? 3 : 2},
    tailer:  {name:'따라쟁이', desc:'선두에 붙어 간다', move:(rat, lead, r)=>{
      const near = rat.pos < lead && lead - rat.pos <= 2;
      return (r()<0.3 ? 2 : 1) + (near && r()<0.5 ? 1 : 0);
    }},
  };
  // 출전 쥐 4마리(중복 없음).
  function ratLineup(rng){ return denShuffle(Object.keys(RAT_KINDS), rng || Math.random).slice(0, 4); }
  // 부스러기 2개: 2~10칸 중 서로 다른 두 칸(오름차순). 먹보만 반응한다.
  function ratCrumbs(rng){
    const r = rng || Math.random, out = [];
    while(out.length < 2){ const s = 2 + Math.floor(r()*9); if(!out.includes(s)) out.push(s); }
    return out.sort((a,b)=>a-b);
  }
  function ratNewRace(lineup, crumbs){
    return {rats: lineup.map(kind=>({kind, pos:0, scared:false, eating:0, tripped:false})),
            crumbs: (crumbs||[]).slice(), tick:0, halfDone:false, winner:-1};
  }
  // 한 틱 진행(상태를 직접 바꾼다). 반환 {half: 이번 틱에 처음 반환점을 넘었나(결승 틱이면 false), finished}.
  // 먹는 중 → 0칸, 발 걸림·겁먹음 → 0칸(이번 틱에 풀림). 먹보는 남은 부스러기 칸을 지나치려 하면 그 칸에
  // 멈추고 다음 틱은 먹느라 쉰다(부스러기 소비). 겁쟁이는 틱 시작 때 뒤였던 쥐가 틱 끝에 앞서면 다음 틱 멈칫.
  function ratStep(state, rng){
    const r = rng || Math.random;
    const before = state.rats.map(x=>x.pos);
    const lead = Math.max(...before);
    state.tick++;
    state.rats.forEach(rat=>{
      let mv;
      if(rat.eating > 0){ rat.eating--; mv = 0; }
      else if(rat.tripped || rat.scared) mv = 0;
      else mv = RAT_KINDS[rat.kind].move(rat, lead, r);
      rat.tripped = false; rat.scared = false;
      if(rat.kind==='glutton' && mv > 0){
        for(let s=rat.pos+1; s<=rat.pos+mv; s++){
          const ci = state.crumbs.indexOf(s);
          if(ci >= 0){ state.crumbs.splice(ci, 1); mv = s - rat.pos; rat.eating = 1; break; }
        }
      }
      rat.pos += mv;
    });
    state.rats.forEach((rat, i)=>{
      if(rat.kind!=='coward') return;
      if(state.rats.some((o, j)=> j!==i && before[j] < before[i] && o.pos > rat.pos)) rat.scared = true;
    });
    const done = state.rats.map((x, i)=>i).filter(i=> state.rats[i].pos >= RAT_TRACK);
    if(done.length){
      const best = Math.max(...done.map(i=> state.rats[i].pos));
      const tied = done.filter(i=> state.rats[i].pos===best);
      state.winner = tied[Math.floor(r()*tied.length)];
      return {half:false, finished:true};
    }
    if(!state.halfDone && Math.max(...state.rats.map(x=>x.pos)) >= RAT_HALF){
      state.halfDone = true;
      return {half:true, finished:false};
    }
    return {half:false, finished:false};
  }
  // 그 4마리 + 그 부스러기로 n번 미리 돌려 배당을 정한다: max(1.2, ⌊0.92/p×10⌋/10), 상한 30(한 번도 못 이김).
  function ratOdds(lineup, crumbs, rng, n){
    const r = rng || Math.random, N = n || 2000, wins = lineup.map(()=>0);
    for(let k=0;k<N;k++){
      const st = ratNewRace(lineup, crumbs);
      while(!ratStep(st, r).finished){ /* 회색 꼬리 등은 매 틱 1칸 이상이라 반드시 끝난다 */ }
      wins[st.winner]++;
    }
    return wins.map(w=> w ? Math.min(30, Math.max(1.2, Math.floor(0.92/(w/N)*10)/10)) : 30);
  }
  // 수령액(낸 판돈 포함). 절반 빼기 = 판돈 절반(내림), 승리 = 판돈×(올렸으면 2)×배당(내림), 패배 = 0.
  function ratPayout(stake, odds, o){
    if(o.cashedOut) return Math.floor(stake*0.5);
    if(!o.won) return 0;
    return Math.floor(stake*(o.raised ? 2 : 1)*odds);
  }
```

- [ ] **Step 4: 통과 확인** — `node tests/jester-den-games.test.js` → `jester-den-games: OK`.
- [ ] **Step 5: 커밋** — `git add js/jester-den-games.js tests/jester-den-games.test.js && git commit -m "쥐 경주 순수 로직 + 단위 테스트"`

### Task 2: 도둑잡기 + 공통 보상 + 촛불 보너스 순수 로직

**Files:**
- Modify: `js/jester-den-games.js`(끝에 추가)
- Test: `tests/jester-den-games.test.js`(`console.log` 앞에 추가)

**Interfaces:**
- Consumes: `denShuffle`(Task 1)
- Produces: `THIEF_JOKER='X'`, `thiefDeal(rng)→{me, dealer, jokerMine}`, `thiefTake(from, idx, to)→{card, paired}`(배열 직접 수정), `thiefWinner(me, dealer)→'me'|'dealer'|null`, `thiefTell(isJoker, rng)→'flinch'|'calm'`, `thiefDealerPick(hand, rng)→index`, `thiefPayout(stake, won)→number`, `DEN_PRIZE_KINDS`, `pickDenPrizeKind(rng)→'potion'|'stone'|'seal'`, `denRelicRoll(bigWin, hasRelic, rng)→'relic'|'gold'|null`, `EDGE_CANDLE_RELIC='relic_edgecandle'`, `getLowHpLuckBonus(p)→0|0.2`.

- [ ] **Step 1: 실패하는 테스트 추가**:

```js
// ── 도둑잡기 ──
assert.strictEqual(run('THIEF_JOKER'), 'X');
for(let i=0;i<500;i++){
  const d = J(ctx.thiefDeal());
  ['A','K','Q'].forEach(c=>{ assert.strictEqual(d.me.filter(x=>x===c).length, 1); assert.strictEqual(d.dealer.filter(x=>x===c).length, 1); });
  assert.strictEqual(d.me.concat(d.dealer).filter(x=>x==='X').length, 1);
  assert.strictEqual(d.me.includes('X'), d.jokerMine);
}
assert.strictEqual(J(ctx.thiefDeal(seq(0.1, 0.5))).jokerMine, true);
assert.strictEqual(J(ctx.thiefDeal(seq(0.9, 0.5))).jokerMine, false);
run("var f1 = ['A','X'], t1 = ['A','K']; var r1 = thiefTake(f1, 0, t1);");
assert.deepStrictEqual(J(run('r1')), {card:'A', paired:true});
assert.deepStrictEqual(J(run('[f1, t1]')), [['X'], ['K']]);
run("var f2 = ['X'], t2 = ['A']; var r2 = thiefTake(f2, 0, t2);");
assert.deepStrictEqual(J(run('r2')), {card:'X', paired:false});
assert.deepStrictEqual(J(run('[f2, t2]')), [[], ['A','X']]);
assert.strictEqual(run("thiefWinner([], ['X'])"), 'me');
assert.strictEqual(run("thiefWinner(['X'], [])"), 'dealer');
assert.strictEqual(run("thiefWinner(['A'], ['A','X'])"), null);
assert.strictEqual(ctx.thiefTell(true, ()=>0.69), 'flinch');
assert.strictEqual(ctx.thiefTell(true, ()=>0.7), 'calm');
assert.strictEqual(ctx.thiefTell(false, ()=>0.29), 'flinch');
assert.strictEqual(ctx.thiefTell(false, ()=>0.3), 'calm');
assert.strictEqual(run("thiefDealerPick(['A','K','X'], ()=>0.99)"), 2);
assert.strictEqual(run("thiefDealerPick(['A','K','X'], ()=>0)"), 0);
assert.strictEqual(ctx.thiefPayout(60, true), 120);
assert.strictEqual(ctx.thiefPayout(60, false), 0);
// 무작위로 끝까지 두면 반드시 한쪽이 이긴다(조커를 쥔 쪽이 진다)
for(let g=0; g<2000; g++){
  run("var d = thiefDeal(), me = d.me, de = d.dealer, turn = 0, w = null;" +
      "while(!(w = thiefWinner(me, de))){ if(turn++ % 2 === 0) thiefTake(de, thiefDealerPick(de), me); else thiefTake(me, thiefDealerPick(me), de); if(turn > 50) break; }");
  const w = run('w'), loserHand = J(run("w==='me' ? de : me"));
  assert.ok(w==='me' || w==='dealer');
  assert.deepStrictEqual(loserHand, ['X']);
}

// ── 공통 보상 ──
assert.strictEqual(ctx.pickDenPrizeKind(()=>0), 'potion');
assert.strictEqual(ctx.pickDenPrizeKind(()=>0.5), 'stone');
assert.strictEqual(ctx.pickDenPrizeKind(()=>0.999), 'seal');
assert.strictEqual(ctx.denRelicRoll(false, false, ()=>0), null);
assert.strictEqual(ctx.denRelicRoll(true, false, ()=>0.49), 'relic');
assert.strictEqual(ctx.denRelicRoll(true, false, ()=>0.5), null);
assert.strictEqual(ctx.denRelicRoll(true, true, ()=>0.1), 'gold');
assert.strictEqual(ctx.denRelicRoll(true, true, ()=>0.9), null);

// ── 벼랑 끝의 촛불 ──
assert.strictEqual(run('EDGE_CANDLE_RELIC'), 'relic_edgecandle');
assert.strictEqual(run("getLowHpLuckBonus({relics:['relic_edgecandle'], hp:30, maxhp:100})"), 0.2, '30%는 켜짐');
assert.strictEqual(run("getLowHpLuckBonus({relics:['relic_edgecandle'], hp:31, maxhp:100})"), 0, '31%는 꺼짐');
assert.strictEqual(run("getLowHpLuckBonus({relics:[], hp:1, maxhp:100})"), 0, '유물 없음');
assert.strictEqual(run("getLowHpLuckBonus(null)"), 0);
```

- [ ] **Step 2: 실패 확인** — `node tests/jester-den-games.test.js` → `TypeError: ... thiefDeal is not a function`(또는 ReferenceError).

- [ ] **Step 3: 구현(파일 끝에 추가)**:

```js
  // ── 도둑잡기(세 장 1대1) ──
  const THIEF_JOKER = 'X';
  // 나와 딜러가 같은 세 장(A·K·Q)을 하나씩, 조커는 무작위로 한쪽(50%). 각 패는 섞는다.
  function thiefDeal(rng){
    const r = rng || Math.random;
    const jokerMine = r() < 0.5;
    const me = ['A','K','Q'].concat(jokerMine ? [THIEF_JOKER] : []);
    const dealer = ['A','K','Q'].concat(jokerMine ? [] : [THIEF_JOKER]);
    return {me: denShuffle(me, r), dealer: denShuffle(dealer, r), jokerMine};
  }
  // from[idx]를 뽑아 to로 옮긴다. 같은 글자가 to에 있으면(조커 제외) 둘 다 버린다(짝).
  function thiefTake(from, idx, to){
    const card = from.splice(idx, 1)[0];
    const at = card===THIEF_JOKER ? -1 : to.indexOf(card);
    if(at >= 0){ to.splice(at, 1); return {card, paired:true}; }
    to.push(card);
    return {card, paired:false};
  }
  // 패를 먼저 다 턴 쪽이 이긴다(조커를 쥔 쪽이 진다). 아직이면 null.
  function thiefWinner(me, dealer){
    if(me.length===0) return 'me';
    if(dealer.length===0) return 'dealer';
    return null;
  }
  // 가리킨 카드에 딜러 손이 반응: 조커면 70%, 아니면 30% 움찔(딜러의 속임수).
  function thiefTell(isJoker, rng){ return (rng || Math.random)() < (isJoker ? 0.7 : 0.3) ? 'flinch' : 'calm'; }
  function thiefDealerPick(hand, rng){ return Math.floor((rng || Math.random)()*hand.length); }
  function thiefPayout(stake, won){ return won ? stake*2 : 0; }

  // ── 공통 보상 ──
  const DEN_PRIZE_KINDS = ['potion', 'stone', 'seal'];
  function pickDenPrizeKind(rng){ return DEN_PRIZE_KINDS[Math.min(2, Math.floor((rng || Math.random)()*3))]; }
  // 대승이면 50%로 도박장 유물 — 그때 이미 가졌으면 대신 골드(판돈 2배). 'relic' | 'gold' | null.
  function denRelicRoll(bigWin, hasRelic, rng){
    if(!bigWin) return null;
    if((rng || Math.random)() >= 0.5) return null;
    return hasRelic ? 'gold' : 'relic';
  }

  // ── 벼랑 끝의 촛불 ── HP 30% 이하면 운 스킬 성공 확률 +20%p(combat/player-actions.js 운 스킬 4곳이 더한다).
  const EDGE_CANDLE_RELIC = 'relic_edgecandle';
  function getLowHpLuckBonus(p){
    if(!p || !(p.relics||[]).includes(EDGE_CANDLE_RELIC)) return 0;
    return p.hp <= p.maxhp*0.3 ? 0.2 : 0;
  }
```

- [ ] **Step 4: 통과 확인** — `node tests/jester-den-games.test.js` → OK. 기존 테스트 4개도 통과.
- [ ] **Step 5: 커밋** — `git commit -m "도둑잡기/공통 보상/벼랑 끝의 촛불 순수 로직 + 단위 테스트"`

### Task 3: 유물 정의 + 운 스킬 4곳 + 도감 제외

**Files:**
- Modify: `js/relics.js:174`(딜러의 장갑 다음 줄), `js/combat/player-actions.js:2844,2986,3285,3329`, `js/records.js:68-98, 316`

**Interfaces:**
- Consumes: `getLowHpLuckBonus(p)`, `EDGE_CANDLE_RELIC`(Task 2)
- Produces: `RELICS.relic_edgecandle`(`dexOptional:true`)

- [ ] **Step 1: 유물 정의** — `relics.js`의 `relic_dealerglove` 다음 줄:

```js
    // 벼랑 끝의 촛불(숨겨진 도박장 전용 게임 대승 보상, js/jester-den.js grantDenPrize). eventOnly — 제단에 안 나온다.
    // dexOptional — 도감엔 오르지만 "유물 감정가"(도감 완성) 조건에선 빠진다(records.js). 효과는
    // getLowHpLuckBonus()(js/jester-den-games.js)를 운 스킬 4곳(combat/player-actions.js)이 더하는 방식.
    relic_edgecandle:  {type:'wild', name:'벼랑 끝의 촛불', desc:'HP가 30% 이하이면 운 스킬(동전 던지기·승부수·마지막 카드·베팅)의 성공 확률이 20%p 오른다.', effect:{edgeCandle:true}, eventOnly:true, dexOptional:true},
```

- [ ] **Step 2: 운 스킬 4곳** — `player-actions.js`에서 정확히 같은 줄 4개를 모두 바꾼다(replace all):

```
const fateChance = player.fateBoostChance||0, fateMult = player.fateBoostMult||0;
```
→
```
const fateChance = (player.fateBoostChance||0) + getLowHpLuckBonus(player), fateMult = player.fateBoostMult||0; // + 벼랑 끝의 촛불
```
(바로 다음 줄 `if(fateChance || fateMult){ ...=0 }`은 그대로 — 촛불 값만 있을 때 0을 0으로 지우는 것뿐이라 무해.)

- [ ] **Step 3: 도감** — `records.js`:
  - `showRelicDex()`: `const ids = Object.keys(RELICS);` 다음에 `const required = ids.filter(id=>!RELICS[id].dexOptional);`, 발견 표시를
    `발견: ${discovered.filter(id=>required.includes(id)).length} / ${required.length}`로. 발견한 행의 종류 칸을
    `${typeLabel[r.type]}${r.dexOptional?' · 숨겨진 유물':''}`, 미발견 행을 `<span>？？？${r.dexOptional?' (숨겨진 유물)':''}</span><span>🔒</span>`.
  - `checkAchievements()`:
    `if(relicDex.length >= Object.keys(RELICS).length)` →
    `const dexRequired = Object.keys(RELICS).filter(id=>!RELICS[id].dexOptional);`
    `if(relicDex.filter(id=>dexRequired.includes(id)).length >= dexRequired.length)`

- [ ] **Step 4: 확인** — `node --check js/relics.js js/records.js js/combat/player-actions.js`(파일별), `git grep -n "getLowHpLuckBonus(player)" js/combat/player-actions.js` → 4줄.
- [ ] **Step 5: 커밋** — `git commit -m "벼랑 끝의 촛불 유물 정의, 운 스킬 4종 보너스 연결, 도감 완성 조건 제외"`

### Task 4: 공통 정산 + 쥐 경주 화면

**Files:**
- Modify: `js/jester-den.js`(헤더 export, 등록부, 새 함수), `index.html`(CSS — 야바위 `.js-*` 블록 뒤, `<script>` — `jester-shell.js` 다음)

**Interfaces:**
- Consumes: Task 1·2 전부, `eventOverlay`/`closeMysteryEvent`(events.js), `jesterTableStake`(jester-table.js), `grantRandomPotion`/`grantEliteSealFragments`(events.js), `grantReinforceStones`(blacksmith.js), `getRelicSlotUsage`/`showRelicSwapPrompt`/`finalizeRelicPick`(relics.js), `showDialogueSequence`.
- Produces: `grantDenPrize(overlay, {gold, stake, bigWin, logText})`, `showRatRace()`, 등록부 항목 `rats`.

- [ ] **Step 1: `<script>`** — `index.html`의 `<script src="js/jester-shell.js"></script>` 다음 줄에 `<script src="js/jester-den-games.js"></script>`.

- [ ] **Step 2: CSS** — 야바위 `@keyframes jsLose` 줄 다음:

```css
  /* 쥐 경주(숨겨진 도박장, js/jester-den.js showRatRace). 쥐 위치는 .jr-rat의 left(transition). */
  .jr-track{display:flex; flex-direction:column; gap:6px; margin:4px 0 8px;}
  .jr-lane{border:1px solid #4a3a24; border-radius:6px; padding:4px 6px; background:#1a120c;}
  .jr-lane.mine{border-color:var(--gold-bright); box-shadow:0 0 6px #e6c34a55;}
  .jr-lane.winner{background:#2e2410;}
  .jr-label{font-size:11px; color:var(--parchment-dim); display:flex; gap:4px; align-items:baseline;}
  .jr-label b{color:var(--parchment); font-weight:600;}
  .jr-odds{margin-left:auto; color:var(--gold-bright); font-family:Cinzel,serif;}
  .jr-run{position:relative; height:24px; border-right:2px dashed #8a6a3a; margin-top:2px;}
  .jr-rat{position:absolute; top:0; left:0; font-size:20px; line-height:24px; transform:scaleX(-1); transition:left .45s ease;}
  .jr-crumb{position:absolute; top:10px; width:5px; height:5px; border-radius:50%; background:#c9a86a; box-shadow:0 0 3px #c9a86a;}
  .jr-track.tripping .jr-lane{cursor:pointer;}
  .jr-track.tripping .jr-lane:hover{border-color:#c9a8ff;}
  .jr-lane.tripped .jr-rat{animation:jrTrip .5s ease;}
  @keyframes jrTrip{0%,100%{rotate:0deg;} 30%{rotate:-25deg;} 60%{rotate:15deg;}}
```

- [ ] **Step 3: `jester-den.js`** — 헤더 export에 `grantDenPrize, showRatRace, showThiefGame`, 의존성에 `jester-den-games.js`, `jester-table.js(jesterTableStake)` 추가. 등록부에 항목 추가:

```js
    {id:'rats', name:'쥐 경주', desc:'쥐 네 마리, 배당은 저마다. 반환점에서 한 번 더 걸 수 있다.', start:()=> showRatRace()},
```

파일 끝에 추가:

```js
  // 도박장 전용 게임 공통 정산: 골드 + 작은 현물 1개, 대승이면 50%로 벼랑 끝의 촛불(그때 이미 있으면 판돈 2배 골드).
  // 유물이 나오면 오버레이를 닫고 대화창 → 획득(슬롯이 차면 교체 화면). 아니면 바로 노드맵으로.
  function grantDenItem(kind){
    if(kind==='potion') return grantRandomPotion();
    if(kind==='stone'){ grantReinforceStones(1); return '강화석 +1'; }
    return grantEliteSealFragments(1);
  }
  function grantDenPrize(overlay, o){
    player.gold += o.gold;
    const prize = grantDenItem(pickDenPrizeKind());
    const roll = denRelicRoll(o.bigWin, (player.relics||[]).includes(EDGE_CANDLE_RELIC));
    let bonus = '';
    if(roll==='gold'){ player.gold += o.stake*2; bonus = ` 딜러가 골드를 더 밀어 준다(+${o.stake*2}G).`; }
    addLog(`${o.logText} 골드 +${o.gold}G. ${prize}${bonus}`, 'gold');
    if(roll!=='relic'){ renderStatus(); saveGame(); closeMysteryEvent(overlay); return; }
    overlay.remove();
    const done = ()=>{ renderStatus(); saveGame(); renderExplore([]); };
    showDialogueSequence([
      '딜러의 손이 탁자 위 촛불 하나를 집어, 이쪽으로 밀어 준다.',
      '거의 다 타 버린 몽당초다. 그런데 불꽃이 낮게 내려앉을수록, 더 밝게 타오른다.',
    ], {onDone: ()=>{
      if(getRelicSlotUsage() >= player.relicSlots) showRelicSwapPrompt(EDGE_CANDLE_RELIC, null, false, done);
      else { finalizeRelicPick(EDGE_CANDLE_RELIC, false); done(); }
    }});
  }

  // 버튼 영역 갈아 끼우기(카드판/야바위와 같은 패턴 — 클릭 즉시 비워 연타 방지).
  function denButtons(btns, list){
    btns.innerHTML = list.map((b,i)=>`<button class="btn" data-i="${i}" ${b.disabled?'disabled':''}>${b.label}</button>`).join('');
    btns.querySelectorAll('button').forEach(el=> el.addEventListener('click', ()=>{
      denButtons(btns, []);
      list[+el.dataset.i].on();
    }, {once:true}));
  }
  const DEN_INTRO_STYLE = 'text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 10px;';
  const DEN_INFO_STYLE = 'text-align:center;color:var(--gold-bright);font-size:13px;min-height:18px;margin:0 0 10px;';

  // 쥐 경주(js/jester-den-games.js). 쥐 고르기(= 판돈) → 틱마다 0.6초 재생 → 반환점에서 멈춰
  // 올리기/절반 빼기/그대로 → 결승. 사기꾼은 경주 중 1회 발 걸기(고르는 동안 경주가 멈춘다).
  // 타이머는 오버레이가 닫혔으면 아무것도 하지 않는다(later).
  const RAT_TICK_MS = 600;
  function showRatRace(){
    const stake = jesterTableStake(player, depth);
    const lineup = ratLineup(), crumbs = ratCrumbs();
    const odds = ratOdds(lineup, crumbs);
    const st = ratNewRace(lineup, crumbs);
    const {overlay, panel} = eventOverlay('쥐 경주',
      `<p style="${DEN_INTRO_STYLE}">촛불 아래 좁은 홈통 네 줄. 손이 쥐 꼬리를 하나씩 집어 출발선에 세운다.</p>
      <div class="jr-track" id="jr-track"></div>
      <p id="jr-info" style="${DEN_INFO_STYLE}">판돈 ${stake}G — 이길 쥐에 건다. 반환점에서 한 번 더 걸 수 있다.</p>`,
      `<div id="jr-btns" style="display:flex; flex-direction:column; gap:8px;"></div>`);
    const track = panel.querySelector('#jr-track');
    const info = panel.querySelector('#jr-info');
    const btns = panel.querySelector('#jr-btns');
    let pick = -1, raised = false, cashedOut = false, tripping = false;
    let tripLeft = player.specialization==='jester_debtcollector' ? 1 : 0;
    const later = (fn, ms)=> setTimeout(()=>{ if(overlay.isConnected) fn(); }, ms);
    const at = f=> `calc((100% - 22px) * ${Math.min(1, f)})`;
    track.innerHTML = lineup.map((k,i)=>`<div class="jr-lane" data-i="${i}">
        <div class="jr-label"><b>${RAT_KINDS[k].name}</b> · ${RAT_KINDS[k].desc}<span class="jr-odds">${odds[i]}배</span></div>
        <div class="jr-run">${k==='glutton' ? crumbs.map(c=>`<i class="jr-crumb" data-c="${c}" style="left:${at(c/RAT_TRACK)}"></i>`).join('') : ''}<span class="jr-rat">🐀</span></div>
      </div>`).join('');
    const lanes = [...track.querySelectorAll('.jr-lane')];
    const name = i=> RAT_KINDS[lineup[i]].name;
    const draw = ()=>{
      lanes.forEach((ln,i)=>{
        ln.querySelector('.jr-rat').style.left = at(st.rats[i].pos/RAT_TRACK);
        ln.querySelectorAll('.jr-crumb').forEach(c=>{ if(!st.crumbs.includes(+c.dataset.c)) c.remove(); });
      });
    };
    const end = (text, cls)=>{ addLog(text, cls); renderStatus(); saveGame(); closeMysteryEvent(overlay); };
    const runButtons = ()=> denButtons(btns, tripLeft>0 ? [{label:'🦶 발 걸기 (1회)', on:()=>{
      tripLeft--; tripping = true; track.classList.add('tripping');
      info.textContent = '발을 걸 쥐의 레인을 고르세요.';
    }}] : []);
    lanes.forEach((ln,i)=> ln.addEventListener('click', ()=>{
      if(!tripping) return;
      tripping = false; track.classList.remove('tripping');
      st.rats[i].tripped = true;
      ln.classList.add('tripped'); later(()=> ln.classList.remove('tripped'), 700);
      info.textContent = `${name(i)}의 발을 슬쩍 걸었다.`;
    }));
    const tick = ()=>{
      if(tripping){ later(tick, 150); return; }
      const res = ratStep(st);
      draw();
      if(res.finished){ later(finish, 700); return; }
      if(res.half && !cashedOut){ later(halfway, 450); return; }
      later(tick, RAT_TICK_MS);
    };
    const halfway = ()=>{
      const rank = 1 + st.rats.filter((r,i)=> i!==pick && r.pos > st.rats[pick].pos).length;
      info.textContent = `반환점. ${name(pick)}은(는) 지금 ${rank}위.`;
      denButtons(btns, [
        {label:`판돈 올리기 (+${stake}G, ${odds[pick]}배 그대로)`, disabled: player.gold<stake, on:()=>{
          raised = true; player.gold -= stake; renderStatus(); saveGame();
          info.textContent = `판돈을 ${stake*2}G로 올렸다.`; runButtons(); later(tick, 400);
        }},
        {label:`절반 빼기 (${ratPayout(stake, odds[pick], {cashedOut:true})}G 돌려받기)`, on:()=>{
          cashedOut = true; player.gold += ratPayout(stake, odds[pick], {cashedOut:true}); renderStatus(); saveGame();
          info.textContent = '판돈 절반을 챙겨 물러났다. 경주는 계속된다.'; later(tick, 400);
        }},
        {label:'그대로', on:()=>{ info.textContent = '쥐들이 다시 달린다.'; runButtons(); later(tick, 300); }},
      ]);
    };
    const finish = ()=>{
      denButtons(btns, []);
      lanes[st.winner].classList.add('winner');
      const won = st.winner===pick;
      if(cashedOut){
        info.textContent = `${name(st.winner)}이(가) 들어왔다.`;
        denButtons(btns, [{label:'일어선다', on:()=> end(`쥐 경주에서 판돈 절반을 빼고 물러났다(${name(st.winner)} 우승). 골드 +${ratPayout(stake, odds[pick], {cashedOut:true})}G`)}]);
        return;
      }
      if(!won){
        info.textContent = `${name(st.winner)}이(가) 먼저 들어왔다. 손가락이 판돈을 쓸어 간다.`;
        denButtons(btns, [{label:'일어선다', on:()=> end(`쥐 경주에서 졌다(${name(st.winner)} 우승). 판돈 ${raised ? stake*2 : stake}G를 잃었다.`, 'warn')}]);
        return;
      }
      const gold = ratPayout(stake, odds[pick], {won:true, raised});
      info.textContent = `${name(pick)}이(가) 들어왔다!${raised ? ' 올린 판돈까지 전부.' : ''}`;
      denButtons(btns, [{label:`정산한다 (${gold}G)`, on:()=> grantDenPrize(overlay, {gold, stake, bigWin:raised,
        logText:`쥐 경주에서 ${name(pick)}이(가) 이겼다(${odds[pick]}배${raised ? ', 판돈 올림' : ''}).`})}]);
    };
    draw();
    denButtons(btns, lineup.map((k,i)=>({label:`${RAT_KINDS[k].name}에 건다 (${odds[i]}배)`, disabled: player.gold<stake, on:()=>{
      pick = i; lanes[i].classList.add('mine');
      // 판돈을 낸 즉시 저장 — 지고 새로고침해 판돈을 되찾는 걸 막는다(카드판/야바위와 같음).
      player.gold -= stake; renderStatus(); saveGame();
      info.textContent = `${name(i)}에 ${stake}G. 손가락이 탁자를 두드리자, 쥐들이 달린다.`;
      runButtons();
      later(tick, 500);
    }})).concat([{label:'지나간다', on:()=> end('쥐 경주를 지나쳤다.')}]));
  }
```

- [ ] **Step 4: 확인** — `node --check js/jester-den.js`, 단위 테스트 5개 통과. (화면은 Task 7 헤드리스에서 확인)
- [ ] **Step 5: 커밋** — `git commit -m "숨겨진 도박장: 공통 정산(골드+현물+촛불) + 쥐 경주 화면/연출"`

### Task 5: 도둑잡기 화면

**Files:**
- Modify: `js/jester-den.js`(등록부 + 새 함수), `index.html`(CSS — Task 4 블록 뒤)

**Interfaces:**
- Consumes: Task 2 도둑잡기 함수, Task 4 `grantDenPrize`/`denButtons`/`DEN_*_STYLE`
- Produces: `showThiefGame()`, 등록부 항목 `thief`

- [ ] **Step 1: CSS**:

```css
  /* 도둑잡기(숨겨진 도박장, js/jester-den.js showThiefGame). 카드는 카드판 .jt-card 재사용 —
     흐림은 앞뒷면(> div)에만(preserve-3d 카드 자체에 opacity를 걸면 평면화된다). */
  .th-row{display:flex; justify-content:center; gap:10px; min-height:88px; margin:4px 0 2px; perspective:600px;}
  .th-row.pickable .jt-card{cursor:pointer;}
  .jt-card.th-pointed{translate:0 -10px; box-shadow:0 0 10px #c9a8ff99;}
  .jt-card.th-dim > div{opacity:.4;}
  .th-row.th-flinch{animation:thFlinch .4s ease;}
  @keyframes thFlinch{0%,100%{translate:0 0;} 25%{translate:-3px 0;} 50%{translate:3px 0;} 75%{translate:-2px 0;}}
```

- [ ] **Step 2: 등록부 항목**:

```js
    {id:'thief', name:'도둑잡기', desc:'세 장으로 겨룬다. 딜러의 손이 거짓말을 할 때가 있다.', start:()=> showThiefGame()},
```

- [ ] **Step 3: 화면(파일 끝)**:

```js
  // 도둑잡기(js/jester-den-games.js). 내 차례: 딜러 카드를 가리키면 손이 반응(움찔/태연) → 이걸 뽑는다/다른 걸 뽑는다.
  // 딜러 차례: 손이 내 카드 위를 머뭇거리다 무작위 한 장. phase로 연타를 막는다
  // (point: 가리킬 카드 고르기, pick: 가리킨 것 말고 고르기, peek: 사기꾼 훔쳐보기, busy: 입력 무시).
  function thiefCardHtml(card, faceUp){
    const label = card===THIEF_JOKER ? '🃏' : card;
    return `<div class="jt-card${faceUp ? ' face-up' : ''}"><div class="jt-back"></div><div class="jt-front">${label}</div></div>`;
  }
  function showThiefGame(){
    const stake = jesterTableStake(player, depth);
    const {overlay, panel} = eventOverlay('도둑잡기',
      `<p style="${DEN_INTRO_STYLE}">촛불 아래, 손만 남은 딜러가 카드를 갈라 쥔다. 그중 한 장은 웃는 얼굴이다.</p>
      <div class="th-row" id="th-dealer"></div>
      <p class="jt-hint">딜러의 패</p>
      <div class="th-row" id="th-me"></div>
      <p class="jt-hint">나의 패 — 짝이 맞으면 버린다. 먼저 다 털면 이기고, 🃏를 끝까지 쥐면 진다.</p>
      <p id="th-info" style="${DEN_INFO_STYLE}">판돈 ${stake}G — 이기면 두 배.</p>`,
      `<div id="th-btns" style="display:flex; flex-direction:column; gap:8px;"></div>`);
    const dealerEl = panel.querySelector('#th-dealer');
    const meEl = panel.querySelector('#th-me');
    const info = panel.querySelector('#th-info');
    const btns = panel.querySelector('#th-btns');
    let me = [], dealer = [], phase = 'busy', pointed = -1, drewJoker = false;
    let peekLeft = player.specialization==='jester_debtcollector' ? 1 : 0;
    const later = (fn, ms)=> setTimeout(()=>{ if(overlay.isConnected) fn(); }, ms);
    const end = (text, cls)=>{ addLog(text, cls); renderStatus(); saveGame(); closeMysteryEvent(overlay); };
    const draw = ()=>{
      dealerEl.innerHTML = dealer.map(c=> thiefCardHtml(c, false)).join('');
      meEl.innerHTML = me.map(c=> thiefCardHtml(c, true)).join('');
      dealerEl.classList.toggle('pickable', phase==='point' || phase==='pick' || phase==='peek');
      if(phase==='pick' && dealerEl.children[pointed]) dealerEl.children[pointed].classList.add('th-dim');
    };
    const checkEnd = ()=>{
      const w = thiefWinner(me, dealer);
      if(!w) return false;
      phase = 'busy'; draw();
      if(w==='me'){
        const gold = thiefPayout(stake, true);
        info.textContent = drewJoker ? '패를 다 털었다!' : '패를 다 털었다 — 🃏는 한 번도 뽑지 않았다.';
        denButtons(btns, [{label:`정산한다 (${gold}G)`, on:()=> grantDenPrize(overlay, {gold, stake, bigWin:!drewJoker,
          logText:`도둑잡기에서 이겼다${drewJoker ? '' : '(🃏를 한 번도 뽑지 않음)'}.`})}]);
      } else {
        info.textContent = '딜러가 패를 다 털었다. 내 손에 🃏만 남았다.';
        denButtons(btns, [{label:'일어선다', on:()=> end(`도둑잡기에서 졌다. 판돈 ${stake}G를 잃었다.`, 'warn')}]);
      }
      return true;
    };
    const myTurn = ()=>{
      if(checkEnd()) return;
      phase = 'point'; pointed = -1; draw();
      info.textContent = '딜러의 카드 한 장을 가리키세요.';
      denButtons(btns, peekLeft>0 ? [{label:'👁 훔쳐보기 (1회)', on:()=>{
        peekLeft--; phase = 'peek'; draw();
        info.textContent = '몰래 볼 카드를 고르세요.';
      }}] : []);
    };
    const take = i=>{
      phase = 'busy'; denButtons(btns, []);
      const res = thiefTake(dealer, i, me);
      if(res.card===THIEF_JOKER) drewJoker = true;
      draw();
      info.textContent = res.card===THIEF_JOKER ? '🃏 — 웃는 얼굴이다…' : res.paired ? `${res.card} — 짝이 맞아 버렸다.` : `${res.card}을(를) 뽑았다.`;
      later(()=>{ if(!checkEnd()) dealerTurn(); }, 900);
    };
    const dealerTurn = ()=>{
      info.textContent = '딜러의 손이 내 패 위를 맴돈다…';
      const hover = Math.floor(Math.random()*me.length);
      if(meEl.children[hover]) meEl.children[hover].classList.add('th-pointed');
      later(()=>{
        const i = thiefDealerPick(me);
        [...meEl.children].forEach(el=> el.classList.remove('th-pointed'));
        if(meEl.children[i]) meEl.children[i].classList.add('th-pointed');
        later(()=>{
          const res = thiefTake(me, i, dealer);
          draw();
          info.textContent = res.card===THIEF_JOKER ? '딜러가 🃏를 가져갔다!' : res.paired ? `딜러가 ${res.card}을(를) 가져가 짝을 버렸다.` : `딜러가 ${res.card}을(를) 가져갔다.`;
          later(myTurn, 900);
        }, 500);
      }, 550);
    };
    const onPoint = i=>{
      phase = 'busy'; pointed = i;
      dealerEl.children[i].classList.add('th-pointed');
      const tell = thiefTell(dealer[i]===THIEF_JOKER);
      if(tell==='flinch') dealerEl.classList.add('th-flinch');
      later(()=>{
        dealerEl.classList.remove('th-flinch');
        info.textContent = tell==='flinch' ? '🫳 딜러의 손가락이 미세하게 떨린다…' : '🫳 딜러의 손은 태연하다.';
        const opts = [{label:'이걸 뽑는다', on:()=> take(i)}];
        if(dealer.length > 1) opts.push({label:'다른 걸 뽑는다', on:()=>{
          phase = 'pick'; draw();
          info.textContent = '가리킨 카드 말고, 뽑을 카드를 고르세요.';
        }});
        denButtons(btns, opts);
      }, 450);
    };
    dealerEl.addEventListener('click', e=>{
      const el = e.target.closest('.jt-card');
      if(!el) return;
      const i = [...dealerEl.children].indexOf(el);
      if(phase==='peek'){
        phase = 'busy';
        el.classList.add('face-up');
        later(()=>{ el.classList.remove('face-up'); phase = 'point'; info.textContent = '딜러의 카드 한 장을 가리키세요.'; draw(); }, 1000);
      } else if(phase==='point') onPoint(i);
      else if(phase==='pick' && i!==pointed) take(i);
    });
    draw();
    denButtons(btns, [
      {label:`판에 앉는다 (판돈 ${stake}G)`, disabled: player.gold<stake, on:()=>{
        // 판돈을 낸 즉시 저장 — 새로고침으로 무르기 방지.
        player.gold -= stake; renderStatus(); saveGame();
        const d = thiefDeal(); me = d.me; dealer = d.dealer;
        draw();
        info.textContent = d.jokerMine ? '내 패에 🃏가 섞여 들어왔다.' : '🃏는 딜러 쪽에 있다.';
        later(myTurn, 900);
      }},
      {label:'지나간다', on:()=> end('도둑잡기 판을 지나쳤다.')},
    ]);
  }
```

- [ ] **Step 4: 확인** — `node --check js/jester-den.js`, 단위 테스트 통과.
- [ ] **Step 5: 커밋** — `git commit -m "숨겨진 도박장: 도둑잡기 화면/딜러 손 반응 연출"`

### Task 6: 테스트 모드 admin7

**Files:**
- Modify: `js/explore.js`(admin6 분기 다음, `setupAdminMonsterTest` 다음에 함수)

**Interfaces:**
- Consumes: `enterNodeMapTier()`(nodemap.js), `makeTownCheckpoint()`, `addToRelicDex(id)`(storage.js)
- Produces: `setupAdminDenTest()`

- [ ] **Step 1: 분기** — admin6 분기 다음:

```js
    // [디버그 전용] "admin7"(도박사): 숨겨진 도박장 게임 테스트 — 보스 칸을 뺀 모든 칸이 🕯 숨겨진 도박장.
    if(player.name && player.name.trim().toLowerCase()==='admin7' && player.job==='jester'){
      setupAdminDenTest();
      return;
    }
```

- [ ] **Step 2: 함수** — `setupAdminMonsterTest` 다음:

```js
  // [디버그 전용] 숨겨진 도박장 테스트(admin7). 골드 5000 + 딜러의 장갑, 1구간 노드맵에서 바로 시작하고
  // 보스 칸을 뺀 모든 칸을 도박장({type:'secret', secretKind:'den'})으로 바꾼다 — 한 판에 여러 번 들어갈 수 있다.
  function setupAdminDenTest(){
    player.gold = 5000;
    if(!player.relics.includes('relic_dealerglove')){ player.relics.push('relic_dealerglove'); addToRelicDex('relic_dealerglove'); }
    player.tierIndex = 0;
    town = false;
    depth = 1;
    player.townCheckpoint = makeTownCheckpoint();
    document.getElementById('statusbar').style.display='flex';
    showScreen('explore');
    enterNodeMapTier();
    player.nodeMap.forEach(row=> row.forEach(n=>{ if(n.type!=='boss'){ n.type = 'secret'; n.secretKind = 'den'; } }));
    renderStatus();
    renderExplore(['[관리자 테스트] 골드 5000 · 딜러의 장갑. 보스 칸을 뺀 모든 칸이 🕯 숨겨진 도박장이다(4개 게임 중 2개가 무작위로 뜬다).']);
    saveGame();
  }
```

- [ ] **Step 3: 확인** — `node --check js/explore.js`. (동작은 Task 7 헤드리스)
- [ ] **Step 4: 커밋** — `git commit -m "테스트 모드 admin7: 모든 칸이 숨겨진 도박장"`

### Task 7: 헤드리스 확인 + 문서

**Files:**
- Create: `<scratchpad>/verify-den-games.js`(저장소 밖)
- Modify: `story.md:248`, `CURRENT_STATUS.md`

- [ ] **Step 1: 확인 스크립트** — playwright-core(스크래치패드 설치본) + 시스템 Chrome으로 `index.html`을 열고:
  1. `pickDenTables(JESTER_DEN_GAMES, 2)`가 4개 중 2개(중복 없음, 300번 반복 시 4개 id 모두 등장).
  2. 쥐 경주: 도박사 플레이어 세팅(골드 1000) → `showRatRace()` → 4레인·배당 표시, 첫 쥐에 걸기 → 골드 -판돈·저장 →
     반환점 대기(버튼 "판돈 올리기") → 올리기 → 결승까지 대기 → 이긴 경우/진 경우 각 정산 금액이 `ratPayout`과 일치.
     `Math.random`을 고정해 내 쥐가 이기게 만들고(`ratStep` 결과 조작 대신 lineup을 회색 꼬리 4마리로 두지 않고,
     `st` 접근이 없으므로 `Math.random=()=>0.0`으로 고정하면 모든 쥐가 최대 이동 → 동착 → 첫 번째(0) 승리) 대승 + `denRelicRoll` 0 → 촛불 획득 대화 → 유물 목록에 `relic_edgecandle`.
  3. 절반 빼기 경로: 골드 = 시작 - 판돈 + ⌊판돈/2⌋.
  4. 골드 < 판돈이면 쥐 버튼 전부 disabled.
  5. 사기꾼(`specialization='jester_debtcollector'`): 발 걸기 버튼 1회, 누르면 사라짐.
  6. 도둑잡기: `showThiefGame()` → 앉기 → 카드 가리키기 → 반응 문구(움찔/태연) → 이걸 뽑는다 → 끝까지 진행(가리키고 뽑기 반복) →
     승/패 중 하나로 끝나고 정산(승리면 골드 +판돈×2 + 현물 로그).
  7. 딜러 패 1장일 때 "다른 걸 뽑는다" 없음(상태를 만들어 확인).
  8. 유물 슬롯 가득 + 촛불 → 교체 화면(`showRelicSwapPrompt`) 노출.
  9. 촛불 보유 + HP 30%에서 `getLowHpLuckBonus(player)===0.2`, 동전 던지기 경로에서 `Math.random=()=>0.6` 고정 시
     성공(기본 0.5+0.2)·HP 100%면 실패 — `playerSkill`로 실제 확인(전투 세팅 필요 시 `startBattle` 후).
  10. 도감 완성 판정: `RELICS`에서 `dexOptional` 제외 개수 = 전체-1.
  11. admin7: 새 게임 시작 → 노드맵의 보스 외 모든 칸 `secret/den`, 골드 5000, 장갑 보유.
  12. 콘솔 오류 없음(오디오 로딩 실패 제외).
- [ ] **Step 2: 실행·수정** — 실패 항목은 원인을 고치고 다시 실행해 전부 통과.
- [ ] **Step 3: 문서** — story.md 248행 "숨겨진 도박장이면 카드판·야바위를 런 제한 없이 한 판" →
  "숨겨진 도박장이면 탁자 4개(카드판·야바위·쥐 경주·도둑잡기) 중 2개 — 도박장 전용 게임에서 대승하면 50%로 벼랑 끝의 촛불".
  CURRENT_STATUS.md "최근 작업"에 이번 세션 항목(설계/계획 경로, 게임 규칙 요약, 헤드리스 확인 결과, 미검증: 실플레이 체감).
- [ ] **Step 4: 커밋** — `git commit -m "숨겨진 도박장 2차 문서 반영 + 헤드리스 확인"`
