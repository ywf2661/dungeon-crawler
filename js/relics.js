"use strict";
/*
유물(Relic) 시스템 — 불확실성의 주사위 효과 라벨, 유물 데이터, 유물/저주 제단 UI,
그리고 깊이 기반 드랍 테이블 조회 헬퍼(findEquipmentForDepth 등. 장비 데이터를 참조하지만
원본 코드 순서를 보존하기 위해 이 파일에 함께 위치시킴).
export(전역): DICE_EFFECT_LABELS, getLowHpScalingMult, hasBladeHiltSet, consumeOnHitBonuses,
              applyOutgoingDamageMods, revertDiceDelta, rollDiceEffectForBattle, getHourglassMult,
              RELICS, RELIC_ALTAR_POOL/FLOORS, CURSE_ALTAR_POOL/FLOORS, getRelicSlotUsage,
              getCurseCount / getCurseRewardMult / getCurseEpicBonus, getRelicDef,
              getCurseSealBypassChance, isCurseSealActive,
              applyRelicEffect, removeRelic, BLADE_HILT_IDS, rollRelicChoices, finalizeRelicPick,
              showRelicSwapPrompt, showRelicAltar, showCurseAltar,RELIC_SKIP_GOLD_COST
              findEquipmentForDepth, findRareDropForDepth, findEpicDropForDepth,
              applyMerchantSealPurchase
의존성: player/enemy/depth(state.js), EQUIPMENT류(data/equipment.js), Sound(sound.js)
주의: applyRelicEffect()에 저주술사(mastery_curseweaver, mage_curseweaver) 전용 예외 처리가
     추가되어 있다 — 저주(type:'curse')의 수치형 페널티를 절반만 받고, 저주를 받아들일
     때마다 마력이 영구히 오른다. 또한 isCurseSealActive()가 온오프형 봉인(스킬 봉인/
     물약 봉인/무회복)에도 저주 개수 비례 확률로 저항할 수 있게 한다 — 아래 해당 함수
     내부 주석 참고. hasRelicFlag('skillLocked')/hasRelicFlag('potionLocked')를 직접
     검사하던 곳(combat/player-actions.js)은 이제 isCurseSealActive(...)를 대신 호출한다.
*/

  const DICE_EFFECT_LABELS = {
    atk:'공격력 +30%', mag:'마력 +30%', def:'방어력 +30%',
    spd:'속도 +10', maxhp:'최대 HP +30%', dmgtaken:'받는 피해 +30%',
  };
  // 불확실성의 주사위: 전투 시작 시 6가지 중 하나를 뽑아 스탯에 즉시(임시로) 반영한다.
  function rollDiceEffectForBattle(){
    revertDiceDelta(); // 안전망: 혹시 남아있을 이전 델타를 먼저 정리
    const effects = ['atk','mag','def','spd','maxhp','dmgtaken'];
    const picked = effects[Math.floor(Math.random()*effects.length)];
    battleFlags.diceEffect = picked;
    const before = {atk:player.atk, def:player.def, mag:player.mag, maxhp:player.maxhp, hp:player.hp, spd:player.spd};
    if(picked==='atk') player.atk = Math.round(player.atk*1.3);
    else if(picked==='mag') player.mag = Math.round(player.mag*1.3);
    else if(picked==='def') player.def = Math.round(player.def*1.3);
    else if(picked==='spd') player.spd += 10;
    else if(picked==='maxhp'){
      const d = Math.round(player.maxhp*0.3);
      player.maxhp += d; player.hp = Math.min(player.maxhp, player.hp+d);
    }
    // dmgtaken(받는 피해 +30%)은 스탯을 바꾸지 않고 enemyAction()에서 직접 반영한다.
    const delta = {};
    Object.keys(before).forEach(k=>{ const diff=player[k]-before[k]; if(diff!==0) delta[k]=diff; });
    player.diceDelta = delta;
  }

  function getHourglassMult(){
    const limit = getRelicSum('turnLimitTurns');
    if(limit<=0) return 1;
    const turn = (battleFlags && battleFlags.hourglassTurn) || 0;
    return turn<=limit ? (1+getRelicSum('turnLimitDmgBonus')) : 1;
  }

  // ---------- 유물 (특정 층의 유물 제단에서 3개 중 1개 선택, 획득 즉시 적용 · 런 종료까지 유지) ----------
  // 유물은 장비 슬롯을 쓰지 않으며 증강과 달리 "빌드 자체를 바꾸는" 규칙형 아이템이다.
  // atkPct/defPct/magPct/maxhpPct/maxmpPct/spdFlat/mpZero 는 획득 즉시 스탯에 반영되고,
  // 나머지 키(dmgPctMult/basicAtkPctMult/bossDmgPctMult/dmgTakenPctMult/hpLockPct/killHealPct/
  // potionEffMult/potionLocked/skillLocked/lowHpScalingDmg/noPostBattleHeal/turnLimit*/killAtkStack/
  // hideDepth/goldPctMult/rareDropPctBonus/extraActionBySpd)는 전투 파이프라인에 전부 연결되어 실제로 작동한다.
  // (extraActionBySpd는 enemyTurn()을 래퍼+enemyTurnReal()로 분리해 연결했다.)
  const RELICS = {
    relic_goldenheart:  {type:'blessing', name:'황금 심장',     desc:'최대 HP +15%', effect:{maxhpPct:0.15}},
    relic_ironwill:     {type:'blessing', name:'강철의 의지',   desc:'방어력 +12%', effect:{defPct:0.12}},
    relic_manastream:   {type:'blessing', name:'마나의 샘',     desc:'최대 마나 +18%', effect:{maxmpPct:0.18}},
    relic_blackcrown:   {type:'blessing', name:'검은 왕관',     desc:'보스/진보스 상대 최종 피해 +12%', effect:{bossDmgPctMult:0.12}},

    relic_bloodoath:    {type:'contract', name:'피의 서약',     desc:'<span class="relic-neg">전투를 시작할 때 항상 체력이 최대 HP의 50%로 맞춰진다.</span> <span class="relic-pos">대신 공격/피해량 +35%.</span>', effect:{hpLockPct:0.5, dmgPctMult:0.35}},
    relic_emptybowl:    {type:'contract', name:'빈 그릇',       desc:'<span class="relic-neg">최대 MP가 0이 되어 스킬을 쓸 수 없다.</span> <span class="relic-pos">대신 일반 공격 피해 +80%.</span>', effect:{mpZero:true, basicAtkPctMult:0.80}},
    relic_glassheart:   {type:'contract', name:'유리 심장',     desc:'<span class="relic-neg">받는 피해 +40%.</span> <span class="relic-pos">모든 공격 피해 +60%.</span>', effect:{dmgTakenPctMult:0.40, dmgPctMult:0.60}},
    relic_hungryring:   {type:'contract', name:'굶주린 반지',   desc:'<span class="relic-pos">적 처치 시 HP를 회복한다.</span> <span class="relic-neg">대신 포션 회복 효율이 크게 줄어든다.</span>', effect:{killHealPct:0.10, potionEffMult:-0.5}},
    relic_hourglass:    {type:'contract', name:'죽음의 모래시계', desc:'<span class="relic-pos">전투 시작 후 3턴 안에 적을 처치하면 가한 피해가 크게 오른다.</span> <span class="relic-neg">3턴이 지나면 매 턴 최대체력의 5%만큼 피해를 입는다.</span>', effect:{turnLimitTurns:3, turnLimitDmgBonus:0.4, turnLimitPenaltyPct:0.05}},
    relic_deadledger:   {type:'contract', name:'망자의 장부',   desc:'<span class="relic-pos">적을 처치할 때마다 공격력이 영구히 오른다.</span> <span class="relic-neg">전투에서 도망치면 그동안 쌓은 보너스가 모두 사라진다.</span>', effect:{killAtkStack:true, stackAtkPerKill:1}},
    relic_brokencompass:{type:'contract', name:'깨진 나침반',   desc:'<span class="relic-neg">현재 깊이를 알 수 없게 된다.</span> <span class="relic-pos">대신 골드와 희귀 아이템 획득 확률이 오른다.</span>', effect:{hideDepth:true, goldPctMult:0.25, rareDropPctBonus:0.03, epicDropBonus:0.25}},

    relic_heartlessdoll:{type:'curse', name:'심장 없는 인형', desc:'최대 HP가 절반으로 줄어든다.', effect:{maxhpPct:-0.5}},
    relic_leadfeet:     {type:'curse', name:'납으로 된 발',   desc:'속도가 크게 감소한다.', effect:{spdFlat:-8}},
    relic_hungrycorridor:{type:'curse', name:'굶주린 회랑',   desc:'포션을 쓸 수 없고, 레벨업으로도 체력·마나가 가득 차지 않는다.', effect:{noPostBattleHeal:true, potionLocked:true}},
    relic_silentoath:   {type:'curse', name:'침묵의 서약',   desc:'스킬을 사용할 수 없게 된다.', effect:{skillLocked:true}},

    relic_witchclock:   {type:'wild', name:'마녀의 시계',   desc:'속도가 15 이상이면 매 턴 확률적으로(15↑10%, 20↑20%, 25↑30%) 적에게 턴을 넘기지 않고 한 번 더 행동한다.', effect:{extraActionBySpd:true}},
    relic_reversecrown: {type:'wild', name:'거꾸로 된 왕관', desc:'체력이 75% 이상이면 피해가 줄고, 낮을수록 가한 피해가 가속도로 커진다.', effect:{lowHpScalingDmg:true}},

    relic_candle:      {type:'blessing', name:'꺼지지 않는 촛불', desc:'전투 중 치명적인 피해를 입어도, 런 전체에서 단 한 번 HP 1로 살아남는다.', effect:{undyingCandle:true}},
    relic_snakeskin:   {type:'blessing', name:'뱀의 허물',       desc:'각 전투에서 처음 받는 피해가 50% 줄어든다.', effect:{snakeskinFirstHit:true}},
    relic_blade:       {type:'blessing', name:'회랑자의 칼날',   desc:'누군가에 의해 부러진 칼날. 단독으로는 아무 효과가 없다. <span class="relic-pos">회랑자의 칼자루와 함께 지니면 모든 스킬 피해가 2배가 된다.</span>', effect:{}},
    relic_hilt:        {type:'blessing', name:'회랑자의 칼자루', desc:'누군가에 의해 남겨진 칼자루. 단독으로는 아무 효과가 없다. <span class="relic-pos">회랑자의 칼날과 함께 지니면 모든 스킬 피해가 2배가 된다.</span>', effect:{}},

    relic_voidtome:    {type:'contract', name:'공허의 서',   desc:'<span class="relic-neg">최대 MP -50%.</span> <span class="relic-pos">대신 모든 스킬 피해 +35%.</span> (일반 공격에는 적용되지 않는다)', effect:{maxmpPct:-0.5, skillDmgPctMult:0.35}},

    relic_mirrorshard: {type:'wild', name:'거울의 파편',     desc:'받은 피해의 10%를 공격한 적에게 그대로 반사한다.', effect:{mirrorReflectPct:0.10}},
    relic_dice:        {type:'wild', name:'불확실성의 주사위', desc:'전투 시작 시 공격력/마력/방어력/최대HP +30%, 속도 +10, 받는 피해 +30% 중 하나가 무작위로 선택되어 전투가 끝날 때까지 유지된다.', effect:{diceRoll:true}},
    relic_flask:       {type:'wild', name:'연금술사의 플라스크', desc:'포션을 사용할 때마다 다음 공격의 피해가 +20%씩 늘어난다(최대 3스택, 최대 +60%). 공격 시 스택을 모두 소모한다.', effect:{flaskPotionBoost:true}},
    relic_infiniteclip:{type:'wild', name:'무한한 탄창',     desc:'스킬 사용 시 50% 확률로 MP를 소비하지 않는다.', effect:{freeCastChance:0.50}},
    relic_revengering: {type:'wild', name:'복수자의 반지',   desc:'피해를 받으면 다음 공격의 피해가 +30% 증가한다. 공격 1회로 효과가 사라진다.', effect:{revengeArmBonus:true}},
    relic_emptysack:   {type:'wild', name:'빈 자루의 각오', desc:'물약/상급 물약/에테르가 모두 떨어지면, 벼랑 끝에 몰린 만큼 가한 피해가 크게 오른다.', effect:{emptySackDmg:true}},

    relic_merchantseal:{type:'blessing', name:'상인의 그림자 인장', desc:'상점에서 아이템을 구매할 때마다 공격력이 오른다(최대 10스택, 스택당 현재 공격력의 +2%).', effect:{merchantSeal:true}},
  };
  // 일반 유물 제단에서는 저주형을 제외한 유물만 등장한다(저주형은 별도의 저주 제단 전용).
  const RELIC_ALTAR_POOL = Object.keys(RELICS).filter(id=>RELICS[id].type!=='curse');
  const RELIC_ALTAR_FLOORS = [6,12,18,24,36,42,48];
  const CURSE_ALTAR_POOL = Object.keys(RELICS).filter(id=>RELICS[id].type==='curse');
  const CURSE_ALTAR_FLOORS = [9,21,33,44];

  // 유물 제단에서 "고르지 않는다"를 선택할 때 소모되는 골드. 횟수 제한 대신 골드 비용으로 대체.
  const RELIC_SKIP_GOLD_COST = 1000;

  // 저주를 감수할수록 보상이 커진다: 저주 1개 → 골드/드랍 +10%, 2개 이상 → +25%, 3개 이상 → 에픽 확률 추가 보너스.
  // 저주형은 유물 슬롯을 차지하지 않는다 — 저주는 페널티 그 자체가 대가이므로,
  // 슬롯까지 깎아먹으면 이중 페널티가 되어 저주 제단을 기피하게 만들기 때문.
  function getRelicSlotUsage(){
    return (player.relics||[]).filter(id=>{ const r=RELICS[id]; return r && r.type!=='curse'; }).length;
  }

  function getCurseCount(){
    return (player.relics||[]).filter(id=>{ const r=RELICS[id]; return r && r.type==='curse'; }).length;
  }
  function getCurseRewardMult(){
    const c = getCurseCount();
    if(c>=2) return 0.25;
    if(c>=1) return 0.10;
    return 0;
  }
  function getCurseEpicBonus(){
    return getCurseCount()>=3 ? 0.05 : 0;
  }

  // ---------- 외상 도박사(jester_debtor) 빚 시스템 ----------
  // getCurseCount류와 같은 위치에 둔 이유: 둘 다 "장기간 누적되는 메타 자원이
  // 전투 파이프라인에 계속 영향을 주는" 같은 성격의 시스템이기 때문.
  //
  // 대출 3종: 여러 번 대출 가능(같은 종류 중복 포함), 빚과 원금이 함께 늘어난다.
  // buff는 대출 시점의 "현재" 공/마력 기준 퍼센트로 즉시·영구 적용된다(relics.js의
  // atkPct 계산과 동일한 방식 — 여러 번 빌리면 자연히 복리처럼 쌓인다). 전액
  // 상환하면 clearDebtorLoans()가 이 buff를 정확히 회수한다.
  const DEBTOR_LOANS = {
    small:  {name:'소액 대출', amount:500,  buff:{atk:0.10}, penaltyLabel:'물약 회복 효율 저하'},
    medium: {name:'중액 대출', amount:1500, buff:{atk:0.15, mag:0.15}, penaltyLabel:'받는 피해 증가'},
    large:  {name:'거액 대출', amount:4000, buff:{atk:0.30, mag:0.30}, penaltyLabel:'회복 봉인'},
  };
  const DEBT_GRACE_FLOORS = 10; // 대출 후 이 층수 안에 못 갚으면 황금고블린이 강제로 찾아온다
  const DEBT_INTEREST_RATE = 0.04; // 매 층 이동 시 남은 빚에 붙는 이자율

  // 상환 비율(0=한 푼도 안 갚음 ~ 1=완전 상환). 대출 이력 자체가 없으면(원금 0)
  // 페널티 계산상 "완전 상환"과 동일하게 취급해 0으로 나누기를 피한다.
  function getDebtRepaymentRatio(){
    if(!player.debtPrincipal || player.debtPrincipal<=0) return 1;
    return Math.max(0, Math.min(1, 1 - (player.debt/player.debtPrincipal)));
  }
  // 심각도(0=완전 상환 ~ 1=한 푼도 안 갚음) — 페널티 강도에 직접 곱하는 값이라
  // repaymentRatio의 반대 개념으로 따로 둔다(호출부 가독성 목적).
  function getDebtSeverity(){ return 1 - getDebtRepaymentRatio(); }

  // 소액 대출 페널티: 물약 회복 효율 저하. 대출 횟수만큼, 그리고 심각도만큼 심해진다.
  function getDebtorPotionMult(){
    const n = (player.loanCounts && player.loanCounts.small) || 0;
    if(n<=0) return 1;
    return Math.max(0.1, 1 - 0.2*n*getDebtSeverity());
  }
  // 중액 대출 페널티: 받는 피해 증가.
  function getDebtorDmgTakenMult(){
    const n = (player.loanCounts && player.loanCounts.medium) || 0;
    if(n<=0) return 1;
    return 1 + 0.15*n*getDebtSeverity();
  }
  // 거액 대출 페널티: 회복 봉인. 저주술사의 봉인 저항(isCurseSealActive, "심각도가
  // 낮을수록 뚫을 확률이 높다")과 정반대 방향의 확률 계산이다 — 여기서는 "심각도가
  // 높을수록(안 갚았을수록) 봉인이 실제로 발동할 확률이 높다." 대출 횟수는 확률에
  // 반영하지 않는다(토글형 페널티라 몇 번 빌렸든 "발동 여부"만 문제이지, 강도가
  // 배로 세지는 개념이 아니기 때문 — 온전히 상환율에만 의존).
  function isDebtHealSealActive(){
    const n = (player.loanCounts && player.loanCounts.large) || 0;
    if(n<=0) return false;
    return Math.random() < getDebtSeverity();
  }

  // 대출 실행: 즉시 공격력/마력을 올리고 빚·원금을 함께 늘린다. 이번이 이
  // 빚 사이클의 첫 대출이면(debtBorrowedAtDepth가 비어있으면) 황금고블린
  // 유예기간의 기준 깊이를 지금 깊이로 기록한다.
  function applyDebtorLoan(loanKey){
    const loan = DEBTOR_LOANS[loanKey];
    if(!loan) return;
    player.loanCounts = player.loanCounts || {small:0, medium:0, large:0};
    player.loanCounts[loanKey] = (player.loanCounts[loanKey]||0) + 1;
    if(player.debtBorrowedAtDepth==null) player.debtBorrowedAtDepth = depth;
    player.debt = (player.debt||0) + loan.amount;
    player.debtPrincipal = (player.debtPrincipal||0) + loan.amount;
    player.debtAppliedDelta = player.debtAppliedDelta || {};
    if(loan.buff.atk){
      const d = Math.round(player.atk*loan.buff.atk);
      player.atk += d;
      player.debtAppliedDelta.atk = (player.debtAppliedDelta.atk||0) + d;
    }
    if(loan.buff.mag){
      const d = Math.round(player.mag*loan.buff.mag);
      player.mag += d;
      player.debtAppliedDelta.mag = (player.debtAppliedDelta.mag||0) + d;
    }
  }
  // 전액 상환(또는 황금고블린 승리/일시불 정산) 시, 대출로 얻은 스탯을 정확히
  // 회수하고 모든 빚 관련 상태를 초기화한다.
  function clearDebtorLoans(){
    const d = player.debtAppliedDelta || {};
    if(d.atk) player.atk = Math.max(1, player.atk - d.atk);
    if(d.mag) player.mag = Math.max(0, player.mag - d.mag);
    player.debtAppliedDelta = {};
    player.loanCounts = {small:0, medium:0, large:0};
    player.debt = 0;
    player.debtPrincipal = 0;
    player.debtBorrowedAtDepth = null;
  }
  // 상점 "빚 갚기"(shop.js)에서 쓰는 실제 상환 처리. amount만큼 갚고(빚보다 많이
  // 내면 빚만큼만 차감 — 호출부에서 미리 min(보유 골드, 남은 빚)으로 제한해야
  // 함), 다 갚으면 자동으로 clearDebtorLoans()까지 처리한다. 실제로 갚인 금액을
  // 반환한다.
  function repayDebt(amount){
    const pay = Math.max(0, Math.min(amount, player.debt||0));
    if(pay<=0) return 0;
    player.debt -= pay;
    if(player.debt<=0) clearDebtorLoans();
    return pay;
  }

  // 황금고블린: 빚을 오래 방치하면(DEBT_GRACE_FLOORS 층 이내 미청산, 또는 올인
  // 대출로 강제 예약) 마주치는 이벤트. 유물/저주 제단과 같은 트리거 패턴
  // (explore.js의 proceedAdvance()에서 호출)이지만, "전투로 이어질 수 있다"는
  // 점이 달라 오버레이에서 곧장 startBattle(..., true)를 호출한다(4번째 인자
  // isDebtCollector — combat/battle-setup.js 참고).
  function showDebtCollectorEvent(){
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'debtcollector-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel relic-panel relic-panel-locked';
    const canPayoff = player.gold >= player.debt;
    panel.innerHTML = `<h3 style="color:#ffd76a;">💰 황금고블린 💰</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 10px;">
        금색 정장을 빼입고 금니를 번뜩이는 고블린이 두꺼운 장부를 옆구리에 낀 채 앞을 가로막는다.<br>
        "아아, 우리 단골손님이시군요. 슬슬... 정리를 좀 해야 하지 않겠어요?"
      </p>
      <p style="text-align:center;color:#ffd76a;font-size:13px;margin:0 0 10px;">남은 빚: ${player.debt}G</p>
      <p class="relic-lock-msg" id="dc-lock-msg">내용을 살펴보는 중…</p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <button class="btn" id="dc-payoff" disabled>${canPayoff ? `일시불 정산 (${player.debt}G)` : `일시불 정산 (골드 부족)`}</button>
        <button class="btn btn-danger" id="dc-fight" disabled>담판(전투)</button>
      </div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);

    const LOCK_MS = 1500;
    setTimeout(()=>{
      panel.classList.remove('relic-panel-locked');
      const payoffBtn = panel.querySelector('#dc-payoff');
      if(payoffBtn && canPayoff) payoffBtn.disabled = false;
      panel.querySelector('#dc-fight').disabled = false;
      const msg = panel.querySelector('#dc-lock-msg');
      if(msg) msg.remove();
    }, LOCK_MS);

    panel.querySelector('#dc-payoff').addEventListener('click', ()=>{
      if(panel.querySelector('#dc-payoff').disabled) return;
      if(player.gold < player.debt) return;
      player.gold -= player.debt;
      const paidOff = player.debt;
      clearDebtorLoans();
      renderStatus();
      saveGame();
      overlay.remove();
      addLog(`황금고블린에게 ${paidOff}G를 일시불로 정산했다. 고블린이 흡족한 미소를 지으며 물러난다.`, 'gold');
    });
    panel.querySelector('#dc-fight').addEventListener('click', ()=>{
      if(panel.querySelector('#dc-fight').disabled) return;
      overlay.remove();
      startBattle(false, false, false, true);
    });
  }

  function getRelicDef(id){ return RELICS[id]; }

  // 저주술사(mastery_curseweaver) 전용: 온오프형 저주 봉인(스킬 봉인/물약 봉인/
  // 무회복)을 완전히 무력화하지는 못하지만, 저주를 짊어질수록(개수 비례) 확률적으로
  // 뚫고 나올 수 있게 한다. 수치형 페널티 완화(절반)와 같은 "저주가 힘의 원천이
  // 된다" 테마를 온오프형 봉인에도 동일하게 적용한 것 — 저주 1개당 15%p, 최대 60%.
  function getCurseSealBypassChance(){
    if(!(player.skills && player.skills.includes('mastery_curseweaver'))) return 0;
    return Math.min(0.6, getCurseCount()*0.15);
  }
  // 봉인형 저주 플래그(skillLocked/potionLocked/noPostBattleHeal)가 "이번에" 실제로
  // 발동할지를 판정한다. 저주술사가 아니거나 저주가 아예 없으면 항상 hasRelicFlag()
  // 그대로 따른다(true=봉인 작동, false=봉인 없음 또는 이번엔 뚫음). bypassLabel을
  // 주면, 뚫었을 때 배너로 알려준다(매 시도마다 다시 굴리므로 매번 결과가 다를 수 있음).
  function isCurseSealActive(flagName, bypassLabel){
    if(!hasRelicFlag(flagName)) return false;
    const bypass = getCurseSealBypassChance();
    if(bypass>0 && Math.random() < bypass){
      if(bypassLabel && typeof playBanner==='function') playBanner(bypassLabel, 'pact-fire');
      return false;
    }
    return true;
  }

  // atkPct/defPct/magPct/maxhpPct/maxmpPct/spdFlat/mpZero 는 획득 즉시 스탯에 반영한다.
  // 슬롯 교체로 유물을 버릴 때 정확히 되돌릴 수 있도록, 실제로 변한 값(before/after 차이)을
  // player.relicAppliedDeltas[id]에 기록해둔다 — 퍼센트 기반 효과라 나중에 그대로 역산할 수 없기 때문.
  function applyRelicEffect(id){
    const relic = RELICS[id];
    if(!relic) return;
    const before = {atk:player.atk, def:player.def, mag:player.mag, maxhp:player.maxhp, hp:player.hp, maxmp:player.maxmp, mp:player.mp, spd:player.spd};
    let e = relic.effect;
    // 저주 계약(mastery_curseweaver, 저주술사): 저주(type:'curse')의 수치형(퍼센트/고정치)
    // 페널티를 절반만 받는다. noPostBattleHeal/potionLocked/skillLocked처럼 온오프형
    // 봉인 효과는 "절반"의 의미가 없어 그대로 적용된다(설계상 의도적 범위 제한).
    if(relic.type==='curse' && player.skills && player.skills.includes('mastery_curseweaver')){
      const mitigated = {};
      Object.keys(e).forEach(k=>{
        const v = e[k];
        mitigated[k] = (typeof v === 'number' && v < 0) ? v*0.5 : v;
      });
      e = mitigated;
    }
    if(e.atkPct) player.atk = Math.max(1, player.atk + Math.round(player.atk*e.atkPct));
    if(e.defPct) player.def = Math.max(0, player.def + Math.round(player.def*e.defPct));
    if(e.magPct) player.mag = Math.max(0, player.mag + Math.round(player.mag*e.magPct));
    if(e.maxhpPct){
      const d = Math.round(player.maxhp*e.maxhpPct);
      player.maxhp = Math.max(1, player.maxhp+d);
      player.hp = Math.max(1, Math.min(player.maxhp, player.hp+d));
    }
    if(e.maxmpPct){
      const d = Math.round(player.maxmp*e.maxmpPct);
      player.maxmp = Math.max(0, player.maxmp+d);
      player.mp = Math.max(0, Math.min(player.maxmp, player.mp+d));
    }
    if(e.spdFlat) player.spd += e.spdFlat;
    if(e.mpZero){ player.maxmp = 0; player.mp = 0; }
    // 저주 계약(mastery_curseweaver): 저주를 받아들일 때마다("이번 유물이 저주일 때") 마력이
    // 영구히 오른다 — "저주를 획득할 때마다 강력해진다"는 컨셉의 핵심 보상.
    if(relic.type==='curse' && player.skills && player.skills.includes('mastery_curseweaver')){
      player.mag = Math.max(0, player.mag + 4);
    }
    const delta = {};
    Object.keys(before).forEach(k=>{ const diff = player[k]-before[k]; if(diff!==0) delta[k]=diff; });
    player.relicAppliedDeltas = player.relicAppliedDeltas || {};
    player.relicAppliedDeltas[id] = delta;
  }

  // 유물 슬롯이 가득 찼을 때, 보유 중인 유물 하나를 버리고 스탯을 정확히 되돌린다.
  function removeRelic(id){
    const idx = player.relics.indexOf(id);
    if(idx<0) return false;
    const delta = (player.relicAppliedDeltas && player.relicAppliedDeltas[id]) || {};
    if(delta.atk) player.atk = Math.max(1, player.atk - delta.atk);
    if(delta.def) player.def = Math.max(0, player.def - delta.def);
    if(delta.mag) player.mag = Math.max(0, player.mag - delta.mag);
    if(delta.maxhp) player.maxhp = Math.max(1, player.maxhp - delta.maxhp);
    if(delta.hp) player.hp = Math.max(1, player.hp - delta.hp);
    if(delta.maxmp) player.maxmp = Math.max(0, player.maxmp - delta.maxmp);
    if(delta.mp) player.mp = Math.max(0, player.mp - delta.mp);
    if(delta.spd) player.spd -= delta.spd;
    player.hp = Math.max(1, Math.min(player.hp, player.maxhp));
    player.mp = Math.max(0, Math.min(player.mp, player.maxmp));
    player.relics.splice(idx,1);
    if(player.relicAppliedDeltas) delete player.relicAppliedDeltas[id];
    if(id==='relic_merchantseal') player.merchantSealStack = 0;
    return true;
  }

  // 상인의 그림자 인장: 상점에서 구매할 때마다 호출된다(shop.js). 스택 최대 10, 스택당
  // "구매 시점의 현재 공격력" 기준 +2%를 즉시 반영한다. relicAppliedDeltas에 누적 기록해
  // 슬롯 교체로 유물을 내려놓을 때 지금까지 쌓인 보너스를 정확히 원복할 수 있게 한다.
  function applyMerchantSealPurchase(){
    if(!hasRelicFlag('merchantSeal')) return;
    player.merchantSealStack = player.merchantSealStack || 0;
    if(player.merchantSealStack >= 10) return;
    player.merchantSealStack += 1;
    const before = player.atk;
    player.atk = Math.max(1, player.atk + Math.round(before*0.02));
    const diff = player.atk - before;
    if(diff!==0){
      player.relicAppliedDeltas = player.relicAppliedDeltas || {};
      const d = player.relicAppliedDeltas['relic_merchantseal'] = player.relicAppliedDeltas['relic_merchantseal'] || {};
      d.atk = (d.atk||0) + diff;
    }
  }

  // 회랑자의 칼날/칼자루는 일반 유물 목록에는 절대 이름으로 등장하지 않고,
  // ？？？ 알 수 없는 유물 자리를 골랐을 때만 확률적으로 나온다.
  const BLADE_HILT_IDS = ['relic_blade', 'relic_hilt'];
  const BLADE_HILT_MYSTERY_CHANCE = 0.22;

  function rollRelicChoices(){
    const owned = player.relics||[];
    const namedPool = RELIC_ALTAR_POOL.filter(id=> !BLADE_HILT_IDS.includes(id) && !owned.includes(id));
    const shuffled = namedPool.slice();
    for(let i=shuffled.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const unclaimedBladeHilt = BLADE_HILT_IDS.filter(id=>!owned.includes(id));
    if(!shuffled.length && !unclaimedBladeHilt.length) return {choices:[], mysteryIdx:-1};

    // 이름이 보이는 두 자리 — 칼날/칼자루는 여기 절대 포함되지 않는다.
    const named = shuffled.slice(0, 2);

    // ？？？ 자리의 실제 정체를 정한다: 낮은 확률로 미획득 칼날/칼자루, 그 외에는 평범한 유물.
    let mysteryId = null;
    if(unclaimedBladeHilt.length && Math.random() < BLADE_HILT_MYSTERY_CHANCE){
      mysteryId = unclaimedBladeHilt[Math.floor(Math.random()*unclaimedBladeHilt.length)];
    } else {
      const rest = shuffled.filter(id=>!named.includes(id));
      const fallbackPool = rest.length ? rest : shuffled;
      if(fallbackPool.length) mysteryId = fallbackPool[Math.floor(Math.random()*fallbackPool.length)];
      else if(unclaimedBladeHilt.length) mysteryId = unclaimedBladeHilt[Math.floor(Math.random()*unclaimedBladeHilt.length)];
    }

    const slotIds = named.slice();
    const mysterySlotIdx = mysteryId!==null ? slotIds.push(mysteryId)-1 : -1;
    if(!slotIds.length) return {choices:[], mysteryIdx:-1};

    // 세 자리의 순서를 섞어 ？？？가 항상 같은 칸에만 나오지 않게 한다.
    const order = slotIds.map((_,i)=>i);
    for(let i=order.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const choices = order.map(i=>slotIds[i]);
    const mysteryIdx = mysterySlotIdx===-1 ? -1 : order.indexOf(mysterySlotIdx);
    return {choices, mysteryIdx};
  }

  function finalizeRelicPick(id, isMystery){
    const r = RELICS[id];
    applyRelicEffect(id);
    player.relics.push(id);
    addToRelicDex(id);
    renderStatus();
    saveGame();
    if(isMystery){
      addLog('✦ 알 수 없는 유물을 손에 넣었다… 무엇인지는 [유물] 화면에서 확인할 수 있다.', 'gold');
    } else if(r.type==='curse'){
      addLog(`☠ 저주 [${r.name}]을(를) 받아들였다… (이후 보상이 늘어난다)`, 'warn');
    } else {
      addLog(`✦ 유물 [${r.name}]을(를) 손에 넣었다!`, 'gold');
    }
  }

  // 유물 슬롯이 가득 찬 상태에서 새 유물을 고르면, 먼저 내려놓을 유물을 선택하게 한다.
  // (한 번 열리면 반드시 하나를 내려놓아야 하며, 취소할 수 없다.)
  // 주의: 저주(type:'curse')는 애초에 유물 슬롯을 차지하지 않으며(getRelicSlotUsage
  // 참고), showCurseAltar()의 안내 문구("저주를 가져가면 두 번 다시 떼어낼 수 없다")
  // 그대로 영구히 지니는 것이 규칙이다. 그래서 이 교체 목록에는 저주를 아예 표시하지
  // 않는다(player.relics 자체는 저주도 함께 담고 있지만, 여기서는 필터링한다).
  function showRelicSwapPrompt(newId, altarOverlay, isMystery){
    const newR = RELICS[newId];
    const typeLabel = {blessing:'축복', contract:'계약', curse:'저주', wild:'변칙'};
    const nameForPrompt = isMystery ? '알 수 없는 유물' : newR.name;
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'relic-swap-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel relic-panel';
    panel.innerHTML = `<h3>유물 슬롯이 가득 찼다</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 10px;">[${nameForPrompt}]을(를) 담으려면, 지니고 있는 유물 하나를 내려놓아야 한다.</p>
      <div class="relic-grid">
      ${player.relics.filter(id=>{ const r=RELICS[id]; return r && r.type!=='curse'; }).map(id=>{
        const r = RELICS[id];
        return `<button class="relic-card type-${r.type}" data-id="${id}">
          <div class="relic-type">${typeLabel[r.type]}</div>
          <div class="relic-name">${r.name}</div>
          <div class="relic-desc">${r.desc}</div>
        </button>`;
      }).join('')}
      </div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);

    panel.querySelectorAll('.relic-card').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const discardId = btn.dataset.id;
        const discardR = RELICS[discardId];
        removeRelic(discardId);
        addLog(`[${discardR.name}]을(를) 내려놓았다.`, 'warn');
        finalizeRelicPick(newId, isMystery);
        overlay.remove();
        if(altarOverlay) altarOverlay.remove();
      });
    });
  }

  function showRelicAltar(atDepth){
    const {choices, mysteryIdx} = rollRelicChoices();
    if(!choices.length) return; // 고를 수 있는 신규 유물이 더 없다
    const typeLabel = {blessing:'축복', contract:'계약', curse:'저주', wild:'변칙'};
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'relic-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel relic-panel relic-panel-locked';
    const slotUsage = getRelicSlotUsage();
    const slotNote = slotUsage>=player.relicSlots
      ? `<p style="text-align:center;color:#ff9a7a;font-size:12px;margin:0 0 8px;">유물 슬롯(${player.relicSlots})이 가득 찼다. 새 유물을 고르면 하나를 내려놓아야 한다.</p>`
      : `<p style="text-align:center;color:var(--parchment-dim);font-size:12px;margin:0 0 8px;">유물 슬롯 ${slotUsage}/${player.relicSlots}</p>`;
    const canSkip = player.gold >= RELIC_SKIP_GOLD_COST;
    panel.innerHTML = `<h3>✦ 유물 제단 ✦</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 6px;">세 개의 유물이 그대를 기다리고 있다. 하나를 선택하라.</p>
      ${slotNote}
      <p class="relic-lock-msg" id="relic-lock-msg">내용을 살펴보는 중…</p>
      <div class="relic-grid">
      ${choices.map((id,i)=>{
        if(i===mysteryIdx){
          return `<button class="relic-card type-mystery" data-id="${id}" disabled>
            <div class="relic-type">？？？</div>
            <div class="relic-name">알 수 없는 유물</div>
            <div class="relic-desc">무엇이 담겨 있는지는 손에 넣기 전까지 알 수 없다.</div>
          </button>`;
        }
        const r = RELICS[id];
        return `<button class="relic-card type-${r.type}" data-id="${id}" disabled>
          <div class="relic-type">${typeLabel[r.type]}</div>
          <div class="relic-name">${r.name}</div>
          <div class="relic-desc">${r.desc}</div>
        </button>`;
      }).join('')}
      </div>
      <div style="text-align:center; margin-top:10px;">
        <button class="link-btn" id="relic-skip-btn" disabled>${canSkip ? `고르지 않는다 (골드 ${RELIC_SKIP_GOLD_COST} 소모)` : `고르지 않는다 (골드 부족, ${RELIC_SKIP_GOLD_COST} 필요)`}</button>
      </div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);

    const LOCK_MS = 1500;
    setTimeout(()=>{
      panel.classList.remove('relic-panel-locked');
      panel.querySelectorAll('.relic-card').forEach(btn=>{ btn.disabled = false; });
      const skipBtn = panel.querySelector('#relic-skip-btn');
      if(skipBtn && canSkip) skipBtn.disabled = false;
      const msg = panel.querySelector('#relic-lock-msg');
      if(msg) msg.remove();
    }, LOCK_MS);

    panel.querySelectorAll('.relic-card').forEach((btn,i)=>{
      btn.addEventListener('click', ()=>{
        if(btn.disabled) return;
        const id = btn.dataset.id;
        const isMystery = (i===mysteryIdx);
        if(getRelicSlotUsage() >= player.relicSlots){
          showRelicSwapPrompt(id, overlay, isMystery);
          return;
        }
        finalizeRelicPick(id, isMystery);
        overlay.remove();
      });
    });

    const skipBtn = panel.querySelector('#relic-skip-btn');
    if(skipBtn){
      skipBtn.addEventListener('click', ()=>{
        if(skipBtn.disabled) return;
        if(player.gold < RELIC_SKIP_GOLD_COST) return;
        player.gold -= RELIC_SKIP_GOLD_COST;
        renderStatus();
        saveGame();
        overlay.remove();
        addLog(`골드 ${RELIC_SKIP_GOLD_COST}을(를) 지불하고 제단을 뒤로했다.`, 'warn');
      });
    }
  }

  // 저주 제단: 유물 제단과 달리 단 하나의 저주만 제시하며, 받아들일지 떠날지 직접 선택한다.
  function showCurseAltar(atDepth){
    const pool = CURSE_ALTAR_POOL.filter(id=>!player.relics.includes(id));
    if(!pool.length) return; // 이미 모든 저주를 갖고 있다
    const id = pool[Math.floor(Math.random()*pool.length)];
    const r = RELICS[id];
    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';
    overlay.id = 'curse-overlay';
    const panel = document.createElement('div');
    panel.className = 'shop-panel relic-panel relic-panel-locked';
    panel.innerHTML = `<h3 style="color:#d99fff;">☠ 피로 물든 제단 ☠</h3>
      <p style="text-align:center;color:var(--parchment-dim);font-size:12.5px;font-style:italic;margin:-4px 0 10px;">이 제단에서 저주를 가져가면, 그것은 두 번 다시 떼어낼 수 없다.<br>대신 저주를 짊어질수록 이후의 보상이 커진다.</p>
      <p class="relic-lock-msg" id="curse-lock-msg">내용을 살펴보는 중…</p>
      <div class="relic-grid">
        <button class="relic-card type-curse" id="curse-card" disabled>
          <div class="relic-type">저주</div>
          <div class="relic-name">${r.name}</div>
          <div class="relic-desc">${r.desc}</div>
        </button>
      </div>
      <div style="text-align:center; margin-top:10px; display:flex; gap:8px; justify-content:center;">
        <button class="btn" id="curse-decline">떠난다</button>
        <button class="btn btn-danger" id="curse-accept" disabled>받아들인다</button>
      </div>`;
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);

    const LOCK_MS = 1500;
    setTimeout(()=>{
      panel.classList.remove('relic-panel-locked');
      const acceptBtn = panel.querySelector('#curse-accept');
      if(acceptBtn) acceptBtn.disabled = false;
      const msg = panel.querySelector('#curse-lock-msg');
      if(msg) msg.remove();
    }, LOCK_MS);

    panel.querySelector('#curse-decline').addEventListener('click', ()=>{
      overlay.remove();
      addLog('제단에서 풍기는 불길한 기운을 뒤로하고 떠났다.', 'warn');
    });
    panel.querySelector('#curse-accept').addEventListener('click', ()=>{
      if(panel.querySelector('#curse-accept').disabled) return;
      finalizeRelicPick(id);
      overlay.remove();
    });
  }

  function findEquipmentForDepth(){
    const pool = Object.keys(EQUIPMENT).filter(id=>EQUIPMENT[id].minDepth<=depth && !player.equipOwned.includes(id));
    if(!pool.length) return null;
    return pool[Math.floor(Math.random()*pool.length)];
  }

  function findRareDropForDepth(){
    const pool = Object.keys(RARE_EQUIPMENT).filter(id=>RARE_EQUIPMENT[id].minDepth<=depth && !player.equipOwned.includes(id));
    if(!pool.length) return null;
    return pool[Math.floor(Math.random()*pool.length)];
  }
  function findEpicDropForDepth(){
    const pool = Object.keys(EPIC_EQUIPMENT).filter(id=>EPIC_EQUIPMENT[id].minDepth<=depth && !player.equipOwned.includes(id));
    if(!pool.length) return null;
    return pool[Math.floor(Math.random()*pool.length)];
  }
