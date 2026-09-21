"use strict";
/*
기관사 2차 전직 "타임패트롤"(mechanic_timepatrol) — 다른 직업 2차 전직의 액티브 스킬을
"잔상"으로 빌려 쓰는 로직.
export(전역): TP_POOL_NORMAL, TP_POOL_ULT, TP_MAX_CLUES, tpClues, tpBorrowPower, tpWeight,
              tpPickKeys, tpCanBorrow
의존성: data/skills.js(SKILLDB). battleFlags는 전역 전투 상태(typeof로 방어).
주의: 풀은 화이트리스트다. 예약형(선혈각인/분신 배가/정보료)·패시브·소환수 전제 스킬·
     총사령관의 명령·임계 폭주는 일부러 넣지 않았다(스펙 참고).
*/
  // 일반 22개(각 직업 2차 전직의 Lv10/12 액티브).
  const TP_POOL_NORMAL = [
    'warriorBloodpactActive',                                   // 혈맹의 검투사
    'chalnaSlowStrike','chalnaMidStrike','chalnaFastStrike',    // 찰나의 검사(예약형 제외)
    'mageElementStrike','mageElementWave',                      // 계약술사
    'mageHaste','mageTimeRewind',                               // 시간술사
    'mageCurseNova','mageCurseBrand',                           // 저주술사
    'rogueShadowStrike',                                        // 환영도적
    'rogueVenomInject',                                         // 역병숙주
    'necroSummon',                                              // 원혼 강탈자(보스 랜덤 소환)
    'paladinJudgmentLight',                                     // 순교자
    'paladinHolyRend','paladinDarkPrayer',                      // 회랑의 기사
    'mechanicOverloadDischarge',                                // 폭주 화부(가상 압력)
    'mechanicDeployRecon','mechanicDeployFirepower','mechanicDeployShield', // 강철 군단장
    'jesterGoldBet',                                            // 황금 도박사(실제 골드)
    'jesterDoubleDice',                                         // 사기꾼
  ];
  // 궁극기(Lv15) 10개 — 가중치가 낮고 단서로 오른다.
  const TP_POOL_ULT = [
    'warriorBloodpactUltimate','chalnaTriBeat','mageElementStorm','mageTimeParadox',
    'mageCurseBloom','rogueUndeadParade','paladinMartyrUltimate','paladinCaliberXFinale',
    'jesterAllIn','jesterFateSwap',
  ];
  const TP_MAX_CLUES = 5;

  function tpClues(){
    return (typeof battleFlags!=='undefined' && battleFlags && battleFlags.timeClues) || 0;
  }
  // 잔상 위력 배율: 70% + 단서 1개당 6%, 최대 100%.
  function tpBorrowPower(clues){ return Math.min(1, 0.7 + 0.06*clues); }
  // 일반 1, 궁극기 0.3 + 단서×0.1(최대 0.8).
  function tpWeight(key, clues){
    return TP_POOL_ULT.includes(key) ? Math.min(0.8, 0.3 + 0.1*clues) : 1;
  }
  // 지금 발동 가능한 스킬인지(조건 미충족 스킬은 추첨 전에 걸러낸다).
  function tpCanBorrow(key){
    const s = SKILLDB[key];
    if(!s) return false;
    // 운명 뒤바꾸기(hpswap)는 전투당 사용 횟수 제한이 있다.
    if(s.type==='hpswap' && typeof battleFlags!=='undefined' && battleFlags && (battleFlags.fateSwapUsedCount||0) >= 1) return false;
    return true;
  }
  // 가중치 무복원 추첨. rng는 테스트에서 주입한다.
  function tpPickKeys(n, clues, opts){
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const ok = opts.canBorrow || (()=>true);
    const pool = TP_POOL_NORMAL.concat(opts.allowUlt===false ? [] : TP_POOL_ULT)
      .filter(k=> SKILLDB[k] && ok(k));
    const out = [];
    while(out.length<n && pool.length){
      const total = pool.reduce((a,k)=>a+tpWeight(k,clues), 0);
      let r = rng()*total, idx = 0;
      for(; idx<pool.length-1; idx++){ r -= tpWeight(pool[idx], clues); if(r<0) break; }
      out.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return out;
  }
