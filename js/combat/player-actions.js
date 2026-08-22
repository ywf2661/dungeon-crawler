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
    const onHitMult = consumeOnHitBonuses();
    const edef = getEffectiveEnemyDef(enemy.def);
    let dmg = Math.max(1, effectiveAtk() + Math.floor(Math.random()*4)-1 - edef);
    dmg = applyOutgoingDamageMods(dmg, {type:'basic', onHitMult});
    consumeAtkBuff();
    enemy.hp = Math.max(0, enemy.hp-dmg);
    updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg);
    Sound.slash();
    const healed = applyPassiveLifesteal(dmg);
    rogueRegisterHit(true);
    let msg2 = `${enemy.name}에게 ${dmg}의 피해를 입혔다.`;
    if(healed>0) msg2 += ` HP ${healed} 흡수.`;

    // 잔영(mastery_afterimage): 기본 공격 적중 시 25% 확률로 분신을 예약한다.
    // 실제 추가 공격은 적의 턴이 열리기 직전(combat/enemy-turn.js의 enemyTurn())에 처리된다.
    if(enemy.hp>0 && player.skills && player.skills.includes('mastery_afterimage') && battleFlags){
      if(Math.random() < 0.25){
        battleFlags.afterimagePending = true;
        msg2 += ' 분신이 그림자 속에 어른거린다…';
      }
    }

    // 삼중 조제(mastery_triplepoison): 기본 공격 적중 시 독 3종 중 하나가 무작위로
    // 축적된다. 이미 3종이 모두 채워진 상태라면, 이번 공격에서 곧바로 폭발 효과가
    // 발동해 추가 피해를 입히고 축적을 초기화한다.
    if(enemy.hp>0 && player.skills && player.skills.includes('mastery_triplepoison') && battleFlags){
      if(!battleFlags.triplePoison) battleFlags.triplePoison = {toxin:false, venom:false, blight:false};
      const tp = battleFlags.triplePoison;
      if(tp.toxin && tp.venom && tp.blight){
        const edefP = getEffectiveEnemyDef(enemy.def);
        const explodeDmg = Math.max(1, Math.round(effectiveAtk()*1.4) - edefP);
        enemy.hp = Math.max(0, enemy.hp - explodeDmg);
        updateEnemyHpBar(); popDamage('-'+explodeDmg, 'crit');
        Sound.poisonHit();
        tp.toxin = tp.venom = tp.blight = false;
        msg2 += ` 삼중으로 조제된 맹독이 한꺼번에 터지며 ${explodeDmg}의 추가 피해를 입혔다!`;
      } else {
        const missing = ['toxin','venom','blight'].filter(k=>!tp[k]);
        const pick = missing[Math.floor(Math.random()*missing.length)];
        tp[pick] = true;
        const filled = ['toxin','venom','blight'].filter(k=>tp[k]).length;
        msg2 += ` 맹독이 축적됐다(${filled}/3).`;
      }
    }

    if(enemy.hp>0 && maybeWarriorExtraHit()){
      const edef3 = getEffectiveEnemyDef(enemy.def);
      let extraDmg = Math.max(1, effectiveAtk() + Math.floor(Math.random()*4)-1 - edef3);
      extraDmg = applyOutgoingDamageMods(extraDmg, {type:'basic', onHitMult});
      enemy.hp = Math.max(0, enemy.hp-extraDmg);
      updateEnemyHpBar(); popDamage('-'+extraDmg);
      msg2 += ` 거인강림의 힘으로 한 번 더 몰아쳐 ${extraDmg}의 추가 피해!`;
    }

    const doubleChance = getSpecialSum('doubleStrikeChance');
    if(enemy.hp>0 && doubleChance>0 && Math.random()<doubleChance){
      renderStatus();
      setBattleMsg(`${player.name}의 공격!`, msg2);
      setTimeout(()=>{
        const edef2 = getEffectiveEnemyDef(enemy.def);
        let dmg2 = Math.max(1, effectiveAtk() + Math.floor(Math.random()*4)-1 - edef2);
        dmg2 = applyOutgoingDamageMods(dmg2, {type:'basic', onHitMult});
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
    if(hasRelicFlag('skillLocked')){
      setBattleMsg('침묵이 목소리를 삼킨다…', '스킬을 사용할 수 없다!');
      return;
    }
    const s = SKILLDB[key];
    const mpCost = s.mp;
    if(player.mp < mpCost) return;
    setCommandsEnabled(false);
    const freeCast = mpCost>0 && hasRelicFlag('freeCastChance') && Math.random() < getRelicSum('freeCastChance');
    if(freeCast){
      playBanner('무한한 탄창!','def');
    } else {
      player.mp -= mpCost;
    }

    if(s.type==='arm'){
      // 상시 토글형 스킬(예: 혈서) — 턴을 소모하지 않고 즉시 켜고 끈다.
      player[s.armFlag] = !player[s.armFlag];
      player.mp += mpCost; // 토글은 MP를 쓰지 않는다(위에서 미리 깎인 것을 되돌림)
      renderStatus();
      Sound.buff();
      setBattleMsg(`${player.name}의 ${s.name}!`, player[s.armFlag]
        ? `${s.name}이(가) 켜졌다. 다음 스킬 사용 시 HP를 태워 위력이 증폭된다.`
        : `${s.name}이(가) 꺼졌다.`);
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
        msg2 = '이미 세 가지 맹독이 모두 준비되어 있다. 다음 기본 공격에서 자동으로 폭발한다!';
      }
      renderStatus();
      playCastBurst('def');
      Sound.buff();
      setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
      enemyTurn();
      return;
    }

    if(s.type==='haste'){
      // 가속 주문(시간술사 액티브): 적의 턴을 건너뛰고 곧바로 플레이어가 다시 행동한다.
      renderStatus();
      playCastBurst('def');
      Sound.buff();
      setBattleMsg(`${player.name}의 ${s.name}!`, '시간이 뒤틀려, 적의 턴을 건너뛰고 곧바로 다시 행동할 수 있게 되었다!');
      resetCommandUI();
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
        dmg = applyOutgoingDamageMods(dmg, {type:'magicskill', mpCost});
        msg2 = `가동 중인 장치가 없어 예비 폭발물을 투척했다. ${dmg}의 피해!`;
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
        setBattleMsg(`${player.name}의 ${s.name}!`, msg2);
        if(checkBattleEnd()) return;
        enemyTurn();
      }, parts.length*220 + 250);
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
    // 원소 계약(mastery_elementpact): 마법 스킬을 쓸 때마다 화염/빙결/번개 중 하나를
    // 즉석에서 계약해 추가 효과를 싣는다.
    let elementMsg = '';
    if(s.type==='magic' && player.skills && player.skills.includes('mastery_elementpact')){
      const roll = ['fire','ice','lightning'][Math.floor(Math.random()*3)];
      if(roll==='fire'){
        if(!s.dot && !s.dots){
          applyDot({type:'burn', basis:'mag', ratio:0.3, turns:3, label:'원소 계약: 화염'});
          elementMsg = ' 화염과 계약해 화상을 남겼다!';
        }
      } else if(roll==='ice'){
        dmg = Math.round(dmg*1.15);
        elementMsg = ' 빙결과 계약해 위력이 올랐다!';
      } else if(roll==='lightning'){
        dmg = dmg + Math.round(defMitigation*0.3);
        elementMsg = ' 번개와 계약해 방어를 일부 꿰뚫었다!';
      }
    }
    // 혈서(mastery_bloodpact)가 켜져 있으면, 이 스킬 한 번에 한해 HP를 태워 위력을 증폭시킨다.
    let bloodPactMsg = '';
    if(player.bloodPactArmed){
      const hpCost = Math.max(1, Math.round(player.hp*0.15));
      if(player.hp > hpCost){
        player.hp -= hpCost;
        dmg = Math.round(dmg*1.5);
        bloodPactMsg = ` 혈서의 힘으로 HP ${hpCost}을(를) 태워 위력이 크게 증폭됐다!`;
      }
      player.bloodPactArmed = false;
    }
    const onHitMult = consumeOnHitBonuses();
    dmg = applyOutgoingDamageMods(dmg, {type: s.type==='magic'?'magicskill':'physkill', mpCost, onHitMult});
    const mod = applySkillModifiers(dmg, s);
    dmg = mod.value;
    if(s.type==='phys') consumeAtkBuff();
    rogueRegisterHit(s.type==='phys');
    enemy.hp = Math.max(0, enemy.hp-dmg);
    updateEnemyHpBar(); shakeEnemy(); popDamage('-'+dmg, mod.triggered?'crit':undefined);
    if(s.type==='magic') Sound.magic(); else Sound.slash();
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
    if(elementMsg) msg2 += elementMsg;
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
    if(hasRelicFlag('potionLocked')){
      setBattleMsg('저주가 목을 조여온다…', '물약을 마실 수 없다!');
      return;
    }
    setCommandsEnabled(false);
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
