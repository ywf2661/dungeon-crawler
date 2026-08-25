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
    // 순일격(mastery_purestrike, 일격의 구도자 레벨10): 기본 공격 피해가 항상 15% 증가한다.
    if(player.skills && player.skills.includes('mastery_purestrike')){
      dmg = Math.round(dmg*1.15);
    }
    // 메아리 타격(warriorPuristEcho, 레벨12): 기본 공격을 두 번째 낼 때마다(2타/4타/6타…,
    // 전투마다 battleFlags.basicAtkCount로 리셋되어 집계) 추가로 강하게 꽂힌다.
    let echoMsg = '';
    if(player.skills && player.skills.includes('warriorPuristEcho') && battleFlags){
      battleFlags.basicAtkCount = (battleFlags.basicAtkCount||0) + 1;
      if(battleFlags.basicAtkCount % 2 === 0){
        dmg = Math.round(dmg*1.25);
        echoMsg = ' 메아리치는 두 번째 타격이 더욱 강하게 꽂혔다!';
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
    consumeAtkBuff();
    enemy.hp = Math.max(0, enemy.hp-dmg);
    updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
    Sound.slash();
    const healed = applyPassiveLifesteal(dmg);
    rogueRegisterHit(true);
    let msg2 = `${enemy.name}에게 ${dmg}의 피해를 입혔다.`;
    if(healed>0) msg2 += ` HP ${healed} 흡수.`;
    if(creedMsg) msg2 += creedMsg;
    if(echoMsg) msg2 += echoMsg;
    if(lightningCritMsgAtk) msg2 += lightningCritMsgAtk;

    if(enemy.hp>0 && maybeWarriorExtraHit()){
      const edef3 = getEffectiveEnemyDef(enemy.def);
      let extraDmg = Math.max(1, effectiveAtk() + Math.floor(Math.random()*4)-1 - edef3);
      extraDmg = applyOutgoingDamageMods(extraDmg, {type:'basic', onHitMult});
      enemy.hp = Math.max(0, enemy.hp-extraDmg);
      updateEnemyHpBar(); popDamage('-'+extraDmg);
      msg2 += ` 거인강림의 힘으로 한 번 더 몰아쳐 ${extraDmg}의 추가 피해!`;
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

  function playerSkill(key){
    if(battleOver) return;
    // 저주술사(mastery_curseweaver)는 스킬 봉인(침묵의 서약)을 저주 개수만큼의 확률로
    // 뚫고 나올 수 있다 — isCurseSealActive()가 이 확률 판정과 배너 안내까지 처리한다.
    if(isCurseSealActive('skillLocked', '저주를 찢고 목소리를 되찾았다!')){
      setBattleMsg('침묵이 목소리를 삼킨다…', '스킬을 사용할 수 없다!');
      return;
    }
    const s = SKILLDB[key];
    const mpCost = s.mp;
    if(player.mp < mpCost) return;
    setCommandsEnabled(false);

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
        fire: '이후 원소 각인/파동/폭풍이 화상을 남기는 화력형으로 바뀐다.',
        ice: '이후 원소 각인/파동/폭풍이 방어를 꿰뚫는 묵직한 일격형으로 바뀐다.',
        lightning: '이후 원소 각인/파동/폭풍이 빠르고 예리한 연속 타격형으로 바뀐다.',
      }[s.pactElement];
      setBattleMsg(`${player.name}의 ${s.name}!`, already
        ? `${pactLabel} 계약을 해제했다.`
        : `${pactLabel}과(와) 계약을 맺었다. ${pactHint} 전투가 끝날 때까지 유지되며, 다른 원소 계약은 자동으로 해제된다.`);
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
      // 은신(도적 기본 스킬, 구 '흡수의 손길'을 대체): 이번에 오는 적의 공격을 전부
      // 피하고, 다음 자신의 공격(기본 공격/스킬 모두)에 피해 +30%가 붙는다. 회피
      // 소모는 combat/enemy-turn.js의 enemyAction()에서, 피해 보너스 소모는
      // playerAttack()과 이 함수 하단 범용 phys/magic 분기·multihit 분기에서 처리한다.
      player.stealthEvadeArmed = true;
      player.stealthDmgBonusArmed = true;
      renderStatus();
      playCastBurst('def');
      Sound.guard();
      setBattleMsg(`${player.name}의 ${s.name}!`, '그림자 속으로 몸을 숨겼다. 이번에 오는 공격을 전부 피하고, 다음 공격의 위력이 크게 오른다.');
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
      // 역할 배치(로봇군단장 액티브): 정찰/화력/방벽 역할 중 하나를 무작위로 맡은
      // 로봇 한 기를 즉시 배치한다(원 기획은 "역할 선택"이지만 선택 UI가 없어 다른
      // 마스터리들과 동일한 방식으로 무작위 선택으로 단순화했다). battleFlags.rig가
      // 비어있으면 그 자리에, 이미 차 있으면 battleFlags.rig2에 배치한다(다중 전개
      // 마스터리로 상한 2기). 둘 다 차 있으면 rig(먼저 배치된 쪽)를 교체한다.
      const roles = [
        {kind:'recon', label:'정찰', rigMult:0.55, exposeTurns:3, exposePierce:0.25},
        {kind:'firepower', label:'화력', rigMult:0.95},
        {kind:'shield', label:'방벽', rigMult:0.45, shieldPct:0.2},
      ];
      const role = roles[Math.floor(Math.random()*roles.length)];
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
      let msg2 = `${role.label} 역할의 로봇을 배치했다! 첫 사격으로 ${dmg}의 피해를 입혔다. ${slotMsg}`;
      if(role.kind==='recon') msg2 += ' 적의 급소가 드러나 받는 피해가 늘어난다.';
      if(role.kind==='shield') msg2 += ` 가동 중엔 받는 피해의 ${Math.round((role.shieldPct||0)*100)}%를 대신 막아준다.`;
      setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
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
      const dmgPerTick = Math.max(1, Math.round(player.mag*tickMult));
      battleFlags.rig = {
        kind: s.rigKind, name: s.rigName, turnsLeft: turns, dmgPerTick,
        shieldPct: s.shieldPct||0,
      };
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
      let dmg = Math.max(1, Math.round(player.mag*s.mult) - Math.round(edef*0.5));
      dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost});
      enemy.hp = Math.max(0, enemy.hp-dmg);
      updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, s.rigKind==='omega'?'crit':undefined);
      if(s.rigKind==='omega') Sound.bomb(); else Sound.magic();
      let healed = 0;
      if(s.lifesteal){
        healed = Math.min(player.maxhp-player.hp, Math.round(dmg*s.lifesteal));
        player.hp = Math.min(player.maxhp, player.hp+healed);
      }
      renderStatus();
      let msg2 = `${s.rigName}을(를) 전개했다! 첫 사격으로 ${dmg}의 피해를 입혔다. 이후 ${turns}턴간 자동으로 사격한다.`;
      const dotLabelsDeploy = applySkillDots(s);
      if(dotLabelsDeploy) msg2 += ` ${dotLabelsDeploy} 효과 부여!`;
      if(s.exposeTurns) msg2 += ' 적의 급소가 드러나 받는 피해가 늘어난다.';
      if(s.shieldPct) msg2 += ` 가동 중엔 받는 피해의 ${Math.round(s.shieldPct*100)}%를 대신 막아준다.`;
      if(s.selfAtkBuffTurns) msg2 += ` ${s.selfAtkBuffTurns}턴간 공격력도 함께 오른다.`;
      if(healed>0) msg2 += ` HP ${healed} 흡수.`;
      setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
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
          battleFlags.rig = {kind:'turret', name:'자동 포탑', turnsLeft:3, dmgPerTick: Math.max(1, Math.round(player.mag*0.85*1.2))};
          msg2 += ' 종말기계의 힘으로 새로운 포탑이 즉시 재전개된다!';
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
      const boostedTotal = applyOutgoingDamageMods(baseRawTotal, {type: magicBased?'magicskill':'physkill', mpCost, onHitMult});
      const mod = applySkillModifiers(boostedTotal, s);
      const scale = mod.value / baseRawTotal;
      const parts = rawParts.map(d=>Math.max(1, Math.round(d*scale)));
      const total = parts.reduce((a,b)=>a+b,0);
      if(!magicBased) consumeAtkBuff();
      rogueRegisterHit(!magicBased);
      // 잔영(mastery_afterimage): 연속 공격형 스킬도 확정 발동 대상이다(범용
      // phys/magic 분기와 동일한 조건). 몇 타짜리 스킬이었는지·최종 합산 피해가
      // 얼마였는지를 기록해둬, 적 턴 직전 재현 시 같은 타수·같은 연출로
      // 다시 나타나게 한다(combat/enemy-turn.js의 triggerAfterimageStrike()).
      let afterimageMsgMulti = '';
      if(player.skills && player.skills.includes('mastery_afterimage') && battleFlags && !battleFlags.afterimagePending){
        battleFlags.afterimagePending = true;
        battleFlags.afterimageQueue = { name: s.name, magic: magicBased, multihit: true, hits: parts.length, totalDamage: total };
        afterimageMsgMulti = ` 그림자 속에서 '${s.name}'의 잔영이 어른거린다…`;
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
        playComboFinish(parts.length);
        let msg2 = `${parts.join(' + ')} = 총 ${total}의 피해!`;
        if(mod.triggered) msg2 = '급소를 꿰뚫었다! '+msg2;
        const dotLabels1 = applySkillDots(s);
        if(dotLabels1) msg2 += ` ${dotLabels1} 효과 부여!`;
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
        enemyTurn();
        return;
      }
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
    // 번개계약 파동(mageElementWave)이 남긴 "다음 공격 확정 치명타" 소모(범용
    // phys/magic 분기 전체에 적용 — 기본 공격은 위 playerAttack()에서 별도 처리).
    let lightningCritMsg2 = '';
    if(player.lightningCritArmed){
      dmg = Math.round(dmg*1.6);
      lightningCritMsg2 = ' 벼려둔 번개의 기운이 급소를 정확히 꿰뚫었다!';
      player.lightningCritArmed = false;
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
    let afterimageMsg2 = '';
    if(willQueueAfterimage){
      battleFlags.afterimagePending = true;
      battleFlags.afterimageQueue = { name: s.name, magic: s.type==='magic', multihit: false, hits: 1, totalDamage: dmg };
      afterimageMsg2 = ` 그림자 속에서 '${s.name}'의 잔영이 어른거린다…`;
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
    // 확률로 뚫고 나올 수 있다.
    if(isCurseSealActive('potionLocked', '저주를 찢고 물약을 들이켰다!')){
      setBattleMsg('저주가 목을 조여온다…', '물약을 마실 수 없다!');
      return;
    }
    setCommandsEnabled(false);
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
    const potBoost = Math.max(0.2, 1 + getRelicSum('potionEffMult'));
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
      const fledFrom = depth;
      depth = Math.max(1, depth-1);
      let ledgerMsg = '';
      if(hasRelicFlag('killAtkStack') && player.ledgerStack>0){
        player.atk = Math.max(1, player.atk - player.ledgerStack);
        player.ledgerStack = 0;
        ledgerMsg = ' 망자의 장부에 쌓인 힘이 모래처럼 흩어졌다.';
      }
      setBattleMsg('도망쳤다!', '');
      setTimeout(()=>{
        showScreen('explore');
        const retreatMsg = (depth < fledFrom
          ? '황급히 뒤로 물러나 한 층 위로 몸을 피했다.'
          : '황급히 뒤로 물러나 어둠 속으로 몸을 숨겼다.') + ledgerMsg;
        renderExplore([{text:retreatMsg, cls:'warn'}]);
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
