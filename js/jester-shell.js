"use strict";
/*
도박사 전용 물음표 이벤트 "야바위 컵"(3판, 맞힌 횟수로 정산) + 유물 "딜러의 장갑"
(구간마다 1회 노드맵 칸 바꿔치기) — 순수 로직.
설계: docs/superpowers/specs/2026-10-02-jester-shell-game-design.md
export(전역): JESTER_SHELL_WEIGHT, JESTER_SHELL_ROUNDS, jesterShellEligible, jesterShellStake,
       jesterShellPayout, jesterShellSwaps, jesterShellTrack, NODE_SWAP_TYPES, nodeSwapCandidates,
       canSwapNodePair, nodeSwapAvailable, migrateJesterShellCheckpoint,
       JESTER_TRUTH_COUNT, assignNodeSecret, resolveSecretSwap, nextTruthIndex, truthComplete,
       rollSecretKind, pickDenTables, TRUTH_ENDING_LINES, insertTruthEndingLines
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
