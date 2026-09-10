"use strict";
/*
플레이어 턴 행동 4종 — 공격/스킬/아이템/도망.
export(전역): playerAttack, playerSkill, popDamageOnPlayerArea, playerItem, playerRun
의존성: state.js, data/skills.js(SKILLDB), relics.js, data/equipment.js, combat/battle-fx.js,
        combat/battle-end.js, combat/enemy-turn.js(적 턴 호출)
*/

  // 역병숙주(rogue_alchemist) 잠식 스택 상한 — 고독 각인(re_solovenom, 장신구)을
  // 꼈으면 6, 아니면 기본 10. 맹독 주입 전용 로직뿐 아니라 기본 공격 등
  // 범용 역병중첩 훅에서도 동일하게 참조해야 한다(예전엔 범용 훅 3곳이 상한을
  // 10으로 하드코딩해둬서, 고독 각인을 꼈어도 기본 공격 등으로 쌓은 스택은
  // 상한6을 무시하고 10까지 차던 버그가 있었다).
  function getVenomStackCap(){
    const cId = player.equipment && player.equipment.accessory;
    const hasSolo = !!(cId && typeof getEnhancementsFor==='function' && getEnhancementsFor(cId).includes('re_solovenom'));
    return hasSolo ? 6 : 10;
  }

  function playerAttack(){
    if(battleOver) return;
    setCommandsEnabled(false);
    // 무한 가속 각인(me_infiniteaccel): 기본 공격도 가속 주문 연쇄를 끊는다.
    if(battleFlags) battleFlags.hasteCastCount = 0;
    // 은신 연속 사용 방지: 기본 공격을 포함해 은신이 아닌 어떤 행동을 해도 쿨다운이
    // 풀린다(다시 은신을 쓸 수 있게 된다).
    if(battleFlags) battleFlags.stealthOnCooldown = false;
    // 스킬 쿨타임(사용자 요청) — 기본 공격도 한 턴을 소모하므로 쿨타임이 깎여야 한다.
    if(battleFlags) battleFlags.cooldownTickPending = true;
    // 계율(mastery_creed): '기본 공격 금지' 계율 중이면 기본 공격이 위반이다.
    // '물약 금지' 계율 중이면 기본 공격은 계율을 지킨 것이므로 스택이 오른다.
    let creedMsg = '';
    if(battleFlags && battleFlags.creed==='skillonly'){
      if(battleFlags.creedStacks>0) creedMsg = ' 계율을 어겼다! 쌓인 버프가 즉시 사라졌다.';
      battleFlags.creedStacks = 0;
    } else if(battleFlags && battleFlags.creed==='nopotion'){
      battleFlags.creedStacks = Math.min(5, (battleFlags.creedStacks||0)+1);
    }
    const onHitMult = consumeOnHitBonuses();
    const edef = getEffectiveEnemyDef(enemy.def);
    // 일섬의 각인(we_puresword, 일격의 구도자 무기): 기본 공격이 확정 크리
    // (2배)로 터지는 대신 명중률이 70%로 떨어진다(사용자 요청). 미스면 다른
    // 데미지 계산을 전부 건너뛰고 여기서 바로 끝낸다.
    const wIdPS = player.equipment && player.equipment.weapon;
    const hasPureSword = !!(wIdPS && typeof getEnhancementsFor==='function' && getEnhancementsFor(wIdPS).includes('we_puresword'));
    if(hasPureSword && Math.random() >= 0.7){
      renderStatus();
      popDamage('빗나감!', 'miss');
      Sound.fail();
      setBattleMsg(`${player.name}의 공격!`, '일섬이 허공을 갈랐다... 완전히 빗나갔다.');
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }
    let dmg = Math.max(1, effectiveAtk() + Math.floor(Math.random()*4)-1 - edef);
    if(hasPureSword) dmg = Math.round(dmg*2);
    // 공명 각인(we_resonance, 일격의 구도자 방어구): 직전 기본 공격 피해의 20%를
    // 이번 공격에 그대로 증폭해 물려받는다. 스킬/아이템을 쓰면 끊긴다(각각
    // playerSkill()/playerItem() 맨 앞에서 player.lastBasicAtkDmg를 0으로 리셋).
    const aIdRS = player.equipment && player.equipment.armor;
    const hasResonance = !!(aIdRS && typeof getEnhancementsFor==='function' && getEnhancementsFor(aIdRS).includes('we_resonance'));
    let resonanceMsgAtk = '';
    if(hasResonance && (player.lastBasicAtkDmg||0)>0){
      const bonus = Math.round(player.lastBasicAtkDmg*0.2);
      dmg += bonus;
      resonanceMsgAtk = ` 공명이 이어져 위력이 ${bonus} 늘어났다!`;
    }
    // 은신(stealth)이 걸어둔 "다음 공격 피해 +30%"를 기본 공격에도 적용한다(예전엔
    // 소비 코드 자체가 없어 죽어있던 효과였다).
    let stealthDmgMsgAtk = '';
    if(player.stealthDmgBonusArmed){
      dmg = Math.round(dmg*1.3);
      stealthDmgMsgAtk = ' 은신에서 벗어나며 가한 일격의 위력이 크게 올랐다!';
      player.stealthDmgBonusArmed = false;
    }
    // 순일격(mastery_purestrike, 일격의 구도자 레벨10): 기본 공격 피해가 항상
    // 증가한다. (밸런스 조정: 15%→30% — 사용자 피드백 "너무 짜다"에 따라 상향.
    // 이 직업은 액티브 스킬이 아예 없어 기본 공격 하나에 모든 정체성이 걸려
    // 있으므로, 다른 직업의 마스터리보다 배율을 넉넉하게 잡는 게 맞다고 판단.)
    const puristMult = 1.30;
    if(player.skills && player.skills.includes('mastery_purestrike')){
      dmg = Math.round(dmg*puristMult);
    }
    // 메아리 타격(warriorPuristEcho, 레벨12): 기본 공격을 두 번째 낼 때마다(2타/4타/6타…,
    // 전투마다 battleFlags.basicAtkCount로 리셋되어 집계) 추가로 강하게 꽂힌다.
    let echoMsg = '';
    let echoTriggeredThisAction = false;
    if(player.skills && player.skills.includes('warriorPuristEcho') && battleFlags){
      battleFlags.basicAtkCount = (battleFlags.basicAtkCount||0) + 1;
      if(battleFlags.basicAtkCount % 2 === 0){
        dmg = Math.round(dmg*1.25);
        echoMsg = ' 메아리치는 두 번째 타격이 더욱 강하게 꽂혔다!';
        echoTriggeredThisAction = true;
      }
    }
    // 번개계약 파동(mageElementWave)이 남긴 "다음 공격 확정 치명타"를 기본 공격에도
    // 적용한다(원소 각인/원소 파동/원소 폭풍 자체는 각자 별도 계산식이라 이 플래그를
    // 소모하지 않는다 — 설계상 범위를 기본 공격과 아래 범용 phys/magic 분기로 한정).
    let lightningCritMsgAtk = '';
    if(player.lightningCritArmed){
      dmg = Math.round(dmg*1.6);
      lightningCritMsgAtk = ' 벼려둔 번개의 기운이 급소를 정확히 꿰뚫었다!';
      player.lightningCritArmed = false;
    }
    dmg = applyOutgoingDamageMods(dmg, {type:'basic', onHitMult});
    // 무기 강화(사용자 요청) — 날카로운/잔혹한/처형자의 칼날/무거운 일격 배율.
    // applyOutgoingDamageMods 밖에서 별도로 곱하는 이유: 저 함수는 스킬에도
    // 공통으로 쓰이는데, 이 강화들은 "기본 공격 한정"이라 여기서만 적용한다.
    if(typeof getWeaponEnhanceDamageMult==='function'){
      dmg = Math.max(1, Math.round(dmg*getWeaponEnhanceDamageMult()));
    }
    consumeAtkBuff();
    enemy.hp = Math.max(0, enemy.hp-dmg);
    updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
    Sound.slash();
    // 역병 잠식(mastery_venomstacks, 역병숙주): 기본 공격도 독을 남긴다(사용자 요청 —
    // "도적의 기본공격, 기본스킬에도 독이 묻었으면"). 맹독 주입 자신의 전용
    // 보너스(+1 또는 +3)와는 별개로, 이 범용 훅은 모든 공격 행동에 공통으로
    // +1만 준다.
    if(player.skills && player.skills.includes('mastery_venomstacks')){
      enemy.venomStacks = Math.min(getVenomStackCap(), (enemy.venomStacks||0)+1);
      updateStatusBadges();
    }
    const healed = applyPassiveLifesteal(dmg);
    rogueRegisterHit(true);
    // 무기 강화(사용자 요청) — 독/마나파괴/무거운 일격의 반작용은 여기서.
    if(typeof applyWeaponOnHitEffects==='function') applyWeaponOnHitEffects();
    let msg2 = `${enemy.name}에게 ${dmg}의 피해를 입혔다.`;
    if(healed>0) msg2 += ` HP ${healed} 흡수.`;
    if(creedMsg) msg2 += creedMsg;
    if(echoMsg) msg2 += echoMsg;
    if(lightningCritMsgAtk) msg2 += lightningCritMsgAtk;
    if(stealthDmgMsgAtk) msg2 += stealthDmgMsgAtk;
    if(resonanceMsgAtk) msg2 += resonanceMsgAtk;
    // 공명 각인 상속용 — 이번 기본 공격의 최종 피해를 저장해둔다(다음 기본
    // 공격에서 20%만큼 물려받는다. 스킬/아이템 사용 시 0으로 리셋됨).
    player.lastBasicAtkDmg = dmg;

    if(enemy.hp>0 && maybeWarriorExtraHit()){
      const edef3 = getEffectiveEnemyDef(enemy.def);
      let extraDmg = Math.max(1, effectiveAtk() + Math.floor(Math.random()*4)-1 - edef3);
      extraDmg = applyOutgoingDamageMods(extraDmg, {type:'basic', onHitMult});
      enemy.hp = Math.max(0, enemy.hp-extraDmg);
      updateEnemyHpBar(); popDamage('-'+extraDmg);
      msg2 += ` 거인강림의 힘으로 한 번 더 몰아쳐 ${extraDmg}의 추가 피해!`;
    }

    // 연격(사용자 요청 — 무기 강화). 위 거인강림 추가타와 동일한 패턴.
    if(enemy.hp>0 && typeof shouldTriggerWeaponMultiStrike==='function' && shouldTriggerWeaponMultiStrike()){
      const edef5 = getEffectiveEnemyDef(enemy.def);
      let extraDmg2 = Math.max(1, effectiveAtk() + Math.floor(Math.random()*4)-1 - edef5);
      extraDmg2 = applyOutgoingDamageMods(extraDmg2, {type:'basic', onHitMult});
      enemy.hp = Math.max(0, enemy.hp-extraDmg2);
      updateEnemyHpBar(); popDamage('-'+extraDmg2);
      msg2 += ` 연격이 몰아쳐 ${extraDmg2}의 추가 피해!`;
    }

    // 쌍격의 파문(warriorPuristDoubleStrike, 레벨15): 사용자 요청으로 "확률로 한 번
    // 더"에서 "무조건 한 번 더"로 변경. 대신 두 번째 타격의 위력을 50%로 낮춰
    // 밸런스를 맞췄다(기존 20% 확률로 100% 위력이었을 때 기대값은 0.2배였는데,
    // 확정으로 바뀌면 매번 0.5배를 보장 — RNG 프러스트레이션은 없애면서도
    // 지나치게 강해지지 않게 조정한 값). 기존 희귀 장비의 doubleStrikeChance
    // (확률형)는 그대로 두고, 이 패시브는 별도의 확정 트리거로 분리했다 — 그래야
    // 확률형 발동 시에는 원래대로 100% 위력이 유지된다.
    const doubleChance = getSpecialSum('doubleStrikeChance');
    const guaranteedSecondHit = !!(player.skills && player.skills.includes('warriorPuristDoubleStrike'));
    if(enemy.hp>0 && (guaranteedSecondHit || (doubleChance>0 && Math.random()<doubleChance))){
      renderStatus();
      setBattleMsg(`${player.name}의 공격!`, msg2);
      setTimeout(()=>{
        const edef2 = getEffectiveEnemyDef(enemy.def);
        let dmg2 = Math.max(1, effectiveAtk() + Math.floor(Math.random()*4)-1 - edef2);
        // 밸런스 수정: 이전엔 이 두 번째 타격이 순일격(+30%)/메아리 타격 보너스를
        // 전혀 상속받지 못하고 순수 raw 데미지에만 0.5배를 곱했다 — 일격의
        // 구도자의 정체성인 패시브 3개가 정작 자기 시그니처 스킬(쌍격의 파문)
        // 에는 하나도 안 실리는 설계 공백이었다. 이제 순일격/메아리 보너스를
        // 먼저 적용한 뒤 0.5배를 곱한다.
        if(player.skills && player.skills.includes('mastery_purestrike')){
          dmg2 = Math.round(dmg2*puristMult);
        }
        if(echoTriggeredThisAction){
          dmg2 = Math.round(dmg2*1.25);
        }
        dmg2 = applyOutgoingDamageMods(dmg2, {type:'basic', onHitMult});
        if(guaranteedSecondHit) dmg2 = Math.max(1, Math.round(dmg2*0.5));
        enemy.hp = Math.max(0, enemy.hp-dmg2);
        updateEnemyHpBar(); shakeEnemy(); spawnSlashMark(1); popDamage('-'+dmg2);
        Sound.slash();
        const healed2 = applyPassiveLifesteal(dmg2);
        rogueRegisterHit(true);
        renderStatus();
        let msg3 = `번개처럼 한 번 더 베어 ${dmg2}의 피해를 입혔다!`;
        if(healed2>0) msg3 += ` HP ${healed2} 흡수.`;
        setBattleMsg(`${player.name}의 연속 공격!`, msg3);
        // 무한 메아리 각인(we_infechoic, 일격의 구도자 장신구): 확정 2타 이후,
        // 50% 확률로 위력이 줄어든 추가 타격이 계속 이어진다(성공할 때마다
        // 다시 50%로 재도전, 매번 위력만 0.1씩 감소, 최저 0.1배).
        const cIdIE = player.equipment && player.equipment.accessory;
        const hasInfEcho = guaranteedSecondHit && cIdIE && typeof getEnhancementsFor==='function' && getEnhancementsFor(cIdIE).includes('we_infechoic');
        if(hasInfEcho){
          setTimeout(()=> tryInfiniteEcho(0.4), 260);
          return;
        }
        if(checkBattleEnd()) return;
        enemyTurn();
      }, 260);
      return;
    }

    renderStatus();
    setBattleMsg(`${player.name}의 공격!`, msg2);
    if(checkBattleEnd()) return;
    enemyTurn();
  }

  // 무한 메아리 각인(we_infechoic) 전용 재귀 헬퍼 — 매번 50% 확률로 한 번 더
  // 이어지며, 이어질 때마다 위력이 0.1배씩 줄어든다(최저 0.1배). 실패하면
  // 거기서 멈추고 정상적으로 적 턴으로 넘어간다.
  // 배신의 계약 각인(me_betrayal, 계약술사 방어구 각인 — 사용자 요청): 원소
  // 계약 스킬(원소 각인/파동/폭풍) 3개 전부가 공유하는 헬퍼. 적중마다 20%
  // 확률로 계약 원소가 강제로 바뀌면서 추가 폭발 피해가 터진다. 삼위일체
  // 각인(위쪽 elementstorm 분기)이 이미 소비한 턴에는 겹치지 않도록, 그
  // 분기는 이 함수를 부르지 않는다(따로 처리됨).
  // 잔상 각인(re_afterimage_extend, 환영검사 방어구 각인 — 사용자 요청):
  // 분신 배가가 소모되는 순간, 이 각인의 "1회 연장"을 아직 안 썼다면 끄지
  // 않고 한 번 더 유지한다(대신 다음 배가 강화폭이 줄어든다). 두 소비 지점
  // (multihit/phys·magic 공용 분기)이 전부 이 헬퍼를 통해서만 끈다.
  function consumeDoubleImageArmed(){
    const aIdAE = player.equipment && player.equipment.armor;
    const hasAfterimageExtend = !!(aIdAE && typeof getEnhancementsFor==='function' && getEnhancementsFor(aIdAE).includes('re_afterimage_extend'));
    if(hasAfterimageExtend && !player.doubleImageArmedExtraUsed){
      player.doubleImageArmedExtraUsed = true;
      player.doubleImageBoostRatio = Math.max(0.3, (player.doubleImageBoostRatio||0.65) - 0.15);
      return;
    }
    player.doubleImageArmed = false;
    player.doubleImageBoostRatio = 0;
    player.doubleImageArmedExtraUsed = false;
  }

  function checkPactBetrayal(){
    const aIdBt = player.equipment && player.equipment.armor;
    if(!(aIdBt && typeof getEnhancementsFor==='function' && getEnhancementsFor(aIdBt).includes('me_betrayal'))) return '';
    if(!battleFlags.elementPact) return '';
    if(Math.random()>=0.2) return '';
    const others = ['fire','ice','lightning'].filter(e=>e!==battleFlags.elementPact);
    const newPact = others[Math.floor(Math.random()*others.length)];
    battleFlags.elementPact = newPact;
    const edefBt = getEffectiveEnemyDef(enemy.def);
    const burstDmg = Math.max(1, Math.round(effectiveMag()*1.0) - Math.round(edefBt*0.5));
    enemy.hp = Math.max(0, enemy.hp-burstDmg);
    updateEnemyHpBar(); popDamage('-'+burstDmg, 'crit');
    const ELEMENT_LABEL_BT = {fire:'화염', ice:'빙결', lightning:'번개'};
    return ` 배신의 계약이 발동해 갑자기 ${ELEMENT_LABEL_BT[newPact]}로 전환되며 추가로 ${burstDmg}의 폭발 피해를 입혔다!`;
  }

  function tryInfiniteEcho(chainMult){
    if(battleOver) return;
    if(enemy.hp<=0 || Math.random()>=0.5){
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }
    const edefIE = getEffectiveEnemyDef(enemy.def);
    let dmgIE = Math.max(1, effectiveAtk() + Math.floor(Math.random()*4)-1 - edefIE);
    dmgIE = applyOutgoingDamageMods(dmgIE, {type:'basic'});
    dmgIE = Math.max(1, Math.round(dmgIE*chainMult));
    enemy.hp = Math.max(0, enemy.hp-dmgIE);
    updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmgIE);
    Sound.slash();
    renderStatus();
    setBattleMsg(`${player.name}의 무한 메아리!`, `메아리가 계속 이어져 ${dmgIE}의 추가 피해!`);
    if(checkBattleEnd()) return;
    setTimeout(()=> tryInfiniteEcho(Math.max(0.1, chainMult-0.1)), 260);
  }

  // 메카닉 - 폭주 화부/축압 기술자 공용 헬퍼: 압력 상한을 마스터리에 따라 계산.
  // mastery_overheat(폭주 화부)이 있으면 150, 그 외(축압 기술자 포함 기본값)는 100.
  function getPressureCap(){
    return (player.skills && player.skills.includes('mastery_overheat')) ? 150 : 100;
  }
  // 폭주 가속 각인(me_pressurerush)의 압력 증가율 상향(25->35) 적용 헬퍼.
  function getPressureGainUsed(s){
    const wIdPR2 = player.equipment && player.equipment.weapon;
    const hasPressureRush2 = !!(wIdPR2 && typeof getEnhancementsFor==='function' && getEnhancementsFor(wIdPR2).includes('me_pressurerush'));
    return hasPressureRush2 ? 35 : s.pressureGainOnUse;
  }
  // 폭주 화부(mastery_overheat) 전용 — 압력이 100을 넘긴 초과분만큼 즉시 자해
  // 피해를 입힌다(다른 궁극기 hpCostPct들과 동일하게 HP 1은 항상 남도록 클램프
  // — 자해 자체로는 전투불능이 되지 않는다). 과열 내성(mechanicHeatResist)이
  // 있으면 자해가 발생할 때마다 회피 스택도 함께 쌓는다(battleFlags.overheatDodgeStacks,
  // 실제 회피율 반영은 combat/enemy-turn.js의 effectiveDodge류 계산에서 사용).
  // deployrig(보일러 점화)와 enemy-turn.js의 rig 압력 틱, 양쪽에서 호출된다.
  function applyOverheatOverflowDamage(currentPressure){
    if(!player.skills || !player.skills.includes('mastery_overheat')) return;
    const overflow = Math.max(0, currentPressure-100);
    if(overflow<=0) return;
    // 폭주 가속 각인(me_pressurerush, 폭주 화부 무기 각인 — 사용자 요청):
    // 압력 초과분 자해 배율이 1.5배/점 -> 2.0배/점으로 커진다(압력 자체를
    // 더 빨리 쌓는 대가는 pressuresurge 핸들러 쪽 pressureGainOnUse에서 처리).
    const wIdPR = player.equipment && player.equipment.weapon;
    const hasPressureRush = !!(wIdPR && typeof getEnhancementsFor==='function' && getEnhancementsFor(wIdPR).includes('me_pressurerush'));
    const selfDmg = Math.round(overflow*(hasPressureRush?2.0:1.5));
    // 불사조의 재 각인(me_phoenixash, 폭주 화부 방어구 각인 — 사용자 요청):
    // 이 자해로 죽을 뻔하면 전투당 1회, 압력을 0으로 리셋하고 회피 스택을
    // 최대치로 채운 채 살아남는다.
    const aIdPA = player.equipment && player.equipment.armor;
    const hasPhoenixAsh = !!(aIdPA && typeof getEnhancementsFor==='function' && getEnhancementsFor(aIdPA).includes('me_phoenixash'));
    if(hasPhoenixAsh && selfDmg>=player.hp && battleFlags && !battleFlags.phoenixAshUsed){
      battleFlags.phoenixAshUsed = true;
      player.hp = 1;
      battleFlags.pressure = 0;
      if(typeof updatePressureGauge==='function') updatePressureGauge();
      if(player.skills.includes('mechanicHeatResist')){
        battleFlags.overheatDodgeStacks = 10;
      }
      playBanner('불사조!', 'phoenix');
      renderStatus();
      return;
    }
    player.hp = Math.max(1, player.hp-selfDmg);
    if(player.skills.includes('mechanicHeatResist') && battleFlags){
      battleFlags.overheatDodgeStacks = Math.min(10, (battleFlags.overheatDodgeStacks||0)+2);
    }
    renderStatus();
  }

  // 사기꾼(mastery_luckdebt 재사용, 손버릇): 운 스킬이 실패하면 같은 스킬이
  // 무료로 1회 자동 재시도된다. isRetry===true로 재귀 호출하면 playerSkill()
  // 안에서 MP를 아예 안 건드리고, 이 함수도 isRetry일 땐 아예 호출되지 않게
  // (각 실패 분기에서 !isRetry로 감싸) 재귀가 2번 이상 이어지지 않는다.
  function checkGamblerRetry(key, isRetry){
    if(!(player.skills && player.skills.includes('mastery_luckdebt'))) return false;
    if(battleOver) return false;
    // 이중 손버릇 각인(ju_doubleluck, 사기꾼 방어구 각인 — 사용자 요청):
    // 재시도(1회)마저 실패했을 때, 한 번 더(총 3연속 시도) 기회를 준다.
    // 그 마지막(3번째) 시도까지 실패하면 이번 턴 방어력이 사실상 무의미해질
    // 만큼(받는 피해 3배) 무너진다.
    const aIdDL = player.equipment && player.equipment.armor;
    const hasDoubleLuck = !!(aIdDL && typeof getEnhancementsFor==='function' && getEnhancementsFor(aIdDL).includes('ju_doubleluck'));
    if(isRetry){
      if(!hasDoubleLuck || battleFlags.doubleLuckUsedThisCast){
        if(hasDoubleLuck){
          player.buffDefTurns = Math.max(player.buffDefTurns||0, 1);
          player.buffDefMult = Math.max(player.buffDefMult||1, 3);
        }
        return false;
      }
      battleFlags.doubleLuckUsedThisCast = true;
    }
    setTimeout(()=>{ if(!battleOver) playerSkill(key, true); }, 550);
    return true;
  }

  function playerSkill(key, isRetry){
    if(battleOver) return;
    // 이중 손버릇 각인: 새로운(재시도가 아닌) 캐스팅마다 보너스 재시도
    // 사용 여부를 초기화한다.
    if(!isRetry && battleFlags) battleFlags.doubleLuckUsedThisCast = false;
    // 공명 각인(we_resonance): 스킬을 쓰면 기본 공격 공명 체인이 끊긴다.
    player.lastBasicAtkDmg = 0;
    // 무한 가속 각인(me_infiniteaccel): 가속 주문이 아닌 다른 스킬을 쓰면
    // 가속 주문의 연쇄 카운트가 끊긴다.
    if(key!=='mageHaste' && battleFlags) battleFlags.hasteCastCount = 0;
    // 저주술사(mastery_curseweaver)는 스킬 봉인(침묵의 서약)을 저주 개수만큼의 확률로
    // 뚫고 나올 수 있다 — isCurseSealActive()가 이 확률 판정과 배너 안내까지 처리한다.
    if(isCurseSealActive('skillLocked', '저주를 찢고 목소리를 되찾았다!')){
      setBattleMsg('침묵이 목소리를 삼킨다…', '스킬을 사용할 수 없다!');
      return;
    }
    const s = SKILLDB[key];
    // 마나의 축복(사용자 요청 — 수수께끼의 마법사 이벤트, 다음 3전투 스킬 MP
    // 비용 감소). player.multiBattleBuff는 event.js에서 세팅되고
    // combat/battle-end.js의 checkBattleEnd()가 전투마다 battlesLeft를 깎는다.
    const mbb = player.multiBattleBuff;
    const mbbMult = (mbb && mbb.type==='mpcost' && mbb.battlesLeft>0) ? (1-mbb.value) : 1;
    // 쉬움 난이도 전용 마나 소모량 감소(사용자 요청 — 적 강화를 되돌리는 대신
    // 플레이어 쪽 자원 부담을 줄이는 방식). 다른 배율(마나의 축복 등)과
    // 곱연산으로 함께 적용된다.
    const easyMpMult = player.difficulty==='easy' ? 0.8 : 1;
    // 속임수 폭로 각인(ju_dicereveal, 사기꾼 장신구 각인)의 페널티 — 들통난
    // 뒤 2턴간 모든 스킬 MP 소모 +20%.
    const dicerevealMult = (battleFlags && battleFlags.dicerevealPenaltyTurns>0) ? 1.2 : 1;
    // 유예의 각인(ch_grace, 찰나의 검사 장신구 각인) — 예약(chalnaReserve)
    // 스킬에 한해 MP 소모 +20%. 대신 찰나 유지시간이 늘어난다(아래 chalnaReserve
    // 처리부에서 turnsLeft 초기값으로 반영).
    const cIdGrace = player.equipment && player.equipment.accessory;
    const hasGrace = s.type==='chalnaReserve' && !!(cIdGrace && typeof getEnhancementsFor==='function' && getEnhancementsFor(cIdGrace).includes('ch_grace'));
    const graceMult = hasGrace ? 1.2 : 1;
    const mpCostMult = mbbMult * easyMpMult * dicerevealMult * graceMult;
    const mpCost = Math.max(0, Math.round(s.mp*mpCostMult));
    if(!isRetry && player.mp < mpCost) return;
    // 스킬 쿨타임(사용자 요청 — 1차 직업 궁극기 로테이션 개선). 쿨타임이 남아
    // 있으면 MP가 충분해도 사용할 수 없다(스킬 메뉴에서도 비활성화되지만
    // 방어적으로 한 번 더 막는다).
    // 버그 수정(사용자 제보 — 사기꾼): 쿨다운이 있는 스킬(예: 1차 궁극기)은
    // 성공/실패와 무관하게 시전 즉시 쿨다운이 걸리는데, 손버릇(손버릇/
    // checkGamblerRetry)의 무료 재시도 호출까지 여기 걸려 조용히 return되면
    // setCommandsEnabled(true)/enemyTurn() 둘 다 못 불러 버튼이 영구히
    // 비활성화됐다. 재시도(isRetry)는 쿨다운 검사를 건너뛴다.
    if(!isRetry && s.cooldown && battleFlags && battleFlags.skillCooldowns && battleFlags.skillCooldowns[key]>0) return;
    setCommandsEnabled(false);

    // 은신 연속 사용 방지: 은신이 아닌 스킬을 쓰면 쿨다운이 풀린다. 은신 자체는
    // 아래 s.type==='stealth' 분기에서 쿨다운을 직접 검사/설정하므로 여기서는
    // 건드리지 않는다.
    if(s.type!=='stealth' && battleFlags) battleFlags.stealthOnCooldown = false;

    // 다중 전개(mastery_multideploy): 이 마스터리를 가진 캐릭터는 폭발 계열
    // (detonaterig 타입) 스킬을 아예 사용할 수 없다. MP를 깎기 전에 즉시 막는다.
    if(s.type==='detonaterig' && player.skills && player.skills.includes('mastery_multideploy')){
      setCommandsEnabled(true);
      setBattleMsg('로봇군단의 규율', '다중 전개 상태에서는 폭발 계열 스킬을 사용할 수 없다!');
      return;
    }

    const freeCast = mpCost>0 && hasRelicFlag('freeCastChance') && Math.random() < getRelicSum('freeCastChance');
    if(isRetry){
      // 손버릇(사기꾼) 재시도 — 완전 무료, MP를 아예 건드리지 않는다.
    } else if(freeCast){
      playBanner('무한한 탄창!','def');
    } else {
      player.mp -= mpCost;
    }
    // 스킬 쿨타임(사용자 요청) — 이 스킬에 쿨타임이 있으면 지금 세팅한다.
    // cooldownTickPending은 "플레이어가 실제로 행동했다"는 표시로, 다음
    // 내 턴이 돌아올 때(combat/battle-fx.js의 resetCommandUI()) 정확히
    // 1번만 소비되며 전체 쿨타임을 1씩 깎는다.
    if(battleFlags){
      if(s.cooldown){
        if(!battleFlags.skillCooldowns) battleFlags.skillCooldowns = {};
        battleFlags.skillCooldowns[key] = s.cooldown;
      }
      battleFlags.cooldownTickPending = true;
    }
    // 정예 특성 "마나포식"(사용자 요청): 스킬을 쓸 때마다 MP를 추가로 깎는다.
    // 무료 시전(freeCast)이었어도 이건 별개로 적용된다 — 스킬을 "쓰는 행위"
    // 자체에 반응하는 특성이라, MP를 실제로 소모했는지와는 무관하다.
    if(typeof hasEliteTrait==='function' && hasEliteTrait('manaburn')){
      player.mp = Math.max(0, player.mp - 2);
    }

    if(s.type==='arm'){
      // 상시 토글형 스킬(예: 혈서, 희생의 맹세) — 턴을 소모하지 않고 즉시 켜고 끈다.
      // 스킬마다 켜짐/꺼짐 안내 문구가 다를 수 있어(armMsgOn/armMsgOff), 없으면
      // 기존 범용 문구로 대체한다.
      player[s.armFlag] = !player[s.armFlag];
      player.mp += mpCost; // 토글은 MP를 쓰지 않는다(위에서 미리 깎인 것을 되돌림)
      renderStatus();
      updatePlayerStatusBadges();
      Sound.buff();
      const onMsg = s.armMsgOn || `${s.name}이(가) 켜졌다. 다음 스킬 사용 시 효과가 발동한다.`;
      const offMsg = s.armMsgOff || `${s.name}이(가) 꺼졌다.`;
      setBattleMsg(`${player.name}의 ${s.name}!`, player[s.armFlag] ? onMsg : offMsg);
      setCommandsEnabled(true);
      return;
    }

    if(s.type==='elementpact'){
      // 화염/빙결/번개계약(계약술사) — 서로 배타적인 3방향 토글. 이미 이 원소로
      // 계약 중이면 해제하고, 아니면 이 원소로 전환한다(다른 원소 계약은 자동
      // 해제). battleFlags.elementPact는 전투마다 새로 생성되는 battleFlags에
      // 저장되므로, "전투가 끝날 때까지 유지"가 자연히 보장된다.
      const already = battleFlags.elementPact === s.pactElement;
      battleFlags.elementPact = already ? null : s.pactElement;
      player.mp += mpCost; // 토글은 MP를 쓰지 않는다
      renderStatus();
      updatePlayerStatusBadges();
      Sound.buff();
      const pactLabel = {fire:'화염', ice:'빙결', lightning:'번개'}[s.pactElement];
      // 계약 효과 힌트: 예전엔 "계약을 맺었다"고만 나와서 뭐가 달라지는지
      // 알기 어려웠다 — 이제 계약 시 그 원소가 이후 스킬을 어떻게 바꾸는지
      // 한 줄로 함께 안내한다.
      const pactHint = {
        fire: '화상형 화력.',
        ice: '방어 관통 일격형.',
        lightning: '연속 타격형.',
      }[s.pactElement];
      setBattleMsg(`${player.name}의 ${s.name}!`, already
        ? `${pactLabel} 계약을 해제했다.`
        : `${pactLabel}과(와) 계약을 맺었다 — ${pactHint}`);
      setCommandsEnabled(true);
      return;
    }

    if(s.type==='doubleimagenext'){
      // 분신 배가(환영검사, 레벨12, 재설계): 지속 토글이 아니라 "다음 공격형
      // 스킬 1회"에만 적용되는 1회성 예약이다(사용자 확정). MP는 혈서/원소계약과
      // 달리 환불하지 않는다(위쪽에서 이미 깎인 것을 그대로 둠). 턴은 소모하지
      // 않아, 이어서 바로 공격형 스킬을 쓸 수 있다. 실제 배가 효과는 잔영이
      // 재현될 때(combat/enemy-turn.js의 triggerAfterimageStrike()) 적용된다 —
      // 여기서는 예약 플래그와 배율만 걸어둔다.
      player.doubleImageArmed = true;
      player.doubleImageBoostRatio = s.boostedRatio || 0.65;
      player.doubleImageArmedExtraUsed = false;
      renderStatus();
      updatePlayerStatusBadges();
      Sound.buff();
      setBattleMsg(`${player.name}의 ${s.name}!`, '그림자를 겹쳐 짰다. 다음 공격형 스킬을 쓰면 잔영이 두 번, 더 강하게 나타난다.');
      setCommandsEnabled(true);
      return;
    }

    if(s.type==='passive'){
      // 상시 발동형 마스터리(예: 인내, 시간 왜곡) — 직접 사용해도 턴을 소모하지 않고
      // 효과는 자동으로만 발동한다(설명만 보여줌).
      renderStatus();
      setBattleMsg(`${player.name}의 ${s.name}`, `${s.desc}`);
      setCommandsEnabled(true);
      return;
    }

    if(s.type==='catalyst'){
      // 촉매 주입(rogueCatalyst): 부족한 맹독 중 하나를 즉시 채운다(무작위 — 위 SKILLDB
      // 주석 참고). 세 종류가 이미 모두 채워져 있으면 폭발 없이 안내만 표시한다.
      if(!battleFlags.triplePoison) battleFlags.triplePoison = {toxin:false, venom:false, blight:false};
      const tp = battleFlags.triplePoison;
      const missing = ['toxin','venom','blight'].filter(k=>!tp[k]);
      let msg2;
      if(missing.length){
        const pick = missing[Math.floor(Math.random()*missing.length)];
        tp[pick] = true;
        const filled = ['toxin','venom','blight'].filter(k=>tp[k]).length;
        msg2 = `촉매를 주입해 맹독이 즉시 축적됐다(${filled}/3).`;
      } else {
        msg2 = '이미 세 가지 맹독이 모두 준비되어 있다. 다음 스킬 적중에서 자동으로 폭발한다!';
      }
      renderStatus();
      playCastBurst('def');
      Sound.buff();
      setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      enemyTurn();
      return;
    }

    if(s.type==='loanborrow'){
      // 대출(외상 도박사 레벨10): 즉시 스탯이 오르고 빚을 진다. 실제 반영은
      // relics.js의 applyDebtorLoan()에 그대로 위임한다(신규 로직 없음). 턴은
      // 소모하지 않는다 — 계약술사의 원소계약처럼, 대출을 건 뒤 이어서 바로
      // 다른 공격 스킬을 쓸 수 있어야 자연스럽기 때문.
      const loan = DEBTOR_LOANS[s.loanKey];
      applyDebtorLoan(s.loanKey);
      renderStatus();
      updatePlayerStatusBadges();
      Sound.coin();
      playCastBurst('def');
      setBattleMsg(`${player.name}의 ${s.name}!`, `${loan.name}(${loan.amount}G)을(를) 받았다. 그 대가로 [${loan.penaltyLabel}] 페널티가 붙는다. (남은 빚: ${player.debt}G)`);
      setCommandsEnabled(true);
      return;
    }

    if(s.type==='debtfreeze'){
      // 만기 연장(레벨12): 이자 계산을 몇 층 동안 멈춘다(시간 관리형 — 사용자
      // 명세). 실제 카운트다운/이자 스킵은 explore.js의 proceedAdvance()에서
      // player.debtFreezeFloors를 확인해 처리한다.
      player.debtFreezeFloors = (player.debtFreezeFloors||0) + s.freezeFloors;
      renderStatus();
      playCastBurst();
      Sound.buff();
      setBattleMsg(`${player.name}의 ${s.name}!`, `빚쟁이와 협상했다. 앞으로 ${player.debtFreezeFloors}층 동안 이자가 붙지 않는다.`);
      enemyTurn();
      return;
    }

    if(s.type==='allinloan'){
      // 올인 대출(레벨15 궁극기): 거액을 추가로 끌어와(고정 6000G, 대출 3종과
      // 별개의 "메가 대출" — small/medium/large 카운트에는 포함하지 않아
      // 페널티 종류가 늘어나지는 않는다) 그 돈 자체를 화력으로 바꾼다. 데미지는
      // 대출 실행 "직후"의 총 빚(player.debt)에 비례한다 — 빚을 많이 짊어지고
      // 있을수록 강력해지도록. 사용 즉시 다음 층 황금고블린을 확정 예약한다.
      player.debt = (player.debt||0) + s.loanAmount;
      player.debtPrincipal = (player.debtPrincipal||0) + s.loanAmount;
      if(player.debtBorrowedAtDepth==null) player.debtBorrowedAtDepth = depth;
      const edefAllIn = getEffectiveEnemyDef(enemy.def);
      const onHitMultAllIn = consumeOnHitBonuses();
      let dmg = Math.max(1, Math.round(effectiveAtk()*s.baseMult) - edefAllIn) + Math.round(player.debt*s.debtDmgRatio);
      dmg = applyOutgoingDamageMods(dmg, {type:'physkill', mpCost, onHitMult:onHitMultAllIn});
      enemy.hp = Math.max(0, enemy.hp-dmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, 'crit');
      Sound.coin();
      playBanner('올인!', 'enrage');
      player.debtCollectorImminent = true;
      renderStatus();
      updatePlayerStatusBadges();
      setBattleMsg(`${player.name}의 ${s.name}!`, `빚 ${s.loanAmount}G를 추가로 끌어와 ${enemy.name}에게 ${dmg}의 압도적인 피해를 입혔다! (총 빚: ${player.debt}G) 다음 층에서 황금고블린이 반드시 찾아올 것이다…`);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='venominject'){
      // 체액 흡수(rogueVenomInject, 레벨10 액티브, 역병숙주 — 구 "맹독 주입"):
      // 피해를 입히는 동시에 잠식 스택(enemy.venomStacks, 최대 10)을 쌓는다.
      // 레벨15 패시브(rogueVenomTriple)를 배웠으면 1이 아니라 3씩 쌓인다.
      // [리뉴얼] 여기에 더해, 스택을 소모하지 않고 그 직후 스택 수의 절반(레벨15면
      // 전부)만큼 내 공격력을 이번 전투 동안 흡수한다(아래 참고). 실제 매 라운드
      // 독 피해 처리는 combat/enemy-turn.js의 enemyTurnReal()에서 스택 수 기준으로
      // 매번 새로 계산한다(이 스킬은 스택을 "쌓기"만 하고 직접 틱 피해를 주지 않음).
      const edefVenom = getEffectiveEnemyDef(enemy.def);
      const onHitMultVenom = consumeOnHitBonuses();
      let venomDmg = Math.max(1, Math.round(effectiveAtk()*s.mult) - edefVenom);
      venomDmg = applyOutgoingDamageMods(venomDmg, {type:'physkill', mpCost, onHitMult:onHitMultVenom});
      enemy.hp = Math.max(0, enemy.hp-venomDmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+venomDmg);
      Sound.slash(); playStatusFx('poison');
      rogueRegisterHit(true);
      // 폭주 주입 각인(re_venomrush, 역병숙주 무기)과 고독 각인(re_solovenom,
      // 역병숙주 장신구): 둘 다 자기 전용 스택 보너스를 2배로 만드는데, 고독
      // 각인은 그 대신 스택 상한이 10->6으로 줄어든다(밸런스 재설계 —
      // 스택딜 자체는 enemy-turn.js의 getVenomDmgPerStack()에서 +25%
      // 별도 보상. 원래 상한만 7로 줄이고 보상이 없던 버전은 시뮬레이션상
      // 사실상 죽은 각인이었다). 폭주 주입 각인은 상한 그대로(10) 두는
      // 대신, 상한을 넘긴 만큼 자신도 반동 피해를 입는다. 두 각인은 서로
      // 다른 부위(무기/장신구)라 동시에 낄 수 있다 — 그러면 보너스가 한 번
      // 더 곱해져(예: 삼중 주입까지 있으면 3->6->12) 상한(6) 초과분 반동도
      // 그만큼 커진다.
      const wIdVR = player.equipment && player.equipment.weapon;
      const hasVenomRush = !!(wIdVR && typeof getEnhancementsFor==='function' && getEnhancementsFor(wIdVR).includes('re_venomrush'));
      const cIdSV = player.equipment && player.equipment.accessory;
      const hasSoloVenom = !!(cIdSV && typeof getEnhancementsFor==='function' && getEnhancementsFor(cIdSV).includes('re_solovenom'));
      // [수정] 사용자 요청 — "10레벨부터 3스택씩 쌓이면 좋겠다". 기존에는
      // 기본 1, 레벨15(완전 기생화)를 배워야 3이었는데, 레벨10 액티브부터
      // 바로 3으로 상향(레벨15는 더 이상 이 수치에 관여하지 않고, 흡수
      // 비율(절반→전량) 쪽만 담당하도록 역할을 정리했다 — 아래 완전 기생화
      // desc도 함께 갱신).
      let venomGain = 3;
      if(hasVenomRush) venomGain *= 2;
      if(hasSoloVenom) venomGain *= 2;
      const venomCap = getVenomStackCap();
      const rawStacks = (enemy.venomStacks||0) + venomGain;
      enemy.venomStacks = Math.min(venomCap, rawStacks);
      let venomOverflowMsg = '';
      if(hasVenomRush && rawStacks>venomCap){
        const overflow = rawStacks - venomCap;
        const selfDmg = Math.min(player.hp-1, overflow*2);
        if(selfDmg>0){
          player.hp -= selfDmg;
          venomOverflowMsg = ` 독이 역류해 스스로 ${selfDmg}의 피해를 입었다!`;
        }
      }
      // [신규] 완전 기생화(rogueVenomTriple, 레벨15) 보유 시 갱신 직후 스택
      // 전부를, 아니면 절반(내림)을 공격력으로 흡수한다. battleFlags에
      // 누적시켜두면 combat/enemy-turn.js의 getVenomAbsorbBonus()가
      // effectiveAtk()/effectiveMag()에 매번 반영한다(최대 +30%p 캡).
      const hasFullAbsorb = player.skills && player.skills.includes('rogueVenomTriple');
      const absorbGain = hasFullAbsorb ? enemy.venomStacks : Math.floor(enemy.venomStacks/2);
      let venomAbsorbMsg = '';
      if(absorbGain>0 && battleFlags){
        battleFlags.venomAbsorbPoints = (battleFlags.venomAbsorbPoints||0) + absorbGain;
        venomAbsorbMsg = ` 공격력을 ${absorbGain}%만큼 흡수했다!`;
      }
      updateStatusBadges();
      if(typeof updatePlayerStatusBadges==='function') updatePlayerStatusBadges();
      renderStatus();
      setBattleMsg(`${player.name}의 ${s.name}!`, `${enemy.name}에게 ${venomDmg}의 피해를 입히고 잠식을 더 진행시켰다! (잠식 ${enemy.venomStacks}/${venomCap})${venomAbsorbMsg}${venomOverflowMsg}`);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='haste'){
      // 가속 주문(시간술사 액티브): 마법 피해를 입히는 동시에 적의 턴을 건너뛰고
      // 곧바로 다시 행동한다. 예전 버전은 피해가 전혀 없어서, 사실상 "적 공격
      // 1회를 회피하는 것" 이상의 의미가 없었다(공격 횟수 자체는 늘지 않음 —
      // 턴이 그대로 alternating이라 스킵해봐야 총 공격 횟수는 동일하고 피격만
      // 한 번 준다). 이제는 스킵 효과에 실제 마법 피해까지 더해, 확실하게
      // "공격 + 적 턴 무효화"를 동시에 얻는 스킬로 재설계했다.
      //
      // 남용 방지(사용자 지적): 이 스킬은 enemyTurn()을 아예 호출하지 않고 바로
      // resetCommandUI()로 커맨드를 다시 연다 — 즉 MP만 충분하면 적이 단 한 번도
      // 행동하지 못하고 계속 얻어맞는 것이 가능했다. 단순히 기본 MP를 올리는
      // 것만으로는 마나를 많이 쌓은 캐릭터에게는 여전히 무한 스팸이 가능하므로,
      // 같은 전투 안에서 재사용할 때마다 추가 비용이 기하급수적으로(1.8배씩)
      // 불어나는 방식으로 막는다. battleFlags.hasteCastCount는 전투마다 새로
      // 생성되는 battleFlags에 저장되므로 전투가 바뀌면 자연히 0으로 리셋된다.
      const castNum = battleFlags.hasteCastCount || 0;
      // 무한 가속 각인(me_infiniteaccel, 시간술사 무기 각인 — 사용자 요청):
      // 연쇄 시전 시 MP 증가율이 절반으로 줄어든다(예: 1.8배 -> 1.4배). 대신
      // 다른 스킬/아이템을 한 번이라도 쓰면 연쇄가 끊긴다(플레이어 액션
      // 공용 지점인 playerSkill()/playerItem() 시작부에서 hasteCastCount를
      // 리셋 — 아래 참고).
      const wIdIA = player.equipment && player.equipment.weapon;
      const hasInfiniteAccel = !!(wIdIA && typeof getEnhancementsFor==='function' && getEnhancementsFor(wIdIA).includes('me_infiniteaccel'));
      const comboMult = hasInfiniteAccel ? (1 + ((s.comboCostMult||1.8)-1)*0.5) : (s.comboCostMult || 1.8);
      const extraCost = castNum>0 ? Math.round(s.mp * (Math.pow(comboMult, castNum) - 1)) : 0;
      if(extraCost>0){
        if(player.mp < extraCost){
          // 추가 비용을 감당할 MP가 없다 — 위에서 이미 깎인 기본 비용(mpCost)을 돌려주고 취소한다.
          player.mp += mpCost;
          renderStatus();
          setCommandsEnabled(true);
          setBattleMsg('시간이 버틴다…', `연달아 시간을 뒤트는 데 필요한 마나가 부족하다! (추가로 ${extraCost} 필요)`);
          return;
        }
        player.mp -= extraCost;
      }
      battleFlags.hasteCastCount = castNum + 1;

      const edefHaste = getEffectiveEnemyDef(enemy.def);
      // 역행의 각인(me_regression): 방금 그 추가 행동이 이 각인으로 발동한
      // 것이었다면, 이번 가속 주문 위력이 20% 낮아진다(1회 한정, 여기서 소모).
      let hasteMultUsed = s.mult;
      let regressionMsg = '';
      if(battleFlags.timeRegressionActive){
        hasteMultUsed = s.mult * 0.8;
        battleFlags.timeRegressionActive = false;
        regressionMsg = ' (역행의 각인 — 위력 20% 감소)';
      }
      let hasteDmg = Math.max(1, Math.round(effectiveMag()*hasteMultUsed) - Math.round(edefHaste*0.5));
      const onHitMultHaste = consumeOnHitBonuses();
      hasteDmg = applyOutgoingDamageMods(hasteDmg, {type:'magicskill', mpCost, onHitMult:onHitMultHaste});
      enemy.hp = Math.max(0, enemy.hp-hasteDmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+hasteDmg);
      Sound.magic();
      // 시간 조각: 가속 주문을 성공적으로 시전할 때마다 하나씩 쌓인다(최대 5).
      // 위쪽에서 MP 부족으로 취소된 경우엔 여기 도달하지 않으므로 자연히 제외된다.
      battleFlags.timeStacks = Math.min(5, (battleFlags.timeStacks||0)+1);
      updatePlayerStatusBadges();
      renderStatus();
      playCastBurst('def');
      Sound.buff();
      let hasteMsg = `시간이 압축되어 ${enemy.name}에게 ${hasteDmg}의 피해를 입혔다! 그대로 시간이 뒤틀려, 적의 턴을 건너뛰고 곧바로 다시 행동할 수 있게 되었다! (시간 조각 ${battleFlags.timeStacks}/5)`;
      if(extraCost>0) hasteMsg += ` (연속 사용으로 MP ${extraCost} 추가 소모)`;
      setBattleMsg(`${player.name}의 ${s.name}!`, hasteMsg);
      if(checkBattleEnd()) return;
      resetCommandUI();
      return;
    }

    if(s.type==='stealth'){
      // 은신(도적 기본 스킬, 구 '흡수의 손길'을 대체): 이번에 오는 적의 공격을 완전히
      // 피하고, 다음 자신의 공격(기본 공격/스킬 모두)에 피해 +30%가 붙는다.
      // 회피 소모는 combat/enemy-turn.js의 enemyAction()에서, 피해 보너스 소모는
      // playerAttack()과 이 함수 하단 범용 phys/magic 분기·multihit 분기에서 처리한다.
      // (예전엔 두 플래그 모두 설정만 되고 어디서도 소비되지 않아 사실상 아무 효과가
      // 없던 버그였다 — 이번에 실제 소비 코드까지 채워 넣었다.)
      //
      // 연속 사용 방지(사용자 요청): battleFlags.stealthOnCooldown이 true면 다시 쓸
      // 수 없다. 은신이 아닌 다른 행동(공격/다른 스킬/아이템)을 한 번이라도 하면
      // 자동으로 풀린다(각 행동 함수 상단에서 이 플래그를 false로 되돌림).
      if(battleFlags.stealthOnCooldown){
        player.mp += mpCost;
        renderStatus();
        setCommandsEnabled(true);
        setBattleMsg('그림자가 아직 낯설다…', '은신은 연속으로 사용할 수 없다. 다른 행동을 한 번 거친 뒤 다시 시도하라.');
        return;
      }
      player.stealthEvadeArmed = true;
      player.stealthDmgBonusArmed = true;
      battleFlags.stealthOnCooldown = true;
      renderStatus();
      playCastBurst('def');
      Sound.guard();
      setBattleMsg(`${player.name}의 ${s.name}!`, '그림자 속으로 몸을 숨겼다. 이번에 오는 공격을 완전히 피하고, 다음 공격의 위력이 크게 오른다.');
      enemyTurn();
      return;
    }

    // 계율(mastery_creed): 스킬 사용은 두 계율 모두에 대해 위반이 아니므로 스택이 오른다.
    if(battleFlags && battleFlags.creed){
      battleFlags.creedStacks = Math.min(5, (battleFlags.creedStacks||0)+1);
    }

    // 패 획득(mastery_drawcard): 턴을 소모하는 스킬을 사용할 때마다 카드 한 장을
    // 자동으로 뽑는다. 완성된 조합이 있으면 resolveCardCombo()가 즉시 추가 피해를
    // 입히고 손을 비운다(이 마스터리가 없는 캐릭터에게는 아무 영향 없음). 패 교환
    // (cardexchange)은 스스로 카드를 뽑는 별도 로직이 있으므로 여기서는 제외해
    // 한 번의 사용에 카드가 두 장 뽑히지 않게 한다.
    if(s.type!=='cardexchange' && player.skills && player.skills.includes('mastery_drawcard')){
      if(!battleFlags.cardHand) battleFlags.cardHand = [];
      battleFlags.cardHand.push(1 + Math.floor(Math.random()*7));
      if(battleFlags.cardHand.length>3) battleFlags.cardHand.shift();
      resolveCardCombo();
    }

    if(s.type==='ridewave'){
      // 파도타기(운명의 반란자 액티브): 운 게이지를 즉시 최댓값으로 밀어붙인다.
      battleFlags.luckGauge = 3;
      renderStatus();
      playCastBurst();
      Sound.buff();
      setBattleMsg(`${player.name}의 ${s.name}!`, '운명의 파도를 강제로 밀어붙여 운 게이지가 최고조에 달했다! 당분간 공격력이 크게 오른다.');
      enemyTurn();
      return;
    }

    if(s.type==='cardexchange'){
      // 패 교환(패의 마술사 액티브): 카드 한 장을 새 카드로 교체한다. 이미 조합
      // 훅에서 카드를 한 장 뽑았을 수 있으므로(위 마스터리 훅), 손이 이미 3장이면
      // 마지막 카드를 대신 교체하고, 아니면 그냥 한 장을 추가한다.
      if(!battleFlags.cardHand) battleFlags.cardHand = [];
      if(battleFlags.cardHand.length>=3) battleFlags.cardHand.pop();
      battleFlags.cardHand.push(1 + Math.floor(Math.random()*7));
      const exchangeCombo = resolveCardCombo();
      renderStatus();
      playCastBurst('def');
      Sound.buff();
      const msg2 = exchangeCombo
        ? `카드를 바꿔치기하자 ${exchangeCombo.label}이(가) 완성되어 ${exchangeCombo.dmg}의 추가 피해를 입혔다!`
        : `카드를 바꿔치기했다(${battleFlags.cardHand.length}장).`;
      setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='cursemark'){
      // 저주의 표식(mageCurseMark, 레벨12): 적에게 낙인을 하나 새긴다. 데미지는
      // 약하게(기본 마법 공격 수준) 잡고, 진짜 보상은 낙인을 소모하는 저주 회수
      // (cursereap)에서 나온다. battleFlags.curseMarkStacks는 전투마다 새로
      // 생성되는 battleFlags에 저장되므로 전투가 바뀌면 자연히 리셋된다.
      const edefMark = getEffectiveEnemyDef(enemy.def);
      let markDmg = Math.max(1, Math.round(effectiveMag()*s.mult) - Math.round(edefMark*0.5));
      const onHitMultMark = consumeOnHitBonuses();
      markDmg = applyOutgoingDamageMods(markDmg, {type:'magicskill', mpCost, onHitMult:onHitMultMark});
      enemy.hp = Math.max(0, enemy.hp-markDmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+markDmg);
      Sound.magic();
      battleFlags.curseMarkStacks = Math.min(5, (battleFlags.curseMarkStacks||0)+1);
      playStatusFx('poison');
      renderStatus();
      setBattleMsg(`${player.name}의 ${s.name}!`, `${enemy.name}의 영혼에 저주의 표식을 새겼다(${battleFlags.curseMarkStacks}/5). ${markDmg}의 피해를 입혔다.`);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='cursereap'){
      // 저주 회수(mageCurseReap, 레벨15): 저주의 표식으로 쌓아둔 낙인을 전부
      // 소모해 낙인 수에 비례한 강력한 일격을 꽂는다. 인내의 파훼자
      // (warriorEnduranceActive)의 baseMult+stackMult 패턴을 그대로 재사용했다.
      const stacks = (battleFlags && battleFlags.curseMarkStacks) || 0;
      battleFlags.curseMarkStacks = 0;
      const reapMult = s.baseMult + s.stackMult*stacks;
      const edefReap = Math.round(getEffectiveEnemyDef(enemy.def)*(1-(s.defPierce||0)));
      const onHitMultReap = consumeOnHitBonuses();
      let reapDmg = Math.max(1, Math.round(effectiveMag()*reapMult) - edefReap);
      reapDmg = applyOutgoingDamageMods(reapDmg, {type:'magicskill', mpCost, onHitMult:onHitMultReap});
      enemy.hp = Math.max(0, enemy.hp-reapDmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+reapDmg, stacks>0?'crit':undefined);
      Sound.magic();
      renderStatus();
      const reapMsg = stacks>0
        ? `새겨둔 저주의 표식(${stacks}개)을 한꺼번에 거둬들여 ${enemy.name}에게 ${reapDmg}의 압도적인 피해를 입혔다!`
        : `거둬들일 표식이 없어 기본 위력으로 ${enemy.name}에게 ${reapDmg}의 피해를 입혔다.`;
      setBattleMsg(`${player.name}의 ${s.name}!`, reapMsg);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='cursebrand'){
      // 저주 각인(mageCurseBrand, 레벨12, 저주술사 재설계판): 마법 피해 + 적에게
      // 저주(포이즌 타입 도트) 부여. 직접 피해 배율과 도트 세기(ratio) 둘 다
      // 내가 짊어진 저주 개수(getCurseCount(), relics.js)에 비례해 세진다 —
      // "내 저주가 곧 힘의 원천"이라는 저주술사 정체성을 그대로 따른다. 기존
      // applyDot()/enemy.dots 파이프라인을 그대로 재사용해 신규 애니메이션
      // 코드가 필요 없다(역병숙주의 역병중첩과 달리, 이건 일반 도트라
      // 턴이 다 되면 자연히 사라진다 — 전투 끝까지 지속되는 게 아님).
      const curses = (typeof getCombatCurseCount === 'function') ? getCombatCurseCount() : ((typeof getCurseCount === 'function') ? getCurseCount() : 0);
      const edefBrand = getEffectiveEnemyDef(enemy.def);
      const onHitMultBrand = consumeOnHitBonuses();
      let brandDmg = Math.max(1, Math.round(effectiveMag()*s.mult) - Math.round(edefBrand*0.5));
      if(curses>0) brandDmg = Math.round(brandDmg*(1+curses*s.curseCountBonus));
      // 겹저주 각인(me_doublecurse, 저주술사 방어구 각인 — 사용자 요청): 이미
      // 도트가 걸려있는 적에게 다시 걸면, 남은 도트를 즉시 30% 만큼 미리
      // 터뜨린 뒤 새 도트를 건다(완전 중첩은 기존 도트 시스템이 "같은 종류는
      // 덮어쓰기"만 지원해 위험 부담이 있어, 대신 "먼저 터뜨리고 새로 건다"는
      // 더 단순하고 안전한 방식으로 구현). 새 도트 자체는 20% 약해진다.
      const aIdDC = player.equipment && player.equipment.armor;
      const hasDoubleCurse = !!(aIdDC && typeof getEnhancementsFor==='function' && getEnhancementsFor(aIdDC).includes('me_doublecurse'));
      let doubleCurseMsg = '';
      let dotRatioBrand = (s.dotBaseRatio||0.25) + curses*(s.dotRatioPerCurse||0.08);
      if(hasDoubleCurse){
        const existingBrandDot = (enemy.dots||[]).find(d=>d.type==='poison' && d.turns>0);
        if(existingBrandDot){
          const earlyBurst = Math.max(1, Math.round(existingBrandDot.dmgPerTurn * existingBrandDot.turns * 0.3));
          brandDmg += earlyBurst;
          doubleCurseMsg = ` 남아있던 저주를 미리 30% 터뜨렸다(+${earlyBurst})!`;
        }
        dotRatioBrand = Math.round(dotRatioBrand*0.8*100)/100;
      }
      brandDmg = applyOutgoingDamageMods(brandDmg, {type:'magicskill', mpCost, onHitMult:onHitMultBrand});
      enemy.hp = Math.max(0, enemy.hp-brandDmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+brandDmg, curses>0?'crit':undefined);
      Sound.magic(); playStatusFx('poison');
      applyDot({type:'poison', basis:'mag', ratio:dotRatioBrand, turns:s.dotTurns||4, label:'저주 각인'});
      renderStatus();
      const brandMsg = (curses>0
        ? `짊어진 저주(${curses}개)의 힘으로 낙인이 짙게 새겨졌다! ${enemy.name}에게 ${brandDmg}의 피해를 입히고 강한 저주를 남겼다.`
        : `${enemy.name}에게 ${brandDmg}의 피해를 입히고 저주를 남겼다.`) + doubleCurseMsg;
      setBattleMsg(`${player.name}의 ${s.name}!`, brandMsg);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='cursebloom'){
      // 저주 만개(mageCurseBloom, 레벨15 궁극기, 저주술사 재설계판): 내 저주
      // 개수에 비례한 큰 피해 + 저주 각인이 남긴 포이즌 도트가 아직 있으면 그
      // 잔여 피해량(dmgPerTurn×turns — 계약술사 원소 붕괴와 동일한 계산 방식
      // 재사용)까지 한꺼번에 터뜨리고 제거한다. 각인 없이 바로 써도 저주 개수만
      // 으로 준수한 위력이 나오지만, 먼저 각인을 심어두면 더 강해지는 콤보 구조.
      const curses = (typeof getCombatCurseCount === 'function') ? getCombatCurseCount() : ((typeof getCurseCount === 'function') ? getCurseCount() : 0);
      const edefBloom = getEffectiveEnemyDef(enemy.def);
      const onHitMultBloom = consumeOnHitBonuses();
      // 만개 순환 각인(me_curseCycle, 저주술사 장신구 각인 — 사용자 요청):
      // 원래는 저주 각인의 잔여 도트를 흡수(제거)해서 터뜨리는데, 이 각인이
      // 있으면 도트를 지우지 않고 그대로 유지한 채(계속 틱딜) 만개 효과만
      // 발동한다. 대신 만개의 저주 개수 보너스가 20% 줄어든다.
      const cIdCC = player.equipment && player.equipment.accessory;
      const hasCurseCycle = !!(cIdCC && typeof getEnhancementsFor==='function' && getEnhancementsFor(cIdCC).includes('me_curseCycle'));
      const curseCountBonusUsed = hasCurseCycle ? s.curseCountBonus*0.8 : s.curseCountBonus;
      let bloomDmg = Math.max(1, Math.round(effectiveMag()*s.baseMult) - edefBloom);
      bloomDmg = Math.round(bloomDmg*(1+curses*curseCountBonusUsed));
      const curseDot = (enemy.dots||[]).find(d=>d.type==='poison' && d.turns>0);
      let detonateMsg = '';
      if(curseDot){
        const detonateBonus = Math.max(1, curseDot.dmgPerTurn * curseDot.turns);
        bloomDmg += detonateBonus;
        if(hasCurseCycle){
          detonateMsg = ' 저주를 그대로 유지한 채 만개시켰다(도트 지속)!';
        } else {
          enemy.dots = enemy.dots.filter(d=>d!==curseDot);
          updateStatusBadges();
          detonateMsg = ' 새겨져 있던 저주까지 한꺼번에 만개시켰다!';
        }
      }
      bloomDmg = applyOutgoingDamageMods(bloomDmg, {type:'magicskill', mpCost, onHitMult:onHitMultBloom});
      enemy.hp = Math.max(0, enemy.hp-bloomDmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+bloomDmg, 'crit');
      Sound.magic(); playCastBurst();
      renderStatus();
      setBattleMsg(`${player.name}의 ${s.name}!`, `짊어진 저주(${curses}개)가 한꺼번에 만개하며 ${enemy.name}에게 ${bloomDmg}의 압도적인 피해를 입혔다!${detonateMsg}`);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='enduranceburst'){
      const stacks = (battleFlags && battleFlags.enduranceStacks) || 0;
      battleFlags.enduranceStacks = 0;
      const mult = s.baseMult + s.stackMult*stacks;
      const edef = Math.round(getEffectiveEnemyDef(enemy.def)*(1-(s.defPierce||0)));
      const onHitMult = consumeOnHitBonuses();
      let dmg = Math.max(1, Math.round(effectiveAtk()*mult) - edef);
      dmg = applyOutgoingDamageMods(dmg, {type:'physkill', mpCost, onHitMult});
      consumeAtkBuff();
      rogueRegisterHit(true);
      enemy.hp = Math.max(0, enemy.hp-dmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, stacks>0?'crit':undefined);
      Sound.slash();
      renderStatus();
      const msg2 = stacks>0
        ? `쌓아온 인내(${stacks}스택)를 모두 쏟아부어 ${enemy.name}에게 ${dmg}의 강력한 피해를 입혔다!`
        : `쌓인 인내가 없어 기본 위력으로 ${enemy.name}에게 ${dmg}의 피해를 입혔다.`;
      setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='guard'){
      player.guardingNextHit = true;
      renderStatus();
      playCastBurst('def');
      Sound.guard();
      setBattleMsg(`${player.name}은(는) 방어 태세를 취했다.`, '다음 공격의 피해가 크게 줄어든다.');
      enemyTurn();
      return;
    }

    // ---------- 찰나검사(warrior_chalna) ----------
    // 예약: 이번 턴은 피해 없이 battleFlags.chalnaReserve만 세팅한다. 유지
    // 타이밍(다음 내 턴 안에 못 이으면 소멸)은 combat/enemy-turn.js의
    // enemyTurnReal()에서 처리(exposedTurns 등과 같은 자리, turnsLeft 1에서
    // 시작해 첫 적 턴엔 0으로만 내려가고 그 다음 적 턴에 실제로 지워진다 —
    // 그래야 "다음 내 턴"(적 턴 사이에 낀 그 한 번)엔 확실히 남아있다).
    if(s.type==='chalnaReserve'){
      // 유예의 각인(ch_grace): 유지시간 1턴 -> 2턴(다다음 내 턴까지 이을 수 있음).
      battleFlags.chalnaReserve = {beat: s.beat, turnsLeft: hasGrace ? 2 : 1};
      renderStatus();
      updatePlayerStatusBadges();
      Sound.buff();
      let reserveMsg = `${s.name.replace(' 예약','')}의 찰나를 남겼다. 다음 검격과 이으면 콤보가 발동한다.`;
      // 선결의 각인(ch_forestrike, 무기 각인) — 예약 시에도 그 스킬 배율의
      // 30%만큼 즉발 피해가 함께 나간다(대신 콤보 배율 페널티는 chalnaStrike
      // 처리부에서 적용).
      const wIdFore = player.equipment && player.equipment.weapon;
      const hasForestrike = !!(wIdFore && typeof getEnhancementsFor==='function' && getEnhancementsFor(wIdFore).includes('ch_forestrike'));
      if(hasForestrike){
        const edefFore = getEffectiveEnemyDef(enemy.def);
        const foreMultTotal = s.mult*(s.hits||1);
        const foreDmg = Math.max(1, Math.round(effectiveAtk()*foreMultTotal*0.3) - Math.round(edefFore*0.3));
        enemy.hp = Math.max(0, enemy.hp-foreDmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+foreDmg);
        Sound.slash();
        if(typeof spawnSlashImageFx==='function') spawnSlashImageFx();
        reserveMsg += ` 선결의 일격으로 ${foreDmg}의 피해를 함께 입혔다.`;
      }
      setBattleMsg(`${player.name}의 ${s.name}!`, reserveMsg);
      if(hasForestrike && checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='chalnaStrike'){
      const reserve = battleFlags.chalnaReserve;
      const combo = reserve ? CHALNA_COMBOS[[reserve.beat, s.beat].sort().join('+')] : null;
      if(combo) battleFlags.chalnaReserve = null;
      const hits = (combo ? combo.hits : s.hits) || 1;
      let mult = combo ? combo.mult : s.mult;
      // 선결의 각인(ch_forestrike, 무기 각인) — 예약 시 즉발피해를 주는 대신,
      // 콤보 자체의 배율은 15% 줄어든다.
      if(combo){
        const wIdFore2 = player.equipment && player.equipment.weapon;
        const hasForestrike2 = !!(wIdFore2 && typeof getEnhancementsFor==='function' && getEnhancementsFor(wIdFore2).includes('ch_forestrike'));
        if(hasForestrike2) mult *= 0.85;
      }
      const defPierce = (combo && combo.defPierce) || 0;
      const edef = Math.round(getEffectiveEnemyDef(enemy.def)*(1-defPierce));
      // 버그 수정(사용자 제보) — mult는 기존 multihit 스킬(연속 베기 등)과
      // 동일하게 "타당" 배율인데, 이전엔 atk*mult와 edef를 hits로 나눈 뒤 다시
      // hits번 더해서 결국 타수와 무관하게 항상 "1타 분량"으로 상쇄되고 있었다.
      // 기존 multihit 타입 처리부(player-actions.js 1689번째 줄 근처)와 동일하게
      // 매 타마다 전체 mult/edef를 그대로 적용한다.
      const perHit = Math.max(1, Math.round(effectiveAtk()*mult) - edef);
      const rawParts = [];
      for(let i=0;i<hits;i++) rawParts.push(perHit);
      const rawTotal = rawParts.reduce((a,b)=>a+b,0);
      const onHitMult = consumeOnHitBonuses();
      const extraCritChance = (combo && combo.critBonus) || 0;
      let boostedTotal = applyOutgoingDamageMods(rawTotal, {type:'physkill', mpCost, onHitMult, extraCritChance});
      const mod = applySkillModifiers(boostedTotal, combo || s);
      const scale = mod.value / rawTotal;
      const parts = rawParts.map(d=>Math.max(1, Math.round(d*scale)));
      const total = parts.reduce((a,b)=>a+b,0);
      consumeAtkBuff();
      rogueRegisterHit(true);
      // 콤보 부가효과 적용
      let comboMsg = '';
      if(combo){
        // 진각: 적 방어력 감소 — 정찰 로봇과 동일한 exposedTurns/exposePierce
        // 필드를 재사용한다(새 필드를 만들지 않아도 되는 기존 시스템).
        if(combo.enemyDefDownPct){
          enemy.exposedTurns = combo.enemyDefDownTurns;
          enemy.exposePierce = combo.enemyDefDownPct;
          comboMsg += ` 적의 자세가 무너져 방어력이 ${combo.enemyDefDownTurns}턴간 낮아진다.`;
        }
        // 부동참: 받는 피해 감소 — 기존 buffDefTurns/buffDefMult(범용 방어 버프) 재사용.
        if(combo.selfDmgReducePct){
          player.buffDefTurns = Math.max(player.buffDefTurns||0, combo.selfDmgReduceTurns);
          player.buffDefMult = Math.min(player.buffDefMult||1, 1-combo.selfDmgReducePct);
          comboMsg += ` 자세가 안정되어 ${combo.selfDmgReduceTurns}턴간 받는 피해가 줄어든다.`;
        }
        // 완급: 확정 치명타(guaranteedCritMult, applySkillModifiers에서 처리됨)
        // + 경직 — 새 필드 enemy.chalnaStunTurns, 실제 턴 스킵 처리는 combat/
        // enemy-turn.js의 enemyAction() 맨 앞에서 확인한다.
        if(combo.stunTurns){
          enemy.chalnaStunTurns = Math.max(enemy.chalnaStunTurns||0, combo.stunTurns);
          comboMsg += ` 어긋난 박자에 ${enemy.name}이(가) ${combo.stunTurns}턴간 경직된다!`;
        }
        // 가속참: 자신 속도 버프 — player.spd를 직접 올리고 델타를 저장해뒀다가
        // enemyTurnReal()에서 턴이 다 되면 정확히 그만큼 되돌린다.
        if(combo.selfSpdBuffPct){
          const delta = Math.max(1, Math.round(player.spd*combo.selfSpdBuffPct));
          player.spd += delta;
          battleFlags.chalnaSpdBuffDelta = (battleFlags.chalnaSpdBuffDelta||0) + delta;
          battleFlags.chalnaSpdBuffTurns = Math.max(battleFlags.chalnaSpdBuffTurns||0, combo.selfSpdBuffTurns);
          comboMsg += ` 몸놀림이 가벼워져 ${combo.selfSpdBuffTurns}턴간 속도가 오른다.`;
        }
      }
      // 타별로 순차 적용(사용자 요청 — "4번 베면 4번에 걸쳐 데미지가 들어갔으면
      // 좋겠다"). 기존 multihit 타입 처리부와 동일한 패턴(220ms 간격)이며,
      // 매 타마다 이미지 VFX도 그 타격 시점에 맞춰 하나씩 재생한다.
      const title = combo ? `${player.name}의 ${combo.name}!` : `${player.name}의 ${s.name}!`;
      setBattleMsg(title, '연속 공격 중...');
      parts.forEach((hitDmg, i)=>{
        setTimeout(()=>{
          enemy.hp = Math.max(0, enemy.hp-hitDmg);
          updateEnemyHpBar(); shakeEnemy();
          popDamage('-'+hitDmg, (mod.triggered && i===parts.length-1) ? 'crit' : undefined);
          Sound.slash();
          if(typeof spawnSlashImageFx==='function') spawnSlashImageFx();
        }, i*220);
      });
      setTimeout(()=>{
        renderStatus();
        updatePlayerStatusBadges();
        if(hits>1 && typeof playComboFinish==='function') playComboFinish(hits);
        const bodyMsg = (combo ? combo.desc+' ' : '') + `${hits>1?parts.join(' + ')+' = 총 ':''}${total}의 피해!${comboMsg}`;
        setBattleMsg(title, bodyMsg);
        if(checkBattleEnd()) return;
        enemyTurn();
      }, hits*220 + 250);
      return;
    }

    if(s.type==='chalnaUltimate'){
      // 삼박난무 — 찰나 예약/콤보 시스템과 무관한 독립 궁극기(15레벨).
      const edefTri = Math.round(getEffectiveEnemyDef(enemy.def)*(1-(s.defPierce||0)));
      const onHitMultTri = consumeOnHitBonuses();
      let dmgTri = Math.max(1, Math.round(effectiveAtk()*s.mult) - edefTri);
      dmgTri = applyOutgoingDamageMods(dmgTri, {type:'physkill', mpCost, onHitMult:onHitMultTri});
      const modTri = applySkillModifiers(dmgTri, s);
      dmgTri = modTri.value;
      consumeAtkBuff();
      rogueRegisterHit(true);
      // 버그 수정(사용자 제보) — 데미지는 즉시 뜨는데 VFX는 3연속으로 270ms에
      // 걸쳐 재생돼 서로 안 맞았다. "세 박자"를 상징하는 VFX 3연타를 먼저
      // 재생하고, 그게 다 끝나는 시점에 맞춰 데미지가 임팩트처럼 뜨도록 순서를
      // 바꿨다(스태거 80ms×3 + 여유 100ms).
      setBattleMsg(`${player.name}의 ${s.name}!`, '세 박자를 몰아치는 중...');
      for(let i=0;i<3;i++) setTimeout(()=>{
        if(typeof spawnSlashImageFx==='function') spawnSlashImageFx();
        if(typeof spawnFigureSlashFx==='function') spawnFigureSlashFx();
        Sound.slash();
      }, i*80);
      setTimeout(()=>{
        enemy.hp = Math.max(0, enemy.hp-dmgTri);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmgTri, modTri.triggered?'crit':undefined);
        Sound.slash();
        renderStatus();
        setBattleMsg(`${player.name}의 ${s.name}!`, `세 박자가 몰아쳐 ${dmgTri}의 피해를 입혔다!`);
        if(checkBattleEnd()) return;
        enemyTurn();
      }, 260);
      return;
    }

    if(s.type==='legiondeploy'){
      // 역할 배치(로봇군단장): 사용자 피드백으로 "무작위 배정"을 폐기하고
      // 계약술사/외상 도박사와 같은 방식으로 재설계했다 — 정찰/화력/방벽을
      // 각각 독립된 스킬 3개(mechanicDeployRecon/Firepower/Shield, jobs.js의
      // activeSkillIds 복수형으로 한꺼번에 지급)로 분리해, 원할 때 원하는 역할을
      // 직접 골라 배치한다. s.roleKind가 있으면 그 역할로 확정 배치하고, 없으면
      // (구버전 mechanicRoleDeploy 레거시 세이브 호환용) 기존처럼 무작위로 뽑는다.
      // battleFlags.rig가 비어있으면 그 자리에, 이미 차 있으면 battleFlags.rig2에
      // 배치한다(다중 전개 마스터리로 상한 2기). 둘 다 차 있으면 rig(먼저 배치된
      // 쪽)를 교체한다.
      const roles = [
        {kind:'recon', label:'정찰', rigMult:0.55, exposeTurns:3, exposePierce:0.25},
        {kind:'firepower', label:'화력', rigMult:0.95},
        {kind:'shield', label:'방벽', rigMult:0.45, shieldPct:0.2},
        // 강철 군단장 레벨1 "긴급 배치" 전용 — 역할 효과 없는 저비용 필러.
        {kind:'filler', label:'예비', rigMult:0.35},
      ];
      const role = s.roleKind ? roles.find(r=>r.kind===s.roleKind) : roles[Math.floor(Math.random()*roles.length)];
      const dmgPerTick = Math.max(1, Math.round(effectiveMag()*role.rigMult));
      const newRig = {kind:role.kind, name:`역할 로봇(${role.label})`, turnsLeft: s.rigTurns, dmgPerTick, shieldPct: role.shieldPct||0};
      let slotMsg;
      if(!battleFlags.rig || battleFlags.rig.turnsLeft<=0){
        battleFlags.rig = newRig; slotMsg = '로봇을 새로 배치했다.';
      } else if(!battleFlags.rig2 || battleFlags.rig2.turnsLeft<=0){
        battleFlags.rig2 = newRig; slotMsg = '두 번째 로봇을 배치했다.';
      } else {
        battleFlags.rig = newRig; slotMsg = '이미 2기가 있어 가장 먼저 배치된 로봇을 교체했다.';
      }
      // 증축 각인(me_fortify, 강철 군단장 무기 각인 — 사용자 요청): 화력
      // 로봇 배치 시, 남은 빈 슬롯이 있으면 그 자리에도 화력 로봇을 하나 더
      // 즉석 배치한다(2기 동시 편성). 대신 방금 배치한 로봇(newRig)과 이번에
      // 추가되는 로봇 둘 다 지속시간이 1턴 짧다.
      let fortifyMsg = '';
      if(key==='mechanicDeployFirepower'){
        const wIdFo = player.equipment && player.equipment.weapon;
        if(wIdFo && typeof getEnhancementsFor==='function' && getEnhancementsFor(wIdFo).includes('me_fortify')){
          newRig.turnsLeft = Math.max(1, newRig.turnsLeft-1);
          const emptySlotKey = (battleFlags.rig!==newRig && (!battleFlags.rig || battleFlags.rig.turnsLeft<=0)) ? 'rig'
            : (battleFlags.rig2!==newRig && (!battleFlags.rig2 || battleFlags.rig2.turnsLeft<=0)) ? 'rig2' : null;
          if(emptySlotKey){
            battleFlags[emptySlotKey] = {kind:newRig.kind, name:newRig.name, turnsLeft:newRig.turnsLeft, dmgPerTick:newRig.dmgPerTick, shieldPct:newRig.shieldPct};
            fortifyMsg = ' 증축 각인이 남은 자리에 화력 로봇을 하나 더 세웠다!';
          }
        }
      }
      if(role.kind==='recon'){
        enemy.exposedTurns = role.exposeTurns;
        enemy.exposePierce = role.exposePierce||0;
      }
      const edef = getEffectiveEnemyDef(enemy.def);
      let dmg = Math.max(1, dmgPerTick*2 - Math.round(edef*0.5));
      dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost});
      enemy.hp = Math.max(0, enemy.hp-dmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
      // 정찰/화력/방벽 드론 3종 전용 설치음(사용자 요청). 필러(긴급배치)는
      // 기존 magic() 그대로 유지 — 요청 범위가 명시적으로 이 3종이었음.
      if(role.kind==='filler') Sound.magic();
      else Sound.droneDeploy();
      renderStatus();
      updateRigVisuals();
      let msg2 = `${role.label} 역할의 로봇을 배치했다! 첫 사격으로 ${dmg}의 피해를 입혔다. ${slotMsg}${fortifyMsg}`;
      if(role.kind==='recon') msg2 += ' 적의 급소가 드러나 받는 피해가 늘어난다.';
      if(role.kind==='shield') msg2 += ` 가동 중엔 받는 피해의 ${Math.round((role.shieldPct||0)*100)}%를 대신 막아준다.`;
      setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='legionbarrage'){
      // 집중포화(mechanicFocusFire, 레벨15 궁극기, 로봇군단장): 가동 중인 로봇
      // (rig/rig2, 있는 만큼)의 역할을 그대로 활용해 함께 사격한다. 로봇 자체는
      // 파괴하지 않는다(turnsLeft 그대로 유지) — 데토네이터의 "기폭"과 정반대로
      // 이 분기는 로봇을 계속 살려서 굴리는 것이 정체성이기 때문.
      //
      // 연출 재설계(사용자 피드백 — "게이지 모으는 연출과 공격 애니메이션이
      // 있으면 좋겠다, 텍스트가 너무 빨리 지나간다"): 즉시 한 방에 터지는 대신
      // (1) 게이지 충전 메시지 → (2) 로봇들이 한 기씩 순차 발사(전체 데미지를
      // 사격 주체 수만큼 나눠서, 각자 슬롯이 번쩍이며 데미지가 하나씩 뜸) →
      // (3) 최종 합산 메시지 순서로 진행한다. 각 단계 사이 간격을 750~800ms로
      // 넉넉히 잡아 실제로 읽을 수 있게 했다(기존 멀티히트류의 220ms는 이런
      // "서사가 있는" 궁극기에는 너무 빨랐다).
      const rigs = [];
      if(battleFlags.rig && battleFlags.rig.turnsLeft>0) rigs.push('rig');
      if(battleFlags.rig2 && battleFlags.rig2.turnsLeft>0) rigs.push('rig2');
      // 강철 군단장은 오메가 전용 슬롯도 별도로 갖고 있으니, 집중 사격 명령이
      // 오메가까지 포함해 전 슬롯을 지휘하도록 한다.
      if(battleFlags.omegaRig && battleFlags.omegaRig.turnsLeft>0) rigs.push('omegaRig');
      let dmgBonusPct = 0, piercePct = 0, shieldTurns = 0, shieldMult = 1;
      const roleLabels = [];
      rigs.forEach(key=>{
        const r = battleFlags[key];
        if(r.kind==='firepower'){ dmgBonusPct += 0.5; roleLabels.push('화력'); }
        else if(r.kind==='recon'){ piercePct += 0.3; roleLabels.push('정찰'); }
        else if(r.kind==='shield'){ shieldTurns = Math.max(shieldTurns, 2); shieldMult = Math.min(shieldMult, 0.7); roleLabels.push('방벽'); }
        else { dmgBonusPct += 0.25; roleLabels.push(r.name); }
      });
      const edefFF = Math.round(getEffectiveEnemyDef(enemy.def)*(1-piercePct));
      const onHitMultFF = consumeOnHitBonuses();
      let totalDmg = Math.max(1, Math.round(effectiveMag()*(s.baseMult+dmgBonusPct)) - edefFF);
      totalDmg = applyOutgoingDamageMods(totalDmg, {type:'magicskill', mpCost, onHitMult:onHitMultFF});

      // 사격 주체 = 가동 중인 로봇들 + 플레이어 자신(항상 마지막 한 발을 더한다).
      const shooters = rigs.length + 1;
      const per = Math.max(1, Math.round(totalDmg/shooters));
      const parts = [];
      let acc = 0;
      for(let i=0;i<shooters;i++){
        const isLast = i===shooters-1;
        const p = isLast ? Math.max(1, totalDmg-acc) : per;
        acc += p; parts.push(p);
      }

      setCommandsEnabled(false);
      setBattleMsg(`${player.name}의 ${s.name}!`,
        rigs.length>0 ? '모든 로봇이 조준경을 겨눈다... 게이지가 차오른다!' : '홀로 조준을 마쳤다...');
      rigs.forEach(key=> flashRigSlot(key));

      let idx = 0;
      const fireNext = ()=>{
        if(battleOver) return;
        const p = parts[idx];
        enemy.hp = Math.max(0, enemy.hp-p);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+p, 'crit');
        Sound.magic();
        let who;
        if(idx < rigs.length){
          flashRigSlot(rigs[idx]);
          who = battleFlags[rigs[idx]].name;
        } else {
          who = player.name;
        }
        setBattleMsg(`${who}이(가) 발사!`, `${p}의 피해를 입혔다!`);
        idx++;
        if(idx<shooters){
          setTimeout(fireNext, 750);
        } else {
          setTimeout(()=>{
            if(battleOver) return;
            if(shieldTurns>0){
              player.buffDefTurns = shieldTurns;
              player.buffDefMult = shieldMult;
            }
            renderStatus();
            updateRigVisuals();
            const finalMsg = rigs.length>0
              ? `집중포화 완료! 총 ${totalDmg}의 피해를 입혔다(${roleLabels.join('+')} 로봇 활약). 로봇들은 이후에도 계속 가동된다.`
              : `가동 중인 로봇이 없어 위력이 크게 약했다. 총 ${totalDmg}의 피해.`;
            setBattleMsg(`${player.name}의 ${s.name}!`, finalMsg);
            if(checkBattleEnd()) return;
            enemyTurn();
          }, 800);
        }
      };
      setTimeout(fireNext, 800);
      return;
    }

    if(s.type==='legionmaintenance'){
      // 강철 군단장 레벨7 "전체 정비": 가동 중인 로봇 전원(rig/rig2/오메가 전용
      // 슬롯)의 지속시간을 s.extendTurns만큼 늘린다. 로봇이 하나도 없으면
      // 그냥 아무 효과 없이 넘어간다(사용자에게 안내만).
      // 총력 재정비 각인(me_totalrefit, 강철 군단장 방어구 각인 — 사용자
      // 요청): 로봇 지속시간 연장과 동시에 오메가 유닛(mechanicOverpressure)
      // 쿨다운도 1턴 줄여준다. 대신 연장 턴수 자체는 3턴→2턴으로 줄어든다.
      const aIdTR = player.equipment && player.equipment.armor;
      const hasTotalRefit = !!(aIdTR && typeof getEnhancementsFor==='function' && getEnhancementsFor(aIdTR).includes('me_totalrefit'));
      const extendTurnsUsed = hasTotalRefit ? 2 : s.extendTurns;
      const slots = ['rig','rig2','omegaRig'];
      let extendedNames = [];
      slots.forEach(slotKey=>{
        const r = battleFlags[slotKey];
        if(r && r.turnsLeft>0){
          r.turnsLeft += extendTurnsUsed;
          extendedNames.push(r.name);
        }
      });
      let refitMsg = '';
      if(hasTotalRefit && battleFlags.skillCooldowns && battleFlags.skillCooldowns.mechanicOverpressure>0){
        battleFlags.skillCooldowns.mechanicOverpressure = Math.max(0, battleFlags.skillCooldowns.mechanicOverpressure-1);
        refitMsg = ' 총력 재정비 각인이 오메가 유닛의 쿨다운도 1턴 앞당겼다!';
      }
      renderStatus();
      updateRigVisuals();
      const msgM = (extendedNames.length>0
        ? `${extendedNames.join(', ')}의 가동 시간을 ${extendTurnsUsed}턴 늘렸다.`
        : '가동 중인 로봇이 없어 정비할 대상이 없었다.') + refitMsg;
      setBattleMsg(`${player.name}의 ${s.name}!`, msgM);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='legioncommand'){
      // 강철 군단장 레벨15 궁극기 "총사령관의 명령": 즉발 피해 없이, 몇 턴간
      // 가동 중인 모든 로봇(rig/rig2/omegaRig)의 사격 위력을 강화하는 지속
      // 버프를 건다. 실제 위력 보정은 combat/enemy-turn.js의 tickActiveRig()
      // 데미지 계산에서 battleFlags.legionCommandTurns를 확인해 적용한다.
      // 불멸의 명령 각인(me_undyingcommand)을 꼈다면(자동 리스폰 기능),
      // 대신 버프 지속시간이 3턴→2턴으로 줄어든다.
      const cIdUC2 = player.equipment && player.equipment.accessory;
      const hasUndyingCommand = !!(cIdUC2 && typeof getEnhancementsFor==='function' && getEnhancementsFor(cIdUC2).includes('me_undyingcommand'));
      const buffTurnsUsed = hasUndyingCommand ? Math.max(1, s.buffTurns-1) : s.buffTurns;
      battleFlags.legionCommandTurns = buffTurnsUsed;
      battleFlags.legionCommandMult = s.buffMult;
      renderStatus();
      setBattleMsg(`${player.name}의 ${s.name}!`, `${buffTurnsUsed}턴간 모든 로봇의 사격 위력이 ${Math.round(s.buffMult*100)}% 늘어난다.${hasUndyingCommand ? ' (불멸의 명령 각인 — 로봇이 만료돼도 자동 재배치된다)' : ''}`);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='deployrig'){
      const edef = getEffectiveEnemyDef(enemy.def);
      const mechTier = epicSetTier('mechanic');
      let tickMult = s.rigMult;
      let turns = s.rigTurns;
      if(mechTier>=2) tickMult *= 1.2;
      if(mechTier>=3) turns += 1;
      // 축압 기술자(mastery_pressureseal) — 장치 지속시간 +2턴, 압력 축적 속도 +9/틱.
      const hasPressureSeal = !!(player.skills && player.skills.includes('mastery_pressureseal'));
      if(hasPressureSeal) turns += 2;
      const dmgPerTick = Math.max(1, Math.round(effectiveMag()*tickMult));
      const newRig = {
        kind: s.rigKind, name: s.rigName, turnsLeft: turns, dmgPerTick,
        shieldPct: s.shieldPct||0,
        // 메카닉 리뉴얼(사용자 요청) — 이 장치가 매 틱마다 만들어내는 보일러 압력.
        pressurePerTick: (s.rigPressurePerTick||0) + (hasPressureSeal ? 9 : 0),
        // 1차 스킬 버프(사용자 요청 — "영리한 버프") — 포탑 사격 위력이 현재
        // 쌓인 압력에 비례해서 커진다(pressureScaled/pressureScaleRate). 실제
        // 적용은 combat/enemy-turn.js의 rig 틱 데미지 계산에서 이뤄진다.
        pressureScaled: !!s.pressureScaled, pressureScaleRate: s.pressureScaleRate||0,
      };
      // 버그 수정: 예전엔 이 분기가 항상 battleFlags.rig 하나만 무조건 덮어써서,
      // 다중 전개(mastery_multideploy)로 2기까지 가능한 로봇군단장이 자동포탑을
      // 설치한 뒤 오메가 유닛을 배치하면 자동포탑이 조용히 사라지고 오메가만
      // 남았다(2기 동시 운용이 안 됐음). 이제 legiondeploy와 동일한 슬롯 배분
      // 로직을 쓴다 — 단, 다중 전개 마스터리가 없으면 기존처럼 슬롯 1개만
      // 쓴다(로봇군단장이 아닌 일반 메카닉의 기존 동작은 그대로 유지).
      const canDual = !!(player.skills && player.skills.includes('mastery_multideploy'));
      let slotMsgDeploy = '';
      if(canDual){
        if(!battleFlags.rig || battleFlags.rig.turnsLeft<=0){
          battleFlags.rig = newRig;
        } else if(!battleFlags.rig2 || battleFlags.rig2.turnsLeft<=0){
          battleFlags.rig2 = newRig;
          slotMsgDeploy = ' 두 번째 슬롯에 배치되어, 기존 로봇과 함께 가동된다.';
        } else {
          battleFlags.rig = newRig;
          slotMsgDeploy = ' 이미 2기가 있어 가장 먼저 배치된 로봇을 대신했다.';
        }
      } else {
        battleFlags.rig = newRig;
      }
      // 연쇄 기폭(mastery_chaindetonate): 장치를 설치(전개)할 때마다 기폭 스택이
      // 자동으로 오른다(최대 5). 데토네이터가 아닌 캐릭터는 이 마스터리가 없으므로
      // 아무 영향이 없다.
      if(player.skills && player.skills.includes('mastery_chaindetonate')){
        battleFlags.detonatorStacks = Math.min(5, (battleFlags.detonatorStacks||0)+1);
      }
      if(s.exposeTurns){
        enemy.exposedTurns = s.exposeTurns;
        enemy.exposePierce = s.exposePierce||0;
      }
      if(s.selfAtkBuffTurns){
        player.buffAtkTurns = s.selfAtkBuffTurns;
        player.buffAtkMult = s.selfAtkBuffMult||1.15;
      }
      // 메카닉 리뉴얼(사용자 요청) — 배치 즉시 압력을 소폭 채워준다(보일러 점화 전용).
      if(s.pressureOnDeploy){
        battleFlags.pressure = Math.min(getPressureCap(), (battleFlags.pressure||0) + s.pressureOnDeploy);
        applyOverheatOverflowDamage(battleFlags.pressure);
        if(typeof updatePressureGauge==='function') updatePressureGauge();
      }
      let dmg = Math.max(1, Math.round(effectiveMag()*s.mult) - Math.round(edef*0.5));
      dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost});
      enemy.hp = Math.max(0, enemy.hp-dmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, s.rigKind==='omega'?'crit':undefined);
      if(s.rigKind==='omega') Sound.bomb(); else Sound.magic();
      // 1차 스킬 버프(사용자 요청 — "영리한 버프" B안) — 배치 즉시 포탑이
      // 첫 사격도 같이 나간다(기존엔 배치 턴은 세팅만 하고 사격은 다음 턴부터
      // 시작해서 "이번 턴은 손해"라는 체감이 컸다). 총 사격 횟수는 그대로
      // 유지하기 위해 turnsLeft를 1 줄인다(즉시 1회 + 이후 turnsLeft-1회 자동
      // 사격 = 원래 turns회와 동일).
      let instantTickDmg = 0;
      if(s.instantFirstTick && newRig.turnsLeft>0){
        const targetRig = (battleFlags.rig===newRig) ? battleFlags.rig : (battleFlags.rig2===newRig ? battleFlags.rig2 : null);
        if(targetRig){
          const pressureBonus = targetRig.pressureScaled ? Math.round(effectiveMag()*(battleFlags.pressure||0)*targetRig.pressureScaleRate) : 0;
          // 자동틱(enemy-turn.js의 tickActiveRig)이 방어력을 아예 무시하는
          // 것과 동일하게, 즉시 첫틱도 방어 감산을 빼서 일관되게 맞췄다
          // (사용자 요청 — 틱딜 위주 버프, "포탑은 방어 무시"라는 특성을
          // 오히려 순수 이득으로 활용).
          instantTickDmg = Math.max(1, targetRig.dmgPerTick + pressureBonus);
          enemy.hp = Math.max(0, enemy.hp-instantTickDmg);
          updateEnemyHpBar(); shakeEnemy(); popDamage('-'+instantTickDmg);
          targetRig.turnsLeft -= 1;
        }
      }
      let healed = 0;
      if(s.lifesteal){
        healed = Math.min(player.maxhp-player.hp, Math.round(dmg*s.lifesteal));
        player.hp = Math.min(player.maxhp, player.hp+healed);
      }
      renderStatus();
      updateRigVisuals();
      let msg2 = `${s.rigName}을(를) 전개했다! 첫 사격으로 ${dmg}의 피해를 입혔다.`;
      if(instantTickDmg>0) msg2 += ` 곧바로 이어진 포격으로 ${instantTickDmg}의 추가 피해!`;
      msg2 += ` 이후 ${turns - (instantTickDmg>0?1:0)}턴간 자동으로 사격한다.${slotMsgDeploy}`;
      const dotLabelsDeploy = applySkillDots(s);
      if(dotLabelsDeploy) msg2 += ` ${dotLabelsDeploy} 효과 부여!`;
      if(s.exposeTurns) msg2 += ' 적의 급소가 드러나 받는 피해가 늘어난다.';
      if(s.shieldPct) msg2 += ` 가동 중엔 받는 피해의 ${Math.round(s.shieldPct*100)}%를 대신 막아준다.`;
      if(s.selfAtkBuffTurns) msg2 += ` ${s.selfAtkBuffTurns}턴간 공격력도 함께 오른다.`;
      if(s.rigPressurePerTick||s.pressureOnDeploy){ msg2 += ` 압력이 ${battleFlags.pressure||0}까지 쌓였다.`; }
      if(healed>0) msg2 += ` HP ${healed} 흡수.`;
      setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    // 메카닉 리뉴얼(사용자 요청) — 압력 방출(공격/방어 두 모드 공유). 표적
    // 마킹이 걸려 있으면 위력이 늘어난다.
    if(s.type==='pressurevent'){
      const pressure = (battleFlags.pressure||0);
      if(pressure < (s.minPressure||1)){
        setCommandsEnabled(true);
        setBattleMsg('압력이 부족하다…', `최소 ${s.minPressure} 이상 쌓여야 방출할 수 있다. (현재 압력 ${pressure})`);
        return;
      }
      const markBonus = (enemy.markedTurns>0) ? (enemy.markBonus||0.25) : 0;
      if(s.ventMode==='attack'){
        const edefV = getEffectiveEnemyDef(enemy.def);
        let dmg = Math.max(1, Math.round(effectiveMag()*pressure*s.dmgPerPressure*(1+markBonus)) - Math.round(edefV*0.5));
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, pressureConsumed: pressure});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
        Sound.magic();
        renderStatus();
        battleFlags.pressure = 0;
        if(typeof updatePressureGauge==='function') updatePressureGauge();
        let msg2 = `압력 ${pressure}을(를) 전부 방출해 ${dmg}의 피해를 입혔다!`;
        if(markBonus>0) msg2 += ' 표식 덕분에 위력이 더 늘어났다.';
        setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      } else {
        const reduce = Math.min(s.defReduceCap||0.6, pressure*s.defReducePerPressure);
        player.buffDefTurns = 1;
        player.buffDefMult = Math.max(0.05, 1-reduce*(1+markBonus));
        renderStatus();
        battleFlags.pressure = 0;
        if(typeof updatePressureGauge==='function') updatePressureGauge();
        playCastBurst('def');
        Sound.buff();
        setBattleMsg(`${player.name}의 ${s.name}!`, `압력 ${pressure}을(를) 방출해, 다음 피격 시 받는 피해를 크게 줄인다.`);
      }
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    // 메카닉 리뉴얼(사용자 요청) — 표적 마킹(다음 압력 방출 스킬 위력 증가).
    if(s.type==='mechmark'){
      enemy.markedTurns = s.markTurns;
      enemy.markBonus = s.markBonus;
      updateStatusBadges();
      playCastBurst();
      Sound.magic();
      setBattleMsg(`${player.name}의 ${s.name}!`, `${s.markTurns}턴간 표식을 남겼다. 압력 방출 스킬의 위력이 늘어난다.`);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    // 메카닉 리뉴얼(사용자 요청) — 과압 각성(1차 10레벨 궁극기). 오메가 유닛
    // 투입 + 압력 강제 최대치 + 그 자리에서 안전하게(반동 없이) 전량 방출을
    // 한 번에 처리한다.
    if(s.type==='overpressureult'){
      const edefU = getEffectiveEnemyDef(enemy.def);
      const isLegion = player.specialization==='mechanic_accumulator';
      // 강철 군단장 전용 배율(legionBurstMult/legionRigMult)이 있으면 그걸
      // 쓰고, 없으면(폭주 화부 등 다른 특성) 기존 공용 mult/rigMult 그대로.
      const rigMultUsed = isLegion ? (s.legionRigMult||s.rigMult) : s.rigMult;
      const dmgPerTick = Math.max(1, Math.round(effectiveMag()*rigMultUsed));
      // 강철 군단장(mechanic_accumulator 리뉴얼)은 압력 게이지가 아예 없다.
      // 같은 스킬(mechanicOverpressure)을 재사용하되, 이 특성이면 오메가를
      // battleFlags.omegaRig 전용 고정 슬롯에 배치하고 압력 관련 처리를
      // 전부 건너뛴다. 다른 특성(폭주 화부 등)은 기존 동작 그대로 유지된다.
      const newOmegaRig = {kind:s.rigKind, name:s.rigName, turnsLeft:s.rigTurns, dmgPerTick, shieldPct:s.shieldPct||0, pressurePerTick: isLegion?0:(s.rigPressurePerTick||0)};
      if(isLegion){ battleFlags.omegaRig = newOmegaRig; } else { battleFlags.rig = newOmegaRig; }
      updateRigVisuals();
      const markBonus = (enemy.markedTurns>0) ? (enemy.markBonus||0.25) : 0;
      let dmg;
      if(isLegion){
        const burstMultUsed = s.legionBurstMult||s.mult;
        dmg = Math.max(1, Math.round(effectiveMag()*burstMultUsed*(1+markBonus)) - Math.round(edefU*0.5));
      } else {
        battleFlags.pressure = 100;
        dmg = Math.max(1, Math.round(effectiveMag()*(s.mult + 100*s.dmgPerPressure)*(1+markBonus)) - Math.round(edefU*0.5));
      }
      dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, pressureConsumed: isLegion?0:100});
      enemy.hp = Math.max(0, enemy.hp-dmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg,'crit');
      Sound.bomb();
      if(!isLegion){
        battleFlags.pressure = 0;
        if(typeof updatePressureGauge==='function') updatePressureGauge();
      }
      renderStatus();
      const msgU = isLegion
        ? `오메가 유닛을 전용 슬롯에 투입하며 ${dmg}의 대폭발을 일으켰다! 이후 오메가 유닛이 매 턴 강력하게 자동 사격한다.`
        : `오메가 유닛을 투입하며 압력을 강제로 끌어올려 ${dmg}의 대폭발을 일으켰다! 이후 오메가 유닛이 훨씬 빠르게 압력을 쌓는다.`;
      setBattleMsg(`${player.name}의 ${s.name}!`, msgU);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='rigsupport'){
      let burstDmg = 0;
      if(s.burstMult){
        const edefB = getEffectiveEnemyDef(enemy.def);
        burstDmg = Math.max(1, Math.round(effectiveMag()*s.burstMult) - Math.round(edefB*0.5));
        burstDmg = applyOutgoingDamageMods(burstDmg, {type:'magicskill', mpCost});
        enemy.hp = Math.max(0, enemy.hp-burstDmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+burstDmg);
        Sound.magic();
      }
      let healed = 0;
      if(s.healSelfRatio){
        healed = Math.min(player.maxhp-player.hp, Math.round(player.maxhp*s.healSelfRatio));
        player.hp = Math.min(player.maxhp, player.hp+healed);
      }
      if(battleFlags.rig && battleFlags.rig.turnsLeft>0){
        battleFlags.rig.turnsLeft += s.extendTurns;
        battleFlags.rig.dmgPerTick = Math.max(1, Math.round(battleFlags.rig.dmgPerTick * s.boostMult));
        renderStatus();
        updateRigVisuals();
        playCastBurst('def');
        Sound.buff();
        let msg2 = `${battleFlags.rig.name}을(를) 정비했다. 지속시간 +${s.extendTurns}턴, 사격 위력이 강화되었다!`;
        if(burstDmg>0) msg2 = `${enemy.name}에게 ${burstDmg}의 피해를 입혔다. `+msg2;
        if(healed>0) msg2 += ` HP ${healed} 회복.`;
        setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      } else if(battleFlags.rig2 && battleFlags.rig2.turnsLeft>0){
        // 다중 전개로 두 번째 슬롯에만 로봇이 있는 경우(첫 슬롯은 비었거나 만료됨)에도
        // 정비 대상으로 삼는다.
        battleFlags.rig2.turnsLeft += s.extendTurns;
        battleFlags.rig2.dmgPerTick = Math.max(1, Math.round(battleFlags.rig2.dmgPerTick * s.boostMult));
        renderStatus();
        updateRigVisuals();
        playCastBurst('def');
        Sound.buff();
        let msg2 = `${battleFlags.rig2.name}을(를) 정비했다. 지속시간 +${s.extendTurns}턴, 사격 위력이 강화되었다!`;
        if(burstDmg>0) msg2 = `${enemy.name}에게 ${burstDmg}의 피해를 입혔다. `+msg2;
        if(healed>0) msg2 += ` HP ${healed} 회복.`;
        setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      } else {
        player.buffAtkTurns = s.fallbackTurns;
        player.buffAtkMult = s.fallbackAtkMult;
        renderStatus();
        playCastBurst();
        Sound.buff();
        let msg2 = `가동 중인 장치가 없어, 대신 ${s.fallbackTurns}턴간 공격력이 오른다.`;
        if(burstDmg>0) msg2 = `${enemy.name}에게 ${burstDmg}의 피해를 입혔다. `+msg2;
        if(healed>0) msg2 += ` HP ${healed} 회복.`;
        setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      }
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    // 폭주 화부 - 레벨10 액티브 "폭주 사출": 압력을 소모하지 않고 즉시 압력비례
    // 피해를 준 뒤, 오히려 압력을 pressureGainOnUse만큼 더 쌓는다(스노우볼).
    // 초과분(100 초과) 자해/회피스택은 applyOverheatOverflowDamage()가 처리.
    if(s.type==='pressuresurge'){
      const edefS = getEffectiveEnemyDef(enemy.def);
      const pressure = battleFlags.pressure||0;
      const overflow = Math.max(0, pressure-100);
      const effRate = s.dmgPerPressure + overflow*0.0006; // mastery_overheat의 초과분 보너스
      let dmg = Math.max(1, Math.round(effectiveMag()*pressure*effRate) - Math.round(edefS*0.5));
      dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost});
      enemy.hp = Math.max(0, enemy.hp-dmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
      Sound.magic();
      battleFlags.pressure = Math.min(getPressureCap(), pressure + (typeof getPressureGainUsed==='function' ? getPressureGainUsed(s) : s.pressureGainOnUse));
      applyOverheatOverflowDamage(battleFlags.pressure);
      if(typeof updatePressureGauge==='function') updatePressureGauge();
      renderStatus();
      setBattleMsg(`${player.name}의 ${s.name}!`, `압력 ${pressure}을(를) 그대로 유지한 채 ${dmg}의 피해를 입혔다! 오히려 압력이 ${battleFlags.pressure}까지 더 쌓였다.`);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    // 폭주 화부 - 레벨15 궁극기 "임계 폭주": 압력 100 이상 필요. 현재 압력
    // 전체를 압도적 피해로 전환하고 최대HP 25% 반동 피해(HP 1 클램프)를 입는다.
    if(s.type==='criticaloverload'){
      const pressureCO = battleFlags.pressure||0;
      if(pressureCO < (s.minPressure||100)){
        setCommandsEnabled(true);
        player.mp += mpCost;
        setBattleMsg('압력이 부족하다…', `최소 ${s.minPressure} 이상 쌓여야 발동할 수 있다. (현재 압력 ${pressureCO})`);
        return;
      }
      const edefCO = getEffectiveEnemyDef(enemy.def);
      let dmg = Math.max(1, Math.round(effectiveMag()*pressureCO*s.dmgPerPressure) - Math.round(edefCO*0.5));
      dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, pressureConsumed: pressureCO});
      enemy.hp = Math.max(0, enemy.hp-dmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg,'crit');
      Sound.bomb();
      // 돌이킬 수 없는 각인(me_permanentcost, 폭주 화부 장신구 각인 —
      // 사용자 요청): 일시적 반동(HP)이 사라지는 대신, 최대HP가 영구히
      // 줄어든다(반동의 30% 만큼). "쓸수록 몸이 작아지지만 전투 중엔
      // 훨씬 안정적"이라는 컨셉.
      const cIdPC = player.equipment && player.equipment.accessory;
      const hasPermanentCost = !!(cIdPC && typeof getEnhancementsFor==='function' && getEnhancementsFor(cIdPC).includes('me_permanentcost'));
      const recoil = Math.round(player.maxhp*s.recoilHpCostPct);
      let permanentCostMsg = '';
      if(hasPermanentCost){
        const permLoss = Math.max(1, Math.round(recoil*0.3));
        if(player.maxhp > permLoss + 10){
          player.maxhp -= permLoss;
          player.hp = Math.min(player.hp, player.maxhp);
          permanentCostMsg = ` 돌이킬 수 없는 각인이 반동 대신 최대HP ${permLoss}을(를) 영구히 앗아갔다.`;
        }
      } else {
        player.hp = Math.max(1, player.hp-recoil);
      }
      battleFlags.pressure = 0;
      if(typeof updatePressureGauge==='function') updatePressureGauge();
      renderStatus();
      setBattleMsg(`${player.name}의 ${s.name}!`, `압력 ${pressureCO} 전체를 쏟아부어 ${dmg}의 대폭발을 일으켰다!${hasPermanentCost ? permanentCostMsg : ` 반동으로 HP ${recoil}을(를) 잃었다.`}`);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    // 축압 기술자 - 레벨10 액티브 "정밀 배분"(mode:firepower/shield) 및
    // 레벨15 궁극기 "범람"(mode:both). 압력을 전량 소모(minPressure 이상 필요)한
    // 뒤, refundAmount만큼(효율 개선 보유 시 +10) 즉시 돌려받는다.
    if(s.type==='pressureallocate'){
      const pressurePA = battleFlags.pressure||0;
      if(pressurePA < (s.minPressure||1)){
        setCommandsEnabled(true);
        player.mp += mpCost;
        setBattleMsg('압력이 부족하다…', `최소 ${s.minPressure} 이상 쌓여야 배분할 수 있다. (현재 압력 ${pressurePA})`);
        return;
      }
      const consumed = pressurePA;
      let msg2 = '';
      if(s.mode==='firepower' || s.mode==='both'){
        const buffMult = 1 + consumed*s.dmgBuffPerPressure;
        if(battleFlags.rig && battleFlags.rig.turnsLeft>0){
          battleFlags.rig.dmgPerTick = Math.max(1, Math.round(battleFlags.rig.dmgPerTick*buffMult));
          updateRigVisuals();
          msg2 += `${battleFlags.rig.name}의 화력이 강화되었다(+${Math.round((buffMult-1)*100)}%).`;
        } else if(battleFlags.rig2 && battleFlags.rig2.turnsLeft>0){
          battleFlags.rig2.dmgPerTick = Math.max(1, Math.round(battleFlags.rig2.dmgPerTick*buffMult));
          updateRigVisuals();
          msg2 += `${battleFlags.rig2.name}의 화력이 강화되었다(+${Math.round((buffMult-1)*100)}%).`;
        } else {
          player.buffAtkTurns = 3;
          player.buffAtkMult = buffMult;
          msg2 += `가동 중인 장치가 없어, 대신 3턴간 공격력이 오른다(+${Math.round((buffMult-1)*100)}%).`;
        }
      }
      if(s.mode==='shield' || s.mode==='both'){
        const reduce = Math.min(s.defReduceCap||0.6, consumed*s.defReducePerPressure);
        player.buffDefTurns = 1;
        player.buffDefMult = Math.max(0.05, 1-reduce);
        msg2 += ` 다음 피격 피해가 크게 줄어든다.`;
      }
      const refund = (s.refundAmount||0) + ((player.skills && player.skills.includes('mechanicAccumEfficiency')) ? 10 : 0);
      battleFlags.pressure = Math.min(getPressureCap(), refund);
      if(typeof updatePressureGauge==='function') updatePressureGauge();
      renderStatus();
      playCastBurst('def');
      Sound.buff();
      msg2 += ` (압력 ${consumed} 소모, ${battleFlags.pressure} 환급)`;
      setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='detonaterig'){
      // 연쇄 기폭(mastery_chaindetonate): 쌓아둔 기폭 스택 수만큼 배율이 곱해진다
      // (스택당 +15%). 마스터리가 없는 캐릭터는 chainStacks가 항상 0이라 영향이 없다.
      const chainStacks = (player.skills && player.skills.includes('mastery_chaindetonate'))
        ? Math.min(5, battleFlags.detonatorStacks||0) : 0;
      const chainMult = 1 + chainStacks*0.15;
      const edef = Math.max(0, Math.round(getEffectiveEnemyDef(enemy.def)*(1-(s.defPierceBonus||0))));
      let dmg, msg2;
      if(battleFlags.rig && battleFlags.rig.turnsLeft>0){
        const rig = battleFlags.rig;
        let burst = Math.round(rig.dmgPerTick * rig.turnsLeft * s.burstMult);
        if(epicSetTier('mechanic')>=3) burst = Math.round(burst*1.4);
        if(s.executeThreshold && enemy.maxhp>0 && (enemy.hp/enemy.maxhp)<=s.executeThreshold){
          burst = Math.round(burst*(s.executeMult||1.5));
        }
        dmg = Math.max(1, burst - edef);
        dmg = Math.round(dmg*chainMult);
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost});
        msg2 = `${rig.name}을(를) 자폭시켰다! 남은 가동력이 한꺼번에 터지며 ${dmg}의 피해를 입혔다!`;
        battleFlags.rig = null;
        if(s.guaranteedRedeploy){
          battleFlags.rig = {kind:'turret', name: s.redeployRigName||'자동 포탑', turnsLeft: s.redeployRigTurns||3, dmgPerTick: Math.max(1, Math.round(effectiveMag()*(s.redeployRigMult||0.85)))};
          msg2 += ` ${battleFlags.rig.name}이(가) 즉시 재전개된다!`;
        } else if(epicSetTier('mechanic')>=3){
          // 종말기계 Mk.Ω(에픽 3세트) 재전개는 이제 평범한 '자동 포탑'이 아니라
          // 세트 이름 그대로 '오메가 유닛'(kind:'omega')으로 나온다 — 좌우로
          // 긴 이중 포신 비주얼이 전용으로 뜬다(combat/battle-fx.js의
          // updateRigVisuals(), data/monster-visuals.js의 svgRig('omega') 참고).
          battleFlags.rig = {kind:'omega', name:'오메가 유닛', turnsLeft:3, dmgPerTick: Math.max(1, Math.round(effectiveMag()*0.85*1.2))};
          msg2 += ' 종말기계의 힘으로 오메가 유닛이 즉시 재전개된다!';
        }
      } else {
        dmg = Math.max(1, Math.round(effectiveMag()*s.noRigMult) - Math.round(edef*0.5));
        dmg = Math.round(dmg*chainMult);
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost});
        msg2 = `가동 중인 장치가 없어 예비 폭발물을 투척했다. ${dmg}의 피해!`;
      }
      if(chainStacks>0){
        msg2 += ` 연쇄 기폭 스택(${chainStacks})까지 더해져 위력이 크게 증폭됐다!`;
        battleFlags.detonatorStacks = 0;
      }
      enemy.hp = Math.max(0, enemy.hp-dmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, 'crit');
      Sound.bomb();
      let healed2 = 0;
      if(s.lifesteal){
        healed2 = Math.min(player.maxhp-player.hp, Math.round(dmg*s.lifesteal));
        player.hp = Math.min(player.maxhp, player.hp+healed2);
      }
      renderStatus();
      updateRigVisuals();
      const dotLabelsDet = applySkillDots(s);
      if(dotLabelsDet) msg2 += ` ${dotLabelsDet} 효과 부여!`;
      if(healed2>0) msg2 += ` HP ${healed2} 흡수.`;
      setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='buff'){
      player.buffAtkTurns = 3;
      player.buffAtkMult = 1.45;
      renderStatus();
      playCastBurst();
      Sound.buff();
      setBattleMsg(`${player.name}은(는) ${s.name}을(를) 외쳤다!`, '3회의 공격 동안 공격력이 크게 오른다.');
      enemyTurn();
      return;
    }

    if(s.type==='darkprayer'){
      // 검은 기도(paladinDarkPrayer, 레벨12, 회랑의 기사): HP를 대가로 검의 힘을
      // 빌려 2턴간 공격력이 오르지만 방어력도 함께 떨어진다. 부여한 정확한 수치를
      // player.knightVulnAtkBonus/DefPenalty에 저장해두고, combat/enemy-turn.js의
      // 매 라운드 카운트다운에서 정확히 그 값만큼만 되돌린다(다른 원인으로 공/방이
      // 바뀌어도 서로 간섭하지 않도록 델타를 직접 추적 — 불확실성의 주사위
      // revertDiceDelta()와 동일한 설계 원칙).
      // 순교자의 서약(pa_knight_a, 회랑의 기사 방어구 각인 — 택1 A안): 공격력
      // 보너스/지속시간을 더 극단적으로 올리는 대신 방어 감소 페널티도 커진다.
      const aIdKA = player.equipment && player.equipment.armor;
      const hasKnightA = !!(aIdKA && typeof getEnhancementsFor==='function' && getEnhancementsFor(aIdKA).includes('pa_knight_a'));
      const atkBonusUsed = hasKnightA ? 0.8 : s.atkBonus;
      const defPenaltyUsed = hasKnightA ? 0.55 : s.defPenaltyPct;
      const turnsUsed = hasKnightA ? 3 : s.turns;
      const hpCost = Math.max(1, Math.round(player.maxhp*s.hpCostPct));
      let costMsg = '';
      if(player.hp > hpCost){
        player.hp -= hpCost;
        costMsg = ` 생명력 ${hpCost}을(를) 바쳤다.`;
      }
      const atkAdd = Math.max(1, Math.round(player.atk*atkBonusUsed));
      const defSub = Math.max(0, Math.round(player.def*defPenaltyUsed));
      player.atk += atkAdd;
      player.def -= defSub;
      player.knightVulnTurns = turnsUsed;
      player.knightVulnAtkBonus = atkAdd;
      player.knightVulnDefPenalty = defSub;
      renderStatus();
      playCastBurst();
      Sound.buff();
      setBattleMsg('"...기도를 올렸다."', `"...무언가가 응답했다."${costMsg} ${turnsUsed}턴간 공격력이 크게 오르지만, 방어가 허술해진다.`);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='defbuff'){
      player.buffDefTurns = s.turns || 3;
      player.buffDefMult = s.mult || 0.6;
      renderStatus();
      playCastBurst('def');
      Sound.guard();
      setBattleMsg(`${player.name}은(는) ${s.name}을(를) 시전했다!`, `${player.buffDefTurns}턴 동안 받는 피해가 크게 줄어든다.`);
      enemyTurn();
      return;
    }

    if(s.type==='dualbuff'){
      player.buffAtkTurns = s.turns || 3;
      player.buffAtkMult = s.atkMult || 1.25;
      player.buffDefTurns = s.turns || 3;
      player.buffDefMult = s.defMult || 0.8;
      renderStatus();
      playCastBurst('def');
      Sound.buff();
      setBattleMsg(`${player.name}은(는) ${s.name}을(를) 시전했다!`, `${s.turns||3}턴간 공격력이 오르고 받는 피해가 줄어든다.`);
      enemyTurn();
      return;
    }

    if(s.type==='counterbuff'){
      player.buffCounterTurns = s.turns || 3;
      player.buffCounterChance = s.chance || 0.4;
      renderStatus();
      playCastBurst('def');
      Sound.guard();
      setBattleMsg(`${player.name}은(는) ${s.name}을(를) 맹세했다!`, `${s.turns||3}턴간 적의 공격에 ${Math.round((s.chance||0.4)*100)}% 확률로 즉시 반격한다.`);
      enemyTurn();
      return;
    }

    if(s.type==='heal'){
      const heal = Math.round(player.maxhp*s.mult*0.6 + effectiveMag()*0.5);
      player.hp = Math.min(player.maxhp, player.hp+heal);
      renderStatus();
      popDamageOnPlayerArea();
      Sound.heal();
      setBattleMsg(`${player.name}은(는) ${s.name}을(를) 시전했다.`, `HP ${heal} 회복.`);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='multihit'){
      // 이중 쇄도 각인(re_doublestrike, 환영검사 무기 각인 — 사용자 요청):
      // 그림자 쇄도를 쓰면 분신 배가가 자동으로 걸린 것처럼 처리되어, 아래
      // 잔영 예약이 곧바로 배가 상태로 나간다. 대신 이 스킬 자체의 즉발
      // 피해가 15% 줄어든다.
      const wIdDS = player.equipment && player.equipment.weapon;
      const hasDoubleStrike = !!(key==='rogueShadowStrike' && wIdDS && typeof getEnhancementsFor==='function' && getEnhancementsFor(wIdDS).includes('re_doublestrike'));
      if(hasDoubleStrike) player.doubleImageArmed = true;
      const magicBased = !!s.magic;
      const atkBase = magicBased ? effectiveMag() : effectiveAtk();
      const edef = getEffectiveEnemyDef(enemy.def);
      const defFactor = magicBased ? Math.round(edef*0.5) : edef;
      const rawParts = [];
      for(let i=0;i<s.hits;i++){
        rawParts.push(Math.max(1, Math.round(atkBase*s.mult) - defFactor + Math.floor(Math.random()*3)-1));
      }
      const baseRawTotal = rawParts.reduce((a,b)=>a+b,0);
      const onHitMult = consumeOnHitBonuses();
      let boostedTotal = applyOutgoingDamageMods(baseRawTotal, {type: magicBased?'magicskill':'physkill', mpCost, onHitMult});
      if(hasDoubleStrike) boostedTotal = Math.round(boostedTotal*0.85);
      // 은신(stealth)이 걸어둔 "다음 공격 피해 +30%" 소모(연속 공격형 스킬에도 적용).
      let stealthDmgMsgMulti = '';
      if(player.stealthDmgBonusArmed){
        boostedTotal = Math.round(boostedTotal*1.3);
        stealthDmgMsgMulti = ' 은신에서 벗어나며 가한 연격의 위력이 크게 올랐다!';
        player.stealthDmgBonusArmed = false;
      }
      const mod = applySkillModifiers(boostedTotal, s);
      const scale = mod.value / baseRawTotal;
      const parts = rawParts.map(d=>Math.max(1, Math.round(d*scale)));
      const total = parts.reduce((a,b)=>a+b,0);
      if(!magicBased) consumeAtkBuff();
      rogueRegisterHit(!magicBased);
      // 역병 잠식(mastery_venomstacks, 역병숙주): 연속 공격형 스킬(두번베기/그림자
      // 쇄도 등)도 독을 남긴다. 여러 타를 때려도 이 스킬 사용 1회당 +1만
      // 준다(개별 타격마다 주면 스택이 지나치게 빨리 차오르기 때문).
      if(player.skills && player.skills.includes('mastery_venomstacks')){
        enemy.venomStacks = Math.min(getVenomStackCap(), (enemy.venomStacks||0)+1);
      }
      // 잔영(mastery_afterimage): 연속 공격형 스킬도 확정 발동 대상이다(범용
      // phys/magic 분기와 동일한 조건). 몇 타짜리 스킬이었는지·최종 합산 피해가
      // 얼마였는지를 기록해둬, 적 턴 직전 재현 시 같은 타수·같은 연출로
      // 다시 나타나게 한다(combat/enemy-turn.js의 triggerAfterimageStrike()).
      let afterimageMsgMulti = '';
      if(player.skills && player.skills.includes('mastery_afterimage') && battleFlags && !battleFlags.afterimagePending){
        battleFlags.afterimagePending = true;
        const doubledMulti = !!player.doubleImageArmed;
        battleFlags.afterimageQueue = {
          name: s.name, magic: magicBased, multihit: true, hits: parts.length, totalDamage: total,
          ratio: doubledMulti ? (player.doubleImageBoostRatio||0.65) : 0.5,
          repeats: doubledMulti ? 2 : 1,
        };
        afterimageMsgMulti = doubledMulti
          ? ' 그림자 속에서 두 겹의 잔영이 어른거린다…'
          : ` 그림자 속에서 '${s.name}'의 잔영이 어른거린다…`;
        battleFlags.afterimageTriggerCount = Math.min(8, (battleFlags.afterimageTriggerCount||0) + (doubledMulti?2:1));
        if(doubledMulti){
          consumeDoubleImageArmed();
        }
      }
      // 한 타씩 순차적으로 베어내는 연출
      setBattleMsg(`${player.name}은(는) ${s.name}을(를) 시전했다!`, '연속 공격 중...');
      parts.forEach((hitDmg, i)=>{
        setTimeout(()=>{
          enemy.hp = Math.max(0, enemy.hp-hitDmg);
          updateEnemyHpBar(); shakeEnemy(); spawnSlashMark(i);
          if(magicBased) Sound.magic(); else Sound.slash();
          popDamage('-'+hitDmg, (mod.triggered && i===parts.length-1) ? 'crit' : undefined);
        }, i*220);
      });
      setTimeout(()=>{
        renderStatus();
        updatePlayerStatusBadges();
        playComboFinish(parts.length);
        let msg2 = `${parts.join(' + ')} = 총 ${total}의 피해!`;
        if(mod.triggered) msg2 = '급소를 꿰뚫었다! '+msg2;
        const dotLabels1 = applySkillDots(s);
        if(dotLabels1) msg2 += ` ${dotLabels1} 효과 부여!`;
        if(stealthDmgMsgMulti) msg2 += stealthDmgMsgMulti;
        if(afterimageMsgMulti) msg2 += afterimageMsgMulti;
        setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
        if(checkBattleEnd()) return;
        enemyTurn();
      }, parts.length*220 + 250);
      return;
    }

    if(s.type==='dotdetonate'){
      // 원소 붕괴(mageElementalCollapse, 레벨15): 적에게 걸린 모든 상태이상(출처
      // 무관 — 원소 계약의 화상, 삼원소 연격의 화상, 다른 분기의 독/출혈 등 전부
      // 포함)을 한꺼번에 붕괴시킨다. 각 상태이상의 "남은 잠재 피해량"(턴당
      // 피해 × 남은 턴 수)의 합계에 비례해 폭딜이 나오고, 터뜨린 상태이상은
      // 전부 사라진다(연쇄폭발의 statusSynergyBonus처럼 단순히 "종류 수"만
      // 세는 게 아니라, 실제로 상태이상을 소모하는 방식이라 텍스처가 다르다).
      const activeDots = (enemy.dots||[]).filter(d=>d.turns>0);
      let dotPotential = 0;
      activeDots.forEach(d=>{ dotPotential += d.dmgPerTurn * d.turns; });
      const edefCollapse = Math.round(getEffectiveEnemyDef(enemy.def)*0.5);
      const onHitMultCollapse = consumeOnHitBonuses();
      let collapseDmg = Math.max(1, Math.round(effectiveMag()*s.baseMult) + Math.round(dotPotential*s.dotMult) - edefCollapse);
      collapseDmg = applyOutgoingDamageMods(collapseDmg, {type:'magicskill', mpCost, onHitMult:onHitMultCollapse});
      enemy.hp = Math.max(0, enemy.hp-collapseDmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+collapseDmg, activeDots.length>0?'crit':undefined);
      Sound.magic();
      const clearedLabels = [...new Set(activeDots.map(d=>d.label))].join(', ');
      enemy.dots = (enemy.dots||[]).filter(d=>d.turns<=0);
      updateStatusBadges();
      renderStatus();
      const msg2 = activeDots.length>0
        ? `걸려있던 상태이상(${clearedLabels})을 한꺼번에 붕괴시켜 ${enemy.name}에게 ${collapseDmg}의 압도적인 피해를 입혔다!`
        : `붕괴시킬 상태이상이 없어 기본 위력으로 ${enemy.name}에게 ${collapseDmg}의 피해를 입혔다.`;
      setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='elementstrike'){
      // 이중 계약 각인(me_dualpact, 계약술사 무기 각인 — 사용자 요청): 계약한
      // 원소 + 무작위로 고른 다른 원소 하나의 피해를 동시에 터뜨린다. 대신
      // 두 효과 모두 위력이 70%로 줄어든다. 기존 4분기(화염/빙결/번개/미계약)
      // 코드는 건드리지 않고, 이 각인이 있을 때만 완전히 별도 경로로 처리한다.
      const wIdDP = player.equipment && player.equipment.weapon;
      const hasDualPact = !!(wIdDP && typeof getEnhancementsFor==='function' && getEnhancementsFor(wIdDP).includes('me_dualpact'));
      if(hasDualPact && battleFlags.elementPact){
        const edefDP = getEffectiveEnemyDef(enemy.def);
        const onHitMultDP = consumeOnHitBonuses();
        const primaryPact = battleFlags.elementPact;
        const othersDP = ['fire','ice','lightning'].filter(e=>e!==primaryPact);
        const secondPact = othersDP[Math.floor(Math.random()*othersDP.length)];
        const ELEMENT_LABEL_DP = {fire:'화염', ice:'빙결', lightning:'번개'};
        const elementBaseDmg = (el)=>{
          if(el==='fire') return Math.max(1, Math.round(effectiveMag()*1.5) - Math.round(edefDP*0.5));
          if(el==='ice') return Math.max(1, Math.round(effectiveMag()*2.6) - edefDP);
          return Math.max(1, Math.round(effectiveMag()*1.0) - Math.round(edefDP*0.85)) * 2;
        };
        const dmgDP = applyOutgoingDamageMods(
          Math.round(elementBaseDmg(primaryPact)*0.7) + Math.round(elementBaseDmg(secondPact)*0.7),
          {type:'magicskill', mpCost, onHitMult:onHitMultDP}
        );
        enemy.hp = Math.max(0, enemy.hp-dmgDP);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmgDP, 'crit');
        if(primaryPact==='fire' || secondPact==='fire'){
          applyDot({type:'burn', basis:'mag', ratio:0.35, turns:3, label:'원소 각인: 화염(이중 계약)'});
        }
        Sound.magic(); playBanner(`${ELEMENT_LABEL_DP[primaryPact]}+${ELEMENT_LABEL_DP[secondPact]}!`, 'pact-lightning'); playStatusFx('pact-ice');
        renderStatus();
        setBattleMsg(`${player.name}의 ${s.name}!`, `이중 계약 각인이 ${ELEMENT_LABEL_DP[primaryPact]}과 ${ELEMENT_LABEL_DP[secondPact]}를 동시에 터뜨려 ${dmgDP}의 피해를 입혔다!`);
        if(checkBattleEnd()) return;
        enemyTurn();
        return;
      }
      // 원소 각인(mageElementStrike, 레벨10 액티브): 계약한 원소에 따라 완전히
      // 다르게 동작한다. 화염=화상 부여+중간 피해, 빙결=방어 무시 없는 고배율
      // 단일 강타, 번개=2연속 타격(관통은 약함). 미계약 시 위력이 눈에 띄게
      // 약하다(먼저 계약하도록 유도).
      const pact = battleFlags.elementPact;
      const edef = getEffectiveEnemyDef(enemy.def);
      const onHitMult = consumeOnHitBonuses();
      let msg2 = '';
      if(pact==='fire'){
        let dmg = Math.max(1, Math.round(effectiveMag()*1.5) - Math.round(edef*0.5));
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
        Sound.magic(); playStatusFx('burn');
        applyDot({type:'burn', basis:'mag', ratio:0.5, turns:3, label:'원소 각인: 화염'});
        msg2 = `화염 각인이 ${enemy.name}에게 ${dmg}의 피해를 입히고 짙은 화상을 남겼다!`;
      } else if(pact==='ice'){
        let dmg = Math.max(1, Math.round(effectiveMag()*2.6) - edef);
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, 'crit');
        Sound.magic(); playStatusFx('pact-ice');
        msg2 = `빙결 각인이 ${enemy.name}에게 ${dmg}의 강력한 피해를 입혔다!`;
      } else if(pact==='lightning'){
        const per = Math.max(1, Math.round(effectiveMag()*1.0) - Math.round(edef*0.85));
        const totalRaw = per*2;
        const total = applyOutgoingDamageMods(totalRaw, {type:'magicskill', mpCost, onHitMult});
        const scale = total/totalRaw;
        const parts = [Math.max(1,Math.round(per*scale)), Math.max(1,Math.round(per*scale))];
        enemy.hp = Math.max(0, enemy.hp - parts[0] - parts[1]);
        updateEnemyHpBar(); shakeEnemy();
        Sound.magic(); playStatusFx('pact-lightning');
        parts.forEach((d,i)=>{ setTimeout(()=>{ spawnSlashMark(i); popDamage('-'+d); }, i*180); });
        msg2 = `번개 각인이 두 번 연속 꽂혀 ${parts.join(' + ')}의 피해를 입혔다!`;
      } else {
        let dmg = Math.max(1, Math.round(effectiveMag()*1.1) - Math.round(edef*0.5));
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
        Sound.magic();
        msg2 = `계약 없이 평범한 마력탄을 날려 ${dmg}의 피해를 입혔다. (원소와 계약하면 훨씬 강력해진다)`;
      }
      msg2 += checkPactBetrayal();
      renderStatus();
      setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='elementwave'){
      // 원소 파동(mageElementWave, 레벨12 액티브): 화염=쌓인 화상의 잔여 피해량만큼
      // 즉시 폭발(화상이 없으면 약한 대체 공격), 빙결=2턴간 자체 방어력 상승,
      // 번개=다음 공격 확정 치명타 부여(player.lightningCritArmed — 기본 공격과
      // 범용 phys/magic 분기에서 소모된다. elementstrike/elementstorm 자체는
      // 별도 계산식이라 이 플래그를 소모하지 않는다 — 설계상 범위 제한).
      const pact = battleFlags.elementPact;
      const edef = getEffectiveEnemyDef(enemy.def);
      const onHitMult = consumeOnHitBonuses();
      let msg2 = '';
      if(pact==='fire'){
        const burn = (enemy.dots||[]).find(d=>d.type==='burn' && d.turns>0);
        if(burn){
          const burst = Math.max(1, burn.dmgPerTurn * burn.turns);
          const dmg = applyOutgoingDamageMods(burst, {type:'magicskill', mpCost, onHitMult});
          enemy.hp = Math.max(0, enemy.hp-dmg);
          updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, 'crit');
          enemy.dots = enemy.dots.filter(d=>d!==burn);
          updateStatusBadges();
          Sound.magic(); playStatusFx('burn');
          msg2 = `타오르던 화상을 한꺼번에 터뜨려 ${enemy.name}에게 ${dmg}의 폭발적인 피해를 입혔다!`;
        } else {
          let dmg = Math.max(1, Math.round(effectiveMag()*1.0) - Math.round(edef*0.5));
          dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
          enemy.hp = Math.max(0, enemy.hp-dmg);
          updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
          Sound.magic();
          msg2 = `타오르는 화상이 없어 터뜨릴 것이 없다. 대신 ${dmg}의 피해를 입혔다.`;
        }
      } else if(pact==='ice'){
        let dmg = Math.max(1, Math.round(effectiveMag()*0.8) - Math.round(edef*0.5));
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
        Sound.magic(); playStatusFx('pact-ice');
        player.buffDefTurns = 2; player.buffDefMult = 0.7;
        msg2 = `얼음 장벽을 두르며 ${dmg}의 피해를 입혔다. 2턴간 받는 피해가 줄어든다.`;
      } else if(pact==='lightning'){
        let dmg = Math.max(1, Math.round(effectiveMag()*0.9) - Math.round(edef*0.6));
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
        Sound.magic(); playStatusFx('pact-lightning');
        player.lightningCritArmed = true;
        msg2 = `번개의 기운을 벼려 ${dmg}의 피해를 입혔다. 다음 공격은 반드시 급소에 꽂힌다.`;
      } else {
        let dmg = Math.max(1, Math.round(effectiveMag()*0.9) - Math.round(edef*0.5));
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
        Sound.magic();
        msg2 = `계약 없이 평범한 파동을 날려 ${dmg}의 피해를 입혔다.`;
      }
      msg2 += checkPactBetrayal();
      renderStatus();
      setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='elementstorm'){
      // 삼위일체 각인(me_trinity, 계약술사 장신구 각인 — 사용자 요청): 계약
      // 원소와 무관하게 화염+빙결+번개를 전부 발동시킨다. 기존 3분기 코드를
      // 건드리지 않기 위해, 이 각인이 있을 때만 완전히 별도 경로로 처리하고
      // 없으면 아래 기존 로직으로 그대로 흘러간다(회귀 위험 최소화).
      const cIdTri = player.equipment && player.equipment.accessory;
      const hasTrinity = !!(cIdTri && typeof getEnhancementsFor==='function' && getEnhancementsFor(cIdTri).includes('me_trinity'));
      if(hasTrinity){
        const edefT = getEffectiveEnemyDef(enemy.def);
        const onHitMultT = consumeOnHitBonuses();
        // 밸런스 수정(제보 — 3원소를 전부 온전한 위력으로 때리다 보니 단일
        // 원소 대비 +170%로 다른 각인들(+40~100%대)에 비해 압도적으로
        // 강했음). 각 원소 배율에 0.7을 곱해 최종 상승폭을 +75% 선으로
        // 맞췄다(시뮬레이션으로 확인).
        const trinityScale = 0.7;
        let totalDmg = 0;
        // 화염
        let fireDmg = Math.max(1, Math.round(effectiveMag()*2.4*trinityScale) - Math.round(edefT*0.5));
        fireDmg = applyOutgoingDamageMods(fireDmg, {type:'magicskill', mpCost, onHitMult:onHitMultT});
        totalDmg += fireDmg;
        applyDot({type:'burn', basis:'mag', ratio:0.7*trinityScale, turns:4, label:'원소 폭풍: 화염'});
        // 빙결(방어 완전 무시)
        let iceDmg = Math.max(1, Math.round(effectiveMag()*3.2*trinityScale));
        iceDmg = applyOutgoingDamageMods(iceDmg, {type:'magicskill', mpCost, onHitMult:onHitMultT});
        totalDmg += iceDmg;
        // 번개(3연속의 총합만 반영, 연출은 생략하고 합산 피해로 처리)
        const perL = Math.max(1, Math.round(effectiveMag()*1.1*trinityScale) - Math.round(edefT*0.65));
        let lightningDmg = applyOutgoingDamageMods(perL*3, {type:'magicskill', mpCost, onHitMult:onHitMultT});
        totalDmg += lightningDmg;
        enemy.hp = Math.max(0, enemy.hp - totalDmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+totalDmg, 'crit');
        Sound.magic(); playBanner('🔥❄⚡ 삼위일체!', 'pact-lightning'); playStatusFx('pact-ice');
        // 쿨다운 2배(사용자 확정 — 세 원소를 동시에 부르는 대가).
        if(battleFlags.skillCooldowns) battleFlags.skillCooldowns[key] = (s.cooldown||3)*2;
        renderStatus();
        setBattleMsg(`${player.name}의 ${s.name}!`, `삼위일체 각인이 화염·빙결·번개를 동시에 불러내 ${totalDmg}의 압도적인 피해를 입혔다!`);
        if(checkBattleEnd()) return;
        enemyTurn();
        return;
      }
      // 원소 폭풍(mageElementStorm, 레벨15 궁극기): 화염=초강력 화상+큰 피해,
      // 빙결=방어 완전 무시 초고배율 강타, 번개=3연속 타격(관통 있음). 미계약
      // 시에도 여전히 약하다(궁극기까지 계약 없이 쓰는 것을 강하게 억제).
      const pact = battleFlags.elementPact;
      const edef = getEffectiveEnemyDef(enemy.def);
      const onHitMult = consumeOnHitBonuses();
      let msg2 = '';
      if(pact==='fire'){
        let dmg = Math.max(1, Math.round(effectiveMag()*2.4) - Math.round(edef*0.5));
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, 'crit');
        Sound.magic(); playStatusFx('burn');
        applyDot({type:'burn', basis:'mag', ratio:0.7, turns:4, label:'원소 폭풍: 화염'});
        msg2 = `대화염이 ${enemy.name}을(를) 집어삼켜 ${dmg}의 피해를 입히고 격렬한 화상을 남겼다!`;
      } else if(pact==='ice'){
        let dmg = Math.max(1, Math.round(effectiveMag()*3.2)); // 방어 완전 무시(edef 차감 없음)
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, 'crit');
        Sound.magic(); playStatusFx('pact-ice');
        msg2 = `절대영도의 빙결이 방어를 완전히 무시하고 ${enemy.name}에게 ${dmg}의 압도적인 피해를 입혔다!`;
      } else if(pact==='lightning'){
        const per = Math.max(1, Math.round(effectiveMag()*1.1) - Math.round(edef*0.65));
        const totalRaw = per*3;
        const total = applyOutgoingDamageMods(totalRaw, {type:'magicskill', mpCost, onHitMult});
        const scale = total/totalRaw;
        const parts = [0,1,2].map(()=>Math.max(1,Math.round(per*scale)));
        enemy.hp = Math.max(0, enemy.hp - parts.reduce((a,b)=>a+b,0));
        updateEnemyHpBar(); shakeEnemy();
        Sound.magic(); playStatusFx('pact-lightning');
        parts.forEach((d,i)=>{ setTimeout(()=>{ spawnSlashMark(i); popDamage('-'+d, 'crit'); }, i*180); });
        msg2 = `벼락이 세 번 연속으로 방어를 꿰뚫으며 ${parts.join(' + ')}의 피해를 입혔다!`;
      } else {
        let dmg = Math.max(1, Math.round(effectiveMag()*1.3) - Math.round(edef*0.5));
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
        Sound.magic();
        msg2 = `계약 없이 궁극의 파동을 날려 ${dmg}의 피해를 입혔다. (원소와 계약했다면 훨씬 강력했을 것이다)`;
      }
      msg2 += checkPactBetrayal();
      renderStatus();
      setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='timerewind'){
      // 시간 역행(mageTimeRewind, 레벨12): 사용자 확정 — 스택을 소비하지 않고
      // "조건"으로만 쓴다. 시간 조각이 stackRequirement(3) 이상 쌓여 있어야
      // 쓸 수 있으며, 사용해도 조각 수는 그대로 유지된다. 조건 미달이면 MP를
      // 그대로 환불하고 턴을 소모하지 않은 채 취소한다.
      const stacks = battleFlags.timeStacks || 0;
      if(stacks < (s.stackRequirement||3)){
        player.mp += mpCost;
        renderStatus();
        setCommandsEnabled(true);
        setBattleMsg('아직 때가 아니다…', `시간 조각이 부족하다! (현재 ${stacks}개, 최소 ${s.stackRequirement||3}개 필요 — 소비되지 않고 조건으로만 쓰인다)`);
        return;
      }
      player.hp = player.maxhp;
      player.mp = player.maxmp;
      renderStatus();
      playCastBurst('heal');
      Sound.heal();
      setBattleMsg(`${player.name}의 ${s.name}!`, `쌓인 시간 조각(${stacks}개)의 힘으로 시간을 되돌려 HP와 MP를 가득 채웠다! (조각은 소모되지 않는다)`);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='timeparadox'){
      // 시간의 역설(mageTimeParadox, 레벨15 궁극기): 쌓인 시간 조각을 전부
      // 소비해 조각 수에 비례한 폭딜을 넣는다. 인내의 파훼자/저주 회수와 동일한
      // baseMult+stackMult*stacks 패턴 — 풀스택(5개)이면 마력 4.0배.
      const stacks = battleFlags.timeStacks || 0;
      // 시간 정지 각인(me_timestop, 시간술사 장신구 각인 — 사용자 요청):
      // 조각이 최대(5개)일 때 사용하면 조각이 소비되지 않고 그대로 유지된다
      // — 조건만 맞으면 궁극기를 연속으로 꽂을 수 있다.
      const cIdTS = player.equipment && player.equipment.accessory;
      const hasTimeStop = !!(cIdTS && typeof getEnhancementsFor==='function' && getEnhancementsFor(cIdTS).includes('me_timestop'));
      const timeStopKept = hasTimeStop && stacks>=5;
      if(!timeStopKept) battleFlags.timeStacks = 0;
      updatePlayerStatusBadges();
      const mult = (s.baseMult||1.0) + (s.stackMult||0.6)*stacks;
      const edef = getEffectiveEnemyDef(enemy.def);
      const onHitMult = consumeOnHitBonuses();
      let dmg = Math.max(1, Math.round(effectiveMag()*mult) - edef);
      dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
      enemy.hp = Math.max(0, enemy.hp-dmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, stacks>0?'crit':undefined);
      Sound.magic(); playCastBurst();
      renderStatus();
      const msg2 = (stacks>0
        ? `쌓아온 시간 조각(${stacks}개)이 한꺼번에 무너지며 ${enemy.name}에게 ${dmg}의 압도적인 피해를 입혔다!`
        : `쌓인 시간 조각이 없어 기본 위력으로 ${enemy.name}에게 ${dmg}의 피해를 입혔다.`)
        + (timeStopKept ? ' 시간 정지 각인이 조각을 그대로 지켜냈다!' : '');
      setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='nightparade'){
      // 백귀야행(rogueUndeadParade, 레벨15 궁극기, 환영검사): 이번 전투에서 잔영
      // (마스터리)이 발동했던 누적 횟수(battleFlags.afterimageTriggerCount)만큼
      // 분신이 동시에 몰아친다. 기존 multihit 타입과 동일한 "타수 고정" 방식이
      // 아니라 타수 자체가 매번 달라지므로, multihit의 순차 타격 연출 패턴을
      // 그대로 손으로 재현했다(범용 multihit 분기는 s.hits가 고정값이라 여기엔
      // 못 쓴다). 사용 후 카운트는 0으로 초기화된다.
      const hits = Math.max(1, battleFlags.afterimageTriggerCount||0);
      const hadCount = (battleFlags.afterimageTriggerCount||0) > 0;
      // 불멸 군단 각인(re_immortallegion, 환영검사 장신구 각인 — 사용자
      // 요청): 사용해도 잔영 누적 횟수가 초기화되지 않고 그대로 유지된다.
      // 대신 쿨다운이 3턴→5턴으로 늘어난다(생성 시점에 이미 걸린 기본
      // 쿨다운을 여기서 덮어쓴다).
      const cIdIL = player.equipment && player.equipment.accessory;
      const hasImmortalLegion = !!(cIdIL && typeof getEnhancementsFor==='function' && getEnhancementsFor(cIdIL).includes('re_immortallegion'));
      if(!hasImmortalLegion){
        battleFlags.afterimageTriggerCount = 0;
      } else if(battleFlags.skillCooldowns){
        battleFlags.skillCooldowns[key] = 5;
      }
      updatePlayerStatusBadges();
      const edefParade = getEffectiveEnemyDef(enemy.def);
      const onHitMultParade = consumeOnHitBonuses();
      const perHitBase = Math.max(1, Math.round(effectiveAtk()*0.85) - Math.round(edefParade*0.5));
      const rawParts = [];
      for(let i=0;i<hits;i++) rawParts.push(perHitBase);
      const baseRawTotal = rawParts.reduce((a,b)=>a+b,0);
      const boostedTotal = applyOutgoingDamageMods(baseRawTotal, {type:'physkill', mpCost, onHitMult:onHitMultParade});
      const scale = boostedTotal/baseRawTotal;
      const parts = rawParts.map(d=>Math.max(1, Math.round(d*scale)));
      const total = parts.reduce((a,b)=>a+b,0);
      setBattleMsg(`${player.name}의 ${s.name}!`, hadCount ? `쌓아온 잔영(${hits}번)이 한꺼번에 몰아친다...` : '불러낼 잔영이 없어 홀로 몰아친다...');
      parts.forEach((hitDmg,i)=>{
        setTimeout(()=>{
          enemy.hp = Math.max(0, enemy.hp-hitDmg);
          updateEnemyHpBar(); shakeEnemy(); spawnSlashMark(i);
          Sound.slash();
          popDamage('-'+hitDmg, i===parts.length-1?'crit':undefined);
        }, i*160);
      });
      setTimeout(()=>{
        renderStatus();
        playComboFinish(parts.length);
        setBattleMsg(`${player.name}의 ${s.name}!`, `${hits}구의 분신 군단이 동시에 몰아쳐 ${enemy.name}에게 총 ${total}의 압도적인 피해를 입혔다!`);
        if(checkBattleEnd()) return;
        enemyTurn();
      }, parts.length*160 + 250);
      return;
    }

    if(s.type==='drain'){
      const atkBased = s.basis==='atk';
      const basisVal = atkBased ? effectiveAtk() : effectiveMag();
      const edef = getEffectiveEnemyDef(enemy.def);
      let dmg = Math.max(1, Math.round(basisVal*s.mult) - Math.round(edef*0.5));
      const onHitMult = consumeOnHitBonuses();
      dmg = applyOutgoingDamageMods(dmg, {type: atkBased?'physkill':'magicskill', mpCost, onHitMult});
      const mod = applySkillModifiers(dmg, s);
      dmg = mod.value;
      const healed = Math.min(player.maxhp-player.hp, Math.round(dmg*s.drainRatio*epicLifestealMult()));
      if(atkBased) consumeAtkBuff();
      rogueRegisterHit(atkBased);
      enemy.hp = Math.max(0, enemy.hp-dmg);
      player.hp = Math.min(player.maxhp, player.hp+healed);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, mod.triggered?'crit':undefined);
      if(atkBased) Sound.slash(); else Sound.magic();
      Sound.heal();
      playCastBurst('heal');
      renderStatus();
      let msg2 = `${dmg}의 피해를 주고 ${healed} 만큼 흡수했다.`;
      if(mod.triggered) msg2 = '급소를 꿰뚫었다! '+msg2;
      const dotLabels2 = applySkillDots(s);
      if(dotLabels2) msg2 += ` ${dotLabels2} 효과 부여!`;
      setBattleMsg(`${player.name}은(는) ${s.name}을(를) 시전했다!`, msg2);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='goldbet'){
      // 베팅/올인(황금 도박사): 소지 골드의 일부(stakePct)를 판돈으로 걸고
      // 도박한다. 골드가 0이면 판돈 자체가 불가능하므로, 확률 없이 그냥 평범한
      // 일격만 나간다(사용자 명세 그대로). 골드가 있으면: 판돈을 먼저 뗀 뒤
      // (s.stakeCap으로 절대 상한이 걸려 있다 — 베팅 2000G/올인 10000G. 후반부에
      // 골드가 많이 쌓여도 판돈 비례 피해가 무한정 커지지 않도록 하는 안전장치)
      // 확률(성공 시 +촉의 fateBoostChance)을 굴려, 성공하면 판돈의 payoutMult배를
      // 돌려주고 판돈에 비례한 추가 피해(stakeBonusMult, 성공 시 +촉의
      // fateBoostMult)를 더한다. 실패하면 판돈은 그대로 사라지고 피해는 0.
      // 레벨12 "촉"(fateshift 타입, 기존 운명 조작과 동일한 메커니즘)이 세워둔
      // player.fateBoostChance/fateBoostMult를 coinflip과 동일한 방식으로 소비한다.
      const fateChance = player.fateBoostChance||0, fateMult = player.fateBoostMult||0;
      if(fateChance || fateMult){ player.fateBoostChance=0; player.fateBoostMult=0; }
      const edefBet = getEffectiveEnemyDef(enemy.def);
      const onHitMultBet = consumeOnHitBonuses();
      // 몰빵 각인(ju_bigbet, 황금 도박사 무기 각인 — 사용자 요청): 베팅의
      // 판돈 상한이 늘어난다(stakeCap 1.5배). 실패하면 이후 이번 전투에서
      // 얻는 골드가 반토막난다.
      const wIdBB = player.equipment && player.equipment.weapon;
      const hasBigBet = !!(key==='jesterGoldBet' && wIdBB && typeof getEnhancementsFor==='function' && getEnhancementsFor(wIdBB).includes('ju_bigbet'));
      const stakeCapUsed = hasBigBet ? Math.round((s.stakeCap||Infinity)*1.5) : (s.stakeCap||Infinity);
      // 빚투 각인(ju_debtbet, 황금 도박사 장신구 각인 — 사용자 요청): 올인
      // 한정으로, 가진 골드의 150%까지 판돈으로 걸 수 있다(부족분은 빚처럼
      // 즉시 골드 0으로 클램프). 실패하면 판돈 크기와 무관하게 최대HP 15%
      // 고정 피해(너무 크게 걸어도 즉사하지 않도록).
      const cIdDB = player.equipment && player.equipment.accessory;
      const hasDebtBet = !!(key==='jesterAllIn' && cIdDB && typeof getEnhancementsFor==='function' && getEnhancementsFor(cIdDB).includes('ju_debtbet'));
      const stakeBase = hasDebtBet ? Math.round((player.gold||0)*1.5) : Math.round((player.gold||0)*s.stakePct);
      const stake = Math.min(stakeCapUsed, stakeBase);

      if(stake<=0){
        // 골드가 없으면 판돈 없이 그냥 평범한 일격.
        let dmg = Math.max(1, Math.round(effectiveAtk()*s.baseMult) - edefBet);
        dmg = applyOutgoingDamageMods(dmg, {type:'physkill', mpCost, onHitMult:onHitMultBet});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
        Sound.slash();
        renderStatus();
        setBattleMsg(`${player.name}의 ${s.name}!`, `걸 돈이 없어 맨몸으로 부딪혔다. ${enemy.name}에게 ${dmg}의 피해를 입혔다.`);
        if(checkBattleEnd()) return;
        enemyTurn();
        return;
      }

      player.gold = Math.max(0, (player.gold||0) - stake);
      const chance = Math.min(0.95, s.successChance + fateChance);
      const success = Math.random() < chance;
      if(success){
        const stakeBonusMult = s.stakeBonusMult + fateMult;
        let dmg = Math.max(1, Math.round(effectiveAtk()*s.baseMult) - edefBet) + Math.round(stake*stakeBonusMult);
        dmg = applyOutgoingDamageMods(dmg, {type:'physkill', mpCost, luck:true, onHitMult:onHitMultBet});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, 'crit');
        rogueRegisterHit(true);
        Sound.coin();
        playBanner('대성공!');
        const payout = Math.round(stake*s.payoutMult);
        player.gold += payout;
        renderStatus();
        setBattleMsg(`${player.name}의 ${s.name}!`, `승부에서 이겼다! ${enemy.name}에게 ${dmg}의 피해를 입혔다. 판돈 ${stake}G가 ${payout}G로 불어났다!`);
      } else {
        popDamage('빗나감!', 'miss');
        Sound.fail();
        playBanner('실패...', 'luckbad');
        let failExtraMsg = '';
        if(hasBigBet){
          battleFlags.goldbetGoldPenalty = true;
          failExtraMsg += ' 몰빵이 실패해 이후 얻는 골드가 반토막난다.';
        }
        if(hasDebtBet){
          const debtDmg = Math.max(1, Math.round(player.maxhp*0.15));
          player.hp = Math.max(1, player.hp-debtDmg);
          failExtraMsg += ` 빚투가 무너져 최대HP 15%(${debtDmg})의 피해를 입었다.`;
        }
        renderStatus();
        setBattleMsg(`${player.name}의 ${s.name}!`, `승부에서 졌다... 판돈 ${stake}G를 그대로 잃었다. 완전히 빗나갔다.${failExtraMsg}`);
      }
      if(checkBattleEnd()) return;
      if(checkGamblerRetry(key, isRetry)) return;
      enemyTurn();
      return;
    }

    // 황금 도박사 - 레벨12 "정보료": 골드를 지불해 다음 베팅/올인의 성공률과
    // 배율을 크게 끌어올린다(player.fateBoostChance/fateBoostMult를 세팅 —
    // goldbet 타입이 위에서 이미 이 필드를 소비하도록 되어 있어 신규 소비
    // 로직은 필요 없다).
    if(s.type==='goldinfofee'){
      // 사기 정보 각인(ju_infoscam, 황금 도박사 방어구 각인 — 사용자 요청):
      // 정보료로 얻는 성공률/배율 보너스가 2배가 되는 대신, 비용 자체도
      // 2배가 된다.
      const aIdIS = player.equipment && player.equipment.armor;
      const hasInfoScam = !!(aIdIS && typeof getEnhancementsFor==='function' && getEnhancementsFor(aIdIS).includes('ju_infoscam'));
      const costMultUsed = hasInfoScam ? 2 : 1;
      const cost = Math.max(s.goldCostMin||0, Math.round((player.gold||0)*(s.goldCostPct||0.4)*costMultUsed));
      if((player.gold||0) < cost){
        setCommandsEnabled(true);
        player.mp += mpCost;
        setBattleMsg('돈이 부족하다…', `정보료로 최소 ${cost}G가 필요하다. (현재 소지금 ${player.gold||0}G)`);
        return;
      }
      player.gold -= cost;
      player.fateBoostChance = (s.chanceBonus||0.4) * costMultUsed;
      player.fateBoostMult = (s.multBonus||0.5) * costMultUsed;
      renderStatus();
      playCastBurst();
      Sound.buff();
      setBattleMsg(`${player.name}의 ${s.name}!`, `정보상에게 ${cost}G를 찔러줬다. 다음 베팅의 성공률과 배율이 ${hasInfoScam ? '평소보다 두 배로 ' : ''}크게 오른다.`);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='coinflip'){
      const fateChance = player.fateBoostChance||0, fateMult = player.fateBoostMult||0;
      if(fateChance || fateMult){ player.fateBoostChance=0; player.fateBoostMult=0; }
      const epicLuck = epicLuckPre(s);
      const chance = epicLuckApplyChance(Math.min(0.95, (s.chance||0.5) + fateChance), epicLuck);
      const success = Math.random() < chance;
      const magicBased = !!s.magic;
      const base = magicBased ? effectiveMag() : effectiveAtk();
      const edef = getEffectiveEnemyDef(enemy.def);
      const defMitigation = magicBased ? Math.round(edef*0.5) : Math.round(edef*(1-(s.defPierce||0)));
      if(!magicBased) consumeAtkBuff();
      const onHitMult = consumeOnHitBonuses();
      if(success){
        const critMult = (s.critMult||2.0) + fateMult;
        let dmg = Math.max(1, Math.round(base*(s.mult||1.0)*critMult) - defMitigation);
        dmg = applyOutgoingDamageMods(dmg, {type: magicBased?'magicskill':'physkill', mpCost, luck:true, onHitMult});
        const mod = applySkillModifiers(dmg, s);
        dmg = mod.value;
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, 'crit');
        rogueRegisterHit(!magicBased);
        Sound.coin();
        playBanner('대성공!');
        let healed = 0;
        if(s.lifesteal){
          healed = Math.min(player.maxhp-player.hp, Math.round(dmg*s.lifesteal*epicLifestealMult()));
          player.hp = Math.min(player.maxhp, player.hp+healed);
        }
        epicLuckPost(true, epicLuck);
        renderStatus();
        let msg2 = `운이 따랐다! ${enemy.name}에게 ${dmg}의 피해를 입혔다.`;
        const dotLabels = applySkillDots(s);
        if(dotLabels) msg2 += ` ${dotLabels} 효과 부여!`;
        if(healed>0) msg2 += ` HP ${healed} 흡수.`;
        setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      } else {
        epicLuckPost(false, epicLuck);
        popDamage('빗나감!', 'miss');
        Sound.fail();
        playBanner('실패...', 'luckbad');
        renderStatus();
        setBattleMsg(`${player.name}의 ${s.name}!`, '운이 따르지 않았다... 완전히 빗나갔다.');
      }
      if(checkBattleEnd()) return;
      if(checkGamblerRetry(key, isRetry)) return;
      enemyTurn();
      return;
    }

    if(s.type==='hpswap'){
      // 사기꾼 레벨15 궁극기 "운명 뒤바꾸기": 성공 시 나와 적의 현재 HP를
      // 완전히 맞바꾼다. 전투당 1회 제한 — battleFlags.fateSwapUsedCount로
      // 체크(겹패 각인이 있으면 상한이 2가 된다). 실패해도 손버릇
      // (mastery_luckdebt)으로 1회 무료 재시도 가능.
      const wIdDS = player.equipment && player.equipment.weapon;
      const hasDoubleSwap = !!(wIdDS && typeof getEnhancementsFor==='function' && getEnhancementsFor(wIdDS).includes('ju_doubleswap'));
      const fateSwapMax = hasDoubleSwap ? 2 : 1;
      if((battleFlags.fateSwapUsedCount||0) >= fateSwapMax){
        setCommandsEnabled(true);
        player.mp += mpCost;
        setBattleMsg('운명은 두 번 흔들리지 않는다…', '이번 전투에서 더 이상 운명을 뒤바꿀 수 없다.');
        return;
      }
      const epicLuck = epicLuckPre(s);
      const chance = epicLuckApplyChance(s.chance||0.5, epicLuck);
      const success = Math.random() < chance;
      if(success){
        battleFlags.fateSwapUsedCount = (battleFlags.fateSwapUsedCount||0) + 1;
        // 퍼센트 기반 스왑(사용자 확정) — 절대치가 아니라 "각자 최대HP 대비
        // 남은 비율"을 서로 맞바꾼다. 예: 적이 80% 남고 내가 10% 남았다면,
        // 성공 시 나는 내 최대HP의 80%로, 적은 적 최대HP의 10%로 바뀐다.
        const myPct = player.maxhp>0 ? player.hp/player.maxhp : 0;
        const enemyMaxHp = enemy.maxhp || enemy.hp || 1;
        const enemyPct = enemyMaxHp>0 ? enemy.hp/enemyMaxHp : 0;
        const myPctLabel = Math.round(myPct*100), enemyPctLabel = Math.round(enemyPct*100);
        player.hp = Math.max(1, Math.min(player.maxhp, Math.round(player.maxhp*enemyPct)));
        enemy.hp = Math.max(0, Math.min(enemyMaxHp, Math.round(enemyMaxHp*myPct)));
        updateEnemyHpBar(); renderStatus();
        Sound.bomb();
        playBanner('운명 역전!');
        epicLuckPost(true, epicLuck);
        setBattleMsg(`${player.name}의 ${s.name}!`, `운명의 저울이 뒤집혔다! 서로의 남은 체력 비율이 맞바뀌었다(나 ${myPctLabel}% ↔ ${enemy.name} ${enemyPctLabel}%).`);
        if(checkBattleEnd()) return;
        enemyTurn();
        return;
      } else {
        epicLuckPost(false, epicLuck);
        popDamage('빗나감!', 'miss');
        Sound.fail();
        playBanner('실패...', 'luckbad');
        setBattleMsg(`${player.name}의 ${s.name}!`, '운명은 꿈쩍하지 않았다... 완전히 빗나갔다.');
        if(checkBattleEnd()) return;
        if(checkGamblerRetry(key, isRetry)) return;
        enemyTurn();
        return;
      }
    }

    if(s.type==='martyrultimate'){
      // 순교자 레벨15 궁극기 "불멸의 순교"(신규): 누적 희생 횟수(마스터리
      // 발동 횟수)에 비례해 확정 피해를 입힌다. 사용 시 최대HP 15%를 추가로
      // 소모하는 반동이 있는데, 이걸로 죽게 되면 전투당 1회 HP1로 버틴다.
      const count = Math.min(s.maxSacrificeCount||10, player.martyrSacrificeCount||0);
      const mult = (s.baseMult||2.0) + count*(s.countBonusMult||0.35);
      const edefM = getEffectiveEnemyDef(enemy.def);
      let dmg = Math.max(1, Math.round(player.atk*mult) - Math.round(edefM*0.5));
      dmg = applyOutgoingDamageMods(dmg, {type:'physkill', mpCost});
      enemy.hp = Math.max(0, enemy.hp-dmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, 'crit');
      const selfCost = Math.round(player.maxhp*(s.selfHpCostPct||0.15));
      // 영겁 회귀의 각인(pa_eternalreturn, 순교자 장신구 각인 — 사용자 요청):
      // "처치 시" 조건은 1:1 전투 구조상 성립이 안 돼(처치=즉시 전투 종료라
      // 재발동할 다음 적이 없음) "최대HP 30% 이상 피해"로 고쳐서 적용한다
      // (전사 각인들과 동일한 수정 기준). 조건 충족 시 반동 HP를 되돌리고
      // 쿨다운을 초기화한다.
      const cIdER = player.equipment && player.equipment.accessory;
      let eternalReturnMsg = '';
      let skipSelfCost = false;
      if(cIdER && typeof getEnhancementsFor==='function' && getEnhancementsFor(cIdER).includes('pa_eternalreturn')){
        if(enemy.hp>0 && dmg >= Math.round(enemy.maxhp*0.3)){
          skipSelfCost = true;
          if(battleFlags.skillCooldowns) battleFlags.skillCooldowns[key] = 0;
          eternalReturnMsg = ' 영겁 회귀의 각인이 반동을 되돌리고 쿨다운을 초기화했다!';
        }
      }
      let reviveMsg = '';
      if(skipSelfCost){
        // 반동 자체를 안 받는다.
      } else if(player.hp - selfCost <= 0 && !battleFlags.martyrReviveUsed){
        battleFlags.martyrReviveUsed = true;
        player.hp = 1;
        reviveMsg = ' 반동으로 쓰러질 뻔했지만, 순교자는 죽음조차 넘어섰다!';
      } else {
        player.hp = Math.max(0, player.hp - selfCost);
      }
      renderStatus();
      Sound.bomb();
      playBanner('불멸의 순교!');
      setBattleMsg(`${player.name}의 ${s.name}!`, `그동안 바쳐온 희생(${count}회)을 전부 힘으로 되돌려 ${enemy.name}에게 ${dmg}의 피해를 입혔다!${reviveMsg}${eternalReturnMsg}`);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='fateshift'){
      player.fateBoostChance = s.chanceBonus||0.3;
      player.fateBoostMult = s.multBonus||0.5;
      let msg2 = '다음 운 스킬의 성공 확률과 배율이 크게 오른다.';
      if(s.defBuffTurns){
        player.buffDefTurns = s.defBuffTurns;
        player.buffDefMult = s.defBuffMult||0.8;
        msg2 += ` ${s.defBuffTurns}턴간 받는 피해도 줄어든다.`;
      }
      if(s.selfHealRatio){
        const heal = Math.round(player.maxhp*s.selfHealRatio);
        player.hp = Math.min(player.maxhp, player.hp+heal);
        msg2 += ` HP ${heal} 회복.`;
      }
      renderStatus();
      playCastBurst();
      Sound.buff();
      setBattleMsg(`${player.name}은(는) ${s.name}을(를) 시전했다!`, msg2);
      enemyTurn();
      return;
    }

    // 도박사 1차 리뉴얼 - 레벨3 "야바위": 3분기 판정(완전실패/적중/간파).
    // 완전실패는 즉시 다음 턴으로 넘어가고(피해 0), 간파는 exposedTurns/
    // exposePierce(기존 필드, data/equipment.js의 getEffectiveEnemyDef가 이미
    // 소비)를 재사용해 급소노출을 건다. 도박사 세트(epicLuckPre/Post)도 다른
    // 운 스킬과 동일하게 연동한다 — 세트 3단계로 잭팟이 무장돼 있으면 무조건
    // "간파"로 처리한다.
    if(s.type==='shellgame'){
      const epicLuck = epicLuckPre(s);
      const edefSg = getEffectiveEnemyDef(enemy.def);
      const onHitMultSg = consumeOnHitBonuses();
      let outcome;
      if(epicLuck.wasArmed){
        outcome = 'great';
      } else {
        const roll = Math.random();
        if(roll < (s.missChance||0.34)) outcome = 'miss';
        else if(roll < (s.missChance||0.34) + (s.hitChance||0.33)) outcome = 'hit';
        else outcome = 'great';
      }
      if(outcome==='miss'){
        epicLuckPost(false, epicLuck);
        popDamage('빗나감!', 'miss');
        Sound.fail();
        playBanner('허탕...', 'luckbad');
        renderStatus();
        setBattleMsg(`${player.name}의 ${s.name}!`, '컵을 잘못 짚었다... 완전히 허탕이다.');
        if(checkBattleEnd()) return;
        if(checkGamblerRetry(key, isRetry)) return;
        enemyTurn();
        return;
      }
      const mult = outcome==='great' ? (s.greatMult||2.8) : (s.hitMult||1.5);
      let dmg = Math.max(1, Math.round(effectiveAtk()*mult) - edefSg);
      dmg = applyOutgoingDamageMods(dmg, {type:'physkill', mpCost, luck:true, onHitMult:onHitMultSg});
      consumeAtkBuff();
      rogueRegisterHit(true);
      enemy.hp = Math.max(0, enemy.hp-dmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, outcome==='great'?'crit':undefined);
      Sound.coin();
      epicLuckPost(true, epicLuck);
      let msg2 = `${enemy.name}에게 ${dmg}의 피해를 입혔다.`;
      if(outcome==='great'){
        enemy.exposedTurns = s.greatExposeTurns||2;
        enemy.exposePierce = s.greatExposePierce||0.2;
        if(typeof updateStatusBadges==='function') updateStatusBadges();
        playBanner('완벽 간파!');
        msg2 = `완벽하게 간파했다! ${enemy.name}에게 ${dmg}의 피해를 입히고 급소를 드러냈다!`;
      } else {
        playBanner('적중!');
      }
      renderStatus();
      setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='dicecast'){
      // 사기꾼(jesterRiggedDice) "속임수 주사위": 눈이 항상 4/5/6 중에서만 나온다.
      const rigged = player.skills && player.skills.includes('jesterRiggedDice');
      // 속임수 폭로 각인(ju_dicereveal, 사기꾼 장신구 각인 — 사용자 요청):
      // 주사위가 항상 6만 나오도록 더 노골적으로 조작한다. 대신 들통난
      // 대가로 이후 2턴간 모든 스킬 MP 소모가 +20%(위쪽 mpCostMult 계산에
      // 이미 반영됨 — 여기서는 페널티를 "거는" 시점만 처리).
      const cIdDR = player.equipment && player.equipment.accessory;
      const hasDiceReveal = !!(cIdDR && typeof getEnhancementsFor==='function' && getEnhancementsFor(cIdDR).includes('ju_dicereveal'));
      const roll = hasDiceReveal ? 6 : (rigged ? (4 + Math.floor(Math.random()*3)) : (1 + Math.floor(Math.random()*6)));
      if(hasDiceReveal) battleFlags.dicerevealPenaltyTurns = 2;
      const diceMults = s.diceMults || [0.6,1.1,1.7,2.4,3.2,4.5];
      const mult = diceMults[roll-1];
      const epicLuck = epicLuckPre(s);
      const edef = getEffectiveEnemyDef(enemy.def);
      let dmg = Math.max(1, Math.round(effectiveAtk()*mult) - edef);
      const onHitMult = consumeOnHitBonuses();
      dmg = applyOutgoingDamageMods(dmg, {type:'physkill', mpCost, luck:true, onHitMult});
      consumeAtkBuff();
      rogueRegisterHit(true);
      const success = roll>=4;
      epicLuckPost(success, epicLuck);
      enemy.hp = Math.max(0, enemy.hp-dmg);
      updateEnemyHpBar(); shakeEnemy();
      popDamage('-'+dmg, roll===6?'crit':undefined);
      Sound.slash();
      const diceFace = ['⚀','⚁','⚂','⚃','⚄','⚅'][roll-1];
      playBanner(roll===6 ? `${diceFace} 잭팟!` : `${diceFace} 눈 ${roll}`);
      renderStatus();
      let msg2 = `주사위 눈이 ${roll}이(가) 나왔다! ${enemy.name}에게 ${dmg}의 피해를 입혔다.`;
      if(roll===6) msg2 = `주사위가 6을 가리켰다! 운명이 그대의 손을 들어준다! ${enemy.name}에게 ${dmg}의 짜릿한 피해를 입혔다!`;
      else if(roll===1) msg2 = `주사위가 1... 초라한 눈이지만, 그래도 공격은 공격이다. ${enemy.name}에게 ${dmg}의 피해를 입혔다.`;
      setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='gamble'){
      const staked = player.mp + mpCost; // 시전 직전까지 갖고 있던 MP 전액을 판돈으로 건다
      player.mp = 0;
      const fateChance = player.fateBoostChance||0, fateMult = player.fateBoostMult||0;
      if(fateChance || fateMult){ player.fateBoostChance=0; player.fateBoostMult=0; }
      const epicLuck = epicLuckPre(s);
      const chance = epicLuckApplyChance(Math.min(0.9, (s.chance||0.5) + fateChance), epicLuck);
      const success = Math.random() < chance;
      consumeAtkBuff();
      const onHitMult = consumeOnHitBonuses();
      if(success){
        const mult = (s.mult||3.6) + fateMult;
        const edef = getEffectiveEnemyDef(enemy.def);
        let dmg = Math.max(1, Math.round(effectiveAtk()*mult) - edef) + Math.round(staked*1.5);
        dmg = applyOutgoingDamageMods(dmg, {type:'physkill', luck:true, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, 'crit');
        rogueRegisterHit(true);
        epicLuckPost(true, epicLuck);
        Sound.coin();
        playBanner('대박!');
        renderStatus();
        let msg2 = `도박에 성공했다! MP ${staked}을(를) 태워 ${enemy.name}에게 ${dmg}의 폭발적인 피해를 입혔다!`;
        const dotLabels = applySkillDots(s);
        if(dotLabels) msg2 += ` ${dotLabels} 효과 부여!`;
        setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
        if(checkBattleEnd()) return;
        enemyTurn();
        return;
      } else {
        epicLuckPost(false, epicLuck);
        const selfDmg = epicLuck.wasArmed ? 0 : Math.min(player.hp-1, Math.max(6, Math.round(staked*(s.selfMult||2.2))));
        if(selfDmg>0) player.hp -= selfDmg;
        renderStatus();
        if(selfDmg>0) popDamageOnPlayerArea('-'+selfDmg, 'bleed');
        Sound.fail();
        playBanner('낭패...', 'luckbad');
        setBattleMsg(`${player.name}의 ${s.name}!`, selfDmg>0 ? `도박에 실패했다... MP ${staked}을(를) 잃고 반동으로 ${selfDmg}의 피해를 입었다.` : `도박에 실패했다... MP ${staked}을(를) 잃었지만 세계의 마지막 카드가 반동을 막아주었다.`);
        if(checkBattleEnd()) return;
        if(checkGamblerRetry(key, isRetry)) return;
        enemyTurn();
        return;
      }
    }

    if(s.type==='finalcard'){
      const missingRatio = 1 - (player.hp/player.maxhp);
      const fateChance = player.fateBoostChance||0, fateMult = player.fateBoostMult||0;
      if(fateChance || fateMult){ player.fateBoostChance=0; player.fateBoostMult=0; }
      const epicLuck = epicLuckPre(s);
      const chance = epicLuckApplyChance(Math.min(0.98, (s.baseChance||0.35) + missingRatio*((s.maxChance||0.95)-(s.baseChance||0.35)) + fateChance), epicLuck);
      const mult = (s.baseMult||2.0) + missingRatio*((s.maxMult||6.0)-(s.baseMult||2.0)) + fateMult;
      const success = Math.random() < chance;
      const magicBased = !!s.magic;
      if(!magicBased) consumeAtkBuff();
      const base = magicBased ? effectiveMag() : effectiveAtk();
      const edef = getEffectiveEnemyDef(enemy.def);
      const defMitigation = magicBased ? Math.round(edef*0.5) : Math.round(edef*(1-(s.defPierce||0.2)));
      const onHitMult = consumeOnHitBonuses();
      if(success){
        let dmg = Math.max(1, Math.round(base*mult) - defMitigation);
        dmg = applyOutgoingDamageMods(dmg, {type: magicBased?'magicskill':'physkill', mpCost, luck:true, onHitMult});
        const mod = applySkillModifiers(dmg, s);
        dmg = mod.value;
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, 'crit');
        rogueRegisterHit(!magicBased);
        Sound.coin();
        playBanner('마지막 패!');
        let healed = 0;
        if(s.lifesteal){
          healed = Math.min(player.maxhp-player.hp, Math.round(dmg*s.lifesteal*epicLifestealMult()));
          player.hp = Math.min(player.maxhp, player.hp+healed);
        }
        // [리뉴얼] 성공 시 자힐 추가 — 벼랑 끝에서 살아남는 "역전" 느낌 강화.
        if(s.healOnSuccessPct){
          const selfHeal = Math.min(player.maxhp-player.hp, Math.round(player.maxhp*s.healOnSuccessPct));
          if(selfHeal>0){ player.hp += selfHeal; healed += selfHeal; }
        }
        epicLuckPost(true, epicLuck);
        renderStatus();
        let msg2 = `운명이 응답했다! ${enemy.name}에게 ${dmg}의 필멸의 피해를 입혔다.`;
        const dotLabels = applySkillDots(s);
        if(dotLabels) msg2 += ` ${dotLabels} 효과 부여!`;
        if(healed>0) msg2 += ` HP ${healed} 흡수.`;
        setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
        if(checkBattleEnd()) return;
        enemyTurn();
        return;
      } else {
        epicLuckPost(false, epicLuck);
        const selfDmg = epicLuck.wasArmed ? 0 : Math.max(0, Math.min(player.hp-1, Math.round(player.maxhp*(s.failSelfRatio||0.08))));
        if(selfDmg>0) player.hp -= selfDmg;
        renderStatus();
        if(selfDmg>0) popDamageOnPlayerArea('-'+selfDmg, 'bleed');
        else popDamage('빗나감!', 'miss');
        Sound.fail();
        playBanner('패가 뒤집혔다...', 'luckbad');
        setBattleMsg(`${player.name}의 ${s.name}!`, selfDmg>0 ? `카드가 어긋났다... 반동으로 ${selfDmg}의 피해를 입었다.` : '카드가 어긋나 아무 일도 일어나지 않았다.');
        if(checkBattleEnd()) return;
        if(checkGamblerRetry(key, isRetry)) return;
        enemyTurn();
        return;
      }
    }

    // 불운의 채권자(도박사 2차) - 레벨10 액티브 "청산": 쌓인 채무 스택을
    // 전량 소모해 스택 수에 비례한 확정 크리티컬을 꽂는다.
    if(s.type==='debtsettle'){
      const stacks = battleFlags.jesterDebtStacks||0;
      const mult = (s.baseMult||0.4) + stacks*(s.stackMult||0.5);
      const edefDs = Math.round(getEffectiveEnemyDef(enemy.def)*(1-(s.defPierce||0)));
      let dmg = Math.max(1, Math.round(effectiveAtk()*mult) - edefDs);
      const onHitMultDs = consumeOnHitBonuses();
      dmg = applyOutgoingDamageMods(dmg, {type:'physkill', mpCost, onHitMult:onHitMultDs});
      consumeAtkBuff();
      rogueRegisterHit(true);
      enemy.hp = Math.max(0, enemy.hp-dmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, stacks>0?'crit':undefined);
      Sound.coin();
      battleFlags.jesterDebtStacks = 0;
      if(typeof updatePlayerStatusBadges==='function') updatePlayerStatusBadges();
      renderStatus();
      setBattleMsg(`${player.name}의 ${s.name}!`, `쌓인 채무 ${stacks}건을 한꺼번에 청산했다! ${enemy.name}에게 ${dmg}의 피해를 입혔다.`);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    // 불운의 채권자 - 레벨15 궁극기 "파산 선언": 채무를 즉시 최대로 확정한 뒤
    // 강화된 청산을 발동한다. 반동으로 자신도 피해를 입는다(다른 궁극기들과
    // 동일하게 HP 1은 항상 남도록 클램프).
    if(s.type==='bankruptcy'){
      battleFlags.jesterDebtStacks = s.forceStacks||5;
      const stacksBk = battleFlags.jesterDebtStacks;
      const multBk = (s.baseMult||1.0) + stacksBk*(s.stackMult||0.7);
      const edefBk = Math.round(getEffectiveEnemyDef(enemy.def)*(1-(s.defPierce||0)));
      let dmgBk = Math.max(1, Math.round(effectiveAtk()*multBk) - edefBk);
      const onHitMultBk = consumeOnHitBonuses();
      dmgBk = applyOutgoingDamageMods(dmgBk, {type:'physkill', mpCost, onHitMult:onHitMultBk});
      consumeAtkBuff();
      rogueRegisterHit(true);
      enemy.hp = Math.max(0, enemy.hp-dmgBk);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmgBk,'crit');
      Sound.bomb();
      battleFlags.jesterDebtStacks = 0;
      const selfDmgBk = Math.max(1, Math.min(player.hp-1, Math.round(player.maxhp*(s.selfHpCostPct||0.12))));
      player.hp -= selfDmgBk;
      if(typeof updatePlayerStatusBadges==='function') updatePlayerStatusBadges();
      renderStatus();
      popDamageOnPlayerArea('-'+selfDmgBk, 'bleed');
      setBattleMsg(`${player.name}의 ${s.name}!`, `채무를 최대로 확정하고 전부 쏟아부었다! ${enemy.name}에게 ${dmgBk}의 압도적인 피해를 입혔다. 반동으로 ${selfDmgBk}의 피해를 입었다.`);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    // phys or magic damage skill
    const base = s.type==='magic' ? effectiveMag() : effectiveAtk();
    const edef = getEffectiveEnemyDef(enemy.def);
    const defMitigation = s.type==='magic'
      ? Math.round(edef*0.5)
      : Math.round(edef*(1-(s.defPierce||0)));
    let dmg = Math.max(1, Math.round(base*s.mult) - defMitigation);
    // 확정 HP 소모형 스킬(예: 혈인/혈옥쇄): 혈서 토글과 달리 선택의 여지 없이 쓸
    // 때마다 최대HP의 s.hpCostPct 비율만큼 피를 바친다. HP 1은 항상 남기도록
    // 클램프한다(즉사 방지).
    let hpSacMsg = '';
    let hpSacActualCost = 0;
    if(s.hpCostPct){
      const desiredCost = Math.max(1, Math.round(player.maxhp*s.hpCostPct));
      const actualCost = Math.min(desiredCost, player.hp-1);
      if(actualCost>0){
        player.hp -= actualCost;
        hpSacActualCost = actualCost;
        hpSacMsg = ` 스스로의 피 ${actualCost}을(를) 대가로 바쳤다.`;
      }
    }
    // 원소 계약(mastery_elementpact): 마법 스킬을 쓸 때마다 화염/빙결/번개 중 하나를
    // 즉석에서 계약해 추가 효과를 싣는다.
    // UI 연출: 예전에는 결과가 메시지 텍스트로만 스쳐 지나가 어떤 원소와 계약했는지
    // 체감이 전혀 안 됐다(특히 빙결/번개는 숫자만 조용히 바뀌고 아무 연출이 없었음).
    // 이제 세 원소 모두 전용 배너 + 화면 플래시(status-fx)를 띄워, 매 시전마다
    // "이번엔 무슨 원소가 걸렸는지"가 한눈에 보이도록 했다.
    let elementMsg = '';
    if(s.type==='magic' && key!=='mageTripleElement' && player.skills && player.skills.includes('mastery_elementpact')){
      const roll = ['fire','ice','lightning'][Math.floor(Math.random()*3)];
      if(roll==='fire'){
        playBanner('🔥 화염 계약!', 'pact-fire');
        playStatusFx('burn');
        Sound.magic();
        if(!s.dot && !s.dots){
          applyDot({type:'burn', basis:'mag', ratio:0.3, turns:3, label:'원소 계약: 화염'});
          elementMsg = ' 화염과 계약해 화상을 남겼다!';
        } else {
          elementMsg = ' 화염과 계약했지만, 이미 타오르고 있어 화상은 더해지지 않았다.';
        }
      } else if(roll==='ice'){
        dmg = Math.round(dmg*1.15);
        playBanner('❄ 빙결 계약!', 'pact-ice');
        playStatusFx('pact-ice');
        Sound.magic();
        elementMsg = ' 빙결과 계약해 위력이 15% 올랐다!';
      } else if(roll==='lightning'){
        const pierced = Math.round(defMitigation*0.3);
        dmg = dmg + pierced;
        playBanner('⚡ 번개 계약!', 'pact-lightning');
        playStatusFx('pact-lightning');
        Sound.magic();
        elementMsg = ` 번개와 계약해 방어를 ${pierced}만큼 꿰뚫었다!`;
      }
    }
    // 삼원소 연격(mageTripleElement, 레벨12): 마스터리의 무작위 롤과 무관하게,
    // 이 스킬 자체는 빙결(+15%)과 번개(방어 관통) 효과를 확률 없이 항상 함께
    // 발동시킨다(화염=화상은 s.dot 필드로 범용 파이프라인이 이미 자동 처리한다 —
    // applySkillDots(s) 호출부 참고). 위에서 mastery_elementpact의 무작위 롤은
    // 이 스킬에 한해 건너뛰도록 이미 막아뒀다(중복 발동 방지).
    let tripleElementMsg = '';
    if(key==='mageTripleElement'){
      dmg = Math.round(dmg*1.15);
      const pierced2 = Math.round(defMitigation*0.3);
      dmg = dmg + pierced2;
      playBanner('🔥❄⚡ 삼원소 연격!', 'pact-lightning');
      playStatusFx('pact-ice');
      tripleElementMsg = ` 빙결로 위력이 15% 오르고, 번개로 방어를 ${pierced2}만큼 꿰뚫었다!`;
    }
    // 성좌의 가호(pa_knight_b, 회랑의 기사 방어구 각인 — 택1 B안): 안정적으로
    // 버티는 방향. 이 스킬 자체의 즉발 피해는 10% 줄어드는 대신, 흡혈이
    // 2배가 되고(아래 lifesteal 처리부에서 추가 회복으로 반영) 적중 시
    // 2턴간 받는 피해가 10% 줄어드는 배리어가 추가로 걸린다.
    let knightBMsg = '';
    let knightBExtraLifesteal = 0;
    if(key==='paladinHolyRend'){
      const aIdKB = player.equipment && player.equipment.armor;
      if(aIdKB && typeof getEnhancementsFor==='function' && getEnhancementsFor(aIdKB).includes('pa_knight_b')){
        dmg = Math.round(dmg*0.9);
        knightBExtraLifesteal = s.lifesteal||0;
        player.buffDefTurns = Math.max(player.buffDefTurns||0, 2);
        player.buffDefMult = Math.min(player.buffDefMult||1, 0.9);
        knightBMsg = ' 성좌의 가호가 몸을 감싸 2턴간 받는 피해가 줄어든다.';
      }
    }
    // 혈서(mastery_bloodpact)가 켜져 있으면, 스킬을 쓸 때마다 HP를 태워 위력을
    // 증폭시킨다. 사용자 요청으로 "한 번 쓰면 자동으로 꺼지는" 기존 방식에서
    // "직접 끌 때까지(또는 전투가 끝날 때까지) 계속 유지"되는 방식으로 바뀌었다
    // — 그래서 여기서 더 이상 player.bloodPactArmed를 false로 되돌리지 않는다.
    // 켜둔 채로 스킬을 반복 사용하면 매번 HP가 깎이므로 체력 관리가 중요해진다.
    let bloodPactMsg = '';
    if(player.bloodPactArmed){
      const hpCost = Math.max(1, Math.round(player.hp*0.15));
      if(player.hp > hpCost){
        player.hp -= hpCost;
        dmg = Math.round(dmg*1.5);
        bloodPactMsg = ` 혈서의 힘으로 HP ${hpCost}을(를) 태워 위력이 크게 증폭됐다!`;
      }
    }
    // 희생의 맹세(mastery_martyrvow): 성기사의 액티브 스킬(심판의 빛)을 사용할 때만
    // 발동한다(혈서와 달리 모든 스킬이 아니라 "특정 스킬"에 한정 — JOB_SPECIALIZATIONS
    // 설명 그대로). 최대HP를 영구히 깎는 대신 공격력을 영구히 올린다.
    let martyrVowMsg = '';
    let instantMartyrTriggered = false;
    if(key==='paladinJudgmentLight' && player.martyrVowArmed){
      const hpLoss = Math.max(1, Math.round(player.maxhp*0.08));
      if(player.maxhp > hpLoss + 10){
        player.maxhp -= hpLoss;
        player.hp = Math.min(player.hp, player.maxhp);
        player.atk += 3;
        // 순교자 레벨12/15 신규 스킬(순교자의 인장/불멸의 순교)이 참조하는
        // 누적 희생 횟수. 이 마스터리가 실제로 발동한 순간에만 늘어난다.
        player.martyrSacrificeCount = (player.martyrSacrificeCount||0) + 1;
        martyrVowMsg = ` 순교자의 맹세로 최대HP ${hpLoss}을(를) 영구히 바쳐 공격력이 영구히 3 올랐다!`;
        instantMartyrTriggered = true;
      }
      player.martyrVowArmed = false;
    }
    // 즉각 순교 각인(pa_instantmartyr, 순교자 무기 각인 — 사용자 요청): 희생의
    // 맹세가 실제로 발동하면 이번 심판의 빛 피해(→흡혈도 비례해 함께 상승)가
    // +50%. 발동하지 않았다면(안 켰거나 조건 미달로 무산) 오히려 -10%.
    if(key==='paladinJudgmentLight'){
      const wIdIM = player.equipment && player.equipment.weapon;
      const hasInstantMartyr = !!(wIdIM && typeof getEnhancementsFor==='function' && getEnhancementsFor(wIdIM).includes('pa_instantmartyr'));
      if(hasInstantMartyr){
        if(instantMartyrTriggered){
          dmg = Math.round(dmg*1.5);
          martyrVowMsg += ' 즉각 순교 각인이 위력을 크게 증폭시켰다!';
        } else {
          dmg = Math.round(dmg*0.9);
        }
      }
    }
    // 응징의 일격(retributionoath, 레벨5 성기사 — 사용자 요청으로 "3턴간
    // 피격시 반격" 리액티브 버프에서 즉발 딜 스킬로 리뉴얼, A안). 잃은 HP
    // 비율이 클수록 위력이 늘어난다(최대 +80%) — "고통받을수록 되갚아준다"는
    // 기존 응징의 맹세 컨셉을 반격 방식 대신 즉발딜 방식으로 옮겨 유지했다.
    let retributionMsg = '';
    if(key==='retributionoath'){
      const missingRatio = 1 - (player.hp/player.maxhp);
      const bonus = missingRatio*(s.maxBonusMult||0.8);
      if(bonus>0.001){
        dmg = Math.round(dmg*(1+bonus));
        retributionMsg = ` 쌓인 고통을 그대로 되갚아 위력이 ${Math.round(bonus*100)}% 더 늘어났다!`;
      }
    }
    // 칼리버 X: 종언(paladinCaliberXFinale, 레벨15 궁극기, 회랑의 기사): 사용하는
    // 순간 전투가 끝날 때까지 남는 회복 감소 저주를 건다(battleFlags.knightHealCurse
    // — playerItem()의 물약 회복량 계산에서 확인해 절반으로 줄인다). "검이 대가를
    // 요구한다"는 컨셉을 한 번의 자기 HP 소모로 끝내지 않고 이후 회복 전체에
    // 그림자를 드리우는 방식으로 표현했다.
    if(key==='paladinCaliberXFinale' && battleFlags){
      battleFlags.knightHealCurse = true;
    }
    // 종언을 넘어서(pa_transcend, 회랑의 기사 장신구 각인 — 사용자 요청):
    // "처치 시" 조건은 1:1 전투 구조상 성립이 안 돼(순교자/전사와 동일한
    // 이유) "최대HP 30% 이상 피해"로 고쳐서 적용한다. 조건 충족 시 반동
    // HP와 쿨다운을 즉시 되돌린다.
    let transcendMsg = '';
    if(key==='paladinCaliberXFinale'){
      const cIdTr = player.equipment && player.equipment.accessory;
      if(cIdTr && typeof getEnhancementsFor==='function' && getEnhancementsFor(cIdTr).includes('pa_transcend')){
        if(enemy.hp>0 && dmg >= Math.round(enemy.maxhp*0.3)){
          if(hpSacActualCost>0) player.hp = Math.min(player.maxhp, player.hp + hpSacActualCost);
          if(battleFlags.skillCooldowns) battleFlags.skillCooldowns[key] = 0;
          transcendMsg = ' 종언을 넘어서는 각인이 대가를 되돌리고 쿨다운을 초기화했다!';
        }
      }
    }
    // 번개계약 파동(mageElementWave)이 남긴 "다음 공격 확정 치명타" 소모(범용
    // phys/magic 분기 전체에 적용 — 기본 공격은 위 playerAttack()에서 별도 처리).
    let lightningCritMsg2 = '';
    if(player.lightningCritArmed){
      dmg = Math.round(dmg*1.6);
      lightningCritMsg2 = ' 벼려둔 번개의 기운이 급소를 정확히 꿰뚫었다!';
      player.lightningCritArmed = false;
    }
    // 은신(stealth)이 걸어둔 "다음 공격 피해 +30%" 소모(범용 phys/magic 분기).
    let stealthDmgMsg2 = '';
    if(player.stealthDmgBonusArmed){
      dmg = Math.round(dmg*1.3);
      stealthDmgMsg2 = ' 은신에서 벗어나며 가한 일격의 위력이 크게 올랐다!';
      player.stealthDmgBonusArmed = false;
    }
    // 역병의 확인사살(rogue_alchemist, 사용자 피드백 — "암살이 역병숙주의
    // 정체성과 따로 노는 느낌") — 역병숙주가 "암살"(공용 도적 베이스 스킬,
    // 환영도적과 공유)을 쓰면 적의 잠식 스택 1개당 추가 피해 +8%(스택 소모
    // 없음, 최대 10스택 +80%). 체액 흡수로 스택을 쌓아둘수록 암살의 한 방도
    // 같이 강해지도록 연결해, 역병 축적이 곧 암살 딜의 근거가 되게 만든다.
    // 환영도적(rogue_phantom)의 암살 수치는 전혀 건드리지 않는다.
    let plagueExecuteMsg2 = '';
    if(key==='assassinate' && player.specialization==='rogue_alchemist' && (enemy.venomStacks||0)>0){
      const plagueBonus = Math.min(0.8, (enemy.venomStacks||0)*0.08);
      dmg = Math.round(dmg*(1+plagueBonus));
      plagueExecuteMsg2 = ' 잠식된 상처가 암살의 일격을 더욱 깊게 파고들었다!';
    }
    // 잔영(mastery_afterimage, 환영검사): 공격형 스킬(이 범용 phys/magic 분기에
    // 도달하는 모든 스킬)을 사용하면 확정적으로 분신이 예약된다. 어떤 스킬을 얼마의
    // 피해로 재현할지는 최종 dmg가 확정된 뒤 battleFlags.afterimageQueue에 기록하고,
    // 실제 재현은 적의 턴이 열리기 직전(combat/enemy-turn.js의
    // triggerAfterimageStrike())에 처리된다.
    const willQueueAfterimage = !!(player.skills && player.skills.includes('mastery_afterimage') && battleFlags && !battleFlags.afterimagePending);
    const onHitMult = consumeOnHitBonuses();
    dmg = applyOutgoingDamageMods(dmg, {type: s.type==='magic'?'magicskill':'physkill', mpCost, onHitMult});
    const mod = applySkillModifiers(dmg, s);
    dmg = mod.value;
    if(s.type==='phys') consumeAtkBuff();
    rogueRegisterHit(s.type==='phys');
    enemy.hp = Math.max(0, enemy.hp-dmg);
    updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, mod.triggered?'crit':undefined);
    if(s.type==='magic') Sound.magic(); else Sound.slash();
    // 연쇄 처형(we_chainexec, 혈맹의 검투사 무기 각인) / 불사의 광기
    // (we_madimmortal, 방어구 각인): 1:1 전투라 "처치하면 재발동"은 성립이
    // 안 돼서(처치=즉시 승리, 다음 적이 없음), 조건을 "최대HP의 30% 이상을
    // 이 한 방으로 깎았는가"로 바꿨다(사용자 확정).
    let chainExecMsg = '';
    let chainExecRetriggered = false;
    if(key==='warriorBloodpactActive' && !isRetry){
      const wIdCE = player.equipment && player.equipment.weapon;
      if(wIdCE && typeof getEnhancementsFor==='function' && getEnhancementsFor(wIdCE).includes('we_chainexec')){
        if(enemy.hp>0 && dmg >= Math.round(enemy.maxhp*0.3)){
          chainExecMsg = ' 처형의 기세를 몰아 즉시 다시 벤다!';
          chainExecRetriggered = true;
          setTimeout(()=>{ if(!battleOver) playerSkill(key, true); }, 550);
        } else {
          player.buffDefTurns = Math.max(player.buffDefTurns||0, 1);
          player.buffDefMult = Math.max(player.buffDefMult||1, 1.2);
          chainExecMsg = ' 크게 베지 못해 자세가 무너졌다(다음 턴 방어력 하락).';
        }
      }
    }
    // 역병 잠식(mastery_venomstacks, 역병숙주): 기본 공격뿐 아니라 이 범용 phys/magic
    // 분기를 타는 모든 스킬(백스탭/암살 등)도 독을 남긴다. 맹독 주입 자신은
    // 별도의 전용 타입('venominject')이라 이 훅을 타지 않는다 — 중복 없음.
    if(player.skills && player.skills.includes('mastery_venomstacks')){
      enemy.venomStacks = Math.min(getVenomStackCap(), (enemy.venomStacks||0)+1);
      updateStatusBadges();
    }
    let afterimageMsg2 = '';
    if(willQueueAfterimage){
      battleFlags.afterimagePending = true;
      // 분신 배가(rogueDoubleImage)가 예약되어 있으면, 잔영이 1번이 아니라
      // 2번(repeats:2) 재현되고 배율도 평소 50%가 아니라 더 강한 값
      // (player.doubleImageBoostRatio)으로 적용된다. 실제 재현 로직은
      // combat/enemy-turn.js의 triggerAfterimageStrike()에서 처리한다.
      const doubled = !!player.doubleImageArmed;
      battleFlags.afterimageQueue = {
        name: s.name, magic: s.type==='magic', multihit: false, hits: 1, totalDamage: dmg,
        ratio: doubled ? (player.doubleImageBoostRatio||0.65) : 0.5,
        repeats: doubled ? 2 : 1,
      };
      afterimageMsg2 = doubled
        ? ' 그림자 속에서 두 겹의 잔영이 어른거린다…'
        : ` 그림자 속에서 '${s.name}'의 잔영이 어른거린다…`;
      // 백귀야행(레벨15)이 소비할 "이번 전투 잔영 발동 누적 횟수"(최대 8 —
      // 애니메이션/수치가 지나치게 길어지는 것을 막기 위한 상한). 분신 배가가
      // 걸린 공격은 잔영이 실제로 2번 나타나는 것이므로 2씩 누적한다.
      battleFlags.afterimageTriggerCount = Math.min(8, (battleFlags.afterimageTriggerCount||0) + (doubled?2:1));
      if(doubled){
        consumeDoubleImageArmed();
        updatePlayerStatusBadges();
      }
    }
    let healed2 = 0;
    if(s.lifesteal){
      healed2 = Math.min(player.maxhp-player.hp, Math.round(dmg*s.lifesteal*epicLifestealMult()));
      player.hp = Math.min(player.maxhp, player.hp+healed2);
    }
    if(knightBExtraLifesteal>0){
      const extraHeal = Math.min(player.maxhp-player.hp, Math.round(dmg*knightBExtraLifesteal*epicLifestealMult()));
      player.hp = Math.min(player.maxhp, player.hp+extraHeal);
      healed2 += extraHeal;
    }
    healed2 += applyPassiveLifesteal(dmg);
    renderStatus();
    let msg2 = `${enemy.name}에게 ${dmg}의 피해를 입혔다.`;
    if(mod.triggered) msg2 = '약점을 정확히 노렸다! '+msg2;
    if(bloodPactMsg) msg2 += bloodPactMsg;
    if(martyrVowMsg) msg2 += martyrVowMsg;
    if(retributionMsg) msg2 += retributionMsg;
    if(knightBMsg) msg2 += knightBMsg;
    if(transcendMsg) msg2 += transcendMsg;
    if(lightningCritMsg2) msg2 += lightningCritMsg2;
    if(stealthDmgMsg2) msg2 += stealthDmgMsg2;
    if(plagueExecuteMsg2) msg2 += plagueExecuteMsg2;
    if(elementMsg) msg2 += elementMsg;
    if(tripleElementMsg) msg2 += tripleElementMsg;
    if(hpSacMsg) msg2 += hpSacMsg;
    if(afterimageMsg2) msg2 += afterimageMsg2;
    if(key==='warriorBloodpactUltimate'){
      const cIdBR = player.equipment && player.equipment.accessory;
      if(cIdBR && typeof getEnhancementsFor==='function' && getEnhancementsFor(cIdBR).includes('we_bloodrevive')){
        if(enemy.hp>0 && dmg >= Math.round(enemy.maxhp*0.3)){
          if(hpSacActualCost>0) player.hp = Math.min(player.maxhp, player.hp + hpSacActualCost);
          if(battleFlags.skillCooldowns) battleFlags.skillCooldowns[key] = 0;
          chainExecMsg += ' 부활하는 각인이 대가를 되돌리고 쿨다운을 초기화했다!';
        }
      }
    }
    if(chainExecMsg) msg2 += chainExecMsg;
    const dotLabels3 = applySkillDots(s);
    if(dotLabels3) msg2 += ` ${dotLabels3} 효과 부여!`;
    if(healed2>0){ msg2 += ` HP ${healed2} 흡수.`; }
    setBattleMsg(`${player.name}은(는) ${s.name}을(를) 시전했다!`, msg2);
    if(checkBattleEnd()) return;
    if(chainExecRetriggered) return; // 연쇄 처형 재발동 예약됨 — 적 턴 넘기지 않는다.
    enemyTurn();
  }

  function popDamageOnPlayerArea(text, cls){
    // simple feedback on enemy stage top for visibility (기본값은 기존 회복 연출과 동일)
    popDamage(text||'+HP', cls||'heal');
    playCastBurst(cls==='heal' || !cls ? 'heal' : undefined);
  }

  function playerItem(key){
    if(battleOver) return;
    if((player.inv[key]||0)<=0) return;
    // 공명 각인(we_resonance): 아이템을 쓰면 기본 공격 공명 체인이 끊긴다.
    player.lastBasicAtkDmg = 0;
    // 무한 가속 각인(me_infiniteaccel): 아이템을 써도 가속 주문 연쇄가 끊긴다.
    if(battleFlags) battleFlags.hasteCastCount = 0;
    // 저주술사(mastery_curseweaver)는 물약 봉인(굶주린 회랑)도 저주 개수만큼의
    // 확률로 뚫고 나올 수 있다. 외상 도박사(거액 대출)의 회복 봉인도 여기서
    // 함께 확인한다 — 서로 다른 시스템이지만 "물약을 못 마신다"는 결과는 같다.
    if(isCurseSealActive('potionLocked', '저주를 찢고 물약을 들이켰다!')){
      setBattleMsg('저주가 목을 조여온다…', '물약을 마실 수 없다!');
      return;
    }
    if(isDebtHealSealActive()){
      setBattleMsg('빚쟁이가 손목을 붙잡는다…', '빚 때문에 물약을 마실 수 없다!');
      return;
    }
    setCommandsEnabled(false);
    // 스킬 쿨타임(사용자 요청) — 아이템 사용도 한 턴을 소모한다.
    if(battleFlags) battleFlags.cooldownTickPending = true;
    // 은신 연속 사용 방지: 물약을 써도 쿨다운이 풀린다.
    if(battleFlags) battleFlags.stealthOnCooldown = false;
    // 계율(mastery_creed): '물약 금지' 계율 중이면 물약 사용이 위반이다.
    // '기본 공격 금지' 계율 중이면 물약 사용은 계율을 지킨 것이므로 스택이 오른다.
    let creedMsg = '';
    if(battleFlags && battleFlags.creed==='nopotion'){
      if(battleFlags.creedStacks>0) creedMsg = ' 계율을 어겼다! 쌓인 버프가 즉시 사라졌다.';
      battleFlags.creedStacks = 0;
    } else if(battleFlags && battleFlags.creed==='skillonly'){
      battleFlags.creedStacks = Math.min(5, (battleFlags.creedStacks||0)+1);
    }
    player.inv[key]-=1;
    let potBoost = Math.max(0.2, 1 + getRelicSum('potionEffMult'));
    // 칼리버 X: 종언(회랑의 기사)의 회복 감소 저주 — 사용 후 전투가 끝날 때까지
    // 물약 회복 효율이 절반으로 줄어든다.
    if(battleFlags && battleFlags.knightHealCurse) potBoost *= 0.5;
    // 소액 대출(외상 도박사)의 페널티 — 상환율만큼 완화되는 물약 효율 저하.
    potBoost *= getDebtorPotionMult();
    let msg='';
    if(key==='potion'){ const h=Math.round(40*potBoost); player.hp=Math.min(player.maxhp,player.hp+h); msg=`물약을 마셨다. HP ${h} 회복.`; }
    else if(key==='hipotion'){ const h=Math.round(110*potBoost); player.hp=Math.min(player.maxhp,player.hp+h); msg=`상급 물약을 마셨다. HP ${h} 회복.`; }
    else if(key==='ether'){ const m=Math.round(30*potBoost); player.mp=Math.min(player.maxmp,player.mp+m); msg=`에테르를 마셨다. MP ${m} 회복.`; }
    else if(key==='hiether'){ const m=Math.round(85*potBoost); player.mp=Math.min(player.maxmp,player.mp+m); msg=`상급 에테르를 마셨다. MP ${m} 회복.`; }
    if(hasRelicFlag('flaskPotionBoost') && battleFlags){
      battleFlags.flaskStacks = Math.min(3, (battleFlags.flaskStacks||0)+1);
      msg += ` (다음 공격 피해 +${battleFlags.flaskStacks*20}%)`;
    }
    if(creedMsg) msg += creedMsg;
    renderStatus();
    popDamage('+','heal');
    Sound.potion();
    setBattleMsg(`${player.name}은(는) 아이템을 사용했다.`, msg);
    if(checkBattleEnd()) return;
    enemyTurn();
  }

  function playerRun(){
    if(battleOver) return;
    setCommandsEnabled(false);
    const chance = Math.min(0.95, Math.max(0.2, 0.5 + (player.spd-enemy.spd)*0.03));
    if(Math.random() < chance){
      battleOver = true;
      revertDiceDelta();
      // 버그 수정(사용자 제보) — 승리/사망 4곳에는 이미 있던 clearOneBattleBuffs()
      // 호출이 도망치기 성공 경로에만 빠져있었다. 버프 스킬을 쓰고 자연 소멸
      // 전에 도망치면 다음 전투로 그대로 넘어가던 원인이 이거였다.
      if(typeof clearOneBattleBuffs==='function') clearOneBattleBuffs();
      // 버그 수정: 노드맵 도입 이전의 낡은 로직(depth를 직접 1 깎는 방식)이
      // 그대로 남아있었다. 특히 보스 노드(지도의 마지막 행)에서 도망치면
      // player.nodeRow는 마지막 행에 그대로 머무는데 "다음 행"이 아예 없어서,
      // 지도에서 클릭 가능한 노드가 하나도 안 남는 버그가 있었다(쉬움 난이도
      // 보스 도망 시 100% 재현). depth를 건드리는 대신, 노드맵 진행 상태를
      // "이 노드를 고르기 전"으로 되돌린다 — 방금 도망친 노드(보스든 일반
      // 전투든)가 다시 선택 가능하게 나타난다.
      let ledgerMsg = '';
      if(hasRelicFlag('killAtkStack') && player.ledgerStack>0){
        player.atk = Math.max(1, player.atk - player.ledgerStack);
        player.ledgerStack = 0;
        ledgerMsg = ' 망자의 장부에 쌓인 힘이 모래처럼 흩어졌다.';
      }
      if(player.nodeMap && player.nodeRow >= 0){
        player.nodeRow -= 1;
        if(player.nodeVisited && player.nodeVisited.length) player.nodeVisited.pop();
        player.nodeCurrentId = player.nodeRow>=0 ? (player.nodeVisited[player.nodeVisited.length-1] || null) : null;
      }
      setBattleMsg('도망쳤다!', '');
      setTimeout(()=>{
        showScreen('explore');
        renderExplore([{text:'황급히 뒤로 물러나 몸을 피했다.'+ledgerMsg, cls:'warn'}]);
        renderStatus();
        saveGame();
      }, 700);
    } else {
      setBattleMsg('도망칠 수 없었다!', '');
      enemyTurn();
    }
  }

  // 패의 마술사 공용 헬퍼: battleFlags.cardHand(최대 3장)를 검사해 트리플(3장 모두
  // 동일) > 페어(2장 이상 동일) > 스트레이트(3장이 연속된 숫자) 순으로 완성 여부를
  // 판정한다. 완성되면 즉시 추가 피해를 입히고 손을 비운 뒤 {label, dmg}를 반환하고,
  // 아니면 null을 반환한다. mastery_drawcard 훅과 cardexchange 액티브 양쪽에서 공유한다.
  function resolveCardCombo(){
    const hand = battleFlags.cardHand||[];
    let comboMult = 0, comboLabel = '';
    if(hand.length===3 && hand[0]===hand[1] && hand[1]===hand[2]){
      comboMult = 2.2; comboLabel = '트리플';
    } else if(new Set(hand).size < hand.length){
      comboMult = 1.1; comboLabel = '페어';
    } else if(hand.length===3){
      const sorted = [...hand].sort((a,b)=>a-b);
      if(sorted[1]===sorted[0]+1 && sorted[2]===sorted[1]+1){
        comboMult = 1.6; comboLabel = '스트레이트';
      }
    }
    if(comboMult<=0) return null;
    const edefCard = getEffectiveEnemyDef(enemy.def);
    const dmg = Math.max(1, Math.round(effectiveAtk()*comboMult) - edefCard);
    enemy.hp = Math.max(0, enemy.hp - dmg);
    updateEnemyHpBar(); popDamage('-'+dmg, 'crit');
    Sound.coin();
    playBanner(`🃏 ${comboLabel}!`, 'crit');
    battleFlags.cardHand = [];
    return {label: comboLabel, dmg};
  }
