"use strict";
/*
도박사 전용 물음표 이벤트 "야바위 컵"(3판, 맞힌 횟수로 정산) + 유물 "딜러의 장갑"
(구간마다 1회 노드맵 칸 바꿔치기) — 순수 로직.
설계: docs/superpowers/specs/2026-10-02-jester-shell-game-design.md
export(전역): JESTER_SHELL_WEIGHT, JESTER_SHELL_ROUNDS, jesterShellEligible, jesterShellStake,
       jesterShellPayout, jesterShellSwaps, jesterShellTrack, NODE_SWAP_TYPES, nodeSwapCandidates,
       canSwapNodePair, nodeSwapAvailable, migrateJesterShellCheckpoint
주의: 화면은 events.js의 showJesterShellEvent()(컵)와 nodemap.js의 renderNodeMapRows()(바꿔치기).
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
