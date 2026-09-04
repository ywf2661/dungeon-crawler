"use strict";
/*
플레이어 턴 행동 4종 — 공격/스킬/아이템/도망.
export(전역): playerAttack, playerSkill, popDamageOnPlayerArea, playerItem, playerRun
의존성: state.js, data/skills.js(SKILLDB), relics.js, data/equipment.js, combat/battle-fx.js,
        combat/battle-end.js, combat/enemy-turn.js(적 턴 호출)
*/

  function playerAttack(){
    if(battleOver) return;
    setCommandsEnabled(false);
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
    let dmg = Math.max(1, effectiveAtk() + Math.floor(Math.random()*4)-1 - edef);
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
    // 독 중첩(mastery_venomstacks, 독사): 기본 공격도 독을 남긴다(사용자 요청 —
    // "도적의 기본공격, 기본스킬에도 독이 묻었으면"). 맹독 주입 자신의 전용
    // 보너스(+1 또는 +3)와는 별개로, 이 범용 훅은 모든 공격 행동에 공통으로
    // +1만 준다.
    if(player.skills && player.skills.includes('mastery_venomstacks')){
      enemy.venomStacks = Math.min(10, (enemy.venomStacks||0)+1);
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

  // 메카닉 - 폭주 화부/축압 기술자 공용 헬퍼: 압력 상한을 마스터리에 따라 계산.
  // mastery_overheat(폭주 화부)이 있으면 150, 그 외(축압 기술자 포함 기본값)는 100.
  function getPressureCap(){
    return (player.skills && player.skills.includes('mastery_overheat')) ? 150 : 100;
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
    const selfDmg = Math.round(overflow*1.5);
    player.hp = Math.max(1, player.hp-selfDmg);
    if(player.skills.includes('mechanicHeatResist') && battleFlags){
      battleFlags.overheatDodgeStacks = Math.min(10, (battleFlags.overheatDodgeStacks||0)+2);
    }
    renderStatus();
  }

  // 불운의 채권자(mastery_luckdebt, 도박사 2차): 운 스킬이 실패할 때마다
  // battleFlags.jesterDebtStacks를 쌓는다(최대 5, 전투 중 유지). 1차 스킬
  // 로직 자체는 건드리지 않고 각 실패 분기에서 호출만 하는 훅이다.
  function addLuckDebtStack(){
    if(!(player.skills && player.skills.includes('mastery_luckdebt'))) return;
    if(!battleFlags) return;
    battleFlags.jesterDebtStacks = Math.min(5, (battleFlags.jesterDebtStacks||0)+1);
    if(typeof updatePlayerStatusBadges==='function') updatePlayerStatusBadges();
  }

  function playerSkill(key){
    if(battleOver) return;
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
    const mpCostMult = (mbb && mbb.type==='mpcost' && mbb.battlesLeft>0) ? (1-mbb.value) : 1;
    const mpCost = Math.max(0, Math.round(s.mp*mpCostMult));
    if(player.mp < mpCost) return;
    // 스킬 쿨타임(사용자 요청 — 1차 직업 궁극기 로테이션 개선). 쿨타임이 남아
    // 있으면 MP가 충분해도 사용할 수 없다(스킬 메뉴에서도 비활성화되지만
    // 방어적으로 한 번 더 막는다).
    if(s.cooldown && battleFlags && battleFlags.skillCooldowns && battleFlags.skillCooldowns[key]>0) return;
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
    if(freeCast){
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
      // 맹독 주입(rogueVenomInject, 레벨10 액티브, 맹독 연금술사): 피해를 입히는
      // 동시에 독 스택(enemy.venomStacks, 최대 10)을 쌓는 유일한 수단이다. 레벨15
      // 패시브(rogueVenomTriple)를 배웠으면 1이 아니라 3씩 쌓인다. 실제 매 라운드
      // 독 피해 처리는 combat/enemy-turn.js의 enemyTurnReal()에서 스택 수 기준으로
      // 매번 새로 계산한다(이 스킬은 스택을 "쌓기"만 하고 직접 틱 피해를 주지 않음).
      const edefVenom = getEffectiveEnemyDef(enemy.def);
      const onHitMultVenom = consumeOnHitBonuses();
      let venomDmg = Math.max(1, effectiveAtk() + Math.floor(Math.random()*4)-1 - Math.round(edefVenom*0.9));
      venomDmg = applyOutgoingDamageMods(venomDmg, {type:'physkill', mpCost, onHitMult:onHitMultVenom});
      enemy.hp = Math.max(0, enemy.hp-venomDmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+venomDmg);
      Sound.slash(); playStatusFx('poison');
      rogueRegisterHit(true);
      const venomGain = (player.skills && player.skills.includes('rogueVenomTriple')) ? 3 : 1;
      enemy.venomStacks = Math.min(10, (enemy.venomStacks||0)+venomGain);
      updateStatusBadges();
      renderStatus();
      setBattleMsg(`${player.name}의 ${s.name}!`, `${enemy.name}에게 ${venomDmg}의 피해를 입히고 맹독을 주입했다! (독중첩 ${enemy.venomStacks}/10)`);
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
      const comboMult = s.comboCostMult || 1.8;
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
      let hasteDmg = Math.max(1, Math.round(player.mag*s.mult) - Math.round(edefHaste*0.5));
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
      let markDmg = Math.max(1, Math.round(player.mag*s.mult) - Math.round(edefMark*0.5));
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
      let reapDmg = Math.max(1, Math.round(player.mag*reapMult) - edefReap);
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
      // 코드가 필요 없다(맹독 연금술사의 독 중첩과 달리, 이건 일반 도트라
      // 턴이 다 되면 자연히 사라진다 — 전투 끝까지 지속되는 게 아님).
      const curses = (typeof getCurseCount === 'function') ? getCurseCount() : 0;
      const edefBrand = getEffectiveEnemyDef(enemy.def);
      const onHitMultBrand = consumeOnHitBonuses();
      let brandDmg = Math.max(1, Math.round(player.mag*s.mult) - Math.round(edefBrand*0.5));
      if(curses>0) brandDmg = Math.round(brandDmg*(1+curses*s.curseCountBonus));
      brandDmg = applyOutgoingDamageMods(brandDmg, {type:'magicskill', mpCost, onHitMult:onHitMultBrand});
      enemy.hp = Math.max(0, enemy.hp-brandDmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+brandDmg, curses>0?'crit':undefined);
      Sound.magic(); playStatusFx('poison');
      const dotRatio = (s.dotBaseRatio||0.25) + curses*(s.dotRatioPerCurse||0.08);
      applyDot({type:'poison', basis:'mag', ratio:dotRatio, turns:s.dotTurns||4, label:'저주 각인'});
      renderStatus();
      const brandMsg = curses>0
        ? `짊어진 저주(${curses}개)의 힘으로 낙인이 짙게 새겨졌다! ${enemy.name}에게 ${brandDmg}의 피해를 입히고 강한 저주를 남겼다.`
        : `${enemy.name}에게 ${brandDmg}의 피해를 입히고 저주를 남겼다.`;
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
      const curses = (typeof getCurseCount === 'function') ? getCurseCount() : 0;
      const edefBloom = getEffectiveEnemyDef(enemy.def);
      const onHitMultBloom = consumeOnHitBonuses();
      let bloomDmg = Math.max(1, Math.round(player.mag*s.baseMult) - edefBloom);
      bloomDmg = Math.round(bloomDmg*(1+curses*s.curseCountBonus));
      const curseDot = (enemy.dots||[]).find(d=>d.type==='poison' && d.turns>0);
      let detonateMsg = '';
      if(curseDot){
        const detonateBonus = Math.max(1, curseDot.dmgPerTurn * curseDot.turns);
        bloomDmg += detonateBonus;
        enemy.dots = enemy.dots.filter(d=>d!==curseDot);
        updateStatusBadges();
        detonateMsg = ' 새겨져 있던 저주까지 한꺼번에 만개시켰다!';
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
      const dmgPerTick = Math.max(1, Math.round(player.mag*role.rigMult));
      const newRig = {kind:role.kind, name:`역할 로봇(${role.label})`, turnsLeft: s.rigTurns, dmgPerTick, shieldPct: role.shieldPct||0};
      let slotMsg;
      if(!battleFlags.rig || battleFlags.rig.turnsLeft<=0){
        battleFlags.rig = newRig; slotMsg = '로봇을 새로 배치했다.';
      } else if(!battleFlags.rig2 || battleFlags.rig2.turnsLeft<=0){
        battleFlags.rig2 = newRig; slotMsg = '두 번째 로봇을 배치했다.';
      } else {
        battleFlags.rig = newRig; slotMsg = '이미 2기가 있어 가장 먼저 배치된 로봇을 교체했다.';
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
      Sound.magic();
      renderStatus();
      updateRigVisuals();
      let msg2 = `${role.label} 역할의 로봇을 배치했다! 첫 사격으로 ${dmg}의 피해를 입혔다. ${slotMsg}`;
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
      let totalDmg = Math.max(1, Math.round(player.mag*(s.baseMult+dmgBonusPct)) - edefFF);
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
      const slots = ['rig','rig2','omegaRig'];
      let extendedNames = [];
      slots.forEach(key=>{
        const r = battleFlags[key];
        if(r && r.turnsLeft>0){
          r.turnsLeft += s.extendTurns;
          extendedNames.push(r.name);
        }
      });
      renderStatus();
      updateRigVisuals();
      const msgM = extendedNames.length>0
        ? `${extendedNames.join(', ')}의 가동 시간을 ${s.extendTurns}턴 늘렸다.`
        : '가동 중인 로봇이 없어 정비할 대상이 없었다.';
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
      battleFlags.legionCommandTurns = s.buffTurns;
      battleFlags.legionCommandMult = s.buffMult;
      renderStatus();
      setBattleMsg(`${player.name}의 ${s.name}!`, `${s.buffTurns}턴간 모든 로봇의 사격 위력이 ${Math.round(s.buffMult*100)}% 늘어난다.`);
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
      const dmgPerTick = Math.max(1, Math.round(player.mag*tickMult));
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
      let dmg = Math.max(1, Math.round(player.mag*s.mult) - Math.round(edef*0.5));
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
          const pressureBonus = targetRig.pressureScaled ? Math.round(player.mag*(battleFlags.pressure||0)*targetRig.pressureScaleRate) : 0;
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
        let dmg = Math.max(1, Math.round(player.mag*pressure*s.dmgPerPressure*(1+markBonus)) - Math.round(edefV*0.5));
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
      const dmgPerTick = Math.max(1, Math.round(player.mag*s.rigMult));
      // 강철 군단장(mechanic_accumulator 리뉴얼)은 압력 게이지가 아예 없다.
      // 같은 스킬(mechanicOverpressure)을 재사용하되, 이 특성이면 오메가를
      // battleFlags.omegaRig 전용 고정 슬롯에 배치하고 압력 관련 처리를
      // 전부 건너뛴다. 다른 특성(폭주 화부 등)은 기존 동작 그대로 유지된다.
      const isLegion = player.specialization==='mechanic_accumulator';
      const newOmegaRig = {kind:s.rigKind, name:s.rigName, turnsLeft:s.rigTurns, dmgPerTick, shieldPct:s.shieldPct||0, pressurePerTick: isLegion?0:(s.rigPressurePerTick||0)};
      if(isLegion){ battleFlags.omegaRig = newOmegaRig; } else { battleFlags.rig = newOmegaRig; }
      updateRigVisuals();
      const markBonus = (enemy.markedTurns>0) ? (enemy.markBonus||0.25) : 0;
      let dmg;
      if(isLegion){
        dmg = Math.max(1, Math.round(player.mag*s.mult*(1+markBonus)) - Math.round(edefU*0.5));
      } else {
        battleFlags.pressure = 100;
        dmg = Math.max(1, Math.round(player.mag*(s.mult + 100*s.dmgPerPressure)*(1+markBonus)) - Math.round(edefU*0.5));
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
        burstDmg = Math.max(1, Math.round(player.mag*s.burstMult) - Math.round(edefB*0.5));
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
      let dmg = Math.max(1, Math.round(player.mag*pressure*effRate) - Math.round(edefS*0.5));
      dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost});
      enemy.hp = Math.max(0, enemy.hp-dmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
      Sound.magic();
      battleFlags.pressure = Math.min(getPressureCap(), pressure + s.pressureGainOnUse);
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
      let dmg = Math.max(1, Math.round(player.mag*pressureCO*s.dmgPerPressure) - Math.round(edefCO*0.5));
      dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, pressureConsumed: pressureCO});
      enemy.hp = Math.max(0, enemy.hp-dmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg,'crit');
      Sound.bomb();
      const recoil = Math.round(player.maxhp*s.recoilHpCostPct);
      player.hp = Math.max(1, player.hp-recoil);
      battleFlags.pressure = 0;
      if(typeof updatePressureGauge==='function') updatePressureGauge();
      renderStatus();
      setBattleMsg(`${player.name}의 ${s.name}!`, `압력 ${pressureCO} 전체를 쏟아부어 ${dmg}의 대폭발을 일으켰다! 반동으로 HP ${recoil}을(를) 잃었다.`);
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
          battleFlags.rig = {kind:'turret', name: s.redeployRigName||'자동 포탑', turnsLeft: s.redeployRigTurns||3, dmgPerTick: Math.max(1, Math.round(player.mag*(s.redeployRigMult||0.85)))};
          msg2 += ` ${battleFlags.rig.name}이(가) 즉시 재전개된다!`;
        } else if(epicSetTier('mechanic')>=3){
          // 종말기계 Mk.Ω(에픽 3세트) 재전개는 이제 평범한 '자동 포탑'이 아니라
          // 세트 이름 그대로 '오메가 유닛'(kind:'omega')으로 나온다 — 좌우로
          // 긴 이중 포신 비주얼이 전용으로 뜬다(combat/battle-fx.js의
          // updateRigVisuals(), data/monster-visuals.js의 svgRig('omega') 참고).
          battleFlags.rig = {kind:'omega', name:'오메가 유닛', turnsLeft:3, dmgPerTick: Math.max(1, Math.round(player.mag*0.85*1.2))};
          msg2 += ' 종말기계의 힘으로 오메가 유닛이 즉시 재전개된다!';
        }
      } else {
        dmg = Math.max(1, Math.round(player.mag*s.noRigMult) - Math.round(edef*0.5));
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
      const hpCost = Math.max(1, Math.round(player.maxhp*s.hpCostPct));
      let costMsg = '';
      if(player.hp > hpCost){
        player.hp -= hpCost;
        costMsg = ` 생명력 ${hpCost}을(를) 바쳤다.`;
      }
      const atkAdd = Math.max(1, Math.round(player.atk*s.atkBonus));
      const defSub = Math.max(0, Math.round(player.def*s.defPenaltyPct));
      player.atk += atkAdd;
      player.def -= defSub;
      player.knightVulnTurns = s.turns;
      player.knightVulnAtkBonus = atkAdd;
      player.knightVulnDefPenalty = defSub;
      renderStatus();
      playCastBurst();
      Sound.buff();
      setBattleMsg('"...기도를 올렸다."', `"...무언가가 응답했다."${costMsg} ${s.turns}턴간 공격력이 크게 오르지만, 방어가 허술해진다.`);
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
      const heal = Math.round(player.maxhp*s.mult*0.6 + player.mag*0.5);
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
      const magicBased = !!s.magic;
      const atkBase = magicBased ? player.mag : effectiveAtk();
      const edef = getEffectiveEnemyDef(enemy.def);
      const defFactor = magicBased ? Math.round(edef*0.5) : edef;
      const rawParts = [];
      for(let i=0;i<s.hits;i++){
        rawParts.push(Math.max(1, Math.round(atkBase*s.mult) - defFactor + Math.floor(Math.random()*3)-1));
      }
      const baseRawTotal = rawParts.reduce((a,b)=>a+b,0);
      const onHitMult = consumeOnHitBonuses();
      let boostedTotal = applyOutgoingDamageMods(baseRawTotal, {type: magicBased?'magicskill':'physkill', mpCost, onHitMult});
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
      // 독 중첩(mastery_venomstacks, 독사): 연속 공격형 스킬(두번베기/그림자
      // 쇄도 등)도 독을 남긴다. 여러 타를 때려도 이 스킬 사용 1회당 +1만
      // 준다(개별 타격마다 주면 스택이 지나치게 빨리 차오르기 때문).
      if(player.skills && player.skills.includes('mastery_venomstacks')){
        enemy.venomStacks = Math.min(10, (enemy.venomStacks||0)+1);
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
          player.doubleImageArmed = false;
          player.doubleImageBoostRatio = 0;
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
      let collapseDmg = Math.max(1, Math.round(player.mag*s.baseMult) + Math.round(dotPotential*s.dotMult) - edefCollapse);
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
      // 원소 각인(mageElementStrike, 레벨10 액티브): 계약한 원소에 따라 완전히
      // 다르게 동작한다. 화염=화상 부여+중간 피해, 빙결=방어 무시 없는 고배율
      // 단일 강타, 번개=2연속 타격(관통은 약함). 미계약 시 위력이 눈에 띄게
      // 약하다(먼저 계약하도록 유도).
      const pact = battleFlags.elementPact;
      const edef = getEffectiveEnemyDef(enemy.def);
      const onHitMult = consumeOnHitBonuses();
      let msg2 = '';
      if(pact==='fire'){
        let dmg = Math.max(1, Math.round(player.mag*1.5) - Math.round(edef*0.5));
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
        Sound.magic(); playStatusFx('burn');
        applyDot({type:'burn', basis:'mag', ratio:0.5, turns:3, label:'원소 각인: 화염'});
        msg2 = `화염 각인이 ${enemy.name}에게 ${dmg}의 피해를 입히고 짙은 화상을 남겼다!`;
      } else if(pact==='ice'){
        let dmg = Math.max(1, Math.round(player.mag*2.6) - edef);
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, 'crit');
        Sound.magic(); playStatusFx('pact-ice');
        msg2 = `빙결 각인이 ${enemy.name}에게 ${dmg}의 강력한 피해를 입혔다!`;
      } else if(pact==='lightning'){
        const per = Math.max(1, Math.round(player.mag*1.0) - Math.round(edef*0.85));
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
        let dmg = Math.max(1, Math.round(player.mag*1.1) - Math.round(edef*0.5));
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
        Sound.magic();
        msg2 = `계약 없이 평범한 마력탄을 날려 ${dmg}의 피해를 입혔다. (원소와 계약하면 훨씬 강력해진다)`;
      }
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
          let dmg = Math.max(1, Math.round(player.mag*1.0) - Math.round(edef*0.5));
          dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
          enemy.hp = Math.max(0, enemy.hp-dmg);
          updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
          Sound.magic();
          msg2 = `타오르는 화상이 없어 터뜨릴 것이 없다. 대신 ${dmg}의 피해를 입혔다.`;
        }
      } else if(pact==='ice'){
        let dmg = Math.max(1, Math.round(player.mag*0.8) - Math.round(edef*0.5));
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
        Sound.magic(); playStatusFx('pact-ice');
        player.buffDefTurns = 2; player.buffDefMult = 0.7;
        msg2 = `얼음 장벽을 두르며 ${dmg}의 피해를 입혔다. 2턴간 받는 피해가 줄어든다.`;
      } else if(pact==='lightning'){
        let dmg = Math.max(1, Math.round(player.mag*0.9) - Math.round(edef*0.6));
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
        Sound.magic(); playStatusFx('pact-lightning');
        player.lightningCritArmed = true;
        msg2 = `번개의 기운을 벼려 ${dmg}의 피해를 입혔다. 다음 공격은 반드시 급소에 꽂힌다.`;
      } else {
        let dmg = Math.max(1, Math.round(player.mag*0.9) - Math.round(edef*0.5));
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
        Sound.magic();
        msg2 = `계약 없이 평범한 파동을 날려 ${dmg}의 피해를 입혔다.`;
      }
      renderStatus();
      setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    if(s.type==='elementstorm'){
      // 원소 폭풍(mageElementStorm, 레벨15 궁극기): 화염=초강력 화상+큰 피해,
      // 빙결=방어 완전 무시 초고배율 강타, 번개=3연속 타격(관통 있음). 미계약
      // 시에도 여전히 약하다(궁극기까지 계약 없이 쓰는 것을 강하게 억제).
      const pact = battleFlags.elementPact;
      const edef = getEffectiveEnemyDef(enemy.def);
      const onHitMult = consumeOnHitBonuses();
      let msg2 = '';
      if(pact==='fire'){
        let dmg = Math.max(1, Math.round(player.mag*2.4) - Math.round(edef*0.5));
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, 'crit');
        Sound.magic(); playStatusFx('burn');
        applyDot({type:'burn', basis:'mag', ratio:0.7, turns:4, label:'원소 폭풍: 화염'});
        msg2 = `대화염이 ${enemy.name}을(를) 집어삼켜 ${dmg}의 피해를 입히고 격렬한 화상을 남겼다!`;
      } else if(pact==='ice'){
        let dmg = Math.max(1, Math.round(player.mag*3.2)); // 방어 완전 무시(edef 차감 없음)
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, 'crit');
        Sound.magic(); playStatusFx('pact-ice');
        msg2 = `절대영도의 빙결이 방어를 완전히 무시하고 ${enemy.name}에게 ${dmg}의 압도적인 피해를 입혔다!`;
      } else if(pact==='lightning'){
        const per = Math.max(1, Math.round(player.mag*1.1) - Math.round(edef*0.65));
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
        let dmg = Math.max(1, Math.round(player.mag*1.3) - Math.round(edef*0.5));
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
        enemy.hp = Math.max(0, enemy.hp-dmg);
        updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
        Sound.magic();
        msg2 = `계약 없이 궁극의 파동을 날려 ${dmg}의 피해를 입혔다. (원소와 계약했다면 훨씬 강력했을 것이다)`;
      }
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
      battleFlags.timeStacks = 0;
      updatePlayerStatusBadges();
      const mult = (s.baseMult||1.0) + (s.stackMult||0.6)*stacks;
      const edef = getEffectiveEnemyDef(enemy.def);
      const onHitMult = consumeOnHitBonuses();
      let dmg = Math.max(1, Math.round(player.mag*mult) - edef);
      dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost, onHitMult});
      enemy.hp = Math.max(0, enemy.hp-dmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, stacks>0?'crit':undefined);
      Sound.magic(); playCastBurst();
      renderStatus();
      const msg2 = stacks>0
        ? `쌓아온 시간 조각(${stacks}개)이 한꺼번에 무너지며 ${enemy.name}에게 ${dmg}의 압도적인 피해를 입혔다!`
        : `쌓인 시간 조각이 없어 기본 위력으로 ${enemy.name}에게 ${dmg}의 피해를 입혔다.`;
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
      battleFlags.afterimageTriggerCount = 0;
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
      const basisVal = atkBased ? effectiveAtk() : player.mag;
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
      const stake = Math.min(s.stakeCap||Infinity, Math.round((player.gold||0) * s.stakePct));

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

      player.gold -= stake;
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
        addLuckDebtStack();
        popDamage('빗나감!', 'miss');
        Sound.fail();
        playBanner('실패...', 'luckbad');
        renderStatus();
        setBattleMsg(`${player.name}의 ${s.name}!`, `승부에서 졌다... 판돈 ${stake}G를 그대로 잃었다. 완전히 빗나갔다.`);
      }
      if(checkBattleEnd()) return;
      enemyTurn();
      return;
    }

    // 황금 도박사 - 레벨12 "정보료": 골드를 지불해 다음 베팅/올인의 성공률과
    // 배율을 크게 끌어올린다(player.fateBoostChance/fateBoostMult를 세팅 —
    // goldbet 타입이 위에서 이미 이 필드를 소비하도록 되어 있어 신규 소비
    // 로직은 필요 없다).
    if(s.type==='goldinfofee'){
      const cost = Math.max(s.goldCostMin||0, Math.round((player.gold||0)*(s.goldCostPct||0.4)));
      if((player.gold||0) < cost){
        setCommandsEnabled(true);
        player.mp += mpCost;
        setBattleMsg('돈이 부족하다…', `정보료로 최소 ${cost}G가 필요하다. (현재 소지금 ${player.gold||0}G)`);
        return;
      }
      player.gold -= cost;
      player.fateBoostChance = s.chanceBonus||0.4;
      player.fateBoostMult = s.multBonus||0.5;
      renderStatus();
      playCastBurst();
      Sound.buff();
      setBattleMsg(`${player.name}의 ${s.name}!`, `정보상에게 ${cost}G를 찔러줬다. 다음 베팅의 성공률과 배율이 크게 오른다.`);
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
      const base = magicBased ? player.mag : effectiveAtk();
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
        addLuckDebtStack();
        epicLuckPost(false, epicLuck);
        popDamage('빗나감!', 'miss');
        Sound.fail();
        playBanner('실패...', 'luckbad');
        renderStatus();
        setBattleMsg(`${player.name}의 ${s.name}!`, '운이 따르지 않았다... 완전히 빗나갔다.');
      }
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
        addLuckDebtStack();
        epicLuckPost(false, epicLuck);
        popDamage('빗나감!', 'miss');
        Sound.fail();
        playBanner('허탕...', 'luckbad');
        renderStatus();
        setBattleMsg(`${player.name}의 ${s.name}!`, '컵을 잘못 짚었다... 완전히 허탕이다.');
        if(checkBattleEnd()) return;
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
      const roll = 1 + Math.floor(Math.random()*6);
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
        addLuckDebtStack();
        epicLuckPost(false, epicLuck);
        const selfDmg = epicLuck.wasArmed ? 0 : Math.min(player.hp-1, Math.max(6, Math.round(staked*(s.selfMult||2.2))));
        if(selfDmg>0) player.hp -= selfDmg;
        renderStatus();
        if(selfDmg>0) popDamageOnPlayerArea('-'+selfDmg, 'bleed');
        Sound.fail();
        playBanner('낭패...', 'luckbad');
        setBattleMsg(`${player.name}의 ${s.name}!`, selfDmg>0 ? `도박에 실패했다... MP ${staked}을(를) 잃고 반동으로 ${selfDmg}의 피해를 입었다.` : `도박에 실패했다... MP ${staked}을(를) 잃었지만 세계의 마지막 카드가 반동을 막아주었다.`);
        if(checkBattleEnd()) return;
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
      const base = magicBased ? player.mag : effectiveAtk();
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
        addLuckDebtStack();
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
    const base = s.type==='magic' ? player.mag : effectiveAtk();
    const edef = getEffectiveEnemyDef(enemy.def);
    const defMitigation = s.type==='magic'
      ? Math.round(edef*0.5)
      : Math.round(edef*(1-(s.defPierce||0)));
    let dmg = Math.max(1, Math.round(base*s.mult) - defMitigation);
    // 확정 HP 소모형 스킬(예: 혈인/혈옥쇄): 혈서 토글과 달리 선택의 여지 없이 쓸
    // 때마다 최대HP의 s.hpCostPct 비율만큼 피를 바친다. HP 1은 항상 남기도록
    // 클램프한다(즉사 방지).
    let hpSacMsg = '';
    if(s.hpCostPct){
      const desiredCost = Math.max(1, Math.round(player.maxhp*s.hpCostPct));
      const actualCost = Math.min(desiredCost, player.hp-1);
      if(actualCost>0){
        player.hp -= actualCost;
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
    if(key==='paladinJudgmentLight' && player.martyrVowArmed){
      const hpLoss = Math.max(1, Math.round(player.maxhp*0.08));
      if(player.maxhp > hpLoss + 10){
        player.maxhp -= hpLoss;
        player.hp = Math.min(player.hp, player.maxhp);
        player.atk += 3;
        martyrVowMsg = ` 순교자의 맹세로 최대HP ${hpLoss}을(를) 영구히 바쳐 공격력이 영구히 3 올랐다!`;
      }
      player.martyrVowArmed = false;
    }
    // 칼리버 X: 종언(paladinCaliberXFinale, 레벨15 궁극기, 회랑의 기사): 사용하는
    // 순간 전투가 끝날 때까지 남는 회복 감소 저주를 건다(battleFlags.knightHealCurse
    // — playerItem()의 물약 회복량 계산에서 확인해 절반으로 줄인다). "검이 대가를
    // 요구한다"는 컨셉을 한 번의 자기 HP 소모로 끝내지 않고 이후 회복 전체에
    // 그림자를 드리우는 방식으로 표현했다.
    if(key==='paladinCaliberXFinale' && battleFlags){
      battleFlags.knightHealCurse = true;
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
    // 독 중첩(mastery_venomstacks, 독사): 기본 공격뿐 아니라 이 범용 phys/magic
    // 분기를 타는 모든 스킬(백스탭/암살 등)도 독을 남긴다. 맹독 주입 자신은
    // 별도의 전용 타입('venominject')이라 이 훅을 타지 않는다 — 중복 없음.
    if(player.skills && player.skills.includes('mastery_venomstacks')){
      enemy.venomStacks = Math.min(10, (enemy.venomStacks||0)+1);
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
        player.doubleImageArmed = false;
        player.doubleImageBoostRatio = 0;
        updatePlayerStatusBadges();
      }
    }
    let healed2 = 0;
    if(s.lifesteal){
      healed2 = Math.min(player.maxhp-player.hp, Math.round(dmg*s.lifesteal*epicLifestealMult()));
      player.hp = Math.min(player.maxhp, player.hp+healed2);
    }
    healed2 += applyPassiveLifesteal(dmg);
    renderStatus();
    let msg2 = `${enemy.name}에게 ${dmg}의 피해를 입혔다.`;
    if(mod.triggered) msg2 = '약점을 정확히 노렸다! '+msg2;
    if(bloodPactMsg) msg2 += bloodPactMsg;
    if(martyrVowMsg) msg2 += martyrVowMsg;
    if(lightningCritMsg2) msg2 += lightningCritMsg2;
    if(stealthDmgMsg2) msg2 += stealthDmgMsg2;
    if(elementMsg) msg2 += elementMsg;
    if(tripleElementMsg) msg2 += tripleElementMsg;
    if(hpSacMsg) msg2 += hpSacMsg;
    if(afterimageMsg2) msg2 += afterimageMsg2;
    const dotLabels3 = applySkillDots(s);
    if(dotLabels3) msg2 += ` ${dotLabels3} 효과 부여!`;
    if(healed2>0){ msg2 += ` HP ${healed2} 흡수.`; }
    setBattleMsg(`${player.name}은(는) ${s.name}을(를) 시전했다!`, msg2);
    if(checkBattleEnd()) return;
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
