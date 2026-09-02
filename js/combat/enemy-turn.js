"use strict";
/*
적 턴 처리 체인 — enemyTurn(마녀의 시계 유물 래퍼) -> tickActiveRig(장치 자동사격)
-> enemyTurnReal -> enemyAction(실제 적 행동) -> finishEnemyTurn, 상태이상(dot) 적용.
주의: enemyTurn/tickActiveRig/enemyTurnReal/enemyAction의 호출 순서는 원본 그대로이며
반드시 이 순서를 유지해야 유물 효과(마녀의 시계, 가동 장치)가 정상 동작한다.
로봇군단장(mastery_multideploy) 대응으로 tickActiveRig(slotKey, onDone)이 슬롯 인자를
받도록 바뀌었다 — battleFlags.rig를 틱한 뒤 battleFlags.rig2가 있으면 이어서 틱하고,
그 다음에야 enemyTurnReal로 넘어간다(단일 rig만 쓰는 기존 직업들은 rig2가 항상 비어
있으므로 동작에 변화가 없다).
export(전역): getWitchClockExtraChance, enemyTurn, triggerAfterimageStrike, tickActiveRig,
              enemyTurnReal, processDotsSequentially, enemyAction, finishEnemyTurn, applyDot,
              applySkillDots, applySkillModifiers, effectiveAtk, consumeAtkBuff,
              getBloodPactDodgeBonus, getTimeWarpExtraChance, getCreedAtkBonus, getLuckWaveBonus,
              getVenomDmgPerStack, hasEliteTrait, getEffectiveEnemyAtk, handleEliteOnHitTraits,
              checkLastStand
주의(신규 — 보스전 리뉴얼): 보스는 스킬을 쓰기로 결정될 때마다(치유 제외)
     즉시 발동하는 대신 한 턴 예고("힘을 끌어모은다")부터 하고, 그 다음
     보스 턴에 enemy.pendingSkillKey를 강제로 확정 발동시킨다(실제 데미지
     계산은 이미 있던 skillKey 분기를 그대로 재사용). 처음엔 분노 게이지가
     차야만 필살기 하나만 예고하는 구조였는데, 사용자 피드백으로 "스킬을
     쓸 때마다 전부 예고"로 다시 만들었다 — 분노 게이지 관련 코드는 전부
     제거했다. 최후의 발악(3페이즈)은 checkLastStand()가 그대로 담당한다.
의존성: state.js, relics.js, combat/battle-fx.js, combat/battle-end.js
주의(신규 — 정예 특성): hasEliteTrait/getEffectiveEnemyAtk/handleEliteOnHitTraits가
     combat/battle-setup.js가 배정한 enemy.eliteTraits를 읽어 전투 중 효과를
     발동시킨다. handleEliteOnHitTraits는 combat/battle-fx.js의 updateEnemyHpBar()가
     enemy.hp 감소를 감지할 때마다 호출한다(철갑 환불/반사/복수 예약) —
     player-actions.js에 흩어진 개별 피해 적용 지점을 손대지 않기 위한 설계.
주의: applySkillModifiers()에 저주술사(mageCurseNova)의 s.curseCountBonus 처리가 추가되어
     있다 — 기존 statusSynergyBonus와 완전히 동일한 패턴(보유 개수만큼 곱연산 배율)이라
     별도 신규 헬퍼 없이 relics.js의 getCurseCount()를 직접 호출한다.
     triggerAfterimageStrike()는 고정된 일반 공격이 아니라, battleFlags.afterimageQueue
     (combat/player-actions.js가 스킬 사용 직후 기록)를 읽어 방금 쓴 스킬의 이름·타격
     횟수·연출을 그대로 재현하되 총 피해는 그 스킬이 실제로 낸 피해의 50%로 절반만
     입힌다(연속 베기 같은 다단히트 스킬은 다단히트 연출 그대로, 단발 스킬은 단발로).
     환영 은신(직접 피해 없는 defbuff)처럼 대응 스킬 없이 예약되는 경우를 대비한
     방어적 처리로, queue가 비어 있으면 effectiveAtk() 기반 기본 강타로 대체된다
     (현재 환영검사의 스킬 구성상 실제로는 항상 queue가 채워져 있지만, 안전장치로
     남겨둔다).
*/

  /* ============ 정예 특성(사용자 요청) 헬퍼 ============ */
  // 데이터/배정은 combat/battle-setup.js의 ELITE_TRAITS·rollEliteTraits()가 담당하고,
  // 실제 전투 중 효과 발동은 대부분 이 파일에 모아뒀다.
  function hasEliteTrait(key){
    return !!(enemy && enemy.eliteTraits && enemy.eliteTraits.includes(key));
  }
  // 광폭(HP50%↓ 공격력+30%)/사냥꾼(플레이어HP30%↓ 피해+40%)/복수(피격 후 1회
  // 다음 공격+30%, handleEliteOnHitTraits가 예약)/광기(3턴마다 그 턴 공격력
  // 크게 상승 — "추가 행동"을 문자대로 구현하면 enemyAction()의 여러 종료
  // 지점을 전부 손대야 해서, 대신 주기적으로 강화된 한 방을 주는 방식으로
  // 단순화했다)를 전부 반영한 최종 공격력.
  function getEffectiveEnemyAtk(){
    let a = enemy.atk;
    if(hasEliteTrait('berserk') && enemy.maxhp>0 && (enemy.hp/enemy.maxhp)<=0.5){
      a = Math.round(a*1.3);
    }
    if(hasEliteTrait('hunter') && player.maxhp>0 && (player.hp/player.maxhp)<=0.3){
      a = Math.round(a*1.4);
    }
    if(hasEliteTrait('revenge') && enemy.revengeArmed){
      a = Math.round(a*1.3);
      enemy.revengeArmed = false;
    }
    if(hasEliteTrait('madness')){
      enemy.madnessTurn = (enemy.madnessTurn||0) + 1;
      if(enemy.madnessTurn % 3 === 0) a = Math.round(a*1.6);
    }
    return a;
  }
  // combat/battle-fx.js의 updateEnemyHpBar()가 enemy.hp 감소를 감지할 때마다
  // 호출한다(dealt = 방금 줄어든 양). 철갑/반사/복수 예약을 처리한다.
  function handleEliteOnHitTraits(dealt){
    if(!enemy || battleOver || dealt<=0) return;
    if(!enemy.eliteTraits || !enemy.eliteTraits.length) return;
    // 철갑: 첫 2턴 동안 방금 들어온 피해의 40%를 즉시 되돌려준다(피해를
    // "사전에" 줄이려면 player-actions.js의 40여 곳을 전부 고쳐야 해서,
    // 대신 사후 환불 방식으로 동일한 최종 효과를 낸다).
    if(hasEliteTrait('ironskin') && (enemy.ironskinTurns||0)>0){
      const refund = Math.round(dealt*0.4);
      if(refund>0) enemy.hp = Math.min(enemy.maxhp, enemy.hp+refund);
    }
    // 반사: 받은 피해의 15%를 플레이어에게 반사.
    if(hasEliteTrait('reflect')){
      const reflectDmg = Math.max(1, Math.round(dealt*0.15));
      player.hp = Math.max(0, player.hp - reflectDmg);
      popDamage('-'+reflectDmg, 'bleed');
      renderStatus();
    }
    // 복수: 다음 적 공격이 강화되도록 예약(getEffectiveEnemyAtk에서 소비).
    if(hasEliteTrait('revenge')) enemy.revengeArmed = true;
  }

  /* ============ 보스 최후의 발악(사용자 요청 — 보스전 리뉴얼) ============ */
  // combat/battle-fx.js의 updateEnemyHpBar()가 enemy.hp 감소를 감지할 때마다
  // handleEliteOnHitTraits와 함께 호출한다.
  // 최종보스 전용 3페이즈: 더 이상 부활(광폭화) 카드가 남아있지 않은 마지막
  // 생명력에서 HP가 30% 이하로 떨어지면 자동 발동. 부활은 하지 않고, 그
  // 생명력 안에서 공격력↑/방어력↓/매 턴 자체 피해가 지속된다.
  function checkLastStand(){
    if(!enemy || !enemy.isBoss || battleOver) return;
    if(!(enemy.isFinal || enemy.isTrueFinal)) return;
    if(enemy.lastStandTriggered || enemy.hp<=0) return;
    const steps = enemy.isTrueFinal ? ENRAGE_STEPS_TRUE : ENRAGE_STEPS_FINAL;
    if((enemy.phase||0) < steps.length) return; // 아직 부활 카드가 남아있으면 최후의 발악 아님
    if(enemy.hp > enemy.maxhp*0.3) return;
    enemy.lastStandTriggered = true;
    enemy.lastStandActive = true;
    enemy.atk = Math.round(enemy.atk*1.3);
    enemy.def = Math.max(0, Math.round(enemy.def*0.7));
    enemy.skillChance = Math.min(0.9, (enemy.skillChance||0.4)+0.25);
    playBanner('최후의 발악!', 'enrage');
    setBattleMsg(`${enemy.name}이(가) 남은 생명을 불태운다!`, '공격력이 크게 오르고 방어력이 떨어졌다. 매 턴 스스로 상처를 입는다.');
    if(typeof updateBossIntentCard==='function') updateBossIntentCard();
  }

  function enemyTurn(){
    if(battleOver) return;
    if(battleFlags && !battleFlags.witchClockUsedThisTurn){
      const chance = getWitchClockExtraChance() + getTimeWarpExtraChance();
      if(chance>0 && Math.random()<chance){
        battleFlags.witchClockUsedThisTurn = true;
        // 시간 조각(mastery_timewarp): 이 추가 행동이 발동할 때마다 시간술사는
        // 시간 조각을 하나 얻는다(최대 5, 레벨12/15 스킬의 재료). 유물(마녀의 시계)
        // 만으로 발동했을 때는 조각이 쌓이지 않는다 — 마스터리를 보유했을 때만.
        if(player.skills && player.skills.includes('mastery_timewarp')){
          battleFlags.timeStacks = Math.min(5, (battleFlags.timeStacks||0)+1);
        }
        resetCommandUI();
        popDamage('추가 행동!', 'heal');
        playCastBurst();
        Sound.buff();
        // 예전엔 이 추가 행동을 항상 "마녀의 시계"가 준 것처럼 문구가 고정되어
        // 있었다 — 시간술사 마스터리(시간 왜곡)만으로 발동해도 유물 이름이
        // 잘못 뜨는 버그였다. 실제로 무엇을 갖고 있는지에 따라 문구를 고른다.
        const hasTimeWarp = player.skills && player.skills.includes('mastery_timewarp');
        const hasWitchClock = hasRelicFlag('extraActionBySpd');
        let sourceLabel;
        if(hasTimeWarp && hasWitchClock) sourceLabel = '시간 왜곡과 마녀의 시계가 함께';
        else if(hasTimeWarp) sourceLabel = '시간 왜곡이';
        else sourceLabel = '마녀의 시계가';
        setBattleMsg(`${player.name}의 몸이 시간을 앞질러 움직인다!`, `${sourceLabel} 한 번 더 행동할 기회를 준다!`);
        return;
      }
    }
    if(battleFlags) battleFlags.witchClockUsedThisTurn = false;
    // 잔영(mastery_afterimage): 기본 공격 적중 시 확률적으로 예약된 분신 공격을,
    // 적의 턴이 열리기 직전 이 지점에서 대신 한 번 처리한다(가동 장치 자동사격과
    // 동일한 타이밍 규칙). 분신 공격 후에는 적의 턴이 정상적으로 이어진다.
    if(battleFlags && battleFlags.afterimagePending){
      battleFlags.afterimagePending = false;
      triggerAfterimageStrike();
      return;
    }
    tickRigsThenProceed();
  }
  // 가동 중인 로봇(rig, rig2)이 있으면 순서대로 자동사격을 처리한 뒤 적의 실제 턴으로
  // 넘어간다. 각 슬롯은 라운드당 정확히 한 번만 틱해야 한다 — tickRigSlotOnce()가
  // "이 슬롯이 남아있으면 한 번 쏘고 next로", "없으면 바로 next로"만 담당하고,
  // rig 슬롯을 다 쏜 뒤의 next가 곧바로 rig2 슬롯 체크로 넘어가도록 체인을 구성한다.
  // (주의: rig 슬롯의 콜백으로 tickRigsThenProceed 자신을 다시 넘기면 안 된다 — 그러면
  // rig.turnsLeft가 남아있는 한 같은 라운드 안에서 즉시 재귀적으로 계속 쏴 버려서,
  // 예를 들어 3턴짜리 장치가 설치 직후 한 라운드 만에 3번 다 쏘고 소멸하는 버그가
  // 생긴다 — 실제로 발생했던 회귀였다.)
  function tickRigsThenProceed(){
    tickRigSlotOnce('rig', ()=> tickRigSlotOnce('rig2', enemyTurnReal));
  }
  function tickRigSlotOnce(slotKey, next){
    if(battleFlags && battleFlags[slotKey] && battleFlags[slotKey].turnsLeft>0){
      tickActiveRig(slotKey, next);
    } else {
      next();
    }
  }
  // 환영검사의 분신이 적의 턴이 열리기 직전 자동으로 한 번 더 공격한다.
  // 사용자 요청: 그냥 고정된 일반 공격이 아니라, 방금 사용한 스킬의 이름과 연출을
  // 그대로 재현한다(예: 연속 베기를 썼다면 분신도 연속 베기 이펙트로 여러 번
  // 베어낸다) — 다만 총 피해량은 방금 그 스킬이 낸 실제 피해의 50%로 줄어든다.
  // battleFlags.afterimageQueue에 combat/player-actions.js가 미리 기록해둔
  // {name, magic, multihit, hits, totalDamage}를 읽어 재현 방식을 결정한다.
  // 환영검사의 분신이 적의 턴이 열리기 직전 자동으로 한 번 더(또는 분신 배가가
  // 걸려 있었다면 두 번) 공격한다. queue.repeats(기본 1, 분신 배가 시 2)만큼
  // 재현 시퀀스 전체(단발이든 멀티히트든)를 반복한 뒤에야 enemyTurnReal()로
  // 넘어간다 — 재현 도중에 checkBattleEnd()로 전투가 끝나면 그 자리에서 멈춘다.
  // queue.ratio(기본 0.5, 분신 배가 시 더 높은 값)로 매 반복의 위력을 계산한다.
  function triggerAfterimageStrike(){
    const queue = battleFlags && battleFlags.afterimageQueue;
    const skillName = (queue && queue.name) || '환영검';
    const isMagic = !!(queue && queue.magic);
    const isMultihit = !!(queue && queue.multihit);
    const hits = Math.max(1, (queue && queue.hits) || 1);
    const ratio = (queue && queue.ratio) || 0.5;
    const repeats = Math.max(1, (queue && queue.repeats) || 1);
    const fallbackDmg = Math.max(1, Math.round(effectiveAtk()*1.0));
    const perRepeatTotal = Math.max(1, Math.round(((queue && queue.totalDamage) || fallbackDmg) * ratio));
    battleFlags.afterimageQueue = null;

    function playOneRepeat(repeatIdx, onDone){
      const introLine = repeats>1
        ? (repeatIdx===0 ? '그림자 속에서 첫 번째 잔영이 나타난다!' : '그림자 속에서 두 번째 잔영이 뒤이어 나타난다!')
        : '그림자 속에서 잔영이 다시 나타난다!';
      if(isMultihit && hits>1){
        setTimeout(()=>{
          if(battleOver) return;
          setBattleMsg(introLine, `'${skillName}'의 잔영이 재현된다…`);
          const per = Math.max(1, Math.round(perRepeatTotal/hits));
          let dealt = 0;
          let idx = 0;
          const doHit = ()=>{
            if(battleOver) return;
            const isLast = idx===hits-1;
            const hitDmg = isLast ? Math.max(1, perRepeatTotal-dealt) : per;
            dealt += hitDmg;
            enemy.hp = Math.max(0, enemy.hp - hitDmg);
            updateEnemyHpBar(); popDamage('-'+hitDmg, 'crit'); spawnSlashMark(idx);
            if(isMagic) Sound.magic(); else Sound.slash();
            idx++;
            if(idx<hits){
              setTimeout(doHit, 220);
            } else {
              renderStatus();
              if(checkBattleEnd()) return;
              onDone();
            }
          };
          doHit();
        }, 450);
        return;
      }
      setTimeout(()=>{
        if(battleOver) return;
        const dmg = perRepeatTotal;
        enemy.hp = Math.max(0, enemy.hp - dmg);
        updateEnemyHpBar(); popDamage('-'+dmg, 'crit');
        if(isMagic) Sound.magic(); else Sound.slash();
        setBattleMsg(introLine, `'${skillName}'의 잔영이 ${dmg}의 추가 피해를 입혔다!`);
        renderStatus();
        if(checkBattleEnd()) return;
        onDone();
      }, 450);
    }

    let repeatIdx = 0;
    const runNext = ()=>{
      if(repeatIdx>=repeats){
        setTimeout(()=> enemyTurnReal(), 400);
        return;
      }
      playOneRepeat(repeatIdx, ()=>{
        repeatIdx++;
        runNext();
      });
    };
    runNext();
  }
  // 가동 중인 장치(포탑/드론/오메가 유닛/역할 로봇)가 있으면, 적의 턴이 시작되기
  // 직전에 자동으로 한 발 쏜다. slotKey는 'rig' 또는 'rig2'이며, 처리가 끝나면
  // onDone()을 호출해 다음 단계(다른 슬롯 틱 또는 enemyTurnReal)로 넘어간다.
  function tickActiveRig(slotKey, onDone){
    const rig = battleFlags[slotKey];
    setTimeout(()=>{
      if(battleOver) return;
      const dmg = Math.max(1, rig.dmgPerTick);
      enemy.hp = Math.max(0, enemy.hp - dmg);
      updateEnemyHpBar(); popDamage('-'+dmg, 'rig');
      Sound.hit();
      // 메카닉 리뉴얼(사용자 요청) — 장치가 사격할 때마다 압력도 함께 쌓는다.
      let pressureMsg = '';
      if(rig.pressurePerTick && battleFlags){
        const pressureCapTick = (typeof getPressureCap==='function') ? getPressureCap() : 100;
        battleFlags.pressure = Math.min(pressureCapTick, (battleFlags.pressure||0) + rig.pressurePerTick);
        if(typeof applyOverheatOverflowDamage==='function') applyOverheatOverflowDamage(battleFlags.pressure);
        if(typeof updatePressureGauge==='function') updatePressureGauge();
        pressureMsg = ` 압력 +${rig.pressurePerTick}(현재 ${battleFlags.pressure}).`;
      }
      // 로봇 사격 시 해당 로봇 슬롯을 살짝 번쩍여 "지금 이 로봇이 쐈다"는 게
      // 눈에 보이게 한다(사용자 요청 — 로봇이 실제로 화면에 있다는 걸 체감하게
      // 만드는 핵심 연출).
      flashRigSlot(slotKey);
      setBattleMsg(`${rig.name}이(가) 자동으로 사격한다!`, `${dmg}의 추가 피해!${pressureMsg}`);
      rig.turnsLeft -= 1;
      const expired = rig.turnsLeft<=0;
      if(expired) battleFlags[slotKey] = null;
      renderStatus();
      updateRigVisuals();
      if(checkBattleEnd()) return;
      setTimeout(()=>{
        if(expired){ setBattleMsg(`${rig.name}의 가동이 멈췄다.`, ''); }
        setTimeout(()=> onDone(), expired?500:250);
      }, expired?250:0);
    }, 450);
  }
  function enemyTurnReal(){
    if(battleOver) return;
    // 행운의 파도(mastery_luckwave): 매 라운드(적의 실제 턴이 열릴 때)마다 운
    // 게이지가 -1~+1 사이에서 무작위로 오르내린다(누적 상한 ±3). 값은
    // getLuckWaveBonus()를 통해 effectiveAtk()에 실시간 반영된다.
    if(battleFlags && player.skills && player.skills.includes('mastery_luckwave')){
      const drift = Math.random()*2 - 1;
      battleFlags.luckGauge = Math.max(-3, Math.min(3, (battleFlags.luckGauge||0) + drift));
    }
    if(enemy && enemy.exposedTurns>0){
      enemy.exposedTurns -= 1;
      updateStatusBadges();
    }
    // 메카닉 리뉴얼(사용자 요청) — 표적 마킹도 exposedTurns와 동일한 방식으로 감소.
    if(enemy && enemy.markedTurns>0){
      enemy.markedTurns -= 1;
      updateStatusBadges();
    }
    if(battleFlags){
      battleFlags.hourglassTurn = (battleFlags.hourglassTurn||0) + 1;
      const limit = getRelicSum('turnLimitTurns');
      if(limit>0 && battleFlags.hourglassTurn>limit){
        const penaltyPct = getRelicSum('turnLimitPenaltyPct');
        if(penaltyPct>0 && player.hp>0){
          const selfDmg = Math.max(1, Math.round(player.maxhp*penaltyPct));
          player.hp = Math.max(0, player.hp-selfDmg);
          popDamage('-'+selfDmg, 'bleed');
          setBattleMsg('모래가 다 흘러내렸다…', `모래시계의 저주로 ${selfDmg}의 피해를 입었다.`);
          renderStatus();
          if(checkBattleEnd()) return;
        }
      }
    }
    // 검은 기도(paladinDarkPrayer, 회랑의 기사)가 건 임시 공격력↑/방어력↓를 정확히
    // 그 수치만큼만 되돌린다(다른 원인으로 공/방이 바뀌었어도 서로 간섭하지 않도록
    // 델타를 직접 저장해뒀다가 그대로 복구 — 불확실성의 주사위 revertDiceDelta()와
    // 동일한 설계 원칙).
    if(player.knightVulnTurns>0){
      player.knightVulnTurns -= 1;
      if(player.knightVulnTurns<=0){
        player.atk -= (player.knightVulnAtkBonus||0);
        player.def += (player.knightVulnDefPenalty||0);
        player.knightVulnAtkBonus = 0;
        player.knightVulnDefPenalty = 0;
        renderStatus();
      }
    }
    // 정예 특성 — 재생(매 턴 최대HP 4% 회복), 철갑 지속시간 카운트다운,
    // 독성(플레이어 중독) 틱. 전부 적의 실제 턴이 열릴 때마다 한 번씩 처리한다.
    if(enemy && enemy.eliteTraits && enemy.eliteTraits.length){
      if(hasEliteTrait('regen') && enemy.hp>0 && enemy.hp<enemy.maxhp){
        const heal = Math.max(1, Math.round(enemy.maxhp*0.04));
        enemy.hp = Math.min(enemy.maxhp, enemy.hp+heal);
        updateEnemyHpBar();
      }
      if(hasEliteTrait('ironskin') && enemy.ironskinTurns>0){
        enemy.ironskinTurns -= 1;
      }
    }
    if((player.poisonTurns||0)>0){
      const pdmg = player.poisonDmgPerTurn||0;
      player.poisonTurns -= 1;
      if(pdmg>0 && player.hp>0){
        player.hp = Math.max(0, player.hp-pdmg);
        popDamage('-'+pdmg, 'bleed');
        setBattleMsg('중독된 상처가 욱신거린다…', `중독 피해로 ${pdmg}의 피해를 입었다.`);
        renderStatus();
        if(checkBattleEnd()) return;
      }
    }
    // 최후의 발악(사용자 요청 — 보스전 리뉴얼): 매 턴 스스로 HP를 깎는다.
    if(enemy && enemy.lastStandActive && enemy.hp>0){
      const selfDmg = Math.max(1, Math.round(enemy.maxhp*0.05));
      enemy.hp = Math.max(0, enemy.hp - selfDmg);
      updateEnemyHpBar();
      popDamage('-'+selfDmg, 'bleed');
      setBattleMsg(`${enemy.name}이(가) 스스로를 불태우며 힘을 쥐어짠다…`, `자체 피해 ${selfDmg}.`);
      if(checkBattleEnd()) return;
    }
    // 재생의 갑옷(사용자 요청 — 장비 강화): 턴 종료 시 최대HP의 일정 %를 회복.
    if(typeof getSpecialSum==='function' && player.hp>0 && player.hp<player.maxhp){
      const regenPct = getSpecialSum('turnRegenPct');
      if(regenPct>0){
        const heal = Math.max(1, Math.round(player.maxhp*regenPct));
        player.hp = Math.min(player.maxhp, player.hp+heal);
        renderStatus();
        popDamage('+'+heal, 'heal');
      }
    }
    const activeDots = (enemy.dots||[]).filter(d=>d.turns>0);
    // 독 중첩(mastery_venomstacks, 맹독 연금술사): 일반 dot과 달리 턴이 지나도
    // 사라지지 않고 전투가 끝날 때까지 유지되므로, enemy.dots에 영구 저장하지
    // 않는다. 대신 매 라운드 이 시점에서 현재 스택 수 기준으로 즉석 계산한 임시
    // dot 객체를 만들어 기존 processDotsSequentially()의 연출/피해 파이프라인에
    // 그대로 얹는다(신규 애니메이션 코드 불필요). enemy.dots 배열 자체에는 들어가지
    // 않으므로, 라운드가 끝날 때 enemy.dots를 정리하는 로직(processDotsSequentially
    // 내부)의 영향을 받지 않고 다음 라운드에도 다시 새로 계산된다.
    if(enemy && (enemy.venomStacks||0) > 0){
      const venomTickDmg = Math.max(1, Math.round(enemy.venomStacks * getVenomDmgPerStack()));
      activeDots.push({type:'poison', turns:1, dmgPerTurn:venomTickDmg, label:`맹독(${enemy.venomStacks}중첩)`});
    }
    if(activeDots.length){
      processDotsSequentially(activeDots, 0);
    } else {
      enemyAction();
    }
  }
  function processDotsSequentially(dots, idx){
    if(idx >= dots.length){
      enemy.dots = (enemy.dots||[]).filter(d=>d.turns>0);
      updateStatusBadges();
      if(checkBattleEnd()) return;
      enemyAction();
      return;
    }
    setTimeout(()=>{
      const d = dots[idx];
      enemy.hp = Math.max(0, enemy.hp - d.dmgPerTurn);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+d.dmgPerTurn, d.type);
      playStatusFx(d.type);
      Sound.poisonHit();
      setBattleMsg(`${enemy.name}이(가) ${d.label}(으)로 ${d.dmgPerTurn}의 피해를 입었다!`, '');
      d.turns -= 1;
      updateStatusBadges();
      if(checkBattleEnd()) return;
      processDotsSequentially(dots, idx+1);
    }, 500);
  }
  function enemyAction(){
    setTimeout(()=>{
      let skillKey = null;
      // 보스 예고 스킬(사용자 요청 — 어떤 스킬이든 매번 예고). 예고했던 다음
      // 턴이면 그 스킬을 강제로 확정 발동한다.
      if(enemy.isBoss && enemy.aboutToUltimate){
        skillKey = enemy.pendingSkillKey;
        enemy.aboutToUltimate = false;
        enemy.telegraphed = false;
        enemy.pendingSkillKey = null;
        if(typeof updateBossIntentCard==='function') updateBossIntentCard();
      } else if(enemy.skills.length && Math.random()<(enemy.skillChance||0.4)){
        const chosen = enemy.skills[Math.floor(Math.random()*enemy.skills.length)];
        // 보스이고 치유가 아닌 스킬이면 즉시 쓰지 않고 한 턴 예고부터 한다.
        // 치유는 플레이어에게 위협이 아니라 예고할 이유가 없어 그대로 즉시 사용.
        if(enemy.isBoss && chosen !== 'heal'){
          enemy.pendingSkillKey = chosen;
          enemy.telegraphed = true;
          enemy.aboutToUltimate = true;
          setBattleMsg(`${enemy.name}이(가) 힘을 끌어모은다…`, `⚠ 다음 턴 [${BOSS_SKILL_LABELS[chosen]||'강공격'}]이(가) 발동한다!`);
          showToast(`<h3>⚠ 예고</h3><p><b>[${BOSS_SKILL_LABELS[chosen]||'강공격'}]</b> — 다음 턴 발동!</p>`, '#ff4a3a');
          if(typeof updateBossIntentCard==='function') updateBossIntentCard();
          finishEnemyTurn();
          return;
        }
        skillKey = chosen;
      }
      if(skillKey==='heal' && enemy.hp < enemy.maxhp*0.5){
        const h = Math.round(enemy.maxhp*0.2);
        enemy.hp = Math.min(enemy.maxhp, enemy.hp+h);
        updateEnemyHpBar();
        popDamage('+'+h,'heal');
        setBattleMsg(`${enemy.name}이(가) 상처를 치유했다!`, `HP +${h}`);
        finishEnemyTurn();
        return;
      }
      let dmg;
      let label = `${enemy.name}의 공격!`;
      // 정예 특성(광폭/사냥꾼/복수/광기)을 전부 반영한 이번 턴의 실제 공격력.
      const effAtk = getEffectiveEnemyAtk();
      if(skillKey==='smash'){ dmg = Math.round(effAtk*1.6); label = `${enemy.name}이(가) 강타를 날린다!`; }
      else if(skillKey==='bite'){ dmg = Math.round(effAtk*1.4); label = `${enemy.name}이(가) 물어뜯는다!`; }
      else if(skillKey==='curse'){ dmg = Math.round(effAtk*1.3); label = `${enemy.name}이(가) 저주를 건다!`; }
      else if(skillKey==='heroWarriorSmite'){ dmg = Math.round(effAtk*2.0); label = `${enemy.name}이(가) 필멸의 참격을 내리찍는다!`; }
      else if(skillKey==='heroMageBurst'){ dmg = Math.round(effAtk*2.2); label = `${enemy.name}이(가) 멸망의 화염구를 쏘아보낸다!`; }
      else if(skillKey==='heroRogueSlash'){ dmg = Math.round(effAtk*1.9); label = `${enemy.name}이(가) 그림자처럼 스며들어 베어낸다!`; }
      else if(skillKey==='heroPaladinSmite'){ dmg = Math.round(effAtk*1.7); label = `${enemy.name}이(가) 심판의 빛을 내려찍는다!`; }
      else if(skillKey==='heroMechanicBlast'){ dmg = Math.round(effAtk*1.8); label = `${enemy.name}이(가) 장치를 기폭시킨다!`; }
      else if(skillKey==='heroJesterGamble'){
        if(Math.random()<0.5){ dmg = Math.round(effAtk*3.0); label = `${enemy.name}의 동전이 앞면으로 떨어진다! 회심의 일격!`; }
        else { dmg = 0; label = `${enemy.name}의 동전이 뒷면으로 떨어진다…`; }
      }
      else if(skillKey==='trueBossJudgment'){ dmg = Math.round(effAtk*1.9); label = `${enemy.name}이(가) 태초의 심판을 내리찍는다!`; }
      else if(skillKey==='krakenGrip'){ dmg = Math.round(effAtk*1.75); label = `${enemy.name}이(가) 촉수로 온몸을 옥죈다!`; }
      else if(skillKey==='ironCrush'){ dmg = Math.round(effAtk*1.9); label = `${enemy.name}이(가) 쇳덩이 같은 주먹을 내리찍는다!`; }
      else if(skillKey==='wraithWail'){ dmg = Math.round(effAtk*1.55); label = `${enemy.name}의 귀곡성이 정신을 뒤흔든다!`; }
      else if(skillKey==='eliteFerocity'){ dmg = Math.round(effAtk*2.1); label = `${enemy.name}이(가) 정예의 위압적인 기세로 짓쳐든다!`; }
      // ---------- 신규 4종 보스 전용 스킬 ----------
      // 각 스킬마다 playBanner()로 서로 다른 시각 효과를 준다(사용자 요청 —
      // "유물 발동처럼 스킬마다 이펙트가 달랐으면"). 배너 클래스별 색상/글로우는
      // index.html에 CSS로 추가해야 실제로 보인다(별도 안내 참고).
      else if(skillKey==='lockedVoices'){ dmg = Math.round(effAtk*1.5); label = `${enemy.name}의 두건 속에서 수십 개의 목소리가 동시에 흘러나온다!`; playBanner('잠긴 목소리들','fx-voices'); }
      else if(skillKey==='prophecyFlame'){ dmg = Math.round(effAtk*2.0); label = `지팡이에 갇힌 유령불이 폭발하듯 타오른다!`; playBanner('예언의 불꽃','fx-prophecy'); }
      else if(skillKey==='judgmentKey'){ dmg = Math.round(effAtk*1.6); label = `${enemy.name}이(가) 굽은 단검으로 급소를 찌른다 — 짤그랑, 열쇠 부딪는 소리가 울린다.`; playBanner('심판의 열쇠','fx-key'); }
      else if(skillKey==='whisperingHorn'){ dmg = Math.round(effAtk*1.85); label = `낮은 뿔피리 소리와 함께 그림자 사슬이 뻗어온다!`; playBanner('속삭이는 뿔피리','fx-horn'); }
      else if(skillKey==='petalBloodletting'){ dmg = Math.round(effAtk*1.4); label = `칼날꽃이 만개하며 가시 섞인 꽃잎을 흩뿌린다!`; playBanner('꽃잎의 선혈','fx-petal'); }
      else if(skillKey==='bladeStemSweep'){ dmg = Math.round(effAtk*2.1); label = `굽은 칼날 줄기가 그대로 휩쓸어 벤다!`; playBanner('칼날 줄기의 휩쓸기','fx-bladestem'); }
      else if(skillKey==='pulseShockwave'){ dmg = Math.round(effAtk*1.7); label = `녹슨 톱니 우리 안, 거대한 심장이 크게 박동한다!`; playBanner('박동의 충격파','fx-pulse'); }
      else if(skillKey==='rustedChainBind'){ dmg = Math.round(effAtk*1.5); label = `사방에서 녹슨 사슬이 튀어나와 온몸을 옭아맨다!`; playBanner('녹슨 사슬의 포박','fx-chain'); }
      // ---------- 2차 신규 4종 보스 전용 스킬 ----------
      else if(skillKey==='carvedBrand'){ dmg = Math.round(effAtk*1.55); label = `석판 표면의 룬이 붉게 달아오르며 살갗에 새겨진다!`; playBanner('새겨지는 낙인','fx-brand'); }
      else if(skillKey==='unblinkingGaze'){ dmg = Math.round(effAtk*2.05); label = `석판 중앙의 거대한 눈이 한 번도 깜빡이지 않은 채 옭아맨다!`; playBanner('깜빡이지 않는 시선','fx-gaze'); }
      else if(skillKey==='threadWinds'){ dmg = Math.round(effAtk*1.5); label = `진홍빛 실이 사지를 타고 스멀스멀 감겨온다!`; playBanner('실이 감긴다','fx-thread'); }
      else if(skillKey==='scissorGreeting'){ dmg = Math.round(effAtk*1.9); label = `가위날 두 손이 인사하듯 빠르게 두 번 엇갈린다!`; playBanner('가위의 인사','fx-scissor'); }
      else if(skillKey==='burningSin'){ dmg = Math.round(effAtk*1.45); label = `등롱 하나가 유독 짙은 색으로 타오르며 열기를 뿜는다!`; playBanner('타오르는 죄','fx-sin'); }
      else if(skillKey==='lanternChorus'){ dmg = Math.round(effAtk*2.0); label = `엉겨붙은 등롱 전부가 한꺼번에 타오른다!`; playBanner('등롱의 합창','fx-chorus'); }
      else if(skillKey==='crumblingSand'){ dmg = Math.round(effAtk*1.6); label = `허물어진 모래가 파도처럼 밀려든다!`; playBanner('무너지는 모래','fx-sand'); }
      else if(skillKey==='timeTurningBack'){ dmg = Math.round(effAtk*2.15); label = `쏟아지던 모래가 순간 거꾸로 흐르며 시간을 되감는다!`; playBanner('되돌아오는 시간','fx-timeturn'); }
      else { dmg = effAtk + Math.floor(Math.random()*3)-1; }

      if(dmg<=0){
        setBattleMsg(label, `공격이 완전히 빗나갔다!`);
        if(checkBattleEnd()) return;
        resetCommandUI();
        return;
      }

      // 은신(stealth): 이번에 오는 적 공격을 확정으로 회피한다. 원래 이 플래그
      // (player.stealthEvadeArmed)가 여기서 전혀 소비되지 않는 버그가 있었다 —
      // 은신을 써도 사실상 아무 효과가 없었다. 일반 회피율 판정보다 먼저 체크해
      // 100% 회피를 보장한다.
      if(player.stealthEvadeArmed){
        player.stealthEvadeArmed = false;
        playBanner('완전 회피!','dodge');
        setBattleMsg(label, `${player.name}이(가) 그림자 속으로 완전히 몸을 숨겨 공격을 피했다!`);
        if(checkBattleEnd()) return;
        resetCommandUI();
        return;
      }

      const dodgeChance = getSpecialSum('dodgeChance') + getBloodPactDodgeBonus() + getOverheatDodgeBonus() + getSpdDodgeBonus();
      if(dodgeChance>0 && Math.random()<dodgeChance){
        playBanner('회피!','dodge');
        setBattleMsg(label, `${player.name}이(가) 재빠르게 공격을 피했다!`);
        if(checkBattleEnd()) return;
        resetCommandUI();
        return;
      }

      let mitigated = Math.max(1, dmg - player.def);
      if(player.buffDefTurns > 0){
        mitigated = Math.max(1, Math.round(mitigated * player.buffDefMult));
        player.buffDefTurns -= 1;
        if(player.buffDefTurns <= 0){ player.buffDefTurns = 0; player.buffDefMult = 1; }
      }
      if(player.guardingNextHit){ mitigated = Math.round(mitigated*0.4); player.guardingNextHit=false; }

      let counterOathChance = 0;
      if(player.buffCounterTurns > 0){
        counterOathChance = player.buffCounterChance || 0;
        player.buffCounterTurns -= 1;
        if(player.buffCounterTurns <= 0){ player.buffCounterTurns = 0; player.buffCounterChance = 0; }
      }

      let reduceMult = 1;
      if(epicSetTier('paladin')>=2 && player.maxhp>0 && (player.hp/player.maxhp)>0.5){
        reduceMult -= 0.15;
      }
      if(battleFlags && battleFlags.rig && battleFlags.rig.shieldPct){
        reduceMult -= battleFlags.rig.shieldPct;
      }
      if(battleFlags && battleFlags.rig2 && battleFlags.rig2.shieldPct){
        reduceMult -= battleFlags.rig2.shieldPct;
      }
      reduceMult += getRelicSum('dmgTakenPctMult');
      if(battleFlags && battleFlags.diceEffect==='dmgtaken') reduceMult += 0.3;
      // 중액 대출(외상 도박사)의 페널티 — 상환율만큼 완화되는 받는 피해 증가.
      // getDebtorDmgTakenMult()는 대출이 없으면 1을 반환하므로 reduceMult에
      // 곱해도 다른 직업에는 전혀 영향이 없다.
      reduceMult *= getDebtorDmgTakenMult();
      reduceMult = Math.max(0.15, reduceMult);
      if(reduceMult!==1) mitigated = Math.max(1, Math.round(mitigated*reduceMult));

      let extraMsg = '';
      // 장비 강화(사용자 요청) — 강철판/응급 갑옷/탐욕의 목걸이의 받는 피해 증감.
      // getSpecialSum은 equippedSpecials()를 거치므로 강화로 얻은 special도
      // 자동으로 합산된다(js/blacksmith.js 참고).
      if(typeof getSpecialSum==='function'){
        let armorMult = 1 - getSpecialSum('dmgReductionPct') + getSpecialSum('dmgTakenPctBonus');
        if(player.maxhp>0 && (player.hp/player.maxhp)<=0.3){
          const armorId = player.equipment && player.equipment.armor;
          if(armorId && typeof getEnhancementsFor==='function' && getEnhancementsFor(armorId).includes('emergency')){
            armorMult -= ENHANCEMENTS.emergency.lowHpDmgReduction.pct;
          }
        }
        armorMult = Math.max(0.1, armorMult);
        if(armorMult!==1) mitigated = Math.max(1, Math.round(mitigated*armorMult));
      }
      // 마나 갑옷: HP 대신 보유 MP로 피해의 절반까지 흡수.
      if(typeof hasSpecial==='function' && hasSpecial('manaArmor') && player.mp>0 && mitigated>0){
        const absorbNeed = Math.round(mitigated*0.5);
        const absorbed = Math.min(player.mp, absorbNeed);
        if(absorbed>0){
          player.mp -= absorbed;
          mitigated -= absorbed;
          extraMsg += ` 마나 갑옷이 MP ${absorbed}을(를) 소모해 피해를 흡수했다!`;
        }
      }

      // 뱀의 허물: 이번 전투에서 실제로 HP 피해를 받는 첫 순간에만 발동(회피/빗나감엔 발동하지 않음 — 이 지점까지 오면 이미 그 조건은 통과한 것)
      if(mitigated>0 && hasRelicFlag('snakeskinFirstHit') && battleFlags && !battleFlags.snakeskinUsed){
        mitigated = Math.max(1, Math.round(mitigated*0.5));
        battleFlags.snakeskinUsed = true;
        extraMsg += ' 뱀의 허물이 충격을 완화했다!';
      }

      // 죽음을 막는 효과들의 우선순위: 꺼지지 않는 촛불(런 전체 1회) > 수호자의 부적(전투당 1회)
      if(mitigated >= player.hp && hasRelicFlag('undyingCandle') && !player.candleUsed){
        player.candleUsed = true;
        mitigated = player.hp - 1;
        playBanner('불멸의 빛!','phoenix');
        extraMsg += ' 꺼지지 않는 촛불이 마지막 빛을 밝혀 죽음을 막아냈다!';
      } else if(mitigated >= player.hp && battleFlags && !battleFlags.guardian && hasSpecial('guardianShield')){
        mitigated = 0;
        battleFlags.guardian = true;
        playBanner('완전 방어!','guardian');
        extraMsg += ' 수호자의 부적이 치명적인 일격을 완전히 막아냈다!';
      } else if(mitigated >= player.hp && battleFlags && !battleFlags.undyingArmorUsed && hasSpecial('preventLethalOnce')){
        // 불굴의 갑옷(사용자 요청 — 장비 강화). 완전 차단이 아니라 HP 1로만 버틴다는
        // 점이 수호자의 부적/촛불과 다르다.
        battleFlags.undyingArmorUsed = true;
        mitigated = player.hp - 1;
        playBanner('불굴!','guardian');
        extraMsg += ' 불굴의 갑옷이 치명적인 피해를 버텨냈다!';
      }

      player.hp = Math.max(0, player.hp - mitigated);
      checkPaladinAwoken();
      if(mitigated>0) Sound.hit();

      // 정예 특성 — 흡혈(가한 피해의 20% 회복)/독성(적중 시 플레이어 중독 3턴 부여).
      if(mitigated>0 && enemy.eliteTraits && enemy.eliteTraits.length){
        if(hasEliteTrait('lifesteal')){
          const healAmt = Math.max(1, Math.round(mitigated*0.2));
          enemy.hp = Math.min(enemy.maxhp, enemy.hp+healAmt);
          updateEnemyHpBar();
          extraMsg += ` ${enemy.name}이(가) 피해의 일부를 흡수해 회복했다!`;
        }
        if(hasEliteTrait('poison')){
          player.poisonTurns = 3;
          player.poisonDmgPerTurn = Math.max(1, Math.round(effAtk*0.15));
          extraMsg += ' 상처에 독이 스며든다!';
        }
      }

      // 거울의 파편(반사) / 복수자의 반지(다음 공격 무장) — 실제로 HP 피해를 받았을 때만 발동
      if(mitigated>0){
        if(hasRelicFlag('mirrorReflectPct')){
          const reflectDmg = Math.max(0, Math.round(mitigated*getRelicSum('mirrorReflectPct')));
          if(reflectDmg>0){
            enemy.hp = Math.max(0, enemy.hp-reflectDmg);
            updateEnemyHpBar();
            popDamage('-'+reflectDmg,'counter');
            extraMsg += ` 거울의 파편이 ${reflectDmg}의 피해를 반사했다!`;
          }
        }
        if(hasRelicFlag('revengeArmBonus') && battleFlags){
          battleFlags.revengeArmed = true;
        }
        // 가시 갑옷(사용자 요청 — 장비 강화): 받은 피해의 15% 반사.
        if(hasSpecial('thornsPct')){
          const thornDmg = Math.max(0, Math.round(mitigated*getSpecialSum('thornsPct')));
          if(thornDmg>0){
            enemy.hp = Math.max(0, enemy.hp-thornDmg);
            updateEnemyHpBar();
            popDamage('-'+thornDmg,'counter');
            extraMsg += ` 가시 갑옷이 ${thornDmg}의 피해를 반사했다!`;
          }
        }
        // 반격의 갑옷(사용자 요청 — 장비 강화): 다음 공격 강화 예약.
        if(hasSpecial('counterOnHit') && battleFlags){
          battleFlags.revengeArmed = true;
        }
        // 인내(mastery_endurance): 실제로 HP 피해를 입을 때마다 스택이 쌓인다.
        // 파훼일격(warriorEnduranceActive) 사용 시 전부 소모된다.
        if(player.skills && player.skills.includes('mastery_endurance') && battleFlags){
          battleFlags.enduranceStacks = (battleFlags.enduranceStacks||0) + 1;
        }
      }

      if(player.hp<=0 && battleFlags && !battleFlags.phoenix && hasSpecial('reviveOnce')){
        const ratio = getReviveRatio();
        player.hp = Math.max(1, Math.round(player.maxhp*ratio));
        battleFlags.phoenix = true;
        playBanner('부활!','phoenix');
        extraMsg += ` 불사조의 깃털이 타올라 되살아났다! (HP ${player.hp})`;
      }

      renderStatus();
      setBattleMsg(label, `${player.name}은(는) ${mitigated}의 피해를 입었다.${extraMsg}`);

      const counterChance = getSpecialSum('counterChance') + counterOathChance;
      if(player.hp>0 && counterChance>0 && Math.random()<counterChance){
        setTimeout(()=>{
          const counterDmg = Math.max(1, Math.round(effectiveAtk()*0.5) - getEffectiveEnemyDef(enemy.def));
          enemy.hp = Math.max(0, enemy.hp-counterDmg);
          updateEnemyHpBar(); shakeEnemy(); popDamage('-'+counterDmg,'counter');
          Sound.slash();
          setBattleMsg(`${player.name}의 반격!`, `${counterDmg}의 피해로 되갚아주었다!`);
          if(checkBattleEnd()) return;
          resetCommandUI();
        }, 400);
        return;
      }

      if(checkBattleEnd()) return;
      resetCommandUI();
    }, 700);
  }
  function finishEnemyTurn(){
    if(checkBattleEnd()) return;
    resetCommandUI();
  }

  function applyDot(spec){
    if(!spec) return;
    const basisVal = spec.basis==='atk' ? effectiveAtk() : player.mag;
    let dmgPerTurn = Math.max(1, Math.round(basisVal*spec.ratio));
    const boost = getDotBoostRatio(spec.type);
    if(boost>0) dmgPerTurn = Math.round(dmgPerTurn*(1+boost));
    if(!enemy.dots) enemy.dots = [];
    // 같은 종류의 상태이상은 갱신(덮어쓰기), 다른 종류는 함께 누적되어 동시에 적용된다
    const existing = enemy.dots.find(d=>d.type===spec.type);
    if(existing){
      existing.turns = spec.turns; existing.dmgPerTurn = dmgPerTurn; existing.label = spec.label;
    } else {
      enemy.dots.push({type:spec.type, turns:spec.turns, dmgPerTurn, label:spec.label});
    }
    playStatusFx(spec.type);
    Sound.statusApply(spec.type);
    updateStatusBadges();
  }
  // 스킬에 정의된 단일 dot(s.dot) 또는 다중 dot(s.dots) 배열을 모두 함께 적용하고,
  // 부여된 상태이상 이름들을 메시지용 문자열로 반환한다
  function applySkillDots(s){
    const specs = s.dots ? s.dots : (s.dot ? [s.dot] : []);
    specs.forEach(applyDot);
    return specs.map(sp=>sp.label).join(', ');
  }

  function applySkillModifiers(dmg, s){
    let d = dmg;
    let triggered = false;
    // 그림자일격(rogueShadowStrike): 조건 없이 항상 발동하는 확정 치명타.
    if(s.guaranteedCritMult){
      d = Math.round(d * s.guaranteedCritMult);
      triggered = true;
    }
    if(s.executeBonus && enemy.maxhp>0 && (enemy.hp/enemy.maxhp) <= s.executeBonus.vsHpPct){
      d = Math.round(d * s.executeBonus.mult); triggered = true;
    }
    if(s.executeVsStatus && enemy.dots && enemy.dots.some(dt=>dt.type===s.executeVsStatus && dt.turns>0)){
      d = Math.round(d * (s.executeVsStatusMult || 1.4)); triggered = true;
    }
    if(s.statusSynergyBonus){
      const activeTypes = new Set(((enemy && enemy.dots) ? enemy.dots : []).filter(dt=>dt.turns>0).map(dt=>dt.type)).size;
      if(activeTypes > 0){
        d = Math.round(d * (1 + activeTypes*s.statusSynergyBonus));
        triggered = true;
      }
    }
    // 저주 폭발(mageCurseNova, 저주술사): statusSynergyBonus와 동일한 패턴으로, 보유한
    // 저주 개수만큼 곱연산 배율이 붙는다(relics.js의 getCurseCount() 재사용).
    if(s.curseCountBonus){
      const curses = (typeof getCurseCount === 'function') ? getCurseCount() : 0;
      if(curses > 0){
        d = Math.round(d * (1 + curses*s.curseCountBonus));
        triggered = true;
      }
    }
    if(s.selfHpBonusMax){
      const missingRatio = 1 - (player.hp/player.maxhp);
      d = Math.round(d * (1 + missingRatio*s.selfHpBonusMax));
    }
    return {value: Math.max(1, d), triggered};
  }

  function effectiveAtk(){
    let a = player.atk;
    if(player.buffAtkTurns > 0) a = Math.round(a * (player.buffAtkMult||1));
    a = Math.round(a * (1 + getCreedAtkBonus() + getLuckWaveBonus()));
    // 광전사의 반지(사용자 요청 — 장비 강화): HP 40% 이하일 때 공격력 +30%.
    if(typeof getEnhancementsFor==='function' && player.equipment && player.equipment.accessory){
      const accId = player.equipment.accessory;
      if(getEnhancementsFor(accId).includes('berserkring') && player.maxhp>0 && (player.hp/player.maxhp)<=0.4){
        a = Math.round(a*1.30);
      }
    }
    return a;
  }
  function consumeAtkBuff(){
    if(player.buffAtkTurns > 0){
      player.buffAtkTurns -= 1;
      if(player.buffAtkTurns <= 0){ player.buffAtkTurns = 0; player.buffAtkMult = 1; }
    }
  }
  // 혈서(mastery_bloodpact): HP가 낮을수록 회피율이 오른다(체력 0에 가까울수록 최대 +35%p).
  function getBloodPactDodgeBonus(){
    if(!(player.skills && player.skills.includes('mastery_bloodpact'))) return 0;
    if(!player.maxhp) return 0;
    const missingRatio = 1 - (player.hp/player.maxhp);
    return missingRatio * 0.35;
  }
  // 과열 내성(mechanicHeatResist, 폭주 화부 레벨12): applyOverheatOverflowDamage()가
  // 과부하 자해가 발생할 때마다 battleFlags.overheatDodgeStacks를 쌓아둔다
  // (스택당 +2%p, 최대 +20%p). 여기서는 그 스택을 회피율로 환산만 한다.
  function getOverheatDodgeBonus(){
    if(!(battleFlags && battleFlags.overheatDodgeStacks)) return 0;
    return Math.min(10, battleFlags.overheatDodgeStacks) * 0.02;
  }
  // 속도 스탯 활용(사용자 요청 — 도망 확률/마녀의 시계 유물 외엔 쓸모가 없었음).
  // 적과의 속도 차이만큼 회피율을 준다(차이 1당 +0.5%p). 너무 세지지 않도록
  // 15%p 상한을 둔다 — 다른 회피 보너스(혈서 최대 35%p, 과열내성 최대 20%p)와
  // 마찬가지로 이 항목 자체의 상한이며, dodgeChance 합산식(enemy-turn.js)에서
  // 다른 소스와 그대로 더해진다.
  function getSpdDodgeBonus(){
    if(!player || !enemy) return 0;
    const diff = (player.spd||0) - (enemy.spd||0);
    if(diff<=0) return 0;
    return Math.min(0.15, diff*0.005);
  }
  // 시간 왜곡(mastery_timewarp): 마녀의 시계 유물과 동일한 "이번 턴 이미 사용함" 안전
  // 장치(battleFlags.witchClockUsedThisTurn)를 공유하는 고정 20% 확률 추가 행동.
  function getTimeWarpExtraChance(){
    if(!(player.skills && player.skills.includes('mastery_timewarp'))) return 0;
    return 0.20;
  }
  // 계율(mastery_creed): 계율을 유지한 스택 수만큼 공격력이 오른다(스택당 +5%, 최대 +25%).
  function getCreedAtkBonus(){
    if(!(battleFlags && battleFlags.creed)) return 0;
    return Math.min(5, battleFlags.creedStacks||0) * 0.05;
  }
  // 행운의 파도(mastery_luckwave): 운 게이지(-3~+3)를 공격력 배율로 환산한다
  // (게이지 1당 ±7%, 최대 ±21%).
  function getLuckWaveBonus(){
    if(!(player.skills && player.skills.includes('mastery_luckwave'))) return 0;
    return (battleFlags.luckGauge||0) * 0.07;
  }
  // 독 중첩(mastery_venomstacks, 맹독 연금술사): "스택 하나당" 매 라운드 피해량을
  // 계산한다. 여기에 레벨12 패시브(독성 정제)와 장비의 중독 강화 아이템
  // (getDotBoostRatio('poison') — 도적의 단검 +40%, 영혼의 반지 +25% 등 기존
  // 아이템과 자연스럽게 시너지)이 곱연산으로 붙는다. 최종 틱 피해 = 이 값 ×
  // 현재 스택 수(최대 10) — 오래 끄는 전투일수록 강력해진다.
  //
  // 밸런스 조정(사용자 요청 — 코드 기반 시뮬레이션으로 확인): 도적의 다른
  // 전직(환영검사)/마법사 2차 전직들과 비교했을 때 독사가 맨몸 기준 2.4배,
  // 중독 강화 무기 착용 시 3배 가까이 압도적으로 강했다. 스택 상한/삼중주입
  // 보너스 등 다른 손잡이는 아무리 깎아도 격차를 크게 못 줄여서(구조적으로
  // "매 라운드 자동 발동, 자원 소모 없음"이라 기본 로테이션 위에 통째로
  // 얹히는 보너스이기 때문), 근본 배율 두 개를 함께 낮췄다 — 기본 비율
  // 0.18→0.09(절반), 독성 정제 +90%→+30%. 조정 후 시뮬레이션: 맨몸 기준
  // 환영검사 대비 1.22배, 도적의 단검 착용 시 1.40배(다른 전직들의 정상
  // 편차 범위 안으로 들어옴).
  function getVenomDmgPerStack(){
    if(!(player.skills && player.skills.includes('mastery_venomstacks'))) return 0;
    // 마력이 아니라 effectiveAtk() 기준(도적은 mag에 페널티가 있어 atk가
    // 실제 투자 스탯이므로).
    let per = Math.max(0.01, effectiveAtk() * 0.09);
    if(player.skills.includes('rogueVenomRefine')) per *= 1.3;
    const boost = getDotBoostRatio('poison');
    if(boost>0) per *= (1+boost);
    return per;
  }
