"use strict";
/*
기관사 2차 전직 "타임패트롤"(mechanic_timepatrol) — 다른 직업 2차 전직의 액티브 스킬을
"잔상"으로 빌려 쓰는 로직.
export(전역): TP_POOL_NORMAL, TP_POOL_ULT, TP_MAX_CLUES, tpClues, tpBorrowPower, tpWeight,
              tpPickKeys, tpCanBorrow, castBorrowed, restoreBorrow,
              tpAddClue, tpReceive, tpVerify, tpLockdown, tpShowChoice
의존성: data/skills.js(SKILLDB). battleFlags는 전역 전투 상태(typeof로 방어).
주의: 풀은 화이트리스트다. 예약형(선혈각인/분신 배가/정보료)·패시브·소환수 전제 스킬·
     총사령관의 명령·임계 폭주·시간 역행(시간 조각 3개 전제, 조건 미달 시 MP 환불 경로가 잔상에선 공짜 MP가 됨)은 일부러 넣지 않았다(스펙 참고).
*/
  // 일반 21개(각 직업 2차 전직의 Lv10/12 액티브).
  const TP_POOL_NORMAL = [
    'warriorBloodpactActive',                                   // 혈맹의 검투사
    'chalnaSlowStrike','chalnaMidStrike','chalnaFastStrike',    // 찰나의 검사(예약형 제외)
    'mageElementStrike','mageElementWave',                      // 계약술사
    'mageHaste',                                                // 시간술사(시간 역행은 시간 조각 전제라 제외)
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

  /* ---------- 빌려쓰기 실행기 ---------- */
  // playerSkill(key, true)로 스킬을 발동하되(isRetry=true → MP/쿨타임 검사·차감 생략),
  // 그동안만 전역 enemyTurn/setCommandsEnabled/resetCommandUI/checkBattleEnd를 가로채
  // "이 스킬이 끝났다"는 신호를 잡는다. 대부분의 스킬은 끝에서 enemyTurn()을 부르고, 턴을
  // 소모하지 않는 스킬(강령 소환 등)은 setCommandsEnabled(true)로 끝난다. 신호가 오면 임시
  // 상태를 전부 원복한 뒤 done()을 호출한다(연쇄 발동/마지막 적 턴 진입은 done의 몫).
  // 전투가 그 사이 끝나면(checkBattleEnd()가 true) 원복만 하고 done()은 부르지 않는다.
  const _tp = {active:false, key:null, real:null, saved:null};

  function restoreBorrow(){
    if(!_tp.active) return;
    window.enemyTurn = _tp.real.enemyTurn;
    window.setCommandsEnabled = _tp.real.setCommandsEnabled;
    window.resetCommandUI = _tp.real.resetCommandUI;
    window.checkBattleEnd = _tp.real.checkBattleEnd;
    player.atk = _tp.saved.atk;
    player.necroSummonType = _tp.saved.necroSummonType;
    if(battleFlags){
      ['borrowing','borrowMult','borrowBloodPact','borrowElementPact','borrowMartyr'].forEach(f=>{ delete battleFlags[f]; });
      // playerSkill이 빌린 스킬 키로 쿨타임을 걸어 뒀다면 지운다(내 스킬이 아니다).
      if(battleFlags.skillCooldowns) delete battleFlags.skillCooldowns[_tp.key];
    }
    _tp.active = false;
  }

  function castBorrowed(key, done, clues){
    restoreBorrow(); // 혹시 남아 있는 이전 상태 정리(멱등)
    const power = tpBorrowPower(clues===undefined ? tpClues() : clues);
    _tp.key = key;
    _tp.real = {enemyTurn, setCommandsEnabled, resetCommandUI, checkBattleEnd};
    _tp.saved = {atk: player.atk, necroSummonType: player.necroSummonType};
    _tp.active = true;
    const finish = ()=>{
      if(!_tp.active) return;
      restoreBorrow();
      done();
    };
    window.enemyTurn = finish;
    window.resetCommandUI = finish;
    window.setCommandsEnabled = en=>{ if(en) finish(); else _tp.real.setCommandsEnabled(false); };
    window.checkBattleEnd = function(){
      const over = _tp.real.checkBattleEnd.apply(null, arguments);
      if(over) restoreBorrow();
      return over;
    };
    // 잔상 위력(applyOutgoingDamageMods가 읽음) + 토글류 50% 랜덤 적용.
    battleFlags.borrowing = true;
    battleFlags.borrowMult = power;
    battleFlags.borrowBloodPact = Math.random() < 0.5;
    battleFlags.borrowElementPact = Math.random() < 0.5;
    battleFlags.borrowMartyr = Math.random() < 0.5;
    // 스탯 기준: 물리 스킬도 기관사에게 위력이 나오도록 max(공격력, 마력)을 쓴다.
    player.atk = Math.max(player.atk, player.mag);
    // 강령 소환: 마을 계약 대신 층별 보스(+시간의 파수꾼) 중 하나를 랜덤 소환한다.
    if(key==='necroSummon'){
      const bosses = BOSSES.concat(typeof TIME_GUARDIAN!=='undefined' ? [TIME_GUARDIAN] : []);
      player.necroSummonType = bosses[Math.floor(Math.random()*bosses.length)].type;
    }
    playerSkill(key, true);
  }

  /* ---------- 단서 / 스킬 핸들러 ---------- */
  // 시간대 동조(mastery_timesync)가 있을 때만 쌓인다. 단서는 전투마다 초기화되는
  // battleFlags에 저장되므로 전투가 끝나면 자연히 사라진다.
  function tpAddClue(n){
    if(!(player.skills && player.skills.includes('mastery_timesync'))) return;
    battleFlags.timeClues = Math.min(TP_MAX_CLUES, (battleFlags.timeClues||0) + n);
  }

  // 타임라인 수신: 잔상 하나를 무작위로 발동.
  function tpReceive(){
    const key = tpPickKeys(1, tpClues(), {canBorrow: tpCanBorrow})[0];
    if(!key){
      setBattleMsg('타임라인 수신', '수신되는 잔상이 없다…');
      enemyTurn();
      return;
    }
    playBanner('⏳ 타임라인 수신!', 'def');
    castBorrowed(key, ()=>enemyTurn());
  }

  // 현장 검증: (단서 2개는 playerSkill의 가드가 확인) 잔상 3개 중 하나를 골라 발동.
  function tpVerify(){
    const c = tpClues();
    battleFlags.timeClues = c - 2;
    const keys = tpPickKeys(3, c, {canBorrow: tpCanBorrow});
    if(!keys.length){ enemyTurn(); return; }
    // 위력은 소모 전 단서 기준으로 계산한다(c를 castBorrowed에 넘김).
    tpShowChoice(keys, k=> castBorrowed(k, ()=>enemyTurn(), c));
  }

  // 시간 봉쇄령: 단서를 전부 소모해 2 + floor(단서/2)회(최대 4) 연속 발동. 궁극기 제외.
  function tpLockdown(){
    const c = tpClues();
    const n = Math.min(4, 2 + Math.floor(c/2));
    battleFlags.timeClues = 0;
    playBanner('⏳ 시간 봉쇄령!', 'def');
    let i = 0;
    const next = ()=>{
      if(i>=n){ enemyTurn(); return; }
      i++;
      const key = tpPickKeys(1, c, {allowUlt:false, canBorrow: tpCanBorrow})[0];
      if(!key){ enemyTurn(); return; }
      setTimeout(()=>{ if(!battleOver) castBorrowed(key, next, c); }, 350);
    };
    next();
  }

  // 3개 중 하나를 고르는 오버레이. 전직 선택창(showJobAdvancement)의 기존 클래스를
  // 그대로 재사용한다(새 CSS 없음). 취소 불가 — MP는 이미 소모됐다.
  function tpShowChoice(keys, onPick){
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel';
    panel.innerHTML = `<h3>현장 검증</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;line-height:1.6;margin-bottom:12px;">수신된 잔상 중 하나를 고른다.</p>
      <div class="job-card-grid"></div>`;
    const grid = panel.querySelector('.job-card-grid');
    keys.forEach(k=>{
      const sk = SKILLDB[k];
      const card = document.createElement('div');
      card.className = 'job-card';
      card.innerHTML = `<div class="ji-icon">${TP_POOL_ULT.includes(k) ? '✨' : '⏳'}</div>
        <div class="ji-name">${sk.name}</div>
        <div class="ji-desc">${sk.desc}</div>`;
      card.addEventListener('click', ()=>{ overlay.remove(); onPick(k); });
      grid.appendChild(card);
    });
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
  }
