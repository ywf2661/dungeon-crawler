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
