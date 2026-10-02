"use strict";
/*
도박사 전용 물음표 이벤트 "뒷골목 카드판"(하이로우 3연승) — 순수 로직.
설계: docs/superpowers/specs/2026-10-02-jester-card-table-design.md
export(전역): JESTER_TABLE_WEIGHT, JESTER_TABLE_WIN_STREAK, jesterTableEligible, jesterTableStake,
       jesterTablePayout, jesterTableDraw, jesterTableJudge, jesterTableCardLabel, migrateJesterCheckpoint
주의: 화면/연출은 events.js의 showJesterTableEvent()와 index.html의 .jt-* CSS. 이 파일은
     DOM을 만지지 않는다(tests/jester-table.test.js가 node vm으로 바로 불러 쓴다).
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
  // 1=A, 11=J, 12=Q, 13=K. A가 가장 낮다.
  function jesterTableCardLabel(n){
    return n===1 ? 'A' : n===11 ? 'J' : n===12 ? 'Q' : n===13 ? 'K' : String(n);
  }
  // 쉬움/보통 사망 롤백(마을 체크포인트)은 유물도 되돌린다 — jesterTableSeen도 함께 되돌려야
  // 잃은 소매 속 에이스를 다시 노릴 수 있다. 이 기능 이전 체크포인트엔 키가 없으므로 false로 채운다
  // (explore.js의 세이브 로드 마이그레이션이 호출, 새 체크포인트는 makeTownCheckpoint()가 기록).
  function migrateJesterCheckpoint(cp){
    if(cp && cp.jesterTableSeen===undefined) cp.jesterTableSeen = false;
  }
